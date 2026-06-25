/**
 * Crozzo POS — Inventario continuo: métodos operativos, ABC cíclico, ajustes e impresión.
 */
(function (global) {
  'use strict';

  var ABC_THRESH = { A: 0.8, B: 0.95 };
  var CYCLE_DAYS = { A: 7, B: 14, C: 30 };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtMoney(n) {
    if (global.CrozzoReservorio && global.CrozzoReservorio.fmtCop) return global.CrozzoReservorio.fmtCop(n);
    return '$' + Math.round(Number(n) || 0).toLocaleString('es-CO');
  }

  function fmtQty(n) {
    var x = Number(n);
    if (!isFinite(x)) return '—';
    if (Math.abs(x - Math.round(x)) < 0.01) return String(Math.round(x));
    return String(Math.round(x * 100) / 100);
  }

  function classifyAbc(items) {
    items = (items || []).slice().sort(function (a, b) {
      return (Number(b.valor) || 0) - (Number(a.valor) || 0);
    });
    var total = items.reduce(function (s, it) {
      return s + (Number(it.valor) > 0 ? Number(it.valor) : 0);
    }, 0);
    var cum = 0;
    items.forEach(function (it) {
      cum += Number(it.valor) > 0 ? Number(it.valor) : 0;
      var pct = total > 0 ? cum / total : 1;
      it.abcClass = pct <= ABC_THRESH.A ? 'A' : pct <= ABC_THRESH.B ? 'B' : 'C';
    });
    return items;
  }

  function lastCountByMp(histConteos) {
    var map = {};
    (histConteos || []).forEach(function (c) {
      if (!c || c.estado !== 'cerrado') return;
      var fecha = String(c.fecha || c.cerradoAt || c.updatedAt || '').slice(0, 10);
      Object.keys(c.lineas || {}).forEach(function (mpId) {
        var l = c.lineas[mpId];
        if (!l || l.fisico == null || l.fisico === '') return;
        if (!map[mpId] || fecha > map[mpId]) map[mpId] = fecha;
      });
    });
    return map;
  }

  function daysSince(dateStr) {
    if (!dateStr) return 9999;
    var d = new Date(dateStr + 'T12:00:00');
    if (isNaN(d.getTime())) return 9999;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
  }

  function enrichWithCycle(items, histConteos) {
    var last = lastCountByMp(histConteos);
    return classifyAbc(items).map(function (it) {
      var cls = it.abcClass || 'C';
      var since = daysSince(last[it.mpId]);
      var cycle = CYCLE_DAYS[cls] || 30;
      it.lastCountDate = last[it.mpId] || null;
      it.daysSinceCount = since;
      it.cycleDays = cycle;
      it.cycleDue = since >= cycle;
      it.cycleOverdue = since >= cycle + 3;
      return it;
    });
  }

  function computeExtendedStats(snap, histConteos) {
    snap = snap || { items: [], stats: {} };
    var enriched = enrichWithCycle(snap.items || [], histConteos);
    var due = enriched.filter(function (it) {
      return it.cycleDue;
    });
    var abc = { A: 0, B: 0, C: 0 };
    enriched.forEach(function (it) {
      abc[it.abcClass] = (abc[it.abcClass] || 0) + 1;
    });
    var bajo = enriched.filter(function (it) {
      return it.teorico <= 0 && it.movCount > 0;
    });
    return {
      abc: abc,
      cycleDue: due.length,
      cycleOverdue: enriched.filter(function (it) {
        return it.cycleOverdue;
      }).length,
      bajoStock: bajo.length,
      valorTotal: snap.stats ? snap.stats.valorTotal : 0,
    };
  }

  var METHODS = [
    {
      id: 'perpetuo',
      tab: 'stock',
      icon: '📊',
      title: 'Inventario perpetuo',
      desc: 'Teórico en vivo alimentado por recepciones, ventas y procesos.',
    },
    {
      id: 'conteo',
      tab: 'conteo',
      icon: '📋',
      title: 'Conteo físico',
      desc: 'Hoja impresa o digital · diferencias y cierre con ajustes al ledger.',
    },
    {
      id: 'ciclico',
      tab: 'ciclico',
      icon: '🔄',
      title: 'Conteo cíclico ABC',
      desc: 'Prioriza ítems A cada 7 días, B cada 14 y C cada 30.',
    },
    {
      id: 'ajustes',
      tab: 'ajustes',
      icon: '⚡',
      title: 'Ajustes rápidos',
      desc: 'Entrada, salida o merma manual sin conteo completo.',
    },
  ];

  function renderMethodHub(ui, extStats) {
    ui = ui || {};
    extStats = extStats || {};
    var modo = ui.modo || 'perpetuo';
    return (
      '<div class="crozzo-inv-methods" role="tablist" aria-label="Método de inventario">' +
      METHODS.map(function (m) {
        var badge = '';
        if (m.id === 'ciclico' && extStats.cycleDue > 0) {
          badge = '<span class="crozzo-inv-method__badge">' + extStats.cycleDue + ' pend.</span>';
        }
        return (
          '<button type="button" class="crozzo-inv-method' +
          (modo === m.id ? ' is-active' : '') +
          '" data-inv-modo="' +
          m.id +
          '" data-inv-tab-target="' +
          m.tab +
          '">' +
          '<span class="crozzo-inv-method__icon" aria-hidden="true">' +
          m.icon +
          '</span>' +
          '<span class="crozzo-inv-method__body">' +
          '<span class="crozzo-inv-method__title">' +
          esc(m.title) +
          badge +
          '</span>' +
          '<span class="crozzo-inv-method__desc">' +
          esc(m.desc) +
          '</span></span></button>'
        );
      }).join('') +
      '</div>'
    );
  }

  function renderExtendedKpis(extStats) {
    extStats = extStats || {};
    var abc = extStats.abc || {};
    return (
      '<div class="crozzo-inv-kpis crozzo-inv-kpis--extended">' +
      '<div class="crozzo-inv-kpi crozzo-inv-kpi--abc-a"><span class="crozzo-inv-kpi__lbl">Clase A</span><span class="crozzo-inv-kpi__val">' +
      (abc.A || 0) +
      '</span><span class="crozzo-inv-kpi__sub">80% del valor</span></div>' +
      '<div class="crozzo-inv-kpi crozzo-inv-kpi--cycle"><span class="crozzo-inv-kpi__lbl">Ciclo pendiente</span><span class="crozzo-inv-kpi__val">' +
      (extStats.cycleDue || 0) +
      '</span><span class="crozzo-inv-kpi__sub">' +
      (extStats.cycleOverdue ? extStats.cycleOverdue + ' vencidos' : 'ABC al día') +
      '</span></div>' +
      '<div class="crozzo-inv-kpi"><span class="crozzo-inv-kpi__lbl">Alerta stock</span><span class="crozzo-inv-kpi__val">' +
      (extStats.bajoStock || 0) +
      '</span><span class="crozzo-inv-kpi__sub">Teórico ≤ 0 con mov.</span></div>' +
      '<div class="crozzo-inv-kpi"><span class="crozzo-inv-kpi__lbl">Valor en bodega</span><span class="crozzo-inv-kpi__val crozzo-inv-kpi__val--gold">' +
      fmtMoney(extStats.valorTotal) +
      '</span><span class="crozzo-inv-kpi__sub">Teórico × $/u</span></div></div>'
    );
  }

  function renderCiclicoPanel(items, ui, histConteos) {
    ui = ui || {};
    var enriched = enrichWithCycle(items || [], histConteos);
    var filt = ui.ciclicoAbc || 'pendientes';
    var list = enriched.filter(function (it) {
      if (filt === 'all') return true;
      if (filt === 'pendientes') return it.cycleDue;
      return it.abcClass === filt;
    });
    list.sort(function (a, b) {
      if (a.cycleOverdue !== b.cycleOverdue) return a.cycleOverdue ? -1 : 1;
      return (b.daysSinceCount || 0) - (a.daysSinceCount || 0);
    });
    var rows = list.length
      ? list
          .map(function (it) {
            var status = it.cycleOverdue ? 'vencido' : it.cycleDue ? 'pendiente' : 'ok';
            return (
              '<tr data-mp-id="' +
              esc(it.mpId) +
              '" class="crozzo-inv-ciclico-row crozzo-inv-ciclico-row--' +
              status +
              '">' +
              '<td><span class="crozzo-inv-abc crozzo-inv-abc--' +
              it.abcClass +
              '">' +
              it.abcClass +
              '</span></td>' +
              '<td><strong>' +
              esc(it.nombre) +
              '</strong><span class="crozzo-inv-cat">' +
              esc(it.categoria || 'OTRO') +
              '</span></td>' +
              '<td class="num">' +
              fmtQty(it.teorico) +
              ' ' +
              esc(it.undLabel) +
              '</td>' +
              '<td class="num">' +
              fmtMoney(it.valor) +
              '</td>' +
              '<td class="num">' +
              (it.lastCountDate ? esc(it.lastCountDate) : '—') +
              '</td>' +
              '<td class="num">' +
              (it.daysSinceCount < 9999 ? it.daysSinceCount + ' d' : '—') +
              '</td>' +
              '<td><span class="crozzo-inv-ciclico-pill crozzo-inv-ciclico-pill--' +
              status +
              '">' +
              (status === 'vencido' ? 'Vencido' : status === 'pendiente' ? 'Contar hoy' : 'Al día') +
              '</span></td>' +
              '<td><button type="button" class="btn btn-outline btn-sm crozzo-inv-ciclico-count" data-mp-id="' +
              esc(it.mpId) +
              '">Contar</button></td></tr>'
            );
          })
          .join('')
      : '<tr><td colspan="8" style="text-align:center;padding:28px;opacity:.75">Sin ítems en este filtro — ¡ciclo al día!</td></tr>';

    return (
      '<div class="crozzo-inv-ciclico-intro">' +
      '<p><strong>Conteo cíclico ABC</strong> — no cierre la bodega: rote el conteo por criticidad. Clase <span class="crozzo-inv-abc crozzo-inv-abc--A">A</span> cada 7 días, <span class="crozzo-inv-abc crozzo-inv-abc--B">B</span> cada 14, <span class="crozzo-inv-abc crozzo-inv-abc--C">C</span> cada 30.</p></div>' +
      '<div class="crozzo-inv-toolbar">' +
      '<select class="form-input" id="crozzoInvCiclicoAbc" style="max-width:200px">' +
      '<option value="pendientes"' +
      (filt === 'pendientes' ? ' selected' : '') +
      '>Pendientes de ciclo</option>' +
      '<option value="A"' +
      (filt === 'A' ? ' selected' : '') +
      '>Solo clase A</option>' +
      '<option value="B"' +
      (filt === 'B' ? ' selected' : '') +
      '>Solo clase B</option>' +
      '<option value="C"' +
      (filt === 'C' ? ' selected' : '') +
      '>Solo clase C</option>' +
      '<option value="all"' +
      (filt === 'all' ? ' selected' : '') +
      '>Todos</option></select>' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoInvPrintCiclico">🖨 Imprimir lista cíclica</button>' +
      '<button type="button" class="btn btn-primary btn-sm" id="crozzoInvStartCiclicoConteo">Iniciar conteo filtrado</button></div>' +
      '<div class="crozzo-inv-table-shell"><div class="crozzo-inv-scroll"><table class="crozzo-inv-table"><thead><tr>' +
      '<th>ABC</th><th>Materia prima</th><th class="num">Teórico</th><th class="num">Valor</th><th class="num">Últ. conteo</th><th class="num">Días</th><th>Estado</th><th></th>' +
      '</tr></thead><tbody id="crozzoInvCiclicoTbody">' +
      rows +
      '</tbody></table></div></div>'
    );
  }

  function renderAjustesPanel(items, bodegas) {
    var mpOpts =
      '<option value="">— Materia prima —</option>' +
      (items || [])
        .map(function (it) {
          return (
            '<option value="' +
            esc(it.mpId) +
            '" data-nombre="' +
            esc(it.nombre) +
            '" data-und="' +
            esc(it.und) +
            '" data-precio="' +
            esc(String(it.precioUnit || 0)) +
            '">' +
            esc(it.nombre) +
            ' · ' +
            fmtQty(it.teorico) +
            ' ' +
            esc(it.undLabel) +
            '</option>'
          );
        })
        .join('');
    var bodOpts =
      '<option value="">Bodega principal</option>' +
      (bodegas || [])
        .map(function (b) {
          return '<option value="' + esc(b.id) + '">' + esc(b.nombre) + '</option>';
        })
        .join('');
    return (
      '<div class="crozzo-inv-ajustes-grid">' +
      '<section class="crozzo-inv-ajustes-form card">' +
      '<h3 class="crozzo-inv-ajustes-title">Registrar movimiento manual</h3>' +
      '<p class="form-hint">Entrada, salida o merma queda en el libro de movimientos y recalcula el teórico.</p>' +
      '<form id="crozzoInvAjusteForm" class="crozzo-inv-ajustes-fields">' +
      '<div class="form-group"><label class="form-label">Materia prima</label><select class="form-input" id="crozzoInvAjusteMp" required>' +
      mpOpts +
      '</select></div>' +
      '<div class="form-group"><label class="form-label">Tipo</label><select class="form-input" id="crozzoInvAjusteTipo">' +
      '<option value="ajuste_entrada">Entrada / ajuste positivo</option>' +
      '<option value="ajuste_salida">Salida / consumo interno</option>' +
      '<option value="merma">Merma / pérdida</option>' +
      '<option value="inventario_inicial">Inventario inicial</option></select></div>' +
      '<div class="form-group"><label class="form-label">Cantidad</label><input type="number" class="form-input" id="crozzoInvAjusteCant" min="0" step="any" required placeholder="0"></div>' +
      '<div class="form-group"><label class="form-label">Bodega</label><select class="form-input" id="crozzoInvAjusteBodega">' +
      bodOpts +
      '</select></div>' +
      '<div class="form-group"><label class="form-label">Notas</label><input type="text" class="form-input" id="crozzoInvAjusteNotas" maxlength="200" placeholder="Motivo del ajuste"></div>' +
      '<button type="submit" class="btn btn-primary">Registrar movimiento</button></form></section>' +
      '<section class="crozzo-inv-ajustes-help card">' +
      '<h3 class="crozzo-inv-ajustes-title">Cuándo usar cada método</h3>' +
      '<ul class="crozzo-inv-ajustes-list">' +
      '<li><strong>Perpetuo</strong> — monitoreo diario; el sistema calcula teórico solo.</li>' +
      '<li><strong>Conteo físico</strong> — inventario general o parcial con hoja impresa.</li>' +
      '<li><strong>Cíclico ABC</strong> — rotación inteligente sin parar operación.</li>' +
      '<li><strong>Ajustes</strong> — corrección puntual (merma, donación, error de pesaje).</li></ul>' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoInvGoPrintHub">⚙ Configurar impresoras inventario</button></section></div>'
    );
  }

  function getCiclicoItemsForPrint(items, ui, histConteos) {
    ui = ui || {};
    var enriched = enrichWithCycle(items || [], histConteos);
    var filt = ui.ciclicoAbc || 'pendientes';
    return enriched.filter(function (it) {
      if (filt === 'all') return true;
      if (filt === 'pendientes') return it.cycleDue;
      return it.abcClass === filt;
    });
  }

  function submitAjuste(form, toastFn) {
    toastFn = toastFn || function () {};
    var mpSel = form.querySelector('#crozzoInvAjusteMp');
    var tipoSel = form.querySelector('#crozzoInvAjusteTipo');
    var cantInp = form.querySelector('#crozzoInvAjusteCant');
    var bodSel = form.querySelector('#crozzoInvAjusteBodega');
    var notasInp = form.querySelector('#crozzoInvAjusteNotas');
    if (!mpSel || !mpSel.value) {
      toastFn('Seleccione una materia prima', 'warning');
      return false;
    }
    var cant = Number(cantInp && cantInp.value);
    if (!isFinite(cant) || cant <= 0) {
      toastFn('Indique cantidad válida', 'warning');
      return false;
    }
    var opt = mpSel.options[mpSel.selectedIndex];
    var rv = global.CrozzoReservorio;
    if (!rv || !rv.addInventarioMovimiento) {
      toastFn('Reservorio no disponible', 'error');
      return false;
    }
    rv.addInventarioMovimiento({
      tipo: tipoSel ? tipoSel.value : 'ajuste_entrada',
      productoRefId: mpSel.value,
      productoRefTipo: 'materia_prima',
      productoNombre: opt ? opt.getAttribute('data-nombre') || opt.text : mpSel.value,
      cantidad: cant,
      unidad: opt ? opt.getAttribute('data-und') || 'g' : 'g',
      costoUnitario: Number(opt ? opt.getAttribute('data-precio') : 0) || 0,
      notas: notasInp ? notasInp.value.trim() : '',
      bodegaId: bodSel ? bodSel.value : '',
      fecha: new Date().toISOString().slice(0, 10),
    });
    try {
      document.dispatchEvent(
        new CustomEvent('crozzo-costos:inventario-ajuste', {
          detail: { mpId: mpSel.value, cantidad: cant },
          bubbles: true,
        })
      );
    } catch (_) {}
    toastFn('Movimiento registrado · teórico actualizado', 'success');
    if (cantInp) cantInp.value = '';
    if (notasInp) notasInp.value = '';
    return true;
  }

  function initExtras(root, ctx) {
    ctx = ctx || {};
    if (!root) return;
    var ui = ctx.ui || {};
    var refresh = ctx.refresh || function () {};

    root.querySelectorAll('[data-inv-modo]').forEach(function (btn) {
      if (btn._invModoBound) return;
      btn._invModoBound = true;
      btn.addEventListener('click', function () {
        var modo = btn.getAttribute('data-inv-modo') || 'perpetuo';
        var tab = btn.getAttribute('data-inv-tab-target') || 'stock';
        ui.modo = modo;
        ui.tab = tab;
        if (ctx.hub && ctx.hub.inventarioUi) {
          ctx.hub.inventarioUi.modo = modo;
          ctx.hub.inventarioUi.tab = tab;
        }
        refresh();
      });
    });

    var ciego = root.querySelector('#crozzoInvConteoCiego');
    if (ciego && !ciego._bound) {
      ciego._bound = true;
      ciego.checked = !!ui.conteoCiego;
      ciego.addEventListener('change', function () {
        ui.conteoCiego = ciego.checked;
        if (ctx.hub && ctx.hub.inventarioUi) ctx.hub.inventarioUi.conteoCiego = ciego.checked;
        refresh();
      });
    }

    var cicAbc = root.querySelector('#crozzoInvCiclicoAbc');
    if (cicAbc && !cicAbc._bound) {
      cicAbc._bound = true;
      cicAbc.addEventListener('change', function () {
        ui.ciclicoAbc = cicAbc.value;
        if (ctx.hub && ctx.hub.inventarioUi) ctx.hub.inventarioUi.ciclicoAbc = cicAbc.value;
        refresh();
      });
    }

    var prCic = root.querySelector('#crozzoInvPrintCiclico');
    if (prCic && !prCic._bound) {
      prCic._bound = true;
      prCic.addEventListener('click', function () {
        if (typeof ctx.printCiclico === 'function') ctx.printCiclico();
      });
    }

    var startCic = root.querySelector('#crozzoInvStartCiclicoConteo');
    if (startCic && !startCic._bound) {
      startCic._bound = true;
      startCic.addEventListener('click', function () {
        ui.modo = 'conteo';
        ui.tab = 'conteo';
        if (ctx.hub && ctx.hub.inventarioUi) {
          ctx.hub.inventarioUi.modo = 'conteo';
          ctx.hub.inventarioUi.tab = 'conteo';
        }
        refresh();
      });
    }

    root.querySelectorAll('.crozzo-inv-ciclico-count').forEach(function (btn) {
      if (btn._bound) return;
      btn._bound = true;
      btn.addEventListener('click', function () {
        var mpId = btn.getAttribute('data-mp-id');
        ui.modo = 'conteo';
        ui.tab = 'conteo';
        ui.q = '';
        if (ctx.hub && ctx.hub.inventarioUi) {
          ctx.hub.inventarioUi.modo = 'conteo';
          ctx.hub.inventarioUi.tab = 'conteo';
          ctx.hub.inventarioUi.q = mpId || '';
        }
        refresh();
      });
    });

    var form = root.querySelector('#crozzoInvAjusteForm');
    if (form && !form._bound) {
      form._bound = true;
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (submitAjuste(form, ctx.toast)) refresh();
      });
    }

    var goPrint = root.querySelector('#crozzoInvGoPrintHub');
    if (goPrint && !goPrint._bound) {
      goPrint._bound = true;
      goPrint.addEventListener('click', function () {
        global.__crozzoFacturasAdminTab = 'inventario';
        if (typeof global.navigateTo === 'function') global.navigateTo('config-facturas-admin');
        else if (typeof global.renderPage === 'function') global.renderPage('config-facturas-admin');
      });
    }
  }

  global.CrozzoInventarioContinuo = {
    METHODS: METHODS,
    classifyAbc: classifyAbc,
    enrichWithCycle: enrichWithCycle,
    computeExtendedStats: computeExtendedStats,
    getCiclicoItemsForPrint: getCiclicoItemsForPrint,
    renderMethodHub: renderMethodHub,
    renderExtendedKpis: renderExtendedKpis,
    renderCiclicoPanel: renderCiclicoPanel,
    renderAjustesPanel: renderAjustesPanel,
    initExtras: initExtras,
    submitAjuste: submitAjuste,
  };
})(typeof window !== 'undefined' ? window : globalThis);
