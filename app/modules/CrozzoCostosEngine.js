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
