/**
 * Crozzo — Scoreboard unificado de transporte Z0 (patrón multi-radio / first-wins).
 * No elige el usuario: reporta path activo y si mesh de supervivencia debe emitir.
 *
 * Prioridad emit: lan_ws > lan_http > gossip > ble/wifi_direct/webrtc; cloud en paralelo si WAN.
 */
(function (global) {
  'use strict';

  var __lastEmitLabel = '';
  var __lastAt = 0;

  function safe(fn, fallback) {
    try {
      return fn();
    } catch (_) {
      return fallback;
    }
  }

  function lanPath() {
    return safe(function () {
      if (global.CrozzoLanOpsSync && typeof global.CrozzoLanOpsSync.getPathHealth === 'function') {
        return global.CrozzoLanOpsSync.getPathHealth();
      }
      return null;
    }, null);
  }

  function cloudRtOk() {
    return !!safe(function () {
      if (typeof global.crozzoCloudOperationalRealtimeHealthy === 'function') {
        return global.crozzoCloudOperationalRealtimeHealthy();
      }
      if (typeof global.cloudOperationalRealtimeHealthy === 'function') {
        return global.cloudOperationalRealtimeHealthy();
      }
      return false;
    }, false);
  }

  function wanOk() {
    return !!safe(function () {
      return typeof global.crozzoCloudWanReady === 'function' && global.crozzoCloudWanReady();
    }, false);
  }

  function gossipPeers() {
    return safe(function () {
      var st = global.CrozzoOfflineGossip && global.CrozzoOfflineGossip.getStatus
        ? global.CrozzoOfflineGossip.getStatus()
        : null;
      if (!st) return { active: false, peerCount: 0 };
      return {
        active: !!st.active || !!st.standby,
        peerCount: Number(st.peerCount || 0) || 0,
      };
    }, { active: false, peerCount: 0 });
  }

  function blePeers() {
    return safe(function () {
      var st = global.CrozzoBleMesh && global.CrozzoBleMesh.getStatus ? global.CrozzoBleMesh.getStatus() : null;
      if (!st) return { active: false, peerCount: 0, transport: '' };
      return {
        active: !!st.active,
        peerCount: Number(st.peerCount || st.peers || 0) || 0,
        transport: String(st.transport || ''),
      };
    }, { active: false, peerCount: 0, transport: '' });
  }

  function wifiDirect() {
    return safe(function () {
      if (global.CrozzoWifiDirectBridge && typeof global.CrozzoWifiDirectBridge.getStatus === 'function') {
        return global.CrozzoWifiDirectBridge.getStatus();
      }
      return { active: false, peerCount: 0, supported: false };
    }, { active: false, peerCount: 0, supported: false });
  }

  function webrtcReady() {
    return !!safe(function () {
      if (global.EmergencyMesh && typeof global.EmergencyMesh.isReady === 'function') {
        return global.EmergencyMesh.isReady();
      }
      if (global.CrozzoEmergencyMesh && typeof global.CrozzoEmergencyMesh.isReady === 'function') {
        return global.CrozzoEmergencyMesh.isReady();
      }
      return false;
    }, false);
  }

  /**
   * Label canónico para diag / UI.
   * ws_primary | hybrid_poll | lan_http | mesh_survival | cloud_only | isolated
   */
  function computeLabel(h) {
    var lan = h.lan || {};
    if (lan.transport === 'ws_primary' || (lan.wsOpen && lan.healthy)) return 'ws_primary';
    if (lan.started && lan.transport === 'hybrid_poll') return 'hybrid_poll';
    if (lan.started && (lan.wsOpen || lan.transport === 'force_heal')) return 'lan_http';
    if (h.meshNeeded) return 'mesh_survival';
    if (h.cloudRt || h.wan) return 'cloud_only';
    return 'isolated';
  }

  function getHealth() {
    var lan = lanPath() || {
      started: false,
      wsOpen: false,
      healthy: false,
      transport: 'none',
      lastRxAgoMs: null,
    };
    var goss = gossipPeers();
    var ble = blePeers();
    var wd = wifiDirect();
    var meshAlive =
      !!goss.active ||
      goss.peerCount > 0 ||
      !!ble.active ||
      ble.peerCount > 0 ||
      !!(wd && wd.active) ||
      webrtcReady();
    var lanPrimary = !!(lan.wsOpen && lan.healthy) || lan.transport === 'ws_primary';
    var meshNeeded = !lanPrimary || lan.transport === 'anchor_silence' || lan.transport === 'force_heal';
    var out = {
      at: Date.now(),
      lan: lan,
      cloudRt: cloudRtOk(),
      wan: wanOk(),
      gossip: goss,
      ble: ble,
      wifiDirect: wd,
      webrtc: webrtcReady(),
      meshAlive: meshAlive,
      meshNeeded: meshNeeded,
      /** Orden preferido de emit local (cloud siempre aparte si WAN). */
      emitPriority: ['lan_ws', 'lan_http', 'gossip', 'ble', 'wifi_direct', 'webrtc'],
    };
    out.label = computeLabel(out);
    __lastEmitLabel = out.label;
    __lastAt = out.at;
    safe(function () {
      global.__CROZZO_TRANSPORT_PATH = out;
    });
    return out;
  }

  /** Mesh soft emit solo si LAN WS no cubre o force. */
  function shouldEmitMesh(force) {
    if (force) return true;
    var h = getHealth();
    return !!h.meshNeeded;
  }

  function getLabel() {
    if (__lastAt && Date.now() - __lastAt < 2000) return __lastEmitLabel || getHealth().label;
    return getHealth().label;
  }

  function emitChanged() {
    var h = getHealth();
    safe(function () {
      global.dispatchEvent(new CustomEvent('crozzo-transport-path-changed', { detail: h }));
    });
    return h;
  }

  global.CrozzoTransportPathHealth = {
    getHealth: getHealth,
    getLabel: getLabel,
    shouldEmitMesh: shouldEmitMesh,
    emitChanged: emitChanged,
  };
  global.crozzoTransportPathLabel = getLabel;
  global.crozzoTransportPathHealth = getHealth;
})(typeof window !== 'undefined' ? window : globalThis);
