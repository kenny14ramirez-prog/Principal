/**
 * Crozzo POS — 2FA bridge (Fase -2/P0)
 * -------------------------------------
 * Wrapper para comandos Tauri crozzo_2fa_verify/generate_secret.
 * Fallback a Crozzo2FAPoC (JS) en web/Android.
 */
(function (global) {
  'use strict';

  function isTauri() {
    try { return !!(global.__TAURI__ && global.__TAURI__.core && typeof global.__TAURI__.core.invoke === 'function'); } catch (_) { return false; }
  }

  async function generateSecret() {
    if (isTauri()) {
      try { var s = await global.__TAURI__.core.invoke('crozzo_2fa_generate_secret'); if (s) return s; } catch (e) { console.warn('2fa generate failed', e); }
    }
    if (global.Crozzo2FAPoC) return global.Crozzo2FAPoC.generateSecret();
    return null;
  }

  async function verify(secret, code) {
    if (isTauri()) {
      try { var r = await global.__TAURI__.core.invoke('crozzo_2fa_verify', { secretB32: String(secret), code: String(code) }); return !!r; } catch (e) { console.warn('2fa verify failed', e); }
    }
    if (global.Crozzo2FAPoC) return global.Crozzo2FAPoC.verify(secret, code);
    return false;
  }

  global.Crozzo2FA = { isTauri: isTauri, generateSecret: generateSecret, verify: verify };
})(typeof window !== 'undefined' ? window : globalThis);
