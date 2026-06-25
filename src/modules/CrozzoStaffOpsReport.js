/**
 * Crozzo POS — Reportes operativos de equipo (meseros, cajeros, faltas cocina).
 */
(function (global) {
  'use strict';

  var FAULTS_KEY = 'staffFaultLog';
  var SESSIONS_KEY = 'staffSessionLog';
  var MESA_SESSION_KEY = 'mesaSessionLog';
  var CAJA_CHECKOUT_KEY = 'cajaCheckoutLog';
  var OPEN_SESS_KEY = 'crozzo_staff_ops_open_sess';
  var FAULT_LIMIT = 600;
  var SESS_LIMIT = 400;
  var MESA_SESS_LIMIT = 800;
  var CAJA_CHECKOUT_LIMIT = 1500;
  var openMesas = {};
  var VOID_TYPES = {
    remove_line: 1,
    anular_comandado: 1,
    clear_pending: 1,
    clear_all: 1,
    tablet_remove_line: 1,
    tablet_qty_down: 1,
    qty_down: 1,
  };

  function cfg() {
    return typeof global.config !== 'undefined' ? global.config : null;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }

  function businessDate() {
    try {
      if (typeof global.crozzoRepReadDaySessionBasico === 'function') {
        var day = global.crozzoRepReadDaySessionBasico();
        if (day && day.businessDate) return String(day.businessDate);
      }
    } catch (_) {}
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function dayRangeFromBusinessDate(bd) {
    var parts = String(bd || businessDate()).split('-');
    var y = num(parts[0]) || new Date().getFullYear();
    var m = (num(parts[1]) || 1) - 1;
    var day = num(parts[2]) || 1;
    var start = new Date(y, m, day).getTime();
    return { start: start, end: start + 86400000, key: bd || businessDate() };
  }

  function getStaffList() {
    try {
      if (typeof global.getActiveStaff === 'function') return global.getActiveStaff() || [];
      if (typeof global.getUsuariosConfig === 'function') {
        var u = global.getUsuariosConfig();
        return (u && u.staff) || [];
      }
    } catch (_) {}
    return [];
  }

  function normalizeRol(r) {
    if (typeof global.crozzoNormalizeAppRol === 'function') return global.crozzoNormalizeAppRol(r);
    return String(r || '').toLowerCase();
  }

  function pushConfigList(key, entry, limit) {
    var c = cfg();
    if (!c || typeof c.get !== 'function' || typeof c.set !== 'function') return;
    var list = c.get(key) || [];
    if (!Array.isArray(list)) list = [];
    list.unshift(entry);
    if (list.length > limit) list.length = limit;
    c.set(key, list);
  }

  function onLogin(user) {
    if (!user || !user.id) return;
    try {
      sessionStorage.setItem(
        OPEN_SESS_KEY,
        JSON.stringify({
          userId: user.id,
          userName: String(user.nombre || user.id),
          rol: normalizeRol(user.rol),
          loginAt: new Date().toISOString(),
          businessDate: businessDate(),
        })
      );
    } catch (_) {}
  }

  function onLogout() {
    var open = null;
    try {
      open = JSON.parse(sessionStorage.getItem(OPEN_SESS_KEY) || 'null');
    } catch (_) {}
    try {
      sessionStorage.removeItem(OPEN_SESS_KEY);
    } catch (_) {}
    if (!open || !open.userId) return;
    var loginTs = new Date(open.loginAt).getTime();
    var now = Date.now();
    pushConfigList(
      SESSIONS_KEY,
      {
        userId: open.userId,
        userName: open.userName,
        rol: open.rol,
        loginAt: open.loginAt,
        logoutAt: new Date(now).toISOString(),
        durationMs: Math.max(0, now - (isFinite(loginTs) ? loginTs : now)),
        businessDate: open.businessDate || businessDate(),
      },
      SESS_LIMIT
    );
  }

  function stampFacturaCobrador(factura) {
    if (!factura) return factura;
    var u = typeof global.getCurrentUser === 'function' ? global.getCurrentUser() : null;
    if (!u) return factura;
    factura.cobradoPorId = u.id;
    factura.cobradoPorNombre = String(u.nombre || u.id);
    factura.cobradoPorRol = normalizeRol(u.rol);
    return factura;
  }

  function mesaGroupKeyFromComanda(c) {
    if (!c) return '';
    if (c.mesaGroupKey) return String(c.mesaGroupKey);
    if (typeof global.crozzoComandaMesaGroupKeyFrom === 'function') {
      return global.crozzoComandaMesaGroupKeyFrom(c.tipoServicio, c.referencia, c.areaId);
    }
    return String(c.tipoServicio || '') + '|' + String(c.referencia || '');
  }

  /** 1 mesa = 1 falta por día operativo (aunque cocina llame varias veces). */
  function registerKitchenFault(call, comanda) {
    if (!call || !comanda) return { counted: false, reason: 'sin_datos' };
    var c = cfg();
    if (!c) return { counted: false, reason: 'sin_config' };
    var bd = businessDate();
    var mesaKey = mesaGroupKeyFromComanda(comanda);
    if (!mesaKey || String(comanda.tipoServicio || '').toLowerCase() !== 'mesa') {
      return { counted: false, reason: 'no_mesa' };
    }
    var list = c.get(FAULTS_KEY) || [];
    if (!Array.isArray(list)) list = [];
    var dup = list.some(function (f) {
      return f && f.businessDate === bd && f.mesaGroupKey === mesaKey && f.tipo === 'llamado_cocina';
    });
    if (dup) return { counted: false, reason: 'duplicado_mesa' };
    var destinoId = String(call.destinoId || comanda.creadoPor || '');
    var destinoNombre = String(call.destinoNombre || comanda.creadoPorNombre || '');
    pushConfigList(
      FAULTS_KEY,
      {
        at: new Date().toISOString(),
        businessDate: bd,
        tipo: 'llamado_cocina',
        mesaGroupKey: mesaKey,
        mesaRef: String(comanda.referencia || ''),
        comandaId: comanda.id,
        destinoId: destinoId,
        destinoNombre: destinoNombre,
        origenNombre: String(call.origenNombre || 'Cocina'),
      },
      FAULT_LIMIT
    );
    if (c.addAudit) {
      c.addAudit(
        'mesero_falta_cocina',
        (destinoNombre || destinoId || 'mesero') + ' · mesa ' + (comanda.referencia || mesaKey) + ' · 1 falta (llamado cocina)'
      );
    }
    mesaTrackFaultForComanda(comanda);
    return { counted: true, reason: 'ok' };
  }

  function filterByDayRange(list, getTs, range) {
    return (list || []).filter(function (row) {
      var t = getTs(row);
      return isFinite(t) && t >= range.start && t < range.end;
    });
  }

  function formatMs(ms) {
    var m = Math.max(0, Math.round(num(ms) / 60000));
    if (m < 60) return m + ' min';
    var h = Math.floor(m / 60);
    var rm = m % 60;
    return h + ' h ' + rm + ' min';
  }

  function formatPct(part, total, digits) {
    if (typeof global.crozzoRepFormatPct === 'function') return global.crozzoRepFormatPct(part, total, digits);
    if (!total) return '0%';
    return Math.round((num(part) / num(total)) * 100) + '%';
  }

  function scoreClass(score) {
    if (score >= 75) return 'good';
    if (score >= 50) return 'warn';
    return 'bad';
  }

  function computeScore(base, faults, comandas, hoursMs) {
    var salesNorm = Math.min(100, base);
    var faultRate = comandas > 0 ? faults / comandas : faults > 0 ? 1 : 0;
    var faultScore = Math.max(0, 100 - faultRate * 120);
    var hours = Math.max(0.25, num(hoursMs) / 3600000);
    var prod = comandas > 0 ? Math.min(100, (comandas / hours) * 8) : 20;
    return Math.round(salesNorm * 0.45 + faultScore * 0.35 + prod * 0.2);
  }

  function collectComandas(range) {
    var live = typeof global.comandas !== 'undefined' && Array.isArray(global.comandas) ? global.comandas : [];
    var hist = typeof global.comandaHistory !== 'undefined' && Array.isArray(global.comandaHistory) ? global.comandaHistory : [];
    var all = live.concat(hist);
    return all.filter(function (c) {
      if (!c) return false;
      var t = new Date(c.createdAt || c.despachadaAt || 0).getTime();
      return isFinite(t) && t >= range.start && t < range.end;
    });
  }

  function collectFacturas(range) {
    var c = cfg();
    var all = c && c.getFacturas ? c.getFacturas() || [] : [];
    return all.filter(function (f) {
      var raw = f && (f.fecha || f.fechaEmision);
      var t = raw ? new Date(raw).getTime() : NaN;
      return isFinite(t) && t >= range.start && t < range.end;
    });
  }

  function collectVoidLog(range) {
    var c = cfg();
    var log = c ? c.get('cajaVoidLog') || [] : [];
    return filterByDayRange(Array.isArray(log) ? log : [], function (e) {
      return new Date(e.at || 0).getTime();
    }, range);
  }

  function collectFaults(range) {
    var c = cfg();
    var log = c ? c.get(FAULTS_KEY) || [] : [];
    return (Array.isArray(log) ? log : []).filter(function (f) {
      return f && f.businessDate === range.key;
    });
  }

  function collectSessions(range) {
    var c = cfg();
    var log = c ? c.get(SESSIONS_KEY) || [] : [];
    var open = null;
    try {
      open = JSON.parse(sessionStorage.getItem(OPEN_SESS_KEY) || 'null');
    } catch (_) {}
    var rows = (Array.isArray(log) ? log : []).filter(function (s) {
      return s && s.businessDate === range.key;
    });
    if (open && open.userId && open.businessDate === range.key) {
      rows.push({
        userId: open.userId,
        userName: open.userName,
        rol: open.rol,
        loginAt: open.loginAt,
        logoutAt: null,
        durationMs: Math.max(0, Date.now() - new Date(open.loginAt).getTime()),
        businessDate: open.businessDate,
        open: true,
      });
    }
    return rows;
  }

  function matchStaffId(staff, token) {
    if (!token) return '';
    var t = String(token).trim().toLowerCase();
    var hit = staff.find(function (s) {
      return String(s.id).toLowerCase() === t || String(s.nombre || '').trim().toLowerCase() === t;
    });
    return hit ? hit.id : token;
  }

  function formatMin(ms) {
    if (ms == null || !isFinite(ms)) return '—';
    return (Math.max(0, ms) / 60000).toFixed(1) + ' min';
  }

  function normalizeMesaId(raw) {
    var s = String(raw || '').trim();
    if (!s) return '';
    if (/^M\d+$/i.test(s)) return s.toUpperCase();
    var m = s.match(/(\d+)/);
    if (m) return 'M' + parseInt(m[1], 10);
    return s.toUpperCase();
  }

  function getMesaCatalog() {
    try {
      if (typeof global.mesasCaja !== 'undefined' && Array.isArray(global.mesasCaja)) {
        return global.mesasCaja.slice();
      }
    } catch (_) {}
    var out = [];
    for (var i = 1; i <= 40; i++) out.push({ id: 'M' + i, nombre: 'Mesa ' + i });
    return out;
  }

  function getMesaName(mesaId) {
    var id = normalizeMesaId(mesaId);
    var hit = getMesaCatalog().find(function (m) {
      return m.id === id;
    });
    return hit ? hit.nombre : 'Mesa ' + String(id).replace(/^M/i, '');
  }

  function inferMesaZona(mesaId) {
    var n = parseInt(String(mesaId).replace(/\D/g, ''), 10);
    if (!n || !isFinite(n)) return 'General';
    if (n <= 10) return 'Salón principal';
    if (n <= 20) return 'Centro';
    if (n <= 30) return 'Ventana / lateral';
    return 'Terraza / fondo';
  }

  function comandaMatchesMesa(c, mesaId) {
    if (!c || String(c.tipoServicio || '').toLowerCase() !== 'mesa') return false;
    return normalizeMesaId(c.referencia) === normalizeMesaId(mesaId);
  }

  function mesaOpenSession(mesaId) {
    var id = normalizeMesaId(mesaId);
    if (!id) return;
    if (openMesas[id]) {
      openMesas[id].lastAt = new Date().toISOString();
      return;
    }
    openMesas[id] = {
      openedAt: new Date().toISOString(),
      comandas: 0,
      faults: 0,
    };
  }

  function mesaTrackComanda(mesaId) {
    var id = normalizeMesaId(mesaId);
    if (!id) return;
    if (!openMesas[id]) mesaOpenSession(id);
    openMesas[id].comandas += 1;
  }

  function mesaTrackFaultForComanda(comanda) {
    if (!comanda || String(comanda.tipoServicio || '').toLowerCase() !== 'mesa') return;
    var id = normalizeMesaId(comanda.referencia);
    if (!id) return;
    if (!openMesas[id]) mesaOpenSession(id);
    openMesas[id].faults += 1;
  }

  function recordMesaSale(factura) {
    if (!factura || String(factura.tipoServicio || '').toLowerCase() !== 'mesa') return;
    var mesaId = normalizeMesaId(factura.mesa);
    if (!mesaId) return;
    var open = openMesas[mesaId];
    var closedTs = new Date(factura.fecha || factura.fechaEmision || Date.now()).getTime();
    var openedTs = open ? new Date(open.openedAt).getTime() : closedTs - 45 * 60000;
    pushConfigList(
      MESA_SESSION_KEY,
      {
        at: new Date(closedTs).toISOString(),
        businessDate: businessDate(),
        mesaId: mesaId,
        mesaNombre: getMesaName(mesaId),
        zona: inferMesaZona(mesaId),
        openedAt: new Date(openedTs).toISOString(),
        closedAt: new Date(closedTs).toISOString(),
        durationMs: Math.max(0, closedTs - openedTs),
        ventaTotal: num(factura.total),
        comandas: open ? open.comandas : 0,
        faults: open ? open.faults : 0,
      },
      MESA_SESS_LIMIT
    );
    delete openMesas[mesaId];
  }

  function collectMesaSessionLog(range) {
    var c = cfg();
    var log = c ? c.get(MESA_SESSION_KEY) || [] : [];
    return (Array.isArray(log) ? log : []).filter(function (s) {
      return s && s.businessDate === range.key;
    });
  }

  function collectCajaCheckouts(range) {
    var c = cfg();
    var log = c ? c.get(CAJA_CHECKOUT_KEY) || [] : [];
    return (Array.isArray(log) ? log : []).filter(function (e) {
      return e && e.businessDate === range.key;
    });
  }

  function collectDeclaraciones(range) {
    var c = cfg();
    var log = c ? c.get('cajaDeclaracionesTurno') || [] : [];
    return filterByDayRange(Array.isArray(log) ? log : [], function (e) {
      return new Date(e.at || 0).getTime();
    }, range);
  }

  function recordCajaCheckout(factura, opts) {
    opts = opts || {};
    if (!factura) return;
    var u = typeof global.getCurrentUser === 'function' ? global.getCurrentUser() : null;
    if (!u) return;
    var dur = opts.checkoutDurationMs;
    if (dur != null) {
      dur = Math.max(0, Math.min(45 * 60000, num(dur)));
    } else {
      dur = null;
    }
    pushConfigList(
      CAJA_CHECKOUT_KEY,
      {
        at: factura.fecha || factura.fechaEmision || new Date().toISOString(),
        businessDate: businessDate(),
        userId: u.id,
        userName: String(u.nombre || u.id),
        facturaUuid: factura.uuid || '',
        total: num(factura.total),
        metodo: String(factura.metodoPago || ''),
        tipoServicio: String(factura.tipoServicio || ''),
        checkoutDurationMs: dur,
        pendingCobroSlots: num(opts.pendingCobroSlots),
      },
      CAJA_CHECKOUT_LIMIT
    );
    try {
      if (global.CrozzoOperativeCajaAssist && typeof global.CrozzoOperativeCajaAssist.clearOrderOpen === 'function') {
        global.CrozzoOperativeCajaAssist.clearOrderOpen();
      }
      if (global.CrozzoOperativeCajaAssist && typeof global.CrozzoOperativeCajaAssist.onCheckout === 'function') {
        global.CrozzoOperativeCajaAssist.onCheckout();
      }
    } catch (_) {}
  }

  function estimateDwellBeforeSale(mesaId, saleTs, comandaList) {
    var windowMs = 5 * 3600000;
    var earliest = null;
    (comandaList || []).forEach(function (c) {
      if (!comandaMatchesMesa(c, mesaId)) return;
      var t = new Date(c.createdAt || 0).getTime();
      if (!isFinite(t) || t > saleTs || t < saleTs - windowMs) return;
      if (earliest == null || t < earliest) earliest = t;
    });
    if (earliest == null) return null;
    return Math.max(0, saleTs - earliest);
  }

  function acogedorLabel(score) {
    if (score >= 78) return 'Muy acogedora';
    if (score >= 58) return 'Acogedora';
    if (score >= 42) return 'Regular';
    return 'Poco acogedora';
  }

  function computeAcogedorScore(row, maxVentas) {
    var dwellScore = 50;
    if (row.avgDwellMin != null) {
      var d = row.avgDwellMin;
      if (d >= 35 && d <= 95) dwellScore = 100;
      else if (d >= 25 && d <= 110) dwellScore = 78;
      else if (d < 20) dwellScore = 28;
      else if (d > 130) dwellScore = 38;
      else dwellScore = 52;
    }
    var popScore = Math.min(100, row.ocupaciones * 12);
    var revScore = maxVentas > 0 ? Math.min(100, (row.ventasTotal / maxVentas) * 100) : row.ocupaciones > 0 ? 40 : 0;
    var faultPenalty = Math.min(40, row.faults * 8);
    return Math.round(dwellScore * 0.38 + popScore * 0.22 + revScore * 0.28 + Math.max(0, 100 - faultPenalty) * 0.12);
  }

  function buildMesaAdRecommendations(rows) {
    var recs = [];
    if (!rows.length) return recs;
    var active = rows.filter(function (r) {
      return r.ocupaciones > 0 || r.ventasTotal > 0;
    });
    if (!active.length) {
      recs.push({
        pri: 'info',
        text: 'Aún no hay rotación de mesas hoy — publique promoción de hora valle para llenar salón.',
      });
      return recs;
    }
    var topVentas = active.slice().sort(function (a, b) {
      return b.ventasTotal - a.ventasTotal;
    });
    var topAcog = active.slice().sort(function (a, b) {
      return b.acogedorScore - a.acogedorScore;
    });
    var maxVentas = topVentas[0].ventasTotal || 1;
    if (topVentas[0]) {
      recs.push({
        pri: 'star',
        text:
          '⭐ Destacar «' +
          topVentas[0].name +
          '» (' +
          topVentas[0].zona +
          ') en redes — $' +
          Math.round(topVentas[0].ventasTotal).toLocaleString('es-CO') +
          ' vendidos · ' +
          topVentas[0].ocupaciones +
          ' servicio(s) · experiencia «' +
          topVentas[0].acogedorLabel +
          '».',
      });
    }
    topAcog.slice(0, 2).forEach(function (r) {
      if (r.id === (topVentas[0] && topVentas[0].id)) return;
      if (r.acogedorScore < 58) return;
      recs.push({
        pri: 'cozy',
        text:
          '🛋️ Reservas / foto ambiente: «' +
          r.name +
          '» — permanencia ~' +
          (r.avgDwellMin != null ? r.avgDwellMin.toFixed(0) : '—') +
          ' min · ideal para campaña «momento acogedor».',
      });
    });
    active
      .filter(function (r) {
        return r.ocupaciones <= 1 && r.ticketAvg >= (active.reduce(function (a, x) { return a + x.ticketAvg; }, 0) / active.length) * 1.15;
      })
      .slice(0, 2)
      .forEach(function (r) {
        recs.push({
          pri: 'promo',
          text:
            '📣 Poca rotación pero ticket alto en «' +
            r.name +
            '» ($' +
            Math.round(r.ticketAvg).toLocaleString('es-CO') +
            ' promedio) — promueva reserva premium o menú especial en esa zona.',
        });
      });
    active
      .filter(function (r) {
        return r.ocupaciones >= 3 && r.avgDwellMin != null && r.avgDwellMin < 22;
      })
      .slice(0, 2)
      .forEach(function (r) {
        recs.push({
          pri: 'fast',
          text:
            '⚡ «' +
            r.name +
            '» rota rápido (' +
            r.avgDwellMin.toFixed(0) +
            ' min) — buena para happy hour / alto volumen; evite campaña «cena larga» ahí.',
        });
      });
    active
      .filter(function (r) {
        return r.acogedorScore < 42 && r.ocupaciones >= 2;
      })
      .slice(0, 2)
      .forEach(function (r) {
        recs.push({
          pri: 'warn',
          text:
            '🔧 Revisar «' +
            r.name +
            '» (' +
            r.zona +
            '): baja calidad percibida (tiempo, quejas cocina o ticket bajo). No priorizar en publicidad hasta mejorar.',
        });
      });
    var zonaMap = {};
    active.forEach(function (r) {
      if (!zonaMap[r.zona]) zonaMap[r.zona] = { ventas: 0, n: 0 };
      zonaMap[r.zona].ventas += r.ventasTotal;
      zonaMap[r.zona].n += 1;
    });
    var bestZona = Object.keys(zonaMap).sort(function (a, b) {
      return zonaMap[b].ventas - zonaMap[a].ventas;
    })[0];
    if (bestZona && zonaMap[bestZona].ventas > 0) {
      recs.push({
        pri: 'zone',
        text:
          '📍 Zona «' +
          bestZona +
          '» concentra ventas ($' +
          Math.round(zonaMap[bestZona].ventas).toLocaleString('es-CO') +
          ') — fotos y stories del ambiente de esa sección del salón.',
      });
    }
    return recs.slice(0, 8);
  }

  function computeMesaAnalytics(range) {
    var sessionLog = collectMesaSessionLog(range);
    var catalog = getMesaCatalog();
    var map = {};
    catalog.forEach(function (m) {
      map[m.id] = {
        id: m.id,
        name: m.nombre,
        zona: inferMesaZona(m.id),
        ocupaciones: 0,
        ventasTotal: 0,
        tickets: [],
        dwellMs: [],
        faults: 0,
        comandas: 0,
        isLive: false,
      };
    });
    var mesasFromSession = {};
    sessionLog.forEach(function (s) {
      var id = normalizeMesaId(s.mesaId);
      if (!map[id]) {
        map[id] = {
          id: id,
          name: s.mesaNombre || getMesaName(id),
          zona: s.zona || inferMesaZona(id),
          ocupaciones: 0,
          ventasTotal: 0,
          tickets: [],
          dwellMs: [],
          faults: 0,
          comandas: 0,
          isLive: false,
        };
      }
      var row = map[id];
      row.ocupaciones += 1;
      row.ventasTotal += num(s.ventaTotal);
      row.tickets.push(num(s.ventaTotal));
      row.faults += num(s.faults);
      row.comandas += num(s.comandas);
      mesasFromSession[id] = true;
      if (num(s.durationMs) > 0) row.dwellMs.push(num(s.durationMs));
    });
    var facturas = collectFacturas(range);
    var allComandas = collectComandas(range).concat(
      typeof global.comandas !== 'undefined' && Array.isArray(global.comandas)
        ? global.comandas.filter(function (c) {
            var t = new Date(c.createdAt || 0).getTime();
            return isFinite(t) && t >= range.start && t < range.end;
          })
        : []
    );
    facturas.forEach(function (f) {
      if (String(f.tipoServicio || '').toLowerCase() !== 'mesa') return;
      var id = normalizeMesaId(f.mesa);
      if (!id || !map[id]) return;
      if (mesasFromSession[id]) return;
      map[id].ocupaciones += 1;
      map[id].ventasTotal += num(f.total);
      map[id].tickets.push(num(f.total));
      var saleTs = new Date(f.fecha || f.fechaEmision || 0).getTime();
      var est = isFinite(saleTs) ? estimateDwellBeforeSale(id, saleTs, allComandas) : null;
      if (est != null && est > 60000) map[id].dwellMs.push(est);
    });
    allComandas.forEach(function (c) {
      if (!comandaMatchesMesa(c, c.referencia)) return;
      var id = normalizeMesaId(c.referencia);
      if (map[id]) map[id].comandas += 1;
    });
    var faults = collectFaults(range);
    faults.forEach(function (f) {
      var ref = String(f.mesaRef || '');
      var id = normalizeMesaId(ref.replace(/mesa\s*/i, 'M'));
      if (!id && f.mesaGroupKey) {
        var parts = String(f.mesaGroupKey).split('\x1e');
        if (parts[0] === 'mesa' && parts[1]) id = normalizeMesaId(parts[1]);
      }
      if (id && map[id]) map[id].faults += 1;
    });
    try {
      catalog.forEach(function (m) {
        if (typeof global.getSlotStateInfo === 'function') {
          var info = global.getSlotStateInfo('mesa', m.id);
          if (info && info.state && info.state !== 'libre' && map[m.id]) map[m.id].isLive = true;
        }
      });
    } catch (_) {}
    var maxVentas = 0;
    Object.keys(map).forEach(function (k) {
      if (map[k].ventasTotal > maxVentas) maxVentas = map[k].ventasTotal;
    });
    var rows = Object.keys(map)
      .map(function (k) {
        var r = map[k];
        var avgDwell =
          r.dwellMs.length > 0
            ? r.dwellMs.reduce(function (a, b) {
                return a + b;
              }, 0) / r.dwellMs.length
            : null;
        var ticketAvg = r.tickets.length
          ? r.tickets.reduce(function (a, b) {
              return a + b;
            }, 0) / r.tickets.length
          : 0;
        var acogScore = computeAcogedorScore(
          {
            avgDwellMin: avgDwell != null ? avgDwell / 60000 : null,
            ocupaciones: r.ocupaciones,
            ventasTotal: r.ventasTotal,
            faults: r.faults,
          },
          maxVentas
        );
        return {
          id: r.id,
          name: r.name,
          zona: r.zona,
          ocupaciones: r.ocupaciones,
          ventasTotal: r.ventasTotal,
          ticketAvg: ticketAvg,
          avgDwellMin: avgDwell != null ? avgDwell / 60000 : null,
          avgDwellLabel: avgDwell != null ? formatMin(avgDwell) : '—',
          comandas: r.comandas,
          faults: r.faults,
          isLive: r.isLive,
          acogedorScore: acogScore,
          acogedorLabel: acogedorLabel(acogScore),
          scoreClass: scoreClass(acogScore),
        };
      })
      .filter(function (r) {
        return r.ocupaciones > 0 || r.ventasTotal > 0 || r.isLive || r.comandas > 0;
      })
      .sort(function (a, b) {
        return b.acogedorScore - a.acogedorScore || b.ventasTotal - a.ventasTotal;
      });
    return {
      rows: rows,
      adRecommendations: buildMesaAdRecommendations(rows),
      totalMesas: catalog.length,
      mesasActivas: rows.filter(function (r) {
        return r.ocupaciones > 0 || r.isLive;
      }).length,
    };
  }

  function getAreasConfig() {
    try {
      if (typeof global.getComandasConfig === 'function') {
        return global.getComandasConfig().areas || [];
      }
    } catch (_) {}
    return [{ id: 'COCINA', nombre: 'Cocina', tiempoOkMin: 8, tiempoWarnMin: 15 }];
  }

  function comandaEndTimestamp(c) {
    if (!c) return null;
    return c.despachadaAt || c.entregadaAt || c.listaAt || null;
  }

  function computePantallaMetrics(range) {
    var areas = getAreasConfig();
    var hist = collectComandas(range);
    var live =
      typeof global.comandas !== 'undefined' && Array.isArray(global.comandas) ? global.comandas : [];
    var map = {};
    areas.forEach(function (a) {
      map[a.id] = {
        id: a.id,
        name: a.nombre || a.id,
        tiempoOkMin: num(a.tiempoOkMin) || 8,
        tiempoWarnMin: num(a.tiempoWarnMin) || 15,
        total: 0,
        despachadas: 0,
        pendientes: 0,
        listas: 0,
        dispatchMs: [],
        prepMs: [],
        listaMs: [],
      };
    });
    function touch(c) {
      if (!c) return;
      var aid = String(c.areaId || 'COCINA');
      if (!map[aid]) {
        map[aid] = {
          id: aid,
          name: c.areaNombre || aid,
          tiempoOkMin: 8,
          tiempoWarnMin: 15,
          total: 0,
          despachadas: 0,
          pendientes: 0,
          listas: 0,
          dispatchMs: [],
          prepMs: [],
          listaMs: [],
        };
      }
      var row = map[aid];
      row.total += 1;
      var st = String(c.estado || '').toLowerCase();
      if (st === 'pendiente' || st === 'preparando') row.pendientes += 1;
      if (st === 'lista') row.listas += 1;
      if (st === 'entregada' || c.despachadaAt) row.despachadas += 1;
      var end = comandaEndTimestamp(c);
      if (c.createdAt && end) {
        var dms = new Date(end).getTime() - new Date(c.createdAt).getTime();
        if (dms >= 30000) row.dispatchMs.push(dms);
        else if (dms >= 0) row.dispatchMs.push(dms);
      }
      if (c.createdAt && c.preparandoAt) {
        var pms = new Date(c.preparandoAt).getTime() - new Date(c.createdAt).getTime();
        if (pms >= 0) row.prepMs.push(pms);
      }
      if (c.createdAt && c.listaAt) {
        var lms = new Date(c.listaAt).getTime() - new Date(c.createdAt).getTime();
        if (lms >= 0) row.listaMs.push(lms);
      }
    }
    hist.forEach(touch);
    live.forEach(function (c) {
      var t = new Date(c.createdAt || 0).getTime();
      if (!isFinite(t) || t < range.start || t >= range.end) return;
      touch(c);
    });
    return Object.keys(map)
      .map(function (k) {
        var r = map[k];
        var completed = r.dispatchMs.length;
        var avgDispatch = completed ? r.dispatchMs.reduce(function (a, b) { return a + b; }, 0) / completed : null;
        var onTime = r.dispatchMs.filter(function (ms) {
          return ms / 60000 <= r.tiempoOkMin;
        }).length;
        var late = r.dispatchMs.filter(function (ms) {
          return ms / 60000 >= r.tiempoWarnMin;
        }).length;
        var onTimePct = completed ? Math.round((onTime / completed) * 100) : null;
        var latePct = completed ? Math.round((late / completed) * 100) : 0;
        var throughput =
          completed > 0 && avgDispatch != null
            ? (60 / (avgDispatch / 60000)).toFixed(1)
            : '—';
        var score = completed
          ? Math.round((onTimePct || 0) * 0.55 + Math.max(0, 100 - latePct * 1.1) * 0.45)
          : r.pendientes > 0
            ? 45
            : 0;
        var plausibility = 'ok';
        var plausibilityNote = 'Sin despachos cerrados hoy en esta pantalla.';
        if (r.total > 0 && completed === 0) {
          plausibility = 'pending_only';
          plausibilityNote = r.pendientes + ' pedido(s) en curso — aún no hay tiempos de cierre para evaluar.';
        } else if (completed > 0 && completed < 3) {
          plausibility = 'low_sample';
          plausibilityNote = 'Solo ' + completed + ' despacho(s) — el score puede cambiar mucho con más pedidos.';
        } else if (completed >= 3 && avgDispatch != null && avgDispatch / 60000 < 1.5) {
          plausibility = 'suspicious_fast';
          plausibilityNote =
            'Tiempo medio muy bajo — confirme que marcan Lista/Entregada al despachar, no al recibir.';
        } else if (completed >= 3 && latePct >= 65) {
          plausibility = 'always_late';
          plausibilityNote = 'La mayoría supera la meta de ' + r.tiempoWarnMin + ' min — revise carga o ajuste metas.';
        } else if (completed >= 3) {
          plausibilityNote =
            'Meta: ≤' +
            r.tiempoOkMin +
            ' min OK · ≥' +
            r.tiempoWarnMin +
            ' min alerta · ' +
            onTimePct +
            '% a tiempo.';
        }
        var avgPrep = r.prepMs.length
          ? r.prepMs.reduce(function (a, b) { return a + b; }, 0) / r.prepMs.length
          : null;
        var avgLista = r.listaMs.length
          ? r.listaMs.reduce(function (a, b) { return a + b; }, 0) / r.listaMs.length
          : null;
        return {
          id: r.id,
          name: r.name,
          tiempoOkMin: r.tiempoOkMin,
          tiempoWarnMin: r.tiempoWarnMin,
          total: r.total,
          despachadas: r.despachadas,
          pendientes: r.pendientes,
          listas: r.listas,
          completed: completed,
          avgDispatchMin: avgDispatch != null ? (avgDispatch / 60000).toFixed(1) : '—',
          avgPrepMin: avgPrep != null ? (avgPrep / 60000).toFixed(1) : '—',
          avgListaMin: avgLista != null ? (avgLista / 60000).toFixed(1) : '—',
          onTimePct: onTimePct != null ? onTimePct : '—',
          latePct: latePct,
          throughput: throughput,
          score: score,
          scoreClass: scoreClass(score),
          plausibility: plausibility,
          plausibilityNote: plausibilityNote,
        };
      })
      .sort(function (a, b) {
        return b.score - a.score || b.total - a.total;
      });
  }

  function computeMetrics(opts) {
    opts = opts || {};
    var range = dayRangeFromBusinessDate(opts.businessDate || businessDate());
    var staff = getStaffList();
    var meseros = staff.filter(function (s) {
      return normalizeRol(s.rol) === 'mesero';
    });
    var cajeros = staff.filter(function (s) {
      var r = normalizeRol(s.rol);
      return r === 'caja' || r === 'admin';
    });
    var voids = collectVoidLog(range);
    var faults = collectFaults(range);
    var sessions = collectSessions(range);
    var comandas = collectComandas(range);
    var facturas = collectFacturas(range);
    var cajaCheckouts = collectCajaCheckouts(range);
    var declaraciones = collectDeclaraciones(range);

    var deletedProducts = {};
    voids.forEach(function (e) {
      if (!VOID_TYPES[e.tipo]) return;
      var name = String(e.detalle || 'Ítem').replace(/\s*·.*$/, '').trim() || 'Ítem';
      var uid = matchStaffId(staff, e.user);
      if (!deletedProducts[name]) deletedProducts[name] = { name: name, qty: 0, users: {} };
      deletedProducts[name].qty += 1;
      deletedProducts[name].users[uid] = (deletedProducts[name].users[uid] || 0) + 1;
    });
    var deletedList = Object.keys(deletedProducts)
      .map(function (k) {
        return deletedProducts[k];
      })
      .sort(function (a, b) {
        return b.qty - a.qty;
      });

    var topSold = {};
    facturas.forEach(function (f) {
      (f.items || []).forEach(function (it) {
        var name = it.nombreVenta || it.nombre || 'Ítem';
        var q = num(it.cantidad);
        if (!topSold[name]) topSold[name] = { name: name, qty: 0, rev: 0 };
        topSold[name].qty += q;
        topSold[name].rev += num(it.precio) * q;
      });
    });
    var topSoldList = Object.keys(topSold)
      .map(function (k) {
        return topSold[k];
      })
      .sort(function (a, b) {
        return b.qty - a.qty;
      })
      .slice(0, 15);

    var mesasTot = 0;
    try {
      if (typeof global.mesasCaja !== 'undefined' && Array.isArray(global.mesasCaja)) {
        mesasTot = global.mesasCaja.length;
      }
    } catch (_) {}
    var mesasOcup = 0;
    try {
      if (typeof global.mesasCaja !== 'undefined' && Array.isArray(global.mesasCaja)) {
        global.mesasCaja.forEach(function (m) {
          var info = typeof global.getSlotStateInfo === 'function' ? global.getSlotStateInfo('mesa', m.id) : { state: 'libre' };
          if (info.state !== 'libre') mesasOcup += 1;
        });
      }
    } catch (_) {}

    var meseroMap = {};
    function ensureMesero(id, name) {
      if (!meseroMap[id]) {
        meseroMap[id] = {
          id: id,
          name: name || id,
          comandas: 0,
          mesas: {},
          faults: 0,
          voids: 0,
          ventasMesa: 0,
          ventasCount: 0,
          hoursMs: 0,
        };
      }
      return meseroMap[id];
    }
    meseros.forEach(function (s) {
      ensureMesero(s.id, s.nombre);
    });
    comandas.forEach(function (c) {
      var rol = normalizeRol(c.creadoPorRol);
      var isMeseroComanda = rol === 'mesero' || String(c.origen || '').toLowerCase() === 'tablet';
      if (!isMeseroComanda) return;
      var uid = String(c.creadoPor || '');
      if (!uid || uid === 'TABLET' || uid === 'CAJA') {
        uid = matchStaffId(staff, c.creadoPorNombre || c.creadoPor);
      }
      if (!uid) return;
      var row = ensureMesero(uid, c.creadoPorNombre || uid);
      row.comandas += 1;
      if (String(c.tipoServicio || '').toLowerCase() === 'mesa') {
        row.mesas[mesaGroupKeyFromComanda(c)] = 1;
      }
    });
    faults.forEach(function (f) {
      var row = ensureMesero(f.destinoId, f.destinoNombre);
      row.faults += 1;
    });
    voids.forEach(function (e) {
      var ctx = String(e.contexto || '');
      if (ctx.indexOf('tablet-mesa:') !== 0 && ctx.indexOf('mesa:') !== 0) return;
      var uid = matchStaffId(staff, e.user);
      var row = ensureMesero(uid, e.user);
      row.voids += 1;
    });
    facturas.forEach(function (f) {
      if (String(f.tipoServicio || '').toLowerCase() !== 'mesa') return;
      var mesaKey =
        typeof global.crozzoComandaMesaGroupKeyFrom === 'function'
          ? global.crozzoComandaMesaGroupKeyFrom('mesa', f.mesa || f.contextoServicio || '', '')
          : 'mesa|' + String(f.mesa || '');
      var owner = null;
      Object.keys(meseroMap).some(function (mid) {
        if (meseroMap[mid].mesas[mesaKey]) {
          owner = meseroMap[mid];
          return true;
        }
        return false;
      });
      if (!owner) return;
      owner.ventasMesa += num(f.total);
      owner.ventasCount += 1;
    });
    sessions.forEach(function (s) {
      if (normalizeRol(s.rol) !== 'mesero') return;
      var row = ensureMesero(s.userId, s.userName);
      row.hoursMs += num(s.durationMs);
    });

    var meseroActiveCount = meseros.filter(function (s) {
      var r = meseroMap[s.id];
      return r && (r.comandas > 0 || r.hoursMs > 0);
    }).length;
    var idealMesas = meseroActiveCount > 0 ? mesasOcup / meseroActiveCount : 0;
    var meseroRows = Object.keys(meseroMap)
      .map(function (k) {
        var r = meseroMap[k];
        var mesaCount = Object.keys(r.mesas).length;
        var balanceDelta = idealMesas > 0 ? Math.abs(mesaCount - idealMesas) : 0;
        var balancePct = idealMesas > 0 ? Math.max(0, 100 - (balanceDelta / idealMesas) * 100) : 100;
        var salesBase = meseroActiveCount > 0 ? (r.ventasMesa / Math.max(1, mesasOcup)) * 100 : r.comandas * 10;
        var score = computeScore(Math.min(100, salesBase), r.faults, r.comandas, r.hoursMs);
        score = Math.round(score * 0.7 + balancePct * 0.3);
        return {
          id: r.id,
          name: r.name,
          comandas: r.comandas,
          mesas: mesaCount,
          faults: r.faults,
          voids: r.voids,
          ventasMesa: r.ventasMesa,
          ventasCount: r.ventasCount,
          hoursMs: r.hoursMs,
          hoursLabel: formatMs(r.hoursMs),
          comandasHora: r.hoursMs > 0 ? (r.comandas / (r.hoursMs / 3600000)).toFixed(1) : '—',
          faultRate: r.comandas > 0 ? formatPct(r.faults, r.comandas) : r.faults ? '100%' : '0%',
          balancePct: Math.round(balancePct),
          score: score,
          scoreClass: scoreClass(score),
        };
      })
      .sort(function (a, b) {
        return b.score - a.score || b.ventasMesa - a.ventasMesa;
      });

    var cajeroMap = {};
    function ensureCajero(id, name) {
      if (!cajeroMap[id]) {
        cajeroMap[id] = {
          id: id,
          name: name || id,
          ventas: 0,
          count: 0,
          cash: 0,
          voids: 0,
          abortados: 0,
          hoursMs: 0,
          checkoutSum: 0,
          checkoutCount: 0,
          pendingSum: 0,
          pendingSamples: 0,
          declaracionDiffSum: 0,
          declaracionCount: 0,
        };
      }
      return cajeroMap[id];
    }
    cajeros.forEach(function (s) {
      ensureCajero(s.id, s.nombre);
    });
    facturas.forEach(function (f) {
      var uid = f.cobradoPorId || matchStaffId(staff, f.cobradoPorNombre);
      if (!uid) return;
      var row = ensureCajero(uid, f.cobradoPorNombre || uid);
      row.ventas += num(f.total);
      row.count += 1;
      if (String(f.metodoPago || '').toLowerCase() === 'efectivo') row.cash += num(f.total);
    });
    voids.forEach(function (e) {
      var uid = matchStaffId(staff, e.user);
      var row = ensureCajero(uid, e.user);
      if (e.tipo === 'cobro_abortado') row.abortados += 1;
      else if (VOID_TYPES[e.tipo]) row.voids += 1;
    });
    sessions.forEach(function (s) {
      var r = normalizeRol(s.rol);
      if (r !== 'caja' && r !== 'admin') return;
      var row = ensureCajero(s.userId, s.userName);
      row.hoursMs += num(s.durationMs);
    });
    cajaCheckouts.forEach(function (e) {
      var uid = e.userId || matchStaffId(staff, e.userName);
      var row = ensureCajero(uid, e.userName);
      if (e.checkoutDurationMs != null && isFinite(e.checkoutDurationMs)) {
        row.checkoutSum += num(e.checkoutDurationMs);
        row.checkoutCount += 1;
      }
      if (e.pendingCobroSlots != null) {
        row.pendingSum += num(e.pendingCobroSlots);
        row.pendingSamples += 1;
      }
    });
    declaraciones.forEach(function (d) {
      var uid = d.userId || matchStaffId(staff, d.user);
      var row = ensureCajero(uid, d.user);
      row.declaracionDiffSum += Math.abs(num(d.diff));
      row.declaracionCount += 1;
    });
    var cajeroRows = Object.keys(cajeroMap)
      .map(function (k) {
        var r = cajeroMap[k];
        var avg = r.count > 0 ? r.ventas / r.count : 0;
        var err = r.voids + r.abortados * 2;
        var score = computeScore(r.count > 0 ? Math.min(100, r.count * 12) : 0, err, r.count, r.hoursMs);
        var hours = Math.max(0.25, r.hoursMs / 3600000);
        var cobrosHoraCount = r.count > 0 && r.hoursMs > 0 ? Math.round((r.count / hours) * 10) / 10 : 0;
        var avgCheckoutMs = r.checkoutCount > 0 ? r.checkoutSum / r.checkoutCount : null;
        var avgPending =
          r.pendingSamples > 0 ? Math.round((r.pendingSum / r.pendingSamples) * 10) / 10 : null;
        return {
          id: r.id,
          name: r.name,
          ventas: r.ventas,
          count: r.count,
          avg: avg,
          cash: r.cash,
          voids: r.voids,
          abortados: r.abortados,
          hoursMs: r.hoursMs,
          hoursLabel: formatMs(r.hoursMs),
          ventasHora: r.hoursMs > 0 ? '$' + Math.round(r.ventas / hours).toLocaleString('es-CO') : '—',
          cobrosHoraCount: cobrosHoraCount,
          avgCheckoutMin: avgCheckoutMs != null ? (avgCheckoutMs / 60000).toFixed(1) : '—',
          avgPendingCobro: avgPending != null ? avgPending : '—',
          declaracionDiffAvg:
            r.declaracionCount > 0 ? Math.round(r.declaracionDiffSum / r.declaracionCount) : null,
          score: score,
          scoreClass: scoreClass(score),
        };
      })
      .sort(function (a, b) {
        return b.score - a.score || b.ventas - a.ventas;
      });

    return {
      range: range,
      mesasTot: mesasTot,
      mesasOcup: mesasOcup,
      meseroActiveCount: meseroActiveCount,
      idealMesas: idealMesas,
      deletedList: deletedList,
      topSoldList: topSoldList,
      meseroRows: meseroRows,
      cajeroRows: cajeroRows,
      pantallaRows: computePantallaMetrics(range),
      mesaAnalytics: computeMesaAnalytics(range),
      faultsTotal: faults.length,
      voidsTotal: voids.filter(function (e) {
        return VOID_TYPES[e.tipo];
      }).length,
    };
  }

  function renderStaffTable(rows, kind) {
    if (!rows.length) {
      return '<p class="crozzo-rep-empty">Sin actividad registrada en el día operativo.</p>';
    }
    if (kind === 'mesero') {
      return (
        '<div class="crozzo-rep-table-wrap"><table class="crozzo-rep-staff-table">' +
        '<thead><tr><th>Mesero</th><th class="num">Score</th><th class="num">Mesas</th><th class="num">Comandas</th><th class="num">Ventas mesa</th><th class="num">Faltas cocina</th><th class="num">Errores</th><th class="num">Conectado</th><th class="num">Com/h</th></tr></thead><tbody>' +
        rows
          .map(function (r) {
            return (
              '<tr>' +
              '<td><strong>' +
              esc(r.name) +
              '</strong></td>' +
              '<td class="num"><span class="crozzo-rep-score crozzo-rep-score--' +
              r.scoreClass +
              '">' +
              r.score +
              '</span></td>' +
              '<td class="num">' +
              r.mesas +
              '</td>' +
              '<td class="num">' +
              r.comandas +
              '</td>' +
              '<td class="num">$' +
              Math.round(r.ventasMesa).toLocaleString('es-CO') +
              '</td>' +
              '<td class="num">' +
              r.faults +
              ' <span class="form-hint">(' +
              r.faultRate +
              ')</span></td>' +
              '<td class="num">' +
              r.voids +
              '</td>' +
              '<td class="num">' +
              esc(r.hoursLabel) +
              '</td>' +
              '<td class="num">' +
              r.comandasHora +
              '</td></tr>'
            );
          })
          .join('') +
        '</tbody></table></div>'
      );
    }
    return (
      '<div class="crozzo-rep-table-wrap"><table class="crozzo-rep-staff-table">' +
      '<thead><tr><th>Cajero</th><th class="num">Score</th><th class="num">Ventas</th><th class="num">#</th><th class="num">Cob/h</th><th class="num">T. cobro</th><th class="num">Pend.</th><th class="num">Ticket</th><th class="num">Errores</th><th class="num">Abort.</th><th class="num">$/h</th></tr></thead><tbody>' +
      rows
        .map(function (r) {
          return (
            '<tr>' +
            '<td><strong>' +
            esc(r.name) +
            '</strong></td>' +
            '<td class="num"><span class="crozzo-rep-score crozzo-rep-score--' +
            r.scoreClass +
            '">' +
            r.score +
            '</span></td>' +
            '<td class="num">$' +
            Math.round(r.ventas).toLocaleString('es-CO') +
            '</td>' +
            '<td class="num">' +
            r.count +
            '</td>' +
            '<td class="num">' +
            (r.cobrosHoraCount ? r.cobrosHoraCount : '—') +
            '</td>' +
            '<td class="num">' +
            esc(r.avgCheckoutMin === '—' ? '—' : r.avgCheckoutMin + 'm') +
            '</td>' +
            '<td class="num">' +
            esc(r.avgPendingCobro === '—' ? '—' : String(r.avgPendingCobro)) +
            '</td>' +
            '<td class="num">$' +
            Math.round(r.avg).toLocaleString('es-CO') +
            '</td>' +
            '<td class="num">' +
            r.voids +
            '</td>' +
            '<td class="num">' +
            r.abortados +
            '</td>' +
            '<td class="num">' +
            esc(r.ventasHora) +
            '</td></tr>'
          );
        })
        .join('') +
      '</tbody></table></div>'
    );
  }

  function renderDashboardPanelHtml() {
    return (
      '<div class="crozzo-rep-panel" data-rep-panel="equipo" style="display:none;">' +
      '<div class="crozzo-rep-staff-head">' +
      '<p class="page-subtitle" style="margin:0;">Rendimiento del día operativo · faltas cocina = 1 por mesa (aunque llamen varias veces) · score combina ventas, errores y balance de mesas.</p>' +
      '<div class="crozzo-rep-actions" style="margin:10px 0 0;">' +
      '<select class="form-select" id="crozzo-rep-staff-scope" style="width:auto;min-width:160px;">' +
      '<option value="today" selected>Hoy (día operativo)</option>' +
      '</select>' +
      '<button type="button" class="btn btn-outline btn-sm" onclick="CrozzoStaffOpsReport.refreshDashboard()">🔄 Actualizar</button>' +
      '<button type="button" class="btn btn-outline btn-sm" onclick="CrozzoStaffOpsReport.exportCsv()">📥 Exportar CSV</button>' +
      '</div></div>' +
      '<div class="crozzo-rep-kpi-grid crozzo-rep-kpi-grid--dash" id="crozzo-rep-staff-kpis"></div>' +
      '<div class="crozzo-rep-section-grid">' +
      '<div class="crozzo-rep-dash-block"><h3 class="crozzo-rep-dash-title">Balance de mesas (meseros)</h3><div id="crozzo-rep-staff-balance"></div></div>' +
      '<div class="crozzo-rep-dash-block"><h3 class="crozzo-rep-dash-title">Productos eliminados / anulados</h3><div id="crozzo-rep-staff-deleted"></div></div>' +
      '</div>' +
      '<div class="crozzo-rep-dash-block"><h3 class="crozzo-rep-dash-title">Productos más vendidos</h3><div id="crozzo-rep-staff-top"></div></div>' +
      '<div class="crozzo-rep-dash-block"><h3 class="crozzo-rep-dash-title">Rendimiento meseros</h3><div id="crozzo-rep-staff-meseros"></div></div>' +
      '<div class="crozzo-rep-dash-block"><h3 class="crozzo-rep-dash-title">Rendimiento cajeros</h3>' +
      '<p class="form-hint" style="margin:0 0 10px;">Cobros/h, tiempo medio por cobro (desde abrir mesa hasta facturar), cola pendiente al cobrar, errores y abortados. Score = volumen + precisión.</p>' +
      '<div id="crozzo-rep-staff-cajeros"></div></div>' +
      '<div class="crozzo-rep-dash-block"><h3 class="crozzo-rep-dash-title">Pantallas de producción (cocina, bar, fríos…)</h3>' +
      '<p class="form-hint" style="margin:0 0 10px;">Cada pantalla que crea el cliente · tiempos meta en Config. Comandas · plausibilidad revisa si los datos cuadran.</p>' +
      '<div id="crozzo-rep-staff-pantallas"></div></div>' +
      '<div class="crozzo-rep-dash-block"><h3 class="crozzo-rep-dash-title">Mesas — acogedor, ventas y rotación</h3>' +
      '<p class="form-hint" style="margin:0 0 10px;">Permanencia, veces ocupada, ticket y score de «acogedor» (35–95 min ideal) · zonas inferidas M1–10 salón, 11–20 centro, 21–30 ventana, 31+ terraza.</p>' +
      '<div id="crozzo-rep-staff-mesas"></div>' +
      '<h4 class="crozzo-rep-sub-title">Recomendaciones para publicidad</h4>' +
      '<div id="crozzo-rep-staff-mesa-ads"></div></div>' +
      '</div>'
    );
  }

  function renderMesasBlock(analytics) {
    var rows = analytics.rows || [];
    if (!rows.length) {
      return '<p class="crozzo-rep-empty">Sin actividad en mesas hoy — al cobrar mesa se registrarán tiempos y ventas.</p>';
    }
    var html =
      '<p class="form-hint" style="margin:0 0 10px;">Activas hoy: <strong>' +
      analytics.mesasActivas +
      '</strong> / ' +
      analytics.totalMesas +
      ' mesas</p>' +
      '<div class="crozzo-rep-table-wrap"><table class="crozzo-rep-staff-table crozzo-rep-mesa-table">' +
      '<thead><tr><th>Mesa</th><th>Zona</th><th class="num">Acogedor</th><th class="num">Score</th><th class="num">Servicios</th><th class="num">Permanencia</th><th class="num">Ventas</th><th class="num">Ticket</th><th class="num">Comandas</th><th>Estado</th></tr></thead><tbody>';
    rows.forEach(function (r) {
      html +=
        '<tr>' +
        '<td><strong>' +
        esc(r.name) +
        '</strong></td>' +
        '<td>' +
        esc(r.zona) +
        '</td>' +
        '<td class="num"><span class="crozzo-rep-mesa-tag crozzo-rep-mesa-tag--' +
        r.scoreClass +
        '">' +
        esc(r.acogedorLabel) +
        '</span></td>' +
        '<td class="num"><span class="crozzo-rep-score crozzo-rep-score--' +
        r.scoreClass +
        '">' +
        r.acogedorScore +
        '</span></td>' +
        '<td class="num">' +
        r.ocupaciones +
        '</td>' +
        '<td class="num">' +
        esc(r.avgDwellLabel) +
        '</td>' +
        '<td class="num">$' +
        Math.round(r.ventasTotal).toLocaleString('es-CO') +
        '</td>' +
        '<td class="num">$' +
        Math.round(r.ticketAvg).toLocaleString('es-CO') +
        '</td>' +
        '<td class="num">' +
        r.comandas +
        (r.faults ? ' <span class="form-hint">(' + r.faults + ' falta(s))</span>' : '') +
        '</td>' +
        '<td>' +
        (r.isLive ? '<span class="badge badge-warning">Ocupada</span>' : '<span class="form-hint">Libre</span>') +
        '</td></tr>';
    });
    html += '</tbody></table></div>';
    return html;
  }

  function renderMesaAdsBlock(recs) {
    if (!recs || !recs.length) {
      return '<p class="crozzo-rep-empty">Sin datos suficientes para sugerencias de publicidad.</p>';
    }
    return recs
      .map(function (r) {
        var cls = r.pri === 'warn' ? ' warn' : r.pri === 'star' ? ' crit' : '';
        return '<div class="crozzo-rep-pred' + cls + '">' + esc(r.text) + '</div>';
      })
      .join('');
  }

  function renderPantallasBlock(rows) {
    if (!rows.length) {
      return '<p class="crozzo-rep-empty">No hay pantallas configuradas. Créelas en Config. Comandas.</p>';
    }
    var html =
      '<div class="crozzo-rep-table-wrap"><table class="crozzo-rep-staff-table crozzo-rep-pantalla-table">' +
      '<thead><tr><th>Pantalla</th><th class="num">Score</th><th class="num">Pedidos</th><th class="num">Despach.</th><th class="num">Pend.</th><th class="num">T. medio</th><th class="num">A tiempo</th><th class="num">Tarde</th><th class="num">Meta OK</th><th class="num">Ped/h</th></tr></thead><tbody>';
    rows.forEach(function (r) {
      html +=
        '<tr>' +
        '<td><strong>' +
        esc(r.name) +
        '</strong><div class="form-hint">' +
        esc(r.id) +
        '</div></td>' +
        '<td class="num"><span class="crozzo-rep-score crozzo-rep-score--' +
        r.scoreClass +
        '">' +
        r.score +
        '</span></td>' +
        '<td class="num">' +
        r.total +
        '</td>' +
        '<td class="num">' +
        r.despachadas +
        '</td>' +
        '<td class="num">' +
        r.pendientes +
        '</td>' +
        '<td class="num">' +
        esc(r.avgDispatchMin) +
        '</td>' +
        '<td class="num">' +
        (r.onTimePct === '—' ? '—' : r.onTimePct + '%') +
        '</td>' +
        '<td class="num">' +
        r.latePct +
        '%</td>' +
        '<td class="num">≤' +
        r.tiempoOkMin +
        ' / ≥' +
        r.tiempoWarnMin +
        'm</td>' +
        '<td class="num">' +
        r.throughput +
        '</td></tr>';
    });
    html += '</tbody></table></div>';
    html += '<div class="crozzo-rep-pantalla-notes">';
    rows.forEach(function (r) {
      var cls =
        r.plausibility === 'ok'
          ? ''
          : r.plausibility === 'suspicious_fast' || r.plausibility === 'always_late'
            ? ' warn'
            : ' info';
      html +=
        '<div class="crozzo-rep-pred' +
        cls +
        '"><strong>' +
        esc(r.name) +
        '</strong> · ' +
        esc(r.plausibilityNote) +
        (r.avgPrepMin !== '—' ? ' · Prep. media ' + r.avgPrepMin + ' min' : '') +
        (r.avgListaMin !== '—' ? ' · Lista media ' + r.avgListaMin + ' min' : '') +
        '</div>';
    });
    html += '</div>';
    return html;
  }

  function renderDeletedList(list) {
    if (!list.length) return '<p class="crozzo-rep-empty">Sin eliminaciones registradas hoy.</p>';
    return (
      '<div class="crozzo-rep-table-wrap"><table><thead><tr><th>Producto / ítem</th><th class="num">Veces</th></tr></thead><tbody>' +
      list
        .slice(0, 12)
        .map(function (r) {
          return '<tr><td>' + esc(r.name) + '</td><td class="num">' + r.qty + '</td></tr>';
        })
        .join('') +
      '</tbody></table></div>'
    );
  }

  function renderTopList(list) {
    if (!list.length) return '<p class="crozzo-rep-empty">Sin ventas en el día operativo.</p>';
    var totalQty = list.reduce(function (a, r) {
      return a + r.qty;
    }, 0);
    return (
      '<div class="crozzo-rep-table-wrap"><table><thead><tr><th>Producto</th><th class="num">Cant.</th><th class="num">% uds.</th><th class="num">Ingresos</th></tr></thead><tbody>' +
      list
        .slice(0, 10)
        .map(function (r) {
          return (
            '<tr><td>' +
            esc(r.name) +
            '</td><td class="num">' +
            r.qty +
            '</td><td class="num">' +
            formatPct(r.qty, totalQty) +
            '</td><td class="num">$' +
            Math.round(r.rev).toLocaleString('es-CO') +
            '</td></tr>'
          );
        })
        .join('') +
      '</tbody></table></div>'
    );
  }

  function renderBalanceBlock(m) {
    if (!m.meseroRows.length) return '<p class="crozzo-rep-empty">Sin meseros activos hoy.</p>';
    var ideal = m.idealMesas > 0 ? m.idealMesas.toFixed(1) : '—';
    var html =
      '<p class="form-hint" style="margin:0 0 10px;">Mesas ocupadas: <strong>' +
      m.mesasOcup +
      '</strong> / ' +
      m.mesasTot +
      ' · Meseros activos: <strong>' +
      m.meseroActiveCount +
      '</strong> · Ideal ~ <strong>' +
      ideal +
      '</strong> mesas c/u</p>';
    html += '<div class="crozzo-rep-staff-balance">';
    m.meseroRows.forEach(function (r) {
      var pct = m.mesasOcup > 0 ? Math.min(100, (r.mesas / Math.max(1, m.mesasOcup)) * 100) : 0;
      html +=
        '<div class="crozzo-rep-pay-row">' +
        '<div class="crozzo-rep-pay-row__head"><span class="crozzo-rep-pay-row__lbl">' +
        esc(r.name) +
        '</span><span class="crozzo-rep-pay-row__val">' +
        r.mesas +
        ' mesas · balance ' +
        r.balancePct +
        '%</span></div>' +
        (typeof global.crozzoRepPctBarHtml === 'function' ? global.crozzoRepPctBarHtml(pct, 'cat') : '') +
        '</div>';
    });
    html += '</div>';
    return html;
  }

  function refreshDashboard() {
    var m = computeMetrics();
    var kpiHost = document.getElementById('crozzo-rep-staff-kpis');
    if (kpiHost) {
      kpiHost.innerHTML =
        '<div class="crozzo-rep-kpi"><div class="val">' +
        m.faultsTotal +
        '</div><div class="sub">Faltas cocina (mesas)</div><div class="lbl">Llamados mesero</div></div>' +
        '<div class="crozzo-rep-kpi"><div class="val">' +
        m.voidsTotal +
        '</div><div class="sub">Líneas anuladas</div><div class="lbl">Errores comanda</div></div>' +
        '<div class="crozzo-rep-kpi"><div class="val">' +
        m.meseroRows.length +
        '</div><div class="sub">' +
        m.meseroActiveCount +
        ' activos</div><div class="lbl">Meseros</div></div>' +
        '<div class="crozzo-rep-kpi"><div class="val">' +
        m.cajeroRows.filter(function (r) {
          return r.count > 0;
        }).length +
        '</div><div class="sub">Con ventas</div><div class="lbl">Cajeros</div></div>' +
        '<div class="crozzo-rep-kpi"><div class="val">' +
        m.pantallaRows.length +
        '</div><div class="sub">' +
        m.pantallaRows.filter(function (r) {
          return r.completed >= 3;
        }).length +
        ' con muestra útil</div><div class="lbl">Pantallas</div></div>' +
        (m.mesaAnalytics
          ? '<div class="crozzo-rep-kpi"><div class="val">' +
            m.mesaAnalytics.mesasActivas +
            '</div><div class="sub">' +
            m.mesaAnalytics.totalMesas +
            ' mesas</div><div class="lbl">Mesas activas</div></div>'
          : '');
    }
    var bal = document.getElementById('crozzo-rep-staff-balance');
    if (bal) bal.innerHTML = renderBalanceBlock(m);
    var del = document.getElementById('crozzo-rep-staff-deleted');
    if (del) del.innerHTML = renderDeletedList(m.deletedList);
    var top = document.getElementById('crozzo-rep-staff-top');
    if (top) top.innerHTML = renderTopList(m.topSoldList);
    var mes = document.getElementById('crozzo-rep-staff-meseros');
    if (mes) mes.innerHTML = renderStaffTable(m.meseroRows, 'mesero');
    var caj = document.getElementById('crozzo-rep-staff-cajeros');
    if (caj) caj.innerHTML = renderStaffTable(m.cajeroRows, 'cajero');
    var pan = document.getElementById('crozzo-rep-staff-pantallas');
    if (pan) pan.innerHTML = renderPantallasBlock(m.pantallaRows);
    var mesasHost = document.getElementById('crozzo-rep-staff-mesas');
    if (mesasHost && m.mesaAnalytics) mesasHost.innerHTML = renderMesasBlock(m.mesaAnalytics);
    var ads = document.getElementById('crozzo-rep-staff-mesa-ads');
    if (ads && m.mesaAnalytics) ads.innerHTML = renderMesaAdsBlock(m.mesaAnalytics.adRecommendations);
  }

  function exportCsv() {
    var m = computeMetrics();
    if (typeof global.crozzoRepDownloadCsv !== 'function') {
      if (typeof global.showToast === 'function') global.showToast('Export CSV no disponible', 'warning');
      return;
    }
    var rows = [];
    m.meseroRows.forEach(function (r) {
      rows.push(['mesero', r.id, r.name, r.score, r.mesas, r.comandas, r.ventasMesa, r.faults, r.voids, r.hoursMs]);
    });
    m.cajeroRows.forEach(function (r) {
      rows.push([
        'cajero',
        r.id,
        r.name,
        r.score,
        r.count,
        r.ventas,
        r.cobrosHoraCount,
        r.avgCheckoutMin,
        r.avgPendingCobro,
        r.voids,
        r.abortados,
      ]);
    });
    m.pantallaRows.forEach(function (r) {
      rows.push([
        'pantalla',
        r.id,
        r.name,
        r.score,
        r.total,
        r.despachadas,
        r.avgDispatchMin,
        r.onTimePct,
        r.latePct,
        r.tiempoOkMin + '/' + r.tiempoWarnMin,
      ]);
    });
    (m.mesaAnalytics && m.mesaAnalytics.rows ? m.mesaAnalytics.rows : []).forEach(function (r) {
      rows.push([
        'mesa',
        r.id,
        r.name,
        r.acogedorScore,
        r.ocupaciones,
        r.ventasTotal,
        r.avgDwellMin != null ? r.avgDwellMin.toFixed(1) : '',
        r.ticketAvg,
        r.faults,
        r.zona,
      ]);
    });
    global.crozzoRepDownloadCsv(
      'crozzo_equipo_' + m.range.key + '.csv',
      ['rol', 'id', 'nombre', 'score', 'col1', 'col2', 'col3', 'col4', 'col5', 'ms_conectado'],
      rows
    );
    if (typeof global.showToast === 'function') global.showToast('Reporte de equipo exportado', 'success');
  }

  global.CrozzoStaffOpsReport = {
    onLogin: onLogin,
    onLogout: onLogout,
    stampFacturaCobrador: stampFacturaCobrador,
    registerKitchenFault: registerKitchenFault,
    mesaOpenSession: mesaOpenSession,
    mesaTrackComanda: mesaTrackComanda,
    recordMesaSale: recordMesaSale,
    recordCajaCheckout: recordCajaCheckout,
    computeMetrics: computeMetrics,
    renderDashboardPanelHtml: renderDashboardPanelHtml,
    refreshDashboard: refreshDashboard,
    exportCsv: exportCsv,
  };
})(typeof window !== 'undefined' ? window : globalThis);
