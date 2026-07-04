/**
 * Malla offline Crozzo — gossip de comandas cuando no hay cloud ni LAN.
 * Modo standby (híbrido): escucha peers sin publicar si nube/LAN confirman.
 * Prioridad: cloud > LAN/hotspot > EmergencyMesh WebRTC > gossip UDP.
 * No interfiere con rutas activas; solo complementa tier offline.
 */
(function (global) {
  'use strict';

  var PROTO = 1;
  var MAX_HOPS = 5;
  var HELLO_MS = 8000;
  var POLL_MS = 2200;
  var DEDUP_MS = 600000;
  var MAX_DEDUP = 500;

  var _active = false;
  var _pollTimer = null;
  var _helloTimer = null;
  var _tierTimer = null;
  var _seen = {};
  var _peerIds = {};
  var _bc = null;
  var _udpOk = false;
  var _udpPeerCount = 0;
  var _lastTier = '';
  var _applying = false;
  var _standbyMode = false;

  function log(msg) {
    try {
      console.log('[gossip]', msg);
    } catch (_) {}
  }

  function deviceId() {
    try {
      if (typeof global.ensureCrozzoDeviceId === 'function') return String(global.ensureCrozzoDeviceId());
    } catch (_) {}
    try {
      return String(global.localStorage.getItem('device_id') || 'tablet-' + Math.random().toString(36).slice(2, 8));
    } catch (_) {
      return 'tablet-unknown';
    }
  }

  function meshCtx() {
    var md = typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
    return {
      businessId: String(md.businessId || 'default').trim() || 'default',
      locationId: String(md.locationId || 'default').trim() || 'default',
      deviceId: deviceId(),
    };
  }

  function isTauri() {
    try {
      return !!(global.__TAURI__ && global.__TAURI__.core && typeof global.__TAURI__.core.invoke === 'function');
    } catch (_) {
      return false;
    }
  }

  /** En PC (Tauri) la malla BLE usa el mismo socket UDP; gossip no debe pararlo. */
  function desktopUdpOwnedByBleMesh() {
    if (!isTauri()) return false;
    try {
      if (global.CrozzoDeviceForm && typeof global.CrozzoDeviceForm.isAndroidApk === 'function') {
        if (global.CrozzoDeviceForm.isAndroidApk()) return false;
      }
      if (global.CrozzoAndroidNative && typeof global.CrozzoAndroidNative.isAndroidApk === 'function') {
        if (global.CrozzoAndroidNative.isAndroidApk()) return false;
      }
    } catch (_) {}
    return !!(global.CrozzoBleMesh && typeof global.CrozzoBleMesh.getStatus === 'function');
  }

  function bleMeshUdpActive() {
    if (!desktopUdpOwnedByBleMesh()) return false;
    try {
      var st = global.CrozzoBleMesh.getStatus();
      return !!(st && (st.active || st.gossipUdp || st.native));
    } catch (_) {}
    return false;
  }

  function invoke(cmd, args) {
    return global.__TAURI__.core.invoke(cmd, args || {});
  }

  function tierNow() {
    return String(global.__CROZZO_TIER_LAST || 'offline');
  }

  function meshLinkReady() {
    try {
      return !!(
        global.CrozzoEmergencyMesh &&
        typeof global.CrozzoEmergencyMesh.isLinkReady === 'function' &&
        global.CrozzoEmergencyMesh.isLinkReady()
      );
    } catch (_) {
      return false;
    }
  }

  function hybridBackupNeeded() {
    try {
      if (typeof global.config === 'undefined' || !global.config.get) return false;
      if (String(global.config.get('runtimeSyncModo') || 'hybrid').toLowerCase() !== 'hybrid') return false;
      var last = global.__CROZZO_LAN_LAST_OK;
      if (!last || Date.now() - last > 28000) return true;
      if (typeof global.crozzoIsLocalLanSegmentUp === 'function' && !global.crozzoIsLocalLanSegmentUp()) {
        return true;
      }
      var ds = global.__CROZZO_DIRECTOR_STATE;
      if (ds && (ds.mode === 'lan_seek' || ds.mode === 'isolated')) return true;
    } catch (_) {}
    return false;
  }

  function meshStandbyEnabled() {
    if (global.__CROZZO_GOSSIP_FORCE === true) return false;
    if (typeof global.crozzoMeshStandbyEnabled === 'function') return global.crozzoMeshStandbyEnabled();
    try {
      if (typeof global.config === 'undefined' || !global.config.get) return true;
      if (String(global.config.get('runtimeSyncModo') || 'hybrid').toLowerCase() !== 'hybrid') return false;
      var sb = global.config.get('runtimeSyncMeshStandby');
      if (sb === false || sb === '0') return false;
    } catch (_) {}
    return true;
  }

  function lanPrimaryReady() {
    try {
      if (typeof global.crozzoLanTransportAllowed === 'function' && !global.crozzoLanTransportAllowed()) {
        return false;
      }
      var last = global.__CROZZO_LAN_LAST_OK;
      return !!(last && Date.now() - last < 28000);
    } catch (_) {
      return false;
    }
  }

  /** Publicar comandas/estados: bloqueado si nube, LAN o mesh primario ya cubren la ruta. */
  function shouldBlockOutboundPublish() {
    if (cloudPathLikely() || meshLinkReady()) return true;
    if (_standbyMode || meshStandbyEnabled()) {
      if (lanPrimaryReady()) return true;
    }
    return false;
  }

  function shouldRun() {
    if (global.__CROZZO_GOSSIP_FORCE === true) return true;
    var t = tierNow();
    if (meshStandbyEnabled() && (t === 'cloud' || t === 'lan' || t === 'hotspot')) {
      _standbyMode = true;
      return true;
    }
    _standbyMode = false;
    if (t === 'cloud' || t === 'lan' || t === 'hotspot') {
      if (t === 'cloud') return false;
      if (cloudPathLikely() && !hybridBackupNeeded()) return false;
      return hybridBackupNeeded();
    }
    return true;
  }

  function ensureStandby() {
    if (!meshStandbyEnabled()) return false;
    _standbyMode = true;
    if (!_active && shouldRun()) start();
    else if (_active) reconcileTier();
    return _active;
  }

  /** Tablets en la misma pestaña/subred: BroadcastChannel permite malla sin caja. */
  function sameSubnetLikely() {
    if (typeof global.BroadcastChannel !== 'function') return false;
    try {
      if (typeof global.crozzoIsLocalLanSegmentUp === 'function' && global.crozzoIsLocalLanSegmentUp()) {
        return true;
      }
    } catch (_) {}
    return tierNow() === 'offline' || tierNow() === 'mesh';
  }

  /** Arranque agresivo de malla cuando humanos dejan tablets en la misma Wi‑Fi sin caja. */
  function bootstrapCluster() {
    if (!shouldRun() && !sameSubnetLikely()) return false;
    global.__CROZZO_GOSSIP_FORCE = false;
    if (!_active) start();
    sendHello();
    if (global.CrozzoInternalQrRegistry && typeof global.CrozzoInternalQrRegistry.requestPeerQrCatalog === 'function') {
      global.CrozzoInternalQrRegistry.requestPeerQrCatalog({ force: true });
    }
    return true;
  }

  function cloudPathLikely() {
    try {
      var t = tierNow();
      if (t === 'cloud') return true;
      if (t === 'lan' || t === 'hotspot') {
        return (
          typeof global.crozzoOnlineConfigReady === 'function' &&
          global.crozzoOnlineConfigReady() &&
          !!global.__SUPABASE &&
          typeof global.navigator !== 'undefined' &&
          global.navigator.onLine
        );
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  function markTidSeen(tid, source) {
    if (!tid) return false;
    if (typeof global.__crozzoComandaTidMark === 'function') {
      if (typeof global.__crozzoComandaTidRecent === 'function' && global.__crozzoComandaTidRecent(tid, 120000)) {
        return false;
      }
      global.__crozzoComandaTidMark(tid, source || 'gossip');
      return true;
    }
    return true;
  }

  function comandaSnapshot(c) {
    if (!c) return null;
    return JSON.parse(JSON.stringify(c));
  }

  function newMsgId(prefix) {
    var r = Math.random().toString(36).slice(2, 10);
    return String(prefix || 'g') + '-' + Date.now().toString(36) + '-' + r;
  }

  function pruneSeen() {
    var now = Date.now();
    var keys = Object.keys(_seen);
    if (keys.length <= MAX_DEDUP) return;
    keys.forEach(function (k) {
      if (now - _seen[k] > DEDUP_MS) delete _seen[k];
    });
    keys = Object.keys(_seen);
    if (keys.length > MAX_DEDUP) {
      keys
        .sort(function (a, b) {
          return _seen[a] - _seen[b];
        })
        .slice(0, keys.length - MAX_DEDUP)
        .forEach(function (k) {
          delete _seen[k];
        });
    }
  }

  function markSeen(msgId) {
    if (!msgId) return false;
    if (_seen[msgId]) return false;
    _seen[msgId] = Date.now();
    pruneSeen();
    return true;
  }

  function ctxMatch(frame) {
    if (!frame) return false;
    var ctx = meshCtx();
    if (frame.businessId && ctx.businessId && frame.businessId !== ctx.businessId) return false;
    if (frame.locationId && ctx.locationId && frame.locationId !== ctx.locationId) return false;
    if (frame.deviceId && frame.deviceId === ctx.deviceId) return false;
    return true;
  }

  function deviceAcceptsArea(areaId) {
    if (!areaId) return true;
    if (typeof global.crozzoDeviceShowsComandaArea === 'function') {
      return global.crozzoDeviceShowsComandaArea(areaId);
    }
    return true;
  }

  function buildFrame(kind, payload, hop) {
    var ctx = meshCtx();
    return {
      v: PROTO,
      kind: kind,
      msgId: newMsgId(kind),
      hop: hop || 0,
      ttl: MAX_HOPS,
      at: Date.now(),
      deviceId: ctx.deviceId,
      businessId: ctx.businessId,
      locationId: ctx.locationId,
      payload: payload || {},
    };
  }

  function sendFrame(frame) {
    if (!frame || !frame.msgId) return;
    var raw = '';
    try {
      raw = JSON.stringify(frame);
    } catch (_) {
      return;
    }
    if (_bc) {
      try {
        _bc.postMessage(raw);
      } catch (_) {}
    }
    if (_udpOk && isTauri() && !desktopUdpOwnedByBleMesh()) {
      invoke('crozzo_gossip_udp_send', { json: raw }).catch(function (e) {
        log('udp send ' + e);
      });
    }
    if (global.CrozzoBleMesh && typeof global.CrozzoBleMesh.sendRaw === 'function') {
      global.CrozzoBleMesh.sendRaw(raw);
    }
  }

  var RELAY_KINDS = { COMANDA_NEW: 1, COMANDA_ESTADO: 1, INTERNAL_QR_SLOT: 1, PEER_COMM: 1 };

  // Reenvío epidémico: preserva msgId y origen para que el dedup por msgId
  // detenga la propagación; solo incrementa el contador de saltos.
  function relay(frame) {
    if (!frame || !RELAY_KINDS[frame.kind]) return;
    var hop = frame.hop || 0;
    if (hop >= (frame.ttl || MAX_HOPS)) return;
    var next = JSON.parse(JSON.stringify(frame));
    next.hop = hop + 1;
    sendFrame(next);
  }

  function touchPeer(id) {
    if (!id) return;
    _peerIds[id] = Date.now();
    var cutoff = Date.now() - 45000;
    Object.keys(_peerIds).forEach(function (k) {
      if (_peerIds[k] < cutoff) delete _peerIds[k];
    });
  }

  function applyComandaNew(snap, opts) {
    opts = opts || {};
    if (global.CrozzoOperationalIngest && typeof global.CrozzoOperationalIngest.applyComandaNew === 'function') {
      global.CrozzoOperationalIngest.applyComandaNew(snap, { via: 'mesh', skipPrint: !!opts.skipPrint });
      return;
    }
    if (!snap || snap.id == null) return;
    if (!deviceAcceptsArea(snap.areaId)) return;
    var tid = String(snap.transaction_id || '');
    if (tid && !markTidSeen(tid, 'gossip_rx')) return;
    if (typeof global.__crozzoEmergencyApplyComandaSnapshot === 'function') {
      global.__crozzoEmergencyApplyComandaSnapshot(snap, { skipPrint: !!opts.skipPrint, source: 'gossip' });
    }
    try {
      if (typeof global.crozzoPublishComandasGlobal === 'function') global.crozzoPublishComandasGlobal();
    } catch (_) {}
    if (typeof global.crozzoOpEmitAck === 'function') {
      var ackId = tid || String(snap.id || '');
      if (ackId) global.crozzoOpEmitAck(ackId, 'mesh');
    }
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
    if (pay.id != null) {
      return global.comandas.find(function (x) {
        return x.id === pay.id;
      }) || null;
    }
    return null;
  }

  function applyComandaEstado(pay) {
    if (global.CrozzoOperationalIngest && typeof global.CrozzoOperationalIngest.applyComandaEstado === 'function') {
      _applying = true;
      try {
        global.CrozzoOperationalIngest.applyComandaEstado(pay, { via: 'mesh' });
      } finally {
        _applying = false;
      }
      return;
    }
    if (!pay) return;
    var c = findComanda(pay);
    if (!c) return;
    _applying = true;
    try {
      if (pay.estado === 'entregada') {
        if (typeof global.despacharComanda === 'function') {
          global.despacharComanda(c.id, { skipToast: true, skipGossip: true });
        }
        return;
      }
      if (typeof global.updateComandaEstado === 'function') {
        global.updateComandaEstado(c.id, pay.estado, { skipFanout: true });
      } else {
        c.estado = pay.estado;
        c.lastUpdateAt = pay.lastUpdateAt || new Date().toISOString();
        try {
          if (global.config && global.config.addAudit) {
            global.config.addAudit('comanda_estado_gossip', 'Comanda #' + c.id + ' -> ' + pay.estado);
          }
        } catch (_) {}
        try {
          if (typeof global.schedulePosRuntimeSave === 'function') global.schedulePosRuntimeSave();
        } catch (_) {}
        if (global.currentPage === 'cocina' && typeof global.renderPage === 'function') global.renderPage('cocina');
        try {
          if (typeof global.crozzoPublishComandasGlobal === 'function') global.crozzoPublishComandasGlobal();
        } catch (_) {}
      }
    } finally {
      _applying = false;
    }
    if (typeof global.crozzoOpEmitAck === 'function') {
      var ackId =
        String(pay.transaction_id || pay.id || '') +
        ':' +
        String(pay.estado || '') +
        ':' +
        String(pay.lastUpdateAt || '');
      global.crozzoOpEmitAck(ackId, 'mesh');
    }
  }

  function qrExchangeAllowed() {
    if (global.CrozzoInternalQrRegistry && typeof global.CrozzoInternalQrRegistry.isEmergencyActive === 'function') {
      if (global.CrozzoInternalQrRegistry.isEmergencyActive()) return true;
    }
    if (shouldRun()) return true;
    try {
      if (typeof global.crozzoTierAllowsCloudSync === 'function' && !global.crozzoTierAllowsCloudSync()) return true;
    } catch (_) {}
    return false;
  }

  function ensureActiveForQr() {
    if (_active) return;
    if (shouldRun()) {
      start();
      return;
    }
    if (!qrExchangeAllowed()) return;
    var t = tierNow();
    if (t === 'offline' || t === 'mesh' || t === 'qr') {
      start();
      return;
    }
    if (
      global.CrozzoInternalQrRegistry &&
      typeof global.CrozzoInternalQrRegistry.isEmergencyActive === 'function' &&
      global.CrozzoInternalQrRegistry.isEmergencyActive()
    ) {
      start();
    }
  }

  function qrSlotPayload(entry) {
    return {
      deviceId: String(entry.deviceId || ''),
      deviceRole: String(entry.deviceRole || 'B'),
      deviceName: String(entry.deviceName || ''),
      businessId: String(entry.businessId || ''),
      locationId: String(entry.locationId || ''),
      slot: String(entry.slot || ''),
      builtAt: Number(entry.builtAt) || 0,
      validUntil: Number(entry.validUntil) || 0,
      scanText: String(entry.scanText || ''),
      payloadJson: entry.payloadJson || null,
      ip: String(entry.ip || ''),
      port: Number(entry.port) || 3000,
    };
  }

  function publishInternalQrSlot(entry) {
    if (!entry || !entry.scanText || !entry.deviceId) return false;
    if (!qrExchangeAllowed()) return false;
    ensureActiveForQr();
    if (!_active) return false;
    sendFrame(buildFrame('INTERNAL_QR_SLOT', qrSlotPayload(entry), 0));
    return true;
  }

  function publishInternalQrRequest() {
    if (!qrExchangeAllowed()) return false;
    ensureActiveForQr();
    if (!_active) return false;
    sendFrame(buildFrame('INTERNAL_QR_REQ', { from: meshCtx().deviceId }, 0));
    return true;
  }

  function ingestInternalQrSlot(payload) {
    if (!payload || !payload.scanText || !payload.deviceId) return;
    var dedupId = 'qrslot:' + payload.deviceId + ':' + payload.slot;
    if (!markSeen(dedupId)) return;
    if (global.CrozzoInternalQrRegistry && typeof global.CrozzoInternalQrRegistry.ingestPeerSlotEntry === 'function') {
      global.CrozzoInternalQrRegistry.ingestPeerSlotEntry(payload, { source: 'mesh' });
    }
  }

  function respondInternalQrCatalog() {
    if (global.CrozzoInternalQrRegistry && typeof global.CrozzoInternalQrRegistry.respondWithOwnSlots === 'function') {
      global.CrozzoInternalQrRegistry.respondWithOwnSlots();
    }
  }

  function ingestFrame(frame) {
    if (!frame || frame.v !== PROTO || !frame.kind || !frame.msgId) return;
    if (!ctxMatch(frame)) return;
    if (!markSeen(frame.msgId)) return;
    touchPeer(frame.deviceId);
    relay(frame);

    if (frame.kind === 'HELLO' || frame.kind === 'HELLO_ACK') {
      if (frame.kind === 'HELLO') {
        sendFrame(buildFrame('HELLO_ACK', { from: meshCtx().deviceId }, 0));
      }
      return;
    }
    if (frame.kind === 'COMANDA_NEW') {
      var tidNew = frame.payload && frame.payload.transaction_id ? String(frame.payload.transaction_id) : '';
      if (tidNew && typeof global.__crozzoComandaTidRecent === 'function' && global.__crozzoComandaTidRecent(tidNew, 180000)) {
        return;
      }
      applyComandaNew(frame.payload, {});
      return;
    }
    if (frame.kind === 'COMANDA_ESTADO') {
      applyComandaEstado(frame.payload);
      return;
    }
    if (frame.kind === 'OP_ACK') {
      if (typeof global.crozzoOpHandleAck === 'function') {
        global.crozzoOpHandleAck({ type: 'op_ack', data: frame.payload || {} });
      }
      return;
    }
    if (frame.kind === 'INTERNAL_QR_SLOT') {
      ingestInternalQrSlot(frame.payload);
      return;
    }
    if (frame.kind === 'PEER_COMM') {
      if (typeof global.crozzoIngestRemoteCommState === 'function') {
        global.crozzoIngestRemoteCommState(frame.payload || {}, 'gossip');
      }
      return;
    }
    if (frame.kind === 'INTERNAL_QR_REQ' || frame.kind === 'INTERNAL_QR_BEACON') {
      respondInternalQrCatalog();
    }
  }

  function ingestRaw(raw) {
    if (!raw || typeof raw !== 'string') return;
    var frame = null;
    try {
      frame = JSON.parse(raw);
    } catch (_) {
      return;
    }
    ingestFrame(frame);
  }

  function drainTransports() {
    if (_udpOk && isTauri() && !desktopUdpOwnedByBleMesh()) {
      invoke('crozzo_gossip_udp_drain')
        .then(function (rows) {
          (rows || []).forEach(ingestRaw);
        })
        .catch(function () {});
      invoke('crozzo_gossip_udp_status')
        .then(function (st) {
          if (st && typeof st.peerCount === 'number') _udpPeerCount = st.peerCount;
        })
        .catch(function () {});
    }
  }

  function sendHello() {
    if (!_active) return;
    sendFrame(buildFrame('HELLO', { role: meshCtx().deviceId }, 0));
  }

  function publishComandaNew(comanda, opts) {
    opts = opts || {};
    if (_applying || !_active || !comanda) return false;
    if (!opts.force && shouldBlockOutboundPublish()) return false;
    var snap = comandaSnapshot(comanda);
    if (!snap) return false;
    if (snap.transaction_id) markTidSeen(snap.transaction_id, 'gossip_tx');
    sendFrame(buildFrame('COMANDA_NEW', snap, 0));
    return true;
  }

  function publishComandaNewByIds(ids, opts) {
    opts = opts || {};
    if (!_active || !ids || !ids.length) return 0;
    if (!opts.force && shouldBlockOutboundPublish()) return 0;
    var n = 0;
    ids.forEach(function (id) {
      var c = null;
      if (typeof global.__crozzoEmergencyFindComandaById === 'function') {
        c = global.__crozzoEmergencyFindComandaById(id);
      }
      if (publishComandaNew(c, opts)) n++;
    });
    return n;
  }

  function publishEstado(id, estado, transactionId, opts) {
    opts = opts || {};
    if (_applying || !_active) return false;
    if (!opts.force && shouldBlockOutboundPublish()) return false;
    sendFrame(
      buildFrame(
        'COMANDA_ESTADO',
        {
          id: id,
          estado: estado,
          transaction_id: transactionId || '',
          lastUpdateAt: new Date().toISOString(),
        },
        0
      )
    );
    return true;
  }

  function publishOpAck(opId, fromDevice, via) {
    if (!opId || !_active) return false;
    sendFrame(
      buildFrame(
        'OP_ACK',
        {
          op_id: String(opId),
          action_id: String(opId),
          fromDeviceId: String(fromDevice || meshCtx().deviceId || ''),
          deviceId: String(fromDevice || meshCtx().deviceId || ''),
          via: via || 'mesh',
          at: Date.now(),
        },
        0
      )
    );
    return true;
  }

  function stopTimers() {
    if (_pollTimer) {
      clearInterval(_pollTimer);
      _pollTimer = null;
    }
    if (_helloTimer) {
      clearInterval(_helloTimer);
      _helloTimer = null;
    }
    if (_tierTimer) {
      clearInterval(_tierTimer);
      _tierTimer = null;
    }
  }

  function stop() {
    _active = false;
    _standbyMode = false;
    stopTimers();
    if (_bc) {
      try {
        _bc.close();
      } catch (_) {}
      _bc = null;
    }
    if (_udpOk && isTauri()) {
      if (!bleMeshUdpActive()) {
        invoke('crozzo_gossip_udp_stop').catch(function () {});
      }
      _udpOk = false;
    }
    log('detenido');
  }

  function start() {
    if (_active) return;
    if (!shouldRun() && !sameSubnetLikely()) return;
    _active = true;
    var ctx = meshCtx();

    if (typeof global.BroadcastChannel === 'function') {
      try {
        _bc = new global.BroadcastChannel('crozzo-gossip-v1');
        _bc.onmessage = function (ev) {
          ingestRaw(ev && ev.data);
        };
      } catch (_) {
        _bc = null;
      }
    }

    if (isTauri() && !desktopUdpOwnedByBleMesh()) {
      invoke('crozzo_gossip_udp_start', { deviceId: ctx.deviceId })
        .then(function () {
          _udpOk = true;
        })
        .catch(function (e) {
          log('udp start ' + e);
          _udpOk = false;
        });
    }

    _pollTimer = setInterval(drainTransports, POLL_MS);
    _helloTimer = setInterval(sendHello, HELLO_MS);
    sendHello();
    log('activo tier=' + tierNow());
  }

  function reconcileTier() {
    var t = tierNow();
    if (t === _lastTier) {
      if (_active && !shouldRun()) stop();
      else if (!_active && shouldRun()) start();
      return;
    }
    _lastTier = t;
    if (shouldRun()) start();
    else stop();
  }

  function listRecentPeers(maxAgeMs) {
    maxAgeMs = Number(maxAgeMs) > 0 ? Number(maxAgeMs) : 45000;
    var now = Date.now();
    var out = [];
    Object.keys(_peerIds).forEach(function (k) {
      var at = Number(_peerIds[k]) || 0;
      if (!k || now - at > maxAgeMs) return;
      out.push({ deviceId: k, lastSeenAt: at });
    });
    out.sort(function (a, b) {
      return (b.lastSeenAt || 0) - (a.lastSeenAt || 0);
    });
    return out;
  }

  function getStatus() {
    var peerCount = Math.max(Object.keys(_peerIds).length, _udpPeerCount || 0);
    var transport = _udpOk ? 'udp' : _bc ? 'broadcast' : 'none';
    try {
      if (global.CrozzoBleMesh && typeof global.CrozzoBleMesh.getStatus === 'function') {
        var ble = global.CrozzoBleMesh.getStatus();
        if (ble && ble.active && ble.transport && ble.transport !== 'none') {
          transport = ble.transport;
          peerCount = Math.max(peerCount, ble.peerCount || 0);
        }
      }
    } catch (_) {}
    return {
      active: _active,
      standby: _standbyMode && meshStandbyEnabled(),
      tier: tierNow(),
      peerCount: peerCount,
      udp: _udpOk,
      transport: transport,
    };
  }

  function afterMainInit() {
    reconcileTier();
    if (!_tierTimer) {
      _tierTimer = setInterval(reconcileTier, 5000);
    }
  }

  function init() {
    global.addEventListener('online', reconcileTier);
    global.addEventListener('offline', reconcileTier);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) reconcileTier();
      });
    }
    reconcileTier();
  }

  function publishPeerCommState(state) {
    if (!_active || !state) return false;
    var ctx = meshCtx();
    sendFrame(
      buildFrame(
        'PEER_COMM',
        {
          deviceId: state.deviceId || ctx.deviceId,
          role: state.role || ctx.role,
          name: '',
          commState: state,
        },
        0
      )
    );
    return true;
  }

  function publishInternalQrBeacon(meta) {
    if (!_active) return false;
    meta = meta || {};
    sendFrame(
      buildFrame(
        'INTERNAL_QR_BEACON',
        {
          peerCount: meta.peerCount != null ? meta.peerCount : 0,
          slot: String(meta.slot || ''),
        },
        0
      )
    );
    return true;
  }

  global.CrozzoOfflineGossip = {
    init: init,
    afterMainInit: afterMainInit,
    start: start,
    stop: stop,
    shouldRun: shouldRun,
    ensureStandby: ensureStandby,
    shouldBlockOutboundPublish: shouldBlockOutboundPublish,
    publishComandaNew: publishComandaNew,
    publishComandaNewByIds: publishComandaNewByIds,
    publishEstado: publishEstado,
    publishOpAck: publishOpAck,
    publishInternalQrBeacon: publishInternalQrBeacon,
    publishPeerCommState: publishPeerCommState,
    publishInternalQrSlot: publishInternalQrSlot,
    publishInternalQrRequest: publishInternalQrRequest,
    ingestRaw: ingestRaw,
    getStatus: getStatus,
    listRecentPeers: listRecentPeers,
    reconcileTier: reconcileTier,
    bootstrapCluster: bootstrapCluster,
    sameSubnetLikely: sameSubnetLikely,
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }
})(typeof window !== 'undefined' ? window : this);
