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

  var EVAL_HEALTHY_MS = 15000; // nube/LAN estables: ritmo tranquilo
  var EVAL_DEGRADED_MS = 6000; // hotspot/malla/qr: mas agil
  var RECONNECT_MIN_GAP_MS = 8000; // evita tormentas de reconexion
  var MESH_AFTER_OFFLINE_MS = 4000; // tras caer todo, asegurar malla
  var QR_AFTER_ISOLATION_MS = 300000; // 5 min aislado sin nube antes de QR
  var QR_CLOUD_IMMEDIATE = true; // con nube viva + sin LAN: QR al instante (operacion)

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

  var __onceDone = {};

  function safe(fn) {
    try {
      return fn();
    } catch (e) {
      return undefined;
    }
  }

  /** Ejecuta una inicializacion pesada una sola vez por sesion (evita duplicar timers/listeners). */
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
      return safe(function () {
        return global.CrozzoAndroidNative.isAndroidApk();
      }) || false;
    }
    if (global.CrozzoDeviceForm && typeof global.CrozzoDeviceForm.isAndroidApk === 'function') {
      return safe(function () {
        return global.CrozzoDeviceForm.isAndroidApk();
      }) || false;
    }
    return false;
  }

  /** Solo una caja de escritorio (Windows/Tauri) puede crear su propia zona Wi-Fi. */
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
    // Escalonado anti-estampida: si muchos dispositivos recuperan a la vez,
    // cada uno reconecta con un retardo determinista por equipo.
    var delay = typeof global.crozzoReconnectStaggerMs === 'function' ? global.crozzoReconnectStaggerMs(0, 4000) : 0;
    global.setTimeout(function () {
      safe(function () {
        if (typeof global.crozzoRunFullReconnectSync === 'function') {
          global.crozzoRunFullReconnectSync({ source: 'orchestrator', reason: reason || '' }).catch(function () {});
        }
      });
    }, delay);
  }

  // --- Aseguradores de transporte por nivel ---

  function cloudCredentialsReady() {
    if (typeof global.crozzoOnlineConfigReady === 'function') {
      return global.crozzoOnlineConfigReady();
    }
    return !!global.__SUPABASE;
  }

  function ensureCloud() {
    __state.transports.cloud = true;
    safe(function () {
      if (typeof global.crozzoEnsureSedeLocationId === 'function') global.crozzoEnsureSedeLocationId();
    });
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
  }

  /** Nube solo cuando el nivel activo es cloud (hay internet/Supabase). Reservado para arranque manual. */
  function ensureCloudIfConfigured() {
    if (!cloudCredentialsReady()) return;
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
    safe(function () {
      if (typeof global.crozzoPullPosRuntimeCloud === 'function') {
        global.crozzoPullPosRuntimeCloud({ quiet: true, skipRender: false }).catch(function () {});
      }
      if (typeof global.crozzoPullComandasFromCloud === 'function') {
        global.crozzoPullComandasFromCloud({ skipPrint: true, skipRender: false }).catch(function () {});
      }
    });
  }

  function ensureWifiWatch() {
    // Vigilancia de la caja siempre activa (auto-adaptativa: tranquila si todo
    // va bien, agil al primer problema). Asi el rol B encuentra la caja/hotspot
    // aunque el dispositivo arranque directo en offline.
    safe(function () {
      if (global.CrozzoWifiZoneBridge && typeof global.CrozzoWifiZoneBridge.startWatch === 'function') {
        global.CrozzoWifiZoneBridge.startWatch();
      }
    });
  }

  function ensureHotspot() {
    __state.transports.hotspot = true;
    var role = roleNow();
    // La caja es la que despliega su zona Wi-Fi cuando se cae la LAN.
    if (role === 'A') {
      if (canDeployHotspot()) {
        safe(function () {
          if (typeof global.crozzoMaybeAutoStartHotspot === 'function') global.crozzoMaybeAutoStartHotspot();
        });
      } else {
        guideHotspotOnce();
      }
    } else {
      // Rol B: la vigilancia adaptativa (ensureWifiWatch) ya re-localiza la caja
      // en los gateways de hotspot; no duplicamos el sondeo forzado aqui.
      ensureWifiWatch();
    }
  }

  function guideHotspotOnce() {
    var now = Date.now();
    if (now - __hotspotGuidedAt < 300000) return; // 1 aviso cada 5 min
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
    ensureWifiWatch(); // sigue buscando la caja/hotspot aunque estemos en malla
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

  /** Sin enlace local con la caja/tablets (LAN/gateway). */
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

  /** Deriva el nivel de cascada a partir del tier del detector + duracion offline. */
  function levelFromTier(tier, info) {
    info = info || {};
    if (tier === 'cloud') {
      if (shouldSurfaceQrNow(tier, info)) return 'qr';
      return 'cloud';
    }
    if (tier === 'lan') return 'lan';
    if (tier === 'hotspot') return 'hotspot';
    // offline / unknown -> malla; con nube viva + sin LAN -> QR de inmediato
    if (shouldSurfaceQrNow(tier, info)) return 'qr';
    var now = Date.now();
    if (!__offlineSince) __offlineSince = now;
    var dur = now - __offlineSince;
    if (dur >= QR_AFTER_ISOLATION_MS) return 'qr';
    if (dur >= MESH_AFTER_OFFLINE_MS) return 'mesh';
    return 'mesh';
  }

  function wanUp() {
    return typeof global.navigator !== 'undefined' && !!global.navigator.onLine;
  }

  function cloudFirstMode() {
    return typeof global.crozzoCloudFirstSyncEnabled === 'function' && global.crozzoCloudFirstSyncEnabled();
  }

  function applyLevel(level) {
    // Reinicia banderas de transporte; se vuelven a fijar segun el nivel activo.
    __state.transports = { cloud: false, lan: false, hotspot: false, mesh: false, qr: false };

    // Fase 1 — nube full: con internet (Wi‑Fi o datos) solo Supabase; LAN/malla en fase 2.
    if (cloudFirstMode() && wanUp() && cloudCredentialsReady()) {
      guideLevelOnce('cloud');
      ensureCloud();
      if (shouldSurfaceQrNow(__state.detectorTier || 'cloud', __lastDetectInfo)) {
        ensureQrLastResort();
      }
      return;
    }

    guideLevelOnce(level);

    if (level === 'cloud') {
      ensureCloud();
      ensureWifiWatch();
      return;
    }
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
      ensureHotspot(); // intenta que la caja levante hotspot mientras tanto
      ensureMesh();
      return;
    }
    if (level === 'qr') {
      if (cloudRecoveryReady()) ensureCloud();
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

      __state.detectorTier = tier;
      __state.reason = reason;
      __state.role = roleNow();
      __state.canDeployHotspot = canDeployHotspot();
      __state.lastEvalAt = Date.now();

      if (level !== prev) {
        __state.level = level;
        __state.since = Date.now();
        applyLevel(level);
        emitChange(prev, level);
        // Recuperación hacia nube/LAN mejor.
        if (prev !== 'unknown' && levelRank(level) < levelRank(prev)) {
          maybeReconnect('recover:' + level);
        }
        // Degradación (ej. tablet perdio internet pero sigue en Wi‑Fi de caja).
        else if (
          prev !== 'unknown' &&
          levelRank(level) > levelRank(prev) &&
          levelRank(prev) <= levelRank('cloud')
        ) {
          maybeReconnect('degrade:' + level);
        }
      } else {
        // Mismo nivel: re-asegura el transporte por si algun watcher se detuvo.
        applyLevel(level);
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
    // Reacciona de inmediato a cambios de red/visibilidad.
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
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', function () {
          if (!document.hidden) onNetEvent();
        });
      }
    });
  }

  function start() {
    if (__started) return;
    __started = true;
    bindEvents();
    // Descubrimiento de la caja siempre activo desde el arranque (cubre el caso
    // de un rol B que inicia directo en offline y nunca paso por LAN).
    ensureWifiWatch();
    // Primera evaluacion inmediata, luego bucle adaptativo.
    evaluate()
      .catch(function () {})
      .then(scheduleNext, scheduleNext);
  }

  function stop() {
    __started = false;
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
