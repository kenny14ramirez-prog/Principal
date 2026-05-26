(function () {
  /**
   * Orquestación de módulos POS (sin Node). Debe ejecutarse tras el bundle principal.
   */
  function initPOS() {
    try {
      if (window.CrozzoModeManager) CrozzoModeManager.init();
    } catch (e) {
      console.warn('[crozzo] ModeManager', e);
    }
    try {
      if (window.CrozzoNetworkGuard) CrozzoNetworkGuard.afterMainInit();
    } catch (e) {
      console.warn('[crozzo] NetworkGuard', e);
    }
    try {
      if (window.CrozzoSyncRouterModule) CrozzoSyncRouterModule.init();
    } catch (e) {
      console.warn('[crozzo] SyncRouter module', e);
    }
    try {
      if (typeof updateCrozzoServerConflictBadge === 'function') updateCrozzoServerConflictBadge();
    } catch (e2) { /* ignore */ }
    try {
      if (window.CrozzoSyncRouterModule) CrozzoSyncRouterModule.refreshConnectivityBadges();
    } catch (e3) { /* ignore */ }
    try {
      if (typeof updateCrozzoAutoConfigBadge === 'function') updateCrozzoAutoConfigBadge('ready');
    } catch (e4) { /* ignore */ }
    try {
      if (window.CrozzoEmergencyMesh && typeof CrozzoEmergencyMesh.init === 'function') CrozzoEmergencyMesh.init();
    } catch (e5) {
      console.warn('[crozzo] EmergencyMesh', e5);
    }
  }
  window.initPOS = initPOS;
  initPOS();
})();