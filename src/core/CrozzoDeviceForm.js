/**
 * Crozzo POS — factor de forma (móvil / tablet / escritorio) en web y Tauri.
 * Tauri ya no fuerza modo escritorio en teléfonos: la UI sigue el ancho real.
 */
(function (global) {
  'use strict';

  var BREAK_MOBILE = 480;
  var BREAK_TABLET = 1024;
  var BREAK_PHONE_LG = 768;
  var BREAK_PHONE_SM = 360;

  var TOUCH_TOKENS = {
    'phone-sm': { scale: 1, gap: 8, pad: 10, navH: 54, sidebarVw: 90, btn: 44, font: 14, icon: 1.28, posCols: 2, sidebarPx: 280 },
    phone: { scale: 1, gap: 10, pad: 12, navH: 56, sidebarVw: 88, btn: 44, font: 14, icon: 1.35, posCols: 2, sidebarPx: 300 },
    'phone-lg': { scale: 1.03, gap: 12, pad: 14, navH: 58, sidebarVw: 82, btn: 46, font: 15, icon: 1.45, posCols: 3, sidebarPx: 320 },
    tablet: { scale: 1.06, gap: 14, pad: 18, navH: 62, sidebarVw: 68, btn: 48, font: 15, icon: 1.55, posCols: 4, sidebarPx: 300 },
  };

  function isCoarseTouchShell() {
    try {
      return global.matchMedia('(pointer: coarse)').matches && global.matchMedia('(hover: none)').matches;
    } catch (_) {
      return false;
    }
  }

  function readWidth() {
    try {
      var values = [];
      if (global.visualViewport && global.visualViewport.width > 0) {
        values.push(Math.round(global.visualViewport.width));
      }
      var docEl = document.documentElement;
      if (docEl && docEl.clientWidth > 0) values.push(Math.round(docEl.clientWidth));
      if (global.innerWidth > 0) values.push(Math.round(global.innerWidth));
      var w = values.length ? Math.min.apply(null, values) : 0;
      if (global.screen && global.devicePixelRatio > 1 && global.screen.width) {
        var cssW = Math.round(global.screen.width / global.devicePixelRatio);
        if (cssW > 0) {
          if (!w || w > cssW * 1.2) w = cssW;
        }
      }
      return w > 0 ? w : BREAK_TABLET;
    } catch (_) {
      return BREAK_TABLET;
    }
  }

  function detectTouchTier(w, factor) {
    if (factor === 'desktop') return '';
    if (w <= BREAK_PHONE_SM) return 'phone-sm';
    if (w <= BREAK_MOBILE) return 'phone';
    if (w <= BREAK_PHONE_LG) return 'phone-lg';
    return 'tablet';
  }

  function applyTouchShellTokens(doc, factor, w) {
    var touch = factor === 'mobile' || factor === 'tablet';
    doc.classList.toggle('crozzo-touch-shell', touch);
    var tier = touch ? detectTouchTier(w, factor) : '';
    if (tier) doc.setAttribute('data-crozzo-touch-tier', tier);
    else doc.removeAttribute('data-crozzo-touch-tier');

    var keys = [
      '--crozzo-touch-scale',
      '--crozzo-touch-gap',
      '--crozzo-touch-pad',
      '--crozzo-touch-nav-h',
      '--crozzo-touch-btn-min',
      '--crozzo-touch-font',
      '--crozzo-touch-icon',
      '--crozzo-touch-pos-cols',
      '--crozzo-touch-sidebar-max',
    ];
    if (!touch) {
      keys.forEach(function (k) {
        doc.style.removeProperty(k);
      });
      return tier;
    }
    var t = TOUCH_TOKENS[tier] || TOUCH_TOKENS.phone;
    doc.style.setProperty('--crozzo-touch-scale', String(t.scale));
    doc.style.setProperty('--crozzo-touch-gap', t.gap + 'px');
    doc.style.setProperty('--crozzo-touch-pad', t.pad + 'px');
    doc.style.setProperty('--crozzo-touch-nav-h', t.navH + 'px');
    doc.style.setProperty('--crozzo-touch-btn-min', t.btn + 'px');
    doc.style.setProperty('--crozzo-touch-font', t.font + 'px');
    doc.style.setProperty('--crozzo-touch-icon', t.icon + 'rem');
    doc.style.setProperty('--crozzo-touch-pos-cols', String(t.posCols));
    doc.style.setProperty(
      '--crozzo-touch-sidebar-max',
      'min(' + t.sidebarPx + 'px, ' + t.sidebarVw + 'vw)'
    );
    return tier;
  }

  function markFormResizeTransition(doc) {
    doc.classList.add('crozzo-form-resizing');
    clearTimeout(global.__CROZZO_FORM_RESIZE_T__);
    global.__CROZZO_FORM_RESIZE_T__ = setTimeout(function () {
      doc.classList.remove('crozzo-form-resizing');
    }, 380);
  }

  function detectFormFactor() {
    var w = readWidth();
    if (w <= BREAK_MOBILE) return 'mobile';
    if (w <= BREAK_TABLET) return 'tablet';
    if (isCoarseTouchShell()) return 'tablet';
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
    var w = readWidth();
    var factor = detectFormFactor();
    var tauri = isTauriShell();
    var prev = global.__CROZZO_FORM_FACTOR__;
    var prevTier = global.__CROZZO_TOUCH_TIER__;

    global.__CROZZO_IS_TAURI__ = tauri;
    global.__CROZZO_FORM_FACTOR__ = factor;
    global.__CROZZO_IS_TAURI_DESKTOP__ = tauri && factor === 'desktop';

    if (!doc) return factor;

    doc.classList.remove('crozzo-form-mobile', 'crozzo-form-tablet', 'crozzo-form-desktop');
    doc.classList.add('crozzo-form-' + factor);
    doc.classList.toggle('tauri-shell', tauri);
    doc.classList.toggle('tauri-desktop', tauri && factor === 'desktop');

    var tier = applyTouchShellTokens(doc, factor, w);
    global.__CROZZO_TOUCH_TIER__ = tier;

    if (body) {
      body.classList.remove('mobile', 'tablet', 'desktop', 'tauri-desktop', 'tauri-shell', 'crozzo-touch-shell');
      body.classList.add(factor);
      body.classList.toggle('tauri-shell', tauri);
      body.classList.toggle('crozzo-touch-shell', factor === 'mobile' || factor === 'tablet');
      if (tauri && factor === 'desktop') body.classList.add('tauri-desktop');
      if (factor === 'desktop' && prev && prev !== 'desktop') closeSidebarDrawerIfOpen();
    }

    if ((prev && prev !== factor) || (prevTier && prevTier !== tier)) {
      markFormResizeTransition(doc);
      try {
        if (typeof global.initMobileUX === 'function') global.initMobileUX();
      } catch (_) {}
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
  global.crozzoDetectTouchTier = function () {
    return detectTouchTier(readWidth(), detectFormFactor());
  };
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
