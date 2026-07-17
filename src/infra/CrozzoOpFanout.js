/**
 * Crozzo — Fanout multi-canal de operaciones Z0 con seguimiento de ACK.
 * Publica en paralelo (nube + LAN + mesh) y reintenta si no hay confirmación.
 */
(function (global) {
  'use strict';

  var ACK_WAIT_MS = 3800;
  var RETRY_GAP_MS = 1400;
  var MAX_RETRIES = 2;

  function safe(fn) {
    try {
      return fn();
    } catch (_) {}
  }

  function reg() {
    return global.CrozzoOpAckRegistry || null;
  }

  function hybridMode() {
    try {
      if (typeof global.config !== 'undefined' && global.config.get) {
        var m = String(global.config.get('runtimeSyncModo') || 'hybrid').toLowerCase();
        return m === 'hybrid' || m === 'online';
      }
    } catch (_) {}
    return true;
  }

  function lanReady() {
    try {
      if (typeof global.crozzoLocalSyncPathReady === 'function') return global.crozzoLocalSyncPathReady();
    } catch (_) {}
    return false;
  }

  function cloudPushOk() {
    try {
      if (typeof global.crozzoTierAllowsCloudSync === 'function' && !global.crozzoTierAllowsCloudSync()) {
        return false;
      }
    } catch (_) {}
    try {
      var thr = global.CrozzoCloudThrottle;
      if (thr && typeof thr.isUnderPressure === 'function' && thr.isUnderPressure()) return false;
    } catch (_) {}
    return true;
  }

  function scheduleRetry(opId, retryFn, retries) {
    if (!opId || !retryFn) return;
    var R = reg();
    if (R && R.isAcked(opId)) return;
    if (retries >= MAX_RETRIES) return;
    global.setTimeout(function () {
      if (R && R.isAcked(opId)) return;
      retryFn(retries + 1);
    }, RETRY_GAP_MS);
  }

  function watchPending(opId, retryFn) {
    if (!opId) return;
    global.setTimeout(function () {
      var R = reg();
      if (!R || R.isAcked(opId)) return;
      scheduleRetry(opId, retryFn, 0);
    }, ACK_WAIT_MS);
  }

  function buildEstadoBody(comanda, estado) {
    var ctx = { businessId: '', deviceId: '', locationId: '' };
    safe(function () {
      if (typeof global.crozzoComandaCloudCtx === 'function') ctx = global.crozzoComandaCloudCtx();
    });
    var est = estado || comanda.estado;
    var opId =
      String(comanda.transaction_id || comanda.id || '') +
      ':' +
      String(est || '') +
      ':' +
      String(comanda.lastUpdateAt || new Date().toISOString());
    var body = {
      uuid: opId,
      action_id: opId,
      op_id: opId,
      businessId: ctx.businessId,
      deviceId: ctx.deviceId,
      location_id: ctx.locationId,
      type: 'comanda_estado',
      data: {
        id: comanda.id,
        transaction_id: comanda.transaction_id,
        estado: est,
        lastUpdateAt: comanda.lastUpdateAt || new Date().toISOString(),
      },
    };
    if (reg() && typeof reg().ensureOpId === 'function') reg().ensureOpId(body);
    else if (typeof global.crozzoLanEnsureActionId === 'function') global.crozzoLanEnsureActionId(body);
    return body;
  }

  function sendEstadoLan(comanda, estado) {
    if (!lanReady()) return;
    if (typeof global.crozzoPushComandaEstadoLan === 'function') {
      global.crozzoPushComandaEstadoLan(comanda, estado).catch(function () {});
    } else {
      var body = buildEstadoBody(comanda, estado);
      if (typeof global.crozzoLanPostSync === 'function') {
        global.crozzoLanPostSync(body, { timeoutMs: 5500 }).catch(function () {});
      }
    }
    safe(function () {
      if (global.CrozzoLanWebSocketBridge && typeof global.CrozzoLanWebSocketBridge.notifyEstado === 'function') {
        global.CrozzoLanWebSocketBridge.notifyEstado(comanda, estado || comanda.estado);
      }
    });
    safe(function () {
      if (global.CrozzoLanOpsSync && typeof global.CrozzoLanOpsSync.emitWithDelta === 'function') {
        global.CrozzoLanOpsSync.emitWithDelta('comanda', {
          id: comanda.id,
          transaction_id: comanda.transaction_id,
          estado: estado || comanda.estado,
        });
      }
    });
  }

  function meshEmitAllowed(force) {
    if (force) return true;
    try {
      if (global.CrozzoTransportPathHealth && typeof global.CrozzoTransportPathHealth.shouldEmitMesh === 'function') {
        return global.CrozzoTransportPathHealth.shouldEmitMesh(false);
      }
    } catch (_) {}
    return !cloudPushOk() || !lanReady();
  }

  /** Mesh unificado: gossip + BLE + Wi‑Fi Direct / P2P (mismo op_id / OpAck). */
  function sendEstadoMesh(comanda, estado, force) {
    if (!meshEmitAllowed(force)) return;
    var est = estado || comanda.estado;
    safe(function () {
      if (global.CrozzoOfflineGossip && typeof global.CrozzoOfflineGossip.publishEstado === 'function') {
        global.CrozzoOfflineGossip.publishEstado(comanda.id, est, comanda.transaction_id, { force: !!force });
      }
    });
    safe(function () {
      if (global.CrozzoBleMesh && typeof global.CrozzoBleMesh.publishEstado === 'function') {
        global.CrozzoBleMesh.publishEstado(comanda.id, est, comanda.transaction_id, { force: !!force });
      }
    });
    safe(function () {
      if (global.CrozzoWifiDirectBridge && typeof global.CrozzoWifiDirectBridge.publishEstado === 'function') {
        global.CrozzoWifiDirectBridge.publishEstado(comanda, est, { force: !!force }).catch(function () {});
      }
    });
  }

  function sendNewMesh(ids, force) {
    if (!meshEmitAllowed(force)) return;
    safe(function () {
      if (global.CrozzoOfflineGossip && typeof global.CrozzoOfflineGossip.publishComandaNewByIds === 'function') {
        global.CrozzoOfflineGossip.publishComandaNewByIds(ids, { force: !!force });
      }
    });
    safe(function () {
      if (global.CrozzoBleMesh && typeof global.CrozzoBleMesh.publishComandaNewByIds === 'function') {
        global.CrozzoBleMesh.publishComandaNewByIds(ids, { force: !!force });
      }
    });
    safe(function () {
      if (!global.CrozzoWifiDirectBridge || typeof global.CrozzoWifiDirectBridge.publishComandaNew !== 'function') return;
      ids.forEach(function (id) {
        var c =
          typeof global.__crozzoEmergencyFindComandaById === 'function'
            ? global.__crozzoEmergencyFindComandaById(id)
            : null;
        if (c) global.CrozzoWifiDirectBridge.publishComandaNew(c, { force: !!force }).catch(function () {});
      });
    });
  }

  function sendEstadoCloud(comanda) {
    safe(function () {
      if (typeof global.crozzoComandaOutboxEnqueue === 'function') {
        global.crozzoComandaOutboxEnqueue(comanda);
      }
    });
    if (!cloudPushOk()) return;
    safe(function () {
      if (typeof global.crozzoFlushComandaOutbox === 'function') {
        global.crozzoFlushComandaOutbox();
      }
    });
  }

  function comandaEstado(comanda, estado) {
    if (!comanda) return;
    var est = estado || comanda.estado;
    var body = buildEstadoBody(comanda, est);
    var opId = body.op_id;
    var R = reg();
    if (R) {
      R.registerPending(opId, { kind: 'comanda_estado' });
      R.markPushed(body);
    }

    sendEstadoCloud(comanda);
    if (hybridMode() || !cloudPushOk()) {
      sendEstadoLan(comanda, est);
      /* Mesh solo si path lo pide (anti-solape vs WS primario); force si sin nube. */
      sendEstadoMesh(comanda, est, !cloudPushOk());
    }
    safe(function () {
      if (global.CrozzoTransportPathHealth && typeof global.CrozzoTransportPathHealth.emitChanged === 'function') {
        global.CrozzoTransportPathHealth.emitChanged();
      }
    });

    watchPending(opId, function retryEstado(retries) {
      sendEstadoLan(comanda, est);
      sendEstadoMesh(comanda, est, true);
      scheduleRetry(opId, retryEstado, retries);
    });
  }

  function comandaNewByIds(ids) {
    if (!Array.isArray(ids) || !ids.length) return;
    ids.forEach(function (id) {
      var c = null;
      if (typeof global.__crozzoEmergencyFindComandaById === 'function') {
        c = global.__crozzoEmergencyFindComandaById(id);
      }
      if (!c || !c.transaction_id) return;
      var R = reg();
      if (R) R.registerPending(String(c.transaction_id), { kind: 'comanda_new' });
    });

    safe(function () {
      if (typeof global.crozzoPushComandasCloudByIds === 'function') {
        global.crozzoPushComandasCloudByIds(ids);
      }
    });
    var parallelLan =
      hybridMode() ||
      !cloudPushOk() ||
      (typeof global.crozzoZ0HybridParallelLan === 'function' && global.crozzoZ0HybridParallelLan());
    if (parallelLan) {
      safe(function () {
        if (typeof global.crozzoPushComandasLanByIds === 'function') {
          global.crozzoPushComandasLanByIds(ids);
        }
      });
      safe(function () {
        if (
          global.CrozzoLanWebSocketBridge &&
          typeof global.CrozzoLanWebSocketBridge.notifyComandasByIds === 'function'
        ) {
          global.CrozzoLanWebSocketBridge.notifyComandasByIds(ids);
        }
      });
      sendNewMesh(ids, !cloudPushOk());
    }
    safe(function () {
      if (typeof global.maybeEmergencyBroadcastComandas === 'function') {
        global.maybeEmergencyBroadcastComandas(ids);
      }
    });
  }

  function runtimeTouch(priority) {
    priority = priority === 'flush' ? 'flush' : priority === 'fast' ? 'fast' : 'normal';
    safe(function () {
      if (typeof global.crozzoSchedulePosRuntimeCloudPush === 'function') {
        global.crozzoSchedulePosRuntimeCloudPush(priority);
      }
    });
    var parallelLan =
      hybridMode() ||
      !cloudPushOk() ||
      (typeof global.crozzoZ0HybridParallelLan === 'function' && global.crozzoZ0HybridParallelLan());
    if (parallelLan) {
      safe(function () {
        if (global.CrozzoLanOpsSync && typeof global.CrozzoLanOpsSync.emitWithDelta === 'function') {
          global.CrozzoLanOpsSync.emitWithDelta('runtime', { at: Date.now(), pri: priority });
        }
      });
    }
  }

  global.CrozzoOpFanout = {
    comandaEstado: comandaEstado,
    comandaNewByIds: comandaNewByIds,
    runtimeTouch: runtimeTouch,
    meshEmitAllowed: meshEmitAllowed,
    sendEstadoMesh: sendEstadoMesh,
    sendNewMesh: sendNewMesh,
  };
  global.crozzoOpFanoutComandaEstado = comandaEstado;
  global.crozzoOpFanoutComandaNewByIds = comandaNewByIds;
  global.crozzoOpFanoutRuntimeTouch = runtimeTouch;
})(typeof window !== 'undefined' ? window : globalThis);
