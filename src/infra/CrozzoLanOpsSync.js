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
  var __standbyTimer = null;
  var __standbyMode = false;
  var STANDBY_TICK_MS = 18000;
  var __lastRxAt = 0;
  var __pullTimers = {};
  var __emitTimers = {};
  var __pendingEmit = {};
  var __pendingDelta = {};
  var __lastComandaSig = '';
  var RUNTIME_POLL_MS = 650;
  var COMANDA_POLL_MS = 1800;
  var COMANDA_POLL_FAST_MS = 1400;
  var WATCHDOG_MS = 16000;
  var PULL_DEBOUNCE_MS = 120;
  var EMIT_DEBOUNCE_MS = 180;
  var SILENCE_FORCE_MS = 9000;
  /** Si WS OPEN y RX reciente: el poll HTTP suave cede (anti-solape). Force/silence siguen. */
  var WS_FRESH_SKIP_POLL_MS = 4800;
  var ANCHOR_SILENCE_EVENT_MS = 18000;
  var ANCHOR_SILENCE_COOLDOWN_MS = 28000;
  var __skippedSoftPolls = 0;
  var __lastSilenceEventAt = 0;
  var __lastRemoteDigest = '';
  var __skippedDigestMatch = 0;

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

  function noteRx(_via) {
    __lastRxAt = Date.now();
  }

  function lanWsOpen() {
    try {
      return !!(
        global.CrozzoLanWebSocketBridge &&
        typeof global.CrozzoLanWebSocketBridge.isOpen === 'function' &&
        global.CrozzoLanWebSocketBridge.isOpen()
      );
    } catch (_) {
      return false;
    }
  }

  /** WS sano + RX fresco → no competir con poll HTTP suave. */
  function softPollCoveredByWs() {
    if (!lanWsOpen() || !__lastRxAt) return false;
    return Date.now() - __lastRxAt < WS_FRESH_SKIP_POLL_MS;
  }

  function getPathHealth() {
    var ago = __lastRxAt ? Date.now() - __lastRxAt : null;
    var ws = lanWsOpen();
    var silence = ago == null ? Infinity : ago;
    var transport = 'poll';
    if (ws && silence < WS_FRESH_SKIP_POLL_MS) transport = 'ws_primary';
    else if (silence < SILENCE_FORCE_MS) transport = 'hybrid_poll';
    else if (silence < ANCHOR_SILENCE_EVENT_MS) transport = 'force_heal';
    else transport = 'anchor_silence';
    var peers = fleetPeerEstimate();
    var scale = fleetScalePollFactor();
    return {
      started: __started,
      tier: tierNow(),
      wsOpen: ws,
      lastRxAt: __lastRxAt,
      lastRxAgoMs: ago,
      softPollSkipped: __skippedSoftPolls,
      digestSkipped: __skippedDigestMatch,
      transport: transport,
      healthy: !!(ws && silence < SILENCE_FORCE_MS),
      fleetPeersEst: peers,
      pollScaleFactor: scale,
      runtimePollMs: runtimePollMs(),
      comandaPollMs: comandaPollMs(),
    };
  }

  function healAnchorSilence(silenceMs) {
    if (Date.now() - __lastSilenceEventAt < ANCHOR_SILENCE_COOLDOWN_MS) return;
    __lastSilenceEventAt = Date.now();
    safe(function () {
      global.dispatchEvent(
        new CustomEvent('crozzo-lan-anchor-silence', {
          detail: {
            silenceMs: silenceMs,
            role: md().role,
            health: getPathHealth(),
          },
        })
      );
    });
    /* S-04: escalonar connect+pull por deviceId — N tablets no golpean la caja a la vez. */
    var staggerMs = 0;
    try {
      staggerMs =
        typeof global.crozzoReconnectStaggerMs === 'function'
          ? global.crozzoReconnectStaggerMs(0, 800)
          : Math.floor(Math.random() * 800);
    } catch (_) {
      staggerMs = Math.floor(Math.random() * 800);
    }
    global.setTimeout(function () {
      safe(function () {
        if (global.CrozzoLanWebSocketBridge && typeof global.CrozzoLanWebSocketBridge.connect === 'function') {
          global.CrozzoLanWebSocketBridge.connect();
        }
      });
      triggerPull('all', { skipPrint: false, skipRender: false, force: true });
      if (silenceMs > ANCHOR_SILENCE_EVENT_MS && md().role === 'B') {
        safe(function () {
          if (global.CrozzoOfflineGossip && typeof global.CrozzoOfflineGossip.ensureStandby === 'function') {
            global.CrozzoOfflineGossip.ensureStandby();
          } else if (global.CrozzoOfflineGossip && typeof global.CrozzoOfflineGossip.start === 'function') {
            global.CrozzoOfflineGossip.start();
          }
        });
      }
    }, staggerMs);
  }

  function tierAllowsLan() {
    if (typeof global.crozzoDeferLocalSync === 'function' && global.crozzoDeferLocalSync()) return false;
    var t = tierNow();
    if (t === 'lan' || t === 'hotspot') return true;
    if (t === 'cloud') {
      try {
        var last = global.__CROZZO_LAN_LAST_OK;
        var cfg = md();
        if (
          cfg.role === 'B' &&
          cfg.allowLan !== false &&
          last &&
          Date.now() - last < 55000 &&
          typeof global.crozzoLanTransportAllowed === 'function' &&
          global.crozzoLanTransportAllowed()
        ) {
          return true;
        }
      } catch (_) {}
      if (typeof global.crozzoCloudWanReady === 'function' && global.crozzoCloudWanReady()) return false;
      return true;
    }
    if (t === 'offline' || t === 'mesh') {
      try {
        if (typeof global.crozzoIsLocalLanSegmentUp === 'function' && global.crozzoIsLocalLanSegmentUp()) return true;
      } catch (_) {}
      var cfg = md();
      if (cfg.role === 'A') return true;
      return !!(String(cfg.centralIp || '').trim());
    }
    return false;
  }

  function lanSyncAllowed(opts) {
    opts = opts || { kind: 'transport' };
    try {
      if (typeof global.crozzoLocalSyncAllowed === 'function') {
        return global.crozzoLocalSyncAllowed(opts);
      }
    } catch (_) {}
    if (!tierAllowsLan()) return false;
    if (opts.force) return true;
    if (opts.kind === 'realtime') {
      try {
        if (typeof global.crozzoOperationalRealtimeActive === 'function') {
          return global.crozzoOperationalRealtimeActive();
        }
      } catch (_) {}
    }
    return true;
  }

  function opRealtimeActive() {
    return lanSyncAllowed({ kind: 'realtime' });
  }

  /** Transporte LAN activo: en Z0 híbrido siempre paralelo a nube. */
  function lanOpsTransportPrimary() {
    try {
      if (typeof global.crozzoZ0HybridParallelLan === 'function' && global.crozzoZ0HybridParallelLan()) {
        return true;
      }
      if (typeof global.crozzoActiveSyncTransport === 'function') {
        return global.crozzoActiveSyncTransport({ kind: 'transport' }) === 'lan';
      }
    } catch (_) {}
    if (typeof global.crozzoCloudOperationalRealtimeHealthy === 'function') {
      if (global.crozzoCloudOperationalRealtimeHealthy(12000)) return false;
    }
    return tierAllowsLan();
  }

  function shouldRunLanOps() {
    if (!opRealtimeActive()) return false;
    try {
      if (typeof global.crozzoZ0HybridParallelLan === 'function' && global.crozzoZ0HybridParallelLan()) {
        return lanSyncAllowed({ kind: 'transport', force: true });
      }
    } catch (_) {}
    if (!lanSyncAllowed({ kind: 'transport' })) return false;
    if (!lanOpsTransportPrimary()) return false;
    return true;
  }

  /** Realtime nube sano → polls/pulsos LAN en standby (excepto Z0 híbrido paralelo). */
  function cloudRealtimeStandby() {
    try {
      if (typeof global.crozzoZ0HybridParallelLan === 'function' && global.crozzoZ0HybridParallelLan()) {
        return false;
      }
      if (typeof global.crozzoCloudOperationalRealtimeHealthy === 'function') {
        return global.crozzoCloudOperationalRealtimeHealthy(12000);
      }
    } catch (_) {}
    return false;
  }

  /** WS + sonda suave cuando nube primaria pero segmento LAN emparejado. */
  function shouldRunLanStandby() {
    try {
      if (typeof global.crozzoLanWsStandbyActive === 'function' && global.crozzoLanWsStandbyActive()) {
        if (deferLocalSyncNow()) return true;
        if (typeof global.crozzoCloudOperationalRealtimeHealthy === 'function') {
          return !global.crozzoCloudOperationalRealtimeHealthy(32000);
        }
      }
    } catch (_) {}
    return false;
  }

  function deferLocalSyncNow() {
    try {
      if (typeof global.crozzoDeferLocalSync === 'function') return global.crozzoDeferLocalSync();
    } catch (_) {}
    return false;
  }

  function startLanStandby(reason) {
    if (__standbyTimer) return;
    __standbyMode = true;
    safe(function () {
      if (global.CrozzoLanWebSocketBridge && typeof global.CrozzoLanWebSocketBridge.connect === 'function') {
        global.CrozzoLanWebSocketBridge.connect();
      }
    });
    __standbyTimer = global.setInterval(function () {
      if (!shouldRunLanStandby()) {
        stopLanStandby();
        if (shouldRunLanOps()) startLanOpsSync('standby_exit');
        return;
      }
      safe(function () {
        if (global.CrozzoLanWebSocketBridge && typeof global.CrozzoLanWebSocketBridge.connect === 'function') {
          global.CrozzoLanWebSocketBridge.connect();
        }
      });
      try {
        if (
          typeof global.crozzoCloudOperationalRealtimeHealthy === 'function' &&
          !global.crozzoCloudOperationalRealtimeHealthy(35000)
        ) {
          pullComandasLan({ skipPrint: true, skipRender: true, force: false }).catch(function () {});
        }
      } catch (_) {}
    }, STANDBY_TICK_MS);
    safe(function () {
      if (typeof global.crozzoWizardTierLogLine === 'function') {
        global.crozzoWizardTierLogLine('LAN standby' + (reason ? ' (' + reason + ')' : ''));
      }
    });
  }

  function stopLanStandby() {
    if (__standbyTimer) {
      global.clearInterval(__standbyTimer);
      __standbyTimer = null;
    }
    __standbyMode = false;
  }

  function activeOpsPage() {
    try {
      if (global.CrozzoPageCloudWatch && typeof global.CrozzoPageCloudWatch.getActivePage === 'function') {
        var p = global.CrozzoPageCloudWatch.getActivePage();
        if (p) return p;
      }
    } catch (_) {}
    return String(global.currentPage || '');
  }

  function pagePollMs(fallback) {
    fallback = fallback || COMANDA_POLL_MS;
    try {
      var pri = global.CrozzoCloudSyncPriorities;
      if (!pri || typeof pri.resolvePageSyncPlan !== 'function') return fallback;
      var plan = pri.resolvePageSyncPlan(activeOpsPage());
      var ms = plan.registry && plan.registry.intervalMs;
      if (ms && ms >= 400) return ms;
    } catch (_) {}
    return fallback;
  }

  /**
   * Estimación de flota para backoff de poll (techo diseño 100).
   * Con muchos peers, el poll HTTP debe ceder más: WS lleva el peso.
   */
  function fleetPeerEstimate() {
    var n = 1;
    try {
      if (global.CrozzoPeerDirectory && typeof global.CrozzoPeerDirectory.list === 'function') {
        var list = global.CrozzoPeerDirectory.list() || [];
        n = Math.max(n, list.length + 1);
      }
    } catch (_) {}
    try {
      var fs = global.CrozzoFleetCommState && global.CrozzoFleetCommState.getSnapshot
        ? global.CrozzoFleetCommState.getSnapshot()
        : null;
      if (fs && typeof fs.peerCount === 'number') n = Math.max(n, (fs.peerCount || 0) + 1);
    } catch (_) {}
    return n;
  }

  /** Factor ≥1: estira intervalos de poll cuando la flota crece (anti-tormenta 100-dev). */
  function fleetScalePollFactor() {
    var n = fleetPeerEstimate();
    if (n >= 60) return 2.4;
    if (n >= 40) return 2.0;
    if (n >= 20) return 1.55;
    if (n >= 10) return 1.25;
    return 1;
  }

  function runtimePollMs() {
    var pageMs = pagePollMs(5000);
    var base = Math.max(700, Math.min(RUNTIME_POLL_MS, Math.floor(pageMs / 5)));
    return Math.min(3200, Math.floor(base * fleetScalePollFactor()));
  }

  function comandaPollMs() {
    var base = Math.max(COMANDA_POLL_FAST_MS, Math.min(COMANDA_POLL_MS, pagePollMs(COMANDA_POLL_MS)));
    return Math.min(4800, Math.floor(base * fleetScalePollFactor()));
  }

  /** Digest local anti-entropy (count + maxAt + hash ids) — patrón Pouch sin CRDT. */
  function localComandasDigest() {
    var list = global.comandas || [];
    var ids = [];
    var maxAt = 0;
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (!c || c.id == null) continue;
      if (String(c.estado || '') === 'entregada') continue;
      var key = String(c.transaction_id || c.id);
      ids.push(key);
      var t = Date.parse(c.lastUpdateAt || c.createdAt || 0) || 0;
      if (t > maxAt) maxAt = t;
    }
    ids.sort();
    var h = 2166136261;
    for (var j = 0; j < ids.length; j++) {
      var s = ids[j] + '|';
      for (var k = 0; k < s.length; k++) {
        h ^= s.charCodeAt(k);
        h = Math.imul(h, 16777619);
      }
    }
    return {
      count: ids.length,
      maxAt: maxAt,
      hash: (h >>> 0).toString(16),
    };
  }

  function digestKey(d) {
    if (!d) return '';
    return String(d.count || 0) + ':' + String(d.maxAt || 0) + ':' + String(d.hash || '');
  }

  async function fetchOpsDigest() {
    var host = lanHost();
    if (!host) return null;
    var port = lanPort();
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller
      ? global.setTimeout(function () {
          controller.abort();
        }, 2200)
      : null;
    try {
      var res = await global.fetch('http://' + host + ':' + port + '/api/ops-digest', {
        method: 'GET',
        signal: controller ? controller.signal : undefined,
        headers: { Accept: 'application/json' },
      });
      if (timer) global.clearTimeout(timer);
      if (!res.ok) return null;
      var j = await res.json().catch(function () {
        return null;
      });
      if (!j || j.ok === false) return null;
      return j;
    } catch (_) {
      if (timer) global.clearTimeout(timer);
      return null;
    }
  }

  /** true = digests iguales → omitir soft pull. */
  async function remoteDigestMatchesLocal() {
    var remote = await fetchOpsDigest();
    if (!remote) return false;
    __lastRemoteDigest = digestKey(remote);
    var local = localComandasDigest();
    /* count+hash bastan (maxAt ISO vs epoch puede divergir entre Rust/JS). */
    return (
      Number(remote.count) === Number(local.count) &&
      String(remote.hash || '') === String(local.hash || '')
    );
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
    opts = opts || {};
    var payload = { type: 'comanda', data: snap };
    if (typeof global.crozzoLanShouldApplyAction === 'function' && !opts.force) {
      var gate = global.crozzoLanShouldApplyAction(payload, { source: 'lan_pull' });
      if (!gate.apply) return false;
    }
    if (typeof global.__crozzoEmergencyApplyComandaSnapshot === 'function') {
      var ok = !!global.__crozzoEmergencyApplyComandaSnapshot(snap, {
        source: 'lan_pull',
        skipPrint: !!opts.skipPrint,
        skipRender: !!opts.skipRender,
        forceApply: !!opts.force,
      });
      if (ok && typeof global.crozzoLanMarkActionApplied === 'function') {
        global.crozzoLanMarkActionApplied(payload, 'lan_pull');
      }
      return ok;
    }
    return false;
  }

  function applyLanEstadoDelta(pay) {
    if (!pay || pay.id == null) return false;
    var c = null;
    if (pay.transaction_id && global.comandas) {
      c = global.comandas.find(function (x) {
        return x && x.transaction_id && String(x.transaction_id) === String(pay.transaction_id);
      });
    }
    if (!c && pay.id != null && typeof global.__crozzoEmergencyFindComandaById === 'function') {
      c = global.__crozzoEmergencyFindComandaById(pay.id);
    }
    if (!c) return false;
    var est = pay.estado != null ? pay.estado : c.estado;
    if (est === 'entregada' && typeof global.despacharComanda === 'function') {
      global.despacharComanda(c.id, { skipToast: true, skipGossip: true, skipFanout: true });
    } else if (typeof global.updateComandaEstado === 'function') {
      global.updateComandaEstado(c.id, est, { skipFanout: true });
    } else {
      return false;
    }
    return true;
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
    // Pull forzado (reconnect, sync gate, pruebas): no exige estar en página Z0 operativa.
    var syncKind = opts.force ? 'transport' : 'realtime';
    if (!lanSyncAllowed({ kind: syncKind, force: !!opts.force })) return false;
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
      if (!lanSyncAllowed({ kind: 'realtime' })) return;
      if (kind === 'comanda') {
        pullComandasLan(opts || { skipPrint: false, skipRender: false }).catch(function () {});
      } else if (kind === 'runtime') {
        pullRuntimeLan({ quiet: true, skipRender: false })
          .then(function (applied) {
            if (applied && typeof global.crozzoHandleRemoteRuntimeUiSync === 'function') {
              global.crozzoHandleRemoteRuntimeUiSync({ skipCartReconcile: true });
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
    if (!payload || !lanSyncAllowed({ kind: 'realtime' })) return;
    var myDev = '';
    safe(function () {
      myDev = String(
        (typeof global.ensureCrozzoDeviceId === 'function' && global.ensureCrozzoDeviceId()) ||
          md().deviceId ||
          ''
      ).trim();
    });
    if (myDev && payload.dev && String(payload.dev) === myDev) return;
    noteRx('pulse');
    var kind = String(payload.kind || '');
    if (payload.delta && (kind === 'comanda' || payload.delta.id != null)) {
      if (applyLanEstadoDelta(payload.delta)) {
        if (!payload.skipRender) scheduleComandaUiRefresh();
        return;
      }
    }
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
    if (__pendingDelta[kind]) {
      payload.delta = __pendingDelta[kind];
      __pendingDelta[kind] = null;
    }
    var body = JSON.stringify(payload);
    var pullKind = kind === 'all' ? 'all' : kind;
    var pullOpts = { skipPrint: true, skipRender: false };
    var cfg = md();
    if (cfg.role === 'A' && isDesktopTauri()) {
      invoke('crozzo_lan_ws_broadcast', { json: body }).catch(function () {});
      triggerPull(pullKind, pullOpts);
      return;
    }
    var ip = lanHost();
    if (!ip || cfg.role !== 'B') return;
    /* Siempre pull (KI-006). En Z0 híbrido también POST pulse aunque cloud “parezca” sana. */
    var hybridZ0 = false;
    try {
      hybridZ0 =
        typeof global.crozzoZ0HybridParallelLan === 'function' && global.crozzoZ0HybridParallelLan();
    } catch (_) {}
    if (!hybridZ0 && cloudRealtimeStandby()) {
      triggerPull(pullKind, pullOpts);
      return;
    }
    try {
      if (typeof global.crozzoLanPostSync === 'function') {
        global.crozzoLanPostSync({ type: 'lan_ops_pulse', data: payload }).catch(function () {});
      }
    } catch (_) {}
    triggerPull(pullKind, pullOpts);
  }

  function emit(kind) {
    kind = String(kind || '').trim();
    if (kind !== 'comanda' && kind !== 'runtime' && kind !== 'all') return;
    if (!lanSyncAllowed({ kind: 'transport', force: true })) return;
    /* KI-006: en Z0 híbrido siempre emitir+pull; no silenciar por cloudRealtimeStandby. */
    var hybridZ0 = false;
    try {
      hybridZ0 =
        typeof global.crozzoZ0HybridParallelLan === 'function' && global.crozzoZ0HybridParallelLan();
    } catch (_) {}
    if (!hybridZ0 && cloudRealtimeStandby() && !__pendingDelta[kind]) return;
    __pendingEmit[kind] = true;
    if (__emitTimers[kind]) return;
    __emitTimers[kind] = global.setTimeout(function () {
      __emitTimers[kind] = null;
      if (!__pendingEmit[kind]) return;
      __pendingEmit[kind] = false;
      doEmit(kind);
    }, EMIT_DEBOUNCE_MS);
  }

  function emitWithDelta(kind, delta) {
    kind = String(kind || '').trim();
    if (delta && typeof delta === 'object') __pendingDelta[kind] = delta;
    emit(kind);
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
    if (!shouldRunLanOps()) return;
    if (rolePollsRuntime()) {
      __runtimePoll = global.setInterval(function () {
        if (!lanSyncAllowed({ kind: 'realtime' })) return;
        if (cloudRealtimeStandby()) return;
        try {
          if (typeof document !== 'undefined' && document.hidden) return;
        } catch (_) {}
        if (softPollCoveredByWs()) {
          __skippedSoftPolls++;
          return;
        }
        pullRuntimeLan({ quiet: true, skipRender: false })
          .then(function (applied) {
            if (applied && typeof global.crozzoHandleRemoteRuntimeUiSync === 'function') {
              global.crozzoHandleRemoteRuntimeUiSync({ skipCartReconcile: true });
            }
          })
          .catch(function () {});
      }, runtimePollMs());
    }
    var comMs = comandaPollMs();
    __comandaPoll = global.setInterval(function () {
      if (!lanSyncAllowed({ kind: 'realtime' })) return;
      if (cloudRealtimeStandby()) return;
      try {
        if (typeof document !== 'undefined' && document.hidden) return;
      } catch (_) {}
      var stale = __lastRxAt ? Date.now() - __lastRxAt : Infinity;
      if (stale > SILENCE_FORCE_MS) {
        pullComandasLan({ skipPrint: false, skipRender: false, force: true }).catch(function () {});
      } else if (softPollCoveredByWs()) {
        __skippedSoftPolls++;
      } else {
        remoteDigestMatchesLocal()
          .then(function (same) {
            if (same) {
              __skippedDigestMatch++;
              noteRx('digest_match');
              return;
            }
            return pullComandasLan({ skipPrint: true, skipRender: true });
          })
          .catch(function () {
            pullComandasLan({ skipPrint: true, skipRender: true }).catch(function () {});
          });
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
      if (!__started || !shouldRunLanOps()) return;
      if (cloudRealtimeStandby()) return;
      try {
        if (typeof document !== 'undefined' && document.hidden) return;
      } catch (_) {}
      if (global.CrozzoLanWebSocketBridge && typeof global.CrozzoLanWebSocketBridge.connect === 'function') {
        global.CrozzoLanWebSocketBridge.connect();
      }
      var silence = __lastRxAt ? Date.now() - __lastRxAt : Infinity;
      if (silence > ANCHOR_SILENCE_EVENT_MS && opRealtimeActive()) {
        healAnchorSilence(silence);
      } else if (silence > WATCHDOG_MS && opRealtimeActive()) {
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
    if (to === 'cloud') {
      var wanOk =
        typeof global.crozzoCloudWanReady === 'function' ? global.crozzoCloudWanReady() : true;
      if (wanOk) {
        /* KI-005: drenar nube; pero en Z0 híbrido NO matar LAN ops (tablet↔caja↔cocina). */
        var keepHybrid = false;
        try {
          keepHybrid =
            typeof global.crozzoZ0HybridParallelLan === 'function' && global.crozzoZ0HybridParallelLan();
        } catch (_) {}
        if (keepHybrid && shouldRunLanOps()) {
          startLanOpsSync('tier:cloud_hybrid');
        } else {
          stopLanOpsSync();
          if (shouldRunLanStandby()) startLanStandby('cloud_primary');
        }
        safe(function () {
          if (typeof global.crozzoRunFullReconnectSync === 'function') {
            global.crozzoRunFullReconnectSync({ source: 'lan_recover', skipPrint: true }).catch(function () {});
          }
        });
        return;
      }
    }
    if (shouldRunLanOps()) {
      startLanOpsSync('tier:' + (to || '?'));
    } else {
      stopLanOpsSync();
    }
  }

  function startLanOpsSync(reason) {
    try {
      if (global.__CROZZO_FIELD_TEST_QUIET && !global.__CROZZO_FIELD_TEST_LAN_ACTIVE) return;
    } catch (_) {}
    stopLanStandby();
    if (!shouldRunLanOps()) {
      if (lanSyncAllowed({ kind: 'transport' }) && !lanOpsTransportPrimary()) {
        stopLanOpsSync();
      }
      global.setTimeout(function () {
        if (shouldRunLanOps()) startLanOpsSync(reason || 'retry');
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
          global.crozzoHandleRemoteRuntimeUiSync({ skipCartReconcile: true });
        }
      })
      .catch(function () {});
    pullComandasLan({ skipPrint: true, skipRender: true, force: true }).catch(function () {});
    startPollLoops();
    startWatchdog();
  }

  function stopLanOpsSync() {
    if (!__started && !__standbyMode) return;
    __started = false;
    stopPollLoops();
    stopWatchdog();
    stopLanStandby();
    Object.keys(__pullTimers).forEach(function (k) {
      if (__pullTimers[k]) {
        global.clearTimeout(__pullTimers[k]);
        __pullTimers[k] = null;
      }
    });
  }

  function afterMainInit() {
    if (shouldRunLanOps()) {
      startLanOpsSync('init');
      return;
    }
    if (shouldRunLanStandby()) {
      startLanStandby('init');
      return;
    }
    if (lanOpsTransportPrimary() && lanSyncAllowed({ kind: 'transport' })) {
      global.setTimeout(function () {
        if (shouldRunLanOps()) startLanOpsSync('init_deferred_z0');
      }, 2200);
    }
  }

  if (!global.__crozzoLanOpsTierBound) {
    global.__crozzoLanOpsTierBound = true;
    global.addEventListener('crozzo-tier-changed', onTierChanged);
    global.addEventListener('crozzo-lan-up', function () {
      if (shouldRunLanOps()) startLanOpsSync('lan-up');
    });
  }

  global.crozzoLanOpsPulseEmit = emit;
  global.crozzoLanOpsPulseEmitWithDelta = emitWithDelta;
  global.crozzoPullComandasFromLan = pullComandasLan;
  global.crozzoStartLanOpsSync = startLanOpsSync;
  global.crozzoStopLanOpsSync = stopLanOpsSync;
  global.__crozzoLanOpsHandlePulse = handleLanPulse;
  global.__crozzoLanOpsNoteRx = noteRx;

  global.CrozzoLanOpsSync = {
    start: startLanOpsSync,
    stop: stopLanOpsSync,
    emit: emit,
    emitWithDelta: emitWithDelta,
    pullComandas: pullComandasLan,
    pullRuntime: pullRuntimeLan,
    seedCentralComandas: seedCentralComandasFromLocal,
    afterMainInit: afterMainInit,
    tierAllows: tierAllowsLan,
    syncAllowed: lanSyncAllowed,
    rolePollsRuntime: rolePollsRuntime,
    getPathHealth: getPathHealth,
    softPollCoveredByWs: softPollCoveredByWs,
    localComandasDigest: localComandasDigest,
    fetchOpsDigest: fetchOpsDigest,
    status: function () {
      var h = getPathHealth();
      h.skippedDigestMatch = __skippedDigestMatch;
      h.lastRemoteDigest = __lastRemoteDigest;
      return h;
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
