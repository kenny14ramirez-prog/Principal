/**
 * Crozzo — Reconciliación operativa de flota (mesas/comandas alineadas).
 *
 * Tras emparejar, actualizar o perder nube: alinea tablet y caja vía LAN
 * sin intervención del usuario.
 */
(function (global) {
  'use strict';

  var __inflight = null;
  var __lastAt = 0;
  var GAP_MS = 9000;

  function safe(fn) {
    try {
      return fn();
    } catch (_) {}
  }

  async function run(source) {
    source = String(source || 'fleet');
    var now = Date.now();
    if (__inflight && now - __lastAt < GAP_MS) return __inflight;
    __lastAt = now;
    __inflight = (async function () {
      safe(function () {
        if (global.CrozzoOperativeJournal && typeof global.CrozzoOperativeJournal.record === 'function') {
          global.CrozzoOperativeJournal.record({
            kind: 'fleet',
            code: 'reconcile',
            detail: { source: source },
          });
        }
      });
      try {
        if (typeof global.crozzoActivateLocalSyncPath === 'function') {
          await global.crozzoActivateLocalSyncPath('fleet_' + source);
        }
      } catch (_) {}
      var wanOk = false;
      try {
        wanOk = typeof global.crozzoCloudWanReady === 'function' && global.crozzoCloudWanReady();
      } catch (_) {}
      if (wanOk && typeof global.crozzoRunFullReconnectSync === 'function') {
        try {
          await global.crozzoRunFullReconnectSync({
            source: 'fleet_' + source,
            skipPrint: true,
            force: false,
          });
        } catch (_) {}
      }
      try {
        if (typeof global.crozzoPullComandasFromLan === 'function') {
          await global.crozzoPullComandasFromLan({ skipPrint: true, skipRender: true, force: true });
        }
      } catch (_) {}
      try {
        var mdRole = '';
        safe(function () {
          var md = typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
          mdRole = String(md.role || 'A').toUpperCase();
        });
        if (mdRole === 'A' && global.CrozzoLanSyncBridge && typeof global.CrozzoLanSyncBridge.pullLocalRuntimeOnce === 'function') {
          await global.CrozzoLanSyncBridge.pullLocalRuntimeOnce();
        } else if (typeof global.crozzoPullPosRuntimeCloud === 'function') {
          await global.crozzoPullPosRuntimeCloud({ quiet: true, skipRender: true, force: true });
        } else if (global.CrozzoLanOpsSync && typeof global.CrozzoLanOpsSync.pullRuntime === 'function') {
          await global.CrozzoLanOpsSync.pullRuntime({ quiet: true, skipRender: true, force: true });
        }
      } catch (_) {}
      try {
        if (typeof global.crozzoHandleRemoteRuntimeUiSync === 'function') {
          global.crozzoHandleRemoteRuntimeUiSync();
        }
      } catch (_) {}
      try {
        var uiPage = '';
        safe(function () {
          if (typeof global.crozzoGetActivePageId === 'function') {
            uiPage = String(global.crozzoGetActivePageId() || '').trim();
          }
        });
        if (!uiPage) {
          safe(function () {
            if (typeof global.currentPage !== 'undefined') uiPage = String(global.currentPage || '').trim();
          });
        }
        if (typeof global.crozzoZ0ScheduleUiRefresh === 'function') {
          global.crozzoZ0ScheduleUiRefresh(uiPage || undefined);
        } else if (typeof global.crozzoScheduleOperationalPageRefresh === 'function') {
          global.crozzoScheduleOperationalPageRefresh(uiPage || undefined);
        }
      } catch (_) {}
      return true;
    })();
    try {
      return await __inflight;
    } finally {
      global.setTimeout(function () {
        if (Date.now() - __lastAt >= GAP_MS - 200) __inflight = null;
      }, GAP_MS);
    }
  }

  function bindEvents() {
    if (global.__crozzoFleetReconcileBound) return;
    global.__crozzoFleetReconcileBound = true;
    safe(function () {
      global.addEventListener('crozzo-multidevice-config-saved', function () {
        global.setTimeout(function () {
          run('config_saved').catch(function () {});
        }, 1600);
      });
      global.addEventListener('crozzo-internal-qr-setup-exchange', function () {
        global.setTimeout(function () {
          run('qr_exchange').catch(function () {});
        }, 2200);
      });
      global.addEventListener('crozzo-internal-qr-recovery', function () {
        global.setTimeout(function () {
          run('qr_recovery').catch(function () {});
        }, 1800);
      });
    });
  }

  function maybeAfterVersionBump() {
    var ver = '';
    safe(function () {
      var m = global.document && global.document.querySelector('meta[name="crozzo-app-version"]');
      ver = m && m.getAttribute('content') ? String(m.getAttribute('content')) : '';
    });
    if (!ver) return;
    var lsKey = 'crozzo_fleet_reconcile_ver';
    var prev = safe(function () {
      return global.localStorage.getItem(lsKey);
    }) || '';
    if (prev === ver) return;
    safe(function () {
      global.localStorage.setItem(lsKey, ver);
    });
    global.setTimeout(function () {
      run('version_bump').catch(function () {});
    }, 12000);
  }

  function start() {
    bindEvents();
    maybeAfterVersionBump();
  }

  global.CrozzoFleetOperationalReconcile = { run: run, start: start };
  global.crozzoFleetOperationalReconcile = run;
})(typeof window !== 'undefined' ? window : globalThis);
