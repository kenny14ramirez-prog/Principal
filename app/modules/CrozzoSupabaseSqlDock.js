/**
 * Supabase SQL Editor — página integrada (Super Admin / Nube global), PC Tauri.
 */
(function (global) {
  'use strict';

  var PAGE_ID = 'supabase-nube-web';
  var PAGE_BEFORE_KEY = '__crozzoPageBeforeSupabaseNube';
  var TARGET_URL_KEY = '__crozzoSupabaseNubeTargetUrl';

  var SUPABASE_ICON =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/></svg>';

  var coreDock =
    global.CrozzoWebEmbedDockCore &&
    typeof global.CrozzoWebEmbedDockCore.create === 'function'
      ? global.CrozzoWebEmbedDockCore.create({
          pageId: PAGE_ID,
          defaultUrl: 'https://supabase.com/dashboard',
          navTab: '',
          invokeCmd: 'crozzo_supabase_dock_sync',
          embedHostId: 'crozzoNubeSupabaseEmbedHost',
          pageHeadId: 'crozzoNubeSupabasePageHead',
          pageClass: 'crozzo-page-supabase-nube-web',
          pageBeforeKey: PAGE_BEFORE_KEY,
          targetUrlKey: TARGET_URL_KEY,
          brandTitle: 'Supabase · SQL Editor',
          brandIconSvg: SUPABASE_ICON,
          loadingText: 'Cargando Supabase…',
          errorLabel: 'No se pudo abrir Supabase',
          logTag: '[supabase-nube]',
          reloadBtnId: 'crozzoNubeSupabasePageReload',
          hideBtnId: 'crozzoNubeSupabasePageHide',
        })
      : null;

  if (!coreDock) return;

  function renderPage() {
    return (
      '<div class="crozzo-wa-page crozzo-nube-supabase-page">' +
      '<div class="crozzo-wa-page__head" id="crozzoNubeSupabasePageHead">' +
      '<div class="crozzo-wa-page__brand">' +
      '<span class="crozzo-wa-page__brand-icon" aria-hidden="true">' +
      SUPABASE_ICON +
      '</span>' +
      '<span class="crozzo-wa-page__brand-title">Supabase · SQL Editor</span>' +
      '</div>' +
      '<p class="crozzo-nube-supabase-page__hint">Pegue el SQL → Run ▶ → vuelva al asistente</p>' +
      '<div class="crozzo-wa-page__actions crozzo-nube-supabase-page__actions">' +
      '<button type="button" class="crozzo-nube-supabase-page__pill" id="crozzoNubeDockCopySql" title="Copiar SQL">📋 Copiar SQL</button>' +
      '<button type="button" class="crozzo-wa-page__btn" id="crozzoNubeSupabasePageReload" title="Recargar" aria-label="Recargar">' +
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>' +
      '</button>' +
      '<button type="button" class="crozzo-wa-page__btn" id="crozzoNubeDockExternal" title="Abrir en navegador" aria-label="Abrir en navegador">' +
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>' +
      '</button>' +
      '<button type="button" class="crozzo-nube-supabase-page__pill crozzo-nube-supabase-page__pill--primary" id="crozzoNubeDockBackNube" title="Volver al asistente Nube global">← Nube global</button>' +
      '</div>' +
      '</div>' +
      '<div class="crozzo-wa-page__shell">' +
      '<div id="crozzoNubeSupabaseEmbedHost" class="crozzo-wa-page__host" aria-label="Supabase SQL Editor">' +
      '<div class="crozzo-wa-page__loading">' +
      '<span class="crozzo-wa-page__spinner" aria-hidden="true"></span>' +
      '<p>Cargando Supabase…</p>' +
      '</div>' +
      '<p class="crozzo-wa-page__error form-hint" hidden></p>' +
      '</div></div></div>'
    );
  }

  function bindNubeHeadButtons() {
    var head = global.document.getElementById('crozzoNubeSupabasePageHead');
    if (!head || head._crozzoNubeSupabaseHeadBound) return;
    head._crozzoNubeSupabaseHeadBound = true;

    var copyBtn = global.document.getElementById('crozzoNubeDockCopySql');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        if (typeof global.crozzoNubeCopyActiveSql === 'function') global.crozzoNubeCopyActiveSql();
      });
    }

    var extBtn = global.document.getElementById('crozzoNubeDockExternal');
    if (extBtn) {
      extBtn.addEventListener('click', function () {
        var url = global[TARGET_URL_KEY] || '';
        if (!url) return;
        if (typeof global.crozzoOpenExternal === 'function') global.crozzoOpenExternal(url);
        else global.open(url, '_blank', 'noopener,noreferrer');
      });
    }

    var backBtn = global.document.getElementById('crozzoNubeDockBackNube');
    if (backBtn) {
      backBtn.addEventListener('click', function () {
        void close();
      });
    }
  }

  function initPage() {
    coreDock.initPage();
    bindNubeHeadButtons();
  }

  function canOpen() {
    if (typeof global.isSuperAdminUser === 'function' && !global.isSuperAdminUser()) {
      if (typeof global.showToast === 'function') global.showToast('Solo Super Admin.', 'warning');
      return false;
    }
    if (!coreDock.isDesktopPc()) return false;
    return true;
  }

  function open(url) {
    url = String(url || '').trim();
    if (!url) return Promise.resolve(false);
    if (!canOpen()) {
      if (typeof global.crozzoOpenExternal === 'function') global.crozzoOpenExternal(url);
      else global.open(url, '_blank', 'noopener,noreferrer');
      return Promise.resolve(false);
    }
    global[TARGET_URL_KEY] = url;
    var prev =
      typeof global.crozzoGetActivePageId === 'function'
        ? global.crozzoGetActivePageId()
        : global.currentPage;
    if (prev && prev !== PAGE_ID) global[PAGE_BEFORE_KEY] = prev;
    else if (!global[PAGE_BEFORE_KEY]) global[PAGE_BEFORE_KEY] = 'super-admin-nube';
    if (typeof global.navigateTo === 'function') global.navigateTo(PAGE_ID);
    else if (typeof global.renderPage === 'function') global.renderPage(PAGE_ID);
    return Promise.resolve(true);
  }

  function close() {
    var back = global[PAGE_BEFORE_KEY] || 'super-admin-nube';
    return coreDock.hideEmbed().then(function () {
      if (typeof global.navigateTo === 'function') global.navigateTo(back);
      else if (typeof global.renderPage === 'function') global.renderPage(back);
      return true;
    });
  }

  global.crozzoRenderSupabaseNubeWebPage = renderPage;
  global.crozzoInitSupabaseNubeWebPage = initPage;
  global.crozzoNubeSupabaseDockOpen = open;
  global.crozzoNubeSupabaseDockClose = close;
  global.crozzoNubeSupabaseDockHideEmbed = coreDock.hideEmbed;
  global.crozzoNubeSupabaseDockIsOpen = coreDock.isOpen;
  global.crozzoNubeSupabaseDockRequestLayoutSync = coreDock.requestLayoutSync;
  global.crozzoNubeSupabaseDockSyncLayout = coreDock.requestLayoutSync;
  global.crozzoNubeSupabaseDockCanUse = coreDock.isDesktopPc;
})(typeof window !== 'undefined' ? window : globalThis);
