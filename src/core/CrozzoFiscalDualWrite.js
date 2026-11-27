/**
 * Crozzo POS — Fiscal Dual-Write PoC (Fase -2)
 * --------------------------------------------
 * Envuelve persistencia de facturas: intenta SQLite (Tauri) y siempre mantiene
 * copia en localStorage como cache/rollback. Feature flag: useSqliteFiscal.
 *
 * Uso:
 *   await CrozzoFiscalDualWrite.saveFacturas(facturasArray)
 *   var f = await CrozzoFiscalDualWrite.loadFacturas()
 */
(function (global) {
  'use strict';

  var KEY = 'facturas';

  function flagOn() {
    try { return !!(global.CrozzoFeatureFlags && global.CrozzoFeatureFlags.isEnabled('useSqliteFiscal')); } catch (_) { return false; }
  }

  async function saveFacturas(facturas) {
    var json = JSON.stringify(facturas || []);
    var ok = false;
    // 1. localStorage (cache, siempre)
    try { global.safeLocalStorageSet('crozzo_fiscal_facturas_cache', json); ok = true; } catch (_) {}
    // 2. SQLite (autoritativo, si flag activo y disponible)
    if (flagOn() && global.CrozzoFiscalSqlite) {
      try { await global.CrozzoFiscalSqlite.save(KEY, json); } catch (e) { console.warn('dualwrite sqlite save failed', e); }
    }
    return ok;
  }

  async function loadFacturas() {
    // 1. Intentar SQLite primero si flag activo
    if (flagOn() && global.CrozzoFiscalSqlite) {
      try {
        var v = await global.CrozzoFiscalSqlite.load(KEY);
        if (v) {
          try { global.safeLocalStorageSet('crozzo_fiscal_facturas_cache', v); } catch (_) {}
          return JSON.parse(v);
        }
      } catch (e) { console.warn('dualwrite sqlite load failed', e); }
    }
    // 2. Fallback localStorage
    try {
      var raw = global.localStorage.getItem('crozzo_fiscal_facturas_cache');
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return null;
  }

  global.CrozzoFiscalDualWrite = { saveFacturas: saveFacturas, loadFacturas: loadFacturas };
})(typeof window !== 'undefined' ? window : globalThis);
