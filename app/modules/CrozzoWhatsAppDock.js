/**
 * WhatsApp Web — PC Tauri.
 * Slot fijo CSS (#crozzoWaEmbedHost) + ventana nativa alineada a ese rectángulo.
 */
(function (global) {
  'use strict';

  var DEFAULT_URL = 'https://web.whatsapp.com/';
  var PAGE_ID = 'whatsapp-web';
  var _waActive = false;
  var _inited = false;
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

  function isWaPageActive() {
    return _waActive;
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

  /** Actualiza variables CSS del layout de WhatsApp. El panel ahora fluye con flexbox,
   *  por lo que solo necesitamos desplazarlo hacia abajo cuando hay notificaciones para
   *  dejarlas visibles. El ancho viene del margin-left de .main-content, que se ajusta
   *  automáticamente al expandir/contraer el sidebar.
   */
  function applyWaSlotCss() {
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
    applyWaSlotCss();
    var host = document.getElementById('crozzoWaEmbedHost');
    if (!host) return null;
    var r = host.getBoundingClientRect();
    if (r.width >= 100 && r.height >= 100) {
      return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
    }
    var shell = host.closest('.crozzo-wa-page__shell');
    if (shell) {
      var sr = shell.getBoundingClientRect();
      if (sr.width >= 100 && sr.height >= 100) {
        return { left: Math.round(sr.left), top: Math.round(sr.top), width: Math.round(sr.width), height: Math.round(sr.height) };
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
        return { left: Math.round(mr.left), top: Math.round(top), width: Math.round(mr.width), height: Math.round(height) };
      }
    }
    return null;
  }

  function boundsKey(m) {
    if (!m) return '';
    return [m.left, m.top, m.width, m.height].join(',');
  }

  function setWaPageShellClass(on) {
    try {
      if (document.body) document.body.classList.toggle('crozzo-page-whatsapp-web', !!on);
      if (document.documentElement) document.documentElement.classList.toggle('crozzo-page-whatsapp-web', !!on);
      if (document.body) document.body.classList.toggle('crozzo-page-web-embed', !!on);
      if (document.documentElement) document.documentElement.classList.toggle('crozzo-page-web-embed', !!on);
      if (!on && document.documentElement) {
        document.documentElement.classList.remove('crozzo-wa-sidebar-open');
      }
    } catch (_) {}
  }

  function ensureDockHiddenUnlessActive() {
    if (!isWaPageActive()) hideEmbedRustOnly();
  }

  function hookLoginLifecycle() {
    if (global.__crozzoWaLoginHooked) return;
    global.__crozzoWaLoginHooked = true;
    if (typeof global.showLoginOverlay === 'function') {
      var origShow = global.showLoginOverlay;
      global.showLoginOverlay = function () {
        hideEmbedRustOnly();
        setWaActive(false);
        return origShow.apply(this, arguments);
      };
    }
    if (typeof global.hideLoginOverlay === 'function') {
      var origHide = global.hideLoginOverlay;
      global.hideLoginOverlay = function () {
        var r = origHide.apply(this, arguments);
        ensureDockHiddenUnlessActive();
        updateFabVisibility();
        return r;
      };
    }
  }

  function setWaActive(active) {
    _waActive = !!active;
    setWaPageShellClass(_waActive);
    if (_waActive) applyWaSlotCss();
    setFabMode(_waActive);
    updateFabVisibility();
    if (typeof global.crozzoQuickAppsFabRefresh === 'function') global.crozzoQuickAppsFabRefresh();
    if (typeof global.crozzoMarkWebEmbedHeadNav === 'function') global.crozzoMarkWebEmbedHeadNav('wa');
    if (_waActive) requestLayoutSync({ instant: true });
    if (!active) {
      _lastBoundsKey = '';
      unbindSidebarSync();
    }
  }

  function invoke(cmd, args) {
    if (global.__TAURI__ && global.__TAURI__.core && typeof global.__TAURI__.core.invoke === 'function') {
      return global.__TAURI__.core.invoke(cmd, args || {});
    }
    return Promise.reject(new Error('Tauri no disponible'));
  }

  function syncRustMeasured(m, url, open, opts) {
    opts = opts || {};
    if (open !== false && (!isWaPageActive() || isLoginOpen())) return Promise.resolve(false);
    if (!m) return Promise.resolve(false);

    var key = boundsKey(m);
    var navigate = !!url;
    if (open !== false && !navigate && key === _lastBoundsKey) {
      return Promise.resolve(true);
    }

    _syncing = true;
    return invoke('crozzo_whatsapp_dock_sync', {
      open: open !== false,
      left: m.left,
      top: m.top,
      width: m.width,
      height: m.height,
      url: navigate ? url : null,
    })
      .then(function (res) {
        if (open !== false) {
          _lastBoundsKey = key;
          setHostState('live');
          try {
            if (document.body) {
              document.body.setAttribute('data-crozzo-wa-dock', 'live');
              document.body.setAttribute('data-crozzo-wa-layout', String(res || key));
            }
          } catch (_) {}
        }
        return true;
      })
      .catch(function (err) {
        console.warn('[wa-page]', err);
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
    var host = document.getElementById('crozzoWaEmbedHost');
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
          (err && err.message ? String(err.message) : 'No se pudo abrir WhatsApp Web') +
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
    var host = document.getElementById('crozzoWaEmbedHost');
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
    return invoke('crozzo_whatsapp_dock_sync', {
      open: false,
      left: 0,
      top: 0,
      width: 0,
      height: 0,
      url: null,
    }).catch(function () {});
  }

  function showEmbedRustOnly() {
    if (!isWaPageActive()) return Promise.resolve(false);
    var m = _lastShownBounds;
    if (!m) {
      m = measureHostSlot();
    } else {
      applyWaSlotCss();
    }
    if (!m) return Promise.resolve(false);
    return syncRustMeasured(m, null, true, { silent: true });
  }

  function hideEmbed() {
    setWaActive(false);
    setWaPageShellClass(false);
    return hideEmbedRustOnly();
  }

  function onSidebarTransitionStart() {
    if (!isWaPageActive()) return;
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
    // Mueve el panel nativo cada 50 ms durante la transición sin ocultarlo.
    _sidebarAnimInterval = global.setInterval(updateHostPositionDuringAnim, 50);
    updateHostPositionDuringAnim();
    // Fallback de seguridad: si el navegador no emite transitionend, forzar la
    // finalizacion al tiempo maximo de la transicion del sidebar.
    _sidebarAnimEndTimer = global.setTimeout(function () {
      _sidebarAnimEndTimer = null;
      onSidebarTransitionEnd();
    }, 350);
  }

  function updateHostPositionDuringAnim() {
    var host = document.getElementById('crozzoWaEmbedHost');
    if (!host) return;
    var r = host.getBoundingClientRect();
    if (r.width < 100 || r.height < 100) return;
    var key = [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join(',');
    if (_sidebarAnimLastRect === key) return;
    _sidebarAnimLastRect = key;
    invoke('crozzo_whatsapp_dock_sync', {
      open: true,
      left: Math.round(r.left),
      top: Math.round(r.top),
      width: Math.round(r.width),
      height: Math.round(r.height),
      url: null,
    }).catch(function () {});
  }

  function onSidebarTransitionEnd() {
    if (!isWaPageActive()) return;
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
    // Sincroniza exactamente al final de la transición CSS del sidebar,
    // eliminando cualquier desfase visual milimétrico.
    if (hasOpenUiOverlay()) {
      if (!_uiOverlayOpen) syncDockVisibility();
      return;
    }
    _lastBoundsKey = '';
    runSync(null, true, { silent: true });
  }

  function requestLayoutSync(opts) {
    if (!isWaPageActive()) return;
    if (_sidebarAnimating) return;
    if (hasOpenUiOverlay()) {
      // Si un menú/sidebar está abierto, no resucitemos el panel; se restaurará al cerrar.
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
      if (!isWaPageActive()) return;
      applyWaSlotCss();
      var withUrl = n === 0 ? url || DEFAULT_URL : null;
      runSync(withUrl, true, { silent: n > 0 }).then(function (ok) {
        if (!ok && n < 12) {
          global.setTimeout(function () {
            attempt(n + 1);
          }, 50 + n * 35);
        } else if (!ok && n >= 12) {
          setHostState('error', new Error('No se pudo alinear WhatsApp Web'));
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
      if (!el || el.__crozzoWaBannerObs) return;
      el.__crozzoWaBannerObs = true;
      if (typeof MutationObserver === 'undefined') return;
      var mo = new MutationObserver(function () {
        if (isWaPageActive()) requestLayoutSync({ instant: true });
      });
      mo.observe(el, { attributes: true, attributeFilter: ['hidden', 'class', 'aria-hidden'] });
    });
  }

  function bindToastSync() {
    var container = document.getElementById('toastContainer');
    if (!container || container.__crozzoWaToastObs) return;
    container.__crozzoWaToastObs = true;
    if (typeof MutationObserver === 'undefined') return;
    _toastObs = new MutationObserver(function () {
      if (!isWaPageActive()) return;
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
      if (!isWaPageActive()) return;
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
      if (!isWaPageActive()) return;
      if (!_sidebarAnimating) {
        onSidebarTransitionStart();
      }
    });
    _sidebarObs.observe(sb, { attributes: true, attributeFilter: ['class'] });
    if (document.documentElement) {
      _sidebarObs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    }
    // Alineación perfecta: re-sincronizar cuando la transición del sidebar termine.
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
    var container = document.getElementById('toastContainer');
    if (container) container.__crozzoWaToastObs = false;
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
    if (!isWaPageActive()) return;
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
      if (!isWaPageActive()) return;
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
      if (!isWaPageActive()) return;
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
    if (typeof global.crozzoGmailDockHideEmbed === 'function') {
      if (typeof global.crozzoGmailDockIsOpen === 'function' && global.crozzoGmailDockIsOpen()) {
        global.crozzoGmailDockHideEmbed();
      }
    }
    if (typeof global.crozzoDriveDockHideEmbed === 'function') {
      if (typeof global.crozzoDriveDockIsOpen === 'function' && global.crozzoDriveDockIsOpen()) {
        global.crozzoDriveDockHideEmbed();
      }
    }
  }

  function openDock(url) {
    if (!isDesktopPc()) return Promise.resolve(false);
    if (isLoginOpen()) return Promise.resolve(false);
    url = url || DEFAULT_URL;
    global.__crozzoWaTargetUrl = url;
    closeOtherEmbeds();
    if (isWaPageActive()) {
      scheduleSync(url);
      return Promise.resolve(true);
    }
    var prev =
      typeof global.crozzoGetActivePageId === 'function'
        ? global.crozzoGetActivePageId()
        : global.__crozzoPageBeforeWhatsApp;
    if (prev && prev !== PAGE_ID) global.__crozzoPageBeforeWhatsApp = prev;
    else if (!global.__crozzoPageBeforeWhatsApp) global.__crozzoPageBeforeWhatsApp = 'inicio-operacion';
    if (typeof global.navigateTo === 'function') global.navigateTo(PAGE_ID);
    else if (typeof global.renderPage === 'function') global.renderPage(PAGE_ID);
    return Promise.resolve(true);
  }

  function closeDock() {
    if (!isWaPageActive()) return Promise.resolve(true);
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

  function renderWhatsAppWebPage() {
    var navHtml =
      typeof global.crozzoWebEmbedHeadNavHtml === 'function' ? global.crozzoWebEmbedHeadNavHtml('wa') : '';
    return (
      '<div class="crozzo-wa-page">' +
      '<div class="crozzo-wa-page__head crozzo-wa-page__head--with-tabs" id="crozzoWaPageHead">' +
      '<div class="crozzo-wa-page__brand">' +
      '<span class="crozzo-wa-page__brand-icon" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>' +
      '</span>' +
      '<span class="crozzo-wa-page__brand-title">WhatsApp · BONA origen</span>' +
      '</div>' +
      navHtml +
      '<div class="crozzo-wa-page__actions">' +
      '<button type="button" class="crozzo-wa-page__btn" id="crozzoWaPageReload" title="Recargar" aria-label="Recargar WhatsApp">' +
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>' +
      '</button>' +
      '<button type="button" class="crozzo-wa-page__btn" id="crozzoWaPageHide" title="Ocultar panel" aria-label="Ocultar panel de WhatsApp">' +
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h6v6H4z"/><path d="M4 4h6v6H4z"/><path d="M14 4h6v6h-6z"/><path d="M14 14h6v6h-6z"/></svg>' +
      '</button>' +
      '</div>' +
      '</div>' +
      '<div class="crozzo-wa-page__shell" id="crozzoWaPageShell">' +
      '<div id="crozzoWaEmbedHost" class="crozzo-wa-page__host" aria-label="WhatsApp Web">' +
      '<div class="crozzo-wa-page__loading">' +
      '<span class="crozzo-wa-page__spinner" aria-hidden="true"></span>' +
      '<p>Cargando WhatsApp Web…</p>' +
      '</div>' +
      '<p class="crozzo-wa-page__error form-hint" hidden></p>' +
      '</div></div></div>'
    );
  }

  function initWhatsAppWebPage() {
    setWaActive(true);
    setHostState('loading');
    bindTauriWindowHooks();
    bindBannerResizeSync();
    bindSidebarSync();
    bindSidebarResizeSync();
    bindToastSync();
    bindUiOverlaySync();
    bindPageHeadButtons();
    if (typeof global.crozzoBindWebEmbedHeadNav === 'function') global.crozzoBindWebEmbedHeadNav('wa');
    applyWaSlotCss();
    requestLayoutSync({ instant: true });
    scheduleSync(global.__crozzoWaTargetUrl || DEFAULT_URL);
  }

  function bindPageHeadButtons() {
    var head = document.getElementById('crozzoWaPageHead');
    if (!head || head._crozzoWaHeadBound) return;
    head._crozzoWaHeadBound = true;
    var reloadBtn = document.getElementById('crozzoWaPageReload');
    if (reloadBtn) {
      reloadBtn.addEventListener('click', function () {
        scheduleSync(global.__crozzoWaTargetUrl || DEFAULT_URL);
      });
    }
    var hideBtn = document.getElementById('crozzoWaPageHide');
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

  function updateFabVisibility() {
    if (typeof global.crozzoQuickAppsFabRefresh === 'function') {
      global.crozzoQuickAppsFabRefresh();
      return;
    }
    var stack = document.getElementById('crozzoWaFabStack');
    if (!stack) return;
    var show = isDesktopPc();
    try {
      if (document.body && document.body.classList.contains('crozzo-login-open')) show = false;
    } catch (_) {}
    if (show) {
      stack.removeAttribute('hidden');
      stack.setAttribute('aria-hidden', 'false');
    } else {
      stack.setAttribute('hidden', '');
      stack.setAttribute('aria-hidden', 'true');
    }
    setFabMode(isWaPageActive());
  }

  function setFabMode(waActive) {
    if (typeof global.crozzoQuickAppsFabRefresh === 'function') {
      global.crozzoQuickAppsFabRefresh();
      return;
    }
    var stack = document.getElementById('crozzoWaFabStack');
    if (stack) stack.classList.toggle('crozzo-wa-fab-stack--active', !!waActive);
  }

  function initChrome() {
    if (!isDesktopPc()) return;
    hookLoginLifecycle();
    ensureDockHiddenUnlessActive();
    if (!_inited) {
      _inited = true;
      global.addEventListener('resize', function () {
        requestLayoutSync();
      });
      bindTauriWindowHooks();
      bindBannerResizeSync();
      bindSidebarResizeSync();
      bindToastSync();
      bindUiOverlaySync();
    }
    if (typeof global.crozzoQuickAppsFabInit === 'function') global.crozzoQuickAppsFabInit();
    updateFabVisibility();
  }

  function openWithShare(text, waDigits) {
    text = String(text || '');
    var enc = encodeURIComponent(text);
    var url = waDigits
      ? 'https://web.whatsapp.com/send?phone=' + waDigits + '&text=' + enc
      : 'https://web.whatsapp.com/send?text=' + enc;
    var copyP =
      typeof global.crozzoCopyTextQuiet === 'function'
        ? global.crozzoCopyTextQuiet(text)
        : Promise.resolve(false);
    return copyP.then(function () {
      return openDock(url);
    });
  }

  global.crozzoRenderWhatsAppWebPage = renderWhatsAppWebPage;
  global.crozzoInitWhatsAppWebPage = initWhatsAppWebPage;
  global.crozzoWhatsAppDockHideEmbed = hideEmbed;
  global.crozzoWhatsAppDockOpen = openDock;
  global.crozzoWhatsAppDockClose = closeDock;
  global.crozzoWhatsAppDockOpenShare = openWithShare;
  global.crozzoWhatsAppDockCanUse = isDesktopPc;
  global.crozzoWhatsAppDockIsOpen = isWaPageActive;
  global.crozzoWhatsAppDockRequestLayoutSync = requestLayoutSync;
  global.crozzoWhatsAppDockRefreshChrome = initChrome;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChrome);
  } else {
    initChrome();
  }
})(typeof window !== 'undefined' ? window : global);
