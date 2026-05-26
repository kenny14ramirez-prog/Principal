/**
 * Pedidos internos — áreas desde comandas, ítems desde catálogo MP (inteligente).
 */
(function (global) {
  'use strict';

  var api = function () { return global.CrozzoIntApi; };
  var eng = function () { return global.CrozzoPedidosInternosEngine; };

  var THEMES = [
    { id: 'deepspace', label: 'Deep Space' },
    { id: 'cyan', label: 'Cyan Tech' },
    { id: 'coral', label: 'Coral Energy' },
    { id: 'magenta', label: 'Magenta Vibrant' },
    { id: 'emerald', label: 'Emerald Fresh' },
    { id: 'minimalist', label: 'Minimalist Elegant' },
  ];

  var ped = { tab: '', theme: 'deepspace', historial: [], panels: [], adminEdit: false };

  function esc(s) {
    return api() ? api().esc(s) : String(s == null ? '' : s);
  }

  function toast(m, t) {
    if (api()) api().toast(m, t);
  }

  function injectPedidosStyles() {
    if (document.getElementById('crozzo-pi-styles')) return;
    var el = document.createElement('style');
    el.id = 'crozzo-pi-styles';
    el.textContent =
      '.crozzo-pi-app{--pi-accent:#10b981;--pi-bg:#0f0720;--pi-card:rgba(255,255,255,.06);--pi-border:rgba(255,255,255,.12);--pi-text:#f9fafb;--pi-muted:#9ca3af;font-family:system-ui,sans-serif}' +
      '.crozzo-pi-app[data-pi-theme="cyan"]{--pi-accent:#00d4ff;--pi-bg:#0a1628}' +
      '.crozzo-pi-app[data-pi-theme="coral"]{--pi-accent:#fb7185;--pi-bg:#1a0f0a}' +
      '.crozzo-pi-app[data-pi-theme="magenta"]{--pi-accent:#d946ef;--pi-bg:#2e1065}' +
      '.crozzo-pi-app[data-pi-theme="emerald"]{--pi-accent:#2dd4bf;--pi-bg:#022c22}' +
      '.crozzo-pi-app[data-pi-theme="minimalist"]{--pi-accent:#059669;--pi-bg:#fafafa;--pi-text:#111;--pi-muted:#6b7280;--pi-card:#fff;--pi-border:rgba(0,0,0,.1)}' +
      '.crozzo-pi-app{background:linear-gradient(180deg,var(--pi-bg),color-mix(in srgb,var(--pi-bg),#000 15%));color:var(--pi-text);border-radius:16px;padding:16px;border:1px solid var(--pi-border)}' +
      '.crozzo-pi-header{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;margin-bottom:20px}' +
      '.crozzo-pi-brand{text-align:center;flex:1;min-width:200px}' +
      '.crozzo-pi-brand h2{margin:8px 0 4px;font-size:1.35rem;background:linear-gradient(135deg,var(--pi-accent),#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent}' +
      '.crozzo-pi-theme select{padding:8px 12px;border-radius:8px;border:1px solid var(--pi-border);background:var(--pi-card);color:var(--pi-text)}' +
      '.crozzo-pi-tabs{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}' +
      '.crozzo-pi-tabs button{padding:10px 16px;border-radius:10px;border:1px solid var(--pi-border);background:var(--pi-card);color:var(--pi-text);cursor:pointer;font-weight:600;font-size:13px}' +
      '.crozzo-pi-tabs button.active{background:linear-gradient(135deg,var(--pi-accent),color-mix(in srgb,var(--pi-accent),#000 25%));color:#0a0a0b;border-color:transparent}' +
      '.crozzo-pi-app[data-pi-theme="minimalist"] .crozzo-pi-tabs button.active{color:#fff}' +
      '.crozzo-pi-meta{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px}' +
      '.crozzo-pi-meta label{font-size:11px;font-weight:700;text-transform:uppercase;opacity:.7;display:block;margin-bottom:4px}' +
      '.crozzo-pi-meta input{width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--pi-border);background:var(--pi-card);color:var(--pi-text)}' +
      '.crozzo-pi-sec{margin-bottom:14px;padding:14px;border-radius:12px;border:1px solid var(--pi-border);background:var(--pi-card)}' +
      '.crozzo-pi-sec h4{font-size:11px;text-transform:uppercase;letter-spacing:.08em;opacity:.75;margin:0 0 10px}' +
      '.crozzo-pi-row{display:grid;grid-template-columns:1fr 88px;gap:10px;align-items:center;padding:6px 0;border-bottom:1px solid var(--pi-border)}' +
      '.crozzo-pi-row--admin{grid-template-columns:1fr 120px 72px 88px}' +
      '.crozzo-pi-row:last-child{border-bottom:none}' +
      '.crozzo-pi-row input,.crozzo-pi-row select{padding:8px;border-radius:8px;border:1px solid var(--pi-border);background:color-mix(in srgb,var(--pi-card),transparent 30%);color:var(--pi-text);text-align:center;font-size:12px}' +
      '.crozzo-pi-row select{text-align:left}' +
      '.crozzo-pi-src{font-size:10px;opacity:.55;margin-left:4px}' +
      '.crozzo-pi-toolbar{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;align-items:center}' +
      '.crozzo-pi-hint{font-size:11px;opacity:.7;margin:0 0 12px;line-height:1.45}' +
      '.crozzo-pi-send{width:100%;padding:16px;margin-top:12px;border:none;border-radius:12px;font-weight:800;font-size:15px;cursor:pointer;background:linear-gradient(135deg,var(--pi-accent),color-mix(in srgb,var(--pi-accent),#7c3aed 40%));color:#0a0a0b;box-shadow:0 8px 28px color-mix(in srgb,var(--pi-accent),transparent 55%)}' +
      '.crozzo-pi-send:disabled{opacity:.45;cursor:not-allowed}' +
      '.crozzo-pi-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:12px 24px;border-radius:99px;font-weight:700;font-size:13px;display:none;z-index:9999;box-shadow:0 12px 40px rgba(0,0,0,.35)}' +
      '.crozzo-pi-toast.show{display:block}.crozzo-pi-toast.ok{background:#059669;color:#fff}.crozzo-pi-toast.err{background:#dc2626;color:#fff}' +
      '.crozzo-pi-hist-wrap{margin-top:24px;padding-top:16px;border-top:1px solid var(--pi-border)}' +
      '.crozzo-pi-hist{width:100%;border-collapse:collapse;font-size:12px}' +
      '.crozzo-pi-hist th,.crozzo-pi-hist td{padding:8px 6px;border-bottom:1px solid var(--pi-border);text-align:left}' +
      '.crozzo-pi-app--in-pos{--pi-accent:var(--accent,#10b981);--pi-bg:var(--bg-primary);--pi-card:var(--bg-card);--pi-border:var(--border);--pi-text:var(--text-primary);--pi-muted:var(--text-muted,#888);background:var(--bg-primary);border:1px solid var(--border);border-radius:12px;padding:12px}' +
      '.crozzo-pi-app--in-pos .crozzo-pi-brand h2{-webkit-text-fill-color:unset;color:var(--text-primary);background:none}' +
      '.crozzo-pi-app--in-pos .crozzo-pi-tabs button.active{color:var(--btn-text,#111)}';
    document.head.appendChild(el);
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

  function currentPanel() {
    return ped.panels.find(function (p) { return p.id === ped.tab; }) || ped.panels[0] || { id: '', label: '', sections: [] };
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
    if (src === 'receta') return '<span class="crozzo-pi-src" title="Área inferida desde recetas y comandas">🍳 receta</span>';
    if (src === 'manual') return '<span class="crozzo-pi-src" title="Asignación manual">✏️ manual</span>';
    if (src === 'catalogo') return '<span class="crozzo-pi-src" title="Área en catálogo MP">📦 catálogo</span>';
    return '<span class="crozzo-pi-src" title="Por categoría de materia prima">🏷️ lógica</span>';
  }

  function renderPanel(tab) {
    var panel = ped.panels.find(function (p) { return p.id === tab; }) || currentPanel();
    var admin = ped.adminEdit && eng() && eng().isAdminEditor();
    var html = '';
    if (!panel.sections.length) {
      html += '<p class="crozzo-pi-hint">Sin materias primas en esta área. Revise el catálogo MP o asigne áreas en modo edición (admin).</p>';
    }
    panel.sections.forEach(function (sec) {
      html += '<motion.div class="crozzo-pi-sec"><h4>' + esc(sec.sec) + '</h4>';
      sec.items.forEach(function (item) {
        var id = mkId(tab, item.mpId || item.nombre);
        if (admin) {
          html +=
            '<div class="crozzo-pi-row crozzo-pi-row--admin" data-pi-mp="' + esc(item.mpId) + '">' +
            '<span>' + esc(item.nombre) + sourceBadge(item.areaSource) + '</span>' +
            '<select class="pi-adm-area" data-mp="' + esc(item.mpId) + '">' + areaOptionsHtml(item.areaId) + '</select>' +
            '<label style="display:flex;align-items:center;gap:4px;font-size:11px;justify-content:center">' +
            '<input type="checkbox" class="pi-adm-hide" data-mp="' + esc(item.mpId) + '" /> Ocultar</label>' +
            '<input type="text" id="pi_' + id + '" placeholder="Cant." inputmode="decimal" /></motion.div>';
        } else {
          html +=
            '<div class="crozzo-pi-row"><span>' + esc(item.nombre) + '</span>' +
            '<input type="text" id="pi_' + id + '" placeholder="Cant." inputmode="decimal" /></motion.div>';
        }
      });
      html += '</motion.div>';
    });
    var exStart = admin ? 3 : 5;
    for (var i = 1; i <= exStart; i++) {
      html +=
        '<div class="crozzo-pi-row"><input type="text" id="pi_' + tab + '_ex' + i + 'n" placeholder="Adicional ' + i + '" style="text-align:left" />' +
        '<input type="text" id="pi_' + tab + '_ex' + i + 'q" placeholder="Cant." inputmode="decimal" /></div>';
    }
    return html.replace(/<motion\./g, '<').replace(/<\/motion\./g, '</');
  }

  function collectItems(tab) {
    var panel = ped.panels.find(function (p) { return p.id === tab; }) || currentPanel();
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

  function showPiToast(msg, type) {
    var t = document.getElementById('crozzo-pi-toast');
    if (!t) { toast(msg, type); return; }
    t.textContent = msg;
    t.className = 'crozzo-pi-toast show ' + (type || '');
    setTimeout(function () { t.classList.remove('show'); }, 3200);
  }

  function tabLabel(tabId) {
    if (eng()) return eng().areaLabel(tabId);
    return tabId;
  }

  async function sendPedido() {
    var tab = ped.tab;
    var resp = String((document.getElementById('pi-resp') || {}).value || '').trim();
    if (!resp) { showPiToast('Escribe quién diligencia el pedido', 'err'); return; }
    var items = collectItems(tab);
    if (!items.length) { showPiToast('No hay cantidades diligenciadas', 'err'); return; }
    var fecha = (document.getElementById('pi-fecha') || {}).value || api().tkey();
    var obs = String((document.getElementById('pi-obs') || {}).value || '').trim();
    var btn = document.getElementById('pi-send');
    if (btn) { btn.disabled = true; btn.textContent = 'Enviando…'; }
    var body = {
      business_id: api().businessId(),
      responsable: resp,
      fecha_pedido: fecha,
      area: tab,
      area_label: tabLabel(tab),
      items: items,
      observaciones: obs,
      telegram_ok: false,
    };
    if (api().cloudReady()) {
      var r = await api().rest('crozzo_pedidos_internos', '', { method: 'POST', body: body, prefer: 'return=representation' });
      if (r.ok) body.telegram_ok = true;
      else showPiToast('Error en nube — ejecute SQL integración en Supabase del Super Admin', 'err');
    }
    try {
      var local = JSON.parse(localStorage.getItem('crozzo_int_pedidos_local') || '[]');
      local.unshift(Object.assign({ id: Date.now(), created_at: new Date().toISOString() }, body));
      localStorage.setItem('crozzo_int_pedidos_local', JSON.stringify(local.slice(0, 200)));
    } catch (_) {}
    var st = api().state;
    await api().loadIntegracionConfig();
    var tg = st.intConfig.telegram || {};
    if (tg.botToken && tg.chatId) {
      var lines = ['📋 *PEDIDO — ' + tabLabel(tab).toUpperCase() + '*', '👤 ' + resp, ''];
      var cur = '';
      items.forEach(function (it) {
        if (it.seccion !== cur) { lines.push('*' + it.seccion + '*'); cur = it.seccion; }
        lines.push('• ' + it.producto + ': ' + it.cantidad);
      });
      if (obs) lines.push('', '📝 ' + obs);
      try {
        await fetch('https://api.telegram.org/bot' + tg.botToken + '/sendMessage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: tg.chatId, text: lines.join('\n'), parse_mode: 'Markdown' }),
        });
        var csv = buildCsv(tab, resp, fecha, obs, items);
        var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        var fd = new FormData();
        fd.append('chat_id', tg.chatId);
        fd.append('document', blob, 'Pedido_' + tabLabel(tab) + '_' + fecha + '.csv');
        fd.append('caption', '📎 Pedido ' + tabLabel(tab));
        await fetch('https://api.telegram.org/bot' + tg.botToken + '/sendDocument', { method: 'POST', body: fd });
        showPiToast('Pedido enviado a Telegram', 'ok');
      } catch (_) {
        showPiToast('Guardado (Telegram falló)', 'err');
      }
    } else {
      showPiToast('Pedido guardado. Configura Telegram en Control de acceso → Config', 'ok');
    }
    if (document.getElementById('pi-obs')) document.getElementById('pi-obs').value = '';
    if (btn) { btn.disabled = false; btn.textContent = 'Enviar pedido'; }
    await loadHistorial();
  }

  function buildCsv(tab, resp, fecha, obs, items) {
    var rows = [['PEDIDO', tabLabel(tab)], ['Responsable', resp], ['Fecha', fecha], [], ['Producto', 'Cantidad']];
    items.forEach(function (i) { rows.push([i.producto, i.cantidad]); });
    if (obs) rows.push([], ['Observaciones', obs]);
    return rows.map(function (r) {
      return r.map(function (c) { return '"' + String(c || '').replace(/"/g, '""') + '"'; }).join(',');
    }).join('\n');
  }

  async function loadHistorial() {
    var rows = [];
    if (api().cloudReady()) {
      var q = api().bidFilter();
      q = (q ? q + '&' : '') + 'order=created_at.desc&limit=40&select=id,responsable,fecha_pedido,area,items,observaciones,created_at';
      var r = await api().rest('crozzo_pedidos_internos', q);
      if (r.ok && Array.isArray(r.data)) rows = r.data;
    }
    try {
      var local = JSON.parse(localStorage.getItem(api().LS_PEDIDOS || 'crozzo_int_pedidos_local') || '[]');
      local.forEach(function (l) {
        if (!rows.some(function (x) { return String(x.id) === String(l.id); })) rows.push(l);
      });
    } catch (_) {}
    rows.sort(function (a, b) {
      var ta = new Date(a.created_at || a.fecha_pedido || 0).getTime();
      var tb = new Date(b.created_at || b.fecha_pedido || 0).getTime();
      return tb - ta;
    });
    ped.historial = rows.slice(0, 40);
    renderHistorial();
  }

  function renderHistorial() {
    var host = document.getElementById('pi-historial');
    if (!host) return;
    if (!ped.historial.length) {
      host.innerHTML = '<p style="font-size:12px;opacity:.65;margin:0">Sin pedidos recientes en nube o local.</p>';
      return;
    }
    host.innerHTML =
      '<table class="crozzo-pi-hist"><thead><tr><th>Fecha</th><th>Área</th><th>Responsable</th><th>Ítems</th></tr></thead><tbody>' +
      ped.historial
        .map(function (p) {
          var n = Array.isArray(p.items) ? p.items.length : 0;
          return (
            '<tr><td>' + esc(p.fecha_pedido || (p.created_at || '').slice(0, 10)) + '</td>' +
            '<td>' + esc(p.area_label || tabLabel(p.area) || p.area) + '</td>' +
            '<td>' + esc(p.responsable) + '</td><td>' + n + '</td></tr>'
          );
        })
        .join('') +
      '</tbody></table>';
  }

  function saveAdminOverrides() {
    if (!eng()) return;
    document.querySelectorAll('.pi-adm-area').forEach(function (sel) {
      var mpId = sel.getAttribute('data-mp');
      var areaId = sel.value;
      if (mpId && areaId) eng().setOverride(mpId, { areaId: areaId, source: 'manual' });
    });
    document.querySelectorAll('.pi-adm-hide').forEach(function (cb) {
      var mpId = cb.getAttribute('data-mp');
      if (mpId) eng().setOverride(mpId, { hidden: !!cb.checked });
    });
    refreshPanels();
    var p = document.getElementById('pi-panel');
    if (p) p.innerHTML = renderPanel(ped.tab);
    showPiToast('Configuración de pedidos guardada', 'ok');
  }

  function bindPedidos() {
    document.querySelectorAll('[data-pi-tab]').forEach(function (btn) {
      btn.onclick = function () {
        ped.tab = btn.getAttribute('data-pi-tab');
        document.querySelectorAll('[data-pi-tab]').forEach(function (b) {
          b.classList.toggle('active', b.getAttribute('data-pi-tab') === ped.tab);
        });
        var p = document.getElementById('pi-panel');
        if (p) p.innerHTML = renderPanel(ped.tab);
      };
    });
    var sel = document.getElementById('pi-theme-select');
    if (sel) sel.onchange = function () { applyTheme(sel.value); };
    var send = document.getElementById('pi-send');
    if (send) send.onclick = sendPedido;
    var adm = document.getElementById('pi-admin-toggle');
    if (adm) {
      adm.onclick = function () {
        ped.adminEdit = !ped.adminEdit;
        adm.textContent = ped.adminEdit ? 'Salir edición' : 'Editar productos';
        adm.classList.toggle('active', ped.adminEdit);
        var p = document.getElementById('pi-panel');
        if (p) p.innerHTML = renderPanel(ped.tab);
      };
    }
    var rec = document.getElementById('pi-recalc-recetas');
    if (rec) {
      rec.onclick = function () {
        if (!eng()) return;
        var n = eng().recalcAllFromRecipes();
        refreshPanels();
        var p = document.getElementById('pi-panel');
        if (p) p.innerHTML = renderPanel(ped.tab);
        showPiToast('Áreas recalculadas desde recetas (' + n + ' ítems)', 'ok');
      };
    }
    var save = document.getElementById('pi-save-config');
    if (save) save.onclick = saveAdminOverrides;
  }

  function applyTheme(name) {
    ped.theme = name;
    try {
      localStorage.setItem('crozzo_theme', name);
      localStorage.setItem('crozzo-theme', name);
    } catch (_) {}
    var root = document.getElementById('crozzo-pi-root');
    if (root) root.setAttribute('data-pi-theme', name);
    var sel = document.getElementById('pi-theme-select');
    if (sel) sel.value = name;
  }

  function ensureCatalogReady(cb) {
    var chain = Promise.resolve();
    if (global.CrozzoReservorio && global.CrozzoReservorio.migrateLegacy) {
      global.CrozzoReservorio.migrateLegacy();
    }
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

  global.CrozzoModulosIntegradosPedidos = {
    render: function (opts) {
      if (!api()) return '<motion.div class="card"><p>Falta CrozzoModulosIntegrados.js</p></motion.div>'.replace(/<motion\./g, '<').replace(/<\/motion\./g, '</');
      opts = opts || {};
      var inHub = !!opts.embedInHub;
      if (!inHub) injectPedidosStyles();
      refreshPanels();
      try {
        if (!inHub) {
          var saved =
            localStorage.getItem('crozzo_theme') ||
            localStorage.getItem('crozzo-theme') ||
            'deepspace';
          if (THEMES.some(function (t) { return t.id === saved; })) ped.theme = saved;
        } else ped.theme = 'minimalist';
      } catch (_) {}
      var themeOpts = THEMES.map(function (t) {
        return '<option value="' + t.id + '"' + (ped.theme === t.id ? ' selected' : '') + '>' + t.label + '</option>';
      }).join('');
      var tabs = ped.panels.map(function (t) {
        return (
          '<button type="button" class="' + (ped.tab === t.id ? 'active' : '') + '" data-pi-tab="' + esc(t.id) + '">' +
          esc(t.label) +
          '</button>'
        );
      }).join('');
      if (!tabs) {
        tabs = '<span class="crozzo-pi-hint">Configure áreas en Comandas → Config. comandas</span>';
      }
      var cloudSt = api().cloudStatusLabel ? api().cloudStatusLabel() : { ok: api().cloudReady(), text: 'Nube' };
      var cloud =
        '<span class="crozzo-retail-pill" style="color:' + (cloudSt.ok ? 'var(--success)' : 'var(--warning)') + '">' + esc(cloudSt.text) + '</span>';
      var appCls = 'crozzo-pi-app' + (inHub ? ' crozzo-pi-app--in-pos' : '');
      var adminBar = '';
      if (eng() && eng().isAdminEditor()) {
        adminBar =
          '<div class="crozzo-pi-toolbar">' +
          '<button type="button" class="btn btn-outline" id="pi-admin-toggle" style="font-size:12px;padding:6px 12px">Editar productos</button>' +
          '<button type="button" class="btn btn-outline" id="pi-recalc-recetas" style="font-size:12px;padding:6px 12px">Recalcular desde recetas</button>' +
          '<button type="button" class="btn btn-primary" id="pi-save-config" style="font-size:12px;padding:6px 12px;display:none">Guardar cambios</button>' +
          '</motion.div>';
        adminBar = adminBar.replace(/<motion\./g, '<').replace(/<\/motion\./g, '</');
      }
      var guestHint =
        typeof getCurrentUser === 'function' && !getCurrentUser()
          ? '<p class="crozzo-pi-hint">Modo invitado: no requiere cuenta. Escriba su nombre en Responsable.</p>'
          : '';
      var areaHint =
        '<p class="crozzo-pi-hint">Las pestañas son las <strong>áreas de comandas</strong> configuradas. Los ítems vienen del <strong>catálogo de materia prima</strong>; el área se deduce por receta (plato → cocina/bar…) o por categoría.</p>';
      return (
        '<section class="content-section">' +
        '<div class="' + appCls + '" id="crozzo-pi-root" data-pi-theme="' + esc(ped.theme) + '">' +
        '<motion.div class="crozzo-pi-header">' +
        (inHub ? '' : '<label class="crozzo-pi-theme">Tema <select id="pi-theme-select">' + themeOpts + '</select></label>') +
        '<div class="crozzo-pi-brand"><motion.div style="font-size:11px;opacity:.65;text-transform:uppercase;letter-spacing:.1em">Pedidos internos</motion.div>' +
        '<h2 style="' + (inHub ? 'font-size:1.1rem;margin:4px 0' : '') + '">Pedidos a producción</h2><p style="font-size:12px;opacity:.75">Integrado al POS · ' + cloud + '</p></div></motion.div>' +
        guestHint +
        areaHint +
        adminBar +
        '<motion.div class="crozzo-pi-meta"><div><label>Responsable</label><input id="pi-resp" type="text" placeholder="¿Quién diligencia?" autocomplete="name" /></div>' +
        '<div><label>Fecha</label><input id="pi-fecha" type="date" value="' + api().tkey() + '" /></div></motion.div>' +
        '<motion.div class="crozzo-pi-tabs">' + tabs + '</motion.div>' +
        '<div id="pi-panel">' + renderPanel(ped.tab) + '</div>' +
        '<div style="margin-top:12px"><label style="font-size:11px;font-weight:700;opacity:.7">Observaciones</label>' +
        '<textarea id="pi-obs" rows="2" style="width:100%;margin-top:6px;padding:10px;border-radius:10px;border:1px solid var(--pi-border);background:var(--pi-card);color:var(--pi-text);resize:vertical"></textarea></motion.div>' +
        '<button type="button" class="crozzo-pi-send" id="pi-send">Enviar pedido</button>' +
        '<motion.div class="crozzo-pi-hist-wrap"><h3 style="font-size:13px;margin:0 0 10px;font-weight:800">Historial reciente</h3>' +
        '<motion.div id="pi-historial"><p style="font-size:12px;opacity:.65">Cargando…</p></motion.div></motion.div></motion.div>' +
        '<div id="crozzo-pi-toast" class="crozzo-pi-toast"></div></section>'
      ).replace(/<motion\./g, '<').replace(/<\/motion\./g, '</');
    },
    init: async function () {
      injectPedidosStyles();
      await api().loadIntegracionConfig();
      ensureCatalogReady(function () {
        bindPedidos();
        var adm = document.getElementById('pi-admin-toggle');
        if (adm) {
          adm.addEventListener('click', function () {
            var saveBtn = document.getElementById('pi-save-config');
            if (saveBtn) saveBtn.style.display = ped.adminEdit ? '' : 'none';
          });
        }
      });
      await loadHistorial();
      var u = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
      if (u && u.nombre) {
        var r = document.getElementById('pi-resp');
        if (r && !r.value) {
          r.value = u.nombre;
          r.readOnly = false;
        }
      }
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
