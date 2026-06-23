/**
 * Factory para docks web embebidos (Gmail, Drive, etc.) — PC Tauri.
 * WhatsApp mantiene su módulo propio; este core evita duplicar lógica.
 */
(function (global) {
  'use strict';

  function isDesktopPc() {
    try {
      if (global.__CROZZO_IS_TAURI_DESKTOP__) return true;
      var html = document.documentElement;
      if (html && html.classList.contains('crozzo-android-apk')) return false;
      if (html && html.classList.contains('crozzo-android-native')) return false;
      if (html && html.classList.contains('tauri-desktop')) return true;
      if (html && html.classList.contains('tauri-shell') && html.classList.contains('crozzo-form-desktop')) {
        return true;
      }
      if (global.__CROZZO_IS_TAURI__ && html && html.classList.contains('crozzo-form-desktop')) return true;
    } catch (_) {}
    return false;
  }

  function isLoginOpen() {
    try {
      if (document.body && document.body.classList.contains('crozzo-login-open')) return true;
      var ov = document.getElementById('loginOverlay');
      return !!(ov && !ov.hidden);
    } catch (_) {}
    return false;
  }

  function readCssVarPx(name, fallback) {
    try {
      var raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      var n = parseFloat(raw);
      return isFinite(n) && n > 0 ? n : fallback;
    } catch (_) {}
    return fallback;
  }

  function isSidebarExpandedOrHover() {
    try {
      var sb = document.getElementById('sidebar');
      if (!sb) return false;
      if (
        sb.classList.contains('expanded') ||
        sb.classList.contains('is-expanded') ||
        sb.classList.contains('crozzo-sidebar-hover-active')
      ) {
        return true;
      }
      if (document.documentElement.classList.contains('crozzo-sidebar-layout-expanded')) return true;
    } catch (_) {}
    return false;
  }

  function measureChromeBottom() {
    var bottom = 0;
    try {
      var shell = document.querySelector('main.main-content');
      if (!shell) return readCssVarPx('--crozzo-header-h', 60);
      var hdr = shell.querySelector('.main-header');
      if (hdr) bottom = Math.max(bottom, hdr.getBoundingClientRect().bottom);
      ['crozzo-global-stress', 'crozzo-update-normal-banner'].forEach(function (id) {
        var el = document.getElementById(id);
        if (!el || el.hidden || el.getAttribute('aria-hidden') === 'true') return;
        var r = el.getBoundingClientRect();
        if (r.height > 2) bottom = Math.max(bottom, r.bottom);
      });
    } catch (_) {}
    return Math.ceil(bottom || readCssVarPx('--crozzo-header-h', 60));
  }

  function measureSidebarWidth() {
    try {
      var sb = document.getElementById('sidebar');
      if (sb) {
        var r = sb.getBoundingClientRect();
        var w = Math.round(r.width);
        if (w > 0) return w;
      }
    } catch (_) {}
    return readCssVarPx('--sidebar-width-rail', 64);
  }

  function measureNotificationsHeight() {
    try {
      var container = document.getElementById('toastContainer');
      if (!container) return 0;
      var r = container.getBoundingClientRect();
      var h = Math.ceil(r.height);
      if (h > 2) return h + 12;
    } catch (_) {}
    return 0;
  }

  function createWebEmbedDock(cfg) {
    cfg = cfg || {};
    var PAGE_ID = cfg.pageId;
    var DEFAULT_URL = cfg.defaultUrl;
    var INVOKE_CMD = cfg.invokeCmd;
    var EMBED_HOST_ID = cfg.embedHostId;
    var PAGE_HEAD_ID = cfg.pageHeadId;
    var PAGE_CLASS = cfg.pageClass;
    var PAGE_BEFORE_KEY = cfg.pageBeforeKey;
    var TARGET_URL_KEY = cfg.targetUrlKey;
    var BRAND_TITLE = cfg.brandTitle || PAGE_ID;
    var BRAND_ICON = cfg.brandIconSvg || '';
    var LOADING_TEXT = cfg.loadingText || 'Cargando…';
    var ERROR_LABEL = cfg.errorLabel || 'No se pudo abrir';
    var LOG_TAG = cfg.logTag || '[web-embed]';
    var RELOAD_BTN_ID = cfg.reloadBtnId;
    var HIDE_BTN_ID = cfg.hideBtnId;
    var NAV_TAB = cfg.navTab || '';

    var _active = false;
    var _windowHooks = false;
    var _sidebarObs = null;
    var _sidebarResizeObs = null;
    var _toastObs = null;
    var _lastBoundsKey = '';
    var _lastShownBounds = null;
    var _layoutTimer = null;
    var _syncing = false;
    var _pendingSync = null;
    var _resizeSyncPending = false;
    var _uiOverlayObs = null;
    var _uiOverlayTimer = null;
    var _uiOverlayOpen = false;
    var _uiShowTimer = null;
    var _uiOverlayPoll = null;
    var _sidebarAnimating = false;
    var _sidebarAnimEndTimer = null;
    var _sidebarAnimInterval = null;
    var _sidebarAnimLastRect = null;

    function isPageActive() {
      return _active;
    }

    function applySlotCss() {
      var root = document.documentElement;
      var chromeBottom = measureChromeBottom();
      var notifH = measureNotificationsHeight();
      var notificationsOffset = notifH > 0 ? notifH + 12 : 0;
      var sidebarW = Math.max(measureSidebarWidth(), readCssVarPx('--sidebar-width-rail', 64));
      root.style.setProperty('--crozzo-wa-notifications-h', notificationsOffset + 'px');
      root.style.setProperty('--crozzo-wa-notifications-top', (chromeBottom + 12) + 'px');
      root.style.setProperty('--crozzo-wa-top', chromeBottom + 'px');
      root.style.setProperty('--crozzo-wa-left', sidebarW + 'px');
      root.classList.toggle('crozzo-wa-sidebar-open', isSidebarExpandedOrHover());
    }

    function measureHostSlot() {
      applySlotCss();
      var host = document.getElementById(EMBED_HOST_ID);
      if (!host) return null;
      var r = host.getBoundingClientRect();
      if (r.width >= 100 && r.height >= 100) {
        return {
          left: Math.round(r.left),
          top: Math.round(r.top),
          width: Math.round(r.width),
          height: Math.round(r.height),
        };
      }
      var shell = host.closest('.crozzo-wa-page__shell');
      if (shell) {
        var sr = shell.getBoundingClientRect();
        if (sr.width >= 100 && sr.height >= 100) {
          return {
            left: Math.round(sr.left),
            top: Math.round(sr.top),
            width: Math.round(sr.width),
            height: Math.round(sr.height),
          };
        }
      }
      var main = document.getElementById('mainContent');
      if (main) {
        var head = document.querySelector('.crozzo-wa-page__head');
        var headH = head ? head.getBoundingClientRect().height : 44;
        var mr = main.getBoundingClientRect();
        var top = mr.top + headH;
        var height = mr.height - headH;
        if (mr.width >= 100 && height >= 100) {
          return {
            left: Math.round(mr.left),
            top: Math.round(top),
            width: Math.round(mr.width),
            height: Math.round(height),
          };
        }
      }
      return null;
    }

    function boundsKey(m) {
      if (!m) return '';
      return [m.left, m.top, m.width, m.height].join(',');
    }

    function setPageShellClass(on) {
      try {
        if (document.body) document.body.classList.toggle(PAGE_CLASS, !!on);
        if (document.documentElement) document.documentElement.classList.toggle(PAGE_CLASS, !!on);
        if (document.body) document.body.classList.toggle('crozzo-page-web-embed', !!on);
        if (document.documentElement) document.documentElement.classList.toggle('crozzo-page-web-embed', !!on);
        if (!on && document.documentElement) {
          document.documentElement.classList.remove('crozzo-wa-sidebar-open');
        }
      } catch (_) {}
    }

    function invoke(cmd, args) {
      if (global.__TAURI__ && global.__TAURI__.core && typeof global.__TAURI__.core.invoke === 'function') {
        return global.__TAURI__.core.invoke(cmd, args || {});
      }
      return Promise.reject(new Error('Tauri no disponible'));
    }

    function syncRustMeasured(m, url, open, opts) {
      opts = opts || {};
      if (open !== false && (!isPageActive() || isLoginOpen())) return Promise.resolve(false);
      if (!m) return Promise.resolve(false);

      var key = boundsKey(m);
      var navigate = !!url;
      if (open !== false && !navigate && key === _lastBoundsKey) {
        return Promise.resolve(true);
      }

      _syncing = true;
      return invoke(INVOKE_CMD, {
        open: open !== false,
        left: m.left,
        top: m.top,
        width: m.width,
        height: m.height,
        url: navigate ? url : null,
      })
        .then(function () {
          if (open !== false) {
            _lastBoundsKey = key;
            setHostState('live');
          }
          return true;
        })
        .catch(function (err) {
          console.warn(LOG_TAG, err);
          if (open !== false && !opts.silent) setHostState('error', err);
          return false;
        })
        .finally(function () {
          _syncing = false;
          if (_pendingSync) {
            var p = _pendingSync;
            _pendingSync = null;
            runSync(p.url, p.open, p.opts);
          }
        });
    }

    function runSync(url, open, opts) {
      opts = opts || {};
      if (_syncing) {
        _pendingSync = { url: url, open: open, opts: opts };
        return Promise.resolve(false);
      }
      return Promise.resolve(measureHostSlot()).then(function (m) {
        return syncRustMeasured(m, url, open, opts);
      });
    }

    function setHostState(state, err) {
      var host = document.getElementById(EMBED_HOST_ID);
      if (!host) return;
      var loading = host.querySelector('.crozzo-wa-page__loading');
      var errEl = host.querySelector('.crozzo-wa-page__error');
      host.classList.remove('crozzo-wa-page__host--live', 'crozzo-wa-page__host--error');
      if (state === 'loading') {
        if (loading) loading.hidden = false;
        if (errEl) {
          errEl.hidden = true;
          errEl.textContent = '';
        }
        return;
      }
      if (loading) loading.hidden = true;
      if (state === 'error') {
        host.classList.add('crozzo-wa-page__host--error');
        if (errEl) {
          errEl.hidden = false;
          errEl.textContent =
            (err && err.message ? String(err.message) : ERROR_LABEL) +
            '. Cierre el POS por completo y ejecute: npm run tauri dev';
        }
        return;
      }
      host.classList.add('crozzo-wa-page__host--live');
      if (errEl) {
        errEl.hidden = true;
        errEl.textContent = '';
      }
    }

    function hideEmbedRustOnly() {
      var host = document.getElementById(EMBED_HOST_ID);
      if (host) {
        var r = host.getBoundingClientRect();
        if (r.width >= 100 && r.height >= 100) {
          _lastShownBounds = {
            left: Math.round(r.left),
            top: Math.round(r.top),
            width: Math.round(r.width),
            height: Math.round(r.height),
          };
        }
      }
      _lastBoundsKey = '';
      return invoke(INVOKE_CMD, {
        open: false,
        left: 0,
        top: 0,
        width: 0,
        height: 0,
        url: null,
      }).catch(function () {});
    }

    function showEmbedRustOnly() {
      if (!isPageActive()) return Promise.resolve(false);
      var m = _lastShownBounds;
      if (!m) {
        m = measureHostSlot();
      } else {
        applySlotCss();
      }
      if (!m) return Promise.resolve(false);
      return syncRustMeasured(m, null, true, { silent: true });
    }

    function hideEmbed() {
      setActive(false);
      setPageShellClass(false);
      return hideEmbedRustOnly();
    }

    function setActive(active) {
      _active = !!active;
      setPageShellClass(_active);
      if (_active) applySlotCss();
      if (typeof global.crozzoQuickAppsFabRefresh === 'function') {
        global.crozzoQuickAppsFabRefresh();
      }
      if (typeof global.crozzoMarkWebEmbedHeadNav === 'function') {
        global.crozzoMarkWebEmbedHeadNav(NAV_TAB);
      }
      if (_active) requestLayoutSync({ instant: true });
      if (!active) {
        _lastBoundsKey = '';
        unbindSidebarSync();
      }
    }

    function onSidebarTransitionStart() {
      if (!isPageActive()) return;
      if (_sidebarAnimating) return;
      _sidebarAnimating = true;
      if (_sidebarAnimEndTimer) {
        clearTimeout(_sidebarAnimEndTimer);
        _sidebarAnimEndTimer = null;
      }
      if (_sidebarAnimInterval) {
        clearInterval(_sidebarAnimInterval);
        _sidebarAnimInterval = null;
      }
      _sidebarAnimLastRect = null;
      _sidebarAnimInterval = global.setInterval(updateHostPositionDuringAnim, 50);
      updateHostPositionDuringAnim();
      _sidebarAnimEndTimer = global.setTimeout(function () {
        _sidebarAnimEndTimer = null;
        onSidebarTransitionEnd();
      }, 350);
    }

    function updateHostPositionDuringAnim() {
      var host = document.getElementById(EMBED_HOST_ID);
      if (!host) return;
      var r = host.getBoundingClientRect();
      if (r.width < 100 || r.height < 100) return;
      var key = [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join(',');
      if (_sidebarAnimLastRect === key) return;
      _sidebarAnimLastRect = key;
      invoke(INVOKE_CMD, {
        open: true,
        left: Math.round(r.left),
        top: Math.round(r.top),
        width: Math.round(r.width),
        height: Math.round(r.height),
        url: null,
      }).catch(function () {});
    }

    function onSidebarTransitionEnd() {
      if (!isPageActive()) return;
      _sidebarAnimating = false;
      if (_sidebarAnimEndTimer) {
        clearTimeout(_sidebarAnimEndTimer);
        _sidebarAnimEndTimer = null;
      }
      if (_sidebarAnimInterval) {
        clearInterval(_sidebarAnimInterval);
        _sidebarAnimInterval = null;
      }
      _sidebarAnimLastRect = null;
      if (hasOpenUiOverlay()) {
        if (!_uiOverlayOpen) syncDockVisibility();
        return;
      }
      _lastBoundsKey = '';
      runSync(null, true, { silent: true });
    }

    function requestLayoutSync(opts) {
      if (!isPageActive()) return;
      if (_sidebarAnimating) return;
      if (hasOpenUiOverlay()) {
        if (!_uiOverlayOpen) syncDockVisibility();
        return;
      }
      opts = opts || {};
      if (opts.instant) {
        if (_layoutTimer) {
          clearTimeout(_layoutTimer);
          _layoutTimer = null;
        }
        _lastBoundsKey = '';
        runSync(null, true, { silent: true });
        return;
      }
      if (_layoutTimer) clearTimeout(_layoutTimer);
      _layoutTimer = global.setTimeout(function () {
        _layoutTimer = null;
        runSync(null, true, { silent: true });
      }, 0);
    }

    function scheduleSync(url) {
      _lastBoundsKey = '';
      function attempt(n) {
        if (!isPageActive()) return;
        applySlotCss();
        var withUrl = n === 0 ? url || DEFAULT_URL : null;
        runSync(withUrl, true, { silent: n > 0 }).then(function (ok) {
          if (!ok && n < 12) {
            global.setTimeout(function () {
              attempt(n + 1);
            }, 50 + n * 35);
          } else if (!ok && n >= 12) {
            setHostState('error', new Error(ERROR_LABEL));
          }
        });
      }
      if (global.CrozzoViewportFit && typeof global.CrozzoViewportFit.schedule === 'function') {
        global.CrozzoViewportFit.schedule();
      }
      global.requestAnimationFrame(function () {
        attempt(0);
      });
    }

    function bindBannerResizeSync() {
      ['crozzo-global-stress', 'crozzo-update-normal-banner'].forEach(function (id) {
        var el = document.getElementById(id);
        if (!el || el.__crozzoWebEmbedBannerObs) return;
        el.__crozzoWebEmbedBannerObs = true;
        if (typeof MutationObserver === 'undefined') return;
        var mo = new MutationObserver(function () {
          if (isPageActive()) requestLayoutSync({ instant: true });
        });
        mo.observe(el, { attributes: true, attributeFilter: ['hidden', 'class', 'aria-hidden'] });
      });
    }

    function bindToastSync() {
      var container = document.getElementById('toastContainer');
      if (!container || container.__crozzoWebEmbedToastObs) return;
      container.__crozzoWebEmbedToastObs = true;
      if (typeof MutationObserver === 'undefined') return;
      _toastObs = new MutationObserver(function () {
        if (!isPageActive()) return;
        requestLayoutSync({ instant: true });
      });
      _toastObs.observe(container, { childList: true });
    }

    function bindSidebarResizeSync() {
      if (_sidebarResizeObs) return;
      var sb = document.getElementById('sidebar');
      if (!sb) return;
      if (typeof ResizeObserver === 'undefined') return;
      _sidebarResizeObs = new ResizeObserver(function () {
        if (!isPageActive()) return;
        if (_resizeSyncPending) return;
        _resizeSyncPending = true;
        global.setTimeout(function () {
          _resizeSyncPending = false;
          requestLayoutSync({ instant: true });
        }, 50);
      });
      _sidebarResizeObs.observe(sb);
    }

    function bindSidebarSync() {
      if (_sidebarObs) return;
      var sb = document.getElementById('sidebar');
      if (!sb) return;
      _sidebarObs = new MutationObserver(function () {
        if (!isPageActive()) return;
        if (!_sidebarAnimating) {
          onSidebarTransitionStart();
        }
      });
      _sidebarObs.observe(sb, { attributes: true, attributeFilter: ['class'] });
      if (document.documentElement) {
        _sidebarObs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      }
      function onTransition(e) {
        if (e && e.target !== sb) return;
        onSidebarTransitionEnd();
      }
      sb.addEventListener('transitionend', onTransition);
      sb.addEventListener('transitioncancel', onTransition);
    }

    function unbindSidebarSync() {
      if (_sidebarObs) {
        try {
          _sidebarObs.disconnect();
        } catch (_) {}
        _sidebarObs = null;
      }
      if (_sidebarResizeObs) {
        try {
          _sidebarResizeObs.disconnect();
        } catch (_) {}
        _sidebarResizeObs = null;
      }
      if (_toastObs) {
        try {
          _toastObs.disconnect();
        } catch (_) {}
        _toastObs = null;
      }
      if (_uiOverlayObs) {
        try {
          _uiOverlayObs.disconnect();
        } catch (_) {}
        _uiOverlayObs = null;
      }
    }

    function hasOpenUiOverlay() {
      try {
        if (isLoginOpen()) return true;
        if (document.querySelector('.user-menu__dropdown.is-open, .user-menu__dropdown:not([aria-hidden="true"])')) return true;
        if (document.querySelector('.crozzo-a11y-panel[open], .crozzo-header-popover, .crozzo-header-popover[open], details[open] .crozzo-header-popover')) return true;
        if (document.querySelector('.modal-overlay.active, .modal.show, .modal.is-open, .crozzo-modal-open, .crozzo-overlay-visible')) return true;
        if (document.querySelector('.sidebar-backdrop.active, .crozzo-sidebar-drawer-open, .sidebar.open, .sidebar.is-open')) return true;
        if (document.querySelector('.dropdown-menu.show, .dropdown.open, .dropdown.is-active, .dropdown.is-open')) return true;
        if (document.querySelector('.login-overlay:not([hidden])')) return true;
        if (document.querySelector('.toast.toast--persistent, .crozzo-toast-stack--blocking')) return true;
      } catch (_) {}
      return false;
    }

    function syncDockVisibility() {
      if (!isPageActive()) return;
      if (_sidebarAnimating) return;
      var hasOverlay = hasOpenUiOverlay();
      if (hasOverlay) {
        if (_uiShowTimer) {
          clearTimeout(_uiShowTimer);
          _uiShowTimer = null;
        }
        if (!_uiOverlayOpen) {
          _uiOverlayOpen = true;
          hideEmbedRustOnly();
        }
      } else if (_uiOverlayOpen && !_uiShowTimer) {
        _uiShowTimer = global.setTimeout(function () {
          _uiShowTimer = null;
          if (!hasOpenUiOverlay()) {
            _uiOverlayOpen = false;
            showEmbedRustOnly();
          }
        }, 300);
      }
    }

    function startUiOverlayPolling() {
      if (_uiOverlayPoll) return;
      _uiOverlayPoll = global.setInterval(function () {
        if (!isPageActive()) return;
        syncDockVisibility();
      }, 120);
    }

    function stopUiOverlayPolling() {
      if (_uiOverlayPoll) {
        global.clearInterval(_uiOverlayPoll);
        _uiOverlayPoll = null;
      }
    }

    function bindUiOverlaySync() {
      if (_uiOverlayObs) return;
      if (typeof MutationObserver === 'undefined') return;
      _uiOverlayObs = new MutationObserver(function () {
        if (!isPageActive()) return;
        if (_uiOverlayTimer) return;
        _uiOverlayTimer = global.setTimeout(function () {
          _uiOverlayTimer = null;
          syncDockVisibility();
        }, 50);
      });
      _uiOverlayObs.observe(document.body, {
        attributes: true,
        childList: true,
        subtree: true,
        attributeFilter: ['class', 'aria-hidden', 'open', 'hidden'],
      });
      if (document.documentElement) {
        _uiOverlayObs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      }
      startUiOverlayPolling();
    }

    function bindTauriWindowHooks() {
      if (_windowHooks || !isDesktopPc()) return;
      _windowHooks = true;
      try {
        var tw = global.__TAURI__ && global.__TAURI__.window;
        if (!tw || typeof tw.getCurrentWindow !== 'function') return;
        var win = tw.getCurrentWindow();
        if (!win || typeof win.listen !== 'function') return;
        win.listen('tauri://resize', function () {
          requestLayoutSync();
        });
        win.listen('tauri://move', function () {
          requestLayoutSync();
        });
      } catch (_) {}
    }

    function closeOtherEmbeds() {
      if (PAGE_ID !== 'whatsapp-web' && typeof global.crozzoWhatsAppDockIsOpen === 'function' && global.crozzoWhatsAppDockIsOpen()) {
        if (typeof global.crozzoWhatsAppDockHideEmbed === 'function') global.crozzoWhatsAppDockHideEmbed();
      }
      if (PAGE_ID !== 'gmail-web' && typeof global.crozzoGmailDockIsOpen === 'function' && global.crozzoGmailDockIsOpen()) {
        if (typeof global.crozzoGmailDockHideEmbed === 'function') global.crozzoGmailDockHideEmbed();
      }
      if (PAGE_ID !== 'drive-web' && typeof global.crozzoDriveDockIsOpen === 'function' && global.crozzoDriveDockIsOpen()) {
        if (typeof global.crozzoDriveDockHideEmbed === 'function') global.crozzoDriveDockHideEmbed();
      }
    }

    function openDock(url) {
      if (!isDesktopPc()) return Promise.resolve(false);
      if (isLoginOpen()) return Promise.resolve(false);
      url = url || DEFAULT_URL;
      global[TARGET_URL_KEY] = url;
      closeOtherEmbeds();
      if (isPageActive()) {
        scheduleSync(url);
        return Promise.resolve(true);
      }
      var prev =
        typeof global.crozzoGetActivePageId === 'function'
          ? global.crozzoGetActivePageId()
          : global[PAGE_BEFORE_KEY];
      if (prev && prev !== PAGE_ID) global[PAGE_BEFORE_KEY] = prev;
      else if (!global[PAGE_BEFORE_KEY]) global[PAGE_BEFORE_KEY] = 'inicio-operacion';
      if (typeof global.navigateTo === 'function') global.navigateTo(PAGE_ID);
      else if (typeof global.renderPage === 'function') global.renderPage(PAGE_ID);
      return Promise.resolve(true);
    }

    function closeDock() {
      if (!isPageActive()) return Promise.resolve(true);
      var back =
        typeof global.crozzoDefaultHomePage === 'function'
          ? global.crozzoDefaultHomePage() || 'inicio-operacion'
          : 'inicio-operacion';
      return hideEmbed().then(function () {
        if (typeof global.navigateTo === 'function') global.navigateTo(back);
        else if (typeof global.renderPage === 'function') global.renderPage(back);
        return true;
      });
    }

    function renderPage() {
      var navHtml =
        typeof global.crozzoWebEmbedHeadNavHtml === 'function' ? global.crozzoWebEmbedHeadNavHtml(NAV_TAB) : '';
      return (
        '<div class="crozzo-wa-page">' +
        '<div class="crozzo-wa-page__head crozzo-wa-page__head--with-tabs" id="' +
        PAGE_HEAD_ID +
        '">' +
        '<div class="crozzo-wa-page__brand">' +
        '<span class="crozzo-wa-page__brand-icon" aria-hidden="true">' +
        BRAND_ICON +
        '</span>' +
        '<span class="crozzo-wa-page__brand-title">' +
        BRAND_TITLE +
        '</span>' +
        '</div>' +
        navHtml +
        '<div class="crozzo-wa-page__actions">' +
        '<button type="button" class="crozzo-wa-page__btn" id="' +
        RELOAD_BTN_ID +
        '" title="Recargar" aria-label="Recargar">' +
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>' +
        '</button>' +
        '<button type="button" class="crozzo-wa-page__btn" id="' +
        HIDE_BTN_ID +
        '" title="Ocultar panel" aria-label="Ocultar panel">' +
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h6v6H4z"/><path d="M4 4h6v6H4z"/><path d="M14 4h6v6h-6z"/><path d="M14 14h6v6h-6z"/></svg>' +
        '</button>' +
        '</div>' +
        '</div>' +
        '<div class="crozzo-wa-page__shell">' +
        '<div id="' +
        EMBED_HOST_ID +
        '" class="crozzo-wa-page__host" aria-label="' +
        BRAND_TITLE +
        '">' +
        '<div class="crozzo-wa-page__loading">' +
        '<span class="crozzo-wa-page__spinner" aria-hidden="true"></span>' +
        '<p>' +
        LOADING_TEXT +
        '</p>' +
        '</div>' +
        '<p class="crozzo-wa-page__error form-hint" hidden></p>' +
        '</div></div></div>'
      );
    }

    function initPage() {
      setActive(true);
      setHostState('loading');
      bindTauriWindowHooks();
      bindBannerResizeSync();
      bindSidebarSync();
      bindSidebarResizeSync();
      bindToastSync();
      bindUiOverlaySync();
      bindPageHeadButtons();
      if (typeof global.crozzoBindWebEmbedHeadNav === 'function') global.crozzoBindWebEmbedHeadNav(NAV_TAB);
      applySlotCss();
      requestLayoutSync({ instant: true });
      scheduleSync(global[TARGET_URL_KEY] || DEFAULT_URL);
    }

    function bindPageHeadButtons() {
      var head = document.getElementById(PAGE_HEAD_ID);
      if (!head || head._crozzoWebEmbedHeadBound) return;
      head._crozzoWebEmbedHeadBound = true;
      var reloadBtn = document.getElementById(RELOAD_BTN_ID);
      if (reloadBtn) {
        reloadBtn.addEventListener('click', function () {
          scheduleSync(global[TARGET_URL_KEY] || DEFAULT_URL);
        });
      }
      var hideBtn = document.getElementById(HIDE_BTN_ID);
      if (hideBtn) {
        hideBtn.addEventListener('click', function () {
          if (_uiOverlayOpen) {
            _uiOverlayOpen = false;
            showEmbedRustOnly();
          } else {
            _uiOverlayOpen = true;
            hideEmbedRustOnly();
          }
        });
      }
    }

    return {
      pageId: PAGE_ID,
      isDesktopPc: isDesktopPc,
      isOpen: isPageActive,
      hideEmbed: hideEmbed,
      openDock: openDock,
      closeDock: closeDock,
      requestLayoutSync: requestLayoutSync,
      renderPage: renderPage,
      initPage: initPage,
    };
  }

  global.CrozzoWebEmbedDockCore = { create: createWebEmbedDock, isDesktopPc: isDesktopPc };
})(typeof window !== 'undefined' ? window : global);
