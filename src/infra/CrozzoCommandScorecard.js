/**
 * Crozzo — Scorecard de mando vs mercado Colombia (precisión militar).
 * No es marketing: puntúa capacidades detectables + doctrina fija.
 * Consola: crozzoCommandScorecard() · Diag: CrozzoCommandScorecard.diagRows()
 */
(function (global) {
  'use strict';

  /** Pesos: lo que gana la guerra en CO inestable */
  var WEIGHTS = {
    offline_fleet: 2.5,
    ops_sala: 2,
    dian_honest: 2,
    digital_pay: 1.5,
    food_cost: 1.5,
    ux_ttv: 1,
    accounting: 1,
    delivery: 0.8,
  };

  /** Techos de mercado (INTEL 2026-07 — estricto) */
  var MARKET = {
    alegra: { offline_fleet: 1, ops_sala: 2, dian_honest: 5, digital_pay: 4, food_cost: 1, ux_ttv: 5, accounting: 4, delivery: 2 },
    siigo: { offline_fleet: 1, ops_sala: 3, dian_honest: 5, digital_pay: 3, food_cost: 3, ux_ttv: 4, accounting: 5, delivery: 2 },
    loggro: { offline_fleet: 2, ops_sala: 4, dian_honest: 4, digital_pay: 4, food_cost: 4, ux_ttv: 3, accounting: 3, delivery: 4 },
    gestro: { offline_fleet: 3, ops_sala: 5, dian_honest: 4, digital_pay: 3, food_cost: 2, ux_ttv: 4, accounting: 2, delivery: 2 },
    fudo: { offline_fleet: 2, ops_sala: 3, dian_honest: 3, digital_pay: 3, food_cost: 2, ux_ttv: 4, accounting: 2, delivery: 5 },
  };

  function safe(fn, fallback) {
    try {
      return fn();
    } catch (_) {
      return fallback;
    }
  }

  function detectCrozzo() {
    var path = safe(function () {
      return global.CrozzoTransportPathHealth && global.CrozzoTransportPathHealth.getHealth
        ? global.CrozzoTransportPathHealth.getHealth()
        : null;
    }, null);
    var seal = safe(function () {
      return global.CrozzoSedeReadiness && global.CrozzoSedeReadiness.evaluate
        ? global.CrozzoSedeReadiness.evaluate()
        : null;
    }, null);
    var hasMesh = !!(
      global.CrozzoOfflineGossip ||
      global.CrozzoBleMesh ||
      global.CrozzoWifiDirectBridge
    );
    var hasFanout = !!(global.CrozzoOpFanout || global.crozzoOpFanout);
    var hasPay = !!(global.CrozzoDigitalPayConduit);
    var hasFiscalDrain = !!(global.CrozzoFiscalOutboxDrain);
    var hasDian = typeof global.crozzoDataicoStamp === 'function' || typeof global.timbrarFactura === 'function';
    var hasFood =
      typeof global.crozzoReservorioRegistrarVenta === 'function' ||
      !!(global.CrozzoBundleCostos || global.CrozzoReservorio);

    var offline = 3;
    if (hasFanout && path) offline = 4;
    if (hasFanout && hasMesh) offline = 5;

    var dian = 2;
    if (hasDian) dian = 3;
    if (hasFiscalDrain && seal && seal.dian && seal.dian.ok) dian = 4;
    if (seal && seal.dian && seal.dian.mode === 'electronic' && seal.dian.ok && hasFiscalDrain) dian = 4;

    var pay = hasPay ? (seal && seal.pay && seal.pay.ok ? 4 : 3) : 1;
    var ops = hasFanout ? 4 : 3;
    if (seal && seal.operableZ0) ops = Math.min(5, ops + 0.5);

    return {
      offline_fleet: offline,
      ops_sala: ops,
      dian_honest: dian,
      digital_pay: pay,
      food_cost: hasFood ? 4 : 2,
      ux_ttv: 2.5,
      accounting: 2,
      delivery: 1,
      _meta: {
        pathLabel: path && path.label,
        seal: seal && seal.seal,
        defcon: seal && seal.defcon,
      },
    };
  }

  function weighted(scores) {
    var sum = 0;
    var wsum = 0;
    Object.keys(WEIGHTS).forEach(function (k) {
      var w = WEIGHTS[k];
      var v = Number(scores[k] || 0);
      sum += v * w;
      wsum += w;
    });
    return wsum ? sum / wsum : 0;
  }

  function evaluate() {
    var crozzo = detectCrozzo();
    var rivals = {};
    Object.keys(MARKET).forEach(function (name) {
      rivals[name] = {
        scores: MARKET[name],
        weighted: weighted(MARKET[name]),
      };
    });
    var cW = weighted(crozzo);
    var ranking = Object.keys(rivals)
      .map(function (name) {
        return { name: name, weighted: rivals[name].weighted };
      })
      .concat([{ name: 'crozzo', weighted: cW }])
      .sort(function (a, b) {
        return b.weighted - a.weighted;
      });

    var superiority = {
      vs_alegra: +(cW - rivals.alegra.weighted).toFixed(2),
      vs_gestro: +(cW - rivals.gestro.weighted).toFixed(2),
      vs_loggro: +(cW - rivals.loggro.weighted).toFixed(2),
      vs_siigo: +(cW - rivals.siigo.weighted).toFixed(2),
    };

    var out = {
      at: Date.now(),
      crozzo: crozzo,
      crozzoWeighted: +cW.toFixed(2),
      rivals: rivals,
      ranking: ranking,
      superiority: superiority,
      doctrine:
        'No empatar SaaS: ganar en offline_fleet + ops + fiscal honesto. TTV/delivery se cierran después.',
      verdict:
        superiority.vs_gestro >= 0 && superiority.vs_alegra >= 0
          ? 'SUPERIORIDAD_PONDERADA'
          : superiority.vs_alegra > 0 || superiority.vs_gestro > -0.3
            ? 'PARIDAD_TACTICA_VENTAJA_FLOTA'
            : 'REZAGO_MERCADO_CERRAR_DIAN_PAY_TTV',
    };
    safe(function () {
      global.__CROZZO_COMMAND_SCORECARD = out;
    });
    return out;
  }

  function summaryLine(r) {
    r = r || evaluate();
    return (
      'SCORE ' +
      r.crozzoWeighted +
      ' · ' +
      r.verdict +
      ' · vsGestro ' +
      r.superiority.vs_gestro +
      ' · vsAlegra ' +
      r.superiority.vs_alegra +
      ' · seal ' +
      ((r.crozzo._meta && r.crozzo._meta.seal) || '—')
    );
  }

  function diagRows() {
    var r = evaluate();
    var ok = r.verdict.indexOf('SUPERIORIDAD') === 0 || r.verdict.indexOf('PARIDAD') === 0;
    return [
      {
        id: 'command_scorecard',
        label: 'Scorecard mando vs mercado CO',
        status: ok ? 'ok' : 'warn',
        detail: summaryLine(r),
        hint:
          'Ponderado DDIL: flota/ops/fiscal pesan más que delivery. Cerrar DIAN+Wompi+TTV para SUPERIORIDAD total.',
      },
    ];
  }

  global.CrozzoCommandScorecard = {
    evaluate: evaluate,
    summaryLine: summaryLine,
    diagRows: diagRows,
    MARKET: MARKET,
    WEIGHTS: WEIGHTS,
  };
  global.crozzoCommandScorecard = evaluate;
})(typeof window !== 'undefined' ? window : globalThis);
