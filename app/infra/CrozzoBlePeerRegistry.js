/**
 * Crozzo — Identidad de malla + registro de peers Bluetooth.
 *
 * - deviceId fijo (no cambia); nombre visible sí puede cambiar (Pepe → Fabricio).
 * - aliases: nombres viejos para seguir encontrando al mismo dispositivo.
 * - identityRev: versión; si sube, gana sobre caché vieja.
 * - Con internet: sube QR/nube; sin internet: grita MESH_NAME_CHANGE por BLE.
 */
(function (global) {
  'use strict';

  var LS_PEERS = 'crozzo_ble_peer_registry_v1';
  var LS_PROFILE = 'crozzo_ble_local_profile_v1';
  var LS_IDENTITY = 'crozzo_mesh_identity_v1';
  var LS_BOOT_BT = 'crozzo_ble_boot_prompt_at_v1';
  var BOOT_PROMPT_GAP_MS = 7 * 24 * 60 * 60 * 1000;
  var BG_MS = 38000;
  var PRECONNECT_MS = 52000;
  var IDENTITY_POLL_MS = 4000;
  var WHO_QUERY_MS = 22000;
  var MAX_ALIASES = 12;

  var __bgTimer = null;
  var __preconnectTimer = null;
  var __identityTimer = null;
  var __whoTimer = null;
  var __started = false;
  var __identityCheckPending = null;

  function safe(fn) {
    try {
      return fn();
    } catch (_) {
      return undefined;
    }
  }

  function nowMs() {
    return Date.now();
  }

  function normalizeName(n) {
    return String(n || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  function namesFuzzyMatch(a, b) {
    a = normalizeName(a);
    b = normalizeName(b);
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.length >= 3 && b.length >= 3 && (a.indexOf(b) >= 0 || b.indexOf(a) >= 0)) return true;
    return false;
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

  function isTauri() {
    return !!(global.__TAURI__ && global.__TAURI__.core);
  }

  function deviceId() {
    try {
      if (typeof global.ensureCrozzoDeviceId === 'function') return String(global.ensureCrozzoDeviceId());
    } catch (_) {}
    try {
      return String(global.localStorage.getItem('crozzo_device_id') || '');
    } catch (_) {
      return '';
    }
  }

  function readDisplayName() {
    var n = '';
    try {
      if (typeof global.crozzoGetDeviceDisplayName === 'function') {
        n = String(global.crozzoGetDeviceDisplayName() || '').trim();
      }
    } catch (_) {}
    if (!n) {
      try {
        n = String(global.localStorage.getItem('device_name') || '').trim();
      } catch (_) {}
    }
    if (!n) {
      try {
        var md = typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
        n = String(md.tabletName || md.deviceName || md.lanDeviceName || '').trim();
      } catch (_) {}
    }
    return n || 'Dispositivo Crozzo';
  }

  function readUserName() {
    try {
      if (typeof global.crozzoGetActiveUserName === 'function') {
        return String(global.crozzoGetActiveUserName() || '').trim();
      }
    } catch (_) {}
    try {
      var u = global.localStorage.getItem('crozzo_active_user_name');
      return u ? String(u).trim() : '';
    } catch (_) {
      return '';
    }
  }

  function tenantCtx() {
    var md = typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
    return {
      businessId: String(md.businessId || 'default').trim() || 'default',
      locationId: String(md.locationId || 'default').trim() || 'default',
      deviceRole: md.role === 'B' ? 'B' : 'A',
    };
  }

  function loadLocalIdentity() {
    return (
      safe(function () {
        var raw = global.localStorage.getItem(LS_IDENTITY);
        return raw ? JSON.parse(raw) : null;
      }) || null
    );
  }

  function saveLocalIdentity(id) {
    if (!id) return;
    id.updatedAt = nowMs();
    safe(function () {
      global.localStorage.setItem(LS_IDENTITY, JSON.stringify(id));
    });
  }

  function trimAliases(list) {
    var out = [];
    (list || []).forEach(function (a) {
      var n = String(a || '').trim();
      if (!n) return;
      if (out.some(function (x) {
        return normalizeName(x) === normalizeName(n);
      })) {
        return;
      }
      out.push(n);
    });
    return out.slice(0, MAX_ALIASES);
  }

  function ensureLocalIdentity() {
    var cur = loadLocalIdentity();
    var snap = readIdentitySnapshot();
    if (!cur || cur.deviceId !== snap.deviceId) {
      cur = {
        deviceId: snap.deviceId,
        btDisplayName: snap.btDisplayName,
        userName: snap.userName,
        identityRev: 1,
        aliases: [],
        updatedAt: nowMs(),
      };
      saveLocalIdentity(cur);
    }
    return cur;
  }

  function readIdentitySnapshot() {
    return {
      deviceId: deviceId(),
      btDisplayName: readDisplayName(),
      userName: readUserName(),
    };
  }

  function readDb() {
    return (
      safe(function () {
        var raw = global.localStorage.getItem(LS_PEERS);
        return raw ? JSON.parse(raw) : { updatedAt: 0, peers: {} };
      }) || { updatedAt: 0, peers: {} }
    );
  }

  function writeDb(db) {
    db.updatedAt = nowMs();
    safe(function () {
      global.localStorage.setItem(LS_PEERS, JSON.stringify(db));
    });
  }

  function peerAllNames(peer) {
    if (!peer) return [];
    return trimAliases(
      [peer.btDisplayName, peer.userName]
        .concat(peer.aliases || [])
        .filter(Boolean)
    );
  }

  function nameMatchesPeer(peer, name) {
    if (!peer || !name) return false;
    return peerAllNames(peer).some(function (n) {
      return namesFuzzyMatch(n, name);
    });
  }

  function getLocalProfile() {
    var ctx = tenantCtx();
    var id = ensureLocalIdentity();
    var snap = readIdentitySnapshot();
    if (snap.btDisplayName && snap.btDisplayName !== id.btDisplayName) {
      id.btDisplayName = snap.btDisplayName;
    }
    if (snap.userName !== id.userName) {
      id.userName = snap.userName;
    }
    var profile = {
      deviceId: id.deviceId || deviceId(),
      btDisplayName: snap.btDisplayName,
      userName: snap.userName,
      deviceRole: ctx.deviceRole,
      businessId: ctx.businessId,
      locationId: ctx.locationId,
      platform: isAndroidApk() ? 'android-apk' : isTauri() ? 'tauri' : 'web',
      identityRev: Number(id.identityRev) || 1,
      aliases: trimAliases(id.aliases),
      updatedAt: nowMs(),
    };
    saveLocalIdentity(id);
    safe(function () {
      global.localStorage.setItem(LS_PROFILE, JSON.stringify(profile));
    });
    return profile;
  }

  function mergePeer(entry) {
    if (!entry || !entry.deviceId) return false;
    if (String(entry.deviceId) === String(deviceId())) return false;
    var db = readDb();
    var peers = db.peers || {};
    var prev = peers[entry.deviceId] || {};
    var incomingRev = Number(entry.identityRev) || 0;
    var prevRev = Number(prev.identityRev) || 0;
    var displayName = String(entry.btDisplayName || entry.deviceName || prev.btDisplayName || '').trim();
    var aliases = trimAliases([].concat(prev.aliases || [], entry.aliases || []));

    if (incomingRev > 0 && prevRev > 0 && incomingRev < prevRev) {
      displayName = prev.btDisplayName || displayName;
    } else if (entry.oldName) {
      aliases = trimAliases(aliases.concat([entry.oldName]));
    }
    if (prev.btDisplayName && displayName && normalizeName(prev.btDisplayName) !== normalizeName(displayName)) {
      aliases = trimAliases(aliases.concat([prev.btDisplayName]));
    }
    if (displayName) {
      aliases = aliases.filter(function (a) {
        return normalizeName(a) !== normalizeName(displayName);
      });
    }

    peers[entry.deviceId] = {
      deviceId: entry.deviceId,
      btDisplayName: displayName,
      userName: String(entry.userName || prev.userName || '').trim(),
      deviceRole: entry.deviceRole || prev.deviceRole || 'B',
      businessId: entry.businessId || prev.businessId || '',
      locationId: entry.locationId || prev.locationId || '',
      btId: String(entry.btId || prev.btId || '').trim(),
      identityRev: Math.max(incomingRev, prevRev, 1),
      aliases: aliases,
      lastSeenAt: Number(entry.lastSeenAt) || nowMs(),
      sources: Array.from(
        new Set([].concat(prev.sources || [], [entry.source || 'mesh']).filter(Boolean))
      ).slice(0, 10),
      preconnected: !!(entry.preconnected || prev.preconnected),
    };
    db.peers = peers;
    writeDb(db);
    return true;
  }

  function getPeers(opts) {
    opts = opts || {};
    var db = readDb();
    var out = [];
    Object.keys(db.peers || {}).forEach(function (k) {
      var p = db.peers[k];
      if (!p) return;
      if (opts.maxAgeMs && nowMs() - (p.lastSeenAt || 0) > opts.maxAgeMs) return;
      out.push(p);
    });
    out.sort(function (a, b) {
      return (b.lastSeenAt || 0) - (a.lastSeenAt || 0);
    });
    return out;
  }

  function resolvePeerByName(name) {
    var seek = normalizeName(name);
    if (!seek) return null;
    var peers = getPeers({ maxAgeMs: 30 * 24 * 60 * 60 * 1000 });
    for (var i = 0; i < peers.length; i++) {
      if (nameMatchesPeer(peers[i], seek)) return peers[i];
    }
    return null;
  }

  function ingestMeshProfile(payload, fromDeviceId) {
    if (!payload) return;
    mergePeer({
      deviceId: payload.deviceId || fromDeviceId,
      btDisplayName: payload.btDisplayName || payload.deviceName,
      userName: payload.userName,
      deviceRole: payload.deviceRole,
      businessId: payload.businessId,
      locationId: payload.locationId,
      btId: payload.btId,
      identityRev: payload.identityRev,
      aliases: payload.aliases,
      source: 'mesh_profile',
    });
  }

  function ingestNameChange(payload, fromDeviceId) {
    if (!payload) return false;
    var did = String(payload.deviceId || fromDeviceId || '').trim();
    if (!did || did === String(deviceId())) return false;
    var oldName = String(payload.oldName || payload.prevName || '').trim();
    var newName = String(payload.newName || payload.btDisplayName || '').trim();
    var changed = mergePeer({
      deviceId: did,
      btDisplayName: newName,
      userName: payload.userName,
      deviceRole: payload.deviceRole,
      businessId: payload.businessId,
      locationId: payload.locationId,
      btId: payload.btId,
      identityRev: payload.identityRev,
      aliases: payload.aliases,
      oldName: oldName,
      source: 'name_change',
    });
    if (changed && oldName && newName) {
      safe(function () {
        if (typeof global.showToast === 'function') {
          global.showToast('Dispositivo renombrado: «' + oldName + '» ahora es «' + newName + '»', 'info');
        }
      });
      if (global.CrozzoBleMesh && typeof global.CrozzoBleMesh.tryPreconnectPeer === 'function') {
        var peer = resolvePeerByName(newName) || { deviceId: did, btDisplayName: newName, btId: payload.btId };
        global.CrozzoBleMesh.tryPreconnectPeer(peer).catch(function () {});
      }
    }
    return changed;
  }

  async function pushIdentityToCloud(reason) {
    if (!global.CrozzoInternalQrRegistry) return false;
    try {
      if (typeof global.CrozzoInternalQrRegistry.refreshIdentityOnCloud === 'function') {
        return !!(await global.CrozzoInternalQrRegistry.refreshIdentityOnCloud({ reason: reason || 'identity' }));
      }
      if (typeof global.CrozzoInternalQrRegistry.ensureOwnSlot === 'function') {
        var rec = global.CrozzoInternalQrRegistry.ensureOwnSlot({ force: true });
        if (rec && typeof global.CrozzoInternalQrRegistry.exchangeOnDeviceSetup === 'function') {
          await global.CrozzoInternalQrRegistry.exchangeOnDeviceSetup({ reason: 'identity_change', forceOwn: true });
        }
        return !!rec;
      }
    } catch (_) {}
    return false;
  }

  function broadcastNameChange(change) {
    if (!change) return false;
    var profile = getLocalProfile();
    var payload = {
      deviceId: profile.deviceId,
      oldName: change.oldName,
      newName: change.newName,
      btDisplayName: change.newName,
      userName: profile.userName,
      deviceRole: profile.deviceRole,
      businessId: profile.businessId,
      locationId: profile.locationId,
      identityRev: profile.identityRev,
      aliases: profile.aliases,
      at: nowMs(),
    };
    var sent = false;
    if (global.CrozzoBleMesh && typeof global.CrozzoBleMesh.publishNameChange === 'function') {
      sent = !!global.CrozzoBleMesh.publishNameChange(payload);
    }
    publishLocalProfile();
    return sent;
  }

  async function applyIdentityChange(change, opts) {
    opts = opts || {};
    if (!change || !change.newName) return { ok: false };
    var id = ensureLocalIdentity();
    var aliases = trimAliases([].concat(id.aliases || [], change.oldName ? [change.oldName] : []));
    aliases = aliases.filter(function (a) {
      return normalizeName(a) !== normalizeName(change.newName);
    });
    id.btDisplayName = change.newName;
    if (change.newUserName !== undefined) id.userName = change.newUserName;
    id.identityRev = (Number(id.identityRev) || 1) + 1;
    id.aliases = aliases;
    saveLocalIdentity(id);
    getLocalProfile();

    broadcastNameChange(change);

    if (opts.toast !== false) {
      safe(function () {
        if (typeof global.showToast === 'function') {
          var msg = 'Te buscan como «' + change.newName + '»';
          if (change.oldName) msg += ' (antes «' + change.oldName + '»)';
          global.showToast(msg, 'info');
        }
      });
    }

    var online = false;
    try {
      online = !!(global.navigator && global.navigator.onLine);
    } catch (_) {}
    if (online) {
      await pushIdentityToCloud(change.reason || 'rename');
    }

    safe(function () {
      global.dispatchEvent(
        new CustomEvent('crozzo-identity-changed', {
          detail: {
            deviceId: id.deviceId,
            oldName: change.oldName,
            newName: change.newName,
            identityRev: id.identityRev,
            aliases: id.aliases,
          },
        })
      );
    });

    preconnectKnownPeers().catch(function () {});
    return { ok: true, identityRev: id.identityRev, cloud: online };
  }

  function detectIdentityDrift() {
    var id = ensureLocalIdentity();
    var snap = readIdentitySnapshot();
    var changes = [];
    if (snap.btDisplayName && normalizeName(snap.btDisplayName) !== normalizeName(id.btDisplayName)) {
      changes.push({
        kind: 'device',
        oldName: id.btDisplayName,
        newName: snap.btDisplayName,
        reason: 'device_rename',
      });
    }
    if (snap.userName && normalizeName(snap.userName) !== normalizeName(id.userName || '')) {
      changes.push({
        kind: 'user',
        oldName: id.userName,
        newName: snap.userName,
        reason: 'user_rename',
      });
    }
    return changes;
  }

  function scheduleIdentityCheck(delayMs) {
    if (__identityCheckPending) global.clearTimeout(__identityCheckPending);
    __identityCheckPending = global.setTimeout(function () {
      __identityCheckPending = null;
      runIdentityCheck();
    }, delayMs || 120);
  }

  async function runIdentityCheck() {
    var changes = detectIdentityDrift();
    for (var i = 0; i < changes.length; i++) {
      var c = changes[i];
      if (c.kind === 'device') {
        await applyIdentityChange({ oldName: c.oldName, newName: c.newName, reason: c.reason }, { toast: true });
      } else if (c.kind === 'user') {
        var id = ensureLocalIdentity();
        id.userName = c.newName;
        saveLocalIdentity(id);
        publishLocalProfile();
        broadcastNameChange({ oldName: c.oldName, newName: c.newName, reason: c.reason });
        if (global.navigator && global.navigator.onLine) {
          await pushIdentityToCloud('user_rename');
        }
      }
    }
  }

  function hookLocalIdentitySources() {
    if (global.__crozzoMeshIdentityHook) return;
    global.__crozzoMeshIdentityHook = true;
    try {
      var ls = global.localStorage;
      if (!ls || ls.__crozzoIdentityPatched) return;
      var orig = ls.setItem.bind(ls);
      ls.setItem = function (key, value) {
        orig(key, value);
        if (key === 'device_name' || key === 'crozzo_active_user_name') {
          scheduleIdentityCheck(60);
        }
      };
      ls.__crozzoIdentityPatched = true;
    } catch (_) {}
    global.addEventListener('crozzo-config-saved', function () {
      scheduleIdentityCheck(80);
    });
    global.addEventListener('crozzo-login-user', function () {
      scheduleIdentityCheck(80);
    });
  }

  function startIdentityWatch() {
    hookLocalIdentitySources();
    ensureLocalIdentity();
    if (__identityTimer) global.clearInterval(__identityTimer);
    __identityTimer = global.setInterval(function () {
      runIdentityCheck().catch(function () {});
    }, IDENTITY_POLL_MS);
    if (__whoTimer) global.clearInterval(__whoTimer);
    __whoTimer = global.setInterval(function () {
      discoverPeersByName().catch(function () {});
    }, WHO_QUERY_MS);
  }

  function discoverPeersByName() {
    var peers = getPeers({ maxAgeMs: 14 * 24 * 60 * 60 * 1000 }).slice(0, 10);
    if (!peers.length) return Promise.resolve(0);
    if (!global.CrozzoBleMesh || typeof global.CrozzoBleMesh.publishWhoQuery !== 'function') {
      return Promise.resolve(0);
    }
    var n = 0;
    peers.forEach(function (p) {
      var names = peerAllNames(p);
      for (var i = 0; i < names.length && i < 3; i++) {
        if (global.CrozzoBleMesh.publishWhoQuery(names[i])) n++;
      }
    });
    return Promise.resolve(n);
  }

  function syncPeersFromInternalQr() {
    if (!global.CrozzoInternalQrRegistry || typeof global.CrozzoInternalQrRegistry.getValidPeers !== 'function') {
      return 0;
    }
    var list = global.CrozzoInternalQrRegistry.getValidPeers() || [];
    var n = 0;
    list.forEach(function (p) {
      if (
        mergePeer({
          deviceId: p.deviceId,
          btDisplayName: p.deviceName,
          deviceRole: p.deviceRole,
          source: 'internal_qr',
        })
      ) {
        n++;
      }
    });
    return n;
  }

  async function syncPeersFromCloud() {
    if (!global.CrozzoInternalQrRegistry || typeof global.CrozzoInternalQrRegistry.pullPeersFromCloud !== 'function') {
      return 0;
    }
    try {
      await global.CrozzoInternalQrRegistry.pullPeersFromCloud();
    } catch (_) {}
    return syncPeersFromInternalQr();
  }

  function publishLocalProfile() {
    var profile = getLocalProfile();
    if (global.CrozzoBleMesh && typeof global.CrozzoBleMesh.publishProfile === 'function') {
      global.CrozzoBleMesh.publishProfile(profile);
      return true;
    }
    return false;
  }

  async function preconnectKnownPeers() {
    var peers = getPeers({ maxAgeMs: 14 * 24 * 60 * 60 * 1000 }).slice(0, 12);
    if (!peers.length) return 0;
    var n = 0;
    if (global.CrozzoBleMesh && typeof global.CrozzoBleMesh.tryPreconnectPeer === 'function') {
      for (var i = 0; i < peers.length; i++) {
        try {
          if (await global.CrozzoBleMesh.tryPreconnectPeer(peers[i])) n++;
        } catch (_) {}
      }
    }
    if (global.CrozzoBleMesh && typeof global.CrozzoBleMesh.start === 'function') {
      global.CrozzoBleMesh.start().catch(function () {});
    }
    publishLocalProfile();
    return n;
  }

  async function backgroundTick() {
    if (typeof document !== 'undefined' && document.hidden) return;
    var online = false;
    try {
      online = !!(global.navigator && global.navigator.onLine);
    } catch (_) {}
    syncPeersFromInternalQr();
    if (online) {
      await syncPeersFromCloud();
      if (global.CrozzoInternalQrRegistry && typeof global.CrozzoInternalQrRegistry.exchangeOnDeviceSetup === 'function') {
        global.CrozzoInternalQrRegistry.exchangeOnDeviceSetup({ reason: 'bg_online', forceOwn: false }).catch(function () {});
      }
    }
    if (global.CrozzoBleMesh && typeof global.CrozzoBleMesh.reconcileTier === 'function') {
      global.CrozzoBleMesh.reconcileTier();
    }
    publishLocalProfile();
    await preconnectKnownPeers();
    await discoverPeersByName();
  }

  function startBackgroundWiring() {
    if (__started) return;
    __started = true;
    startIdentityWatch();
    getLocalProfile();
    global.setTimeout(function () {
      backgroundTick().catch(function () {});
    }, 2200);
    if (__bgTimer) global.clearInterval(__bgTimer);
    __bgTimer = global.setInterval(function () {
      backgroundTick().catch(function () {});
    }, BG_MS);
    if (__preconnectTimer) global.clearInterval(__preconnectTimer);
    __preconnectTimer = global.setInterval(function () {
      preconnectKnownPeers().catch(function () {});
    }, PRECONNECT_MS);
  }

  function shouldPromptBluetoothBoot() {
    var last = safe(function () {
      return Number(global.localStorage.getItem(LS_BOOT_BT)) || 0;
    }) || 0;
    return !last || nowMs() - last > BOOT_PROMPT_GAP_MS;
  }

  function markBluetoothBootPrompted() {
    safe(function () {
      global.localStorage.setItem(LS_BOOT_BT, String(nowMs()));
    });
  }

  async function prewarmBluetoothOnApkBoot() {
    if (!isAndroidApk()) return { ok: false, skipped: true };
    getLocalProfile();
    var showNotice = shouldPromptBluetoothBoot();
    if (showNotice) {
      safe(function () {
        if (typeof global.showToast === 'function') {
          global.showToast(
            'Active Bluetooth: Crozzo busca cocina y caja por nombre y se reconecta solo si cambias de nombre.',
            'info'
          );
        }
      });
      markBluetoothBootPrompted();
    }
    var res = { ok: false, transport: 'none' };
    try {
      if (global.CrozzoBleMesh && typeof global.CrozzoBleMesh.requestBluetoothEnable === 'function') {
        res = (await global.CrozzoBleMesh.requestBluetoothEnable()) || res;
      }
    } catch (_) {}
    try {
      if (global.CrozzoBleMesh && typeof global.CrozzoBleMesh.afterMainInit === 'function') {
        global.CrozzoBleMesh.afterMainInit();
      }
      if (global.CrozzoBleMesh && typeof global.CrozzoBleMesh.start === 'function') {
        await global.CrozzoBleMesh.start();
      }
    } catch (_) {}
    startBackgroundWiring();
    publishLocalProfile();
    safe(function () {
      global.dispatchEvent(
        new CustomEvent('crozzo-ble-prewarm', { detail: { ok: !!res.ok, transport: res.transport || 'mesh' } })
      );
    });
    return res;
  }

  function prewarmDesktopMesh() {
    if (isAndroidApk()) return;
    getLocalProfile();
    startBackgroundWiring();
    if (global.CrozzoBleMesh && typeof global.CrozzoBleMesh.afterMainInit === 'function') {
      global.CrozzoBleMesh.afterMainInit();
    }
    if (global.CrozzoBleMesh && typeof global.CrozzoBleMesh.start === 'function') {
      global.CrozzoBleMesh.start().catch(function () {});
    }
  }

  global.CrozzoBlePeerRegistry = {
    normalizeName: normalizeName,
    namesFuzzyMatch: namesFuzzyMatch,
    nameMatchesPeer: nameMatchesPeer,
    resolvePeerByName: resolvePeerByName,
    getLocalProfile: getLocalProfile,
    mergePeer: mergePeer,
    getPeers: getPeers,
    ingestMeshProfile: ingestMeshProfile,
    ingestNameChange: ingestNameChange,
    applyIdentityChange: applyIdentityChange,
    publishLocalProfile: publishLocalProfile,
    syncPeersFromCloud: syncPeersFromCloud,
    syncPeersFromInternalQr: syncPeersFromInternalQr,
    preconnectKnownPeers: preconnectKnownPeers,
    discoverPeersByName: discoverPeersByName,
    startBackgroundWiring: startBackgroundWiring,
    prewarmBluetoothOnApkBoot: prewarmBluetoothOnApkBoot,
    prewarmDesktopMesh: prewarmDesktopMesh,
    backgroundTick: backgroundTick,
    scheduleIdentityCheck: scheduleIdentityCheck,
  };

  global.crozzoNotifyIdentityMaybeChanged = scheduleIdentityCheck;
})(typeof window !== 'undefined' ? window : globalThis);
