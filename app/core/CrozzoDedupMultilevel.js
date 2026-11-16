/**
 * Crozzo POS — Dedup Multilevel PoC (Fase 0)
 * -----------------------------------------
 * Dedup multinivel: TID seen persistente + idempotency key por entidad
 * + content-hash fallback + ack registry persistente.
 */
(function (global) {
  'use strict';

  var TID_KEY = 'crozzo_tid_seen_v1';
  var ACK_KEY = 'crozzo_ack_registry_v1';
  var TTL_MS = 15 * 60 * 1000; // 15 min unificado

  function loadSeen() {
    try {
      var raw = global.localStorage.getItem(TID_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        // Limpiar expirados
        var now = Date.now();
        var clean = {};
        for (var k in parsed) {
          if (parsed[k] && (now - parsed[k]) < TTL_MS) clean[k] = parsed[k];
        }
        return clean;
      }
    } catch (_) {}
    return {};
  }

  function saveSeen(data) {
    try { global.localStorage.setItem(TID_KEY, JSON.stringify(data)); } catch (_) {}
  }

  function markTidSeen(tid) {
    if (!tid) return false;
    var seen = loadSeen();
    if (seen[tid]) return false; // ya visto
    seen[tid] = Date.now();
    saveSeen(seen);
    return true; // nuevo
  }

  function isTidSeen(tid) {
    if (!tid) return false;
    var seen = loadSeen();
    return !!seen[tid] && (Date.now() - seen[tid]) < TTL_MS;
  }

  // Idempotency key por entidad: business_id + tabla + local_id
  function entityIdKey(businessId, tabla, localId) {
    return String(businessId || 'default') + ':' + String(tabla || '') + ':' + String(localId || '');
  }

  // Ack registry
  function loadAck() {
    try {
      var raw = global.localStorage.getItem(ACK_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return {};
  }

  function saveAck(data) {
    try { global.localStorage.setItem(ACK_KEY, JSON.stringify(data)); } catch (_) {}
  }

  function markAcked(entityKey, status) {
    var acks = loadAck();
    acks[entityKey] = { status: status || 'acked', at: Date.now() };
    saveAck(acks);
  }

  function isAcked(entityKey) {
    var acks = loadAck();
    return !!(acks[entityKey] && acks[entityKey].status === 'acked');
  }

  // Content-hash fallback (simple hash)
  function simpleHash(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) {
      h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return 'h' + (h >>> 0).toString(16);
  }

  global.CrozzoDedupMultilevel = {
    markTidSeen: markTidSeen,
    isTidSeen: isTidSeen,
    entityIdKey: entityIdKey,
    markAcked: markAcked,
    isAcked: isAcked,
    simpleHash: simpleHash,
    TTL_MS: TTL_MS
  };
})(typeof window !== 'undefined' ? window : globalThis);
