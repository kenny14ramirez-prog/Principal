/**
 * Pedidos internos — UI integrada (misma experiencia que Pedidos_Internos_Queso_y_Cafe_Alamos.html).
 */
(function (global) {
  'use strict';

  var api = function () { return global.CrozzoIntApi; };

  var TAB_LABELS = { cocina: 'Cocina', bar: 'Bar y Frío', panaderia: 'Panadería', desechables: 'Desechables' };
  var THEMES = [
    { id: 'deepspace', label: 'Deep Space' },
    { id: 'cyan', label: 'Cyan Tech' },
    { id: 'coral', label: 'Coral Energy' },
    { id: 'magenta', label: 'Magenta Vibrant' },
    { id: 'emerald', label: 'Emerald Fresh' },
    { id: 'minimalist', label: 'Minimalist Elegant' }
  ];

  var ped = { tab: 'cocina', theme: 'deepspace', historial: [] };

  var CATALOG = {
    cocina: [
      { sec: 'Carnes y proteínas', items: ['Chorizos', 'Pechuga', 'Carne Molida', 'Costilla de Res Especial', 'Panceta', 'Costichicharrón', 'Carne de Hamburguesa (5kg)', 'Carne de Albóndiga', 'Filete de Pollo x 120gr', 'Filete de Cerdo x 120gr', 'Filete de Res x 120gr', 'Solomo', 'Salchicha Llanera Rica', 'Jamón de Pavo (Finas Hiervas)', 'Jamón Cerrano (Valdevaca)', 'Chorizo Vela (Centurion)', 'Peperoni (Valdevaca)', 'Tocineta Nojos', 'Camarones', 'Trucha', 'Trucha x 400', 'Almeja en Concha', 'Mejillones en Concha'] },
      { sec: 'Arepas y panes', items: ['Arepas', 'Papa Francesa', 'Papa Rústica', 'Pan Tajado'] },
      { sec: 'Lácteos y quesos', items: ['Queso Crema', 'Jamón Colanta', 'Queso Parmesano', 'Queso Cheddar', 'Bloque de Queso Entero', 'Bloque de Queso Tajado', 'Crema de Leche Alphina', 'Crema de Leche D1', 'Mantequilla Unipersonal', 'Almendra Laminada'] },
      { sec: 'Salsas y aderezos', items: ['Salsa Negra', 'Salsa Teriyaki', 'Salsa Soya', 'Vinagreta', 'Salsa Vermelo (Zafran)', 'Salsa Leña (Zafran)', 'Maggi / Doña Gallina', 'Ricostilla', 'Miel de Maple', "Salsa de Chocolate (Hershey's)", 'Sal Refisal', 'Masa para Pancakes', 'Productos Badia'] },
      { sec: 'Secos y pastas', items: ['Apanado Fino (Zafran)', 'Batido Adherente (Zafran)', 'Margarina Mojapan', 'Frijol / Cargamanto / Aro', 'Arroz', 'Pasta de Tomate', 'Miga de Pan Fina', 'Azúcar Pulverizada', 'Maíz Dulce', 'Pasta Penne', 'Recar Soplete', 'Valbula Soplete', 'Bidon de Aceite x 20L'] },
      { sec: 'Enlatados', items: ['Duraznos en Lata', 'Champiñón', 'Salsa de Tomate Cocineros (Fruco)', 'Mayonesa Cocineros (Fruco)'] },
      { sec: 'Frutas y verduras', items: ['Cilantro', 'Cebolla Cabezona Blanca', 'Cebolla Cabezona Morada', 'Cebolla Larga', 'Tomate Chonto', 'Pimentón', 'Papa', 'Ajo', 'Zanahoria', 'Lechuga Verde', 'Lechuga Morada', 'Aguacate', 'Zucchini Verde', 'Zucchini Amarillo', 'Plátano Verde', 'Plátano Amarillo', 'Limón Tahiti', 'Manzana Verde', 'Manzana Roja', 'Hierbabuena', 'Mora', 'Fresa Jumbo', 'Mango Biche', 'Mango Pintón', 'Piña', 'Arándanos', 'Tomate Cherry'] }
    ],
    bar: [
      { sec: 'Cafés y bebidas base', items: ['Té Chai', 'Tajín', 'Barquillo', 'Canela en Astilla', 'Clavos de Olor', 'Flor de Jamaica', 'Anís', 'Splenda (Sweetender)', 'Azúcar en Tubos', 'Leche en Polvo', 'Aromática de Manzanilla', 'Aromática de Hierbabuena', 'Aromática de Frutos Rojos', 'Café Cuarteron', 'Café para Cold Brew', 'Café Herencia Libra', 'Café Herencia Media Libra'] },
      { sec: 'Lácteos y cremas', items: ['Chantilly', 'Leche de Almendras', 'Leche Condensada', 'Milo', 'Chocolate', 'Esencia de Vainilla', 'Panela Pulverizada'] },
      { sec: 'Salsas y dulces', items: ['Salsa de Chocolate Aderezos', 'Galletas Ducales', 'Avena Toning', 'Masmelos'] },
      { sec: 'Helados', items: ['Helado de Vainilla', 'Helado de Frutos Rojos', 'Helado de Chocolate'] },
      { sec: 'Bebidas y licores', items: ['Hielo', 'Amareto', 'Baileys', 'Cerveza Club Dorada', 'Cerveza Aguila Light', 'Tamarindo', 'CocaCola Original', 'CocaCola Zero', 'Agua Manantial', 'Agua con Gas Manantial', 'Soda Schweppes', 'Limonada de Coco', 'Limonada de Cereza', 'Limonada de Mango Biche', 'Vino Tinto', 'Agua con Gas', 'Leche Deslactosada'] },
      { sec: 'Pulpas', items: ['Pulpa de Lulo', 'Pulpa de Mora', 'Pulpa de Fresa', 'Pulpa de Mango', 'Pulpa de Guanaba', 'Pulpa de Maracuyá'] },
      { sec: 'Frutas y verduras', items: ['Naranja', 'Limón Tahiti', 'Manzana Verde', 'Manzana Roja', 'Hierbabuena', 'Mora', 'Arándanos', 'Fresa Jumbo', 'Mango Biche', 'Mango Pintón', 'Piña', 'Maracuyá', 'Durazno', 'Jengibre'] }
    ],
    panaderia: [
      { sec: 'Lácteos y quesos', items: ['Queso Costeño', 'Queso Cuajada'] },
      { sec: 'Panadería seca', items: ['Cernido de Guayaba por Mangas', 'Arequipe', 'Azúcar', 'Almidón', 'Harina de Trigo', 'Harina de Maíz', 'Margarina Astra'] }
    ],
    desechables: [
      { sec: 'Utensilios', items: ['Cuchara Desechable', 'Tenedor Desechable', 'Cuchillo Desechable', 'Servilleta Popular', 'Papel Higiénico Natural', 'Tapa Bocas', 'Guantes de Nitrilo', 'Cofia Negra de Malla'] },
      { sec: 'Vasos y tapas', items: ['Vaso 7 ONZ BC', 'Tapa Rígida Viajera 7 ONZ PS', 'Vaso 9 ONZ Cañatez', 'Tapa Viajera para Vaso 9 ONZ', 'Vaso Gold 12 ONZ', 'Vaso Gold 16 ONZ', 'Tapa Rígido Domo Sin Perforar Reload Gold', 'Tapa Rígido Domo Perforada Reload Gold', 'Tapa Reload Plana MN 9,12,16,22 ONZ', 'Tapa Reload Pitillera MN 9,12,16,22 ONZ'] },
      { sec: 'Contenedores', items: ['Contenedor Sibarita 12 ONZ Bioform', 'Tapa Contenedor Sibarita 12 ONZ Carvajal', 'Bowl 32 ONZ Bioform', 'Bowl 26 ONZ Bioform', 'Tapa Bowl 26 y 32 ONZ Biform', 'Contenedor J1 Pulpa', 'Contenedor Triangular Sello Plus T.A.', 'Contenedor Cuadrado Sello Plus T.A.', 'Contenedor Darnel 1½ con Tapa'] },
      { sec: 'Bolsas y rollos', items: ['Bolsa de Papel 2L', 'Bolsa de Papel 3L', 'Bolsa de Papel 6L', 'Servilletas', 'Bolsa Transparente 5x9', 'Bolsa Transparente 6x11', 'Bolsa Ziploc 10x21', 'Bolsa Ziploc 1x3 (quesos)', 'Rollo de Vinipel', 'Bolsa Blanca T20', 'Bolsa Blanca T30', 'Rollo de Papel Aluminio', 'Rollos Térmicos 48gr 80MM x 60 MTS', 'Servilleta Plus FSC', 'Rollo Limion Industrial', 'Toalla de Manos Tipo Z', 'Bolsa de Basura 65x95 Colores', 'Bolsa de Basura Jumbo', 'Pitillo x 500 Uni', 'Guante Pollo'] },
      { sec: 'Varios / limpieza', items: ['Candela', 'Detergente Líquido x 20L', 'Jabón Líquido para Manos', 'Salsa Leña x 4', 'Vinagreta', 'Hersheys', 'Syrup', 'Arroz', 'Frijol', 'Cinta de Enmascarar', 'Cinta Transparente', 'Esponja Doble Uso', 'Mezcladores de Madera'] }
    ]
  };

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
      '.crozzo-pi-row:last-child{border-bottom:none}' +
      '.crozzo-pi-row input{padding:8px;border-radius:8px;border:1px solid var(--pi-border);background:color-mix(in srgb,var(--pi-card),transparent 30%);color:var(--pi-text);text-align:center}' +
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

  function applyTheme(name) {
    ped.theme = name;
    try {
      localStorage.setItem('crozzo-theme', name);
      localStorage.setItem('crozzo_theme', name);
    } catch (_) {}
    var root = document.getElementById('crozzo-pi-root');
    if (root) root.setAttribute('data-pi-theme', name);
    var sel = document.getElementById('pi-theme-select');
    if (sel) sel.value = name;
  }

  function renderPanel(tab) {
    var html = '';
    (CATALOG[tab] || []).forEach(function (sec) {
      html += '<div class="crozzo-pi-sec"><h4>' + esc(sec.sec) + '</h4>';
      sec.items.forEach(function (item) {
        var id = mkId(tab, item);
        html += '<div class="crozzo-pi-row"><span>' + esc(item) + '</span><input type="text" id="pi_' + id + '" placeholder="Cant." inputmode="decimal" /></div>';
      });
      html += '</div>';
    });
    for (var i = 1; i <= 5; i++) {
      html += '<div class="crozzo-pi-row"><input type="text" id="pi_' + tab + '_ex' + i + 'n" placeholder="Adicional ' + i + '" style="text-align:left" />' +
        '<input type="text" id="pi_' + tab + '_ex' + i + 'q" placeholder="Cant." inputmode="decimal" /></div>';
    }
    return html;
  }

  function collectItems(tab) {
    var items = [];
    (CATALOG[tab] || []).forEach(function (sec) {
      sec.items.forEach(function (item) {
        var el = document.getElementById('pi_' + mkId(tab, item));
        var qty = el ? String(el.value || '').trim() : '';
        if (qty) items.push({ seccion: sec.sec, producto: item, cantidad: qty });
      });
    });
    for (var i = 1; i <= 5; i++) {
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

  async function sendPedido() {
    var tab = ped.tab;
    var resp = String((document.getElementById('pi-resp') || {}).value || '').trim();
    if (!resp) { showPiToast('Escribe el responsable', 'err'); return; }
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
      items: items,
      observaciones: obs,
      telegram_ok: false
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
      var lines = ['📋 *PEDIDO — ' + (TAB_LABELS[tab] || tab).toUpperCase() + '*', '👤 ' + resp, ''];
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
          body: JSON.stringify({ chat_id: tg.chatId, text: lines.join('\n'), parse_mode: 'Markdown' })
        });
        var csv = buildCsv(tab, resp, fecha, obs, items);
        var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        var fd = new FormData();
        fd.append('chat_id', tg.chatId);
        fd.append('document', blob, 'Pedido_' + (TAB_LABELS[tab] || tab) + '_' + fecha + '.csv');
        fd.append('caption', '📎 Pedido ' + (TAB_LABELS[tab] || tab));
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
    var rows = [['PEDIDO', TAB_LABELS[tab] || tab], ['Responsable', resp], ['Fecha', fecha], [], ['Producto', 'Cantidad']];
    items.forEach(function (i) { rows.push([i.producto, i.cantidad]); });
    if (obs) rows.push([], ['Observaciones', obs]);
    return rows.map(function (r) { return r.map(function (c) { return '"' + String(c || '').replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
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
            '<td>' + esc(TAB_LABELS[p.area] || p.area) + '</td>' +
            '<td>' + esc(p.responsable) + '</td><td>' + n + '</td></tr>'
          );
        })
        .join('') +
      '</tbody></table>';
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
  }

  global.CrozzoModulosIntegradosPedidos = {
    render: function (opts) {
      if (!api()) return '<div class="card"><p>Falta CrozzoModulosIntegrados.js</p></div>';
      opts = opts || {};
      var inHub = !!opts.embedInHub;
      if (!inHub) injectPedidosStyles();
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
      var tabs = ['cocina', 'bar', 'panaderia', 'desechables'].map(function (t) {
        return '<button type="button" class="' + (ped.tab === t ? 'active' : '') + '" data-pi-tab="' + t + '">' + esc(TAB_LABELS[t]) + '</button>';
      }).join('');
      var cloudSt = api().cloudStatusLabel ? api().cloudStatusLabel() : { ok: api().cloudReady(), text: 'Nube' };
      var cloud =
        '<span class="crozzo-retail-pill" style="color:' + (cloudSt.ok ? 'var(--success)' : 'var(--warning)') + '">' + esc(cloudSt.text) + '</span>';
      var appCls = 'crozzo-pi-app' + (inHub ? ' crozzo-pi-app--in-pos' : '');
      return (
        '<section class="content-section' + (inHub ? '' : '') + '">' +
        '<div class="' + appCls + '" id="crozzo-pi-root" data-pi-theme="' + esc(ped.theme) + '">' +
        '<div class="crozzo-pi-header">' +
        (inHub ? '' : '<label class="crozzo-pi-theme">Tema <select id="pi-theme-select">' + themeOpts + '</select></label>') +
        '<div class="crozzo-pi-brand"><div style="font-size:11px;opacity:.65;text-transform:uppercase;letter-spacing:.1em">Pedidos internos</div>' +
        '<h2 style="' + (inHub ? 'font-size:1.1rem;margin:4px 0' : '') + '">Pedidos a producción</h2><p style="font-size:12px;opacity:.75">Integrado al POS · ' + cloud + '</p></div></div>' +
        '<div class="crozzo-pi-meta"><div><label>Responsable</label><input id="pi-resp" type="text" placeholder="¿Quién diligencia?" autocomplete="name" /></div>' +
        '<div><label>Fecha</label><input id="pi-fecha" type="date" value="' + api().tkey() + '" /></div></div>' +
        '<div class="crozzo-pi-tabs">' + tabs + '</div>' +
        '<div id="pi-panel">' + renderPanel(ped.tab) + '</div>' +
        '<div style="margin-top:12px"><label style="font-size:11px;font-weight:700;opacity:.7">Observaciones</label>' +
        '<textarea id="pi-obs" rows="2" style="width:100%;margin-top:6px;padding:10px;border-radius:10px;border:1px solid var(--pi-border);background:var(--pi-card);color:var(--pi-text);resize:vertical"></textarea></div>' +
        '<button type="button" class="crozzo-pi-send" id="pi-send">Enviar pedido</button>' +
        '<div class="crozzo-pi-hist-wrap"><h3 style="font-size:13px;margin:0 0 10px;font-weight:800">Historial reciente</h3>' +
        '<div id="pi-historial"><p style="font-size:12px;opacity:.65">Cargando…</p></div></div></div>' +
        '<div id="crozzo-pi-toast" class="crozzo-pi-toast"></div></section>'
      );
    },
    init: async function () {
      injectPedidosStyles();
      await api().loadIntegracionConfig();
      bindPedidos();
      await loadHistorial();
      var u = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
      if (u && u.nombre) {
        var r = document.getElementById('pi-resp');
        if (r && !r.value) r.value = u.nombre;
      }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
