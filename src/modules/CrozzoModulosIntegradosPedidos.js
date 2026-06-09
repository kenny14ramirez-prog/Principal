/**
 * Pedidos internos — mismo shell visual que Reportes / Inventarios (card + crozzo-rep-tabs).
 */
(function (global) {
  'use strict';

  var api = function () { return global.CrozzoIntApi; };
  var eng = function () { return global.CrozzoPedidosInternosEngine; };

  var ped = { tab: '', historial: [], panels: [], adminEdit: false, traceMp: null };

  function esc(s) {
    if (api() && api().esc) return api().esc(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function toast(m, t) {
    if (api() && api().toast) api().toast(m, t);
    else if (typeof showToast === 'function') showToast(m, t);
  }

  function mkId(tab, item) {
    return (tab + '_' + item).replace(/[\s()\/,\.½]/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
  }

  function refreshPanels() {
    if (!eng()) {
      ped.panels = [];
      return;
    }
    ped.panels = eng().buildAreaPanels();
    if (!ped.tab && ped.panels.length) ped.tab = ped.panels[0].id;
    if (ped.tab && !ped.panels.some(function (p) { return p.id === ped.tab; })) {
      ped.tab = ped.panels[0] ? ped.panels[0].id : '';
    }
  }

  function tabLabel(tabId) {
    return eng() ? eng().areaLabel(tabId) : tabId;
  }

  function areaOptionsHtml(selected) {
    return (ped.panels || [])
      .map(function (a) {
        return (
          '<option value="' + esc(a.id) + '"' + (a.id === selected ? ' selected' : '') + '>' + esc(a.label) + '</option>'
        );
      })
      .join('');
  }

  function sourceBadge(src) {
    if (src === 'receta') return '<span class="badge badge-success" style="font-size:10px">Receta</span>';
    if (src === 'manual') return '<span class="badge badge-warning" style="font-size:10px">Manual</span>';
    if (src === 'catalogo') return '<span class="badge" style="font-size:10px">Catálogo</span>';
    return '<span class="badge" style="font-size:10px">Categoría</span>';
  }

  function renderTraceHint(item) {
    if (!eng() || item.areaSource !== 'receta') return '';
    var tr = eng().getMpTrace(item.mpId);
    if (!tr || !tr.platos.length) return '';
    var names = tr.platos
      .slice(0, 2)
      .map(function (p) {
        return esc(p.producto);
      })
      .join(', ');
    var more = tr.platos.length > 2 ? '…' : '';
    return (
      '<button type="button" class="btn btn-link" style="padding:0;font-size:11px;display:block;margin-top:2px" data-pi-trace="' +
      esc(item.mpId) +
      '">Usado en: ' +
      names +
      more +
      '</button>'
    );
  }

  function renderTracePanel() {
    if (!ped.traceMp || !eng()) return '';
    var tr = eng().getMpTrace(ped.traceMp);
    if (!tr) return '';
    var platos = tr.platos.length
      ? '<ul style="margin:8px 0 0;padding-left:18px;font-size:12px">' +
        tr.platos
          .map(function (p) {
            return (
              '<li><strong>' +
              esc(p.producto) +
              '</strong>' +
              (p.pantalla ? ' · ' + esc(p.pantalla) : '') +
              '</li>'
            );
          })
          .join('') +
        '</ul>'
      : '<p class="form-hint" style="margin:8px 0 0">Sin platos en menú costos.</p>';
    return (
      '<div class="alert alert-info" style="margin-bottom:14px">' +
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">' +
      '<div><strong>' +
      esc(tr.nombre) +
      '</strong> → ' +
      esc(tr.areaLabel) +
      platos +
      '</div>' +
      '<button type="button" class="btn btn-outline btn-sm" data-pi-trace-close>✕</button></div></div>'
    );
  }

  function renderPanel(tab) {
    var panel = ped.panels.find(function (p) { return p.id === tab; }) || { sections: [], label: tab };
    var admin = ped.adminEdit && eng() && eng().isAdminEditor();
    var html = renderTracePanel();

    if (!panel.sections.length) {
      html += '<p class="form-hint">No hay insumos en esta área. Revise catálogo MP o recalcule desde recetas.</p>';
    }

    panel.sections.forEach(function (sec) {
      html +=
        '<h3 style="font-size:0.92rem;margin:16px 0 8px">' +
        esc(sec.sec) +
        '</h3>' +
        '<div class="crozzo-rep-table-wrap"><table><thead><tr>' +
        '<th>Insumo</th>' +
        (admin ? '<th>Área</th><th>Ocultar</th>' : '') +
        '<th style="width:100px;text-align:right">Cant.</th></tr></thead><tbody>';

      sec.items.forEach(function (item) {
        var id = mkId(tab, item.mpId || item.nombre);
        html += '<tr data-pi-mp="' + esc(item.mpId) + '"><td>' + esc(item.nombre) + ' ' + sourceBadge(item.areaSource) + renderTraceHint(item) + '</td>';
        if (admin) {
          html +=
            '<td><select class="form-input pi-adm-area" data-mp="' +
            esc(item.mpId) +
            '">' +
            areaOptionsHtml(item.areaId) +
            '</select></td>' +
            '<td style="text-align:center"><input type="checkbox" class="pi-adm-hide" data-mp="' +
            esc(item.mpId) +
            '" /></td>';
        }
        html +=
          '<td><input class="form-input" type="text" id="pi_' +
          id +
          '" placeholder="0" inputmode="decimal" style="text-align:right" /></td></tr>';
      });
      html += '</tbody></table></div>';
    });

    var exMax = admin ? 3 : 5;
    if (exMax > 0) {
      html += '<h3 style="font-size:0.92rem;margin:16px 0 8px">Adicionales</h3><div class="crozzo-rep-table-wrap"><table><tbody>';
      for (var i = 1; i <= exMax; i++) {
        html +=
          '<tr><td><input class="form-input" type="text" id="pi_' +
          tab +
          '_ex' +
          i +
          'n" placeholder="Producto adicional ' +
          i +
          '" /></td><td style="width:100px"><input class="form-input" type="text" id="pi_' +
          tab +
          '_ex' +
          i +
          'q" placeholder="Cant." inputmode="decimal" /></td></tr>';
      }
      html += '</tbody></table></div>';
    }
    return html;
  }

  function collectItems(tab) {
    var panel = ped.panels.find(function (p) { return p.id === tab; }) || { sections: [] };
    var items = [];
    panel.sections.forEach(function (sec) {
      sec.items.forEach(function (item) {
        var el = document.getElementById('pi_' + mkId(tab, item.mpId || item.nombre));
        var qty = el ? String(el.value || '').trim() : '';
        if (qty) items.push({ seccion: sec.sec, producto: item.nombre, cantidad: qty, mpId: item.mpId || null });
      });
    });
    var exMax = ped.adminEdit ? 3 : 5;
    for (var i = 1; i <= exMax; i++) {
      var nom = document.getElementById('pi_' + tab + '_ex' + i + 'n');
      var qtyEl = document.getElementById('pi_' + tab + '_ex' + i + 'q');
      var n = nom ? String(nom.value || '').trim() : '';
      var q = qtyEl ? String(qtyEl.value || '').trim() : '';
      if (n && q) items.push({ seccion: 'Adicionales', producto: n, cantidad: q });
    }
    return items;
  }

  function buildPedidoDraft() {
    return {
      responsable: String((document.getElementById('pi-resp') || {}).value || '').trim(),
      fecha_pedido: (document.getElementById('pi-fecha') || {}).value || (api() ? api().tkey() : ''),
      area: ped.tab,
      area_label: tabLabel(ped.tab),
      items: collectItems(ped.tab),
      observaciones: String((document.getElementById('pi-obs') || {}).value || '').trim(),
    };
  }

  function printPedidoDraft() {
    var draft = buildPedidoDraft();
    if (!draft.items.length) return toast('Indique cantidades', 'warning');
    if (!draft.responsable) return toast('Indique responsable', 'warning');
    if (eng() && eng().printPedido) void eng().printPedido(draft);
  }

  function printHistorialRow(idx) {
    var row = ped.historial[idx];
    if (row && eng() && eng().printPedido) void eng().printPedido(row);
  }

  async function sendPedido() {
    var draft = buildPedidoDraft();
    if (!draft.responsable) return toast('Indique quién diligencia', 'warning');
    if (!draft.items.length) return toast('Indique cantidades', 'warning');

    var btn = document.getElementById('pi-send');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Enviando…';
    }

    var body = Object.assign({ business_id: api() ? api().businessId() : '', telegram_ok: false }, draft);

    if (api() && api().cloudReady()) {
      var r = await api().rest('crozzo_pedidos_internos', '', { method: 'POST', body: body, prefer: 'return=representation' });
      if (r.ok) body.telegram_ok = true;
    }

    try {
      var local = JSON.parse(localStorage.getItem('crozzo_int_pedidos_local') || '[]');
      local.unshift(Object.assign({ id: Date.now(), created_at: new Date().toISOString() }, body));
      localStorage.setItem('crozzo_int_pedidos_local', JSON.stringify(local.slice(0, 200)));
    } catch (_) {}

    if (api()) {
      await api().loadIntegracionConfig();
      var tg = (api().state.intConfig || {}).telegram || {};
      if (tg.botToken && tg.chatId) {
        try {
          var lines = ['📋 PEDIDO ' + tabLabel(ped.tab).toUpperCase(), draft.responsable, ''];
          var cur = '';
          draft.items.forEach(function (it) {
            if (it.seccion !== cur) {
              lines.push(it.seccion);
              cur = it.seccion;
            }
            lines.push('• ' + it.producto + ': ' + it.cantidad);
          });
          await fetch('https://api.telegram.org/bot' + tg.botToken + '/sendMessage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: tg.chatId, text: lines.join('\n') }),
          });
        } catch (_) {}
      }
    }

    if (eng() && eng().printPedido) void eng().printPedido(body);
    toast('Pedido registrado', 'success');

    if (document.getElementById('pi-obs')) document.getElementById('pi-obs').value = '';
    document.querySelectorAll('#pi-panel input[type="text"]').forEach(function (inp) {
      if (inp.id && inp.id.indexOf('pi_') === 0) inp.value = '';
    });

    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Enviar pedido';
    }
    await loadHistorial();
  }

  async function loadHistorial() {
    var rows = [];
    if (api() && api().cloudReady()) {
      var q = api().bidFilter();
      q = (q ? q + '&' : '') + 'order=created_at.desc&limit=40&select=id,responsable,fecha_pedido,area,area_label,items,observaciones,created_at';
      var r = await api().rest('crozzo_pedidos_internos', q);
      if (r.ok && Array.isArray(r.data)) rows = r.data;
    }
    try {
      var local = JSON.parse(localStorage.getItem('crozzo_int_pedidos_local') || '[]');
      local.forEach(function (l) {
        if (!rows.some(function (x) { return String(x.id) === String(l.id); })) rows.push(l);
      });
    } catch (_) {}
    rows.sort(function (a, b) {
      return new Date(b.created_at || b.fecha_pedido || 0) - new Date(a.created_at || a.fecha_pedido || 0);
    });
    ped.historial = rows.slice(0, 40);
    renderHistorial();
  }

  function renderHistorial() {
    var host = document.getElementById('pi-historial');
    if (!host) return;
    if (!ped.historial.length) {
      host.innerHTML = '<p class="form-hint" style="margin:0">Sin pedidos recientes.</p>';
      return;
    }
    host.innerHTML =
      '<div class="crozzo-rep-table-wrap"><table><thead><tr><th>Fecha</th><th>Área</th><th>Responsable</th><th>Ítems</th><th></th></tr></thead><tbody>' +
      ped.historial
        .map(function (p, idx) {
          return (
            '<tr><td>' +
            esc(p.fecha_pedido || (p.created_at || '').slice(0, 10)) +
            '</td><td>' +
            esc(p.area_label || tabLabel(p.area)) +
            '</td><td>' +
            esc(p.responsable) +
            '</td><td>' +
            (Array.isArray(p.items) ? p.items.length : 0) +
            '</td><td><button type="button" class="btn btn-outline btn-sm" data-pi-print-idx="' +
            idx +
            '">Imprimir</button></td></tr>'
          );
        })
        .join('') +
      '</tbody></table></div>';
  }

  function saveAdminOverrides() {
    if (!eng()) return;
    document.querySelectorAll('.pi-adm-area').forEach(function (sel) {
      var mpId = sel.getAttribute('data-mp');
      if (mpId && sel.value) eng().setOverride(mpId, { areaId: sel.value, source: 'manual' });
    });
    document.querySelectorAll('.pi-adm-hide').forEach(function (cb) {
      var mpId = cb.getAttribute('data-mp');
      if (mpId) eng().setOverride(mpId, { hidden: !!cb.checked });
    });
    refreshPanels();
    rerenderPanel();
    toast('Cambios guardados', 'success');
  }

  function rerenderPanel() {
    var p = document.getElementById('pi-panel');
    if (p) p.innerHTML = renderPanel(ped.tab);
  }

  function onRootClick(ev) {
    var tabBtn = ev.target.closest('[data-pi-tab]');
    if (tabBtn) {
      ped.tab = tabBtn.getAttribute('data-pi-tab');
      ped.traceMp = null;
      document.querySelectorAll('[data-pi-tab]').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-pi-tab') === ped.tab);
      });
      rerenderPanel();
      return;
    }
    if (ev.target.closest('[data-pi-trace]')) {
      ped.traceMp = ev.target.closest('[data-pi-trace]').getAttribute('data-pi-trace');
      rerenderPanel();
      return;
    }
    if (ev.target.closest('[data-pi-trace-close]')) {
      ped.traceMp = null;
      rerenderPanel();
      return;
    }
    if (ev.target.closest('#pi-print-draft')) {
      printPedidoDraft();
      return;
    }
    if (ev.target.closest('#pi-send')) {
      void sendPedido();
      return;
    }
    var printIdx = ev.target.closest('[data-pi-print-idx]');
    if (printIdx) printHistorialRow(parseInt(printIdx.getAttribute('data-pi-print-idx'), 10));
    if (ev.target.closest('#pi-admin-toggle')) {
      ped.adminEdit = !ped.adminEdit;
      var adm = document.getElementById('pi-admin-toggle');
      if (adm) adm.textContent = ped.adminEdit ? 'Salir edición' : 'Editar asignación';
      var saveBtn = document.getElementById('pi-save-config');
      if (saveBtn) saveBtn.style.display = ped.adminEdit ? '' : 'none';
      rerenderPanel();
      return;
    }
    if (ev.target.closest('#pi-recalc-recetas') && eng()) {
      var n = eng().recalcAllFromRecipes();
      refreshPanels();
      rerenderPanel();
      toast('Recalculado (' + n + ')', 'success');
      return;
    }
    if (ev.target.closest('#pi-save-config')) saveAdminOverrides();
  }

  function bindRoot() {
    var root = document.getElementById('crozzo-pi-root');
    if (!root || root._piBound) return;
    root._piBound = true;
    root.addEventListener('click', onRootClick);
  }

  function ensureCatalogReady(cb) {
    if (global.CrozzoReservorio && global.CrozzoReservorio.migrateLegacy) global.CrozzoReservorio.migrateLegacy();
    var chain = Promise.resolve();
    if (global.CrozzoCatalogoMp && global.CrozzoCatalogoMp.ensureReady) {
      chain = chain.then(function () {
        return new Promise(function (resolve) {
          global.CrozzoCatalogoMp.ensureReady(resolve);
        });
      });
    }
    chain.then(function () {
      refreshPanels();
      if (cb) cb();
    });
  }

  function renderPage() {
    refreshPanels();
    var tabs = ped.panels
      .map(function (t) {
        return (
          '<button type="button" class="crozzo-rep-tab' +
          (ped.tab === t.id ? ' active' : '') +
          '" data-pi-tab="' +
          esc(t.id) +
          '">' +
          esc(t.label) +
          '</button>'
        );
      })
      .join('');

    var adminBar = '';
    if (eng() && eng().isAdminEditor()) {
      adminBar =
        '<div class="crozzo-rep-actions" style="margin-bottom:12px">' +
        '<button type="button" class="btn btn-outline btn-sm" id="pi-admin-toggle">Editar asignación</button>' +
        '<button type="button" class="btn btn-outline btn-sm" id="pi-recalc-recetas">↻ Desde recetas</button>' +
        '<button type="button" class="btn btn-primary btn-sm" id="pi-save-config" style="display:none">Guardar</button>' +
        '</div>';
    }

    var fecha = api() ? api().tkey() : new Date().toISOString().slice(0, 10);

    return (
      '<div class="card crozzo-rep-root" id="crozzo-pi-root" data-crozzo-pedidos-root>' +
      adminBar +
      '<div class="form-grid" style="margin-bottom:14px">' +
      '<div class="form-group"><label class="form-label">Responsable</label><input id="pi-resp" class="form-input" type="text" autocomplete="name" placeholder="Nombre" /></div>' +
      '<div class="form-group"><label class="form-label">Fecha</label><input id="pi-fecha" class="form-input" type="date" value="' +
      esc(fecha) +
      '" /></div></div>' +
      (tabs ? '<div class="crozzo-rep-tabs" role="tablist">' + tabs + '</div>' : '<p class="form-hint">Configure áreas en Config. comandas.</p>') +
      '<div id="pi-panel" class="crozzo-rep-panel">' +
      renderPanel(ped.tab) +
      '</div>' +
      '<div class="form-group" style="margin-top:14px"><label class="form-label">Observaciones</label>' +
      '<textarea id="pi-obs" class="form-input" rows="2"></textarea></div>' +
      '<div class="crozzo-rep-actions" style="margin-top:14px">' +
      '<button type="button" class="btn btn-primary" id="pi-send">Enviar pedido</button>' +
      '<button type="button" class="btn btn-outline" id="pi-print-draft">Imprimir</button>' +
      '</div></div>' +
      '<div class="card" style="margin-top:16px">' +
      '<div class="card-header"><h2 class="card-title" style="margin:0;font-size:1rem">Historial</h2></div>' +
      '<div id="pi-historial" style="padding:0 16px 16px"><p class="form-hint">Cargando…</p></div></div>'
    );
  }

  global.CrozzoModulosIntegradosPedidos = {
    render: function () {
      return renderPage();
    },
    init: async function () {
      if (api() && api().loadIntegracionConfig) await api().loadIntegracionConfig();
      ensureCatalogReady(function () {
        bindRoot();
      });
      await loadHistorial();
      var u = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
      if (u && u.nombre) {
        var r = document.getElementById('pi-resp');
        if (r && !r.value) r.value = u.nombre;
      }
    },
  };

  global.renderPedidosInternos = function () {
    return global.CrozzoModulosIntegradosPedidos.render();
  };
  global.initPedidosInternos = function () {
    return global.CrozzoModulosIntegradosPedidos.init();
  };
})(typeof window !== 'undefined' ? window : globalThis);
