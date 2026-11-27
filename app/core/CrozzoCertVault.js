/**
 * Crozzo POS — Cert Vault bridge (Fase -2 PoC)
 * --------------------------------------------
 * Wrapper para comandos Tauri crozzo_cert_vault_set/get (DPAPI en Windows).
 * En plataformas sin Tauri se degrada a localStorage (no seguro; solo PoC).
 */
(function (global) {
  'use strict';
  function isTauri() {
    try { return !!(global.__TAURI__ && global.__TAURI__.core && typeof global.__TAURI__.core.invoke === 'function'); } catch (_) { return false; }
  }
  async function set(certB64) {
    if (isTauri()) {
      try { await global.__TAURI__.core.invoke('crozzo_cert_vault_set', { certB64: String(certB64) }); return true; } catch (e) { console.warn('cert_vault set failed', e); }
    }
    try { global.safeLocalStorageSet('crozzo_cert_vault_cache', String(certB64)); return true; } catch (_) { return false; }
  }
  async function get() {
    if (isTauri()) {
      try { var v = await global.__TAURI__.core.invoke('crozzo_cert_vault_get'); if (v) return v; } catch (e) { console.warn('cert_vault get failed', e); }
    }
    try { return global.localStorage.getItem('crozzo_cert_vault_cache'); } catch (_) { return null; }
  }
  global.CrozzoCertVault = { isTauri: isTauri, set: set, get: get };
})(typeof window !== 'undefined' ? window : globalThis);
