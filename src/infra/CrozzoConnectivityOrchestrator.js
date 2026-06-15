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
 *   4 mesh     -> malla offline (gossip UDP / WebRTC) sin Wi-Fi conocido
 *   5 qr       -> QR del dia para re-emparejar (ultimo recurso)
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
  var QR_AFTER_ISOLATION_MS = 90000; // aislamiento prolongado -> ofrecer QR del dia

  var LEVELS = ['cloud', 'lan', 'hotspot', 'mesh', 'qr'];

  var __started = false;
  var __timer = null;
  var __evaluating = false;
  var __lastReconnectAt = 0;
  var __offlineSince = 0;
  var __qrSurfacedForOffline = false;
  var __hotspotGuidedAt = 0;

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

  function ensureCloud() {
    __state.transports.cloud = true;
    // Las funciones start* ya son idempotentes (no-op si ya arrancaron).
    safe(function () {
      if (typeof global.crozzoStartPosRuntimeCloudSync === 'function') global.crozzoStartPosRuntimeCloudSync();
    });
    safe(function () {
      if (typeof global.crozzoStartComandasCloudSync === 'function') global.crozzoStartComandasCloudSync();
    });
  }

  function ensureLan() {
    __state.transports.lan = true;
    ensureWifiWatch();
    runOnce('lan_ws', function () {
      if (global.CrozzoLanWebSocketBridge && typeof global.CrozzoLanWebSocketBridge.afterMainInit === 'function') {
        global.CrozzoLanWebSocketBridge.afterMainInit();
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

  function ensureMesh() {
    __state.transports.mesh = true;
    ensureWifiWatch(); // sigue buscando la caja/hotspot aunque estemos en malla
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
  }

  function ensureQrLastResort() {
    __state.transports.qr = true;
    if (__qrSurfacedForOffline) return;
    __qrSurfacedForOffline = true;
    safe(function () {
      if (global.CrozzoDailyPairing && typeof global.CrozzoDailyPairing.surfaceLastResort === 'function') {
        global.CrozzoDailyPairing.surfaceLastResort();
      }
    });
  }

  /** Deriva el nivel de cascada a partir del tier del detector + duracion offline. */
  function levelFromTier(tier) {
    if (tier === 'cloud') return 'cloud';
    if (tier === 'lan') return 'lan';
    if (tier === 'hotspot') return 'hotspot';
    // offline / unknown -> malla, y si el aislamiento persiste -> qr
    var now = Date.now();
    if (!__offlineSince) __offlineSince = now;
    var dur = now - __offlineSince;
    if (dur >= QR_AFTER_ISOLATION_MS) return 'qr';
    if (dur >= MESH_AFTER_OFFLINE_MS) return 'mesh';
    return 'mesh';
  }

  function applyLevel(level) {
    // Reinicia banderas de transporte; se vuelven a fijar segun el nivel activo.
    __state.transports = { cloud: false, lan: false, hotspot: false, mesh: false, qr: false };
    if (level === 'cloud') {
      ensureCloud();
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
      ensureMesh();
      ensureQrLastResort();
      return;
    }
  }

  function levelRank(level) {
    var i = LEVELS.indexOf(level);
    return i < 0 ? LEVELS.length : i;
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
      var tier = (info && info.tier) || String(global.__CROZZO_TIER_LAST || 'offline');
      var reason = (info && (info.reason || info.details)) || '';
      if (tier === 'cloud' || tier === 'lan' || tier === 'hotspot') {
        __offlineSince = 0;
        __qrSurfacedForOffline = false;
      }
      var level = levelFromTier(tier);
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
        // Si recuperamos a un nivel mejor (mas cerca de la nube), resincroniza.
        if (prev !== 'unknown' && levelRank(level) < levelRank(prev)) {
          maybeReconnect('recover:' + level);
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
      global.addEventListener('offline', onNetEvent);
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
