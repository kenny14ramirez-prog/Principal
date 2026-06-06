/**
 * Crozzo POS — UX tablet / APK Android (mesero, rol B, touch shell).
 */
(function (global) {
  'use strict';

  function isAndroidApk() {
    try {
      if (global.CrozzoDeviceForm && typeof global.CrozzoDeviceForm.isAndroidApk === 'function') {
        return global.CrozzoDeviceForm.isAndroidApk();
      }
    } catch (_) {}
    try {
      var ua = String((global.navigator && global.navigator.userAgent) || '');
      return !!(global.__TAURI__ || global.__CROZZO_IS_TAURI__) && /Android/i.test(ua);
    } catch (_) {
      return false;
    }
  }

  function isTouchTabletShell() {
    try {
      var doc = document.documentElement;
      return doc && (doc.classList.contains('crozzo-form-tablet') || doc.classList.contains('crozzo-touch-shell'));
    } catch (_) {
      return false;
    }
  }

  function deviceRoleB() {
    try {
      if (typeof global.crozzoDeviceConexionRoleB === 'function') return global.crozzoDeviceConexionRoleB();
      if (typeof global.config !== 'undefined' && global.config.get) {
        return (global.config.get('conexionSistemas') || {}).role === 'B';
      }
    } catch (_) {}
    return false;
  }

  function isFieldTabletDevice() {
    return isAndroidApk() || deviceRoleB() || isTouchTabletShell();
  }

  function applyDocumentFlags() {
    var doc = document.documentElement;
    if (!doc) return;
    var apk = isAndroidApk();
    doc.classList.toggle('crozzo-android-apk', apk);
    doc.classList.toggle('crozzo-field-tablet', isFieldTabletDevice());
    if (apk) doc.classList.add('crozzo-perf-lite', 'crozzo-apk-perf');
  }

  function applyLoginTabletUx() {
    var apk = isAndroidApk();
    var touch = isTouchTabletShell();
    var pairBtn = document.getElementById('btnPairDevice');
    var dlBtn = document.getElementById('btnDownloadApk');
    var kioskBtn = document.getElementById('btnKioskCocinaBar');
    if (pairBtn && (apk || touch)) {
      pairBtn.textContent = apk ? '📡 Conectar con la caja (escanear QR)' : '📱 Emparejar tablet con el sistema';
    }
    if (dlBtn) {
      if (apk) {
        dlBtn.textContent = '⬆ Actualizar app automáticamente';
        dlBtn.classList.add('login-action-secondary');
      } else {
        dlBtn.textContent = '📱 QR — Descargar app actualizada';
        dlBtn.classList.remove('login-action-secondary');
      }
    }
    if (kioskBtn && apk) {
      kioskBtn.style.display = '';
    }
  }

  function applyBottomNavTabletDefaults() {
    if (typeof global.crozzoApplyMobileBottomNavAccess === 'function') {
      global.crozzoApplyMobileBottomNavAccess();
    }
  }

  function refresh() {
    applyDocumentFlags();
    applyLoginTabletUx();
    applyBottomNavTabletDefaults();
  }

  global.CrozzoTabletShell = {
    isAndroidApk: isAndroidApk,
    isFieldTabletDevice: isFieldTabletDevice,
    refresh: refresh,
  };
  global.crozzoTabletShellRefresh = refresh;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refresh);
  } else {
    refresh();
  }
  global.addEventListener('crozzo-form-factor', refresh);
})(typeof window !== 'undefined' ? window : globalThis);
