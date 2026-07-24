/**
 * Crozzo AI Insights — reporte narrativo admin (macro 8d / mes).
 * Flag `aiReportes` viaja a la sede; la API key NVIDIA solo vive en Edge Function.
 */
(function (global) {
  'use strict';
  if (global.CrozzoAiInsights) return;

  var LS_INSIGHT = 'crozzo_ai_insight_v1';
  var LS_KEY_STATUS = 'crozzo_ai_key_status_v1';
  /** Solo Super Admin en este PC — nunca en QR / tenant_snapshot. */
  var LS_LOCAL_KEY = 'crozzo_ai_nvidia_key_local_v1';
  var LS_EDGE_DOWN = 'crozzo_ai_edge_down_until_v1';
  var DEFAULT_MODEL = 'meta/llama-3.3-70b-instruct';
  var FN_NAME = 'ai-insights';
  var NVIDIA_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
  var EDGE_COOLDOWN_MS = 15 * 60 * 1000;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function normalizeCfg(raw) {
    var c = raw && typeof raw === 'object' ? raw : {};
    var cadence = c.cadence === 'month' ? 'month' : '8d';
    return {
      enabled: !!c.enabled,
      cadence: cadence,
      model: String(c.model || DEFAULT_MODEL).trim() || DEFAULT_MODEL,
    };
  }

  function readCfg() {
    try {
      if (typeof config !== 'undefined' && config && typeof config.get === 'function') {
        return normalizeCfg(config.get('aiReportes'));
      }
    } catch (_) {}
    return normalizeCfg(null);
  }

  function writeCfg(patch) {
    var next = normalizeCfg(Object.assign({}, readCfg(), patch || {}));
    try {
      if (typeof config !== 'undefined' && config && typeof config.set === 'function') {
        config.set('aiReportes', next);
      }
    } catch (_) {}
    try {
      if (typeof crozzoPushTenantSnapshotToCloud === 'function') {
        crozzoPushTenantSnapshotToCloud().catch(function () {});
      }
    } catch (_) {}
    return next;
  }

  function isEnabled() {
    return !!readCfg().enabled;
  }

  function businessId() {
    try {
      if (typeof getMultiDeviceConfig === 'function') {
        return String(getMultiDeviceConfig().businessId || '').trim();
      }
    } catch (_) {}
    try {
      return String(localStorage.getItem('crozzo_business_id') || '').trim();
    } catch (_) {
      return '';
    }
  }

  function sbCreds() {
    try {
      if (typeof readCrozzoSupabaseJson === 'function') {
        var f = readCrozzoSupabaseJson();
        if (f && f.url && (f.anonKey || f.key)) {
          return { url: String(f.url).replace(/\/+$/, ''), key: String(f.anonKey || f.key) };
        }
      }
    } catch (_) {}
    try {
      var raw = localStorage.getItem('crozzo_supabase_config');
      var j = raw ? JSON.parse(raw) : null;
      if (j && j.url && (j.anonKey || j.key)) {
        return { url: String(j.url).replace(/\/+$/, ''), key: String(j.anonKey || j.key) };
      }
    } catch (_) {}
    return null;
  }

  function functionUrl() {
    var c = sbCreds();
    if (!c) return '';
    return c.url + '/functions/v1/' + FN_NAME;
  }

  function ymd(d) {
    var x = d instanceof Date ? d : new Date(d);
    var m = x.getMonth() + 1;
    var day = x.getDate();
    return (
      x.getFullYear() +
      '-' +
      (m < 10 ? '0' : '') +
      m +
      '-' +
      (day < 10 ? '0' : '') +
      day
    );
  }

  function addDays(ymdStr, n) {
    var p = String(ymdStr || '').split('-');
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    d.setDate(d.getDate() + n);
    return ymd(d);
  }

  function historyRows() {
    try {
      if (global.CrozzoCierreTurnos && typeof CrozzoCierreTurnos.getHistory === 'function') {
        return CrozzoCierreTurnos.getHistory() || [];
      }
    } catch (_) {}
    try {
      var rows = JSON.parse(localStorage.getItem('crozzo_shift_turn_history_v1') || '[]');
      return Array.isArray(rows) ? rows : [];
    } catch (_) {
      return [];
    }
  }

  function dayTotalsFromHistory(fromYmd, toYmdExclusive) {
    var byDay = {};
    var byHour = {};
    var i;
    for (i = 0; i < 24; i++) byHour[i] = { sales: 0, count: 0 };

    historyRows().forEach(function (r) {
      if (!r || r.recordKind === 'supervision') return;
      if (r.shiftType && r.shiftType !== 'dia' && r.recordKind !== 'cierre') {
        /* include manana/tarde/dia cierres */
      }
      var day = String(r.businessDate || '').slice(0, 10);
      if (!day || day < fromYmd || day >= toYmdExclusive) return;
      if (!byDay[day]) byDay[day] = { sales: 0, count: 0, cash: 0 };
      byDay[day].sales += Number(r.totalSales) || 0;
      byDay[day].count += Number(r.salesCount) || 0;
      byDay[day].cash += Number(r.cashSales) || 0;
    });

    /* Hour buckets: prefer facturas if available */
    try {
      var invs = typeof config !== 'undefined' && config.getFacturas ? config.getFacturas() || [] : [];
      var fromTs = new Date(fromYmd + 'T00:00:00').getTime();
      var toTs = new Date(toYmdExclusive + 'T00:00:00').getTime();
      invs.forEach(function (f) {
        var t = 0;
        if (typeof crozzoRepFacturaTs === 'function') t = crozzoRepFacturaTs(f);
        else if (typeof crozzoShiftFacturaTs === 'function') t = crozzoShiftFacturaTs(f);
        else t = Date.parse(f.fecha || f.fechaEmision || f.created_at || '') || 0;
        if (!Number.isFinite(t) || t < fromTs || t >= toTs) return;
        var h = new Date(t).getHours();
        byHour[h].sales += Number(f.total) || 0;
        byHour[h].count += 1;
      });
    } catch (_) {}

    var days = Object.keys(byDay).sort();
    var totalSales = 0;
    var totalCount = 0;
    days.forEach(function (d) {
      totalSales += byDay[d].sales;
      totalCount += byDay[d].count;
    });

    var peakHour = 0;
    var valleyHour = 0;
    var peakVal = -1;
    var valleyVal = Infinity;
    for (i = 0; i < 24; i++) {
      var v = byHour[i].sales;
      if (v > peakVal) {
        peakVal = v;
        peakHour = i;
      }
      if (v < valleyVal) {
        valleyVal = v;
        valleyHour = i;
      }
    }

    return {
      from: fromYmd,
      toExclusive: toYmdExclusive,
      days: days.length,
      totalSales: Math.round(totalSales),
      totalCount: totalCount,
      ticketAvg: totalCount ? Math.round(totalSales / totalCount) : 0,
      byDay: byDay,
      byHour: byHour,
      peakHour: peakHour,
      valleyHour: valleyHour,
      peakSales: Math.round(peakVal < 0 ? 0 : peakVal),
      valleySales: Math.round(valleyVal === Infinity ? 0 : valleyVal),
    };
  }

  function buildPeriodPack(range) {
    var today = ymd(new Date());
    var from;
    var toEx = today;
    var label;
    if (range === 'month') {
      var now = new Date();
      from = ymd(new Date(now.getFullYear(), now.getMonth(), 1));
      label = 'mes';
    } else {
      from = addDays(today, -8);
      label = '8d';
    }
    var current = dayTotalsFromHistory(from, toEx);
    var spanDays = Math.max(1, Math.round((new Date(toEx) - new Date(from)) / 86400000));
    var prevTo = from;
    var prevFrom = addDays(prevTo, -spanDays);
    var previous = dayTotalsFromHistory(prevFrom, prevTo);

    var bizName = '';
    try {
      bizName = String((typeof getMultiDeviceConfig === 'function' ? getMultiDeviceConfig().businessName : '') || '').trim();
    } catch (_) {}

    return {
      v: 1,
      range: label,
      businessId: businessId(),
      businessName: bizName || undefined,
      generatedAt: new Date().toISOString(),
      current: {
        from: current.from,
        toExclusive: current.toExclusive,
        days: current.days,
        totalSales: current.totalSales,
        totalCount: current.totalCount,
        ticketAvg: current.ticketAvg,
        peakHour: current.peakHour,
        valleyHour: current.valleyHour,
        peakSales: current.peakSales,
        valleySales: current.valleySales,
        byHour: current.byHour,
        daySales: Object.keys(current.byDay)
          .sort()
          .map(function (d) {
            return { day: d, sales: Math.round(current.byDay[d].sales), count: current.byDay[d].count };
          }),
      },
      previous: {
        from: previous.from,
        toExclusive: previous.toExclusive,
        days: previous.days,
        totalSales: previous.totalSales,
        totalCount: previous.totalCount,
        ticketAvg: previous.ticketAvg,
        peakHour: previous.peakHour,
        valleyHour: previous.valleyHour,
      },
    };
  }

  var VOID_TIPOS = {
    remove_line: 1,
    anular_comandado: 1,
    anular_comandado_qty: 1,
    clear_pending: 1,
    clear_all: 1,
    tablet_remove_line: 1,
    tablet_qty_down: 1,
    tablet_anular_comandado: 1,
    tablet_anular_comandado_qty: 1,
    qty_down: 1,
    cobro_abortado: 1,
    logout_con_consumo: 1,
    leave_unpaid_blocked: 1,
  };

  /** Señales de riesgo caja (efectivo / salida sin cobro) — pesan en flags. */
  var VOID_CASH_RISK = {
    cobro_abortado: 1,
    logout_con_consumo: 1,
    leave_unpaid_blocked: 1,
  };

  var LS_BEHAVIOR = 'crozzo_ai_behavior_insight_v1';
  var LS_BEHAVIOR_RATE = 'crozzo_ai_behavior_rate_v2';
  var BEHAVIOR_MAX_PER_HOUR = 12;

  function canSeeAuditUi() {
    try {
      if (typeof isSuperAdminUser === 'function' && isSuperAdminUser()) return true;
    } catch (_) {}
    try {
      if (typeof crozzoHasCajaPermiso === 'function' && crozzoHasCajaPermiso('cierre_arqueo')) return true;
    } catch (_) {}
    try {
      var r =
        typeof crozzoGetCurrentUserRole === 'function'
          ? String(crozzoGetCurrentUserRole() || '').toLowerCase()
          : '';
      if (typeof crozzoNormalizeAppRol === 'function') r = crozzoNormalizeAppRol(r);
      return (
        r === 'admin' ||
        r === 'superadmin' ||
        r === 'super_admin' ||
        r === 'kenny' ||
        r === 'encargado'
      );
    } catch (_) {}
    return false;
  }

  function canAdminAiAudit() {
    return canSeeAuditUi() && isEnabled();
  }

  function labMaskActiveFlag() {
    try {
      if (typeof global.crozzoLabIsSessionUnlocked === 'function' && global.crozzoLabIsSessionUnlocked()) {
        var cfg =
          typeof global.CrozzoLaboratorioCore !== 'undefined' && global.CrozzoLaboratorioCore.loadConfig
            ? global.CrozzoLaboratorioCore.loadConfig()
            : null;
        if (cfg && cfg.operMask && cfg.operMask.enabled) return true;
      }
    } catch (_) {}
    try {
      var raw = localStorage.getItem('crozzo_lab_oper_mask_v1');
      if (raw) {
        var m = JSON.parse(raw);
        if (m && m.enabled) return true;
      }
    } catch (_) {}
    return false;
  }

  /** Facturas sin máscara Lab cuando sea posible (verdad fiscal para contraespionaje). */
  function getFacturasTruth() {
    try {
      if (
        typeof global.CrozzoLaboratorioCore !== 'undefined' &&
        typeof global.CrozzoLaboratorioCore.getFacturasFiscal === 'function'
      ) {
        return global.CrozzoLaboratorioCore.getFacturasFiscal() || [];
      }
    } catch (_) {}
    try {
      if (typeof config !== 'undefined' && config && typeof config.getFacturasFiscal === 'function') {
        return config.getFacturasFiscal() || [];
      }
    } catch (_) {}
    try {
      if (typeof config !== 'undefined' && config && config.config && Array.isArray(config.config.facturas)) {
        return config.config.facturas.slice();
      }
    } catch (_) {}
    try {
      if (typeof config !== 'undefined' && config && typeof config.getFacturas === 'function') {
        return config.getFacturas() || [];
      }
    } catch (_) {}
    return [];
  }

  function facturaTs(f) {
    if (!f) return NaN;
    if (typeof crozzoRepFacturaTs === 'function') return crozzoRepFacturaTs(f);
    if (typeof crozzoShiftFacturaTs === 'function') return crozzoShiftFacturaTs(f);
    return Date.parse(f.fecha || f.fechaEmision || f.created_at || '') || NaN;
  }

  function resolvePresetRange(mode) {
    var today = ymd(new Date());
    var from;
    var toEx = addDays(today, 1);
    var label = mode || '8d';
    if (mode === 'month') {
      var now = new Date();
      from = ymd(new Date(now.getFullYear(), now.getMonth(), 1));
      label = 'mes';
    } else if (mode === 'custom') {
      from = today;
      label = 'custom';
    } else if (mode === 'today' || mode === 'turno') {
      from = today;
      toEx = addDays(today, 1);
      label = mode === 'turno' ? 'turno' : 'hoy';
    } else {
      from = addDays(today, -7);
      label = '8d';
    }
    return { from: from, toExclusive: toEx, label: label };
  }

  function readVoidLogAll() {
    try {
      if (typeof config !== 'undefined' && config && typeof config.get === 'function') {
        var log = config.get('cajaVoidLog') || [];
        return Array.isArray(log) ? log : [];
      }
    } catch (_) {}
    return [];
  }

  function readBehaviorRateArr() {
    var now = Date.now();
    var arr = [];
    try {
      arr = JSON.parse(localStorage.getItem(LS_BEHAVIOR_RATE) || '[]');
      if (!Array.isArray(arr)) arr = [];
    } catch (_) {
      arr = [];
    }
    return arr.filter(function (t) {
      return now - Number(t) < 3600000;
    });
  }

  /** Solo mira cuota — no gasta intento. */
  function peekBehaviorRateLimit() {
    var arr = readBehaviorRateArr();
    if (arr.length >= BEHAVIOR_MAX_PER_HOUR) {
      return {
        ok: false,
        remaining: 0,
        retryInMin: Math.ceil((3600000 - (Date.now() - Number(arr[0]))) / 60000),
        used: arr.length,
      };
    }
    return { ok: true, remaining: BEHAVIOR_MAX_PER_HOUR - arr.length, used: arr.length };
  }

  /** Gasta 1 intento solo tras éxito real (NVIDIA o vacío local honesto). */
  function commitBehaviorRateSuccess() {
    var arr = readBehaviorRateArr();
    arr.push(Date.now());
    try {
      localStorage.setItem(LS_BEHAVIOR_RATE, JSON.stringify(arr));
    } catch (_) {}
    return { ok: true, remaining: Math.max(0, BEHAVIOR_MAX_PER_HOUR - arr.length), used: arr.length };
  }

  function clearBehaviorRateLimit() {
    try {
      localStorage.removeItem(LS_BEHAVIOR_RATE);
      localStorage.removeItem('crozzo_ai_behavior_rate_v1');
    } catch (_) {}
    return { ok: true };
  }

  /** @deprecated usar peek + commit; se mantiene por compat. */
  function checkBehaviorRateLimit() {
    return peekBehaviorRateLimit();
  }

  /**
   * Pack de contraespionaje: ventas + voids + señales cash (agregado, sin NIT/CUFE).
   */
  function buildBehaviorPack(opts) {
    opts = opts || {};
    var from = String(opts.fromYmd || '').slice(0, 10);
    var toEx = String(opts.toYmdExclusive || '').slice(0, 10);
    if (!from || !toEx) {
      var preset = resolvePresetRange(opts.mode || '8d');
      from = preset.from;
      toEx = preset.toExclusive;
    }
    var fromTs = new Date(from + 'T00:00:00').getTime();
    var toTs = new Date(toEx + 'T00:00:00').getTime();
    if (!Number.isFinite(fromTs) || !Number.isFinite(toTs) || toTs <= fromTs) {
      return { ok: false, error: 'invalid_range' };
    }
    var userFilter = String(opts.userId || '').trim().toLowerCase();
    var facturas = getFacturasTruth().filter(function (f) {
      var t = facturaTs(f);
      if (!Number.isFinite(t) || t < fromTs || t >= toTs) return false;
      if (!userFilter) return true;
      var u = String(f.cobradoPor || f.userId || f.cajeroId || f.usuario || '').toLowerCase();
      return u === userFilter || u.indexOf(userFilter) >= 0;
    });
    var voids = readVoidLogAll().filter(function (e) {
      if (!e || !VOID_TIPOS[e.tipo]) return false;
      var t = new Date(e.at || 0).getTime();
      if (!Number.isFinite(t) || t < fromTs || t >= toTs) return false;
      if (!userFilter) return true;
      return String(e.user || '').toLowerCase().indexOf(userFilter) >= 0;
    });

    var totalSales = 0;
    var cashSales = 0;
    var cashCount = 0;
    var byHour = {};
    var byUser = {};
    var i;
    for (i = 0; i < 24; i++) byHour[i] = { sales: 0, count: 0, voids: 0 };
    facturas.forEach(function (f) {
      var tot = Number(f.total) || 0;
      totalSales += tot;
      var metodo = String(f.metodoPago || f.pago || '').toLowerCase();
      if (metodo.indexOf('efectivo') >= 0 || metodo === 'cash') {
        cashSales += tot;
        cashCount += 1;
      }
      var h = new Date(facturaTs(f)).getHours();
      if (byHour[h]) {
        byHour[h].sales += tot;
        byHour[h].count += 1;
      }
      var uid = String(f.cobradoPor || f.userId || f.cajeroId || 'desconocido');
      if (!byUser[uid]) byUser[uid] = { sales: 0, count: 0, voids: 0, cashCount: 0 };
      byUser[uid].sales += tot;
      byUser[uid].count += 1;
      if (metodo.indexOf('efectivo') >= 0) byUser[uid].cashCount += 1;
    });

    var voidByType = {};
    var voidLate = 0;
    var cashRiskCount = 0;
    voids.forEach(function (e) {
      voidByType[e.tipo] = (voidByType[e.tipo] || 0) + 1;
      if (VOID_CASH_RISK[e.tipo]) cashRiskCount += 1;
      var h = new Date(e.at || 0).getHours();
      if (byHour[h]) byHour[h].voids += 1;
      if (h >= 21 || h < 2) voidLate += 1;
      var uid = String(e.user || 'desconocido');
      if (!byUser[uid]) byUser[uid] = { sales: 0, count: 0, voids: 0, cashCount: 0 };
      byUser[uid].voids += 1;
    });

    var totalCount = facturas.length;
    var voidCount = voids.length;
    var ratioVoid = totalCount ? Math.round((voidCount / totalCount) * 1000) / 10 : voidCount ? 100 : 0;
    var peerVoids = Object.keys(byUser).map(function (k) {
      return byUser[k].voids;
    });
    peerVoids.sort(function (a, b) {
      return a - b;
    });
    var medianVoids = peerVoids.length
      ? peerVoids[Math.floor(peerVoids.length / 2)]
      : 0;
    var outliers = Object.keys(byUser)
      .filter(function (k) {
        return byUser[k].voids >= Math.max(3, medianVoids * 2);
      })
      .map(function (k) {
        return {
          user: k,
          voids: byUser[k].voids,
          sales: Math.round(byUser[k].sales),
          tickets: byUser[k].count,
          cashTickets: byUser[k].cashCount,
        };
      })
      .slice(0, 8);

    var flags = [];
    if (ratioVoid >= 15) flags.push('ratio_void_alto');
    if (voidLate >= 5 && voidLate / Math.max(1, voidCount) >= 0.4) flags.push('voids_tarde_turno');
    if (cashCount >= 5 && voidCount >= 5 && ratioVoid >= 10) flags.push('canal_efectivo_con_voids');
    if (cashRiskCount >= 1) flags.push('senal_efectivo_riesgo');
    if (cashRiskCount >= 3) flags.push('senal_efectivo_riesgo_alta');
    if (outliers.length) flags.push('cajero_outlier_voids');
    if (labMaskActiveFlag()) flags.push('lab_mask_activa');
    if (!totalCount && !voidCount) flags.push('sin_datos');

    return {
      ok: true,
      v: 1,
      kind: 'behavior_audit',
      from: from,
      toExclusive: toEx,
      label: opts.label || 'custom',
      userFilter: userFilter || null,
      labMaskActive: labMaskActiveFlag(),
      generatedAt: new Date().toISOString(),
      totals: {
        totalSales: Math.round(totalSales),
        totalCount: totalCount,
        ticketAvg: totalCount ? Math.round(totalSales / totalCount) : 0,
        cashSales: Math.round(cashSales),
        cashCount: cashCount,
        voidCount: voidCount,
        ratioVoidPct: ratioVoid,
        voidLateCount: voidLate,
        cashRiskCount: cashRiskCount,
      },
      voidByType: voidByType,
      outliers: outliers,
      flags: flags,
      byHourTop: Object.keys(byHour)
        .map(function (h) {
          return {
            hour: Number(h),
            sales: Math.round(byHour[h].sales),
            voids: byHour[h].voids,
          };
        })
        .filter(function (x) {
          return x.sales > 0 || x.voids > 0;
        })
        .sort(function (a, b) {
          return b.voids - a.voids || b.sales - a.sales;
        })
        .slice(0, 8),
    };
  }

  async function requestBehaviorInsight(opts) {
    opts = opts || {};
    if (!canAdminAiAudit()) return { ok: false, error: 'forbidden' };
    var rate = peekBehaviorRateLimit();
    if (!rate.ok) {
      return {
        ok: false,
        error: 'rate_limited',
        detail:
          'Máx. ' +
          BEHAVIOR_MAX_PER_HOUR +
          '/h (solo éxitos). Reintente en ~' +
          rate.retryInMin +
          ' min. Consola: crozzoAiClearBehaviorRate()',
      };
    }
    var pack = buildBehaviorPack(opts);
    if (!pack.ok) return pack;
    if (pack.flags && pack.flags.indexOf('sin_datos') >= 0) {
      commitBehaviorRateSuccess();
      return {
        ok: true,
        insight: {
          at: new Date().toISOString(),
          range: pack.label,
          text:
            'Sin ventas ni voids en el rango ' +
            pack.from +
            ' → ' +
            pack.toExclusive +
            '. No hay base para auditoría. Genere movimiento de prueba o amplíe el rango.',
          packSummary: pack.totals,
          source: 'local_empty',
        },
        pack: pack,
      };
    }
    setAiBusy(true);
    setProbeSession({
      busy: true,
      msgErr: false,
      msg: 'Auditoría IA: empaquetando ventas y voids…',
      outHidden: false,
      out: '1/3 Empaquetando…',
    });
    var system =
      'Eres auditor operativo de un restaurante/café en Colombia (contraespionaje de caja). ' +
      'Recibes SOLO métricas agregadas. NO inventes números. Español CO. ' +
      'Estructura: 1) diagnóstico breve 2) hasta 3 hallazgos con cifras del JSON 3) 3 preguntas al encargado. ' +
      'Nunca digas "es ladrón" ni afirmes delito; habla de patrones a revisar. ' +
      'Si flags incluye lab_mask_activa, menciona que hubo máscara Lab y que los datos deben ser verdad fiscal.';
    setProbeSession({
      busy: true,
      msg: 'Auditoría IA: enviando a NVIDIA (hasta ~2 min)…',
      out: '2/3 Enviando a NVIDIA…',
    });
    var r;
    try {
      r = await chatNvidia('Audita este pack JSON:\n' + JSON.stringify(pack), {
        system: system,
        maxTokens: 900,
      });
    } catch (eChat) {
      setAiBusy(false);
      var failDetail = String((eChat && (eChat.message || eChat)) || eChat);
      setProbeSession({
        busy: false,
        msgErr: true,
        msg: 'Auditoría fallida (excepción)',
        out: 'ERROR: ' + failDetail,
      });
      return { ok: false, error: 'nvidia_exception', detail: failDetail };
    }
    setAiBusy(false);
    if (!r || !r.ok) {
      setProbeSession({
        busy: false,
        msgErr: true,
        msg: 'Auditoría fallida: ' + ((r && r.error) || 'error'),
        out: 'ERROR: ' + ((r && (r.detail || r.error)) || 'sin detalle'),
      });
      return r || { ok: false, error: 'nvidia_empty' };
    }
    commitBehaviorRateSuccess();
    var rec = {
      at: new Date().toISOString(),
      range: pack.label + ' ' + pack.from + '…' + pack.toExclusive,
      text: r.text,
      source: r.via || 'tauri',
      packSummary: pack.totals,
      flags: pack.flags,
    };
    try {
      localStorage.setItem(LS_BEHAVIOR, JSON.stringify(rec));
    } catch (_) {}
    setProbeSession({
      busy: false,
      msgErr: false,
      msg: 'Auditoría lista.',
      out: rec.text,
    });
    return { ok: true, insight: rec, pack: pack, rate: peekBehaviorRateLimit() };
  }

  function ymdInputValue(ymdStr) {
    return String(ymdStr || '').slice(0, 10);
  }

  function moneyCo(n) {
    try {
      return '$' + Math.round(Number(n) || 0).toLocaleString('es-CO');
    } catch (_) {
      return '$' + String(Math.round(Number(n) || 0));
    }
  }

  var FLAG_LABELS = {
    ratio_void_alto: 'Ratio void alto',
    voids_tarde_turno: 'Voids tarde de turno',
    canal_efectivo_con_voids: 'Efectivo + voids',
    senal_efectivo_riesgo: 'Señal efectivo',
    senal_efectivo_riesgo_alta: 'Riesgo efectivo alto',
    cajero_outlier_voids: 'Cajero outlier',
    lab_mask_activa: 'Máscara Lab activa',
    sin_datos: 'Sin datos en rango',
  };

  function renderPackMetricsHtml(pack) {
    if (!pack || !pack.ok) return '';
    var t = pack.totals || {};
    var flags = Array.isArray(pack.flags) ? pack.flags : [];
    var voidBits = Object.keys(pack.voidByType || {})
      .map(function (k) {
        return esc(k) + '×' + pack.voidByType[k];
      })
      .slice(0, 6)
      .join(' · ');
    var flagHtml = flags.length
      ? flags
          .map(function (f) {
            var danger =
              f.indexOf('riesgo') >= 0 || f === 'ratio_void_alto' || f === 'lab_mask_activa'
                ? ' crozzo-ai-audit__flag--warn'
                : '';
            return (
              '<span class="crozzo-ai-audit__flag' +
              danger +
              '">' +
              esc(FLAG_LABELS[f] || f) +
              '</span>'
            );
          })
          .join('')
      : '<span class="crozzo-ai-audit__flag crozzo-ai-audit__flag--ok">Sin banderas fuertes</span>';
    return (
      '<div class="crozzo-ai-audit__metrics" id="crozzoAiAuditMetrics">' +
      '<div class="crozzo-ai-audit__metric"><span class="crozzo-ai-audit__metric-k">Ventas</span><span class="crozzo-ai-audit__metric-v">' +
      esc(moneyCo(t.totalSales)) +
      '</span><span class="crozzo-ai-audit__metric-s">' +
      esc(String(t.totalCount || 0)) +
      ' tickets</span></div>' +
      '<div class="crozzo-ai-audit__metric"><span class="crozzo-ai-audit__metric-k">Efectivo</span><span class="crozzo-ai-audit__metric-v">' +
      esc(moneyCo(t.cashSales)) +
      '</span><span class="crozzo-ai-audit__metric-s">' +
      esc(String(t.cashCount || 0)) +
      ' tickets</span></div>' +
      '<div class="crozzo-ai-audit__metric"><span class="crozzo-ai-audit__metric-k">Voids</span><span class="crozzo-ai-audit__metric-v">' +
      esc(String(t.voidCount || 0)) +
      '</span><span class="crozzo-ai-audit__metric-s">' +
      esc(String(t.ratioVoidPct || 0)) +
      '% · tarde ' +
      esc(String(t.voidLateCount || 0)) +
      '</span></div>' +
      '<div class="crozzo-ai-audit__metric"><span class="crozzo-ai-audit__metric-k">Riesgo caja</span><span class="crozzo-ai-audit__metric-v">' +
      esc(String(t.cashRiskCount || 0)) +
      '</span><span class="crozzo-ai-audit__metric-s">cobro abortado / logout</span></div>' +
      '</div>' +
      '<div class="crozzo-ai-audit__flags" id="crozzoAiAuditFlags">' +
      flagHtml +
      '</div>' +
      (voidBits
        ? '<p class="crozzo-ai-audit__void-mix form-hint" id="crozzoAiAuditVoidMix">Tipos: ' +
          voidBits +
          '</p>'
        : '<p class="crozzo-ai-audit__void-mix form-hint" id="crozzoAiAuditVoidMix" hidden></p>')
    );
  }

  function renderAuditCardHtml(opts) {
    opts = opts || {};
    if (!canSeeAuditUi()) return '';
    var surface = opts.surface === 'reportes' ? 'reportes' : 'cierre';
    if (!isEnabled()) {
      return (
        '<section class="crozzo-ai-audit crozzo-ai-audit--gated" id="crozzoAiAuditCard" data-crozzo-ai-audit="1" data-surface="' +
        esc(surface) +
        '">' +
        '<div class="crozzo-cierre-section-head">' +
        '<div><h3>Auditoría con IA</h3><p>Contraespionaje de caja — voids, efectivo y outliers</p></div>' +
        '<span class="crozzo-ai-audit__badge">Apagado</span></div>' +
        '<p class="form-hint">Active <strong>Reporte IA</strong> en Super Admin → Nube y guarde la key NVIDIA en este PC. Luego vuelva aquí.</p>' +
        '<button type="button" class="btn btn-outline btn-sm" id="crozzoAiAuditOpenCfg">Abrir configuración IA</button>' +
        '</section>'
      );
    }
    var preset = resolvePresetRange('today');
    var last = null;
    try {
      last = JSON.parse(localStorage.getItem(LS_BEHAVIOR) || 'null');
    } catch (_) {}
    var lastMetrics =
      last && last.packSummary
        ? { ok: true, totals: last.packSummary, flags: last.flags || [], voidByType: {} }
        : null;
    var lastText = last && last.text ? esc(last.text) : '';
    return (
      '<section class="crozzo-ai-audit" id="crozzoAiAuditCard" data-crozzo-ai-audit="1" data-surface="' +
      esc(surface) +
      '">' +
      '<div class="crozzo-cierre-section-head">' +
      '<div><h3>Auditoría con IA</h3><p>Vista previa local al instante · narrativa NVIDIA opcional (~1–2 min)</p></div>' +
      '<span class="crozzo-ai-audit__badge crozzo-ai-audit__badge--on">Listo</span></div>' +
      '<div class="crozzo-ai-audit__presets" role="toolbar" aria-label="Rango de auditoría">' +
      '<button type="button" class="crozzo-ai-audit__preset is-active" data-audit-mode="today">Hoy</button>' +
      '<button type="button" class="crozzo-ai-audit__preset" data-audit-mode="8d">8 días</button>' +
      '<button type="button" class="crozzo-ai-audit__preset" data-audit-mode="month">Mes</button>' +
      '<button type="button" class="crozzo-ai-audit__preset" data-audit-mode="custom">Personalizado</button>' +
      '</div>' +
      '<input type="hidden" id="crozzoAiAuditMode" value="today" />' +
      '<div class="crozzo-ai-audit__dates">' +
      '<div class="form-group crozzo-ai-audit__date"><label class="form-label" for="crozzoAiAuditFrom">Desde</label>' +
      '<input type="date" id="crozzoAiAuditFrom" class="form-control" value="' +
      esc(ymdInputValue(preset.from)) +
      '" disabled /></div>' +
      '<div class="form-group crozzo-ai-audit__date"><label class="form-label" for="crozzoAiAuditTo">Hasta</label>' +
      '<input type="date" id="crozzoAiAuditTo" class="form-control" value="' +
      esc(ymdInputValue(addDays(preset.toExclusive, -1))) +
      '" disabled /></div>' +
      '<div class="form-group crozzo-ai-audit__user"><label class="form-label" for="crozzoAiAuditUser">Cajero (opcional)</label>' +
      '<input type="text" id="crozzoAiAuditUser" class="form-control" placeholder="Todos · id o nombre" autocomplete="off" /></div>' +
      '</div>' +
      '<div class="crozzo-ai-audit__actions">' +
      '<button type="button" class="btn btn-outline" id="crozzoAiAuditPreview">Vista previa</button>' +
      '<button type="button" class="btn btn-primary" id="crozzoAiAuditRun">Auditar con IA</button>' +
      '<button type="button" class="btn btn-outline" id="crozzoAiAuditCopy">Copiar</button></div>' +
      '<p class="crozzo-ai-audit__status form-hint" id="crozzoAiAuditStatus">Elija rango → Vista previa (números) o Auditar con IA (texto).</p>' +
      '<ol class="crozzo-ai-audit__steps" id="crozzoAiAuditLoadSteps" hidden>' +
      '<li data-step="1">Empaquetando ventas y voids…</li>' +
      '<li data-step="2">Enviando a NVIDIA…</li>' +
      '<li data-step="3">Redactando hallazgos…</li></ol>' +
      '<div class="crozzo-ai-audit__summary" id="crozzoAiAuditSummary">' +
      (lastMetrics ? renderPackMetricsHtml(lastMetrics) : '') +
      '</div>' +
      '<div class="crozzo-ai-audit__out-wrap" id="crozzoAiAuditOutWrap"' +
      (lastText ? '' : ' hidden') +
      '>' +
      '<div class="crozzo-ai-audit__out-label">Lectura IA</div>' +
      '<pre class="crozzo-ai-audit__out" id="crozzoAiAuditOut">' +
      lastText +
      '</pre></div>' +
      '</section>'
    );
  }

  function bindAuditCard(root) {
    root = root || document.getElementById('crozzoAiAuditCard');
    if (!root || root.__crozzoAiAuditBound) return;
    if (!canSeeAuditUi()) return;
    root.__crozzoAiAuditBound = true;

    var openCfg = root.querySelector('#crozzoAiAuditOpenCfg');
    if (openCfg && !openCfg.__crozzoBound) {
      openCfg.__crozzoBound = true;
      openCfg.addEventListener('click', function () {
        if (typeof global.crozzoOpenAiInsightsConfig === 'function') global.crozzoOpenAiInsightsConfig();
        else if (typeof showToast === 'function') showToast('Vaya a Super Admin → Nube → Inteligencia', 'info');
      });
    }
    if (root.classList.contains('crozzo-ai-audit--gated')) return;

    function q(sel) {
      return root.querySelector(sel);
    }
    function status(msg, err) {
      var el = q('#crozzoAiAuditStatus');
      if (!el) return;
      el.textContent = msg || '';
      el.classList.toggle('is-error', !!err);
    }
    function setLoadStep(n) {
      var ol = q('#crozzoAiAuditLoadSteps');
      if (!ol) return;
      ol.hidden = !n;
      ol.querySelectorAll('[data-step]').forEach(function (li) {
        var s = Number(li.getAttribute('data-step'));
        li.classList.toggle('is-active', s === n);
        li.classList.toggle('is-done', n && s < n);
      });
    }
    function setDatesEditable(custom) {
      var fromEl = q('#crozzoAiAuditFrom');
      var toEl = q('#crozzoAiAuditTo');
      if (fromEl) fromEl.disabled = !custom;
      if (toEl) toEl.disabled = !custom;
    }
    function applyPresetDates(mode) {
      mode = mode || (q('#crozzoAiAuditMode') || {}).value || 'today';
      var modeEl = q('#crozzoAiAuditMode');
      if (modeEl) modeEl.value = mode;
      root.querySelectorAll('[data-audit-mode]').forEach(function (btn) {
        btn.classList.toggle('is-active', btn.getAttribute('data-audit-mode') === mode);
      });
      if (mode === 'custom') {
        setDatesEditable(true);
        return;
      }
      var p = resolvePresetRange(mode);
      var fromEl = q('#crozzoAiAuditFrom');
      var toEl = q('#crozzoAiAuditTo');
      if (fromEl) fromEl.value = ymdInputValue(p.from);
      if (toEl) toEl.value = ymdInputValue(addDays(p.toExclusive, -1));
      setDatesEditable(false);
    }
    function readRange() {
      var mode = (q('#crozzoAiAuditMode') || {}).value || 'today';
      var from = String((q('#crozzoAiAuditFrom') || {}).value || '').slice(0, 10);
      var toInc = String((q('#crozzoAiAuditTo') || {}).value || '').slice(0, 10);
      var userId = String((q('#crozzoAiAuditUser') || {}).value || '').trim();
      return { mode: mode, from: from, toInc: toInc, userId: userId };
    }
    function paintPack(pack) {
      var sum = q('#crozzoAiAuditSummary');
      if (sum) sum.innerHTML = renderPackMetricsHtml(pack);
    }
    function paintInsight(text) {
      var wrap = q('#crozzoAiAuditOutWrap');
      var out = q('#crozzoAiAuditOut');
      if (out) out.textContent = text || '';
      if (wrap) wrap.hidden = !text;
    }

    root.querySelectorAll('[data-audit-mode]').forEach(function (btn) {
      if (btn.__crozzoBound) return;
      btn.__crozzoBound = true;
      btn.addEventListener('click', function () {
        applyPresetDates(btn.getAttribute('data-audit-mode'));
      });
    });
    applyPresetDates('today');

    var previewBtn = q('#crozzoAiAuditPreview');
    if (previewBtn && !previewBtn.__crozzoBound) {
      previewBtn.__crozzoBound = true;
      previewBtn.addEventListener('click', function () {
        var r = readRange();
        if (!r.from || !r.toInc) {
          status('Indique fechas Desde y Hasta.', true);
          return;
        }
        var pack = buildBehaviorPack({
          fromYmd: r.from,
          toYmdExclusive: addDays(r.toInc, 1),
          label: r.mode,
          userId: r.userId || undefined,
        });
        if (!pack.ok) {
          status(pack.error || 'No se pudo armar el pack', true);
          return;
        }
        paintPack(pack);
        status(
          'Vista previa · ' +
            pack.from +
            ' → ' +
            pack.toExclusive +
            ' · ' +
            (pack.totals.voidCount || 0) +
            ' voids · ' +
            (pack.flags || []).length +
            ' banderas'
        );
        if (typeof showToast === 'function') showToast('Vista previa lista (sin NVIDIA)', 'success');
      });
    }

    var runBtn = q('#crozzoAiAuditRun');
    if (runBtn && !runBtn.__crozzoBound) {
      runBtn.__crozzoBound = true;
      runBtn.addEventListener('click', function () {
        if (runBtn.disabled || root.__crozzoAiAuditInflight) return;
        if (!canAdminAiAudit()) {
          status('Reporte IA no está habilitado.', true);
          return;
        }
        var r = readRange();
        if (!r.from || !r.toInc) {
          status('Indique fechas Desde y Hasta.', true);
          return;
        }
        var peek = peekBehaviorRateLimit();
        if (!peek.ok) {
          setLoadStep(0);
          status(peek.retryInMin ? 'Máx. ' + BEHAVIOR_MAX_PER_HOUR + '/h. Reintente en ~' + peek.retryInMin + ' min.' : 'Cuota IA agotada.', true);
          paintInsight(
            'ERROR: cuota agotada. Solo cuentan auditorías exitosas. Consola: crozzoAiClearBehaviorRate()'
          );
          return;
        }
        var gen = (root.__crozzoAiAuditGen = (root.__crozzoAiAuditGen || 0) + 1);
        root.__crozzoAiAuditInflight = true;
        runBtn.disabled = true;
        if (previewBtn) previewBtn.disabled = true;
        setLoadStep(1);
        status('Generando auditoría… espere hasta ~2 min (queda ' + peek.remaining + '/' + BEHAVIOR_MAX_PER_HOUR + ').');
        paintInsight('1/3 Empaquetando ventas y voids…');
        var step2Timer = setTimeout(function () {
          if (root.__crozzoAiAuditGen !== gen || !root.__crozzoAiAuditInflight) return;
          setLoadStep(2);
          paintInsight('2/3 Enviando a NVIDIA…');
        }, 200);
        var step3Timer = setTimeout(function () {
          if (root.__crozzoAiAuditGen !== gen || !root.__crozzoAiAuditInflight) return;
          setLoadStep(3);
          paintInsight('3/3 Redactando hallazgos… (NVIDIA puede tardar 1–2 min)');
          status('NVIDIA redactando… no pulse de nuevo.');
        }, 1200);
        requestBehaviorInsight({
          fromYmd: r.from,
          toYmdExclusive: addDays(r.toInc, 1),
          label: r.mode,
          userId: r.userId || undefined,
        })
          .then(function (res) {
            clearTimeout(step2Timer);
            clearTimeout(step3Timer);
            if (root.__crozzoAiAuditGen !== gen) return;
            root.__crozzoAiAuditInflight = false;
            runBtn.disabled = false;
            if (previewBtn) previewBtn.disabled = false;
            if (!res.ok) {
              setLoadStep(0);
              status(res.detail || res.error || 'falló', true);
              paintInsight('ERROR: ' + (res.detail || res.error || ''));
              if (typeof showToast === 'function') showToast(res.detail || res.error || 'Auditoría falló', 'error');
              return;
            }
            setLoadStep(3);
            if (res.pack) paintPack(res.pack);
            paintInsight(res.insight && res.insight.text);
            setTimeout(function () {
              if (root.__crozzoAiAuditGen === gen) setLoadStep(0);
            }, 500);
            var left = peekBehaviorRateLimit();
            status(
              'Listo · ' +
                ((res.insight && res.insight.range) || '') +
                (left && left.remaining != null ? ' · quedan ' + left.remaining + '/' + BEHAVIOR_MAX_PER_HOUR : '')
            );
            if (typeof showToast === 'function') showToast('Auditoría IA lista', 'success');
          })
          .catch(function (e) {
            clearTimeout(step2Timer);
            clearTimeout(step3Timer);
            if (root.__crozzoAiAuditGen !== gen) return;
            root.__crozzoAiAuditInflight = false;
            runBtn.disabled = false;
            if (previewBtn) previewBtn.disabled = false;
            setLoadStep(0);
            var msg = String(e && e.message ? e.message : e);
            status(msg, true);
            paintInsight('ERROR: ' + msg);
          });
      });
    }

    var copyBtn = q('#crozzoAiAuditCopy');
    if (copyBtn && !copyBtn.__crozzoBound) {
      copyBtn.__crozzoBound = true;
      copyBtn.addEventListener('click', function () {
        var out = q('#crozzoAiAuditOut');
        var t = out ? out.textContent : '';
        if (!t || (q('#crozzoAiAuditOutWrap') || {}).hidden) {
          status('No hay texto IA para copiar. Genere auditoría o use Vista previa para números.', true);
          return;
        }
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(t);
            status('Texto IA copiado.');
            if (typeof showToast === 'function') showToast('Copiado', 'success');
          }
        } catch (_) {
          status('No se pudo copiar.', true);
        }
      });
    }
  }

  function saveLastInsight(rec) {
    try {
      localStorage.setItem(LS_INSIGHT, JSON.stringify(rec));
    } catch (_) {}
  }

  function getLastInsight() {
    try {
      var j = JSON.parse(localStorage.getItem(LS_INSIGHT) || 'null');
      return j && typeof j === 'object' ? j : null;
    } catch (_) {
      return null;
    }
  }

  function cacheKeyStatus(st) {
    try {
      localStorage.setItem(LS_KEY_STATUS, JSON.stringify(st || {}));
    } catch (_) {}
  }

  function readKeyStatusCache() {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY_STATUS) || 'null') || {};
    } catch (_) {
      return {};
    }
  }

  function readLocalKey() {
    try {
      return String(localStorage.getItem(LS_LOCAL_KEY) || '').trim();
    } catch (_) {
      return '';
    }
  }

  function writeLocalKey(key) {
    try {
      if (key) localStorage.setItem(LS_LOCAL_KEY, String(key));
      else localStorage.removeItem(LS_LOCAL_KEY);
    } catch (_) {}
  }

  function edgeDownUntil() {
    try {
      return Number(localStorage.getItem(LS_EDGE_DOWN) || 0) || 0;
    } catch (_) {
      return 0;
    }
  }

  function markEdgeDown() {
    try {
      localStorage.setItem(LS_EDGE_DOWN, String(Date.now() + EDGE_COOLDOWN_MS));
    } catch (_) {}
  }

  function clearEdgeDown() {
    try {
      localStorage.removeItem(LS_EDGE_DOWN);
    } catch (_) {}
  }

  function isEdgeCooling() {
    return Date.now() < edgeDownUntil();
  }

  async function invokeFn(body, opts) {
    opts = opts || {};
    if (!opts.force && isEdgeCooling()) {
      return { ok: false, error: 'edge_unavailable', skipped: true };
    }
    var c = sbCreds();
    var url = functionUrl();
    if (!c || !url) {
      return { ok: false, error: 'supabase_not_configured' };
    }
    var payload = Object.assign({ businessId: businessId() }, body || {});
    var res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: c.key,
          Authorization: 'Bearer ' + c.key,
        },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      markEdgeDown();
      return {
        ok: false,
        error: 'edge_unavailable',
        detail: String((e && e.message) || e || 'fetch_failed'),
      };
    }
    var data = null;
    try {
      data = await res.json();
    } catch (_) {
      data = null;
    }
    if (!res.ok) {
      if (res.status === 404 || res.status === 546 || res.status === 502 || res.status === 503) {
        markEdgeDown();
      }
      return {
        ok: false,
        error: (data && (data.error || data.message)) || 'http_' + res.status,
        status: res.status,
        data: data,
      };
    }
    clearEdgeDown();
    return { ok: true, data: data || {} };
  }

  async function fetchKeyStatus(opts) {
    opts = opts || {};
    var local = readLocalKey();
    if (local && local.indexOf('nvapi-') === 0) {
      var stLocal = { configured: true, last4: local.slice(-4), at: Date.now(), source: 'local' };
      cacheKeyStatus(stLocal);
      /* Con key local y Edge caída: no spamear CORS */
      if (isEdgeCooling() && !opts.force) {
        return { ok: true, configured: true, last4: stLocal.last4, source: 'local', edge: 'skipped' };
      }
    }
    var r = await invokeFn({ action: 'status' }, { force: !!opts.force });
    if (!r.ok) {
      var cached = readKeyStatusCache();
      var configured = !!(cached.configured || (local && local.indexOf('nvapi-') === 0));
      return {
        ok: configured,
        configured: configured,
        last4: cached.last4 || (local ? local.slice(-4) : ''),
        source: cached.source || (local ? 'local' : 'none'),
        error: r.error,
        edge: r.skipped ? 'skipped' : 'down',
      };
    }
    var st = {
      configured: !!(r.data && r.data.configured) || !!(local && local.indexOf('nvapi-') === 0),
      last4: String((r.data && r.data.last4) || (local ? local.slice(-4) : '')),
      at: Date.now(),
      source: r.data && r.data.configured ? 'cloud' : local ? 'local' : 'none',
    };
    cacheKeyStatus(st);
    return { ok: true, configured: st.configured, last4: st.last4, source: st.source };
  }

  function isLikelyPlaceholderKey(k) {
    var s = String(k || '').trim().toLowerCase();
    if (!s) return true;
    if (s === 'nvapi-pegue-aqui' || s === 'nvapi-…' || s === 'nvapi-...') return true;
    if (s.indexOf('pegue') >= 0 || s.indexOf('paste') >= 0 || s.indexOf('aqui') >= 0) return true;
    /* Key real de NVIDIA suele ser bastante larga */
    if (s.indexOf('nvapi-') === 0 && s.length < 24) return true;
    return false;
  }

  /** Estado de probe fuera del DOM: si Nube remonta mid-flight, el resultado no se pierde. */
  var _probeSession = {
    busy: false,
    msg: '',
    msgErr: false,
    out: '',
    outHidden: true,
  };

  function formHasDraft() {
    if (_probeSession.busy || global.__crozzoAiInsightsLock) return true;
    try {
      var keyEl = document.getElementById('crozzoAiApiKey');
      var qEl = document.getElementById('crozzoAiProbeQ');
      if (keyEl && String(keyEl.value || '').trim()) return true;
      if (qEl && (qEl.dataset.crozzoDirty === '1' || String(qEl.value || '').trim())) return true;
      var root = document.getElementById('crozzoAiInsightsAdmin');
      if (root && (root.dataset.crozzoAiBusy === '1' || root.getAttribute('data-crozzo-ai-busy') === '1')) {
        return true;
      }
    } catch (_) {}
    return false;
  }

  function setAiBusy(on) {
    _probeSession.busy = !!on;
    try {
      global.__crozzoAiInsightsLock = !!on;
    } catch (_) {}
    try {
      var root = document.getElementById('crozzoAiInsightsAdmin');
      if (!root) return;
      if (on) root.setAttribute('data-crozzo-ai-busy', '1');
      else root.removeAttribute('data-crozzo-ai-busy');
      root.dataset.crozzoAiBusy = on ? '1' : '0';
    } catch (_) {}
  }

  function applyProbeSessionToDom() {
    try {
      var msgEl = document.getElementById('crozzoAiAdminMsg');
      if (msgEl && _probeSession.msg) {
        msgEl.textContent = _probeSession.msg;
        msgEl.style.color = _probeSession.msgErr
          ? 'var(--danger, #b91c1c)'
          : 'var(--text-secondary)';
      }
      var out = document.getElementById('crozzoAiProbeOut');
      if (out && (_probeSession.out || _probeSession.busy)) {
        out.hidden = !!_probeSession.outHidden && !_probeSession.busy;
        if (_probeSession.out) out.textContent = _probeSession.out;
      }
      var probeBtn = document.getElementById('crozzoAiBtnProbe');
      if (probeBtn) probeBtn.disabled = !!_probeSession.busy;
      var local = readLocalKey();
      if (local && local.indexOf('nvapi-') === 0) {
        var last4 = local.slice(-4);
        var hint = document.getElementById('crozzoAiKeyHint');
        if (hint) hint.textContent = 'Key lista · ••••' + last4 + ' (este PC Super Admin)';
        var ban = document.getElementById('crozzoAiKeySavedBanner');
        if (ban) {
          ban.textContent =
            '✓ Key guardada en este PC · ••••' + last4 + ' — ya puede pulsar «3. Probar conexión»';
          ban.style.color = 'var(--success, #15803d)';
        }
      }
      setAiBusy(_probeSession.busy);
    } catch (_) {}
  }

  function setProbeSession(patch) {
    Object.assign(_probeSession, patch || {});
    applyProbeSessionToDom();
  }

  function pushKeyToEdgeBackground(key) {
    if (isEdgeCooling()) return;
    var timed = Promise.race([
      invokeFn({ action: 'save_key', apiKey: key }, { force: false }),
      new Promise(function (resolve) {
        setTimeout(function () {
          resolve({ ok: false, error: 'edge_timeout', skipped: true });
        }, 3000);
      }),
    ]);
    timed
      .then(function (r) {
        if (r && r.ok) {
          cacheKeyStatus({ configured: true, last4: key.slice(-4), at: Date.now(), source: 'cloud' });
        } else if (r && !r.skipped) {
          markEdgeDown();
        }
      })
      .catch(function () {
        markEdgeDown();
      });
  }

  /**
   * Local-first: persiste en este PC al instante. Edge es best-effort en background
   * (no bloquea UI ni hace await CORS cuando la función no está desplegada).
   */
  async function saveApiKey(apiKey) {
    var key = String(apiKey || '').trim();
    if (!key || key.indexOf('nvapi-') !== 0) {
      return { ok: false, error: 'invalid_key' };
    }
    if (isLikelyPlaceholderKey(key)) {
      return { ok: false, error: 'placeholder_key' };
    }
    writeLocalKey(key);
    cacheKeyStatus({ configured: true, last4: key.slice(-4), at: Date.now(), source: 'local' });
    var confirmed = readLocalKey() === key;
    if (!confirmed) {
      return { ok: false, error: 'local_persist_failed' };
    }
    pushKeyToEdgeBackground(key);
    return { ok: true, last4: key.slice(-4), source: 'local' };
  }

  function tauriInvoke(cmd, args) {
    try {
      if (global.__TAURI__ && global.__TAURI__.core && typeof global.__TAURI__.core.invoke === 'function') {
        return global.__TAURI__.core.invoke(cmd, args || {});
      }
    } catch (_) {}
    return Promise.reject(new Error('tauri_unavailable'));
  }

  async function chatNvidia(userText, opts) {
    opts = opts || {};
    var key = readLocalKey();
    var typed = String(opts.apiKey || '').trim();
    if (typed && isLikelyPlaceholderKey(typed)) {
      return { ok: false, error: 'placeholder_key' };
    }
    if (typed && typed.indexOf('nvapi-') === 0) key = typed;
    if (!key || key.indexOf('nvapi-') !== 0) {
      return { ok: false, error: 'key_not_configured' };
    }
    if (isLikelyPlaceholderKey(key)) {
      return { ok: false, error: 'placeholder_key' };
    }
    /* Si pegó key en el input y aún no estaba guardada, persistir local */
    if (typed && typed.indexOf('nvapi-') === 0 && typed !== readLocalKey()) {
      writeLocalKey(typed);
      cacheKeyStatus({ configured: true, last4: typed.slice(-4), at: Date.now(), source: 'local' });
    }
    var system =
      opts.system ||
      'Eres un asistente de prueba de Crozzo POS. Responde en español colombiano, breve y claro.';
    var model = opts.model || readCfg().model || DEFAULT_MODEL;
    var payload = {
      model: model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: String(userText || '') },
      ],
      temperature: 0.2,
      max_tokens: opts.maxTokens || 220,
    };
    var bodyJson = JSON.stringify(payload);

    /* Preferir Rust (sin CORS). El fetch del WebView a NVIDIA siempre falla CORS. */
    try {
      var rust = await tauriInvoke('crozzo_nvidia_chat', { apiKey: key, bodyJson: bodyJson });
      var nv = null;
      try {
        nv = typeof rust.body === 'string' ? JSON.parse(rust.body) : rust.body;
      } catch (_) {
        nv = null;
      }
      var text = String(
        (nv && nv.choices && nv.choices[0] && nv.choices[0].message && nv.choices[0].message.content) || ''
      ).trim();
      if (!text) return { ok: false, error: 'empty_insight', detail: String((rust && rust.body) || '').slice(0, 200) };
      return { ok: true, text: text, model: model, via: 'tauri' };
    } catch (eRust) {
      var detail = String((eRust && (eRust.message || eRust)) || eRust);
      /* Si el comando no existe aún (Tauri sin rebuild), mensaje claro */
      if (/tauri_unavailable|not allowed|unknown command|crozzo_nvidia_chat/i.test(detail)) {
        return {
          ok: false,
          error: 'needs_tauri_rebuild',
          detail:
            'Reinicie Tauri (cargo rebuild) para el comando crozzo_nvidia_chat. El navegador no puede llamar a NVIDIA por CORS.',
        };
      }
      return { ok: false, error: 'nvidia_network', detail: detail };
    }
  }

  /**
   * Pregunta de control: exige token CROZZO_OK + una frase útil.
   * Sirve para rectificar que NVIDIA contesta con la key actual.
   */
  async function probeConnection(opts) {
    opts = opts || {};
    var q =
      String(opts.question || '').trim() ||
      'Responde exactamente empezando con la palabra CROZZO_OK (en mayúsculas). ' +
        'Luego, en una sola frase, di qué es un momento de alto flujo (pico) en un restaurante.';
    var r = await chatNvidia(q, {
      apiKey: opts.apiKey,
      system:
        'Prueba de conectividad Crozzo. Debes empezar tu respuesta con CROZZO_OK y luego una frase corta en español.',
      maxTokens: 120,
    });
    if (!r.ok) return r;
    var text = r.text;
    var pass = /\bCROZZO_OK\b/i.test(text) && text.length > 12;
    return {
      ok: true,
      pass: pass,
      text: text,
      model: r.model,
      via: r.via || 'tauri',
      question: q,
      verdict: pass
        ? 'OK — NVIDIA respondió con el token de control.'
        : 'Parcial — hubo respuesta, pero no trae CROZZO_OK. Revise el modelo o el prompt.',
    };
  }

  async function generateLocal(pack, model) {
    var r = await chatNvidia('Genera la lectura. JSON:\n' + JSON.stringify(pack), {
      model: model,
      system:
        'Eres analista operativo de un restaurante/café en Colombia. ' +
        'Recibes SOLO métricas agregadas. NO inventes números. Español CO. ' +
        'Estructura: diagnóstico, picos/valles, vs periodo anterior, 3 acciones. Máx ~350 palabras.',
      maxTokens: 900,
    });
    if (!r.ok) return r;
    return { ok: true, text: r.text };
  }

  async function requestInsight(opts) {
    opts = opts || {};
    if (!isEnabled()) return { ok: false, error: 'disabled' };
    var range = opts.range === 'month' ? 'month' : '8d';
    var pack = buildPeriodPack(range);
    var text = '';
    var usedLocal = false;

    if (!isEdgeCooling()) {
      var r = await invokeFn({
        action: 'generate',
        range: range,
        pack: pack,
        model: readCfg().model,
      });
      if (r.ok) {
        text = String((r.data && (r.data.text || r.data.insight)) || '').trim();
      }
    }

    if (!text) {
      var loc = await generateLocal(pack, readCfg().model);
      if (!loc.ok) return loc;
      text = loc.text;
      usedLocal = true;
    }

    if (!text) return { ok: false, error: 'empty_insight' };
    var rec = {
      at: new Date().toISOString(),
      range: range,
      text: text,
      source: usedLocal ? 'local' : 'cloud',
      packSummary: {
        from: pack.current.from,
        toExclusive: pack.current.toExclusive,
        totalSales: pack.current.totalSales,
        totalCount: pack.current.totalCount,
      },
    };
    saveLastInsight(rec);
    return { ok: true, insight: rec };
  }

  function renderComingSoonPanelHtml() {
    return (
      '<div class="crozzo-rep-panel" data-rep-panel="reporte-ia" style="display:none;">' +
      '<div class="crozzo-rep-coming-soon">' +
      '<span class="crozzo-rep-coming-soon__badge">Próxima versión</span>' +
      '<div class="crozzo-rep-coming-soon__icon" aria-hidden="true">✨</div>' +
      '<h3 class="crozzo-rep-coming-soon__title">Reporte IA</h3>' +
      '<p class="crozzo-rep-coming-soon__lead">Lectura inteligente del negocio — próximas versiones.</p>' +
      '<p class="form-hint crozzo-rep-coming-soon__hint">Cuando Super Admin habilite <strong>Reporte IA</strong> en Nube, aquí verá picos, momentos muertos y comparación con el periodo anterior.</p>' +
      '</div></div>'
    );
  }

  function renderActivePanelHtml() {
    var last = getLastInsight();
    var lastHtml = last
      ? '<div class="crozzo-ai-insight-last" id="crozzoAiInsightLast">' +
        '<div class="form-hint">Última lectura macro · ' +
        esc(last.range) +
        ' · ' +
        esc(String(last.at || '').slice(0, 16).replace('T', ' ')) +
        '</div>' +
        '<pre class="crozzo-ai-insight-text" id="crozzoAiInsightText">' +
        esc(last.text) +
        '</pre></div>'
      : '<div class="crozzo-ai-insight-last" id="crozzoAiInsightLast"><p class="form-hint" id="crozzoAiInsightText">Aún no hay lecturas macro. Use los botones o la auditoría con rango abajo.</p></div>';
    return (
      '<div class="crozzo-rep-panel" data-rep-panel="reporte-ia" style="display:none;">' +
      '<div class="crozzo-rep-dash-block">' +
      '<h3 class="crozzo-rep-dash-title">Reporte IA</h3>' +
      '<p class="form-hint">Macro de negocio (8d/mes) + auditoría de caja (voids/efectivo). Sin NIT ni CUFE.</p>' +
      '<p class="form-hint"><button type="button" class="btn btn-link btn-sm" onclick="typeof crozzoOpenAiInsightsConfig===\'function\'&&crozzoOpenAiInsightsConfig()">⚙ Configurar key NVIDIA (Super Admin → Nube)</button></p>' +
      '<div class="crozzo-rep-actions" style="margin:12px 0;">' +
      '<button type="button" class="btn btn-outline" id="crozzoAiBtn8d">Macro 8 días</button>' +
      '<button type="button" class="btn btn-outline" id="crozzoAiBtnMonth">Macro del mes</button>' +
      '<button type="button" class="btn btn-outline" id="crozzoAiBtnCopy">Copiar macro</button>' +
      '</div>' +
      '<p class="form-hint" id="crozzoAiInsightStatus"></p>' +
      lastHtml +
      (typeof renderAuditCardHtml === 'function' ? renderAuditCardHtml({ surface: 'reportes' }) : '') +
      '</div></div>'
    );
  }

  function renderReportPanelHtml() {
    return isEnabled() ? renderActivePanelHtml() : renderComingSoonPanelHtml();
  }

  function tabButtonHtml() {
    if (isEnabled()) {
      return '<button type="button" class="crozzo-rep-tab crozzo-rep-tab--adv" data-rep-tab="reporte-ia">✨ Reporte IA</button>';
    }
    return (
      '<button type="button" class="crozzo-rep-tab crozzo-rep-tab--adv" data-rep-tab="reporte-ia" title="Próxima versión">✨ Reporte IA</button>'
    );
  }

  function setStatus(msg, kind) {
    var el = document.getElementById('crozzoAiInsightStatus');
    if (!el) return;
    el.textContent = msg || '';
    el.style.color = kind === 'error' ? 'var(--danger, #b91c1c)' : 'var(--text-secondary)';
  }

  function bindReportPanel(root) {
    root = root || document.getElementById('crozzo-rep-root');
    if (!root || !isEnabled()) return;
    var btn8 = document.getElementById('crozzoAiBtn8d');
    var btnM = document.getElementById('crozzoAiBtnMonth');
    var btnC = document.getElementById('crozzoAiBtnCopy');
    function run(range) {
      setStatus('Generando lectura…', 'info');
      requestInsight({ range: range })
        .then(function (r) {
          if (!r.ok) {
            var map = {
              disabled: 'Reporte IA no está habilitado.',
              supabase_not_configured: 'Configure Supabase en Super Admin → Nube.',
              empty_insight: 'El modelo no devolvió texto.',
            };
            setStatus(map[r.error] || 'No se pudo generar: ' + (r.error || 'error'), 'error');
            if (typeof showToast === 'function') {
              showToast('Reporte IA: ' + (r.error || 'falló'), 'warning');
            }
            return;
          }
          var pre = document.getElementById('crozzoAiInsightText');
          if (pre) {
            if (pre.tagName === 'PRE') pre.textContent = r.insight.text;
            else pre.textContent = r.insight.text;
          }
          setStatus('Listo · ' + r.insight.range, 'info');
          if (typeof showToast === 'function') showToast('Lectura IA generada', 'success');
        })
        .catch(function (e) {
          setStatus('Error de red: ' + (e && e.message ? e.message : e), 'error');
        });
    }
    if (btn8 && !btn8.__crozzoAiBound) {
      btn8.__crozzoAiBound = true;
      btn8.addEventListener('click', function () {
        run('8d');
      });
    }
    if (btnM && !btnM.__crozzoAiBound) {
      btnM.__crozzoAiBound = true;
      btnM.addEventListener('click', function () {
        run('month');
      });
    }
    if (btnC && !btnC.__crozzoAiBound) {
      btnC.__crozzoAiBound = true;
      btnC.addEventListener('click', function () {
        var last = getLastInsight();
        var t = (last && last.text) || '';
        if (!t) {
          if (typeof showToast === 'function') showToast('No hay texto para copiar', 'info');
          return;
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(t).then(
            function () {
              if (typeof showToast === 'function') showToast('Copiado', 'success');
            },
            function () {
              if (typeof showToast === 'function') showToast('No se pudo copiar', 'warning');
            }
          );
        }
      });
    }
    bindAuditCard(root);
  }

  function renderSuperAdminCardHtml() {
    var cfg = readCfg();
    var st = readKeyStatusCache();
    var local = readLocalKey();
    if (!st.configured && local) {
      st = { configured: true, last4: local.slice(-4), source: 'local' };
    }
    var keyHint = st.configured
      ? 'Key lista · ••••' +
        esc(st.last4 || '') +
        (st.source === 'local' ? ' (este Super Admin PC)' : ' (nube)')
      : 'Aún sin key — péguela abajo (nvapi-…)';
    return (
      '<div class="card crozzo-ai-insights-admin" id="crozzoAiInsightsAdmin">' +
      '<div class="card-header"><span class="card-title">✨ Inteligencia — Reporte IA (NVIDIA)</span></div>' +
      '<p class="form-hint"><strong>Aquí se configura la API key.</strong> Obtenga <code>nvapi-…</code> en ' +
      '<a href="https://build.nvidia.com" target="_blank" rel="noopener">build.nvidia.com</a> → Get API Key. ' +
      'No viaja a tablets ni al QR.</p>' +
      '<div class="form-group" style="margin-top:10px;">' +
      '<label class="crozzo-toggle-row" style="display:flex;align-items:center;gap:10px;cursor:pointer;">' +
      '<input type="checkbox" id="crozzoAiEnabled"' +
      (cfg.enabled ? ' checked' : '') +
      ' />' +
      '<span><strong>Habilitar Reporte IA</strong> en este establecimiento</span></label></div>' +
      '<div class="form-group"><label class="form-label" for="crozzoAiCadence">Cadencia sugerida</label>' +
      '<select id="crozzoAiCadence" class="form-control">' +
      '<option value="8d"' +
      (cfg.cadence === '8d' ? ' selected' : '') +
      '>Cada 8 días</option>' +
      '<option value="month"' +
      (cfg.cadence === 'month' ? ' selected' : '') +
      '>Fin de mes</option></select></div>' +
      '<div class="form-group"><label class="form-label" for="crozzoAiApiKey">API key NVIDIA (nvapi-…)</label>' +
      '<input type="password" id="crozzoAiApiKey" class="form-control" autocomplete="off" ' +
      'placeholder="Pegue su key real de build.nvidia.com (empieza por nvapi-)" />' +
      '<span class="form-hint" id="crozzoAiKeyHint">' +
      keyHint +
      '</span></div>' +
      '<p class="form-hint" id="crozzoAiKeySavedBanner" style="margin:6px 0 0;font-weight:600;">' +
      (st.configured
        ? '✓ Key guardada en este PC · ••••' + esc(st.last4 || '') + ' — ya puede pulsar «3. Probar conexión»'
        : '⚠ Aún no hay key guardada. Péguele abajo y pulse «1. Guardar key NVIDIA».') +
      '</p>' +
      '<div class="crozzo-rep-actions" style="display:flex;gap:8px;flex-wrap:wrap;">' +
      '<button type="button" class="btn btn-primary" id="crozzoAiBtnSaveKey">1. Guardar key NVIDIA</button>' +
      '<button type="button" class="btn btn-primary" id="crozzoAiBtnSaveFlag">2. Guardar habilitación</button>' +
      '<button type="button" class="btn btn-outline" id="crozzoAiBtnProbe">3. Probar conexión</button>' +
      '<button type="button" class="btn btn-outline" id="crozzoAiBtnRefreshStatus">Estado key</button>' +
      '</div>' +
      '<div class="form-group" style="margin-top:12px;">' +
      '<label class="form-label" for="crozzoAiProbeQ">Pregunta de revisión (opcional)</label>' +
      '<input type="text" id="crozzoAiProbeQ" class="form-control" autocomplete="off" ' +
      'placeholder="Vacío = pregunta de control CROZZO_OK (recomendado)" />' +
      '</div>' +
      '<p class="form-hint" id="crozzoAiAdminMsg" style="margin-top:8px;">Paso: key → Guardar → habilitar → <strong>Probar conexión</strong> (debe devolver CROZZO_OK).</p>' +
      '<pre class="crozzo-ai-insight-text" id="crozzoAiProbeOut" hidden style="margin-top:10px;"></pre>' +
      '</div>'
    );
  }

  function bindSuperAdminCard() {
    var root = document.getElementById('crozzoAiInsightsAdmin');
    if (!root) return;
    if (root.__crozzoAiBound) return;
    root.__crozzoAiBound = true;

    function msg(t, err) {
      var el = document.getElementById('crozzoAiAdminMsg');
      if (el) {
        el.textContent = t || '';
        el.style.color = err ? 'var(--danger, #b91c1c)' : 'var(--text-secondary)';
      }
    }

    function paintSavedUi(last4) {
      var hint = document.getElementById('crozzoAiKeyHint');
      if (hint) {
        hint.textContent = 'Key lista · ••••' + (last4 || '') + ' (este PC Super Admin)';
      }
      var ban = document.getElementById('crozzoAiKeySavedBanner');
      if (ban) {
        ban.textContent =
          '✓ Key guardada en este PC · ••••' + (last4 || '') + ' — ya puede pulsar «3. Probar conexión»';
        ban.style.color = 'var(--success, #15803d)';
      }
    }

    ['crozzoAiApiKey', 'crozzoAiProbeQ'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el || el._crozzoAiDirtyBound) return;
      el._crozzoAiDirtyBound = true;
      el.addEventListener('input', function () {
        el.dataset.crozzoDirty = '1';
      });
    });

    var saveFlag = document.getElementById('crozzoAiBtnSaveFlag');
    if (saveFlag) {
      saveFlag.addEventListener('click', function () {
        var en = !!(document.getElementById('crozzoAiEnabled') || {}).checked;
        var cad = (document.getElementById('crozzoAiCadence') || {}).value || '8d';
        writeCfg({ enabled: en, cadence: cad });
        msg(en ? 'Reporte IA habilitado. Abra Reportes y dashboard → tab Reporte IA.' : 'Reporte IA deshabilitado (próximas versiones).');
        if (typeof showToast === 'function') {
          showToast(en ? 'Reporte IA ON' : 'Reporte IA OFF', 'success');
        }
      });
    }

    var saveKey = document.getElementById('crozzoAiBtnSaveKey');
    if (saveKey) {
      saveKey.addEventListener('click', function () {
        var input = document.getElementById('crozzoAiApiKey');
        var key = input ? String(input.value || '').trim() : '';
        msg('Guardando key en este PC…');
        saveApiKey(key)
          .then(function (r) {
            if (!r.ok) {
              if (r.error === 'placeholder_key') {
                msg(
                  'Eso no es una key real. En build.nvidia.com → Get API Key, copie la nvapi-… larga y péguela aquí.',
                  true
                );
              } else if (r.error === 'local_persist_failed') {
                msg('No se pudo escribir en localStorage. Revise modo privado / permisos del WebView.', true);
              } else {
                msg('Key inválida: debe empezar con nvapi- y ser la key completa (no el placeholder).', true);
              }
              if (typeof showToast === 'function') showToast('Key no guardada', 'warning');
              return;
            }
            if (readLocalKey() !== key) {
              msg('Guardado incompleto — la key no quedó en este PC. Intente de nuevo.', true);
              return;
            }
            if (input) {
              input.value = '';
              input.dataset.crozzoDirty = '';
            }
            paintSavedUi(r.last4);
            msg(
              'Key guardada en este PC (campo vaciado por seguridad). Pulse «3. Probar conexión» — no hace falta volver a pegar.'
            );
            if (typeof showToast === 'function') showToast('API key NVIDIA guardada', 'success');
          })
          .catch(function (e) {
            msg('Error al guardar: ' + (e && e.message ? e.message : e), true);
          });
      });
    }

    var refresh = document.getElementById('crozzoAiBtnRefreshStatus');
    if (refresh) {
      refresh.addEventListener('click', function () {
        msg('Consultando estado…');
        fetchKeyStatus({ force: true })
          .then(function (st) {
            var hint = document.getElementById('crozzoAiKeyHint');
            if (hint) {
              hint.textContent = st.configured
                ? 'Key lista · ••••' + (st.last4 || '') + (st.source === 'local' ? ' (local)' : ' (nube)')
                : 'Aún sin key';
            }
            if (st.edge === 'down' || st.edge === 'skipped') {
              msg(
                (st.configured ? 'Key local OK. ' : 'Sin key. ') +
                  'Edge Function no disponible aún — use modo local (normal hasta desplegar ai-insights).'
              );
            } else {
              msg(st.configured ? 'Key configurada.' : 'Sin key todavía.');
            }
          })
          .catch(function () {
            msg('No se pudo consultar estado (modo local activo si ya guardó key).');
          });
      });
    }

    var probeBtn = document.getElementById('crozzoAiBtnProbe');
    if (probeBtn) {
      probeBtn.addEventListener('click', function () {
        var btnNow = document.getElementById('crozzoAiBtnProbe');
        if (btnNow && btnNow.disabled) return;
        if (_probeSession.busy) return;
        var input = document.getElementById('crozzoAiApiKey');
        var qEl = document.getElementById('crozzoAiProbeQ');
        var typed = input ? String(input.value || '').trim() : '';
        var question = qEl ? String(qEl.value || '').trim() : '';
        setProbeSession({
          busy: true,
          msgErr: false,
          msg: 'Probando NVIDIA… (hasta ~2 min; la app sigue usable. No salga de Nube.)',
          outHidden: false,
          out: 'Esperando respuesta por canal Rust (sin congelar la UI)…',
        });
        probeConnection({ apiKey: typed || undefined, question: question || undefined })
          .then(function (r) {
            if (!r.ok) {
              var errMap = {
                key_not_configured:
                  'No hay key guardada. 1) Pegue la nvapi-… REAL. 2) Pulse «1. Guardar key NVIDIA». 3) Probar.',
                placeholder_key:
                  'Pegó el texto de ejemplo, no la key. En build.nvidia.com copie la key completa nvapi-…',
                nvidia_network:
                  'NVIDIA no respondió (red, key o timeout). Si tarda mucho, reintente; timeout Rust = 120 s.',
                needs_tauri_rebuild:
                  'Cierre y vuelva a abrir Tauri (rebuild) — la prueba va por Rust para evitar CORS.',
                empty_insight: 'NVIDIA respondió vacío.',
              };
              var err = errMap[r.error] || r.error || 'falló';
              if (r.detail) err += ' · ' + r.detail;
              setProbeSession({
                busy: false,
                msgErr: true,
                msg: 'Prueba fallida: ' + err,
                outHidden: false,
                out: 'ERROR: ' + err,
              });
              if (typeof showToast === 'function') showToast('NVIDIA no respondió', 'warning');
              return;
            }
            setProbeSession({
              busy: false,
              msgErr: false,
              msg: r.verdict + (r.pass ? '' : ' Revise el texto abajo.'),
              outHidden: false,
              out:
                (r.pass ? '✅ REVISIÓN OK\n' : '⚠️ REVISIÓN PARCIAL\n') +
                'Modelo: ' +
                (r.model || '—') +
                '\nVía: ' +
                (r.via || 'tauri') +
                '\n\nPregunta:\n' +
                (r.question || '') +
                '\n\nRespuesta NVIDIA:\n' +
                (r.text || ''),
            });
            if (typeof showToast === 'function') {
              showToast(r.pass ? 'Conexión NVIDIA OK' : 'Respuesta sin CROZZO_OK', r.pass ? 'success' : 'warning');
            }
          })
          .catch(function (e) {
            var detail = e && e.message ? e.message : String(e);
            setProbeSession({
              busy: false,
              msgErr: true,
              msg: 'Error de prueba: ' + detail,
              outHidden: false,
              out: 'ERROR: ' + detail,
            });
          });
      });
    }

    applyProbeSessionToDom();
    fetchKeyStatus().catch(function () {});
  }

  global.CrozzoAiInsights = {
    isEnabled: isEnabled,
    getConfig: readCfg,
    setConfig: writeCfg,
    normalize: normalizeCfg,
    buildPeriodPack: buildPeriodPack,
    buildBehaviorPack: buildBehaviorPack,
    requestInsight: requestInsight,
    requestBehaviorInsight: requestBehaviorInsight,
    peekBehaviorRateLimit: peekBehaviorRateLimit,
    commitBehaviorRateSuccess: commitBehaviorRateSuccess,
    clearBehaviorRateLimit: clearBehaviorRateLimit,
    probeConnection: probeConnection,
    getLastInsight: getLastInsight,
    saveApiKey: saveApiKey,
    fetchKeyStatus: fetchKeyStatus,
    formHasDraft: formHasDraft,
    canAdminAiAudit: canAdminAiAudit,
    canSeeAuditUi: canSeeAuditUi,
    renderReportPanelHtml: renderReportPanelHtml,
    renderAuditCardHtml: renderAuditCardHtml,
    bindAuditCard: bindAuditCard,
    tabButtonHtml: tabButtonHtml,
    bindReportPanel: bindReportPanel,
    renderSuperAdminCardHtml: renderSuperAdminCardHtml,
    bindSuperAdminCard: bindSuperAdminCard,
  };
  global.crozzoAiClearBehaviorRate = clearBehaviorRateLimit;
})(typeof window !== 'undefined' ? window : globalThis);
