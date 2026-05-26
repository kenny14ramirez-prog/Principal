/**
 * Compras sin nube — UI local conectada al reservorio unificado (CrozzoReservorio).
 */
(function (global) {
  'use strict';

  function R() {
    return global.CrozzoReservorio;
  }

  function esc(s) {
    if (typeof escUserAttr === 'function') return escUserAttr(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function toast(m, t) {
    if (typeof showToast === 'function') showToast(m, t || 'info');
  }

  function proveedoresList() {
    var res = R();
    if (!res) return [];
    if (res.listProveedoresOcFormat) return res.listProveedoresOcFormat();
    if (res.syncProveedoresBidirectional) {
      return res.syncProveedoresBidirectional().map(function (p) {
        return { id: p.id, name: p.nombre, nit: p.nit, phone: p.telefono };
      });
    }
    return res.listProveedores().map(function (p) {
      return { id: p.id, name: p.nombre, nit: p.nit, phone: p.telefono };
    });
  }

  function provOptions(selectedId) {
    var list = proveedoresList();
    if (!list.length) {
      return '<option value="">— Agregue proveedores en Compras → Proveedores —</option>';
    }
    return list
      .map(function (p) {
        var id = String(p.id || '');
        var sel = id === String(selectedId || '') ? ' selected' : '';
        return '<option value="' + esc(id) + '"' + sel + '>' + esc(p.name || id) + '</option>';
      })
      .join('');
  }

  function fmtMoney(n) {
    var res = R();
    if (res && res.fmtCop) return res.fmtCop(n);
    var x = Number(n);
    if (!isFinite(x)) return '—';
    return '$' + Math.round(x).toLocaleString('es-CO');
  }

  function renderShell(title, hint, inner) {
    return (
      '<div class="crozzo-compras-local">' +
      '<div class="card" style="margin-bottom:12px">' +
      '<h2 class="card-title" style="margin:0 0 6px">' + esc(title) + '</h2>' +
      '<p class="page-subtitle" style="margin:0">' + hint +
      ' · <strong>Reservorio unificado</strong> (memoria interna). Al activar nube: ejecute SQL en Costos → Editor SQL.</p></div>' +
      inner + '</div>'
    );
  }

  function mpOptionsHtml() {
    var C = global.CrozzoCatalogoMp;
    if (!C || !C.list) {
      return '<option value="">— Cargue catálogo MP en Gestión —</option>';
    }
    var list = C.list();
    if (!list.length) return '<option value="">— Sin materias primas —</option>';
    return (
      '<option value="">— Materia prima —</option>' +
      list
        .map(function (mp) {
          return (
            '<option value="' +
            esc(mp.id) +
            '" data-peso="' +
            esc(mp.peso) +
            '" data-und="' +
            esc(mp.und) +
            '" data-precio="' +
            esc(mp.precioTotal) +
            '">' +
            esc(mp.nombre) +
            '</option>'
          );
        })
        .join('')
    );
  }

  function renderRecepcionLineRow() {
    return (
      '<tr class="ccl-rec-line">' +
      '<td><select class="form-input ccl-rec-mp">' +
      mpOptionsHtml() +
      '</select></td>' +
      '<td style="text-align:right"><input class="form-input ccl-rec-cant" type="number" min="0" step="any" placeholder="1000" style="text-align:right"></td>' +
      '<td style="text-align:right"><input class="form-input ccl-rec-precio" type="number" min="0" step="1" placeholder="Precio lote" style="text-align:right"></td>' +
      '<td><button type="button" class="btn btn-outline btn-sm ccl-rec-rm" title="Quitar línea">×</button></td></tr>'
    );
  }

  function renderRecepcion() {
    if (global.CrozzoRecepcionFacturas && global.CrozzoRecepcionFacturas.render) {
      return global.CrozzoRecepcionFacturas.render();
    }
    var res = R();
    var rows = res
      ? res.load().recepciones.slice(0, 40).map(function (r) {
          var n = (r.items && r.items.length) ? r.items.length + ' ítem(s)' : '';
          return (
            '<tr><td>' +
            esc(r.fecha || '') +
            '</td><td>' +
            esc(r.proveedorNombre || '—') +
            '</td>' +
            '<td style="text-align:right">' +
            fmtMoney(r.valor) +
            '</td><td>' +
            esc(r.notas || '') +
            (n ? ' · ' + esc(n) : '') +
            '</td></tr>'
          );
        }).join('')
      : '';
    return renderShell(
      'Entrada de factura',
      'Recepción → inventario + costeo MP + oficina',
      '<div class="card"><div class="form-grid">' +
      '<div class="form-group"><label class="form-label">Proveedor</label><select class="form-input" id="ccl-rec-prov">' +
      provOptions() +
      '</select></div>' +
      '<div class="form-group"><label class="form-label">Valor factura (total)</label><input class="form-input" type="number" id="ccl-rec-valor" min="0" step="1" placeholder="Opcional si detalla líneas"></div>' +
      '<div class="form-group"><label class="form-label">Notas</label><input class="form-input" id="ccl-rec-notas" placeholder="Nº factura, referencia…"></div></div>' +
      '<h3 class="card-title" style="margin:16px 0 8px;font-size:.95rem">Líneas de factura → costeo</h3>' +
      '<p class="form-hint" style="margin:0 0 10px">Indique materia prima, cantidad de referencia (ml, g, und) y <strong>precio total del lote</strong>. Si el precio cambió respecto al costeo actual, se pedirá confirmación.</p>' +
      '<table class="table" id="ccl-rec-lines"><thead><tr><th>Materia prima</th><th>Cant. ref.</th><th>Precio lote</th><th></th></tr></thead><tbody>' +
      renderRecepcionLineRow() +
      '</tbody></table>' +
      '<button type="button" class="btn btn-outline btn-sm" id="ccl-rec-add-line" style="margin:8px 0 14px">+ Línea</button>' +
      '<button type="button" class="btn btn-primary" id="ccl-rec-save">Guardar recepción</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="ccl-rec-cotizaciones" style="margin-left:8px">Cotizaciones vs costeo</button>' +
      '<p class="form-hint" style="margin-top:10px">Actualiza <strong>Costos → Costeo materias primas</strong> e inventario. Compare precios antes en <strong>Cotizaciones</strong>.</p></div>' +
      '<div class="card" style="margin-top:12px"><h3 class="card-title">Últimas recepciones</h3>' +
      '<table class="table"><thead><tr><th>Fecha</th><th>Proveedor</th><th>Valor</th><th>Notas</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="4">Sin recepciones</td></tr>') +
      '</tbody></table></div>'
    );
  }

  function renderProcesado() {
    var res = R();
    var rows = res
      ? res.load().cortes.slice(0, 30).map(function (c) {
          return '<tr><td>' + esc(c.fecha) + '</td><td>' + esc(c.producto) + '</td><td>' + esc(c.kg) + ' kg</td></tr>';
        }).join('')
      : '';
    return renderShell(
      'Procesos / cortes',
      'Proceso cerrado → entrada inventario transformada',
      '<div class="card"><div class="form-grid">' +
      '<div class="form-group"><label class="form-label">Producto / lote</label><input class="form-input" id="ccl-cor-prod"></div>' +
      '<div class="form-group"><label class="form-label">Kg / porciones</label><input class="form-input" type="number" id="ccl-cor-kg" min="0" step="0.01"></div>' +
      '<div class="form-group"><label class="form-label">Notas</label><input class="form-input" id="ccl-cor-notas"></div></div>' +
      '<button type="button" class="btn btn-primary" id="ccl-cor-save">Registrar proceso</button></div>' +
      '<div class="card" style="margin-top:12px"><table class="table"><thead><tr><th>Fecha</th><th>Producto</th><th>Cant.</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="3">Sin procesos</td></tr>') + '</tbody></table></div>'
    );
  }

  function renderOficina() {
    var res = R();
    var rows = res
      ? res.load().facturasOficina.slice(0, 40).map(function (f) {
          return (
            '<tr><td>' + esc(f.fecha) + '</td><td>' + esc(f.proveedorNombre) + '</td>' +
            '<td style="text-align:right">' + fmtMoney(f.valor) + '</td><td>' + esc(f.metodo) + '</td>' +
            '<td>' + esc(f.estado) + '</td>' +
            '<td>' + (f.estado !== 'pagada' ? '<button type="button" class="btn btn-outline btn-sm ccl-of-pagar" data-id="' + esc(f.id) + '">Marcar pagada</button>' : '—') + '</td></tr>'
          );
        }).join('')
      : '';
    return renderShell(
      'Oficina y pagos',
      'Pago proveedor → cola planilla',
      '<div class="card"><div class="form-grid">' +
      '<div class="form-group"><label class="form-label">Proveedor</label><select class="form-input" id="ccl-of-prov">' + provOptions() + '</select></div>' +
      '<div class="form-group"><label class="form-label">Valor</label><input class="form-input" type="number" id="ccl-of-valor"></div>' +
      '<div class="form-group"><label class="form-label">Método</label><select class="form-input" id="ccl-of-metodo"><option value="efectivo">Efectivo</option><option value="tarjeta">Tarjeta</option><option value="transferencia">Transferencia</option></select></div>' +
      '<div class="form-group"><label class="form-label">Estado</label><select class="form-input" id="ccl-of-estado"><option value="pendiente">Pendiente</option><option value="en_proceso">En proceso</option><option value="pagada">Pagada</option></select></div></div>' +
      '<button type="button" class="btn btn-primary" id="ccl-of-save">Guardar</button></div>' +
      '<div class="card" style="margin-top:12px"><table class="table"><thead><tr><th>Fecha</th><th>Proveedor</th><th>Valor</th><th>Método</th><th>Estado</th><th></th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="6">Sin registros</td></tr>') + '</tbody></table></div>'
    );
  }

  function renderDashboard() {
    var res = R();
    var dash = res
      ? '<div class="ccl-dash-filters" style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:12px">' +
        '<label class="form-hint" style="margin:0">Período</label>' +
        '<select class="form-input" id="ccl-dash-dias" style="width:auto;min-width:120px">' +
        '<option value="7">Últimos 7 días</option>' +
        '<option value="30" selected>Últimos 30 días</option>' +
        '<option value="90">Últimos 90 días</option>' +
        '<option value="365">Último año</option>' +
        '</select>' +
        '<input class="form-input" id="ccl-dash-cat" placeholder="Filtrar categoría (ej. ABARROTES)" style="max-width:220px">' +
        '<button type="button" class="btn btn-outline btn-sm" id="ccl-dash-refresh">Actualizar</button></div>' +
        '<div id="ccl-dash-body">' +
        res.renderDashboardHtml({ dias: 30 }) +
        '</div>'
      : '<p>Cargue CrozzoReservorio.js</p>';
    return renderShell('Resumen compras (reservorio)', 'KPIs unificados de todo el flujo', dash);
  }

  function refreshDashboardBody(host) {
    var res = R();
    var body = host.querySelector('#ccl-dash-body');
    if (!res || !body || !res.renderDashboardHtml) return;
    var dias = Number((host.querySelector('#ccl-dash-dias') || {}).value) || 30;
    var cat = ((host.querySelector('#ccl-dash-cat') || {}).value || '').trim();
    body.innerHTML = res.renderDashboardHtml({ dias: dias, categoria: cat || undefined });
  }

  function bindRecepcionLineRow(tr) {
    if (!tr) return;
    var sel = tr.querySelector('.ccl-rec-mp');
    var cant = tr.querySelector('.ccl-rec-cant');
    var precio = tr.querySelector('.ccl-rec-precio');
    if (sel && !sel._cclBound) {
      sel._cclBound = true;
      sel.addEventListener('change', function () {
        var opt = sel.options[sel.selectedIndex];
        if (!opt || !opt.value) return;
        if (cant && !cant.value) cant.value = opt.getAttribute('data-peso') || '';
        if (precio && !precio.value) precio.value = opt.getAttribute('data-precio') || '';
      });
    }
    var rm = tr.querySelector('.ccl-rec-rm');
    if (rm && !rm._cclBound) {
      rm._cclBound = true;
      rm.onclick = function () {
        var tbody = tr.parentNode;
        if (tbody && tbody.querySelectorAll('.ccl-rec-line').length > 1) tr.remove();
        else toast('Debe haber al menos una línea', 'info');
      };
    }
  }

  function collectRecepcionItems(host) {
    var items = [];
    host.querySelectorAll('.ccl-rec-line').forEach(function (tr) {
      var sel = tr.querySelector('.ccl-rec-mp');
      var cant = tr.querySelector('.ccl-rec-cant');
      var precio = tr.querySelector('.ccl-rec-precio');
      var mpId = sel && sel.value;
      if (!mpId) return;
      var opt = sel.options[sel.selectedIndex];
      var pTotal = Number(precio && precio.value) || 0;
      if (pTotal <= 0) return;
      items.push({
        mpId: mpId,
        productoNombre: opt ? opt.text : '',
        peso: Number(cant && cant.value) || Number(opt && opt.getAttribute('data-peso')) || 1000,
        cantidad: Number(cant && cant.value) || 1000,
        und: (opt && opt.getAttribute('data-und')) || 'GR',
        precioTotal: pTotal,
      });
    });
    return items;
  }

  function applyRecepcionPrefill(host) {
    var pre = global.__crozzoRecepcionPrefill;
    if (!pre || !host) return;
    global.__crozzoRecepcionPrefill = null;
    var tbody = host.querySelector('#ccl-rec-lines tbody');
    if (!tbody) return;
    var tr = tbody.querySelector('.ccl-rec-line') || tbody.appendChild(document.createElement('tr'));
    tr.className = 'ccl-rec-line';
    if (!tr.querySelector('.ccl-rec-mp')) {
      tr.innerHTML = renderRecepcionLineRow().replace(/^<tr[^>]*>|<\/tr>$/g, '');
      bindRecepcionLineRow(tr);
    }
    var sel = tr.querySelector('.ccl-rec-mp');
    var cant = tr.querySelector('.ccl-rec-cant');
    var precio = tr.querySelector('.ccl-rec-precio');
    var prov = host.querySelector('#ccl-rec-prov');
    if (sel && pre.mpId) sel.value = pre.mpId;
    if (cant && pre.peso) cant.value = pre.peso;
    if (precio && pre.precioTotal) precio.value = pre.precioTotal;
    if (prov && pre.proveedorNombre) {
      for (var i = 0; i < prov.options.length; i++) {
        if (prov.options[i].text.indexOf(pre.proveedorNombre) >= 0) {
          prov.selectedIndex = i;
          break;
        }
      }
    }
    toast('Datos de cotización cargados — revise y guarde recepción', 'info');
  }

  function bindRecepcion(host) {
    if (global.CrozzoRecepcionFacturas && global.CrozzoRecepcionFacturas.init) {
      global.CrozzoRecepcionFacturas.init(host);
      return;
    }
    applyRecepcionPrefill(host);
    var cotBtn = host.querySelector('#ccl-rec-cotizaciones');
    if (cotBtn && !cotBtn._cclBound) {
      cotBtn._cclBound = true;
      cotBtn.onclick = function () {
        if (typeof global.navigateTo === 'function') global.navigateTo('compras-cotizaciones');
      };
    }
    var addLine = host.querySelector('#ccl-rec-add-line');
    if (addLine && !addLine._cclBound) {
      addLine._cclBound = true;
      addLine.onclick = function () {
        var tbody = host.querySelector('#ccl-rec-lines tbody');
        if (!tbody) return;
        var tr = document.createElement('tr');
        tr.className = 'ccl-rec-line';
        tr.innerHTML = renderRecepcionLineRow().replace(/^<tr[^>]*>|<\/tr>$/g, '');
        tbody.appendChild(tr);
        bindRecepcionLineRow(tr);
      };
    }
    host.querySelectorAll('.ccl-rec-line').forEach(bindRecepcionLineRow);

    var btn = host.querySelector('#ccl-rec-save');
    if (!btn || !R()) return;
    if (btn._cclBound) return;
    btn._cclBound = true;
    btn.onclick = function () {
      var prov = host.querySelector('#ccl-rec-prov');
      var val = host.querySelector('#ccl-rec-valor');
      var notas = host.querySelector('#ccl-rec-notas');
      var pid = prov && prov.value;
      if (!pid) return toast('Seleccione proveedor', 'warning');
      var nombre = prov.options[prov.selectedIndex] ? prov.options[prov.selectedIndex].text : '';
      var items = collectRecepcionItems(host);
      var totalLineas = items.reduce(function (s, it) {
        return s + (Number(it.precioTotal) || 0);
      }, 0);
      var valorFactura = Number(val && val.value) || 0;
      if (!items.length && valorFactura <= 0) {
        return toast('Agregue líneas de materia prima o el valor total de la factura', 'warning');
      }
      if (!valorFactura && totalLineas > 0) valorFactura = totalLineas;
      R().registrarRecepcion({
        proveedorId: pid,
        proveedorNombre: nombre,
        valor: valorFactura,
        notas: (notas && notas.value) || '',
        items: items,
      });
      var msg = 'Recepción guardada';
      if (items.length) msg += ' — ' + items.length + ' precio(s) de costeo actualizados';
      toast(msg, 'success');
      var boot = function () {
        host.innerHTML = renderRecepcion();
        bindRecepcion(host);
      };
      var C = global.CrozzoCatalogoMp;
      if (C && C.ensureReady) C.ensureReady(boot);
      else boot();
    };
  }

  function bindProcesado(host) {
    var btn = host.querySelector('#ccl-cor-save');
    if (!btn || !R()) return;
    btn.onclick = function () {
      var prod = host.querySelector('#ccl-cor-prod');
      var kg = host.querySelector('#ccl-cor-kg');
      var notas = host.querySelector('#ccl-cor-notas');
      if (!prod || !prod.value.trim()) return toast('Indique producto', 'warning');
      R().registrarProceso({
        producto: prod.value.trim(),
        kg: Number(kg && kg.value) || 0,
        notas: (notas && notas.value) || '',
      });
      toast('Proceso registrado — inventario actualizado', 'success');
      host.innerHTML = renderProcesado();
      bindProcesado(host);
    };
  }

  function bindOficina(host) {
    var btn = host.querySelector('#ccl-of-save');
    if (btn && R()) {
      btn.onclick = function () {
        var prov = host.querySelector('#ccl-of-prov');
        var val = host.querySelector('#ccl-of-valor');
        var met = host.querySelector('#ccl-of-metodo');
        var est = host.querySelector('#ccl-of-estado');
        var pid = prov && prov.value;
        if (!pid) return toast('Seleccione proveedor', 'warning');
        var nombre = prov.options[prov.selectedIndex] ? prov.options[prov.selectedIndex].text : '';
        R().registrarOficina({
          proveedorId: pid,
          proveedorNombre: nombre,
          valor: Number(val && val.value) || 0,
          metodo: (met && met.value) || 'efectivo',
          estado: (est && est.value) || 'pendiente',
        });
        toast('Oficina guardada', 'success');
        host.innerHTML = renderOficina();
        bindOficina(host);
      };
    }
    host.querySelectorAll('.ccl-of-pagar').forEach(function (b) {
      b.onclick = function () {
        var id = b.getAttribute('data-id');
        if (R()) R().actualizarEstadoOficina(id, 'pagada');
        toast('Pago registrado → cola planilla', 'success');
        host.innerHTML = renderOficina();
        bindOficina(host);
      };
    });
  }

  function renderModule(mod) {
    if (mod === 'procesado') return renderProcesado();
    if (mod === 'oficina') return renderOficina();
    if (mod === 'dashboard') return renderDashboard();
    return renderRecepcion();
  }

  function bindDashboard(host) {
    var refresh = host.querySelector('#ccl-dash-refresh');
    if (refresh && !refresh._cclBound) {
      refresh._cclBound = true;
      refresh.onclick = function () {
        refreshDashboardBody(host);
      };
    }
    var dias = host.querySelector('#ccl-dash-dias');
    if (dias && !dias._cclBound) {
      dias._cclBound = true;
      dias.addEventListener('change', function () {
        refreshDashboardBody(host);
      });
    }
    var cat = host.querySelector('#ccl-dash-cat');
    if (cat && !cat._cclBound) {
      cat._cclBound = true;
      cat.addEventListener('change', function () {
        refreshDashboardBody(host);
      });
      cat.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') refreshDashboardBody(host);
      });
    }
  }

  function bindModule(host, mod) {
    if (mod === 'procesado') bindProcesado(host);
    else if (mod === 'oficina') bindOficina(host);
    else if (mod === 'dashboard') bindDashboard(host);
    else bindRecepcion(host);
  }

  global.CrozzoComprasLocal = {
    render: renderModule,
    init: function (host, mod) {
      if (!host) return;
      var m = mod || 'recepcion';
      if (m === 'recepcion' && global.CrozzoCatalogoMp && global.CrozzoCatalogoMp.ensureReady) {
        global.CrozzoCatalogoMp.ensureReady(function () {
          bindModule(host, m);
        });
        return;
      }
      bindModule(host, m);
    },
    isAvailable: function () {
      return !!R();
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
