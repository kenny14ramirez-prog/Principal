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
    ui: { conteoOpen: false, propinasOpen: false, egresosOpen: false, egresoMayorOpen: false },
    tplLoaded: false
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
    (TPL.cuadreCampos || []).forEach(function (k) {
      o[k] = 0;
    });
    return o;
  }

  function emptyDay() {
    var conteo = {};
    (TPL.denoms || []).forEach(function (dn) {
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
      egresoPropina: { transf: 0, banco: 0, efectivo: 0 }
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
      agg.egresosValor += sumEgresos(d.egresosM) + sumEgresos(d.egresosT) + sumEgresos(d.egresoMayor);
      agg.conteoEfectivo += num(d.conteo && d.conteo.totalEfectivo);
      agg.propinasEfectivo += num(d.propinas && d.propinas.efectivo);
    });
    return agg;
  }

  function sumEgresos(arr) {
    return (arr || []).reduce(function (s, r) {
      return s + num(r.valor);
    }, 0);
  }

  function ensureTpl(cb) {
    if (TPL && state.tplLoaded) {
      cb();
      return;
    }
    fetch('CrozzoPlanilla2026.template.json')
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
    if (document.getElementById('crozzo-planilla-css')) return;
    var el = document.createElement('style');
    el.id = 'crozzo-planilla-css';
    el.textContent =
      'body.crozzo-page-planillas .main-body,#mainContent.main-body--planillas{padding:0!important;overflow:hidden!important;min-height:0!important;height:auto!important;flex:1 1 auto!important;background:var(--bg-primary)}' +
      'html.crozzo-vp-ready body.crozzo-page-planillas .main-body,html.crozzo-vp-ready #mainContent.main-body--planillas{overflow:hidden!important}' +
      '.crozzo-pl-app{position:relative;display:flex;flex-direction:column;height:100%;max-height:100%;min-height:0;overflow:hidden;background:var(--bg-primary);color:var(--text-primary);font-family:var(--font-sans,system-ui,sans-serif)}' +
      '.crozzo-pl-app::before{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse 70% 45% at 0% 0%,color-mix(in srgb,var(--accent) 14%,transparent),transparent 55%),radial-gradient(ellipse 50% 35% at 100% 0%,color-mix(in srgb,var(--accent) 8%,transparent),transparent 50%);opacity:.9}' +
      '.crozzo-pl-hero{position:relative;z-index:1;flex-shrink:0;padding:20px 24px 16px;border-bottom:1px solid var(--border);background:linear-gradient(180deg,color-mix(in srgb,var(--bg-card) 96%,transparent),var(--bg-primary))}' +
      '.crozzo-pl-hero__row{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:16px}' +
      '.crozzo-pl-eyebrow{margin:0 0 6px;font-size:10px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:var(--accent)}' +
      '.crozzo-pl-title{margin:0;font-size:1.65rem;font-weight:700;letter-spacing:-.03em;line-height:1.15}' +
      '.crozzo-pl-sub{margin:8px 0 0;font-size:13px;color:var(--text-muted);max-width:520px;line-height:1.55}' +
      '.crozzo-pl-hero__chips{display:flex;flex-wrap:wrap;gap:8px;align-items:center}' +
      '.crozzo-pl-pill{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;font-size:11px;font-weight:600;border:1px solid var(--border);background:var(--bg-card);color:var(--text-secondary)}' +
      '.crozzo-pl-pill--accent{border-color:color-mix(in srgb,var(--accent) 35%,var(--border));background:color-mix(in srgb,var(--accent) 12%,var(--bg-card));color:var(--text-primary)}' +
      '.crozzo-pl-flow{display:flex;flex-wrap:wrap;gap:6px;padding:12px 24px;border-bottom:1px solid var(--border);background:var(--bg-secondary);flex-shrink:0;position:relative;z-index:1}' +
      '.crozzo-pl-flow__step{font-size:10px;font-weight:600;letter-spacing:.04em;padding:6px 12px;border-radius:999px;border:1px solid var(--border);color:var(--text-muted);background:var(--bg-card)}' +
      '.crozzo-pl-flow__step.is-on{border-color:color-mix(in srgb,var(--accent) 40%,var(--border));color:var(--text-primary);background:color-mix(in srgb,var(--accent) 10%,var(--bg-card))}' +
      '.crozzo-pl-tabs{display:flex;flex-wrap:wrap;gap:8px;padding:12px 24px;border-bottom:1px solid var(--border);background:var(--bg-card);flex-shrink:0;position:relative;z-index:1}' +
      '.crozzo-pl-tabs button{display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border-radius:10px;border:1px solid transparent;background:transparent;cursor:pointer;font-size:12px;font-weight:600;color:var(--text-muted);font-family:inherit;transition:background .2s,border-color .2s,color .2s,transform .15s}' +
      '.crozzo-pl-tabs button:hover{color:var(--text-primary);background:var(--bg-secondary);transform:translateY(-1px)}' +
      '.crozzo-pl-tabs button.active{background:linear-gradient(135deg,color-mix(in srgb,var(--accent) 22%,var(--bg-card)),var(--bg-card));color:var(--text-primary);border-color:color-mix(in srgb,var(--accent) 35%,var(--border));box-shadow:0 4px 16px rgba(0,0,0,.12)}' +
      '.crozzo-pl-stage{flex:1;min-height:0;overflow-x:hidden;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding:16px 24px 28px;position:relative;z-index:1}' +
      '.crozzo-pl-panel{background:var(--bg-card);border:1px solid var(--border);border-radius:14px;box-shadow:var(--elevation-1,0 1px 3px rgba(0,0,0,.08));overflow:hidden}' +
      '.crozzo-pl-panel__head{padding:14px 18px;border-bottom:1px solid var(--border);display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px}' +
      '.crozzo-pl-panel__head h3{margin:0;font-size:0.95rem;font-weight:650}' +
      '.crozzo-pl-panel__body{padding:16px 18px}' +
      '.crozzo-pl-root{--pl-gap:12px}' +
      '.crozzo-pl-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;padding:14px 16px;background:color-mix(in srgb,var(--bg-secondary) 80%,var(--bg-card));border:1px solid var(--border);border-radius:12px;margin-bottom:var(--pl-gap)}' +
      '.crozzo-pl-toolbar .form-group{margin:0;min-width:140px}' +
      '.crozzo-pl-kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-bottom:var(--pl-gap)}' +
      '.crozzo-pl-kpi{padding:14px 16px;border-radius:12px;border:1px solid var(--border);background:linear-gradient(145deg,var(--bg-card),color-mix(in srgb,var(--accent) 6%,var(--bg-card)));transition:transform .2s,box-shadow .2s}' +
      '.crozzo-pl-kpi:hover{transform:translateY(-2px);box-shadow:var(--elevation-2,0 4px 12px rgba(0,0,0,.1))}' +
      '.crozzo-pl-kpi .val{font-size:1.2rem;font-weight:800;font-variant-numeric:tabular-nums}' +
      '.crozzo-pl-kpi .lbl{font-size:10px;opacity:.72;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px}' +
      '.crozzo-pl-grid{display:grid;grid-template-columns:1fr 1fr;gap:var(--pl-gap)}@media(max-width:900px){.crozzo-pl-grid{grid-template-columns:1fr}}' +
      '.crozzo-pl-acc{border:1px solid var(--border);border-radius:12px;margin-bottom:10px;background:var(--bg-card);overflow:hidden;transition:box-shadow .2s}' +
      '.crozzo-pl-acc[open]{box-shadow:var(--elevation-1,0 2px 8px rgba(0,0,0,.06))}' +
      '.crozzo-pl-acc summary{padding:13px 16px;cursor:pointer;font-weight:700;font-size:0.88rem;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:8px;user-select:none;background:color-mix(in srgb,var(--bg-secondary) 50%,transparent)}' +
      '.crozzo-pl-acc summary::-webkit-details-marker{display:none}' +
      '.crozzo-pl-acc summary::after{content:"";width:8px;height:8px;border-right:2px solid var(--text-muted);border-bottom:2px solid var(--text-muted);transform:rotate(-45deg);transition:transform .2s}' +
      '.crozzo-pl-acc[open] summary::after{transform:rotate(45deg)}' +
      '.crozzo-pl-acc__body{padding:0 16px 16px;border-top:1px solid var(--border)}' +
      '.crozzo-pl-cuadre{display:grid;grid-template-columns:1fr auto 1fr auto;gap:6px 10px;align-items:center;font-size:12px}' +
      '.crozzo-pl-cuadre .lbl{opacity:.78;font-size:11px}' +
      '.crozzo-pl-dia-nav{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px}' +
      '.crozzo-pl-badge{font-size:11px;padding:5px 12px;border-radius:999px;background:color-mix(in srgb,var(--accent) 16%,transparent);font-weight:600;border:1px solid color-mix(in srgb,var(--accent) 25%,transparent)}' +
      '.crozzo-pl-mount{min-height:120px;display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:13px}' +
      'html[data-theme="bona-origen"] .crozzo-pl-app{background:var(--bona-cream,#faf9f7)}' +
      'html[data-theme="bona-origen"] .crozzo-pl-hero{background:#fff}' +
      'html[data-theme="bona-origen"] .crozzo-pl-title{font-family:var(--bona-font-display,serif)}';
    document.head.appendChild(el);
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

  function flowStepsHtml() {
    var steps = [
      { id: 'dia', label: '1 · Día a día' },
      { id: 'mes', label: '2 · Resumen' },
      { id: 'nomina', label: '3 · Nómina' },
      { id: 'archivo', label: '4 · Excel' }
    ];
    return (
      '<div class="crozzo-pl-flow">' +
      steps
        .map(function (s) {
          return (
            '<span class="crozzo-pl-flow__step' +
            (state.tab === s.id ? ' is-on' : '') +
            '">' +
            esc(s.label) +
            '</span>'
          );
        })
        .join('') +
      '</div>'
    );
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
      '<label class="form-label">Periodo de corte</label>' +
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
      '<button type="button" class="btn btn-primary btn-sm" id="pl-period-apply">Aplicar fechas</button>' +
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

  function renderCuadreBlock(title, obj, prefix) {
    var html = '<div style="padding-top:10px"><h4 style="margin:0 0 8px;font-size:0.85rem">' + esc(title) + '</h4><div class="crozzo-pl-cuadre">';
    (TPL.cuadreCampos || []).forEach(function (k, i) {
      var lbl = (TPL.cuadreLabels && TPL.cuadreLabels[i]) || k;
      html +=
        '<span class="lbl">' +
        esc(lbl) +
        '</span><input type="number" class="form-input" style="width:100px" data-pl-c="' +
        prefix +
        '.' +
        k +
        '" value="' +
        num(obj[k]) +
        '" step="1" />';
    });
    return html + '</div></div>';
  }

  function renderEgresosTable(rows, prefix) {
    var body = (rows || [])
      .map(function (r, idx) {
        return (
          '<tr data-pl-eg="' +
          prefix +
          '" data-pl-idx="' +
          idx +
          '"><td><input class="form-input" data-f="nit" value="' +
          esc(r.nit || '') +
          '" /></td>' +
          '<td><input class="form-input" data-f="proveedor" value="' +
          esc(r.proveedor || '') +
          '" /></td>' +
          '<td><input class="form-input" data-f="concepto" value="' +
          esc(r.concepto || '') +
          '" /></td>' +
          '<td><input class="form-input" data-f="descripcion" value="' +
          esc(r.descripcion || '') +
          '" /></td>' +
          '<td><input type="number" class="form-input" style="width:90px" data-f="valor" value="' +
          num(r.valor) +
          '" /></td>' +
          '<td><button type="button" class="btn btn-outline btn-sm" data-pl-del-eg>✕</button></td></tr>'
        );
      })
      .join('');
    return (
      '<div style="padding-top:8px;overflow:auto">' +
      '<table class="data-table"><thead><tr><th>NIT</th><th>Proveedor</th><th>Concepto</th><th>Descripción</th><th>Valor</th><th></th></tr></thead><tbody>' +
      (body || '<tr><td colspan="6" style="text-align:center;opacity:.6">Sin líneas</td></tr>') +
      '</tbody></table>' +
      '<button type="button" class="btn btn-outline btn-sm" style="margin-top:8px" data-pl-add-eg="' +
      prefix +
      '">+ Agregar línea</button></div>'
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
    return renderAccordion('pl-acc-conteo', 'Conteo de efectivo (monedas y billetes)', fmtMoney(d.conteo.totalEfectivo), state.ui.conteoOpen, inner);
  }

  function renderDia() {
    var p = period();
    var d = day();
    var dates = datesInPeriod(p);
    var idx = dates.indexOf(state.activeDate);
    var opts = dates
      .map(function (iso) {
        return '<option value="' + iso + '"' + (iso === state.activeDate ? ' selected' : '') + '>' + fmtDate(iso) + '</option>';
      })
      .join('');
    var propGrid = Object.keys(PROP_LABELS)
      .map(function (k) {
        return (
          '<div class="form-group"><label class="form-label">' +
          esc(PROP_LABELS[k]) +
          '</label><input type="number" class="form-input" data-pl-prop="' +
          k +
          '" value="' +
          num(d.propinas[k]) +
          '" /></div>'
        );
      })
      .join('');
    return (
      renderPeriodToolbar() +
      '<div class="crozzo-pl-dia-nav">' +
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
      '" />' +
      '</div>' +
      '<div class="crozzo-pl-grid">' +
      renderCuadreBlock('Turno mañana', d.cuadreM, 'cuadreM') +
      renderCuadreBlock('Turno tarde', d.cuadreT, 'cuadreT') +
      '</div>' +
      renderAccordion('pl-acc-egresos', 'Egresos y compras del día', 'Mañana + tarde + caja mayor', state.ui.egresosOpen, renderEgresosTable(d.egresosM, 'egresosM') + renderEgresosTable(d.egresosT, 'egresosT') + '<h4 style="margin:14px 0 6px;font-size:0.85rem">Egreso caja mayor</h4>' + renderEgresosTable(d.egresoMayor, 'egresoMayor')) +
      renderAccordion('pl-acc-propinas', 'Propinas y cierre', null, state.ui.propinasOpen, '<div class="form-grid" style="padding-top:10px">' + propGrid + '</div>') +
      renderConteoAccordion(d) +
      renderAccordion('pl-acc-egprop', 'Egreso propina', null, false, '<div class="form-grid" style="padding-top:10px">' + ['transf', 'banco', 'efectivo'].map(function (k) { return '<div class="form-group"><label class="form-label">' + esc(k) + '</label><input type="number" class="form-input" data-pl-egprop="' + k + '" value="' + num(d.egresoPropina[k]) + '" /></div>'; }).join('') + '</div>')
    );
  }

  function renderMes() {
    var p = period();
    var agg = aggregatePeriod(p);
    var res = p.resumen || emptyResumen();
    var rows = (TPL.egresosConceptos || [])
      .slice(0, 40)
      .map(function (c) {
        var auto = 0;
        datesInPeriod(p).forEach(function (iso) {
          var d = p.days[iso];
          if (!d) return;
          [d.egresosM, d.egresosT, d.egresoMayor].forEach(function (arr) {
            (arr || []).forEach(function (r) {
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
      renderPeriodToolbar() +
      '<p class="page-subtitle" style="margin:0 0 12px">Resumen del periodo <strong>' +
      esc(periodLabel(p)) +
      '</strong>. Los registros día a día se conservan; aquí define el rango que está gestionando.</p>' +
      '<div class="crozzo-pl-kpis">' +
      '<div class="crozzo-pl-kpi"><div class="lbl">Días con datos</div><div class="val">' +
      agg.diasConDatos +
      '</div></div>' +
      '<div class="crozzo-pl-kpi"><div class="lbl">Ventas (M+T)</div><div class="val">' +
      fmtMoney(agg.totalVentaM + agg.totalVentaT) +
      '</div></div>' +
      '<div class="crozzo-pl-kpi"><div class="lbl">Egresos en días</div><div class="val">' +
      fmtMoney(agg.egresosValor) +
      '</div></div>' +
      '<div class="crozzo-pl-kpi"><div class="lbl">Conteo efectivo</div><div class="val">' +
      fmtMoney(agg.conteoEfectivo) +
      '</div></div>' +
      '</div>' +
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
      renderPeriodToolbar() +
      '<div class="crozzo-pl-acc" open><summary><span>Archivo Excel</span></summary><div class="crozzo-pl-acc__body">' +
      '<p class="page-subtitle">Importe o exporte la planilla. Los <strong>periodos de corte</strong> se guardan por separado en este equipo.</p>' +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;margin:12px 0">' +
      '<a class="btn btn-outline btn-sm" href="assets/2026-PLANILLA-BLANCO.xlsx" download="2026-PLANILLA-BLANCO.xlsx">⬇ Plantilla vacía</a>' +
      '<button type="button" class="btn btn-primary btn-sm" id="pl-import-xlsx">📥 Importar Excel</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="pl-export-xlsx">📤 Exportar periodo actual</button>' +
      '</div><input type="file" id="pl-file" accept=".xlsx,.xls" style="display:none" /></div></details>'
    );
  }

  function renderNominaEmbed() {
    if (typeof renderNominaPlanilla === 'function') {
      return renderPeriodToolbar() + '<div class="alert alert-info" style="margin-bottom:12px;font-size:0.85rem">Horas nocturnas, festivos y dominicales — empleados de <strong>Marcación personal</strong>.</div>' + renderNominaPlanilla();
    }
    return renderPeriodToolbar() + '<div class="card"><p>Cargue CrozzoModulosIntegrados.js</p></div>';
  }

  function renderRoot() {
    injectStyles();
    var tabs = [
      { id: 'dia', label: 'Día a día', icon: 'calendar-days' },
      { id: 'mes', label: 'Resumen periodo', icon: 'bar-chart-3' },
      { id: 'nomina', label: 'Turnos y nómina', icon: 'users' },
      { id: 'archivo', label: 'Excel', icon: 'file-spreadsheet' }
    ];
    var inner = '';
    if (state.tab === 'dia') inner = renderDia();
    else if (state.tab === 'mes') inner = renderMes();
    else if (state.tab === 'nomina') inner = renderNominaEmbed();
    else inner = renderArchivo();

    var p = period();
    var tabBtns = tabs
      .map(function (t) {
        return (
          '<button type="button" class="' +
          (state.tab === t.id ? 'active' : '') +
          '" data-pl-tab="' +
          t.id +
          '" title="' +
          esc(t.label) +
          '"><i data-lucide="' +
          esc(t.icon) +
          '" aria-hidden="true"></i><span>' +
          esc(t.label) +
          '</span></button>'
        );
      })
      .join('');

    return (
      '<section class="crozzo-pl-app" id="crozzo-pl-app">' +
      '<header class="crozzo-pl-hero">' +
      '<div class="crozzo-pl-hero__row">' +
      '<div><p class="crozzo-pl-eyebrow">Administrativo · Nómina</p>' +
      '<h1 class="crozzo-pl-title">Planillas</h1>' +
      '<p class="crozzo-pl-sub">Cuadre de caja por turno, egresos, propinas, resumen del periodo e importación desde Excel. Todo queda guardado en este equipo.</p></div>' +
      '<div class="crozzo-pl-hero__chips">' +
      '<span class="crozzo-pl-pill crozzo-pl-pill--accent"><i data-lucide="calendar-range" aria-hidden="true"></i> ' +
      esc(periodLabel(p)) +
      '</span>' +
      '<span class="crozzo-pl-pill"><i data-lucide="hard-drive" aria-hidden="true"></i> Respaldo local</span>' +
      '</div></div></header>' +
      flowStepsHtml() +
      '<nav class="crozzo-pl-tabs" aria-label="Secciones planilla">' +
      tabBtns +
      '</nav>' +
      '<main class="crozzo-pl-stage">' +
      '<div class="crozzo-pl-root" id="crozzo-pl-root">' +
      periodKpisHtml() +
      '<div class="crozzo-pl-panel"><div class="crozzo-pl-panel__head"><h3>Trabajo del periodo</h3><span class="crozzo-pl-badge">Paso ' +
      (state.tab === 'dia' ? '1' : state.tab === 'mes' ? '2' : state.tab === 'nomina' ? '3' : '4') +
      ' de 4</span></div><div class="crozzo-pl-panel__body">' +
      inner +
      '</div></div></div></main></section>'
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
          (arr || []).forEach(function (r) {
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

  function bind(root) {
    var scope = root || document.getElementById('crozzo-pl-app') || document.getElementById('crozzo-pl-root');
    if (!scope) return;
    scope.querySelectorAll('[data-pl-tab]').forEach(function (btn) {
      btn.onclick = function () {
        state.tab = btn.getAttribute('data-pl-tab');
        rerender();
      };
    });

    scope.querySelectorAll('details[data-pl-acc]').forEach(function (det) {
      det.addEventListener('toggle', function () {
        var id = det.getAttribute('data-pl-acc');
        if (id === 'pl-acc-conteo') state.ui.conteoOpen = det.open;
        if (id === 'pl-acc-propinas') state.ui.propinasOpen = det.open;
        if (id === 'pl-acc-egresos') state.ui.egresosOpen = det.open;
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
        saveStore();
      };
    });

    root.querySelectorAll('[data-pl-prop]').forEach(function (inp) {
      inp.onchange = function () {
        day().propinas[inp.getAttribute('data-pl-prop')] = num(inp.value);
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
        if (o.proveedor || o.concepto || o.valor) arr.push(o);
      });
      day()[prefix] = arr;
      saveStore();
    }

    root.querySelectorAll('[data-pl-add-eg]').forEach(function (btn) {
      btn.onclick = function () {
        day()[btn.getAttribute('data-pl-add-eg')].push({ nit: '', proveedor: '', concepto: '', descripcion: '', valor: 0 });
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
          syncEgresosFromDom(tr.getAttribute('data-pl-eg'));
        };
      });
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
      ensureTpl(function () {
        loadStore();
        var p = period();
        if (!state.activeDate || state.activeDate < p.fechaInicio || state.activeDate > p.fechaFin) {
          state.activeDate = p.fechaInicio;
        }
        if (typeof loadEmpleados === 'function') loadEmpleados();
        if (typeof loadNomina === 'function') loadNomina();
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
})(typeof window !== 'undefined' ? window : globalThis);
