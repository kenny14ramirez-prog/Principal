/**
 * Crozzo POS — Guardián offline: conectividad, modo local seguro, salud del reservorio.
 */
(function (global) {
  'use strict';

  var state = { online: true, lastCheck: null };

  function isBrowserOnline() {
    try {
      return global.navigator ? global.navigator.onLine !== false : true;
    } catch (_) {
      return true;
    }
  }

  function hasCloudConfig() {
    try {
      return typeof global.crozzoOnlineConfigReady === 'function' && global.crozzoOnlineConfigReady();
    } catch (_) {
      return false;
    }
  }

  function runtimePrefersOffline() {
    try {
      if (global.config && global.config.get) {
        var m = global.config.get('runtimeSyncModo');
        if (m === 'offline') return true;
      }
    } catch (_) {}
    return false;
  }

  /** Nube solo si hay config, navegador online y preferencia no es offline puro */
  function shouldUseCloud() {
    if (runtimePrefersOffline()) return false;
    if (!isBrowserOnline()) return false;
    if (!hasCloudConfig()) return false;
    return true;
  }

  function modeInfo() {
    if (shouldUseCloud()) {
      return { mode: 'cloud', label: 'Nube activa', icon: '☁️', secure: true };
    }
    if (hasCloudConfig() && !isBrowserOnline()) {
      return { mode: 'offline-local', label: 'Sin internet — local seguro', icon: '🔒', secure: true };
    }
    if (runtimePrefersOffline()) {
      return { mode: 'offline-pref', label: 'Modo offline (preferencia)', icon: '💾', secure: true };
    }
    return { mode: 'local', label: 'Modo local — datos en este equipo', icon: '💾', secure: true };
  }

  function refreshConnectivity() {
    state.online = isBrowserOnline();
    state.lastCheck = new Date().toISOString();
    try {
      document.dispatchEvent(
        new CustomEvent('crozzo-connectivity-changed', {
          detail: { online: state.online, mode: modeInfo() },
        })
      );
    } catch (_) {}
    return state.online;
  }

  function onOffline() {
    refreshConnectivity();
    try {
      if (typeof global.showToast === 'function') {
        global.showToast('Sin internet — operando en modo local seguro (reservorio)', 'info');
      }
    } catch (_) {}
  }

  function onOnline() {
    refreshConnectivity();
    try {
      if (typeof global.showToast === 'function') {
        global.showToast('Conexión restablecida', 'success');
      }
    } catch (_) {}
  }

  function ensureReservorioReady() {
    var R = global.CrozzoReservorio;
    if (!R) return false;
    try {
      if (R.repairIfNeeded) R.repairIfNeeded();
      else if (R.migrateLegacy) R.migrateLegacy();
      if (R.syncProveedoresToConfig) R.syncProveedoresToConfig();
    } catch (e) {
      console.warn('[offline] reservorio init', e);
    }
    return true;
  }

  function getHealth() {
    var R = global.CrozzoReservorio;
    var base = R && R.getHealth ? R.getHealth() : { ok: !!R };
    var mi = modeInfo();
    return Object.assign({}, base, {
      connectivity: mi,
      browserOnline: isBrowserOnline(),
      cloudConfigured: hasCloudConfig(),
      shouldUseCloud: shouldUseCloud(),
      lastConnectivityCheck: state.lastCheck,
    });
  }

  function statusBarHtml(prefix) {
    prefix = prefix || '';
    var mi = modeInfo();
    var R = global.CrozzoReservorio;
    var h = R && R.getHealth ? R.getHealth() : {};
    var backup = h.hasBackup ? ' · copia de seguridad OK' : '';
    var recovered = h.recoveredFromBackup ? ' · <span style="color:#f59e0b">recuperado de backup</span>' : '';
    return (
      prefix +
      '<div class="crozzo-hub-status crozzo-offline-status" id="crozzo-hub-status" style="padding:6px 14px;font-size:11px;border-bottom:1px solid var(--border);background:var(--bg-card);color:var(--text-muted)">' +
      '<span>' +
      mi.icon +
      ' <strong style="color:var(--text-primary)">' +
      mi.label +
      '</strong>' +
      backup +
      recovered +
      '</span></div>'
    );
  }

  function exportBackupFile() {
    var R = global.CrozzoReservorio;
    if (!R || !R.exportSnapshot) return false;
    try {
      var snap = R.exportSnapshot();
      var name = 'crozzo-reservorio-' + new Date().toISOString().slice(0, 10) + '.json';
      var blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 500);
      return true;
    } catch (e) {
      console.warn('[offline] export', e);
      return false;
    }
  }

  function init() {
    if (global.__crozzoOfflineInited) return;
    global.__crozzoOfflineInited = true;
    state.online = isBrowserOnline();
    ensureReservorioReady();
    global.addEventListener('online', onOnline);
    global.addEventListener('offline', onOffline);
    global.addEventListener('beforeunload', function () {
      try {
        if (global.CrozzoReservorio && global.CrozzoReservorio.flushBackup) global.CrozzoReservorio.flushBackup();
      } catch (_) {}
    });
    setInterval(function () {
      ensureReservorioReady();
    }, 120000);
  }

  global.crozzoShouldUseCloud = shouldUseCloud;
  global.crozzoIsBrowserOnline = isBrowserOnline;
  global.CrozzoReservorioOffline = {
    init: init,
    shouldUseCloud: shouldUseCloud,
    isBrowserOnline: isBrowserOnline,
    hasCloudConfig: hasCloudConfig,
    modeInfo: modeInfo,
    getHealth: getHealth,
    statusBarHtml: statusBarHtml,
    exportBackupFile: exportBackupFile,
    ensureReservorioReady: ensureReservorioReady,
    refreshConnectivity: refreshConnectivity,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
