/**
 * Web Dock V2 - Panel lateral tipo celular (2 slots: media + nav).
 * Incluye tabs, controles (cerrar, zoom, vista), y reduce BONA (margin-right).
 * Se activa por defecto (feature flag CROZZO_WEB_DOCKS_ENABLED, default ON).
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
      if (html && html.classList.contains('tauri-shell') && html.classList.contains('crozzo-form-desktop')) return true;
      if (global.__CROZZO_IS_TAURI__ && html && html.classList.contains('crozzo-form-desktop')) return true;
    } catch (_) {}
    return false;
  }

  function featureEnabled() {
    try {
      var v = global.localStorage && global.localStorage.getItem('CROZZO_WEB_DOCKS_ENABLED');
      if (v === null) return true;
      return v === 'true';
    } catch (_) {}
    return true;
  }

  if (!isDesktopPc() || !featureEnabled()) return;

  function invoke(cmd, args) {
    if (global.__TAURI__ && global.__TAURI__.core && typeof global.__TAURI__.core.invoke === 'function') {
      return global.__TAURI__.core.invoke(cmd, args || {});
    }
    return Promise.reject(new Error('Tauri no disponible'));
  }

  // Servicios disponibles
  var SERVICES = [
    { id: 'whatsapp', label: 'WhatsApp', slot: 'nav', url: 'https://web.whatsapp.com/', icon: 'W', fullScreen: true },
    { id: 'spotify', label: 'Spotify', slot: 'media', url: 'https://open.spotify.com/', icon: 'S' },
    { id: 'youtube', label: 'YouTube', slot: 'media', url: 'https://www.youtube.com/', icon: 'Y' },
    { id: 'dataico', label: 'Dataico', slot: 'nav', url: 'https://app.dataico.com/login', icon: 'D' },
    { id: 'dian', label: 'DIAN', slot: 'nav', url: 'https://catalogo-vpfe.dian.gov.co/', icon: 'I' },
    { id: 'gmail', label: 'Gmail', slot: 'nav', url: 'https://mail.google.com/', icon: 'G' },
    { id: 'drive', label: 'Drive', slot: 'nav', url: 'https://drive.google.com/', icon: 'V' },
  ];

  var state = {
    media: { open: false, url: null, creating: false, activeId: null },
    nav: { open: false, url: null, creating: false, activeId: null },
    panelOpen: false,
    zoom: 100,
    phoneMode: true,
    activeSlot: null,
  };

  // Crear panel dinamicamente
  function ensurePanel() {
    var panel = document.getElementById('crozzoDockPanel');
    if (panel) return panel;

    panel = document.createElement('aside');
    panel.id = 'crozzoDockPanel';
    panel.className = 'crozzo-dock-panel';
    panel.setAttribute('aria-label', 'Panel de servicios');
    panel.innerHTML =
      '<div class="crozzo-dock-panel__head">' +
        '<nav id="crozzoDockPanelTabs" class="crozzo-dock-panel__tabs" aria-label="Servicios"></nav>' +
        '<div class="crozzo-dock-panel__controls">' +
          '<button type="button" id="crozzoDockPanelProfile" class="crozzo-dock-panel__profile" title="Vista teléfono / escritorio" aria-label="Cambiar vista">📱</button>' +
          '<button type="button" id="crozzoDockPanelOpenBrowser" class="crozzo-dock-panel__open-browser" title="Abrir en navegador del sistema" aria-label="Abrir en navegador">🌐</button>' +
          '<input type="range" id="crozzoDockPanelZoom" class="crozzo-dock-panel__zoom" min="50" max="200" step="5" value="100" title="Zoom del servicio" aria-label="Zoom del servicio">' +
          '<span id="crozzoDockPanelZoomLabel" class="crozzo-dock-panel__zoom-label">100%</span>' +
          '<button type="button" id="crozzoDockPanelStop" class="crozzo-dock-panel__stop" title="Detener audio" aria-label="Detener audio">&#9632;</button>' +
          '<button type="button" id="crozzoDockPanelClose" class="crozzo-dock-panel__close" title="Cerrar panel" aria-label="Cerrar panel">&times;</button>' +
        '</div>' +
      '</div>' +
      '<div id="crozzoDockPanelBody" class="crozzo-dock-panel__body"></div>';

    panel.hidden = true;
    panel.style.display = 'none';
    document.body.appendChild(panel);

    // Poblar tabs
    var tabs = panel.querySelector('#crozzoDockPanelTabs');
    SERVICES.forEach(function (svc) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'crozzo-dock-panel__tab';
      btn.setAttribute('data-service', svc.id);
      btn.setAttribute('data-slot', svc.slot);
      btn.textContent = svc.label;
      btn.addEventListener('click', function () {
        activateService(svc.id);
      });
      tabs.appendChild(btn);
    });

    // Controles
    var closeBtn = panel.querySelector('#crozzoDockPanelClose');
    if (closeBtn) closeBtn.addEventListener('click', closePanel);

    var stopBtn = panel.querySelector('#crozzoDockPanelStop');
    if (stopBtn) stopBtn.addEventListener('click', stopMedia);

    var profileBtn = panel.querySelector('#crozzoDockPanelProfile');
    if (profileBtn) profileBtn.addEventListener('click', toggleProfile);

    var openBrowserBtn = panel.querySelector('#crozzoDockPanelOpenBrowser');
    if (openBrowserBtn) openBrowserBtn.addEventListener('click', openInBrowser);

    var zoomSlider = panel.querySelector('#crozzoDockPanelZoom');
    var zoomLabel = panel.querySelector('#crozzoDockPanelZoomLabel');
    if (zoomSlider) {
      zoomSlider.addEventListener('input', function () {
        var z = parseInt(zoomSlider.value, 10) || 100;
        state.zoom = z;
        if (zoomLabel) zoomLabel.textContent = z + '%';
        applyZoom(z / 100);
      });
    }

    return panel;
  }

  function computeRect() {
    var headerH = 60;
    try {
      var hdr = document.querySelector('main.main-content .main-header');
      if (hdr) headerH = Math.ceil(hdr.getBoundingClientRect().bottom);
    } catch (_) {}
    var panel = document.getElementById('crozzoDockPanel');
    var w = 360;
    if (panel) {
      panel.classList.add('crozzo-dock-profile--phone');
    }
    var h = Math.max(400, window.innerHeight - headerH - 12);
    var left = window.innerWidth - w - 12;
    var top = headerH + 6;
    return { left: left, top: top, width: w, height: h };
  }

  function applyZoom(z) {
    var activeSlot = state.activeSlot || (state.media.open ? 'media' : (state.nav.open ? 'nav' : null));
    if (activeSlot) {
      invoke('crozzo_web_dock_set_zoom', { slot: activeSlot, zoom: z }).catch(function () {});
    }
  }

  function openSlot(slot, url) {
    if (!isDesktopPc()) return Promise.resolve(false);
    var s = state[slot];
    if (!s) return Promise.resolve(false);
    if (s.creating) return Promise.resolve(false);
    s.creating = true;
    var prevUrl = s.url;
    var sameUrl = (prevUrl === url);
    s.url = url;

    var r = computeRect();
    showPanel();

    state.activeSlot = slot;
    if (s.open) {
      if (sameUrl) {
        // Misma URL: no recargar; solo traer al frente / mostrar (preserva audio)
        s.creating = false;
        s.activeId = findServiceId(slot, url);
        state.activeSlot = slot;
        return invoke('crozzo_web_dock_show', { slot: slot })
          .then(function () { updateTabs(); return true; })
          .catch(function (e) {
            // fallback: si no existe, crear
            return invoke('crozzo_web_dock_create', { slot: slot, url: url, left: r.left, top: r.top, width: r.width, height: r.height })
              .then(function () { updateTabs(); return true; })
              .catch(function (e2) { console.warn('[web-dock-v2]', e2); return false; });
          });
      }
      // URL distinta: navegar (recarga) y traer al frente
      return invoke('crozzo_web_dock_navigate', { slot: slot, url: url })
        .then(function () {
          s.creating = false;
          s.url = url;
          s.activeId = findServiceId(slot, url);
          state.activeSlot = slot;
          invoke('crozzo_web_dock_create', { slot: slot, url: url, left: r.left, top: r.top, width: r.width, height: r.height }).catch(function () {});
          updateTabs();
          return true;
        })
        .catch(function (e) { console.warn('[web-dock-v2]', e); s.creating = false; return false; });
    }
    s.open = true;
    return invoke('crozzo_web_dock_create', {
      slot: slot,
      url: url,
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
    })
      .then(function () {
        s.creating = false;
        s.activeId = findServiceId(slot, url);
        // Traer este slot al frente
        invoke('crozzo_web_dock_create', { slot: slot, url: url, left: r.left, top: r.top, width: r.width, height: r.height }).catch(function () {});
        updateTabs();
        return true;
      })
      .catch(function (e) { console.warn('[web-dock-v2]', e); s.open = false; s.creating = false; return false; });
  }

  function findServiceId(slot, url) {
    for (var i = 0; i < SERVICES.length; i++) {
      if (SERVICES[i].slot === slot && SERVICES[i].url === url) return SERVICES[i].id;
    }
    return null;
  }

  function activateService(id) {
    var svc = null;
    for (var i = 0; i < SERVICES.length; i++) {
      if (SERVICES[i].id === id) { svc = SERVICES[i]; break; }
    }
    if (!svc) return;
    // Si se esta viendo WhatsApp a pantalla completa y se elige otro servicio, volver a BONA antes.
    if (id !== 'whatsapp' && typeof global.currentPage !== 'undefined' && global.currentPage === 'whatsapp-web') {
      var back = (global.__crozzoPageBeforeWhatsApp && global.__crozzoPageBeforeWhatsApp !== 'whatsapp-web') ? global.__crozzoPageBeforeWhatsApp : 'inicio-operacion';
      if (typeof global.navigateTo === 'function') global.navigateTo(back);
    }
    if (svc.fullScreen) {
      // WhatsApp: se comporta como pagina de BONA (area principal).
      // Si el sidebar esta expandido, colapsarlo para que WhatsApp ocupe todo el espacio.
      try { if (typeof global.CrozzoSidebarNav !== 'undefined' && typeof global.CrozzoSidebarNav.setExpanded === 'function') global.CrozzoSidebarNav.setExpanded(false, false); } catch (_) {}
      try { if (typeof global.crozzoInitCollapsibleSidebar === 'function') {} } catch (_) {}
      state.activeSlot = 'nav';
      state.nav.activeId = 'whatsapp';
      updateTabs();
      if (typeof global.navigateTo === 'function') global.navigateTo('whatsapp-web');
      else if (typeof global.renderPage === 'function') global.renderPage('whatsapp-web');
      return;
    }
    openSlot(svc.slot, svc.url);
  }

  function updateTabs() {
    var tabs = document.querySelectorAll('#crozzoDockPanelTabs .crozzo-dock-panel__tab');
    tabs.forEach(function (btn) {
      var sid = btn.getAttribute('data-service');
      var svc = null;
      for (var i = 0; i < SERVICES.length; i++) { if (SERVICES[i].id === sid) { svc = SERVICES[i]; break; } }
      if (!svc) return;
      var isActive = (state.activeSlot === 'media' && svc.slot === 'media' && state.media.activeId === sid) ||
                     (state.activeSlot === 'nav' && svc.slot === 'nav' && state.nav.activeId === sid);
      btn.classList.toggle('is-active', isActive);
    });
  }

  function showPanel() {
    var panel = ensurePanel();
    panel.hidden = false;
    panel.removeAttribute('hidden');
    panel.style.display = 'flex';
    state.panelOpen = true;
    document.body.classList.add('crozzo-dock-panel-open');
    document.body.classList.toggle('crozzo-dock-profile--phone', state.phoneMode);
    adjustBonaMargin(true);
  }

  function hidePanel() {
    var panel = document.getElementById('crozzoDockPanel');
    if (panel) {
      panel.hidden = true;
      panel.style.display = 'none';
    }
    state.panelOpen = false;
    document.body.classList.remove('crozzo-dock-panel-open', 'crozzo-dock-profile--phone');
    adjustBonaMargin(false);
  }

  function adjustBonaMargin(on) {
    try {
      var main = document.querySelector('main.main-content');
      if (!main) return;
      if (on) {
        var panel = document.getElementById('crozzoDockPanel');
        if (panel) {
          var pr = panel.getBoundingClientRect();
          // main termina 12px antes del borde izquierdo del panel
          var margin = Math.ceil(window.innerWidth - pr.left + 12);
          if (margin < 300) margin = 384;
          main.style.marginRight = margin + 'px';
        } else {
          main.style.marginRight = '384px';
        }
        main.style.transition = 'margin-right 0.3s cubic-bezier(0.22,1,0.36,1)';
      } else {
        main.style.marginRight = '';
      }
    } catch (_) {}
  }

  function closePanel() {
    // Media (Spotify/YouTube): mantener audio en segundo plano (no destruir), solo ocultar.
    if (state.media.open) {
      invoke('crozzo_web_dock_hide', { slot: 'media' }).catch(function () {});
    }
    // Nav: destruir para liberar recursos.
    if (state.nav.open) {
      closeSlot('nav');
    }
    state.activeSlot = state.media.open ? 'media' : null;
    hidePanel();
  }

  function stopMedia() {
    closeSlot('media');
    state.activeSlot = state.nav.open ? 'nav' : null;
    if (state.panelOpen) {
      updateTabs();
    } else {
      hidePanel();
    }
  }

  function closeSlot(slot) {
    var s = state[slot];
    if (!s || !s.open) return Promise.resolve(false);
    s.open = false;
    s.url = null;
    s.activeId = null;
    return invoke('crozzo_web_dock_destroy', { slot: slot })
      .catch(function (e) { console.warn('[web-dock-v2]', e); return false; });
  }

  function toggleProfile() {
    state.phoneMode = !state.phoneMode;
    var panel = document.getElementById('crozzoDockPanel');
    if (panel) panel.classList.toggle('crozzo-dock-profile--phone', state.phoneMode);
    adjustBonaMargin(state.panelOpen);
    if (state.media.open || state.nav.open) {
      // Re-posicionar
      var r = computeRect();
      if (state.media.open && state.media.url) {
        invoke('crozzo_web_dock_create', { slot: 'media', url: state.media.url, left: r.left, top: r.top, width: r.width, height: r.height }).catch(function () {});
      }
      if (state.nav.open && state.nav.url) {
        invoke('crozzo_web_dock_create', { slot: 'nav', url: state.nav.url, left: r.left, top: r.top, width: r.width, height: r.height }).catch(function () {});
      }
    }
  }

  function openInBrowser() {
    var activeSlot = state.media.open ? 'media' : (state.nav.open ? 'nav' : null);
    if (!activeSlot) return;
    var s = state[activeSlot];
    if (s && s.url && typeof global.crozzoOpenExternal === 'function') {
      global.crozzoOpenExternal(s.url);
    }
  }

  // API publica
  global.crozzoWebDockV2OpenMedia = function (url) { return openSlot('media', url || 'https://open.spotify.com/'); };
  global.crozzoWebDockV2OpenNav = function (url) { return openSlot('nav', url || 'https://app.dataico.com/login'); };
  global.crozzoWebDockV2CloseMedia = function () { return closeSlot('media'); };
  global.crozzoWebDockV2CloseNav = function () { return closeSlot('nav'); };
  global.crozzoWebDockV2HideMedia = function () { return invoke('crozzo_web_dock_hide', { slot: 'media' }).catch(function () {}); };
  global.crozzoWebDockV2HideNav = function () { return invoke('crozzo_web_dock_hide', { slot: 'nav' }).catch(function () {}); };
  global.crozzoWebDockV2IsMediaOpen = function () { return state.media.open; };
  global.crozzoWebDockV2IsNavOpen = function () { return state.nav.open; };
  global.crozzoWebDockV2ClosePanel = closePanel;
  global.crozzoWebDockV2ActivateService = activateService;
  global.crozzoWebDockV2GetActiveMediaId = function () { return (state.media.open && state.media.activeId) ? state.media.activeId : null; };

  // Re-posicionar al redimensionar
  try {
    window.addEventListener('resize', function () {
      if (state.panelOpen) {
        var r = computeRect();
        if (state.media.open && state.media.url) {
          invoke('crozzo_web_dock_create', { slot: 'media', url: state.media.url, left: r.left, top: r.top, width: r.width, height: r.height }).catch(function () {});
        }
        if (state.nav.open && state.nav.url) {
          invoke('crozzo_web_dock_create', { slot: 'nav', url: state.nav.url, left: r.left, top: r.top, width: r.width, height: r.height }).catch(function () {});
        }
        adjustBonaMargin(true);
      }
    });
  } catch (_) {}

  // Limpiar al salir
  try {
    window.addEventListener('beforeunload', function () {
      if (state.media.open) invoke('crozzo_web_dock_destroy', { slot: 'media' }).catch(function () {});
      if (state.nav.open) invoke('crozzo_web_dock_destroy', { slot: 'nav' }).catch(function () {});
    });
  } catch (_) {}

  console.log('[web-dock-v2] cargado (panel lateral tipo celular)');
})(typeof window !== 'undefined' ? window : global);