/**
 * Descubrimiento mDNS de caja central (_crozzo-pos._tcp) — Tauri desktop.
 * Tablets/APK usan fallback HTTP si no hay invoke nativo.
 */
(function (global) {
  'use strict';

  var BROWSE_MS = 14000;

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
      if (global.CrozzoWifiZoneBridge && typeof global.CrozzoWifiZoneBridge.persistCentralIp === 'function') {
        global.CrozzoWifiZoneBridge.persistCentralIp(String(p.ip), 'mdns');
      }
      try {
        global.__CROZZO_LAN_WS_PORT = Number(p.wsPort) || httpPort + 1;
        global.__CROZZO_LAN_LAST_OK = Date.now();
        global.__CROZZO_LAN_LAST_VIA = 'mdns';
      } catch (_) {}
      if (typeof global.crozzoWizardTierLogLine === 'function') {
        global.crozzoWizardTierLogLine('mDNS: caja en ' + p.ip + ':' + httpPort);
      }
      try {
        global.dispatchEvent(
          new CustomEvent('crozzo-lan-up', { detail: { ip: String(p.ip), via: 'mdns', changed: true } })
        );
      } catch (_) {}
      return { ip: String(p.ip), port: httpPort, wsPort: Number(p.wsPort) || httpPort + 1, via: 'mdns' };
    }
    return null;
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

  function afterMainInit() {
    var cfg = md();
    if (cfg.role === 'B' && cfg.allowLan !== false) startBrowseWatch();
  }

  global.CrozzoMdnsBridge = {
    isDesktopTauri: isDesktopTauri,
    drainDiscovered: drainDiscovered,
    pickCentralFromMdns: pickCentralFromMdns,
    startBrowseWatch: startBrowseWatch,
    afterMainInit: afterMainInit,
  };
})(typeof window !== 'undefined' ? window : globalThis);
