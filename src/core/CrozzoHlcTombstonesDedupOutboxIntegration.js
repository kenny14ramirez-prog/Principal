/**
 * Crozzo POS — HLC + Tombstones + Dedup + Outbox Integration (Fase 0)
 * -------------------------------------------------------------------
 * Integra los 4 módulos PoC en el código existente de sync.
 * Se activa con feature flags individuales.
 */
(function (global) {
  'use strict';

  // 1. HLC: observar versiones remotas en sync
  function observeRemoteHlc(remotePayload) {
    if (!global.CrozzoHlcIntegration) return;
    try {
      if (remotePayload && remotePayload._hlc) {
        global.CrozzoHlcIntegration.observe(remotePayload._hlc);
      }
    } catch (_) {}
  }

  // 2. Tombstones: verificar antes de aplicar snapshot remoto
  function shouldApplyRemote(remoteState, localState, remoteVersion, localVersion) {
    if (!global.CrozzoTombstonesIntegration) return true;
    try {
      return global.CrozzoTombstonesIntegration.shouldApplyRemote(remoteState, localState, remoteVersion, localVersion);
    } catch (_) { return true; }
  }

  // 3. Dedup: verificar duplicado antes de procesar
  function isDuplicate(tid, entityKey, payloadHash) {
    if (!global.CrozzoDedupIntegration) return { duplicate: false, reason: null };
    try {
      return global.CrozzoDedupIntegration.isDuplicate(tid, entityKey, payloadHash);
    } catch (_) { return { duplicate: false, reason: null }; }
  }

  function markProcessed(tid, entityKey, payloadHash) {
    if (!global.CrozzoDedupIntegration) return;
    try {
      global.CrozzoDedupIntegration.markProcessed(tid, entityKey, payloadHash);
    } catch (_) {}
  }

  // 4. Outbox runtime: encolar push si no hay red
  function enqueueRuntimePush(slot, cart, meta) {
    if (!global.CrozzoOutboxRuntimeIntegration) return false;
    try {
      return global.CrozzoOutboxRuntimeIntegration.enqueue(slot, cart, meta);
    } catch (_) { return false; }
  }

  function drainRuntime(processor) {
    if (!global.CrozzoOutboxRuntimeIntegration) return Promise.resolve(0);
    try {
      return global.CrozzoOutboxRuntimeIntegration.drain(processor);
    } catch (_) { return Promise.resolve(0); }
  }

  function pendingRuntimeCount() {
    if (!global.CrozzoOutboxRuntimeIntegration) return 0;
    try {
      return global.CrozzoOutboxRuntimeIntegration.pendingCount();
    } catch (_) { return 0; }
  }

  global.CrozzoHlcTombstonesDedupOutboxIntegration = {
    observeRemoteHlc: observeRemoteHlc,
    shouldApplyRemote: shouldApplyRemote,
    isDuplicate: isDuplicate,
    markProcessed: markProcessed,
    enqueueRuntimePush: enqueueRuntimePush,
    drainRuntime: drainRuntime,
    pendingRuntimeCount: pendingRuntimeCount
  };
})(typeof window !== 'undefined' ? window : globalThis);
