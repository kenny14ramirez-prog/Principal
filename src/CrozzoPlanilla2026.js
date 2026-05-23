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
      '.crozzo-pl-root{--pl-gap:12px}' +
      '.crozzo-pl-tabs{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px}' +
      '.crozzo-pl-tabs button{padding:8px 14px;border-radius:var(--radius,8px);border:1px solid var(--border);background:var(--bg-secondary);cursor:pointer;font-size:12px;font-weight:600;color:inherit;font-family:inherit;transition:background .15s,border-color .15s}' +
      '.crozzo-pl-tabs button.active{background:var(--accent);color:var(--btn-text,#111);border-color:transparent}' +
      '.crozzo-pl-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;padding:12px 14px;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius,12px);margin-bottom:var(--pl-gap)}' +
      '.crozzo-pl-toolbar .form-group{margin:0;min-width:140px}' +
      '.crozzo-pl-kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin-bottom:var(--pl-gap)}' +
      '.crozzo-pl-kpi{padding:12px 14px;border-radius:var(--radius,10px);border:1px solid var(--border);background:linear-gradient(135deg,color-mix(in srgb,var(--accent) 8%,transparent),transparent)}' +
      '.crozzo-pl-kpi .val{font-size:1.15rem;font-weight:800}' +
      '.crozzo-pl-kpi .lbl{font-size:10px;opacity:.7;text-transform:uppercase;letter-spacing:.06em}' +
      '.crozzo-pl-grid{display:grid;grid-template-columns:1fr 1fr;gap:var(--pl-gap)}@media(max-width:900px){.crozzo-pl-grid{grid-template-columns:1fr}}' +
      '.crozzo-pl-acc{border:1px solid var(--border);border-radius:var(--radius,10px);margin-bottom:10px;background:var(--bg-card);overflow:hidden}' +
      '.crozzo-pl-acc summary{padding:12px 14px;cursor:pointer;font-weight:700;font-size:0.9rem;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:8px;user-select:none}' +
      '.crozzo-pl-acc summary::-webkit-details-marker{display:none}' +
      '.crozzo-pl-acc summary::after{content:"▸";opacity:.5;transition:transform .2s}' +
      '.crozzo-pl-acc[open] summary::after{transform:rotate(90deg)}' +
      '.crozzo-pl-acc__body{padding:0 14px 14px;border-top:1px solid var(--border)}' +
      '.crozzo-pl-cuadre{display:grid;grid-template-columns:1fr auto 1fr auto;gap:6px 10px;align-items:center;font-size:12px}' +
      '.crozzo-pl-cuadre .lbl{opacity:.75}' +
      '.crozzo-pl-dia-nav{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px}' +
      '.crozzo-pl-badge{font-size:11px;padding:4px 10px;border-radius:999px;background:color-mix(in srgb,var(--accent) 18%,transparent);font-weight:600}';
    document.head.appendChild(el);
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
      { id: 'dia', label: '📅 Día a día' },
      { id: 'mes', label: '📊 Resumen periodo' },
      { id: 'nomina', label: '🧮 Turnos y nómina' },
      { id: 'archivo', label: '📁 Excel' }
    ];
    var inner = '';
    if (state.tab === 'dia') inner = renderDia();
    else if (state.tab === 'mes') inner = renderMes();
    else if (state.tab === 'nomina') inner = renderNominaEmbed();
    else inner = renderArchivo();

    return (
      '<section class="content-section crozzo-pl-root" id="crozzo-pl-root">' +
      '<div class="card"><div class="card-header"><div><h2 class="card-title">Planilla 2026</h2>' +
      '<p class="page-subtitle">Periodos de corte con fechas libres · todos los registros se guardan</p></div>' +
      '<span class="crozzo-retail-pill" style="font-size:11px">💾 Local</span></div>' +
      '<div class="crozzo-pl-tabs">' +
      tabs.map(function (t) {
        return '<button type="button" class="' + (state.tab === t.id ? 'active' : '') + '" data-pl-tab="' + t.id + '">' + esc(t.label) + '</button>';
      }).join('') +
      '</div>' + inner + '</div></section>'
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

  function bind(root) {
    root.querySelectorAll('[data-pl-tab]').forEach(function (btn) {
      btn.onclick = function () {
        state.tab = btn.getAttribute('data-pl-tab');
        rerender(root);
      };
    });

    root.querySelectorAll('details[data-pl-acc]').forEach(function (det) {
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
        rerender(root);
      };
    }

    var apply = document.getElementById('pl-period-apply');
    if (apply) {
      apply.onclick = function () {
        var fi = (document.getElementById('pl-period-ini') || {}).value;
        var ff = (document.getElementById('pl-period-fin') || {}).value;
        var nm = (document.getElementById('pl-period-name') || {}).value;
        applyPeriodDates(fi, ff, nm);
        rerender(root);
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
        rerender(root);
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
        rerender(root);
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
        rerender(root);
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
          rerender(root);
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
          rerender(root);
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
        rerender(root);
      };
    });

    root.querySelectorAll('[data-pl-del-eg]').forEach(function (btn) {
      btn.onclick = function () {
        var tr = btn.closest('tr');
        day()[tr.getAttribute('data-pl-eg')].splice(parseInt(tr.getAttribute('data-pl-idx'), 10), 1);
        rerender(root);
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

  function rerender(root) {
    if (!root) root = document.getElementById('crozzo-pl-root');
    if (!root) return;
    root.innerHTML = renderRoot();
    bind(root);
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
            rerender(document.getElementById('crozzo-pl-root'));
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
      return '<div id="crozzo-pl-mount">Cargando planilla…</div>';
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
        bind(document.getElementById('crozzo-pl-root'));
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
