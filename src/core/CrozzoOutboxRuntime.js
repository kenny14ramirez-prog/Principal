/**
 * Crozzo POS — Outbox Runtime PoC (Fase 0)
 * -----------------------------------------
 * Cola persistente de pushes de runtime (mesas/carritos) con retry y backoff.
 * Usa localStorage como PoC (IndexedDB/SQLite en producción).
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'crozzo_runtime_outbox_v1';
  var MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h
  var MAX_RETRIES = 5;
  var BASE_BACKOFF_MS = 2000;

  function load() {
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        // Limpiar expirados
        var now = Date.now();
        return (parsed || []).filter(function (e) { return (now - e.createdAt) < MAX_AGE_MS; });
      }
    } catch (_) {}
    return [];
  }

  function save(queue) {
    try { global.localStorage.setItem(STORAGE_KEY, JSON.stringify(queue)); } catch (_) {}
  }

  function enqueue(op) {
    var queue = load();
    // Dedup por idempotency key
    var key = op.idempotencyKey || (op.type + ':' + op.ref);
    if (queue.some(function (e) { return e.idempotencyKey === key; })) return false;
    queue.push({
      id: 'rt-' + Date.now() + '-' + Math.random().toString(36).slice(2),
      type: op.type || 'runtime_push',
      ref: op.ref || '',
      payload: op.payload || {},
      idempotencyKey: key,
      status: 'pending',
      attempts: 0,
      createdAt: Date.now(),
      nextRetryAt: Date.now()
    });
    save(queue);
    return true;
  }

  function getPending() {
    var queue = load();
    var now = Date.now();
    return queue.filter(function (e) {
      return e.status === 'pending' && e.nextRetryAt <= now && e.attempts < MAX_RETRIES;
    });
  }

  function markSent(id) {
    var queue = load();
    var idx = queue.findIndex(function (e) { return e.id === id; });
    if (idx >= 0) {
      queue[idx].status = 'sent';
      queue[idx].sentAt = Date.now();
      save(queue);
    }
  }

  function markFailed(id, error) {
    var queue = load();
    var idx = queue.findIndex(function (e) { return e.id === id; });
    if (idx >= 0) {
      queue[idx].attempts++;
      queue[idx].lastError = error || '';
      if (queue[idx].attempts >= MAX_RETRIES) {
        queue[idx].status = 'dead';
      } else {
        queue[idx].nextRetryAt = Date.now() + BASE_BACKOFF_MS * Math.pow(1.6, queue[idx].attempts);
      }
      save(queue);
    }
  }

  function size() { return load().length; }
  function pendingCount() { return getPending().length; }

  async function drain(processor) {
    var pending = getPending();
    for (var i = 0; i < pending.length; i++) {
      var entry = pending[i];
      try {
        if (typeof processor === 'function') await processor(entry);
        markSent(entry.id);
      } catch (e) {
        markFailed(entry.id, String(e && e.message ? e.message : e));
      }
    }
    return pending.length;
  }

  global.CrozzoOutboxRuntime = {
    enqueue: enqueue,
    getPending: getPending,
    markSent: markSent,
    markFailed: markFailed,
    size: size,
    pendingCount: pendingCount,
    drain: drain,
    MAX_RETRIES: MAX_RETRIES
  };
})(typeof window !== 'undefined' ? window : globalThis);
