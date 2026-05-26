/**
 * Crozzo POS — Módulos integrados (pedidos internos, RRHH, nómina, recepciones QyC).
 * Usa la misma Supabase del POS (crozzo_supabase_config / multidispositivo).
 */
(function (global) {
  'use strict';

  var LS_PEDIDOS = 'crozzo_int_pedidos_local';
  var LS_RRHH = 'crozzo_int_rrhh_local';
  var LS_NOMINA = 'crozzo_int_nomina_local';

  var PEDIDOS_CATALOG = {
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

  var TAB_LABELS = { cocina: 'Cocina', bar: 'Bar y Frío', panaderia: 'Panadería', desechables: 'Desechables' };

  var state = {
    empleados: [],
    marcaciones: [],
    recepciones: [],
    proveedores: [],
    intConfig: {},
    rrhhConfig: {},
    nomina: {},
    pedidosTab: 'cocina',
    accesoTab: 'kiosk',
    qycTab: 'recepciones',
    pinBuf: '',
    curEmp: null,
    pendingAction: null
  };

  function esc(s) {
    if (typeof escUserAttr === 'function') return escUserAttr(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function toast(msg, type) {
    if (typeof showToast === 'function') showToast(msg, type || 'info');
    else console.log('[int]', msg);
  }

  function businessId() {
    try {
      var md = typeof config !== 'undefined' && config.get ? config.get('multidispositivo') || {} : {};
      return String(md.businessId || localStorage.getItem('crozzo_business_id') || 'default').trim() || 'default';
    } catch (_) {
      return 'default';
    }
  }

  function sbPair() {
    var j = typeof readCrozzoSupabaseJson === 'function' ? readCrozzoSupabaseJson() : null;
    if (j && j.url) {
      var k = typeof crozzoSupabaseEffectiveAnonKey === 'function' ? crozzoSupabaseEffectiveAnonKey(j) : String(j.key || j.anonKey || '');
      if (j.syncEnabled && typeof isValidSupabasePair === 'function' && isValidSupabasePair(j.url, k)) {
        return { url: String(j.url).replace(/\/$/, ''), key: k };
      }
      return null;
    }
    try {
      var md = config.get('multidispositivo') || {};
      var sb = md.supabase || {};
      var k2 = typeof crozzoSupabaseEffectiveAnonKey === 'function' ? crozzoSupabaseEffectiveAnonKey(sb) : String(sb.anonKey || '');
      if (sb.url && k2 && typeof isValidSupabasePair === 'function' && isValidSupabasePair(sb.url, k2)) {
        return { url: String(sb.url).replace(/\/$/, ''), key: k2 };
      }
    } catch (_) {}
    return null;
  }

  function cloudReady() {
    try {
      if (typeof crozzoOnlineConfigReady === 'function' && crozzoOnlineConfigReady()) return true;
    } catch (_) {}
    return !!sbPair();
  }

  function cloudStatusLabel() {
    try {
      if (typeof crozzoOnlineConfigReady === 'function' && crozzoOnlineConfigReady()) {
        var j = typeof readCrozzoSupabaseJson === 'function' ? readCrozzoSupabaseJson() : null;
        var host = j && j.url ? String(j.url).replace(/^https?:\/\//, '').split('/')[0] : 'nube';
        return { ok: true, text: 'Nube · ' + host };
      }
    } catch (_) {}
    return { ok: false, text: 'Sin nube · Super Admin → Multi-dispositivo' };
  }

  function headers() {
    var p = sbPair();
    if (!p) return null;
    return typeof crozzoSupabaseRestHeaders === 'function'
      ? crozzoSupabaseRestHeaders(p.key)
      : { apikey: p.key, Authorization: 'Bearer ' + p.key, 'Content-Type': 'application/json' };
  }

  async function rest(table, query, opts) {
    var p = sbPair();
    var H = headers();
    if (!p || !H) return { ok: false, data: null, status: 0 };
    opts = opts || {};
    var q = query ? (query.charAt(0) === '?' ? query : '?' + query) : '';
    var url = p.url + '/rest/v1/' + encodeURIComponent(table) + q;
    var init = { method: opts.method || 'GET', headers: H };
    if (opts.body) init.body = JSON.stringify(opts.body);
    if (opts.prefer) init.headers = Object.assign({}, H, { Prefer: opts.prefer });
    try {
      var res = await fetch(url, init);
      if (res.status === 401 && typeof crozzoNotifySupabase401Once === 'function') crozzoNotifySupabase401Once();
      var data = null;
      var txt = await res.text();
      if (txt) try { data = JSON.parse(txt); } catch (_) { data = txt; }
      return { ok: res.ok, data: data, status: res.status };
    } catch (e) {
      return { ok: false, data: null, status: 0, error: e };
    }
  }

  function bidFilter() {
    var b = businessId();
    return b ? 'business_id=eq.' + encodeURIComponent(b) : '';
  }

  function tkey() {
    return new Date().toISOString().slice(0, 10);
  }

  function injectStyles() {
    if (document.getElementById('crozzo-int-styles')) return;
    var el = document.createElement('style');
    el.id = 'crozzo-int-styles';
    el.textContent =
      '.crozzo-int{padding:8px 0}.crozzo-int-tabs{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}' +
      '.crozzo-int-tabs button{padding:8px 14px;border-radius:8px;border:1px solid var(--border);background:var(--bg-card);cursor:pointer;font-size:13px}' +
      '.crozzo-int-tabs button.active{background:var(--accent);color:#111;border-color:var(--accent)}' +
      '.crozzo-int-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px}' +
      '.crozzo-int-emp{padding:14px;border-radius:12px;border:1px solid var(--border);background:var(--bg-card);cursor:pointer;text-align:center}' +
      '.crozzo-int-emp:hover{border-color:var(--accent)}' +
      '.crozzo-int-pin{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;max-width:280px;margin:16px auto}' +
      '.crozzo-int-pin button{padding:16px;font-size:18px;border-radius:10px;border:1px solid var(--border);background:var(--bg-card);cursor:pointer}' +
      '.crozzo-int-row{display:grid;grid-template-columns:1fr 90px;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)}' +
      '.crozzo-int-row input{width:100%;padding:8px;border-radius:6px;border:1px solid var(--border)}' +
      '.crozzo-int-sec{margin:16px 0;padding:12px;border-radius:10px;border:1px solid var(--border);background:var(--bg-card)}' +
      '.crozzo-int-sec h4{margin:0 0 10px;font-size:12px;text-transform:uppercase;opacity:0.75}' +
      '.crozzo-int-table{width:100%;border-collapse:collapse;font-size:13px}' +
      '.crozzo-int-table th,.crozzo-int-table td{padding:8px;border-bottom:1px solid var(--border);text-align:left}' +
      '.crozzo-int-badge{display:inline-block;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700}' +
      '.crozzo-int-badge.in{background:#05966933;color:#10b981}.crozzo-int-badge.out{background:#dc262633;color:#f87171}';
    document.head.appendChild(el);
  }

  async function loadIntegracionConfig() {
    var id = 'int_' + businessId();
    var r = await rest('crozzo_integracion_config', 'id=eq.' + encodeURIComponent(id) + '&select=payload');
    if (r.ok && Array.isArray(r.data) && r.data[0]) state.intConfig = r.data[0].payload || {};
    else {
      try { state.intConfig = JSON.parse(localStorage.getItem('crozzo_int_config') || '{}') || {}; } catch (_) { state.intConfig = {}; }
    }
  }

  async function saveIntegracionConfig() {
    var id = 'int_' + businessId();
    var body = { id: id, business_id: businessId(), payload: state.intConfig, updated_at: new Date().toISOString() };
    try { localStorage.setItem('crozzo_int_config', JSON.stringify(state.intConfig)); } catch (_) {}
    if (!cloudReady()) return;
    await rest('crozzo_integracion_config', '', { method: 'POST', body: body, prefer: 'resolution=merge-duplicates,return=minimal' });
  }

  async function loadEmpleados() {
    var q = bidFilter();
    q = (q ? q + '&' : '') + 'order=id.asc&select=*';
    var r = await rest('crozzo_empleados', q);
    if (r.ok && Array.isArray(r.data)) state.empleados = r.data.filter(function (e) { return e.activo !== false; });
    else {
      try { state.empleados = JSON.parse(localStorage.getItem(LS_RRHH + '_emps') || '[]'); } catch (_) { state.empleados = []; }
    }
  }

  async function loadMarcacionesHoy() {
    var hoy = tkey();
    var q = bidFilter();
    q = (q ? q + '&' : '') + 'fecha=eq.' + hoy + '&order=timestamp.asc&select=*';
    var r = await rest('crozzo_marcaciones', q);
    var list = r.ok && Array.isArray(r.data) ? r.data.slice() : [];
    try {
      var all = JSON.parse(localStorage.getItem(LS_RRHH + '_recs') || '[]');
      all.filter(function (x) { return x && x.fecha === hoy; }).forEach(function (loc) {
        if (!list.some(function (m) { return m.id === loc.id || (m.timestamp === loc.timestamp && String(m.empleado_id) === String(loc.empleado_id)); })) {
          list.push(loc);
        }
      });
    } catch (_) {}
    list.sort(function (a, b) { return (a.timestamp || 0) - (b.timestamp || 0); });
    state.marcaciones = list;
  }

  /** Asegura ID en crozzo_empleados antes de marcar (evita FK rota con IDs locales). */
  async function ensureEmpleadoEnNube(emp) {
    if (!emp) return null;
    var id = emp.id;
    if (id && !String(id).startsWith('local_') && Number(id) > 0) return id;
    if (!cloudReady()) return id || null;
    if (emp.pin) {
      var q = bidFilter();
      q = (q ? q + '&' : '') + 'pin=eq.' + encodeURIComponent(String(emp.pin)) + '&select=id&limit=1';
      var found = await rest('crozzo_empleados', q);
      if (found.ok && found.data && found.data[0]) {
        emp.id = found.data[0].id;
        return emp.id;
      }
    }
    var body = {
      business_id: businessId(),
      name: emp.name || emp.nombre,
      full_name: emp.full_name || emp.name || emp.nombre,
      pin: String(emp.pin || ''),
      cargo: emp.cargo || '',
      activo: true
    };
    if (!body.pin) return null;
    var r = await rest('crozzo_empleados', '', { method: 'POST', body: body, prefer: 'return=representation' });
    if (r.ok && Array.isArray(r.data) && r.data[0]) {
      emp.id = r.data[0].id;
      await loadEmpleados();
      return r.data[0].id;
    }
    return null;
  }

  async function syncPendingMarcaciones() {
    if (!cloudReady()) return 0;
    var all = [];
    try {
      all = JSON.parse(localStorage.getItem(LS_RRHH + '_recs') || '[]');
    } catch (_) {
      return 0;
    }
    var pending = all.filter(function (x) { return x && x._pending; });
    if (!pending.length) return 0;
    var synced = 0;
    for (var i = 0; i < pending.length; i++) {
      var rec = pending[i];
      var empId = rec.empleado_id;
      if (!empId || String(empId).startsWith('local_') || !Number(empId)) {
        var emp = state.empleados.find(function (e) { return String(e.pin) === String(rec.pin); });
        if (!emp && rec.nombre) {
          emp = state.empleados.find(function (e) { return String(e.name) === String(rec.nombre); });
        }
        if (!emp) {
          emp = { name: rec.nombre, pin: rec.pin, cargo: rec.cargo };
        }
        empId = await ensureEmpleadoEnNube(emp);
      }
      if (!empId) continue;
      var body = {
        business_id: rec.business_id || businessId(),
        empleado_id: empId,
        nombre: rec.nombre,
        cargo: rec.cargo || '',
        tipo: rec.tipo,
        timestamp: rec.timestamp,
        fecha: rec.fecha
      };
      if (rec.foto_url) body.foto_url = rec.foto_url;
      var r = await rest('crozzo_marcaciones', '', { method: 'POST', body: body, prefer: 'return=minimal' });
      if (r.ok) {
        rec._pending = false;
        synced++;
      }
    }
    try {
      localStorage.setItem(LS_RRHH + '_recs', JSON.stringify(all.filter(function (x) { return x && x._pending; })));
    } catch (_) {}
    if (synced) await loadMarcacionesHoy();
    return synced;
  }

  function mkPedidoId(tab, item) {
    return (tab + '_' + item).replace(/[\s()\/,\.½]/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
  }

  function renderPedidosPanel(tab) {
    var html = '';
    (PEDIDOS_CATALOG[tab] || []).forEach(function (sec) {
      html += '<div class="crozzo-int-sec"><h4>' + esc(sec.sec) + '</h4>';
      sec.items.forEach(function (item) {
        var id = mkPedidoId(tab, item);
        html += '<div class="crozzo-int-row"><span>' + esc(item) + '</span><input type="text" id="pi_' + id + '" placeholder="Cant." inputmode="decimal" /></div>';
      });
      html += '</div>';
    });
    for (var i = 1; i <= 5; i++) {
      html += '<div class="crozzo-int-row"><input type="text" id="pi_' + tab + '_ex' + i + 'n" placeholder="Adicional ' + i + '" /><input type="text" id="pi_' + tab + '_ex' + i + 'q" placeholder="Cant." /></div>';
    }
    return html;
  }

  function collectPedidoItems(tab) {
    var items = [];
    (PEDIDOS_CATALOG[tab] || []).forEach(function (sec) {
      sec.items.forEach(function (item) {
        var id = mkPedidoId(tab, item);
        var el = document.getElementById('pi_' + id);
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

  async function sendPedidoInterno() {
    var tab = state.pedidosTab;
    var resp = (document.getElementById('pi-resp') || {}).value || '';
    resp = String(resp).trim();
    if (!resp) { toast('Escribe el responsable', 'error'); return; }
    var items = collectPedidoItems(tab);
    if (!items.length) { toast('No hay cantidades diligenciadas', 'error'); return; }
    var fecha = (document.getElementById('pi-fecha') || {}).value || tkey();
    var obs = (document.getElementById('pi-obs') || {}).value || '';
    var body = {
      business_id: businessId(),
      responsable: resp,
      fecha_pedido: fecha,
      area: tab,
      items: items,
      observaciones: obs,
      telegram_ok: false
    };
    if (cloudReady()) {
      var r = await rest('crozzo_pedidos_internos', '', { method: 'POST', body: body, prefer: 'return=representation' });
      if (!r.ok) toast('Error guardando en nube — revisa SQL integración', 'error');
    }
    try {
      var local = JSON.parse(localStorage.getItem(LS_PEDIDOS) || '[]');
      local.unshift(Object.assign({ id: Date.now(), created_at: new Date().toISOString() }, body));
      localStorage.setItem(LS_PEDIDOS, JSON.stringify(local.slice(0, 200)));
    } catch (_) {}
    var tg = state.intConfig.telegram || {};
    if (tg.botToken && tg.chatId) {
      var lines = ['📋 PEDIDO — ' + (TAB_LABELS[tab] || tab).toUpperCase(), '👤 ' + resp, ''];
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
        body.telegram_ok = true;
        toast('Pedido guardado y enviado a Telegram', 'success');
      } catch (_) {
        toast('Pedido guardado (Telegram falló)', 'warning');
      }
    } else {
      toast('Pedido guardado. Configura Telegram en Control de acceso → Config.', 'success');
    }
  }

  function glsTipo(empId) {
    var rs = state.marcaciones.filter(function (x) { return String(x.empleado_id) === String(empId); });
    return rs.length ? rs[rs.length - 1].tipo : null;
  }

  async function guardarMarcacion(emp, tipo) {
    var rec = {
      business_id: businessId(),
      empleado_id: emp.id,
      nombre: emp.name,
      cargo: emp.cargo || '',
      tipo: tipo,
      timestamp: Date.now(),
      fecha: tkey()
    };
    var r = await rest('crozzo_marcaciones', '', { method: 'POST', body: rec, prefer: 'return=representation' });
    if (r.ok && Array.isArray(r.data) && r.data[0]) state.marcaciones.push(r.data[0]);
    else {
      rec.id = 'local_' + Date.now();
      state.marcaciones.push(rec);
      try {
        var all = JSON.parse(localStorage.getItem(LS_RRHH + '_recs') || '[]');
        all.push(rec);
        localStorage.setItem(LS_RRHH + '_recs', JSON.stringify(all));
      } catch (_) {}
    }
    toast((tipo === 'entrada' ? 'Entrada' : 'Salida') + ' registrada — ' + emp.name, 'success');
    renderAccesoInner();
  }

  function confirmarMarcacion() {
    var pin = state.pinBuf;
    var emp = state.empleados.find(function (e) { return String(e.pin) === pin; });
    if (!emp) { toast('PIN incorrecto', 'error'); state.pinBuf = ''; renderAccesoInner(); return; }
    var ult = glsTipo(emp.id);
    var tipo = ult === 'entrada' ? 'salida' : 'entrada';
    state.pinBuf = '';
    guardarMarcacion(emp, tipo);
  }

  function nominaClave() {
    var d = new Date();
    var q = d.getDate() <= 15 ? 1 : 2;
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-Q' + q;
  }

  async function loadNomina() {
    var clave = nominaClave();
    var id = 'nom_' + businessId() + '_' + clave;
    var r = await rest('crozzo_nomina_periodos', 'id=eq.' + encodeURIComponent(id) + '&select=filas');
    if (r.ok && Array.isArray(r.data) && r.data[0]) state.nomina = r.data[0].filas || {};
    else {
      try { state.nomina = (JSON.parse(localStorage.getItem(LS_NOMINA) || '{}') || {})[clave] || {}; } catch (_) { state.nomina = {}; }
    }
    state._nominaClave = clave;
    state._nominaId = id;
  }

  async function saveNominaCell(empId, field, val) {
    if (!state._nominaClave) return;
    if (!state.nomina[empId]) state.nomina[empId] = { nocturnas: 0, festivos: 0, domingos: 0, extras: 0, observacion: '' };
    state.nomina[empId][field] = val;
    try {
      var all = JSON.parse(localStorage.getItem(LS_NOMINA) || '{}');
      all[state._nominaClave] = state.nomina;
      localStorage.setItem(LS_NOMINA, JSON.stringify(all));
    } catch (_) {}
    if (!cloudReady()) return;
    var d = new Date();
    var body = {
      id: state._nominaId,
      business_id: businessId(),
      clave: state._nominaClave,
      anio: d.getFullYear(),
      mes: d.getMonth() + 1,
      quincena: d.getDate() <= 15 ? 1 : 2,
      filas: state.nomina,
      updated_at: new Date().toISOString()
    };
    await rest('crozzo_nomina_periodos', '', { method: 'POST', body: body, prefer: 'resolution=merge-duplicates,return=minimal' });
  }

  function renderPedidosInternos() {
    injectStyles();
    var cloud = cloudReady()
      ? '<span class="crozzo-retail-pill" style="color:var(--success)">Nube OK</span>'
      : '<span class="crozzo-retail-pill" style="color:var(--warning)">Solo local — activa Cloud</span>';
    var tabs = ['cocina', 'bar', 'panaderia', 'desechables']
      .map(function (t) {
        return '<button type="button" class="' + (state.pedidosTab === t ? 'active' : '') + '" data-pi-tab="' + t + '">' + esc(TAB_LABELS[t]) + '</button>';
      })
      .join('');
    return (
      '<section class="content-section crozzo-int">' +
      '<div class="card"><div class="card-header"><div><h2 class="card-title">Pedidos internos</h2>' +
      '<p class="page-subtitle">Queso y Café · pedidos cocina, bar, panadería y desechables (integrado al POS).</p></div>' + cloud + '</div>' +
      '<div style="text-align:center;padding:8px 0 16px;border-bottom:1px solid var(--border);margin-bottom:16px">' +
      '<div style="font-size:11px;text-transform:uppercase;letter-spacing:.12em;opacity:.65">Sistema de toma de pedidos</div></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">' +
      '<div class="form-group"><label>Responsable</label><input id="pi-resp" class="form-input" placeholder="Nombre" /></div>' +
      '<div class="form-group"><label>Fecha</label><input id="pi-fecha" type="date" class="form-input" value="' + tkey() + '" /></div></div>' +
      '<div class="crozzo-int-tabs">' + tabs + '</div>' +
      '<div id="pi-panel">' + renderPedidosPanel(state.pedidosTab) + '</div>' +
      '<div class="form-group" style="margin-top:12px"><label>Observaciones</label><textarea id="pi-obs" class="form-input" rows="2"></textarea></div>' +
      '<button type="button" class="btn btn-primary" style="margin-top:12px;width:100%" id="pi-send">Enviar pedido</button></div></section>'
    );
  }

  function bindPedidos() {
    document.querySelectorAll('[data-pi-tab]').forEach(function (btn) {
      btn.onclick = function () {
        state.pedidosTab = btn.getAttribute('data-pi-tab');
        var p = document.getElementById('pi-panel');
        if (p) p.innerHTML = renderPedidosPanel(state.pedidosTab);
        document.querySelectorAll('[data-pi-tab]').forEach(function (b) {
          b.classList.toggle('active', b.getAttribute('data-pi-tab') === state.pedidosTab);
        });
      };
    });
    var send = document.getElementById('pi-send');
    if (send) send.onclick = function () { sendPedidoInterno(); };
  }

  function renderAccesoInner() {
    var root = document.getElementById('crozzo-int-acceso-root');
    if (!root) return;
    if (state.accesoTab === 'kiosk') {
      var grid = state.empleados
        .map(function (e) {
          var st = glsTipo(e.id);
          var badge = st ? '<span class="crozzo-int-badge ' + (st === 'entrada' ? 'in' : 'out') + '">' + st + '</span>' : '';
          return '<div class="crozzo-int-emp" data-emp-pin="' + esc(e.pin) + '"><strong>' + esc(e.name) + '</strong><div style="font-size:11px;opacity:0.7">' + esc(e.cargo || '') + '</div>' + badge + '</div>';
        })
        .join('');
      root.innerHTML =
        '<p style="text-align:center;opacity:0.8;font-size:13px">Toque su nombre o ingrese PIN</p>' +
        '<div class="crozzo-int-grid" style="margin-bottom:16px">' + (grid || '<p>Sin empleados. Importe desde Admin.</p>') + '</div>' +
        '<div style="text-align:center;font-size:22px;letter-spacing:6px;margin:8px 0">' + (state.pinBuf ? '•'.repeat(state.pinBuf.length) : '—') + '</div>' +
        '<div class="crozzo-int-pin">' +
        [1, 2, 3, 4, 5, 6, 7, 8, 9, '⌫', 0, '✓'].map(function (k) {
          return '<button type="button" data-pin-k="' + k + '">' + k + '</button>';
        }).join('') +
        '</div>';
      root.querySelectorAll('[data-emp-pin]').forEach(function (el) {
        el.onclick = function () {
          state.pinBuf = el.getAttribute('data-emp-pin') || '';
          confirmarMarcacion();
        };
      });
      root.querySelectorAll('[data-pin-k]').forEach(function (btn) {
        btn.onclick = function () {
          var k = btn.getAttribute('data-pin-k');
          if (k === '⌫') state.pinBuf = state.pinBuf.slice(0, -1);
          else if (k === '✓') confirmarMarcacion();
          else state.pinBuf += String(k);
          renderAccesoInner();
        };
      });
      return;
    }
    if (state.accesoTab === 'hoy') {
      var rows = state.marcaciones
        .map(function (r) {
          var t = new Date(r.timestamp);
          var hm = t.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
          return '<tr><td>' + esc(r.nombre) + '</td><td>' + esc(r.cargo || '') + '</td><td><span class="crozzo-int-badge ' + (r.tipo === 'entrada' ? 'in' : 'out') + '">' + r.tipo + '</span></td><td>' + hm + '</td></tr>';
        })
        .join('');
      root.innerHTML =
        '<table class="crozzo-int-table"><thead><tr><th>Empleado</th><th>Cargo</th><th>Tipo</th><th>Hora</th></tr></thead><tbody>' +
        (rows || '<tr><td colspan="4">Sin marcaciones hoy</td></tr>') +
        '</tbody></table>';
      return;
    }
    if (state.accesoTab === 'empleados') {
      root.innerHTML =
        '<p style="font-size:12px;opacity:0.75;margin-bottom:10px">Alta rápida. Para planilla completa use Nómina.</p>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr 100px;gap:8px;margin-bottom:12px">' +
        '<input id="ne-name" class="form-input" placeholder="Nombre corto" />' +
        '<input id="ne-cargo" class="form-input" placeholder="Cargo" />' +
        '<input id="ne-pin" class="form-input" placeholder="PIN" />' +
        '</div><button type="button" class="btn btn-primary btn-sm" id="ne-add">Agregar empleado</button>' +
        '<table class="crozzo-int-table" style="margin-top:16px"><thead><tr><th>Nombre</th><th>Cargo</th><th>PIN</th></tr></thead><tbody>' +
        state.empleados.map(function (e) {
          return '<tr><td>' + esc(e.name) + '</td><td>' + esc(e.cargo || '') + '</td><td>' + esc(e.pin) + '</td></tr>';
        }).join('') +
        '</tbody></table>';
      var add = document.getElementById('ne-add');
      if (add) {
        add.onclick = async function () {
          var name = String((document.getElementById('ne-name') || {}).value || '').trim();
          var cargo = String((document.getElementById('ne-cargo') || {}).value || '').trim();
          var pin = String((document.getElementById('ne-pin') || {}).value || '').trim();
          if (!name || !pin) { toast('Nombre y PIN requeridos', 'error'); return; }
          var body = { business_id: businessId(), name: name, cargo: cargo, pin: pin, activo: true };
          var r = await rest('crozzo_empleados', '', { method: 'POST', body: body, prefer: 'return=representation' });
          if (r.ok && Array.isArray(r.data) && r.data[0]) state.empleados.push(r.data[0]);
          else state.empleados.push(Object.assign({ id: Date.now() }, body));
          try { localStorage.setItem(LS_RRHH + '_emps', JSON.stringify(state.empleados)); } catch (_) {}
          renderAccesoInner();
          toast('Empleado agregado', 'success');
        };
      }
      return;
    }
    if (state.accesoTab === 'config') {
      var tg = state.intConfig.telegram || {};
      root.innerHTML =
        '<div class="form-group"><label>Telegram bot token (pedidos internos)</label><input id="ic-tg-token" class="form-input" value="' + esc(tg.botToken || '') + '" placeholder="123456:ABC..." /></div>' +
        '<div class="form-group"><label>Telegram chat id</label><input id="ic-tg-chat" class="form-input" value="' + esc(tg.chatId || '') + '" /></div>' +
        '<div class="form-group"><label>Clave admin kiosk (opcional)</label><input id="ic-admin-pw" class="form-input" type="password" value="' + esc(state.intConfig.adminKioskPw || '') + '" /></div>' +
        '<button type="button" class="btn btn-primary" id="ic-save">Guardar configuración</button>' +
        '<p style="font-size:11px;opacity:0.65;margin-top:12px">Ejecuta <code>docs/SUPABASE-SQL-INTEGRACION.sql</code> en tu proyecto Supabase del POS.</p>';
      document.getElementById('ic-save').onclick = async function () {
        state.intConfig.telegram = {
          botToken: String((document.getElementById('ic-tg-token') || {}).value || '').trim(),
          chatId: String((document.getElementById('ic-tg-chat') || {}).value || '').trim()
        };
        state.intConfig.adminKioskPw = String((document.getElementById('ic-admin-pw') || {}).value || '').trim();
        await saveIntegracionConfig();
        toast('Configuración guardada', 'success');
      };
    }
  }

  function renderControlAcceso() {
    injectStyles();
    var cloud = cloudReady() ? 'Nube' : 'Local';
    return (
      '<section class="content-section crozzo-int">' +
      '<div class="card"><div class="card-header"><div><h2 class="card-title">Control de acceso</h2>' +
      '<p class="page-subtitle">Marcación entrada/salida · ' + esc(cloud) + '</p></div></div>' +
      '<div class="crozzo-int-tabs">' +
      ['kiosk', 'hoy', 'empleados', 'config'].map(function (t) {
        var labels = { kiosk: 'Kiosk', hoy: 'Hoy', empleados: 'Empleados', config: 'Config' };
        return '<button type="button" class="' + (state.accesoTab === t ? 'active' : '') + '" data-acc-tab="' + t + '">' + labels[t] + '</button>';
      }).join('') +
      '</div><div id="crozzo-int-acceso-root"></div></div></section>'
    );
  }

  function bindAcceso() {
    document.querySelectorAll('[data-acc-tab]').forEach(function (btn) {
      btn.onclick = function () {
        state.accesoTab = btn.getAttribute('data-acc-tab');
        document.querySelectorAll('[data-acc-tab]').forEach(function (b) {
          b.classList.toggle('active', b.getAttribute('data-acc-tab') === state.accesoTab);
        });
        renderAccesoInner();
      };
    });
    renderAccesoInner();
  }

  function renderCentroComprasDelegado(start) {
    if (global.CrozzoCentroCompras && global.CrozzoCentroCompras.render) {
      return global.CrozzoCentroCompras.render(start);
    }
    return '<div class="card"><p>Cargue CrozzoCentroCompras.js</p></div>';
  }

  function initCentroComprasDelegado(start) {
    if (global.CrozzoCentroCompras && global.CrozzoCentroCompras.init) {
      return global.CrozzoCentroCompras.init(start);
    }
  }

  function renderNominaPlanilla() {
    injectStyles();
    var clave = state._nominaClave || nominaClave();
    var rows = state.empleados
      .map(function (e) {
        var f = state.nomina[e.id] || { nocturnas: 0, festivos: 0, domingos: 0, extras: 0, observacion: '' };
        return (
          '<tr><td>' + esc(e.name) + '</td><td>' + esc(e.cargo || '') + '</td>' +
          '<td><input type="number" min="0" step="0.5" class="form-input" style="width:70px" data-nom="' + e.id + '" data-f="nocturnas" value="' + f.nocturnas + '" /></td>' +
          '<td><input type="number" min="0" step="0.5" class="form-input" style="width:70px" data-nom="' + e.id + '" data-f="festivos" value="' + f.festivos + '" /></td>' +
          '<td><input type="number" min="0" step="0.5" class="form-input" style="width:70px" data-nom="' + e.id + '" data-f="domingos" value="' + f.domingos + '" /></td>' +
          '<td><input type="number" min="0" step="0.5" class="form-input" style="width:70px" data-nom="' + e.id + '" data-f="extras" value="' + f.extras + '" /></td>' +
          '<td><input type="text" class="form-input" data-nom="' + e.id + '" data-f="observacion" value="' + esc(f.observacion || '') + '" /></td></tr>'
        );
      })
      .join('');
    return (
      '<section class="content-section crozzo-int">' +
      '<div class="card"><div class="card-header"><div><h2 class="card-title">Nómina / planilla</h2>' +
      '<p class="page-subtitle">Quincena <strong>' + esc(clave) + '</strong> — columnas alineadas con planilla 2026 (horas nocturnas, festivos, dominicales, extras).</p></div></div>' +
      '<table class="crozzo-int-table"><thead><tr><th>Empleado</th><th>Cargo</th><th>Noct.</th><th>Fest.</th><th>Dom.</th><th>Extras</th><th>Obs.</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="7">Sin empleados — créelos en Control de acceso</td></tr>') +
      '</tbody></table></div></section>'
    );
  }

  function bindNomina() {
    document.querySelectorAll('[data-nom]').forEach(function (inp) {
      inp.onchange = function () {
        var empId = inp.getAttribute('data-nom');
        var field = inp.getAttribute('data-f');
        var val = inp.type === 'number' ? Number(inp.value) : inp.value;
        saveNominaCell(empId, field, val);
      };
    });
  }

  async function seedEmpleadosDemo() {
    if (state.empleados.length) return;
    var seeds = [
      { name: 'Lorena Fonseca', pin: '1001', cargo: 'Aux. Cocina' },
      { name: 'Jorge Trejos', pin: '1005', cargo: 'Barista' },
      { name: 'Laura Herrera', pin: '1008', cargo: 'Cajera' }
    ];
    for (var i = 0; i < seeds.length; i++) {
      var body = Object.assign({ business_id: businessId(), activo: true }, seeds[i]);
      await rest('crozzo_empleados', '', { method: 'POST', body: body, prefer: 'return=minimal' });
    }
    await loadEmpleados();
  }

  global.CrozzoIntApi = {
    state: state,
    esc: esc,
    toast: toast,
    businessId: businessId,
    sbPair: sbPair,
    cloudReady: cloudReady,
    rest: rest,
    bidFilter: bidFilter,
    tkey: tkey,
    injectStyles: injectStyles,
    loadIntegracionConfig: loadIntegracionConfig,
    saveIntegracionConfig: saveIntegracionConfig,
    loadEmpleados: loadEmpleados,
    loadMarcacionesHoy: loadMarcacionesHoy,
    ensureEmpleadoEnNube: ensureEmpleadoEnNube,
    syncPendingMarcaciones: syncPendingMarcaciones,
    cloudStatusLabel: cloudStatusLabel,
    LS_RRHH: LS_RRHH,
    LS_PEDIDOS: LS_PEDIDOS
  };

  global.CrozzoModulosIntegrados = {
    renderPedidosInternos: function (opts) {
      if (global.CrozzoModulosIntegradosPedidos && global.CrozzoModulosIntegradosPedidos.render) {
        return global.CrozzoModulosIntegradosPedidos.render(opts);
      }
      return renderPedidosInternos();
    },
    initPedidosInternos: async function () {
      if (global.CrozzoModulosIntegradosPedidos && global.CrozzoModulosIntegradosPedidos.init) {
        return global.CrozzoModulosIntegradosPedidos.init();
      }
      await loadIntegracionConfig();
      bindPedidos();
    },
    renderControlAcceso: function () {
      if (global.CrozzoModulosIntegradosAcceso && global.CrozzoModulosIntegradosAcceso.render) {
        return global.CrozzoModulosIntegradosAcceso.render();
      }
      return renderControlAcceso();
    },
    initControlAcceso: async function () {
      if (global.CrozzoModulosIntegradosAcceso && global.CrozzoModulosIntegradosAcceso.init) {
        return global.CrozzoModulosIntegradosAcceso.init();
      }
      await loadIntegracionConfig();
      await loadEmpleados();
      if (!state.empleados.length && cloudReady()) await seedEmpleadosDemo();
      await loadMarcacionesHoy();
      bindAcceso();
    },
    renderCentroCompras: renderCentroComprasDelegado,
    initCentroCompras: initCentroComprasDelegado,
    renderNominaPlanilla: renderNominaPlanilla,
    initNominaPlanilla: async function () {
      await loadEmpleados();
      await loadNomina();
      bindNomina();
    }
  };

  global.renderPedidosInternos = function (opts) {
    return global.CrozzoModulosIntegrados.renderPedidosInternos(opts);
  };
  global.initPedidosInternos = function () {
    return global.CrozzoModulosIntegrados.initPedidosInternos();
  };
  global.renderControlAcceso = function () {
    return global.CrozzoModulosIntegrados.renderControlAcceso();
  };
  global.initControlAcceso = function () {
    return global.CrozzoModulosIntegrados.initControlAcceso();
  };
  global.renderCentroCompras = function (start) {
    return global.CrozzoModulosIntegrados.renderCentroCompras(start);
  };
  global.initCentroCompras = function (start) {
    return global.CrozzoModulosIntegrados.initCentroCompras(start);
  };
  global.renderOperacionesQyc = function () {
    return global.renderCentroCompras('recepcion');
  };
  global.initOperacionesQyc = function () {
    return global.initCentroCompras('recepcion');
  };
  global.renderNominaPlanilla = function () {
    return global.CrozzoModulosIntegrados.renderNominaPlanilla();
  };
  global.initNominaPlanilla = function () {
    return global.CrozzoModulosIntegrados.initNominaPlanilla();
  };
})(typeof window !== 'undefined' ? window : globalThis);
