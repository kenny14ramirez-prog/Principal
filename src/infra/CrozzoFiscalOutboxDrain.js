/**
 * Bona Origen — Drenaje de cola fiscal (misión: no dejar ventas huérfanas sin CUFE).
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

  // Fase 0: propagar CUFE a la factura en config.facturas tras drenaje
  function propagateCufeToFactura(consecutivo, cufe, uuid) {
    try {
      var cfg = global.config;
      if (!cfg || typeof cfg.getFacturas !== 'function') return;
      var facturas = cfg.getFacturas();
      if (!Array.isArray(facturas)) return;
      for (var i = 0; i < facturas.length; i++) {
        var f = facturas[i];
        if (f && String(f.consecutivo) === String(consecutivo)) {
          f.cufe = cufe || f.cufe;
          f.uuid = uuid || f.uuid;
          if (cufe) f.estado = 'timbrada';
          f.dianStatus = cufe ? 'TIMBRADA' : f.dianStatus;
          break;
        }
      }
      if (typeof cfg.save === 'function') cfg.save();
    } catch (_) {}
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
    // P1.3: procesar por payload si existe (envío real), aunque también haya xml.
    if (entry.payload) {
      // Reintento HTTP directo con payload guardado
      var prov = typeof config.getProveedor === 'function' ? config.getProveedor() : {};
      var token = prov.apiKey || '';
      if (!token) return { ok: false, reason: 'auth', skip: true };
      var url = String(prov.baseUrl || 'https://api.dataico.com/direct/dataico_api/v2/invoices').replace(/\/$/, '');
      if (url.indexOf('/invoices') < 0) url += '/invoices';
      var headers = { 'Content-Type': 'application/json', 'Auth-token': token, 'Idempotency-Key': String(entry.id || entry.consecutivo || '') };
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
      propagateCufeToFactura(entry.consecutivo, cufe, data.uuid || data.id || entry.id);
      if (cufe) {
        try {
          var cfg = global.config;
          var fs = (cfg && typeof cfg.getFacturas === 'function') ? cfg.getFacturas() : [];
          var f = null;
          for (var fi = 0; fi < (fs || []).length; fi++) {
            if (fs[fi] && String(fs[fi].consecutivo) === String(entry.consecutivo)) { f = fs[fi]; break; }
          }
          if (f && typeof global.crozzoAutoPrintFacturaIfConfigured === 'function') {
            global.crozzoAutoPrintFacturaIfConfigured(f);
          }
        } catch (_) {}
      }
      return { ok: !!cufe, reason: cufe ? 'ok' : 'no_cufe' };
    }
    if (!xml) {
      update(entry.id, { status: 'dead', lastError: 'no_xml_payload' });
      return { ok: false, reason: 'no_xml', skip: true };
    }
    var factura = { consecutivo: entry.consecutivo || '', total: 0 };
    var stampFn = (typeof global.crozzoDataicoStampSend === 'function')
      ? global.crozzoDataicoStampSend
      : (typeof global.crozzoDataicoStamp === 'function' ? global.crozzoDataicoStamp : null);
    if (!stampFn) return { ok: false, reason: 'no_stamp' };
    var result = await stampFn(xml, factura, config);
    if (result && result.cufe && !result.pending) {
      update(entry.id, {
        status: 'done',
        cufe: result.cufe,
        uuid: result.uuid,
        drainedAt: new Date().toISOString(),
      });
      propagateCufeToFactura(entry.consecutivo, result.cufe, result.uuid);
      if (result.cufe) {
        try {
          var cfg2 = global.config;
          var fs2 = (cfg2 && typeof cfg2.getFacturas === 'function') ? cfg2.getFacturas() : [];
          var f2 = null;
          for (var fi2 = 0; fi2 < (fs2 || []).length; fi2++) {
            if (fs2[fi2] && String(fs2[fi2].consecutivo) === String(entry.consecutivo)) { f2 = fs2[fi2]; break; }
          }
          if (f2 && typeof global.crozzoAutoPrintFacturaIfConfigured === 'function') {
            global.crozzoAutoPrintFacturaIfConfigured(f2);
          }
        } catch (_) {}
      }
      return { ok: true, reason: 'ok' };
    }
    if (result && result.pending) {
      update(entry.id, { status: 'retry', attempts: (entry.attempts || 0) + 1, lastError: 'still_pending' });
      return { ok: false, reason: 'pending' };
    }
    update(entry.id, { status: 'retry', attempts: (entry.attempts || 0) + 1 });
    return { ok: false, reason: 'fail' };
  }

  var LOCK_KEY = 'crozzo_fiscal_outbox_drain_lock_v1';
  var LOCK_TTL_MS = 30000;
  function acquireCrossTabLock() {
    try {
      var raw = localStorage.getItem(LOCK_KEY);
      if (raw) {
        var o = JSON.parse(raw);
        if (o && o.until && Date.now() < Number(o.until)) {
          if (o.tabId && o.tabId !== (global.__crozzoTabId || (global.__crozzoTabId = Math.random().toString(36).slice(2)))) {
            return false;
          }
        }
      }
      var tabId = global.__crozzoTabId || (global.__crozzoTabId = Math.random().toString(36).slice(2));
      safeLocalStorageSet(LOCK_KEY, JSON.stringify({ tabId: tabId, until: Date.now() + LOCK_TTL_MS }));
      return true;
    } catch (_) {
      return true;
    }
  }
  function releaseCrossTabLock() {
    try {
      var raw = localStorage.getItem(LOCK_KEY);
      var o = raw ? JSON.parse(raw) : null;
      var tabId = global.__crozzoTabId;
      if (o && o.tabId === tabId) localStorage.removeItem(LOCK_KEY);
    } catch (_) {}
  }
  async function drain(opts) {
    opts = opts || {};
    if (__draining) return { ok: false, reason: 'busy' };
    if (!acquireCrossTabLock()) return { ok: false, reason: 'busy_other_tab' };
    if (!opts.force && Date.now() - __lastAt < GAP_MS) { releaseCrossTabLock(); return { ok: false, reason: 'debounce' }; }
    if (!opts.force && !wanOk()) { releaseCrossTabLock(); return { ok: false, reason: 'no_wan' }; }
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
      releaseCrossTabLock();
      try { updateBadge(); } catch (_) {}
    }
  }

  function pendingCount() {
    return load().filter(function (x) {
      return x && (x.status === 'pending' || x.status === 'retry');
    }).length;
  }

  function updateBadge() {
    try {
      if (typeof document === 'undefined') return pendingCount();
      var n = pendingCount();
      var el = document.getElementById('crozzoFiscalOutboxBadge');
      if (!el) {
        el = document.createElement('div');
        el.id = 'crozzoFiscalOutboxBadge';
        el.setAttribute('role', 'status');
        el.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:9999;display:none;gap:2px;padding:6px 10px;border-radius:8px;background:rgba(17,24,39,0.85);color:#fff;font-size:12px;align-items:center;box-shadow:0 4px 12px rgba(0,0,0,0.25);';
        document.body.appendChild(el);
      }
      var bars = '';
      for (var i = 0; i < n; i++) {
        bars += '<span style="display:inline-block;width:4px;height:14px;background:#f59e0b;margin:0 1px;border-radius:2px;"></span>';
      }
      el.innerHTML = '<span style="margin-right:6px;font-weight:600;">Factura en cola fiscal</span>' + bars +
        (n ? ' <span style="margin-left:4px;font-weight:700;">' + n + '</span>' : '');
      el.style.display = n > 0 ? 'flex' : 'none';
      return n;
    } catch (_) {
      return pendingCount();
    }
  }
  if (typeof global !== 'undefined') global.crozzoFiscalOutboxUpdateBadge = updateBadge;
  if (typeof window !== 'undefined') window.crozzoFiscalOutboxUpdateBadge = updateBadge;

  global.CrozzoFiscalOutboxDrain = {
    drain: drain,
    pendingCount: pendingCount,
    updateBadge: updateBadge,
    MAX_PER_CYCLE: MAX_PER_CYCLE,
  };
  global.crozzoFiscalOutboxDrain = drain;
  try { updateBadge(); } catch (_) {}
})(typeof window !== 'undefined' ? window : globalThis);
