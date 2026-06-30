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

  async function analyzeAndDiscardStale(phase) {
    var remoteMeta = { found: false, savedAt: 0 };
    if (typeof global.crozzoProbeRemoteRuntimeMeta === 'function') {
      try {
        remoteMeta = await global.crozzoProbeRemoteRuntimeMeta();
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
    var pulled = 0;
    if (typeof global.crozzoResetRuntimeSyncDedup === 'function') {
      try {
        global.crozzoResetRuntimeSyncDedup();
      } catch (_) {}
    }
    if (!opts.skipFreshnessPurge) {
      try {
        if (typeof global.crozzoPushPosRuntimeCloudNow === 'function') {
          await global.crozzoPushPosRuntimeCloudNow();
        }
      } catch (_) {}
      try {
        await analyzeAndDiscardStale('pre');
      } catch (_) {}
    }
    if (typeof global.crozzoPullPosRuntimeCloud === 'function') {
      try {
        if (await global.crozzoPullPosRuntimeCloud({ quiet: true, skipRender: true, force: !!opts.force })) {
          pulled++;
        }
      } catch (_) {}
    }
    if (typeof global.crozzoPullComandasFromCloud === 'function') {
      try {
        if (
          await global.crozzoPullComandasFromCloud({
            skipPrint: true,
            skipRender: true,
            silent: true,
            reconcileStale: true,
            notify: false,
          })
        ) {
          pulled++;
        }
      } catch (_) {}
    }
    if (typeof global.crozzoPullComandasFromLan === 'function') {
      try {
        await global.crozzoPullComandasFromLan({ skipPrint: true, skipRender: true, force: true });
      } catch (_) {}
    }
    if (!opts.skipFreshnessPurge) {
      try {
        await analyzeAndDiscardStale('post');
      } catch (_) {}
      try {
        if (typeof global.crozzoPurgeGhostComandasForClearedSlots === 'function') {
          global.crozzoPurgeGhostComandasForClearedSlots();
        }
      } catch (_) {}
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
      var showUi = !opts.quiet && !opts.background;
      if (showUi) showOverlay(opts.message || 'Verificando nube y mesas…');
      try {
        await pullOperationalTruth({ force: !!opts.force });
        __operativeInitialSyncDone = true;
        __ready.tablets = true;
        __ready.cajero = true;
        if (myGen === __syncGen && typeof global.crozzoHandleRemoteRuntimeUiSync === 'function') {
          global.crozzoHandleRemoteRuntimeUiSync();
        }
        return { ok: true };
      } catch (e) {
        __operativeInitialSyncDone = true;
        __ready.tablets = true;
        __ready.cajero = true;
        return { ok: false, error: e };
      } finally {
        if (myGen === __syncGen && showUi) hideOverlay();
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
