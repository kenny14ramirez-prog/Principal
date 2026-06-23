/**
 * Google Drive — PC Tauri (misma lógica que WhatsApp Dock).
 */
(function (global) {
  'use strict';

  var DRIVE_ICON =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8.5 2L1 14h7.5L16 2H8.5zm7 0L23 14h-7.5L12 2h3.5zM1 16l4.5 6h15L23 16H1z"/></svg>';

  var dock =
    global.CrozzoWebEmbedDockCore &&
    typeof global.CrozzoWebEmbedDockCore.create === 'function'
      ? global.CrozzoWebEmbedDockCore.create({
          pageId: 'drive-web',
          defaultUrl: 'https://drive.google.com/',
          navTab: 'drive',
          invokeCmd: 'crozzo_whatsapp_dock_sync',
          embedHostId: 'crozzoDriveEmbedHost',
          pageHeadId: 'crozzoDrivePageHead',
          pageClass: 'crozzo-page-drive-web',
          pageBeforeKey: '__crozzoPageBeforeDrive',
          targetUrlKey: '__crozzoDriveTargetUrl',
          brandTitle: 'Google Drive · BONA origen',
          brandIconSvg: DRIVE_ICON,
          loadingText: 'Cargando Google Drive…',
          errorLabel: 'No se pudo abrir Google Drive',
          logTag: '[drive-page]',
          reloadBtnId: 'crozzoDrivePageReload',
          hideBtnId: 'crozzoDrivePageHide',
        })
      : null;

  if (!dock) return;

  global.crozzoRenderDriveWebPage = dock.renderPage;
  global.crozzoInitDriveWebPage = dock.initPage;
  global.crozzoDriveDockHideEmbed = dock.hideEmbed;
  global.crozzoDriveDockOpen = dock.openDock;
  global.crozzoDriveDockClose = dock.closeDock;
  global.crozzoDriveDockCanUse = dock.isDesktopPc;
  global.crozzoDriveDockIsOpen = dock.isOpen;
  global.crozzoDriveDockRequestLayoutSync = dock.requestLayoutSync;
})(typeof window !== 'undefined' ? window : global);
