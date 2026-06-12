/**
 * Servidor LAN multidispositivo en Tauri (Rol A) + drenado hacia mirror cloud.
 */
(function (global) {
  'use strict';

  var _pollTimer = null;
  var POLL_MS = 4200;

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
    } catch (_) {
      return { running: false };
    }
  }

  function afterMainInit() {
    syncFromConfig().catch(function () {});
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
    syncFromConfig: syncFromConfig,
    stopServer: stopServer,
    status: status,
    drainPendingOnce: drainPendingOnce,
    afterMainInit: afterMainInit,
  };
})(typeof window !== 'undefined' ? window : this);
