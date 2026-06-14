/**
 * Crozzo POS — Ajuste de viewport: altura real (barra de tareas Windows), sin desbordes.
 */
(function (global) {
  'use strict';

  var raf = 0;
  var headerRo = null;
  var bootRetries = 0;
  var MAX_BOOT_RETRIES = 24;

  function isBottomNavVisible() {
    var nav = document.getElementById('crozzoMobileBottomNav');
    if (!nav) return false;
    try {
      return global.getComputedStyle(nav).display !== 'none';
    } catch (_) {
      return false;
    }
  }

  function isTauriDesktopShell() {
    var doc = document.documentElement;
    try {
      if (doc.classList.contains('tauri-shell') && doc.classList.contains('crozzo-form-desktop')) {
        return true;
      }
      if (typeof global.crozzoIsTauriDesktopShell === 'function') {
        return global.crozzoIsTauriDesktopShell();
      }
    } catch (_) {}
    return false;
  }

  function isTouchNavShell() {
    try {
      return document.documentElement.classList.contains('crozzo-touch-shell');
    } catch (_) {
      return false;
    }
  }

  function isAndroidUa() {
    try {
      return /Android/i.test(String((global.navigator && global.navigator.userAgent) || ''));
    } catch (_) {
      return false;
    }
  }

  function isAndroidApkShell() {
    try {
      var doc = document.documentElement;
      if (doc.getAttribute('data-crozzo-android') === '1') return true;
      return (
        doc.classList.contains('crozzo-android-apk') ||
        doc.classList.contains('crozzo-android-native')
      );
    } catch (_) {
      return false;
    }
  }

  function isTauriShell() {
    try {
      if (document.documentElement.classList.contains('tauri-shell')) return true;
      if (global.__TAURI__ || global.__TAURI_INTERNALS__) return true;
      if (global.__CROZZO_IS_TAURI__) return true;
    } catch (_) {}
    return false;
  }

  function useTauriFillLayout() {
    if (isTauriShell() || isAndroidApkShell() || isCompactChromeShell()) return true;
    try {
      if (global.__CROZZO_IS_TAURI__ || global.__TAURI__ || global.__TAURI_INTERNALS__) return true;
      if (isAndroidUa() && global.__CROZZO_IS_TAURI__) return true;
    } catch (_) {}
    return false;
  }

  function isCompactChromeShell() {
    try {
      var doc = document.documentElement;
      return (
        doc.classList.contains('crozzo-compact-chrome') ||
        doc.classList.contains('crozzo-android-apk') ||
        doc.classList.contains('crozzo-android-native')
      );
    } catch (_) {
      return false;
    }
  }

  function measureBottomInset() {
    if (isAndroidApkShell() || isTauriShell()) {
      return 0;
    }
    var bottom = 0;
    try {
      if (!isTouchNavShell() && isBottomNavVisible()) bottom += navHeight();
    } catch (_) {}
    try {
      if (global.visualViewport) {
        var vv = global.visualViewport;
        var gap = global.innerHeight - vv.height - (vv.offsetTop || 0);
        if (gap > 4) bottom = Math.max(bottom, Math.round(gap));
      }
    } catch (_) {}
    try {
      var sh = global.screen.height;
      var sah = global.screen.availHeight;
      var taskbar = Math.max(0, sh - sah);
      if (taskbar > 0 && taskbar < 160) {
        var winBottom = (global.screenY || 0) + (global.outerHeight || 0);
        if (winBottom >= sah - 8) bottom = Math.max(bottom, taskbar);
      }
    } catch (_) {}
    return bottom;
  }

  function navHeight() {
    var nav = document.getElementById('crozzoMobileBottomNav');
    if (nav) {
      var h = Math.ceil(nav.getBoundingClientRect().height);
      if (h > 0) return h;
    }
    try {
      var doc = document.documentElement;
      var token = doc && global.getComputedStyle(doc).getPropertyValue('--crozzo-touch-nav-h').trim();
      if (token) return Math.ceil(parseFloat(token)) || 56;
    } catch (_) {}
    return 56;
  }

  function measureHeaderH() {
    if (isCompactChromeShell() || isAndroidUa()) {
      var safeTop = 0;
      try {
        safeTop = parseInt(
          global.getComputedStyle(document.documentElement).getPropertyValue('--crozzo-safe-top') || '0',
          10
        ) || 0;
      } catch (_) {}
      return Math.max(48, 44 + safeTop);
    }
    var h =
      document.querySelector('.main-header.crozzo-header-elite') ||
      document.querySelector('.main-header');
    if (h) return Math.max(48, Math.ceil(h.getBoundingClientRect().height));
    return 60;
  }

  function isLikelyDesktopViewport(iw) {
    if (isTauriDesktopShell()) return true;
    try {
      var doc = document.documentElement;
      if (doc && doc.classList.contains('crozzo-form-desktop')) return true;
      if (iw > 1024 && !global.matchMedia('(pointer: coarse) and (hover: none)').matches) {
        return true;
      }
    } catch (_) {}
    return false;
  }

  function readViewportSize() {
    var ih = Math.round(global.innerHeight || 0);
    var iw = Math.round(global.innerWidth || 0);
    if (isTauriShell() || isAndroidApkShell()) {
      return { ih: ih, iw: iw };
    }
    try {
      var docEl = document.documentElement;
      if (docEl) {
        if (docEl.clientWidth > 0) iw = iw > 0 ? Math.min(iw, Math.round(docEl.clientWidth)) : Math.round(docEl.clientWidth);
        if (docEl.clientHeight > 0) ih = ih > 0 ? Math.min(ih, Math.round(docEl.clientHeight)) : Math.round(docEl.clientHeight);
      }
    } catch (_) {}
    try {
      if (global.visualViewport && !isAndroidApkShell()) {
        var vvh = Math.round(global.visualViewport.height || 0);
        var vvw = Math.round(global.visualViewport.width || 0);
        if (vvh > 0) ih = ih > 0 ? Math.min(ih, vvh) : vvh;
        if (vvw > 0) iw = iw > 0 ? Math.min(iw, vvw) : vvw;
      }
    } catch (_) {}
    /* Solo recortar ancho en móvil/tablet (WebView inflado); en PC usar ventana real */
    try {
      if (
        !isLikelyDesktopViewport(iw) &&
        global.screen &&
        global.devicePixelRatio > 1 &&
        global.screen.width &&
        global.screen.height
      ) {
        var cssW = Math.round(global.screen.width / global.devicePixelRatio);
        var cssH = Math.round(global.screen.height / global.devicePixelRatio);
        if (cssW > 0 && iw > cssW * 1.2) iw = cssW;
        if (cssH > 0 && ih > cssH * 1.2) ih = cssH;
      }
    } catch (_) {}
    return { ih: ih, iw: iw };
  }

  function detectDisplayScale(doc) {
    var dpr = global.devicePixelRatio || 1;
    doc.style.setProperty('--crozzo-dpr', String(dpr));
    var sys = 1;
    try {
      if (global.screen && global.screen.width && global.screen.availWidth) {
        var r = global.screen.width / global.screen.availWidth;
        if (r >= 1 && r <= 3.5) sys = Math.round(r * 100) / 100;
      }
    } catch (_) {}
    doc.style.setProperty('--crozzo-system-scale', String(sys));
  }

  function apply() {
    var doc = document.documentElement;
    var body = document.body;
    if (!doc || !body) return false;

    var size = readViewportSize();
    var ih = size.ih;
    var iw = size.iw;
    if (ih < 400 || iw < 320) {
      if (bootRetries < MAX_BOOT_RETRIES) {
        bootRetries++;
        global.setTimeout(schedule, 120);
      }
      doc.classList.remove('crozzo-vp-ready');
      return false;
    }

    bootRetries = 0;
    var headerH = measureHeaderH();
    var bottom = measureBottomInset();
    var contentH = Math.max(200, ih - bottom);
    var tauriFill = useTauriFillLayout();

    if (tauriFill) {
      contentH = ih;
      bottom = 0;
      headerH = isCompactChromeShell() || isAndroidUa() ? 44 : headerH;
      /* Píxeles reales: en WebView Android los % encogen pantallas operativas */
      doc.style.setProperty('--crozzo-vh', ih + 'px');
      doc.style.setProperty('--crozzo-content-h', ih + 'px');
      doc.style.setProperty('--crozzo-touch-nav-h', '0px');
      doc.style.setProperty('--crozzo-bottom-safe', '0px');
      doc.style.setProperty('--crozzo-vw', iw + 'px');
      doc.style.setProperty('--crozzo-header-h', headerH + 'px');
      if (isAndroidUa()) {
        doc.setAttribute('data-crozzo-android', '1');
        doc.style.height = ih + 'px';
        doc.style.maxHeight = ih + 'px';
        body.style.height = ih + 'px';
        body.style.maxHeight = ih + 'px';
      }
      doc.classList.add('crozzo-vp-ready');
      doc.classList.toggle('crozzo-vp-tauri-fill', tauriFill);
      body.classList.remove('crozzo-vp-has-bottom');
      body.classList.remove('crozzo-vp-mobile-nav');
      detectDisplayScale(doc);
      return true;
    }

    doc.classList.remove('crozzo-vp-tauri-fill');
    doc.style.setProperty('--crozzo-vh', ih + 'px');
    doc.style.setProperty('--crozzo-vw', iw + 'px');
    doc.style.setProperty('--crozzo-content-h', contentH + 'px');
    doc.style.setProperty('--crozzo-header-h', headerH + 'px');
    doc.style.setProperty('--crozzo-bottom-safe', bottom + 'px');
    detectDisplayScale(doc);

    doc.classList.add('crozzo-vp-ready');
    body.classList.toggle('crozzo-vp-has-bottom', bottom > 0);
    body.classList.toggle('crozzo-vp-mobile-nav', isBottomNavVisible());
    return true;
  }

  function schedule() {
    if (raf) global.cancelAnimationFrame(raf);
    raf = global.requestAnimationFrame(function () {
      raf = 0;
      apply();
    });
  }

  function bindHeaderObserver() {
    var h = document.querySelector('.main-header');
    if (!h || headerRo || typeof ResizeObserver === 'undefined') return;
    headerRo = new ResizeObserver(schedule);
    headerRo.observe(h);
  }

  function bootSequence() {
    apply();
    [50, 150, 350, 700, 1200, 2000].forEach(function (ms) {
      global.setTimeout(schedule, ms);
    });
  }

  function init() {
    bootSequence();
    bindHeaderObserver();
    global.addEventListener('resize', schedule);
    global.addEventListener('orientationchange', function () {
      global.setTimeout(schedule, 250);
    });
    if (global.visualViewport && !isTauriShell()) {
      global.visualViewport.addEventListener('resize', schedule);
      global.visualViewport.addEventListener('scroll', schedule);
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        bootSequence();
        bindHeaderObserver();
      });
    }
    global.addEventListener('load', function () {
      bootSequence();
    });
    try {
      document.addEventListener('crozzo-ready', schedule);
      document.addEventListener('crozzo-auth-ready', schedule);
      document.addEventListener('crozzo-form-factor', schedule);
    } catch (_) {}
  }

  global.CrozzoViewportFit = {
    apply: apply,
    schedule: schedule,
    init: init,
    bootSequence: bootSequence,
  };
  init();
})(typeof window !== 'undefined' ? window : globalThis);
