/**
 * Crozzo POS — Outbox Runtime Integration (Fase 0)
 * -----------------------------------------------
 * Integra outbox runtime en PosRuntimeCloud push flow.
 */
(function (global) {
  'use strict';

  function enqueueRuntimePush(slot, cart, meta) {
    if (!global.CrozzoOutboxRuntime) return false;
    var key = 'runtime:' + (slot || 'default');
    return global.CrozzoOutboxRuntime.enqueue({
      type: 'runtime_push',
      ref: slot || 'default',
      payload: { slot: slot, cart: cart, meta: meta },
      idempotencyKey: key
    });
  }

  async function drainRuntime(processor) {
    if (!global.CrozzoOutboxRuntime) return 0;
    return await global.CrozzoOutboxRuntime.drain(processor);
  }

  function pendingCount() {
    if (!global.CrozzoOutboxRuntime) return 0;
    return global.CrozzoOutboxRuntime.pendingCount();
  }

  global.CrozzoOutboxRuntimeIntegration = {
    enqueue: enqueueRuntimePush,
    drain: drainRuntime,
    pendingCount: pendingCount
  };
})(typeof window !== 'undefined' ? window : globalThis);
