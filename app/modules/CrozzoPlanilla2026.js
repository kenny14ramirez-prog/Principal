/**
 * Planilla 2026 — períodos de corte personalizados, días por fecha, UI con acordeones.
 */
(function (global) {
  'use strict';

  var LS = 'crozzo_planilla_2026_v2';
  var TPL = null;
  var store = { version: 2, periods: {}, activePeriodId: null };

  var state = {
    tab: 'dia',
    activeDate: null,
    feedFilter: 'pendiente',
    feedExpandedId: null,
    ui: {
      conteoOpen: false,
      propinasOpen: false,
      egresosOpen: false,
      egresoMayorOpen: false,
      kpisOpen: null,
      focusMode: false,
      guideMode: true,
      guidePanelOpen: false,
      facturasCargadasOpen: false,
      periodFoldOpen: false
    },
    tplLoaded: false
  };

  var TAB_DEFS = [
    { id: 'dia', label: 'Día a día', labelGuide: 'Mi día', icon: 'calendar-days', hint: 'Cuadre y gastos' },
    { id: 'cola', label: 'Cola pagos', labelGuide: 'Pagos por revisar', icon: 'inbox', hint: 'Desde oficina' },
    { id: 'mes', label: 'Resumen periodo', labelGuide: 'Totales del mes', icon: 'bar-chart-3', hint: 'Vista general' },
    { id: 'nomina', label: 'Turnos y nómina', labelGuide: 'Personal', icon: 'users', hint: 'Horas y nómina' },
    { id: 'archivo', label: 'Excel', labelGuide: 'Archivo Excel', icon: 'file-spreadsheet', hint: 'Importar / exportar' }
  ];

  var EGRESO_TIPOS = [
    { id: 'compra_mp', label: 'Compra materia prima', short: 'Compra MP', hint: 'Inventario / costeo' },
    { id: 'compra_insumo', label: 'Compra insumo', short: 'Insumo', hint: 'Consumible / no inventariado' },
    { id: 'gasto_operativo', label: 'Gasto operativo', short: 'Gasto', hint: 'Operación del local' },
    { id: 'servicio', label: 'Servicio (factura)', short: 'Servicio', hint: 'Factura de servicio' },
    { id: 'pago_servicio', label: 'Pago de servicio', short: 'Pago serv.', hint: 'Agua, luz, internet, software…' },
    { id: 'nomina_laboral', label: 'Nómina / laboral', short: 'Nómina', hint: 'Personal y prestaciones' },
    { id: 'impuesto', label: 'Impuesto / provisión', short: 'Impuesto', hint: 'Tributos y provisiones' },
    { id: 'inversion', label: 'Inversión', short: 'Inversión', hint: 'Activos / inversión' },
    { id: 'otro', label: 'Otro / varios', short: 'Otro', hint: 'Sin clasificar' }
  ];

  var EGRESO_TIPO_CONCEPT_HINTS = {
    compra_mp: [/COMPRAS\s*\(\s*M\.?\s*P\.?\s*\)/i, /COMPRA.*M\.?\s*P/i],
    compra_insumo: [/DESECHABLES/i, /GRANJA/i, /DOTACIÓN/i, /PAPELER/i],
    gasto_operativo: [/DIVERSOS/i, /DOMICILIOS/i, /ASEO/i, /MANTENIMIENTO/i, /TRANSPORTE/i, /MARKETING/i],
    servicio: [/ASESOR/i, /SERVICIO/i, /REPRESENTACION/i],
    pago_servicio: [/SERVICIO DE AGUA/i, /SERVICIO DE ENERG/i, /SERVICIO DE GAS/i, /INTERNET/i, /TELEFON/i, /MENSUALIDAD/i, /SOFTWARE/i, /DATAICO/i],
    nomina_laboral: [/NÓMINA/i, /NOMINA/i, /SEGURIDAD SOCIAL/i, /TURNOS Y H/i, /LIQUIDACION/i, /VACACION/i, /CESANT/i, /PRIMA DE SERVICIOS/i],
    impuesto: [/IMPUESTO/i, /PROVISIÓN/i, /PROVISION/i, /RST/i],
    inversion: [/INVERSIÓN/i, /INVERSION/i]
  };

  var PROP_LABELS = {
    transf: 'Propina transferencia',
    banco: 'Propina banco',
    efectivo: 'Propina efectivo',
    acumTransf: 'Acum. propina transf.',
    acumBanco: 'Acum. propina banco',
    acumEfectivo: 'Acum. propina efectivo',
    facturasEfectivo: 'Facturas en efectivo',
    efectivoReal: 'Efectivo real',
    diferencia: 'Diferencia',
    efectivoPlanilla: 'Efectivo planilla',
    efectivoAnterior: 'Efectivo anterior'
  };

  function esc(s) {
    if (global.CrozzoIntApi && global.CrozzoIntApi.esc) return global.CrozzoIntApi.esc(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function toast(m, t) {
    if (typeof showToast === 'function') showToast(m, t || 'info');
  }

  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }

  function fmtMoney(n) {
    try {
      return num(n).toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
    } catch (_) {
      return '$' + Math.round(num(n));
    }
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      var p = iso.split('-');
      return p[2] + '/' + p[1] + '/' + p[0];
    } catch (_) {
      return iso;
    }
  }

  function addDays(iso, n) {
    var d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function periodId(fi, ff) {
    return 'p_' + fi + '_' + ff;
  }

  function defaultMonthPeriod(d) {
    d = d || new Date();
    var y = d.getFullYear();
    var m = d.getMonth();
    var fi =
      y +
      '-' +
      String(m + 1).padStart(2, '0') +
      '-01';
    var last = new Date(y, m + 1, 0).getDate();
    var ff = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(last).padStart(2, '0');
    return { fi: fi, ff: ff };
  }

  function emptyCuadre() {
    var o = {};
    var campos = (TPL && TPL.cuadreCampos) || ['totalVenta', 'gasto', 'transferencia', 'banco', 'efectivo', 'total', 'diferencia'];
    campos.forEach(function (k) {
      o[k] = 0;
    });
    return o;
  }

  function emptyDay() {
    var denoms = (TPL && TPL.denoms) || ['50000', '20000', '10000', '5000', '2000', '1000', '500', '200', '100', '50'];
    var conteo = {};
    denoms.forEach(function (dn) {
      conteo[dn] = { cantidad: 0, efectivo: 0 };
    });
    return {
      negocio: '',
      cuadreM: emptyCuadre(),
      cuadreT: emptyCuadre(),
      egresosM: [],
      egresosT: [],
      egresoMayor: [],
      propinas: {
        transf: 0,
        banco: 0,
        efectivo: 0,
        acumTransf: 0,
        acumBanco: 0,
        acumEfectivo: 0,
        facturasEfectivo: 0,
        efectivoReal: 0,
        diferencia: 0,
        efectivoPlanilla: 0,
        efectivoAnterior: 0
      },
      conteo: { items: conteo, base: 0, totalEfectivo: 0, totalMenosBase: 0 },
      egresoPropina: { transf: 0, banco: 0, efectivo: 0 },
      cierresPos: [],
      facturasCargadas: [],
      posRecomendado: { totalVenta: 0, facturasCargadas: 0, efectivoEsperado: 0, syncedAt: null }
    };
  }

  function emptyResumen() {
    var r = { totalEgresos: {}, totalKpi: {}, notas: '' };
    (TPL.egresosConceptos || []).forEach(function (c) {
      r.totalEgresos[c] = 0;
    });
    return r;
  }

  function emptyPeriod(fi, ff, nombre) {
    return {
      id: periodId(fi, ff),
      nombre: nombre || '',
      fechaInicio: fi,
      fechaFin: ff,
      negocio: (TPL && TPL.negocioDefault) || '',
      days: {},
      resumen: emptyResumen()
    };
  }

  function migrateFromV1(raw) {
    if (!raw || typeof raw !== 'object') return;
    Object.keys(raw).forEach(function (key) {
      if (key === 'version' || key === 'periods' || key === 'activePeriodId') return;
      if (!/^\d{4}-\d{2}$/.test(key)) return;
      var blob = raw[key];
      if (!blob || !blob.days) return;
      var parts = key.split('-');
      var y = parseInt(parts[0], 10);
      var mo = parseInt(parts[1], 10);
      var last = new Date(y, mo, 0).getDate();
      var fi = key + '-01';
      var ff = key + '-' + String(last).padStart(2, '0');
      var p = emptyPeriod(fi, ff, 'Mes ' + key + ' (importado)');
      p.negocio = blob.negocio || p.negocio;
      p.resumen = blob.totalEgresos
        ? { totalEgresos: blob.totalEgresos, totalKpi: blob.totalKpi || {}, notas: '' }
        : emptyResumen();
      Object.keys(blob.days).forEach(function (dn) {
        var dayNum = parseInt(dn, 10);
        if (!dayNum) return;
        var iso = key + '-' + String(dayNum).padStart(2, '0');
        if (dayNum <= last) p.days[iso] = blob.days[dn];
      });
      store.periods[p.id] = p;
    });
  }

  function loadStore() {
    try {
      var raw = JSON.parse(localStorage.getItem(LS) || '{}');
      if (raw.version === 2 && raw.periods) {
        store.periods = raw.periods;
        store.activePeriodId = raw.activePeriodId;
      } else {
        store = { version: 2, periods: {}, activePeriodId: null };
        migrateFromV1(raw);
        try {
          var v1 = JSON.parse(localStorage.getItem('crozzo_planilla_2026_v1') || '{}');
          migrateFromV1(v1);
        } catch (_) {}
      }
    } catch (_) {
      store = { version: 2, periods: {}, activePeriodId: null };
    }
    if (!store.activePeriodId || !store.periods[store.activePeriodId]) {
      var dm = defaultMonthPeriod();
      var id = periodId(dm.fi, dm.ff);
      if (!store.periods[id]) store.periods[id] = emptyPeriod(dm.fi, dm.ff, 'Mes calendario');
      store.activePeriodId = id;
    }
    if (!state.activeDate) state.activeDate = store.periods[store.activePeriodId].fechaInicio;
  }

  function saveStore() {
    try {
      localStorage.setItem(LS, JSON.stringify(store));
    } catch (_) {
      toast('No se pudo guardar', 'error');
    }
  }

  function period() {
    return store.periods[store.activePeriodId];
  }

  function datesInPeriod(p) {
    p = p || period();
    var out = [];
    if (!p) return out;
    var cur = p.fechaInicio;
    var end = p.fechaFin;
    while (cur && cur <= end) {
      out.push(cur);
      cur = addDays(cur, 1);
      if (out.length > 400) break;
    }
    return out;
  }

  function ensureDay(iso) {
    var p = period();
    if (!p.days[iso]) p.days[iso] = emptyDay();
    return p.days[iso];
  }

  function day() {
    return ensureDay(state.activeDate);
  }

  function periodLabel(p) {
    p = p || period();
    if (!p) return '';
    var name = (p.nombre || '').trim();
    if (name) return name;
    return fmtDate(p.fechaInicio) + ' → ' + fmtDate(p.fechaFin);
  }

  function aggregatePeriod(p) {
    p = p || period();
    var agg = {
      diasConDatos: 0,
      totalVentaM: 0,
      totalVentaT: 0,
      egresosValor: 0,
      conteoEfectivo: 0,
      propinasEfectivo: 0
    };
    datesInPeriod(p).forEach(function (iso) {
      var d = p.days[iso];
      if (!d) return;
      var has =
        num(d.cuadreM.totalVenta) ||
        num(d.cuadreT.totalVenta) ||
        (d.egresosM && d.egresosM.length) ||
        (d.egresosT && d.egresosT.length);
      if (!has) return;
      agg.diasConDatos++;
      agg.totalVentaM += num(d.cuadreM.totalVenta);
      agg.totalVentaT += num(d.cuadreT.totalVenta);
        agg.egresosValor += sumEgresosPagados(d.egresosM) + sumEgresosPagados(d.egresosT) + sumEgresosPagados(d.egresoMayor);
      agg.conteoEfectivo += num(d.conteo && d.conteo.totalEfectivo);
      agg.propinasEfectivo += num(d.propinas && d.propinas.efectivo);
    });
    return agg;
  }

  function sumEgresos(arr) {
    return sumEgresosPagados(arr);
  }

  function normMetodoPago(m) {
    var s = String(m || '')
      .toLowerCase()
      .trim();
    if (!s) return 'por_definir';
    if (s.indexOf('trans') >= 0) return 'transferencia';
    if (s.indexOf('tarj') >= 0 || s.indexOf('card') >= 0 || s.indexOf('dataf') >= 0) return 'tarjeta';
    if (s.indexOf('efec') >= 0 || s.indexOf('cash') >= 0) return 'efectivo';
    if (s.indexOf('credit') >= 0 || s.indexOf('créd') >= 0) return 'credito';
    if (s.indexOf('por_definir') >= 0 || s === 'pendiente' || s.indexOf('proceso') >= 0) return s;
    return s;
  }

  function metodoPagoEgresoOk(metodo) {
    var m = normMetodoPago(metodo);
    return m === 'efectivo' || m === 'tarjeta' || m === 'transferencia' || m === 'credito';
  }

  function lookupOficinaFactura(refId) {
    if (!refId) return null;
    var rv = reservorioFeed();
    if (!rv || !rv.load) return null;
    try {
      var st = rv.load();
      return (st.facturasOficina || []).find(function (f) {
        return f && String(f.id) === String(refId);
      });
    } catch (_) {
      return null;
    }
  }

  function lookupFeedItem(feedId) {
    if (!feedId) return null;
    var rv = reservorioFeed();
    if (!rv || !rv.listFeed) return null;
    var found = null;
    (rv.listFeed(500) || []).some(function (f) {
      if (f && f.id === feedId) {
        found = f;
        return true;
      }
      return false;
    });
    return found;
  }

  function isOficinaFacturaPagada(fac) {
    if (!fac) return false;
    if (String(fac.estado || '').toLowerCase() !== 'pagada') return false;
    return metodoPagoEgresoOk(fac.metodo);
  }

  function isFeedItemPagado(feed) {
    if (!feed) return false;
    if (String(feed.tipo_movimiento || 'egreso').toLowerCase() === 'ingreso') return true;
    var payload = feed.payload || {};
    if (feed.referencia_tipo === 'factura_oficina' || String(feed.origen || '').toLowerCase() === 'oficina') {
      return isOficinaFacturaPagada(payload);
    }
    if (feed.pagoConfirmado === false) return false;
    return feed.pagoConfirmado === true || feed.estado === 'aceptado';
  }

  function isEgresoRowPagado(row) {
    if (!row) return false;
    if (row.pagado === false) return false;
    if (row.refOficina) {
      var fac = lookupOficinaFactura(row.refOficina);
      if (fac) return isOficinaFacturaPagada(fac);
      return false;
    }
    if (row.feedId) {
      var feed = lookupFeedItem(row.feedId);
      if (feed) return isFeedItemPagado(feed);
    }
    if (row.metodoPago && !metodoPagoEgresoOk(row.metodoPago)) return false;
    return row.pagado !== false;
  }

  function filterEgresosPagados(arr) {
    return (arr || []).filter(isEgresoRowPagado);
  }

  function sumEgresosPagados(arr) {
    return filterEgresosPagados(arr).reduce(function (s, r) {
      return s + num(r.valor);
    }, 0);
  }

  function countEgresosPendientes(arr) {
    return (arr || []).filter(function (r) {
      return r && !isEgresoRowPagado(r);
    }).length;
  }

  function ensureTpl(cb) {
    if (TPL && state.tplLoaded) {
      cb();
      return;
    }
    fetch('modules/CrozzoPlanilla2026.template.json')
      .then(function (r) {
        return r.json();
      })
      .then(function (j) {
        TPL = j;
        state.tplLoaded = true;
        cb();
      })
      .catch(function () {
        TPL = {
          negocioDefault: 'QUESO Y CAFÉ',
          denoms: [],
          egresosConceptos: [],
          cuadreCampos: ['propTransf', 'propBanco', 'propEfectivo', 'gasto', 'transferencia', 'banco', 'efectivo', 'total', 'diferencia', 'totalVenta'],
          cuadreLabels: ['PROP. TRANSF.', 'PROP. BANCO', 'PROP. EFECTIVO', 'GASTO', 'TRANSFERENCIA', 'BANCO', 'EFECTIVO', 'TOTAL', 'DIFERENCIA', 'TOTAL VENTA']
        };
        state.tplLoaded = true;
        cb();
      });
  }

  function injectStyles() {
    var el = document.getElementById('crozzo-planilla-css');
    if (!el) {
      el = document.createElement('style');
      el.id = 'crozzo-planilla-css';
      document.head.appendChild(el);
    }
    el.textContent =
      'body.crozzo-page-planillas .main-body,#mainContent.main-body--planillas{padding:0!important;overflow:hidden!important;min-height:0!important;flex:1 1 auto!important;display:flex!important;flex-direction:column!important;background:var(--bg-primary)}' +
      'html.crozzo-vp-ready body.crozzo-page-planillas .main-body,html.crozzo-vp-ready #mainContent.main-body--planillas{overflow:hidden!important}' +
      '.crozzo-pl-app{position:relative;display:flex;flex-direction:column;flex:1;min-height:0;height:100%;max-height:100%;overflow:hidden;background:var(--bg-primary);color:var(--text-primary);font-family:var(--font-sans,system-ui,sans-serif)}' +
      '.crozzo-pl-app::before{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse 70% 45% at 0% 0%,color-mix(in srgb,var(--accent) 14%,transparent),transparent 55%),radial-gradient(ellipse 50% 35% at 100% 0%,color-mix(in srgb,var(--accent) 8%,transparent),transparent 50%);opacity:.9}' +
      '.crozzo-pl-command{position:relative;z-index:2;flex-shrink:0;display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;padding:6px 12px 6px 14px;border-bottom:1px solid var(--border);background:linear-gradient(180deg,color-mix(in srgb,var(--bg-card) 94%,transparent),var(--bg-primary))}' +
      '.crozzo-pl-command__meta{display:flex;align-items:center;gap:8px;min-width:0}' +
      '.crozzo-pl-pill{display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border-radius:999px;font-size:11px;font-weight:600;border:1px solid var(--border);background:var(--bg-card);color:var(--text-secondary);white-space:nowrap}' +
      '.crozzo-pl-pill--accent{border-color:color-mix(in srgb,var(--accent) 35%,var(--border));background:color-mix(in srgb,var(--accent) 12%,var(--bg-card));color:var(--text-primary)}' +
      '.crozzo-pl-period-chip{max-width:min(240px,42vw);overflow:hidden;text-overflow:ellipsis}' +
      '.crozzo-pl-tabs{display:flex;flex:1 1 auto;flex-wrap:wrap;gap:6px;align-items:center;min-width:0}' +
      '.crozzo-pl-tabs button{display:inline-flex;align-items:center;gap:5px;padding:6px 10px;border-radius:8px;border:1px solid transparent;background:transparent;cursor:pointer;font-size:10px;font-weight:600;color:var(--text-muted);font-family:inherit;transition:background .2s,border-color .2s,color .2s}' +
      '.crozzo-pl-tabs button i,.crozzo-pl-tabs button svg{width:14px;height:14px}' +
      '.crozzo-pl-tabs button:hover{color:var(--text-primary);background:var(--bg-secondary)}' +
      '.crozzo-pl-tabs button.active{background:linear-gradient(135deg,color-mix(in srgb,var(--accent) 22%,var(--bg-card)),var(--bg-card));color:var(--text-primary);border-color:color-mix(in srgb,var(--accent) 35%,var(--border));box-shadow:0 2px 10px rgba(0,0,0,.1)}' +
      '.crozzo-pl-command__tools{display:flex;align-items:center;gap:8px;margin-left:auto}' +
      '.crozzo-pl-focus-btn{display:inline-flex;align-items:center;gap:5px;padding:5px 9px;border-radius:8px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-secondary);font-size:10px;font-weight:600;cursor:pointer;font-family:inherit;transition:background .2s,border-color .2s,color .2s}' +
      '.crozzo-pl-focus-btn:hover{color:var(--text-primary);border-color:color-mix(in srgb,var(--accent) 30%,var(--border));background:color-mix(in srgb,var(--accent) 8%,var(--bg-card))}' +
      '.crozzo-pl-app.is-focus .crozzo-pl-command{padding:6px 12px 6px 14px}' +
      '.crozzo-pl-app.is-focus .crozzo-pl-command__meta,.crozzo-pl-app.is-focus .crozzo-pl-focus-btn__lbl{display:none}' +
      '.crozzo-pl-app.is-focus .crozzo-pl-tabs button span{display:none}' +
      '.crozzo-pl-app.is-focus .crozzo-pl-tabs button{padding:8px 10px}' +
      '.crozzo-pl-stage{flex:1;min-height:0;overflow-x:hidden;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding:8px 12px 14px;position:relative;z-index:1}' +
      '.crozzo-pl-root{--pl-gap:8px;display:flex;flex-direction:column;gap:0}' +
      '.crozzo-pl-work{display:flex;flex-direction:column;gap:8px;min-height:0}' +
      '.crozzo-pl-kpis-acc{margin-bottom:var(--pl-gap)}' +
      '.crozzo-pl-kpis-acc summary .crozzo-pl-kpis-mini{font-weight:500;font-size:11px;opacity:.72;margin-left:auto}' +
      '.crozzo-pl-dia-top{position:sticky;top:0;z-index:3;margin:0 0 12px;padding:0 0 10px;background:var(--bg-primary);border-bottom:1px solid color-mix(in srgb,var(--border) 70%,transparent)}' +
      '.crozzo-pl-app.is-guide .crozzo-pl-dia-top{position:static;z-index:auto;margin:0;padding:0;border-bottom:none;background:transparent}' +
      '.crozzo-pl-dia-top .crozzo-pl-toolbar{margin-bottom:8px}' +
      '.crozzo-pl-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;padding:8px 10px;background:color-mix(in srgb,var(--bg-secondary) 80%,var(--bg-card));border:1px solid var(--border);border-radius:10px;margin-bottom:0}' +
      '.crozzo-pl-toolbar .form-group{margin:0;min-width:120px}' +
      '.crozzo-pl-kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-bottom:var(--pl-gap)}' +
      '.crozzo-pl-kpi{padding:14px 16px;border-radius:12px;border:1px solid var(--border);background:linear-gradient(145deg,var(--bg-card),color-mix(in srgb,var(--accent) 6%,var(--bg-card)));transition:transform .2s,box-shadow .2s}' +
      '.crozzo-pl-kpi:hover{transform:translateY(-2px);box-shadow:var(--elevation-2,0 4px 12px rgba(0,0,0,.1))}' +
      '.crozzo-pl-kpi .val{font-size:1.2rem;font-weight:800;font-variant-numeric:tabular-nums}' +
      '.crozzo-pl-kpi .lbl{font-size:10px;opacity:.72;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px}' +
      '.crozzo-pl-grid{display:grid;grid-template-columns:1fr 1fr;gap:var(--pl-gap)}@media(max-width:760px){.crozzo-pl-grid{grid-template-columns:1fr}}' +
      '.crozzo-pl-acc{border:1px solid var(--border);border-radius:10px;margin-bottom:6px;background:var(--bg-card);overflow:hidden;transition:box-shadow .2s}' +
      '.crozzo-pl-acc[open]{box-shadow:var(--elevation-1,0 2px 8px rgba(0,0,0,.06))}' +
      '.crozzo-pl-acc summary{padding:9px 12px;cursor:pointer;font-weight:700;font-size:0.82rem;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:8px;user-select:none;background:color-mix(in srgb,var(--bg-secondary) 50%,transparent)}' +
      '.crozzo-pl-acc summary::-webkit-details-marker{display:none}' +
      '.crozzo-pl-acc summary::after{content:"";width:8px;height:8px;border-right:2px solid var(--text-muted);border-bottom:2px solid var(--text-muted);transform:rotate(-45deg);transition:transform .2s}' +
      '.crozzo-pl-acc[open] summary::after{transform:rotate(45deg)}' +
      '.crozzo-pl-acc__body{padding:0 10px 10px;border-top:1px solid var(--border)}' +
      '.crozzo-pl-cuadre{display:grid;grid-template-columns:minmax(0,1fr) minmax(88px,108px);gap:4px 8px;align-items:center;font-size:11px}' +
      '@media(max-width:560px){.crozzo-pl-cuadre{grid-template-columns:1fr}.crozzo-pl-cuadre input{width:100%!important;max-width:none!important}}' +
      '.crozzo-pl-cuadre .lbl{opacity:.78;font-size:10px;line-height:1.25;word-break:break-word}' +
      '.crozzo-pl-app .form-input,.crozzo-pl-app .crozzo-pl-cuadre input{font-size:12px;padding:5px 8px;min-height:32px}' +
      '.crozzo-pl-app .form-label{font-size:11px;margin-bottom:3px}' +
      '.crozzo-pl-app .btn-sm{padding:5px 10px;font-size:11px;min-height:32px}' +
      '.crozzo-pl-dia-nav{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px}' +
      '.crozzo-pl-badge{font-size:11px;padding:5px 12px;border-radius:999px;background:color-mix(in srgb,var(--accent) 16%,transparent);font-weight:600;border:1px solid color-mix(in srgb,var(--accent) 25%,transparent)}' +
      '.crozzo-pl-mount{min-height:120px;display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:13px}' +
      'html[data-theme="bona-origen"] .crozzo-pl-app{background:var(--bona-cream,#faf9f7)}' +
      '@media(max-width:720px){.crozzo-pl-command{padding:8px 10px}.crozzo-pl-stage{padding:10px 12px 20px}.crozzo-pl-tabs button span{display:none}.crozzo-pl-tabs button{padding:8px 10px}.crozzo-pl-period-chip{max-width:140px}.crozzo-pl-app.is-guide .crozzo-pl-tabs button span{display:inline}.crozzo-pl-app.is-guide .crozzo-pl-tabs button{min-width:calc(50% - 6px);justify-content:center}}' +
      '.crozzo-pl-tab-badge{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;margin-left:2px;border-radius:999px;font-size:10px;font-weight:800;background:color-mix(in srgb,var(--accent) 85%,#000);color:#fff;line-height:1}' +
      '.crozzo-pl-cola-head{margin-bottom:var(--pl-gap)}' +
      '.crozzo-pl-cola-head p{margin:6px 0 0;font-size:12px;color:var(--text-muted);max-width:720px;line-height:1.45}' +
      '.crozzo-pl-cola-filters{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 14px}' +
      '.crozzo-pl-cola-filters button{padding:7px 12px;border-radius:999px;border:1px solid var(--border);background:var(--bg-card);font-size:11px;font-weight:600;cursor:pointer;color:var(--text-secondary);font-family:inherit}' +
      '.crozzo-pl-cola-filters button.active{background:color-mix(in srgb,var(--accent) 18%,var(--bg-card));border-color:color-mix(in srgb,var(--accent) 35%,var(--border));color:var(--text-primary)}' +
      '.crozzo-pl-cola-ref{font-size:11px;color:var(--text-muted)}' +
      '.crozzo-pl-cola-estado{font-size:11px;font-weight:700;text-transform:capitalize}' +
      '.crozzo-pl-cola-estado--pendiente{color:var(--warning,#d97706)}' +
      '.crozzo-pl-cola-estado--aceptado{color:var(--success,#16a34a)}' +
      '.crozzo-pl-cola-estado--rechazado{color:var(--text-muted)}' +
      '.crozzo-pl-cola-actions{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end}' +
      '.crozzo-pl-cola-detail td{background:color-mix(in srgb,var(--bg-secondary) 70%,var(--bg-card));padding:14px 16px!important;border-top:none}' +
      '.crozzo-pl-cola-detail-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px 16px;font-size:12px;margin-bottom:10px}' +
      '.crozzo-pl-cola-detail-grid .lbl{font-size:10px;text-transform:uppercase;opacity:.65;letter-spacing:.06em}' +
      '.crozzo-pl-cola-detail-grid .val{font-weight:700;font-variant-numeric:tabular-nums}' +
      '.crozzo-pl-cola-preview{padding:10px 12px;border-radius:10px;border:1px dashed color-mix(in srgb,var(--accent) 30%,var(--border));background:color-mix(in srgb,var(--accent) 6%,var(--bg-card));font-size:12px}' +
      '.crozzo-pl-cola-orig{display:inline-block;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700;background:var(--bg-secondary)}' +
      '.crozzo-pl-cola-orig--oficina{background:color-mix(in srgb,var(--accent) 14%,var(--bg-card))}' +
      'tr[data-pl-feed-row]{cursor:pointer}tr[data-pl-feed-row]:hover td{background:color-mix(in srgb,var(--accent) 4%,transparent)}' +
      '.crozzo-pl-app.is-guide .crozzo-pl-acc summary{font-size:0.84rem;padding:9px 12px}' +
      '.crozzo-pl-guide{border:1px solid color-mix(in srgb,var(--accent) 22%,var(--border));border-radius:10px;margin:0 0 8px;background:var(--bg-card);position:relative;z-index:1;overflow:hidden}' +
      '.crozzo-pl-guide>summary{padding:8px 12px;cursor:pointer;font-weight:700;font-size:12px;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:8px;background:color-mix(in srgb,var(--accent) 6%,var(--bg-card))}' +
      '.crozzo-pl-guide>summary::-webkit-details-marker{display:none}' +
      '.crozzo-pl-guide>summary::after{content:"";width:7px;height:7px;border-right:2px solid var(--text-muted);border-bottom:2px solid var(--text-muted);transform:rotate(-45deg);flex-shrink:0;transition:transform .2s}' +
      '.crozzo-pl-guide[open]>summary::after{transform:rotate(45deg)}' +
      '.crozzo-pl-guide__inner{padding:0 10px 10px}' +
      '.crozzo-pl-guide__date{font-size:10px;font-weight:600;padding:2px 8px;border-radius:999px;background:color-mix(in srgb,var(--accent) 14%,transparent);white-space:nowrap}' +
      '.crozzo-pl-guide__intro{margin:0 0 8px;font-size:11px;line-height:1.4;color:var(--text-secondary)}' +
      '.crozzo-pl-guide-alert{margin:0 0 8px;padding:6px 10px;border-radius:8px;background:color-mix(in srgb,var(--warning,#d97706) 12%,var(--bg-card));border:1px solid color-mix(in srgb,var(--warning,#d97706) 30%,var(--border));font-size:11px;line-height:1.4}' +
      '.crozzo-pl-guide-alert .btn-link{padding:0;min-height:0;font-weight:700;font-size:11px;vertical-align:baseline}' +
      '.crozzo-pl-steps{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}' +
      '@media(max-width:640px){.crozzo-pl-steps{grid-template-columns:1fr}}' +
      '.crozzo-pl-step{display:flex;flex-direction:row;align-items:center;gap:8px;width:100%;padding:7px 9px;border-radius:8px;border:1px solid var(--border);background:var(--bg-card);cursor:pointer;text-align:left;font-family:inherit;transition:border-color .2s}' +
      '.crozzo-pl-step:hover{border-color:color-mix(in srgb,var(--accent) 40%,var(--border))}' +
      '.crozzo-pl-step.is-done{border-color:color-mix(in srgb,var(--success,#16a34a) 35%,var(--border));background:color-mix(in srgb,var(--success,#16a34a) 6%,var(--bg-card))}' +
      '.crozzo-pl-step__body{display:flex;flex-direction:column;gap:0;min-width:0;flex:1}' +
      '.crozzo-pl-step__num{flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:999px;font-size:10px;font-weight:800;background:color-mix(in srgb,var(--accent) 16%,var(--bg-secondary));color:var(--text-primary)}' +
      '.crozzo-pl-step.is-done .crozzo-pl-step__num{background:color-mix(in srgb,var(--success,#16a34a) 85%,#000);color:#fff}' +
      '.crozzo-pl-step__title{font-size:11px;font-weight:700;color:var(--text-primary);line-height:1.25}' +
      '.crozzo-pl-step__hint{font-size:10px;line-height:1.25;color:var(--text-muted);display:none}' +
      '.crozzo-pl-tip{margin:0 0 8px;padding:6px 10px;border-radius:8px;background:color-mix(in srgb,var(--accent) 7%,var(--bg-secondary));border-left:3px solid color-mix(in srgb,var(--accent) 55%,transparent);font-size:11px;line-height:1.35;color:var(--text-secondary)}' +
      '.crozzo-pl-day-card{border:1px solid var(--border);border-radius:10px;padding:8px 10px;background:var(--bg-card);margin-bottom:0}' +
      '.crozzo-pl-day-card .crozzo-pl-section-title{margin:0 0 8px;font-size:0.9rem}' +
      '.crozzo-pl-dia-nav-row{display:grid;grid-template-columns:auto minmax(120px,1.2fr) auto minmax(120px,1fr);gap:6px;align-items:end}' +
      '.crozzo-pl-dia-local-inline{min-width:0}' +
      '@media(max-width:900px){.crozzo-pl-dia-nav-row{grid-template-columns:auto 1fr auto}.crozzo-pl-dia-local-inline{grid-column:1/-1}}' +
      '.crozzo-pl-dia-local{margin-top:8px;padding-top:8px;border-top:1px solid var(--border)}' +
      '.crozzo-pl-period-fold{margin-bottom:6px}' +
      '.crozzo-pl-app.is-guide .crozzo-pl-command{flex-direction:row;align-items:center;gap:6px;padding:6px 10px}' +
      '.crozzo-pl-app.is-guide .crozzo-pl-command__meta{display:none}' +
      '.crozzo-pl-app.is-guide .crozzo-pl-command__tools{order:0;margin-left:auto;width:auto;gap:6px}' +
      '.crozzo-pl-app.is-guide .crozzo-pl-tabs{width:auto;flex:1;flex-wrap:wrap;gap:4px}' +
      '.crozzo-pl-app.is-guide .crozzo-pl-tabs button{padding:6px 8px;font-size:10px;flex:0 1 auto;min-width:0;justify-content:flex-start}' +
      '.crozzo-pl-section-title{margin:0 0 6px;font-size:0.9rem;font-weight:700;line-height:1.25}' +
      '.crozzo-pl-section-block{margin:0}' +
      '.crozzo-pl-cuadre-card{padding:8px 10px!important;border-radius:10px!important}' +
      '.crozzo-pl-focus-btn.is-on{border-color:color-mix(in srgb,var(--success,#16a34a) 45%,var(--border));background:color-mix(in srgb,var(--success,#16a34a) 10%,var(--bg-card));color:var(--text-primary)}' +
      'body.crozzo-page-planillas .main-header{padding:4px 12px 6px!important}';
  }

  function periodKpisHtml() {
    var agg = aggregatePeriod();
    return (
      '<div class="crozzo-pl-kpis">' +
      '<div class="crozzo-pl-kpi"><div class="lbl">Días con datos</div><div class="val">' +
      agg.diasConDatos +
      '</div></div>' +
      '<div class="crozzo-pl-kpi"><div class="lbl">Venta turnos</div><div class="val">' +
      fmtMoney(agg.totalVentaM + agg.totalVentaT) +
      '</div></div>' +
      '<div class="crozzo-pl-kpi"><div class="lbl">Egresos</div><div class="val">' +
      fmtMoney(agg.egresosValor) +
      '</div></div>' +
      '<div class="crozzo-pl-kpi"><div class="lbl">Efectivo contado</div><div class="val">' +
      fmtMoney(agg.conteoEfectivo) +
      '</div></div>' +
      '</div>'
    );
  }

  function periodKpisBlockHtml() {
    if (state.tab === 'cola') return '';
    if (state.ui.guideMode && state.tab === 'dia') return '';
    var agg = aggregatePeriod();
    var defaultOpen = state.tab !== 'dia' && state.tab !== 'archivo';
    var open = state.ui.kpisOpen != null ? state.ui.kpisOpen : defaultOpen;
    return (
      '<details class="crozzo-pl-acc crozzo-pl-kpis-acc" id="pl-kpis-acc"' +
      (open ? ' open' : '') +
      '>' +
      '<summary><span>Indicadores del periodo</span>' +
      '<span class="crozzo-pl-kpis-mini">' +
      fmtMoney(agg.totalVentaM + agg.totalVentaT) +
      ' · ' +
      agg.diasConDatos +
      ' días</span></summary>' +
      '<div class="crozzo-pl-acc__body">' +
      periodKpisHtml() +
      '</div></details>'
    );
  }

  function renderCommandBar(tabBtns, p) {
    return (
      '<header class="crozzo-pl-command">' +
      '<div class="crozzo-pl-command__meta">' +
      '<span class="crozzo-pl-pill crozzo-pl-pill--accent crozzo-pl-period-chip" title="' +
      esc(periodLabel(p)) +
      '"><i data-lucide="calendar-range" aria-hidden="true"></i> ' +
      esc(periodLabel(p)) +
      '</span></div>' +
      '<nav class="crozzo-pl-tabs" aria-label="Secciones planilla">' +
      tabBtns +
      '</nav>' +
      '<div class="crozzo-pl-command__tools">' +
      '<button type="button" class="crozzo-pl-focus-btn' +
      (state.ui.guideMode ? ' is-on' : '') +
      '" id="pl-guide-toggle" title="' +
      (state.ui.guideMode ? 'Modo guía activo — pasos y textos sencillos' : 'Activar modo guía para aprender paso a paso') +
      '">' +
      '<i data-lucide="hand-helping" aria-hidden="true"></i>' +
      '<span class="crozzo-pl-focus-btn__lbl">' +
      (state.ui.guideMode ? 'Guía ON' : 'Modo guía') +
      '</span></button>' +
      '<button type="button" class="crozzo-pl-focus-btn" id="pl-focus-toggle" title="' +
      (state.ui.focusMode ? 'Salir de modo enfoque' : 'Modo enfoque — más espacio para cuadre') +
      '">' +
      '<i data-lucide="' +
      (state.ui.focusMode ? 'minimize-2' : 'maximize-2') +
      '" aria-hidden="true"></i>' +
      '<span class="crozzo-pl-focus-btn__lbl">' +
      (state.ui.focusMode ? 'Salir' : 'Enfoque') +
      '</span></button></div></header>'
    );
  }

  function renderPeriodToolbarWrap() {
    var inner = renderPeriodToolbar();
    if (!state.ui.guideMode) return inner;
    return (
      '<details class="crozzo-pl-acc crozzo-pl-period-fold"' +
      (state.ui.periodFoldOpen ? ' open' : '') +
      ' id="pl-period-fold" data-pl-acc="pl-period-fold">' +
      '<summary><span>📅 Cambiar mes o quincena (opcional)</span></summary>' +
      '<div class="crozzo-pl-acc__body">' +
      inner +
      '</div></details>'
    );
  }

  function renderGuideStep(n, title, hint, target, done) {
    return (
      '<button type="button" class="crozzo-pl-step' +
      (done ? ' is-done' : '') +
      '" data-pl-jump="' +
      esc(target) +
      '">' +
      '<span class="crozzo-pl-step__num">' +
      (done ? '✓' : n) +
      '</span>' +
      '<span class="crozzo-pl-step__body">' +
      '<span class="crozzo-pl-step__title">' +
      esc(title) +
      '</span>' +
      (hint ? '<span class="crozzo-pl-step__hint">' + esc(hint) + '</span>' : '') +
      '</span></button>'
    );
  }

  function renderGuidePanel() {
    if (!state.ui.guideMode) return '';
    if (state.tab === 'dia') return renderGuideDia();
    if (state.tab === 'cola') return renderGuideCola();
    if (state.tab === 'mes') return renderGuideMes();
    if (state.tab === 'nomina') return renderGuideNomina();
    if (state.tab === 'archivo') return renderGuideArchivo();
    return '';
  }

  function renderGuideDia() {
    var d = day();
    var hasCuadre = num(d.cuadreM.totalVenta) || num(d.cuadreT.totalVenta) || num(d.cuadreM.efectivo) || num(d.cuadreT.efectivo);
    var hasEgresos =
      filterEgresosPagados(d.egresosM).length +
        filterEgresosPagados(d.egresosT).length +
        filterEgresosPagados(d.egresoMayor).length >
      0;
    var hasProp = num(d.propinas.efectivo) || num(d.propinas.banco) || num(d.propinas.transf);
    var hasConteo = num(d.conteo.totalEfectivo) > 0;
    var pending = feedPendingCount();
    var colaExtra = pending
      ? '<div class="crozzo-pl-guide-alert">💡 Hay <strong>' +
        pending +
        '</strong> pago(s) de oficina esperando. Puede revisarlos en <button type="button" class="btn btn-link btn-sm" data-pl-tab-jump="cola">Pagos por revisar</button> y volver aquí.</div>'
      : '';
    return (
      '<details class="crozzo-pl-guide"' +
      (state.ui.guidePanelOpen ? ' open' : '') +
      ' id="pl-guide-panel" data-pl-acc="pl-guide-panel">' +
      '<summary><span>Pasos de hoy — toque para ver</span>' +
      '<span class="crozzo-pl-guide__date">' +
      esc(fmtDate(state.activeDate)) +
      '</span></summary>' +
      '<div class="crozzo-pl-guide__inner">' +
      '<p class="crozzo-pl-guide__intro">Toque un paso para ir directo. En montos puede sumar: <strong>50000+12000</strong>.</p>' +
      colaExtra +
      '<div class="crozzo-pl-steps">' +
      renderGuideStep(2, 'Ventas mañana y tarde', '', 'pl-section-cuadre', hasCuadre) +
      renderGuideStep(3, 'Gastos del día', '', 'pl-acc-egresos', hasEgresos) +
      renderGuideStep(4, 'Propinas', '', 'pl-acc-propinas', hasProp) +
      renderGuideStep(5, 'Contar billetes', '', 'pl-acc-conteo', hasConteo) +
      '</div></div></details>'
    );
  }

  function renderGuideBox(title, intro) {
    return (
      '<details class="crozzo-pl-guide"' +
      (state.ui.guidePanelOpen ? ' open' : '') +
      ' data-pl-acc="pl-guide-panel">' +
      '<summary><span>' +
      esc(title) +
      '</span></summary>' +
      '<div class="crozzo-pl-guide__inner"><p class="crozzo-pl-guide__intro">' +
      intro +
      '</p></div></details>'
    );
  }

  function renderGuideCola() {
    var pending = feedPendingCount();
    return renderGuideBox(
      'Ayuda — pagos de oficina',
      pending
        ? 'Pulse <strong>Aceptar</strong> para pasar el pago al gasto del día. Toque la fila para ver detalle.'
        : 'Cuando pague proveedores en Oficina, los verá aquí.'
    );
  }

  function renderGuideMes() {
    return renderGuideBox('Ayuda — totales del mes', 'Resumen acumulado. Lo diario se llena en <strong>Mi día</strong>.');
  }

  function renderGuideNomina() {
    return renderGuideBox('Ayuda — personal', 'Horas y nómina. Empleados en <strong>Marcación personal</strong>.');
  }

  function renderGuideArchivo() {
    return renderGuideBox('Ayuda — Excel', 'Importar o exportar planilla. Opcional si trabaja solo en pantalla.');
  }

  function jumpToPlSection(id) {
    if (!id) return;
    if (id === 'pl-date-sel') {
      var card = document.getElementById('pl-day-card');
      var sel = document.getElementById(id);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (sel) {
        try {
          sel.focus();
        } catch (_) {}
        sel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }
    var el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === 'DETAILS') el.open = true;
    if (id === 'pl-acc-egresos') state.ui.egresosOpen = true;
    if (id === 'pl-acc-propinas') state.ui.propinasOpen = true;
    if (id === 'pl-acc-conteo') state.ui.conteoOpen = true;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderPeriodToolbar() {
    var p = period();
    var opts = Object.keys(store.periods)
      .map(function (id) {
        var pr = store.periods[id];
        return (
          '<option value="' +
          esc(id) +
          '"' +
          (id === store.activePeriodId ? ' selected' : '') +
          '>' +
          esc(periodLabel(pr)) +
          '</option>'
        );
      })
      .join('');
    return (
      '<div class="crozzo-pl-toolbar">' +
      '<div class="form-group" style="flex:1;min-width:200px">' +
      '<label class="form-label">' +
      (state.ui.guideMode ? 'Periodo que está trabajando' : 'Periodo de corte') +
      '</label>' +
      '<select id="pl-period-sel" class="form-input">' +
      opts +
      '</select></div>' +
      '<div class="form-group"><label class="form-label">Nombre (opcional)</label>' +
      '<input id="pl-period-name" class="form-input" value="' +
      esc(p.nombre || '') +
      '" placeholder="Ej: 10 al 10" /></div>' +
      '<div class="form-group"><label class="form-label">Desde</label>' +
      '<input type="date" id="pl-period-ini" class="form-input" value="' +
      esc(p.fechaInicio) +
      '" /></div>' +
      '<div class="form-group"><label class="form-label">Hasta</label>' +
      '<input type="date" id="pl-period-fin" class="form-input" value="' +
      esc(p.fechaFin) +
      '" /></div>' +
      '<button type="button" class="btn btn-primary btn-sm" id="pl-period-apply">' +
      (state.ui.guideMode ? 'Guardar fechas' : 'Aplicar fechas') +
      '</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="pl-period-new">+ Nuevo periodo</button>' +
      '</div>'
    );
  }

  function renderAccordion(id, title, subtitle, open, inner) {
    var openAttr = open ? ' open' : '';
    return (
      '<details class="crozzo-pl-acc" id="' +
      esc(id) +
      '"' +
      openAttr +
      ' data-pl-acc="' +
      esc(id) +
      '">' +
      '<summary><span>' +
      esc(title) +
      (subtitle ? ' <span style="font-weight:400;opacity:.65;font-size:11px">— ' + esc(subtitle) + '</span>' : '') +
      '</span></summary>' +
      '<div class="crozzo-pl-acc__body">' +
      inner +
      '</div></details>'
    );
  }

  function plUid(prefix) {
    return (prefix || 'pl') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  }

  function getPosFacturasForIso(iso) {
    var list = [];
    try {
      if (typeof config !== 'undefined' && config.getFacturas) list = config.getFacturas() || [];
    } catch (_) {}
    return list.filter(function (f) {
      if (!f) return false;
      var st = String(f.estado || '').toLowerCase();
      if (st !== 'pos' && st !== 'timbrada' && st !== 'demo') return false;
      var d = String(f.fecha || f.fechaEmision || '').slice(0, 10);
      return d === iso;
    });
  }

  function isPosFacturaCargada(f) {
    if (!f) return false;
    if (global.CrozzoCarteraComercial && typeof global.CrozzoCarteraComercial.isPendienteMetodo === 'function') {
      if (global.CrozzoCarteraComercial.isPendienteMetodo(f.metodoPago)) return true;
    }
    var mp = String(f.metodoPago || '').toLowerCase();
    if (mp === 'credito' || mp === 'cartera_pendiente') return true;
    var est = String(f.cobroEstado || '').toLowerCase();
    return (est === 'pendiente' || est === 'parcial') && num(f.saldoPendiente) > 0;
  }

  function posFacturaToCargadaRow(f, extra) {
    extra = extra || {};
    return {
      id: plUid('fc'),
      uuid: f.uuid || '',
      consecutivo: f.consecutivo != null ? String(f.consecutivo) : '',
      cliente: f.compradorNombre || f.clienteNombre || '',
      nit: f.compradorNit || f.clienteNit || '',
      valor: num(f.total),
      metodo: String(f.metodoPago || 'credito').toLowerCase(),
      nota: extra.nota || '',
      fromPos: true,
      manual: false,
      shiftType: extra.shiftType || '',
    };
  }

  function buildPosVentasRecomendado(iso) {
    var facturas = getPosFacturasForIso(iso);
    var total = 0;
    var cargadas = 0;
    var efectivo = 0;
    var items = [];
    facturas.forEach(function (f) {
      var tot = num(f.total);
      total += tot;
      var mp = String(f.metodoPago || '').toLowerCase();
      if (mp === 'efectivo') efectivo += tot;
      else if (mp === 'mixto') efectivo += num(f.paymentMeta && f.paymentMeta.efectivoParte);
      if (isPosFacturaCargada(f)) {
        cargadas += tot;
        items.push(posFacturaToCargadaRow(f));
      }
    });
    return {
      iso: iso,
      totalVenta: total,
      facturasCargadas: cargadas,
      efectivoEsperado: efectivo,
      items: items,
      ventasCount: facturas.length,
    };
  }

  function refreshPosRecomendado(d, iso) {
    if (!d) return null;
    var rec = buildPosVentasRecomendado(iso);
    d.posRecomendado = {
      totalVenta: rec.totalVenta,
      facturasCargadas: rec.facturasCargadas,
      efectivoEsperado: rec.efectivoEsperado,
      ventasCount: rec.ventasCount,
      syncedAt: new Date().toISOString(),
    };
    return rec;
  }

  function sumFacturasCargadas(d) {
    return (d.facturasCargadas || []).reduce(function (s, r) {
      return s + num(r.valor);
    }, 0);
  }

  function mergeFacturasCargadasRows(d, rows, opts) {
    opts = opts || {};
    if (!d) return 0;
    if (!Array.isArray(d.facturasCargadas)) d.facturasCargadas = [];
    var added = 0;
    (rows || []).forEach(function (row) {
      if (!row) return;
      var key = row.uuid || row.consecutivo || row.id;
      if (
        key &&
        d.facturasCargadas.some(function (x) {
          return (row.uuid && x.uuid === row.uuid) || (row.consecutivo && x.consecutivo === row.consecutivo && x.fromPos);
        })
      ) {
        if (opts.overwrite) {
          d.facturasCargadas = d.facturasCargadas.map(function (x) {
            if (row.uuid && x.uuid === row.uuid) return Object.assign({}, x, row, { id: x.id });
            return x;
          });
        }
        return;
      }
      d.facturasCargadas.push(
        Object.assign({}, row, {
          id: row.id || plUid('fc'),
          fromPos: row.fromPos !== false,
          manual: !!row.manual,
        })
      );
      added += 1;
    });
    return added;
  }

  function importFacturasCargadasFromPos(d, iso, opts) {
    opts = opts || {};
    var rec = refreshPosRecomendado(d, iso);
    return mergeFacturasCargadasRows(
      d,
      (rec.items || []).map(function (it) {
        return Object.assign({}, it, { fromPos: true, manual: false });
      }),
      { overwrite: !!opts.overwrite }
    );
  }

  function renderFacturasCargadasBlock(d) {
    var rec = d.posRecomendado || {};
    var totalIngresado = sumFacturasCargadas(d);
    var rows = d.facturasCargadas || [];
    var hasPos = num(rec.totalVenta) > 0;
    var kpi =
      '<div class="crozzo-pl-fc-kpis">' +
      '<div class="crozzo-pl-fc-kpi"><span>Recomendado POS</span><strong>Venta ' +
      fmtMoney(rec.totalVenta) +
      '</strong><small>Facturas crédito ' +
      fmtMoney(rec.facturasCargadas) +
      ' · Efectivo ' +
      fmtMoney(rec.efectivoEsperado) +
      '</small></div>' +
      '<div class="crozzo-pl-fc-kpi"><span>Ingresado en planilla</span><strong>' +
      fmtMoney(totalIngresado) +
      '</strong><small>' +
      rows.length +
      ' documento(s)</small></div>' +
      '</div>';
    var hint =
      hasPos && num(rec.facturasCargadas) > 0
        ? '<p class="crozzo-pl-fc-hint">Ejemplo: vendió <strong>' +
          fmtMoney(rec.totalVenta) +
          '</strong>, entraron <strong>' +
          fmtMoney(rec.facturasCargadas) +
          '</strong> en facturas a crédito y en efectivo deberían quedar <strong>' +
          fmtMoney(rec.efectivoEsperado) +
          '</strong>. Puede importarlas o escribirlas manualmente.</p>'
        : '<p class="crozzo-pl-fc-hint">Registre ventas a crédito o «cobrar después» del día. Use <strong>Traer del POS</strong> si ya facturó en caja.</p>';
    var tbody = rows
      .map(function (r, idx) {
        return (
          '<tr data-pl-fc-idx="' +
          idx +
          '"><td><input class="form-input" data-pl-fc-f="consecutivo" value="' +
          esc(r.consecutivo || '') +
          '" placeholder="Nº" /></td>' +
          '<td><input class="form-input" data-pl-fc-f="cliente" value="' +
          esc(r.cliente || '') +
          '" placeholder="Cliente" /></td>' +
          '<td><input class="form-input" data-pl-fc-f="nit" value="' +
          esc(r.nit || '') +
          '" placeholder="NIT" /></td>' +
          '<td><input type="number" class="form-input" style="width:100px" data-pl-fc-f="valor" value="' +
          num(r.valor) +
          '" step="1" /></td>' +
          '<td><span class="crozzo-pl-fc-src">' +
          (r.fromPos ? 'POS' : r.manual ? 'Manual' : '—') +
          '</span></td>' +
          '<td><button type="button" class="btn btn-outline btn-sm" data-pl-fc-del="' +
          idx +
          '">✕</button></td></tr>'
        );
      })
      .join('');
    return (
      '<div class="crozzo-pl-fc">' +
      kpi +
      hint +
      '<div class="crozzo-pl-fc-toolbar">' +
      '<button type="button" class="btn btn-outline btn-sm" data-pl-fc-import>Traer del POS</button>' +
      '<button type="button" class="btn btn-outline btn-sm" data-pl-fc-add>+ Agregar factura</button>' +
      '</div>' +
      '<div style="overflow:auto;margin-top:8px">' +
      '<table class="data-table crozzo-pl-fc-table"><thead><tr><th>Nº</th><th>Cliente</th><th>NIT</th><th>Valor</th><th>Origen</th><th></th></tr></thead><tbody>' +
      (tbody || '<tr><td colspan="6" style="text-align:center;opacity:.6">Sin facturas cargadas — importe del POS o agregue una fila</td></tr>') +
      '</tbody></table></div></div>'
    );
  }

  function cierreAutoKey(prefix, field) {
    return prefix + '.' + field;
  }

  function isFieldFromCierre(d, prefix, field) {
    if (!d || !d._cierreAuto) return false;
    return !!d._cierreAuto[cierreAutoKey(prefix, field)];
  }

  function markCuadreTurnoMeta(d, prefix, row) {
    if (!d || !prefix || !row) return;
    if (!d._cierreTurno) d._cierreTurno = {};
    d._cierreTurno[prefix] = {
      closedBy: row.closedBy || '',
      closedAt: row.closedAt || '',
      shiftLabel: row.shiftLabel || row.shiftType || '',
      shiftType: row.shiftType || '',
      cierreId: row.id || '',
    };
  }

  function renderCuadreBlock(title, obj, prefix, d) {
    var turnoMeta = d && d._cierreTurno && d._cierreTurno[prefix];
    var turnoHint =
      turnoMeta && turnoMeta.closedBy
        ? '<div class="crozzo-pl-cuadre-turno-meta">Desde cierre · ' +
          esc(turnoMeta.closedBy) +
          (turnoMeta.shiftLabel ? ' · ' + esc(turnoMeta.shiftLabel) : '') +
          ' · editable</div>'
        : '';
    var html =
      '<div style="padding-top:2px"><h4 style="margin:0 0 4px;font-size:0.82rem">' +
      esc(title) +
      '</h4>' +
      turnoHint +
      '<div class="crozzo-pl-cuadre">';
    (TPL.cuadreCampos || []).forEach(function (k, i) {
      var lbl = (TPL.cuadreLabels && TPL.cuadreLabels[i]) || k;
      var fromCierre = isFieldFromCierre(d, prefix, k);
      html +=
        '<span class="lbl">' +
        esc(lbl) +
        (fromCierre ? ' <span class="crozzo-pl-from-cierre-tag" title="Sugerido desde cierre POS">POS</span>' : '') +
        '</span><input type="number" class="form-input' +
        (fromCierre ? ' crozzo-pl-input--from-cierre' : '') +
        '" style="width:100%;max-width:128px" data-pl-c="' +
        prefix +
        '.' +
        k +
        '" value="' +
        num(obj[k]) +
        '" step="1" title="' +
        (fromCierre ? 'Desde cierre POS — puede editar' : '') +
        '" />';
    });
    html += '</div></div>';
    if (state.ui.guideMode) {
      return (
        '<div class="crozzo-pl-cuadre-card" style="border:1px solid var(--border);border-radius:12px;padding:12px 14px;background:var(--bg-card)">' +
        html +
        '</div>'
      );
    }
    return html;
  }

  function renderEgresosTable(rows, prefix) {
    var all = rows || [];
    var paid = filterEgresosPagados(all);
    var pendingN = countEgresosPendientes(all);
    var body = paid
      .map(function (r, idx) {
        var tipo = r.tipoEgreso || inferEgresoTipo({ payload: r, concepto: r.concepto, descripcion: r.descripcion });
        var tipoAuto = !r.tipoEgreso && !!tipo;
        return (
          '<tr data-pl-eg="' +
          prefix +
          '" data-pl-idx="' +
          idx +
          '"><td>' +
          renderEgresoTipoSelect(r.tipoEgreso || tipo, prefix, idx) +
          '</td>' +
          '<td><input class="form-input" data-f="nit" value="' +
          esc(r.nit || '') +
          '" /></td>' +
          '<td><input class="form-input" data-f="proveedor" value="' +
          esc(r.proveedor || '') +
          '" /></td>' +
          '<td><input class="form-input" data-f="concepto" value="' +
          esc(r.concepto || '') +
          '" list="pl-eg-conceptos" placeholder="Concepto planilla" /></td>' +
          '<td><input class="form-input" data-f="descripcion" value="' +
          esc(r.descripcion || '') +
          '" placeholder="Detalle" /></td>' +
          '<td><input type="number" class="form-input" style="width:90px" data-f="valor" value="' +
          num(r.valor) +
          '" /></td>' +
          '<td class="crozzo-pl-eg-tipo-cell">' +
          renderEgresoTipoChip(r.tipoEgreso || tipo, tipoAuto) +
          '</td>' +
          '<td><button type="button" class="btn btn-outline btn-sm" data-pl-del-eg>✕</button></td></tr>'
        );
      })
      .join('');
    var conceptDatalist = (TPL.egresosConceptos || [])
      .slice(0, 55)
      .map(function (c) {
        return '<option value="' + esc(c) + '"></option>';
      })
      .join('');
    return (
      '<datalist id="pl-eg-conceptos">' +
      conceptDatalist +
      '</datalist>' +
      '<p class="crozzo-pl-eg-hint">Solo aparecen gastos <strong>ya pagados</strong> (efectivo, tarjeta, transferencia o crédito saldado). Clasifique: compra MP, gasto, servicio…</p>' +
      (pendingN
        ? '<p class="crozzo-pl-eg-pending">' +
          pendingN +
          ' registro(s) pendiente(s) de pago en Oficina — no se muestran hasta marcar <strong>Pagada</strong> con medio de pago.</p>'
        : '') +
      '<div style="padding-top:8px;overflow:auto">' +
      '<table class="data-table crozzo-pl-eg-table"><thead><tr><th>Tipo</th><th>NIT</th><th>Proveedor</th><th>Concepto</th><th>Descripción</th><th>Valor</th><th></th><th></th></tr></thead><tbody>' +
      (body || '<tr><td colspan="8" style="text-align:center;opacity:.6">Sin líneas</td></tr>') +
      '</tbody></table>' +
      '<button type="button" class="btn btn-outline btn-sm" style="margin-top:8px" data-pl-add-eg="' +
      prefix +
      '">+ Agregar gasto</button></div>'
    );
  }

  function renderConteoAccordion(d) {
    var denRows = (TPL.denoms || [])
      .map(function (nom) {
        var it = (d.conteo.items && d.conteo.items[nom]) || { cantidad: 0, efectivo: 0 };
        return (
          '<tr><td>' +
          esc(nom) +
          '</td><td><input type="number" class="form-input" style="width:72px" data-pl-denom="' +
          esc(nom) +
          '" data-df="cantidad" value="' +
          num(it.cantidad) +
          '" /></td>' +
          '<td><input type="number" class="form-input" style="width:96px" data-pl-denom="' +
          esc(nom) +
          '" data-df="efectivo" value="' +
          num(it.efectivo) +
          '" /></td></tr>'
        );
      })
      .join('');
    var inner =
      '<p class="form-hint" style="margin:8px 0">Total calculado: <strong id="pl-conteo-sum-lbl">' +
      fmtMoney(d.conteo.totalEfectivo) +
      '</strong></p>' +
      '<table class="data-table"><thead><tr><th>Denominación</th><th>Cant.</th><th>Valor</th></tr></thead><tbody>' +
      denRows +
      '</tbody></table>' +
      '<div class="form-grid" style="margin-top:10px">' +
      '<div class="form-group"><label class="form-label">Base en caja</label><input type="number" class="form-input" id="pl-conteo-base" value="' +
      num(d.conteo.base) +
      '" /></div>' +
      '<div class="form-group"><label class="form-label">Total efectivo</label><input type="number" class="form-input" id="pl-conteo-total" value="' +
      num(d.conteo.totalEfectivo) +
      '" /></div>' +
      '<div class="form-group"><label class="form-label">Total − base</label><input type="number" class="form-input" id="pl-conteo-menos" value="' +
      num(d.conteo.totalMenosBase) +
      '" readonly /></div></div>';
    return renderAccordion(
      'pl-acc-conteo',
      state.ui.guideMode ? '5 · Contar billetes y monedas' : 'Conteo de efectivo (monedas y billetes)',
      state.ui.guideMode ? 'Cuánto hay físicamente en caja' : fmtMoney(d.conteo.totalEfectivo),
      state.ui.conteoOpen,
      (state.ui.guideMode ? '' : '<p class="crozzo-pl-tip">💵 Cuente billetes y monedas.</p>') + inner
    );
  }

  function renderDia() {
    var p = period();
    var d = day();
    if (state._cierreBackfillIso !== state.activeDate) {
      state._cierreBackfillIso = state.activeDate;
      if (maybeBackfillDayFromCierres(d, state.activeDate)) saveStore();
    }
    if (state._posRecoIso !== state.activeDate) {
      state._posRecoIso = state.activeDate;
      refreshPosRecomendado(d, state.activeDate);
    }
    if (!Array.isArray(d.facturasCargadas)) d.facturasCargadas = [];
    var dates = datesInPeriod(p);
    var idx = dates.indexOf(state.activeDate);
    var opts = dates
      .map(function (iso) {
        return '<option value="' + iso + '"' + (iso === state.activeDate ? ' selected' : '') + '>' + fmtDate(iso) + '</option>';
      })
      .join('');
    var propGrid = Object.keys(PROP_LABELS)
      .map(function (k) {
        var fromCierre = isFieldFromCierre(d, 'propinas', k);
        return (
          '<div class="form-group"><label class="form-label">' +
          esc(PROP_LABELS[k]) +
          (fromCierre ? ' <span class="crozzo-pl-from-cierre-tag" title="Sugerido desde cierre POS">POS</span>' : '') +
          '</label><input type="number" class="form-input' +
          (fromCierre ? ' crozzo-pl-input--from-cierre' : '') +
          '" data-pl-prop="' +
          k +
          '" value="' +
          num(d.propinas[k]) +
          '" title="' +
          (fromCierre ? 'Desde cierre POS — puede editar' : '') +
          '" /></div>'
        );
      })
      .join('');
    var cierresPosHtml = renderCierresPosBlock(d);
    var dayPickerGuide =
      state.ui.guideMode
        ? '<div class="crozzo-pl-day-card" id="pl-day-card">' +
          '<div class="crozzo-pl-dia-nav-row">' +
          '<button type="button" class="btn btn-outline btn-sm crozzo-pl-day-btn" id="pl-day-prev"' +
          (idx <= 0 ? ' disabled' : '') +
          ' title="Día anterior">◀</button>' +
          '<div class="form-group" style="margin:0"><label class="form-label">Día</label>' +
          '<select id="pl-date-sel" class="form-input">' +
          opts +
          '</select></div>' +
          '<button type="button" class="btn btn-outline btn-sm crozzo-pl-day-btn" id="pl-day-next"' +
          (idx < 0 || idx >= dates.length - 1 ? ' disabled' : '') +
          ' title="Día siguiente">▶</button>' +
          '<div class="form-group crozzo-pl-dia-local-inline" style="margin:0"><label class="form-label">Local</label>' +
          '<input id="pl-negocio" class="form-input" value="' +
          esc(d.negocio || p.negocio || '') +
          '" placeholder="Ej: Queso y Café" /></div></div></div>'
        : '';
    var dayPickerClassic =
      !state.ui.guideMode
        ? '<div class="crozzo-pl-dia-nav">' +
          '<button type="button" class="btn btn-outline btn-sm" id="pl-day-prev"' +
          (idx <= 0 ? ' disabled' : '') +
          '>←</button>' +
          '<div class="form-group" style="margin:0"><label class="form-label">Día del periodo</label>' +
          '<select id="pl-date-sel" class="form-input">' +
          opts +
          '</select></div>' +
          '<button type="button" class="btn btn-outline btn-sm" id="pl-day-next"' +
          (idx < 0 || idx >= dates.length - 1 ? ' disabled' : '') +
          '>→</button>' +
          '<span class="crozzo-pl-badge">' +
          dates.length +
          ' días en el corte</span>' +
          '<label class="form-label" style="margin:0;margin-left:auto">Negocio</label>' +
          '<input id="pl-negocio" class="form-input" style="max-width:180px" value="' +
          esc(d.negocio || p.negocio || '') +
          '" /></div>'
        : '';
    return (
      (state.ui.guideMode
        ? renderPeriodToolbarWrap() + dayPickerGuide
        : '<div class="crozzo-pl-dia-top">' + renderPeriodToolbarWrap() + dayPickerClassic + '</div>') +
      '<div id="pl-section-cuadre" class="crozzo-pl-section-block">' +
      (!state.ui.guideMode ? '<h3 class="crozzo-pl-section-title">Cuadre turnos</h3>' : '') +
      '<div class="crozzo-pl-grid">' +
      renderCuadreBlock('Turno mañana', d.cuadreM, 'cuadreM', d) +
      renderCuadreBlock('Turno tarde', d.cuadreT, 'cuadreT', d) +
      '</div></div>' +
      renderAccordion(
        'pl-acc-fc',
        state.ui.guideMode ? '2b · Facturas cargadas (crédito)' : 'Facturas cargadas',
        state.ui.guideMode
          ? 'Ventas a crédito del día · ' + fmtMoney(sumFacturasCargadas(d))
          : 'Crédito / cobrar después · ' + fmtMoney(sumFacturasCargadas(d)),
        state.ui.facturasCargadasOpen,
        renderFacturasCargadasBlock(d)
      ) +
      renderAccordion(
        'pl-acc-egresos',
        state.ui.guideMode ? '3 · Gastos y compras del día' : 'Egresos y compras del día',
        state.ui.guideMode ? 'Todo lo que salió de caja' : 'Mañana + tarde + caja mayor',
        state.ui.egresosOpen,
        (state.ui.guideMode ? '' : '<p class="crozzo-pl-tip">🧾 Anote proveedor y valor.</p>') +
          renderEgresosTable(d.egresosM, 'egresosM') +
          renderEgresosTable(d.egresosT, 'egresosT') +
          '<h4 style="margin:14px 0 8px;font-size:0.9rem">' +
          (state.ui.guideMode ? 'Pagos grandes (caja mayor)' : 'Egreso caja mayor') +
          '</h4>' +
          renderEgresosTable(d.egresoMayor, 'egresoMayor')
      ) +
      renderAccordion(
        'pl-acc-propinas',
        state.ui.guideMode ? '4 · Propinas y cierre' : 'Propinas y cierre',
        state.ui.guideMode ? 'Opcional' : null,
        state.ui.propinasOpen,
        cierresPosHtml + '<div class="form-grid" style="padding-top:10px">' + propGrid + '</div>'
      ) +
      renderConteoAccordion(d) +
      (!state.ui.guideMode
        ? renderAccordion('pl-acc-egprop', 'Egreso propina', null, false, '<div class="form-grid" style="padding-top:10px">' + ['transf', 'banco', 'efectivo'].map(function (k) { return '<div class="form-group"><label class="form-label">' + esc(k) + '</label><input type="number" class="form-input" data-pl-egprop="' + k + '" value="' + num(d.egresoPropina[k]) + '" /></div>'; }).join('') + '</div>')
        : '')
    );
  }

  function renderMes() {
    var p = period();
    var res = p.resumen || emptyResumen();
    var rows = (TPL.egresosConceptos || [])
      .slice(0, 40)
      .map(function (c) {
        var auto = 0;
        datesInPeriod(p).forEach(function (iso) {
          var d = p.days[iso];
          if (!d) return;
          [d.egresosM, d.egresosT, d.egresoMayor].forEach(function (arr) {
            filterEgresosPagados(arr || []).forEach(function (r) {
              if (String(r.concepto || '').trim() === c) auto += num(r.valor);
            });
          });
        });
        var manual = num(res.totalEgresos[c]);
        return (
          '<tr><td>' +
          esc(c) +
          '</td><td class="form-hint">' +
          fmtMoney(auto) +
          '</td><td><input type="number" class="form-input" data-pl-tot-eg="' +
          esc(c) +
          '" value="' +
          num(manual) +
          '" style="width:120px" /></td></tr>'
        );
      })
      .join('');
    var kpi = (TPL.totalKpis || [])
      .slice(0, 20)
      .map(function (k) {
        return (
          '<tr><td>' +
          esc(k) +
          '</td><td><input type="number" class="form-input" data-pl-tot-kpi="' +
          esc(k) +
          '" value="' +
          num((res.totalKpi || {})[k]) +
          '" style="width:120px" /></td></tr>'
        );
      })
      .join('');
    return (
      '<div class="crozzo-pl-dia-top">' +
      renderPeriodToolbarWrap() +
      '</div>' +
      '<p class="page-subtitle" style="margin:0 0 12px">' +
      (state.ui.guideMode
        ? 'Aquí ve los <strong>totales del periodo</strong>. Lo importante del día a día está en la pestaña <strong>Mi día</strong>.'
        : 'Resumen del periodo <strong>' + esc(periodLabel(p)) + '</strong>. Los registros día a día se conservan; aquí define el rango que está gestionando.') +
      '</p>' +
      '<div style="margin-bottom:10px;display:flex;gap:8px;flex-wrap:wrap">' +
      '<button type="button" class="btn btn-outline btn-sm" id="pl-recalc-resumen">↻ Recalcular sugeridos desde días</button>' +
      '</div>' +
      '<div class="crozzo-pl-grid">' +
      '<details class="crozzo-pl-acc" open><summary><span>Total egresos por concepto</span></summary><div class="crozzo-pl-acc__body">' +
      '<table class="data-table"><thead><tr><th>Concepto</th><th>Suma días</th><th>Valor periodo</th></tr></thead><tbody>' +
      rows +
      '</tbody></table></div></details>' +
      '<details class="crozzo-pl-acc"><summary><span>Indicadores (plantilla Excel)</span></summary><div class="crozzo-pl-acc__body">' +
      '<table class="data-table"><tbody>' +
      (kpi || '<tr><td>Sin indicadores</td></tr>') +
      '</tbody></table></div></details></div>' +
      '<div class="form-group" style="margin-top:12px"><label class="form-label">Notas del periodo</label>' +
      '<textarea class="form-input" id="pl-res-notas" rows="2">' +
      esc(res.notas || '') +
      '</textarea></div>'
    );
  }

  function renderArchivo() {
    return (
      '<div class="crozzo-pl-dia-top">' +
      renderPeriodToolbarWrap() +
      '</div>' +
      '<details class="crozzo-pl-acc" open><summary><span>' +
      (state.ui.guideMode ? 'Traer o sacar archivo Excel' : 'Archivo Excel') +
      '</span></summary><div class="crozzo-pl-acc__body">' +
      '<p class="page-subtitle">' +
      (state.ui.guideMode
        ? 'Si ya usa Excel, puede importarlo aquí. Si prefiere solo pantalla, puede omitir esto.'
        : 'Importe o exporte la planilla. Los <strong>periodos de corte</strong> se guardan por separado en este equipo.') +
      '</p>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;margin:12px 0">' +
      '<a class="btn btn-outline btn-sm" href="assets/2026-PLANILLA-BLANCO.xlsx" download="2026-PLANILLA-BLANCO.xlsx">⬇ Plantilla vacía</a>' +
      '<button type="button" class="btn btn-primary btn-sm" id="pl-import-xlsx">📥 Importar Excel</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="pl-export-xlsx">📤 Exportar periodo actual</button>' +
      '</div><input type="file" id="pl-file" accept=".xlsx,.xls" style="display:none" /></div></details>'
    );
  }

  function renderNominaEmbed() {
    if (typeof renderNominaPlanilla === 'function') {
      return (
        '<div class="crozzo-pl-dia-top">' +
        renderPeriodToolbarWrap() +
        '</div>' +
        '<div class="alert alert-info" style="margin-bottom:12px;font-size:0.85rem">' +
        (state.ui.guideMode
          ? 'Horas del personal: nocturnas, festivos y dominicales. Primero cree empleados en <strong>Marcación personal</strong>.'
          : 'Horas nocturnas, festivos y dominicales — empleados de <strong>Marcación personal</strong>.') +
        '</div>' +
        renderNominaPlanilla()
      );
    }
    return '<div class="crozzo-pl-dia-top">' + renderPeriodToolbarWrap() + '</div><div class="card"><p>Cargue CrozzoModulosIntegrados.js</p></div>';
  }

  function egresoTipoLabel(id) {
    var t = EGRESO_TIPOS.find(function (x) {
      return x.id === id;
    });
    return t ? t.label : id || '—';
  }

  function egresoTipoShort(id) {
    var t = EGRESO_TIPOS.find(function (x) {
      return x.id === id;
    });
    return t ? t.short || t.label : id || '—';
  }

  function itemLooksMp(it) {
    if (!it) return false;
    if (it.mpId || it.materiaPrimaId || it.productoRefTipo === 'materia_prima') return true;
    if (it.ingrediente || it.productoNombre || it.nombre) {
      var blob = String(it.ingrediente || it.productoNombre || it.nombre || '').toLowerCase();
      if (blob && blob !== 'recepción proveedor' && blob.indexOf('recepcion') < 0) return true;
    }
    return false;
  }

  function recepcionFromPayload(payload) {
    if (!payload || !payload.recepcionId) return null;
    var rv = reservorioFeed();
    if (!rv || !rv.load) return null;
    try {
      var st = rv.load();
      return (st.recepciones || []).find(function (r) {
        return r && String(r.id) === String(payload.recepcionId);
      });
    } catch (_) {
      return null;
    }
  }

  function proveedorFromPayload(payload) {
    if (!payload) return null;
    var rv = reservorioFeed();
    if (!rv || !rv.getProveedor) return null;
    try {
      if (payload.proveedorId) return rv.getProveedor(payload.proveedorId);
      if (payload.proveedorNit && rv.listProveedores) {
        var nit = String(payload.proveedorNit).replace(/\D/g, '');
        var list = rv.listProveedores() || [];
        for (var i = 0; i < list.length; i++) {
          var p = list[i];
          var pn = String((p.legal && p.legal.nit) || p.nit || '').replace(/\D/g, '');
          if (pn && pn === nit) return p;
        }
      }
    } catch (_) {}
    return null;
  }

  function inferEgresoTipo(opts) {
    opts = opts || {};
    if (opts.tipoEgreso) return opts.tipoEgreso;
    var payload = opts.payload || {};
    if (payload.recepcionHasMp) return 'compra_mp';
    if (payload.recepcionId && num(payload.recepcionItems) > 0 && !payload.recepcionHasMp) return 'compra_insumo';
    var rec = recepcionFromPayload(payload);
    if (rec) {
      var items = rec.items || [];
      if (items.some(itemLooksMp)) return 'compra_mp';
      if (items.length) return 'compra_insumo';
    }
    var prov = proveedorFromPayload(payload);
    if (prov) {
      var rubro = String(prov.tipoRubro || prov.categoria || '').toLowerCase();
      if (/servicio|utilities|servicios|publico|telecom|software/.test(rubro)) return 'pago_servicio';
      if (/materia|insumo|mp|proteina|fruver|abarrote|lacteo|bebida|carn|pollo|queso/.test(rubro)) return 'compra_mp';
    }
    var blob = [
      opts.concepto,
      opts.descripcion,
      payload.notas,
      payload.proveedorNombre,
      payload.numeroFactura,
      payload.concepto,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (/servicio de|pago servicio|mensualidad|tarifa/.test(blob)) {
      if (/agua|energ|gas|internet|telefon|software|dataico|parqueadero/.test(blob)) return 'pago_servicio';
      return 'servicio';
    }
    if (/compra|m\.p\.|materia prima|insumo|recepci|fruver|prote[ií]na|carn/.test(blob)) return 'compra_mp';
    if (/nomina|nómina|seguridad social|liquidaci|vacaci|turnos y h|prima de serv|cesant/.test(blob)) return 'nomina_laboral';
    if (/impuesto|provision|rst|ica|retenc/.test(blob)) return 'impuesto';
    if (/inversion|activo fijo/.test(blob)) return 'inversion';
    if (/pago proveedor|factura|proveedor/.test(blob)) return 'compra_mp';
    return 'gasto_operativo';
  }

  function conceptoForTipoEgreso(tipo, payload) {
    var concepts = (TPL && TPL.egresosConceptos) || [];
    var hints = EGRESO_TIPO_CONCEPT_HINTS[tipo] || [];
    var i;
    var j;
    for (j = 0; j < hints.length; j++) {
      for (i = 0; i < concepts.length; i++) {
        if (hints[j].test(concepts[i])) return concepts[i];
      }
    }
    if (tipo === 'compra_mp') {
      for (i = 0; i < concepts.length; i++) {
        if (/COMPRAS\s*\(\s*M\.?\s*P\.?\s*\)/i.test(concepts[i])) return concepts[i];
      }
    }
    if (payload && payload.notas) {
      var nota = String(payload.notas).trim().toUpperCase();
      for (i = 0; i < concepts.length; i++) {
        if (concepts[i].toUpperCase().indexOf(nota.slice(0, 12)) >= 0) return concepts[i];
      }
    }
    return '';
  }

  function mapFeedConcepto(feed, tipoEgreso) {
    var payload = (feed && feed.payload) || {};
    var tipo = tipoEgreso || inferEgresoTipo({ payload: payload, concepto: feed && feed.concepto });
    var fromTipo = conceptoForTipoEgreso(tipo, payload);
    if (fromTipo) return fromTipo;
    var concepts = (TPL && TPL.egresosConceptos) || [];
    var orig = String((feed && feed.origen) || '').toLowerCase();
    var i;
    if (orig === 'oficina') {
      for (i = 0; i < concepts.length; i++) {
        if (/COMPRAS\s*\(\s*M\.?\s*P\.?\s*\)/i.test(concepts[i])) return concepts[i];
      }
      for (i = 0; i < concepts.length; i++) {
        if (/PAGO|PROVEED|COMPRA|FACTURA/i.test(concepts[i])) return concepts[i];
      }
      return 'COMPRAS (M.P.)';
    }
    if (orig === 'pos' || orig === 'caja') {
      for (i = 0; i < concepts.length; i++) {
        if (/GASTO|CAJA|VARIOS/i.test(concepts[i])) return concepts[i];
      }
    }
    return (feed && feed.concepto) || 'DIVERSOS';
  }

  function renderEgresoTipoSelect(val, prefix, idx) {
    var opts = EGRESO_TIPOS.map(function (t) {
      return (
        '<option value="' +
        t.id +
        '"' +
        (val === t.id ? ' selected' : '') +
        ' title="' +
        esc(t.hint || t.label) +
        '">' +
        esc(t.short || t.label) +
        '</option>'
      );
    }).join('');
    return (
      '<select class="form-input crozzo-pl-eg-tipo" data-pl-eg-tipo="' +
      prefix +
      '" data-pl-idx="' +
      idx +
      '" title="Clasificación del gasto">' +
      '<option value="">— Tipo —</option>' +
      opts +
      '</select>'
    );
  }

  function renderEgresoTipoChip(tipo, auto) {
    if (!tipo) return '<span class="crozzo-pl-eg-tipo-chip crozzo-pl-eg-tipo-chip--empty">Sin tipo</span>';
    return (
      '<span class="crozzo-pl-eg-tipo-chip crozzo-pl-eg-tipo-chip--' +
      esc(tipo) +
      '" title="' +
      esc(egresoTipoLabel(tipo)) +
      (auto ? ' · sugerido' : '') +
      '">' +
      esc(egresoTipoShort(tipo)) +
      (auto ? ' <small>POS</small>' : '') +
      '</span>'
    );
  }

  function reservorioFeed() {
    return global.CrozzoReservorio || null;
  }

  function feedPendingCount() {
    var rv = reservorioFeed();
    if (!rv || !rv.listFeed) return 0;
    return (rv.listFeed(200) || []).filter(function (f) {
      return f && f.estado === 'pendiente';
    }).length;
  }

  function feedOrigenLabel(orig) {
    var o = String(orig || '').toLowerCase();
    if (o === 'oficina') return 'Oficina';
    if (o === 'pos' || o === 'caja') return 'POS / Caja';
    if (o === 'costos') return 'Costos';
    return orig || '—';
  }

  function listFeedFiltered() {
    var rv = reservorioFeed();
    if (!rv || !rv.listFeed) return [];
    var all = rv.listFeed(200) || [];
    var f = state.feedFilter || 'pendiente';
    return all.filter(function (it) {
      if (!it) return false;
      if (String(it.tipo_movimiento || 'egreso').toLowerCase() === 'egreso' && !isFeedItemPagado(it)) return false;
      if (f === 'pendiente') return it.estado === 'pendiente';
      if (f === 'oficina') return String(it.origen || '').toLowerCase() === 'oficina';
      if (f === 'pos') return /^(pos|caja)$/i.test(String(it.origen || ''));
      if (f === 'otros') {
        var o = String(it.origen || '').toLowerCase();
        return o !== 'oficina' && o !== 'pos' && o !== 'caja';
      }
      return true;
    });
  }

  function feedStats() {
    var rv = reservorioFeed();
    var all = rv && rv.listFeed ? rv.listFeed(200) || [] : [];
    var out = { pendientes: 0, montoPendiente: 0, oficinaPend: 0, aceptados: 0, rechazados: 0 };
    all.forEach(function (it) {
      if (!it) return;
      if (String(it.tipo_movimiento || 'egreso').toLowerCase() === 'egreso' && !isFeedItemPagado(it)) return;
      if (it.estado === 'pendiente') {
        out.pendientes++;
        out.montoPendiente += num(it.monto);
        if (String(it.origen || '').toLowerCase() === 'oficina') out.oficinaPend++;
      } else if (it.estado === 'aceptado') out.aceptados++;
      else if (it.estado === 'rechazado') out.rechazados++;
    });
    return out;
  }

  function ensureDayForFeed(fecha) {
    fecha = fecha || new Date().toISOString().slice(0, 10);
    var switched = false;
    var p = period();
    if (!(fecha >= p.fechaInicio && fecha <= p.fechaFin)) {
      var dm = defaultMonthPeriod(new Date(fecha + 'T12:00:00'));
      var id = periodId(dm.fi, dm.ff);
      if (!store.periods[id]) store.periods[id] = emptyPeriod(dm.fi, dm.ff, 'Mes ' + fecha.slice(0, 7));
      store.activePeriodId = id;
      switched = true;
      p = store.periods[id];
    }
    if (!p.days[fecha]) p.days[fecha] = emptyDay();
    state.activeDate = fecha;
    return { iso: fecha, day: p.days[fecha], period: p, switchedPeriod: switched };
  }

  function buildFeedDescripcion(feed) {
    var parts = [String((feed && feed.concepto) || '').trim()];
    var payload = (feed && feed.payload) || {};
    var tipo = inferEgresoTipo({ payload: payload, concepto: feed && feed.concepto });
    parts.push(egresoTipoLabel(tipo));
    var payload = (feed && feed.payload) || {};
    if (feed && feed.referencia_tipo === 'factura_oficina') {
      if (payload.numeroFactura) parts.push('Fac. ' + payload.numeroFactura);
      if (payload.metodo) parts.push(String(payload.metodo));
    }
    return parts.filter(Boolean).join(' · ').slice(0, 160);
  }

  function feedReferenciaHtml(feed) {
    var payload = (feed && feed.payload) || {};
    if (feed && feed.referencia_tipo === 'factura_oficina') {
      var nit = payload.proveedorNit || payload.nit || '';
      var fac = payload.numeroFactura || '';
      var bits = [];
      if (payload.proveedorNombre) bits.push(esc(payload.proveedorNombre));
      if (nit) bits.push('NIT ' + esc(nit));
      if (fac) bits.push('Fac. ' + esc(fac));
      return bits.length ? bits.join(' · ') : '<span class="crozzo-pl-cola-ref">Factura oficina</span>';
    }
    if (feed && feed.referencia_id) {
      return '<span class="crozzo-pl-cola-ref">' + esc(String(feed.referencia_id).slice(0, 12)) + '</span>';
    }
    return '—';
  }

  function feedMontoHtml(it) {
    var payload = (it && it.payload) || {};
    var meta = payload.oficinaMeta || {};
    var neto = num(it && it.monto);
    if (meta.retencionesConfirmadas && (num(meta.retencionFuente) || num(meta.retencionICA))) {
      var bruto = num(payload.valor);
      var ret = num(meta.retencionFuente) + num(meta.retencionICA);
      return (
        esc(fmtMoney(neto)) +
        '<div class="crozzo-pl-cola-ref">Bruto ' +
        esc(fmtMoney(bruto)) +
        ' · Ret. ' +
        esc(fmtMoney(ret)) +
        '</div>'
      );
    }
    return esc(fmtMoney(neto));
  }

  function feedOrigenChip(orig) {
    var o = String(orig || '').toLowerCase();
    var cls = o === 'oficina' ? ' crozzo-pl-cola-orig--oficina' : '';
    return '<span class="crozzo-pl-cola-orig' + cls + '">' + esc(feedOrigenLabel(orig)) + '</span>';
  }

  function findFeedInPlanilla(feedId) {
    if (!feedId) return null;
    var found = null;
    Object.keys(store.periods || {}).forEach(function (pid) {
      var p = store.periods[pid];
      if (!p || !p.days) return;
      Object.keys(p.days).forEach(function (iso) {
        var d = p.days[iso];
        (d.egresoMayor || []).forEach(function (eg, idx) {
          if (eg && eg.feedId === feedId) found = { fecha: iso, idx: idx, periodId: pid, egreso: eg };
        });
      });
    });
    return found;
  }

  function renderFeedDetailRow(it) {
    if (!it || state.feedExpandedId !== it.id) return '';
    var payload = it.payload || {};
    var meta = payload.oficinaMeta || {};
    var tipoInf = inferEgresoTipo({ payload: payload, concepto: it.concepto });
    var rec = recepcionFromPayload(payload);
    var preview =
      renderEgresoTipoChip(tipoInf, true) +
      ' → <strong>' +
      esc(mapFeedConcepto(it, tipoInf)) +
      '</strong> · ' +
      esc(fmtMoney(it.monto)) +
      (payload.proveedorNombre ? ' · ' + esc(payload.proveedorNombre) : '') +
      '<br><span class="crozzo-pl-cola-ref">' +
      esc(buildFeedDescripcion(it)) +
      '</span>' +
      (rec
        ? '<br><span class="crozzo-pl-cola-ref">Recepción vinculada · ' +
          (rec.items || []).length +
          ' ítem(s)' +
          ((rec.items || []).some(itemLooksMp) ? ' · materia prima' : '') +
          '</span>'
        : '');
    var dup = findFeedInPlanilla(it.id);
    var dupNote = dup
      ? '<p class="form-hint" style="margin:8px 0 0;color:var(--success,#16a34a)">✓ Ya volcado al egreso mayor del ' +
        esc(fmtDate(dup.fecha)) +
        '</p>'
      : '';
    var oficinaBits =
      it.referencia_tipo === 'factura_oficina'
        ? '<div><div class="lbl">Método pago</div><div class="val">' +
          esc(payload.metodo || '—') +
          '</div></div>' +
          '<div><div class="lbl">Bruto factura</div><div class="val">' +
          esc(fmtMoney(payload.valor)) +
          '</div></div>' +
          '<div><div class="lbl">Ret. fuente</div><div class="val">' +
          esc(fmtMoney(meta.retencionFuente)) +
          '</div></div>' +
          '<div><div class="lbl">Ret. ICA</div><div class="val">' +
          esc(fmtMoney(meta.retencionICA)) +
          '</div></div>' +
          '<div><div class="lbl">Neto planilla</div><div class="val">' +
          esc(fmtMoney(it.monto)) +
          '</div></div>'
        : '';
    var oficinaBtn =
      it.referencia_id && it.referencia_tipo === 'factura_oficina'
        ? '<button type="button" class="btn btn-outline btn-sm" data-pl-feed-oficina="' +
          esc(it.referencia_id) +
          '">Ver en oficina</button>'
        : '';
    return (
      '<tr class="crozzo-pl-cola-detail" data-pl-feed-detail="' +
      esc(it.id) +
      '"><td colspan="7">' +
      '<div class="crozzo-pl-cola-detail-grid">' +
      '<div><div class="lbl">Fecha cola</div><div class="val">' +
      esc(fmtDate(it.fecha)) +
      '</div></div>' +
      '<div><div class="lbl">Tipo</div><div class="val">' +
      esc(it.tipo_movimiento || 'egreso') +
      '</div></div>' +
      '<div><div class="lbl">Registrado</div><div class="val">' +
      esc((it.created_at || '').slice(0, 16).replace('T', ' ')) +
      '</div></div>' +
      oficinaBits +
      '</div>' +
      '<div class="crozzo-pl-cola-preview"><div class="lbl" style="margin-bottom:4px">Se escribirá en egreso caja mayor</div>' +
      preview +
      dupNote +
      '</div>' +
      (oficinaBtn ? '<div style="margin-top:10px">' + oficinaBtn + '</div>' : '') +
      '</td></tr>'
    );
  }

  function applyFeedToPlanilla(feedId) {
    var rv = reservorioFeed();
    if (!rv || !rv.listFeed || !rv.updateFeedEstado) {
      toast('Reservorio no disponible', 'error');
      return null;
    }
    var feed = null;
    (rv.listFeed(500) || []).some(function (f) {
      if (f && f.id === feedId) {
        feed = f;
        return true;
      }
      return false;
    });
    if (!feed) {
      toast('Ítem no encontrado en la cola', 'warning');
      return null;
    }
    if (feed.estado !== 'pendiente') {
      toast('Este movimiento ya está ' + feed.estado, 'info');
      return null;
    }
    if (String(feed.tipo_movimiento || 'egreso').toLowerCase() === 'egreso' && !isFeedItemPagado(feed)) {
      toast('Solo se volcan pagos confirmados (efectivo, tarjeta, transferencia o crédito pagado)', 'warning');
      return null;
    }
    var dup = findFeedInPlanilla(feedId);
    if (dup) {
      rv.updateFeedEstado(feedId, 'aceptado');
      toast('Ya estaba en planilla del ' + fmtDate(dup.fecha) + ' — marcado como aceptado', 'info');
      return { fecha: dup.fecha, egreso: dup.egreso, duplicate: true };
    }
    var fecha = feed.fecha || new Date().toISOString().slice(0, 10);
    var info = ensureDayForFeed(fecha);
    var payload = feed.payload || {};
    var tipoEgreso = inferEgresoTipo({ payload: payload, concepto: feed.concepto });
    var egreso = {
      nit: String(payload.proveedorNit || payload.nit || '').trim(),
      proveedor: String(payload.proveedorNombre || payload.proveedor || '').trim(),
      tipoEgreso: tipoEgreso,
      concepto: mapFeedConcepto(feed, tipoEgreso),
      descripcion: buildFeedDescripcion(feed),
      valor: num(feed.monto),
      feedId: feed.id,
      refOficina: feed.referencia_id || null,
      recepcionId: payload.recepcionId || null,
      metodoPago: normMetodoPago(payload.metodo),
      pagado: true,
      clasifAuto: true,
    };
    if (!Array.isArray(info.day.egresoMayor)) info.day.egresoMayor = [];
    info.day.egresoMayor.push(egreso);
    saveStore();
    rv.updateFeedEstado(feedId, 'aceptado');
    return { fecha: info.iso, egreso: egreso, switchedPeriod: info.switchedPeriod };
  }

  function applyAllPendingOficina() {
    var rv = reservorioFeed();
    if (!rv || !rv.listFeed) return;
    var pending = (rv.listFeed(200) || []).filter(function (it) {
      return it && it.estado === 'pendiente' && String(it.origen || '').toLowerCase() === 'oficina';
    });
    if (!pending.length) {
      toast('No hay pagos de oficina pendientes', 'info');
      return;
    }
    if (
      typeof global.confirm === 'function' &&
      !global.confirm('¿Volcar ' + pending.length + ' pago(s) de oficina al egreso mayor de cada día?')
    ) {
      return;
    }
    var ok = 0;
    var dup = 0;
    pending.forEach(function (it) {
      var res = applyFeedToPlanilla(it.id);
      if (!res) return;
      if (res.duplicate) dup++;
      else ok++;
    });
    toast(
      ok + ' volcado(s)' + (dup ? ' · ' + dup + ' ya estaban en planilla' : '') + ' · oficina',
      ok ? 'success' : 'info'
    );
    rerender();
  }

  function renderCola() {
    var stats = feedStats();
    var rows = listFeedFiltered();
    var filters = [
      { id: 'pendiente', label: 'Pendientes' },
      { id: 'all', label: 'Todos' },
      { id: 'oficina', label: 'Oficina' },
      { id: 'pos', label: 'POS' },
      { id: 'otros', label: 'Otros' }
    ];
    var filterBtns = filters
      .map(function (f) {
        return (
          '<button type="button" class="' +
          (state.feedFilter === f.id ? 'active' : '') +
          '" data-pl-feed-filter="' +
          f.id +
          '">' +
          esc(f.label) +
          (f.id === 'pendiente' && stats.pendientes ? ' (' + stats.pendientes + ')' : '') +
          '</button>'
        );
      })
      .join('');

    var body = rows.length
      ? rows
          .map(function (it) {
            var stCls =
              'crozzo-pl-cola-estado crozzo-pl-cola-estado--' + esc(String(it.estado || 'pendiente').toLowerCase());
            var expanded = state.feedExpandedId === it.id;
            var actions =
              it.estado === 'pendiente'
                ? '<div class="crozzo-pl-cola-actions">' +
                  '<button type="button" class="btn btn-primary btn-sm" data-pl-feed-ok="' +
                  esc(it.id) +
                  '">Aceptar</button>' +
                  '<button type="button" class="btn btn-outline btn-sm" data-pl-feed-no="' +
                  esc(it.id) +
                  '">Rechazar</button>' +
                  (it.referencia_tipo === 'factura_oficina' && it.referencia_id
                    ? '<button type="button" class="btn btn-outline btn-sm" data-pl-feed-oficina="' +
                      esc(it.referencia_id) +
                      '">Oficina</button>'
                    : '') +
                  '<button type="button" class="btn btn-outline btn-sm" data-pl-feed-day="' +
                  esc(it.fecha || '') +
                  '">Día</button></div>'
                : it.estado === 'aceptado'
                  ? '<button type="button" class="btn btn-outline btn-sm" data-pl-feed-day="' +
                    esc(it.fecha || '') +
                    '">Ver día</button>'
                  : '—';
            return (
              '<tr data-pl-feed-row="' +
              esc(it.id) +
              '"' +
              (expanded ? ' class="is-expanded"' : '') +
              '><td>' +
              esc(fmtDate(it.fecha)) +
              '</td><td>' +
              feedOrigenChip(it.origen) +
              '</td><td>' +
              esc(it.concepto || '') +
              '</td><td>' +
              feedReferenciaHtml(it) +
              '</td><td style="text-align:right;font-variant-numeric:tabular-nums">' +
              feedMontoHtml(it) +
              '</td><td><span class="' +
              stCls +
              '">' +
              esc(it.estado || 'pendiente') +
              '</span></td><td style="text-align:right" data-pl-feed-stop>' +
              actions +
              '</td></tr>' +
              renderFeedDetailRow(it)
            );
          })
          .join('')
      : '<tr><td colspan="7" style="text-align:center;opacity:.65;padding:24px">Sin movimientos en este filtro. Los pagos de oficina aparecen aquí al marcar la factura como pagada.</td></tr>';

    var bulkBtn =
      stats.oficinaPend > 0 && (state.feedFilter === 'pendiente' || state.feedFilter === 'oficina')
        ? '<button type="button" class="btn btn-primary btn-sm" id="pl-feed-bulk-oficina">Aceptar todos oficina (' +
          stats.oficinaPend +
          ')</button>'
        : '';

    return (
      '<div class="crozzo-pl-cola-head">' +
      '<div class="crozzo-pl-kpis">' +
      '<div class="crozzo-pl-kpi"><div class="lbl">Pendientes</div><div class="val">' +
      stats.pendientes +
      '</div></div>' +
      '<div class="crozzo-pl-kpi"><div class="lbl">Monto pendiente</div><div class="val">' +
      esc(fmtMoney(stats.montoPendiente)) +
      '</div></div>' +
      '<div class="crozzo-pl-kpi"><div class="lbl">Oficina pend.</div><div class="val">' +
      stats.oficinaPend +
      '</div></div>' +
      '<div class="crozzo-pl-kpi"><div class="lbl">Aceptados / Rechazados</div><div class="val" style="font-size:1rem">' +
      stats.aceptados +
      ' / ' +
      stats.rechazados +
      '</div></div></div>' +
      '<div class="card" style="padding:16px">' +
      '<div style="display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:12px">' +
      '<div><h3 style="margin:0;font-size:1rem">' +
      (state.ui.guideMode ? 'Lista de pagos por revisar' : 'Cola de pagos') +
      '</h3>' +
      '<p>' +
      (state.ui.guideMode
        ? 'Estos pagos vienen de <strong>Oficina</strong>. Pulse <strong>Aceptar</strong> para pasarlos al gasto del día. Toque una fila para ver más detalle.'
        : 'Pagos desde oficina, POS y costos. Al aceptar, se crea una línea en <strong>egreso caja mayor</strong> del día. Clic en una fila para ver detalle y retenciones.') +
      '</p></div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">' +
      bulkBtn +
      '<button type="button" class="btn btn-outline btn-sm" id="pl-feed-refresh">↻ Actualizar</button></div></div>' +
      '<div class="crozzo-pl-cola-filters" role="tablist" aria-label="Filtrar cola">' +
      filterBtns +
      '</div>' +
      '<div style="overflow:auto">' +
      '<table class="data-table"><thead><tr><th>Fecha</th><th>Origen</th><th>Concepto</th><th>Referencia</th><th style="text-align:right">Monto</th><th>Estado</th><th style="text-align:right">Acciones</th></tr></thead><tbody>' +
      body +
      '</tbody></table></div></div></div>'
    );
  }

  function renderRoot() {
    injectStyles();
    var inner = '';
    if (state.tab === 'dia') inner = renderDia();
    else if (state.tab === 'mes') inner = renderMes();
    else if (state.tab === 'cola') inner = renderCola();
    else if (state.tab === 'nomina') inner = renderNominaEmbed();
    else inner = renderArchivo();

    var p = period();
    var pendingFeed = feedPendingCount();
    var tabBtns = TAB_DEFS.map(function (t) {
      var badge = t.id === 'cola' && pendingFeed > 0 ? '<span class="crozzo-pl-tab-badge">' + pendingFeed + '</span>' : '';
      var label = state.ui.guideMode ? t.labelGuide || t.label : t.label;
      var title = (state.ui.guideMode ? t.hint + ' — ' : '') + t.label;
      return (
        '<button type="button" class="' +
        (state.tab === t.id ? 'active' : '') +
        '" data-pl-tab="' +
        t.id +
        '" title="' +
        esc(title) +
        '"><i data-lucide="' +
        esc(t.icon) +
        '" aria-hidden="true"></i><span>' +
        esc(label) +
        badge +
        '</span></button>'
      );
    }).join('');

    return (
      '<section class="crozzo-pl-app' +
      (state.ui.focusMode ? ' is-focus' : '') +
      (state.ui.guideMode ? ' is-guide' : '') +
      '" id="crozzo-pl-app">' +
      renderCommandBar(tabBtns, p) +
      '<main class="crozzo-pl-stage">' +
      '<div class="crozzo-pl-root" id="crozzo-pl-root">' +
      renderGuidePanel() +
      periodKpisBlockHtml() +
      '<div class="crozzo-pl-work">' +
      inner +
      '</div></div></main></section>'
    );
  }

  function recalcConteo() {
    var d = day();
    var sum = 0;
    (TPL.denoms || []).forEach(function (nom) {
      sum += num((d.conteo.items[nom] || {}).efectivo);
    });
    d.conteo.totalEfectivo = sum;
    d.conteo.totalMenosBase = sum - num(d.conteo.base);
    var te = document.getElementById('pl-conteo-total');
    var tm = document.getElementById('pl-conteo-menos');
    var tl = document.getElementById('pl-conteo-sum-lbl');
    if (te) te.value = sum;
    if (tm) tm.value = d.conteo.totalMenosBase;
    if (tl) tl.textContent = fmtMoney(sum);
  }

  function recalcResumenFromDays() {
    var p = period();
    if (!p.resumen) p.resumen = emptyResumen();
    (TPL.egresosConceptos || []).forEach(function (c) {
      var auto = 0;
      datesInPeriod(p).forEach(function (iso) {
        var d = p.days[iso];
        if (!d) return;
        [d.egresosM, d.egresosT, d.egresoMayor].forEach(function (arr) {
          filterEgresosPagados(arr || []).forEach(function (r) {
            if (String(r.concepto || '').trim() === c) auto += num(r.valor);
          });
        });
      });
      p.resumen.totalEgresos[c] = auto;
    });
    saveStore();
    toast('Resumen actualizado desde los días del periodo', 'success');
  }

  function applyPeriodDates(fi, ff, nombre) {
    if (!fi || !ff || fi > ff) {
      toast('Rango de fechas inválido', 'warning');
      return;
    }
    var old = period();
    var id = periodId(fi, ff);
    if (store.periods[id]) {
      store.periods[id].nombre = nombre || store.periods[id].nombre;
      store.periods[id].fechaInicio = fi;
      store.periods[id].fechaFin = ff;
      store.activePeriodId = id;
    } else {
      var np = emptyPeriod(fi, ff, nombre);
      if (old && old.id !== id) {
        Object.keys(old.days).forEach(function (iso) {
          if (iso >= fi && iso <= ff) np.days[iso] = old.days[iso];
        });
        np.resumen = old.resumen;
        np.negocio = old.negocio;
      }
      store.periods[id] = np;
      store.activePeriodId = id;
    }
    if (!state.activeDate || state.activeDate < fi || state.activeDate > ff) state.activeDate = fi;
    saveStore();
    toast('Periodo: ' + periodLabel(store.periods[id]), 'success');
  }

  function refreshPlIcons(scope) {
    var el = scope || document.getElementById('crozzo-pl-app');
    if (!el) return;
    if (typeof global.crozzoRefreshLucideIcons === 'function') {
      global.crozzoRefreshLucideIcons(el);
    } else if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons({ nameAttr: 'data-lucide', root: el });
    }
  }

  function renderCierresPosBlock(d) {
    var list = (d && d.cierresPos) || [];
    if (!list.length) {
      return (
        '<div class="crozzo-pl-cierres crozzo-pl-cierres--empty">' +
        '<p><i data-lucide="link"></i> ' +
        (state.ui.guideMode
          ? 'Cuando cierre caja en el POS, los números pueden llegar solos al cuadre. No son obligatorios: puede editarlos o llenar manualmente.'
          : 'Sin cierres importados desde <strong>Cierre de caja</strong>. Al confirmar un arqueo, los datos llegan aquí y rellenan el cuadre (editables).') +
        '</p></div>'
      );
    }
    return (
      '<div class="crozzo-pl-cierres">' +
      '<div class="crozzo-pl-cierres__head">' +
      '<h4 class="crozzo-pl-cierres__title">Cierres POS del día</h4>' +
      '<button type="button" class="btn btn-outline btn-sm" data-pl-cierre-fill-empty title="Solo casillas en cero">Rellenar vacíos</button>' +
      '</div>' +
      '<p class="crozzo-pl-cierres__hint">Los valores del cuadre se sugieren desde el POS. Puede cambiarlos cuando quiera.</p>' +
      '<ul class="crozzo-pl-cierres__list">' +
      list
        .map(function (c) {
          var sheet = c.cuadreSheet || {};
          return (
            '<li class="crozzo-pl-cierre' +
            (c.revisado ? ' is-done' : '') +
            '"><div><strong>' +
            esc(c.shiftLabel || c.shiftType || 'Turno') +
            '</strong> · ' +
            esc(c.closedBy || '—') +
            '<br><span class="crozzo-pl-cierre__meta">Contado ' +
            fmtMoney(c.actual) +
            ' · Venta ' +
            fmtMoney(sheet.totalVendido != null ? sheet.totalVendido : c.totalSales) +
            ' · Δ ' +
            fmtMoney(c.diff) +
            ' · ' +
            (c.salesCount || 0) +
            ' ventas · Cuadre ' +
            (c.shiftType === 'tarde' ? 'tarde' : 'mañana') +
            '</span></div>' +
            '<div class="crozzo-pl-cierre__actions">' +
            '<button type="button" class="btn btn-outline btn-sm" data-pl-cierre-apply="' +
            esc(c.id) +
            '" title="Volver a traer números de este cierre">Aplicar</button>' +
            '<button type="button" class="btn btn-outline btn-sm" data-pl-cierre-ok="' +
            esc(c.id) +
            '">' +
            (c.revisado ? 'Revisado ✓' : 'Marcar revisado') +
            '</button></div></li>'
          );
        })
        .join('') +
      '</ul></div>'
    );
  }

  function bind(root) {
    var scope = root || document.getElementById('crozzo-pl-app') || document.getElementById('crozzo-pl-root');
    if (!scope) return;
    scope.querySelectorAll('[data-pl-cierre-ok]').forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute('data-pl-cierre-ok');
        var d = day();
        if (!d.cierresPos) return;
        d.cierresPos = d.cierresPos.map(function (c) {
          if (c && c.id === id) return Object.assign({}, c, { revisado: true, revisadoAt: new Date().toISOString() });
          return c;
        });
        saveStore();
        toast('Cierre marcado como revisado', 'success');
        rerender();
      };
    });

    scope.querySelectorAll('[data-pl-cierre-apply]').forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute('data-pl-cierre-apply');
        var d = day();
        var row = (d.cierresPos || []).find(function (c) {
          return c && c.id === id;
        });
        if (!row) return;
        var n = applyCierreRowToDay(d, row, { overwrite: true });
        saveStore();
        toast('Cuadre actualizado desde cierre · ' + (n || 0) + ' campos', 'success');
        rerender();
      };
    });

    var fillEmptyBtn = scope.querySelector('[data-pl-cierre-fill-empty]');
    if (fillEmptyBtn) {
      fillEmptyBtn.onclick = function () {
        var d = day();
        var n = syncDayFromCierresPos(d, { onlyEmpty: true });
        saveStore();
        toast(n ? 'Rellenados ' + n + ' campos vacíos desde cierres' : 'No había casillas vacías por rellenar', n ? 'success' : 'info');
        rerender();
      };
    }

    var fcImport = scope.querySelector('[data-pl-fc-import]');
    if (fcImport) {
      fcImport.onclick = function () {
        var d = day();
        var n = importFacturasCargadasFromPos(d, state.activeDate, { overwrite: false });
        saveStore();
        toast(n ? 'Importadas ' + n + ' factura(s) del POS' : 'No hay facturas a crédito nuevas en el POS para este día', n ? 'success' : 'info');
        rerender();
      };
    }
    var fcAdd = scope.querySelector('[data-pl-fc-add]');
    if (fcAdd) {
      fcAdd.onclick = function () {
        var d = day();
        if (!Array.isArray(d.facturasCargadas)) d.facturasCargadas = [];
        d.facturasCargadas.push({
          id: plUid('fc'),
          consecutivo: '',
          cliente: '',
          nit: '',
          valor: 0,
          metodo: 'credito',
          fromPos: false,
          manual: true,
        });
        saveStore();
        rerender();
      };
    }
    scope.querySelectorAll('[data-pl-fc-del]').forEach(function (btn) {
      btn.onclick = function () {
        var idx = parseInt(btn.getAttribute('data-pl-fc-del'), 10);
        var d = day();
        if (!Array.isArray(d.facturasCargadas)) return;
        d.facturasCargadas.splice(idx, 1);
        saveStore();
        rerender();
      };
    });

    function syncFacturasCargadasFromDom() {
      var d = day();
      if (!Array.isArray(d.facturasCargadas)) d.facturasCargadas = [];
      var next = [];
      scope.querySelectorAll('tr[data-pl-fc-idx]').forEach(function (tr) {
        var idx = parseInt(tr.getAttribute('data-pl-fc-idx'), 10);
        var base = d.facturasCargadas[idx] || { id: plUid('fc'), manual: true, fromPos: false };
        var o = Object.assign({}, base);
        tr.querySelectorAll('[data-pl-fc-f]').forEach(function (inp) {
          var f = inp.getAttribute('data-pl-fc-f');
          o[f] = inp.type === 'number' ? num(inp.value) : inp.value;
        });
        if (o.cliente || o.consecutivo || o.valor) next.push(o);
      });
      d.facturasCargadas = next;
      saveStore();
    }

    scope.querySelectorAll('[data-pl-fc-f]').forEach(function (inp) {
      inp.onchange = syncFacturasCargadasFromDom;
    });

    scope.querySelectorAll('[data-pl-tab]').forEach(function (btn) {
      btn.onclick = function () {
        state.tab = btn.getAttribute('data-pl-tab');
        state.ui.kpisOpen = null;
        rerender();
      };
    });

    scope.querySelectorAll('[data-pl-feed-filter]').forEach(function (btn) {
      btn.onclick = function () {
        state.feedFilter = btn.getAttribute('data-pl-feed-filter') || 'pendiente';
        state.feedExpandedId = null;
        rerender();
      };
    });

    scope.querySelectorAll('[data-pl-feed-row]').forEach(function (row) {
      row.onclick = function (ev) {
        if (ev.target.closest('[data-pl-feed-stop]')) return;
        var id = row.getAttribute('data-pl-feed-row');
        state.feedExpandedId = state.feedExpandedId === id ? null : id;
        rerender();
      };
    });

    scope.querySelectorAll('[data-pl-feed-ok]').forEach(function (btn) {
      btn.onclick = function (ev) {
        if (ev.stopPropagation) ev.stopPropagation();
        var res = applyFeedToPlanilla(btn.getAttribute('data-pl-feed-ok'));
        if (res) {
          toast(
            'Volcado a egreso mayor del ' +
              fmtDate(res.fecha) +
              (res.switchedPeriod ? ' (periodo ajustado al mes del pago)' : ''),
            'success'
          );
          rerender();
        }
      };
    });

    scope.querySelectorAll('[data-pl-feed-no]').forEach(function (btn) {
      btn.onclick = function (ev) {
        if (ev.stopPropagation) ev.stopPropagation();
        var rv = reservorioFeed();
        var id = btn.getAttribute('data-pl-feed-no');
        if (rv && rv.updateFeedEstado && id) {
          rv.updateFeedEstado(id, 'rechazado');
          toast('Movimiento rechazado', 'info');
          rerender();
        }
      };
    });

    scope.querySelectorAll('[data-pl-feed-day]').forEach(function (btn) {
      btn.onclick = function (ev) {
        if (ev.stopPropagation) ev.stopPropagation();
        var fecha = btn.getAttribute('data-pl-feed-day');
        if (!fecha) return;
        ensureDayForFeed(fecha);
        saveStore();
        state.tab = 'dia';
        state.ui.egresosOpen = true;
        rerender();
      };
    });

    scope.querySelectorAll('[data-pl-feed-oficina]').forEach(function (btn) {
      btn.onclick = function (ev) {
        if (ev.stopPropagation) ev.stopPropagation();
        var fid = btn.getAttribute('data-pl-feed-oficina');
        if (!fid) return;
        global.__crozzoOficinaExpandId = fid;
        if (typeof global.navigateTo === 'function') global.navigateTo('compras-oficina');
      };
    });

    var bulkOf = document.getElementById('pl-feed-bulk-oficina');
    if (bulkOf) {
      bulkOf.onclick = function () {
        applyAllPendingOficina();
      };
    }

    var refreshFeed = document.getElementById('pl-feed-refresh');
    if (refreshFeed) {
      refreshFeed.onclick = function () {
        rerender();
      };
    }

    scope.querySelectorAll('[data-pl-jump]').forEach(function (btn) {
      btn.onclick = function () {
        jumpToPlSection(btn.getAttribute('data-pl-jump'));
      };
    });

    scope.querySelectorAll('[data-pl-tab-jump]').forEach(function (btn) {
      btn.onclick = function () {
        state.tab = btn.getAttribute('data-pl-tab-jump') || 'cola';
        rerender();
      };
    });

    var guideBtn = document.getElementById('pl-guide-toggle');
    if (guideBtn) {
      guideBtn.onclick = function () {
        state.ui.guideMode = !state.ui.guideMode;
        try {
          localStorage.setItem('crozzo_pl_guide', state.ui.guideMode ? '1' : '0');
        } catch (_) {}
        toast(state.ui.guideMode ? 'Modo guía activado' : 'Modo guía desactivado', 'info');
        rerender();
      };
    }

    var guidePanel = document.getElementById('pl-guide-panel');
    if (guidePanel) {
      guidePanel.addEventListener('toggle', function () {
        state.ui.guidePanelOpen = guidePanel.open;
        try {
          localStorage.setItem('crozzo_pl_guide_open', guidePanel.open ? '1' : '0');
        } catch (_) {}
      });
    }

    var focusBtn = document.getElementById('pl-focus-toggle');
    if (focusBtn) {
      focusBtn.onclick = function () {
        state.ui.focusMode = !state.ui.focusMode;
        try {
          sessionStorage.setItem('crozzo_pl_focus', state.ui.focusMode ? '1' : '0');
        } catch (_) {}
        if (document.body) document.body.classList.toggle('crozzo-pl-focus-mode', state.ui.focusMode);
        rerender();
      };
    }

    var kpisAcc = document.getElementById('pl-kpis-acc');
    if (kpisAcc) {
      kpisAcc.addEventListener('toggle', function () {
        state.ui.kpisOpen = kpisAcc.open;
      });
    }

    scope.querySelectorAll('details[data-pl-acc]').forEach(function (det) {
      det.addEventListener('toggle', function () {
        var id = det.getAttribute('data-pl-acc');
        if (id === 'pl-acc-conteo') state.ui.conteoOpen = det.open;
        if (id === 'pl-acc-propinas') state.ui.propinasOpen = det.open;
        if (id === 'pl-acc-egresos') state.ui.egresosOpen = det.open;
        if (id === 'pl-period-fold') state.ui.periodFoldOpen = det.open;
        if (id === 'pl-guide-panel') state.ui.guidePanelOpen = det.open;
      });
    });

    var sel = document.getElementById('pl-period-sel');
    if (sel) {
      sel.onchange = function () {
        saveStore();
        store.activePeriodId = sel.value;
        var p = period();
        state.activeDate = p.fechaInicio;
        rerender();
      };
    }

    var apply = document.getElementById('pl-period-apply');
    if (apply) {
      apply.onclick = function () {
        var fi = (document.getElementById('pl-period-ini') || {}).value;
        var ff = (document.getElementById('pl-period-fin') || {}).value;
        var nm = (document.getElementById('pl-period-name') || {}).value;
        applyPeriodDates(fi, ff, nm);
        rerender();
      };
    }

    var neu = document.getElementById('pl-period-new');
    if (neu) {
      neu.onclick = function () {
        var fi = (document.getElementById('pl-period-ini') || {}).value || addDays(new Date().toISOString().slice(0, 10), 0);
        var ff = addDays(fi, 30);
        var id = periodId(fi, ff);
        store.periods[id] = emptyPeriod(fi, ff, 'Nuevo corte');
        store.activePeriodId = id;
        state.activeDate = fi;
        saveStore();
        toast('Nuevo periodo creado', 'success');
        rerender();
      };
    }

    var pname = document.getElementById('pl-period-name');
    if (pname) {
      pname.onchange = function () {
        period().nombre = pname.value;
        saveStore();
      };
    }

    var rec = document.getElementById('pl-recalc-resumen');
    if (rec) {
      rec.onclick = function () {
        recalcResumenFromDays();
        rerender();
      };
    }

    var notas = document.getElementById('pl-res-notas');
    if (notas) {
      notas.onchange = function () {
        period().resumen.notas = notas.value;
        saveStore();
      };
    }

    var dateSel = document.getElementById('pl-date-sel');
    if (dateSel) {
      dateSel.onchange = function () {
        saveStore();
        state.activeDate = dateSel.value;
        rerender();
      };
    }

    var prev = document.getElementById('pl-day-prev');
    var next = document.getElementById('pl-day-next');
    if (prev) {
      prev.onclick = function () {
        var dates = datesInPeriod();
        var i = dates.indexOf(state.activeDate);
        if (i > 0) {
          state.activeDate = dates[i - 1];
          saveStore();
          rerender();
        }
      };
    }
    if (next) {
      next.onclick = function () {
        var dates = datesInPeriod();
        var i = dates.indexOf(state.activeDate);
        if (i >= 0 && i < dates.length - 1) {
          state.activeDate = dates[i + 1];
          saveStore();
          rerender();
        }
      };
    }

    var neg = document.getElementById('pl-negocio');
    if (neg) {
      neg.onchange = function () {
        day().negocio = neg.value;
        period().negocio = neg.value;
        saveStore();
      };
    }

    root.querySelectorAll('[data-pl-c]').forEach(function (inp) {
      inp.onchange = function () {
        var p = inp.getAttribute('data-pl-c').split('.');
        day()[p[0]][p[1]] = num(inp.value);
        clearCierreAutoFlag(day(), p[0], p[1]);
        saveStore();
      };
    });

    root.querySelectorAll('[data-pl-prop]').forEach(function (inp) {
      inp.onchange = function () {
        var k = inp.getAttribute('data-pl-prop');
        day().propinas[k] = num(inp.value);
        clearCierreAutoFlag(day(), 'propinas', k);
        saveStore();
      };
    });

    root.querySelectorAll('[data-pl-egprop]').forEach(function (inp) {
      inp.onchange = function () {
        day().egresoPropina[inp.getAttribute('data-pl-egprop')] = num(inp.value);
        saveStore();
      };
    });

    root.querySelectorAll('[data-pl-denom]').forEach(function (inp) {
      inp.onchange = function () {
        var nom = inp.getAttribute('data-pl-denom');
        var df = inp.getAttribute('data-df');
        if (!day().conteo.items[nom]) day().conteo.items[nom] = { cantidad: 0, efectivo: 0 };
        day().conteo.items[nom][df] = num(inp.value);
        recalcConteo();
        saveStore();
      };
    });

    var base = document.getElementById('pl-conteo-base');
    if (base) {
      base.onchange = function () {
        day().conteo.base = num(base.value);
        recalcConteo();
        saveStore();
      };
    }

    function syncEgresosFromDom(prefix) {
      var arr = [];
      root.querySelectorAll('tr[data-pl-eg="' + prefix + '"]').forEach(function (tr) {
        var o = {};
        tr.querySelectorAll('[data-f]').forEach(function (inp) {
          o[inp.getAttribute('data-f')] = inp.type === 'number' ? num(inp.value) : inp.value;
        });
        var sel = tr.querySelector('[data-pl-eg-tipo]');
        if (sel) o.tipoEgreso = sel.value || '';
        if (o.proveedor || o.concepto || o.valor || o.tipoEgreso) arr.push(o);
      });
      day()[prefix] = arr;
      saveStore();
    }

    root.querySelectorAll('[data-pl-add-eg]').forEach(function (btn) {
      btn.onclick = function () {
        day()[btn.getAttribute('data-pl-add-eg')].push({
          nit: '',
          proveedor: '',
          concepto: '',
          descripcion: '',
          valor: 0,
          tipoEgreso: '',
          pagado: true,
        });
        rerender();
      };
    });

    root.querySelectorAll('[data-pl-del-eg]').forEach(function (btn) {
      btn.onclick = function () {
        var tr = btn.closest('tr');
        day()[tr.getAttribute('data-pl-eg')].splice(parseInt(tr.getAttribute('data-pl-idx'), 10), 1);
        rerender();
      };
    });

    root.querySelectorAll('tr[data-pl-eg]').forEach(function (tr) {
      tr.querySelectorAll('input').forEach(function (inp) {
        inp.onchange = function () {
          if (inp.getAttribute('data-f') === 'concepto') inp.removeAttribute('data-pl-auto-concept');
          syncEgresosFromDom(tr.getAttribute('data-pl-eg'));
        };
      });
    });

    root.querySelectorAll('[data-pl-eg-tipo]').forEach(function (sel) {
      sel.onchange = function () {
        var tr = sel.closest('tr');
        if (!tr) return;
        var prefix = sel.getAttribute('data-pl-eg-tipo');
        var tipo = sel.value;
        if (tipo) {
          var conceptInp = tr.querySelector('[data-f="concepto"]');
          if (conceptInp && (!String(conceptInp.value || '').trim() || conceptInp.getAttribute('data-pl-auto-concept'))) {
            var sug = conceptoForTipoEgreso(tipo, {});
            if (sug) {
              conceptInp.value = sug;
              conceptInp.setAttribute('data-pl-auto-concept', '1');
            }
          }
        }
        syncEgresosFromDom(prefix);
        rerender();
      };
    });

    root.querySelectorAll('[data-pl-tot-eg]').forEach(function (inp) {
      inp.onchange = function () {
        period().resumen.totalEgresos[inp.getAttribute('data-pl-tot-eg')] = num(inp.value);
        saveStore();
      };
    });

    root.querySelectorAll('[data-pl-tot-kpi]').forEach(function (inp) {
      inp.onchange = function () {
        if (!period().resumen.totalKpi) period().resumen.totalKpi = {};
        period().resumen.totalKpi[inp.getAttribute('data-pl-tot-kpi')] = num(inp.value);
        saveStore();
      };
    });

    var imp = document.getElementById('pl-import-xlsx');
    var file = document.getElementById('pl-file');
    var exp = document.getElementById('pl-export-xlsx');
    if (imp && file) {
      imp.onclick = function () {
        file.click();
      };
      file.onchange = function () {
        if (file.files && file.files[0]) importXlsx(file.files[0]);
        file.value = '';
      };
    }
    if (exp) exp.onclick = exportXlsx;
  }

  function rerender() {
    var app = document.getElementById('crozzo-pl-app');
    if (app) {
      app.outerHTML = renderRoot();
    } else {
      var mount = document.getElementById('crozzo-pl-mount');
      if (mount) mount.outerHTML = renderRoot();
    }
    var next = document.getElementById('crozzo-pl-app');
    bind(next);
    refreshPlIcons(next);
    if (state.tab === 'nomina' && typeof bindNomina === 'function') bindNomina();
  }

  function ensureXlsx() {
    return new Promise(function (resolve, reject) {
      if (global.XLSX) return resolve(global.XLSX);
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      s.onload = function () {
        resolve(global.XLSX);
      };
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function parseDayToIso(rows, dayNum, p) {
    var dates = datesInPeriod(p);
    var iso = dates[dayNum - 1];
    if (!iso) {
      var y = p.fechaInicio.slice(0, 4);
      var m = p.fechaInicio.slice(5, 7);
      iso = y + '-' + m + '-' + String(dayNum).padStart(2, '0');
      if (iso > p.fechaFin) return;
    }
    var d = emptyDay();
    if (rows[0]) d.negocio = String(rows[0][1] || '').trim() || d.negocio;
    for (var r = 1; r < 11 && r < rows.length; r++) {
      var row = rows[r] || [];
      (TPL.cuadreLabels || []).forEach(function (lbl, i) {
        var key = TPL.cuadreCampos[i];
        if (!key) return;
        var lblM = String(row[6] || '');
        if (lblM.indexOf(lbl.slice(0, 6)) >= 0) d.cuadreM[key] = num(row[7]);
        if (String(row[8] || '').indexOf(lbl.slice(0, 6)) >= 0) d.cuadreT[key] = num(row[9]);
      });
    }
    p.days[iso] = d;
  }

  function importXlsx(file) {
    ensureXlsx()
      .then(function (XLSX) {
        var reader = new FileReader();
        reader.onload = function (ev) {
          try {
            var wb = XLSX.read(ev.target.result, { type: 'array' });
            var p = period();
            for (var i = 1; i <= 31; i++) {
              if (!wb.Sheets[String(i)]) continue;
              parseDayToIso(XLSX.utils.sheet_to_json(wb.Sheets[String(i)], { header: 1, defval: '' }), i, p);
            }
            if (wb.Sheets.DETALLADO) {
              var det = XLSX.utils.sheet_to_json(wb.Sheets.DETALLADO, { header: 1, defval: '' });
              for (var d = 2; d < det.length; d++) {
                var ec = String((det[d] && det[d][1]) || '').trim();
                if (ec && ec !== 'CONCEPTO') p.resumen.totalEgresos[ec] = num((det[d] && det[d][2]) || 0);
              }
            }
            saveStore();
            toast('Excel importado al periodo actual', 'success');
            rerender();
          } catch (e) {
            toast('Error: ' + (e.message || e), 'error');
          }
        };
        reader.readAsArrayBuffer(file);
      })
      .catch(function () {
        toast('No se pudo cargar SheetJS', 'error');
      });
  }

  function exportXlsx() {
    ensureXlsx()
      .then(function (XLSX) {
        var p = period();
        var wb = XLSX.utils.book_new();
        var dates = datesInPeriod(p);
        for (var i = 0; i < dates.length && i < 31; i++) {
          var iso = dates[i];
          var d = p.days[iso] || emptyDay();
          var rows = [[i + 1, d.negocio || p.negocio, '', iso, '', '', 'CUADRE MAÑANA', '', 'CUADRE TARDE']];
          (TPL.cuadreLabels || []).forEach(function (lbl, idx) {
            var k = TPL.cuadreCampos[idx];
            rows.push(['', '', '', '', '', '', lbl, num(d.cuadreM[k]), lbl, num(d.cuadreT[k])]);
          });
          XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), String(i + 1));
        }
        XLSX.writeFile(wb, 'planilla_' + p.fechaInicio + '_' + p.fechaFin + '.xlsx');
        toast('Exportado', 'success');
      })
      .catch(function () {
        toast('No se pudo exportar', 'error');
      });
  }

  global.CrozzoPlanilla2026 = {
    render: function (startTab) {
      state.tab = startTab || 'dia';
      return '<div id="crozzo-pl-mount" class="crozzo-pl-mount"><span>Cargando planillas…</span></div>';
    },
    init: function (startTab) {
      state.tab = startTab || global.__crozzoPlanillaTab || 'dia';
      global.__crozzoPlanillaTab = null;
      try {
        state.ui.focusMode = sessionStorage.getItem('crozzo_pl_focus') === '1';
      } catch (_) {}
      try {
        var g = localStorage.getItem('crozzo_pl_guide');
        state.ui.guideMode = g !== '0';
        state.ui.guidePanelOpen = localStorage.getItem('crozzo_pl_guide_open') === '1';
      } catch (_) {
        state.ui.guideMode = true;
        state.ui.guidePanelOpen = false;
      }
      if (document.body) document.body.classList.toggle('crozzo-pl-focus-mode', !!state.ui.focusMode);
      ensureTpl(function () {
        loadStore();
        var p = period();
        if (!state.activeDate || state.activeDate < p.fechaInicio || state.activeDate > p.fechaFin) {
          state.activeDate = p.fechaInicio;
        }
        if (typeof loadEmpleados === 'function') loadEmpleados();
        if (typeof loadNomina === 'function') loadNomina();
        drainCierreQueue();
        var mount = document.getElementById('crozzo-pl-mount');
        if (!mount) return;
        mount.outerHTML = renderRoot();
        var app = document.getElementById('crozzo-pl-app');
        bind(app);
        refreshPlIcons(app);
        if (state.tab === 'nomina' && typeof bindNomina === 'function') bindNomina();
      });
    }
  };

  global.renderPlanilla2026 = function (tab) {
    return global.CrozzoPlanilla2026.render(tab);
  };
  global.initPlanilla2026 = function (tab) {
    return global.CrozzoPlanilla2026.init(tab);
  };
  global.crozzoPlanillaPageToTab = function (page) {
    if (page === 'nomina-planilla') return 'nomina';
    return null;
  };

  /** Recibe cierre de turno POS → conciliación planilla del día. */
  function resolveCuadreSheet(rec) {
    if (!rec) return null;
    if (rec.cuadreSheet && typeof rec.cuadreSheet === 'object') return rec.cuadreSheet;
    try {
      if (global.CrozzoCierrePrint && typeof global.CrozzoCierrePrint.buildCuadreSheet === 'function') {
        return global.CrozzoCierrePrint.buildCuadreSheet(rec, rec._metrics);
      }
    } catch (_) {}
    var byMethod = rec.byMethod || {};
    var qr = num(byMethod.qr);
    var pse = num(byMethod.pse);
    var datafonos = num(byMethod.tarjeta);
    var efectivoDocs = num(rec.cashSales);
    var gastos = num(rec.gastosTurno);
    var totalReal = num(rec.actual);
    var totalVendido = num(rec.totalSales);
    var descuadre = num(rec.diff);
    var totalSumado = totalReal + efectivoDocs + datafonos + gastos;
    return {
      fondo: num(rec.fondo),
      efectivoDocumentos: efectivoDocs,
      datafonos: datafonos,
      transferencias: qr + pse,
      gastos: gastos,
      totalSumado: totalSumado,
      totalVendido: totalVendido,
      totalReal: totalReal,
      descuadre: descuadre,
      propinasEfectivo: 0,
      propinasDatafono: 0,
      propinasTotal: 0,
    };
  }

  function cuadrePrefixForShift(shiftType) {
    if (shiftType === 'tarde') return 'cuadreT';
    return 'cuadreM';
  }

  function markCierreAuto(d, prefix, field, cierreId) {
    if (!d) return;
    if (!d._cierreAuto) d._cierreAuto = {};
    d._cierreAuto[cierreAutoKey(prefix, field)] = cierreId || true;
  }

  function clearCierreAutoFlag(d, prefix, field) {
    if (!d || !d._cierreAuto) return;
    delete d._cierreAuto[cierreAutoKey(prefix, field)];
  }

  function shouldFillField(obj, key, onlyEmpty) {
    if (!onlyEmpty) return true;
    var v = obj && obj[key];
    return v == null || v === '' || num(v) === 0;
  }

  function setCuadreField(d, prefix, key, value, cierreId, opts) {
    opts = opts || {};
    if (value == null || !isFinite(Number(value))) return false;
    var block = d[prefix];
    if (!block) return false;
    if (!shouldFillField(block, key, opts.onlyEmpty)) return false;
    block[key] = num(value);
    if (opts.trackAuto !== false) markCierreAuto(d, prefix, key, cierreId);
    return true;
  }

  function setPropinaField(d, key, value, cierreId, opts) {
    opts = opts || {};
    if (value == null || !isFinite(Number(value))) return false;
    if (!d.propinas) d.propinas = emptyDay().propinas;
    if (!shouldFillField(d.propinas, key, opts.onlyEmpty)) return false;
    d.propinas[key] = num(value);
    if (opts.trackAuto !== false) markCierreAuto(d, 'propinas', key, cierreId);
    return true;
  }

  function applySheetToCuadre(d, prefix, sheet, cierreId, opts) {
    if (!d || !sheet || !prefix) return 0;
    var n = 0;
    var map = [
      ['propBanco', sheet.propinasDatafono],
      ['propEfectivo', sheet.propinasEfectivo],
      ['gasto', sheet.gastos],
      ['transferencia', sheet.transferencias],
      ['banco', sheet.datafonos],
      ['efectivo', sheet.efectivoDocumentos],
      ['total', sheet.totalSumado],
      ['diferencia', sheet.descuadre],
      ['totalVenta', sheet.totalVendido],
    ];
    map.forEach(function (pair) {
      if (num(pair[1]) === 0 && pair[0].indexOf('prop') === 0) return;
      if (setCuadreField(d, prefix, pair[0], pair[1], cierreId, opts)) n += 1;
    });
    if (num(sheet.totalSumado) === 0) {
      var sum =
        num(sheet.efectivoDocumentos) +
        num(sheet.datafonos) +
        num(sheet.transferencias) +
        num(sheet.gastos);
      if (sum > 0 && setCuadreField(d, prefix, 'total', sum, cierreId, opts)) n += 1;
    }
    return n;
  }

  function applySheetToPropinasDay(d, rec, sheet, cierreId, opts) {
    if (!d || !sheet) return 0;
    var n = 0;
    var st = rec && rec.shiftType;
    if (st === 'tarde' || st === 'dia') {
      if (setPropinaField(d, 'efectivoReal', sheet.totalReal, cierreId, opts)) n += 1;
      if (setPropinaField(d, 'diferencia', sheet.descuadre, cierreId, opts)) n += 1;
    }
    if (setPropinaField(d, 'facturasEfectivo', sheet.efectivoDocumentos || (rec && rec.cashSales), cierreId, opts)) n += 1;
    if (st === 'tarde' || st === 'dia') {
      if (setPropinaField(d, 'efectivo', sheet.propinasEfectivo, cierreId, opts)) n += 1;
      if (setPropinaField(d, 'banco', sheet.propinasDatafono, cierreId, opts)) n += 1;
    }
    return n;
  }

  function applyConteoFromCierre(d, sheet, opts) {
    if (!d || !sheet || !d.conteo) return 0;
    opts = opts || {};
    if (!shouldFillField(d.conteo, 'base', opts.onlyEmpty)) return 0;
    var fondo = num(sheet.fondo);
    if (fondo <= 0) return 0;
    d.conteo.base = fondo;
    markCierreAuto(d, 'conteo', 'base', opts.cierreId);
    return 1;
  }

  function cierreRowFromRec(rec, sheet) {
    var cid = String(rec.shiftId || rec.closedAt || Date.now());
    return {
      id: cid,
      shiftType: rec.shiftType,
      shiftLabel: rec.shiftLabel,
      closedAt: rec.closedAt,
      closedBy: rec.closedBy,
      actual: num(rec.actual),
      expected: num(rec.expected),
      diff: num(rec.diff),
      cashSales: num(rec.cashSales),
      totalSales: num(rec.totalSales),
      salesCount: num(rec.salesCount),
      fondo: num(rec.fondo),
      gastosTurno: num(rec.gastosTurno),
      byMethod: rec.byMethod || {},
      facturasCargadas: num(rec.facturasCargadas),
      facturasCargadasList: rec.facturasCargadasList || [],
      notes: rec.notes || '',
      cuadreSheet: sheet,
      planillaSyncAt: new Date().toISOString(),
      revisado: false,
    };
  }

  function applyCierreRowToDay(d, row, opts) {
    opts = opts || {};
    if (!d || !row) return 0;
    var fillOpts = {
      onlyEmpty: !opts.overwrite && opts.onlyEmpty !== false,
      trackAuto: opts.trackAuto !== false,
    };
    var sheet = row.cuadreSheet || resolveCuadreSheet(row);
    if (!sheet) return 0;
    row.cuadreSheet = sheet;
    var prefix = cuadrePrefixForShift(row.shiftType);
    markCuadreTurnoMeta(d, prefix, row);
    var n = applySheetToCuadre(d, prefix, sheet, row.id, fillOpts);
    n += applySheetToPropinasDay(d, row, sheet, row.id, fillOpts);
    n += applyConteoFromCierre(d, sheet, { onlyEmpty: fillOpts.onlyEmpty, cierreId: row.id });
    if (row.facturasCargadasList && row.facturasCargadasList.length) {
      n += mergeFacturasCargadasRows(
        d,
        row.facturasCargadasList.map(function (it) {
          return {
            id: plUid('fc'),
            uuid: it.uuid || '',
            consecutivo: it.consecutivo || '',
            cliente: it.cliente || '',
            nit: it.nit || '',
            valor: num(it.valor),
            metodo: it.metodo || 'credito',
            fromPos: true,
            manual: false,
            shiftType: row.shiftType || '',
          };
        }),
        { overwrite: !!opts.overwrite }
      );
    }
    if (row.shiftType && d.posRecomendado) {
      d.posRecomendado.facturasCargadas = Math.max(num(d.posRecomendado.facturasCargadas), num(row.facturasCargadas));
    }
    return n;
  }

  function syncDayFromCierresPos(d, opts) {
    opts = opts || {};
    if (!d || !Array.isArray(d.cierresPos) || !d.cierresPos.length) return 0;
    var total = 0;
    d.cierresPos.slice().reverse().forEach(function (row) {
      if (!row) return;
      total += applyCierreRowToDay(d, row, opts);
    });
    return total;
  }

  function importCierresFromHistory(iso) {
    try {
      var histKey = global.CROZZO_SHIFT_TURN_HIST;
      if (!histKey) return 0;
      var rows = JSON.parse(localStorage.getItem(histKey) || '[]');
      var added = 0;
      var d = ensureDay(iso);
      if (!Array.isArray(d.cierresPos)) d.cierresPos = [];
      rows.forEach(function (rec) {
        if (!rec || rec.businessDate !== iso) return;
        if (rec.recordKind && rec.recordKind !== 'cierre') return;
        var sheet = resolveCuadreSheet(rec);
        var row = cierreRowFromRec(rec, sheet);
        row.revisado = true;
        row.importedFromHistory = true;
        if (
          d.cierresPos.some(function (c) {
            return c && c.id === row.id;
          })
        )
          return;
        d.cierresPos.push(row);
        added += 1;
      });
      return added;
    } catch (_) {
      return 0;
    }
  }

  function maybeBackfillDayFromCierres(d, iso) {
    if (!d || !iso) return false;
    var changed = false;
    if (!Array.isArray(d.cierresPos)) d.cierresPos = [];
    if (!d.cierresPos.length) {
      changed = importCierresFromHistory(iso) > 0;
    }
    if (!d.cierresPos.length) return changed;
    var cuadreEmpty =
      !num(d.cuadreM.totalVenta) &&
      !num(d.cuadreT.totalVenta) &&
      !num(d.cuadreM.efectivo) &&
      !num(d.cuadreT.efectivo);
    if (cuadreEmpty && syncDayFromCierresPos(d, { onlyEmpty: true }) > 0) changed = true;
    return changed;
  }

  function applyCierreFromShift(rec) {
    if (!rec || !rec.businessDate) return { ok: false, reason: 'sin_fecha' };
    if (rec.recordKind && rec.recordKind !== 'cierre') return { ok: false, reason: 'no_cierre' };
    try {
      loadStore();
      var iso = rec.businessDate;
      var p = period();
      if (iso < p.fechaInicio || iso > p.fechaFin) {
        var dm = defaultMonthPeriod(new Date(iso + 'T12:00:00'));
        var id = periodId(dm.fi, dm.ff);
        if (!store.periods[id]) store.periods[id] = emptyPeriod(dm.fi, dm.ff, 'Mes calendario');
        store.activePeriodId = id;
        p = store.periods[id];
      }
      var d = ensureDay(iso);
      if (!Array.isArray(d.cierresPos)) d.cierresPos = [];
      var sheet = resolveCuadreSheet(rec);
      var row = cierreRowFromRec(rec, sheet);
      var cid = row.id;
      var found = false;
      d.cierresPos = d.cierresPos.map(function (c) {
        if (c && c.id === cid) {
          found = true;
          row.revisado = c.revisado;
          return row;
        }
        return c;
      });
      if (!found) d.cierresPos.unshift(row);
      var fields = applyCierreRowToDay(d, row, { overwrite: true });
      refreshPosRecomendado(d, iso);
      saveStore();
      return { ok: true, fields: fields };
    } catch (e) {
      return { ok: false, reason: String(e && e.message ? e.message : e) };
    }
  }

  function drainCierreQueue() {
    try {
      var q = JSON.parse(localStorage.getItem('crozzo_planilla_cierre_pending_v1') || '[]');
      if (!q.length) return 0;
      var left = [];
      var applied = 0;
      q.forEach(function (rec) {
        if (!rec || rec.recordKind !== 'cierre') {
          if (rec) left.push(rec);
          return;
        }
        var r = applyCierreFromShift(rec);
        if (r && r.ok) applied += 1;
        else left.push(rec);
      });
      localStorage.setItem('crozzo_planilla_cierre_pending_v1', JSON.stringify(left.slice(0, 48)));
      return applied;
    } catch (_) {
      return 0;
    }
  }

  function cierrePendienteCount() {
    try {
      loadStore();
      var p = period();
      var n = 0;
      datesInPeriod(p).forEach(function (iso) {
        var d = p.days[iso];
        if (!d || !Array.isArray(d.cierresPos)) return;
        d.cierresPos.forEach(function (c) {
          if (c && !c.revisado) n += 1;
        });
      });
      return n;
    } catch (_) {
      return 0;
    }
  }

  function getDayCuadreHints(iso, shiftType) {
    try {
      loadStore();
      var d = ensureDay(iso);
      var gastos = 0;
      if (shiftType === 'tarde') gastos = sumEgresosPagados(d.egresosT);
      else if (shiftType === 'dia')
        gastos = sumEgresosPagados(d.egresosM) + sumEgresosPagados(d.egresosT) + sumEgresosPagados(d.egresoMayor);
      else gastos = sumEgresosPagados(d.egresosM);
      return {
        gastosPlanilla: gastos,
        propinas: d.propinas || {},
        cuadreM: d.cuadreM || {},
        cuadreT: d.cuadreT || {},
      };
    } catch (_) {
      return { gastosPlanilla: 0, propinas: {}, cuadreM: {}, cuadreT: {} };
    }
  }

  global.crozzoPlanillaApplyCierreFromShift = applyCierreFromShift;
  global.crozzoPlanillaDrainCierreQueue = drainCierreQueue;
  global.crozzoPlanillaCierrePendienteCount = cierrePendienteCount;
  global.crozzoPlanillaDayCuadreHints = getDayCuadreHints;
  global.crozzoPlanillaPosVentasRecomendado = buildPosVentasRecomendado;
  global.crozzoPlanillaFeedPendingCount = feedPendingCount;
  global.crozzoOpenPlanillaCola = function () {
    global.__crozzoPlanillaTab = 'cola';
    if (typeof global.navigateTo === 'function') global.navigateTo('nomina-planilla');
  };
  global._crozzoPlFeedRerender = function () {
    if (state.tab === 'cola' && document.getElementById('crozzo-pl-app')) rerender();
  };
  if (typeof document !== 'undefined' && !global._crozzoPlFeedListener) {
    global._crozzoPlFeedListener = true;
    document.addEventListener('crozzo-costos:feed-planilla', function () {
      if (typeof global._crozzoPlFeedRerender === 'function') global._crozzoPlFeedRerender();
    });
  }
  setTimeout(function () {
    try {
      drainCierreQueue();
    } catch (_) {}
  }, 0);
})(typeof window !== 'undefined' ? window : globalThis);
