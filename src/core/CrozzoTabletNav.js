/**
 * Crozzo POS — Barra inferior tablet/APK guiada por permisos (rol + perfil operativo).
 */
(function (global) {
  'use strict';

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

  function isPhoneShell() {
    try {
      var doc = document.documentElement;
      if (doc.classList.contains('crozzo-form-mobile')) return true;
      var tier = doc.getAttribute('data-crozzo-touch-tier') || '';
      return tier === 'phone-sm' || tier === 'phone' || tier === 'phone-lg';
    } catch (_) {
      return false;
    }
  }

  function isAndroidApkShell() {
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

  function isTauriShell() {
    try {
      var doc = document.documentElement;
      if (doc.classList.contains('tauri-shell')) return true;
      return !!(global.__TAURI__ || global.__CROZZO_IS_TAURI__);
    } catch (_) {
      return false;
    }
  }

  function isPhoneBottomNavShell() {
    if (!isPhoneShell()) return false;
    return canSeePage('comandas') || canSeePage('cocina') || canSeePage('cajero');
  }

  function shouldShowBottomNav() {
    return isBottomNavShell() || isPhoneBottomNavShell();
  }

  function isBottomNavShell() {
    try {
      var doc = document.documentElement;
      if (doc.classList.contains('crozzo-compact-chrome')) return false;
      if (doc.classList.contains('crozzo-android-apk')) return false;
      if (doc.classList.contains('crozzo-android-native')) return false;
    } catch (_) {}
    if (isTauriShell()) return false;
    if (isAndroidApkShell()) return false;
    if (isPhoneShell()) return false;
    try {
      var doc = document.documentElement;
      if (doc.classList.contains('crozzo-form-tablet')) return true;
      if (doc.classList.contains('crozzo-touch-shell')) {
        return (doc.getAttribute('data-crozzo-touch-tier') || '') === 'tablet';
      }
    } catch (_) {}
    return false;
  }

  function buttonAllowed(btn) {
    var nav = btn.getAttribute('data-crozzo-nav');
    var action = btn.getAttribute('data-crozzo-action');

    if (action === 'open-menu') return true;
    if (action === 'pantallas-kiosk') return canSeePantallasKiosk();
    if (nav === 'comandas') return canSeePage('comandas');
    if (nav === 'cocina') return canSeePage('cocina');
    if (nav === 'cajero') return canSeePage('cajero') && !isPhoneShell();
    if (nav === 'tablets') return canSeePage('tablets') && !isPhoneShell();
    if (nav === 'inicio-operacion') return canSeePage('inicio-operacion') && !isPhoneShell();
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

  function activateButton(btn, evt) {
    if (!isBtnVisible(btn)) return false;
    if (evt) {
      try {
        evt.preventDefault();
        evt.stopPropagation();
      } catch (_) {}
    }

    var tapKey =
      (btn.getAttribute('data-crozzo-nav') || btn.getAttribute('data-crozzo-action') || 'btn') +
      ':' +
      String(btn.className || '');
    var now = Date.now();
    if (global.__crozzoTabletNavLastTap && global.__crozzoTabletNavLastTap.key === tapKey) {
      if (now - global.__crozzoTabletNavLastTap.at < 300) {
        if (evt) {
          try {
            evt.preventDefault();
            evt.stopPropagation();
            if (typeof evt.stopImmediatePropagation === 'function') evt.stopImmediatePropagation();
          } catch (_) {}
        }
        return false;
      }
    }
    global.__crozzoTabletNavLastTap = { key: tapKey, at: now };

    var action = btn.getAttribute('data-crozzo-action');
    var page = btn.getAttribute('data-crozzo-nav');

    if (action === 'open-menu') {
      if (evt) {
        try {
          evt.preventDefault();
          evt.stopPropagation();
          if (typeof evt.stopImmediatePropagation === 'function') evt.stopImmediatePropagation();
        } catch (_) {}
      }
      if (typeof global.crozzoOpenSidebarDrawer === 'function') global.crozzoOpenSidebarDrawer();
      else if (typeof global.toggleSidebar === 'function') global.toggleSidebar();
      refreshActiveState();
      return false;
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
      return false;
    }

    if (page) {
      if (!canSeePage(page)) {
        if (typeof global.showToast === 'function') global.showToast('No autorizado para esta sección.', 'warning');
        return false;
      }
      if (typeof global.crozzoNavigateImmediate === 'function') global.crozzoNavigateImmediate(page);
      else if (typeof global.navigateTo === 'function') global.navigateTo(page);
      if (typeof global.crozzoCloseSidebarDrawer === 'function') global.crozzoCloseSidebarDrawer();
      refreshActiveState();
      return false;
    }

    return false;
  }

  function bindBottomNavOnce() {
    var root = document.getElementById('crozzoMobileBottomNav');
    if (!root || root._crozzoTabletNavBound) return;
    root._crozzoTabletNavBound = true;

    root.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('.crozzo-mbn-btn') : null;
      if (!btn || !root.contains(btn)) return;
      activateButton(btn, e);
    });

    root.addEventListener(
      'touchend',
      function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('.crozzo-mbn-btn') : null;
        if (!btn || !root.contains(btn)) return;
        activateButton(btn, e);
      },
      { passive: false }
    );
  }

  function bindMobileMenuBtnOnce() {
    var btn = document.querySelector('.mobile-menu-btn');
    if (!btn || btn._crozzoMobileMenuBound) return;
    btn._crozzoMobileMenuBound = true;
    btn.addEventListener('pointerup', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      try {
        e.preventDefault();
        e.stopPropagation();
      } catch (_) {}
      if (typeof global.crozzoOpenSidebarDrawer === 'function') global.crozzoOpenSidebarDrawer();
      else if (typeof global.toggleSidebar === 'function') global.toggleSidebar();
    });
  }

  function refreshActiveState() {
    var root = document.getElementById('crozzoMobileBottomNav');
    if (!root) return;
    var page = typeof global.currentPage !== 'undefined' ? global.currentPage : '';
    var kiosk =
      typeof global.crozzoKioskIsActive === 'function' && global.crozzoKioskIsActive();

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

  function applyBottomNavLayout() {
    var root = document.getElementById('crozzoMobileBottomNav');
    if (!root) return;

    bindBottomNavOnce();

    if (!shouldShowBottomNav()) {
      root.style.setProperty('display', 'none', 'important');
      root.setAttribute('aria-hidden', 'true');
      root.setAttribute('hidden', '');
      root.classList.remove('crozzo-mbn--compact', 'crozzo-mbn--phone-kitchen');
      root.querySelectorAll('.crozzo-mbn-btn').forEach(function (btn) {
        btn.hidden = true;
        btn.style.display = 'none';
        btn.disabled = true;
        btn.setAttribute('aria-hidden', 'true');
      });
      try {
        if (global.CrozzoViewportFit && typeof global.CrozzoViewportFit.schedule === 'function') {
          global.CrozzoViewportFit.schedule();
        }
      } catch (_) {}
      return;
    }

    root.classList.toggle('crozzo-mbn--phone-kitchen', isPhoneBottomNavShell() && !isBottomNavShell());

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
    if (visible > 0) {
      root.style.removeProperty('display');
    } else {
      root.style.display = 'none';
    }
    root.setAttribute('aria-hidden', visible > 0 ? 'false' : 'true');

    refreshActiveState();

    try {
      if (global.CrozzoViewportFit && typeof global.CrozzoViewportFit.schedule === 'function') {
        global.CrozzoViewportFit.schedule();
      }
    } catch (_) {}
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
  global.addEventListener('crozzo:auth-ready', function () {
    setTimeout(refresh, 80);
  });
  global.addEventListener('crozzo-ready', function () {
    setTimeout(refresh, 80);
  });
})(typeof window !== 'undefined' ? window : globalThis);
