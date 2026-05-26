/* Crozzo bundle: CrozzoBundleCostos.js — generado, no editar */


/* --- CrozzoCostosEngine.js --- */

/**
 * Crozzo POS — Motor de costos QyC (basado en COSTO DE PRODUCTOS QYC.xlsx)
 * PRECIOS → sub-recetas → recetas → RESUMEN
 */
(function (global) {
  'use strict';

  var DEFAULTS = {
    margenErrorPct: 0.03,
    porcentajeMpObjetivo: 0.30,
    impuestoPct: 0.08,
    porciones: 1,
  };

  function num(v, fb) {
    if (v == null || v === '') return fb == null ? 0 : fb;
    var n = Number(v);
    return isFinite(n) ? n : (fb == null ? 0 : fb);
  }

  function round(v, dec) {
    dec = dec == null ? 2 : dec;
    var p = Math.pow(10, dec);
    return Math.round(num(v) * p) / p;
  }

  /** E/C — precio por gramo o unidad en matriz PRECIOS */
  function precioUnitarioMp(precioTotal, pesoReferencia) {
    var p = num(precioTotal);
    var w = num(pesoReferencia);
    if (w <= 0) return 0;
    return p / w;
  }

  /** Evalúa cantidad simple: número o expresión tipo "340*2", "23900/2", "4.5*3" */
  function evalCantidad(raw) {
    if (typeof raw === 'number') return raw;
    if (raw == null || raw === '') return 0;
    var s = String(raw).trim().replace(/,/g, '.');
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
    var mMul = s.match(/^(-?\d+(?:\.\d+)?)\s*\*\s*(-?\d+(?:\.\d+)?)$/);
    if (mMul) return Number(mMul[1]) * Number(mMul[2]);
    var mDiv = s.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/);
    if (mDiv) return Number(mDiv[1]) / Number(mDiv[2]);
    return num(s);
  }

  /** Línea receta: G = E × D */
  function lineaReceta(costoXUnidad, cantidad) {
    return num(costoXUnidad) * evalCantidad(cantidad);
  }

  /**
   * Bloque receta (hoja DESAYUNOS / SUB-R. COCINA)
   * @param {Array<{costoXUnidad:number,cantidad:number}>} lineas
   * @param {{margenErrorPct?:number,porcentajeMpObjetivo?:number,impuestoPct?:number,porciones?:number}} opts
   */
  function calcularReceta(lineas, opts) {
    opts = Object.assign({}, DEFAULTS, opts || {});
    lineas = Array.isArray(lineas) ? lineas : [];

    var detalle = lineas.map(function (ln) {
      var total = lineaReceta(ln.costoXUnidad, ln.cantidad);
      return {
        ingrediente: ln.ingrediente || ln.producto || '',
        unidad: ln.unidad || ln.und || '',
        cantidad: evalCantidad(ln.cantidad),
        costoXUnidad: num(ln.costoXUnidad),
        total: total,
      };
    });

    var k3 = detalle.reduce(function (s, d) { return s + d.total; }, 0);
    var j4 = num(opts.margenErrorPct, DEFAULTS.margenErrorPct);
    var k4 = k3 * j4;
    var k5 = k3 + k4;
    var k6 = num(opts.porciones, 1);
    if (k6 <= 0) k6 = 1;
    var k7 = k5 / k6;
    var k9 = num(opts.porcentajeMpObjetivo, DEFAULTS.porcentajeMpObjetivo);
    if (k9 <= 0) k9 = DEFAULTS.porcentajeMpObjetivo;
    var k10 = k7 / k9;
    var j11 = num(opts.impuestoPct, DEFAULTS.impuestoPct);
    var k11 = k10 * (1 + j11);

    detalle.forEach(function (d) {
      d.pctDelTotal = k3 > 0 ? d.total / k3 : 0;
    });

    return {
      lineas: detalle,
      totalMp: round(k3),
      margenErrorPct: j4,
      margenErrorMonto: round(k4),
      totalAlCosto: round(k5),
      pesoOUnidades: k6,
      costoReferencia: round(k7, 4),
      porcentajeMpObjetivo: k9,
      precioSugerido: round(k10),
      precioConImpuesto: round(k11),
      impuestoPct: j11,
    };
  }

  /**
   * Fila RESUMEN — decisión gerencia
   * C = costo MP (recipe K7), G = precio venta manual
   */
  function calcularResumen(costoMp, precioVenta) {
    var c = num(costoMp);
    var g = num(precioVenta);
    if (g <= 0) {
      return {
        costoMp: round(c),
        precioVenta: 0,
        utilidadBruta: 0,
        pctCostoMp: 0,
        pctUtilidad: 0,
      };
    }
    var d = g - c;
    return {
      costoMp: round(c),
      precioVenta: round(g),
      utilidadBruta: round(d),
      pctCostoMp: round(c / g, 4),
      pctUtilidad: round(d / g, 4),
    };
  }

  /** Compara margen real vs objetivo food cost */
  function evaluarMargen(resumen, porcentajeMpObjetivo) {
    var target = num(porcentajeMpObjetivo, DEFAULTS.porcentajeMpObjetivo);
    var actual = num(resumen && resumen.pctCostoMp);
    var diff = actual - target;
    return {
      objetivoPct: target,
      actualPct: actual,
      diferenciaPct: round(diff, 4),
      dentroObjetivo: actual <= target,
      alerta: actual > target ? 'sobre-objetivo' : (actual < target * 0.85 ? 'margen-alto' : 'ok'),
    };
  }

  /**
   * Resuelve costo unitario de ingrediente desde matriz PRECIOS o sub-receta cacheada
   * @param {string} nombre
   * @param {{precios:Object, subRecetas:Object}} store precios[nombre].precioUnit | subRecetas[id].costoReferencia
   */
  function resolverCostoUnitario(nombre, store) {
    store = store || {};
    var key = String(nombre || '').trim().toUpperCase();
    if (!key) return 0;

    if (store.subRecetas && store.subRecetas[key]) {
      return num(store.subRecetas[key].costoReferencia);
    }
    if (store.precios) {
      var direct = store.precios[key];
      if (direct) return num(direct.precioUnit != null ? direct.precioUnit : precioUnitarioMp(direct.precioTotal, direct.peso));
      var keys = Object.keys(store.precios);
      for (var i = 0; i < keys.length; i++) {
        if (keys[i].toUpperCase() === key) {
          var p = store.precios[keys[i]];
          return num(p.precioUnit != null ? p.precioUnit : precioUnitarioMp(p.precioTotal, p.peso));
        }
      }
    }
    return 0;
  }

  /**
   * Recalcula sub-recetas dependientes de PRECIOS, luego recetas que las usan
   * @param {Array<{id:string,lineas:Array,opts?:object}>} subRecetas
   * @param {Object} precios map nombre → {precioTotal,peso,precioUnit}
   */
  function recalcularCadena(subRecetas, precios, opts) {
    opts = opts || {};
    var store = { precios: precios || {}, subRecetas: {} };
    var out = [];

    (subRecetas || []).forEach(function (sr) {
      var lineas = (sr.lineas || []).map(function (ln) {
        return {
          ingrediente: ln.ingrediente || ln.producto,
          unidad: ln.unidad,
          cantidad: ln.cantidad,
          costoXUnidad: ln.costoXUnidad != null
            ? ln.costoXUnidad
            : resolverCostoUnitario(ln.ingrediente || ln.producto || ln.mpRef, store),
        };
      });
      var calc = calcularReceta(lineas, sr.opts || opts);
      var entry = {
        id: sr.id,
        nombre: sr.nombre || sr.id,
        calc: calc,
        costoReferencia: calc.costoReferencia,
      };
      store.subRecetas[String(sr.id).trim().toUpperCase()] = entry;
      out.push(entry);
    });

    return { store: store, subRecetas: out };
  }

  /** Formateo COP para UI */
  function fmtCop(n) {
    return '$' + round(num(n)).toLocaleString('es-CO', { maximumFractionDigits: 0 });
  }

  function fmtPct(n) {
    return (round(num(n) * 100, 1)).toFixed(1) + '%';
  }

  function undRefLabel(und) {
    var u = String(und || 'GR').toUpperCase();
    if (u === 'ML') return 'ml';
    if (u === 'KG') return 'kg';
    if (u === 'GR' || u === 'MG') return 'g';
    if (u === 'UNI' || u === 'UND') return 'und';
    if (u === 'PAQ') return 'paq';
    if (u === 'CAJA') return 'caja';
    return u.toLowerCase();
  }

  /** Encabezado de columna según unidad (ej. Precio / ml) */
  function etiquetaPrecioUnd(und) {
    var ref = undRefLabel(und);
    if (ref === 'und' || ref === 'paq' || ref === 'caja') return 'Precio / ' + ref;
    return 'Precio / ' + ref;
  }

  /** Muestra $3,80 / ml (no genérico $/u) */
  function formatoPrecioPorUnd(precioUnit, und) {
    var v = num(precioUnit);
    var u = String(und || 'GR').toUpperCase();
    var dec = 4;
    if (u === 'ML' || u === 'GR') dec = v >= 10 ? 2 : v >= 1 ? 2 : 4;
    if (u === 'KG') dec = 2;
    if (u === 'UNI' || u === 'UND' || u === 'PAQ' || u === 'CAJA') dec = 0;
    var s =
      '$' +
      v.toLocaleString('es-CO', { minimumFractionDigits: dec, maximumFractionDigits: dec }) +
      ' / ' +
      undRefLabel(u);
    return s;
  }

  /** Ej: $3.800 ÷ 1.000 ml = $3,80 / ml */
  function hintCalculoPrecio(precioTotal, peso, und) {
    var p = num(precioTotal);
    var w = num(peso);
    if (w <= 0) return '';
    var unit = precioUnitarioMp(p, w);
    return (
      fmtCop(p) +
      ' ÷ ' +
      w.toLocaleString('es-CO') +
      ' ' +
      undRefLabel(und) +
      ' = ' +
      formatoPrecioPorUnd(unit, und)
    );
  }

  /**
   * Alerta si la variación parece error humano (ej. 3.800 → 40.000).
   * umbralRatio: factor máximo sin confirmar (default 2.5 = 250 %).
   */
  function evaluarVariacionPrecio(anterior, nuevo, opts) {
    opts = opts || {};
    var umbralRatio = opts.umbralRatio != null ? opts.umbralRatio : 2.5;
    var ant = num(anterior);
    var neu = num(nuevo);
    if (ant <= 0 || neu <= 0) return { ok: true, ratio: 1 };
    var ratio = neu / ant;
    if (ratio <= umbralRatio && ratio >= 1 / umbralRatio) return { ok: true, ratio: ratio };
    var pct = Math.abs((ratio - 1) * 100);
    var dir =
      ratio >= 1
        ? 'aumentar el valor en ' + pct.toFixed(0) + ' % (×' + ratio.toFixed(1) + ')'
        : 'bajar el valor en ' + pct.toFixed(0) + ' %';
    var msg =
      'Variación desproporcionada en el costeo:\n\n' +
      '• Actual: ' +
      fmtCop(ant) +
      ' (lote de referencia)\n' +
      '• Nuevo: ' +
      fmtCop(neu) +
      '\n\n' +
      '¿Seguro que desea ' +
      dir +
      '?\n\nRevise la factura de recepción si el cambio no es intencional.';
    return { ok: false, ratio: ratio, anterior: ant, nuevo: neu, mensaje: msg };
  }

  var FORMULAS = {
    precioUnitario: 'precio_unit = precio_total / peso_referencia',
    linea: 'total_linea = costo_x_unidad × cantidad',
    lineaPct: 'pct_linea = total_linea / SUM(totales)',
    totalMp: 'K3 = SUM(totales líneas)',
    margenError: 'K4 = K3 × margen_error_pct',
    totalAlCosto: 'K5 = K3 + K4',
    costoReferencia: 'K7 = K5 / porciones (K6)',
    precioSugerido: 'K10 = K7 / porcentaje_mp_objetivo (K9)',
    precioImpuesto: 'K11 = K10 × (1 + impuesto_pct)',
    resumenCosto: 'C = receta!K7',
    resumenUtilidad: 'D = precio_venta − costo_mp',
    resumenPctCosto: 'E = costo_mp / precio_venta',
    resumenPctUtilidad: 'F = utilidad / precio_venta',
  };

  global.CrozzoCostosEngine = {
    DEFAULTS: DEFAULTS,
    FORMULAS: FORMULAS,
    num: num,
    round: round,
    precioUnitarioMp: precioUnitarioMp,
    evalCantidad: evalCantidad,
    lineaReceta: lineaReceta,
    calcularReceta: calcularReceta,
    calcularResumen: calcularResumen,
    evaluarMargen: evaluarMargen,
    resolverCostoUnitario: resolverCostoUnitario,
    recalcularCadena: recalcularCadena,
    fmtCop: fmtCop,
    fmtPct: fmtPct,
    undRefLabel: undRefLabel,
    etiquetaPrecioUnd: etiquetaPrecioUnd,
    formatoPrecioPorUnd: formatoPrecioPorUnd,
    hintCalculoPrecio: hintCalculoPrecio,
    evaluarVariacionPrecio: evaluarVariacionPrecio,
  };
})(window);



/* --- CrozzoCatalogoMp.js --- */

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



/* --- CrozzoMatrizMp.js --- */

/**
 * Crozzo POS — Catálogo de materias primas (nombre, categoría, proveedores)
 */
(function (global) {
  'use strict';

  var CATEGORIAS = [
    'PROTEINAS',
    'LACTEOS',
    'FRUVER',
    'ABARROTES',
    'PULPAS Y CONGELADOS',
    'BEBIDAS Y LICORES',
    'DESECHABLES',
    'TERCERIZADOS',
    'ASEO',
    'PROCESADOS',
  ];

  var CAT_LABEL = {
    PROTEINAS: 'Proteínas',
    LACTEOS: 'Lácteos',
    FRUVER: 'Fruver',
    ABARROTES: 'Abarrotes',
    'PULPAS Y CONGELADOS': 'Pulpas y congelados',
    'BEBIDAS Y LICORES': 'Bebidas y licores',
    DESECHABLES: 'Desechables',
    TERCERIZADOS: 'Tercerizados',
    ASEO: 'Aseo',
    PROCESADOS: 'Procesados',
    OTRO: 'Otro',
  };

  var ui = { q: '', cat: '' };

  function cat() {
    return global.CrozzoCatalogoMp;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function toast(m, t) {
    try {
      if (typeof global.showToast === 'function') global.showToast(m, t || 'info');
    } catch (_) {}
  }

  function proveedoresToStr(arr) {
    return (arr || []).join(', ');
  }

  function injectStyles() {
    if (document.getElementById('crozzo-matriz-mp-css')) return;
    var el = document.createElement('style');
    el.id = 'crozzo-matriz-mp-css';
    el.textContent =
      '.crozzo-mp-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:0 0 14px}' +
      '.crozzo-mp-search{flex:1;min-width:200px;max-width:420px;padding:10px 14px;border-radius:10px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-primary);font-size:14px}' +
      '.crozzo-mp-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}' +
      '.crozzo-mp-chip{padding:6px 12px;border-radius:999px;border:1px solid var(--border);background:var(--bg-card);font-size:11px;font-weight:600;cursor:pointer;transition:all .2s}' +
      '.crozzo-mp-chip:hover{border-color:var(--accent)}' +
      '.crozzo-mp-chip.is-active{background:var(--accent);color:#111;border-color:var(--accent)}' +
      '.crozzo-mp-table{width:100%;border-collapse:collapse;font-size:.8rem}' +
      '.crozzo-mp-table th{position:sticky;top:0;background:var(--bg-secondary);z-index:1;font-size:.68rem;text-transform:uppercase;letter-spacing:.05em;padding:10px 8px;border-bottom:2px solid var(--border)}' +
      '.crozzo-mp-table td{padding:6px 8px;border-bottom:1px solid var(--border);vertical-align:middle}' +
      '.crozzo-mp-table tr:hover td{background:rgba(var(--accent-rgb,201,169,98),.06)}' +
      '.crozzo-mp-cat{display:inline-block;padding:3px 8px;border-radius:6px;font-size:10px;font-weight:700;background:rgba(var(--accent-rgb,201,169,98),.12);color:var(--accent);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.crozzo-mp-inp{width:100%;min-width:0;padding:6px 8px;border-radius:6px;border:1px solid transparent;background:transparent;color:inherit;font-size:.8rem}' +
      '.crozzo-mp-inp:hover{border-color:var(--border)}' +
      '.crozzo-mp-inp:focus{border-color:var(--accent);background:var(--bg-card);outline:none}' +
      '.crozzo-mp-scroll{max-height:min(58vh,520px);overflow:auto;border:1px solid var(--border);border-radius:12px}' +
      '.crozzo-mp-meta{font-size:.78rem;opacity:.75;margin:0 0 12px}' +
      '.crozzo-mp-form{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;padding:14px;border:1px dashed var(--border);border-radius:12px;margin-bottom:14px;background:rgba(var(--accent-rgb,201,169,98),.04)}' +
      '.crozzo-mp-form label{font-size:10px;font-weight:600;text-transform:uppercase;opacity:.7;display:block;margin-bottom:4px}' +
      '.crozzo-mp-form input,.crozzo-mp-form select{width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--border);background:var(--bg-card);color:inherit;font-size:13px}';
    document.head.appendChild(el);
  }

  function buildCatalog() {
    var C = cat();
    return C && C.listCatalog ? C.listCatalog() : C && C.list ? C.list() : [];
  }

  function filterItems(items) {
    var q = ui.q.toLowerCase().trim();
    return items.filter(function (it) {
      if (ui.cat && it.categoria !== ui.cat) return false;
      if (!q) return true;
      var prov = proveedoresToStr(it.proveedores).toLowerCase();
      return (
        String(it.nombre).toLowerCase().indexOf(q) >= 0 ||
        String(it.categoria).toLowerCase().indexOf(q) >= 0 ||
        prov.indexOf(q) >= 0 ||
        String(CAT_LABEL[it.categoria] || '').toLowerCase().indexOf(q) >= 0
      );
    });
  }

  function renderRows(items) {
    if (!items.length) {
      return '<tr><td colspan="4" style="text-align:center;padding:24px;opacity:.7">Sin insumos. Use + Materia prima.</td></tr>';
    }
    return items
      .map(function (it) {
        var catLbl = CAT_LABEL[it.categoria] || it.categoria;
        return (
          '<tr data-mp-id="' +
          esc(it.id) +
          '">' +
          '<td><span class="crozzo-mp-cat" title="' +
          esc(it.categoria) +
          '">' +
          esc(catLbl) +
          '</span></td>' +
          '<td><input class="crozzo-mp-inp" data-mp-field="nombre" value="' +
          esc(it.nombre) +
          '"></td>' +
          '<td><input class="crozzo-mp-inp" data-mp-field="proveedores" value="' +
          esc(proveedoresToStr(it.proveedores)) +
          '" placeholder="Proveedor A, Proveedor B" title="Separar con comas"></td>' +
          '<td><button type="button" class="btn btn-outline btn-sm crozzo-mp-del" data-mp-id="' +
          esc(it.id) +
          '" title="Eliminar">×</button></td></tr>'
        );
      })
      .join('');
  }

  function renderPanel(opts) {
    opts = opts || {};
    var embedded = !!opts.embedded;
    injectStyles();
    var all = buildCatalog();
    var filtered = filterItems(all);
    var chips =
      '<button type="button" class="crozzo-mod-chip crozzo-mp-chip' +
      (ui.cat === '' ? ' is-active' : '') +
      '" data-mp-cat="">Todas (' +
      all.length +
      ')</button>' +
      CATEGORIAS.map(function (c) {
        var n = all.filter(function (x) {
          return x.categoria === c;
        }).length;
        if (!n) return '';
        return (
          '<button type="button" class="crozzo-mod-chip crozzo-mp-chip' +
          (ui.cat === c ? ' is-active' : '') +
          '" data-mp-cat="' +
          esc(c) +
          '">' +
          esc(CAT_LABEL[c] || c) +
          ' (' +
          n +
          ')</button>'
        );
      }).join('');

    var chrome = embedded
      ? ''
      : '<nav class="crozzo-mod-nav crozzo-mod-nav--links">' +
        '<button type="button" class="btn btn-outline btn-sm" id="crozzoMpGoCostos">Costeo MP</button>' +
        '<button type="button" class="btn btn-primary btn-sm" id="crozzoMpToggleNew">+ Materia prima</button></nav>';
    var newBtn = embedded
      ? '<button type="button" class="btn btn-primary btn-sm" id="crozzoMpToggleNew">+ Materia prima</button>'
      : '';
    return (
      '<div class="crozzo-mod-page crozzo-mp-root' +
      (embedded ? ' crozzo-mod-embedded' : '') +
      '">' +
      chrome +
      '<div class="crozzo-mod-toolbar-bar"><div class="crozzo-mod-toolbar">' +
      '<input type="search" id="crozzoMpSearch" placeholder="Buscar nombre o proveedor…" value="' +
      esc(ui.q) +
      '" autocomplete="off">' +
      '<span class="form-hint">' +
      filtered.length +
      ' / ' +
      all.length +
      '</span>' +
      newBtn +
      '</div></div>' +
      '<div class="crozzo-mod-chip-row crozzo-mp-chips">' +
      chips +
      '</div>' +
      '<div class="crozzo-mod-form-grid crozzo-mp-form" id="crozzoMpNewForm" style="display:none;margin-bottom:14px;padding:14px;border:1px dashed var(--border);border-radius:12px;background:rgba(var(--accent-rgb,201,169,98),.04)">' +
      '<div><label>Nombre</label><input id="crozzoMpNewNombre" placeholder="Ej. Aceite vegetal"></div>' +
      '<div><label>Categoría</label><select id="crozzoMpNewCat">' +
      CATEGORIAS.map(function (c) {
        return '<option value="' + esc(c) + '">' + esc(CAT_LABEL[c] || c) + '</option>';
      }).join('') +
      '<option value="OTRO">Otro</option></select></div>' +
      '<div style="grid-column:1/-1"><label>Proveedor(es)</label><input id="crozzoMpNewProv" placeholder="Distribuidora Norte, Mayorista Sol"></div>' +
      '<div style="display:flex;align-items:flex-end;gap:8px;grid-column:1/-1">' +
      '<button type="button" class="btn btn-primary btn-sm" id="crozzoMpSaveNew">Guardar</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoMpCancelNew">Cancelar</button></div></div>' +
      '<div class="crozzo-mp-scroll"><table class="crozzo-mp-table"><thead><tr>' +
      '<th>Categoría</th><th>Materia prima</th><th>Proveedor(es)</th><th></th>' +
      '</tr></thead><tbody id="crozzoMpTbody">' +
      renderRows(filtered) +
      '</tbody></table></div></div>'
    );
  }

  function getItemFromRow(tr) {
    var C = cat();
    if (!C) return null;
    var id = tr.getAttribute('data-mp-id');
    var base = C.get(id);
    if (!base) return null;
    var row = {
      id: id,
      nombre: base.nombre,
      categoria: base.categoria,
      proveedores: (base.proveedores || []).slice(),
    };
    tr.querySelectorAll('[data-mp-field]').forEach(function (inp) {
      var f = inp.getAttribute('data-mp-field');
      if (f === 'proveedores') row.proveedores = C.parseProveedores ? C.parseProveedores(inp.value) : inp.value.split(',');
      else row[f] = inp.value;
    });
    return row;
  }

  function refreshTable(root) {
    var tbody = root.querySelector('#crozzoMpTbody');
    if (!tbody) return;
    var filtered = filterItems(buildCatalog());
    tbody.innerHTML = renderRows(filtered);
    var hint = root.querySelector('.crozzo-mod-toolbar .form-hint');
    if (hint) {
      var all = buildCatalog();
      hint.textContent = filtered.length + ' / ' + all.length;
    }
  }

  function init(root) {
    if (!root) return;
    var C = cat();
    if (!C) return;

    var searchTimer;
    var search = root.querySelector('#crozzoMpSearch');
    if (search) {
      search.addEventListener('input', function () {
        ui.q = search.value;
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () {
          refreshTable(root);
        }, 150);
      });
    }

    if (!root._mpBound) {
      root._mpBound = true;
      document.addEventListener('crozzo-catalogo-mp:changed', function () {
        if (root.isConnected) refreshTable(root);
      });
    }

    root.addEventListener('click', function (e) {
      if (e.target.id === 'crozzoMpGoCostos' && typeof global.navigateTo === 'function') {
        global.navigateTo('costos-matriz');
        setTimeout(function () {
          var tab = document.querySelector('[data-matriz-tab="costeo-mp"]');
          if (tab) tab.click();
        }, 200);
        return;
      }
      var chip = e.target.closest('[data-mp-cat]');
      if (chip) {
        ui.cat = chip.getAttribute('data-mp-cat') || '';
        root.querySelectorAll('.crozzo-mp-chip, .crozzo-mod-chip').forEach(function (btn) {
          btn.classList.toggle('is-active', btn === chip);
        });
        refreshTable(root);
        return;
      }
      if (e.target.id === 'crozzoMpToggleNew') {
        var f = root.querySelector('#crozzoMpNewForm');
        if (f) f.style.display = f.style.display === 'none' ? 'grid' : 'none';
      }
      if (e.target.id === 'crozzoMpCancelNew') {
        var form = root.querySelector('#crozzoMpNewForm');
        if (form) form.style.display = 'none';
      }
      if (e.target.id === 'crozzoMpSaveNew') {
        var nombre = (root.querySelector('#crozzoMpNewNombre') || {}).value || '';
        nombre = nombre.trim();
        if (!nombre) {
          toast('Escriba el nombre', 'warning');
          return;
        }
        var provRaw = (root.querySelector('#crozzoMpNewProv') || {}).value || '';
        var item = {
          id: C.slugId(nombre),
          nombre: nombre,
          categoria: (root.querySelector('#crozzoMpNewCat') || {}).value || 'OTRO',
          proveedores: C.parseProveedores ? C.parseProveedores(provRaw) : provRaw.split(','),
        };
        C.upsertCatalog(item);
        toast('«' + item.nombre + '» creada. Defina peso y precio en Costeo.', 'success');
        refreshTable(root);
        var nf = root.querySelector('#crozzoMpNewForm');
        if (nf) nf.style.display = 'none';
      }
      var del = e.target.closest('.crozzo-mp-del');
      if (del && C.remove(del.getAttribute('data-mp-id'))) {
        refreshTable(root);
        toast('Eliminada del catálogo', 'success');
      }
    });

    root.addEventListener(
      'change',
      function (e) {
        var inp = e.target.closest('[data-mp-field]');
        if (!inp) return;
        var tr = inp.closest('tr[data-mp-id]');
        if (!tr) return;
        var item = getItemFromRow(tr);
        if (!item) return;
        if (inp.getAttribute('data-mp-field') === 'nombre') {
          var prev = C.get(item.id);
          if (prev && prev.nombre !== item.nombre) {
            var dupe = C.getByNombre(item.nombre);
            if (dupe && dupe.id !== item.id) {
              toast('Ya existe otra materia prima con ese nombre', 'error');
              refreshTable(root);
              return;
            }
          }
        }
        C.upsertCatalog(item);
        toast('Catálogo actualizado (nombre sincronizado con Costeo y recetas)', 'success');
      },
      true
    );
  }

  global.CrozzoMatrizMp = {
    buildCatalog: buildCatalog,
    renderPanel: renderPanel,
    init: init,
    CATEGORIAS: CATEGORIAS,
  };
})(typeof window !== 'undefined' ? window : globalThis);



/* --- CrozzoCosteoMp.js --- */

/**
 * Crozzo POS — Costeo de materias primas (unidad, peso, precio total, $/ml|$/g|$/u)
 * Se actualiza desde recepción de facturas; alerta si la variación es desproporcionada.
 */
(function (global) {
  'use strict';

  var UND_OPTS = ['GR', 'MG', 'KG', 'ML', 'UNI', 'UND', 'TARRO', 'PAQ', 'CAJA', 'MT', 'ROLLO', 'PAR'];

  var ui = { q: '' };

  function cat() {
    return global.CrozzoCatalogoMp;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function toast(m, t) {
    try {
      if (typeof global.showToast === 'function') global.showToast(m, t || 'info');
    } catch (_) {}
  }

  function engine() {
    return global.CrozzoCostosEngine || null;
  }

  function fmtUnit(n, und) {
    var e = engine();
    if (e && e.formatoPrecioPorUnd) return e.formatoPrecioPorUnd(n, und);
    return '$' + (Number(n) || 0).toFixed(4) + '/' + und;
  }

  function hintFormula(it) {
    var e = engine();
    if (!e || !e.hintCalculoPrecio) return '';
    return e.hintCalculoPrecio(it.precioTotal, it.peso, it.und);
  }

  function refColLabel(und) {
    var e = engine();
    if (e && e.undRefLabel) {
      var r = e.undRefLabel(und);
      if (r === 'ml') return 'Ref. (ml)';
      if (r === 'g') return 'Ref. (g)';
      if (r === 'kg') return 'Ref. (kg)';
      return 'Ref. (' + r + ')';
    }
    return 'Peso ref.';
  }

  function injectStyles() {
    if (document.getElementById('crozzo-costeo-mp-css')) return;
    var el = document.createElement('style');
    el.id = 'crozzo-costeo-mp-css';
    el.textContent =
      '.crozzo-costeo-nombre{font-weight:600;color:var(--text-primary)}' +
      '.crozzo-costeo-inp{width:100%;min-width:0;padding:6px 8px;border-radius:6px;border:1px solid transparent;background:transparent;color:inherit;font-size:.8rem;font-variant-numeric:tabular-nums}' +
      '.crozzo-costeo-inp:hover{border-color:var(--border)}' +
      '.crozzo-costeo-inp:focus{border-color:var(--accent);background:var(--bg-card);outline:none}' +
      '.crozzo-costeo-val{font-weight:600;color:var(--accent);font-variant-numeric:tabular-nums}' +
      '.crozzo-costeo-hint{display:block;font-size:10px;opacity:.65;margin-top:3px;font-weight:400;color:var(--text-secondary)}' +
      '.crozzo-costeo-badge{display:inline-block;font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px;background:rgba(76,175,80,.15);color:#4caf50;margin-left:6px;vertical-align:middle}';
    document.head.appendChild(el);
  }

  function buildRows() {
    var C = cat();
    return C && C.list ? C.list() : [];
  }

  function filterItems(items) {
    var q = ui.q.toLowerCase().trim();
    if (!q) return items;
    return items.filter(function (it) {
      return String(it.nombre).toLowerCase().indexOf(q) >= 0;
    });
  }

  function recepcionBadge(it) {
    if (!it.ultimaRecepcionAt) return '';
    var d = String(it.ultimaRecepcionAt).slice(0, 10);
    return '<span class="crozzo-costeo-badge" title="Actualizado por recepción ' + esc(d) + '">Recepción</span>';
  }

  function renderRows(items) {
    if (!items.length) {
      return '<tr><td colspan="5" style="text-align:center;padding:24px;opacity:.7">Sin insumos en catálogo. Créelos en Catálogo · materias primas.</td></tr>';
    }
    return items
      .map(function (it) {
        var hint = hintFormula(it);
        return (
          '<tr data-costeo-id="' +
          esc(it.id) +
          '" data-costeo-und="' +
          esc(it.und) +
          '">' +
          '<td class="crozzo-costeo-nombre" title="Editar nombre en Catálogo">' +
          esc(it.nombre) +
          recepcionBadge(it) +
          '</td>' +
          '<td><select class="crozzo-costeo-inp" data-costeo-field="und">' +
          UND_OPTS.map(function (u) {
            return '<option value="' + u + '"' + (it.und === u ? ' selected' : '') + '>' + u + '</option>';
          }).join('') +
          '</select></td>' +
          '<td style="text-align:right"><input class="crozzo-costeo-inp" data-costeo-field="peso" type="number" min="0" step="any" value="' +
          esc(it.peso) +
          '" style="text-align:right" title="' +
          esc(refColLabel(it.und)) +
          '"></td>' +
          '<td style="text-align:right"><input class="crozzo-costeo-inp" data-costeo-field="precioTotal" type="number" min="0" step="any" value="' +
          esc(it.precioTotal) +
          '" style="text-align:right"></td>' +
          '<td class="crozzo-costeo-val" data-costeo-unit-display title="' +
          esc(hint) +
          '">' +
          esc(fmtUnit(it.precioUnit, it.und)) +
          (hint ? '<span class="crozzo-costeo-hint">' + esc(hint) + '</span>' : '') +
          '</td></tr>'
        );
      })
      .join('');
  }

  function renderPanel(opts) {
    opts = opts || {};
    var embedded = !!opts.embedded;
    injectStyles();
    var all = buildRows();
    var filtered = filterItems(all);
    var chrome = embedded
      ? ''
      : '<nav class="crozzo-mod-nav crozzo-mod-nav--links">' +
        '<button type="button" class="btn btn-outline btn-sm" id="crozzoCosteoGoCotizaciones">Cotizaciones</button>' +
        '<button type="button" class="btn btn-outline btn-sm" id="crozzoCosteoGoRecepcion">Entrada factura</button>' +
        '<button type="button" class="btn btn-outline btn-sm" id="crozzoCosteoGoCatalogo">Catálogo MP</button></nav>';
    return (
      '<div class="crozzo-mod-page crozzo-costeo-root' +
      (embedded ? ' crozzo-mod-embedded' : '') +
      '">' +
      chrome +
      '<div class="crozzo-mod-toolbar-bar"><div class="crozzo-mod-toolbar">' +
      '<input type="search" id="crozzoCosteoSearch" placeholder="Buscar por nombre…" value="' +
      esc(ui.q) +
      '" autocomplete="off">' +
      '<span class="form-hint">' +
      filtered.length +
      ' / ' +
      all.length +
      '</span></div></div>' +
      '<div class="card crozzo-mod-table-card">' +
      '<div class="crozzo-mod-table-scroll"><table class="crozzo-mod-table crozzo-costeo-table"><thead><tr>' +
      '<th>Materia prima</th><th>U. medida</th><th>Ref.</th><th>Precio total lote</th><th>Precio unitario</th>' +
      '</tr></thead><tbody id="crozzoCosteoTbody">' +
      renderRows(filtered) +
      '</tbody></table></div></div></div>'
    );
  }

  function getCosteoFromRow(tr) {
    var C = cat();
    if (!C) return null;
    var id = tr.getAttribute('data-costeo-id');
    var base = C.get(id);
    if (!base) return null;
    var row = { mpId: id, und: base.und, peso: base.peso, precioTotal: base.precioTotal };
    tr.querySelectorAll('[data-costeo-field]').forEach(function (inp) {
      var f = inp.getAttribute('data-costeo-field');
      if (f === 'peso' || f === 'precioTotal') row[f] = Number(inp.value);
      else row[f] = inp.value;
    });
    return row;
  }

  function updateRowDisplay(tr, merged) {
    if (!tr || !merged) return;
    var unitCell = tr.querySelector('[data-costeo-unit-display]');
    var hint = hintFormula(merged);
    if (unitCell) {
      unitCell.innerHTML =
        esc(fmtUnit(merged.precioUnit, merged.und)) +
        (hint ? '<span class="crozzo-costeo-hint">' + esc(hint) + '</span>' : '');
      unitCell.setAttribute('title', hint);
    }
    tr.setAttribute('data-costeo-und', merged.und);
    var nombreCell = tr.querySelector('.crozzo-costeo-nombre');
    if (nombreCell && merged.ultimaRecepcionAt) {
      var badge = nombreCell.querySelector('.crozzo-costeo-badge');
      if (!badge) {
        nombreCell.insertAdjacentHTML('beforeend', recepcionBadge(merged));
      }
    }
  }

  function refreshTable(root) {
    var tbody = root.querySelector('#crozzoCosteoTbody');
    if (!tbody) return;
    var filtered = filterItems(buildRows());
    tbody.innerHTML = renderRows(filtered);
    var hint = root.querySelector('.crozzo-mod-toolbar .form-hint');
    if (hint) {
      var all = buildRows();
      hint.textContent = filtered.length + ' / ' + all.length;
    }
  }

  function init(root) {
    if (!root) return;
    var C = cat();
    if (!C) return;

    var searchTimer;
    var search = root.querySelector('#crozzoCosteoSearch');
    if (search) {
      search.addEventListener('input', function () {
        ui.q = search.value;
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () {
          refreshTable(root);
        }, 150);
      });
    }

    if (!root._costeoBound) {
      root._costeoBound = true;
      document.addEventListener('crozzo-catalogo-mp:changed', function (ev) {
        if (!root.isConnected) return;
        refreshTable(root);
        var d = ev && ev.detail;
        if (d && (d.tipo === 'recepcion-precios' || d.tipo === 'recepcion-precio')) {
          toast('Costeo actualizado desde recepción de factura', 'success');
        }
      });
    }

    root.addEventListener('click', function (e) {
      if (e.target.id === 'crozzoCosteoGoCatalogo' && typeof global.navigateTo === 'function') {
        global.navigateTo('catalogo-mp');
      }
      if (e.target.id === 'crozzoCosteoGoCotizaciones' && typeof global.navigateTo === 'function') {
        global.navigateTo('compras-cotizaciones');
      }
      if (e.target.id === 'crozzoCosteoGoRecepcion' && typeof global.navigateTo === 'function') {
        global.navigateTo('compras-recepcion');
      }
    });

    root.addEventListener(
      'change',
      function (e) {
        var inp = e.target.closest('[data-costeo-field]');
        if (!inp) return;
        var tr = inp.closest('tr[data-costeo-id]');
        if (!tr) return;
        var patch = getCosteoFromRow(tr);
        if (!patch) return;
        var merged = C.upsertCosteo(patch);
        if (!merged) {
          var prev = C.get(patch.mpId);
          if (prev) refreshTable(root);
          return;
        }
        updateRowDisplay(tr, merged);
        toast('Costeo actualizado', 'success');
      },
      true
    );
  }

  global.CrozzoCosteoMp = {
    renderPanel: renderPanel,
    init: init,
  };
})(typeof window !== 'undefined' ? window : globalThis);



/* --- CrozzoCatalogoHub.js --- */

/**
 * Crozzo POS — Catálogo: platos de venta + materias primas (fuente única de MP)
 */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function injectStyles() {
    if (document.getElementById('crozzo-catalogo-hub-css')) return;
    var el = document.createElement('style');
    el.id = 'crozzo-catalogo-hub-css';
    el.textContent =
      '.crozzo-cat-hub{max-width:1200px;margin:0 auto}' +
      '.crozzo-cat-hero{padding:16px 0 12px;border-bottom:1px solid var(--border);margin-bottom:16px}' +
      '.crozzo-cat-hero h1{font-size:1.3rem;margin:0 0 6px}' +
      '.crozzo-cat-hero p{margin:0;opacity:.8;font-size:.88rem;max-width:720px;line-height:1.5}' +
      '.crozzo-cat-tabs{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}' +
      '.crozzo-cat-tabs a,.crozzo-cat-tabs button{padding:10px 16px;border-radius:10px;border:1px solid var(--border);background:var(--bg-card);font-size:13px;font-weight:600;cursor:pointer;text-decoration:none;color:inherit;font-family:inherit}' +
      '.crozzo-cat-tabs .is-active{background:var(--accent);color:#111;border-color:var(--accent)}' +
      '.crozzo-cat-note{padding:12px 14px;border-radius:10px;background:rgba(var(--accent-rgb,201,169,98),.08);border:1px solid rgba(var(--accent-rgb,201,169,98),.2);font-size:.82rem;line-height:1.55;margin-bottom:14px}';
    document.head.appendChild(el);
  }

  function render(active) {
    injectStyles();
    active = active || 'mp';
    return (
      '<div class="crozzo-mod-page crozzo-cat-hub">' +
      '<p class="crozzo-mod-lead">Platos de venta y materias primas. Aquí define <strong>nombre y proveedores</strong>; en Costos define <strong>peso y precios</strong> para costear gramos.</p>' +
      '<nav class="crozzo-mod-nav crozzo-cat-tabs" aria-label="Secciones catálogo">' +
      '<a href="#" class="crozzo-mod-nav__item' +
      (active === 'platos' ? ' is-active' : '') +
      '" data-cat-go="productos">Platos de venta</a>' +
      '<button type="button" class="crozzo-mod-nav__item' +
      (active === 'mp' ? ' is-active' : '') +
      '" data-cat-go="catalogo-mp">Materias primas</button></nav>' +
      (active === 'mp'
        ? '<p class="crozzo-mod-lead crozzo-cat-note"><strong>Materias primas:</strong> nombre y proveedor(es) para recetas, compras e inventario. El <em>nombre</em> se sincroniza con Costos. Unidad, peso y precio total se editan en <strong>Costos → Costeo materias primas</strong>.</p>' +
          (global.CrozzoMatrizMp && global.CrozzoMatrizMp.renderPanel
            ? global.CrozzoMatrizMp.renderPanel({ embedded: true })
            : '<p>Cargando catálogo…</p>')
        : '') +
      '</div>'
    );
  }

  function init(active) {
    var root = document.getElementById('mainContent');
    if (!root) return;
    root.querySelectorAll('[data-cat-go]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        var p = el.getAttribute('data-cat-go');
        if (p && typeof global.navigateTo === 'function') global.navigateTo(p);
      });
    });
    if (active !== 'mp') return;
    var C = global.CrozzoCatalogoMp;
    var boot = function () {
      var panel = root.querySelector('.crozzo-mp-root');
      if (panel && global.CrozzoMatrizMp && global.CrozzoMatrizMp.init) {
        global.CrozzoMatrizMp.init(panel);
      }
    };
    if (C && C.ensureReady) C.ensureReady(boot);
    else boot();
  }

  global.CrozzoCatalogoHub = {
    render: render,
    init: init,
  };
  global.renderCatalogoMp = function () {
    return render('mp');
  };
  global.initCatalogoMp = function () {
    init('mp');
  };
})(typeof window !== 'undefined' ? window : globalThis);



/* --- CrozzoSistemaCostos.js --- */

/**
 * Crozzo POS — Sistema de costos (Fase 1: flujos, conexiones, hub)
 * Matriz precios · Recetas · Inventario · Compras · Oficina · Cola planilla
 */
(function (global) {
  'use strict';

  var LS_FEED = 'crozzo_costos_feed_v1';
  var LS_MATRIZ = 'crozzo_costos_matriz_v1';
  var LS_RESUMEN = 'crozzo_costos_resumen_v1';
  var LS_DEMO_RECETA = 'crozzo_costos_demo_receta_v1';
  var LS_EVENT_LOG = 'crozzo_costos_event_log_v1';

  var FLOWS = {
    F1: {
      id: 'F1',
      key: 'matriz',
      title: 'Matriz de precios',
      subtitle: 'Necesidades del negocio → decisión socios/gerentes → vigencia POS',
      icon: '💰',
      roles: ['socio', 'gerente', 'admin'],
      status: 'conectado',
      navigate: 'costos-matriz',
      sources: [],
      targets: ['F2', 'POS'],
      tables: ['crozzo_matriz_precios', 'crozzo_matriz_precios_items', 'crozzo_matriz_programaciones'],
    },
    F2: {
      id: 'F2',
      key: 'recetas',
      title: 'Recetas y cortes',
      subtitle: 'Actualiza matriz y materia prima en proveedores',
      icon: '📋',
      roles: ['chef', 'gerente', 'jefe-compras'],
      status: 'conectado',
      navigate: 'compras-cortes',
      sources: ['Catalogo MP', 'Procesos'],
      targets: ['F1', 'F3', 'proveedores'],
      tables: ['receta_ingredientes', 'productos', 'materias_primas', 'cortes_recepcion'],
    },
    F3: {
      id: 'F3',
      key: 'inventario',
      title: 'Inventario continuo',
      subtitle: 'Inicial + entradas − salidas = teórico · conteo valida',
      icon: '📦',
      roles: ['gerente', 'chef', 'admin'],
      status: 'conectado',
      navigate: 'costos-inventario',
      sources: ['F2 procesos', 'F4 recepciones', 'POS ventas'],
      targets: ['F6', 'auditoria'],
      tables: ['crozzo_inventario_movimientos', 'crozzo_inventario_cierres', 'conteos_inventario'],
    },
    F4: {
      id: 'F4',
      key: 'compras-dash',
      title: 'Dashboard compras',
      subtitle: 'Facturas de entrada por categoría de proveedor',
      icon: '📊',
      roles: ['jefe-compras', 'gerente', 'socio'],
      status: 'conectado',
      navigate: 'compras-dashboard',
      sources: ['recepciones', 'facturas'],
      targets: ['F3', 'F5', 'F6'],
      tables: ['recepciones', 'facturas', 'proveedores'],
    },
    F5: {
      id: 'F5',
      key: 'oficina',
      title: 'Oficina y pagos',
      subtitle: 'Efectivo · tarjeta · transferencia (pendiente / en proceso / pagada)',
      icon: '🏛️',
      roles: ['admin', 'gerente', 'jefe-compras'],
      status: 'conectado',
      navigate: 'compras-oficina',
      sources: ['F4 facturas'],
      targets: ['F6'],
      tables: ['facturas'],
    },
    F6: {
      id: 'F6',
      key: 'planilla-feed',
      title: 'Cola → Planilla',
      subtitle: 'Ventas, compras y egresos como propuestas; admin elige qué ingresar',
      icon: '🧮',
      roles: ['admin', 'contador', 'socio'],
      status: 'conectado',
      navigate: 'costos-planilla-feed',
      sources: ['F3', 'F4', 'F5', 'POS ventas'],
      targets: ['planilla-2026'],
      tables: ['crozzo_planilla_feed'],
    },
  };

  var CONNECTIONS = [
    { from: 'F2', to: 'F1', event: 'crozzo-costos:receta-actualizada', label: 'Receta/corte cambia → recalcular matriz' },
    { from: 'proveedores', to: 'F1', event: 'crozzo-costos:precio-mp-cambiado', label: 'Precio MP proveedor → matriz' },
    { from: 'F1', to: 'POS', event: 'crozzo-costos:precios-vigentes', label: 'Fecha programada → todos los POS' },
    { from: 'F4', to: 'F3', event: 'crozzo-costos:recepcion-registrada', label: 'Recepción → entrada inventario' },
    { from: 'F4', to: 'F5', event: 'crozzo-costos:recepcion-registrada', label: 'Recepción → factura oficina' },
    { from: 'F2', to: 'F3', event: 'crozzo-costos:proceso-cerrado', label: 'Proceso cerrado → entrada transformada' },
    { from: 'POS', to: 'F3', event: 'crozzo-costos:venta-registrada', label: 'Venta → salida inventario' },
    { from: 'POS', to: 'F6', event: 'crozzo-costos:feed-planilla', label: 'Venta diaria → cola planilla' },
    { from: 'F5', to: 'F6', event: 'crozzo-costos:factura-pagada', label: 'Pago proveedor → cola planilla' },
    { from: 'F3', to: 'F6', event: 'crozzo-costos:inventario-cerrado', label: 'Cierre inventario → cola/auditoría' },
  ];

  var hub = { view: 'map', flowKey: null, bound: false, seed: null, seedLoading: false, recetaSlug: null };

  function engine() {
    return global.CrozzoCostosEngine || null;
  }

  function engFmt(n) {
    var e = engine();
    return e ? e.fmtCop(n) : String(n);
  }

  function engPct(n) {
    var e = engine();
    return e ? e.fmtPct(n) : String(n);
  }

  function loadSeed(cb) {
    if (hub.seed && hub.seed.version >= 4) {
      if (cb) cb(hub.seed);
      return Promise.resolve(hub.seed);
    }
    if (hub.seedLoading) {
      return new Promise(function (resolve) {
        var t = setInterval(function () {
          if (hub.seed && hub.seed.version >= 4) {
            clearInterval(t);
            resolve(hub.seed);
            if (cb) cb(hub.seed);
          }
        }, 80);
      });
    }
    hub.seedLoading = true;
    var C = global.CrozzoCatalogoMp;
    if (!C || !C.ensureReady) {
      hub.seed = { version: 4, precios: {}, resumen: [], demoRecipe: { lineas: [] }, stats: {} };
      hub.seedLoading = false;
      if (cb) cb(hub.seed);
      return Promise.resolve(hub.seed);
    }
    return C.ensureReady()
      .then(function () {
        hub.seed = C.buildSeedForCostos();
        hub.seedLoading = false;
        if (cb) cb(hub.seed);
        return hub.seed;
      })
      .catch(function () {
        hub.seed = { version: 4, precios: {}, resumen: [], demoRecipe: { lineas: [] }, stats: {} };
        hub.seedLoading = false;
        if (cb) cb(hub.seed);
        return hub.seed;
      });
  }

  function slugProducto(nombre) {
    return String(nombre || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '_')
      .slice(0, 80);
  }

  function saveResumenEdit(slug, patch) {
    var C = global.CrozzoCatalogoMp;
    if (C && C.updateMenuPlato) C.updateMenuPlato(slug, patch);
  }

  function loadRecetaLineas(slug, seed) {
    var C = global.CrozzoCatalogoMp;
    if (C && C.getRecetaPlato && slug) {
      var r = C.getRecetaPlato(slug);
      if (r && Array.isArray(r.lineas)) return r.lineas.slice();
      if (C.ensureRecetaForMenu) {
        var row = mergeResumenList(seed).find(function (x) {
          return x.slug === slug;
        });
        if (row) C.ensureRecetaForMenu(slug, row.producto);
      }
    }
    return loadDemoRecetaLineas(seed);
  }

  function getActiveRecetaSlug(seed) {
    if (hub.recetaSlug) return hub.recetaSlug;
    if (seed && seed.demoRecipe && seed.demoRecipe.slug) return seed.demoRecipe.slug;
    var list = mergeResumenList(seed || hub.seed || { resumen: [] });
    return list[0] ? list[0].slug : '';
  }

  function findPosProductForReceta(receta) {
    if (!receta) return null;
    var prods = typeof global.products !== 'undefined' && Array.isArray(global.products) ? global.products : [];
    var slug = String(receta.slug || '').trim();
    var nombre = String(receta.producto || '').trim().toLowerCase();
    for (var i = 0; i < prods.length; i++) {
      var p = prods[i];
      if (slug && String(p.sku || '').toUpperCase() === slug.toUpperCase()) return p;
      if (nombre && String(p.nombre || '').trim().toLowerCase() === nombre) return p;
    }
    for (var j = 0; j < prods.length; j++) {
      var q = prods[j];
      if (nombre && String(q.nombre || '').trim().toLowerCase().indexOf(nombre) >= 0) return q;
    }
    return null;
  }

  function posAreaLabelForProduct(prod) {
    if (!prod || !prod.areaComanda) return '';
    if (typeof global.getComandasConfig === 'function') {
      var areas = global.getComandasConfig().areas || [];
      var hit = areas.find(function (a) {
        return a.id === prod.areaComanda;
      });
      return hit ? hit.nombre || hit.id : prod.areaComanda;
    }
    return prod.areaComanda;
  }

  function renderMpOptionsHtml(selectedId) {
    var C = global.CrozzoCatalogoMp;
    var list = C && C.list ? C.list() : [];
    var html = '<option value="">— Materia prima —</option>';
    list.forEach(function (mp) {
      html +=
        '<option value="' +
        esc(mp.id) +
        '"' +
        (mp.id === selectedId ? ' selected' : '') +
        '>' +
        esc(mp.nombre) +
        '</option>';
    });
    return html;
  }

  function refreshRecetaPlatoPanel(root, seed) {
    if (!root) return;
    var panel = root.querySelector('[data-matriz-panel="demo"]');
    if (!panel) return;
    panel.innerHTML = renderDemoRecetaHtml(seed);
    initMatrizGerenciaPanel(root, seed);
  }

  function loadDemoRecetaLineas(seed) {
    var rv = reservorio();
    if (rv && rv.migrateLegacy) {
      var rd = rv.migrateLegacy().recetaDemo;
      if (rd && Array.isArray(rd.lineas) && rd.lineas.length) return rd.lineas.slice();
    }
    return seed && seed.demoRecipe && seed.demoRecipe.lineas ? seed.demoRecipe.lineas.slice() : [];
  }

  function saveDemoRecetaLineas(lineas, meta) {
    meta = meta || {};
    var C = global.CrozzoCatalogoMp;
    if (C && C.upsertRecetaPlato) {
      C.upsertRecetaPlato({
        slug: meta.slug || getActiveRecetaSlug(hub.seed),
        producto: meta.producto || meta.nombre,
        lineas: lineas,
        opts: meta.opts,
      });
    } else if (C && C.updateRecetaDemoLineas) {
      C.updateRecetaDemoLineas(lineas, meta);
    }
  }

  function buildPreciosStore() {
    var C = global.CrozzoCatalogoMp;
    if (C && C.buildPreciosStore) return C.buildPreciosStore();
    return { precios: {}, subRecetas: {} };
  }

  function mergeResumenList(seed) {
    return (seed.resumen || [])
      .filter(function (row) {
        var n = String(row.producto || '').trim();
        return n;
      })
      .map(function (row) {
        return {
          slug: row.slug || slugProducto(row.producto),
          producto: row.producto,
          costoMp: Number(row.costoMp),
          precioVenta: Number(row.precioVenta),
        };
      });
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function toast(msg, type) {
    try {
      if (typeof global.showToast === 'function') global.showToast(msg, type || 'info');
    } catch (_) {}
  }

  function safeJsonParse(raw, fb) {
    if (raw == null || (typeof raw === 'string' && !String(raw).trim())) return fb;
    try {
      var v = JSON.parse(raw);
      return v == null ? fb : v;
    } catch (_) {
      return fb;
    }
  }

  function reservorio() {
    return global.CrozzoReservorio || null;
  }

  function loadFeed() {
    var rv = reservorio();
    if (rv) {
      var fromRv = rv.listFeed(500);
      return Array.isArray(fromRv) ? fromRv : [];
    }
    try {
      var feed = safeJsonParse(localStorage.getItem(LS_FEED), []);
      return Array.isArray(feed) ? feed : [];
    } catch (_) {
      return [];
    }
  }

  function saveFeed(list) {
    var rv = reservorio();
    if (rv && typeof rv.migrateLegacy === 'function' && typeof rv.save === 'function') {
      try {
        var st = rv.migrateLegacy();
        st.planillaFeed = Array.isArray(list) ? list.slice(0, 500) : [];
        rv.save(st);
        return;
      } catch (_) {}
    }
    try {
      localStorage.setItem(LS_FEED, JSON.stringify(list.slice(0, 500)));
    } catch (_) {}
  }

  function loadEventLog() {
    try {
      var log = safeJsonParse(localStorage.getItem(LS_EVENT_LOG), []);
      return Array.isArray(log) ? log : [];
    } catch (_) {
      return [];
    }
  }

  function appendEventLog(entry) {
    try {
      var log = loadEventLog();
      if (!Array.isArray(log)) log = [];
      log.unshift(Object.assign({ ts: new Date().toISOString() }, entry));
      localStorage.setItem(LS_EVENT_LOG, JSON.stringify(log.slice(0, 200)));
    } catch (_) {}
  }

  function businessId() {
    try {
      if (typeof global.getBusinessId === 'function') return global.getBusinessId();
      if (global.config && global.config.businessId) return global.config.businessId;
    } catch (_) {}
    return 'default';
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

  function sbHeaders() {
    try {
      var raw = localStorage.getItem('crozzo_supabase_config');
      if (!raw) return null;
      var j = JSON.parse(raw);
      var k = String(j.key || j.anonKey || '').trim();
      if (!j.url || k.length < 20) return null;
      return {
        apikey: k,
        Authorization: 'Bearer ' + k,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      };
    } catch (_) {
      return null;
    }
  }

  function sbRest(table, query, opts) {
    opts = opts || {};
    var h = sbHeaders();
    if (!h) return Promise.resolve({ ok: false, reason: 'no-cloud' });
    var base = String(JSON.parse(localStorage.getItem('crozzo_supabase_config')).url).replace(/\/$/, '');
    var url = base + '/rest/v1/' + table + (query ? '?' + query : '');
    return fetch(url, {
      method: opts.method || 'GET',
      headers: Object.assign({}, h, opts.prefer ? { Prefer: opts.prefer } : {}),
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }).then(function (res) {
      if (!res.ok) return res.text().then(function (t) { return { ok: false, status: res.status, error: t }; });
      if (res.status === 204) return { ok: true, data: null };
      return res.json().then(function (data) { return { ok: true, data: data }; });
    }).catch(function (e) { return { ok: false, error: String(e) }; });
  }

  /** Bus de eventos del sistema de costos */
  function emit(eventName, detail) {
    detail = detail || {};
    try {
      appendEventLog({ event: eventName, detail: detail });
    } catch (_) {}
    try {
      document.dispatchEvent(new CustomEvent(eventName, { detail: detail, bubbles: true }));
    } catch (_) {}
    if (eventName === 'crozzo-costos:feed-planilla' || (detail && detail.enqueuePlanilla)) {
      if (detail && detail.enqueuePlanilla === false) return;
      enqueuePlanillaFeed(detail);
    }
  }

  function on(eventName, handler) {
    document.addEventListener(eventName, handler);
    return function () { document.removeEventListener(eventName, handler); };
  }

  function enqueuePlanillaFeed(detail) {
    detail = detail || {};
    if (reservorio() && detail.referencia_id) {
      var exists = loadFeed().some(function (f) {
        return f.referencia_id === detail.referencia_id && f.origen === detail.origen;
      });
      if (exists) return exists;
    }
    var item = {
      id: 'feed_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      business_id: businessId(),
      origen: detail.origen || 'manual',
      fecha: detail.fecha || new Date().toISOString().slice(0, 10),
      concepto: detail.concepto || 'Movimiento costos',
      monto: Number(detail.monto) || 0,
      tipo_movimiento: detail.tipo_movimiento || 'egreso',
      referencia_tipo: detail.referencia_tipo || null,
      referencia_id: detail.referencia_id || null,
      payload: detail.payload || {},
      estado: 'pendiente',
      created_at: new Date().toISOString(),
    };
    var list = loadFeed();
    if (!Array.isArray(list)) list = [];
    list.unshift(item);
    saveFeed(list);
    if (cloudReady()) {
      sbRest('crozzo_planilla_feed', '', {
        method: 'POST',
        body: Object.assign({}, item, { payload: item.payload }),
      }).catch(function () {});
    }
    return item;
  }

  function registerDefaultListeners() {
    if (hub._listenersRegistered) return;
    hub._listenersRegistered = true;
    on('crozzo-costos:receta-actualizada', function (ev) {
      var e = engine();
      var d = ev.detail || {};
      if (e && d.lineas) {
        var calc = e.calcularReceta(d.lineas, d.opts || {});
        emit('crozzo-costos:matriz-recalculada', { recipeId: d.recipeId, calc: calc, source: 'receta' });
      }
      console.info('[costos] receta → matriz', ev.detail);
    });
    on('crozzo-costos:precio-mp-cambiado', function (ev) {
      var e = engine();
      if (!e || !ev.detail) return;
      var d = ev.detail;
      if (d.producto && d.precioTotal != null && d.peso != null) {
        var unit = e.precioUnitarioMp(d.precioTotal, d.peso);
        emit('crozzo-costos:matriz-recalculada', { producto: d.producto, precioUnit: unit, source: 'mp' });
      }
    });
    on('crozzo-costos:recepcion-registrada', function (ev) {
      var d = ev.detail || {};
      var n = d.costeoActualizado && d.costeoActualizado.length;
      if (n) {
        toast(n + ' materia(s) prima actualizada(s) en costeo desde recepción', 'success');
      }
      console.info('[costos] recepción → inventario + costeo + oficina', ev.detail);
    });
    on('crozzo-costos:venta-registrada', function (ev) {
      if (reservorio()) return;
      var d = ev.detail || {};
      emit('crozzo-costos:feed-planilla', {
        origen: 'ventas',
        concepto: d.concepto || 'Ventas del día',
        monto: d.monto,
        tipo_movimiento: 'ingreso',
        referencia_tipo: 'venta',
        referencia_id: d.saleId,
        payload: d,
        enqueuePlanilla: true,
      });
    });
  }

  function injectStyles() {
    if (document.getElementById('crozzo-costos-styles')) return;
    var el = document.createElement('style');
    el.id = 'crozzo-costos-styles';
    el.textContent =
      '.crozzo-costos-hub{max-width:1200px;margin:0 auto}' +
      '.crozzo-costos-hero{padding:20px 0 16px;border-bottom:1px solid var(--border);margin-bottom:20px}' +
      '.crozzo-costos-hero h1{font-size:1.35rem;margin:0 0 6px;font-weight:700}' +
      '.crozzo-costos-hero p{margin:0;opacity:.8;font-size:.9rem;max-width:720px}' +
      '.crozzo-costos-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;margin-bottom:24px}' +
      '.crozzo-costos-card{border:1px solid var(--border);border-radius:14px;padding:16px;background:var(--bg-card);display:flex;flex-direction:column;gap:10px;transition:border-color .2s,box-shadow .2s}' +
      '.crozzo-costos-card:hover{border-color:var(--accent);box-shadow:var(--elevation-2)}' +
      '.crozzo-costos-card__head{display:flex;align-items:flex-start;gap:10px}' +
      '.crozzo-costos-card__icon{font-size:1.6rem;line-height:1}' +
      '.crozzo-costos-card__title{font-weight:700;font-size:.95rem;margin:0}' +
      '.crozzo-costos-card__sub{font-size:.78rem;opacity:.75;margin:4px 0 0;line-height:1.35}' +
      '.crozzo-costos-badge{display:inline-block;font-size:10px;font-weight:700;padding:3px 8px;border-radius:99px;text-transform:uppercase;letter-spacing:.04em}' +
      '.crozzo-costos-badge--ok{background:rgba(16,185,129,.15);color:#10b981}' +
      '.crozzo-costos-badge--wip{background:rgba(245,158,11,.15);color:#f59e0b}' +
      '.crozzo-costos-badge--local{background:rgba(100,210,255,.12);color:var(--info)}' +
      '.crozzo-costos-links{display:flex;flex-wrap:wrap;gap:8px;margin-top:auto}' +
      '.crozzo-costos-map{margin:20px 0;padding:16px;border:1px dashed var(--border);border-radius:12px;background:rgba(var(--accent-rgb,201,169,98),.04);font-size:.82rem;line-height:1.6}' +
      '.crozzo-costos-conn{margin:16px 0}' +
      '.crozzo-costos-conn h3{font-size:.85rem;margin:0 0 10px;text-transform:uppercase;letter-spacing:.06em;opacity:.7}' +
      '.crozzo-costos-conn-row{display:grid;grid-template-columns:72px 1fr 72px;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)}' +
      '.crozzo-costos-conn-row:last-child{border-bottom:none}' +
      '.crozzo-costos-conn-ev{font-family:var(--font-sans);font-size:.72rem;opacity:.65}' +
      '.crozzo-costos-tabs{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}' +
      '.crozzo-costos-tabs button{padding:8px 14px;border-radius:8px;border:1px solid var(--border);background:var(--bg-card);cursor:pointer;font-size:13px}' +
      '.crozzo-costos-tabs button.active{background:var(--accent);color:#111;border-color:var(--accent)}' +
      '.crozzo-costos-feed-table{width:100%;border-collapse:collapse;font-size:.82rem}' +
      '.crozzo-costos-feed-table th,.crozzo-costos-feed-table td{padding:8px 10px;border-bottom:1px solid var(--border);text-align:left}' +
      '.crozzo-costos-feed-table th{font-size:.72rem;text-transform:uppercase;opacity:.7}' +
      '.crozzo-costos-formula{background:var(--bg-secondary);border-radius:10px;padding:14px;font-family:var(--font-sans);font-size:.85rem;margin:12px 0}' +
      '.crozzo-costos-placeholder{padding:24px;text-align:center;opacity:.75;border:1px dashed var(--border);border-radius:12px}' +
      '.crozzo-costos-matriz-tabs{margin-bottom:16px}' +
      '.crozzo-costos-panel{display:none}.crozzo-costos-panel.active{display:block}' +
      '.crozzo-costos-kpi{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin:14px 0}' +
      '.crozzo-costos-kpi div{padding:10px 12px;border-radius:10px;background:var(--bg-secondary);font-size:.82rem}' +
      '.crozzo-costos-kpi strong{display:block;font-size:1rem;margin-top:4px}' +
      '.crozzo-costos-alert{padding:10px 12px;border-radius:8px;font-size:.82rem;margin:10px 0}' +
      '.crozzo-costos-alert--ok{background:rgba(16,185,129,.12);color:#10b981}' +
      '.crozzo-costos-alert--warn{background:rgba(245,158,11,.12);color:#f59e0b}' +
      '.crozzo-costos-scroll{max-height:360px;overflow:auto;border:1px solid var(--border);border-radius:10px}' +
      '.crozzo-costos-scroll--tall{max-height:min(62vh,560px)}' +
      '.crozzo-costos-editable{width:100%;min-width:72px;padding:6px 8px;border-radius:6px;border:1px solid var(--border);background:var(--bg-card);font-size:.82rem;text-align:right;font-variant-numeric:tabular-nums}' +
      '.crozzo-costos-editable:focus{border-color:var(--accent);outline:none}' +
      '.crozzo-costos-note{padding:10px 14px;border-radius:10px;background:rgba(var(--accent-rgb,201,169,98),.08);border:1px solid rgba(var(--accent-rgb,201,169,98),.2);font-size:.82rem;line-height:1.5;margin:0 0 12px}' +
      '.crozzo-costos-sql{width:100%;min-height:420px;font-family:ui-monospace,monospace;font-size:12px;padding:12px;border:1px solid var(--border);border-radius:10px;background:var(--bg-secondary);color:var(--text-primary);resize:vertical}';
    document.head.appendChild(el);
  }

  function statusBadge(status) {
    if (status === 'conectado') return '<span class="crozzo-costos-badge crozzo-costos-badge--ok">Conectado</span>';
    if (status === 'fase-1-local') return '<span class="crozzo-costos-badge crozzo-costos-badge--local">Cola local</span>';
    return '<span class="crozzo-costos-badge crozzo-costos-badge--wip">Próxima fase</span>';
  }

  function goPage(page) {
    if (typeof global.navigateTo === 'function') global.navigateTo(page);
    else toast('Abra: ' + page, 'info');
  }

  function renderFlowCard(f) {
    return (
      '<article class="crozzo-costos-card" data-flow="' + esc(f.key) + '">' +
      '<div class="crozzo-costos-card__head">' +
      '<span class="crozzo-costos-card__icon" aria-hidden="true">' + f.icon + '</span>' +
      '<div><h2 class="crozzo-costos-card__title">' + esc(f.id + ' · ' + f.title) + '</h2>' +
      '<p class="crozzo-costos-card__sub">' + esc(f.subtitle) + '</p></div></div>' +
      statusBadge(f.status) +
      '<div class="crozzo-costos-links">' +
      '<button type="button" class="btn btn-primary btn-sm crozzo-costos-open" data-page="' + esc(f.navigate) + '">Abrir módulo</button>' +
      '<button type="button" class="btn btn-outline btn-sm crozzo-costos-detail" data-flow="' + esc(f.key) + '">Detalle</button>' +
      '</div></article>'
    );
  }

    function renderMap() {
    var cards = Object.keys(FLOWS).map(function (k) { return renderFlowCard(FLOWS[k]); }).join('');
    var conns = CONNECTIONS.map(function (c) {
      return (
        '<div class="crozzo-costos-conn-row">' +
        '<strong>' + esc(c.from) + '</strong>' +
        '<span><strong>' + esc(c.label) + '</strong><br><span class="crozzo-costos-conn-ev">' + esc(c.event) + '</span></span>' +
        '<strong style="text-align:right">' + esc(c.to) + '</strong></div>'
      );
    }).join('');

    return (
      '<div class="crozzo-costos-hub">' +
      '<header class="crozzo-costos-hero">' +
      '<h1>Sistema de costos</h1>' +
      '<p>Seis flujos conectados: matriz de precios, recetas, inventario, compras, oficina y cola hacia planilla. ' +
      (cloudReady() ? 'Nube activa — listo para tablas SQL.' : 'Modo local — cola en este equipo hasta activar Cloud.') +
      '</p></header>' +
      '<div class="crozzo-costos-map" aria-label="Fórmulas">' +
      '<strong>Inventario (F3):</strong> Teórico = Inicial + Entradas − Salidas · Diferencia = Conteo − Teórico<br>' +
      '<strong>Costos:</strong> costo MP · precio venta · margen = (precio − costo) / precio</div>' +
      '<div class="crozzo-costos-grid">' + cards + '</div>' +
      '<section class="crozzo-costos-conn"><h3>Conexiones entre flujos</h3>' + conns + '</section></div>'
    );
  }

function renderFeedPanel() {
    var feed = loadFeed();
    var rv = reservorio();
    var rows = feed.length
      ? feed.slice(0, 50).map(function (it) {
          return (
            '<tr><td>' + esc(it.fecha) + '</td><td>' + esc(it.origen) + '</td><td>' + esc(it.concepto) + '</td>' +
            '<td>' + esc(it.tipo_movimiento) + '</td><td style="text-align:right">' + esc(Number(it.monto).toLocaleString('es-CO')) + '</td>' +
            ((it.estado === 'pendiente' && rv) ? '<button type="button" class="btn btn-primary btn-sm crozzo-feed-ok" data-id="' + esc(it.id) + '">Aceptar</button> <button type="button" class="btn btn-outline btn-sm crozzo-feed-no" data-id="' + esc(it.id) + '">Rechazar</button>' : esc(it.estado)) + '</td></tr>'
          );
        }).join('')
      : '<tr><td colspan="6" style="text-align:center;opacity:.7">Sin propuestas en cola. Las ventas y pagos las agregarán aquí.</td></tr>';

    return (
      '<div class="crozzo-costos-hub">' +
      '<header class="crozzo-costos-hero"><h1>F6 · Cola hacia Planilla</h1>' +
      '<p>Propuestas del reservorio. Acepte las que desee llevar a Planilla 2026.</p></header>' +
      '<div style="display:flex;gap:8px;margin-bottom:12px">' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoCostosFeedRefresh">Actualizar</button>' +
      '<button type="button" class="btn btn-primary btn-sm" id="crozzoCostosGoPlanilla">Ir a Planilla 2026</button></div>' +
      '<table class="crozzo-costos-feed-table"><thead><tr><th>Fecha</th><th>Origen</th><th>Concepto</th><th>Tipo</th><th>Monto</th><th>Estado</th></tr></thead><tbody>' +
      rows + '</tbody></table>' +
      '<button type="button" class="btn btn-outline" id="crozzoCostosBackMap" style="margin-top:16px">← Mapa de flujos</button></div>'
    );
  }


  function renderInventarioPanel() {
    var rv = reservorio();
    var C = global.CrozzoCatalogoMp;
    var catRows = '';
    if (C && C.list) {
      catRows = C.list()
        .slice(0, 40)
        .map(function (it) {
          return (
            '<tr><td>' +
            esc(it.nombre) +
            '</td><td>' +
            esc(it.categoria) +
            '</td><td style="text-align:right">' +
            esc(it.precioUnit) +
            ' /' +
            esc(it.und) +
            '</td><td style="text-align:right">' +
            esc(it.precioTotal) +
            '</td></tr>'
          );
        })
        .join('');
    }
    var movs = rv ? rv.listInventarioMovimientos(40) : [];
    var movRows = movs
      .map(function (m) {
        return (
          '<tr><td>' +
          esc(m.fecha) +
          '</td><td>' +
          esc(m.tipo) +
          '</td><td>' +
          esc(m.productoNombre || m.productoRefId) +
          '</td><td style="text-align:right">' +
          esc(m.cantidad) +
          ' ' +
          esc(m.unidad) +
          '</td></tr>'
        );
      })
      .join('');
    return (
      '<div class="crozzo-costos-hub">' +
      '<header class="crozzo-costos-hero"><h1>F3 · Inventario continuo</h1>' +
      '<p>Mismo catálogo de materias primas que la matriz. Los movimientos usan el nombre actual del producto.</p></header>' +
      '<h3 style="font-size:.9rem;margin:16px 0 8px">Catálogo MP (demo)</h3>' +
      '<div class="crozzo-costos-scroll" style="max-height:220px"><table class="crozzo-costos-feed-table"><thead><tr><th>Producto</th><th>Categoría</th><th>$/u</th><th>Precio ref.</th></tr></thead><tbody>' +
      (catRows || '<tr><td colspan="4">Sin catálogo — abra Matriz de precios primero</td></tr>') +
      '</tbody></table></div>' +
      '<h3 style="font-size:.9rem;margin:16px 0 8px">Movimientos recientes</h3>' +
      '<div class="crozzo-costos-scroll"><table class="crozzo-costos-feed-table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Producto</th><th>Cant.</th></tr></thead><tbody>' +
      (movRows || '<tr><td colspan="4">Sin movimientos</td></tr>') +
      '</tbody></table></div>' +
      '<button type="button" class="btn btn-outline" id="crozzoCostosBackMap" style="margin-top:16px">← Mapa</button></div>'
    );
  }

  function renderReservorioPanel() {
    var rv = reservorio();
    var dash = rv ? rv.renderDashboardHtml() : '<p>No se pudo cargar el reservorio.</p>';
    var healthLine = '';
    if (global.CrozzoReservorioOffline && global.CrozzoReservorioOffline.getHealth) {
      var h = global.CrozzoReservorioOffline.getHealth();
      var c = h.connectivity || {};
      healthLine =
        '<p class="form-hint" style="margin:8px 0 0">' +
        esc(c.icon || '💾') +
        ' ' +
        esc(c.label || 'Modo local') +
        (h.hasBackup ? ' · Copia de seguridad automática' : '') +
        (h.recoveredFromBackup ? ' · <span style="color:#f59e0b">Recuperado de backup</span>' : '') +
        '</p>';
    }
    return (
      '<div class="crozzo-costos-hub">' +
      '<header class="crozzo-costos-hero"><h1>Reservorio unificado</h1>' +
      '<p>Memoria interna conectada a todos los flujos. Sin internet todo queda aquí de forma segura.</p></header>' +
      healthLine +
      dash +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px">' +
      '<button type="button" class="btn btn-primary btn-sm" id="crozzoReservorioExport">Exportar backup JSON</button>' +
      '<button type="button" class="btn btn-outline" id="crozzoCostosGoSql">Editor SQL</button>' +
      '<button type="button" class="btn btn-outline" id="crozzoCostosBackMap">← Mapa</button></div></div>'
    );
  }

  function renderSqlPanel() {
    var sqlMod = global.CrozzoReservorioSql;
    var sql = sqlMod && sqlMod.getFullScript ? sqlMod.getFullScript() : '-- Módulo SQL no disponible';
    return (
      '<div class="crozzo-costos-hub">' +
      '<header class="crozzo-costos-hero"><h1>Editor SQL — Supabase</h1>' +
      '<p>Copie en SQL Editor al activar nube.</p></header>' +
      '<button type="button" class="btn btn-primary btn-sm" id="crozzoSqlCopy" style="margin-bottom:10px">Copiar todo</button>' +
      '<textarea class="crozzo-costos-sql" id="crozzoSqlEditor" readonly>' + esc(sql) + '</textarea>' +
      '<button type="button" class="btn btn-outline" id="crozzoCostosBackMap" style="margin-top:12px">← Mapa</button></div>'
    );
  }

  function renderResumenRowsHtml(seed) {
    var e = engine();
    var list = mergeResumenList(seed);
    if (!e || !list.length) {
      return '<tr><td colspan="7">Sin platos demo. Abra Matriz de precios para cargar el catálogo.</td></tr>';
    }
    return list
      .map(function (row) {
        var r = e.calcularResumen(row.costoMp, row.precioVenta);
        var ev = e.evaluarMargen(r, 0.30);
        var alertCls = ev.dentroObjetivo ? 'crozzo-costos-alert--ok' : 'crozzo-costos-alert--warn';
        var alertTxt = ev.dentroObjetivo ? 'OK' : 'Sobre 30%';
        return (
          '<tr data-resumen-slug="' +
          esc(row.slug) +
          '">' +
          '<td>' +
          esc(row.producto) +
          '</td>' +
          '<td style="text-align:right"><input type="number" class="crozzo-costos-editable" data-resumen-field="costoMp" min="0" step="1" value="' +
          esc(Math.round(row.costoMp)) +
          '" title="Costo materia prima (K7)"></td>' +
          '<td style="text-align:right"><input type="number" class="crozzo-costos-editable" data-resumen-field="precioVenta" min="0" step="100" value="' +
          esc(Math.round(row.precioVenta)) +
          '" title="Precio de venta en menú (decisión gerencia)"></td>' +
          '<td style="text-align:right" data-resumen-util>' +
          engFmt(r.utilidadBruta) +
          '</td>' +
          '<td style="text-align:right" data-resumen-pct-costo>' +
          engPct(r.pctCostoMp) +
          '</td>' +
          '<td style="text-align:right" data-resumen-pct-util>' +
          engPct(r.pctUtilidad) +
          '</td>' +
          '<td data-resumen-obj><span class="crozzo-costos-alert ' +
          alertCls +
          '" style="padding:2px 6px;margin:0">' +
          alertTxt +
          '</span></td></tr>'
        );
      })
      .join('');
  }

  function renderDemoRecetaHtml(seed) {
    var e = engine();
    var activeSlug = getActiveRecetaSlug(seed);
    var resumenList = mergeResumenList(seed);
    var row =
      resumenList.find(function (r) {
        return r.slug === activeSlug;
      }) || resumenList[0];
    var C = global.CrozzoCatalogoMp;
    var rec =
      C && C.getRecetaPlato && activeSlug ? C.getRecetaPlato(activeSlug) : null;
    if (!rec && row && C && C.ensureRecetaForMenu) {
      rec = C.ensureRecetaForMenu(activeSlug, row.producto);
    }
    var nombre = (rec && rec.producto) || (row && row.producto) || 'Plato';
    var lineas = loadRecetaLineas(activeSlug, seed);
    var store = buildPreciosStore();
    var lineasCalc = lineas.map(function (ln) {
      var costo =
        ln.costoXUnidad != null
          ? Number(ln.costoXUnidad)
          : e
            ? e.resolverCostoUnitario(
                (function () {
                  if (ln.mpId && C && C.get) {
                    var mpItem = C.get(ln.mpId);
                    if (mpItem && mpItem.nombre) return mpItem.nombre;
                  }
                  return ln.ingrediente;
                })(),
                store
              )
            : 0;
      return {
        ingrediente: ln.ingrediente,
        unidad: ln.unidad || ln.und || 'GR',
        cantidad: ln.cantidad,
        costoXUnidad: costo,
      };
    });
    var demoCalc = e ? e.calcularReceta(lineasCalc, (rec && rec.opts) || (seed.demoRecipe && seed.demoRecipe.opts) || {}) : null;
    var rawLineas = lineas;
    var demoRows = demoCalc
      ? demoCalc.lineas
          .map(function (ln, i) {
            var src = rawLineas[i] || {};
            var mpId = src.mpId || '';
            return (
              '<tr data-demo-line="' +
              i +
              '" data-mp-id="' +
              esc(mpId) +
              '"><td><select class="crozzo-costos-editable" data-receta-mp style="width:100%;text-align:left">' +
              renderMpOptionsHtml(mpId) +
              '</select></td><td data-receta-und>' +
              esc(ln.unidad) +
              '</td><td style="text-align:right"><input type="text" class="crozzo-costos-editable" data-demo-cant value="' +
              esc(ln.cantidad) +
              '" style="text-align:right" title="Cantidad"></td>' +
              '<td style="text-align:right" data-receta-unit>' +
              engFmt(ln.costoXUnidad) +
              '</td>' +
              '<td style="text-align:right" data-demo-total>' +
              engFmt(ln.total) +
              '</td>' +
              '<td style="text-align:right" data-demo-pct>' +
              engPct(ln.pctDelTotal) +
              '</td>' +
              '<td><button type="button" class="btn btn-outline btn-sm" data-receta-del title="Quitar">×</button></td></tr>'
            );
          })
          .join('')
      : '';

    var kpi = demoCalc
      ? (
        '<div class="crozzo-costos-kpi" id="crozzoDemoKpi">' +
        '<div>Total MP<strong data-kpi="mp">' +
        engFmt(demoCalc.totalMp) +
        '</strong></div>' +
        '<div>Al costo<strong data-kpi="k5">' +
        engFmt(demoCalc.totalAlCosto) +
        '</strong></div>' +
        '<div>Costo ref.<strong data-kpi="k7">' +
        engFmt(demoCalc.costoReferencia) +
        '</strong></div>' +
        '<div>Sugerido 30%<strong data-kpi="k10">' +
        engFmt(demoCalc.precioSugerido) +
        '</strong></div>' +
        '<div>Con impuesto<strong data-kpi="k11">' +
        engFmt(demoCalc.precioConImpuesto) +
        '</strong></div></div>'
      )
      : '<p class="crozzo-costos-placeholder">Motor de costos no cargado.</p>';

  var platoOpts = resumenList
    .map(function (r) {
      return (
        '<option value="' +
        esc(r.slug) +
        '"' +
        (r.slug === activeSlug ? ' selected' : '') +
        '>' +
        esc(r.producto) +
        '</option>'
      );
    })
    .join('');

    return (
      '<p class="crozzo-costos-note"><strong>Recetas por plato</strong>. Elija materia prima del catálogo y cantidades. Al guardar, pedidos internos usa la receta + área del producto en comandas. ' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoDemoGoCatalogo">Catálogo MP →</button></p>' +
      '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:12px">' +
      '<label style="font-size:.82rem">Plato / producto:</label>' +
      '<select id="crozzoDemoPlatoSel" class="crozzo-costos-editable" style="flex:1;min-width:220px;text-align:left">' +
      platoOpts +
      '</select>' +
      '<button type="button" class="btn btn-primary btn-sm" id="crozzoRecetaSave">Guardar receta</button></motion.div>' +
      (function () {
        var posProd = findPosProductForReceta(rec || { slug: activeSlug, producto: nombre });
        var areaLbl = posAreaLabelForProduct(posProd);
        return areaLbl
          ? '<p class="crozzo-costos-note" style="margin:8px 0"><strong>Área comanda POS:</strong> ' +
              esc(areaLbl) +
              ' — insumos → pedidos internos en esa área.</p>'
          : '<p class="crozzo-costos-note" style="margin:8px 0">Vincule el plato al producto POS (nombre o SKU = slug) para inferir área en pedidos.</p>';
      })() +
      '<h3 style="margin:0 0 8px;font-size:.95rem" id="crozzoDemoTitulo">' +
      esc(nombre) +
      ' <span style="font-size:11px;opacity:.65;font-weight:400">(' +
      esc(String(lineas.length)) +
      ' insumos)</span></h3>' +
      kpi +
      '<div class="crozzo-costos-scroll crozzo-costos-scroll--tall"><table class="crozzo-costos-feed-table"><thead><tr>' +
      '<th>Materia prima</th><th>U.</th><th>Cant.</th><th>$/u</th><th>Total</th><th>% MP</th><th></th>' +
      '</tr></thead><tbody id="crozzoDemoTbody">' +
      (demoRows || '<tr><td colspan="7">Sin líneas — agregue insumos</td></tr>') +
      '</tbody></table></div>' +
      '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoRecetaAddLine">+ Insumo</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoRecetaSyncPedidos">↻ Sincronizar pedidos internos</button></div>'
    ).replace(/<motion\./g, '<').replace(/<\/motion\./g, '</');
  }

  function renderMatrizPanel(seed) {
    seed = seed || hub.seed || { resumen: [], demoRecipe: { lineas: [], nombre: 'Demo' }, stats: {} };

    var resumenCount = mergeResumenList(seed).length;
    var mpCount = global.CrozzoCatalogoMp && global.CrozzoCatalogoMp.list ? global.CrozzoCatalogoMp.list().length : 0;

    return (
      '<div class="crozzo-costos-hub crozzo-mod-page">' +
      '<p class="crozzo-mod-lead">Dos capas: <strong>Catálogo</strong> (nombre y proveedores) y <strong>Costeo MP</strong> (unidad, peso, precio total, $/g). ' +
      esc(String(mpCount)) +
      ' insumos en catálogo.</p>' +
      '<nav class="crozzo-mod-nav crozzo-mod-nav--links">' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoCostosGoCatalogoMp">Catálogo MP</button></nav>' +
      '<div class="crozzo-mod-nav crozzo-mod-nav--segmented crozzo-costos-tabs crozzo-costos-matriz-tabs">' +
      '<button type="button" class="crozzo-mod-nav__item active" data-matriz-tab="resumen">Precios de venta</button>' +
      '<button type="button" class="crozzo-mod-nav__item" data-matriz-tab="costeo-mp">Costeo MP</button>' +
      '<button type="button" class="crozzo-mod-nav__item" data-matriz-tab="demo">Recetas plato</button></div>' +
      '<div class="crozzo-costos-panel active" data-matriz-panel="resumen">' +
      '<p class="crozzo-costos-note"><strong>Precios de venta:</strong> menú de capacitación (' +
      esc(String(resumenCount)) +
      ' platos). Edite precio de venta y costo MP.</p>' +
      '<input type="search" class="crozzo-mp-search" id="crozzoResumenSearch" placeholder="Buscar plato…" style="margin-bottom:12px;width:100%;max-width:420px;padding:10px 14px;border-radius:10px;border:1px solid var(--border)">' +
      '<div class="crozzo-costos-scroll crozzo-costos-scroll--tall"><table class="crozzo-costos-feed-table"><thead><tr>' +
      '<th>Producto</th><th>Costo MP</th><th>Precio venta</th><th>Utilidad</th><th>% Costo</th><th>% Util.</th><th>Obj. 30%</th>' +
      '</tr></thead><tbody id="crozzoResumenTbody">' +
      renderResumenRowsHtml(seed) +
      '</tbody></table></div></div>' +
      '<div class="crozzo-costos-panel" data-matriz-panel="costeo-mp">' +
      (global.CrozzoCosteoMp && global.CrozzoCosteoMp.renderPanel
        ? global.CrozzoCosteoMp.renderPanel({ embedded: true })
        : '<p class="crozzo-costos-note">Módulo de costeo no cargado.</p>') +
      '</div>' +
      '<div class="crozzo-costos-panel" data-matriz-panel="demo">' +
      renderDemoRecetaHtml(seed) +
      '</div>' +
      '<button type="button" class="btn btn-outline" id="crozzoCostosBackMap" style="margin-top:16px">← Mapa de flujos</button></div>'
    );
  }

  function refreshResumenRow(tr, seed) {
    var e = engine();
    if (!e || !tr) return;
    var slug = tr.getAttribute('data-resumen-slug');
    var costoInp = tr.querySelector('[data-resumen-field="costoMp"]');
    var precioInp = tr.querySelector('[data-resumen-field="precioVenta"]');
    var costoMp = Number(costoInp && costoInp.value);
    var precioVenta = Number(precioInp && precioInp.value);
    if (!isFinite(costoMp) || !isFinite(precioVenta)) return;
    saveResumenEdit(slug, { costoMp: costoMp, precioVenta: precioVenta });
    var r = e.calcularResumen(costoMp, precioVenta);
    var ev = e.evaluarMargen(r, 0.30);
    var u = tr.querySelector('[data-resumen-util]');
    var pc = tr.querySelector('[data-resumen-pct-costo]');
    var pu = tr.querySelector('[data-resumen-pct-util]');
    var ob = tr.querySelector('[data-resumen-obj]');
    if (u) u.textContent = engFmt(r.utilidadBruta);
    if (pc) pc.textContent = engPct(r.pctCostoMp);
    if (pu) pu.textContent = engPct(r.pctUtilidad);
    if (ob) {
      ob.innerHTML =
        '<span class="crozzo-costos-alert ' +
        (ev.dentroObjetivo ? 'crozzo-costos-alert--ok' : 'crozzo-costos-alert--warn') +
        '" style="padding:2px 6px;margin:0">' +
        (ev.dentroObjetivo ? 'OK' : 'Sobre 30%') +
        '</span>';
    }
    emit('crozzo-costos:matriz-precio-venta', { slug: slug, precioVenta: precioVenta, costoMp: costoMp });
  }

  function collectRecetaLineasFromDom(root, seed) {
    var e = engine();
    var C = global.CrozzoCatalogoMp;
    var tbody = root.querySelector('#crozzoDemoTbody');
    if (!tbody || !e) return [];
    var store = buildPreciosStore();
    var lineas = [];
    tbody.querySelectorAll('tr[data-demo-line]').forEach(function (tr) {
      var cantInp = tr.querySelector('[data-demo-cant]');
      var mpSel = tr.querySelector('[data-receta-mp]');
      var mpId = mpSel ? mpSel.value : tr.getAttribute('data-mp-id') || '';
      if (!mpId) return;
      var mp = C && C.get ? C.get(mpId) : null;
      var ing = mp && mp.nombre ? mp.nombre : '';
      var undEl = tr.querySelector('[data-receta-und]');
      var und = undEl ? undEl.textContent : mp && mp.und ? mp.und : 'GR';
      lineas.push({
        mpId: mpId,
        ingrediente: ing,
        unidad: und,
        cantidad: cantInp ? cantInp.value : 0,
        costoXUnidad: e.resolverCostoUnitario(ing, store),
      });
    });
    return lineas;
  }

  function recalcDemoReceta(root, seed) {
    var e = engine();
    if (!e || !root) return;
    var tbody = root.querySelector('#crozzoDemoTbody');
    if (!tbody) return;
    var slug = getActiveRecetaSlug(seed);
    var row = mergeResumenList(seed).find(function (r) {
      return r.slug === slug;
    });
    var C = global.CrozzoCatalogoMp;
    var rec = C && C.getRecetaPlato ? C.getRecetaPlato(slug) : null;
    var lineas = collectRecetaLineasFromDom(root, seed);
    saveDemoRecetaLineas(lineas, {
      slug: slug,
      producto: (rec && rec.producto) || (row && row.producto),
      opts: (rec && rec.opts) || (seed.demoRecipe && seed.demoRecipe.opts),
    });
    var calc = e.calcularReceta(lineas, (rec && rec.opts) || (seed.demoRecipe && seed.demoRecipe.opts) || {});
    calc.lineas.forEach(function (ln, i) {
      var tr = tbody.querySelector('tr[data-demo-line="' + i + '"]');
      if (!tr) return;
      var t = tr.querySelector('[data-demo-total]');
      var p = tr.querySelector('[data-demo-pct]');
      if (t) t.textContent = engFmt(ln.total);
      if (p) p.textContent = engPct(ln.pctDelTotal);
      var cu = tr.querySelector('[data-receta-unit]');
      if (cu) cu.textContent = engFmt(ln.costoXUnidad);
    });
    var kpi = root.querySelector('#crozzoDemoKpi');
    if (kpi) {
      var m = kpi.querySelector('[data-kpi="mp"]');
      var k5 = kpi.querySelector('[data-kpi="k5"]');
      var k7 = kpi.querySelector('[data-kpi="k7"]');
      var k10 = kpi.querySelector('[data-kpi="k10"]');
      var k11 = kpi.querySelector('[data-kpi="k11"]');
      if (m) m.textContent = engFmt(calc.totalMp);
      if (k5) k5.textContent = engFmt(calc.totalAlCosto);
      if (k7) k7.textContent = engFmt(calc.costoReferencia);
      if (k10) k10.textContent = engFmt(calc.precioSugerido);
      if (k11) k11.textContent = engFmt(calc.precioConImpuesto);
    }
  }

  function initMatrizGerenciaPanel(root, seed) {
    if (!root || !seed) return;
    if (!root._gerenciaBound) {
      root._gerenciaBound = true;
      document.addEventListener('crozzo-catalogo-mp:changed', function () {
        if (!root.isConnected) return;
        loadSeed(function (fresh) {
          var tbody = root.querySelector('#crozzoResumenTbody');
          if (tbody) tbody.innerHTML = renderResumenRowsHtml(fresh);
          root.querySelectorAll('[data-resumen-field]').forEach(function (inp) {
            inp._bound = false;
          });
          initMatrizGerenciaPanel(root, fresh);
          recalcDemoReceta(root, fresh);
        });
      });
    }
    var resumenQ = '';
    var search = root.querySelector('#crozzoResumenSearch');
    if (search && !search._bound) {
      search._bound = true;
      search.addEventListener('input', function () {
        resumenQ = search.value.toLowerCase().trim();
        root.querySelectorAll('#crozzoResumenTbody tr[data-resumen-slug]').forEach(function (tr) {
          var nom = (tr.cells[0] && tr.cells[0].textContent) || '';
          tr.style.display = !resumenQ || nom.toLowerCase().indexOf(resumenQ) >= 0 ? '' : 'none';
        });
      });
    }

    root.querySelectorAll('[data-resumen-field]').forEach(function (inp) {
      if (inp._bound) return;
      inp._bound = true;
      inp.addEventListener('change', function () {
        var tr = inp.closest('tr[data-resumen-slug]');
        refreshResumenRow(tr, seed);
        toast('Precio de venta actualizado', 'success');
      });
    });

    var platoSel = root.querySelector('#crozzoDemoPlatoSel');
    if (platoSel && !platoSel._bound) {
      platoSel._bound = true;
      platoSel.addEventListener('change', function () {
        hub.recetaSlug = platoSel.value;
        refreshRecetaPlatoPanel(root, seed);
      });
    }

    var saveRec = document.getElementById('crozzoRecetaSave');
    if (saveRec && !saveRec._bound) {
      saveRec._bound = true;
      saveRec.addEventListener('click', function () {
        recalcDemoReceta(root, seed);
        toast('Receta guardada — pedidos internos usará estos insumos', 'success');
      });
    }

    var addLine = document.getElementById('crozzoRecetaAddLine');
    if (addLine && !addLine._bound) {
      addLine._bound = true;
      addLine.addEventListener('click', function () {
        var tbody = root.querySelector('#crozzoDemoTbody');
        if (!tbody) return;
        var lineas = collectRecetaLineasFromDom(root, seed);
        var C = global.CrozzoCatalogoMp;
        var firstMp = C && C.list && C.list()[0];
        lineas.push({
          mpId: firstMp ? firstMp.id : '',
          ingrediente: firstMp ? firstMp.nombre : '',
          unidad: firstMp && firstMp.und ? firstMp.und : 'GR',
          cantidad: 1,
        });
        var slug = getActiveRecetaSlug(seed);
        var row = mergeResumenList(seed).find(function (r) {
          return r.slug === slug;
        });
        saveDemoRecetaLineas(lineas, { slug: slug, producto: row && row.producto });
        refreshRecetaPlatoPanel(root, seed);
      });
    }

    var syncPed = document.getElementById('crozzoRecetaSyncPedidos');
    if (syncPed && !syncPed._bound) {
      syncPed._bound = true;
      syncPed.addEventListener('click', function () {
        recalcDemoReceta(root, seed);
        var eng = global.CrozzoPedidosInternosEngine;
        var n = eng && eng.recalcAllFromRecipes ? eng.recalcAllFromRecipes() : 0;
        toast('Pedidos internos sincronizados (' + n + ' MPs por receta)', 'success');
      });
    }

    var goDemoCat = document.getElementById('crozzoDemoGoCatalogo');
    if (goDemoCat && !goDemoCat._bound) {
      goDemoCat._bound = true;
      goDemoCat.addEventListener('click', function () {
        if (typeof global.navigateTo === 'function') global.navigateTo('catalogo-mp');
      });
    }

    root.querySelectorAll('[data-demo-cant]').forEach(function (inp) {
      if (inp._bound) return;
      inp._bound = true;
      inp.addEventListener('change', function () {
        recalcDemoReceta(root, seed);
        toast('Receta recalculada', 'success');
      });
    });

    root.querySelectorAll('[data-receta-mp]').forEach(function (sel) {
      if (sel._bound) return;
      sel._bound = true;
      sel.addEventListener('change', function () {
        var tr = sel.closest('tr[data-demo-line]');
        var C = global.CrozzoCatalogoMp;
        var mp = C && C.get ? C.get(sel.value) : null;
        if (tr && mp) {
          tr.setAttribute('data-mp-id', mp.id);
          var und = tr.querySelector('[data-receta-und]');
          if (und) und.textContent = mp.und || 'GR';
        }
        recalcDemoReceta(root, seed);
      });
    });

    root.querySelectorAll('[data-receta-del]').forEach(function (btn) {
      if (btn._bound) return;
      btn._bound = true;
      btn.addEventListener('click', function () {
        var tr = btn.closest('tr[data-demo-line]');
        if (tr) tr.remove();
        recalcDemoReceta(root, seed);
      });
    });
  }

  function initMatrizAllPanels(root, seed) {
    var boot = function () {
      seed = hub.seed || seed;
      initMatrizGerenciaPanel(root, seed);
      var costeoPanel = root.querySelector('[data-matriz-panel="costeo-mp"]');
      if (costeoPanel && global.CrozzoCosteoMp && global.CrozzoCosteoMp.init) {
        global.CrozzoCosteoMp.init(costeoPanel);
      }
      var goCat = document.getElementById('crozzoCostosGoCatalogoMp');
      if (goCat && !goCat._bound) {
        goCat._bound = true;
        goCat.addEventListener('click', function () {
          if (typeof global.navigateTo === 'function') global.navigateTo('catalogo-mp');
        });
      }
    };
    var C = global.CrozzoCatalogoMp;
    if (C && C.ensureReady) C.ensureReady(boot);
    else boot();
  }

  function renderMatrizAsync() {
    if (hub.seed) return renderMatrizPanel(hub.seed);
    loadSeed(function () {
      var host = document.getElementById('mainContent');
      if (host && hub.view === 'matriz') {
        host.innerHTML = renderMatrizPanel(hub.seed);
        bindRoot(host);
        initMatrizAllPanels(host, hub.seed);
      }
    });
    return (
      '<div class="crozzo-costos-hub"><header class="crozzo-costos-hero"><h1>F1 · Matriz de precios</h1>' +
      '<p>Cargando datos de costos…</p></header></div>'
    );
  }

  function renderPlaceholder(title, phase, formula) {
    return (
      '<div class="crozzo-costos-hub">' +
      '<header class="crozzo-costos-hero"><h1>' + esc(title) + '</h1>' +
      '<p>Fase de implementación: <strong>' + esc(phase) + '</strong>. La estructura y conexiones ya están listas.</p></header>' +
      (formula ? '<div class="crozzo-costos-formula">' + formula + '</div>' : '') +
      '<div class="crozzo-costos-placeholder">Próximo paso: pantalla detallada de este flujo.<br>Vuelva al mapa con el botón «Mapa de flujos».</div>' +
      '<button type="button" class="btn btn-outline" id="crozzoCostosBackMap" style="margin-top:16px">← Mapa de flujos</button></div>'
    );
  }

  function render(view) {
    injectStyles();
    registerDefaultListeners();
    view = view || hub.view || 'map';
    hub.view = view;
    if (view === 'map') return renderMap();
    if (view === 'planilla-feed') return renderFeedPanel();
    if (view === 'matriz') return renderMatrizAsync();
    if (view === 'inventario') return renderInventarioPanel();
    if (view === 'reservorio') return renderReservorioPanel();
    if (view === 'sql') return renderSqlPanel();
    return renderMap();
  }

  function bindRoot(root) {
    if (!root || root._costosBound) return;
    root._costosBound = true;
    root.addEventListener('click', function (e) {
      var open = e.target.closest('.crozzo-costos-open');
      if (open) {
        e.preventDefault();
        goPage(open.getAttribute('data-page'));
        return;
      }
      var det = e.target.closest('.crozzo-costos-detail');
      if (det) {
        e.preventDefault();
        var fk = det.getAttribute('data-flow');
        if (fk === 'planilla-feed') hub.view = 'planilla-feed';
        else if (fk === 'matriz') hub.view = 'matriz';
        else if (fk === 'inventario') hub.view = 'inventario';
        else hub.view = 'map';
        var host = document.getElementById('mainContent');
        if (host) {
          host.innerHTML = render(hub.view);
          bindRoot(host);
          bindMatrizOnRender(host);
        }
        return;
      }
      if (e.target.id === 'crozzoCostosBackMap') {
        hub.view = 'map';
        var h = document.getElementById('mainContent');
        if (h) { h.innerHTML = render('map'); bindRoot(h); }
      }
      if (e.target.id === 'crozzoCostosGoPlanilla') goPage('planilla-2026');
      if (e.target.id === 'crozzoCostosGoSql') {
        hub.view = 'sql';
        var hs = document.getElementById('mainContent');
        if (hs) { hs.innerHTML = render('sql'); }
      }
      if (e.target.id === 'crozzoReservorioExport') {
        if (global.CrozzoReservorioOffline && global.CrozzoReservorioOffline.exportBackupFile()) {
          toast('Backup JSON descargado', 'success');
        } else if (reservorio() && reservorio().exportSnapshot) {
          try {
            var snap = reservorio().exportSnapshot();
            var blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'crozzo-reservorio-' + new Date().toISOString().slice(0, 10) + '.json';
            a.click();
            toast('Backup JSON descargado', 'success');
          } catch (_) {
            toast('No se pudo exportar', 'error');
          }
        }
      }
      if (e.target.id === 'crozzoSqlCopy') {
        var ta = document.getElementById('crozzoSqlEditor');
        if (ta) {
          ta.select();
          try {
            document.execCommand('copy');
            toast('SQL copiado al portapapeles', 'success');
          } catch (_) {
            navigator.clipboard.writeText(ta.value).then(function () { toast('SQL copiado', 'success'); });
          }
        }
      }
      var fok = e.target.closest('.crozzo-feed-ok');
      if (fok && reservorio()) {
        reservorio().updateFeedEstado(fok.getAttribute('data-id'), 'aceptado');
        toast('Propuesta aceptada — puede ingresarla en Planilla 2026', 'success');
        var hf = document.getElementById('mainContent');
        if (hf) { hf.innerHTML = render('planilla-feed'); }
      }
      var fno = e.target.closest('.crozzo-feed-no');
      if (fno && reservorio()) {
        reservorio().updateFeedEstado(fno.getAttribute('data-id'), 'rechazado');
        toast('Propuesta rechazada', 'info');
        var hfn = document.getElementById('mainContent');
        if (hfn) { hfn.innerHTML = render('planilla-feed'); }
      }
      if (e.target.id === 'crozzoCostosFeedRefresh') {
        var hr = document.getElementById('mainContent');
        if (hr) { hr.innerHTML = render('planilla-feed'); bindRoot(hr); }
      }
      var tab = e.target.closest('[data-matriz-tab]');
      if (tab) {
        e.preventDefault();
        var tabId = tab.getAttribute('data-matriz-tab');
        root.querySelectorAll('[data-matriz-tab]').forEach(function (btn) {
          var on = btn.getAttribute('data-matriz-tab') === tabId;
          btn.classList.toggle('active', on);
          btn.classList.toggle('is-active', on);
        });
        root.querySelectorAll('[data-matriz-panel]').forEach(function (panel) {
          panel.classList.toggle('active', panel.getAttribute('data-matriz-panel') === tabId);
        });
        if (tabId === 'resumen' || tabId === 'demo' || tabId === 'costeo-mp') {
          initMatrizAllPanels(root, hub.seed);
        }
      }
    });
  }

  function bindMatrizOnRender(root) {
    if (hub.view === 'matriz' && root) initMatrizAllPanels(root, hub.seed);
  }

  function init(view) {
    injectStyles();
    registerDefaultListeners();
    var root = document.getElementById('mainContent');
    if (root) {
      bindRoot(root);
      bindMatrizOnRender(root);
    }
    hub.view = view || 'map';
  }

  function teardown() {
    hub.bound = false;
  }

  function pageToView(page) {
    if (page === 'costos-matriz') return 'matriz';
    if (page === 'costos-inventario') return 'inventario';
    if (page === 'costos-planilla-feed') return 'planilla-feed';
    if (page === 'costos-reservorio') return 'reservorio';
    if (page === 'costos-sql') return 'sql';
    return 'map';
  }

    global.CrozzoSistemaCostos = {
    FLOWS: FLOWS,
    CONNECTIONS: CONNECTIONS,
    emit: emit,
    on: on,
    enqueuePlanillaFeed: enqueuePlanillaFeed,
    loadFeed: loadFeed,
    cloudReady: cloudReady,
    render: render,
    init: init,
    teardown: teardown,
    pageToView: pageToView,
  };

  global.renderSistemaCostos = function (view) { return render(view); };
  global.initSistemaCostos = init;
  global.crozzoCostosPageToView = pageToView;
  global.crozzoSistemaCostosTeardown = teardown;
  global.crozzoCostosEmit = emit;
})(window);

