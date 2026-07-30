/**
 * Crozzo — Semáforo de margen 🟢🟡🔴 (H2.D)
 * --------------------------------------------------------------------------
 * Traduce margen de utilidad (kpiDiario / platos) a un semáforo que el dueño
 * entiende sin ser contador. Aditivo: no toca CostosEngine ni la cascada MP.
 *
 * Umbrales default (margen utilidad = utilidad/ingresos):
 *   🟢 verde  ≥ 65%
 *   🟡 amarillo 55–65%
 *   🔴 rojo   < 55%
 *
 * Config opcional (fracción 0–1):
 *   localStorage crozzo_semaforo_verde / crozzo_semaforo_amarillo
 *   o config.get?.().costos.semaforoVerde / semaforoAmarillo
 *
 * Psicología: peek siempre visible en hub admin; detalle al pedir (D-018).
 */
(function (global) {
  'use strict';

  var DEFAULT_VERDE = 0.65;
  var DEFAULT_AMARILLO = 0.55;
  var LS_VERDE = 'crozzo_semaforo_verde';
  var LS_AMARILLO = 'crozzo_semaforo_amarillo';

  function clamp01(n) {
    n = Number(n);
    if (!isFinite(n)) return 0;
    if (n > 1 && n <= 100) n = n / 100; // acepta 65 o 0.65
    if (n < 0) return 0;
    if (n > 1) return 1;
    return n;
  }

  function loadUmbrales() {
    var verde = DEFAULT_VERDE;
    var amarillo = DEFAULT_AMARILLO;
    try {
      var cfg = global.config;
      var costos =
        cfg && typeof cfg.get === 'function'
          ? (cfg.get() || {}).costos
          : cfg && cfg.costos
            ? cfg.costos
            : null;
      if (costos) {
        if (costos.semaforoVerde != null) verde = clamp01(costos.semaforoVerde);
        if (costos.semaforoAmarillo != null) amarillo = clamp01(costos.semaforoAmarillo);
      }
    } catch (_) {}
    try {
      var lv = localStorage.getItem(LS_VERDE);
      var la = localStorage.getItem(LS_AMARILLO);
      if (lv != null && lv !== '') verde = clamp01(lv);
      if (la != null && la !== '') amarillo = clamp01(la);
    } catch (_) {}
    if (amarillo >= verde) amarillo = Math.max(0, verde - 0.1);
    return { verde: verde, amarillo: amarillo };
  }

  /**
   * @param {number} margenPct fracción 0–1 o porcentaje 0–100
   * @returns {{nivel:'verde'|'amarillo'|'rojo', emoji:string, label:string, margenPct:number}}
   */
  function clasificarMargen(margenPct) {
    var m = clamp01(margenPct);
    var u = loadUmbrales();
    var nivel = 'rojo';
    if (m >= u.verde) nivel = 'verde';
    else if (m >= u.amarillo) nivel = 'amarillo';
    var map = {
      verde: { emoji: '🟢', label: 'Sano' },
      amarillo: { emoji: '🟡', label: 'Ajustar' },
      rojo: { emoji: '🔴', label: 'Crítico' }
    };
    return {
      nivel: nivel,
      emoji: map[nivel].emoji,
      label: map[nivel].label,
      margenPct: m,
      umbrales: u
    };
  }

  /**
   * Clasifica lista de platos { nombre, margenPct, ... }.
   * @returns {Array} mismos platos + semáforo
   */
  function semaforoMargen(platos) {
    return (platos || []).map(function (p) {
      var s = clasificarMargen(p && p.margenPct != null ? p.margenPct : 0);
      return Object.assign({}, p, {
        semaforo: s.nivel,
        semaforoEmoji: s.emoji,
        semaforoLabel: s.label,
        margenPct: s.margenPct
      });
    });
  }

  /**
   * Semáforo consolidado del día vía CrozzoRentabilidad.kpiDiario.
   * @returns {object} kpi + semáforo + peores platos en rojo
   */
  function semaforoGlobalDia(facturas, fecha) {
    var R = global.CrozzoRentabilidad;
    var kpi =
      R && typeof R.kpiDiario === 'function'
        ? R.kpiDiario(facturas || [], fecha)
        : {
            fecha: fecha ? String(fecha).split('T')[0] : new Date().toISOString().split('T')[0],
            ingresos: 0,
            cmv: 0,
            utilidad: 0,
            margenPct: 0,
            numFacturas: 0,
            mejorPlato: null,
            peorPlato: null
          };
    var s = clasificarMargen(kpi.margenPct || 0);
    var peores = [];
    if (R && typeof R.rentabilidadPorPlato === 'function' && kpi.fecha) {
      var ini = new Date(kpi.fecha + 'T00:00:00').toISOString();
      var fin = new Date(kpi.fecha + 'T23:59:59').toISOString();
      var por = R.rentabilidadPorPlato(facturas || [], ini, fin, 5, 8);
      peores = semaforoMargen(por.bottom || []).filter(function (p) {
        return p.semaforo === 'rojo';
      });
    }
    return Object.assign({}, kpi, {
      semaforo: s.nivel,
      semaforoEmoji: s.emoji,
      semaforoLabel: s.label,
      umbrales: s.umbrales,
      platosRojos: peores
    });
  }

  /**
   * Desde un objeto rentabilidad/kpi ({ margenPct }).
   */
  function semaforoDesdeRentabilidad(rentabilidad) {
    var m = rentabilidad && rentabilidad.margenPct != null ? rentabilidad.margenPct : 0;
    return clasificarMargen(m);
  }

  /**
   * Precio de venta sugerido para recuperar umbral verde (margen utilidad).
   * Food cost objetivo = 1 - verde. Usa precioParaCostoObjetivo si existe.
   * @returns {{precioSugerido:number, delta:number, costoMp:number}|null}
   */
  function sugerirPrecioParaVerde(costoMp, precioActual) {
    var costo = Number(costoMp) || 0;
    var precio = Number(precioActual) || 0;
    if (costo <= 0) return null;
    var u = loadUmbrales();
    var foodCostPct = Math.round((1 - u.verde) * 1000) / 10; // ej. 35
    var sugerido = null;
    try {
      if (typeof global.precioParaCostoObjetivo === 'function') {
        sugerido = global.precioParaCostoObjetivo(costo, foodCostPct);
      }
    } catch (_) {}
    if (sugerido == null || !isFinite(sugerido)) {
      sugerido = Math.round(costo / (1 - u.verde));
    }
    sugerido = Math.round(Number(sugerido) || 0);
    return {
      precioSugerido: sugerido,
      delta: Math.max(0, sugerido - precio),
      costoMp: Math.round(costo),
      foodCostObjetivoPct: foodCostPct
    };
  }

  /**
   * Mensaje toast cuando un plato cae a rojo tras cascada MP.
   */
  function mensajeAlertaRojo(nombrePlato, costoMp, precioActual) {
    var sug = sugerirPrecioParaVerde(costoMp, precioActual);
    var nombre = String(nombrePlato || 'Plato');
    if (!sug || sug.delta <= 0) {
      return 'Tu plato «' + nombre + '» bajó a 🔴. Revisa precio o receta.';
    }
    return (
      'Tu plato «' +
      nombre +
      '» bajó a 🔴. Sube $' +
      sug.delta.toLocaleString('es-CO') +
      ' (a $' +
      sug.precioSugerido.toLocaleString('es-CO') +
      ') para volver a 🟢.'
    );
  }

  global.CrozzoSemaforoMargen = {
    clasificarMargen: clasificarMargen,
    semaforoMargen: semaforoMargen,
    semaforoGlobalDia: semaforoGlobalDia,
    semaforoDesdeRentabilidad: semaforoDesdeRentabilidad,
    sugerirPrecioParaVerde: sugerirPrecioParaVerde,
    mensajeAlertaRojo: mensajeAlertaRojo,
    loadUmbrales: loadUmbrales,
    DEFAULT_VERDE: DEFAULT_VERDE,
    DEFAULT_AMARILLO: DEFAULT_AMARILLO
  };
})(typeof window !== 'undefined' ? window : globalThis);
