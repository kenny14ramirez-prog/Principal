/**
 * Crozzo POS — Catálogo MP + Costeo MP (dos capas conectadas)
 * Catálogo: nombre, categoría, proveedores → recetas, inventario, proveedores
 * Costeo: unidad, peso, precio total, $/u → fórmulas y márgenes
 */
(function (global) {
  'use strict';

  var CATALOG_VERSION = 4;
  var RECETAS_VERSION = 1;
  var DEFAULT_RECIPE_OPTS = {
    margenErrorPct: 0.03,
    porcentajeMpObjetivo: 0.3,
    impuestoPct: 0.08,
    porciones: 1,
  };
  var LS_LEGACY_MATRIZ = 'crozzo_costos_matriz_v1';
  var LS_SEED_FLAG = 'crozzo_catalogo_mp_seeded_v2';
  var DEMO_JSON = 'data/catalogo-demo.json';

  var demoCache = null;
  var ready = false;
  var readyCbs = [];

  function num(v, fb) {
    var n = Number(v);
    return isFinite(n) ? n : fb == null ? 0 : fb;
  }

  function engine() {
    return global.CrozzoCostosEngine || null;
  }

  function calcPrecioUnit(row) {
    var e = engine();
    if (e) return e.round(e.precioUnitarioMp(row.precioTotal, row.peso), 6);
    var w = num(row.peso);
    if (w <= 0) return num(row.precioUnit);
    return Math.round((num(row.precioTotal) / w) * 1000000) / 1000000;
  }

  function slugId(nombre) {
    var s = String(nombre || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 72);
    return s ? 'mp_' + s : 'mp_' + Date.now();
  }

  function slugPlato(nombre) {
    return String(nombre || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '_')
      .slice(0, 80);
  }

  function normalizeLineaReceta(raw) {
    if (!raw) return null;
    return {
      mpId: String(raw.mpId || '').trim(),
      ingrediente: String(raw.ingrediente || raw.nombre || '').trim(),
      unidad: String(raw.unidad || raw.und || 'GR').trim().toUpperCase(),
      cantidad: raw.cantidad != null ? raw.cantidad : 0,
    };
  }

  function normalizeRecetaPlato(raw) {
    if (!raw) return null;
    var slug = String(raw.slug || slugPlato(raw.producto || raw.nombre)).trim();
    if (!slug) return null;
    var lineas = Array.isArray(raw.lineas)
      ? raw.lineas.map(normalizeLineaReceta).filter(Boolean)
      : [];
    return {
      slug: slug,
      producto: String(raw.producto || raw.nombre || slug).trim(),
      productoId: raw.productoId != null ? raw.productoId : null,
      opts: Object.assign({}, DEFAULT_RECIPE_OPTS, raw.opts || {}),
      lineas: lineas,
      updatedAt: raw.updatedAt || new Date().toISOString(),
    };
  }

  function migrateRecetasShape(st) {
    if (!st) return;
    if (!Array.isArray(st.recetasPlatos)) st.recetasPlatos = [];
    if (!st.meta) st.meta = { migrated: false, migrationNotes: [] };

    var bySlug = {};
    st.recetasPlatos.forEach(function (r) {
      var n = normalizeRecetaPlato(r);
      if (n) bySlug[n.slug] = n;
    });

    var firstRun = st.meta.recetasVersion < RECETAS_VERSION;
    if (firstRun && st.recetaDemo) {
      var demo = normalizeRecetaPlato(st.recetaDemo);
      if (demo && !bySlug[demo.slug]) bySlug[demo.slug] = demo;
    }

    var added = false;
    (st.menuCostos || []).forEach(function (m) {
      if (!m || !m.producto) return;
      var slug = String(m.slug || slugPlato(m.producto)).trim();
      if (!bySlug[slug]) {
        bySlug[slug] = normalizeRecetaPlato({ slug: slug, producto: m.producto, lineas: [] });
        added = true;
      }
    });

    if (firstRun || added || Object.keys(bySlug).length !== st.recetasPlatos.length) {
      st.recetasPlatos = Object.keys(bySlug).map(function (k) {
        return bySlug[k];
      });
      st.meta.recetasVersion = RECETAS_VERSION;
      saveStore(st);
    }
  }

  function normalizeUnd(u) {
    var s = String(u || 'GR')
      .trim()
      .toUpperCase();
    if (s === 'GRS' || s === 'G') return 'GR';
    if (s === 'UN' || s === 'UNIDAD') return 'UNI';
    return s || 'GR';
  }

  function parseProveedores(raw) {
    if (Array.isArray(raw)) {
      return raw
        .map(function (p) {
          return String(p || '').trim();
        })
        .filter(Boolean);
    }
    if (typeof raw === 'string' && raw.trim()) {
      return raw
        .split(/[,;|]/)
        .map(function (p) {
          return p.trim();
        })
        .filter(Boolean);
    }
    return [];
  }

  function reservorio() {
    return global.CrozzoReservorio || null;
  }

  function normalizeCatalogItem(raw) {
    if (!raw) return null;
    var id = String(raw.id || slugId(raw.nombre)).trim();
    var item = {
      id: id,
      nombre: String(raw.nombre || '').trim(),
      categoria: String(raw.categoria || 'OTRO').trim().toUpperCase(),
      proveedores: parseProveedores(raw.proveedores),
      materiaPrimaId: raw.materiaPrimaId || null,
      areaPedido: raw.areaPedido ? String(raw.areaPedido).trim() : null,
      activo: raw.activo !== false,
      updatedAt: raw.updatedAt || new Date().toISOString(),
    };
    if (!item.nombre) return null;
    return item;
  }

  function normalizeCosteoItem(raw, mpId) {
    if (!raw && !mpId) return null;
    var id = String(mpId || raw.mpId || raw.id || '').trim();
    if (!id) return null;
    var item = {
      mpId: id,
      und: normalizeUnd(raw && raw.und),
      peso: num(raw && raw.peso, 1000),
      precioTotal: num(raw && raw.precioTotal),
      precioUnit: 0,
      precioAnterior: raw && raw.precioAnterior != null ? num(raw.precioAnterior) : null,
      ultimaRecepcionId: (raw && raw.ultimaRecepcionId) || null,
      ultimaRecepcionAt: (raw && raw.ultimaRecepcionAt) || null,
      updatedAt: (raw && raw.updatedAt) || new Date().toISOString(),
    };
    item.precioUnit = calcPrecioUnit(item);
    return item;
  }

  function confirmVariacionPrecio(anterior, nuevo, opts) {
    opts = opts || {};
    if (opts.skipVariacionCheck || opts.skipConfirm) return true;
    var e = engine();
    if (!e || !e.evaluarVariacionPrecio) return true;
    var ev = e.evaluarVariacionPrecio(anterior, nuevo, opts);
    if (ev.ok) return true;
    return confirm(ev.mensaje);
  }

  function mergeItem(catRow, costRow) {
    if (!catRow) return null;
    var c = costRow || { mpId: catRow.id, und: 'GR', peso: 1000, precioTotal: 0, precioUnit: 0 };
    return {
      id: catRow.id,
      nombre: catRow.nombre,
      categoria: catRow.categoria,
      proveedores: (catRow.proveedores || []).slice(),
      und: c.und,
      peso: c.peso,
      precioTotal: c.precioTotal,
      precioUnit: c.precioUnit,
      materiaPrimaId: catRow.materiaPrimaId,
      areaPedido: catRow.areaPedido || null,
      activo: catRow.activo !== false,
      precioAnterior: c.precioAnterior,
      ultimaRecepcionId: c.ultimaRecepcionId,
      ultimaRecepcionAt: c.ultimaRecepcionAt,
      updatedAt: catRow.updatedAt,
    };
  }

  function loadStore() {
    var rv = reservorio();
    if (!rv || !rv.migrateLegacy) return { catalogoMp: [], costeoMp: [], menuCostos: [], recetaDemo: null };
    var st = rv.migrateLegacy();
    if (!Array.isArray(st.catalogoMp)) st.catalogoMp = [];
    if (!Array.isArray(st.costeoMp)) st.costeoMp = [];
    if (!Array.isArray(st.menuCostos)) st.menuCostos = [];
    migrateStoreShape(st);
    return st;
  }

  function migrateStoreShape(st) {
    if (!st.meta) st.meta = { migrated: false, migrationNotes: [] };
    if (st.meta.catalogoVersion >= CATALOG_VERSION) return;

    var costById = {};
    (st.costeoMp || []).forEach(function (c) {
      if (c && c.mpId) costById[c.mpId] = c;
    });

    var newCatalog = [];
    var newCosteo = [];

    (st.catalogoMp || []).forEach(function (row) {
      if (!row || !row.nombre) return;
      var id = String(row.id || slugId(row.nombre)).trim();
      var hasCostFields = row.und != null || row.peso != null || row.precioTotal != null;
      var cat = normalizeCatalogItem({
        id: id,
        nombre: row.nombre,
        categoria: row.categoria,
        proveedores: row.proveedores,
        materiaPrimaId: row.materiaPrimaId,
        areaPedido: row.areaPedido,
        activo: row.activo,
        updatedAt: row.updatedAt,
      });
      if (!cat) return;
      newCatalog.push(cat);

      var cost = costById[id] || (hasCostFields ? row : null);
      var costNorm = normalizeCosteoItem(
        cost || { und: 'GR', peso: 1000, precioTotal: 0 },
        id
      );
      if (costNorm) newCosteo.push(costNorm);
    });

    st.catalogoMp = newCatalog;
    st.costeoMp = newCosteo;
    st.meta.catalogoVersion = CATALOG_VERSION;
    var notes = st.meta.migrationNotes || [];
    notes.push('Catálogo v4: catálogo + costeo separados ' + new Date().toISOString().slice(0, 10));
    st.meta.migrationNotes = notes.slice(-12);
    migrateRecetasShape(st);
    saveStore(st);
  }

  function saveStore(st) {
    var rv = reservorio();
    if (rv && rv.save) rv.save(st);
  }

  function getCosteoRow(st, mpId) {
    return (st.costeoMp || []).find(function (x) {
      return x && String(x.mpId) === String(mpId);
    });
  }

  function list() {
    var st = loadStore();
    return st.catalogoMp
      .filter(function (x) {
        return x && x.activo !== false;
      })
      .map(function (cat) {
        return mergeItem(cat, getCosteoRow(st, cat.id));
      })
      .sort(function (a, b) {
        return String(a.nombre).localeCompare(String(b.nombre), 'es');
      });
  }

  function listCatalog() {
    return loadStore()
      .catalogoMp.filter(function (x) {
        return x && x.activo !== false;
      })
      .sort(function (a, b) {
        return String(a.nombre).localeCompare(String(b.nombre), 'es');
      });
  }

  function get(id) {
    var st = loadStore();
    var cat = st.catalogoMp.find(function (x) {
      return x && String(x.id) === String(id);
    });
    if (!cat || cat.activo === false) return null;
    return mergeItem(cat, getCosteoRow(st, id));
  }

  function getByNombre(nombre) {
    var q = String(nombre || '').trim().toUpperCase();
    var found = loadStore().catalogoMp.find(function (x) {
      return x && String(x.nombre || '').trim().toUpperCase() === q;
    });
    return found ? get(found.id) : null;
  }

  function emitChanged(detail) {
    detail = detail || {};
    try {
      document.dispatchEvent(new CustomEvent('crozzo-catalogo-mp:changed', { detail: detail, bubbles: true }));
    } catch (_) {}
    try {
      if (typeof global.crozzoCostosEmit === 'function') {
        global.crozzoCostosEmit('crozzo-catalogo-mp:changed', detail);
      }
      if (
        detail.tipo === 'precio' ||
        detail.tipo === 'costeo' ||
        detail.tipo === 'upsert' ||
        detail.tipo === 'recepcion-precio'
      ) {
        var item = detail.item || detail.merged;
        global.crozzoCostosEmit('crozzo-costos:precio-mp-cambiado', {
          producto: item && item.nombre,
          precioUnit: item && item.precioUnit,
          item: item,
        });
      }
    } catch (_) {}
  }

  function propagateRename(st, id, oldNombre, newNombre) {
    var oldU = String(oldNombre || '').trim();
    var neu = String(newNombre || '').trim();
    if (!oldU || oldU === neu) return;
    st.inventarioMovimientos.forEach(function (m) {
      if (String(m.productoRefId) === String(id) || m.productoNombre === oldU) {
        m.productoNombre = neu;
        if (!m.productoRefId || m.productoRefId === 'general') m.productoRefId = id;
        m.productoRefTipo = 'materia_prima';
      }
    });
    if (st.recetaDemo && Array.isArray(st.recetaDemo.lineas)) {
      st.recetaDemo.lineas.forEach(function (ln) {
        if (ln.mpId === id || ln.ingrediente === oldU) {
          ln.ingrediente = neu;
          if (!ln.mpId) ln.mpId = id;
        }
      });
    }
    migrateRecetasShape(st);
    (st.recetasPlatos || []).forEach(function (rec) {
      if (!rec || !Array.isArray(rec.lineas)) return;
      rec.lineas.forEach(function (ln) {
        if (ln.mpId === id || ln.ingrediente === oldU) {
          ln.ingrediente = neu;
          if (!ln.mpId) ln.mpId = id;
        }
      });
    });
  }

  function syncInventarioLedger(item) {
    var rv = reservorio();
    if (!rv || !rv.addInventarioMovimiento) return;
    rv.addInventarioMovimiento({
      tipo: 'inicial',
      productoRefTipo: 'materia_prima',
      productoRefId: item.id,
      productoNombre: item.nombre,
      cantidad: 0,
      unidad: item.und === 'GR' || item.und === 'KG' ? 'kg' : 'und',
      costoUnitario: item.precioUnit,
      notas: 'Alta en catálogo MP',
    });
  }

  function mapCategoriaInventario(catExcel) {
    var c = String(catExcel || '').toUpperCase();
    if (c === 'LACTEOS') return 'Lácteo';
    if (c === 'FRUVER') return 'Vegetal';
    if (c === 'PROTEINAS') return 'Otro';
    return 'Otro';
  }

  function cloudReady() {
    try {
      if (typeof global.crozzoShouldUseCloud === 'function') return global.crozzoShouldUseCloud();
      var raw = localStorage.getItem('crozzo_supabase_config');
      if (!raw) return false;
      var j = JSON.parse(raw);
      return !!(j.syncEnabled && j.url && String(j.key || j.anonKey || '').length > 20);
    } catch (_) {
      return false;
    }
  }

  function syncCloud(item, prevNombre) {
    if (!cloudReady() || !item) return;
    try {
      var raw = localStorage.getItem('crozzo_supabase_config');
      var j = JSON.parse(raw);
      var key = String(j.key || j.anonKey || '').trim();
      var base = String(j.url || '').replace(/\/$/, '');
      if (!base || key.length < 20) return;
      var H = {
        apikey: key,
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      };
      var lookup = prevNombre && prevNombre !== item.nombre ? prevNombre : item.nombre;
      fetch(base + '/rest/v1/materias_primas?nombre=eq.' + encodeURIComponent(lookup) + '&select=id,nombre&limit=1', {
        headers: H,
      })
        .then(function (r) {
          return r.json();
        })
        .then(function (rows) {
          var body = {
            nombre: item.nombre,
            categoria: mapCategoriaInventario(item.categoria),
            merma_coccion_pct: 0,
            merma_porcionado_pct: 0,
          };
          if (Array.isArray(rows) && rows[0] && rows[0].id) {
            item.materiaPrimaId = rows[0].id;
            return fetch(base + '/rest/v1/materias_primas?id=eq.' + rows[0].id, {
              method: 'PATCH',
              headers: H,
              body: JSON.stringify(body),
            });
          }
          return fetch(base + '/rest/v1/materias_primas', {
            method: 'POST',
            headers: H,
            body: JSON.stringify([body]),
          }).then(function (res) {
            return res.json().then(function (created) {
              if (Array.isArray(created) && created[0]) item.materiaPrimaId = created[0].id;
            });
          });
        })
        .catch(function () {});
    } catch (_) {}
  }

  function upsertCatalog(raw, opts) {
    opts = opts || {};
    var item = normalizeCatalogItem(raw);
    if (!item) return null;
    var st = loadStore();
    var idx = st.catalogoMp.findIndex(function (x) {
      return String(x.id) === item.id;
    });
    var prev = idx >= 0 ? st.catalogoMp[idx] : null;
    var isNew = idx < 0;
    if (isNew && !opts.skipIdCheck) {
      var dupe = st.catalogoMp.find(function (x) {
        return String(x.nombre).trim().toUpperCase() === item.nombre.toUpperCase() && x.activo !== false;
      });
      if (dupe) item.id = dupe.id;
      idx = st.catalogoMp.findIndex(function (x) {
        return String(x.id) === item.id;
      });
      prev = idx >= 0 ? st.catalogoMp[idx] : null;
      isNew = idx < 0;
    }
    item.updatedAt = new Date().toISOString();
    if (prev) {
      propagateRename(st, item.id, prev.nombre, item.nombre);
      st.catalogoMp[idx] = Object.assign({}, prev, item);
      item = st.catalogoMp[idx];
    } else {
      st.catalogoMp.unshift(item);
      if (!getCosteoRow(st, item.id)) {
        st.costeoMp.unshift(
          normalizeCosteoItem(
            { und: 'GR', peso: 1000, precioTotal: 0 },
            item.id
          )
        );
      }
      if (!opts.skipInvMov) syncInventarioLedger(mergeItem(item, getCosteoRow(st, item.id)));
    }
    saveStore(st);
    var merged = get(item.id);
    if (global.CrozzoReservorio && global.CrozzoReservorio.upsertMatrizMp && merged) {
      global.CrozzoReservorio.upsertMatrizMp(merged);
    }
    syncCloud(merged || item, prev && prev.nombre);
    emitChanged({ tipo: isNew ? 'create' : 'catalog', item: item, merged: merged });
    return merged;
  }

  function upsertCosteo(raw, opts) {
    opts = opts || {};
    var mpId = String(raw.mpId || raw.id || '').trim();
    if (!mpId) return null;
    var st = loadStore();
    var cat = st.catalogoMp.find(function (x) {
      return x && String(x.id) === mpId && x.activo !== false;
    });
    if (!cat) return null;

    var item = normalizeCosteoItem(raw, mpId);
    var idx = st.costeoMp.findIndex(function (x) {
      return String(x.mpId) === mpId;
    });
    var prev = idx >= 0 ? st.costeoMp[idx] : null;
    var isNew = idx < 0;
    var mergedPrev = prev ? get(mpId) : null;
    var antTotal = mergedPrev ? mergedPrev.precioTotal : 0;
    if (
      !isNew &&
      item.precioTotal !== antTotal &&
      !confirmVariacionPrecio(antTotal, item.precioTotal, opts) &&
      opts.origen !== 'recepcion'
    ) {
      return null;
    }
    if (item.precioTotal !== antTotal && antTotal > 0 && item.precioAnterior == null) {
      item.precioAnterior = antTotal;
    }
    item.updatedAt = new Date().toISOString();
    if (prev) st.costeoMp[idx] = Object.assign({}, prev, item);
    else st.costeoMp.unshift(item);

    saveStore(st);
    var merged = get(mpId);
    if (global.CrozzoReservorio && global.CrozzoReservorio.upsertMatrizMp && merged) {
      global.CrozzoReservorio.upsertMatrizMp(merged);
    }
    emitChanged({
      tipo: opts.origen === 'recepcion' ? 'recepcion-precio' : isNew ? 'create-costeo' : 'costeo',
      item: item,
      merged: merged,
    });
    return merged;
  }

  /**
   * $/unidad a partir de la línea de factura.
   * Acepta total de línea (ej. 1800 por 1000 g) o precio unitario directo (ej. 3,4 $/g).
   */
  function compraPrecioUnitario(line, cur, valorLinea, cantCompra) {
    var und = String((line && line.und) || (cur && cur.und) || 'GR').toUpperCase();
    var v = num(valorLinea);
    var c = num(cantCompra);
    if (v <= 0 || c <= 0) return 0;
    var refPeso = num(cur && cur.peso) || 1000;
    if (refPeso <= 0) refPeso = 1000;
    if (und === 'UND' || und === 'UNI' || und === 'PAQ' || und === 'CAJA') {
      return v / c;
    }
    if (und === 'GR' || und === 'ML') {
      if (Math.abs(c - refPeso) / refPeso < 0.02) return v / refPeso;
      var porCantidad = v / c;
      var porRef = v / refPeso;
      if (c < refPeso * 0.9 && porCantidad > Math.max(porRef * 20, 50) && porRef > 0 && porRef < 1000) {
        return porRef;
      }
      if (c >= 50 && v <= 250 && porCantidad < 0.55) {
        return v;
      }
      return porCantidad;
    }
    return v / c;
  }

  /** Precio total del lote de referencia en costeo (ej. 1000 g → $1800). */
  function costeoTotalDesdeRecepcion(line, cur, valorLinea, cantCompra) {
    var und = String((line && line.und) || (cur && cur.und) || 'GR').toUpperCase();
    var refPeso = num(cur && cur.peso) || 1000;
    if (refPeso <= 0) refPeso = 1000;
    var v = num(valorLinea);
    var c = num(cantCompra);
    if (v <= 0 || c <= 0) return 0;
    if (und === 'UND' || und === 'UNI' || und === 'PAQ' || und === 'CAJA') {
      if (c <= 1.001) return Math.round(v * 100) / 100;
      return Math.round((v / c) * refPeso * 100) / 100;
    }
    if (Math.abs(c - refPeso) / Math.max(refPeso, 1) < 0.02) {
      return Math.round(v * 100) / 100;
    }
    var unit = compraPrecioUnitario(line, cur, valorLinea, cantCompra);
    if (unit <= 0) return 0;
    return Math.round(unit * refPeso * 100) / 100;
  }

  /**
   * Actualiza costeo desde líneas de recepción de factura.
   * La compra fija el $/g (o $/ml, $/und): cantidad → inventario; precio → costeo.
   * items: [{ mpId, precioTotal, peso?, und?, cantidad? }]
   */
  function applyRecepcionItems(items, opts) {
    opts = opts || {};
    var updated = [];
    (items || []).forEach(function (line) {
      if (!line) return;
      var mpId = String(line.mpId || line.productoRefId || '').trim();
      if (!mpId) return;
      var cur = get(mpId);
      if (!cur) return;
      var valorLinea = num(line.precioTotal != null ? line.precioTotal : line.valorLote || line.valor);
      if (valorLinea <= 0) return;
      var cantCompra =
        line.peso != null ? num(line.peso) : line.cantidad != null ? num(line.cantidad) : 0;
      if (cantCompra <= 0) return;
      var refPeso = num(cur.peso) || 1000;
      if (refPeso <= 0) refPeso = 1000;
      var precioTotalCosteo = costeoTotalDesdeRecepcion(line, cur, valorLinea, cantCompra);
      if (precioTotalCosteo <= 0) return;
      var newUnit = refPeso > 0 ? precioTotalCosteo / refPeso : 0;
      var patch = {
        mpId: mpId,
        und: line.und || cur.und,
        peso: refPeso,
        precioTotal: precioTotalCosteo,
        precioAnterior: cur.precioTotal,
        ultimaRecepcionId: opts.recepcionId || line.recepcionId || null,
        ultimaRecepcionAt: opts.fecha || new Date().toISOString(),
      };
      var r = upsertCosteo(patch, {
        skipVariacionCheck: true,
        skipConfirm: true,
        origen: 'recepcion',
      });
      if (r) {
        var rv = reservorio();
        if (rv && rv.upsertMatrizMp) rv.upsertMatrizMp(r);
        updated.push({
          mpId: mpId,
          nombre: r.nombre,
          precioTotal: r.precioTotal,
          precioUnit: r.precioUnit,
          peso: r.peso,
          und: r.und,
        });
        if (typeof global.crozzoCostosEmit === 'function') {
          global.crozzoCostosEmit('crozzo-costos:precio-mp-cambiado', {
            producto: r.nombre,
            precioUnit: r.precioUnit,
            precioTotal: r.precioTotal,
            peso: r.peso,
            und: r.und,
            item: r,
            origen: 'recepcion',
            recepcionId: opts.recepcionId,
          });
        }
      }
    });
    if (updated.length) {
      emitChanged({ tipo: 'recepcion-precios', items: updated, recepcionId: opts.recepcionId });
    }
    return updated;
  }

  /** Compat: detecta si el patch trae solo datos de costeo */
  function upsert(raw, opts) {
    opts = opts || {};
    if (raw && (raw.mpId || raw.id) && raw.und != null && raw.nombre == null && raw.categoria == null && !raw.proveedores) {
      return upsertCosteo(raw, opts);
    }
    if (raw && raw.peso != null && raw.precioTotal != null && raw.nombre == null) {
      return upsertCosteo(Object.assign({ mpId: raw.mpId || raw.id }, raw), opts);
    }
    var catalogPatch = Object.assign({}, raw);
    if (raw && raw.id && !raw.mpId) catalogPatch.id = raw.id;
    if (raw && raw.proveedores != null) catalogPatch.proveedores = parseProveedores(raw.proveedores);
    var merged = upsertCatalog(catalogPatch, opts);
    if (raw && (raw.und != null || raw.peso != null || raw.precioTotal != null)) {
      merged = upsertCosteo(
        {
          mpId: merged.id,
          und: raw.und,
          peso: raw.peso,
          precioTotal: raw.precioTotal,
        },
        { skipInvMov: true }
      );
    }
    return merged;
  }

  function countUsages(id) {
    var st = loadStore();
    var n = 0;
    st.inventarioMovimientos.forEach(function (m) {
      if (String(m.productoRefId) === String(id)) n++;
    });
    if (st.recetaDemo && Array.isArray(st.recetaDemo.lineas)) {
      st.recetaDemo.lineas.forEach(function (ln) {
        if (ln.mpId === id) n++;
      });
    }
    migrateRecetasShape(st);
    (st.recetasPlatos || []).forEach(function (rec) {
      if (!rec || !Array.isArray(rec.lineas)) return;
      rec.lineas.forEach(function (ln) {
        if (ln.mpId === id) n++;
      });
    });
    return n;
  }

  function listRecetasPlatos() {
    var st = loadStore();
    migrateRecetasShape(st);
    return (st.recetasPlatos || []).slice();
  }

  function getRecetaPlato(slug) {
    var s = String(slug || '').trim();
    if (!s) return null;
    return (
      listRecetasPlatos().find(function (r) {
        return r.slug === s;
      }) || null
    );
  }

  function upsertRecetaPlato(raw, opts) {
    opts = opts || {};
    var st = loadStore();
    migrateRecetasShape(st);
    var rec = normalizeRecetaPlato(raw);
    if (!rec || !rec.slug) return null;
    var idx = (st.recetasPlatos || []).findIndex(function (r) {
      return r.slug === rec.slug;
    });
    rec.updatedAt = new Date().toISOString();
    if (idx >= 0) st.recetasPlatos[idx] = Object.assign({}, st.recetasPlatos[idx], rec);
    else st.recetasPlatos.push(rec);
    if (!opts.skipLegacyDemo && st.recetaDemo && normSlug(st.recetaDemo.slug) === normSlug(rec.slug)) {
      st.recetaDemo = Object.assign({}, st.recetaDemo, {
        slug: rec.slug,
        nombre: rec.producto,
        producto: rec.producto,
        lineas: rec.lineas.slice(),
        opts: rec.opts,
      });
    }
    saveStore(st);
    emitChanged({ tipo: 'receta-plato', slug: rec.slug });
    try {
      global.dispatchEvent(
        new CustomEvent('crozzo-costos:receta-actualizada', {
          detail: { recipeId: rec.slug, lineas: rec.lineas, slug: rec.slug },
        })
      );
    } catch (_) {}
    return rec;
  }

  function normSlug(s) {
    return String(s || '')
      .trim()
      .toUpperCase();
  }

  function ensureRecetaForMenu(slug, producto) {
    var ex = getRecetaPlato(slug);
    if (ex) return ex;
    return upsertRecetaPlato({ slug: slug, producto: producto, lineas: [] }, { skipLegacyDemo: true });
  }

  function remove(id, opts) {
    opts = opts || {};
    var item = get(id);
    if (!item) return false;
    if (!opts.skipConfirm) {
      var usos = countUsages(id, item.nombre);
      var msg =
        '¿Eliminar «' +
        item.nombre +
        '»?\n\nSe quita del catálogo, costeo e inventario.';
      if (usos > 0) msg += '\n\nTiene ' + usos + ' referencia(s) en movimientos o recetas.';
      msg += '\n\nEsta acción no se puede deshacer.';
      if (!confirm(msg)) return false;
    }
    var st = loadStore();
    st.catalogoMp = st.catalogoMp.filter(function (x) {
      return String(x.id) !== String(id);
    });
    st.costeoMp = st.costeoMp.filter(function (x) {
      return String(x.mpId) !== String(id);
    });
    saveStore(st);
    syncCloudDelete(item);
    emitChanged({ tipo: 'delete', id: id, item: item });
    return true;
  }

  function syncCloudDelete(item) {
    if (!cloudReady() || !item.materiaPrimaId) return;
    try {
      var raw = localStorage.getItem('crozzo_supabase_config');
      var j = JSON.parse(raw);
      var key = String(j.key || j.anonKey || '').trim();
      var base = String(j.url || '').replace(/\/$/, '');
      fetch(base + '/rest/v1/materias_primas?id=eq.' + item.materiaPrimaId, {
        method: 'DELETE',
        headers: { apikey: key, Authorization: 'Bearer ' + key },
      }).catch(function () {});
    } catch (_) {}
  }

  function buildPreciosStore() {
    var precios = {};
    list().forEach(function (it) {
      var k = String(it.nombre).trim().toUpperCase();
      precios[k] = { precioTotal: it.precioTotal, peso: it.peso, precioUnit: it.precioUnit };
      precios[it.id] = precios[k];
    });
    return { precios: precios, subRecetas: {} };
  }

  function purgeLegacyRealData() {
    try {
      localStorage.removeItem(LS_LEGACY_MATRIZ);
      localStorage.removeItem('crozzo_costos_resumen_v1');
      localStorage.removeItem('crozzo_costos_demo_receta_v1');
    } catch (_) {}
    var rv = reservorio();
    if (!rv || !rv.migrateLegacy) return;
    var st = rv.migrateLegacy();
    var notes = st.meta && st.meta.migrationNotes ? st.meta.migrationNotes : [];
    if (st.meta && st.meta.catalogoVersion === CATALOG_VERSION && st.catalogoMp.length) return;
    try {
      if (localStorage.getItem(LS_SEED_FLAG) === String(CATALOG_VERSION) && st.catalogoMp.length) return;
    } catch (_) {}
    st.catalogoMp = [];
    st.costeoMp = [];
    st.matrizMp = [];
    st.menuCostos = [];
    st.recetaDemo = null;
    if (!st.meta) st.meta = { migrated: false, migrationNotes: [] };
    st.meta.catalogoVersion = 0;
    notes.push('Reset catálogo v4 ' + new Date().toISOString().slice(0, 10));
    st.meta.migrationNotes = notes.slice(-12);
    saveStore(st);
  }

  function applyDemoPayload(j) {
    if (!j) return;
    var st = loadStore();
    st.catalogoMp = [];
    st.costeoMp = [];
    (j.materiasPrimas || []).forEach(function (r) {
      var cat = normalizeCatalogItem(r);
      var cost = normalizeCosteoItem(r, cat && cat.id);
      if (cat) st.catalogoMp.push(cat);
      if (cost) st.costeoMp.push(cost);
    });
    st.menuCostos = (j.menuPlatos || []).slice();
    st.recetaDemo = j.recetaDemo ? JSON.parse(JSON.stringify(j.recetaDemo)) : null;
    st.recetasPlatos = Array.isArray(j.recetasPlatos)
      ? j.recetasPlatos.map(normalizeRecetaPlato).filter(Boolean)
      : [];
    migrateRecetasShape(st);
    if (!st.meta) st.meta = { migrated: false, migrationNotes: [] };
    st.meta.catalogoVersion = CATALOG_VERSION;
    st.meta.catalogoLabel = j.label || 'Demo';
    saveStore(st);
    try {
      localStorage.setItem(LS_SEED_FLAG, String(CATALOG_VERSION));
    } catch (_) {}
  }

  function fetchDemoJson() {
    if (demoCache) return Promise.resolve(demoCache);
    return fetch(DEMO_JSON)
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .catch(function () {
        return null;
      })
      .then(function (j) {
        demoCache = j;
        return j;
      });
  }

  function ensureReady(cb) {
    if (ready) {
      if (cb) cb();
      return Promise.resolve();
    }
    if (cb) readyCbs.push(cb);
    return fetchDemoJson().then(function (j) {
      purgeLegacyRealData();
      var st = loadStore();
      var needSeed = !st.catalogoMp.length;
      try {
        if (localStorage.getItem(LS_SEED_FLAG) !== String(CATALOG_VERSION)) needSeed = true;
      } catch (_) {
        needSeed = true;
      }
      if (needSeed && j) applyDemoPayload(j);
      else if (!st.catalogoMp.length && j) applyDemoPayload(j);
      migrateStoreShape(loadStore());
      ready = true;
      readyCbs.forEach(function (fn) {
        fn();
      });
      readyCbs = [];
    });
  }

  function getDemoSeed() {
    return (
      demoCache || {
        precios: {},
        resumen: loadStore().menuCostos || [],
        demoRecipe: loadStore().recetaDemo || { lineas: [], nombre: 'Demo' },
        stats: { precios: list().length, resumenSample: (loadStore().menuCostos || []).length },
      }
    );
  }

  function buildSeedForCostos() {
    var st = loadStore();
    return {
      version: CATALOG_VERSION,
      label: (st.meta && st.meta.catalogoLabel) || 'Demo',
      precios: {},
      resumen: (st.menuCostos || []).map(function (r) {
        return { producto: r.producto, costoMp: r.costoMp, precioVenta: r.precioVenta, slug: r.slug };
      }),
      demoRecipe: st.recetaDemo || { lineas: [], nombre: 'Receta demo' },
      recetasPlatos: listRecetasPlatos(),
      stats: {
        precios: list().length,
        resumenSample: (st.menuCostos || []).length,
        recetas: listRecetasPlatos().length,
      },
    };
  }

  function updateMenuPlato(slug, patch) {
    var st = loadStore();
    var idx = (st.menuCostos || []).findIndex(function (r) {
      return r.slug === slug;
    });
    if (idx < 0) return null;
    st.menuCostos[idx] = Object.assign({}, st.menuCostos[idx], patch);
    saveStore(st);
    emitChanged({ tipo: 'menu', slug: slug });
    return st.menuCostos[idx];
  }

  function updateRecetaDemoLineas(lineas, meta) {
    meta = meta || {};
    var st = loadStore();
    migrateRecetasShape(st);
    var slug =
      meta.slug ||
      (st.recetaDemo && st.recetaDemo.slug) ||
      (st.menuCostos[0] && st.menuCostos[0].slug) ||
      'DEMO';
    var producto =
      meta.producto ||
      (st.recetaDemo && (st.recetaDemo.nombre || st.recetaDemo.producto)) ||
      slug;
    upsertRecetaPlato(
      {
        slug: slug,
        producto: producto,
        lineas: lineas,
        opts: (st.recetaDemo && st.recetaDemo.opts) || meta.opts,
      },
      { skipLegacyDemo: false }
    );
  }

  function normalizeItem(raw) {
    var cat = normalizeCatalogItem(raw);
    if (!cat) return null;
    return mergeItem(cat, normalizeCosteoItem(raw, cat.id));
  }

  global.CrozzoCatalogoMp = {
    CATALOG_VERSION: CATALOG_VERSION,
    ensureReady: ensureReady,
    list: list,
    listCatalog: listCatalog,
    get: get,
    getByNombre: getByNombre,
    upsert: upsert,
    upsertCatalog: upsertCatalog,
    upsertCosteo: upsertCosteo,
    applyRecepcionItems: applyRecepcionItems,
    costeoTotalDesdeRecepcion: costeoTotalDesdeRecepcion,
    compraPrecioUnitario: compraPrecioUnitario,
    confirmVariacionPrecio: confirmVariacionPrecio,
    remove: remove,
    buildPreciosStore: buildPreciosStore,
    buildSeedForCostos: buildSeedForCostos,
    getDemoSeed: getDemoSeed,
    updateMenuPlato: updateMenuPlato,
    updateRecetaDemoLineas: updateRecetaDemoLineas,
    listRecetasPlatos: listRecetasPlatos,
    getRecetaPlato: getRecetaPlato,
    upsertRecetaPlato: upsertRecetaPlato,
    ensureRecetaForMenu: ensureRecetaForMenu,
    slugPlato: slugPlato,
    slugId: slugId,
    calcPrecioUnit: calcPrecioUnit,
    normalizeItem: normalizeItem,
    parseProveedores: parseProveedores,
  };
})(typeof window !== 'undefined' ? window : globalThis);
