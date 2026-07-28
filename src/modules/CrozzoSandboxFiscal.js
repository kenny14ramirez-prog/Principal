/**
 * Crozzo — Sandbox Fiscal (H1.0b, Nivel 0 Semilla)
 * --------------------------------------------------------------------------
 * Motor del modo capacitación. El comerciante opera POS completo con datos
 * ficticios, pero NUNCA produce documento fiscal válido.
 *
 * DOCTRINA "honestidad de combate" (no negociable):
 *   El Nivel 0 NO simula CUFE. No genera hash falso etiquetado como CUFE.
 *   Emite tickets de capacitación EXPLÍCITAMENTE INVÁLIDOS, con watermark
 *   visible. Cero ambigüedad. Esto reemplaza y elimina mockStamp (violación C4).
 *
 * Candado duro: timbrarFactura() debe lanzar SandboxFiscalException si
 * nivelMadurez === 0. Este módulo provee el helper de validación + el ticket.
 *
 * Dataset ficticio: 5 productos + 3 clientes + 1 sede demo (carga en 1 clic).
 */
(function (global) {
  'use strict';

  var WATERMARK = 'NO VÁLIDO PARA USO FISCAL — MODO CAPACITACIÓN';
  var WATERMARK_TICKET = '═══════════════════════════════\n' +
                         '  NO VÁLIDO PARA USO FISCAL\n' +
                         '     MODO CAPACITACIÓN\n' +
                         '═══════════════════════════════';

  // ─── Dataset ficticio para entrenamiento ───────────────────────────────────
  // Productos con perfiles variados (iva mixto, INC, propina) para enseñar
  // todos los escenarios sin tocar datos reales del comerciante.
  var DATASET = {
    sede: {
      nombreComercial: 'Crozzo Demo · Sede Capacitación',
      direccion: 'Calle Demo 123, Bogotá',
      telefono: '300 000 0000',
      nit: '00000000-0',
      esDemo: true
    },
    productos: [
      { sku: 'DEMO001', nombre: 'Almuerzo ejecutivo (demo)', precio: 18000, ivaRate: 0.08, categoria: 'almuerzo', incAplica: true },
      { sku: 'DEMO002', nombre: 'Gaseosa 350ml (demo)', precio: 3500, ivaRate: 0.19, categoria: 'bebida', saludable: 'bebida_azucarada' },
      { sku: 'DEMO003', nombre: 'Cerveza nacional (demo)', precio: 5500, ivaRate: 0.19, categoria: 'alcohol', incAplica: true },
      { sku: 'DEMO004', nombre: 'Agua 500ml (demo)', precio: 2500, ivaRate: 0.05, categoria: 'bebida', saludable: 'ninguno' },
      { sku: 'DEMO005', nombre: 'Empanada (demo)', precio: 2000, ivaRate: 0, categoria: 'panaderia', saludable: 'ninguno' }
    ],
    clientes: [
      { doc: '0', nombre: 'Cliente mostrador (demo)', esDemo: true },
      { doc: 'DEMO123', nombre: 'Cliente fidelizado (demo)', telefono: '301 111 1111', esDemo: true },
      { doc: 'DEMO999', nombre: 'Empresa demo S.A.S.', telefono: '301 333 3333', esDemo: true }
    ]
  };

  // ─── Excepción específica de sandbox ───────────────────────────────────────
  function SandboxFiscalException(mensaje) {
    this.name = 'SandboxFiscalException';
    this.message = mensaje || 'Operación fiscal bloqueada en modo Sandbox (Nivel 0 Semilla). Sube a Brote para facturar legalmente.';
    this.isSandboxBlock = true;
    this.stack = (new Error()).stack;
  }
  SandboxFiscalException.prototype = Object.create(Error.prototype);
  SandboxFiscalException.prototype.constructor = SandboxFiscalException;

  var CrozzoSandboxFiscal = {
    WATERMARK: WATERMARK,
    WATERMARK_TICKET: WATERMARK_TICKET,
    DATASET: DATASET,
    SandboxFiscalException: SandboxFiscalException,

    /**
     * CANdado duro. Verifica si el config está en Sandbox (Nivel 0).
     * Si lo está, lanza SandboxFiscalException — NUNCA permite timbrar.
     * Llamar al inicio de timbrarFactura() y cualquier path que genere CUFE.
     * @throws {SandboxFiscalException} si nivelMadurez === 0
     */
    assertNoSandbox: function (configManager) {
      if (!configManager) return;
      var isSandbox = typeof configManager.isSandboxFiscal === 'function'
        ? configManager.isSandboxFiscal()
        : (configManager.getNivelMadurez && configManager.getNivelMadurez() === 0);
      if (isSandbox) {
        throw new SandboxFiscalException();
      }
    },

    /** ¿El config está en Sandbox? (sin lanzar) */
    esSandbox: function (configManager) {
      if (!configManager) return false;
      return typeof configManager.isSandboxFiscal === 'function'
        ? configManager.isSandboxFiscal()
        : (configManager.getNivelMadurez && configManager.getNivelMadurez() === 0);
    },

    /**
     * Genera un ticket de capacitación (no fiscal).
     * No tiene CUFE, no tiene QR DIAN, no es consultable en VPFE.
     * Marcado visible como NO VÁLIDO.
     * @returns {object} documento de capacitación
     */
    generarTicketCapacitacion: function (factura, configManager) {
      return {
        tipo: 'ticket_capacitacion',
        esDemo: true,
        esFiscal: false,          // Explícito: NUNCA fiscal
        watermark: WATERMARK,
        watermarkTicket: WATERMARK_TICKET,
        cufe: null,                // NUNCA CUFE
        qrcode: null,              // NUNCA QR DIAN
        numeroValidacion: null,
        proveedor: 'sandbox',
        ambiente: 'capacitacion',
        timestamp: new Date().toISOString(),
        sede: DATASET.sede.nombreComercial,
        factura: factura,
        avisoLegal: 'Este documento no tiene validez fiscal. Es para capacitación únicamente.'
      };
    },

    /**
     * Carga el dataset ficticio en el POS (productos + clientes + sede).
     * Para que el comerciante opere de inmediato sin configurar nada.
     * @param {function} cargadorProductos fn(array) — hook para poblar catálogo
     * @param {function} cargadorClientes fn(array) — hook para poblar CRM
     * @param {function} cargadorSede fn(sede) — hook para configurar sede demo
     * @returns {number} total de items cargados
     */
    cargarDataset: function (cargadorProductos, cargadorClientes, cargadorSede) {
      var total = 0;
      try {
        if (typeof cargadorProductos === 'function') {
          cargadorProductos(DATASET.productos.map(function (p) {
            return Object.assign({ esDemo: true }, p);
          }));
          total += DATASET.productos.length;
        }
        if (typeof cargadorClientes === 'function') {
          cargadorClientes(DATASET.clientes.slice());
          total += DATASET.clientes.length;
        }
        if (typeof cargadorSede === 'function') {
          cargadorSede(Object.assign({ esDemo: true }, DATASET.sede));
          total += 1;
        }
      } catch (e) {
        console.warn('[CrozzoSandboxFiscal] cargarDataset falló:', e);
      }
      return total;
    },

    /**
     * Valida que un documento NO sea fiscal si está marcado como sandbox.
     * Para pruebas automatizadas: detectar si algo se escapó con CUFE real.
     * @returns {boolean} true si el documento es seguro (no fiscal en sandbox)
     */
    esDocumentoSeguro: function (documento) {
      if (!documento) return true;
      // Un documento con CUFE/QR DIAN/numeroValidación NO es seguro en sandbox
      if (documento.cufe || documento.qrcode || documento.numeroValidacion) return false;
      if (documento.esFiscal === true) return false;
      return true;
    }
  };

  global.CrozzoSandboxFiscal = CrozzoSandboxFiscal;
})(typeof window !== 'undefined' ? window : globalThis);
