/**
 * Compras sin nube — almacenamiento local (misma idea que pedidos / proveedoresOC).
 */
(function (global) {
  'use strict';

  var LS = 'crozzo_compras_local_v1';

  function loadStore() {
    try {
      var d = JSON.parse(localStorage.getItem(LS) || '{}');
      if (!d || typeof d !== 'object') d = {};
      if (!Array.isArray(d.recepciones)) d.recepciones = [];
      if (!Array.isArray(d.cortes)) d.cortes = [];
      if (!Array.isArray(d.facturasOficina)) d.facturasOficina = [];
      return d;
    } catch (_) {
      return { recepciones: [], cortes: [], facturasOficina: [] };
    }
  }

  function saveStore(d) {
    try {
      localStorage.setItem(LS, JSON.stringify(d));
    } catch (_) {}
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
    try {
      if (typeof config !== 'undefined' && config.get) {
        var p = config.get('proveedoresOC');
        if (Array.isArray(p) && p.length) return p;
      }
    } catch (_) {}
    return [];
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
    var x = Number(n);
    if (!isFinite(x)) return '—';
    try {
      return x.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
    } catch (_) {
      return '$' + Math.round(x);
    }
  }

  function renderShell(title, hint, inner) {
    return (
      '<div class="crozzo-compras-local">' +
      '<div class="card" style="margin-bottom:12px">' +
      '<h2 class="card-title" style="margin:0 0 6px">' +
      esc(title) +
      '</h2>' +
      '<p class="page-subtitle" style="margin:0">' +
      hint +
      ' · Datos en <strong>almacenamiento interno</strong>. Al activar la nube, use el módulo QyC embebido.</p></div>' +
      inner +
      '</div>'
    );
  }

  function renderRecepcion() {
    var st = loadStore();
    var rows = st.recepciones
      .slice()
      .reverse()
      .slice(0, 40)
      .map(function (r) {
        return (
          '<tr><td>' +
          esc(r.fecha || '') +
          '</td><td>' +
          esc(r.proveedorNombre || '—') +
          '</td><td>' +
          fmtMoney(r.valor) +
          '</td><td>' +
          esc(r.notas || '') +
          '</td></tr>'
        );
      })
      .join('');
    return renderShell(
      'Entrada de factura',
      'Registro local de recepciones',
      '<div class="card"><div class="form-grid" style="margin-bottom:14px">' +
        '<div class="form-group"><label class="form-label">Proveedor</label><select class="form-input" id="ccl-rec-prov">' +
        provOptions('') +
        '</select></div>' +
        '<div class="form-group"><label class="form-label">Valor</label><input class="form-input" id="ccl-rec-valor" type="number" min="0" step="1" placeholder="0"></div>' +
        '<div class="form-group"><label class="form-label">Notas</label><input class="form-input" id="ccl-rec-notas" placeholder="Referencia, factura, etc."></div>' +
        '</div>' +
        '<button type="button" class="btn btn-primary btn-sm" id="ccl-rec-save">Guardar recepción</button></div>' +
        '<div class="card" style="margin-top:14px"><h3 class="card-title" style="font-size:0.95rem">Historial local</h3>' +
        '<table class="data-table"><thead><tr><th>Fecha</th><th>Proveedor</th><th>Valor</th><th>Notas</th></tr></thead><tbody>' +
        (rows || '<tr><td colspan="4" style="text-align:center;color:var(--text-muted)">Sin registros</td></tr>') +
        '</tbody></table></div>'
    );
  }

  function renderProcesado() {
    var st = loadStore();
    var rows = st.cortes
      .slice()
      .reverse()
      .slice(0, 30)
      .map(function (c) {
        return (
          '<tr><td>' +
          esc(c.fecha || '') +
          '</td><td>' +
          esc(c.producto || '—') +
          '</td><td>' +
          esc(String(c.kg || '')) +
          ' kg</td><td>' +
          esc(c.notas || '') +
          '</td></tr>'
        );
      })
      .join('');
    return renderShell(
      'Cortes y materia prima',
      'Sesiones de corte guardadas en este equipo',
      '<div class="card"><div class="form-grid">' +
        '<div class="form-group"><label class="form-label">Producto / MP</label><input class="form-input" id="ccl-cor-prod" placeholder="Ej: Queso fresco"></div>' +
        '<div class="form-group"><label class="form-label">Kg</label><input class="form-input" id="ccl-cor-kg" type="number" min="0" step="0.01"></div>' +
        '<div class="form-group"><label class="form-label">Notas</label><input class="form-input" id="ccl-cor-notas"></div>' +
        '</div><button type="button" class="btn btn-primary btn-sm" id="ccl-cor-save" style="margin-top:10px">Guardar corte</button></div>' +
        '<div class="card" style="margin-top:14px"><table class="data-table"><thead><tr><th>Fecha</th><th>Producto</th><th>Kg</th><th>Notas</th></tr></thead><tbody>' +
        (rows || '<tr><td colspan="4" style="text-align:center;color:var(--text-muted)">Sin cortes</td></tr>') +
        '</tbody></table></div>'
    );
  }

  function renderOficina() {
    var st = loadStore();
    var rows = st.facturasOficina
      .slice()
      .reverse()
      .slice(0, 30)
      .map(function (f) {
        return (
          '<tr><td>' +
          esc(f.fecha || '') +
          '</td><td>' +
          esc(f.proveedorNombre || '—') +
          '</td><td>' +
          fmtMoney(f.valor) +
          '</td><td>' +
          esc(f.estado || 'pendiente') +
          '</td><td>' +
          esc(f.metodo || '') +
          '</td></tr>'
        );
      })
      .join('');
    return renderShell(
      'Oficina y pagos',
      'Pagos y estados locales',
      '<div class="card"><div class="form-grid">' +
        '<div class="form-group"><label class="form-label">Proveedor</label><select class="form-input" id="ccl-of-prov">' +
        provOptions('') +
        '</select></div>' +
        '<div class="form-group"><label class="form-label">Valor</label><input class="form-input" id="ccl-of-valor" type="number" min="0"></div>' +
        '<div class="form-group"><label class="form-label">Método</label><select class="form-input" id="ccl-of-metodo"><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="tarjeta">Tarjeta</option></select></div>' +
        '<div class="form-group"><label class="form-label">Estado</label><select class="form-input" id="ccl-of-estado"><option value="pendiente">Pendiente</option><option value="pagada">Pagada</option></select></div>' +
        '</div><button type="button" class="btn btn-primary btn-sm" id="ccl-of-save" style="margin-top:10px">Registrar</button></div>' +
        '<div class="card" style="margin-top:14px"><table class="data-table"><thead><tr><th>Fecha</th><th>Proveedor</th><th>Valor</th><th>Estado</th><th>Método</th></tr></thead><tbody>' +
        (rows || '<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">Sin registros</td></tr>') +
        '</tbody></table></div>'
    );
  }

  function renderDashboard() {
    var st = loadStore();
    var totalRec = st.recepciones.reduce(function (s, r) {
      return s + (Number(r.valor) || 0);
    }, 0);
    var totalOf = st.facturasOficina.reduce(function (s, r) {
      return s + (Number(r.valor) || 0);
    }, 0);
    var pagadas = st.facturasOficina.filter(function (f) {
      return String(f.estado) === 'pagada';
    }).length;
    return renderShell(
      'Resumen compras (local)',
      'Vista rápida del almacenamiento interno',
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px">' +
        '<div class="card"><div class="form-hint">Recepciones</div><div style="font-size:1.4rem;font-weight:800">' +
        st.recepciones.length +
        '</div><div>' +
        fmtMoney(totalRec) +
        '</div></div>' +
        '<div class="card"><div class="form-hint">Cortes</div><div style="font-size:1.4rem;font-weight:800">' +
        st.cortes.length +
        '</div></div>' +
        '<div class="card"><div class="form-hint">Oficina</div><div style="font-size:1.4rem;font-weight:800">' +
        st.facturasOficina.length +
        '</div><div>' +
        pagadas +
        ' pagadas · ' +
        fmtMoney(totalOf) +
        '</div></div>' +
        '<div class="card"><div class="form-hint">Proveedores POS</div><div style="font-size:1.4rem;font-weight:800">' +
        proveedoresList().length +
        '</div></div></div>'
    );
  }

  function bindRecepcion(host) {
    var btn = host.querySelector('#ccl-rec-save');
    if (!btn) return;
    btn.onclick = function () {
      var prov = host.querySelector('#ccl-rec-prov');
      var val = host.querySelector('#ccl-rec-valor');
      var notas = host.querySelector('#ccl-rec-notas');
      var pid = prov && prov.value;
      if (!pid) {
        toast('Seleccione un proveedor (o créelo en Compras → Proveedores)', 'warning');
        return;
      }
      var nombre = prov.options[prov.selectedIndex] ? prov.options[prov.selectedIndex].text : '';
      var st = loadStore();
      st.recepciones.push({
        id: 'rec_' + Date.now(),
        fecha: new Date().toISOString().slice(0, 10),
        proveedorId: pid,
        proveedorNombre: nombre,
        valor: Number(val && val.value) || 0,
        notas: (notas && notas.value) || ''
      });
      saveStore(st);
      toast('Recepción guardada (local)', 'success');
      host.innerHTML = renderRecepcion();
      bindRecepcion(host);
    };
  }

  function bindProcesado(host) {
    var btn = host.querySelector('#ccl-cor-save');
    if (!btn) return;
    btn.onclick = function () {
      var prod = host.querySelector('#ccl-cor-prod');
      var kg = host.querySelector('#ccl-cor-kg');
      var notas = host.querySelector('#ccl-cor-notas');
      if (!prod || !prod.value.trim()) {
        toast('Indique el producto', 'warning');
        return;
      }
      var st = loadStore();
      st.cortes.push({
        id: 'cor_' + Date.now(),
        fecha: new Date().toISOString().slice(0, 10),
        producto: prod.value.trim(),
        kg: Number(kg && kg.value) || 0,
        notas: (notas && notas.value) || ''
      });
      saveStore(st);
      toast('Corte guardado (local)', 'success');
      host.innerHTML = renderProcesado();
      bindProcesado(host);
    };
  }

  function bindOficina(host) {
    var btn = host.querySelector('#ccl-of-save');
    if (!btn) return;
    btn.onclick = function () {
      var prov = host.querySelector('#ccl-of-prov');
      var val = host.querySelector('#ccl-of-valor');
      var met = host.querySelector('#ccl-of-metodo');
      var est = host.querySelector('#ccl-of-estado');
      var pid = prov && prov.value;
      if (!pid) {
        toast('Seleccione proveedor', 'warning');
        return;
      }
      var nombre = prov.options[prov.selectedIndex] ? prov.options[prov.selectedIndex].text : '';
      var st = loadStore();
      st.facturasOficina.push({
        id: 'of_' + Date.now(),
        fecha: new Date().toISOString().slice(0, 10),
        proveedorId: pid,
        proveedorNombre: nombre,
        valor: Number(val && val.value) || 0,
        metodo: (met && met.value) || 'efectivo',
        estado: (est && est.value) || 'pendiente'
      });
      saveStore(st);
      toast('Registro de oficina guardado (local)', 'success');
      host.innerHTML = renderOficina();
      bindOficina(host);
    };
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
      return true;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
