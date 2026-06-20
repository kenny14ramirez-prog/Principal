(function () {
  /**
   * Orquestación de módulos POS (sin Node). Invocado por CrozzoLazyModules tras envolver navegación.
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
      if (window.CrozzoStartupReady && typeof CrozzoStartupReady.run === 'function') {
        CrozzoStartupReady.run();
      }
    } catch (eSr) {
      console.warn('[crozzo] StartupReady', eSr);
    }
    try {
      if (typeof updateCrozzoServerConflictBadge === 'function') updateCrozzoServerConflictBadge();
    } catch (e2) {
      /* ignore */
    }
    try {
      if (window.CrozzoSyncRouterModule) CrozzoSyncRouterModule.refreshConnectivityBadges();
    } catch (e3) {
      /* ignore */
    }
    try {
      if (typeof updateCrozzoAutoConfigBadge === 'function') updateCrozzoAutoConfigBadge('ready');
    } catch (e4) {
      /* ignore */
    }
    try {
      if (window.CrozzoEmergencyMesh && typeof CrozzoEmergencyMesh.init === 'function') {
        window.CrozzoEmergencyMesh.init();
      }
    } catch (e5) {
      console.warn('[crozzo] EmergencyMesh', e5);
    }
    try {
      if (window.CrozzoOnboardingOperativo && typeof CrozzoOnboardingOperativo.init === 'function') {
        CrozzoOnboardingOperativo.init();
      }
    } catch (e6) {
      console.warn('[crozzo] OnboardingOperativo', e6);
    }
    try {
      if (window.CrozzoHelpHub && typeof CrozzoHelpHub.init === 'function') {
        CrozzoHelpHub.init();
      }
    } catch (e7) {
      console.warn('[crozzo] HelpHub', e7);
    }
  }
  window.initPOS = initPOS;
})();
