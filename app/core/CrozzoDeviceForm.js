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
    'phone-sm': { scale: 1.04, gap: 10, pad: 13, navH: 60, sidebarVw: 90, btn: 48, font: 16, icon: 1.42, posCols: 2, sidebarPx: 300 },
    phone: { scale: 1.06, gap: 11, pad: 14, navH: 62, sidebarVw: 88, btn: 50, font: 16, icon: 1.48, posCols: 2, sidebarPx: 320 },
    'phone-lg': { scale: 1.1, gap: 13, pad: 16, navH: 66, sidebarVw: 84, btn: 52, font: 17, icon: 1.58, posCols: 3, sidebarPx: 340 },
    tablet: { scale: 1.12, gap: 15, pad: 18, navH: 68, sidebarVw: 78, btn: 54, font: 17, icon: 1.65, posCols: 4, sidebarPx: 360 },
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
      var coarseTouch = isCoarseTouchShell();
      if (!coarseTouch && w > BREAK_TABLET) {
        return w;
      }
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
    var androidApk = isAndroidTauriShell();
    doc.classList.toggle('crozzo-touch-shell', touch);
    var tier = touch ? detectTouchTier(w, factor) : '';
    if (androidApk && touch) {
      tier = detectTouchTier(w, factor);
    }
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
    var tauriTouch = touch && isTauriShell();
    if (androidApk || tauriTouch) {
      t = {
        scale: 1,
        gap: 8,
        pad: 10,
        navH: 0,
        btn: 44,
        font: 15,
        icon: 1.3,
        posCols: t.posCols,
        sidebarPx: 360,
        sidebarVw: androidApk ? 100 : t.sidebarVw,
      };
    }
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
      androidApk ? '100vw' : 'min(' + t.sidebarPx + 'px, ' + t.sidebarVw + 'vw)'
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

  function readHeight() {
    try {
      var values = [];
      if (global.visualViewport && global.visualViewport.height > 0) {
        values.push(Math.round(global.visualViewport.height));
      }
      var docEl = document.documentElement;
      if (docEl && docEl.clientHeight > 0) values.push(Math.round(docEl.clientHeight));
      if (global.innerHeight > 0) values.push(Math.round(global.innerHeight));
      return values.length ? Math.min.apply(null, values) : 0;
    } catch (_) {
      return 0;
    }
  }

  function isMobileDevPreview() {
    try {
      if (String(global.location && global.location.hash || '').toLowerCase().indexOf('mobile') >= 0) return true;
      if (global.localStorage && global.localStorage.getItem('crozzo_dev_mobile') === '1') return true;
    } catch (_) {}
    return false;
  }

  function detectFormFactor() {
    var w = readWidth();
    if (isTauriShell() && isMobileDevPreview()) return 'mobile';
    if (isTauriShell()) {
      if (w <= BREAK_MOBILE) return 'mobile';
      if (w <= BREAK_TABLET) return 'tablet';
      return 'desktop';
    }
    if (w <= BREAK_MOBILE) return 'mobile';
    if (w <= BREAK_TABLET) return 'tablet';
    if (isCoarseTouchShell()) return 'tablet';
    return 'desktop';
  }

  function isTauriShell() {
    try {
      var ua = String((global.navigator && global.navigator.userAgent) || '');
      if (/tauri/i.test(ua)) return true;
    } catch (_) {}
    return !!(global.__TAURI__ || global.__TAURI_INTERNALS__ || global.__CROZZO_IS_TAURI__);
  }

  function isAndroidTauriShell() {
    try {
      var ua = String((global.navigator && global.navigator.userAgent) || '');
      if (!/Android/i.test(ua)) return false;
      if (global.__TAURI__ || global.__TAURI_INTERNALS__) return true;
      if (global.__CROZZO_IS_TAURI__) return true;
      if (/tauri/i.test(ua)) return true;
      var href = String((global.location && global.location.href) || '');
      var host = String((global.location && global.location.hostname) || '');
      if (/tauri\.localhost|asset\.localhost|ipc\.localhost/i.test(href + host)) return true;
      /* APK empaquetada: WebView Android sin UA tauri explícito */
      if (/wv|WebView/i.test(ua) && !/Chrome\/[\d.]+ Mobile/i.test(ua)) return true;
    } catch (_) {}
    return false;
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

  function applyCompactChromeInline(compact) {
    try {
      var hdr = document.querySelector('.main-header');
      if (hdr) {
        if (compact) {
          hdr.style.setProperty('display', 'flex', 'important');
          hdr.style.setProperty('flex-direction', 'row', 'important');
          hdr.style.setProperty('flex-wrap', 'nowrap', 'important');
          hdr.style.setProperty('align-items', 'center', 'important');
          hdr.style.setProperty('height', '44px', 'important');
          hdr.style.setProperty('max-height', '52px', 'important');
          hdr.style.setProperty('padding', '4px 8px', 'important');
          hdr.style.setProperty('padding-top', 'max(4px, env(safe-area-inset-top, 0px))', 'important');
          hdr.style.setProperty('overflow', 'hidden', 'important');
        } else {
          hdr.style.removeProperty('display');
          hdr.style.removeProperty('flex-direction');
          hdr.style.removeProperty('flex-wrap');
          hdr.style.removeProperty('align-items');
          hdr.style.removeProperty('height');
          hdr.style.removeProperty('max-height');
          hdr.style.removeProperty('padding');
          hdr.style.removeProperty('overflow');
        }
      }
      var main = document.querySelector('.main-content');
      if (main) {
        if (compact) main.style.setProperty('padding-bottom', '0', 'important');
        else main.style.removeProperty('padding-bottom');
      }
      var bodyEl = document.getElementById('mainContent') || document.querySelector('.main-body');
      if (bodyEl) {
        if (compact) bodyEl.style.setProperty('padding-bottom', '0', 'important');
        else bodyEl.style.removeProperty('padding-bottom');
      }
      var app = document.querySelector('.app-container');
      if (app && !compact) {
        app.style.removeProperty('height');
        app.style.removeProperty('max-height');
        app.style.removeProperty('min-height');
      }
      if (compact) {
        if (document.body) {
          document.body.style.setProperty('overflow', 'hidden', 'important');
        }
      } else if (document.body) {
        document.body.style.removeProperty('overflow');
      }
      try {
        if (global.CrozzoViewportFit && typeof global.CrozzoViewportFit.schedule === 'function') {
          global.CrozzoViewportFit.schedule();
        }
      } catch (_) {}
      var nav = document.getElementById('crozzoMobileBottomNav');
      if (nav) {
        if (compact) {
          nav.style.setProperty('display', 'none', 'important');
          nav.style.setProperty('height', '0', 'important');
          nav.setAttribute('aria-hidden', 'true');
        } else {
          nav.style.removeProperty('display');
          nav.style.removeProperty('height');
        }
      }
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

    var androidApk = isAndroidTauriShell();
    var compactChrome = androidApk || (tauri && factor !== 'desktop');
    if (androidApk) doc.setAttribute('data-crozzo-android', '1');
    else doc.removeAttribute('data-crozzo-android');
    doc.classList.toggle('crozzo-android-apk', androidApk);
    doc.classList.toggle('crozzo-apk-rail-ui', tauri && factor !== 'desktop');
    doc.classList.toggle('crozzo-tauri-rail-ui', tauri && factor !== 'desktop');
    doc.classList.toggle('crozzo-android-native', androidApk);
    doc.classList.toggle('crozzo-compact-chrome', compactChrome);
    applyCompactChromeInline(compactChrome);

    try {
      if (typeof global.crozzoTabletShellRefresh === 'function') global.crozzoTabletShellRefresh();
    } catch (_) {}
    try {
      if (global.CrozzoAndroidNative && typeof global.CrozzoAndroidNative.applyLayoutPolish === 'function') {
        global.CrozzoAndroidNative.applyLayoutPolish();
      }
    } catch (_) {}

    try {
      global.dispatchEvent(new CustomEvent('crozzo-form-factor', { detail: { factor: factor, tier: tier } }));
    } catch (_) {}

    if ((prev && prev !== factor) || (prevTier && prevTier !== tier)) {
      markFormResizeTransition(doc);
    try {
      if (typeof global.initMobileUX === 'function') global.initMobileUX();
    } catch (_) {}
    try {
      if (global.CrozzoSidebarNav && typeof global.CrozzoSidebarNav.refresh === 'function') {
        global.CrozzoSidebarNav.refresh();
      }
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
    global.__CROZZO_IS_TAURI__ =
      !!(global.__TAURI__ || global.__TAURI_INTERNALS__) ||
      /tauri/i.test(String((global.navigator && global.navigator.userAgent) || ''));
    applyFormFactorClasses();
    bindResize();
    [0, 80, 300, 900].forEach(function (ms) {
      global.setTimeout(applyFormFactorClasses, ms);
    });
    global.addEventListener('load', function () {
      global.__CROZZO_IS_TAURI__ =
        !!(global.__TAURI__ || global.__TAURI_INTERNALS__) ||
        /tauri/i.test(String((global.navigator && global.navigator.userAgent) || ''));
      applyFormFactorClasses();
    });
  }

  global.crozzoDetectFormFactor = detectFormFactor;
  global.crozzoDetectTouchTier = function () {
    return detectTouchTier(readWidth(), detectFormFactor());
  };
  global.crozzoIsTauriShell = isTauriShell;
  global.crozzoIsTauriDesktopShell = isTauriDesktopShell;
  global.crozzoApplyFormFactorClasses = applyFormFactorClasses;
  global.crozzoScheduleFormFactor = scheduleApply;
  global.CrozzoDeviceForm = {
    isAndroidApk: isAndroidTauriShell,
    detectFormFactor: detectFormFactor,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
