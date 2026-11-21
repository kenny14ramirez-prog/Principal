/**
 * eInforma �?" PC Tauri (misma l�gica que Dataico / Gmail / Drive Dock).
 */
(function (global) {
  'use strict';

  var EINFORMA_ICON =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 15h-2v-6h2zm0-8h-2V7h2z"/></svg>';

  var dock =
    global.CrozzoWebEmbedDockCore &&
    typeof global.CrozzoWebEmbedDockCore.create === 'function'
      ? global.CrozzoWebEmbedDockCore.create({
          pageId: 'einforma-web',
          defaultUrl: 'https://www.einforma.co/nit-empresas',
          navTab: 'einforma',
          invokeCmd: 'crozzo_dataico_dock_sync',
          embedHostId: 'crozzoEinformaEmbedHost',
          pageHeadId: 'crozzoEinformaPageHead',
          pageClass: 'crozzo-page-einforma-web',
          pageBeforeKey: '__crozzoPageBeforeEinforma',
          targetUrlKey: '__crozzoEinformaTargetUrl',
          brandTitle: 'eInforma �?" BONA origen',
          brandIconSvg: EINFORMA_ICON,
          loadingText: 'Cargando eInforma�?�',
          errorLabel: 'No se pudo abrir eInforma',
          logTag: '[einforma-page]',
          reloadBtnId: 'crozzoEinformaPageReload',
          hideBtnId: 'crozzoEinformaPageHide',
        })
      : null;

  if (!dock) return;

  global.crozzoRenderEinformaWebPage = dock.renderPage;
  global.crozzoInitEinformaWebPage = dock.initPage;
  global.crozzoEinformaDockHideEmbed = dock.hideEmbed;
  global.crozzoEinformaDockOpen = dock.openDock;
  global.crozzoEinformaDockClose = dock.closeDock;
  global.crozzoEinformaDockCanUse = dock.isDesktopPc;
  global.crozzoEinformaDockRequestLayoutSync = dock.requestLayoutSync;
})(typeof window !== 'undefined' ? window : global);