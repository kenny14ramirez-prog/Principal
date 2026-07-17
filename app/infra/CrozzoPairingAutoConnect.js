/**
 * Crozzo — Conexión automática post-QR (LAN + mesas/comandas en tiempo real).
 * Tras escanear el QR el usuario no debe tocar nada más: activa LAN, WS y alinea estado.
 */
(function (global) {
  'use strict';

  var __inflight = null;
  var __lastAt = 0;
  var GAP_MS = 3200;
  var FLEET_SKIP_RE = /^(lan_up|auto_lan_up|op_fanout_|lan_transport)/;

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

  global.CrozzoPairingAutoConnect = { run: run, start: start };
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
