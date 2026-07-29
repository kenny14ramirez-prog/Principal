/**
 * Crozzo — Motor de Retenciones B2B (H1.4)
 * --------------------------------------------------------------------------
 * Calcula retenciones en la fuente (ReteFuente, ReteIVA, ReteICA) cuando el
 * ADQUIRENTE es agente retenedor (gran contribuyente declarado DIAN, entidad
 * pública, o por designación). Res. DIAN + Estatuto Tributario.
 *
 * Doctrina: hoy 0 retenciones en emisión (solo en compras a proveedores).
 * Un B2B a gran contribuyente DEBE practicar retención. Sin esto, Roble (3+)
 * no puede operar B2B legalmente.
 *
 * Tarifas:
 *   - ReteFuente: por concepto (art. 392 ET y tabla). Servicios ~4%, Compras ~2.5%.
 *   - ReteIVA: 15% del IVA causado (art. 437-2 ET) cuando el adquirente es agente.
 *   - ReteICA: por municipio (código DANE), tarifas variable 0.4%-1.1% (Bogotá).
 *
 * Solo aplica en Nivel Roble (3+) o régimen gran_contribuyente del EMISOR.
 * El EMISOR gran contribuyente retiene al adquirente responsable de IVA.
 *
 * Config: CrozzoPosConfigManager (nivel, regimen)
 * Doc: docs/maps/FISCAL-CO-BLOQUEANTES.md (requisito #12)
 */
(function (global) {
  'use strict';

  // Tarifas ReteFuente por concepto (art. 392 ET + tabla DIAN). Aproximadas,
  // confirmar contra tabla vigente antes de producción.
  var RETEFUENTE_POR_CONCEPTO = {
    'servicios': { tarifa: 0.04, baseMinimaUvt: 27 },     // Servicios generales
    'compras': { tarifa: 0.025, baseMinimaUvt: 27 },      // Compras generales
    'honorarios': { tarifa: 0.10, baseMinimaUvt: 92 },    // Honorarios
    'arrendamiento': { tarifa: 0.035, baseMinimaUvt: 27 }, // Arrendamiento bienes muebles
    'transporte': { tarifa: 0.01, baseMinimaUvt: 27 }      // Transporte de carga
  };
  var RETEFUENTE_DEFAULT = { tarifa: 0.025, baseMinimaUvt: 27 };

  // Tarifa ReteIVA: 15% del IVA causado (art. 437-2 ET)
  var RETEIVA_TARIFA = 0.15;

  // ReteICA por municipio (código DANE 5 dígitos). Subset de ciudades principales.
  // Tarifa expresada como porcentaje (0.00984 = 9.84 por mil en Bogotá comercio).
  // Confirmar contra acuerdo municipal vigente antes de producción.
  var RETEICA_POR_MUNICIPIO = {
    '11001': 0.00984, // Bogotá D.C. (comercio ~9.84x1000)
    '05001': 0.00800, // Medellín
    '76001': 0.00700, // Cali
    '08001': 0.00966, // Barranquilla
    '50001': 0.00600, // Villavicencio
    '68001': 0.00500, // Bucaramanga
    '05001 ': 0.00800 // tolerancia espacio
  };
  var RETEICA_DEFAULT = 0.00600; // fallback conservador

  function getNivel(configManager) {
    return (configManager && typeof configManager.getNivelMadurez === 'function')
      ? configManager.getNivelMadurez() : 0;
  }
  function getRegimen(configManager) {
    return (configManager && typeof configManager.getRegimenFiscal === 'function')
      ? configManager.getRegimenFiscal() : 'no_responsable';
  }

  /**
   * ¿Aplica retenciones en esta operación? Solo Roble (3+) o gran contribuyente.
   * El EMISOR debe ser agente retenedor Y el adquirente debe ser responsable de IVA.
   * @param {object} configManager
   * @param {object} adquirente { esAgenteRetenedor, responsableIVA }
   * @returns {boolean}
   */
  function aplicaRetencion(configManager, adquirente) {
    var nivel = getNivel(configManager);
    var regimen = getRegimen(configManager);
    // Emisor agente retenedor: Roble+ o gran contribuyente
    if (nivel < 3 && regimen !== 'gran_contribuyente') return false;
    // Adquirente responsable de IVA (si no, no hay IVA que retener)
    if (adquirente && adquirente.responsableIVA === false) return false;
    return true;
  }

  /**
   * Tarifa ReteICA por código DANE de municipio.
   * @param {string} codigoDane 5 dígitos
   */
  function tarifaReteICA(codigoDane) {
    var c = String(codigoDane || '').trim();
    if (RETEICA_POR_MUNICIPIO[c] !== undefined) return RETEICA_POR_MUNICIPIO[c];
    return RETEICA_DEFAULT;
  }

  /**
   * Tarifa ReteFuente por concepto.
   * @param {string} concepto 'servicios'|'compras'|'honorarios'|...
   */
  function tarifaReteFuente(concepto) {
    var c = RETEFUENTE_POR_CONCEPTO[String(concepto || 'compras').toLowerCase()];
    return c || RETEFUENTE_DEFAULT;
  }

  /**
   * Calcula las retenciones para una operación B2B.
   * @param {object} op { baseGravable, ivaCausado, concepto, codigoDaneMunicipio }
   * @param {object} configManager
   * @param {object} adquirente
   * @returns {{aplica, retefuente, reteiva, reteica, totalRetenido, detalle}}
   */
  function calcular(op, configManager, adquirente) {
    if (!aplicaRetencion(configManager, adquirente)) {
      return { aplica: false, retefuente: 0, reteiva: 0, reteica: 0, totalRetenido: 0, detalle: 'No aplica retención (emisor no agente o adquirente no responsable)' };
    }
    var base = Number(op.baseGravable) || 0;
    var iva = Number(op.ivaCausado) || 0;
    var concepto = op.concepto || 'compras';

    // ReteFuente: tarifa × base gravable (sobre subtotal sin IVA)
    var rfConfig = tarifaReteFuente(concepto);
    var retefuente = Math.round(base * rfConfig.tarifa);

    // ReteIVA: 15% del IVA causado
    var reteiva = Math.round(iva * RETEIVA_TARIFA);

    // ReteICA: tarifa municipal × base gravable
    var tarifaICA = tarifaReteICA(op.codigoDaneMunicipio);
    var reteica = Math.round(base * tarifaICA);

    var total = retefuente + reteiva + reteica;
    return {
      aplica: true,
      retefuente: retefuente,
      reteiva: reteiva,
      reteica: reteica,
      tarifaICA: tarifaICA,
      totalRetenido: total,
      detalle: 'ReteFuente ' + (rfConfig.tarifa * 100) + '% ($' + retefuente + ') + ReteIVA 15% IVA ($' + reteiva + ') + ReteICA ' + (tarifaICA * 1000).toFixed(2) + 'x1000 ($' + reteica + ')'
    };
  }

  global.CrozzoRetenciones = {
    RETEFUENTE_POR_CONCEPTO: RETEFUENTE_POR_CONCEPTO,
    RETEICA_POR_MUNICIPIO: RETEICA_POR_MUNICIPIO,
    RETEIVA_TARIFA: RETEIVA_TARIFA,
    aplicaRetencion: aplicaRetencion,
    tarifaReteICA: tarifaReteICA,
    tarifaReteFuente: tarifaReteFuente,
    calcular: calcular
  };
})(typeof window !== 'undefined' ? window : globalThis);
