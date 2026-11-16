/**
 * Crozzo POS — Dedup Integration (Fase 0)
 * ---------------------------------------
 * Integra dedup multinivel en OperationalIngest.
 * TID seen persistente + idempotency key por entidad + content-hash fallback.
 */
(function (global) {
  'use strict';

  function isDuplicate(tid, entityKey, payloadHash) {
    // 1. TID seen (persistente)
    if (tid && global.CrozzoDedupMultilevel && global.CrozzoDedupMultilevel.isTidSeen(tid)) {
      return { duplicate: true, reason: 'tid_seen' };
    }
    // 2. Idempotency key por entidad
    if (entityKey && global.CrozzoDedupMultilevel && global.CrozzoDedupMultilevel.isAcked(entityKey)) {
      return { duplicate: true, reason: 'entity_acked' };
    }
    // 3. Content-hash fallback
    if (payloadHash && global.CrozzoDedupMultilevel) {
      var hashKey = 'content:' + payloadHash;
      if (global.CrozzoDedupMultilevel.isTidSeen(hashKey)) {
        return { duplicate: true, reason: 'content_hash' };
      }
    }
    return { duplicate: false, reason: null };
  }

  function markProcessed(tid, entityKey, payloadHash) {
    if (tid && global.CrozzoDedupMultilevel) global.CrozzoDedupMultilevel.markTidSeen(tid);
    if (entityKey && global.CrozzoDedupMultilevel) global.CrozzoDedupMultilevel.markAcked(entityKey, 'applied');
    if (payloadHash && global.CrozzoDedupMultilevel) global.CrozzoDedupMultilevel.markTidSeen('content:' + payloadHash);
  }

  global.CrozzoDedupIntegration = {
    isDuplicate: isDuplicate,
    markProcessed: markProcessed
  };
})(typeof window !== 'undefined' ? window : globalThis);
