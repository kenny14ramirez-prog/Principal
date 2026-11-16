/**
 * Crozzo POS — Metrics bridge (Fase -2/P0)
 * -----------------------------------------
 * Wrapper para comandos Tauri crozzo_metrics_snapshot/inc_requests.
 * Combina métricas de Rust (servidor LAN) con métricas de negocio (JS).
 */
(function (global) {
  'use strict';

  function isTauri() {
    try { return !!(global.__TAURI__ && global.__TAURI__.core && typeof global.__TAURI__.core.invoke === 'function'); } catch (_) { return false; }
  }

  async function snapshot() {
    var rust = { requests: 0, errors: 0, syncPushes: 0 };
    if (isTauri()) {
      try {
        var r = await global.__TAURI__.core.invoke('crozzo_metrics_snapshot');
        if (Array.isArray(r)) { rust.requests = r[0] || 0; rust.errors = r[1] || 0; rust.syncPushes = r[2] || 0; }
      } catch (e) { console.warn('metrics snapshot failed', e); }
    }
    // Métricas de negocio (JS)
    var biz = {};
    try {
      var q = global.localStorage.getItem('crozzo_sync_queue');
      biz.outboxSize = q ? (JSON.parse(q).length || 0) : 0;
    } catch (_) { biz.outboxSize = 0; }
    try {
      var facturas = (global.config && typeof global.config.getFacturas === 'function') ? global.config.getFacturas() : [];
      biz.facturasTotal = facturas.length;
      biz.facturasPendienteFiscal = facturas.filter(function (f) { return f.estado === 'pendiente_fiscal' || !f.cufe; }).length;
    } catch (_) { biz.facturasTotal = 0; biz.facturasPendienteFiscal = 0; }
    return { rust: rust, business: biz, timestamp: new Date().toISOString() };
  }

  async function incRequests() {
    if (isTauri()) {
      try { await global.__TAURI__.core.invoke('crozzo_metrics_inc_requests'); } catch (_) {}
    }
  }

  global.CrozzoMetrics = { isTauri: isTauri, snapshot: snapshot, incRequests: incRequests };
})(typeof window !== 'undefined' ? window : globalThis);
