/**
 * Crozzo — Sincronización operativa por LAN (nivel 2 de la cascada).
 *
 * Espejo del comportamiento de la nube (CrozzoComandasCloudSync /
 * CrozzoPosRuntimeCloud / CrozzoCloudOpsPulse) pero SIN tocar esos módulos:
 * cuando Supabase no responde y la red local con la caja sigue viva, mantiene
 * comandas, mesas y estados en tiempo real vía HTTP + WebSocket LAN.
 *
 * Vías (se cubren entre sí, como en nube):
 *   a) WebSocket LAN instantáneo (CrozzoLanWebSocketBridge)
 *   b) Pulso LAN liviano (broadcast WS) → pull debounced
 *   c) Poll de respaldo runtime (/api/runtime) y comandas (/api/comandas)
 *   d) Cola durable del servidor Rust (pending + ACK)
 *
 * Transición automática:
 *   cloud → lan: arranca polls + WS; outbox de comandas sigue en localStorage
 *   lan → cloud: crozzoRunFullReconnectSync drena outbox + reconcileStale
 */
(function (global) {
  'use strict';

  var __started = false;
  var __runtimePoll = null;
  var __comandaPoll = null;
  var __watchdog = null;
  var __lastRxAt = 0;
  var __pullTimers = {};
  var __emitTimers = {};
  var __pendingEmit = {};
  var __lastComandaSig = '';
  var RUNTIME_POLL_MS = 5200;
  var COMANDA_POLL_MS = 3800;
  var COMANDA_POLL_FAST_MS = 2200;
  var WATCHDOG_MS = 22000;
  var PULL_DEBOUNCE_MS = 240;
  var EMIT_DEBOUNCE_MS = 320;
  var SILENCE_FORCE_MS = 14000;

  function safe(fn) {
    try {
      return fn();
    } catch (_) {
      return undefined;
    }
  }

  function tierNow() {
    return String(global.__CROZZO_TIER_LAST || 'offline');
  }

  function tierAllowsLan() {
    if (typeof global.crozzoDeferLocalSync === 'function' && global.crozzoDeferLocalSync()) return false;
    var t = tierNow();
    return t === 'lan' || t === 'hotspot';
  }

  function opRealtimeActive() {
    try {
      if (typeof global.crozzoOperationalRealtimeActive === 'function') {
        return global.crozzoOperationalRealtimeActive();
      }
    } catch (_) {}
    return false;
  }

  /** Solo tablets (Rol B) hacen poll runtime LAN; la caja usa CrozzoLanSyncBridge. */
  function rolePollsRuntime() {
    return md().role === 'B';
  }

  function md() {
    return typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
  }

  function lanHost() {
    var cfg = md();
    if (cfg.role === 'A') return '127.0.0.1';
    var ip = String(cfg.centralIp || '').trim();
    if (!ip) {
      try {
        ip = String(global.localStorage.getItem('crozzo_wifi_zone_last_ip') || '').trim();
      } catch (_) {}
    }
    return ip;
  }

  function lanPort() {
    return Number(md().port) || 3000;
  }

  function isDesktopTauri() {
    try {
      return !!(global.__TAURI__ && global.__TAURI__.core && typeof global.__TAURI__.core.invoke === 'function');
    } catch (_) {
      return false;
    }
  }

  function invoke(cmd, args) {
    return global.__TAURI__.core.invoke(cmd, args || {});
  }

  function comandaListSig(list) {
    if (!Array.isArray(list) || !list.length) return '';
    var parts = [];
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (!c || c.id == null) continue;
      parts.push(String(c.id) + ':' + String(c.estado || '') + ':' + String(c.lastUpdateAt || c.transaction_id || ''));
    }
    parts.sort();
    return parts.join('|');
  }

  function applyComandaSnap(snap, opts) {
    if (!snap || snap.id == null) return false;
    if (typeof global.__crozzoEmergencyApplyComandaSnapshot === 'function') {
      return !!global.__crozzoEmergencyApplyComandaSnapshot(snap, {
        source: 'lan_pull',
        skipPrint: !!(opts && opts.skipPrint),
        skipRender: !!(opts && opts.skipRender),
      });
    }
    return false;
  }

  function scheduleComandaUiRefresh() {
    try {
      if (typeof global.crozzoScheduleOperationalPageRefresh === 'function') {
        global.crozzoScheduleOperationalPageRefresh(global.currentPage);
        return;
      }
    } catch (_) {}
    if (
      (global.currentPage === 'comandas' || global.currentPage === 'cocina') &&
      typeof global.renderPage === 'function'
    ) {
      try {
        global.renderPage(global.currentPage, { background: true });
      } catch (_) {}
    }
  }

  async function pullComandasLan(opts) {
    opts = opts || {};
    if (!tierAllowsLan()) return false;
    var host = lanHost();
    if (!host) return false;
    var port = lanPort();
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller ? global.setTimeout(function () { controller.abort(); }, 5200) : null;
    try {
      var res = await global.fetch('http://' + host + ':' + port + '/api/comandas', {
        method: 'GET',
        signal: controller ? controller.signal : undefined,
        headers: { Accept: 'application/json' },
      });
      if (timer) global.clearTimeout(timer);
      if (!res.ok) return false;
      var j = await res.json().catch(function () { return null; });
      if (!j || !Array.isArray(j.comandas)) return false;
      var sig = comandaListSig(j.comandas);
      if (sig === __lastComandaSig && !opts.force) return false;
      var any = false;
      for (var i = 0; i < j.comandas.length; i++) {
        if (applyComandaSnap(j.comandas[i], opts)) any = true;
      }
      __lastComandaSig = sig;
      __lastRxAt = Date.now();
      if (any && !opts.skipRender) scheduleComandaUiRefresh();
      return any;
    } catch (_) {
      if (timer) global.clearTimeout(timer);
      return false;
    }
  }

  async function pullRuntimeLan(opts) {
    if (typeof global.crozzoPullPosRuntimeCloud === 'function') {
      var applied = await global.crozzoPullPosRuntimeCloud(opts || { quiet: true, skipRender: true });
      if (applied) __lastRxAt = Date.now();
      return applied;
    }
    return false;
  }

  function triggerPull(kind, opts) {
    if (__pullTimers[kind]) return;
    __pullTimers[kind] = global.setTimeout(function () {
      __pullTimers[kind] = null;
      if (!tierAllowsLan() || !opRealtimeActive()) return;
      if (kind === 'comanda') {
        pullComandasLan(opts || { skipPrint: false, skipRender: false }).catch(function () {});
      } else if (kind === 'runtime') {
        pullRuntimeLan({ quiet: true, skipRender: false })
          .then(function (applied) {
            if (applied && typeof global.crozzoHandleRemoteRuntimeUiSync === 'function') {
              global.crozzoHandleRemoteRuntimeUiSync();
            }
          })
          .catch(function () {});
      } else if (kind === 'all') {
        triggerPull('runtime', opts);
        triggerPull('comanda', opts);
      }
    }, PULL_DEBOUNCE_MS);
  }

  function handleLanPulse(payload) {
    if (!payload || !tierAllowsLan()) return;
    var myDev = '';
    safe(function () {
      myDev = String(
        (typeof global.ensureCrozzoDeviceId === 'function' && global.ensureCrozzoDeviceId()) ||
          md().deviceId ||
          ''
      ).trim();
    });
    if (myDev && payload.dev && String(payload.dev) === myDev) return;
    __lastRxAt = Date.now();
    var kind = String(payload.kind || '');
    if (kind === 'comanda' || kind === 'runtime') triggerPull(kind);
    else if (kind === 'all') triggerPull('all');
  }

  function doEmit(kind) {
    var dev = '';
    safe(function () {
      dev = String(
        (typeof global.ensureCrozzoDeviceId === 'function' && global.ensureCrozzoDeviceId()) ||
          md().deviceId ||
          ''
      ).trim();
    });
    var payload = { event: 'lan_ops_pulse', kind: kind, dev: dev, at: Date.now() };
    var body = JSON.stringify(payload);
    var cfg = md();
    if (cfg.role === 'A' && isDesktopTauri()) {
      invoke('crozzo_lan_ws_broadcast', { json: body }).catch(function () {});
      return;
    }
    var ip = lanHost();
    if (!ip || cfg.role !== 'B') return;
    try {
      global
        .fetch('http://' + ip + ':' + lanPort() + '/api/sync', {
          method: 'POST',
          headers:
            typeof global.crozzoLanAuthHeaders === 'function'
              ? global.crozzoLanAuthHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' })
              : { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ type: 'lan_ops_pulse', data: payload }),
        })
        .catch(function () {});
    } catch (_) {}
  }

  function emit(kind) {
    kind = String(kind || '').trim();
    if (kind !== 'comanda' && kind !== 'runtime' && kind !== 'all') return;
    if (!tierAllowsLan()) return;
    __pendingEmit[kind] = true;
    if (__emitTimers[kind]) return;
    __emitTimers[kind] = global.setTimeout(function () {
      __emitTimers[kind] = null;
      if (!__pendingEmit[kind]) return;
      __pendingEmit[kind] = false;
      doEmit(kind);
    }, EMIT_DEBOUNCE_MS);
  }

  /** Registra comandas locales en el snapshot de la caja (Rol A). Throttled. */
  async function seedCentralComandasFromLocal() {
    if (!isDesktopTauri() || md().role !== 'A') return 0;
    if (typeof global.crozzoLanTransportAllowed === 'function' && !global.crozzoLanTransportAllowed()) {
      return 0;
    }
    var list = global.comandas || [];
    if (!list.length) return 0;
    var port = lanPort();
    var n = 0;
    for (var i = 0; i < list.length && i < 24; i++) {
      var c = list[i];
      if (!c || c.id == null || String(c.estado || '') === 'entregada') continue;
      if (typeof global.crozzoLanTransportAllowed === 'function' && !global.crozzoLanTransportAllowed()) break;
      try {
        if (typeof global.crozzoLanPostSync === 'function') {
          var ok = await global.crozzoLanPostSync({
            uuid: String(c.transaction_id || c.id),
            type: 'comanda',
            data: c,
          });
          if (ok) n++;
          continue;
        }
      } catch (_) {}
    }
    return n;
  }

  function startPollLoops() {
    stopPollLoops();
    if (!tierAllowsLan()) return;
    if (rolePollsRuntime()) {
      __runtimePoll = global.setInterval(function () {
        if (!tierAllowsLan() || !opRealtimeActive()) return;
        try {
          if (typeof document !== 'undefined' && document.hidden) return;
        } catch (_) {}
        pullRuntimeLan({ quiet: true, skipRender: false })
          .then(function (applied) {
            if (applied && typeof global.crozzoHandleRemoteRuntimeUiSync === 'function') {
              global.crozzoHandleRemoteRuntimeUiSync();
            }
          })
          .catch(function () {});
      }, RUNTIME_POLL_MS);
    }
    var comMs = COMANDA_POLL_MS;
    __comandaPoll = global.setInterval(function () {
      if (!tierAllowsLan() || !opRealtimeActive()) return;
      try {
        if (typeof document !== 'undefined' && document.hidden) return;
      } catch (_) {}
      var stale = __lastRxAt ? Date.now() - __lastRxAt : Infinity;
      if (stale > SILENCE_FORCE_MS) {
        pullComandasLan({ skipPrint: false, skipRender: false, force: true }).catch(function () {});
      } else {
        pullComandasLan({ skipPrint: true, skipRender: true }).catch(function () {});
      }
    }, comMs);
  }

  function stopPollLoops() {
    if (__runtimePoll) {
      global.clearInterval(__runtimePoll);
      __runtimePoll = null;
    }
    if (__comandaPoll) {
      global.clearInterval(__comandaPoll);
      __comandaPoll = null;
    }
  }

  function startWatchdog() {
    if (__watchdog) return;
    __watchdog = global.setInterval(function () {
      if (!__started || !tierAllowsLan()) return;
      try {
        if (typeof document !== 'undefined' && document.hidden) return;
      } catch (_) {}
      if (global.CrozzoLanWebSocketBridge && typeof global.CrozzoLanWebSocketBridge.connect === 'function') {
        global.CrozzoLanWebSocketBridge.connect();
      }
      var silence = __lastRxAt ? Date.now() - __lastRxAt : Infinity;
      if (silence > WATCHDOG_MS && opRealtimeActive()) {
        triggerPull('all', { skipPrint: false, skipRender: false, force: true });
      }
    }, WATCHDOG_MS);
  }

  function stopWatchdog() {
    if (__watchdog) {
      global.clearInterval(__watchdog);
      __watchdog = null;
    }
  }

  function onTierChanged(ev) {
    var to = ev && ev.detail && ev.detail.to;
    if (to === 'lan' || to === 'hotspot') {
      startLanOpsSync('tier:' + to);
    } else if (to === 'cloud') {
      stopLanOpsSync();
      safe(function () {
        if (typeof global.crozzoRunFullReconnectSync === 'function') {
          global.crozzoRunFullReconnectSync({ source: 'lan_recover', skipPrint: true }).catch(function () {});
        }
      });
    } else if (to === 'offline' || to === 'mesh') {
      stopLanOpsSync();
    }
  }

  function startLanOpsSync(reason) {
    if (!tierAllowsLan()) {
      global.setTimeout(function () {
        if (tierAllowsLan()) startLanOpsSync(reason || 'retry');
      }, 1500);
      return;
    }
    if (__started) {
      safe(function () {
        if (global.CrozzoLanWebSocketBridge && typeof global.CrozzoLanWebSocketBridge.connect === 'function') {
          global.CrozzoLanWebSocketBridge.connect();
        }
      });
      return;
    }
    __started = true;
    __lastRxAt = Date.now();
    safe(function () {
      if (typeof global.crozzoWizardTierLogLine === 'function') {
        global.crozzoWizardTierLogLine('LAN ops sync activo' + (reason ? ' (' + reason + ')' : ''));
      }
    });
    safe(function () {
      if (global.CrozzoLanWebSocketBridge && typeof global.CrozzoLanWebSocketBridge.afterMainInit === 'function') {
        global.CrozzoLanWebSocketBridge.afterMainInit();
      }
    });
    seedCentralComandasFromLocal()
      .then(function (n) {
        if (n > 0 && typeof global.crozzoWizardTierLogLine === 'function') {
          global.crozzoWizardTierLogLine('LAN: ' + n + ' comanda(s) publicadas en caja');
        }
      })
      .catch(function () {});
    pullRuntimeLan({ quiet: true, skipRender: true })
      .then(function (applied) {
        if (applied && typeof global.crozzoHandleRemoteRuntimeUiSync === 'function') {
          global.crozzoHandleRemoteRuntimeUiSync();
        }
      })
      .catch(function () {});
    pullComandasLan({ skipPrint: true, skipRender: true, force: true }).catch(function () {});
    startPollLoops();
    startWatchdog();
  }

  function stopLanOpsSync() {
    if (!__started) return;
    __started = false;
    stopPollLoops();
    stopWatchdog();
    Object.keys(__pullTimers).forEach(function (k) {
      if (__pullTimers[k]) {
        global.clearTimeout(__pullTimers[k]);
        __pullTimers[k] = null;
      }
    });
  }

  function afterMainInit() {
    if (tierAllowsLan()) startLanOpsSync('init');
  }

  if (!global.__crozzoLanOpsTierBound) {
    global.__crozzoLanOpsTierBound = true;
    global.addEventListener('crozzo-tier-changed', onTierChanged);
    global.addEventListener('crozzo-lan-up', function () {
      if (tierAllowsLan()) startLanOpsSync('lan-up');
    });
  }

  global.crozzoLanOpsPulseEmit = emit;
  global.crozzoPullComandasFromLan = pullComandasLan;
  global.crozzoStartLanOpsSync = startLanOpsSync;
  global.crozzoStopLanOpsSync = stopLanOpsSync;
  global.__crozzoLanOpsHandlePulse = handleLanPulse;

  global.CrozzoLanOpsSync = {
    start: startLanOpsSync,
    stop: stopLanOpsSync,
    emit: emit,
    pullComandas: pullComandasLan,
    pullRuntime: pullRuntimeLan,
    seedCentralComandas: seedCentralComandasFromLocal,
    afterMainInit: afterMainInit,
    tierAllows: tierAllowsLan,
    rolePollsRuntime: rolePollsRuntime,
    status: function () {
      return {
        started: __started,
        tier: tierNow(),
        lastRxAt: __lastRxAt,
        lastRxAgoMs: __lastRxAt ? Date.now() - __lastRxAt : null,
      };
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
