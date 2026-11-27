/**
 * Crozzo POS — Fiscal Migration PoC (Fase -2)
 * --------------------------------------------
 * Al cargar (si flag useSqliteFiscal activo), sincroniza facturas existentes
 * de config a SQLite para migración gradual. Verificable por asuntos internos.
 *
 * Verificación:
 *   CrozzoFiscalMigrationPoC.run() -> { ok, count, source }
 *   CrozzoFiscalMigrationPoC.status() -> { migrated, count, lastRun }
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'crozzo_fiscal_migration_status_v1';

  function readStatus() {
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return { migrated: false, count: 0, lastRun: null };
  }

  function writeStatus(st) {
    try { global.safeLocalStorageSet(STORAGE_KEY, JSON.stringify(st)); } catch (_) {}
  }

  async function run() {
    var status = readStatus();
    var facturas = null;
    // Obtener facturas de config
    try {
      if (global.config && typeof global.config.getFacturas === 'function') {
        facturas = global.config.getFacturas();
      }
    } catch (_) {}
    if (!Array.isArray(facturas)) facturas = [];
    var ok = false;
    if (global.CrozzoFiscalDualWrite && typeof global.CrozzoFiscalDualWrite.saveFacturas === 'function') {
      try {
        ok = await global.CrozzoFiscalDualWrite.saveFacturas(facturas);
      } catch (e) { console.warn('migration save failed', e); }
    }
    var newStatus = {
      migrated: ok,
      count: facturas.length,
      lastRun: new Date().toISOString(),
      source: (global.CrozzoFiscalSqlite && global.CrozzoFiscalSqlite.isTauri && global.CrozzoFiscalSqlite.isTauri()) ? 'sqlite' : 'localstorage'
    };
    writeStatus(newStatus);
    return newStatus;
  }

  function status() { return readStatus(); }

  // Auto-run si flag activo y no migrado
  try {
    if (global.CrozzoFeatureFlags && global.CrozzoFeatureFlags.isEnabled('useSqliteFiscal')) {
      var st = readStatus();
      if (!st.migrated) {
        // defer para que config esté cargado
        setTimeout(function () { run().catch(function () {}); }, 2000);
      }
    }
  } catch (_) {}

  global.CrozzoFiscalMigrationPoC = { run: run, status: status };
})(typeof window !== 'undefined' ? window : globalThis);
