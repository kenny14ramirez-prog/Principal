/**
 * Crozzo POS — Supabase Auth (RLS real) PoC (Fase -2/P0)
 * ---------------------------------------------------------
 * Intercepta fetch a Supabase para añadir Authorization header (JWT por dispositivo).
 * Se activa con feature flag useRlsBusinessId.
 */
(function (global) {
  'use strict';

  var _patched = false;

  function isFlagOn() {
    try { return !!(global.CrozzoFeatureFlags && global.CrozzoFeatureFlags.isEnabled('useRlsBusinessId')); } catch (_) { return false; }
  }

  function patchFetch() {
    if (_patched) return;
    if (!isFlagOn()) return;
    var origFetch = global.fetch;
    if (!origFetch) return;
    global.fetch = async function (input, init) {
      init = init || {};
      var url = (typeof input === 'string') ? input : (input && input.url) || '';
      // Solo interceptar llamadas a Supabase
      if (url.indexOf('supabase') !== -1 || url.indexOf('supabase.co') !== -1) {
        init.headers = init.headers || {};
        if (global.CrozzoRlsJwt) {
          try {
            var h = await global.CrozzoRlsJwt.authHeaders();
            Object.assign(init.headers, h);
          } catch (_) {}
        }
      }
      return origFetch.call(global, input, init);
    };
    _patched = true;
  }

  // Auto-patch si flag activo
  try { patchFetch(); } catch (_) {}

  global.CrozzoSupabaseAuth = { patchFetch: patchFetch, isPatched: function () { return _patched; } };
})(typeof window !== 'undefined' ? window : globalThis);
