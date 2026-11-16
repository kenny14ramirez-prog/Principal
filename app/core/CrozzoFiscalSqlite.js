/**
 * Crozzo POS — Fiscal SQLite bridge (Fase -2 PoC)
 * ------------------------------------------------
 * Wrapper para los comandos Tauri crozzo_fiscal_save_sqlite / load_sqlite.
 * En plataformas sin Tauri (web/Android) se degrada a localStorage.
 */
(function (global) {
  'use strict';

  function isTauri() {
    try { return !!(global.__TAURI__ && global.__TAURI__.core && typeof global.__TAURI__.core.invoke === 'function'); } catch (_) { return false; }
  }

  async function save(key, value) {
    if (isTauri()) {
      try {
        await global.__TAURI__.core.invoke('crozzo_fiscal_save_sqlite', { key: String(key), value: String(value) });
        return true;
      } catch (e) { console.warn('fiscal_sqlite save failed', e); }
    }
    try { global.localStorage.setItem('crozzo_fiscal_' + key, String(value)); return true; } catch (_) { return false; }
  }

  async function load(key) {
    if (isTauri()) {
      try {
        var v = await global.__TAURI__.core.invoke('crozzo_fiscal_load_sqlite', { key: String(key) });
        if (v != null) return v;
      } catch (e) { console.warn('fiscal_sqlite load failed', e); }
    }
    try { return global.localStorage.getItem('crozzo_fiscal_' + key); } catch (_) { return null; }
  }

  global.CrozzoFiscalSqlite = { isTauri: isTauri, save: save, load: load };
})(typeof window !== 'undefined' ? window : globalThis);
