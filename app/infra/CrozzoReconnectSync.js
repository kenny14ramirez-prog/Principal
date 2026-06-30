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

  function cloudBgAllowed(opts) {
    opts = opts || {};
    if (!opts.kind) {
      var src = String(opts.source || '');
      if (src === 'online') opts.kind = 'online';
      else if (/reconnect|recover|orchestrator|lan_up|page_watch|startup|postInit/i.test(src)) {
        opts.kind = 'reconnect';
      }
    }
    try {
      if (typeof global.crozzoCloudBackgroundSyncAllowed === 'function') {
        return global.crozzoCloudBackgroundSyncAllowed(opts);
      }
    } catch (_) {}
    return false;
  }

  function lanDrainAllowed() {
    try {
      if (typeof global.crozzoLanTransportAllowed === 'function') return global.crozzoLanTransportAllowed();
    } catch (_) {}
    return false;
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
    var cloudOk = cloudBgAllowed({ force: false });
    if (cloudOk) {
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
      if (typeof global.crozzoFlushReservorioSyncQueue === 'function') {
        try {
          var rf = global.crozzoFlushReservorioSyncQueue({ force: true, kind: 'reconnect_push', priority: 2 });
          if (rf && rf.mirrored) pushed += Number(rf.mirrored) || 0;
        } catch (_) {}
      }
      if (typeof global.syncOfflineQueue === 'function') {
        try {
          var sq = await global.syncOfflineQueue({ force: true, kind: 'reconnect_push', priority: 1 });
          if (sq && sq.pushed) pushed += Number(sq.pushed) || 0;
        } catch (_) {}
      }
      // Antes se re-empujaban TODAS las comandas locales aquí, lo que podía
      // RESUCITAR en la nube comandas ya cobradas/eliminadas (un equipo que vuelve
      // de estar apagado). Ahora solo drenamos el outbox: contiene únicamente las
      // comandas cuyo envío no se confirmó (las realmente pendientes), nunca las
      // ya entregadas. Lo obsoleto se limpia en el pull con reconcileStale.
      if (typeof global.crozzoFlushComandaOutbox === 'function') {
        try {
          global.crozzoFlushComandaOutbox();
        } catch (_) {}
      }
    }
    if (lanDrainAllowed() && global.CrozzoLanSyncBridge && typeof global.CrozzoLanSyncBridge.drainPendingOnce === 'function') {
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
    var cloudOk = cloudBgAllowed(opts);
    if (typeof global.crozzoResetRuntimeSyncDedup === 'function') {
      try {
        global.crozzoResetRuntimeSyncDedup();
      } catch (_) {}
    }
    if (cloudOk) {
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
          // reconcileStale: al reconectar, limpia comandas locales obsoletas
          // (ya cobradas/eliminadas en la nube) para no resucitarlas ni duplicarlas.
          if (await global.crozzoPullComandasFromCloud({ skipPrint: !!opts.skipPrint, skipRender: true, silent: true, reconcileStale: true })) pulled++;
        } catch (_) {}
      }
      if (typeof global.__crozzoRefreshCloudCatalogUi === 'function') {
        try {
          if (await global.__crozzoRefreshCloudCatalogUi({ skipRender: !!opts.skipRender })) pulled++;
        } catch (_) {}
      }
      if (typeof global.crozzoPullRemoteTenantState === 'function') {
        try {
          if (
            await global.crozzoPullRemoteTenantState({
              skipRender: true,
              quiet: true,
              force: true,
              kind: 'reconnect_pull',
            })
          ) {
            pulled++;
          }
        } catch (_) {}
      }
      if (typeof global.crozzoPullRemoteStaffState === 'function') {
        try {
          if (
            await global.crozzoPullRemoteStaffState({
              skipRender: true,
              quiet: true,
              force: true,
              kind: 'reconnect_pull',
            })
          ) {
            pulled++;
          }
        } catch (_) {}
      }
      if (typeof global.crozzoFlushPendingStaffSyncIfNeeded === 'function') {
        try {
          await global.crozzoFlushPendingStaffSyncIfNeeded();
        } catch (_) {}
      }
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
    if (cloudOk && typeof global.syncOfflineQueue === 'function') {
      try {
        await global.syncOfflineQueue({ force: true, kind: 'reconnect_pull', priority: 1 });
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
      } else if (cfg.role === 'B' && typeof global.CrozzoP2PDataHub.startClient === 'function') {
        var cloudOk =
          typeof global.crozzoOnlineConfigReady === 'function' && global.crozzoOnlineConfigReady();
        var lanOk = cfg.allowLan !== false && !!String(cfg.centralIp || '').trim();
        if (cloudOk || lanOk) await global.CrozzoP2PDataHub.startClient();
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
      try {
        if (typeof global.crozzoInvalidateCloudPingCache === 'function') {
          global.crozzoInvalidateCloudPingCache();
        }
      } catch (_) {}
      try {
        var thr0 = global.CrozzoCloudThrottle;
        if (thr0 && typeof thr0.maybeClearPressureOnHealthySignal === 'function') {
          thr0.maybeClearPressureOnHealthySignal('online_recovery');
        }
      } catch (_) {}
      logLine('🔄 Sync total (' + (opts.source || 'manual') + ')…');
      var cfgRec = md();
      if (cfgRec.role === 'B' && typeof global.crozzoHealRoleBCloudFromCaja === 'function') {
        try {
          await global.crozzoHealRoleBCloudFromCaja({ force: !!(opts.force || opts.source === 'online'), source: opts.source });
        } catch (_) {}
      }
      if (cfgRec.role === 'B' && cfgRec.allowLan !== false && typeof global.crozzoWifiZoneResolveCentral === 'function') {
        try {
          await global.crozzoWifiZoneResolveCentral({ force: !!(opts.force || opts.source === 'online') });
        } catch (_) {}
      }
      if (typeof global.crozzoActivateLocalSyncPath === 'function') {
        try {
          await global.crozzoActivateLocalSyncPath(String(opts.source || 'reconnect'));
        } catch (_) {}
      }
      var central = await centralAuthorityPush();
      if (cloudBgAllowed(opts)) {
        if (typeof global.crozzoEnsureCloudSyncActive === 'function') {
          try {
            await global.crozzoEnsureCloudSyncActive({ source: opts.source || 'reconnect', resetTableMissing: !!opts.force });
          } catch (_) {}
        } else if (typeof global.crozzoStartPosRuntimeCloudSync === 'function') {
          try {
            global.crozzoStartPosRuntimeCloudSync();
          } catch (_) {}
        }
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

  /**
   * Escalonado anti-estampida: ante un evento masivo (vuelve la luz/el router y
   * 100 dispositivos reconectan a la vez), cada equipo espera un retardo
   * DETERMINISTA por deviceId + un poco de azar, repartiendo la carga en el
   * tiempo en vez de golpear la nube/caja todos en el mismo instante.
   */
  function reconnectStaggerMs(base, spread) {
    var id = '';
    try {
      id = String(
        (global.localStorage && (global.localStorage.getItem('crozzo_device_id') || global.localStorage.getItem('device_id'))) || ''
      );
    } catch (_) {
      id = '';
    }
    var h = 0;
    for (var i = 0; i < id.length; i++) {
      h = (h * 31 + id.charCodeAt(i)) >>> 0;
    }
    var deterministic = spread > 0 ? h % spread : 0;
    var rand = Math.floor(Math.random() * 400);
    return (base || 0) + deterministic + rand;
  }

  function bindReconnectEvents() {
    if (global.__crozzoReconnectBound) return;
    global.__crozzoReconnectBound = true;
    global.addEventListener('online', function () {
      // Reparte la reconexion en ~6s entre dispositivos (estampida controlada).
      global.setTimeout(function () {
        runFullReconnectSync({ source: 'online', skipPrint: true }).catch(function () {});
      }, reconnectStaggerMs(700, 6000));
    });
    global.addEventListener('crozzo-lan-up', function () {
      // LAN es local (menos nodos): ventana de escalonado mas corta.
      global.setTimeout(function () {
        runFullReconnectSync({ source: 'lan_up', skipPrint: true }).catch(function () {});
      }, reconnectStaggerMs(150, 2500));
    });
  }
  global.crozzoReconnectStaggerMs = reconnectStaggerMs;

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
