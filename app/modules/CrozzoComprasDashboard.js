/**
 * Crozzo POS — Resumen compras: inteligencia estratégica del abastecimiento.
 * Vista ejecutiva (KPIs, tendencias, concentración) — no duplica entrada de facturas.
 */
(function (global) {
  'use strict';

  var CHART_COLORS = ['#60a5fa', '#34d399', '#c9a962', '#f472b6', '#a78bfa', '#fb923c', '#38bdf8', '#4ade80'];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtMoney(n) {
    var res = global.CrozzoReservorio;
    if (res && res.fmtCop) return res.fmtCop(n);
    return '$' + Math.round(Number(n) || 0).toLocaleString('es-CO');
  }

  function fmtPct(part, whole) {
    if (!whole) return '0%';
    return ((Number(part) / Number(whole)) * 100).toFixed(1).replace(/\.0$/, '') + '%';
  }

  function fmtDelta(cur, prev) {
    if (!prev || prev <= 0) {
      if (cur > 0) return { text: 'Nuevo período', tone: 'up' };
      return { text: 'Sin variación', tone: 'flat' };
    }
    var pct = ((cur - prev) / prev) * 100;
    var sign = pct >= 0 ? '+' : '';
    return {
      text: sign + pct.toFixed(1).replace(/\.0$/, '') + '% vs anterior',
      tone: pct > 0.5 ? 'up' : pct < -0.5 ? 'down' : 'flat',
    };
  }

  function R() {
    return global.CrozzoReservorio;
  }

  function dateKey(d) {
    return d.toISOString().slice(0, 10);
  }

  function rangeFromDias(dias) {
    dias = Number(dias) > 0 ? Number(dias) : 30;
    var hasta = new Date();
    var desde = new Date();
    desde.setDate(desde.getDate() - dias);
    var prevHasta = new Date(desde);
    prevHasta.setDate(prevHasta.getDate() - 1);
    var prevDesde = new Date(prevHasta);
    prevDesde.setDate(prevDesde.getDate() - dias);
    return {
      dias: dias,
      desde: dateKey(desde),
      hasta: dateKey(hasta),
      prevDesde: dateKey(prevDesde),
      prevHasta: dateKey(prevHasta),
    };
  }

  function recepcionesInRange(st, desde, hasta) {
    return (st.recepciones || []).filter(function (r) {
      if (!r || r.estado === 'anulada') return false;
      var f = String(r.fecha || r.createdAt || '').slice(0, 10);
      return f >= desde && f <= hasta;
    });
  }

  function computeMetrics(dias) {
    var res = R();
    if (!res) return null;
    var st = res.load ? res.load() : { recepciones: [], facturasOficina: [], proveedores: [], meta: {} };
    var rng = rangeFromDias(dias);
    var cur = recepcionesInRange(st, rng.desde, rng.hasta);
    var prev = recepcionesInRange(st, rng.prevDesde, rng.prevHasta);

    var totalCur = cur.reduce(function (s, r) {
      return s + (Number(r.valor) || 0);
    }, 0);
    var totalPrev = prev.reduce(function (s, r) {
      return s + (Number(r.valor) || 0);
    }, 0);
    var countCur = cur.length;
    var avgTicket = countCur > 0 ? totalCur / countCur : 0;

    var byProv = {};
    cur.forEach(function (r) {
      var pid = String(r.proveedorId || r.proveedorNombre || '—');
      var name = r.proveedorNombre || pid;
      if (!byProv[pid]) byProv[pid] = { id: pid, name: name, total: 0, count: 0 };
      byProv[pid].total += Number(r.valor) || 0;
      byProv[pid].count += 1;
    });
    var topProv = Object.keys(byProv)
      .map(function (k) {
        return byProv[k];
      })
      .sort(function (a, b) {
        return b.total - a.total;
      });
    var top3Total = topProv.slice(0, 3).reduce(function (s, p) {
      return s + p.total;
    }, 0);
    var concentration = totalCur > 0 ? (top3Total / totalCur) * 100 : 0;

    var activeProvIds = {};
    cur.forEach(function (r) {
      if (r.proveedorId) activeProvIds[String(r.proveedorId)] = true;
    });
    var activeProv = Object.keys(activeProvIds).length;
    var totalProv = (st.proveedores || []).length;

    var mpRes =
      res.getComprasMpResumen &&
      res.getComprasMpResumen({ dias: rng.dias, desde: rng.desde, hasta: rng.hasta });
    var byCat = {};
    (mpRes && mpRes.filas ? mpRes.filas : []).forEach(function (f) {
      var c = String(f.categoria || 'OTRO').toUpperCase();
      if (!byCat[c]) byCat[c] = 0;
      byCat[c] += Number(f.valor) || 0;
    });

    var pendOf = (st.facturasOficina || []).filter(function (f) {
      return f.estado === 'pendiente' || f.estado === 'en_proceso';
    });
    var pendOfValor = pendOf.reduce(function (s, f) {
      return s + (Number(f.valor) || 0);
    }, 0);

    var alertas = ((st.meta && st.meta.alertasPrecio) || []).filter(function (a) {
      return !a.leida && (a.nivel === 'alerta' || a.nivel === 'sube');
    });

    var stats = res.getStats ? res.getStats() : {};

    var week = [];
    for (var i = 6; i >= 0; i--) {
      var d = new Date();
      d.setDate(d.getDate() - i);
      var dk = dateKey(d);
      var dayTotal = 0;
      var dayCount = 0;
      (st.recepciones || []).forEach(function (r) {
        if (!r || r.estado === 'anulada') return;
        var f = String(r.fecha || r.createdAt || '').slice(0, 10);
        if (f !== dk) return;
        dayTotal += Number(r.valor) || 0;
        dayCount += 1;
      });
      week.push({
        label: i === 0 ? 'Hoy' : d.toLocaleDateString('es-CO', { weekday: 'short' }).replace('.', ''),
        total: dayTotal,
        count: dayCount,
        isToday: i === 0,
      });
    }

    var recent = cur
      .slice()
      .sort(function (a, b) {
        return String(b.createdAt || b.fecha || '').localeCompare(String(a.createdAt || a.fecha || ''));
      })
      .slice(0, 6);

    var dailyAvg = rng.dias > 0 ? totalCur / rng.dias : 0;

    return {
      rng: rng,
      totalCur: totalCur,
      totalPrev: totalPrev,
      delta: fmtDelta(totalCur, totalPrev),
      countCur: countCur,
      avgTicket: avgTicket,
      dailyAvg: dailyAvg,
      topProv: topProv.slice(0, 6),
      concentration: concentration,
      activeProv: activeProv,
      totalProv: totalProv,
      byCat: byCat,
      mpTop: (mpRes && mpRes.filas ? mpRes.filas : []).slice(0, 8),
      mpTotal: mpRes ? mpRes.totalValor : 0,
      pendOf: pendOf.length,
      pendOfValor: pendOfValor,
      alertas: alertas.slice(0, 5),
      alertasCount: alertas.length,
      stats: stats,
      week: week,
      recent: recent,
      updatedAt: st.updatedAt || stats.updatedAt || '',
    };
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
      .map(function (seg) {
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
      '</strong><span>Gasto</span></div></div>'
    );
  }

  function renderWeekChart(week) {
    if (!week.length) return '<p class="crozzo-rep-empty">Sin historial de compras.</p>';
    var max = Math.max.apply(
      null,
      week.map(function (d) {
        return d.total;
      }).concat([1])
    );
    return (
      '<div class="crozzo-rep-week-chart">' +
      week
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
            ' recep.">' +
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
        .join('') +
      '</div>'
    );
  }

  function renderProvSection(topProv, total) {
    if (!topProv.length) return '<p class="crozzo-rep-empty">Sin compras a proveedores en el período.</p>';
    var segments = topProv.map(function (p, i) {
      return { value: p.total, color: CHART_COLORS[i % CHART_COLORS.length], label: p.name };
    });
    var legend = topProv
      .map(function (p, i) {
        var pct = total > 0 ? (p.total / total) * 100 : 0;
        return (
          '<div class="crozzo-rep-pay-row">' +
          '<div class="crozzo-rep-pay-row__head">' +
          '<span><span class="crozzo-rep-legend-dot" style="background:' +
          CHART_COLORS[i % CHART_COLORS.length] +
          '"></span>' +
          esc(p.name) +
          '</span>' +
          '<span>' +
          fmtMoney(p.total) +
          ' · <strong>' +
          fmtPct(p.total, total) +
          '</strong></span></div>' +
          '<div class="crozzo-compras-hub__bar"><span style="width:' +
          Math.max(4, pct) +
          '%;background:' +
          CHART_COLORS[i % CHART_COLORS.length] +
          '"></span></div></div>'
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

  function renderCatSection(byCat) {
    var catBase = Object.values(byCat || {}).reduce(function (a, v) {
      return a + v;
    }, 0);
    var cats = Object.entries(byCat || {})
      .sort(function (a, b) {
        return b[1] - a[1];
      })
      .slice(0, 8);
    if (!cats.length) return '<p class="crozzo-rep-empty">Sin categorías de MP en el período.</p>';
    return cats
      .map(function (row, i) {
        var name = row[0];
        var val = row[1];
        var pct = catBase > 0 ? (val / catBase) * 100 : 0;
        return (
          '<div class="crozzo-rep-cat-row">' +
          '<div class="crozzo-rep-cat-row__head">' +
          '<span class="crozzo-rep-cat-row__lbl">' +
          esc(name) +
          '</span>' +
          '<span class="crozzo-rep-cat-row__val">' +
          fmtMoney(val) +
          ' · <strong>' +
          fmtPct(val, catBase) +
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

  function renderPipeline(m) {
    m = m || {};
    var s = m.stats || {};
    var steps = [
      { lbl: 'Recepciones', val: m.countCur, sub: fmtMoney(m.totalCur), tone: 'blue' },
      { lbl: 'Oficina pend.', val: m.pendOf, sub: fmtMoney(m.pendOfValor), tone: 'amber' },
      { lbl: 'Cola planilla', val: s.colaPlanilla || 0, sub: 'Por contabilizar', tone: 'violet' },
      { lbl: 'Sync nube', val: s.syncPendiente || 0, sub: 'Pendiente subir', tone: 'slate' },
    ];
    return (
      '<div class="crozzo-compras-hub__pipeline">' +
      steps
        .map(function (step, i) {
          var arrow = i < steps.length - 1 ? '<span class="crozzo-compras-hub__pipe-arrow" aria-hidden="true">→</span>' : '';
          return (
            '<div class="crozzo-compras-hub__pipe-step crozzo-compras-hub__pipe-step--' +
            step.tone +
            '">' +
            '<div class="crozzo-compras-hub__pipe-val">' +
            step.val +
            '</div>' +
            '<div class="crozzo-compras-hub__pipe-lbl">' +
            esc(step.lbl) +
            '</div>' +
            '<div class="crozzo-compras-hub__pipe-sub">' +
            esc(step.sub) +
            '</div></div>' +
            arrow
          );
        })
        .join('') +
      '</div>'
    );
  }

  function renderInsights(m) {
    m = m || {};
    var items = [
      {
        icon: '🎯',
        title: 'Concentración top 3',
        val: m.concentration.toFixed(0) + '%',
        hint: 'del gasto en sus 3 proveedores principales',
        tone: m.concentration > 70 ? 'warn' : 'ok',
      },
      {
        icon: '📈',
        title: 'Ritmo diario',
        val: fmtMoney(m.dailyAvg),
        hint: 'promedio de compra por día en el período',
        tone: 'neutral',
      },
      {
        icon: '🏭',
        title: 'Proveedores activos',
        val: m.activeProv + ' / ' + m.totalProv,
        hint: 'con al menos una recepción en el período',
        tone: 'neutral',
      },
      {
        icon: '⚡',
        title: 'Ticket medio',
        val: fmtMoney(m.avgTicket),
        hint: 'valor promedio por recepción',
        tone: 'neutral',
      },
    ];
    if (m.alertasCount > 0) {
      items.unshift({
        icon: '🔔',
        title: 'Alertas de precio',
        val: String(m.alertasCount),
        hint: 'variaciones relevantes sin revisar',
        tone: 'warn',
      });
    }
    return (
      '<div class="crozzo-compras-hub__insights">' +
      items
        .map(function (it) {
          return (
            '<div class="crozzo-compras-hub__insight crozzo-compras-hub__insight--' +
            it.tone +
            '">' +
            '<span class="crozzo-compras-hub__insight-icon" aria-hidden="true">' +
            it.icon +
            '</span>' +
            '<div><div class="crozzo-compras-hub__insight-title">' +
            esc(it.title) +
            '</div>' +
            '<div class="crozzo-compras-hub__insight-val">' +
            esc(it.val) +
            '</div>' +
            '<div class="crozzo-compras-hub__insight-hint">' +
            esc(it.hint) +
            '</div></div></div>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function renderRecentTable(recent) {
    if (!recent.length) return '<p class="crozzo-rep-empty">Sin recepciones recientes en el período.</p>';
    return (
      '<div class="crozzo-rep-table-wrap"><table class="crozzo-mod-table"><thead><tr>' +
      '<th>Fecha</th><th>Proveedor</th><th class="num">Valor</th><th class="num">Ítems</th>' +
      '</tr></thead><tbody>' +
      recent
        .map(function (r) {
          return (
            '<tr><td>' +
            esc(String(r.fecha || '').slice(0, 10)) +
            '</td><td><strong>' +
            esc(r.proveedorNombre || '—') +
            '</strong></td><td class="num">' +
            fmtMoney(r.valor) +
            '</td><td class="num">' +
            ((r.items && r.items.length) || 0) +
            '</td></tr>'
          );
        })
        .join('') +
      '</tbody></table></div>'
    );
  }

  function renderMpTable(rows) {
    if (!rows.length) return '<p class="crozzo-rep-empty">Sin materias primas compradas en el período.</p>';
    return (
      '<div class="crozzo-rep-table-wrap"><table class="crozzo-mod-table"><thead><tr>' +
      '<th>Materia prima</th><th>Categoría</th><th class="num">Valor</th><th class="num"># compras</th>' +
      '</tr></thead><tbody>' +
      rows
        .map(function (f) {
          return (
            '<tr><td><strong>' +
            esc(f.nombre) +
            '</strong></td><td>' +
            esc(f.categoria) +
            '</td><td class="num">' +
            fmtMoney(f.valor) +
            '</td><td class="num">' +
            f.compras +
            '</td></tr>'
          );
        })
        .join('') +
      '</tbody></table></div>'
    );
  }

  function renderAlerts(list) {
    if (!list.length) {
      return '<p class="crozzo-rep-empty">Sin alertas de precio pendientes. El sistema avisa cuando sube el costo de una MP.</p>';
    }
    return (
      '<ul class="crozzo-compras-hub__alerts">' +
      list
        .map(function (a) {
          return (
            '<li class="crozzo-compras-hub__alert crozzo-compras-hub__alert--' +
            esc(a.nivel || 'alerta') +
            '">' +
            '<strong>' +
            esc(a.productoNombre || a.mpNombre || 'Producto') +
            '</strong> · ' +
            esc(a.proveedorNombre || '') +
            (a.pctCambio != null ? ' · ' + esc(String(a.pctCambio)) + '%' : '') +
            '<span class="crozzo-compras-hub__alert-date">' +
            esc(String(a.fecha || '').slice(0, 10)) +
            '</span></li>'
          );
        })
        .join('') +
      '</ul>'
    );
  }

  function renderQuickActions() {
    var actions = [
      { page: 'compras-recepcion', icon: '📥', lbl: 'Entrada de factura', hint: 'Operación del día' },
      { page: 'compras-oficina', icon: '📋', lbl: 'Oficina', hint: 'Pagos y trámite' },
      { page: 'compras-proveedores', icon: '🏢', lbl: 'Proveedores', hint: 'Directorio' },
      { page: 'compras-cotizaciones', icon: '📝', lbl: 'Cotizaciones', hint: 'Comparar precios' },
    ];
    return (
      '<div class="crozzo-compras-hub__actions">' +
      actions
        .map(function (a) {
          return (
            '<button type="button" class="crozzo-compras-hub__action" data-compras-nav="' +
            esc(a.page) +
            '">' +
            '<span class="crozzo-compras-hub__action-icon" aria-hidden="true">' +
            a.icon +
            '</span>' +
            '<span class="crozzo-compras-hub__action-lbl">' +
            esc(a.lbl) +
            '</span>' +
            '<span class="crozzo-compras-hub__action-hint">' +
            esc(a.hint) +
            '</span></button>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function renderBodyHtml(m) {
    m = m || computeMetrics(30);
    if (!m) {
      return '<p class="crozzo-rep-empty">Cargue el reservorio de compras (CrozzoReservorio.js).</p>';
    }
    var deltaCls = 'crozzo-compras-hub__delta--' + (m.delta.tone || 'flat');
    return (
      '<div class="crozzo-rep-hero crozzo-rep-hero--premium crozzo-compras-hub__hero">' +
      '<div class="crozzo-rep-hero__main">' +
      '<div class="crozzo-rep-hero__lbl">Gasto en abastecimiento · ' +
      m.rng.dias +
      ' días</div>' +
      '<div class="crozzo-rep-hero__val" id="crozzo-compras-hero-total">' +
      fmtMoney(m.totalCur) +
      '</div>' +
      '<div class="crozzo-compras-hub__delta ' +
      deltaCls +
      '" id="crozzo-compras-hero-delta">' +
      esc(m.delta.text) +
      '</div>' +
      '<div class="crozzo-rep-hero__sub" id="crozzo-compras-hero-sub">' +
      m.countCur +
      ' recepciones · ' +
      fmtMoney(m.totalPrev) +
      ' período anterior</div></div>' +
      '<div class="crozzo-rep-hero__aside">' +
      '<div class="crozzo-rep-hero__meta">' +
      esc(m.rng.desde) +
      ' → ' +
      esc(m.rng.hasta) +
      '</div>' +
      renderQuickActions() +
      '</div></div>' +
      '<div class="crozzo-rep-kpi-grid crozzo-rep-kpi-grid--dash">' +
      '<div class="crozzo-rep-kpi"><div class="val" id="crozzo-compras-kpi-count">' +
      m.countCur +
      '</div><div class="sub">Recepciones</div><div class="lbl">Operaciones</div></div>' +
      '<div class="crozzo-rep-kpi"><div class="val" id="crozzo-compras-kpi-ticket">' +
      fmtMoney(m.avgTicket) +
      '</div><div class="sub">Por factura</div><div class="lbl">Ticket medio</div></div>' +
      '<div class="crozzo-rep-kpi"><div class="val" id="crozzo-compras-kpi-pend">' +
      fmtMoney(m.pendOfValor) +
      '</div><div class="sub">' +
      m.pendOf +
      ' doc(s)</div><div class="lbl">Oficina pendiente</div></div>' +
      '<div class="crozzo-rep-kpi"><div class="val" id="crozzo-compras-kpi-conc">' +
      m.concentration.toFixed(0) +
      '%</div><div class="sub">Top 3 prov.</div><div class="lbl">Concentración</div></div>' +
      '</div>' +
      renderInsights(m) +
      '<div class="crozzo-rep-section-grid crozzo-rep-section-grid--wide">' +
      '<div class="crozzo-rep-dash-block crozzo-rep-dash-block--chart"><h3 class="crozzo-rep-dash-title">Tendencia · 7 días</h3><div id="crozzo-compras-week-chart">' +
      renderWeekChart(m.week) +
      '</div></div>' +
      '<div class="crozzo-rep-dash-block"><h3 class="crozzo-rep-dash-title">Flujo operativo</h3><div id="crozzo-compras-pipeline">' +
      renderPipeline(m) +
      '</div></div></div>' +
      '<div class="crozzo-rep-section-grid">' +
      '<div class="crozzo-rep-dash-block"><h3 class="crozzo-rep-dash-title">Top proveedores</h3><div id="crozzo-compras-prov-breakdown">' +
      renderProvSection(m.topProv, m.totalCur) +
      '</div></div>' +
      '<div class="crozzo-rep-dash-block"><h3 class="crozzo-rep-dash-title">Gasto por categoría MP</h3><div id="crozzo-compras-cat-breakdown">' +
      renderCatSection(m.byCat) +
      '</div></div></div>' +
      '<div class="crozzo-rep-dash-cols">' +
      '<div class="crozzo-rep-dash-block"><h3 class="crozzo-rep-dash-title">Últimas recepciones</h3><div id="crozzo-compras-recent">' +
      renderRecentTable(m.recent) +
      '</div></div>' +
      '<div class="crozzo-rep-dash-block"><h3 class="crozzo-rep-dash-title">Top materias primas</h3><div id="crozzo-compras-mp-top">' +
      renderMpTable(m.mpTop) +
      '</div></div></div>' +
      '<div class="crozzo-rep-dash-block"><h3 class="crozzo-rep-dash-title">Alertas de precio</h3><div id="crozzo-compras-alerts">' +
      renderAlerts(m.alertas) +
      '</div></div>' +
      (m.updatedAt
        ? '<p class="form-hint crozzo-compras-hub__foot">Reservorio · actualizado ' + esc(m.updatedAt) + '</p>'
        : '')
    );
  }

  function renderPage() {
    return (
      '<div class="crozzo-rep-hub crozzo-compras-hub">' +
      '<header class="crozzo-rep-hub__hero crozzo-compras-hub__header">' +
      '<div class="crozzo-rep-hub__glow" aria-hidden="true"></div>' +
      '<div class="crozzo-rep-hub__main">' +
      '<p class="crozzo-rep-hub__eyebrow">Inteligencia de abastecimiento</p>' +
      '<h2 class="crozzo-rep-hub__title">Resumen compras</h2>' +
      '<p class="crozzo-rep-hub__sub">Gasto, proveedores, concentración y flujo oficina — vista estratégica. Para registrar facturas use <strong>Entrada de factura</strong>.</p>' +
      '</div>' +
      '<div class="crozzo-compras-hub__toolbar">' +
      '<label class="form-hint" for="crozzo-compras-dias">Período</label>' +
      '<select class="form-input" id="crozzo-compras-dias">' +
      '<option value="7">7 días</option>' +
      '<option value="30" selected>30 días</option>' +
      '<option value="90">90 días</option>' +
      '<option value="365">1 año</option>' +
      '</select>' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzo-compras-refresh">Actualizar</button>' +
      '</div></header>' +
      '<div class="card crozzo-rep-root crozzo-compras-hub__panel" id="crozzo-compras-dash-root">' +
      '<div id="crozzo-compras-dash-body">' +
      renderBodyHtml(computeMetrics(30)) +
      '</div></div></div>'
    );
  }

  function refresh(root) {
    root = root || document.getElementById('crozzo-compras-dash-root');
    if (!root) return;
    var diasEl = document.getElementById('crozzo-compras-dias');
    var dias = diasEl ? Number(diasEl.value) || 30 : 30;
    var body = root.querySelector('#crozzo-compras-dash-body');
    if (body) body.innerHTML = renderBodyHtml(computeMetrics(dias));
    bindNavButtons(root);
  }

  function bindNavButtons(root) {
    if (!root) return;
    root.querySelectorAll('[data-compras-nav]').forEach(function (btn) {
      if (btn.__crozzoComprasNavBound) return;
      btn.__crozzoComprasNavBound = true;
      btn.addEventListener('click', function () {
        var page = btn.getAttribute('data-compras-nav');
        if (!page) return;
        if (typeof global.crozzoNavigateImmediate === 'function') global.crozzoNavigateImmediate(page);
        else if (typeof global.navigateTo === 'function') global.navigateTo(page);
      });
    });
  }

  function bindPage() {
    var root = document.getElementById('crozzo-compras-dash-root');
    if (!root || root.__crozzoComprasDashBound) return;
    root.__crozzoComprasDashBound = true;
    var diasEl = document.getElementById('crozzo-compras-dias');
    var refreshBtn = document.getElementById('crozzo-compras-refresh');
    if (diasEl) {
      diasEl.addEventListener('change', function () {
        refresh(root);
      });
    }
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        refresh(root);
      });
    }
    bindNavButtons(root);
  }

  global.CrozzoComprasDashboard = {
    computeMetrics: computeMetrics,
    renderPage: renderPage,
    refresh: refresh,
    bindPage: bindPage,
  };
})(typeof window !== 'undefined' ? window : globalThis);
