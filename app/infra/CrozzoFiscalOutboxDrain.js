/**
 * Crozzo — Drenaje de cola fiscal (misión: no dejar ventas huérfanas sin CUFE).
 * Se dispara en reconnect WAN / diag. Máx N por ciclo; no bloquea UI.
 */
(function (global) {
  'use strict';

  var MAX_PER_CYCLE = 3;
  var __draining = false;
  var __lastAt = 0;
  var GAP_MS = 8000;

  function safe(fn, fallback) {
    try {
      return fn();
    } catch (_) {
      return fallback;
    }
  }

  function load() {
    if (typeof global.crozzoFiscalOutboxLoad === 'function') return global.crozzoFiscalOutboxLoad() || [];
    return [];
  }

  function update(id, patch) {
    if (typeof global.crozzoFiscalOutboxUpdate === 'function') return global.crozzoFiscalOutboxUpdate(id, patch);
    return false;
  }

  function wanOk() {
    return !!safe(function () {
      return typeof global.crozzoCloudWanReady === 'function' && global.crozzoCloudWanReady();
    }, false);
  }

  async function replayEntry(entry) {
    if (!entry || !entry.id) return { ok: false, reason: 'empty' };
    if (entry.reason === 'missing_auth_token') {
      return { ok: false, reason: 'auth', skip: true };
    }
    var config = global.config;
    if (!config || typeof global.crozzoDataicoStamp !== 'function') {
      return { ok: false, reason: 'no_stamp' };
    }
    var xml = entry.xml || (entry.payload && entry.payload.invoice && entry.payload.invoice.xml_ubl) || '';
    if (!xml && entry.payload) {
      // Reintento HTTP directo con payload guardado
      var prov = typeof config.getProveedor === 'function' ? config.getProveedor() : {};
      var token = prov.apiKey || '';
      if (!token) return { ok: false, reason: 'auth', skip: true };
      var url = String(prov.baseUrl || 'https://api.dataico.com/direct/dataico_api/v2/invoices').replace(/\/$/, '');
      if (url.indexOf('/invoices') < 0) url += '/invoices';
      var headers = { 'Content-Type': 'application/json', 'Auth-token': token };
      if (prov.accountId || prov.apiSecret) headers['Dataico_account_id'] = prov.accountId || prov.apiSecret;
      var res = await fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(entry.payload) });
      var json = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) {
        update(entry.id, { status: 'retry', lastError: 'http_' + res.status, attempts: (entry.attempts || 0) + 1 });
        return { ok: false, reason: 'http' };
      }
      var data = json.invoice || json.data || json;
      var cufe = data.cufe || data.CUFE || '';
      update(entry.id, {
        status: cufe ? 'done' : 'pending',
        cufe: cufe,
        uuid: data.uuid || data.id || entry.id,
        drainedAt: new Date().toISOString(),
      });
      return { ok: !!cufe, reason: cufe ? 'ok' : 'no_cufe' };
    }
    if (!xml) {
      update(entry.id, { status: 'dead', lastError: 'no_xml_payload' });
      return { ok: false, reason: 'no_xml', skip: true };
    }
    var factura = { consecutivo: entry.consecutivo || '', total: 0 };
    var result = await global.crozzoDataicoStamp(xml, factura, config);
    if (result && result.cufe && !result.pending) {
      update(entry.id, {
        status: 'done',
        cufe: result.cufe,
        uuid: result.uuid,
        drainedAt: new Date().toISOString(),
      });
      return { ok: true, reason: 'ok' };
    }
    if (result && result.pending) {
      update(entry.id, { status: 'retry', attempts: (entry.attempts || 0) + 1, lastError: 'still_pending' });
      return { ok: false, reason: 'pending' };
    }
    update(entry.id, { status: 'retry', attempts: (entry.attempts || 0) + 1 });
    return { ok: false, reason: 'fail' };
  }

  async function drain(opts) {
    opts = opts || {};
    if (__draining) return { ok: false, reason: 'busy' };
    if (!opts.force && Date.now() - __lastAt < GAP_MS) return { ok: false, reason: 'debounce' };
    if (!opts.force && !wanOk()) return { ok: false, reason: 'no_wan' };
    __draining = true;
    __lastAt = Date.now();
    var done = 0;
    var failed = 0;
    var skipped = 0;
    try {
      var all = load().filter(function (x) {
        return x && (x.status === 'pending' || x.status === 'retry') && x.provider === 'dataico';
      });
      var slice = all.slice(0, MAX_PER_CYCLE);
      for (var i = 0; i < slice.length; i++) {
        try {
          var r = await replayEntry(slice[i]);
          if (r.ok) done++;
          else if (r.skip) skipped++;
          else failed++;
        } catch (_) {
          failed++;
          update(slice[i].id, { status: 'retry', attempts: (slice[i].attempts || 0) + 1 });
        }
      }
      safe(function () {
        global.dispatchEvent(
          new CustomEvent('crozzo-fiscal-outbox-drained', {
            detail: { done: done, failed: failed, skipped: skipped, source: opts.source || '' },
          })
        );
      });
      return { ok: true, done: done, failed: failed, skipped: skipped, queued: all.length };
    } finally {
      __draining = false;
    }
  }

  function pendingCount() {
    return load().filter(function (x) {
      return x && (x.status === 'pending' || x.status === 'retry');
    }).length;
  }

  global.CrozzoFiscalOutboxDrain = {
    drain: drain,
    pendingCount: pendingCount,
    MAX_PER_CYCLE: MAX_PER_CYCLE,
  };
  global.crozzoFiscalOutboxDrain = drain;
})(typeof window !== 'undefined' ? window : globalThis);
