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
  var SUBMENU_DELAY_MS = 40;
  var HOVER_OPEN_MS = 180;
  var HOVER_CLOSE_MS = 220;
  var SIDEBAR_TRANSITION_MS = 320;
  var _hoverOpenTimer = null;
  var _hoverCloseTimer = null;
  var _sidebarTransitionTimer = null;
  var _collapseGroupsTimer = null;
  var _boundNavEl = null;
  var _navCoreReady = false;

  function isDrawerLayoutActive() {
    try {
      if (typeof global.crozzoIsDrawerLayoutActive === 'function') return global.crozzoIsDrawerLayoutActive();
      var doc = document.documentElement;
      if (doc && doc.classList.contains('crozzo-form-desktop')) return false;
      if (doc && doc.classList.contains('crozzo-tauri-rail-ui')) return true;
      if (doc && doc.classList.contains('tauri-shell')) return false;
      if (doc && doc.classList.contains('crozzo-touch-shell')) return true;
      if (doc && (doc.classList.contains('crozzo-form-mobile') || doc.classList.contains('crozzo-form-tablet'))) return true;
      var body = document.body;
      return !!(body && (body.classList.contains('mobile') || body.classList.contains('tablet')));
    } catch (_) {
      return false;
    }
  }

  function isDrawerNavMode() {
    return isDrawerLayoutActive();
  }

  var _drawerNavPrepared = false;

  function applyDrawerNavMode() {
    if (!isDrawerNavMode()) return;
    clearHoverTimers();
    var sb = getSidebar();
    if (!sb) return;
    sb.classList.add('crozzo-drawer-nav');
    var btn = document.getElementById('menu-toggle-btn');
    if (btn) {
      btn.style.display = 'none';
      btn.setAttribute('aria-hidden', 'true');
    }
    if (_drawerNavPrepared) return;
    _drawerNavPrepared = true;
    if (!sb.classList.contains('expanded') && !sb.classList.contains('is-expanded')) {
      setSidebarExpanded(true, false);
    }
    if (typeof global.crozzoSyncSidebarBackdrop === 'function') global.crozzoSyncSidebarBackdrop();
  }

  function ensureLayout() {
    if (isDrawerNavMode()) applyDrawerNavMode();
    else clearDrawerNavMode();
  }

  function clearDrawerNavMode() {
    if (isDrawerLayoutActive()) return;
    _drawerNavPrepared = false;
    var sb = getSidebar();
    if (!sb) return;
    clearHoverTimers();
    sb.classList.remove('crozzo-drawer-nav', 'open');
    sb.style.removeProperty('transform');
    sb.style.removeProperty('visibility');
    if (typeof global.crozzoSyncSidebarBackdrop === 'function') global.crozzoSyncSidebarBackdrop();
    var btn = document.getElementById('menu-toggle-btn');
    if (btn) {
      btn.style.removeProperty('display');
      btn.removeAttribute('aria-hidden');
    }
    var st = readState();
    setSidebarExpanded(!!st.pinned, false);
  }

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

  function shouldDisableSidebarHover() {
    try {
      if (typeof global.crozzoIsSidebarDrawerMode === 'function' && global.crozzoIsSidebarDrawerMode()) return true;
    } catch (_) {}
    if (isDrawerNavMode()) return true;
    var sb = getSidebar();
    if (sb && sb.classList.contains('open')) return true;
    try {
      if (document.body && document.body.classList.contains('crozzo-sidebar-drawer-open')) return true;
    } catch (_) {}
    return false;
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

  function syncSidebarLayoutClass(expanded) {
    var root = document.documentElement;
    if (!root) return;
    root.classList.toggle('crozzo-sidebar-layout-expanded', !!expanded);
  }

  function cancelScheduledCollapseGroups() {
    if (_collapseGroupsTimer) {
      clearTimeout(_collapseGroupsTimer);
      _collapseGroupsTimer = null;
    }
  }

  function scheduleCollapseGroupsForRail() {
    cancelScheduledCollapseGroups();
    _collapseGroupsTimer = setTimeout(function () {
      _collapseGroupsTimer = null;
      var sb = getSidebar();
      if (!sb || isSidebarExpanded(sb)) return;
      if (readState().pinned) return;
      if (sb.classList.contains('is-nav-searching')) return;
      collapseGroupsForRail();
    }, SIDEBAR_TRANSITION_MS);
  }

  function markSidebarTransition() {
    var sb = getSidebar();
    if (sb && sb.classList.contains('crozzo-drawer-nav')) return;
    if (shouldDisableSidebarHover()) return;
    var root = document.documentElement;
    if (!root) return;
    root.classList.add('crozzo-sidebar-transitioning');
    if (_sidebarTransitionTimer) clearTimeout(_sidebarTransitionTimer);
    _sidebarTransitionTimer = setTimeout(function () {
      _sidebarTransitionTimer = null;
      root.classList.remove('crozzo-sidebar-transitioning');
    }, SIDEBAR_TRANSITION_MS + 80);
  }

  function applyGroupOpen(group, open, withDelay) {
    if (!group) return;
    var sb = getSidebar();
    if (sb && sb.classList.contains('crozzo-drawer-nav')) withDelay = false;
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

  function hasOpenNavGroup() {
    return getGroups().some(function (g) {
      return g.classList.contains('open') && !g.classList.contains('nav-group-collapsed');
    });
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

  function collapseGroupsForRail() {
    getGroups().forEach(function (g) {
      applyGroupOpen(g, false, false);
    });
  }

  function maybeCollapseRailAfterInteraction() {
    if (shouldDisableSidebarHover()) return;
    var sb = getSidebar();
    if (!sb || shouldBlockHoverToggleGlobal(sb)) return;
    if (!isSidebarExpanded(sb)) return;
    if (hasOpenNavGroup()) return;
    if (sb.matches(':hover')) return;
    setSidebarExpanded(false, false);
  }

  function shouldBlockHoverToggleGlobal(sb) {
    if (!sb) sb = getSidebar();
    return !!readState().pinned || (sb && sb.classList.contains('is-nav-searching'));
  }

  function setSidebarExpanded(expanded, persist) {
    var sb = getSidebar();
    if (!sb) return;
    var st = readState();
    var wasExpanded = isSidebarExpanded(sb);
    sb.classList.toggle('expanded', !!expanded);
    sb.classList.toggle('is-expanded', !!expanded);
    sb.classList.toggle('collapsed', !expanded);
    if (persist) {
      st.pinned = !!expanded;
      writeState(st);
      try {
        localStorage.setItem(LS_LEGACY_PINNED, expanded ? '1' : '0');
      } catch (_) {}
      if (expanded) restoreGroupsState(false);
    }
    if (expanded) {
      cancelScheduledCollapseGroups();
    } else if (!st.pinned && !sb.classList.contains('is-nav-searching') && !shouldDisableSidebarHover()) {
      scheduleCollapseGroupsForRail();
    }
    sb.classList.toggle('pinned', !!expanded && readState().pinned);
    syncSidebarLayoutClass(!!expanded);
    if (typeof global.crozzoSidebarMountToggleBtn === 'function') global.crozzoSidebarMountToggleBtn(sb);
    if (wasExpanded !== !!expanded && sb && !sb.classList.contains('crozzo-drawer-nav') && !shouldDisableSidebarHover()) {
      markSidebarTransition();
    }
    var btn = document.getElementById('menu-toggle-btn');
    if (btn) {
      btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      btn.style.removeProperty('left');
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

  function toggleGroupById(groupId) {
    var nav = getNav();
    if (!nav || !groupId) return;
    var group = nav.querySelector('.nav-group-li[data-group="' + groupId + '"]');
    if (!group) return;
    var sb = getSidebar();
    if (sb && sb.classList.contains('is-nav-searching')) return;
    var railMode =
      sb &&
      !sb.classList.contains('expanded') &&
      !sb.classList.contains('is-expanded') &&
      !isDrawerNavMode();
    var open = !group.classList.contains('open');
    if (railMode && open) {
      setSidebarExpanded(true, !!readState().pinned);
    }
    if (open) {
      getGroups().forEach(function (g) {
        if (g !== group) applyGroupOpen(g, false, false);
      });
    }
    applyGroupOpen(group, open, true);
    saveGroupsState();
    if (!open) {
      setTimeout(maybeCollapseRailAfterInteraction, HOVER_CLOSE_MS + 40);
    }
  }

  function toggleGroupFromButton(toggle) {
    if (!toggle) return;
    var group = toggle.closest('.nav-group-li[data-group]');
    if (!group) return;
    var id = group.getAttribute('data-group');
    if (id) toggleGroupById(id);
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
    if (typeof global.crozzoNavigateImmediate === 'function') global.crozzoNavigateImmediate(p);
    else if (typeof global.navigateTo === 'function') global.navigateTo(p);
    var drawerOpen = document.body && document.body.classList.contains('crozzo-sidebar-drawer-open');
    var drawerMode = isDrawerNavMode();
    if ((drawerOpen || drawerMode) && typeof global.crozzoCloseSidebarDrawer === 'function') {
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
      if (match) applyGroupOpen(group, true, false);
    });
    saveGroupsState();
  }

  function bindGroupToggles() {
    var nav = getNav();
    if (!nav) return;
    if (nav._crozzoSidebarNavToggles && _boundNavEl === nav) return;
    _boundNavEl = nav;
    nav._crozzoSidebarNavToggles = true;

    nav.addEventListener('click', function (e) {
      var toggle = e.target.closest('.nav-group-toggle');
      if (!toggle) return;
      e.preventDefault();
      toggleGroupFromButton(toggle);
    });
  }

  function bindSidebarExpand() {
    var sb = getSidebar();
    if (!sb || sb._crozzoSidebarEliteBound) return;
    sb._crozzoSidebarEliteBound = true;
    sb.classList.add('sidebar-elite', 'sidebar-pro');

    function ensureMenuToggleBtnBound() {
      var toggleBtn = document.getElementById('menu-toggle-btn');
      if (!toggleBtn) {
        toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.id = 'menu-toggle-btn';
        toggleBtn.className = 'menu-toggle menu-toggle-btn';
        toggleBtn.setAttribute('aria-label', 'Expandir o contraer menú lateral');
        toggleBtn.setAttribute('aria-controls', 'sidebar');
        toggleBtn.innerHTML = '<span class="menu-toggle-icon" aria-hidden="true">☰</span>';
        sb.insertBefore(toggleBtn, sb.firstChild);
      }
      if (toggleBtn._crozzoToggleBound) return;
      toggleBtn._crozzoToggleBound = true;
      toggleBtn.addEventListener(
        'click',
        function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (typeof global.toggleSidebar === 'function') global.toggleSidebar();
          else setSidebarExpanded(!isSidebarExpanded(sb), true);
        },
        false
      );
      if (typeof global.crozzoSidebarMountToggleBtn === 'function') global.crozzoSidebarMountToggleBtn(sb);
    }
    ensureMenuToggleBtnBound();

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
    restoreGroupsState(false);

    function shouldBlockHoverToggle() {
      if (shouldDisableSidebarHover()) return true;
      return !!readState().pinned || sb.classList.contains('is-nav-searching');
    }

    function scheduleHoverOpen() {
      if (shouldDisableSidebarHover() || !hoverExpandEnabled() || shouldBlockHoverToggle()) return;
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
      if (shouldDisableSidebarHover()) {
        clearHoverTimers();
        return;
      }
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

    sb.addEventListener('mouseenter', scheduleHoverOpen);
    sb.addEventListener('mouseleave', scheduleHoverClose);
    if (isDrawerNavMode()) {
      applyDrawerNavMode();
    }

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
    if (isDrawerNavMode()) applyDrawerNavMode();
    else clearDrawerNavMode();
    bindGroupToggles();
    bindNavItems();
    if (typeof global.crozzoEnhanceSidebarLabels === 'function') global.crozzoEnhanceSidebarLabels();
    bindNavSearch();
    if (!_navCoreReady) {
      _navCoreReady = true;
    }
    restoreGroupsState(false);
    if (typeof global.crozzoRefreshLucideIcons === 'function') global.crozzoRefreshLucideIcons();
  }

  function repairAfterNavigation() {
    clearHoverTimers();
    cancelScheduledCollapseGroups();
    var sb = getSidebar();
    if (!sb) return;
    ensureLayout();
    if (!isDrawerNavMode() && !sb.classList.contains('crozzo-drawer-nav')) {
      sb.classList.remove('open');
      sb.style.removeProperty('pointer-events');
      sb.style.removeProperty('visibility');
      sb.style.removeProperty('transform');
      sb.style.removeProperty('display');
      sb.style.removeProperty('width');
      sb.style.removeProperty('max-width');
      sb.removeAttribute('hidden');
      sb.setAttribute('aria-hidden', 'false');
      var btn = document.getElementById('menu-toggle-btn');
      if (btn) {
        var body = document.body;
        if (!body || !body.classList.contains('crozzo-login-open')) {
          btn.hidden = false;
          btn.removeAttribute('hidden');
          btn.style.removeProperty('display');
          btn.style.removeProperty('pointer-events');
          btn.style.removeProperty('left');
        }
      }
    }
    syncSidebarLayoutClass(isSidebarExpanded(sb));
    var root = document.documentElement;
    if (root) root.classList.remove('crozzo-sidebar-transitioning');
    bindGroupToggles();
    bindNavItems();
    bindNavSearch();
    if (sb.classList.contains('is-nav-searching')) runNavSearch();
    else restoreGroupsState(false);
  }

  function refresh() {
    repairAfterNavigation();
  }

  global.CrozzoSidebarNav = {
    init: init,
    refresh: refresh,
    repairAfterNavigation: repairAfterNavigation,
    ensureLayout: ensureLayout,
    readState: readState,
    save: saveGroupsState,
    restore: restoreGroupsState,
    setExpanded: setSidebarExpanded,
    applyGroupOpen: applyGroupOpen,
    toggleGroupById: toggleGroupById,
    expandGroupForPage: expandGroupForPage,
    collapseAllGroups: collapseAllGroups,
    bindNavSearch: bindNavSearch,
    runNavSearch: runNavSearch,
    clearNavSearch: clearNavSearch,
    clearHoverTimers: clearHoverTimers,
    shouldDisableSidebarHover: shouldDisableSidebarHover
  };

  global.crozzoSaveSidebarNavState = saveGroupsState;
  global.crozzoRestoreSidebarNavState = function (withDelay) {
    restoreGroupsState(!!withDelay);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
