/**
 * Crozzo — Detector de Madurez (H1.0d)
 * --------------------------------------------------------------------------
 * El sistema nervioso de la rampa. Detecta señales de crecimiento del
 * comerciante y sugiere cuándo subir de nivel + qué obligaciones nuevas
 * tiene. NO sube solo (doctrina: la graduación requiere confirmación).
 *
 * Detectores:
 *  - Ingresos: acumula ventas del año; avisa al acercarse a 3.500 UVT.
 *  - Empleados: 1er empleado → aviso PILA.
 *  - Sedes: añadir sede 2 → sugiere Cadena.
 *  - B2B: facturar a NIT gran contribuyente → sugiere retenciones.
 *
 * Config: CrozzoPosConfigManager.config.madurez
 * Niveles: CrozzoNivelesMadurez
 * Doc: docs/maps/MADUREZ-EMPRESARIAL-CO.md
 */
(function (global) {
  'use strict';

  // UVT 2026 (estimación IPC; ajustar con Resolución DIAN anual).
  // 3.500 UVT = umbral responsable IVA persona natural (art. 440 ET).
  var UVT_2026 = 55000;
  var UMBRAL_RESPONSABLE_IVA_UVT = 3500;
  var UMBRAL_RESPONSABLE_IVA_COP = UVT_2026 * UMBRAL_RESPONSABLE_IVA_UVT; // ~$192M
  var PORCENTAJE_ALERTA_AMARILLA = 0.80; // avisa al llegar al 80% del umbral

  var CrozzoDetectorMadurez = {
    UVT_2026: UVT_2026,
    UMBRAL_RESPONSABLE_IVA_UVT: UMBRAL_RESPONSABLE_IVA_UVT,
    UMBRAL_RESPONSABLE_IVA_COP: UMBRAL_RESPONSABLE_IVA_COP,

    /**
     * Año actual (numbero). Para reset anual del acumulador.
     */
    anhoActual: function () {
      return new Date().getFullYear();
    },

    /**
     * Registra una venta en el acumulador anual de ingresos.
     * Llamar tras cada cobro confirmado. Maneja reset por año automáticamente.
     * @param {object} configManager
     * @param {number} monto COP brutos (sin impuestos aparte; total de venta)
     * @returns {object} estado actualizado { anho, total, uvt, pctUmbral }
     */
    registrarVenta: function (configManager, monto) {
      var m = configManager && configManager.config && configManager.config.madurez;
      if (!m) return null;
      var anho = this.anhoActual();
      if (!m.ingresosAcumuladosAnho || m.ingresosAcumuladosAnho.anho !== anho) {
        m.ingresosAcumuladosAnho = { anho: anho, total: 0, uvt: 0 };
      }
      var total = (m.ingresosAcumuladosAnho.total || 0) + (Number(monto) || 0);
      m.ingresosAcumuladosAnho.total = total;
      m.ingresosAcumuladosAnho.uvt = total / UVT_2026;
      if (typeof configManager.save === 'function') configManager.save();
      return this.estadoIngresos(configManager);
    },

    /**
     * Lee el estado del acumulador de ingresos + porcentaje del umbral.
     * @returns {{anho, total, uvt, pctUmbral}}
     */
    estadoIngresos: function (configManager) {
      var m = configManager && configManager.config && configManager.config.madurez;
      var acc = (m && m.ingresosAcumuladosAnho) || { anho: this.anhoActual(), total: 0, uvt: 0 };
      var pctUmbral = acc.uvt / UMBRAL_RESPONSABLE_IVA_UVT;
      return {
        anho: acc.anho,
        total: acc.total || 0,
        uvt: acc.uvt || 0,
        pctUmbral: pctUmbral,
        umbralUvt: UMBRAL_RESPONSABLE_IVA_UVT,
        umbralCop: UMBRAL_RESPONSABLE_IVA_COP
      };
    },

    /**
     * Analiza todas las señales y devuelve sugerencias + alertas.
     * NO modifica el nivel — solo informa. La graduación es manual (con confirmación).
     *
     * @param {object} configManager
     * @param {object} contexto { sedes: number, empleados: number, ultimoNitB2B: string|null }
     * @returns {{nivelSugerido, nivelActual, alertas: [], sugerencias: []}}
     */
    analizar: function (configManager, contexto) {
      var ctx = contexto || {};
      var niveles = global.CrozzoNivelesMadurez;
      if (!niveles) return { nivelSugerido: null, nivelActual: 0, alertas: [], sugerencias: [] };

      var nivelActual = configManager.getNivelMadurez();
      var regimen = configManager.getRegimenFiscal();
      var alertas = [];
      var sugerencias = [];
      var nivelSugerido = null;

      // ── Detector 1: Ingresos cerca de umbral responsable IVA ────────────
      var ing = this.estadoIngresos(configManager);
      if (regimen === 'no_responsable' && ing.pctUmbral >= PORCENTAJE_ALERTA_AMARILLA) {
        var pctTxt = Math.round(ing.pctUmbral * 100) + '%';
        if (ing.pctUmbral >= 1) {
          alertas.push({
            tipo: 'umbral_responsable_iva_superado',
            severidad: 'alta',
            titulo: 'Superaste el umbral de Responsable de IVA',
            detalle: 'Tus ingresos (' + Math.round(ing.uvt) + ' UVT) superan 3.500 UVT (~$' +
              (UMBRAL_RESPONSABLE_IVA_COP / 1000000).toFixed(0) + 'M/año). Según el art. 440 ET, ' +
              'deberías convertirte en responsable de IVA. Considera subir a nivel Planta.',
            accion: 'subir_planta'
          });
          if (nivelActual < 2) nivelSugerido = 2;
        } else {
          alertas.push({
            tipo: 'umbral_responsable_iva_cerca',
            severidad: 'media',
            titulo: 'Te acercas al umbral de Responsable de IVA',
            detalle: 'Vas en el ' + pctTxt + ' del umbral (3.500 UVT). Cuando lo cruces, ' +
              'tendrás nuevas obligaciones. Prepárate con tu contador.',
            accion: 'preparar_planta'
          });
        }
      }

      // ── Detector 2: Empleados (PILA) ────────────────────────────────────
      var empleados = Number(ctx.empleados) || 0;
      if (empleados >= 1 && ctx._avisoPilaMostrado !== true) {
        alertas.push({
          tipo: 'pila_empleador',
          severidad: 'media',
          titulo: 'Empleador: debes pagar PILA',
          detalle: 'Con ' + empleados + ' empleado(s), debes liquidar y pagar aportes a ' +
            'salud, pensión y ARL (PILA) mensualmente. La UGPP vigila el cumplimiento.',
          accion: 'configurar_pila'
        });
      }

      // ── Detector 3: Sedes (sugiere Cadena) ──────────────────────────────
      var sedes = Number(ctx.sedes) || 1;
      if (sedes >= 2 && nivelActual < 4) {
        sugerencias.push({
          tipo: 'multi_sede',
          titulo: 'Múltiples sedes activas',
          detalle: 'Tienes ' + sedes + ' sedes. El nivel Cadena habilita consolidación fiscal ' +
            'multi-sede y reportes corporativos.',
          accion: 'subir_cadena'
        });
        if (nivelActual < 4 && nivelSugerido === null) nivelSugerido = 4;
      }

      // ── Detector 4: B2B a gran contribuyente (sugiere retenciones) ──────
      var nitB2B = ctx.ultimoNitB2B;
      if (nitB2B && regimen !== 'gran_contribuyente' && nivelActual < 3) {
        // Solo sugerimos; la confirmación de que el NIT es gran contribuyente
        // la hace el módulo de lookup adquiriente (CrozzoAdquirienteLookup).
        sugerencias.push({
          tipo: 'b2b_gran_contribuyente',
          titulo: 'Facturaste a un posible gran contribuyente',
          detalle: 'Si el cliente NIT ' + nitB2B + ' es agente retenedor declarado, ' +
            'debes practicar retenciones (ReteFuente/IVA/ICA). Verifica su RUT y ' +
            'considera subir a nivel Roble para habilitar retenciones B2B.',
          accion: 'verificar_b2b_retenciones'
        });
      }

      // Persistir sugerencia de nivel (sin aplicar)
      var m = configManager.config.madurez;
      if (m.nivelSugerido !== nivelSugerido) {
        m.nivelSugerido = nivelSugerido;
        if (typeof configManager.save === 'function') configManager.save();
      }

      return {
        nivelActual: nivelActual,
        nivelSugerido: nivelSugerido,
        regimen: regimen,
        ingresos: ing,
        alertas: alertas,
        sugerencias: sugerencias
      };
    },

    /**
     * Resumen para el panel "Mi crecimiento" (UI).
     * Devuelve todo lo que el panel necesita renderizar en una sola llamada.
     * @returns {object} datos listos para UI
     */
    resumenPanel: function (configManager, contexto) {
      var niveles = global.CrozzoNivelesMadurez;
      var analisis = this.analizar(configManager, contexto);
      var nivelActual = niveles.getNivelActivo(configManager);
      var proximoNivel = niveles.getNivel(nivelActual.id + 1);

      // Requisitos para subir al próximo nivel (checklist)
      var reqProximo = proximoNivel
        ? niveles.requisitosParaSubir(configManager, proximoNivel.id)
        : { ok: true, faltantes: [] };

      return {
        nivelActual: {
          id: nivelActual.id, key: nivelActual.key, icon: nivelActual.icon,
          nombre: nivelActual.nombre, subtitulo: nivelActual.subtitulo, desc: nivelActual.desc
        },
        proximoNivel: proximoNivel ? {
          id: proximoNivel.id, key: proximoNivel.key, icon: proximoNivel.icon,
          nombre: proximoNivel.nombre, subtitulo: proximoNivel.subtitulo
        } : null,
        ingresos: analisis.ingresos,
        barraProgresoUmbral: Math.min(1, analisis.ingresos.pctUmbral),
        requisitosProximoNivel: reqProximo,
        puedeSubir: reqProximo.ok && proximoNivel !== null,
        alertas: analisis.alertas,
        sugerencias: analisis.sugerencias,
        nivelSugerido: analisis.nivelSugerido
      };
    }
  };

  global.CrozzoDetectorMadurez = CrozzoDetectorMadurez;
})(typeof window !== 'undefined' ? window : globalThis);
