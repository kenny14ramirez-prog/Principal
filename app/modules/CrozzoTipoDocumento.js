/**
 * Crozzo — Decisor de Tipo de Documento DIAN (H1.2)
 * --------------------------------------------------------------------------
 * Decide automáticamente qué documento electrónico emitir según el
 * adquirente y el contexto, según Res. DIAN 165/2023:
 *
 *   - FEV (Factura Electrónica de Venta): cuando el comprador la solicita
 *     o es un negocio que necesita soportar costos/IVA. Exige datos del
 *     adquirente (NIT/cédula, razón social).
 *   - Tiquete electrónico (Documento Equivalente POS): ventas a consumidor
 *     final anónimo que no solicita factura. No exige identificación profunda.
 *
 * Doctrina: hoy el sistema solo emite tipoDocumento:'01' (FEV) forzado.
 * Esto es ilegal para consumidor final anónimo (debe recibir tiquete).
 *
 * Códigos DIAN (Res. 165/2023 art. 1):
 *   tipoDocumento '01' = Factura de Venta (FEV) electrónica
 *   tipoDocumento '04' = Documento Equivalente (tiquete POS) electrónico
 *   CreditNote/DebitNote = notas derivadas (reemplazan Invoice en UBL)
 *
 * Config: CrozzoPosConfigManager
 * Doc: docs/maps/FISCAL-CO-BLOQUEANTES.md (requisitos 9, 10)
 */
(function (global) {
  'use strict';

  // Códigos canónicos DIAN
  var COD = {
    FEV: '01',                    // Factura Electrónica de Venta
    TIQUETE: '04',                // Documento Equivalente POS
    NOTA_CREDITO: '91',           // Nota Crédito (referencia a factura)
    NOTA_DEBITO: '92'             // Nota Débito
  };

  /**
   * Decide el tipo de documento a emitir.
   * @param {object} adquirente { doc, nombre, tipo (persona/empresa), solicitaFactura }
   * @param {object} configManager
   * @returns {{tipo: 'fev'|'tiquete', codigo: string, motivo: string, requiereAdquirente: boolean}}
   */
  function decidir(adquirente, configManager) {
    var adq = adquirente || {};
    var nivel = (configManager && typeof configManager.getNivelMadurez === 'function')
      ? configManager.getNivelMadurez() : 0;

    // Semilla (Nivel 0): no emite documento fiscal (sandbox)
    if (nivel === 0) {
      return { tipo: 'sandbox', codigo: null, motivo: 'Nivel 0 Semilla: no emite documento fiscal', requiereAdquirente: false };
    }

    // Si el adquirente solicita factura explícitamente → FEV (es su derecho)
    if (adq.solicitaFactura === true) {
      return { tipo: 'fev', codigo: COD.FEV, motivo: 'Adquirente solicita factura', requiereAdquirente: true };
    }

    // Si el adquirente tiene NIT/cédula identificable → FEV (es negocio o solicitante)
    var doc = String(adq.doc || '').trim();
    if (doc && doc !== '0' && doc.length >= 4) {
      return { tipo: 'fev', codigo: COD.FEV, motivo: 'Adquirente identificado (NIT/cédula)', requiereAdquirente: true };
    }

    // Consumidor final anónimo (sin doc, sin solicitud) → Tiquete (doc equivalente)
    return { tipo: 'tiquete', codigo: COD.TIQUETE, motivo: 'Consumidor final anónimo (tiquete electrónico)', requiereAdquirente: false };
  }

  /**
   * ¿Este documento es FEV (factura)?
   */
  function esFEV(codigo) {
    return codigo === COD.FEV;
  }

  /**
   * ¿Es tiquete electrónico (documento equivalente)?
   */
  function esTiquete(codigo) {
    return codigo === COD.TIQUETE;
  }

  /**
   * Determina el tipo de operación DIAN según el régimen del emisor.
   * '01' = Estándar (operación de venta). Otros: '09' contingencia, etc.
   * Res 165/2023 anexo técnico.
   */
  function tipoOperacion(adquirente, configManager, enContingencia) {
    if (enContingencia) return '09'; // Contingencia electrónica por falla
    return '01'; // Operación estándar
  }

  /**
   * Construye el objeto de documento fiscal listo para buildUBL21.
   * @param {object} venta { items, total, ... }
   * @param {object} adquirente
   * @param {object} configManager
   * @returns {object} { tipoDocumento, tipoOperacion, esTiquete, requiereAdquirente }
   */
  function prepararDocumento(venta, adquirente, configManager) {
    var decision = decidir(adquirente, configManager);
    var op = tipoOperacion(adquirente, configManager, venta && venta.enContingencia);
    return {
      tipoDocumento: decision.codigo,
      tipoOperacion: op,
      tipo: decision.tipo,
      esTiquete: decision.tipo === 'tiquete',
      requiereAdquirente: decision.requiereAdquirente,
      motivo: decision.motivo
    };
  }

  global.CrozzoTipoDocumento = {
    COD: COD,
    decidir: decidir,
    esFEV: esFEV,
    esTiquete: esTiquete,
    tipoOperacion: tipoOperacion,
    prepararDocumento: prepararDocumento
  };
})(typeof window !== 'undefined' ? window : globalThis);
