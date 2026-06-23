/**
 * DIAN VPFE — consulta CUFE / facturas electrónicas (PC Tauri).
 */
(function (global) {
  'use strict';

  var DIAN_ICON =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M10.5 3a7.5 7.5 0 1 0 4.985 13.17l4.383 4.384 1.414-1.414-4.384-4.383A7.5 7.5 0 0 0 10.5 3zm0 2a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11z"/></svg>';

  var dock =
    global.CrozzoWebEmbedDockCore &&
    typeof global.CrozzoWebEmbedDockCore.create === 'function'
      ? global.CrozzoWebEmbedDockCore.create({
          pageId: 'dian-vpfe-web',
          defaultUrl: 'https://catalogo-vpfe.dian.gov.co/',
          navTab: 'dian',
          invokeCmd: 'crozzo_dian_vpfe_dock_sync',
          embedHostId: 'crozzoDianVpfeEmbedHost',
          pageHeadId: 'crozzoDianVpfePageHead',
          pageClass: 'crozzo-page-dian-vpfe-web',
          pageBeforeKey: '__crozzoPageBeforeDianVpfe',
          targetUrlKey: '__crozzoDianVpfeTargetUrl',
          brandTitle: 'DIAN · Consulta CUFE',
          brandIconSvg: DIAN_ICON,
          loadingText: 'Cargando portal DIAN…',
          errorLabel: 'No se pudo abrir el portal DIAN',
          logTag: '[dian-vpfe-page]',
          reloadBtnId: 'crozzoDianVpfePageReload',
          hideBtnId: 'crozzoDianVpfePageHide',
        })
      : null;

  if (!dock) return;

  global.crozzoRenderDianVpfeWebPage = dock.renderPage;
  global.crozzoInitDianVpfeWebPage = dock.initPage;
  global.crozzoDianVpfeDockHideEmbed = dock.hideEmbed;
  global.crozzoDianVpfeDockOpen = dock.openDock;
  global.crozzoDianVpfeDockClose = dock.closeDock;
  global.crozzoDianVpfeDockCanUse = dock.isDesktopPc;
  global.crozzoDianVpfeDockIsOpen = dock.isOpen;
  global.crozzoDianVpfeDockRequestLayoutSync = dock.requestLayoutSync;
})(typeof window !== 'undefined' ? window : global);
