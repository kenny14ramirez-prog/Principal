/**
 * Crozzo — Diario operativo (autoevaluación silenciosa para usuarios no técnicos).
 *
 * Ring buffer local de incidentes: sync, conectividad, errores JS, rendimiento.
 * Alimenta Autoguarda, diagnóstico (Ctrl+Alt+D) y export para soporte.
 */
(function (global) {
  'use strict';

  var KEY = 'crozzo_operative_journal_v1';
  var MAX = 500;
  var FP_WINDOW_MS = 600000;
  var __started = false;
  var __hooks = false;

  function safe(fn, def) {
    try {
      return fn();
    } catch (_) {
      return def;
    }
  }

  function load() {
    return (
      safe(function () {
        var raw = global.localStorage ? global.localStorage.getItem(KEY) : null;
        var arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
      }, []) || []
    );
  }

  function save(arr) {
    safe(function () {
      if (global.localStorage) global.localStorage.setItem(KEY, JSON.stringify(arr.slice(-MAX)));
    });
  }

  function lightHash(str) {
    var h = 5381 >>> 0;
    var s = String(str || '');
    for (var i = 0; i < s.length; i++) h = (((h << 5) + h) ^ s.charCodeAt(i)) >>> 0;
    return 'fp_' + h.toString(16);
  }

  function readContext() {
    return {
      tier: safe(function () {
        return String(global.__CROZZO_TIER_LAST || '');
      }, ''),
      transport: safe(function () {
        return typeof global.crozzoActiveSyncTransport === 'function'
          ? String(global.crozzoActiveSyncTransport({ kind: 'transport' }) || '')
          : '';
      }, ''),
      page: safe(function () {
        if (typeof global.crozzoGetActivePageId === 'function') return String(global.crozzoGetActivePageId() || '');
        return String(global.currentPage || '');
      }, ''),
      z0: safe(function () {
        return typeof global.crozzoOperationalRealtimeActive === 'function' && global.crozzoOperationalRealtimeActive();
      }, false),
    };
  }

  function fingerprint(entry) {
    return lightHash(
      String(entry.kind || '') +
        '|' +
        String(entry.code || '') +
        '|' +
        String(entry.tier || '') +
        '|' +
        String(entry.transport || '')
    );
  }

  function record(entry) {
    if (!entry) return null;
    entry = entry || {};
    var ctx = readContext();
    var rec = {
      id: 'j_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      ts: new Date().toISOString(),
      at: Date.now(),
      kind: String(entry.kind || 'event'),
      code: String(entry.code || 'generic'),
      detail: entry.detail != null ? entry.detail : null,
      tier: entry.tier != null ? String(entry.tier) : ctx.tier,
      transport: entry.transport != null ? String(entry.transport) : ctx.transport,
      page: entry.page != null ? String(entry.page) : ctx.page,
      z0: entry.z0 != null ? !!entry.z0 : ctx.z0,
    };
    rec.fp = fingerprint(rec);
    var arr = load();
    arr.push(rec);
    save(arr);
    safe(function () {
      global.__CROZZO_OPERATIVE_JOURNAL_LAST = rec;
    });
    safe(function () {
      if (global.CrozzoDevTap && typeof global.CrozzoDevTap.tap === 'function') {
        global.CrozzoDevTap.tap({ source: 'journal', kind: rec.kind, code: rec.code, fp: rec.fp });
      }
    });
    return rec;
  }

  function all() {
    return load();
  }

  function stats() {
    var arr = load();
    var byKind = {};
    var byCode = {};
    arr.forEach(function (r) {
      byKind[r.kind] = (byKind[r.kind] || 0) + 1;
      byCode[r.code] = (byCode[r.code] || 0) + 1;
    });
    return { total: arr.length, byKind: byKind, byCode: byCode };
  }

  function topFingerprints(n, windowMs) {
    n = Math.max(1, Number(n) || 3);
    windowMs = Number(windowMs) || FP_WINDOW_MS;
    var cutoff = Date.now() - windowMs;
    var counts = {};
    load().forEach(function (r) {
      if (!r.at || r.at < cutoff) return;
      var fp = r.fp || fingerprint(r);
      if (!counts[fp]) counts[fp] = { fp: fp, count: 0, code: r.code, kind: r.kind, lastAt: 0 };
      counts[fp].count++;
      if (r.at > counts[fp].lastAt) counts[fp].lastAt = r.at;
    });
    return Object.keys(counts)
      .map(function (k) {
        return counts[k];
      })
      .sort(function (a, b) {
        return b.count - a.count;
      })
      .slice(0, n);
  }

  function exportJson() {
    return JSON.stringify({ exportedAt: new Date().toISOString(), stats: stats(), events: load() }, null, 2);
  }

  function clear() {
    save([]);
  }

  function shouldIgnoreError(msg) {
    return /ResizeObserver|Script error/i.test(String(msg || ''));
  }

  function hookGlobalErrors() {
    if (__hooks || typeof global.addEventListener !== 'function') return;
    __hooks = true;
    global.addEventListener('error', function (ev) {
      var msg = ev && ev.message ? ev.message : 'Error JS';
      if (shouldIgnoreError(msg)) return;
      record({
        kind: 'error',
        code: 'js_error',
        detail: {
          message: msg,
          file: ev && ev.filename ? String(ev.filename).split('/').pop() : '',
        },
      });
    });
    global.addEventListener('unhandledrejection', function (ev) {
      var reason = ev && ev.reason;
      var msg = reason && reason.message ? reason.message : String(reason || 'Promesa rechazada');
      if (shouldIgnoreError(msg)) return;
      record({ kind: 'error', code: 'unhandled_rejection', detail: { message: msg } });
    });
    global.addEventListener('crozzo-tier-changed', function (ev) {
      var d = (ev && ev.detail) || {};
      record({
        kind: 'connectivity',
        code: 'tier_' + String(d.from || '?') + '_to_' + String(d.to || '?'),
        detail: d,
      });
    });
  }

  function start() {
    if (__started) return;
    __started = true;
    hookGlobalErrors();
  }

  global.CrozzoOperativeJournal = {
    start: start,
    record: record,
    all: all,
    stats: stats,
    topFingerprints: topFingerprints,
    exportJson: exportJson,
    clear: clear,
  };
  global.crozzoOperativeJournalRecord = record;
  global.crozzoOperativeJournalStats = stats;
})(typeof window !== 'undefined' ? window : globalThis);
