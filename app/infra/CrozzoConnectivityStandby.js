/**
 * Crozzo — Standby LAN paralelo cuando la nube parece activa pero no es fiable.
 * Refina crozzoCloudWanReady / crozzoDeferLocalSync tras PosMain.
 */
(function (global) {
  'use strict';

  var _origWanReady = global.crozzoCloudWanReady;
  var _origDefer = global.crozzoDeferLocalSync;

  function safe(fn) {
    try {
      return fn();
    } catch (_) {
      return undefined;
    }
  }

  function cloudUnderPressure() {
    var thr = global.CrozzoCloudThrottle;
    return !!(thr && typeof thr.isUnderPressure === 'function' && thr.isUnderPressure());
  }

  function wanDownFlagged() {
    try {
      if (global.__CROZZO_WAN_DOWN_UNTIL && Date.now() < Number(global.__CROZZO_WAN_DOWN_UNTIL)) return true;
    } catch (_) {}
    try {
      if (global.__CROZZO_WAN_LAST_FAIL && Date.now() - global.__CROZZO_WAN_LAST_FAIL < 22000) return true;
    } catch (_) {}
    return false;
  }

  function crozzoCloudWanReady() {
    if (cloudUnderPressure()) return false;
    if (wanDownFlagged()) return false;
    if (typeof _origWanReady === 'function') return !!_origWanReady();
    return false;
  }

  /** Nube lleva sync de verdad: WAN + Realtime sano + sin presión. */
  function crozzoCloudQualityReliable(maxSilenceMs) {
    if (!crozzoCloudWanReady()) return false;
    try {
      if (
        typeof global.crozzoCloudOperationalRealtimeHealthy === 'function' &&
        !global.crozzoCloudOperationalRealtimeHealthy(maxSilenceMs == null ? 28000 : maxSilenceMs)
      ) {
        return false;
      }
    } catch (_) {}
    return true;
  }

  function comandaOutboxNeedsLanBackup() {
    try {
      if (typeof global.crozzoComandaOutboxStatus !== 'function') return false;
      var st = global.crozzoComandaOutboxStatus();
      if (!st || !st.pending) return false;
      var entries = st.entries || [];
      for (var i = 0; i < entries.length; i++) {
        var ent = entries[i];
        if (ent && ((Number(ent.attempts) || 0) > 0 || ent.lastErr)) return true;
      }
    } catch (_) {}
    return false;
  }

  var __cloudWriteOkAt = 0;
  var __cloudReadOkAt = 0;
  var DATA_OK_MS = 48000;

  function crozzoNoteCloudWriteOk() {
    __cloudWriteOkAt = Date.now();
  }

  function crozzoNoteCloudReadOk() {
    __cloudReadOkAt = Date.now();
  }

  /** Escritura + lectura recientes (no basta socket SUBSCRIBED). */
  function crozzoCloudDataPathRecent(maxMs) {
    maxMs = maxMs == null ? DATA_OK_MS : Number(maxMs) || DATA_OK_MS;
    var now = Date.now();
    if (!__cloudWriteOkAt || now - __cloudWriteOkAt > maxMs) return false;
    if (!__cloudReadOkAt || now - __cloudReadOkAt > maxMs) return false;
    return true;
  }

  function crozzoDeferLocalSync() {
    if (comandaOutboxNeedsLanBackup()) return false;
    /* Z0 operativo: no diferir LAN (tablet/caja/cocina necesitan canal local paralelo). */
    try {
      if (typeof global.crozzoZ0HybridParallelLan === 'function' && global.crozzoZ0HybridParallelLan()) {
        return false;
      }
    } catch (_) {}
    try {
      if (typeof global.crozzoRuntimeSyncHybrid === 'function' && global.crozzoRuntimeSyncHybrid()) {
        if (typeof global.crozzoCloudOperationalRealtimeHealthy === 'function') {
          if (!global.crozzoCloudOperationalRealtimeHealthy(14000)) return false;
        }
      }
    } catch (_) {}
    if (!crozzoCloudDataPathRecent(DATA_OK_MS)) return false;
    return crozzoCloudQualityReliable(28000);
  }

  function mdCfg() {
    return safe(function () {
      return typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
    }) || {};
  }

  /** Mantener WS LAN conectado en Z0 aunque la nube sea primaria (respaldo instantáneo). */
  function crozzoLanWsStandbyActive() {
    try {
      if (typeof global.crozzoLocalSyncPathReady !== 'function' || !global.crozzoLocalSyncPathReady()) return false;
    } catch (_) {
      return false;
    }
    var md = mdCfg();
    if (md.allowLan === false) return false;
    if (md.role === 'A') return false;
    if (!String(md.centralIp || '').trim()) return false;
    try {
      if (typeof global.crozzoOperationalRealtimeActive === 'function' && !global.crozzoOperationalRealtimeActive()) {
        return false;
      }
    } catch (_) {}
    return true;
  }

  /** POST/LAN de respaldo cuando nube primaria pero segmento local activo. */
  function crozzoLanTransportStandbyAllowed() {
    if (!crozzoLanWsStandbyActive()) return false;
    if (cloudUnderPressure() || wanDownFlagged()) return true;
    if (!crozzoDeferLocalSync()) return true;
    return true;
  }

  global.crozzoCloudWanReady = crozzoCloudWanReady;
  global.crozzoDeferLocalSync = crozzoDeferLocalSync;
  global.crozzoCloudQualityReliable = crozzoCloudQualityReliable;
  global.crozzoNoteCloudWriteOk = crozzoNoteCloudWriteOk;
  global.crozzoNoteCloudReadOk = crozzoNoteCloudReadOk;
  global.crozzoCloudDataPathRecent = crozzoCloudDataPathRecent;
  global.crozzoLanWsStandbyActive = crozzoLanWsStandbyActive;
  global.crozzoLanTransportStandbyAllowed = crozzoLanTransportStandbyAllowed;

  global.CrozzoConnectivityStandby = {
    cloudQualityReliable: crozzoCloudQualityReliable,
    lanWsStandbyActive: crozzoLanWsStandbyActive,
    lanTransportStandbyAllowed: crozzoLanTransportStandbyAllowed,
  };
})(typeof window !== 'undefined' ? window : globalThis);
