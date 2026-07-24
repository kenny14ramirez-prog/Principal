/**
 * Crozzo Command Bridge — fachada única del sistema de armas de sede.
 *
 * Consolida (sin reescribir): Readiness · Scorecard · FiscalDrain · DigitalPay · PathHealth.
 * Una sola API de mando: briefing / status / diagRows / runRecovery.
 *
 * Consola: crozzoCommandBriefing()
 * Doctrina: docs/maps/MILITARY-COMMAND-DOCTRINE.md
 *
 * No banners en P0. Silencio operativo. Potencia en la arquitectura.
 */
(function (global) {
  'use strict';

  var WEAPON_ID = 'CROZZO-CMD-BRIDGE';
  var WEAPON_REV = '1.0.0';

  function safe(fn, fallback) {
    try {
      return fn();
    } catch (_) {
      return fallback;
    }
  }

  function armaments() {
    return {
      pathHealth: !!(global.CrozzoTransportPathHealth && global.CrozzoTransportPathHealth.getHealth),
      readiness: !!(global.CrozzoSedeReadiness && global.CrozzoSedeReadiness.evaluate),
      scorecard: !!(global.CrozzoCommandScorecard && global.CrozzoCommandScorecard.evaluate),
      fiscalDrain: !!(global.CrozzoFiscalOutboxDrain && global.CrozzoFiscalOutboxDrain.drain),
      digitalPay: !!(global.CrozzoDigitalPayConduit && global.CrozzoDigitalPayConduit.ensurePaid),
      deviceMind: !!(global.CrozzoDeviceMind),
      opFanout: !!(global.CrozzoOpFanout || global.crozzoOpFanout),
      dataico: typeof global.crozzoDataicoStamp === 'function',
    };
  }

  function integrity() {
    var a = armaments();
    var keys = Object.keys(a);
    var ok = 0;
    keys.forEach(function (k) {
      if (a[k]) ok++;
    });
    var ratio = keys.length ? ok / keys.length : 0;
    var grade =
      ratio >= 1
        ? 'FULL_SPECTRUM'
        : ratio >= 0.75
          ? 'MISSION_CAPABLE'
          : ratio >= 0.5
            ? 'DEGRADED_SUITE'
            : 'CRITICAL_GAPS';
    return { ok: ok, total: keys.length, ratio: +ratio.toFixed(2), grade: grade, arms: a };
  }

  function briefing(opts) {
    opts = opts || {};
    var seal = safe(function () {
      return global.CrozzoSedeReadiness.evaluate();
    }, null);
    var score = safe(function () {
      return global.CrozzoCommandScorecard.evaluate();
    }, null);
    var path = safe(function () {
      return global.CrozzoTransportPathHealth.getHealth();
    }, null);
    var fiscalPending = safe(function () {
      return global.CrozzoFiscalOutboxDrain.pendingCount
        ? global.CrozzoFiscalOutboxDrain.pendingCount()
        : 0;
    }, 0);
    var payPending = safe(function () {
      return global.CrozzoDigitalPayConduit.pendingCount
        ? global.CrozzoDigitalPayConduit.pendingCount()
        : 0;
    }, 0);
    var integ = integrity();

    var go =
      integ.grade === 'FULL_SPECTRUM' || integ.grade === 'MISSION_CAPABLE'
        ? seal && seal.operableZ0 !== false
        : false;

    var out = {
      weapon: WEAPON_ID,
      rev: WEAPON_REV,
      at: Date.now(),
      integrity: integ,
      seal: seal
        ? { defcon: seal.defcon, seal: seal.seal, locationId: seal.locationId, pathLabel: seal.pathLabel }
        : null,
      score: score
        ? {
            weighted: score.crozzoWeighted,
            verdict: score.verdict,
            vs_gestro: score.superiority && score.superiority.vs_gestro,
            vs_alegra: score.superiority && score.superiority.vs_alegra,
          }
        : null,
      pathLabel: path ? path.label : null,
      queues: { fiscal: fiscalPending, digitalPay: payPending },
      goNoGo: go ? 'GO' : 'NO-GO',
      line: '',
    };

    out.line =
      out.weapon +
      ' · ' +
      out.goNoGo +
      ' · ' +
      (out.seal ? out.seal.seal + ' D' + out.seal.defcon : 'NO_SEAL') +
      ' · ' +
      (out.score ? 'W' + out.score.weighted + ' ' + out.score.verdict : 'NO_SCORE') +
      ' · path ' +
      (out.pathLabel || '?') +
      ' · Qf' +
      fiscalPending +
      '/Qp' +
      payPending +
      ' · ' +
      integ.grade;

    safe(function () {
      global.__CROZZO_COMMAND_BRIEFING = out;
    });
    if (opts.log !== false) {
      safe(function () {
        if (global.console && console.info) console.info('[CROZZO-CMD]', out.line);
      });
    }
    return out;
  }

  function diagRows() {
    var b = briefing({ log: false });
    var rows = [];
    var status = b.goNoGo === 'GO' ? 'ok' : b.integrity.ratio >= 0.75 ? 'warn' : 'fail';
    rows.push({
      id: 'command_bridge',
      label: 'Capacidades de mando',
      status: status,
      detail: b.goNoGo === 'GO' ? 'Suite lista · ' + b.line : b.line,
      hint:
        b.goNoGo === 'GO'
          ? 'Sede operativa bajo doctrina. Detalle técnico en filas siguientes.'
          : 'Revisar integridad / seal / colas antes de FE digital.',
    });
    // Delegar detalle canónico (una sola fuente, sin duplicar lógica)
    safe(function () {
      if (global.CrozzoSedeReadiness && global.CrozzoSedeReadiness.diagRows) {
        var sr = global.CrozzoSedeReadiness.diagRows() || [];
        for (var i = 0; i < sr.length; i++) rows.push(sr[i]);
      }
    });
    safe(function () {
      if (global.CrozzoCommandScorecard && global.CrozzoCommandScorecard.diagRows) {
        var sc = global.CrozzoCommandScorecard.diagRows() || [];
        for (var j = 0; j < sc.length; j++) rows.push(sc[j]);
      }
    });
    if (b.queues.fiscal > 0) {
      rows.push({
        id: 'fiscal_outbox',
        label: 'Cola fiscal pendiente',
        status: 'warn',
        detail: b.queues.fiscal + ' documento(s) sin CUFE final.',
        hint: 'crozzoCommandRecover() o reconnect WAN — drenaje automático.',
      });
    }
    return rows;
  }

  async function runRecovery(opts) {
    opts = opts || {};
    var result = { fiscal: null, reconnect: null };
    if (global.CrozzoFiscalOutboxDrain && typeof global.CrozzoFiscalOutboxDrain.drain === 'function') {
      result.fiscal = await global.CrozzoFiscalOutboxDrain.drain({
        force: !!opts.force,
        source: opts.source || 'command_bridge',
      });
    }
    if (opts.fullSync && typeof global.crozzoRunFullReconnectSync === 'function') {
      result.reconnect = await global.crozzoRunFullReconnectSync({
        force: !!opts.force,
        source: opts.source || 'command_bridge',
      });
    }
    result.briefing = briefing({ log: false });
    return result;
  }

  function status() {
    return briefing({ log: false });
  }

  /** Lectura de estrés / escala (path health + techo 100). */
  function stressEnvelope() {
    var path = safe(function () {
      return global.CrozzoTransportPathHealth.getHealth();
    }, null);
    var lan = safe(function () {
      return global.CrozzoLanOpsSync && global.CrozzoLanOpsSync.getPathHealth
        ? global.CrozzoLanOpsSync.getPathHealth()
        : null;
    }, null);
    return {
      designCeiling: 100,
      pathLabel: path && path.label,
      fleetPeersEst: lan && lan.fleetPeersEst,
      pollScaleFactor: lan && lan.pollScaleFactor,
      runtimePollMs: lan && lan.runtimePollMs,
      comandaPollMs: lan && lan.comandaPollMs,
      softPollSkipped: lan && lan.softPollSkipped,
      digestSkipped: lan && lan.digestSkipped,
      wsPrimary: !!(lan && lan.transport === 'ws_primary'),
      doctrine:
        'Diseñado para 100-dev: WS primario + poll backoff + semáforo HTTP 64. Carga baja debe sentirse en calma.',
    };
  }

  global.CrozzoCommandBridge = {
    WEAPON_ID: WEAPON_ID,
    WEAPON_REV: WEAPON_REV,
    armaments: armaments,
    integrity: integrity,
    briefing: briefing,
    status: status,
    diagRows: diagRows,
    runRecovery: runRecovery,
    stressEnvelope: stressEnvelope,
  };
  global.crozzoCommandBriefing = briefing;
  global.crozzoCommandRecover = runRecovery;
  global.crozzoCommandStatus = status;
})(typeof window !== 'undefined' ? window : globalThis);
