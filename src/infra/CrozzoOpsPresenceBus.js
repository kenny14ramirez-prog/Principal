/**
 * Crozzo — Plano Ops Efímero (POE)
 * --------------------------------------------------------------------------
 * Presencia enter/exit mesa por canal efímero (Broadcast / LAN / mesh).
 * NO upserta crozzo_mesa_runtime meta en cada evento.
 * Checkpoint opcional a meta cada CHECKPOINT_MS o al pedir forceCheckpoint.
 *
 * Consola: crozzoOpsPresenceMetrics() · crozzoOpsPresencePublish('slot_presence_enter')
 */
(function (global) {
  'use strict';

  var CHECKPOINT_MS = 90000;
  var __checkpointTimer = null;
  var __lastPublishAt = 0;
  var __metrics = {
    publishEnter: 0,
    publishExit: 0,
    publishHeartbeat: 0,
    applyRemote: 0,
    cloudBroadcast: 0,
    lanEmit: 0,
    meshEmit: 0,
    metaCheckpoint: 0,
    skippedMetaForce: 0
  };

  function md() {
    return typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
  }

  function deviceId() {
    try {
      if (typeof global.ensureCrozzoDeviceId === 'function') return String(global.ensureCrozzoDeviceId() || '');
    } catch (_) {}
    try {
      return String((global.localStorage && global.localStorage.getItem('crozzo_device_id')) || '');
    } catch (_) {
      return '';
    }
  }

  function exportPresence() {
    try {
      if (typeof global.crozzoExportSlotSessionPresenceForCloud === 'function') {
        return global.crozzoExportSlotSessionPresenceForCloud();
      }
    } catch (_) {}
    return { mesa: {}, llevar: {} };
  }

  function buildEnvelope(reason, opts) {
    opts = opts || {};
    var cfg = md();
    return {
      type: 'slot_presence',
      kind: 'presence',
      reason: String(reason || 'presence'),
      action: /exit/i.test(String(reason)) ? 'exit' : /enter/i.test(String(reason)) ? 'enter' : 'sync',
      locationId: String(cfg.locationId || '').trim(),
      businessId: String(cfg.businessId || '').trim(),
      deviceId: deviceId(),
      at: Date.now(),
      slotSessionPresence: opts.presence || exportPresence()
    };
  }

  function noteMetric(key) {
    if (__metrics[key] != null) __metrics[key]++;
  }

  function applyRemote(envelope, via) {
    if (!envelope || !envelope.slotSessionPresence) return false;
    var my = deviceId();
    if (my && envelope.deviceId && String(envelope.deviceId) === String(my)) return false;
    var cfg = md();
    if (
      envelope.locationId &&
      cfg.locationId &&
      String(envelope.locationId) !== String(cfg.locationId)
    ) {
      return false;
    }
    var ok = false;
    try {
      if (typeof global.applyPosRuntimeSnapshot === 'function') {
        ok = !!global.applyPosRuntimeSnapshot(
          { v: 1, slotSessionPresence: envelope.slotSessionPresence },
          { skipUiFields: true, presenceOnly: true }
        );
      } else if (typeof global.crozzoMergeSlotSessionPresence === 'function') {
        global.crozzoMergeSlotSessionPresence(envelope.slotSessionPresence);
        ok = true;
      }
    } catch (_) {
      ok = false;
    }
    if (ok) {
      noteMetric('applyRemote');
      try {
        if (typeof global.crozzoRefreshSlotLocksUi === 'function') global.crozzoRefreshSlotLocksUi();
      } catch (_) {}
      try {
        if (typeof global.crozzoHandleRemoteRuntimeUiSync === 'function') {
          global.crozzoHandleRemoteRuntimeUiSync({ skipCartReconcile: true });
        }
      } catch (_) {}
    }
    return ok;
  }

  function emitCloud(envelope) {
    try {
      if (typeof global.crozzoOpsPulseEmitPresence === 'function') {
        global.crozzoOpsPulseEmitPresence(envelope);
        noteMetric('cloudBroadcast');
        return true;
      }
      if (global.CrozzoCloudOpsPulse && typeof global.CrozzoCloudOpsPulse.emitPresence === 'function') {
        global.CrozzoCloudOpsPulse.emitPresence(envelope);
        noteMetric('cloudBroadcast');
        return true;
      }
    } catch (_) {}
    return false;
  }

  function emitLan(envelope) {
    var body = {
      type: 'slot_presence',
      data: envelope,
      deviceId: envelope.deviceId,
      at: envelope.at
    };
    var sent = false;
    try {
      if (typeof global.crozzoLanPostSync === 'function') {
        global.crozzoLanPostSync(body, { quiet: true }).catch(function () {});
        sent = true;
      }
    } catch (_) {}
    try {
      if (
        global.__TAURI__ &&
        global.__TAURI__.core &&
        typeof global.__TAURI__.core.invoke === 'function'
      ) {
        var json = JSON.stringify({
          event: 'lan_push',
          endpoint: '/api/sync',
          payload: body
        });
        global.__TAURI__.core.invoke('crozzo_lan_ws_broadcast', { json: json }).catch(function () {});
        sent = true;
      }
    } catch (_) {}
    if (sent) noteMetric('lanEmit');
    return sent;
  }

  function emitMesh(envelope) {
    try {
      if (global.CrozzoOfflineGossip && typeof global.CrozzoOfflineGossip.publishSlotPresence === 'function') {
        var ok = global.CrozzoOfflineGossip.publishSlotPresence(envelope, { force: true });
        if (ok) noteMetric('meshEmit');
        return !!ok;
      }
    } catch (_) {}
    return false;
  }

  /**
   * Publica presencia efímera (enter/exit/sync). No fuerza meta DB.
   * @param {string} reason slot_presence_enter|slot_presence_exit|…
   * @param {{ forceCheckpoint?: boolean }} [opts]
   */
  function publish(reason, opts) {
    opts = opts || {};
    var r = String(reason || 'presence');
    if (/enter/i.test(r)) noteMetric('publishEnter');
    else if (/exit/i.test(r)) noteMetric('publishExit');
    else if (/heartbeat/i.test(r)) noteMetric('publishHeartbeat');
    noteMetric('skippedMetaForce');

    var envelope = buildEnvelope(r, opts);
    __lastPublishAt = Date.now();

    emitLan(envelope);
    emitCloud(envelope);
    try {
      var path = global.CrozzoTransportPathHealth;
      var mesh =
        path && typeof path.shouldEmitMesh === 'function'
          ? path.shouldEmitMesh({ force: /exit|enter/i.test(r) })
          : true;
      if (mesh) emitMesh(envelope);
    } catch (_) {
      emitMesh(envelope);
    }

    /* Persistencia local (no cloud force) */
    try {
      if (typeof global.schedulePosRuntimeSave === 'function') global.schedulePosRuntimeSave();
    } catch (_) {}

    if (opts.forceCheckpoint) checkpointMeta('force');
    ensureCheckpointTimer();
    return envelope;
  }

  function checkpointMeta(why) {
    try {
      global.__crozzoForceMetaPresencePush = true;
    } catch (_) {}
    try {
      if (typeof global.crozzoSchedulePosRuntimeCloudPush === 'function') {
        global.crozzoSchedulePosRuntimeCloudPush('flush');
      }
      if (typeof global.crozzoPushPosRuntimeCloudNow === 'function') {
        global.crozzoPushPosRuntimeCloudNow().catch(function () {});
      }
      noteMetric('metaCheckpoint');
    } catch (_) {}
    return why || 'checkpoint';
  }

  function ensureCheckpointTimer() {
    if (__checkpointTimer) return;
    __checkpointTimer = global.setInterval(function () {
      try {
        if (typeof document !== 'undefined' && document.hidden) return;
      } catch (_) {}
      if (Date.now() - __lastPublishAt > CHECKPOINT_MS * 2) return;
      checkpointMeta('timer');
    }, CHECKPOINT_MS);
  }

  function metrics() {
    var metaStats = {};
    try {
      metaStats = global.__crozzoOpsPlaneMetaStats || {};
    } catch (_) {}
    return Object.assign({}, __metrics, {
      lastPublishAgoMs: __lastPublishAt ? Date.now() - __lastPublishAt : null,
      checkpointMs: CHECKPOINT_MS,
      dbMetaUpserts: Number(metaStats.metaUpserts) || 0,
      dbMesaUpserts: Number(metaStats.mesaUpserts) || 0,
      opsPulseLive: !!(
        global.CrozzoCloudOpsPulse &&
        typeof global.CrozzoCloudOpsPulse.status === 'function' &&
        (global.CrozzoCloudOpsPulse.status() || {}).live
      )
    });
  }

  global.CrozzoOpsPresenceBus = {
    publish: publish,
    applyRemote: applyRemote,
    checkpointMeta: checkpointMeta,
    metrics: metrics,
    buildEnvelope: buildEnvelope
  };
  global.crozzoOpsPresencePublish = publish;
  global.crozzoOpsPresenceApply = applyRemote;
  global.crozzoOpsPresenceMetrics = metrics;
  global.crozzoOpsPresenceCheckpoint = checkpointMeta;
})(typeof window !== 'undefined' ? window : globalThis);
