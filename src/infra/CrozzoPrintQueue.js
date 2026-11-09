/**
 * Crozzo POS — Cola de impresión con retry.
 * Encola trabajos de impresión (ticket/comanda/factura) y los reintenta
 * con backoff hasta tener éxito o agotar intentos.
 */
(function (global) {
  'use strict';

  var KEY = 'crozzo_print_queue_v1';
  var __queue = [];
  var __loaded = false;
  var __timer = null;
  var MAX_ATTEMPTS = 8;
  var BASE_MS = 1500;
  var MAX_MS = 30000;

  function load() {
    if (__loaded) return;
    __loaded = true;
    try {
      var raw = global.localStorage.getItem(KEY);
      if (raw) __queue = JSON.parse(raw) || [];
    } catch (_) { __queue = []; }
  }

  function persist() {
    try { global.localStorage.setItem(KEY, JSON.stringify(__queue)); } catch (_) {}
  }

  function enqueue(job) {
    load();
    if (!job) return;
    __queue.push({
      id: (job.id || ('pj_' + Date.now() + '_' + Math.random().toString(36).slice(2))),
      type: job.type || 'ticket',
      payload: job.payload || {},
      attempts: 0,
      nextAt: 0,
      createdAt: Date.now(),
    });
    persist();
    schedule(200);
  }

  function printerAvailable() {
    try {
      if (typeof global.crozzoPrinterReady === 'function') return !!global.crozzoPrinterReady();
    } catch (_) {}
    return true;
  }

  async function doPrint(job) {
    try {
      if (typeof global.crozzoPrintJob === 'function') {
        return !!(await global.crozzoPrintJob(job));
      }
      if (typeof global.printComandaNow === 'function' && job.type === 'comanda') {
        global.printComandaNow(job.payload);
        return true;
      }
      // Fallback: intentar window.print (no ideal, pero último recurso)
      return false;
    } catch (_) { return false; }
  }

  async function drain() {
    load();
    if (!__queue.length) return;
    if (!printerAvailable()) { schedule(5000); return; }
    var now = Date.now();
    var changed = false;
    for (var i = __queue.length - 1; i >= 0; i--) {
      var job = __queue[i];
      if (job.nextAt && job.nextAt > now) continue;
      job.attempts++;
      var ok = await doPrint(job);
      if (ok) {
        __queue.splice(i, 1);
        changed = true;
      } else {
        if (job.attempts >= MAX_ATTEMPTS) {
          __queue.splice(i, 1);
          changed = true;
          try { console.warn('[print-queue] descartado tras', job.attempts, 'intentos:', job.id); } catch (_) {}
        } else {
          var backoff = Math.min(MAX_MS, BASE_MS * Math.pow(1.8, job.attempts));
          job.nextAt = Date.now() + backoff;
          changed = true;
        }
      }
    }
    if (changed) persist();
    if (__queue.length) schedule(BASE_MS);
  }

  function schedule(ms) {
    if (__timer) return;
    __timer = setTimeout(function () { __timer = null; drain().catch(function () {}); }, Math.max(200, ms || BASE_MS));
  }

  global.CrozzoPrintQueue = {
    enqueue: enqueue,
    pending: function () { load(); return __queue.length; },
    drain: drain,
  };
  global.crozzoEnqueuePrint = enqueue;

  // Auto-drain periódico
  setInterval(function () { drain().catch(function () {}); }, 10000);
  setTimeout(function () { drain().catch(function () {}); }, 2000);
})(window);
