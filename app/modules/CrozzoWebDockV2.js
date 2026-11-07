/**
 * Web Dock V2 - 2 instancias (media + nav) con consumo minimo.
 * Se carga solo si CROZZO_WEB_DOCKS_ENABLED esta activo.
 * No modifica modulos existentes; agrega en paralelo.
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
      // Default ON para pruebas (el usuario puede desactivar con 'false')
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

  // Panel derecho tipo celular: ancho fijo, alto completo bajo header
  function computeRect() {
    var headerH = 60;
    try {
      var hdr = document.querySelector('main.main-content .main-header');
      if (hdr) headerH = Math.ceil(hdr.getBoundingClientRect().bottom);
    } catch (_) {}
    var w = Math.min(380, Math.max(320, Math.round(window.innerWidth * 0.28)));
    var h = Math.max(400, window.innerHeight - headerH - 12);
    var left = window.innerWidth - w - 12;
    var top = headerH + 6;
    return { left: left, top: top, width: w, height: h };
  }

  var state = {
    media: { open: false, url: null, creating: false },
    nav: { open: false, url: null, creating: false },
  };

  function openSlot(slot, url) {
    if (!isDesktopPc()) return Promise.resolve(false);
    var s = state[slot];
    if (!s) return Promise.resolve(false);
    if (s.creating) return Promise.resolve(false);
    s.creating = true;
    s.url = url;
    var r = computeRect();
    if (s.open) {
      // Ya abierto: solo navegar
      return invoke('crozzo_web_dock_navigate', { slot: slot, url: url })
        .then(function () { s.creating = false; return true; })
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
      .then(function () { s.creating = false; return true; })
      .catch(function (e) { console.warn('[web-dock-v2]', e); s.open = false; s.creating = false; return false; });
  }

  function closeSlot(slot) {
    var s = state[slot];
    if (!s || !s.open) return Promise.resolve(false);
    s.open = false;
    s.url = null;
    return invoke('crozzo_web_dock_destroy', { slot: slot })
      .catch(function (e) { console.warn('[web-dock-v2]', e); return false; });
  }

  function hideSlot(slot) {
    var s = state[slot];
    if (!s || !s.open) return Promise.resolve(false);
    return invoke('crozzo_web_dock_hide', { slot: slot })
      .catch(function (e) { console.warn('[web-dock-v2]', e); return false; });
  }

  // API publica
  global.crozzoWebDockV2OpenMedia = function (url) { return openSlot('media', url || 'https://open.spotify.com/'); };
  global.crozzoWebDockV2OpenNav = function (url) { return openSlot('nav', url || 'https://app.dataico.com/login'); };
  global.crozzoWebDockV2CloseMedia = function () { return closeSlot('media'); };
  global.crozzoWebDockV2CloseNav = function () { return closeSlot('nav'); };
  global.crozzoWebDockV2HideMedia = function () { return hideSlot('media'); };
  global.crozzoWebDockV2HideNav = function () { return hideSlot('nav'); };
  global.crozzoWebDockV2IsMediaOpen = function () { return state.media.open; };
  global.crozzoWebDockV2IsNavOpen = function () { return state.nav.open; };

  // Re-posicionar al redimensionar ventana
  try {
    window.addEventListener('resize', function () {
      if (state.media.open || state.nav.open) {
        // Re-crear con nuevo rect si esta abierto (simple y seguro)
        if (state.media.open && state.media.url) {
          var r = computeRect();
          invoke('crozzo_web_dock_create', {
            slot: 'media', url: state.media.url,
            left: r.left, top: r.top, width: r.width, height: r.height,
          }).catch(function () {});
        }
        if (state.nav.open && state.nav.url) {
          var r2 = computeRect();
          invoke('crozzo_web_dock_create', {
            slot: 'nav', url: state.nav.url,
            left: r2.left, top: r2.top, width: r2.width, height: r2.height,
          }).catch(function () {});
        }
      }
    });
  } catch (_) {}

  // Cerrar docks al salir de la pagina (limpieza)
  try {
    window.addEventListener('beforeunload', function () {
      if (state.media.open) invoke('crozzo_web_dock_destroy', { slot: 'media' }).catch(function () {});
      if (state.nav.open) invoke('crozzo_web_dock_destroy', { slot: 'nav' }).catch(function () {});
    });
  } catch (_) {}

  console.log('[web-dock-v2] cargado (feature flag activo)');
})(typeof window !== 'undefined' ? window : global);