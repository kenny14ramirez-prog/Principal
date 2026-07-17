/**
 * Crozzo — Director de conectividad (máquina de estados, eventos primero).
 *
 * No reemplaza al orquestador: orienta decisiones con memoria + lógica de ancla.
 * Topología operativa: estrella — tablets → caja (Rol A) → nube si la caja tiene WAN.
 *
 * Modos:
 *   cloud_self    — este equipo alcanza Supabase (ancla nube local)
 *   lan_client    — sin nube propia; caja alcanzable por LAN (sync vía :3000)
 *   lan_seek      — buscando caja en memoria / candidatos
 *   isolated      — sin nube ni caja conocida
 *
 * Fase 1: eventos OS + directorio local. Sin polls extra a Supabase.
 */
(function (global) {
  'use strict';

  var MODES = ['boot', 'cloud_self', 'lan_client', 'lan_seek', 'isolated'];
  var __started = false;
  var __evalTimer = null;
  var __evaluating = false;
  var __lastEvalAt = 0;
  var EVAL_DEBOUNCE_MS = 700;
  var MIN_EVAL_GAP_MS = 2500;

  var __state = {
    mode: 'boot',
    reason: '',
    selfCloud: false,
    selfLan: false,
    anchorIp: '',
    anchorDeviceId: '',
    anchorCloud: false,
    relayViaCentral: false,
    at: 0,
  };

  function safe(fn) {
    try {
      return fn();
    } catch (_) {
      return undefined;
    }
  }

  function md() {
    return typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
  }

  function emit() {
    safe(function () {
      global.__CROZZO_DIRECTOR_STATE = Object.assign({}, __state);
      global.dispatchEvent(
        new CustomEvent('crozzo-connectivity-director-changed', { detail: global.__CROZZO_DIRECTOR_STATE })
      );
    });
  }

  function setState(patch) {
    var prev = __state.mode;
    Object.assign(__state, patch, { at: Date.now() });
    global.__CROZZO_DIRECTOR_STATE = Object.assign({}, __state);
    if (__state.mode !== prev) emit();
  }

  async function fetchStatus(ip, port, timeoutMs) {
    ip = String(ip || '').trim();
    if (!ip) return null;
    port = Number(port) || 3000;
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller
      ? global.setTimeout(function () {
          controller.abort();
        }, timeoutMs || 1400)
      : null;
    try {
      var res = await global.fetch('http://' + ip + ':' + port + '/status', {
        method: 'GET',
        signal: controller ? controller.signal : undefined,
        headers: { Accept: 'application/json' },
      });
      if (timer) global.clearTimeout(timer);
      if (!res.ok) return null;
      return await res.json().catch(function () {
        return null;
      });
    } catch (_) {
      if (timer) global.clearTimeout(timer);
      return null;
    }
  }

  async function fetchHealth(ip, port, timeoutMs) {
    ip = String(ip || '').trim();
    if (!ip) return false;
    port = Number(port) || 3000;
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller
      ? global.setTimeout(function () {
          controller.abort();
        }, timeoutMs || 1200)
      : null;
    try {
      var res = await global.fetch('http://' + ip + ':' + port + '/health', {
        method: 'GET',
        signal: controller ? controller.signal : undefined,
        headers: { Accept: 'application/json' },
      });
      if (timer) global.clearTimeout(timer);
      return !!(res && res.ok);
    } catch (_) {
      if (timer) global.clearTimeout(timer);
      return false;
    }
  }

  function readSelfCloudSignal() {
    try {
      if (typeof global.crozzoTierAllowsCloudSync === 'function' && global.crozzoTierAllowsCloudSync()) {
        return true;
      }
    } catch (_) {}
    try {
      if (String(global.__CROZZO_TIER_LAST || '') === 'cloud') return true;
    } catch (_) {}
    return false;
  }

  function readSelfLanSignal() {
    try {
      if (typeof global.crozzoIsLocalLanSegmentUp === 'function' && global.crozzoIsLocalLanSegmentUp()) {
        return true;
      }
    } catch (_) {}
    return false;
  }

  /**
   * Intenta ubicar la caja usando memoria (directorio) antes de escaneos pesados.
   * Devuelve { ip, via, status } o null.
   */
  async function resolveCentralFromMemory(opts) {
    opts = opts || {};
    var cfg = md();
    if (cfg.role !== 'B' || cfg.allowLan === false) return null;
    var port = Number(cfg.port) || 3000;
    var timeout = opts.timeoutMs || 1300;
    var candidates = [];

    if (global.CrozzoPeerDirectory && typeof global.CrozzoPeerDirectory.getCentralCandidates === 'function') {
      candidates = global.CrozzoPeerDirectory.getCentralCandidates();
    }

    var cfgIp = String(cfg.centralIp || '').trim();
    if (cfgIp && !candidates.some(function (c) { return c.ip === cfgIp; })) {
      candidates.unshift({ ip: cfgIp, via: 'config', score: 2000 });
    }

    for (var i = 0; i < candidates.length && i < 6; i++) {
      var c = candidates[i];
      if (!(await fetchHealth(c.ip, port, timeout))) continue;
      var status = await fetchStatus(c.ip, port, timeout);
      if (global.CrozzoPeerDirectory && typeof global.CrozzoPeerDirectory.noteLanReachable === 'function') {
        global.CrozzoPeerDirectory.noteLanReachable(c.ip, c.via || 'director', status);
      }
      return { ip: c.ip, via: c.via || 'memory', status: status };
    }
    return null;
  }

  async function evaluate(opts) {
    opts = opts || {};
    if (__evaluating) return __state;
    var now = Date.now();
    if (!opts.force && now - __lastEvalAt < MIN_EVAL_GAP_MS) return __state;
    __evaluating = true;
    __lastEvalAt = now;
    try {
      var cfg = md();
      var selfCloud = readSelfCloudSignal();
      var selfLan = readSelfLanSignal();
      var anchorIp = '';
      var anchorDeviceId = '';
      var anchorCloud = false;
      var relayViaCentral = false;
      var mode = 'isolated';
      var reason = '';

      if (selfCloud) {
        mode = 'cloud_self';
        reason = 'Supabase/tier cloud activo en este equipo';
        if (global.CrozzoPeerDirectory && typeof global.CrozzoPeerDirectory.noteSelf === 'function') {
          global.CrozzoPeerDirectory.noteSelf({ cloudOk: true, via: 'director' });
        }
        if (global.CrozzoPeerDirectory && typeof global.CrozzoPeerDirectory.pullPresenceFromCloud === 'function') {
          global.CrozzoPeerDirectory.pullPresenceFromCloud().catch(function () {});
        }
      } else if (cfg.role === 'A') {
        if (selfLan || (await fetchHealth('127.0.0.1', Number(cfg.port) || 3000, 900))) {
          mode = selfCloud ? 'cloud_self' : 'lan_client';
          reason = 'Caja Rol A — servidor LAN local';
          anchorIp = '127.0.0.1';
          selfLan = true;
        }
      } else if (cfg.role === 'B') {
        var port = Number(cfg.port) || 3000;
        var cfgIp = String(cfg.centralIp || '').trim();
        var anchorStatus = null;
        if (cfgIp && (await fetchHealth(cfgIp, port, 1100))) {
          anchorIp = cfgIp;
          selfLan = true;
          anchorStatus = await fetchStatus(cfgIp, port, 1100);
          if (global.CrozzoPeerDirectory && typeof global.CrozzoPeerDirectory.noteLanReachable === 'function') {
            global.CrozzoPeerDirectory.noteLanReachable(cfgIp, 'config', anchorStatus);
          }
        } else {
          var mem = await resolveCentralFromMemory({ timeoutMs: 1200 });
          if (mem && mem.ip) {
            anchorIp = mem.ip;
            selfLan = true;
            anchorStatus = mem.status || null;
            if (mem.status && mem.status.device_id) anchorDeviceId = String(mem.status.device_id);
          }
        }
        if (selfLan && anchorIp) {
          mode = 'lan_client';
          reason = 'Caja alcanzable por LAN (' + anchorIp + ')';
          if (anchorStatus && anchorStatus.cloud_reachable === true) {
            anchorCloud = true;
            relayViaCentral = !selfCloud;
            reason += ' — ancla nube vía caja (relay estrella)';
          } else {
            var anchorPeer =
              global.CrozzoPeerDirectory && typeof global.CrozzoPeerDirectory.pickCloudAnchorPeer === 'function'
                ? global.CrozzoPeerDirectory.pickCloudAnchorPeer()
                : null;
            anchorCloud = !!(anchorPeer && anchorPeer.cloudOk);
            relayViaCentral = !selfCloud && anchorCloud;
            if (relayViaCentral) {
              reason += ' — ancla nube vía caja (relay estrella)';
            }
          }
        } else {
          mode = 'lan_seek';
          reason = 'Sin nube propia; buscando caja en memoria del proyecto';
          var gossipSt = safe(function () {
            return global.CrozzoOfflineGossip && global.CrozzoOfflineGossip.getStatus();
          }, null);
          if (gossipSt && (gossipSt.active || gossipSt.peerCount > 0)) {
            mode = 'lan_seek';
            reason = 'Malla local activa (' + (gossipSt.peerCount || 0) + ' peers) — buscando caja';
            selfLan = false;
          }
        }
      }

      if (mode === 'isolated' && !selfCloud && !selfLan) {
        reason = reason || 'Sin nube ni caja en memoria';
      }

      setState({
        mode: mode,
        reason: reason,
        selfCloud: selfCloud,
        selfLan: selfLan,
        anchorIp: anchorIp,
        anchorDeviceId: anchorDeviceId,
        anchorCloud: anchorCloud,
        relayViaCentral: relayViaCentral,
      });
      return __state;
    } finally {
      __evaluating = false;
    }
  }

  function scheduleEvaluate(reason, force) {
    if (__evalTimer) global.clearTimeout(__evalTimer);
    __evalTimer = global.setTimeout(function () {
      __evalTimer = null;
      evaluate({ force: !!force, reason: reason || '' })
        .then(function () {
          safe(function () {
            if (
              global.CrozzoConnectivityOrchestrator &&
              typeof global.CrozzoConnectivityOrchestrator.evaluateNow === 'function'
            ) {
              global.CrozzoConnectivityOrchestrator.evaluateNow().catch(function () {});
            }
          });
        })
        .catch(function () {});
    }, force ? 0 : EVAL_DEBOUNCE_MS);
  }

  function onNetEvent() {
    scheduleEvaluate('net', true);
  }

  function bindEvents() {
    safe(function () {
      global.addEventListener('online', onNetEvent);
      global.addEventListener('offline', onNetEvent);
      global.addEventListener('crozzo-lan-up', onNetEvent);
      /* Silence de ancla LAN (caja caída / Wi‑Fi roto): re-buscar central zero-touch. */
      global.addEventListener('crozzo-lan-anchor-silence', function () {
        scheduleEvaluate('lan_anchor_silence', true);
      });
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', function () {
          if (!document.hidden) scheduleEvaluate('visible', false);
        });
      }
    });
  }

  function start() {
    if (__started) return;
    __started = true;
    bindEvents();
    scheduleEvaluate('start', true);
  }

  function getState() {
    return Object.assign({}, __state);
  }

  function shouldDeferCloudStaffSync() {
    var s = __state;
    if (s.mode === 'lan_client' || s.mode === 'lan_seek') return true;
    if (!s.selfCloud && s.relayViaCentral) return true;
    return false;
  }

  global.CrozzoConnectivityDirector = {
    MODES: MODES.slice(),
    start: start,
    evaluate: evaluate,
    scheduleEvaluate: scheduleEvaluate,
    getState: getState,
    resolveCentralFromMemory: resolveCentralFromMemory,
    shouldDeferCloudStaffSync: shouldDeferCloudStaffSync,
  };
})(typeof window !== 'undefined' ? window : globalThis);
