/**
 * Crozzo — Página Rentabilidad (UI H2.C)
 * --------------------------------------------------------------------------
 * Pantalla admin/encargado: día o 7 días + semáforo + top/bottom platos.
 * Consume CrozzoRentabilidad + CrozzoSemaforoMargen. Sin sync/LAN.
 */
(function (global) {
  'use strict';

  var rango = 'hoy'; // 'hoy' | '7d'

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function money(n) {
    return '$' + Math.round(Number(n) || 0).toLocaleString('es-CO');
  }

  function pct(n) {
    return (Math.round((Number(n) || 0) * 1000) / 10).toFixed(1) + '%';
  }

  function puedeVer() {
    try {
      if (typeof global.isSuperAdminUser === 'function' && global.isSuperAdminUser()) return true;
      var u = typeof global.getCurrentUser === 'function' ? global.getCurrentUser() : null;
      if (!u) return false;
      var rol = String(u.rol || u.role || '').toLowerCase().trim();
      if (rol === 'admin' || rol === 'administrador' || rol === 'encargado') return true;
      if (rol === 'gerente' || rol === 'director' || rol === 'superadmin' || rol === 'super_admin') return true;
      return false;
    } catch (_) {
      return false;
    }
  }

  function getFacturas() {
    try {
      if (global.config && typeof global.config.getFacturas === 'function') return global.config.getFacturas() || [];
    } catch (_) {}
    return [];
  }

  function rangoIso() {
    var now = new Date();
    var fin = new Date(now);
    fin.setHours(23, 59, 59, 999);
    var ini = new Date(now);
    if (rango === '7d') {
      ini.setDate(ini.getDate() - 6);
      ini.setHours(0, 0, 0, 0);
    } else {
      ini.setHours(0, 0, 0, 0);
    }
    return { ini: ini.toISOString(), fin: fin.toISOString(), dia: now.toISOString().split('T')[0] };
  }

  function buildModel() {
    var R = global.CrozzoRentabilidad;
    var S = global.CrozzoSemaforoMargen;
    var facturas = getFacturas();
    var w = rangoIso();
    var agg =
      R && typeof R.rentabilidadPor === 'function'
        ? R.rentabilidadPor(facturas, w.ini, w.fin)
        : { ingresos: 0, cmv: 0, utilidad: 0, margenPct: 0, numFacturas: 0 };
    var platos =
      R && typeof R.rentabilidadPorPlato === 'function'
        ? R.rentabilidadPorPlato(facturas, w.ini, w.fin, 5, 5)
        : { top: [], bottom: [] };
    var sem =
      S && typeof S.semaforoDesdeRentabilidad === 'function'
        ? S.semaforoDesdeRentabilidad(agg)
        : { nivel: 'rojo', emoji: '🔴', label: '—' };
    var topMarked =
      S && typeof S.semaforoMargen === 'function' ? S.semaforoMargen(platos.top || []) : platos.top || [];
    var bottomMarked =
      S && typeof S.semaforoMargen === 'function' ? S.semaforoMargen(platos.bottom || []) : platos.bottom || [];
    var diaSnap =
      rango === 'hoy' && S && typeof S.semaforoGlobalDia === 'function'
        ? S.semaforoGlobalDia(facturas, w.dia)
        : null;
    return {
      agg: agg,
      sem: sem,
      top: topMarked,
      bottom: bottomMarked,
      platosRojos: (diaSnap && diaSnap.platosRojos) || bottomMarked.filter(function (p) {
        return p.semaforo === 'rojo';
      }),
      window: w
    };
  }

  function listPlatosHtml(items, emptyMsg) {
    if (!items || !items.length) {
      return '<p class="crozzo-rent-page__empty">' + esc(emptyMsg) + '</p>';
    }
    return (
      '<ul class="crozzo-rent-page__list">' +
      items
        .map(function (p) {
          var emoji = p.semaforoEmoji || '';
          return (
            '<li><span class="crozzo-rent-page__emoji">' +
            esc(emoji) +
            '</span><span class="crozzo-rent-page__name">' +
            esc(p.nombre || '—') +
            '</span><span class="crozzo-rent-page__meta">' +
            money(p.utilidad) +
            ' · ' +
            pct(p.margenPct) +
            '</span></li>'
          );
        })
        .join('') +
      '</ul>'
    );
  }

  function renderBody() {
    if (!puedeVer()) {
      return (
        '<div class="crozzo-rent-page__deny"><p>Solo admin o encargado pueden ver la rentabilidad.</p>' +
        '<button type="button" class="btn btn-outline" onclick="navigateTo(\'inicio-operacion\')">Volver al inicio</button></div>'
      );
    }
    var m = buildModel();
    var a = m.agg;
    var labelRango = rango === '7d' ? 'Últimos 7 días' : 'Hoy';
    return (
      '<div class="crozzo-rent-page__toolbar" role="tablist" aria-label="Rango">' +
      '<button type="button" class="btn btn-sm' +
      (rango === 'hoy' ? ' btn-primary' : ' btn-outline') +
      '" data-rent-rango="hoy">Hoy</button>' +
      '<button type="button" class="btn btn-sm' +
      (rango === '7d' ? ' btn-primary' : ' btn-outline') +
      '" data-rent-rango="7d">7 días</button>' +
      '</div>' +
      '<div class="crozzo-rent-page__sem crozzo-rent-page__sem--' +
      esc(m.sem.nivel || 'rojo') +
      '">' +
      '<span class="crozzo-rent-page__sem-emoji" aria-hidden="true">' +
      esc(m.sem.emoji || '') +
      '</span>' +
      '<div><strong>' +
      esc(labelRango) +
      ' · ' +
      esc(m.sem.label || '') +
      '</strong>' +
      '<p>Margen <strong>' +
      pct(a.margenPct) +
      '</strong> · Utilidad <strong>' +
      money(a.utilidad) +
      '</strong></p></div></div>' +
      '<div class="crozzo-rent-page__kpis" aria-label="KPIs">' +
      '<div><span>Ingresos</span><strong>' +
      money(a.ingresos) +
      '</strong></div>' +
      '<div><span>CMV</span><strong>' +
      money(a.cmv) +
      '</strong></div>' +
      '<div><span>Utilidad</span><strong>' +
      money(a.utilidad) +
      '</strong></div>' +
      '<div><span>Ventas</span><strong>' +
      String(a.numFacturas || 0) +
      '</strong></div></div>' +
      (!(a.numFacturas > 0)
        ? '<p class="crozzo-rent-page__empty">Sin ventas en este rango. Cobra en caja y vuelve a mirar el margen.</p>'
        : '') +
      '<div class="crozzo-rent-page__cols">' +
      '<section><h3>Mejores platos</h3>' +
      listPlatosHtml(m.top, 'Sin datos de platos aún') +
      '</section>' +
      '<section><h3>Atención (bajo margen)</h3>' +
      listPlatosHtml(m.bottom, 'Ningún plato en la zona baja') +
      '</section></div>'
    );
  }

  function renderPage() {
    return (
      '<section class="crozzo-mod-page crozzo-rent-page fade-in" id="crozzoRentPage">' +
      '<header class="crozzo-rent-page__hero">' +
      '<div><h2>Rentabilidad</h2>' +
      '<p class="page-subtitle">Margen real del negocio · semáforo 🟢🟡🔴 · sin ser contador</p></div>' +
      '<button type="button" class="btn btn-outline" onclick="navigateTo(\'inicio-operacion\')">Inicio</button>' +
      '</header>' +
      '<div class="crozzo-rent-page__body" id="crozzoRentPageBody">' +
      renderBody() +
      '</div></section>'
    );
  }

  function refreshBody() {
    var host = document.getElementById('crozzoRentPageBody');
    if (!host) return;
    host.innerHTML = renderBody();
    bindToolbar(host);
  }

  function bindToolbar(root) {
    var el = root || document.getElementById('crozzoRentPage');
    if (!el) return;
    el.querySelectorAll('[data-rent-rango]').forEach(function (btn) {
      if (btn._rentBound) return;
      btn._rentBound = true;
      btn.addEventListener('click', function () {
        var v = btn.getAttribute('data-rent-rango');
        if (v !== 'hoy' && v !== '7d') return;
        rango = v;
        refreshBody();
      });
    });
  }

  function initPage() {
    if (document.body) document.body.classList.add('crozzo-page-rentabilidad');
    bindToolbar(document.getElementById('crozzoRentPage'));
    try {
      if (typeof global.lucide !== 'undefined' && global.lucide.createIcons) global.lucide.createIcons();
    } catch (_) {}
  }

  function setRango(v) {
    if (v === 'hoy' || v === '7d') rango = v;
  }

  global.CrozzoRentabilidadPage = {
    renderPage: renderPage,
    initPage: initPage,
    refreshBody: refreshBody,
    puedeVer: puedeVer,
    setRango: setRango,
    _buildModel: buildModel
  };
})(typeof window !== 'undefined' ? window : globalThis);
