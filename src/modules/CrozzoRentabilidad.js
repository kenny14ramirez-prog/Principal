/**
 * Crozzo — CMV + Rentabilidad (H2.C)
 * --------------------------------------------------------------------------
 * Cierra el círculo del costeo. El sistema SABE el costo de cada plato
 * (cascada MP→plato→matriz impecable), pero NO lo consolidaba en la venta.
 * El dueño no veía cuánto ganó.
 *
 * Este módulo:
 *  1. CMV por factura: al cobrar, calcula el costo de mercancía vendida
 *  2. Rentabilidad por período: agrega CMV + utilidad por día/semana/categoría/plato
 *  3. KPI diario: ingresos, CMV, utilidad, margen %, mejor/peor plato
 *
 * Aditivo: NO toca la cascada existente. Solo lee lo que ya calculó
 * (costoUnitario de movimientos / catálogo).
 *
 * Psicología: el dueño SIENTE que el sistema "sabe" cuánto ganó → confianza.
 *
 * Doc: estudio de campo H2 (punto ciego #3: sin CMV/utilidad por factura)
 */
(function (global) {
  'use strict';

  /**
   * Calcula el CMV (costo de mercancía vendida) de una factura.
   * Usa el costoUnitario del catálogo MP (cascada) o un campo explícito por línea.
   * @param {object} factura { items, total }
   * @returns {{cmv, utilidadBruta, margenPct, lineas: []}}
   */
  function calcularCmvFactura(factura) {
    if (!factura || !Array.isArray(factura.items)) {
      return { cmv: 0, utilidadBruta: Number(factura && factura.total) || 0, margenPct: 1, lineas: [] };
    }
    var lineasCmv = [];
    var cmv = 0;
    factura.items.forEach(function (line) {
      var qty = Number(line.cantidad || line.qty) || 0;
      var precio = Number(line.precio) || 0;
      // Costo unitario: priorizar campo explícito, luego catálogo, luego MP
      var costoUnit = Number(line.costoUnitario);
      if (!costoUnit || Number.isNaN(costoUnit)) {
        costoUnit = resolverCostoUnitario(line);
      }
      var costoLinea = Math.round((costoUnit || 0) * qty);
      var precioLinea = Math.round(precio * qty);
      cmv += costoLinea;
      lineasCmv.push({
        id: line.id || line.sku,
        nombre: line.nombre || '',
        cantidad: qty,
        precioUnitario: precio,
        costoUnitario: costoUnit || 0,
        costoLinea: costoLinea,
        precioLinea: precioLinea,
        utilidadLinea: precioLinea - costoLinea,
        margenLineaPct: precioLinea > 0 ? (precioLinea - costoLinea) / precioLinea : 0
      });
    });
    var total = Number(factura.total) || lineasCmv.reduce(function (s, l) { return s + l.precioLinea; }, 0);
    var utilidadBruta = total - cmv;
    var margenPct = total > 0 ? utilidadBruta / total : 0;
    return { cmv: cmv, utilidadBruta: utilidadBruta, margenPct: margenPct, total: total, lineas: lineasCmv };
  }

  /**
   * Resuelve el costo unitario de una línea desde el catálogo MP o catálogo POS.
   * Lee la cascada existente (no recalcula).
   */
  function resolverCostoUnitario(line) {
    // 1. Costo explícito en la línea (snapshot)
    if (typeof line.costoUnitario === 'number' && !Number.isNaN(line.costoUnitario)) return line.costoUnitario;
    // 2. Catálogo POS (products global)
    try {
      var prods = (typeof global.crozzoGetProductos === 'function') ? global.crozzoGetProductos() : (typeof products !== 'undefined' ? products : null);
      if (Array.isArray(prods)) {
        var p = prods.find(function (x) { return String(x.id) === String(line.id); });
        if (p && typeof p.costoUnitario === 'number') return p.costoUnitario;
        if (p && typeof p.costo === 'number') return p.costo;
      }
    } catch (_) {}
    // 3. Catálogo MP (recetas — vía CrozzoCostosEngine)
    try {
      if (typeof global.crozzoCostoPlato === 'function') {
        var c = global.crozzoCostoPlato(line.id || line.nombre);
        if (typeof c === 'number' && c > 0) return c;
      }
    } catch (_) {}
    // 4. Sin costo conocido → 0 (no se puede calcular CMV de esa línea)
    return 0;
  }

  /**
   * Enriquece una factura con CMV + utilidad al cobrar.
   * Llamar tras facturar() antes de persistir.
   * @returns {object} factura enriquecida con cmv/utilidadBruta/margenPct
   */
  function enriquecerFacturaConCmv(factura) {
    var r = calcularCmvFactura(factura);
    factura.costoMercanciaVendida = r.cmv;
    factura.utilidadBruta = r.utilidadBruta;
    factura.margenPct = r.margenPct;
    if (!factura.lineasCmv) factura.lineasCmv = r.lineas;
    return factura;
  }

  /**
   * Rentabilidad agregada por rango de fechas.
   * @param {Array} facturas (de config.getFacturas())
   * @param {string} fechaInicio ISO
   * @param {string} fechaFin ISO
   * @returns {{ingresos, cmv, utilidad, margenPct, numFacturas, numFacturasAnuladas}}
   */
  function rentabilidadPor(facturas, fechaInicio, fechaFin) {
    var ini = fechaInicio ? new Date(fechaInicio).getTime() : 0;
    var fin = fechaFin ? new Date(fechaFin).getTime() : Date.now();
    var ingresos = 0, cmv = 0, utilidad = 0, numFacturas = 0, numAnuladas = 0;
    (facturas || []).forEach(function (f) {
      if (f.estado === 'anulada' || f.anulada === true) { numAnuladas++; return; }
      var ts = f.fechaEmision ? new Date(f.fechaEmision).getTime() : (f.timestamp || 0);
      if (ts < ini || ts > fin) return;
      // Asegurar CMV calculado
      if (f.costoMercanciaVendida == null) enriquecerFacturaConCmv(f);
      ingresos += Number(f.total) || 0;
      cmv += Number(f.costoMercanciaVendida) || 0;
      utilidad += Number(f.utilidadBruta != null ? f.utilidadBruta : (f.total - (f.costoMercanciaVendida || 0))) || 0;
      numFacturas++;
    });
    return {
      ingresos: ingresos,
      cmv: cmv,
      utilidad: utilidad,
      margenPct: ingresos > 0 ? utilidad / ingresos : 0,
      numFacturas: numFacturas,
      numFacturasAnuladas: numAnuladas,
      fechaInicio: fechaInicio,
      fechaFin: fechaFin
    };
  }

  /**
   * Rentabilidad por categoría de producto en un rango.
   * @returns {Array} [{categoria, ingresos, cmv, utilidad, margenPct, count}]
   */
  function rentabilidadPorCategoria(facturas, fechaInicio, fechaFin) {
    var ini = fechaInicio ? new Date(fechaInicio).getTime() : 0;
    var fin = fechaFin ? new Date(fechaFin).getTime() : Date.now();
    var cats = {};
    (facturas || []).forEach(function (f) {
      if (f.estado === 'anulada' || f.anulada === true) return;
      var ts = f.fechaEmision ? new Date(f.fechaEmision).getTime() : (f.timestamp || 0);
      if (ts < ini || ts > fin) return;
      var cmvFactura = calcularCmvFactura(f);
      cmvFactura.lineas.forEach(function (l) {
        var cat = resolverCategoriaLinea(l) || 'sin-categoria';
        if (!cats[cat]) cats[cat] = { categoria: cat, ingresos: 0, cmv: 0, utilidad: 0, count: 0 };
        cats[cat].ingresos += l.precioLinea;
        cats[cat].cmv += l.costoLinea;
        cats[cat].utilidad += l.utilidadLinea;
        cats[cat].count += 1;
      });
    });
    var arr = Object.values(cats);
    arr.forEach(function (c) { c.margenPct = c.ingresos > 0 ? c.utilidad / c.ingresos : 0; });
    arr.sort(function (a, b) { return b.utilidad - a.utilidad; });
    return arr;
  }

  /**
   * Rentabilidad por plato/producto en un rango.
   * @param {number} top N top por utilidad (positivos)
   * @param {number} bottom N bottom por margen (los peores)
   * @returns {{top: [], bottom: []}}
   */
  function rentabilidadPorPlato(facturas, fechaInicio, fechaFin, top, bottom) {
    var ini = fechaInicio ? new Date(fechaInicio).getTime() : 0;
    var fin = fechaFin ? new Date(fechaFin).getTime() : Date.now();
    var platos = {};
    (facturas || []).forEach(function (f) {
      if (f.estado === 'anulada' || f.anulada === true) return;
      var ts = f.fechaEmision ? new Date(f.fechaEmision).getTime() : (f.timestamp || 0);
      if (ts < ini || ts > fin) return;
      var cmvFactura = calcularCmvFactura(f);
      cmvFactura.lineas.forEach(function (l) {
        var key = l.id || l.nombre;
        if (!platos[key]) platos[key] = { id: l.id, nombre: l.nombre, ingresos: 0, cmv: 0, utilidad: 0, count: 0 };
        platos[key].ingresos += l.precioLinea;
        platos[key].cmv += l.costoLinea;
        platos[key].utilidad += l.utilidadLinea;
        platos[key].count += 1;
      });
    });
    var arr = Object.values(platos);
    arr.forEach(function (p) { p.margenPct = p.ingresos > 0 ? p.utilidad / p.ingresos : 0; });
    var ordenado = arr.slice().sort(function (a, b) { return b.utilidad - a.utilidad; });
    return {
      top: ordenado.slice(0, top || 5),
      bottom: ordenado.slice(-(bottom || 5)).reverse()
    };
  }

  /**
   * KPI diario: snapshot de rentabilidad de un día específico.
   * @param {Array} facturas
   * @param {string} fecha ISO (solo fecha, sin hora)
   * @returns {object} {fecha, ingresos, cmv, utilidad, margenPct, numFacturas, mejorPlato, peorPlato}
   */
  function kpiDiario(facturas, fecha) {
    var dia = fecha ? fecha.split('T')[0] : new Date().toISOString().split('T')[0];
    var ini = new Date(dia + 'T00:00:00').getTime();
    var fin = new Date(dia + 'T23:59:59').getTime();
    var r = rentabilidadPor(facturas, new Date(ini).toISOString(), new Date(fin).toISOString());
    var platos = rentabilidadPorPlato(facturas, new Date(ini).toISOString(), new Date(fin).toISOString(), 1, 1);
    return Object.assign({}, r, {
      fecha: dia,
      mejorPlato: platos.top[0] || null,
      peorPlato: platos.bottom[0] || null
    });
  }

  function resolverCategoriaLinea(linea) {
    try {
      var prods = (typeof global.crozzoGetProductos === 'function') ? global.crozzoGetProductos() : (typeof products !== 'undefined' ? products : null);
      if (Array.isArray(prods)) {
        var p = prods.find(function (x) { return String(x.id) === String(linea.id); });
        if (p && p.categoria) return p.categoria;
      }
    } catch (_) {}
    return null;
  }

  /**
   * H2.D — puente al semáforo (si CrozzoSemaforoMargen está cargado).
   * @param {object} rentabilidad { margenPct }
   */
  function semaforoDesdeRentabilidad(rentabilidad) {
    var S = global.CrozzoSemaforoMargen;
    if (S && typeof S.semaforoDesdeRentabilidad === 'function') {
      return S.semaforoDesdeRentabilidad(rentabilidad);
    }
    var m = rentabilidad && rentabilidad.margenPct != null ? Number(rentabilidad.margenPct) : 0;
    if (m > 1 && m <= 100) m = m / 100;
    var nivel = m >= 0.65 ? 'verde' : m >= 0.55 ? 'amarillo' : 'rojo';
    var emoji = nivel === 'verde' ? '🟢' : nivel === 'amarillo' ? '🟡' : '🔴';
    return { nivel: nivel, emoji: emoji, label: nivel, margenPct: m };
  }

  global.CrozzoRentabilidad = {
    calcularCmvFactura: calcularCmvFactura,
    enriquecerFacturaConCmv: enriquecerFacturaConCmv,
    rentabilidadPor: rentabilidadPor,
    rentabilidadPorCategoria: rentabilidadPorCategoria,
    rentabilidadPorPlato: rentabilidadPorPlato,
    kpiDiario: kpiDiario,
    semaforoDesdeRentabilidad: semaforoDesdeRentabilidad
  };
})(typeof window !== 'undefined' ? window : globalThis);
