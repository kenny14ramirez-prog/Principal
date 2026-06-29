/**
 * Crozzo — Idempotencia LAN P2P (sin nube intermediaria).
 *
 * Cada mutación lleva action_id único. Los dispositivos registran lo ya aplicado
 * y responden "ya lo tengo" para cortar eco WS + cola pending + poll.
 */
(function (global) {
  'use strict';

  var SEEN_TTL_MS = 6 * 60 * 60 * 1000;
  var ECHO_MS = 18000;
  var MAX_SEEN = 2400;
  var LS_KEY = 'crozzo_lan_action_seen_v1';
  var __mem = {};
  var __ackTimers = {};

  function safe(fn) {
    try {
      return fn();
    } catch (_) {
      return undefined;
    }
  }

  function deviceId() {
    return String(
      safe(function () {
        return (
          (typeof global.ensureCrozzoDeviceId === 'function' && global.ensureCrozzoDeviceId()) ||
          global.localStorage.getItem('crozzo_device_id') ||
          ''
        );
      }) || ''
    ).trim();
  }

  function loadPersisted() {
    try {
      var raw = global.localStorage.getItem(LS_KEY);
      if (!raw) return;
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return;
      var now = Date.now();
      arr.forEach(function (e) {
        if (!e || !e.id) return;
        if (now - (e.at || 0) > SEEN_TTL_MS) return;
        __mem[String(e.id)] = { at: e.at || now, src: e.src || 'persist' };
      });
    } catch (_) {}
  }

  function persistSeen() {
    try {
      var keys = Object.keys(__mem);
      if (keys.length > MAX_SEEN) {
        keys.sort(function (a, b) {
          return (__mem[a].at || 0) - (__mem[b].at || 0);
        });
        keys.slice(0, keys.length - MAX_SEEN).forEach(function (k) {
          delete __mem[k];
        });
      }
      var out = [];
      var now = Date.now();
      Object.keys(__mem).forEach(function (k) {
        var e = __mem[k];
        if (!e || now - (e.at || 0) > SEEN_TTL_MS) return;
        out.push({ id: k, at: e.at, src: e.src });
      });
      global.localStorage.setItem(LS_KEY, JSON.stringify(out.slice(-800)));
    } catch (_) {}
  }

  function resolveActionId(payload) {
    if (!payload || typeof payload !== 'object') return '';
    var id = String(payload.action_id || payload.uuid || '').trim();
    if (id) return id;
    var typ = String(payload.type || '').toLowerCase();
    var data = payload.data != null ? payload.data : payload.payload;
    if (!data || typeof data !== 'object') data = {};
    if (typ === 'comanda' || typ === 'comanda_new') {
      return String(data.transaction_id || data.id || '').trim();
    }
    if (typ === 'comanda_estado') {
      return (
        String(data.transaction_id || data.id || '') +
        ':' +
        String(data.estado || '') +
        ':' +
        String(data.lastUpdateAt || '')
      ).trim();
    }
    if (typ === 'runtime') {
      var snap = data.payload || data;
      return 'rt:' + String(snap.savedAt || snap.v || '');
    }
    return '';
  }

  function ensureActionId(payload) {
    if (!payload || typeof payload !== 'object') return '';
    var id = resolveActionId(payload);
    if (!id) {
      var typ = String(payload.type || 'sync');
      id = typ + ':' + Date.now().toString(36) + ':' + Math.random().toString(36).slice(2, 10);
    }
    payload.action_id = id;
    if (!payload.uuid) payload.uuid = id;
    if (!payload.deviceId && !payload.device_id) {
      var dev = deviceId();
      if (dev) payload.deviceId = dev;
    }
    return id;
  }

  function actionSeenRecently(actionId, maxMs) {
    if (!actionId) return false;
    var e = __mem[String(actionId)];
    return !!(e && Date.now() - (e.at || 0) < (maxMs || SEEN_TTL_MS));
  }

  function markLanActionSeen(actionId, source) {
    if (!actionId) return;
    __mem[String(actionId)] = { at: Date.now(), src: source || 'local' };
    persistSeen();
  }

  function originDevice(payload) {
    return String(payload.deviceId || payload.device_id || '').trim();
  }

  function shouldApplyLanAction(payload, opts) {
    opts = opts || {};
    var actionId = resolveActionId(payload);
    if (!actionId) return { apply: true, actionId: '', reason: 'no_id' };

    var myDev = deviceId();
    var origin = originDevice(payload);
    if (origin && myDev && origin === myDev && actionSeenRecently(actionId, opts.echoMs || ECHO_MS)) {
      return { apply: false, actionId: actionId, reason: 'own_echo' };
    }
    if (actionSeenRecently(actionId, opts.seenMs || SEEN_TTL_MS)) {
      return { apply: false, actionId: actionId, reason: 'already_seen' };
    }
    return { apply: true, actionId: actionId, reason: 'new' };
  }

  function emitLanActionAck(actionId) {
    if (!actionId) return;
    if (__ackTimers[actionId]) return;
    __ackTimers[actionId] = global.setTimeout(function () {
      __ackTimers[actionId] = null;
      var body = {
        type: 'lan_action_ack',
        action_id: actionId,
        uuid: actionId,
        deviceId: deviceId(),
        data: { action_id: actionId, deviceId: deviceId(), at: Date.now() },
      };
      try {
        if (typeof global.crozzoLanPostSync === 'function') {
          global.crozzoLanPostSync(body, { timeoutMs: 2800 }).catch(function () {});
        }
      } catch (_) {}
    }, 80);
  }

  function handleLanActionAck(payload) {
    var pay = payload && (payload.data || payload.payload || payload);
    var aid = pay && (pay.action_id || pay.uuid);
    if (!aid) aid = payload && (payload.action_id || payload.uuid);
    if (aid) markLanActionSeen(String(aid), 'peer_ack');
  }

  function markLanActionApplied(payload, source) {
    var id = ensureActionId(payload);
    if (id) markLanActionSeen(id, source || 'applied');
  }

  function markLanActionPushed(payload) {
    var id = ensureActionId(payload);
    if (id) markLanActionSeen(id, 'local_push');
  }

  loadPersisted();

  global.crozzoLanResolveActionId = resolveActionId;
  global.crozzoLanEnsureActionId = ensureActionId;
  global.crozzoLanShouldApplyAction = shouldApplyLanAction;
  global.crozzoLanMarkActionSeen = markLanActionSeen;
  global.crozzoLanMarkActionApplied = markLanActionApplied;
  global.crozzoLanMarkActionPushed = markLanActionPushed;
  global.crozzoLanEmitActionAck = emitLanActionAck;
  global.crozzoLanHandleActionAck = handleLanActionAck;
  global.crozzoLanActionSeenRecently = actionSeenRecently;

  global.CrozzoLanActionDedup = {
    ensureActionId: ensureActionId,
    shouldApply: shouldApplyLanAction,
    markApplied: markLanActionApplied,
    markPushed: markLanActionPushed,
    markSeen: markLanActionSeen,
    emitAck: emitLanActionAck,
    handleAck: handleLanActionAck,
  };
})(typeof window !== 'undefined' ? window : globalThis);
