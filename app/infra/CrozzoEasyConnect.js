/**
 * Crozzo — Conexión fácil (UX operador, no programador).
 *
 * Traduce tier/LAN/mesh a mensajes simples y ejecuta autoconexión silenciosa:
 * Wi‑Fi → LAN caja → Bluetooth/malla → nube. No reemplaza emparejamiento QR
 * inicial (una vez); después el equipo se mantiene solo.
 */
(function (global) {
  'use strict';

  var __started = false;
  var __lastMsg = '';
  var __lastMsgAt = 0;
  var __autoInflight = false;
  var AUTO_GAP_MS = 14000;
  var MSG_TOAST_GAP_MS = 120000;

  function safe(fn, def) {
    try {
      return fn();
    } catch (_) {
      return def;
    }
  }

  function md() {
    return typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
  }

  function easyModeEnabled() {
    try {
      if (typeof global.config !== 'undefined' && global.config.get) {
        var v = global.config.get('easyConnectUi');
        if (v === false || v === '0') return false;
      }
    } catch (_) {}
    return true;
  }

  function lanOk() {
    try {
      var last = global.__CROZZO_LAN_LAST_OK;
      if (last && Date.now() - last < 45000) return true;
    } catch (_) {}
    return typeof global.crozzoIsLocalLanSegmentUp === 'function' && global.crozzoIsLocalLanSegmentUp();
  }

  function gossipPeers() {
    var st = safe(function () {
      return global.CrozzoOfflineGossip && global.CrozzoOfflineGossip.getStatus
        ? global.CrozzoOfflineGossip.getStatus()
        : null;
    }, null);
    return st && st.active ? st.peerCount || 0 : 0;
  }

  function blePeers() {
    var st = safe(function () {
      return global.CrozzoBleMesh && global.CrozzoBleMesh.getStatus ? global.CrozzoBleMesh.getStatus() : null;
    }, null);
    return st && st.active ? st.peerCount || 0 : 0;
  }

  function hasCloud() {
    return String(global.__CROZZO_TIER_LAST || '') === 'cloud';
  }

  function hasCentralIp() {
    var cfg = md();
    return !!(String(cfg.centralIp || '').trim());
  }

  /** Mensaje humano para operador (no técnico). */
  function evaluateSimpleStatus() {
    var cfg = md();
    var role = cfg.role === 'B' ? 'B' : 'A';
    var mind = safe(function () {
      return typeof global.crozzoGetDeviceMindDecision === 'function' ? global.crozzoGetDeviceMindDecision() : null;
    }, null);
    var gp = gossipPeers();
    var bp = blePeers();

    if (role === 'A') {
      return {
        level: 'ok',
        message: 'Caja lista — las tablets pueden conectarse',
        hint: 'Deje Wi‑Fi y Crozzo abiertos en este equipo.',
        technical: (mind && mind.human) || '',
      };
    }

    if (lanOk() && (hasCentralIp() || role === 'B')) {
      return {
        level: 'ok',
        message: 'Conectado con la caja',
        hint: 'Puede tomar pedidos con normalidad.',
        technical: (mind && mind.human) || '',
      };
    }

    if (hasCloud()) {
      return {
        level: 'ok',
        message: 'Conectado por internet',
        hint: 'Si hay Wi‑Fi del local, también buscamos la caja en segundo plano.',
        technical: (mind && mind.human) || '',
      };
    }

    if (gp > 0 || bp > 0) {
      return {
        level: 'ok',
        message: 'Conectado con otros equipos cercanos',
        hint: 'Red de respaldo activa (Wi‑Fi / Bluetooth).',
        technical: (mind && mind.human) || '',
      };
    }

    if (lanOk() || String(global.__CROZZO_TIER_LAST || '') === 'lan') {
      return {
        level: 'wait',
        message: 'Buscando la caja…',
        hint: 'Mantenga Wi‑Fi y Bluetooth encendidos. Si es la primera vez, escanee el QR de la caja.',
        technical: (mind && mind.human) || '',
      };
    }

    return {
      level: 'help',
      message: 'Sin enlace con la caja',
      hint: '1) Misma Wi‑Fi del restaurante · 2) Bluetooth encendido · 3) Escanee el QR de la caja (solo una vez).',
      technical: (mind && mind.human) || '',
    };
  }

  function paintBadge(status) {
    if (!easyModeEnabled() || typeof document === 'undefined') return;
    var el = document.getElementById('crozzoConnectivityTierBadge');
    if (!el || !status) return;
    var txtEl = el.querySelector('.crozzo-status-txt');
    if (!txtEl) return;
    var dotEl = el.querySelector('.crozzo-status-dot');
    txtEl.textContent = status.message;
    if (dotEl) {
      dotEl.classList.remove('ok', 'warn', 'err');
      dotEl.classList.add(status.level === 'ok' ? 'ok' : status.level === 'wait' ? 'warn' : 'err');
    }
    try {
      var base = String(el.getAttribute('title') || '').split(' · Operador:')[0].trim();
      el.setAttribute('title', base + ' · Operador: ' + status.hint);
      el.setAttribute('data-crozzo-easy', status.level);
    } catch (_) {}
  }

  function maybeToastStatus(status) {
    if (!status || typeof global.showToast !== 'function') return;
    var msg = status.message;
    if (msg === __lastMsg && Date.now() - __lastMsgAt < MSG_TOAST_GAP_MS) return;
    if (status.level === 'wait') return;
    __lastMsg = msg;
    __lastMsgAt = Date.now();
    global.showToast(msg + (status.level === 'help' ? ' — ' + status.hint : ''), status.level === 'ok' ? 'info' : 'warning');
  }

  async function runAutoConnect(opts) {
    opts = opts || {};
    if (__autoInflight) return;
    __autoInflight = true;
    try {
      var cfg = md();
      if (cfg.role === 'B' && cfg.allowLan !== false) {
        if (typeof global.crozzoWifiZoneResolveCentral === 'function') {
          await global.crozzoWifiZoneResolveCentral({ force: !!opts.force }).catch(function () {});
        }
        if (typeof global.crozzoActivateLocalSyncPath === 'function') {
          await global.crozzoActivateLocalSyncPath('easy_connect').catch(function () {});
        }
      }
      safe(function () {
        if (global.CrozzoWifiZoneBridge && typeof global.CrozzoWifiZoneBridge.startWatch === 'function') {
          global.CrozzoWifiZoneBridge.startWatch();
        }
      });
      safe(function () {
        if (global.CrozzoDeviceMind && typeof global.CrozzoDeviceMind.ensureMeshStandby === 'function') {
          global.CrozzoDeviceMind.ensureMeshStandby();
        }
      });
      safe(function () {
        if (global.CrozzoBleMesh && typeof global.CrozzoBleMesh.requestBluetoothEnable === 'function') {
          global.CrozzoBleMesh.requestBluetoothEnable().catch(function () {});
        } else if (global.CrozzoAndroidNative && typeof global.CrozzoAndroidNative.requestBluetoothEnable === 'function') {
          global.CrozzoAndroidNative.requestBluetoothEnable().catch(function () {});
        }
      });
      safe(function () {
        if (global.CrozzoBleMesh && typeof global.CrozzoBleMesh.start === 'function') {
          global.CrozzoBleMesh.start().catch(function () {});
        }
      });
      safe(function () {
        if (global.CrozzoOfflineGossip && typeof global.CrozzoOfflineGossip.bootstrapCluster === 'function') {
          global.CrozzoOfflineGossip.bootstrapCluster();
        }
      });
      if (typeof global.crozzoRunFullReconnectSync === 'function' && (opts.force || !lanOk())) {
        await global.crozzoRunFullReconnectSync({ source: 'easy_connect', skipPrint: true }).catch(function () {});
      }
    } finally {
      __autoInflight = false;
    }
  }

  function evaluate(opts) {
    opts = opts || {};
    var status = evaluateSimpleStatus();
    global.__CROZZO_EASY_CONNECT = status;
    if (easyModeEnabled()) paintBadge(status);
    if (!opts.quiet) maybeToastStatus(status);
    safe(function () {
      global.dispatchEvent(new CustomEvent('crozzo-easy-connect-changed', { detail: status }));
    });
    return status;
  }

  function startWatch() {
    if (__started) return;
    __started = true;
    global.addEventListener('crozzo-tier-changed', function () {
      evaluate({ quiet: true });
      runAutoConnect({ force: false }).catch(function () {});
    });
    global.addEventListener('crozzo-device-mind-changed', function () {
      evaluate({ quiet: true });
    });
    global.addEventListener('online', function () {
      runAutoConnect({ force: true }).catch(function () {});
    });
    global.setInterval(function () {
      try {
        if (typeof document !== 'undefined' && document.hidden) return;
      } catch (_) {}
      evaluate({ quiet: true });
      runAutoConnect({ force: false }).catch(function () {});
    }, 28000);
  }

  function afterMainInit() {
    startWatch();
    global.setTimeout(function () {
      runAutoConnect({ force: true })
        .catch(function () {})
        .then(function () {
          evaluate({ quiet: false });
        });
    }, 3500);
  }

  global.crozzoGetEasyConnectStatus = function () {
    return global.__CROZZO_EASY_CONNECT || evaluateSimpleStatus();
  };
  global.crozzoRunEasyConnect = runAutoConnect;

  global.CrozzoEasyConnect = {
    evaluate: evaluate,
    runAutoConnect: runAutoConnect,
    evaluateSimpleStatus: evaluateSimpleStatus,
    afterMainInit: afterMainInit,
    easyModeEnabled: easyModeEnabled,
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startWatch);
    } else {
      startWatch();
    }
  }
})(typeof window !== 'undefined' ? window : this);
