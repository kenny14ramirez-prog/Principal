/**
 * Crozzo POS — Android APK: clases, haptics y fixes mínimos (sin pisar el CSS).
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
      var doc = document.documentElement;
      return (
        doc.classList.contains('crozzo-android-apk') ||
        doc.classList.contains('crozzo-android-native') ||
        doc.getAttribute('data-crozzo-android') === '1'
      );
    } catch (_) {
      return false;
    }
  }

  function hideBottomNav() {
    var nav = document.getElementById('crozzoMobileBottomNav');
    if (!nav) return;
    nav.style.setProperty('display', 'none', 'important');
    nav.style.setProperty('height', '0', 'important');
    nav.setAttribute('aria-hidden', 'true');
    nav.setAttribute('hidden', '');
  }

  function fixDrawerStack() {
    var sb = document.getElementById('sidebar');
    if (sb && sb.classList.contains('open')) {
      sb.style.setProperty('z-index', '1250', 'important');
    } else if (sb) {
      sb.style.removeProperty('z-index');
    }
    try {
      if (typeof global.crozzoSyncSidebarBackdrop === 'function') global.crozzoSyncSidebarBackdrop();
    } catch (_) {}
  }

  /** Solo lo esencial: sin inline styles que oculten texto o recuadros. */
  function applyLayoutPolish() {
    if (!isAndroidApk()) return;
    hideBottomNav();
    fixDrawerStack();
    try {
      if (global.CrozzoViewportFit && typeof global.CrozzoViewportFit.schedule === 'function') {
        global.CrozzoViewportFit.schedule();
      }
    } catch (_) {}
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
      doc.setAttribute('data-crozzo-android', '1');
    }
    try {
      if (typeof global.crozzoDevicePerfApply === 'function') global.crozzoDevicePerfApply();
    } catch (_) {}
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
        var t =
          e.target && e.target.closest
            ? e.target.closest('.btn, .nav-item, .product-card, .mesa-card, .mobile-menu-btn')
            : null;
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
    applyLayoutPolish();
  }

  function requestBluetoothEnable() {
    if (global.CrozzoBleMesh && typeof global.CrozzoBleMesh.requestBluetoothEnable === 'function') {
      return global.CrozzoBleMesh.requestBluetoothEnable();
    }
    return Promise.resolve({ ok: false, note: 'Malla BLE no cargada' });
  }

  function openWifiSettings() {
    try {
      if (/Android/i.test(String(global.navigator && global.navigator.userAgent ? global.navigator.userAgent : ''))) {
        global.window.location.href =
          'intent:#Intent;action=android.settings.WIFI_SETTINGS;end';
        return true;
      }
    } catch (_) {}
    return false;
  }

  global.CrozzoAndroidNative = {
    isAndroidApk: isAndroidApk,
    applyLayoutPolish: applyLayoutPolish,
    haptic: haptic,
    hapticLight: hapticLight,
    hapticOpen: hapticOpen,
    requestBluetoothEnable: requestBluetoothEnable,
    openWifiSettings: openWifiSettings,
    refresh: boot,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  global.addEventListener('crozzo-form-factor', applyLayoutPolish);
  global.addEventListener('crozzo-ready', function () {
    setTimeout(applyLayoutPolish, 100);
  });
})(typeof window !== 'undefined' ? window : globalThis);
