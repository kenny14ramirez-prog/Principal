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
  var RETENTION_DAYS = 365;
  var healthMeta = { recoveredFromBackup: false, lastSaveOk: true, lastSaveError: null, blobMigrated: 0 };

  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  }

  function safeParse(raw, fb) {
    if (raw == null || (typeof raw === 'string' && !String(raw).trim())) return fb;
    try {
      var v = JSON.parse(raw);
      return v == null ? fb : v;
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
      catalogoMp: [],
      costeoMp: [],
      cotizacionesMp: [],
      menuCostos: [],
      recetasPlatos: [],
      recetaDemo: null,
      matrizMp: [],
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
    if (!Array.isArray(st.catalogoMp)) st.catalogoMp = [];
    if (!Array.isArray(st.costeoMp)) st.costeoMp = [];
    if (!Array.isArray(st.cotizacionesMp)) st.cotizacionesMp = [];
    if (!Array.isArray(st.menuCostos)) st.menuCostos = [];
    if (!Array.isArray(st.recetasPlatos)) st.recetasPlatos = [];
    if (!st.recetaDemo) st.recetaDemo = null;
    if (!Array.isArray(st.matrizMp)) st.matrizMp = [];
    if (!Array.isArray(st.planillaFeed)) st.planillaFeed = [];
    if (!Array.isArray(st.syncQueue)) st.syncQueue = [];
    st.businessId = businessId();
    if (!st.meta) st.meta = { migrated: false, migrationNotes: [] };
    if (!Array.isArray(st.meta.archivoRecepciones)) st.meta.archivoRecepciones = [];
    st.version = VERSION;
    return st;
  }

  function isWithinRetention(fecha) {
    if (!fecha) return true;
    var d = new Date(fecha);
    if (isNaN(d.getTime())) return true;
    var cut = new Date();
    cut.setDate(cut.getDate() - RETENTION_DAYS);
    return d >= cut;
  }

  /** Quita base64 del JSON; los bytes viven en CrozzoBlobStore (IndexedDB). */
  function sanitizeAdjuntos(adjuntos) {
    if (!Array.isArray(adjuntos)) return [];
    return adjuntos.slice(0, 16).map(function (a) {
      if (!a) return null;
      return {
        id: a.id,
        nombre: a.nombre,
        mime: a.mime,
        bytes: a.bytes || 0,
        blobRef: a.blobRef || null,
        thumbDataUrl: a.thumbDataUrl || null,
        syncEstado: a.syncEstado || 'local',
        supabasePath: a.supabasePath || null,
      };
    }).filter(Boolean);
  }

  function slimRecepcionArchivo(rec) {
    return {
      id: rec.id,
      fecha: rec.fecha,
      proveedorId: rec.proveedorId,
      proveedorNombre: rec.proveedorNombre,
      valor: rec.valor,
      numeroFactura: rec.numeroFactura,
      metodoPago: rec.metodoPago,
      estado: rec.estado,
      createdAt: rec.createdAt,
      archivedAt: new Date().toISOString(),
    };
  }

  function stripHeavyFromRecepciones(st) {
    st.recepciones.forEach(function (rec) {
      if (rec.adjuntos) rec.adjuntos = sanitizeAdjuntos(rec.adjuntos);
    });
    return st;
  }

  function trimForQuota(st) {
    stripHeavyFromRecepciones(st);
    if (st.syncQueue.length > 300) {
      var pend = st.syncQueue.filter(function (q) { return q.estado === 'pendiente'; });
      var done = st.syncQueue.filter(function (q) { return q.estado !== 'pendiente'; }).slice(0, 80);
      st.syncQueue = pend.concat(done).slice(0, 300);
    }
    if (st.inventarioMovimientos.length > 2500) {
      var invRecientes = st.inventarioMovimientos.filter(function (m) {
        return isWithinRetention(m.fecha || m.createdAt);
      });
      var invViejos = st.inventarioMovimientos.filter(function (m) {
        return !isWithinRetention(m.fecha || m.createdAt);
      });
      st.inventarioMovimientos = invRecientes.concat(invViejos.slice(0, 400));
    }
    var recientes = [];
    var viejas = [];
    st.recepciones.forEach(function (r) {
      if (isWithinRetention(r.fecha || r.createdAt)) recientes.push(r);
      else viejas.push(r);
    });
    if (viejas.length) {
      viejas.forEach(function (r) {
        if (!st.meta.archivoRecepciones.some(function (x) { return x.id === r.id; })) {
          st.meta.archivoRecepciones.unshift(slimRecepcionArchivo(r));
        }
      });
      if (st.meta.archivoRecepciones.length > 800) st.meta.archivoRecepciones.length = 800;
    }
    st.recepciones = recientes;
    if (st.recepciones.length > 2500) st.recepciones.length = 2500;
    if (st.planillaFeed.length > 600) st.planillaFeed.length = 600;
    if (st.facturasOficina.length > 600) st.facturasOficina.length = 600;
    if (st.matrizMp.length > 800) st.matrizMp.length = 800;
    if (st.cotizacionesMp.length > 800) st.cotizacionesMp.length = 800;
    return st;
  }

  function calcCotizacionUnit(precioTotal, peso) {
    var p = Number(precioTotal) || 0;
    var w = Number(peso) || 0;
    if (w <= 0) return 0;
    return Math.round((p / w) * 1000000) / 1000000;
  }

  function listCotizacionesMp(opts) {
    opts = opts || {};
    var st = migrateLegacy();
    var rows = (st.cotizacionesMp || []).slice();
    if (opts.mpId) {
      rows = rows.filter(function (r) {
        return r && String(r.mpId) === String(opts.mpId);
      });
    }
    rows.sort(function (a, b) {
      return String(b.fecha || b.createdAt || '').localeCompare(String(a.fecha || a.createdAt || ''));
    });
    return rows.slice(0, opts.limit || 500);
  }

  function addCotizacionMp(input) {
    if (!input || !input.mpId) return null;
    var st = migrateLegacy();
    var peso = Number(input.peso) || Number(input.cantidad) || 1000;
    var precioTotal = Number(input.precioTotal) || 0;
    if (precioTotal <= 0) return null;
    var row = {
      id: input.id || uid('cot'),
      mpId: String(input.mpId),
      proveedorId: input.proveedorId || null,
      proveedorNombre: String(input.proveedorNombre || input.proveedor || 'Proveedor').trim(),
      precioTotal: precioTotal,
      peso: peso,
      und: String(input.und || 'GR').toUpperCase(),
      precioUnit: calcCotizacionUnit(precioTotal, peso),
      fecha: input.fecha || new Date().toISOString().slice(0, 10),
      notas: input.notas || '',
      vigente: input.vigente !== false,
      createdAt: new Date().toISOString(),
    };
    st.cotizacionesMp.unshift(row);
    pushSync(st, { tipo: 'insert', tabla: 'crozzo_cotizaciones_mp', payload: row });
    save(st);
    try {
      document.dispatchEvent(new CustomEvent('crozzo-cotizaciones-mp:changed', { detail: { row: row }, bubbles: true }));
    } catch (_) {}
    return row;
  }

  function removeCotizacionMp(id) {
    var st = migrateLegacy();
    var before = st.cotizacionesMp.length;
    st.cotizacionesMp = st.cotizacionesMp.filter(function (r) {
      return r && String(r.id) !== String(id);
    });
    if (st.cotizacionesMp.length === before) return false;
    save(st);
    try {
      document.dispatchEvent(new CustomEvent('crozzo-cotizaciones-mp:changed', { detail: { id: id, tipo: 'delete' }, bubbles: true }));
    } catch (_) {}
    return true;
  }

  function upsertMatrizMp(item) {
    if (!item || !item.id) return null;
    var st = migrateLegacy();
    var idx = st.matrizMp.findIndex(function (x) {
      return x.id === item.id;
    });
    var row = {
      id: item.id,
      nombre: item.nombre,
      categoria: item.categoria,
      und: item.und,
      peso: item.peso,
      precioTotal: item.precioTotal,
      precioUnit: item.precioUnit,
      materiaPrimaId: item.materiaPrimaId || null,
      updatedAt: new Date().toISOString(),
    };
    if (idx >= 0) st.matrizMp[idx] = row;
    else st.matrizMp.unshift(row);
    pushSync(st, { tipo: 'upsert', tabla: 'crozzo_matriz_mp', payload: row });
    save(st);
    return row;
  }

  function listMatrizMp(limit) {
    return migrateLegacy().matrizMp.slice(0, limit || 500);
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
    var arch = (st.meta && st.meta.archivoRecepciones) || [];
    return {
      ok: healthMeta.lastSaveOk !== false,
      hasBackup: !!localStorage.getItem(LS_BACKUP),
      hasBackup2: !!localStorage.getItem(LS_BACKUP2),
      recoveredFromBackup: healthMeta.recoveredFromBackup,
      lastSaveError: healthMeta.lastSaveError,
      blobMigrated: healthMeta.blobMigrated,
      retentionDays: RETENTION_DAYS,
      updatedAt: st.updatedAt,
      itemCounts: {
        proveedores: st.proveedores.length,
        recepciones: st.recepciones.length,
        recepcionesArchivo: arch.length,
        syncQueue: st.syncQueue.length,
      },
    };
  }

  function getStorageSummary() {
    var st = load();
    var arch = (st.meta && st.meta.archivoRecepciones) || [];
    var base = {
      retentionDays: RETENTION_DAYS,
      recepcionesActivas: st.recepciones.length,
      recepcionesArchivo: arch.length,
      reservorioKey: LS,
    };
    var B = global.CrozzoBlobStore;
    if (!B || !B.estimateUsage) return Promise.resolve(base);
    return B.estimateUsage()
      .then(function (u) {
        return Object.assign(base, { blobs: u });
      })
      .catch(function () {
        return base;
      });
  }

  function runBlobMigration(st) {
    var B = global.CrozzoBlobStore;
    if (!B || !B.migrateReservorioAdjuntos) return Promise.resolve(st);
    return B.migrateReservorioAdjuntos(st).then(function (r) {
      healthMeta.blobMigrated = (r && r.migrated) || 0;
      if (r && r.migrated) {
        stripHeavyFromRecepciones(st);
        saveSafe(st);
      }
      return st;
    });
  }

  function repairIfNeeded() {
    var st = loadWithRecovery();
    if (!st.meta.migrated) st = migrateLegacy();
    stripHeavyFromRecepciones(st);
    if (dedupeRecepcionesBurst(st)) save(st);
    syncProveedoresBidirectional();
    runBlobMigration(st);
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
      categoria: p.categoria || p.tipoRubro || '',
      tipoRubro: p.tipoRubro || p.categoria || '',
      representante: p.representante || '',
      email: p.email || '',
      legal: p.legal && typeof p.legal === 'object' ? p.legal : {},
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

  /** Une reservorio ↔ config.proveedoresOC (entrada de factura + módulo Proveedores). */
  function syncProveedoresBidirectional() {
    var st = migrateLegacy();
    try {
      if (typeof global.config !== 'undefined' && global.config.get) {
        var oc = global.config.get('proveedoresOC') || [];
        if (Array.isArray(oc)) {
          oc.forEach(function (p) {
            if (!p || !(p.name || p.nombre)) return;
            upsertProveedorInternal(st, {
              id: p.id,
              nombre: p.name || p.nombre,
              nit: p.nit,
              telefono: p.phone || p.telefono,
              tipoRubro: p.tipoRubro || p.categoria || '',
            });
          });
        }
      }
    } catch (_) {}
    syncProveedoresToConfig(st);
    save(st);
    return st.proveedores.filter(function (p) { return p.activo !== false; });
  }

  function proveedorToOcRow(p) {
    return {
      id: p.id,
      name: p.nombre,
      nombre: p.nombre,
      nit: p.nit || '',
      phone: p.telefono || '',
      telefono: p.telefono || '',
      tipoRubro: p.tipoRubro || p.categoria || '',
      representante: p.representante || '',
      email: p.email || '',
    };
  }

  function listProveedoresOcFormat() {
    return syncProveedoresBidirectional().map(proveedorToOcRow);
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

  function mpInvUnidad(und) {
    var u = String(und || 'GR').toUpperCase();
    if (u === 'ML') return 'ml';
    if (u === 'UND' || u === 'UNI') return 'und';
    if (u === 'KG') return 'kg';
    return 'g';
  }

  /** Reemplaza movimientos de inventario de una recepción y registra entradas por línea MP. */
  function syncInventarioRecepcion(st, rec, items) {
    if (!rec || !rec.id) return;
    st.inventarioMovimientos = (st.inventarioMovimientos || []).filter(function (m) {
      return !(m.refTipo === 'recepcion' && String(m.refId) === String(rec.id));
    });
    (items || []).forEach(function (line) {
      if (!line) return;
      var mpId = line.mpId || line.productoRefId;
      if (!mpId) return;
      var cant = Number(line.cantidad) || Number(line.peso) || 0;
      if (cant <= 0) return;
      var pTotal = Number(line.precioTotal != null ? line.precioTotal : line.valor) || 0;
      addInventarioMovimiento(st, {
        tipo: 'entrada_proveedor',
        refTipo: 'recepcion',
        refId: rec.id,
        productoRefId: mpId,
        productoRefTipo: 'materia_prima',
        productoNombre: line.productoNombre || line.nombre || 'Materia prima',
        cantidad: cant,
        unidad: mpInvUnidad(line.und || line.unidad),
        costoUnitario: cant > 0 && pTotal > 0 ? pTotal / cant : 0,
        notas:
          'Ingreso por factura' +
          (rec.numeroFactura ? ' ' + rec.numeroFactura : '') +
          (rec.proveedorNombre ? ' · ' + rec.proveedorNombre : ''),
        fecha: rec.fecha,
      });
    });
  }

  /**
   * Compras por materia prima en un rango (recepciones confirmadas).
   * opts: { dias, desde, hasta, categoria, mpId, q }
   */
  function getComprasMpResumen(opts) {
    opts = opts || {};
    var dias = Number(opts.dias);
    if (!isFinite(dias) || dias <= 0) dias = 30;
    var hasta = opts.hasta || new Date().toISOString().slice(0, 10);
    var desde = opts.desde;
    if (!desde) {
      var d0 = new Date();
      d0.setDate(d0.getDate() - dias);
      desde = d0.toISOString().slice(0, 10);
    }
    var catFilt = opts.categoria ? String(opts.categoria).toUpperCase() : '';
    var mpFilt = opts.mpId ? String(opts.mpId) : '';
    var q = opts.q ? String(opts.q).toLowerCase().trim() : '';
    var catApi = global.CrozzoCatalogoMp;
    var byMp = {};

    migrateLegacy().recepciones.forEach(function (rec) {
      if (!rec || rec.estado === 'anulada') return;
      var fecha = String(rec.fecha || rec.createdAt || '').slice(0, 10);
      if (fecha < desde || fecha > hasta) return;
      (rec.items || []).forEach(function (line) {
        if (!line) return;
        var mpId = String(line.mpId || line.productoRefId || '').trim();
        if (!mpId) return;
        var mp = catApi && catApi.get ? catApi.get(mpId) : null;
        var nombre = line.productoNombre || (mp && mp.nombre) || mpId;
        var categoria = String(line.categoria || (mp && mp.categoria) || 'OTRO').toUpperCase();
        if (catFilt && categoria !== catFilt) return;
        if (mpFilt && mpId !== mpFilt) return;
        if (q && nombre.toLowerCase().indexOf(q) < 0 && categoria.toLowerCase().indexOf(q) < 0) return;
        if (!byMp[mpId]) {
          byMp[mpId] = {
            mpId: mpId,
            nombre: nombre,
            categoria: categoria,
            und: (mp && mp.und) || line.und || 'GR',
            cantidad: 0,
            valor: 0,
            compras: 0,
          };
        }
        byMp[mpId].cantidad += Number(line.cantidad) || Number(line.peso) || 0;
        byMp[mpId].valor += Number(line.precioTotal) || 0;
        byMp[mpId].compras += 1;
      });
    });

    var filas = Object.keys(byMp).map(function (k) {
      return byMp[k];
    });
    filas.sort(function (a, b) {
      return b.valor - a.valor;
    });
    var totalValor = filas.reduce(function (s, f) {
      return s + f.valor;
    }, 0);
    var totalCant = filas.reduce(function (s, f) {
      return s + f.cantidad;
    }, 0);
    return {
      desde: desde,
      hasta: hasta,
      dias: dias,
      filas: filas,
      totalValor: totalValor,
      totalCant: totalCant,
      totalFilas: filas.length,
    };
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

  function pushAlertaPrecio(st, alerta) {
    if (!st.meta) st.meta = {};
    if (!Array.isArray(st.meta.alertasPrecio)) st.meta.alertasPrecio = [];
    var row = Object.assign(
      {
        id: uid('alrt'),
        fecha: new Date().toISOString(),
        leida: false,
      },
      alerta || {}
    );
    st.meta.alertasPrecio.unshift(row);
    if (st.meta.alertasPrecio.length > 80) st.meta.alertasPrecio.length = 80;
    return row;
  }

  /** Evita ráfagas de la misma factura (doble clic / handlers duplicados). */
  function findRecepcionDuplicadaReciente(input) {
    input = input || {};
    var pid = String(input.proveedorId || '');
    var nf = String(input.numeroFactura || '').trim();
    var val = Number(input.valor) || 0;
    var nItems = (input.items && input.items.length) || 0;
    var lim = Date.now() - 120000;
    var st = migrateLegacy();
    for (var i = 0; i < st.recepciones.length && i < 30; i++) {
      var r = st.recepciones[i];
      if (!r) continue;
      var t = new Date(r.createdAt || r.fecha || 0).getTime();
      if (t < lim) break;
      if (String(r.proveedorId) !== pid) continue;
      if (String(r.numeroFactura || '').trim() !== nf) continue;
      if (Math.abs(Number(r.valor) - val) >= 1) continue;
      if (((r.items && r.items.length) || 0) !== nItems) continue;
      return r;
    }
    return null;
  }

  function dedupeRecepcionesBurst(st) {
    if (!st || !Array.isArray(st.recepciones) || st.recepciones.length < 2) return false;
    var seen = {};
    var kept = [];
    var removed = 0;
    st.recepciones.forEach(function (r) {
      if (!r) return;
      var t = new Date(r.createdAt || r.fecha || 0).getTime();
      var bucket = isFinite(t) ? Math.floor(t / 3000) : 0;
      var sig =
        String(r.proveedorId || '') +
        '|' +
        String(r.numeroFactura || '').trim() +
        '|' +
        Math.round(Number(r.valor) || 0) +
        '|' +
        ((r.items && r.items.length) || 0) +
        '|' +
        bucket;
      if (seen[sig]) {
        removed++;
        return;
      }
      seen[sig] = true;
      kept.push(r);
    });
    if (!removed) return false;
    st.recepciones = kept;
    return true;
  }

  function registrarRecepcion(input) {
    input = input || {};
    var rid = input.id ? String(input.id) : '';
    if (rid) {
      var prev = getRecepcion(rid);
      if (prev) return actualizarRecepcion(rid, input);
    }
    if (!input._forceNew) {
      var dup = findRecepcionDuplicadaReciente(input);
      if (dup) return actualizarRecepcion(dup.id, input);
    }
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
      numeroFactura: input.numeroFactura || '',
      metodoPago: input.metodoPago || input.metodo || 'por_definir',
      comentarios: input.comentarios || '',
      adjuntos: sanitizeAdjuntos(input.adjuntos),
      syncEstado: input.syncEstado || 'pendiente_nube',
      alertasPrecio: Array.isArray(input.alertasPrecio) ? input.alertasPrecio : [],
      estado: input.estado || 'confirmada',
      items: input.items || [],
      createdAt: input.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    st.recepciones.unshift(rec);

    var items = Array.isArray(input.items) ? input.items : [];
    if (items.length) {
      syncInventarioRecepcion(st, rec, items);
    } else {
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
    }

    var factura = null;
    if (valor > 0 && input.crearOficina !== false) {
      factura = {
        id: uid('of'),
        fecha: rec.fecha,
        proveedorId: prov.id,
        proveedorNombre: prov.nombre,
        valor: valor,
        metodo: input.metodoPago || input.metodo || 'por_definir',
        estado: 'pendiente',
        recepcionId: rec.id,
        notas: rec.comentarios || rec.notas,
        numeroFactura: rec.numeroFactura,
        createdAt: new Date().toISOString(),
      };
      st.facturasOficina.unshift(factura);
      pushSync(st, { tipo: 'insert', tabla: 'facturas', payload: factura });
    }

    pushSync(st, { tipo: 'insert', tabla: 'recepciones', payload: rec });
    save(st);

    var costeoActualizado = [];
    if (items.length && global.CrozzoCatalogoMp && global.CrozzoCatalogoMp.applyRecepcionItems) {
      try {
        costeoActualizado = global.CrozzoCatalogoMp.applyRecepcionItems(items, {
          recepcionId: rec.id,
          fecha: rec.createdAt,
          skipConfirm: input.skipConfirmVariacion === true,
        }) || [];
      } catch (costeoErr) {
        console.warn('[reservorio] costeo recepción', costeoErr);
      }
    }

    if (rec.alertasPrecio && rec.alertasPrecio.length) {
      rec.alertasPrecio.forEach(function (a) {
        pushAlertaPrecio(st, Object.assign({ recepcionId: rec.id, proveedorNombre: rec.proveedorNombre }, a));
      });
    }

    emitCostos('crozzo-costos:recepcion-registrada', {
      recepcion: rec,
      facturaOficina: factura,
      proveedor: prov,
      items: items,
      costeoActualizado: costeoActualizado,
      alertasPrecio: rec.alertasPrecio,
    });
    try {
      global.dispatchEvent(
        new CustomEvent('crozzo-recepcion:guardada', {
          detail: { recepcion: rec, alertasPrecio: rec.alertasPrecio },
        })
      );
    } catch (_) {}

    return { recepcion: rec, facturaOficina: factura, costeoActualizado: costeoActualizado };
  }

  function getRecepcion(id) {
    return migrateLegacy().recepciones.find(function (r) {
      return String(r.id) === String(id);
    });
  }

  function listRecepciones(limit) {
    return migrateLegacy().recepciones.slice(0, limit || 100);
  }

  function eliminarRecepcion(id) {
    var st = migrateLegacy();
    var sid = String(id || '');
    if (!sid) return false;
    var idx = st.recepciones.findIndex(function (r) {
      return String(r.id) === sid;
    });
    if (idx < 0) return false;
    var removed = st.recepciones[idx];

    st.inventarioMovimientos = (st.inventarioMovimientos || []).filter(function (m) {
      return !(m.refTipo === 'recepcion' && String(m.refId) === sid);
    });

    st.facturasOficina = (st.facturasOficina || []).filter(function (f) {
      return String(f.recepcionId || '') !== sid;
    });

    if (st.meta && Array.isArray(st.meta.alertasPrecio)) {
      st.meta.alertasPrecio = st.meta.alertasPrecio.filter(function (a) {
        return String(a.recepcionId || '') !== sid;
      });
    }

    st.recepciones.splice(idx, 1);
    pushSync(st, { tipo: 'delete', tabla: 'recepciones', payload: { id: sid } });
    save(st);

    emitCostos('crozzo-costos:recepcion-eliminada', { recepcion: removed, id: sid });
    try {
      global.dispatchEvent(
        new CustomEvent('crozzo-recepcion:eliminada', {
          detail: { recepcion: removed, id: sid },
        })
      );
    } catch (_) {}

    return true;
  }

  function actualizarRecepcion(id, input) {
    var st = migrateLegacy();
    var idx = st.recepciones.findIndex(function (r) {
      return String(r.id) === String(id);
    });
    if (idx < 0) return null;
    var prev = st.recepciones[idx];
    var patch = Object.assign({}, input || {}, { updatedAt: new Date().toISOString() });
    if (patch.adjuntos) patch.adjuntos = sanitizeAdjuntos(patch.adjuntos);
    var next = Object.assign({}, prev, patch);
    st.recepciones[idx] = next;
    if (input && input.items && input.items.length) {
      syncInventarioRecepcion(st, next, input.items);
    }
    pushSync(st, { tipo: 'update', tabla: 'recepciones', payload: next });
    save(st);
    var costeoActualizado = [];
    if (input && input.items && global.CrozzoCatalogoMp && global.CrozzoCatalogoMp.applyRecepcionItems) {
      try {
        costeoActualizado = global.CrozzoCatalogoMp.applyRecepcionItems(input.items, {
          recepcionId: next.id,
          fecha: next.updatedAt,
          skipConfirm: input.skipConfirmVariacion === true,
        }) || [];
      } catch (costeoErr) {
        console.warn('[reservorio] costeo recepción (update)', costeoErr);
      }
    }
    emitCostos('crozzo-costos:recepcion-actualizada', {
      recepcion: next,
      anterior: prev,
      costeoActualizado: costeoActualizado,
    });
    return { recepcion: next, costeoActualizado: costeoActualizado };
  }

  function listAlertasPrecio(limit) {
    var st = migrateLegacy();
    var list = (st.meta && st.meta.alertasPrecio) || [];
    return list.slice(0, limit || 40);
  }

  function registrarOficina(input) {
    var st = migrateLegacy();
    var prov = getProveedor(input.proveedorId) || { id: input.proveedorId, nombre: input.proveedorNombre };
    var fac = {
      id: input.id || uid('of'),
      fecha: input.fecha || new Date().toISOString().slice(0, 10),
      proveedorId: prov.id,
      proveedorNombre: prov.nombre || input.proveedorNombre,
      numeroFactura: String(input.numeroFactura || '').trim(),
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

  function renderComprasMpDashboardHtml(opts) {
    opts = opts || {};
    var res = getComprasMpResumen(opts);
    var undLbl = function (und) {
      var u = String(und || 'GR').toUpperCase();
      if (u === 'ML') return 'ml';
      if (u === 'UND' || u === 'UNI') return 'und';
      return 'g';
    };
    if (!res.filas.length) {
      return (
        '<p class="form-hint" style="margin:8px 0 0">Sin compras de materia prima entre ' +
        esc(res.desde) +
        ' y ' +
        esc(res.hasta) +
        '.</p>'
      );
    }
    var top = res.filas.slice(0, 15);
    return (
      '<div class="crozzo-compras-mp-dash" style="margin-top:14px">' +
      '<h3 style="margin:0 0 8px;font-size:1rem">Compras por materia prima</h3>' +
      '<p class="form-hint" style="margin:0 0 10px">Período ' +
      esc(res.desde) +
      ' → ' +
      esc(res.hasta) +
      ' · ' +
      res.totalFilas +
      ' producto(s) · ' +
      fmtCop(res.totalValor) +
      '</p>' +
      '<div class="crozzo-mod-table-scroll"><table class="crozzo-mod-table"><thead><tr>' +
      '<th>Materia prima</th><th>Categoría</th><th style="text-align:right">Cantidad</th><th style="text-align:right">Valor comprado</th><th style="text-align:right"># compras</th>' +
      '</tr></thead><tbody>' +
      top
        .map(function (f) {
          return (
            '<tr><td><strong>' +
            esc(f.nombre) +
            '</strong></td><td>' +
            esc(f.categoria) +
            '</td><td style="text-align:right">' +
            (Math.round(f.cantidad * 100) / 100).toLocaleString('es-CO') +
            ' ' +
            esc(undLbl(f.und)) +
            '</td><td style="text-align:right">' +
            fmtCop(f.valor) +
            '</td><td style="text-align:right">' +
            f.compras +
            '</td></tr>'
          );
        })
        .join('') +
      '</tbody></table></div>' +
      (res.filas.length > 15
        ? '<p class="form-hint" style="margin:8px 0 0">Mostrando top 15 de ' + res.filas.length + '.</p>'
        : '') +
      '</div>'
    );
  }

  function renderDashboardHtml(opts) {
    opts = opts || {};
    var s = getStats();
    var dias = Number(opts.dias) > 0 ? Number(opts.dias) : 30;
    return (
      '<div class="crozzo-reservorio-dash" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-bottom:14px">' +
      '<div class="card" style="padding:12px"><div class="form-hint">Proveedores</div><strong style="font-size:1.3rem">' + s.proveedores + '</strong></div>' +
      '<div class="card" style="padding:12px"><div class="form-hint">Recepciones</div><strong style="font-size:1.3rem">' + s.recepciones + '</strong><div style="font-size:.78rem;opacity:.8">' + fmtCop(s.totalRecepciones) + '</div></div>' +
      '<div class="card" style="padding:12px"><div class="form-hint">Oficina pend.</div><strong style="font-size:1.3rem">' + s.pendientes + '</strong></div>' +
      '<div class="card" style="padding:12px"><div class="form-hint">Cola planilla</div><strong style="font-size:1.3rem">' + s.colaPlanilla + '</strong></div>' +
      '<div class="card" style="padding:12px"><div class="form-hint">Sync pendiente</div><strong style="font-size:1.3rem">' + s.syncPendiente + '</strong></div>' +
      '<div class="card" style="padding:12px"><div class="form-hint">Mov. inventario</div><strong style="font-size:1.3rem">' + s.movimientosInv + '</strong></div>' +
      (function () {
        var al = (migrateLegacy().meta && migrateLegacy().meta.alertasPrecio) || [];
        var pend = al.filter(function (a) { return !a.leida && (a.nivel === 'alerta' || a.nivel === 'sube'); }).length;
        if (!pend) return '';
        return '<div class="card" style="padding:12px;border-color:rgba(255,159,10,.4)"><div class="form-hint">Alertas precio</div><strong style="font-size:1.3rem;color:var(--warning)">' + pend + '</strong></div>';
      })() +
      '</div>' +
      '<p class="form-hint" style="margin:0">Reservorio unificado · actualizado ' + esc(s.updatedAt || '') + '</p>' +
      renderComprasMpDashboardHtml({ dias: dias, categoria: opts.categoria, q: opts.q })
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
    syncProveedoresBidirectional: syncProveedoresBidirectional,
    listProveedoresOcFormat: listProveedoresOcFormat,
    getProveedor: getProveedor,
    upsertProveedor: upsertProveedor,
    syncProveedoresToConfig: syncProveedoresToConfig,
    listCotizacionesMp: listCotizacionesMp,
    addCotizacionMp: addCotizacionMp,
    removeCotizacionMp: removeCotizacionMp,
    registrarRecepcion: registrarRecepcion,
    getRecepcion: getRecepcion,
    listRecepciones: listRecepciones,
    eliminarRecepcion: eliminarRecepcion,
    actualizarRecepcion: actualizarRecepcion,
    listAlertasPrecio: listAlertasPrecio,
    pushAlertaPrecio: function (alerta) {
      var st = migrateLegacy();
      var row = pushAlertaPrecio(st, alerta);
      save(st);
      return row;
    },
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
    upsertMatrizMp: upsertMatrizMp,
    listMatrizMp: listMatrizMp,
    listCatalogoMp: function (limit) {
      return migrateLegacy().catalogoMp.slice(0, limit || 500);
    },
    listFeed: listFeed,
    updateFeedEstado: updateFeedEstado,
    exportSnapshot: exportSnapshot,
    renderDashboardHtml: renderDashboardHtml,
    getComprasMpResumen: getComprasMpResumen,
    renderComprasMpDashboardHtml: renderComprasMpDashboardHtml,
    fmtCop: fmtCop,
    getHealth: getHealth,
    getStorageSummary: getStorageSummary,
    sanitizeAdjuntos: sanitizeAdjuntos,
    retentionDays: function () {
      return RETENTION_DAYS;
    },
    repairIfNeeded: repairIfNeeded,
    runBlobMigration: runBlobMigration,
    flushBackup: flushBackup,
  };

  global.crozzoReservorioRegistrarVenta = registrarVenta;
  global.crozzoReservorioUpsertProveedor = upsertProveedor;
})(typeof window !== 'undefined' ? window : globalThis);
