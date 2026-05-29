/**
 * Crozzo POS — Catálogo MP + Costeo MP (dos capas conectadas)
 * Catálogo: nombre, categoría, proveedores → recetas, inventario, proveedores
 * Costeo: unidad, peso, precio total, $/u → fórmulas y márgenes
 */
(function (global) {
  'use strict';

  var CATALOG_VERSION = 4;
  var RECETAS_VERSION = 3;
  var DEFAULT_RECIPE_OPTS = {
    margenErrorPct: 0.03,
    porcentajeMpObjetivo: 0.3,
    impuestoPct: 0.08,
    porciones: 1,
  };
  var LS_LEGACY_MATRIZ = 'crozzo_costos_matriz_v1';
  var LS_SEED_FLAG = 'crozzo_catalogo_mp_seeded_v2';
  var DEMO_JSON = 'data/catalogo-demo.json';
  /** Fila oficial en «Costeos guardados» — se actualiza con MP, recetas y sincronización. */
  var PERIODO_COSTEO_VIGENTE = 'vigente';

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
      programaciones: Array.isArray(raw.programaciones)
        ? raw.programaciones.map(normalizeProgramacionReceta).filter(Boolean)
        : [],
      updatedAt: raw.updatedAt || new Date().toISOString(),
    };
  }

  function mergeRecetasPlatosFromJson(st, list, opts) {
    opts = opts || {};
    if (!st || !Array.isArray(list) || !list.length) return false;
    var bySlug = {};
    (st.recetasPlatos || []).forEach(function (r) {
      var n = normalizeRecetaPlato(r);
      if (n) bySlug[n.slug] = n;
    });
    var changed = false;
    list.forEach(function (raw) {
      var n = normalizeRecetaPlato(raw);
      if (!n || !n.lineas.length) return;
      var ex = bySlug[n.slug];
      if (opts.overwrite || !ex || !ex.lineas || !ex.lineas.length) {
        bySlug[n.slug] = n;
        changed = true;
      }
    });
    if (changed) {
      st.recetasPlatos = Object.keys(bySlug).map(function (k) {
        return bySlug[k];
      });
      saveStore(st);
    }
    return changed;
  }

  function mergeCapacitacionRecetasFromDemo(st, j) {
    if (!st || !j) return false;
    var ch = false;
    if (Array.isArray(j.recetasPlatos)) ch = mergeRecetasPlatosFromJson(st, j.recetasPlatos) || ch;
    if (Array.isArray(j.recetasPosPlatos)) ch = mergeRecetasPlatosFromJson(st, j.recetasPosPlatos) || ch;
    return ch;
  }

  function normalizeProgramacion(raw) {
    if (!raw) return null;
    var vig = String(raw.vigenciaDesde || '').slice(0, 10);
    if (!vig) return null;
    return {
      id: String(raw.id || 'prog_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)),
      precioVenta: Math.round(num(raw.precioVenta)),
      vigenciaDesde: vig,
      vigenciaHasta: raw.vigenciaHasta ? String(raw.vigenciaHasta).slice(0, 10) : null,
      aplicarPos: raw.aplicarPos !== false,
      estado: raw.estado === 'aplicada' || raw.estado === 'cancelada' ? raw.estado : 'pendiente',
      createdAt: raw.createdAt || new Date().toISOString(),
      aplicadaAt: raw.aplicadaAt || null,
      notas: String(raw.notas || '').trim(),
    };
  }

  function normalizeProgramacionReceta(raw) {
    if (!raw) return null;
    var vig = String(raw.vigenciaDesde || '').slice(0, 10);
    if (!vig) return null;
    var snap = raw.snapshot || {};
    return {
      id: String(raw.id || 'recprog_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)),
      vigenciaDesde: vig,
      vigenciaHasta: raw.vigenciaHasta ? String(raw.vigenciaHasta).slice(0, 10) : null,
      estado: raw.estado === 'aplicada' || raw.estado === 'cancelada' ? raw.estado : 'pendiente',
      createdAt: raw.createdAt || new Date().toISOString(),
      aplicadaAt: raw.aplicadaAt || null,
      notas: String(raw.notas || '').trim(),
      snapshot: {
        lineas: Array.isArray(snap.lineas) ? snap.lineas.map(normalizeLineaReceta).filter(Boolean) : [],
        opts: Object.assign({}, DEFAULT_RECIPE_OPTS, snap.opts || {}),
        precioVenta: Math.round(num(snap.precioVenta)),
        costoReferencia: Math.round(num(snap.costoReferencia)),
      },
    };
  }

  function normalizeHistorialCosteo(raw) {
    if (!raw) return null;
    var periodo = String(raw.periodo || '').slice(0, 7);
    if (!periodo) periodo = new Date().toISOString().slice(0, 7);
    return {
      id: String(raw.id || 'hist_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)),
      periodo: periodo,
      label: String(raw.label || periodo).trim(),
      costoMp: Math.round(num(raw.costoMp)),
      precioVenta: Math.round(num(raw.precioVenta)),
      margenObjetivoPct: raw.margenObjetivoPct != null ? num(raw.margenObjetivoPct) : null,
      margenMinimoPct: raw.margenMinimoPct != null ? num(raw.margenMinimoPct) : null,
      margenRealPct: raw.margenRealPct != null ? num(raw.margenRealPct) : null,
      costoMpAnterior: raw.costoMpAnterior != null ? Math.round(num(raw.costoMpAnterior)) : null,
      precioVentaAnterior: raw.precioVentaAnterior != null ? Math.round(num(raw.precioVentaAnterior)) : null,
      alertaMargen: raw.alertaMargen === 'crit' || raw.alertaMargen === 'warn' || raw.alertaMargen === 'ok' ? raw.alertaMargen : null,
      mpOrigenId: raw.mpOrigenId ? String(raw.mpOrigenId) : null,
      mpOrigenNombre: raw.mpOrigenNombre ? String(raw.mpOrigenNombre).trim() : null,
      notas: String(raw.notas || '').trim(),
      guardadoAt: raw.guardadoAt || new Date().toISOString(),
    };
  }

  function readLsMargen(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (raw == null || raw === '') return fallback;
      var n = Number(raw);
      return isFinite(n) ? n : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function getMargenObjetivoPctDefault(row) {
    if (row && row.margenObjetivoPct != null) return num(row.margenObjetivoPct);
    return readLsMargen('crozzo_costos_margen_global_v1', 20);
  }

  function getMargenMinimoPctDefault(row) {
    if (row && row.margenMinimoPct != null) return num(row.margenMinimoPct);
    return readLsMargen('crozzo_costos_margen_minimo_v1', 10);
  }

  /** Platos de menú afectados cuando sube/baja el precio de una MP. */
  function listMenuSlugsAffectedByMp(mpId) {
    var directos = [];
    var recetas = [];
    if (!mpId) return { directos: directos, recetas: recetas };
    var st = loadStore();
    var mp = get(mpId);
    var mpNombre = mp ? String(mp.nombre || '').trim().toLowerCase() : '';
    (st.recetasPlatos || []).forEach(function (r) {
      if (!r || !r.slug) return;
      var hit = (r.lineas || []).some(function (ln) {
        return ln && String(ln.mpId) === String(mpId);
      });
      if (hit) recetas.push(r.slug);
    });
    (st.menuCostos || []).forEach(function (m) {
      var row = normalizeMenuPlato(m);
      if (!row || row.tipoCosteo !== 'directo') return;
      var cat = st.catalogoMp.find(function (c) {
        return c && String(c.id) === String(mpId);
      });
      if (cat && cat.posProductId != null && row.posProductId === cat.posProductId) {
        directos.push(row.slug);
        return;
      }
      if (mpNombre && String(row.producto || '').trim().toLowerCase() === mpNombre) {
        directos.push(row.slug);
      }
    });
    return { directos: directos, recetas: recetas };
  }

  function resolveMpIdForMenuRow(row) {
    if (!row) return null;
    if (row.costeoMpSourceId) return String(row.costeoMpSourceId);
    var st = loadStore();
    if (row.posProductId != null) {
      var cat = st.catalogoMp.find(function (c) {
        return c && c.posProductId === row.posProductId && c.activo !== false;
      });
      if (cat) return cat.id;
    }
    if (row.tipoCosteo === 'directo' && row.producto) {
      var byName = getByNombre(row.producto);
      if (byName) return byName.id;
      var prods =
        typeof global.products !== 'undefined' && Array.isArray(global.products) ? global.products : [];
      var p = prods.find(function (x) {
        return x && String(x.nombre || '').trim().toLowerCase() === String(row.producto).trim().toLowerCase();
      });
      if (p) return mpIdForPosReventa(p);
    }
    return null;
  }

  function costoMenuDesdeMpItem(mp) {
    if (!mp) return 0;
    var und = String(mp.und || '').toUpperCase();
    if (und === 'UNI' || und === 'UND') return Math.round(num(mp.precioTotal));
    if (und === 'ML' || und === 'GR') {
      return Math.round(num(mp.precioUnit) * num(mp.peso, 1));
    }
    return Math.round(num(mp.precioTotal));
  }

  function normalizeMenuPlato(raw) {
    if (!raw) return null;
    var slug = String(raw.slug || slugPlato(raw.producto)).trim();
    if (!slug) return null;
    var prog = Array.isArray(raw.programaciones)
      ? raw.programaciones.map(normalizeProgramacion).filter(Boolean)
      : [];
    var hist = Array.isArray(raw.historialCosteo)
      ? raw.historialCosteo.map(normalizeHistorialCosteo).filter(Boolean)
      : [];
    var tipo = raw.tipoCosteo === 'directo' ? 'directo' : 'receta';
    return {
      slug: slug,
      producto: String(raw.producto || slug).trim(),
      costoMp: Math.round(num(raw.costoMp)),
      precioVenta: Math.round(num(raw.precioVenta)),
      categoria: String(raw.categoria || '').trim(),
      posProductId: raw.posProductId != null ? raw.posProductId : null,
      costeoMpSourceId: raw.costeoMpSourceId ? String(raw.costeoMpSourceId).trim() : null,
      origen: raw.origen || 'menu',
      tipoCosteo: tipo,
      margenObjetivoPct: raw.margenObjetivoPct != null ? num(raw.margenObjetivoPct) : null,
      margenMinimoPct: raw.margenMinimoPct != null ? num(raw.margenMinimoPct) : null,
      programaciones: prog,
      historialCosteo: hist,
    };
  }

  function migrateMenuCostosShape(st) {
    if (!st || !Array.isArray(st.menuCostos)) return;
    st.menuCostos = st.menuCostos
      .map(function (m) {
        return normalizeMenuPlato(m);
      })
      .filter(Boolean);
  }

  function inferTipoCosteoFromPos(p) {
    if (!p) return 'receta';
    if (p.tieneRecetaProceso === false) return 'directo';
    if (p.tieneRecetaProceso === true) return 'receta';
    var cat = String(p.categoria || '').toLowerCase();
    if (cat === 'bebidas') return 'directo';
    return 'receta';
  }

  function getMenuPlato(slug) {
    var st = loadStore();
    var row = (st.menuCostos || []).find(function (m) {
      return m && m.slug === slug;
    });
    return row ? normalizeMenuPlato(row) : null;
  }

  function aplicarPrecioAlPos(slug, precioVenta) {
    var row = getMenuPlato(slug);
    if (!row || row.posProductId == null) return false;
    if (typeof global.crozzoSetProductPrecio === 'function') {
      return global.crozzoSetProductPrecio(row.posProductId, precioVenta) === true;
    }
    if (typeof global.products === 'undefined' || !Array.isArray(global.products)) return false;
    var pid = row.posProductId;
    var precio = Math.round(num(precioVenta));
    var found = false;
    global.products.forEach(function (p) {
      if (p && p.id === pid) {
        p.precio = precio;
        found = true;
      }
    });
    return found;
  }

  function addProgramacionPrecio(slug, precioVenta, vigenciaDesde, opts) {
    opts = opts || {};
    var st = loadStore();
    var idx = (st.menuCostos || []).findIndex(function (m) {
      return m && m.slug === slug;
    });
    if (idx < 0) return null;
    var row = normalizeMenuPlato(st.menuCostos[idx]);
    var prog = normalizeProgramacion({
      precioVenta: precioVenta,
      vigenciaDesde: vigenciaDesde || new Date().toISOString().slice(0, 10),
      aplicarPos: opts.aplicarPos !== false,
      notas: opts.notas || '',
      estado: 'pendiente',
    });
    if (!prog) return null;
    row.programaciones = row.programaciones || [];
    row.programaciones.push(prog);
    st.menuCostos[idx] = row;
    saveStore(st);
    emitChanged({ tipo: 'programacion', slug: slug, programacion: prog });
    return prog;
  }

  function ejecutarProgramacionesPendientes(opts) {
    opts = opts || {};
    var st = loadStore();
    migrateMenuCostosShape(st);
    var now = new Date();
    var today = now.toISOString().slice(0, 10);
    var changed = 0;
    var aplicadas = [];
    (st.menuCostos || []).forEach(function (raw, idx) {
      var row = normalizeMenuPlato(raw);
      if (!row || !row.programaciones.length) return;
      var touched = false;
      row.programaciones.forEach(function (prog) {
        if (!prog || prog.estado !== 'pendiente') return;
        if (prog.vigenciaDesde > today) return;
        if (prog.vigenciaHasta && prog.vigenciaHasta < today) {
          prog.estado = 'cancelada';
          touched = true;
          return;
        }
        row.precioVenta = prog.precioVenta;
        prog.estado = 'aplicada';
        prog.aplicadaAt = now.toISOString();
        if (prog.aplicarPos) aplicarPrecioAlPos(row.slug, prog.precioVenta);
        aplicadas.push({ slug: row.slug, precioVenta: prog.precioVenta });
        changed++;
        touched = true;
      });
      if (touched) st.menuCostos[idx] = row;
    });
    if (changed) {
      saveStore(st);
      emitChanged({ tipo: 'programaciones-aplicadas', count: changed, items: aplicadas });
      if (!opts.silent) {
        try {
          document.dispatchEvent(
            new CustomEvent('crozzo-costos:precios-vigentes', { detail: { items: aplicadas }, bubbles: true })
          );
        } catch (_) {}
      }
    }
    return changed;
  }

  function pushHistorialCosteo(slug, snapshot) {
    snapshot = snapshot || {};
    var st = loadStore();
    var idx = (st.menuCostos || []).findIndex(function (m) {
      return m && m.slug === slug;
    });
    if (idx < 0) return null;
    var row = normalizeMenuPlato(st.menuCostos[idx]);
    var periodo = String(snapshot.periodo || new Date().toISOString().slice(0, 7)).slice(0, 7);
    var defaults = {
      margenObjetivoPct: getMargenObjetivoPctDefault(row),
      margenMinimoPct: getMargenMinimoPctDefault(row),
    };
    var entry = normalizeHistorialCosteo(
      Object.assign(
        {
          periodo: periodo,
          label: snapshot.label || periodo,
          costoMp: snapshot.costoMp != null ? snapshot.costoMp : row.costoMp,
          precioVenta: snapshot.precioVenta != null ? snapshot.precioVenta : row.precioVenta,
          margenObjetivoPct: snapshot.margenObjetivoPct != null ? snapshot.margenObjetivoPct : defaults.margenObjetivoPct,
          margenMinimoPct: snapshot.margenMinimoPct != null ? snapshot.margenMinimoPct : defaults.margenMinimoPct,
          margenRealPct: snapshot.margenRealPct,
          notas: snapshot.notas || '',
        },
        snapshot
      )
    );
    if (!entry) return null;
    row.historialCosteo = row.historialCosteo || [];
    var exIdx = row.historialCosteo.findIndex(function (h) {
      return h && h.periodo === entry.periodo;
    });
    if (exIdx >= 0) row.historialCosteo[exIdx] = entry;
    else row.historialCosteo.push(entry);
    row.historialCosteo.sort(function (a, b) {
      return String(b.periodo).localeCompare(String(a.periodo));
    });
    if (row.historialCosteo.length > 36) row.historialCosteo = row.historialCosteo.slice(0, 36);
    st.menuCostos[idx] = row;
    saveStore(st);
    emitChanged({ tipo: 'historial', slug: slug, entry: entry });
    return entry;
  }

  function getHistorialVigenteEntry(row) {
    if (!row || !Array.isArray(row.historialCosteo)) return null;
    return row.historialCosteo.find(function (h) {
      return h && h.periodo === PERIODO_COSTEO_VIGENTE;
    });
  }

  function calcMargenRealPctMenu(costoMp, precioVenta) {
    var eng = engine();
    if (!eng || !precioVenta || precioVenta <= 0) return null;
    var r = eng.calcularResumen(costoMp, precioVenta);
    return Math.round(r.pctUtilidad * 1000) / 10;
  }

  function alertaMargenDesdePct(margenRealPct, margenMinPct, margenObjPct) {
    if (margenRealPct == null || !isFinite(margenRealPct)) return 'ok';
    var min = margenMinPct != null ? Number(margenMinPct) : readLsMargen('crozzo_costos_margen_minimo_v1', 10);
    var obj = margenObjPct != null ? Number(margenObjPct) : readLsMargen('crozzo_costos_margen_global_v1', 20);
    if (margenRealPct < min - 0.05) return 'crit';
    if (margenRealPct < obj - 0.05) return 'warn';
    return 'ok';
  }

  function precioCajaPosParaMenuRow(row) {
    if (!row || row.posProductId == null) return null;
    var prods =
      typeof global.products !== 'undefined' && Array.isArray(global.products) ? global.products : [];
    for (var i = 0; i < prods.length; i++) {
      if (prods[i] && prods[i].id === row.posProductId) {
        return Math.round(num(prods[i].precio));
      }
    }
    return null;
  }

  /**
   * Costeo guardado «vigente (actual)» — refleja menú + costos MP/recetas en tiempo real.
   */
  function upsertHistorialCosteoVigente(slug, snapshot) {
    snapshot = snapshot || {};
    var row = getMenuPlato(slug);
    if (!row) return null;
    var prevV = getHistorialVigenteEntry(row);
    var costoMp =
      snapshot.costoMp != null ? Math.round(num(snapshot.costoMp)) : Math.round(num(row.costoMp));
    var precioVenta =
      snapshot.precioVenta != null
        ? Math.round(num(snapshot.precioVenta))
        : Math.round(num(row.precioVenta));
    var precioCaja = precioCajaPosParaMenuRow(row);
    if (precioCaja != null && precioCaja > 0 && snapshot.precioVenta == null) {
      precioVenta = precioCaja;
    }
    var margenObj = snapshot.margenObjetivoPct != null ? snapshot.margenObjetivoPct : getMargenObjetivoPctDefault(row);
    var margenMin = snapshot.margenMinimoPct != null ? snapshot.margenMinimoPct : getMargenMinimoPctDefault(row);
    var margenReal =
      snapshot.margenRealPct != null ? snapshot.margenRealPct : calcMargenRealPctMenu(costoMp, precioVenta);
    var costoMpAnterior = snapshot.costoMpAnterior;
    if (costoMpAnterior == null && prevV && Math.abs(costoMp - prevV.costoMp) >= 1) {
      costoMpAnterior = prevV.costoMp;
    }
    var precioVentaAnterior = snapshot.precioVentaAnterior;
    if (precioVentaAnterior == null && prevV && Math.abs(precioVenta - prevV.precioVenta) >= 1) {
      precioVentaAnterior = prevV.precioVenta;
    }
    return pushHistorialCosteo(slug, {
      periodo: PERIODO_COSTEO_VIGENTE,
      label: snapshot.label || 'Vigente (actual)',
      costoMp: costoMp,
      precioVenta: precioVenta,
      costoMpAnterior: costoMpAnterior,
      precioVentaAnterior: precioVentaAnterior,
      margenObjetivoPct: margenObj,
      margenMinimoPct: margenMin,
      margenRealPct: margenReal,
      alertaMargen:
        snapshot.alertaMargen || alertaMargenDesdePct(margenReal, margenMin, margenObj),
      mpOrigenId: snapshot.mpOrigenId || null,
      mpOrigenNombre: snapshot.mpOrigenNombre || null,
      notas: snapshot.notas || '',
      guardadoAt: new Date().toISOString(),
    });
  }

  /** Actualiza el costeo vigente de uno o todos los platos del menú. */
  function syncHistorialVigenteDesdeMenu(opts) {
    opts = opts || {};
    var st = loadStore();
    migrateMenuCostosShape(st);
    var slugSet = null;
    if (opts.slugs && opts.slugs.length) {
      slugSet = {};
      opts.slugs.forEach(function (s) {
        slugSet[String(s)] = true;
      });
    }
    var n = 0;
    (st.menuCostos || []).forEach(function (m) {
      var row = normalizeMenuPlato(m);
      if (!row) return;
      if (slugSet && !slugSet[row.slug]) return;
      var snap = Object.assign({ notas: opts.notas || 'Sincronizado con menú' }, opts.snapshot || {});
      if (opts.getCostoMp && typeof opts.getCostoMp === 'function') {
        var c = opts.getCostoMp(row);
        if (c > 0) snap.costoMp = Math.round(c);
      }
      if (upsertHistorialCosteoVigente(row.slug, snap)) n++;
    });
    return n;
  }

  function ensureHistorialVigenteAll(opts) {
    return syncHistorialVigenteDesdeMenu(
      Object.assign({ notas: 'Costeo vigente inicial' }, opts || {})
    );
  }

  function guardarCosteoMenuSnapshot(opts) {
    opts = opts || {};
    var st = loadStore();
    migrateMenuCostosShape(st);
    var periodo = String(opts.periodo || new Date().toISOString().slice(0, 7)).slice(0, 7);
    var label = opts.label || periodo;
    var e = engine();
    var n = 0;
    (st.menuCostos || []).forEach(function (m) {
      var row = normalizeMenuPlato(m);
      if (!row) return;
      var costoMp = row.costoMp;
      if (opts.getCostoMp && typeof opts.getCostoMp === 'function') {
        var live = opts.getCostoMp(row);
        if (live > 0) costoMp = Math.round(live);
      }
      var precioVenta = row.precioVenta;
      var precioCaja = precioCajaPosParaMenuRow(row);
      if (precioCaja != null && precioCaja > 0) precioVenta = precioCaja;
      var margenRealPct = calcMargenRealPctMenu(costoMp, precioVenta);
      var margenObj = getMargenObjetivoPctDefault(row);
      var margenMin = getMargenMinimoPctDefault(row);
      pushHistorialCosteo(row.slug, {
        periodo: periodo,
        label: label,
        costoMp: costoMp,
        precioVenta: precioVenta,
        margenObjetivoPct: margenObj,
        margenMinimoPct: margenMin,
        margenRealPct: margenRealPct,
        alertaMargen: alertaMargenDesdePct(margenRealPct, margenMin, margenObj),
        notas: opts.notas || 'Archivo mensual · no modifica el vigente',
      });
      n++;
    });
    return n;
  }

  function listProgramacionesAll() {
    var out = [];
    (loadStore().menuCostos || []).forEach(function (m) {
      var row = normalizeMenuPlato(m);
      if (!row) return;
      (row.programaciones || []).forEach(function (p) {
        out.push({
          slug: row.slug,
          producto: row.producto,
          programacion: p,
        });
      });
    });
    out.sort(function (a, b) {
      return String(a.programacion.vigenciaDesde).localeCompare(String(b.programacion.vigenciaDesde));
    });
    return out;
  }

  function listHistorialCosteoAll() {
    var out = [];
    (loadStore().menuCostos || []).forEach(function (m) {
      var row = normalizeMenuPlato(m);
      if (!row) return;
      (row.historialCosteo || []).forEach(function (h) {
        out.push({ slug: row.slug, producto: row.producto, historial: h });
      });
    });
    out.sort(function (a, b) {
      var av = a.historial && a.historial.periodo === PERIODO_COSTEO_VIGENTE ? 1 : 0;
      var bv = b.historial && b.historial.periodo === PERIODO_COSTEO_VIGENTE ? 1 : 0;
      if (av !== bv) return bv - av;
      var c = String(b.historial.periodo).localeCompare(String(a.historial.periodo));
      if (c !== 0) return c;
      return String(a.producto).localeCompare(String(b.producto), 'es');
    });
    return out;
  }

  function syncProductoFromPos(p, opts) {
    opts = opts || {};
    if (!p || !String(p.nombre || '').trim()) return null;
    var st = loadStore();
    migrateMenuCostosShape(st);
    var slug = slugFromPosProduct(p);
    var tipo = inferTipoCosteoFromPos(p);
    var idx = (st.menuCostos || []).findIndex(function (m) {
      return m && m.slug === slug;
    });
    var precio = Math.round(num(p.precio));
    var base =
      idx >= 0
        ? Object.assign({}, st.menuCostos[idx])
        : {
            slug: slug,
            producto: String(p.nombre).trim(),
            costoMp: guessCostoMpForPosProduct(p),
            precioVenta: precio,
            origen: 'pos',
          };
    base.producto = String(p.nombre).trim();
    base.precioVenta = precio;
    base.posProductId = p.id;
    base.categoria = p.categoria || base.categoria || '';
    base.tipoCosteo = tipo;
    if (!Number(base.costoMp) || base.costoMp <= 0) {
      var sug = guessCostoMpForPosProduct(p);
      if (sug > 0) base.costoMp = sug;
    }
    var row = normalizeMenuPlato(base);
    if (tipo === 'directo') {
      var mpRow = ensureMpFromPosProducto(p, { silent: true });
      if (mpRow && mpRow.id) row.costeoMpSourceId = mpRow.id;
      if (mpRow && (!row.costoMp || row.costoMp <= 0)) row.costoMp = costoMenuDesdeMpItem(mpRow);
    } else {
      ensureRecetaForMenu(slug, row.producto);
    }
    if (idx >= 0) st.menuCostos[idx] = row;
    else st.menuCostos.push(row);
    saveStore(st);
    if (!opts.silent) emitChanged({ tipo: 'pos-producto', slug: slug, producto: row.producto });
    return row;
  }

  function removeMenuPlatoByPosId(posProductId) {
    var st = loadStore();
    var before = (st.menuCostos || []).length;
    st.menuCostos = (st.menuCostos || []).filter(function (m) {
      return !(m && m.posProductId != null && m.posProductId === posProductId);
    });
    if (st.menuCostos.length !== before) {
      saveStore(st);
      emitChanged({ tipo: 'menu-remove-pos', posProductId: posProductId });
    }
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
      if (demo && demo.lineas.length) bySlug[demo.slug] = demo;
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

    if (firstRun && demoCache) mergeCapacitacionRecetasFromDemo(st, demoCache);
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
      posProductId: raw.posProductId != null ? raw.posProductId : null,
      esReventaPos: raw.esReventaPos === true,
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
      posProductId: catRow.posProductId != null ? catRow.posProductId : null,
      esReventaPos: catRow.esReventaPos === true,
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
    migrateMenuCostosShape(st);
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
        detail.tipo === 'create-costeo' ||
        detail.tipo === 'upsert' ||
        detail.tipo === 'recepcion-precio'
      ) {
        var item = detail.merged || detail.item;
        var mpId = (item && (item.id || item.mpId)) || detail.mpId || null;
        global.crozzoCostosEmit('crozzo-costos:precio-mp-cambiado', {
          mpId: mpId,
          producto: item && item.nombre,
          precioUnit: item && item.precioUnit,
          precioTotal: item && item.precioTotal,
          peso: item && item.peso,
          und: item && item.und,
          item: item,
          origen: detail.origen,
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
            mpId: mpId,
            producto: r.nombre,
            precioUnit: r.precioUnit,
            precioTotal: r.precioTotal,
            precioAnterior: patch.precioAnterior,
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
    if (!opts.skipEvent) {
      try {
        global.dispatchEvent(
          new CustomEvent('crozzo-costos:receta-actualizada', {
            detail: {
              recipeId: rec.slug,
              lineas: rec.lineas,
              slug: rec.slug,
              opts: rec.opts || {},
            },
          })
        );
      } catch (_) {}
    }
    return rec;
  }

  function addProgramacionReceta(slug, vigenciaDesde, snapshot, opts) {
    opts = opts || {};
    var st = loadStore();
    migrateRecetasShape(st);
    var idx = (st.recetasPlatos || []).findIndex(function (r) {
      return r && r.slug === slug;
    });
    if (idx < 0) {
      ensureRecetaForMenu(slug, opts.producto || slug);
      st = loadStore();
      idx = (st.recetasPlatos || []).findIndex(function (r) {
        return r && r.slug === slug;
      });
    }
    if (idx < 0) return null;
    var rec = normalizeRecetaPlato(st.recetasPlatos[idx]);
    var prog = normalizeProgramacionReceta({
      vigenciaDesde: vigenciaDesde || new Date().toISOString().slice(0, 10),
      notas: opts.notas || 'Programación de receta',
      snapshot: snapshot || {},
    });
    if (!prog) return null;
    rec.programaciones = rec.programaciones || [];
    rec.programaciones.push(prog);
    st.recetasPlatos[idx] = rec;
    saveStore(st);
    emitChanged({ tipo: 'programacion-receta', slug: slug, programacion: prog });
    return prog;
  }

  function listProgramacionesRecetasAll() {
    var out = [];
    listRecetasPlatos().forEach(function (rec) {
      (rec.programaciones || []).forEach(function (p) {
        out.push({ slug: rec.slug, producto: rec.producto, programacion: p });
      });
    });
    return out.sort(function (a, b) {
      return String(a.programacion.vigenciaDesde).localeCompare(String(b.programacion.vigenciaDesde));
    });
  }

  function ejecutarProgramacionesRecetasPendientes(opts) {
    opts = opts || {};
    var st = loadStore();
    migrateRecetasShape(st);
    migrateMenuCostosShape(st);
    var now = new Date();
    var today = now.toISOString().slice(0, 10);
    var changed = 0;
    var aplicadas = [];
    (st.recetasPlatos || []).forEach(function (raw, idx) {
      var rec = normalizeRecetaPlato(raw);
      if (!rec || !rec.programaciones || !rec.programaciones.length) return;
      var touched = false;
      rec.programaciones.forEach(function (prog) {
        if (!prog || prog.estado !== 'pendiente') return;
        if (prog.vigenciaDesde > today) return;
        if (prog.vigenciaHasta && prog.vigenciaHasta < today) {
          prog.estado = 'cancelada';
          touched = true;
          return;
        }
        var snap = prog.snapshot || {};
        if (snap.lineas && snap.lineas.length) rec.lineas = snap.lineas.slice();
        if (snap.opts) rec.opts = Object.assign({}, DEFAULT_RECIPE_OPTS, snap.opts);
        rec.updatedAt = now.toISOString();
        prog.estado = 'aplicada';
        prog.aplicadaAt = now.toISOString();
        touched = true;
        changed++;
        var menuIdx = (st.menuCostos || []).findIndex(function (m) {
          return m && m.slug === rec.slug;
        });
        if (menuIdx >= 0) {
          var row = normalizeMenuPlato(st.menuCostos[menuIdx]);
          row.tipoCosteo = 'receta';
          if (snap.costoReferencia > 0) row.costoMp = Math.round(snap.costoReferencia);
          if (snap.precioVenta > 0) {
            row.precioVenta = Math.round(snap.precioVenta);
            if (opts.aplicarPos !== false) aplicarPrecioAlPos(row.slug, row.precioVenta);
          }
          st.menuCostos[menuIdx] = row;
        }
        aplicadas.push({ slug: rec.slug, programacion: prog, snapshot: snap });
      });
      if (touched) st.recetasPlatos[idx] = rec;
    });
    if (changed) {
      saveStore(st);
      aplicadas.forEach(function (item) {
        var snap = item.snapshot || {};
        upsertHistorialCosteoVigente(item.slug, {
          costoMp: snap.costoReferencia > 0 ? Math.round(snap.costoReferencia) : undefined,
          precioVenta: snap.precioVenta > 0 ? Math.round(snap.precioVenta) : undefined,
          notas:
            'Programación de receta aplicada · ' +
            (item.programacion && item.programacion.vigenciaDesde ? item.programacion.vigenciaDesde : today),
        });
        var recAfter = getRecetaPlato(item.slug);
        try {
          global.dispatchEvent(
            new CustomEvent('crozzo-costos:receta-actualizada', {
              detail: {
                recipeId: item.slug,
                slug: item.slug,
                lineas: recAfter ? recAfter.lineas : [],
                opts: recAfter ? recAfter.opts : {},
              },
            })
          );
        } catch (_) {}
      });
      emitChanged({ tipo: 'programaciones-receta-aplicadas', count: changed, items: aplicadas });
    }
    return changed;
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
    mergeCapacitacionRecetasFromDemo(st, j);
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
      mergeCapacitacionRecetasFromDemo(loadStore(), j);
      ensureMpFromPosVentaDirecta({ silent: true });
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
        var n = normalizeMenuPlato(r);
        return n || r;
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

  function slugFromPosProduct(p) {
    if (!p) return '';
    if (p.sku) return String(p.sku).trim().toUpperCase();
    return slugPlato(p.nombre);
  }

  function mapCategoriaPosToMp(categoriaPos) {
    var c = String(categoriaPos || '').toLowerCase();
    if (c === 'bebidas') return 'BEBIDAS Y LICORES';
    if (c === 'entradas' || c === 'postres') return 'PROCESADOS';
    if (c === 'platos-fuertes') return 'OTRO';
    return 'OTRO';
  }

  function mpIdForPosReventa(p) {
    var base = slugId(String((p && p.nombre) || '').trim());
    return base.indexOf('mp_') === 0 ? 'mp_pos_' + base.slice(3) : 'mp_pos_' + base;
  }

  function isMpReventaPos(mp) {
    return !!(mp && (mp.esReventaPos === true || String(mp.id || '').indexOf('mp_pos_') === 0));
  }

  /**
   * Productos POS de venta directa (sin transformación) también son materia prima
   * para recepción de facturas (compra de agua, gaseosa, etc.).
   */
  function ensureMpFromPosProducto(p, opts) {
    opts = opts || {};
    if (!p || !String(p.nombre || '').trim()) return null;
    if (inferTipoCosteoFromPos(p) !== 'directo') return null;
    var nombre = String(p.nombre).trim();
    var exist = getByNombre(nombre);
    if (exist) return exist;
    var id = mpIdForPosReventa(p);
    if (get(id)) return get(id);
    var precioSug = guessCostoMpForPosProduct(p);
    var costoRef = precioSug > 0 ? precioSug : Math.round(num(p.precio) * 0.5) || 0;
    var merged = upsertCatalog(
      {
        id: id,
        nombre: nombre,
        categoria: mapCategoriaPosToMp(p.categoria),
        proveedores: [],
        posProductId: p.id,
        esReventaPos: true,
        activo: true,
      },
      { skipInvMov: true }
    );
    if (!merged) return null;
    upsertCosteo(
      {
        mpId: merged.id,
        und: 'UNI',
        peso: 1,
        precioTotal: costoRef,
      },
      { origen: 'recepcion', skipVariacionCheck: true, skipConfirm: true }
    );
    merged = get(merged.id) || merged;
    if (!opts.silent) {
      emitChanged({ tipo: 'mp-pos-reventa', producto: nombre, mpId: id });
    }
    return merged;
  }

  function ensureMpFromPosVentaDirecta(opts) {
    opts = opts || { silent: true };
    var prods =
      typeof global.products !== 'undefined' && Array.isArray(global.products) ? global.products : [];
    var n = 0;
    prods.forEach(function (p) {
      if (ensureMpFromPosProducto(p, { silent: true })) n++;
    });
    return n;
  }

  function findPosDirectoForRecepcion(q) {
    var needle = String(q || '')
      .trim()
      .toLowerCase();
    if (!needle) return [];
    var prods =
      typeof global.products !== 'undefined' && Array.isArray(global.products) ? global.products : [];
    return prods.filter(function (p) {
      if (!p || inferTipoCosteoFromPos(p) !== 'directo') return false;
      var blob = [p.nombre, p.categoria, p.id, slugFromPosProduct(p)].join(' ').toLowerCase();
      return blob.indexOf(needle) >= 0;
    });
  }

  /** Sugiere costo MP para bebidas / productos de reventa (sin receta de cocina). */
  function guessCostoMpForPosProduct(p) {
    var name = String((p && p.nombre) || '').toLowerCase();
    if (!name) return 0;
    var rules = [
      { re: /gaseosa/, mpId: 'mp_gaseosa' },
      { re: /agua/, mpId: 'mp_agua_botella' },
      { re: /caf[eé]/, mpId: 'mp_cafe_molido', factor: 0.02 },
      { re: /cerveza/, mpId: 'mp_gaseosa', factor: 1.2 },
      { re: /jugo/, mpId: 'mp_leche_entera', factor: 0.15 },
    ];
    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      if (!rule.re.test(name)) continue;
      var mp = get(rule.mpId);
      if (!mp) continue;
      var base = num(mp.precioTotal);
      if (rule.factor) return Math.round(base * rule.factor);
      return Math.round(base);
    }
    var byName = getByNombre(p.nombre);
    if (byName) return Math.round(num(byName.precioTotal));
    return num(p.costoMp || p.costo) || 0;
  }

  /**
   * Incorpora todos los productos del POS (global.products) a menuCostos.
   * Los que ya existen actualizan nombre y precio de venta desde el catálogo.
   */
  function ensureMenuPosProductos(opts) {
    opts = opts || {};
    var prods =
      typeof global.products !== 'undefined' && Array.isArray(global.products) ? global.products : [];
    if (!prods.length) return 0;
    var st = loadStore();
    var bySlug = {};
    (st.menuCostos || []).forEach(function (m) {
      if (m && m.slug) bySlug[m.slug] = Object.assign({}, m);
    });
    var added = 0;
    var updated = 0;
    prods.forEach(function (p) {
      if (!p || !String(p.nombre || '').trim()) return;
      var slug = slugFromPosProduct(p);
      var precio = Math.round(num(p.precio));
      var ex = bySlug[slug];
      if (ex) {
        var tipoPos = inferTipoCosteoFromPos(p);
        var patch = {
          producto: String(p.nombre).trim(),
          precioVenta: precio,
          posProductId: p.id,
          categoria: p.categoria || ex.categoria || '',
          tipoCosteo: tipoPos,
        };
        if (tipoPos === 'directo') {
          var mpEx = ensureMpFromPosProducto(p, { silent: true });
          if (mpEx && mpEx.id) {
            patch.costeoMpSourceId = mpEx.id;
            if (!opts.keepCostos) patch.costoMp = costoMenuDesdeMpItem(mpEx);
          }
        }
        if (!Number(ex.costoMp) || Number(ex.costoMp) <= 0) {
          var sug = guessCostoMpForPosProduct(p);
          if (sug > 0) patch.costoMp = sug;
        }
        bySlug[slug] = normalizeMenuPlato(Object.assign({}, ex, patch));
        updated++;
        return;
      }
      var costo = guessCostoMpForPosProduct(p);
        var mpRow = ensureMpFromPosProducto(p, { silent: true });
        var srcId = mpRow && mpRow.id ? mpRow.id : null;
        var costoDirecto = mpRow ? costoMenuDesdeMpItem(mpRow) : costo;
        bySlug[slug] = normalizeMenuPlato({
        slug: slug,
        producto: String(p.nombre).trim(),
        costoMp: costoDirecto || costo,
        precioVenta: precio,
        posProductId: p.id,
        costeoMpSourceId: srcId,
        categoria: p.categoria || '',
        origen: 'pos',
        tipoCosteo: inferTipoCosteoFromPos(p),
      });
      added++;
    });
    st.menuCostos = Object.keys(bySlug)
      .map(function (k) {
        return bySlug[k];
      })
      .sort(function (a, b) {
        return String(a.producto).localeCompare(String(b.producto), 'es');
      });
    saveStore(st);
    if (!opts.silent && (added > 0 || updated > 0)) {
      emitChanged({ tipo: 'menu-pos-sync', added: added, updated: updated });
    }
    return added;
  }

  function updateMenuPlato(slug, patch) {
    var st = loadStore();
    var idx = (st.menuCostos || []).findIndex(function (r) {
      return r.slug === slug;
    });
    if (idx < 0) return null;
    st.menuCostos[idx] = normalizeMenuPlato(Object.assign({}, st.menuCostos[idx], patch));
    saveStore(st);
    emitChanged({ tipo: 'menu', slug: slug });
    return st.menuCostos[idx];
  }

  /** Actualiza varios platos del menú en un solo guardado (evita tormenta de eventos). */
  function updateMenuPlatosBatch(updates) {
    updates = Array.isArray(updates) ? updates : [];
    if (!updates.length) return 0;
    var st = loadStore();
    var slugs = [];
    updates.forEach(function (u) {
      if (!u || !u.slug) return;
      var idx = (st.menuCostos || []).findIndex(function (r) {
        return r.slug === u.slug;
      });
      if (idx < 0) return;
      st.menuCostos[idx] = normalizeMenuPlato(Object.assign({}, st.menuCostos[idx], u.patch || {}));
      slugs.push(u.slug);
    });
    if (!slugs.length) return 0;
    saveStore(st);
    emitChanged({ tipo: 'menu-batch', slugs: slugs, count: slugs.length });
    return slugs.length;
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
    updateMenuPlatosBatch: updateMenuPlatosBatch,
    normalizeMenuPlato: normalizeMenuPlato,
    inferTipoCosteoFromPos: inferTipoCosteoFromPos,
    syncProductoFromPos: syncProductoFromPos,
    removeMenuPlatoByPosId: removeMenuPlatoByPosId,
    getMenuPlato: getMenuPlato,
    addProgramacionPrecio: addProgramacionPrecio,
    ejecutarProgramacionesPendientes: ejecutarProgramacionesPendientes,
    pushHistorialCosteo: pushHistorialCosteo,
    PERIODO_COSTEO_VIGENTE: PERIODO_COSTEO_VIGENTE,
    upsertHistorialCosteoVigente: upsertHistorialCosteoVigente,
    syncHistorialVigenteDesdeMenu: syncHistorialVigenteDesdeMenu,
    ensureHistorialVigenteAll: ensureHistorialVigenteAll,
    guardarCosteoMenuSnapshot: guardarCosteoMenuSnapshot,
    listProgramacionesAll: listProgramacionesAll,
    listHistorialCosteoAll: listHistorialCosteoAll,
    aplicarPrecioAlPos: aplicarPrecioAlPos,
    ensureMpFromPosProducto: ensureMpFromPosProducto,
    ensureMpFromPosVentaDirecta: ensureMpFromPosVentaDirecta,
    findPosDirectoForRecepcion: findPosDirectoForRecepcion,
    isMpReventaPos: isMpReventaPos,
    listMenuSlugsAffectedByMp: listMenuSlugsAffectedByMp,
    resolveMpIdForMenuRow: resolveMpIdForMenuRow,
    costoMenuDesdeMpItem: costoMenuDesdeMpItem,
    getMargenObjetivoPctDefault: getMargenObjetivoPctDefault,
    getMargenMinimoPctDefault: getMargenMinimoPctDefault,
    ensureMenuPosProductos: ensureMenuPosProductos,
    guessCostoMpForPosProduct: guessCostoMpForPosProduct,
    slugFromPosProduct: slugFromPosProduct,
    updateRecetaDemoLineas: updateRecetaDemoLineas,
    listRecetasPlatos: listRecetasPlatos,
    getRecetaPlato: getRecetaPlato,
    upsertRecetaPlato: upsertRecetaPlato,
    ensureRecetaForMenu: ensureRecetaForMenu,
    addProgramacionReceta: addProgramacionReceta,
    listProgramacionesRecetasAll: listProgramacionesRecetasAll,
    ejecutarProgramacionesRecetasPendientes: ejecutarProgramacionesRecetasPendientes,
    slugPlato: slugPlato,
    slugId: slugId,
    calcPrecioUnit: calcPrecioUnit,
    normalizeItem: normalizeItem,
    parseProveedores: parseProveedores,
  };
})(typeof window !== 'undefined' ? window : globalThis);
