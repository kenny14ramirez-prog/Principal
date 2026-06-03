/**
 * Crozzo POS — Admin: cupos de crédito por cliente CRM + saldo por cobrar.
 */
(function (global) {
  'use strict';

  var filtroQ = '';

  function esc(s) {
    if (typeof global.escUserAttr === 'function') return global.escUserAttr(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function cfg() {
    return typeof global.config !== 'undefined' ? global.config : null;
  }

  function normNit(n) {
    if (typeof global.crozzoCrmNormNit === 'function') return global.crozzoCrmNormNit(n);
    return String(n || '')
      .replace(/\D/g, '')
      .trim();
  }

  function getClients() {
    if (typeof global.crozzoCrmGetClients === 'function') return global.crozzoCrmGetClients();
    var c = cfg();
    if (!c || !c.get) return [];
    var list = c.get('clientesCrm');
    return Array.isArray(list) ? list : [];
  }

  function saldoDebePorNit() {
    var map = {};
    if (typeof global.CrozzoCarteraComercial !== 'undefined' && global.CrozzoCarteraComercial.listPendientes) {
      global.CrozzoCarteraComercial.listPendientes().forEach(function (row) {
        var key = normNit(row.f && row.f.compradorNit) || '_';
        if (!map[key]) map[key] = 0;
        map[key] += Number(row.saldo || 0);
      });
    }
    return map;
  }

  function money(n) {
    return '$' + Number(n || 0).toLocaleString('es-CO');
  }

  function saveCupo(clientId, limite) {
    var c = cfg();
    if (!c || !c.get || !c.save) return { ok: false, msg: 'Config no disponible.' };
    var list = c.get('clientesCrm');
    if (!Array.isArray(list)) return { ok: false, msg: 'Sin clientes CRM.' };
    var row = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === clientId) {
        row = list[i];
        break;
      }
    }
    if (!row) return { ok: false, msg: 'Cliente no encontrado.' };
    var n = Math.max(0, Number(limite || 0));
    row.limiteCredito = n;
    c.save();
    if (typeof global.crozzoCrmEnqueueClientSync === 'function') global.crozzoCrmEnqueueClientSync(row);
    if (cfg() && cfg().addAudit) cfg().addAudit('cupo_cliente', 'Cupo ' + money(n) + ' · ' + (row.nombre || row.nit));
    return { ok: true, client: row };
  }

  function openEditModal(clientId) {
    var list = getClients();
    var c = list.find(function (x) {
      return x.id === clientId;
    });
    if (!c) return;
    var debeMap = saldoDebePorNit();
    var debe = debeMap[normNit(c.nit)] || 0;
    var lim = Number(c.limiteCredito || 0);
    var used = Number(c.creditoUsado || 0);
    if (typeof global.showModal !== 'function') return;
    global.showModal(
      'Cupo de crédito',
      '<div class="fade-in">' +
        '<p><strong>' +
        esc(c.nombre || '') +
        '</strong><br><span class="form-hint">' +
        esc(c.nit || '—') +
        '</span></p>' +
        '<div class="crozzo-cartera-kpis" style="margin:12px 0;">' +
        '<div class="crozzo-cartera-kpi"><span class="crozzo-cartera-kpi__label">Usado (CRM)</span><strong>' +
        money(used) +
        '</strong></div>' +
        '<div class="crozzo-cartera-kpi crozzo-cartera-kpi--warn"><span class="crozzo-cartera-kpi__label">Nos deben</span><strong>' +
        money(debe) +
        '</strong></div></div>' +
        '<div class="form-group"><label class="form-label">Cupo máximo (COP)</label>' +
        '<input type="number" class="form-input" id="crozzoCuposLimiteInp" min="0" step="100000" value="' +
        Math.round(lim) +
        '"></div>' +
        '<p class="form-hint">El cupo solo se define aquí (admin). En tienda comercial el cajero elige venta o préstamo contra este cupo.</p>' +
        '<div class="btn-group" style="justify-content:flex-end;margin-top:14px;">' +
        '<button type="button" class="btn btn-outline" onclick="closeModal()">Cancelar</button>' +
        '<button type="button" class="btn btn-primary" onclick="CrozzoCuposClientes.confirmEditModal(\'' +
        esc(clientId).replace(/'/g, "\\'") +
        '\')">Guardar cupo</button></div></div>'
    );
  }

  function confirmEditModal(clientId) {
    var inp = document.getElementById('crozzoCuposLimiteInp');
    var v = Number(inp && inp.value ? inp.value : 0);
    var r = saveCupo(clientId, v);
    if (!r.ok) {
      if (typeof global.showToast === 'function') global.showToast(r.msg || 'Error', 'error');
      return;
    }
    if (typeof global.closeModal === 'function') global.closeModal();
    if (typeof global.showToast === 'function') global.showToast('Cupo actualizado · ' + money(v), 'success');
    if (typeof global.renderPage === 'function') global.renderPage('cupos-clientes');
  }

  function irCarteraCliente(nit) {
    window.__crozzoCarteraFiltroNit = nit || '';
    if (typeof global.CrozzoCarteraComercial !== 'undefined' && global.CrozzoCarteraComercial.setTab) {
      global.CrozzoCarteraComercial.setTab('pendientes');
    }
    if (typeof global.navigateTo === 'function') global.navigateTo('cartera-comercial');
  }

  function renderRows() {
    var q = String(filtroQ || '')
      .trim()
      .toLowerCase();
    var debeMap = saldoDebePorNit();
    var rows = getClients()
      .filter(function (c) {
        if (!q) return true;
        var blob = [c.nit, c.nombre, c.telefono, c.email].join(' ').toLowerCase();
        return blob.indexOf(q) >= 0;
      })
      .map(function (c) {
        var lim = Number(c.limiteCredito || 0);
        var used = Number(c.creditoUsado || 0);
        var disp = Math.max(0, lim - used);
        var debe = debeMap[normNit(c.nit)] || 0;
        return { c: c, lim: lim, used: used, disp: disp, debe: debe };
      })
      .sort(function (a, b) {
        if (b.debe !== a.debe) return b.debe - a.debe;
        return String(a.c.nombre || '').localeCompare(String(b.c.nombre || ''), 'es');
      });

    if (!rows.length) {
      return '<div class="crozzo-cartera-empty"><p><strong>Sin clientes CRM</strong></p><p class="form-hint">Registre clientes en Clientes (FE) o desde el POS; luego asigne cupo aquí.</p></div>';
    }

    var totalDebe = rows.reduce(function (s, r) {
      return s + r.debe;
    }, 0);
    var conCupo = rows.filter(function (r) {
      return r.lim > 0;
    }).length;

    var kpi =
      '<div class="crozzo-cartera-kpis">' +
      '<div class="crozzo-cartera-kpi"><span class="crozzo-cartera-kpi__label">Clientes</span><strong>' +
      rows.length +
      '</strong></div>' +
      '<div class="crozzo-cartera-kpi"><span class="crozzo-cartera-kpi__label">Con cupo</span><strong>' +
      conCupo +
      '</strong></div>' +
      '<div class="crozzo-cartera-kpi crozzo-cartera-kpi--warn"><span class="crozzo-cartera-kpi__label">Total por cobrar</span><strong>' +
      money(totalDebe) +
      '</strong></div></div>';

    var body = rows
      .map(function (r) {
        var c = r.c;
        var id = esc(c.id || '').replace(/'/g, "\\'");
        var nitEsc = esc(c.nit || '—');
        var nitJs = esc(c.nit || '').replace(/'/g, "\\'");
        return (
          '<tr>' +
          '<td style="font-size:0.78rem;">' +
          nitEsc +
          '</td>' +
          '<td><strong>' +
          esc(c.nombre || '') +
          '</strong></td>' +
          '<td style="text-align:right;">' +
          (r.lim > 0 ? money(r.lim) : '<span class="form-hint">Sin cupo</span>') +
          '</td>' +
          '<td style="text-align:right;">' +
          money(r.used) +
          '</td>' +
          '<td style="text-align:right;">' +
          (r.lim > 0 ? money(r.disp) : '—') +
          '</td>' +
          '<td style="text-align:right;font-weight:700;color:var(--warning);">' +
          (r.debe > 0 ? money(r.debe) : '—') +
          '</td>' +
          '<td style="white-space:nowrap;text-align:right;">' +
          '<button type="button" class="btn btn-primary btn-sm" onclick="CrozzoCuposClientes.openEditModal(\'' +
          id +
          '\')">Cupo</button> ' +
          (r.debe > 0
            ? '<button type="button" class="btn btn-outline btn-sm" onclick="CrozzoCuposClientes.irCarteraCliente(\'' +
              nitJs +
              '\')">Cartera</button>'
            : '') +
          '</td></tr>'
        );
      })
      .join('');

    return (
      kpi +
      '<table class="crozzo-cartera-table"><thead><tr>' +
      '<th>NIT</th><th>Cliente</th><th style="text-align:right;">Cupo</th><th style="text-align:right;">Usado</th>' +
      '<th style="text-align:right;">Disponible</th><th style="text-align:right;">Nos deben</th><th></th>' +
      '</tr></thead><tbody>' +
      body +
      '</tbody></table>'
    );
  }

  function renderPage() {
    return (
      '<section class="crozzo-cartera-page crozzo-cupos-page fade-in">' +
      '<div class="crozzo-cartera-hero">' +
      '<div><h2>Cupos de clientes</h2>' +
      '<p class="page-subtitle">Define el crédito máximo por cliente (CRM). Conectado con cartera real: saldo pendiente y cupo usado.</p></div>' +
      '<button type="button" class="btn btn-outline" onclick="navigateTo(\'caja-clientes\')">👥 Clientes FE</button>' +
      '</div>' +
      '<div class="crozzo-cartera-toolbar">' +
      '<input type="search" class="form-input" id="crozzoCuposSearch" placeholder="Buscar NIT, nombre…" value="' +
      esc(filtroQ) +
      '">' +
      '<button type="button" class="btn btn-outline" onclick="navigateTo(\'cartera-comercial\')">💳 Cartera por cobrar</button>' +
      '</div>' +
      '<div class="crozzo-cartera-body">' +
      renderRows() +
      '</div></section>'
    );
  }

  function initPage() {
    if (document.body) document.body.classList.add('crozzo-page-cupos');
    var inp = document.getElementById('crozzoCuposSearch');
    if (inp && !inp._bound) {
      inp._bound = true;
      var t = null;
      inp.addEventListener('input', function (e) {
        if (t) clearTimeout(t);
        t = setTimeout(function () {
          filtroQ = e.target.value;
          if (typeof global.renderPage === 'function') global.renderPage('cupos-clientes');
        }, 220);
      });
    }
  }

  global.CrozzoCuposClientes = {
    renderPage: renderPage,
    initPage: initPage,
    openEditModal: openEditModal,
    confirmEditModal: confirmEditModal,
    saveCupo: saveCupo,
    irCarteraCliente: irCarteraCliente,
  };
})(typeof window !== 'undefined' ? window : globalThis);
