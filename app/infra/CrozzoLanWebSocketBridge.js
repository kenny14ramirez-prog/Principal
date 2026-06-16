/**
 * WebSocket LAN — push instantáneo de comandas/estados desde caja (puerto HTTP+1).
 */
(function (global) {
  'use strict';

  var _ws = null;
  var _reconnectTimer = null;
  var _url = '';
  var RECONNECT_MS = 4200;

  function md() {
    return typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
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

  function tierAllows() {
    var t = String(global.__CROZZO_TIER_LAST || 'offline');
    return t === 'lan' || t === 'hotspot' || t === 'cloud';
  }

  function wsPort(cfg) {
    var p = Number(global.__CROZZO_LAN_WS_PORT);
    if (p > 0) return p;
    return (Number(cfg.port) || 3000) + 1;
  }

  function buildUrl() {
    var cfg = md();
    if (cfg.role === 'A') return '';
    var ip = String(cfg.centralIp || '').trim();
    if (!ip) return '';
    return 'ws://' + ip + ':' + wsPort(cfg) + '/';
  }

  function applyLanPush(msg) {
    if (!msg || !msg.payload) return;
    var raw = msg.payload;
    var typ = String(raw.type || '').toLowerCase();
    if (typ === 'runtime') {
      var snap = raw.data || raw.payload || raw;
      if (snap && typeof global.crozzoApplyRemoteRuntimeRow === 'function') {
        global.crozzoApplyRemoteRuntimeRow(snap, snap.savedAt ? new Date(Number(snap.savedAt)).toISOString() : null, {
          quiet: true,
        });
      }
      return;
    }
    if (typ === 'comanda' || typ === 'comanda_new') {
      var snap = raw.data || raw.payload || raw;
      if (snap && snap.id != null && typeof global.__crozzoEmergencyApplyComandaSnapshot === 'function') {
        global.__crozzoEmergencyApplyComandaSnapshot(snap, { source: 'lan_ws', skipPrint: false });
      }
      return;
    }
    if (typ === 'comanda_estado') {
      var pay = raw.data || raw.payload || raw;
      if (!pay) return;
      var c = null;
      if (pay.transaction_id && global.comandas) {
        c = global.comandas.find(function (x) {
          return x.transaction_id && String(x.transaction_id) === String(pay.transaction_id);
        });
      }
      if (!c && pay.id != null && typeof global.__crozzoEmergencyFindComandaById === 'function') {
        c = global.__crozzoEmergencyFindComandaById(pay.id);
      }
      if (!c) return;
      if (pay.estado === 'entregada' && typeof global.despacharComanda === 'function') {
        global.despacharComanda(c.id, { skipToast: true, skipGossip: true });
      } else if (typeof global.updateComandaEstado === 'function') {
        global.updateComandaEstado(c.id, pay.estado, { skipFanout: true });
      }
      try {
        if (
          (global.currentPage === 'comandas' || global.currentPage === 'cocina') &&
          typeof global.renderPage === 'function'
        ) {
          global.renderPage(global.currentPage);
        }
      } catch (_) {}
    }
  }

  function onMessage(ev) {
    try {
      var msg = JSON.parse(ev.data);
      if (msg && msg.event === 'lan_push') {
        applyLanPush(msg);
        return;
      }
      if (msg && (msg.type === 'comanda' || msg.type === 'comanda_estado' || msg.type === 'comanda_new')) {
        applyLanPush({ payload: msg });
      }
    } catch (_) {}
  }

  function scheduleReconnect() {
    if (_reconnectTimer) return;
    _reconnectTimer = global.setTimeout(function () {
      _reconnectTimer = null;
      connect();
    }, RECONNECT_MS);
  }

  function disconnect() {
    if (_reconnectTimer) {
      global.clearTimeout(_reconnectTimer);
      _reconnectTimer = null;
    }
    if (_ws) {
      try {
        _ws.onclose = null;
        _ws.close();
      } catch (_) {}
      _ws = null;
    }
    _url = '';
  }

  function connect() {
    if (!tierAllows()) {
      disconnect();
      return false;
    }
    var cfg = md();
    if (cfg.role !== 'B' || cfg.allowLan === false) return false;
    var url = buildUrl();
    if (!url || typeof WebSocket === 'undefined') return false;
    if (_ws && _url === url && (_ws.readyState === WebSocket.OPEN || _ws.readyState === WebSocket.CONNECTING)) {
      return true;
    }
    disconnect();
    _url = url;
    try {
      _ws = new WebSocket(url);
      _ws.onopen = function () {
        try {
          if (typeof global.crozzoWizardTierLogLine === 'function') {
            global.crozzoWizardTierLogLine('WebSocket LAN conectado');
          }
        } catch (_) {}
      };
      _ws.onmessage = onMessage;
      _ws.onclose = function () {
        _ws = null;
        scheduleReconnect();
      };
      _ws.onerror = function () {
        scheduleReconnect();
      };
      return true;
    } catch (_) {
      scheduleReconnect();
      return false;
    }
  }

  function notifyComandasByIds(ids) {
    if (!Array.isArray(ids) || !ids.length) return;
    var cfg = md();
    if (cfg.role !== 'A') return;
    ids.forEach(function (id) {
      var c =
        typeof global.__crozzoEmergencyFindComandaById === 'function'
          ? global.__crozzoEmergencyFindComandaById(id)
          : null;
      if (!c) return;
      var body = JSON.stringify({
        event: 'lan_push',
        endpoint: '/api/sync',
        payload: { type: 'comanda', data: c },
      });
      if (isDesktopTauri()) {
        invoke('crozzo_lan_ws_broadcast', { json: body }).catch(function () {});
      }
    });
  }

  function notifyEstado(comanda, estado) {
    if (!comanda) return;
    var cfg = md();
    if (cfg.role !== 'A') return;
    var body = JSON.stringify({
      event: 'lan_push',
      endpoint: '/api/sync',
      payload: {
        type: 'comanda_estado',
        data: {
          id: comanda.id,
          transaction_id: comanda.transaction_id,
          estado: estado || comanda.estado,
          lastUpdateAt: new Date().toISOString(),
        },
      },
    });
    if (isDesktopTauri()) {
      invoke('crozzo_lan_ws_broadcast', { json: body }).catch(function () {});
    }
  }

  function afterMainInit() {
    connect();
    if (!global.__crozzoLanWsTierBound) {
      global.__crozzoLanWsTierBound = true;
      global.addEventListener('crozzo-lan-up', function () {
        connect();
      });
      global.setInterval(function () {
        if (tierAllows()) connect();
      }, 12000);
    }
  }

  global.CrozzoLanWebSocketBridge = {
    connect: connect,
    disconnect: disconnect,
    notifyComandasByIds: notifyComandasByIds,
    notifyEstado: notifyEstado,
    afterMainInit: afterMainInit,
  };
})(typeof window !== 'undefined' ? window : globalThis);
