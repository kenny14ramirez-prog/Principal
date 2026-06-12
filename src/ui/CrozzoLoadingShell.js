/**
 * Pantallas de carga ligeras — boot, módulos lazy y render pesado.
 * Evita sensación de app congelada sin bloquear toda la UI.
 */
(function (global) {
  'use strict';

  var pageToken = 0;
  var pageTimer = null;
  var bootHidden = false;
  var topBarActive = false;
  var SHOW_DELAY_MS = 130;
  var HEAVY_PAGES = {
    'costos-matriz': 1,
    'sistema-costos': 1,
    'centro-procesos': 1,
    'centro-compras': 1,
    'compras-recepcion': 1,
    'inventarios': 1,
    'recepcion-facturas': 1,
    'planilla-2026': 1,
    'pedidos-internos': 1,
    'costos-federacion': 1,
    'costos-reservorio': 1,
    'super-admin-federacion': 1,
    'compras-recetario-cocina': 1,
  };

  var PAGE_LABELS = {
    'costos-matriz': 'Matriz de costos',
    'centro-procesos': 'Centro de procesos',
    'centro-compras': 'Centro de compras',
    'compras-recepcion': 'Recepción de facturas',
    'inventarios': 'Reportes e inventario',
    'planilla-2026': 'Planilla',
    'pedidos-internos': 'Pedidos internos',
    'costos-federacion': 'Federación de bodegas',
    'compras-recetario-cocina': 'Recetario de cocina',
    'cajero': 'Punto de venta',
    'comandas': 'Comandas',
    'tablets': 'Tablets',
  };

  function appName() {
    try {
      if (typeof global.crozzoAppDisplayName === 'function') return global.crozzoAppDisplayName();
      if (global.CROZZO_APP_DISPLAY_NAME) return String(global.CROZZO_APP_DISPLAY_NAME);
    } catch (_) {}
    return 'BONA origen';
  }

  function labelForPage(page) {
    var p = String(page || '').trim();
    return PAGE_LABELS[p] || 'Módulo';
  }

  function isHeavyPage(page) {
    return !!HEAVY_PAGES[String(page || '').trim()];
  }

  function ensureTopBar() {
    var wrap = document.querySelector('.main-wrapper');
    if (!wrap) return null;
    var bar = document.getElementById('crozzo-load-topbar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'crozzo-load-topbar';
      bar.className = 'crozzo-load-topbar';
      bar.setAttribute('role', 'progressbar');
      bar.setAttribute('aria-hidden', 'true');
      bar.innerHTML = '<span class="crozzo-load-topbar__track"><span class="crozzo-load-topbar__fill"></span></span>';
      wrap.insertBefore(bar, wrap.firstChild);
    }
    return bar;
  }

  function startTopBar() {
    if (topBarActive) return;
    topBarActive = true;
    var bar = ensureTopBar();
    if (bar) {
      bar.classList.add('is-active');
      bar.setAttribute('aria-hidden', 'false');
    }
    document.documentElement.classList.add('crozzo-load-topbar-active');
  }

  function stopTopBar() {
    topBarActive = false;
    var bar = document.getElementById('crozzo-load-topbar');
    if (bar) {
      bar.classList.remove('is-active');
      bar.setAttribute('aria-hidden', 'true');
    }
    document.documentElement.classList.remove('crozzo-load-topbar-active');
  }

  function skeletonMarkup(title, hint, phase) {
    var phaseHint =
      phase === 'modules'
        ? 'Descargando scripts del módulo…'
        : phase === 'boot'
          ? 'Preparando recursos de la aplicación…'
          : hint || 'Organizando pantalla…';
    return (
      '<div class="crozzo-page-load" role="status" aria-live="polite" aria-busy="true">' +
      '<div class="crozzo-page-load__head">' +
      '<div class="crozzo-skeleton-block crozzo-page-load__title-bar"></div>' +
      '<p class="crozzo-page-load__label">' +
      esc(title) +
      '</p>' +
      '<p class="crozzo-page-load__hint">' +
      esc(phaseHint) +
      '</p>' +
      '</div>' +
      '<div class="crozzo-page-load__grid">' +
      '<div class="crozzo-page-load__card"><div class="crozzo-skeleton-block crozzo-page-load__line crozzo-page-load__line--lg"></div><div class="crozzo-skeleton-block crozzo-page-load__line"></div><div class="crozzo-skeleton-block crozzo-page-load__line crozzo-page-load__line--sm"></div></div>' +
      '<div class="crozzo-page-load__card"><div class="crozzo-skeleton-block crozzo-page-load__line crozzo-page-load__line--lg"></div><div class="crozzo-skeleton-block crozzo-page-load__line"></div><div class="crozzo-skeleton-block crozzo-page-load__line crozzo-page-load__line--sm"></div></div>' +
      '<div class="crozzo-page-load__card crozzo-page-load__card--wide"><div class="crozzo-skeleton-block crozzo-page-load__line crozzo-page-load__line--lg"></div><div class="crozzo-skeleton-block crozzo-page-load__line"></div><div class="crozzo-skeleton-block crozzo-page-load__line"></div><div class="crozzo-skeleton-block crozzo-page-load__line crozzo-page-load__line--sm"></div></div>' +
      '</div>' +
      '</div>'
    );
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function paintPageSkeleton(page, phase, instant) {
    var mc = document.getElementById('mainContent');
    if (!mc) return;
    mc.setAttribute('data-crozzo-loading', '1');
    mc.classList.add('crozzo-page-load-host');
    mc.innerHTML = skeletonMarkup(labelForPage(page), 'Cargando recursos…', phase);
    document.documentElement.classList.add('crozzo-page-loading-active');
    startTopBar();
    if (!instant) return;
    mc.classList.add('crozzo-page-load-host--in');
  }

  function showPageLoading(page, options) {
    options = options || {};
    var phase = options.phase || 'render';
    var instant = !!options.instant || phase === 'modules';
    pageToken += 1;
    var token = pageToken;
    clearTimeout(pageTimer);
    var delay = instant ? 0 : SHOW_DELAY_MS;
    pageTimer = setTimeout(function () {
      if (token !== pageToken) return;
      paintPageSkeleton(page, phase, true);
    }, delay);
  }

  function hidePageLoading() {
    pageToken += 1;
    clearTimeout(pageTimer);
    document.documentElement.classList.remove('crozzo-page-loading-active');
    stopTopBar();
    var mc = document.getElementById('mainContent');
    if (mc) {
      mc.removeAttribute('data-crozzo-loading');
      mc.classList.remove('crozzo-page-load-host', 'crozzo-page-load-host--in');
    }
  }

  function maybeShowRenderLoading(page) {
    if (!isHeavyPage(page)) return;
    showPageLoading(page, { phase: 'render', instant: false });
  }

  function ensureBootShell() {
    var el = document.getElementById('crozzo-boot-shell');
    if (el) return el;
    if (!document.body) return null;
    el = document.createElement('div');
    el.id = 'crozzo-boot-shell';
    el.className = 'crozzo-boot-shell';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-busy', 'true');
    el.innerHTML =
      '<div class="crozzo-boot-shell__card crozzo-boot-shell__card--premium">' +
      '<div class="crozzo-boot-shell__logo" aria-hidden="true">' +
      '<svg width="48" height="48" viewBox="0 0 64 64">' +
      '<circle cx="32" cy="32" r="30" fill="none" stroke="#B59A6D" stroke-width="1" stroke-dasharray="3 4" opacity=".55"/>' +
      '<circle cx="32" cy="32" r="22" fill="none" stroke="#2D2D2D" stroke-width=".8" opacity=".35"/>' +
      '<line x1="32" y1="32" x2="32" y2="10" stroke="#2D2D2D" stroke-width="1"/>' +
      '<line x1="32" y1="32" x2="52" y2="32" stroke="#B59A6D" stroke-width="1"/>' +
      '<line x1="32" y1="32" x2="32" y2="54" stroke="#2D2D2D" stroke-width="1"/>' +
      '<line x1="32" y1="32" x2="12" y2="32" stroke="#B59A6D" stroke-width="1"/>' +
      '<circle cx="32" cy="32" r="3.5" fill="#2D2D2D"/></svg></div>' +
      '<div class="crozzo-boot-shell__brand">' +
      esc(appName()) +
      '</div>' +
      '<div class="crozzo-boot-shell__pulse" aria-hidden="true"></div>' +
      '<h2 class="crozzo-boot-shell__title">Iniciando su sistema</h2>' +
      '<p class="crozzo-boot-shell__msg" id="crozzoBootShellMsg">Verificando recursos locales…</p>' +
      '<div class="crozzo-boot-shell__progress" aria-hidden="true"><span class="crozzo-boot-shell__progress-fill"></span></div>' +
      '<div class="crozzo-boot-shell__skeleton">' +
      '<div class="crozzo-skeleton-block crozzo-boot-shell__sk"></div>' +
      '<div class="crozzo-skeleton-block crozzo-boot-shell__sk crozzo-boot-shell__sk--md"></div>' +
      '<div class="crozzo-skeleton-block crozzo-boot-shell__sk crozzo-boot-shell__sk--sm"></div>' +
      '</div>' +
      '<p class="crozzo-boot-shell__hint">Experiencia optimizada para operación en sala.</p>' +
      '</div>';
    document.body.insertBefore(el, document.body.firstChild);
    return el;
  }

  var bootMsgIndex = 0;
  var bootMsgTimer = null;
  var BOOT_MSGS = [
    'Verificando recursos locales…',
    'Preparando módulos operativos…',
    'Sincronizando preferencias del terminal…',
    'Casi listo — abriendo interfaz…',
  ];

  function setBootMessage(msg) {
    var m = document.getElementById('crozzoBootShellMsg');
    if (m) m.textContent = String(msg || 'Cargando recursos…');
  }

  function cycleBootMessages() {
    if (bootHidden) return;
    bootMsgIndex = (bootMsgIndex + 1) % BOOT_MSGS.length;
    setBootMessage(BOOT_MSGS[bootMsgIndex]);
    bootMsgTimer = setTimeout(cycleBootMessages, 2200);
  }

  function hideBootShell() {
    if (bootHidden) return;
    bootHidden = true;
    if (bootMsgTimer) clearTimeout(bootMsgTimer);
    var el = document.getElementById('crozzo-boot-shell');
    if (!el) return;
    el.classList.add('crozzo-boot-shell--out');
    el.setAttribute('aria-busy', 'false');
    setTimeout(function () {
      try {
        el.remove();
      } catch (_) {}
    }, 420);
  }

  function bootReady() {
    if (bootHidden) return true;
    if (typeof global.navigateTo !== 'function') return false;
    if (document.documentElement.classList.contains('crozzo-app-ready')) return true;
    if (document.body && document.body.classList.contains('crozzo-login-open')) return true;
    var login = document.getElementById('loginOverlay');
    if (login && !login.hasAttribute('hidden')) return true;
    return false;
  }

  function watchBootShell() {
    ensureBootShell();
    cycleBootMessages();
    function tick() {
      if (bootReady()) hideBootShell();
    }
    tick();
    global.addEventListener('crozzo-lazy-ready', tick, { once: true });
    document.addEventListener('DOMContentLoaded', function () {
      var n = 0;
      var poll = setInterval(function () {
        tick();
        n += 1;
        if (bootHidden || n > 140) clearInterval(poll);
      }, 200);
    });
    setTimeout(function () {
      hideBootShell();
    }, 30000);
  }

  global.crozzoShowPageLoading = showPageLoading;
  global.crozzoHidePageLoading = hidePageLoading;
  global.crozzoMaybeShowRenderLoading = maybeShowRenderLoading;
  global.crozzoSetBootLoadMessage = setBootMessage;
  global.crozzoHideBootShell = hideBootShell;
  global.crozzoLoadingShell = {
    showPage: showPageLoading,
    hidePage: hidePageLoading,
    maybeRender: maybeShowRenderLoading,
    hideBoot: hideBootShell,
    setBootMessage: setBootMessage,
  };

  if (document.body) watchBootShell();
  else document.addEventListener('DOMContentLoaded', watchBootShell, { once: true });
})(typeof window !== 'undefined' ? window : globalThis);
