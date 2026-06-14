/**
 * Crozzo POS — Pulido nativo Android (APK Tauri).
 * Feedback táctil, clases de shell y gestos que no deben sentirse “web adaptado”.
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
      return document.documentElement.classList.contains('crozzo-android-apk');
    } catch (_) {
      return false;
    }
  }

  function haptic(ms) {
    if (!isAndroidApk()) return;
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(ms || 24);
      }
    } catch (_) {}
  }

  function hapticLight() {
    haptic(22);
  }

  function hapticOpen() {
    haptic(36);
  }

  function applyShellClasses() {
    var doc = document.documentElement;
    if (!doc) return;
    var apk = isAndroidApk();
    doc.classList.toggle('crozzo-android-native', apk);
    if (apk) {
      doc.classList.add('crozzo-apk-perf');
      doc.classList.remove('crozzo-perf-lite');
    }
    try {
      if (typeof global.crozzoApplyFormFactorClasses === 'function') {
        global.crozzoApplyFormFactorClasses();
      }
    } catch (_) {}
  }

  function patchHaptics() {
    if (!isAndroidApk() || global.__crozzoAndroidNativeHaptics) return;
    global.__crozzoAndroidNativeHaptics = true;

    if (typeof global.crozzoPosHapticLight === 'function') {
      var orig = global.crozzoPosHapticLight;
      global.crozzoPosHapticLight = function () {
        hapticLight();
        return orig.apply(global, arguments);
      };
    } else {
      global.crozzoPosHapticLight = hapticLight;
    }

    var openDrawer = global.crozzoOpenSidebarDrawer;
    if (typeof openDrawer === 'function') {
      global.crozzoOpenSidebarDrawer = function () {
        hapticOpen();
        return openDrawer.apply(global, arguments);
      };
    }

    var toggle = global.toggleSidebar;
    if (typeof toggle === 'function') {
      global.toggleSidebar = function () {
        hapticLight();
        return toggle.apply(global, arguments);
      };
    }
  }

  function bindTapRipple() {
    if (!isAndroidApk() || document._crozzoNativeTapBound) return;
    document._crozzoNativeTapBound = true;
    document.addEventListener(
      'touchend',
      function (e) {
        var t = e.target && e.target.closest ? e.target.closest('.btn, .nav-item, .product-card, .mesa-card, .crozzo-mbn-btn, .mobile-menu-btn') : null;
        if (!t || t.disabled) return;
        t.classList.add('crozzo-native-tap');
        global.setTimeout(function () {
          t.classList.remove('crozzo-native-tap');
        }, 180);
      },
      { passive: true }
    );
  }

  function boot() {
    applyShellClasses();
    patchHaptics();
    bindTapRipple();
    try {
      if (global.CrozzoViewportFit && typeof global.CrozzoViewportFit.schedule === 'function') {
        global.CrozzoViewportFit.schedule();
      }
    } catch (_) {}
  }

  global.CrozzoAndroidNative = {
    isAndroidApk: isAndroidApk,
    haptic: haptic,
    hapticLight: hapticLight,
    hapticOpen: hapticOpen,
    refresh: boot,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  global.addEventListener('crozzo-form-factor', boot);
})();
