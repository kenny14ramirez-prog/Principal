/**
 * Crozzo POS — Cartera comercial: cobros pendientes, abonos y cotizaciones de venta.
 */
(function (global) {
  'use strict';

  var LS_COT = 'crozzo_cotizaciones_venta_v1';

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

  function findClientByNit(nit) {
    var n = normNit(nit);
    if (!n || n === '2222222222') return null;
    var list = cfg() && cfg().get ? cfg().get('clientesCrm') : [];
    if (!Array.isArray(list)) return null;
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (typeof global.crozzoCrmNitsEquivalent === 'function' && global.crozzoCrmNitsEquivalent(c.nit, nit)) return c;
      if (normNit(c.nit) === n) return c;
    }
    return null;
  }

  function isPendienteMetodo(m) {
    return m === 'credito' || m === 'cartera_pendiente';
  }

  function ensureCobroFields(f) {
    if (!f || typeof f !== 'object') return f;
    var total = Number(f.total != null ? f.total : f.totalFactura || 0);
    if (!f.cobroEstado) {
      if (isPendienteMetodo(f.metodoPago)) {
        f.cobroEstado = 'pendiente';
        f.saldoPendiente = total;
      } else {
        f.cobroEstado = 'pagado';
        f.saldoPendiente = 0;
      }
    }
    if (f.saldoPendiente == null || Number.isNaN(Number(f.saldoPendiente))) {
      f.saldoPendiente = f.cobroEstado === 'pagado' ? 0 : total;
    }
    if (!Array.isArray(f.abonos)) f.abonos = [];
    return f;
  }

  function stampCobroOnFactura(factura, metodoPago) {
    if (!factura) return factura;
    var total = Number(factura.total != null ? factura.total : factura.totalFactura || 0);
    if (isPendienteMetodo(metodoPago)) {
      factura.cobroEstado = 'pendiente';
      factura.saldoPendiente = total;
    } else {
      factura.cobroEstado = 'pagado';
      factura.saldoPendiente = 0;
    }
    if (!Array.isArray(factura.abonos)) factura.abonos = [];
    return factura;
  }

  function getFacturasRaw() {
    var c = cfg();
    if (!c || !c.getFacturas) return [];
    return c.getFacturas() || [];
  }

  function listPendientes(opts) {
    opts = opts || {};
    var q = String(opts.q || '').trim().toLowerCase();
    var nitFilter = opts.nit ? normNit(opts.nit) : '';
    var out = [];
    var all = getFacturasRaw();
    for (var i = 0; i < all.length; i++) {
      var f = ensureCobroFields(all[i]);
      var est = f.cobroEstado || 'pagado';
      if (est !== 'pendiente' && est !== 'parcial') continue;
      if (nitFilter && normNit(f.compradorNit) !== nitFilter) continue;
      if (q) {
        var blob = [f.consecutivo, f.compradorNombre, f.compradorNit, f.uuid].join(' ').toLowerCase();
        if (blob.indexOf(q) < 0) continue;
      }
      out.push({ f: f, idx: i, saldo: Number(f.saldoPendiente || 0) });
    }
    return out;
  }

  function sumSaldoPendiente(rows) {
    return rows.reduce(function (s, r) {
      return s + Number(r.saldo || 0);
    }, 0);
  }

  function groupByCliente(rows) {
    var map = {};
    rows.forEach(function (row) {
      var key = normNit(row.f.compradorNit) || '_sin_nit_';
      if (!map[key]) {
        map[key] = {
          nit: row.f.compradorNit || '—',
          nombre: row.f.compradorNombre || 'Sin nombre',
          rows: [],
          saldo: 0,
        };
      }
      map[key].rows.push(row);
      map[key].saldo += Number(row.saldo || 0);
    });
    return Object.keys(map)
      .map(function (k) {
        return map[k];
      })
      .sort(function (a, b) {
        return b.saldo - a.saldo;
      });
  }

  function reduceCreditoUsado(nit, monto) {
    var c = findClientByNit(nit);
    if (!c) return;
    var pay = Math.max(0, Number(monto || 0));
    c.creditoUsado = Math.max(0, Number(c.creditoUsado || 0) - pay);
    if (cfg() && cfg().save) cfg().save();
    if (typeof global.crozzoCrmEnqueueClientSync === 'function') global.crozzoCrmEnqueueClientSync(c);
    if (typeof global.crozzoCrmUpdateCreditBadgeEl === 'function' && global.__crozzoCrmSelectedClientId === c.id) {
      global.crozzoCrmUpdateCreditBadgeEl(c);
    }
  }

  function applyAbonoToFactura(factura, monto, meta) {
    meta = meta || {};
    ensureCobroFields(factura);
    var saldo = Number(factura.saldoPendiente || 0);
    var pay = Math.min(Math.max(0, Number(monto || 0)), saldo);
    if (pay <= 0) return { ok: false, msg: 'Monto inválido o saldo ya cubierto.' };
    factura.abonos.push({
      fecha: new Date().toISOString(),
      monto: pay,
      metodo: meta.metodo || 'efectivo',
      nota: String(meta.nota || '').trim(),
    });
    factura.saldoPendiente = Math.max(0, saldo - pay);
    if (factura.saldoPendiente <= 0.0001) {
      factura.cobroEstado = 'pagado';
      factura.saldoPendiente = 0;
    } else {
      factura.cobroEstado = 'parcial';
    }
    reduceCreditoUsado(factura.compradorNit, pay);
    if (cfg() && cfg().save) cfg().save();
    if (cfg() && cfg().addAudit) {
      cfg().addAudit(
        'cartera_abono',
        'Abono $' + pay.toLocaleString('es-CO') + ' · ' + (factura.consecutivo || factura.uuid)
      );
    }
    return { ok: true, aplicado: pay, saldoRestante: factura.saldoPendiente };
  }

  function registerAbonoByUuid(uuid, monto, meta) {
    var all = getFacturasRaw();
    for (var i = 0; i < all.length; i++) {
      if (all[i].uuid === uuid) return applyAbonoToFactura(all[i], monto, meta);
    }
    return { ok: false, msg: 'Comprobante no encontrado.' };
  }

  function getCotizaciones() {
    try {
      var raw = localStorage.getItem(LS_COT);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (_) {
      return [];
    }
  }

  function saveCotizaciones(arr) {
    try {
      localStorage.setItem(LS_COT, JSON.stringify(arr || []));
    } catch (_) {}
  }

  function cartSnapshot() {
    var cart =
      typeof global.getActiveCart === 'function' ? global.getActiveCart() : global.cartDirecto || [];
    var nitEl = document.getElementById('nitCliente');
    var nomEl = document.getElementById('nombreCliente');
    var sub = 0;
    var iva = 0;
    var total = 0;
    if (typeof global.computeTotals === 'function') {
      var t = global.computeTotals(cart);
      sub = t.subtotal;
      iva = t.iva;
      total = t.total;
    } else {
      cart.forEach(function (it) {
        var line = Number(it.precio || 0) * Number(it.cantidad || 1);
        sub += line;
      });
      total = sub;
    }
    return {
      items: cart.map(function (c) {
        return Object.assign({}, c);
      }),
      compradorNit: nitEl && nitEl.value ? nitEl.value.trim() : '',
      compradorNombre: nomEl && nomEl.value ? nomEl.value.trim() : '',
      clienteId: global.__crozzoCrmSelectedClientId || '',
      subtotal: sub,
      iva: iva,
      total: total,
    };
  }

  function guardarCotizacionDesdeCarrito() {
    var snap = cartSnapshot();
    if (!snap.items.length) {
      if (typeof global.showToast === 'function') global.showToast('El carrito está vacío.', 'warning');
      return;
    }
    var list = getCotizaciones();
    var id = 'cot_' + Date.now();
    var row = {
      id: id,
      estado: 'borrador',
      fecha: new Date().toISOString(),
      vigenciaHasta: '',
      notas: '',
      compradorNit: snap.compradorNit,
      compradorNombre: snap.compradorNombre || 'Cliente',
      clienteId: snap.clienteId,
      items: snap.items,
      subtotal: snap.subtotal,
      iva: snap.iva,
      total: snap.total,
    };
    list.unshift(row);
    saveCotizaciones(list);
    if (typeof global.showToast === 'function') {
      global.showToast('Cotización guardada · Cartera → Cotizaciones', 'success');
    }
    if (cfg() && cfg().addAudit) cfg().addAudit('cotizacion_venta', 'Cotización ' + id);
  }

  function loadCotizacionToCart(cotId) {
    var cot = getCotizaciones().find(function (x) {
      return x.id === cotId;
    });
    if (!cot) return;
    if (typeof global.setActiveCart === 'function') global.setActiveCart(cot.items || []);
    else global.cartDirecto = (cot.items || []).map(function (x) {
      return Object.assign({}, x);
    });
    var nitEl = document.getElementById('nitCliente');
    var nomEl = document.getElementById('nombreCliente');
    if (nitEl) nitEl.value = cot.compradorNit || '';
    if (nomEl) nomEl.value = cot.compradorNombre || '';
    if (cot.clienteId) global.__crozzoCrmSelectedClientId = cot.clienteId;
    if (typeof global.crozzoCrmApplyClientToUi === 'function' && cot.clienteId) {
      var c =
        typeof global.crozzoCrmClientById === 'function' ? global.crozzoCrmClientById(cot.clienteId) : null;
      if (c) global.crozzoCrmApplyClientToUi(c);
    }
    if (typeof global.updateCartUI === 'function') global.updateCartUI();
    if (typeof global.navigateTo === 'function') global.navigateTo('venta-comercial');
    if (typeof global.showToast === 'function') global.showToast('Cotización cargada en el carrito', 'success');
  }

  function deleteCotizacion(cotId) {
    var list = getCotizaciones().filter(function (x) {
      return x.id !== cotId;
    });
    saveCotizaciones(list);
  }

  function cobroBadgeHtml(f) {
    if (!f) return '';
    ensureCobroFields(f);
    var e = f.cobroEstado;
    if (e === 'pendiente') return '<span class="badge badge-warning">💳 Por cobrar</span>';
    if (e === 'parcial') return '<span class="badge badge-warning">◐ Abono parcial</span>';
    return '<span class="badge badge-success">✓ Pagado</span>';
  }

  var tabActivo = 'pendientes';
  var filtroQ = '';

  function openAbonoModal(uuid) {
    var all = getFacturasRaw();
    var f = null;
    for (var i = 0; i < all.length; i++) {
      if (all[i].uuid === uuid) {
        f = ensureCobroFields(all[i]);
        break;
      }
    }
    if (!f) return;
    var saldo = Number(f.saldoPendiente || 0);
    if (typeof global.showModal !== 'function') return;
    global.showModal(
      'Registrar abono',
      '<div class="fade-in">' +
        '<p><strong>' +
        esc(f.compradorNombre || '') +
        '</strong><br><span class="form-hint">' +
        esc(f.consecutivo || '') +
        ' · Saldo $' +
        saldo.toLocaleString('es-CO') +
        '</span></p>' +
        '<div class="form-group"><label class="form-label">Monto del abono</label>' +
        '<input type="number" class="form-input" id="crozzoCarteraAbonoMonto" min="1" step="100" value="' +
        Math.round(saldo) +
        '"></div>' +
        '<div class="form-group"><label class="form-label">Medio</label>' +
        '<select class="form-select" id="crozzoCarteraAbonoMetodo">' +
        '<option value="efectivo">Efectivo</option>' +
        '<option value="transferencia">Transferencia</option>' +
        '<option value="datafono">Datafono</option>' +
        '<option value="otro">Otro</option></select></div>' +
        '<div class="form-group"><label class="form-label">Nota (opcional)</label>' +
        '<input type="text" class="form-input" id="crozzoCarteraAbonoNota" placeholder="Ref. consignación…"></div>' +
        '<div class="btn-group" style="justify-content:flex-end;margin-top:14px;">' +
        '<button type="button" class="btn btn-outline" onclick="closeModal()">Cancelar</button>' +
        '<button type="button" class="btn btn-primary" onclick="CrozzoCarteraComercial.confirmAbonoModal(\'' +
        esc(uuid).replace(/'/g, "\\'") +
        '\')">Registrar</button></div></div>'
    );
  }

  function confirmAbonoModal(uuid) {
    var mEl = document.getElementById('crozzoCarteraAbonoMonto');
    var metEl = document.getElementById('crozzoCarteraAbonoMetodo');
    var nEl = document.getElementById('crozzoCarteraAbonoNota');
    var monto = Number(mEl && mEl.value ? mEl.value : 0);
    var r = registerAbonoByUuid(uuid, monto, {
      metodo: metEl ? metEl.value : 'efectivo',
      nota: nEl ? nEl.value : '',
    });
    if (!r.ok) {
      if (typeof global.showToast === 'function') global.showToast(r.msg || 'Error', 'error');
      return;
    }
    if (typeof global.closeModal === 'function') global.closeModal();
    if (typeof global.showToast === 'function') {
      global.showToast(
        'Abono $' + r.aplicado.toLocaleString('es-CO') + ' · saldo $' + r.saldoRestante.toLocaleString('es-CO'),
        'success'
      );
    }
    if (typeof global.renderPage === 'function') global.renderPage('cartera-comercial');
  }

  function renderPendientesTab() {
    var rows = listPendientes({ q: filtroQ });
    var totalSaldo = sumSaldoPendiente(rows);
    var groups = groupByCliente(rows);
    var kpi =
      '<div class="crozzo-cartera-kpis">' +
      '<div class="crozzo-cartera-kpi"><span class="crozzo-cartera-kpi__label">Documentos</span><strong>' +
      rows.length +
      '</strong></div>' +
      '<div class="crozzo-cartera-kpi crozzo-cartera-kpi--warn"><span class="crozzo-cartera-kpi__label">Saldo total</span><strong>$' +
      totalSaldo.toLocaleString('es-CO') +
      '</strong></div>' +
      '<div class="crozzo-cartera-kpi"><span class="crozzo-cartera-kpi__label">Clientes</span><strong>' +
      groups.length +
      '</strong></div></div>';
    if (!rows.length) {
      return (
        kpi +
        '<div class="crozzo-cartera-empty"><p><strong>Sin cuentas por cobrar</strong></p><p class="form-hint">Use «Cartera / crédito» o «Cobrar después» al finalizar una venta.</p></div>'
      );
    }
    var html = kpi;
    groups.forEach(function (g) {
      html +=
        '<section class="crozzo-cartera-cliente card" style="margin-bottom:14px;padding:14px;">' +
        '<header class="crozzo-cartera-cliente__head">' +
        '<div><strong>' +
        esc(g.nombre) +
        '</strong><br><span class="form-hint">' +
        esc(g.nit) +
        ' · ' +
        g.rows.length +
        ' doc. · <strong style="color:var(--warning);">$' +
        g.saldo.toLocaleString('es-CO') +
        '</strong></span></div>' +
        '<button type="button" class="btn btn-outline btn-sm" onclick="navigateTo(\'venta-comercial\')">+ Venta</button>' +
        '</header><table class="crozzo-cartera-table"><thead><tr>' +
        '<th>Fecha</th><th>Nº</th><th>Total</th><th>Saldo</th><th></th></tr></thead><tbody>';
      g.rows.forEach(function (row) {
        var f = row.f;
        var fecha = f.fecha ? String(f.fecha).slice(0, 16).replace('T', ' ') : '—';
        html +=
          '<tr><td style="font-size:0.78rem;">' +
          esc(fecha) +
          '</td><td>' +
          esc(f.consecutivo || '—') +
          '</td><td>$' +
          Number(f.total || 0).toLocaleString('es-CO') +
          '</td><td><strong>$' +
          Number(row.saldo || 0).toLocaleString('es-CO') +
          '</strong></td><td>' +
          '<button type="button" class="btn btn-primary btn-sm" onclick="CrozzoCarteraComercial.openAbonoModal(\'' +
          esc(f.uuid || '').replace(/'/g, "\\'") +
          '\')">Abono</button> ' +
          '<button type="button" class="btn btn-outline btn-sm" onclick="navigateTo(\'facturas\');facturaPreviewIdx=' +
          row.idx +
          ';if(typeof crozzoRenderFacturaPreviewPane===\'function\')crozzoRenderFacturaPreviewPane();">Ver</button>' +
          '</td></tr>';
      });
      html += '</tbody></table></section>';
    });
    return html;
  }

  function renderCotizacionesTab() {
    var list = getCotizaciones().filter(function (c) {
      return c.estado !== 'convertida';
    });
    if (!list.length) {
      return '<div class="crozzo-cartera-empty"><p><strong>Sin cotizaciones guardadas</strong></p><p class="form-hint">En Tienda comercial use el botón «Guardar cotización».</p></div>';
    }
    var rows = list
      .map(function (c) {
        var fecha = c.fecha ? String(c.fecha).slice(0, 10) : '—';
        return (
          '<tr><td>' +
          esc(fecha) +
          '</td><td><strong>' +
          esc(c.compradorNombre || '') +
          '</strong><br><span class="form-hint">' +
          esc(c.compradorNit || '') +
          '</span></td><td>' +
          (c.items ? c.items.length : 0) +
          '</td><td>$' +
          Number(c.total || 0).toLocaleString('es-CO') +
          '</td><td><span class="badge badge-info">' +
          esc(c.estado || 'borrador') +
          '</span></td><td>' +
          '<button type="button" class="btn btn-primary btn-sm" onclick="CrozzoCarteraComercial.loadCotizacionToCart(\'' +
          esc(c.id).replace(/'/g, "\\'") +
          '\')">Cargar</button> ' +
          '<button type="button" class="btn btn-outline btn-sm" onclick="CrozzoCarteraComercial.deleteCotizacion(\'' +
          esc(c.id).replace(/'/g, "\\'") +
          '\');renderPage(\'cartera-comercial\')">Eliminar</button></td></tr>'
        );
      })
      .join('');
    return (
      '<table class="crozzo-cartera-table"><thead><tr><th>Fecha</th><th>Cliente</th><th>Ítems</th><th>Total</th><th>Estado</th><th></th></tr></thead><tbody>' +
      rows +
      '</tbody></table>'
    );
  }

  function renderPagadasTab() {
    var q = String(filtroQ || '').trim().toLowerCase();
    var rows = getFacturasRaw()
      .map(function (f, idx) {
        ensureCobroFields(f);
        return { f: f, idx: idx };
      })
      .filter(function (row) {
        var f = row.f;
        if (f.cobroEstado === 'pagado' && (f.abonos || []).length > 0) return true;
        return false;
      });
    if (q) {
      rows = rows.filter(function (row) {
        var blob = [row.f.consecutivo, row.f.compradorNombre, row.f.compradorNit].join(' ').toLowerCase();
        return blob.indexOf(q) >= 0;
      });
    }
    if (!rows.length) {
      return '<div class="crozzo-cartera-empty"><p class="form-hint">Aquí aparecen comprobantes saldados tras uno o más abonos.</p></div>';
    }
    return (
      '<table class="crozzo-cartera-table"><thead><tr><th>Fecha</th><th>Cliente</th><th>Nº</th><th>Abonos</th><th>Total</th></tr></thead><tbody>' +
      rows
        .slice(0, 80)
        .map(function (row) {
          var f = row.f;
          var ab = (f.abonos || [])
            .map(function (a) {
              return '$' + Number(a.monto || 0).toLocaleString('es-CO');
            })
            .join(', ');
          return (
            '<tr><td style="font-size:0.78rem;">' +
            esc(String(f.fecha || '').slice(0, 10)) +
            '</td><td>' +
            esc(f.compradorNombre || '') +
            '</td><td>' +
            esc(f.consecutivo || '') +
            '</td><td style="font-size:0.78rem;">' +
            esc(ab) +
            '</td><td>$' +
            Number(f.total || 0).toLocaleString('es-CO') +
            '</td></tr>'
          );
        })
        .join('') +
      '</tbody></table>'
    );
  }

  function renderPage() {
    var tabBtn = function (id, label) {
      var on = tabActivo === id ? ' is-active' : '';
      return (
        '<button type="button" class="crozzo-cartera-tab' +
        on +
        '" onclick="CrozzoCarteraComercial.setTab(\'' +
        id +
        '\')">' +
        label +
        '</button>'
      );
    };
    var body = '';
    if (tabActivo === 'cotizaciones') body = renderCotizacionesTab();
    else if (tabActivo === 'pagadas') body = renderPagadasTab();
    else body = renderPendientesTab();
    return (
      '<section class="crozzo-cartera-page fade-in">' +
      '<div class="crozzo-cartera-hero">' +
      '<div><h2>Cartera de clientes</h2>' +
      '<p class="page-subtitle">Cuentas por cobrar, abonos y cotizaciones de venta (comercio / mayorista).</p></div>' +
      '<button type="button" class="btn btn-outline" onclick="navigateTo(\'venta-comercial\')">🏪 Ir a tienda</button>' +
      '</div>' +
      '<div class="crozzo-cartera-toolbar">' +
      '<input type="search" class="form-input" id="crozzoCarteraSearch" placeholder="Buscar cliente, NIT, consecutivo…" value="' +
      esc(filtroQ) +
      '">' +
      '<div class="crozzo-cartera-tabs">' +
      tabBtn('pendientes', 'Por cobrar') +
      tabBtn('cotizaciones', 'Cotizaciones') +
      tabBtn('pagadas', 'Saldadas (abonos)') +
      '</div></div>' +
      '<div class="crozzo-cartera-body">' +
      body +
      '</div></section>'
    );
  }

  function initPage() {
    if (document.body) document.body.classList.add('crozzo-page-cartera');
    var inp = document.getElementById('crozzoCarteraSearch');
    if (inp && !inp._bound) {
      inp._bound = true;
      var t = null;
      inp.addEventListener('input', function (e) {
        if (t) clearTimeout(t);
        t = setTimeout(function () {
          filtroQ = e.target.value;
          if (typeof global.renderPage === 'function') global.renderPage('cartera-comercial');
        }, 220);
      });
    }
  }

  function setTab(id) {
    tabActivo = id || 'pendientes';
    if (typeof global.renderPage === 'function') global.renderPage('cartera-comercial');
  }

  function matchesFacturaCobroFilter(f, filterEstado) {
    if (filterEstado !== 'cobro_pendiente') return null;
    ensureCobroFields(f);
    return f.cobroEstado === 'pendiente' || f.cobroEstado === 'parcial';
  }

  global.CrozzoCarteraComercial = {
    stampCobroOnFactura: stampCobroOnFactura,
    ensureCobroFields: ensureCobroFields,
    isPendienteMetodo: isPendienteMetodo,
    listPendientes: listPendientes,
    registerAbonoByUuid: registerAbonoByUuid,
    guardarCotizacionDesdeCarrito: guardarCotizacionDesdeCarrito,
    loadCotizacionToCart: loadCotizacionToCart,
    deleteCotizacion: deleteCotizacion,
    cobroBadgeHtml: cobroBadgeHtml,
    matchesFacturaCobroFilter: matchesFacturaCobroFilter,
    renderPage: renderPage,
    initPage: initPage,
    setTab: setTab,
    openAbonoModal: openAbonoModal,
    confirmAbonoModal: confirmAbonoModal,
  };

  global.crozzoCarteraGuardarCotizacionDesdeCarrito = guardarCotizacionDesdeCarrito;
})(typeof window !== 'undefined' ? window : globalThis);
