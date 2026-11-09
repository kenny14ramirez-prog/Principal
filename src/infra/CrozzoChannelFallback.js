/**
 * Crozzo POS — Fallback automático de canal de comunicación.
 * Orden: LAN (mDNS/HTTP) -> Cloud (Supabase) -> Hotspot -> Offline.
 * Expone global.crozzoChannelFallbackTry() y global.__CROZZO_ACTIVE_CHANNEL.
 */
(function (global) {
  'use strict';

  var CHANNELS = ['lan', 'cloud', 'hotspot', 'offline'];
  var __active = 'offline';
  var __trying = false;

  function md() { return typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {}; }

  function isOnline() {
    try { return global.navigator && global.navigator.onLine !== false; } catch (_) { return true; }
  }

  function lanLikely() {
    try {
      if (typeof global.crozzoLanTransportAllowed === 'function' && !global.crozzoLanTransportAllowed()) return false;
    } catch (_) {}
    var m = md();
    return !!(m && (m.centralIp || m.role === 'A'));
  }

  function cloudLikely() {
    try {
      if (typeof global.tierAllowsCloudSync === 'function' && !global.tierAllowsCloudSync()) return false;
    } catch (_) {}
    return isOnline();
  }

  function setChannel(ch) {
    var changed = ch !== __active;
    __active = ch;
    global.__CROZZO_ACTIVE_CHANNEL = ch;
    if (!changed) return;
    try { global.dispatchEvent(new CustomEvent('crozzo-channel-changed', { detail: { channel: ch } })); } catch (_) {}
  }

  function cloudConfigured() {
    try {
      if (typeof global.crozzoOnlineConfigReady === 'function') return !!global.crozzoOnlineConfigReady();
    } catch (_) {}
    return !!global.__SUPABASE;
  }

  function getActiveChannel() { return __active; }

  async function tryLan(timeoutMs) {
    if (!lanLikely()) return false;
    try {
      var m = md();
      var ip = m.role === 'A' ? '127.0.0.1' : String(m.centralIp || '').trim();
      if (!ip) return false;
      var port = Number(m.port) || 3000;
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var t = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs || 2000) : null;
      var res = await fetch('http://' + ip + ':' + port + '/health', { signal: ctrl ? ctrl.signal : undefined });
      if (t) clearTimeout(t);
      return !!(res && res.ok);
    } catch (_) { return false; }
  }

  async function tryCloud(timeoutMs) {
    if (!cloudConfigured()) return false;
    if (!cloudLikely()) return false;
    try {
      // Ping liviano: usar supabase si existe
      if (global.__SUPABASE && typeof global.__SUPABASE.from === 'function') return true;
      return isOnline();
    } catch (_) { return false; }
  }

  function isDesktopTauri() {
    try {
      return !!(global.__TAURI__ && global.__TAURI__.core && typeof global.__TAURI__.core.invoke === 'function');
    } catch (_) {
      return false;
    }
  }

  function invoke(cmd, args) {
    try {
      if (!isDesktopTauri()) return Promise.reject(new Error('tauri_invoke_no_disponible'));
      return global.__TAURI__.core.invoke(cmd, args || {});
    } catch (e) {
      return Promise.reject(e);
    }
  }

  async function tryHotspot(timeoutMs) {
    // Integración del hotspot nativo (Rust) en el fallback de canal.
    // Solo intentar en Tauri desktop; el SO decide soporte (Windows real, stubs en otros).
    if (!isDesktopTauri()) return false;
    var ms = Number(timeoutMs);
    if (!isFinite(ms) || ms <= 0) ms = 12000;
    try {
      var res = await Promise.race([
        invoke('crozzo_hotspot_start'),
        new Promise(function (_, reject) {
          setTimeout(function () { reject(new Error('crozzo_hotspot_timeout')); }, ms);
        }),
      ]);
      if (res && res.ok) {
        var ssid = (res && res.ssid != null) ? String(res.ssid) : '';
        var passphrase = (res && (res.passphrase != null || res.password != null))
          ? String(res.passphrase != null ? res.passphrase : res.password)
          : '';
        try {
          global.__CROZZO_HOTSPOT = { ssid: ssid, passphrase: passphrase, status: (res.status != null ? String(res.status) : '') };
          global.__CROZZO_HOTSPOT_SSID = ssid;
          global.__CROZZO_HOTSPOT_PASSPHRASE = passphrase;
          global.__CROZZO_ACTIVE_CHANNEL = 'hotspot';
        } catch (_) {}
        return true;
      }
      return false;
    } catch (e) {
      try {
        if (global.console && typeof global.console.warn === 'function') {
          global.console.warn('[CrozzoChannelFallback] tryHotspot failed:', (e && e.message) ? e.message : e);
        }
      } catch (_) {}
      return false;
    }
  }

  async function tryChannel(channel) {
    if (channel === 'lan') return await tryLan(2000);
    if (channel === 'cloud') return await tryCloud(2000);
    if (channel === 'hotspot') return await tryHotspot(12000);
    return false;
  }

  function autoHotspotEnabled() {
    try { return global.localStorage.getItem('crozzo_auto_hotspot_v1') === '1'; } catch (_) { return false; }
  }

  async function runFallback() {
    if (__trying) return __active;
    __trying = true;
    try {
      for (var i = 0; i < CHANNELS.length; i++) {
        var ch = CHANNELS[i];
        if (ch === 'offline') { setChannel('offline'); break; }
        if (ch === 'hotspot' && !autoHotspotEnabled()) continue;
        var ok = await tryChannel(ch);
        if (ok) { setChannel(ch); break; }
      }
      return __active;
    } finally {
      __trying = false;
    }
  }

  // Auto-ejecutar al cambiar tier / online
  function hook() {
    try {
      global.addEventListener('online', function () { runFallback(); });
      global.addEventListener('offline', function () { setChannel('offline'); runFallback(); });
      global.addEventListener('crozzo-tier-changed', function () { runFallback(); });
    } catch (_) {}
    // Inicial
    setTimeout(runFallback, 1500);
    setInterval(runFallback, 15000);
  }

  global.CrozzoChannelFallback = {
    run: runFallback,
    getActive: getActiveChannel,
    channels: CHANNELS.slice(),
    isDesktopTauri: isDesktopTauri,
    invoke: invoke,
    tryHotspot: tryHotspot,
  };
  global.crozzoChannelFallbackTry = runFallback;
  global.__CROZZO_ACTIVE_CHANNEL = __active;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hook);
  } else {
    setTimeout(hook, 0);
  }
})(window);
