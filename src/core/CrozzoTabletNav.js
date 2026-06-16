/**
 * Crozzo POS — Barra inferior móvil/tablet/APK (táctil unificado).
 */
(function (global) {
  'use strict';

  var TAP_MS = 320;

  function canSeePage(page) {
    if (!page) return false;
    try {
      var hp = global.__crozzoHoneypotLive;
      if (hp && hp.active && typeof global.crozzoHpCanSeePage === 'function') {
        return global.crozzoHpCanSeePage(page);
      }
      if (typeof global.currentUserCanSeePage === 'function' && !global.currentUserCanSeePage(page)) {
        return false;
      }
      if (typeof global.pageBlockedByOperacionModo === 'function' && global.pageBlockedByOperacionModo(page)) {
        return false;
      }
    } catch (_) {}
    return true;
  }

  function canSeePantallasKiosk() {
    try {
      if (typeof global.crozzoKioskComandasEffective === 'function' && global.crozzoKioskComandasEffective()) {
        return true;
      }
    } catch (_) {}
    return canSeePage('comandas') || canSeePage('cocina');
  }

  function touchTier() {
    try {
      return document.documentElement.getAttribute('data-crozzo-touch-tier') || '';
    } catch (_) {
      return '';
    }
  }

  function isPhoneShell() {
    try {
      var doc = document.documentElement;
      if (doc.classList.contains('crozzo-form-mobile')) return true;
      var tier = touchTier();
      return tier === 'phone-sm' || tier === 'phone' || tier === 'phone-lg';
    } catch (_) {
      return false;
    }
  }

  function isTabletTier() {
    try {
      var doc = document.documentElement;
      return touchTier() === 'tablet' || doc.classList.contains('crozzo-form-tablet');
    } catch (_) {
      return false;
    }
  }

  function isTouchFieldShell() {
    try {
      var doc = document.documentElement;
      return (
        doc.classList.contains('crozzo-touch-shell') ||
        doc.classList.contains('crozzo-form-tablet') ||
        doc.classList.contains('crozzo-form-mobile') ||
        doc.classList.contains('crozzo-android-apk') ||
        doc.classList.contains('crozzo-android-native') ||
        doc.getAttribute('data-crozzo-android') === '1'
      );
    } catch (_) {
      return false;
    }
  }

  function shouldShowBottomNav() {
    try {
      if (document.body && document.body.classList.contains('crozzo-kiosk-active')) return false;
      if (document.documentElement.classList.contains('crozzo-compact-chrome')) return false;
      if (document.documentElement.classList.contains('crozzo-form-desktop')) return false;
    } catch (_) {}
    if (!isTouchFieldShell()) return false;
    return isTabletTier() || isPhoneShell();
  }

  function buttonAllowed(btn) {
    var nav = btn.getAttribute('data-crozzo-nav');
    var action = btn.getAttribute('data-crozzo-action');

    if (action === 'open-menu') return true;
    if (action === 'pantallas-kiosk') return canSeePantallasKiosk();
    if (nav === 'comandas') return canSeePage('comandas');
    if (nav === 'cocina') return canSeePage('cocina');
    if (nav === 'cajero') return canSeePage('cajero');
    if (nav === 'tablets') return !isPhoneShell() && canSeePage('tablets');
    if (nav === 'inicio-operacion') return !isPhoneShell() && canSeePage('inicio-operacion');
    return false;
  }

  function isBtnVisible(btn) {
    if (!btn) return false;
    if (btn.hidden || btn.disabled) return false;
    try {
      if (global.getComputedStyle(btn).display === 'none') return false;
    } catch (_) {}
    return true;
  }

  function openAppMenu() {
    if (typeof global.toggleSidebar === 'function') global.toggleSidebar();
    else if (typeof global.crozzoOpenSidebarDrawer === 'function') global.crozzoOpenSidebarDrawer();
  }

  function activateButton(btn, evt) {
    if (!isBtnVisible(btn)) return false;
    if (evt) {
      try {
        evt.preventDefault();
        evt.stopPropagation();
        if (typeof evt.stopImmediatePropagation === 'function') evt.stopImmediatePropagation();
      } catch (_) {}
    }

    var tapKey =
      (btn.getAttribute('data-crozzo-nav') || btn.getAttribute('data-crozzo-action') || 'btn') +
      ':' +
      String(btn.className || '');
    var now = Date.now();
    if (global.__crozzoTabletNavLastTap && global.__crozzoTabletNavLastTap.key === tapKey) {
      if (now - global.__crozzoTabletNavLastTap.at < TAP_MS) return false;
    }
    global.__crozzoTabletNavLastTap = { key: tapKey, at: now };

    var action = btn.getAttribute('data-crozzo-action');
    var page = btn.getAttribute('data-crozzo-nav');

    if (action === 'open-menu') {
      openAppMenu();
      refreshActiveState();
      return true;
    }
    if (action === 'pantallas-kiosk') {
      if (!canSeePantallasKiosk()) return false;
      if (typeof global.crozzoKioskEnterComandasFromLogin === 'function') {
        global.crozzoKioskEnterComandasFromLogin('comandas');
      } else if (typeof global.navigateTo === 'function') {
        global.navigateTo(canSeePage('comandas') ? 'comandas' : 'cocina');
      }
      if (typeof global.crozzoCloseSidebarDrawer === 'function') global.crozzoCloseSidebarDrawer();
      refreshActiveState();
      return true;
    }

    if (page) {
      if (!canSeePage(page)) {
        if (typeof global.showToast === 'function') global.showToast('No autorizado para esta sección.', 'warning');
        return false;
      }
      if (page !== 'comandas' && page !== 'cocina' && typeof global.crozzoToggleCorkboardFocus === 'function') {
        try {
          global.crozzoToggleCorkboardFocus(false);
        } catch (_) {}
      }
      if (typeof global.crozzoNavigateImmediate === 'function') global.crozzoNavigateImmediate(page);
      else if (typeof global.navigateTo === 'function') global.navigateTo(page);
      if (typeof global.crozzoCloseSidebarDrawer === 'function') global.crozzoCloseSidebarDrawer();
      refreshActiveState();
      return true;
    }

    return false;
  }

  function bindBottomNavOnce() {
    var root = document.getElementById('crozzoMobileBottomNav');
    if (!root || root._crozzoTabletNavBound) return;
    root._crozzoTabletNavBound = true;

    root.addEventListener(
      'pointerup',
      function (e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        var btn = e.target && e.target.closest ? e.target.closest('.crozzo-mbn-btn') : null;
        if (!btn || !root.contains(btn)) return;
        activateButton(btn, e);
      },
      { passive: false }
    );
  }

  function bindMobileMenuBtnOnce() {
    /* El menú ☰ lo maneja crozzoBindSidebarMenuButtonsHard en CrozzoPosMain (un solo handler). */
  }

  function refreshActiveState() {
    var root = document.getElementById('crozzoMobileBottomNav');
    if (!root) return;
    var page = typeof global.currentPage !== 'undefined' ? global.currentPage : '';
    var kiosk = typeof global.crozzoKioskIsActive === 'function' && global.crozzoKioskIsActive();

    root.querySelectorAll('.crozzo-mbn-btn').forEach(function (btn) {
      if (!isBtnVisible(btn)) {
        btn.classList.remove('active');
        return;
      }
      var nav = btn.getAttribute('data-crozzo-nav');
      var action = btn.getAttribute('data-crozzo-action');
      var active = false;
      if (action === 'pantallas-kiosk') {
        active = kiosk && (page === 'comandas' || page === 'cocina');
      } else if (nav) {
        active = !kiosk && page === nav;
      }
      btn.classList.toggle('active', active);
    });
  }

  function setBottomNavActive(on) {
    var root = document.getElementById('crozzoMobileBottomNav');
    var body = document.body;
    if (root) root.classList.toggle('crozzo-mbn--active', !!on);
    if (body) body.classList.toggle('crozzo-bottom-nav-active', !!on);
    try {
      if (global.CrozzoViewportFit && typeof global.CrozzoViewportFit.schedule === 'function') {
        global.CrozzoViewportFit.schedule();
      }
    } catch (_) {}
  }

  function applyBottomNavLayout() {
    var root = document.getElementById('crozzoMobileBottomNav');
    if (!root) return;

    bindBottomNavOnce();
    bindMobileMenuBtnOnce();

    if (!shouldShowBottomNav()) {
      setBottomNavActive(false);
      root.setAttribute('aria-hidden', 'true');
      root.querySelectorAll('.crozzo-mbn-btn').forEach(function (btn) {
        btn.hidden = true;
        btn.disabled = true;
        btn.setAttribute('aria-hidden', 'true');
      });
      return;
    }

    var visible = 0;
    var shortcutCount = 0;

    root.querySelectorAll('.crozzo-mbn-btn').forEach(function (btn) {
      var action = btn.getAttribute('data-crozzo-action');
      var show = buttonAllowed(btn);

      btn.hidden = !show;
      btn.style.display = show ? '' : 'none';
      btn.disabled = !show;
      btn.setAttribute('aria-hidden', show ? 'false' : 'true');
      if (show) {
        visible += 1;
        if (action !== 'open-menu') shortcutCount += 1;
      }
    });

    root.classList.toggle('crozzo-mbn--compact', shortcutCount > 0 && shortcutCount <= 4);
    root.classList.toggle('crozzo-mbn--phone', isPhoneShell() && !isTabletTier());
    setBottomNavActive(visible > 0);
    root.setAttribute('aria-hidden', visible > 0 ? 'false' : 'true');
    root.removeAttribute('hidden');

    refreshActiveState();
  }

  function refresh() {
    applyBottomNavLayout();
  }

  global.crozzoTabletNavClick = function (btn, evt) {
    return activateButton(btn, evt);
  };

  global.CrozzoTabletNav = {
    refresh: refresh,
    applyBottomNavLayout: applyBottomNavLayout,
    refreshActiveState: refreshActiveState,
    activateButton: activateButton,
    canSeePage: canSeePage,
    canSeePantallasKiosk: canSeePantallasKiosk,
    shouldShowBottomNav: shouldShowBottomNav,
  };
  global.crozzoRefreshTabletBottomNav = refresh;

  function boot() {
    refresh();
    bindBottomNavOnce();
    bindMobileMenuBtnOnce();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  global.addEventListener('load', boot);
  global.addEventListener('crozzo-form-factor', refresh);
  global.addEventListener('crozzo-ready', function () {
    setTimeout(refresh, 80);
    setTimeout(refresh, 600);
  });
  global.addEventListener('crozzo:auth-ready', function () {
    setTimeout(refresh, 80);
    setTimeout(refresh, 600);
  });
})(typeof window !== 'undefined' ? window : globalThis);
