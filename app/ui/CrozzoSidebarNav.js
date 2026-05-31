/**
 * Crozzo POS — Navegación lateral Executive Elite
 * Rail 64px · Expandido 260px · Persistencia crozzo_menu_state
 */
(function (global) {
  'use strict';

  var LS_KEY = 'crozzo_menu_state';
  var LS_LEGACY_GROUPS = 'crozzo_sidebar_nav_v1';
  var LS_LEGACY_PINNED = 'crozzo_sidebar_expanded';
  var LS_GROUPS_RESET = 'bona_sidebar_groups_collapsed_v2';
  var SUBMENU_DELAY_MS = 50;
  var HOVER_OPEN_MS = 420;
  var HOVER_CLOSE_MS = 280;
  var _hoverOpenTimer = null;
  var _hoverCloseTimer = null;
  var _sidebarTransitionTimer = null;

  function getSidebar() {
    return document.getElementById('sidebar');
  }

  function getNav() {
    return document.getElementById('sidebarNav');
  }

  function getGroups() {
    var nav = getNav();
    if (!nav) return [];
    return Array.prototype.slice.call(nav.querySelectorAll('.nav-group-li[data-group]'));
  }

  function isNavItemEligibleForSearch(item) {
    return !!(item && !item.hasAttribute('hidden'));
  }

  function setNavItemSearchVisible(item, match) {
    item.classList.toggle('crozzo-nav-filter-hidden', !match);
    item.classList.toggle('crozzo-nav-search-match', match);
    item.setAttribute('aria-hidden', match ? 'false' : 'true');
    if (match) {
      if (item.dataset.crozzoSearchHidden === '1') {
        item.style.removeProperty('display');
        delete item.dataset.crozzoSearchHidden;
      }
    } else {
      item.dataset.crozzoSearchHidden = '1';
      item.style.setProperty('display', 'none', 'important');
    }
    var row = item.closest('li');
    if (row) {
      if (match) {
        if (row.dataset.crozzoSearchHidden === '1') {
          row.style.removeProperty('display');
          delete row.dataset.crozzoSearchHidden;
        }
      } else {
        row.dataset.crozzoSearchHidden = '1';
        row.style.setProperty('display', 'none', 'important');
      }
    }
  }

  function normSearch(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  function readState() {
    var state = { groups: {}, pinned: false };
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
    return sb.classList.contains('expanded') || sb.classList.contains('is-expanded');
  }

  function hoverExpandEnabled() {
    try {
      return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (_) {
      return true;
    }
  }

  function clearHoverTimers() {
    if (_hoverOpenTimer) {
      clearTimeout(_hoverOpenTimer);
      _hoverOpenTimer = null;
    }
    if (_hoverCloseTimer) {
      clearTimeout(_hoverCloseTimer);
      _hoverCloseTimer = null;
    }
  }

  function markSidebarTransition() {
    var root = document.documentElement;
    if (!root) return;
    root.classList.add('crozzo-sidebar-transitioning');
    if (_sidebarTransitionTimer) clearTimeout(_sidebarTransitionTimer);
    _sidebarTransitionTimer = setTimeout(function () {
      _sidebarTransitionTimer = null;
      root.classList.remove('crozzo-sidebar-transitioning');
    }, 450);
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
  }

  function collapseAllGroups(persist) {
    getGroups().forEach(function (g) {
      applyGroupOpen(g, false, false);
      g.classList.remove('crozzo-nav-search-has-match');
      g.style.display = '';
    });
    if (persist) saveGroupsState();
  }

  function saveGroupsState() {
    var sb = getSidebar();
    if (sb && sb.classList.contains('is-nav-searching')) return;
    var state = readState();
    state.groups = {};
    getGroups().forEach(function (g) {
      var id = g.getAttribute('data-group') || g.getAttribute('data-nav-group');
      if (id) state.groups[id] = g.classList.contains('open');
    });
    writeState(state);
  }

  function restoreGroupsState(withDelay) {
    var sb = getSidebar();
    if (sb && sb.classList.contains('is-nav-searching')) return;
    var state = readState();
    getGroups().forEach(function (g) {
      var id = g.getAttribute('data-group') || g.getAttribute('data-nav-group');
      var open = state.groups && state.groups[id] !== undefined ? !!state.groups[id] : false;
      applyGroupOpen(g, open, withDelay);
    });
  }

  function resetStoredGroupsCollapsed() {
    try {
      if (localStorage.getItem(LS_GROUPS_RESET) === '1') return;
      var st = readState();
      st.groups = {};
      getGroups().forEach(function (g) {
        var id = g.getAttribute('data-group') || g.getAttribute('data-nav-group');
        if (id) st.groups[id] = false;
      });
      writeState(st);
      localStorage.setItem(LS_GROUPS_RESET, '1');
    } catch (_) {}
  }

  function setSidebarExpanded(expanded, persist) {
    var sb = getSidebar();
    if (!sb) return;
    var wasExpanded = isSidebarExpanded(sb);
    sb.classList.toggle('expanded', !!expanded);
    sb.classList.toggle('is-expanded', !!expanded);
    sb.classList.toggle('collapsed', !expanded);
    if (persist) {
      var st = readState();
      st.pinned = !!expanded;
      writeState(st);
      try {
        localStorage.setItem(LS_LEGACY_PINNED, expanded ? '1' : '0');
      } catch (_) {}
    }
    sb.classList.toggle('pinned', !!expanded && readState().pinned);
    if (wasExpanded !== !!expanded) markSidebarTransition();
    var btn = document.getElementById('menu-toggle-btn');
    if (btn) {
      btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      btn.style.left = expanded ? '248px' : '14px';
    }
  }

  function itemSearchHaystack(item) {
    var labelEl = item.querySelector('.nav-item-label, .menu-text');
    var label = labelEl ? labelEl.textContent : item.textContent || '';
    var page = item.getAttribute('data-page') || '';
    var menu = item.getAttribute('data-menu') || '';
    var group = item.closest('.nav-group-li, .nav-group');
    var groupTitle = '';
    if (group) {
      var gt = group.querySelector('.nav-group-title');
      groupTitle = gt ? gt.textContent : '';
    }
    return normSearch(label + ' ' + page + ' ' + menu + ' ' + groupTitle);
  }

  function ensureSearchEmptyEl() {
    var nav = getNav();
    if (!nav) return null;
    var el = document.getElementById('crozzoNavSearchEmpty');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'crozzoNavSearchEmpty';
    el.className = 'crozzo-nav-search-empty';
    el.setAttribute('role', 'status');
    el.hidden = true;
    el.textContent = 'Sin coincidencias en el menú';
    nav.parentElement.insertBefore(el, nav);
    return el;
  }

  function clearNavSearch() {
    var inp = document.getElementById('crozzoNavSearch');
    var sb = getSidebar();
    if (inp) inp.value = '';
    if (sb) sb.classList.remove('is-nav-searching');
    document.querySelectorAll('#sidebarNav .nav-item[data-page]').forEach(function (item) {
      item.classList.remove('crozzo-nav-filter-hidden', 'crozzo-nav-search-match');
      item.removeAttribute('aria-hidden');
      if (item.dataset.crozzoSearchHidden === '1') {
        item.style.removeProperty('display');
        delete item.dataset.crozzoSearchHidden;
      }
      var row = item.closest('li');
      if (row && row.dataset.crozzoSearchHidden === '1') {
        row.style.removeProperty('display');
        delete row.dataset.crozzoSearchHidden;
      }
    });
    getGroups().forEach(function (g) {
      g.classList.remove('crozzo-nav-search-has-match');
      if (g.dataset.crozzoSearchHidden === '1') {
        g.style.removeProperty('display');
        delete g.dataset.crozzoSearchHidden;
      }
    });
    collapseAllGroups(false);
    var empty = document.getElementById('crozzoNavSearchEmpty');
    if (empty) empty.hidden = true;
  }

  function runNavSearch() {
    var inp = document.getElementById('crozzoNavSearch');
    var sb = getSidebar();
    var nav = getNav();
    if (!inp || !sb || !nav) return;
    var q = normSearch(inp.value);
    var emptyEl = ensureSearchEmptyEl();

    if (!q) {
      clearNavSearch();
      return;
    }

    sb.classList.add('is-nav-searching');
    setSidebarExpanded(true, false);

    var matchCount = 0;
    document.querySelectorAll('#sidebarNav .nav-item[data-page]').forEach(function (item) {
      if (!isNavItemEligibleForSearch(item)) {
        setNavItemSearchVisible(item, false);
        return;
      }
      var hay = itemSearchHaystack(item);
      var match = hay.indexOf(q) >= 0;
      setNavItemSearchVisible(item, match);
      if (match) matchCount++;
    });

    getGroups().forEach(function (g) {
      var visible = g.querySelectorAll('.nav-item[data-page].crozzo-nav-search-match');
      var hasVisible = visible.length > 0;
      g.classList.toggle('crozzo-nav-search-has-match', hasVisible);
      if (hasVisible) {
        if (g.dataset.crozzoSearchHidden === '1') {
          g.style.removeProperty('display');
          delete g.dataset.crozzoSearchHidden;
        }
      } else {
        g.dataset.crozzoSearchHidden = '1';
        g.style.setProperty('display', 'none', 'important');
      }
      applyGroupOpen(g, hasVisible, false);
    });

    if (emptyEl) emptyEl.hidden = matchCount > 0;
  }

  function toggleGroupFromButton(toggle) {
    var group = toggle.closest('.nav-group-li, .nav-group');
    if (!group) return;
    var sb = getSidebar();
    if (sb && sb.classList.contains('is-nav-searching')) return;
    var railMode = sb && !sb.classList.contains('expanded') && !sb.classList.contains('is-expanded');
    var open = !group.classList.contains('open');
    if (railMode && open) {
      setSidebarExpanded(true, !!readState().pinned);
    }
    applyGroupOpen(group, open, true);
    saveGroupsState();
    try {
      if (typeof global.initMobileUX === 'function') global.initMobileUX();
    } catch (_) {}
  }

  function navigateFromItem(item) {
    if (!item) return;
    var p = item.getAttribute('data-page');
    if (!p || typeof global.navigateTo !== 'function') return;
    var sb = getSidebar();
    if (sb && sb.classList.contains('is-nav-searching')) {
      clearNavSearch();
    }
    if (sb && !sb.classList.contains('expanded') && !sb.classList.contains('is-expanded')) {
      setSidebarExpanded(true, !!readState().pinned);
    }
    var group = item.closest('.nav-group-li, .nav-group');
    if (group) applyGroupOpen(group, true, false);
    global.navigateTo(p);
    if (document.body && !document.body.classList.contains('desktop') && typeof global.crozzoCloseSidebarDrawer === 'function') {
      global.crozzoCloseSidebarDrawer();
    }
  }

  function bindNavItems() {
    var nav = getNav();
    if (nav && !nav._crozzoNavDelegation) {
      nav._crozzoNavDelegation = true;
      nav.addEventListener('click', function (e) {
        var item = e.target.closest('.nav-item[data-page]');
        if (!item || !nav.contains(item)) return;
        if (item.hidden || item.style.display === 'none' || item.classList.contains('crozzo-nav-filter-hidden')) return;
        e.preventDefault();
        e.stopPropagation();
        navigateFromItem(item);
      });
    }
    document.querySelectorAll('#sidebarNav .nav-item[data-page]').forEach(function (item) {
      if (item._crozzoNavItemBound) return;
      item._crozzoNavItemBound = true;
      item.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigateFromItem(item);
        }
      });
    });
  }

  function expandGroupForPage(page) {
    if (!page) return;
    var sb = getSidebar();
    if (sb && sb.classList.contains('is-nav-searching')) return;
    getGroups().forEach(function (group) {
      var match = group.querySelector('.nav-item[data-page="' + page + '"]');
      applyGroupOpen(group, !!match, false);
    });
    saveGroupsState();
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

    try {
      if (localStorage.getItem('bona_sidebar_rail_default_v1') !== '1') {
        var fixSt = readState();
        fixSt.pinned = false;
        writeState(fixSt);
        localStorage.setItem('bona_sidebar_rail_default_v1', '1');
      }
    } catch (_) {}

    resetStoredGroupsCollapsed();

    var st = readState();
    setSidebarExpanded(!!st.pinned, false);
    collapseAllGroups(false);

    function shouldBlockHoverToggle() {
      return !!readState().pinned || sb.classList.contains('is-nav-searching');
    }

    function scheduleHoverOpen() {
      if (!hoverExpandEnabled() || shouldBlockHoverToggle()) return;
      if (isSidebarExpanded(sb)) return;
      if (_hoverOpenTimer) return;
      if (_hoverCloseTimer) {
        clearTimeout(_hoverCloseTimer);
        _hoverCloseTimer = null;
      }
      _hoverOpenTimer = setTimeout(function () {
        _hoverOpenTimer = null;
        if (!sb.matches(':hover') || shouldBlockHoverToggle()) return;
        setSidebarExpanded(true, false);
      }, HOVER_OPEN_MS);
    }

    function scheduleHoverClose() {
      if (shouldBlockHoverToggle()) {
        clearHoverTimers();
        return;
      }
      if (_hoverOpenTimer) {
        clearTimeout(_hoverOpenTimer);
        _hoverOpenTimer = null;
      }
      if (_hoverCloseTimer) return;
      _hoverCloseTimer = setTimeout(function () {
        _hoverCloseTimer = null;
        if (sb.matches(':hover') || shouldBlockHoverToggle()) return;
        setSidebarExpanded(false, false);
      }, HOVER_CLOSE_MS);
    }

    if (hoverExpandEnabled()) {
      sb.addEventListener('mouseenter', scheduleHoverOpen);
    }
    sb.addEventListener('mouseleave', scheduleHoverClose);

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

  function bindNavSearch() {
    var inp = document.getElementById('crozzoNavSearch');
    if (!inp) return;

    if (!inp._crozzoNavSearchBound) {
      inp._crozzoNavSearchBound = true;
      inp.addEventListener('input', runNavSearch);
      inp.addEventListener('keyup', runNavSearch);
      inp.addEventListener('search', runNavSearch);
      inp.addEventListener('focus', function () {
        setSidebarExpanded(true, false);
      });
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          inp.value = '';
          clearNavSearch();
          inp.blur();
        }
      });
    }

    if (!document._crozzoNavSearchDelegated) {
      document._crozzoNavSearchDelegated = true;
      document.addEventListener(
        'input',
        function (e) {
          if (e.target && e.target.id === 'crozzoNavSearch') runNavSearch();
        },
        true
      );
    }
  }

  function init() {
    bindSidebarExpand();
    bindGroupToggles();
    bindNavItems();
    if (typeof global.crozzoEnhanceSidebarLabels === 'function') global.crozzoEnhanceSidebarLabels();
    bindNavSearch();
    collapseAllGroups(false);
    if (typeof global.crozzoRefreshLucideIcons === 'function') global.crozzoRefreshLucideIcons();
  }

  function refresh() {
    bindNavItems();
    bindNavSearch();
    var sb = getSidebar();
    if (sb && sb.classList.contains('is-nav-searching')) {
      runNavSearch();
      return;
    }
    collapseAllGroups(false);
  }

  global.CrozzoSidebarNav = {
    init: init,
    refresh: refresh,
    readState: readState,
    save: saveGroupsState,
    restore: restoreGroupsState,
    setExpanded: setSidebarExpanded,
    applyGroupOpen: applyGroupOpen,
    expandGroupForPage: expandGroupForPage,
    collapseAllGroups: collapseAllGroups,
    bindNavSearch: bindNavSearch,
    runNavSearch: runNavSearch,
    clearNavSearch: clearNavSearch
  };

  global.crozzoSaveSidebarNavState = saveGroupsState;
  global.crozzoRestoreSidebarNavState = function () {
    collapseAllGroups(false);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
