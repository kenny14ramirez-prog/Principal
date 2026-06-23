/**

 * FAB "+" — despliega insignias WhatsApp, Gmail, Drive, Dataico, DIAN y Spotify (solo PC Tauri).

 */

(function (global) {

  'use strict';



  var _inited = false;

  var _menuOpen = false;



  var BADGE_ROWS = [

    { kind: 'spotify', btnId: 'crozzoQuickAppsSpotifyBtn' },

    { kind: 'dian', btnId: 'crozzoQuickAppsDianBtn' },

    { kind: 'dataico', btnId: 'crozzoQuickAppsDataicoBtn' },

    { kind: 'drive', btnId: 'crozzoQuickAppsDriveBtn' },

    { kind: 'gmail', btnId: 'crozzoQuickAppsGmailBtn' },

    { kind: 'wa', btnId: 'crozzoQuickAppsWaBtn' },

  ];



  function isDesktopPc() {

    if (global.CrozzoWebEmbedDockCore && typeof global.CrozzoWebEmbedDockCore.isDesktopPc === 'function') {

      return global.CrozzoWebEmbedDockCore.isDesktopPc();

    }

    if (typeof global.crozzoWhatsAppDockCanUse === 'function') return global.crozzoWhatsAppDockCanUse();

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



  function allowedAppsSet() {

    var list =

      typeof global.crozzoUserAllowedQuickApps === 'function'

        ? global.crozzoUserAllowedQuickApps()

        : [];

    var set = {};

    (list || []).forEach(function (id) {

      set[id] = true;

    });

    return set;

  }



  function canUseApp(kind) {

    if (typeof global.crozzoUserCanUseQuickApp === 'function') {

      return global.crozzoUserCanUseQuickApp(kind);

    }

    return false;

  }



  function canSeeFab() {

    if (typeof global.crozzoUserHasAnyQuickApp === 'function') {

      return global.crozzoUserHasAnyQuickApp();

    }

    return true;

  }



  function applyBadgeVisibility() {

    var allowed = allowedAppsSet();

    var idx = 0;

    BADGE_ROWS.forEach(function (row) {

      var btn = document.getElementById(row.btnId);

      if (!btn) return;

      var ok = !!allowed[row.kind];

      btn.hidden = !ok;

      btn.style.display = ok ? '' : 'none';

      btn.setAttribute('aria-hidden', ok ? 'false' : 'true');

      if (ok) {

        btn.style.setProperty('--crozzo-badge-i', String(idx));

        idx += 1;

      }

    });

  }



  function getActiveEmbed() {

    if (typeof global.crozzoWhatsAppDockIsOpen === 'function' && global.crozzoWhatsAppDockIsOpen()) return 'wa';

    if (typeof global.crozzoGmailDockIsOpen === 'function' && global.crozzoGmailDockIsOpen()) return 'gmail';

    if (typeof global.crozzoDriveDockIsOpen === 'function' && global.crozzoDriveDockIsOpen()) return 'drive';

    if (typeof global.crozzoDataicoDockIsOpen === 'function' && global.crozzoDataicoDockIsOpen()) return 'dataico';

    if (typeof global.crozzoDianVpfeDockIsOpen === 'function' && global.crozzoDianVpfeDockIsOpen()) return 'dian';

    if (typeof global.crozzoSpotifyDockIsOpen === 'function' && global.crozzoSpotifyDockIsOpen()) return 'spotify';

    return null;

  }



  function setMenuOpen(open) {

    _menuOpen = !!open;

    var stack = document.getElementById('crozzoWaFabStack');

    var menu = document.getElementById('crozzoQuickAppsMenu');

    var mainBtn = document.getElementById('crozzoQuickAppsFabMain');

    if (stack) stack.classList.toggle('crozzo-quick-apps-fab--open', _menuOpen);

    if (menu) {

      if (_menuOpen) {

        menu.removeAttribute('hidden');

        menu.setAttribute('aria-hidden', 'false');

      } else {

        menu.setAttribute('hidden', '');

        menu.setAttribute('aria-hidden', 'true');

      }

    }

    if (mainBtn) mainBtn.setAttribute('aria-expanded', _menuOpen ? 'true' : 'false');

  }



  function closeMenu() {

    if (_menuOpen) setMenuOpen(false);

  }



  function openApp(kind) {

    if (!canUseApp(kind)) {

      if (typeof global.showToast === 'function') global.showToast('No tiene permiso para abrir esta app', 'warning');

      closeMenu();

      return;

    }

    var active = getActiveEmbed();

    if (active === kind) {

      closeMenu();

      return;

    }

    closeMenu();

    if (kind === 'wa' && typeof global.crozzoWhatsAppDockOpen === 'function') {

      global.crozzoWhatsAppDockOpen();

      return;

    }

    if (kind === 'gmail' && typeof global.crozzoGmailDockOpen === 'function') {

      global.crozzoGmailDockOpen();

      return;

    }

    if (kind === 'drive' && typeof global.crozzoDriveDockOpen === 'function') {

      global.crozzoDriveDockOpen();

      return;

    }

    if (kind === 'dataico' && typeof global.crozzoDataicoDockOpen === 'function') {

      global.crozzoDataicoDockOpen();

      return;

    }

    if (kind === 'dian' && typeof global.crozzoDianVpfeDockOpen === 'function') {

      global.crozzoDianVpfeDockOpen();

      return;

    }

    if (kind === 'spotify' && typeof global.crozzoSpotifyDockOpen === 'function') {

      global.crozzoSpotifyDockOpen();

    }

  }



  function closeActiveEmbed() {

    closeMenu();

    var active = getActiveEmbed();

    if (active === 'wa' && typeof global.crozzoWhatsAppDockClose === 'function') {

      global.crozzoWhatsAppDockClose();

    } else if (active === 'gmail' && typeof global.crozzoGmailDockClose === 'function') {

      global.crozzoGmailDockClose();

    } else if (active === 'drive' && typeof global.crozzoDriveDockClose === 'function') {

      global.crozzoDriveDockClose();

    } else if (active === 'dataico' && typeof global.crozzoDataicoDockClose === 'function') {

      global.crozzoDataicoDockClose();

    } else if (active === 'dian' && typeof global.crozzoDianVpfeDockClose === 'function') {

      global.crozzoDianVpfeDockClose();

    } else if (active === 'spotify' && typeof global.crozzoSpotifyDockClose === 'function') {

      global.crozzoSpotifyDockClose();

    }

  }



  function markActiveBadge(active) {

    BADGE_ROWS.forEach(function (row) {

      var btn = document.getElementById(row.btnId);

      if (!btn) return;

      btn.classList.remove('crozzo-quick-apps-fab__badge--current');

    });

    if (!active) return;

    var match = BADGE_ROWS.filter(function (row) { return row.kind === active; })[0];

    if (match) {

      var cur = document.getElementById(match.btnId);

      if (cur) cur.classList.add('crozzo-quick-apps-fab__badge--current');

    }

  }



  function refreshFab() {

    var stack = document.getElementById('crozzoWaFabStack');

    if (!stack) return;

    applyBadgeVisibility();

    var active = getActiveEmbed();

    var showFab = canSeeFab();

    var show = isDesktopPc() && !isLoginOpen() && showFab && (!active || !!active);

    if (show && !active) {

      stack.removeAttribute('hidden');

      stack.setAttribute('aria-hidden', 'false');

    } else if (showFab && active) {

      stack.removeAttribute('hidden');

      stack.setAttribute('aria-hidden', 'false');

    } else {

      stack.setAttribute('hidden', '');

      stack.setAttribute('aria-hidden', 'true');

      closeMenu();

    }

    stack.classList.toggle('crozzo-quick-apps-fab--embed-active', !!active);

    stack.classList.toggle('crozzo-wa-fab-stack--active', !!active);

    stack.classList.toggle('crozzo-quick-apps-fab--no-access', !showFab);

    markActiveBadge(active);

  }



  function onDocumentClick(e) {

    if (!_menuOpen) return;

    var stack = document.getElementById('crozzoWaFabStack');

    if (stack && e.target instanceof Node && stack.contains(e.target)) return;

    closeMenu();

  }



  function onDocumentKey(e) {

    if (e && e.key === 'Escape') closeMenu();

  }



  function ensureFabDom() {

    if (document.getElementById('crozzoQuickAppsFabMain')) return;

    var legacyWa = document.getElementById('crozzoWaFabBtn');

    var stack = document.getElementById('crozzoWaFabStack');

    if (!legacyWa || !stack) return;

    stack.classList.add('crozzo-quick-apps-fab');

    legacyWa.id = 'crozzoQuickAppsFabMain';

    legacyWa.classList.remove('crozzo-wa-fab--wa');

    legacyWa.classList.add('crozzo-quick-apps-fab__main');

    legacyWa.title = 'Apps rápidas';

    legacyWa.setAttribute('aria-label', 'Abrir apps rápidas');

    legacyWa.setAttribute('aria-controls', 'crozzoQuickAppsMenu');

    legacyWa.innerHTML = '<span class="crozzo-quick-apps-fab__plus" aria-hidden="true">+</span>';

    var menu = document.createElement('div');

    menu.className = 'crozzo-quick-apps-fab__menu';

    menu.id = 'crozzoQuickAppsMenu';

    menu.hidden = true;

    menu.setAttribute('aria-hidden', 'true');

    menu.innerHTML =

      '<button type="button" class="crozzo-quick-apps-fab__badge crozzo-quick-apps-fab__badge--spotify" id="crozzoQuickAppsSpotifyBtn" title="Spotify" aria-label="Abrir Spotify integrado" style="--crozzo-badge-i:5"><span class="crozzo-quick-apps-fab__badge-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.402.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.24z"/></svg></span></button>' +

      '<button type="button" class="crozzo-quick-apps-fab__badge crozzo-quick-apps-fab__badge--dian" id="crozzoQuickAppsDianBtn" title="DIAN · Consulta CUFE" aria-label="Abrir portal DIAN integrado" style="--crozzo-badge-i:4"><span class="crozzo-quick-apps-fab__badge-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M10.5 3a7.5 7.5 0 1 0 4.985 13.17l4.383 4.384 1.414-1.414-4.384-4.383A7.5 7.5 0 0 0 10.5 3zm0 2a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11z"/></svg></span></button>' +

      '<button type="button" class="crozzo-quick-apps-fab__badge crozzo-quick-apps-fab__badge--dataico" id="crozzoQuickAppsDataicoBtn" title="Dataico" aria-label="Abrir Dataico integrado" style="--crozzo-badge-i:3"><span class="crozzo-quick-apps-fab__badge-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H15a1 1 0 0 1-1-1V3.5zM8 13h8v1.5H8V13zm0 3h8v1.5H8V16zm0-6h4v1.5H8V10z"/></svg></span></button>' +

      '<button type="button" class="crozzo-quick-apps-fab__badge crozzo-quick-apps-fab__badge--drive" id="crozzoQuickAppsDriveBtn" title="Google Drive" aria-label="Abrir Google Drive integrado" style="--crozzo-badge-i:2"><span class="crozzo-quick-apps-fab__badge-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8.5 2L1 14h7.5L16 2H8.5zm7 0L23 14h-7.5L12 2h3.5zM1 16l4.5 6h15L23 16H1z"/></svg></span></button>' +

      '<button type="button" class="crozzo-quick-apps-fab__badge crozzo-quick-apps-fab__badge--gmail" id="crozzoQuickAppsGmailBtn" title="Gmail" aria-label="Abrir Gmail integrado" style="--crozzo-badge-i:1"><span class="crozzo-quick-apps-fab__badge-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"/></svg></span></button>' +

      '<button type="button" class="crozzo-quick-apps-fab__badge crozzo-quick-apps-fab__badge--wa" id="crozzoQuickAppsWaBtn" title="WhatsApp Web" aria-label="Abrir WhatsApp integrado" style="--crozzo-badge-i:0"><span class="crozzo-quick-apps-fab__badge-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg></span></button>';

    stack.insertBefore(menu, legacyWa);

  }



  function initChrome() {

    if (!isDesktopPc()) return;

    ensureFabDom();

    refreshFab();

    if (_inited) return;

    _inited = true;



    var mainBtn = document.getElementById('crozzoQuickAppsFabMain');

    if (mainBtn) {

      mainBtn.addEventListener('click', function (e) {

        e.stopPropagation();

        if (!canSeeFab()) return;

        setMenuOpen(!_menuOpen);

      });

    }



    var waBtn = document.getElementById('crozzoQuickAppsWaBtn');

    if (waBtn) waBtn.addEventListener('click', function () { openApp('wa'); });



    var gmailBtn = document.getElementById('crozzoQuickAppsGmailBtn');

    if (gmailBtn) gmailBtn.addEventListener('click', function () { openApp('gmail'); });



    var driveBtn = document.getElementById('crozzoQuickAppsDriveBtn');

    if (driveBtn) driveBtn.addEventListener('click', function () { openApp('drive'); });



    var dataicoBtn = document.getElementById('crozzoQuickAppsDataicoBtn');

    if (dataicoBtn) dataicoBtn.addEventListener('click', function () { openApp('dataico'); });



    var dianBtn = document.getElementById('crozzoQuickAppsDianBtn');

    if (dianBtn) dianBtn.addEventListener('click', function () { openApp('dian'); });



    var spotifyBtn = document.getElementById('crozzoQuickAppsSpotifyBtn');

    if (spotifyBtn) spotifyBtn.addEventListener('click', function () { openApp('spotify'); });



    var homeFab = document.getElementById('crozzoWaFabHomeBtn');

    if (homeFab) homeFab.addEventListener('click', function () { closeActiveEmbed(); });



    document.addEventListener('click', onDocumentClick);

    document.addEventListener('keydown', onDocumentKey);

  }



  global.crozzoQuickAppsFabRefresh = refreshFab;

  global.crozzoQuickAppsFabInit = initChrome;

  global.crozzoQuickAppsFabCloseMenu = closeMenu;



  if (document.readyState === 'loading') {

    document.addEventListener('DOMContentLoaded', initChrome);

  } else {

    initChrome();

  }

})(typeof window !== 'undefined' ? window : global);

