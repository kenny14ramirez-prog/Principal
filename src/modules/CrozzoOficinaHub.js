/**
 * Crozzo POS — Oficina y pagos: barra mínima (solo presentación).
 */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtMoney(n) {
    var res = global.CrozzoReservorio;
    if (res && res.fmtCop) return res.fmtCop(n);
    return '$' + Math.round(Number(n) || 0).toLocaleString('es-CO');
  }

  function stat(label, value, tone) {
    return (
      '<span class="crozzo-of-hub__stat' +
      (tone ? ' crozzo-of-hub__stat--' + esc(tone) : '') +
      '">' +
      '<strong>' +
      esc(value) +
      '</strong> ' +
      esc(label) +
      '</span>'
    );
  }

  function renderShell(ctx) {
    ctx = ctx || {};
    var kpis = ctx.kpis || {};
    var colaPlan = ctx.colaPlan || 0;
    var colaMonto = ctx.colaMonto || 0;
    var colaVal = colaPlan ? colaPlan + ' · ' + fmtMoney(colaMonto) : '—';

    return (
      '<div class="crozzo-of-hub__bar">' +
      '<div class="crozzo-of-hub__stats">' +
      stat('pendientes', String(kpis.pendientes || 0), 'warn') +
      stat('por pagar', fmtMoney(kpis.valorPend || 0), '') +
      stat('pagadas hoy', String(kpis.pagadasHoy || 0), 'ok') +
      stat('planilla', colaVal, colaPlan ? 'warn' : '') +
      '</div>' +
      '<div class="crozzo-of-hub__actions">' +
      '<button type="button" class="btn btn-outline btn-sm' +
      (colaPlan ? ' crozzo-of-planilla-queue' : '') +
      '" id="ccl-of-go-planilla">Planilla' +
      (colaPlan ? ' <span class="crozzo-pl-tab-badge">' + colaPlan + '</span>' : '') +
      '</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="ccl-of-go-recepcion">Recepción</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" id="ccl-of-export">CSV</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" id="ccl-of-refresh" title="Actualizar">↻</button>' +
      '</div></div>'
    );
  }

  global.CrozzoOficinaHub = {
    renderShell: renderShell,
  };
})(typeof window !== 'undefined' ? window : globalThis);
