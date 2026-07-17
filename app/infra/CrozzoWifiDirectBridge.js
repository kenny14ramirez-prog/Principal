/**
 * Crozzo — Puente Wi‑Fi Direct / P2P supervivencia (tablets Android sin router).
 *
 * Estrategia:
 *  - Nativo WifiP2p (Tauri Android) cuando el comando exista.
 *  - Fallback: relay HTTP a peers LAN conocidos (PeerDirectory / ancla memoria)
 *    con el mismo contrato OpFanout { op_id, type, data } — first-wins vía OpAck.
 *
 * Nunca reemplaza la caja cuando LAN hub (WS/HTTP) está sano.
 */
(function (global) {
  'use strict';

  var __started = false;
  var __peers = {};
  var __lastNative = null;
  var __lastPublishAt = 0;

  function safe(fn, fallback) {
    try {
      return fn();
    } catch (_) {
      return fallback;
    }
  }

  function isTauri() {
    return !!(global.__TAURI__ && global.__TAURI__.core && typeof global.__TAURI__.core.invoke === 'function');
  }

  function invoke(cmd, args) {
    return global.__TAURI__.core.invoke(cmd, args || {});
  }

  function isAndroid() {
    try {
      var ua = String((global.navigator && global.navigator.userAgent) || '');
      return /Android/i.test(ua) || !!(global.__TAURI_INTERNALS__ && /android/i.test(String(global.__TAURI_OS__ || '')));
    } catch (_) {
      return false;
    }
  }

  function md() {
    return typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
  }

  function hubHealthy() {
    return !!safe(function () {
      if (global.CrozzoTransportPathHealth && typeof global.CrozzoTransportPathHealth.getHealth === 'function') {
        var h = global.CrozzoTransportPathHealth.getHealth();
        return h && h.label === 'ws_primary';
      }
      if (global.CrozzoLanOpsSync && typeof global.CrozzoLanOpsSync.softPollCoveredByWs === 'function') {
        return global.CrozzoLanOpsSync.softPollCoveredByWs();
      }
      return false;
    }, false);
  }

  function notePeer(ip, meta) {
    ip = String(ip || '').trim();
    if (!ip) return;
    __peers[ip] = Object.assign({ ip: ip, at: Date.now() }, meta || {});
  }

  function listPeerIps() {
    var out = [];
    var cfg = md();
    var central = String(cfg.centralIp || '').trim();
    if (central) {
      notePeer(central, { via: 'config' });
      out.push(central);
    }
    safe(function () {
      if (global.CrozzoPeerDirectory && typeof global.CrozzoPeerDirectory.listPeers === 'function') {
        global.CrozzoPeerDirectory.listPeers().forEach(function (p) {
          var ip = String((p && (p.lanIp || p.ip)) || '').trim();
          if (ip && out.indexOf(ip) < 0) {
            notePeer(ip, { via: 'peer_dir', deviceId: p.deviceId });
            out.push(ip);
          }
        });
      }
    });
    Object.keys(__peers).forEach(function (ip) {
      if (out.indexOf(ip) < 0) out.push(ip);
    });
    return out;
  }

  async function refreshNative() {
    if (!isTauri()) {
      __lastNative = { ok: false, supported: false, reason: 'no_tauri' };
      return __lastNative;
    }
    try {
      __lastNative = await invoke('crozzo_wifi_direct_status');
      if (__lastNative && Array.isArray(__lastNative.peers)) {
        __lastNative.peers.forEach(function (p) {
          if (p && p.ip) notePeer(p.ip, { via: 'wifi_direct_native' });
        });
      }
      return __lastNative;
    } catch (_) {
      __lastNative = { ok: false, supported: isAndroid(), reason: 'cmd_missing', mode: 'http_peer_relay' };
      return __lastNative;
    }
  }

  async function startNative() {
    if (!isTauri()) return { ok: false };
    try {
      return await invoke('crozzo_wifi_direct_start', { locationId: String(md().locationId || '') });
    } catch (_) {
      return { ok: false, reason: 'cmd_missing' };
    }
  }

  function ensureOpBody(body) {
    body = body && typeof body === 'object' ? body : {};
    if (!body.op_id && !body.action_id && !body.uuid) {
      body.op_id =
        String(body.type || 'op') +
        ':' +
        String((body.data && (body.data.transaction_id || body.data.id)) || Date.now());
    }
    if (!body.action_id) body.action_id = body.op_id || body.uuid;
    if (!body.uuid) body.uuid = body.action_id;
    if (typeof global.crozzoLanEnsureActionId === 'function') global.crozzoLanEnsureActionId(body);
    else if (global.CrozzoOpAckRegistry && typeof global.CrozzoOpAckRegistry.ensureOpId === 'function') {
      global.CrozzoOpAckRegistry.ensureOpId(body);
    }
    return body;
  }

  async function postToPeer(ip, body) {
    var port = Number(md().port) || 3000;
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller
      ? global.setTimeout(function () {
          controller.abort();
        }, 2800)
      : null;
    try {
      var res = await global.fetch('http://' + ip + ':' + port + '/api/sync', {
        method: 'POST',
        signal: controller ? controller.signal : undefined,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
      if (timer) global.clearTimeout(timer);
      return !!(res && res.ok);
    } catch (_) {
      if (timer) global.clearTimeout(timer);
      return false;
    }
  }

  /**
   * Publica op Z0 a peers P2P. Skip si hub WS sano y !force.
   */
  async function publishOp(body, opts) {
    opts = opts || {};
    if (!opts.force && hubHealthy()) return { ok: false, skipped: 'hub_healthy' };
    body = ensureOpBody(body);
    __lastPublishAt = Date.now();
    var ips = listPeerIps();
    var n = 0;
    for (var i = 0; i < ips.length && i < 8; i++) {
      if (await postToPeer(ips[i], body)) n++;
    }
    safe(function () {
      if (global.CrozzoOfflineGossip && typeof global.CrozzoOfflineGossip.publishEstado === 'function' && body.type === 'comanda_estado') {
        var d = body.data || {};
        global.CrozzoOfflineGossip.publishEstado(d.id, d.estado, d.transaction_id, { force: true });
      }
    });
    return { ok: n > 0, peersTried: ips.length, delivered: n };
  }

  function publishEstado(comanda, estado, opts) {
    if (!comanda) return Promise.resolve({ ok: false });
    var est = estado || comanda.estado;
    var body = {
      type: 'comanda_estado',
      op_id:
        String(comanda.transaction_id || comanda.id || '') +
        ':' +
        String(est || '') +
        ':' +
        String(comanda.lastUpdateAt || new Date().toISOString()),
      data: {
        id: comanda.id,
        transaction_id: comanda.transaction_id,
        estado: est,
        lastUpdateAt: comanda.lastUpdateAt || new Date().toISOString(),
      },
    };
    return publishOp(body, opts);
  }

  function publishComandaNew(comanda, opts) {
    if (!comanda) return Promise.resolve({ ok: false });
    var body = {
      type: 'comanda',
      op_id: String(comanda.transaction_id || comanda.id || ''),
      uuid: String(comanda.transaction_id || comanda.id || ''),
      data: comanda,
    };
    return publishOp(body, opts);
  }

  function getStatus() {
    var peers = listPeerIps();
    return {
      started: __started,
      supported: isAndroid() || !!(__lastNative && __lastNative.supported),
      active: __started && peers.length > 0,
      peerCount: peers.length,
      lastPublishAt: __lastPublishAt,
      native: __lastNative,
      mode: __lastNative && __lastNative.ok ? 'native_wifi_direct' : 'http_peer_relay',
    };
  }

  function start(reason) {
    if (__started) return getStatus();
    __started = true;
    refreshNative().then(function () {
      if (isAndroid()) startNative().catch(function () {});
    });
    safe(function () {
      if (typeof global.crozzoWizardTierLogLine === 'function') {
        global.crozzoWizardTierLogLine('Wi‑Fi Direct / P2P relay activo' + (reason ? ' (' + reason + ')' : ''));
      }
    });
    return getStatus();
  }

  function stop() {
    __started = false;
  }

  function afterMainInit() {
    var cfg = md();
    if (cfg.role === 'B' || isAndroid()) {
      start('init');
    }
    if (!global.__crozzoWifiDirectSilenceBound) {
      global.__crozzoWifiDirectSilenceBound = true;
      global.addEventListener('crozzo-lan-anchor-silence', function () {
        start('anchor_silence');
        refreshNative().catch(function () {});
      });
    }
  }

  global.CrozzoWifiDirectBridge = {
    start: start,
    stop: stop,
    afterMainInit: afterMainInit,
    publishOp: publishOp,
    publishEstado: publishEstado,
    publishComandaNew: publishComandaNew,
    getStatus: getStatus,
    listPeerIps: listPeerIps,
    refreshNative: refreshNative,
  };
})(typeof window !== 'undefined' ? window : globalThis);
