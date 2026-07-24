/**
 * Crozzo — Sello de alistamiento de sede (pre-turno).
 * Agrega transporte, identidad, OTA, fiscal y colas. Sin banners en P0:
 * consumo vía diag / window.crozzoSedeReadiness().
 *
 * DEFCON: 1=listo · 2=degradado operable · 3=riesgo · 4=no operar cobro FE/digital · 5=aislado
 */
(function (global) {
  'use strict';

  var STORAGE_FISCAL = 'crozzo_fiscal_outbox_v1';
  var STORAGE_PAY = 'crozzo_digital_pay_outbox_v1';

  function safe(fn, fallback) {
    try {
      return fn();
    } catch (_) {
      return fallback;
    }
  }

  function readQueue(key) {
    return safe(function () {
      var raw = global.localStorage && global.localStorage.getItem(key);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    }, []);
  }

  function locationId() {
    return String(
      safe(function () {
        if (typeof global.crozzoResolveCanonicalSedeId === 'function') {
          return global.crozzoResolveCanonicalSedeId() || '';
        }
        if (global.config && typeof global.config.get === 'function') {
          return global.config.get('locationId') || global.config.get('sedeId') || '';
        }
        return '';
      }, '') || ''
    ).trim();
  }

  function appVersion() {
    return String(
      safe(function () {
        var meta = global.document && global.document.querySelector('meta[name="crozzo-app-version"]');
        if (meta && meta.content) return meta.content;
        if (global.__CROZZO_APP_VERSION) return global.__CROZZO_APP_VERSION;
        return '';
      }, '') || ''
    ).trim();
  }

  function peerCount() {
    return safe(function () {
      if (global.CrozzoPeerDirectory && typeof global.CrozzoPeerDirectory.list === 'function') {
        var list = global.CrozzoPeerDirectory.list() || [];
        return list.length;
      }
      var fs = global.CrozzoFleetCommState && global.CrozzoFleetCommState.getSnapshot
        ? global.CrozzoFleetCommState.getSnapshot()
        : null;
      if (fs && typeof fs.peerCount === 'number') return fs.peerCount;
      return 0;
    }, 0);
  }

  function dianReady() {
    return safe(function () {
      if (!global.config) return { ok: false, mode: 'none', missing: ['config'] };
      var demo = typeof global.config.isDemoMode === 'function' && global.config.isDemoMode();
      var elec = typeof global.config.isElectronicMode === 'function' && global.config.isElectronicMode();
      var prov = typeof global.config.getProveedor === 'function' ? global.config.getProveedor() : null;
      var type = prov && prov.type ? String(prov.type) : 'mock';
      if (demo) return { ok: true, mode: 'demo', provider: type, missing: [] };
      if (!elec) return { ok: true, mode: 'pos_simple', provider: type, missing: [] };
      var v = typeof global.config.canGoLive === 'function' ? global.config.canGoLive() : { valid: false, missing: ['canGoLive'] };
      return {
        ok: !!v.valid && type !== 'mock',
        mode: 'electronic',
        provider: type,
        missing: v.valid ? (type === 'mock' ? ['proveedor_real'] : []) : v.missing || [],
      };
    }, { ok: false, mode: 'none', missing: ['error'], provider: '' });
  }

  function payReady() {
    return safe(function () {
      var cfg =
        (global.config && typeof global.config.get === 'function' && global.config.get('digitalPay')) ||
        global.__CROZZO_DIGITAL_PAY ||
        {};
      var wompi = !!(cfg.wompiPublicKey || cfg.wompiPrivateKey || cfg.wompi);
      var nequi = !!(cfg.nequiApiKey || cfg.nequi);
      return {
        ok: wompi || nequi,
        wompi: wompi,
        nequi: nequi,
        mode: wompi ? 'wompi' : nequi ? 'nequi' : 'manual_ref',
      };
    }, { ok: false, wompi: false, nequi: false, mode: 'manual_ref' });
  }

  function evaluate() {
    var path = safe(function () {
      return global.CrozzoTransportPathHealth && global.CrozzoTransportPathHealth.getHealth
        ? global.CrozzoTransportPathHealth.getHealth()
        : null;
    }, null);
    var mind = safe(function () {
      return global.CrozzoDeviceMind && global.CrozzoDeviceMind.getDecision
        ? global.CrozzoDeviceMind.getDecision()
        : null;
    }, null);
    var loc = locationId();
    var ver = appVersion();
    var peers = peerCount();
    var dian = dianReady();
    var pay = payReady();
    var fiscalQ = readQueue(STORAGE_FISCAL).filter(function (x) {
      return x && (x.status === 'pending' || x.status === 'retry');
    });
    var payQ = readQueue(STORAGE_PAY).filter(function (x) {
      return x && (x.status === 'pending' || x.status === 'in_flight');
    });

    var checks = [];
    function add(id, ok, severity, detail) {
      checks.push({ id: id, ok: !!ok, severity: severity || 'info', detail: String(detail || '') });
    }

    add('locationId', !!loc && loc !== 'default', 'critical', loc ? 'sede=' + loc : 'locationId vacío (KI-010)');
    add('version', !!ver, 'high', ver || 'sin meta crozzo-app-version');
    add(
      'transport',
      !!(path && path.label && path.label !== 'isolated'),
      'critical',
      path ? path.label : 'sin path health'
    );
    add('peers', peers >= 0, 'info', 'peers=' + peers);
    add(
      'dian',
      dian.ok || dian.mode === 'pos_simple' || dian.mode === 'demo',
      'high',
      dian.mode + (dian.missing && dian.missing.length ? ' falta:' + dian.missing.join(',') : '')
    );
    add('digital_pay', true, 'info', pay.mode + (pay.ok ? ' listo' : ' solo ref manual'));
    add('fiscal_outbox', fiscalQ.length === 0, 'high', 'pendientes=' + fiscalQ.length);
    add('pay_outbox', payQ.length === 0, 'medium', 'pendientes=' + payQ.length);
    var printLan = safe(function () {
      var cmd =
        (global.config && typeof global.config.getComandasConfig === 'function' && global.config.getComandasConfig()) ||
        (global.getComandasConfig && global.getComandasConfig()) ||
        null;
      if (!cmd) return { ok: false, detail: 'sin config comandas' };
      var areas = cmd.areas || [];
      var withPrinter = 0;
      for (var pi = 0; pi < areas.length; pi++) {
        if (areas[pi] && String(areas[pi].impresora || '').trim()) withPrinter++;
      }
      return {
        ok: !!cmd.autoPrint || withPrinter > 0,
        detail:
          (cmd.autoPrint ? 'autoPrint ON' : 'autoPrint OFF') +
          ' · áreas con impresora=' +
          withPrinter +
          ' (Bridge Crozzo / Tauri LAN)',
      };
    }, { ok: false, detail: 'print n/a' });
    add('print_lan', printLan.ok, 'medium', printLan.detail);
    add(
      'fiscal_drain',
      !!(global.CrozzoFiscalOutboxDrain),
      'info',
      global.CrozzoFiscalOutboxDrain ? 'drain listo' : 'sin drain'
    );

    var failedCrit = checks.filter(function (c) {
      return !c.ok && c.severity === 'critical';
    });
    var failedHigh = checks.filter(function (c) {
      return !c.ok && c.severity === 'high';
    });
    var defcon = 1;
    if (path && path.label === 'isolated') defcon = 5;
    else if (failedCrit.length) defcon = 4;
    else if (failedHigh.length || fiscalQ.length > 3) defcon = 3;
    else if (!pay.ok || peers < 1 || (path && path.meshNeeded)) defcon = 2;

    var seal =
      defcon === 1
        ? 'COMBAT_READY'
        : defcon === 2
          ? 'DEGRADED_GO'
          : defcon === 3
            ? 'CAUTION'
            : defcon === 4
              ? 'HOLD_FE_DIGITAL'
              : 'ISOLATED';

    var out = {
      at: Date.now(),
      defcon: defcon,
      seal: seal,
      locationId: loc,
      version: ver,
      peers: peers,
      pathLabel: path ? path.label : 'unknown',
      path: path,
      mind: mind,
      dian: dian,
      pay: pay,
      fiscalPending: fiscalQ.length,
      payPending: payQ.length,
      checks: checks,
      operableZ0: defcon <= 3,
      allowElectronicStamp: defcon <= 2 && dian.ok,
      allowDigitalAuto: defcon <= 2 && pay.ok,
    };
    safe(function () {
      global.__CROZZO_SEDE_READINESS = out;
    });
    return out;
  }

  function summaryLine(r) {
    r = r || evaluate();
    return (
      'SEAL ' +
      r.seal +
      ' · DEFCON ' +
      r.defcon +
      ' · ' +
      (r.pathLabel || '?') +
      ' · sede ' +
      (r.locationId || '—') +
      ' · v' +
      (r.version || '?') +
      ' · peers ' +
      r.peers +
      ' · fiscalQ ' +
      r.fiscalPending
    );
  }

  /** Léxico humano P0 (D-017). Tip puede seguir técnico. */
  function humanVoice(r) {
    r = r || evaluate();
    var d = Number(r.defcon) || 5;
    if (d <= 2) {
      return {
        text: 'Sede lista',
        tip: 'Turno operable · ' + summaryLine(r),
        kind: 'ready',
      };
    }
    if (d === 3) {
      return {
        text: 'En local · sincroniza sola',
        tip: 'Operando sin nube plena · Continúo operando · se envía solo · ' + summaryLine(r),
        kind: 'local',
      };
    }
    if (d === 4) {
      return {
        text: 'Atención · cobro simple',
        tip: 'Reserve FE/digital hasta sanar identidad o colas · ' + summaryLine(r),
        kind: 'hold',
      };
    }
    return {
      text: 'Recuperando…',
      tip: 'Buscando sede / flota · ' + summaryLine(r),
      kind: 'recover',
    };
  }

  function diagRows() {
    var r = evaluate();
    var hv = humanVoice(r);
    var status = r.defcon <= 2 ? 'ok' : r.defcon === 3 ? 'warn' : 'fail';
    var dianOk = !!(r.dian && r.dian.ok);
    var peers = Number(r.peers) || 0;
    var q = (Number(r.fiscalPending) || 0) + (Number(r.payPending) || 0);
    return [
      {
        id: 'sede_capacidades',
        label: 'Capacidades de sede',
        status: status,
        detail: hv.text + ' · ' + (r.pathLabel || 'path?'),
        hint: hv.tip,
      },
      {
        id: 'sede_flota',
        label: 'Equipos en flota',
        status: peers > 0 ? 'ok' : 'warn',
        detail: peers > 0 ? peers + ' equipo(s) visibles' : 'Solo este equipo por ahora',
        hint: peers > 0 ? 'Pedidos pueden propagarse en la sede.' : 'Empareje tablets o espere descubrimiento LAN.',
      },
      {
        id: 'sede_dian',
        label: 'Facturación DIAN',
        status: dianOk ? 'ok' : 'warn',
        detail: dianOk
          ? 'Listo · modo ' + (r.dian.mode || 'ok')
          : 'Revisar credenciales / modo electrónico',
        hint: dianOk ? 'Puede timbrar cuando el turno lo pida.' : 'Use cobro simple hasta completar configuración FE.',
      },
      {
        id: 'sede_colas',
        label: 'Colas pendientes',
        status: q === 0 ? 'ok' : 'warn',
        detail:
          q === 0
            ? 'Sin colas fiscales ni de pago'
            : r.fiscalPending + ' fiscal · ' + r.payPending + ' pago',
        hint:
          q === 0
            ? 'Nada esperando red.'
            : 'Se envían solas al recuperar nube · Continúo operando.',
      },
      {
        id: 'sede_readiness',
        label: 'Sello técnico (diag)',
        status: status,
        detail: summaryLine(r),
        hint:
          r.defcon <= 2
            ? 'Turno operable.'
            : r.defcon === 3
              ? 'Operable con cautela.'
              : 'No timbrar FE ni pagos auto hasta sanar.',
      },
    ];
  }

  global.CrozzoSedeReadiness = {
    evaluate: evaluate,
    summaryLine: summaryLine,
    humanVoice: humanVoice,
    diagRows: diagRows,
    STORAGE_FISCAL: STORAGE_FISCAL,
    STORAGE_PAY: STORAGE_PAY,
  };
  global.crozzoSedeReadiness = evaluate;
  global.crozzoSedeReadinessLine = summaryLine;
  global.crozzoSedeHumanVoice = humanVoice;
})(typeof window !== 'undefined' ? window : globalThis);
