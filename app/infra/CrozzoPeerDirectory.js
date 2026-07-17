/**
 * Crozzo — Directorio local de equipos del mismo proyecto ("amigos").
 *
 * Memoria de baja latencia: IPs y roles conocidos mientras la nube estuvo viva o
 * cuando un peer respondió por LAN. Al caer internet se consulta ANTES de escanear
 * toda la subred (menos fetch, menos colapso).
 *
 * Fase 1: cache local + registro al encontrar /health o /status en la caja.
 * Fase 2: roster compartido vía company_config (peer-roster-{locationId}) cuando hay nube.
 */
(function (global) {
  'use strict';

  var LS_KEY = 'crozzo_peer_directory_v1';
  var LS_CLOUD_PULL_AT = 'crozzo_peer_cloud_pull_at_v1';
  var LS_CLOUD_PUBLISH_AT = 'crozzo_peer_cloud_publish_at_v1';
  var MAX_PEERS = 40;
  var STALE_MS = 86400000 * 7;
  var CLOUD_PULL_MIN_MS = 360000;
  var CLOUD_PUBLISH_MIN_MS = 600000;
  var CLOUD_DEVICE_MAX_AGE_MS = 86400000;
  var ANNOUNCE_MIN_MS = 45000;
  var LS_ANNOUNCE_AT = 'crozzo_identity_announce_at_v1';
  var LS_SOFT_HEAL_AT = 'crozzo_fleet_soft_heal_at_v1';
  var ROSTER_ECHO_THROTTLE_MS = 12000;
  var SOFT_HEAL_MIN_MS = 60000;
  var __cloudPullInflight = null;
  var __cloudPublishInflight = null;
  var __announceInflight = null;
  var __sedeMismatchCount = 0;
  var __rosterEchoAt = {};
  var __softHealTimer = null;

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

  function selfCtx() {
    var c = md();
    var deviceId = '';
    try {
      deviceId = String(
        (typeof global.ensureCrozzoDeviceId === 'function' && global.ensureCrozzoDeviceId()) ||
          c.deviceId ||
          global.localStorage.getItem('crozzo_device_id') ||
          ''
      ).trim();
    } catch (_) {
      deviceId = String(c.deviceId || '').trim();
    }
    return {
      businessId: String(c.businessId || 'default').trim() || 'default',
      locationId: String(c.locationId || 'default').trim() || 'default',
      deviceId: deviceId,
      role: c.role === 'B' ? 'B' : 'A',
    };
  }

  function readStore() {
    return (
      safe(function () {
        var raw = global.localStorage.getItem(LS_KEY);
        return raw ? JSON.parse(raw) : { peers: {}, updatedAt: 0 };
      }) || { peers: {}, updatedAt: 0 }
    );
  }

  function writeStore(store) {
    safe(function () {
      store.updatedAt = Date.now();
      global.localStorage.setItem(LS_KEY, JSON.stringify(store));
    });
  }

  function peerKey(businessId, deviceId) {
    return String(businessId || 'default') + '|' + String(deviceId || '').trim();
  }

  function prune(store) {
    var now = Date.now();
    var peers = store.peers || {};
    Object.keys(peers).forEach(function (k) {
      var p = peers[k];
      if (!p || now - (Number(p.lastSeenAt) || 0) > STALE_MS) delete peers[k];
    });
    var keys = Object.keys(peers);
    if (keys.length <= MAX_PEERS) return;
    keys.sort(function (a, b) {
      return (Number(peers[b].lastLanOkAt) || 0) - (Number(peers[a].lastLanOkAt) || 0);
    });
    for (var i = MAX_PEERS; i < keys.length; i++) delete peers[keys[i]];
  }

  function noteSelf(opts) {
    opts = opts || {};
    var ctx = selfCtx();
    if (!ctx.deviceId) return;
    var store = readStore();
    var k = peerKey(ctx.businessId, ctx.deviceId);
    var prev = store.peers[k] || {};
    var lanIp = String(opts.lanIp || prev.lanIp || '').trim();
    if (!lanIp && ctx.role === 'A') {
      try {
        lanIp = String(global.localStorage.getItem('crozzo_wifi_zone_last_ip') || '127.0.0.1').trim();
      } catch (_) {
        lanIp = '127.0.0.1';
      }
    }
    store.peers[k] = {
      businessId: ctx.businessId,
      locationId: ctx.locationId,
      deviceId: ctx.deviceId,
      role: ctx.role,
      name: String(opts.name || prev.name || '').trim(),
      lanIp: lanIp,
      cloudOk: opts.cloudOk === true,
      lastCloudOkAt: opts.cloudOk ? Date.now() : Number(prev.lastCloudOkAt) || 0,
      lastLanOkAt: Number(prev.lastLanOkAt) || 0,
      lastSeenAt: Date.now(),
      via: String(opts.via || prev.via || 'self'),
      commState: opts.commState || prev.commState || null,
      commStateAt: opts.commState ? Number(opts.commState.at) || Date.now() : Number(prev.commStateAt) || 0,
    };
    prune(store);
    writeStore(store);
  }

  function notePeer(opts) {
    if (!opts || !opts.deviceId) return;
    var ctx = selfCtx();
    var bid = String(opts.businessId || ctx.businessId || 'default').trim() || 'default';
    if (bid !== ctx.businessId && ctx.businessId !== 'default' && bid !== 'default') return;
    var myLoc = String(ctx.locationId || '').trim();
    var peerLoc = String(opts.locationId || '').trim();
    if (myLoc && myLoc !== 'default' && peerLoc && peerLoc !== 'default' && peerLoc !== myLoc) {
      __sedeMismatchCount++;
      safe(function () {
        global.__CROZZO_SEDE_MISMATCH_COUNT = __sedeMismatchCount;
      });
      return;
    }
    var store = readStore();
    var k = peerKey(bid, opts.deviceId);
    var prev = store.peers[k] || {};
    var ip = String(opts.lanIp || opts.ip || prev.lanIp || '').trim();
    var centralIp = String(opts.centralIp || prev.centralIp || '').trim();
    store.peers[k] = {
      businessId: bid,
      locationId: String(opts.locationId || prev.locationId || ctx.locationId || '').trim(),
      deviceId: String(opts.deviceId).trim(),
      role: opts.role === 'B' ? 'B' : 'A',
      name: String(opts.name || prev.name || '').trim(),
      lanIp: ip,
      centralIp: centralIp,
      transports: opts.transports || prev.transports || null,
      btId: String(opts.btId || (opts.transports && opts.transports.btId) || prev.btId || '').trim(),
      cloudOk: opts.cloudOk === true || prev.cloudOk === true,
      lastCloudOkAt:
        opts.cloudOk === true ? Date.now() : Number(opts.lastCloudOkAt || prev.lastCloudOkAt) || 0,
      lastLanOkAt: opts.lanOk !== false ? Date.now() : Number(prev.lastLanOkAt) || 0,
      lastSeenAt: Date.now(),
      via: String(opts.via || prev.via || 'lan'),
      commState: opts.commState || prev.commState || null,
      commStateAt: opts.commState
        ? Number(opts.commState.at) || Date.now()
        : opts.commStateAt
          ? Number(opts.commStateAt)
          : Number(prev.commStateAt) || 0,
    };
    prune(store);
    writeStore(store);
  }

  function noteLanReachable(ip, via, statusJson) {
    ip = String(ip || '').trim();
    if (!ip) return;
    safe(function () {
      global.localStorage.setItem('crozzo_wifi_zone_last_ip', ip);
    });
    if (statusJson && statusJson.device_id) {
      notePeer({
        deviceId: statusJson.device_id,
        businessId: statusJson.business_id,
        locationId: statusJson.location_id,
        role: statusJson.role === 'B' ? 'B' : 'A',
        lanIp: ip,
        lanOk: true,
        cloudOk: statusJson.cloud_reachable === true,
        name: statusJson.name || statusJson.device_name,
        commState: statusJson.comm_state || statusJson.commState || null,
        via: via || 'status',
      });
      return;
    }
    var cfg = md();
    if (cfg.role === 'A') {
      noteSelf({ lanIp: ip, via: via || 'lan' });
    } else {
      notePeer({
        deviceId: 'central-' + ip,
        role: 'A',
        lanIp: ip,
        lanOk: true,
        via: via || 'health',
      });
    }
  }

  /** IPs de caja (Rol A) ordenadas: memoria → config → última conocida. */
  function getCentralCandidates() {
    var cfg = md();
    var ctx = selfCtx();
    var store = readStore();
    var out = [];
    var seen = {};

    function add(ip, score, via, meta) {
      ip = String(ip || '').trim();
      if (!ip || seen[ip]) return;
      seen[ip] = true;
      out.push({ ip: ip, score: score, via: via, meta: meta || null });
    }

    var cfgIp = String(cfg.centralIp || '').trim();
    if (cfgIp) add(cfgIp, 1000, 'config');

    try {
      add(global.localStorage.getItem('crozzo_wifi_zone_last_ip'), 900, 'last_ip');
    } catch (_) {}

    var peers = store.peers || {};
    Object.keys(peers).forEach(function (k) {
      var p = peers[k];
      if (!p || !p.lanIp) return;
      if (p.role !== 'A' && String(p.deviceId || '').indexOf('central-') !== 0) return;
      var score = Number(p.lastLanOkAt) || Number(p.lastSeenAt) || 0;
      if (p.cloudOk) score += 500000;
      add(p.lanIp, score, 'peer:' + (p.via || 'dir'), p);
    });

    out.sort(function (a, b) {
      return b.score - a.score;
    });
    return out;
  }

  function listPeers() {
    var store = readStore();
    var ctx = selfCtx();
    var rows = [];
    Object.keys(store.peers || {}).forEach(function (k) {
      var p = store.peers[k];
      if (!p) return;
      if (p.businessId && p.businessId !== ctx.businessId && ctx.businessId !== 'default') return;
      rows.push(p);
    });
    rows.sort(function (a, b) {
      return (Number(b.lastSeenAt) || 0) - (Number(a.lastSeenAt) || 0);
    });
    return rows;
  }

  function pickCloudAnchorPeer() {
    var rows = listPeers();
    for (var i = 0; i < rows.length; i++) {
      var p = rows[i];
      if (p.role === 'A' && p.cloudOk && p.lanIp) return p;
    }
    for (var j = 0; j < rows.length; j++) {
      if (rows[j].cloudOk && rows[j].lanIp) return rows[j];
    }
    return null;
  }

  function rosterRowId(locationId) {
    var loc = String(locationId || '').trim() || 'default';
    return 'peer-roster-' + loc;
  }

  function resolveOwnLanIpSync() {
    var ctx = selfCtx();
    if (ctx.role === 'A') {
      try {
        var lip = String(global.localStorage.getItem('crozzo_wifi_zone_last_ip') || '').trim();
        if (lip) return lip;
      } catch (_) {}
      return '127.0.0.1';
    }
    try {
      var cached = String(global.localStorage.getItem('crozzo_own_lan_ip_v1') || '').trim();
      if (cached) return cached;
    } catch (_) {}
    return '';
  }

  /** @deprecated use resolveOwnLanIpSync — no devolver centralIp como IP propia (Rol B). */
  function resolveSelfLanIp() {
    return resolveOwnLanIpSync();
  }

  function invalidateOwnLanIpCache() {
    safe(function () {
      global.localStorage.removeItem('crozzo_own_lan_ip_v1');
    });
  }

  async function refreshOwnLanIp() {
    var ctx = selfCtx();
    if (ctx.role === 'A') {
      try {
        var zone = String(global.localStorage.getItem('crozzo_wifi_zone_last_ip') || '').trim();
        if (zone && zone !== '127.0.0.1') {
          safe(function () {
            global.localStorage.setItem('crozzo_own_lan_ip_v1', zone);
          });
          return zone;
        }
      } catch (_) {}
      try {
        if (typeof global.detectLocalIP === 'function') {
          var aip = String((await global.detectLocalIP()) || '').trim();
          if (aip && aip.indexOf('.') > 0 && aip !== '127.0.0.1') {
            safe(function () {
              global.localStorage.setItem('crozzo_own_lan_ip_v1', aip);
              global.localStorage.setItem('crozzo_wifi_zone_last_ip', aip);
            });
            return aip;
          }
        }
      } catch (_) {}
      return resolveOwnLanIpSync();
    }
    try {
      if (typeof global.detectLocalIP === 'function') {
        var ip = String((await global.detectLocalIP()) || '').trim();
        if (ip && ip.indexOf('.') > 0) {
          safe(function () {
            global.localStorage.setItem('crozzo_own_lan_ip_v1', ip);
          });
          return ip;
        }
      }
    } catch (_) {}
    return resolveOwnLanIpSync();
  }

  function getSedeMismatchCount() {
    return __sedeMismatchCount;
  }

  function buildFleetRosterPayload() {
    var selfCard = buildIdentityCard();
    var hints = peersForQrHint(12);
    var peers = hints.map(function (h) {
      return {
        deviceId: h.d,
        name: h.n,
        role: h.r,
        lanIp: h.ip,
        locationId: selfCard.locationId,
        businessId: selfCard.businessId,
        centralIp: selfCard.centralIp,
      };
    });
    peers.unshift({
      deviceId: selfCard.deviceId,
      name: selfCard.name,
      role: selfCard.role,
      lanIp: selfCard.lanIp,
      locationId: selfCard.locationId,
      businessId: selfCard.businessId,
      centralIp: selfCard.centralIp,
      transports: selfCard.transports,
    });
    return {
      kind: 'fleet_roster',
      v: 1,
      at: new Date().toISOString(),
      fromDeviceId: selfCard.deviceId,
      locationId: selfCard.locationId,
      peers: peers,
    };
  }

  function ingestFleetRoster(payload, via) {
    if (!payload || !Array.isArray(payload.peers)) return 0;
    var n = 0;
    payload.peers.forEach(function (p) {
      if (!p || !p.deviceId) return;
      if (
        ingestIdentityCard(
          {
            deviceId: p.deviceId,
            businessId: p.businessId || payload.businessId,
            locationId: p.locationId || payload.locationId,
            role: p.role,
            name: p.name,
            lanIp: p.lanIp,
            centralIp: p.centralIp,
            transports: p.transports,
            cloudOk: true,
          },
          via || 'fleet_roster'
        )
      ) {
        n++;
      }
    });
    return n;
  }

  /**
   * Rol A: tras recibir identity_card, eco throttled del roster (relay-peers).
   */
  function maybeEchoFleetRoster(fromDeviceId, opts) {
    opts = opts || {};
    var ctx = selfCtx();
    if (ctx.role !== 'A') return { ok: false, reason: 'not_central' };
    fromDeviceId = String(fromDeviceId || '').trim();
    var now = Date.now();
    if (fromDeviceId && !opts.force) {
      var last = Number(__rosterEchoAt[fromDeviceId] || 0);
      if (last && now - last < ROSTER_ECHO_THROTTLE_MS) return { ok: true, skipped: 'throttle' };
    }
    if (fromDeviceId) __rosterEchoAt[fromDeviceId] = now;
    var roster = buildFleetRosterPayload();
    var body = {
      type: 'fleet_roster',
      uuid: 'roster:' + ctx.deviceId + ':' + String(roster.at || ''),
      op_id: 'roster:' + ctx.deviceId,
      data: roster,
    };
    var sent = false;
    safe(function () {
      if (typeof global.crozzoLanPostSync === 'function') {
        global.crozzoLanPostSync(body, { timeoutMs: 3500 }).catch(function () {});
        sent = true;
      }
    });
    safe(function () {
      if (global.__TAURI__ && global.__TAURI__.core && typeof global.__TAURI__.core.invoke === 'function') {
        global.__TAURI__.core
          .invoke('crozzo_lan_ws_broadcast', {
            json: JSON.stringify({ event: 'lan_push', payload: body }),
          })
          .catch(function () {});
        sent = true;
      }
    });
    return { ok: sent, peers: roster.peers.length };
  }

  function scheduleSoftHealSoloFleet(reason) {
    var ctx = selfCtx();
    if (ctx.role !== 'B') return;
    if (__softHealTimer) return;
    __softHealTimer = global.setTimeout(function () {
      __softHealTimer = null;
      softHealSoloFleet(reason || 'timer').catch(function () {});
    }, 3500);
  }

  async function softHealSoloFleet(reason) {
    var ctx = selfCtx();
    if (ctx.role !== 'B') return { ok: false, reason: 'not_B' };
    var cfg = md();
    if (!String(cfg.centralIp || '').trim()) return { ok: false, reason: 'no_central' };
    var snap = getFleetSnapshot();
    if (snap.peerCount > 1) return { ok: true, skipped: 'already_fleet' };
    var now = Date.now();
    var last = Number(safe(function () {
      return global.localStorage.getItem(LS_SOFT_HEAL_AT);
    }) || 0);
    if (last && now - last < SOFT_HEAL_MIN_MS) return { ok: true, skipped: 'throttle' };
    safe(function () {
      global.localStorage.setItem(LS_SOFT_HEAL_AT, String(now));
    });
    invalidateOwnLanIpCache();
    await announceIdentity({ force: true, pull: true });
    try {
      if (global.CrozzoMdnsBridge && typeof global.CrozzoMdnsBridge.rediscoverCentral === 'function') {
        await global.CrozzoMdnsBridge.rediscoverCentral({ force: true });
      }
    } catch (_) {}
    try {
      if (global.CrozzoConnectivityDirector && typeof global.CrozzoConnectivityDirector.scheduleEvaluate === 'function') {
        global.CrozzoConnectivityDirector.scheduleEvaluate('fleet_soft_heal:' + (reason || ''), true);
      }
    } catch (_) {}
    return { ok: true, reason: reason || 'soft_heal', fleet: getFleetSnapshot() };
  }

  function detectTransports() {
    var cfg = md();
    var pathLabel = '';
    safe(function () {
      if (typeof global.crozzoTransportPathLabel === 'function') pathLabel = global.crozzoTransportPathLabel();
    });
    var wsOpen = false;
    safe(function () {
      wsOpen = !!(
        global.CrozzoLanWebSocketBridge &&
        typeof global.CrozzoLanWebSocketBridge.isOpen === 'function' &&
        global.CrozzoLanWebSocketBridge.isOpen()
      );
    });
    var gossip = safe(function () {
      return global.CrozzoOfflineGossip && global.CrozzoOfflineGossip.getStatus
        ? global.CrozzoOfflineGossip.getStatus()
        : null;
    }, null);
    var ble = safe(function () {
      return global.CrozzoBleMesh && global.CrozzoBleMesh.getStatus ? global.CrozzoBleMesh.getStatus() : null;
    }, null);
    var wd = safe(function () {
      return global.CrozzoWifiDirectBridge && global.CrozzoWifiDirectBridge.getStatus
        ? global.CrozzoWifiDirectBridge.getStatus()
        : null;
    }, null);
    var cloudOk = false;
    safe(function () {
      cloudOk =
        (typeof global.crozzoCloudWanReady === 'function' && global.crozzoCloudWanReady()) ||
        (typeof global.navigator !== 'undefined' && global.navigator.onLine && !!global.__SUPABASE);
    });
    return {
      cloud: !!cloudOk,
      lanHttp: !!(cfg.centralIp || cfg.role === 'A'),
      lanWs: !!wsOpen,
      gossip: !!(gossip && (gossip.active || gossip.peerCount > 0)),
      ble: !!(ble && ble.active),
      wifiDirect: !!(wd && wd.active),
      pathLabel: pathLabel || '',
      btId: String((ble && ble.btId) || '').trim(),
    };
  }

  function displayName() {
    var cfg = md();
    var n = '';
    safe(function () {
      n = String(
        (cfg.lanDeviceName || cfg.tabletName || cfg.deviceName || '') ||
          (global.config && global.config.get && (global.config.get('conexionSistemas') || {}).tabletName) ||
          ''
      ).trim();
    });
    if (n) return n;
    var ctx = selfCtx();
    return ctx.role === 'A' ? 'Caja' : 'Tablet';
  }

  /**
   * Carnet canónico de flota — “quién soy / sede / vías”.
   * Misma forma en nube, LAN, gossip y BLE.
   */
  function buildIdentityCard(opts) {
    opts = opts || {};
    var ctx = selfCtx();
    var cfg = md();
    var transports = opts.transports || detectTransports();
    var card = {
      kind: 'identity_card',
      v: 3,
      deviceId: ctx.deviceId,
      businessId: ctx.businessId,
      locationId: ctx.locationId,
      role: ctx.role,
      name: String(opts.name || displayName()).trim(),
      lanIp: String(opts.lanIp || resolveOwnLanIpSync() || '').trim(),
      centralIp: String(opts.centralIp || cfg.centralIp || (ctx.role === 'A' ? resolveOwnLanIpSync() : '') || '').trim(),
      port: Number(cfg.port) || 3000,
      transports: transports,
      btId: String(opts.btId || transports.btId || '').trim(),
      cloudOk: opts.cloudOk !== false && !!transports.cloud,
      commState: opts.commState || null,
      at: new Date().toISOString(),
    };
    if (!card.commState && typeof global.crozzoCaptureLocalCommState === 'function') {
      try {
        card.commState = global.crozzoCaptureLocalCommState();
      } catch (_) {}
    }
    return card;
  }

  function buildPresencePayload(opts) {
    opts = opts || {};
    var card = buildIdentityCard(opts);
    return {
      deviceId: card.deviceId,
      businessId: card.businessId,
      locationId: card.locationId,
      role: card.role,
      name: card.name,
      lanIp: card.lanIp,
      centralIp: card.centralIp,
      transports: card.transports,
      btId: card.btId,
      cloudOk: card.cloudOk,
      commState: card.commState,
      at: card.at,
      v: 3,
    };
  }

  function ingestIdentityCard(card, via) {
    if (!card || !card.deviceId) return false;
    var ctx = selfCtx();
    if (ctx.deviceId && String(card.deviceId) === String(ctx.deviceId)) {
      noteSelf({
        name: card.name,
        lanIp: card.lanIp,
        cloudOk: card.cloudOk,
        commState: card.commState,
        via: via || 'identity_self',
      });
      return true;
    }
    var role = card.role === 'B' ? 'B' : 'A';
    var lanIp = String(card.lanIp || '').trim();
    var centralIp = String(card.centralIp || '').trim();
    /* Rol B: guardar SU lanIp; no sustituir por centralIp (bug histórico). */
    notePeer({
      deviceId: String(card.deviceId).trim(),
      businessId: card.businessId,
      locationId: card.locationId,
      role: role,
      name: card.name,
      lanIp: role === 'A' ? lanIp || centralIp : lanIp,
      centralIp: centralIp,
      transports: card.transports || null,
      btId: card.btId,
      cloudOk: card.cloudOk !== false,
      commState: card.commState || null,
      via: via || 'identity',
    });
    if (centralIp) {
      notePeer({
        deviceId: 'central-' + centralIp,
        businessId: card.businessId,
        locationId: card.locationId,
        role: 'A',
        lanIp: centralIp,
        centralIp: centralIp,
        cloudOk: card.cloudOk !== false,
        via: (via || 'identity') + ':centralIp',
      });
    }
    return true;
  }

  function ingestPresenceObject(presence, via) {
    if (!presence || !presence.deviceId) return;
    ingestIdentityCard(presence, via || 'cloud');
  }

  function peersForQrHint(limit) {
    limit = Math.max(1, Math.min(Number(limit) || 6, 8));
    var ctx = selfCtx();
    var rows = listPeers().filter(function (p) {
      if (!p || !p.deviceId) return false;
      if (String(p.deviceId).indexOf('central-') === 0) return false;
      if (ctx.deviceId && String(p.deviceId) === String(ctx.deviceId)) return false;
      if (ctx.locationId && p.locationId && p.locationId !== 'default' && p.locationId !== ctx.locationId) {
        return false;
      }
      return true;
    });
    return rows.slice(0, limit).map(function (p) {
      return {
        d: String(p.deviceId).slice(0, 48),
        n: String(p.name || '').slice(0, 24),
        r: p.role === 'B' ? 'B' : 'A',
        ip: String(p.lanIp || '').slice(0, 40),
      };
    });
  }

  function ingestFleetPeersHint(list, via) {
    if (!Array.isArray(list) || !list.length) return 0;
    var n = 0;
    var ctx = selfCtx();
    list.forEach(function (p) {
      if (!p) return;
      var deviceId = String(p.d || p.deviceId || '').trim();
      if (!deviceId) return;
      ingestIdentityCard(
        {
          deviceId: deviceId,
          businessId: ctx.businessId,
          locationId: ctx.locationId,
          role: p.r || p.role || 'B',
          name: p.n || p.name || '',
          lanIp: p.ip || p.lanIp || '',
          centralIp: md().centralIp || '',
          cloudOk: true,
        },
        via || 'qr_fleet_hint'
      );
      n++;
    });
    return n;
  }

  function getFleetSnapshot() {
    var ctx = selfCtx();
    var peers = listPeers();
    var sameLoc = peers.filter(function (p) {
      return !ctx.locationId || ctx.locationId === 'default' || !p.locationId || p.locationId === ctx.locationId;
    });
    var withIp = sameLoc.filter(function (p) {
      return !!String(p.lanIp || '').trim();
    });
    var card = buildIdentityCard();
    return {
      self: card,
      peerCount: sameLoc.length,
      withLanIp: withIp.length,
      peers: sameLoc.slice(0, 24).map(function (p) {
        return {
          deviceId: p.deviceId,
          name: p.name,
          role: p.role,
          lanIp: p.lanIp,
          centralIp: p.centralIp,
          via: p.via,
          transports: p.transports,
          lastSeenAt: p.lastSeenAt,
        };
      }),
      label:
        sameLoc.length <= 1
          ? 'solo_este_equipo'
          : withIp.length
            ? 'flota_' + sameLoc.length + '_ip_' + withIp.length
            : 'flota_' + sameLoc.length + '_sin_ip',
    };
  }

  /**
   * Anuncio multi-vía: nube + LAN (caja) + gossip + BLE.
   * Post-QR / boot: force:true.
   */
  async function announceIdentity(opts) {
    opts = opts || {};
    var now = Date.now();
    if (!opts.force) {
      var last = Number(safe(function () {
        return global.localStorage.getItem(LS_ANNOUNCE_AT);
      }) || 0);
      if (last && now - last < ANNOUNCE_MIN_MS) return { ok: true, skipped: 'throttle' };
    }
    if (__announceInflight) return __announceInflight;
    __announceInflight = (async function () {
      if (opts.refreshIp !== false) {
        if (opts.invalidateIp) invalidateOwnLanIpCache();
        await refreshOwnLanIp();
      }
      var ownIp = resolveOwnLanIpSync();
      var card = buildIdentityCard({ lanIp: ownIp, name: opts.name, force: opts.force });
      noteSelf({
        name: card.name,
        lanIp: card.lanIp,
        cloudOk: card.cloudOk,
        commState: card.commState,
        via: 'announce',
      });
      var channels = { cloud: false, lan: false, gossip: false, ble: false };

      try {
        if (global.__SUPABASE && typeof publishPresenceToCloud === 'function') {
          channels.cloud = !!(await publishPresenceToCloud(global.__SUPABASE, {
            force: !!opts.force,
            name: card.name,
            lanIp: card.lanIp,
            commState: card.commState,
          }));
        }
      } catch (_) {}

      try {
        if (typeof global.crozzoLanPostSync === 'function') {
          var body = {
            type: 'identity_card',
            uuid: 'id:' + card.deviceId + ':' + String(card.at || ''),
            op_id: 'id:' + card.deviceId,
            data: card,
          };
          channels.lan = !!(await global.crozzoLanPostSync(body, { timeoutMs: 4000 }));
        }
      } catch (_) {}

      try {
        if (global.CrozzoOfflineGossip && typeof global.CrozzoOfflineGossip.publishIdentityCard === 'function') {
          channels.gossip = !!global.CrozzoOfflineGossip.publishIdentityCard(card, { force: true });
        } else if (global.CrozzoOfflineGossip && typeof global.CrozzoOfflineGossip.sendHello === 'function') {
          global.CrozzoOfflineGossip.sendHello();
          channels.gossip = true;
        }
      } catch (_) {}

      try {
        if (global.CrozzoBleMesh && typeof global.CrozzoBleMesh.publishProfile === 'function') {
          global.CrozzoBleMesh.publishProfile();
          channels.ble = true;
        }
      } catch (_) {}

      try {
        if (typeof global.crozzoPullPresenceFromCloud === 'function') {
          /* noop — use module */
        }
        if (opts.pull !== false && global.__SUPABASE) {
          await pullPresenceFromCloud({ force: !!opts.force });
        }
      } catch (_) {}

      safe(function () {
        global.localStorage.setItem(LS_ANNOUNCE_AT, String(Date.now()));
        global.__CROZZO_FLEET_SNAPSHOT = getFleetSnapshot();
        global.dispatchEvent(
          new CustomEvent('crozzo-fleet-identity-announced', {
            detail: { card: card, channels: channels, fleet: global.__CROZZO_FLEET_SNAPSHOT },
          })
        );
      });
      var fleetAfter = getFleetSnapshot();
      if (fleetAfter.peerCount <= 1 && selfCtx().role === 'B') {
        scheduleSoftHealSoloFleet('post_announce');
      }
      return { ok: true, card: card, channels: channels, fleet: fleetAfter };
    })();
    try {
      return await __announceInflight;
    } finally {
      __announceInflight = null;
    }
  }

  function afterMainInit() {
    global.setTimeout(function () {
      announceIdentity({ force: false, pull: true, invalidateIp: false }).catch(function () {});
    }, 2800);
    if (!global.__crozzoFleetIdentityBound) {
      global.__crozzoFleetIdentityBound = true;
      global.addEventListener('crozzo-lan-up', function () {
        announceIdentity({ force: true, pull: false, invalidateIp: true })
          .then(function () {
            scheduleSoftHealSoloFleet('lan_up');
          })
          .catch(function () {});
      });
      global.addEventListener('crozzo-lan-anchor-silence', function () {
        announceIdentity({ force: true, pull: true, invalidateIp: true })
          .then(function () {
            scheduleSoftHealSoloFleet('anchor_silence');
          })
          .catch(function () {});
      });
    }
  }

  function ingestRosterMap(roster, via) {
    if (!roster || typeof roster !== 'object') return 0;
    var n = 0;
    Object.keys(roster).forEach(function (k) {
      var p = roster[k];
      if (!p) return;
      if (!p.deviceId) p.deviceId = k;
      ingestPresenceObject(p, via);
      n++;
    });
    return n;
  }

  function parsePresenceFromDeviceRow(row) {
    if (!row) return null;
    var raw = row.presence_json || row.meta || null;
    if (typeof raw === 'string') {
      try {
        raw = JSON.parse(raw);
      } catch (_) {
        raw = null;
      }
    }
    if (raw && raw.deviceId) return raw;
    if (row.config_json && row.config_json.crozzo_presence) return row.config_json.crozzo_presence;
    return null;
  }

  async function publishPresenceToCloud(sb, opts) {
    opts = opts || {};
    if (!sb) return false;
    if (
      typeof global.crozzoTierAllowsCloudSync === 'function' &&
      !global.crozzoTierAllowsCloudSync()
    ) {
      return false;
    }
    var now = Date.now();
    if (!opts.force && !opts.fleetPulse) {
      var lastPub = Number(safe(function () { return global.localStorage.getItem(LS_CLOUD_PUBLISH_AT); }) || 0);
      if (lastPub && now - lastPub < CLOUD_PUBLISH_MIN_MS) return false;
    } else if (!opts.force && opts.fleetPulse) {
      var lastFleet = Number(safe(function () { return global.localStorage.getItem(LS_CLOUD_PUBLISH_AT + '_fleet'); }) || 0);
      if (lastFleet && now - lastFleet < 120000) return false;
    }
    if (__cloudPublishInflight) return __cloudPublishInflight;
    var ctx = selfCtx();
    if (!ctx.deviceId || !ctx.locationId || ctx.locationId === 'default') return false;
    var presence = buildPresencePayload(opts);
    if (!presence.commState && typeof global.crozzoCaptureLocalCommState === 'function') {
      try {
        presence.commState = global.crozzoCaptureLocalCommState();
        presence.v = 2;
      } catch (_) {}
    }
    noteSelf({
      cloudOk: true,
      name: presence.name,
      lanIp: presence.lanIp,
      commState: presence.commState || null,
      via: 'cloud_publish',
    });

    __cloudPublishInflight = (async function () {
      var ok = false;
      try {
        var deviceId =
          typeof global.crozzoCloudDeviceUuidForRest === 'function'
            ? String(global.crozzoCloudDeviceUuidForRest() || '').trim()
            : '';
        if (!deviceId) deviceId = ctx.deviceId;
        if (!/^[0-9a-f-]{36}$/i.test(deviceId)) return false;
        var patchAttempts = [
          { presence_json: presence },
          { meta: presence },
          { config_json: { crozzo_presence: presence } },
        ];
        for (var i = 0; i < patchAttempts.length; i++) {
          try {
            var r = await sb.from('devices').update(patchAttempts[i]).eq('id', deviceId).select('id');
            if (r && !r.error && r.data && r.data.length) {
              ok = true;
              break;
            }
          } catch (_) {}
        }
      } catch (_) {}

      try {
        var rowId = rosterRowId(ctx.locationId);
        var existing = await sb.from('company_config').select('id,config_json').eq('id', rowId).maybeSingle();
        var roster = {};
        if (existing && !existing.error && existing.data && existing.data.config_json && existing.data.config_json.roster) {
          roster = existing.data.config_json.roster;
        }
        roster[ctx.deviceId] = presence;
        var row = {
          id: rowId,
          updated_at: presence.at,
          config_json: { roster: roster, updated_at: presence.at, kind: 'peer_roster', v: 1 },
        };
        if (ctx.businessId && ctx.businessId !== 'default') row.business_id = ctx.businessId;
        var attempts = [
          row,
          { id: rowId, updated_at: presence.at, tenant_snapshot: { peer_roster: roster, updated_at: presence.at } },
        ];
        for (var a = 0; a < attempts.length; a++) {
          try {
            var ur = await sb.from('company_config').upsert(attempts[a], { onConflict: 'id' });
            if (ur && !ur.error) {
              ok = true;
              break;
            }
          } catch (_) {}
        }
      } catch (_) {}

      safe(function () {
        global.localStorage.setItem(LS_CLOUD_PUBLISH_AT, String(Date.now()));
        if (opts.fleetPulse) global.localStorage.setItem(LS_CLOUD_PUBLISH_AT + '_fleet', String(Date.now()));
      });
      return ok;
    })();

    try {
      return await __cloudPublishInflight;
    } finally {
      __cloudPublishInflight = null;
    }
  }

  async function pullPresenceFromCloud(opts) {
    opts = opts || {};
    if (typeof global.crozzoOnlineConfigReady === 'function' && !global.crozzoOnlineConfigReady()) {
      return { ok: false, reason: 'no_config' };
    }
    if (
      typeof global.crozzoTierAllowsCloudSync === 'function' &&
      !global.crozzoTierAllowsCloudSync()
    ) {
      return { ok: false, reason: 'tier_no_cloud' };
    }
    var sb = global.__SUPABASE;
    if (!sb) return { ok: false, reason: 'no_client' };
    var now = Date.now();
    if (!opts.force) {
      var last = Number(safe(function () { return global.localStorage.getItem(LS_CLOUD_PULL_AT); }) || 0);
      if (last && now - last < CLOUD_PULL_MIN_MS) return { ok: true, skipped: 'throttle' };
    }
    if (__cloudPullInflight) return __cloudPullInflight;

    __cloudPullInflight = (async function () {
      var ctx = selfCtx();
      var merged = 0;

      try {
        var rowId = rosterRowId(ctx.locationId);
        var cfgRes = await sb.from('company_config').select('id,config_json,tenant_snapshot').eq('id', rowId).maybeSingle();
        if (cfgRes && !cfgRes.error && cfgRes.data) {
          var cj = cfgRes.data.config_json;
          if (cj && cj.roster) merged += ingestRosterMap(cj.roster, 'cloud_roster');
          var ts = cfgRes.data.tenant_snapshot;
          if (ts && ts.peer_roster) merged += ingestRosterMap(ts.peer_roster, 'cloud_roster_ts');
        }
      } catch (_) {}

      try {
        if (typeof global.loadTableData === 'function') {
          var res = await global.loadTableData('devices', { limit: 60 });
          var rows = res && Array.isArray(res.data) ? res.data : [];
          var nowMs = Date.now();
          for (var i = 0; i < rows.length; i++) {
            var pr = parsePresenceFromDeviceRow(rows[i]);
            var lastSync = rows[i] && rows[i].last_sync_at ? Date.parse(rows[i].last_sync_at) : 0;
            if (pr) {
              var at = pr.at ? Date.parse(pr.at) : 0;
              var seenAt = Math.max(at || 0, lastSync || 0);
              if (seenAt && nowMs - seenAt > CLOUD_DEVICE_MAX_AGE_MS) continue;
              ingestPresenceObject(pr, 'devices_row');
              merged++;
            } else if (rows[i] && rows[i].id) {
              if (!lastSync || nowMs - lastSync > CLOUD_DEVICE_MAX_AGE_MS) continue;
              var typ = String(rows[i].type || '').toLowerCase();
              var devRole =
                typ === 'tablet' || typ === 'mobile' || typ === 'b' || typ === 'phone'
                  ? 'B'
                  : typ === 'central' || typ === 'a' || typ === 'desktop' || typ === 'pc'
                    ? 'A'
                    : 'B';
              ingestPresenceObject(
                {
                  deviceId: rows[i].id,
                  role: devRole,
                  name: rows[i].name,
                  cloudOk: true,
                  at: rows[i].last_sync_at,
                },
                'devices_active'
              );
              merged++;
            }
          }
        }
      } catch (_) {}

      safe(function () {
        global.localStorage.setItem(LS_CLOUD_PULL_AT, String(Date.now()));
      });
      return { ok: true, merged: merged };
    })();

    try {
      return await __cloudPullInflight;
    } finally {
      __cloudPullInflight = null;
    }
  }

  global.CrozzoPeerDirectory = {
    noteSelf: noteSelf,
    notePeer: notePeer,
    noteLanReachable: noteLanReachable,
    getCentralCandidates: getCentralCandidates,
    listPeers: listPeers,
    listPeerCommStates: function (opts) {
      opts = opts || {};
      var maxAge = Number(opts.maxAgeMs) > 0 ? Number(opts.maxAgeMs) : 3600000;
      var now = Date.now();
      return listPeers().filter(function (p) {
        return p && p.commState && p.commStateAt && now - Number(p.commStateAt) <= maxAge;
      });
    },
    pickCloudAnchorPeer: pickCloudAnchorPeer,
    readStore: readStore,
    buildPresencePayload: buildPresencePayload,
    buildIdentityCard: buildIdentityCard,
    ingestIdentityCard: ingestIdentityCard,
    announceIdentity: announceIdentity,
    peersForQrHint: peersForQrHint,
    ingestFleetPeersHint: ingestFleetPeersHint,
    ingestFleetRoster: ingestFleetRoster,
    buildFleetRosterPayload: buildFleetRosterPayload,
    maybeEchoFleetRoster: maybeEchoFleetRoster,
    softHealSoloFleet: softHealSoloFleet,
    getFleetSnapshot: getFleetSnapshot,
    getSedeMismatchCount: getSedeMismatchCount,
    refreshOwnLanIp: refreshOwnLanIp,
    invalidateOwnLanIpCache: invalidateOwnLanIpCache,
    afterMainInit: afterMainInit,
    publishPresenceToCloud: publishPresenceToCloud,
    pullPresenceFromCloud: pullPresenceFromCloud,
    rosterRowId: rosterRowId,
  };
  global.crozzoAnnounceFleetIdentity = announceIdentity;
  global.crozzoFleetSnapshot = getFleetSnapshot;
})(typeof window !== 'undefined' ? window : globalThis);
