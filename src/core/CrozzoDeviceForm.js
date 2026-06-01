/**
 * Crozzo POS — factor de forma (móvil / tablet / escritorio) en web y Tauri.
 * Tauri ya no fuerza modo escritorio en teléfonos: la UI sigue el ancho real.
 */
(function (global) {
  'use strict';

  var BREAK_MOBILE = 480;
  var BREAK_TABLET = 1024;

  function readWidth() {
    try {
      var w = global.innerWidth || document.documentElement.clientWidth || 0;
      if (global.visualViewport && global.visualViewport.width) {
        w = Math.min(w, global.visualViewport.width);
      }
      return w;
    } catch (_) {
      return BREAK_TABLET;
    }
  }

  function detectFormFactor() {
    var w = readWidth();
    if (w <= BREAK_MOBILE) return 'mobile';
    if (w <= BREAK_TABLET) return 'tablet';
    return 'desktop';
  }

  function isTauriShell() {
    return !!(global.__TAURI__ || global.__CROZZO_IS_TAURI__);
  }

  function isTauriDesktopShell() {
    return isTauriShell() && detectFormFactor() === 'desktop';
  }

  function closeSidebarDrawerIfOpen() {
    try {
      var s = document.getElementById('sidebar');
      var bd = document.getElementById('sidebarBackdrop');
      if (s) s.classList.remove('open');
      if (bd) {
        bd.classList.remove('active');
        bd.setAttribute('aria-hidden', 'true');
      }
      if (typeof global.crozzoSyncSidebarBackdrop === 'function') global.crozzoSyncSidebarBackdrop();
    } catch (_) {}
  }

  function applyFormFactorClasses() {
    var doc = document.documentElement;
    var body = document.body;
    var factor = detectFormFactor();
    var tauri = isTauriShell();
    var prev = global.__CROZZO_FORM_FACTOR__;

    global.__CROZZO_IS_TAURI__ = tauri;
    global.__CROZZO_FORM_FACTOR__ = factor;
    global.__CROZZO_IS_TAURI_DESKTOP__ = tauri && factor === 'desktop';

    if (!doc) return factor;

    doc.classList.remove('crozzo-form-mobile', 'crozzo-form-tablet', 'crozzo-form-desktop');
    doc.classList.add('crozzo-form-' + factor);
    doc.classList.toggle('tauri-shell', tauri);
    doc.classList.toggle('tauri-desktop', tauri && factor === 'desktop');

    if (body) {
      body.classList.remove('mobile', 'tablet', 'desktop', 'tauri-desktop', 'tauri-shell');
      body.classList.add(factor);
      body.classList.toggle('tauri-shell', tauri);
      if (tauri && factor === 'desktop') body.classList.add('tauri-desktop');
      if (factor === 'desktop' && prev && prev !== 'desktop') closeSidebarDrawerIfOpen();
    }

    return factor;
  }

  function scheduleApply() {
    applyFormFactorClasses();
    try {
      if (global.CrozzoViewportFit && typeof global.CrozzoViewportFit.schedule === 'function') {
        global.CrozzoViewportFit.schedule();
      }
    } catch (_) {}
    try {
      if (typeof global.applyAccessControl === 'function') global.applyAccessControl();
    } catch (_) {}
    try {
      if (typeof global.crozzoApplyMobileBottomNavAccess === 'function') global.crozzoApplyMobileBottomNavAccess();
    } catch (_) {}
    try {
      if (
        typeof global.getCurrentUser === 'function' &&
        global.getCurrentUser() &&
        typeof global.currentPage !== 'undefined' &&
        typeof global.currentUserCanSeePage === 'function' &&
        typeof global.navigateTo === 'function' &&
        typeof global.pickFirstAccessiblePage === 'function'
      ) {
        var blocked = !global.currentUserCanSeePage(global.currentPage);
        try {
          if (!blocked && typeof global.pageBlockedByOperacionModo === 'function') {
            blocked = global.pageBlockedByOperacionModo(global.currentPage);
          }
        } catch (_) {}
        if (blocked) {
          var fb = global.pickFirstAccessiblePage();
          if (fb && fb !== global.currentPage) global.navigateTo(fb);
        }
      }
    } catch (_) {}
  }

  function bindResize() {
    var timer;
    global.addEventListener('resize', function () {
      clearTimeout(timer);
      timer = setTimeout(scheduleApply, 80);
    });
    global.addEventListener('orientationchange', function () {
      setTimeout(scheduleApply, 280);
    });
    if (global.visualViewport) {
      global.visualViewport.addEventListener('resize', function () {
        clearTimeout(timer);
        timer = setTimeout(scheduleApply, 80);
      });
    }
  }

  function init() {
    global.__CROZZO_IS_TAURI__ = !!(global.__TAURI__);
    applyFormFactorClasses();
    bindResize();
  }

  global.crozzoDetectFormFactor = detectFormFactor;
  global.crozzoIsTauriShell = isTauriShell;
  global.crozzoIsTauriDesktopShell = isTauriDesktopShell;
  global.crozzoApplyFormFactorClasses = applyFormFactorClasses;
  global.crozzoScheduleFormFactor = scheduleApply;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
