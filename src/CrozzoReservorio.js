/**
 * Crozzo POS — Reservorio unificado (memoria interna / localStorage)
 * Proveedores · Recepciones · Oficina · Inventario ledger · Cola planilla · Sync pendiente
 */
(function (global) {
  'use strict';

  var LS = 'crozzo_reservorio_v1';
  var LS_BACKUP = 'crozzo_reservorio_backup_v1';
  var LS_BACKUP2 = 'crozzo_reservorio_backup_v2';
  var VERSION = 1;
  var healthMeta = { recoveredFromBackup: false, lastSaveOk: true, lastSaveError: null };

  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  }

  function safeParse(raw, fb) {
    try {
      return JSON.parse(raw);
    } catch (_) {
      return fb;
    }
  }

  function emptyStore() {
    return {
      version: VERSION,
      businessId: 'default',
      updatedAt: new Date().toISOString(),
      proveedores: [],
      recepciones: [],
      facturasOficina: [],
      cortes: [],
      inventarioMovimientos: [],
      planillaFeed: [],
      syncQueue: [],
      meta: { migrated: false, migrationNotes: [] },
    };
  }

  function businessId() {
    try {
      if (typeof global.getBusinessId === 'function') return global.getBusinessId();
      if (global.config && global.config.businessId) return global.config.businessId;
    } catch (_) {}
    return 'default';
  }

  function validateStore(st) {
    if (!st || typeof st !== 'object') return false;
    if (!Array.isArray(st.proveedores)) return false;
    return true;
  }

  function normalizeStore(st) {
    if (!st || typeof st !== 'object') st = emptyStore();
    if (!Array.isArray(st.proveedores)) st.proveedores = [];
    if (!Array.isArray(st.recepciones)) st.recepciones = [];
    if (!Array.isArray(st.facturasOficina)) st.facturasOficina = [];
    if (!Array.isArray(st.cortes)) st.cortes = [];
    if (!Array.isArray(st.inventarioMovimientos)) st.inventarioMovimientos = [];
    if (!Array.isArray(st.planillaFeed)) st.planillaFeed = [];
    if (!Array.isArray(st.syncQueue)) st.syncQueue = [];
    st.businessId = businessId();
    if (!st.meta) st.meta = { migrated: false, migrationNotes: [] };
    st.version = VERSION;
    return st;
  }

  function trimForQuota(st) {
    if (st.syncQueue.length > 300) {
      var pend = st.syncQueue.filter(function (q) { return q.estado === 'pendiente'; });
      var done = st.syncQueue.filter(function (q) { return q.estado !== 'pendiente'; }).slice(0, 80);
      st.syncQueue = pend.concat(done).slice(0, 300);
    }
    if (st.inventarioMovimientos.length > 1500) st.inventarioMovimientos.length = 1500;
    if (st.recepciones.length > 400) st.recepciones.length = 400;
    if (st.planillaFeed.length > 400) st.planillaFeed.length = 400;
    if (st.facturasOficina.length > 400) st.facturasOficina.length = 400;
    return st;
  }

  function rotateBackup(prevJson) {
    try {
      var b1 = localStorage.getItem(LS_BACKUP);
      if (b1) localStorage.setItem(LS_BACKUP2, b1);
      if (prevJson) localStorage.setItem(LS_BACKUP, prevJson);
    } catch (_) {}
  }

  function loadWithRecovery() {
    var st = safeParse(localStorage.getItem(LS), null);
    if (!validateStore(st)) {
      var bk = safeParse(localStorage.getItem(LS_BACKUP), null);
      if (validateStore(bk)) {
        st = bk;
        healthMeta.recoveredFromBackup = true;
      } else {
        var bk2 = safeParse(localStorage.getItem(LS_BACKUP2), null);
        if (validateStore(bk2)) {
          st = bk2;
          healthMeta.recoveredFromBackup = true;
        } else {
          st = emptyStore();
        }
      }
      try {
        localStorage.setItem(LS, JSON.stringify(normalizeStore(st)));
      } catch (_) {}
    }
    return normalizeStore(st);
  }

  function saveSafe(st) {
    st.updatedAt = new Date().toISOString();
    st.businessId = businessId();
    st.version = VERSION;
    var json = JSON.stringify(st);
    try {
      var prev = localStorage.getItem(LS);
      if (prev && prev !== json) rotateBackup(prev);
      localStorage.setItem(LS, json);
      healthMeta.lastSaveOk = true;
      healthMeta.lastSaveError = null;
      return { ok: true };
    } catch (e) {
      if (e && (e.name === 'QuotaExceededError' || e.code === 22)) {
        trimForQuota(st);
        json = JSON.stringify(st);
        try {
          rotateBackup(localStorage.getItem(LS));
          localStorage.setItem(LS, json);
          healthMeta.lastSaveOk = true;
          healthMeta.lastSaveError = null;
          return { ok: true, trimmed: true };
        } catch (e2) {
          healthMeta.lastSaveOk = false;
          healthMeta.lastSaveError = String(e2);
          return { ok: false, error: String(e2) };
        }
      }
      healthMeta.lastSaveOk = false;
      healthMeta.lastSaveError = String(e);
      return { ok: false, error: String(e) };
    }
  }

  function load() {
    return loadWithRecovery();
  }

  function save(st) {
    var r = saveSafe(st);
    if (!r.ok) {
      try {
        if (typeof global.showToast === 'function') {
          global.showToast('No se pudo guardar el reservorio: ' + (r.error || 'error'), 'error');
        }
      } catch (_) {}
    } else if (r.trimmed) {
      try {
        if (typeof global.showToast === 'function') {
          global.showToast('Espacio local ajustado — datos recientes conservados', 'warning');
        }
      } catch (_) {}
    }
    try {
      document.dispatchEvent(
        new CustomEvent('crozzo-reservorio-updated', { detail: { updatedAt: st.updatedAt, saveOk: r.ok } })
      );
    } catch (_) {}
    return st;
  }

  function getHealth() {
    var st = load();
    return {
      ok: healthMeta.lastSaveOk !== false,
      hasBackup: !!localStorage.getItem(LS_BACKUP),
      hasBackup2: !!localStorage.getItem(LS_BACKUP2),
      recoveredFromBackup: healthMeta.recoveredFromBackup,
      lastSaveError: healthMeta.lastSaveError,
      updatedAt: st.updatedAt,
      itemCounts: {
        proveedores: st.proveedores.length,
        recepciones: st.recepciones.length,
        syncQueue: st.syncQueue.length,
      },
    };
  }

  function repairIfNeeded() {
    var st = loadWithRecovery();
    if (!st.meta.migrated) st = migrateLegacy();
    syncProveedoresToConfig(st);
    return st;
  }

  function flushBackup() {
    try {
      var cur = localStorage.getItem(LS);
      if (cur) rotateBackup(cur);
    } catch (_) {}
  }

  function emitCostos(eventName, detail) {
    detail = detail || {};
    try {
      if (typeof global.crozzoCostosEmit === 'function') global.crozzoCostosEmit(eventName, detail);
      else if (global.CrozzoSistemaCostos && global.CrozzoSistemaCostos.emit) global.CrozzoSistemaCostos.emit(eventName, detail);
    } catch (_) {}
  }

  function pushSync(st, op) {
    st.syncQueue.unshift({
      id: uid('sync'),
      op: op.tipo,
      tabla: op.tabla,
      payload: op.payload || {},
      estado: 'pendiente',
      createdAt: new Date().toISOString(),
    });
    if (st.syncQueue.length > 500) st.syncQueue.length = 500;
  }

  function migrateLegacy() {
    var st = load();
    if (st.meta.migrated) return st;
    var notes = [];

    try {
      var oldCompras = safeParse(localStorage.getItem('crozzo_compras_local_v1'), null);
      if (oldCompras) {
        (oldCompras.recepciones || []).forEach(function (r) {
          if (!st.recepciones.some(function (x) { return x.id === r.id; })) st.recepciones.push(r);
        });
        (oldCompras.cortes || []).forEach(function (c) {
          if (!st.cortes.some(function (x) { return x.id === c.id; })) st.cortes.push(c);
        });
        (oldCompras.facturasOficina || []).forEach(function (f) {
          if (!st.facturasOficina.some(function (x) { return x.id === f.id; })) st.facturasOficina.push(f);
        });
        notes.push('crozzo_compras_local_v1');
      }
    } catch (_) {}

    try {
      var oldFeed = safeParse(localStorage.getItem('crozzo_costos_feed_v1'), []);
      if (Array.isArray(oldFeed)) {
        oldFeed.forEach(function (it) {
          if (!st.planillaFeed.some(function (x) { return x.id === it.id; })) st.planillaFeed.push(it);
        });
        notes.push('crozzo_costos_feed_v1');
      }
    } catch (_) {}

    try {
      if (typeof global.config !== 'undefined' && global.config.get) {
        var poc = global.config.get('proveedoresOC') || [];
        poc.forEach(function (p) {
          upsertProveedorInternal(st, {
            id: p.id,
            nombre: p.name || p.nombre,
            nit: p.nit,
            telefono: p.phone || p.telefono,
            origen: 'proveedoresOC',
          });
        });
        if (poc.length) notes.push('proveedoresOC');
      }
    } catch (_) {}

    st.meta.migrated = true;
    st.meta.migrationNotes = notes;
    return save(st);
  }

  function upsertProveedorInternal(st, p) {
    var id = String(p.id || uid('prov'));
    var nombre = String(p.nombre || p.name || '').trim();
    if (!nombre) return null;
    var idx = st.proveedores.findIndex(function (x) {
      return String(x.id) === id || String(x.nombre || x.name || '').toUpperCase() === nombre.toUpperCase();
    });
    var row = {
      id: id,
      nombre: nombre,
      nit: p.nit || '',
      telefono: p.telefono || p.phone || '',
      categoria: p.categoria || '',
      activo: p.activo !== false,
      updatedAt: new Date().toISOString(),
    };
    if (idx >= 0) st.proveedores[idx] = Object.assign({}, st.proveedores[idx], row);
    else st.proveedores.push(row);
    return row;
  }

  function upsertProveedor(p) {
    var st = migrateLegacy();
    var row = upsertProveedorInternal(st, p);
    if (row) {
      pushSync(st, { tipo: 'upsert', tabla: 'proveedores', payload: row });
      syncProveedoresToConfig(st);
      save(st);
    }
    return row;
  }

  function syncProveedoresToConfig(st) {
    try {
      if (typeof global.config === 'undefined' || !global.config.set || !global.config.get) return;
      var list = (st || load()).proveedores.map(function (p) {
        return { id: p.id, name: p.nombre, nit: p.nit, phone: p.telefono };
      });
      global.config.set('proveedoresOC', list);
    } catch (_) {}
  }

  function listProveedores() {
    return migrateLegacy().proveedores.filter(function (p) { return p.activo !== false; });
  }

  function getProveedor(id) {
    return listProveedores().find(function (p) { return String(p.id) === String(id); });
  }

  function addInventarioMovimiento(st, mov) {
    var row = {
      id: uid('inv'),
      fecha: mov.fecha || new Date().toISOString().slice(0, 10),
      tipo: mov.tipo,
      refTipo: mov.refTipo || null,
      refId: mov.refId || null,
      productoRefTipo: mov.productoRefTipo || 'producto_pos',
      productoRefId: String(mov.productoRefId || mov.producto || 'general'),
      productoNombre: mov.productoNombre || mov.producto || '',
      cantidad: Number(mov.cantidad) || 0,
      unidad: mov.unidad || 'und',
      costoUnitario: Number(mov.costoUnitario) || 0,
      notas: mov.notas || '',
      createdAt: new Date().toISOString(),
    };
    st.inventarioMovimientos.unshift(row);
    if (st.inventarioMovimientos.length > 2000) st.inventarioMovimientos.length = 2000;
    pushSync(st, { tipo: 'insert', tabla: 'crozzo_inventario_movimientos', payload: row });
    return row;
  }

  function enqueuePlanilla(st, item) {
    var row = {
      id: item.id || uid('feed'),
      business_id: businessId(),
      origen: item.origen || 'manual',
      fecha: item.fecha || new Date().toISOString().slice(0, 10),
      concepto: item.concepto || 'Movimiento',
      monto: Number(item.monto) || 0,
      tipo_movimiento: item.tipo_movimiento || 'egreso',
      referencia_tipo: item.referencia_tipo || null,
      referencia_id: item.referencia_id || null,
      payload: item.payload || {},
      estado: item.estado || 'pendiente',
      created_at: item.created_at || new Date().toISOString(),
    };
    st.planillaFeed.unshift(row);
    if (st.planillaFeed.length > 500) st.planillaFeed.length = 500;
    pushSync(st, { tipo: 'insert', tabla: 'crozzo_planilla_feed', payload: row });
    emitCostos('crozzo-costos:feed-planilla', Object.assign({}, row, { enqueuePlanilla: false }));
    return row;
  }

  function registrarRecepcion(input) {
    var st = migrateLegacy();
    var prov = getProveedor(input.proveedorId) || { id: input.proveedorId, nombre: input.proveedorNombre || 'Proveedor' };
    var valor = Number(input.valor) || 0;
    var rec = {
      id: input.id || uid('rec'),
      fecha: input.fecha || new Date().toISOString().slice(0, 10),
      proveedorId: prov.id,
      proveedorNombre: prov.nombre || input.proveedorNombre,
      valor: valor,
      notas: input.notas || '',
      items: input.items || [],
      createdAt: new Date().toISOString(),
    };
    st.recepciones.unshift(rec);

    addInventarioMovimiento(st, {
      tipo: 'entrada_proveedor',
      refTipo: 'recepcion',
      refId: rec.id,
      productoRefId: input.productoRefId || 'recepcion-' + rec.id,
      productoNombre: input.productoNombre || rec.notas || 'Recepción proveedor',
      cantidad: input.cantidad || 1,
      unidad: input.unidad || 'und',
      costoUnitario: valor > 0 ? valor : 0,
      notas: 'Recepción: ' + (rec.proveedorNombre || ''),
    });

    var factura = null;
    if (valor > 0 && input.crearOficina !== false) {
      factura = {
        id: uid('of'),
        fecha: rec.fecha,
        proveedorId: prov.id,
        proveedorNombre: prov.nombre,
        valor: valor,
        metodo: input.metodo || 'por_definir',
        estado: 'pendiente',
        recepcionId: rec.id,
        notas: rec.notas,
        createdAt: new Date().toISOString(),
      };
      st.facturasOficina.unshift(factura);
      pushSync(st, { tipo: 'insert', tabla: 'facturas', payload: factura });
    }

    pushSync(st, { tipo: 'insert', tabla: 'recepciones', payload: rec });
    save(st);

    emitCostos('crozzo-costos:recepcion-registrada', {
      recepcion: rec,
      facturaOficina: factura,
      proveedor: prov,
    });

    return { recepcion: rec, facturaOficina: factura };
  }

  function registrarOficina(input) {
    var st = migrateLegacy();
    var prov = getProveedor(input.proveedorId) || { id: input.proveedorId, nombre: input.proveedorNombre };
    var fac = {
      id: input.id || uid('of'),
      fecha: input.fecha || new Date().toISOString().slice(0, 10),
      proveedorId: prov.id,
      proveedorNombre: prov.nombre || input.proveedorNombre,
      valor: Number(input.valor) || 0,
      metodo: input.metodo || 'efectivo',
      estado: input.estado || 'pendiente',
      recepcionId: input.recepcionId || null,
      notas: input.notas || '',
      createdAt: new Date().toISOString(),
    };
    st.facturasOficina.unshift(fac);
    pushSync(st, { tipo: 'insert', tabla: 'facturas', payload: fac });
    save(st);
    if (fac.estado === 'pagada') onFacturaPagada(fac);
    return fac;
  }

  function actualizarEstadoOficina(facturaId, estado, extra) {
    var st = migrateLegacy();
    var fac = st.facturasOficina.find(function (f) { return f.id === facturaId; });
    if (!fac) return null;
    fac.estado = estado;
    if (extra) Object.assign(fac, extra);
    fac.updatedAt = new Date().toISOString();
    pushSync(st, { tipo: 'update', tabla: 'facturas', payload: fac });
    save(st);
    if (estado === 'pagada') onFacturaPagada(fac);
    return fac;
  }

  function onFacturaPagada(fac) {
    emitCostos('crozzo-costos:factura-pagada', { factura: fac });
    var st = load();
    var exists = st.planillaFeed.some(function (f) {
      return f.referencia_id === fac.id && f.origen === 'oficina' && f.estado !== 'rechazado';
    });
    if (exists) return;
    enqueuePlanilla(st, {
      origen: 'oficina',
      concepto: 'Pago proveedor: ' + (fac.proveedorNombre || ''),
      monto: fac.valor,
      tipo_movimiento: 'egreso',
      referencia_tipo: 'factura_oficina',
      referencia_id: fac.id,
      payload: fac,
    });
    save(st);
  }

  function registrarProceso(input) {
    var st = migrateLegacy();
    var cor = {
      id: input.id || uid('cor'),
      fecha: input.fecha || new Date().toISOString().slice(0, 10),
      producto: input.producto || '',
      kg: Number(input.kg) || 0,
      notas: input.notas || '',
      createdAt: new Date().toISOString(),
    };
    st.cortes.unshift(cor);
    addInventarioMovimiento(st, {
      tipo: 'entrada_proceso',
      refTipo: 'proceso',
      refId: cor.id,
      productoRefId: cor.producto,
      productoNombre: cor.producto,
      cantidad: cor.kg || 1,
      unidad: 'kg',
      notas: cor.notas,
    });
    pushSync(st, { tipo: 'insert', tabla: 'lotes_procesado', payload: cor });
    save(st);
    emitCostos('crozzo-costos:proceso-cerrado', { proceso: cor });
    return cor;
  }

  function registrarVenta(input) {
    var st = migrateLegacy();
    var total = Number(input.monto || input.total) || 0;
    var items = input.items || [];

    items.forEach(function (line) {
      var qty = Number(line.cantidad || line.qty) || 0;
      if (qty <= 0) return;
      addInventarioMovimiento(st, {
        tipo: 'salida_venta',
        refTipo: 'venta',
        refId: input.saleId || input.uuid,
        productoRefTipo: 'producto_pos',
        productoRefId: line.id || line.productId,
        productoNombre: line.nombre || '',
        cantidad: qty,
        unidad: 'und',
        notas: 'Venta POS',
      });
    });

    if (total > 0) {
      enqueuePlanilla(st, {
        origen: 'ventas',
        concepto: input.concepto || 'Ventas del día',
        monto: total,
        tipo_movimiento: 'ingreso',
        referencia_tipo: 'venta',
        referencia_id: input.saleId || input.uuid,
        payload: input,
      });
    }

    save(st);
    emitCostos('crozzo-costos:venta-registrada', input);
    return true;
  }

  function registrarOrdenCompraRecibida(po) {
    if (!po) return null;
    var st = migrateLegacy();
    (po.items || []).forEach(function (line) {
      addInventarioMovimiento(st, {
        tipo: 'entrada_proveedor',
        refTipo: 'orden_compra',
        refId: po.id,
        productoRefTipo: 'producto_pos',
        productoRefId: line.productId,
        productoNombre: line.nombre,
        cantidad: Number(line.qty) || 0,
        unidad: 'und',
        notas: 'OC recibida: ' + po.id,
      });
    });
    var rec = {
      id: uid('rec'),
      fecha: new Date().toISOString().slice(0, 10),
      proveedorId: po.supplierId,
      proveedorNombre: po.supplierName,
      valor: 0,
      notas: 'Recepción automática OC ' + po.id,
      ordenCompraId: po.id,
      items: po.items || [],
      createdAt: new Date().toISOString(),
    };
    st.recepciones.unshift(rec);
    pushSync(st, { tipo: 'insert', tabla: 'recepciones', payload: rec });
    save(st);
    emitCostos('crozzo-costos:recepcion-registrada', { recepcion: rec, origen: 'orden_compra' });
    return rec;
  }

  function getStats() {
    var st = migrateLegacy();
    var totalRec = st.recepciones.reduce(function (s, r) { return s + (Number(r.valor) || 0); }, 0);
    var totalOf = st.facturasOficina.reduce(function (s, f) { return s + (Number(f.valor) || 0); }, 0);
    var pagadas = st.facturasOficina.filter(function (f) { return f.estado === 'pagada'; });
    var pendientes = st.facturasOficina.filter(function (f) { return f.estado === 'pendiente' || f.estado === 'en_proceso'; });
    return {
      proveedores: st.proveedores.length,
      recepciones: st.recepciones.length,
      totalRecepciones: totalRec,
      facturasOficina: st.facturasOficina.length,
      totalOficina: totalOf,
      pagadas: pagadas.length,
      pendientes: pendientes.length,
      cortes: st.cortes.length,
      movimientosInv: st.inventarioMovimientos.length,
      colaPlanilla: st.planillaFeed.filter(function (f) { return f.estado === 'pendiente'; }).length,
      syncPendiente: st.syncQueue.filter(function (q) { return q.estado === 'pendiente'; }).length,
      updatedAt: st.updatedAt,
    };
  }

  function listInventarioMovimientos(limit) {
    return migrateLegacy().inventarioMovimientos.slice(0, limit || 100);
  }

  function listFeed(limit) {
    return migrateLegacy().planillaFeed.slice(0, limit || 100);
  }

  function updateFeedEstado(feedId, estado) {
    var st = migrateLegacy();
    var it = st.planillaFeed.find(function (f) { return f.id === feedId; });
    if (!it) return null;
    it.estado = estado;
    it.revisado_at = new Date().toISOString();
    pushSync(st, { tipo: 'update', tabla: 'crozzo_planilla_feed', payload: it });
    save(st);
    return it;
  }

  function exportSnapshot() {
    return migrateLegacy();
  }

  function fmtCop(n) {
    var x = Number(n);
    if (!isFinite(x)) return '—';
    try {
      return x.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
    } catch (_) {
      return '$' + Math.round(x);
    }
  }

  function renderDashboardHtml() {
    var s = getStats();
    return (
      '<div class="crozzo-reservorio-dash" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-bottom:14px">' +
      '<div class="card" style="padding:12px"><div class="form-hint">Proveedores</div><strong style="font-size:1.3rem">' + s.proveedores + '</strong></div>' +
      '<div class="card" style="padding:12px"><div class="form-hint">Recepciones</div><strong style="font-size:1.3rem">' + s.recepciones + '</strong><div style="font-size:.78rem;opacity:.8">' + fmtCop(s.totalRecepciones) + '</div></div>' +
      '<div class="card" style="padding:12px"><div class="form-hint">Oficina pend.</div><strong style="font-size:1.3rem">' + s.pendientes + '</strong></div>' +
      '<div class="card" style="padding:12px"><div class="form-hint">Cola planilla</div><strong style="font-size:1.3rem">' + s.colaPlanilla + '</strong></div>' +
      '<div class="card" style="padding:12px"><div class="form-hint">Sync pendiente</div><strong style="font-size:1.3rem">' + s.syncPendiente + '</strong></div>' +
      '<div class="card" style="padding:12px"><div class="form-hint">Mov. inventario</div><strong style="font-size:1.3rem">' + s.movimientosInv + '</strong></div></div>' +
      '<p class="form-hint" style="margin:0">Reservorio unificado · actualizado ' + esc(s.updatedAt || '') + '</p>'
    );
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // Init migration on load
  migrateLegacy();

  global.CrozzoReservorio = {
    LS: LS,
    load: load,
    save: save,
    migrateLegacy: migrateLegacy,
    listProveedores: listProveedores,
    getProveedor: getProveedor,
    upsertProveedor: upsertProveedor,
    syncProveedoresToConfig: syncProveedoresToConfig,
    registrarRecepcion: registrarRecepcion,
    registrarOficina: registrarOficina,
    actualizarEstadoOficina: actualizarEstadoOficina,
    registrarProceso: registrarProceso,
    registrarVenta: registrarVenta,
    registrarOrdenCompraRecibida: registrarOrdenCompraRecibida,
    addInventarioMovimiento: function (mov) {
      var st = migrateLegacy();
      var row = addInventarioMovimiento(st, mov);
      save(st);
      return row;
    },
    getStats: getStats,
    listInventarioMovimientos: listInventarioMovimientos,
    listFeed: listFeed,
    updateFeedEstado: updateFeedEstado,
    exportSnapshot: exportSnapshot,
    renderDashboardHtml: renderDashboardHtml,
    fmtCop: fmtCop,
    getHealth: getHealth,
    repairIfNeeded: repairIfNeeded,
    flushBackup: flushBackup,
  };

  global.crozzoReservorioRegistrarVenta = registrarVenta;
  global.crozzoReservorioUpsertProveedor = upsertProveedor;
})(typeof window !== 'undefined' ? window : globalThis);
