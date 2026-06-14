/**
 * Crozzo POS — Pulido nativo Android (APK Tauri).
 * Feedback táctil, clases de shell, layout APK y gestos.
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

  function isApkLayoutShell() {
    if (!/Android/i.test(String((global.navigator && global.navigator.userAgent) || ''))) return false;
    try {
      var doc = document.documentElement;
      return (
        isAndroidApk() ||
        doc.classList.contains('crozzo-compact-chrome') ||
        doc.classList.contains('crozzo-touch-shell')
      );
    } catch (_) {
      return false;
    }
  }

  function isOperativaPage() {
    try {
      var body = document.body;
      if (!body) return false;
      return (
        body.classList.contains('crozzo-page-operativa') ||
        body.classList.contains('crozzo-page-rest-pos') ||
        body.classList.contains('crozzo-page-venta-comercial') ||
        body.classList.contains('crozzo-unified-chrome--fullscreen')
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
    nav.style.setProperty('min-height', '0', 'important');
    nav.setAttribute('aria-hidden', 'true');
    nav.setAttribute('hidden', '');
  }

  function polishHeader() {
    var hdr = document.querySelector('.main-header');
    if (!hdr) return;
    hdr.style.setProperty('display', 'flex', 'important');
    hdr.style.setProperty('flex-direction', 'row', 'important');
    hdr.style.setProperty('flex-wrap', 'nowrap', 'important');
    hdr.style.setProperty('align-items', 'center', 'important');
    hdr.style.setProperty('flex-shrink', '0', 'important');
    hdr.style.setProperty('min-height', '0', 'important');
    hdr.style.setProperty('max-height', '52px', 'important');
    hdr.style.setProperty('padding-top', 'max(4px, env(safe-area-inset-top, 0px))', 'important');
    hdr.style.setProperty('padding-bottom', '4px', 'important');
    hdr.style.setProperty('padding-left', '8px', 'important');
    hdr.style.setProperty('padding-right', '8px', 'important');
    hdr.style.setProperty('overflow', 'hidden', 'important');
    hdr.style.setProperty('gap', '6px', 'important');

    var primary = hdr.querySelector('.crozzo-header__primary');
    if (primary) {
      primary.style.setProperty('flex', '1 1 auto', 'important');
      primary.style.setProperty('min-width', '0', 'important');
      primary.style.setProperty('overflow', 'hidden', 'important');
    }
    var cluster = hdr.querySelector('.crozzo-header__cluster');
    if (cluster) {
      cluster.style.setProperty('flex', '0 1 auto', 'important');
      cluster.style.setProperty('min-width', '0', 'important');
      cluster.style.setProperty('max-width', '46vw', 'important');
      cluster.style.setProperty('overflow', 'hidden', 'important');
    }
    var title = hdr.querySelector('.page-title');
    if (title) {
      title.style.setProperty('min-width', '0', 'important');
      title.style.setProperty('overflow', 'hidden', 'important');
      title.style.setProperty('text-overflow', 'ellipsis', 'important');
      title.style.setProperty('white-space', 'nowrap', 'important');
    }
    hdr.querySelectorAll('.page-subtitle, .crozzo-header-greeting, .crozzo-header-psyche-line').forEach(function (el) {
      el.style.setProperty('display', 'none', 'important');
    });
  }

  function polishMainShell(content) {
    var main = document.querySelector('.main-content');
    var mc = content || document.getElementById('mainContent');
    var operativa = isOperativaPage();

    if (main) {
      main.style.setProperty('display', 'flex', 'important');
      main.style.setProperty('flex-direction', 'column', 'important');
      main.style.setProperty('flex', '1 1 auto', 'important');
      main.style.setProperty('min-height', '0', 'important');
      main.style.setProperty('padding-bottom', '0', 'important');
      main.style.setProperty('overflow', 'hidden', 'important');
    }

    if (mc) {
      mc.style.setProperty('flex', '1 1 auto', 'important');
      mc.style.setProperty('min-height', '0', 'important');
      mc.style.setProperty('display', operativa ? 'flex' : 'block', 'important');
      if (operativa) mc.style.setProperty('flex-direction', 'column', 'important');
      mc.style.setProperty('overflow-x', 'hidden', 'important');
      mc.style.setProperty('overflow-y', operativa ? 'hidden' : 'auto', 'important');
      mc.style.setProperty('-webkit-overflow-scrolling', 'touch', 'important');
      if (operativa) {
        mc.style.setProperty('padding', '0', 'important');
      } else {
        mc.style.setProperty('padding', '8px 10px', 'important');
        mc.style.setProperty(
          'padding-bottom',
          'max(8px, env(safe-area-inset-bottom, 0px))',
          'important'
        );
      }
    }
  }

  function polishSidebarStack() {
    var sb = document.getElementById('sidebar');
    if (sb && sb.classList.contains('open')) {
      sb.style.setProperty('z-index', '1250', 'important');
      sb.style.setProperty('top', '0', 'important');
    }
    var bd = document.getElementById('sidebarBackdrop');
    if (bd && bd.classList.contains('active')) {
      bd.style.setProperty('z-index', '1190', 'important');
    }
  }

  function applyLayoutPolish(content) {
    if (!isApkLayoutShell()) return;
    hideBottomNav();
    polishHeader();
    polishMainShell(content);
    polishSidebarStack();
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
      doc.classList.remove('crozzo-perf-lite');
      doc.setAttribute('data-crozzo-android', '1');
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
        var t =
          e.target && e.target.closest
            ? e.target.closest('.btn, .nav-item, .product-card, .mesa-card, .crozzo-mbn-btn, .mobile-menu-btn')
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
    [80, 250, 600].forEach(function (ms) {
      global.setTimeout(function () {
        applyLayoutPolish();
      }, ms);
    });
  }

  global.CrozzoAndroidNative = {
    isAndroidApk: isAndroidApk,
    isApkLayoutShell: isApkLayoutShell,
    applyLayoutPolish: applyLayoutPolish,
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
  global.addEventListener('crozzo-form-factor', function () {
    applyLayoutPolish();
  });
  global.addEventListener('crozzo-ready', function () {
    setTimeout(function () {
      applyLayoutPolish();
    }, 100);
  });
})();
