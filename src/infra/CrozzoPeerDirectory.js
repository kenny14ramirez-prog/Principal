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
  var __cloudPullInflight = null;
  var __cloudPublishInflight = null;

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
    };
    prune(store);
    writeStore(store);
  }

  function notePeer(opts) {
    if (!opts || !opts.deviceId) return;
    var ctx = selfCtx();
    var bid = String(opts.businessId || ctx.businessId || 'default').trim() || 'default';
    if (bid !== ctx.businessId && ctx.businessId !== 'default' && bid !== 'default') return;
    var store = readStore();
    var k = peerKey(bid, opts.deviceId);
    var prev = store.peers[k] || {};
    var ip = String(opts.lanIp || opts.ip || prev.lanIp || '').trim();
    store.peers[k] = {
      businessId: bid,
      locationId: String(opts.locationId || prev.locationId || ctx.locationId || '').trim(),
      deviceId: String(opts.deviceId).trim(),
      role: opts.role === 'B' ? 'B' : 'A',
      name: String(opts.name || prev.name || '').trim(),
      lanIp: ip,
      cloudOk: opts.cloudOk === true || prev.cloudOk === true,
      lastCloudOkAt:
        opts.cloudOk === true ? Date.now() : Number(opts.lastCloudOkAt || prev.lastCloudOkAt) || 0,
      lastLanOkAt: opts.lanOk !== false ? Date.now() : Number(prev.lastLanOkAt) || 0,
      lastSeenAt: Date.now(),
      via: String(opts.via || prev.via || 'lan'),
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

  function resolveSelfLanIp() {
    var cfg = md();
    var ctx = selfCtx();
    if (ctx.role === 'A') {
      try {
        var lip = String(global.localStorage.getItem('crozzo_wifi_zone_last_ip') || '').trim();
        if (lip) return lip;
      } catch (_) {}
      return '127.0.0.1';
    }
    return String(cfg.centralIp || '').trim();
  }

  function buildPresencePayload(opts) {
    opts = opts || {};
    var ctx = selfCtx();
    var cfg = md();
    return {
      deviceId: ctx.deviceId,
      businessId: ctx.businessId,
      locationId: ctx.locationId,
      role: ctx.role,
      name: String(opts.name || '').trim(),
      lanIp: String(opts.lanIp || resolveSelfLanIp() || '').trim(),
      centralIp: String(cfg.centralIp || opts.centralIp || '').trim(),
      cloudOk: opts.cloudOk !== false,
      at: new Date().toISOString(),
      v: 1,
    };
  }

  function ingestPresenceObject(presence, via) {
    if (!presence || !presence.deviceId) return;
    var role = presence.role === 'B' ? 'B' : 'A';
    var lanIp = String(presence.lanIp || '').trim();
    var centralIp = String(presence.centralIp || '').trim();
    notePeer({
      deviceId: String(presence.deviceId).trim(),
      businessId: presence.businessId,
      locationId: presence.locationId,
      role: role,
      name: presence.name,
      lanIp: role === 'A' ? lanIp || centralIp : centralIp || lanIp,
      cloudOk: presence.cloudOk !== false,
      via: via || 'cloud',
    });
    if (centralIp && role === 'B') {
      notePeer({
        deviceId: 'central-' + centralIp,
        businessId: presence.businessId,
        locationId: presence.locationId,
        role: 'A',
        lanIp: centralIp,
        cloudOk: presence.cloudOk !== false,
        via: (via || 'cloud') + ':centralIp',
      });
    }
    if (role === 'A' && lanIp) {
      notePeer({
        deviceId: String(presence.deviceId).trim(),
        businessId: presence.businessId,
        locationId: presence.locationId,
        role: 'A',
        lanIp: lanIp,
        cloudOk: presence.cloudOk !== false,
        via: via || 'cloud',
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
    if (!opts.force) {
      var lastPub = Number(safe(function () { return global.localStorage.getItem(LS_CLOUD_PUBLISH_AT); }) || 0);
      if (lastPub && now - lastPub < CLOUD_PUBLISH_MIN_MS) return false;
    }
    if (__cloudPublishInflight) return __cloudPublishInflight;
    var ctx = selfCtx();
    if (!ctx.deviceId || !ctx.locationId || ctx.locationId === 'default') return false;
    var presence = buildPresencePayload(opts);
    noteSelf({ cloudOk: true, name: presence.name, lanIp: presence.lanIp, via: 'cloud_publish' });

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
          for (var i = 0; i < rows.length; i++) {
            var pr = parsePresenceFromDeviceRow(rows[i]);
            if (pr) {
              ingestPresenceObject(pr, 'devices_row');
              merged++;
            } else if (rows[i] && rows[i].id) {
              var typ = String(rows[i].type || '').toLowerCase();
              var isCentral = typ === 'central' || typ === 'a' || typ === 'desktop';
              if (isCentral && rows[i].last_sync_at) {
                ingestPresenceObject(
                  {
                    deviceId: rows[i].id,
                    role: 'A',
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
    pickCloudAnchorPeer: pickCloudAnchorPeer,
    readStore: readStore,
    buildPresencePayload: buildPresencePayload,
    publishPresenceToCloud: publishPresenceToCloud,
    pullPresenceFromCloud: pullPresenceFromCloud,
    rosterRowId: rosterRowId,
  };
})(typeof window !== 'undefined' ? window : globalThis);
