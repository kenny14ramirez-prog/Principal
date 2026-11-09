/**
 * Crozzo POS — Certificate pinning / confianza de certificado self-signed.
 * Expone global.crozzoTlsVerifyFingerprint(fp) para que las tablets confíen
 * en la caja comparando el fingerprint SHA-256 del DER con el guardado en
 * el emparejamiento (pairing). Fallback a HTTP plano si falla.
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'crozzo_paired_tls_fingerprint';

  function normalize(fp) {
    fp = String(fp == null ? '' : fp).trim().toLowerCase();
    if (fp.indexOf('sha256:') === 0) fp = fp.slice('sha256:'.length);
    if (fp.indexOf('sha-256:') === 0) fp = fp.slice('sha-256:'.length);
    return fp.replace(/\s+/g, '');
  }

  function saveFingerprint(fp) {
    fp = normalize(fp);
    if (!fp) return false;
    try { global.__CROZZO_PAIRED_TLS_FP = fp; } catch (_) {}
    try { if (typeof global.localStorage !== 'undefined') global.localStorage.setItem(STORAGE_KEY, fp); } catch (_) {}
    return true;
  }

  function getPairedFingerprint() {
    try {
      if (global.__CROZZO_PAIRED_TLS_FP) return normalize(global.__CROZZO_PAIRED_TLS_FP);
    } catch (_) {}
    try {
      if (typeof global.localStorage !== 'undefined') return normalize(global.localStorage.getItem(STORAGE_KEY));
    } catch (_) {}
    return '';
  }

  // Verifica un fingerprint contra el guardado en el pairing.
  // TOFU: si no hay guardado (pairing antiguo) y se provee uno, se confía en el
  // primer uso y se guarda para futuras verificaciones. Si no se provee, fallback
  // permisivo (no rompe).
  function verifyFingerprint(fp) {
    var expected = getPairedFingerprint();
    var provided = normalize(fp);
    if (!provided) return true;
    if (!expected) {
      // Trust On First Use: guardar y confiar.
      saveFingerprint(provided);
      return true;
    }
    return provided === expected;
  }

  async function fetchCajaFingerprint(ip, port) {
    ip = String(ip || '').trim();
    port = Math.max(1, Number(port) || 3000);
    // Tauri (caja): comando nativo.
    try {
      if (global.__TAURI__ && global.__TAURI__.core && typeof global.__TAURI__.core.invoke === 'function') {
        var r = await global.__TAURI__.core.invoke('crozzo_lan_tls_cert');
        if (r && (r.fingerprint || r.fingerprint_sha256)) {
          return normalize(r.fingerprint || r.fingerprint_sha256);
        }
      }
    } catch (_) {}
    // HTTP plano: endpoint opcional /tls/fingerprint (fallback).
    try {
      var res = await global.fetch('http://' + ip + ':' + port + '/crozzo/tls/fingerprint', { method: 'GET' });
      if (res && res.ok) {
        var j = await res.json();
        if (j && (j.fingerprint || j.fingerprint_sha256)) return normalize(j.fingerprint || j.fingerprint_sha256);
      }
    } catch (_) {}
    return '';
  }

  async function verifyConnection(ip, port, fp) {
    try {
      var expected = getPairedFingerprint();
      if (fp) {
        if (!verifyFingerprint(fp)) return { ok: false, reason: 'mismatch', expected: expected, provided: normalize(fp) };
        saveFingerprint(fp);
        return { ok: true, reason: expected ? 'matched' : 'tofu' };
      }
      if (!expected) {
        // TOFU: sin fingerprint guardado, obtenerlo de la caja y guardarlo.
        var tofuGot = await fetchCajaFingerprint(ip, port);
        if (tofuGot) saveFingerprint(tofuGot);
        return { ok: true, reason: tofuGot ? 'tofu' : 'no_remote_fingerprint' };
      }
      var got = await fetchCajaFingerprint(ip, port);
      if (!got) return { ok: true, reason: 'no_remote_fingerprint' };
      if (got !== expected) return { ok: false, reason: 'mismatch', expected: expected, provided: got };
      return { ok: true, reason: 'matched' };
    } catch (_) {
      return { ok: true, reason: 'error_fallback' };
    }
  }

  // Fingerprint cacheado síncrono para incluir en payloads de pairing.
  function cachedFingerprint() {
    return getPairedFingerprint() || '';
  }

  global.crozzoTlsSaveFingerprint = saveFingerprint;
  global.crozzoTlsGetPairedFingerprint = getPairedFingerprint;
  global.crozzoTlsVerifyFingerprint = verifyFingerprint;
  global.crozzoTlsTrustOnFirstUse = saveFingerprint;
  global.crozzoLanTlsFingerprint = cachedFingerprint;
  global.CrozzoTlsPinning = {
    save: saveFingerprint,
    get: getPairedFingerprint,
    verify: verifyFingerprint,
    trustOnFirstUse: saveFingerprint,
    fetchFingerprint: fetchCajaFingerprint,
    verifyConnection: verifyConnection,
  };
})(typeof window !== 'undefined' ? window : globalThis);