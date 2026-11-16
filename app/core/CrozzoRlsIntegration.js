/**
 * Crozzo POS — RLS Real Integration (Fase -2/P0)
 * -----------------------------------------------
 * Integra JWT por dispositivo en llamadas Supabase.
 * Añade business_id al payload de push (para RLS).
 * Modo compatibilidad: si no hay JWT, usa 'default'.
 */
(function (global) {
  'use strict';

  function getBusinessId() {
    if (global.CrozzoRlsCompat) return global.CrozzoRlsCompat.getBusinessId();
    return 'default';
  }

  // Patch fetch (delega a CrozzoSupabaseAuth si flag activo)
  function init() {
    if (global.CrozzoSupabaseAuth && typeof global.CrozzoSupabaseAuth.patchFetch === 'function') {
      global.CrozzoSupabaseAuth.patchFetch();
    }
  }

  // Añadir business_id a payloads de push (Supabase upsert)
  function enrichPayload(payload) {
    if (!payload || typeof payload !== 'object') return payload;
    if (!payload.business_id) {
      payload.business_id = getBusinessId();
    }
    return payload;
  }

  // Verificar si RLS está activo
  function isRlsActive() {
    try {
      if (global.CrozzoFeatureFlags && global.CrozzoFeatureFlags.isEnabled('useRlsBusinessId')) return true;
    } catch (_) {}
    return false;
  }

  global.CrozzoRlsIntegration = {
    init: init,
    getBusinessId: getBusinessId,
    enrichPayload: enrichPayload,
    isRlsActive: isRlsActive
  };

  // Auto-init
  try { init(); } catch (_) {}
})(typeof window !== 'undefined' ? window : globalThis);
