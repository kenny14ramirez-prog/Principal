/**
 * Crozzo POS — Sync antes de editar (tablet/caja operativa).
 * Entra → verifica nube/LAN → actualiza → recién ahí permite editar mesas.
 */
(function (global) {
  'use strict';

  var __ready = { tablets: false, cajero: false };
  var __syncGen = 0;
  var __pending = null;
  var __operativeInitialSyncDone = false;
  var __sessionKey = '';
  var OVERLAY_MAX_MS = 4500;
  var RECENT_CLOUD_PULL_MS = 15000;

  function withTimeout(promise, ms, fallback) {
    var timer;
    return Promise.race([
      promise,
      new Promise(function (resolve) {
        timer = global.setTimeout(function () {
          resolve(fallback);
        }, ms);
      }),
    ]).finally(function () {
      if (timer) global.clearTimeout(timer);
    });
  }

  function cloudLikelyUp() {
    try {
      if (typeof global.crozzoTierAllowsCloudSync === 'function' && !global.crozzoTierAllowsCloudSync()) return false;
      return (
        typeof global.crozzoOnlineConfigReady === 'function' &&
        global.crozzoOnlineConfigReady() &&
        !!global.__SUPABASE
      );
    } catch (_) {}
    return false;
  }

  function lanSegmentLikelyUp() {
    try {
      if (typeof global.crozzoIsLocalLanSegmentUp === 'function' && global.crozzoIsLocalLanSegmentUp()) return true;
      if (global.CrozzoLanOpsSync && typeof global.CrozzoLanOpsSync.syncAllowed === 'function') {
        return !!global.CrozzoLanOpsSync.syncAllowed({ kind: 'realtime' });
      }
    } catch (_) {}
    return false;
  }

  function cloudSyncRecentlyFresh(maxMs) {
    maxMs = Number(maxMs) > 0 ? Number(maxMs) : RECENT_CLOUD_PULL_MS;
    try {
      if (typeof global.crozzoRuntimeCloudLastPullAt === 'function') {
        var at = Number(global.crozzoRuntimeCloudLastPullAt()) || 0;
        if (at && Date.now() - at < maxMs) return true;
      }
    } catch (_) {}
    return false;
  }

  function buildRemoteMetaFromAppliedRuntime() {
    var savedAt = 0;
    try {
      if (typeof global.crozzoGetLocalRuntimeSavedAt === 'function') savedAt = Number(global.crozzoGetLocalRuntimeSavedAt()) || 0;
    } catch (_) {}
    return { found: savedAt > 0, savedAt: savedAt, remoteAt: savedAt, source: 'applied_runtime' };
  }

  function currentSessionKey() {
    try {
      if (typeof global.getCurrentUser === 'function') {
        var u = global.getCurrentUser();
        if (u && u.id) return String(u.id);
      }
      if (global.currentSessionUserId) return String(global.currentSessionUserId);
    } catch (_) {}
    return 'anon';
  }

  function ensureOperativeSession() {
    var sk = currentSessionKey();
    if (sk !== __sessionKey) {
      __sessionKey = sk;
      __ready = { tablets: false, cajero: false };
      __operativeInitialSyncDone = false;
      try {
        delete global.__crozzoLastRemoteRuntimeMeta;
      } catch (_) {}
    }
  }

  function invalidateAllOperativeSync() {
    __ready = { tablets: false, cajero: false };
    __operativeInitialSyncDone = false;
    try {
      delete global.__crozzoLastRemoteRuntimeMeta;
    } catch (_) {}
  }

  function overlayEl() {
    return document.getElementById('crozzoOperativeSyncOverlay');
  }

  function showOverlay(msg) {
    var el = overlayEl();
    if (!el) {
      el = document.createElement('div');
      el.id = 'crozzoOperativeSyncOverlay';
      el.className = 'crozzo-operative-sync-overlay';
      el.innerHTML =
        '<div class="crozzo-operative-sync-overlay__card" role="status" aria-live="polite">' +
        '<div class="crozzo-operative-sync-overlay__spinner" aria-hidden="true"></div>' +
        '<p class="crozzo-operative-sync-overlay__title">Actualizando operación</p>' +
        '<p class="crozzo-operative-sync-overlay__msg" id="crozzoOperativeSyncMsg"></p>' +
        '</div>';
      document.body.appendChild(el);
    }
    var m = document.getElementById('crozzoOperativeSyncMsg');
    if (m) m.textContent = msg || 'Verificando nube y mesas…';
    el.style.display = 'flex';
  }

  function hideOverlay() {
    var el = overlayEl();
    if (el) el.style.display = 'none';
  }

  function canReviveFinalized() {
    try {
      if (typeof global.crozzoCanReviveFinalizedOperationalState === 'function') {
        return !!global.crozzoCanReviveFinalizedOperationalState();
      }
      if (typeof global.isSuperAdminUser === 'function') return global.isSuperAdminUser();
    } catch (_) {}
    return false;
  }

  function slotIsFinalized(tipo, ref) {
    try {
      if (typeof global.crozzoOperativeSlotIsFinalized === 'function') {
        return global.crozzoOperativeSlotIsFinalized(tipo, ref);
      }
    } catch (_) {}
    return false;
  }

  async function analyzeAndDiscardStale(phase, aOpts) {
    aOpts = aOpts || {};
    var remoteMeta = { found: false, savedAt: 0 };
    if (aOpts.remoteMeta) {
      remoteMeta = aOpts.remoteMeta;
    } else if (!aOpts.skipProbe && typeof global.crozzoProbeRemoteRuntimeMeta === 'function') {
      try {
        remoteMeta = await global.crozzoProbeRemoteRuntimeMeta(aOpts.probeOpts || {});
      } catch (_) {}
    }
    if (typeof global.crozzoAnalyzeOperationalFreshness !== 'function') return null;
    var report = global.crozzoAnalyzeOperationalFreshness(remoteMeta);
    var result = null;
    if (typeof global.crozzoDiscardStaleOperationalLocal === 'function') {
      result = global.crozzoDiscardStaleOperationalLocal(report, { respectFinalized: true });
    }
    try {
      if (result && (result.discardedSlots || result.discardedComandas)) {
        console.log('[operative-sync] freshness ' + (phase || 'run') + ':', report.verdict, result);
      }
    } catch (_) {}
    try {
      global.__crozzoLastRemoteRuntimeMeta = remoteMeta;
    } catch (_) {}
    return { report: report, result: result, remoteMeta: remoteMeta, phase: phase || 'run' };
  }

  async function pullOperationalTruth(opts) {
    opts = opts || {};
    var fastEntry = !!opts.fastEntry;
    var skipHeavyPull = !!opts.skipHeavyPull;
    var pulled = 0;
    if (typeof global.crozzoResetRuntimeSyncDedup === 'function') {
      try {
        global.crozzoResetRuntimeSyncDedup();
      } catch (_) {}
    }
    var deferPush = fastEntry || !!opts.deferPush;
    if (!opts.skipFreshnessPurge && !deferPush) {
      try {
        if (typeof global.crozzoPushPosRuntimeCloudNow === 'function') {
          await withTimeout(global.crozzoPushPosRuntimeCloudNow(), 3500, false);
        }
      } catch (_) {}
    }
    if (!opts.skipFreshnessPurge && !fastEntry && !opts.skipPreAnalyze) {
      try {
        await analyzeAndDiscardStale('pre', {
          probeOpts: { skipLan: cloudLikelyUp(), lanTimeoutMs: 1500 },
        });
      } catch (_) {}
    }
    if (!skipHeavyPull) {
      var pullMs = fastEntry ? 4500 : 8000;
      var runtimeP =
        typeof global.crozzoPullPosRuntimeCloud === 'function'
          ? withTimeout(
              global.crozzoPullPosRuntimeCloud({ quiet: true, skipRender: true, force: !!opts.force }),
              pullMs,
              false
            )
          : Promise.resolve(false);
      var comandasP =
        typeof global.crozzoPullComandasFromCloud === 'function'
          ? withTimeout(
              global.crozzoPullComandasFromCloud({
                skipPrint: true,
                skipRender: true,
                silent: true,
                reconcileStale: !fastEntry,
                notify: false,
              }),
              pullMs,
              false
            )
          : Promise.resolve(false);
      var pair = await Promise.all([runtimeP, comandasP]);
      if (pair[0]) pulled++;
      if (pair[1]) pulled++;
      if (lanSegmentLikelyUp() && typeof global.crozzoPullComandasFromLan === 'function') {
        try {
          await withTimeout(
            global.crozzoPullComandasFromLan({
              skipPrint: true,
              skipRender: true,
              force: !!opts.force,
            }),
            fastEntry ? 1800 : 3500,
            false
          );
        } catch (_) {}
      }
    }
    if (!opts.skipFreshnessPurge) {
      try {
        await analyzeAndDiscardStale('post', {
          remoteMeta: buildRemoteMetaFromAppliedRuntime(),
          skipProbe: true,
        });
      } catch (_) {}
      try {
        if (typeof global.crozzoPurgeGhostComandasForClearedSlots === 'function') {
          global.crozzoPurgeGhostComandasForClearedSlots();
        }
      } catch (_) {}
    }
    if (deferPush && typeof global.crozzoPushPosRuntimeCloudNow === 'function') {
      global.crozzoPushPosRuntimeCloudNow().catch(function () {});
    }
    return pulled;
  }

  async function ensureFreshBeforeEdit(pageKind, opts) {
    opts = opts || {};
    pageKind = pageKind === 'cajero' ? 'cajero' : 'tablets';
    ensureOperativeSession();
    if (
      pageKind === 'cajero' &&
      __operativeInitialSyncDone &&
      typeof global.crozzoIsDirectSaleOperationalContext === 'function' &&
      global.crozzoIsDirectSaleOperationalContext() &&
      !opts.force
    ) {
      if (typeof global.crozzoPrepareDirectSaleSession === 'function') {
        global.crozzoPrepareDirectSaleSession({ purgeStaleRestaurant: true, quiet: !!opts.quiet });
      }
      __operativeInitialSyncDone = true;
      __ready.cajero = true;
      __ready.tablets = __ready.tablets || false;
      return { ok: true, skipped: true, directSale: true };
    }
    if (__operativeInitialSyncDone && !opts.force) {
      __ready[pageKind] = true;
      __ready[pageKind === 'cajero' ? 'tablets' : 'cajero'] = true;
      return { ok: true, cached: true, skipped: true };
    }
    if (__ready[pageKind] && !opts.force) {
      return { ok: true, cached: true };
    }
    var myGen = ++__syncGen;
    if (__pending) {
      try {
        await __pending;
      } catch (_) {}
      if (__operativeInitialSyncDone && !opts.force) {
        return { ok: true, cached: true, skipped: true };
      }
      if (__ready[pageKind] && !opts.force) return { ok: true, cached: true };
    }
    var run = (async function () {
      var skipHeavyPull = !opts.force && cloudSyncRecentlyFresh(RECENT_CLOUD_PULL_MS);
      var fastEntry = !__operativeInitialSyncDone;
      var showUi = !opts.quiet && !opts.background && !skipHeavyPull;
      var overlayReleased = false;
      var overlayTimer = null;
      if (showUi) showOverlay(opts.message || 'Verificando nube y mesas…');
      if (showUi) {
        overlayTimer = global.setTimeout(function () {
          overlayReleased = true;
          hideOverlay();
        }, OVERLAY_MAX_MS);
      }
      try {
        await pullOperationalTruth({
          force: !!opts.force,
          fastEntry: fastEntry,
          skipHeavyPull: skipHeavyPull,
        });
        __operativeInitialSyncDone = true;
        __ready.tablets = true;
        __ready.cajero = true;
        if (myGen === __syncGen && typeof global.crozzoHandleRemoteRuntimeUiSync === 'function') {
          global.crozzoHandleRemoteRuntimeUiSync();
        }
        return { ok: true, skipHeavyPull: skipHeavyPull };
      } catch (e) {
        __operativeInitialSyncDone = true;
        __ready.tablets = true;
        __ready.cajero = true;
        return { ok: false, error: e };
      } finally {
        if (overlayTimer) global.clearTimeout(overlayTimer);
        if (myGen === __syncGen && showUi && !overlayReleased) hideOverlay();
        __pending = null;
      }
    })();
    __pending = run;
    return run;
  }

  function invalidate(pageKind) {
    if (pageKind === 'session' || pageKind === 'logout') {
      invalidateAllOperativeSync();
      return;
    }
    /* Navegar entre mesas/páginas operativas NO reinicia el sync inicial. */
  }

  function isReady(pageKind) {
    return !!__ready[pageKind === 'cajero' ? 'cajero' : 'tablets'];
  }

  function isInitialSyncComplete() {
    return __operativeInitialSyncDone;
  }

  function guardFinalizedSlot(tipo, ref, actionLabel) {
    return true;
  }

  function guardEditReady(pageKind) {
    pageKind = pageKind === 'cajero' ? 'cajero' : 'tablets';
    if (isReady(pageKind)) return true;
    if (typeof global.showToast === 'function') {
      global.showToast('Espere a que termine la actualización con la nube.', 'info');
    }
    return false;
  }

  global.CrozzoOperativeSyncGate = {
    ensureFreshBeforeEdit: ensureFreshBeforeEdit,
    analyzeAndDiscardStale: analyzeAndDiscardStale,
    invalidate: invalidate,
    isReady: isReady,
    slotIsFinalized: slotIsFinalized,
    canReviveFinalized: canReviveFinalized,
    guardFinalizedSlot: guardFinalizedSlot,
    guardEditReady: guardEditReady,
  };
  global.crozzoAnalyzeAndDiscardOperationalStale = analyzeAndDiscardStale;
  global.crozzoEnsureOperationalFreshBeforeEdit = ensureFreshBeforeEdit;
  global.crozzoInvalidateOperativeSync = invalidate;
  global.crozzoInvalidateAllOperativeSync = invalidateAllOperativeSync;
  global.crozzoOperativeSyncReady = isReady;
  global.crozzoOperativeInitialSyncComplete = isInitialSyncComplete;
  global.crozzoGuardFinalizedOperationalSlot = guardFinalizedSlot;
  global.crozzoGuardOperationalEditReady = guardEditReady;
})(typeof window !== 'undefined' ? window : globalThis);
