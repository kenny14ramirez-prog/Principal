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
  var SUBMENU_DELAY_MS = 36;
  var HOVER_OPEN_MS = 140;
  var HOVER_CLOSE_MS = 320;
  var SIDEBAR_LEAVE_DEBOUNCE_MS = 160;
  var SIDEBAR_OUTSIDE_CHECK_MS = 72;
  var SIDEBAR_TRANSITION_MS = 280;
  var SIDEBAR_HIT_PAD_RAIL = 10;
  var SIDEBAR_HIT_PAD_EXPANDED = 22;
  var _hoverOpenTimer = null;
  var _hoverCloseTimer = null;
  var _sidebarTransitionTimer = null;
  var _collapseGroupsTimer = null;
  var _sidebarLeaveDebounce = null;
  var _sidebarPointerInside = false;
  var _lastPointer = { x: null, y: null };
  var _outsideCheckAt = 0;
  var _boundNavEl = null;
  var _navCoreReady = false;
  var _sidebarSuppressTransition = true;

  function isDrawerLayoutActive() {
    if (isDesktopSidebarLayout()) return false;
    try {
      if (typeof global.crozzoIsDrawerLayoutActive === 'function') return global.crozzoIsDrawerLayoutActive();
    } catch (_) {}
    return false;
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
    document.documentElement.classList.add('crozzo-sidebar-touch');
    document.documentElement.classList.remove('crozzo-sidebar-desktop');
    setSidebarExpanded(false, false);
    sb.classList.remove('open', 'expanded', 'is-expanded');
    sb.style.removeProperty('transform');
    sb.style.removeProperty('visibility');
    sb.style.removeProperty('pointer-events');
    if (typeof global.crozzoSyncSidebarBackdrop === 'function') global.crozzoSyncSidebarBackdrop();
  }

  function ensureLayout() {
    if (isDesktopSidebarLayout()) {
      prepareDesktopSidebarChrome();
      return;
    }
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
    sb.style.removeProperty('pointer-events');
    sb.style.removeProperty('display');
    if (typeof global.crozzoSyncSidebarBackdrop === 'function') global.crozzoSyncSidebarBackdrop();
    var btn = document.getElementById('menu-toggle-btn');
    if (btn) {
      btn.style.removeProperty('display');
      btn.removeAttribute('aria-hidden');
      btn.hidden = false;
      btn.removeAttribute('hidden');
    }
    if (!isDesktopSidebarLayout()) {
      var st = readState();
      setSidebarExpanded(!!st.pinned, false);
    }
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
    if (!item) return false;
    if (item.classList.contains('crozzo-nav-acl-hidden')) return false;
    if (item.hasAttribute('hidden') && item.hidden !== false) return false;
    var row = item.closest('li');
    if (row && (row.classList.contains('crozzo-nav-acl-hidden') || (row.hasAttribute('hidden') && row.hidden !== false))) return false;
    var grp = item.closest('.nav-group-li, .nav-group');
    if (grp && (grp.hidden || grp.style.display === 'none')) {
      try {
        if (typeof global.isSuperAdminUser === 'function' && global.isSuperAdminUser()) return true;
      } catch (_) {}
      return false;
    }
    return true;
  }

  function forceNavItemVisibleForSearch(item) {
    if (!item) return;
    item.hidden = false;
    item.removeAttribute('hidden');
    item.style.setProperty('display', 'flex', 'important');
    item.style.setProperty('visibility', 'visible', 'important');
    item.style.setProperty('opacity', '1', 'important');
    item.style.setProperty('pointer-events', 'auto', 'important');
    delete item.dataset.crozzoSearchHidden;
    var label = item.querySelector('.nav-item-label, .menu-text');
    if (label) {
      label.style.setProperty('opacity', '1', 'important');
      label.style.setProperty('visibility', 'visible', 'important');
      label.style.setProperty('width', 'auto', 'important');
      label.style.setProperty('max-width', 'none', 'important');
      label.style.setProperty('overflow', 'visible', 'important');
    }
    var row = item.closest('li');
    if (row) {
      row.hidden = false;
      row.removeAttribute('hidden');
      row.style.removeProperty('display');
      delete row.dataset.crozzoSearchHidden;
    }
  }

  function setNavItemSearchVisible(item, match) {
    item.classList.toggle('crozzo-nav-filter-hidden', !match);
    item.classList.toggle('crozzo-nav-search-match', match);
    item.setAttribute('aria-hidden', match ? 'false' : 'true');
    if (match) {
      forceNavItemVisibleForSearch(item);
    } else {
      item.dataset.crozzoSearchHidden = '1';
      item.style.setProperty('display', 'none', 'important');
      var row = item.closest('li');
      if (row) {
        row.dataset.crozzoSearchHidden = '1';
        row.style.setProperty('display', 'none', 'important');
      }
    }
  }

  function syncGroupSubmenuVisible(group, open) {
    if (!group) return;
    var sub = group.querySelector('.nav-group-items');
    if (!sub) return;
    var sb = getSidebar();
    var searching = sb && sb.classList.contains('is-nav-searching');
    if (open) {
      sub.classList.add('open', 'is-expanded');
      if (searching) {
        sub.style.setProperty('display', 'flex', 'important');
        sub.style.setProperty('flex-direction', 'column', 'important');
        sub.style.setProperty('max-height', '1200px', 'important');
        sub.style.setProperty('opacity', '1', 'important');
        sub.style.setProperty('visibility', 'visible', 'important');
        sub.style.setProperty('overflow', 'visible', 'important');
        sub.style.setProperty('pointer-events', 'auto', 'important');
      }
    } else {
      if (searching) return;
      sub.classList.remove('open', 'is-expanded');
      sub.style.removeProperty('display');
      sub.style.removeProperty('flex-direction');
      sub.style.removeProperty('max-height');
      sub.style.removeProperty('opacity');
      sub.style.removeProperty('visibility');
      sub.style.removeProperty('overflow');
      sub.style.removeProperty('pointer-events');
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
    var key = menuStateStorageKey();
    try {
      var raw = localStorage.getItem(key);
      if (!raw && key.indexOf('_desktop_') >= 0) raw = localStorage.getItem(LS_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          state.groups = parsed.groups || state.groups;
          state.pinned = !!parsed.pinned;
          return state;
        }
      }
      if (isDesktopSidebarLayout()) {
        state.pinned = false;
        return state;
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
      localStorage.setItem(menuStateStorageKey(), JSON.stringify(state));
    } catch (_) {}
  }

  function isSidebarExpanded(sb) {
    if (!sb) return false;
    return sb.classList.contains('expanded') || sb.classList.contains('is-expanded');
  }

  function isDesktopSidebarLayout() {
    try {
      if (typeof global.crozzoIsDesktopSidebarChrome === 'function') return global.crozzoIsDesktopSidebarChrome();
      var doc = document.documentElement;
      if (doc && (doc.classList.contains('crozzo-form-desktop') || doc.classList.contains('tauri-desktop'))) {
        return true;
      }
      if (global.__CROZZO_IS_TAURI_DESKTOP__) return true;
      var body = document.body;
      if (body && body.classList.contains('tauri-desktop')) return true;
    } catch (_) {}
    return false;
  }

  function menuStateStorageKey() {
    return isDesktopSidebarLayout() ? LS_KEY + '_desktop_v1' : LS_KEY + '_touch_v1';
  }

  function prepareDesktopSidebarChrome() {
    if (!isDesktopSidebarLayout() || isDrawerNavMode()) return;
    var sb = getSidebar();
    if (!sb) return;
    sb.classList.remove('crozzo-drawer-nav', 'open');
    sb.style.removeProperty('transform');
    sb.style.removeProperty('visibility');
    sb.style.removeProperty('pointer-events');
    sb.style.removeProperty('display');
    sb.style.removeProperty('width');
    sb.style.removeProperty('max-width');
    sb.style.removeProperty('top');
    sb.style.removeProperty('height');
    sb.style.removeProperty('max-height');
    sb.style.removeProperty('min-height');
    sb.style.removeProperty('z-index');
    sb.removeAttribute('hidden');
    sb.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('crozzo-sidebar-desktop');
    document.documentElement.classList.remove('crozzo-sidebar-touch');
    var btn = document.getElementById('menu-toggle-btn');
    if (btn) {
      btn.style.removeProperty('display');
      btn.removeAttribute('aria-hidden');
      btn.hidden = false;
      btn.removeAttribute('hidden');
    }
  }

  function applyDesktopSidebarBootState() {
    prepareDesktopSidebarChrome();
    var sb = getSidebar();
    if (!sb) return;
    var st = readState();
    if (st.pinned) {
      setSidebarExpanded(true, false);
      restoreGroupsState(false);
      var pg = typeof global.currentPage !== 'undefined' ? global.currentPage : '';
      if (pg) expandGroupForPage(pg);
    } else {
      setSidebarExpanded(false, false);
      collapseAllGroups(false);
      syncSidebarHoverSessionClasses(sb, false, false);
    }
    syncSidebarLayoutClass(isSidebarExpanded(sb));
    if (typeof global.crozzoSidebarMountToggleBtn === 'function') global.crozzoSidebarMountToggleBtn(sb);
  }

  /** Fijar menú expandido (☰ con pin / Ctrl+M). */
  function ensureDesktopSidebarOpen() {
    if (!isDesktopSidebarLayout() || isDrawerNavMode()) return;
    prepareDesktopSidebarChrome();
    var sb = getSidebar();
    if (!sb) return;
    clearHoverTimers();
    _sidebarPointerInside = false;
    setSidebarExpanded(true, true);
    var pg = typeof global.currentPage !== 'undefined' ? global.currentPage : '';
    if (pg) expandGroupForPage(pg);
    else restoreGroupsState(false);
    syncSidebarLayoutClass(true);
    if (typeof global.crozzoSidebarMountToggleBtn === 'function') global.crozzoSidebarMountToggleBtn(sb);
  }

  function shouldDisableSidebarHover() {
    if (isDrawerNavMode()) return true;
    try {
      if (typeof global.crozzoIsSidebarDrawerMode === 'function' && global.crozzoIsSidebarDrawerMode()) return true;
    } catch (_) {}
    var sb = getSidebar();
    if (sb && sb.classList.contains('open')) return true;
    try {
      if (document.body && document.body.classList.contains('crozzo-sidebar-drawer-open')) return true;
    } catch (_) {}
    if (readState().pinned) return true;
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
    cancelSidebarLeaveDebounce();
  }

  function cancelSidebarLeaveDebounce() {
    if (_sidebarLeaveDebounce) {
      clearTimeout(_sidebarLeaveDebounce);
      _sidebarLeaveDebounce = null;
    }
  }

  function markSidebarPointerInside(inside) {
    _sidebarPointerInside = !!inside;
    if (inside) {
      cancelSidebarLeaveDebounce();
      if (_hoverCloseTimer) {
        clearTimeout(_hoverCloseTimer);
        _hoverCloseTimer = null;
      }
    }
  }

  function scheduleSidebarPointerLeave() {
    cancelSidebarLeaveDebounce();
    var debounceMs = isDesktopSidebarLayout() ? 320 : SIDEBAR_LEAVE_DEBOUNCE_MS;
    _sidebarLeaveDebounce = setTimeout(function () {
      _sidebarLeaveDebounce = null;
      var sb = getSidebar();
      if (!sb) return;
      var pt =
        _lastPointer.x != null ? { x: _lastPointer.x, y: _lastPointer.y } : null;
      if (isSidebarHoveredOrFocused(sb, pt)) {
        _sidebarPointerInside = true;
        return;
      }
      _sidebarPointerInside = false;
      scheduleHoverClose();
    }, debounceMs);
  }

  function onSidebarPointerEnter() {
    if (shouldDisableSidebarHover()) return;
    markSidebarPointerInside(true);
    scheduleHoverOpen();
  }

  function onSidebarPointerLeave(e) {
    if (shouldDisableSidebarHover()) return;
    var sb = getSidebar();
    if (!sb) return;
    var rt = e && e.relatedTarget;
    if (rt && sb.contains(rt)) return;
    _sidebarPointerInside = false;
    scheduleSidebarPointerLeave();
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
    }, readSidebarTransitionMs());
  }

  function markSidebarTransition() {
    if (_sidebarSuppressTransition) return;
    var sb = getSidebar();
    if (sb && sb.classList.contains('crozzo-drawer-nav')) return;
    if (shouldDisableSidebarHover()) return;
    var root = document.documentElement;
    if (!root) return;
    root.classList.add('crozzo-sidebar-transitioning');
    if (_sidebarTransitionTimer) clearTimeout(_sidebarTransitionTimer);
    var ms = readSidebarTransitionMs();
    _sidebarTransitionTimer = setTimeout(function () {
      _sidebarTransitionTimer = null;
      root.classList.remove('crozzo-sidebar-transitioning');
    }, ms + 60);
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
      syncGroupSubmenuVisible(group, !!open);
    }
    if (isDrawerNavMode()) {
      try {
        if (typeof global.crozzoFixMobileNavScroll === 'function') global.crozzoFixMobileNavScroll();
      } catch (_) {}
    }
  }

  function syncSidebarHoverSessionClasses(sb, expanded, persist) {
    if (!sb) sb = getSidebar();
    if (!sb) return;
    var hoverSession = !!expanded && !persist && !readState().pinned && !shouldDisableSidebarHover();
    sb.classList.toggle('crozzo-sidebar-hover-active', hoverSession);
    var root = document.documentElement;
    if (root) root.classList.toggle('crozzo-sidebar-hover-session', hoverSession);
  }

  function readHoverOpenMs() {
    if (isDesktopSidebarLayout()) return 90;
    try {
      var raw = getComputedStyle(document.documentElement).getPropertyValue('--sidebar-hover-open-delay');
      var n = parseInt(String(raw || '').trim(), 10);
      if (n > 0) return n;
    } catch (_) {}
    return HOVER_OPEN_MS;
  }

  function readHoverCloseMs() {
    if (isDesktopSidebarLayout()) return 480;
    try {
      var raw = getComputedStyle(document.documentElement).getPropertyValue('--sidebar-hover-close-delay');
      var n = parseInt(String(raw || '').trim(), 10);
      if (n > 0) return n;
    } catch (_) {}
    return HOVER_CLOSE_MS;
  }

  function readSidebarTransitionMs() {
    try {
      var raw = getComputedStyle(document.documentElement).getPropertyValue('--sidebar-duration');
      var n = parseInt(String(raw || '').trim(), 10);
      if (n > 0) return n;
    } catch (_) {}
    return SIDEBAR_TRANSITION_MS;
  }

  function readSidebarWidthVar(name, fallback) {
    try {
      var raw = getComputedStyle(document.documentElement).getPropertyValue(name);
      var n = parseInt(String(raw || '').trim(), 10);
      if (n > 0) return n;
    } catch (_) {}
    return fallback;
  }

  /** Rectángulo de hover: ancho lógico expandido/rail + margen extra para no cerrar en transición o huecos. */
  function getSidebarHitRect(sb) {
    if (!sb) return null;
    var r = sb.getBoundingClientRect();
    var railW = readSidebarWidthVar('--sidebar-width-rail', 64);
    var expW = readSidebarWidthVar('--sidebar-width-expanded', 260);
    var hoverSession =
      sb.classList.contains('crozzo-sidebar-hover-active') ||
      (document.documentElement && document.documentElement.classList.contains('crozzo-sidebar-hover-session'));
    var expanded = isSidebarExpanded(sb) || hoverSession;
    var pad = expanded ? SIDEBAR_HIT_PAD_EXPANDED : SIDEBAR_HIT_PAD_RAIL;
    var logicalW = expanded ? expW : railW;
    var measuredW = Math.max(0, r.right - r.left);
    var width = Math.max(logicalW, measuredW);
    return {
      left: r.left - pad,
      right: r.left + width + pad,
      top: r.top - pad,
      bottom: r.bottom + pad,
    };
  }

  function pointerInSidebarRect(sb, x, y) {
    if (!sb || x == null || y == null) return false;
    var hit = getSidebarHitRect(sb);
    if (!hit) return false;
    return x >= hit.left && x <= hit.right && y >= hit.top && y <= hit.bottom;
  }

  function isSidebarHoveredOrFocused(sb, pt) {
    if (!sb) sb = getSidebar();
    if (!sb) return false;
    if (pt && pointerInSidebarRect(sb, pt.x, pt.y)) return true;
    if (_lastPointer.x != null && pointerInSidebarRect(sb, _lastPointer.x, _lastPointer.y)) return true;
    if (sb.matches(':hover')) return true;
    var active = document.activeElement;
    return !!(active && active !== document.body && sb.contains(active));
  }

  function isPointerInsideSidebar(sb) {
    if (_sidebarPointerInside) return true;
    return isSidebarHoveredOrFocused(sb);
  }

  function scheduleHoverOpen() {
    if (shouldDisableSidebarHover() || !hoverExpandEnabled() || shouldBlockHoverToggleGlobal()) return;
    var sb = getSidebar();
    if (!sb) return;
    if (_hoverCloseTimer) {
      clearTimeout(_hoverCloseTimer);
      _hoverCloseTimer = null;
    }
    if (isSidebarExpanded(sb)) return;
    if (_hoverOpenTimer) return;
    _hoverOpenTimer = setTimeout(function () {
      _hoverOpenTimer = null;
      if (!isPointerInsideSidebar(sb) || shouldBlockHoverToggleGlobal(sb)) return;
      setSidebarExpanded(true, false);
    }, readHoverOpenMs());
  }

  function scheduleHoverClose() {
    var sb = getSidebar();
    if (!sb) return;
    if (shouldDisableSidebarHover()) {
      clearHoverTimers();
      return;
    }
    if (shouldBlockHoverToggleGlobal(sb)) {
      clearHoverTimers();
      return;
    }
    if (isSidebarHoveredOrFocused(sb)) return;
    if (_hoverOpenTimer) {
      clearTimeout(_hoverOpenTimer);
      _hoverOpenTimer = null;
    }
    if (_hoverCloseTimer) return;
    _hoverCloseTimer = setTimeout(function () {
      _hoverCloseTimer = null;
      if (isSidebarHoveredOrFocused(sb)) return;
      collapseSidebarHoverRail();
    }, readHoverCloseMs());
  }

  function collapseSidebarHoverRail() {
    var sb = getSidebar();
    if (!sb || shouldBlockHoverToggleGlobal(sb)) return;
    if (readState().pinned) return;
    if (isPointerInsideSidebar(sb) || isSidebarHoveredOrFocused(sb)) return;
    _sidebarPointerInside = false;
    cancelSidebarLeaveDebounce();
    clearHoverTimers();
    cancelScheduledCollapseGroups();
    collapseGroupsForRail();
    if (!readState().pinned) saveGroupsState();
    setSidebarExpanded(false, false);
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
      if (persist) scheduleCollapseGroupsForRail();
      else collapseGroupsForRail();
    }
    sb.classList.toggle('pinned', !!expanded && readState().pinned);
    syncSidebarLayoutClass(!!expanded);
    syncSidebarHoverSessionClasses(sb, !!expanded, persist);
    if (typeof global.crozzoSidebarMountToggleBtn === 'function') {
      var hoverLayoutToggle =
        !persist &&
        wasExpanded !== !!expanded &&
        !shouldDisableSidebarHover() &&
        sb &&
        !sb.classList.contains('crozzo-drawer-nav');
      if (hoverLayoutToggle) {
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            var s = getSidebar();
            if (s && typeof global.crozzoSidebarMountToggleBtn === 'function') global.crozzoSidebarMountToggleBtn(s);
          });
        });
      } else {
        global.crozzoSidebarMountToggleBtn(sb);
      }
    }
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

  function ensureSearchResultsEl() {
    var nav = getNav();
    if (!nav || !nav.parentElement) return null;
    var el = document.getElementById('crozzoNavSearchResults');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'crozzoNavSearchResults';
    el.className = 'crozzo-nav-search-results';
    el.setAttribute('role', 'listbox');
    el.setAttribute('aria-label', 'Resultados de búsqueda en el menú');
    el.hidden = true;
    nav.parentElement.insertBefore(el, nav);
    if (!el._crozzoSearchHitsBound) {
      el._crozzoSearchHitsBound = true;
      el.addEventListener('click', function (e) {
        var btn = e.target.closest('.crozzo-nav-search-hit[data-page]');
        if (!btn) return;
        e.preventDefault();
        var page = btn.getAttribute('data-page');
        if (!page) return;
        var item = document.querySelector('#sidebarNav .nav-item[data-page="' + page + '"]');
        if (item) navigateFromItem(item);
        else if (typeof global.navigateTo === 'function') {
          clearNavSearch();
          global.navigateTo(page);
        }
      });
    }
    return el;
  }

  function renderNavSearchResults(hits) {
    var el = ensureSearchResultsEl();
    if (!el) return;
    if (!hits || !hits.length) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    el.hidden = false;
    el.innerHTML = hits
      .map(function (h) {
        return (
          '<button type="button" class="crozzo-nav-search-hit" role="option" data-page="' +
          String(h.page).replace(/"/g, '&quot;') +
          '">' +
          '<span class="crozzo-nav-search-hit__group">' +
          String(h.group || '').replace(/</g, '&lt;') +
          '</span>' +
          '<span class="crozzo-nav-search-hit__label">' +
          String(h.label || h.page).replace(/</g, '&lt;') +
          '</span></button>'
        );
      })
      .join('');
  }

  function clearNavSearch() {
    var inp = document.getElementById('crozzoNavSearch');
    var sb = getSidebar();
    if (inp) inp.value = '';
    if (sb) sb.classList.remove('is-nav-searching');
    document.querySelectorAll('#sidebarNav .nav-item[data-page]').forEach(function (item) {
      item.classList.remove('crozzo-nav-filter-hidden', 'crozzo-nav-search-match');
      item.removeAttribute('aria-hidden');
      item.style.removeProperty('display');
      item.style.removeProperty('visibility');
      item.style.removeProperty('opacity');
      item.style.removeProperty('pointer-events');
      delete item.dataset.crozzoSearchHidden;
      var row = item.closest('li');
      if (row) {
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
      syncGroupSubmenuVisible(g, false);
      var sub = g.querySelector('.nav-group-items');
      if (sub) {
        sub.classList.remove('open', 'is-expanded');
      }
    });
    document.querySelectorAll('#sidebarNav .nav-item[data-page] .nav-item-label').forEach(function (label) {
      label.style.removeProperty('opacity');
      label.style.removeProperty('visibility');
      label.style.removeProperty('width');
      label.style.removeProperty('max-width');
      label.style.removeProperty('overflow');
    });
    collapseAllGroups(false);
    var empty = document.getElementById('crozzoNavSearchEmpty');
    if (empty) empty.hidden = true;
    var hits = document.getElementById('crozzoNavSearchResults');
    if (hits) {
      hits.hidden = true;
      hits.innerHTML = '';
    }
    var nav = getNav();
    if (nav) nav.classList.remove('crozzo-nav-search-nav-hidden');
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

    sb.classList.add('is-nav-searching', 'expanded', 'is-expanded');
    sb.classList.remove('collapsed');
    setSidebarExpanded(true, false);

    var groupTitleMatches = {};
    getGroups().forEach(function (g) {
      var gt = g.querySelector('.nav-group-title');
      var gHay = normSearch(gt ? gt.textContent : '');
      var id = g.getAttribute('data-group') || g.getAttribute('data-nav-group') || '';
      groupTitleMatches[id] = gHay.indexOf(q) >= 0;
    });

    var matchCount = 0;
    var hitList = [];
    document.querySelectorAll('#sidebarNav .nav-item[data-page]').forEach(function (item) {
      if (!isNavItemEligibleForSearch(item)) {
        setNavItemSearchVisible(item, false);
        return;
      }
      var group = item.closest('.nav-group-li, .nav-group');
      var gid = group ? group.getAttribute('data-group') || group.getAttribute('data-nav-group') || '' : '';
      var hay = itemSearchHaystack(item);
      var match = hay.indexOf(q) >= 0 || !!groupTitleMatches[gid];
      setNavItemSearchVisible(item, match);
      if (match) {
        matchCount++;
        var labelEl = item.querySelector('.nav-item-label, .menu-text');
        var gt = group && group.querySelector('.nav-group-title');
        hitList.push({
          page: item.getAttribute('data-page') || '',
          label: labelEl ? labelEl.textContent.trim() : item.textContent.trim(),
          group: gt ? gt.textContent.trim() : '',
        });
      }
    });

    getGroups().forEach(function (g) {
      var gid = g.getAttribute('data-group') || g.getAttribute('data-nav-group') || '';
      var visible = g.querySelectorAll('.nav-item[data-page].crozzo-nav-search-match');
      var hasVisible = visible.length > 0 || !!groupTitleMatches[gid];
      g.classList.toggle('crozzo-nav-search-has-match', hasVisible);
      if (hasVisible) {
        if (g.dataset.crozzoSearchHidden === '1') {
          g.style.removeProperty('display');
          delete g.dataset.crozzoSearchHidden;
        }
        applyGroupOpen(g, true, false);
        syncGroupSubmenuVisible(g, true);
      } else {
        g.dataset.crozzoSearchHidden = '1';
        g.style.setProperty('display', 'none', 'important');
        applyGroupOpen(g, false, false);
      }
    });

    renderNavSearchResults(hitList.filter(function (h, i, arr) {
      return arr.findIndex(function (x) { return x.page === h.page; }) === i;
    }));
    nav.classList.add('crozzo-nav-search-nav-hidden');
    if (emptyEl) emptyEl.hidden = matchCount > 0;
    try {
      if (isDrawerNavMode() && typeof global.crozzoFixMobileNavScroll === 'function') global.crozzoFixMobileNavScroll();
    } catch (_) {}
  }

  function toggleGroupById(groupId) {
    var nav = getNav();
    if (!nav || !groupId) return;
    var group = nav.querySelector('.nav-group-li[data-group="' + groupId + '"]');
    if (!group) return;
    var sb = getSidebar();
    if (sb && sb.classList.contains('is-nav-searching')) {
      if (!group.classList.contains('crozzo-nav-search-has-match')) return;
      setSidebarExpanded(true, false);
      var searchOpen = !group.classList.contains('open');
      applyGroupOpen(group, searchOpen, false);
      return;
    }
    var railMode =
      sb &&
      !sb.classList.contains('expanded') &&
      !sb.classList.contains('is-expanded') &&
      !isDrawerNavMode();
    var open = !group.classList.contains('open');
    if ((railMode || (isDesktopSidebarLayout() && !isSidebarExpanded(sb))) && open) {
      setSidebarExpanded(true, !!readState().pinned);
    }
    if (open) {
      getGroups().forEach(function (g) {
        if (g !== group) applyGroupOpen(g, false, false);
      });
    }
    applyGroupOpen(group, open, true);
    saveGroupsState();
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
    try {
      global.__crozzoNavFromSidebarAt = Date.now();
    } catch (_) {}
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
    var drawerMode = isDrawerNavMode() && !isDesktopSidebarLayout();
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
    if (sb && sb.classList.contains('is-nav-searching')) {
      if (typeof runNavSearch === 'function') runNavSearch();
      return;
    }
    if (sb && !isSidebarExpanded(sb) && !readState().pinned) {
      var recentNav =
        global.__crozzoNavFromSidebarAt && Date.now() - global.__crozzoNavFromSidebarAt < 800;
      if (!recentNav) return;
    }
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

  function bindDesktopSidebarHover() {
    var sb = getSidebar();
    if (!sb || sb._crozzoDesktopHoverBound) return;
    if (!isDesktopSidebarLayout()) return;
    sb._crozzoDesktopHoverBound = true;
    sb.addEventListener('pointerenter', onSidebarPointerEnter);
    sb.addEventListener('pointerleave', onSidebarPointerLeave);
    sb.addEventListener(
      'mouseenter',
      function () {
        onSidebarPointerEnter();
      },
      false
    );
    sb.addEventListener(
      'mouseleave',
      function (e) {
        onSidebarPointerLeave(e);
      },
      false
    );
    sb.addEventListener(
      'pointerdown',
      function () {
        if (!shouldDisableSidebarHover()) markSidebarPointerInside(true);
      },
      true
    );
    sb.addEventListener('focusin', function () {
      if (!shouldDisableSidebarHover()) markSidebarPointerInside(true);
    });
    bindSidebarHoverTracking();
  }

  function bindSidebarHoverTracking() {
    if (document._crozzoSidebarHoverTrack) return;
    document._crozzoSidebarHoverTrack = true;
    document.addEventListener(
      'pointermove',
      function (e) {
        if (e.pointerType === 'touch') return;
        _lastPointer.x = e.clientX;
        _lastPointer.y = e.clientY;
        var side = getSidebar();
        if (!side || shouldDisableSidebarHover()) return;
        if (pointerInSidebarRect(side, e.clientX, e.clientY)) {
          markSidebarPointerInside(true);
          if (!isSidebarExpanded(side) && !shouldBlockHoverToggleGlobal(side)) {
            scheduleHoverOpen();
          }
        }
        var hoverActive =
          isSidebarExpanded(side) ||
          side.classList.contains('crozzo-sidebar-hover-active') ||
          _sidebarPointerInside;
        if (!hoverActive || shouldBlockHoverToggleGlobal(side)) return;
        var now = Date.now();
        if (now - _outsideCheckAt < SIDEBAR_OUTSIDE_CHECK_MS) return;
        _outsideCheckAt = now;
        if (pointerInSidebarRect(side, e.clientX, e.clientY)) {
          markSidebarPointerInside(true);
          return;
        }
        if (!isSidebarHoveredOrFocused(side, { x: e.clientX, y: e.clientY })) {
          _sidebarPointerInside = false;
          scheduleSidebarPointerLeave();
        }
      },
      { passive: true, capture: true }
    );
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

    resetStoredGroupsCollapsed();

    try {
      if (localStorage.getItem('bona_sidebar_hover_rail_v3') !== '1' && isDesktopSidebarLayout()) {
        var hoverSt = readState();
        hoverSt.pinned = false;
        writeState(hoverSt);
        localStorage.setItem('bona_sidebar_hover_rail_v3', '1');
      }
    } catch (_) {}

    try {
      if (localStorage.getItem('bona_sidebar_rail_default_v1') !== '1' && !isDesktopSidebarLayout()) {
        var fixSt = readState();
        fixSt.pinned = false;
        writeState(fixSt);
        localStorage.setItem('bona_sidebar_rail_default_v1', '1');
      }
    } catch (_) {}

    var st = readState();
    if (isDesktopSidebarLayout() && !isDrawerNavMode()) {
      applyDesktopSidebarBootState();
      bindDesktopSidebarHover();
    } else if (isDrawerNavMode()) {
      setSidebarExpanded(false, false);
      collapseAllGroups(false);
    } else {
      setSidebarExpanded(!!st.pinned, false);
      if (st.pinned) restoreGroupsState(false);
      else collapseAllGroups(false);
    }

    if (!shouldDisableSidebarHover()) {
      if (!isDesktopSidebarLayout()) {
        sb.addEventListener('pointerenter', onSidebarPointerEnter);
        sb.addEventListener('pointerleave', onSidebarPointerLeave);
        sb.addEventListener(
          'pointerdown',
          function () {
            markSidebarPointerInside(true);
          },
          true
        );
        sb.addEventListener('focusin', function () {
          markSidebarPointerInside(true);
        });
      }
      bindSidebarHoverTracking();
    }
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

    global.requestAnimationFrame(function () {
      _sidebarSuppressTransition = false;
    });
  }

  function bindNavSearch() {
    var inp = document.getElementById('crozzoNavSearch');
    if (!inp) return;

    if (!inp._crozzoNavSearchBound) {
      inp._crozzoNavSearchBound = true;
      inp.addEventListener('input', runNavSearch);
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
    var firstRun = !_navCoreReady;
    bindSidebarExpand();
    if (isDrawerNavMode()) {
      applyDrawerNavMode();
    } else if (!isDesktopSidebarLayout()) {
      clearDrawerNavMode();
    } else {
      prepareDesktopSidebarChrome();
    }
    bindGroupToggles();
    bindNavItems();
    if (typeof global.crozzoEnhanceSidebarLabels === 'function') global.crozzoEnhanceSidebarLabels();
    bindNavSearch();
    if (firstRun) {
      _navCoreReady = true;
      if (typeof global.crozzoRefreshLucideIcons === 'function') global.crozzoRefreshLucideIcons();
    }
  }

  function isReady() {
    return _navCoreReady;
  }

  function repairAfterNavigation() {
    if (global.__crozzoSidebarRepairBusy) return;
    global.__crozzoSidebarRepairBusy = true;
    var sb = getSidebar();
    if (!sb) {
      global.__crozzoSidebarRepairBusy = false;
      return;
    }
    var hoverLocked =
      isDesktopSidebarLayout() &&
      !readState().pinned &&
      (isPointerInsideSidebar(sb) ||
        isSidebarHoveredOrFocused(sb) ||
        sb.classList.contains('crozzo-sidebar-hover-active') ||
        sb.matches(':hover'));
    if (!hoverLocked) clearHoverTimers();
    cancelScheduledCollapseGroups();
    if (isDrawerNavMode()) {
      ensureLayout();
      if (!sb.classList.contains('open')) {
        sb.classList.remove('expanded', 'is-expanded', 'crozzo-sidebar-hover-active');
      }
    } else if (isDesktopSidebarLayout()) {
      prepareDesktopSidebarChrome();
      bindDesktopSidebarHover();
      var st = readState();
      if (st.pinned) {
        if (!isSidebarExpanded(sb)) setSidebarExpanded(true, false);
        var pgPin = typeof global.currentPage !== 'undefined' ? global.currentPage : '';
        if (pgPin) expandGroupForPage(pgPin);
      } else if (!hoverLocked) {
        var recentNav =
          global.__crozzoNavFromSidebarAt && Date.now() - global.__crozzoNavFromSidebarAt < 700;
        if (!recentNav) {
          setSidebarExpanded(false, false);
          collapseGroupsForRail();
          syncSidebarHoverSessionClasses(sb, false, false);
        }
      }
    } else {
      ensureLayout();
    }
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
    else {
      var pg = typeof global.currentPage !== 'undefined' ? global.currentPage : '';
      if (pg) expandGroupForPage(pg);
    }
    global.__crozzoSidebarRepairBusy = false;
  }

  function refresh() {
    repairAfterNavigation();
  }

  function prepareForLoginGate() {
    clearHoverTimers();
    _sidebarPointerInside = false;
    cancelScheduledCollapseGroups();
    var sb = getSidebar();
    if (!sb) return;
    try {
      if (typeof global.crozzoCloseSidebarDrawer === 'function') global.crozzoCloseSidebarDrawer();
    } catch (_) {}
    clearNavSearch();
    collapseAllGroups(false);
    if (!readState().pinned) {
      setSidebarExpanded(false, false);
    }
    sb.classList.remove('open', 'is-nav-searching', 'crozzo-drawer-nav');
    sb.style.setProperty('display', 'none', 'important');
    sb.style.setProperty('visibility', 'hidden', 'important');
    sb.style.setProperty('pointer-events', 'none', 'important');
    sb.style.setProperty('transform', 'translateX(-110%)', 'important');
    sb.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('crozzo-sidebar-layout-expanded', 'crozzo-sidebar-transitioning', 'crozzo-sidebar-hover-session');
    sb.classList.remove('crozzo-sidebar-hover-active');
  }

  function restoreAfterLoginGate() {
    if (global.__crozzoSidebarRepairBusy) return;
    var sb = getSidebar();
    if (!sb || document.body.classList.contains('crozzo-login-open')) return;
    sb.style.removeProperty('display');
    sb.style.removeProperty('visibility');
    sb.style.removeProperty('pointer-events');
    sb.style.removeProperty('transform');
    sb.removeAttribute('hidden');
    sb.setAttribute('aria-hidden', 'false');
    if (typeof global.crozzoClearSidebarDrawerOverlay === 'function') global.crozzoClearSidebarDrawerOverlay();
    if (isDesktopSidebarLayout() && !isDrawerNavMode()) {
      applyDesktopSidebarBootState();
    } else if (isDrawerNavMode()) {
      setSidebarExpanded(false, false);
      collapseAllGroups(false);
    } else {
      var st = readState();
      if (st.pinned) {
        setSidebarExpanded(true, false);
        restoreGroupsState(false);
      } else {
        setSidebarExpanded(false, false);
        collapseAllGroups(false);
      }
    }
    repairAfterNavigation();
  }

  global.CrozzoSidebarNav = {
    init: init,
    isReady: isReady,
    refresh: refresh,
    repairAfterNavigation: repairAfterNavigation,
    prepareForLoginGate: prepareForLoginGate,
    restoreAfterLoginGate: restoreAfterLoginGate,
    ensureLayout: ensureLayout,
    ensureDesktopSidebarOpen: ensureDesktopSidebarOpen,
    applyDesktopSidebarBootState: applyDesktopSidebarBootState,
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
  if (!global._crozzoSidebarFormFactorBound) {
    global._crozzoSidebarFormFactorBound = true;
    global.addEventListener('crozzo-form-factor', function () {
      try {
        _drawerNavPrepared = false;
        ensureLayout();
        if (isDesktopSidebarLayout()) applyDesktopSidebarBootState();
        else if (isDrawerNavMode()) applyDrawerNavMode();
      } catch (_) {}
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
