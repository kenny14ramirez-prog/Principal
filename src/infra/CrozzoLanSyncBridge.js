/**
 * Servidor LAN multidispositivo en Tauri (Rol A) + drenado hacia mirror cloud.
 */
(function (global) {
  'use strict';

  var _pollTimer = null;
  var POLL_MS = 4200;

  function isDesktopTauri() {
    try {
      var t = global.__TAURI__;
      if (t && t.core && typeof t.core.invoke === 'function') {
        global.__CROZZO_IS_TAURI__ = true;
        return true;
      }
      if (t && typeof t.invoke === 'function') {
        global.__CROZZO_IS_TAURI__ = true;
        return true;
      }
      return !!(global.__CROZZO_IS_TAURI__ && t);
    } catch (_) {
      return false;
    }
  }

  function invoke(cmd, args) {
    var t = global.__TAURI__;
    if (t && t.core && typeof t.core.invoke === 'function') return t.core.invoke(cmd, args || {});
    if (t && typeof t.invoke === 'function') return t.invoke(cmd, args || {});
    return Promise.reject(new Error('Tauri invoke no disponible'));
  }

  function crozzoIsLocalLanHost(ip) {
    var host = String(ip || '').trim().toLowerCase();
    if (!host || host === '127.0.0.1' || host === 'localhost' || host === '::1') return true;
    try {
      if (global.__CROZZO_DETECTED_LAN_IP && host === String(global.__CROZZO_DETECTED_LAN_IP).trim().toLowerCase()) {
        return true;
      }
      if (typeof global.getMultiDeviceConfig === 'function') {
        var md = global.getMultiDeviceConfig();
        if (md && md.role !== 'B' && md.serverIp && host === String(md.serverIp).trim().toLowerCase()) return true;
      }
    } catch (_) {}
    return false;
  }

  async function nativeHealth(port) {
    if (!isDesktopTauri()) return { ok: false, running: false };
    try {
      var h = await invoke('crozzo_lan_sync_health');
      if (h && h.ok && h.running) return { ok: true, running: true, port: h.port || port, via: 'native' };
      return { ok: false, running: false, port: port, via: 'native', error: 'Servidor LAN interno no está activo' };
    } catch (e) {
      return { ok: false, running: false, port: port, via: 'native', error: String((e && e.message) || e) };
    }
  }

  function readLanEnabledRoleA() {
    try {
      var md = typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : null;
      if (!md || md.role !== 'A' || md.allowLan === false) return null;
      var lanRaw = global.readCrozzoLanJson && global.readCrozzoLanJson();
      if (lanRaw && lanRaw.lanSyncEnabled === false) return null;
      return md;
    } catch (_) {
      return null;
    }
  }

  function envelopeFromSubmission(sub) {
    var p = (sub && sub.payload) || {};
    var data = p.data != null ? p.data : p.payload != null ? p.payload : {};
    return {
      uuid: p.uuid || sub.id,
      businessId: p.businessId || p.business_id || '',
      deviceId: p.deviceId || p.device_id || 'unknown',
      type: p.type || 'sync',
      payload: data,
      location_id: p.location_id || p.locationId || '',
      source: 'lan_http',
    };
  }

  function tryApplyLanComandaEstado(sub) {
    var raw = (sub && sub.payload) || {};
    if (String(raw.type || '').toLowerCase() !== 'comanda_estado') return false;
    var pay = raw.data || raw.payload || null;
    if (!pay) return false;
    try {
      if (typeof global.__crozzoEmergencyFindComandaById === 'function' && global.comandas) {
        var c = null;
        if (pay.transaction_id) {
          c = global.comandas.find(function (x) {
            return x.transaction_id && String(x.transaction_id) === String(pay.transaction_id);
          });
        }
        if (!c && pay.id != null) c = global.__crozzoEmergencyFindComandaById(pay.id);
        if (!c) return false;
        if (pay.estado === 'entregada' && typeof global.despacharComanda === 'function') {
          global.despacharComanda(c.id, { skipToast: true, skipGossip: true });
        } else if (typeof global.updateComandaEstado === 'function') {
          global.updateComandaEstado(c.id, pay.estado, { skipFanout: true });
        }
      }
      if (typeof global.crozzoPushComandaToCloud === 'function' && pay.id != null) {
        var merged =
          typeof global.__crozzoEmergencyFindComandaById === 'function'
            ? global.__crozzoEmergencyFindComandaById(pay.id)
            : null;
        if (merged) global.crozzoPushComandaToCloud(merged).catch(function () {});
      }
      return true;
    } catch (e) {
      try {
        console.warn('[lan-sync] comanda_estado', e);
      } catch (_) {}
      return false;
    }
  }

  function tryApplyLanComanda(sub) {
    var raw = (sub && sub.payload) || {};
    var typ = String(raw.type || '').toLowerCase();
    if (typ !== 'comanda' && typ !== 'comanda_new') return false;
    var snap = raw.data || raw.payload || null;
    if (!snap || snap.id == null) return false;
    try {
      if (typeof global.__crozzoEmergencyApplyComandaSnapshot === 'function') {
        global.__crozzoEmergencyApplyComandaSnapshot(snap, { source: 'lan_central' });
      }
      if (typeof global.crozzoPushComandaToCloud === 'function') {
        var merged =
          typeof global.__crozzoEmergencyFindComandaById === 'function'
            ? global.__crozzoEmergencyFindComandaById(snap.id)
            : null;
        global.crozzoPushComandaToCloud(merged || snap).catch(function () {});
      }
      return true;
    } catch (e) {
      try {
        console.warn('[lan-sync] comanda', e);
      } catch (_) {}
      return false;
    }
  }

  async function drainPendingOnce() {
    if (!isDesktopTauri()) return 0;
    var items = [];
    try {
      items = await invoke('crozzo_lan_sync_drain_pending');
    } catch (_) {
      return 0;
    }
    if (!items || !items.length) return 0;
    var n = 0;
    var comandas = 0;
    for (var i = 0; i < items.length; i++) {
      if (tryApplyLanComandaEstado(items[i])) {
        comandas++;
        n++;
        continue;
      }
      if (tryApplyLanComanda(items[i])) {
        comandas++;
        n++;
        continue;
      }
      var env = envelopeFromSubmission(items[i]);
      try {
        if (typeof global.crozzoInboundP2PToMirror === 'function') {
          await global.crozzoInboundP2PToMirror(env);
          n++;
        }
      } catch (e) {
        try {
          console.warn('[lan-sync] mirror', e);
        } catch (_) {}
      }
    }
    if (n > 0 && typeof global.crozzoWizardTierLogLine === 'function') {
      var msg = 'LAN HTTP → central: ' + n + ' operación(es)';
      if (comandas) msg += ' (' + comandas + ' comanda(s) aplicadas)';
      global.crozzoWizardTierLogLine(msg);
    }
    return n;
  }

  function stopPolling() {
    if (_pollTimer) {
      clearInterval(_pollTimer);
      _pollTimer = null;
    }
  }

  function startPolling() {
    stopPolling();
    if (!isDesktopTauri()) return;
    _pollTimer = setInterval(function () {
      try {
        if (typeof document !== 'undefined' && document.hidden) return;
      } catch (_) {}
      drainPendingOnce();
    }, POLL_MS);
  }

  async function stopServer() {
    stopPolling();
    if (!isDesktopTauri()) return { running: false };
    try {
      return await invoke('crozzo_lan_sync_stop');
    } catch (_) {
      return { running: false };
    }
  }

  function shouldAutoStartLanServer() {
    if (!isDesktopTauri()) return false;
    try {
      var lan = global.readCrozzoLanJson && global.readCrozzoLanJson();
      if (lan && lan.lanSyncEnabled === false) return false;
      var md = typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : null;
      if (md && String(md.role || 'A').toUpperCase() === 'B') return false;
      if (md && md.allowLan === false) return false;
      return true;
    } catch (_) {
      return true;
    }
  }

  async function detectLocalIpQuick() {
    if (!isDesktopTauri()) return '';
    try {
      return String((await invoke('crozzo_guess_local_ipv4')) || '').trim();
    } catch (_) {
      return '';
    }
  }

  async function bootstrapLanConfigForCaja() {
    if (!isDesktopTauri()) return false;
    var lip = await detectLocalIpQuick();
    if (!lip && typeof global.crozzoDetectLocalIpTauri === 'function') {
      try {
        lip = String((await global.crozzoDetectLocalIpTauri()) || '').trim();
      } catch (_) {}
    }
    if (!lip && typeof global.detectLocalIP === 'function') {
      try {
        lip = String((await global.detectLocalIP()) || '').trim();
      } catch (_) {}
    }
    if (lip) {
      try {
        global.__CROZZO_DETECTED_LAN_IP = lip;
        global.localStorage.setItem('crozzo_wifi_zone_last_ip', lip);
      } catch (_) {}
    }
    var changed = false;
    try {
      var lanRaw = global.localStorage.getItem('crozzo_lan_config');
      var lan = lanRaw ? JSON.parse(lanRaw) : null;
      if (!lan || lan.lanSyncEnabled !== true) {
        var devId =
          typeof global.ensureCrozzoDeviceId === 'function' ? global.ensureCrozzoDeviceId() : 'caja';
        lan = {
          version: 2,
          lanSyncEnabled: true,
          role: 'A',
          serverIp: lip || (lan && lan.serverIp) || '',
          port: 3000,
          allowLan: true,
          offlineEnabled: true,
          locationId: (lan && lan.locationId) || 'loc-' + String(devId).slice(0, 10),
          networkSsidNote: (lan && lan.networkSsidNote) || 'Red Wi‑Fi principal',
          savedAt: Date.now(),
        };
        global.localStorage.setItem('crozzo_lan_config', JSON.stringify(lan));
        changed = true;
      } else if (lip && !String(lan.serverIp || '').trim()) {
        lan.serverIp = lip;
        lan.savedAt = Date.now();
        global.localStorage.setItem('crozzo_lan_config', JSON.stringify(lan));
        changed = true;
      }
    } catch (_) {}
    if (changed && typeof global.persistMultiDeviceConfig === 'function' && typeof global.getMultiDeviceConfig === 'function') {
      try {
        global.persistMultiDeviceConfig(global.getMultiDeviceConfig());
      } catch (_) {}
    }
    if (global.CrozzoNetworkGuard && typeof global.CrozzoNetworkGuard.setIsActiveServer === 'function') {
      global.CrozzoNetworkGuard.setIsActiveServer(true);
    }
    return changed || !!lip;
  }

  async function probeHealthLocal(port) {
    port = Number(port) || 3000;
    if (!isDesktopTauri()) {
      return { ok: false, running: false, via: null, error: 'Abra la app de escritorio BONA origen (.exe), no el navegador' };
    }
    var st = await nativeHealth(port);
    if (st.ok) return st;
    await ensureServerForPairing();
    st = await nativeHealth(port);
    return st;
  }

  async function ensureServerForPairing() {
    if (!isDesktopTauri()) return { running: false, error: 'Solo disponible en la app de escritorio' };
    await bootstrapLanConfigForCaja();
    var md =
      typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : { role: 'A', port: 3000 };
    if (!md || String(md.role || 'A').toUpperCase() !== 'A') return { running: false, error: 'Rol distinto de caja (A)' };
    try {
      var st0 = await invoke('crozzo_lan_sync_status');
      if (st0 && st0.running) {
        startPolling();
        return st0;
      }
    } catch (e0) {
      try {
        console.warn('[lan-sync] status', e0);
      } catch (_) {}
    }
    try {
      var st = await invoke('crozzo_lan_sync_start', {
        port: Number(md.port) || 3000,
        locationId: String(md.locationId || '').trim(),
        deviceId: String(md.deviceId || '').trim(),
        businessId: String(md.businessId || '').trim(),
      });
      startPolling();
      return st;
    } catch (e) {
      try {
        console.warn('[lan-sync] ensureServerForPairing', e);
      } catch (_) {}
      return { running: false, error: String((e && e.message) || e) };
    }
  }

  async function syncFromConfig() {
    var md = readLanEnabledRoleA();
    if (!md) {
      await stopServer();
      return { running: false };
    }
    if (!isDesktopTauri()) return { running: false };
    try {
      var st = await invoke('crozzo_lan_sync_start', {
        port: Number(md.port) || 3000,
        locationId: String(md.locationId || '').trim(),
        deviceId: String(md.deviceId || '').trim(),
        businessId: String(md.businessId || '').trim(),
      });
      startPolling();
      await drainPendingOnce();
      return st;
    } catch (e) {
      try {
        console.warn('[lan-sync] start', e);
      } catch (_) {}
      return { running: false, error: String((e && e.message) || e) };
    }
  }

  async function status() {
    if (!isDesktopTauri()) return { running: false };
    try {
      return await invoke('crozzo_lan_sync_status');
    } catch (e) {
      try {
        global.__CROZZO_LAN_LAST_ERROR = String((e && e.message) || e);
        if (!global.__CROZZO_LAN_PERM_WARNED) {
          global.__CROZZO_LAN_PERM_WARNED = true;
          console.warn(
            '[lan-sync] Servidor LAN no disponible en esta app. Reinstale el .exe compilado con menu.bat [5] o use npm run tauri dev.',
            e
          );
        }
      } catch (_) {}
      return { running: false, error: String((e && e.message) || e) };
    }
  }

  function afterMainInit() {
    if (shouldAutoStartLanServer()) {
      ensureServerForPairing().catch(function () {});
      return;
    }
    syncFromConfig().catch(function () {});
  }

  var _ensureCooldownMs = 9000;
  var _ensureLastAt = 0;
  var _ensureLastOk = false;

  async function ensureServerOnce(force) {
    if (!isDesktopTauri()) return { running: false, skipped: true };
    var now = Date.now();
    if (!force && now - _ensureLastAt < _ensureCooldownMs) {
      return { running: _ensureLastOk, cached: true };
    }
    _ensureLastAt = now;
    var st = await ensureServerForPairing();
    _ensureLastOk = !!(st && st.running);
    if (!_ensureLastOk) {
      try {
        global.__CROZZO_LAN_LAST_ERROR = String((st && st.error) || global.__CROZZO_LAN_LAST_ERROR || 'Servidor LAN no arrancó');
        if (!global.__CROZZO_LAN_START_WARNED && typeof global.showToast === 'function') {
          global.__CROZZO_LAN_START_WARNED = true;
          global.showToast(
            'Servidor LAN interno no arrancó. Reinstale con menu.bat [5] o ejecute npm run tauri dev.',
            'warning'
          );
        }
      } catch (_) {}
    }
    return st || { running: false };
  }

  function bootLanServerEarly() {
    if (!shouldAutoStartLanServer()) return;
    ensureServerOnce(true).catch(function (e) {
      try {
        console.warn('[lan-sync] arranque temprano', e);
      } catch (_) {}
    });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bootLanServerEarly);
    } else {
      bootLanServerEarly();
    }
  }
  function bindOfflineKeepLan() {
    if (global.__crozzoLanBridgeOfflineBound) return;
    global.__crozzoLanBridgeOfflineBound = true;
    try {
      global.addEventListener('offline', function () {
        syncFromConfig().catch(function () {});
      });
    } catch (_) {}
  }
  bindOfflineKeepLan();

  global.CrozzoLanSyncBridge = {
    isDesktopTauri: isDesktopTauri,
    crozzoIsLocalLanHost: crozzoIsLocalLanHost,
    nativeHealth: nativeHealth,
    shouldAutoStartLanServer: shouldAutoStartLanServer,
    bootstrapLanConfigForCaja: bootstrapLanConfigForCaja,
    ensureServerOnce: ensureServerOnce,
    syncFromConfig: syncFromConfig,
    ensureServerForPairing: ensureServerForPairing,
    probeHealthLocal: probeHealthLocal,
    stopServer: stopServer,
    status: status,
    drainPendingOnce: drainPendingOnce,
    afterMainInit: afterMainInit,
  };
})(typeof window !== 'undefined' ? window : this);
