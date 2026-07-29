/**
 * Crozzo — Motor de Impuestos multi-tarifa (H1.1)
 * --------------------------------------------------------------------------
 * Resuelve el problema crítico del motor legacy (crozzoLineaTasaImpuesto):
 * este devolvía UNA SOLA tarifa por línea (IVA o INC), pero la Ley 2277/2022
 * exige que los Impuestos Saludables se CAUSEN APARTE del IVA. Una gaseosa
 * paga IVA 19% + Impuesto Saludable $/L.
 *
 * Este motor calcula los impuestos por separado:
 *   - IVA (0/5/19% por SKU)
 *   - INC restaurante/bar 8% (art. 512-1 ET)
 *   - Impuestos Saludables (bebidas azucaradas $/L + ultraprocesados 20%)
 *
 * Respeta el nivel de madurez (H1.0): solo Planta (2+) aplica IVA por SKU,
 * INC y Saludables. Brote (1) no aplica. Semilla (0) no factura legal.
 *
 * Tarifas: app/data/tarifas_saludables_2026.json
 * Config: app/core/pos/CrozzoPosConfigManager
 * Doctrina: docs/maps/FISCAL-CO-BLOQUEANTES.md (requisitos 5/6/7)
 */
(function (global) {
  'use strict';

  // ── Carga de tarifas saludables (con fallback si el JSON no está disponible) ──
  var TARIFAS_SALUDABLES = null;
  function cargarTarifas() {
    if (TARIFAS_SALUDABLES) return TARIFAS_SALUDABLES;
    // Intento 1: fetch síncrono del JSON embebido (Tauri no soporta fetch síncrono,
    // así que usamos fallback hardcodeado conservador; el JSON se carga async
    // y se cachea via cargarTarifasAsync para precisión).
    TARIFAS_SALUDABLES = {
      bebidasAzucaradas: {
        base: 'volumen_litros',
        rangos: [
          { azucarGrPor100mlMin: 0, azucarGrPor100mlMax: 2.0, tarifaPorLitro: 0 },
          { azucarGrPor100mlMin: 2.01, azucarGrPor100mlMax: 5.0, tarifaPorLitro: 245 },
          { azucarGrPor100mlMin: 5.01, azucarGrPor100mlMax: 8.0, tarifaPorLitro: 385 },
          { azucarGrPor100mlMin: 8.01, azucarGrPor100mlMax: 99.0, tarifaPorLitro: 545 }
        ]
      },
      ultraprocesados: {
        base: 'advalorem',
        tarifa: 0.20,
        categoriasAfectadas: ['productos-ultraprocesados', 'snacks-empacados', 'galletas', 'cereales-azucarados', 'confiteria', 'productos-carnicos-procesados']
      }
    };
    return TARIFAS_SALUDABLES;
  }

  /**
   * Carga asíncrona del JSON de tarifas para precisión (no bloquea el POS).
   * Llamar al boot. Si falla, se usa el fallback hardcodeado conservador.
   */
  function cargarTarifasAsync() {
    try {
      var url = (typeof global.crozzoResolveDataUrl === 'function')
        ? global.crozzoResolveDataUrl('tarifas_saludables_2026.json')
        : 'data/tarifas_saludables_2026.json';
      if (typeof fetch === 'function') {
        fetch(url).then(function (r) { return r.json(); }).then(function (data) {
          if (data && data.bebidasAzucaradas && data.ultraprocesados) {
            TARIFAS_SALUDABLES = data;
          }
        }).catch(function () { /* fallback vigente */ });
      }
    } catch (_) { /* fallback vigente */ }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function getNivelMadurez(configManager) {
    if (!configManager || typeof configManager.getNivelMadurez !== 'function') return 0;
    return configManager.getNivelMadurez();
  }

  function getRegimen(configManager) {
    if (!configManager || typeof configManager.getRegimenFiscal !== 'function') return 'no_responsable';
    return configManager.getRegimenFiscal();
  }

  function getPerfilFiscal(configManager) {
    var imp = configManager && configManager.config && configManager.config.impuestos;
    return (imp && imp.perfilFiscal) || 'comercio';
  }

  // ── Cálculo de Impuestos Saludables ───────────────────────────────────────
  /**
   * Calcula el impuesto saludable para un item.
   * @param {object} item { precio, cantidad, saludableTipo, saludableAzucarGr, saludableVolumenMl, categoria }
   * @param {number} nivelMadurez
   * @returns {{aplica: boolean, tipo: string, monto: number, base: string, detalle: string}}
   */
  function calcularSaludable(item, nivelMadurez) {
    // Solo Planta (2+) aplica impuestos saludables
    if (nivelMadurez < 2) return { aplica: false, tipo: null, monto: 0, base: null, detalle: 'Nivel de madurez insuficiente' };

    var tipo = item.saludableTipo || item.saludable;
    var tarifa = cargarTarifas();
    var qty = Math.max(1, Number(item.cantidad) || 1);
    var precio = Number(item.precio) || 0;
    var bruto = precio * qty;

    // Caso 1: Bebida azucarada (por volumen + azúcar)
    if (tipo === 'bebida_azucarada') {
      var azucar = Number(item.saludableAzucarGr) || 0; // gramos por 100mL
      var volumenMl = Number(item.saludableVolumenMl) || 0;
      if (volumenMl <= 0) return { aplica: false, tipo: null, monto: 0, base: null, detalle: 'Bebida azucarada sin volumen especificado' };
      var litros = (volumenMl / 1000) * qty;
      var tarifaPorLitro = 0;
      var rango = null;
      for (var i = 0; i < tarifa.bebidasAzucaradas.rangos.length; i++) {
        var r = tarifa.bebidasAzucaradas.rangos[i];
        if (azucar >= r.azucarGrPor100mlMin && azucar <= r.azucarGrPor100mlMax) {
          tarifaPorLitro = r.tarifaPorLitro;
          rango = r;
          break;
        }
      }
      if (tarifaPorLitro <= 0) return { aplica: false, tipo: null, monto: 0, base: null, detalle: 'Bebida con azúcar bajo umbral gravable' };
      var monto = Math.round(tarifaPorLitro * litros);
      return {
        aplica: true,
        tipo: 'bebida_azucarada',
        monto: monto,
        base: 'volumen_litros',
        litros: litros,
        tarifaPorLitro: tarifaPorLitro,
        detalle: 'Ley 2277/2022: $' + tarifaPorLitro + '/L × ' + litros.toFixed(3) + 'L'
      };
    }

    // Caso 2: Ultraprocesado (ad valorem 20%)
    if (tipo === 'ultraprocesado') {
      var t = tarifa.ultraprocesados.tarifa;
      return {
        aplica: true,
        tipo: 'ultraprocesado',
        monto: Math.round(bruto * t),
        base: 'advalorem',
        tarifa: t,
        detalle: 'Ley 2277/2022: 20% s/' + bruto
      };
    }

    // Caso 3: Inferencia por categoría (si no marcado explícito)
    var cat = item.categoria || '';
    if (tarifa.ultraprocesados.categoriasAfectadas.indexOf(cat) !== -1) {
      var t2 = tarifa.ultraprocesados.tarifa;
      return {
        aplica: true,
        tipo: 'ultraprocesado_inferido',
        monto: Math.round(bruto * t2),
        base: 'advalorem',
        tarifa: t2,
        detalle: 'Ley 2277/2022 (inferido por categoría ' + cat + '): 20% s/' + bruto
      };
    }

    return { aplica: false, tipo: null, monto: 0, base: null, detalle: 'No aplica impuesto saludable' };
  }

  // ── Cálculo completo multi-impuesto por línea ─────────────────────────────
  /**
   * Calcula TODOS los impuestos de una línea de venta.
   * @param {object} item { precio, cantidad, ivaRate, categoria, saludableTipo, ... }
   * @param {object} configManager
   * @returns {object} { bruto, iva, inc, saludable, totalImpuestos, total, desglose }
   */
  function calcularLinea(item, configManager) {
    var nivel = getNivelMadurez(configManager);
    var regimen = getRegimen(configManager);
    var perfil = getPerfilFiscal(configManager);
    var imp = (configManager && configManager.config && configManager.config.impuestos) || {};

    var qty = Math.max(1, Number(item.cantidad) || 1);
    var precio = Number(item.precio) || 0;
    var bruto = precio * qty;

    var resultado = {
      bruto: bruto,
      iva: 0, ivaRate: 0, ivaDetalle: '',
      inc: 0, incRate: 0, incDetalle: '',
      saludable: 0, saludableDetalle: '',
      totalImpuestos: 0,
      total: bruto,
      desglose: []
    };

    // Semilla/Brote no causan IVA ni INC por SKU (reglas de madurez)
    // Planta+ sí (responsable_iva o simple)
    var aplicaIVA = (nivel >= 2) && (regimen === 'responsable_iva' || regimen === 'gran_contribuyente');

    // ── IVA por SKU ──
    if (aplicaIVA) {
      var ivaRate = (typeof item.ivaRate === 'number' && !isNaN(item.ivaRate)) ? item.ivaRate : (imp.tarifasIVA && imp.tarifasIVA[0] ? imp.tarifasIVA[0].rate : 0);
      // Simple no traslada IVA (no responsable), pero la doctrina lo registra
      if (regimen === 'simple') ivaRate = 0;
      resultado.ivaRate = ivaRate;
      resultado.iva = Math.round(bruto * ivaRate);
      resultado.ivaDetalle = 'IVA ' + (ivaRate * 100) + '% s/' + bruto;
      if (ivaRate > 0) resultado.desglose.push({ tipo: 'iva', monto: resultado.iva, detalle: resultado.ivaDetalle });
    }

    // ── INC restaurante/bar 8% (art. 512-1 ET) ──
    // Solo Planta+ y perfil restaurante/mixto. INC se causa una sola vez al consumidor final.
    if (nivel >= 2 && (perfil === 'restaurante' || perfil === 'mixto') && regimen !== 'simple') {
      var incConfig = imp.impuestoAlConsumo || {};
      if (incConfig.aplica !== false) {
        var incRate = Number(incConfig.tarifa) || 0.08;
        resultado.incRate = incRate;
        resultado.inc = Math.round(bruto * incRate);
        resultado.incDetalle = 'INC ' + (incRate * 100) + '% s/' + bruto + ' (art. 512-1 ET)';
        resultado.desglose.push({ tipo: 'inc', monto: resultado.inc, detalle: resultado.incDetalle });
      }
    }

    // ── Impuestos Saludables (Ley 2277/2022) ──
    var sal = calcularSaludable(item, nivel);
    if (sal.aplica) {
      resultado.saludable = sal.monto;
      resultado.saludableDetalle = sal.detalle;
      resultado.saludableTipo = sal.tipo;
      resultado.desglose.push({ tipo: 'saludable', monto: sal.monto, detalle: sal.detalle });
    }

    // ── Totales ──
    resultado.totalImpuestos = resultado.iva + resultado.inc + resultado.saludable;
    resultado.total = bruto + resultado.totalImpuestos;

    return resultado;
  }

  /**
   * Calcula impuestos para un carrito completo (múltiples líneas).
   * @param {Array} items
   * @param {object} configManager
   * @returns {object} { subtotal, iva, inc, saludable, totalImpuestos, total, lineas: [] }
   */
  function calcularCarrito(items, configManager) {
    var subtotal = 0, iva = 0, inc = 0, saludable = 0;
    var lineas = (items || []).map(function (item) {
      var r = calcularLinea(item, configManager);
      subtotal += r.bruto;
      iva += r.iva;
      inc += r.inc;
      saludable += r.saludable;
      return r;
    });
    return {
      subtotal: subtotal,
      iva: iva, ivaDetalle: 'IVA consolidado',
      inc: inc, incDetalle: 'INC consolidado',
      saludable: saludable, saludableDetalle: 'Saludables consolidado',
      totalImpuestos: iva + inc + saludable,
      total: subtotal + iva + inc + saludable,
      lineas: lineas
    };
  }

  /**
   * Caso de prueba canónico: cuenta mixta del H0.
   * Cerveza (INC) + gaseosa (saludable) + comida (0% IVA).
   * @returns {object} resultado esperado para validación en tests
   */
  function casoMixtoCanonico() {
    return [
      { nombre: 'Cerveza', precio: 5500, cantidad: 2, ivaRate: 0.19, categoria: 'alcohol' },
      { nombre: 'Gaseosa 350ml', precio: 3500, cantidad: 1, ivaRate: 0.19, categoria: 'bebida', saludableTipo: 'bebida_azucarada', saludableAzucarGr: 11, saludableVolumenMl: 350 },
      { nombre: 'Empanada', precio: 2000, cantidad: 3, ivaRate: 0, categoria: 'panaderia' }
    ];
  }

  global.CrozzoMotorImpuestos = {
    cargarTarifasAsync: cargarTarifasAsync,
    cargarTarifas: cargarTarifas,
    calcularSaludable: calcularSaludable,
    calcularLinea: calcularLinea,
    calcularCarrito: calcularCarrito,
    casoMixtoCanonico: casoMixtoCanonico
  };
})(typeof window !== 'undefined' ? window : globalThis);
