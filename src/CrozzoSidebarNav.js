/**
 * Crozzo POS — Navegación lateral Executive Elite
 * Rail 64px · Expandido 260px · Persistencia crozzo_menu_state
 */
(function (global) {
  'use strict';

  var LS_KEY = 'crozzo_menu_state';
  var LS_LEGACY_GROUPS = 'crozzo_sidebar_nav_v1';
  var LS_LEGACY_PINNED = 'crozzo_sidebar_expanded';
  var SUBMENU_DELAY_MS = 50;

  function getSidebar() {
    return document.getElementById('sidebar');
  }

  function getNav() {
    return document.getElementById('sidebarNav');
  }

  function getGroups() {
    var nav = getNav();
    if (!nav) return [];
    return Array.prototype.slice.call(
      nav.querySelectorAll('.nav-group-li[data-group], .nav-group[data-nav-group]')
    );
  }

  function readState() {
    var state = { groups: { operacion: true }, pinned: false };
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          state.groups = parsed.groups || state.groups;
          state.pinned = !!parsed.pinned;
          return state;
        }
      }
      var leg = localStorage.getItem(LS_LEGACY_GROUPS);
      if (leg) {
        var old = JSON.parse(leg);
        if (old && typeof old === 'object') {
          Object.keys(old).forEach(function (k) {
            state.groups[k] = !old[k];
          });
        }
      }
      if (localStorage.getItem(LS_LEGACY_PINNED) === '1') state.pinned = true;
    } catch (_) {}
    return state;
  }

  function writeState(state) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch (_) {}
  }

  function isSidebarExpanded(sb) {
    if (!sb) return false;
    return sb.classList.contains('expanded') || sb.classList.contains('is-expanded') || sb.matches(':hover');
  }

  function applyGroupOpen(group, open, withDelay) {
    if (!group) return;
    group.classList.toggle('open', !!open);
    group.classList.toggle('nav-group-collapsed', !open);
    var btn = group.querySelector('.nav-group-toggle');
    var sub = group.querySelector('.nav-group-items');
    if (btn) {
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.classList.toggle('expanded', !!open);
    }
    if (sub) {
      sub.classList.toggle('open', !!open);
      sub.classList.toggle('is-expanded', !!open);
      if (withDelay && open && isSidebarExpanded(getSidebar())) {
        sub.style.transitionDelay = SUBMENU_DELAY_MS + 'ms';
      } else {
        sub.style.transitionDelay = '';
      }
    }
    var chev = group.querySelector('.nav-chevron [data-lucide], .nav-chevron i');
    if (chev && chev.parentElement) {
      chev.parentElement.style.transform = open ? 'rotate(0deg)' : 'rotate(-90deg)';
    }
  }

  function saveGroupsState() {
    var state = readState();
    state.groups = {};
    getGroups().forEach(function (g) {
      var id = g.getAttribute('data-group') || g.getAttribute('data-nav-group');
      if (id) state.groups[id] = g.classList.contains('open');
    });
    writeState(state);
  }

  function restoreGroupsState(withDelay) {
    var state = readState();
    getGroups().forEach(function (g) {
      var id = g.getAttribute('data-group') || g.getAttribute('data-nav-group');
      var open = state.groups && state.groups[id] !== undefined ? !!state.groups[id] : id === 'operacion';
      applyGroupOpen(g, open, withDelay);
    });
  }

  function setSidebarExpanded(expanded, persist) {
    var sb = getSidebar();
    if (!sb) return;
    sb.classList.toggle('expanded', !!expanded);
    sb.classList.toggle('is-expanded', !!expanded);
    sb.classList.toggle('pinned', !!expanded);
    sb.classList.toggle('collapsed', !expanded);
    if (persist) {
      var st = readState();
      st.pinned = !!expanded;
      writeState(st);
      try {
        localStorage.setItem(LS_LEGACY_PINNED, expanded ? '1' : '0');
      } catch (_) {}
    }
    var btn = document.getElementById('menu-toggle-btn');
    if (btn) {
      btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      btn.style.left = expanded ? '248px' : '14px';
    }
    if (expanded) {
      setTimeout(function () {
        restoreGroupsState(true);
      }, SUBMENU_DELAY_MS);
    }
  }

  function toggleGroupFromButton(toggle) {
    var group = toggle.closest('.nav-group-li, .nav-group');
    if (!group) return;
    var open = !group.classList.contains('open');
    applyGroupOpen(group, open, true);
    saveGroupsState();
    try {
      if (typeof global.initMobileUX === 'function') global.initMobileUX();
    } catch (_) {}
  }

  function expandGroupForPage(page) {
    if (!page) return;
    getGroups().forEach(function (group) {
      var match = group.querySelector('.nav-item[data-page="' + page + '"]');
      if (!match) return;
      applyGroupOpen(group, true, false);
    });
    saveGroupsState();
  }

  function bindNavItems() {
    document.querySelectorAll('#sidebarNav .nav-item[data-page]').forEach(function (item) {
      if (item._crozzoNavItemBound) return;
      item._crozzoNavItemBound = true;
      function go() {
        var p = item.getAttribute('data-page');
        if (p && typeof global.navigateTo === 'function') global.navigateTo(p);
        if (document.body && !document.body.classList.contains('desktop') && typeof global.crozzoCloseSidebarDrawer === 'function') {
          global.crozzoCloseSidebarDrawer();
        }
      }
      item.addEventListener('click', go);
      item.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          go();
        }
      });
    });
  }

  function bindGroupToggles() {
    var nav = getNav();
    if (!nav || nav._crozzoSidebarNavToggles) return;
    nav._crozzoSidebarNavToggles = true;

    var touchAt = 0;
    var touchY0 = null;

    nav.addEventListener(
      'touchstart',
      function (e) {
        var toggle = e.target.closest('.nav-group-toggle');
        if (!toggle) return;
        touchAt = Date.now();
        try {
          var p = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
          touchY0 = p ? p.clientY : null;
        } catch (_) {
          touchY0 = null;
        }
      },
      { passive: true }
    );

    nav.addEventListener(
      'touchend',
      function (e) {
        var toggle = e.target.closest('.nav-group-toggle');
        if (!toggle) return;
        if (touchY0 !== null && e.changedTouches[0]) {
          if (Math.abs(e.changedTouches[0].clientY - touchY0) > 22) return;
        }
        touchY0 = null;
        try {
          e.preventDefault();
        } catch (_) {}
        toggleGroupFromButton(toggle);
        touchAt = Date.now();
      },
      { passive: false }
    );

    nav.addEventListener('click', function (e) {
      var toggle = e.target.closest('.nav-group-toggle');
      if (!toggle) return;
      if (Date.now() - touchAt < 500) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      e.preventDefault();
      toggleGroupFromButton(toggle);
    });
  }

  function bindSidebarExpand() {
    var sb = getSidebar();
    if (!sb || sb._crozzoSidebarEliteBound) return;
    sb._crozzoSidebarEliteBound = true;
    sb.classList.add('sidebar-elite', 'sidebar-pro');

    var st = readState();
    setSidebarExpanded(!!st.pinned, false);
    restoreGroupsState(false);

    sb.addEventListener('mouseenter', function () {
      if (!sb.classList.contains('expanded') && !sb.classList.contains('is-expanded')) {
        setTimeout(function () {
          restoreGroupsState(true);
        }, SUBMENU_DELAY_MS);
      }
    });

    sb.addEventListener('mouseleave', function () {
      if (!readState().pinned) {
        setSidebarExpanded(false, false);
      }
    });

    if (!global._crozzoSidebarKeyBound) {
      global._crozzoSidebarKeyBound = true;
      document.addEventListener('keydown', function (e) {
        if (!(e.ctrlKey || e.metaKey) || String(e.key || '').toLowerCase() !== 'm') return;
        if (global.crozzoIsTypingTarget && global.crozzoIsTypingTarget(e.target)) return;
        e.preventDefault();
        var s = getSidebar();
        if (s) setSidebarExpanded(!s.classList.contains('expanded'), true);
      });
    }
  }

  function init() {
    bindSidebarExpand();
    bindGroupToggles();
    bindNavItems();
    restoreGroupsState(false);
    if (typeof global.crozzoRefreshLucideIcons === 'function') global.crozzoRefreshLucideIcons();
    if (typeof global.crozzoEnhanceSidebarLabels === 'function') global.crozzoEnhanceSidebarLabels();
  }

  global.CrozzoSidebarNav = {
    init: init,
    readState: readState,
    save: saveGroupsState,
    restore: restoreGroupsState,
    setExpanded: setSidebarExpanded,
    applyGroupOpen: applyGroupOpen,
    expandGroupForPage: expandGroupForPage
  };

  global.crozzoSaveSidebarNavState = saveGroupsState;
  global.crozzoRestoreSidebarNavState = function () {
    restoreGroupsState(false);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
