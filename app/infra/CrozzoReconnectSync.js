/**
 * Sincronización total: PC central (Rol A) empuja → todos los dispositivos jalan.
 * Se dispara al volver internet, tras emparejar QR, o manualmente.
 */
(function (global) {
  'use strict';

  var __running = false;
  var __lastRun = 0;
  var DEBOUNCE_MS = 3200;

  function md() {
    return typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
  }

  function logLine(msg) {
    try {
      if (typeof global.crozzoWizardTierLogLine === 'function') global.crozzoWizardTierLogLine(msg);
    } catch (_) {}
  }

  async function lanReachable() {
    if (typeof global.crozzoProbeLocalLanReachable === 'function') {
      try {
        var p = await global.crozzoProbeLocalLanReachable();
        if (p && p.ok) return true;
      } catch (_) {}
    }
    if (typeof global.crozzoWifiZoneResolveCentral === 'function') {
      try {
        var r = await global.crozzoWifiZoneResolveCentral({ force: false });
        if (r && r.ip) return true;
      } catch (_) {}
    }
    return false;
  }

  async function centralAuthorityPush() {
    var cfg = md();
    if (cfg.role !== 'A') return { role: 'B', pushed: 0 };
    var pushed = 0;
    if (typeof global.crozzoPushPosRuntimeCloudNow === 'function') {
      try {
        if (await global.crozzoPushPosRuntimeCloudNow()) pushed++;
      } catch (_) {}
    }
    if (typeof global.crozzoSchedulePosRuntimeCloudPush === 'function') {
      try {
        global.crozzoSchedulePosRuntimeCloudPush('flush');
      } catch (_) {}
    }
    var router = global.__crozzoGetMultiSyncRouter && global.__crozzoGetMultiSyncRouter();
    if (router) {
      if (typeof router.drainPendingCloudMirror === 'function') {
        try {
          await router.drainPendingCloudMirror();
          pushed++;
        } catch (_) {}
      }
      if (typeof router.processQueue === 'function') {
        try {
          await router.processQueue();
        } catch (_) {}
      }
    }
    if (typeof global.syncOfflineQueue === 'function') {
      try {
        var sq = await global.syncOfflineQueue();
        if (sq && sq.pushed) pushed += Number(sq.pushed) || 0;
      } catch (_) {}
    }
    if (typeof global.crozzoPushComandasCloudByIds === 'function' && global.comandas && global.comandas.length) {
      try {
        var ids = [];
        for (var i = 0; i < global.comandas.length && ids.length < 80; i++) {
          if (global.comandas[i] && global.comandas[i].id != null) ids.push(global.comandas[i].id);
        }
        if (ids.length) global.crozzoPushComandasCloudByIds(ids);
      } catch (_) {}
    }
    if (global.CrozzoLanSyncBridge && typeof global.CrozzoLanSyncBridge.drainPendingOnce === 'function') {
      try {
        await global.CrozzoLanSyncBridge.drainPendingOnce();
      } catch (_) {}
    }
    return { role: 'A', pushed: pushed };
  }

  async function allDevicesPull(opts) {
    opts = opts || {};
    var pulled = 0;
    var lan = await lanReachable();
    if (typeof global.crozzoPullPosRuntimeCloud === 'function') {
      try {
        if (await global.crozzoPullPosRuntimeCloud({ quiet: true, skipRender: !!opts.skipRender })) pulled++;
      } catch (_) {}
    }
    if (typeof global.crozzoStartComandasCloudSync === 'function') {
      try {
        global.crozzoStartComandasCloudSync();
      } catch (_) {}
    }
    if (typeof global.crozzoPullComandasFromCloud === 'function') {
      try {
        if (await global.crozzoPullComandasFromCloud({ skipPrint: !!opts.skipPrint })) pulled++;
      } catch (_) {}
    }
    if (typeof global.__crozzoRefreshCloudCatalogUi === 'function') {
      try {
        if (await global.__crozzoRefreshCloudCatalogUi({ skipRender: !!opts.skipRender })) pulled++;
      } catch (_) {}
    }
    if (typeof global.crozzoPullRemoteTenantState === 'function') {
      try {
        if (await global.crozzoPullRemoteTenantState({ skipRender: true, quiet: true })) pulled++;
      } catch (_) {}
    }
    var router = global.__crozzoGetMultiSyncRouter && global.__crozzoGetMultiSyncRouter();
    if (router) {
      if (typeof router.runHealthChecks === 'function') {
        try {
          await router.runHealthChecks();
        } catch (_) {}
      }
      if (typeof router.processQueue === 'function') {
        try {
          await router.processQueue();
        } catch (_) {}
      }
    }
    if (typeof global.syncOfflineQueue === 'function') {
      try {
        await global.syncOfflineQueue();
      } catch (_) {}
    }
    if (global.CrozzoEmergencyMesh && typeof global.CrozzoEmergencyMesh.reconcileSafe === 'function') {
      try {
        await global.CrozzoEmergencyMesh.reconcileSafe();
      } catch (_) {}
    }
    return { pulled: pulled, lan: lan };
  }

  async function wireP2P() {
    var cfg = md();
    if (!global.CrozzoP2PDataHub) return;
    try {
      if (cfg.role === 'A' && typeof global.CrozzoP2PDataHub.startCentral === 'function') {
        await global.CrozzoP2PDataHub.startCentral();
      } else if (cfg.role === 'B' && cfg.allowLan !== false && typeof global.CrozzoP2PDataHub.startClient === 'function') {
        await global.CrozzoP2PDataHub.startClient();
      }
    } catch (_) {}
  }

  async function runFullReconnectSync(opts) {
    opts = opts || {};
    if (__running && !opts.force) return { ok: false, reason: 'busy' };
    if (!opts.force && Date.now() - __lastRun < DEBOUNCE_MS) {
      return { ok: false, reason: 'debounced' };
    }
    __running = true;
    __lastRun = Date.now();
    try {
      logLine('🔄 Sync total (' + (opts.source || 'manual') + ')…');
      var central = await centralAuthorityPush();
      if (typeof global.crozzoStartPosRuntimeCloudSync === 'function') {
        try {
          global.crozzoStartPosRuntimeCloudSync();
        } catch (_) {}
      }
      var pull = await allDevicesPull(opts);
      await wireP2P();
      if (global.CrozzoWifiZoneBridge && typeof global.CrozzoWifiZoneBridge.startWatch === 'function') {
        try {
          global.CrozzoWifiZoneBridge.startWatch();
        } catch (_) {}
      }
      if (typeof global.detectConnectivityTier === 'function' && typeof global.updateConnectivityTierBadge === 'function') {
        try {
          var tier = await global.detectConnectivityTier();
          global.updateConnectivityTierBadge(tier);
        } catch (_) {}
      }
      logLine(
        '✅ Sync total · central=' +
          (central.role === 'A' ? 'push' : 'cliente') +
          ' · LAN=' +
          (pull.lan ? 'sí' : 'no') +
          ' · pulls=' +
          pull.pulled
      );
      return { ok: true, central: central, pull: pull };
    } finally {
      __running = false;
    }
  }

  async function runFullReconnectSyncUi() {
    var r = await runFullReconnectSync({ force: true, source: 'ui', skipPrint: false });
    try {
      if (typeof global.showToast === 'function') {
        global.showToast(r && r.ok ? 'Sincronización actualizada' : 'Sin conexión por ahora — sigue en modo local', r && r.ok ? 'success' : 'info');
      }
    } catch (_) {}
    return r;
  }

  function bindReconnectEvents() {
    if (global.__crozzoReconnectBound) return;
    global.__crozzoReconnectBound = true;
    global.addEventListener('online', function () {
      global.setTimeout(function () {
        runFullReconnectSync({ source: 'online' }).catch(function () {});
      }, 900);
    });
    global.addEventListener('crozzo-lan-up', function () {
      runFullReconnectSync({ source: 'lan_up', skipPrint: true }).catch(function () {});
    });
  }

  global.CrozzoReconnectSync = {
    run: runFullReconnectSync,
    runFull: runFullReconnectSync,
    runUi: runFullReconnectSyncUi,
    centralPush: centralAuthorityPush,
    allPull: allDevicesPull,
    bind: bindReconnectEvents,
  };
  global.crozzoRunFullReconnectSync = runFullReconnectSync;
  global.crozzoRunFullReconnectSyncUi = runFullReconnectSyncUi;
  bindReconnectEvents();
})(typeof window !== 'undefined' ? window : globalThis);
