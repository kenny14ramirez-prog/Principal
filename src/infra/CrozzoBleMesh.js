/**
 * Crozzo — Malla BLE / gossip epidémico sin central.
 *
 * Cada dispositivo pregunta, comparte y retransmite (mismo protocolo que gossip UDP).
 * Transportes: nativo Tauri → gossip UDP (Windows/PC) → Web Bluetooth → WebRTC (iOS).
 */
(function (global) {
  'use strict';

  var PROTO = 1;
  var MAX_HOPS = 12;
  var MAX_PEERS = 100;
  var HELLO_MS = 9000;
  var POLL_MS = 2400;
  var SCAN_MS = 14000;
  var DEDUP_MS = 900000;
  var MAX_DEDUP = 800;
  var INV_MAX = 24;

  // Tramas propagadas multi-salto por esta capa. Las comandas las relaya
  // CrozzoOfflineGossip (capa de aplicación) para evitar reenvíos duplicados;
  // aquí solo se relaya el cambio de identidad, que es propio de la malla BLE.
  var RELAY_KINDS = { MESH_NAME_CHANGE: 1 };
  // Tramas que se guardan para anti-entropía (INV/WANT) y sanar particiones.
  var STORE_KINDS = { COMANDA_NEW: 1, COMANDA_ESTADO: 1, MESH_NAME_CHANGE: 1 };

  var SVC_UUID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
  var CH_UUID = 'f47ac10b-58cc-4372-a567-0e02b2c3d480';

  var _active = false;
  var _pollTimer = null;
  var _helloTimer = null;
  var _scanTimer = null;
  var _seen = {};
  var _peerIds = {};
  var _peerHas = {};
  var _store = {};
  var _storeOrder = [];
  var _nativeOk = false;
  var _webBtOk = false;
  var _webrtcOk = false;
  var _gossipUdpOk = false;
  var _transport = 'none';
  var _wbConnections = {};
  var _wbScan = null;

  function log(msg) {
    // RUIDO DEV: "[ble-mesh] activo transport=win-udp-mesh" = transporte UDP en Windows (diseñado).
    // No es error BLE. Debug: localStorage crozzo_debug_connectivity=1
    try {
      if (global.localStorage && global.localStorage.getItem('crozzo_debug_connectivity') === '1') {
        console.log('[ble-mesh]', msg);
      }
    } catch (_) {}
  }

  function isTauri() {
    try {
      return !!(global.__TAURI__ && global.__TAURI__.core && typeof global.__TAURI__.core.invoke === 'function');
    } catch (_) {
      return false;
    }
  }

  function invoke(cmd, args) {
    return global.__TAURI__.core.invoke(cmd, args || {});
  }

  function isIos() {
    try {
      var ua = String((global.navigator && global.navigator.userAgent) || '');
      if (/iPad|iPhone|iPod/i.test(ua)) return true;
      return (
        global.navigator &&
        global.navigator.platform === 'MacIntel' &&
        (global.navigator.maxTouchPoints || 0) > 1
      );
    } catch (_) {
      return false;
    }
  }

  function isAndroidApk() {
    try {
      if (global.CrozzoDeviceForm && typeof global.CrozzoDeviceForm.isAndroidApk === 'function') {
        return global.CrozzoDeviceForm.isAndroidApk();
      }
      if (global.CrozzoAndroidNative && typeof global.CrozzoAndroidNative.isAndroidApk === 'function') {
        return global.CrozzoAndroidNative.isAndroidApk();
      }
    } catch (_) {}
    return false;
  }

  function isDesktopTauri() {
    return isTauri() && !isAndroidApk() && !isIos();
  }

  function isWindowsDesktop() {
    if (!isDesktopTauri()) return false;
    try {
      var ua = String((global.navigator && global.navigator.userAgent) || '');
      var plat = String((global.navigator && global.navigator.platform) || '');
      return /Windows/i.test(ua) || /Win/i.test(plat);
    } catch (_) {
      return isDesktopTauri();
    }
  }

  /** Caja (rol A) y tablets (rol B) pueden unirse a la malla. */
  function meshParticipationEnabled() {
    if (global.__CROZZO_BLE_MESH_FORCE === true) return true;
    try {
      var md = typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
      if (md.allowLan === false) return false;
      var lan = global.readCrozzoLanJson && global.readCrozzoLanJson();
      if (lan && lan.lanSyncEnabled === false) return false;
      if (md.role === 'A') {
        return !!(String(md.serverIp || '').trim() || isDesktopTauri());
      }
      if (md.role === 'B') {
        return !!(String(md.centralIp || '').trim() || md.locationId);
      }
    } catch (_) {}
    return true;
  }

  function webBtCapable() {
    try {
      var bt = global.navigator && global.navigator.bluetooth;
      if (!bt) return false;
      return !!(bt.requestDevice || bt.requestLEScan);
    } catch (_) {
      return false;
    }
  }

  function deviceId() {
    try {
      if (typeof global.ensureCrozzoDeviceId === 'function') return String(global.ensureCrozzoDeviceId());
    } catch (_) {}
    try {
      return String(global.localStorage.getItem('crozzo_device_id') || 'ble-' + Math.random().toString(36).slice(2, 8));
    } catch (_) {
      return 'ble-unknown';
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

  function tierNow() {
    return String(global.__CROZZO_TIER_LAST || 'offline');
  }

  function shouldRun() {
    if (global.__CROZZO_BLE_MESH_FORCE === true) return true;
    if (!meshParticipationEnabled()) return false;
    var t = tierNow();
    if (typeof global.crozzoMeshStandbyEnabled === 'function' && global.crozzoMeshStandbyEnabled()) {
      if (t === 'cloud' || t === 'lan' || t === 'hotspot') return true;
    }
    if (t === 'cloud' || t === 'lan' || t === 'hotspot') return false;
    return true;
  }

  function cloudPathLikely() {
    try {
      if (tierNow() === 'cloud') return true;
      return (
        typeof global.crozzoOnlineConfigReady === 'function' &&
        global.crozzoOnlineConfigReady() &&
        !!global.__SUPABASE &&
        global.navigator &&
        global.navigator.onLine
      );
    } catch (_) {
      return false;
    }
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

  function newMsgId(prefix) {
    return String(prefix || 'b') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
  }

  function pruneSeen() {
    var now = Date.now();
    var keys = Object.keys(_seen);
    keys.forEach(function (k) {
      if (now - _seen[k] > DEDUP_MS) delete _seen[k];
    });
    if (keys.length > MAX_DEDUP) {
      keys
        .sort(function (a, b) {
          return (_seen[a] || 0) - (_seen[b] || 0);
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

  function storeFrame(frame, raw) {
    if (!frame || !frame.msgId || !STORE_KINDS[frame.kind]) return;
    if (_store[frame.msgId]) return;
    _store[frame.msgId] = { raw: raw || rawFromFrame(frame), at: Date.now() };
    _storeOrder.push(frame.msgId);
    while (_storeOrder.length > INV_MAX) {
      delete _store[_storeOrder.shift()];
    }
  }

  function storeIds() {
    return _storeOrder.slice();
  }

  function notePeerHas(peerId, msgIds) {
    if (!peerId || !msgIds || !msgIds.length) return;
    if (!_peerHas[peerId]) _peerHas[peerId] = {};
    msgIds.forEach(function (id) {
      if (id) _peerHas[peerId][id] = Date.now();
    });
    var keys = Object.keys(_peerHas);
    if (keys.length > MAX_PEERS) {
      keys.slice(0, keys.length - MAX_PEERS).forEach(function (k) {
        delete _peerHas[k];
      });
    }
  }

  function touchPeer(id) {
    if (!id) return;
    _peerIds[id] = Date.now();
    var cutoff = Date.now() - 120000;
    Object.keys(_peerIds).forEach(function (k) {
      if (_peerIds[k] < cutoff) delete _peerIds[k];
    });
  }

  function ctxMatch(frame) {
    if (!frame) return false;
    var ctx = meshCtx();
    if (frame.businessId && ctx.businessId && frame.businessId !== ctx.businessId) return false;
    if (frame.locationId && ctx.locationId && frame.locationId !== ctx.locationId) return false;
    if (frame.deviceId && frame.deviceId === ctx.deviceId) return false;
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

  function sendRaw(raw) {
    if (!raw || !_active) return false;
    if (_nativeOk && isTauri()) {
      invoke('crozzo_ble_mesh_send', { json: raw }).catch(function (e) {
        log('native send ' + e);
      });
    } else if (_gossipUdpOk && isTauri()) {
      invoke('crozzo_gossip_udp_send', { json: raw }).catch(function () {});
    }
    if (_webBtOk) {
      wbBroadcast(raw).catch(function () {});
    }
    if (_webrtcOk && global.CrozzoEmergencyMesh && typeof global.CrozzoEmergencyMesh.relayMeshFrame === 'function') {
      global.CrozzoEmergencyMesh.relayMeshFrame(raw);
    }
    return true;
  }

  function sendFrame(frame) {
    if (!frame || !frame.msgId) return;
    var raw = '';
    try {
      raw = JSON.stringify(frame);
    } catch (_) {
      return;
    }
    storeFrame(frame, raw);
    sendRaw(raw);
  }

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

  function localMeshProfile() {
    try {
      if (global.CrozzoBlePeerRegistry && typeof global.CrozzoBlePeerRegistry.getLocalProfile === 'function') {
        return global.CrozzoBlePeerRegistry.getLocalProfile();
      }
    } catch (_) {}
    return {
      deviceId: meshCtx().deviceId,
      btDisplayName: '',
      userName: '',
      deviceRole: (function () {
        try {
          var md = typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
          return md.role === 'B' ? 'B' : 'A';
        } catch (_) {
          return 'B';
        }
      })(),
      businessId: meshCtx().businessId,
      locationId: meshCtx().locationId,
    };
  }

  function publishNameChange(payload) {
    if (!payload || !payload.deviceId) return false;
    if (!_active) return false;
    sendFrame(buildFrame('MESH_NAME_CHANGE', payload, 0));
    publishProfile(localMeshProfile());
    return true;
  }

  function publishWhoQuery(seekName) {
    seekName = String(seekName || '').trim();
    if (!seekName || !_active) return false;
    sendFrame(buildFrame('MESH_WHO', { seekName: seekName, at: Date.now() }, 0));
    return true;
  }

  function profileMatchesSeek(profile, seekName) {
    if (!profile || !seekName) return false;
    if (global.CrozzoBlePeerRegistry && typeof global.CrozzoBlePeerRegistry.nameMatchesPeer === 'function') {
      return global.CrozzoBlePeerRegistry.nameMatchesPeer(profile, seekName);
    }
    var seek = String(seekName).trim().toLowerCase();
    var names = [profile.btDisplayName, profile.userName].concat(profile.aliases || []);
    return names.some(function (n) {
      n = String(n || '').trim().toLowerCase();
      return n && (n === seek || n.indexOf(seek) >= 0 || seek.indexOf(n) >= 0);
    });
  }

  function handleWhoQuery(frame) {
    var seek = frame && frame.payload && frame.payload.seekName;
    if (!seek) return;
    var profile = localMeshProfile();
    if (!profileMatchesSeek(profile, seek)) return;
    sendFrame(buildFrame('MESH_WHO_ACK', profile, 0));
    publishProfile(profile);
  }

  function publishProfile(profile) {
    profile = profile || localMeshProfile();
    if (!profile || !profile.deviceId) return false;
    if (!_active) return false;
    sendFrame(buildFrame('MESH_PROFILE', profile, 0));
    return true;
  }

  function notePeerProfile(frame) {
    if (!frame || !frame.deviceId) return;
    try {
      if (global.CrozzoBlePeerRegistry && typeof global.CrozzoBlePeerRegistry.ingestMeshProfile === 'function') {
        global.CrozzoBlePeerRegistry.ingestMeshProfile(frame.payload || {}, frame.deviceId);
      } else if (global.CrozzoBlePeerRegistry && typeof global.CrozzoBlePeerRegistry.mergePeer === 'function') {
        var p = frame.payload || {};
        global.CrozzoBlePeerRegistry.mergePeer({
          deviceId: p.deviceId || frame.deviceId,
          btDisplayName: p.btDisplayName || p.deviceName,
          userName: p.userName,
          deviceRole: p.deviceRole,
          businessId: p.businessId,
          locationId: p.locationId,
          btId: p.btId,
          source: 'mesh_profile',
        });
      }
    } catch (_) {}
  }

  function sendHello() {
    if (!_active) return;
    sendFrame(buildFrame('HELLO', { role: meshCtx().deviceId }, 0));
    publishProfile();
    sendFrame(
      buildFrame(
        'MESH_INV',
        {
          have: storeIds(),
        },
        0
      )
    );
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

  function ingestFrame(frame) {
    if (!frame || frame.v !== PROTO || !frame.kind || !frame.msgId) return;
    if (!ctxMatch(frame)) return;
    if (!markSeen(frame.msgId)) return;
    touchPeer(frame.deviceId);
    storeFrame(frame, rawFromFrame(frame));
    relay(frame);

    if (frame.kind === 'HELLO' || frame.kind === 'HELLO_ACK') {
      if (frame.kind === 'HELLO') {
        notePeerProfile({ deviceId: frame.deviceId, payload: { deviceId: frame.deviceId } });
        sendFrame(buildFrame('HELLO_ACK', { from: meshCtx().deviceId }, 0));
        publishProfile();
        sendFrame(
          buildFrame(
            'MESH_INV',
            {
              have: storeIds(),
            },
            0
          )
        );
      }
      return;
    }

    if (frame.kind === 'MESH_PROFILE') {
      notePeerProfile(frame);
      return;
    }

    if (frame.kind === 'MESH_NAME_CHANGE') {
      try {
        if (global.CrozzoBlePeerRegistry && typeof global.CrozzoBlePeerRegistry.ingestNameChange === 'function') {
          global.CrozzoBlePeerRegistry.ingestNameChange(frame.payload || {}, frame.deviceId);
        }
      } catch (_) {}
      return;
    }

    if (frame.kind === 'MESH_WHO') {
      handleWhoQuery(frame);
      return;
    }

    if (frame.kind === 'MESH_WHO_ACK') {
      notePeerProfile(frame);
      return;
    }

    if (frame.kind === 'MESH_INV') {
      var have = (frame.payload && frame.payload.have) || [];
      notePeerHas(frame.deviceId, have);
      var missing = have.filter(function (id) {
        return id && !_seen[id] && !_store[id];
      });
      if (missing.length) {
        sendFrame(buildFrame('MESH_WANT', { want: missing.slice(0, INV_MAX) }, 0));
      }
      return;
    }

    if (frame.kind === 'MESH_WANT') {
      var want = (frame.payload && frame.payload.want) || [];
      want.forEach(function (id) {
        var rec = id && _store[id];
        if (rec && rec.raw) sendRaw(rec.raw);
      });
      return;
    }

    if (global.CrozzoOfflineGossip && typeof global.CrozzoOfflineGossip.ingestRaw === 'function') {
      global.CrozzoOfflineGossip.ingestRaw(rawFromFrame(frame));
    }
  }

  function rawFromFrame(frame) {
    try {
      return JSON.stringify(frame);
    } catch (_) {
      return '';
    }
  }

  var WB_CHUNK = 180;

  // Troceo binario con cabecera de 4 bytes: [total(16b BE)][indice(16b BE)][payload].
  async function wbWriteToDevice(deviceIdKey, raw) {
    var conn = _wbConnections[deviceIdKey];
    if (!conn || !conn.char) return false;
    var enc = new TextEncoder().encode(raw);
    var total = Math.max(1, Math.ceil(enc.length / WB_CHUNK));
    if (total > 65535) return false;
    for (var i = 0; i < total; i++) {
      var slice = enc.subarray(i * WB_CHUNK, Math.min(enc.length, (i + 1) * WB_CHUNK));
      var out = new Uint8Array(4 + slice.length);
      out[0] = (total >> 8) & 0xff;
      out[1] = total & 0xff;
      out[2] = (i >> 8) & 0xff;
      out[3] = i & 0xff;
      out.set(slice, 4);
      await conn.char.writeValue(out);
    }
    return true;
  }

  // Reensambla los trozos recibidos por conexión y entrega el JSON completo.
  function wbOnChunk(conn, dv) {
    if (!conn || !dv) return;
    try {
      var bytes = new Uint8Array(dv.buffer.slice(dv.byteOffset, dv.byteOffset + dv.byteLength));
      if (bytes.length < 4) return;
      var total = (bytes[0] << 8) | bytes[1];
      var idx = (bytes[2] << 8) | bytes[3];
      if (!total || idx >= total) return;
      var payload = bytes.subarray(4);
      if (!conn.rx || conn.rx.total !== total || idx === 0) {
        conn.rx = { total: total, parts: new Array(total), count: 0 };
      }
      var rx = conn.rx;
      if (!rx.parts[idx]) {
        rx.parts[idx] = payload;
        rx.count++;
      }
      if (rx.count < rx.total) return;
      var len = 0;
      var k;
      for (k = 0; k < rx.total; k++) len += rx.parts[k] ? rx.parts[k].length : 0;
      var all = new Uint8Array(len);
      var off = 0;
      for (k = 0; k < rx.total; k++) {
        if (rx.parts[k]) {
          all.set(rx.parts[k], off);
          off += rx.parts[k].length;
        }
      }
      conn.rx = null;
      ingestRaw(new TextDecoder().decode(all));
    } catch (_) {}
  }

  async function wbBroadcast(raw) {
    var keys = Object.keys(_wbConnections);
    var n = 0;
    for (var i = 0; i < keys.length; i++) {
      try {
        if (await wbWriteToDevice(keys[i], raw)) n++;
      } catch (_) {}
    }
    return n;
  }

  async function wbConnectDevice(device) {
    if (!device || !device.gatt) return null;
    var key = String(device.id || device.name || Math.random());
    if (_wbConnections[key]) return _wbConnections[key];
    try {
      var server = await device.gatt.connect();
      var svc = await server.getPrimaryService(SVC_UUID);
      var ch = await svc.getCharacteristic(CH_UUID);
      var conn = { device: device, server: server, char: ch, rx: null };
      try {
        await ch.startNotifications();
        ch.addEventListener('characteristicvaluechanged', function (ev) {
          wbOnChunk(conn, ev.target.value);
        });
      } catch (_) {}
      _wbConnections[key] = conn;
      touchPeer(key);
      return conn;
    } catch (e) {
      log('wb connect ' + e);
      return null;
    }
  }

  async function tryPreconnectFromAdvertisement(device) {
    if (!device || !device.gatt) return false;
    var key = String(device.id || '');
    if (key && _wbConnections[key]) return true;
    var peers = [];
    try {
      if (global.CrozzoBlePeerRegistry && typeof global.CrozzoBlePeerRegistry.getPeers === 'function') {
        peers = global.CrozzoBlePeerRegistry.getPeers({ maxAgeMs: 14 * 24 * 60 * 60 * 1000 }).slice(0, 16);
      }
    } catch (_) {}
    var devName = String(device.name || '').trim();
    var matched = null;
    for (var i = 0; i < peers.length; i++) {
      var p = peers[i];
      if (!p) continue;
      if (p.btId && String(p.btId) === key) {
        matched = p;
        break;
      }
      if (
        global.CrozzoBlePeerRegistry &&
        typeof global.CrozzoBlePeerRegistry.nameMatchesPeer === 'function' &&
        global.CrozzoBlePeerRegistry.nameMatchesPeer(p, devName)
      ) {
        matched = p;
        break;
      }
      var pn = String(p.btDisplayName || '').trim().toLowerCase();
      var dn = devName.toLowerCase();
      if (pn && dn && (dn.indexOf(pn) >= 0 || pn.indexOf(dn) >= 0)) {
        matched = p;
        break;
      }
    }
    if (!matched && !devName) return false;
    var conn = await wbConnectDevice(device);
    if (!conn) return false;
    if (global.CrozzoBlePeerRegistry && typeof global.CrozzoBlePeerRegistry.mergePeer === 'function') {
      global.CrozzoBlePeerRegistry.mergePeer({
        deviceId: matched ? matched.deviceId : '',
        btDisplayName: device.name || (matched && matched.btDisplayName) || '',
        btId: key,
        identityRev: matched && matched.identityRev,
        aliases: matched && matched.aliases,
        preconnected: true,
        source: 'ble_scan',
      });
    }
    return true;
  }

  async function tryPreconnectPeer(peer) {
    if (!peer) return false;
    var key = String(peer.btId || '').trim();
    if (key && _wbConnections[key]) return true;
    if (key && webBtCapable() && global.navigator.bluetooth.getDevices) {
      try {
        var known = await global.navigator.bluetooth.getDevices();
        for (var i = 0; i < known.length; i++) {
          if (String(known[i].id) === key) {
            return !!(await wbConnectDevice(known[i]));
          }
        }
      } catch (_) {}
    }
    return false;
  }

  async function wbScanOnce() {
    if (!webBtCapable() || !global.navigator.bluetooth.requestDevice) return false;
    try {
      var dev = await global.navigator.bluetooth.requestDevice({
        filters: [{ services: [SVC_UUID] }],
        optionalServices: [SVC_UUID],
      });
      await wbConnectDevice(dev);
      return true;
    } catch (_) {
      return false;
    }
  }

  async function wbStartScanPassive() {
    if (!global.navigator.bluetooth || !global.navigator.bluetooth.requestLEScan) return false;
    try {
      if (_wbScan) return true;
      _wbScan = await global.navigator.bluetooth.requestLEScan({
        filters: [{ services: [SVC_UUID] }],
        acceptAllAdvertisements: false,
      });
      _wbScan.addEventListener('advertisementreceived', function (ev) {
        var dev = ev.device;
        touchPeer(dev && dev.id);
        if (dev) tryPreconnectFromAdvertisement(dev).catch(function () {});
      });
      _webBtOk = true;
      _transport = 'web-bt';
      return true;
    } catch (e) {
      log('lescan ' + e);
      return false;
    }
  }

  async function gossipUdpStart() {
    if (!isTauri()) return false;
    try {
      var st = await invoke('crozzo_gossip_udp_start', { deviceId: meshCtx().deviceId });
      _gossipUdpOk = !!(st && st.running);
      if (_gossipUdpOk) {
        _transport = isWindowsDesktop() ? 'win-udp-mesh' : 'desktop-udp-mesh';
      }
      return _gossipUdpOk;
    } catch (e) {
      log('gossip udp ' + e);
      return false;
    }
  }

  async function nativeStart() {
    if (!isTauri()) return false;
    try {
      var st = await invoke('crozzo_ble_mesh_start', { deviceId: meshCtx().deviceId });
      _nativeOk = !!(st && st.running);
      if (_nativeOk) {
        _transport = String(st.transport || (isWindowsDesktop() ? 'win-udp-mesh' : 'native'));
        if (st.desktop) _gossipUdpOk = true;
      }
      return _nativeOk;
    } catch (e) {
      log('native start ' + e);
      return false;
    }
  }

  function webrtcBridgeStart() {
    _webrtcOk = meshLinkReady();
    if (_webrtcOk && _transport === 'none') _transport = 'webrtc-bridge';
    return _webrtcOk;
  }

  async function drainTransports() {
    if (_nativeOk && isTauri()) {
      invoke('crozzo_ble_mesh_drain')
        .then(function (rows) {
          (rows || []).forEach(ingestRaw);
        })
        .catch(function () {});
    } else if (_gossipUdpOk && isTauri()) {
      invoke('crozzo_gossip_udp_drain')
        .then(function (rows) {
          (rows || []).forEach(ingestRaw);
        })
        .catch(function () {});
    }
  }

  function pickTransports() {
    if (isDesktopTauri()) {
      return nativeStart()
        .catch(function () {
          return false;
        })
        .then(function (nat) {
          if (nat) return true;
          return gossipUdpStart();
        })
        .then(function (ok) {
          if (ok) return true;
          if (webBtCapable()) return wbStartScanPassive().then(function (wb) { return !!wb; });
          return webrtcBridgeStart();
        });
    }
    return nativeStart()
      .catch(function () {
        return false;
      })
      .then(function (nat) {
        if (nat) return true;
        if (webBtCapable()) {
          return wbStartScanPassive().then(function (wb) {
            if (wb) return true;
            if (isIos()) return webrtcBridgeStart();
            return wbScanOnce().then(function () {
              return !!_webBtOk || webrtcBridgeStart();
            });
          });
        }
        if (isIos()) return webrtcBridgeStart();
        return false;
      });
  }

  function start() {
    if (_active) return Promise.resolve(true);
    if (!shouldRun()) return Promise.resolve(false);
    return pickTransports().then(function (ok) {
      if (!ok && !meshLinkReady() && !isDesktopTauri()) {
        log('sin transporte BLE/WebRTC');
        return false;
      }
      if (!ok && isDesktopTauri()) {
        log('PC sin malla UDP — reintento al cambiar tier');
        return false;
      }
      _active = true;
      _pollTimer = setInterval(drainTransports, POLL_MS);
      _helloTimer = setInterval(sendHello, HELLO_MS);
      _scanTimer = setInterval(function () {
        if (_webBtOk && webBtCapable()) wbScanOnce().catch(function () {});
        webrtcBridgeStart();
      }, SCAN_MS);
      sendHello();
      try {
        if (global.CrozzoBlePeerRegistry && typeof global.CrozzoBlePeerRegistry.startBackgroundWiring === 'function') {
          global.CrozzoBlePeerRegistry.startBackgroundWiring();
        }
      } catch (_) {}
      log('activo transport=' + _transport);
      return true;
    });
  }

  function stop() {
    _active = false;
    if (_pollTimer) clearInterval(_pollTimer);
    if (_helloTimer) clearInterval(_helloTimer);
    if (_scanTimer) clearInterval(_scanTimer);
    _pollTimer = _helloTimer = _scanTimer = null;
    if (_wbScan) {
      try {
        _wbScan.stop();
      } catch (_) {}
      _wbScan = null;
    }
    Object.keys(_wbConnections).forEach(function (k) {
      try {
        if (_wbConnections[k].device && _wbConnections[k].device.gatt) _wbConnections[k].device.gatt.disconnect();
      } catch (_) {}
    });
    _wbConnections = {};
    if (_nativeOk && isTauri()) {
      invoke('crozzo_ble_mesh_stop').catch(function () {});
      _nativeOk = false;
    }
    if (_gossipUdpOk && isTauri()) {
      invoke('crozzo_gossip_udp_stop').catch(function () {});
      _gossipUdpOk = false;
    }
    _webBtOk = _webrtcOk = false;
    _transport = 'none';
    log('detenido');
  }

  function reconcileTier() {
    if (_active && !shouldRun()) stop();
    else if (!_active && shouldRun()) start();
  }

  function getStatus() {
    var peerCount = Math.max(Object.keys(_peerIds).length, Object.keys(_peerHas).length);
    return {
      active: _active,
      tier: tierNow(),
      peerCount: peerCount,
      transport: _transport,
      native: _nativeOk,
      gossipUdp: _gossipUdpOk,
      webBt: _webBtOk,
      webrtc: _webrtcOk,
      ios: isIos(),
      desktop: isDesktopTauri(),
      windows: isWindowsDesktop(),
      webBtCapable: webBtCapable(),
      inventory: _storeOrder.length,
      role: (function () {
        try {
          var md = typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
          return md.role || '?';
        } catch (_) {
          return '?';
        }
      })(),
    };
  }

  function publishComandaNewByIds(ids, opts) {
    opts = opts || {};
    if (!_active || !Array.isArray(ids) || !ids.length) return 0;
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

  function publishComandaNew(comanda, opts) {
    opts = opts || {};
    if (!_active || !comanda) return false;
    if (!opts.force && cloudPathLikely()) return false;
    var snap = null;
    try {
      snap = JSON.parse(JSON.stringify(comanda));
    } catch (_) {
      return false;
    }
    if (!snap) return false;
    if (!snap.op_id) snap.op_id = String(snap.transaction_id || snap.id || '');
    sendFrame(buildFrame('COMANDA_NEW', snap, 0));
    return true;
  }

  function publishEstado(id, estado, transactionId, opts) {
    opts = opts || {};
    if (!_active) return false;
    if (!opts.force && cloudPathLikely()) return false;
    var tid = transactionId || '';
    var opId = String(tid || id || '') + ':' + String(estado || '') + ':' + new Date().toISOString();
    sendFrame(
      buildFrame(
        'COMANDA_ESTADO',
        {
          id: id,
          estado: estado,
          transaction_id: tid,
          op_id: opId,
          lastUpdateAt: new Date().toISOString(),
        },
        0
      )
    );
    return true;
  }

  async function requestBluetoothEnable() {
    if (isDesktopTauri()) {
      try {
        return (
          (await invoke('crozzo_ble_mesh_request_enable')) || {
            ok: true,
            transport: isWindowsDesktop() ? 'win-udp-mesh' : 'desktop-udp-mesh',
            note: 'PC en malla UDP (caja o portátil)',
          }
        );
      } catch (_) {
        return {
          ok: _gossipUdpOk || _nativeOk,
          transport: isWindowsDesktop() ? 'win-udp-mesh' : 'desktop-udp-mesh',
          note: 'PC en malla UDP — misma red que tablets',
        };
      }
    }
    if (_nativeOk && isTauri()) {
      try {
        return await invoke('crozzo_ble_mesh_request_enable');
      } catch (_) {}
    }
    if (webBtCapable()) {
      try {
        var ok = await wbScanOnce();
        return { ok: ok, transport: ok ? 'web-bt' : 'none', note: ok ? 'Bluetooth listo' : 'Permiso BLE cancelado' };
      } catch (e) {
        return { ok: false, note: String(e && e.message ? e.message : e) };
      }
    }
    if (isIos() && meshLinkReady()) {
      return { ok: true, transport: 'webrtc-bridge', note: 'iOS: malla por enlace P2P WebRTC (Bluetooth nativo en desarrollo)' };
    }
    return {
      ok: false,
      note: isIos()
        ? 'iOS Safari: use emparejamiento QR P2P o Wi‑Fi; BLE nativo próximamente'
        : 'Bluetooth no disponible en este navegador',
    };
  }

  function afterMainInit() {
    reconcileTier();
    if (!global.__crozzoBleMeshTierBound) {
      global.__crozzoBleMeshTierBound = true;
      global.addEventListener('online', reconcileTier);
      global.addEventListener('offline', reconcileTier);
      global.addEventListener('crozzo-tier-changed', reconcileTier);
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', function () {
          if (!document.hidden) reconcileTier();
        });
      }
    }
  }

  global.CrozzoBleMesh = {
    PROTO: PROTO,
    MAX_HOPS: MAX_HOPS,
    start: start,
    stop: stop,
    shouldRun: shouldRun,
    afterMainInit: afterMainInit,
    ingestRaw: ingestRaw,
    sendRaw: sendRaw,
    publishComandaNew: publishComandaNew,
    publishComandaNewByIds: publishComandaNewByIds,
    publishEstado: publishEstado,
    publishProfile: publishProfile,
    publishNameChange: publishNameChange,
    publishWhoQuery: publishWhoQuery,
    tryPreconnectPeer: tryPreconnectPeer,
    requestBluetoothEnable: requestBluetoothEnable,
    getStatus: getStatus,
    reconcileTier: reconcileTier,
    isIos: isIos,
    isDesktopTauri: isDesktopTauri,
    isWindowsDesktop: isWindowsDesktop,
    meshParticipationEnabled: meshParticipationEnabled,
    webBtCapable: webBtCapable,
  };
})(typeof window !== 'undefined' ? window : globalThis);
