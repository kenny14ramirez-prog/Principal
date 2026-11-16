/**
 * Crozzo POS — RLS Payload Enricher (Fase -2/P0)
 * -----------------------------------------------
 * Intercepta fetch a Supabase y añade business_id al body JSON.
 * Se activa con feature flag useRlsBusinessId.
 */
(function (global) {
  'use strict';

  var _patched = false;

  function isFlagOn() {
    try { return !!(global.CrozzoFeatureFlags && global.CrozzoFeatureFlags.isEnabled('useRlsBusinessId')); } catch (_) { return false; }
  }

  function getBusinessId() {
    if (global.CrozzoRlsCompat) return global.CrozzoRlsCompat.getBusinessId();
    return 'default';
  }

  function patchFetch() {
    if (_patched) return;
    if (!isFlagOn()) return;
    var origFetch = global.fetch;
    if (!origFetch) return;
    global.fetch = async function (input, init) {
      init = init || {};
      var url = (typeof input === 'string') ? input : (input && input.url) || '';
      if (url.indexOf('supabase') !== -1) {
        // Añadir business_id al body JSON si es POST/PATCH/PUT
        if (init.body && typeof init.body === 'string') {
          try {
            var body = JSON.parse(init.body);
            if (Array.isArray(body)) {
              body = body.map(function (item) { if (item && !item.business_id) item.business_id = getBusinessId(); return item; });
            } else if (body && typeof body === 'object' && !body.business_id) {
              body.business_id = getBusinessId();
            }
            init.body = JSON.stringify(body);
          } catch (_) {}
        }
        // Añadir auth headers
        if (global.CrozzoRlsJwt) {
          try {
            var h = await global.CrozzoRlsJwt.authHeaders();
            init.headers = Object.assign({}, init.headers || {}, h);
          } catch (_) {}
        }
      }
      return origFetch.call(global, input, init);
    };
    _patched = true;
  }

  try { patchFetch(); } catch (_) {}

  global.CrozzoRlsPayloadEnricher = { patchFetch: patchFetch, isPatched: function () { return _patched; } };
})(typeof window !== 'undefined' ? window : globalThis);
