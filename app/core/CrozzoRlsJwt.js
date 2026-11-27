/**
 * Crozzo POS — RLS JWT por dispositivo (Fase -2/P0)
 * ------------------------------------------------
 * Maneja obtención, almacenamiento y envío de JWT por dispositivo
 * para RLS real (business_id isolation). Almacena en vault (CrozzoCertVault)
 * o localStorage (fallback).
 */
(function (global) {
  'use strict';

  var JWT_KEY = 'crozzo_device_jwt';

  async function getJwt() {
    // 1. Intentar vault (seguro)
    if (global.CrozzoCertVault) {
      try {
        var v = await global.CrozzoCertVault.get();
        if (v) return v;
      } catch (_) {}
    }
    // 2. Fallback localStorage
    try { return global.localStorage.getItem(JWT_KEY); } catch (_) { return null; }
  }

  async function setJwt(jwt) {
    if (global.CrozzoCertVault) {
      try { await global.CrozzoCertVault.set(jwt); } catch (_) {}
    }
    try { global.safeLocalStorageSet(JWT_KEY, jwt); } catch (_) {}
  }

  async function clearJwt() {
    try { global.localStorage.removeItem(JWT_KEY); } catch (_) {}
  }

  function parseBusinessId(jwt) {
    if (!jwt) return 'default';
    try {
      var parts = jwt.split('.');
      if (parts.length === 3) {
        var payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (payload && payload.business_id) return payload.business_id;
      }
    } catch (_) {}
    return 'default';
  }

  async function authHeaders() {
    var jwt = await getJwt();
    var headers = {};
    if (jwt) headers['Authorization'] = 'Bearer ' + jwt;
    return headers;
  }

  async function hasJwt() {
    var jwt = await getJwt();
    return !!jwt;
  }

  global.CrozzoRlsJwt = {
    getJwt: getJwt,
    setJwt: setJwt,
    clearJwt: clearJwt,
    parseBusinessId: parseBusinessId,
    authHeaders: authHeaders,
    hasJwt: hasJwt
  };
})(typeof window !== 'undefined' ? window : globalThis);
