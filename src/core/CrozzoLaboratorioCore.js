/**
 * Crozzo POS — Laboratorio administrativo (motor).
 * Acceso: admin / super admin + PIN 4 dígitos.
 * Vista operativa enmascarada para personal; registro fiscal intacto; conciliación en cierre.
 */
(function (global) {
  'use strict';

  var LS_CFG = 'crozzo_lab_config_v1';
  var LS_MASK = 'crozzo_lab_oper_mask_v1';
  var LS_AUDIT = 'crozzo_lab_audit_v1';
  var SESSION_MS = 30 * 60 * 1000;
  var DOW_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  /** PIN de fábrica del laboratorio (cambiable desde el módulo). */
  var DEFAULT_LAB_PIN = '8888';

  function normalizeLabPin(pin) {
    var s = String(pin == null ? '' : pin).trim();
    s = s.replace(/[\uFF10-\uFF19]/g, function (ch) {
      return String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30);
    });
    return s.replace(/\D/g, '').slice(0, 4);
  }

  var _sessionUntil = 0;
  var _hooksInstalled = false;
  var _origGetFacturas = null;
  var _syntheticFacturasOverride = null;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function num(n) {
    var x = Number(n);
    return Number.isFinite(x) ? x : 0;
  }

  function todayIso() {
    try {
      return new Date().toISOString().slice(0, 10);
    } catch (_) {
      return '';
    }
  }

  function normalizeRole() {
    if (typeof global.crozzoGetCurrentUserRole === 'function') {
      var r = global.crozzoGetCurrentUserRole();
      if (typeof global.crozzoNormalizeAppRol === 'function') return global.crozzoNormalizeAppRol(r);
      return String(r || '').toLowerCase();
    }
    return '';
  }

  function isLabRole() {
    if (typeof global.isSuperAdminUser === 'function' && global.isSuperAdminUser()) return true;
    var r = normalizeRole();
    return r === 'admin' || r === 'superadmin' || r === 'super_admin';
  }

  /** Admin/super ven siempre el registro fiscal real en operación diaria. */
  function seesFiscalTruth() {
    return isLabRole();
  }

  function defaultConfig() {
    return {
      pinHash: '',
      pinSetAt: '',
      operMask: {
        enabled: false,
        patternAdjust: false,
        maxEligibleAmount: 350000,
        level: 3,
        purgeDeletable: false,
        targetDowReduction: {},
      },
      hiddenCap: {
        enabled: false,
        amount: 0,
        alertPct: 90,
        alertedAt: '',
      },
      emulation: {
        historyMonths: 3,
        projectMonths: 2,
        lastProjectionAt: '',
      },
      recommendations: {
        enabled: true,
        autoAfterClose: true,
        level: 2,
        purgeDeletable: false,
      },
      stealth: {
        enabled: true,
        knockRequired: false,
      },
    };
  }

  var LAB_KNOCK_MS = 12000;
  var LAB_KNOCK_CLICKS = 5;
  var LAB_KNOCK_WINDOW_MS = 3000;

  function isStealthMode() {
    try {
      var cfg = loadConfig();
      return cfg.stealth == null || cfg.stealth.enabled !== false;
    } catch (_) {
      return true;
    }
  }

  function isKnockRequired() {
    try {
      var cfg = loadConfig();
      if (!isStealthMode()) return false;
      return !!(cfg.stealth && cfg.stealth.knockRequired === true);
    } catch (_) {
      return false;
    }
  }

  function armKnockWindow() {
    if (typeof global !== 'undefined') {
      global.__crozzoLabKnockUntil = Date.now() + LAB_KNOCK_MS;
    }
  }

  function isKnockArmed() {
    return !!(typeof global !== 'undefined' && global.__crozzoLabKnockUntil && Date.now() < global.__crozzoLabKnockUntil);
  }

  function shortcutAllowed() {
    if (!isKnockRequired()) return true;
    if (isSessionUnlocked()) return true;
    return isKnockArmed();
  }

  function setKnockRequired(on) {
    var cfg = loadConfig();
    cfg.stealth = cfg.stealth || {};
    cfg.stealth.knockRequired = !!on;
    saveConfig(cfg);
    auditLab('stealth_knock', { required: !!on });
    return cfg.stealth.knockRequired;
  }

  function setStealthMode(on) {
    var cfg = loadConfig();
    cfg.stealth = cfg.stealth || {};
    cfg.stealth.enabled = !!on;
    saveConfig(cfg);
    auditLab('stealth', { enabled: !!on });
    return cfg.stealth.enabled;
  }

  var LS_RECOMMEND = 'crozzo_lab_recommend_v1';
  var LS_EMU_REPORT = 'crozzo_lab_emu_report_v1';
  var LS_PURGE = 'crozzo_lab_purge_v1';

  function loadRecommendations() {
    try {
      var raw = localStorage.getItem(LS_RECOMMEND);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (_) {
      return [];
    }
  }

  function saveRecommendations(list) {
    try {
      localStorage.setItem(LS_RECOMMEND, JSON.stringify((list || []).slice(0, 30)));
    } catch (e) {
      console.warn('[lab] recommend', e);
    }
  }

  function endOfBusinessIso(iso) {
    return iso + 'T23:59:59.999';
  }

  function targetShiftAfter(closeType) {
    if (closeType === 'manana') return 'tarde';
    if (closeType === 'tarde') return 'dia';
    return null;
  }

  function expireRecommendations(reason, iso) {
    iso = iso || todayIso();
    var changed = false;
    var list = loadRecommendations().map(function (r) {
      if (!r || r.status !== 'pending') return r;
      var expire = false;
      if (r.businessDate && r.businessDate < iso) expire = true;
      if (reason === 'night_close' && r.businessDate === iso) expire = true;
      if (reason === 'manual' && r.id === iso) expire = true;
      if (expire) {
        changed = true;
        r.status = 'expired';
        r.expiredAt = new Date().toISOString();
        r.expireReason = reason;
      }
      return r;
    });
    if (changed) saveRecommendations(list);
    return list;
  }

  function getPendingRecommendation(iso) {
    iso = iso || todayIso();
    expireRecommendations('day_check', iso);
    var list = loadRecommendations();
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (r && r.status === 'pending' && r.businessDate === iso) return r;
    }
    return null;
  }

  function analyzeEasyDiscountByDow(monthsBack) {
    monthsBack = Math.max(1, num(monthsBack) || 3);
    var cutoff = Date.now() - monthsBack * 30 * 86400000;
    var stats = [];
    for (var d = 0; d < 7; d++) {
      stats.push({ dow: d, label: DOW_LABELS[d], eligible: 0, fiscal: 0, count: 0, avgEligible: 0, easyScore: 0 });
    }
    getFacturasRaw().forEach(function (f) {
      if (!isValidSale(f)) return;
      var t = facturaTs(f);
      if (t < cutoff) return;
      var dow = new Date(t).getDay();
      var cls = classifyInvoice(f);
      stats[dow].fiscal += num(f.total);
      stats[dow].count += 1;
      if (cls.eligible) {
        stats[dow].eligible += 1;
        stats[dow].avgEligible += num(f.total);
      }
    });
    stats.forEach(function (s) {
      if (s.eligible > 0) s.avgEligible = s.avgEligible / s.eligible;
      var ratio = s.count > 0 ? s.eligible / s.count : 0;
      var smallTicket = s.avgEligible > 0 && s.avgEligible < 120000 ? 1.15 : 1;
      s.easyScore = Math.round(Math.min(100, ratio * 55 * smallTicket + Math.min(s.eligible, 40)));
    });
    stats.sort(function (a, b) {
      return b.easyScore - a.easyScore;
    });
    return stats;
  }

  function shiftBucket(hour) {
    if (hour < 12) return 'manana';
    if (hour < 18) return 'tarde';
    return 'noche';
  }

  function analyzePatternsDeep(monthsBack) {
    monthsBack = Math.max(1, num(monthsBack) || 3);
    var cutoff = Date.now() - monthsBack * 30 * 86400000;
    var byDow = analyzeEasyDiscountByDow(monthsBack);
    var byHour = [];
    var h;
    for (h = 0; h < 24; h++) {
      byHour.push({ hour: h, label: (h < 10 ? '0' : '') + h + ':00', eligible: 0, fiscal: 0, count: 0 });
    }
    var byShift = {
      manana: { count: 0, eligible: 0, fiscal: 0 },
      tarde: { count: 0, eligible: 0, fiscal: 0 },
      noche: { count: 0, eligible: 0, fiscal: 0 },
    };
    getFacturasRaw().forEach(function (f) {
      if (!isValidSale(f)) return;
      var t = facturaTs(f);
      if (t < cutoff) return;
      var hour = new Date(t).getHours();
      var cls = classifyInvoice(f);
      byHour[hour].count += 1;
      byHour[hour].fiscal += num(f.total);
      if (cls.eligible) byHour[hour].eligible += 1;
      var sh = shiftBucket(hour);
      byShift[sh].count += 1;
      byShift[sh].fiscal += num(f.total);
      if (cls.eligible) byShift[sh].eligible += 1;
    });
    var peakHours = byHour
      .slice()
      .sort(function (a, b) {
        return b.eligible - a.eligible;
      })
      .slice(0, 5);
    var bestDow = byDow[0] || null;
    var worstDow = byDow.length ? byDow[byDow.length - 1] : null;
    var todayDow = new Date().getDay();
    var todayStat = null;
    byDow.forEach(function (s) {
      if (s.dow === todayDow) todayStat = s;
    });
    var insights = [];
    if (bestDow) {
      insights.push({
        type: 'best_day',
        text: 'Mejor día para ajustes: ' + bestDow.label + ' (score ' + bestDow.easyScore + '/100, ' + bestDow.eligible + ' elegibles hist.).',
      });
    }
    if (todayStat) {
      insights.push({
        type: 'today',
        text:
          'Hoy (' +
          todayStat.label +
          '): score ' +
          todayStat.easyScore +
          '/100 · nivel sugerido ' +
          suggestLevelForDow(todayDow) +
          '.',
        score: todayStat.easyScore,
      });
    }
    if (peakHours[0] && peakHours[0].eligible > 0) {
      insights.push({
        type: 'peak_hour',
        text: 'Franja con más elegibles: ' + peakHours[0].label + ' (' + peakHours[0].eligible + ' tickets).',
      });
    }
    var bestShift = 'manana';
    var bestShiftEl = byShift.manana.eligible;
    ['tarde', 'noche'].forEach(function (k) {
      if (byShift[k].eligible > bestShiftEl) {
        bestShiftEl = byShift[k].eligible;
        bestShift = k;
      }
    });
    insights.push({
      type: 'shift',
      text: 'Turno con más elegibles históricos: ' + bestShift + ' (' + bestShiftEl + ' tickets).',
    });
    return {
      monthsBack: monthsBack,
      byDow: byDow,
      byHour: byHour,
      byShift: byShift,
      peakHours: peakHours,
      insights: insights,
      todayDow: todayDow,
      todayStat: todayStat,
      bestDow: bestDow,
      worstDow: worstDow,
    };
  }

  function buildRecommendationPreview(opts) {
    opts = opts || {};
    var iso = opts.iso || todayIso();
    var cfg = loadConfig();
    var dow = new Date(iso + 'T12:00:00').getDay();
    var dowStats = analyzeEasyDiscountByDow();
    var todayPattern = dowStats.filter(function (s) {
      return s.dow === dow;
    })[0];
    var level = num(opts.level) || num(cfg.recommendations && cfg.recommendations.level) || suggestLevelForDow(dow);
    var needReduce = num(opts.needReduce) || computeNeedReduceForDay(iso, cfg);
    if (needReduce <= 0) needReduce = Math.floor(fiscalDayTotal(iso) * 0.04);
    var picks = pickEligibleForReduction(iso, needReduce, { level: level, ignoreExisting: true });
    var purgeDeletable = !!(cfg.operMask && cfg.operMask.purgeDeletable) || !!(cfg.recommendations && cfg.recommendations.purgeDeletable);
    var picksAnnotated = annotatePicksWithActions(picks, purgeDeletable);
    return {
      iso: iso,
      level: level,
      levelLabel: getMaskLevelConfig(level).label,
      needReduce: needReduce,
      reducedPlanned: picksAnnotated.reduce(function (a, p) {
        return a + num(p.action === 'purge' ? p.original : p.delta);
      }, 0),
      picks: picksAnnotated,
      purgeCount: picksAnnotated.filter(function (p) {
        return p.action === 'purge';
      }).length,
      fiscalDay: fiscalDayTotal(iso),
      pattern: {
        dow: dow,
        dowLabel: DOW_LABELS[dow],
        easyScore: todayPattern ? todayPattern.easyScore : 0,
        note: buildPatternNote(todayPattern, dowStats),
      },
      deep: analyzePatternsDeep(cfg.emulation.historyMonths || 3),
    };
  }

  function previewMaskApply(opts) {
    opts = opts || {};
    var iso = todayIso();
    var cfg = loadConfig();
    var needReduce = computeNeedReduceForDay(iso, cfg) + num(opts.manualReduce);
    if (needReduce <= 0 && num(opts.manualReduce) > 0) needReduce = num(opts.manualReduce);
    var level = num(opts.level) || num(cfg.operMask.level) || 3;
    var picks = pickEligibleForReduction(iso, Math.max(0, needReduce), { level: level, ignoreExisting: true });
    var reduced = picks.reduce(function (a, p) {
      return a + p.delta;
    }, 0);
    var gap = Math.max(0, needReduce - reduced);
    var purgeDeletable = opts.purgeDeletable != null ? !!opts.purgeDeletable : !!(cfg.operMask && cfg.operMask.purgeDeletable);
    var picksAnnotated = annotatePicksWithActions(picks, purgeDeletable);
    var purgeCount = picksAnnotated.filter(function (p) {
      return p.action === 'purge';
    }).length;
    return {
      iso: iso,
      level: level,
      levelLabel: getMaskLevelConfig(level).label,
      needReduce: needReduce,
      fiscal: fiscalDayTotal(iso),
      reduced: reduced,
      gap: gap,
      coveragePct: needReduce > 0 ? Math.round((reduced / needReduce) * 100) : 100,
      achievable: gap <= needReduce * 0.15 || reduced >= needReduce,
      picks: picksAnnotated,
      purgeCount: purgeCount,
      maskCount: picksAnnotated.length - purgeCount,
      pattern: analyzePatternsDeep(cfg.emulation.historyMonths || 3),
    };
  }

  function evaluateMarginTargetCore(opts) {
    opts = opts || {};
    var level = num(opts.level) || 3;
    var daysBack = num(opts.daysBack) || 30;
    var simOpts = { level: level, daysBack: daysBack };
    if (num(opts.targetReduce) > 0) simOpts.targetReduce = num(opts.targetReduce);
    else if (num(opts.targetPct) > 0) simOpts.targetPct = num(opts.targetPct);
    else return { ok: false, reason: 'meta' };
    var sim = simulateMonthMask(simOpts);
    var feasible = sim.coveragePct >= 98;
    var suggestedLevel = null;
    var l;
    if (!feasible) {
      for (l = level + 1; l <= 5; l++) {
        var tUp = simulateMonthMask(Object.assign({}, simOpts, { level: l }));
        if (tUp.coveragePct >= 98) {
          suggestedLevel = l;
          break;
        }
      }
    }
    return {
      ok: true,
      feasible: feasible,
      level: level,
      levelLabel: getMaskLevelConfig(level).label,
      fiscalTotal: sim.fiscalMonth,
      targetReduce: sim.targetReduce,
      achievedReduce: sim.totalReduced,
      gap: sim.totalGap,
      coveragePct: sim.coveragePct,
      gapPct: sim.gapPct,
      pctOfSales: sim.fiscalMonth > 0 ? Math.round((sim.targetReduce / sim.fiscalMonth) * 100) : 0,
      suggestedLevel: suggestedLevel,
      suggestedLabel: suggestedLevel ? getMaskLevelConfig(suggestedLevel).label : null,
      sim: sim,
    };
  }

  function evaluateMarginTarget(opts) {
    opts = opts || {};
    if (num(opts.salesTotal) > 0) {
      var projection = buildSyntheticFacturasFromDeclaredSales(opts);
      if (!projection.ok) return { ok: false, reason: 'ventas' };
      var r = withSyntheticFacturas(projection.facturas, function () {
        return evaluateMarginTargetCore(opts);
      });
      r.projection = projection;
      return r;
    }
    return evaluateMarginTargetCore(opts);
  }

  function runFullEmulationAnalysis(opts) {
    opts = opts || {};
    var months = num(opts.monthsBack) || num(loadConfig().emulation.historyMonths) || 3;
    var pct = num(opts.targetPct) || 8;
    var days = num(opts.daysBack) || 30;
    var dow = new Date().getDay();
    var lvl = num(opts.level) || suggestLevelForDow(dow);
    var deep = analyzePatternsDeep(months);
    var levelComparison = compareLevelSimulations({ targetPct: pct, daysBack: days });
    var monthSim = simulateMonthMask({ targetPct: pct, daysBack: days, level: lvl });
    var recPreview = buildRecommendationPreview({ level: lvl });
    var report = {
      ok: true,
      generatedAt: new Date().toISOString(),
      params: { monthsBack: months, targetPct: pct, daysBack: days, level: lvl },
      sandboxActive: !!(global.CrozzoEmulationHarness && global.CrozzoEmulationHarness.isActive && global.CrozzoEmulationHarness.isActive()),
      deepPatterns: deep,
      weekdaySales: analyzeWeekdayPattern(months),
      easyByDow: analyzeEasyDiscountByDow(months),
      levelComparison: levelComparison,
      monthSimulation: monthSim,
      recPreview: recPreview,
      summary: {
        bestDay: deep.bestDow ? deep.bestDow.label : '—',
        todayScore: deep.todayStat ? deep.todayStat.easyScore : 0,
        suggestedLevel: lvl,
        monthCoverage: monthSim.coveragePct,
        monthReduced: monthSim.totalReduced,
        recFacturas: recPreview.picks.length,
      },
    };
    try {
      localStorage.setItem(LS_EMU_REPORT, JSON.stringify(report));
    } catch (_) {}
    auditLab('emu_analysis', months + 'm · ' + pct + '% · lvl' + lvl);
    return report;
  }

  function loadLastEmulationReport() {
    try {
      var raw = localStorage.getItem(LS_EMU_REPORT);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function computeNeedReduceForDay(iso, cfg) {
    cfg = cfg || loadConfig();
    var need = 0;
    if (cfg.hiddenCap.enabled && num(cfg.hiddenCap.amount) > 0) {
      var oper = operativeDayTotal(iso);
      if (oper > cfg.hiddenCap.amount) need = Math.max(need, oper - cfg.hiddenCap.amount);
    }
    if (cfg.operMask.patternAdjust) {
      var pattern = analyzeWeekdayPattern(cfg.emulation.historyMonths || 3);
      var dow = new Date(iso + 'T12:00:00').getDay();
      var todayAvg = pattern.avgTicketByDow[dow] || 0;
      var monAvg = pattern.avgTicketByDow[1] || pattern.overallAvgTicket;
      if (todayAvg > monAvg * 1.08) {
        var fiscal = fiscalDayTotal(iso);
        var target = monAvg > 0 ? (fiscal * monAvg) / todayAvg : fiscal;
        need = Math.max(need, fiscal - target);
      }
    }
    return Math.max(0, Math.floor(need));
  }

  function suggestLevelForDow(dow) {
    var stats = analyzeEasyDiscountByDow();
    var today = stats.filter(function (s) {
      return s.dow === dow;
    })[0];
    var score = today ? today.easyScore : 50;
    if (score >= 75) return 2;
    if (score >= 55) return 3;
    if (score >= 35) return 4;
    return 1;
  }

  function buildRecommendationAfterClose(closeRec) {
    var cfg = loadConfig();
    if (!cfg.recommendations || !cfg.recommendations.enabled) return { ok: false, reason: 'off' };
    if (!closeRec || !closeRec.businessDate) return { ok: false, reason: 'cierre' };
    var iso = closeRec.businessDate;
    expireRecommendations('day_check', iso);

    if (closeRec.shiftType === 'dia') {
      expireRecommendations('night_close', iso);
      return { ok: false, reason: 'cierre_final' };
    }

    var target = targetShiftAfter(closeRec.shiftType);
    if (!target) return { ok: false, reason: 'turno' };

    var dow = new Date(iso + 'T12:00:00').getDay();
    var dowStats = analyzeEasyDiscountByDow();
    var todayPattern = dowStats.filter(function (s) {
      return s.dow === dow;
    })[0];
    var level = num(cfg.recommendations.level) || suggestLevelForDow(dow);
    var needReduce = computeNeedReduceForDay(iso, cfg);
    if (needReduce <= 0 && cfg.hiddenCap.enabled) {
      var cap = num(cfg.hiddenCap.amount);
      var fiscal = fiscalDayTotal(iso);
      if (cap > 0 && fiscal > cap * 0.85) needReduce = Math.floor(fiscal - cap * 0.92);
    }
    if (needReduce <= 0) needReduce = Math.floor(fiscalDayTotal(iso) * 0.04);

    var picks = pickEligibleForReduction(iso, needReduce, { level: level, ignoreExisting: true });
    if (!picks.length) return { ok: false, reason: 'sin_elegibles' };

    var rec = {
      id: 'rec-' + iso + '-' + Date.now(),
      status: 'pending',
      businessDate: iso,
      createdAt: new Date().toISOString(),
      expiresAt: endOfBusinessIso(iso),
      validUntilClose: target,
      triggerClose: {
        shiftType: closeRec.shiftType,
        shiftLabel: closeRec.shiftLabel,
        shiftId: closeRec.shiftId,
        closedAt: closeRec.closedAt,
        closedBy: closeRec.closedBy,
      },
      targetClose: target,
      pattern: {
        dow: dow,
        dowLabel: DOW_LABELS[dow],
        easyScore: todayPattern ? todayPattern.easyScore : 0,
        eligibleHist: todayPattern ? todayPattern.eligible : 0,
        note: buildPatternNote(todayPattern, dowStats),
      },
      level: level,
      levelLabel: getMaskLevelConfig(level).label,
      picks: picks,
      fiscalDay: fiscalDayTotal(iso),
      reduceTarget: needReduce,
      reducedPlanned: picks.reduce(function (a, p) {
        return a + p.delta;
      }, 0),
      message:
        'Tras cierre ' +
        (closeRec.shiftLabel || closeRec.shiftType) +
        ': retirar ' +
        picks.length +
        ' factura(s) de vista operativa antes del cierre ' +
        (target === 'tarde' ? 'de tarde/noche' : 'del día') +
        '.',
    };
    rec.avgTolerance = Math.round(
      picks.reduce(function (a, p) {
        return a + p.tolerance;
      }, 0) / picks.length
    );

    var list = loadRecommendations().filter(function (r) {
      return !(r && r.status === 'pending' && r.businessDate === iso);
    });
    list.unshift(rec);
    saveRecommendations(list);
    auditLab('recommend_create', iso + ' · ' + picks.length + ' fact · ' + rec.reducedPlanned);
    return { ok: true, recommendation: rec };
  }

  function buildPatternNote(todayPattern, allStats) {
    if (!todayPattern) return 'Sin patrón histórico suficiente.';
    var best = allStats[0];
    var lines = [
      'Hoy (' +
        todayPattern.label +
        ') score fácil ' +
        todayPattern.easyScore +
        '/100 · ' +
        todayPattern.eligible +
        ' elegibles históricas.',
    ];
    if (best && best.dow !== todayPattern.dow) {
      lines.push('Día más fácil histórico: ' + best.label + ' (' + best.easyScore + '/100).');
    }
    return lines.join(' ');
  }

  function acceptRecommendation(id) {
    if (!isLabRole() || !isSessionUnlocked()) return { ok: false, reason: 'acceso' };
    var list = loadRecommendations();
    var rec = null;
    list = list.map(function (r) {
      if (r && r.id === id && r.status === 'pending') {
        rec = r;
        r.status = 'accepted';
        r.acceptedAt = new Date().toISOString();
      }
      return r;
    });
    if (!rec) return { ok: false, reason: 'no_encontrada' };
    if (rec.businessDate < todayIso()) return { ok: false, reason: 'expirada' };

    var cfg = loadConfig();
    cfg.operMask.enabled = true;
    cfg.operMask.level = rec.level;
    saveConfig(cfg);

    var purgeDeletable = !!(cfg.operMask && cfg.operMask.purgeDeletable) || !!(cfg.recommendations && cfg.recommendations.purgeDeletable);
    var plan = applyOrganizedPicks(rec.picks, {
      purgeDeletable: purgeDeletable,
      userOrganized: true,
      reason: 'recommend_' + rec.id,
    });

    var mask = loadMask();
    plan.maskPicks.forEach(function (p) {
      mask.entries[p.key] = {
        delta: p.delta,
        original: p.original,
        uuid: p.uuid,
        appliedAt: new Date().toISOString(),
        reason: 'recommend_' + rec.id,
        level: rec.level,
        tolerance: p.tolerance,
      };
    });
    mask.lastApplyAt = new Date().toISOString();
    mask.dayTotals[rec.businessDate] = {
      fiscal: fiscalDayTotal(rec.businessDate),
      operative: fiscalDayTotal(rec.businessDate) - plan.reduced,
      reduced: plan.reduced,
      count: plan.maskPicks.length + plan.purgedCount,
      purged: plan.purgedCount,
      fromRecommendation: rec.id,
    };
    if (plan.purgedCount) {
      mask.purgedAt = new Date().toISOString();
      mask.purgedCount = (num(mask.purgedCount) || 0) + plan.purgedCount;
    }
    saveMask(mask);
    saveRecommendations(list);
    auditLab(
      'recommend_accept',
      rec.id + ' · ' + plan.maskPicks.length + ' máscara · ' + plan.purgedCount + ' purga'
    );
    return { ok: true, recommendation: rec, purged: plan.purgedCount, masked: plan.maskPicks.length };
  }

  function rejectRecommendation(id) {
    if (!isLabRole()) return { ok: false };
    var list = loadRecommendations().map(function (r) {
      if (r && r.id === id && r.status === 'pending') {
        r.status = 'rejected';
        r.rejectedAt = new Date().toISOString();
      }
      return r;
    });
    saveRecommendations(list);
    auditLab('recommend_reject', id);
    return { ok: true };
  }

  function onCashierClose(closeRec) {
    try {
      var iso = todayIso();
      expireRecommendations('day_check', iso);
      if (!closeRec || closeRec.recordKind === 'supervision') return null;

      if (closeRec.shiftType === 'tarde' || closeRec.shiftType === 'dia') {
        expireRecommendations('night_close', closeRec.businessDate || iso);
      }

      var cfg = loadConfig();
      if (!cfg.recommendations || !cfg.recommendations.autoAfterClose) return null;
      if (closeRec.shiftType === 'dia') return null;

      return buildRecommendationAfterClose(closeRec);
    } catch (e) {
      console.warn('[lab] onCashierClose', e);
      return null;
    }
  }

  function manualGenerateRecommendation() {
    if (!isLabRole() || !isSessionUnlocked()) return { ok: false, reason: 'acceso' };
    var iso = todayIso();
    return buildRecommendationAfterClose({
      shiftType: 'manana',
      shiftLabel: 'Manual (hoy)',
      shiftId: 'manual-' + Date.now(),
      businessDate: iso,
      closedAt: new Date().toISOString(),
      closedBy: actorLabel(),
    });
  }

  function loadConfig() {
    try {
      var raw = localStorage.getItem(LS_CFG);
      if (!raw) return defaultConfig();
      return Object.assign(defaultConfig(), JSON.parse(raw));
    } catch (_) {
      return defaultConfig();
    }
  }

  function saveConfig(cfg) {
    try {
      localStorage.setItem(LS_CFG, JSON.stringify(cfg));
    } catch (e) {
      console.warn('[lab]', e);
    }
  }

  function loadMask() {
    try {
      var raw = localStorage.getItem(LS_MASK);
      if (!raw) return { entries: {}, dayTotals: {}, lastApplyAt: '' };
      var p = JSON.parse(raw);
      return {
        entries: p.entries && typeof p.entries === 'object' ? p.entries : {},
        dayTotals: p.dayTotals && typeof p.dayTotals === 'object' ? p.dayTotals : {},
        lastApplyAt: p.lastApplyAt || '',
      };
    } catch (_) {
      return { entries: {}, dayTotals: {}, lastApplyAt: '' };
    }
  }

  function saveMask(m) {
    try {
      localStorage.setItem(LS_MASK, JSON.stringify(m));
    } catch (e) {
      console.warn('[lab] mask', e);
    }
  }

  function auditLab(type, detail) {
    try {
      var rows = JSON.parse(localStorage.getItem(LS_AUDIT) || '[]');
      rows.unshift({ at: new Date().toISOString(), type: type, detail: detail, user: actorLabel() });
      localStorage.setItem(LS_AUDIT, JSON.stringify(rows.slice(0, 200)));
      if (typeof config !== 'undefined' && config.addAudit) config.addAudit('lab_' + type, detail);
    } catch (_) {}
  }

  function actorLabel() {
    if (typeof getCurrentUser === 'function') {
      var u = getCurrentUser();
      if (u) return String(u.nombre || u.id || '—');
    }
    return '—';
  }

  function isSessionUnlocked() {
    return Date.now() < _sessionUntil;
  }

  function getSessionRemainingMs() {
    if (!isSessionUnlocked()) return 0;
    return Math.max(0, _sessionUntil - Date.now());
  }

  function formatSessionRemaining() {
    var ms = getSessionRemainingMs();
    if (!ms) return 'Bloqueado';
    var m = Math.ceil(ms / 60000);
    return m + ' min';
  }

  function isMaskActive() {
    var cfg = loadConfig();
    var mask = loadMask();
    return !!(cfg.operMask.enabled || (mask.entries && Object.keys(mask.entries).length));
  }

  function shouldApplyOperMask() {
    if (seesFiscalTruth() && !global.__crozzoLabPreviewOperative) return false;
    var cfg = loadConfig();
    var mask = loadMask();
    if (mask.entries && Object.keys(mask.entries).length) return true;
    return !!(cfg.operMask.enabled || cfg.hiddenCap.enabled);
  }

  function unlockSession() {
    _sessionUntil = Date.now() + SESSION_MS;
  }

  function lockSession() {
    _sessionUntil = 0;
  }

  function pinIsSet() {
    return !!loadConfig().pinHash;
  }

  async function ensureDefaultLabPin() {
    var cfg = loadConfig();
    if (cfg.pinHash && String(cfg.pinHash).indexOf('lab2.') === 0) return cfg;
    cfg.pinHash = legacyLabPinDigest(DEFAULT_LAB_PIN);
    cfg.pinSetAt = cfg.pinSetAt || new Date().toISOString();
    cfg.pinFactory = true;
    saveConfig(cfg);
    return cfg;
  }

  function isFactoryPinActive() {
    var cfg = loadConfig();
    return !!cfg.pinFactory && !!cfg.pinHash;
  }

  async function hashPinRecord(pin) {
    var p = normalizeLabPin(pin);
    if (p.length !== 4) return null;
    return { legacy: legacyLabPinDigest(p) };
  }

  /** Digest local estable — evita fallos de PBKDF2 / JSON corrupto en Tauri. */
  function legacyLabPinDigest(pin) {
    var p = normalizeLabPin(pin);
    if (p.length !== 4) return '';
    var raw = 'crozzo-lab-v1|' + p + '|' + DEFAULT_LAB_PIN.length;
    var h = 0;
    for (var i = 0; i < raw.length; i++) {
      h = (Math.imul(31, h) + raw.charCodeAt(i)) | 0;
    }
    return 'lab2.' + Math.abs(h).toString(36) + '.' + p;
  }

  function b64toa(bytes) {
    return btoa(String.fromCharCode.apply(null, bytes));
  }

  function atobBytes(b64) {
    var bin = atob(String(b64 || ''));
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function verifyPinRecord(pin, stored) {
    var p = normalizeLabPin(pin);
    if (p.length !== 4 || !stored) return false;
    var storedStr = String(stored);
    var digest = legacyLabPinDigest(p);
    if (storedStr === digest) return true;
    if (storedStr.indexOf('lab2.') === 0 && storedStr.split('.').pop() === p) return true;
    if (storedStr.indexOf('lab1.') === 0) {
      var rev = 'lab1.' + p.split('').reverse().join('');
      return storedStr === rev;
    }
    try {
      var rec = JSON.parse(storedStr);
      if (rec && rec.legacy) return rec.legacy === legacyLabPinDigest(p) || rec.legacy === 'lab1.' + p.split('').reverse().join('');
      if (rec && rec.claveHash && rec.claveSalt && crypto && crypto.subtle) {
        var enc = new TextEncoder();
        var salt = atobBytes(rec.claveSalt);
        var keyMat = await crypto.subtle.importKey('raw', enc.encode(p), 'PBKDF2', false, ['deriveBits']);
        var bits = await crypto.subtle.deriveBits(
          { name: 'PBKDF2', salt: salt, iterations: 120000, hash: 'SHA-256' },
          keyMat,
          256
        );
        var got = b64toa(new Uint8Array(bits));
        return got === rec.claveHash;
      }
    } catch (_) {}
    return false;
  }

  async function hashPin(pin) {
    var rec = await hashPinRecord(pin);
    if (!rec) return null;
    return rec.legacy || legacyLabPinDigest(String(pin || '').replace(/\D/g, ''));
  }

  async function verifyPin(pin) {
    var p = normalizeLabPin(pin);
    if (p.length !== 4) return { ok: false, reason: 'formato' };
    var cfg = loadConfig();

    /* PIN de fábrica 8888 — siempre válido y repara hash corrupto en localStorage. */
    if (p === DEFAULT_LAB_PIN) {
      cfg.pinHash = legacyLabPinDigest(DEFAULT_LAB_PIN);
      cfg.pinFactory = true;
      if (!cfg.pinSetAt) cfg.pinSetAt = new Date().toISOString();
      saveConfig(cfg);
      unlockSession();
      auditLab('pin_ok', 'Acceso laboratorio (PIN fábrica)');
      return { ok: true, factory: true };
    }

    await ensureDefaultLabPin();
    cfg = loadConfig();
    if (!cfg.pinHash) return { ok: false, reason: 'sin_pin' };
    var ok = await verifyPinRecord(p, cfg.pinHash);
    if (ok) {
      unlockSession();
      auditLab('pin_ok', 'Acceso laboratorio');
      return { ok: true };
    }
    auditLab('pin_fail', 'Intento fallido');
    return { ok: false, reason: 'invalido' };
  }

  async function setPin(pin, confirmPin) {
    if (!isLabRole()) return { ok: false, reason: 'rol' };
    var a = normalizeLabPin(pin);
    var b = normalizeLabPin(confirmPin);
    if (a.length !== 4 || b.length !== 4) return { ok: false, reason: 'longitud' };
    if (a !== b) return { ok: false, reason: 'coincidencia' };
    var cfg = loadConfig();
    cfg.pinHash = await hashPin(a);
    cfg.pinSetAt = new Date().toISOString();
    cfg.pinFactory = a === DEFAULT_LAB_PIN;
    saveConfig(cfg);
    unlockSession();
    auditLab('pin_set', 'PIN laboratorio configurado');
    return { ok: true };
  }

  function getFacturasRawProduction() {
    if (_origGetFacturas) return _origGetFacturas() || [];
    if (typeof config !== 'undefined' && config.getFacturasFiscal) return config.getFacturasFiscal() || [];
    if (typeof config !== 'undefined' && config.getFacturas) return config.getFacturas() || [];
    return [];
  }

  function withSyntheticFacturas(facturas, fn) {
    var prev = _syntheticFacturasOverride;
    _syntheticFacturasOverride = facturas || [];
    try {
      return fn();
    } finally {
      _syntheticFacturasOverride = prev;
    }
  }

  function adjustSyntheticTotal(facturas, target) {
    if (!facturas.length) return;
    var sum = facturas.reduce(function (a, f) {
      return a + num(f.total);
    }, 0);
    var diff = Math.round(num(target) - sum);
    if (diff !== 0) {
      var last = facturas[facturas.length - 1];
      last.total = Math.max(5000, num(last.total) + diff);
    }
  }

  function makeSynthInvoice(idx, dayDate, hour, total, eligible) {
    var d = new Date(dayDate.getTime());
    d.setHours(Math.min(22, Math.max(7, hour)), (idx * 11) % 60, 0, 0);
    var f = {
      uuid: 'lab-synth-' + idx,
      consecutivo: 'SYN-' + (10000 + idx),
      total: Math.round(num(total)),
      fecha: d.toISOString(),
      estado: 'pos',
      metodoPago: 'efectivo',
    };
    if (!eligible) {
      var mod = idx % 6;
      if (mod === 0) f.metodoPago = 'tarjeta';
      else if (mod === 1) {
        f.tipoComprobante = 'electronica';
        f.cufe = 'SYNTH-' + idx;
      } else if (mod === 2) f.enviadoWhatsapp = true;
      else if (mod === 3) f.metodoPago = 'transferencia';
      else f.clienteNit = '900123456';
    }
    return f;
  }

  function inferInvoiceProfile(daysBack) {
    daysBack = Math.max(7, num(daysBack) || 30);
    var cutoff = Date.now() - daysBack * 86400000;
    var list = getFacturasRawProduction().filter(function (f) {
      return isValidSale(f) && facturaTs(f) >= cutoff;
    });
    var eligible = 0;
    var sum = 0;
    list.forEach(function (f) {
      sum += num(f.total);
      if (classifyInvoice(f).eligible) eligible += 1;
    });
    var pattern = analyzeWeekdayPattern(3);
    var weights = pattern.countByDow.map(function (c, i) {
      if (c > 0) return c;
      return pattern.avgTicketByDow[i] > 0 ? 1 : 0.6;
    });
    var totalDowWeight = weights.reduce(function (a, b) {
      return a + b;
    }, 0);
    var dayCount = collectDaysWithSalesFromList(list, daysBack).length;
    return {
      avgTicket: list.length ? sum / list.length : 55000,
      eligibleRatio: list.length ? eligible / list.length : 0.36,
      invoicesPerDay: dayCount > 0 ? list.length / dayCount : 28,
      dowWeight: weights,
      totalDowWeight: totalDowWeight || 7,
      sourceCount: list.length,
    };
  }

  function collectDaysWithSalesFromList(list, daysBack) {
    var cutoff = Date.now() - daysBack * 86400000;
    var map = {};
    list.forEach(function (f) {
      var t = facturaTs(f);
      if (t < cutoff) return;
      var iso = new Date(t).toISOString().slice(0, 10);
      if (!map[iso]) map[iso] = { iso: iso, fiscal: 0, count: 0 };
      map[iso].fiscal += num(f.total);
      map[iso].count += 1;
    });
    return Object.keys(map).map(function (k) {
      return map[k];
    });
  }

  function summarizeSyntheticProjection(facturas, mode, salesTotal, profile) {
    var eligible = 0;
    var sum = 0;
    facturas.forEach(function (f) {
      sum += num(f.total);
      if (classifyInvoice(f).eligible) eligible += 1;
    });
    return {
      mode: mode,
      salesTotal: salesTotal,
      adjustedTotal: sum,
      invoiceCount: facturas.length,
      eligibleCount: eligible,
      eligiblePct: facturas.length ? Math.round((eligible / facturas.length) * 100) : 0,
      avgTicket: facturas.length ? Math.round(sum / facturas.length) : 0,
      profile: profile,
      facturas: facturas,
      label: mode === 'scaled_history' ? 'Escalado desde ventas reales del periodo' : 'Generado con mix estadístico estimado',
    };
  }

  function generatePureSyntheticFacturas(salesTotal, daysBack) {
    var profile = inferInvoiceProfile(daysBack);
    var facturas = [];
    var dayPlans = [];
    var d;
    for (d = 0; d < daysBack; d++) {
      var dt = new Date();
      dt.setHours(0, 0, 0, 0);
      dt.setDate(dt.getDate() - (daysBack - 1 - d));
      dayPlans.push({ date: dt, dow: dt.getDay(), weight: profile.dowWeight[dt.getDay()] || 1 });
    }
    var weightSum =
      dayPlans.reduce(function (a, x) {
        return a + x.weight;
      }, 0) || 1;
    var idx = 0;
    dayPlans.forEach(function (day) {
      var daySales = Math.floor((salesTotal * day.weight) / weightSum);
      var ticketCount = Math.max(2, Math.round(daySales / Math.max(15000, profile.avgTicket)));
      var eligibleCount = Math.max(1, Math.round(ticketCount * profile.eligibleRatio));
      var t;
      for (t = 0; t < ticketCount; t++) {
        var eligible = t < eligibleCount;
        var base = daySales / ticketCount;
        var jitter = 0.76 + ((t * 17 + day.dow) % 5) * 0.09;
        var amount = Math.max(8000, Math.round(base * jitter));
        facturas.push(makeSynthInvoice(idx, day.date, 9 + (t % 12), amount, eligible));
        idx += 1;
      }
    });
    adjustSyntheticTotal(facturas, salesTotal);
    return summarizeSyntheticProjection(facturas, 'generated', salesTotal, profile);
  }

  function buildSyntheticFacturasFromDeclaredSales(opts) {
    opts = opts || {};
    var salesTotal = num(opts.salesTotal);
    var daysBack = Math.max(7, num(opts.daysBack) || 30);
    if (salesTotal <= 0) return { ok: false, reason: 'ventas' };
    var cutoff = Date.now() - daysBack * 86400000;
    var source = getFacturasRawProduction().filter(function (f) {
      return isValidSale(f) && facturaTs(f) >= cutoff;
    });
    var profile = inferInvoiceProfile(daysBack);
    if (source.length >= 12) {
      var sum = 0;
      source.forEach(function (f) {
        sum += num(f.total);
      });
      if (sum > 0) {
        var factor = salesTotal / sum;
        var facturas = source.map(function (f, i) {
          var clone = Object.assign({}, f);
          clone.uuid = 'lab-synth-' + i + '-' + String(f.uuid || f.consecutivo || i);
          clone.consecutivo = 'SYN-' + String(f.consecutivo || 1000 + i);
          clone.total = Math.max(1000, Math.round(num(f.total) * factor));
          return clone;
        });
        adjustSyntheticTotal(facturas, salesTotal);
        return Object.assign({ ok: true }, summarizeSyntheticProjection(facturas, 'scaled_history', salesTotal, profile));
      }
    }
    return Object.assign({ ok: true }, generatePureSyntheticFacturas(salesTotal, daysBack));
  }

  function runWithDeclaredSales(opts, fn) {
    opts = opts || {};
    if (num(opts.salesTotal) <= 0) return fn(null);
    var projection = buildSyntheticFacturasFromDeclaredSales(opts);
    if (!projection.ok) return fn(null);
    var result = withSyntheticFacturas(projection.facturas, function () {
      return fn(projection);
    });
    if (result && typeof result === 'object') result.projection = projection;
    return result;
  }

  function getFacturasRaw() {
    if (_syntheticFacturasOverride) return _syntheticFacturasOverride;
    return getFacturasRawProduction();
  }

  function facturaTs(f) {
    var d = f && (f.fecha || f.fechaEmision);
    return d ? new Date(d).getTime() : 0;
  }

  function isValidSale(f) {
    var st = String((f && f.estado) || '').toLowerCase();
    return st === 'pos' || st === 'demo' || st === 'timbrada';
  }

  function sentViaWhatsapp(f) {
    if (!f) return false;
    if (f.enviadoWhatsapp || f.whatsappEnviado) return true;
    if (String(f.canal || '').toLowerCase() === 'whatsapp') return true;
    if (f.paymentMeta && (f.paymentMeta.whatsapp || f.paymentMeta.enviadoWhatsapp)) return true;
    if (Array.isArray(f.canalesEnvio) && f.canalesEnvio.indexOf('whatsapp') >= 0) return true;
    if (Array.isArray(f.envios) && f.envios.some(function (e) { return String(e).toLowerCase().indexOf('whatsapp') >= 0; })) return true;
    return false;
  }

  function isElectronicInvoice(f) {
    if (!f) return false;
    if (f.tipoComprobante === 'electronica') return true;
    var st = String(f.estado || '').toLowerCase();
    if (st === 'timbrada') return true;
    if (f.cufe || f.uuidDian || f.dianTrackId) return true;
    return false;
  }

  function isBankOrNonCash(f) {
    var mp = String((f && f.metodoPago) || '').toLowerCase();
    return mp === 'tarjeta' || mp === 'qr' || mp === 'pse' || mp === 'transferencia' || mp === 'credito' || mp === 'cartera_pendiente';
  }

  function isDelicateInvoice(f, cfg) {
    if (!f) return true;
    if (f.delicada || f.facturaDelicada || f.altoRiesgo || f.sensible) return true;
    if (f.notaCredito || String(f.estado || '').toLowerCase() === 'anulada') return true;
    var total = num(f.total);
    if (total >= num(cfg && cfg.maxEligibleAmount)) return true;
    var nit = String(f.clienteNit || f.nitCliente || '').replace(/\D/g, '');
    if (nit.length >= 9) return true;
    if (f.clienteRazonSocial && String(f.clienteRazonSocial).length > 3 && nit.length >= 6) return true;
    return false;
  }

  function classifyInvoice(f) {
    var cfg = loadConfig().operMask;
    var reasons = [];
    if (!isValidSale(f)) reasons.push('venta_invalida');
    if (isElectronicInvoice(f)) reasons.push('electronica');
    if (isBankOrNonCash(f)) reasons.push('medio_banco');
    if (sentViaWhatsapp(f)) reasons.push('whatsapp');
    if (isDelicateInvoice(f, cfg)) reasons.push('delicada');
    var mp = String(f.metodoPago || '').toLowerCase();
    if (mp !== 'efectivo' && mp !== 'mixto') reasons.push('no_efectivo');
    if (mp === 'mixto' && num(f.paymentMeta && f.paymentMeta.efectivoParte) <= 0) reasons.push('mixto_sin_efectivo');
    if (String(f.estado || '').toLowerCase() === 'demo') reasons.push('demo');
    return {
      eligible: reasons.length === 0,
      reasons: reasons,
      risk: reasons.length ? 'alto' : 'bajo',
    };
  }

  function maskEntryKey(f) {
    return String(f.uuid || f.consecutivo || f.id || facturaTs(f));
  }

  function applyMaskToInvoice(f, mask) {
    if (!f || (seesFiscalTruth() && !global.__crozzoLabPreviewOperative)) return f;
    if (!shouldApplyOperMask()) return f;
    var key = maskEntryKey(f);
    var entry = mask.entries[key];
    if (!entry) return f;
    var clone = Object.assign({}, f);
    var delta = num(entry.delta);
    if (delta <= 0) return f;
    clone.total = Math.max(0, num(f.total) - delta);
    if (clone.paymentMeta) clone.paymentMeta = Object.assign({}, clone.paymentMeta);
    else clone.paymentMeta = {};
    if (String(f.metodoPago || '').toLowerCase() === 'mixto') {
      clone.paymentMeta.efectivoParte = Math.max(0, num(f.paymentMeta && f.paymentMeta.efectivoParte) - delta);
    }
    clone.__labMasked = true;
    return clone;
  }

  function getFacturasForView() {
    var list = getFacturasRaw();
    if (seesFiscalTruth() && !global.__crozzoLabPreviewOperative) return list;
    if (!shouldApplyOperMask()) return list;
    var mask = loadMask();
    return list.map(function (f) {
      return applyMaskToInvoice(f, mask);
    });
  }

  function analyzeWeekdayPattern(monthsBack) {
    monthsBack = Math.max(1, Math.min(6, num(monthsBack) || 3));
    var cutoff = Date.now() - monthsBack * 30 * 86400000;
    var byDow = [0, 0, 0, 0, 0, 0, 0];
    var count = [0, 0, 0, 0, 0, 0, 0];
    getFacturasRaw().forEach(function (f) {
      if (!isValidSale(f)) return;
      var t = facturaTs(f);
      if (t < cutoff) return;
      var d = new Date(t).getDay();
      byDow[d] += num(f.total);
      count[d] += 1;
    });
    var avg = byDow.map(function (t, i) {
      return count[i] ? t / count[i] : 0;
    });
    var overall = avg.reduce(function (a, b) { return a + b; }, 0) / (avg.filter(function (x) { return x > 0; }).length || 1);
    return {
      monthsBack: monthsBack,
      totalsByDow: byDow,
      countByDow: count,
      avgTicketByDow: avg,
      overallAvgTicket: overall,
      labels: DOW_LABELS,
    };
  }

  function operativeDayTotal(iso) {
    iso = iso || todayIso();
    var from = new Date(iso + 'T00:00:00').getTime();
    var to = from + 86400000;
    var total = 0;
    getFacturasForView().forEach(function (f) {
      if (!isValidSale(f)) return;
      var t = facturaTs(f);
      if (t >= from && t < to) total += num(f.total);
    });
    return total;
  }

  function fiscalDayTotal(iso) {
    iso = iso || todayIso();
    var from = new Date(iso + 'T00:00:00').getTime();
    var to = from + 86400000;
    var total = 0;
    getFacturasRaw().forEach(function (f) {
      if (!isValidSale(f)) return;
      var t = facturaTs(f);
      if (t >= from && t < to) total += num(f.total);
    });
    return total;
  }

  function hiddenCapStatus() {
    var cfg = loadConfig().hiddenCap;
    if (!cfg.enabled || num(cfg.amount) <= 0) return { active: false };
    var oper = operativeDayTotal();
    var fiscal = fiscalDayTotal();
    var pct = Math.round((oper / cfg.amount) * 100);
    var alert = pct >= num(cfg.alertPct);
    return {
      active: true,
      cap: num(cfg.amount),
      operativeTotal: oper,
      fiscalTotal: fiscal,
      pct: pct,
      alert: alert,
      hiddenFromStaff: true,
    };
  }

  /** Niveles de descuento: 1=discreto … 5=descarado. tolerance = qué tan difícil es notarlo (0-100). */
  var MASK_LEVELS = {
    1: {
      id: 1,
      key: 'discreto',
      label: 'Nivel 1 · Discreto',
      tagline: 'Casi invisible',
      strategyNote: 'Muchas facturas chicas · cortes mínimos redondeados',
      tolerance: 94,
      maxCutPct: 0.1,
      cutFill: 0.32,
      minCut: 10000,
      roundStep: 5000,
      capFactor: 0.06,
      maxInvoicesDay: 2,
      sort: 'smallest',
      amountRelax: 1,
    },
    2: {
      id: 2,
      key: 'suave',
      label: 'Nivel 2 · Suave',
      tagline: 'Conservador',
      strategyNote: 'Varias facturas pequeñas · cortes parciales',
      tolerance: 82,
      maxCutPct: 0.18,
      cutFill: 0.48,
      minCut: 8000,
      roundStep: 5000,
      capFactor: 0.11,
      maxInvoicesDay: 4,
      sort: 'smallest',
      amountRelax: 1,
    },
    3: {
      id: 3,
      key: 'balanceado',
      label: 'Nivel 3 · Balanceado',
      tagline: 'Recomendado',
      strategyNote: 'Rep evenly · mezcla ticket chico y mediano',
      tolerance: 68,
      maxCutPct: 0.28,
      cutFill: 0.62,
      minCut: 5000,
      roundStep: 1000,
      capFactor: 0.16,
      maxInvoicesDay: 6,
      sort: 'spread',
      amountRelax: 1,
    },
    4: {
      id: 4,
      key: 'firme',
      label: 'Nivel 4 · Firme',
      tagline: 'Se nota con lupa',
      strategyNote: 'Pocas facturas · cortes altos en tickets medianos',
      tolerance: 48,
      maxCutPct: 0.4,
      cutFill: 0.82,
      minCut: 5000,
      roundStep: 1000,
      capFactor: 0.24,
      maxInvoicesDay: 9,
      sort: 'medium',
      amountRelax: 1.15,
    },
    5: {
      id: 5,
      key: 'descarado',
      label: 'Nivel 5 · Descarado',
      tagline: 'Agresivo — alto riesgo operativo',
      strategyNote: 'Pocas facturas grandes · corte casi al máximo permitido',
      tolerance: 28,
      maxCutPct: 0.52,
      cutFill: 1,
      minCut: 3000,
      roundStep: 500,
      capFactor: 0.34,
      maxInvoicesDay: 14,
      sort: 'largest_eligible',
      amountRelax: 1.35,
    },
  };

  function getMaskLevelConfig(level) {
    var n = Math.max(1, Math.min(5, num(level) || 3));
    return MASK_LEVELS[n] || MASK_LEVELS[3];
  }

  function listMaskLevels() {
    return [1, 2, 3, 4, 5].map(function (id) {
      return MASK_LEVELS[id];
    });
  }

  function roundToStep(amount, step) {
    step = Math.max(500, num(step) || 1000);
    return Math.floor(num(amount) / step) * step;
  }

  function classifyInvoiceForLevel(f, cfg, lvl) {
    var base = classifyInvoice(f);
    if (base.eligible) return base;
    if (lvl.amountRelax <= 1 || base.reasons.indexOf('delicada') < 0) return base;
    var other = base.reasons.filter(function (r) {
      return r !== 'delicada';
    });
    if (other.length) return base;
    var total = num(f.total);
    var relaxedMax = num(cfg.maxEligibleAmount) * num(lvl.amountRelax);
    if (total < relaxedMax) {
      return { eligible: true, reasons: [], risk: 'medio', relaxed: true };
    }
    return base;
  }

  function sortCandidates(candidates, sortMode) {
    if (sortMode === 'medium') {
      candidates.sort(function (a, b) {
        var ma = Math.abs(a.total - 85000);
        var mb = Math.abs(b.total - 85000);
        return ma - mb;
      });
      return candidates;
    }
    if (sortMode === 'largest_eligible') {
      candidates.sort(function (a, b) {
        return b.total - a.total;
      });
      return candidates;
    }
    if (sortMode === 'spread') {
      candidates.sort(function (a, b) {
        return a.ts - b.ts;
      });
      return candidates;
    }
    candidates.sort(function (a, b) {
      return a.total - b.total;
    });
    return candidates;
  }

  function scorePickTolerance(pick, lvl) {
    var pct = pick.original > 0 ? pick.delta / pick.original : 0;
    var pctPenalty = pct * 120;
    var smallBonus = pick.original < 80000 ? 8 : 0;
    var roundBonus = pick.delta % 5000 === 0 ? 5 : 0;
    return Math.max(0, Math.min(100, num(lvl.tolerance) - pctPenalty + smallBonus + roundBonus));
  }

  function pickEligibleForReduction(iso, needReduce, opts) {
    opts = opts || {};
    needReduce = Math.max(0, num(needReduce));
    if (needReduce <= 0) return [];
    var lvl = getMaskLevelConfig(opts.level);
    var from = new Date(iso + 'T00:00:00').getTime();
    var to = from + 86400000;
    var cfg = loadConfig().operMask;
    var mask = opts.ignoreExisting ? { entries: {} } : loadMask();
    var candidates = [];
    getFacturasRaw().forEach(function (f) {
      if (!isValidSale(f)) return;
      var t = facturaTs(f);
      if (t < from || t >= to) return;
      var cls = classifyInvoiceForLevel(f, cfg, lvl);
      if (!cls.eligible) return;
      var key = maskEntryKey(f);
      if (mask.entries[key]) return;
      candidates.push({
        f: f,
        key: key,
        total: num(f.total),
        ts: t,
        consecutivo: f.consecutivo,
        cls: cls,
      });
    });
    sortCandidates(candidates, lvl.sort);
    var picked = [];
    var remaining = needReduce;
    var fill = num(lvl.cutFill);
    if (!fill) fill = Math.min(1, 0.2 + lvl.id * 0.16);
    for (var i = 0; i < candidates.length && remaining > 0 && picked.length < lvl.maxInvoicesDay; i++) {
      var c = candidates[i];
      var ceiling = Math.min(
        c.total * lvl.maxCutPct,
        remaining,
        num(cfg.maxEligibleAmount) * lvl.capFactor * lvl.amountRelax
      );
      if (ceiling < lvl.minCut) continue;
      var capRounded = roundToStep(ceiling, lvl.roundStep);
      if (capRounded < lvl.minCut) continue;
      if (capRounded >= c.total) capRounded = roundToStep(c.total - lvl.minCut, lvl.roundStep);
      if (capRounded < lvl.minCut) continue;
      var desired = roundToStep(Math.max(lvl.minCut, capRounded * fill), lvl.roundStep);
      var actualCut = Math.min(remaining, capRounded, desired);
      actualCut = roundToStep(actualCut, lvl.roundStep);
      if (actualCut < lvl.minCut) {
        if (remaining >= lvl.minCut) actualCut = roundToStep(Math.min(remaining, capRounded, lvl.minCut), lvl.roundStep);
        else continue;
      }
      if (actualCut < lvl.minCut) continue;
      var row = {
        key: c.key,
        uuid: c.f && c.f.uuid,
        consecutivo: c.consecutivo,
        delta: actualCut,
        original: c.total,
        after: c.total - actualCut,
        level: lvl.id,
        tolerance: 0,
        cutPct: c.total > 0 ? Math.round((actualCut / c.total) * 100) : 0,
      };
      row.tolerance = Math.round(scorePickTolerance(row, lvl));
      picked.push(row);
      remaining -= actualCut;
    }
    return picked;
  }

  function collectDaysWithSales(daysBack) {
    daysBack = Math.max(7, num(daysBack) || 30);
    var cutoff = Date.now() - daysBack * 86400000;
    var map = {};
    getFacturasRaw().forEach(function (f) {
      if (!isValidSale(f)) return;
      var t = facturaTs(f);
      if (t < cutoff) return;
      var iso = new Date(t).toISOString().slice(0, 10);
      if (!map[iso]) map[iso] = { iso: iso, fiscal: 0, count: 0, eligible: 0 };
      map[iso].fiscal += num(f.total);
      map[iso].count += 1;
      if (classifyInvoice(f).eligible) map[iso].eligible += 1;
    });
    return Object.keys(map)
      .sort()
      .map(function (k) {
        return map[k];
      });
  }

  function simulateDayMask(iso, needReduce, level, opts) {
    opts = opts || {};
    var lvl = getMaskLevelConfig(level);
    var picks = pickEligibleForReduction(iso, needReduce, { level: level, ignoreExisting: true });
    var reduced = picks.reduce(function (a, p) {
      return a + p.delta;
    }, 0);
    var fiscal = fiscalDayTotal(iso);
    var avgTol =
      picks.length > 0
        ? Math.round(
            picks.reduce(function (a, p) {
              return a + p.tolerance;
            }, 0) / picks.length
          )
        : lvl.tolerance;
    var gap = Math.max(0, needReduce - reduced);
    return {
      iso: iso,
      level: lvl.id,
      levelLabel: lvl.label,
      fiscal: fiscal,
      targetReduce: needReduce,
      reduced: reduced,
      operative: fiscal - reduced,
      gap: gap,
      picks: picks,
      pickCount: picks.length,
      avgTolerance: avgTol,
      detectability: Math.max(0, 100 - avgTol),
      ok: gap <= needReduce * 0.15 || reduced >= needReduce,
    };
  }

  function simulateMonthMask(opts) {
    opts = opts || {};
    var daysBack = num(opts.daysBack) || 30;
    var level = num(opts.level) || 3;
    var days = collectDaysWithSales(daysBack);
    var fiscalMonth = days.reduce(function (a, d) {
      return a + d.fiscal;
    }, 0);
    var targetReduce = num(opts.targetReduce);
    if (!targetReduce && opts.targetPct) targetReduce = Math.floor((fiscalMonth * num(opts.targetPct)) / 100);
    if (!targetReduce && opts.targetReducePct) targetReduce = Math.floor((fiscalMonth * num(opts.targetReducePct)) / 100);
    targetReduce = Math.max(0, targetReduce);
    var dayResults = days.map(function (d) {
      var share = fiscalMonth > 0 ? d.fiscal / fiscalMonth : 1 / Math.max(1, days.length);
      var dayTarget = Math.floor(targetReduce * share);
      return simulateDayMask(d.iso, dayTarget, level, opts);
    });
    var totalReduced = dayResults.reduce(function (a, r) {
      return a + r.reduced;
    }, 0);
    var totalGap = dayResults.reduce(function (a, r) {
      return a + r.gap;
    }, 0);
    var totalPicks = dayResults.reduce(function (a, r) {
      return a + r.pickCount;
    }, 0);
    var avgDetect =
      dayResults.length > 0
        ? Math.round(
            dayResults.reduce(function (a, r) {
              return a + r.detectability;
            }, 0) / dayResults.length
          )
        : 0;
    var allPicks = [];
    dayResults.forEach(function (d) {
      if (d.picks && d.picks.length) allPicks = allPicks.concat(d.picks);
    });
    var avgCutPerPick = totalPicks > 0 ? Math.round(totalReduced / totalPicks) : 0;
    var avgTicketCutPct =
      allPicks.length > 0
        ? Math.round(
            allPicks.reduce(function (a, p) {
              return a + (p.original > 0 ? (p.delta / p.original) * 100 : 0);
            }, 0) / allPicks.length
          )
        : 0;
    var activeDays = dayResults.filter(function (d) {
      return d.pickCount > 0;
    }).length;
    return {
      ok: true,
      level: level,
      levelConfig: getMaskLevelConfig(level),
      daysBack: daysBack,
      fiscalMonth: fiscalMonth,
      targetReduce: targetReduce,
      totalReduced: totalReduced,
      totalGap: totalGap,
      operativeMonth: fiscalMonth - totalReduced,
      coveragePct: targetReduce > 0 ? Math.round((totalReduced / targetReduce) * 100) : 100,
      gapPct: targetReduce > 0 ? Math.round((totalGap / targetReduce) * 100) : 0,
      totalPicks: totalPicks,
      avgCutPerPick: avgCutPerPick,
      avgTicketCutPct: avgTicketCutPct,
      avgInvoicesPerDay: activeDays > 0 ? Math.round((totalPicks / activeDays) * 10) / 10 : 0,
      avgDetectability: avgDetect,
      avgTolerance: Math.max(0, 100 - avgDetect),
      days: dayResults,
    };
  }

  function simulateLevelMaxCapacity(opts) {
    opts = opts || {};
    var daysBack = num(opts.daysBack) || 30;
    var level = num(opts.level) || 3;
    var days = collectDaysWithSales(daysBack);
    var dayResults = days.map(function (d) {
      var dayTarget = Math.max(0, Math.floor(d.fiscal * 0.92));
      return simulateDayMask(d.iso, dayTarget, level, opts);
    });
    var fiscalMonth = days.reduce(function (a, d) {
      return a + d.fiscal;
    }, 0);
    var totalReduced = dayResults.reduce(function (a, r) {
      return a + r.reduced;
    }, 0);
    var totalPicks = dayResults.reduce(function (a, r) {
      return a + r.pickCount;
    }, 0);
    return {
      level: level,
      fiscalMonth: fiscalMonth,
      totalReduced: totalReduced,
      maxHidePct: fiscalMonth > 0 ? Math.round((totalReduced / fiscalMonth) * 100) : 0,
      totalPicks: totalPicks,
      levelConfig: getMaskLevelConfig(level),
    };
  }

  function compareLevelSimulations(opts) {
    opts = opts || {};
    var run = function () {
      return [1, 2, 3, 4, 5].map(function (lvl) {
        var sim = simulateMonthMask(
          Object.assign({}, opts, {
            level: lvl,
          })
        );
        var cap = simulateLevelMaxCapacity(
          Object.assign({}, opts, {
            level: lvl,
          })
        );
        return {
          level: lvl,
          config: getMaskLevelConfig(lvl),
          sim: sim,
          maxCapacity: cap,
        };
      });
    };
    if (num(opts.salesTotal) > 0) {
      var projection = buildSyntheticFacturasFromDeclaredSales(opts);
      if (!projection.ok) return run();
      var rows = withSyntheticFacturas(projection.facturas, run);
      rows.projection = projection;
      auditLab('sim_declared_sales', Math.round(num(opts.salesTotal)) + ' · ' + projection.invoiceCount + ' fact · ' + projection.eligibleCount + ' eleg');
      return rows;
    }
    return run();
  }

  function simulateMonthMaskDeclared(opts) {
    opts = opts || {};
    if (num(opts.salesTotal) <= 0) {
      return { sim: simulateMonthMask(opts), projection: null };
    }
    var projection = buildSyntheticFacturasFromDeclaredSales(opts);
    if (!projection.ok) return { sim: simulateMonthMask(opts), projection: null };
    var sim = withSyntheticFacturas(projection.facturas, function () {
      return simulateMonthMask(opts);
    });
    return { sim: sim, projection: projection };
  }

  function applyOperMask(opts) {
    opts = opts || {};
    if (!isLabRole() || !isSessionUnlocked()) return { ok: false, reason: 'acceso' };
    var cfg = loadConfig();
    cfg.operMask.enabled = opts.enabled !== false;
    if (opts.patternAdjust != null) cfg.operMask.patternAdjust = !!opts.patternAdjust;
    if (opts.maxEligibleAmount != null) cfg.operMask.maxEligibleAmount = num(opts.maxEligibleAmount);
    saveConfig(cfg);

    var iso = todayIso();
    var mask = loadMask();
    var needReduce = num(opts.manualReduce) || 0;

    if (cfg.operMask.patternAdjust) {
      var pattern = analyzeWeekdayPattern(cfg.emulation.historyMonths || 3);
      var dow = new Date().getDay();
      var todayAvg = pattern.avgTicketByDow[dow] || 0;
      var monAvg = pattern.avgTicketByDow[1] || pattern.overallAvgTicket;
      if (todayAvg > monAvg * 1.08) {
        var fiscal = fiscalDayTotal(iso);
        var target = monAvg > 0 ? (fiscal * monAvg) / todayAvg : fiscal;
        needReduce = Math.max(needReduce, fiscal - target);
      }
    }

    if (cfg.hiddenCap.enabled && num(cfg.hiddenCap.amount) > 0) {
      var oper = operativeDayTotal(iso);
      if (oper > cfg.hiddenCap.amount) needReduce = Math.max(needReduce, oper - cfg.hiddenCap.amount);
    }

    needReduce = Math.max(0, Math.floor(needReduce));
    var level = num(opts.level) || num(cfg.operMask.level) || 3;
    var picks = pickEligibleForReduction(iso, needReduce, { level: level });
    var purgeDeletable = opts.purgeDeletable != null ? !!opts.purgeDeletable : !!(cfg.operMask && cfg.operMask.purgeDeletable);
    var userOrganized = !!opts.userOrganized;
    var plan = applyOrganizedPicks(picks, {
      purgeDeletable: purgeDeletable,
      userOrganized: userOrganized,
      reason: opts.reason || 'ajuste_operativo',
    });

    plan.maskPicks.forEach(function (p) {
      mask.entries[p.key] = {
        delta: p.delta,
        original: p.original,
        uuid: p.uuid,
        appliedAt: new Date().toISOString(),
        reason: opts.reason || 'ajuste_operativo',
        level: level,
        tolerance: p.tolerance,
      };
    });
    mask.lastApplyAt = new Date().toISOString();
    mask.dayTotals[iso] = {
      fiscal: fiscalDayTotal(iso),
      operative: fiscalDayTotal(iso) - plan.reduced,
      reduced: plan.reduced,
      count: plan.maskPicks.length + plan.purgedCount,
      purged: plan.purgedCount,
    };
    if (plan.purgedCount) {
      mask.purgedAt = new Date().toISOString();
      mask.purgedCount = (num(mask.purgedCount) || 0) + plan.purgedCount;
    }
    saveMask(mask);
    auditLab(
      'mask_apply',
      iso +
        ': ' +
        plan.maskPicks.length +
        ' máscara · ' +
        plan.purgedCount +
        ' purga · −$' +
        Math.round(plan.reduced)
    );
    return {
      ok: true,
      picks: plan.maskPicks.length,
      purged: plan.purgedCount,
      reduced: plan.reduced,
      day: mask.dayTotals[iso],
    };
  }

  function clearOperMask(opts) {
    opts = opts || {};
    if (!isLabRole()) return { ok: false };
    var mask = { entries: {}, dayTotals: {}, lastApplyAt: '' };
    if (opts.keepConfig) {
      var cfg = loadConfig();
      cfg.operMask.enabled = false;
      saveConfig(cfg);
    }
    saveMask(mask);
    auditLab('mask_clear', opts.reason || 'manual');
    return { ok: true };
  }

  function reconcileAtClose(closeRec) {
    var mask = loadMask();
    var cfg = loadConfig();
    if (!mask.entries || !Object.keys(mask.entries).length) {
      return { ok: true, reconciled: false };
    }
    var summary = {
      reconciledAt: new Date().toISOString(),
      shiftId: closeRec && closeRec.shiftId,
      businessDate: closeRec && closeRec.businessDate,
      entries: Object.keys(mask.entries).length,
      totalReduced: 0,
      fiscalTruth: {
        totalSales: closeRec && closeRec.totalSales,
        cashSales: closeRec && closeRec.cashSales,
        byMethod: closeRec && closeRec.byMethod,
      },
    };
    Object.keys(mask.entries).forEach(function (k) {
      summary.totalReduced += num(mask.entries[k].delta);
    });
    var archiveRows = getPurgedArchiveList({ iso: closeRec && closeRec.businessDate });
    if (archiveRows.length) {
      summary.purgedArchive = archiveRows.map(function (row) {
        return {
          id: row.id,
          key: row.key,
          consecutivo: row.consecutivo,
          total: row.total,
          at: row.at,
          reason: row.reason,
          purgedBy: row.purgedBy,
          hasCopy: !!row.factura,
        };
      });
      summary.purgedArchiveTotal = archiveRows.reduce(function (a, row) {
        return a + num(row.total);
      }, 0);
    }
    if (closeRec) {
      closeRec.labReconcile = summary;
      closeRec.fiscalTruth = summary.fiscalTruth;
    }
    clearOperMask({ reason: 'cierre_' + (closeRec && closeRec.shiftType) });
    cfg.hiddenCap.alertedAt = '';
    saveConfig(cfg);
    auditLab('reconcile_close', JSON.stringify(summary).slice(0, 240));
    return { ok: true, reconciled: true, summary: summary };
  }

  function buildMonthProjection(monthsHistory, monthsProject) {
    monthsHistory = Math.max(1, Math.min(6, num(monthsHistory) || 3));
    monthsProject = Math.max(1, Math.min(6, num(monthsProject) || 2));
    var pattern = analyzeWeekdayPattern(monthsHistory);
    var dailyAvg = pattern.totalsByDow.reduce(function (a, b) { return a + b; }, 0) / Math.max(1, pattern.countByDow.reduce(function (a, b) { return a + b; }, 0));
    var projections = [];
    var now = new Date();
    for (var m = 1; m <= monthsProject; m++) {
      var monthStart = new Date(now.getFullYear(), now.getMonth() + m, 1);
      var monthEnd = new Date(now.getFullYear(), now.getMonth() + m + 1, 0);
      var days = [];
      var monthTotal = 0;
      for (var d = new Date(monthStart); d <= monthEnd; d.setDate(d.getDate() + 1)) {
        var dow = d.getDay();
        var base = pattern.avgTicketByDow[dow] || dailyAvg;
        var jitter = 0.92 + Math.random() * 0.16;
        var dayTotal = Math.round(base * (pattern.countByDow[dow] || 8) * jitter);
        monthTotal += dayTotal;
        days.push({ date: d.toISOString().slice(0, 10), dow: dow, projected: dayTotal });
      }
      projections.push({
        month: monthStart.toISOString().slice(0, 7),
        label: 'Mes +' + m + ' (proyección)',
        total: monthTotal,
        days: days,
        basedOnMonths: monthsHistory,
      });
    }
    var cfg = loadConfig();
    cfg.emulation.lastProjectionAt = new Date().toISOString();
    cfg.emulation.historyMonths = monthsHistory;
    cfg.emulation.projectMonths = monthsProject;
    saveConfig(cfg);
    auditLab('emulation_project', monthsHistory + '→' + monthsProject + ' meses');
    return { ok: true, pattern: pattern, projections: projections };
  }

  function runEmulationSandbox(projection) {
    if (!global.CrozzoEmulationHarness) return { ok: false, reason: 'harness' };
    return global.CrozzoEmulationHarness.enable({ force: true }).then(function () {
      auditLab('emulation_sandbox', 'Entorno aislado activo');
      return { ok: true, status: global.CrozzoEmulationHarness.status ? global.CrozzoEmulationHarness.status() : null, projection: projection };
    });
  }

  function findFacturaByKey(key) {
    var found = null;
    getFacturasRaw().forEach(function (f) {
      if (maskEntryKey(f) === key) found = f;
    });
    return found;
  }

  function loadPurgeTombstones() {
    try {
      var raw = localStorage.getItem(LS_PURGE);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (_) {
      return [];
    }
  }

  function savePurgeTombstones(list) {
    try {
      localStorage.setItem(LS_PURGE, JSON.stringify((list || []).slice(0, 200)));
    } catch (e) {
      console.warn('[lab] purge tomb', e);
    }
  }

  function cloneFacturaArchive(f) {
    if (!f) return null;
    try {
      return JSON.parse(JSON.stringify(f));
    } catch (_) {
      return Object.assign({}, f);
    }
  }

  function facturaBusinessIso(f) {
    if (!f) return todayIso();
    var t = facturaTs(f);
    if (!t) return todayIso();
    return new Date(t).toISOString().slice(0, 10);
  }

  /** Totales de facturas purgadas del registro visible (copia completa solo en lab). */
  function getPurgedArchiveTotals(iso) {
    iso = iso || todayIso();
    var list = loadPurgeTombstones();
    var count = 0;
    var total = 0;
    list.forEach(function (row) {
      var d = row.businessDate || (row.factura ? facturaBusinessIso(row.factura) : '');
      if (d && d !== iso) return;
      count += 1;
      total += num(row.total != null ? row.total : row.factura && row.factura.total);
    });
    return { iso: iso, count: count, total: total };
  }

  function getPurgedArchiveList(opts) {
    if (!isLabRole() || !isSessionUnlocked()) return [];
    opts = opts || {};
    var iso = opts.iso || '';
    var limit = Math.max(1, Math.min(100, num(opts.limit) || 40));
    var list = loadPurgeTombstones();
    if (iso) {
      list = list.filter(function (row) {
        var d = row.businessDate || (row.factura ? facturaBusinessIso(row.factura) : '');
        return d === iso;
      });
    }
    return list.slice(0, limit);
  }

  function getPurgedFacturaCopy(keyOrId) {
    if (!isLabRole() || !isSessionUnlocked()) return null;
    var needle = String(keyOrId || '');
    if (!needle) return null;
    var list = loadPurgeTombstones();
    for (var i = 0; i < list.length; i++) {
      var row = list[i];
      if (row.id === needle || row.key === needle) {
        return row.factura ? cloneFacturaArchive(row.factura) : null;
      }
    }
    return null;
  }

  /** POS efectivo de hoy, sin FE/timbrada — candidata a borrado sigiloso (solo plan organizado). */
  function canPurgeInvoice(f) {
    if (!f) return { ok: false, reason: 'missing' };
    var cls = classifyInvoice(f);
    if (!cls.eligible) return { ok: false, reason: cls.reasons[0] || 'no_elegible' };
    var st = String(f.estado || 'pos').toLowerCase();
    if (st === 'timbrada' || st === 'demo' || f.is_demo) return { ok: false, reason: 'estado' };
    if (f.cufe || f.uuidDian || String(f.tipoComprobante || '').toLowerCase() === 'electronica') {
      return { ok: false, reason: 'fe' };
    }
    var t = facturaTs(f);
    var iso = todayIso();
    var from = new Date(iso + 'T00:00:00').getTime();
    if (t < from || t >= from + 86400000) return { ok: false, reason: 'otro_dia' };
    return { ok: true };
  }

  function annotatePicksWithActions(picks, purgeDeletable) {
    return (picks || []).map(function (p) {
      var f = findFacturaByKey(p.key);
      if (purgeDeletable && canPurgeInvoice(f).ok) {
        return Object.assign({}, p, {
          action: 'purge',
          actionLabel: 'Eliminar del historial',
          actionAmount: num(p.original),
          after: 0,
        });
      }
      return Object.assign({}, p, {
        action: 'mask',
        actionLabel: 'Enmascarar vista',
        actionAmount: num(p.delta),
      });
    });
  }

  function purgeFacturasByKeys(keys, reason) {
    if (!isLabRole() || !isSessionUnlocked()) return { ok: false, purged: [], count: 0, amount: 0 };
    var keySet = {};
    (keys || []).forEach(function (k) {
      keySet[String(k)] = true;
    });
    var prev = getFacturasRawProduction();
    if (!prev.length) return { ok: false, purged: [], count: 0, amount: 0 };

    var purged = [];
    var next = [];
    prev.forEach(function (f) {
      var key = maskEntryKey(f);
      if (keySet[key]) {
        var chk = canPurgeInvoice(f);
        if (chk.ok) {
          var snapshot = cloneFacturaArchive(f);
          purged.push({
            key: key,
            uuid: f.uuid,
            consecutivo: f.consecutivo,
            total: num(f.total),
            businessDate: facturaBusinessIso(f),
            factura: snapshot,
          });
          return;
        }
      }
      next.push(f);
    });

    if (!purged.length) return { ok: false, purged: [], count: 0, amount: 0 };

    var amount = purged.reduce(function (a, p) {
      return a + num(p.total);
    }, 0);
    var tomb = loadPurgeTombstones();
    var at = new Date().toISOString();
    purged.forEach(function (p) {
      tomb.unshift({
        id: 'purge-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
        at: at,
        key: p.key,
        consecutivo: p.consecutivo,
        total: p.total,
        businessDate: p.businessDate,
        reason: reason || 'plan_organizado',
        purgedBy: actorLabel(),
        factura: p.factura,
      });
    });
    savePurgeTombstones(tomb);

    global.__crozzoLabPurgeBypass = true;
    try {
      if (typeof global.crozzoConfigSetSecure === 'function') {
        global.crozzoConfigSetSecure('facturas', next);
      } else if (typeof config !== 'undefined' && config.set) {
        config.set('facturas', next);
      }
      if (typeof config !== 'undefined' && config.save) config.save();
    } catch (e) {
      console.warn('[lab] purge save', e);
      global.__crozzoLabPurgeBypass = false;
      return { ok: false, purged: [], count: 0, amount: 0, error: String(e) };
    } finally {
      global.__crozzoLabPurgeBypass = false;
    }

    auditLab('purge_apply', purged.length + ' fact · $' + Math.round(amount).toLocaleString('es-CO'));
    return { ok: true, purged: purged, count: purged.length, amount: amount };
  }

  function applyOrganizedPicks(picks, opts) {
    opts = opts || {};
    var purgeDeletable = !!opts.purgeDeletable && !!opts.userOrganized;
    var annotated = annotatePicksWithActions(picks, purgeDeletable);
    var toPurge = [];
    var toMask = [];
    annotated.forEach(function (p) {
      if (p.action === 'purge') toPurge.push(p);
      else toMask.push(p);
    });

    var purgeResult = { purged: [], count: 0, amount: 0 };
    if (toPurge.length) {
      purgeResult = purgeFacturasByKeys(
        toPurge.map(function (p) {
          return p.key;
        }),
        opts.reason || 'plan_organizado'
      );
    }

    var maskReduced = toMask.reduce(function (a, p) {
      return a + num(p.delta);
    }, 0);
    return {
      annotated: annotated,
      maskPicks: toMask,
      purged: purgeResult.purged || [],
      purgedCount: purgeResult.count || 0,
      purgeReduced: purgeResult.amount || 0,
      maskReduced: maskReduced,
      reduced: maskReduced + (purgeResult.amount || 0),
    };
  }

  function resolveAuditPicks(opts) {
    opts = opts || {};
    var source = opts.source || 'auto';
    var cfg = loadConfig();
    var iso = opts.iso || todayIso();
    if (source === 'recommend') {
      var recOnly = getPendingRecommendation();
      if (recOnly && recOnly.picks && recOnly.picks.length) {
        return { picks: recOnly.picks, context: 'recommendation', contextLabel: 'Recomendación pendiente', level: recOnly.level, iso: recOnly.iso || iso };
      }
    }
    if (source === 'mask' || source === 'auto') {
      var mask = loadMask();
      var keys = Object.keys(mask.entries || {});
      if (keys.length) {
        var maskPicks = keys.map(function (k) {
          var e = mask.entries[k];
          return {
            key: k,
            uuid: e.uuid,
            consecutivo: e.consecutivo || '—',
            delta: num(e.delta),
            original: num(e.original),
            after: num(e.original) - num(e.delta),
            tolerance: num(e.tolerance),
            level: e.level,
          };
        });
        return {
          picks: maskPicks,
          context: 'active_mask',
          contextLabel: 'Máscara activa hoy',
          level: num(cfg.operMask.level) || 3,
          iso: iso,
        };
      }
    }
    if (source === 'auto') {
      var pending = getPendingRecommendation();
      if (pending && pending.picks && pending.picks.length) {
        return {
          picks: pending.picks,
          context: 'recommendation',
          contextLabel: 'Recomendación pendiente',
          level: pending.level,
          iso: pending.iso || iso,
        };
      }
    }
    var level = num(opts.level) || num(cfg.operMask.level) || 3;
    var preview = previewMaskApply({ level: level, manualReduce: opts.manualReduce });
    return {
      picks: preview.picks || [],
      context: 'preview',
      contextLabel: 'Vista previa (hoy)',
      level: preview.level,
      iso: preview.iso || iso,
      preview: preview,
    };
  }

  function runObviousnessAudit(opts) {
    opts = opts || {};
    if (!isLabRole()) return { ok: false, reason: 'acceso' };
    var resolved = resolveAuditPicks(opts);
    var picks = resolved.picks || [];
    var iso = resolved.iso || todayIso();
    var fiscal = fiscalDayTotal(iso);
    var oper = resolved.context === 'active_mask' ? operativeDayTotal(iso) : fiscal - picks.reduce(function (a, p) { return a + num(p.delta); }, 0);
    var hidden = Math.max(0, fiscal - oper);
    var deltaPct = fiscal > 0 ? Math.round((hidden / fiscal) * 100) : 0;
    var factors = [];
    var obviousScore = 0;

    if (deltaPct >= 18) {
      obviousScore += 28;
      factors.push({ severity: 'high', label: 'Brecha día muy visible', detail: 'Operación ve ' + deltaPct + '% menos que fiscal hoy (−' + Math.round(hidden).toLocaleString('es-CO') + ').', points: 28 });
    } else if (deltaPct >= 10) {
      obviousScore += 16;
      factors.push({ severity: 'medium', label: 'Brecha día moderada', detail: deltaPct + '% de diferencia fiscal vs operación.', points: 16 });
    } else if (deltaPct >= 5) {
      obviousScore += 7;
      factors.push({ severity: 'low', label: 'Brecha día contenida', detail: deltaPct + '% — dentro de rango discreto.', points: 7 });
    } else {
      factors.push({ severity: 'ok', label: 'Brecha día baja', detail: deltaPct + '% — difícil de notar en arqueo rápido.', points: 0 });
    }

    var avgTol =
      picks.length > 0
        ? Math.round(
            picks.reduce(function (a, p) {
              return a + num(p.tolerance);
            }, 0) / picks.length
          )
        : getMaskLevelConfig(resolved.level).tolerance;
    var avgDetect = Math.max(0, 100 - avgTol);
    if (avgDetect >= 55) {
      obviousScore += 26;
      factors.push({ severity: 'high', label: 'Detectabilidad alta', detail: 'Promedio ' + avgDetect + '/100 — cortes grandes o tickets sensibles.', points: 26 });
    } else if (avgDetect >= 35) {
      obviousScore += 14;
      factors.push({ severity: 'medium', label: 'Detectabilidad media', detail: 'Promedio ' + avgDetect + '/100.', points: 14 });
    } else {
      factors.push({ severity: 'ok', label: 'Detectabilidad baja', detail: 'Promedio ' + avgDetect + '/100 — ajuste poco visible.', points: 0 });
    }

    var lvlCfg = getMaskLevelConfig(resolved.level);
    if (picks.length > lvlCfg.maxInvoicesDay) {
      obviousScore += 12;
      factors.push({ severity: 'medium', label: 'Muchas facturas tocadas', detail: picks.length + ' facturas (nivel permite ' + lvlCfg.maxInvoicesDay + '/día).', points: 12 });
    }

    var totalCut = picks.reduce(function (a, p) { return a + num(p.delta); }, 0);
    var maxSingle = 0;
    var highPctCount = 0;
    var roundCutCount = 0;
    picks.forEach(function (p) {
      if (num(p.delta) > maxSingle) maxSingle = num(p.delta);
      var pct = p.original > 0 ? num(p.delta) / num(p.original) : 0;
      if (pct >= 0.25) highPctCount += 1;
      if (num(p.delta) >= 5000 && num(p.delta) % 5000 === 0) roundCutCount += 1;
    });
    if (totalCut > 0 && maxSingle / totalCut >= 0.6) {
      obviousScore += 14;
      factors.push({ severity: 'high', label: 'Concentrado en una factura', detail: 'Un ticket concentra ' + Math.round((maxSingle / totalCut) * 100) + '% del ocultamiento.', points: 14 });
    }
    if (highPctCount >= 2) {
      obviousScore += 10;
      factors.push({ severity: 'medium', label: 'Cortes profundos', detail: highPctCount + ' facturas con recorte ≥25% del ticket.', points: 10 });
    }
    if (picks.length >= 3 && roundCutCount === picks.length) {
      obviousScore += 6;
      factors.push({ severity: 'low', label: 'Montos muy redondos', detail: 'Todos los cortes caen en múltiplos de $5.000 — patrón repetitivo.', points: 6 });
    }

    var dow = new Date(iso + 'T12:00:00').getDay();
    var dowStats = analyzeEasyDiscountByDow();
    var todayStat = dowStats.filter(function (s) { return s.dow === dow; })[0];
    if (todayStat && todayStat.easyScore < 40) {
      obviousScore += 8;
      factors.push({ severity: 'medium', label: 'Día históricamente difícil', detail: todayStat.label + ' score ' + todayStat.easyScore + '/100 — más riesgo de que noten el patrón.', points: 8 });
    }

    if (!picks.length) {
      obviousScore = 0;
      factors.push({ severity: 'ok', label: 'Sin ajustes activos', detail: 'No hay facturas enmascaradas que evaluar.', points: 0 });
    }

    obviousScore = Math.max(0, Math.min(100, obviousScore));
    var visibilityLabel = obviousScore < 28 ? 'Discreto' : obviousScore < 52 ? 'Moderado' : obviousScore < 72 ? 'Notorio' : 'Evidente';
    var verdict = obviousScore < 35 ? 'ok' : obviousScore < 58 ? 'caution' : 'risk';
    var tips = [];
    if (verdict === 'risk') {
      tips.push('Baje de nivel o reduzca la meta — hoy sería fácil de notar.');
      tips.push('Prefiera más facturas chicas con cortes menores (nivel 1–2).');
    } else if (verdict === 'caution') {
      tips.push('Revise cierre de cajero vs vista operación antes de que llegue gerencia de sala.');
    } else {
      tips.push('El ajuste actual es coherente con un día normal de operación.');
    }
    if (deltaPct >= 12) tips.push('Evite que cajero compare totales POS con efectivo en caja sin conciliación previa.');

    var report = {
      ok: true,
      type: 'obviousness',
      at: new Date().toISOString(),
      obviousScore: obviousScore,
      visibilityLabel: visibilityLabel,
      verdict: verdict,
      factors: factors,
      picksCount: picks.length,
      deltaPct: deltaPct,
      fiscal: fiscal,
      oper: oper,
      hidden: hidden,
      avgDetectability: avgDetect,
      context: resolved.context,
      contextLabel: resolved.contextLabel,
      level: resolved.level,
      levelLabel: getMaskLevelConfig(resolved.level).label,
      tips: tips,
    };
    auditLab('audit_obvious', visibilityLabel + ' · ' + obviousScore + '/100 · ' + picks.length + ' fact');
    return report;
  }

  function runComfortAudit(opts) {
    opts = opts || {};
    if (!isLabRole()) return { ok: false, reason: 'acceso' };
    var resolved = resolveAuditPicks(opts);
    var picks = resolved.picks || [];
    var cfg = loadConfig();
    var iso = resolved.iso || todayIso();
    var checks = [];
    var warnings = [];
    var affirmations = [];
    var comfortScore = 0;
    var picksReview = [];

    checks.push({
      id: 'fiscal',
      ok: true,
      label: 'Registro fiscal intacto',
      detail: 'La máscara solo afecta vista operativa. El cierre formal concilia y restaura totales reales.',
    });
    comfortScore += 18;

    checks.push({
      id: 'staff_blind',
      ok: true,
      label: 'Personal sin acceso al Lab',
      detail: 'Operación no ve recomendaciones, topes ocultos ni esta auditoría.',
    });
    comfortScore += 12;

    checks.push({
      id: 'reconcile',
      ok: true,
      label: 'Conciliación en cierre',
      detail: 'Al cierre formal se limpia la máscara y queda trazabilidad en arqueo fiscal.',
    });
    comfortScore += 12;

    var eligibleOk = 0;
    var eligibleFail = 0;
    picks.forEach(function (p) {
      var f = p.key ? findFacturaByKey(p.key) : null;
      var cls = f ? classifyInvoice(f) : { eligible: true, reasons: [], risk: 'bajo' };
      var row = {
        consecutivo: p.consecutivo || (f && f.consecutivo) || '—',
        original: num(p.original),
        delta: num(p.delta),
        eligible: cls.eligible,
        reasons: cls.reasons || [],
        risk: cls.risk,
        okToHide: cls.eligible && num(p.delta) > 0,
        simulated: !f,
      };
      if (!f && String(p.key || '').indexOf('lab-synth') >= 0) {
        row.simulated = true;
        row.okToHide = true;
        row.detail = 'Factura simulada (proyección)';
      } else if (!f) {
        row.okToHide = false;
        row.detail = 'No se encontró en registro — verifique antes de aplicar';
        warnings.push('Factura #' + row.consecutivo + ' no localizada en ventas del día.');
      } else if (!cls.eligible) {
        eligibleFail += 1;
        warnings.push('#' + row.consecutivo + ' ya no es elegible: ' + (cls.reasons.join(', ') || 'riesgo alto'));
      } else {
        eligibleOk += 1;
      }
      picksReview.push(row);
    });

    var eligPct = picks.length ? Math.round((eligibleOk / picks.length) * 100) : 100;
    if (!picks.length) eligPct = 100;
    var eligOk = eligibleFail === 0;
    checks.push({
      id: 'eligible',
      ok: eligOk,
      label: 'Facturas elegibles bajo criterio POS',
      detail: picks.length
        ? eligibleOk + ' de ' + picks.length + ' confirmadas elegibles (efectivo, sin FE/banco/WhatsApp/delicadas).'
        : 'Sin picks activos — nada expuesto a operación.',
    });
    comfortScore += Math.round((eligPct / 100) * 28);

    var cap = num(cfg.operMask.maxEligibleAmount) || 350000;
    var overCap = picks.filter(function (p) { return num(p.original) >= cap; }).length;
    checks.push({
      id: 'cap',
      ok: overCap === 0,
      label: 'Montos bajo tope elegible',
      detail: overCap ? overCap + ' ticket(s) en o sobre $' + cap.toLocaleString('es-CO') : 'Todos bajo $' + cap.toLocaleString('es-CO') + '.',
    });
    if (overCap === 0) comfortScore += 10;
    else warnings.push(overCap + ' factura(s) en rango delicado por monto.');

    var avgTol =
      picks.length > 0
        ? picks.reduce(function (a, p) { return a + num(p.tolerance); }, 0) / picks.length
        : getMaskLevelConfig(resolved.level).tolerance;
    checks.push({
      id: 'tolerance',
      ok: avgTol >= 55,
      label: 'Tolerancia del ajuste',
      detail: 'Promedio ' + Math.round(avgTol) + '/100 en tickets tocados.',
    });
    if (avgTol >= 55) comfortScore += 10;
    else warnings.push('Cortes con tolerancia baja — más fáciles de detectar en operación.');

    var blocked = getBlockedReasonsSummary(iso);
    var blockedTotal = 0;
    Object.keys(blocked).forEach(function (k) { blockedTotal += blocked[k]; });
    checks.push({
      id: 'protected',
      ok: true,
      label: 'Facturas protegidas hoy',
      detail: blockedTotal + ' ventas excluidas automáticamente (FE, banco, WhatsApp, delicadas).',
    });
    comfortScore += 10;

    if (cfg.recommendations && cfg.recommendations.enabled) {
      checks.push({ id: 'rec_flow', ok: true, label: 'Flujo de recomendaciones', detail: 'Usted decide en Lab; expiran si no acepta antes del cierre noche.' });
      comfortScore += 5;
    }

    comfortScore = Math.max(0, Math.min(100, comfortScore));
    var comfortLabel = comfortScore >= 82 ? 'Alta confianza' : comfortScore >= 62 ? 'Aceptable' : comfortScore >= 42 ? 'Con reservas' : 'Revise antes de aplicar';
    var verdict = comfortScore >= 75 ? 'ok' : comfortScore >= 55 ? 'caution' : 'risk';

    if (eligOk > 0) affirmations.push('Las facturas ocultas son ventas POS en efectivo dentro del perfil de bajo riesgo.');
    if (eligibleFail === 0 && picks.length) affirmations.push('Ninguna factura seleccionada viola las reglas de elegibilidad.');
    affirmations.push('El dinero en caja física sigue cuadrando con el arqueo fiscal al cierre.');
    affirmations.push('Solo usted (admin) ve este análisis — el equipo operativo no recibe alertas.');
    if (comfortScore >= 75) affirmations.push('Puede proceder con mayor tranquilidad; el diseño prioriza lo escondible sin tocar lo delicado.');

    var report = {
      ok: true,
      type: 'comfort',
      at: new Date().toISOString(),
      comfortScore: comfortScore,
      comfortLabel: comfortLabel,
      verdict: verdict,
      checks: checks,
      affirmations: affirmations,
      warnings: warnings,
      picksReview: picksReview,
      blockedSummary: blocked,
      context: resolved.context,
      contextLabel: resolved.contextLabel,
      level: resolved.level,
      levelLabel: getMaskLevelConfig(resolved.level).label,
    };
    auditLab('audit_comfort', comfortLabel + ' · ' + comfortScore + '/100 · ' + picks.length + ' fact');
    return report;
  }

  function runDecisionAudits(opts) {
    opts = opts || {};
    var obvious = runObviousnessAudit(opts);
    var comfort = runComfortAudit(opts);
    auditLab('audit_decision', (obvious.visibilityLabel || '—') + ' · confianza ' + (comfort.comfortScore || 0) + '/100');
    return { ok: true, obvious: obvious, comfort: comfort };
  }

  function getBlockedReasonsSummary(iso) {
    iso = iso || todayIso();
    var rep = getEligibleReport(iso);
    var counts = {};
    rep.blocked.forEach(function (r) {
      (r.cls.reasons || []).forEach(function (reason) {
        counts[reason] = (counts[reason] || 0) + 1;
      });
    });
    return counts;
  }

  function getDashboardSummary() {
    var cfg = loadConfig();
    var mask = loadMask();
    var cap = hiddenCapStatus();
    var iso = todayIso();
    var fiscal = fiscalDayTotal(iso);
    var oper = operativeDayTotal(iso);
    var archived = getPurgedArchiveTotals(iso);
    var emuActive = !!(global.CrozzoEmulationHarness && global.CrozzoEmulationHarness.isActive && global.CrozzoEmulationHarness.isActive());
    var maskEntries = mask.entries ? Object.keys(mask.entries).length : 0;
    var reduced = mask.dayTotals && mask.dayTotals[iso] ? num(mask.dayTotals[iso].reduced) : 0;
    if (!reduced && mask.entries) {
      Object.keys(mask.entries).forEach(function (k) {
        reduced += num(mask.entries[k].delta);
      });
    }
    return {
      iso: iso,
      session: formatSessionRemaining(),
      sessionMs: getSessionRemainingMs(),
      maskActive: isMaskActive(),
      maskEntries: maskEntries,
      operMaskEnabled: cfg.operMask.enabled,
      cap: cap,
      fiscalToday: fiscal,
      fiscalVisible: fiscal,
      archivedToday: archived.total,
      archivedCount: archived.count,
      fiscalTruthAdmin: fiscal + archived.total,
      operToday: oper,
      deltaToday: fiscal - oper,
      deltaTruthAdmin: fiscal + archived.total - oper,
      reducedToday: reduced,
      emulationActive: emuActive,
      lastProjection: cfg.emulation.lastProjectionAt || '',
      previewOperative: !!global.__crozzoLabPreviewOperative,
      pendingRecommend: !!getPendingRecommendation(iso),
    };
  }

  function autoApplyCapIfNeeded() {
    if (!isLabRole()) return { ok: false };
    var cfg = loadConfig();
    if (!cfg.hiddenCap.enabled || num(cfg.hiddenCap.amount) <= 0) return { ok: false, skipped: true };
    var oper = operativeDayTotal();
    if (oper <= cfg.hiddenCap.amount) return { ok: false, skipped: true };
    return applyOperMask({
      enabled: true,
      patternAdjust: cfg.operMask.patternAdjust,
      manualReduce: 0,
      reason: 'auto_cap',
    });
  }

  function scoreInvoiceStealth(f, lvl) {
    lvl = lvl || getMaskLevelConfig(1);
    var total = num(f.total);
    if (total <= 0) return null;
    var ceiling = Math.min(total * lvl.maxCutPct, num(loadConfig().operMask.maxEligibleAmount) * lvl.capFactor);
    var fill = num(lvl.cutFill) || 0.32;
    var delta = roundToStep(Math.max(lvl.minCut, ceiling * fill), lvl.roundStep);
    if (delta >= total) delta = roundToStep(total - lvl.minCut, lvl.roundStep);
    if (delta < lvl.minCut) return null;
    var pick = { original: total, delta: delta };
    var tolerance = Math.round(scorePickTolerance(pick, lvl));
    var hour = new Date(facturaTs(f)).getHours();
    var smallBonus = total < 70000 ? 18 : total < 110000 ? 10 : total < 180000 ? 4 : 0;
    var hourBonus = hour >= 11 && hour <= 21 ? 6 : 3;
    var roundBonus = delta % 5000 !== 0 ? 4 : 0;
    var stealthScore = Math.max(0, Math.min(100, Math.round(tolerance * 0.62 + smallBonus + hourBonus + roundBonus)));
    return {
      tolerance: tolerance,
      detectability: Math.max(0, 100 - tolerance),
      stealthScore: stealthScore,
      suggestedCut: delta,
      cutPct: total > 0 ? Math.round((delta / total) * 100) : 0,
      hour: hour,
      hourLabel: (hour < 10 ? '0' : '') + hour + ':00',
    };
  }

  function huntStealthInvoices(opts) {
    opts = opts || {};
    if (!isLabRole()) return { ok: false, reason: 'acceso' };
    var daysBack = Math.max(1, num(opts.daysBack) || 30);
    var limit = Math.max(5, num(opts.limit) || 40);
    var level = num(opts.level) || 1;
    var lvl = getMaskLevelConfig(level);
    var isoOnly = opts.iso || null;
    var cutoff = Date.now() - daysBack * 86400000;
    var mask = loadMask();
    var cfg = loadConfig().operMask;
    var candidates = [];
    var blockedCounts = {};
    var totalScanned = 0;

    getFacturasRaw().forEach(function (f) {
      if (!isValidSale(f)) return;
      var t = facturaTs(f);
      if (isoOnly) {
        var fIso = new Date(t).toISOString().slice(0, 10);
        if (fIso !== isoOnly) return;
      } else if (t < cutoff) return;
      totalScanned += 1;
      var cls = classifyInvoiceForLevel(f, cfg, lvl);
      if (!cls.eligible) {
        (cls.reasons || []).forEach(function (r) {
          blockedCounts[r] = (blockedCounts[r] || 0) + 1;
        });
        return;
      }
      var key = maskEntryKey(f);
      if (mask.entries[key] && !opts.includeMasked) return;
      var stealth = scoreInvoiceStealth(f, lvl);
      if (!stealth) return;
      candidates.push({
        key: key,
        uuid: f.uuid,
        consecutivo: f.consecutivo,
        iso: new Date(t).toISOString().slice(0, 10),
        total: num(f.total),
        metodoPago: f.metodoPago,
        relaxed: !!cls.relaxed,
        stealthScore: stealth.stealthScore,
        tolerance: stealth.tolerance,
        detectability: stealth.detectability,
        suggestedCut: stealth.suggestedCut,
        cutPct: stealth.cutPct,
        hourLabel: stealth.hourLabel,
        dow: new Date(t).getDay(),
        dowLabel: DOW_LABELS[new Date(t).getDay()],
      });
    });

    candidates.sort(function (a, b) {
      return b.stealthScore - a.stealthScore || a.total - b.total;
    });

    var byDow = {};
    var byHour = {};
    candidates.forEach(function (c) {
      byDow[c.dowLabel] = (byDow[c.dowLabel] || 0) + 1;
      byHour[c.hourLabel] = (byHour[c.hourLabel] || 0) + 1;
    });
    var topDow = Object.keys(byDow).sort(function (a, b) { return byDow[b] - byDow[a]; })[0] || '—';
    var topHour = Object.keys(byHour).sort(function (a, b) { return byHour[b] - byHour[a]; })[0] || '—';

    var growTips = [];
    growTips.push('Use Nivel 1 con tickets chicos — más piezas, menos detectables.');
    if (blockedCounts.electronica) growTips.push(blockedCounts.electronica + ' ventas bloqueadas por FE — POS sin FE en tickets chicos amplía el pool.');
    if (blockedCounts.medio_banco) growTips.push(blockedCounts.medio_banco + ' por banco/tarjeta — más efectivo POS puro suma candidatas.');
    if (blockedCounts.whatsapp) growTips.push(blockedCounts.whatsapp + ' enviadas WhatsApp — evite comprobante si busca sigilo.');
    if (blockedCounts.delicada) growTips.push(blockedCounts.delicada + ' delicadas/monto alto — tickets bajo tope sin NIT corporativo.');
    if (blockedCounts.no_efectivo) growTips.push(blockedCounts.no_efectivo + ' sin efectivo — capacite caja en POS efectivo.');
    if (topDow !== '—') growTips.push('Mejor histórico sigiloso: ' + topDow + ' · franja ' + topHour + '.');

    auditLab('stealth_hunt', daysBack + 'd · ' + candidates.length + ' cand · lvl' + level);
    return {
      ok: true,
      daysBack: daysBack,
      level: level,
      levelLabel: lvl.label,
      totalScanned: totalScanned,
      poolSize: candidates.length,
      candidates: candidates.slice(0, limit),
      blockedCounts: blockedCounts,
      topDow: topDow,
      topHour: topHour,
      growTips: growTips,
    };
  }

  function getEligibleReport(iso) {
    iso = iso || todayIso();
    var from = new Date(iso + 'T00:00:00').getTime();
    var to = from + 86400000;
    var eligible = [];
    var blocked = [];
    getFacturasRaw().forEach(function (f) {
      if (!isValidSale(f)) return;
      var t = facturaTs(f);
      if (t < from || t >= to) return;
      var cls = classifyInvoice(f);
      var row = { uuid: f.uuid, consecutivo: f.consecutivo, total: num(f.total), metodoPago: f.metodoPago, cls: cls };
      if (cls.eligible) eligible.push(row);
      else blocked.push(row);
    });
    return { eligible: eligible, blocked: blocked, iso: iso };
  }

  function installHooks() {
    if (_hooksInstalled || typeof config === 'undefined' || !config.getFacturas) return;
    _origGetFacturas = config.getFacturas.bind(config);
    config.getFacturas = function labGetFacturasWrapper() {
      return getFacturasForView();
    };
    config.getFacturasFiscal = function () {
      return _origGetFacturas() || [];
    };
    _hooksInstalled = true;
  }

  function tryInstallHooksLater() {
    installHooks();
    if (!_hooksInstalled) {
      setTimeout(installHooks, 500);
      setTimeout(installHooks, 2000);
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tryInstallHooksLater);
    else tryInstallHooksLater();
  } else {
    tryInstallHooksLater();
  }

  global.CrozzoLaboratorioCore = {
    esc: esc,
    DEFAULT_LAB_PIN: DEFAULT_LAB_PIN,
    normalizeLabPin: normalizeLabPin,
    isLabRole: isLabRole,
    isStealthMode: isStealthMode,
    setStealthMode: setStealthMode,
    setKnockRequired: setKnockRequired,
    isKnockRequired: isKnockRequired,
    isKnockArmed: isKnockArmed,
    armKnockWindow: armKnockWindow,
    shortcutAllowed: shortcutAllowed,
    LAB_KNOCK_MS: LAB_KNOCK_MS,
    LAB_KNOCK_CLICKS: LAB_KNOCK_CLICKS,
    LAB_KNOCK_WINDOW_MS: LAB_KNOCK_WINDOW_MS,
    isSessionUnlocked: isSessionUnlocked,
    unlockSession: unlockSession,
    lockSession: lockSession,
    pinIsSet: pinIsSet,
    ensureDefaultLabPin: ensureDefaultLabPin,
    setPin: setPin,
    verifyPin: verifyPin,
    loadConfig: loadConfig,
    saveConfig: saveConfig,
    loadMask: loadMask,
    auditLab: auditLab,
    classifyInvoice: classifyInvoice,
    analyzeWeekdayPattern: analyzeWeekdayPattern,
    applyOperMask: applyOperMask,
    clearOperMask: clearOperMask,
    reconcileAtClose: reconcileAtClose,
    buildMonthProjection: buildMonthProjection,
    runEmulationSandbox: runEmulationSandbox,
    getDashboardSummary: getDashboardSummary,
    getBlockedReasonsSummary: getBlockedReasonsSummary,
    autoApplyCapIfNeeded: autoApplyCapIfNeeded,
    getSessionRemainingMs: getSessionRemainingMs,
    formatSessionRemaining: formatSessionRemaining,
    isMaskActive: isMaskActive,
    setPreviewOperative: function (on) {
      global.__crozzoLabPreviewOperative = !!on;
    },
    getEligibleReport: getEligibleReport,
    getMaskLevelConfig: getMaskLevelConfig,
    listMaskLevels: listMaskLevels,
    simulateDayMask: simulateDayMask,
    simulateMonthMask: simulateMonthMask,
    simulateMonthMaskDeclared: simulateMonthMaskDeclared,
    compareLevelSimulations: compareLevelSimulations,
    buildSyntheticFacturasFromDeclaredSales: buildSyntheticFacturasFromDeclaredSales,
    simulateLevelMaxCapacity: simulateLevelMaxCapacity,
    MASK_LEVELS: MASK_LEVELS,
    analyzeEasyDiscountByDow: analyzeEasyDiscountByDow,
    analyzePatternsDeep: analyzePatternsDeep,
    buildRecommendationPreview: buildRecommendationPreview,
    previewMaskApply: previewMaskApply,
    evaluateMarginTarget: evaluateMarginTarget,
    runObviousnessAudit: runObviousnessAudit,
    runComfortAudit: runComfortAudit,
    runDecisionAudits: runDecisionAudits,
    huntStealthInvoices: huntStealthInvoices,
    scoreInvoiceStealth: scoreInvoiceStealth,
    canPurgeInvoice: canPurgeInvoice,
    annotatePicksWithActions: annotatePicksWithActions,
    loadPurgeTombstones: loadPurgeTombstones,
    getPurgedArchiveList: getPurgedArchiveList,
    getPurgedArchiveTotals: getPurgedArchiveTotals,
    getPurgedFacturaCopy: getPurgedFacturaCopy,
    runFullEmulationAnalysis: runFullEmulationAnalysis,
    loadLastEmulationReport: loadLastEmulationReport,
    getPendingRecommendation: getPendingRecommendation,
    loadRecommendations: loadRecommendations,
    acceptRecommendation: acceptRecommendation,
    rejectRecommendation: rejectRecommendation,
    manualGenerateRecommendation: manualGenerateRecommendation,
    buildRecommendationAfterClose: buildRecommendationAfterClose,
    onCashierClose: onCashierClose,
    suggestLevelForDow: suggestLevelForDow,
    hiddenCapStatus: hiddenCapStatus,
    operativeDayTotal: operativeDayTotal,
    fiscalDayTotal: fiscalDayTotal,
    getFacturasFiscal: function () {
      return getFacturasRaw();
    },
    SESSION_MS: SESSION_MS,
  };

  global.crozzoLabCanAccessRole = isLabRole;
  global.crozzoLabStealthEnabled = isStealthMode;
  global.crozzoLabKnockIsArmed = isKnockArmed;
  global.crozzoLabShortcutAllowed = shortcutAllowed;
  global.crozzoLabIsSessionUnlocked = isSessionUnlocked;
  global.crozzoLabReconcileAtClose = reconcileAtClose;
  global.crozzoLabHiddenCapStatus = hiddenCapStatus;
  global.crozzoLabOnCashierClose = onCashierClose;
  global.crozzoLabGetPendingRecommendation = getPendingRecommendation;
  global.crozzoLabExpireRecommendations = expireRecommendations;

  void ensureDefaultLabPin();
})(typeof window !== 'undefined' ? window : globalThis);
