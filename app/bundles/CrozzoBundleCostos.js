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

  /**
   * Precio de venta para un margen de utilidad sobre el precio (F = utilidad / precio).
   * Ej.: 20 % margen → precio = costo / 0,80
   */
  function precioDesdeMargenUtilidad(costoMp, pctUtilidad) {
    var c = num(costoMp);
    var m = num(pctUtilidad);
    if (c <= 0) return 0;
    if (m >= 1) m = 0.99;
    if (m < 0) m = 0;
    return c / (1 - m);
  }

  /** Redondeo típico de menú (múltiplos de 100 COP) */
  function redondearPrecioMenu(precio, paso) {
    paso = num(paso, 100);
    if (paso <= 0) return round(precio, 0);
    var p = num(precio);
    return Math.round(p / paso) * paso;
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
    precioMargenUtilidad: 'precio_venta = costo_mp / (1 − margen_utilidad)',
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
    precioDesdeMargenUtilidad: precioDesdeMargenUtilidad,
    redondearPrecioMenu: redondearPrecioMenu,
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
  var RECETAS_VERSION = 3;
  var DEFAULT_RECIPE_OPTS = {
    margenErrorPct: 0.03,
    margenErrorManual: false,
    porcentajeMpObjetivo: 0.3,
    impuestoPct: 0.08,
    porciones: 1,
  };
  var LS_LEGACY_MATRIZ = 'crozzo_costos_matriz_v1';
  var LS_SEED_FLAG = 'crozzo_catalogo_mp_seeded_v2';
  var DEMO_JSON = 'data/catalogo-demo.json';
  /** Fila oficial en «Costeos guardados» — se actualiza con MP, recetas y sincronización. */
  var PERIODO_COSTEO_VIGENTE = 'vigente';

  /** Categorías oficiales de materia prima — usadas en catálogo, compras y prep cocina. */
  var CATEGORIAS_MP = [
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
    'ELABORADOS',
    'OTRO',
  ];

  var CATEGORIA_MP_LABEL = {
    PROTEINAS: 'Proteínas (carnes, pollo, pescado)',
    LACTEOS: 'Lácteos',
    FRUVER: 'Fruver',
    ABARROTES: 'Abarrotes',
    'PULPAS Y CONGELADOS': 'Pulpas y congelados',
    'BEBIDAS Y LICORES': 'Bebidas y licores',
    DESECHABLES: 'Desechables',
    TERCERIZADOS: 'Tercerizados',
    ASEO: 'Aseo',
    PROCESADOS: 'Procesados',
    ELABORADOS: 'Elaborados / preparación',
    OTRO: 'Otro / sin clasificar',
  };

  var MP_COCINA_EXCLUIDAS = ['BEBIDAS Y LICORES', 'DESECHABLES', 'ASEO', 'TERCERIZADOS', 'ELABORADOS', 'OTRO'];
  var MP_COCCION_CATS = ['PROTEINAS', 'PULPAS Y CONGELADOS', 'FRUVER', 'PROCESADOS', 'LACTEOS', 'ABARROTES'];
  var MP_PREP_ROLES = ['despiece', 'coccion', 'insumo'];
  var MP_PREP_ROLE_LABELS = {
    despiece: 'Partir carnes',
    coccion: 'Cocinar y porcionar',
    insumo: 'Solo ingrediente en recetas',
  };

  var demoCache = null;
  var ready = false;
  var readyCbs = [];
  var readyPromise = null;

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

  function normalizeVigenciaIso(raw) {
    if (!raw) return null;
    var s = String(raw).trim();
    if (!s) return null;
    if (s.length === 16 && s.indexOf('T') === 10) {
      try {
        var dLocal = new Date(s);
        if (!isNaN(dLocal.getTime())) return dLocal.toISOString();
      } catch (_) {}
    }
    if (s.length === 10) return s;
    try {
      var d = new Date(s);
      if (!isNaN(d.getTime())) return d.toISOString();
    } catch (_) {}
    return s.slice(0, 10);
  }

  function vigenciaEsDue(vigenciaDesde, now) {
    now = now || new Date();
    if (!vigenciaDesde) return false;
    var s = String(vigenciaDesde);
    if (s.length <= 10) return s.slice(0, 10) <= now.toISOString().slice(0, 10);
    try {
      return new Date(s).getTime() <= now.getTime();
    } catch (_) {
      return false;
    }
  }

  function vigenciaExpirada(vigenciaHasta, now) {
    now = now || new Date();
    if (!vigenciaHasta) return false;
    var s = String(vigenciaHasta);
    if (s.length <= 10) return s.slice(0, 10) < now.toISOString().slice(0, 10);
    try {
      return new Date(s).getTime() < now.getTime();
    } catch (_) {
      return false;
    }
  }

  function formatVigenciaDisplay(vig) {
    if (!vig) return '—';
    var s = String(vig);
    try {
      if (s.length <= 10) {
        var d0 = new Date(s + 'T00:00:00');
        if (!isNaN(d0.getTime())) return d0.toLocaleDateString('es-CO', { dateStyle: 'short' });
      }
      var d = new Date(s);
      if (!isNaN(d.getTime())) {
        return d.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
      }
    } catch (_) {}
    return s;
  }

  function normalizeProgramacion(raw) {
    if (!raw) return null;
    var vig = normalizeVigenciaIso(raw.vigenciaDesde);
    if (!vig) return null;
    return {
      id: String(raw.id || 'prog_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)),
      precioVenta: Math.round(num(raw.precioVenta)),
      vigenciaDesde: vig,
      vigenciaHasta: raw.vigenciaHasta ? normalizeVigenciaIso(raw.vigenciaHasta) : null,
      aplicarPos: raw.aplicarPos !== false,
      lanzarPlato: raw.lanzarPlato !== false,
      estado: raw.estado === 'aplicada' || raw.estado === 'cancelada' ? raw.estado : 'pendiente',
      createdAt: raw.createdAt || new Date().toISOString(),
      aplicadaAt: raw.aplicadaAt || null,
      notas: String(raw.notas || '').trim(),
      tipo: raw.tipo === 'menu' ? 'menu' : 'plato',
    };
  }

  function normalizeEstadoFlujo(raw) {
    var s = String((raw && raw.estadoFlujo) || '').toLowerCase();
    if (s === 'borrador' || s === 'programado' || s === 'vigente') return s;
    if (raw && raw.posProductId != null && typeof global.products !== 'undefined' && Array.isArray(global.products)) {
      var p = global.products.find(function (x) {
        return x && x.id === raw.posProductId;
      });
      if (p && p.visibleEnPos === false) return 'borrador';
    }
    return 'vigente';
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
      gramajeVenta:
        raw.gramajeVenta != null && Number(raw.gramajeVenta) > 0 ? Math.round(num(raw.gramajeVenta)) : null,
      costeoMpSourceId: raw.costeoMpSourceId ? String(raw.costeoMpSourceId).trim() : null,
      origen: raw.origen || 'menu',
      tipoCosteo: tipo,
      modoProceso:
        raw.modoProceso === 'bajo_demanda'
          ? 'bajo_demanda'
          : raw.modoProceso === 'prep_anticipado'
            ? 'prep_anticipado'
            : null,
      tipoReceta: raw.tipoReceta === 'full' ? 'full' : raw.tipoReceta === 'base' ? 'base' : null,
      workflowPrep:
        raw.workflowPrep === 'coccion' || raw.workflowPrep === 'elaboracion' || raw.workflowPrep === 'ninguno'
          ? raw.workflowPrep
          : null,
      prepConfigManual: raw.prepConfigManual === true,
      vendeAlCliente: raw.vendeAlCliente === true || raw.vendeAlCliente === 1,
      margenObjetivoPct: raw.margenObjetivoPct != null ? num(raw.margenObjetivoPct) : null,
      margenMinimoPct: raw.margenMinimoPct != null ? num(raw.margenMinimoPct) : null,
      estadoFlujo: normalizeEstadoFlujo(raw),
      programadoPara: raw.programadoPara ? String(raw.programadoPara).slice(0, 10) : null,
      lanzadoAt: raw.lanzadoAt || null,
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

  /** Prep anticipado (salsas, bases) vs al momento del pedido (jugos, armado de plato). */
  function recetaUsaElaborados(slug) {
    var rec = getRecetaPlato(slug);
    if (!rec || !rec.lineas.length) return false;
    return rec.lineas.some(function (ln) {
      if (ln.mpId) {
        var mp = get(ln.mpId);
        if (mp && (mp.esElaborado || String(mp.categoria || '').toUpperCase() === 'ELABORADOS')) return true;
      }
      if (!ln.ingrediente) return false;
      var s = slugPlato(ln.ingrediente);
      if (!s || s === slug) return false;
      var menu = getMenuPlato(s);
      return !!(menu && menu.tipoCosteo === 'receta');
    });
  }

  function inferTipoRecetaFromMenu(row) {
    if (!row) return 'base';
    if (row.tipoReceta === 'base' || row.tipoReceta === 'full') return row.tipoReceta;
    if (row.tipoCosteo === 'directo') return 'full';
    var cat = String(row.categoria || '').toLowerCase();
    var nom = String(row.producto || '').toLowerCase();
    if (
      cat.indexOf('salsa') >= 0 ||
      cat.indexOf('base') >= 0 ||
      cat.indexOf('caldo') >= 0 ||
      cat.indexOf('fondo') >= 0 ||
      cat.indexOf('mise') >= 0 ||
      cat.indexOf('prep') >= 0
    ) {
      return 'base';
    }
    if (row.posProductId != null) return 'full';
    if (row.slug && recetaUsaElaborados(row.slug)) return 'full';
    if (
      cat.indexOf('beb') >= 0 ||
      cat.indexOf('jug') >= 0 ||
      cat.indexOf('bar') >= 0 ||
      cat.indexOf('plato') >= 0 ||
      cat.indexOf('fuerte') >= 0 ||
      nom.indexOf('jugo') >= 0 ||
      nom.indexOf('spag') >= 0 ||
      nom.indexOf('pasta') >= 0
    ) {
      return 'full';
    }
    if (row.precioVenta > 0) return 'full';
    return 'base';
  }

  /** Solo ítems que el módulo Procesos debe registrar a mano (prep en bodega). */
  function requiresSesionProceso(row) {
    if (!row) return false;
    if (row.tipoCosteo === 'directo') return false;
    return inferModoProcesoFromMenu(row) === 'prep_anticipado';
  }

  function getMenuPlatoByPosId(posProductId) {
    if (posProductId == null) return null;
    var st = loadStore();
    var hit = (st.menuCostos || []).find(function (m) {
      var row = normalizeMenuPlato(m);
      return row && row.posProductId != null && String(row.posProductId) === String(posProductId);
    });
    return hit ? normalizeMenuPlato(hit) : null;
  }

  function inferModoProcesoFromMenu(row) {
    if (!row) return 'prep_anticipado';
    if (row.modoProceso === 'bajo_demanda' || row.modoProceso === 'prep_anticipado') return row.modoProceso;
    var tipoRec = inferTipoRecetaFromMenu(row);
    if (tipoRec === 'full') return 'bajo_demanda';
    if (tipoRec === 'base') return 'prep_anticipado';
    var cat = String(row.categoria || '').toLowerCase();
    var nom = String(row.producto || '').toLowerCase();
    if (
      cat.indexOf('beb') >= 0 ||
      cat.indexOf('jug') >= 0 ||
      cat.indexOf('bar') >= 0 ||
      cat.indexOf('refresco') >= 0
    ) {
      return 'bajo_demanda';
    }
    if (
      nom.indexOf('jugo') >= 0 ||
      nom.indexOf('limonada') >= 0 ||
      nom.indexOf('smoothie') >= 0 ||
      nom.indexOf('malteada') >= 0
    ) {
      return 'bajo_demanda';
    }
    if (row.slug && recetaUsaElaborados(row.slug)) return 'bajo_demanda';
    return 'prep_anticipado';
  }

  /** Plato/receta de Costos enlazado a esta MP (elaborado o costeo directo). */
  function resolveMenuSlugForMp(mpId) {
    if (!mpId) return null;
    var st = loadStore();
    var catRow = (st.catalogoMp || []).find(function (c) {
      return c && String(c.id) === String(mpId);
    });
    if (catRow && catRow.menuSlug) return String(catRow.menuSlug);
    var byCosteo = (st.menuCostos || []).find(function (m) {
      var row = normalizeMenuPlato(m);
      return row && row.costeoMpSourceId && String(row.costeoMpSourceId) === String(mpId);
    });
    if (byCosteo && byCosteo.slug) return byCosteo.slug;
    if (catRow && catRow.nombre) {
      var nom = String(catRow.nombre).trim().toUpperCase();
      var byNom = (st.menuCostos || []).find(function (m) {
        var row = normalizeMenuPlato(m);
        return row && String(row.producto || '').trim().toUpperCase() === nom;
      });
      if (byNom && byNom.slug) return byNom.slug;
    }
    return null;
  }

  function getProcesoVentaForMp(mpId) {
    if (!mpId) return null;
    var mp = get(mpId);
    if (mp && mp.procesoVenta) return mp.procesoVenta;
    var slug = resolveMenuSlugForMp(mpId);
    if (!slug) return null;
    var menu = getMenuPlato(slug);
    if (!menu) return null;
    if (menu.modoProceso === 'bajo_demanda' || menu.modoProceso === 'prep_anticipado') return menu.modoProceso;
    return inferModoProcesoFromMenu(menu);
  }

  function inferWorkflowPrepFromReceta(slug) {
    if (!slug) return null;
    var rec = getRecetaPlato(slug);
    if (!rec || !rec.lineas || !rec.lineas.length) return null;
    var cocScore = 0;
    var elabScore = 0;
    rec.lineas.forEach(function (ln) {
      var mp = ln.mpId ? get(ln.mpId) : null;
      if (mp) {
        var cat = normalizeCategoriaMp(mp.categoria);
        if (cat === 'PROTEINAS' || cat === 'PULPAS Y CONGELADOS') cocScore += 1;
        if (cat === 'ABARROTES' || cat === 'FRUVER' || cat === 'LACTEOS') cocScore += 1;
        if (num(mp.mermaCoccionPct) > 0) cocScore += 2;
        if (isMpElaboradoCatalog(mp) || cat === 'ELABORADOS') elabScore += 2;
      }
      var ing = String(ln.ingrediente || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      if (/\b(salsa|caldo|aderezo|sofrito|base|pesto|mayonesa)\b/.test(ing)) elabScore += 2;
      if (/\b(arroz|frijol|lenteja|papa|pasta|guiso|porcion|batch)\b/.test(ing)) cocScore += 2;
    });
    if (recetaUsaElaborados(slug) && elabScore <= cocScore) elabScore += 1;
    if (cocScore > elabScore && cocScore >= 2) return 'coccion';
    if (elabScore >= cocScore && elabScore >= 1) return 'elaboracion';
    return null;
  }

  function inferWorkflowPrepFromMenu(row) {
    if (!row) return 'elaboracion';
    if (row.workflowPrep === 'elaboracion' || row.workflowPrep === 'coccion' || row.workflowPrep === 'ninguno') {
      if (!row.prepConfigManual && row.slug) {
        var fromRec = inferWorkflowPrepFromReceta(row.slug);
        if (fromRec && fromRec !== row.workflowPrep) return fromRec;
      }
      return row.workflowPrep;
    }
    if (inferModoProcesoFromMenu(row) === 'bajo_demanda') return 'ninguno';
    var fromReceta = row.slug ? inferWorkflowPrepFromReceta(row.slug) : null;
    if (fromReceta) return fromReceta;
    var nom = String(row.producto || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    var cat = String(row.categoria || '').toLowerCase();
    if (
      /\b(arroz|cocido|guiso|guisado|porcion|porcionado|batch|frijol|lenteja|pasta cocida|prep cocido)\b/.test(nom) ||
      cat.indexOf('guiso') >= 0 ||
      cat.indexOf('cocido') >= 0
    ) {
      return 'coccion';
    }
    return 'elaboracion';
  }

  function inferPrepCocinaTipo(row) {
    if (!row || row.tipoCosteo === 'directo') return 'al_vender';
    if (inferModoProcesoFromMenu(row) === 'bajo_demanda') return 'al_vender';
    return getWorkflowPrepForMenu(row) === 'coccion' ? 'prep_cocinar' : 'prep_salsas';
  }

  function prepCocinaTipoFromRow(row, preferStored) {
    if (!row || row.tipoCosteo === 'directo') return 'al_vender';
    if (preferStored !== false && row.modoProceso) {
      if (row.modoProceso === 'bajo_demanda') return 'al_vender';
      if (row.modoProceso === 'prep_anticipado') {
        return row.workflowPrep === 'coccion' ? 'prep_cocinar' : 'prep_salsas';
      }
    }
    return inferPrepCocinaTipo(row);
  }

  function applyPrepCocinaTipo(slug, tipo, opts) {
    opts = opts || {};
    if (!slug) return null;
    var patch;
    if (tipo === 'al_vender') {
      patch = { modoProceso: 'bajo_demanda', tipoReceta: 'full', workflowPrep: 'ninguno' };
    } else if (tipo === 'prep_cocinar') {
      patch = { modoProceso: 'prep_anticipado', tipoReceta: 'base', workflowPrep: 'coccion' };
    } else {
      patch = { modoProceso: 'prep_anticipado', tipoReceta: 'base', workflowPrep: 'elaboracion' };
    }
    if (opts.prepConfigManual != null) patch.prepConfigManual = !!opts.prepConfigManual;
    if (opts.vendeAlCliente != null) patch.vendeAlCliente = !!opts.vendeAlCliente;
    return updateMenuPlato(slug, patch);
  }

  function autoApplyMenuPrepConfig(slug, opts) {
    opts = opts || {};
    var row = getMenuPlato(slug);
    if (!row || row.tipoCosteo === 'directo') return null;
    if (row.prepConfigManual && !opts.force) return row;
    var inferred = inferPrepCocinaTipo(row);
    return applyPrepCocinaTipo(slug, inferred, { prepConfigManual: false });
  }

  function autoNormalizeAllMpCategories() {
    var n = 0;
    list().forEach(function (item) {
      if (!item || !item.id) return;
      var norm = normalizeCategoriaMp(item.categoria);
      if (norm === 'OTRO') {
        var guess = guessCategoriaFromNombre(item.nombre);
        if (guess !== 'OTRO') norm = guess;
      }
      if (norm !== item.categoria) {
        upsertCatalog({ id: item.id, categoria: norm }, { skipInvMov: true, skipIdCheck: true });
        n++;
      }
    });
    return n;
  }

  function runPrepCatalogAutomation(opts) {
    opts = opts || {};
    var mpN = autoNormalizeAllMpCategories();
    var menuN = 0;
    (loadStore().menuCostos || []).forEach(function (m) {
      var row = normalizeMenuPlato(m);
      if (!row || row.tipoCosteo === 'directo') return;
      if (opts.onlyUnset && row.prepConfigManual) return;
      if (opts.onlyUnset && row.modoProceso && row.workflowPrep) return;
      autoApplyMenuPrepConfig(row.slug, { force: !opts.onlyUnset });
      menuN++;
    });
    if (!opts.silent && (mpN || menuN)) {
      emitChanged({ tipo: 'prep-auto', mpN: mpN, menuN: menuN });
    }
    return { mpN: mpN, menuN: menuN };
  }

  function getWorkflowPrepForMenu(row) {
    return inferWorkflowPrepFromMenu(row);
  }

  function menuRowMatchesPrepWorkflow(row, workflow) {
    if (!row || !workflow) return true;
    if (workflow === 'despiece') return false;
    if (inferModoProcesoFromMenu(row) !== 'prep_anticipado') return false;
    var wf = getWorkflowPrepForMenu(row);
    if (workflow === 'elaboracion') return wf === 'elaboracion';
    if (workflow === 'coccion') return wf === 'coccion';
    return true;
  }

  /** Sincroniza prep antes vs al vender entre MP y plato de Costos. */
  function applyProcesoVentaFromMp(slug, procesoVenta, opts) {
    opts = opts || {};
    procesoVenta =
      procesoVenta === 'bajo_demanda' || procesoVenta === 'prep_anticipado' ? procesoVenta : null;
    if (!procesoVenta) return null;
    var patch = {
      modoProceso: procesoVenta,
      tipoReceta: procesoVenta === 'bajo_demanda' ? 'full' : 'base',
      workflowPrep: procesoVenta === 'bajo_demanda' ? 'ninguno' : opts.workflowPrep || undefined,
    };
    if (procesoVenta === 'prep_anticipado' && patch.workflowPrep == null) {
      var cur = slug ? getMenuPlato(slug) : null;
      patch.workflowPrep =
        cur && cur.workflowPrep && cur.workflowPrep !== 'ninguno' ? cur.workflowPrep : 'elaboracion';
    }
    if (procesoVenta === 'prep_anticipado' && opts.vendeAlCliente != null) {
      patch.vendeAlCliente = !!opts.vendeAlCliente;
    }
    var menuRow = null;
    if (slug) menuRow = updateMenuPlato(slug, patch);
    if (opts.mpId) {
      var mpPatch = { id: String(opts.mpId), procesoVenta: procesoVenta };
      if (slug) mpPatch.menuSlug = slug;
      upsertCatalog(mpPatch, { skipInvMov: true, skipIdCheck: true });
    }
    return menuRow;
  }

  /** Mermas reales: cocinado (entrada→cocido) y desposte/desgrado (cocido/entrada→útil). */
  function calcMermasProceso(pesoEntradaKg, pesoCocidoKg, pesoUtilKg) {
    var ent = num(pesoEntradaKg);
    var coc = num(pesoCocidoKg);
    var util = num(pesoUtilKg);
    var mermaCoccionKg = 0;
    var mermaDesposteKg = 0;
    var mermaCoccionPct = null;
    var mermaDespostePct = null;
    if (ent > 0 && coc > 0) {
      mermaCoccionKg = Math.max(0, ent - coc);
      mermaCoccionPct = (mermaCoccionKg / ent) * 100;
    }
    var baseDesposte = coc > 0 ? coc : ent;
    if (baseDesposte > 0 && util > 0) {
      mermaDesposteKg = Math.max(0, baseDesposte - util);
      mermaDespostePct = (mermaDesposteKg / baseDesposte) * 100;
    } else if (ent > 0 && util > 0 && coc <= 0) {
      mermaDesposteKg = Math.max(0, ent - util);
      mermaDespostePct = (mermaDesposteKg / ent) * 100;
    }
    return {
      pesoEntradaKg: ent,
      pesoCocidoKg: coc,
      pesoUtilKg: util,
      mermaCoccionKg: mermaCoccionKg,
      mermaDesposteKg: mermaDesposteKg,
      mermaCoccionPct: mermaCoccionPct,
      mermaDespostePct: mermaDespostePct,
      mermaTotalKg: mermaCoccionKg + mermaDesposteKg,
      mermaTotalPct: ent > 0 ? ((mermaCoccionKg + mermaDesposteKg) / ent) * 100 : null,
    };
  }

  function evalMermaProcesoAlerta(mp, mermas) {
    mermas = mermas || {};
    if (!mp) return { ok: true };
    var ref = getPerdidasProcesoRef();
    var espC = num(mp.mermaCoccionPct) > 0 ? num(mp.mermaCoccionPct) : ref.coccionPct;
    var espD = num(mp.mermaDespostePct) > 0 ? num(mp.mermaDespostePct) : ref.despiecePct;
    var realC = mermas.mermaCoccionPct != null ? num(mermas.mermaCoccionPct) : null;
    var realD = mermas.mermaDespostePct != null ? num(mermas.mermaDespostePct) : null;
    var tol = num(ref.toleranciaPct, 3);
    var msgs = [];
    if (realC != null && espC > 0 && realC > espC + tol) {
      msgs.push('cocinado ' + realC.toFixed(1) + '% (esp. ' + espC.toFixed(1) + '%)');
    }
    if (realD != null && espD > 0 && realD > espD + tol) {
      msgs.push('desposte ' + realD.toFixed(1) + '% (esp. ' + espD.toFixed(1) + '%)');
    }
    if (!msgs.length) return { ok: true };
    return { ok: false, mensaje: 'Merma por encima de lo esperado: ' + msgs.join(' · ') };
  }

  var PERDIDAS_PROCESO_KEY = 'crozzo_perdidas_procesos';
  var PERDIDAS_PROCESO_DEFAULT = { despiecePct: 15, coccionPct: 25, toleranciaPct: 3 };

  function getPerdidasProcesoRef() {
    try {
      var raw = localStorage.getItem(PERDIDAS_PROCESO_KEY);
      if (raw) {
        var p = JSON.parse(raw);
        return {
          despiecePct: num(p.despiecePct, PERDIDAS_PROCESO_DEFAULT.despiecePct),
          coccionPct: num(p.coccionPct, PERDIDAS_PROCESO_DEFAULT.coccionPct),
          toleranciaPct: num(p.toleranciaPct, PERDIDAS_PROCESO_DEFAULT.toleranciaPct),
        };
      }
    } catch (_) {}
    return Object.assign({}, PERDIDAS_PROCESO_DEFAULT);
  }

  function savePerdidasProcesoRef(patch) {
    patch = patch || {};
    var cur = getPerdidasProcesoRef();
    var next = {
      despiecePct: patch.despiecePct != null ? num(patch.despiecePct) : cur.despiecePct,
      coccionPct: patch.coccionPct != null ? num(patch.coccionPct) : cur.coccionPct,
      toleranciaPct: patch.toleranciaPct != null ? num(patch.toleranciaPct) : cur.toleranciaPct,
    };
    try {
      localStorage.setItem(PERDIDAS_PROCESO_KEY, JSON.stringify(next));
    } catch (_) {}
    emitChanged({ tipo: 'mermas-proceso', ref: next });
    try {
      document.dispatchEvent(
        new CustomEvent('crozzo-mermas-proceso-actualizadas', { detail: next, bubbles: true })
      );
    } catch (_) {}
    return next;
  }

  function perdidaEsperadaPct(mp, workflow) {
    var ref = getPerdidasProcesoRef();
    var wf = String(workflow || '').toLowerCase();
    if (mp) {
      if (wf === 'coccion' && num(mp.mermaCoccionPct) > 0) return num(mp.mermaCoccionPct);
      if ((wf === 'despiece' || !wf) && num(mp.mermaDespostePct) > 0) return num(mp.mermaDespostePct);
      if (num(mp.mermaCoccionPct) > 0 && wf === 'coccion') return num(mp.mermaCoccionPct);
    }
    if (wf === 'coccion') return ref.coccionPct;
    return ref.despiecePct;
  }

  function normalizeMargenErrorFrac(raw) {
    var n = num(raw, DEFAULT_RECIPE_OPTS.margenErrorPct);
    if (n > 1) n = n / 100;
    if (n < 0) n = 0;
    if (n > 0.5) n = 0.5;
    return n;
  }

  /** Estima margen de error (J4) a partir de mermas de MP en líneas de receta. */
  function inferMargenErrorPctFromLineas(lineas) {
    if (!Array.isArray(lineas) || !lineas.length) return null;
    var totalWeight = 0;
    var mermaWeighted = 0;
    lineas.forEach(function (ln) {
      if (!ln) return;
      var mp = ln.mpId ? get(ln.mpId) : null;
      if (!mp && ln.ingrediente) mp = getByNombre(ln.ingrediente);
      var mermaPct = 0;
      if (mp) {
        mermaPct = Math.max(num(mp.mermaCoccionPct), num(mp.mermaDespostePct));
        if (mermaPct <= 0) {
          mermaPct = Math.max(perdidaEsperadaPct(mp, 'coccion'), perdidaEsperadaPct(mp, 'despiece'));
        }
      }
      var q = num(ln.cantidad, 1);
      if (q <= 0) q = 1;
      totalWeight += q;
      mermaWeighted += mermaPct * q;
    });
    if (totalWeight <= 0 || mermaWeighted <= 0) return null;
    return normalizeMargenErrorFrac(mermaWeighted / totalWeight);
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

  function setProductoVisibleEnPos(posProductId, visible, opts) {
    opts = opts || {};
    if (posProductId == null) return false;
    if (typeof global.crozzoSetProductVisibleEnPos === 'function') {
      return global.crozzoSetProductVisibleEnPos(posProductId, visible !== false, opts) === true;
    }
    if (typeof global.products === 'undefined' || !Array.isArray(global.products)) return false;
    var vis = visible !== false;
    var found = false;
    global.products.forEach(function (p) {
      if (p && p.id === posProductId) {
        p.visibleEnPos = vis;
        found = true;
      }
    });
    return found;
  }

  function lanzarPlatoAlFlujoPrincipal(slug, opts) {
    opts = opts || {};
    var row = getMenuPlato(slug);
    if (!row) return false;
    var precio =
      opts.precioVenta != null && Number(opts.precioVenta) > 0
        ? Math.round(num(opts.precioVenta))
        : row.precioVenta;
    var patch = {
      estadoFlujo: 'vigente',
      programadoPara: null,
      lanzadoAt: new Date().toISOString(),
    };
    if (precio > 0) patch.precioVenta = precio;
    updateMenuPlato(slug, patch);
    if (row.posProductId != null) {
      setProductoVisibleEnPos(row.posProductId, true, opts);
      if (precio > 0) aplicarPrecioAlPos(slug, precio);
    }
    if (!opts.silent) {
      emitChanged({ tipo: 'plato-lanzado', slug: slug, precioVenta: precio });
      try {
        document.dispatchEvent(
          new CustomEvent('crozzo-costos:plato-lanzado', {
            detail: { slug: slug, precioVenta: precio },
            bubbles: true,
          })
        );
      } catch (_) {}
    }
    return true;
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
    if (row.estadoFlujo === 'borrador') {
      row.estadoFlujo = 'programado';
      row.programadoPara = prog.vigenciaDesde;
    }
    st.menuCostos[idx] = row;
    saveStore(st);
    emitChanged({ tipo: 'programacion', slug: slug, programacion: prog });
    return prog;
  }

  function buildPlanActualizacionMenu(getCostoMp) {
    var st = loadStore();
    var rows = (st.menuCostos || []).map(normalizeMenuPlato).filter(Boolean);
    var items = rows.map(function (row) {
      var costo = row.costoMp;
      if (getCostoMp) {
        var live = getCostoMp(row);
        if (live > 0) costo = live;
      }
      var precio = row.precioVenta > 0 ? row.precioVenta : 0;
      var accion =
        row.estadoFlujo === 'borrador' || row.estadoFlujo === 'programado' || row.posProductId == null
          ? 'lanzar'
          : 'actualizar';
      return {
        slug: row.slug,
        producto: row.producto,
        posProductId: row.posProductId,
        precioVenta: precio,
        costoMp: costo,
        estadoFlujo: row.estadoFlujo,
        accion: accion,
      };
    });
    var prev = (st.meta || {}).costeoMenuPublicado || { posIds: [] };
    var currentPosIds = {};
    items.forEach(function (it) {
      if (it.posProductId != null) currentPosIds[it.posProductId] = true;
    });
    var ocultar = (prev.posIds || []).filter(function (pid) {
      return !currentPosIds[pid];
    });
    return {
      items: items,
      ocultarPosIds: ocultar,
      generadoAt: new Date().toISOString(),
    };
  }

  function aplicarPlanActualizacionMenu(plan, opts) {
    opts = opts || {};
    plan = plan || { items: [], ocultarPosIds: [] };
    var lanzados = 0;
    var actualizados = 0;
    var ocultos = 0;
    (plan.ocultarPosIds || []).forEach(function (pid) {
      if (setProductoVisibleEnPos(pid, false, { silent: true })) ocultos++;
    });
    (plan.items || []).forEach(function (it) {
      if (!it || !it.slug) return;
      var row = getMenuPlato(it.slug);
      if (!row) return;
      var precio =
        it.precioVenta > 0 ? Math.round(num(it.precioVenta)) : Math.round(num(row.precioVenta));
      if (it.accion === 'lanzar' || row.estadoFlujo === 'borrador' || row.estadoFlujo === 'programado') {
        if (lanzarPlatoAlFlujoPrincipal(it.slug, { silent: true, precioVenta: precio })) lanzados++;
      } else if (row.posProductId != null && precio > 0) {
        aplicarPrecioAlPos(it.slug, precio);
        setProductoVisibleEnPos(row.posProductId, true, { silent: true });
        updateMenuPlato(it.slug, {
          precioVenta: precio,
          estadoFlujo: 'vigente',
          programadoPara: null,
        });
        actualizados++;
      }
    });
    var st = loadStore();
    if (!st.meta) st.meta = {};
    var posIds = [];
    (plan.items || []).forEach(function (it) {
      var fresh = getMenuPlato(it.slug);
      if (fresh && fresh.posProductId != null) posIds.push(fresh.posProductId);
    });
    st.meta.costeoMenuPublicado = {
      at: new Date().toISOString(),
      slugs: (plan.items || []).map(function (it) {
        return it.slug;
      }),
      posIds: posIds,
    };
    saveStore(st);
    if (typeof global.persistCatalogProductosLocal === 'function') {
      try {
        global.persistCatalogProductosLocal();
      } catch (_) {}
    } else if (typeof global.persistCatalogProductos === 'function') {
      try {
        global.persistCatalogProductos();
      } catch (_) {}
    }
    if (!opts.silent) {
      emitChanged({ tipo: 'menu-aplicado', lanzados: lanzados, actualizados: actualizados, ocultos: ocultos });
      try {
        document.dispatchEvent(
          new CustomEvent('crozzo-costos:menu-aplicado', {
            detail: { lanzados: lanzados, actualizados: actualizados, ocultos: ocultos },
            bubbles: true,
          })
        );
      } catch (_) {}
    }
    return { lanzados: lanzados, actualizados: actualizados, ocultos: ocultos };
  }

  function aplicarActualizacionMenuCompleta(opts) {
    opts = opts || {};
    var plan = buildPlanActualizacionMenu(opts.getCostoMp);
    return aplicarPlanActualizacionMenu(plan, opts);
  }

  function addProgramacionMenu(vigenciaDesde, opts) {
    opts = opts || {};
    var vig = normalizeVigenciaIso(vigenciaDesde);
    if (!vig) return null;
    var st = loadStore();
    if (!st.meta) st.meta = {};
    if (!Array.isArray(st.meta.programacionesMenu)) st.meta.programacionesMenu = [];
    var plan = buildPlanActualizacionMenu(opts.getCostoMp);
    var resumen = {
      lanzar: plan.items.filter(function (i) {
        return i.accion === 'lanzar';
      }).length,
      actualizar: plan.items.filter(function (i) {
        return i.accion === 'actualizar';
      }).length,
      ocultar: (plan.ocultarPosIds || []).length,
    };
    var prog = {
      id: 'menuprog_' + Date.now(),
      vigenciaDesde: vig,
      estado: 'pendiente',
      createdAt: new Date().toISOString(),
      notas: opts.notas || 'Actualización menú costeo → caja',
      plan: plan,
      resumen: resumen,
    };
    st.meta.programacionesMenu.push(prog);
    (plan.items || []).forEach(function (it) {
      if (it.accion === 'lanzar' && it.slug) {
        updateMenuPlato(it.slug, { estadoFlujo: 'programado', programadoPara: vig });
      }
    });
    saveStore(st);
    emitChanged({ tipo: 'programacion-menu', programacion: prog });
    return prog;
  }

  function ejecutarProgramacionesMenuPendientes(opts) {
    opts = opts || {};
    var st = loadStore();
    if (!st.meta || !Array.isArray(st.meta.programacionesMenu)) return 0;
    var now = new Date();
    var n = 0;
    st.meta.programacionesMenu.forEach(function (prog) {
      if (!prog || prog.estado !== 'pendiente') return;
      if (!vigenciaEsDue(prog.vigenciaDesde, now)) return;
      aplicarPlanActualizacionMenu(prog.plan, Object.assign({ silent: true }, opts));
      prog.estado = 'aplicada';
      prog.aplicadaAt = now.toISOString();
      n++;
    });
    if (n) {
      saveStore(st);
      if (!opts.silent) {
        emitChanged({ tipo: 'programaciones-menu-aplicadas', count: n });
      }
    }
    return n;
  }

  function listProgramacionesMenuAll() {
    var st = loadStore();
    if (!st.meta || !Array.isArray(st.meta.programacionesMenu)) return [];
    return st.meta.programacionesMenu.slice().sort(function (a, b) {
      return String(a.vigenciaDesde).localeCompare(String(b.vigenciaDesde));
    });
  }

  function ejecutarProgramacionesPendientes(opts) {
    opts = opts || {};
    var st = loadStore();
    migrateMenuCostosShape(st);
    var now = new Date();
    var changed = 0;
    var aplicadas = [];
    (st.menuCostos || []).forEach(function (raw, idx) {
      var row = normalizeMenuPlato(raw);
      if (!row || !row.programaciones.length) return;
      var touched = false;
      row.programaciones.forEach(function (prog) {
        if (!prog || prog.estado !== 'pendiente') return;
        if (!vigenciaEsDue(prog.vigenciaDesde, now)) return;
        if (vigenciaExpirada(prog.vigenciaHasta, now)) {
          prog.estado = 'cancelada';
          touched = true;
          return;
        }
        row.precioVenta = prog.precioVenta;
        prog.estado = 'aplicada';
        prog.aplicadaAt = now.toISOString();
        if (prog.aplicarPos) aplicarPrecioAlPos(row.slug, prog.precioVenta);
        if (prog.lanzarPlato !== false) {
          lanzarPlatoAlFlujoPrincipal(row.slug, { silent: true, precioVenta: prog.precioVenta });
        } else if (row.estadoFlujo !== 'vigente') {
          row.estadoFlujo = 'vigente';
          row.programadoPara = null;
        }
        var freshRow = getMenuPlato(row.slug);
        if (freshRow) row = freshRow;
        else row.precioVenta = prog.precioVenta;
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

  function alertaMargenDesdePct(margenRealPct, margenMinPct, margenObjPct, costoMp, costoMpAnterior) {
    var crit = readLsMargen('crozzo_costos_mp_alerta_subida_v1', null);
    if (crit == null) crit = readLsMargen('crozzo_costos_margen_minimo_v1', 10);
    var prev = costoMpAnterior != null ? Number(costoMpAnterior) : null;
    var cur = costoMp != null ? Number(costoMp) : null;
    if (prev > 0 && cur > 0 && cur > prev) {
      var subidaPct = ((cur - prev) / prev) * 100;
      if (subidaPct >= crit - 0.05) return 'crit';
      if (subidaPct >= crit / 2 - 0.05) return 'warn';
    }
    if (margenRealPct == null || !isFinite(margenRealPct)) return 'ok';
    var objCosto =
      margenObjPct != null ? 100 - Number(margenObjPct) : 100 - readLsMargen('crozzo_costos_margen_global_v1', 20);
    var rawCosto = readLsMargen('crozzo_costos_costo_global_v1', null);
    if (rawCosto != null) objCosto = Number(rawCosto);
    var actualCosto = 100 - margenRealPct;
    if (actualCosto > objCosto + 0.05) return 'warn';
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
        snapshot.alertaMargen ||
        alertaMargenDesdePct(margenReal, margenMin, margenObj, costoMp, costoMpAnterior),
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
    listProgramacionesMenuAll().forEach(function (prog) {
      out.push({
        slug: '',
        producto: 'Menú completo (caja)',
        programacion: {
          id: prog.id,
          vigenciaDesde: prog.vigenciaDesde,
          precioVenta: 0,
          estado: prog.estado,
          notas: prog.notas,
          aplicarPos: true,
          tipo: 'menu',
          resumen: prog.resumen,
          aplicadaAt: prog.aplicadaAt,
        },
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
    if (p.gramajeVenta != null && Number(p.gramajeVenta) > 0) {
      base.gramajeVenta = Math.round(num(p.gramajeVenta));
    } else if (p.porcionGramos != null && Number(p.porcionGramos) > 0) {
      base.gramajeVenta = Math.round(num(p.porcionGramos));
    }
    base.tipoCosteo = tipo;
    if (opts.estadoFlujo) {
      base.estadoFlujo = normalizeEstadoFlujo({ estadoFlujo: opts.estadoFlujo });
    } else if (p.visibleEnPos === false) {
      base.estadoFlujo = 'borrador';
    } else if (!base.estadoFlujo) {
      base.estadoFlujo = 'vigente';
    }
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
      var recOpts = {};
      if (opts.margenErrorPct != null) {
        recOpts.margenErrorPct = normalizeMargenErrorFrac(opts.margenErrorPct);
        recOpts.margenErrorManual = opts.margenErrorManual === true;
      }
      var exRec = getRecetaPlato(slug);
      if (exRec) {
        if (Object.keys(recOpts).length) {
          upsertRecetaPlato(
            {
              slug: slug,
              producto: exRec.producto,
              lineas: exRec.lineas,
              opts: Object.assign({}, exRec.opts, recOpts),
            },
            { skipLegacyDemo: true }
          );
        } else {
          ensureRecetaForMenu(slug, row.producto);
        }
      } else {
        upsertRecetaPlato(
          { slug: slug, producto: row.producto, lineas: [], opts: recOpts },
          { skipLegacyDemo: true }
        );
      }
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

  function normalizeCortesDespiece(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
      .map(function (c) {
        if (!c) return null;
        var nom = String(c.nombre || '').trim();
        var pct = c.pctRef != null && c.pctRef !== '' ? num(c.pctRef) : null;
        var grPor =
          c.grPorPorcion != null && c.grPorPorcion !== ''
            ? num(c.grPorPorcion)
            : c.gramosPorPorcion != null
              ? num(c.gramosPorPorcion)
              : null;
        if (!nom && pct == null && !(grPor > 0)) return null;
        return {
          id: String(c.id || slugId(nom || 'corte')).trim(),
          nombre: nom,
          pctRef: pct,
          grPorPorcion: grPor > 0 ? grPor : null,
        };
      })
      .filter(Boolean);
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
      categoria: normalizeCategoriaMp(raw.categoria || guessCategoriaFromNombre(raw.nombre)),
      proveedores: parseProveedores(raw.proveedores),
      materiaPrimaId: raw.materiaPrimaId || null,
      areaPedido: raw.areaPedido ? String(raw.areaPedido).trim() : null,
      posProductId: raw.posProductId != null ? raw.posProductId : null,
      esReventaPos: raw.esReventaPos === true,
      activo: raw.activo !== false,
      fechaElaboracion: String(raw.fechaElaboracion || '').trim().slice(0, 10),
      fechaIngreso: String(raw.fechaIngreso || '').trim().slice(0, 10),
      fechaVencimiento: String(raw.fechaVencimiento || '').trim().slice(0, 10),
      menuSlug: raw.menuSlug ? String(raw.menuSlug).trim() : null,
      mpOrigenId: raw.mpOrigenId ? String(raw.mpOrigenId).trim() : null,
      esElaborado: raw.esElaborado === true,
      procesoVenta:
        raw.procesoVenta === 'bajo_demanda' || raw.procesoVenta === 'prep_anticipado'
          ? raw.procesoVenta
          : null,
      mermaCoccionPct:
        raw.mermaCoccionPct != null
          ? num(raw.mermaCoccionPct)
          : raw.merma_coccion_pct != null
            ? num(raw.merma_coccion_pct)
            : null,
      mermaDespostePct:
        raw.mermaDespostePct != null
          ? num(raw.mermaDespostePct)
          : raw.merma_porcionado_pct != null
            ? num(raw.merma_porcionado_pct)
            : raw.merma_desposte_pct != null
              ? num(raw.merma_desposte_pct)
              : null,
      prepRoles: normalizePrepRoles(raw.prepRoles),
      prepRolesManual: raw.prepRolesManual === true,
      updatedAt: raw.updatedAt || new Date().toISOString(),
    };
    if (raw.cortesDespiece != null) {
      item.cortesDespiece = normalizeCortesDespiece(raw.cortesDespiece);
    }
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
      categoria: normalizeCategoriaMp(catRow.categoria),
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
      fechaElaboracion: catRow.fechaElaboracion || '',
      fechaIngreso: catRow.fechaIngreso || '',
      fechaVencimiento: catRow.fechaVencimiento || '',
      menuSlug: catRow.menuSlug || null,
      mpOrigenId: catRow.mpOrigenId || null,
      esElaborado: catRow.esElaborado === true,
      procesoVenta: catRow.procesoVenta || null,
      mermaCoccionPct: catRow.mermaCoccionPct != null ? num(catRow.mermaCoccionPct) : null,
      mermaDespostePct: catRow.mermaDespostePct != null ? num(catRow.mermaDespostePct) : null,
      prepRoles: normalizePrepRoles(catRow.prepRoles),
      prepRolesManual: catRow.prepRolesManual === true,
      cortesDespiece: Array.isArray(catRow.cortesDespiece) ? catRow.cortesDespiece.slice() : [],
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
            merma_coccion_pct: item.mermaCoccionPct != null ? num(item.mermaCoccionPct) : 0,
            merma_porcionado_pct: item.mermaDespostePct != null ? num(item.mermaDespostePct) : 0,
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

  function patchTrazabilidad(mpId, dates) {
    dates = dates || {};
    var st = loadStore();
    var idx = st.catalogoMp.findIndex(function (x) {
      return x && String(x.id) === String(mpId);
    });
    if (idx < 0) return null;
    var row = Object.assign({}, st.catalogoMp[idx]);
    if (dates.fechaElaboracion !== undefined) row.fechaElaboracion = String(dates.fechaElaboracion || '').trim().slice(0, 10);
    if (dates.fechaIngreso !== undefined) row.fechaIngreso = String(dates.fechaIngreso || '').trim().slice(0, 10);
    if (dates.fechaVencimiento !== undefined) row.fechaVencimiento = String(dates.fechaVencimiento || '').trim().slice(0, 10);
    row.updatedAt = new Date().toISOString();
    st.catalogoMp[idx] = row;
    saveStore(st);
    var merged = get(row.id);
    emitChanged({ tipo: 'trazabilidad', mpId: row.id, item: merged });
    return merged;
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

  /** Cortes de despiece guardados por MP (nombre + gramos por porción). */
  function saveCortesDespiece(mpId, cortes) {
    var id = String(mpId || '').trim();
    if (!id) return null;
    var mp = get(id);
    if (!mp) return null;
    var payload = normalizeCortesDespiece(
      (cortes || []).map(function (c) {
        return {
          id: c.id,
          nombre: c.nombre,
          pctRef: c.pctRef,
          grPorPorcion: c.grPorPorcion,
        };
      })
    );
    return upsertCatalog(Object.assign({}, mp, { cortesDespiece: payload }), { skipInvMov: true });
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
    var menuIdx = (st.menuCostos || []).findIndex(function (m) {
      return m && m.slug === slug;
    });
    if (menuIdx >= 0) {
      var menuRow = normalizeMenuPlato(st.menuCostos[menuIdx]);
      if (menuRow.estadoFlujo === 'borrador') {
        menuRow.estadoFlujo = 'programado';
        menuRow.programadoPara = prog.vigenciaDesde;
        st.menuCostos[menuIdx] = menuRow;
      }
    }
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
        if (opts.aplicarPos !== false) lanzarPlatoAlFlujoPrincipal(rec.slug, { silent: true, precioVenta: snap.precioVenta });
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

  function ensureRecetaForMenu(slug, producto, opts) {
    opts = opts || {};
    var ex = getRecetaPlato(slug);
    if (ex) {
      if (opts.margenErrorPct != null) {
        return upsertRecetaPlato(
          {
            slug: slug,
            producto: ex.producto,
            lineas: ex.lineas,
            opts: Object.assign({}, ex.opts, {
              margenErrorPct: normalizeMargenErrorFrac(opts.margenErrorPct),
              margenErrorManual: opts.margenErrorManual === true,
            }),
          },
          { skipLegacyDemo: true }
        );
      }
      return ex;
    }
    var recOpts = {};
    if (opts.margenErrorPct != null) {
      recOpts.margenErrorPct = normalizeMargenErrorFrac(opts.margenErrorPct);
      recOpts.margenErrorManual = opts.margenErrorManual === true;
    }
    return upsertRecetaPlato({ slug: slug, producto: producto, lineas: [], opts: recOpts }, { skipLegacyDemo: true });
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

  function flushReadyCbs() {
    var cbs = readyCbs.slice();
    readyCbs = [];
    cbs.forEach(function (fn) {
      try {
        fn();
      } catch (e) {
        console.warn('[CatalogoMp] ensureReady cb', e);
      }
    });
  }

  function runEnsureReadyInit(j) {
    try {
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
      try {
        runPrepCatalogAutomation({ onlyUnset: true, silent: true });
      } catch (_) {}
    } catch (e) {
      console.warn('[CatalogoMp] ensureReady init', e);
    }
    ready = true;
    flushReadyCbs();
  }

  function fetchDemoJson() {
    if (demoCache) return Promise.resolve(demoCache);
    var fetchJson = fetch(DEMO_JSON)
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .catch(function () {
        return null;
      });
    var timeout = new Promise(function (resolve) {
      setTimeout(function () {
        resolve(null);
      }, 8000);
    });
    return Promise.race([fetchJson, timeout]).then(function (j) {
      demoCache = j;
      return j;
    });
  }

  function ensureReady(cb) {
    if (ready) {
      if (cb) {
        try {
          cb();
        } catch (e) {
          console.warn('[CatalogoMp] ensureReady cb', e);
        }
      }
      return Promise.resolve();
    }
    if (cb) readyCbs.push(cb);
    if (!readyPromise) {
      readyPromise = fetchDemoJson()
        .then(function (j) {
          runEnsureReadyInit(j);
        })
        .catch(function (e) {
          console.warn('[CatalogoMp] ensureReady fetch', e);
          runEnsureReadyInit(null);
        });
    }
    return readyPromise;
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

  function slugCategoriaMpKey(raw) {
    return String(raw || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, ' ')
      .slice(0, 48);
  }

  function getCustomCategoriasMp(st) {
    st = st || loadStore();
    if (!st.meta) st.meta = {};
    var arr = st.meta.categoriasMpCustom;
    if (!Array.isArray(arr)) return [];
    return arr
      .map(function (x) {
        if (typeof x === 'string') {
          var k = slugCategoriaMpKey(x);
          return k ? { key: k, label: String(x).trim() } : null;
        }
        if (x && x.key) {
          var key = slugCategoriaMpKey(x.key);
          return key ? { key: key, label: String(x.label || x.key).trim() } : null;
        }
        return null;
      })
      .filter(Boolean);
  }

  function getCustomCategoriaLabels(st) {
    var map = {};
    getCustomCategoriasMp(st).forEach(function (c) {
      if (c.key) map[c.key] = c.label || c.key;
    });
    return map;
  }

  function listCategoriasMpAll(st) {
    var seen = {};
    var out = [];
    CATEGORIAS_MP.forEach(function (c) {
      if (!seen[c]) {
        seen[c] = true;
        out.push(c);
      }
    });
    getCustomCategoriasMp(st).forEach(function (c) {
      if (c.key && !seen[c.key]) {
        seen[c.key] = true;
        out.push(c.key);
      }
    });
    return out;
  }

  function addCategoriaMp(nombre, labelOpt) {
    var label = String(labelOpt || nombre || '').trim();
    var key = slugCategoriaMpKey(nombre || label);
    if (!key || key.length < 2) return { ok: false, msg: 'Escriba un nombre de categoría (mín. 2 caracteres).' };
    if (CATEGORIAS_MP.indexOf(key) >= 0) {
      return { ok: true, key: key, label: CATEGORIA_MP_LABEL[key] || key, existed: true };
    }
    var st = loadStore();
    if (!st.meta) st.meta = {};
    if (!Array.isArray(st.meta.categoriasMpCustom)) st.meta.categoriasMpCustom = [];
    var existed = st.meta.categoriasMpCustom.some(function (x) {
      return slugCategoriaMpKey(typeof x === 'string' ? x : x.key) === key;
    });
    if (!existed) {
      st.meta.categoriasMpCustom.push({ key: key, label: label || key });
      saveStore(st);
      emitChanged({ type: 'categoria_mp_add', key: key });
    }
    return { ok: true, key: key, label: label || key, existed: existed };
  }

  function normalizeCategoriaMp(raw) {
    var c = slugCategoriaMpKey(raw);
    if (!c || c === 'GENERAL' || c === 'GENERAL.') return 'OTRO';
    if (CATEGORIAS_MP.indexOf(c) >= 0) return c;
    var custom = getCustomCategoriasMp();
    for (var i = 0; i < custom.length; i++) {
      if (custom[i].key === c) return c;
    }
    if (c.indexOf('ELABOR') >= 0) return 'ELABORADOS';
    if (c.indexOf('BEBID') >= 0 || c.indexOf('LICOR') >= 0 || c.indexOf('AGUA') >= 0) return 'BEBIDAS Y LICORES';
    if (c.indexOf('DESECH') >= 0 || c.indexOf('EMPAQUE') >= 0) return 'DESECHABLES';
    if (c.indexOf('ASEO') >= 0 || c.indexOf('LIMPIE') >= 0) return 'ASEO';
    if (c.indexOf('LACT') >= 0 || c.indexOf('QUESO') >= 0) return 'LACTEOS';
    if (c.indexOf('FRU') >= 0 || c.indexOf('VERD') >= 0 || c.indexOf('HORT') >= 0) return 'FRUVER';
    if (c.indexOf('PULPA') >= 0 || c.indexOf('CONGEL') >= 0) return 'PULPAS Y CONGELADOS';
    if (c.indexOf('ABARRO') >= 0 || c.indexOf('GRANO') >= 0) return 'ABARROTES';
    if (
      c.indexOf('CARNE') >= 0 ||
      c.indexOf('CARN') >= 0 ||
      c.indexOf('POLLO') >= 0 ||
      c.indexOf('CERDO') >= 0 ||
      c.indexOf('PESC') >= 0 ||
      c.indexOf('MARISC') >= 0 ||
      c.indexOf('PROTE') >= 0 ||
      c === 'RES' ||
      c.indexOf('RES ') >= 0 ||
      c.indexOf(' RES') >= 0
    ) {
      return 'PROTEINAS';
    }
    if (c.indexOf('PROCES') >= 0) return 'PROCESADOS';
    if (c.indexOf('TERCER') >= 0) return 'TERCERIZADOS';
    return 'OTRO';
  }

  function guessCategoriaFromNombre(nombre) {
    var n = String(nombre || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    if (!n.trim()) return 'OTRO';
    if (/\b(agua|gaseosa|cerveza|licor|ron|whisky|vino|jugo|bebida|refresco|soda|cola|malta|te\s|cafe|café)\b/.test(n)) {
      return 'BEBIDAS Y LICORES';
    }
    if (/\b(vaso|bolsa|servilleta|desech|empaque|envase|film|aluminio|guante)\b/.test(n)) return 'DESECHABLES';
    if (/\b(cloro|deterg|jabon|jabón|aseo|desinf|limpia)\b/.test(n)) return 'ASEO';
    if (/\b(pollo|pechuga|muslo|ala|carne|res\b|cerdo|chuleta|solomo|lomo|chicharron|chicharrón|pescado|trucha|salmon|salmón|camaron|marisc|atun|atún|higado|hígado|costilla|molida)\b/.test(n)) {
      return 'PROTEINAS';
    }
    if (/\b(leche|queso|mantequilla|crema|yogurt|yogur)\b/.test(n)) return 'LACTEOS';
    if (/\b(tomate|cebolla|papa|lechuga|zanahoria|fruver|verdura|fruta|limon|limón| cilantro|perejil)\b/.test(n)) {
      return 'FRUVER';
    }
    if (/\b(pulpa|congelad|helado)\b/.test(n)) return 'PULPAS Y CONGELADOS';
    if (/\b(aceite|arroz|harina|sal\b|azucar|azúcar|frijol|lenteja|pasta seca|pan\b|condimento)\b/.test(n)) {
      return 'ABARROTES';
    }
    if (/\b(salsa|caldo|base|aderezo|elaborad)\b/.test(n)) return 'ELABORADOS';
    return 'OTRO';
  }

  function categoriaMpLabel(cat) {
    var norm = normalizeCategoriaMp(cat);
    var customLabels = getCustomCategoriaLabels();
    if (customLabels[norm]) return customLabels[norm];
    return CATEGORIA_MP_LABEL[norm] || norm;
  }

  function renderCategoriaMpOptionsHtml(selected, opts) {
    opts = opts || {};
    selected = normalizeCategoriaMp(selected);
    var labels = Object.assign({}, CATEGORIA_MP_LABEL, getCustomCategoriaLabels());
    var html = listCategoriasMpAll()
      .map(function (c) {
        return (
          '<option value="' +
          c +
          '"' +
          (c === selected ? ' selected' : '') +
          '>' +
          (labels[c] || c) +
          '</option>'
        );
      })
      .join('');
    if (opts.allowNew !== false) {
      html += '<option value="__NEW_MP_CAT__">+ Nueva categoría…</option>';
    }
    return html;
  }

  function isMpElaboradoCatalog(mp) {
    if (!mp) return false;
    var cat = normalizeCategoriaMp(mp.categoria);
    return mp.esElaborado === true || cat === 'ELABORADOS';
  }

  function normalizePrepRoles(raw) {
    if (!raw) return [];
    var list = Array.isArray(raw) ? raw : String(raw).split(/[,;|]+/);
    var out = [];
    list.forEach(function (r) {
      var k = String(r || '')
        .trim()
        .toLowerCase();
      if (MP_PREP_ROLES.indexOf(k) >= 0 && out.indexOf(k) < 0) out.push(k);
    });
    return out;
  }

  function inferPrepRolesFromMp(mp) {
    if (!mp || !mp.nombre || mp.esReventaPos || isMpElaboradoCatalog(mp)) return ['insumo'];
    var cat = normalizeCategoriaMp(mp.categoria);
    if (MP_COCINA_EXCLUIDAS.indexOf(cat) >= 0) return ['insumo'];
    var roles = [];
    if (cat === 'PROTEINAS' || num(mp.mermaDespostePct) > 0) roles.push('despiece');
    if (MP_COCCION_CATS.indexOf(cat) >= 0 || num(mp.mermaCoccionPct) > 0) roles.push('coccion');
    if (!roles.length) roles.push('insumo');
    return roles;
  }

  function effectivePrepRoles(mp) {
    if (!mp) return [];
    if (mp.prepRolesManual && mp.prepRoles && mp.prepRoles.length) return normalizePrepRoles(mp.prepRoles);
    return inferPrepRolesFromMp(mp);
  }

  function prepRolesLabel(roles) {
    roles = roles || [];
    if (!roles.length) return 'Automático';
    return roles
      .map(function (r) {
        return MP_PREP_ROLE_LABELS[r] || r;
      })
      .join(' · ');
  }

  function mpAptoDespiece(mp) {
    if (!mp || !mp.nombre || mp.esReventaPos || isMpElaboradoCatalog(mp)) return false;
    return effectivePrepRoles(mp).indexOf('despiece') >= 0;
  }

  function mpAptoCoccion(mp) {
    if (!mp || !mp.nombre || mp.esReventaPos || isMpElaboradoCatalog(mp)) return false;
    return effectivePrepRoles(mp).indexOf('coccion') >= 0;
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

  function mpIdElaboradoSlug(key) {
    var s = String(key || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')
      .slice(0, 64);
    return 'mp_elab_' + (s || Date.now());
  }

  /** MP de producto elaborado (inventario global post-proceso) enlazado al plato de Costos. */
  function ensureMpElaboradoDesdeMenu(slug, opts) {
    opts = opts || {};
    if (!slug) return null;
    var menu = getMenuPlato(slug);
    var nombre = (menu && menu.producto) || String(slug);
    var linked = menu && resolveMpIdForMenuRow(menu);
    if (linked) {
      var exLink = get(linked);
      if (exLink) return exLink;
    }
    var byName = getByNombre(nombre);
    if (byName && String(byName.categoria || '').toUpperCase() === 'ELABORADOS') return byName;
    var id = mpIdElaboradoSlug(slug);
    if (get(id)) return get(id);
    var merged = upsertCatalog(
      {
        id: id,
        nombre: nombre,
        categoria: 'ELABORADOS',
        menuSlug: slug,
        posProductId: menu && menu.posProductId != null ? menu.posProductId : null,
        esElaborado: true,
        activo: true,
      },
      { skipInvMov: true }
    );
    if (!merged) return null;
    var costo = Math.round(num(opts.costoUnit) || num(opts.costoTotal) || 0);
    if (costo > 0) {
      upsertCosteo(
        {
          mpId: merged.id,
          und: opts.und === 'und' || opts.und === 'UNI' ? 'UNI' : 'KG',
          peso: 1,
          precioTotal: costo,
        },
        { origen: 'proceso', skipVariacionCheck: true, skipConfirm: true }
      );
    }
    if (menu && !menu.costeoMpSourceId) {
      updateMenuPlato(slug, { costeoMpSourceId: merged.id });
    }
    var modoMenu = menu ? inferModoProcesoFromMenu(menu) : 'prep_anticipado';
    upsertCatalog(
      { id: merged.id, procesoVenta: modoMenu, menuSlug: slug },
      { skipInvMov: true, skipIdCheck: true }
    );
    if (!opts.silent) emitChanged({ tipo: 'mp-elaborado', slug: slug, mpId: merged.id });
    return get(merged.id) || merged;
  }

  /** Elaborado desde despiece de una MP (cortes / pieza procesada). */
  function ensureMpElaboradoDesdeMp(mpId, opts) {
    opts = opts || {};
    var src = get(mpId);
    if (!src) return null;
    var nombre = String(opts.nombre || src.nombre + ' (procesado)').trim();
    var id = mpIdElaboradoSlug('src_' + mpId);
    if (get(id)) return get(id);
    var dup = getByNombre(nombre);
    if (dup) return dup;
    var merged = upsertCatalog(
      {
        id: id,
        nombre: nombre,
        categoria: 'ELABORADOS',
        mpOrigenId: mpId,
        esElaborado: true,
        activo: true,
      },
      { skipInvMov: true }
    );
    if (!merged) return null;
    var costo = Math.round(num(opts.costoUnit) || num(opts.costoTotal) || 0);
    if (costo > 0) {
      upsertCosteo(
        { mpId: merged.id, und: 'KG', peso: 1, precioTotal: costo },
        { origen: 'proceso', skipVariacionCheck: true, skipConfirm: true }
      );
    }
    return get(merged.id) || merged;
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
        estadoFlujo: p.visibleEnPos === false ? 'borrador' : 'vigente',
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
    patchTrazabilidad: patchTrazabilidad,
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
    inferTipoRecetaFromMenu: inferTipoRecetaFromMenu,
    inferModoProcesoFromMenu: inferModoProcesoFromMenu,
    requiresSesionProceso: requiresSesionProceso,
    inferWorkflowPrepFromMenu: inferWorkflowPrepFromMenu,
    inferPrepCocinaTipo: inferPrepCocinaTipo,
    prepCocinaTipoFromRow: prepCocinaTipoFromRow,
    applyPrepCocinaTipo: applyPrepCocinaTipo,
    autoApplyMenuPrepConfig: autoApplyMenuPrepConfig,
    runPrepCatalogAutomation: runPrepCatalogAutomation,
    getWorkflowPrepForMenu: getWorkflowPrepForMenu,
    menuRowMatchesPrepWorkflow: menuRowMatchesPrepWorkflow,
    getMenuPlatoByPosId: getMenuPlatoByPosId,
    resolveMenuSlugForMp: resolveMenuSlugForMp,
    getProcesoVentaForMp: getProcesoVentaForMp,
    applyProcesoVentaFromMp: applyProcesoVentaFromMp,
    calcMermasProceso: calcMermasProceso,
    evalMermaProcesoAlerta: evalMermaProcesoAlerta,
    getPerdidasProcesoRef: getPerdidasProcesoRef,
    savePerdidasProcesoRef: savePerdidasProcesoRef,
    perdidaEsperadaPct: perdidaEsperadaPct,
    inferMargenErrorPctFromLineas: inferMargenErrorPctFromLineas,
    normalizeMargenErrorFrac: normalizeMargenErrorFrac,
    saveCortesDespiece: saveCortesDespiece,
    normalizeCortesDespiece: normalizeCortesDespiece,
    recetaUsaElaborados: recetaUsaElaborados,
    syncProductoFromPos: syncProductoFromPos,
    removeMenuPlatoByPosId: removeMenuPlatoByPosId,
    getMenuPlato: getMenuPlato,
    addProgramacionPrecio: addProgramacionPrecio,
    addProgramacionMenu: addProgramacionMenu,
    aplicarActualizacionMenuCompleta: aplicarActualizacionMenuCompleta,
    buildPlanActualizacionMenu: buildPlanActualizacionMenu,
    ejecutarProgramacionesMenuPendientes: ejecutarProgramacionesMenuPendientes,
    listProgramacionesMenuAll: listProgramacionesMenuAll,
    formatVigenciaDisplay: formatVigenciaDisplay,
    normalizeVigenciaIso: normalizeVigenciaIso,
    vigenciaEsDue: vigenciaEsDue,
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
    lanzarPlatoAlFlujoPrincipal: lanzarPlatoAlFlujoPrincipal,
    setProductoVisibleEnPos: setProductoVisibleEnPos,
    ensureMpFromPosProducto: ensureMpFromPosProducto,
    ensureMpFromPosVentaDirecta: ensureMpFromPosVentaDirecta,
    ensureMpElaboradoDesdeMenu: ensureMpElaboradoDesdeMenu,
    ensureMpElaboradoDesdeMp: ensureMpElaboradoDesdeMp,
    findPosDirectoForRecepcion: findPosDirectoForRecepcion,
    isMpReventaPos: isMpReventaPos,
    CATEGORIAS_MP: CATEGORIAS_MP,
    CATEGORIA_MP_LABEL: CATEGORIA_MP_LABEL,
    listCategoriasMpAll: listCategoriasMpAll,
    addCategoriaMp: addCategoriaMp,
    getCustomCategoriasMp: getCustomCategoriasMp,
    normalizeCategoriaMp: normalizeCategoriaMp,
    guessCategoriaFromNombre: guessCategoriaFromNombre,
    categoriaMpLabel: categoriaMpLabel,
    renderCategoriaMpOptionsHtml: renderCategoriaMpOptionsHtml,
    mpAptoDespiece: mpAptoDespiece,
    mpAptoCoccion: mpAptoCoccion,
    normalizePrepRoles: normalizePrepRoles,
    inferPrepRolesFromMp: inferPrepRolesFromMp,
    effectivePrepRoles: effectivePrepRoles,
    prepRolesLabel: prepRolesLabel,
    MP_PREP_ROLES: MP_PREP_ROLES,
    MP_PREP_ROLE_LABELS: MP_PREP_ROLE_LABELS,
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
    'ELABORADOS',
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
    ELABORADOS: 'Elaborados / prep',
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
    var el = document.getElementById('crozzo-matriz-mp-css');
    if (!el) {
      el = document.createElement('style');
      el.id = 'crozzo-matriz-mp-css';
      document.head.appendChild(el);
    }
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
      '.crozzo-mp-form input,.crozzo-mp-form select{width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--border);background:var(--bg-card);color:inherit;font-size:13px}' +
      '.crozzo-mp-proceso-sel{min-width:148px;font-size:11px;padding:5px 6px}' +
      '.crozzo-mp-proc-empty{color:var(--text-muted);font-size:11px;text-align:center}' +
      '.crozzo-mp-merma-cell{min-width:118px}' +
      '.crozzo-mp-merma-pair{display:flex;flex-direction:column;gap:4px;font-size:10px}' +
      '.crozzo-mp-merma-pair label{display:flex;align-items:center;gap:4px;color:var(--text-muted);white-space:nowrap}' +
      '.crozzo-mp-merma-pair input{width:52px;padding:3px 5px;font-size:11px;text-align:right}' +
      '.crozzo-mp-cat-field{display:flex;flex-direction:column;gap:6px}' +
      '.crozzo-mp-cat-new{display:none;flex-wrap:wrap;gap:6px;align-items:center}' +
      '.crozzo-mp-cat-new.is-open{display:flex}' +
      '.crozzo-mp-cat-new input{flex:1;min-width:140px}' +
      '.crozzo-mp-prep-grid{display:flex;flex-wrap:wrap;gap:10px 14px;margin-top:4px}' +
      '.crozzo-mp-prep-chk{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:500;color:var(--text-primary);cursor:pointer;white-space:nowrap}' +
      '.crozzo-mp-prep-chk input{margin:0;accent-color:var(--accent)}' +
      '.crozzo-mp-prep-cell{min-width:168px}' +
      '.crozzo-mp-prep-cell .crozzo-mp-prep-grid{flex-direction:column;align-items:flex-start;gap:4px}' +
      '.crozzo-mp-prep-auto{display:inline-block;margin-top:4px;font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);opacity:.85}' +
      '.crozzo-mp-prep-suggest{margin-top:8px}' +
      '.crozzo-mp-prep-model{font-size:12px;color:var(--text-muted);line-height:1.55;margin:0 0 8px;max-width:560px}';
  }

  function prepRoleShort(role) {
    if (role === 'despiece') return 'Partir carnes';
    if (role === 'coccion') return 'Cocinar';
    return 'Solo en recetas';
  }

  function renderPrepRolesChecksHtml(opts) {
    opts = opts || {};
    var C = cat();
    var roles = opts.roles || [];
    var prefix = opts.prefix || '';
    var useId = !!opts.useId;
    return (C && C.MP_PREP_ROLES ? C.MP_PREP_ROLES : ['despiece', 'coccion', 'insumo'])
      .map(function (role) {
        var idAttr = useId && prefix ? ' id="' + esc(prefix + 'Prep' + role) + '"' : '';
        return (
          '<label class="crozzo-mp-prep-chk"' +
          (useId && prefix ? ' for="' + esc(prefix + 'Prep' + role) + '"' : '') +
          '><input type="checkbox" data-mp-prep-role="' +
          role +
          '"' +
          idAttr +
          (roles.indexOf(role) >= 0 ? ' checked' : '') +
          '> ' +
          esc(prepRoleShort(role)) +
          '</label>'
        );
      })
      .join('');
  }

  function readPrepRolesFromRoot(root, scope) {
    scope = scope || root;
    var roles = [];
    scope.querySelectorAll('[data-mp-prep-role]').forEach(function (inp) {
      if (inp.checked) roles.push(inp.getAttribute('data-mp-prep-role'));
    });
    var C = cat();
    return C && C.normalizePrepRoles ? C.normalizePrepRoles(roles) : roles;
  }

  function suggestPrepRolesForForm(root, prefix) {
    var C = cat();
    if (!C || !C.inferPrepRolesFromMp) return;
    var I = mpFormIds(prefix);
    var categoria =
      typeof global.crozzoReadMpCategoriaFromPicker === 'function'
        ? global.crozzoReadMpCategoriaFromPicker(root, prefix)
        : (root.querySelector('#' + I.cat) || {}).value || 'OTRO';
    var mc = num((root.querySelector('#' + I.mc) || {}).value);
    var md = num((root.querySelector('#' + I.md) || {}).value);
    var roles = C.inferPrepRolesFromMp({ categoria: categoria, mermaCoccionPct: mc, mermaDespostePct: md });
    root.querySelectorAll('[data-mp-prep-role]').forEach(function (inp) {
      var r = inp.getAttribute('data-mp-prep-role');
      inp.checked = roles.indexOf(r) >= 0;
    });
    toast('Sugerido según categoría y mermas', 'info');
  }

  function renderPrepRolesCell(it) {
    var C = cat();
    if (!C) return '<td class="crozzo-mp-proc-empty">—</td>';
    if (it.esElaborado || String(it.categoria || '').toUpperCase() === 'ELABORADOS') {
      return '<td class="crozzo-mp-proc-empty" title="Salida de sub-receta — no es insumo comprado">Sub-receta</td>';
    }
    var eff = C.effectivePrepRoles ? C.effectivePrepRoles(it) : [];
    return (
      '<td class="crozzo-mp-prep-cell"><div class="crozzo-mp-prep-grid">' +
      renderPrepRolesChecksHtml({ roles: eff }) +
      '</div>' +
      (it.prepRolesManual
        ? ''
        : '<span class="crozzo-mp-prep-auto" title="Inferido por categoría y mermas">Automático</span>') +
      '</td>'
    );
  }

  function chipLabel(c, C) {
    if (C && C.categoriaMpLabel) return C.categoriaMpLabel(c);
    return CAT_LABEL[c] || c;
  }

  function buildChipsHtml(all) {
    var C = cat();
    var counts = {};
    all.forEach(function (x) {
      var c = x.categoria || 'OTRO';
      counts[c] = (counts[c] || 0) + 1;
    });
    var order = C && C.listCategoriasMpAll ? C.listCategoriasMpAll() : CATEGORIAS.concat(['OTRO']);
    var chips =
      '<button type="button" class="crozzo-mod-chip crozzo-mp-chip' +
      (ui.cat === '' ? ' is-active' : '') +
      '" data-mp-cat="">Todas (' +
      all.length +
      ')</button>';
    order.forEach(function (c) {
      var n = counts[c] || 0;
      if (!n) return;
      chips +=
        '<button type="button" class="crozzo-mod-chip crozzo-mp-chip' +
        (ui.cat === c ? ' is-active' : '') +
        '" data-mp-cat="' +
        esc(c) +
        '">' +
        esc(chipLabel(c, C)) +
        ' (' +
        n +
        ')</button>';
    });
    Object.keys(counts).forEach(function (c) {
      if (order.indexOf(c) >= 0 || !counts[c]) return;
      chips +=
        '<button type="button" class="crozzo-mod-chip crozzo-mp-chip' +
        (ui.cat === c ? ' is-active' : '') +
        '" data-mp-cat="' +
        esc(c) +
        '">' +
        esc(chipLabel(c, C)) +
        ' (' +
        counts[c] +
        ')</button>';
    });
    return chips;
  }

  function refreshCategoryChips(root) {
    var row = root.querySelector('.crozzo-mp-chips');
    if (!row) return;
    row.innerHTML = buildChipsHtml(buildCatalog());
  }

  function resolveNewFormCategoria(root, C) {
    var sel = root.querySelector('#crozzoMpNewCat');
    var catVal = (sel && sel.value) || 'OTRO';
    if (catVal !== '__NEW_MP_CAT__') return catVal;
    var customName = ((root.querySelector('#crozzoMpNewCatName') || {}).value || '').trim();
    if (!customName) return null;
    if (!C.addCategoriaMp) return customName.toUpperCase();
    var cr = C.addCategoriaMp(customName);
    if (!cr.ok) {
      toast(cr.msg || 'No se pudo crear la categoría', 'warning');
      return null;
    }
    if (sel) {
      sel.innerHTML = C.renderCategoriaMpOptionsHtml
        ? C.renderCategoriaMpOptionsHtml(cr.key)
        : sel.innerHTML;
      sel.value = cr.key;
    }
    var wrap = root.querySelector('#crozzoMpNewCatCustom');
    if (wrap) wrap.classList.remove('is-open');
    var nameInp = root.querySelector('#crozzoMpNewCatName');
    if (nameInp) nameInp.value = '';
    refreshCategoryChips(root);
    if (!cr.existed) toast('Categoría «' + cr.label + '» creada', 'success');
    return cr.key;
  }

  function renderCategorySelectHtml(selected, allowNew) {
    var C = cat();
    if (C && C.renderCategoriaMpOptionsHtml) {
      return C.renderCategoriaMpOptionsHtml(selected, { allowNew: allowNew !== false });
    }
    return CATEGORIAS.map(function (c) {
      return (
        '<option value="' +
        esc(c) +
        '"' +
        (selected === c ? ' selected' : '') +
        '>' +
        esc(CAT_LABEL[c] || c) +
        '</option>'
      );
    }).join('');
  }
  function buildCatalog() {
    var C = cat();
    return C && C.listCatalog ? C.listCatalog() : C && C.list ? C.list() : [];
  }

  function filterItems(items) {
    var matchFn = global.CrozzoCostosSearch && global.CrozzoCostosSearch.match;
    var q = ui.q.trim();
    return items.filter(function (it) {
      if (ui.cat && it.categoria !== ui.cat) return false;
      if (!q) return true;
      var prov = proveedoresToStr(it.proveedores);
      var blob = [it.nombre, it.categoria, it.id, it.und, prov, CAT_LABEL[it.categoria] || ''].join(' ');
      return matchFn ? matchFn(blob, q) : String(it.nombre).toLowerCase().indexOf(q.toLowerCase()) >= 0;
    });
  }

  function renderProcesoCell(it) {
    var C = cat();
    if (!C) return '<td class="crozzo-mp-proc-empty">—</td>';
    var slug = C.resolveMenuSlugForMp ? C.resolveMenuSlugForMp(it.id) : null;
    var isElab = it.esElaborado || String(it.categoria || '').toUpperCase() === 'ELABORADOS';
    if (!slug && !isElab) {
      return '<td class="crozzo-mp-proc-empty" title="En Costos defina receta/plato o marque como ELABORADOS">—</td>';
    }
    var val = (C.getProcesoVentaForMp && C.getProcesoVentaForMp(it.id)) || 'prep_anticipado';
    return (
      '<td><select class="crozzo-mp-inp crozzo-mp-proceso-sel" data-mp-field="procesoVenta" data-mp-menu-slug="' +
      esc(slug || '') +
      '" title="Preparación anticipada = bodega ELABORADOS · Al vender = plato al momento">' +
      '<option value="prep_anticipado"' +
      (val === 'prep_anticipado' ? ' selected' : '') +
      '>Preparación anticipada (bodega)</option>' +
      '<option value="bajo_demanda"' +
      (val === 'bajo_demanda' ? ' selected' : '') +
      '>Al vender (plato)</option>' +
      '</select></td>'
    );
  }

  function renderMermaCell(it) {
    var mc = it.mermaCoccionPct != null && it.mermaCoccionPct !== '' ? num(it.mermaCoccionPct) : '';
    var md = it.mermaDespostePct != null && it.mermaDespostePct !== '' ? num(it.mermaDespostePct) : '';
    return (
      '<td class="crozzo-mp-merma-cell"><div class="crozzo-mp-merma-pair">' +
      '<label title="Merma esperada al cocinar">Coc %' +
      '<input class="crozzo-mp-inp" type="number" min="0" max="95" step="0.1" data-mp-field="mermaCoccionPct" value="' +
      esc(mc) +
      '"></label>' +
      '<label title="Merma esperada al despostar/desgrado">Desp %' +
      '<input class="crozzo-mp-inp" type="number" min="0" max="95" step="0.1" data-mp-field="mermaDespostePct" value="' +
      esc(md) +
      '"></label></div></td>'
    );
  }

  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }

  function renderRows(items) {
    var C = cat();
    if (!items.length) {
      return '<tr><td colspan="7" style="text-align:center;padding:24px;opacity:.7">Sin insumos. Use + Materia prima.</td></tr>';
    }
    return items
      .map(function (it) {
        var catOpts = renderCategorySelectHtml(it.categoria, false);
        return (
          '<tr data-mp-id="' +
          esc(it.id) +
          '">' +
          '<td><select class="crozzo-mp-inp crozzo-mp-cat-sel" data-mp-field="categoria" title="Clasifique bien: define en qué pantalla de cocina aparece">' +
          catOpts +
          '</select></td>' +
          '<td><input class="crozzo-mp-inp" data-mp-field="nombre" value="' +
          esc(it.nombre) +
          '"></td>' +
          renderPrepRolesCell(it) +
          renderProcesoCell(it) +
          renderMermaCell(it) +
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
    var chips = buildChipsHtml(all);

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
      '<div class="crozzo-mod-toolbar-bar"><div class="crozzo-mod-toolbar crozzo-costos-search-row">' +
      '<input type="search" id="crozzoMpSearch" placeholder="Buscar MP, categoría, proveedor… (ej. lacteos queso)" value="' +
      esc(ui.q) +
      '" autocomplete="off">' +
      '<span class="form-hint">' +
      filtered.length +
      ' / ' +
      all.length +
      '</span>' +
      newBtn +
      '</div></div>' +
      renderNewMpFormHtml({ prefix: 'crozzoMp', includeCosteo: false, open: false }) +
      '<div class="crozzo-mod-chip-row crozzo-mp-chips">' +
      chips +
      '</div>' +
      '<p class="crozzo-mp-meta"><strong>Insumo comprado</strong> → marque dónde aparece en Centro de producción. <strong>Sub-receta</strong> (salsa, adobo, cocido) se crea en Recetas con ingredientes — no aquí. <strong>Plato de carta</strong> = lo que sale a mesas.</p>' +
      '<div class="crozzo-mp-scroll"><table class="crozzo-mp-table"><thead><tr>' +
      '<th>Categoría</th><th>Materia prima</th><th>Cocina bodega</th><th>Proceso / venta</th><th>Mermas esp.</th><th>Proveedor(es)</th><th></th>' +
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
      else if (f === 'procesoVenta') row.procesoVenta = inp.value;
      else if (f === 'mermaCoccionPct' || f === 'mermaDespostePct') row[f] = inp.value === '' ? null : num(inp.value);
      else row[f] = inp.value;
    });
    row.prepRoles = readPrepRolesFromRoot(null, tr);
    if (base.prepRolesManual) row.prepRolesManual = true;
    return row;
  }

  function refreshTable(root) {
    var tbody = root.querySelector('#crozzoMpTbody');
    if (!tbody) return;
    var filtered = filterItems(buildCatalog());
    tbody.innerHTML = renderRows(filtered);
    refreshCategoryChips(root);
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
        if (root.isConnected) {
          refreshTable(root);
          refreshCategoryChips(root);
        }
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
      var del = e.target.closest('.crozzo-mp-del');
      if (del && C.remove(del.getAttribute('data-mp-id'))) {
        refreshTable(root);
        toast('Eliminada del catálogo', 'success');
      }
    });

    root.addEventListener(
      'change',
      function (e) {
        var prepInp = e.target.closest('[data-mp-prep-role]');
        if (prepInp) {
          var trPrep = prepInp.closest('tr[data-mp-id]');
          if (!trPrep) return;
          var itemPrep = getItemFromRow(trPrep);
          if (!itemPrep) return;
          itemPrep.prepRolesManual = true;
          C.upsertCatalog(itemPrep, { skipInvMov: true, skipIdCheck: true });
          toast('Uso en cocina actualizado', 'success');
          refreshTable(root);
          return;
        }
        var inp = e.target.closest('[data-mp-field]');
        if (!inp) return;
        var tr = inp.closest('tr[data-mp-id]');
        if (!tr) return;
        var item = getItemFromRow(tr);
        if (!item) return;
        if (inp.getAttribute('data-mp-field') === 'procesoVenta') {
          var slug =
            inp.getAttribute('data-mp-menu-slug') ||
            (C.resolveMenuSlugForMp ? C.resolveMenuSlugForMp(item.id) : '');
          if (C.applyProcesoVentaFromMp) {
            C.applyProcesoVentaFromMp(slug, item.procesoVenta, { mpId: item.id });
          } else {
            C.upsertCatalog({ id: item.id, procesoVenta: item.procesoVenta }, { skipInvMov: true, skipIdCheck: true });
          }
          toast(
            item.procesoVenta === 'bajo_demanda'
              ? 'Proceso al vender — se prepara al pedido'
              : 'Preparación anticipada — queda en bodega ELABORADOS',
            'success'
          );
          return;
        }
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

    bindNewMpForm(root, {
      prefix: 'crozzoMp',
      onSaved: function () {
        refreshTable(root);
        refreshCategoryChips(root);
      },
    });
  }

  var MP_UND_OPTS = ['GR', 'MG', 'KG', 'ML', 'UNI', 'UND', 'TARRO', 'PAQ', 'CAJA', 'MT', 'ROLLO', 'PAR'];

  function mpFormIds(prefix) {
    prefix = prefix || 'crozzoMp';
    return {
      form: prefix + 'NewForm',
      toggle: prefix + 'ToggleNew',
      nombre: prefix + 'NewNombre',
      cat: prefix + 'NewCat',
      catSearch: prefix + 'CatSearch',
      catGrid: prefix + 'CatGrid',
      catCustom: prefix + 'NewCatCustom',
      catName: prefix + 'NewCatName',
      addCat: prefix + 'AddCat',
      prov: prefix + 'NewProvExtra',
      provSearch: prefix + 'ProvSearch',
      provGrid: prefix + 'ProvGrid',
      mc: prefix + 'NewMc',
      md: prefix + 'NewMd',
      und: prefix + 'NewUnd',
      peso: prefix + 'NewPeso',
      precio: prefix + 'NewPrecioTotal',
      save: prefix + 'SaveNew',
      cancel: prefix + 'CancelNew',
      prSuggest: prefix + 'SuggestPrep',
    };
  }

  function toggleMpCreateForm(formEl, open) {
    if (!formEl) return;
    if (open === true) formEl.classList.add('is-open');
    else if (open === false) formEl.classList.remove('is-open');
    else formEl.classList.toggle('is-open');
  }
  global.crozzoToggleMpCreateForm = toggleMpCreateForm;

  function renderNewMpFormHtml(opts) {
    opts = opts || {};
    var prefix = opts.prefix || 'crozzoMp';
    var I = mpFormIds(prefix);
    var includeCosteo = !!opts.includeCosteo;
    var title = opts.title || 'Nueva materia prima';
    var hint =
      opts.hint ||
      (includeCosteo
        ? 'Queda en catálogo y costeo. El precio unitario se calcula al guardar (lote ÷ peso).'
        : 'Queda en catálogo. Defina peso y precio en la pestaña Costeo MP.');
    var undOpts = MP_UND_OPTS.map(function (u) {
      return '<option value="' + u + '"' + (u === 'GR' ? ' selected' : '') + '>' + u + '</option>';
    }).join('');
    var costeoSection = includeCosteo
      ? '<section class="crozzo-mp-create__section">' +
        '<div class="crozzo-mp-create__section-head">' +
        '<span class="crozzo-mp-create__section-icon" aria-hidden="true">⚖</span>' +
        '<h4 class="crozzo-mp-create__section-title">Costeo inicial</h4></div>' +
        '<div class="crozzo-mp-create__grid">' +
        '<div class="crozzo-mp-create__field">' +
        '<label class="crozzo-mp-create__label" for="' +
        I.und +
        '">Unidad de compra</label>' +
        '<select id="' +
        I.und +
        '" class="form-select">' +
        undOpts +
        '</select></div>' +
        '<div class="crozzo-mp-create__field">' +
        '<label class="crozzo-mp-create__label" for="' +
        I.peso +
        '">Peso / referencia</label>' +
        '<input id="' +
        I.peso +
        '" class="form-input" type="number" min="0" step="any" placeholder="Ej. 1000">' +
        '<span class="crozzo-mp-create__hint">Gramos, ml o unidades del lote comprado.</span></div>' +
        '<div class="crozzo-mp-create__field">' +
        '<label class="crozzo-mp-create__label" for="' +
        I.precio +
        '">Precio total del lote</label>' +
        '<input id="' +
        I.precio +
        '" class="form-input" type="number" min="0" step="any" placeholder="Ej. 45000">' +
        '<span class="crozzo-mp-create__hint">Lo pagado por ese peso o empaque.</span></div></div></section>'
      : '';
    return (
      '<article class="crozzo-mp-create" id="' +
      I.form +
      '" aria-label="' +
      esc(title) +
      '">' +
      '<header class="crozzo-mp-create__head">' +
      '<p class="crozzo-mp-create__eyebrow">Alta de insumo</p>' +
      '<h3 class="crozzo-mp-create__title">' +
      esc(title) +
      '</h3>' +
      '<p class="crozzo-mp-create__sub">' +
      esc(hint) +
      '</p></header>' +
      '<div class="crozzo-mp-create__body">' +
      '<section class="crozzo-mp-create__section">' +
      '<div class="crozzo-mp-create__section-head">' +
      '<span class="crozzo-mp-create__section-icon" aria-hidden="true">◈</span>' +
      '<h4 class="crozzo-mp-create__section-title">Identificación</h4></div>' +
      '<div class="crozzo-mp-create__grid">' +
      '<div class="crozzo-mp-create__field crozzo-mp-create__field--span">' +
      '<label class="crozzo-mp-create__label" for="' +
      I.nombre +
      '">Nombre del insumo</label>' +
      '<input id="' +
      I.nombre +
      '" class="form-input" placeholder="Ej. Aceite vegetal, Pechuga de pollo…" autocomplete="off"></div>' +
      '<div class="crozzo-mp-create__field crozzo-mp-create__field--span">' +
      '<span class="crozzo-mp-create__label">Categoría</span>' +
      (typeof global.renderMpCategoriaPickerHtml === 'function'
        ? global.renderMpCategoriaPickerHtml(prefix, 'OTRO')
        : '<div class="crozzo-mp-create__cat-box"><select id="' +
          I.cat +
          '" class="form-select">' +
          renderCategorySelectHtml('OTRO', true) +
          '</select><div class="crozzo-mp-create__cat-new" id="' +
          I.catCustom +
          '"><input id="' +
          I.catName +
          '" class="form-input" placeholder="Nombre nueva categoría (ej. Especias)">' +
          '<button type="button" class="btn btn-outline btn-sm" id="' +
          I.addCat +
          '">Crear categoría</button></div></div>') +
      '<span class="crozzo-mp-create__hint">Define en qué pantalla de cocina aparece el insumo. Puede crear categorías nuevas.</span></div></div></section>' +
      '<section class="crozzo-mp-create__section">' +
      '<div class="crozzo-mp-create__section-head">' +
      '<span class="crozzo-mp-create__section-icon" aria-hidden="true">👨‍🍳</span>' +
      '<h4 class="crozzo-mp-create__section-title">Uso en cocina (bodega)</h4></div>' +
      '<p class="crozzo-mp-prep-model">Insumo <strong>comprado</strong> sin receta. Las <strong>sub-recetas</strong> (salsa, adobo, carne cocida) se arman en <em>Recetas</em> con ingredientes. Puede marcar varios usos.</p>' +
      '<div class="crozzo-mp-prep-grid" id="' +
      I.form +
      '-prep">' +
      renderPrepRolesChecksHtml({ prefix: prefix, useId: true }) +
      '</div>' +
      '<div class="crozzo-mp-prep-suggest">' +
      '<button type="button" class="btn btn-outline btn-sm" id="' +
      I.prSuggest +
      '">Sugerir según categoría</button>' +
      '<span class="crozzo-mp-create__hint" style="display:inline;margin-left:8px">Sin marcar = automático al guardar.</span></div></section>' +
      costeoSection +
      '<section class="crozzo-mp-create__section">' +
      '<div class="crozzo-mp-create__section-head">' +
      '<span class="crozzo-mp-create__section-icon" aria-hidden="true">🏭</span>' +
      '<h4 class="crozzo-mp-create__section-title">Abastecimiento</h4></div>' +
      '<div class="crozzo-mp-create__field crozzo-mp-create__field--span">' +
      '<span class="crozzo-mp-create__label">Proveedor(es)</span>' +
      (typeof global.renderMpProveedorPickerHtml === 'function'
        ? global.renderMpProveedorPickerHtml(prefix)
        : '<input id="' +
          I.prov +
          '" class="form-input" placeholder="Distribuidora Norte, Mayorista Sol…">') +
      '<span class="crozzo-mp-create__hint">Seleccione del directorio, dé de alta uno nuevo o abra el módulo de proveedores.</span></div></section>' +
      '<section class="crozzo-mp-create__section">' +
      '<div class="crozzo-mp-create__section-head">' +
      '<span class="crozzo-mp-create__section-icon" aria-hidden="true">%</span>' +
      '<h4 class="crozzo-mp-create__section-title">Mermas esperadas</h4></div>' +
      '<div class="crozzo-mp-create__merma-grid">' +
      '<div class="crozzo-mp-create__field">' +
      '<label class="crozzo-mp-create__label" for="' +
      I.mc +
      '">Merma cocinado</label>' +
      '<input id="' +
      I.mc +
      '" class="form-input" type="number" min="0" max="95" step="0.1" placeholder="Ej. 28">' +
      '<span class="crozzo-mp-create__hint">% pérdida al cocinar.</span></div>' +
      '<div class="crozzo-mp-create__field">' +
      '<label class="crozzo-mp-create__label" for="' +
      I.md +
      '">Merma desposte</label>' +
      '<input id="' +
      I.md +
      '" class="form-input" type="number" min="0" max="95" step="0.1" placeholder="Ej. 12">' +
      '<span class="crozzo-mp-create__hint">% pérdida al limpiar o partir.</span></div></div></section></div>' +
      '<footer class="crozzo-mp-create__foot">' +
      '<button type="button" class="btn btn-outline btn-sm" id="' +
      I.cancel +
      '">Cancelar</button>' +
      '<button type="button" class="btn btn-primary btn-sm" id="' +
      I.save +
      '">Guardar materia prima</button></footer></article>'
    );
  }

  function resolveNewFormCategoriaPrefixed(root, C, prefix) {
    var I = mpFormIds(prefix);
    var sel = root.querySelector('#' + I.cat);
    var catVal = (sel && sel.value) || 'OTRO';
    if (catVal !== '__NEW_MP_CAT__') return catVal;
    var customName = ((root.querySelector('#' + I.catName) || {}).value || '').trim();
    if (!customName) return null;
    if (!C.addCategoriaMp) return customName.toUpperCase();
    var cr = C.addCategoriaMp(customName);
    if (!cr.ok) {
      toast(cr.msg || 'No se pudo crear la categoría', 'warning');
      return null;
    }
    if (sel) {
      sel.innerHTML = C.renderCategoriaMpOptionsHtml ? C.renderCategoriaMpOptionsHtml(cr.key) : sel.innerHTML;
      sel.value = cr.key;
    }
    var wrap = root.querySelector('#' + I.catCustom);
    if (wrap) wrap.classList.remove('is-open');
    var nameInp = root.querySelector('#' + I.catName);
    if (nameInp) nameInp.value = '';
    if (!cr.existed) toast('Categoría «' + cr.label + '» creada', 'success');
    return cr.key;
  }

  function saveNewMpFromForm(root, C, opts) {
    opts = opts || {};
    var I = mpFormIds(opts.prefix);
    var nombre = ((root.querySelector('#' + I.nombre) || {}).value || '').trim();
    if (!nombre) {
      toast('Escriba el nombre', 'warning');
      return null;
    }
    var categoria =
      typeof global.crozzoReadMpCategoriaFromPicker === 'function'
        ? global.crozzoReadMpCategoriaFromPicker(root, opts.prefix)
        : resolveNewFormCategoriaPrefixed(root, C, opts.prefix);
    if (!categoria) {
      toast('Elija categoría o escriba el nombre de una nueva', 'warning');
      return null;
    }
    var provList =
      typeof global.crozzoReadMpProveedoresFromPicker === 'function'
        ? global.crozzoReadMpProveedoresFromPicker(root, opts.prefix)
        : [];
    var prepScope = root.querySelector('#' + I.form + '-prep') || root;
    var prepRoles = readPrepRolesFromRoot(root, prepScope);
    var anyPrepChecked = prepScope.querySelector('[data-mp-prep-role]:checked');
    var item = {
      id: C.slugId(nombre),
      nombre: nombre,
      categoria: categoria,
      proveedores: C.parseProveedores ? C.parseProveedores(provList) : provList,
      mermaCoccionPct: num((root.querySelector('#' + I.mc) || {}).value),
      mermaDespostePct: num((root.querySelector('#' + I.md) || {}).value),
    };
    if (anyPrepChecked && prepRoles.length) {
      item.prepRoles = prepRoles;
      item.prepRolesManual = true;
    }
    C.upsertCatalog(item);
    if (opts.includeCosteo && C.upsertCosteo) {
      var undEl = root.querySelector('#' + I.und);
      var pesoEl = root.querySelector('#' + I.peso);
      var precioEl = root.querySelector('#' + I.precio);
      C.upsertCosteo({
        mpId: item.id,
        und: (undEl && undEl.value) || 'GR',
        peso: num(pesoEl && pesoEl.value, 1000),
        precioTotal: num(precioEl && precioEl.value, 0),
      });
    }
    toast(
      '«' +
        item.nombre +
        '» creada' +
        (opts.includeCosteo ? ' con costeo inicial' : '. Defina peso y precio en Costeo MP') +
        '.',
      'success'
    );
    var nf = root.querySelector('#' + I.form);
    toggleMpCreateForm(nf, false);
    if (root.querySelector('#' + I.nombre)) root.querySelector('#' + I.nombre).value = '';
    root.querySelectorAll('.' + opts.prefix + 'ProvPick').forEach(function (el) {
      el.checked = false;
    });
    if (root.querySelector('#' + I.prov)) root.querySelector('#' + I.prov).value = '';
    if (typeof global.crozzoMpRefreshProvPickerGrid === 'function') {
      global.crozzoMpRefreshProvPickerGrid(opts.prefix, root, '');
    }
    if (typeof global.crozzoMpRefreshCatPickerGrid === 'function') {
      global.crozzoMpRefreshCatPickerGrid(opts.prefix, root, '', 'OTRO');
    }
    if (opts.onSaved) opts.onSaved(item);
    return item;
  }

  function bindNewMpForm(root, opts) {
    if (!root) return;
    opts = opts || {};
    var prefix = opts.prefix || 'crozzoMp';
    var bindKey = '_mpNewFormBound_' + prefix;
    if (root[bindKey]) return;
    root[bindKey] = true;
    var C = cat();
    if (!C) return;
    var I = mpFormIds(prefix);
    root.addEventListener('click', function (e) {
      if (e.target.id === I.toggle) {
        var f = root.querySelector('#' + I.form);
        toggleMpCreateForm(f);
        if (f && f.classList.contains('is-open')) {
          if (typeof global.crozzoMpRefreshProvPickerGrid === 'function') {
            global.crozzoMpRefreshProvPickerGrid(prefix, root, '');
          }
          if (typeof global.crozzoMpRefreshCatPickerGrid === 'function') {
            global.crozzoMpRefreshCatPickerGrid(prefix, root, '', 'OTRO');
          }
        }
        return;
      }
      if (e.target.id === I.addCat) {
        var catName = ((root.querySelector('#' + I.catName) || {}).value || '').trim();
        if (!catName) {
          toast('Escriba el nombre de la categoría', 'warning');
          return;
        }
        if (!C.addCategoriaMp) {
          toast('No disponible', 'error');
          return;
        }
        var catRes = C.addCategoriaMp(catName);
        if (!catRes.ok) {
          toast(catRes.msg || 'No se pudo crear', 'warning');
          return;
        }
        var catSel = root.querySelector('#' + I.cat);
        if (catSel) {
          catSel.innerHTML = C.renderCategoriaMpOptionsHtml ? C.renderCategoriaMpOptionsHtml(catRes.key) : catSel.innerHTML;
          catSel.value = catRes.key;
        }
        var catWrap = root.querySelector('#' + I.catCustom);
        if (catWrap) catWrap.classList.remove('is-open');
        var catInp = root.querySelector('#' + I.catName);
        if (catInp) catInp.value = '';
        toast(catRes.existed ? 'La categoría ya existía' : 'Categoría «' + catRes.label + '» creada', 'success');
        return;
      }
      if (e.target.id === I.cancel) {
        var form = root.querySelector('#' + I.form);
        toggleMpCreateForm(form, false);
        return;
      }
      if (e.target.id === I.save) {
        saveNewMpFromForm(root, C, opts);
      }
      if (e.target.id === I.prSuggest) {
        suggestPrepRolesForForm(root, prefix);
      }
    });
    root.addEventListener('change', function (e) {
      if (e.target.classList && e.target.classList.contains(prefix + 'CatPick')) {
        var hidden = root.querySelector('#' + I.cat);
        if (hidden) hidden.value = e.target.value;
        return;
      }
      if (e.target.id === I.cat) {
        var customWrap = root.querySelector('#' + I.catCustom);
        if (customWrap) customWrap.classList.toggle('is-open', e.target.value === '__NEW_MP_CAT__');
      }
    });
    if (typeof global.crozzoMpRefreshProvPickerGrid === 'function') {
      global.crozzoMpRefreshProvPickerGrid(prefix, root, '');
    }
    if (typeof global.crozzoMpRefreshCatPickerGrid === 'function') {
      global.crozzoMpRefreshCatPickerGrid(prefix, root, '', 'OTRO');
    }
  }

  function openNewMpForm(root, prefix) {
    if (!root) return;
    var I = mpFormIds(prefix || 'crozzoMp');
    var f = root.querySelector('#' + I.form);
    toggleMpCreateForm(f, true);
    if (typeof global.crozzoMpRefreshProvPickerGrid === 'function') {
      global.crozzoMpRefreshProvPickerGrid(prefix || 'crozzoMp', root, '');
    }
    if (typeof global.crozzoMpRefreshCatPickerGrid === 'function') {
      global.crozzoMpRefreshCatPickerGrid(prefix || 'crozzoMp', root, '', 'OTRO');
    }
  }

  global.CrozzoMatrizMp = {
    buildCatalog: buildCatalog,
    renderPanel: renderPanel,
    renderNewMpFormHtml: renderNewMpFormHtml,
    bindNewMpForm: bindNewMpForm,
    openNewMpForm: openNewMpForm,
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
      '.crozzo-costeo-badge{display:inline-block;font-size:9px;font-weight:700;padding:2px 6px;border-radius:4px;background:rgba(76,175,80,.15);color:#4caf50;margin-left:6px;vertical-align:middle}' +
      '.crozzo-costos-search-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px}' +
      '.crozzo-costos-search-row .crozzo-mod-toolbar input[type=search]{flex:1;min-width:180px}' +
      '.crozzo-costos-create-btn{min-width:36px;width:36px;height:36px;padding:0;font-size:1.25rem;line-height:1;font-weight:700;border-radius:10px;flex-shrink:0}';
    document.head.appendChild(el);
  }

  function buildRows() {
    var C = cat();
    return C && C.list ? C.list() : [];
  }

  function filterItems(items) {
    var matchFn = global.CrozzoCostosSearch && global.CrozzoCostosSearch.match;
    var q = ui.q.trim();
    if (!q) return items;
    return items.filter(function (it) {
      var blob = [it.nombre, it.categoria, it.id, it.und, it.precioUnit, it.precioTotal].join(' ');
      return matchFn ? matchFn(blob, q) : String(it.nombre).toLowerCase().indexOf(q.toLowerCase()) >= 0;
    });
  }

  function recepcionBadge(it) {
    if (!it.ultimaRecepcionAt) return '';
    var d = String(it.ultimaRecepcionAt).slice(0, 10);
    return '<span class="crozzo-costeo-badge" title="Actualizado por recepción ' + esc(d) + '">Recepción</span>';
  }

  function renderRows(items) {
    if (!items.length) {
      return '<tr><td colspan="5" style="text-align:center;padding:24px;opacity:.7">Sin insumos. Use <strong>+ Nueva materia prima</strong> arriba para crear la primera.</td></tr>';
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
          '<td class="crozzo-costeo-nombre" title="Nombre del insumo">' +
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
        '<button type="button" class="btn btn-outline btn-sm" id="crozzoCosteoGoRecepcion">Entrada factura</button></nav>';
    var newForm =
      global.CrozzoMatrizMp && global.CrozzoMatrizMp.renderNewMpFormHtml
        ? global.CrozzoMatrizMp.renderNewMpFormHtml({
            prefix: 'crozzoCosteoMp',
            includeCosteo: true,
            open: false,
            title: 'Nueva materia prima',
            hint: 'Alta con costeo: unidad, lote y precio. El $/g o $/ml se calcula al guardar.',
          })
        : '';
    var panelHead =
      embedded && all.length >= 0
        ? '<p class="crozzo-costos-note" style="margin:0 0 12px">Edite <strong>precio del lote</strong> y <strong>peso de referencia</strong>; el sistema calcula $/g o $/ml. ' +
          esc(String(all.length)) +
          ' insumos registrados.</p>'
        : '';
    return (
      '<div class="crozzo-mod-page crozzo-costeo-root' +
      (embedded ? ' crozzo-mod-embedded' : '') +
      '">' +
      chrome +
      panelHead +
      '<div class="crozzo-mod-toolbar-bar"><div class="crozzo-mod-toolbar crozzo-costos-search-row">' +
      '<input type="search" id="crozzoCosteoSearch" placeholder="Buscar MP por nombre, categoría o código…" value="' +
      esc(ui.q) +
      '" autocomplete="off">' +
      '<button type="button" class="btn btn-primary btn-sm crozzo-costos-create-btn" id="crozzoCosteoMpToggleNew" title="Nueva materia prima" aria-label="Nueva materia prima">+</button>' +
      '<span class="form-hint">' +
      filtered.length +
      ' / ' +
      all.length +
      '</span></div></div>' +
      newForm +
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

    if (global.CrozzoMatrizMp && global.CrozzoMatrizMp.bindNewMpForm) {
      global.CrozzoMatrizMp.bindNewMpForm(root, {
        prefix: 'crozzoCosteoMp',
        includeCosteo: true,
        onSaved: function () {
          refreshTable(root);
        },
      });
    }

    root.addEventListener('click', function (e) {
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
  var LS_MARGEN_GLOBAL = 'crozzo_costos_margen_global_v1';
  var LS_MARGEN_MINIMO = 'crozzo_costos_margen_minimo_v1';
  var LS_COSTO_GLOBAL = 'crozzo_costos_costo_global_v1';
  var LS_MP_ALERTA_SUBIDA = 'crozzo_costos_mp_alerta_subida_v1';
  var LS_AUTO_POS_MARGEN = 'crozzo_costos_auto_pos_margen_v1';
  var LS_REVISION = 'crozzo_costos_revision_v1';
  var DEFAULT_MARGEN_GLOBAL_PCT = 20;
  var DEFAULT_MARGEN_MINIMO_PCT = 10;
  var DEFAULT_COSTO_GLOBAL_PCT = 80;
  var DEFAULT_MP_ALERTA_SUBIDA_PCT = 10;
  var PRECIO_MENU_PASO = 100;

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
      subtitle: 'Mermas MP · recetas · procesos cocina → matriz y proveedores',
      icon: '📋',
      roles: ['chef', 'gerente', 'jefe-compras'],
      status: 'conectado',
      navigate: 'compras-cortes',
      sources: ['Catalogo MP', 'Procesos', 'Mermas MP'],
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

  var hub = {
    view: 'matriz',
    flowKey: null,
    bound: false,
    seed: null,
    seedLoading: false,
    recetaSlug: null,
    recetaDraftBySlug: {},
    recetaMpCombo: { openLine: null, filters: {}, platoFilter: '', platoOpen: false },
    precioVentaSyncLock: false,
    inventarioUi: { q: '', cat: 'all', tab: 'stock', modo: 'perpetuo', conteoCiego: false, ciclicoAbc: 'pendientes', conteoFecha: '', conteoPor: '', conteoId: null, conteoLineas: null },
    matrizApplying: false,
    matrizCatalogTimer: null,
    matrizAggTimer: null,
    matrizLoadGen: 0,
    _posLookup: null,
    _recetaCostoCache: null,
  };

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

  function invalidateMatrizCaches() {
    hub._posLookup = null;
    hub._recetaCostoCache = null;
  }

  function invalidateSeed() {
    hub.seed = null;
    invalidateMatrizCaches();
  }

  /** Monta la matriz en #mainContent tras el innerHTML de carga (evita carrera sync). */
  function commitMatrizPanel(fresh, loadGen) {
    var run = function () {
      if (loadGen != null && loadGen !== hub.matrizLoadGen) return;
      try {
        hub.seed = fresh || hub.seed || matrizFallbackSeed();
        var host = document.getElementById('mainContent');
        if (!host || hub.view !== 'matriz') return;
        host.innerHTML = renderMatrizPanel(hub.seed);
        host._costosBound = false;
        bindRoot(host);
        initMatrizAllPanels(host, hub.seed);
      } catch (err) {
        console.error('[costos] commitMatrizPanel', err);
        var hostErr = document.getElementById('mainContent');
        if (hostErr && hub.view === 'matriz') {
          hostErr.innerHTML =
            '<div class="card" style="margin:24px;padding:20px;max-width:520px">' +
            '<p style="margin:0 0 8px;font-weight:600">No se pudo cargar la matriz de costos</p>' +
            '<p class="form-hint" style="margin:0 0 14px">' +
            esc(String((err && err.message) || err || 'Error desconocido')) +
            '</p>' +
            '<button type="button" class="btn btn-primary btn-sm" onclick="location.reload()">Recargar</button></div>';
        }
      }
    };
    if (typeof queueMicrotask === 'function') queueMicrotask(run);
    else setTimeout(run, 0);
  }

  function matrizLoadingHtml() {
    return (
      '<div class="crozzo-costos-hub crozzo-matriz-premium">' +
      '<div class="crozzo-matriz-loading" role="status" aria-live="polite">' +
      '<div class="crozzo-matriz-loading__ring" aria-hidden="true"></div>' +
      '<p style="margin:0;font-weight:600">Cargando matriz de costos…</p>' +
      '<p style="margin:8px 0 0;font-size:.82rem;opacity:.75">Matriz de costos y menú</p>' +
      '<p class="crozzo-matriz-loading__hint" style="margin:14px 0 0;font-size:.78rem;opacity:.6">Si tarda más de unos segundos, el sistema reintentará solo.</p></div></div>'
    );
  }

  function getPosPrecioLookup() {
    if (!hub._posLookup) hub._posLookup = buildPosPrecioLookup();
    return hub._posLookup;
  }

  function getRecetaCostoCached(slug, seed, cache) {
    if (!slug) return 0;
    cache = cache || hub._recetaCostoCache || (hub._recetaCostoCache = {});
    if (Object.prototype.hasOwnProperty.call(cache, slug)) return cache[slug];
    var v = calcularCostoMpDesdeReceta(slug, seed);
    cache[slug] = v;
    return v;
  }

  /** Totales + KPIs con debounce (evita recalcular todo el menú en cada tecla). */
  function scheduleMatrizAggregateRefresh(root, seed) {
    hub._matrizAggRoot = root;
    hub._matrizAggSeed = seed || hub.seed;
    if (hub.matrizAggTimer) return;
    hub.matrizAggTimer = setTimeout(function () {
      hub.matrizAggTimer = null;
      var r = hub._matrizAggRoot;
      var s = hub._matrizAggSeed || hub.seed;
      if (r && r.isConnected) {
        refreshResumenTotales(r, s);
        refreshMatrizKpis(r, s);
      }
    }, 160);
  }

  /** Solo barras vs meta y estado — sin reconstruir toda la tabla. */
  function refreshMatrizObjetivoOnly(root, seed) {
    if (!root || !seed) return;
    var e = engine();
    if (!e) return;
    var objFrac = getObjetivoCostoFraccion();
    var listBySlug = {};
    mergeResumenList(seed).forEach(function (row) {
      listBySlug[row.slug] = row;
    });
    root.querySelectorAll('#crozzoResumenTbody tr[data-resumen-slug]').forEach(function (tr) {
      var slug = tr.getAttribute('data-resumen-slug');
      var row = listBySlug[slug];
      if (!row) return;
      var costoMp = readResumenRowCostoMp(tr);
      var precioInp = tr.querySelector('[data-resumen-field="precioVenta"]');
      var precioVenta = Number(precioInp && precioInp.value);
      if (!isFinite(precioVenta)) precioVenta = row.precioVenta;
      var r = e.calcularResumen(costoMp, precioVenta);
      var ev = evaluarPlatoObjetivo(r, row, seed);
      var bar = tr.querySelector('[data-resumen-obj-bar]');
      var ob = tr.querySelector('[data-resumen-obj]');
      if (bar) bar.innerHTML = renderObjetivoBarHtml(r.pctCostoMp, objFrac);
      if (ob) ob.innerHTML = renderMatrizStatusPill(ev);
      var rowCls = ev.bajoTolerancia
        ? 'crozzo-matriz-row--crit'
        : !ev.dentroObjetivo || ev.alertaSubida === 'warn'
          ? 'crozzo-matriz-row--warn'
          : 'crozzo-matriz-row--ok';
      tr.className = rowCls;
      tr.setAttribute(
        'data-matriz-state',
        ev.bajoTolerancia ? 'crit' : !ev.dentroObjetivo || ev.alertaSubida === 'warn' ? 'warn' : 'ok'
      );
    });
    scheduleMatrizAggregateRefresh(root, seed);
  }

  function loadSeed(cb) {
    if (hub.seed && hub.seed.version >= 4) {
      if (cb) cb(hub.seed);
      return Promise.resolve(hub.seed);
    }
    if (hub.seedLoading) {
      global.__crozzoCostosSeedLoading = true;
      return new Promise(function (resolve) {
        var elapsed = 0;
        var t = setInterval(function () {
          elapsed += 80;
          if (hub.seed && hub.seed.version >= 4) {
            clearInterval(t);
            global.__crozzoCostosSeedLoading = false;
            resolve(hub.seed);
            if (cb) cb(hub.seed);
          } else if (!hub.seedLoading || elapsed > 8000) {
            clearInterval(t);
            hub.seedLoading = false;
            global.__crozzoCostosSeedLoading = false;
            hub.seed = { version: 4, precios: {}, resumen: [], demoRecipe: { lineas: [] }, stats: {} };
            if (cb) cb(hub.seed);
            resolve(hub.seed);
          }
        }, 80);
      });
    }
    hub.seedLoading = true;
    global.__crozzoCostosSeedLoading = true;
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
        global.__crozzoCostosSeedLoading = false;
        if (cb) cb(hub.seed);
        return hub.seed;
      })
      .catch(function () {
        hub.seed = { version: 4, precios: {}, resumen: [], demoRecipe: { lineas: [] }, stats: {} };
        hub.seedLoading = false;
        global.__crozzoCostosSeedLoading = false;
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
    patch = patch || {};
    var C = global.CrozzoCatalogoMp;
    if (!C || !C.updateMenuPlato) return;
    var prev = C.getMenuPlato ? C.getMenuPlato(slug) : null;
    C.updateMenuPlato(slug, patch);
    if (C.upsertHistorialCosteoVigente) {
      var row = C.getMenuPlato(slug);
      if (row) {
        C.upsertHistorialCosteoVigente(slug, {
          costoMp: patch.costoMp != null ? patch.costoMp : row.costoMp,
          precioVenta: patch.precioVenta != null ? patch.precioVenta : row.precioVenta,
          costoMpAnterior:
            patch.costoMp != null && prev && Math.abs(Number(prev.costoMp) - Number(patch.costoMp)) >= 1
              ? prev.costoMp
              : undefined,
          precioVentaAnterior:
            patch.precioVenta != null &&
            prev &&
            Math.abs(Number(prev.precioVenta) - Number(patch.precioVenta)) >= 1
              ? prev.precioVenta
              : undefined,
          notas: patch._histNotas || 'Edición en precios vigentes',
        });
      }
    }
  }

  function syncHistorialVigenteForUpdates(updates, notas) {
    var C = global.CrozzoCatalogoMp;
    if (!C || !C.upsertHistorialCosteoVigente || !updates || !updates.length) return 0;
    var n = 0;
    updates.forEach(function (u) {
      if (!u || !u.slug) return;
      var snap = { notas: u.notas || notas || 'Actualización automática' };
      if (u.patch && u.patch.costoMp != null) snap.costoMp = u.patch.costoMp;
      if (u.prevCosto != null) snap.costoMpAnterior = u.prevCosto;
      if (u.patch && u.patch.precioVenta != null) snap.precioVenta = u.patch.precioVenta;
      if (u.mpOrigenId) snap.mpOrigenId = u.mpOrigenId;
      if (u.mpOrigenNombre) snap.mpOrigenNombre = u.mpOrigenNombre;
      if (C.upsertHistorialCosteoVigente(u.slug, snap)) n++;
    });
    return n;
  }

  function refreshMatrizHistorialPanel(root, seed) {
    if (!root) root = document.getElementById('mainContent');
    if (!root) return;
    var histPanel = root.querySelector('[data-matriz-vista-panel="historial"]');
    if (histPanel) {
      histPanel.removeAttribute('data-matriz-lazy');
      histPanel.innerHTML = renderCosteoGuardadoPanel(seed || hub.seed);
    }
  }

  function saveResumenBatch(updates) {
    var C = global.CrozzoCatalogoMp;
    if (C && C.updateMenuPlatosBatch) return C.updateMenuPlatosBatch(updates);
    if (!updates || !updates.length) return 0;
    updates.forEach(function (u) {
      if (u && u.slug) saveResumenEdit(u.slug, u.patch || {});
    });
    return updates.length;
  }

  function loadGlobalMargenPct() {
    try {
      var raw = localStorage.getItem(LS_MARGEN_GLOBAL);
      if (raw == null || raw === '') return DEFAULT_MARGEN_GLOBAL_PCT;
      var n = Number(raw);
      return isFinite(n) && n >= 0 && n < 100 ? n : DEFAULT_MARGEN_GLOBAL_PCT;
    } catch (_) {
      return DEFAULT_MARGEN_GLOBAL_PCT;
    }
  }

  function saveGlobalMargenPct(pctDisplay) {
    try {
      localStorage.setItem(LS_MARGEN_GLOBAL, String(pctDisplay));
    } catch (_) {}
  }

  function loadGlobalMargenMinimoPct() {
    try {
      var raw = localStorage.getItem(LS_MARGEN_MINIMO);
      if (raw == null || raw === '') return DEFAULT_MARGEN_MINIMO_PCT;
      var n = Number(raw);
      return isFinite(n) && n >= 0 && n < 100 ? n : DEFAULT_MARGEN_MINIMO_PCT;
    } catch (_) {
      return DEFAULT_MARGEN_MINIMO_PCT;
    }
  }

  function saveGlobalMargenMinimoPct(pctDisplay) {
    try {
      localStorage.setItem(LS_MARGEN_MINIMO, String(pctDisplay));
      localStorage.setItem(LS_MP_ALERTA_SUBIDA, String(pctDisplay));
    } catch (_) {}
  }

  /** Meta global: % costo MP sobre venta (food cost). Migra desde margen utilidad legacy. */
  function loadGlobalCostoObjetivoPct() {
    try {
      var raw = localStorage.getItem(LS_COSTO_GLOBAL);
      if (raw != null && raw !== '') {
        var n = Number(raw);
        if (isFinite(n) && n > 0 && n < 100) return n;
      }
    } catch (_) {}
    return Math.round((100 - loadGlobalMargenPct()) * 10) / 10;
  }

  function saveGlobalCostoObjetivoPct(pctDisplay) {
    try {
      localStorage.setItem(LS_COSTO_GLOBAL, String(pctDisplay));
      var util = Math.round((100 - Number(pctDisplay)) * 10) / 10;
      if (util >= 0 && util < 100) localStorage.setItem(LS_MARGEN_GLOBAL, String(util));
    } catch (_) {}
  }

  /** Umbral rojo: subida % del costo MP vs costo guardado (naranja = mitad). */
  function loadGlobalMpAlertaSubidaPct() {
    try {
      var raw = localStorage.getItem(LS_MP_ALERTA_SUBIDA);
      if (raw != null && raw !== '') {
        var n = Number(raw);
        if (isFinite(n) && n > 0 && n <= 100) return n;
      }
    } catch (_) {}
    var leg = loadGlobalMargenMinimoPct();
    return leg > 0 && leg <= 50 ? leg : DEFAULT_MP_ALERTA_SUBIDA_PCT;
  }

  function saveGlobalMpAlertaSubidaPct(pctDisplay) {
    saveGlobalMargenMinimoPct(pctDisplay);
  }

  function evaluarSubidaMp(costoVivo, costoBase) {
    var vivo = Number(costoVivo) || 0;
    var base = Number(costoBase) || 0;
    if (base <= 0 || vivo <= 0) return { subidaPct: 0, alerta: 'ok' };
    var subidaPct = ((vivo - base) / base) * 100;
    if (subidaPct <= 0) return { subidaPct: Math.max(0, subidaPct), alerta: 'ok' };
    var crit = loadGlobalMpAlertaSubidaPct();
    var warn = crit / 2;
    if (subidaPct >= crit - 0.05) return { subidaPct: subidaPct, alerta: 'crit' };
    if (subidaPct >= warn - 0.05) return { subidaPct: subidaPct, alerta: 'warn' };
    return { subidaPct: subidaPct, alerta: 'ok' };
  }

  function getMargenMinimoFraccion(row) {
    if (row && row.margenMinimoPct != null && isFinite(Number(row.margenMinimoPct))) {
      return Number(row.margenMinimoPct) / 100;
    }
    return loadGlobalMargenMinimoPct() / 100;
  }

  /** Costo vigente del plato: venta directa → costeo unitario MP; con receta → explosión receta. */
  function resolveCostoVentaMenu(row, seed, recetaCache) {
    if (!row) return 0;
    var C = global.CrozzoCatalogoMp;
    seed = seed || hub.seed || { resumen: [] };
    if (row.tipoCosteo === 'directo') {
      if (C && C.resolveMpIdForMenuRow && C.get && C.costoMenuDesdeMpItem) {
        var mpId = C.resolveMpIdForMenuRow(row);
        if (mpId) {
          var mp = C.get(mpId);
          if (mp) return Math.round(C.costoMenuDesdeMpItem(mp));
        }
      }
      return Math.round(Number(row.costoMp) || 0);
    }
    var costoRec = getRecetaCostoCached(row.slug, seed, recetaCache);
    if (costoRec > 0) return Math.round(costoRec);
    return Math.round(Number(row.costoMp) || 0);
  }

  /** Sincroniza costoMp en menú desde costeo unitario (directo) y recetas (cocina). No cambia precio venta. */
  function syncMenuCostosDesdeFuentes(seed, opts) {
    opts = opts || {};
    seed = seed || hub.seed;
    var updates = [];
    mergeResumenList(seed).forEach(function (row) {
      var nuevo = resolveCostoVentaMenu(row, seed);
      if (!nuevo || nuevo <= 0) return;
      var prev = Number(row.costoMp) || 0;
      if (Math.abs(nuevo - prev) < 1 && !opts.force) return;
      var patch = { costoMp: nuevo };
      if (row.tipoCosteo === 'directo' && global.CrozzoCatalogoMp && global.CrozzoCatalogoMp.resolveMpIdForMenuRow) {
        var mpId = global.CrozzoCatalogoMp.resolveMpIdForMenuRow(row);
        if (mpId) patch.costeoMpSourceId = mpId;
      }
      updates.push({ slug: row.slug, patch: patch, prevCosto: prev });
    });
    if (!updates.length) return 0;
    saveResumenBatch(updates);
    syncHistorialVigenteForUpdates(updates, 'Costo sincronizado (unitario / recetas)');
    emit('crozzo-costos:matriz-recalculada', { source: 'fuentes-menu', count: updates.length });
    return updates.length;
  }

  function recalcMenuDesdeRecetasBatch(seed, opts) {
    return syncMenuCostosDesdeFuentes(seed, opts);
  }

  global.CrozzoCostosRecalcMenuDesdeRecetas = recalcMenuDesdeRecetasBatch;
  global.CrozzoCostosSyncMenuDesdeFuentes = syncMenuCostosDesdeFuentes;

  function loadAutoPosDesdeMargen() {
    try {
      var raw = localStorage.getItem(LS_AUTO_POS_MARGEN);
      if (raw == null || raw === '') return false;
      return raw === '1' || raw === 'true';
    } catch (_) {
      return false;
    }
  }

  function saveAutoPosDesdeMargen(on) {
    try {
      localStorage.setItem(LS_AUTO_POS_MARGEN, on ? '1' : '0');
    } catch (_) {}
  }

  function loadRevisionStore() {
    try {
      var raw = localStorage.getItem(LS_REVISION);
      if (raw) {
        var j = JSON.parse(raw);
        if (j && typeof j === 'object') return j;
      }
    } catch (_) {}
    return { activa: null, historial: [] };
  }

  function saveRevisionStore(st) {
    try {
      localStorage.setItem(LS_REVISION, JSON.stringify(st || { activa: null, historial: [] }));
    } catch (_) {}
  }

  function getRevisionActiva() {
    var st = loadRevisionStore();
    return st.activa && st.activa.estado === 'activa' ? st.activa : null;
  }

  function revisionPeriodoLabel(d) {
    d = d || new Date();
    var meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return meses[d.getMonth()] + ' ' + d.getFullYear();
  }

  function revisionPeriodoKey(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function getRevisionUserLabel() {
    if (typeof global.getCurrentUser !== 'function') return 'Super Admin';
    var u = global.getCurrentUser();
    if (!u) return 'Super Admin';
    return String(u.nombre || u.id || 'Super Admin');
  }

  function canManageRevisionCostos() {
    return typeof global.isSuperAdminUser === 'function' && global.isSuperAdminUser();
  }

  function buildRevisionBaseline(seed) {
    seed = seed || hub.seed || { resumen: [] };
    var p = computeMatrizPortfolio(seed);
    var cmp = computeComparativaResumen(seed);
    return {
      at: new Date().toISOString(),
      portfolio: {
        total: p.total,
        ok: p.ok,
        alert: p.alert,
        crit: p.crit,
        pctUtilIntegrado: p.pctUtilIntegrado,
        pctCostoIntegrado: p.pctCostoIntegrado,
        avgPctUtil: p.avgPctUtil,
      },
      comparativa: {
        sube: cmp.sube,
        baja: cmp.baja,
        iguales: cmp.iguales,
        sinCaja: cmp.sinCaja,
      },
      sumVenta: p.sumVenta,
      sumCosto: p.sumCosto,
    };
  }

  function computeRevisionChecklist(seed) {
    seed = seed || hub.seed || { resumen: [] };
    var alertas = listAlertasMargenBajo(seed);
    var cmp = computeComparativaResumen(seed);
    var prog = 0;
    var C = global.CrozzoCatalogoMp;
    if (C && C.listProgramacionesAll) {
      prog = (C.listProgramacionesAll() || []).filter(function (x) {
        return x.programacion && !x.programacion.aplicada;
      }).length;
    }
    var borradores = mergeResumenList(seed).filter(function (r) {
      return r.estadoFlujo === 'borrador';
    }).length;
    return {
      crit: alertas.length,
      deltaPend: cmp.sube + cmp.baja,
      programaciones: prog,
      borradores: borradores,
    };
  }

  function syncRevisionBodyClass() {
    if (!document.body) return;
    document.body.classList.toggle('crozzo-revision-costos-activa', !!getRevisionActiva());
  }

  function formatRevisionFecha(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('es-CO', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (_) {
      return String(iso).slice(0, 16);
    }
  }

  function runRevisionPrepSync(done) {
    syncMenuCostosDesdeFuentes(hub.seed, { force: true });
    var C = global.CrozzoCatalogoMp;
    if (C && C.syncHistorialVigenteDesdeMenu) {
      C.syncHistorialVigenteDesdeMenu({
        getCostoMp: function (row) {
          return resolveCostoVentaMenu(row, hub.seed);
        },
        notas: 'Revisión · costeo vigente sincronizado',
      });
    }
    invalidateSeed();
    loadSeed(function (fresh) {
      hub.seed = fresh;
      if (done) done(fresh);
    });
  }

  function iniciarRevisionCostos(opts, done) {
    opts = opts || {};
    if (!canManageRevisionCostos()) {
      toast('Solo Super Admin puede iniciar una revisión', 'warning');
      if (done) done(null);
      return;
    }
    if (getRevisionActiva()) {
      toast('Ya hay una revisión en curso', 'warning');
      if (done) done(null);
      return;
    }
    runRevisionPrepSync(function (fresh) {
      var rev = {
        id: 'rev_' + Date.now(),
        estado: 'activa',
        periodo: opts.periodo || revisionPeriodoKey(),
        label: opts.label || 'Revisión ' + revisionPeriodoLabel(),
        notas: String(opts.notas || '').trim(),
        iniciadaAt: new Date().toISOString(),
        iniciadaPor: getRevisionUserLabel(),
        baseline: buildRevisionBaseline(fresh),
      };
      var st = loadRevisionStore();
      st.activa = rev;
      saveRevisionStore(st);
      syncRevisionBodyClass();
      emit('crozzo-costos:revision-iniciada', { revision: rev });
      if (global.config && global.config.addAudit) {
        global.config.addAudit('costos_revision_iniciada', rev.label + ' · ' + rev.iniciadaPor);
      }
      toast('Revisión iniciada — ajuste precios y programe cambios en caja', 'success');
      if (done) done(rev);
    });
  }

  function cerrarRevisionCostos(opts, done) {
    opts = opts || {};
    if (!canManageRevisionCostos()) {
      toast('Solo Super Admin puede cerrar la revisión', 'warning');
      if (done) done(false);
      return false;
    }
    var rev = getRevisionActiva();
    if (!rev) {
      toast('No hay revisión activa', 'info');
      if (done) done(false);
      return false;
    }
    function finishClose(fresh) {
      hub.seed = fresh || hub.seed;
      rev.estado = 'cerrada';
      rev.cerradaAt = new Date().toISOString();
      rev.cerradaPor = getRevisionUserLabel();
      rev.cierreChecklist = computeRevisionChecklist(hub.seed);
      rev.cierrePortfolio = buildRevisionBaseline(hub.seed).portfolio;
      var st = loadRevisionStore();
      if (!Array.isArray(st.historial)) st.historial = [];
      st.historial.unshift(rev);
      if (st.historial.length > 24) st.historial.length = 24;
      st.activa = null;
      saveRevisionStore(st);
      syncRevisionBodyClass();
      emit('crozzo-costos:revision-cerrada', { revision: rev });
      if (global.config && global.config.addAudit) {
        global.config.addAudit('costos_revision_cerrada', rev.label);
      }
      toast(
        opts.archivar !== false
          ? 'Revisión cerrada · costeo del mes archivado en historial'
          : 'Revisión cerrada',
        'success'
      );
      if (done) done(true);
    }
    if (opts.archivar === false) {
      finishClose(hub.seed);
      return true;
    }
    runRevisionPrepSync(function (fresh) {
      var C = global.CrozzoCatalogoMp;
      if (C && C.guardarCosteoMenuSnapshot) {
        C.guardarCosteoMenuSnapshot({
          periodo: rev.periodo,
          label: rev.label + ' · cierre',
          notas: 'Cierre revisión · ' + (rev.notas || rev.label),
          getCostoMp: function (row) {
            return resolveCostoVentaMenu(row, fresh);
          },
        });
      }
      finishClose(fresh);
    });
    return true;
  }

  function refreshRevisionAdminPanel(root, seed) {
    if (!root) return;
    var panel = root.querySelector('#crozzoRevisionAdmin');
    if (!panel) return;
    var wrap = document.createElement('div');
    wrap.innerHTML = renderRevisionAdminPanel(seed);
    var neu = wrap.firstElementChild;
    if (neu) panel.replaceWith(neu);
    bindRevisionAdmin(root, seed);
  }

  function renderRevisionDeltaChip(label, before, after, pct) {
    var b = Math.round((Number(before) || 0) * (pct ? 100 : 1));
    var a = Math.round((Number(after) || 0) * (pct ? 100 : 1));
    var d = a - b;
    var cls = d > 0 ? 'up' : d < 0 ? 'down' : 'eq';
    var suffix = pct ? '%' : '';
    return (
      '<span class="crozzo-revision-admin__delta crozzo-revision-admin__delta--' +
      cls +
      '">' +
      esc(label) +
      ': ' +
      esc(String(b)) +
      suffix +
      ' → ' +
      esc(String(a)) +
      suffix +
      '</span>'
    );
  }

  function renderRevisionAdminPanel(seed) {
    seed = seed || hub.seed || { resumen: [] };
    var rev = getRevisionActiva();
    var isSuper = canManageRevisionCostos();
    if (!rev && !isSuper) return '';

    if (!rev) {
      return (
        '<section class="crozzo-revision-admin crozzo-revision-admin--idle" id="crozzoRevisionAdmin">' +
        '<div class="crozzo-revision-admin__main">' +
        '<div class="crozzo-revision-admin__icon" aria-hidden="true">📋</div>' +
        '<div><p class="crozzo-revision-admin__eyebrow">Super Admin · revisión mensual</p>' +
        '<h2 class="crozzo-revision-admin__title">Iniciar revisión de costos y precios</h2>' +
        '<p class="crozzo-revision-admin__sub">Congela una línea base, sincroniza MP/recetas y trabaja en <strong>Precios vigentes</strong> sin tocar la caja hasta programar o lanzar.</p></div></div>' +
        '<div class="crozzo-revision-admin__actions">' +
        '<button type="button" class="btn btn-primary btn-sm" id="crozzoRevisionIniciar">Iniciar revisión</button>' +
        '<button type="button" class="btn btn-outline btn-sm" id="crozzoRevisionMapaFlujos" title="PDF para socios e inversores">🗺 Mapa de flujos</button></div></section>'
      );
    }

    var chk = computeRevisionChecklist(seed);
    var p = computeMatrizPortfolio(seed);
    var base = rev.baseline && rev.baseline.portfolio ? rev.baseline.portfolio : null;
    var deltaHtml = base
      ? renderRevisionDeltaChip('Margen integrado', base.pctUtilIntegrado, p.pctUtilIntegrado, true) +
        renderRevisionDeltaChip('Críticos', base.crit, p.crit, false)
      : '';
    var checklist =
      '<ul class="crozzo-revision-admin__list">' +
      '<li' +
      (chk.crit ? '' : ' class="is-done"') +
      '><strong>' +
      esc(String(chk.crit)) +
      '</strong> plato(s) bajo margen mínimo</li>' +
      '<li' +
      (chk.deltaPend ? '' : ' class="is-done"') +
      '><strong>' +
      esc(String(chk.deltaPend)) +
      '</strong> con diferencia caja → costeo</li>' +
      '<li' +
      (chk.programaciones ? '' : ' class="is-done"') +
      '><strong>' +
      esc(String(chk.programaciones)) +
      '</strong> programación(es) pendiente(s)</li>' +
      (chk.borradores
        ? '<li><strong>' + esc(String(chk.borradores)) + '</strong> plato(s) en borrador por lanzar</li>'
        : '') +
      '</ul>';

    return (
      '<section class="crozzo-revision-admin crozzo-revision-admin--active" id="crozzoRevisionAdmin">' +
      '<div class="crozzo-revision-admin__main">' +
      '<div class="crozzo-revision-admin__icon crozzo-revision-admin__icon--live" aria-hidden="true">◈</div>' +
      '<div><p class="crozzo-revision-admin__eyebrow">Revisión en curso · ' +
      esc(rev.periodo || '') +
      '</p>' +
      '<h2 class="crozzo-revision-admin__title">' +
      esc(rev.label || 'Revisión de costos') +
      '</h2>' +
      '<p class="crozzo-revision-admin__sub">Iniciada ' +
      esc(formatRevisionFecha(rev.iniciadaAt)) +
      ' por <strong>' +
      esc(rev.iniciadaPor || '—') +
      '</strong>' +
      (rev.notas ? ' · ' + esc(rev.notas) : '') +
      '</p>' +
      (deltaHtml ? '<div class="crozzo-revision-admin__deltas">' + deltaHtml + '</div>' : '') +
      checklist +
      '</div></div>' +
      (isSuper
        ? '<div class="crozzo-revision-admin__actions">' +
          '<button type="button" class="btn btn-outline btn-sm" id="crozzoRevisionSync">↻ Sincronizar costos</button>' +
          '<button type="button" class="btn btn-outline btn-sm" id="crozzoRevisionProg">Ver programaciones</button>' +
          '<button type="button" class="btn btn-outline btn-sm" id="crozzoRevisionMapaFlujos" title="PDF para inversores">🗺 Mapa de flujos</button>' +
          '<button type="button" class="btn btn-primary btn-sm" id="crozzoRevisionCerrar">Cerrar revisión</button></div>'
        : '<p class="crozzo-revision-admin__readonly">Revisión activa — los cambios de caja los confirma Super Admin al programar o cerrar.</p>') +
      '</section>'
    );
  }

  function bindRevisionAdmin(root, seed) {
    if (!root) return;
    syncRevisionBodyClass();
    var iniciarBtn = root.querySelector('#crozzoRevisionIniciar');
    if (iniciarBtn && !iniciarBtn._bound) {
      iniciarBtn._bound = true;
      iniciarBtn.addEventListener('click', function () {
        if (!canManageRevisionCostos()) return;
        var label = 'Revisión ' + revisionPeriodoLabel();
        var body =
          '<p style="margin:0 0 12px;color:var(--text-secondary);line-height:1.55">Se sincronizarán costos MP y recetas, se guardará una <strong>línea base</strong> y podrá ajustar precios en la matriz sin cambiar la caja hasta que programe o lance.</p>' +
          '<label style="display:block;font-size:.78rem;font-weight:700;margin-bottom:6px">Notas (opcional)</label>' +
          '<textarea class="form-input" id="crozzoRevisionNotas" rows="2" placeholder="Ej. subió pollo y aceite…" style="width:100%;resize:vertical"></textarea>' +
          '<div class="btn-group" style="margin-top:14px;justify-content:flex-end">' +
          '<button type="button" class="btn btn-outline btn-sm" id="crozzoRevisionCancel">Cancelar</button>' +
          '<button type="button" class="btn btn-primary btn-sm" id="crozzoRevisionConfirm">Iniciar revisión</button></div>';
        if (typeof global.showModal === 'function') {
          global.showModal('📋 Iniciar revisión mensual', body);
          var cancel = document.getElementById('crozzoRevisionCancel');
          var confirm = document.getElementById('crozzoRevisionConfirm');
          if (cancel) {
            cancel.onclick = function () {
              if (typeof global.closeModal === 'function') global.closeModal();
            };
          }
          if (confirm) {
            confirm.onclick = function () {
              var notasEl = document.getElementById('crozzoRevisionNotas');
              var notas = notasEl ? notasEl.value : '';
              if (typeof global.closeModal === 'function') global.closeModal();
              iniciarBtn.disabled = true;
              iniciarRevisionCostos({ notas: notas }, function () {
                invalidateSeed();
                loadSeed(function (fresh) {
                  hub.seed = fresh;
                  var host = document.getElementById('mainContent');
                  if (host) {
                    host.innerHTML = renderMatrizPanel(fresh);
                    host._costosBound = false;
                    bindRoot(host);
                    initMatrizAllPanels(host, fresh);
                  }
                });
              });
            };
          }
        } else if (global.confirm('¿Iniciar revisión de ' + label + '?')) {
          iniciarRevisionCostos({}, function () {
            refreshRevisionAdminPanel(root, hub.seed);
            refreshMatrizResumenTable(root, hub.seed);
            refreshMatrizKpis(root, hub.seed);
          });
        }
      });
    }
    var mapaBtn = root.querySelector('#crozzoRevisionMapaFlujos');
    if (mapaBtn && !mapaBtn._bound) {
      mapaBtn._bound = true;
      mapaBtn.addEventListener('click', function () {
        var Rmapa = global.CrozzoFlujosMapaPdf;
        if (Rmapa && Rmapa.downloadMapaFlujos) Rmapa.downloadMapaFlujos();
        else toast('Módulo de mapa de flujos no cargado — recargue la página', 'error');
      });
    }
    var syncBtn = root.querySelector('#crozzoRevisionSync');
    if (syncBtn && !syncBtn._bound) {
      syncBtn._bound = true;
      syncBtn.addEventListener('click', function () {
        syncBtn.disabled = true;
        runRevisionPrepSync(function (fresh) {
          syncBtn.disabled = false;
          refreshMatrizResumenTable(root, fresh);
          refreshMatrizKpis(root, fresh);
          refreshMatrizHistorialPanel(root, fresh);
          refreshRevisionAdminPanel(root, fresh);
          toast('Costos sincronizados desde MP y recetas', 'success');
        });
      });
    }
    var progBtn = root.querySelector('#crozzoRevisionProg');
    if (progBtn && !progBtn._bound) {
      progBtn._bound = true;
      progBtn.addEventListener('click', function () {
        root.querySelectorAll('[data-matriz-vista]').forEach(function (b) {
          b.classList.toggle('is-active', b.getAttribute('data-matriz-vista') === 'programaciones');
        });
        root.querySelectorAll('[data-matriz-vista-panel]').forEach(function (p) {
          p.classList.toggle('is-active', p.getAttribute('data-matriz-vista-panel') === 'programaciones');
        });
      });
    }
    var cerrarBtn = root.querySelector('#crozzoRevisionCerrar');
    if (cerrarBtn && !cerrarBtn._bound) {
      cerrarBtn._bound = true;
      cerrarBtn.addEventListener('click', function () {
        var body =
          '<p style="margin:0 0 12px;color:var(--text-secondary);line-height:1.55">Cierra la revisión activa. Puede archivar el costeo del mes en <strong>Costeos guardados</strong> (histórico).</p>' +
          '<label style="display:flex;align-items:center;gap:8px;font-size:.84rem;cursor:pointer">' +
          '<input type="checkbox" id="crozzoRevisionArchivar" checked> Archivar costeo del mes al cerrar</label>' +
          '<div class="btn-group" style="margin-top:14px;justify-content:flex-end">' +
          '<button type="button" class="btn btn-outline btn-sm" id="crozzoRevisionCerrarCancel">Cancelar</button>' +
          '<button type="button" class="btn btn-primary btn-sm" id="crozzoRevisionCerrarOk">Cerrar revisión</button></div>';
        if (typeof global.showModal === 'function') {
          global.showModal('✓ Cerrar revisión', body);
          var cancel = document.getElementById('crozzoRevisionCerrarCancel');
          var ok = document.getElementById('crozzoRevisionCerrarOk');
          if (cancel) {
            cancel.onclick = function () {
              if (typeof global.closeModal === 'function') global.closeModal();
            };
          }
          if (ok) {
            ok.onclick = function () {
              var arch = document.getElementById('crozzoRevisionArchivar');
              if (typeof global.closeModal === 'function') global.closeModal();
              ok.disabled = true;
              cerrarRevisionCostos({ archivar: arch ? arch.checked : true }, function () {
                refreshRevisionAdminPanel(root, hub.seed);
                refreshMatrizHistorialPanel(root, hub.seed);
              });
            };
          }
        } else if (global.confirm('¿Cerrar la revisión y archivar el mes?')) {
          cerrarRevisionCostos({ archivar: true }, function () {
            refreshRevisionAdminPanel(root, hub.seed);
          });
        }
      });
    }
  }

  /**
   * MP sube (ej. agua $2500→$3200) → costo menú → precio con margen meta → caja POS + historial con márgenes.
   */
  function cascadeMpChangeToMenu(detail) {
    detail = detail || {};
    var C = global.CrozzoCatalogoMp;
    var e = engine();
    if (!C || !e) return { updated: 0, alerts: [], recetasActualizadas: [] };
    var mpId =
      detail.mpId ||
      (detail.item && (detail.item.mpId || detail.item.id)) ||
      (detail.merged && (detail.merged.id || detail.merged.mpId));
    if (!mpId && detail.producto && C.getByNombre) {
      var byN = C.getByNombre(detail.producto);
      if (byN) mpId = byN.id;
    }
    if (!mpId) return { updated: 0, alerts: [], recetasActualizadas: [] };
    var mp = C.get(mpId);
    if (!mp) return { updated: 0, alerts: [], recetasActualizadas: [] };

    var margenObjPct = loadGlobalCostoObjetivoPct();
    var mpAlertaSubidaPct = loadGlobalMpAlertaSubidaPct();
    var autoPos = loadAutoPosDesdeMargen();
    var affected = C.listMenuSlugsAffectedByMp(mpId);
    var updates = [];
    var alerts = [];
    var recetasActualizadas = [];

    function alertaDesdeSubidaMp(costoAnterior, costoNuevo) {
      return evaluarSubidaMp(costoNuevo, costoAnterior).alerta;
    }

    function aplicarSlug(slug, newCosto, tipo) {
      var row = C.getMenuPlato(slug);
      if (!row || !newCosto || newCosto <= 0) return;
      var prevCosto = Number(row.costoMp) || 0;
      var prevPrecio = Number(row.precioVenta) || 0;
      var precioCaja = prevPrecio;
      if (row.posProductId != null && typeof global.products !== 'undefined') {
        var prods = global.products;
        for (var pi = 0; pi < prods.length; pi++) {
          if (prods[pi] && prods[pi].id === row.posProductId) {
            precioCaja = Math.round(Number(prods[pi].precio) || prevPrecio);
            break;
          }
        }
      }
      var newPrecio = autoPos ? precioParaCostoObjetivo(newCosto, margenObjPct) : precioCaja;
      var patch = {
        costoMp: Math.round(newCosto),
        precioVenta: Math.round(newPrecio),
        margenObjetivoPct: Math.round((100 - margenObjPct) * 10) / 10,
        margenMinimoPct: mpAlertaSubidaPct,
      };
      if (tipo === 'directo') patch.costeoMpSourceId = mpId;
      C.updateMenuPlato(slug, patch);
      var r = e.calcularResumen(patch.costoMp, patch.precioVenta);
      var margenRealPct = r.precioVenta > 0 ? Math.round(r.pctUtilidad * 1000) / 10 : 0;
      var alerta = alertaDesdeSubidaMp(prevCosto, patch.costoMp);
      var notaMp =
        'MP «' +
        mp.nombre +
        '» (' +
        (tipo === 'directo' ? 'unitario' : 'receta') +
        '): costo $' +
        prevCosto.toLocaleString('es-CO') +
        ' → $' +
        patch.costoMp.toLocaleString('es-CO');
      if (autoPos && prevPrecio !== patch.precioVenta) {
        notaMp +=
          ' · venta $' +
          prevPrecio.toLocaleString('es-CO') +
          ' → $' +
          patch.precioVenta.toLocaleString('es-CO');
      } else if (!autoPos && prevPrecio > 0) {
        notaMp += ' · venta caja $' + prevPrecio.toLocaleString('es-CO') + ' (sin cambio) · margen ' + margenRealPct + '%';
      }
      if (detail.origen === 'recepcion') notaMp += ' (recepción)';
      if (C.upsertHistorialCosteoVigente) {
        C.upsertHistorialCosteoVigente(slug, {
          costoMp: patch.costoMp,
          costoMpAnterior: prevCosto,
          precioVenta: patch.precioVenta,
          precioVentaAnterior: prevPrecio,
          margenObjetivoPct: patch.margenObjetivoPct,
          margenMinimoPct: mpAlertaSubidaPct,
          margenRealPct: margenRealPct,
          alertaMargen: alerta,
          mpOrigenId: mpId,
          mpOrigenNombre: mp.nombre,
          notas: notaMp,
        });
      }
      if (autoPos && row.posProductId != null) C.aplicarPrecioAlPos(slug, patch.precioVenta);
      if (alerta === 'crit') {
        alerts.push({
          slug: slug,
          producto: row.producto,
          margenRealPct: margenRealPct,
          margenMinimoPct: margenMinPct,
          tipo: tipo,
        });
      }
      updates.push({
        slug: slug,
        producto: row.producto,
        costoMp: patch.costoMp,
        precioVenta: patch.precioVenta,
        alerta: alerta,
        tipo: tipo,
      });
      if (tipo === 'receta') recetasActualizadas.push(slug);
    }

    var seed = hub.seed;
    if (!seed || !seed.resumen) {
      seed = C.buildSeedForCostos ? C.buildSeedForCostos() : { resumen: [] };
    }

    (affected.directos || []).forEach(function (slug) {
      var row = C.getMenuPlato(slug);
      var costo = C.costoMenuDesdeMpItem(mp);
      if (row && C.resolveMpIdForMenuRow) {
        var liveMp = C.get(C.resolveMpIdForMenuRow(row));
        if (liveMp) costo = C.costoMenuDesdeMpItem(liveMp);
      }
      aplicarSlug(slug, costo, 'directo');
    });

    (affected.recetas || []).forEach(function (slug) {
      var row = C.getMenuPlato(slug);
      if (!row) return;
      var costo = resolveCostoVentaMenu(
        Object.assign({}, row, { tipoCosteo: 'receta' }),
        seed
      );
      if (costo > 0) aplicarSlug(slug, costo, 'receta');
    });

    if (updates.length) {
      emit('crozzo-costos:menu-actualizado-mp', {
        mpId: mpId,
        mpNombre: mp.nombre,
        updates: updates,
        alerts: alerts,
        origen: detail.origen || 'mp',
      });
      invalidateSeed();
    }
    return {
      updated: updates.length,
      alerts: alerts,
      items: updates,
      recetasActualizadas: recetasActualizadas,
      mpId: mpId,
    };
  }

  global.CrozzoCostosCascadeMpChange = cascadeMpChangeToMenu;
  global.CrozzoCostosResolveCostoVentaMenu = resolveCostoVentaMenu;
  global.CrozzoCostosRecetaLineasCalc = recetaLineasCalcForSlug;

  function recetaLineasCalcForSlug(slug, seed, opts) {
    opts = opts || {};
    var e = engine();
    var C = global.CrozzoCatalogoMp;
    if (!e || !C) return { lineas: [], opts: {} };
    var lineas = loadRecetaLineas(slug, seed, { readOnly: opts.readOnly !== false });
    var store = buildPreciosStore();
    var lineasCalc = lineas.map(function (ln) {
      return {
        ingrediente: ln.ingrediente,
        unidad: ln.unidad || ln.und || 'GR',
        cantidad: ln.cantidad,
        costoXUnidad: resolveCostoUnitarioLineaReceta(ln, e, C, store),
      };
    });
    var rec = C.getRecetaPlato && slug ? C.getRecetaPlato(slug) : null;
    var calcOpts = resolveRecetaCalcOpts(lineasCalc, (rec && rec.opts) || {}, e);
    return { lineas: lineasCalc, opts: calcOpts };
  }

  function calcularCostoMpDesdeReceta(slug, seed) {
    var e = engine();
    if (!e || !slug) return 0;
    var pack = recetaLineasCalcForSlug(slug, seed, { readOnly: true });
    if (!pack.lineas.length) return 0;
    var calc = e.calcularReceta(pack.lineas, pack.opts);
    return calc ? Number(calc.costoReferencia) || 0 : 0;
  }

  function calcularTotalesResumen(seed) {
    var e = engine();
    var list = mergeResumenList(seed);
    var sumCosto = 0;
    var sumPrecio = 0;
    var recetaCache = {};
    list.forEach(function (row) {
      var costo = resolveCostoVentaMenu(row, seed, recetaCache);
      sumCosto += costo > 0 ? costo : Number(row.costoMp) || 0;
      sumPrecio += Number(row.precioVenta) || 0;
    });
    var sumUtil = sumPrecio - sumCosto;
    var margenGlobal = sumPrecio > 0 ? sumUtil / sumPrecio : 0;
    return {
      count: list.length,
      sumCosto: sumCosto,
      sumPrecio: sumPrecio,
      sumUtil: sumUtil,
      margenGlobal: margenGlobal,
    };
  }

  function readResumenRowCostoMp(tr) {
    if (!tr) return NaN;
    var live = tr.querySelector('[data-resumen-costo-mp]');
    if (live) return Number(live.getAttribute('data-resumen-costo-mp'));
    var inp = tr.querySelector('[data-resumen-field="costoMp"]');
    return Number(inp && inp.value);
  }

  function collectTotalesResumenFromDom(root) {
    var sumCosto = 0;
    var sumPrecio = 0;
    var count = 0;
    if (!root) return calcularTotalesResumen(hub.seed || { resumen: [] });
    root.querySelectorAll('#crozzoResumenTbody tr[data-resumen-slug]').forEach(function (tr) {
      var precioInp = tr.querySelector('[data-resumen-field="precioVenta"]');
      var costo = readResumenRowCostoMp(tr);
      var precio = Number(precioInp && precioInp.value);
      if (!isFinite(costo) || !isFinite(precio)) return;
      sumCosto += costo;
      sumPrecio += precio;
      count++;
    });
    var sumUtil = sumPrecio - sumCosto;
    return {
      count: count,
      sumCosto: sumCosto,
      sumPrecio: sumPrecio,
      sumUtil: sumUtil,
      margenGlobal: sumPrecio > 0 ? sumUtil / sumPrecio : 0,
    };
  }

  function renderResumenTotalesFooterHtml(totales, seed) {
    totales = totales || { sumCosto: 0, sumPrecio: 0, sumUtil: 0, margenGlobal: 0, count: 0 };
    var posTot = sumPreciosPosResumen(seed || hub.seed || { resumen: [] });
    var objFrac = getObjetivoCostoFraccion();
    var pctCostoGlobal = totales.sumPrecio > 0 ? totales.sumCosto / totales.sumPrecio : 0;
    var pctUtilGlobal = totales.margenGlobal;
    var ev = {
      objetivoPct: objFrac,
      actualPct: pctCostoGlobal,
      dentroObjetivo: pctCostoGlobal <= objFrac + 0.008,
      alertaSubida: 'ok',
      bajoTolerancia: false,
      subidaMpPct: 0,
    };
    var costoDisplay = Math.round(pctCostoGlobal * 1000) / 10;
    var utilDisplay = Math.round(pctUtilGlobal * 1000) / 10;
    var meta = Math.round(objFrac * 100);
    var diff = Math.round((costoDisplay - meta) * 10) / 10;
    var diffTxt =
      diff <= 0
        ? Math.abs(diff) + ' pts bajo meta (mejor)'
        : '+' + diff + ' pts sobre meta';
    return (
      '<tfoot id="crozzoResumenTfoot">' +
      '<tr class="crozzo-matriz-totales">' +
      '<td><strong>TOTAL MENÚ</strong>' +
      '<span class="crozzo-matriz-totales__sub">' +
      esc(String(totales.count)) +
      ' platos · costo y utilidad del menú</span></td>' +
      '<td style="text-align:right" data-total-costo><strong>' +
      engFmt(totales.sumCosto) +
      '</strong></td>' +
      '<td style="text-align:right" data-total-util><strong class="crozzo-matriz-util">' +
      engFmt(totales.sumUtil) +
      '</strong></td>' +
      '<td style="text-align:right" data-total-margen-pct><strong class="crozzo-matriz-total-margen" data-total-margen-val>' +
      esc(String(costoDisplay)) +
      '%</strong><span class="crozzo-matriz-totales__sub">% costo MP</span></td>' +
      '<td style="text-align:right" data-total-margen-util-pct><strong class="crozzo-matriz-margen-util" data-total-margen-util>' +
      esc(String(utilDisplay)) +
      '%</strong><span class="crozzo-matriz-totales__sub">% utilidad</span></td>' +
      '<td style="text-align:right" data-total-precio><strong>' +
      engFmt(totales.sumPrecio) +
      '</strong><span class="crozzo-matriz-totales__sub">precio venta</span></td>' +
      '<td style="text-align:right" data-total-pos title="Suma precios actuales en caja (productos vinculados)">' +
      (posTot.count
        ? '<strong>' + engFmt(posTot.sum) + '</strong><span class="crozzo-matriz-totales__sub"> caja</span>'
        : '—') +
      '</td>' +
      '<td data-total-cmp class="crozzo-matriz-cmp-cell">' +
      (posTot.count && posTot.sum > 0
        ? renderComparativaPrecioInner(posTot.sum, totales.sumPrecio, {
            labelAnterior: 'caja',
            labelNuevo: 'costeo',
          })
        : '—') +
      '</td>' +
      '<td data-total-bar>' +
      renderObjetivoBarHtml(pctCostoGlobal, objFrac) +
      '</td>' +
      '<td data-total-estado>' +
      renderMatrizStatusPill(ev) +
      '<span class="crozzo-matriz-totales__diff">' +
      esc(diffTxt) +
      '</span></td>' +
      '</tr></tfoot>'
    );
  }

  function refreshResumenTotales(root, seed) {
    if (!root) return;
    var tot = collectTotalesResumenFromDom(root);
    var existing = root.querySelector('#crozzoResumenTfoot');
    var html = renderResumenTotalesFooterHtml(tot, seed);
    if (existing) {
      existing.outerHTML = html;
    } else {
      var table = root.querySelector('.crozzo-matriz-table');
      if (table) table.insertAdjacentHTML('beforeend', html);
    }
  }

  function refreshMatrizResumenTable(root, seed) {
    if (!root) return;
    invalidateMatrizCaches();
    var resumenPanel = root.querySelector('[data-matriz-panel="resumen"]');
    if (resumenPanel) {
      var oldHead = resumenPanel.querySelector('.crozzo-matriz-panel-head');
      if (oldHead) {
        var wrap = document.createElement('div');
        wrap.innerHTML = renderMatrizPanelIntro('resumen', seed);
        var neu = wrap.firstElementChild;
        if (neu) oldHead.replaceWith(neu);
      }
    }
    var tbody = root.querySelector('#crozzoResumenTbody');
    if (!tbody) return;
    tbody.innerHTML = renderResumenRowsHtml(seed);
    root.querySelectorAll('#crozzoResumenTbody [data-resumen-field]').forEach(function (inp) {
      inp._bound = false;
    });
    bindResumenRowInputs(root, seed);
    bindFlujoLanzarButtons(root, seed);
    refreshResumenTotales(root, seed);
    refreshMatrizKpis(root, seed);
    var accBar = root.querySelector('#crozzoMatrizResumenAcciones');
    if (accBar) {
      var wrap = document.createElement('div');
      wrap.innerHTML = renderMatrizResumenAcciones(seed);
      var neu = wrap.firstElementChild;
      if (neu) {
        accBar.replaceWith(neu);
        root._resumenAccionesBound = false;
        bindMatrizResumenAcciones(root);
      }
    }
    if (typeof root._matrizApplyFilters === 'function') root._matrizApplyFilters();
  }

  function syncAllCostosDesdeRecetas(seed) {
    return syncMenuCostosDesdeFuentes(seed, { force: true });
  }

  function precioParaMargen(costoMp, margenPctDisplay) {
    var e = engine();
    if (!e) return Math.round(costoMp);
    var pct = Number(margenPctDisplay) / 100;
    var raw = e.precioDesdeMargenUtilidad(costoMp, pct);
    return e.redondearPrecioMenu(raw, PRECIO_MENU_PASO);
  }

  /** Precio sugerido desde meta de costo MP (food cost %). Ej.: 30% → precio = costo ÷ 0,30 */
  function precioParaCostoObjetivo(costoMp, costoPctDisplay) {
    var e = engine();
    var pct = Number(costoPctDisplay) / 100;
    if (!isFinite(pct) || pct <= 0) pct = 0.01;
    if (pct >= 1) pct = 0.99;
    var raw = Number(costoMp) / pct;
    return e ? e.redondearPrecioMenu(raw, PRECIO_MENU_PASO) : Math.round(raw);
  }

  function setInputSilent(inp, value) {
    if (!inp) return;
    inp._silent = true;
    inp.value = value;
    inp._silent = false;
  }

  function syncPrecioVentaMatrizToReceta(root, seed, slug, precioVenta) {
    if (!root || !slug || hub.precioVentaSyncLock) return;
    if (getActiveRecetaSlug(seed) !== slug) return;
    if (!isFinite(Number(precioVenta))) return;
    hub.precioVentaSyncLock = true;
    try {
      root.querySelectorAll('[data-receta-vista-panel]').forEach(function (panel) {
        var inp = panel.querySelector('[data-receta-opt="precioVenta"]');
        if (inp && document.activeElement !== inp) {
          setInputSilent(inp, Math.round(precioVenta));
        }
      });
      recalcDemoReceta(root, seed, { previewOnly: true, skipPrecioMatrizSync: true });
    } finally {
      hub.precioVentaSyncLock = false;
    }
  }

  function syncPrecioVentaRecetaToMatriz(root, seed, slug, precioVenta, opts) {
    opts = opts || {};
    if (!root || !slug || hub.precioVentaSyncLock) return;
    if (!isFinite(Number(precioVenta)) || Number(precioVenta) < 0) return;
    var tr = root.querySelector('tr[data-resumen-slug="' + slug + '"]');
    if (!tr) return;
    var precioEl = tr.querySelector('[data-resumen-field="precioVenta"]');
    if (!precioEl || document.activeElement === precioEl) return;
    hub.precioVentaSyncLock = true;
    try {
      setInputSilent(precioEl, Math.round(precioVenta));
      refreshResumenRow(tr, seed || hub.seed, {
        sourceField: 'precioVenta',
        save: !!opts.save,
        skipRecetaSync: true,
      });
    } finally {
      hub.precioVentaSyncLock = false;
    }
  }

  function bindRecetaPrecioVentaSync(root, seed) {
    var edScope = getRecetaEdicionPanel(root);
    if (!edScope) return;
    edScope.querySelectorAll('[data-receta-opt="precioVenta"]').forEach(function (inp) {
      if (inp._boundPrecioSync) return;
      inp._boundPrecioSync = true;
      inp.addEventListener('input', function () {
        if (inp._silent) return;
        var slug = getActiveRecetaSlug(seed);
        var pv = Number(inp.value);
        if (!slug || !isFinite(pv)) return;
        syncPrecioVentaRecetaToMatriz(root, seed, slug, pv, { save: false });
        recalcDemoReceta(root, seed, { previewOnly: true, skipPrecioMatrizSync: true });
      });
      inp.addEventListener('change', function () {
        if (inp._silent) return;
        var slug = getActiveRecetaSlug(seed);
        var pv = Math.round(Number(inp.value));
        if (!slug || !isFinite(pv) || pv < 0) return;
        syncPrecioVentaRecetaToMatriz(root, seed, slug, pv, { save: true });
        invalidateSeed();
        recalcDemoReceta(root, seed, { previewOnly: true, skipPrecioMatrizSync: true });
      });
    });
  }

  function getRecetaEdicionPanel(root) {
    if (!root) return null;
    return root.querySelector('[data-receta-vista-panel="edicion"]') || root;
  }

  function getRecetaDraft(slug) {
    if (!slug || !hub.recetaDraftBySlug) return null;
    return hub.recetaDraftBySlug[slug] || null;
  }

  function setRecetaDraft(slug, lineas, opts) {
    if (!slug) return;
    if (!hub.recetaDraftBySlug) hub.recetaDraftBySlug = {};
    hub.recetaDraftBySlug[slug] = {
      lineas: Array.isArray(lineas) ? lineas.slice() : [],
      opts: Object.assign({}, opts || {}),
      dirty: true,
    };
  }

  function clearRecetaDraft(slug) {
    if (hub.recetaDraftBySlug && slug && hub.recetaDraftBySlug[slug]) {
      delete hub.recetaDraftBySlug[slug];
    }
  }

  function updateRecetaDirtyBadge(root, dirty) {
    if (!root) return;
    var badge = root.querySelector('[data-receta-draft-badge]');
    if (badge) badge.hidden = !dirty;
    var saveBtn = root.querySelector('#crozzoRecetaSave');
    var saveBtn2 = root.querySelector('#crozzoRecetaSaveFoot');
    root.querySelectorAll('[data-receta-action="save"]').forEach(function (btn) {
      btn.classList.toggle('crozzo-receta-btn--pending', !!dirty);
    });
    if (saveBtn) saveBtn.classList.toggle('crozzo-receta-btn--pending', !!dirty);
    if (saveBtn2) saveBtn2.classList.toggle('crozzo-receta-btn--pending', !!dirty);
  }

  function loadRecetaLineas(slug, seed, opts) {
    opts = opts || {};
    if (!opts.readOnly) {
      var draft = getRecetaDraft(slug);
      if (draft && Array.isArray(draft.lineas)) return draft.lineas.slice();
    }
    var C = global.CrozzoCatalogoMp;
    if (C && C.getRecetaPlato && slug) {
      var r = C.getRecetaPlato(slug);
      if (r && Array.isArray(r.lineas)) return r.lineas.slice();
      if (!opts.readOnly && C.ensureRecetaForMenu) {
        var row = mergeResumenList(seed).find(function (x) {
          return x.slug === slug;
        });
        if (row) C.ensureRecetaForMenu(slug, row.producto);
        r = C.getRecetaPlato(slug);
        if (r && Array.isArray(r.lineas)) return r.lineas.slice();
      }
      return [];
    }
    if (opts.readOnly) return [];
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

  function mpUndLabel(und) {
    var u = String(und || 'GR').toUpperCase();
    if (u === 'GR' || u === 'G') return 'g';
    if (u === 'KG') return 'kg';
    if (u === 'ML') return 'ml';
    if (u === 'UNI' || u === 'UND') return 'und';
    return u.toLowerCase();
  }

  function filteredMpListReceta(q) {
    var C = global.CrozzoCatalogoMp;
    var list = C && C.list ? C.list() : [];
    return list
      .filter(function (mp) {
        if (!q) return true;
        var blob = [mp.nombre, mp.categoria, mp.id, mp.und, mp.precioUnit, mp.precioTotal, mp.proveedores].join(' ');
        return matchSearchQuery(blob, q);
      })
      .sort(function (a, b) {
        return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' });
      })
      .slice(0, 60);
  }

  function renderRecetaMpComboOptionsHtml(q, selectedId, lineIdx) {
    var list = filteredMpListReceta(q);
    if (!list.length) {
      return '<div class="cxf-combobox__empty">Sin coincidencias — pruebe nombre, categoría o código</div>';
    }
    return list
      .map(function (mp) {
        var sel = String(mp.id) === String(selectedId || '');
        var unit = mpUndLabel(mp.und);
        return (
          '<button type="button" class="cxf-combobox__option' +
          (sel ? ' is-selected' : '') +
          '" data-receta-mp-pick="' +
          esc(mp.id) +
          '" data-receta-line="' +
          esc(String(lineIdx)) +
          '">' +
          '<span class="cxf-combobox__option-name">' +
          esc(mp.nombre) +
          '</span>' +
          '<span class="cxf-combobox__option-meta">' +
          esc(mp.categoria || 'General') +
          ' · ' +
          esc(mp.peso || '—') +
          ' ' +
          unit +
          (mp.precioUnit ? ' · ' + engFmt(mp.precioUnit) + '/' + unit : '') +
          '</span></button>'
        );
      })
      .join('');
  }

  function recetaMpComboDisplay(lineIdx, mpId, mpName) {
    if (!hub.recetaMpCombo) hub.recetaMpCombo = { openLine: null, filters: {}, platoFilter: '', platoOpen: false };
    if (hub.recetaMpCombo.openLine === lineIdx) return hub.recetaMpCombo.filters[lineIdx] || '';
    if (mpId) {
      var C = global.CrozzoCatalogoMp;
      if (C && C.get) {
        var mp = C.get(mpId);
        if (mp && mp.nombre) return mp.nombre;
      }
    }
    return mpName || '';
  }

  function renderRecetaMpComboCell(lineIdx, mpId, mpName) {
    if (!hub.recetaMpCombo) hub.recetaMpCombo = { openLine: null, filters: {}, platoFilter: '', platoOpen: false };
    var open = hub.recetaMpCombo.openLine === lineIdx;
    var display = recetaMpComboDisplay(lineIdx, mpId, mpName);
    var q = open ? hub.recetaMpCombo.filters[lineIdx] || '' : '';
    return (
      '<div class="cxf-mp-combobox cxf-combobox--line crozzo-receta-mp-combo' +
      (open ? ' is-open' : '') +
      '" data-receta-line="' +
      esc(String(lineIdx)) +
      '">' +
      '<input type="hidden" data-receta-mp-id value="' +
      esc(mpId || '') +
      '">' +
      '<input type="text" class="cxf-combobox__input" data-receta-mp-combo role="combobox" autocomplete="off" placeholder="Buscar MP…" value="' +
      esc(display) +
      '" aria-expanded="' +
      (open ? 'true' : 'false') +
      '">' +
      '<div class="cxf-combobox__list" role="listbox"' +
      (open ? '' : ' hidden') +
      '>' +
      renderRecetaMpComboOptionsHtml(q, mpId, lineIdx) +
      '</div></div>'
    );
  }

  function renderPlatoComboHtml(seed) {
    if (!hub.recetaMpCombo) hub.recetaMpCombo = { openLine: null, filters: {}, platoFilter: '', platoOpen: false };
    var activeSlug = getActiveRecetaSlug(seed);
    var list = mergeResumenList(seed);
    var activeRow =
      list.find(function (r) {
        return r.slug === activeSlug;
      }) || list[0];
    var open = hub.recetaMpCombo.platoOpen;
    var display = open ? hub.recetaMpCombo.platoFilter : activeRow ? activeRow.producto : '';
    var q = open ? hub.recetaMpCombo.platoFilter : '';
    var filtered = list
      .filter(function (r) {
        return matchSearchQuery(
          [r.producto, r.slug, r.categoria, r.tieneReceta ? 'receta' : 'venta directa'].join(' '),
          q
        );
      })
      .slice(0, 40);
    var opts =
      filtered
        .map(function (r) {
          return (
            '<button type="button" class="cxf-combobox__option' +
            (r.slug === activeSlug ? ' is-selected' : '') +
            '" data-plato-slug="' +
            esc(r.slug) +
            '">' +
            '<span class="cxf-combobox__option-name">' +
            esc(r.producto) +
            '</span>' +
            '<span class="cxf-combobox__option-meta">' +
            esc(r.categoria || 'Menú') +
            ' · ' +
            esc(r.slug) +
            (r.tieneReceta ? ' · receta' : '') +
            '</span></button>'
          );
        })
        .join('') || '<div class="cxf-combobox__empty">Sin coincidencias — pruebe nombre o categoría</div>';
    return (
      '<div class="crozzo-receta-plato-combo cxf-combobox' +
      (open ? ' is-open' : '') +
      '" id="crozzoDemoPlatoCombo">' +
      '<input type="hidden" id="crozzoDemoPlatoSel" value="' +
      esc(activeSlug) +
      '">' +
      '<input type="text" class="cxf-combobox__input" data-receta-plato-combo role="combobox" autocomplete="off" placeholder="Buscar plato, categoría…" value="' +
      esc(display) +
      '" aria-expanded="' +
      (open ? 'true' : 'false') +
      '">' +
      '<div class="cxf-combobox__list" role="listbox"' +
      (open ? '' : ' hidden') +
      '>' +
      opts +
      '</div></div>'
    );
  }

  function refreshRecetaMpComboList(wrap) {
    if (!wrap) return;
    var lineIdx = wrap.getAttribute('data-receta-line');
    var hid = wrap.querySelector('[data-receta-mp-id]');
    var selId = hid ? hid.value : '';
    var inp = wrap.querySelector('[data-receta-mp-combo]');
    var q = inp ? inp.value : '';
    var list = wrap.querySelector('.cxf-combobox__list');
    if (list) list.innerHTML = renderRecetaMpComboOptionsHtml(q, selId, lineIdx);
  }

  function refreshPlatoComboList(wrap, seed) {
    if (!wrap) return;
    var hid = wrap.querySelector('#crozzoDemoPlatoSel');
    var activeSlug = hid ? hid.value : getActiveRecetaSlug(seed);
    var list = mergeResumenList(seed || hub.seed);
    var q = hub.recetaMpCombo ? hub.recetaMpCombo.platoFilter : '';
    var filtered = list
      .filter(function (r) {
        return matchSearchQuery(
          [r.producto, r.slug, r.categoria, r.tieneReceta ? 'receta' : 'venta directa'].join(' '),
          q
        );
      })
      .slice(0, 40);
    var listEl = wrap.querySelector('.cxf-combobox__list');
    if (!listEl) return;
    listEl.innerHTML =
      filtered
        .map(function (r) {
          return (
            '<button type="button" class="cxf-combobox__option' +
            (r.slug === activeSlug ? ' is-selected' : '') +
            '" data-plato-slug="' +
            esc(r.slug) +
            '">' +
            '<span class="cxf-combobox__option-name">' +
            esc(r.producto) +
            '</span>' +
            '<span class="cxf-combobox__option-meta">' +
            esc(r.categoria || 'Menú') +
            ' · ' +
            esc(r.slug) +
            (r.tieneReceta ? ' · receta' : '') +
            '</span></button>'
          );
        })
        .join('') || '<div class="cxf-combobox__empty">Sin coincidencias</div>';
  }

  function pickRecetaMpForLine(wrap, mpId) {
    if (!wrap || !mpId) return;
    var root = wrap.closest('#mainContent') || document.getElementById('mainContent');
    var seed = hub.seed;
    var lineIdx = wrap.getAttribute('data-receta-line');
    var hid = wrap.querySelector('[data-receta-mp-id]');
    var inp = wrap.querySelector('[data-receta-mp-combo]');
    var C = global.CrozzoCatalogoMp;
    var mp = C && C.get ? C.get(mpId) : null;
    if (hid) hid.value = mpId;
    if (inp && mp) inp.value = mp.nombre;
    if (hub.recetaMpCombo) {
      hub.recetaMpCombo.openLine = null;
      if (lineIdx != null) hub.recetaMpCombo.filters[lineIdx] = '';
    }
    wrap.classList.remove('is-open');
    var list = wrap.querySelector('.cxf-combobox__list');
    if (list) list.hidden = true;
    if (inp) inp.setAttribute('aria-expanded', 'false');
    var tr = wrap.closest('tr[data-demo-line]');
    if (tr && mp) {
      tr.setAttribute('data-mp-id', mp.id);
      var und = tr.querySelector('[data-receta-und]');
      if (und) und.textContent = mp.und || 'GR';
    }
    if (root && seed) recalcDemoReceta(root, seed, { previewOnly: true });
  }

  function pickPlatoFromCombo(wrap, slug, root, seed) {
    if (!wrap || !slug) return;
    hub.recetaSlug = slug;
    if (hub.recetaMpCombo) {
      hub.recetaMpCombo.platoOpen = false;
      hub.recetaMpCombo.platoFilter = '';
    }
    var hid = wrap.querySelector('#crozzoDemoPlatoSel');
    if (hid) hid.value = slug;
    wrap.classList.remove('is-open');
    var list = wrap.querySelector('.cxf-combobox__list');
    if (list) list.hidden = true;
    var C = global.CrozzoCatalogoMp;
    if (C && C.autoApplyMenuPrepConfig) {
      C.autoApplyMenuPrepConfig(slug);
      invalidateSeed();
    }
    if (root) refreshRecetaPlatoPanel(root, hub.seed || seed);
  }

  function closeRecetaCombosExcept(exceptWrap) {
    document.querySelectorAll('.crozzo-receta-mp-combo.is-open, .crozzo-receta-plato-combo.is-open').forEach(function (w) {
      if (exceptWrap && w === exceptWrap) return;
      w.classList.remove('is-open');
      var list = w.querySelector('.cxf-combobox__list');
      if (list) list.hidden = true;
      var inp = w.querySelector('[data-receta-mp-combo], [data-receta-plato-combo]');
      if (inp) inp.setAttribute('aria-expanded', 'false');
    });
    if (hub.recetaMpCombo && (!exceptWrap || !exceptWrap.classList.contains('crozzo-receta-plato-combo'))) {
      if (!exceptWrap || !exceptWrap.classList.contains('crozzo-receta-mp-combo')) hub.recetaMpCombo.openLine = null;
      if (!exceptWrap || !exceptWrap.classList.contains('crozzo-receta-plato-combo')) hub.recetaMpCombo.platoOpen = false;
    }
  }

  function installRecetaComboboxUi() {
    if (global.__crozzoRecetaComboBound) return;
    global.__crozzoRecetaComboBound = true;

    document.addEventListener(
      'mousedown',
      function (e) {
        var mpOpt = e.target.closest('[data-receta-mp-pick]');
        if (mpOpt) {
          e.preventDefault();
          var wrap = mpOpt.closest('.crozzo-receta-mp-combo');
          pickRecetaMpForLine(wrap, mpOpt.getAttribute('data-receta-mp-pick'));
          return;
        }
        var platoOpt = e.target.closest('[data-plato-slug]');
        if (platoOpt && platoOpt.closest('.crozzo-receta-plato-combo')) {
          e.preventDefault();
          var pWrap = platoOpt.closest('.crozzo-receta-plato-combo');
          var root = pWrap.closest('#mainContent') || document.getElementById('mainContent');
          pickPlatoFromCombo(pWrap, platoOpt.getAttribute('data-plato-slug'), root, hub.seed);
        }
      },
      true
    );

    document.addEventListener('focusin', function (e) {
      var mpInp = e.target.closest('[data-receta-mp-combo]');
      if (mpInp) {
        var wrap = mpInp.closest('.crozzo-receta-mp-combo');
        if (!wrap) return;
        closeRecetaCombosExcept(wrap);
        var lineIdx = Number(wrap.getAttribute('data-receta-line'));
        if (hub.recetaMpCombo) hub.recetaMpCombo.openLine = lineIdx;
        wrap.classList.add('is-open');
        mpInp.setAttribute('aria-expanded', 'true');
        var list = wrap.querySelector('.cxf-combobox__list');
        if (list) list.hidden = false;
        refreshRecetaMpComboList(wrap);
        return;
      }
      var platoInp = e.target.closest('[data-receta-plato-combo]');
      if (platoInp) {
        var pWrap = platoInp.closest('.crozzo-receta-plato-combo');
        if (!pWrap) return;
        closeRecetaCombosExcept(pWrap);
        if (hub.recetaMpCombo) {
          hub.recetaMpCombo.platoOpen = true;
          if (!hub.recetaMpCombo.platoFilter) hub.recetaMpCombo.platoFilter = platoInp.value;
        }
        pWrap.classList.add('is-open');
        platoInp.setAttribute('aria-expanded', 'true');
        var pList = pWrap.querySelector('.cxf-combobox__list');
        if (pList) pList.hidden = false;
        refreshPlatoComboList(pWrap, hub.seed);
      }
    });

    document.addEventListener('input', function (e) {
      var mpInp = e.target.closest('[data-receta-mp-combo]');
      if (mpInp) {
        var wrap = mpInp.closest('.crozzo-receta-mp-combo');
        if (!wrap) return;
        var lineIdx = wrap.getAttribute('data-receta-line');
        if (hub.recetaMpCombo) {
          hub.recetaMpCombo.filters[lineIdx] = mpInp.value;
          hub.recetaMpCombo.openLine = Number(lineIdx);
        }
        var hid = wrap.querySelector('[data-receta-mp-id]');
        if (hid) hid.value = '';
        wrap.classList.add('is-open');
        var list = wrap.querySelector('.cxf-combobox__list');
        if (list) list.hidden = false;
        refreshRecetaMpComboList(wrap);
        return;
      }
      var platoInp = e.target.closest('[data-receta-plato-combo]');
      if (platoInp) {
        var pWrap = platoInp.closest('.crozzo-receta-plato-combo');
        if (!pWrap) return;
        if (hub.recetaMpCombo) {
          hub.recetaMpCombo.platoFilter = platoInp.value;
          hub.recetaMpCombo.platoOpen = true;
        }
        pWrap.classList.add('is-open');
        var pList = pWrap.querySelector('.cxf-combobox__list');
        if (pList) pList.hidden = false;
        refreshPlatoComboList(pWrap, hub.seed);
      }
    });

    document.addEventListener('keydown', function (e) {
      var mpInp = e.target.closest('[data-receta-mp-combo]');
      if (mpInp && e.key === 'Enter') {
        var wrap = mpInp.closest('.crozzo-receta-mp-combo');
        var matches = filteredMpListReceta(mpInp.value);
        if (matches.length >= 1) {
          e.preventDefault();
          pickRecetaMpForLine(wrap, matches[0].id);
        }
        return;
      }
      var platoInp = e.target.closest('[data-receta-plato-combo]');
      if (platoInp && e.key === 'Enter') {
        var pWrap = platoInp.closest('.crozzo-receta-plato-combo');
        var list = mergeResumenList(hub.seed);
        var hits = list
          .filter(function (r) {
            return matchSearchQuery(
              [r.producto, r.slug, r.categoria, r.tieneReceta ? 'receta' : 'venta directa'].join(' '),
              platoInp.value
            );
          })
          .slice(0, 1);
        if (hits[0]) {
          e.preventDefault();
          var root = pWrap.closest('#mainContent') || document.getElementById('mainContent');
          pickPlatoFromCombo(pWrap, hits[0].slug, root, hub.seed);
        }
      }
      if (e.key === 'Escape') closeRecetaCombosExcept(null);
    });

    document.addEventListener('click', function (e) {
      if (!e.target.closest('.crozzo-receta-mp-combo') && !e.target.closest('.crozzo-receta-plato-combo')) {
        closeRecetaCombosExcept(null);
      }
    });
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

  function addRecetaLine(root, seed) {
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
    setRecetaDraft(slug, lineas, getRecetaOptsMerged(null, seed, slug));
    refreshRecetaPlatoPanel(root, seed, { focusLastLine: true });
    recalcDemoReceta(root, seed, { previewOnly: true });
  }

  function focusRecetaLastLine(root) {
    if (!root) return;
    requestAnimationFrame(function () {
      var panel = root.querySelector('[data-receta-vista-panel="edicion"]');
      var dock = root.querySelector('[data-receta-dock]');
      if (dock && dock.scrollIntoView) dock.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      var tbody = root.querySelector('#crozzoDemoTbody');
      if (!tbody) return;
      var rows = tbody.querySelectorAll('tr[data-demo-line]');
      var last = rows.length ? rows[rows.length - 1] : null;
      if (!last) return;
      if (last.scrollIntoView) last.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      var focusEl =
        last.querySelector('[data-mp-combo-input]') ||
        last.querySelector('.crozzo-receta-mp-combo input') ||
        last.querySelector('[data-demo-cant]');
      if (focusEl && focusEl.focus) {
        setTimeout(function () {
          focusEl.focus();
          if (focusEl.select) focusEl.select();
        }, 80);
      }
    });
  }

  function refreshRecetaPlatoPanel(root, seed, panelOpts) {
    panelOpts = panelOpts || {};
    if (!root) return;
    var panel = root.querySelector('[data-matriz-panel="demo"]');
    if (!panel) return;
    panel.innerHTML = renderDemoRecetaHtml(seed);
    initMatrizGerenciaPanel(root, seed);
    bindRecetaNewPlatoForm(root);
    bindPerdidasProcesoAdmin(root);
    if (panelOpts.focusLastLine) focusRecetaLastLine(root);
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
      C.upsertRecetaPlato(
        {
          slug: meta.slug || getActiveRecetaSlug(hub.seed),
          producto: meta.producto || meta.nombre,
          lineas: lineas,
          opts: meta.opts,
        },
        { skipEvent: !!meta.skipEvent }
      );
    } else if (C && C.updateRecetaDemoLineas) {
      C.updateRecetaDemoLineas(lineas, meta);
    }
  }

  function buildPreciosStore() {
    var C = global.CrozzoCatalogoMp;
    if (C && C.buildPreciosStore) return C.buildPreciosStore();
    return { precios: {}, subRecetas: {} };
  }

  /** Costo unitario vivo desde catálogo/costeo MP (nunca snapshot congelado en línea). */
  function resolveCostoUnitarioLineaReceta(ln, e, C, store) {
    e = e || engine();
    C = C || global.CrozzoCatalogoMp;
    store = store || buildPreciosStore();
    if (ln && ln.mpId && C && C.get) {
      var mpItem = C.get(ln.mpId);
      if (mpItem) {
        if (mpItem.precioUnit != null && Number(mpItem.precioUnit) > 0) return Number(mpItem.precioUnit);
        if (e && mpItem.precioTotal != null && mpItem.peso) {
          return e.precioUnitarioMp(mpItem.precioTotal, mpItem.peso);
        }
      }
    }
    var ing = ln && ln.ingrediente ? ln.ingrediente : '';
    if (!ing && ln && ln.mpId && C && C.get) {
      var mp2 = C.get(ln.mpId);
      if (mp2 && mp2.nombre) ing = mp2.nombre;
    }
    return e ? e.resolverCostoUnitario(ing, store) : 0;
  }

  global.CrozzoCostosResolveCostoUnitarioLinea = resolveCostoUnitarioLineaReceta;

  function stripCostoSnapshotFromRecetaDrafts(mpId) {
    if (!mpId || !hub.recetaDraftBySlug) return;
    Object.keys(hub.recetaDraftBySlug).forEach(function (slug) {
      var draft = hub.recetaDraftBySlug[slug];
      if (!draft || !Array.isArray(draft.lineas)) return;
      var hit = draft.lineas.some(function (ln) {
        return ln && String(ln.mpId) === String(mpId);
      });
      if (!hit) return;
      draft.lineas = draft.lineas.map(function (ln) {
        if (!ln) return ln;
        var copy = Object.assign({}, ln);
        delete copy.costoXUnidad;
        return copy;
      });
    });
  }

  function refreshRecetaPanelIfVisible(host, seed) {
    if (!host) host = document.getElementById('mainContent');
    if (!host || !seed) return;
    var demoPanel = host.querySelector('[data-matriz-panel="demo"]');
    if (!demoPanel || !demoPanel.querySelector('.crozzo-receta-plato')) return;
    refreshRecetaPlatoPanel(host, seed);
  }

  function platoTieneReceta(slug, tipoCosteo) {
    if (tipoCosteo === 'directo') return false;
    var C = global.CrozzoCatalogoMp;
    if (!C || !C.getRecetaPlato || !slug) return tipoCosteo === 'receta';
    var r = C.getRecetaPlato(slug);
    return !!(r && Array.isArray(r.lineas) && r.lineas.length);
  }

  function buildPosPrecioLookup() {
    var byId = {};
    var bySlug = {};
    var C = global.CrozzoCatalogoMp;
    var prods =
      typeof global.products !== 'undefined' && Array.isArray(global.products) ? global.products : [];
    prods.forEach(function (p) {
      if (!p || !String(p.nombre || '').trim()) return;
      var precio = Math.round(Number(p.precio) || 0);
      if (p.id != null) byId[p.id] = precio;
      var slug =
        C && C.slugFromPosProduct
          ? C.slugFromPosProduct(p)
          : slugProducto(p.nombre);
      if (slug) bySlug[slug] = precio;
    });
    return { byId: byId, bySlug: bySlug };
  }

  function resolvePrecioPos(row, lookup) {
    row = row || {};
    lookup = lookup || getPosPrecioLookup();
    if (row.posProductId != null && lookup.byId[row.posProductId] != null) {
      return { precio: lookup.byId[row.posProductId], found: true };
    }
    if (row.slug && lookup.bySlug[row.slug] != null) {
      return { precio: lookup.bySlug[row.slug], found: true };
    }
    return { precio: null, found: false };
  }

  /** anterior = vigente (caja); nuevo = propuesto (costeo). */
  function calcDeltaPrecio(anterior, nuevo) {
    anterior = Math.round(Number(anterior) || 0);
    nuevo = Math.round(Number(nuevo) || 0);
    var diff = nuevo - anterior;
    var pct = null;
    if (anterior > 0) {
      pct = Math.round((diff / anterior) * 1000) / 10;
    } else if (nuevo > 0) {
      pct = null;
    } else {
      pct = 0;
    }
    return {
      anterior: anterior,
      nuevo: nuevo,
      diff: diff,
      pct: pct,
      igual: diff === 0,
      sube: diff > 0,
      baja: diff < 0,
      tieneAnterior: anterior > 0,
      tieneNuevo: nuevo > 0,
    };
  }

  function formatPctDelta(d) {
    if (!d || d.igual) return '0%';
    if (d.pct == null) return d.tieneNuevo ? 'nuevo' : '—';
    return (d.pct > 0 ? '+' : '') + String(d.pct) + '%';
  }

  function cmpStateFromDelta(d) {
    if (!d || (!d.tieneAnterior && !d.tieneNuevo)) return 'none';
    if (d.igual || (d.diff === 0 && d.tieneAnterior)) return 'eq';
    if (d.sube) return 'up';
    if (d.baja) return 'down';
    return 'none';
  }

  function renderComparativaPrecioInner(anterior, nuevo, opts) {
    opts = opts || {};
    var d = calcDeltaPrecio(anterior, nuevo);
    var state = cmpStateFromDelta(d);
    var labelAnt = opts.labelAnterior || 'caja';
    var labelNue = opts.labelNuevo || 'costeo';
    if (!d.tieneAnterior && !d.tieneNuevo) {
      return '<span class="crozzo-matriz-cmp crozzo-matriz-cmp--na">—</span>';
    }
    if (!d.tieneAnterior && d.tieneNuevo) {
      return (
        '<div class="crozzo-matriz-cmp crozzo-matriz-cmp--new">' +
        '<span class="crozzo-matriz-cmp__arrow" aria-hidden="true">→</span> ' +
        '<span class="crozzo-matriz-cmp__val">' +
        engFmt(d.nuevo) +
        '</span>' +
        '<span class="crozzo-matriz-cmp__sub">sin ' +
        esc(labelAnt) +
        '</span></div>'
      );
    }
    var cls = 'crozzo-matriz-cmp--' + state;
    var dirTxt = d.igual ? 'Sin cambio' : d.sube ? 'Sube' : 'Baja';
    var pctTxt = formatPctDelta(d);
    return (
      '<div class="crozzo-matriz-cmp ' +
      cls +
      '" title="' +
      esc(labelAnt) +
      ' ' +
      esc(String(d.anterior)) +
      ' → ' +
      esc(labelNue) +
      ' ' +
      esc(String(d.nuevo)) +
      '">' +
      '<span class="crozzo-matriz-cmp__dir">' +
      esc(dirTxt) +
      '</span>' +
      '<span class="crozzo-matriz-cmp__money">' +
      (d.diff > 0 ? '+' : '') +
      engFmt(d.diff) +
      '</span>' +
      '<span class="crozzo-matriz-cmp__pct">' +
      esc(pctTxt) +
      '</span>' +
      '<span class="crozzo-matriz-cmp__track">' +
      '<span class="crozzo-matriz-cmp__from">' +
      engFmt(d.anterior) +
      '</span>' +
      '<span class="crozzo-matriz-cmp__arrow" aria-hidden="true">→</span>' +
      '<span class="crozzo-matriz-cmp__to">' +
      engFmt(d.nuevo) +
      '</span></span></div>'
    );
  }

  function getRowComparativaCaja(row) {
    if (!row || !row.precioPosFound) return null;
    var neu = Math.round(Number(row.precioVenta) || 0);
    return calcDeltaPrecio(row.precioPos, neu);
  }

  function renderPrecioPosCell(row) {
    if (!row.precioPosFound || row.precioPos == null) {
      return (
        '<td style="text-align:right" class="crozzo-matriz-pos-cell" data-resumen-pos>' +
        '<span class="crozzo-matriz-pos crozzo-matriz-pos--na" title="Vincule el producto con ↻ Catálogo POS">—</span></td>'
      );
    }
    var pos = Math.round(row.precioPos);
    var menu = Math.round(row.precioVenta) || 0;
    var copyBtn =
      menu !== pos
        ? '<button type="button" class="crozzo-matriz-pos-copy" data-action="usar-precio-pos" title="Copiar precio de caja al precio de costeo">Usar en costeo</button>'
        : '';
    return (
      '<td style="text-align:right" class="crozzo-matriz-pos-cell" data-resumen-pos data-pos-precio="' +
      esc(String(pos)) +
      '">' +
      '<span class="crozzo-matriz-pos-val" title="Precio anterior / vigente en caja POS">' +
      engFmt(pos) +
      '</span>' +
      '<span class="crozzo-matriz-pos-lbl">vigente caja</span>' +
      copyBtn +
      '</td>'
    );
  }

  function renderComparativaPrecioCell(row) {
    var d = getRowComparativaCaja(row);
    var state = d ? cmpStateFromDelta(d) : 'none';
    var inner = d
      ? renderComparativaPrecioInner(d.anterior, d.nuevo, { labelAnterior: 'caja', labelNuevo: 'costeo' })
      : '<span class="crozzo-matriz-cmp crozzo-matriz-cmp--na" title="Sin precio de caja para comparar">—</span>';
    return (
      '<td class="crozzo-matriz-cmp-cell" data-resumen-cmp data-matriz-cmp="' +
      esc(state) +
      '">' +
      inner +
      '</td>'
    );
  }

  function computeComparativaResumen(seed) {
    var out = { sube: 0, baja: 0, iguales: 0, sinCaja: 0, total: 0, sumAnt: 0, sumNue: 0 };
    mergeResumenList(seed).forEach(function (row) {
      out.total++;
      if (!row.precioPosFound) {
        out.sinCaja++;
        return;
      }
      var d = getRowComparativaCaja(row);
      if (!d) return;
      out.sumAnt += d.anterior;
      out.sumNue += d.nuevo;
      if (d.igual) out.iguales++;
      else if (d.sube) out.sube++;
      else if (d.baja) out.baja++;
    });
    out.global = calcDeltaPrecio(out.sumAnt, out.sumNue);
    return out;
  }

  function renderComparativaResumenBar(seed) {
    var s = computeComparativaResumen(seed);
    var g = s.global;
    var globalHtml = '';
    if (s.sumAnt > 0 && s.total > s.sinCaja) {
      globalHtml =
        '<span class="crozzo-matriz-cmp-bar__global" title="Suma precios caja vs suma precios costeo">Total menú: ' +
        (g.diff > 0 ? '+' : '') +
        engFmt(g.diff) +
        ' <em>(' +
        esc(formatPctDelta(g)) +
        ')</em></span>';
    }
    return (
      '<div class="crozzo-matriz-cmp-bar" id="crozzoMatrizCmpBar">' +
      '<strong>Comparativa caja → costeo</strong> ' +
      '<span class="crozzo-matriz-cmp-bar__chip crozzo-matriz-cmp-bar__chip--up">' +
      esc(String(s.sube)) +
      ' suben</span> ' +
      '<span class="crozzo-matriz-cmp-bar__chip crozzo-matriz-cmp-bar__chip--down">' +
      esc(String(s.baja)) +
      ' bajan</span> ' +
      '<span class="crozzo-matriz-cmp-bar__chip crozzo-matriz-cmp-bar__chip--eq">' +
      esc(String(s.iguales)) +
      ' iguales</span>' +
      (s.sinCaja
        ? '<span class="crozzo-matriz-cmp-bar__chip crozzo-matriz-cmp-bar__chip--muted">' +
          esc(String(s.sinCaja)) +
          ' sin caja</span>'
        : '') +
      globalHtml +
      '</div>'
    );
  }

  function mergeResumenList(seed) {
    var posLookup = getPosPrecioLookup();
    return (seed.resumen || [])
      .filter(function (row) {
        var n = String(row.producto || '').trim();
        return n;
      })
      .map(function (row) {
        var slug = row.slug || slugProducto(row.producto);
        var tipo = row.tipoCosteo === 'directo' ? 'directo' : 'receta';
        var posPack = resolvePrecioPos(
          {
            slug: slug,
            posProductId: row.posProductId,
            producto: row.producto,
          },
          posLookup
        );
        return {
          slug: slug,
          producto: row.producto,
          costoMp: Number(row.costoMp),
          precioVenta: Number(row.precioVenta),
          precioPos: posPack.found ? posPack.precio : null,
          precioPosFound: posPack.found,
          categoria: row.categoria || '',
          posProductId: row.posProductId,
          origen: row.origen || 'menu',
          tipoCosteo: tipo,
          tipoReceta: row.tipoReceta || null,
          vendeAlCliente: !!row.vendeAlCliente,
          modoProceso: row.modoProceso || null,
          margenObjetivoPct: row.margenObjetivoPct,
          margenMinimoPct: row.margenMinimoPct,
          costeoMpSourceId: row.costeoMpSourceId || null,
          programaciones: row.programaciones || [],
          historialCosteo: row.historialCosteo || [],
          estadoFlujo: row.estadoFlujo || 'vigente',
          programadoPara: row.programadoPara || null,
          tieneReceta: platoTieneReceta(slug, tipo),
        };
      });
  }

  function sumPreciosPosResumen(seed) {
    var sum = 0;
    var n = 0;
    mergeResumenList(seed).forEach(function (row) {
      if (!row.precioPosFound) return;
      sum += Number(row.precioPos) || 0;
      n++;
    });
    return { sum: sum, count: n };
  }

  function matrizFallbackSeed() {
    return { version: 4, precios: {}, resumen: [], demoRecipe: { lineas: [], nombre: 'Demo' }, stats: {} };
  }

  function ensureMatrizMenuCompleto(done) {
    var C = global.CrozzoCatalogoMp;
    var settled = false;
    function safeDone(seed) {
      if (settled) return;
      settled = true;
      if (done) done(seed || hub.seed || matrizFallbackSeed());
    }
    var watchdog = setTimeout(function () {
      console.warn('[costos] ensureMatrizMenuCompleto timeout — render con datos locales');
      if (!hub.seed) hub.seed = matrizFallbackSeed();
      safeDone(hub.seed);
    }, 8000);
    function finish() {
      try {
        loadSeed(function (fresh) {
          try {
            syncMenuCostosDesdeFuentes(fresh, { force: false });
            if (C && C.syncHistorialVigenteDesdeMenu) {
              C.syncHistorialVigenteDesdeMenu({
                getCostoMp: function (row) {
                  return resolveCostoVentaMenu(row, fresh);
                },
                notas: 'Costeo vigente al abrir matriz',
              });
            }
            if (C && C.buildSeedForCostos) {
              hub.seed = C.buildSeedForCostos();
            } else {
              hub.seed = fresh;
            }
            invalidateMatrizCaches();
          } catch (e) {
            console.warn('[costos] ensureMatriz sync', e);
            hub.seed = fresh;
          }
          clearTimeout(watchdog);
          safeDone(hub.seed);
        });
      } catch (e) {
        clearTimeout(watchdog);
        console.error('[costos] ensureMatriz finish', e);
        safeDone(matrizFallbackSeed());
      }
    }
    function finishSoon() {
      finish();
    }
    if (!C || !C.ensureReady) {
      finishSoon();
      return;
    }
    var prepDone = false;
    var prepTimer = setTimeout(function () {
      if (prepDone) return;
      prepDone = true;
      console.warn('[costos] ensureReady prep timeout — continuando con catálogo local');
      finishSoon();
    }, 5000);
    C.ensureReady(function () {
      if (prepDone) return;
      prepDone = true;
      clearTimeout(prepTimer);
      try {
        if (C.ensureMenuPosProductos) C.ensureMenuPosProductos({ silent: true, keepCostos: true });
        if (C.ejecutarProgramacionesMenuPendientes) C.ejecutarProgramacionesMenuPendientes({ silent: true });
        if (C.ejecutarProgramacionesPendientes) C.ejecutarProgramacionesPendientes({ silent: true });
        if (C.ejecutarProgramacionesRecetasPendientes) C.ejecutarProgramacionesRecetasPendientes({ silent: true });
        if (C.ensureMpFromPosVentaDirecta) C.ensureMpFromPosVentaDirecta({ silent: true });
      } catch (e) {
        console.warn('[costos] ensureMatriz prep', e);
      }
      finishSoon();
    });
  }

  function getObjetivoMargenFraccion() {
    return loadGlobalCostoObjetivoPct() / 100;
  }

  function getObjetivoCostoFraccion() {
    return getObjetivoMargenFraccion();
  }

  /** Compara % costo MP vs meta global y subida del costo MP guardado. */
  function evaluarPlatoObjetivo(r, row, seed) {
    seed = seed || hub.seed;
    var objCosto = getObjetivoCostoFraccion();
    var actualCosto = Number(r && r.pctCostoMp) || 0;
    var costoVivo = row ? resolveCostoVentaMenu(row, seed) : 0;
    var costoBase = row ? Number(row.costoMp) || 0 : 0;
    var sub = { subidaPct: 0, alerta: 'ok' };
    if (costoBase > 0 && costoVivo > costoBase + 0.5) {
      var pctSub = ((costoVivo - costoBase) / costoBase) * 100;
      if (pctSub >= 1) sub = evaluarSubidaMp(costoVivo, costoBase);
    }
    var dentroObjetivo = actualCosto <= objCosto + 0.008;
    return {
      objetivoPct: objCosto,
      minimoPct: loadGlobalMpAlertaSubidaPct() / 100,
      actualPct: actualCosto,
      subidaMpPct: sub.subidaPct / 100,
      alertaSubida: sub.alerta,
      dentroObjetivo: dentroObjetivo,
      enTolerancia: sub.alerta === 'ok',
      bajoTolerancia: sub.alerta === 'crit',
      deficitPct: Math.max(0, actualCosto - objCosto),
      deficitMinPct: 0,
    };
  }

  function listAlertasMargenBajo(seed) {
    var e = engine();
    if (!e) return [];
    var s = seed || hub.seed || { resumen: [] };
    return mergeResumenList(s)
      .map(function (row) {
        var costo = resolveCostoVentaMenu(row, s);
        var r = e.calcularResumen(costo > 0 ? costo : row.costoMp, row.precioVenta);
        var ev = evaluarPlatoObjetivo(r, row, s);
        return {
          row: row,
          r: r,
          ev: ev,
          costoMp: costo > 0 ? costo : row.costoMp,
        };
      })
      .filter(function (x) {
        return x.ev.bajoTolerancia && x.row.precioVenta > 0;
      });
  }

  function computeMatrizPortfolio(seed) {
    var e = engine();
    var list = mergeResumenList(seed);
    var obj = getObjetivoMargenFraccion();
    var out = {
      total: list.length,
      ok: 0,
      alert: 0,
      crit: 0,
      avgPctCosto: 0,
      avgPctUtil: 0,
      sumVenta: 0,
      sumCosto: 0,
      sumUtil: 0,
      pctUtilIntegrado: 0,
      pctCostoIntegrado: 0,
      pctOk: 0,
      pctAlert: 0,
      pctCrit: 0,
      objetivoMargen: obj,
    };
    if (!e || !list.length) return out;
    var recetaCache = {};
    list.forEach(function (row) {
      var costo = resolveCostoVentaMenu(row, seed, recetaCache);
      var costoMp = costo > 0 ? costo : row.costoMp;
      var r = e.calcularResumen(costoMp, row.precioVenta);
      var ev = evaluarPlatoObjetivo(r, row, seed);
      if (ev.bajoTolerancia) out.crit++;
      else if (ev.alertaSubida === 'warn' || !ev.dentroObjetivo) out.alert++;
      else out.ok++;
      out.avgPctCosto += r.pctCostoMp;
      out.avgPctUtil += r.pctUtilidad;
      out.sumVenta += row.precioVenta;
      out.sumCosto += costoMp;
      out.sumUtil += r.utilidadBruta;
    });
    out.avgPctCosto /= list.length;
    out.avgPctUtil /= list.length;
    out.pctUtilIntegrado = out.sumVenta > 0 ? out.sumUtil / out.sumVenta : 0;
    out.pctCostoIntegrado = out.sumVenta > 0 ? out.sumCosto / out.sumVenta : 0;
    out.pctOk = out.ok / list.length;
    out.pctAlert = out.alert / list.length;
    out.pctCrit = out.crit / list.length;
    return out;
  }

  function renderObjetivoBarHtml(pctCostoMp, objetivoCostoFraccion) {
    var actual = Math.round((Number(pctCostoMp) || 0) * 100);
    var obj = Math.round((Number(objetivoCostoFraccion) || 0.3) * 100);
    var maxScale = Math.max(obj * 1.75, actual, 35);
    var fillW = Math.min(100, Math.round((actual / maxScale) * 100));
    var markW = Math.min(98, Math.round((obj / maxScale) * 100));
    var state = actual <= obj ? 'ok' : actual <= obj * 1.15 ? 'warn' : 'crit';
    return (
      '<div class="crozzo-matriz-obj-bar" title="Costo MP ' +
      esc(String(actual)) +
      '% · línea dorada = meta ' +
      esc(String(obj)) +
      '%">' +
      '<div class="crozzo-matriz-fc__track"><div class="crozzo-matriz-fc__fill crozzo-matriz-fc__fill--' +
      state +
      '" style="width:' +
      esc(String(fillW)) +
      '%"></div>' +
      '<span class="crozzo-matriz-fc__target" style="left:' +
      esc(String(markW)) +
      '%"></span></div>' +
      '<span class="crozzo-matriz-fc__pct">' +
      esc(String(actual)) +
      '%</span></div>'
    );
  }

  function renderMatrizStatusPill(ev) {
    var metaCosto = Math.round((ev.objetivoPct || 0) * 100);
    var actualCosto = Math.round((ev.actualPct || 0) * 100);
    var subida = Math.round((ev.subidaMpPct || 0) * 1000) / 10;
    var alertaSub = ev.alertaSubida || 'ok';
    if (ev.bajoTolerancia || alertaSub === 'crit') {
      return (
        '<span class="crozzo-matriz-status crozzo-matriz-status--crit" title="Costo MP subió ≥ ' +
        esc(String(Math.round(loadGlobalMpAlertaSubidaPct()))) +
        '% vs guardado"><span aria-hidden="true">⚠</span> MP +' +
        esc(String(subida)) +
        '% · alerta roja</span>'
      );
    }
    if (alertaSub === 'warn') {
      return (
        '<span class="crozzo-matriz-status crozzo-matriz-status--warn" title="Subida MP ≥ mitad del umbral"><span aria-hidden="true">↑</span> MP +' +
        esc(String(subida)) +
        '% · revise</span>'
      );
    }
    if (ev.dentroObjetivo) {
      return (
        '<span class="crozzo-matriz-status crozzo-matriz-status--ok"><span aria-hidden="true">✓</span> Costo ' +
        esc(String(actualCosto)) +
        '% · meta ' +
        esc(String(metaCosto)) +
        '%</span>'
      );
    }
    return (
      '<span class="crozzo-matriz-status crozzo-matriz-status--warn"><span aria-hidden="true">↑</span> ' +
      esc(String(actualCosto)) +
      '% costo · meta ' +
      esc(String(metaCosto)) +
      '%</span>'
    );
  }

  function renderMatrizAlertsBanner(seed) {
    var alertas = listAlertasMargenBajo(seed);
    var umbral = Math.round(loadGlobalMpAlertaSubidaPct());
    if (!alertas.length) {
      return (
        '<div class="crozzo-matriz-alerts crozzo-matriz-alerts--ok" role="status">' +
        '<span>✓ Ningún plato con subida crítica de costo MP (umbral ' +
        esc(String(umbral)) +
        '%).</span></div>'
      );
    }
    var items = alertas
      .slice(0, 8)
      .map(function (x) {
        var sub = Math.round((x.ev.subidaMpPct || 0) * 1000) / 10;
        return (
          '<li><strong>' +
          esc(x.row.producto) +
          '</strong>: MP +' +
          esc(String(sub)) +
          '% · costo $' +
          esc(String(Math.round(x.costoMp))) +
          ' · umbral ' +
          esc(String(umbral)) +
          '%</li>'
        );
      })
      .join('');
    var more =
      alertas.length > 8
        ? '<li>… y ' + esc(String(alertas.length - 8)) + ' más (filtre «Pérdida»)</li>'
        : '';
    return (
      '<div class="crozzo-matriz-alerts crozzo-matriz-alerts--crit" role="alert">' +
      '<strong>⚠ ' +
      esc(String(alertas.length)) +
      ' producto(s) con subida crítica de MP</strong> — revise precio de venta o negocie insumo.' +
      '<ul class="crozzo-matriz-alerts__list">' +
      items +
      more +
      '</ul></div>'
    );
  }

  function renderMatrizLeyenda() {
    var metaCosto = Math.round(loadGlobalCostoObjetivoPct());
    var alertaMp = Math.round(loadGlobalMpAlertaSubidaPct());
    return (
      '<details class="crozzo-matriz-leyenda">' +
      '<summary>¿Cómo leer esta tabla?</summary>' +
      '<div class="crozzo-matriz-leyenda__body">' +
      '<p><strong>Meta de costo MP (' +
      esc(String(metaCosto)) +
      '%):</strong> % del precio de venta que puede ser materia prima. Si un plato cuesta $8.000 en MP y la meta es 30%, el precio sugerido es $26.667.</p>' +
      '<ul>' +
      '<li><strong>Columnas (como hoja QyC):</strong> Costo MP → Utilidad bruta $ → % costo MP → % utilidad → Precio de venta. Caja y comparativa son extra POS.</li>' +
      '<li><strong>% costo MP</strong> (editable): costo ÷ precio venta. <strong>% utilidad</strong> = 100% − costo (solo lectura).</li>' +
      '<li><strong>vs Meta</strong>: barra = costo actual; <span class="crozzo-matriz-leyenda__mark">línea dorada</span> = tu meta. Verde = dentro del costo pactado.</li>' +
      '<li><strong>Alerta subida MP (' +
      esc(String(alertaMp)) +
      '%):</strong> compara costo MP vivo vs guardado. ≥ mitad (' +
      esc(String(Math.round(alertaMp / 2))) +
      '%) → naranja; ≥ ' +
      esc(String(alertaMp)) +
      '% → roja.</li>' +
      '<li><strong>Costo MP</strong>: venta directa = costeo unitario; con receta = explosión de insumos. Use «Sincronizar costos» para guardar en menú.</li>' +
      '<li><strong>TOTAL MENÚ</strong> (fila final): suma de costos ÷ suma de precios (no es el promedio de arriba).</li>' +
      '<li><strong>Receta</strong> = plato con insumos en pestaña Recetas. <strong>Venta directa</strong> = bebidas empaquetadas, etc.</li>' +
      '<li><strong>Nuevo plato:</strong> queda en <strong>borrador</strong> hasta que lo <strong>lance</strong> o <strong>programe</strong>.</li>' +
      '<li><strong>Programar precio:</strong> al guardar un precio puede fijar fecha para actualizar la caja POS automáticamente.</li>' +
      '<li><strong>Precio caja (anterior):</strong> vigente en POS. <strong>Precio costeo (nuevo):</strong> propuesta editable.</li>' +
      '<li><strong>Comparativa:</strong> diferencia en pesos y % entre anterior y nuevo (caja → costeo).</li>' +
      '</ul></div></details>'
    );
  }

  function enrichHistorialConComparativa(rows) {
    var bySlug = {};
    rows.forEach(function (x) {
      if (!bySlug[x.slug]) bySlug[x.slug] = [];
      bySlug[x.slug].push(x);
    });
    var enriched = [];
    Object.keys(bySlug).forEach(function (slug) {
      var arr = bySlug[slug].sort(function (a, b) {
        return String(a.historial.periodo).localeCompare(String(b.historial.periodo));
      });
      var prevCosto = null;
      var prevPrecio = null;
      arr.forEach(function (x) {
        var h = x.historial;
        enriched.push({
          slug: x.slug,
          producto: x.producto,
          historial: h,
          cmpCosto: prevCosto != null ? calcDeltaPrecio(prevCosto, h.costoMp) : null,
          cmpPrecio: prevPrecio != null ? calcDeltaPrecio(prevPrecio, h.precioVenta) : null,
        });
        prevCosto = h.costoMp;
        prevPrecio = h.precioVenta;
      });
    });
    enriched.sort(function (a, b) {
      var c = String(b.historial.periodo).localeCompare(String(a.historial.periodo));
      if (c !== 0) return c;
      return String(a.producto).localeCompare(String(b.producto), 'es');
    });
    return enriched;
  }

  function renderHistorialCmpCell(d, tipo) {
    if (!d || !d.tieneAnterior) {
      return '<span class="crozzo-matriz-cmp crozzo-matriz-cmp--na">1.er registro</span>';
    }
    return renderComparativaPrecioInner(d.anterior, d.nuevo, {
      labelAnterior: 'periodo ant.',
      labelNuevo: tipo || 'actual',
    });
  }

  function renderHistorialMargenEstado(h) {
    var a = h.alertaMargen || 'ok';
    var min = h.margenMinimoPct != null ? h.margenMinimoPct : loadGlobalMargenMinimoPct();
    var obj = h.margenObjetivoPct != null ? h.margenObjetivoPct : loadGlobalMargenPct();
    var real = h.margenRealPct;
    if (a === 'crit') {
      return (
        '<span class="crozzo-matriz-status crozzo-matriz-status--crit" title="Margen real bajo el mínimo (' +
        esc(String(min)) +
        '%)">⚠ Bajo mín.</span>'
      );
    }
    if (a === 'warn') {
      return (
        '<span class="crozzo-matriz-status crozzo-matriz-status--warn" title="Bajo meta ' +
        esc(String(obj)) +
        '%">↓ Bajo meta</span>'
      );
    }
    return '<span class="crozzo-matriz-status crozzo-matriz-status--ok">✓ OK</span>';
  }

  function renderHistorialCosteoAlertsBanner(enriched, rowsVigente) {
    var C = global.CrozzoCatalogoMp;
    var pv = C && C.PERIODO_COSTEO_VIGENTE ? C.PERIODO_COSTEO_VIGENTE : 'vigente';
    var base = rowsVigente && rowsVigente.length ? rowsVigente : enriched;
    var crit = base.filter(function (x) {
      return (
        x.historial &&
        x.historial.alertaMargen === 'crit' &&
        (!rowsVigente || x.historial.periodo === pv)
      );
    });
    if (!crit.length) {
      return (
        '<div class="crozzo-matriz-alerts crozzo-matriz-alerts--ok" style="margin-bottom:10px">' +
        '<span>✓ Ningún costeo guardado está bajo el margen mínimo configurado.</span></div>'
      );
    }
    var items = crit
      .slice(0, 6)
      .map(function (x) {
        return (
          '<li><strong>' +
          esc(x.producto) +
          '</strong> (' +
          esc(x.historial.label || x.historial.periodo) +
          '): margen ' +
          esc(String(x.historial.margenRealPct)) +
          '% · mín. ' +
          esc(String(x.historial.margenMinimoPct != null ? x.historial.margenMinimoPct : loadGlobalMargenMinimoPct())) +
          '%</li>'
        );
      })
      .join('');
    return (
      '<div class="crozzo-matriz-alerts crozzo-matriz-alerts--crit" style="margin-bottom:10px" role="alert">' +
      '<strong>⚠ ' +
      esc(String(crit.length)) +
      ' registro(s) bajo margen mínimo</strong> — la MP subió y el precio de venta no alcanzó a compensar.' +
      '<ul class="crozzo-matriz-alerts__list">' +
      items +
      '</ul></div>'
    );
  }

  function historialRowsPreferVigente(rows) {
    var C = global.CrozzoCatalogoMp;
    var pv = C && C.PERIODO_COSTEO_VIGENTE ? C.PERIODO_COSTEO_VIGENTE : 'vigente';
    var vig = rows.filter(function (x) {
      return x.historial && x.historial.periodo === pv;
    });
    return vig.length ? vig : rows;
  }

  /** Pestaña Costeos guardados: solo lectura, costos en tiempo real (unitario / recetas). */
  function renderCosteoGuardadoPanel(seed) {
    var e = engine();
    var C = global.CrozzoCatalogoMp;
    var list = mergeResumenList(seed || hub.seed || { resumen: [] });
    var pv = C && C.PERIODO_COSTEO_VIGENTE ? C.PERIODO_COSTEO_VIGENTE : 'vigente';
    var rowsHist = C && C.listHistorialCosteoAll ? C.listHistorialCosteoAll() : [];
    var archivo = rowsHist.filter(function (x) {
      return x.historial && x.historial.periodo !== pv;
    });

    var bodyRows = '';
    if (!e || !list.length) {
      bodyRows =
        '<tr><td colspan="8">Sin productos. Sincronice el catálogo POS en «Precios vigentes».</td></tr>';
    } else {
      bodyRows = list
        .map(function (row) {
          var costoMp = resolveCostoVentaMenu(row, seed);
          if (!costoMp || costoMp <= 0) costoMp = Number(row.costoMp) || 0;
          var posPack = resolvePrecioPos(row);
          var precioCaja = posPack.found ? posPack.precio : row.precioVenta;
          var precioMen = Number(row.precioVenta) || 0;
          var r = e.calcularResumen(costoMp, precioMen);
          var ev = evaluarPlatoObjetivo(r, row, seed);
          var margenDisplay = precioMen > 0 ? Math.round(r.pctUtilidad * 1000) / 10 : 0;
          var fuente =
            row.tipoCosteo === 'directo'
              ? '<span class="crozzo-matriz-costo-tag crozzo-matriz-costo-tag--mp">◎ unit.</span>'
              : '<span class="crozzo-matriz-costo-tag">◎ receta</span>';
          var rowCls = ev.bajoTolerancia
            ? 'crozzo-matriz-row--crit'
            : ev.alertaSubida === 'warn' || !ev.dentroObjetivo
              ? 'crozzo-matriz-row--warn'
              : 'crozzo-matriz-row--ok';
          return (
            '<tr class="' +
            rowCls +
            '"><td><span class="crozzo-matriz-product">' +
            esc(row.producto) +
            '</span></td><td style="text-align:right" class="crozzo-matriz-costo-val">' +
            engFmt(costoMp) +
            ' ' +
            fuente +
            '</td><td style="text-align:right">' +
            (posPack.found ? engFmt(precioCaja) : '—') +
            '</td><td style="text-align:right">' +
            engFmt(precioMen) +
            '</td><td style="text-align:right"><strong>' +
            esc(String(margenDisplay)) +
            '%</strong></td><td>' +
            renderMatrizStatusPill(ev) +
            '</td><td class="crozzo-matriz-cmp-cell">' +
            (posPack.found
              ? renderComparativaPrecioInner(precioCaja, precioMen, {
                  labelAnterior: 'caja',
                  labelNuevo: 'menú',
                })
              : '—') +
            '</td><td style="font-size:.8rem;opacity:.85">Actualización automática</td></tr>'
          );
        })
        .join('');
    }

    var archivoHtml = '';
    if (archivo.length) {
      var enrichedArch = enrichHistorialConComparativa(archivo);
      archivoHtml =
        '<details class="crozzo-matriz-archivo-mes"><summary>Archivo por mes (' +
        esc(String(archivo.length)) +
        ' registros)</summary>' +
        renderHistorialCosteoArchivoTable(enrichedArch) +
        '</details>';
    }

    return (
      '<div class="crozzo-matriz-readonly-banner" role="status">' +
      '<strong>Solo lectura</strong> — refleja costos en tiempo real (costeo unitario y recetas). Para probar precios use la pestaña <em>Precios vigentes</em>.' +
      '</div>' +
      renderHistorialCosteoAlertsBanner(
        list.map(function (row) {
          var costoMp = resolveCostoVentaMenu(row, seed) || row.costoMp;
          var r = e ? e.calcularResumen(costoMp, row.precioVenta) : { pctUtilidad: 0 };
          var ev = evaluarPlatoObjetivo(r, row, seed);
          return {
            producto: row.producto,
            historial: {
              label: 'Vigente (actual)',
              periodo: pv,
              margenRealPct: Math.round(r.pctUtilidad * 1000) / 10,
              margenMinimoPct: row.margenMinimoPct,
              alertaMargen: ev.bajoTolerancia ? 'crit' : ev.alertaSubida === 'warn' ? 'warn' : 'ok',
            },
          };
        })
      ) +
      '<div class="crozzo-costos-scroll crozzo-costos-scroll--tall crozzo-matriz-panel--readonly">' +
      '<table class="crozzo-costos-feed-table crozzo-matriz-table--readonly"><thead><tr>' +
      '<th>Producto</th><th style="text-align:right">Costo MP (vivo)</th><th style="text-align:right">Caja</th><th style="text-align:right">Precio menú</th><th style="text-align:right">Margen</th><th>Estado</th><th>Comparativa</th><th>Origen</th>' +
      '</tr></thead><tbody>' +
      bodyRows +
      '</tbody></table></div>' +
      archivoHtml
    );
  }

  function renderHistorialCosteoArchivoTable(enriched) {
    return (
      '<div class="crozzo-costos-scroll" style="max-height:280px;margin-top:10px"><table class="crozzo-costos-feed-table"><thead><tr>' +
      '<th>Periodo</th><th>Producto</th><th style="text-align:right">Costo</th><th>Δ costo</th><th style="text-align:right">Venta</th><th>Δ venta</th>' +
      '<th style="text-align:right">Meta %</th><th style="text-align:right">Mín. %</th><th style="text-align:right">Margen real</th><th>Control</th><th>Notas</th>' +
      '</tr></thead><tbody>' +
      enriched
        .map(function (x) {
          var h = x.historial;
          var rowCls = h.alertaMargen === 'crit' ? ' class="crozzo-matriz-row--crit"' : '';
          return (
            '<tr' +
            rowCls +
            '><td>' +
            esc(h.label || h.periodo) +
            '</td><td>' +
            esc(x.producto) +
            '</td><td style="text-align:right">$' +
            esc(String(h.costoMp)) +
            (h.costoMpAnterior != null
              ? '<span class="crozzo-matriz-pos-lbl">antes $' + esc(String(h.costoMpAnterior)) + '</span>'
              : '') +
            '</td><td class="crozzo-matriz-cmp-cell">' +
            renderHistorialCmpCell(x.cmpCosto, 'costo') +
            '</td><td style="text-align:right">$' +
            esc(String(h.precioVenta)) +
            (h.precioVentaAnterior != null
              ? '<span class="crozzo-matriz-pos-lbl">antes $' + esc(String(h.precioVentaAnterior)) + '</span>'
              : '') +
            '</td><td class="crozzo-matriz-cmp-cell">' +
            renderHistorialCmpCell(x.cmpPrecio, 'precio') +
            '</td><td style="text-align:right">' +
            (h.margenObjetivoPct != null ? esc(String(h.margenObjetivoPct)) + '%' : '—') +
            '</td><td style="text-align:right">' +
            (h.margenMinimoPct != null ? esc(String(h.margenMinimoPct)) + '%' : '—') +
            '</td><td style="text-align:right"><strong>' +
            (h.margenRealPct != null ? esc(String(h.margenRealPct)) + '%' : '—') +
            '</strong></td><td>' +
            renderHistorialMargenEstado(h) +
            '</td><td style="font-size:.8rem;opacity:.85">' +
            esc(h.notas || '') +
            (h.mpOrigenNombre ? '<span class="crozzo-matriz-pos-lbl">' + esc(h.mpOrigenNombre) + '</span>' : '') +
            '</td></tr>'
          );
        })
        .join('') +
      '</tbody></table></div>'
    );
  }

  function renderHistorialCosteoPanel(seed) {
    return renderCosteoGuardadoPanel(seed);
  }

  function renderProgramacionesPanel() {
    var C = global.CrozzoCatalogoMp;
    var rows = C && C.listProgramacionesAll ? C.listProgramacionesAll() : [];
    var fmtVig = C && C.formatVigenciaDisplay ? C.formatVigenciaDisplay.bind(C) : function (v) { return v || '—'; };
    if (!rows.length) {
      return '<p class="crozzo-costos-note">Sin programaciones. Use «Programar actualización» con fecha y hora, o programe un plato al guardar su precio.</p>';
    }
    return (
      '<div class="crozzo-costos-scroll crozzo-costos-scroll--tall"><table class="crozzo-costos-feed-table"><thead><tr>' +
      '<th>Vigencia</th><th>Producto</th><th style="text-align:right">Caja (actual)</th><th style="text-align:right">Precio prog.</th><th>Comparativa</th><th>Estado</th><th>Notas</th>' +
      '</tr></thead><tbody>' +
      rows
        .map(function (x) {
          var p = x.programacion;
          var stCls =
            p.estado === 'aplicada' ? 'ok' : p.estado === 'cancelada' ? 'muted' : 'warn';
          var isMenu = p.tipo === 'menu';
          var posPack = isMenu ? { found: false } : resolvePrecioPos({ slug: x.slug, producto: x.producto });
          var posVal = posPack.found ? posPack.precio : null;
          var cmpHtml = isMenu
            ? '<span class="crozzo-matriz-cmp crozzo-matriz-cmp--eq">' +
              esc(
                (p.resumen
                  ? p.resumen.lanzar + ' nuevos · ' + p.resumen.actualizar + ' precios · ' + p.resumen.ocultar + ' ocultos'
                  : 'menú completo') || 'menú completo'
              ) +
              '</span>'
            : posPack.found && p.estado === 'pendiente'
              ? renderComparativaPrecioInner(posPack.precio, p.precioVenta, {
                  labelAnterior: 'caja',
                  labelNuevo: 'programado',
                })
              : p.estado === 'aplicada'
                ? '<span class="crozzo-matriz-cmp crozzo-matriz-cmp--eq">aplicado</span>'
                : '—';
          return (
            '<tr><td>' +
            esc(fmtVig(p.vigenciaDesde)) +
            '</td><td>' +
            esc(x.producto) +
            '</td><td style="text-align:right">' +
            (isMenu ? '—' : posVal != null ? engFmt(posVal) : '—') +
            '</td><td style="text-align:right">' +
            (isMenu
              ? '—'
              : '<strong>$' + esc(String(p.precioVenta)) + '</strong>') +
            '</td><td class="crozzo-matriz-cmp-cell">' +
            cmpHtml +
            '</td><td><span class="crozzo-matriz-status crozzo-matriz-status--' +
            stCls +
            '">' +
            esc(p.estado) +
            '</span></td><td style="font-size:.8rem">' +
            esc(p.notas || '') +
            (p.aplicarPos && !isMenu ? ' · POS' : '') +
            '</td></tr>'
          );
        })
        .join('') +
      '</tbody></table></div>'
    );
  }

  function renderMatrizTabsNav(activeTab) {
    activeTab = activeTab || 'resumen';
    var steps = [
      { id: 'costeo-mp', num: '1', icon: '⚖', title: 'Insumos', sub: 'Precio por gramo o unidad' },
      { id: 'demo', num: '2', icon: '🍽', title: 'Recetas', sub: 'Ingredientes del plato' },
      { id: 'resumen', num: '3', icon: '💰', title: 'Precios menú', sub: 'Márgenes y publicar caja' },
    ];
    return (
      '<div class="crozzo-matriz-tabs-wrap">' +
      '<p class="crozzo-matriz-tabs__hint">Pasos <strong>1 → 2 → 3</strong>. El <strong>resumen y publicación</strong> están en el paso 3.</p>' +
      '<div class="crozzo-mod-nav crozzo-mod-nav--segmented crozzo-costos-tabs crozzo-costos-matriz-tabs crozzo-matriz-tabs" role="tablist" aria-label="Pasos para costear">' +
      steps
        .map(function (s) {
          var on = s.id === activeTab;
          return (
            '<button type="button" class="crozzo-mod-nav__item' +
            (on ? ' active' : '') +
            '" role="tab" aria-selected="' +
            (on ? 'true' : 'false') +
            '" data-matriz-tab="' +
            esc(s.id) +
            '">' +
            '<span class="crozzo-matriz-tab__step" aria-hidden="true">' +
            esc(s.num) +
            '</span>' +
            '<span class="crozzo-matriz-tab__icon" aria-hidden="true">' +
            esc(s.icon) +
            '</span>' +
            '<span class="crozzo-matriz-tab__text"><strong>' +
            esc(s.title) +
            '</strong><small>' +
            esc(s.sub) +
            '</small></span></button>'
          );
        })
        .join('') +
      '</div></div>'
    );
  }

  function renderMatrizPanelIntro(tabId, seed) {
    seed = seed || hub.seed || { resumen: [] };
    if (tabId === 'costeo-mp') {
      var mpN = global.CrozzoCatalogoMp && global.CrozzoCatalogoMp.list ? global.CrozzoCatalogoMp.list().length : 0;
      return (
        '<p class="crozzo-matriz-panel-head crozzo-matriz-panel-head--step">' +
        '<span class="crozzo-matriz-panel-head__badge">Paso 1</span> ' +
        'Registre cuánto pagó por cada insumo (lote, peso, $/g). Las facturas de compra pueden llenar esto solas.</p>'
      );
    }
    if (tabId === 'demo') {
      return (
        '<p class="crozzo-matriz-panel-head crozzo-matriz-panel-head--step">' +
        '<span class="crozzo-matriz-panel-head__badge">Paso 2</span> ' +
        'Elija un plato, agregue insumos con cantidades y guarde. El costo y precio sugerido salen solos.</p>'
      );
    }
    var list = mergeResumenList(seed);
    var conReceta = list.filter(function (r) {
      return r.tieneReceta;
    }).length;
    var ventaDirecta = list.length - conReceta;
    if (!list.length) {
      return (
        '<div class="crozzo-matriz-panel-head crozzo-matriz-panel-head--empty">' +
        '<p><span class="crozzo-matriz-panel-head__badge">Paso 3</span> <strong>Aún no hay platos para costear.</strong></p>' +
        '<p class="crozzo-matriz-panel-head__hint">Pulse <strong>↻ Traer platos del POS</strong> o cree uno con <strong>+</strong>. Complete pasos 1 y 2 si hace falta.</p></div>'
      );
    }
    return (
      '<p class="crozzo-matriz-panel-head crozzo-matriz-panel-head--step">' +
      '<span class="crozzo-matriz-panel-head__badge">Paso 3</span> ' +
      '<strong>' +
      esc(String(list.length)) +
      ' platos</strong> · ' +
      esc(String(conReceta)) +
      ' con receta · ' +
      esc(String(ventaDirecta)) +
      ' venta directa (bebidas). ' +
      'Ajuste precio y margen aquí; la caja cambia solo al <strong>publicar</strong> (Centro de acciones ◈).</p>'
    );
  }

  function matrizAlertStateCostoPct(actualFrac, objCostFrac) {
    if (actualFrac <= objCostFrac + 0.008) return 'ok';
    if (actualFrac <= objCostFrac * 1.15) return 'warn';
    return 'crit';
  }

  function matrizAlertStateUtilPct(actualFrac, objUtilFrac) {
    if (actualFrac >= objUtilFrac - 0.008) return 'ok';
    if (actualFrac >= objUtilFrac * 0.85) return 'warn';
    return 'crit';
  }

  function matrizAlertStateCumplimiento(portfolio) {
    if (portfolio.crit > 0) return 'crit';
    if (portfolio.alert > 0) return 'warn';
    return 'ok';
  }

  function matrizKpiGaugeCumplimientoHtml(pctOkFrac, state) {
    var fillW = Math.min(100, Math.round((pctOkFrac || 0) * 100));
    return (
      '<div class="crozzo-matriz-kpi__gauge" title="Verde = bien · naranja = revisar · rojo = fuera de meta">' +
      '<div class="crozzo-matriz-kpi__gauge-fill crozzo-matriz-kpi__gauge-fill--' +
      state +
      '" style="width:' +
      esc(String(fillW)) +
      '%"></div>' +
      '<span class="crozzo-matriz-kpi__gauge-mark" style="left:98%" title="Meta 100% platos cumplen"></span></div>'
    );
  }

  function matrizKpiGaugeHtml(actualFrac, objFrac, alertKind) {
    var scale = alertKind === 'util' ? Math.max(objFrac * 1.5, 0.01) : Math.max(objFrac * 1.75, 0.01);
    var fillW = Math.min(100, Math.round((actualFrac / scale) * 100));
    var markW = Math.min(98, Math.round((objFrac / scale) * 100));
    var state =
      alertKind === 'util'
        ? matrizAlertStateUtilPct(actualFrac, objFrac)
        : matrizAlertStateCostoPct(actualFrac, objFrac);
    return (
      '<div class="crozzo-matriz-kpi__gauge" title="Verde = bien · naranja = revisar · rojo = fuera de meta">' +
      '<div class="crozzo-matriz-kpi__gauge-fill crozzo-matriz-kpi__gauge-fill--' +
      state +
      '" style="width:' +
      esc(String(fillW)) +
      '%"></div>' +
      '<span class="crozzo-matriz-kpi__gauge-mark" style="left:' +
      esc(String(markW)) +
      '%" title="Meta"></span></div>'
    );
  }

  function renderMatrizHero(seed, portfolio) {
    portfolio = portfolio || computeMatrizPortfolio(seed);
    var objCostFrac = portfolio.objetivoMargen;
    var objUtilFrac = 1 - objCostFrac;
    var objCostPct = Math.round(objCostFrac * 100);
    var objUtilPct = Math.round(objUtilFrac * 100);
    var costoPct = Math.round(portfolio.avgPctCosto * 1000) / 10;
    var utilPct = Math.round(portfolio.avgPctUtil * 1000) / 10;
    var alertas = portfolio.alert + portfolio.crit;
    var costoState = matrizAlertStateCostoPct(portfolio.avgPctCosto, objCostFrac);
    var utilState = matrizAlertStateUtilPct(portfolio.avgPctUtil, objUtilFrac);
    var okPct = Math.round(portfolio.pctOk * 100);
    var cumplState = matrizAlertStateCumplimiento(portfolio);

    return (
      '<header class="crozzo-matriz-hero" id="crozzoMatrizHero">' +
      '<div class="crozzo-matriz-hero__glow" aria-hidden="true"></div>' +
      '<div class="crozzo-matriz-hero__top">' +
      '<div class="crozzo-matriz-hero__brand">' +
      '<span class="crozzo-matriz-hero__glyph" aria-hidden="true">◈</span>' +
      '<div><p class="crozzo-matriz-hero__eyebrow">Costos del menú</p>' +
      '<h1 class="crozzo-matriz-hero__title">Costos y márgenes</h1>' +
      '<p class="crozzo-matriz-hero__sub">Pasos <strong>1 insumos → 2 recetas → 3 precios</strong>. Abajo edita y publica en caja.</p></div></div>' +
      (getRevisionActiva()
        ? '<div class="crozzo-matriz-hero__actions"><span class="crozzo-revision-live"><span class="crozzo-revision-live__dot" aria-hidden="true"></span>Revisión activa</span></div>'
        : '') +
      '</div>' +
      '<div class="crozzo-matriz-kpis crozzo-matriz-kpis--simple" id="crozzoMatrizKpis">' +
      '<article class="crozzo-matriz-kpi crozzo-matriz-kpi--primary">' +
      '<span class="crozzo-matriz-kpi__label">Costo MP · promedio</span>' +
      '<strong class="crozzo-matriz-kpi__value crozzo-matriz-kpi__value--' +
      costoState +
      '" data-kpi="avg-costo">' +
      esc(String(costoPct)) +
      '%</strong>' +
      matrizKpiGaugeHtml(portfolio.avgPctCosto, objCostFrac, 'costo') +
      '<span class="crozzo-matriz-kpi__hint">Promedio de todos los platos · meta ' +
      esc(String(objCostPct)) +
      '%</span></article>' +
      '<article class="crozzo-matriz-kpi crozzo-matriz-kpi--primary">' +
      '<span class="crozzo-matriz-kpi__label">Utilidad bruta · promedio</span>' +
      '<strong class="crozzo-matriz-kpi__value crozzo-matriz-kpi__value--' +
      utilState +
      '" data-kpi="avg-util">' +
      esc(String(utilPct)) +
      '%</strong>' +
      matrizKpiGaugeHtml(portfolio.avgPctUtil, objUtilFrac, 'util') +
      '<span class="crozzo-matriz-kpi__hint">Promedio de todos los platos · meta ' +
      esc(String(objUtilPct)) +
      '%</span></article>' +
      '<article class="crozzo-matriz-kpi">' +
      '<span class="crozzo-matriz-kpi__label">Cumplimiento de metas</span>' +
      '<strong class="crozzo-matriz-kpi__value crozzo-matriz-kpi__value--' +
      cumplState +
      '" data-kpi="pct-ok">' +
      esc(String(okPct)) +
      '%</strong>' +
      matrizKpiGaugeCumplimientoHtml(portfolio.pctOk, cumplState) +
      '<span class="crozzo-matriz-kpi__hint"><span data-kpi="ok">' +
      esc(String(portfolio.ok)) +
      '</span> cumplen · <span data-kpi="alert">' +
      esc(String(portfolio.alert)) +
      '</span> revisar · <span data-kpi="crit">' +
      esc(String(portfolio.crit)) +
      '</span> críticos</span></article></div>' +
      '<p class="crozzo-matriz-kpi__foot" data-kpi="foot">' +
      '<span data-kpi="total">' +
      esc(String(portfolio.total)) +
      '</span> platos · barra <span class="crozzo-matriz-kpi__foot-ok">verde</span> = bien · ' +
      '<span class="crozzo-matriz-kpi__foot-warn">naranja</span> = revisar · ' +
      '<span class="crozzo-matriz-kpi__foot-crit">rojo</span> = fuera de meta · ' +
      '<span data-kpi="alertas">' +
      esc(String(alertas)) +
      '</span> en alerta</p></header>'
    );
  }

  function renderMatrizResumenAcciones(seed) {
    seed = seed || hub.seed || { resumen: [] };
    var p = computeMatrizPortfolio(seed);
    var cmp = computeComparativaResumen(seed);
    var diffCount = (cmp.sube || 0) + (cmp.baja || 0);
    var costoPct = Math.round((p.avgPctCosto || 0) * 1000) / 10;
    var utilPct = Math.round((p.avgPctUtil || 0) * 1000) / 10;
    return (
      '<div class="crozzo-matriz-resumen-acciones" id="crozzoMatrizResumenAcciones">' +
      '<div class="crozzo-matriz-resumen-acciones__main">' +
      '<div class="crozzo-matriz-resumen-acciones__stats">' +
      '<p class="crozzo-matriz-resumen-acciones__title">Resumen del menú costeado</p>' +
      '<p class="crozzo-matriz-resumen-acciones__meta">' +
      '<span data-resumen-acciones-total>' +
      esc(String(p.total)) +
      '</span> platos · costo prom. <strong data-resumen-acciones-costo>' +
      esc(String(costoPct)) +
      '%</strong> · utilidad prom. <strong data-resumen-acciones-util>' +
      esc(String(utilPct)) +
      '%</strong> · ' +
      (diffCount > 0
        ? '<span data-resumen-acciones-diff>' +
          esc(String(diffCount)) +
          ' platos con precio distinto a caja</span>'
        : '<span data-resumen-acciones-diff">Sin diferencias pendientes con caja</span>') +
      '</p></div>' +
      '<div class="crozzo-matriz-resumen-acciones__btns">' +
      '<button type="button" class="btn btn-primary btn-sm" id="crozzoMatrizPublishBarApply">⚡ Publicar en caja</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoMatrizPublishBarSchedule">Programar cambio</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoMatrizPublishBarMore">◈ Más acciones</button>' +
      '</div></div>' +
      '<p class="crozzo-matriz-resumen-acciones__hint">' +
      '<strong>Tabla abajo</strong> = resumen editable (costo, margen, precio). ' +
      '<strong>Historial de costeos</strong> = meses guardados. ' +
      'Fila <strong>TOTAL MENÚ</strong> al final de la tabla. La caja solo cambia al pulsar <strong>Publicar</strong>.</p></div>'
    );
  }

  function bindMatrizResumenAcciones(root) {
    if (!root || root._resumenAccionesBound) return;
    root._resumenAccionesBound = true;
    var applyQuick = root.querySelector('#crozzoMatrizPublishBarApply');
    if (applyQuick) {
      applyQuick.addEventListener('click', function () {
        var main = root.querySelector('#crozzoMatrizAplicarCaja');
        if (main) main.click();
        else toast('Abra la pestaña Resumen del menú para cargar acciones', 'warn');
      });
    }
    var schedQuick = root.querySelector('#crozzoMatrizPublishBarSchedule');
    if (schedQuick) {
      schedQuick.addEventListener('click', function () {
        if (typeof hub.openMatrizCommandDeck === 'function') hub.openMatrizCommandDeck(true);
        else {
          var toggle = root.querySelector('#crozzoMatrizCmdToggle');
          if (toggle) toggle.click();
        }
        var dt = root.querySelector('#crozzoMatrizProgDateTime');
        if (dt && dt.focus) dt.focus();
      });
    }
    var moreQuick = root.querySelector('#crozzoMatrizPublishBarMore');
    if (moreQuick) {
      moreQuick.addEventListener('click', function () {
        if (typeof hub.openMatrizCommandDeck === 'function') hub.openMatrizCommandDeck(false);
        else {
          var toggleM = root.querySelector('#crozzoMatrizCmdToggle');
          if (toggleM) toggleM.click();
        }
      });
    }
  }

  function refreshMatrizKpis(root, seed) {
    if (!root) return;
    var p = computeMatrizPortfolio(seed);
    var hero = root.querySelector('#crozzoMatrizHero');
    if (!hero) return;
    var objCostFrac = p.objetivoMargen;
    var objUtilFrac = 1 - objCostFrac;
    var costoPct = Math.round(p.avgPctCosto * 1000) / 10;
    var utilPct = Math.round(p.avgPctUtil * 1000) / 10;
    var costoState = matrizAlertStateCostoPct(p.avgPctCosto, objCostFrac);
    var utilState = matrizAlertStateUtilPct(p.avgPctUtil, objUtilFrac);
    var okPct = Math.round(p.pctOk * 100);
    var cumplState = matrizAlertStateCumplimiento(p);
    var costoVal = hero.querySelector('[data-kpi="avg-costo"]');
    var utilVal = hero.querySelector('[data-kpi="avg-util"]');
    if (costoVal) {
      costoVal.textContent = costoPct + '%';
      costoVal.className = 'crozzo-matriz-kpi__value crozzo-matriz-kpi__value--' + costoState;
    }
    if (utilVal) {
      utilVal.textContent = utilPct + '%';
      utilVal.className = 'crozzo-matriz-kpi__value crozzo-matriz-kpi__value--' + utilState;
    }
    var okVal = hero.querySelector('[data-kpi="pct-ok"]');
    if (okVal) {
      okVal.textContent = okPct + '%';
      okVal.className = 'crozzo-matriz-kpi__value crozzo-matriz-kpi__value--' + cumplState;
    }
    var okEl = hero.querySelector('[data-kpi="ok"]');
    var alertEl = hero.querySelector('[data-kpi="alert"]');
    var critEl = hero.querySelector('[data-kpi="crit"]');
    if (okEl) okEl.textContent = String(p.ok);
    if (alertEl) alertEl.textContent = String(p.alert);
    if (critEl) critEl.textContent = String(p.crit);
    var kpis = hero.querySelector('#crozzoMatrizKpis');
    if (kpis) {
      var cards = kpis.querySelectorAll('.crozzo-matriz-kpi');
      if (cards[0]) {
        var g0 = cards[0].querySelector('.crozzo-matriz-kpi__gauge');
        if (g0) g0.outerHTML = matrizKpiGaugeHtml(p.avgPctCosto, objCostFrac, 'costo');
      }
      if (cards[1]) {
        var g1 = cards[1].querySelector('.crozzo-matriz-kpi__gauge');
        if (g1) g1.outerHTML = matrizKpiGaugeHtml(p.avgPctUtil, objUtilFrac, 'util');
      }
      if (cards[2]) {
        var g2 = cards[2].querySelector('.crozzo-matriz-kpi__gauge');
        if (g2) g2.outerHTML = matrizKpiGaugeCumplimientoHtml(p.pctOk, cumplState);
      }
    }
    var totalEl = hero.querySelector('[data-kpi="total"]');
    if (totalEl) totalEl.textContent = String(p.total);
    var alertasEl = hero.querySelector('[data-kpi="alertas"]');
    if (alertasEl) alertasEl.textContent = String(p.alert + p.crit);
    var accCosto = root.querySelector('[data-resumen-acciones-costo]');
    if (accCosto) accCosto.textContent = String(costoPct) + '%';
    var accUtil = root.querySelector('[data-resumen-acciones-util]');
    if (accUtil) accUtil.textContent = String(utilPct) + '%';
    var accTot = root.querySelector('[data-resumen-acciones-total]');
    if (accTot) accTot.textContent = String(p.total);
    var accDiff = root.querySelector('[data-resumen-acciones-diff]');
    if (accDiff) {
      var cmp = computeComparativaResumen(seed || hub.seed);
      var n = (cmp.sube || 0) + (cmp.baja || 0);
      accDiff.textContent =
        n > 0 ? n + ' platos con precio distinto a caja' : 'Sin diferencias pendientes con caja';
    }
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Normaliza texto para búsqueda: minúsculas, sin tildes, tokens separados. */
  function searchNormalize(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s_/]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function searchTokens(q) {
    var n = searchNormalize(q);
    if (!n) return [];
    return n.split(/\s+/).filter(Boolean);
  }

  /** Coincide frase completa o todas las palabras en cualquier orden (ej. «queso moz» → Queso Mozzarella). */
  function matchSearchQuery(blob, q) {
    if (!q || !String(q).trim()) return true;
    var hay = searchNormalize(blob);
    if (!hay) return false;
    var full = searchNormalize(q);
    if (full && hay.indexOf(full) >= 0) return true;
    var toks = searchTokens(q);
    if (!toks.length) return true;
    return toks.every(function (t) {
      return hay.indexOf(t) >= 0;
    });
  }

  global.CrozzoCostosSearch = {
    normalize: searchNormalize,
    tokens: searchTokens,
    match: matchSearchQuery,
  };

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
      if (hub.seed) {
        var nRec = recalcMenuDesdeRecetasBatch(hub.seed, { force: true });
        if (nRec > 0) invalidateSeed();
      }
      if (hub.view === 'matriz' && hub.seed) {
        loadSeed(function (fresh) {
          hub.seed = fresh;
          var host = document.getElementById('mainContent');
          if (host) {
            refreshMatrizResumenTable(host, fresh);
            refreshMatrizHistorialPanel(host, fresh);
            var demoPanel = host.querySelector('[data-matriz-panel="demo"]');
            if (demoPanel && demoPanel.querySelector('.crozzo-receta-plato')) {
              refreshRecetaPlatoPanel(host, fresh);
            }
          }
        });
      }
      console.info('[costos] receta → matriz', ev.detail);
    });
    on('crozzo-costos:proceso-cerrado', function (ev) {
      var p = (ev.detail && ev.detail.proceso) || {};
      if (!p.slug || !(Number(p.costoMpTotal) > 0)) return;
      var C = global.CrozzoCatalogoMp;
      if (!C || !C.getMenuPlato || !C.pushHistorialCosteo) return;
      var row = C.getMenuPlato(p.slug);
      if (!row || row.tipoCosteo === 'directo') return;
      var porciones = Number(p.kg) || Number(p.factor) || 1;
      if (porciones <= 0) porciones = 1;
      var costoUnit = Math.round(Number(p.costoMpTotal) / porciones);
      if (costoUnit <= 0) return;
      C.pushHistorialCosteo(p.slug, {
        costoMp: costoUnit,
        label: 'Proceso ' + (p.fecha || ''),
        notas: 'Sesión producción · ' + (p.id || ''),
      });
      console.info('[costos] proceso → historial costeo', p.slug, costoUnit);
    });
    on('crozzo-costos:precio-mp-cambiado', function (ev) {
      var e = engine();
      if (!e || !ev.detail) return;
      var d = ev.detail;
      if (d.mpId) stripCostoSnapshotFromRecetaDrafts(d.mpId);
      if (d.producto && d.precioTotal != null && d.peso != null) {
        var unit = e.precioUnitarioMp(d.precioTotal, d.peso);
        emit('crozzo-costos:matriz-recalculada', { producto: d.producto, precioUnit: unit, source: 'mp' });
      }
      var cascade = cascadeMpChangeToMenu(d);
      var recetasN = (cascade.recetasActualizadas && cascade.recetasActualizadas.length) || 0;
      if (recetasN > 0) {
        var pedEng = global.CrozzoPedidosInternosEngine;
        if (pedEng && pedEng.recalcAllFromRecipes) pedEng.recalcAllFromRecipes();
      }
      if (cascade.updated > 0) {
        var msg =
          cascade.updated +
          ' producto(s): costo actualizado';
        if (recetasN > 0) msg += ' · ' + recetasN + ' receta(s) recosteadas';
        if (loadAutoPosDesdeMargen()) msg += ' · precio caja ajustado a meta';
        else msg += ' · precio caja igual · revise margen';
        if (cascade.alerts.length) msg += ' · ' + cascade.alerts.length + ' bajo margen mínimo';
        toast(msg, cascade.alerts.length ? 'warning' : 'success');
        loadSeed(function (fresh) {
          hub.seed = fresh;
          var host = document.getElementById('mainContent');
          if (host && hub.view === 'matriz') {
            refreshMatrizResumenTable(host, fresh);
            var alertsEl = host.querySelector('.crozzo-matriz-alerts');
            if (alertsEl) alertsEl.outerHTML = renderMatrizAlertsBanner(fresh);
            var cmpBar = host.querySelector('#crozzoMatrizCmpBar');
            if (cmpBar) cmpBar.outerHTML = renderComparativaResumenBar(fresh);
            refreshMatrizHistorialPanel(host, fresh);
            refreshRecetaPanelIfVisible(host, fresh);
          }
        });
      } else if (hub.seed) {
        var n = recalcMenuDesdeRecetasBatch(hub.seed, { force: true });
        if (n > 0) {
          invalidateSeed();
          loadSeed(function (fresh) {
            hub.seed = fresh;
            var host = document.getElementById('mainContent');
            if (host && hub.view === 'matriz') {
              refreshMatrizResumenTable(host, fresh);
              var alertsEl = host.querySelector('.crozzo-matriz-alerts');
              if (alertsEl) alertsEl.outerHTML = renderMatrizAlertsBanner(fresh);
              refreshMatrizHistorialPanel(host, fresh);
              refreshRecetaPanelIfVisible(host, fresh);
            }
            toast(n + ' plato(s) recosteados · costeo vigente actualizado', 'info');
          });
        } else if (d.mpId && hub.view === 'matriz') {
          loadSeed(function (fresh) {
            hub.seed = fresh;
            refreshRecetaPanelIfVisible(document.getElementById('mainContent'), fresh);
          });
        }
      }
    });
    on('crozzo-costos:recepcion-registrada', function (ev) {
      var d = ev.detail || {};
      var n = d.costeoActualizado && d.costeoActualizado.length;
      if (n) {
        toast(n + ' materia(s) prima actualizada(s) en costeo desde recepción', 'success');
      }
      console.info('[costos] recepción → inventario + costeo + oficina', ev.detail);
      if (hub.view === 'inventario') {
        refreshInventarioPanel();
      }
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
    var el = document.getElementById('crozzo-costos-styles');
    if (!el) {
      el = document.createElement('style');
      el.id = 'crozzo-costos-styles';
      document.head.appendChild(el);
    }
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
      '.crozzo-matriz-premium{--matriz-gold:var(--accent,#c9a962);--matriz-gold-rgb:var(--accent-rgb,201,169,98);position:relative}' +
      '.crozzo-matriz-hero{position:relative;margin:0 0 20px;padding:22px 22px 18px;border-radius:18px;border:1px solid rgba(var(--matriz-gold-rgb),.28);background:linear-gradient(145deg,rgba(var(--matriz-gold-rgb),.14) 0%,rgba(var(--matriz-gold-rgb),.03) 42%,var(--bg-card) 100%);box-shadow:0 12px 40px rgba(0,0,0,.22),inset 0 1px 0 rgba(255,255,255,.06);overflow:hidden}' +
      '.crozzo-matriz-hero__glow{position:absolute;top:-40%;right:-8%;width:min(380px,55vw);height:min(380px,55vw);background:radial-gradient(circle,rgba(var(--matriz-gold-rgb),.22) 0%,transparent 68%);pointer-events:none}' +
      '.crozzo-matriz-hero__top{position:relative;display:flex;flex-wrap:wrap;gap:16px;justify-content:space-between;align-items:flex-start;margin-bottom:18px}' +
      '.crozzo-matriz-hero__brand{display:flex;gap:14px;align-items:flex-start;min-width:0;flex:1 1 280px}' +
      '.crozzo-matriz-hero__glyph{font-size:2rem;line-height:1;color:var(--matriz-gold);text-shadow:0 0 24px rgba(var(--matriz-gold-rgb),.45)}' +
      '.crozzo-matriz-hero__eyebrow{margin:0 0 4px;font-size:.68rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--matriz-gold);opacity:.9}' +
      '.crozzo-matriz-hero__title{margin:0 0 6px;font-size:clamp(1.35rem,2.8vw,1.75rem);font-weight:800;letter-spacing:-.02em;line-height:1.15}' +
      '.crozzo-matriz-hero__sub{margin:0;font-size:.86rem;line-height:1.5;color:var(--text-secondary);max-width:36rem}' +
      '.crozzo-matriz-hero__actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center}' +
      '.crozzo-matriz-live{display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;font-size:.72rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;background:rgba(16,185,129,.12);color:#34d399;border:1px solid rgba(16,185,129,.25)}' +
      '.crozzo-matriz-live__dot{width:7px;height:7px;border-radius:50%;background:#34d399;box-shadow:0 0 8px #34d399;animation:crozzoMatrizPulse 2s ease-in-out infinite}' +
      '@keyframes crozzoMatrizPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.55;transform:scale(.85)}}' +
      '.crozzo-matriz-kpis{position:relative;display:grid;grid-template-columns:repeat(auto-fill,minmax(196px,1fr));gap:12px}' +
      '.crozzo-matriz-kpis--simple{grid-template-columns:repeat(3,minmax(0,1fr));max-width:960px}' +
      '@media(max-width:900px){.crozzo-matriz-kpis--simple{grid-template-columns:1fr;max-width:none}}' +
      '.crozzo-matriz-kpi__foot{margin:10px 0 0;font-size:.74rem;line-height:1.5;color:var(--text-secondary)}' +
      '.crozzo-matriz-kpi__foot-ok{color:#34d399}' +
      '.crozzo-matriz-kpi__foot-warn{color:#fbbf24}' +
      '.crozzo-matriz-kpi__foot-crit{color:#f87171}' +
      '.crozzo-matriz-kpi{padding:14px 16px;border-radius:14px;border:1px solid var(--border);background:rgba(0,0,0,.12)}' +
      '.crozzo-matriz-kpi--primary{border-color:rgba(var(--matriz-gold-rgb),.45);background:linear-gradient(160deg,rgba(var(--matriz-gold-rgb),.12),rgba(0,0,0,.08))}' +
      '.crozzo-matriz-kpi__label{display:block;font-size:.65rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;opacity:.72;margin-bottom:6px}' +
      '.crozzo-matriz-kpi__value{display:block;font-size:1.35rem;font-weight:800;font-variant-numeric:tabular-nums;letter-spacing:-.02em;line-height:1.1}' +
      '.crozzo-matriz-kpi__value--ok{color:#34d399}' +
      '.crozzo-matriz-kpi__value--warn{color:#fbbf24}' +
      '.crozzo-matriz-kpi__value--crit{color:#f87171}' +
      '.crozzo-matriz-kpi__gauge{position:relative;height:6px;margin:10px 0 8px;border-radius:99px;background:rgba(255,255,255,.08);overflow:visible}' +
      '.crozzo-matriz-kpi__gauge-fill{height:100%;border-radius:99px;transition:background .2s}' +
      '.crozzo-matriz-kpi__gauge-fill--ok{background:linear-gradient(90deg,#059669,#34d399)}' +
      '.crozzo-matriz-kpi__gauge-fill--warn{background:linear-gradient(90deg,#d97706,#fbbf24)}' +
      '.crozzo-matriz-kpi__gauge-fill--crit{background:linear-gradient(90deg,#dc2626,#f87171)}' +
      '.crozzo-matriz-kpi__gauge-mark{position:absolute;top:-3px;width:2px;height:12px;background:var(--matriz-gold);opacity:.85;border-radius:1px;transform:translateX(-50%)}' +
      '.crozzo-matriz-kpi__hint{display:block;font-size:.72rem;line-height:1.4;color:var(--text-secondary);margin-top:4px}' +
      '.crozzo-matriz-kpi__detail{display:block;font-size:.68rem;line-height:1.35;color:var(--text-secondary);opacity:.88;margin-top:6px}' +
      '.crozzo-matriz-flujo{display:inline-flex;align-items:center;gap:4px;margin:6px 6px 0 0;padding:2px 8px;border-radius:999px;font-size:.62rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;border:1px solid var(--border)}' +
      '.crozzo-matriz-flujo--ok{color:#34d399;border-color:rgba(52,211,153,.35);background:rgba(52,211,153,.08)}' +
      '.crozzo-matriz-flujo--warn{color:#fbbf24;border-color:rgba(251,191,36,.35);background:rgba(251,191,36,.08)}' +
      '.crozzo-matriz-flujo--draft{color:#94a3b8;border-color:rgba(148,163,184,.35);background:rgba(148,163,184,.08)}' +
      '.crozzo-matriz-flujo-date{font-size:.62rem;color:var(--text-secondary);margin-right:6px}' +
      '.crozzo-matriz-lanzar{margin-top:6px;padding:2px 8px;font-size:.68rem;vertical-align:middle}' +
      '.crozzo-matriz-tabs.crozzo-costos-matriz-tabs{align-items:stretch;gap:8px;padding:6px;margin-bottom:18px}' +
      '.crozzo-matriz-tabs .crozzo-mod-nav__item{display:flex;align-items:center;gap:10px;text-align:left;padding:12px 16px;min-height:56px}' +
      '.crozzo-matriz-tabs .crozzo-mod-nav__item.active{background:linear-gradient(135deg,var(--matriz-gold),#e8d4a8);color:#111;box-shadow:0 4px 16px rgba(var(--matriz-gold-rgb),.35)}' +
      '.crozzo-matriz-tab__icon{font-size:1.25rem;line-height:1;flex-shrink:0}' +
      '.crozzo-matriz-tab__text{display:flex;flex-direction:column;gap:2px;min-width:0}' +
      '.crozzo-matriz-tab__text strong{font-size:.82rem;font-weight:700;line-height:1.2}' +
      '.crozzo-matriz-tab__text small{font-size:.68rem;font-weight:500;opacity:.72;line-height:1.2}' +
      '.crozzo-matriz-toolbar{display:flex;flex-wrap:wrap;gap:10px 12px;align-items:center;margin-bottom:14px}' +
      '.crozzo-matriz-search{flex:1 1 220px;min-width:0;max-width:440px;padding:11px 14px 11px 38px;border-radius:12px;border:1px solid var(--border);background:var(--bg-card) url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'16\' height=\'16\' fill=\'%23888\' viewBox=\'0 0 24 24\'%3E%3Cpath d=\'M21 21l-4.35-4.35M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14z\'/%3E%3C/svg%3E") no-repeat 12px center;font-size:.88rem}' +
      '.crozzo-matriz-search:focus{border-color:var(--matriz-gold);outline:none;box-shadow:0 0 0 3px rgba(var(--matriz-gold-rgb),.15)}' +
      '.crozzo-matriz-filters{display:flex;flex-wrap:wrap;gap:6px}' +
      '.crozzo-matriz-filter{padding:7px 14px;border-radius:999px;border:1px solid var(--border);background:var(--bg-card);font-size:.72rem;font-weight:700;cursor:pointer;transition:border-color .2s,background .2s,color .2s}' +
      '.crozzo-matriz-filter:hover{border-color:var(--matriz-gold)}' +
      '.crozzo-matriz-filter.is-active{background:var(--matriz-gold);color:#111;border-color:var(--matriz-gold)}' +
      '.crozzo-matriz-table-shell{border:1px solid var(--border);border-radius:14px;overflow:hidden;background:var(--bg-card);box-shadow:0 8px 28px rgba(0,0,0,.12)}' +
      '.crozzo-matriz-table-shell .crozzo-costos-scroll{border:none;border-radius:0;max-height:min(58vh,520px)}' +
      '.crozzo-matriz-table thead th{position:sticky;top:0;z-index:2;background:linear-gradient(180deg,var(--bg-secondary),var(--bg-card));border-bottom:2px solid rgba(var(--matriz-gold-rgb),.35);font-size:.68rem;letter-spacing:.06em;padding:12px 10px}' +
      '.crozzo-matriz-table tbody tr{transition:background .15s;content-visibility:auto;contain-intrinsic-size:auto 52px}' +
      '.crozzo-matriz-table tbody tr:hover td{background:rgba(var(--matriz-gold-rgb),.06)}' +
      '.crozzo-matriz-row--warn td:first-child{box-shadow:inset 3px 0 0 #f59e0b}' +
      '.crozzo-matriz-row--ok td:first-child{box-shadow:inset 3px 0 0 #10b981}' +
      '.crozzo-matriz-product{font-weight:600;font-size:.86rem;line-height:1.3}' +
      '.crozzo-matriz-util{font-weight:700;color:var(--matriz-gold);font-variant-numeric:tabular-nums}' +
      '.crozzo-matriz-fc{display:flex;align-items:center;gap:8px;min-width:120px}' +
      '.crozzo-matriz-fc__track{position:relative;flex:1;height:8px;border-radius:99px;background:rgba(255,255,255,.08);overflow:hidden}' +
      '.crozzo-matriz-fc__fill{height:100%;border-radius:99px;transition:width .3s ease}' +
      '.crozzo-matriz-fc__fill--ok{background:linear-gradient(90deg,#059669,#34d399)}' +
      '.crozzo-matriz-fc__fill--warn{background:linear-gradient(90deg,#d97706,#fbbf24)}' +
      '.crozzo-matriz-fc__fill--crit{background:linear-gradient(90deg,#dc2626,#f87171)}' +
      '.crozzo-matriz-fc__target{position:absolute;top:0;bottom:0;width:2px;background:var(--matriz-gold);opacity:.7;transform:translateX(-50%);pointer-events:none}' +
      '.crozzo-matriz-fc__pct{font-size:.78rem;font-weight:700;font-variant-numeric:tabular-nums;min-width:3.2rem;text-align:right}' +
      '.crozzo-matriz-status{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:999px;font-size:.68rem;font-weight:700;white-space:nowrap}' +
      '.crozzo-matriz-status--ok{background:rgba(16,185,129,.14);color:#34d399;border:1px solid rgba(16,185,129,.25)}' +
      '.crozzo-matriz-status--warn{background:rgba(245,158,11,.14);color:#fbbf24;border:1px solid rgba(245,158,11,.28)}' +
      '.crozzo-matriz-panel-head{margin:0 0 14px;font-size:.84rem;line-height:1.55;color:var(--text-secondary)}' +
      '.crozzo-matriz-panel-head strong{color:var(--text-primary)}' +
      '.crozzo-matriz-panel-head--step{padding:12px 14px;border-radius:12px;border:1px solid rgba(var(--matriz-gold-rgb),.22);background:rgba(var(--matriz-gold-rgb),.06)}' +
      '.crozzo-matriz-panel-head--empty{padding:14px 16px;border-radius:12px;border:1px dashed var(--border);background:rgba(0,0,0,.04)}' +
      '.crozzo-matriz-panel-head__badge{display:inline-block;margin-right:6px;padding:2px 8px;border-radius:999px;font-size:.65rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;background:var(--matriz-gold);color:#111;vertical-align:middle}' +
      '.crozzo-matriz-panel-head__hint{margin:8px 0 0;font-size:.8rem;line-height:1.5;color:var(--text-secondary)}' +
      '.crozzo-matriz-tabs-wrap{margin:0 0 18px}' +
      '.crozzo-matriz-tabs__hint{margin:0 0 10px;padding:10px 14px;border-radius:12px;font-size:.8rem;line-height:1.45;color:var(--text-secondary);background:rgba(var(--matriz-gold-rgb),.08);border:1px solid rgba(var(--matriz-gold-rgb),.18)}' +
      '.crozzo-matriz-tabs-wrap .crozzo-matriz-tabs{margin-bottom:0}' +
      '.crozzo-matriz-kpis-wrap{margin-top:4px;border-radius:12px;border:1px solid rgba(255,255,255,.06);background:rgba(0,0,0,.08)}' +
      '.crozzo-matriz-kpis-wrap summary{cursor:pointer;padding:10px 14px;font-size:.78rem;font-weight:700;color:var(--text-secondary);list-style:none}' +
      '.crozzo-matriz-kpis-wrap summary::-webkit-details-marker{display:none}' +
      '.crozzo-matriz-kpis-wrap[open] summary{border-bottom:1px solid var(--border);margin-bottom:12px}' +
      '.crozzo-matriz-kpis-wrap .crozzo-matriz-kpis{padding:0 12px 12px}' +
      '.crozzo-matriz-resumen-acciones{margin:0 0 16px;padding:14px 16px;border-radius:14px;border:1px solid rgba(var(--matriz-gold-rgb),.35);background:linear-gradient(135deg,rgba(var(--matriz-gold-rgb),.1),rgba(0,0,0,.05))}' +
      '.crozzo-matriz-resumen-acciones__main{display:flex;flex-wrap:wrap;gap:12px 16px;align-items:center;justify-content:space-between;margin-bottom:8px}' +
      '.crozzo-matriz-resumen-acciones__title{margin:0 0 4px;font-size:.92rem;font-weight:800;color:var(--text-primary)}' +
      '.crozzo-matriz-resumen-acciones__meta{margin:0;font-size:.8rem;line-height:1.45;color:var(--text-secondary)}' +
      '.crozzo-matriz-resumen-acciones__btns{display:flex;flex-wrap:wrap;gap:8px}' +
      '.crozzo-matriz-resumen-acciones__hint{margin:0;font-size:.76rem;line-height:1.5;color:var(--text-secondary)}' +
      '.crozzo-matriz-tab__step{flex-shrink:0;width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:.65rem;font-weight:800;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.12)}' +
      '.crozzo-matriz-tabs .crozzo-mod-nav__item.active .crozzo-matriz-tab__step{background:#111;color:var(--matriz-gold);border-color:#111}' +
      '.crozzo-matriz-premium .crozzo-costos-editable{border-radius:8px;padding:7px 9px;font-weight:600}' +
      '.crozzo-matriz-premium .crozzo-costos-editable:focus{box-shadow:0 0 0 2px rgba(var(--matriz-gold-rgb),.25)}' +
      '.crozzo-matriz-loading{padding:48px 24px;text-align:center}' +
      '.crozzo-matriz-loading__ring{width:44px;height:44px;margin:0 auto 16px;border-radius:50%;border:3px solid rgba(var(--matriz-gold-rgb),.2);border-top-color:var(--matriz-gold);animation:crozzoMatrizSpin .8s linear infinite}' +
      '@keyframes crozzoMatrizSpin{to{transform:rotate(360deg)}}' +
      '.crozzo-matriz-margen-global{margin:0 0 18px;padding:16px 18px;border-radius:16px;border:1px solid rgba(var(--matriz-gold-rgb),.32);background:linear-gradient(135deg,rgba(var(--matriz-gold-rgb),.12),rgba(0,0,0,.06))}' +
      '.crozzo-matriz-margen-global__main{display:flex;flex-wrap:wrap;gap:14px 20px;align-items:center;justify-content:space-between;margin-bottom:10px}' +
      '.crozzo-matriz-margen-global__label strong{display:block;font-size:.92rem;margin-bottom:4px}' +
      '.crozzo-matriz-margen-global__formula{display:block;font-size:.72rem;color:var(--text-secondary)}' +
      '.crozzo-matriz-margen-global__ctrl{display:flex;flex-wrap:wrap;align-items:center;gap:12px;flex:1 1 260px;max-width:420px}' +
      '.crozzo-matriz-margen-global__range{flex:1;min-width:120px;accent-color:var(--matriz-gold)}' +
      '.crozzo-matriz-margen-global__num{display:flex;align-items:center;gap:6px}' +
      '.crozzo-matriz-margen-global__pct{width:72px;text-align:right;font-weight:700;font-size:1rem}' +
      '.crozzo-matriz-margen-global__hint{margin:0 0 12px;font-size:.78rem;line-height:1.5;color:var(--text-secondary)}' +
      '.crozzo-matriz-margen-global__min{display:flex;flex-wrap:wrap;gap:14px 20px;align-items:center;justify-content:space-between;margin:4px 0 12px}' +
      '.crozzo-matriz-margen-global__min .crozzo-matriz-margen-global__label strong{display:block;font-size:.88rem;margin-bottom:2px}' +
      '.crozzo-matriz-margen-global__min .crozzo-matriz-margen-global__ctrl{max-width:380px}' +
      '.crozzo-matriz-margen-global__actions{display:flex;flex-wrap:wrap;gap:8px}' +
      '.crozzo-perdidas-proceso{margin:0 0 18px;padding:16px 18px;border-radius:16px;border:1px solid rgba(251,191,36,.35);background:linear-gradient(135deg,rgba(251,191,36,.1),rgba(0,0,0,.04))}' +
      '.crozzo-receta-plato .crozzo-perdidas-proceso{margin:0 0 16px}' +
      '.crozzo-perdidas-proceso__head{margin:0 0 4px;font-size:1rem;font-weight:700}' +
      '.crozzo-perdidas-proceso__sub{margin:0 0 14px;font-size:.8rem;line-height:1.5;color:var(--text-secondary)}' +
      '.crozzo-perdidas-proceso__grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px 16px;margin-bottom:12px}' +
      '.crozzo-perdidas-proceso__grid label{display:block;font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;color:var(--text-secondary)}' +
      '.crozzo-perdidas-proceso__grid input{width:100%;font-size:1.05rem;font-weight:700;text-align:center}' +
      '.crozzo-perdidas-proceso__foot{display:flex;flex-wrap:wrap;gap:8px;align-items:center}' +
      '.crozzo-perdidas-proceso__hint{font-size:.75rem;color:var(--text-secondary);margin:10px 0 0;line-height:1.45}' +
      '.crozzo-revision-admin{display:flex;flex-wrap:wrap;gap:14px 18px;align-items:flex-start;justify-content:space-between;margin:0 0 20px;padding:18px 20px;border-radius:18px;border:1px solid rgba(var(--matriz-gold-rgb),.28);background:linear-gradient(135deg,rgba(var(--matriz-gold-rgb),.1),rgba(0,0,0,.05))}' +
      '.crozzo-revision-admin--active{border-color:rgba(16,185,129,.35);background:linear-gradient(135deg,rgba(16,185,129,.12),rgba(0,0,0,.04))}' +
      '.crozzo-revision-admin__main{display:flex;gap:14px;flex:1 1 320px;min-width:0}' +
      '.crozzo-revision-admin__icon{font-size:1.6rem;line-height:1;flex-shrink:0}' +
      '.crozzo-revision-admin__icon--live{color:#34d399}' +
      '.crozzo-revision-admin__eyebrow{margin:0 0 4px;font-size:.68rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--matriz-gold);opacity:.85}' +
      '.crozzo-revision-admin--active .crozzo-revision-admin__eyebrow{color:#34d399}' +
      '.crozzo-revision-admin__title{margin:0 0 6px;font-size:1.05rem;font-weight:800}' +
      '.crozzo-revision-admin__sub{margin:0;font-size:.8rem;line-height:1.55;color:var(--text-secondary)}' +
      '.crozzo-revision-admin__sub strong{color:var(--text-primary)}' +
      '.crozzo-revision-admin__deltas{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 0}' +
      '.crozzo-revision-admin__delta{display:inline-flex;padding:4px 10px;border-radius:999px;font-size:.68rem;font-weight:700;border:1px solid rgba(255,255,255,.08)}' +
      '.crozzo-revision-admin__delta--up{background:rgba(245,158,11,.12);color:#fbbf24}' +
      '.crozzo-revision-admin__delta--down{background:rgba(239,68,68,.12);color:#f87171}' +
      '.crozzo-revision-admin__delta--eq{background:rgba(148,163,184,.12);color:#cbd5e1}' +
      '.crozzo-revision-admin__list{margin:10px 0 0;padding-left:18px;font-size:.78rem;line-height:1.55;color:var(--text-secondary)}' +
      '.crozzo-revision-admin__list li.is-done{color:#34d399}' +
      '.crozzo-revision-admin__actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}' +
      '.crozzo-revision-admin__readonly{margin:0;font-size:.78rem;color:var(--text-secondary);max-width:220px;line-height:1.45}' +
      '.crozzo-revision-live{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;font-size:.72rem;font-weight:700;background:rgba(16,185,129,.14);color:#34d399;border:1px solid rgba(16,185,129,.28)}' +
      '.crozzo-revision-live__dot{width:7px;height:7px;border-radius:50%;background:#34d399;animation:crozzoRevisionPulse 1.4s ease-in-out infinite}' +
      '@keyframes crozzoRevisionPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.45;transform:scale(.85)}}' +
      'body.crozzo-revision-costos-activa .crozzo-matriz-hero{box-shadow:inset 0 0 0 1px rgba(16,185,129,.18)}' +
      '.crozzo-matriz-costo-cell{position:relative;white-space:nowrap}' +
      '.crozzo-matriz-costo-tag{display:block;font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#34d399;margin-top:4px}' +
      '.crozzo-matriz-costo-tag--diff{color:#fbbf24}' +
      'td:has(.crozzo-matriz-margen-inp){position:relative}' +
      '.crozzo-matriz-margen-inp{width:64px;padding-right:4px}' +
      '.crozzo-matriz-margen-suffix{font-size:.75rem;font-weight:700;opacity:.7;margin-left:2px}' +
      '.crozzo-matriz-margen-util{font-size:1rem;font-weight:800;color:var(--matriz-gold);font-variant-numeric:tabular-nums}' +
      '.crozzo-matriz-margen-util-cell{min-width:72px}' +
      '.crozzo-matriz-margen-venta-cell{min-width:88px}' +
      '.crozzo-matriz-precio-inp{min-width:88px;font-weight:700}' +
      '.crozzo-matriz-leyenda{margin:0 0 14px;border-radius:12px;border:1px solid var(--border);background:rgba(0,0,0,.06)}' +
      '.crozzo-matriz-leyenda summary{cursor:pointer;padding:10px 14px;font-size:.8rem;font-weight:600;list-style:none}' +
      '.crozzo-matriz-leyenda summary::-webkit-details-marker{display:none}' +
      '.crozzo-matriz-leyenda__body{padding:0 14px 12px;font-size:.78rem;line-height:1.55;color:var(--text-secondary)}' +
      '.crozzo-matriz-leyenda__body ul{margin:8px 0 0;padding-left:18px}' +
      '.crozzo-matriz-leyenda__mark{display:inline-block;width:10px;height:3px;background:var(--matriz-gold);vertical-align:middle;margin:0 4px}' +
      '.crozzo-matriz-totales td{background:linear-gradient(180deg,rgba(var(--matriz-gold-rgb),.14),rgba(var(--matriz-gold-rgb),.06));border-top:2px solid rgba(var(--matriz-gold-rgb),.45);padding:14px 10px;vertical-align:middle}' +
      '.crozzo-matriz-totales__sub{display:block;font-size:.65rem;font-weight:500;opacity:.75;margin-top:4px;text-transform:none;letter-spacing:0}' +
      '.crozzo-matriz-total-margen{font-size:1.1rem;color:var(--matriz-gold)}' +
      '.crozzo-matriz-totales__diff{display:block;font-size:.62rem;font-weight:600;opacity:.8;margin-top:6px;text-align:left}' +
      '.crozzo-matriz-tipo{display:inline-block;margin-left:8px;padding:2px 8px;border-radius:999px;font-size:.62rem;font-weight:700;vertical-align:middle;letter-spacing:.03em;text-transform:uppercase}' +
      '.crozzo-matriz-tipo--receta{background:rgba(16,185,129,.15);color:#34d399;border:1px solid rgba(16,185,129,.28)}' +
      '.crozzo-matriz-tipo--directo{background:rgba(100,180,255,.12);color:#93c5fd;border:1px solid rgba(100,180,255,.25)}' +
      '.crozzo-matriz-tipo-receta-wrap{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:4px}' +
      '.crozzo-matriz-tipo-receta-sel{font-size:11px;padding:2px 6px;border-radius:6px;max-width:88px}' +
      '.crozzo-matriz-vende-check{display:inline-flex;align-items:center;gap:4px;font-size:10px;color:var(--text-muted);cursor:pointer;white-space:nowrap}' +
      '.crozzo-matriz-vende-check input{margin:0;accent-color:var(--accent)}' +
      '.crozzo-matriz-cat{display:block;font-size:.65rem;opacity:.65;margin-top:4px;text-transform:capitalize}' +
      '.crozzo-matriz-costo-tag--mp{color:#93c5fd}' +
      '.crozzo-matriz-filters--meta{margin-top:0}' +
      '.crozzo-matriz-toolbar{align-items:center}' +
      '.crozzo-costos-search-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px}' +
      '.crozzo-costos-search-row .crozzo-matriz-search{flex:1;min-width:180px}' +
      '.crozzo-costos-create-btn{min-width:36px;width:36px;height:36px;padding:0;font-size:1.25rem;line-height:1;font-weight:700;border-radius:10px;flex-shrink:0}' +
      '.crozzo-receta-plato{position:relative;margin-top:4px;padding:2px 0 10px}' +
      '.crozzo-receta-plato__intro{margin:0 0 18px;padding:12px 16px;border-radius:12px;border:1px solid rgba(var(--matriz-gold-rgb),.2);background:rgba(var(--matriz-gold-rgb),.06);font-size:.82rem;line-height:1.55;color:var(--text-secondary)}' +
      '.crozzo-receta-plato__intro strong{color:var(--text-primary);font-weight:700}' +
      '.crozzo-receta-plato__toolbar{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-bottom:18px;padding:10px 0;border-bottom:1px solid var(--border)}' +
      '.crozzo-receta-plato__toolbar.crozzo-costos-search-row{align-items:center;margin-bottom:12px;padding:10px 12px;border:1px solid rgba(var(--matriz-gold-rgb),.18);border-radius:12px;background:rgba(var(--matriz-gold-rgb),.04);border-bottom:1px solid rgba(var(--matriz-gold-rgb),.18)}' +
      '.crozzo-receta-plato__pick{flex:1;min-width:180px}' +
      '.crozzo-receta-plato__pick .crozzo-receta-plato-combo{width:100%}' +
      '.crozzo-receta-plato__toolbar label{font-size:.68rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--matriz-gold);opacity:.85;white-space:nowrap}' +
      '.crozzo-receta-plato__toolbar select{flex:1;min-width:240px;text-align:left;font-weight:600;border-color:rgba(var(--matriz-gold-rgb),.22)}' +
      '.crozzo-receta-plato__toolbar .btn-primary{font-weight:700;letter-spacing:.03em;padding:9px 20px;background:linear-gradient(135deg,var(--matriz-gold),#e8d4a8);border-color:var(--matriz-gold);box-shadow:0 4px 14px rgba(var(--matriz-gold-rgb),.22)}' +
      '.crozzo-receta-plato__actions{display:flex;gap:8px;flex-wrap:wrap;margin-left:auto}' +
      '.crozzo-receta-plato__head{position:relative;margin:0 0 20px;padding:22px 24px;border-radius:18px;border:1px solid rgba(var(--matriz-gold-rgb),.28);background:linear-gradient(145deg,rgba(var(--matriz-gold-rgb),.14) 0%,rgba(var(--matriz-gold-rgb),.03) 42%,var(--bg-card) 100%);box-shadow:0 12px 40px rgba(0,0,0,.18),inset 0 1px 0 rgba(255,255,255,.06);overflow:hidden}' +
      '.crozzo-receta-plato__head::after{content:"";position:absolute;top:-40%;right:-6%;width:min(280px,45vw);height:min(280px,45vw);background:radial-gradient(circle,rgba(var(--matriz-gold-rgb),.16) 0%,transparent 68%);pointer-events:none}' +
      '.crozzo-receta-plato__head-top{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:flex-end;margin-bottom:10px}' +
      '.crozzo-receta-plato__badge{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:999px;font-size:.65rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;background:rgba(0,0,0,.08);border:1px solid var(--border);color:var(--text-secondary)}' +
      '.crozzo-receta-plato__badge--gold{color:var(--matriz-gold);border-color:rgba(var(--matriz-gold-rgb),.35);background:rgba(var(--matriz-gold-rgb),.08)}' +
      '.crozzo-receta-plato__eyebrow{margin:0 0 6px;font-size:.68rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--matriz-gold);opacity:.9}' +
      '.crozzo-receta-plato__nombre{margin:0;font-size:clamp(1.2rem,2.4vw,1.55rem);font-weight:800;letter-spacing:-.02em;line-height:1.2;color:var(--text-primary)}' +
      '.crozzo-receta-plato__meta{margin:8px 0 0;font-size:.8rem;line-height:1.55;color:var(--text-secondary);max-width:48rem}' +
      '.crozzo-receta-plato__grid{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(300px,.85fr);gap:16px;align-items:stretch}' +
      '@media(max-width:960px){.crozzo-receta-plato__grid{grid-template-columns:1fr}}' +
      '.crozzo-receta-plato__ing,.crozzo-receta-plato__resumen{display:flex;flex-direction:column;min-height:400px;border:1px solid var(--border);border-radius:14px;background:var(--bg-card);overflow:hidden;box-shadow:0 8px 28px rgba(0,0,0,.1)}' +
      '.crozzo-receta-plato__ing-head,.crozzo-receta-plato__resumen-head{padding:12px 16px;border-bottom:1px solid var(--border);font-size:.68rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text-secondary);background:linear-gradient(180deg,var(--bg-secondary),var(--bg-card))}' +
      '.crozzo-receta-plato__resumen-head{border-bottom-color:rgba(var(--matriz-gold-rgb),.28);color:var(--matriz-gold)}' +
      '.crozzo-receta-plato__ing .crozzo-costos-scroll{flex:1;border:none;border-radius:0;max-height:min(52vh,480px);scrollbar-width:thin;scrollbar-color:rgba(var(--matriz-gold-rgb),.25) transparent}' +
      '.crozzo-receta-plato__ing .crozzo-costos-scroll::-webkit-scrollbar{width:6px}' +
      '.crozzo-receta-plato__ing .crozzo-costos-scroll::-webkit-scrollbar-thumb{background:rgba(var(--matriz-gold-rgb),.22);border-radius:99px}' +
      '.crozzo-receta-table{width:100%;border-collapse:collapse;font-size:.82rem;font-variant-numeric:tabular-nums}' +
      '.crozzo-receta-table th,.crozzo-receta-table td{padding:11px 12px;border-bottom:1px solid var(--border);vertical-align:middle}' +
      '.crozzo-receta-table th{font-size:.66rem;text-transform:uppercase;letter-spacing:.06em;font-weight:700;color:var(--text-secondary);background:linear-gradient(180deg,var(--bg-secondary),var(--bg-card));border-bottom:2px solid rgba(var(--matriz-gold-rgb),.22);position:sticky;top:0;z-index:2}' +
      '.crozzo-receta-table th.crozzo-receta-table__th--num,.crozzo-receta-table td.crozzo-receta-table__num{text-align:right}' +
      '.crozzo-receta-table th.crozzo-receta-table__th--mid,.crozzo-receta-table td.crozzo-receta-table__mid{text-align:center}' +
      '.crozzo-receta-table tbody tr{transition:background .18s ease}' +
      '.crozzo-receta-table tbody tr:hover td{background:rgba(var(--matriz-gold-rgb),.05)}' +
      '.crozzo-receta-table td[data-demo-total],.crozzo-receta-table td[data-receta-unit]{font-weight:700;color:var(--matriz-gold)}' +
      '.crozzo-receta-table td[data-demo-pct]{font-weight:600;opacity:.75;font-size:.76rem;color:var(--text-secondary)}' +
      '.crozzo-receta-table td[data-receta-und]{font-weight:700;font-size:.7rem;letter-spacing:.04em;color:var(--text-secondary);opacity:.85}' +
      '.crozzo-receta-table .crozzo-costos-editable--cant{min-width:64px;max-width:96px;font-weight:600}' +
      '.crozzo-receta-table__del{width:36px;text-align:center;opacity:.7}' +
      '.crozzo-receta-table__del .btn{min-width:26px;padding:2px 7px;line-height:1.2;border-color:transparent;background:transparent}' +
      '.crozzo-receta-table__del .btn:hover{border-color:var(--border);background:rgba(var(--matriz-gold-rgb),.06)}' +
      '.crozzo-receta-table__empty td{padding:36px 20px!important;text-align:center;opacity:.6;font-size:.84rem;font-style:italic}' +
      '.crozzo-receta-plato__foot{margin-top:auto;padding:12px 16px;display:flex;flex-wrap:wrap;gap:8px;border-top:1px solid var(--border);background:rgba(0,0,0,.04)}' +
      '.crozzo-receta-block{width:100%;border-collapse:collapse;font-size:.82rem;font-variant-numeric:tabular-nums;flex:1}' +
      '.crozzo-receta-block th,.crozzo-receta-block td{padding:12px 16px;border-bottom:1px solid var(--border);text-align:left;vertical-align:middle}' +
      '.crozzo-receta-block th{width:58%;font-size:.74rem;font-weight:600;line-height:1.45;color:var(--text-secondary)}' +
      '.crozzo-receta-block td{text-align:right;font-weight:700;white-space:nowrap;font-size:.86rem;color:var(--text-primary)}' +
      '.crozzo-receta-block td[data-receta-kpi="k7"],.crozzo-receta-block td[data-receta-kpi="k10"],.crozzo-receta-block td[data-receta-kpi="k11"],.crozzo-receta-block td[data-receta-kpi="util"],.crozzo-receta-block td[data-receta-kpi="pct-util"]{font-size:.92rem;color:var(--matriz-gold)}' +
      '.crozzo-receta-block tr:last-child th,.crozzo-receta-block tr:last-child td{border-bottom:none}' +
      '.crozzo-receta-block__row--warn td,.crozzo-receta-block__row--warn th{box-shadow:inset 3px 0 0 rgba(var(--matriz-gold-rgb),.55);background:rgba(var(--matriz-gold-rgb),.04)}' +
      '.crozzo-receta-block__row--accent td,.crozzo-receta-block__row--accent th{box-shadow:inset 3px 0 0 var(--matriz-gold);background:rgba(var(--matriz-gold-rgb),.06)}' +
      '.crozzo-receta-block__row--primary td,.crozzo-receta-block__row--primary th{box-shadow:inset 3px 0 0 rgba(var(--matriz-gold-rgb),.35);background:rgba(var(--matriz-gold-rgb),.03)}' +
      '.crozzo-receta-block__row--decision th,.crozzo-receta-block__row--decision td{background:linear-gradient(180deg,rgba(var(--matriz-gold-rgb),.12),rgba(var(--matriz-gold-rgb),.04));border-top:2px solid rgba(var(--matriz-gold-rgb),.35);padding-top:14px;padding-bottom:14px}' +
      '.crozzo-receta-block__row--decision td{font-size:1rem;color:var(--matriz-gold)}' +
      '.crozzo-receta-block__inp{width:76px;text-align:right;font-weight:700;padding:6px 8px;border-radius:8px;border:1px solid var(--border);background:var(--bg-card)}' +
      '.crozzo-receta-block__inp:focus{border-color:var(--matriz-gold);box-shadow:0 0 0 2px rgba(var(--matriz-gold-rgb),.18)}' +
      '.crozzo-receta-block__pct-suffix{font-size:.72rem;font-weight:700;opacity:.7;margin-left:3px;color:var(--text-secondary)}' +
      '.crozzo-receta-block__sub{display:block;font-size:.62rem;font-weight:500;opacity:.65;margin-top:4px;text-align:right;line-height:1.35;color:var(--text-secondary)}' +
      '.crozzo-receta-block__hint{display:inline-block;font-size:.58rem;font-weight:600;letter-spacing:.04em;padding:1px 5px;margin-left:5px;border-radius:3px;color:var(--text-secondary);background:rgba(0,0,0,.06);vertical-align:middle;opacity:.8}' +
      '.crozzo-receta-peso-auto{display:inline-flex;align-items:center;gap:5px;font-size:.66rem;font-weight:600;margin-top:5px;cursor:pointer;color:var(--text-secondary)}' +
      '.crozzo-receta-peso-auto input{accent-color:var(--matriz-gold)}' +
      '.crozzo-receta-resumen-actions{margin-top:auto;padding:12px 16px;display:flex;flex-wrap:wrap;gap:8px;border-top:1px solid var(--border);background:rgba(0,0,0,.03)}' +
      '.crozzo-receta-resumen-actions .btn{font-size:.72rem;font-weight:600;padding:7px 12px;border-radius:8px;line-height:1.3}' +
      '.crozzo-receta-resumen-actions .btn:hover{border-color:rgba(var(--matriz-gold-rgb),.45);color:var(--matriz-gold);background:rgba(var(--matriz-gold-rgb),.06)}' +
      '.crozzo-receta-plato__actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-left:auto}' +
      '.crozzo-receta-plato__actions--foot{width:100%;justify-content:stretch;margin-top:0;padding:12px 16px;border-top:1px solid var(--border);background:rgba(0,0,0,.03)}' +
      '.crozzo-receta-plato__actions--foot .btn{flex:1 1 140px}' +
      '.crozzo-receta-btn--probar{font-weight:600;border-color:rgba(var(--matriz-gold-rgb),.35)}' +
      '.crozzo-receta-btn--probar:hover{background:rgba(var(--matriz-gold-rgb),.08);border-color:var(--matriz-gold);color:var(--matriz-gold)}' +
      '.crozzo-receta-btn--pending{box-shadow:0 0 0 2px rgba(var(--matriz-gold-rgb),.35)}' +
      '.crozzo-receta-plato__badge--draft{color:#fbbf24;border-color:rgba(251,191,36,.35);background:rgba(251,191,36,.1)}' +
      '.crozzo-receta-vista-tabs{margin:0 0 16px}' +
      '.crozzo-receta-prog-bar{margin:0 0 16px;padding:14px 16px;border-radius:12px;border:1px solid rgba(var(--matriz-gold-rgb),.22);background:rgba(var(--matriz-gold-rgb),.05)}' +
      '.crozzo-receta-prog-bar__row{display:flex;flex-wrap:wrap;gap:12px;align-items:center}' +
      '.crozzo-receta-prog-opt{display:inline-flex;align-items:center;gap:6px;font-size:.78rem;font-weight:600;cursor:pointer}' +
      '.crozzo-receta-plato-combo{position:relative;flex:1;min-width:240px;max-width:480px}' +
      '.crozzo-receta-mp-combo{position:relative;min-width:0;width:100%}' +
      '.crozzo-receta-mp-combo .cxf-combobox__input,.crozzo-receta-plato-combo .cxf-combobox__input{font-size:.78rem;padding:6px 10px;border-radius:8px;border:1px solid rgba(var(--matriz-gold-rgb),.18);background:var(--bg-card);width:100%}' +
      '.crozzo-receta-mp-combo.is-open .cxf-combobox__input,.crozzo-receta-plato-combo.is-open .cxf-combobox__input{border-color:var(--matriz-gold);box-shadow:0 0 0 2px rgba(var(--matriz-gold-rgb),.12)}' +
      '.crozzo-receta-mp-combo .cxf-combobox__list,.crozzo-receta-plato-combo .cxf-combobox__list{position:absolute;left:0;right:0;top:calc(100% + 4px);max-height:min(240px,42vh);overflow:auto;z-index:60;border-radius:10px;border:1px solid var(--border);background:var(--bg-card);box-shadow:0 12px 32px rgba(0,0,0,.22)}' +
      '.crozzo-receta-proceso{margin:0 0 18px;padding:14px 16px;border-radius:14px;border:2px solid rgba(var(--matriz-gold-rgb),.45);background:rgba(var(--matriz-gold-rgb),.1);box-shadow:0 0 0 1px rgba(var(--matriz-gold-rgb),.12)}' +
      '.crozzo-receta-proceso--muted{font-size:.82rem;line-height:1.55;color:var(--text-secondary)}' +
      '.crozzo-receta-proceso__row{display:flex;flex-wrap:wrap;gap:10px 14px;align-items:center;margin-bottom:8px}' +
      '.crozzo-receta-proceso__model{margin:0 0 10px;font-size:.78rem;line-height:1.55;color:var(--text-secondary)}' +
      '.crozzo-receta-proceso__lbl{font-size:.68rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--matriz-gold);white-space:nowrap}' +
      '.crozzo-receta-proceso__sel{flex:1;min-width:min(100%,280px);max-width:520px;font-weight:600}' +
      '.crozzo-receta-proceso__hint{margin:0;font-size:.78rem;line-height:1.5;color:var(--text-secondary)}' +
      '.crozzo-receta-proceso__check{display:flex;align-items:center;gap:8px;margin-top:10px;font-size:.78rem;color:var(--text-secondary);cursor:pointer}' +
      '.crozzo-receta-proceso__row.is-hidden{display:none}' +
      '.crozzo-receta-proceso__hint.is-hidden{display:none}' +
      '.crozzo-receta-proceso__auto{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin:0 0 10px;font-size:.78rem;color:var(--text-secondary)}' +
      '.crozzo-receta-proceso__auto-pill{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:rgba(var(--matriz-gold-rgb),.14);color:var(--matriz-gold);font-weight:600;font-size:.72rem}' +
      '.crozzo-receta-proceso__auto-link{background:none;border:none;padding:0;color:var(--accent);font-size:.72rem;font-weight:600;cursor:pointer;text-decoration:underline;text-underline-offset:2px;font-family:inherit}' +
      '.crozzo-receta-proceso__check.is-hidden{display:none}' +
      '.crozzo-matriz-search::placeholder{color:var(--text-secondary);opacity:.75;font-size:.82rem}' +
      '.crozzo-inventario-premium{position:relative}' +
      '.crozzo-inv-hero{position:relative;margin:0 0 20px;padding:22px 24px;border-radius:18px;border:1px solid rgba(var(--matriz-gold-rgb),.28);background:linear-gradient(145deg,rgba(var(--matriz-gold-rgb),.14) 0%,rgba(var(--matriz-gold-rgb),.03) 42%,var(--bg-card) 100%);box-shadow:0 12px 40px rgba(0,0,0,.16),inset 0 1px 0 rgba(255,255,255,.06);overflow:hidden}' +
      '.crozzo-inv-hero__glow{position:absolute;top:-30%;right:-8%;width:min(320px,42vw);height:min(320px,42vw);background:radial-gradient(circle,rgba(var(--matriz-gold-rgb),.14) 0%,transparent 68%);pointer-events:none}' +
      '.crozzo-inv-hero__eyebrow{margin:0 0 6px;font-size:.68rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--matriz-gold);opacity:.9}' +
      '.crozzo-inv-hero__title{margin:0;font-size:clamp(1.25rem,2.5vw,1.65rem);font-weight:800;letter-spacing:-.02em;color:var(--text-primary)}' +
      '.crozzo-inv-hero__sub{margin:8px 0 0;font-size:.82rem;line-height:1.55;color:var(--text-secondary);max-width:52rem}' +
      '.crozzo-inv-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:16px 0 18px}' +
      '.crozzo-inv-kpi{padding:12px 14px;border-radius:12px;border:1px solid var(--border);background:rgba(0,0,0,.08);backdrop-filter:blur(6px)}' +
      '.crozzo-inv-kpi__lbl{display:block;font-size:.62rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-secondary);margin-bottom:4px}' +
      '.crozzo-inv-kpi__val{font-size:1.15rem;font-weight:800;font-variant-numeric:tabular-nums;color:var(--text-primary)}' +
      '.crozzo-inv-kpi__val--gold{color:var(--matriz-gold)}' +
      '.crozzo-inv-formula{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin:0 0 18px;padding:12px 16px;border-radius:12px;border:1px dashed rgba(var(--matriz-gold-rgb),.35);background:rgba(var(--matriz-gold-rgb),.05);font-size:.78rem;color:var(--text-secondary)}' +
      '.crozzo-inv-formula strong{color:var(--text-primary);font-weight:700}' +
      '.crozzo-inv-formula__op{opacity:.55;font-weight:700;font-size:.9rem}' +
      '.crozzo-inv-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:0 0 14px}' +
      '.crozzo-inv-search{flex:1 1 220px;min-width:0;max-width:440px;padding:11px 14px 11px 38px;border-radius:12px;border:1px solid var(--border);background:var(--bg-card) url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'16\' height=\'16\' fill=\'%23888\' viewBox=\'0 0 24 24\'%3E%3Cpath d=\'M21 21l-4.35-4.35M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14z\'/%3E%3C/svg%3E") no-repeat 12px center;font-size:.88rem}' +
      '.crozzo-inv-search:focus{border-color:var(--matriz-gold);outline:none;box-shadow:0 0 0 3px rgba(var(--matriz-gold-rgb),.12)}' +
      '.crozzo-inv-chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}' +
      '.crozzo-inv-chip{padding:6px 12px;border-radius:999px;border:1px solid var(--border);background:var(--bg-card);font-size:.68rem;font-weight:700;cursor:pointer;transition:border-color .2s,background .2s,color .2s}' +
      '.crozzo-inv-chip:hover{border-color:var(--matriz-gold)}' +
      '.crozzo-inv-chip.is-active{background:var(--matriz-gold);color:#111;border-color:var(--matriz-gold)}' +
      '.crozzo-inv-actions{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 16px;padding:14px 16px;border-radius:14px;border:1px solid rgba(var(--matriz-gold-rgb),.22);background:rgba(var(--matriz-gold-rgb),.04)}' +
      '.crozzo-inv-actions__lbl{font-size:.68rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--matriz-gold);width:100%;margin-bottom:4px}' +
      '.crozzo-inv-output-hub{margin:0 0 18px;padding:16px;border-radius:16px;border:1px solid rgba(var(--matriz-gold-rgb),.28);background:linear-gradient(160deg,rgba(var(--matriz-gold-rgb),.08),rgba(0,0,0,.04))}' +
      '.crozzo-inv-print-format{margin-bottom:12px}' +
      '.crozzo-inv-output-guide{margin:0 0 14px;font-size:.82rem;line-height:1.5;color:var(--text-secondary)}' +
      '.crozzo-inv-output-guide strong{color:var(--text-primary)}' +
      '.crozzo-inv-output-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}' +
      '.crozzo-inv-output-card{padding:14px;border-radius:14px;border:1px solid var(--border);background:var(--bg-card);display:flex;flex-direction:column;gap:12px;min-height:100%}' +
      '.crozzo-inv-output-card--bodega{border-color:rgba(16,185,129,.35);background:linear-gradient(160deg,rgba(16,185,129,.08),var(--bg-card))}' +
      '.crozzo-inv-output-card--oficina{border-color:rgba(var(--matriz-gold-rgb),.35)}' +
      '.crozzo-inv-output-card__head{display:flex;gap:12px;align-items:flex-start}' +
      '.crozzo-inv-output-card__icon{font-size:1.25rem;line-height:1}' +
      '.crozzo-inv-output-card__title{margin:0;font-size:.92rem;font-weight:700}' +
      '.crozzo-inv-output-card__desc{margin:4px 0 0;font-size:.76rem;line-height:1.45;color:var(--text-secondary)}' +
      '.crozzo-inv-output-card__actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:auto}' +
      '.crozzo-inv-table-shell{border:1px solid var(--border);border-radius:14px;overflow:hidden;background:var(--bg-card);box-shadow:0 8px 28px rgba(0,0,0,.1)}' +
      '.crozzo-inv-table{width:100%;border-collapse:collapse;font-size:.8rem;font-variant-numeric:tabular-nums}' +
      '.crozzo-inv-table th{position:sticky;top:0;background:var(--bg-secondary);z-index:1;font-size:.64rem;text-transform:uppercase;letter-spacing:.06em;padding:10px 10px;border-bottom:2px solid var(--border);text-align:left}' +
      '.crozzo-inv-table th.num{text-align:right}' +
      '.crozzo-inv-table td{padding:9px 10px;border-bottom:1px solid var(--border);vertical-align:middle}' +
      '.crozzo-inv-table tr:hover td{background:rgba(var(--matriz-gold-rgb),.04)}' +
      '.crozzo-inv-table .num{text-align:right;font-weight:600}' +
      '.crozzo-inv-mp{font-weight:700;color:var(--text-primary)}' +
      '.crozzo-inv-cat{display:inline-block;margin-top:3px;padding:2px 7px;border-radius:6px;font-size:.58rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;background:rgba(var(--matriz-gold-rgb),.1);color:var(--matriz-gold)}' +
      '.crozzo-inv-teorico{font-weight:800;color:var(--matriz-gold)}' +
      '.crozzo-inv-mov-tipo{display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:999px;font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em}' +
      '.crozzo-inv-mov-tipo--in{background:rgba(16,185,129,.12);color:#34d399;border:1px solid rgba(16,185,129,.25)}' +
      '.crozzo-inv-mov-tipo--out{background:rgba(248,113,113,.1);color:#f87171;border:1px solid rgba(248,113,113,.22)}' +
      '.crozzo-inv-mov-tipo--adj{background:rgba(147,197,253,.1);color:#93c5fd;border:1px solid rgba(147,197,253,.22)}' +
      '.crozzo-inv-scroll{max-height:min(52vh,520px);overflow:auto;scrollbar-width:thin}' +
      '.crozzo-inv-tabs{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}' +
      '.crozzo-inv-tab{padding:8px 16px;border-radius:999px;border:1px solid var(--border);background:var(--bg-card);font-size:.72rem;font-weight:700;cursor:pointer}' +
      '.crozzo-inv-tab.is-active{background:var(--matriz-gold);color:#111;border-color:var(--matriz-gold)}' +
      '.crozzo-inv-panel{display:none}.crozzo-inv-panel.is-active{display:block}' +
      '.crozzo-inv-foot{margin-top:16px;display:flex;flex-wrap:wrap;gap:8px}' +
      '.crozzo-inv-conteo-bar{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;margin:0 0 14px;padding:14px 16px;border-radius:14px;border:1px solid rgba(var(--matriz-gold-rgb),.22);background:rgba(var(--matriz-gold-rgb),.04)}' +
      '.crozzo-inv-conteo-bar .form-group{margin:0;min-width:140px}' +
      '.crozzo-inv-conteo-bar .form-label{font-size:.62rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-secondary);margin-bottom:4px}' +
      '.crozzo-inv-conteo-bar .form-input{padding:8px 10px;border-radius:10px;font-size:.85rem}' +
      '.crozzo-inv-conteo-progress{flex:1 1 180px;min-width:160px}' +
      '.crozzo-inv-conteo-progress__track{height:8px;border-radius:999px;background:rgba(0,0,0,.15);overflow:hidden;margin-top:6px}' +
      '.crozzo-inv-conteo-progress__fill{height:100%;border-radius:999px;background:linear-gradient(90deg,var(--matriz-gold),#e8c96a);transition:width .25s}' +
      '.crozzo-inv-conteo-progress__lbl{font-size:.72rem;color:var(--text-secondary)}' +
      '.crozzo-inv-conteo-input{width:88px;max-width:100%;padding:7px 8px;border-radius:8px;border:1px solid var(--border);background:var(--bg-card);font-size:.82rem;font-weight:700;text-align:right;font-variant-numeric:tabular-nums}' +
      '.crozzo-inv-conteo-input:focus{border-color:var(--matriz-gold);outline:none;box-shadow:0 0 0 2px rgba(var(--matriz-gold-rgb),.15)}' +
      '.crozzo-inv-conteo-obs{width:100%;min-width:100px;padding:6px 8px;border-radius:8px;border:1px solid var(--border);background:var(--bg-card);font-size:.72rem}' +
      '.crozzo-inv-diff{font-weight:800;font-variant-numeric:tabular-nums}' +
      '.crozzo-inv-diff--ok{color:#34d399}' +
      '.crozzo-inv-diff--warn{color:#fbbf24}' +
      '.crozzo-inv-diff--bad{color:#f87171}' +
      '.crozzo-inv-conteo-foot{position:sticky;bottom:0;display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:12px 14px;margin-top:10px;border-radius:12px;border:1px solid var(--border);background:var(--bg-secondary);box-shadow:0 -4px 20px rgba(0,0,0,.12)}' +
      '.crozzo-inv-conteo-opt{display:inline-flex;align-items:center;gap:6px;font-size:.78rem;font-weight:600;cursor:pointer;margin-right:8px}' +
      '.crozzo-inv-hist-meta{font-size:.72rem;opacity:.75;margin-top:2px}' +
      '.crozzo-inv-row--filled td{background:rgba(16,185,129,.04)}' +
      '.crozzo-inv-row--diff td{background:rgba(251,191,36,.06)}' +
      '.crozzo-costos-bulk{display:flex;flex-wrap:wrap;gap:14px;align-items:center;margin:0 0 16px;padding:14px 16px;border-radius:14px;border:1px solid rgba(var(--matriz-gold-rgb),.22);background:linear-gradient(135deg,rgba(var(--matriz-gold-rgb),.08),rgba(0,0,0,.03))}' +
      '.crozzo-costos-bulk__icon{font-size:1.6rem;line-height:1;flex-shrink:0}' +
      '.crozzo-costos-bulk__copy{flex:1;min-width:200px}' +
      '.crozzo-costos-bulk__title{margin:0 0 4px;font-size:.92rem;font-weight:700;color:var(--text-primary)}' +
      '.crozzo-costos-bulk__sub{margin:0;font-size:.78rem;line-height:1.45;color:var(--text-secondary)}' +
      '.crozzo-costos-bulk__actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}' +
      '.crozzo-receta-wizard{display:flex;flex-wrap:wrap;gap:8px 16px;margin:0 0 16px;padding:0;list-style:none;counter-reset:none}' +
      '.crozzo-receta-wizard__step{display:inline-flex;align-items:center;gap:8px;font-size:.78rem;font-weight:600;color:var(--text-secondary);opacity:.75}' +
      '.crozzo-receta-wizard__step.is-active,.crozzo-receta-wizard__step.is-done{opacity:1;color:var(--text-primary)}' +
      '.crozzo-receta-wizard__step.is-active .crozzo-receta-wizard__num,.crozzo-receta-wizard__step.is-done .crozzo-receta-wizard__num{background:var(--matriz-gold);color:#111;border-color:var(--matriz-gold)}' +
      '.crozzo-receta-wizard__num{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:999px;border:1px solid var(--border);font-size:.68rem;font-weight:800}' +
      '.crozzo-receta-foot-advanced{opacity:.75;font-size:.72rem}' +
      '.crozzo-plato-create__advanced{margin-top:4px;border:none}' +
      '.crozzo-plato-create__advanced>summary{cursor:pointer;padding:12px 0;font-size:.82rem;font-weight:700;color:var(--matriz-gold);list-style:none}' +
      '.crozzo-plato-create__advanced>summary::-webkit-details-marker{display:none}' +
      '.crozzo-plato-create__excel-link{margin:0;padding:0 0 12px;font-size:.8rem;color:var(--text-secondary)}' +
      '.crozzo-plato-create__excel-btn{background:none;border:none;padding:0;font:inherit;font-weight:700;color:var(--accent);cursor:pointer;text-decoration:underline}' +
      '.crozzo-receta-dock{position:sticky;top:0;z-index:6;display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px 14px;margin:0 0 12px;border-radius:12px;border:1px solid rgba(var(--matriz-gold-rgb),.28);background:linear-gradient(180deg,var(--bg-card),rgba(var(--matriz-gold-rgb),.04));box-shadow:0 6px 24px rgba(0,0,0,.12)}' +
      '.crozzo-receta-dock__add{font-weight:800;letter-spacing:.02em}' +
      '.crozzo-receta-dock__meta{font-size:.76rem;font-weight:600;color:var(--text-secondary);opacity:.85}' +
      '.crozzo-receta-dock__spacer{flex:1;min-width:12px}' +
      '.crozzo-receta-plato__ing-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}' +
      '.crozzo-receta-plato__ing-title{font-size:.68rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text-secondary)}' +
      '.crozzo-receta-ing-add{font-weight:700}' +
      '.crozzo-receta-ing-scroll{max-height:min(46vh,420px)}' +
      '.crozzo-receta-sync-hint{margin:10px 0 0;padding:0;font-size:.72rem;text-align:right}' +
      '.crozzo-receta-sync-link{background:none;border:none;padding:0;font:inherit;color:var(--text-secondary);cursor:pointer;text-decoration:underline;opacity:.75}' +
      '.crozzo-receta-sync-link:hover{opacity:1;color:var(--matriz-gold)}' +
      '.crozzo-receta-btn--pending{box-shadow:0 0 0 2px rgba(var(--matriz-gold-rgb),.45)}' +
      '.crozzo-receta-plato__head--compact{margin-bottom:14px;padding:16px 18px}' +
      '.crozzo-receta-plato__head--compact .crozzo-receta-plato__nombre{font-size:clamp(1.05rem,2vw,1.35rem)}' +
      '.crozzo-receta-plato__config{margin:0 0 14px;border:1px solid var(--border);border-radius:12px;background:rgba(0,0,0,.03)}' +
      '.crozzo-receta-plato__config>summary{cursor:pointer;padding:10px 14px;font-size:.78rem;font-weight:700;color:var(--text-secondary);list-style:none}' +
      '.crozzo-receta-plato__config>summary::-webkit-details-marker{display:none}' +
      '.crozzo-receta-plato__config-body{padding:0 14px 12px}';
  }

  function goPage(page) {
    if (page === 'catalogo-mp' || page === 'productos') {
      openCostosMatrizTab(page === 'catalogo-mp' ? 'costeo-mp' : 'resumen', {
        openNewMp: page === 'catalogo-mp',
        openNewPlato: page === 'productos',
      });
      return;
    }
    if (typeof global.navigateTo === 'function') global.navigateTo(page);
    else toast('Abra: ' + page, 'info');
  }

  function openCostosMatrizTab(tab, opts) {
    opts = opts || {};
    global.__crozzoCostosMatrizTab = tab || 'resumen';
    if (opts.openNewMp) global.__crozzoCostosOpenNewMp = true;
    if (opts.openNewPlato) global.__crozzoCostosOpenNewPlato = true;
    if (typeof global.navigateTo === 'function') global.navigateTo('costos-matriz');
  }

  function renderFeedPanel() {
    var feed = loadFeed();
    var rv = reservorio();
    var rows = feed.length
      ? feed.slice(0, 50).map(function (it) {
          return (
            '<tr><td>' + esc(it.fecha) + '</td><td>' + esc(it.origen) + '</td><td>' + esc(it.concepto) + '</td>' +
            '<td>' + esc(it.tipo_movimiento) + '</td><td style="text-align:right">' + esc(Number(it.monto).toLocaleString('es-CO')) + '</td><td>' +
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
      rows + '</tbody></table></div>'
    );
  }


  function invMovEsEntrada(tipo) {
    var t = String(tipo || '').toLowerCase();
    return t.indexOf('entrada') >= 0 || t.indexOf('inicial') >= 0 || t === 'ajuste_entrada';
  }

  function invMovEsSalida(tipo) {
    var t = String(tipo || '').toLowerCase();
    return t.indexOf('salida') >= 0 || t.indexOf('merma') >= 0 || t.indexOf('consumo') >= 0 || t === 'ajuste_salida';
  }

  function invTipoLabel(tipo) {
    var map = {
      entrada_proveedor: 'Entrada proveedor',
      entrada_proceso: 'Entrada elaborado (proceso)',
      salida_proceso: 'Salida MP (proceso)',
      salida_venta: 'Salida venta POS',
      inventario_inicial: 'Inventario inicial',
      ajuste_entrada: 'Ajuste entrada',
      ajuste_salida: 'Ajuste salida',
      merma: 'Merma',
      salida_remision: 'Salida remisión',
      entrada_remision: 'Entrada remisión',
    };
    if (String(tipo || '').indexOf('conteo') >= 0) return 'Ajuste conteo';
    return map[tipo] || String(tipo || 'movimiento').replace(/_/g, ' ');
  }

  function invUndDisplay(und) {
    var u = String(und || 'GR').toUpperCase();
    if (u === 'GR' || u === 'G') return 'g';
    if (u === 'KG') return 'kg';
    if (u === 'ML') return 'ml';
    if (u === 'UNI' || u === 'UND') return 'und';
    return u.toLowerCase();
  }

  function buildInventarioSnapshot(opts) {
    opts = opts || {};
    var bodegaFilter = String(opts.bodegaId || '').trim();
    var C = global.CrozzoCatalogoMp;
    var rv = reservorio();
    var catList = C && C.list ? C.list() : [];
    var movsAll = [];
    if (rv && rv.migrateLegacy) {
      movsAll = (rv.migrateLegacy().inventarioMovimientos || []).slice();
    } else if (rv && rv.listInventarioMovimientos) {
      movsAll = rv.listInventarioMovimientos(5000) || [];
    }
    if (bodegaFilter) {
      movsAll = movsAll.filter(function (m) {
        if (!m) return false;
        var bid = m.bodegaId || '';
        if (bodegaFilter === 'bod_principal') return !bid || bid === 'bod_principal';
        return bid === bodegaFilter;
      });
    }
    var byMp = {};
    catList.forEach(function (mp) {
      byMp[mp.id] = {
        mpId: mp.id,
        nombre: mp.nombre,
        categoria: mp.categoria || 'OTRO',
        und: mp.und || 'GR',
        undLabel: invUndDisplay(mp.und),
        precioUnit: Number(mp.precioUnit) || 0,
        inicial: 0,
        entradas: 0,
        salidas: 0,
        teorico: 0,
        valor: 0,
        movCount: 0,
        lastFecha: '',
        lastMov: null,
      };
    });
    var mesStart = new Date();
    mesStart.setDate(1);
    var mesStr = mesStart.toISOString().slice(0, 10);
    var entradasMes = 0;
    var salidasMes = 0;
    movsAll.forEach(function (m) {
      if (!m) return;
      var mpId = String(m.productoRefId || m.mpId || '').trim();
      if (!mpId) return;
      if (!byMp[mpId]) {
        byMp[mpId] = {
          mpId: mpId,
          nombre: m.productoNombre || mpId,
          categoria: 'OTRO',
          und: m.unidad || 'und',
          undLabel: invUndDisplay(m.unidad),
          precioUnit: Number(m.costoUnitario) || 0,
          inicial: 0,
          entradas: 0,
          salidas: 0,
          teorico: 0,
          valor: 0,
          movCount: 0,
          lastFecha: '',
          lastMov: null,
        };
      }
      var row = byMp[mpId];
      var cant = Number(m.cantidad) || 0;
      var t = String(m.tipo || '').toLowerCase();
      if (t.indexOf('inicial') >= 0) row.inicial += cant;
      else if (invMovEsEntrada(m.tipo)) {
        row.entradas += cant;
        if (String(m.fecha || '') >= mesStr) entradasMes += cant;
      } else if (invMovEsSalida(m.tipo)) {
        row.salidas += cant;
        if (String(m.fecha || '') >= mesStr) salidasMes += cant;
      } else row.entradas += cant;
      row.movCount++;
      if (!row.lastFecha || String(m.fecha || '') > row.lastFecha) {
        row.lastFecha = m.fecha || '';
        row.lastMov = m;
      }
    });
    var items = [];
    var seenMp = {};
    catList.forEach(function (mp) {
      if (!mp || !mp.id || !byMp[mp.id]) return;
      items.push(byMp[mp.id]);
      seenMp[mp.id] = true;
    });
    Object.keys(byMp)
      .filter(function (k) {
        return !seenMp[k];
      })
      .map(function (k) {
        return byMp[k];
      })
      .sort(function (a, b) {
        return String(a.nombre).localeCompare(String(b.nombre), 'es', { sensitivity: 'base' });
      })
      .forEach(function (row) {
        items.push(row);
      });
    var valorTotal = 0;
    var conMov = 0;
    items.forEach(function (it) {
      it.teorico = Math.round((it.inicial + it.entradas - it.salidas) * 100) / 100;
      it.valor = Math.round(it.teorico * it.precioUnit);
      valorTotal += it.valor > 0 ? it.valor : 0;
      if (it.movCount > 0) conMov++;
    });
    var movsRecientes = movsAll.slice(0, 80);
    return {
      items: items,
      movs: movsRecientes,
      stats: {
        totalMp: items.length,
        conMov: conMov,
        movCount: movsAll.length,
        valorTotal: valorTotal,
        entradasMes: entradasMes,
        salidasMes: salidasMes,
      },
      categorias: (function () {
        var s = {};
        items.forEach(function (it) {
          s[it.categoria || 'OTRO'] = true;
        });
        return Object.keys(s).sort();
      })(),
    };
  }

  function filterInventarioItems(items, q, cat) {
    q = String(q || '').trim();
    cat = cat || 'all';
    return items.filter(function (it) {
      if (cat !== 'all' && String(it.categoria || 'OTRO') !== cat) return false;
      if (!q) return true;
      var blob = [it.nombre, it.categoria, it.mpId, it.undLabel].join(' ');
      return matchSearchQuery(blob, q);
    });
  }

  /** Misma lista que en pantalla (filtro búsqueda/categoría si está activo). */
  function inventarioItemsForPrint(snap) {
    snap = snap || buildInventarioSnapshot();
    var ui = hub.inventarioUi || { q: '', cat: 'all' };
    var hasFilter = !!String(ui.q || '').trim() || (ui.cat && ui.cat !== 'all');
    var items = filterInventarioItems(snap.items, ui.q, ui.cat);
    if (!items.length && !hasFilter) return snap.items;
    return items.length ? items : snap.items;
  }

  function downloadTextFile(filename, content, mime) {
    try {
      var blob = new Blob(['\ufeff' + content], { type: mime || 'text/csv;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      setTimeout(function () {
        URL.revokeObjectURL(a.href);
      }, 500);
      return true;
    } catch (_) {
      return false;
    }
  }

  function csvEscape(val) {
    var s = String(val == null ? '' : val);
    if (/[",;\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function downloadInventarioConteoCsv(items) {
    var fecha = new Date().toISOString().slice(0, 10);
    var lines = [
      'CROZZO POS — Hoja de conteo físico (materias primas)',
      'Fecha sugerida;' + fecha,
      'Instrucciones;Complete la columna Conteo físico en bodega. Diferencia = Conteo − Teórico.',
      '',
      '#;Categoría;Materia prima;Unidad;Stock teórico;Conteo físico;Diferencia;Observaciones',
    ];
    items.forEach(function (it, i) {
      lines.push(
        [
          i + 1,
          it.categoria,
          it.nombre,
          it.undLabel,
          it.teorico,
          '',
          '',
          '',
        ]
          .map(csvEscape)
          .join(';')
      );
    });
    var ok = downloadTextFile('conteo-mp-' + fecha + '.csv', lines.join('\r\n'));
    if (ok) toast('Hoja de conteo descargada (' + items.length + ' ítems)', 'success');
    else toast('No se pudo descargar', 'error');
  }

  function downloadInventarioCompletoCsv(items) {
    var fecha = new Date().toISOString().slice(0, 10);
    var lines = [
      '#;Categoría;Materia prima;Unidad;Inicial;Entradas;Salidas;Stock teórico;$/unidad;Valor teórico;Movimientos',
    ];
    items.forEach(function (it, i) {
      lines.push(
        [
          i + 1,
          it.categoria,
          it.nombre,
          it.undLabel,
          it.inicial,
          it.entradas,
          it.salidas,
          it.teorico,
          it.precioUnit,
          it.valor,
          it.movCount,
        ]
          .map(csvEscape)
          .join(';')
      );
    });
    var ok = downloadTextFile('inventario-mp-completo-' + fecha + '.csv', lines.join('\r\n'));
    if (ok) toast('Listado completo descargado', 'success');
    else toast('No se pudo descargar', 'error');
  }

  function downloadInventarioStockCsv(items) {
    var fecha = new Date().toISOString().slice(0, 10);
    var lines = ['#;Categoría;Materia prima;Unidad;Stock teórico;$/unidad;Valor teórico;Movimientos'];
    items.forEach(function (it, i) {
      lines.push(
        [i + 1, it.categoria, it.nombre, it.undLabel, it.teorico, it.precioUnit, it.valor, it.movCount]
          .map(csvEscape)
          .join(';')
      );
    });
    var ok = downloadTextFile('inventario-stock-' + fecha + '.csv', lines.join('\r\n'));
    if (ok) toast('Stock teórico descargado (' + items.length + ' ítems)', 'success');
    else toast('No se pudo descargar', 'error');
  }

  function downloadInventarioMovsCsv(movs) {
    movs = movs || [];
    var fecha = new Date().toISOString().slice(0, 10);
    var lines = ['Fecha;Tipo;Producto;Cantidad;Unidad;Costo unit.;Notas'];
    movs.forEach(function (m) {
      lines.push(
        [
          String(m.fecha || '').slice(0, 19),
          invTipoLabel(m.tipo),
          m.productoNombre || m.productoRefId || '',
          m.cantidad,
          m.unidad || '',
          m.costoUnitario > 0 ? m.costoUnitario : '',
          m.notas || '',
        ]
          .map(csvEscape)
          .join(';')
      );
    });
    var ok = downloadTextFile('inventario-movimientos-' + fecha + '.csv', lines.join('\r\n'));
    if (ok) toast('Movimientos descargados (' + movs.length + ' filas)', 'success');
    else toast('No se pudo descargar', 'error');
  }

  function downloadInventarioHtml(kind, data, opts) {
    opts = opts || {};
    var html = buildInventarioPrintHtml(kind, data || {}, inventarioResolvePrintOpts(opts));
    var fecha = new Date().toISOString().slice(0, 10);
    var fmt = inventarioNormalizeOutput((opts.printOpts && opts.printOpts.printOutput) || inventarioSavedPrintOutput());
    try {
      var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'inventario-' + kind + '-' + fmt + '-' + fecha + '.html';
      a.click();
      setTimeout(function () {
        URL.revokeObjectURL(a.href);
      }, 500);
      toast('HTML de prueba descargado · ábralo en el navegador e imprima', 'success');
      return true;
    } catch (_) {
      toast('No se pudo descargar HTML', 'error');
      return false;
    }
  }

  var INV_PRINT_CSS_BODY =
    'body{font-family:Segoe UI,system-ui,sans-serif;padding:16px 20px;color:#111;font-size:11px}' +
    'h1{font-size:17px;margin:0 0 10px}' +
    '.inv-header-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 28px;margin:0 0 14px;padding:14px 16px;border:1px solid #c9a962;border-radius:4px;background:#fffef9}' +
    '.inv-header-cell{display:flex;flex-direction:column;gap:5px;min-width:0}' +
    '.inv-header-lbl{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b5a45}' +
    '.inv-header-val{font-size:12px;font-weight:600;color:#111;min-height:20px;padding:4px 0;border-bottom:1px solid #d4c4a8}' +
    '.inv-header-val--fill{min-height:28px;border-bottom:1px dashed #b8a88a;background:#fffef6}' +
    '.inv-sign-grid{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:18px;padding-top:12px}' +
    '.inv-sign-cell{display:flex;flex-direction:column;gap:6px}' +
    '.inv-sign-line{display:block;min-height:32px;border-bottom:1px solid #888;margin-top:4px}' +
    '.inv-meta{color:#555;font-size:11px;margin:0 0 14px;line-height:1.45}' +
    '.inv-meta strong{color:#111}' +
    'table{width:100%;border-collapse:collapse;font-size:10px}' +
    'th,td{border:1px solid #bbb;padding:6px 5px;text-align:left;vertical-align:top}' +
    'th{background:#f5f0e6;font-size:9px;text-transform:uppercase;letter-spacing:.04em}' +
    'td.num{text-align:right;font-variant-numeric:tabular-nums}' +
    'td.inv-unit{text-align:center;font-weight:700;white-space:nowrap}' +
    'td.inv-fill{min-height:30px;height:30px;background:#fffef6;border:1px dashed #b8a88a}' +
    'td.inv-fill--wide{min-width:88px}' +
    'td.inv-fill--obs{min-width:110px}' +
    'tr:nth-child(even) td{background:#faf8f4}' +
    'tr:nth-child(even) td.inv-fill{background:#fffdf8}' +
    '.diff-ok{color:#166534}.diff-warn{color:#b45309;font-weight:600}.diff-bad{color:#b91c1c;font-weight:700}' +
    '.inv-foot{margin-top:12px;font-size:9px;color:#666}' +
    '.inv-logo-head{margin:0 0 12px;padding:0 0 8px;border-bottom:1px solid #e8dcc8}' +
    '.inv-logo-head img{max-height:52px;max-width:220px;width:auto;object-fit:contain;display:block}' +
    '.inv-items-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 14px;margin:0 0 12px}' +
    '.inv-item-card{border:1px solid #bbb;border-radius:3px;padding:8px 10px;background:#fffef9;page-break-inside:avoid;min-height:72px}' +
    '.inv-item-card:nth-child(4n+1),.inv-item-card:nth-child(4n+2){background:#faf8f4}' +
    '.inv-item-num{font-size:8px;color:#6b5a45;font-weight:700}' +
    '.inv-item-name{font-size:12px;font-weight:800;line-height:1.25;margin:4px 0 6px;word-wrap:break-word}' +
    '.inv-item-row{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:10px;margin-top:4px}' +
    '.inv-item-row label{font-size:8px;font-weight:700;text-transform:uppercase;color:#6b5a45;flex:0 0 auto}' +
    '.inv-item-fill{flex:1;min-height:18px;border-bottom:1px dashed #b8a88a;background:#fffef6}' +
    '.inv-item-unit{display:inline-block;font-weight:800;padding:2px 8px;border:1px solid #c9a962;border-radius:3px;font-size:11px}' +
    '.inv-item-card--conteo{min-height:96px}' +
    '.inv-item-card--conteo .inv-item-num{display:none}' +
    '.inv-item-card--conteo .inv-item-name{font-size:14px;margin:0 0 10px;line-height:1.3}' +
    '.inv-item-unit-row{display:flex;align-items:center;gap:10px;margin:6px 0 12px}' +
    '.inv-item-unit-lbl{font-size:9px;font-weight:700;text-transform:uppercase;color:#6b5a45}' +
    '.inv-item-qty-row{display:flex;align-items:flex-end;gap:10px;margin-top:4px}' +
    '.inv-item-qty-lbl{font-size:10px;font-weight:800;text-transform:uppercase;color:#111;white-space:nowrap}' +
    '.inv-item-fill--qty{flex:1;min-height:32px;border-bottom:2px dashed #555;background:#fffef6}' +
    '@media print{body{padding:8px}.inv-items-grid{gap:8px 12px}}';

  var INV_PRINT_CSS_THERMAL =
    '@page{size:80mm auto;margin:2mm}' +
    'body{margin:0;padding:4px 6px;width:72mm;font-family:Consolas,monospace;font-size:11px;color:#000}' +
    'h1{font-size:13px;margin:0 0 6px;line-height:1.2}' +
    '.inv-meta{font-size:9px;margin:0 0 8px;color:#333;line-height:1.35}' +
    '.inv-thermal-item{padding:8px 0;border-bottom:1px dashed #444;page-break-inside:avoid}' +
    '.inv-thermal-name{font-size:12px;font-weight:700;line-height:1.25;margin:0 0 4px;word-wrap:break-word}' +
    '.inv-thermal-unit{font-size:10px;margin:0 0 6px}' +
    '.inv-thermal-unit strong{font-size:12px}' +
    '.inv-thermal-qty{font-size:10px;margin:0;line-height:1.35}' +
    '.inv-thermal-qty-line{display:block;margin-top:4px;border-bottom:2px dashed #000;min-height:22px}' +
    '.inv-foot{font-size:8px;margin-top:8px;color:#555}';

  function inventarioPrintPageCss(pageFormat) {
    var pf = String(pageFormat || 'a4').toLowerCase();
    var pageSize = pf === 'legal' || pf === 'oficio' ? 'legal landscape' : 'A4 landscape';
    return '@page{size:' + pageSize + ';margin:10mm}';
  }

  function inventarioNormalizeOutput(id) {
    var s = String(id || 'carta').toLowerCase();
    if (s === 'thermal' || s === 'roll' || s === 'termica') return 'roll_80';
    if (s === 'normal' || s === 'html' || s === 'a4') return 'carta';
    if (s === 'roll_58' || s === '58' || s === '50') return 'roll_58';
    if (s === 'roll_80' || s === '80') return 'roll_80';
    if (s === 'oficio' || s === 'legal') return 'oficio';
    if (s === 'carta') return 'carta';
    return 'carta';
  }

  function inventarioOutputMeta(id) {
    id = inventarioNormalizeOutput(id);
    if (id === 'roll_58') return { id: id, kind: 'roll', sz: '58', page: 'a4', printerHint: 'Térmica bodega (58 mm)' };
    if (id === 'roll_80') return { id: id, kind: 'roll', sz: '80', page: 'a4', printerHint: 'Térmica bodega (80 mm)' };
    if (id === 'oficio') return { id: id, kind: 'sheet', page: 'legal', printerHint: 'Láser / caja (Oficio apaisado)' };
    return { id: 'carta', kind: 'sheet', page: 'a4', printerHint: 'Láser / caja (Carta apaisado)' };
  }

  var INVENTARIO_PRINT_KINDS = {
    conteo: {
      id: 'conteo',
      label: 'Hoja de conteo',
      desc: 'Nombre · unidad · espacio para cantidad (sin teórico)',
      outputs: ['roll_58', 'roll_80', 'carta', 'oficio'],
      best: 'roll_80',
    },
    conteo_capturado: {
      id: 'conteo_capturado',
      label: 'Conteo capturado',
      desc: 'Valores ya registrados en el sistema',
      outputs: ['roll_58', 'roll_80', 'carta', 'oficio'],
      best: 'carta',
    },
    stock: {
      id: 'stock',
      label: 'Stock teórico',
      desc: 'Teórico, $/u y valor por MP',
      outputs: ['roll_58', 'roll_80', 'carta', 'oficio'],
      best: 'carta',
    },
    completo: {
      id: 'completo',
      label: 'Listado completo',
      desc: 'Inicial, entradas, salidas y teórico',
      outputs: ['roll_58', 'roll_80', 'carta', 'oficio'],
      best: 'oficio',
    },
    movs: {
      id: 'movs',
      label: 'Libro de movimientos',
      desc: 'Entradas, salidas y ajustes recientes',
      outputs: ['roll_58', 'roll_80', 'carta', 'oficio'],
      best: 'carta',
    },
  };

  function inventarioKindAllowsOutput(kind, outputId) {
    var def = INVENTARIO_PRINT_KINDS[kind];
    if (!def) return true;
    outputId = inventarioNormalizeOutput(outputId);
    return def.outputs.indexOf(outputId) >= 0;
  }

  function inventarioOutputGuideText(outputId) {
    outputId = inventarioNormalizeOutput(outputId);
    var meta = inventarioOutputMeta(outputId);
    if (meta.kind === 'roll') {
      return (
        'Formato activo: <strong>' +
        esc(meta.printerHint) +
        '</strong> · Ideal para hoja de conteo en bodega. Stock y movimientos salen en listado compacto.'
      );
    }
    return (
      'Formato activo: <strong>' +
      esc(meta.printerHint) +
      '</strong> · Hoja apaisada, 2 columnas. Recomendado para stock, listado completo y movimientos.'
    );
  }

  function refreshInventarioPrintGuide(root) {
    root = root || document.getElementById('mainContent');
    if (!root) return;
    var guide = root.querySelector('#crozzoInvOutputGuide');
    if (!guide) return;
    guide.innerHTML = inventarioOutputGuideText(inventarioSavedPrintOutput());
  }

  function inventarioResolvePrintOpts(extra) {
    extra = extra || {};
    if (extra.printOpts && typeof extra.printOpts === 'object') {
      return Object.assign({}, extra.printOpts);
    }
    if (
      global.CrozzoPrintStudioHub &&
      typeof global.CrozzoPrintStudioHub.getInventarioPrintOpts === 'function'
    ) {
      return global.CrozzoPrintStudioHub.getInventarioPrintOpts();
    }
    var conf = typeof global.getFacturacionAdminConfig === 'function' ? global.getFacturacionAdminConfig() : {};
    var outputId = 'carta';
    try {
      var stored = localStorage.getItem('crozzo_print_output_inventario');
      if (stored) outputId = inventarioNormalizeOutput(stored);
    } catch (_) {}
    var meta = inventarioOutputMeta(outputId);
    var isRoll = meta.kind === 'roll';
    return {
      printOutput: meta.id,
      pageFormat: isRoll ? undefined : meta.page,
      landscape: !isRoll,
      allowDialog: true,
      silent: false,
      printer: isRoll
        ? String(conf.impresoraBodega || conf.impresoraCajaPos || '').trim()
        : String(conf.impresoraCajaPos || conf.impresoraFacturas || '').trim(),
      role: isRoll ? 'bodega' : 'caja',
      channel: isRoll ? 'roll' : 'normal',
      paperSz: meta.sz,
    };
  }

  function inventarioLogoHeaderHtml() {
    var url =
      typeof global.crozzoResolveTicketLogoUrl === 'function' ? global.crozzoResolveTicketLogoUrl() : '';
    if (!url) return '';
    return '<div class="inv-logo-head"><img src="' + esc(url) + '" alt="Logo"/></div>';
  }

  function inventarioEmpresaNombre() {
    try {
      var emp = global.config && global.config.getEmpresa ? global.config.getEmpresa() : {};
      return String(emp.nombreComercial || emp.razonSocial || 'CROZZO POS').trim();
    } catch (_) {
      return 'CROZZO POS';
    }
  }

  function inventarioBodegaUbicacion() {
    try {
      if (typeof global.getFacturacionAdminConfig === 'function') {
        var c = global.getFacturacionAdminConfig();
        if (c.bodegaMarcacion && c.bodegaMarcacion.ubicacion) return String(c.bodegaMarcacion.ubicacion).trim();
      }
    } catch (_) {}
    return '';
  }

  function buildInventarioHeaderGrid(kind, data) {
    var meta = data.meta || {};
    var fecha = String(data.fecha || new Date().toISOString().slice(0, 10)).slice(0, 10);
    var items = data.items || [];
    var responsable = String(meta.contadoPor || '').trim();
    var isConteo = kind === 'conteo' || kind === 'conteo_capturado';
    var fields = [
      { label: 'Empresa / negocio', value: inventarioEmpresaNombre(), fill: false },
      {
        label: isConteo ? 'Fecha conteo' : 'Fecha reporte',
        value: fecha,
        fill: kind === 'conteo',
      },
      {
        label: 'Responsable',
        value: responsable,
        fill: kind === 'conteo' && !responsable,
      },
      {
        label: 'Bodega / ubicación',
        value: meta.ubicacion || inventarioBodegaUbicacion() || '',
        fill: !meta.ubicacion && !inventarioBodegaUbicacion(),
      },
      { label: 'Total materias primas', value: String(items.length), fill: false },
      { label: 'Filtro / categoría', value: meta.filtro || 'Todas', fill: false },
    ];
    return (
      '<div class="inv-header-grid">' +
      fields
        .map(function (f) {
          var valCls = 'inv-header-val' + (f.fill && !f.value ? ' inv-header-val--fill' : '');
          var inner = f.fill && !f.value ? '' : esc(f.value || '—');
          return (
            '<div class="inv-header-cell"><span class="inv-header-lbl">' +
            esc(f.label) +
            '</span><span class="' +
            valCls +
            '">' +
            inner +
            '</span></div>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function buildInventarioSignGrid() {
    return (
      '<div class="inv-sign-grid">' +
      '<div class="inv-sign-cell"><span class="inv-header-lbl">Firma responsable</span><span class="inv-sign-line"></span></div>' +
      '<div class="inv-sign-cell"><span class="inv-header-lbl">Revisado / jefe bodega</span><span class="inv-sign-line"></span></div>' +
      '</div>'
    );
  }

  function inventarioItemUndLabel(it) {
    return String(it.undLabel || invUndDisplay(it.und) || 'und').trim() || 'und';
  }

  function buildInventarioItemConteoCard(it) {
    var und = esc(inventarioItemUndLabel(it));
    return (
      '<div class="inv-item-card inv-item-card--conteo">' +
      '<div class="inv-item-name">' +
      esc(it.nombre || 'Materia prima') +
      '</div>' +
      '<div class="inv-item-unit-row"><span class="inv-item-unit-lbl">Unidad</span><span class="inv-item-unit">' +
      und +
      '</span></div>' +
      '<div class="inv-item-qty-row"><span class="inv-item-qty-lbl">Cantidad</span><span class="inv-item-fill inv-item-fill--qty"></span></div>' +
      '</div>'
    );
  }

  function buildInventarioMovsThermal(movs) {
    movs = movs || [];
    if (!movs.length) {
      return '<p class="inv-meta">Sin movimientos registrados.</p>';
    }
    return movs
      .slice(0, 120)
      .map(function (m) {
        return (
          '<div class="inv-thermal-item">' +
          '<div class="inv-thermal-name">' +
          esc(invTipoLabel(m.tipo)) +
          ' · ' +
          esc(m.productoNombre || m.productoRefId || '—') +
          '</div>' +
          '<div class="inv-thermal-unit">' +
          esc(String(m.fecha || '').slice(0, 16)) +
          '</div>' +
          '<div class="inv-thermal-qty">' +
          esc(formatInvQty(m.cantidad)) +
          ' ' +
          esc(m.unidad || '') +
          (m.costoUnitario > 0 ? ' · ' + esc(engFmt(m.costoUnitario)) : '') +
          '</div></div>'
        );
      })
      .join('');
  }

  function buildInventarioItemsThermal(kind, items, data) {
    items = items || [];
    var lineas = (data && data.lineas) || {};
    return items
      .map(function (it) {
        var und = esc(inventarioItemUndLabel(it));
        var block =
          '<div class="inv-thermal-item">' +
          '<div class="inv-thermal-name">' +
          esc(it.nombre || 'Materia prima') +
          '</div>' +
          '<div class="inv-thermal-unit">Unidad: <strong>' +
          und +
          '</strong></div>';
        if (kind === 'conteo' || kind === 'conteo_capturado') {
          if (kind === 'conteo_capturado') {
            var l = lineas[it.mpId] || {};
            var fis = l.fisico;
            var hasFis = fis != null && fis !== '' && isFinite(Number(fis));
            block +=
              '<div class="inv-thermal-qty">Cantidad: <strong>' +
              (hasFis ? esc(formatInvQty(fis)) + ' ' + und : '—') +
              '</strong></div>';
          } else {
            block += '<div class="inv-thermal-qty">Cantidad:<span class="inv-thermal-qty-line"></span></div>';
          }
        } else if (kind === 'stock' || kind === 'completo') {
          block +=
            '<div class="inv-thermal-qty">Teórico: <strong>' +
            esc(formatInvQty(it.teorico)) +
            ' ' +
            und +
            '</strong></div>';
        }
        block += '</div>';
        return block;
      })
      .join('');
  }

  /** Listado MP en dos columnas (Carta / Oficio horizontal). */
  function buildInventarioItemsTwoCol(kind, items, data) {
    items = items || [];
    var lineas = (data && data.lineas) || {};
    return (
      '<div class="inv-items-grid">' +
      items
        .map(function (it, i) {
          if (kind === 'conteo') {
            return buildInventarioItemConteoCard(it);
          }
          var card = '<div class="inv-item-card">';
          card += '<div class="inv-item-num">#' + (i + 1) + ' · ' + esc(it.categoria || 'OTRO') + '</div>';
          card += '<div class="inv-item-name">' + esc(it.nombre || 'Materia prima') + '</div>';
          card +=
            '<div class="inv-item-unit-row"><span class="inv-item-unit-lbl">Unidad</span><span class="inv-item-unit">' +
            esc(inventarioItemUndLabel(it)) +
            '</span></div>';

          if (kind === 'stock') {
            card +=
              '<div class="inv-item-row"><label>Teórico</label><strong>' +
              esc(formatInvQty(it.teorico)) +
              ' ' +
              esc(it.undLabel) +
              '</strong></div>';
            card +=
              '<div class="inv-item-row"><label>Valor</label><span>' +
              esc(it.valor > 0 ? engFmt(it.valor) : '—') +
              '</span></div>';
          } else if (kind === 'completo') {
            card +=
              '<div class="inv-item-row"><label>Teórico</label><strong>' +
              esc(formatInvQty(it.teorico)) +
              ' ' +
              esc(it.undLabel) +
              '</strong></div>';
            card +=
              '<div class="inv-item-row"><label>In · Out</label><span>' +
              esc(formatInvQty(it.entradas)) +
              ' / ' +
              esc(formatInvQty(it.salidas)) +
              '</span></div>';
          } else if (kind === 'conteo_capturado') {
            var l = lineas[it.mpId] || {};
            var fis = l.fisico;
            var hasFis = fis != null && fis !== '' && isFinite(Number(fis));
            var teor = Number(l.teorico != null ? l.teorico : it.teorico) || 0;
            var diff = hasFis ? Number(fis) - teor : null;
            var diffCls = diff != null ? inventarioConteoDiffClass(diff) : '';
            card +=
              '<div class="inv-item-row"><label>Teórico</label><strong>' +
              esc(formatInvQty(teor)) +
              ' ' +
              esc(it.undLabel) +
              '</strong></div>';
            card +=
              '<div class="inv-item-row"><label>Físico</label><span>' +
              (hasFis ? esc(formatInvQty(fis)) + ' ' + esc(it.undLabel) : '—') +
              '</span></div>';
            if (diff != null) {
              card +=
                '<div class="inv-item-row"><label>Dif.</label><span class="' +
                diffCls +
                '">' +
                esc(inventarioConteoDiffFmt(diff)) +
                '</span></div>';
            }
          }
          card += '</div>';
          return card;
        })
        .join('') +
      '</div>'
    );
  }

  function buildInventarioPrintHtml(kind, data, printOpts) {
    data = data || {};
    printOpts = inventarioResolvePrintOpts({ printOpts: printOpts });
    var items = data.items || [];
    var fecha = String(data.fecha || new Date().toISOString().slice(0, 10)).slice(0, 10);
    var meta = data.meta || {};
    var titulo = 'Inventario materias primas';
    var subtitulo = inventarioEmpresaNombre() + ' · CROZZO POS · ' + fecha;
    var bodyContent = '';
    var gridKind = kind === 'conteo' ? 'conteo' : kind;

    if (kind === 'stock') {
      titulo = 'Stock teórico — Materias primas';
      subtitulo = 'Teórico = Inicial + Entradas − Salidas · listado en 2 columnas (Carta / Oficio)';
      bodyContent = buildInventarioItemsTwoCol('stock', items, data);
    } else if (kind === 'completo') {
      titulo = 'Listado completo inventario MP';
      subtitulo = 'Mismo orden que inventario en pantalla · 2 columnas';
      bodyContent = buildInventarioItemsTwoCol('completo', items, data);
    } else if (kind === 'conteo_capturado') {
      titulo = 'Conteo físico (capturado en sistema)';
      subtitulo = 'Valores registrados · 2 columnas';
      bodyContent = buildInventarioItemsTwoCol('conteo_capturado', items, data);
    } else if (kind === 'movs') {
      titulo = 'Libro de movimientos (reciente)';
      var movs = data.movs || [];
      bodyContent =
        '<table><thead><tr><th>Fecha</th><th>Tipo</th><th>Detalle</th><th class="num">Cantidad</th><th class="num">$/u</th></tr></thead><tbody>' +
        movs
          .map(function (m) {
            return (
              '<tr><td>' +
              esc(String(m.fecha || '').slice(0, 16)) +
              '</td><td>' +
              esc(invTipoLabel(m.tipo)) +
              '</td><td>' +
              esc(m.productoNombre || m.productoRefId || '') +
              '</td><td class="num">' +
              esc(formatInvQty(m.cantidad)) +
              '</td><td class="num">' +
              esc(m.costoUnitario > 0 ? engFmt(m.costoUnitario) : '—') +
              '</td></tr>'
            );
          })
          .join('') +
        '</tbody></table>';
    } else {
      titulo = 'Hoja de conteo físico — Materias primas';
      subtitulo = 'Nombre · unidad (g / ml / und) · espacio para cantidad';
      bodyContent = buildInventarioItemsTwoCol(gridKind, items, data);
    }

    var outMeta = inventarioOutputMeta(printOpts.printOutput);
    var isRoll = outMeta.kind === 'roll';
    if (isRoll) {
      if (kind === 'movs') {
        titulo = 'Movimientos MP · ' + (outMeta.sz === '58' ? '58' : '80') + ' mm';
        subtitulo = 'Entradas, salidas y ajustes · listado térmico';
        bodyContent = buildInventarioMovsThermal(data.movs || []);
      } else {
        titulo = 'Conteo MP · ' + (outMeta.sz === '58' ? '58' : '80') + ' mm';
        subtitulo = 'Escriba la cantidad en la unidad indicada';
        bodyContent = buildInventarioItemsThermal(gridKind, items, data);
      }
    }

    var statsLine = '';
    if (data.stats) {
      statsLine =
        '<p class="inv-meta"><strong>Resumen:</strong> Valor teórico ' +
        esc(engFmt(data.stats.valorTotal || 0)) +
        (meta.contadas != null ? ' · Contados: ' + meta.contadas + '/' + meta.total : '') +
        '</p>';
    }

    var headerGrid = isRoll && kind === 'movs' ? '' : buildInventarioHeaderGrid(kind, data);
    var signGrid =
      !isRoll && (kind === 'conteo' || kind === 'conteo_capturado') ? buildInventarioSignGrid() : '';

    var css = isRoll
      ? INV_PRINT_CSS_THERMAL.replace('80mm', outMeta.sz === '58' ? '58mm' : '80mm').replace('72mm', outMeta.sz === '58' ? '52mm' : '72mm')
      : inventarioPrintPageCss(printOpts.pageFormat) + INV_PRINT_CSS_BODY;

    return (
      '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>' +
      esc(titulo) +
      '</title><style>' +
      css +
      '</style></head><body>' +
      inventarioLogoHeaderHtml() +
      '<h1>' +
      esc(titulo) +
      '</h1>' +
      headerGrid +
      '<p class="inv-meta">' +
      subtitulo +
      '</p>' +
      statsLine +
      bodyContent +
      signGrid +
      '<p class="inv-foot">Generado ' +
      new Date().toLocaleString('es-CO') +
      ' · Crozzo POS · formato conteo v2 (nombre · unidad · cantidad)</p></body></html>'
    );
  }

  function printInventarioWindowFallback(html) {
    var w = window.open('', '_blank', 'width=960,height=720');
    if (!w) {
      toast('Permita ventanas emergentes para imprimir', 'warning');
      return Promise.resolve(false);
    }
    w.document.write(html);
    w.document.close();
    w.focus();
    return new Promise(function (resolve) {
      global.setTimeout(function () {
        try {
          w.print();
          resolve(true);
        } catch (_) {
          resolve(false);
        }
      }, 450);
    });
  }

  function printInventarioDocument(kind, data, extra) {
    extra = extra || {};
    var printOpts = inventarioResolvePrintOpts(extra);
    var meta = inventarioOutputMeta(printOpts.printOutput);
    var html = buildInventarioPrintHtml(kind, data, printOpts);
    var docOpts = {
      allowDialog: printOpts.allowDialog !== false,
      silent: printOpts.silent === true,
      landscape: printOpts.landscape === true,
      pageFormat: printOpts.pageFormat,
      printOutput: printOpts.printOutput,
      printer: printOpts.printer,
      role: printOpts.role || (meta.kind === 'roll' ? 'bodega' : 'caja'),
      channel: printOpts.channel || (meta.kind === 'roll' ? 'roll' : 'normal'),
      paperSz: printOpts.paperSz || meta.sz,
      preferEscPos: meta.kind === 'roll',
      toast: true,
    };
    var itemCount = (data && data.items && data.items.length) || 0;
    var fmtLbl = inventarioPrintOutputLabel(printOpts.printOutput);
    if (typeof global.crozzoPrintHtmlDocument === 'function') {
      return global.crozzoPrintHtmlDocument(html, docOpts).then(function (ok) {
        if (!ok) {
          toast('No se imprimió en «' + fmtLbl + '». Abriendo vista previa…', 'warning');
          return printInventarioWindowFallback(html);
        }
        if (kind === 'conteo' || kind === 'conteo_capturado') {
          toast('Conteo impreso · ' + fmtLbl + ' · ' + itemCount + ' ítems (nombre → unidad → cantidad)', 'success');
        } else if (kind === 'stock' || kind === 'completo') {
          toast('Reporte impreso · ' + fmtLbl + ' · ' + itemCount + ' ítems', 'success');
        } else if (kind === 'movs') {
          toast('Movimientos impresos · ' + fmtLbl, 'success');
        }
        return ok;
      });
    }
    return printInventarioWindowFallback(html).then(function () {
      toast('Vista previa · ' + fmtLbl, 'info');
      return true;
    });
  }

  function inventarioSavedPrintOutput() {
    try {
      var stored = localStorage.getItem('crozzo_print_output_inventario');
      if (stored) return inventarioNormalizeOutput(stored);
    } catch (_) {}
    return 'carta';
  }

  function inventarioPrintOutputLabel(id) {
    var m = inventarioOutputMeta(inventarioNormalizeOutput(id));
    if (m.kind === 'roll') return (m.sz === '58' ? '58' : '80') + ' mm · térmica bodega';
    return m.id === 'oficio' ? 'Oficio · impresora caja' : 'Carta · impresora caja';
  }

  function pickInventarioPrintOutput(outputId) {
    outputId = inventarioNormalizeOutput(outputId);
    try {
      localStorage.setItem('crozzo_print_output_inventario', outputId);
    } catch (_) {}
    var host = document.querySelector('[data-inv-print-format]');
    if (host) {
      host.querySelectorAll('[data-inv-out], [data-output]').forEach(function (btn) {
        var id = btn.getAttribute('data-inv-out') || btn.getAttribute('data-output');
        btn.classList.toggle('is-on', id === outputId);
      });
    }
    if (global.CrozzoPrintStudioHub && typeof global.CrozzoPrintStudioHub.pickPrintOutput === 'function') {
      global.CrozzoPrintStudioHub.pickPrintOutput('inventario', outputId);
    }
    refreshInventarioPrintGuide();
    toast('Formato inventario: ' + inventarioPrintOutputLabel(outputId), 'info');
  }

  function inventarioPrintFormatPickerHtml() {
    var current = inventarioSavedPrintOutput();
    var H = global.CrozzoPrintStudioHub;
    if (H && typeof H.renderPrintOutputPicker === 'function') {
      return (
        '<div class="crozzo-inv-print-format" data-inv-print-format="hub">' +
        H.renderPrintOutputPicker('inventario', current, ['roll_58', 'roll_80', 'carta', 'oficio']) +
        '</div>'
      );
    }
    var opts = [
      { id: 'roll_58', label: '58 mm', hint: 'Térmica bodega' },
      { id: 'roll_80', label: '80 mm', hint: 'Térmica bodega' },
      { id: 'carta', label: 'Carta', hint: 'Láser caja' },
      { id: 'oficio', label: 'Oficio', hint: 'Láser caja' },
    ];
    return (
      '<div class="crozzo-inv-print-format crozzo-print-output" data-inv-print-format="inline" data-print-output-scope="inventario">' +
      '<span class="crozzo-print-output__label">Formato / impresora</span>' +
      '<div class="crozzo-print-output__pills">' +
      opts
        .map(function (o) {
          return (
            '<button type="button" class="crozzo-print-output__btn' +
            (current === o.id ? ' is-on' : '') +
            '" data-inv-out="' +
            esc(o.id) +
            '" data-output="' +
            esc(o.id) +
            '" title="' +
            esc(o.hint) +
            '" onclick="CrozzoSistemaCostos.pickInventarioPrintOutput(\'' +
            esc(o.id) +
            '\')">' +
            esc(o.label) +
            '</button>'
          );
        })
        .join('') +
      '</div>' +
      '<span class="form-hint crozzo-print-output__hint">58/80 mm → rollo térmico en bodega · Carta/Oficio → hoja apaisada en impresora de caja</span>' +
      '</div>'
    );
  }

  function renderInventarioPrintExportHub() {
    var fmt = inventarioSavedPrintOutput();
    return (
      '<div class="crozzo-inv-output-hub">' +
      inventarioPrintFormatPickerHtml() +
      '<p class="crozzo-inv-output-guide" id="crozzoInvOutputGuide">' +
      inventarioOutputGuideText(fmt) +
      '</p>' +
      '<div class="crozzo-inv-output-grid">' +
      '<section class="crozzo-inv-output-card crozzo-inv-output-card--bodega">' +
      '<header class="crozzo-inv-output-card__head">' +
      '<span class="crozzo-inv-output-card__icon" aria-hidden="true">📋</span>' +
      '<div><h3 class="crozzo-inv-output-card__title">Bodega · conteo físico</h3>' +
      '<p class="crozzo-inv-output-card__desc">Hoja en blanco: nombre → unidad → cantidad. Use <strong>58/80 mm</strong> en térmica o Carta para hoja grande.</p></div></header>' +
      '<div class="crozzo-inv-output-card__actions">' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoInvPreviewConteo">👁 Vista previa</button>' +
      '<button type="button" class="btn btn-primary btn-sm" id="crozzoInvPrintConteo">🖨 Imprimir conteo</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoInvDownloadConteo">⬇ CSV conteo</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoInvDownloadHtmlConteo">⬇ HTML prueba</button>' +
      '</div></section>' +
      '<section class="crozzo-inv-output-card crozzo-inv-output-card--oficina">' +
      '<header class="crozzo-inv-output-card__head">' +
      '<span class="crozzo-inv-output-card__icon" aria-hidden="true">🖨</span>' +
      '<div><h3 class="crozzo-inv-output-card__title">Oficina · reportes</h3>' +
      '<p class="crozzo-inv-output-card__desc">Stock teórico, listado completo y movimientos. Recomendado <strong>Carta u Oficio</strong> apaisado; en térmica sale listado compacto.</p></div></header>' +
      '<div class="crozzo-inv-output-card__actions">' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoInvPrintStock">Stock teórico</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoInvPrintCompleto">Listado completo</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoInvPrintMovs">Movimientos</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoInvPrintConteoCapturado">Conteo capturado</button>' +
      '</div></section>' +
      '<section class="crozzo-inv-output-card crozzo-inv-output-card--export">' +
      '<header class="crozzo-inv-output-card__head">' +
      '<span class="crozzo-inv-output-card__icon" aria-hidden="true">⬇</span>' +
      '<div><h3 class="crozzo-inv-output-card__title">Descargar datos</h3>' +
      '<p class="crozzo-inv-output-card__desc">CSV para Excel · HTML para probar maquetación sin imprimir.</p></div></header>' +
      '<div class="crozzo-inv-output-card__actions">' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoInvDownloadStock">CSV stock</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoInvDownloadCompleto">CSV completo</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoInvDownloadMovs">CSV movimientos</button>' +
      '<button type="button" class="btn btn-link btn-sm" id="crozzoInvGoConteoTab">✏ Conteo en pantalla →</button>' +
      '</div></section></div></div>'
    );
  }

  function previewInventarioConteo() {
    var snap = buildInventarioSnapshot();
    var items = inventarioItemsForPrint(snap);
    if (!items.length) {
      toast('No hay materias primas para mostrar', 'warning');
      return Promise.resolve(false);
    }
    var ui = hub.inventarioUi || {};
    var html = buildInventarioPrintHtml(
      'conteo',
      {
        items: items,
        fecha: ui.conteoFecha || new Date().toISOString().slice(0, 10),
        meta: {
          contadoPor: ui.conteoPor || invConteoUser(),
          filtro: String(ui.q || '').trim() || (ui.cat && ui.cat !== 'all' ? 'Categoría: ' + ui.cat : ''),
          ubicacion: inventarioBodegaUbicacion(),
        },
      },
      inventarioResolvePrintOpts({})
    );
    return printInventarioWindowFallback(html).then(function () {
      toast('Vista previa · ' + inventarioPrintOutputLabel(inventarioSavedPrintOutput()), 'info');
      return true;
    });
  }

  function printInventarioConteo(items, opts) {
    opts = opts || {};
    var ui = hub.inventarioUi || {};
    var filtroHint = String(ui.q || '').trim();
    if (!filtroHint && ui.cat && ui.cat !== 'all') filtroHint = 'Categoría: ' + ui.cat;
    return printInventarioDocument(
      opts.capturado ? 'conteo_capturado' : 'conteo',
      {
        items: items,
        fecha: ui.conteoFecha || new Date().toISOString().slice(0, 10),
        lineas: opts.lineas || ui.conteoLineas || {},
        meta: Object.assign({}, opts.meta || {}, {
          contadoPor: ui.conteoPor || invConteoUser(),
          filtro: filtroHint,
          ubicacion: inventarioBodegaUbicacion(),
          orden: 'Catálogo MP (mismo orden que inventario en pantalla)',
        }),
      },
      opts
    );
  }

  function printInventarioStock(items, snap, opts) {
    snap = snap || buildInventarioSnapshot();
    opts = opts || {};
    var ui = hub.inventarioUi || {};
    return printInventarioDocument(
      'stock',
      {
        items: items,
        stats: snap.stats,
        meta: { filtro: ui.q || (ui.cat !== 'all' ? ui.cat : '') },
      },
      opts
    );
  }

  function printInventarioCompleto(items, snap, opts) {
    snap = snap || buildInventarioSnapshot();
    opts = opts || {};
    return printInventarioDocument('completo', { items: items, stats: snap.stats }, opts);
  }

  function printInventarioMovs(snap, opts) {
    snap = snap || buildInventarioSnapshot();
    opts = opts || {};
    return printInventarioDocument(
      'movs',
      { movs: snap.movs, fecha: new Date().toISOString().slice(0, 10) },
      opts
    );
  }

  function invConteoUser() {
    var u = typeof global.getCurrentUser === 'function' ? global.getCurrentUser() : null;
    if (!u) return '';
    return String(u.nombre || u.name || u.displayName || u.email || '').trim();
  }

  function ensureInventarioConteoSession(snap) {
    if (!hub.inventarioUi) hub.inventarioUi = { q: '', cat: 'all', tab: 'conteo' };
    var ui = hub.inventarioUi;
    var today = new Date().toISOString().slice(0, 10);
    if (!ui.conteoFecha) ui.conteoFecha = today;
    if (!ui.conteoPor) ui.conteoPor = invConteoUser();
    var rv = reservorio();
    if (rv && rv.getInventarioConteoAbierto) {
      var open = ui.conteoId ? (rv.getInventarioConteo && rv.getInventarioConteo(ui.conteoId)) : rv.getInventarioConteoAbierto(ui.conteoFecha);
      if (open && open.estado === 'borrador') {
        ui.conteoId = open.id;
        ui.conteoFecha = String(open.fecha || ui.conteoFecha).slice(0, 10);
        ui.conteoPor = open.contadoPor || ui.conteoPor;
        ui.conteoLineas = open.lineas || {};
      }
    }
    if (!ui.conteoLineas || typeof ui.conteoLineas !== 'object') ui.conteoLineas = {};
    return ui;
  }

  function inventarioConteoDiffClass(diff) {
    var d = Number(diff);
    if (!isFinite(d) || Math.abs(d) < 0.001) return 'ok';
    var pct = Math.abs(d);
    if (pct <= 2) return 'warn';
    return 'bad';
  }

  function inventarioConteoDiffFmt(diff) {
    var d = Number(diff);
    if (!isFinite(d)) return '—';
    if (Math.abs(d) < 0.001) return '0';
    var sign = d > 0 ? '+' : '';
    return sign + formatInvQty(d);
  }

  function inventarioConteoStats(items, lineas) {
    var contadas = 0;
    var difs = 0;
    items.forEach(function (it) {
      var l = (lineas || {})[it.mpId];
      if (!l || l.fisico == null || l.fisico === '' || !isFinite(Number(l.fisico))) return;
      contadas++;
      var diff = Number(l.fisico) - (Number(l.teorico != null ? l.teorico : it.teorico) || 0);
      if (Math.abs(diff) > 0.001) difs++;
    });
    return { contadas: contadas, total: items.length, difs: difs };
  }

  function refreshInventarioPanel() {
    var host = document.getElementById('mainContent');
    if (!host) return;
    host.innerHTML = renderInventarioPanel();
    initInventarioPanel(host);
  }

  function collectInventarioConteoLineas(root) {
    var snap = buildInventarioSnapshot();
    var byMp = {};
    snap.items.forEach(function (it) {
      byMp[it.mpId] = it;
    });
    var lineas = Object.assign({}, (hub.inventarioUi && hub.inventarioUi.conteoLineas) || {});
    root.querySelectorAll('#crozzoInvConteoTbody tr[data-mp-id]').forEach(function (tr) {
      var mpId = tr.getAttribute('data-mp-id');
      if (!mpId) return;
      var it = byMp[mpId] || {};
      var fisInp = tr.querySelector('.crozzo-inv-conteo-fisico');
      var obsInp = tr.querySelector('.crozzo-inv-conteo-obs');
      var fisRaw = fisInp ? fisInp.value.trim() : '';
      var prev = lineas[mpId] || {};
      lineas[mpId] = {
        mpId: mpId,
        nombre: it.nombre || prev.nombre || mpId,
        categoria: it.categoria || prev.categoria || 'OTRO',
        und: it.und || prev.und || 'GR',
        precioUnit: it.precioUnit != null ? it.precioUnit : prev.precioUnit || 0,
        teorico: Number(tr.getAttribute('data-teorico')) || it.teorico || Number(prev.teorico) || 0,
        fisico: fisRaw === '' ? null : Number(fisRaw),
        obs: obsInp ? obsInp.value.trim() : prev.obs || '',
      };
    });
    return lineas;
  }

  function saveInventarioConteoFromUi(root, opts) {
    opts = opts || {};
    var rv = reservorio();
    if (!rv || !rv.upsertInventarioConteo) {
      toast('Reservorio no disponible', 'error');
      return null;
    }
    var snap = buildInventarioSnapshot();
    var ui = hub.inventarioUi || {};
    var items = filterInventarioItems(snap.items, ui.q, ui.cat);
    var fechaInp = root.querySelector('#crozzoInvConteoFecha');
    var porInp = root.querySelector('#crozzoInvConteoPor');
    var fecha = fechaInp ? String(fechaInp.value || '').slice(0, 10) : ui.conteoFecha;
    var contadoPor = porInp ? porInp.value.trim() : ui.conteoPor;
    if (!contadoPor) {
      toast('Indique quién realiza el conteo', 'warning');
      if (porInp) porInp.focus();
      return null;
    }
    var lineas = collectInventarioConteoLineas(root);
    var stats = inventarioConteoStats(snap.items, lineas);
    if (opts.cerrar && stats.contadas === 0) {
      toast('Registre al menos un conteo físico antes de cerrar', 'warning');
      return null;
    }
    var row = rv.upsertInventarioConteo({
      id: ui.conteoId || undefined,
      fecha: fecha,
      contadoPor: contadoPor,
      estado: 'borrador',
      lineas: lineas,
    });
    ui.conteoId = row.id;
    ui.conteoFecha = row.fecha;
    ui.conteoPor = row.contadoPor;
    ui.conteoLineas = row.lineas;
    if (opts.cerrar && rv.cerrarInventarioConteo) {
      var aplicar = !!(root.querySelector('#crozzoInvConteoAjustes') || {}).checked;
      if (aplicar && stats.difs > 0 && !confirm('¿Aplicar ' + stats.difs + ' ajuste(s) al libro de inventario?')) {
        aplicar = false;
      }
      row = rv.cerrarInventarioConteo(row.id, { aplicarAjustes: aplicar }) || row;
      emit('crozzo-costos:inventario-cerrado', {
        conteoId: row.id,
        fecha: row.fecha,
        resumen: row.resumen,
        ajustesAplicados: row.ajustesAplicados,
      });
      ui.conteoId = null;
      ui.conteoLineas = {};
      ui.tab = 'hist';
      toast(
        'Conteo cerrado · ' + stats.contadas + ' ítem(s)' + (row.ajustesAplicados ? ' · ajustes aplicados' : ''),
        'success'
      );
    } else {
      toast('Progreso guardado (' + stats.contadas + ' contados)', 'success');
    }
    refreshInventarioPanel();
    return row;
  }

  function updateInventarioConteoDiffRow(inp) {
    var tr = inp && inp.closest ? inp.closest('tr') : null;
    if (!tr) return;
    var teo = Number(tr.getAttribute('data-teorico')) || 0;
    var fisRaw = inp.value.trim();
    var diffCell = tr.querySelector('.crozzo-inv-diff');
    if (!diffCell) return;
    if (fisRaw === '') {
      diffCell.textContent = '—';
      diffCell.className = 'num crozzo-inv-diff crozzo-inv-diff--ok';
      tr.classList.remove('crozzo-inv-row--filled', 'crozzo-inv-row--diff');
      return;
    }
    var fis = Number(fisRaw);
    if (!isFinite(fis)) {
      diffCell.textContent = '—';
      return;
    }
    var diff = Math.round((fis - teo) * 100) / 100;
    var cls = inventarioConteoDiffClass(diff);
    if (hub.inventarioUi && hub.inventarioUi.conteoCiego) {
      diffCell.textContent = '—';
      diffCell.className = 'num crozzo-inv-diff crozzo-inv-diff--ok';
    } else {
      diffCell.textContent = inventarioConteoDiffFmt(diff);
      diffCell.className = 'num crozzo-inv-diff crozzo-inv-diff--' + cls;
    }
    tr.classList.add('crozzo-inv-row--filled');
    tr.classList.toggle('crozzo-inv-row--diff', Math.abs(diff) > 0.001);
  }

  function updateInventarioConteoProgress(root) {
    var tbody = root.querySelector('#crozzoInvConteoTbody');
    var lbl = root.querySelector('#crozzoInvConteoProgressLbl');
    var fill = root.querySelector('#crozzoInvConteoProgressFill');
    if (!tbody) return;
    var rows = tbody.querySelectorAll('tr[data-mp-id]');
    var total = 0;
    var contadas = 0;
    var difs = 0;
    rows.forEach(function (tr) {
      if (tr.style.display === 'none') return;
      total++;
      var inp = tr.querySelector('.crozzo-inv-conteo-fisico');
      if (!inp || inp.value.trim() === '') return;
      contadas++;
      var teo = Number(tr.getAttribute('data-teorico')) || 0;
      var fis = Number(inp.value);
      if (isFinite(fis) && Math.abs(fis - teo) > 0.001) difs++;
    });
    if (lbl) {
      lbl.textContent = contadas + ' de ' + total + ' contados' + (difs ? ' · ' + difs + ' con diferencia' : '');
    }
    if (fill) {
      var pct = total > 0 ? Math.round((contadas / total) * 100) : 0;
      fill.style.width = pct + '%';
    }
  }

  function renderInventarioConteoRows(items, lineas) {
    if (!items.length) {
      return '<tr><td colspan="6" style="text-align:center;padding:28px;opacity:.75">Sin materias primas — revise el catálogo MP o el filtro.</td></tr>';
    }
    var ciego = !!(hub.inventarioUi && hub.inventarioUi.conteoCiego);
    return items
      .map(function (it) {
        var l = (lineas || {})[it.mpId] || {};
        var fisVal = l.fisico != null && l.fisico !== '' && isFinite(Number(l.fisico)) ? String(l.fisico) : '';
        var diff =
          !ciego && fisVal !== ''
            ? Math.round((Number(fisVal) - it.teorico) * 100) / 100
            : null;
        var diffCls = diff != null ? inventarioConteoDiffClass(diff) : 'ok';
        var rowCls = fisVal !== '' ? ' crozzo-inv-row--filled' : '';
        if (diff != null && Math.abs(diff) > 0.001) rowCls += ' crozzo-inv-row--diff';
        var searchBlob = [it.nombre, it.categoria, it.mpId, it.undLabel].join(' ');
        return (
          '<tr class="' +
          rowCls.trim() +
          '" data-mp-id="' +
          esc(it.mpId) +
          '" data-inv-search="' +
          esc(searchBlob) +
          '" data-inv-cat="' +
          esc(it.categoria || 'OTRO') +
          '" data-teorico="' +
          esc(String(it.teorico)) +
          '">' +
          '<td><span class="crozzo-inv-mp">' +
          esc(it.nombre) +
          '</span><span class="crozzo-inv-cat">' +
          esc(it.categoria || 'OTRO') +
          '</span></td>' +
          '<td class="inv-unit">' +
          esc(it.undLabel) +
          '</td>' +
          (ciego
            ? '<td class="num crozzo-inv-teorico crozzo-inv-teorico--blind" title="Conteo ciego">—</td>'
            : '<td class="num crozzo-inv-teorico">' +
              formatInvQty(it.teorico) +
              ' <span style="opacity:.65;font-size:.85em">' +
              esc(it.undLabel) +
              '</span></td>') +
          '<td class="num"><input type="number" class="crozzo-inv-conteo-input crozzo-inv-conteo-fisico" inputmode="decimal" step="any" min="0" placeholder="—" value="' +
          esc(fisVal) +
          '" aria-label="Conteo físico ' +
          esc(it.nombre) +
          '"></td>' +
          '<td class="num crozzo-inv-diff crozzo-inv-diff--' +
          diffCls +
          '">' +
          (ciego ? '—' : diff != null ? inventarioConteoDiffFmt(diff) : '—') +
          '</td>' +
          '<td><input type="text" class="crozzo-inv-conteo-obs" placeholder="Obs." value="' +
          esc(l.obs || '') +
          '" maxlength="120"></td></tr>'
        );
      })
      .join('');
  }

  function renderInventarioConteoHistRows(conteos) {
    if (!conteos.length) {
      return '<tr><td colspan="5" style="text-align:center;padding:28px;opacity:.75">Aún no hay conteos cerrados. Use la pestaña Conteo físico para registrar el primero.</td></tr>';
    }
    return conteos
      .filter(function (c) {
        return c.estado === 'cerrado';
      })
      .map(function (c) {
        var r = c.resumen || {};
        return (
          '<tr><td style="white-space:nowrap">' +
          esc(String(c.fecha || '').slice(0, 10)) +
          '</td><td>' +
          esc(c.contadoPor || '—') +
          '<div class="crozzo-inv-hist-meta">' +
          esc(String(c.cerradoAt || c.updatedAt || '').slice(0, 16).replace('T', ' ')) +
          '</div></td><td class="num">' +
          esc(String(r.contadas || 0)) +
          '</td><td class="num">' +
          esc(String(r.difs || 0)) +
          '</td><td>' +
          (c.ajustesAplicados ? '<span class="crozzo-inv-cat">Ajustes OK</span>' : '<span style="opacity:.6;font-size:.72rem">Sin ajuste ledger</span>') +
          '</td></tr>'
        );
      })
      .join('');
  }

  function renderInventarioStockRows(items) {
    if (!items.length) {
      return '<tr><td colspan="8" style="text-align:center;padding:28px;opacity:.75">Sin materias primas que coincidan — revise el catálogo MP o el filtro.</td></tr>';
    }
    return items
      .map(function (it) {
        var searchBlob = [it.nombre, it.categoria, it.mpId, it.undLabel].join(' ');
        return (
          '<tr data-inv-search="' +
          esc(searchBlob) +
          '" data-inv-cat="' +
          esc(it.categoria || 'OTRO') +
          '">' +
          '<td><span class="crozzo-inv-mp">' +
          esc(it.nombre) +
          '</span><span class="crozzo-inv-cat">' +
          esc(it.categoria || 'OTRO') +
          '</span></td>' +
          '<td class="inv-unit">' +
          esc(it.undLabel) +
          '</td>' +
          '<td class="num" title="Suma entradas">' +
          (it.entradas > 0 ? '+' + formatInvQty(it.entradas) : '—') +
          '</td>' +
          '<td class="num" title="Suma salidas">' +
          (it.salidas > 0 ? '−' + formatInvQty(it.salidas) : '—') +
          '</td>' +
          '<td class="num crozzo-inv-teorico" title="Inicial + entradas − salidas">' +
          formatInvQty(it.teorico) +
          '</td>' +
          '<td class="num">' +
          (it.precioUnit > 0 ? engFmt(it.precioUnit) : '—') +
          '</td>' +
          '<td class="num">' +
          (it.valor > 0 ? engFmt(it.valor) : '—') +
          '</td>' +
          '<td style="font-size:.72rem;opacity:.75">' +
          (it.movCount > 0 ? it.movCount + ' mov.' : 'sin mov.') +
          '</td></tr>'
        );
      })
      .join('');
  }

  function formatInvQty(n) {
    var x = Number(n);
    if (!isFinite(x)) return '—';
    if (Math.abs(x - Math.round(x)) < 0.01) return String(Math.round(x));
    return String(Math.round(x * 100) / 100);
  }

  function bodegaLabelInv(bodegaId) {
    if (!bodegaId) return 'Principal';
    try {
      if (global.CrozzoFederacionEngine && global.CrozzoFederacionEngine.bodegaLabel) {
        return global.CrozzoFederacionEngine.bodegaLabel(bodegaId);
      }
    } catch (_) {}
    return bodegaId;
  }

  function renderInventarioMovRows(movs) {
    if (!movs.length) {
      return '<tr><td colspan="6" style="text-align:center;padding:28px;opacity:.75">Sin movimientos aún — las recepciones y ventas POS alimentan este libro.</td></tr>';
    }
    return movs
      .map(function (m) {
        var cls = invMovEsEntrada(m.tipo) ? 'in' : invMovEsSalida(m.tipo) ? 'out' : 'adj';
        var sign = cls === 'in' ? '+' : cls === 'out' ? '−' : '±';
        return (
          '<tr><td style="white-space:nowrap">' +
          esc(String(m.fecha || '').slice(0, 10)) +
          '</td><td><span class="crozzo-inv-mov-tipo crozzo-inv-mov-tipo--' +
          cls +
          '">' +
          esc(invTipoLabel(m.tipo)) +
          '</span></td><td>' +
          esc(m.productoNombre || m.productoRefId) +
          (m.notas ? '<span style="display:block;font-size:.68rem;opacity:.65;margin-top:2px">' + esc(m.notas) + '</span>' : '') +
          '</td><td style="font-size:.72rem;opacity:.85">' +
          esc(bodegaLabelInv(m.bodegaId)) +
          '</td><td class="num" style="font-weight:700">' +
          sign +
          formatInvQty(m.cantidad) +
          ' ' +
          esc(m.unidad || '') +
          '</td><td class="num">' +
          (m.costoUnitario > 0 ? engFmt(m.costoUnitario) : '—') +
          '</td></tr>'
        );
      })
      .join('');
  }

  function renderInventarioPanel() {
    if (!hub.inventarioUi) hub.inventarioUi = { q: '', cat: 'all', tab: 'stock', modo: 'perpetuo', conteoCiego: false, ciclicoAbc: 'pendientes' };
    var ui = hub.inventarioUi;
    var snap = buildInventarioSnapshot({ bodegaId: ui.bodega || '' });
    var filtered = filterInventarioItems(snap.items, ui.q, ui.cat);
    var tab = ui.tab || 'stock';
    if (tab === 'conteo') ensureInventarioConteoSession(snap);
    var conteoUi = hub.inventarioUi;
    var conteoStats = tab === 'conteo' ? inventarioConteoStats(filtered, conteoUi.conteoLineas) : null;
    var rv = reservorio();
    var histConteos = rv && rv.listInventarioConteos ? rv.listInventarioConteos(30) : [];
    var IC = global.CrozzoInventarioContinuo;
    var extStats = IC && IC.computeExtendedStats ? IC.computeExtendedStats(snap, histConteos) : null;
    var chips =
      '<button type="button" class="crozzo-inv-chip' +
      (ui.cat === 'all' ? ' is-active' : '') +
      '" data-inv-cat="all">Todas</button>' +
      snap.categorias
        .map(function (c) {
          return (
            '<button type="button" class="crozzo-inv-chip' +
            (ui.cat === c ? ' is-active' : '') +
            '" data-inv-cat="' +
            esc(c) +
            '">' +
            esc(c) +
            '</button>'
          );
        })
        .join('');
    var bodegas = [];
    try {
      if (global.CrozzoFederacionEngine && global.CrozzoFederacionEngine.listBodegas) {
        bodegas = global.CrozzoFederacionEngine.listBodegas();
      }
    } catch (_) {}
    var bodegaOpts =
      '<option value="">Todas las bodegas (global)</option>' +
      bodegas
        .map(function (b) {
          return (
            '<option value="' +
            esc(b.id) +
            '"' +
            (ui.bodega === b.id ? ' selected' : '') +
            '>' +
            esc(b.nombre) +
            '</option>'
          );
        })
        .join('');

    return (
      '<div class="crozzo-costos-hub crozzo-inventario-premium">' +
      '<header class="crozzo-inv-hero">' +
      '<div class="crozzo-inv-hero__glow" aria-hidden="true"></div>' +
      '<p class="crozzo-inv-hero__eyebrow">F3 · Inventario continuo</p>' +
      '<h1 class="crozzo-inv-hero__title">Centro de control de bodega</h1>' +
      '<p class="crozzo-inv-hero__sub">Cuatro métodos operativos: perpetuo, conteo físico, cíclico ABC y ajustes. Mismo catálogo que costos · impresión térmica o hoja · ledger unificado.</p>' +
      '</header>' +
      (IC && IC.renderMethodHub ? IC.renderMethodHub(ui, extStats) : '') +
      (IC && IC.renderExtendedKpis ? IC.renderExtendedKpis(extStats) : '') +
      '<div class="crozzo-inv-kpis">' +
      '<div class="crozzo-inv-kpi"><span class="crozzo-inv-kpi__lbl">Materias primas</span><span class="crozzo-inv-kpi__val">' +
      esc(String(snap.stats.totalMp)) +
      '</span></div>' +
      '<div class="crozzo-inv-kpi"><span class="crozzo-inv-kpi__lbl">Con movimientos</span><span class="crozzo-inv-kpi__val">' +
      esc(String(snap.stats.conMov)) +
      '</span></div>' +
      '<div class="crozzo-inv-kpi"><span class="crozzo-inv-kpi__lbl">Entradas mes</span><span class="crozzo-inv-kpi__val">' +
      formatInvQty(snap.stats.entradasMes || 0) +
      '</span></div>' +
      '<div class="crozzo-inv-kpi"><span class="crozzo-inv-kpi__lbl">Salidas mes</span><span class="crozzo-inv-kpi__val">' +
      formatInvQty(snap.stats.salidasMes || 0) +
      '</span></div>' +
      '</div>' +
      '<p class="crozzo-inv-formula">' +
      '<strong>Teórico</strong> <span class="crozzo-inv-formula__op">=</span> Inicial <span class="crozzo-inv-formula__op">+</span> Entradas <span class="crozzo-inv-formula__op">−</span> Salidas' +
      ' <span class="crozzo-inv-formula__op">·</span> <strong>Diferencia</strong> <span class="crozzo-inv-formula__op">=</span> Conteo físico <span class="crozzo-inv-formula__op">−</span> Teórico' +
      ' <span class="crozzo-inv-formula__op">·</span> <strong>Valor</strong> <span class="crozzo-inv-formula__op">=</span> cantidad × $/u vigente' +
      '</p>' +
      renderInventarioPrintExportHub() +
      '<div class="crozzo-inv-tabs" role="tablist">' +
      '<button type="button" class="crozzo-inv-tab' +
      (tab === 'stock' ? ' is-active' : '') +
      '" data-inv-tab="stock">Stock teórico <small>(' +
      filtered.length +
      ')</small></button>' +
      '<button type="button" class="crozzo-inv-tab' +
      (tab === 'conteo' ? ' is-active' : '') +
      '" data-inv-tab="conteo">Conteo físico' +
      (conteoStats && conteoStats.contadas ? ' <small>(' + conteoStats.contadas + ')</small>' : '') +
      '</button>' +
      '<button type="button" class="crozzo-inv-tab' +
      (tab === 'ciclico' ? ' is-active' : '') +
      '" data-inv-tab="ciclico">Cíclico ABC</button>' +
      '<button type="button" class="crozzo-inv-tab' +
      (tab === 'ajustes' ? ' is-active' : '') +
      '" data-inv-tab="ajustes">Ajustes</button>' +
      '<button type="button" class="crozzo-inv-tab' +
      (tab === 'movs' ? ' is-active' : '') +
      '" data-inv-tab="movs">Libro de movimientos</button>' +
      '<button type="button" class="crozzo-inv-tab' +
      (tab === 'hist' ? ' is-active' : '') +
      '" data-inv-tab="hist">Historial conteos</button>' +
      '</div>' +
      '<div class="crozzo-inv-panel' +
      (tab === 'stock' ? ' is-active' : '') +
      '" data-inv-panel="stock">' +
      '<div class="crozzo-inv-toolbar">' +
      '<select class="form-input crozzo-inv-bodega-sel" id="crozzoInvBodega" style="max-width:220px;margin-right:8px" title="Filtrar teórico y movimientos por bodega">' +
      bodegaOpts +
      '</select>' +
      '<input type="search" class="crozzo-inv-search" id="crozzoInvSearch" placeholder="Buscar MP, categoría… (ej. lacteos queso)" value="' +
      esc(ui.q) +
      '" autocomplete="off">' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoInvRefresh">↻ Actualizar</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoInvPrintMovs">🖨 Movimientos</button>' +
      '</div>' +
      '<div class="crozzo-inv-chips" role="group" aria-label="Categoría">' +
      chips +
      '</div>' +
      '<div class="crozzo-inv-table-shell">' +
      '<div class="crozzo-inv-scroll"><table class="crozzo-inv-table"><thead><tr>' +
      '<th>Materia prima</th><th class="num">Unidad</th><th class="num">Entradas</th><th class="num">Salidas</th><th class="num">Teórico</th><th class="num">$/u</th><th class="num">Valor</th><th>Actividad</th>' +
      '</tr></thead><tbody id="crozzoInvStockTbody">' +
      renderInventarioStockRows(snap.items) +
      '</tbody></table></div></div></div>' +
      '<div class="crozzo-inv-panel' +
      (tab === 'conteo' ? ' is-active' : '') +
      '" data-inv-panel="conteo">' +
      '<div class="crozzo-inv-conteo-bar">' +
      '<div class="form-group"><label class="form-label" for="crozzoInvConteoFecha">Fecha conteo</label><input type="date" class="form-input" id="crozzoInvConteoFecha" value="' +
      esc(conteoUi.conteoFecha || new Date().toISOString().slice(0, 10)) +
      '"></div>' +
      '<div class="form-group"><label class="form-label" for="crozzoInvConteoPor">Contado por</label><input type="text" class="form-input" id="crozzoInvConteoPor" placeholder="Nombre responsable" value="' +
      esc(conteoUi.conteoPor || '') +
      '" autocomplete="name"></div>' +
      '<div class="crozzo-inv-conteo-progress"><div class="crozzo-inv-conteo-progress__lbl" id="crozzoInvConteoProgressLbl">' +
      (conteoStats ? conteoStats.contadas + ' de ' + conteoStats.total + ' contados' : '0 contados') +
      '</div><div class="crozzo-inv-conteo-progress__track"><div class="crozzo-inv-conteo-progress__fill" id="crozzoInvConteoProgressFill" style="width:' +
      (conteoStats && conteoStats.total ? Math.round((conteoStats.contadas / conteoStats.total) * 100) : 0) +
      '%"></div></div></div>' +
      (conteoUi.conteoId ? '<span class="form-hint" style="margin:0;align-self:center">Borrador guardado</span>' : '') +
      '<label class="crozzo-inv-conteo-opt"><input type="checkbox" id="crozzoInvConteoCiego"' +
      (ui.conteoCiego ? ' checked' : '') +
      '> Conteo ciego (ocultar teórico)</label>' +
      '</div>' +
      '<div class="crozzo-inv-toolbar">' +
      '<input type="search" class="crozzo-inv-search" id="crozzoInvConteoSearch" placeholder="Filtrar materias a contar…" value="' +
      esc(ui.q) +
      '" autocomplete="off">' +
      '</div>' +
      '<div class="crozzo-inv-chips" role="group" aria-label="Categoría conteo">' +
      chips +
      '</div>' +
      '<div class="crozzo-inv-table-shell">' +
      '<div class="crozzo-inv-scroll"><table class="crozzo-inv-table"><thead><tr>' +
      '<th>Materia prima</th><th class="num">Unidad</th><th class="num">Teórico</th><th class="num">Conteo físico</th><th class="num">Diferencia</th><th>Obs.</th>' +
      '</tr></thead><tbody id="crozzoInvConteoTbody">' +
      renderInventarioConteoRows(snap.items, conteoUi.conteoLineas) +
      '</tbody></table></div></div>' +
      '<div class="crozzo-inv-conteo-foot">' +
      '<label class="crozzo-inv-conteo-opt"><input type="checkbox" id="crozzoInvConteoAjustes" checked> Aplicar ajustes al cerrar (ledger)</label>' +
      '<span class="form-hint" style="margin:0;flex:1">Puede llenar solo los ítems que aplique · el resto queda sin contar</span>' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoInvPrintConteoCapturado">🖨 Imprimir conteo actual</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoInvConteoSave">💾 Guardar progreso</button>' +
      '<button type="button" class="btn btn-primary btn-sm" id="crozzoInvConteoClose">✓ Cerrar conteo</button>' +
      '</div></div>' +
      '<div class="crozzo-inv-panel' +
      (tab === 'ciclico' ? ' is-active' : '') +
      '" data-inv-panel="ciclico">' +
      (IC && IC.renderCiclicoPanel ? IC.renderCiclicoPanel(snap.items, ui, histConteos) : '<p class="form-hint">Cargue CrozzoInventarioContinuo.js</p>') +
      '</div>' +
      '<div class="crozzo-inv-panel' +
      (tab === 'ajustes' ? ' is-active' : '') +
      '" data-inv-panel="ajustes">' +
      (IC && IC.renderAjustesPanel ? IC.renderAjustesPanel(snap.items, bodegas) : '') +
      '</div>' +
      '<div class="crozzo-inv-panel' +
      (tab === 'movs' ? ' is-active' : '') +
      '" data-inv-panel="movs">' +
      '<div class="crozzo-inv-table-shell">' +
      '<div class="crozzo-inv-scroll"><table class="crozzo-inv-table"><thead><tr>' +
      '<th>Fecha</th><th>Tipo</th><th>Producto / detalle</th><th>Bodega</th><th class="num">Cantidad</th><th class="num">$/u mov.</th>' +
      '</tr></thead><tbody>' +
      renderInventarioMovRows(snap.movs) +
      '</tbody></table></div></div></div>' +
      '<div class="crozzo-inv-panel' +
      (tab === 'hist' ? ' is-active' : '') +
      '" data-inv-panel="hist">' +
      '<div class="crozzo-inv-table-shell">' +
      '<div class="crozzo-inv-scroll"><table class="crozzo-inv-table"><thead><tr>' +
      '<th>Fecha</th><th>Responsable</th><th class="num">Contados</th><th class="num">Con dif.</th><th>Ledger</th>' +
      '</tr></thead><tbody>' +
      renderInventarioConteoHistRows(histConteos) +
      '</tbody></table></div></div></div>' +
      '<div class="crozzo-inv-foot">' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoInvGoRecepcion">Recepción facturas →</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoInvGoCatalogo">Costos y márgenes →</button></div></div>'
    );
  }

  function applyInventarioFilters(root) {
    if (!root || !hub.inventarioUi) return;
    var q = hub.inventarioUi.q;
    var cat = hub.inventarioUi.cat;
    ['#crozzoInvStockTbody', '#crozzoInvConteoTbody'].forEach(function (sel) {
      root.querySelectorAll(sel + ' tr[data-inv-search]').forEach(function (tr) {
        var blob = tr.getAttribute('data-inv-search') || '';
        var trCat = tr.getAttribute('data-inv-cat') || '';
        var matchQ = matchSearchQuery(blob, q);
        var matchCat = cat === 'all' || trCat === cat;
        tr.style.display = matchQ && matchCat ? '' : 'none';
      });
    });
    updateInventarioConteoProgress(root);
  }

  function initInventarioPanel(root) {
    if (!root) return;
    if (!hub.inventarioUi) hub.inventarioUi = { q: '', cat: 'all', tab: 'stock', bodega: '' };

    var bodegaSel = root.querySelector('#crozzoInvBodega');
    if (bodegaSel && !bodegaSel._bound) {
      bodegaSel._bound = true;
      bodegaSel.addEventListener('change', function () {
        hub.inventarioUi.bodega = bodegaSel.value || '';
        refreshInventarioPanel();
      });
    }

    var search = root.querySelector('#crozzoInvSearch');
    if (search && !search._bound) {
      search._bound = true;
      search.addEventListener('input', function () {
        hub.inventarioUi.q = search.value.trim();
        applyInventarioFilters(root);
      });
    }

    root.querySelectorAll('[data-inv-cat]').forEach(function (btn) {
      if (btn._bound) return;
      btn._bound = true;
      btn.addEventListener('click', function () {
        hub.inventarioUi.cat = btn.getAttribute('data-inv-cat') || 'all';
        root.querySelectorAll('[data-inv-cat]').forEach(function (b) {
          b.classList.toggle('is-active', b === btn);
        });
        applyInventarioFilters(root);
      });
    });

    root.querySelectorAll('[data-inv-tab]').forEach(function (btn) {
      if (btn._bound) return;
      btn._bound = true;
      btn.addEventListener('click', function () {
        var tab = btn.getAttribute('data-inv-tab') || 'stock';
        hub.inventarioUi.tab = tab;
        var modoMap = { stock: 'perpetuo', conteo: 'conteo', ciclico: 'ciclico', ajustes: 'ajustes' };
        if (modoMap[tab]) hub.inventarioUi.modo = modoMap[tab];
        if (tab === 'conteo') ensureInventarioConteoSession(buildInventarioSnapshot());
        refreshInventarioPanel();
      });
    });

    var searchConteo = root.querySelector('#crozzoInvConteoSearch');
    if (searchConteo && !searchConteo._bound) {
      searchConteo._bound = true;
      searchConteo.addEventListener('input', function () {
        hub.inventarioUi.q = searchConteo.value.trim();
        applyInventarioFilters(root);
      });
    }

    root.querySelectorAll('.crozzo-inv-conteo-fisico').forEach(function (inp) {
      if (inp._bound) return;
      inp._bound = true;
      inp.addEventListener('input', function () {
        updateInventarioConteoDiffRow(inp);
        updateInventarioConteoProgress(root);
      });
    });

    var saveConteo = root.querySelector('#crozzoInvConteoSave');
    if (saveConteo && !saveConteo._bound) {
      saveConteo._bound = true;
      saveConteo.addEventListener('click', function () {
        saveInventarioConteoFromUi(root, { cerrar: false });
      });
    }

    var closeConteo = root.querySelector('#crozzoInvConteoClose');
    if (closeConteo && !closeConteo._bound) {
      closeConteo._bound = true;
      closeConteo.addEventListener('click', function () {
        if (!confirm('¿Cerrar este conteo? Podrá verlo en Historial conteos.')) return;
        saveInventarioConteoFromUi(root, { cerrar: true });
      });
    }

    var goConteoTab = root.querySelector('#crozzoInvGoConteoTab');
    if (goConteoTab && !goConteoTab._bound) {
      goConteoTab._bound = true;
      goConteoTab.addEventListener('click', function () {
        hub.inventarioUi.tab = 'conteo';
        ensureInventarioConteoSession(buildInventarioSnapshot());
        refreshInventarioPanel();
      });
    }

    var fechaConteo = root.querySelector('#crozzoInvConteoFecha');
    if (fechaConteo && !fechaConteo._bound) {
      fechaConteo._bound = true;
      fechaConteo.addEventListener('change', function () {
        hub.inventarioUi.conteoFecha = fechaConteo.value;
        hub.inventarioUi.conteoId = null;
        hub.inventarioUi.conteoLineas = {};
        ensureInventarioConteoSession(buildInventarioSnapshot());
        refreshInventarioPanel();
      });
    }

    var dlConteo = root.querySelector('#crozzoInvDownloadConteo');
    if (dlConteo && !dlConteo._bound) {
      dlConteo._bound = true;
      dlConteo.addEventListener('click', function () {
        var snap = buildInventarioSnapshot();
        var items = filterInventarioItems(snap.items, hub.inventarioUi.q, hub.inventarioUi.cat);
        downloadInventarioConteoCsv(items.length ? items : snap.items);
      });
    }

    var dlComp = root.querySelector('#crozzoInvDownloadCompleto');
    if (dlComp && !dlComp._bound) {
      dlComp._bound = true;
      dlComp.addEventListener('click', function () {
        var snap = buildInventarioSnapshot();
        downloadInventarioCompletoCsv(snap.items);
      });
    }

    var dlStock = root.querySelector('#crozzoInvDownloadStock');
    if (dlStock && !dlStock._bound) {
      dlStock._bound = true;
      dlStock.addEventListener('click', function () {
        var snap = buildInventarioSnapshot();
        var items = filterInventarioItems(snap.items, hub.inventarioUi.q, hub.inventarioUi.cat);
        downloadInventarioStockCsv(items.length ? items : snap.items);
      });
    }

    var dlMovs = root.querySelector('#crozzoInvDownloadMovs');
    if (dlMovs && !dlMovs._bound) {
      dlMovs._bound = true;
      dlMovs.addEventListener('click', function () {
        downloadInventarioMovsCsv(buildInventarioSnapshot().movs);
      });
    }

    var dlHtml = root.querySelector('#crozzoInvDownloadHtmlConteo');
    if (dlHtml && !dlHtml._bound) {
      dlHtml._bound = true;
      dlHtml.addEventListener('click', function () {
        var snap = buildInventarioSnapshot();
        var items = inventarioItemsForPrint(snap);
        var ui = hub.inventarioUi || {};
        downloadInventarioHtml(
          'conteo',
          {
            items: items,
            fecha: ui.conteoFecha || new Date().toISOString().slice(0, 10),
            meta: {
              contadoPor: ui.conteoPor || invConteoUser(),
              filtro: String(ui.q || '').trim() || (ui.cat && ui.cat !== 'all' ? 'Categoría: ' + ui.cat : ''),
              ubicacion: inventarioBodegaUbicacion(),
            },
          },
          {}
        );
      });
    }

    var prPreview = root.querySelector('#crozzoInvPreviewConteo');
    if (prPreview && !prPreview._bound) {
      prPreview._bound = true;
      prPreview.addEventListener('click', function () {
        previewInventarioConteo();
      });
    }

    var prConteo = root.querySelector('#crozzoInvPrintConteo');
    if (prConteo && !prConteo._bound) {
      prConteo._bound = true;
      prConteo.addEventListener('click', function () {
        var snap = buildInventarioSnapshot();
        printInventarioConteo(inventarioItemsForPrint(snap));
      });
    }

    var prStock = root.querySelector('#crozzoInvPrintStock');
    if (prStock && !prStock._bound) {
      prStock._bound = true;
      prStock.addEventListener('click', function () {
        var snap = buildInventarioSnapshot();
        printInventarioStock(inventarioItemsForPrint(snap), snap);
      });
    }

    var prCompleto = root.querySelector('#crozzoInvPrintCompleto');
    if (prCompleto && !prCompleto._bound) {
      prCompleto._bound = true;
      prCompleto.addEventListener('click', function () {
        var snap = buildInventarioSnapshot();
        printInventarioCompleto(inventarioItemsForPrint(snap), snap);
      });
    }

    var prCapt = root.querySelector('#crozzoInvPrintConteoCapturado');
    if (prCapt && !prCapt._bound) {
      prCapt._bound = true;
      prCapt.addEventListener('click', function () {
        var snap = buildInventarioSnapshot();
        var lineas = collectInventarioConteoLineas(root);
        hub.inventarioUi.conteoLineas = lineas;
        printInventarioConteo(inventarioItemsForPrint(snap), { capturado: true, lineas: lineas });
      });
    }

    var prMovs = root.querySelector('#crozzoInvPrintMovs');
    if (prMovs && !prMovs._bound) {
      prMovs._bound = true;
      prMovs.addEventListener('click', function () {
        printInventarioMovs(buildInventarioSnapshot({ bodegaId: hub.inventarioUi.bodega || '' }));
      });
    }

    var refresh = root.querySelector('#crozzoInvRefresh');
    if (refresh && !refresh._bound) {
      refresh._bound = true;
      refresh.addEventListener('click', function () {
        refreshInventarioPanel();
        toast('Inventario actualizado', 'info');
      });
    }

    var goRec = root.querySelector('#crozzoInvGoRecepcion');
    if (goRec && !goRec._bound) {
      goRec._bound = true;
      goRec.addEventListener('click', function () {
        goPage('compras-recepcion');
      });
    }

    var goCat = root.querySelector('#crozzoInvGoCatalogo');
    if (goCat && !goCat._bound) {
      goCat._bound = true;
      goCat.addEventListener('click', function () {
        goPage('costos-matriz');
      });
    }

    applyInventarioFilters(root);
    if (hub.inventarioUi.tab === 'conteo') updateInventarioConteoProgress(root);
    refreshInventarioPrintGuide(root);
    if (global.CrozzoInventarioContinuo && global.CrozzoInventarioContinuo.initExtras) {
      global.CrozzoInventarioContinuo.initExtras(root, {
        hub: hub,
        ui: hub.inventarioUi,
        refresh: refreshInventarioPanel,
        toast: toast,
        printCiclico: function () {
          var snap = buildInventarioSnapshot({ bodegaId: hub.inventarioUi.bodega || '' });
          var IC = global.CrozzoInventarioContinuo;
          var rvLocal = reservorio();
          var items =
            IC && IC.getCiclicoItemsForPrint
              ? IC.getCiclicoItemsForPrint(
                  snap.items,
                  hub.inventarioUi,
                  rvLocal && rvLocal.listInventarioConteos ? rvLocal.listInventarioConteos(30) : []
                )
              : snap.items;
          if (!items.length) {
            toast('No hay ítems en la lista cíclica actual', 'warning');
            return;
          }
          printInventarioConteo(items, {
            meta: { filtro: 'Conteo cíclico ABC · ' + (hub.inventarioUi.ciclicoAbc || 'pendientes') },
          });
        },
      });
    }
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
      '<button type="button" class="btn btn-primary btn-sm" id="crozzoReservorioExport">Exportar backup JSON</button></div></div>'
    );
  }

  function canConfigPerdidasProceso() {
    if (typeof global.isSuperAdminUser === 'function' && global.isSuperAdminUser()) return true;
    if (typeof global.getCurrentUser !== 'function') return false;
    var u = global.getCurrentUser();
    if (!u) return false;
    var r =
      typeof global.crozzoNormalizeAppRol === 'function'
        ? global.crozzoNormalizeAppRol(u.rol)
        : String(u.rol || '').toLowerCase();
    return (
      r === 'admin' ||
      r === 'superadmin' ||
      r === 'super_admin' ||
      r === 'gerente' ||
      r === 'jefe_compras' ||
      r === 'jefe-compras'
    );
  }

  function renderPerdidasProcesoAdminPanel() {
    if (!canConfigPerdidasProceso()) return '';
    var C = global.CrozzoCatalogoMp;
    var ref =
      C && C.getPerdidasProcesoRef
        ? C.getPerdidasProcesoRef()
        : { despiecePct: 15, coccionPct: 25, toleranciaPct: 3 };
    return (
      '<section class="crozzo-perdidas-proceso" id="crozzoPerdidasProceso" aria-labelledby="crozzoPerdidasProcesoTitle">' +
      '<h2 class="crozzo-perdidas-proceso__head" id="crozzoPerdidasProcesoTitle">Pérdidas en cocina <span style="font-size:.72rem;font-weight:600;opacity:.75">· referencia para recetas</span></h2>' +
      '<p class="crozzo-perdidas-proceso__sub">Valores por defecto al <strong>costear recetas</strong>. Cocina no ve ni edita estos % — solo pesos y porciones. Si un insumo tiene % propio en Catálogo MP, ese valor tiene prioridad.</p>' +
      '<div class="crozzo-perdidas-proceso__grid">' +
      '<div><label for="crozzoPerdDesp">Al partir carnes (%)</label>' +
      '<input type="number" class="form-input" id="crozzoPerdDesp" min="0" max="95" step="0.5" value="' +
      esc(String(Number(ref.despiecePct))) +
      '"></div>' +
      '<div><label for="crozzoPerdCoc">Al cocinar (%)</label>' +
      '<input type="number" class="form-input" id="crozzoPerdCoc" min="0" max="95" step="0.5" value="' +
      esc(String(Number(ref.coccionPct))) +
      '"></div>' +
      '<div><label for="crozzoPerdTol">Tolerancia alerta (± %)</label>' +
      '<input type="number" class="form-input" id="crozzoPerdTol" min="0" max="25" step="0.5" value="' +
      esc(String(Number(ref.toleranciaPct))) +
      '" title="Por encima de lo esperado + tolerancia → alerta"></div></div>' +
      '<div class="crozzo-perdidas-proceso__foot">' +
      '<button type="button" class="btn btn-primary btn-sm" id="crozzoPerdSave">Guardar referencia de pérdidas</button>' +
      '<span class="form-hint" style="margin:0">Aplica a preparaciones de cocina y alertas de merma.</span></div>' +
      '<p class="crozzo-perdidas-proceso__hint">Por insumo: en <strong>Catálogo → Materias primas</strong> puede poner % de desposte y cocción distintos (ej. pollo vs res).</p></section>'
    );
  }

  function bindPerdidasProcesoAdmin(root) {
    if (!root || !canConfigPerdidasProceso()) return;
    var saveBtn = root.querySelector('#crozzoPerdSave');
    if (!saveBtn || saveBtn._bound) return;
    saveBtn._bound = true;
    saveBtn.addEventListener('click', function () {
      var C = global.CrozzoCatalogoMp;
      if (!C || !C.savePerdidasProcesoRef) {
        toast('Catálogo MP no disponible', 'warn');
        return;
      }
      C.savePerdidasProcesoRef({
        despiecePct: Number((root.querySelector('#crozzoPerdDesp') || {}).value),
        coccionPct: Number((root.querySelector('#crozzoPerdCoc') || {}).value),
        toleranciaPct: Number((root.querySelector('#crozzoPerdTol') || {}).value),
      });
      toast('Referencia de mermas guardada — procesos y recetas la usarán', 'success');
      try {
        document.dispatchEvent(
          new CustomEvent('crozzo-mermas-proceso-actualizadas', { bubbles: true })
        );
      } catch (_) {}
    });
  }

  function matrizCmdPendingCount() {
    var C = global.CrozzoCatalogoMp;
    if (!C || !C.listProgramacionesAll) return 0;
    return (C.listProgramacionesAll() || []).filter(function (x) {
      return x.programacion && x.programacion.estado === 'pendiente';
    }).length;
  }

  function renderMatrizCommandDeck() {
    var pending = matrizCmdPendingCount();
    var triggerSub =
      pending > 0
        ? pending + ' programación' + (pending === 1 ? '' : 'es') + ' pendiente' + (pending === 1 ? '' : 's')
        : 'Publicar en caja, sincronizar, archivar o reportes';
    return (
      '<div class="crozzo-matriz-cmd" id="crozzoMatrizCmd">' +
      '<button type="button" class="crozzo-matriz-cmd__trigger" id="crozzoMatrizCmdToggle" aria-expanded="false" aria-controls="crozzoMatrizCmdDeck">' +
      '<span class="crozzo-matriz-cmd__trigger-glow" aria-hidden="true"></span>' +
      '<span class="crozzo-matriz-cmd__trigger-glyph" aria-hidden="true">◈</span>' +
      '<span class="crozzo-matriz-cmd__trigger-copy">' +
      '<strong class="crozzo-matriz-cmd__trigger-title">Centro de acciones</strong>' +
      '<span class="crozzo-matriz-cmd__trigger-sub">' +
      esc(triggerSub) +
      '</span></span>' +
      (pending > 0 ? '<span class="crozzo-matriz-cmd__trigger-badge">' + esc(String(pending)) + '</span>' : '') +
      '<span class="crozzo-matriz-cmd__trigger-chev" aria-hidden="true"></span></button>' +
      '<div class="crozzo-matriz-cmd__deck" id="crozzoMatrizCmdDeck" hidden>' +
      '<div class="crozzo-matriz-cmd__deck-inner">' +
      '<header class="crozzo-matriz-cmd__head">' +
      '<div><p class="crozzo-matriz-cmd__eyebrow">Costos · Menú · Caja</p>' +
      '<h3 class="crozzo-matriz-cmd__title">¿Qué quieres hacer?</h3>' +
      '<p class="crozzo-matriz-cmd__lead">Elija una acción. Los platos nuevos entran a caja al publicar; los quitados del costeo se ocultan.</p></div>' +
      '<button type="button" class="crozzo-matriz-cmd__close" id="crozzoMatrizCmdClose" aria-label="Cerrar centro de acciones">×</button></header>' +
      '<div class="crozzo-matriz-cmd__grid">' +
      '<article class="crozzo-matriz-cmd__card crozzo-matriz-cmd__card--publish">' +
      '<div class="crozzo-matriz-cmd__card-top">' +
      '<span class="crozzo-matriz-cmd__card-icon" aria-hidden="true">⚡</span>' +
      '<div><h4 class="crozzo-matriz-cmd__card-title">Publicar en caja</h4>' +
      '<p class="crozzo-matriz-cmd__card-desc">Llevar precios y platos del costeo al POS, mesero y cocina.</p></div></div>' +
      '<div class="crozzo-matriz-cmd__card-actions">' +
      '<button type="button" class="crozzo-matriz-cmd__action crozzo-matriz-cmd__action--primary" id="crozzoMatrizAplicarCaja">Aplicar ahora</button>' +
      '<button type="button" class="crozzo-matriz-cmd__action crozzo-matriz-cmd__action--accent" id="crozzoMatrizProgramarCaja">Programar</button></div>' +
      '<div class="crozzo-matriz-cmd__schedule" id="crozzoMatrizCmdSchedule">' +
      '<label class="crozzo-matriz-cmd__schedule-lbl" for="crozzoMatrizProgDateTime">Vigencia programada</label>' +
      '<input type="datetime-local" class="crozzo-matriz-cmd__datetime" id="crozzoMatrizProgDateTime" title="Fecha y hora en caja">' +
      '<label class="crozzo-matriz-cmd__pref"><input type="checkbox" id="crozzoMatrizProgEnable"> Al guardar un precio, programar solo ese plato</label></div></article>' +
      '<article class="crozzo-matriz-cmd__card">' +
      '<div class="crozzo-matriz-cmd__card-top">' +
      '<span class="crozzo-matriz-cmd__card-icon" aria-hidden="true">◎</span>' +
      '<div><h4 class="crozzo-matriz-cmd__card-title">Ajustar matriz</h4>' +
      '<p class="crozzo-matriz-cmd__card-desc">Recalcular costos y precios sugeridos sin tocar la caja.</p></div></div>' +
      '<div class="crozzo-matriz-cmd__card-actions">' +
      '<button type="button" class="crozzo-matriz-cmd__action" id="crozzoMargenSyncCostos">Sincronizar costos</button>' +
      '<button type="button" class="crozzo-matriz-cmd__action" id="crozzoMargenAplicar">Recalcular con meta</button></div></article>' +
      '<article class="crozzo-matriz-cmd__card">' +
      '<div class="crozzo-matriz-cmd__card-top">' +
      '<span class="crozzo-matriz-cmd__card-icon" aria-hidden="true">💾</span>' +
      '<div><h4 class="crozzo-matriz-cmd__card-title">Archivar histórico</h4>' +
      '<p class="crozzo-matriz-cmd__card-desc">Guardar snapshot mensual del menú costeado. No modifica el vigente ni la caja.</p></div></div>' +
      '<div class="crozzo-matriz-cmd__card-actions">' +
      '<button type="button" class="crozzo-matriz-cmd__action crozzo-matriz-cmd__action--wide" id="crozzoGuardarCosteoMenu">Guardar costeo del mes</button></div></article>' +
      '<article class="crozzo-matriz-cmd__card crozzo-matriz-cmd__card--reports">' +
      '<div class="crozzo-matriz-cmd__card-top">' +
      '<span class="crozzo-matriz-cmd__card-icon" aria-hidden="true">📄</span>' +
      '<div><h4 class="crozzo-matriz-cmd__card-title">Reportes PDF</h4>' +
      '<p class="crozzo-matriz-cmd__card-desc">Documentos para gerencia, auditoría e inversores.</p></div></div>' +
      '<div class="crozzo-matriz-cmd__card-actions crozzo-matriz-cmd__card-actions--stack">' +
      '<button type="button" class="crozzo-matriz-cmd__action crozzo-matriz-cmd__action--ghost" id="crozzoCostosPdfMapaFlujos">Mapa de flujos</button>' +
      '<button type="button" class="crozzo-matriz-cmd__action crozzo-matriz-cmd__action--ghost" id="crozzoCostosPdfGeneral">Resumen general</button>' +
      '<button type="button" class="crozzo-matriz-cmd__action crozzo-matriz-cmd__action--ghost" id="crozzoCostosPdfDetallado">Detallado MP / recetas</button></div></article></div>' +
      '<footer class="crozzo-matriz-cmd__foot">' +
      '<label class="crozzo-matriz-cmd__pref"><input type="checkbox" id="crozzoMatrizAutoPosMargen"' +
      (loadAutoPosDesdeMargen() ? ' checked' : '') +
      '> Subir precio en caja automáticamente cuando suba el costo MP</label></footer></div></div></div>'
    );
  }

  function renderMargenGlobalBar() {
    var costoPct = loadGlobalCostoObjetivoPct();
    var alertaMpPct = loadGlobalMpAlertaSubidaPct();
    return (
      '<div class="crozzo-matriz-margen-global" id="crozzoMargenGlobal">' +
      '<div class="crozzo-matriz-margen-global__main">' +
      '<div class="crozzo-matriz-margen-global__label">' +
      '<strong>Tu meta de costo MP (menú completo)</strong>' +
      '<span class="crozzo-matriz-margen-global__formula">Precio sugerido = costo MP ÷ (meta costo %)</span></div>' +
      '<div class="crozzo-matriz-margen-global__ctrl">' +
      '<input type="range" class="crozzo-matriz-margen-global__range" id="crozzoMargenGlobalRange" min="15" max="85" step="1" value="' +
      esc(String(Math.round(costoPct))) +
      '" aria-label="Meta costo MP deslizador">' +
      '<div class="crozzo-matriz-margen-global__num">' +
      '<input type="number" class="crozzo-costos-editable crozzo-matriz-margen-global__pct" id="crozzoMargenGlobalPct" min="5" max="95" step="0.5" value="' +
      esc(String(costoPct)) +
      '" title="% costo MP sobre precio de venta (food cost)">' +
      '<span>% costo</span></div></div></div>' +
      '<div class="crozzo-matriz-margen-global__min">' +
      '<div class="crozzo-matriz-margen-global__label">' +
      '<strong>Alerta subida MP (tolerancia)</strong>' +
      '<span class="crozzo-matriz-margen-global__formula">Subida del costo MP vs guardado: mitad → naranja · umbral → roja</span></div>' +
      '<div class="crozzo-matriz-margen-global__ctrl">' +
      '<input type="range" class="crozzo-matriz-margen-global__range" id="crozzoMargenMinimoRange" min="2" max="30" step="1" value="' +
      esc(String(Math.round(alertaMpPct))) +
      '" aria-label="Umbral alerta subida MP">' +
      '<div class="crozzo-matriz-margen-global__num">' +
      '<input type="number" class="crozzo-costos-editable crozzo-matriz-margen-global__pct" id="crozzoMargenMinimoPct" min="2" max="50" step="0.5" value="' +
      esc(String(alertaMpPct)) +
      '" title="Subida % del costo MP para alerta roja">' +
      '<span>% subida</span></div></div></div>' +
      '<p class="crozzo-matriz-margen-global__hint">Cadena: <strong>precio MP</strong> → receta → costo plato → precio menú. Abra el <strong>centro de acciones</strong> para sincronizar o publicar. Alerta naranja ≥ ' +
      esc(String(Math.round(alertaMpPct / 2))) +
      '% · roja ≥ ' +
      esc(String(Math.round(alertaMpPct))) +
      '%.</p>' +
      renderMatrizCommandDeck() +
      '</div>'
    );
  }

  function pctUtilidadDisplayFromResumen(r) {
    return r.precioVenta > 0 ? Math.round(r.pctUtilidad * 1000) / 10 : 0;
  }

  function pctCostoDisplayFromResumen(r) {
    return r.precioVenta > 0 ? Math.round(r.pctCostoMp * 1000) / 10 : 0;
  }

  function renderCostoPctCellHtml(costoPct) {
    return (
      '<input type="number" class="crozzo-costos-editable crozzo-matriz-margen-inp" data-resumen-field="costoPct" min="1" max="99" step="0.1" value="' +
      esc(String(costoPct)) +
      '" title="% costo MP sobre precio de venta (food cost)">' +
      '<span class="crozzo-matriz-margen-suffix">%</span>'
    );
  }

  function renderUtilidadPctCellHtml(utilidadPct) {
    return (
      '<strong class="crozzo-matriz-margen-util" data-resumen-margen-util title="Utilidad ÷ precio (100% − costo MP)">' +
      esc(String(utilidadPct)) +
      '%</strong>'
    );
  }

  function refreshMargenUtilidadCell(tr, r) {
    if (!tr || !r) return;
    var el = tr.querySelector('[data-resumen-margen-util]');
    if (!el) return;
    el.textContent = (r.precioVenta > 0 ? pctUtilidadDisplayFromResumen(r) : 0) + '%';
  }

  function refreshCostoPctCell(tr, r) {
    if (!tr || !r) return;
    var inp = tr.querySelector('[data-resumen-field="costoPct"]');
    if (!inp || document.activeElement === inp) return;
    setInputSilent(inp, r.precioVenta > 0 ? pctCostoDisplayFromResumen(r) : 0);
  }

  function renderTipoRecetaControls(row) {
    if (!row || !row.tieneReceta || row.tipoCosteo === 'directo') return '';
    var C = global.CrozzoCatalogoMp;
    var tipoRec = row.tipoReceta;
    if (!tipoRec && C && C.inferTipoRecetaFromMenu) tipoRec = C.inferTipoRecetaFromMenu(row);
    tipoRec = tipoRec === 'base' ? 'base' : 'full';
    var html =
      '<span class="crozzo-matriz-tipo-receta-wrap">' +
      '<select class="crozzo-costos-editable crozzo-matriz-tipo-receta-sel" data-resumen-field="tipoReceta" title="Sub-receta = bodega con ingredientes · Plato = venta al cliente">' +
      '<option value="base"' +
      (tipoRec === 'base' ? ' selected' : '') +
      '>Sub-receta (bodega)</option>' +
      '<option value="full"' +
      (tipoRec === 'full' ? ' selected' : '') +
      '>Plato de carta</option>' +
      '</select>';
    if (tipoRec === 'base') {
      html +=
        '<label class="crozzo-matriz-vende-check" title="Esta base también se vende en carta">' +
        '<input type="checkbox" data-resumen-field="vendeAlCliente"' +
        (row.vendeAlCliente ? ' checked' : '') +
        '> En carta</label>';
    }
    html += '</span>';
    return html;
  }

  function renderEstadoFlujoUi(row) {
    var st = String((row && row.estadoFlujo) || 'vigente').toLowerCase();
    if (st !== 'borrador' && st !== 'programado') st = 'vigente';
    var cls = st === 'vigente' ? 'ok' : st === 'programado' ? 'warn' : 'draft';
    var label = st === 'vigente' ? 'En flujo operativo' : st === 'programado' ? 'Programado' : 'Borrador costeos';
    var html =
      '<span class="crozzo-matriz-flujo crozzo-matriz-flujo--' +
      cls +
      '" title="' +
      (st === 'vigente'
        ? 'Visible en caja, mesero y cocina'
        : st === 'programado'
          ? 'Se publicará en la fecha programada'
          : 'Solo en costeos — aún no en caja') +
      '">' +
      esc(label) +
      '</span>';
    if (row && row.programadoPara && st === 'programado') {
      html += '<span class="crozzo-matriz-flujo-date">' + esc(String(row.programadoPara).slice(0, 10)) + '</span>';
    }
    if (st !== 'vigente' && row && row.slug) {
      html +=
        '<button type="button" class="btn btn-outline btn-sm crozzo-matriz-lanzar" data-lanzar-slug="' +
        esc(row.slug) +
        '" title="Publicar ahora en caja, mesero y cocina">Lanzar ahora</button>';
    }
    return html;
  }

  function lanzarPlatoDesdeMatriz(slug, root, seed) {
    var C = global.CrozzoCatalogoMp;
    if (!C || !C.lanzarPlatoAlFlujoPrincipal) {
      toast('Catálogo no disponible', 'warning');
      return;
    }
    var row =
      mergeResumenList(seed || hub.seed).find(function (r) {
        return r.slug === slug;
      }) || null;
    var precio = row && row.precioVenta > 0 ? row.precioVenta : undefined;
    if (C.lanzarPlatoAlFlujoPrincipal(slug, { precioVenta: precio })) {
      toast('Plato publicado en caja, mesero y cocina', 'success');
      invalidateSeed();
      loadSeed(function (fresh) {
        hub.seed = fresh;
        if (root) refreshMatrizResumenTable(root, fresh);
      });
    } else {
      toast('No se pudo lanzar el plato', 'warning');
    }
  }

  function bindFlujoLanzarButtons(root, seed) {
    if (!root) return;
    root.querySelectorAll('[data-lanzar-slug]').forEach(function (btn) {
      if (btn._bound) return;
      btn._bound = true;
      btn.addEventListener('click', function () {
        var slug = btn.getAttribute('data-lanzar-slug');
        if (slug) lanzarPlatoDesdeMatriz(slug, root, seed);
      });
    });
  }

  function renderResumenRowsHtml(seed) {
    var e = engine();
    var list = mergeResumenList(seed);
    if (!e || !list.length) {
      return '<tr><td colspan="10">Sin platos en menú. Use <strong>+ Nuevo plato</strong> para crear el primero.</td></tr>';
    }
    var recetaCache = {};
    return list
      .map(function (row) {
        var costoVivo = resolveCostoVentaMenu(row, seed, recetaCache);
        var costoMp = costoVivo > 0 ? costoVivo : row.costoMp;
        var costoReceta = row.tipoCosteo !== 'directo' ? getRecetaCostoCached(row.slug, seed, recetaCache) : 0;
        var pendienteSync = Math.abs(costoVivo - Number(row.costoMp)) >= 2;
        var r = e.calcularResumen(costoMp, row.precioVenta);
        var ev = evaluarPlatoObjetivo(r, row, seed);
        var objFrac = getObjetivoCostoFraccion();
        var rowCls = ev.bajoTolerancia
          ? 'crozzo-matriz-row--crit'
          : !ev.dentroObjetivo || ev.alertaSubida === 'warn'
            ? 'crozzo-matriz-row--warn'
            : 'crozzo-matriz-row--ok';
        var matrizState = ev.bajoTolerancia ? 'crit' : !ev.dentroObjetivo || ev.alertaSubida === 'warn' ? 'warn' : 'ok';
        var costoPctDisplay = pctCostoDisplayFromResumen(r);
        var utilidadDisplay = pctUtilidadDisplayFromResumen(r);
        var desdeReceta =
          row.tipoCosteo !== 'directo' && costoReceta > 0 && Math.abs(costoReceta - costoMp) < 2;
        var desdeUnitario =
          row.tipoCosteo === 'directo' && costoVivo > 0 && !pendienteSync;
        var tipo = row.tipoCosteo === 'directo' ? 'directo' : row.tieneReceta ? 'receta' : 'receta';
        var tipoTag = row.tieneReceta
          ? '<span class="crozzo-matriz-tipo crozzo-matriz-tipo--receta">Receta</span>'
          : '<span class="crozzo-matriz-tipo crozzo-matriz-tipo--directo">Venta directa</span>';
        var catTag = row.categoria
          ? '<span class="crozzo-matriz-cat">' + esc(row.categoria) + '</span>'
          : '';
        var editPosBtn =
          row.posProductId != null && typeof global.showEditProductModal === 'function'
            ? ' <button type="button" class="btn btn-outline btn-sm" style="padding:2px 6px;font-size:10px;margin-left:6px;vertical-align:middle" onclick="showEditProductModal(' +
              esc(String(row.posProductId)) +
              ')">Editar plato</button>'
            : '';
        var cmpD = getRowComparativaCaja(row);
        var cmpState = cmpD ? cmpStateFromDelta(cmpD) : 'none';
        var searchBlob = [row.producto, row.slug, row.categoria, tipo, row.tieneReceta ? 'receta' : 'venta directa'].join(' ');
        return (
          '<tr class="' +
          rowCls +
          '" data-resumen-slug="' +
          esc(row.slug) +
          '" data-resumen-search="' +
          esc(searchBlob) +
          '" data-matriz-state="' +
          matrizState +
          '" data-matriz-tipo="' +
          tipo +
          '" data-matriz-cmp="' +
          esc(cmpState) +
          '">' +
          '<td><span class="crozzo-matriz-product">' +
          esc(row.producto) +
          '</span>' +
          tipoTag +
          catTag +
          editPosBtn +
          renderEstadoFlujoUi(row) +
          renderTipoRecetaControls(row) +
          '</td>' +
          '<td style="text-align:right" class="crozzo-matriz-costo-cell">' +
          '<span class="crozzo-matriz-costo-val" data-resumen-costo-mp="' +
          esc(String(Math.round(costoMp))) +
          '" title="' +
          (tipo === 'directo'
            ? 'Costo desde costeo unitario MP (solo lectura)'
            : 'Costo desde receta + MP unitarios (solo lectura)') +
          '">' +
          engFmt(costoMp) +
          '</span>' +
          (desdeReceta
            ? '<span class="crozzo-matriz-costo-tag" title="Costo desde receta">◎ receta</span>'
            : desdeUnitario
              ? '<span class="crozzo-matriz-costo-tag crozzo-matriz-costo-tag--mp" title="Costo unitario MP">◎ unit.</span>'
              : pendienteSync
                ? '<span class="crozzo-matriz-costo-tag crozzo-matriz-costo-tag--diff" title="Hay costo nuevo; pulse ↻ Sincronizar costos">◎ sync</span>'
                : row.tieneReceta
                  ? '<span class="crozzo-matriz-costo-tag crozzo-matriz-costo-tag--diff" title="Defina insumos en Recetas">sin costear</span>'
                  : '') +
          '</td>' +
          '<td style="text-align:right" class="crozzo-matriz-util" data-resumen-util>' +
          engFmt(r.utilidadBruta) +
          '</td>' +
          '<td style="text-align:right" class="crozzo-matriz-costo-pct-cell">' +
          renderCostoPctCellHtml(costoPctDisplay) +
          '</td>' +
          '<td style="text-align:right" class="crozzo-matriz-util-pct-cell">' +
          renderUtilidadPctCellHtml(utilidadDisplay) +
          '</td>' +
          '<td style="text-align:right" class="crozzo-matriz-precio-cell">' +
          '<input type="number" class="crozzo-costos-editable crozzo-matriz-precio-inp" data-resumen-field="precioVenta" min="0" step="100" value="' +
          esc(Math.round(row.precioVenta)) +
          '" title="Precio de venta (editable)">' +
          '</td>' +
          renderPrecioPosCell(row) +
          renderComparativaPrecioCell(row) +
          '<td data-resumen-obj-bar>' +
          renderObjetivoBarHtml(r.pctCostoMp, objFrac) +
          '</td>' +
          '<td data-resumen-obj>' +
          renderMatrizStatusPill(ev) +
          '</td></tr>'
        );
      })
      .join('');
  }

  function pctFracToInput(frac) {
    return Math.round(Number(frac || 0) * 1000) / 10;
  }

  function pctInputToFrac(val) {
    var n = Number(val);
    if (!isFinite(n)) return 0;
    return n / 100;
  }

  function cantidadEnGramos(cantidad, unidad, e) {
    var u = String(unidad || 'GR').trim().toUpperCase();
    var q = e && e.evalCantidad ? e.evalCantidad(cantidad) : Number(cantidad) || 0;
    if (!isFinite(q) || q <= 0) return 0;
    if (u === 'KG') return q * 1000;
    if (u === 'GR' || u === 'G') return q;
    if (u === 'MG') return q / 1000;
    if (u === 'ML') return q;
    if (u === 'L' || u === 'LT' || u === 'LTR') return q * 1000;
    return 0;
  }

  function sumPesoGrLineas(lineas, e) {
    if (!Array.isArray(lineas) || !lineas.length) return 0;
    var sum = lineas.reduce(function (s, ln) {
      return s + cantidadEnGramos(ln.cantidad, ln.unidad || ln.und, e);
    }, 0);
    return Math.round(sum * 100) / 100;
  }

  function recetaPesoAutoHint(pesoSum) {
    return 'Suma GR + ML: ' + pesoSum + ' g';
  }

  function resolvePorcionesManual(opts) {
    opts = opts || {};
    var manual = Number(opts.porcionesManual);
    if (isFinite(manual) && manual > 0) return manual;
    if (!opts.pesoAuto) {
      var p = Number(opts.porciones);
      if (isFinite(p) && p > 0) return p;
    }
    return 1;
  }

  function getRecetaOptsMerged(rec, seed, slugOpt) {
    var slug = slugOpt || getActiveRecetaSlug(seed);
    var draft = getRecetaDraft(slug);
    var base = { margenErrorPct: 0.03, porcentajeMpObjetivo: 0.3, impuestoPct: 0.08, porciones: 1, porcionesManual: 1, pesoAuto: false };
    var merged = Object.assign({}, base, (seed && seed.demoRecipe && seed.demoRecipe.opts) || {}, (rec && rec.opts) || {});
    if (draft && draft.opts) merged = Object.assign(merged, draft.opts);
    return merged;
  }

  function resolveRecetaCalcOpts(lineas, opts, e) {
    opts = Object.assign({}, opts || {});
    if (opts.pesoAuto) {
      var auto = sumPesoGrLineas(lineas, e);
      if (auto > 0) opts.porciones = auto;
      else opts.porciones = resolvePorcionesManual(opts);
    }
    var porc = Number(opts.porciones);
    if (!isFinite(porc) || porc <= 0) opts.porciones = 1;
    return opts;
  }

  function syncMargenErrorFromRecipeLineas(calcOpts, rec, lineas, root) {
    var C = global.CrozzoCatalogoMp;
    if (!C || !C.inferMargenErrorPctFromLineas || !Array.isArray(lineas) || !lineas.length) return calcOpts;
    var recOpts = (rec && rec.opts) || {};
    if (recOpts.margenErrorManual) return calcOpts;
    var inferred = C.inferMargenErrorPctFromLineas(lineas);
    if (inferred == null || inferred <= 0) return calcOpts;
    calcOpts = Object.assign({}, calcOpts);
    calcOpts.margenErrorPct = Math.max(Number(calcOpts.margenErrorPct) || 0.03, inferred);
    var scope = getRecetaEdicionPanel(root);
    var margenInp = scope && scope.querySelector('[data-receta-opt="margenErrorPct"]');
    if (margenInp && document.activeElement !== margenInp) {
      margenInp.value = String(Math.round(calcOpts.margenErrorPct * 1000) / 10);
    }
    return calcOpts;
  }

  function collectRecetaOptsFromDom(root, baseOpts, lineas, e) {
    baseOpts = Object.assign({}, baseOpts || {});
    var scope = getRecetaEdicionPanel(root);
    if (!scope) return baseOpts;
    var margenInp = scope.querySelector('[data-receta-opt="margenErrorPct"]');
    var mpObjInp = scope.querySelector('[data-receta-opt="porcentajeMpObjetivo"]');
    var impInp = scope.querySelector('[data-receta-opt="impuestoPct"]');
    var porcInp = scope.querySelector('[data-receta-opt="porciones"]');
    var pesoAutoChk = scope.querySelector('[data-receta-peso-auto]');
    if (margenInp) baseOpts.margenErrorPct = pctInputToFrac(margenInp.value);
    if (mpObjInp) baseOpts.porcentajeMpObjetivo = pctInputToFrac(mpObjInp.value);
    if (impInp) baseOpts.impuestoPct = pctInputToFrac(impInp.value);
    if (porcInp && !(pesoAutoChk && pesoAutoChk.checked)) {
      baseOpts.porciones = Number(porcInp.value) || 1;
      baseOpts.porcionesManual = baseOpts.porciones;
    }
    if (pesoAutoChk) baseOpts.pesoAuto = !!pesoAutoChk.checked;
    return resolveRecetaCalcOpts(lineas, baseOpts, e);
  }

  function renderRecetaWizardHtml(pack) {
    var n = pack && pack.lineas ? pack.lineas.length : 0;
    var precio = pack && pack.row ? Number(pack.row.precioVenta) || 0 : 0;
    var step3 = precio > 0 ? 'done' : n > 0 ? 'active' : '';
    var step2 = n > 0 ? 'done' : 'active';
    return (
      '<ol class="crozzo-receta-wizard" aria-label="Pasos para costear">' +
      '<li class="crozzo-receta-wizard__step is-done"><span class="crozzo-receta-wizard__num">1</span> Elija el plato</li>' +
      '<li class="crozzo-receta-wizard__step' +
      (step2 === 'done' ? ' is-done' : ' is-active') +
      '"><span class="crozzo-receta-wizard__num">2</span> Agregue insumos (' +
      esc(String(n)) +
      ')</li>' +
      '<li class="crozzo-receta-wizard__step' +
      (step3 === 'done' ? ' is-done' : step3 === 'active' ? ' is-active' : '') +
      '"><span class="crozzo-receta-wizard__num">3</span> Revise costo y precio</li>' +
      '</ol>'
    );
  }

  function renderRecetaResumenHtml(calc, opts, row, e, vistaOpts) {
    vistaOpts = vistaOpts || {};
    var readOnly = !!vistaOpts.readOnly;
    if (!calc) {
      return '<p class="crozzo-costos-placeholder" style="margin:14px">Motor de costos no cargado.</p>';
    }
    var precioVenta = row ? Number(row.precioVenta) || 0 : 0;
    var res = e ? e.calcularResumen(calc.costoReferencia, precioVenta) : null;
    var evalMp = e ? e.evaluarMargen(res, calc.porcentajeMpObjetivo) : null;
    var pesoAuto = !!opts.pesoAuto;
    var pesoSum = sumPesoGrLineas(calc.lineas, e);
    var pesoVal = calc.pesoOUnidades;
    var pesoDisabled = pesoAuto || readOnly ? ' disabled' : '';
    var inpDis = readOnly ? ' disabled readonly' : '';

    var showTech = !!global.__crozzoCostosRecetaExperto;
    var hint = function (code) {
      return showTech ? ' <span class="crozzo-receta-block__hint">' + code + '</span>' : '';
    };

    return (
      '<table class="crozzo-receta-block"' +
      (readOnly ? '' : ' id="crozzoRecetaResumen"') +
      '>' +
      '<tbody>' +
      '<tr><th>Costo ingredientes' + hint('K3') + '</th><td data-receta-kpi="k3">' +
      engFmt(calc.totalMp) +
      '</td></tr>' +
      '<tr><th>Colchón merma' + hint('J4') + '<br><input type="number" class="crozzo-costos-editable crozzo-receta-block__inp" data-receta-opt="margenErrorPct" min="0" max="100" step="0.1" value="' +
      esc(String(pctFracToInput(calc.margenErrorPct))) +
      '"' +
      inpDis +
      '><span class="crozzo-receta-block__pct-suffix">%</span></th><td><span data-receta-kpi="k4">' +
      engFmt(calc.margenErrorMonto) +
      '</span><span class="crozzo-receta-block__sub">pequeño extra por sazón o variación</span></td></tr>' +
      '<tr><th>Costo total del plato' + hint('K5') + '</th><td data-receta-kpi="k5">' +
      engFmt(calc.totalAlCosto) +
      '</td></tr>' +
      '<tr class="crozzo-receta-block__row--warn"><th>Porciones o peso' + hint('K6') +
      (readOnly
        ? ''
        : '<label class="crozzo-receta-peso-auto"><input type="checkbox" data-receta-peso-auto' +
          (pesoAuto ? ' checked' : '') +
          '> Auto Σ GR/ML</label>') +
      '</th><td><input type="number" class="crozzo-costos-editable crozzo-receta-block__inp" data-receta-opt="porciones" min="0.01" step="0.01" value="' +
      esc(String(Math.round(pesoVal * 100) / 100)) +
      '"' +
      pesoDisabled +
      inpDis +
      '><span class="crozzo-receta-block__sub" data-receta-peso-hint>' +
      (pesoAuto && pesoSum > 0 ? recetaPesoAutoHint(pesoSum) : 'Cuántas porciones rinde esta receta') +
      '</span></td></tr>' +
      '<tr class="crozzo-receta-block__row--accent"><th>Costo por gramo / unidad' + hint('K7') + '</th><td data-receta-kpi="k7">' +
      engFmt(calc.costoReferencia) +
      '</td></tr>' +
      '<tr class="crozzo-receta-block__row--primary"><th>Meta food cost (% MP)' + hint('K9') + '<br><input type="number" class="crozzo-costos-editable crozzo-receta-block__inp" data-receta-opt="porcentajeMpObjetivo" min="1" max="99" step="0.1" value="' +
      esc(String(pctFracToInput(calc.porcentajeMpObjetivo))) +
      '"' +
      inpDis +
      '><span class="crozzo-receta-block__pct-suffix">%</span></th><td><span class="crozzo-receta-block__sub">Cuánto del precio puede ser ingrediente</span></td></tr>' +
      '<tr><th>Precio sugerido' + hint('K10') + '</th><td data-receta-kpi="k10">' +
      engFmt(calc.precioSugerido) +
      '</td></tr>' +
      '<tr class="crozzo-receta-block__row--accent"><th>Precio con impuesto' + hint('K11') + '<br><input type="number" class="crozzo-costos-editable crozzo-receta-block__inp" data-receta-opt="impuestoPct" min="0" max="100" step="0.1" value="' +
      esc(String(pctFracToInput(calc.impuestoPct))) +
      '"' +
      inpDis +
      '><span class="crozzo-receta-block__pct-suffix">%</span></th><td data-receta-kpi="k11">' +
      engFmt(calc.precioConImpuesto) +
      '</td></tr>' +
      '<tr' +
      (evalMp && !evalMp.dentroObjetivo && res && res.precioVenta > 0 ? ' class="crozzo-receta-block__row--warn"' : '') +
      '><th>% ingrediente real' + hint('E') + '</th><td data-receta-kpi="pct-mp">' +
      (res && res.precioVenta > 0 ? engPct(res.pctCostoMp) : '—') +
      (evalMp ? '<span class="crozzo-receta-block__sub">' + (evalMp.dentroObjetivo ? 'Dentro de la meta' : 'Por encima de la meta') + '</span>' : '') +
      '</td></tr>' +
      '<tr class="crozzo-receta-block__row--accent"><th>Ganancia por plato' + hint('D') + '</th><td data-receta-kpi="util"><span data-receta-kpi-val="util">' +
      (res && res.precioVenta > 0 ? engFmt(res.utilidadBruta) : '—') +
      '</span><span class="crozzo-receta-block__sub">lo que queda después del costo</span></td></tr>' +
      '<tr><th>% ganancia' + hint('F') + '</th><td data-receta-kpi="pct-util"><span data-receta-kpi-val="pct-util">' +
      (res && res.precioVenta > 0 ? engPct(res.pctUtilidad) : '—') +
      '</span><span class="crozzo-receta-block__sub">margen sobre el precio de venta</span></td></tr>' +
      '<tr class="crozzo-receta-block__row--decision"><th>Precio en carta' + hint('G') + '</th><td><input type="number" class="crozzo-costos-editable crozzo-receta-block__inp crozzo-matriz-precio-inp" data-receta-opt="precioVenta" min="0" step="100" value="' +
      esc(String(Math.round(precioVenta))) +
      '"' +
      inpDis +
      '></td></tr>' +
      '</tbody></table>' +
      (readOnly
        ? '<p class="crozzo-costos-note" style="margin:12px 14px;font-size:.78rem">Versión guardada · solo lectura.</p>'
        : '<div class="crozzo-receta-resumen-actions">' +
          '<button type="button" class="btn btn-outline btn-sm" data-receta-action="usar-sugerido">Usar precio sugerido</button>' +
          '<button type="button" class="btn btn-outline btn-sm" data-receta-action="usar-con-imp">Con impuesto</button>' +
          '<button type="button" class="btn btn-outline btn-sm" data-receta-action="redondear-100">Redondear a $100</button>' +
          '<button type="button" class="btn btn-outline btn-sm" id="crozzoRecetaToggleExperto" title="Mostrar códigos K3, J4…">' +
          (showTech ? 'Modo simple' : 'Modo experto') +
          '</button></div>')
    );
  }

  function renderRecetaDockHtml(pack) {
    var n = pack && pack.lineas ? pack.lineas.length : 0;
    return (
      '<div class="crozzo-receta-dock" data-receta-dock role="toolbar" aria-label="Acciones rápidas de receta">' +
      '<button type="button" class="btn btn-primary btn-sm crozzo-receta-dock__add" data-receta-action="add-line">+ Agregar insumo</button>' +
      '<span class="crozzo-receta-dock__meta" data-receta-dock-meta>' +
      esc(String(n)) +
      ' insumo' +
      (n === 1 ? '' : 's') +
      '</span>' +
      '<span class="crozzo-receta-dock__spacer" aria-hidden="true"></span>' +
      '<button type="button" class="btn btn-outline btn-sm" data-receta-action="probar">Ver costo</button>' +
      '<button type="button" class="btn btn-primary btn-sm" data-receta-action="save">Guardar</button></div>'
    );
  }

  function renderRecetaIngEmptyHtml(colCount) {
    return (
      '<tr class="crozzo-receta-table__empty"><td colspan="' +
      colCount +
      '"><p style="margin:0 0 12px;opacity:.75">Aún no hay ingredientes en esta receta.</p>' +
      '<button type="button" class="btn btn-primary btn-sm" data-receta-action="add-line">+ Agregar primer insumo</button></td></tr>'
    );
  }

  function buildRecetaCalcPack(seed, slug, packOpts) {
    packOpts = packOpts || {};
    var e = engine();
    var C = global.CrozzoCatalogoMp;
    var resumenList = mergeResumenList(seed);
    var row =
      resumenList.find(function (r) {
        return r.slug === slug;
      }) || resumenList[0];
    var rec = C && C.getRecetaPlato && slug ? C.getRecetaPlato(slug) : null;
    if (!rec && row && C && C.ensureRecetaForMenu) {
      rec = C.ensureRecetaForMenu(slug, row.producto);
    }
    var nombre = (rec && rec.producto) || (row && row.producto) || 'Plato';
    var lineas = packOpts.useSaved
      ? loadRecetaLineas(slug, seed, { readOnly: true })
      : loadRecetaLineas(slug, seed);
    var store = buildPreciosStore();
    var recOpts = packOpts.useSaved
      ? Object.assign({}, { margenErrorPct: 0.03, porcentajeMpObjetivo: 0.3, impuestoPct: 0.08, porciones: 1, porcionesManual: 1, pesoAuto: false }, (rec && rec.opts) || {})
      : getRecetaOptsMerged(rec, seed, slug);
    var lineasCalc = lineas.map(function (ln) {
      return {
        ingrediente: ln.ingrediente,
        unidad: ln.unidad || ln.und || 'GR',
        cantidad: ln.cantidad,
        costoXUnidad: resolveCostoUnitarioLineaReceta(ln, e, C, store),
      };
    });
    var calcOpts = resolveRecetaCalcOpts(lineasCalc, recOpts, e);
    var calc = e ? e.calcularReceta(lineasCalc, calcOpts) : null;
    var displayRow = row;
    if (packOpts.useSaved && row) {
      displayRow = Object.assign({}, row, {
        precioVenta: Number(row.precioVenta) || 0,
        costoMp: calc && calc.costoReferencia > 0 ? Math.round(calc.costoReferencia) : Number(row.costoMp) || 0,
      });
    }
    return {
      e: e,
      C: C,
      row: displayRow,
      rec: rec,
      nombre: nombre,
      lineas: lineas,
      lineasCalc: lineasCalc,
      calcOpts: calcOpts,
      calc: calc,
      slug: slug,
    };
  }

  function renderRecetaIngRowsHtml(pack, readOnly) {
    if (!pack || !pack.calc) return '';
    var C = pack.C;
    return pack.calc.lineas
      .map(function (ln, i) {
        var src = pack.lineas[i] || {};
        var mpId = src.mpId || '';
        var mpName = ln.ingrediente || src.ingrediente || '—';
        if (mpId && C && C.get) {
          var mpItem = C.get(mpId);
          if (mpItem && mpItem.nombre) mpName = mpItem.nombre;
        }
        if (readOnly) {
          return (
            '<tr><td>' +
            esc(mpName) +
            '</td><td class="crozzo-receta-table__num">' +
            esc(String(ln.cantidad)) +
            '</td><td class="crozzo-receta-table__mid">' +
            esc(ln.unidad) +
            '</td><td class="crozzo-receta-table__num">' +
            engFmt(ln.costoXUnidad) +
            '</td><td class="crozzo-receta-table__num">' +
            engPct(ln.pctDelTotal) +
            '</td><td class="crozzo-receta-table__num">' +
            engFmt(ln.total) +
            '</td></tr>'
          );
        }
        return (
          '<tr data-demo-line="' +
          i +
          '" data-mp-id="' +
          esc(mpId) +
          '"><td>' +
          renderRecetaMpComboCell(i, mpId, mpName) +
          '</td><td class="crozzo-receta-table__num"><input type="text" class="crozzo-costos-editable crozzo-costos-editable--cant" data-demo-cant value="' +
          esc(String(ln.cantidad)) +
          '" title="Cantidad (ej. 340, 4.5*3)"></td><td class="crozzo-receta-table__mid" data-receta-und>' +
          esc(ln.unidad) +
          '</td><td class="crozzo-receta-table__num" data-receta-unit title="Costo por unidad de medida">' +
          engFmt(ln.costoXUnidad) +
          '</td><td class="crozzo-receta-table__num" data-demo-pct title="% del total MP">' +
          engPct(ln.pctDelTotal) +
          '</td><td class="crozzo-receta-table__num" data-demo-total>' +
          engFmt(ln.total) +
          '</td><td class="crozzo-receta-table__del"><button type="button" class="btn btn-outline btn-sm" data-receta-del title="Quitar">×</button></td></tr>'
        );
      })
      .join('');
  }

  function renderRecetaGridHtml(pack, vistaMode) {
    vistaMode = vistaMode || 'edicion';
    var readOnly = vistaMode === 'guardado';
    var demoRows = renderRecetaIngRowsHtml(pack, readOnly);
    var colCount = readOnly ? 6 : 7;
    var footHtml = readOnly
      ? '<div class="crozzo-receta-plato__foot"><button type="button" class="btn btn-outline btn-sm" data-receta-vista="edicion">Editar en borrador</button>' +
        (pack.rec && pack.rec.updatedAt
          ? '<span class="crozzo-receta-plato__meta" style="margin:0;align-self:center">Guardada: ' +
            esc(String(pack.rec.updatedAt).slice(0, 16).replace('T', ' ')) +
            '</span>'
          : '') +
        '</div>'
      : '';
    return (
      '<div class="crozzo-receta-plato__grid">' +
      '<section class="crozzo-receta-plato__ing">' +
      '<div class="crozzo-receta-plato__ing-head crozzo-receta-plato__ing-bar">' +
      '<span class="crozzo-receta-plato__ing-title">Ingredientes</span>' +
      (readOnly
        ? ''
        : '<button type="button" class="btn btn-primary btn-sm crozzo-receta-ing-add" data-receta-action="add-line">+ Insumo</button>') +
      '</div>' +
      '<div class="crozzo-costos-scroll crozzo-receta-ing-scroll"><table class="crozzo-receta-table"><thead><tr>' +
      '<th>Producto</th><th class="crozzo-receta-table__th--num">Cantidad</th><th class="crozzo-receta-table__th--mid">U. medida</th><th class="crozzo-receta-table__th--num">Costo × u.</th><th class="crozzo-receta-table__th--num">%</th><th class="crozzo-receta-table__th--num">Total</th>' +
      (readOnly ? '' : '<th></th>') +
      '</tr></thead><tbody id="' +
      (readOnly ? 'crozzoRecetaGuardadaTbody' : 'crozzoDemoTbody') +
      '">' +
      (demoRows || renderRecetaIngEmptyHtml(colCount)) +
      '</tbody></table></div>' +
      footHtml +
      '</section>' +
      '<aside class="crozzo-receta-plato__resumen">' +
      '<div class="crozzo-receta-plato__resumen-head">Costos, márgenes y precio</div>' +
      renderRecetaResumenHtml(pack.calc, pack.calcOpts, pack.row, pack.e, { readOnly: readOnly }) +
      '</aside></div>'
    );
  }

  function renderRecetaProgramacionesPanel(seed) {
    var C = global.CrozzoCatalogoMp;
    var slug = getActiveRecetaSlug(seed);
    var rows = C && C.listProgramacionesRecetasAll ? C.listProgramacionesRecetasAll() : [];
    var filtered = slug ? rows.filter(function (x) { return x.slug === slug; }) : rows;
    var today = new Date().toISOString().slice(0, 10);
    var form =
      '<div class="crozzo-receta-prog-bar">' +
      '<p class="crozzo-costos-note" style="margin:0 0 12px"><strong>Programar receta</strong> — Aplique en una fecha la versión del borrador o la guardada (insumos, parámetros y precio).</p>' +
      '<div class="crozzo-receta-prog-bar__row">' +
      '<label class="crozzo-receta-prog-opt"><input type="radio" name="crozzoRecetaProgSource" value="draft" checked> Borrador en edición</label>' +
      '<label class="crozzo-receta-prog-opt"><input type="radio" name="crozzoRecetaProgSource" value="saved"> Receta guardada</label>' +
      '<input type="date" class="form-input crozzo-matriz-prog-date" id="crozzoRecetaProgFecha" value="' +
      esc(today) +
      '" min="' +
      esc(today) +
      '">' +
      '<button type="button" class="btn btn-primary btn-sm" id="crozzoRecetaProgAdd">Programar</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoRecetaProgRun">Ejecutar pendientes hoy</button></div></div>';
    if (!filtered.length) {
      return form + '<p class="crozzo-costos-note">Sin programaciones para este plato. Use el formulario superior.</p>';
    }
    return (
      form +
      '<div class="crozzo-costos-scroll crozzo-costos-scroll--tall"><table class="crozzo-costos-feed-table"><thead><tr>' +
      '<th>Vigencia</th><th>Plato</th><th style="text-align:right">Costo ref.</th><th style="text-align:right">Precio prog.</th><th>Insumos</th><th>Estado</th><th>Notas</th>' +
      '</tr></thead><tbody>' +
      filtered
        .map(function (x) {
          var p = x.programacion;
          var snap = p.snapshot || {};
          var stCls = p.estado === 'aplicada' ? 'ok' : p.estado === 'cancelada' ? 'muted' : 'warn';
          return (
            '<tr><td>' +
            esc(p.vigenciaDesde) +
            '</td><td>' +
            esc(x.producto) +
            '</td><td style="text-align:right">' +
            (snap.costoReferencia > 0 ? engFmt(snap.costoReferencia) : '—') +
            '</td><td style="text-align:right"><strong>' +
            (snap.precioVenta > 0 ? engFmt(snap.precioVenta) : '—') +
            '</strong></td><td style="font-size:.78rem">' +
            esc(String((snap.lineas || []).length)) +
            ' líneas</td><td><span class="crozzo-matriz-status crozzo-matriz-status--' +
            stCls +
            '">' +
            esc(p.estado) +
            '</span></td><td style="font-size:.78rem">' +
            esc(p.notas || '') +
            '</td></tr>'
          );
        })
        .join('') +
      '</tbody></table></div>'
    );
  }

  function prepCocinaTipoHintText(tipo) {
    if (tipo === 'prep_cocinar') {
      return 'Sub-receta de bodega: el cocinero la anota en Centro de producción → Cocinar y porcionar. Lleva ingredientes (MP y otras sub-recetas).';
    }
    if (tipo === 'prep_salsas') {
      return 'Sub-receta de bodega: salsas, adobos, bases y caldos. Se anota en Salsas y bases. Ej.: adobo de carne = sub-receta usada al partir/cocinar.';
    }
    return 'Plato de carta al momento: no va a preparaciones de bodega; al cobrar se descuentan los ingredientes.';
  }

  function prepCocinaTipoLabel(tipo) {
    if (tipo === 'prep_cocinar') return 'Sub-receta · Cocinar y porcionar';
    if (tipo === 'prep_salsas') return 'Sub-receta · Salsas y bases';
    return 'Plato de carta · al vender';
  }

  function renderRecetaProcesoVentaHtml(row) {
    if (!row || row.tipoCosteo === 'directo') {
      return (
        '<div class="crozzo-receta-proceso crozzo-receta-proceso--muted">' +
        '<strong>Venta directa</strong> — sin transformación (bebidas, reventa). No aplica preparaciones de cocina.</div>'
      );
    }
    var C = global.CrozzoCatalogoMp;
    var inferred = C && C.inferPrepCocinaTipo ? C.inferPrepCocinaTipo(row) : 'prep_salsas';
    var tipo = C && C.prepCocinaTipoFromRow ? C.prepCocinaTipoFromRow(row, true) : inferred;
    var isAuto = !row.prepConfigManual;
    var showVende = tipo === 'prep_salsas' || tipo === 'prep_cocinar';
    return (
      '<div class="crozzo-receta-proceso" data-receta-proceso-wrap id="crozzoRecetasEstandarPrep">' +
      '<p class="crozzo-receta-proceso__model"><strong>Sub-receta</strong> = preparación en bodega (con ingredientes). <strong>Plato de carta</strong> = sale a mesas / POS.</p>' +
      (isAuto
        ? '<p class="crozzo-receta-proceso__auto"><span class="crozzo-receta-proceso__auto-pill">✦ Automático</span> ' +
          'Por nombre, categoría e ingredientes. Cambie solo si no cuadra.</p>'
        : '<p class="crozzo-receta-proceso__auto"><span class="crozzo-receta-proceso__auto-pill">Manual</span> ' +
          '<button type="button" class="crozzo-receta-proceso__auto-link" data-receta-field="prepAutoReset">Volver a automático</button></p>') +
      '<div class="crozzo-receta-proceso__row">' +
      '<label class="crozzo-receta-proceso__lbl" for="crozzoRecetaPrepCocina">Tipo en cocina</label>' +
      '<select id="crozzoRecetaPrepCocina" class="form-input form-select crozzo-receta-proceso__sel" data-receta-field="prepCocinaTipo">' +
      '<option value="al_vender"' +
      (tipo === 'al_vender' ? ' selected' : '') +
      '>Plato de carta · al vender (caja)</option>' +
      '<option value="prep_salsas"' +
      (tipo === 'prep_salsas' ? ' selected' : '') +
      '>Sub-receta · Salsas y bases</option>' +
      '<option value="prep_cocinar"' +
      (tipo === 'prep_cocinar' ? ' selected' : '') +
      '>Sub-receta · Cocinar y porcionar</option>' +
      '</select></div>' +
      '<p class="crozzo-receta-proceso__hint" data-receta-proceso-hint>' +
      esc(prepCocinaTipoHintText(tipo)) +
      '</p>' +
      '<label class="crozzo-receta-proceso__check' +
      (showVende ? '' : ' is-hidden') +
      '" data-receta-vende-wrap>' +
      '<input type="checkbox" data-receta-field="vendeAlCliente"' +
      (row.vendeAlCliente ? ' checked' : '') +
      '> También se vende por porción en carta</label></div>'
    );
  }

  function syncRecetaProcesoUi(root, tipo) {
    if (!root) return;
    var hint = root.querySelector('[data-receta-proceso-hint]');
    if (hint) hint.textContent = prepCocinaTipoHintText(tipo);
    var vendeWrap = root.querySelector('[data-receta-vende-wrap]');
    if (vendeWrap) vendeWrap.classList.toggle('is-hidden', tipo === 'al_vender');
  }

  function applyPrepCocinaTipoFromUi(root, slug, tipo, opts) {
    opts = opts || {};
    var C = global.CrozzoCatalogoMp;
    if (C && C.applyPrepCocinaTipo) {
      C.applyPrepCocinaTipo(slug, tipo, {
        prepConfigManual: opts.prepConfigManual != null ? opts.prepConfigManual : true,
        vendeAlCliente: opts.vendeAlCliente,
      });
    } else {
      saveResumenEdit(slug, {
        modoProceso: tipo === 'al_vender' ? 'bajo_demanda' : 'prep_anticipado',
        tipoReceta: tipo === 'al_vender' ? 'full' : 'base',
        workflowPrep:
          tipo === 'al_vender' ? 'ninguno' : tipo === 'prep_cocinar' ? 'coccion' : 'elaboracion',
        prepConfigManual: opts.prepConfigManual != null ? opts.prepConfigManual : true,
        vendeAlCliente: opts.vendeAlCliente,
      });
    }
    invalidateSeed();
    syncRecetaProcesoUi(root, tipo);
  }

  function applyRecetaProcesoVentaFromUi(root, slug, val, opts) {
    var tipo =
      val === 'bajo_demanda' || val === 'al_vender'
        ? 'al_vender'
        : opts.workflowPrep === 'coccion' || val === 'prep_cocinar'
          ? 'prep_cocinar'
          : 'prep_salsas';
    applyPrepCocinaTipoFromUi(root, slug, tipo, opts);
  }

  function applyRecetaWorkflowPrepFromUi(root, slug, wf) {
    var tipo = wf === 'coccion' ? 'prep_cocinar' : 'prep_salsas';
    applyPrepCocinaTipoFromUi(root, slug, tipo, { prepConfigManual: true });
    toast(prepCocinaTipoLabel(tipo), 'success');
  }

  function renderDemoRecetaHtml(seed) {
    var activeSlug = getActiveRecetaSlug(seed);
    var packEdicion = buildRecetaCalcPack(seed, activeSlug, { useSaved: false });
    var packGuardado = buildRecetaCalcPack(seed, activeSlug, { useSaved: true });
    var posProd = findPosProductForReceta(packEdicion.rec || { slug: activeSlug, producto: packEdicion.nombre });
    var areaLbl = posAreaLabelForProduct(posProd);
    var areaNote = areaLbl
      ? '<strong>Área comanda:</strong> ' + esc(areaLbl) + ' · insumos → pedidos internos.'
      : 'Vincule el plato al producto POS (nombre o SKU = slug) para inferir área en pedidos.';

    return (
      '<div class="crozzo-receta-plato">' +
      '<div class="crozzo-receta-plato__toolbar crozzo-costos-search-row">' +
      '<label for="crozzoDemoPlatoCombo">Plato</label>' +
      '<div class="crozzo-receta-plato__pick">' +
      renderPlatoComboHtml(seed) +
      '</div>' +
      '<button type="button" class="btn btn-primary btn-sm crozzo-costos-create-btn" id="crozzoRecetaToggleNewPlato" title="Nuevo plato con receta" aria-label="Nuevo plato con receta">+</button>' +
      '<div class="crozzo-receta-plato__actions">' +
      '<button type="button" class="btn btn-outline btn-sm crozzo-receta-btn--probar" id="crozzoRecetaProbar" title="Recalcular sin guardar">Ver costo</button>' +
      '<button type="button" class="btn btn-primary btn-sm" id="crozzoRecetaSave" title="Guardar receta">Guardar</button></div></div>' +
      (typeof global.renderCostosNewPlatoFormHtml === 'function'
        ? global.renderCostosNewPlatoFormHtml({
            prefix: 'crozzoRecetaNewProd',
            title: 'Nuevo plato con receta',
            hint: 'Borrador en costeos — precio de venta en la matriz; luego lance o programe.',
            tieneReceta: true,
            hidePrecioCaja: true,
          })
        : '') +
      renderRecetaWizardHtml(packEdicion) +
      '<details class="crozzo-receta-plato__config">' +
      '<summary>Preparación en cocina (opcional)</summary>' +
      '<div class="crozzo-receta-plato__config-body">' +
      renderRecetaProcesoVentaHtml(packEdicion.row) +
      renderPerdidasProcesoAdminPanel() +
      '</div></details>' +
      '<header class="crozzo-receta-plato__head crozzo-receta-plato__head--compact">' +
      '<div class="crozzo-receta-plato__head-top">' +
      '<span class="crozzo-receta-plato__badge crozzo-receta-plato__badge--gold">Costeo activo</span>' +
      '<span class="crozzo-receta-plato__badge crozzo-receta-plato__badge--draft" data-receta-draft-badge hidden>Borrador sin guardar</span>' +
      '<span class="crozzo-receta-plato__badge">' +
      esc(String(packEdicion.lineas.length)) +
      ' insumos</span></div>' +
      '<p class="crozzo-receta-plato__eyebrow">Receta</p>' +
      '<h2 class="crozzo-receta-plato__nombre" id="crozzoDemoTitulo">' +
      esc(packEdicion.nombre) +
      '</h2>' +
      '<p class="crozzo-receta-plato__meta">' +
      areaNote +
      '</p></header>' +
      '<div class="crozzo-matriz-vista-tabs crozzo-receta-vista-tabs" role="tablist">' +
      '<button type="button" class="crozzo-matriz-vista-tab is-active" data-receta-vista="edicion">En edición <small>(borrador)</small></button>' +
      '<button type="button" class="crozzo-matriz-vista-tab" data-receta-vista="guardado">Receta guardada <small>(oficial)</small></button>' +
      '<button type="button" class="crozzo-matriz-vista-tab" data-receta-vista="programaciones">Programaciones</button></div>' +
      '<div class="crozzo-matriz-vista-panel is-active" data-receta-vista-panel="edicion">' +
      renderRecetaDockHtml(packEdicion) +
      renderRecetaGridHtml(packEdicion, 'edicion') +
      '<p class="crozzo-receta-sync-hint">' +
      '<button type="button" class="crozzo-receta-sync-link" id="crozzoRecetaSyncPedidos">↻ Actualizar pedidos internos de cocina</button></p></div>' +
      '<div class="crozzo-matriz-vista-panel crozzo-matriz-vista-panel--readonly" data-receta-vista-panel="guardado">' +
      renderRecetaGridHtml(packGuardado, 'guardado') +
      '</div>' +
      '<div class="crozzo-matriz-vista-panel" data-receta-vista-panel="programaciones">' +
      renderRecetaProgramacionesPanel(seed) +
      '</div></div>'
    );
  }

  function renderMatrizPanel(seed) {
    seed = seed || hub.seed || { resumen: [], demoRecipe: { lineas: [], nombre: 'Demo' }, stats: {} };

    var resumenList = mergeResumenList(seed);
    var resumenCount = resumenList.length;
    var conReceta = resumenList.filter(function (r) {
      return r.tieneReceta;
    }).length;
    var ventaDirecta = resumenCount - conReceta;
    var portfolio = computeMatrizPortfolio(seed);
    var activeTab = global.__crozzoCostosMatrizTab || 'resumen';

    return (
      '<div class="crozzo-costos-hub crozzo-mod-page crozzo-matriz-premium">' +
      renderMatrizHero(seed, portfolio) +
      renderRevisionAdminPanel(seed) +
      renderMatrizTabsNav(activeTab) +
      '<div class="crozzo-costos-panel' +
      (activeTab === 'resumen' ? ' active' : '') +
      '" data-matriz-panel="resumen">' +
      renderMatrizPanelIntro('resumen', seed) +
      renderMatrizResumenAcciones(seed) +
      (global.CrozzoCostosBulkImport && global.CrozzoCostosBulkImport.renderBulkBarHtml
        ? global.CrozzoCostosBulkImport.renderBulkBarHtml()
        : '') +
      '<div class="crozzo-matriz-vista-tabs" role="tablist">' +
      '<button type="button" class="crozzo-matriz-vista-tab is-active" data-matriz-vista="vigente">Resumen del menú <small>(editable)</small></button>' +
      '<button type="button" class="crozzo-matriz-vista-tab" data-matriz-vista="historial">Historial de costeos <small>(archivo mensual)</small></button>' +
      '<button type="button" class="crozzo-matriz-vista-tab" data-matriz-vista="programaciones">Programaciones en caja</button></div>' +
      '<div class="crozzo-matriz-vista-panel is-active" data-matriz-vista-panel="vigente">' +
      renderMargenGlobalBar() +
      renderMatrizAlertsBanner(seed) +
      renderComparativaResumenBar(seed) +
      renderMatrizLeyenda() +
      '<div class="crozzo-costos-search-row">' +
      '<input type="search" class="crozzo-matriz-search" id="crozzoResumenSearch" placeholder="Buscar plato, categoría o código… (ej. queso cocina)" autocomplete="off">' +
      '<button type="button" class="btn btn-primary btn-sm crozzo-costos-create-btn" id="crozzoCostosToggleNewPlato" title="Nuevo plato" aria-label="Nuevo plato">+</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoMatrizSyncPos" title="Traer platos desde el punto de venta">↻ Traer platos del POS</button>' +
      '</div>' +
      (typeof global.renderCostosNewPlatoFormHtml === 'function'
        ? global.renderCostosNewPlatoFormHtml({
            prefix: 'crozzoCostosNewProd',
            title: 'Nuevo plato de venta',
            hint: 'Borrador en costeos — defina precio en la matriz y lance o programe para caja.',
            hidePrecioCaja: true,
          })
        : '') +
      '<div class="crozzo-matriz-toolbar">' +
      '<div class="crozzo-matriz-filters" role="group" aria-label="Tipo de producto">' +
      '<button type="button" class="crozzo-matriz-filter is-active" data-matriz-filter-tipo="all">Todos</button>' +
      '<button type="button" class="crozzo-matriz-filter" data-matriz-filter-tipo="receta">Con receta</button>' +
      '<button type="button" class="crozzo-matriz-filter" data-matriz-filter-tipo="directo">Venta directa</button></div>' +
      '<div class="crozzo-matriz-filters crozzo-matriz-filters--meta" role="group" aria-label="Estado vs meta de costo">' +
      '<button type="button" class="crozzo-matriz-filter is-active" data-matriz-filter-meta="all">Estado: todos</button>' +
      '<button type="button" class="crozzo-matriz-filter" data-matriz-filter-meta="ok">Dentro de meta</button>' +
      '<button type="button" class="crozzo-matriz-filter" data-matriz-filter-meta="warn">Sobre meta</button>' +
      '<button type="button" class="crozzo-matriz-filter" data-matriz-filter-meta="crit">MP subió mucho</button></div>' +
      '<div class="crozzo-matriz-filters crozzo-matriz-filters--cmp" role="group" aria-label="Comparativa caja vs costeo">' +
      '<button type="button" class="crozzo-matriz-filter is-active" data-matriz-filter-cmp="all">Δ precio: todos</button>' +
      '<button type="button" class="crozzo-matriz-filter" data-matriz-filter-cmp="up">Suben</button>' +
      '<button type="button" class="crozzo-matriz-filter" data-matriz-filter-cmp="down">Bajan</button>' +
      '<button type="button" class="crozzo-matriz-filter" data-matriz-filter-cmp="eq">Sin cambio</button>' +
      '<button type="button" class="crozzo-matriz-filter" data-matriz-filter-cmp="diff">Con diferencia</button></div></div>' +
      '<div class="crozzo-matriz-table-shell">' +
      '<div class="crozzo-costos-scroll crozzo-costos-scroll--tall"><table class="crozzo-costos-feed-table crozzo-matriz-table"><thead><tr>' +
      '<th>Producto</th><th style="text-align:right">Costo de MP</th><th style="text-align:right">Utilidad bruta</th><th style="text-align:right" title="% costo MP sobre precio (editable)">% costo de MP</th><th style="text-align:right" title="Utilidad ÷ precio (100% − costo)">% utilidad</th><th style="text-align:right" title="Precio de venta al cliente (editable)">Precio de venta</th><th style="text-align:right" title="Precio vigente en caja POS">Caja (ant.)</th><th title="Diferencia $ y % caja → costeo">Comparativa</th><th>vs Meta</th><th>Estado</th>' +
      '</tr></thead><tbody id="crozzoResumenTbody">' +
      renderResumenRowsHtml(seed) +
      '</tbody>' +
      renderResumenTotalesFooterHtml(calcularTotalesResumen(seed)) +
      '</table></div></div></div>' +
      '<div class="crozzo-matriz-vista-panel crozzo-matriz-vista-panel--readonly" data-matriz-vista-panel="historial" data-matriz-lazy="historial">' +
      '<p class="crozzo-costos-note" style="margin:12px 0">Haga clic aquí para ver el <strong>historial mensual</strong> de costeos guardados (solo lectura).</p></div>' +
      '<div class="crozzo-matriz-vista-panel" data-matriz-vista-panel="programaciones" data-matriz-lazy="programaciones">' +
      '<p class="crozzo-costos-note" style="margin:12px 0">Haga clic aquí para ver precios <strong>programados</strong> en caja (fecha/hora futura).</p></div></div>' +
      '<div class="crozzo-costos-panel' +
      (activeTab === 'costeo-mp' ? ' active' : '') +
      '" data-matriz-panel="costeo-mp">' +
      renderMatrizPanelIntro('costeo-mp', seed) +
      (global.CrozzoCosteoMp && global.CrozzoCosteoMp.renderPanel
        ? global.CrozzoCosteoMp.renderPanel({ embedded: true })
        : '<p class="crozzo-costos-note">Módulo de costeo no cargado.</p>') +
      '</div>' +
      '<div class="crozzo-costos-panel' +
      (activeTab === 'demo' ? ' active' : '') +
      '" data-matriz-panel="demo">' +
      renderMatrizPanelIntro('demo', seed) +
      renderDemoRecetaHtml(seed) +
      '</div></div>'
    );
  }

  function refreshPrecioPosCell(tr, seed) {
    if (!tr) return;
    var slug = tr.getAttribute('data-resumen-slug');
    var row = mergeResumenList(seed || hub.seed || { resumen: [] }).find(function (x) {
      return x.slug === slug;
    });
    if (!row) return;
    var precioInp = tr.querySelector('[data-resumen-field="precioVenta"]');
    if (precioInp && isFinite(Number(precioInp.value))) row.precioVenta = Number(precioInp.value);
    var old = tr.querySelector('[data-resumen-pos]');
    if (!old) return;
    var wrap = document.createElement('tbody');
    wrap.innerHTML = '<tr>' + renderPrecioPosCell(row) + '</tr>';
    var neu = wrap.querySelector('[data-resumen-pos]');
    if (neu) old.replaceWith(neu);
    refreshComparativaPrecioCell(tr, seed);
  }

  function refreshComparativaPrecioCell(tr, seed) {
    if (!tr) return;
    var slug = tr.getAttribute('data-resumen-slug');
    var row = mergeResumenList(seed || hub.seed || { resumen: [] }).find(function (x) {
      return x.slug === slug;
    });
    if (!row) return;
    var precioInp = tr.querySelector('[data-resumen-field="precioVenta"]');
    if (precioInp && isFinite(Number(precioInp.value))) row.precioVenta = Number(precioInp.value);
    var d = getRowComparativaCaja(row);
    tr.setAttribute('data-matriz-cmp', d ? cmpStateFromDelta(d) : 'none');
    var old = tr.querySelector('[data-resumen-cmp]');
    if (!old) return;
    var wrap = document.createElement('tbody');
    wrap.innerHTML = '<tr>' + renderComparativaPrecioCell(row) + '</tr>';
    var neu = wrap.querySelector('[data-resumen-cmp]');
    if (neu) old.replaceWith(neu);
    var bar = tr.closest('.crozzo-matriz-premium');
    if (bar) {
      var barEl = bar.querySelector('#crozzoMatrizCmpBar');
      if (barEl) barEl.outerHTML = renderComparativaResumenBar(seed || hub.seed);
      var tfootCmp = bar.querySelector('[data-total-cmp]');
      if (tfootCmp && hub.seed) {
        var tot = collectTotalesResumenFromDom(bar);
        var posTot = sumPreciosPosResumen(seed || hub.seed);
        tfootCmp.innerHTML =
          posTot.count && posTot.sum > 0
            ? renderComparativaPrecioInner(posTot.sum, tot.sumPrecio, {
                labelAnterior: 'caja',
                labelNuevo: 'costeo',
              })
            : '—';
      }
    }
  }

  function defaultMatrizProgDateTimeLocal() {
    var d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    var pad = function (n) {
      return String(n).padStart(2, '0');
    };
    return (
      d.getFullYear() +
      '-' +
      pad(d.getMonth() + 1) +
      '-' +
      pad(d.getDate()) +
      'T' +
      pad(d.getHours()) +
      ':' +
      pad(d.getMinutes())
    );
  }

  function readMatrizProgDateTime(root) {
    if (!root) return null;
    var dt = root.querySelector('#crozzoMatrizProgDateTime');
    if (!dt || !dt.value) return null;
    return dt.value;
  }

  function refreshMatrizProgramacionesPanel(root) {
    if (!root) return;
    var progPanel = root.querySelector('[data-matriz-vista-panel="programaciones"]');
    if (!progPanel) return;
    if (progPanel.getAttribute('data-matriz-lazy') === 'programaciones') {
      progPanel.removeAttribute('data-matriz-lazy');
    }
    progPanel.innerHTML = renderProgramacionesPanel();
  }

  function maybeProgramarPrecioEnCaja(slug, precioVenta, root) {
    if (!root) return;
    var chk = root.querySelector('#crozzoMatrizProgEnable');
    if (!chk || !chk.checked) return;
    var C = global.CrozzoCatalogoMp;
    if (!C || !C.addProgramacionPrecio) return;
    var vigRaw = readMatrizProgDateTime(root);
    if (!vigRaw) {
      toast('Indique fecha y hora para programar', 'warn');
      return;
    }
    var vigIso = C.normalizeVigenciaIso ? C.normalizeVigenciaIso(vigRaw) : vigRaw;
    var prog = C.addProgramacionPrecio(slug, precioVenta, vigIso, { aplicarPos: true, notas: 'Desde matriz precios' });
    if (!prog) return;
    var fmt = C.formatVigenciaDisplay ? C.formatVigenciaDisplay(vigIso) : vigRaw;
    if (C.vigenciaEsDue && C.vigenciaEsDue(vigIso)) {
      if (C.ejecutarProgramacionesPendientes) C.ejecutarProgramacionesPendientes({ silent: false });
      toast('Plato y precio publicados en caja POS', 'success');
    } else {
      if (C.updateMenuPlato) {
        C.updateMenuPlato(slug, { estadoFlujo: 'programado', programadoPara: vigIso });
      }
      toast('Plato programado para caja el ' + fmt, 'success');
    }
    refreshMatrizProgramacionesPanel(root);
  }

  function refreshResumenRow(tr, seed, opts) {
    opts = opts || {};
    var e = engine();
    if (!e || !tr) return;
    var slug = tr.getAttribute('data-resumen-slug');
    var source = opts.sourceField || '';

    if (opts.save && (source === 'tipoReceta' || source === 'vendeAlCliente')) {
      var patchMeta = {};
      if (source === 'tipoReceta') {
        var sel = tr.querySelector('[data-resumen-field="tipoReceta"]');
        if (sel) patchMeta.tipoReceta = sel.value === 'full' ? 'full' : 'base';
      }
      if (source === 'vendeAlCliente') {
        var chk = tr.querySelector('[data-resumen-field="vendeAlCliente"]');
        if (chk) patchMeta.vendeAlCliente = chk.checked;
      }
      saveResumenEdit(slug, patchMeta);
      invalidateSeed();
      var rootMeta = tr.closest('.crozzo-matriz-premium') || document.getElementById('mainContent');
      loadSeed(function (updated) {
        hub.seed = updated;
        refreshMatrizResumenTable(rootMeta, updated);
      });
      return;
    }

    var precioInp = tr.querySelector('[data-resumen-field="precioVenta"]');
    var costoPctInp = tr.querySelector('[data-resumen-field="costoPct"]');
    var margenInp = tr.querySelector('[data-resumen-field="margenPct"]');
    var costoMp = readResumenRowCostoMp(tr);
    var precioVenta = Number(precioInp && precioInp.value);
    if (!isFinite(costoMp) || costoMp < 0) return;

    if ((source === 'costoPct' || source === 'margenPct') && (costoPctInp || margenInp)) {
      var costoPct = Number((costoPctInp || margenInp).value);
      if (!isFinite(costoPct)) return;
      if (source === 'margenPct') costoPct = Math.round((100 - costoPct) * 10) / 10;
      if (costoPct >= 100) costoPct = 99;
      if (costoPct <= 0) costoPct = 1;
      if (costoMp > 0) {
        precioVenta = precioParaCostoObjetivo(costoMp, costoPct);
        setInputSilent(precioInp, Math.round(precioVenta));
      }
    } else {
      if (!isFinite(precioVenta) || precioVenta < 0) return;
      var rTmp = e.calcularResumen(costoMp, precioVenta);
      if (costoPctInp && source !== 'costoPct' && source !== 'margenPct') {
        setInputSilent(costoPctInp, pctCostoDisplayFromResumen(rTmp));
        refreshMargenUtilidadCell(tr, rTmp);
      }
    }

    precioVenta = Number(precioInp && precioInp.value);
    if (!isFinite(precioVenta)) return;

    if (opts.save) {
      saveResumenEdit(slug, { precioVenta: Math.round(precioVenta) });
      maybeProgramarPrecioEnCaja(slug, Math.round(precioVenta), root);
      invalidateSeed();
    }

    var listRow =
      mergeResumenList(seed).find(function (x) {
        return x.slug === slug;
      }) || { slug: slug };
    var r = e.calcularResumen(costoMp, precioVenta);
    var ev = evaluarPlatoObjetivo(r, listRow, seed);
    var u = tr.querySelector('[data-resumen-util]');
    var bar = tr.querySelector('[data-resumen-obj-bar]');
    var ob = tr.querySelector('[data-resumen-obj]');
    if (u) u.textContent = engFmt(r.utilidadBruta);
    refreshMargenUtilidadCell(tr, r);
    refreshCostoPctCell(tr, r);
    if (bar) bar.innerHTML = renderObjetivoBarHtml(r.pctCostoMp, getObjetivoCostoFraccion());
    if (ob) ob.innerHTML = renderMatrizStatusPill(ev);
    var rowCls = ev.bajoTolerancia
      ? 'crozzo-matriz-row--crit'
      : !ev.dentroObjetivo || ev.alertaSubida === 'warn'
        ? 'crozzo-matriz-row--warn'
        : 'crozzo-matriz-row--ok';
    tr.className = rowCls;
    tr.setAttribute(
      'data-matriz-state',
      ev.bajoTolerancia ? 'crit' : !ev.dentroObjetivo || ev.alertaSubida === 'warn' ? 'warn' : 'ok'
    );
    var root = tr.closest('.crozzo-matriz-premium');
    refreshPrecioPosCell(tr, seed);
    if (root) {
      if (opts.save) {
        if (hub.matrizAggTimer) {
          clearTimeout(hub.matrizAggTimer);
          hub.matrizAggTimer = null;
        }
        refreshResumenTotales(root, seed);
        refreshMatrizKpis(root, seed);
      } else {
        scheduleMatrizAggregateRefresh(root, seed);
      }
    }
    if (!opts.skipRecetaSync && slug && isFinite(precioVenta)) {
      var hostRec = tr.closest('#mainContent') || document.getElementById('mainContent');
      syncPrecioVentaMatrizToReceta(hostRec, seed, slug, precioVenta);
    }
    if (opts.save) {
      emit('crozzo-costos:matriz-precio-venta', {
        slug: slug,
        precioVenta: precioVenta,
        costoMp: costoMp,
        margenPct: r.pctUtilidad,
      });
      var rootSave = tr.closest('.crozzo-matriz-premium') || document.getElementById('mainContent');
      refreshMatrizHistorialPanel(rootSave);
    }
  }

  function bindResumenRowInputs(root, seed) {
    if (!root) return;
    root.querySelectorAll('tr[data-resumen-slug]').forEach(function (tr) {
      tr.querySelectorAll('[data-resumen-field]').forEach(function (inp) {
        if (inp._bound) return;
        inp._bound = true;
        var field = inp.getAttribute('data-resumen-field');
        inp.addEventListener('input', function () {
          if (inp._silent) return;
          refreshResumenRow(tr, seed, { sourceField: field });
        });
        inp.addEventListener('change', function () {
          if (inp._silent) return;
          refreshResumenRow(tr, seed, { sourceField: field, save: true });
        });
      });
    });
  }

  function applyGlobalMargenToAll(root, seed, costoPctDisplay, syncCostos) {
    var e = engine();
    if (!e || !root || hub.matrizApplying) return 0;
    saveGlobalCostoObjetivoPct(costoPctDisplay);
    hub.matrizApplying = true;
    var applyBtn = root.querySelector('#crozzoMargenAplicar');
    var syncBtn = root.querySelector('#crozzoMargenSyncCostos');
    if (applyBtn) {
      applyBtn.disabled = true;
      applyBtn.textContent = 'Aplicando…';
    }
    if (syncBtn) syncBtn.disabled = true;

    var updates = [];
    mergeResumenList(seed).forEach(function (row) {
      var costo = resolveCostoVentaMenu(row, seed);
      if (!isFinite(costo) || costo <= 0) costo = Number(row.costoMp);
      if (!isFinite(costo) || costo <= 0) return;
      var precio = precioParaCostoObjetivo(costo, costoPctDisplay);
      updates.push({
        slug: row.slug,
        patch: { costoMp: Math.round(costo), precioVenta: Math.round(precio) },
      });
    });

    if (!updates.length) {
      hub.matrizApplying = false;
      if (applyBtn) {
        applyBtn.disabled = false;
        applyBtn.textContent = 'Recalcular precios con meta';
      }
      if (syncBtn) syncBtn.disabled = false;
      toast('No hay platos con costo MP para aplicar meta', 'info');
      return 0;
    }

    saveResumenBatch(updates);
    syncHistorialVigenteForUpdates(updates, 'Meta de costo MP aplicada en precios vigentes');
    invalidateSeed();
    loadSeed(function (updated) {
      hub.seed = updated;
      refreshMatrizResumenTable(root, updated);
      refreshMatrizHistorialPanel(root);
      refreshRecetaPanelIfVisible(root, updated);
      hub.matrizApplying = false;
      if (applyBtn) {
        applyBtn.disabled = false;
        applyBtn.textContent = 'Recalcular precios con meta';
      }
      if (syncBtn) syncBtn.disabled = false;
      var sinReceta = mergeResumenList(updated).filter(function (r) {
        return calcularCostoMpDesdeReceta(r.slug, updated) <= 0;
      }).length;
      var msg =
        'Costo meta ' +
        costoPctDisplay +
        '% en ' +
        updates.length +
        ' plato(s)';
      if (syncCostos && sinReceta > 0) {
        msg += ' · ' + sinReceta + ' sin receta con insumos (costo manual)';
      }
      toast(msg, updates.length ? 'success' : 'info');
    });
    return updates.length;
  }

  function initMatrizCommandDeck(root) {
    var cmd = root && root.querySelector('#crozzoMatrizCmd');
    if (!cmd || cmd._cmdBound) return;
    cmd._cmdBound = true;
    var toggle = cmd.querySelector('#crozzoMatrizCmdToggle');
    var closeBtn = cmd.querySelector('#crozzoMatrizCmdClose');
    var deck = cmd.querySelector('#crozzoMatrizCmdDeck');
    var schedule = cmd.querySelector('#crozzoMatrizCmdSchedule');
    var progBtn = cmd.querySelector('#crozzoMatrizProgramarCaja');

    function setCmdOpen(open) {
      cmd.classList.toggle('is-open', open);
      if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (deck) deck.hidden = !open;
      if (open && schedule) schedule.classList.add('is-visible');
    }

    hub.closeMatrizCommandDeck = function () {
      setCmdOpen(false);
    };
    hub.openMatrizCommandDeck = function (focusSchedule) {
      setCmdOpen(true);
      if (cmd.scrollIntoView) cmd.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      if (focusSchedule && schedule) schedule.classList.add('is-highlight');
    };

    if (toggle) {
      toggle.addEventListener('click', function () {
        setCmdOpen(!cmd.classList.contains('is-open'));
      });
    }
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        setCmdOpen(false);
      });
    }
    if (progBtn && schedule) {
      progBtn.addEventListener('mouseenter', function () {
        schedule.classList.add('is-highlight');
      });
      progBtn.addEventListener('focus', function () {
        schedule.classList.add('is-highlight');
      });
      progBtn.addEventListener('mouseleave', function () {
        schedule.classList.remove('is-highlight');
      });
      progBtn.addEventListener('blur', function () {
        schedule.classList.remove('is-highlight');
      });
    }
    if (!cmd._escBound) {
      cmd._escBound = true;
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && cmd.classList.contains('is-open')) setCmdOpen(false);
      });
    }
  }

  function initMargenGlobalControls(root, seed) {
    if (!root) return;
    initMatrizCommandDeck(root);
    var range = root.querySelector('#crozzoMargenGlobalRange');
    var num = root.querySelector('#crozzoMargenGlobalPct');
    var syncBtn = root.querySelector('#crozzoMargenSyncCostos');
    var applyBtn = root.querySelector('#crozzoMargenAplicar');

    function syncGlobalInputs(from) {
      if (!range || !num) return;
      if (from === 'range') setInputSilent(num, Number(range.value));
      else if (from === 'num') {
        var v = Number(num.value);
        if (isFinite(v)) setInputSilent(range, Math.max(15, Math.min(85, Math.round(v))));
      }
      saveGlobalCostoObjetivoPct(Number(num.value));
    }

    function refreshObjetivoDisplay() {
      if (!hub.matrizApplying && root && hub.seed) {
        refreshMatrizObjetivoOnly(root, hub.seed);
      }
    }

    if (range && !range._bound) {
      range._bound = true;
      range.addEventListener('input', function () {
        syncGlobalInputs('range');
        refreshObjetivoDisplay();
      });
    }
    if (num && !num._bound) {
      num._bound = true;
      num.addEventListener('input', function () {
        syncGlobalInputs('num');
        refreshObjetivoDisplay();
      });
      num.addEventListener('change', function () {
        saveGlobalCostoObjetivoPct(Number(num.value));
      });
    }
    if (syncBtn && !syncBtn._bound) {
      syncBtn._bound = true;
      syncBtn.addEventListener('click', function () {
        if (hub.matrizApplying) return;
        hub.matrizApplying = true;
        syncBtn.disabled = true;
        var n = syncMenuCostosDesdeFuentes(seed, { force: true });
        invalidateSeed();
        loadSeed(function (fresh) {
          hub.seed = fresh;
          refreshMatrizResumenTable(root, fresh);
          refreshMatrizHistorialPanel(root);
          hub.matrizApplying = false;
          syncBtn.disabled = false;
          toast(
            n
              ? n + ' costos sincronizados (unitario + recetas)'
              : 'Nada que sincronizar — revise costeo unitario y recetas',
            n ? 'success' : 'info'
          );
        });
      });
    }
    if (applyBtn && !applyBtn._bound) {
      applyBtn._bound = true;
      applyBtn.addEventListener('click', function () {
        var pct = num ? Number(num.value) : loadGlobalCostoObjetivoPct();
        if (!isFinite(pct) || pct <= 0 || pct >= 100) {
          toast('Indique un % costo entre 1 y 99', 'warn');
          return;
        }
        applyGlobalMargenToAll(root, seed, pct, true);
      });
    }
    var minRange = root.querySelector('#crozzoMargenMinimoRange');
    var minInp = root.querySelector('#crozzoMargenMinimoPct');

    function refreshMargenMinimoUi() {
      refreshObjetivoDisplay();
      var alerts = root.querySelector('.crozzo-matriz-alerts');
      if (alerts && hub.seed) alerts.outerHTML = renderMatrizAlertsBanner(hub.seed);
    }

    function syncMinInputs(from) {
      if (!minRange || !minInp) return;
      if (from === 'range') setInputSilent(minInp, Number(minRange.value));
      else if (from === 'num') {
        var mv = Number(minInp.value);
        if (isFinite(mv)) setInputSilent(minRange, Math.max(2, Math.min(30, Math.round(mv))));
      }
      saveGlobalMpAlertaSubidaPct(Number(minInp.value));
    }

    if (minRange && !minRange._bound) {
      minRange._bound = true;
      minRange.addEventListener('input', function () {
        syncMinInputs('range');
        refreshMargenMinimoUi();
      });
    }
    if (minInp && !minInp._bound) {
      minInp._bound = true;
      minInp.addEventListener('input', function () {
        syncMinInputs('num');
        refreshMargenMinimoUi();
      });
      minInp.addEventListener('change', function () {
        syncMinInputs('num');
        saveGlobalMpAlertaSubidaPct(Number(minInp.value));
        refreshMargenMinimoUi();
      });
    }
    var guardarBtn = root.querySelector('#crozzoGuardarCosteoMenu');
    if (guardarBtn && !guardarBtn._bound) {
      guardarBtn._bound = true;
      guardarBtn.addEventListener('click', function () {
        var C = global.CrozzoCatalogoMp;
        if (!C || !C.guardarCosteoMenuSnapshot) return;
        syncMenuCostosDesdeFuentes(seed, { force: true });
        invalidateSeed();
        loadSeed(function (fresh) {
          hub.seed = fresh;
          var n = C.guardarCosteoMenuSnapshot({
            notas: 'Archivo mensual (histórico)',
            getCostoMp: function (row) {
              return resolveCostoVentaMenu(row, fresh);
            },
          });
          toast(
            n + ' productos archivados por mes · la fila «Vigente (actual)» sigue actualizándose sola',
            'success'
          );
          refreshMatrizHistorialPanel(root);
          if (hub.closeMatrizCommandDeck) hub.closeMatrizCommandDeck();
        });
      });
    }
    var progFecha = root.querySelector('#crozzoMatrizProgDateTime');
    if (progFecha && !progFecha.value) progFecha.value = defaultMatrizProgDateTimeLocal();
    var aplicarCajaBtn = root.querySelector('#crozzoMatrizAplicarCaja');
    if (aplicarCajaBtn && !aplicarCajaBtn._bound) {
      aplicarCajaBtn._bound = true;
      aplicarCajaBtn.addEventListener('click', function () {
        var C = global.CrozzoCatalogoMp;
        if (!C || !C.aplicarActualizacionMenuCompleta) return;
        if (hub.matrizApplying) return;
        hub.matrizApplying = true;
        aplicarCajaBtn.disabled = true;
        syncMenuCostosDesdeFuentes(seed, { force: true });
        invalidateSeed();
        loadSeed(function (fresh) {
          hub.seed = fresh;
          var r = C.aplicarActualizacionMenuCompleta({
            getCostoMp: function (row) {
              return resolveCostoVentaMenu(row, fresh);
            },
          });
          hub.matrizApplying = false;
          aplicarCajaBtn.disabled = false;
          refreshMatrizResumenTable(root, fresh);
          refreshMatrizHistorialPanel(root);
          refreshMatrizProgramacionesPanel(root);
          if (hub.closeMatrizCommandDeck) hub.closeMatrizCommandDeck();
          toast(
            (r.lanzados || 0) +
              ' platos lanzados · ' +
              (r.actualizados || 0) +
              ' precios · ' +
              (r.ocultos || 0) +
              ' ocultos en caja',
            'success'
          );
        });
      });
    }
    var programarCajaBtn = root.querySelector('#crozzoMatrizProgramarCaja');
    if (programarCajaBtn && !programarCajaBtn._bound) {
      programarCajaBtn._bound = true;
      programarCajaBtn.addEventListener('click', function () {
        var C = global.CrozzoCatalogoMp;
        if (!C || !C.addProgramacionMenu) return;
        var vigRaw = readMatrizProgDateTime(root);
        if (!vigRaw) {
          toast('Indique fecha y hora de la actualización', 'warn');
          return;
        }
        var vigIso = C.normalizeVigenciaIso ? C.normalizeVigenciaIso(vigRaw) : vigRaw;
        if (C.vigenciaEsDue && C.vigenciaEsDue(vigIso)) {
          toast('La fecha ya pasó — use «Aplicar ahora en caja» o elija una hora futura', 'warn');
          return;
        }
        syncMenuCostosDesdeFuentes(seed, { force: true });
        invalidateSeed();
        loadSeed(function (fresh) {
          hub.seed = fresh;
          var prog = C.addProgramacionMenu(vigIso, {
            notas: 'Actualización menú costeo → caja',
            getCostoMp: function (row) {
              return resolveCostoVentaMenu(row, fresh);
            },
          });
          if (!prog) {
            toast('No se pudo programar la actualización', 'warn');
            return;
          }
          var fmt = C.formatVigenciaDisplay ? C.formatVigenciaDisplay(vigIso) : vigRaw;
          var rs = prog.resumen || {};
          toast(
            'Actualización programada para ' +
              fmt +
              ' (' +
              (rs.lanzar || 0) +
              ' nuevos · ' +
              (rs.actualizar || 0) +
              ' precios · ' +
              (rs.ocultar || 0) +
              ' ocultos)',
            'success'
          );
          refreshMatrizProgramacionesPanel(root);
          if (hub.closeMatrizCommandDeck) hub.closeMatrizCommandDeck();
        });
      });
    }
    var autoPosChk = root.querySelector('#crozzoMatrizAutoPosMargen');
    if (autoPosChk && !autoPosChk._bound) {
      autoPosChk._bound = true;
      autoPosChk.addEventListener('change', function () {
        saveAutoPosDesdeMargen(autoPosChk.checked);
        toast(
          autoPosChk.checked
            ? 'Al cambiar costos MP se actualizará la caja con el margen meta'
            : 'Solo se actualizará la matriz de costos (caja manual)',
          'info'
        );
      });
    }
    var pdfMapa = root.querySelector('#crozzoCostosPdfMapaFlujos');
    var Rmapa = global.CrozzoFlujosMapaPdf;
    if (pdfMapa && !pdfMapa._bound && Rmapa && Rmapa.downloadMapaFlujos) {
      pdfMapa._bound = true;
      pdfMapa.addEventListener('click', function () {
        Rmapa.downloadMapaFlujos();
      });
    }
    /* PDF resumen/detallado: un solo handler en initMatrizGerenciaPanel (_pdfReportBound) */
    root.querySelectorAll('[data-matriz-vista]').forEach(function (btn) {
      if (btn._bound) return;
      btn._bound = true;
      btn.addEventListener('click', function () {
        var vista = btn.getAttribute('data-matriz-vista') || 'vigente';
        root.querySelectorAll('[data-matriz-vista]').forEach(function (b) {
          b.classList.toggle('is-active', b === btn);
        });
        root.querySelectorAll('[data-matriz-vista-panel]').forEach(function (p) {
          p.classList.toggle('is-active', p.getAttribute('data-matriz-vista-panel') === vista);
        });
        root.classList.toggle('crozzo-matriz-premium--vista-guardado', vista === 'historial');
        if (vista === 'historial') {
          refreshMatrizHistorialPanel(root, hub.seed);
        } else if (vista === 'programaciones') {
          var progPanel = root.querySelector('[data-matriz-vista-panel="programaciones"]');
          if (progPanel && progPanel.getAttribute('data-matriz-lazy') === 'programaciones') {
            progPanel.removeAttribute('data-matriz-lazy');
            progPanel.innerHTML = renderProgramacionesPanel();
          }
        }
      });
    });
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
      var hid = tr.querySelector('[data-receta-mp-id]');
      var mpSel = tr.querySelector('[data-receta-mp]');
      var mpId = (hid && hid.value) || (mpSel ? mpSel.value : '') || tr.getAttribute('data-mp-id') || '';
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
        costoXUnidad: resolveCostoUnitarioLineaReceta(
          { mpId: mpId, ingrediente: ing },
          e,
          C,
          store
        ),
      });
    });
    return lineas;
  }

  function refreshRecetaResumenPanel(root, calc, opts, row, e) {
    if (!root || !calc) return;
    var scope = getRecetaEdicionPanel(root);
    if (!scope) return;
    var precioInp = scope.querySelector('[data-receta-opt="precioVenta"]');
    var precioVenta = precioInp && isFinite(Number(precioInp.value)) ? Number(precioInp.value) : row ? Number(row.precioVenta) || 0 : 0;
    var res = e ? e.calcularResumen(calc.costoReferencia, precioVenta) : null;
    var evalMp = e ? e.evaluarMargen(res, calc.porcentajeMpObjetivo) : null;
    var set = function (sel, val) {
      var el = scope.querySelector(sel);
      if (el) el.textContent = val;
    };
    set('[data-receta-kpi="k3"]', engFmt(calc.totalMp));
    set('[data-receta-kpi="k4"]', engFmt(calc.margenErrorMonto));
    set('[data-receta-kpi="k5"]', engFmt(calc.totalAlCosto));
    set('[data-receta-kpi="k7"]', engFmt(calc.costoReferencia));
    set('[data-receta-kpi="k10"]', engFmt(calc.precioSugerido));
    set('[data-receta-kpi="k11"]', engFmt(calc.precioConImpuesto));
    set('[data-receta-kpi-val="util"]', res && res.precioVenta > 0 ? engFmt(res.utilidadBruta) : '—');
    set('[data-receta-kpi-val="pct-util"]', res && res.precioVenta > 0 ? engPct(res.pctUtilidad) : '—');
    var pctMp = scope.querySelector('[data-receta-kpi="pct-mp"]');
    if (pctMp) {
      pctMp.innerHTML =
        res && res.precioVenta > 0
          ? engPct(res.pctCostoMp) +
            '<span class="crozzo-receta-block__sub">' +
            (evalMp && evalMp.dentroObjetivo ? 'Dentro del objetivo' : 'Sobre objetivo food cost') +
            '</span>'
          : '—';
    }
    var porcInp = scope.querySelector('[data-receta-opt="porciones"]');
    var pesoAutoChk = scope.querySelector('[data-receta-peso-auto]');
    if (porcInp && opts && opts.pesoAuto) {
      porcInp.value = String(Math.round(calc.pesoOUnidades * 100) / 100);
      porcInp.disabled = true;
    } else if (porcInp && pesoAutoChk && !pesoAutoChk.checked) {
      porcInp.disabled = false;
    }
    var pesoHint = scope.querySelector('[data-receta-peso-hint]');
    if (pesoHint && e) {
      var pesoSum = sumPesoGrLineas(calc.lineas, e);
      pesoHint.textContent =
        opts && opts.pesoAuto && pesoSum > 0
          ? recetaPesoAutoHint(pesoSum)
          : 'Porciones o peso de la receta';
    }
  }

  function recalcDemoReceta(root, seed, optsExtra) {
    optsExtra = optsExtra || {};
    var e = engine();
    if (!e || !root) return null;
    var tbody = root.querySelector('#crozzoDemoTbody');
    if (!tbody) return null;
    var slug = getActiveRecetaSlug(seed);
    var row = mergeResumenList(seed).find(function (r) {
      return r.slug === slug;
    });
    var C = global.CrozzoCatalogoMp;
    var rec = C && C.getRecetaPlato ? C.getRecetaPlato(slug) : null;
    var lineas = collectRecetaLineasFromDom(root, seed);
    var baseOpts = getRecetaOptsMerged(rec, seed, slug);
    var calcOpts = collectRecetaOptsFromDom(root, baseOpts, lineas, e);
    calcOpts = syncMargenErrorFromRecipeLineas(calcOpts, rec, lineas, root);
    var calc = e.calcularReceta(lineas, calcOpts);
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
    refreshRecetaResumenPanel(root, calc, calcOpts, row, e);
    var dockMeta = root.querySelector('[data-receta-dock-meta]');
    if (dockMeta) {
      var n = lineas.length;
      dockMeta.textContent = n + ' insumo' + (n === 1 ? '' : 's');
    }
    var badgeCount = root.querySelector('.crozzo-receta-plato__badge:not(.crozzo-receta-plato__badge--gold):not(.crozzo-receta-plato__badge--draft)');
    if (badgeCount) badgeCount.textContent = lineas.length + ' insumos';
    var persist = !!optsExtra.persist;
    var previewOnly = !!optsExtra.previewOnly || !persist;
    if (persist) {
      saveDemoRecetaLineas(lineas, {
        slug: slug,
        producto: (rec && rec.producto) || (row && row.producto),
        opts: {
          margenErrorPct: calcOpts.margenErrorPct,
          margenErrorManual: (rec && rec.opts && rec.opts.margenErrorManual) === true,
          porcentajeMpObjetivo: calcOpts.porcentajeMpObjetivo,
          impuestoPct: calcOpts.impuestoPct,
          porciones: calcOpts.pesoAuto ? resolvePorcionesManual(calcOpts) : calcOpts.porciones,
          porcionesManual: resolvePorcionesManual(calcOpts),
          pesoAuto: calcOpts.pesoAuto,
        },
        skipEvent: true,
      });
      clearRecetaDraft(slug);
      updateRecetaDirtyBadge(root, false);
    } else if (previewOnly) {
      setRecetaDraft(slug, lineas, calcOpts);
      updateRecetaDirtyBadge(root, true);
    }
    var edScope = getRecetaEdicionPanel(root);
    var precioInp = edScope ? edScope.querySelector('[data-receta-opt="precioVenta"]') : null;
    var precioVenta = precioInp && isFinite(Number(precioInp.value)) ? Math.round(Number(precioInp.value)) : row ? Number(row.precioVenta) || 0 : 0;
    if (persist && slug && calc.costoReferencia > 0 && !hub.matrizApplying) {
      var patch = {
        costoMp: Math.round(calc.costoReferencia),
        tipoCosteo: 'receta',
        _histNotas: 'Receta guardada',
      };
      if (optsExtra.savePrecio && precioVenta > 0) patch.precioVenta = precioVenta;
      saveResumenEdit(slug, patch);
      invalidateSeed();
      var trMenu = root.querySelector('tr[data-resumen-slug="' + slug + '"]');
      if (trMenu) {
        var costoEl = trMenu.querySelector('[data-resumen-costo-mp]');
        var costoR = Math.round(calc.costoReferencia);
        if (costoEl) {
          costoEl.setAttribute('data-resumen-costo-mp', String(costoR));
          costoEl.textContent = engFmt(costoR);
        }
        if (optsExtra.savePrecio && precioVenta > 0) {
          var precioEl = trMenu.querySelector('[data-resumen-field="precioVenta"]');
          if (precioEl) setInputSilent(precioEl, precioVenta);
        }
        refreshResumenRow(trMenu, seed, { sourceField: 'precioVenta' });
      }
    }
    return calc;
  }

  function probarRecetaPlato(root, seed) {
    var calc = recalcDemoReceta(root, seed, { previewOnly: true });
    if (!calc) {
      toast('No hay datos para simular', 'warning');
      return null;
    }
    var edScope = getRecetaEdicionPanel(root);
    var precioInp = edScope ? edScope.querySelector('[data-receta-opt="precioVenta"]') : null;
    var precioVenta = precioInp && isFinite(Number(precioInp.value)) ? Number(precioInp.value) : 0;
    var e = engine();
    var res = e ? e.calcularResumen(calc.costoReferencia, precioVenta) : null;
    var msg =
      'Simulación (sin guardar) · Costo ref. ' +
      engFmt(calc.costoReferencia) +
      ' · Sugerido ' +
      engFmt(calc.precioSugerido);
    if (res && precioVenta > 0) msg += ' · Food cost ' + engPct(res.pctCostoMp);
    toast(msg, 'info');
    return calc;
  }

  function persistRecetaPlato(root, seed) {
    var C = global.CrozzoCatalogoMp;
    if (C && C.ejecutarProgramacionesRecetasPendientes) {
      C.ejecutarProgramacionesRecetasPendientes({ silent: true });
    }
    var lineas = collectRecetaLineasFromDom(root, seed);
    if (!lineas.length) {
      toast('Agregue al menos un insumo antes de guardar', 'warning');
      return null;
    }
    var slug = getActiveRecetaSlug(seed);
    var C = global.CrozzoCatalogoMp;
    if (C && C.autoApplyMenuPrepConfig) {
      var row = C.getMenuPlato ? C.getMenuPlato(slug) : null;
      if (row && !row.prepConfigManual) C.autoApplyMenuPrepConfig(slug);
    }
    var calc = recalcDemoReceta(root, seed, { persist: true, savePrecio: true });
    if (!calc) return null;
    var rec = C && C.getRecetaPlato ? C.getRecetaPlato(slug) : null;
    emit('crozzo-costos:receta-actualizada', {
      recipeId: slug,
      slug: slug,
      lineas: (rec && rec.lineas) || lineas,
      opts: (rec && rec.opts) || {},
    });
    var eng = global.CrozzoPedidosInternosEngine;
    if (eng && eng.recalcAllFromRecipes) eng.recalcAllFromRecipes();
    toast('Receta guardada — matriz, menú y pedidos internos actualizados', 'success');
    invalidateSeed();
    loadSeed(function (fresh) {
      hub.seed = fresh;
      refreshRecetaPlatoPanel(root, fresh);
      refreshMatrizHistorialPanel(root, fresh);
      if (root.querySelector('tr[data-resumen-slug="' + slug + '"]')) {
        refreshMatrizResumenTable(root, fresh);
      }
    });
    return calc;
  }

  function switchRecetaVista(root, vista) {
    if (!root) return;
    root.querySelectorAll('.crozzo-matriz-vista-tab[data-receta-vista]').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-receta-vista') === vista);
    });
    root.querySelectorAll('[data-receta-vista-panel]').forEach(function (p) {
      p.classList.toggle('is-active', p.getAttribute('data-receta-vista-panel') === vista);
    });
  }

  function programarRecetaPlato(root, seed) {
    var C = global.CrozzoCatalogoMp;
    if (!C || !C.addProgramacionReceta) {
      toast('Programación de recetas no disponible', 'error');
      return;
    }
    var slug = getActiveRecetaSlug(seed);
    var fechaInp = root.querySelector('#crozzoRecetaProgFecha');
    var fecha = (fechaInp && fechaInp.value) || new Date().toISOString().slice(0, 10);
    var srcRad = root.querySelector('input[name="crozzoRecetaProgSource"]:checked');
    var source = srcRad ? srcRad.value : 'draft';
    var snapshot;
    var rowMenu = mergeResumenList(seed).find(function (r) {
      return r.slug === slug;
    });
    if (source === 'saved') {
      var packSaved = buildRecetaCalcPack(seed, slug, { useSaved: true });
      if (!packSaved.lineas.length) {
        toast('No hay receta guardada para programar', 'warning');
        return;
      }
      snapshot = {
        lineas: packSaved.lineas.slice(),
        opts: packSaved.calcOpts,
        precioVenta: packSaved.row ? Number(packSaved.row.precioVenta) || 0 : 0,
        costoReferencia: packSaved.calc ? packSaved.calc.costoReferencia : 0,
      };
    } else {
      var lineas = collectRecetaLineasFromDom(root, seed);
      if (!lineas.length) {
        toast('El borrador no tiene insumos — agregue líneas en En edición', 'warning');
        return;
      }
      var calc = recalcDemoReceta(root, seed, { previewOnly: true });
      var edicion = getRecetaEdicionPanel(root);
      var precioInp = edicion ? edicion.querySelector('[data-receta-opt="precioVenta"]') : null;
      snapshot = {
        lineas: lineas,
        opts: collectRecetaOptsFromDom(root, getRecetaOptsMerged(null, seed, slug), lineas, engine()),
        precioVenta: precioInp && isFinite(Number(precioInp.value)) ? Math.round(Number(precioInp.value)) : rowMenu ? Number(rowMenu.precioVenta) || 0 : 0,
        costoReferencia: calc ? calc.costoReferencia : 0,
      };
    }
    var prog = C.addProgramacionReceta(slug, fecha, snapshot, {
      producto: (rowMenu && rowMenu.producto) || slug,
      notas: source === 'draft' ? 'Desde borrador en edición' : 'Desde receta guardada',
    });
    if (!prog) {
      toast('No se pudo programar — revise la fecha', 'warning');
      return;
    }
    refreshRecetaPlatoPanel(root, seed);
    var platoRoot = root.querySelector('.crozzo-receta-plato');
    if (platoRoot) switchRecetaVista(platoRoot, 'programaciones');
    toast('Receta programada para el ' + fecha, 'success');
  }

  function initMatrizGerenciaPanel(root, seed) {
    if (!root || !seed) return;
    if (!root._pdfReportBound) {
      root._pdfReportBound = true;
      root.addEventListener('click', function (e) {
        var pdfBtn = e.target.closest('#crozzoCostosPdfGeneral, #crozzoCostosPdfDetallado, #crozzoCostosPdfMapaFlujos');
        if (!pdfBtn) return;
        e.preventDefault();
        e.stopPropagation();
        if (pdfBtn.id === 'crozzoCostosPdfMapaFlujos') {
          var Rmapa = global.CrozzoFlujosMapaPdf;
          if (Rmapa && Rmapa.downloadMapaFlujos) {
            Rmapa.downloadMapaFlujos();
          } else {
            toast('Módulo de mapa de flujos no cargado — recargue la página', 'error');
          }
          return;
        }
        var Rpdf = global.CrozzoCostosReportesPdf;
        if (!Rpdf) {
          toast('Módulo de reportes PDF no cargado — recargue la página', 'error');
          return;
        }
        if (pdfBtn.id === 'crozzoCostosPdfGeneral' && Rpdf.downloadGeneral) {
          Rpdf.downloadGeneral();
        } else if (pdfBtn.id === 'crozzoCostosPdfDetallado' && Rpdf.downloadDetallado) {
          Rpdf.downloadDetallado();
        }
      });
    }
    if (!root._gerenciaBound) {
      root._gerenciaBound = true;
      root.addEventListener('click', function (e) {
        var addLineBtn = e.target.closest('[data-receta-action="add-line"]');
        if (addLineBtn) {
          e.preventDefault();
          addRecetaLine(root, hub.seed || seed);
          return;
        }
        var probarDock = e.target.closest('[data-receta-action="probar"]');
        if (probarDock) {
          e.preventDefault();
          probarRecetaPlato(root, hub.seed || seed);
          return;
        }
        var saveDock = e.target.closest('[data-receta-action="save"]');
        if (saveDock) {
          e.preventDefault();
          persistRecetaPlato(root, hub.seed || seed);
          return;
        }
        var resetAuto = e.target.closest('[data-receta-field="prepAutoReset"]');
        if (resetAuto) {
          e.preventDefault();
          var slugRa = getActiveRecetaSlug(hub.seed || seed);
          if (!slugRa) return;
          var C = global.CrozzoCatalogoMp;
          if (C && C.autoApplyMenuPrepConfig) {
            saveResumenEdit(slugRa, { prepConfigManual: false });
            C.autoApplyMenuPrepConfig(slugRa, { force: true });
          }
          invalidateSeed();
          loadSeed(function (fresh) {
            hub.seed = fresh;
            refreshRecetaPlatoPanel(root, fresh);
          });
          return;
        }
        var btn = e.target.closest('[data-action="usar-precio-pos"]');
        if (!btn) return;
        e.preventDefault();
        var tr = btn.closest('tr[data-resumen-slug]');
        var cell = tr && tr.querySelector('[data-resumen-pos]');
        if (!tr || !cell) return;
        var pos = Number(cell.getAttribute('data-pos-precio'));
        if (!isFinite(pos)) return;
        var precioInp = tr.querySelector('[data-resumen-field="precioVenta"]');
        if (precioInp) setInputSilent(precioInp, pos);
        refreshResumenRow(tr, hub.seed || seed, { sourceField: 'precioVenta', save: true });
        toast('Precio de costeo igualado al de caja ($' + pos.toLocaleString('es-CO') + ')', 'success');
      });
      root.addEventListener('change', function (e) {
        var tipoSel = e.target.closest('[data-receta-field="prepCocinaTipo"]');
        if (tipoSel) {
          var slugPv = getActiveRecetaSlug(hub.seed || seed);
          if (!slugPv) return;
          applyPrepCocinaTipoFromUi(root, slugPv, tipoSel.value, { prepConfigManual: true });
          return;
        }
        var sel = e.target.closest('[data-receta-field="procesoVenta"]');
        if (sel) {
          var slugPv = getActiveRecetaSlug(hub.seed || seed);
          if (!slugPv) return;
          var val = sel.value === 'prep_anticipado' ? 'prep_anticipado' : 'bajo_demanda';
          applyRecetaProcesoVentaFromUi(root, slugPv, val, { prepConfigManual: true });
          return;
        }
        var wfSel = e.target.closest('[data-receta-field="workflowPrep"]');
        if (wfSel) {
          var slugWf = getActiveRecetaSlug(hub.seed || seed);
          if (!slugWf) return;
          applyRecetaWorkflowPrepFromUi(root, slugWf, wfSel.value);
          return;
        }
        var vendeChk = e.target.closest('[data-receta-field="vendeAlCliente"]');
        if (vendeChk) {
          var slugV = getActiveRecetaSlug(hub.seed || seed);
          if (!slugV) return;
          saveResumenEdit(slugV, { vendeAlCliente: !!vendeChk.checked });
        }
      });
      document.addEventListener('crozzo-catalogo-mp:changed', function () {
        if (!root.isConnected || hub.matrizApplying) return;
        clearTimeout(hub.matrizCatalogTimer);
        hub.matrizCatalogTimer = setTimeout(function () {
          invalidateMatrizCaches();
          invalidateSeed();
          loadSeed(function (fresh) {
            hub.seed = fresh;
            refreshMatrizResumenTable(root, fresh);
            var demoPanel = root.querySelector('[data-matriz-panel="demo"]');
            if (demoPanel && demoPanel.classList.contains('active')) {
              refreshRecetaPlatoPanel(root, fresh);
            }
          });
        }, 150);
      });
    }
    var resumenQ = '';
    var matrizFilterMeta = 'all';
    var matrizFilterTipo = 'all';
    var matrizFilterCmp = 'all';

    function applyResumenFilters() {
      root.querySelectorAll('#crozzoResumenTbody tr[data-resumen-slug]').forEach(function (tr) {
        var blob = tr.getAttribute('data-resumen-search') || (tr.cells[0] && tr.cells[0].textContent) || '';
        var matchQ = matchSearchQuery(blob, resumenQ);
        var st = tr.getAttribute('data-matriz-state') || 'ok';
        var tipo = tr.getAttribute('data-matriz-tipo') || 'directo';
        var cmp = tr.getAttribute('data-matriz-cmp') || 'none';
        var matchMeta = matrizFilterMeta === 'all' || matrizFilterMeta === st;
        var matchTipo = matrizFilterTipo === 'all' || matrizFilterTipo === tipo;
        var matchCmp = true;
        if (matrizFilterCmp === 'up') matchCmp = cmp === 'up';
        else if (matrizFilterCmp === 'down') matchCmp = cmp === 'down';
        else if (matrizFilterCmp === 'eq') matchCmp = cmp === 'eq';
        else if (matrizFilterCmp === 'diff') matchCmp = cmp === 'up' || cmp === 'down';
        tr.style.display = matchQ && matchMeta && matchTipo && matchCmp ? '' : 'none';
      });
    }
    root._matrizApplyFilters = applyResumenFilters;

    var search = root.querySelector('#crozzoResumenSearch');
    if (search && !search._bound) {
      search._bound = true;
      var searchTimer = null;
      search.addEventListener('input', function () {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () {
          resumenQ = search.value.trim();
          applyResumenFilters();
        }, 120);
      });
    }

    root.querySelectorAll('[data-matriz-filter-tipo]').forEach(function (btn) {
      if (btn._bound) return;
      btn._bound = true;
      btn.addEventListener('click', function () {
        matrizFilterTipo = btn.getAttribute('data-matriz-filter-tipo') || 'all';
        root.querySelectorAll('[data-matriz-filter-tipo]').forEach(function (b) {
          b.classList.toggle('is-active', b === btn);
        });
        applyResumenFilters();
      });
    });

    root.querySelectorAll('[data-matriz-filter-meta]').forEach(function (btn) {
      if (btn._bound) return;
      btn._bound = true;
      btn.addEventListener('click', function () {
        matrizFilterMeta = btn.getAttribute('data-matriz-filter-meta') || 'all';
        root.querySelectorAll('[data-matriz-filter-meta]').forEach(function (b) {
          b.classList.toggle('is-active', b === btn);
        });
        applyResumenFilters();
      });
    });

    root.querySelectorAll('[data-matriz-filter-cmp]').forEach(function (btn) {
      if (btn._bound) return;
      btn._bound = true;
      btn.addEventListener('click', function () {
        matrizFilterCmp = btn.getAttribute('data-matriz-filter-cmp') || 'all';
        root.querySelectorAll('[data-matriz-filter-cmp]').forEach(function (b) {
          b.classList.toggle('is-active', b === btn);
        });
        applyResumenFilters();
      });
    });

    var syncPos = root.querySelector('#crozzoMatrizSyncPos');
    if (syncPos && !syncPos._bound) {
      syncPos._bound = true;
      syncPos.addEventListener('click', function () {
        if (hub.matrizApplying) return;
        var C = global.CrozzoCatalogoMp;
        if (!C || !C.ensureMenuPosProductos) return;
        hub.matrizApplying = true;
        syncPos.disabled = true;
        var added = C.ensureMenuPosProductos({ silent: true, keepCostos: true });
        ensureMatrizMenuCompleto(function (fresh) {
          refreshMatrizResumenTable(root, fresh);
          hub.matrizApplying = false;
          syncPos.disabled = false;
          var list = mergeResumenList(fresh);
          toast(
            list.length + ' productos (' + added + ' nuevos desde POS)',
            'success'
          );
        });
      });
    }

    installRecetaComboboxUi();
    bindResumenRowInputs(root, seed);
    initMargenGlobalControls(root, seed);

    var platoSel = root.querySelector('#crozzoDemoPlatoSel');
    if (platoSel && platoSel.tagName === 'SELECT' && !platoSel._bound) {
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
        persistRecetaPlato(root, seed);
      });
    }
    var saveRecFoot = document.getElementById('crozzoRecetaSaveFoot');
    if (saveRecFoot && !saveRecFoot._bound) {
      saveRecFoot._bound = true;
      saveRecFoot.addEventListener('click', function () {
        persistRecetaPlato(root, seed);
      });
    }

    var probarRec = document.getElementById('crozzoRecetaProbar');
    if (probarRec && !probarRec._bound) {
      probarRec._bound = true;
      probarRec.addEventListener('click', function () {
        probarRecetaPlato(root, seed);
      });
    }

    var syncPed = document.getElementById('crozzoRecetaSyncPedidos');
    if (syncPed && !syncPed._bound) {
      syncPed._bound = true;
      syncPed.addEventListener('click', function () {
        persistRecetaPlato(root, seed);
        var eng = global.CrozzoPedidosInternosEngine;
        var n = eng && eng.recalcAllFromRecipes ? eng.recalcAllFromRecipes() : 0;
        toast('Pedidos internos sincronizados (' + n + ' MPs por receta)', 'success');
      });
    }

    root.querySelectorAll('[data-receta-vista]').forEach(function (btn) {
      if (btn._bound || btn.tagName !== 'BUTTON') return;
      btn._bound = true;
      btn.addEventListener('click', function () {
        var platoRoot = root.querySelector('.crozzo-receta-plato');
        if (platoRoot) switchRecetaVista(platoRoot, btn.getAttribute('data-receta-vista') || 'edicion');
      });
    });

    var progAdd = root.querySelector('#crozzoRecetaProgAdd');
    if (progAdd && !progAdd._bound) {
      progAdd._bound = true;
      progAdd.addEventListener('click', function () {
        programarRecetaPlato(root, seed);
      });
    }
    var progRun = root.querySelector('#crozzoRecetaProgRun');
    if (progRun && !progRun._bound) {
      progRun._bound = true;
      progRun.addEventListener('click', function () {
        var C = global.CrozzoCatalogoMp;
        var n = C && C.ejecutarProgramacionesRecetasPendientes ? C.ejecutarProgramacionesRecetasPendientes() : 0;
        if (n > 0) {
          invalidateSeed();
          loadSeed(function (fresh) {
            hub.seed = fresh;
            refreshRecetaPlatoPanel(root, fresh);
            refreshMatrizResumenTable(root, fresh);
            refreshMatrizHistorialPanel(root, fresh);
            toast(n + ' programación(es) de receta aplicada(s)', 'success');
          });
        } else {
          toast('No hay programaciones de receta pendientes para hoy', 'info');
        }
      });
    }

    var edicionPanel = getRecetaEdicionPanel(root);
    var edScope = edicionPanel || root;

    edScope.querySelectorAll('[data-demo-cant]').forEach(function (inp) {
      if (inp._bound) return;
      inp._bound = true;
      inp.addEventListener('change', function () {
        recalcDemoReceta(root, seed, { previewOnly: true });
      });
    });

    edScope.querySelectorAll('[data-receta-opt]').forEach(function (inp) {
      if (inp._bound || inp.disabled) return;
      if (inp.getAttribute('data-receta-opt') === 'precioVenta') return;
      inp._bound = true;
      inp.addEventListener('change', function () {
        if (inp._silent) return;
        if (inp.getAttribute('data-receta-opt') === 'margenErrorPct') {
          var slugMargen = getActiveRecetaSlug(seed);
          var CM = global.CrozzoCatalogoMp;
          var recMargen = CM && CM.getRecetaPlato ? CM.getRecetaPlato(slugMargen) : null;
          if (CM && CM.upsertRecetaPlato && recMargen) {
            CM.upsertRecetaPlato(
              {
                slug: slugMargen,
                producto: recMargen.producto,
                lineas: recMargen.lineas,
                opts: Object.assign({}, recMargen.opts, { margenErrorManual: true }),
              },
              { skipEvent: true }
            );
          }
        }
        recalcDemoReceta(root, seed, { previewOnly: true });
      });
    });

    bindRecetaPrecioVentaSync(root, seed);

    var pesoAuto = edScope.querySelector('[data-receta-peso-auto]');
    if (pesoAuto && !pesoAuto._bound) {
      pesoAuto._bound = true;
      pesoAuto.addEventListener('change', function () {
        var porcInp = edScope.querySelector('[data-receta-opt="porciones"]');
        var slugAct = getActiveRecetaSlug(seed);
        var merged = getRecetaOptsMerged(
          global.CrozzoCatalogoMp && global.CrozzoCatalogoMp.getRecetaPlato
            ? global.CrozzoCatalogoMp.getRecetaPlato(slugAct)
            : null,
          seed,
          slugAct
        );
        var manual = resolvePorcionesManual(merged);
        if (pesoAuto.checked) {
          if (porcInp) {
            var cur = Number(porcInp.value);
            if (isFinite(cur) && cur > 0) manual = cur;
            porcInp.disabled = true;
          }
          merged.porcionesManual = manual;
          merged.pesoAuto = true;
        } else {
          merged.pesoAuto = false;
          merged.porciones = manual;
          if (porcInp) {
            porcInp.value = String(manual);
            porcInp.disabled = false;
          }
        }
        var lineasAct = collectRecetaLineasFromDom(root, seed);
        setRecetaDraft(slugAct, lineasAct, merged);
        recalcDemoReceta(root, seed, { previewOnly: true });
      });
    }

    edScope.querySelectorAll('[data-receta-action]').forEach(function (btn) {
      if (btn._bound) return;
      btn._bound = true;
      btn.addEventListener('click', function () {
        var e = engine();
        var calc = recalcDemoReceta(root, seed, { previewOnly: true });
        if (!calc || !e) return;
        var precioInp = root.querySelector('[data-receta-opt="precioVenta"]');
        if (!precioInp) return;
        var action = btn.getAttribute('data-receta-action');
        var val = 0;
        if (action === 'usar-sugerido') val = calc.precioSugerido;
        else if (action === 'usar-con-imp') val = calc.precioConImpuesto;
        else if (action === 'redondear-100') {
          val = e.redondearPrecioMenu(Number(precioInp.value) || calc.precioSugerido, 100);
        }
        if (val > 0) {
          precioInp.value = String(Math.round(val));
          var slugAct = getActiveRecetaSlug(seed);
          syncPrecioVentaRecetaToMatriz(root, seed, slugAct, val, { save: false });
          recalcDemoReceta(root, seed, { previewOnly: true, skipPrecioMatrizSync: true });
          toast('Precio de venta actualizado (simulación)', 'info');
        }
      });
    });

    edScope.querySelectorAll('[data-receta-del]').forEach(function (btn) {
      if (btn._bound) return;
      btn._bound = true;
      btn.addEventListener('click', function () {
        var tr = btn.closest('tr[data-demo-line]');
        if (tr) tr.remove();
        recalcDemoReceta(root, seed, { previewOnly: true });
      });
    });

    updateRecetaDirtyBadge(root, !!(getRecetaDraft(getActiveRecetaSlug(seed)) && getRecetaDraft(getActiveRecetaSlug(seed)).dirty));
  }

  function applyPendingMatrizTab(root) {
    if (!root) return;
    var tab = global.__crozzoCostosMatrizTab;
    var openMp = !!global.__crozzoCostosOpenNewMp;
    if (openMp && !tab) tab = 'costeo-mp';
    if (tab) {
      var btn = root.querySelector('[data-matriz-tab="' + tab + '"]');
      if (btn) {
        global.__crozzoCostosMatrizTab = null;
        btn.click();
      }
    }
    if (global.__crozzoCostosOpenNewPlato) {
      global.__crozzoCostosOpenNewPlato = null;
      var demoActive = root.querySelector('[data-matriz-panel="demo"]');
      var onRecetas = demoActive && demoActive.classList.contains('active');
      var platoForm = root.querySelector(
        onRecetas ? '#crozzoRecetaNewProdNewForm' : '#crozzoCostosNewProdNewForm'
      );
      if (platoForm) {
        if (typeof global.crozzoTogglePlatoCreateForm === 'function') global.crozzoTogglePlatoCreateForm(platoForm, true);
        else platoForm.classList.add('is-open');
      }
    }
    if (global.__crozzoCostosOpenNewMp) {
      global.__crozzoCostosOpenNewMp = null;
      setTimeout(function () {
        var costeoPanel = root.querySelector('[data-matriz-panel="costeo-mp"]');
        if (costeoPanel && global.CrozzoMatrizMp && global.CrozzoMatrizMp.openNewMpForm) {
          global.CrozzoMatrizMp.openNewMpForm(costeoPanel, 'crozzoCosteoMp');
        }
      }, 120);
    }
    if (tab === 'demo') {
      setTimeout(function () {
        var anchor = document.getElementById('crozzoRecetasEstandarPrep');
        if (anchor && anchor.scrollIntoView) anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
    }
  }

  function bindCostosNewPlatoForm(root, seed) {
    if (!root) return;
    var toggle = root.querySelector('#crozzoCostosToggleNewPlato');
    if (toggle && !toggle._bound) {
      toggle._bound = true;
      toggle.addEventListener('click', function () {
        var f = root.querySelector('#crozzoCostosNewProdNewForm');
        if (f && typeof global.crozzoTogglePlatoCreateForm === 'function') global.crozzoTogglePlatoCreateForm(f);
        else if (f) f.classList.toggle('is-open');
      });
    }
    var cancel = root.querySelector('#crozzoCostosNewProdCancel');
    if (cancel && !cancel._bound) {
      cancel._bound = true;
      cancel.addEventListener('click', function () {
        var f = root.querySelector('#crozzoCostosNewProdNewForm');
        if (f && typeof global.crozzoTogglePlatoCreateForm === 'function') global.crozzoTogglePlatoCreateForm(f, false);
        else if (f) f.classList.remove('is-open');
      });
    }
    var save = root.querySelector('#crozzoCostosNewProdSave');
    if (save && !save._bound) {
      save._bound = true;
      save.addEventListener('click', function () {
        if (typeof global.addCatalogProduct !== 'function') {
          toast('No disponible', 'error');
          return;
        }
        var nextId = Number(save.getAttribute('data-next-id') || 0);
        global.addCatalogProduct(nextId, { prefix: 'crozzoCostosNewProd', fromCostos: true });
      });
    }
    if (!root._costosPlatoCreatedBound) {
      root._costosPlatoCreatedBound = true;
      document.addEventListener('crozzo-costos-plato-created', function (ev) {
        if (!root.isConnected) return;
        var slug = ev && ev.detail && ev.detail.slug;
        ensureMatrizMenuCompleto(function (fresh) {
          hub.seed = fresh;
          refreshMatrizResumenTable(root, fresh);
          if (slug) {
            hub.recetaSlug = String(slug);
            refreshRecetaPlatoPanel(root, fresh);
          }
        });
      });
    }
  }

  function bindRecetaNewPlatoForm(root) {
    if (!root) return;
    var demoPanel = root.querySelector('[data-matriz-panel="demo"]');
    if (!demoPanel) return;
    var toggle = demoPanel.querySelector('#crozzoRecetaToggleNewPlato');
    if (toggle && !toggle._bound) {
      toggle._bound = true;
      toggle.addEventListener('click', function () {
        var f = demoPanel.querySelector('#crozzoRecetaNewProdNewForm');
        if (f && typeof global.crozzoTogglePlatoCreateForm === 'function') global.crozzoTogglePlatoCreateForm(f);
        else if (f) f.classList.toggle('is-open');
      });
    }
    var cancel = demoPanel.querySelector('#crozzoRecetaNewProdCancel');
    if (cancel && !cancel._bound) {
      cancel._bound = true;
      cancel.addEventListener('click', function () {
        var f = demoPanel.querySelector('#crozzoRecetaNewProdNewForm');
        if (f && typeof global.crozzoTogglePlatoCreateForm === 'function') global.crozzoTogglePlatoCreateForm(f, false);
        else if (f) f.classList.remove('is-open');
      });
    }
    var save = demoPanel.querySelector('#crozzoRecetaNewProdSave');
    if (save && !save._bound) {
      save._bound = true;
      save.addEventListener('click', function () {
        if (typeof global.addCatalogProduct !== 'function') {
          toast('No disponible', 'error');
          return;
        }
        var nextId = Number(save.getAttribute('data-next-id') || 0);
        global.addCatalogProduct(nextId, { prefix: 'crozzoRecetaNewProd', fromCostos: true });
      });
    }
  }

  function bindRecetaExpertoToggle(root, seed) {
    if (!root || root._recetaExpertoBound) return;
    root._recetaExpertoBound = true;
    root.addEventListener('click', function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest('#crozzoRecetaToggleExperto') : null;
      if (!btn) return;
      global.__crozzoCostosRecetaExperto = !global.__crozzoCostosRecetaExperto;
      refreshRecetaPlatoPanel(root, seed || hub.seed);
    });
  }

  function openRecetasEstandar(opts) {
    opts = opts || {};
    global.__crozzoCostosMatrizTab = 'demo';
    if (opts.slug) hub.recetaSlug = String(opts.slug);
    if (typeof global.navigateTo === 'function') global.navigateTo('costos-matriz');
  }

  function initMatrizAllPanels(root, seed) {
    if (!root || root.querySelector('.crozzo-matriz-loading')) return;
    seed = seed || hub.seed;
    initMatrizGerenciaPanel(root, seed);
    bindMatrizResumenAcciones(root);
    bindRevisionAdmin(root, seed);
    bindPerdidasProcesoAdmin(root);
    bindCostosNewPlatoForm(root, seed);
    bindRecetaNewPlatoForm(root);
    if (global.CrozzoCostosBulkImport && global.CrozzoCostosBulkImport.bindBulkBar) {
      global.CrozzoCostosBulkImport.bindBulkBar(root, function () {
        invalidateSeed();
        ensureMatrizMenuCompleto(function (fresh) {
          hub.seed = fresh;
          refreshMatrizResumenTable(root, fresh);
          refreshRecetaPlatoPanel(root, fresh);
        });
      });
    }
    bindRecetaExpertoToggle(root, seed);
    var costeoPanel = root.querySelector('[data-matriz-panel="costeo-mp"]');
    if (costeoPanel && global.CrozzoCosteoMp && global.CrozzoCosteoMp.init) {
      global.CrozzoCosteoMp.init(costeoPanel);
    }
    applyPendingMatrizTab(root);
  }

  function renderMatrizAsync() {
    hub.matrizLoadGen = (hub.matrizLoadGen || 0) + 1;
    var loadGen = hub.matrizLoadGen;
    var cachedSeed = hub.seed && hub.seed.version >= 4 ? hub.seed : null;

    ensureMatrizMenuCompleto(function (fresh) {
      commitMatrizPanel(fresh, loadGen);
    });

    if (cachedSeed) {
      try {
        return renderMatrizPanel(cachedSeed);
      } catch (e) {
        console.warn('[costos] renderMatrizPanel cache', e);
      }
    }
    return matrizLoadingHtml();
  }

  function renderPlaceholder(title, phase, formula) {
    return (
      '<div class="crozzo-costos-hub">' +
      '<header class="crozzo-costos-hero"><h1>' + esc(title) + '</h1>' +
      '<p>Fase de implementación: <strong>' + esc(phase) + '</strong>. La estructura y conexiones ya están listas.</p></header>' +
      (formula ? '<div class="crozzo-costos-formula">' + formula + '</div>' : '') +
      '<div class="crozzo-costos-placeholder">Próximo paso: pantalla detallada de este flujo. Use el menú lateral de Costos.</div></div>'
    );
  }

  function render(view) {
    injectStyles();
    registerDefaultListeners();
    view = view || hub.view || 'matriz';
    if (view === 'map') view = 'matriz';
    hub.view = view;
    if (view === 'planilla-feed') return renderFeedPanel();
    if (view === 'matriz') return renderMatrizAsync();
    if (view === 'inventario') return renderInventarioPanel();
    if (view === 'reservorio') return renderReservorioPanel();
    return renderMatrizAsync();
  }

  function bindRoot(root) {
    if (!root || root._costosBound) return;
    root._costosBound = true;
    root.addEventListener('click', function (e) {
      if (e.target.id === 'crozzoCostosGoPlanilla') {
        global.__crozzoPlanillaTab = 'cola';
        goPage('planilla-2026');
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
      var fok = e.target.closest('.crozzo-feed-ok');
      if (fok) {
        global.__crozzoPlanillaTab = 'cola';
        toast('Volcar el pago en Planillas → Cola pagos', 'info');
        goPage('planilla-2026');
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
          btn.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        root.querySelectorAll('[data-matriz-panel]').forEach(function (panel) {
          panel.classList.toggle('active', panel.getAttribute('data-matriz-panel') === tabId);
        });
        if (tabId === 'resumen' || tabId === 'demo' || tabId === 'costeo-mp') {
          if (!root.querySelector('.crozzo-matriz-loading')) initMatrizAllPanels(root, hub.seed);
        }
      }
    });
  }

  function bindViewOnRender(root) {
    if (hub.view === 'matriz' && root) initMatrizAllPanels(root, hub.seed);
    if (hub.view === 'inventario' && root) initInventarioPanel(root);
  }

  function bindMatrizOnRender(root) {
    if (!root || root.querySelector('.crozzo-matriz-loading')) return;
    bindViewOnRender(root);
  }

  function init(view) {
    injectStyles();
    registerDefaultListeners();
    syncRevisionBodyClass();
    var root = document.getElementById('mainContent');
    if (root) {
      bindRoot(root);
      bindMatrizOnRender(root);
    }
    hub.view = view || 'matriz';
    if (hub.view === 'map') hub.view = 'matriz';
  }

  function teardown() {
    hub.bound = false;
  }

  function pageToView(page) {
    if (page === 'sistema-costos' || page === 'costos-matriz') return 'matriz';
    if (page === 'costos-inventario') return 'inventario';
    if (page === 'costos-planilla-feed') return 'planilla-feed';
    if (page === 'costos-reservorio') return 'reservorio';
    return 'matriz';
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
    openRecetasEstandar: openRecetasEstandar,
    openCostosMatrizTab: openCostosMatrizTab,
    buildInventarioSnapshot: buildInventarioSnapshot,
    inventarioItemsForPrint: inventarioItemsForPrint,
    filterInventarioItems: filterInventarioItems,
    printInventarioDocument: printInventarioDocument,
    printInventarioConteo: printInventarioConteo,
    printInventarioStock: printInventarioStock,
    printInventarioCompleto: printInventarioCompleto,
    printInventarioMovs: printInventarioMovs,
    previewInventarioConteo: previewInventarioConteo,
    pickInventarioPrintOutput: pickInventarioPrintOutput,
    inventarioSavedPrintOutput: inventarioSavedPrintOutput,
    refreshInventarioPrintGuide: refreshInventarioPrintGuide,
    downloadInventarioHtml: downloadInventarioHtml,
    getRevisionActiva: getRevisionActiva,
    iniciarRevisionCostos: iniciarRevisionCostos,
    cerrarRevisionCostos: cerrarRevisionCostos,
  };

  global.renderSistemaCostos = function (view) { return render(view); };
  global.initSistemaCostos = init;
  global.crozzoCostosPageToView = pageToView;
  global.crozzoNavigateToRecetasEstandar = function (opts) {
    if (global.CrozzoSistemaCostos && global.CrozzoSistemaCostos.openRecetasEstandar) {
      global.CrozzoSistemaCostos.openRecetasEstandar(opts || {});
      return;
    }
    global.__crozzoCostosMatrizTab = 'demo';
    if (typeof global.navigateTo === 'function') global.navigateTo('costos-matriz');
  };
  global.crozzoSistemaCostosTeardown = teardown;
  global.crozzoCostosEmit = emit;
})(window);


/* --- CrozzoCostosReportesPdf.js --- */

/**
 * Crozzo POS — Reportes PDF de costos (resumen general + detalle MP/recetas).
 */
(function (global) {
  'use strict';

  var PAGE_W = 210;
  var PAGE_H = 297;
  var M = 14;
  var CONTENT_W = PAGE_W - M * 2;
  var FOOTER_Y = PAGE_H - 10;

  var C_GOLD = [201, 169, 98];
  var C_DARK = [24, 29, 39];
  var C_MUTED = [100, 116, 139];
  var C_RED = [220, 38, 38];
  var C_GREEN = [22, 163, 74];
  var C_SLATE = [148, 163, 184];
  var C_BG = [248, 250, 252];
  var C_BORDER = [226, 232, 240];

  var _pdfBusy = false;

  function loadScriptOnce(src) {
    return new Promise(function (resolve, reject) {
      var base = String(src || '').split('?')[0];
      var tag = document.querySelector('script[data-crozzo-jspdf="' + base + '"]');
      if (tag && tag.getAttribute('data-ready') === '1') {
        resolve();
        return;
      }
      if (tag) {
        tag.addEventListener('load', function () {
          resolve();
        });
        tag.addEventListener('error', function () {
          reject(new Error('No se pudo cargar ' + src));
        });
        return;
      }
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.setAttribute('data-crozzo-jspdf', base);
      s.onload = function () {
        s.setAttribute('data-ready', '1');
        resolve();
      };
      s.onerror = function () {
        reject(new Error('No se pudo cargar ' + src));
      };
      document.head.appendChild(s);
    });
  }

  function resolveJsPdfCtor() {
    if (global.jspdf && global.jspdf.jsPDF) return global.jspdf.jsPDF;
    if (global.jsPDF) return global.jsPDF;
    return null;
  }

  function loadJsPdf() {
    var ctor = resolveJsPdfCtor();
    if (ctor) return Promise.resolve(ctor);
    return loadScriptOnce('vendor/CrozzoJsPdf.js').then(function () {
      var c = resolveJsPdfCtor();
      if (c) return c;
      return loadScriptOnce(
        'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
      ).then(function () {
        var c2 = resolveJsPdfCtor();
        if (c2) return c2;
        throw new Error('jsPDF no está disponible');
      });
    });
  }

  function toast(msg, type) {
    try {
      if (typeof global.showToast === 'function') global.showToast(msg, type || 'info');
    } catch (_) {}
  }

  function fmtMoney(n) {
    var v = Math.round(Number(n) || 0);
    return '$' + v.toLocaleString('es-CO');
  }

  function fmtMoneyDec(n, dec) {
    dec = dec == null ? 2 : dec;
    var v = Number(n) || 0;
    return (
      '$' +
      v.toLocaleString('es-CO', {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec,
      })
    );
  }

  function fmtPct(n) {
    if (n == null || !isFinite(n)) return '—';
    return (Math.round(Number(n) * 10) / 10) + '%';
  }

  function fileStamp() {
    var d = new Date();
    return (
      d.getFullYear() +
      String(d.getMonth() + 1).padStart(2, '0') +
      String(d.getDate()).padStart(2, '0') +
      '_' +
      String(d.getHours()).padStart(2, '0') +
      String(d.getMinutes()).padStart(2, '0')
    );
  }

  function isTauriEnv() {
    return !!(global.__CROZZO_IS_TAURI__ || (global.__TAURI__ && global.__TAURI__.core));
  }

  function tauriInvoke(cmd, args) {
    var t = global.__TAURI__;
    if (t && t.core && typeof t.core.invoke === 'function') return t.core.invoke(cmd, args);
    if (t && typeof t.invoke === 'function') return t.invoke(cmd, args);
    return Promise.reject(new Error('Tauri no disponible'));
  }

  function tauriSavedPath(res) {
    if (!res) return '';
    return String(res.saved_path || res.savedPath || '').trim();
  }

  function openSavedPdfPath(path) {
    if (!path || !isTauriEnv()) return;
    tauriInvoke('plugin:opener|open_path', { path: path }).catch(function () {});
  }

  function triggerDownload(blob, filename) {
    try {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        URL.revokeObjectURL(url);
        a.remove();
      }, 400);
      return true;
    } catch (e) {
      console.error('[costos-pdf]', e);
      return false;
    }
  }

  function pdfDocToBase64(doc) {
    try {
      if (doc && typeof doc.output === 'function') {
        var uri = doc.output('datauristring');
        var comma = String(uri || '').indexOf(',');
        if (comma >= 0) {
          var b64 = String(uri).slice(comma + 1);
          if (b64.length > 100) return Promise.resolve(b64);
        }
      }
    } catch (e) {
      console.warn('[costos-pdf] datauri sync', e);
    }
    return new Promise(function (resolve) {
      try {
        var blob = doc.output('blob');
        if (!blob || !blob.size) {
          resolve('');
          return;
        }
        var reader = new FileReader();
        reader.onload = function () {
          var raw = String(reader.result || '');
          var comma = raw.indexOf(',');
          resolve(comma >= 0 ? raw.slice(comma + 1) : '');
        };
        reader.onerror = function () {
          resolve('');
        };
        reader.readAsDataURL(blob);
      } catch (err) {
        console.error('[costos-pdf] blob read', err);
        resolve('');
      }
    });
  }

  /** Una sola vía de guardado — evita descargas duplicadas. */
  function savePdfDoc(doc, filename) {
    filename = String(filename || 'reporte.pdf');
    return pdfDocToBase64(doc).then(function (b64) {
      if (!b64) {
        return { ok: false, error: new Error('No se pudo serializar el PDF') };
      }
      if (isTauriEnv()) {
        return tauriInvoke('crozzo_save_pdf_b64', {
          pdfB64: b64,
          filename: filename,
        }).then(function (res) {
          var path = tauriSavedPath(res);
          if (res && res.ok && path) {
            openSavedPdfPath(path);
            return {
              ok: true,
              mode: 'tauri-downloads',
              hint: 'PDF guardado en Descargas:\n' + path,
              savedPath: path,
            };
          }
          throw new Error((res && res.message) || 'No se pudo guardar en Descargas');
        });
      }
      try {
        var blob = doc.output('blob');
        if (triggerDownload(blob, filename)) {
          return {
            ok: true,
            mode: 'download',
            hint: 'PDF descargado: ' + filename,
          };
        }
      } catch (e) {
        console.error('[costos-pdf] download', e);
        return { ok: false, error: e };
      }
      return { ok: false, error: new Error('No se pudo iniciar la descarga') };
    });
  }

  function empresaNombre() {
    try {
      if (global.config && typeof global.config.getEmpresa === 'function') {
        var emp = global.config.getEmpresa();
        if (emp && emp.nombre) return String(emp.nombre).trim();
      }
    } catch (_) {}
    return 'Crozzo POS';
  }

  function precioPosProducto(row) {
    if (!row || row.posProductId == null) return null;
    var prods =
      typeof global.products !== 'undefined' && Array.isArray(global.products) ? global.products : [];
    for (var i = 0; i < prods.length; i++) {
      if (prods[i] && prods[i].id === row.posProductId) {
        return Math.round(Number(prods[i].precio) || 0);
      }
    }
    return null;
  }

  function getHistorialVigente(menuRow, periodoVigente) {
    if (!menuRow || !Array.isArray(menuRow.historialCosteo)) return null;
    return (
      menuRow.historialCosteo.find(function (h) {
        return h && h.periodo === periodoVigente;
      }) || null
    );
  }

  function collectReportData(done) {
    var C = global.CrozzoCatalogoMp;
    var E = global.CrozzoCostosEngine;
    var resolveCosto = global.CrozzoCostosResolveCostoVentaMenu;
    if (!C || !C.ensureReady) {
      done(null, 'Catálogo MP no disponible');
      return;
    }
    C.ensureReady(function () {
      try {
        try {
          if (global.CrozzoCostosSyncMenuDesdeFuentes && C.buildSeedForCostos) {
            global.CrozzoCostosSyncMenuDesdeFuentes(C.buildSeedForCostos(), { force: false });
          }
        } catch (syncErr) {
          console.warn('[costos-pdf] sync previo', syncErr);
        }
        var seed = C.buildSeedForCostos ? C.buildSeedForCostos() : { resumen: [] };
        var pv = C.PERIODO_COSTEO_VIGENTE || 'vigente';
        var store = C.buildPreciosStore ? C.buildPreciosStore() : {};
        var productos = [];
        var subieron = [];
        var bajaron = [];
        var sinCambio = [];

        (seed.resumen || []).forEach(function (row) {
          if (!row || !String(row.producto || '').trim()) return;
          var menuRow = C.getMenuPlato ? C.getMenuPlato(row.slug) : null;
          var tipo = row.tipoCosteo === 'directo' ? 'directo' : 'receta';
          var pack = {
            slug: row.slug,
            producto: row.producto,
            tipoCosteo: tipo,
            categoria: row.categoria || '',
          };
          var rowPack = Object.assign({}, row, pack);
          var costoLive = resolveCosto ? resolveCosto(rowPack, seed) : 0;
          var costoActual =
            costoLive > 0 ? costoLive : Math.round(Number(row.costoMp) || 0);
          var vig = menuRow ? getHistorialVigente(menuRow, pv) : null;
          var costoGuardado = vig
            ? Math.round(Number(vig.costoMp) || 0)
            : Math.round(Number((menuRow && menuRow.costoMp) || row.costoMp) || 0);
          var costoAnterior =
            vig && vig.costoMpAnterior != null ? Math.round(Number(vig.costoMpAnterior)) : null;
          var precioCaja = precioPosProducto(menuRow || row);
          var precioMenu = Math.round(Number((menuRow && menuRow.precioVenta) || row.precioVenta) || 0);
          var margenReal = null;
          if (E && precioMenu > 0) {
            var r = E.calcularResumen(costoActual, precioMenu);
            margenReal = Math.round(r.pctUtilidad * 1000) / 10;
          }
          var ref = costoAnterior != null ? costoAnterior : costoGuardado;
          var delta = costoActual - ref;
          var deltaPct = ref > 0 ? (delta / ref) * 100 : null;
          var tendencia = 'eq';
          if (Math.abs(delta) >= 1) tendencia = delta > 0 ? 'up' : 'down';

          var item = {
            producto: row.producto,
            tipo: tipo,
            costoActual: costoActual,
            costoGuardado: costoGuardado,
            costoAnterior: costoAnterior,
            precioCaja: precioCaja,
            precioMenu: precioMenu,
            margenReal: margenReal,
            delta: delta,
            deltaPct: deltaPct,
            tendencia: tendencia,
          };
          productos.push(item);
          if (tendencia === 'up') subieron.push(item);
          else if (tendencia === 'down') bajaron.push(item);
          else sinCambio.push(item);
        });

        productos.sort(function (a, b) {
          return String(a.producto).localeCompare(String(b.producto), 'es');
        });

        var mps = (C.list ? C.list() : []).map(function (it) {
          var und = String(it.und || 'GR').toUpperCase();
          var precioUnit = Number(it.precioUnit) || 0;
          if (E && E.precioUnitarioMp && (und === 'UNI' || und === 'UND')) {
            precioUnit = Math.round(Number(it.precioTotal) || 0);
          }
          return {
            id: it.id,
            nombre: it.nombre,
            categoria: it.categoria || '',
            und: und,
            peso: Number(it.peso) || 0,
            precioTotal: Math.round(Number(it.precioTotal) || 0),
            precioUnit: precioUnit,
            proveedor: it.proveedor || it.proveedorNombre || '',
          };
        });

        var recetas = [];
        (C.listRecetasPlatos ? C.listRecetasPlatos() : []).forEach(function (rec) {
          if (!rec || !rec.slug) return;
          var lineasCalc = (rec.lineas || []).map(function (ln) {
            var costoU = 0;
            if (ln.costoXUnidad != null) costoU = Number(ln.costoXUnidad);
            else if (E && E.resolverCostoUnitario) {
              var nom = ln.ingrediente;
              if (ln.mpId && C.get) {
                var mp = C.get(ln.mpId);
                if (mp && mp.nombre) nom = mp.nombre;
              }
              costoU = E.resolverCostoUnitario(nom, store);
            }
            var cant = Number(ln.cantidad) || 0;
            return {
              ingrediente: ln.ingrediente || '',
              mpId: ln.mpId || '',
              unidad: ln.unidad || ln.und || 'GR',
              cantidad: cant,
              costoUnit: costoU,
              subtotal: Math.round(cant * costoU),
            };
          });
          var costoTotal = 0;
          if (E && lineasCalc.length) {
            var calc = E.calcularReceta(
              lineasCalc.map(function (l) {
                return {
                  ingrediente: l.ingrediente,
                  unidad: l.unidad,
                  cantidad: l.cantidad,
                  costoXUnidad: l.costoUnit,
                };
              }),
              rec.opts || {}
            );
            costoTotal = calc ? Math.round(Number(calc.costoReferencia) || 0) : 0;
          } else {
            lineasCalc.forEach(function (l) {
              costoTotal += l.subtotal;
            });
          }
          recetas.push({
            slug: rec.slug,
            producto: rec.producto || rec.slug,
            lineas: lineasCalc,
            costoTotal: costoTotal,
            opts: rec.opts || {},
          });
        });
        recetas.sort(function (a, b) {
          return String(a.producto).localeCompare(String(b.producto), 'es');
        });

        var sumCosto = 0;
        var sumVenta = 0;
        productos.forEach(function (p) {
          sumCosto += p.costoActual;
          sumVenta += p.precioMenu;
        });

        done({
          meta: {
            empresa: empresaNombre(),
            fecha: new Date().toLocaleString('es-CO'),
            fechaCorta: new Date().toLocaleDateString('es-CO'),
            totalProductos: productos.length,
            subieron: subieron.length,
            bajaron: bajaron.length,
            sinCambio: sinCambio.length,
            sumCosto: sumCosto,
            sumVenta: sumVenta,
            margenGlobal: sumVenta > 0 ? ((sumVenta - sumCosto) / sumVenta) * 100 : 0,
          },
          productos: productos,
          subieron: subieron,
          bajaron: bajaron,
          mps: mps,
          recetas: recetas,
        });
      } catch (err) {
        done(null, err && err.message ? err.message : String(err));
      }
    });
  }

  function createPdfDoc(jsPDF) {
    var doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    var page = 1;
    var y = M;

    function footer() {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor.apply(doc, C_MUTED);
      doc.text('Crozzo POS · Sistema de costos · Confidencial', M, FOOTER_Y);
      doc.text('Pág. ' + page, PAGE_W - M, FOOTER_Y, { align: 'right' });
    }

    function checkSpace(need, redraw) {
      if (y + need <= FOOTER_Y - 6) return;
      footer();
      doc.addPage();
      page++;
      y = M + 6;
      if (typeof redraw === 'function') redraw();
    }

    function drawReportHeader(title, subtitle, metaLine) {
      doc.setFillColor.apply(doc, C_DARK);
      doc.roundedRect(M, 10, CONTENT_W, 32, 3, 3, 'F');
      doc.setFillColor.apply(doc, C_GOLD);
      doc.rect(M, 10, CONTENT_W, 2.5, 'F');
      doc.setTextColor.apply(doc, C_GOLD);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.text(title, M + 5, 22);
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(subtitle, M + 5, 29);
      if (metaLine) {
        doc.setFontSize(7.5);
        doc.setTextColor(200, 210, 220);
        var metaLines = doc.splitTextToSize(String(metaLine), CONTENT_W - 10);
        doc.text(metaLines, M + 5, 35);
      }
      y = 48;
    }

    function sectionTitle(txt) {
      checkSpace(14);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor.apply(doc, C_DARK);
      doc.text(txt, M, y);
      y += 4;
      doc.setDrawColor.apply(doc, C_GOLD);
      doc.setLineWidth(0.5);
      doc.line(M, y, PAGE_W - M, y);
      y += 7;
    }

    function drawKpiCards(cards) {
      checkSpace(24);
      var gap = 3;
      var cw = (CONTENT_W - gap * (cards.length - 1)) / cards.length;
      var y0 = y;
      cards.forEach(function (c, i) {
        var x = M + i * (cw + gap);
        doc.setFillColor.apply(doc, C_BG);
        doc.setDrawColor.apply(doc, C_BORDER);
        doc.roundedRect(x, y0, cw, 20, 2, 2, 'FD');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor.apply(doc, C_MUTED);
        doc.text(c.label, x + 4, y0 + 6);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(c.large ? 12 : 10);
        doc.setTextColor.apply(doc, C_DARK);
        var valLines = doc.splitTextToSize(String(c.value), cw - 8);
        doc.text(valLines[0], x + 4, y0 + 14);
        if (c.sub) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6);
          doc.setTextColor.apply(doc, C_MUTED);
          doc.text(c.sub, x + 4, y0 + 18);
        }
      });
      y = y0 + 24;
    }

    function drawTrendChart(meta) {
      var total = meta.subieron + meta.bajaron + meta.sinCambio;
      if (!total) return;
      checkSpace(32);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor.apply(doc, C_DARK);
      doc.text('Variación de costos MP (menú)', M, y);
      y += 5;
      var segments = [
        { label: 'Subieron', n: meta.subieron, color: C_RED },
        { label: 'Bajaron', n: meta.bajaron, color: C_GREEN },
        { label: 'Sin cambio', n: meta.sinCambio, color: C_SLATE },
      ];
      var barH = 10;
      var x = M;
      segments.forEach(function (seg) {
        if (!seg.n) return;
        var w = (seg.n / total) * CONTENT_W;
        doc.setFillColor.apply(doc, seg.color);
        doc.rect(x, y, Math.max(w, 1.2), barH, 'F');
        x += w;
      });
      y += barH + 5;
      var lx = M;
      segments.forEach(function (seg) {
        doc.setFillColor.apply(doc, seg.color);
        doc.roundedRect(lx, y, 3, 3, 0.5, 0.5, 'F');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(55, 55, 55);
        var pct = total > 0 ? Math.round((seg.n / total) * 100) : 0;
        doc.text(seg.label + ' ' + seg.n + ' (' + pct + '%)', lx + 5, y + 2.5);
        lx += 58;
      });
      y += 10;
    }

    function drawTopCostBars(items, limit) {
      limit = limit || 8;
      var top = items
        .slice()
        .sort(function (a, b) {
          return b.costoActual - a.costoActual;
        })
        .slice(0, limit);
      if (!top.length) return;
      checkSpace(12 + top.length * 7);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor.apply(doc, C_DARK);
      doc.text('Top platos por costo MP actual', M, y);
      y += 6;
      var maxVal = top[0].costoActual || 1;
      var labelW = 52;
      var barX = M + labelW + 2;
      var barMaxW = CONTENT_W - labelW - 28;
      top.forEach(function (p) {
        checkSpace(8);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(45, 45, 45);
        var nameLines = doc.splitTextToSize(truncate(p.producto, 32), labelW);
        doc.text(nameLines[0], M, y);
        var bw = Math.max(2, (p.costoActual / maxVal) * barMaxW);
        doc.setFillColor.apply(doc, C_GOLD);
        doc.roundedRect(barX, y - 3.2, bw, 4.5, 1, 1, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.text(fmtMoney(p.costoActual), PAGE_W - M, y, { align: 'right' });
        y += 7;
      });
      y += 4;
    }

    function drawTableHead(cols) {
      checkSpace(11);
      doc.setFillColor.apply(doc, C_DARK);
      doc.rect(M, y, CONTENT_W, 8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(255, 255, 255);
      cols.forEach(function (c) {
        doc.text(c.label, c.x, y + 5.5, { align: c.align || 'left' });
      });
      y += 10;
    }

    function truncate(txt, max) {
      txt = String(txt || '');
      return txt.length > max ? txt.slice(0, max - 1) + '…' : txt;
    }

    return {
      doc: doc,
      getY: function () {
        return y;
      },
      setY: function (ny) {
        y = ny;
      },
      checkSpace: checkSpace,
      drawReportHeader: drawReportHeader,
      sectionTitle: sectionTitle,
      drawKpiCards: drawKpiCards,
      drawTrendChart: drawTrendChart,
      drawTopCostBars: drawTopCostBars,
      drawTableHead: drawTableHead,
      truncate: truncate,
      footer: footer,
      nextRow: function (cells, opts) {
        opts = opts || {};
        var minH = opts.rowH || 6;
        checkSpace(minH + 4, null);
        var rowTop = y;
        var maxH = minH;
        cells.forEach(function (c) {
          if (c.maxW) {
            var linesPre = doc.splitTextToSize(String(c.text), c.maxW);
            maxH = Math.max(maxH, minH + (linesPre.length - 1) * 3.4);
          }
        });
        if (opts.zebra) {
          doc.setFillColor.apply(doc, C_BG);
          doc.rect(M, rowTop - 4, CONTENT_W, maxH + 1, 'F');
        }
        cells.forEach(function (c) {
          doc.setFont('helvetica', c.bold ? 'bold' : 'normal');
          doc.setFontSize(c.size || 7);
          if (c.color) doc.setTextColor.apply(doc, c.color);
          else doc.setTextColor(40, 40, 40);
          if (c.maxW) {
            var lines = doc.splitTextToSize(String(c.text), c.maxW);
            lines.forEach(function (ln, li) {
              doc.text(ln, c.x, rowTop + li * 3.4, { align: c.align || 'left' });
            });
          } else {
            doc.text(String(c.text), c.x, rowTop, { align: c.align || 'left' });
          }
        });
        y = rowTop + maxH + 1;
      },
    };
  }

  var COL_MENU = {
    prod: { x: M + 1, w: 46 },
    actual: { x: M + 50, w: 22 },
    guard: { x: M + 74, w: 22 },
    ant: { x: M + 98, w: 20 },
    delta: { x: M + 120, w: 20 },
    caja: { x: M + 142, w: 22 },
    marg: { x: M + 166, w: 16 },
    trend: { x: PAGE_W - M - 1, w: 8 },
  };

  function buildGeneralPdf(data, jsPDF) {
    var pb = createPdfDoc(jsPDF);
    var meta = data.meta;
    pb.drawReportHeader(
      'Reporte general de costos',
      meta.empresa,
      'Generado ' +
        meta.fecha +
        ' · ' +
        meta.totalProductos +
        ' productos · Margen global ' +
        fmtPct(meta.margenGlobal)
    );

    pb.drawKpiCards([
      { label: 'Productos en menú', value: String(meta.totalProductos) },
      { label: 'Costo MP total', value: fmtMoney(meta.sumCosto) },
      { label: 'Venta menú total', value: fmtMoney(meta.sumVenta) },
      {
        label: 'Margen global',
        value: fmtPct(meta.margenGlobal),
        sub: 'sobre venta',
        large: true,
      },
    ]);

    pb.drawTrendChart(meta);
    pb.drawTopCostBars(data.productos, 8);

    pb.sectionTitle('Menú — costo actual vs guardado');
    pb.drawTableHead([
      { label: 'PRODUCTO', x: COL_MENU.prod.x },
      { label: 'ACTUAL', x: COL_MENU.actual.x + COL_MENU.actual.w, align: 'right' },
      { label: 'GUARD.', x: COL_MENU.guard.x + COL_MENU.guard.w, align: 'right' },
      { label: 'ANT.', x: COL_MENU.ant.x + COL_MENU.ant.w, align: 'right' },
      { label: 'Δ', x: COL_MENU.delta.x + COL_MENU.delta.w, align: 'right' },
      { label: 'CAJA', x: COL_MENU.caja.x + COL_MENU.caja.w, align: 'right' },
      { label: 'MARG', x: COL_MENU.marg.x + COL_MENU.marg.w, align: 'right' },
      { label: '↕', x: COL_MENU.trend.x, align: 'right' },
    ]);

    data.productos.forEach(function (p, i) {
      var arrow = p.tendencia === 'up' ? '↑' : p.tendencia === 'down' ? '↓' : '=';
      var deltaTxt =
        p.delta != null && Math.abs(p.delta) >= 1
          ? (p.delta > 0 ? '+' : '') + fmtMoney(p.delta)
          : '—';
      var deltaColor = p.tendencia === 'up' ? C_RED : p.tendencia === 'down' ? C_GREEN : [40, 40, 40];
      pb.nextRow(
        [
          { text: p.producto, x: COL_MENU.prod.x, maxW: COL_MENU.prod.w },
          { text: fmtMoney(p.costoActual), x: COL_MENU.actual.x + COL_MENU.actual.w, align: 'right' },
          { text: fmtMoney(p.costoGuardado), x: COL_MENU.guard.x + COL_MENU.guard.w, align: 'right' },
          {
            text: p.costoAnterior != null ? fmtMoney(p.costoAnterior) : '—',
            x: COL_MENU.ant.x + COL_MENU.ant.w,
            align: 'right',
          },
          { text: deltaTxt, x: COL_MENU.delta.x + COL_MENU.delta.w, align: 'right', color: deltaColor },
          {
            text: p.precioCaja != null ? fmtMoney(p.precioCaja) : '—',
            x: COL_MENU.caja.x + COL_MENU.caja.w,
            align: 'right',
          },
          { text: fmtPct(p.margenReal), x: COL_MENU.marg.x + COL_MENU.marg.w, align: 'right' },
          {
            text: arrow,
            x: COL_MENU.trend.x,
            align: 'right',
            color: p.tendencia === 'up' ? C_RED : p.tendencia === 'down' ? C_GREEN : C_SLATE,
            bold: true,
          },
        ],
        { zebra: i % 2 === 1, rowH: 5.5 }
      );
    });

    function listBlock(title, items) {
      if (!items.length) return;
      pb.sectionTitle(title + ' (' + items.length + ')');
      items.slice(0, 35).forEach(function (p, i) {
        pb.nextRow(
          [
            { text: p.producto, x: M, maxW: 90 },
            {
              text:
                fmtMoney(p.costoAnterior != null ? p.costoAnterior : p.costoGuardado) +
                '  →  ' +
                fmtMoney(p.costoActual),
              x: PAGE_W - M,
              align: 'right',
            },
          ],
          { zebra: i % 2 === 1 }
        );
      });
      if (items.length > 35) {
        pb.nextRow([{ text: '… y ' + (items.length - 35) + ' productos más', x: M }]);
      }
    }

    listBlock('Platos con costo al alza', data.subieron);
    listBlock('Platos con costo a la baja', data.bajaron);

    pb.checkSpace(16);
    pb.sectionTitle('Notas metodológicas');
    pb.nextRow([
      {
        text: 'Actual = costeo en tiempo real (MP unitario + recetas). Guardado = costeo vigente archivado.',
        x: M,
        maxW: CONTENT_W,
      },
    ]);
    pb.nextRow([
      {
        text: 'Δ compara contra el costo anterior registrado o, si no existe, contra el guardado.',
        x: M,
        maxW: CONTENT_W,
      },
    ]);

    pb.footer();
    return savePdfDoc(pb.doc, 'costos_resumen_' + fileStamp() + '.pdf');
  }

  function buildDetalladoPdf(data, jsPDF) {
    var pb = createPdfDoc(jsPDF);
    var meta = data.meta;

    pb.drawReportHeader(
      'Reporte detallado de costos',
      meta.empresa,
      'Materia prima · Recetas · Menú · ' + meta.fechaCorta
    );

    pb.drawKpiCards([
      { label: 'Insumos MP', value: String(data.mps.length) },
      { label: 'Recetas', value: String(data.recetas.length) },
      { label: 'Platos menú', value: String(meta.totalProductos) },
      { label: 'Margen global', value: fmtPct(meta.margenGlobal) },
    ]);

    pb.sectionTitle('1. Materia prima — costeo unitario');
    pb.drawTableHead([
      { label: 'INSUMO', x: M + 1 },
      { label: 'UND', x: M + 58 },
      { label: 'REF.', x: M + 72, align: 'right' },
      { label: 'P. LOTE', x: M + 98, align: 'right' },
      { label: '$/UND', x: M + 128, align: 'right' },
      { label: 'CATEGORÍA', x: M + 152 },
    ]);

    data.mps.forEach(function (it, i) {
      var ref =
        it.und === 'UNI' || it.und === 'UND'
          ? '1 u'
          : it.peso > 0
            ? it.peso + ' ' + it.und
            : '—';
      var unitLabel =
        it.und === 'GR' || it.und === 'ML'
          ? fmtMoneyDec(it.precioUnit, 4)
          : fmtMoney(it.precioUnit);
      pb.nextRow(
        [
          { text: it.nombre, x: M + 1, maxW: 54 },
          { text: it.und, x: M + 58 },
          { text: ref, x: M + 72, align: 'right' },
          { text: fmtMoney(it.precioTotal), x: M + 98, align: 'right' },
          { text: unitLabel, x: M + 128, align: 'right' },
          { text: it.categoria, x: M + 152, maxW: 38 },
        ],
        { zebra: i % 2 === 1, rowH: 5.5 }
      );
    });

    data.recetas.forEach(function (rec, ri) {
      pb.checkSpace(28);
      pb.sectionTitle('2.' + (ri + 1) + ' Receta — ' + pb.truncate(rec.producto, 42));
      pb.nextRow([
        { text: 'Costo referencia plato:', x: M },
        {
          text: fmtMoney(rec.costoTotal),
          x: PAGE_W - M,
          align: 'right',
          bold: true,
        },
      ]);
      pb.setY(pb.getY() + 2);
      pb.drawTableHead([
        { label: 'INGREDIENTE', x: M + 1 },
        { label: 'CANT.', x: M + 88, align: 'right' },
        { label: 'UND', x: M + 98 },
        { label: '$/U', x: M + 118, align: 'right' },
        { label: 'SUBTOTAL', x: PAGE_W - M, align: 'right' },
      ]);
      rec.lineas.forEach(function (ln, li) {
        pb.checkSpace(8);
        pb.nextRow(
          [
            { text: ln.ingrediente, x: M + 1, maxW: 82 },
            { text: String(ln.cantidad), x: M + 88, align: 'right' },
            { text: ln.unidad, x: M + 98 },
            { text: fmtMoneyDec(ln.costoUnit, 2), x: M + 118, align: 'right' },
            { text: fmtMoney(ln.subtotal), x: PAGE_W - M, align: 'right' },
          ],
          { zebra: li % 2 === 1, rowH: 5.5 }
        );
      });
      pb.setY(pb.getY() + 4);
    });

    if (!data.recetas.length) {
      pb.nextRow([{ text: 'No hay recetas definidas en el catálogo.', x: M }]);
    }

    pb.checkSpace(22);
    pb.sectionTitle('3. Menú — venta vs costo actual');
    pb.drawTopCostBars(data.productos, 6);
    pb.drawTableHead([
      { label: 'PLATO', x: M + 1 },
      { label: 'TIPO', x: M + 72 },
      { label: 'COSTO', x: M + 98, align: 'right' },
      { label: 'VENTA', x: M + 128, align: 'right' },
      { label: 'MARG%', x: PAGE_W - M, align: 'right' },
    ]);
    data.productos.forEach(function (p, i) {
      pb.nextRow(
        [
          { text: p.producto, x: M + 1, maxW: 66 },
          { text: p.tipo === 'directo' ? 'Directo' : 'Receta', x: M + 72 },
          { text: fmtMoney(p.costoActual), x: M + 98, align: 'right' },
          { text: fmtMoney(p.precioMenu), x: M + 128, align: 'right' },
          { text: fmtPct(p.margenReal), x: PAGE_W - M, align: 'right' },
        ],
        { zebra: i % 2 === 1, rowH: 5.5 }
      );
    });

    pb.footer();
    return savePdfDoc(pb.doc, 'costos_detallado_' + fileStamp() + '.pdf');
  }

  function handlePdfResult(result, okLabel) {
    if (result && result.ok) {
      toast(result.hint || okLabel, 'success');
    } else if (result && result.blockedPopup) {
      toast('Permita descargas en el navegador e intente de nuevo.', 'warning');
    } else {
      toast(
        (result && result.error && result.error.message) ||
          'No se pudo guardar el PDF — revise la consola (F12)',
        'error'
      );
    }
  }

  function runPdfBuild(buildFn, jsPDF, okLabel) {
    collectReportData(function (data, err) {
      if (!data) {
        _pdfBusy = false;
        toast(err || 'No hay datos para el reporte', 'error');
        return;
      }
      try {
        var result = buildFn(data, jsPDF);
        Promise.resolve(result)
          .then(function (r) {
            _pdfBusy = false;
            handlePdfResult(r, okLabel);
          })
          .catch(function (ex) {
            _pdfBusy = false;
            console.error('[costos-pdf] save', ex);
            toast('Error al guardar PDF: ' + (ex.message || ex), 'error');
          });
      } catch (ex) {
        _pdfBusy = false;
        console.error('[costos-pdf] build', ex);
        toast('Error al generar PDF: ' + (ex.message || ex), 'error');
      }
    });
  }

  function downloadGeneral() {
    if (_pdfBusy) {
      toast('Ya hay un PDF en proceso…', 'warning');
      return;
    }
    if (!global.CrozzoCatalogoMp) {
      toast('Abra primero Sistema de costos (catálogo no listo)', 'error');
      return;
    }
    _pdfBusy = true;
    toast('Generando PDF resumen…', 'info');
    loadJsPdf()
      .then(function (jsPDF) {
        runPdfBuild(buildGeneralPdf, jsPDF, 'PDF resumen listo');
      })
      .catch(function (e) {
        _pdfBusy = false;
        console.error('[costos-pdf]', e);
        toast(e.message || 'Error cargando jsPDF', 'error');
      });
  }

  function downloadDetallado() {
    if (_pdfBusy) {
      toast('Ya hay un PDF en proceso…', 'warning');
      return;
    }
    if (!global.CrozzoCatalogoMp) {
      toast('Abra primero Sistema de costos (catálogo no listo)', 'error');
      return;
    }
    _pdfBusy = true;
    toast('Generando PDF detallado…', 'info');
    loadJsPdf()
      .then(function (jsPDF) {
        runPdfBuild(buildDetalladoPdf, jsPDF, 'PDF detallado listo');
      })
      .catch(function (e) {
        _pdfBusy = false;
        console.error('[costos-pdf]', e);
        toast(e.message || 'Error cargando jsPDF', 'error');
      });
  }

  global.CrozzoCostosReportesPdf = {
    collectReportData: collectReportData,
    downloadGeneral: downloadGeneral,
    downloadDetallado: downloadDetallado,
  };
})(window);

