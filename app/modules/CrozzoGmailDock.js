/**
 * Gmail Web — PC Tauri (misma lógica que WhatsApp Dock).
 */
(function (global) {
  'use strict';

  var GMAIL_ICON =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"/></svg>';

  var dock =
    global.CrozzoWebEmbedDockCore &&
    typeof global.CrozzoWebEmbedDockCore.create === 'function'
      ? global.CrozzoWebEmbedDockCore.create({
          pageId: 'gmail-web',
          defaultUrl: 'https://mail.google.com/',
          navTab: 'gmail',
          invokeCmd: 'crozzo_whatsapp_dock_sync',
          embedHostId: 'crozzoGmailEmbedHost',
          pageHeadId: 'crozzoGmailPageHead',
          pageClass: 'crozzo-page-gmail-web',
          pageBeforeKey: '__crozzoPageBeforeGmail',
          targetUrlKey: '__crozzoGmailTargetUrl',
          brandTitle: 'Gmail · BONA origen',
          brandIconSvg: GMAIL_ICON,
          loadingText: 'Cargando Gmail…',
          errorLabel: 'No se pudo abrir Gmail',
          logTag: '[gmail-page]',
          reloadBtnId: 'crozzoGmailPageReload',
          hideBtnId: 'crozzoGmailPageHide',
        })
      : null;

  if (!dock) return;

  global.crozzoRenderGmailWebPage = dock.renderPage;
  global.crozzoInitGmailWebPage = dock.initPage;
  global.crozzoGmailDockHideEmbed = dock.hideEmbed;
  global.crozzoGmailDockOpen = dock.openDock;
  global.crozzoGmailDockClose = dock.closeDock;
  global.crozzoGmailDockCanUse = dock.isDesktopPc;
  global.crozzoGmailDockIsOpen = dock.isOpen;
  global.crozzoGmailDockRequestLayoutSync = dock.requestLayoutSync;
})(typeof window !== 'undefined' ? window : global);
