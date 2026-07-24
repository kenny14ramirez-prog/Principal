/**
 * Crozzo POS — Reportes y dashboard: gráficas, layout premium y visualizaciones.
 */
(function (global) {
  'use strict';

  var CHART_COLORS = ['#c9a962', '#60a5fa', '#34d399', '#f472b6', '#a78bfa', '#fb923c', '#38bdf8', '#4ade80'];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtMoney(n) {
    return '$' + Math.round(Number(n) || 0).toLocaleString('es-CO');
  }

  function fmtPct(part, whole) {
    if (typeof global.crozzoRepFormatPct === 'function') return global.crozzoRepFormatPct(part, whole);
    if (!whole) return '0%';
    return ((Number(part) / Number(whole)) * 100).toFixed(1).replace(/\.0$/, '') + '%';
  }

  function pctBar(pct, tone) {
    if (typeof global.crozzoRepPctBarHtml === 'function') return global.crozzoRepPctBarHtml(pct, tone);
    var w = Math.max(0, Math.min(100, Number(pct) || 0));
    return (
      '<span class="crozzo-rep-pct-bar' +
      (tone ? ' crozzo-rep-pct-bar--' + tone : '') +
      '"><span class="crozzo-rep-pct-bar__fill" style="width:' +
      w +
      '%"></span></span>'
    );
  }

  function methodLabels() {
    if (typeof global.crozzoRepMethodLabels === 'function') return global.crozzoRepMethodLabels();
    return { efectivo: 'Efectivo', tarjeta: 'Tarjeta', qr: 'QR', otro: 'Otro' };
  }

  function computeWeekTrend() {
    var out = [];
    var getFacturas =
      typeof global.config !== 'undefined' && global.config.getFacturas ? global.config.getFacturas.bind(global.config) : function () {
        return [];
      };
    var dayRange = global.crozzoRepDayRange;
    var facturaTs = global.crozzoRepFacturaTs;
    if (typeof dayRange !== 'function' || typeof facturaTs !== 'function') return out;
    var all = getFacturas() || [];
    for (var i = 6; i >= 0; i--) {
      var d = new Date();
      d.setDate(d.getDate() - i);
      var r = dayRange(d);
      var total = 0;
      var count = 0;
      all.forEach(function (f) {
        var t = facturaTs(f);
        if (!Number.isFinite(t) || t < r.start || t >= r.end) return;
        total += Number(f.total) || 0;
        count += 1;
      });
      out.push({
        label: i === 0 ? 'Hoy' : d.toLocaleDateString('es-CO', { weekday: 'short' }).replace('.', ''),
        total: total,
        count: count,
        isToday: i === 0,
      });
    }
    return out;
  }

  function renderDonut(segments, total) {
    if (!segments.length || total <= 0) {
      return '<div class="crozzo-rep-donut crozzo-rep-donut--empty"><span>Sin datos</span></div>';
    }
    var cx = 54;
    var cy = 54;
    var r = 42;
    var stroke = 14;
    var circ = 2 * Math.PI * r;
    var offset = 0;
    var arcs = segments
      .map(function (seg, i) {
        var len = (seg.value / total) * circ;
        var dash = len + ' ' + (circ - len);
        var el =
          '<circle class="crozzo-rep-donut__arc" cx="' +
          cx +
          '" cy="' +
          cy +
          '" r="' +
          r +
          '" fill="none" stroke="' +
          seg.color +
          '" stroke-width="' +
          stroke +
          '" stroke-dasharray="' +
          dash +
          '" stroke-dashoffset="' +
          -offset +
          '" transform="rotate(-90 ' +
          cx +
          ' ' +
          cy +
          ')"></circle>';
        offset += len;
        return el;
      })
      .join('');
    return (
      '<div class="crozzo-rep-donut">' +
      '<svg viewBox="0 0 108 108" class="crozzo-rep-donut__svg" aria-hidden="true">' +
      '<circle cx="' +
      cx +
      '" cy="' +
      cy +
      '" r="' +
      r +
      '" fill="none" stroke="var(--border)" stroke-width="' +
      stroke +
      '"></circle>' +
      arcs +
      '</svg>' +
      '<div class="crozzo-rep-donut__center"><strong>' +
      fmtMoney(total) +
      '</strong><span>Total</span></div></div>'
    );
  }

  function renderPaySection(byMethod, total) {
    var labels = methodLabels();
    var keys = Object.keys(byMethod || {}).filter(function (k) {
      return Number(byMethod[k]) > 0;
    });
    if (!keys.length) return '<p class="crozzo-rep-empty">Sin ventas registradas en el día operativo.</p>';
    keys.sort(function (a, b) {
      return Number(byMethod[b]) - Number(byMethod[a]);
    });
    var segments = keys.map(function (k, i) {
      return { key: k, value: Number(byMethod[k]) || 0, color: CHART_COLORS[i % CHART_COLORS.length] };
    });
    var legend = segments
      .map(function (seg) {
        var pct = total > 0 ? (seg.value / total) * 100 : 0;
        return (
          '<div class="crozzo-rep-pay-row">' +
          '<div class="crozzo-rep-pay-row__head">' +
          '<span class="crozzo-rep-pay-row__lbl"><span class="crozzo-rep-legend-dot" style="background:' +
          seg.color +
          '"></span>' +
          esc(labels[seg.key] || seg.key) +
          '</span>' +
          '<span class="crozzo-rep-pay-row__val">' +
          fmtMoney(seg.value) +
          ' · <strong>' +
          fmtPct(seg.value, total) +
          '</strong></span></div>' +
          pctBar(pct, seg.key === 'efectivo' ? 'cash' : 'digital') +
          '</div>'
        );
      })
      .join('');
    return (
      '<div class="crozzo-rep-pay-visual">' +
      renderDonut(segments, total) +
      '<div class="crozzo-rep-pay-visual__list">' +
      legend +
      '</div></div>'
    );
  }

  function renderWeekChart(week) {
    if (!week.length) return '<p class="crozzo-rep-empty">Sin historial de ventas.</p>';
    var max = Math.max.apply(
      null,
      week.map(function (d) {
        return d.total;
      }).concat([1])
    );
    var bars = week
      .map(function (d) {
        var h = max > 0 ? Math.max(8, (d.total / max) * 100) : 0;
        return (
          '<div class="crozzo-rep-week-col' +
          (d.isToday ? ' crozzo-rep-week-col--today' : '') +
          '" title="' +
          esc(d.label) +
          ': ' +
          fmtMoney(d.total) +
          ' · ' +
          d.count +
          ' ventas">' +
          '<div class="crozzo-rep-week-val">' +
          (d.total > 0 ? fmtMoney(d.total).replace('$', '$\u2009') : '—') +
          '</div>' +
          '<div class="crozzo-rep-week-bar" style="height:' +
          h +
          '%"></div>' +
          '<span class="crozzo-rep-week-lbl">' +
          esc(d.label) +
          '</span></div>'
        );
      })
      .join('');
    return '<div class="crozzo-rep-week-chart">' + bars + '</div>';
  }

  function renderHourlyChartEnhanced(buckets, total) {
    if (typeof global.crozzoRepRenderHourlyChart === 'function') {
      var base = global.crozzoRepRenderHourlyChart(buckets, total);
      return base.replace('crozzo-rep-hour-chart', 'crozzo-rep-hour-chart crozzo-rep-hour-chart--premium');
    }
    return '<p class="crozzo-rep-empty">Sin ventas por hora.</p>';
  }

  function renderInvHealthDonut(stats) {
    stats = stats || {};
    var tracked = Number(stats.tracked) || 0;
    if (!tracked) {
      return '<p class="crozzo-rep-empty">Sin productos con control de stock.</p>';
    }
    var ok = Number(stats.ok) || 0;
    var low = Number(stats.low) || 0;
    var segments = [
      { value: ok, color: '#34d399', label: 'OK' },
      { value: low, color: '#fbbf24', label: 'Bajo' },
    ].filter(function (s) {
      return s.value > 0;
    });
    return (
      '<div class="crozzo-rep-inv-health">' +
      renderDonut(segments, tracked) +
      '<div class="crozzo-rep-inv-health__legend">' +
      '<div><span class="crozzo-rep-legend-dot" style="background:#34d399"></span> OK · ' +
      ok +
      '</div>' +
      '<div><span class="crozzo-rep-legend-dot" style="background:#fbbf24"></span> Bajo · ' +
      low +
      '</div>' +
      '<div class="form-hint">' +
      (stats.untracked ? stats.untracked + ' sin control de stock' : '') +
      '</div></div></div>'
    );
  }

  function renderCatSection(catMap) {
    var catBase = Object.values(catMap || {}).reduce(function (acc, d) {
      return acc + (d.rev || 0);
    }, 0);
    var cats = Object.entries(catMap || {})
      .sort(function (a, b) {
        return b[1].rev - a[1].rev;
      })
      .slice(0, 8);
    if (!cats.length) return '<p class="crozzo-rep-empty">Sin categorías en ventas del día.</p>';
    return cats
      .map(function (row, i) {
        var name = row[0];
        var d = row[1];
        var pct = catBase > 0 ? (d.rev / catBase) * 100 : 0;
        return (
          '<div class="crozzo-rep-cat-row">' +
          '<div class="crozzo-rep-cat-row__head">' +
          '<span class="crozzo-rep-cat-row__lbl">' +
          esc(name) +
          '</span>' +
          '<span class="crozzo-rep-cat-row__val">' +
          fmtMoney(d.rev) +
          ' · <strong>' +
          fmtPct(d.rev, catBase) +
          '</strong></span></div>' +
          '<div class="crozzo-rep-cat-row__bar">' +
          '<span style="width:' +
          Math.max(4, pct) +
          '%;background:' +
          CHART_COLORS[i % CHART_COLORS.length] +
          '"></span></div></div>'
        );
      })
      .join('');
  }

  function refreshVisuals(ctx) {
    ctx = ctx || {};
    var list = ctx.list || [];
    var m = ctx.metrics || {};
    var weekHost = document.getElementById('crozzo-rep-week-chart');
    if (weekHost) weekHost.innerHTML = renderWeekChart(computeWeekTrend());
    var payHost = document.getElementById('crozzo-rep-pay-breakdown');
    if (payHost && ctx.refreshPay !== false) {
      payHost.innerHTML = renderPaySection(m.byMethod || {}, m.total || 0);
    }
    var catHost = document.getElementById('crozzo-rep-cat-breakdown');
    if (catHost && m.catMap) catHost.innerHTML = renderCatSection(m.catMap);
    var hourHost = document.getElementById('crozzo-rep-hour-chart');
    if (hourHost && typeof global.crozzoRepComputeHourlyTotals === 'function') {
      hourHost.innerHTML = renderHourlyChartEnhanced(global.crozzoRepComputeHourlyTotals(list), m.total || 0);
    }
    var invHost = document.getElementById('crozzo-rep-inv-health');
    if (invHost && typeof global.crozzoRepInvCatalogStats === 'function') {
      invHost.innerHTML = renderInvHealthDonut(global.crozzoRepInvCatalogStats());
    }
  }

  function renderMainPanelHtml() {
    return (
      '<div class="crozzo-rep-panel" data-rep-panel="resumen">' +
      '<div class="crozzo-rep-hero crozzo-rep-hero--premium">' +
      '<div class="crozzo-rep-hero__main">' +
      '<div class="crozzo-rep-hero__lbl">Ventas del día operativo</div>' +
      '<div class="crozzo-rep-hero__val" id="crozzo-rep-hero-total">$0</div>' +
      '<div id="crozzo-rep-hero-delta"></div>' +
      '<div class="crozzo-rep-hero__sub" id="crozzo-rep-hero-sub">—</div></div>' +
      '<div class="crozzo-rep-hero__aside">' +
      '<div class="crozzo-rep-hero__meta" id="crozzo-rep-hero-meta">—</div>' +
      '<div class="crozzo-rep-mes-block" id="crozzo-rep-mes-progress"></div></div></div>' +
      '<div class="crozzo-rep-kpi-grid crozzo-rep-kpi-grid--dash">' +
      '<div class="crozzo-rep-kpi"><div class="val" id="crozzo-rep-kpi-today">$0</div><div class="sub" id="crozzo-rep-kpi-today-sub">—</div><div class="lbl">Ventas</div></div>' +
      '<div class="crozzo-rep-kpi"><div class="val" id="crozzo-rep-kpi-count">0</div><div class="sub" id="crozzo-rep-kpi-count-sub">—</div><div class="lbl">Transacciones</div></div>' +
      '<div class="crozzo-rep-kpi"><div class="val" id="crozzo-rep-kpi-avg">$0</div><div class="sub" id="crozzo-rep-kpi-avg-sub">—</div><div class="lbl">Ticket medio</div></div>' +
      '<div class="crozzo-rep-kpi"><div class="val" id="crozzo-rep-kpi-iva">$0</div><div class="sub" id="crozzo-rep-kpi-iva-sub">—</div><div class="lbl">IVA</div></div>' +
      '<div class="crozzo-rep-kpi"><div class="val" id="crozzo-rep-kpi-cash">$0</div><div class="sub" id="crozzo-rep-kpi-cash-sub">—</div><div class="lbl">Efectivo</div></div>' +
      '<div class="crozzo-rep-kpi"><div class="val" id="crozzo-rep-kpi-digital">$0</div><div class="sub" id="crozzo-rep-kpi-digital-sub">—</div><div class="lbl">Otros medios</div></div></div>' +
      '<div class="crozzo-rep-section-grid crozzo-rep-section-grid--wide">' +
      '<div class="crozzo-rep-dash-block crozzo-rep-dash-block--chart"><h3 class="crozzo-rep-dash-title">Tendencia · 7 días</h3><div id="crozzo-rep-week-chart"></div></div>' +
      '<div class="crozzo-rep-dash-block crozzo-rep-dash-block--chart"><h3 class="crozzo-rep-dash-title">Ventas por hora</h3><div id="crozzo-rep-hour-chart"></div></div></div>' +
      '<div class="crozzo-rep-section-grid">' +
      '<div class="crozzo-rep-dash-block"><h3 class="crozzo-rep-dash-title">Medios de pago</h3><div id="crozzo-rep-pay-breakdown" class="crozzo-rep-pay-list"></div></div>' +
      '<div class="crozzo-rep-dash-block"><h3 class="crozzo-rep-dash-title">Salud inventario</h3><div id="crozzo-rep-inv-health"></div></div>' +
      '<div class="crozzo-rep-dash-block"><h3 class="crozzo-rep-dash-title">Operación en vivo</h3><div id="crozzo-rep-op-live"></div></div></div>' +
      '<div class="crozzo-rep-dash-cols">' +
      '<div class="crozzo-rep-dash-block"><h3 class="crozzo-rep-dash-title">Ventas por categoría</h3><div id="crozzo-rep-cat-breakdown" class="crozzo-rep-pay-list"></div></div>' +
      '<div class="crozzo-rep-dash-block"><h3 class="crozzo-rep-dash-title">Ventas por canal</h3><div id="crozzo-rep-cat-canal-breakdown"></div></div></div>' +
      '<div class="crozzo-rep-dash-block"><h3 class="crozzo-rep-dash-title">Top productos del día</h3>' +
      '<div class="crozzo-rep-table-wrap"><table id="crozzo-rep-top-products"><thead><tr>' +
      '<th>Producto</th><th class="num">Cant.</th><th class="num">% uds.</th><th class="num">Ingresos</th><th class="num">% ing.</th>' +
      '</tr></thead><tbody></tbody></table></div></div>' +
      '<div class="crozzo-rep-dash-block"><h3 class="crozzo-rep-dash-title">Alertas recientes</h3><div id="crozzo-rep-alerts-preview"></div>' +
      '<button type="button" class="btn btn-link btn-sm crozzo-rep-alerts-link">Ver todas las alertas →</button></div></div>'
    );
  }

  function renderPage(opts) {
    opts = opts || {};
    var meta = opts.meta || {};
    var isBasico = opts.mode !== 'full';
    var title = isBasico ? 'Dashboard del negocio' : 'Reportes y dashboard';
    var sub =
      (meta.label ? esc(meta.label) + ' · ' : '') +
      'Ventas, gráficas, operación en vivo y rendimiento del equipo';
    var perfilesHint = isBasico ? '' : '';
    return (
      '<div class="crozzo-rep-hub">' +
      '<header class="crozzo-rep-hub__hero">' +
      '<div class="crozzo-rep-hub__glow" aria-hidden="true"></div>' +
      '<div class="crozzo-rep-hub__main">' +
      '<p class="crozzo-rep-hub__eyebrow">Inteligencia del negocio</p>' +
      '<h2 class="crozzo-rep-hub__title">' +
      esc(title) +
      '</h2>' +
      '<p class="crozzo-rep-hub__sub">' +
      sub +
      '</p></div></header>' +
      '<div class="card crozzo-rep-root crozzo-rep-basico' +
      (isBasico ? '' : ' crozzo-rep-pro') +
      '" id="crozzo-rep-root">' +
      '<div class="crozzo-rep-tabs">' +
      '<button type="button" class="crozzo-rep-tab active" data-rep-tab="resumen">📊 Resumen</button>' +
      '<button type="button" class="crozzo-rep-tab" data-rep-tab="equipo">👥 Equipo</button>' +
      '<button type="button" class="crozzo-rep-tab" data-rep-tab="operativo">📋 Operativo</button>' +
      (typeof global.CrozzoAiInsights !== 'undefined' && CrozzoAiInsights.tabButtonHtml
        ? CrozzoAiInsights.tabButtonHtml()
        : '<button type="button" class="crozzo-rep-tab crozzo-rep-tab--adv" data-rep-tab="reporte-ia">✨ Reporte IA</button>') +
      '<button type="button" class="crozzo-rep-tab crozzo-rep-tab--adv" data-rep-tab="perfiles">🧠 Perfiles psicológicos</button>' +
      '<button type="button" class="crozzo-rep-tab" data-rep-tab="export">📥 Exportar</button>' +
      '<button type="button" class="crozzo-rep-tab" data-rep-tab="pred">🔮 Alertas</button></div>' +
      renderMainPanelHtml().replace('crozzo-rep-cat-canal-breakdown', 'crozzo-rep-canal-breakdown') +
      (typeof global.crozzoRepRenderBasicoSecondaryPanelsHtml === 'function'
        ? global.crozzoRepRenderBasicoSecondaryPanelsHtml()
        : '') +
      '</div></div>'
    );
  }

  function bindPage(root) {
    root = root || document.getElementById('crozzo-rep-root');
    if (!root || root.__crozzoRepDashBound) return;
    root.__crozzoRepDashBound = true;
    var link = root.querySelector('.crozzo-rep-alerts-link');
    if (link) {
      link.addEventListener('click', function () {
        var tab = root.querySelector('.crozzo-rep-tab[data-rep-tab="pred"]');
        if (tab) tab.click();
      });
    }
  }

  global.CrozzoReportesDashboard = {
    renderPage: renderPage,
    refreshVisuals: refreshVisuals,
    renderPaySection: renderPaySection,
    renderWeekChart: renderWeekChart,
    renderCatSection: renderCatSection,
    renderInvHealthDonut: renderInvHealthDonut,
    bindPage: bindPage,
    computeWeekTrend: computeWeekTrend,
  };
})(typeof window !== 'undefined' ? window : globalThis);
