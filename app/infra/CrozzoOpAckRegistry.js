/**
 * Crozzo — Registro global de operaciones idempotentes + ACK multi-canal.
 * Extiende la semántica de CrozzoLanActionDedup a cloud / LAN / mesh.
 */
(function (global) {
  'use strict';

  var SEEN_TTL_MS = 6 * 60 * 60 * 1000;
  var ECHO_MS = 18000;
  var MAX_SEEN = 2400;
  var LS_KEY = 'crozzo_op_ack_seen_v1';
  var __mem = {};
  var __acked = {};
  var __pending = {};
  var __emitTimers = {};

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

  function resolveOpId(payload) {
    if (!payload || typeof payload !== 'object') return '';
    var id = String(payload.op_id || payload.opId || payload.action_id || payload.uuid || '').trim();
    if (id) return id;
    var typ = String(payload.type || payload.kind || '').toLowerCase();
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

  function ensureOpId(payload) {
    if (!payload || typeof payload !== 'object') return '';
    var id = resolveOpId(payload);
    if (!id) {
      var typ = String(payload.type || payload.kind || 'sync');
      id = typ + ':' + Date.now().toString(36) + ':' + Math.random().toString(36).slice(2, 10);
    }
    payload.op_id = id;
    payload.opId = id;
    payload.action_id = id;
    if (!payload.uuid) payload.uuid = id;
    if (!payload.deviceId && !payload.device_id) {
      var dev = deviceId();
      if (dev) payload.deviceId = dev;
    }
    return id;
  }

  function opSeenRecently(opId, maxMs) {
    if (!opId) return false;
    var e = __mem[String(opId)];
    return !!(e && Date.now() - (e.at || 0) < (maxMs || SEEN_TTL_MS));
  }

  function markOpSeen(opId, source) {
    if (!opId) return;
    __mem[String(opId)] = { at: Date.now(), src: source || 'local' };
    persistSeen();
  }

  function originDevice(payload) {
    return String(payload.deviceId || payload.device_id || payload.originDeviceId || '').trim();
  }

  function shouldApply(payload, opts) {
    opts = opts || {};
    var opId = resolveOpId(payload);
    if (!opId) return { apply: true, opId: '', actionId: '', reason: 'no_id' };

    var myDev = deviceId();
    var origin = originDevice(payload);
    if (origin && myDev && origin === myDev && opSeenRecently(opId, opts.echoMs || ECHO_MS)) {
      return { apply: false, opId: opId, actionId: opId, reason: 'own_echo' };
    }
    if (opSeenRecently(opId, opts.seenMs || SEEN_TTL_MS)) {
      return { apply: false, opId: opId, actionId: opId, reason: 'already_seen' };
    }
    return { apply: true, opId: opId, actionId: opId, reason: 'new' };
  }

  function markApplied(payload, source) {
    var id = ensureOpId(payload);
    if (id) markOpSeen(id, source || 'applied');
    return id;
  }

  function markPushed(payload) {
    var id = ensureOpId(payload);
    if (id) markOpSeen(id, 'local_push');
    return id;
  }

  function isOpAcked(opId) {
    if (!opId) return false;
    var e = __acked[String(opId)];
    return !!(e && Date.now() - (e.at || 0) < SEEN_TTL_MS);
  }

  function markOpAcked(opId, fromDevice, via) {
    if (!opId) return;
    __acked[String(opId)] = { at: Date.now(), from: fromDevice || '', via: via || 'unknown' };
    var pending = __pending[String(opId)];
    if (pending && pending.originDeviceId === deviceId()) {
      clearPending(opId);
    }
    safe(function () {
      global.dispatchEvent(
        new CustomEvent('crozzo-op-acked', {
          detail: { opId: opId, fromDevice: fromDevice || '', via: via || 'unknown' },
        })
      );
    });
  }

  function registerPending(opId, meta) {
    if (!opId) return;
    meta = meta || {};
    if (__pending[opId] && __pending[opId].timer) {
      global.clearTimeout(__pending[opId].timer);
    }
    __pending[opId] = {
      originDeviceId: deviceId(),
      kind: meta.kind || '',
      createdAt: Date.now(),
      retries: Number(meta.retries) || 0,
      timer: null,
    };
  }

  function clearPending(opId) {
    if (!opId || !__pending[opId]) return;
    if (__pending[opId].timer) global.clearTimeout(__pending[opId].timer);
    delete __pending[opId];
  }

  function listPending() {
    var out = [];
    Object.keys(__pending).forEach(function (k) {
      out.push({ opId: k, pending: __pending[k] });
    });
    return out;
  }

  function dispatchAck(body, via) {
    if (typeof global.crozzoLanPostSync === 'function') {
      global.crozzoLanPostSync(body, { timeoutMs: 2800 }).catch(function () {});
    }
    try {
      if (global.CrozzoOfflineGossip && typeof global.CrozzoOfflineGossip.publishOpAck === 'function') {
        global.CrozzoOfflineGossip.publishOpAck(body.op_id, body.deviceId, via || 'lan');
      }
    } catch (_) {}
  }

  function emitOpAck(opId, via) {
    if (!opId) return;
    if (__emitTimers[opId]) return;
    __emitTimers[opId] = global.setTimeout(function () {
      __emitTimers[opId] = null;
      var body = {
        type: 'op_ack',
        op_id: opId,
        action_id: opId,
        deviceId: deviceId(),
        data: { op_id: opId, action_id: opId, deviceId: deviceId(), at: Date.now(), via: via || 'lan' },
      };
      dispatchAck(body, via || 'lan');
    }, 60);
  }

  function handleAckMessage(payload) {
    var pay = payload && (payload.data || payload.payload || payload);
    var typ = String((payload && payload.type) || (pay && pay.type) || '').toLowerCase();
    if (typ === 'lan_action_ack') {
      var aid = (pay && (pay.action_id || pay.uuid)) || (payload && (payload.action_id || payload.uuid));
      if (aid) markOpAcked(String(aid), pay && pay.deviceId ? String(pay.deviceId) : '', 'lan');
      return;
    }
    if (typ !== 'op_ack' && typ !== 'op_ack_relay') return;
    var opId = String(
      (pay && (pay.op_id || pay.opId || pay.action_id)) ||
        (payload && (payload.op_id || payload.opId || payload.action_id)) ||
        ''
    ).trim();
    if (!opId) return;
    var from = String(
      (pay && (pay.fromDeviceId || pay.deviceId)) || (payload && payload.deviceId) || ''
    ).trim();
    var via = String((pay && pay.via) || typ || 'ack').trim();
    markOpSeen(opId, 'peer_ack');
    markOpAcked(opId, from, via);
  }

  loadPersisted();

  global.crozzoOpResolveId = resolveOpId;
  global.crozzoOpEnsureId = ensureOpId;
  global.crozzoOpShouldApply = shouldApply;
  global.crozzoOpMarkSeen = markOpSeen;
  global.crozzoOpMarkApplied = markApplied;
  global.crozzoOpMarkPushed = markPushed;
  global.crozzoOpEmitAck = emitOpAck;
  global.crozzoOpHandleAck = handleAckMessage;
  global.crozzoOpIsAcked = isOpAcked;
  global.crozzoOpRegisterPending = registerPending;
  global.crozzoOpClearPending = clearPending;
  global.crozzoOpListPending = listPending;

  global.CrozzoOpAckRegistry = {
    resolveOpId: resolveOpId,
    ensureOpId: ensureOpId,
    shouldApply: shouldApply,
    markApplied: markApplied,
    markPushed: markPushed,
    markSeen: markOpSeen,
    emitAck: emitOpAck,
    handleAck: handleAckMessage,
    isAcked: isOpAcked,
    markAcked: markOpAcked,
    registerPending: registerPending,
    clearPending: clearPending,
    listPending: listPending,
  };
})(typeof window !== 'undefined' ? window : globalThis);
