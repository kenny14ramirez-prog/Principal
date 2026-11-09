/**
 * Bona Origen — Conexión automática post-QR (LAN + mesas/comandas en tiempo real).
 * Tras escanear el QR el usuario no debe tocar nada más: activa LAN, WS y alinea estado.
 */
(function (global) {
  'use strict';

  var __inflight = null;
  var __lastAt = 0;
  var GAP_MS = 3200;
  var FLEET_SKIP_RE = /^(lan_up|auto_lan_up|op_fanout_|lan_transport)/;

  function __extractCertPemFromPayload(payload) {
    if (!payload || typeof payload !== 'object') return '';
    try {
      var lan = payload.lan || {};
      var candidates = [
        payload.cert_pem, payload.certPem, payload.ca_cert, payload.caCert,
        payload.ca_pem, payload.caPem, payload.tls_cert, payload.tlsCert,
        payload.server_cert, payload.serverCert, payload.certificate, payload.cert,
        lan.cert_pem, lan.certPem, lan.ca_cert, lan.caCert, lan.tls_cert, lan.tlsCert,
        lan.certificate, lan.cert,
      ];
      for (var i = 0; i < candidates.length; i++) {
        var c = candidates[i];
        if (typeof c === 'string' && /-----BEGIN CERTIFICATE-----/.test(c) && /-----END CERTIFICATE-----/.test(c)) {
          return String(c).trim();
        }
      }
    } catch (_) {}
    return '';
  }

  async function ensureCertTrust(payload) {
    try {
      // Si ya está marcado como confiado y hay PEM guardado, no repetir.
      try {
        if (global.localStorage && global.localStorage.getItem('crozzo_cert_trusted') === '1') {
          var existingPem = (typeof global.crozzoCertTrustGet === 'function') ? global.crozzoCertTrustGet() : '';
          if (existingPem) return { ok: true, skipped: true, reason: 'already_trusted' };
        }
      } catch (_) {}
      var certPem = __extractCertPemFromPayload(payload);
      if (!certPem) {
        try {
          if (global.__TAURI__ && global.__TAURI__.core && typeof global.__TAURI__.core.invoke === 'function') {
            var r = await global.__TAURI__.core.invoke('crozzo_lan_tls_cert');
            if (r) certPem = String(r.cert_pem || r.certPem || r.pem || r.certificate || '').trim();
          }
        } catch (_) {}
      }
      if (!certPem) {
        try { if (global.localStorage) global.localStorage.setItem('crozzo_cert_trusted', '0'); } catch (_) {}
        return { ok: false, reason: 'no_cert' };
      }
      if (typeof global.crozzoCertTrustInstall !== 'function') {
        try { if (global.localStorage) global.localStorage.setItem('crozzo_cert_trusted', '0'); } catch (_) {}
        return { ok: false, reason: 'no_installer' };
      }
      var res = await global.crozzoCertTrustInstall(certPem);
      var ok = !!(res && res.ok !== false);
      try { if (global.localStorage) global.localStorage.setItem('crozzo_cert_trusted', ok ? '1' : '0'); } catch (_) {}
      try { global.__CROZZO_CERT_TRUSTED = ok; } catch (_) {}
      return res || { ok: ok };
    } catch (e) {
      try { if (global.localStorage) global.localStorage.setItem('crozzo_cert_trusted', '0'); } catch (_) {}
      return { ok: false, reason: 'error' };
    }
  }
  global.crozzoCertTrustEnsure = ensureCertTrust;

  async function run(source, opts) {
    opts = opts || {};
    source = String(source || 'auto_connect');
    var now = Date.now();
    if (__inflight && !opts.force && now - __lastAt < GAP_MS) {
      try {
        return await __inflight;
      } catch (_) {}
    }
    __lastAt = now;
    __inflight = (async function () {
      try {
        if (!opts.skipInvalidate && typeof global.crozzoInvalidateAllOperativeSync === 'function') {
          global.crozzoInvalidateAllOperativeSync();
        }
      } catch (_) {}
      var skipActivate = source === 'lan_up' || String(source || '').indexOf('lan_up') >= 0;
      try {
        if (global.CrozzoLanWebSocketBridge && typeof global.CrozzoLanWebSocketBridge.connect === 'function') {
          global.CrozzoLanWebSocketBridge.connect();
        }
      } catch (_) {}
      if (!skipActivate) {
        try {
          if (typeof global.crozzoActivateLocalSyncPath === 'function') {
            await global.crozzoActivateLocalSyncPath('auto_' + source);
          }
        } catch (_) {}
      }
      try {
        if (
          !opts.skipFleetReconcile &&
          !FLEET_SKIP_RE.test(source) &&
          typeof global.crozzoFleetOperationalReconcile === 'function'
        ) {
          await global.crozzoFleetOperationalReconcile(source);
        }
      } catch (_) {}
      try {
        if (typeof global.crozzoHandleRemoteRuntimeUiSync === 'function') {
          global.crozzoHandleRemoteRuntimeUiSync({ skipCartReconcile: true });
        }
      } catch (_) {}
      /* Safety: si la flota sigue en 1, forzar anuncio (no depende solo de ApplyLan). */
      try {
        var snap =
          typeof global.crozzoFleetSnapshot === 'function'
            ? global.crozzoFleetSnapshot()
            : global.CrozzoPeerDirectory && typeof global.CrozzoPeerDirectory.getFleetSnapshot === 'function'
              ? global.CrozzoPeerDirectory.getFleetSnapshot()
              : null;
        if (snap && Number(snap.peerCount) <= 1) {
          if (typeof global.crozzoAnnounceFleetIdentity === 'function') {
            await global.crozzoAnnounceFleetIdentity({ force: true, pull: true });
          } else if (global.CrozzoPeerDirectory && typeof global.CrozzoPeerDirectory.announceIdentity === 'function') {
            await global.CrozzoPeerDirectory.announceIdentity({ force: true, pull: true });
          }
        }
      } catch (_) {}
      /* Confianza del certificado de la caja (CA self-signed) — TOFU complementario. */
      try {
        var __certPayload = null;
        try { __certPayload = (opts && opts.payload) ? opts.payload : null; } catch (_) {}
        if (!__certPayload) {
          try { __certPayload = global.__CROZZO_LAST_PAIR_PAYLOAD || null; } catch (_) {}
        }
        if (!__certPayload) {
          try {
            var __rawHints = global.localStorage ? global.localStorage.getItem('crozzo_pair_network_hints') : null;
            if (__rawHints) {
              var __jh = JSON.parse(__rawHints);
              __certPayload = (__jh && (__jh.raw || __jh.payload)) || __jh;
            }
          } catch (_) {}
        }
        await ensureCertTrust(__certPayload);
        /* Propagar fingerprint TLS del payload al pinning store. */
        try {
          var __fpVal = __certPayload && (__certPayload.tls_fingerprint || (__certPayload.lan && __certPayload.lan.tls_fingerprint) || __certPayload.cert_fingerprint || __certPayload.certFingerprint);
          if (__fpVal && typeof global.crozzoTlsSaveFingerprint === 'function') global.crozzoTlsSaveFingerprint(__fpVal);
          else if (__fpVal && typeof global.localStorage !== 'undefined') global.localStorage.setItem('crozzo_paired_tls_fingerprint', String(__fpVal).trim().toLowerCase());
        } catch (_) {}
      } catch (_) {}
      return { ok: true, source: source };
    })();
    try {
      return await __inflight;
    } finally {
      global.setTimeout(function () {
        if (Date.now() - __lastAt >= GAP_MS - 200) __inflight = null;
      }, GAP_MS);
    }
  }

  global.CrozzoPairingAutoConnect = { run: run, start: start, ensureCertTrust: ensureCertTrust };
  global.crozzoPairingAutoConnect = run;

  function start() {
    if (global.__crozzoPairingAutoConnectBound) return;
    global.__crozzoPairingAutoConnectBound = true;
    try {
      global.addEventListener('crozzo:auth-ready', function (ev) {
        var src = (ev && ev.detail && ev.detail.source) || 'login';
        if (src === 'init') return;
        global.setTimeout(function () {
          var skipFleet = false;
          try {
            if (typeof global.crozzoComandaRealtimeStatus === 'function') {
              var cs = global.crozzoComandaRealtimeStatus();
              skipFleet = !!(cs && cs.live && global.__crozzoComandaCloudCh);
            }
          } catch (_) {}
          run('auth_' + src, { force: false, skipInvalidate: true, skipFleetReconcile: skipFleet }).catch(function () {});
        }, 800);
      });
      global.addEventListener('crozzo-internal-qr-setup-exchange', function () {
        global.setTimeout(function () {
          /* Reconcile ya alinea mesas/comandas; no invalidar gate operativo en pleno uso. */
          run('qr_exchange', { force: false, skipInvalidate: true }).catch(function () {});
        }, 1400);
      });
      global.addEventListener('crozzo-lan-up', function () {
        global.setTimeout(function () {
          run('lan_up', { force: false, skipInvalidate: true }).catch(function () {});
        }, 600);
      });
    } catch (_) {}
  }

  try {
    if (global.document && global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', start);
    } else {
      start();
    }
  } catch (_) {}
})(typeof window !== 'undefined' ? window : globalThis);
