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

  function renderRecepcion() {
    var res = R();
    var rows = res
      ? res.load().recepciones.slice(0, 40).map(function (r) {
          return (
            '<tr><td>' + esc(r.fecha || '') + '</td><td>' + esc(r.proveedorNombre || '—') + '</td>' +
            '<td style="text-align:right">' + fmtMoney(r.valor) + '</td><td>' + esc(r.notas || '') + '</td></tr>'
          );
        }).join('')
      : '';
    return renderShell(
      'Entrada de factura',
      'Recepción → inventario + oficina + cola planilla',
      '<div class="card"><div class="form-grid">' +
      '<div class="form-group"><label class="form-label">Proveedor</label><select class="form-input" id="ccl-rec-prov">' + provOptions() + '</select></div>' +
      '<div class="form-group"><label class="form-label">Valor factura</label><input class="form-input" type="number" id="ccl-rec-valor" min="0" step="1"></div>' +
      '<div class="form-group"><label class="form-label">Notas</label><input class="form-input" id="ccl-rec-notas" placeholder="Referencia, factura, etc."></div></div>' +
      '<button type="button" class="btn btn-primary" id="ccl-rec-save">Guardar recepción</button>' +
      '<p class="form-hint" style="margin-top:10px">Al guardar: entrada inventario · factura oficina pendiente · evento costos.</p></div>' +
      '<div class="card" style="margin-top:12px"><h3 class="card-title">Últimas recepciones</h3>' +
      '<table class="table"><thead><tr><th>Fecha</th><th>Proveedor</th><th>Valor</th><th>Notas</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="4">Sin recepciones</td></tr>') + '</tbody></table></div>'
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
    var dash = res ? res.renderDashboardHtml() : '<p>Cargue CrozzoReservorio.js</p>';
    return renderShell('Resumen compras (reservorio)', 'KPIs unificados de todo el flujo', dash);
  }

  function bindRecepcion(host) {
    var btn = host.querySelector('#ccl-rec-save');
    if (!btn || !R()) return;
    btn.onclick = function () {
      var prov = host.querySelector('#ccl-rec-prov');
      var val = host.querySelector('#ccl-rec-valor');
      var notas = host.querySelector('#ccl-rec-notas');
      var pid = prov && prov.value;
      if (!pid) return toast('Seleccione proveedor', 'warning');
      var nombre = prov.options[prov.selectedIndex] ? prov.options[prov.selectedIndex].text : '';
      R().registrarRecepcion({
        proveedorId: pid,
        proveedorNombre: nombre,
        valor: Number(val && val.value) || 0,
        notas: (notas && notas.value) || '',
      });
      toast('Recepción guardada — flujo conectado', 'success');
      host.innerHTML = renderRecepcion();
      bindRecepcion(host);
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

  function bindModule(host, mod) {
    if (mod === 'procesado') bindProcesado(host);
    else if (mod === 'oficina') bindOficina(host);
    else if (mod !== 'dashboard') bindRecepcion(host);
  }

  global.CrozzoComprasLocal = {
    render: renderModule,
    init: function (host, mod) {
      if (!host) return;
      bindModule(host, mod || 'recepcion');
    },
    isAvailable: function () {
      return !!R();
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
