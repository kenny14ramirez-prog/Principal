/**
 * Crozzo POS — Cierre de turnos y arqueo (mañana · tarde · día)
 * Día operativo reinicia contadores; historial de facturas se conserva.
 */
(function (global) {
  'use strict';

  var LS_DAY = 'crozzo_day_session_v2';
  var LS_TURN = 'crozzo_shift_turn_v1';
  var LS_HIST = 'crozzo_shift_turn_history_v1';
  var STOCK_DEFAULT = 5;
  var HIST_LIMIT_DEFAULT = 500;
  var DIFF_ALERT_DEFAULT = 5000;

  var SHIFT_META = {
    manana: { label: 'Mañana', icon: 'sunrise', short: 'AM' },
    tarde: { label: 'Tarde', icon: 'sunset', short: 'PM' },
    dia: { label: 'Día completo', icon: 'calendar-check', short: 'Día' },
  };

  var __arqueoPending = null;
  var __histFilter = 'all';
  var __histSearch = '';
  var __snapCache = null;
  var __histCache = null;
  var __refreshDebounce = null;
  var __searchDebounce = null;
  var __stressFullRefreshTimer = null;
  var REFRESH_DEBOUNCE_MS = 350;
  var REFRESH_DEBOUNCE_BUSY_MS = 550;
  var REFRESH_DEBOUNCE_RUSH_MS = 900;
  var SEARCH_DEBOUNCE_MS = 220;

  function todayKey(d) {
    var x = d || new Date();
    var y = x.getFullYear();
    var m = String(x.getMonth() + 1).padStart(2, '0');
    var day = String(x.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function readDaySession() {
    try {
      var raw = localStorage.getItem(LS_DAY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      return s && typeof s === 'object' ? s : null;
    } catch (_) {
      return null;
    }
  }

  function writeDaySession(s) {
    try {
      localStorage.setItem(LS_DAY, JSON.stringify(s));
    } catch (e) {
      console.warn('[cierre]', e);
    }
  }

  function defaultShiftSlot(type) {
    return { type: type, openedAt: null, closedAt: null, status: 'pending' };
  }

  function newDaySession(businessDate) {
    var now = new Date().toISOString();
    return {
      businessDate: businessDate || todayKey(),
      openedAt: now,
      closedAt: null,
      autoClosed: false,
      activeShift: 'manana',
      shifts: {
        manana: { type: 'manana', openedAt: now, closedAt: null, status: 'open' },
        tarde: defaultShiftSlot('tarde'),
        dia: defaultShiftSlot('dia'),
      },
    };
  }

  function getShiftSettings() {
    try {
      if (typeof config !== 'undefined' && config.get) {
        var c = config.get('cierreTurnos') || {};
        return {
          mananaEndHour: Number(c.mananaEndHour) || 14,
          tardeEndHour: Number(c.tardeEndHour) || 22,
          autoCloseHour: Number(c.autoCloseHour) || 3,
          diffAlertThreshold: Number(c.diffAlertThreshold) || DIFF_ALERT_DEFAULT,
          histLimit: Number(c.histLimit) || HIST_LIMIT_DEFAULT,
          stressComandasBusy: Number(c.stressComandasBusy) || 8,
          stressComandasRush: Number(c.stressComandasRush) || 16,
          stressVentasHoraBusy: Number(c.stressVentasHoraBusy) || 15,
          stressVentasHoraRush: Number(c.stressVentasHoraRush) || 30,
        };
      }
    } catch (_) {}
    return {
      mananaEndHour: 14,
      tardeEndHour: 22,
      autoCloseHour: 3,
      diffAlertThreshold: DIFF_ALERT_DEFAULT,
      histLimit: HIST_LIMIT_DEFAULT,
      stressComandasBusy: 8,
      stressComandasRush: 16,
      stressVentasHoraBusy: 15,
      stressVentasHoraRush: 30,
    };
  }

  function getActiveComandasCount() {
    try {
      var list = typeof global.comandas !== 'undefined' ? global.comandas : null;
      if (!Array.isArray(list)) return 0;
      return list.filter(function (c) {
        if (!c) return false;
        var st = String(c.estado || '').toLowerCase();
        return st !== 'despachada' && st !== 'cancelada' && st !== 'anulada';
      }).length;
    } catch (_) {
      return 0;
    }
  }

  function countSalesLastHour() {
    var since = Date.now() - 3600000;
    var facturas = getFacturas();
    var n = 0;
    for (var i = 0; i < facturas.length; i++) {
      if (!isValidSale(facturas[i])) continue;
      if (facturaTs(facturas[i]) >= since) n += 1;
    }
    return n;
  }

  /** calm · busy · rush — según comandas vivas y ventas/hora (restaurante). */
  function getRestaurantStress() {
    var s = getShiftSettings();
    var activeComandas = getActiveComandasCount();
    var salesHour = countSalesLastHour();
    var level = 'calm';
    var label = 'Operación normal';
    var hint = 'Panel completo activo.';
    if (activeComandas >= s.stressComandasRush || salesHour >= s.stressVentasHoraRush) {
      level = 'rush';
      label = 'Servicio crítico';
      hint = 'Modo ligero: KPIs al día. Arqueo disponible. Historial diferido para no frenar caja.';
    } else if (activeComandas >= s.stressComandasBusy || salesHour >= s.stressVentasHoraBusy) {
      level = 'busy';
      label = 'Servicio intenso';
      hint = 'Actualizaciones más espaciadas. Puede cerrar turno; revise historial al bajar el ritmo.';
    }
    return {
      level: level,
      label: label,
      hint: hint,
      activeComandas: activeComandas,
      salesHour: salesHour,
    };
  }

  function isDocumentVisible() {
    try {
      return typeof document === 'undefined' || !document.hidden;
    } catch (_) {
      return true;
    }
  }

  function getCierreActor() {
    var id = '';
    var name = 'sistema';
    try {
      if (typeof getCurrentUser === 'function') {
        var u = getCurrentUser();
        if (u) {
          id = String(u.id || '');
          name = String(u.nombre || u.id || 'admin');
        }
      }
    } catch (_) {}
    return { id: id, name: name };
  }

  function getCierreDeviceId() {
    try {
      if (typeof crozzoCloudDeviceUuidForRest === 'function') return String(crozzoCloudDeviceUuidForRest() || '');
      if (typeof ensureCrozzoDeviceId === 'function') return String(ensureCrozzoDeviceId() || '');
    } catch (_) {}
    return '';
  }

  function hashString(str) {
    if (typeof crozzoAuditChainHash === 'function') return crozzoAuditChainHash(str);
    var h = 5381 >>> 0;
    var s = String(str || '');
    for (var i = 0; i < s.length; i++) h = (((h << 5) + h) ^ s.charCodeAt(i)) >>> 0;
    return 'c' + h.toString(16).padStart(8, '0');
  }

  function computeFacturasSnapshot(metrics) {
    var invoices = (metrics && metrics.invoices) || [];
    var refs = invoices
      .map(function (f) {
        return [
          String(f.uuid || f.consecutivo || ''),
          String(f.fecha || f.fechaEmision || ''),
          String(Number(f.total) || 0),
          String(f.metodoPago || ''),
          String(saleCashAmount(f)),
        ].join(':');
      })
      .sort();
    return {
      facturasHash: hashString(refs.join('|')),
      invoiceCountSnapshot: refs.length,
    };
  }

  function facturasForCierreRecord(rec) {
    if (!rec || !rec.businessDate) return [];
    var settings = getShiftSettings();
    var bd = rec.businessDate;
    var list = getFacturas().filter(function (f) {
      if (!isValidSale(f)) return false;
      var d = f.fecha || f.fechaEmision;
      if (!d) return false;
      var dayKey = String(d).slice(0, 10);
      if (dayKey !== bd) return false;
      return true;
    });
    if (rec.shiftType === 'dia') return list;
    var hourOf = function (f) {
      try {
        return new Date(f.fecha || f.fechaEmision).getHours();
      } catch (_) {
        return 0;
      }
    };
    if (rec.shiftType === 'manana') {
      return list.filter(function (f) {
        return hourOf(f) < settings.mananaEndHour;
      });
    }
    if (rec.shiftType === 'tarde') {
      return list.filter(function (f) {
        var h = hourOf(f);
        return h >= settings.mananaEndHour && h < settings.tardeEndHour;
      });
    }
    return list;
  }

  function verifyCierreIntegrity(rec) {
    if (!rec || !rec.facturasHash) return { ok: true, status: 'legacy' };
    var invoices = facturasForCierreRecord(rec);
    var snap = computeFacturasSnapshot({ invoices: invoices });
    if (snap.facturasHash === rec.facturasHash && snap.invoiceCountSnapshot === rec.invoiceCountSnapshot) {
      return { ok: true, status: 'verified' };
    }
    if (snap.invoiceCountSnapshot !== rec.invoiceCountSnapshot) {
      return { ok: false, status: 'count_mismatch', current: snap.invoiceCountSnapshot, stored: rec.invoiceCountSnapshot };
    }
    return { ok: false, status: 'hash_mismatch' };
  }

  function integrityBadgeHtml(rec) {
    var v = verifyCierreIntegrity(rec);
    if (v.status === 'legacy') return '';
    if (v.ok) {
      return ' <span class="crozzo-cierre-integrity crozzo-cierre-integrity--ok" title="Huella de facturas verificada">✓</span>';
    }
    return ' <span class="crozzo-cierre-integrity crozzo-cierre-integrity--warn" title="Facturas del turno cambiaron desde el cierre">⚠</span>';
  }

  function pushCierreToPlanilla(rec) {
    try {
      if (typeof global.crozzoPlanillaApplyCierreFromShift === 'function') {
        return global.crozzoPlanillaApplyCierreFromShift(rec);
      }
    } catch (e) {
      console.warn('[cierre] planilla', e);
    }
    return { ok: false };
  }

  function enrichCierreRecord(rec, metrics) {
    var actor = getCierreActor();
    var snap = computeFacturasSnapshot(metrics);
    return Object.assign({}, rec, {
      closedBy: actor.name,
      closedById: actor.id,
      deviceId: getCierreDeviceId(),
      facturasHash: snap.facturasHash,
      invoiceCountSnapshot: snap.invoiceCountSnapshot,
    });
  }

  function diffNeedsNote(diff) {
    var threshold = getShiftSettings().diffAlertThreshold;
    return Math.abs(Number(diff) || 0) >= threshold;
  }

  function inferShiftByClock() {
    var h = new Date().getHours();
    var s = getShiftSettings();
    if (h < s.mananaEndHour) return 'manana';
    if (h < s.tardeEndHour) return 'tarde';
    return 'tarde';
  }

  function getFacturas() {
    return typeof config !== 'undefined' && config.getFacturas ? config.getFacturas() : [];
  }

  function facturaTs(f) {
    var d = f && (f.fecha || f.fechaEmision);
    return d ? new Date(d).getTime() : 0;
  }

  function invalidateCierreCaches() {
    __snapCache = null;
    __histCache = null;
  }

  function isProductionArqueo() {
    try {
      if (typeof config !== 'undefined' && config.isDemoMode && config.isDemoMode()) return false;
    } catch (_) {}
    return true;
  }

  function snapCacheKey(day, facturas) {
    if (!day) return 'none';
    var tail = '0';
    if (facturas && facturas.length) {
      var f0 = facturas[0];
      tail = String(facturaTs(f0)) + ':' + String(f0.uuid || f0.consecutivo || '');
    }
    return [
      day.businessDate,
      day.closedAt || '',
      day.activeShift || '',
      day.shifts && day.shifts.manana ? day.shifts.manana.status : '',
      day.shifts && day.shifts.tarde ? day.shifts.tarde.status : '',
      facturas ? facturas.length : 0,
      tail,
    ].join('|');
  }

  function metricsAggEmpty() {
    return {
      count: 0,
      total: 0,
      cash: 0,
      byMethod: { efectivo: 0, tarjeta: 0, qr: 0, pse: 0, mixto: 0, otro: 0 },
    };
  }

  function metricsAggAdd(agg, f) {
    var tot = Number(f.total) || 0;
    agg.count += 1;
    agg.total += tot;
    agg.cash += saleCashAmount(f);
    var mp = String(f.metodoPago || 'otro').toLowerCase();
    if (agg.byMethod[mp] != null) agg.byMethod[mp] += tot;
    else agg.byMethod.otro += tot;
  }

  function packScopeMetrics(day, turn, scopeKey, agg, window) {
    return {
      shift: turn,
      day: day,
      scope: scopeKey,
      scopeLabel: (SHIFT_META[scopeKey] && SHIFT_META[scopeKey].label) || scopeKey,
      count: agg.count,
      total: agg.total,
      cash: agg.cash,
      nonCash: Math.max(0, agg.total - agg.cash),
      ticket: agg.count ? agg.total / agg.count : 0,
      byMethod: agg.byMethod,
      t0: window.from,
      dayClosed: !!day.closedAt,
      shiftStatus: day.shifts && day.shifts[scopeKey] ? day.shifts[scopeKey].status : 'unknown',
    };
  }

  /** Un solo recorrido de facturas para mañana + tarde + día (evita 3 filtros completos). */
  function buildOperationalSnapshot() {
    crozzoDaySessionEnsure();
    var day = readDaySession();
    var turn = ensureTurn();
    var facturas = getFacturas();
    var key = snapCacheKey(day, facturas);
    if (__snapCache && __snapCache.key === key) return __snapCache.data;

    var windows = {
      dia: dayWindow(day),
      manana: shiftWindow(day, 'manana'),
      tarde: shiftWindow(day, 'tarde'),
    };
    var aggs = {
      dia: metricsAggEmpty(),
      manana: metricsAggEmpty(),
      tarde: metricsAggEmpty(),
    };
    var minFrom = windows.dia.from || 0;

    for (var i = 0; i < facturas.length; i++) {
      var f = facturas[i];
      if (!isValidSale(f)) continue;
      var t = facturaTs(f);
      if (t < minFrom) continue;
      if (t >= windows.dia.from && (windows.dia.to == null || t < windows.dia.to)) metricsAggAdd(aggs.dia, f);
      if (t >= windows.manana.from && (windows.manana.to == null || t < windows.manana.to)) metricsAggAdd(aggs.manana, f);
      if (t >= windows.tarde.from && (windows.tarde.to == null || t < windows.tarde.to)) metricsAggAdd(aggs.tarde, f);
    }

    var data = {
      day: day,
      turn: turn,
      dia: packScopeMetrics(day, turn, 'dia', aggs.dia, windows.dia),
      manana: packScopeMetrics(day, turn, 'manana', aggs.manana, windows.manana),
      tarde: packScopeMetrics(day, turn, 'tarde', aggs.tarde, windows.tarde),
    };
    __snapCache = { key: key, data: data };
    return data;
  }

  function suggestedFondoForShift(shiftType) {
    var turn = loadTurn();
    if (turn && Number(turn.cashOpen) > 0) return Number(turn.cashOpen);
    var day = readDaySession();
    if (!day) return 0;
    var rows = getHistoryRows();
    var prevType = shiftType === 'tarde' ? 'manana' : shiftType === 'dia' ? 'tarde' : null;
    if (!prevType) return 0;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r.businessDate === day.businessDate && r.shiftType === prevType && !r.autoClosed && r.actual != null) {
        return Number(r.actual) || 0;
      }
    }
    return 0;
  }

  function isValidSale(f) {
    var st = String((f && f.estado) || '').toLowerCase();
    if (st !== 'pos' && st !== 'timbrada' && st !== 'demo') return false;
    if (isProductionArqueo() && st === 'demo') return false;
    return true;
  }

  function saleCashAmount(f) {
    var tot = Number(f.total) || 0;
    var mp = String(f.metodoPago || '').toLowerCase();
    if (mp === 'efectivo') return tot;
    if (mp === 'mixto') return Number(f.paymentMeta && f.paymentMeta.efectivoParte) || 0;
    return 0;
  }

  function computeMetrics(fromTs, toTs) {
    var list = getFacturas().filter(function (f) {
      if (!isValidSale(f)) return false;
      var t = facturaTs(f);
      if (t < fromTs) return false;
      if (toTs != null && t >= toTs) return false;
      return true;
    });
    var total = 0;
    var cash = 0;
    var byMethod = { efectivo: 0, tarjeta: 0, qr: 0, pse: 0, mixto: 0, otro: 0 };
    list.forEach(function (f) {
      var tot = Number(f.total) || 0;
      total += tot;
      cash += saleCashAmount(f);
      var mp = String(f.metodoPago || 'otro').toLowerCase();
      if (byMethod[mp] != null) byMethod[mp] += tot;
      else byMethod.otro += tot;
    });
    return {
      count: list.length,
      total: total,
      cash: cash,
      nonCash: Math.max(0, total - cash),
      ticket: list.length ? total / list.length : 0,
      byMethod: byMethod,
      invoices: list,
    };
  }

  function shiftWindow(day, shiftType) {
    if (!day || !day.shifts || !day.shifts[shiftType]) return { from: 0, to: null };
    var slot = day.shifts[shiftType];
    var from = slot.openedAt ? new Date(slot.openedAt).getTime() : new Date(day.openedAt).getTime();
    var to = slot.closedAt ? new Date(slot.closedAt).getTime() : null;
    return { from: from, to: to };
  }

  function dayWindow(day) {
    if (!day) return { from: 0, to: null };
    var from = day.openedAt ? new Date(day.openedAt).getTime() : 0;
    var to = day.closedAt ? new Date(day.closedAt).getTime() : null;
    return { from: from, to: to };
  }

  function shouldAutoClosePreviousDay(day) {
    if (!day || day.closedAt) return false;
    var today = todayKey();
    if (day.businessDate >= today) return false;
    var now = new Date();
    var settings = getShiftSettings();
    if (day.businessDate < today) {
      if (now.getHours() >= settings.autoCloseHour) return true;
      return day.businessDate < today;
    }
    return false;
  }

  function buildAutoCloseRecord(day, metrics) {
    return {
      shiftType: 'dia',
      shiftLabel: 'Día (automático)',
      businessDate: day.businessDate,
      shiftId: 'AUTO-' + day.businessDate,
      openedAt: day.openedAt,
      closedAt: new Date().toISOString(),
      autoClosed: true,
      salesCount: metrics.count,
      totalSales: metrics.total,
      cashSales: metrics.cash,
      fondo: 0,
      expected: metrics.cash,
      actual: metrics.cash,
      diff: 0,
      notes: 'Cierre automático: no se registró arqueo manual del día.',
      byMethod: metrics.byMethod,
    };
  }

  function appendHistory(rec) {
    try {
      var limit = getShiftSettings().histLimit;
      var h = JSON.parse(localStorage.getItem(LS_HIST) || '[]');
      h.unshift(rec);
      localStorage.setItem(LS_HIST, JSON.stringify(h.slice(0, limit)));
      invalidateCierreCaches();
    } catch (e) {
      console.warn('[cierre] history', e);
    }
  }

  function audit(type, detail) {
    try {
      if (typeof config !== 'undefined' && config.addAudit) config.addAudit(type, detail);
    } catch (_) {}
  }

  function shiftCloseTransactionId(rec) {
    var sid = String((rec && rec.shiftId) || 'shift');
    var closed = String((rec && rec.closedAt) || Date.now());
    return 'shift-close-' + sid + '-' + closed.replace(/[:.]/g, '');
  }

  function queueCloudSync(rec) {
    try {
      var tid = shiftCloseTransactionId(rec);
      if (typeof enqueueOfflineOperation === 'function' && typeof crozzoCloudDeviceUuidForRest === 'function') {
        enqueueOfflineOperation({
          operation: 'insert',
          table_name: 'shift_closes',
          type: 'shift_close',
          transaction_id: tid,
          payload: { shift_close: true, record: rec, transaction_id: tid },
          device_id: crozzoCloudDeviceUuidForRest(),
        });
        if (typeof syncOfflineQueue === 'function' && typeof navigator !== 'undefined' && navigator.onLine) {
          void syncOfflineQueue();
        }
      }
      if (typeof crozzoTryMirrorShiftCloseToSupabase === 'function' && typeof navigator !== 'undefined' && navigator.onLine) {
        void crozzoTryMirrorShiftCloseToSupabase(rec);
      }
    } catch (_) {}
  }

  function autoCloseDay(day, reason) {
    var w = dayWindow(day);
    var metrics = computeMetrics(w.from, w.to);
    var rec = enrichCierreRecord(buildAutoCloseRecord(day, metrics), metrics);
    rec.closedBy = 'sistema';
    rec.closedById = '';
    rec.notes = reason === 'rollover' ? rec.notes : String(reason || rec.notes);
    appendHistory(rec);
    audit('cierre_dia_auto', 'Día ' + day.businessDate + ': ' + metrics.count + ' ventas · $' + Math.round(metrics.total));
    queueCloudSync(rec);
    day.closedAt = rec.closedAt;
    day.autoClosed = true;
    if (day.shifts) {
      ['manana', 'tarde', 'dia'].forEach(function (k) {
        if (day.shifts[k] && day.shifts[k].status !== 'closed') {
          day.shifts[k].status = 'closed';
          if (!day.shifts[k].closedAt) day.shifts[k].closedAt = rec.closedAt;
        }
      });
    }
    writeDaySession(day);
    invalidateCierreCaches();
    return rec;
  }

  function crozzoDaySessionEnsure() {
    var day = readDaySession();
    if (day && shouldAutoClosePreviousDay(day)) {
      autoCloseDay(day, 'rollover');
      day = null;
    }
    var today = todayKey();
    if (!day || day.closedAt || day.businessDate !== today) {
      if (day && !day.closedAt && day.businessDate !== today) {
        autoCloseDay(day, 'rollover');
      }
      day = newDaySession(today);
      writeDaySession(day);
      invalidateCierreCaches();
      try {
        localStorage.setItem(LS_TURN, JSON.stringify(newTurnRecord()));
      } catch (_) {}
      audit('dia_operativo_abierto', 'Día operativo ' + today + ' iniciado en cero');
    } else {
      var clockShift = inferShiftByClock();
      if (day.activeShift !== clockShift && day.shifts && day.shifts[day.activeShift] && day.shifts[day.activeShift].status === 'open') {
        /* respeta turno abierto manualmente */
      } else if (day.shifts && day.shifts[clockShift] && day.shifts[clockShift].status === 'pending' && day.activeShift !== clockShift) {
        day.activeShift = clockShift;
        day.shifts[clockShift].status = 'open';
        day.shifts[clockShift].openedAt = new Date().toISOString();
        writeDaySession(day);
      }
    }
    return day;
  }

  function newTurnRecord() {
    var day = crozzoDaySessionEnsure();
    var id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? 'TRN-' + crypto.randomUUID().slice(0, 8)
        : 'TRN-' + Date.now();
    return {
      id: id,
      openedAt: new Date().toISOString(),
      cashOpen: 0,
      closed: false,
      businessDate: day.businessDate,
      shiftType: day.activeShift,
    };
  }

  function loadTurn() {
    try {
      var raw = localStorage.getItem(LS_TURN);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || s.closed) return null;
      var day = readDaySession();
      if (day && day.businessDate && s.businessDate && s.businessDate !== day.businessDate) return null;
      return s;
    } catch (_) {
      return null;
    }
  }

  function saveTurn(s) {
    try {
      localStorage.setItem(LS_TURN, JSON.stringify(s));
    } catch (e) {
      console.warn('[cierre] turn', e);
    }
  }

  function ensureTurn() {
    var s = loadTurn();
    if (!s) {
      s = newTurnRecord();
      saveTurn(s);
    }
    return s;
  }

  function normalizeRole() {
    if (typeof crozzoGetCurrentUserRole === 'function') {
      var r = crozzoGetCurrentUserRole();
      if (typeof crozzoNormalizeAppRol === 'function') return crozzoNormalizeAppRol(r);
      return String(r || '').toLowerCase();
    }
    return '';
  }

  function canPerformArqueo() {
    if (typeof getCurrentUser !== 'function' || !getCurrentUser()) return false;
    if (typeof isSuperAdminUser === 'function' && isSuperAdminUser()) return true;
    var r = normalizeRole();
    return r === 'admin' || r === 'superadmin' || r === 'super_admin';
  }

  function loginBlocking() {
    try {
      var lo = document.getElementById('loginOverlay');
      if (lo && !lo.hasAttribute('hidden')) return true;
    } catch (_) {}
    return false;
  }

  function metricsForScope(scope) {
    var snap = buildOperationalSnapshot();
    var day = snap.day;
    var scopeKey = scope || day.activeShift || 'manana';
    if (scopeKey === 'dia') return snap.dia;
    if (scopeKey === 'manana') return snap.manana;
    if (scopeKey === 'tarde') return snap.tarde;
    return snap.manana;
  }

  function metricsForScopeDetailed(scope) {
    var base = metricsForScope(scope);
    var day = base.day;
    var scopeKey = scope || day.activeShift || 'manana';
    var w = scopeKey === 'dia' ? dayWindow(day) : shiftWindow(day, scopeKey);
    var detail = computeMetrics(w.from, w.to);
    return Object.assign({}, base, {
      invoices: detail.invoices,
      byMethod: detail.byMethod,
      count: detail.count,
      total: detail.total,
      cash: detail.cash,
      nonCash: detail.nonCash,
      ticket: detail.ticket,
    });
  }

  function crozzoShiftMetrics() {
    return metricsForScope(null);
  }

  function crozzoDaySalesMetrics() {
    return metricsForScope('dia');
  }

  function crozzoRepFilterFacturasOperationalDay() {
    crozzoDaySessionEnsure();
    var day = readDaySession();
    if (!day) return [];
    var w = dayWindow(day);
    return getFacturas().filter(function (f) {
      if (!isValidSale(f)) return false;
      var t = facturaTs(f);
      if (t < w.from) return false;
      if (w.to != null && t >= w.to) return false;
      return true;
    });
  }

  function lowStockProducts() {
    if (typeof products === 'undefined' || !Array.isArray(products)) return [];
    return products.filter(function (p) {
      if (p.stock == null || Number.isNaN(Number(p.stock))) return false;
      var min =
        p.stockMin != null && !Number.isNaN(Number(p.stockMin)) ? Math.max(0, Number(p.stockMin)) : STOCK_DEFAULT;
      return Number(p.stock) <= min;
    });
  }

  function formatMoney(n) {
    return '$' + Math.round(Number(n) || 0).toLocaleString('es-CO');
  }

  function getHistoryRows() {
    if (__histCache) return __histCache;
    try {
      var rows = JSON.parse(localStorage.getItem(LS_HIST) || '[]');
      __histCache = Array.isArray(rows) ? rows : [];
    } catch (_) {
      __histCache = [];
    }
    return __histCache;
  }

  function filterHistoryRows(rows) {
    var q = String(__histSearch || '')
      .trim()
      .toLowerCase();
    return rows.filter(function (r) {
      var diff = Number(r.diff) || 0;
      if (__histFilter === 'faltantes' && diff >= 0) return false;
      if (__histFilter === 'alertas' && !diffNeedsNote(diff)) return false;
      if (__histFilter === 'auto' && !r.autoClosed) return false;
      if (q) {
        var hay = [r.businessDate, r.shiftLabel, r.shiftType, r.closedBy, r.notes, r.shiftId]
          .join(' ')
          .toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  function summarizeHistory(rows) {
    var faltantes = 0;
    var alertas = 0;
    var auto = 0;
    var netDiff = 0;
    rows.forEach(function (r) {
      var d = Number(r.diff) || 0;
      netDiff += d;
      if (d < 0) faltantes += 1;
      if (diffNeedsNote(d)) alertas += 1;
      if (r.autoClosed) auto += 1;
    });
    return { total: rows.length, faltantes: faltantes, alertas: alertas, auto: auto, netDiff: netDiff };
  }

  function paymentMethodHtml(byMethod) {
    var labels = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', qr: 'QR', pse: 'PSE', mixto: 'Mixto', otro: 'Otro' };
    var icons = { efectivo: 'banknote', tarjeta: 'credit-card', qr: 'qr-code', pse: 'landmark', mixto: 'split', otro: 'circle-dollar-sign' };
    var keys = Object.keys(byMethod || {}).filter(function (k) {
      return Number(byMethod[k]) > 0;
    });
    if (!keys.length) {
      return '<span class="crozzo-cierre-pay-empty">Sin ventas registradas en el día operativo</span>';
    }
    keys.sort(function (a, b) {
      return Number(byMethod[b]) - Number(byMethod[a]);
    });
    return keys
      .map(function (k) {
        return (
          '<div class="crozzo-cierre-pay-chip">' +
          '<i data-lucide="' +
          (icons[k] || 'circle') +
          '"></i><span class="crozzo-cierre-pay-chip__lbl">' +
          esc(labels[k] || k) +
          '</span><strong>' +
          formatMoney(byMethod[k]) +
          '</strong></div>'
        );
      })
      .join('');
  }

  function cloudSyncLabel() {
    var online = typeof navigator !== 'undefined' && navigator.onLine;
    var cloud = !!window.__CROZZO_ONLINE_DATA;
    if (cloud && online) return { text: 'Nube conectada · cierres replicados', cls: 'is-online' };
    if (cloud && !online) return { text: 'Sin red · cola local activa', cls: 'is-pending' };
    return { text: 'Modo local · respaldo en equipo', cls: 'is-local' };
  }

  function refreshCierrePageIfActive(immediate) {
    if (typeof currentPage !== 'undefined' && currentPage === 'cierre-caja') {
      if (immediate) {
        clearTimeout(__refreshDebounce);
        refreshCierrePanel({ full: true, force: true });
        return;
      }
      scheduleRefreshCierrePanel();
    }
  }

  function scheduleRefreshCierrePanel(ms, opts) {
    opts = opts || {};
    if (!isDocumentVisible() && !opts.force) return;
    var stress = getRestaurantStress();
    var delay = ms;
    if (delay == null) {
      if (stress.level === 'rush') delay = REFRESH_DEBOUNCE_RUSH_MS;
      else if (stress.level === 'busy') delay = REFRESH_DEBOUNCE_BUSY_MS;
      else delay = REFRESH_DEBOUNCE_MS;
    }
    clearTimeout(__refreshDebounce);
    __refreshDebounce = setTimeout(function () {
      refreshCierrePanel({ full: true, light: stress.level === 'rush' && !opts.force });
    }, delay);
  }

  function scheduleStressFullRefresh() {
    clearTimeout(__stressFullRefreshTimer);
    __stressFullRefreshTimer = setTimeout(function () {
      var st = getRestaurantStress();
      if (st.level === 'rush') {
        scheduleStressFullRefresh();
        return;
      }
      if (typeof currentPage !== 'undefined' && currentPage === 'cierre-caja') {
        refreshCierrePanel({ full: true, force: true });
      }
    }, 12000);
  }

  function renderStressBannerHtml(stress) {
    if (!stress || stress.level === 'calm') {
      var hfLine = '';
      try {
        if (
          global.CrozzoOnboardingOperativo &&
          typeof global.CrozzoOnboardingOperativo.getHumanFactorIndex === 'function'
        ) {
          var hf = global.CrozzoOnboardingOperativo.getHumanFactorIndex();
          if (hf && hf.experiencia === 'novice') {
            hfLine =
              '<span class="crozzo-cierre-stress__hfsi">IH-S ' +
              hf.score +
              '% · ' +
              esc(hf.label) +
              '</span>';
          }
        }
      } catch (_) {}
      if (!hfLine) {
        return '<div class="crozzo-cierre-stress crozzo-cierre-stress--calm" id="crozzo-cierre-stress" hidden></div>';
      }
      return (
        '<div class="crozzo-cierre-stress crozzo-cierre-stress--calm" id="crozzo-cierre-stress" role="status">' +
        hfLine +
        '</div>'
      );
    }
    var hfExtra = '';
    try {
      if (
        global.CrozzoOnboardingOperativo &&
        typeof global.CrozzoOnboardingOperativo.getCombinedStress === 'function'
      ) {
        var cs = global.CrozzoOnboardingOperativo.getCombinedStress();
        if (cs.humanFactor) {
          hfExtra =
            ' · IH-S ' +
            cs.humanFactor.score +
            '%' +
            (cs.combined === 'critical' ? ' · ⚠️ crítico humano-sistema' : '');
        }
      }
    } catch (_) {}
    return (
      '<div class="crozzo-cierre-stress crozzo-cierre-stress--' +
      esc(stress.level) +
      '" id="crozzo-cierre-stress" role="status">' +
      '<div class="crozzo-cierre-stress__icon"><i data-lucide="' +
      (stress.level === 'rush' ? 'flame' : 'activity') +
      '"></i></div>' +
      '<div class="crozzo-cierre-stress__body"><strong>' +
      esc(stress.label) +
      '</strong> · ' +
      stress.activeComandas +
      ' comanda(s) activa(s) · ' +
      stress.salesHour +
      ' venta(s)/h <span class="crozzo-cierre-stress__hint">' +
      esc(stress.hint) +
      hfExtra +
      '</span></div>' +
      (stress.level === 'rush'
        ? '<button type="button" class="btn btn-outline btn-sm" onclick="crozzoCierreForceFullRefresh()">Actualizar todo</button>'
        : '') +
      '</div>'
    );
  }

  function updateStressBanner(stress) {
    var el = document.getElementById('crozzo-cierre-stress');
    if (!el) return;
    if (!stress || stress.level === 'calm') {
      el.hidden = true;
      el.className = 'crozzo-cierre-stress crozzo-cierre-stress--calm';
      el.innerHTML = '';
      return;
    }
    el.hidden = false;
    el.className = 'crozzo-cierre-stress crozzo-cierre-stress--' + stress.level;
    el.innerHTML =
      '<div class="crozzo-cierre-stress__icon"><i data-lucide="' +
      (stress.level === 'rush' ? 'flame' : 'activity') +
      '"></i></div>' +
      '<div class="crozzo-cierre-stress__body"><strong>' +
      esc(stress.label) +
      '</strong> · ' +
      stress.activeComandas +
      ' comanda(s) · ' +
      stress.salesHour +
      ' ventas/h <span class="crozzo-cierre-stress__hint">' +
      esc(stress.hint) +
      '</span></div>' +
      (stress.level === 'rush'
        ? '<button type="button" class="btn btn-outline btn-sm" onclick="crozzoCierreForceFullRefresh()">Actualizar todo</button>'
        : '');
    try {
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons({ nodes: [el] });
    } catch (_) {}
  }

  function onSaleRecorded() {
    try {
      invalidateCierreCaches();
      crozzoDaySessionEnsure();
      ensureTurn();
    } catch (_) {}
    try {
      if (typeof crozzoUpdateGlobalStressBanner === 'function') crozzoUpdateGlobalStressBanner();
    } catch (_) {}
    refreshCierrePageIfActive(false);
  }

  function renderHistoryTable(host, opts) {
    opts = opts || {};
    var limit = opts.limit != null ? opts.limit : 15;
    var full = !!opts.full;
    var allRows = getHistoryRows();
    var rows = full ? filterHistoryRows(allRows) : allRows;
    if (!host) return;
    if (!rows.length) {
      host.innerHTML =
        '<tr><td colspan="' +
        (full ? 10 : 6) +
        '" class="crozzo-cierre-empty">' +
        (allRows.length
          ? 'Ningún cierre coincide con el filtro actual.'
          : 'Sin cierres registrados. Cuando un encargado confirme un arqueo, aparecerá aquí con trazabilidad completa.') +
        '</td></tr>';
      return;
    }
    host.innerHTML = rows
      .slice(0, limit)
      .map(function (r) {
        var lbl = r.shiftLabel || (SHIFT_META[r.shiftType] && SHIFT_META[r.shiftType].label) || r.shiftType || '—';
        var diff = Number(r.diff) || 0;
        var diffCls = diff >= 0 ? 'crozzo-cierre-diff--ok' : 'crozzo-cierre-diff--bad';
        var rowCls = r.autoClosed ? ' crozzo-cierre-hist-row--auto' : diff < 0 ? ' crozzo-cierre-hist-row--bad' : diffNeedsNote(diff) ? ' crozzo-cierre-hist-row--warn' : '';
        var notes = String(r.notes || '').trim();
        if (notes.length > 48) notes = notes.slice(0, 45) + '…';
        var diffBadge =
          '<span class="crozzo-cierre-diff-badge ' +
          (diff >= 0 ? 'crozzo-cierre-diff-badge--ok' : 'crozzo-cierre-diff-badge--bad') +
          '">' +
          formatMoney(diff) +
          (diffNeedsNote(diff) ? ' <span aria-hidden="true">⚠</span>' : '') +
          '</span>';
        var base =
          '<tr class="crozzo-cierre-hist-row' +
          rowCls +
          '"><td><span class="crozzo-cierre-hist-date">' +
          esc(r.businessDate || '—') +
          '</span></td><td><span class="crozzo-cierre-hist-turn">' +
          esc(lbl) +
          (r.autoClosed ? ' <span class="crozzo-cierre-auto">auto</span>' : '') +
          integrityBadgeHtml(r) +
          '</span></td><td>' +
          String(r.salesCount ?? '—') +
          '</td><td class="crozzo-cierre-hist-money">' +
          formatMoney(r.totalSales) +
          '</td>';
        if (full) {
          base +=
            '<td class="crozzo-cierre-hist-money">' +
            formatMoney(r.expected) +
            '</td><td class="crozzo-cierre-hist-money">' +
            formatMoney(r.actual) +
            '</td>';
        }
        base += '<td>' + diffBadge + '</td>';
        if (full) {
          base +=
            '<td class="crozzo-cierre-notes" title="' +
            esc(String(r.notes || '')) +
            '">' +
            esc(notes || '—') +
            '</td><td class="crozzo-cierre-notes"><span class="crozzo-cierre-hist-user">' +
            esc(r.closedBy || '—') +
            '</span></td>';
        }
        base +=
          '<td class="crozzo-cierre-hist-time">' +
          esc(r.closedAt ? new Date(r.closedAt).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : '—') +
          '</td></tr>';
        return base;
      })
      .join('');
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function refreshIfVisible() {
    refreshCierrePageIfActive();
  }

  function selectedArqueoType() {
    var el = document.querySelector('input[name="crozzo-arqueo-type"]:checked');
    return el ? el.value : 'manana';
  }

  function openArqueoForType(forcedType) {
    if (!canPerformArqueo()) {
      if (typeof showToast === 'function') showToast('Solo administradores y encargados pueden hacer arqueo', 'warning');
      return;
    }
    var day = crozzoDaySessionEnsure();
    if (day.closedAt) {
      if (typeof showToast === 'function') showToast('El día operativo ya está cerrado', 'info');
      return;
    }
    var type = forcedType || day.activeShift || 'manana';
    var radio = document.querySelector('input[name="crozzo-arqueo-type"][value="' + type + '"]');
    if (radio) radio.checked = true;
    refreshArqueoSummary(type);
    arqueoGoStep(1);
    var ov = document.getElementById('crozzo-shift-arqueo');
    if (ov) {
      ov.hidden = false;
      ov.classList.add('is-open');
    }
    try {
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons({ nodes: [ov] });
    } catch (_) {}
    setTimeout(function () {
      var cnt = document.getElementById('crozzo-shift-count');
      if (cnt) cnt.focus();
    }, 80);
  }

  function openArqueo() {
    openArqueoForType(null);
  }

  function refreshArqueoSummary(type) {
    var m = metricsForScope(type);
    var sh = m.shift;
    var sum = document.getElementById('crozzo-shift-summary');
    var suggested = suggestedFondoForShift(type);
    if (sum) {
      var meta = SHIFT_META[type] || { label: type };
      var fondoHint =
        suggested > 0 && (!sh.cashOpen || Number(sh.cashOpen) === 0)
          ? '<div class="crozzo-arqueo-live__hint">Fondo sugerido (cierre anterior): <strong>' +
            formatMoney(suggested) +
            '</strong></div>'
          : '';
      sum.innerHTML =
        '<div class="crozzo-arqueo-live">' +
        '<div class="crozzo-arqueo-live__row"><span>Turno</span><strong>' +
        esc(meta.label) +
        '</strong></div>' +
        '<div class="crozzo-arqueo-live__row"><span>Día operativo</span><strong>' +
        esc(m.day.businessDate) +
        '</strong></div>' +
        '<div class="crozzo-arqueo-live__row"><span>Ventas</span><strong>' +
        m.count +
        ' · ' +
        formatMoney(m.total) +
        '</strong></div>' +
        '<div class="crozzo-arqueo-live__row crozzo-arqueo-live__row--cash"><span>Efectivo en ventas</span><strong>' +
        formatMoney(m.cash) +
        '</strong></div>' +
        fondoHint +
        '</div>';
    }
    var fondo = document.getElementById('crozzo-shift-fondo');
    var cnt = document.getElementById('crozzo-shift-count');
    if (fondo) {
      var fv = Number(sh.cashOpen) || suggested || 0;
      fondo.value = String(fv);
    }
    if (cnt) cnt.value = '';
  }

  function closeArqueo() {
    var ov = document.getElementById('crozzo-shift-arqueo');
    if (ov) {
      ov.hidden = true;
      ov.classList.remove('is-open');
    }
    __arqueoPending = null;
  }

  function arqueoGoStep(n) {
    document.querySelectorAll('.crozzo-shift-step').forEach(function (el) {
      el.classList.remove('is-active');
    });
    var t = document.getElementById(n === 2 ? 'crozzo-shift-step2' : 'crozzo-shift-step1');
    if (t) t.classList.add('is-active');
    document.querySelectorAll('.crozzo-arqueo-wizard__step').forEach(function (el, i) {
      el.classList.toggle('is-done', i + 1 < n);
      el.classList.toggle('is-active', i + 1 === n);
    });
  }

  function calcArqueo() {
    if (!canPerformArqueo()) return;
    var type = selectedArqueoType();
    var m = metricsForScopeDetailed(type);
    var sh = m.shift;
    var fondo = Number(document.getElementById('crozzo-shift-fondo') && document.getElementById('crozzo-shift-fondo').value) || 0;
    var actual = Number(document.getElementById('crozzo-shift-count') && document.getElementById('crozzo-shift-count').value);
    if (!Number.isFinite(actual)) {
      if (typeof showToast === 'function') showToast('Ingresa el efectivo contado en caja', 'warning');
      return;
    }
    sh.cashOpen = fondo;
    saveTurn(sh);
    var expected = fondo + m.cash;
    var diff = actual - expected;
    __arqueoPending = {
      shiftType: type,
      shiftLabel: (SHIFT_META[type] && SHIFT_META[type].label) || type,
      businessDate: m.day.businessDate,
      fondo: fondo,
      expected: expected,
      actual: actual,
      diff: diff,
      salesCount: m.count,
      totalSales: m.total,
      cashSales: m.cash,
      byMethod: m.byMethod,
      shiftId: sh.id,
      openedAt: sh.openedAt,
      _metrics: m,
    };
    var fin = document.getElementById('crozzo-shift-final');
    if (fin) {
      var alertNote = diffNeedsNote(diff)
        ? '<div class="crozzo-arqueo-alert crozzo-arqueo-alert--warn"><i data-lucide="alert-triangle"></i> Diferencia significativa: debes escribir una nota antes de confirmar.</div>'
        : '';
      var unpaidAlert = '';
      try {
        if (typeof global.crozzoGetUnpaidSlotsReport === 'function') {
          var unpaid = global.crozzoGetUnpaidSlotsReport();
          if (unpaid && unpaid.length) {
            var lines = unpaid
              .map(function (s) {
                return (s.tipo === 'mesa' ? 'Mesa ' : 'Llevar ') + s.id + ' ($' + Math.round(s.total).toLocaleString('es-CO') + ')';
              })
              .join(', ');
            unpaidAlert =
              '<div class="crozzo-arqueo-alert crozzo-arqueo-alert--warn"><i data-lucide="alert-triangle"></i> ' +
              unpaid.length +
              ' mesa(s)/pedido(s) con consumo sin cobrar: ' +
              esc(lines) +
              '. Revise antes de cerrar turno.</div>';
          }
        }
        if (typeof global.crozzoGetCobroAbortadosReport === 'function') {
          var aborts = global.crozzoGetCobroAbortadosReport(20);
          if (aborts && aborts.length) {
            var sum = aborts.reduce(function (a, e) {
              var m = String(e.detalle || '').match(/\$([\d.,]+)/);
              return a + (m ? Number(String(m[1]).replace(/\./g, '').replace(',', '.')) || 0 : 0);
            }, 0);
            unpaidAlert +=
              '<div class="crozzo-arqueo-alert crozzo-arqueo-alert--warn"><i data-lucide="alert-triangle"></i> ' +
              aborts.length +
              ' cobro(s) cancelado(s) sin registrar' +
              (sum > 0 ? ' (~$' + Math.round(sum).toLocaleString('es-CO') + ')' : '') +
              '. Verifique efectivo en caja y auditoría.</div>';
          }
        }
      } catch (_) {}
      fin.innerHTML =
        '<div class="crozzo-arqueo-result">' +
        '<div class="crozzo-arqueo-result__head">Cierre <strong>' +
        esc(__arqueoPending.shiftLabel) +
        '</strong></div>' +
        '<div class="crozzo-arqueo-result__grid">' +
        '<div><span>Esperado</span><strong>' +
        formatMoney(expected) +
        '</strong></div>' +
        '<div><span>Contado</span><strong>' +
        formatMoney(actual) +
        '</strong></div>' +
        '<div class="crozzo-arqueo-result__delta"><span>Diferencia</span><strong class="' +
        (diff >= 0 ? 'crozzo-cierre-diff--ok' : 'crozzo-cierre-diff--bad') +
        '">' +
        (diff >= 0 ? '+' : '−') +
        formatMoney(Math.abs(diff)) +
        '</strong></div></div>' +
        unpaidAlert +
        alertNote +
        '</div>';
      try {
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons({ nodes: [fin] });
      } catch (_) {}
    }
    var notes = document.getElementById('crozzo-shift-notes');
    if (notes) notes.value = '';
    arqueoGoStep(2);
  }

  function closeShiftSlot(day, type, closedAt) {
    if (!day.shifts[type]) day.shifts[type] = defaultShiftSlot(type);
    day.shifts[type].status = 'closed';
    day.shifts[type].closedAt = closedAt;
    if (type === 'manana' && day.shifts.tarde && day.shifts.tarde.status === 'pending') {
      day.activeShift = 'tarde';
      day.shifts.tarde.status = 'open';
      day.shifts.tarde.openedAt = closedAt;
    }
  }

  function finalizeArqueo() {
    if (!canPerformArqueo()) return;
    if (!__arqueoPending) {
      if (typeof showToast === 'function') showToast('Calcula la diferencia primero', 'warning');
      return;
    }
    var notes = String(document.getElementById('crozzo-shift-notes') && document.getElementById('crozzo-shift-notes').value || '').trim();
    if (diffNeedsNote(__arqueoPending.diff) && !notes) {
      if (typeof showToast === 'function') {
        showToast(
          'Diferencia ≥ ' +
            formatMoney(getShiftSettings().diffAlertThreshold) +
            ': escribe una nota explicando el faltante o sobrante',
          'warning'
        );
      }
      return;
    }
    if (
      !global.__crozzoSkipNoviceArqueoGuard &&
      global.CrozzoOnboardingOperativo &&
      typeof global.CrozzoOnboardingOperativo.needsNoviceArqueoConfirm === 'function' &&
      global.CrozzoOnboardingOperativo.needsNoviceArqueoConfirm(__arqueoPending.diff) &&
      typeof global.CrozzoOnboardingOperativo.confirmNoviceArqueo === 'function'
    ) {
      global.CrozzoOnboardingOperativo.confirmNoviceArqueo(__arqueoPending, finalizeArqueoCore);
      return;
    }
    finalizeArqueoCore();
  }

  function finalizeArqueoCore() {
    if (!__arqueoPending) return;
    var notes = String(document.getElementById('crozzo-shift-notes') && document.getElementById('crozzo-shift-notes').value || '').trim();
    var metrics = __arqueoPending._metrics || metricsForScopeDetailed(__arqueoPending.shiftType);
    var rec = enrichCierreRecord(
      Object.assign({}, __arqueoPending, {
        closedAt: new Date().toISOString(),
        notes: notes,
        autoClosed: false,
      }),
      metrics
    );
    delete rec._metrics;
    appendHistory(rec);
    audit(
      'cierre_turno',
      rec.shiftLabel +
        ' ' +
        rec.businessDate +
        ' · ' +
        (rec.closedBy || '—') +
        ': contado ' +
        formatMoney(rec.actual) +
        ' vs ' +
        formatMoney(rec.expected) +
        ' (Δ ' +
        formatMoney(rec.diff) +
        ')' +
        (notes ? ' · ' + notes : '')
    );
    if (diffNeedsNote(rec.diff) && typeof showToast === 'function') {
      showToast('Cierre registrado con diferencia significativa — revisar en historial', 'warning');
    }
    queueCloudSync(rec);
    var pl = pushCierreToPlanilla(rec);
    if (pl && pl.ok && typeof showToast === 'function') {
      showToast('Cierre enviado a planilla · ' + rec.businessDate, 'info');
    }

    var day = readDaySession();
    if (day) {
      closeShiftSlot(day, rec.shiftType, rec.closedAt);
      if (rec.shiftType === 'dia') {
        day.closedAt = rec.closedAt;
        day.autoClosed = false;
        ['manana', 'tarde', 'dia'].forEach(function (k) {
          if (!day.shifts[k]) day.shifts[k] = defaultShiftSlot(k);
          day.shifts[k].status = 'closed';
          if (!day.shifts[k].closedAt) day.shifts[k].closedAt = rec.closedAt;
        });
      }
      writeDaySession(day);
    }

    saveTurn(newTurnRecord());
    __arqueoPending = null;
    closeArqueo();
    invalidateCierreCaches();
    refreshCierrePageIfActive(true);
    var msg =
      rec.shiftType === 'dia'
        ? 'Día cerrado. Mañana el contador reinicia en cero.'
        : 'Turno ' + rec.shiftLabel + ' cerrado. Resumen guardado.';
    if (typeof showToast === 'function') showToast(msg, 'success');
    if (typeof showToast === 'function') {
      setTimeout(function () {
        showToast('Datos disponibles en Planilla → Propinas y cierre', 'info');
      }, 1200);
    }
    try {
      if (global.CrozzoOperativePsyche && typeof global.CrozzoOperativePsyche.onShiftClose === 'function') {
        global.CrozzoOperativePsyche.onShiftClose(rec);
      }
    } catch (_) {}
  }

  function nuevoTurnoSinArqueo() {
    if (!canPerformArqueo()) {
      if (typeof showToast === 'function') showToast('Solo encargados pueden reiniciar turno sin arqueo', 'warning');
      return;
    }
    if (typeof isSuperAdminUser === 'function' && !isSuperAdminUser()) {
      if (typeof showToast === 'function') showToast('Reinicio sin arqueo: solo Super Admin', 'warning');
      audit('turno_reiniciado_denegado', 'Intento de reinicio sin arqueo sin permiso superadmin');
      return;
    }
    if (!confirm('¿Reiniciar contador del turno actual sin arqueo? Use solo en emergencia. Quedará registrado en auditoría.')) return;
    saveTurn(newTurnRecord());
    refreshCierrePageIfActive();
    if (typeof showToast === 'function') showToast('Contador de turno reiniciado', 'success');
    audit('turno_reiniciado', 'Reinicio manual sin arqueo (superadmin)');
  }

  function renderShiftCard(k, meta, can) {
    var click =
      can && k !== 'dia'
        ? ' onclick="crozzoShiftOpenArqueoType(\'' + k + '\')" title="Abrir arqueo de ' + esc(meta.label) + '"'
        : can && k === 'dia'
          ? ' onclick="crozzoShiftOpenArqueoType(\'dia\')" title="Cerrar día completo"'
          : '';
    var action =
      can
        ? '<button type="button" class="crozzo-cierre-shift-card__go" aria-hidden="true"><i data-lucide="arrow-right"></i></button>'
        : '';
    return (
      '<article class="crozzo-cierre-shift-card" data-shift-card="' +
      k +
      '"' +
      click +
      '>' +
      '<div class="crozzo-cierre-shift-card__icon"><i data-lucide="' +
      meta.icon +
      '"></i></div>' +
      '<div class="crozzo-cierre-shift-card__body">' +
      '<div class="crozzo-cierre-shift-card__head">' +
      '<div class="crozzo-cierre-shift-card__title">' +
      meta.label +
      '</div>' +
      '<span class="crozzo-cierre-shift-card__pill" id="crozzo-cierre-pill-' +
      k +
      '">—</span></div>' +
      '<div class="crozzo-cierre-shift-card__val" id="crozzo-cierre-card-' +
      k +
      '">$0</div>' +
      '<div class="crozzo-cierre-shift-card__sub" id="crozzo-cierre-card-sub-' +
      k +
      '">—</div>' +
      '<div class="crozzo-cierre-shift-card__cash" id="crozzo-cierre-card-cash-' +
      k +
      '">Efectivo $0</div></div>' +
      action +
      '</article>'
    );
  }

  function renderCierrePanelHtml(opts) {
    opts = opts || {};
    var full = !!opts.full;
    var can = canPerformArqueo();
    var settings = getShiftSettings();
    var sync = cloudSyncLabel();
    var histSum = summarizeHistory(getHistoryRows());

    if (!full) {
      return (
        '<div class="crozzo-cierre-panel">' +
        '<div class="crozzo-cierre-panel__head">' +
        '<div><h3 class="crozzo-cierre-panel__title">Cierre de turnos</h3>' +
        '<p class="crozzo-cierre-panel__lead">Resumen operativo del día.</p></div>' +
        '<div class="crozzo-cierre-panel__actions">' +
        (can
          ? '<button type="button" class="btn btn-primary btn-sm" id="crozzo-cierre-btn-arqueo" onclick="crozzoShiftOpenArqueo()"><i data-lucide="vault"></i> Arqueo</button>'
          : '<span class="crozzo-cierre-badge-readonly">Solo lectura</span>') +
        '</div></div>' +
        '<div class="crozzo-cierre-kpi-grid" id="crozzo-cierre-kpis">' +
        '<div class="crozzo-cierre-kpi"><span class="lbl">Día</span><strong class="val" id="crozzo-cierre-kpi-date">—</strong></div>' +
        '<div class="crozzo-cierre-kpi"><span class="lbl">Ventas</span><strong class="val" id="crozzo-cierre-kpi-day-total">$0</strong></div>' +
        '<div class="crozzo-cierre-kpi"><span class="lbl">Tx</span><strong class="val" id="crozzo-cierre-kpi-day-count">0</strong></div>' +
        '<div class="crozzo-cierre-kpi"><span class="lbl">Turno</span><strong class="val" id="crozzo-cierre-kpi-shift">—</strong></div>' +
        '</div>' +
        '<div class="crozzo-rep-table-wrap crozzo-cierre-hist-wrap"><table class="crozzo-cierre-hist-table"><thead><tr>' +
        '<th>Fecha</th><th>Turno</th><th>Ventas</th><th>Total</th><th>Δ</th><th>Cerrado</th></tr></thead>' +
        '<tbody id="crozzo-cierre-hist-body"></tbody></table></div></div>'
      );
    }

    var histFilters = [
      { id: 'all', label: 'Todos' },
      { id: 'faltantes', label: 'Faltantes' },
      { id: 'alertas', label: 'Alertas' },
      { id: 'auto', label: 'Automáticos' },
    ]
      .map(function (f) {
        return (
          '<button type="button" class="crozzo-cierre-hist-filter' +
          (__histFilter === f.id ? ' is-active' : '') +
          '" data-filter="' +
          f.id +
          '" onclick="crozzoCierreHistFilter(\'' +
          f.id +
          '\')">' +
          esc(f.label) +
          '</button>'
        );
      })
      .join('');

    return (
      '<div class="crozzo-cierre-studio crozzo-cierre-panel crozzo-cierre-panel--full">' +
      '<header class="crozzo-cierre-hero">' +
      '<div class="crozzo-cierre-hero__glow" aria-hidden="true"></div>' +
      '<div class="crozzo-cierre-hero__main">' +
      '<span class="crozzo-cierre-hero__eyebrow"><i data-lucide="shield-check"></i> Control ejecutivo de caja</span>' +
      '<h2 class="crozzo-cierre-hero__title">Cierre · Turnos · Arqueo</h2>' +
      '<p class="crozzo-cierre-hero__sub">Cuadre en tiempo real, trazabilidad por encargado y huella de comprobantes. Diferencias ≥ ' +
      formatMoney(settings.diffAlertThreshold) +
      ' exigen nota.</p>' +
      '</div>' +
      '<div class="crozzo-cierre-hero__aside">' +
      '<div class="crozzo-cierre-day-status" id="crozzo-cierre-day-status">Día operativo abierto</div>' +
      '<div class="crozzo-cierre-sync ' +
      sync.cls +
      '" id="crozzo-cierre-sync-label"><span class="crozzo-cierre-sync__dot"></span>' +
      esc(sync.text) +
      '</div></div>' +
      '<div class="crozzo-cierre-hero__actions crozzo-cierre-panel__actions">' +
      (can
        ? '<button type="button" class="btn btn-primary crozzo-cierre-cta" id="crozzo-cierre-btn-arqueo" onclick="crozzoShiftOpenArqueo()"><i data-lucide="vault"></i> Iniciar arqueo</button>'
        : '<span class="crozzo-cierre-badge-readonly"><i data-lucide="eye"></i> Solo lectura — encargado</span>') +
      (can
        ? '<button type="button" class="btn btn-outline" onclick="typeof crozzoRepExportTurnos===\'function\'&&crozzoRepExportTurnos()"><i data-lucide="download"></i> Exportar</button>'
        : '') +
      '<button type="button" class="btn btn-outline" onclick="navigateTo(\'planilla-2026\')"><i data-lucide="calculator"></i> Planilla</button>' +
      (can
        ? '<button type="button" class="btn btn-outline crozzo-cierre-btn-muted" onclick="crozzoShiftNuevoTurno()"><i data-lucide="rotate-ccw"></i> Emergencia</button>'
        : '') +
      (!can
        ? '<button type="button" class="btn btn-outline" onclick="typeof crozzoShowDeclaracionEfectivoModal===\'function\'&&crozzoShowDeclaracionEfectivoModal()"><i data-lucide="banknote"></i> Declarar efectivo</button>'
        : '') +
      '</div></header>' +
      renderStressBannerHtml(getRestaurantStress()) +
      '<details class="crozzo-cierre-guide" id="crozzo-cierre-guide">' +
      '<summary><i data-lucide="book-open"></i> Guía rápida · 1 día / 3 días / mes</summary>' +
      '<div class="crozzo-cierre-guide__body">' +
      '<div class="crozzo-cierre-guide__col"><strong>Restaurante pequeño</strong><ol>' +
      '<li>Pico suave: panel completo sin restricciones.</li>' +
      '<li>Cierre mañana/tarde al terminar servicio.</li></ol></div>' +
      '<div class="crozzo-cierre-guide__col"><strong>Mediano (rush comida)</strong><ol>' +
      '<li>Banner <em>Servicio intenso</em>: KPIs siguen, historial más lento.</li>' +
      '<li>Arqueo sí; exporte CSV después del pico.</li></ol></div>' +
      '<div class="crozzo-cierre-guide__col"><strong>Grande (crítico)</strong><ol>' +
      '<li>Modo ligero automático: no bloquea cobros ni comandas.</li>' +
      '<li>Use <em>Actualizar todo</em> o espere a que baje el ritmo.</li>' +
      '<li>Cierre día en hora valle (post-cierre cocina).</li></ol></div></div>' +
      '<div class="crozzo-cierre-guide__body crozzo-cierre-guide__body--admin">' +
      '<div class="crozzo-cierre-guide__col"><strong>Hoy (encargado nuevo)</strong><ol>' +
      '<li>Revise ventas del día en las tarjetas.</li>' +
      '<li>Mañana → <em>Iniciar arqueo</em> → cuente efectivo → confirme.</li>' +
      '<li>Repita tarde y cierre <em>Día completo</em>.</li>' +
      '<li>Si falta dinero ≥ ' +
      formatMoney(settings.diffAlertThreshold) +
      ', escriba nota obligatoria.</li></ol></div>' +
      '<div class="crozzo-cierre-guide__col"><strong>3 días (supervisor)</strong><ol>' +
      '<li>Filtro <em>Faltantes</em> en historial.</li>' +
      '<li>Exporte CSV y compare con Facturas.</li>' +
      '<li>Revise Auditoría → eventos <code>cierre_turno</code>.</li></ol></div>' +
      '<div class="crozzo-cierre-guide__col"><strong>1 mes (experto)</strong><ol>' +
      '<li>Export semanal CSV + respaldo nube <code>shift_closes</code>.</li>' +
      '<li>Detecte cierres <em>auto</em> sin conteo manual.</li>' +
      '<li>Balance neto histórico no debería driftear negativo.</li></ol></div></div></details>' +
      '<section class="crozzo-cierre-metrics" aria-label="Indicadores del día">' +
      '<article class="crozzo-cierre-metric crozzo-cierre-metric--accent"><span class="crozzo-cierre-metric__lbl"><i data-lucide="calendar"></i> Día operativo</span><strong class="crozzo-cierre-metric__val" id="crozzo-cierre-kpi-date">—</strong><span class="crozzo-cierre-metric__sub" id="crozzo-cierre-kpi-opened">—</span></article>' +
      '<article class="crozzo-cierre-metric"><span class="crozzo-cierre-metric__lbl"><i data-lucide="trending-up"></i> Ventas del día</span><strong class="crozzo-cierre-metric__val" id="crozzo-cierre-kpi-day-total">$0</strong><span class="crozzo-cierre-metric__sub" id="crozzo-cierre-kpi-ticket">Ticket prom. $0</span></article>' +
      '<article class="crozzo-cierre-metric"><span class="crozzo-cierre-metric__lbl"><i data-lucide="receipt"></i> Transacciones</span><strong class="crozzo-cierre-metric__val" id="crozzo-cierre-kpi-day-count">0</strong><span class="crozzo-cierre-metric__sub" id="crozzo-cierre-kpi-shift">Turno —</span></article>' +
      '<article class="crozzo-cierre-metric crozzo-cierre-metric--cash"><span class="crozzo-cierre-metric__lbl"><i data-lucide="banknote"></i> Efectivo</span><strong class="crozzo-cierre-metric__val" id="crozzo-cierre-kpi-cash">$0</strong><span class="crozzo-cierre-metric__sub" id="crozzo-cierre-kpi-cash-pct">—</span></article>' +
      '<article class="crozzo-cierre-metric"><span class="crozzo-cierre-metric__lbl"><i data-lucide="credit-card"></i> Otros medios</span><strong class="crozzo-cierre-metric__val" id="crozzo-cierre-kpi-noncash">$0</strong><span class="crozzo-cierre-metric__sub">Tarjeta · QR · PSE</span></article>' +
      '<article class="crozzo-cierre-metric crozzo-cierre-metric--audit"><span class="crozzo-cierre-metric__lbl"><i data-lucide="history"></i> Historial</span><strong class="crozzo-cierre-metric__val" id="crozzo-cierre-kpi-hist-count">' +
      String(histSum.total) +
      '</strong><span class="crozzo-cierre-metric__sub" id="crozzo-cierre-kpi-hist-sub">' +
      (histSum.faltantes ? histSum.faltantes + ' faltante(s)' : 'Sin faltantes') +
      '</span></article>' +
      '</section>' +
      '<div class="crozzo-cierre-grid">' +
      '<section class="crozzo-cierre-turnos" aria-label="Turnos del día">' +
      '<div class="crozzo-cierre-section-head"><h3>Turnos operativos</h3><p>Seleccione un turno para arqueo dirigido</p></div>' +
      '<div class="crozzo-cierre-shift-cards">' +
      ['manana', 'tarde', 'dia'].map(function (k) {
        return renderShiftCard(k, SHIFT_META[k], can);
      }).join('') +
      '</div>' +
      '<div class="crozzo-cierre-pay-block"><div class="crozzo-cierre-section-head crozzo-cierre-section-head--compact"><h4>Medios de pago · día</h4></div><div class="crozzo-cierre-pay-grid" id="crozzo-cierre-pay-grid">—</div></div>' +
      '</section>' +
      '<aside class="crozzo-cierre-aside" aria-label="Inteligencia de cierre">' +
      '<div class="crozzo-cierre-insight crozzo-cierre-insight--primary"><div class="crozzo-cierre-insight__icon"><i data-lucide="scale"></i></div><div><div class="crozzo-cierre-insight__title">Balance histórico</div><div class="crozzo-cierre-insight__val" id="crozzo-cierre-insight-net">' +
      formatMoney(histSum.netDiff) +
      '</div><div class="crozzo-cierre-insight__sub">Suma neta de Δ en cierres guardados</div></div></div>' +
      '<div class="crozzo-cierre-insight"><div class="crozzo-cierre-insight__icon"><i data-lucide="alert-triangle"></i></div><div><div class="crozzo-cierre-insight__title">Alertas registradas</div><div class="crozzo-cierre-insight__val" id="crozzo-cierre-insight-alert">' +
      String(histSum.alertas) +
      '</div><div class="crozzo-cierre-insight__sub">Diferencias ≥ ' +
      formatMoney(settings.diffAlertThreshold) +
      '</div></div></div>' +
      '<div class="crozzo-cierre-insight"><div class="crozzo-cierre-insight__icon"><i data-lucide="bot"></i></div><div><div class="crozzo-cierre-insight__title">Cierres automáticos</div><div class="crozzo-cierre-insight__val" id="crozzo-cierre-insight-auto">' +
      String(histSum.auto) +
      '</div><div class="crozzo-cierre-insight__sub">Sin conteo físico manual</div></div></div>' +
      '<div class="crozzo-cierre-trust"><div class="crozzo-cierre-trust__title"><i data-lucide="fingerprint"></i> Trazabilidad activa</div><ul class="crozzo-cierre-trust__list">' +
      '<li>Encargado y dispositivo en cada cierre</li>' +
      '<li>Huella <code>facturasHash</code> anti-manipulación</li>' +
      '<li>Replicación a nube cuando está configurada</li></ul>' +
      '<div class="crozzo-cierre-trust__meta" id="crozzo-cierre-trust-device">Dispositivo: —</div></div>' +
      '</aside></div>' +
      '<section class="crozzo-cierre-seguridad" aria-label="Alertas cajeros" id="crozzo-cierre-seguridad-wrap">' +
      '<div class="crozzo-cierre-section-head"><h3>Seguridad de cajeros</h3><p>Cobros cancelados y declaraciones de efectivo del turno</p></div>' +
      '<div id="crozzo-cierre-seguridad">—</div></section>' +
      '<section class="crozzo-cierre-history" aria-label="Historial de cierres">' +
      '<div class="crozzo-cierre-section-head crozzo-cierre-history__head">' +
      '<div><h3>Historial de cierres</h3><p id="crozzo-cierre-hist-caption">Registro auditable de arqueos confirmados</p></div>' +
      '<div class="crozzo-cierre-history__tools">' +
      '<div class="crozzo-cierre-hist-filters" role="toolbar">' +
      histFilters +
      '</div>' +
      '<div class="crozzo-cierre-hist-search"><i data-lucide="search"></i><input type="search" id="crozzo-cierre-hist-search" placeholder="Buscar fecha, turno, encargado…" value="' +
      esc(__histSearch) +
      '" oninput="crozzoCierreHistSearchDebounced(this.value)"></div></div></div>' +
      '<div class="crozzo-cierre-hist-stats" id="crozzo-cierre-hist-stats"></div>' +
      '<div class="crozzo-rep-table-wrap crozzo-cierre-hist-wrap"><table class="crozzo-cierre-hist-table"><thead><tr>' +
      '<th>Fecha op.</th><th>Turno</th><th>Ventas</th><th>Total</th><th>Esperado</th><th>Contado</th><th>Δ caja</th><th>Notas</th><th>Encargado</th><th>Cerrado</th></tr></thead>' +
      '<tbody id="crozzo-cierre-hist-body"></tbody></table></div></section></div>'
    );
  }

  function renderCierrePageHtml() {
    return '<div class="crozzo-cierre-page-root" id="crozzo-cierre-page-root"><div id="crozzo-cierre-page-body"></div></div>';
  }

  var __visHooked = false;

  function hookCierreVisibilityRefresh() {
    if (__visHooked || typeof document === 'undefined') return;
    __visHooked = true;
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && typeof currentPage !== 'undefined' && currentPage === 'cierre-caja') {
        refreshCierrePanel({ full: true, force: true });
      }
    });
  }

  function forceFullCierreRefresh() {
    clearTimeout(__refreshDebounce);
    clearTimeout(__stressFullRefreshTimer);
    invalidateCierreCaches();
    refreshCierrePanel({ full: true, force: true });
    if (typeof showToast === 'function') showToast('Panel de cierre actualizado', 'success');
  }

  function mountCierrePage() {
    var body = document.getElementById('crozzo-cierre-page-body');
    if (!body) return;
    if (document.body) document.body.classList.add('crozzo-page-cierre-caja');
    hookCierreVisibilityRefresh();
    body.innerHTML = renderCierrePanelHtml({ full: true });
    refreshCierrePanel({ full: true });
    try {
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons({ nodes: [body] });
    } catch (_) {}
  }

  function renderCajeroSeguridadHtml() {
    var parts = [];
    try {
      if (typeof global.crozzoGetCobroAbortadosPorUsuario === 'function') {
        var alerts = global.crozzoGetCobroAbortadosPorUsuario({ hours: 24, minCount: 3 });
        if (alerts.length) {
          parts.push(
            '<div class="crozzo-cierre-seg-block crozzo-cierre-seg-block--warn"><h4><i data-lucide="alert-triangle"></i> Cobros cancelados sin registrar (24h)</h4><ul class="crozzo-cierre-seg-list">' +
              alerts
                .map(function (a) {
                  return (
                    '<li><strong>' +
                    esc(a.user) +
                    '</strong> · ' +
                    a.count +
                    ' cancelados · ~' +
                    formatMoney(a.total) +
                    ' · revisar auditoría</li>'
                  );
                })
                .join('') +
              '</ul></div>'
          );
        }
      }
      if (typeof config !== 'undefined' && config.get) {
        var decls = config.get('cajaDeclaracionesTurno') || [];
        if (Array.isArray(decls) && decls.length) {
          parts.push(
            '<div class="crozzo-cierre-seg-block"><h4><i data-lucide="banknote"></i> Declaraciones de efectivo</h4><ul class="crozzo-cierre-seg-list">' +
              decls
                .slice(0, 10)
                .map(function (d) {
                  var diff = Number(d.diff) || 0;
                  var diffCls = diff >= 0 ? 'crozzo-cierre-diff--ok' : 'crozzo-cierre-diff--bad';
                  return (
                    '<li><strong>' +
                    esc(d.user || '—') +
                    '</strong> · decl ' +
                    formatMoney(d.efectivoDeclarado) +
                    ' · esp ' +
                    formatMoney(d.efectivoEsperado) +
                    ' · <span class="' +
                    diffCls +
                    '">Δ ' +
                    formatMoney(diff) +
                    '</span>' +
                    (d.cobrosAbortadosSesion ? ' · ' + d.cobrosAbortadosSesion + ' abort.' : '') +
                    (d.notas ? ' · ' + esc(String(d.notas).slice(0, 40)) : '') +
                    '</li>'
                  );
                })
                .join('') +
              '</ul></div>'
          );
        }
      }
    } catch (_) {}
    if (!parts.length) {
      return '<p class="crozzo-cierre-seg-empty">Sin alertas de cajero ni declaraciones recientes.</p>';
    }
    return parts.join('');
  }

  function refreshHistorySection() {
    var histAll = getHistoryRows();
    var histFiltered = filterHistoryRows(histAll);
    var histSum = summarizeHistory(histAll);
    var cap = document.getElementById('crozzo-cierre-hist-caption');
    if (cap) {
      cap.textContent =
        histFiltered.length === histAll.length
          ? histAll.length + ' cierres auditable(s) en este equipo'
          : histFiltered.length + ' de ' + histAll.length + ' cierres (filtro activo)';
    }
    var statsEl = document.getElementById('crozzo-cierre-hist-stats');
    if (statsEl) {
      statsEl.innerHTML =
        '<span><strong>' +
        histFiltered.length +
        '</strong> visibles</span>' +
        '<span><strong>' +
        histSum.faltantes +
        '</strong> faltantes totales</span>' +
        '<span>Balance neto <strong class="' +
        (histSum.netDiff < 0 ? 'crozzo-cierre-diff--bad' : 'crozzo-cierre-diff--ok') +
        '">' +
        formatMoney(histSum.netDiff) +
        '</strong></span>';
    }
    document.querySelectorAll('.crozzo-cierre-hist-filter').forEach(function (btn) {
      var f = btn.getAttribute('data-filter');
      btn.classList.toggle('is-active', f === __histFilter);
    });
    renderHistoryTable(document.getElementById('crozzo-cierre-hist-body'), { limit: 120, full: true });
  }

  function refreshCierrePanel(opts) {
    opts = opts || {};
    var full = !!opts.full;
    var light = !!opts.light && !opts.force;
    var stress = getRestaurantStress();
    updateStressBanner(stress);
    var snap = buildOperationalSnapshot();
    var day = snap.day;
    var dm = snap.dia;
    var am = snap.manana;
    var pm = snap.tarde;
    var histAll = getHistoryRows();
    var histSum = summarizeHistory(histAll);
    var histFiltered = full && !light ? filterHistoryRows(histAll) : histAll;
    var sync = cloudSyncLabel();
    var set = function (id, v) {
      var el = document.getElementById(id);
      if (el) el.textContent = v;
    };
    var setHtml = function (id, v) {
      var el = document.getElementById(id);
      if (el) el.innerHTML = v;
    };
    set('crozzo-cierre-kpi-date', day ? day.businessDate : '—');
    set('crozzo-cierre-kpi-day-total', formatMoney(dm.total));
    set('crozzo-cierre-kpi-day-count', String(dm.count));
    set('crozzo-cierre-kpi-shift', (SHIFT_META[day && day.activeShift] && SHIFT_META[day.activeShift].label) || '—');
    set('crozzo-cierre-kpi-cash', formatMoney(dm.cash));
    set('crozzo-cierre-kpi-noncash', formatMoney(dm.nonCash));
    set('crozzo-cierre-kpi-ticket', 'Ticket prom. ' + formatMoney(dm.ticket));
    set(
      'crozzo-cierre-kpi-cash-pct',
      dm.total > 0 ? Math.round((dm.cash / dm.total) * 100) + '% del total' : '—'
    );
    set('crozzo-cierre-kpi-hist-count', String(histSum.total));
    set(
      'crozzo-cierre-kpi-hist-sub',
      histSum.faltantes ? histSum.faltantes + ' faltante(s) · ' + formatMoney(histSum.netDiff) : 'Cuadre neto ' + formatMoney(histSum.netDiff)
    );
    if (day && day.openedAt) {
      try {
        set(
          'crozzo-cierre-kpi-opened',
          'Abierto ' + new Date(day.openedAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
        );
      } catch (_) {
        set('crozzo-cierre-kpi-opened', '—');
      }
    }
    set('crozzo-cierre-insight-net', formatMoney(histSum.netDiff));
    set('crozzo-cierre-insight-alert', String(histSum.alertas));
    set('crozzo-cierre-insight-auto', String(histSum.auto));
    var devId = getCierreDeviceId();
    set('crozzo-cierre-trust-device', devId ? 'Dispositivo: ' + devId.slice(0, 8) + '…' + devId.slice(-4) : 'Dispositivo: local');
    var syncEl = document.getElementById('crozzo-cierre-sync-label');
    if (syncEl) {
      syncEl.className = 'crozzo-cierre-sync ' + sync.cls;
      syncEl.innerHTML = '<span class="crozzo-cierre-sync__dot"></span>' + esc(sync.text);
    }
    setHtml('crozzo-cierre-pay-grid', light ? '<p class="crozzo-cierre-stress-pause">Medios de pago — actualización diferida en servicio crítico.</p>' : paymentMethodHtml(dm.byMethod));
    if (!light) setHtml('crozzo-cierre-seguridad', renderCajeroSeguridadHtml());
    var scopeMap = { manana: am, tarde: pm, dia: dm };
    Object.keys(scopeMap).forEach(function (k) {
      var m = scopeMap[k];
      set('crozzo-cierre-card-' + k, formatMoney(m.total));
      set('crozzo-cierre-card-cash-' + k, 'Efectivo ' + formatMoney(m.cash));
    });
    var sub = function (k, m, slot) {
      var el = document.getElementById('crozzo-cierre-card-sub-' + k);
      var pill = document.getElementById('crozzo-cierre-pill-' + k);
      if (el) {
        if (slot && slot.status === 'closed') el.textContent = m.count + ' ventas · Cerrado';
        else el.textContent = m.count + ' ventas · En curso';
      }
      if (pill) {
        if (slot && slot.status === 'closed') {
          pill.textContent = 'Cerrado';
          pill.className = 'crozzo-cierre-shift-card__pill is-closed';
        } else if (day && day.activeShift === k) {
          pill.textContent = 'Activo';
          pill.className = 'crozzo-cierre-shift-card__pill is-active';
        } else if (slot && slot.status === 'pending') {
          pill.textContent = 'Pendiente';
          pill.className = 'crozzo-cierre-shift-card__pill is-pending';
        } else {
          pill.textContent = 'Abierto';
          pill.className = 'crozzo-cierre-shift-card__pill';
        }
      }
    };
    if (day && day.shifts) {
      sub('manana', am, day.shifts.manana);
      sub('tarde', pm, day.shifts.tarde);
      sub('dia', dm, day.shifts.dia);
    }
    var statusEl = document.getElementById('crozzo-cierre-day-status');
    if (statusEl && day) {
      if (day.closedAt) {
        statusEl.innerHTML =
          '<i data-lucide="lock"></i> ' + (day.autoClosed ? 'Día cerrado automáticamente' : 'Día cerrado manualmente');
        statusEl.className = 'crozzo-cierre-day-status crozzo-cierre-day-status--closed';
      } else {
        var parts = [];
        if (day.shifts) {
          if (day.shifts.manana && day.shifts.manana.status === 'closed') parts.push('Mañana ✓');
          if (day.shifts.tarde && day.shifts.tarde.status === 'closed') parts.push('Tarde ✓');
        }
        statusEl.innerHTML = '<i data-lucide="unlock"></i> ' + (parts.length ? parts.join(' · ') : 'Día operativo abierto');
        statusEl.className = 'crozzo-cierre-day-status crozzo-cierre-day-status--open';
      }
    }
    var arqueoBtn = document.getElementById('crozzo-cierre-btn-arqueo');
    if (arqueoBtn) {
      arqueoBtn.disabled = !canPerformArqueo() || !!(day && day.closedAt);
    }
    var statsEl = document.getElementById('crozzo-cierre-hist-stats');
    if (statsEl && full && !light) {
      statsEl.innerHTML =
        '<span><strong>' +
        histFiltered.length +
        '</strong> visibles</span>' +
        '<span><strong>' +
        histSum.faltantes +
        '</strong> faltantes totales</span>' +
        '<span>Balance neto <strong class="' +
        (histSum.netDiff < 0 ? 'crozzo-cierre-diff--bad' : 'crozzo-cierre-diff--ok') +
        '">' +
        formatMoney(histSum.netDiff) +
        '</strong></span>';
    }
    var cap = document.getElementById('crozzo-cierre-hist-caption');
    if (cap && full && !light) {
      cap.textContent =
        histFiltered.length === histAll.length
          ? histAll.length + ' cierres auditable(s) en este equipo'
          : histFiltered.length + ' de ' + histAll.length + ' cierres (filtro activo)';
    }
    var histBody = document.getElementById('crozzo-cierre-hist-body');
    if (light && histBody) {
      histBody.innerHTML =
        '<tr><td colspan="10" class="crozzo-cierre-empty crozzo-cierre-stress-pause">' +
        '<strong>Historial en pausa</strong> — ' +
        esc(stress.label) +
        '. KPIs y arqueo siguen activos. Pulse <em>Actualizar todo</em> o espere a que baje el ritmo.</td></tr>';
    } else {
      renderHistoryTable(histBody, {
        limit: full ? 120 : 15,
        full: full,
      });
    }
    if (light) scheduleStressFullRefresh();
    document.querySelectorAll('.crozzo-cierre-shift-card').forEach(function (card) {
      var k = card.getAttribute('data-shift-card');
      card.classList.toggle('is-closed', !!(day && day.shifts && day.shifts[k] && day.shifts[k].status === 'closed'));
      card.classList.toggle('is-active-shift', !!(day && day.activeShift === k && !(day.shifts && day.shifts[k] && day.shifts[k].status === 'closed')));
      card.classList.toggle('is-clickable', canPerformArqueo() && !(day && day.closedAt));
    });
    var statusEl = document.getElementById('crozzo-cierre-day-status');
    if (statusEl && day && statusEl.querySelector('[data-lucide]')) {
      try {
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons({ nodes: [statusEl] });
      } catch (_) {}
    }
    var payGrid = document.getElementById('crozzo-cierre-pay-grid');
    if (payGrid && payGrid.querySelector('[data-lucide]')) {
      try {
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons({ nodes: [payGrid] });
      } catch (_) {}
    }
  }

  function setHistFilter(filter) {
    __histFilter = filter || 'all';
    refreshHistorySection();
  }

  function setHistSearchDebounced(q) {
    __histSearch = String(q || '');
    clearTimeout(__searchDebounce);
    __searchDebounce = setTimeout(refreshHistorySection, SEARCH_DEBOUNCE_MS);
  }

  function setHistSearch(q) {
    __histSearch = String(q || '');
    refreshHistorySection();
  }

  function boot() {
    crozzoDaySessionEnsure();
    ensureTurn();
  }

  function noop() {}

  /* Globals (compat HTML + PosMain) */
  global.CROZZO_SHIFT_TURN_LS = LS_TURN;
  global.CROZZO_SHIFT_TURN_HIST = LS_HIST;
  global.CrozzoCierreTurnos = {
    boot: boot,
    ensureDay: crozzoDaySessionEnsure,
    metrics: crozzoShiftMetrics,
    dayMetrics: crozzoDaySalesMetrics,
    filterOperationalDay: crozzoRepFilterFacturasOperationalDay,
    canArqueo: canPerformArqueo,
    renderPanel: renderCierrePanelHtml,
    renderPage: renderCierrePageHtml,
    mountPage: mountCierrePage,
    refreshPanel: refreshCierrePanel,
    getRestaurantStress: getRestaurantStress,
    verifyCierreIntegrity: verifyCierreIntegrity,
    appendHistory: appendHistory,
    getHistory: function () {
      try {
        return JSON.parse(localStorage.getItem(LS_HIST) || '[]');
      } catch (_) {
        return [];
      }
    },
  };

  global.crozzoShiftLoginBlocking = loginBlocking;
  global.crozzoShiftLowStockProducts = lowStockProducts;
  global.crozzoShiftNewTurnRecord = newTurnRecord;
  global.crozzoShiftLoadTurn = loadTurn;
  global.crozzoShiftSaveTurn = saveTurn;
  global.crozzoShiftEnsureTurn = ensureTurn;
  global.crozzoShiftFacturaTs = facturaTs;
  global.crozzoShiftMetrics = crozzoShiftMetrics;
  global.crozzoShiftUpdateDashboardDom = refreshCierrePageIfActive;
  global.crozzoShiftRefreshDashboardIfVisible = refreshIfVisible;
  global.crozzoShiftOnSaleRecorded = onSaleRecorded;
  global.crozzoShiftToggleDashboard = noop;
  global.crozzoShiftSyncFabVisibility = noop;
  global.crozzoShiftAppendHistory = appendHistory;
  global.crozzoShiftNuevoTurno = nuevoTurnoSinArqueo;
  global.crozzoShiftOpenArqueo = openArqueo;
  global.crozzoShiftOpenArqueoType = openArqueoForType;
  global.crozzoShiftCloseArqueo = closeArqueo;
  global.crozzoShiftArqueoGoStep = arqueoGoStep;
  global.crozzoShiftCalcArqueo = calcArqueo;
  global.crozzoShiftFinalize = finalizeArqueo;
  global.crozzoShiftGetRestaurantStress = getRestaurantStress;
  global.crozzoCierreHistFilter = setHistFilter;
  global.crozzoCierreHistSearch = setHistSearch;
  global.crozzoCierreHistSearchDebounced = setHistSearchDebounced;
  global.crozzoCierreInvalidateCaches = invalidateCierreCaches;
  global.crozzoCierreForceFullRefresh = forceFullCierreRefresh;
  global.crozzoRepFilterFacturasOperationalDay = crozzoRepFilterFacturasOperationalDay;

  global.addEventListener('change', function (e) {
    if (e.target && e.target.name === 'crozzo-arqueo-type') refreshArqueoSummary(e.target.value);
  });
})(typeof window !== 'undefined' ? window : globalThis);
