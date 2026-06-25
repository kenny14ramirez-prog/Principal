/**
 * Crozzo POS — Asistencia de rendimiento de caja: micro UI, sin bloquear el cobro.
 */
(function (global) {
  'use strict';

  var POLL_MS = 15000;
  var ORDER_OPEN_KEY = 'crozzo_caja_order_open';
  var _pollTimer = null;

  function getRoleNorm() {
    try {
      if (typeof global.crozzoNormalizeAppRol === 'function' && typeof global.getCurrentUser === 'function') {
        var u = global.getCurrentUser();
        if (u && u.rol) return global.crozzoNormalizeAppRol(u.rol);
      }
    } catch (_) {}
    return '';
  }

  function isCajaRole(role) {
    return role === 'caja' || role === 'admin' || role === 'gerente';
  }

  function sessionStartMs() {
    try {
      return Number(sessionStorage.getItem('crozzo_caja_sess_start') || 0) || 0;
    } catch (_) {
      return 0;
    }
  }

  function countPendingCobroSlots() {
    var n = 0;
    try {
      if (typeof global.mesasCaja !== 'undefined' && Array.isArray(global.mesasCaja)) {
        global.mesasCaja.forEach(function (m) {
          var info =
            typeof global.getSlotStateInfo === 'function'
              ? global.getSlotStateInfo('mesa', m.id)
              : { state: 'libre' };
          var st = String(info.state || 'libre');
          if (st === 'pendiente' || st === 'comandado' || st === 'salio') n++;
        });
      }
      if (typeof global.llevarCaja !== 'undefined' && Array.isArray(global.llevarCaja)) {
        global.llevarCaja.forEach(function (l) {
          var info =
            typeof global.getSlotStateInfo === 'function'
              ? global.getSlotStateInfo('llevar', l.id)
              : { state: 'libre' };
          var st = String(info.state || 'libre');
          if (st === 'pendiente' || st === 'comandado' || st === 'salio') n++;
        });
      }
    } catch (_) {}
    return n;
  }

  function getLiveSessionSnapshot() {
    var sales = [];
    try {
      if (typeof global.crozzoCajaSessionGetSales === 'function') {
        sales = global.crozzoCajaSessionGetSales();
      }
    } catch (_) {}
    var start = sessionStartMs();
    var elapsedMs = start ? Math.max(60000, Date.now() - start) : 0;
    var hours = elapsedMs / 3600000;
    var count = sales.length;
    var total = sales.reduce(function (a, s) {
      return a + (Number(s && s.total) || 0);
    }, 0);
    var abortados = 0;
    try {
      if (typeof global.crozzoCajaSessionCobrosAbortados === 'function') {
        abortados = global.crozzoCajaSessionCobrosAbortados();
      }
    } catch (_) {}
    var pending = countPendingCobroSlots();
    var cobrosHora = hours > 0 ? Math.round((count / hours) * 10) / 10 : 0;
    var ventasHora = hours > 0 ? Math.round(total / hours) : 0;
    var avgTicket = count > 0 ? Math.round(total / count) : 0;
    return {
      count: count,
      total: total,
      abortados: abortados,
      pending: pending,
      cobrosHora: cobrosHora,
      ventasHora: ventasHora,
      avgTicket: avgTicket,
      hoursMs: elapsedMs,
    };
  }

  function getTeamCompareHint() {
    try {
      if (!global.CrozzoStaffOpsReport || typeof CrozzoStaffOpsReport.computeMetrics !== 'function') return '';
      var m = CrozzoStaffOpsReport.computeMetrics();
      var rows = m.cajeroRows || [];
      if (rows.length < 2) return '';
      var u = typeof global.getCurrentUser === 'function' ? global.getCurrentUser() : null;
      if (!u) return '';
      var mine = rows.find(function (r) {
        return r.id === u.id;
      });
      if (!mine || mine.count < 2) return '';
      var others = rows.filter(function (r) {
        return r.id !== u.id && r.count >= 2;
      });
      if (!others.length) return '';
      var avgCobH =
        others.reduce(function (a, r) {
          return a + (r.cobrosHoraCount || 0);
        }, 0) / others.length;
      if (!avgCobH) return '';
      var mineCob = mine.cobrosHoraCount || 0;
      if (mineCob >= avgCobH * 1.08) return 'Ritmo por encima del equipo hoy';
      if (mineCob <= avgCobH * 0.82) return 'Ritmo bajo vs equipo — cola o mesas complejas';
      return 'Ritmo alineado con el equipo';
    } catch (_) {}
    return '';
  }

  function buildMicroLine() {
    var role = getRoleNorm();
    if (!isCajaRole(role)) return { visible: false, line: '', title: '' };
    var page = typeof global.currentPage !== 'undefined' ? global.currentPage : '';
    if (page !== 'cajero' && page !== 'cierre-caja') return { visible: false, line: '', title: '' };

    var snap = getLiveSessionSnapshot();
    var teamHint = getTeamCompareHint();
    var titleParts = [];
    if (snap.count) {
      titleParts.push(snap.count + ' cobros · $' + snap.total.toLocaleString('es-CO'));
      if (snap.cobrosHora) titleParts.push(snap.cobrosHora + ' cob/h');
      if (snap.avgTicket) titleParts.push('ticket ~$' + snap.avgTicket.toLocaleString('es-CO'));
    }
    if (snap.pending) titleParts.push(snap.pending + ' mesas/pedidos pendientes de cobro');
    if (snap.abortados) titleParts.push(snap.abortados + ' cobro(s) cancelado(s) en sesión');
    if (teamHint) titleParts.push(teamHint);
    titleParts.push('Detalle: Reportes → Equipo → Rendimiento cajeros');

    if (snap.count < 1 && snap.pending < 2 && snap.abortados < 1) {
      return { visible: false, line: '', title: titleParts.join(' · ') };
    }

    var parts = [];
    if (snap.pending >= 2) parts.push(snap.pending + ' pend');
    if (snap.count >= 1) {
      parts.push(snap.count + ' cob');
      if (snap.cobrosHora >= 0.5) parts.push(snap.cobrosHora + '/h');
    }
    if (snap.abortados >= 1) parts.push(snap.abortados + ' abort');

    var level = 'ok';
    if (snap.abortados >= 2) level = 'warn';
    if (snap.pending >= 5 && snap.cobrosHora < 4) level = 'busy';

    return {
      visible: parts.length > 0,
      line: parts.join(' · '),
      title: titleParts.join(' · '),
      level: level,
    };
  }

  function ensureHeaderCueHost() {
    var host = document.getElementById('crozzoCajaMicroCue');
    if (host) return host;
    var status = document.querySelector('.crozzo-header__status');
    if (!status) return null;
    host = document.createElement('button');
    host.type = 'button';
    host.id = 'crozzoCajaMicroCue';
    host.className = 'crozzo-caja-micro-cue';
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    host.hidden = true;
    host.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
    });
    var flowCue = document.getElementById('crozzoFlowMicroCue');
    if (flowCue && flowCue.parentNode === status) {
      status.insertBefore(host, flowCue.nextSibling);
    } else {
      status.insertBefore(host, status.firstChild);
    }
    return host;
  }

  function mountHeaderMicroCue() {
    var host = ensureHeaderCueHost();
    if (!host) return;
    var micro = buildMicroLine();
    if (!micro.visible) {
      host.hidden = true;
      host.textContent = '';
      return;
    }
    host.hidden = false;
    host.textContent = micro.line;
    host.title = micro.title || '';
    host.className = 'crozzo-caja-micro-cue crozzo-caja-micro-cue--' + (micro.level || 'ok');
  }

  function refreshAssistChrome() {
    try {
      mountHeaderMicroCue();
    } catch (e) {
      console.warn('[caja-assist]', e);
    }
  }

  function onCheckout() {
    refreshAssistChrome();
  }

  function markOrderOpen(tipo, ref) {
    try {
      sessionStorage.setItem(
        ORDER_OPEN_KEY,
        JSON.stringify({ at: Date.now(), tipo: String(tipo || ''), ref: String(ref || '') })
      );
    } catch (_) {}
  }

  function readOrderOpen() {
    try {
      return JSON.parse(sessionStorage.getItem(ORDER_OPEN_KEY) || 'null');
    } catch (_) {
      return null;
    }
  }

  function clearOrderOpen() {
    try {
      sessionStorage.removeItem(ORDER_OPEN_KEY);
    } catch (_) {}
  }

  function checkoutDurationMs() {
    var open = readOrderOpen();
    if (!open || !open.at) return null;
    return Math.max(0, Date.now() - Number(open.at));
  }

  function startPolling() {
    if (_pollTimer) return;
    _pollTimer = global.setInterval(refreshAssistChrome, POLL_MS);
  }

  function init() {
    startPolling();
    refreshAssistChrome();
    try {
      global.addEventListener('crozzo:pos-operation-state', refreshAssistChrome);
    } catch (_) {}
  }

  global.CrozzoOperativeCajaAssist = {
    getLiveSessionSnapshot: getLiveSessionSnapshot,
    buildMicroLine: buildMicroLine,
    markOrderOpen: markOrderOpen,
    clearOrderOpen: clearOrderOpen,
    checkoutDurationMs: checkoutDurationMs,
    countPendingCobroSlots: countPendingCobroSlots,
    onCheckout: onCheckout,
    refreshAssistChrome: refreshAssistChrome,
    init: init,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    global.setTimeout(init, 500);
  }
})(typeof window !== 'undefined' ? window : globalThis);
