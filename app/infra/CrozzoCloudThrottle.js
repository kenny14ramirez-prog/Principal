/**
 * Regulador global de carga hacia Supabase — evita ráfagas que saturan PostgREST.
 * Usado por colas offline, router multidispositivo y ticks de estabilidad.
 */
(function (global) {
  'use strict';

  var LS_PREFS = 'crozzo_sync_prefs';
  var pressureUntil = 0;
  var lastDrainAt = 0;
  var DEFAULT_BATCH = 8;
  var DEFAULT_MIN_GAP_MS = 900;
  var DEFAULT_QUEUE_SEC = 20;

  function readPrefs() {
    try {
      var raw = global.localStorage.getItem(LS_PREFS);
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  }

  function queueIntervalMs() {
    var p = readPrefs();
    var sec = Number(p.intervalSec);
    if (!Number.isFinite(sec) || sec < 5) sec = DEFAULT_QUEUE_SEC;
    if (sec > 300) sec = 300;
    return Math.round(sec * 1000);
  }

  function batchLimit() {
    var p = readPrefs();
    var n = Number(p.batchMax);
    if (!Number.isFinite(n) || n < 1) n = DEFAULT_BATCH;
    if (n > 25) n = 25;
    if (isUnderPressure()) return Math.max(1, Math.min(3, Math.floor(n / 2)));
    return n;
  }

  function minDrainGapMs() {
    if (isUnderPressure()) return 3500;
    return DEFAULT_MIN_GAP_MS;
  }

  function isUnderPressure() {
    return Date.now() < pressureUntil;
  }

  function markPressure(ms, reason) {
    pressureUntil = Math.max(pressureUntil, Date.now() + (ms || 30000));
    try {
      global.__CROZZO_CLOUD_PRESSURE_REASON = reason || 'rate_limit';
    } catch (_) {}
  }

  function clearPressure() {
    pressureUntil = 0;
    try {
      delete global.__CROZZO_CLOUD_PRESSURE_REASON;
    } catch (_) {}
  }

  function noteHttpStatus(status, message) {
    var s = Number(status) || 0;
    var msg = String(message || '');
    if (
      s === 429 ||
      s === 503 ||
      s === 502 ||
      /rate.?limit|too many requests|timeout|timed out|ECONNRESET|fetch failed/i.test(msg)
    ) {
      markPressure(s === 429 ? 60000 : 35000, s === 429 ? '429' : 'upstream');
      return true;
    }
    return false;
  }

  function noteSupabaseError(err) {
    if (!err) return false;
    var msg = String(err.message || err.details || err.hint || err || '');
    var code = String(err.code || err.status || '');
    if (/PGRST003|57014|query.?timeout/i.test(msg)) {
      markPressure(40000, 'query_timeout');
      return true;
    }
    return noteHttpStatus(code, msg);
  }

  function canRunDrain(kind) {
    if (isUnderPressure() && kind !== 'forced') return false;
    var gap = minDrainGapMs();
    var now = Date.now();
    if (now - lastDrainAt < gap) return false;
    lastDrainAt = now;
    return true;
  }

  function snapshot() {
    return {
      underPressure: isUnderPressure(),
      pressureUntil: pressureUntil,
      reason: global.__CROZZO_CLOUD_PRESSURE_REASON || null,
      batchLimit: batchLimit(),
      queueIntervalMs: queueIntervalMs(),
      prefs: readPrefs(),
    };
  }

  /** Retardo escalonado para re-suscribir Realtime sin estampida entre dispositivos. */
  function resubscribeDelayMs(attempt) {
    var n = Math.max(0, Number(attempt) || 0);
    var base = 1800;
    var spread = 4500;
    if (typeof global.crozzoReconnectStaggerMs === 'function') {
      return global.crozzoReconnectStaggerMs(base, spread) + Math.min(n, 10) * 700;
    }
    return base + n * 1200;
  }

  global.CrozzoCloudThrottle = {
    readPrefs: readPrefs,
    queueIntervalMs: queueIntervalMs,
    batchLimit: batchLimit,
    minDrainGapMs: minDrainGapMs,
    isUnderPressure: isUnderPressure,
    markPressure: markPressure,
    clearPressure: clearPressure,
    noteHttpStatus: noteHttpStatus,
    noteSupabaseError: noteSupabaseError,
    canRunDrain: canRunDrain,
    snapshot: snapshot,
    resubscribeDelayMs: resubscribeDelayMs,
  };
})(typeof window !== 'undefined' ? window : globalThis);
