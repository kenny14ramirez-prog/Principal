/**
 * Crozzo — Conduit de pago digital (idempotente).
 * Wompi / Nequi cuando hay llaves; si no, modo manual con referencia obligatoria.
 * Outbox local: pending → in_flight → approved|failed|manual.
 */
(function (global) {
  'use strict';

  var STORAGE = 'crozzo_digital_pay_outbox_v1';
  var WOMPI_TX = 'https://production.wompi.co/v1/transactions';
  var WOMPI_TX_SANDBOX = 'https://sandbox.wompi.co/v1/transactions';

  function safe(fn, fallback) {
    try {
      return fn();
    } catch (_) {
      return fallback;
    }
  }

  function loadAll() {
    return safe(function () {
      var raw = global.localStorage && global.localStorage.getItem(STORAGE);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    }, []);
  }

  function saveAll(arr) {
    safe(function () {
      if (global.localStorage) global.localStorage.setItem(STORAGE, JSON.stringify(arr.slice(-200)));
    });
  }

  function uuid() {
    try {
      if (global.crypto && typeof global.crypto.randomUUID === 'function') return global.crypto.randomUUID();
    } catch (_) {}
    return 'pay-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  }

  function getCfg() {
    return safe(function () {
      var fromConfig =
        global.config && typeof global.config.get === 'function' ? global.config.get('digitalPay') : null;
      return Object.assign({}, global.__CROZZO_DIGITAL_PAY || {}, fromConfig || {});
    }, {});
  }

  function findByKey(key) {
    key = String(key || '');
    if (!key) return null;
    var all = loadAll();
    for (var i = 0; i < all.length; i++) {
      if (all[i] && all[i].idempotencyKey === key) return all[i];
    }
    return null;
  }

  function upsert(entry) {
    var all = loadAll();
    var idx = -1;
    for (var i = 0; i < all.length; i++) {
      if (all[i] && all[i].idempotencyKey === entry.idempotencyKey) {
        idx = i;
        break;
      }
    }
    if (idx >= 0) all[idx] = entry;
    else all.push(entry);
    saveAll(all);
    return entry;
  }

  /**
   * @param {object} opts
   * @param {string} opts.method qr_nequi|transferencia_pse|qr_bancolombia|…
   * @param {number} opts.amountCents
   * @param {string} [opts.idempotencyKey]
   * @param {string} [opts.phone]
   * @param {string} [opts.qrRef]
   * @param {string} [opts.refPago]
   * @param {boolean} [opts.allowManual]
   */
  async function ensurePaid(opts) {
    opts = opts || {};
    var method = String(opts.method || '');
    var amount = Math.round(Number(opts.amountCents || opts.amount || 0));
    var key = String(opts.idempotencyKey || uuid());
    var existing = findByKey(key);
    if (existing && (existing.status === 'approved' || existing.status === 'manual')) {
      return existing;
    }

    var entry = existing || {
      idempotencyKey: key,
      method: method,
      amountCents: amount,
      status: 'pending',
      createdAt: Date.now(),
      provider: null,
      providerRef: null,
      error: null,
    };
    entry.updatedAt = Date.now();
    entry.phone = opts.phone || entry.phone || '';
    entry.qrRef = opts.qrRef || entry.qrRef || '';
    entry.refPago = opts.refPago || entry.refPago || '';

    var cfg = getCfg();
    var hasWompi = !!(cfg.wompiPrivateKey || cfg.privateKey);
    var digital = /nequi|pse|bancolombia|wompi|datafono/i.test(method);

    if (!digital) {
      entry.status = 'approved';
      entry.provider = 'local';
      return upsert(entry);
    }

    if (hasWompi && /nequi|pse|bancolombia/i.test(method)) {
      entry.status = 'in_flight';
      entry.provider = 'wompi';
      upsert(entry);
      try {
        var result = await callWompi(entry, cfg);
        entry.status = result.status;
        entry.providerRef = result.providerRef || null;
        entry.error = result.error || null;
        entry.raw = result.raw || null;
        return upsert(entry);
      } catch (err) {
        entry.status = 'failed';
        entry.error = err && err.message ? err.message : String(err);
        upsert(entry);
        throw err;
      }
    }

    // Manual / referencia: militar = no inventar aprobación
    var ref = entry.qrRef || entry.refPago || entry.phone;
    if (ref || opts.allowManual === true) {
      entry.status = 'manual';
      entry.provider = 'manual_ref';
      entry.providerRef = ref || key;
      return upsert(entry);
    }

    entry.status = 'failed';
    entry.error = 'Falta referencia de pago digital o configurar digitalPay (Wompi/Nequi)';
    upsert(entry);
    var e = new Error(entry.error);
    e.code = 'DIGITAL_PAY_REF_REQUIRED';
    throw e;
  }

  async function callWompi(entry, cfg) {
    var pub = cfg.wompiPublicKey || cfg.publicKey || '';
    var priv = cfg.wompiPrivateKey || cfg.privateKey || '';
    var sandbox = cfg.sandbox === true || String(cfg.ambiente || '').toLowerCase() === 'test';
    var url = sandbox ? WOMPI_TX_SANDBOX : WOMPI_TX;
    var payment_method_type = 'NEQUI';
    if (/pse/i.test(entry.method)) payment_method_type = 'PSE';
    if (/bancolombia/i.test(entry.method) && !/nequi/i.test(entry.method)) payment_method_type = 'BANCOLOMBIA_TRANSFER';

    var body = {
      amount_in_cents: entry.amountCents,
      currency: 'COP',
      customer_email: cfg.customerEmail || 'pagos@crozzo.local',
      reference: entry.idempotencyKey,
      payment_method: {
        type: payment_method_type,
        phone_number: entry.phone || undefined,
      },
      payment_method_type: payment_method_type,
    };

    var res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + priv,
        'Idempotency-Key': entry.idempotencyKey,
      },
      body: JSON.stringify(body),
    });
    var json = await res.json().catch(function () {
      return {};
    });
    if (!res.ok) {
      return {
        status: 'failed',
        error: (json && (json.error || json.message)) || 'Wompi HTTP ' + res.status,
        raw: json,
        providerRef: null,
      };
    }
    var data = json.data || json;
    var st = String(data.status || data.estatus || '').toUpperCase();
    var approved = st === 'APPROVED' || st === 'APPROVED_PARTIALLY' || st === 'OK';
    var pending = st === 'PENDING' || st === 'PENDING_VALIDATION' || st === 'CREATED';
    return {
      status: approved ? 'approved' : pending ? 'pending' : 'failed',
      providerRef: data.id || data.transaction_id || null,
      error: approved || pending ? null : st || 'REJECTED',
      raw: json,
      publicKeyHint: pub ? 'set' : '',
    };
  }

  function pendingCount() {
    return loadAll().filter(function (x) {
      return x && (x.status === 'pending' || x.status === 'in_flight');
    }).length;
  }

  global.CrozzoDigitalPayConduit = {
    ensurePaid: ensurePaid,
    findByKey: findByKey,
    pendingCount: pendingCount,
    STORAGE: STORAGE,
  };
  global.crozzoDigitalPayEnsure = ensurePaid;
})(typeof window !== 'undefined' ? window : globalThis);
