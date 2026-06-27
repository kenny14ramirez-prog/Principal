/**
 * Zona Wi‑Fi sin router fijo: hotspot Windows/Android, gateway .1, escaneo /health.
 * Rol B encuentra la caja automáticamente si cambia la IP al caer el router.
 */
(function (global) {
  'use strict';

  var HOTSPOT_GATEWAYS = ['192.168.137.1', '192.168.43.1', '192.168.4.1', '192.168.0.1', '10.0.0.1'];
  // Vigilancia adaptativa: tranquila cuando todo va bien, ágil al primer problema.
  var WATCH_HEALTHY_MS = 16000;
  var WATCH_DEGRADED_MS = 5000;
  // Escala: si la nube esta sana no necesitamos la caja; vigilancia muy espaciada
  // para no martillar el servidor LAN con decenas de tablets.
  var WATCH_CLOUD_MS = 60000;
  var DISCOVER_COOLDOWN_MS = 8000;
  var __watchTimer = null;
  var __lastDiscoverTry = 0;
  var __watchStarted = false;
  var __degraded = false;
  var __troubleT = null;

  function md() {
    return typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
  }

  function isHotspotGateway(ip) {
    return HOTSPOT_GATEWAYS.indexOf(String(ip || '').trim()) >= 0;
  }

  function markHotspotMode(ip) {
    try {
      if (isHotspotGateway(ip)) {
        global.localStorage.setItem('crozzo_connectivity_hotspot', '1');
      }
    } catch (_) {}
  }

  function persistCentralIp(ip, via) {
    var ipTrim = String(ip || '').trim();
    if (!ipTrim) return false;
    try {
      var cur = md();
      var lanRaw = {};
      try {
        lanRaw = global.readCrozzoLanJson ? global.readCrozzoLanJson() || {} : JSON.parse(global.localStorage.getItem('crozzo_lan_config') || '{}');
      } catch (_) {
        lanRaw = {};
      }
      var port = Number(cur.port) || Number(lanRaw.port) || 3000;
      var patch = {
        version: 2,
        lanSyncEnabled: true,
        role: 'B',
        centralIp: ipTrim,
        port: port,
        allowLan: true,
        locationId: (cur.locationId || lanRaw.locationId || '').trim(),
        networkSsidNote: lanRaw.networkSsidNote || '',
        savedAt: Date.now(),
        discoveredVia: via || 'wifi_zone',
      };
      global.localStorage.setItem('crozzo_lan_config', JSON.stringify(patch));
      if (typeof global.persistMultiDeviceConfig === 'function') {
        global.persistMultiDeviceConfig({
          ...cur,
          role: 'B',
          centralIp: ipTrim,
          port: port,
          allowLan: true,
        });
      }
      if (typeof global.config !== 'undefined' && global.config && typeof global.config.get === 'function') {
        var cs = global.config.get('conexionSistemas') || {};
        global.config.set('conexionSistemas', { ...cs, role: 'B', centralIp: ipTrim, port: port });
      }
      var router = global.__crozzoGetMultiSyncRouter && global.__crozzoGetMultiSyncRouter();
      if (router && typeof router.applyConfig === 'function' && typeof global.getMultiDeviceConfig === 'function') {
        router.applyConfig(global.getMultiDeviceConfig());
      }
      markHotspotMode(ipTrim);
      try {
        global.localStorage.setItem('crozzo_wifi_zone_last_ip', ipTrim);
        global.localStorage.setItem('crozzo_wifi_zone_last_via', via || '');
        global.localStorage.setItem('crozzo_wifi_zone_last_at', String(Date.now()));
      } catch (_) {}
      if (typeof global.crozzoWizardTierLogLine === 'function') {
        global.crozzoWizardTierLogLine('Zona Wi‑Fi: caja central en ' + ipTrim + ' (' + (via || 'auto') + ')');
      }
      return true;
    } catch (e) {
      try {
        console.warn('[wifi-zone] persist', e);
      } catch (_) {}
      return false;
    }
  }

  async function tryHealth(ip, port, timeoutMs) {
    if (!ip || typeof global.crozzoFetchLanHealth !== 'function') return false;
    return global.crozzoFetchLanHealth(ip, port, timeoutMs || 1400);
  }

  function gatewayCandidates() {
    var list = [];
    var seen = {};
    function add(ip, tag) {
      var s = String(ip || '').trim();
      if (!s || seen[s]) return;
      seen[s] = true;
      list.push({ ip: s, tag: tag || 'gw' });
    }
    var cur = md();
    add(cur.centralIp, 'saved');
    // Failover de caja: respaldo predefinido y primaria original como anclas
    // estables, para reencontrar al central activo tras una promoción/regreso.
    add(cur.backupIp, 'backup');
    add(cur.primaryIp, 'primary');
    try {
      var fp = global.localStorage.getItem('crozzo_failover_primary_ip');
      add(fp, 'primary_ok');
    } catch (_) {}
    try {
      var last = global.localStorage.getItem('crozzo_wifi_zone_last_ip');
      add(last, 'last_ok');
    } catch (_) {}
    HOTSPOT_GATEWAYS.forEach(function (g) {
      add(g, 'hotspot');
    });
    return list;
  }

  async function resolveCentral(opts) {
    opts = opts || {};
    var cfg = md();
    if (cfg.role !== 'B' || cfg.allowLan === false) return null;
    if (Date.now() - __lastDiscoverTry < DISCOVER_COOLDOWN_MS && !opts.force) return null;
    __lastDiscoverTry = Date.now();
    var port = Number(opts.port) || Number(cfg.port) || 3000;
    var timeout = opts.timeoutMs || 1300;

    var syncIp = async function (ip, via) {
      if (!(await tryHealth(ip, port, timeout))) return null;
      var prev = String(cfg.centralIp || '').trim();
      var ipChanged = prev !== ip;
      if (ipChanged) persistCentralIp(ip, via);
      else markHotspotMode(ip);
      try {
        global.__CROZZO_LAN_LAST_OK = Date.now();
        global.__CROZZO_LAN_LAST_VIA = via;
      } catch (_) {}
      try {
        global.dispatchEvent(new CustomEvent('crozzo-lan-up', { detail: { ip: ip, via: via, changed: ipChanged } }));
      } catch (_) {}
      return { ip: ip, via: via };
    };

    if (global.CrozzoMdnsBridge && typeof global.CrozzoMdnsBridge.pickCentralFromMdns === 'function') {
      var mdnsHit = await global.CrozzoMdnsBridge.pickCentralFromMdns({ port: port, timeoutMs: timeout });
      if (mdnsHit && mdnsHit.ip) return mdnsHit;
    }

    for (var i = 0; i < gatewayCandidates().length; i++) {
      var c = gatewayCandidates()[i];
      var hit = await syncIp(c.ip, c.tag);
      if (hit) return hit;
    }

    if (typeof global.detectLocalIP === 'function') {
      try {
        var lip = await global.detectLocalIP();
        if (lip && typeof global.crozzoGatewayGuessForTier === 'function') {
          var gw = global.crozzoGatewayGuessForTier(lip);
          var hitGw = await syncIp(gw, 'subnet_gw');
          if (hitGw) return hitGw;
        }
      } catch (_) {}
    }

    if (typeof global.findServerA === 'function') {
      try {
        var found = await global.findServerA(port);
        if (found && found.ip) {
          var hitScan = await syncIp(found.ip, 'scan');
          if (hitScan) return hitScan;
        }
      } catch (_) {}
    }

    return null;
  }

  async function probeRoleB(cfg, opts, markOk) {
    var port = Number(cfg.port) || 3000;
    var timeout = (opts && opts.timeoutMs) || 2200;
    var ip = String(cfg.centralIp || '').trim();
    if (ip && (await tryHealth(ip, port, timeout))) {
      markHotspotMode(ip);
      return markOk('health');
    }
    if (typeof CrozzoP2PDataHub !== 'undefined' && CrozzoP2PDataHub.isLinked && CrozzoP2PDataHub.isLinked()) {
      return markOk('p2p');
    }
    var resolved = await resolveCentral({ port: port, timeoutMs: timeout, force: !!opts.forceDiscover });
    if (resolved && resolved.ip) return markOk(resolved.via || 'wifi_zone');
    try {
      var last = global.__CROZZO_LAN_LAST_OK;
      if (last && Date.now() - last < 50000) return { ok: true, via: 'cache' };
    } catch (_) {}
    return { ok: false, via: null };
  }

  async function watchTick() {
    try {
      if (typeof document !== 'undefined' && document.hidden) return;
    } catch (_) {}
    var cfg = md();
    if (cfg.role !== 'B' || cfg.allowLan === false) return;
    var port = Number(cfg.port) || 3000;
    var ip = String(cfg.centralIp || '').trim();
    if (ip && (await tryHealth(ip, port, 1100))) {
      __degraded = false; // caja localizada: volver a ritmo tranquilo
      return;
    }
    var tier = '';
    try {
      tier = String(global.__CROZZO_TIER_LAST || '');
    } catch (_) {}
    var tierInfo = null;
    try {
      tierInfo = global.__CROZZO_LAST_TIER_INFO || null;
    } catch (_) {}
    if (tier === 'cloud' && !(tierInfo && (tierInfo.cloudPingFailed || tierInfo.cloudDegraded))) {
      // Nube sana: no escaneamos la caja (evita carga inutil sobre el servidor LAN
      // con muchas tablets); el descubrimiento se reactiva si la nube cae.
      __degraded = false;
      return;
    }
    var hit = await resolveCentral({ force: true });
    __degraded = !hit; // si no se reencontró, seguir ágil
    try {
      if (global.__crozzoGetMultiSyncRouter) {
        var r = global.__crozzoGetMultiSyncRouter();
        if (r && typeof r.runHealthChecks === 'function') r.runHealthChecks();
      }
      if (typeof global.crozzoPullPosRuntimeCloud === 'function') {
        global.crozzoPullPosRuntimeCloud({ quiet: true, skipRender: true }).catch(function () {});
      }
    } catch (_) {}
  }

  function scheduleNextWatch() {
    if (!__watchStarted) return;
    if (__watchTimer) clearTimeout(__watchTimer);
    var tier = '';
    try {
      tier = String(global.__CROZZO_TIER_LAST || '');
    } catch (_) {}
    var delay = __degraded ? WATCH_DEGRADED_MS : tier === 'cloud' ? WATCH_CLOUD_MS : WATCH_HEALTHY_MS;
    __watchTimer = global.setTimeout(function () {
      watchTick()
        .catch(function () {})
        .then(scheduleNextWatch, scheduleNextWatch);
    }, delay);
  }

  function startWatch() {
    if (__watchStarted) return;
    var cfg = md();
    if (cfg.role !== 'B' && cfg.role !== 'A') return;
    __watchStarted = true;
    if (__watchTimer) clearTimeout(__watchTimer);
    watchTick()
      .catch(function () {})
      .then(scheduleNextWatch, scheduleNextWatch);
  }

  function stopWatch() {
    __watchStarted = false;
    if (__watchTimer) {
      clearTimeout(__watchTimer);
      __watchTimer = null;
    }
  }

  // Reconexión instantánea: cuando una petición LAN falla, no esperamos al
  // siguiente ciclo — reintentamos localizar la caja en ~1.2s (debounced).
  function signalLanTrouble() {
    __degraded = true;
    if (__troubleT) return;
    __troubleT = global.setTimeout(function () {
      __troubleT = null;
      var cfg = md();
      if (cfg.role !== 'B' || cfg.allowLan === false) return;
      resolveCentral({ force: true })
        .then(function () {
          if (typeof global.crozzoScheduleConnectivityBadge === 'function') {
            global.crozzoScheduleConnectivityBadge();
          }
        })
        .catch(function () {});
    }, 1200);
  }
  global.crozzoSignalLanTrouble = signalLanTrouble;

  global.CrozzoWifiZoneBridge = {
    resolveCentral: resolveCentral,
    probeRoleB: probeRoleB,
    persistCentralIp: persistCentralIp,
    startWatch: startWatch,
    stopWatch: stopWatch,
    signalTrouble: signalLanTrouble,
    isHotspotGateway: isHotspotGateway,
    HOTSPOT_GATEWAYS: HOTSPOT_GATEWAYS,
  };
  global.crozzoWifiZoneResolveCentral = resolveCentral;
})(typeof window !== 'undefined' ? window : globalThis);
