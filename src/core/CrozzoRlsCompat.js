/**
 * Crozzo POS — RLS Compat Mode (Fase -2/P0)
 * -----------------------------------------
 * Maneja la transición de RLS permisivo (legacy) a RLS por business_id (JWT).
 * Modo compatibilidad: permite operación legacy hasta fecha de corte.
 */
(function (global) {
  'use strict';

  var CUTOFF_DATE = '2026-12-31';
  var STORAGE_KEY = 'crozzo_rls_compat_mode_v1';

  function isCompatMode() {
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.mode === 'jwt') return false;
      }
    } catch (_) {}
    // Si no hay JWT almacenado, modo compatibilidad
    try {
      if (global.localStorage.getItem('crozzo_device_jwt')) return false;
    } catch (_) {}
    return true;
  }

  function setMode(mode) {
    try { global.localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: mode, setAt: new Date().toISOString() })); } catch (_) {}
  }

  function getBusinessId() {
    // Intentar extraer de JWT almacenado; si no, 'default'
    try {
      var jwt = global.localStorage.getItem('crozzo_device_jwt');
      if (jwt) {
        var parts = jwt.split('.');
        if (parts.length === 3) {
          var payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
          if (payload && payload.business_id) return payload.business_id;
        }
      }
    } catch (_) {}
    return 'default';
  }

  function isCutoffPassed() {
    try { return new Date() > new Date(CUTOFF_DATE + 'T23:59:59Z'); } catch (_) { return false; }
  }

  function status() {
    return {
      compatMode: isCompatMode(),
      businessId: getBusinessId(),
      cutoffDate: CUTOFF_DATE,
      cutoffPassed: isCutoffPassed(),
      hasJwt: !!global.localStorage.getItem('crozzo_device_jwt')
    };
  }

  global.CrozzoRlsCompat = {
    isCompatMode: isCompatMode,
    setMode: setMode,
    getBusinessId: getBusinessId,
    isCutoffPassed: isCutoffPassed,
    status: status,
    CUTOFF_DATE: CUTOFF_DATE
  };
})(typeof window !== 'undefined' ? window : globalThis);
