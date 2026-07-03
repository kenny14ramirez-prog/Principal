/**
 * Crozzo — Autoguarda operativa Z0 (autopilot para usuarios no técnicos).
 *
 * Sin botones ni consola: evalúa salud Realtime/LAN en segundo plano,
 * recupera sola cuando algo se enfría, y solo entonces muestra un aviso
 * claro en lenguaje humano (vía CrozzoHumanConnectivityPredict).
 */
(function (global) {
  'use strict';

  var TICK_MS = 52000;
  var RECOVER_GAP_MS = 88000;
  var RECOVER_GAP_URGENT_MS = 42000;
  var FP_WINDOW_MS = 600000;
  var STUCK_BEFORE_HINT_MS = 540000;
  var LS_SNAP = 'crozzo_z0_autoguard_v1';
  var __timer = null;
  var __started = false;
  var __lastRecoverAt = 0;
  var __recoverAttempts = 0;
  var __lastHealthyAt = 0;
  var __inflight = false;

  function safe(fn) {
    try {
      return fn();
    } catch (_) {
      return undefined;
    }
  }

  function isZ0Active() {
    try {
      if (typeof global.crozzoOperationalRealtimeActive === 'function') {
        return global.crozzoOperationalRealtimeActive();
      }
    } catch (_) {}
    return false;
  }

  function readTier() {
    try {
      if (typeof global.crozzoCloudOperationalRealtimeTier === 'function') {
        return global.crozzoCloudOperationalRealtimeTier(38000);
      }
    } catch (_) {}
    return { tier: 'off', live: false, healthy: false, warm: false, stale: false };
  }

  function activeTransport() {
    try {
      if (typeof global.crozzoActiveSyncTransport === 'function') {
        return global.crozzoActiveSyncTransport({ kind: 'transport' });
      }
    } catch (_) {}
    return 'none';
  }

  function buildSnapshot() {
    var tier = readTier();
    return {
      at: Date.now(),
      z0Active: isZ0Active(),
      tier: tier.tier || 'off',
      transport: activeTransport(),
      lastHealthyAt: __lastHealthyAt || 0,
      recoverAttempts: __recoverAttempts,
      lastRecoverAt: __lastRecoverAt,
    };
  }

  function persistSnapshot(snap) {
    safe(function () {
      global.__CROZZO_Z0_AUTOGUARD = snap;
      global.localStorage.setItem(LS_SNAP, JSON.stringify(snap));
    });
  }

  function markHealthy() {
    __lastHealthyAt = Date.now();
    __recoverAttempts = 0;
  }

  function journalRecord(code, detail) {
    safe(function () {
      if (global.CrozzoOperativeJournal && typeof global.CrozzoOperativeJournal.record === 'function') {
        global.CrozzoOperativeJournal.record({
          kind: 'autoguard',
          code: code,
          detail: detail,
          tier: readTier().tier,
          transport: activeTransport(),
        });
      }
    });
  }

  function effectiveRecoverGap() {
    return safe(function () {
      if (!global.CrozzoOperativeJournal || typeof global.CrozzoOperativeJournal.topFingerprints !== 'function') {
        return RECOVER_GAP_MS;
      }
      var tops = global.CrozzoOperativeJournal.topFingerprints(1, FP_WINDOW_MS);
      if (tops.length && tops[0].count >= 3) return RECOVER_GAP_URGENT_MS;
      return RECOVER_GAP_MS;
    }, RECOVER_GAP_MS);
  }

  function hintOnce(key, message, level) {
    if (!message) return;
    var lsKey = 'crozzo_z0_autoguard_hint_' + String(key || 'generic');
    var last = safe(function () {
      return Number(global.localStorage.getItem(lsKey)) || 0;
    }) || 0;
    if (last && Date.now() - last < 86400000) return;
    safe(function () {
      global.localStorage.setItem(lsKey, String(Date.now()));
    });
    safe(function () {
      if (typeof global.showToast === 'function') global.showToast(message, level || 'info');
    });
  }

  function maybePlainLanguageHint() {
    if (!__lastHealthyAt || Date.now() - __lastHealthyAt < STUCK_BEFORE_HINT_MS) return;
    if (__recoverAttempts < 2) return;
    safe(function () {
      if (!global.CrozzoHumanConnectivityPredict || typeof global.CrozzoHumanConnectivityPredict.predict !== 'function') {
        hintOnce(
          'sync_stuck',
          'La comunicación entre equipos tarda más de lo normal. Verifique Wi‑Fi del local y que la caja esté encendida.',
          'warning'
        );
        return;
      }
      var pack = global.CrozzoHumanConnectivityPredict.predict() || {};
      var list = pack.predictions || [];
      if (!list.length) {
        hintOnce(
          'sync_stuck',
          'Comunicación lenta: espere unos segundos o reinicie la app en este equipo.',
          'info'
        );
        return;
      }
      var top = list[0];
      hintOnce(top.id || 'human', top.message, top.severity === 'warn' ? 'warning' : 'info');
    });
  }

  async function softRecover(reason) {
    var now = Date.now();
    var gap = effectiveRecoverGap();
    if (now - __lastRecoverAt < gap) return false;
    __lastRecoverAt = now;
    __recoverAttempts++;
    journalRecord('recover_' + String(reason || 'tick'), { attempt: __recoverAttempts, gapMs: gap });
    safe(function () {
      if (typeof global.crozzoInvalidateCloudPingCache === 'function') global.crozzoInvalidateCloudPingCache();
    });
    try {
      if (typeof global.crozzoRunFullReconnectSync === 'function') {
        await global.crozzoRunFullReconnectSync({
          source: 'z0_autoguard_' + String(reason || 'tick'),
          skipPrint: true,
          force: false,
        });
      } else if (typeof global.crozzoActivateLocalSyncPath === 'function') {
        await global.crozzoActivateLocalSyncPath('z0_autoguard');
      }
    } catch (_) {}
    safe(function () {
      if (typeof global.crozzoEnsureCloudSyncActive === 'function') {
        global.crozzoEnsureCloudSyncActive({ source: 'z0_autoguard' }).catch(function () {});
      }
      if (global.CrozzoPageCloudWatch && typeof global.CrozzoPageCloudWatch.setPage === 'function') {
        var pg =
          typeof global.crozzoGetActivePageId === 'function'
            ? global.crozzoGetActivePageId()
            : global.currentPage;
        if (pg) global.CrozzoPageCloudWatch.setPage(pg);
      }
    });
    return true;
  }

  async function tick() {
    if (__inflight) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    __inflight = true;
    try {
      var snap = buildSnapshot();
      persistSnapshot(snap);
      if (!isZ0Active()) return;

      var tier = readTier();
      if (tier.healthy || tier.tier === 'healthy') {
        markHealthy();
        journalRecord('tier_healthy', snap);
        return;
      }
      if (tier.warm || tier.tier === 'warm') {
        return;
      }

      var transport = activeTransport();
      if (transport === 'none' && typeof global.crozzoWanOnline === 'function' && !global.crozzoWanOnline()) {
        safe(function () {
          if (typeof global.crozzoActivateLocalSyncPath === 'function') {
            global.crozzoActivateLocalSyncPath('z0_autoguard_offline').catch(function () {});
          }
        });
        journalRecord('offline_lan_path', { transport: transport });
        maybePlainLanguageHint();
        return;
      }

      journalRecord('tier_degraded', { tier: tier.tier, transport: transport });
      await softRecover(tier.tier || 'stale');
      var after = readTier();
      if (after.healthy || after.tier === 'healthy') markHealthy();
      else maybePlainLanguageHint();
      persistSnapshot(buildSnapshot());
    } finally {
      __inflight = false;
    }
  }

  function start() {
    if (__started) return;
    __started = true;
    __lastHealthyAt = Date.now();
    safe(function () {
      global.addEventListener('crozzo-tier-changed', function () {
        global.setTimeout(function () {
          tick().catch(function () {});
        }, 1200);
      });
      global.addEventListener('online', function () {
        global.setTimeout(function () {
          tick().catch(function () {});
        }, 2400);
      });
    });
    global.setTimeout(function () {
      tick().catch(function () {});
    }, 14000);
    __timer = global.setInterval(function () {
      tick().catch(function () {});
    }, TICK_MS);
  }

  function getSnapshot() {
    var cached = safe(function () {
      return JSON.parse(global.localStorage.getItem(LS_SNAP) || 'null');
    });
    return cached || buildSnapshot();
  }

  global.CrozzoZ0AutoGuard = {
    start: start,
    tick: tick,
    getSnapshot: getSnapshot,
  };
  global.crozzoZ0AutoGuardSnapshot = getSnapshot;
})(typeof window !== 'undefined' ? window : globalThis);
