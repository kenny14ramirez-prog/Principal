/**
 * Failover de caja con respaldo predefinido.
 *
 * Un dispositivo de escritorio designado como respaldo (cfg.isBackupCentral)
 * vigila a la caja primaria. Si la primaria queda inalcanzable de forma
 * sostenida (y la nube tampoco está disponible), el respaldo se auto-promueve a
 * central: levanta el servidor LAN y empieza a servir a las tablets. Cuando la
 * primaria regresa de forma estable, el respaldo se degrada solo (evita
 * split-brain: la primaria siempre gana). Las tablets (rol B) reencuentran al
 * central activo de forma transparente porque el respaldo está en sus
 * candidatos de descubrimiento (CrozzoWifiZoneBridge.gatewayCandidates).
 */
(function (global) {
  'use strict';

  // Una degradación debe persistir antes de promover (anti-flapping); la
  // recuperación de la primaria se confirma un poco antes de degradar.
  var PROMOTE_HOLD_MS = 18000;
  var DEMOTE_HOLD_MS = 12000;
  var TICK_MS = 6000;
  var PRIMARY_IP_KEY = 'crozzo_failover_primary_ip';

  var ST = { promoted: false, primaryDownSince: 0, primaryUpSince: 0, snapshot: null };
  var __started = false;
  var __timer = null;
  var __busy = false;

  /**
   * Núcleo de decisión (puro y testeable). Muta el acumulador de tiempos `st` y
   * devuelve la acción a ejecutar: 'promote' | 'demote' | 'none'.
   */
  function decide(st, input) {
    if (!input || !input.isBackup || !input.isDesktop) {
      st.primaryDownSince = 0;
      st.primaryUpSince = 0;
      return { action: 'none', reason: 'not-backup' };
    }
    var cloudOk = input.tier === 'cloud';
    if (input.primaryHealthy) {
      if (!st.primaryUpSince) st.primaryUpSince = input.now;
      st.primaryDownSince = 0;
    } else {
      if (!st.primaryDownSince) st.primaryDownSince = input.now;
      st.primaryUpSince = 0;
    }
    if (!st.promoted) {
      if (
        !input.primaryHealthy &&
        !cloudOk &&
        st.primaryDownSince &&
        input.now - st.primaryDownSince >= PROMOTE_HOLD_MS
      ) {
        return { action: 'promote', reason: 'primary-down' };
      }
      return { action: 'none', reason: input.primaryHealthy ? 'primary-ok' : 'waiting-hold' };
    }
    // Promovido: en cuanto la primaria vuelve de forma estable, cedemos.
    if (input.primaryHealthy && st.primaryUpSince && input.now - st.primaryUpSince >= DEMOTE_HOLD_MS) {
      return { action: 'demote', reason: 'primary-recovered' };
    }
    return { action: 'none', reason: 'serving' };
  }

  function md() {
    return typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
  }

  function isDesktop() {
    try {
      return !!(
        global.CrozzoLanSyncBridge &&
        typeof global.CrozzoLanSyncBridge.isDesktopTauri === 'function' &&
        global.CrozzoLanSyncBridge.isDesktopTauri()
      );
    } catch (_) {
      return false;
    }
  }

  function primaryIpResolved() {
    var cfg = md();
    var fromCfg = String(cfg.primaryIp || '').trim();
    if (fromCfg) return fromCfg;
    try {
      var stored = String(global.localStorage.getItem(PRIMARY_IP_KEY) || '').trim();
      if (stored) return stored;
    } catch (_) {}
    // Cuando aún no estamos promovidos, el central configurado ES la primaria.
    if (!ST.promoted) return String(cfg.centralIp || '').trim();
    return '';
  }

  function dispatch(type, detail) {
    try {
      global.dispatchEvent(new global.CustomEvent(type, { detail: detail || {} }));
    } catch (_) {}
    try {
      if (typeof global.crozzoWizardTierLogLine === 'function') {
        global.crozzoWizardTierLogLine('Failover caja: ' + type.replace('crozzo-central-', ''));
      }
    } catch (_) {}
  }

  function persist(patch) {
    var cfg = md();
    var next = Object.assign({}, cfg, patch);
    if (typeof global.persistMultiDeviceConfig === 'function') {
      global.persistMultiDeviceConfig(next);
    }
    try {
      var router = global.__crozzoGetMultiSyncRouter && global.__crozzoGetMultiSyncRouter();
      if (router && typeof router.applyConfig === 'function' && typeof global.getMultiDeviceConfig === 'function') {
        router.applyConfig(global.getMultiDeviceConfig());
      }
    } catch (_) {}
  }

  async function promote() {
    var cfg = md();
    var primaryIp = primaryIpResolved();
    try {
      if (primaryIp) global.localStorage.setItem(PRIMARY_IP_KEY, primaryIp);
    } catch (_) {}
    ST.snapshot = { role: cfg.role || 'B', centralIp: cfg.centralIp || '' };
    persist({ role: 'A', centralIp: '', allowLan: true, __failoverPromoted: true });
    try {
      if (global.CrozzoLanSyncBridge && typeof global.CrozzoLanSyncBridge.ensureServerOnce === 'function') {
        await global.CrozzoLanSyncBridge.ensureServerOnce(true);
      }
    } catch (_) {}
    ST.promoted = true;
    dispatch('crozzo-central-promoted', { primaryIp: primaryIp });
  }

  async function demote() {
    var snap = ST.snapshot || { role: 'B', centralIp: primaryIpResolved() };
    try {
      if (global.CrozzoLanSyncBridge && typeof global.CrozzoLanSyncBridge.stopServer === 'function') {
        await global.CrozzoLanSyncBridge.stopServer();
      }
    } catch (_) {}
    persist({
      role: 'B',
      centralIp: snap.centralIp || primaryIpResolved(),
      allowLan: true,
      __failoverPromoted: false,
    });
    ST.promoted = false;
    ST.snapshot = null;
    dispatch('crozzo-central-demoted', {});
  }

  // Si la app se reinició mientras estaba promovida, volver a rol B apuntando a
  // la primaria; la lógica normal re-promoverá si la primaria sigue caída.
  function recoverStartupState() {
    var cfg = md();
    if (!cfg.isBackupCentral) return;
    if (cfg.__failoverPromoted && String(cfg.role || '').toUpperCase() === 'A') {
      var primaryIp = primaryIpResolved();
      ST.promoted = false;
      persist({ role: 'B', centralIp: primaryIp, allowLan: true, __failoverPromoted: false });
      try {
        if (global.CrozzoLanSyncBridge && typeof global.CrozzoLanSyncBridge.stopServer === 'function') {
          global.CrozzoLanSyncBridge.stopServer();
        }
      } catch (_) {}
    }
  }

  async function tick() {
    if (__busy) return;
    __busy = true;
    try {
      var cfg = md();
      if (!cfg.isBackupCentral || !isDesktop()) {
        ST.primaryDownSince = 0;
        ST.primaryUpSince = 0;
        return;
      }
      try {
        if (typeof document !== 'undefined' && document.hidden) return;
      } catch (_) {}
      var port = Number(cfg.port) || 3000;
      var primaryIp = primaryIpResolved();
      var healthy = false;
      if (primaryIp && typeof global.crozzoFetchLanHealth === 'function') {
        healthy = await global.crozzoFetchLanHealth(primaryIp, port, 1600);
      }
      var tier = '';
      try {
        tier = String(global.__CROZZO_TIER_LAST || '');
      } catch (_) {}
      var d = decide(ST, {
        now: Date.now(),
        isBackup: true,
        isDesktop: true,
        primaryHealthy: !!healthy,
        tier: tier,
      });
      if (d.action === 'promote') await promote();
      else if (d.action === 'demote') await demote();
    } catch (_) {
    } finally {
      __busy = false;
    }
  }

  function schedule() {
    if (__timer) global.clearTimeout(__timer);
    __timer = global.setTimeout(function () {
      tick()
        .catch(function () {})
        .then(schedule, schedule);
    }, TICK_MS);
  }

  function afterMainInit() {
    if (__started) return;
    var cfg = md();
    // Solo el dispositivo de respaldo de escritorio vigila; el resto no agenda.
    if (!cfg.isBackupCentral || !isDesktop()) return;
    __started = true;
    recoverStartupState();
    schedule();
  }

  global.CrozzoCentralFailover = {
    decide: decide,
    afterMainInit: afterMainInit,
    tick: tick,
    promote: promote,
    demote: demote,
    isPromoted: function () {
      return !!ST.promoted;
    },
    _state: ST,
    PROMOTE_HOLD_MS: PROMOTE_HOLD_MS,
    DEMOTE_HOLD_MS: DEMOTE_HOLD_MS,
  };
})(typeof window !== 'undefined' ? window : globalThis);
