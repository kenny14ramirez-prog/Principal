/**
 * Crozzo POS — Laboratorio administrativo (UI).
 * Solo admin / super admin · PIN 4 dígitos · control de emulación y vista operativa.
 */
(function (global) {
  'use strict';

  var Core = function () {
    return global.CrozzoLaboratorioCore;
  };

  function fmt(n) {
    return '$' + Math.round(Number(n) || 0).toLocaleString('es-CO');
  }

  function num(v) {
    return Math.max(0, Number(v) || 0);
  }

  var REASON_LABELS = {
    venta_invalida: 'Venta no válida',
    electronica: 'Factura electrónica',
    medio_banco: 'Pago banco/tarjeta',
    whatsapp: 'Enviada WhatsApp',
    delicada: 'Factura delicada',
    no_efectivo: 'No es efectivo',
    mixto_sin_efectivo: 'Mixto sin parte cash',
    demo: 'Modo demo',
  };

  var AUDIT_LABELS = {
    pin_ok: 'Acceso PIN',
    pin_fail: 'PIN fallido',
    pin_set: 'PIN configurado',
    cap_save: 'Tope guardado',
    mask_apply: 'Máscara aplicada',
    mask_clear: 'Máscara limpiada',
    reconcile_close: 'Conciliación cierre',
    emulation_project: 'Proyección',
    recommend_create: 'Recomendación creada',
    recommend_accept: 'Recomendación aceptada',
    recommend_reject: 'Recomendación descartada',
    emulation_sandbox: 'Sandbox',
    sim_declared_sales: 'Simulación ventas declaradas',
    emu_analysis: 'Análisis emulación',
    audit_obvious: 'Auditoría obviedad',
    audit_comfort: 'Auditoría confianza',
    audit_decision: 'Auditoría decisión',
    stealth_hunt: 'Caza sigilosa',
  };

  function bindLabPinInputs(root) {
    root = root || document;
    root.querySelectorAll('.crozzo-lab-pin-input').forEach(function (inp) {
      inp.addEventListener('input', function () {
        inp.value = String(inp.value || '').replace(/\D/g, '').slice(0, 4);
      });
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          if (inp.id === 'crozzo-lab-gate-pin') crozzoLabGateSubmit();
          else if (inp.id === 'crozzo-lab-pin') crozzoLabSubmitPin();
        }
      });
    });
  }

  function renderDashboard(dash) {
    var capHtml = dash.cap.active
      ? '<div class="crozzo-lab-kpi' +
        (dash.cap.alert ? ' crozzo-lab-kpi--warn' : '') +
        '"><span>Tope oculto</span><strong>' +
        dash.cap.pct +
        '%</strong><small>' +
        fmt(dash.cap.operativeTotal) +
        ' / ' +
        fmt(dash.cap.cap) +
        '</small></div>'
      : '<div class="crozzo-lab-kpi"><span>Tope oculto</span><strong>Off</strong></div>';
    return (
      '<section class="crozzo-lab-section crozzo-lab-section--dashboard">' +
      '<h3><i data-lucide="layout-dashboard"></i> Estado del laboratorio</h3>' +
      '<div class="crozzo-lab-status-row">' +
      '<span class="crozzo-lab-pill' +
      (dash.sessionMs ? ' is-ok' : '') +
      '"><i data-lucide="clock"></i> Sesión: ' +
      esc(dash.session) +
      '</span>' +
      '<span class="crozzo-lab-pill' +
      (dash.maskActive ? ' is-warn' : '') +
      '"><i data-lucide="eye-off"></i> Máscara: ' +
      (dash.maskActive ? dash.maskEntries + ' facturas' : 'Inactiva') +
      '</span>' +
      '<span class="crozzo-lab-pill' +
      (dash.emulationActive ? ' is-info' : '') +
      '"><i data-lucide="test-tube"></i> Emulación: ' +
      (dash.emulationActive ? 'Activa' : 'Off') +
      '</span>' +
      (dash.pendingRecommend
        ? '<span class="crozzo-lab-pill is-warn"><i data-lucide="bell"></i> Recomendación pendiente</span>'
        : '') +
      '</div>' +
      '<div class="crozzo-lab-kpi-row crozzo-lab-kpi-row--4">' +
      '<div class="crozzo-lab-kpi"><span>Fiscal hoy</span><strong>' +
      fmt(dash.fiscalToday) +
      '</strong></div>' +
      '<div class="crozzo-lab-kpi"><span>Vista operación</span><strong>' +
      fmt(dash.operToday) +
      '</strong></div>' +
      '<div class="crozzo-lab-kpi"><span>Diferencia</span><strong class="' +
      (dash.deltaToday > 0 ? 'crozzo-lab-delta' : '') +
      '">' +
      fmt(dash.deltaToday) +
      '</strong></div>' +
      capHtml +
      '</div>' +
      '<label class="crozzo-lab-toggle"><input type="checkbox" id="crozzo-lab-preview-oper"' +
      (dash.previewOperative ? ' checked' : '') +
      ' onchange="crozzoLabTogglePreview(this.checked)"><span>Vista previa operación (como lo ve el personal)</span></label>' +
      '<div class="crozzo-lab-actions">' +
      '<button type="button" class="btn btn-outline btn-sm" onclick="crozzoLabSwitchTab(\'vista\')"><i data-lucide="eye-off"></i> Ajustar vista</button>' +
      '<button type="button" class="btn btn-outline btn-sm" onclick="crozzoLabSwitchTab(\'tope\')"><i data-lucide="gauge"></i> Tope</button>' +
      '<button type="button" class="btn btn-outline btn-sm" onclick="crozzoLabRefresh()"><i data-lucide="refresh-cw"></i> Actualizar</button>' +
      '</div>' +
      '<p class="form-hint crozzo-lab-secret-hint"><i data-lucide="keyboard"></i> Atajo oculto: <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd> · PIN: <strong>8888</strong></p></section>'
    );
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function wizardChecksHtml(checks) {
    return checks
      .map(function (t, i) {
        return '<label class="crozzo-lab-wizard-check"><input type="checkbox" id="crozzo-lab-wizard-chk-' + i + '"> ' + esc(t) + '</label>';
      })
      .join('');
  }

  function formatDeepInsights(deep) {
    if (!deep) return '<p class="form-hint">Sin datos de patrón.</p>';
    var list =
      '<ul class="crozzo-lab-list crozzo-lab-insights">' +
      (deep.insights || [])
        .map(function (i) {
          return '<li>' + esc(i.text) + '</li>';
        })
        .join('') +
      '</ul>';
    var dow =
      '<div class="crozzo-lab-pattern crozzo-lab-pattern--easy">' +
      (deep.byDow || [])
        .map(function (s) {
          return (
            '<div class="crozzo-lab-pattern__cell' +
            (deep.todayDow === s.dow ? ' is-today' : '') +
            '"><span>' +
            esc(s.label) +
            '</span><strong>' +
            s.easyScore +
            '</strong><small>' +
            s.eligible +
            ' eleg.</small></div>'
          );
        })
        .join('') +
      '</div>';
    return list + '<h4>Score por día</h4>' + dow;
  }

  function formatPicksList(picks, limit) {
    limit = limit || 12;
    if (!picks || !picks.length) return '<p class="form-hint">Sin facturas elegibles para este ajuste.</p>';
    return (
      '<ul class="crozzo-lab-list">' +
      picks
        .slice(0, limit)
        .map(function (p) {
          return (
            '<li>#' +
            esc(p.consecutivo || '—') +
            ' · ' +
            fmt(p.original) +
            ' → ' +
            fmt(p.after != null ? p.after : p.original - p.delta) +
            ' (−' +
            fmt(p.delta) +
            ')</li>'
          );
        })
        .join('') +
      (picks.length > limit ? '<li>… y ' + (picks.length - limit) + ' más</li>' : '') +
      '</ul>'
    );
  }

  function formatMarginAlert(ev, scope) {
    scope = scope || 'periodo';
    if (!ev || !ev.ok) return '';
    var cls = ev.feasible ? 'crozzo-lab-margin-alert--ok' : ev.coveragePct >= 70 ? 'crozzo-lab-margin-alert--warn' : 'crozzo-lab-margin-alert--critical';
    var head = ev.feasible
      ? '<strong>Meta alcanzable.</strong> ' + esc(ev.levelLabel) + ' cubriría ~' + ev.coveragePct + '% de la meta en el ' + scope + '.'
      : '<strong>Meta no alcanzable al 100%.</strong> ' +
        esc(ev.levelLabel) +
        ' solo lograría ~' +
        ev.coveragePct +
        '% (−' +
        fmt(ev.achievedReduce) +
        ' de −' +
        fmt(ev.targetReduce) +
        ').';
    var gapLine = ev.gap > 0 ? '<br>Faltan <strong>−' + fmt(ev.gap) + '</strong> sin cubrir con facturas elegibles.' : '';
    var suggest = ev.suggestedLabel
      ? '<br><small>Sugerencia: pruebe <strong>' + esc(ev.suggestedLabel) + '</strong> o baje la meta.</small>'
      : !ev.feasible
        ? '<br><small>Ningún nivel superior llega al 100% con esta meta — reduzca el monto o revise elegibles.</small>'
        : '';
    var ctx =
      ev.fiscalTotal > 0
        ? '<br><small>Ventas del periodo: ' + fmt(ev.fiscalTotal) + ' · Meta ≈ ' + (ev.pctOfSales || 0) + '% del periodo</small>'
        : '';
    return '<div class="crozzo-lab-margin-alert ' + cls + '">' + head + gapLine + suggest + ctx + '</div>';
  }

  function formatTodayGapAlert(preview) {
    if (!preview || preview.achievable) return '';
    return (
      '<div class="crozzo-lab-margin-alert crozzo-lab-margin-alert--warn">' +
      '<strong>Atención — solo hoy:</strong> pidió ocultar <strong>−' +
      fmt(preview.needReduce) +
      '</strong> pero con ' +
      esc(preview.levelLabel) +
      ' solo se lograría ~' +
      preview.coveragePct +
      '% (−' +
      fmt(preview.reduced) +
      '). Faltan <strong>−' +
      fmt(preview.gap) +
      '</strong>. Se aplicará lo máximo posible, no el total pedido.</div>'
    );
  }

  function readSimOpts() {
    var pct = num(document.getElementById('crozzo-lab-sim-pct') && document.getElementById('crozzo-lab-sim-pct').value) || 8;
    var days = num(document.getElementById('crozzo-lab-sim-days') && document.getElementById('crozzo-lab-sim-days').value) || 30;
    var amount = num(document.getElementById('crozzo-lab-sim-amount') && document.getElementById('crozzo-lab-sim-amount').value);
    var salesTotal = num(document.getElementById('crozzo-lab-sim-sales') && document.getElementById('crozzo-lab-sim-sales').value);
    var opts = { daysBack: days };
    if (salesTotal > 0) opts.salesTotal = salesTotal;
    if (amount > 0) opts.targetReduce = amount;
    else opts.targetPct = pct;
    return opts;
  }

  function formatProjectionBanner(projection) {
    if (!projection || !projection.ok) return '';
    return (
      '<div class="crozzo-lab-projection-banner">' +
      '<strong><i data-lucide="split"></i> Proyección de facturas</strong> · ' +
      esc(projection.label) +
      '<br>Venta declarada: <strong>' +
      fmt(projection.salesTotal) +
      '</strong> → ~<strong>' +
      projection.invoiceCount.toLocaleString('es-CO') +
      '</strong> facturas simuladas · ' +
      '<strong>' +
      projection.eligibleCount.toLocaleString('es-CO') +
      '</strong> elegibles (' +
      projection.eligiblePct +
      '%) · ticket prom. ' +
      fmt(projection.avgTicket) +
      '<br><small>El motor reparte ese total por días y corre los 5 niveles sobre ese universo aproximado (no modifica ventas reales).</small></div>'
    );
  }

  function formatEmuReportHtml(r) {
    if (!r || !r.ok) return '<p class="form-hint">No se pudo generar el informe.</p>';
    var s = r.summary || {};
    var lvlRows = (r.levelComparison || [])
      .map(function (row) {
        var s = row.sim || {};
        var cfg = row.config || {};
        return (
          '<tr><td>' +
          esc(cfg.label || 'Nivel ' + row.level) +
          '</td><td>' +
          (s.totalPicks || 0) +
          '</td><td>−' +
          fmt(s.totalReduced) +
          '</td><td>' +
          (s.coveragePct || 0) +
          '%</td><td>' +
          (s.avgTolerance || cfg.tolerance || 0) +
          '</td></tr>'
        );
      })
      .join('');
    var ms = r.monthSimulation || {};
    return (
      '<div class="crozzo-lab-emu-report">' +
      '<p class="form-hint">Generado ' +
      new Date(r.generatedAt).toLocaleString('es-CO') +
      (r.sandboxActive ? ' · <strong>Sandbox activo</strong>' : '') +
      '</p>' +
      '<div class="crozzo-lab-kpi-row crozzo-lab-kpi-row--4">' +
      '<div class="crozzo-lab-kpi"><span>Mejor día</span><strong>' +
      esc(s.bestDay || '—') +
      '</strong></div>' +
      '<div class="crozzo-lab-kpi"><span>Score hoy</span><strong>' +
      (s.todayScore || 0) +
      '/100</strong></div>' +
      '<div class="crozzo-lab-kpi"><span>Nivel sugerido</span><strong>' +
      (s.suggestedLevel || '—') +
      '</strong></div>' +
      '<div class="crozzo-lab-kpi"><span>Cobertura mes</span><strong>' +
      (s.monthCoverage || 0) +
      '%</strong></div></div>' +
      '<div class="crozzo-lab-kpi-row">' +
      '<div class="crozzo-lab-kpi"><span>Reducción simulada mes</span><strong>−' +
      fmt(s.monthReduced) +
      '</strong></div>' +
      '<div class="crozzo-lab-kpi"><span>Rec. preview hoy</span><strong>' +
      (s.recFacturas || 0) +
      ' facturas</strong></div></div>' +
      '<h4>Insights de patrón</h4>' +
      formatDeepInsights(r.deepPatterns) +
      '<h4>Comparativa de niveles</h4>' +
      '<div class="crozzo-lab-sim-table-wrap"><table class="crozzo-lab-sim-table"><thead><tr><th>Nivel</th><th>Facturas</th><th>Reducción</th><th>Cobertura</th><th>Tolerancia</th></tr></thead><tbody>' +
      lvlRows +
      '</tbody></table></div>' +
      (ms.days && ms.days.length
        ? '<h4>Simulación mes (muestra)</h4><ul class="crozzo-lab-list">' +
          ms.days
            .slice(0, 5)
            .map(function (d) {
              return '<li>' + esc(d.iso) + ' · −' + fmt(d.reduced) + ' · ' + (d.pickCount || 0) + ' fact.</li>';
            })
            .join('') +
          (ms.days.length > 5 ? '<li>… ' + ms.days.length + ' días total</li>' : '') +
          '</ul>'
        : '') +
      (r.recPreview && r.recPreview.picks && r.recPreview.picks.length
        ? '<h4>Preview recomendación hoy</h4>' + formatPicksList(r.recPreview.picks, 6)
        : '<p class="form-hint">Preview: sin elegibles hoy para recomendación.</p>') +
      '</div>'
    );
  }

  function renderTabPatrones(cfg) {
    var c = Core();
    if (!c) return '';
    var deep = c.analyzePatternsDeep(cfg.emulation.historyMonths || 3);
    var shiftLabels = { manana: 'Mañana (0–11h)', tarde: 'Tarde (12–17h)', noche: 'Noche (18–23h)' };
    var maxShift = Math.max(1, deep.byShift.manana.eligible, deep.byShift.tarde.eligible, deep.byShift.noche.eligible);
    var shiftHtml = ['manana', 'tarde', 'noche']
      .map(function (k) {
        var sh = deep.byShift[k];
        var h = Math.max(8, Math.round((sh.eligible / maxShift) * 100));
        return (
          '<div class="crozzo-lab-pattern__cell"><span>' +
          shiftLabels[k] +
          '</span><div class="crozzo-lab-bar" style="height:' +
          h +
          '%"></div><strong>' +
          sh.eligible +
          '</strong><small>' +
          sh.count +
          ' vtas</small></div>'
        );
      })
      .join('');
    var peakHtml =
      '<ul class="crozzo-lab-list">' +
      (deep.peakHours || [])
        .filter(function (h) {
          return h.eligible > 0;
        })
        .map(function (h) {
          return '<li>' + esc(h.label) + ' · ' + h.eligible + ' elegibles · ' + h.count + ' ventas</li>';
        })
        .join('') +
      '</ul>';
    var last = c.loadLastEmulationReport();
    return (
      '<section class="crozzo-lab-section">' +
      '<h3><i data-lucide="activity"></i> Análisis de patrones</h3>' +
      '<p class="crozzo-lab-desc">Cruza día de semana, franjas horarias y turnos para decidir cuándo aplicar ajustes con menor riesgo operativo.</p>' +
      '<div class="crozzo-lab-actions">' +
      '<button type="button" class="btn btn-outline btn-sm" onclick="crozzoLabRefresh()"><i data-lucide="refresh-cw"></i> Actualizar</button>' +
      '<button type="button" class="btn btn-primary btn-sm" onclick="crozzoLabRunEmuAnalysis()"><i data-lucide="microscope"></i> Análisis completo</button>' +
      '</div>' +
      '<h4>Insights automáticos</h4>' +
      formatDeepInsights(deep) +
      '<h4>Turnos (elegibles históricos)</h4>' +
      '<div class="crozzo-lab-pattern">' +
      shiftHtml +
      '</div>' +
      '<h4>Franjas horarias pico</h4>' +
      peakHtml +
      (last
        ? '<h4>Último informe de emulación</h4><div class="crozzo-lab-emu-report-wrap">' + formatEmuReportHtml(last) + '</div>'
        : '<p class="form-hint">Ejecute «Análisis completo» en Emulación o aquí para generar un informe combinado.</p>') +
      '</section>'
    );
  }

  function renderPinGate() {
    var c = Core();
    if (!c) return '<div class="card"><p>Módulo laboratorio no cargado.</p></div>';
    var hasPin = c.pinIsSet();
    return (
      '<div class="crozzo-lab-gate">' +
      '<div class="crozzo-lab-gate__card">' +
      '<div class="crozzo-lab-gate__icon"><i data-lucide="flask-conical"></i></div>' +
      '<h2>Laboratorio administrativo</h2>' +
      '<p class="crozzo-lab-gate__hint">Acceso restringido · PIN de 4 dígitos · Solo administradores<br><small>PIN por defecto: <strong>8888</strong> (cámbielo con «Cambiar PIN»)</small></p>' +
      (hasPin
        ? '<label class="form-label" for="crozzo-lab-pin">PIN</label>' +
          '<input type="password" id="crozzo-lab-pin" class="form-input crozzo-lab-pin-input" maxlength="4" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="••••">' +
          '<button type="button" class="btn btn-primary" onclick="crozzoLabSubmitPin()"><i data-lucide="unlock"></i> Entrar</button>'
        : '<p class="form-hint">Primera vez: configure el PIN del laboratorio.</p>' +
          '<div class="form-grid"><div class="form-group"><label class="form-label">PIN nuevo</label><input type="password" id="crozzo-lab-pin-new" class="form-input crozzo-lab-pin-input" maxlength="4" inputmode="numeric"></div>' +
          '<div class="form-group"><label class="form-label">Confirmar PIN</label><input type="password" id="crozzo-lab-pin-confirm" class="form-input crozzo-lab-pin-input" maxlength="4" inputmode="numeric"></div></div>' +
          '<button type="button" class="btn btn-primary" onclick="crozzoLabSetupPin()"><i data-lucide="key"></i> Guardar PIN</button>') +
      '</div></div>'
    );
  }

  function renderTabEmulacion(cfg) {
    var c = Core();
    var pattern = c ? c.analyzeWeekdayPattern(cfg.emulation.historyMonths) : null;
    var emuOn = c && global.CrozzoEmulationHarness && global.CrozzoEmulationHarness.isActive && global.CrozzoEmulationHarness.isActive();
    var patternHtml = '';
    if (pattern) {
      var maxAvg = Math.max.apply(null, pattern.avgTicketByDow.concat([1]));
      patternHtml =
        '<div class="crozzo-lab-pattern">' +
        pattern.labels
          .map(function (lbl, i) {
            var avg = pattern.avgTicketByDow[i] || 0;
            var cnt = pattern.countByDow[i] || 0;
            var h = Math.max(8, Math.round((avg / maxAvg) * 100));
            return (
              '<div class="crozzo-lab-pattern__cell">' +
              '<span>' +
              lbl +
              '</span>' +
              '<div class="crozzo-lab-bar" style="height:' +
              h +
              '%"></div>' +
              '<strong>' +
              fmt(avg) +
              '</strong><small>' +
              cnt +
              ' vtas</small></div>'
            );
          })
          .join('') +
        '</div>';
    }
    return (
      '<section class="crozzo-lab-section">' +
      '<h3><i data-lucide="calendar-range"></i> Emulación y proyección</h3>' +
      '<p class="crozzo-lab-desc">Analiza ventas históricas y proyecta meses futuros. El sandbox usa datos aislados (<code>_EMU</code>) sin tocar producción.</p>' +
      '<div class="crozzo-lab-status-row">' +
      '<span class="crozzo-lab-pill' +
      (emuOn ? ' is-info' : '') +
      '">Sandbox: ' +
      (emuOn ? 'ACTIVO' : 'Inactivo') +
      '</span>' +
      (cfg.emulation.lastProjectionAt
        ? '<span class="crozzo-lab-pill">Última proyección: ' + new Date(cfg.emulation.lastProjectionAt).toLocaleString('es-CO') + '</span>'
        : '') +
      '</div>' +
      '<div class="form-grid crozzo-lab-form-grid">' +
      '<div class="form-group"><label class="form-label">Meses históricos</label><input type="number" id="crozzo-lab-hist-months" class="form-input" min="1" max="6" value="' +
      (cfg.emulation.historyMonths || 3) +
      '"></div>' +
      '<div class="form-group"><label class="form-label">Meses a proyectar</label><input type="number" id="crozzo-lab-proj-months" class="form-input" min="1" max="6" value="' +
      (cfg.emulation.projectMonths || 2) +
      '"></div></div>' +
      '<div class="crozzo-lab-actions">' +
      '<button type="button" class="btn btn-outline" onclick="crozzoLabRunProjection()"><i data-lucide="trending-up"></i> Calcular proyección</button>' +
      '<button type="button" class="btn btn-primary" onclick="crozzoLabOpenSandbox()"><i data-lucide="test-tube"></i> Abrir sandbox</button>' +
      '<button type="button" class="btn btn-outline" onclick="crozzoLabResetSandbox()"><i data-lucide="trash-2"></i> Reset sandbox</button>' +
      '</div>' +
      '<h4>Patrón por día (ticket prom.)</h4>' +
      patternHtml +
      '<div id="crozzo-lab-projection-out" class="crozzo-lab-out"></div>' +
      '<hr class="crozzo-lab-divider">' +
      '<h4><i data-lucide="microscope"></i> Análisis completo en emulación</h4>' +
      '<p class="crozzo-lab-desc">Combina patrones profundos, comparativa de niveles, simulación mensual y preview de recomendación — sin modificar producción.</p>' +
      '<div class="form-grid crozzo-lab-form-grid">' +
      '<div class="form-group"><label class="form-label">Meta reducción (%)</label><input type="number" id="crozzo-lab-emu-pct" class="form-input" min="1" max="40" value="8"></div>' +
      '<div class="form-group"><label class="form-label">Días a simular</label><input type="number" id="crozzo-lab-emu-days" class="form-input" min="7" max="90" value="30"></div></div>' +
      '<div class="crozzo-lab-actions">' +
      '<button type="button" class="btn btn-primary" onclick="crozzoLabRunEmuAnalysis()"><i data-lucide="play-circle"></i> Ejecutar análisis completo</button>' +
      '</div>' +
      '<div id="crozzo-lab-emu-analysis-out" class="crozzo-lab-out"></div>' +
      '</section>'
    );
  }

  function renderTabTope(cfg, cap) {
    return (
      '<section class="crozzo-lab-section">' +
      '<h3><i data-lucide="gauge"></i> Tope operativo oculto</h3>' +
      '<p class="crozzo-lab-desc">El personal de operación <strong>no ve</strong> este tope ni recibe avisos. Solo usted (admin) recibe alerta al acercarse.</p>' +
      '<label class="crozzo-lab-toggle"><input type="checkbox" id="crozzo-lab-cap-enabled"' +
      (cfg.hiddenCap.enabled ? ' checked' : '') +
      '><span>Activar tope diario oculto</span></label>' +
      '<div class="form-grid crozzo-lab-form-grid">' +
      '<div class="form-group"><label class="form-label">Tope diario ($)</label><input type="number" id="crozzo-lab-cap-amount" class="form-input" min="0" step="1000" value="' +
      (cfg.hiddenCap.amount || 0) +
      '"></div>' +
      '<div class="form-group"><label class="form-label">Alerta admin (%)</label><input type="number" id="crozzo-lab-cap-pct" class="form-input" min="50" max="100" value="' +
      (cfg.hiddenCap.alertPct || 90) +
      '"></div></div>' +
      (cap.active
        ? '<div class="crozzo-lab-kpi-row">' +
          '<div class="crozzo-lab-kpi"><span>Vista operativa hoy</span><strong>' +
          fmt(cap.operativeTotal) +
          '</strong></div>' +
          '<div class="crozzo-lab-kpi"><span>Registro fiscal hoy</span><strong>' +
          fmt(cap.fiscalTotal) +
          '</strong></div>' +
          '<div class="crozzo-lab-kpi' +
          (cap.alert ? ' crozzo-lab-kpi--warn' : '') +
          '"><span>Uso del tope</span><strong>' +
          cap.pct +
          '%</strong></div></div>'
        : '<p class="form-hint">Tope desactivado.</p>') +
      '<button type="button" class="btn btn-primary" onclick="crozzoLabStartSaveCap()"><i data-lucide="save"></i> Guardar tope</button>' +
      '</section>'
    );
  }

  function renderTabVista(cfg, mask) {
    var c = Core();
    var rep = c ? c.getEligibleReport() : { eligible: [], blocked: [] };
    return (
      '<section class="crozzo-lab-section">' +
      '<h3><i data-lucide="eye-off"></i> Vista operativa (bajo riesgo)</h3>' +
      '<p class="crozzo-lab-desc">Ajusta lo que ve operación sin alterar el registro fiscal. Solo tickets POS en efectivo elegibles: sin banco, WhatsApp, FE ni facturas delicadas.</p>' +
      '<label class="crozzo-lab-toggle"><input type="checkbox" id="crozzo-lab-mask-enabled"' +
      (cfg.operMask.enabled ? ' checked' : '') +
      '><span>Enmascarar vista operativa</span></label>' +
      '<label class="crozzo-lab-toggle"><input type="checkbox" id="crozzo-lab-pattern-adj"' +
      (cfg.operMask.patternAdjust ? ' checked' : '') +
      '><span>Ajuste por patrón semanal (ej. domingo vs lunes)</span></label>' +
      '<div class="form-group"><label class="form-label">Nivel de descuento (tolerancia)</label><select id="crozzo-lab-mask-level" class="form-select">' +
      (c
        ? c.listMaskLevels()
            .map(function (lv) {
              return (
                '<option value="' +
                lv.id +
                '"' +
                (num(cfg.operMask.level) === lv.id ? ' selected' : '') +
                '>' +
                esc(lv.label) +
                ' — tolerancia ' +
                lv.tolerance +
                '/100 · ' +
                esc(lv.tagline) +
                '</option>'
              );
            })
            .join('')
        : '') +
      '</select></div>' +
      '<div class="form-group"><label class="form-label">Monto máx. factura elegible ($)</label><input type="number" id="crozzo-lab-max-eligible" class="form-input" value="' +
      (cfg.operMask.maxEligibleAmount || 350000) +
      '"></div>' +
      '<div class="form-group"><label class="form-label">Reducción manual adicional ($)</label><input type="number" id="crozzo-lab-manual-reduce" class="form-input" min="0" step="1000" value="0"></div>' +
      '<div class="crozzo-lab-actions">' +
      '<button type="button" class="btn btn-primary" onclick="crozzoLabStartApplyMask()"><i data-lucide="play"></i> Aplicar ajuste</button>' +
      '<button type="button" class="btn btn-outline" onclick="crozzoLabClearMask()"><i data-lucide="rotate-ccw"></i> Limpiar máscara</button>' +
      '</div>' +
      '<div class="crozzo-lab-eligible">' +
      '<h4>Hoy · elegibles: ' +
      rep.eligible.length +
      ' · protegidas: ' +
      rep.blocked.length +
      '</h4>' +
      renderBlockedSummary(c) +
      '<ul class="crozzo-lab-list">' +
      rep.eligible
        .slice(0, 8)
        .map(function (r) {
          return '<li>#' + (r.consecutivo || '—') + ' · ' + fmt(r.total) + ' · efectivo</li>';
        })
        .join('') +
      (rep.eligible.length > 8 ? '<li>… y ' + (rep.eligible.length - 8) + ' más</li>' : '') +
      '</ul></div>' +
      (mask.lastApplyAt
        ? '<p class="form-hint">Última aplicación: ' + new Date(mask.lastApplyAt).toLocaleString('es-CO') + ' · ' + Object.keys(mask.entries).length + ' entradas activas</p>'
        : '') +
      '<p class="crozzo-lab-note"><i data-lucide="shield-check"></i> Al confirmar un <strong>cierre formal</strong>, el sistema concilia automáticamente y restaura la vista fiscal completa.</p>' +
      '<hr class="crozzo-lab-divider">' +
      '<h4><i data-lucide="scan-search"></i> Modo caza sigilosa</h4>' +
      '<p class="crozzo-lab-desc">Encuentra las facturas <strong>menos detectables</strong> (score sigilo alto) y ve cómo ampliar el pool de elegibles.</p>' +
      '<div class="form-grid crozzo-lab-form-grid">' +
      '<div class="form-group"><label class="form-label">Días a rastrear</label><input type="number" id="crozzo-lab-stealth-days" class="form-input" min="1" max="90" value="30"></div>' +
      '<div class="form-group"><label class="form-label">Nivel para score</label><select id="crozzo-lab-stealth-level" class="form-select"><option value="1" selected>Nivel 1 · Discreto</option><option value="2">Nivel 2</option><option value="3">Nivel 3</option></select></div>' +
      '</div>' +
      '<div class="crozzo-lab-actions">' +
      '<button type="button" class="btn btn-primary btn-sm" onclick="crozzoLabRunStealthHunt(false)"><i data-lucide="scan-search"></i> Rastrear periodo</button>' +
      '<button type="button" class="btn btn-outline btn-sm" onclick="crozzoLabRunStealthHunt(true)"><i data-lucide="sun"></i> Solo hoy</button>' +
      '</div>' +
      '<div id="crozzo-lab-stealth-out" class="crozzo-lab-out"></div>' +
      '</section>'
    );
  }

  function renderBlockedSummary(c) {
    if (!c) return '';
    var counts = c.getBlockedReasonsSummary();
    var keys = Object.keys(counts);
    if (!keys.length) return '';
    return (
      '<div class="crozzo-lab-blocked-chips">' +
      keys
        .map(function (k) {
          return '<span class="crozzo-lab-blocked-chip">' + esc(REASON_LABELS[k] || k) + ': ' + counts[k] + '</span>';
        })
        .join('') +
      '</div>'
    );
  }

  function renderTabNiveles(cfg) {
    var c = Core();
    if (!c) return '';
    var levels = c.listMaskLevels();
    var lvlCards = levels
      .map(function (lv) {
        return (
          '<div class="crozzo-lab-level-card" data-level="' +
          lv.id +
          '">' +
          '<div class="crozzo-lab-level-card__head">' +
          '<strong>' +
          esc(lv.label) +
          '</strong>' +
          '<span class="crozzo-lab-level-card__tol">Tolerancia ' +
          lv.tolerance +
          '</span></div>' +
          '<p>' +
          esc(lv.tagline) +
          '</p>' +
          (lv.strategyNote ? '<p class="crozzo-lab-level-strategy">' + esc(lv.strategyNote) + '</p>' : '') +
          '<ul class="crozzo-lab-level-meta">' +
          '<li>Máx ' +
          Math.round(lv.maxCutPct * 100) +
          '% por ticket</li>' +
          '<li>Usa ~' +
          Math.round((lv.cutFill || 0.5) * 100) +
          '% del techo por factura</li>' +
          '<li>Hasta ' +
          lv.maxInvoicesDay +
          ' fact/día</li>' +
          '<li>Redondeo $' +
          lv.roundStep.toLocaleString('es-CO') +
          '</li></ul></div>'
        );
      })
      .join('');
    return (
      '<section class="crozzo-lab-section">' +
      '<h3><i data-lucide="layers"></i> Simulador de niveles (último mes)</h3>' +
      '<p class="crozzo-lab-desc">Cada nivel <strong>no recorta igual</strong>: el 1 reparte en facturas chicas casi invisibles; el 5 concentra en pocas facturas grandes. El recorte total puede ser similar si todos alcanzan la meta — compare <strong>facturas</strong>, <strong>corte promedio</strong> y <strong>detectabilidad</strong>.</p>' +
      '<div class="crozzo-lab-level-grid">' +
      lvlCards +
      '</div>' +
      '<div class="form-grid crozzo-lab-form-grid crozzo-lab-form-grid--wide">' +
      '<div class="form-group crozzo-lab-form-group--wide"><label class="form-label">Vendimos en el periodo ($)</label><input type="number" id="crozzo-lab-sim-sales" class="form-input" min="0" step="1000000" placeholder="Ej. 300000000"></div>' +
      '<div class="form-group"><label class="form-label">Meta a ocultar (%)</label><input type="number" id="crozzo-lab-sim-pct" class="form-input" min="1" max="40" step="1" value="10"></div>' +
      '<div class="form-group"><label class="form-label">O meta fija ($)</label><input type="number" id="crozzo-lab-sim-amount" class="form-input" min="0" step="1000000" placeholder="Ej. 30000000"></div>' +
      '<div class="form-group"><label class="form-label">Días del periodo</label><input type="number" id="crozzo-lab-sim-days" class="form-input" min="7" max="90" value="30"></div>' +
      '<div class="form-group"><label class="form-label">Nivel a probar</label><select id="crozzo-lab-sim-level" class="form-select">' +
      levels
        .map(function (lv) {
          return '<option value="' + lv.id + '">' + esc(lv.label) + '</option>';
        })
        .join('') +
      '</select></div></div>' +
      '<p class="form-hint">Ejemplo completo: <strong>Vendimos $300M</strong> → meta <strong>10%</strong> o <strong>$30M</strong> a ocultar → <strong>Comparar los 5 niveles</strong>. El sistema divide en facturas aproximadas (mix elegible/no elegible) y simula todo el flujo.</p>' +
      '<div class="crozzo-lab-actions">' +
      '<button type="button" class="btn btn-outline" onclick="crozzoLabTestMargin()"><i data-lucide="alert-triangle"></i> Probar margen (1 nivel)</button>' +
      '<button type="button" class="btn btn-primary" onclick="crozzoLabCompareLevels()"><i data-lucide="git-compare"></i> Comparar los 5 niveles</button>' +
      '<button type="button" class="btn btn-outline" onclick="crozzoLabSimLevelDetail()"><i data-lucide="list"></i> Detalle día a día</button>' +
      '</div>' +
      '<div id="crozzo-lab-margin-out" class="crozzo-lab-out"></div>' +
      '<div id="crozzo-lab-sim-out" class="crozzo-lab-sim-out"></div></section>'
    );
  }

  function renderTabRecomendaciones(cfg) {
    var c = Core();
    if (!c) return '';
    var pending = c.getPendingRecommendation();
    var pattern = c.analyzeEasyDiscountByDow(cfg.emulation.historyMonths || 3);
    var patternHtml =
      '<div class="crozzo-lab-pattern crozzo-lab-pattern--easy">' +
      pattern
        .map(function (s) {
          return (
            '<div class="crozzo-lab-pattern__cell' +
            (pending && pending.pattern && pending.pattern.dow === s.dow ? ' is-today' : '') +
            '"><span>' +
            s.label +
            '</span><strong>' +
            s.easyScore +
            '</strong><small>' +
            s.eligible +
            ' eleg.</small></div>'
          );
        })
        .join('') +
      '</div>';

    var pendingHtml = '';
    if (pending) {
      pendingHtml =
        '<div class="crozzo-lab-rec-card crozzo-lab-rec-card--pending">' +
        '<div class="crozzo-lab-rec-card__head"><strong><i data-lucide="bell-ring"></i> En espera · cierre ' +
        esc(pending.targetClose === 'tarde' ? 'tarde/noche' : 'del día') +
        '</strong><span class="crozzo-lab-pill is-warn">Pendiente</span></div>' +
        '<p>' +
        esc(pending.message) +
        '</p>' +
        '<p class="form-hint">' +
        esc(pending.pattern && pending.pattern.note ? pending.pattern.note : '') +
        '</p>' +
        '<div class="crozzo-lab-kpi-row">' +
        '<div class="crozzo-lab-kpi"><span>Facturas</span><strong>' +
        pending.picks.length +
        '</strong></div>' +
        '<div class="crozzo-lab-kpi"><span>Recorte</span><strong>−' +
        fmt(pending.reducedPlanned) +
        '</strong></div>' +
        '<div class="crozzo-lab-kpi"><span>Nivel</span><strong>' +
        esc(pending.levelLabel || '') +
        '</strong></div>' +
        '<div class="crozzo-lab-kpi"><span>Tolerancia</span><strong>' +
        pending.avgTolerance +
        '/100</strong></div></div>' +
        '<ul class="crozzo-lab-list">' +
        pending.picks
          .map(function (p) {
            return (
              '<li>#' +
              (p.consecutivo || '—') +
              ' · ' +
              fmt(p.original) +
              ' → ' +
              fmt(p.after) +
              ' (−' +
              fmt(p.delta) +
              ')</li>'
            );
          })
          .join('') +
        '</ul>' +
        '<p class="crozzo-lab-note"><i data-lucide="info"></i> Generada tras cierre <strong>' +
        esc((pending.triggerClose && pending.triggerClose.shiftLabel) || '') +
        '</strong>. Si no acepta antes del cierre de la noche o al iniciar mañana, <strong>se pierde</strong>.</p>' +
        '<div class="crozzo-lab-actions">' +
        '<button type="button" class="btn btn-primary" onclick="crozzoLabStartAcceptRecommend(\'' +
        esc(pending.id) +
        '\')"><i data-lucide="check"></i> Aceptar y aplicar</button>' +
        '<button type="button" class="btn btn-outline" onclick="crozzoLabRejectRecommend(\'' +
        esc(pending.id) +
        '\')"><i data-lucide="x"></i> Descartar</button></div></div>';
    } else {
      pendingHtml =
        '<div class="crozzo-lab-rec-card crozzo-lab-rec-card--empty">' +
        '<p>No hay recomendación pendiente hoy. Se genera automáticamente tras un <strong>cierre de cajero</strong> (mañana o tarde).</p>' +
        '<button type="button" class="btn btn-outline btn-sm" onclick="crozzoLabStartGenRecommend()"><i data-lucide="sparkles"></i> Generar manual (hoy)</button></div>';
    }

    return (
      '<section class="crozzo-lab-section">' +
      '<h3><i data-lucide="bell-ring"></i> Recomendaciones post-cierre</h3>' +
      '<p class="crozzo-lab-desc">El cajero cierra → el sistema analiza el patrón del día y propone qué facturas elegibles retirar de la <strong>vista operativa</strong>. Usted decide en el Lab; el personal no ve esta pantalla.</p>' +
      '<label class="crozzo-lab-toggle"><input type="checkbox" id="crozzo-lab-rec-enabled"' +
      (cfg.recommendations && cfg.recommendations.enabled !== false ? ' checked' : '') +
      '><span>Activar recomendaciones automáticas</span></label>' +
      '<label class="crozzo-lab-toggle"><input type="checkbox" id="crozzo-lab-rec-auto"' +
      (cfg.recommendations && cfg.recommendations.autoAfterClose !== false ? ' checked' : '') +
      '><span>Generar tras cada cierre de cajero</span></label>' +
      '<div class="form-group"><label class="form-label">Nivel sugerido por defecto</label><select id="crozzo-lab-rec-level" class="form-select">' +
      (c.listMaskLevels()
        .map(function (lv) {
          return (
            '<option value="' +
            lv.id +
            '"' +
            (Number(cfg.recommendations && cfg.recommendations.level) === lv.id ? ' selected' : '') +
            '>' +
            esc(lv.label) +
            '</option>'
          );
        })
        .join('')) +
      '</select></div>' +
      '<button type="button" class="btn btn-outline btn-sm" onclick="crozzoLabSaveRecSettings()"><i data-lucide="save"></i> Guardar ajustes</button>' +
      '<h4>Días donde es más fácil descontar (score)</h4>' +
      patternHtml +
      pendingHtml +
      renderRecommendHistory(c) +
      '</section>'
    );
  }

  function renderRecommendHistory(c) {
    var list = c.loadRecommendations().slice(0, 8);
    if (!list.length) return '';
    return (
      '<h4 style="margin-top:16px">Historial reciente</h4><ul class="crozzo-lab-audit">' +
      list
        .map(function (r) {
          return (
            '<li><time>' +
            new Date(r.createdAt).toLocaleString('es-CO') +
            '</time> <strong>' +
            esc(r.status) +
            '</strong> · ' +
            esc(r.businessDate) +
            ' · ' +
            (r.picks ? r.picks.length : 0) +
            ' fact · −' +
            fmt(r.reducedPlanned || 0) +
            '</li>'
          );
        })
        .join('') +
      '</ul>'
    );
  }

  function renderTabResumen(cfg) {
    var c = Core();
    var dash = c ? c.getDashboardSummary() : null;
    if (!dash) return '<section class="crozzo-lab-section"><p>Sin datos.</p></section>';
    return renderDashboard(dash);
  }

  function renderMain() {
    var c = Core();
    if (!c || !c.isLabRole()) {
      return '<div class="card"><p class="page-subtitle">No autorizado. Solo administradores y super administradores.</p></div>';
    }
    if (!c.isSessionUnlocked()) return renderPinGate();
    var cfg = c.loadConfig();
    var mask = c.loadMask();
    var cap = c.hiddenCapStatus();
    var dash = c.getDashboardSummary();
    var pending = c.getPendingRecommendation();
    var capBadge = dash.cap.alert ? ' <span class="crozzo-lab-tab-badge">!</span>' : '';
    var recBadge = pending ? ' <span class="crozzo-lab-tab-badge">1</span>' : '';
    return (
      '<div class="crozzo-lab-page">' +
      '<div class="crozzo-lab-hero">' +
      '<div><h1 class="page-title"><i data-lucide="flask-conical"></i> Laboratorio</h1>' +
      '<p class="page-subtitle">Panel oculto · emulación · topes · vista operativa · conciliación en cierre</p></div>' +
      '<div class="crozzo-lab-hero__actions">' +
      '<span class="crozzo-lab-session-badge" id="crozzo-lab-session-badge">' +
      esc(dash.session) +
      '</span>' +
      '<button type="button" class="btn btn-outline btn-sm" onclick="crozzoLabLock()"><i data-lucide="lock"></i> Bloquear</button>' +
      '<button type="button" class="btn btn-outline btn-sm" onclick="crozzoLabOpenChangePin()"><i data-lucide="key"></i> PIN</button>' +
      '</div></div>' +
      '<div class="crozzo-lab-tabs" role="tablist">' +
      '<button type="button" class="crozzo-lab-tab is-active" data-lab-tab="resumen" onclick="crozzoLabSwitchTab(\'resumen\')">Resumen</button>' +
      '<button type="button" class="crozzo-lab-tab" data-lab-tab="recom" onclick="crozzoLabSwitchTab(\'recom\')">Recomendaciones' +
      recBadge +
      '</button>' +
      '<button type="button" class="crozzo-lab-tab" data-lab-tab="patrones" onclick="crozzoLabSwitchTab(\'patrones\')">Patrones</button>' +
      '<button type="button" class="crozzo-lab-tab" data-lab-tab="emu" onclick="crozzoLabSwitchTab(\'emu\')">Emulación</button>' +
      '<button type="button" class="crozzo-lab-tab" data-lab-tab="tope" onclick="crozzoLabSwitchTab(\'tope\')">Tope' +
      capBadge +
      '</button>' +
      '<button type="button" class="crozzo-lab-tab" data-lab-tab="niveles" onclick="crozzoLabSwitchTab(\'niveles\')">Niveles</button>' +
      '<button type="button" class="crozzo-lab-tab" data-lab-tab="vista" onclick="crozzoLabSwitchTab(\'vista\')">Vista operativa</button>' +
      '<button type="button" class="crozzo-lab-tab" data-lab-tab="audit" onclick="crozzoLabSwitchTab(\'audit\')">Auditoría</button>' +
      '</div>' +
      '<div id="crozzo-lab-panel-resumen" class="crozzo-lab-panel is-active">' +
      renderTabResumen(cfg) +
      '</div>' +
      '<div id="crozzo-lab-panel-recom" class="crozzo-lab-panel">' +
      renderTabRecomendaciones(cfg) +
      '</div>' +
      '<div id="crozzo-lab-panel-patrones" class="crozzo-lab-panel">' +
      renderTabPatrones(cfg) +
      '</div>' +
      '<div id="crozzo-lab-panel-emu" class="crozzo-lab-panel">' +
      renderTabEmulacion(cfg) +
      '</div>' +
      '<div id="crozzo-lab-panel-tope" class="crozzo-lab-panel">' +
      renderTabTope(cfg, cap) +
      '</div>' +
      '<div id="crozzo-lab-panel-vista" class="crozzo-lab-panel">' +
      renderTabVista(cfg, mask) +
      '</div>' +
      '<div id="crozzo-lab-panel-niveles" class="crozzo-lab-panel">' +
      renderTabNiveles(cfg) +
      '</div>' +
      '<div id="crozzo-lab-panel-audit" class="crozzo-lab-panel">' +
      renderAudit() +
      '</div></div>'
    );
  }

  function formatObviousnessReport(r) {
    if (!r || !r.ok) return '<p class="form-hint">No se pudo auditar obviedad.</p>';
    var verdictCls = r.verdict === 'ok' ? 'crozzo-lab-audit-verdict--ok' : r.verdict === 'caution' ? 'crozzo-lab-audit-verdict--warn' : 'crozzo-lab-audit-verdict--risk';
    return (
      '<div class="crozzo-lab-audit-report crozzo-lab-audit-report--obvious">' +
      '<div class="crozzo-lab-audit-verdict ' +
      verdictCls +
      '"><span>¿Es obvio?</span><strong>' +
      esc(r.visibilityLabel) +
      '</strong><small>' +
      r.obviousScore +
      '/100 detectabilidad operativa</small></div>' +
      '<p class="form-hint">Fuente: <strong>' +
      esc(r.contextLabel) +
      '</strong> · ' +
      esc(r.levelLabel) +
      ' · ' +
      r.picksCount +
      ' facturas · brecha día ' +
      r.deltaPct +
      '%</p>' +
      '<div class="crozzo-lab-kpi-row">' +
      '<div class="crozzo-lab-kpi"><span>Fiscal hoy</span><strong>' +
      fmt(r.fiscal) +
      '</strong></div>' +
      '<div class="crozzo-lab-kpi"><span>Vista operación</span><strong>' +
      fmt(r.oper) +
      '</strong></div>' +
      '<div class="crozzo-lab-kpi"><span>Oculto</span><strong>−' +
      fmt(r.hidden) +
      '</strong></div></div>' +
      '<h4>Factores</h4><ul class="crozzo-lab-audit-factors">' +
      (r.factors || [])
        .map(function (f) {
          return (
            '<li class="crozzo-lab-audit-factor crozzo-lab-audit-factor--' +
            esc(f.severity) +
            '"><strong>' +
            esc(f.label) +
            '</strong> · ' +
            esc(f.detail) +
            '</li>'
          );
        })
        .join('') +
      '</ul>' +
      (r.tips && r.tips.length ? '<h4>Sugerencias</h4><ul class="crozzo-lab-list">' + r.tips.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' : '') +
      '</div>'
    );
  }

  function formatComfortReport(r) {
    if (!r || !r.ok) return '<p class="form-hint">No se pudo auditar confianza.</p>';
    var verdictCls = r.verdict === 'ok' ? 'crozzo-lab-audit-verdict--ok' : r.verdict === 'caution' ? 'crozzo-lab-audit-verdict--warn' : 'crozzo-lab-audit-verdict--risk';
    var checksHtml = (r.checks || [])
      .map(function (c) {
        return (
          '<li class="crozzo-lab-audit-check' +
          (c.ok ? ' is-ok' : ' is-fail') +
          '"><span class="crozzo-lab-audit-check__icon">' +
          (c.ok ? '✓' : '!') +
          '</span><div><strong>' +
          esc(c.label) +
          '</strong><br><small>' +
          esc(c.detail) +
          '</small></div></li>'
        );
      })
      .join('');
    var picksHtml = (r.picksReview || [])
      .slice(0, 10)
      .map(function (p) {
        return (
          '<li class="' +
          (p.okToHide ? 'is-ok' : 'is-fail') +
          '">#' +
          esc(p.consecutivo) +
          ' · ' +
          fmt(p.original) +
          ' −' +
          fmt(p.delta) +
          (p.simulated ? ' · simulada' : p.okToHide ? ' · OK' : ' · revisar') +
          '</li>'
        );
      })
      .join('');
    return (
      '<div class="crozzo-lab-audit-report crozzo-lab-audit-report--comfort">' +
      '<div class="crozzo-lab-audit-verdict ' +
      verdictCls +
      '"><span>¿Me siento bien?</span><strong>' +
      esc(r.comfortLabel) +
      '</strong><small>' +
      r.comfortScore +
      '/100 confianza para ocultar</small></div>' +
      '<p class="form-hint">Fuente: <strong>' +
      esc(r.contextLabel) +
      '</strong> · ' +
      esc(r.levelLabel) +
      '</p>' +
      '<h4>Checklist</h4><ul class="crozzo-lab-audit-checks">' +
      checksHtml +
      '</ul>' +
      (r.affirmations && r.affirmations.length
        ? '<h4>Por qué puede proceder</h4><ul class="crozzo-lab-list crozzo-lab-affirmations">' +
          r.affirmations.map(function (a) { return '<li>' + esc(a) + '</li>'; }).join('') +
          '</ul>'
        : '') +
      (r.warnings && r.warnings.length
        ? '<h4>Advertencias</h4><ul class="crozzo-lab-list crozzo-lab-warnings">' +
          r.warnings.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') +
          '</ul>'
        : '') +
      (picksHtml ? '<h4>Facturas revisadas</h4><ul class="crozzo-lab-list">' + picksHtml + '</ul>' : '') +
      '</div>'
    );
  }

  function renderAuditLog() {
    var rows = [];
    try {
      rows = JSON.parse(localStorage.getItem('crozzo_lab_audit_v1') || '[]');
    } catch (_) {}
    if (!rows.length) return '<p class="form-hint">Sin eventos registrados.</p>';
    return (
      '<div class="crozzo-lab-actions"><button type="button" class="btn btn-outline btn-sm" onclick="crozzoLabClearAudit()">Limpiar log</button></div>' +
      '<ul class="crozzo-lab-audit">' +
      rows
        .slice(0, 40)
        .map(function (r) {
          return (
            '<li><time>' +
            new Date(r.at).toLocaleString('es-CO') +
            '</time> <strong>' +
            esc(AUDIT_LABELS[r.type] || r.type || '') +
            '</strong> · ' +
            esc(r.detail || '') +
            ' <span>— ' +
            esc(r.user || '') +
            '</span></li>'
          );
        })
        .join('') +
      '</ul>'
    );
  }

  function renderAudit() {
    return (
      '<section class="crozzo-lab-section">' +
      '<h3><i data-lucide="shield-check"></i> Auditorías de decisión</h3>' +
      '<p class="crozzo-lab-desc">Dos revisiones antes de esconder ventas de operación: <strong>1) ¿Es obvio?</strong> (riesgo de que lo noten) · <strong>2) ¿Me siento bien?</strong> (elegibles, fiscal intacto, protecciones).</p>' +
      '<div class="form-group"><label class="form-label">Qué analizar</label><select id="crozzo-lab-audit-source" class="form-select">' +
      '<option value="auto">Automático (máscara → recomendación → preview)</option>' +
      '<option value="mask">Solo máscara activa</option>' +
      '<option value="recommend">Solo recomendación pendiente</option>' +
      '<option value="preview">Solo preview de hoy</option>' +
      '</select></div>' +
      '<div class="crozzo-lab-actions">' +
      '<button type="button" class="btn btn-outline" onclick="crozzoLabRunObviousAudit()"><i data-lucide="eye"></i> 1 · ¿Es obvio?</button>' +
      '<button type="button" class="btn btn-outline" onclick="crozzoLabRunComfortAudit()"><i data-lucide="heart-handshake"></i> 2 · ¿Me siento bien?</button>' +
      '<button type="button" class="btn btn-primary" onclick="crozzoLabRunDecisionAudits()"><i data-lucide="clipboard-check"></i> Auditar ambas</button>' +
      '</div>' +
      '<div id="crozzo-lab-audit-report-out" class="crozzo-lab-out"></div>' +
      '<hr class="crozzo-lab-divider">' +
      '<h4><i data-lucide="history"></i> Log de eventos</h4>' +
      renderAuditLog() +
      '</section>'
    );
  }

  function refreshIcons() {
    try {
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
    } catch (_) {}
  }

  function renderPage() {
    return renderMain();
  }

  function initPage() {
    refreshIcons();
    bindLabPinInputs(document);
    crozzoLabInstallShortcuts();
    crozzoLabBindNavClick();
    var c = Core();
    if (!c) return;
    var cap = c.hiddenCapStatus();
    if (cap && cap.alert && typeof showToast === 'function') {
      showToast('Laboratorio: tope operativo al ' + cap.pct + '% — solo visible para admin', 'warning');
    }
    crozzoLabSyncNavVisibility();
    if (c.isSessionUnlocked()) {
      crozzoLabStartSessionTimer();
    }
  }

  var __labSessionTimer = null;
  function crozzoLabStartSessionTimer() {
    if (__labSessionTimer) clearInterval(__labSessionTimer);
    __labSessionTimer = setInterval(function () {
      var c = Core();
      var badge = document.getElementById('crozzo-lab-session-badge');
      if (!c || !badge) return;
      if (!c.isSessionUnlocked()) {
        badge.textContent = 'Expirada';
        clearInterval(__labSessionTimer);
        return;
      }
      badge.textContent = c.formatSessionRemaining();
    }, 15000);
  }

  global.crozzoLabRefresh = function () {
    if (typeof currentPage !== 'undefined' && currentPage === 'laboratorio-admin') {
      var el = document.getElementById('mainContent');
      if (el) {
        el.innerHTML = renderMain();
        initPage();
      }
    }
  };

  global.crozzoLabTogglePreview = function (on) {
    var c = Core();
    if (c && c.setPreviewOperative) c.setPreviewOperative(!!on);
    if (typeof showToast === 'function') {
      showToast(on ? 'Vista previa operación activa' : 'Vista fiscal restaurada', 'info');
    }
    crozzoLabRefresh();
  };

  global.crozzoLabRunStealthHunt = function (todayOnly) {
    var c = Core();
    if (!c || !c.huntStealthInvoices) return;
    var days = todayOnly ? 1 : num(document.getElementById('crozzo-lab-stealth-days') && document.getElementById('crozzo-lab-stealth-days').value) || 30;
    var level = num(document.getElementById('crozzo-lab-stealth-level') && document.getElementById('crozzo-lab-stealth-level').value) || 1;
    var opts = { daysBack: days, level: level, limit: 35 };
    if (todayOnly) {
      var iso = new Date().toISOString().slice(0, 10);
      opts.iso = iso;
      opts.daysBack = 1;
    }
    var r = c.huntStealthInvoices(opts);
    var out = document.getElementById('crozzo-lab-stealth-out');
    if (!out) return;
    if (!r.ok) {
      out.innerHTML = '<p class="form-hint">No se pudo rastrear.</p>';
      return;
    }
    var rows = (r.candidates || [])
      .map(function (x) {
        var cls = x.stealthScore >= 75 ? 'crozzo-lab-stealth--high' : x.stealthScore >= 55 ? 'crozzo-lab-stealth--mid' : '';
        return (
          '<tr class="' +
          cls +
          '"><td>#' +
          esc(x.consecutivo || '—') +
          '</td><td>' +
          esc(x.iso) +
          '</td><td>' +
          fmt(x.total) +
          '</td><td><strong>' +
          x.stealthScore +
          '</strong></td><td>' +
          x.tolerance +
          '/100</td><td>−' +
          fmt(x.suggestedCut) +
          ' (' +
          x.cutPct +
          '%)</td><td>' +
          esc(x.dowLabel) +
          ' ' +
          esc(x.hourLabel) +
          '</td></tr>'
        );
      })
      .join('');
    out.innerHTML =
      '<div class="crozzo-lab-projection-banner">' +
      '<strong>Pool sigiloso:</strong> ' +
      r.poolSize +
      ' facturas de ' +
      r.totalScanned +
      ' analizadas · nivel ' +
      esc(r.levelLabel) +
      (todayOnly ? ' · hoy' : ' · ' + days + ' días') +
      '</div>' +
      (r.growTips && r.growTips.length
        ? '<h4>Cómo encontrar más</h4><ul class="crozzo-lab-list">' +
          r.growTips.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') +
          '</ul>'
        : '') +
      (rows
        ? '<h4>Top menos detectables</h4><div class="crozzo-lab-sim-table-wrap"><table class="crozzo-lab-sim-table"><thead><tr><th>Fact.</th><th>Día</th><th>Total</th><th>Sigilo</th><th>Toler.</th><th>Corte sugerido</th><th>Cuándo</th></tr></thead><tbody>' +
          rows +
          '</tbody></table></div><p class="form-hint">Sigilo alto = ticket chico + corte pequeño + tolerancia alta. Priorice las primeras filas.</p>'
        : '<p class="form-hint">Sin candidatas sigilosas en este periodo — revise tips arriba para ampliar elegibles.</p>');
    if (typeof showToast === 'function') showToast(r.poolSize + ' facturas sigilosas encontradas', 'info');
    refreshIcons();
  };

  global.crozzoLabAuditSource = function () {
    var el = document.getElementById('crozzo-lab-audit-source');
    return el ? el.value : 'auto';
  };

  global.crozzoLabRunObviousAudit = function () {
    var c = Core();
    if (!c) return;
    var r = c.runObviousnessAudit({ source: global.crozzoLabAuditSource() });
    var out = document.getElementById('crozzo-lab-audit-report-out');
    if (out) out.innerHTML = formatObviousnessReport(r);
    if (typeof showToast === 'function') {
      showToast(r.visibilityLabel + ' · ' + r.obviousScore + '/100 obviedad', r.verdict === 'ok' ? 'success' : 'warning');
    }
    refreshIcons();
  };

  global.crozzoLabRunComfortAudit = function () {
    var c = Core();
    if (!c) return;
    var r = c.runComfortAudit({ source: global.crozzoLabAuditSource() });
    var out = document.getElementById('crozzo-lab-audit-report-out');
    if (out) out.innerHTML = formatComfortReport(r);
    if (typeof showToast === 'function') {
      showToast(r.comfortLabel + ' · ' + r.comfortScore + '/100 confianza', r.verdict === 'ok' ? 'success' : 'warning');
    }
    refreshIcons();
  };

  global.crozzoLabRunDecisionAudits = function () {
    var c = Core();
    if (!c) return;
    var pack = c.runDecisionAudits({ source: global.crozzoLabAuditSource() });
    var out = document.getElementById('crozzo-lab-audit-report-out');
    if (out) out.innerHTML = formatObviousnessReport(pack.obvious) + formatComfortReport(pack.comfort);
    if (typeof showToast === 'function') showToast('Auditoría completa generada', 'info');
    refreshIcons();
  };

  global.crozzoLabClearAudit = function () {
    try {
      localStorage.removeItem('crozzo_lab_audit_v1');
    } catch (_) {}
    if (typeof showToast === 'function') showToast('Auditoría limpiada', 'info');
    crozzoLabSwitchTab('audit');
    crozzoLabRefresh();
  };

  global.crozzoLabOpenChangePin = function () {
    var ov = document.getElementById('crozzo-lab-change-pin-overlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'crozzo-lab-change-pin-overlay';
      ov.className = 'crozzo-lab-pin-overlay';
      ov.innerHTML =
        '<div class="crozzo-lab-pin-modal" role="dialog">' +
        '<button type="button" class="crozzo-lab-pin-close" onclick="crozzoLabCloseChangePin()"><i data-lucide="x"></i></button>' +
        '<h3>Nuevo PIN (4 dígitos)</h3>' +
        '<input type="password" id="crozzo-lab-new-pin" class="form-input crozzo-lab-pin-input" maxlength="4" inputmode="numeric">' +
        '<input type="password" id="crozzo-lab-new-pin2" class="form-input crozzo-lab-pin-input" maxlength="4" inputmode="numeric" placeholder="Confirmar">' +
        '<button type="button" class="btn btn-primary" onclick="crozzoLabSaveNewPin()">Guardar</button>' +
        '<button type="button" class="btn btn-link btn-sm" onclick="crozzoLabChangePin()">Restaurar fábrica 8888</button></div>';
      document.body.appendChild(ov);
    }
    ov.hidden = false;
    bindLabPinInputs(ov);
    refreshIcons();
  };

  global.crozzoLabCloseChangePin = function () {
    var ov = document.getElementById('crozzo-lab-change-pin-overlay');
    if (ov) ov.hidden = true;
  };

  global.crozzoLabSaveNewPin = async function () {
    var c = Core();
    var a = document.getElementById('crozzo-lab-new-pin');
    var b = document.getElementById('crozzo-lab-new-pin2');
    if (!c || !a || !b) return;
    var r = await c.setPin(a.value, b.value);
    if (r.ok) {
      global.crozzoLabCloseChangePin();
      if (typeof showToast === 'function') showToast('PIN actualizado', 'success');
    } else if (typeof showToast === 'function') {
      showToast(r.reason === 'coincidencia' ? 'Los PIN no coinciden' : 'PIN debe ser 4 dígitos', 'warning');
    }
  };

  function crozzoLabInstallShortcuts() {
    if (global.__crozzoLabShortcuts) return;
    global.__crozzoLabShortcuts = true;
    document.addEventListener('keydown', function (e) {
      if (e.ctrlKey && e.shiftKey && (e.key === 'L' || e.key === 'l')) {
        e.preventDefault();
        if (typeof crozzoLabOpenGate === 'function') crozzoLabOpenGate();
      }
    });
  }

  function crozzoLabBindNavClick() {
    var nav = document.getElementById('nav-laboratorio-admin');
    if (!nav || nav.__labBound) return;
    nav.__labBound = true;
    nav.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof crozzoLabOpenGate === 'function') crozzoLabOpenGate();
    });
  }
  global.crozzoLabSwitchTab = function (tab) {
    document.querySelectorAll('.crozzo-lab-tab').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-lab-tab') === tab);
    });
    document.querySelectorAll('.crozzo-lab-panel').forEach(function (p) {
      p.classList.toggle('is-active', p.id === 'crozzo-lab-panel-' + tab);
    });
    refreshIcons();
  };

  global.crozzoLabSubmitPin = async function () {
    var c = Core();
    var inp = document.getElementById('crozzo-lab-pin');
    if (!c || !inp) return;
    try {
      var r = await c.verifyPin(inp.value);
      if (r && r.ok) {
        if (typeof showToast === 'function') showToast('Laboratorio desbloqueado', 'success');
        if (typeof renderPage === 'function' && typeof currentPage !== 'undefined' && currentPage === 'laboratorio-admin') {
          var el = document.getElementById('mainContent');
          if (el) {
            el.innerHTML = renderMain();
            initPage();
          }
        }
      } else if (typeof showToast === 'function') {
        showToast(r && r.reason === 'formato' ? 'Ingrese 4 dígitos' : 'PIN incorrecto — pruebe 8888', 'warning');
      }
    } catch (e) {
      console.warn('[lab] pin', e);
      if (typeof showToast === 'function') showToast('Error al verificar PIN', 'warning');
    }
  };

  global.crozzoLabSetupPin = async function () {
    var c = Core();
    var a = document.getElementById('crozzo-lab-pin-new');
    var b = document.getElementById('crozzo-lab-pin-confirm');
    if (!c || !a || !b) return;
    var r = await c.setPin(a.value, b.value);
    if (r.ok) {
      if (typeof showToast === 'function') showToast('PIN configurado', 'success');
      if (typeof renderPage === 'function' && currentPage === 'laboratorio-admin') {
        document.getElementById('mainContent').innerHTML = renderMain();
        initPage();
      }
    } else if (typeof showToast === 'function') {
      showToast(r.reason === 'coincidencia' ? 'Los PIN no coinciden' : 'PIN debe ser 4 dígitos', 'warning');
    }
  };

  global.crozzoLabLock = function () {
    var c = Core();
    if (c) c.lockSession();
    if (typeof showToast === 'function') showToast('Laboratorio bloqueado', 'info');
    if (typeof navigateTo === 'function') navigateTo('laboratorio-admin');
  };

  global.crozzoLabChangePin = function () {
    var c = Core();
    if (c) {
      c.lockSession();
      var cfg = c.loadConfig();
      cfg.pinHash = '';
      cfg.pinFactory = false;
      c.saveConfig(cfg);
      void c.ensureDefaultLabPin();
    }
    if (typeof showToast === 'function') showToast('PIN restablecido a 8888 · ingrese de nuevo', 'info');
    if (typeof navigateTo === 'function') navigateTo('laboratorio-admin');
  };

  global.crozzoLabRunProjection = function () {
    var c = Core();
    if (!c) return;
    var h = Number(document.getElementById('crozzo-lab-hist-months') && document.getElementById('crozzo-lab-hist-months').value) || 3;
    var p = Number(document.getElementById('crozzo-lab-proj-months') && document.getElementById('crozzo-lab-proj-months').value) || 2;
    var r = c.buildMonthProjection(h, p);
    var out = document.getElementById('crozzo-lab-projection-out');
    if (out && r.projections) {
      out.innerHTML =
        '<h4>Proyecciones</h4><ul class="crozzo-lab-list">' +
        r.projections
          .map(function (m) {
            return '<li><strong>' + m.label + '</strong> · ' + m.month + ' · Total ' + fmt(m.total) + ' · ' + m.days.length + ' días</li>';
          })
          .join('') +
        '</ul>';
    }
    if (typeof showToast === 'function') showToast('Proyección calculada', 'success');
  };

  global.crozzoLabResetSandbox = function () {
    if (!global.CrozzoEmulationHarness || !global.CrozzoEmulationHarness.resetAll) {
      if (typeof showToast === 'function') showToast('Harness no disponible', 'warning');
      return;
    }
    if (!confirm('¿Resetear sandbox de emulación? Borra datos de prueba aislados.')) return;
    void global.CrozzoEmulationHarness.resetAll().then(function () {
      if (typeof showToast === 'function') showToast('Sandbox reseteado', 'success');
      crozzoLabRefresh();
    });
  };

  global.crozzoLabOpenSandbox = function () {
    var c = Core();
    if (!c || !c.runEmulationSandbox) return;
    void c.runEmulationSandbox().then(function (r) {
      if (r.ok && typeof showToast === 'function') showToast('Sandbox de emulación activo (datos aislados)', 'success');
      else if (typeof showToast === 'function') showToast('No se pudo activar sandbox', 'warning');
    });
  };

  function ensureWizardOverlay() {
    var ov = document.getElementById('crozzo-lab-wizard-overlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'crozzo-lab-wizard-overlay';
      ov.className = 'crozzo-lab-pin-overlay';
      ov.hidden = true;
      ov.innerHTML =
        '<div class="crozzo-lab-wizard" role="dialog" aria-modal="true">' +
        '<button type="button" class="crozzo-lab-pin-close" onclick="crozzoLabCloseWizard()" aria-label="Cerrar"><i data-lucide="x"></i></button>' +
        '<div class="crozzo-lab-wizard__progress" id="crozzo-lab-wizard-progress"></div>' +
        '<div id="crozzo-lab-wizard-body" class="crozzo-lab-wizard__body"></div>' +
        '<div class="crozzo-lab-wizard__foot">' +
        '<button type="button" class="btn btn-outline" id="crozzo-lab-wizard-back" onclick="crozzoLabWizardBack()">Atrás</button>' +
        '<button type="button" class="btn btn-primary" id="crozzo-lab-wizard-next" onclick="crozzoLabWizardNext()">Continuar</button>' +
        '</div></div>';
      document.body.appendChild(ov);
    }
    return ov;
  }

  function renderWizardProgress(step, total) {
    var el = document.getElementById('crozzo-lab-wizard-progress');
    if (!el) return;
    var dots = '';
    for (var i = 0; i < total; i++) {
      dots += '<span class="crozzo-lab-wizard__dot' + (i <= step ? ' is-done' : '') + '"></span>';
    }
    el.innerHTML = '<span class="crozzo-lab-wizard__label">Paso ' + (step + 1) + ' de ' + total + '</span><div class="crozzo-lab-wizard__dots">' + dots + '</div>';
  }

  global.crozzoLabOpenWizard = function (state) {
    global.__crozzoLabWizard = state;
    state.step = 0;
    state.total = state.steps.length;
    ensureWizardOverlay().hidden = false;
    global.crozzoLabRenderWizardStep();
    refreshIcons();
  };

  global.crozzoLabRenderWizardStep = function () {
    var st = global.__crozzoLabWizard;
    if (!st) return;
    renderWizardProgress(st.step, st.total);
    var body = document.getElementById('crozzo-lab-wizard-body');
    if (body) body.innerHTML = st.steps[st.step].html;
    var back = document.getElementById('crozzo-lab-wizard-back');
    var next = document.getElementById('crozzo-lab-wizard-next');
    if (back) back.hidden = st.step === 0;
    if (next) next.textContent = st.step === st.total - 1 ? st.finishLabel || 'Confirmar' : 'Continuar';
    bindLabPinInputs(document.getElementById('crozzo-lab-wizard-overlay'));
  };

  global.crozzoLabWizardNext = async function () {
    var st = global.__crozzoLabWizard;
    if (!st) return;
    if (st.validateStep && st.validateStep(st.step) === false) return;
    if (st.step >= st.total - 1) {
      if (st.checks && st.checks.length) {
        var ok = true;
        st.checks.forEach(function (_, i) {
          var cb = document.getElementById('crozzo-lab-wizard-chk-' + i);
          if (cb && !cb.checked) ok = false;
        });
        if (!ok) {
          if (typeof showToast === 'function') showToast('Marque todas las confirmaciones', 'warning');
          return;
        }
      }
      if (st.requirePin) {
        var pinInp = document.getElementById('crozzo-lab-wizard-pin');
        var c = Core();
        if (!c || !pinInp) return;
        try {
          var r = await c.verifyPin(pinInp.value);
          if (!r || !r.ok) {
            if (typeof showToast === 'function') showToast('PIN incorrecto', 'warning');
            return;
          }
        } catch (e) {
          if (typeof showToast === 'function') showToast('Error al verificar PIN', 'warning');
          return;
        }
      }
      global.crozzoLabCloseWizard();
      if (st.onComplete) st.onComplete();
      return;
    }
    st.step += 1;
    global.crozzoLabRenderWizardStep();
  };

  global.crozzoLabWizardBack = function () {
    var st = global.__crozzoLabWizard;
    if (!st || st.step <= 0) return;
    st.step -= 1;
    global.crozzoLabRenderWizardStep();
  };

  global.crozzoLabCloseWizard = function () {
    var ov = document.getElementById('crozzo-lab-wizard-overlay');
    if (ov) ov.hidden = true;
    global.__crozzoLabWizard = null;
  };

  global.crozzoLabRunEmuAnalysis = function () {
    var c = Core();
    if (!c || !c.runFullEmulationAnalysis) return;
    var hEl = document.getElementById('crozzo-lab-hist-months') || document.getElementById('crozzo-lab-emu-hist');
    var pctEl = document.getElementById('crozzo-lab-emu-pct');
    var daysEl = document.getElementById('crozzo-lab-emu-days');
    var months = num(hEl && hEl.value) || 3;
    var pct = num(pctEl && pctEl.value) || 8;
    var days = num(daysEl && daysEl.value) || 30;
    var r = c.runFullEmulationAnalysis({ monthsBack: months, targetPct: pct, daysBack: days });
    var html = formatEmuReportHtml(r);
    if (typeof showToast === 'function') showToast('Análisis de emulación completado', 'success');
    crozzoLabRefresh();
    setTimeout(function () {
      var outEmu = document.getElementById('crozzo-lab-emu-analysis-out');
      if (outEmu) outEmu.innerHTML = html;
      crozzoLabSwitchTab('patrones');
    }, 80);
  };

  global.crozzoLabStartAcceptRecommend = function (id) {
    var c = Core();
    if (!c) return;
    var recs = c.loadRecommendations();
    var rec = null;
    (recs.items || []).forEach(function (r) {
      if (r.id === id && r.status === 'pending') rec = r;
    });
    if (!rec) {
      if (typeof showToast === 'function') showToast('Recomendación no disponible', 'warning');
      return;
    }
    var deep = c.analyzePatternsDeep(c.loadConfig().emulation.historyMonths || 3);
    var checks = [
      'Revisé el patrón del día y las facturas propuestas',
      'Entiendo que el registro fiscal NO se modifica',
      'Acepto que expira si no cierro antes de la noche',
    ];
    global.crozzoLabOpenWizard({
      finishLabel: 'Aceptar y aplicar',
      requirePin: true,
      checks: checks,
      steps: [
        {
          html:
            '<h3 class="crozzo-lab-wizard__title">1 · Patrón del día</h3>' +
            '<p>' +
            esc(rec.message || '') +
            '</p><p class="form-hint">' +
            esc(rec.pattern && rec.pattern.note ? rec.pattern.note : '') +
            '</p>' +
            formatDeepInsights(deep),
        },
        {
          html:
            '<h3 class="crozzo-lab-wizard__title">2 · Facturas e impacto</h3>' +
            '<div class="crozzo-lab-kpi-row">' +
            '<div class="crozzo-lab-kpi"><span>Facturas</span><strong>' +
            rec.picks.length +
            '</strong></div>' +
            '<div class="crozzo-lab-kpi"><span>Recorte</span><strong>−' +
            fmt(rec.reducedPlanned) +
            '</strong></div>' +
            '<div class="crozzo-lab-kpi"><span>Nivel</span><strong>' +
            esc(rec.levelLabel || '') +
            '</strong></div></div>' +
            formatPicksList(rec.picks),
        },
        {
          html:
            '<h3 class="crozzo-lab-wizard__title">3 · Confirmación final</h3>' +
            wizardChecksHtml(checks) +
            '<label class="form-label" for="crozzo-lab-wizard-pin">Confirme con PIN</label>' +
            '<input type="password" id="crozzo-lab-wizard-pin" class="form-input crozzo-lab-pin-input" maxlength="4" inputmode="numeric" placeholder="••••">',
        },
      ],
      onComplete: function () {
        global.crozzoLabAcceptRecommend(id);
      },
    });
  };

  global.crozzoLabStartGenRecommend = function () {
    var c = Core();
    if (!c) return;
    var preview = c.buildRecommendationPreview({});
    if (!preview.picks || !preview.picks.length) {
      if (typeof showToast === 'function') showToast('Sin facturas elegibles hoy', 'warning');
      return;
    }
    var checks = ['Revisé el preview y el patrón del día', 'Entiendo que el personal no verá esta pantalla'];
    global.crozzoLabOpenWizard({
      finishLabel: 'Generar recomendación',
      requirePin: false,
      checks: checks,
      steps: [
        {
          html:
            '<h3 class="crozzo-lab-wizard__title">1 · Patrón</h3>' +
            '<p class="form-hint">' +
            esc(preview.pattern.note || '') +
            '</p>' +
            formatDeepInsights(preview.deep),
        },
        {
          html:
            '<h3 class="crozzo-lab-wizard__title">2 · Preview</h3>' +
            '<div class="crozzo-lab-kpi-row">' +
            '<div class="crozzo-lab-kpi"><span>Recorte</span><strong>−' +
            fmt(preview.reducedPlanned) +
            '</strong></div>' +
            '<div class="crozzo-lab-kpi"><span>Nivel</span><strong>' +
            esc(preview.levelLabel) +
            '</strong></div></div>' +
            formatPicksList(preview.picks),
        },
        {
          html: '<h3 class="crozzo-lab-wizard__title">3 · Confirmar</h3>' + wizardChecksHtml(checks),
        },
      ],
      onComplete: function () {
        global.crozzoLabGenRecommend();
      },
    });
  };

  global.crozzoLabStartApplyMask = function () {
    var c = Core();
    if (!c) return;
    var manual = num(document.getElementById('crozzo-lab-manual-reduce') && document.getElementById('crozzo-lab-manual-reduce').value);
    var level = num(document.getElementById('crozzo-lab-mask-level') && document.getElementById('crozzo-lab-mask-level').value) || 3;
    var enabled = !!(document.getElementById('crozzo-lab-mask-enabled') && document.getElementById('crozzo-lab-mask-enabled').checked);
    var preview = c.previewMaskApply({ manualReduce: manual, level: level });
    if (!preview.picks.length && enabled) {
      if (typeof showToast === 'function') showToast('Sin facturas elegibles para el ajuste', 'warning');
      return;
    }
    var checks = [
      'Revisé las facturas que verá operación vs fiscal',
      'Entiendo que el cierre formal concilia y restaura la vista fiscal',
      'Confirmo que solo afecta tickets elegibles (efectivo POS)',
    ];
    global.crozzoLabOpenWizard({
      finishLabel: 'Aplicar máscara',
      requirePin: true,
      checks: checks,
      steps: [
        {
          html:
            '<h3 class="crozzo-lab-wizard__title">1 · Patrón y nivel</h3>' +
            '<p>Nivel <strong>' +
            esc(preview.levelLabel) +
            '</strong> · reducción objetivo <strong>−' +
            fmt(preview.needReduce) +
            '</strong></p>' +
            formatDeepInsights(preview.pattern),
        },
        {
          html:
            '<h3 class="crozzo-lab-wizard__title">2 · Facturas seleccionadas</h3>' +
            formatTodayGapAlert(preview) +
            '<div class="crozzo-lab-kpi-row">' +
            '<div class="crozzo-lab-kpi"><span>Fiscal hoy</span><strong>' +
            fmt(preview.fiscal) +
            '</strong></div>' +
            '<div class="crozzo-lab-kpi"><span>Recorte</span><strong>−' +
            fmt(preview.reduced) +
            '</strong></div>' +
            '<div class="crozzo-lab-kpi"><span>Facturas</span><strong>' +
            preview.picks.length +
            '</strong></div></div>' +
            formatPicksList(preview.picks),
        },
        {
          html:
            '<h3 class="crozzo-lab-wizard__title">3 · Confirmación</h3>' +
            wizardChecksHtml(checks) +
            '<label class="form-label" for="crozzo-lab-wizard-pin">PIN laboratorio</label>' +
            '<input type="password" id="crozzo-lab-wizard-pin" class="form-input crozzo-lab-pin-input" maxlength="4" inputmode="numeric" placeholder="••••">',
        },
      ],
      onComplete: function () {
        global.crozzoLabApplyMask();
      },
    });
  };

  global.crozzoLabStartSaveCap = function () {
    var enabled = !!(document.getElementById('crozzo-lab-cap-enabled') && document.getElementById('crozzo-lab-cap-enabled').checked);
    var amount = num(document.getElementById('crozzo-lab-cap-amount') && document.getElementById('crozzo-lab-cap-amount').value);
    var alertPct = num(document.getElementById('crozzo-lab-cap-pct') && document.getElementById('crozzo-lab-cap-pct').value) || 90;
    var checks = [
      'El personal de operación NO verá este tope ni alertas',
      'Entiendo que puede activar ajuste automático al superar el tope',
    ];
    global.crozzoLabOpenWizard({
      finishLabel: 'Guardar tope',
      requirePin: enabled && amount > 0,
      checks: checks,
      steps: [
        {
          html:
            '<h3 class="crozzo-lab-wizard__title">1 · Resumen del tope</h3>' +
            '<div class="crozzo-lab-kpi-row">' +
            '<div class="crozzo-lab-kpi"><span>Estado</span><strong>' +
            (enabled ? 'Activo' : 'Inactivo') +
            '</strong></div>' +
            '<div class="crozzo-lab-kpi"><span>Tope diario</span><strong>' +
            fmt(amount) +
            '</strong></div>' +
            '<div class="crozzo-lab-kpi"><span>Alerta admin</span><strong>' +
            alertPct +
            '%</strong></div></div>' +
            '<p class="crozzo-lab-note">Este límite solo es visible en Laboratorio. Operación sigue viendo ventas reales hasta que se aplique máscara.</p>',
        },
        {
          html:
            '<h3 class="crozzo-lab-wizard__title">2 · Confirmar</h3>' +
            wizardChecksHtml(checks) +
            (enabled && amount > 0
              ? '<label class="form-label" for="crozzo-lab-wizard-pin">Confirme con PIN</label><input type="password" id="crozzo-lab-wizard-pin" class="form-input crozzo-lab-pin-input" maxlength="4" inputmode="numeric" placeholder="••••">'
              : ''),
        },
      ],
      onComplete: function () {
        global.crozzoLabSaveCap();
      },
    });
  };

  global.crozzoLabSaveCap = function () {
    var c = Core();
    if (!c) return;
    var cfg = c.loadConfig();
    cfg.hiddenCap.enabled = !!(document.getElementById('crozzo-lab-cap-enabled') && document.getElementById('crozzo-lab-cap-enabled').checked);
    cfg.hiddenCap.amount = Number(document.getElementById('crozzo-lab-cap-amount') && document.getElementById('crozzo-lab-cap-amount').value) || 0;
    cfg.hiddenCap.alertPct = Number(document.getElementById('crozzo-lab-cap-pct') && document.getElementById('crozzo-lab-cap-pct').value) || 90;
    c.saveConfig(cfg);
    c.auditLab('cap_save', fmt(cfg.hiddenCap.amount));
    if (cfg.hiddenCap.enabled && Number(cfg.hiddenCap.amount) > 0) {
      var auto = c.autoApplyCapIfNeeded();
      if (auto && auto.ok && typeof showToast === 'function') {
        showToast('Tope aplicado · ' + auto.picks + ' facturas ajustadas', 'info');
      }
    }
    if (typeof showToast === 'function') showToast('Tope oculto guardado', 'success');
    crozzoLabSwitchTab('tope');
    var el = document.getElementById('mainContent');
    if (el && typeof renderPage === 'function' && currentPage === 'laboratorio-admin') {
      el.innerHTML = renderMain();
      initPage();
      crozzoLabSwitchTab('tope');
    }
  };

  global.crozzoLabApplyMask = function () {
    var c = Core();
    if (!c) return;
    var enabled = !!(document.getElementById('crozzo-lab-mask-enabled') && document.getElementById('crozzo-lab-mask-enabled').checked);
    var pattern = !!(document.getElementById('crozzo-lab-pattern-adj') && document.getElementById('crozzo-lab-pattern-adj').checked);
    var maxEl = Number(document.getElementById('crozzo-lab-max-eligible') && document.getElementById('crozzo-lab-max-eligible').value);
    var manual = Number(document.getElementById('crozzo-lab-manual-reduce') && document.getElementById('crozzo-lab-manual-reduce').value);
    var cfg = c.loadConfig();
    cfg.operMask.maxEligibleAmount = maxEl;
    cfg.operMask.level = Number(document.getElementById('crozzo-lab-mask-level') && document.getElementById('crozzo-lab-mask-level').value) || 3;
    c.saveConfig(cfg);
    var r = c.applyOperMask({ enabled: enabled, patternAdjust: pattern, manualReduce: manual, reason: 'ui_apply', level: cfg.operMask.level });
    if (r.ok && typeof showToast === 'function') {
      showToast('Ajuste aplicado · ' + r.picks + ' facturas · −' + fmt(r.reduced), 'success');
    }
    if (typeof renderPage === 'function' && currentPage === 'laboratorio-admin') {
      document.getElementById('mainContent').innerHTML = renderMain();
      initPage();
      crozzoLabSwitchTab('vista');
    }
  };

  global.crozzoLabClearMask = function () {
    var c = Core();
    if (!c) return;
    c.clearOperMask({ keepConfig: true, reason: 'ui_clear' });
    if (typeof showToast === 'function') showToast('Máscara operativa limpiada', 'info');
    if (typeof renderPage === 'function' && currentPage === 'laboratorio-admin') {
      document.getElementById('mainContent').innerHTML = renderMain();
      initPage();
      crozzoLabSwitchTab('vista');
    }
  };

  /** Modal PIN antes de navegar al laboratorio. */
  global.crozzoLabOpenGate = function () {
    if (!Core() || !Core().isLabRole()) {
      if (typeof showToast === 'function') showToast('Solo administradores', 'warning');
      return;
    }
    if (Core().isSessionUnlocked()) {
      if (typeof navigateTo === 'function') navigateTo('laboratorio-admin');
      return;
    }
    var ov = document.getElementById('crozzo-lab-pin-overlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'crozzo-lab-pin-overlay';
      ov.className = 'crozzo-lab-pin-overlay';
      ov.innerHTML =
        '<div class="crozzo-lab-pin-modal" role="dialog" aria-modal="true">' +
        '<button type="button" class="crozzo-lab-pin-close" onclick="crozzoLabCloseGate()" aria-label="Cerrar"><i data-lucide="x"></i></button>' +
        '<h3>Laboratorio · PIN</h3>' +
        '<p class="form-hint">PIN fábrica: <strong>8888</strong></p>' +
        '<input type="password" id="crozzo-lab-gate-pin" class="form-input crozzo-lab-pin-input" maxlength="4" inputmode="numeric" placeholder="••••">' +
        '<button type="button" class="btn btn-primary" onclick="crozzoLabGateSubmit()">Entrar</button></div>';
      document.body.appendChild(ov);
    }
    ov.hidden = false;
    bindLabPinInputs(ov);
    refreshIcons();
    setTimeout(function () {
      var inp = document.getElementById('crozzo-lab-gate-pin');
      if (inp) inp.focus();
    }, 60);
  };

  global.crozzoLabCloseGate = function () {
    var ov = document.getElementById('crozzo-lab-pin-overlay');
    if (ov) ov.hidden = true;
  };

  global.crozzoLabGateSubmit = async function () {
    var c = Core();
    var inp = document.getElementById('crozzo-lab-gate-pin');
    if (!c || !inp) return;
    try {
      var r = await c.verifyPin(inp.value);
      if (r && r.ok) {
        global.crozzoLabCloseGate();
        if (typeof navigateTo === 'function') navigateTo('laboratorio-admin');
      } else if (typeof showToast === 'function') showToast('PIN incorrecto — pruebe 8888', 'warning');
    } catch (e) {
      console.warn('[lab] gate pin', e);
      if (typeof showToast === 'function') showToast('Error al verificar PIN', 'warning');
    }
  };

  global.crozzoLabSaveRecSettings = function () {
    var c = Core();
    if (!c) return;
    var cfg = c.loadConfig();
    cfg.recommendations = cfg.recommendations || {};
    cfg.recommendations.enabled = !!(document.getElementById('crozzo-lab-rec-enabled') && document.getElementById('crozzo-lab-rec-enabled').checked);
    cfg.recommendations.autoAfterClose = !!(document.getElementById('crozzo-lab-rec-auto') && document.getElementById('crozzo-lab-rec-auto').checked);
    cfg.recommendations.level = Number(document.getElementById('crozzo-lab-rec-level') && document.getElementById('crozzo-lab-rec-level').value) || 2;
    c.saveConfig(cfg);
    if (typeof showToast === 'function') showToast('Ajustes de recomendaciones guardados', 'success');
  };

  global.crozzoLabGenRecommend = function () {
    var c = Core();
    if (!c) return;
    var r = c.manualGenerateRecommendation();
    if (r.ok && typeof showToast === 'function') showToast('Recomendación generada · ' + r.recommendation.picks.length + ' facturas', 'success');
    else if (typeof showToast === 'function') showToast(r.reason === 'sin_elegibles' ? 'Sin facturas elegibles hoy' : 'No se pudo generar', 'warning');
    crozzoLabRefresh();
    crozzoLabSwitchTab('recom');
  };

  global.crozzoLabAcceptRecommend = function (id) {
    var c = Core();
    if (!c) return;
    var r = c.acceptRecommendation(id);
    if (r.ok && typeof showToast === 'function') showToast('Recomendación aplicada · vista operativa actualizada', 'success');
    else if (typeof showToast === 'function') showToast('No se pudo aplicar', 'warning');
    crozzoLabRefresh();
    crozzoLabSyncNavVisibility();
  };

  global.crozzoLabRejectRecommend = function (id) {
    var c = Core();
    if (!c) return;
    c.rejectRecommendation(id);
    if (typeof showToast === 'function') showToast('Recomendación descartada', 'info');
    crozzoLabRefresh();
    crozzoLabSyncNavVisibility();
  };

  global.crozzoLabTestMargin = function () {
    var c = Core();
    if (!c || !c.evaluateMarginTarget) return;
    var simOpts = readSimOpts();
    var level = num(document.getElementById('crozzo-lab-sim-level') && document.getElementById('crozzo-lab-sim-level').value) || 3;
    var ev = c.evaluateMarginTarget(Object.assign({ level: level }, simOpts));
    var out = document.getElementById('crozzo-lab-margin-out');
    if (out) out.innerHTML = (ev.projection ? formatProjectionBanner(ev.projection) : '') + formatMarginAlert(ev, 'periodo analizado');
    if (typeof showToast === 'function') {
      if (ev.feasible) showToast('Margen alcanzable con ' + ev.levelLabel, 'success');
      else showToast('No se logra el 100% · faltan ' + fmt(ev.gap), 'warning');
    }
    refreshIcons();
  };

  global.crozzoLabCompareLevels = function () {
    var c = Core();
    if (!c) return;
    var simOpts = readSimOpts();
    var rows = c.compareLevelSimulations(simOpts);
    var projection = rows.projection || null;
    var out = document.getElementById('crozzo-lab-sim-out');
    if (!out) return;
    var maxPicks = Math.max.apply(
      null,
      rows.map(function (r) {
        return r.sim.totalPicks || 0;
      }).concat([1])
    );
    var maxDetect = Math.max.apply(
      null,
      rows.map(function (r) {
        return r.sim.avgDetectability || 0;
      }).concat([1])
    );
    var fiscalRef = rows[0] && rows[0].sim ? rows[0].sim.fiscalMonth : 0;
    var targetRef = rows[0] && rows[0].sim ? rows[0].sim.targetReduce : 0;
    var metaLabel = simOpts.targetReduce ? fmt(simOpts.targetReduce) + ' fijos' : (simOpts.targetPct || 8) + '% del periodo';
    var anyGap = rows.some(function (r) {
      return r.sim && r.sim.gapPct > 0;
    });
    out.innerHTML =
      (projection ? formatProjectionBanner(projection) : '') +
      (anyGap
        ? '<div class="crozzo-lab-margin-alert crozzo-lab-margin-alert--warn"><strong>Al menos un nivel no cubre el 100% de la meta.</strong> Revise la columna «Sin cubrir» — el sistema intentará acercarse pero no inventa facturas elegibles.</div>'
        : '') +
      '<h4>Comparativa · meta ' +
      metaLabel +
      ' (' +
      simOpts.daysBack +
      ' días)</h4>' +
      '<p class="form-hint crozzo-lab-level-compare-hint">Fiscal analizado: <strong>' +
      fmt(fiscalRef) +
      '</strong> · Meta a ocultar: <strong>−' +
      fmt(targetRef) +
      '</strong>. Si el recorte total coincide, mire cómo llega cada nivel (cantidad de facturas y riesgo de que lo noten).</p>' +
      '<div class="crozzo-lab-sim-table-wrap"><table class="crozzo-lab-sim-table crozzo-lab-sim-table--levels"><thead><tr>' +
      '<th>Nivel / estrategia</th><th>Meta lograda</th><th>Facturas</th><th>Corte prom.</th><th>% ticket</th><th>Fact./día</th><th>Tolerancia</th><th>Detectabilidad</th><th>Sin cubrir</th><th>Cap. máx.</th></tr></thead><tbody>' +
      rows
        .map(function (row) {
          var s = row.sim;
          var cap = row.maxCapacity || {};
          var detClass = s.avgDetectability > 60 ? 'crozzo-lab-sim--hot' : s.avgDetectability > 35 ? 'crozzo-lab-sim--warm' : '';
          var pickBar = Math.max(6, Math.round(((s.totalPicks || 0) / maxPicks) * 100));
          var detBar = Math.max(6, Math.round(((s.avgDetectability || 0) / maxDetect) * 100));
          var covClass = s.coveragePct >= 98 ? '' : s.coveragePct >= 70 ? 'crozzo-lab-sim--warm' : 'crozzo-lab-sim--hot';
          return (
            '<tr class="' +
            detClass +
            '"><td><strong>' +
            esc(row.config.label) +
            '</strong><br><small>' +
            esc(row.config.strategyNote || row.config.tagline) +
            '</small></td><td class="' +
            covClass +
            '"><strong>' +
            s.coveragePct +
            '%</strong><br><small>−' +
            fmt(s.totalReduced) +
            '</small></td><td><strong>' +
            s.totalPicks +
            '</strong><div class="crozzo-lab-mini-bar" style="width:' +
            pickBar +
            '%"></div></td><td>' +
            fmt(s.avgCutPerPick) +
            '</td><td>' +
            (s.avgTicketCutPct || 0) +
            '%</td><td>' +
            (s.avgInvoicesPerDay || 0) +
            '</td><td>' +
            s.avgTolerance +
            '/100</td><td><strong>' +
            s.avgDetectability +
            '/100</strong><div class="crozzo-lab-mini-bar crozzo-lab-mini-bar--risk" style="width:' +
            detBar +
            '%"></div></td><td>' +
            (s.gapPct > 0 ? s.gapPct + '% (−' + fmt(s.totalGap) + ')' : '—') +
            '</td><td><small>−' +
            fmt(cap.totalReduced) +
            '<br>' +
            (cap.maxHidePct || 0) +
            '% mes</small></td></tr>'
          );
        })
        .join('') +
      '</tbody></table></div>' +
      '<p class="form-hint"><strong>Tolerancia</strong> = qué tan invisible es el ajuste · <strong>Detectabilidad</strong> = riesgo de que operación note la diferencia · <strong>Cap. máx.</strong> = cuánto podría ocultar este nivel si empujara al límite.</p>';
    refreshIcons();
  };

  global.crozzoLabSimLevelDetail = function () {
    var c = Core();
    if (!c) return;
    var simOpts = readSimOpts();
    var level = num(document.getElementById('crozzo-lab-sim-level') && document.getElementById('crozzo-lab-sim-level').value) || 3;
    var pack = c.simulateMonthMaskDeclared(Object.assign({ level: level }, simOpts));
    var sim = pack.sim;
    var projection = pack.projection;
    var out = document.getElementById('crozzo-lab-sim-out');
    if (!out) return;
    var dayRows = sim.days
      .filter(function (d) {
        return d.fiscal > 0;
      })
      .map(function (d) {
        var picks =
          d.picks && d.picks.length
            ? '<ul class="crozzo-lab-pick-list">' +
              d.picks
                .map(function (p) {
                  return (
                    '<li>#' +
                    (p.consecutivo || '—') +
                    ' ' +
                    fmt(p.original) +
                    ' → ' +
                    fmt(p.after) +
                    ' (−' +
                    fmt(p.delta) +
                    ', tol ' +
                    p.tolerance +
                    ')</li>'
                  );
                })
                .join('') +
              '</ul>'
            : '<span class="form-hint">Sin recortes</span>';
        return (
          '<tr><td>' +
          d.iso +
          '</td><td>' +
          fmt(d.fiscal) +
          '</td><td>−' +
          fmt(d.reduced) +
          '</td><td>' +
          fmt(d.operative) +
          '</td><td>' +
          d.pickCount +
          '</td><td>' +
          d.avgTolerance +
          '</td><td>' +
          picks +
          '</td></tr>'
        );
      })
      .join('');
    out.innerHTML =
      (projection ? formatProjectionBanner(projection) : '') +
      (sim.totalGap > 0 ? formatMarginAlert(c.evaluateMarginTarget(Object.assign({ level: level }, simOpts)), 'periodo') : '') +
      '<h4>' +
      esc(sim.levelConfig.label) +
      ' · detalle ' +
      simOpts.daysBack +
      ' días · meta −' +
      fmt(sim.targetReduce) +
      '</h4>' +
      '<div class="crozzo-lab-kpi-row">' +
      '<div class="crozzo-lab-kpi"><span>Meta</span><strong>−' +
      fmt(sim.targetReduce) +
      '</strong></div>' +
      '<div class="crozzo-lab-kpi"><span>Logrado</span><strong>−' +
      fmt(sim.totalReduced) +
      '</strong></div>' +
      '<div class="crozzo-lab-kpi"><span>Cobertura</span><strong>' +
      sim.coveragePct +
      '%</strong></div>' +
      '<div class="crozzo-lab-kpi"><span>Tolerancia prom.</span><strong>' +
      sim.avgTolerance +
      '/100</strong></div></div>' +
      '<div class="crozzo-lab-sim-table-wrap"><table class="crozzo-lab-sim-table crozzo-lab-sim-table--detail"><thead><tr>' +
      '<th>Día</th><th>Fiscal</th><th>Recorte</th><th>Operativo</th><th>#Fact.</th><th>Tol.</th><th>Facturas tocadas</th></tr></thead><tbody>' +
      dayRows +
      '</tbody></table></div>';
    refreshIcons();
  };

  global.crozzoLabSyncNavVisibility = function () {
    var el = document.getElementById('nav-laboratorio-admin');
    var li = el && el.closest('li');
    var c = Core();
    var show = c && c.isLabRole();
    if (li) {
      li.hidden = !show;
      if (show) li.removeAttribute('hidden');
    }
    if (el) {
      el.hidden = !show;
      el.style.display = show ? 'flex' : 'none';
      if (c) {
        var capAlert = !!c.hiddenCapStatus().alert;
        var recPending = !!c.getPendingRecommendation();
        el.classList.toggle('crozzo-lab-nav-item--alert', capAlert || recPending);
      }
    }
    crozzoLabBindNavClick();
  };

  crozzoLabInstallShortcuts();

  global.CrozzoLaboratorio = {
    renderPage: renderPage,
    initPage: initPage,
  };
})(typeof window !== 'undefined' ? window : globalThis);
