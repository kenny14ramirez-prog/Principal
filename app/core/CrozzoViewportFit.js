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
      if (global.__TAURI__ || global.__TAURI_INTERNALS__) {
        return (global.innerWidth || 0) >= 1024;
      }
    } catch (_) {}
    return false;
  }

  function measureBottomInset() {
    var bottom = 0;
    try {
      if (isBottomNavVisible()) bottom += navHeight();
    } catch (_) {}
    /* Tauri escritorio: innerHeight ya es el área útil; no restar barra de tareas otra vez */
    if (isTauriDesktopShell() && !isBottomNavVisible()) {
      return 0;
    }
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
    return nav ? Math.ceil(nav.getBoundingClientRect().height) || 56 : 56;
  }

  function measureHeaderH() {
    var h =
      document.querySelector('.main-header.crozzo-header-elite') ||
      document.querySelector('.main-header');
    if (h) return Math.max(48, Math.ceil(h.getBoundingClientRect().height));
    return 60;
  }

  function readViewportSize() {
    var ih = Math.round(global.innerHeight || 0);
    var iw = Math.round(global.innerWidth || 0);
    try {
      if (global.visualViewport) {
        ih = Math.max(ih, Math.round(global.visualViewport.height || 0));
        iw = Math.max(iw, Math.round(global.visualViewport.width || 0));
      }
    } catch (_) {}
    if (ih < 400 && global.screen && global.screen.availHeight) {
      ih = Math.round(global.screen.availHeight);
    }
    if (iw < 400 && global.screen && global.screen.availWidth) {
      iw = Math.round(global.screen.availWidth);
    }
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
    if (global.visualViewport) {
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
