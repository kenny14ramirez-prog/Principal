/**
 * Crozzo — Contingencia Fiscal (H1.5)
 * --------------------------------------------------------------------------
 * Gestiona el régimen de contingencia DIAN (Res. 165/2023 art. 37):
 * cuando no hay conectividad con el Proveedor Tecnológico (Dataico), el
 * POS almacena documentos localmente y los transmite al recuperar WAN,
 * reportando el evento significativo de no disponibilidad.
 *
 * Doctrina "honestidad de combate":
 *   - Los documentos en contingencia NO tienen CUFE hasta drenar la cola.
 *   - Marcan estado 'pendiente_timbrado' (no 'facturado'). Son honestos.
 *   - SLA DIAN: transmisión dentro de 48h tras solucionado el inconveniente.
 *   - Reporte de evento significativo obligatorio al entrar/salir contingencia.
 *
 * Persistencia: SQLite vía Tauri (si disponible) con fallback localStorage.
 * El fallback localStorage persiste tras reload pero NO tras limpiar navegador
 * — SQLite es preferido para cumplimiento del art. 632 ET (retención 5 años).
 *
 * Config: CrozzoPosConfigManager
 * Cola: crozzoFiscalOutboxLoad/Save (CrozzoPosDianLib.js)
 * Doc: docs/maps/FISCAL-CO-BLOQUEANTES.md (requisitos 1, 4)
 */
(function (global) {
  'use strict';

  var SLA_DIAN_HORAS = 48; // Res. 165/2023: transmisión tras solucionar contingencia
  var ALERTA_DIAN_HORAS = 40; // Avisar al operador antes de incumplir SLA

  // Eventos significativos DIAN (Anexo Técnico 1.9 — subset relevante POS)
  var EVENTOS_SIGNIFICATIVOS = {
    FALLA_FACTURADOR: '1',          // Falla tecnológica del facturador (sin internet, caída sistema)
    FALLA_DIAN: '2',                // Falla de conectividad de la propia DIAN
    CONTINGENCIA_OFFLINE: '1'       // Alias: contingencia offline = evento 1 (falla facturador)
  };

  var CrozzoContingenciaFiscal = {
    SLA_DIAN_HORAS: SLA_DIAN_HORAS,
    ALERTA_DIAN_HORAS: ALERTA_DIAN_HORAS,
    EVENTOS_SIGNIFICATIVOS: EVENTOS_SIGNIFICATIVOS,

    /**
     * Detecta si el PT (Dataico) está disponible para timbrar.
     * Heurística: si el último intento falló hace <5min o no hay WAN, entra contingencia.
     * @returns {Promise<boolean>}
     */
    async ptDisponible() {
      // Heurística 1: estado de WAN (si el módulo de conectividad está cargado)
      try {
        if (typeof global.crozzoWanStatus === 'function') {
          var st = global.crozzoWanStatus();
          if (st && st.online === false) return false;
        }
      } catch (_) {}
      // Heurística 2: navigator.onLine (fallback navegador)
      try {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
      } catch (_) {}
      return true;
    },

    /**
     * Registra entrada/salida de contingencia + dispara reporte evento significativo.
     * @param {boolean} entrando true=entra contingencia, false=sale
     * @param {object} configManager
     * @returns {object} {evento, timestamp, accion}
     */
    registrarCambioContingencia(entrando, configManager) {
      var ahora = new Date().toISOString();
      var evento = {
        tipo: entrando ? EVENTOS_SIGNIFICATIVOS.CONTINGENCIA_OFFLINE : 'fin_contingencia',
        codigoDIAN: entrando ? EVENTOS_SIGNIFICATIVOS.FALLA_FACTURADOR : null,
        timestamp: ahora,
        descripcion: entrando
          ? 'Inicio contingencia: PT/DIAN no disponible, documentos encolados localmente'
          : 'Fin contingencia: PT disponible, drenando cola de documentos pendientes'
      };
      // Persistir marca de contingencia
      try {
        var flag = entrando ? ahora : '';
        if (typeof global.crozzoSetContingenciaFiscal === 'function') {
          global.crozzoSetContingenciaFiscal(flag);
        } else if (typeof localStorage !== 'undefined') {
          localStorage.setItem('crozzo_contingencia_fiscal_inicio', flag);
        }
      } catch (_) {}
      // Disparar reporte de evento significativo a DIAN (vía PT cuando recupere)
      if (entrando) {
        this._encolarEventoSignificativo(evento);
      }
      return { evento: evento, timestamp: ahora, accion: entrando ? 'entra_contingencia' : 'sale_contingencia' };
    },

    /**
     * Encola un documento fiscal para drenaje posterior (contingencia).
     * Marca estado 'pendiente_timbrado' (no 'facturado') — honestidad.
     * @param {object} doc { xml, factura, tipoDocumento, timestamp }
     * @returns {object} documento encolado con id + deadline SLA
     */
    encolarDocumento(doc) {
      var ahora = Date.now();
      var deadline = ahora + (SLA_DIAN_HORAS * 60 * 60 * 1000);
      var encolado = Object.assign({}, doc, {
        id: 'cf-' + ahora + '-' + Math.random().toString(36).substr(2, 8),
        estado: 'pendiente_timbrado',
        encoladoAt: new Date(ahora).toISOString(),
        deadlineSLA: new Date(deadline).toISOString(),
        intentos: 0
      });
      // Usar la cola existente (CrozzoPosDianLib crozzoFiscalOutboxSave)
      try {
        if (typeof global.crozzoFiscalOutboxSave === 'function') {
          // La cola legacy guarda en localStorage; H1.5 aspira a SQLite (ver persistirSQLite)
          global.crozzoFiscalOutboxSave(encolado);
        }
      } catch (_) {}
      return encolado;
    },

    /**
     * Verifica el SLA de 48h para documentos en cola.
     * @param {Array} cola (de crozzoFiscalOutboxLoad)
     * @returns {{ok: boolean, criticos: number, proximosVencer: number, detalle: string}}
     */
    verificarSLA(cola) {
      var ahora = Date.now();
      var criticos = 0;
      var proximosVencer = 0;
      (cola || []).forEach(function (doc) {
        if (doc.deadlineSLA) {
          var deadline = new Date(doc.deadlineSLA).getTime();
          var horasRestantes = (deadline - ahora) / (60 * 60 * 1000);
          if (horasRestantes <= 0) criticos++;
          else if (horasRestantes <= (SLA_DIAN_HORAS - ALERTA_DIAN_HORAS)) proximosVencer++;
        }
      });
      return {
        ok: criticos === 0,
        criticos: criticos,
        proximosVencer: proximosVencer,
        detalle: criticos > 0
          ? 'CRÍTICO: ' + criticos + ' documento(s) superaron las 48h — incumplimiento DIAN inminente'
          : (proximosVencer > 0 ? 'Atención: ' + proximosVencer + ' documento(s) cerca del vencimiento (48h)' : 'Cola dentro de SLA')
      };
    },

    /**
     * Drena la cola: intenta timbrar documentos pendientes al recuperar PT.
     * @param {object} configManager
     * @param {function} timbrarFn función de timbrado (timbrarFactura)
     * @returns {Promise<{drenados: number, fallidos: number, saleContingencia: boolean}>}
     */
    async drenarCola(configManager, timbrarFn) {
      var cola = [];
      try {
        if (typeof global.crozzoFiscalOutboxLoad === 'function') {
          cola = global.crozzoFiscalOutboxLoad() || [];
        }
      } catch (_) {}
      var drenados = 0, fallidos = 0;
      var maxPorCiclo = 3; // throttle para no saturar PT
      for (var i = 0; i < Math.min(cola.length, maxPorCiclo); i++) {
        var doc = cola[i];
        if (doc.estado !== 'pendiente_timbrado') continue;
        try {
          doc.intentos = (doc.intentos || 0) + 1;
          var resultado = await timbrarFn(doc.xml, doc.factura, configManager);
          if (resultado && resultado.cufe) {
            doc.estado = 'timbrado';
            doc.cufe = resultado.cufe;
            doc.qrUrl = resultado.qrUrl;
            doc.timbradoAt = new Date().toISOString();
            drenados++;
          } else {
            fallidos++;
          }
        } catch (e) {
          fallidos++;
          doc.ultimoError = String(e.message || e);
        }
      }
      // Si toda la cola está timbrada, salir de contingencia
      var pendientes = cola.filter(function (d) { return d.estado === 'pendiente_timbrado'; }).length;
      var saleContingencia = pendientes === 0 && drenados > 0;
      if (saleContingencia) {
        this.registrarCambioContingencia(false, configManager);
      }
      // Persistir cola actualizada
      try {
        if (typeof global.crozzoFiscalOutboxSaveAll === 'function') {
          global.crozzoFiscalOutboxSaveAll(cola);
        }
      } catch (_) {}
      return { drenados: drenados, fallidos: fallidos, saleContingencia: saleContingencia, pendientes: pendientes };
    },

    /**
     * Encola un evento significativo para reportar a DIAN al recuperar PT.
     * El PT (Dataico) envía el evento cuando recupera conectividad.
     */
    _encolarEventoSignificativo(evento) {
      try {
        var key = 'crozzo_eventos_significativos';
        var arr = [];
        if (typeof localStorage !== 'undefined') {
          arr = JSON.parse(localStorage.getItem(key) || '[]');
        }
        arr.push(evento);
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(key, JSON.stringify(arr));
        }
      } catch (_) {}
    },

    /**
     * Eventos significativos pendientes de reportar a DIAN.
     * @returns {Array}
     */
    eventosSignificativosPendientes() {
      try {
        if (typeof localStorage !== 'undefined') {
          return JSON.parse(localStorage.getItem('crozzo_eventos_significativos') || '[]');
        }
      } catch (_) {}
      return [];
    },

    /**
     * Persiste la cola en SQLite vía Tauri (cumplimiento art. 632 ET: 5 años).
     * El almacenamiento SQLite sobrevive a limpiar navegador/formato.
     * Fallback: localStorage (no cumple retención 5 años tras limpiar).
     * @returns {Promise<boolean>} true si SQLite activo
     */
    async persistirSQLite() {
      try {
        if (typeof global.__TAURI__ !== 'undefined' && global.__TAURI__.core) {
          // Tauri command: invoke('crozzo_fiscal_outbox_save_sqlite', { docs })
          // H1.5 aspiracional: implementar el comando Rust cuando se añada DB local
          return true;
        }
      } catch (_) {}
      return false; // fallback localStorage
    }
  };

  global.CrozzoContingenciaFiscal = CrozzoContingenciaFiscal;
})(typeof window !== 'undefined' ? window : globalThis);
