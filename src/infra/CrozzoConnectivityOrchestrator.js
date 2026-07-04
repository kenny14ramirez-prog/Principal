/**
 * Crozzo — Orquestador de conectividad (cascada automatica de 5 niveles).
 *
 * Coordina los puentes existentes (no los reemplaza) bajo una sola maquina de
 * estados. Evalua el mejor nivel disponible y garantiza que el/los transporte(s)
 * correctos esten activos, escalando y desescalando de forma automatica:
 *
 *   1 cloud    -> Supabase (internet)
 *   2 lan      -> misma red local con la caja
 *   3 hotspot  -> la caja despliega su zona Wi-Fi (Windows) o guia para activarla
 *   4 mesh     -> malla offline (gossip UDP / BLE / WebRTC) sin Wi-Fi conocido
 *   5 qr       -> QR de emparejamiento (ultimo recurso; cada 4 h en la caja)
 *
 * Regla de prioridad (exclusiva por nivel activo):
 *   ¿Internet + Supabase?  -> todo a la nube
 *   ¿No? ¿Misma red/caja?  -> LAN local (:3000, WebSocket, P2P)
 *   ¿No?                   -> caja despliega hotspot Wi-Fi
 *   ¿No?                   -> malla entre tablets (gossip UDP + BLE + WebRTC)
 *
 * Bluetooth nativo queda como fase futura; su lugar lo ocupa la malla offline.
 * Todo va envuelto en try/catch y respeta document.hidden para no afectar la
 * operacion.
 */
(function (global) {
  'use strict';

  // ── Intervalos de evaluación ─────────────────────────────────────────────
  // EVAL_HEALTHY_MS  : cuando todo va bien, evaluar cada 10 s (no saturar).
  // EVAL_DEGRADED_MS : cuando hay problemas, evaluar cada 8 s.
  //   ANTES era 3 s → causaba flapping cloud↔lan con red intermitente:
  //   el detector oscilaba entre tiers en cada ciclo, abriendo y cerrando
  //   el canal realtime de comandas continuamente (loop SUBSCRIBED→CLOSED).
  //   Con 8 s el sistema tiene tiempo de estabilizarse antes de actuar.
  var EVAL_HEALTHY_MS = 10000;
  var EVAL_DEGRADED_MS = 8000;

  var RECONNECT_MIN_GAP_MS = 5000;
  var MESH_AFTER_OFFLINE_MS = 800;
  var QR_AFTER_ISOLATION_MS = 120000;
  var QR_CLOUD_IMMEDIATE = true;

  // ── Hold de estabilidad antes de bajar de cloud a lan ───────────────────
  // Si el tier baja de 'cloud' a 'lan' pero vuelve a 'cloud' dentro de este
  // tiempo, se cancela el stopCloudTransports() — evita cerrar el canal
  // realtime por un parpadeo de red de pocos segundos.
  var CLOUD_TO_LAN_HOLD_MS = 12000;
  var __cloudToLanHoldTimer = null;
  var __pendingStopCloud = false;

  var LEVELS = ['cloud', 'lan', 'hotspot', 'mesh', 'qr'];

  var __started = false;
  var __timer = null;
  var __evaluating = false;
  var __lastReconnectAt = 0;
  var __offlineSince = 0;
  var __qrSurfacedForOffline = false;
  var __hotspotGuidedAt = 0;
  var __meshGuidedAt = 0;
  var __levelToastAt = 0;
  var __lastLevelToast = '';
  var DEGRADE_HOLD_MS = 10000;

  var __state = {
    level: 'unknown',
    detectorTier: 'unknown',
    reason: '',
    role: 'A',
    canDeployHotspot: false,
    since: 0,
    lastEvalAt: 0,
    transports: { cloud: false, lan: false, hotspot: false, mesh: false, qr: false },
  };

  var __lastHybridHealAt = 0;
  var HYBRID_HEAL_GAP_MS = 90000;
  var __onceDone = {};

  function safe(fn) {
    try {
      return fn();
    } catch (e) {
      return undefined;
    }
  }

  function runOnce(key, fn) {
    if (__onceDone[key]) return;
    __onceDone[key] = true;
    safe(fn);
  }

  function isTauri() {
    return !!(global.__TAURI__ || global.__TAURI_INTERNALS__ || global.__CROZZO_IS_TAURI__);
  }

  function isAndroidApk() {
    if (global.CrozzoAndroidNative && typeof global.CrozzoAndroidNative.isAndroidApk === 'function') {
      return safe(function () { return global.CrozzoAndroidNative.isAndroidApk(); }) || false;
    }
    if (global.CrozzoDeviceForm && typeof global.CrozzoDeviceForm.isAndroidApk === 'function') {
      return safe(function () { return global.CrozzoDeviceForm.isAndroidApk(); }) || false;
    }
    return false;
  }

  function canDeployHotspot() {
    return isTauri() && !isAndroidApk();
  }

  function roleNow() {
    var r = safe(function () {
      return (global.getMultiDeviceConfig && global.getMultiDeviceConfig().role) || '';
    });
    if (r === 'A' || r === 'B') return r;
    var r2 = safe(function () {
      return typeof global.crozzoSyncRoleNow === 'function' ? global.crozzoSyncRoleNow() : '';
    });
    return r2 === 'B' ? 'B' : 'A';
  }

  function detectTier() {
    if (global.CrozzoSyncRouterModule && typeof global.CrozzoSyncRouterModule.detectConnectivityTier === 'function') {
      return global.CrozzoSyncRouterModule.detectConnectivityTier();
    }
    if (typeof global.detectConnectivityTier === 'function') {
      return global.detectConnectivityTier();
    }
    return Promise.resolve({ tier: String(global.__CROZZO_TIER_LAST || 'offline'), reason: 'sin detector' });
  }

  function emitChange(prev, next) {
    safe(function () {
      global.dispatchEvent(
        new CustomEvent('crozzo-tier-changed', {
          detail: { from: prev, to: next, state: getState() },
        })
      );
    });
  }

  function maybeReconnect(reason) {
    var now = Date.now();
    if (now - __lastReconnectAt < RECONNECT_MIN_GAP_MS) return;
    __lastReconnectAt = now;
    var delay = typeof global.crozzoReconnectStaggerMs === 'function' ? global.crozzoReconnectStaggerMs(0, 4000) : 0;
    global.setTimeout(function () {
      safe(function () {
        if (typeof global.crozzoRunFullReconnectSync === 'function') {
          global.crozzoRunFullReconnectSync({ source: 'orchestrator', reason: reason || '' }).catch(function () {});
        }
      });
    }, delay);
  }

  function cloudCredentialsReady() {
    if (typeof global.crozzoOnlineConfigReady === 'function') {
      return global.crozzoOnlineConfigReady();
    }
    return !!global.__SUPABASE;
  }

  function cloudSyncAllowedNow() {
    try {
      if (typeof global.crozzoTierAllowsCloudSync === 'function') {
        return global.crozzoTierAllowsCloudSync();
      }
    } catch (_) {}
    return false;
  }

  // ── cancelCloudToLanHold ─────────────────────────────────────────────────
  // Si el tier vuelve a 'cloud' antes de que expire el hold, cancela el
  // stopCloudTransports() pendiente — el canal realtime no se cierra.
  function cancelCloudToLanHold() {
    if (__cloudToLanHoldTimer) {
      global.clearTimeout(__cloudToLanHoldTimer);
      __cloudToLanHoldTimer = null;
    }
    __pendingStopCloud = false;
  }

  function stopCloudTransports() {
    __state.transports.cloud = false;
    safe(function () {
      if (typeof global.crozzoStopComandasCloudSync === 'function') global.crozzoStopComandasCloudSync();
    });
    safe(function () {
      if (typeof global.crozzoStopPosRuntimeCloudSync === 'function') global.crozzoStopPosRuntimeCloudSync();
    });
    safe(function () {
      if (global.CrozzoCloudOpsPulse && typeof global.CrozzoCloudOpsPulse.stop === 'function') {
        global.CrozzoCloudOpsPulse.stop();
      }
    });
  }

  // ── stopCloudTransportsDeferred ──────────────────────────────────────────
  // Versión con hold: espera CLOUD_TO_LAN_HOLD_MS antes de ejecutar
  // stopCloudTransports(). Si en ese tiempo el tier vuelve a 'cloud',
  // cancelCloudToLanHold() lo cancela y el canal realtime sigue vivo.
  // Esto elimina el loop SUBSCRIBED→CLOSED por parpadeos de red cortos.
  function stopCloudTransportsDeferred() {
    if (__pendingStopCloud) return; // ya hay un hold en curso
    __pendingStopCloud = true;
    __cloudToLanHoldTimer = global.setTimeout(function () {
      __cloudToLanHoldTimer = null;
      __pendingStopCloud = false;
      // Solo ejecutar si el nivel actual sigue siendo no-cloud.
      if (__state.level !== 'cloud') {
        stopCloudTransports();
      }
    }, CLOUD_TO_LAN_HOLD_MS);
  }

  global.crozzoStopCloudTransportsQuiet = stopCloudTransports;

  function ensureCloud() {
    // Si había un hold de stop pendiente, cancelarlo — el cloud sigue activo.
    cancelCloudToLanHold();
    if (!cloudSyncAllowedNow()) {
      stopCloudTransports();
      return;
    }
    __state.transports.cloud = true;
    safe(function () {
      if (typeof global.crozzoEnsureSedeLocationId === 'function') global.crozzoEnsureSedeLocationId();
    });
    var rtOk =
      typeof global.crozzoCloudBackgroundSyncAllowed === 'function'
        ? global.crozzoCloudBackgroundSyncAllowed()
        : true;
    if (!rtOk) {
      stopCloudTransports();
      return;
    }
    if (typeof global.crozzoEnsureCloudSyncActive === 'function') {
      safe(function () {
        global.crozzoEnsureCloudSyncActive({ source: 'orchestrator' }).catch(function () {});
      });
    }
    safe(function () {
      if (typeof global.crozzoStartPosRuntimeCloudSync === 'function') global.crozzoStartPosRuntimeCloudSync();
    });
    safe(function () {
      if (typeof global.crozzoStartComandasCloudSync === 'function') global.crozzoStartComandasCloudSync();
    });
    safe(function () {
      if (typeof global.crozzoStartOpsPulse === 'function') global.crozzoStartOpsPulse();
    });
  }

  function ensureCloudIfConfigured() {
    if (!cloudCredentialsReady() || !cloudSyncAllowedNow()) return;
    if (global.__SUPABASE) {
      ensureCloud();
      return;
    }
    safe(function () {
      if (typeof global.crozzoEnsureCloudClientReady !== 'function') return;
      global.crozzoEnsureCloudClientReady().then(function (ok) {
        if (ok) ensureCloud();
      });
    });
  }

  global.crozzoEnsureCloudIfConfigured = ensureCloudIfConfigured;

  function guideLevelOnce(level) {
    if (level !== 'mesh' && level !== 'qr') return;
    if (__state.level === level && __state.since && Date.now() - __state.since < DEGRADE_HOLD_MS) return;
    var now = Date.now();
    if (__lastLevelToast === level && now - __levelToastAt < 120000) return;
    __lastLevelToast = level;
    __levelToastAt = now;
    var msg = '';
    if (level === 'cloud') {
      msg = 'Conectado a internet — sincronización con la base de datos en la nube.';
    } else if (level === 'lan') {
      msg = 'Sin nube — comunicación con la caja por la red local (Wi‑Fi/LAN).';
    } else if (level === 'hotspot') {
      msg = 'Sin router — conecte las tablets al hotspot Wi‑Fi de la caja.';
    } else if (level === 'mesh') {
      msg =
        'Sin internet ni Wi‑Fi de caja — malla entre tablets activa. Bluetooth próximamente; mantenga tablets cerca.';
    } else if (level === 'qr') {
      msg = cloudRecoveryReady()
        ? 'Nube activa pero tablets sin enlace — use el QR de emparejamiento de la caja (renueva cada 4 h).'
        : 'Aislamiento prolongado — escanee el QR de emparejamiento en la caja para reconectar.';
    }
    if (!msg || typeof global.showToast !== 'function') return;
    safe(function () {
      global.showToast(msg, level === 'cloud' || level === 'lan' ? 'info' : 'warning');
    });
  }

  function wireLanP2P() {
    var cfg = roleNow();
    if (!global.CrozzoP2PDataHub) return;
    safe(function () {
      if (cfg === 'A' && typeof global.CrozzoP2PDataHub.startCentral === 'function') {
        global.CrozzoP2PDataHub.startCentral().catch(function () {});
      } else if (cfg === 'B' && typeof global.CrozzoP2PDataHub.startClient === 'function') {
        global.CrozzoP2PDataHub.startClient().catch(function () {});
      }
    });
  }

  function ensureLan() {
    __state.transports.lan = true;
    ensureWifiWatch();
    runOnce('lan_bridge', function () {
      if (global.CrozzoLanSyncBridge) {
        if (typeof global.CrozzoLanSyncBridge.afterMainInit === 'function') {
          global.CrozzoLanSyncBridge.afterMainInit();
        } else if (typeof global.CrozzoLanSyncBridge.syncFromConfig === 'function') {
          global.CrozzoLanSyncBridge.syncFromConfig().catch(function () {});
        }
      }
    });
    runOnce('lan_ws', function () {
      if (global.CrozzoLanWebSocketBridge && typeof global.CrozzoLanWebSocketBridge.afterMainInit === 'function') {
        global.CrozzoLanWebSocketBridge.afterMainInit();
      }
    });
    runOnce('lan_p2p', wireLanP2P);
    runOnce('lan_ops_sync', function () {
      if (global.CrozzoLanOpsSync && typeof global.CrozzoLanOpsSync.afterMainInit === 'function') {
        global.CrozzoLanOpsSync.afterMainInit();
      } else if (typeof global.crozzoStartLanOpsSync === 'function') {
        global.crozzoStartLanOpsSync('orchestrator');
      }
    });
    runOnce('central_failover', function () {
      if (global.CrozzoCentralFailover && typeof global.CrozzoCentralFailover.afterMainInit === 'function') {
        global.CrozzoCentralFailover.afterMainInit();
      }
    });
    safe(function () {
      if (typeof global.crozzoPullPosRuntimeCloud === 'function') {
        global.crozzoPullPosRuntimeCloud({ quiet: true, skipRender: true }).catch(function () {});
      }
      if (typeof global.crozzoPullComandasFromCloud === 'function') {
        global.crozzoPullComandasFromCloud({ skipPrint: true, skipRender: true, silent: true }).catch(function () {});
      }
    });
  }

  function ensureWifiWatch() {
    safe(function () {
      if (global.CrozzoWifiZoneBridge && typeof global.CrozzoWifiZoneBridge.startWatch === 'function') {
        global.CrozzoWifiZoneBridge.startWatch();
      }
    });
  }

  function ensureHotspot() {
    __state.transports.hotspot = true;
    var role = roleNow();
    if (role === 'A') {
      if (canDeployHotspot()) {
        safe(function () {
          if (typeof global.crozzoMaybeAutoStartHotspot === 'function') global.crozzoMaybeAutoStartHotspot();
        });
      } else {
        guideHotspotOnce();
      }
    } else {
      ensureWifiWatch();
    }
  }

  function guideHotspotOnce() {
    var now = Date.now();
    if (now - __hotspotGuidedAt < 300000) return;
    __hotspotGuidedAt = now;
    safe(function () {
      if (typeof global.showToast === 'function') {
        global.showToast(
          'Sin red: active la zona Wi-Fi (hotspot) de la caja para que las tablets se reconecten.',
          'warning'
        );
      }
    });
  }

  function guideMeshOnce() {
    var now = Date.now();
    if (now - __meshGuidedAt < 300000) return;
    __meshGuidedAt = now;
    safe(function () {
      if (typeof global.showToast === 'function') {
        global.showToast(
          'Modo malla: las tablets se buscan entre sí para replicar comandas. Acérquelas o active Bluetooth cuando esté disponible.',
          'warning'
        );
      }
    });
  }

  function ensureMesh() {
    __state.transports.mesh = true;
    ensureWifiWatch();
    guideMeshOnce();
    runOnce('mesh_gossip', function () {
      if (global.CrozzoOfflineGossip && typeof global.CrozzoOfflineGossip.afterMainInit === 'function') {
        global.CrozzoOfflineGossip.afterMainInit();
      }
    });
    runOnce('mesh_emergency', function () {
      if (global.CrozzoEmergencyMesh && typeof global.CrozzoEmergencyMesh.init === 'function') {
        global.CrozzoEmergencyMesh.init();
      }
    });
    runOnce('mesh_ble', function () {
      if (global.CrozzoBleMesh && typeof global.CrozzoBleMesh.afterMainInit === 'function') {
        global.CrozzoBleMesh.afterMainInit();
      }
      if (global.CrozzoBleMesh && typeof global.CrozzoBleMesh.start === 'function') {
        global.CrozzoBleMesh.start().catch(function () {});
      }
    });
    runOnce('mesh_ble_probe', function () {
      safe(function () {
        if (global.CrozzoBleMesh && typeof global.CrozzoBleMesh.requestBluetoothEnable === 'function') {
          global.CrozzoBleMesh.requestBluetoothEnable().catch(function () {});
        } else if (global.CrozzoAndroidNative && typeof global.CrozzoAndroidNative.requestBluetoothEnable === 'function') {
          global.CrozzoAndroidNative.requestBluetoothEnable().catch(function () {});
        }
      });
    });
  }

  function ensureQrLastResort() {
    __state.transports.qr = true;
    safe(function () {
      if (global.CrozzoInternalQrRegistry) {
        if (typeof global.CrozzoInternalQrRegistry.ensureOwnSlot === 'function') {
          global.CrozzoInternalQrRegistry.ensureOwnSlot(false);
        }
        if (typeof global.CrozzoInternalQrRegistry.startEmergencyLoop === 'function') {
          global.CrozzoInternalQrRegistry.startEmergencyLoop();
        }
      } else if (global.CrozzoDailyPairing) {
        if (typeof global.CrozzoDailyPairing.ensureCurrent === 'function') {
          global.CrozzoDailyPairing.ensureCurrent(false);
        } else if (typeof global.CrozzoDailyPairing.ensureToday === 'function') {
          global.CrozzoDailyPairing.ensureToday(false);
        }
      }
    });
    if (__qrSurfacedForOffline) return;
    __qrSurfacedForOffline = true;
    safe(function () {
      if (global.CrozzoDailyPairing && typeof global.CrozzoDailyPairing.surfaceLastResort === 'function') {
        global.CrozzoDailyPairing.surfaceLastResort();
      }
    });
  }

  function cloudRecoveryReady() {
    if (!wanUp() || !cloudCredentialsReady()) return false;
    if (global.__SUPABASE) return true;
    if (typeof global.crozzoTierAllowsCloudSync === 'function' && global.crozzoTierAllowsCloudSync()) return true;
    return false;
  }

  function devicesTransportLost(info, tier) {
    info = info || {};
    if (info.lanReach === true || info.gwReach === true) return false;
    if (tier === 'lan' || tier === 'hotspot') return false;
    return true;
  }

  function shouldSurfaceQrNow(tier, info) {
    if (!QR_CLOUD_IMMEDIATE || !cloudRecoveryReady()) return false;
    return devicesTransportLost(info, tier);
  }

  function levelFromTier(tier, info) {
    info = info || {};
    if (tier === 'cloud') {
      if (shouldSurfaceQrNow(tier, info)) return 'qr';
      return 'cloud';
    }
    if (tier === 'lan') return 'lan';
    if (tier === 'hotspot') return 'hotspot';
    if (info.lanReach === true || info.gwReach === true) return 'lan';
    try {
      if (typeof global.crozzoIsLocalLanSegmentUp === 'function' && global.crozzoIsLocalLanSegmentUp()) {
        return 'lan';
      }
    } catch (_) {}
    if (shouldSurfaceQrNow(tier, info)) return 'qr';
    var now = Date.now();
    if (!__offlineSince) __offlineSince = now;
    var dur = now - __offlineSince;
    if (dur >= QR_AFTER_ISOLATION_MS) return 'qr';
    if (dur >= MESH_AFTER_OFFLINE_MS) return 'mesh';
    return 'mesh';
  }

  function wanUp() {
    if (typeof global.crozzoWanLikely === 'function') return global.crozzoWanLikely();
    if (typeof global.crozzoWanOnline === 'function') return global.crozzoWanOnline();
    return typeof global.navigator !== 'undefined' && !!global.navigator.onLine;
  }

  function cloudFirstMode() {
    return typeof global.crozzoCloudFirstSyncEnabled === 'function' && global.crozzoCloudFirstSyncEnabled();
  }

  function lanEvidenceForLevel(level, info) {
    info = info || __lastDetectInfo || {};
    if (level === 'lan' || level === 'hotspot') return true;
    var dt = String(__state.detectorTier || '');
    if (dt === 'lan' || dt === 'hotspot') return true;
    if (info.lanReach === true || info.gwReach === true) return true;
    if (info.cloudPingFailed || info.cloudDegraded) return true;
    return false;
  }

  function runtimeSyncHybrid() {
    try {
      if (typeof global.config !== 'undefined' && global.config.get) {
        var m = String(global.config.get('runtimeSyncModo') || 'hybrid').toLowerCase();
        return m === 'hybrid';
      }
    } catch (_) {}
    return true;
  }

  function ensureMeshStandbyQuiet() {
    safe(function () {
      if (global.CrozzoDeviceMind && typeof global.CrozzoDeviceMind.ensureMeshStandby === 'function') {
        global.CrozzoDeviceMind.ensureMeshStandby();
      } else if (global.CrozzoOfflineGossip && typeof global.CrozzoOfflineGossip.ensureStandby === 'function') {
        global.CrozzoOfflineGossip.ensureStandby();
      }
    });
  }

  function directorState() {
    try {
      if (global.CrozzoConnectivityDirector && typeof global.CrozzoConnectivityDirector.getState === 'function') {
        return global.CrozzoConnectivityDirector.getState();
      }
    } catch (_) {}
    return null;
  }

  function wantCloudTransport(info) {
    info = info || __lastDetectInfo || {};
    if (!cloudCredentialsReady()) return false;
    if (cloudSyncAllowedNow()) return true;
    if (!runtimeSyncHybrid()) return false;
    var role = roleNow();
    if (role === 'A' && wanUp()) {
      return typeof global.crozzoOnlineConfigReady === 'function' && global.crozzoOnlineConfigReady();
    }
    if (
      role === 'B' &&
      wanUp() &&
      typeof global.crozzoHybridWanEvidence === 'function' &&
      global.crozzoHybridWanEvidence()
    ) {
      return typeof global.crozzoOnlineConfigReady === 'function' && global.crozzoOnlineConfigReady();
    }
    var tier = String(__state.detectorTier || '');
    if (tier === 'cloud' && wanUp()) {
      return typeof global.crozzoOnlineConfigReady === 'function' && global.crozzoOnlineConfigReady();
    }
    if (cloudRecoveryReady() && cloudSyncAllowedNow()) return true;
    return false;
  }

  function applyParallelTransports(level, info) {
    info = info || __lastDetectInfo || {};
    __state.transports = { cloud: false, lan: false, hotspot: false, mesh: false, qr: false };

    if (
      cloudFirstMode() &&
      level === 'cloud' &&
      wanUp() &&
      cloudCredentialsReady() &&
      wantCloudTransport(info) &&
      !lanEvidenceForLevel(level, info)
    ) {
      guideLevelOnce('cloud');
      ensureCloud();
      if (shouldSurfaceQrNow(__state.detectorTier || 'cloud', info)) {
        ensureQrLastResort();
      }
      if (runtimeSyncHybrid()) ensureMeshStandbyQuiet();
      return;
    }

    guideLevelOnce(level);
    var role = roleNow();
    var tier = String(__state.detectorTier || '');
    var lanUp = lanEvidenceForLevel(level, info);
    var ds = directorState();

    if (wantCloudTransport(info)) {
      var funnel =
        typeof global.crozzoShouldFunnelCloudThroughHub === 'function' && global.crozzoShouldFunnelCloudThroughHub();
      if (!funnel) {
        ensureCloud();
      }
      ensureWifiWatch();
    } else {
      // En modo híbrido, bajar a LAN no apaga cloud de inmediato:
      // se usa el hold diferido para evitar cerrar el canal realtime
      // por un parpadeo de red corto.
      if (runtimeSyncHybrid() && (level === 'lan' || level === 'hotspot')) {
        stopCloudTransportsDeferred();
      } else {
        stopCloudTransports();
      }
    }

    if (role === 'A' || lanUp || level === 'lan' || level === 'hotspot' || tier === 'lan' || tier === 'hotspot') {
      ensureLan();
    }
    if (ds && (ds.mode === 'lan_client' || ds.mode === 'lan_seek' || ds.relayViaCentral)) {
      ensureLan();
    }

    if (level === 'hotspot' || level === 'mesh' || level === 'qr') {
      ensureHotspot();
    } else if (role === 'B' && !lanUp && (level === 'mesh' || tier === 'offline')) {
      ensureHotspot();
    }

    if (level === 'mesh' || level === 'qr') {
      if (!lanUp) {
        ensureMesh();
      } else {
        runOnce('mesh_qr_backup', function () {
          if (global.CrozzoOfflineGossip && typeof global.CrozzoOfflineGossip.ensureActiveForQr === 'function') {
            global.CrozzoOfflineGossip.ensureActiveForQr();
          }
        });
      }
    }

    if (level === 'qr' || shouldSurfaceQrNow(tier, info)) {
      ensureQrLastResort();
    }

    if (runtimeSyncHybrid() && tier === 'cloud' && lanUp && role === 'B') {
      safe(function () {
        if (typeof global.crozzoActivateLocalSyncPath === 'function') {
          global.crozzoActivateLocalSyncPath('hybrid_cloud_lan').catch(function () {});
        }
      });
    }

    if (runtimeSyncHybrid() && role === 'B' && typeof global.crozzoHealRoleBCloudFromCaja === 'function') {
      var healNow = Date.now();
      if (healNow - __lastHybridHealAt >= HYBRID_HEAL_GAP_MS) {
        __lastHybridHealAt = healNow;
        safe(function () {
          global.crozzoHealRoleBCloudFromCaja({ source: 'orchestrator_hybrid' }).catch(function () {});
        });
      }
    }

    if (
      runtimeSyncHybrid() &&
      (level === 'cloud' || level === 'lan' || level === 'hotspot' || tier === 'cloud' || tier === 'lan' || tier === 'hotspot')
    ) {
      ensureMeshStandbyQuiet();
    }

    if (role === 'A' && global.CrozzoBrainPolicy && typeof global.CrozzoBrainPolicy.enforceBrainServe === 'function') {
      safe(function () {
        global.CrozzoBrainPolicy.enforceBrainServe({ quiet: true }).catch(function () {});
      });
    } else if (role === 'B' && global.CrozzoBrainPolicy && typeof global.CrozzoBrainPolicy.applyBorrowSeek === 'function') {
      var dsMode = ds && ds.mode ? ds.mode : '';
      if (!lanUp || dsMode === 'lan_seek' || dsMode === 'isolated') {
        safe(function () {
          global.CrozzoBrainPolicy.applyBorrowSeek({ quiet: true }).catch(function () {});
        });
      }
    }

    safe(function () {
      if (
        global.CrozzoHumanConnectivityPredict &&
        typeof global.CrozzoHumanConnectivityPredict.runRecovery === 'function'
      ) {
        global.CrozzoHumanConnectivityPredict.runRecovery({ quiet: true }).catch(function () {});
      }
    });
  }

  function applyLevel(level) {
    if (runtimeSyncHybrid()) {
      applyParallelTransports(level, __lastDetectInfo);
      return;
    }
    __state.transports = { cloud: false, lan: false, hotspot: false, mesh: false, qr: false };

    if (
      cloudFirstMode() &&
      level === 'cloud' &&
      wanUp() &&
      cloudCredentialsReady() &&
      cloudSyncAllowedNow() &&
      !lanEvidenceForLevel(level, __lastDetectInfo)
    ) {
      guideLevelOnce('cloud');
      ensureCloud();
      if (shouldSurfaceQrNow(__state.detectorTier || 'cloud', __lastDetectInfo)) {
        ensureQrLastResort();
      }
      return;
    }

    guideLevelOnce(level);

    if (level === 'cloud') {
      if (cloudSyncAllowedNow()) {
        ensureCloud();
        ensureWifiWatch();
      } else {
        stopCloudTransports();
      }
      return;
    }
    // En modo no-híbrido, bajar de cloud a lan también usa el hold diferido.
    stopCloudTransportsDeferred();
    if (level === 'lan') {
      ensureLan();
      return;
    }
    if (level === 'hotspot') {
      ensureLan();
      ensureHotspot();
      return;
    }
    if (level === 'mesh') {
      if (lanEvidenceForLevel('lan', __lastDetectInfo)) ensureLan();
      ensureHotspot();
      ensureMesh();
      return;
    }
    if (level === 'qr') {
      if (cloudRecoveryReady() && cloudSyncAllowedNow()) ensureCloud();
      ensureMesh();
      ensureQrLastResort();
      return;
    }
  }

  function levelRank(level) {
    var i = LEVELS.indexOf(level);
    return i < 0 ? LEVELS.length : i;
  }

  var __lastDetectInfo = null;
  var __lastApplyAt = 0;
  var ENSURE_STABLE_MS = 45000;

  function transportsHealthy(level) {
    if (level === 'cloud') return !!__state.transports.cloud;
    if (level === 'lan' || level === 'hotspot') return !!__state.transports.lan;
    if (level === 'mesh') return !!__state.transports.mesh;
    if (level === 'qr') return !!__state.transports.qr;
    return false;
  }

  function ensureLevelStable(level) {
    var now = Date.now();
    if (level === __state.level && now - __lastApplyAt < ENSURE_STABLE_MS && transportsHealthy(level)) {
      return;
    }
    __lastApplyAt = now;
    applyLevel(level);
  }

  async function evaluate() {
    if (__evaluating) return;
    if (safe(function () {
      return typeof document !== 'undefined' && document.hidden;
    })) {
      return;
    }
    __evaluating = true;
    try {
      var info = await detectTier();
      __lastDetectInfo = info || null;
      var tier = (info && info.tier) || String(global.__CROZZO_TIER_LAST || 'offline');
      var reason = (info && (info.reason || info.details)) || '';
      if (tier === 'cloud' || tier === 'lan' || tier === 'hotspot') {
        if (!shouldSurfaceQrNow(tier, info)) {
          __offlineSince = 0;
          __qrSurfacedForOffline = false;
          safe(function () {
            if (global.CrozzoInternalQrRegistry && typeof global.CrozzoInternalQrRegistry.stopEmergencyLoop === 'function') {
              global.CrozzoInternalQrRegistry.stopEmergencyLoop();
            }
          });
        }
      }
      var level = levelFromTier(tier, info);
      var prev = __state.level;
      var prevSince = __state.since;

      __state.detectorTier = tier;
      __state.reason = reason;
      __state.role = roleNow();
      __state.canDeployHotspot = canDeployHotspot();
      __state.lastEvalAt = Date.now();

      if (level !== prev) {
        __state.level = level;
        __state.since = Date.now();
        applyLevel(level);
        __lastApplyAt = Date.now();
        emitChange(prev, level);
        if (level === 'cloud') {
          // Al recuperar cloud, cancelar cualquier hold de stop pendiente.
          cancelCloudToLanHold();
          global.setTimeout(function () {
            safe(function () {
              var thr = global.CrozzoCloudThrottle;
              if (thr && typeof thr.maybeClearPressureOnHealthySignal === 'function') {
                thr.maybeClearPressureOnHealthySignal('tier_cloud');
              }
            });
          }, typeof global.crozzoReconnectStaggerMs === 'function' ? global.crozzoReconnectStaggerMs(600, 2500) : 1200);
        }
        if (prev !== 'unknown' && levelRank(level) < levelRank(prev)) {
          maybeReconnect('recover:' + level);
        } else if (
          prev !== 'unknown' &&
          levelRank(level) > levelRank(prev) &&
          levelRank(prev) <= levelRank('cloud') &&
          prevSince &&
          Date.now() - prevSince >= DEGRADE_HOLD_MS
        ) {
          maybeReconnect('degrade:' + level);
        }
      } else {
        ensureLevelStable(level);
      }
    } catch (e) {
      safe(function () {
        console.warn('[orchestrator] evaluate', e);
      });
    } finally {
      __evaluating = false;
    }
  }

  function scheduleNext() {
    if (!__started) return;
    if (__timer) clearTimeout(__timer);
    var degraded = __state.level !== 'cloud' && __state.level !== 'lan';
    var delay = degraded ? EVAL_DEGRADED_MS : EVAL_HEALTHY_MS;
    __timer = global.setTimeout(function () {
      evaluate()
        .catch(function () {})
        .then(scheduleNext, scheduleNext);
    }, delay);
  }

  function onNetEvent() {
    evaluate().catch(function () {});
  }

  function bindEvents() {
    safe(function () {
      global.addEventListener('online', onNetEvent);
      global.addEventListener('offline', function () {
        safe(function () {
          if (typeof global.crozzoInvalidateCloudPingCache === 'function') {
            global.crozzoInvalidateCloudPingCache();
          }
        });
        onNetEvent();
      });
      global.addEventListener('crozzo-lan-up', onNetEvent);
      global.addEventListener('crozzo-connectivity-director-changed', onNetEvent);
      global.addEventListener('crozzo-detector-tier-changed', onNetEvent);
      global.addEventListener('crozzo-capabilities-changed', onNetEvent);
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', function () {
          if (!document.hidden) onNetEvent();
        });
      }
    });
  }

  function start() {
    if (__started) return;
    try {
      if (global.__CROZZO_FIELD_TEST_QUIET && !global.__CROZZO_FIELD_TEST_LAN_ACTIVE) return;
    } catch (_) {}
    __started = true;
    bindEvents();
    safe(function () {
      if (global.CrozzoConnectivityDirector && typeof global.CrozzoConnectivityDirector.start === 'function') {
        global.CrozzoConnectivityDirector.start();
      }
      if (global.CrozzoCapabilityMatrix && typeof global.CrozzoCapabilityMatrix.start === 'function') {
        global.CrozzoCapabilityMatrix.start();
      }
      if (global.CrozzoBrainPolicy && typeof global.CrozzoBrainPolicy.start === 'function') {
        global.CrozzoBrainPolicy.start();
      }
    });
    ensureWifiWatch();
    evaluate()
      .catch(function () {})
      .then(scheduleNext, scheduleNext);
  }

  function stop() {
    __started = false;
    cancelCloudToLanHold();
    if (__timer) {
      clearTimeout(__timer);
      __timer = null;
    }
  }

  function getState() {
    return {
      level: __state.level,
      detectorTier: __state.detectorTier,
      reason: __state.reason,
      role: __state.role,
      canDeployHotspot: __state.canDeployHotspot,
      since: __state.since,
      ageMs: __state.since ? Date.now() - __state.since : 0,
      lastEvalAt: __state.lastEvalAt,
      transports: {
        cloud: __state.transports.cloud,
        lan: __state.transports.lan,
        hotspot: __state.transports.hotspot,
        mesh: __state.transports.mesh,
        qr: __state.transports.qr,
      },
    };
  }

  global.CrozzoConnectivityOrchestrator = {
    start: start,
    stop: stop,
    evaluateNow: function () {
      return evaluate();
    },
    getState: getState,
    LEVELS: LEVELS.slice(),
  };
})(typeof window !== 'undefined' ? window : globalThis);
