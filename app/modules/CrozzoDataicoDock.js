/**

 * Dataico — PC Tauri (misma lógica que Gmail / Drive Dock).

 */

(function (global) {

  'use strict';



  var DATAICO_ICON =

    '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H15a1 1 0 0 1-1-1V3.5zM8 13h8v1.5H8V13zm0 3h8v1.5H8V16zm0-6h4v1.5H8V10z"/></svg>';



  var dock =

    global.CrozzoWebEmbedDockCore &&

    typeof global.CrozzoWebEmbedDockCore.create === 'function'

      ? global.CrozzoWebEmbedDockCore.create({

          pageId: 'dataico-web',

          defaultUrl: 'https://app.dataico.com/login',

          navTab: 'dataico',

          invokeCmd: 'crozzo_dataico_dock_sync',

          embedHostId: 'crozzoDataicoEmbedHost',

          pageHeadId: 'crozzoDataicoPageHead',

          pageClass: 'crozzo-page-dataico-web',

          pageBeforeKey: '__crozzoPageBeforeDataico',

          targetUrlKey: '__crozzoDataicoTargetUrl',

          brandTitle: 'Dataico · BONA origen',

          brandIconSvg: DATAICO_ICON,

          loadingText: 'Cargando Dataico…',

          errorLabel: 'No se pudo abrir Dataico',

          logTag: '[dataico-page]',

          reloadBtnId: 'crozzoDataicoPageReload',

          hideBtnId: 'crozzoDataicoPageHide',

        })

      : null;



  if (!dock) return;



  global.crozzoRenderDataicoWebPage = dock.renderPage;

  global.crozzoInitDataicoWebPage = dock.initPage;

  global.crozzoDataicoDockHideEmbed = dock.hideEmbed;

  global.crozzoDataicoDockOpen = dock.openDock;

  global.crozzoDataicoDockClose = dock.closeDock;

  global.crozzoDataicoDockCanUse = dock.isDesktopPc;

  global.crozzoDataicoDockIsOpen = dock.isOpen;

  global.crozzoDataicoDockRequestLayoutSync = dock.requestLayoutSync;

})(typeof window !== 'undefined' ? window : global);

