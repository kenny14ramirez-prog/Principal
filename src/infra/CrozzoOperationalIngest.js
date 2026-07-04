/**
 * Crozzo — Ingest operativo unificado (boca única para comandas Z0).
 *
 * No reemplaza cloud/LAN/mesh: centraliza dedup + prioridad de canal antes de
 * aplicar comandas. Evita duplicados cuando varias rutas híbridas confirman
 * el mismo hecho.
 */
(function (global) {
  'use strict';

  var VIA_RANK = {
    cloud: 40,
    lan: 30,
    lan_ws: 30,
    lan_central: 30,
    lan_http: 30,
    mesh: 20,
    gossip: 20,
    unknown: 5,
  };

  var __gateLog = {};
  var GATE_LOG_MS = 300000;

  function safe(fn, def) {
    try {
      return fn();
    } catch (_) {
      return def;
    }
  }

  function normalizeVia(via) {
    var v = String(via || 'unknown').toLowerCase();
    if (VIA_RANK[v] != null) return v;
    if (v.indexOf('cloud') >= 0) return 'cloud';
    if (v.indexOf('lan') >= 0) return 'lan';
    if (v.indexOf('gossip') >= 0 || v.indexOf('mesh') >= 0) return 'mesh';
    return 'unknown';
  }

  function viaRank(via) {
    return VIA_RANK[normalizeVia(via)] || 0;
  }

  function srcToRank(src) {
    return viaRank(String(src || ''));
  }

  function acceptsArea(areaId) {
    if (!areaId) return true;
    if (typeof global.crozzoDeviceShouldIngestComandaArea === 'function') {
      return global.crozzoDeviceShouldIngestComandaArea(areaId);
    }
    if (typeof global.crozzoDeviceShowsComandaArea === 'function') {
      return global.crozzoDeviceShowsComandaArea(areaId);
    }
    return true;
  }

  function opIdComandaNew(snap) {
    if (!snap) return '';
    var tid = String(snap.transaction_id || '').trim();
    if (tid) return tid;
    if (snap.id != null) return 'comanda:' + String(snap.id);
    return '';
  }

  function opIdComandaEstado(pay) {
    if (!pay) return '';
    return (
      String(pay.transaction_id || pay.id || '') +
      ':' +
      String(pay.estado || '') +
      ':' +
      String(pay.lastUpdateAt || '')
    ).trim();
  }

  function ackRegistry() {
    return global.CrozzoOpAckRegistry || null;
  }

  function logGateSkip(kind, reason, opId, via) {
    if (reason !== 'duplicate_tid' && reason !== 'already_seen' && reason !== 'own_echo') return;
    if (viaRank(via) > 20) return;
    var key = String(opId || kind) + '|' + reason;
    var now = Date.now();
    if (__gateLog[key] && now - __gateLog[key] < GATE_LOG_MS) return;
    __gateLog[key] = now;
    safe(function () {
      if (global.CrozzoOperativeJournal && typeof global.CrozzoOperativeJournal.record === 'function') {
        global.CrozzoOperativeJournal.record({
          kind: 'ingest',
          code: 'gate_' + reason,
          detail: { kind: kind, via: via, opId: opId },
        });
      }
    });
  }

  function gateOp(payload, opts) {
    opts = opts || {};
    var R = ackRegistry();
    if (!R || typeof R.shouldApply !== 'function') {
      return { apply: true, reason: 'no_registry', opId: R && R.resolveOpId ? R.resolveOpId(payload) : '' };
    }
    return R.shouldApply(payload, opts);
  }

  function gateComandaNew(snap, opts) {
    opts = opts || {};
    if (!snap || snap.id == null) return { apply: false, reason: 'invalid', opId: '' };
    if (!acceptsArea(snap.areaId)) return { apply: false, reason: 'area', opId: opIdComandaNew(snap) };

    var via = normalizeVia(opts.via);
    var opId = opIdComandaNew(snap);
    var body = { type: 'comanda', data: snap, deviceId: snap.deviceId || snap.device_id || '' };
    var reg = gateOp(body, opts);
    if (!reg.apply) {
      logGateSkip('comanda_new', reg.reason || 'op_ack', reg.opId || opId, via);
      return { apply: false, reason: reg.reason || 'op_ack', opId: reg.opId || opId };
    }

    var tid = String(snap.transaction_id || '').trim();
    if (tid && !opts.forceApply && typeof global.__crozzoComandaTidRecent === 'function' && global.__crozzoComandaTidRecent(tid, opts.tidWindowMs || 120000)) {
      var seen = global.__crozzoComandaTidSeen && global.__crozzoComandaTidSeen[tid];
      if (seen && viaRank(via) <= srcToRank(seen.src)) {
        logGateSkip('comanda_new', 'duplicate_tid', opId, via);
        return { apply: false, reason: 'duplicate_tid', opId: opId };
      }
    }

    if (!opts.forceApply && typeof global.__crozzoEmergencyFindComandaById === 'function') {
      var existing = global.__crozzoEmergencyFindComandaById(snap.id);
      if (existing) {
        var remoteAt = Date.parse(snap.lastUpdateAt || snap._cloudSyncedAt || 0) || 0;
        var localAt = Date.parse(existing.lastUpdateAt || existing.createdAt || 0) || 0;
        if (localAt > remoteAt + 500 && viaRank(via) < 40) {
          return { apply: false, reason: 'local_newer', opId: opId };
        }
      }
    }

    return { apply: true, reason: 'ok', opId: opId };
  }

  function gateComandaEstado(pay, opts) {
    opts = opts || {};
    if (!pay) return { apply: false, reason: 'invalid', opId: '' };
    var via = normalizeVia(opts.via);
    var opId = opIdComandaEstado(pay);
    var body = {
      type: 'comanda_estado',
      data: pay,
      deviceId: pay.deviceId || pay.device_id || '',
    };
    var reg = gateOp(body, opts);
    if (!reg.apply) return { apply: false, reason: reg.reason || 'op_ack', opId: reg.opId || opId };

    var tid = String(pay.transaction_id || '').trim();
    if (tid && !opts.forceApply && typeof global.__crozzoComandaTidRecent === 'function' && global.__crozzoComandaTidRecent(tid, 45000)) {
      if (viaRank(via) <= 20) {
        return { apply: false, reason: 'duplicate_tid', opId: opId };
      }
    }
    return { apply: true, reason: 'ok', opId: opId };
  }

  function markComandaNew(snap, opts) {
    if (!snap) return '';
    opts = opts || {};
    var via = normalizeVia(opts.via);
    var tid = String(snap.transaction_id || '').trim();
    if (tid && typeof global.__crozzoComandaTidMark === 'function') {
      global.__crozzoComandaTidMark(tid, via);
    }
    var R = ackRegistry();
    if (R && typeof R.markApplied === 'function') {
      return R.markApplied({ type: 'comanda', data: snap, deviceId: snap.deviceId || '' }, via);
    }
    return opIdComandaNew(snap);
  }

  function markComandaEstado(pay, opts) {
    if (!pay) return '';
    opts = opts || {};
    var via = normalizeVia(opts.via);
    var R = ackRegistry();
    if (R && typeof R.markApplied === 'function') {
      return R.markApplied({ type: 'comanda_estado', data: pay, deviceId: pay.deviceId || '' }, via);
    }
    return opIdComandaEstado(pay);
  }

  function findComanda(pay) {
    if (!pay || !global.comandas) return null;
    var tid = pay.transaction_id ? String(pay.transaction_id) : '';
    if (tid) {
      var byTid = global.comandas.find(function (x) {
        return x.transaction_id && String(x.transaction_id) === tid;
      });
      if (byTid) return byTid;
    }
    if (pay.id != null && typeof global.__crozzoEmergencyFindComandaById === 'function') {
      return global.__crozzoEmergencyFindComandaById(pay.id);
    }
    if (pay.id != null) {
      return global.comandas.find(function (x) {
        return x.id === pay.id;
      }) || null;
    }
    return null;
  }

  function emitAck(opId, via) {
    if (!opId || typeof global.crozzoOpEmitAck !== 'function') return;
    global.crozzoOpEmitAck(opId, via || 'ingest');
  }

  function refreshComandaUi() {
    safe(function () {
      if (typeof global.crozzoPublishComandasGlobal === 'function') global.crozzoPublishComandasGlobal();
    });
    safe(function () {
      if (typeof global.crozzoScheduleOperationalPageRefresh === 'function') {
        global.crozzoScheduleOperationalPageRefresh(global.currentPage);
      } else if (
        (global.currentPage === 'comandas' || global.currentPage === 'cocina') &&
        typeof global.renderPage === 'function'
      ) {
        global.renderPage(global.currentPage);
      }
    });
  }

  function applyComandaNew(snap, opts) {
    opts = opts || {};
    var via = normalizeVia(opts.via || 'mesh');
    var gate = gateComandaNew(snap, opts);
    if (!gate.apply) return { applied: false, reason: gate.reason, opId: gate.opId };

    var changed = false;
    if (typeof global.__crozzoEmergencyApplyComandaSnapshot === 'function') {
      changed = !!global.__crozzoEmergencyApplyComandaSnapshot(snap, {
        skipPrint: !!opts.skipPrint,
        skipRender: !!opts.skipRender,
        source: via,
      });
    }
    if (changed || opts.alwaysMark) {
      markComandaNew(snap, { via: via });
      refreshComandaUi();
      emitAck(gate.opId || opIdComandaNew(snap), via);
    }
    return { applied: changed, reason: changed ? 'ok' : 'noop', opId: gate.opId };
  }

  function applyComandaEstado(pay, opts) {
    opts = opts || {};
    var via = normalizeVia(opts.via || 'mesh');
    var gate = gateComandaEstado(pay, opts);
    if (!gate.apply) return { applied: false, reason: gate.reason, opId: gate.opId };

    var c = findComanda(pay);
    if (!c) return { applied: false, reason: 'not_found', opId: gate.opId };

    var applied = false;
    if (pay.estado === 'entregada') {
      if (typeof global.despacharComanda === 'function') {
        global.despacharComanda(c.id, { skipToast: true, skipGossip: true });
        applied = true;
      }
    } else if (typeof global.updateComandaEstado === 'function') {
      global.updateComandaEstado(c.id, pay.estado, { skipFanout: true });
      applied = true;
    } else {
      c.estado = pay.estado;
      c.lastUpdateAt = pay.lastUpdateAt || new Date().toISOString();
      applied = true;
      refreshComandaUi();
    }

    if (applied) {
      markComandaEstado(pay, { via: via });
      emitAck(gate.opId || opIdComandaEstado(pay), via);
    }
    return { applied: applied, reason: applied ? 'ok' : 'noop', opId: gate.opId };
  }

  global.crozzoIngestGateComandaNew = gateComandaNew;
  global.crozzoIngestGateComandaEstado = gateComandaEstado;
  global.crozzoIngestMarkComandaNew = markComandaNew;
  global.crozzoIngestMarkComandaEstado = markComandaEstado;

  global.CrozzoOperationalIngest = {
    gateComandaNew: gateComandaNew,
    gateComandaEstado: gateComandaEstado,
    markComandaNew: markComandaNew,
    markComandaEstado: markComandaEstado,
    applyComandaNew: applyComandaNew,
    applyComandaEstado: applyComandaEstado,
    normalizeVia: normalizeVia,
    viaRank: viaRank,
    stats: function () {
      return { gateLogKeys: Object.keys(__gateLog).length };
    },
  };
})(typeof window !== 'undefined' ? window : this);
