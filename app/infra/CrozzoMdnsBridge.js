/**
 * Descubrimiento mDNS de caja central (_crozzo-pos._tcp) — Tauri desktop.
 * Tablets/APK: rediscover vía WifiZone + PeerDirectory + IPs recordadas (zero-touch).
 */
(function (global) {
  'use strict';

  var BROWSE_MS = 14000;
  var APK_REDISCOVER_MS = 16000;

  function safe(fn, fallback) {
    try {
      return fn();
    } catch (_) {
      return fallback;
    }
  }

  function isDesktopTauri() {
    try {
      return !!(global.__TAURI__ && global.__TAURI__.core && typeof global.__TAURI__.core.invoke === 'function');
    } catch (_) {
      return false;
    }
  }

  function invoke(cmd, args) {
    return global.__TAURI__.core.invoke(cmd, args || {});
  }

  function md() {
    return typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
  }

  async function drainDiscovered() {
    if (!isDesktopTauri()) return [];
    try {
      return (await invoke('crozzo_mdns_drain_discovered')) || [];
    } catch (_) {
      return [];
    }
  }

  function applyCentral(ip, httpPort, wsPort, via) {
    ip = String(ip || '').trim();
    if (!ip) return null;
    httpPort = Number(httpPort) || 3000;
    wsPort = Number(wsPort) || httpPort + 1;
    if (global.CrozzoWifiZoneBridge && typeof global.CrozzoWifiZoneBridge.persistCentralIp === 'function') {
      global.CrozzoWifiZoneBridge.persistCentralIp(ip, via || 'discover');
    }
    try {
      global.__CROZZO_LAN_WS_PORT = wsPort;
      global.__CROZZO_LAN_LAST_OK = Date.now();
      global.__CROZZO_LAN_LAST_VIA = via || 'discover';
    } catch (_) {}
    safe(function () {
      if (typeof global.crozzoWizardTierLogLine === 'function') {
        global.crozzoWizardTierLogLine((via || 'discover') + ': caja en ' + ip + ':' + httpPort);
      }
    });
    try {
      global.dispatchEvent(
        new CustomEvent('crozzo-lan-up', { detail: { ip: ip, via: via || 'discover', changed: true } })
      );
    } catch (_) {}
    return { ip: ip, port: httpPort, wsPort: wsPort, via: via || 'discover' };
  }

  async function pickCentralFromMdns(opts) {
    opts = opts || {};
    var cfg = md();
    if (cfg.role !== 'B' || cfg.allowLan === false) return null;
    var peers = await drainDiscovered();
    if (!peers.length) return null;
    var myLoc = String(cfg.locationId || '').trim();
    var port = Number(opts.port) || Number(cfg.port) || 3000;
    var timeout = opts.timeoutMs || 1200;
    for (var i = 0; i < peers.length; i++) {
      var p = peers[i];
      if (!p || !p.ip) continue;
      if (myLoc && p.locationId && p.locationId !== 'default' && myLoc !== 'default' && p.locationId !== myLoc) {
        continue;
      }
      var httpPort = Number(p.port) || port;
      if (typeof global.crozzoFetchLanHealth === 'function') {
        var ok = await global.crozzoFetchLanHealth(String(p.ip), httpPort, timeout);
        if (!ok) continue;
      }
      return applyCentral(String(p.ip), httpPort, Number(p.wsPort) || httpPort + 1, 'mdns');
    }
    return null;
  }

  /** Candidatos APK / sin mDNS: config + peers + memoria zona. */
  function apkCandidateIps() {
    var out = [];
    var cfg = md();
    var c = String(cfg.centralIp || '').trim();
    if (c) out.push(c);
    safe(function () {
      if (global.CrozzoPeerDirectory && typeof global.CrozzoPeerDirectory.listPeers === 'function') {
        global.CrozzoPeerDirectory.listPeers().forEach(function (p) {
          var ip = String((p && (p.lanIp || p.ip)) || '').trim();
          if (ip && out.indexOf(ip) < 0) out.push(ip);
        });
      }
    });
    safe(function () {
      var mem = localStorage.getItem('crozzo_wifi_zone_central_ip') || localStorage.getItem('crozzo_last_central_ip') || '';
      mem = String(mem || '').trim();
      if (mem && out.indexOf(mem) < 0) out.push(mem);
    });
    return out;
  }

  async function pickCentralFromMemory(opts) {
    opts = opts || {};
    var cfg = md();
    if (cfg.role !== 'B' || cfg.allowLan === false) return null;
    var port = Number(opts.port) || Number(cfg.port) || 3000;
    var timeout = opts.timeoutMs || 1100;
    var ips = apkCandidateIps();
    for (var i = 0; i < ips.length; i++) {
      var ip = ips[i];
      if (typeof global.crozzoFetchLanHealth === 'function') {
        var ok = await global.crozzoFetchLanHealth(ip, port, timeout);
        if (!ok) continue;
      } else {
        continue;
      }
      return applyCentral(ip, port, port + 1, 'memory_rediscover');
    }
    return null;
  }

  async function rediscoverCentral(opts) {
    opts = opts || {};
    var hit = null;
    if (isDesktopTauri()) {
      hit = await pickCentralFromMdns(opts);
      if (hit) return hit;
    }
    if (global.CrozzoWifiZoneBridge && typeof global.CrozzoWifiZoneBridge.resolveCentral === 'function') {
      try {
        var wz = await global.CrozzoWifiZoneBridge.resolveCentral(
          Object.assign({ force: !!opts.force }, opts)
        );
        if (wz && wz.ip) return applyCentral(wz.ip, wz.port || 3000, (wz.port || 3000) + 1, 'wifi_zone');
      } catch (_) {}
    }
    if (global.CrozzoConnectivityDirector && typeof global.CrozzoConnectivityDirector.resolveCentralFromMemory === 'function') {
      try {
        var mem = await global.CrozzoConnectivityDirector.resolveCentralFromMemory({ timeoutMs: 1200 });
        if (mem && mem.ip) return applyCentral(mem.ip, mem.port || 3000, (mem.port || 3000) + 1, 'director_memory');
      } catch (_) {}
    }
    return pickCentralFromMemory(opts);
  }

  function startBrowseWatch() {
    if (!isDesktopTauri()) return;
    if (global.__crozzoMdnsBrowseTimer) return;
    invoke('crozzo_mdns_start_browse').catch(function () {});
    global.__crozzoMdnsBrowseTimer = global.setInterval(function () {
      pickCentralFromMdns().catch(function () {});
    }, BROWSE_MS);
    pickCentralFromMdns().catch(function () {});
  }

  function startApkRediscoverWatch() {
    if (isDesktopTauri()) return;
    if (global.__crozzoApkRediscoverTimer) return;
    global.__crozzoApkRediscoverTimer = global.setInterval(function () {
      var cfg = md();
      if (cfg.role !== 'B') return;
      rediscoverCentral({ quiet: true }).catch(function () {});
    }, APK_REDISCOVER_MS);
    rediscoverCentral({ quiet: true }).catch(function () {});
  }

  function bindSilenceRediscover() {
    if (global.__crozzoMdnsSilenceBound) return;
    global.__crozzoMdnsSilenceBound = true;
    global.addEventListener('crozzo-lan-anchor-silence', function () {
      rediscoverCentral({ force: true }).catch(function () {});
      if (global.CrozzoConnectivityDirector && typeof global.CrozzoConnectivityDirector.scheduleEvaluate === 'function') {
        global.CrozzoConnectivityDirector.scheduleEvaluate('mdns_silence', true);
      }
    });
  }

  function afterMainInit() {
    var cfg = md();
    if (cfg.role === 'B' && cfg.allowLan !== false) {
      startBrowseWatch();
      startApkRediscoverWatch();
      bindSilenceRediscover();
    }
  }

  global.CrozzoMdnsBridge = {
    isDesktopTauri: isDesktopTauri,
    drainDiscovered: drainDiscovered,
    pickCentralFromMdns: pickCentralFromMdns,
    pickCentralFromMemory: pickCentralFromMemory,
    rediscoverCentral: rediscoverCentral,
    startBrowseWatch: startBrowseWatch,
    afterMainInit: afterMainInit,
  };
})(typeof window !== 'undefined' ? window : globalThis);
