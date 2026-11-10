/**
 * Descubrimiento de dispositivos vía cloud (Supabase) — escala más allá de mDNS.
 * Registra el dispositivo actual (IP, puerto, role, lastSeen) y permite pull de la lista.
 * Fallback a mDNS si la nube no está disponible.
 */
(function (global) {
  'use strict';

  var HEARTBEAT_MS = 45000;
  var PULL_MIN_MS = 30000;
  var CLOUD_DEVICE_MAX_AGE_MS = 86400000;
  var __timer = null;
  var __registerInflight = null;
  var __pullInflight = null;

  function safe(fn, fallback) {
    try {
      return fn();
    } catch (_) {
      return fallback;
    }
  }

  function md() {
    return typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
  }

  function isCloudAvailable() {
    try {
      if (typeof global.crozzoOnlineConfigReady === 'function' && !global.crozzoOnlineConfigReady()) return false;
      return !!global.__SUPABASE;
    } catch (_) {
      return !!global.__SUPABASE;
    }
  }

  function ctx() {
    var c = md() || {};
    var deviceId = '';
    try {
      if (global.CrozzoPeerDirectory && typeof global.CrozzoPeerDirectory.buildIdentityCard === 'function') {
        // best-effort: no call side-effect heavy; rely on md
      }
    } catch (_) {}
    try {
      deviceId = String(c.deviceId || global.localStorage.getItem('crozzo_device_id') || '').trim();
    } catch (_) {
      deviceId = String(c.deviceId || '').trim();
    }
    if (!deviceId) {
      try {
        if (typeof global.ensureCrozzoDeviceId === 'function') deviceId = String(global.ensureCrozzoDeviceId() || '').trim();
      } catch (_) {}
    }
    return {
      businessId: String(c.businessId || 'default').trim() || 'default',
      locationId: String(c.locationId || 'default').trim() || 'default',
      deviceId: deviceId,
      role: c.role === 'B' ? 'B' : 'A',
      name: String(c.lanDeviceName || c.tabletName || c.deviceName || '').trim(),
      port: Number(c.port) || 3000,
    };
  }

  function displayName() {
    var c = ctx();
    if (c.name) return c.name;
    return c.role === 'A' ? 'Caja' : 'Tablet';
  }

  async function ensureSelfIp() {
    var ip = '';
    try {
      if (global.CrozzoPeerDirectory && typeof global.CrozzoPeerDirectory.refreshOwnLanIp === 'function') {
        await global.CrozzoPeerDirectory.refreshOwnLanIp();
      }
    } catch (_) {}
    try {
      ip = String(global.localStorage.getItem('crozzo_own_lan_ip_v1') || '').trim();
    } catch (_) {}
    if (!ip) {
      try {
        ip = String(global.localStorage.getItem('crozzo_wifi_zone_last_ip') || '').trim();
      } catch (_) {}
    }
    if (!ip && typeof global.detectLocalIP === 'function') {
      try {
        ip = String((await global.detectLocalIP()) || '').trim();
      } catch (_) {}
    }
    if (!ip) {
      var c = ctx();
      if (c.role === 'A' && typeof global.crozzoOwnLanIpSync === 'function') {
        ip = global.crozzoOwnLanIpSync();
      }
    }
    return ip;
  }

  function deviceUuid() {
    try {
      if (typeof global.crozzoCloudDeviceUuidForRest === 'function') {
        var u = String(global.crozzoCloudDeviceUuidForRest() || '').trim();
        if (u) return u;
      }
    } catch (_) {}
    var c = ctx();
    return String(c.deviceId || '').trim();
  }

  function parsePresence(row) {
    if (!row) return null;
    var raw = row.presence_json != null ? row.presence_json : row.meta != null ? row.meta : row.config_json;
    if (typeof raw === 'string') {
      try {
        raw = JSON.parse(raw);
      } catch (_) {
        raw = null;
      }
    }
    if (raw && raw.crozzo_presence) raw = raw.crozzo_presence;
    if (raw && (raw.deviceId || raw.lanIp || raw.ip)) return raw;
    return null;
  }

  function normalizeDevice(row) {
    var presence = parsePresence(row);
    var id = row && (row.id || row.device_id) ? String(row.id || row.device_id).trim() : '';
    var deviceId = String((row && row.device_id) || (presence && presence.deviceId) || id || '').trim();
    var roleRaw = row && row.role != null ? row.role : presence && presence.role;
    var type = String((row && row.type) || '').toLowerCase();
    var role = roleRaw === 'A' || roleRaw === 'B' ? roleRaw : null;
    if (!role) {
      if (type === 'tablet' || type === 'mobile' || type === 'b' || type === 'phone') role = 'B';
      else if (type === 'central' || type === 'a' || type === 'desktop' || type === 'pc') role = 'A';
      else role = 'B';
    }
    var ip = String(
      (row && (row.ip || row.lan_ip || row.lanIp)) ||
        (presence && (presence.lanIp || presence.ip)) ||
        ''
    ).trim();
    var port = Number((row && (row.port || row.http_port)) || (presence && presence.port) || 0) || 3000;
    var wsPort = Number((row && (row.ws_port || row.wsPort)) || (presence && (presence.wsPort || presence.ws_port)) || port + 1) || port + 1;
    var name = String((row && row.name) || (presence && presence.name) || '').trim();
    var locationId = String((row && (row.location_id || row.locationId)) || (presence && presence.locationId) || '').trim();
    var businessId = String((row && (row.business_id || row.businessId)) || (presence && presence.businessId) || '').trim();
    var lastSeenRaw = (row && (row.last_seen || row.last_seen_at || row.last_sync_at || row.updated_at)) || (presence && presence.at) || null;
    var lastSeenMs = lastSeenRaw ? Date.parse(lastSeenRaw) : 0;
    if (!Number.isFinite(lastSeenMs)) lastSeenMs = 0;
    return {
      id: id,
      deviceId: deviceId,
      name: name,
      role: role,
      ip: ip,
      port: port,
      wsPort: wsPort,
      locationId: locationId || 'default',
      businessId: businessId || 'default',
      lastSeen: lastSeenRaw,
      lastSeenMs: lastSeenMs,
      raw: row,
    };
  }

  async function registerDevice(opts) {
    opts = opts || {};
    if (!isCloudAvailable()) return false;
    if (__registerInflight) return __registerInflight;
    __registerInflight = (async function () {
      var sb = global.__SUPABASE;
      var c = ctx();
      var ip = opts.ip ? String(opts.ip).trim() : await ensureSelfIp();
      var port = Number(opts.port || c.port || 3000);
      var wsPort = port + 1;
      var name = opts.name ? String(opts.name).trim() : displayName();
      var nowIso = new Date().toISOString();
      var uuid = deviceUuid();
      var presence = {
        deviceId: c.deviceId,
        role: c.role,
        name: name,
        lanIp: ip,
        centralIp: c.role === 'A' ? ip : String(md().centralIp || '').trim(),
        port: port,
        transports: safe(function () {
          return global.CrozzoPeerDirectory && typeof global.CrozzoPeerDirectory.detectTransports === 'function'
            ? global.CrozzoPeerDirectory.detectTransports()
            : null;
        }, null),
        cloudOk: true,
        at: nowIso,
        ip: ip,
        lastSeen: Date.now(),
      };

      var ok = false;
      // Intento 1: tabla dedicada crozzo_devices
      var crozzoAttempts = [
        {
          id: uuid,
          device_id: c.deviceId,
          name: name,
          role: c.role,
          location_id: c.locationId,
          business_id: c.businessId,
          ip: ip,
          port: port,
          http_port: port,
          ws_port: wsPort,
          last_seen: nowIso,
          last_seen_at: nowIso,
          updated_at: nowIso,
          presence_json: presence,
          meta: presence,
        },
        {
          id: uuid,
          device_id: c.deviceId,
          name: name,
          role: c.role,
          ip: ip,
          port: port,
          last_seen_at: nowIso,
          presence_json: presence,
        },
        {
          id: uuid,
          name: name,
          role: c.role,
          ip: ip,
          port: port,
          last_seen: nowIso,
          meta: presence,
        },
      ];
      for (var i = 0; i < crozzoAttempts.length && !ok; i++) {
        try {
          var r = await sb.from('crozzo_devices').upsert(crozzoAttempts[i], { onConflict: 'id' });
          if (r && !r.error) ok = true;
        } catch (_) {}
      }

      // Intento 2: tabla devices (presencia en JSON)
      if (!ok) {
        var devType = c.role === 'A' ? 'central' : 'tablet';
        var devicesAttempts = [
          {
            id: uuid,
            name: name,
            type: devType,
            last_sync_at: nowIso,
            role: c.role,
            ip: ip,
            port: port,
            location_id: c.locationId,
            business_id: c.businessId,
            last_seen: nowIso,
            presence_json: presence,
            meta: presence,
            config_json: { crozzo_presence: presence },
          },
          {
            id: uuid,
            name: name,
            type: devType,
            last_sync_at: nowIso,
            presence_json: presence,
            meta: presence,
            config_json: { crozzo_presence: presence },
          },
          {
            id: uuid,
            name: name,
            type: devType,
            last_sync_at: nowIso,
          },
        ];
        for (var j = 0; j < devicesAttempts.length && !ok; j++) {
          try {
            var r2 = await sb.from('devices').upsert(devicesAttempts[j], { onConflict: 'id' });
            if (r2 && !r2.error) ok = true;
          } catch (_) {}
        }
      }

      // Mantener consistencia con PeerDirectory (roster en company_config)
      try {
        if (global.CrozzoPeerDirectory && typeof global.CrozzoPeerDirectory.publishPresenceToCloud === 'function') {
          await global.CrozzoPeerDirectory.publishPresenceToCloud(sb, { force: true, name: name, lanIp: ip, commState: presence.commState || null });
        }
      } catch (_) {}

      safe(function () {
        global.localStorage.setItem('crozzo_cloud_discovery_last_register_at', String(Date.now()));
      });
      return ok;
    })();
    try {
      return await __registerInflight;
    } finally {
      __registerInflight = null;
    }
  }

  async function pullDevices(opts) {
    opts = opts || {};
    if (!isCloudAvailable()) return [];
    if (__pullInflight) return __pullInflight;
    __pullInflight = (async function () {
      var rows = [];
      try {
        if (typeof global.loadTableData === 'function') {
          var res = await global.loadTableData('crozzo_devices', { limit: 200 });
          if (res && Array.isArray(res.data) && res.data.length) rows = res.data;
        }
      } catch (_) {}
      if (!rows.length) {
        try {
          if (typeof global.loadTableData === 'function') {
            var res2 = await global.loadTableData('devices', { limit: 200 });
            if (res2 && Array.isArray(res2.data)) rows = res2.data;
          }
        } catch (_) {}
      }
      var out = [];
      var nowMs = Date.now();
      rows.forEach(function (r) {
        var d = normalizeDevice(r);
        if (!d.ip) return;
        if (d.lastSeenMs && nowMs - d.lastSeenMs > CLOUD_DEVICE_MAX_AGE_MS) {
          // keep recent-ish; but don't drop if no timestamp
        }
        out.push(d);
      });
      // De-dup by ip
      var seen = {};
      var deduped = [];
      out.forEach(function (d) {
        if (seen[d.ip]) return;
        seen[d.ip] = true;
        deduped.push(d);
      });
      return deduped;
    })();
    try {
      return await __pullInflight;
    } finally {
      __pullInflight = null;
    }
  }

  async function discoverCentral(opts) {
    opts = opts || {};
    if (!isCloudAvailable()) return null;
    var devices = await pullDevices(opts);
    var c = ctx();
    var cfg = md();
    var myLoc = String(cfg.locationId || '').trim();
    var portDefault = Number(cfg.port) || 3000;
    var selfId = c.deviceId;
    var cands = devices.filter(function (d) {
      if (!d.ip) return false;
      if (selfId && d.deviceId && String(d.deviceId) === String(selfId)) return false;
      if (d.role !== 'A') {
        // allow devices whose raw type indicates central
        var t = String((d.raw && d.raw.type) || '').toLowerCase();
        if (!(t === 'central' || t === 'a' || t === 'desktop' || t === 'pc')) return false;
      }
      return true;
    });
    if (myLoc && myLoc !== 'default') {
      cands = cands.filter(function (d) {
        return !d.locationId || d.locationId === 'default' || d.locationId === myLoc;
      });
    }
    cands.sort(function (a, b) {
      return (b.lastSeenMs || 0) - (a.lastSeenMs || 0);
    });
    var timeout = opts.timeoutMs || 1200;
    for (var i = 0; i < cands.length; i++) {
      var d = cands[i];
      var httpPort = Number(d.port) || portDefault;
      if (typeof global.crozzoFetchLanHealth === 'function') {
        var ok = false;
        try {
          ok = await global.crozzoFetchLanHealth(String(d.ip), httpPort, timeout);
        } catch (_) {
          ok = false;
        }
        if (!ok) continue;
      }
      var via = 'cloud_discovery';
      var wsPort = d.wsPort || httpPort + 1;
      if (global.CrozzoMdnsBridge && typeof global.CrozzoMdnsBridge.applyCentral === 'function') {
        return global.CrozzoMdnsBridge.applyCentral(String(d.ip), httpPort, wsPort, via);
      }
      return { ip: String(d.ip), port: httpPort, wsPort: wsPort, via: via };
    }
    return null;
  }

  function startHeartbeatWatch() {
    if (__timer) return;
    __timer = global.setInterval(function () {
      registerDevice({ force: true }).catch(function () {});
    }, HEARTBEAT_MS);
    registerDevice({ force: true }).catch(function () {});
  }

  function stopHeartbeatWatch() {
    if (__timer) {
      global.clearInterval(__timer);
      __timer = null;
    }
  }

  function afterMainInit() {
    var cfg = md();
    if (cfg && cfg.allowLan === false && cfg.role !== 'A') {
      // still allow cloud registration if cloud available
    }
    if (!global.__crozzoCloudDiscoveryBound) {
      global.__crozzoCloudDiscoveryBound = true;
      global.addEventListener('crozzo-lan-up', function () {
        registerDevice({ force: true }).catch(function () {});
      });
    }
    global.setTimeout(function () {
      registerDevice({ force: true }).catch(function () {});
    }, 2500);
    startHeartbeatWatch();
    // pull once
    global.setTimeout(function () {
      pullDevices({ force: true }).catch(function () {});
    }, 4000);
  }

  global.CrozzoCloudDiscovery = {
    isCloudAvailable: isCloudAvailable,
    registerDevice: registerDevice,
    pullDevices: pullDevices,
    discoverCentral: discoverCentral,
    startHeartbeatWatch: startHeartbeatWatch,
    stopHeartbeatWatch: stopHeartbeatWatch,
    afterMainInit: afterMainInit,
  };
  global.crozzoCloudDiscoveryRegister = registerDevice;
  global.crozzoCloudDiscoveryPull = pullDevices;
  global.crozzoCloudDiscoveryCentral = discoverCentral;
})(typeof window !== 'undefined' ? window : globalThis);