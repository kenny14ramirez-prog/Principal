/**
 * Crozzo POS — Sistema de costos (Fase 1: flujos, conexiones, hub)
 * Matriz precios · Recetas · Inventario · Compras · Oficina · Cola planilla
 */
(function (global) {
  'use strict';

  var LS_FEED = 'crozzo_costos_feed_v1';
  var LS_MATRIZ = 'crozzo_costos_matriz_v1';
  var LS_RESUMEN = 'crozzo_costos_resumen_v1';
  var LS_DEMO_RECETA = 'crozzo_costos_demo_receta_v1';
  var LS_EVENT_LOG = 'crozzo_costos_event_log_v1';

  var FLOWS = {
    F1: {
      id: 'F1',
      key: 'matriz',
      title: 'Matriz de precios',
      subtitle: 'Necesidades del negocio → decisión socios/gerentes → vigencia POS',
      icon: '💰',
      roles: ['socio', 'gerente', 'admin'],
      status: 'conectado',
      navigate: 'costos-matriz',
      sources: [],
      targets: ['F2', 'POS'],
      tables: ['crozzo_matriz_precios', 'crozzo_matriz_precios_items', 'crozzo_matriz_programaciones'],
    },
    F2: {
      id: 'F2',
      key: 'recetas',
      title: 'Recetas y cortes',
      subtitle: 'Actualiza matriz y materia prima en proveedores',
      icon: '📋',
      roles: ['chef', 'gerente', 'jefe-compras'],
      status: 'conectado',
      navigate: 'compras-cortes',
      sources: ['Catalogo MP', 'Procesos'],
      targets: ['F1', 'F3', 'proveedores'],
      tables: ['receta_ingredientes', 'productos', 'materias_primas', 'cortes_recepcion'],
    },
    F3: {
      id: 'F3',
      key: 'inventario',
      title: 'Inventario continuo',
      subtitle: 'Inicial + entradas − salidas = teórico · conteo valida',
      icon: '📦',
      roles: ['gerente', 'chef', 'admin'],
      status: 'conectado',
      navigate: 'costos-inventario',
      sources: ['F2 procesos', 'F4 recepciones', 'POS ventas'],
      targets: ['F6', 'auditoria'],
      tables: ['crozzo_inventario_movimientos', 'crozzo_inventario_cierres', 'conteos_inventario'],
    },
    F4: {
      id: 'F4',
      key: 'compras-dash',
      title: 'Dashboard compras',
      subtitle: 'Facturas de entrada por categoría de proveedor',
      icon: '📊',
      roles: ['jefe-compras', 'gerente', 'socio'],
      status: 'conectado',
      navigate: 'compras-dashboard',
      sources: ['recepciones', 'facturas'],
      targets: ['F3', 'F5', 'F6'],
      tables: ['recepciones', 'facturas', 'proveedores'],
    },
    F5: {
      id: 'F5',
      key: 'oficina',
      title: 'Oficina y pagos',
      subtitle: 'Efectivo · tarjeta · transferencia (pendiente / en proceso / pagada)',
      icon: '🏛️',
      roles: ['admin', 'gerente', 'jefe-compras'],
      status: 'conectado',
      navigate: 'compras-oficina',
      sources: ['F4 facturas'],
      targets: ['F6'],
      tables: ['facturas'],
    },
    F6: {
      id: 'F6',
      key: 'planilla-feed',
      title: 'Cola → Planilla',
      subtitle: 'Ventas, compras y egresos como propuestas; admin elige qué ingresar',
      icon: '🧮',
      roles: ['admin', 'contador', 'socio'],
      status: 'conectado',
      navigate: 'costos-planilla-feed',
      sources: ['F3', 'F4', 'F5', 'POS ventas'],
      targets: ['planilla-2026'],
      tables: ['crozzo_planilla_feed'],
    },
  };

  var CONNECTIONS = [
    { from: 'F2', to: 'F1', event: 'crozzo-costos:receta-actualizada', label: 'Receta/corte cambia → recalcular matriz' },
    { from: 'proveedores', to: 'F1', event: 'crozzo-costos:precio-mp-cambiado', label: 'Precio MP proveedor → matriz' },
    { from: 'F1', to: 'POS', event: 'crozzo-costos:precios-vigentes', label: 'Fecha programada → todos los POS' },
    { from: 'F4', to: 'F3', event: 'crozzo-costos:recepcion-registrada', label: 'Recepción → entrada inventario' },
    { from: 'F4', to: 'F5', event: 'crozzo-costos:recepcion-registrada', label: 'Recepción → factura oficina' },
    { from: 'F2', to: 'F3', event: 'crozzo-costos:proceso-cerrado', label: 'Proceso cerrado → entrada transformada' },
    { from: 'POS', to: 'F3', event: 'crozzo-costos:venta-registrada', label: 'Venta → salida inventario' },
    { from: 'POS', to: 'F6', event: 'crozzo-costos:feed-planilla', label: 'Venta diaria → cola planilla' },
    { from: 'F5', to: 'F6', event: 'crozzo-costos:factura-pagada', label: 'Pago proveedor → cola planilla' },
    { from: 'F3', to: 'F6', event: 'crozzo-costos:inventario-cerrado', label: 'Cierre inventario → cola/auditoría' },
  ];

  var hub = { view: 'map', flowKey: null, bound: false, seed: null, seedLoading: false, recetaSlug: null };

  function engine() {
    return global.CrozzoCostosEngine || null;
  }

  function engFmt(n) {
    var e = engine();
    return e ? e.fmtCop(n) : String(n);
  }

  function engPct(n) {
    var e = engine();
    return e ? e.fmtPct(n) : String(n);
  }

  function loadSeed(cb) {
    if (hub.seed && hub.seed.version >= 4) {
      if (cb) cb(hub.seed);
      return Promise.resolve(hub.seed);
    }
    if (hub.seedLoading) {
      return new Promise(function (resolve) {
        var t = setInterval(function () {
          if (hub.seed && hub.seed.version >= 4) {
            clearInterval(t);
            resolve(hub.seed);
            if (cb) cb(hub.seed);
          }
        }, 80);
      });
    }
    hub.seedLoading = true;
    var C = global.CrozzoCatalogoMp;
    if (!C || !C.ensureReady) {
      hub.seed = { version: 4, precios: {}, resumen: [], demoRecipe: { lineas: [] }, stats: {} };
      hub.seedLoading = false;
      if (cb) cb(hub.seed);
      return Promise.resolve(hub.seed);
    }
    return C.ensureReady()
      .then(function () {
        hub.seed = C.buildSeedForCostos();
        hub.seedLoading = false;
        if (cb) cb(hub.seed);
        return hub.seed;
      })
      .catch(function () {
        hub.seed = { version: 4, precios: {}, resumen: [], demoRecipe: { lineas: [] }, stats: {} };
        hub.seedLoading = false;
        if (cb) cb(hub.seed);
        return hub.seed;
      });
  }

  function slugProducto(nombre) {
    return String(nombre || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '_')
      .slice(0, 80);
  }

  function saveResumenEdit(slug, patch) {
    var C = global.CrozzoCatalogoMp;
    if (C && C.updateMenuPlato) C.updateMenuPlato(slug, patch);
  }

  function loadRecetaLineas(slug, seed) {
    var C = global.CrozzoCatalogoMp;
    if (C && C.getRecetaPlato && slug) {
      var r = C.getRecetaPlato(slug);
      if (r && Array.isArray(r.lineas)) return r.lineas.slice();
      if (C.ensureRecetaForMenu) {
        var row = mergeResumenList(seed).find(function (x) {
          return x.slug === slug;
        });
        if (row) C.ensureRecetaForMenu(slug, row.producto);
      }
    }
    return loadDemoRecetaLineas(seed);
  }

  function getActiveRecetaSlug(seed) {
    if (hub.recetaSlug) return hub.recetaSlug;
    if (seed && seed.demoRecipe && seed.demoRecipe.slug) return seed.demoRecipe.slug;
    var list = mergeResumenList(seed || hub.seed || { resumen: [] });
    return list[0] ? list[0].slug : '';
  }

  function findPosProductForReceta(receta) {
    if (!receta) return null;
    var prods = typeof global.products !== 'undefined' && Array.isArray(global.products) ? global.products : [];
    var slug = String(receta.slug || '').trim();
    var nombre = String(receta.producto || '').trim().toLowerCase();
    for (var i = 0; i < prods.length; i++) {
      var p = prods[i];
      if (slug && String(p.sku || '').toUpperCase() === slug.toUpperCase()) return p;
      if (nombre && String(p.nombre || '').trim().toLowerCase() === nombre) return p;
    }
    for (var j = 0; j < prods.length; j++) {
      var q = prods[j];
      if (nombre && String(q.nombre || '').trim().toLowerCase().indexOf(nombre) >= 0) return q;
    }
    return null;
  }

  function posAreaLabelForProduct(prod) {
    if (!prod || !prod.areaComanda) return '';
    if (typeof global.getComandasConfig === 'function') {
      var areas = global.getComandasConfig().areas || [];
      var hit = areas.find(function (a) {
        return a.id === prod.areaComanda;
      });
      return hit ? hit.nombre || hit.id : prod.areaComanda;
    }
    return prod.areaComanda;
  }

  function renderMpOptionsHtml(selectedId) {
    var C = global.CrozzoCatalogoMp;
    var list = C && C.list ? C.list() : [];
    var html = '<option value="">— Materia prima —</option>';
    list.forEach(function (mp) {
      html +=
        '<option value="' +
        esc(mp.id) +
        '"' +
        (mp.id === selectedId ? ' selected' : '') +
        '>' +
        esc(mp.nombre) +
        '</option>';
    });
    return html;
  }

  function refreshRecetaPlatoPanel(root, seed) {
    if (!root) return;
    var panel = root.querySelector('[data-matriz-panel="demo"]');
    if (!panel) return;
    panel.innerHTML = renderDemoRecetaHtml(seed);
    initMatrizGerenciaPanel(root, seed);
  }

  function loadDemoRecetaLineas(seed) {
    var rv = reservorio();
    if (rv && rv.migrateLegacy) {
      var rd = rv.migrateLegacy().recetaDemo;
      if (rd && Array.isArray(rd.lineas) && rd.lineas.length) return rd.lineas.slice();
    }
    return seed && seed.demoRecipe && seed.demoRecipe.lineas ? seed.demoRecipe.lineas.slice() : [];
  }

  function saveDemoRecetaLineas(lineas, meta) {
    meta = meta || {};
    var C = global.CrozzoCatalogoMp;
    if (C && C.upsertRecetaPlato) {
      C.upsertRecetaPlato({
        slug: meta.slug || getActiveRecetaSlug(hub.seed),
        producto: meta.producto || meta.nombre,
        lineas: lineas,
        opts: meta.opts,
      });
    } else if (C && C.updateRecetaDemoLineas) {
      C.updateRecetaDemoLineas(lineas, meta);
    }
  }

  function buildPreciosStore() {
    var C = global.CrozzoCatalogoMp;
    if (C && C.buildPreciosStore) return C.buildPreciosStore();
    return { precios: {}, subRecetas: {} };
  }

  function mergeResumenList(seed) {
    return (seed.resumen || [])
      .filter(function (row) {
        var n = String(row.producto || '').trim();
        return n;
      })
      .map(function (row) {
        return {
          slug: row.slug || slugProducto(row.producto),
          producto: row.producto,
          costoMp: Number(row.costoMp),
          precioVenta: Number(row.precioVenta),
        };
      });
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function toast(msg, type) {
    try {
      if (typeof global.showToast === 'function') global.showToast(msg, type || 'info');
    } catch (_) {}
  }

  function safeJsonParse(raw, fb) {
    if (raw == null || (typeof raw === 'string' && !String(raw).trim())) return fb;
    try {
      var v = JSON.parse(raw);
      return v == null ? fb : v;
    } catch (_) {
      return fb;
    }
  }

  function reservorio() {
    return global.CrozzoReservorio || null;
  }

  function loadFeed() {
    var rv = reservorio();
    if (rv) {
      var fromRv = rv.listFeed(500);
      return Array.isArray(fromRv) ? fromRv : [];
    }
    try {
      var feed = safeJsonParse(localStorage.getItem(LS_FEED), []);
      return Array.isArray(feed) ? feed : [];
    } catch (_) {
      return [];
    }
  }

  function saveFeed(list) {
    var rv = reservorio();
    if (rv && typeof rv.migrateLegacy === 'function' && typeof rv.save === 'function') {
      try {
        var st = rv.migrateLegacy();
        st.planillaFeed = Array.isArray(list) ? list.slice(0, 500) : [];
        rv.save(st);
        return;
      } catch (_) {}
    }
    try {
      localStorage.setItem(LS_FEED, JSON.stringify(list.slice(0, 500)));
    } catch (_) {}
  }

  function loadEventLog() {
    try {
      var log = safeJsonParse(localStorage.getItem(LS_EVENT_LOG), []);
      return Array.isArray(log) ? log : [];
    } catch (_) {
      return [];
    }
  }

  function appendEventLog(entry) {
    try {
      var log = loadEventLog();
      if (!Array.isArray(log)) log = [];
      log.unshift(Object.assign({ ts: new Date().toISOString() }, entry));
      localStorage.setItem(LS_EVENT_LOG, JSON.stringify(log.slice(0, 200)));
    } catch (_) {}
  }

  function businessId() {
    try {
      if (typeof global.getBusinessId === 'function') return global.getBusinessId();
      if (global.config && global.config.businessId) return global.config.businessId;
    } catch (_) {}
    return 'default';
  }

  function cloudReady() {
    try {
      if (typeof global.crozzoShouldUseCloud === 'function') return global.crozzoShouldUseCloud();
      var raw = localStorage.getItem('crozzo_supabase_config');
      if (!raw) return false;
      var j = JSON.parse(raw);
      return !!(j.syncEnabled && j.url && String(j.key || j.anonKey || '').length > 20);
    } catch (_) {
      return false;
    }
  }

  function sbHeaders() {
    try {
      var raw = localStorage.getItem('crozzo_supabase_config');
      if (!raw) return null;
      var j = JSON.parse(raw);
      var k = String(j.key || j.anonKey || '').trim();
      if (!j.url || k.length < 20) return null;
      return {
        apikey: k,
        Authorization: 'Bearer ' + k,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      };
    } catch (_) {
      return null;
    }
  }

  function sbRest(table, query, opts) {
    opts = opts || {};
    var h = sbHeaders();
    if (!h) return Promise.resolve({ ok: false, reason: 'no-cloud' });
    var base = String(JSON.parse(localStorage.getItem('crozzo_supabase_config')).url).replace(/\/$/, '');
    var url = base + '/rest/v1/' + table + (query ? '?' + query : '');
    return fetch(url, {
      method: opts.method || 'GET',
      headers: Object.assign({}, h, opts.prefer ? { Prefer: opts.prefer } : {}),
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }).then(function (res) {
      if (!res.ok) return res.text().then(function (t) { return { ok: false, status: res.status, error: t }; });
      if (res.status === 204) return { ok: true, data: null };
      return res.json().then(function (data) { return { ok: true, data: data }; });
    }).catch(function (e) { return { ok: false, error: String(e) }; });
  }

  /** Bus de eventos del sistema de costos */
  function emit(eventName, detail) {
    detail = detail || {};
    try {
      appendEventLog({ event: eventName, detail: detail });
    } catch (_) {}
    try {
      document.dispatchEvent(new CustomEvent(eventName, { detail: detail, bubbles: true }));
    } catch (_) {}
    if (eventName === 'crozzo-costos:feed-planilla' || (detail && detail.enqueuePlanilla)) {
      if (detail && detail.enqueuePlanilla === false) return;
      enqueuePlanillaFeed(detail);
    }
  }

  function on(eventName, handler) {
    document.addEventListener(eventName, handler);
    return function () { document.removeEventListener(eventName, handler); };
  }

  function enqueuePlanillaFeed(detail) {
    detail = detail || {};
    if (reservorio() && detail.referencia_id) {
      var exists = loadFeed().some(function (f) {
        return f.referencia_id === detail.referencia_id && f.origen === detail.origen;
      });
      if (exists) return exists;
    }
    var item = {
      id: 'feed_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      business_id: businessId(),
      origen: detail.origen || 'manual',
      fecha: detail.fecha || new Date().toISOString().slice(0, 10),
      concepto: detail.concepto || 'Movimiento costos',
      monto: Number(detail.monto) || 0,
      tipo_movimiento: detail.tipo_movimiento || 'egreso',
      referencia_tipo: detail.referencia_tipo || null,
      referencia_id: detail.referencia_id || null,
      payload: detail.payload || {},
      estado: 'pendiente',
      created_at: new Date().toISOString(),
    };
    var list = loadFeed();
    if (!Array.isArray(list)) list = [];
    list.unshift(item);
    saveFeed(list);
    if (cloudReady()) {
      sbRest('crozzo_planilla_feed', '', {
        method: 'POST',
        body: Object.assign({}, item, { payload: item.payload }),
      }).catch(function () {});
    }
    return item;
  }

  function registerDefaultListeners() {
    if (hub._listenersRegistered) return;
    hub._listenersRegistered = true;
    on('crozzo-costos:receta-actualizada', function (ev) {
      var e = engine();
      var d = ev.detail || {};
      if (e && d.lineas) {
        var calc = e.calcularReceta(d.lineas, d.opts || {});
        emit('crozzo-costos:matriz-recalculada', { recipeId: d.recipeId, calc: calc, source: 'receta' });
      }
      console.info('[costos] receta → matriz', ev.detail);
    });
    on('crozzo-costos:precio-mp-cambiado', function (ev) {
      var e = engine();
      if (!e || !ev.detail) return;
      var d = ev.detail;
      if (d.producto && d.precioTotal != null && d.peso != null) {
        var unit = e.precioUnitarioMp(d.precioTotal, d.peso);
        emit('crozzo-costos:matriz-recalculada', { producto: d.producto, precioUnit: unit, source: 'mp' });
      }
    });
    on('crozzo-costos:recepcion-registrada', function (ev) {
      var d = ev.detail || {};
      var n = d.costeoActualizado && d.costeoActualizado.length;
      if (n) {
        toast(n + ' materia(s) prima actualizada(s) en costeo desde recepción', 'success');
      }
      console.info('[costos] recepción → inventario + costeo + oficina', ev.detail);
    });
    on('crozzo-costos:venta-registrada', function (ev) {
      if (reservorio()) return;
      var d = ev.detail || {};
      emit('crozzo-costos:feed-planilla', {
        origen: 'ventas',
        concepto: d.concepto || 'Ventas del día',
        monto: d.monto,
        tipo_movimiento: 'ingreso',
        referencia_tipo: 'venta',
        referencia_id: d.saleId,
        payload: d,
        enqueuePlanilla: true,
      });
    });
  }

  function injectStyles() {
    if (document.getElementById('crozzo-costos-styles')) return;
    var el = document.createElement('style');
    el.id = 'crozzo-costos-styles';
    el.textContent =
      '.crozzo-costos-hub{max-width:1200px;margin:0 auto}' +
      '.crozzo-costos-hero{padding:20px 0 16px;border-bottom:1px solid var(--border);margin-bottom:20px}' +
      '.crozzo-costos-hero h1{font-size:1.35rem;margin:0 0 6px;font-weight:700}' +
      '.crozzo-costos-hero p{margin:0;opacity:.8;font-size:.9rem;max-width:720px}' +
      '.crozzo-costos-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;margin-bottom:24px}' +
      '.crozzo-costos-card{border:1px solid var(--border);border-radius:14px;padding:16px;background:var(--bg-card);display:flex;flex-direction:column;gap:10px;transition:border-color .2s,box-shadow .2s}' +
      '.crozzo-costos-card:hover{border-color:var(--accent);box-shadow:var(--elevation-2)}' +
      '.crozzo-costos-card__head{display:flex;align-items:flex-start;gap:10px}' +
      '.crozzo-costos-card__icon{font-size:1.6rem;line-height:1}' +
      '.crozzo-costos-card__title{font-weight:700;font-size:.95rem;margin:0}' +
      '.crozzo-costos-card__sub{font-size:.78rem;opacity:.75;margin:4px 0 0;line-height:1.35}' +
      '.crozzo-costos-badge{display:inline-block;font-size:10px;font-weight:700;padding:3px 8px;border-radius:99px;text-transform:uppercase;letter-spacing:.04em}' +
      '.crozzo-costos-badge--ok{background:rgba(16,185,129,.15);color:#10b981}' +
      '.crozzo-costos-badge--wip{background:rgba(245,158,11,.15);color:#f59e0b}' +
      '.crozzo-costos-badge--local{background:rgba(100,210,255,.12);color:var(--info)}' +
      '.crozzo-costos-links{display:flex;flex-wrap:wrap;gap:8px;margin-top:auto}' +
      '.crozzo-costos-map{margin:20px 0;padding:16px;border:1px dashed var(--border);border-radius:12px;background:rgba(var(--accent-rgb,201,169,98),.04);font-size:.82rem;line-height:1.6}' +
      '.crozzo-costos-conn{margin:16px 0}' +
      '.crozzo-costos-conn h3{font-size:.85rem;margin:0 0 10px;text-transform:uppercase;letter-spacing:.06em;opacity:.7}' +
      '.crozzo-costos-conn-row{display:grid;grid-template-columns:72px 1fr 72px;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)}' +
      '.crozzo-costos-conn-row:last-child{border-bottom:none}' +
      '.crozzo-costos-conn-ev{font-family:var(--font-sans);font-size:.72rem;opacity:.65}' +
      '.crozzo-costos-tabs{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}' +
      '.crozzo-costos-tabs button{padding:8px 14px;border-radius:8px;border:1px solid var(--border);background:var(--bg-card);cursor:pointer;font-size:13px}' +
      '.crozzo-costos-tabs button.active{background:var(--accent);color:#111;border-color:var(--accent)}' +
      '.crozzo-costos-feed-table{width:100%;border-collapse:collapse;font-size:.82rem}' +
      '.crozzo-costos-feed-table th,.crozzo-costos-feed-table td{padding:8px 10px;border-bottom:1px solid var(--border);text-align:left}' +
      '.crozzo-costos-feed-table th{font-size:.72rem;text-transform:uppercase;opacity:.7}' +
      '.crozzo-costos-formula{background:var(--bg-secondary);border-radius:10px;padding:14px;font-family:var(--font-sans);font-size:.85rem;margin:12px 0}' +
      '.crozzo-costos-placeholder{padding:24px;text-align:center;opacity:.75;border:1px dashed var(--border);border-radius:12px}' +
      '.crozzo-costos-matriz-tabs{margin-bottom:16px}' +
      '.crozzo-costos-panel{display:none}.crozzo-costos-panel.active{display:block}' +
      '.crozzo-costos-kpi{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;margin:14px 0}' +
      '.crozzo-costos-kpi div{padding:10px 12px;border-radius:10px;background:var(--bg-secondary);font-size:.82rem}' +
      '.crozzo-costos-kpi strong{display:block;font-size:1rem;margin-top:4px}' +
      '.crozzo-costos-alert{padding:10px 12px;border-radius:8px;font-size:.82rem;margin:10px 0}' +
      '.crozzo-costos-alert--ok{background:rgba(16,185,129,.12);color:#10b981}' +
      '.crozzo-costos-alert--warn{background:rgba(245,158,11,.12);color:#f59e0b}' +
      '.crozzo-costos-scroll{max-height:360px;overflow:auto;border:1px solid var(--border);border-radius:10px}' +
      '.crozzo-costos-scroll--tall{max-height:min(62vh,560px)}' +
      '.crozzo-costos-editable{width:100%;min-width:72px;padding:6px 8px;border-radius:6px;border:1px solid var(--border);background:var(--bg-card);font-size:.82rem;text-align:right;font-variant-numeric:tabular-nums}' +
      '.crozzo-costos-editable:focus{border-color:var(--accent);outline:none}' +
      '.crozzo-costos-note{padding:10px 14px;border-radius:10px;background:rgba(var(--accent-rgb,201,169,98),.08);border:1px solid rgba(var(--accent-rgb,201,169,98),.2);font-size:.82rem;line-height:1.5;margin:0 0 12px}' +
      '.crozzo-costos-sql{width:100%;min-height:420px;font-family:ui-monospace,monospace;font-size:12px;padding:12px;border:1px solid var(--border);border-radius:10px;background:var(--bg-secondary);color:var(--text-primary);resize:vertical}';
    document.head.appendChild(el);
  }

  function statusBadge(status) {
    if (status === 'conectado') return '<span class="crozzo-costos-badge crozzo-costos-badge--ok">Conectado</span>';
    if (status === 'fase-1-local') return '<span class="crozzo-costos-badge crozzo-costos-badge--local">Cola local</span>';
    return '<span class="crozzo-costos-badge crozzo-costos-badge--wip">Próxima fase</span>';
  }

  function goPage(page) {
    if (typeof global.navigateTo === 'function') global.navigateTo(page);
    else toast('Abra: ' + page, 'info');
  }

  function renderFlowCard(f) {
    return (
      '<article class="crozzo-costos-card" data-flow="' + esc(f.key) + '">' +
      '<div class="crozzo-costos-card__head">' +
      '<span class="crozzo-costos-card__icon" aria-hidden="true">' + f.icon + '</span>' +
      '<div><h2 class="crozzo-costos-card__title">' + esc(f.id + ' · ' + f.title) + '</h2>' +
      '<p class="crozzo-costos-card__sub">' + esc(f.subtitle) + '</p></div></div>' +
      statusBadge(f.status) +
      '<div class="crozzo-costos-links">' +
      '<button type="button" class="btn btn-primary btn-sm crozzo-costos-open" data-page="' + esc(f.navigate) + '">Abrir módulo</button>' +
      '<button type="button" class="btn btn-outline btn-sm crozzo-costos-detail" data-flow="' + esc(f.key) + '">Detalle</button>' +
      '</div></article>'
    );
  }

    function renderMap() {
    var cards = Object.keys(FLOWS).map(function (k) { return renderFlowCard(FLOWS[k]); }).join('');
    var conns = CONNECTIONS.map(function (c) {
      return (
        '<div class="crozzo-costos-conn-row">' +
        '<strong>' + esc(c.from) + '</strong>' +
        '<span><strong>' + esc(c.label) + '</strong><br><span class="crozzo-costos-conn-ev">' + esc(c.event) + '</span></span>' +
        '<strong style="text-align:right">' + esc(c.to) + '</strong></div>'
      );
    }).join('');

    return (
      '<div class="crozzo-costos-hub">' +
      '<header class="crozzo-costos-hero">' +
      '<h1>Sistema de costos</h1>' +
      '<p>Seis flujos conectados: matriz de precios, recetas, inventario, compras, oficina y cola hacia planilla. ' +
      (cloudReady() ? 'Nube activa — listo para tablas SQL.' : 'Modo local — cola en este equipo hasta activar Cloud.') +
      '</p></header>' +
      '<div class="crozzo-costos-map" aria-label="Fórmulas">' +
      '<strong>Inventario (F3):</strong> Teórico = Inicial + Entradas − Salidas · Diferencia = Conteo − Teórico<br>' +
      '<strong>Costos:</strong> costo MP · precio venta · margen = (precio − costo) / precio</div>' +
      '<div class="crozzo-costos-grid">' + cards + '</div>' +
      '<section class="crozzo-costos-conn"><h3>Conexiones entre flujos</h3>' + conns + '</section></div>'
    );
  }

function renderFeedPanel() {
    var feed = loadFeed();
    var rv = reservorio();
    var rows = feed.length
      ? feed.slice(0, 50).map(function (it) {
          return (
            '<tr><td>' + esc(it.fecha) + '</td><td>' + esc(it.origen) + '</td><td>' + esc(it.concepto) + '</td>' +
            '<td>' + esc(it.tipo_movimiento) + '</td><td style="text-align:right">' + esc(Number(it.monto).toLocaleString('es-CO')) + '</td>' +
            ((it.estado === 'pendiente' && rv) ? '<button type="button" class="btn btn-primary btn-sm crozzo-feed-ok" data-id="' + esc(it.id) + '">Aceptar</button> <button type="button" class="btn btn-outline btn-sm crozzo-feed-no" data-id="' + esc(it.id) + '">Rechazar</button>' : esc(it.estado)) + '</td></tr>'
          );
        }).join('')
      : '<tr><td colspan="6" style="text-align:center;opacity:.7">Sin propuestas en cola. Las ventas y pagos las agregarán aquí.</td></tr>';

    return (
      '<div class="crozzo-costos-hub">' +
      '<header class="crozzo-costos-hero"><h1>F6 · Cola hacia Planilla</h1>' +
      '<p>Propuestas del reservorio. Acepte las que desee llevar a Planilla 2026.</p></header>' +
      '<div style="display:flex;gap:8px;margin-bottom:12px">' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoCostosFeedRefresh">Actualizar</button>' +
      '<button type="button" class="btn btn-primary btn-sm" id="crozzoCostosGoPlanilla">Ir a Planilla 2026</button></div>' +
      '<table class="crozzo-costos-feed-table"><thead><tr><th>Fecha</th><th>Origen</th><th>Concepto</th><th>Tipo</th><th>Monto</th><th>Estado</th></tr></thead><tbody>' +
      rows + '</tbody></table>' +
      '<button type="button" class="btn btn-outline" id="crozzoCostosBackMap" style="margin-top:16px">← Mapa de flujos</button></div>'
    );
  }


  function renderInventarioPanel() {
    var rv = reservorio();
    var C = global.CrozzoCatalogoMp;
    var catRows = '';
    if (C && C.list) {
      catRows = C.list()
        .slice(0, 40)
        .map(function (it) {
          return (
            '<tr><td>' +
            esc(it.nombre) +
            '</td><td>' +
            esc(it.categoria) +
            '</td><td style="text-align:right">' +
            esc(it.precioUnit) +
            ' /' +
            esc(it.und) +
            '</td><td style="text-align:right">' +
            esc(it.precioTotal) +
            '</td></tr>'
          );
        })
        .join('');
    }
    var movs = rv ? rv.listInventarioMovimientos(40) : [];
    var movRows = movs
      .map(function (m) {
        return (
          '<tr><td>' +
          esc(m.fecha) +
          '</td><td>' +
          esc(m.tipo) +
          '</td><td>' +
          esc(m.productoNombre || m.productoRefId) +
          '</td><td style="text-align:right">' +
          esc(m.cantidad) +
          ' ' +
          esc(m.unidad) +
          '</td></tr>'
        );
      })
      .join('');
    return (
      '<div class="crozzo-costos-hub">' +
      '<header class="crozzo-costos-hero"><h1>F3 · Inventario continuo</h1>' +
      '<p>Mismo catálogo de materias primas que la matriz. Los movimientos usan el nombre actual del producto.</p></header>' +
      '<h3 style="font-size:.9rem;margin:16px 0 8px">Catálogo MP (demo)</h3>' +
      '<div class="crozzo-costos-scroll" style="max-height:220px"><table class="crozzo-costos-feed-table"><thead><tr><th>Producto</th><th>Categoría</th><th>$/u</th><th>Precio ref.</th></tr></thead><tbody>' +
      (catRows || '<tr><td colspan="4">Sin catálogo — abra Matriz de precios primero</td></tr>') +
      '</tbody></table></div>' +
      '<h3 style="font-size:.9rem;margin:16px 0 8px">Movimientos recientes</h3>' +
      '<div class="crozzo-costos-scroll"><table class="crozzo-costos-feed-table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Producto</th><th>Cant.</th></tr></thead><tbody>' +
      (movRows || '<tr><td colspan="4">Sin movimientos</td></tr>') +
      '</tbody></table></div>' +
      '<button type="button" class="btn btn-outline" id="crozzoCostosBackMap" style="margin-top:16px">← Mapa</button></div>'
    );
  }

  function renderReservorioPanel() {
    var rv = reservorio();
    var dash = rv ? rv.renderDashboardHtml() : '<p>No se pudo cargar el reservorio.</p>';
    var healthLine = '';
    if (global.CrozzoReservorioOffline && global.CrozzoReservorioOffline.getHealth) {
      var h = global.CrozzoReservorioOffline.getHealth();
      var c = h.connectivity || {};
      healthLine =
        '<p class="form-hint" style="margin:8px 0 0">' +
        esc(c.icon || '💾') +
        ' ' +
        esc(c.label || 'Modo local') +
        (h.hasBackup ? ' · Copia de seguridad automática' : '') +
        (h.recoveredFromBackup ? ' · <span style="color:#f59e0b">Recuperado de backup</span>' : '') +
        '</p>';
    }
    return (
      '<div class="crozzo-costos-hub">' +
      '<header class="crozzo-costos-hero"><h1>Reservorio unificado</h1>' +
      '<p>Memoria interna conectada a todos los flujos. Sin internet todo queda aquí de forma segura.</p></header>' +
      healthLine +
      dash +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px">' +
      '<button type="button" class="btn btn-primary btn-sm" id="crozzoReservorioExport">Exportar backup JSON</button>' +
      '<button type="button" class="btn btn-outline" id="crozzoCostosGoSql">Editor SQL</button>' +
      '<button type="button" class="btn btn-outline" id="crozzoCostosBackMap">← Mapa</button></div></div>'
    );
  }

  function renderSqlPanel() {
    var sqlMod = global.CrozzoReservorioSql;
    var sql = sqlMod && sqlMod.getFullScript ? sqlMod.getFullScript() : '-- Módulo SQL no disponible';
    return (
      '<div class="crozzo-costos-hub">' +
      '<header class="crozzo-costos-hero"><h1>Editor SQL — Supabase</h1>' +
      '<p>Copie en SQL Editor al activar nube.</p></header>' +
      '<button type="button" class="btn btn-primary btn-sm" id="crozzoSqlCopy" style="margin-bottom:10px">Copiar todo</button>' +
      '<textarea class="crozzo-costos-sql" id="crozzoSqlEditor" readonly>' + esc(sql) + '</textarea>' +
      '<button type="button" class="btn btn-outline" id="crozzoCostosBackMap" style="margin-top:12px">← Mapa</button></div>'
    );
  }

  function renderResumenRowsHtml(seed) {
    var e = engine();
    var list = mergeResumenList(seed);
    if (!e || !list.length) {
      return '<tr><td colspan="7">Sin platos demo. Abra Matriz de precios para cargar el catálogo.</td></tr>';
    }
    return list
      .map(function (row) {
        var r = e.calcularResumen(row.costoMp, row.precioVenta);
        var ev = e.evaluarMargen(r, 0.30);
        var alertCls = ev.dentroObjetivo ? 'crozzo-costos-alert--ok' : 'crozzo-costos-alert--warn';
        var alertTxt = ev.dentroObjetivo ? 'OK' : 'Sobre 30%';
        return (
          '<tr data-resumen-slug="' +
          esc(row.slug) +
          '">' +
          '<td>' +
          esc(row.producto) +
          '</td>' +
          '<td style="text-align:right"><input type="number" class="crozzo-costos-editable" data-resumen-field="costoMp" min="0" step="1" value="' +
          esc(Math.round(row.costoMp)) +
          '" title="Costo materia prima (K7)"></td>' +
          '<td style="text-align:right"><input type="number" class="crozzo-costos-editable" data-resumen-field="precioVenta" min="0" step="100" value="' +
          esc(Math.round(row.precioVenta)) +
          '" title="Precio de venta en menú (decisión gerencia)"></td>' +
          '<td style="text-align:right" data-resumen-util>' +
          engFmt(r.utilidadBruta) +
          '</td>' +
          '<td style="text-align:right" data-resumen-pct-costo>' +
          engPct(r.pctCostoMp) +
          '</td>' +
          '<td style="text-align:right" data-resumen-pct-util>' +
          engPct(r.pctUtilidad) +
          '</td>' +
          '<td data-resumen-obj><span class="crozzo-costos-alert ' +
          alertCls +
          '" style="padding:2px 6px;margin:0">' +
          alertTxt +
          '</span></td></tr>'
        );
      })
      .join('');
  }

  function renderDemoRecetaHtml(seed) {
    var e = engine();
    var activeSlug = getActiveRecetaSlug(seed);
    var resumenList = mergeResumenList(seed);
    var row =
      resumenList.find(function (r) {
        return r.slug === activeSlug;
      }) || resumenList[0];
    var C = global.CrozzoCatalogoMp;
    var rec =
      C && C.getRecetaPlato && activeSlug ? C.getRecetaPlato(activeSlug) : null;
    if (!rec && row && C && C.ensureRecetaForMenu) {
      rec = C.ensureRecetaForMenu(activeSlug, row.producto);
    }
    var nombre = (rec && rec.producto) || (row && row.producto) || 'Plato';
    var lineas = loadRecetaLineas(activeSlug, seed);
    var store = buildPreciosStore();
    var lineasCalc = lineas.map(function (ln) {
      var costo =
        ln.costoXUnidad != null
          ? Number(ln.costoXUnidad)
          : e
            ? e.resolverCostoUnitario(
                (function () {
                  if (ln.mpId && C && C.get) {
                    var mpItem = C.get(ln.mpId);
                    if (mpItem && mpItem.nombre) return mpItem.nombre;
                  }
                  return ln.ingrediente;
                })(),
                store
              )
            : 0;
      return {
        ingrediente: ln.ingrediente,
        unidad: ln.unidad || ln.und || 'GR',
        cantidad: ln.cantidad,
        costoXUnidad: costo,
      };
    });
    var demoCalc = e ? e.calcularReceta(lineasCalc, (rec && rec.opts) || (seed.demoRecipe && seed.demoRecipe.opts) || {}) : null;
    var rawLineas = lineas;
    var demoRows = demoCalc
      ? demoCalc.lineas
          .map(function (ln, i) {
            var src = rawLineas[i] || {};
            var mpId = src.mpId || '';
            return (
              '<tr data-demo-line="' +
              i +
              '" data-mp-id="' +
              esc(mpId) +
              '"><td><select class="crozzo-costos-editable" data-receta-mp style="width:100%;text-align:left">' +
              renderMpOptionsHtml(mpId) +
              '</select></td><td data-receta-und>' +
              esc(ln.unidad) +
              '</td><td style="text-align:right"><input type="text" class="crozzo-costos-editable" data-demo-cant value="' +
              esc(ln.cantidad) +
              '" style="text-align:right" title="Cantidad"></td>' +
              '<td style="text-align:right" data-receta-unit>' +
              engFmt(ln.costoXUnidad) +
              '</td>' +
              '<td style="text-align:right" data-demo-total>' +
              engFmt(ln.total) +
              '</td>' +
              '<td style="text-align:right" data-demo-pct>' +
              engPct(ln.pctDelTotal) +
              '</td>' +
              '<td><button type="button" class="btn btn-outline btn-sm" data-receta-del title="Quitar">×</button></td></tr>'
            );
          })
          .join('')
      : '';

    var kpi = demoCalc
      ? (
        '<div class="crozzo-costos-kpi" id="crozzoDemoKpi">' +
        '<div>Total MP<strong data-kpi="mp">' +
        engFmt(demoCalc.totalMp) +
        '</strong></div>' +
        '<div>Al costo<strong data-kpi="k5">' +
        engFmt(demoCalc.totalAlCosto) +
        '</strong></div>' +
        '<div>Costo ref.<strong data-kpi="k7">' +
        engFmt(demoCalc.costoReferencia) +
        '</strong></div>' +
        '<div>Sugerido 30%<strong data-kpi="k10">' +
        engFmt(demoCalc.precioSugerido) +
        '</strong></div>' +
        '<div>Con impuesto<strong data-kpi="k11">' +
        engFmt(demoCalc.precioConImpuesto) +
        '</strong></div></div>'
      )
      : '<p class="crozzo-costos-placeholder">Motor de costos no cargado.</p>';

  var platoOpts = resumenList
    .map(function (r) {
      return (
        '<option value="' +
        esc(r.slug) +
        '"' +
        (r.slug === activeSlug ? ' selected' : '') +
        '>' +
        esc(r.producto) +
        '</option>'
      );
    })
    .join('');

    return (
      '<p class="crozzo-costos-note"><strong>Recetas por plato</strong>. Elija materia prima del catálogo y cantidades. Al guardar, pedidos internos usa la receta + área del producto en comandas. ' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoDemoGoCatalogo">Catálogo MP →</button></p>' +
      '<div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:12px">' +
      '<label style="font-size:.82rem">Plato / producto:</label>' +
      '<select id="crozzoDemoPlatoSel" class="crozzo-costos-editable" style="flex:1;min-width:220px;text-align:left">' +
      platoOpts +
      '</select>' +
      '<button type="button" class="btn btn-primary btn-sm" id="crozzoRecetaSave">Guardar receta</button></motion.div>' +
      (function () {
        var posProd = findPosProductForReceta(rec || { slug: activeSlug, producto: nombre });
        var areaLbl = posAreaLabelForProduct(posProd);
        return areaLbl
          ? '<p class="crozzo-costos-note" style="margin:8px 0"><strong>Área comanda POS:</strong> ' +
              esc(areaLbl) +
              ' — insumos → pedidos internos en esa área.</p>'
          : '<p class="crozzo-costos-note" style="margin:8px 0">Vincule el plato al producto POS (nombre o SKU = slug) para inferir área en pedidos.</p>';
      })() +
      '<h3 style="margin:0 0 8px;font-size:.95rem" id="crozzoDemoTitulo">' +
      esc(nombre) +
      ' <span style="font-size:11px;opacity:.65;font-weight:400">(' +
      esc(String(lineas.length)) +
      ' insumos)</span></h3>' +
      kpi +
      '<div class="crozzo-costos-scroll crozzo-costos-scroll--tall"><table class="crozzo-costos-feed-table"><thead><tr>' +
      '<th>Materia prima</th><th>U.</th><th>Cant.</th><th>$/u</th><th>Total</th><th>% MP</th><th></th>' +
      '</tr></thead><tbody id="crozzoDemoTbody">' +
      (demoRows || '<tr><td colspan="7">Sin líneas — agregue insumos</td></tr>') +
      '</tbody></table></div>' +
      '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoRecetaAddLine">+ Insumo</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoRecetaSyncPedidos">↻ Sincronizar pedidos internos</button></div>'
    ).replace(/<motion\./g, '<').replace(/<\/motion\./g, '</');
  }

  function renderMatrizPanel(seed) {
    seed = seed || hub.seed || { resumen: [], demoRecipe: { lineas: [], nombre: 'Demo' }, stats: {} };

    var resumenCount = mergeResumenList(seed).length;
    var mpCount = global.CrozzoCatalogoMp && global.CrozzoCatalogoMp.list ? global.CrozzoCatalogoMp.list().length : 0;

    return (
      '<div class="crozzo-costos-hub crozzo-mod-page">' +
      '<p class="crozzo-mod-lead">Dos capas: <strong>Catálogo</strong> (nombre y proveedores) y <strong>Costeo MP</strong> (unidad, peso, precio total, $/g). ' +
      esc(String(mpCount)) +
      ' insumos en catálogo.</p>' +
      '<nav class="crozzo-mod-nav crozzo-mod-nav--links">' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoCostosGoCatalogoMp">Catálogo MP</button></nav>' +
      '<div class="crozzo-mod-nav crozzo-mod-nav--segmented crozzo-costos-tabs crozzo-costos-matriz-tabs">' +
      '<button type="button" class="crozzo-mod-nav__item active" data-matriz-tab="resumen">Precios de venta</button>' +
      '<button type="button" class="crozzo-mod-nav__item" data-matriz-tab="costeo-mp">Costeo MP</button>' +
      '<button type="button" class="crozzo-mod-nav__item" data-matriz-tab="demo">Recetas plato</button></div>' +
      '<div class="crozzo-costos-panel active" data-matriz-panel="resumen">' +
      '<p class="crozzo-costos-note"><strong>Precios de venta:</strong> menú de capacitación (' +
      esc(String(resumenCount)) +
      ' platos). Edite precio de venta y costo MP.</p>' +
      '<input type="search" class="crozzo-mp-search" id="crozzoResumenSearch" placeholder="Buscar plato…" style="margin-bottom:12px;width:100%;max-width:420px;padding:10px 14px;border-radius:10px;border:1px solid var(--border)">' +
      '<div class="crozzo-costos-scroll crozzo-costos-scroll--tall"><table class="crozzo-costos-feed-table"><thead><tr>' +
      '<th>Producto</th><th>Costo MP</th><th>Precio venta</th><th>Utilidad</th><th>% Costo</th><th>% Util.</th><th>Obj. 30%</th>' +
      '</tr></thead><tbody id="crozzoResumenTbody">' +
      renderResumenRowsHtml(seed) +
      '</tbody></table></div></div>' +
      '<div class="crozzo-costos-panel" data-matriz-panel="costeo-mp">' +
      (global.CrozzoCosteoMp && global.CrozzoCosteoMp.renderPanel
        ? global.CrozzoCosteoMp.renderPanel({ embedded: true })
        : '<p class="crozzo-costos-note">Módulo de costeo no cargado.</p>') +
      '</div>' +
      '<div class="crozzo-costos-panel" data-matriz-panel="demo">' +
      renderDemoRecetaHtml(seed) +
      '</div>' +
      '<button type="button" class="btn btn-outline" id="crozzoCostosBackMap" style="margin-top:16px">← Mapa de flujos</button></div>'
    );
  }

  function refreshResumenRow(tr, seed) {
    var e = engine();
    if (!e || !tr) return;
    var slug = tr.getAttribute('data-resumen-slug');
    var costoInp = tr.querySelector('[data-resumen-field="costoMp"]');
    var precioInp = tr.querySelector('[data-resumen-field="precioVenta"]');
    var costoMp = Number(costoInp && costoInp.value);
    var precioVenta = Number(precioInp && precioInp.value);
    if (!isFinite(costoMp) || !isFinite(precioVenta)) return;
    saveResumenEdit(slug, { costoMp: costoMp, precioVenta: precioVenta });
    var r = e.calcularResumen(costoMp, precioVenta);
    var ev = e.evaluarMargen(r, 0.30);
    var u = tr.querySelector('[data-resumen-util]');
    var pc = tr.querySelector('[data-resumen-pct-costo]');
    var pu = tr.querySelector('[data-resumen-pct-util]');
    var ob = tr.querySelector('[data-resumen-obj]');
    if (u) u.textContent = engFmt(r.utilidadBruta);
    if (pc) pc.textContent = engPct(r.pctCostoMp);
    if (pu) pu.textContent = engPct(r.pctUtilidad);
    if (ob) {
      ob.innerHTML =
        '<span class="crozzo-costos-alert ' +
        (ev.dentroObjetivo ? 'crozzo-costos-alert--ok' : 'crozzo-costos-alert--warn') +
        '" style="padding:2px 6px;margin:0">' +
        (ev.dentroObjetivo ? 'OK' : 'Sobre 30%') +
        '</span>';
    }
    emit('crozzo-costos:matriz-precio-venta', { slug: slug, precioVenta: precioVenta, costoMp: costoMp });
  }

  function collectRecetaLineasFromDom(root, seed) {
    var e = engine();
    var C = global.CrozzoCatalogoMp;
    var tbody = root.querySelector('#crozzoDemoTbody');
    if (!tbody || !e) return [];
    var store = buildPreciosStore();
    var lineas = [];
    tbody.querySelectorAll('tr[data-demo-line]').forEach(function (tr) {
      var cantInp = tr.querySelector('[data-demo-cant]');
      var mpSel = tr.querySelector('[data-receta-mp]');
      var mpId = mpSel ? mpSel.value : tr.getAttribute('data-mp-id') || '';
      if (!mpId) return;
      var mp = C && C.get ? C.get(mpId) : null;
      var ing = mp && mp.nombre ? mp.nombre : '';
      var undEl = tr.querySelector('[data-receta-und]');
      var und = undEl ? undEl.textContent : mp && mp.und ? mp.und : 'GR';
      lineas.push({
        mpId: mpId,
        ingrediente: ing,
        unidad: und,
        cantidad: cantInp ? cantInp.value : 0,
        costoXUnidad: e.resolverCostoUnitario(ing, store),
      });
    });
    return lineas;
  }

  function recalcDemoReceta(root, seed) {
    var e = engine();
    if (!e || !root) return;
    var tbody = root.querySelector('#crozzoDemoTbody');
    if (!tbody) return;
    var slug = getActiveRecetaSlug(seed);
    var row = mergeResumenList(seed).find(function (r) {
      return r.slug === slug;
    });
    var C = global.CrozzoCatalogoMp;
    var rec = C && C.getRecetaPlato ? C.getRecetaPlato(slug) : null;
    var lineas = collectRecetaLineasFromDom(root, seed);
    saveDemoRecetaLineas(lineas, {
      slug: slug,
      producto: (rec && rec.producto) || (row && row.producto),
      opts: (rec && rec.opts) || (seed.demoRecipe && seed.demoRecipe.opts),
    });
    var calc = e.calcularReceta(lineas, (rec && rec.opts) || (seed.demoRecipe && seed.demoRecipe.opts) || {});
    calc.lineas.forEach(function (ln, i) {
      var tr = tbody.querySelector('tr[data-demo-line="' + i + '"]');
      if (!tr) return;
      var t = tr.querySelector('[data-demo-total]');
      var p = tr.querySelector('[data-demo-pct]');
      if (t) t.textContent = engFmt(ln.total);
      if (p) p.textContent = engPct(ln.pctDelTotal);
      var cu = tr.querySelector('[data-receta-unit]');
      if (cu) cu.textContent = engFmt(ln.costoXUnidad);
    });
    var kpi = root.querySelector('#crozzoDemoKpi');
    if (kpi) {
      var m = kpi.querySelector('[data-kpi="mp"]');
      var k5 = kpi.querySelector('[data-kpi="k5"]');
      var k7 = kpi.querySelector('[data-kpi="k7"]');
      var k10 = kpi.querySelector('[data-kpi="k10"]');
      var k11 = kpi.querySelector('[data-kpi="k11"]');
      if (m) m.textContent = engFmt(calc.totalMp);
      if (k5) k5.textContent = engFmt(calc.totalAlCosto);
      if (k7) k7.textContent = engFmt(calc.costoReferencia);
      if (k10) k10.textContent = engFmt(calc.precioSugerido);
      if (k11) k11.textContent = engFmt(calc.precioConImpuesto);
    }
  }

  function initMatrizGerenciaPanel(root, seed) {
    if (!root || !seed) return;
    if (!root._gerenciaBound) {
      root._gerenciaBound = true;
      document.addEventListener('crozzo-catalogo-mp:changed', function () {
        if (!root.isConnected) return;
        loadSeed(function (fresh) {
          var tbody = root.querySelector('#crozzoResumenTbody');
          if (tbody) tbody.innerHTML = renderResumenRowsHtml(fresh);
          root.querySelectorAll('[data-resumen-field]').forEach(function (inp) {
            inp._bound = false;
          });
          initMatrizGerenciaPanel(root, fresh);
          recalcDemoReceta(root, fresh);
        });
      });
    }
    var resumenQ = '';
    var search = root.querySelector('#crozzoResumenSearch');
    if (search && !search._bound) {
      search._bound = true;
      search.addEventListener('input', function () {
        resumenQ = search.value.toLowerCase().trim();
        root.querySelectorAll('#crozzoResumenTbody tr[data-resumen-slug]').forEach(function (tr) {
          var nom = (tr.cells[0] && tr.cells[0].textContent) || '';
          tr.style.display = !resumenQ || nom.toLowerCase().indexOf(resumenQ) >= 0 ? '' : 'none';
        });
      });
    }

    root.querySelectorAll('[data-resumen-field]').forEach(function (inp) {
      if (inp._bound) return;
      inp._bound = true;
      inp.addEventListener('change', function () {
        var tr = inp.closest('tr[data-resumen-slug]');
        refreshResumenRow(tr, seed);
        toast('Precio de venta actualizado', 'success');
      });
    });

    var platoSel = root.querySelector('#crozzoDemoPlatoSel');
    if (platoSel && !platoSel._bound) {
      platoSel._bound = true;
      platoSel.addEventListener('change', function () {
        hub.recetaSlug = platoSel.value;
        refreshRecetaPlatoPanel(root, seed);
      });
    }

    var saveRec = document.getElementById('crozzoRecetaSave');
    if (saveRec && !saveRec._bound) {
      saveRec._bound = true;
      saveRec.addEventListener('click', function () {
        recalcDemoReceta(root, seed);
        toast('Receta guardada — pedidos internos usará estos insumos', 'success');
      });
    }

    var addLine = document.getElementById('crozzoRecetaAddLine');
    if (addLine && !addLine._bound) {
      addLine._bound = true;
      addLine.addEventListener('click', function () {
        var tbody = root.querySelector('#crozzoDemoTbody');
        if (!tbody) return;
        var lineas = collectRecetaLineasFromDom(root, seed);
        var C = global.CrozzoCatalogoMp;
        var firstMp = C && C.list && C.list()[0];
        lineas.push({
          mpId: firstMp ? firstMp.id : '',
          ingrediente: firstMp ? firstMp.nombre : '',
          unidad: firstMp && firstMp.und ? firstMp.und : 'GR',
          cantidad: 1,
        });
        var slug = getActiveRecetaSlug(seed);
        var row = mergeResumenList(seed).find(function (r) {
          return r.slug === slug;
        });
        saveDemoRecetaLineas(lineas, { slug: slug, producto: row && row.producto });
        refreshRecetaPlatoPanel(root, seed);
      });
    }

    var syncPed = document.getElementById('crozzoRecetaSyncPedidos');
    if (syncPed && !syncPed._bound) {
      syncPed._bound = true;
      syncPed.addEventListener('click', function () {
        recalcDemoReceta(root, seed);
        var eng = global.CrozzoPedidosInternosEngine;
        var n = eng && eng.recalcAllFromRecipes ? eng.recalcAllFromRecipes() : 0;
        toast('Pedidos internos sincronizados (' + n + ' MPs por receta)', 'success');
      });
    }

    var goDemoCat = document.getElementById('crozzoDemoGoCatalogo');
    if (goDemoCat && !goDemoCat._bound) {
      goDemoCat._bound = true;
      goDemoCat.addEventListener('click', function () {
        if (typeof global.navigateTo === 'function') global.navigateTo('catalogo-mp');
      });
    }

    root.querySelectorAll('[data-demo-cant]').forEach(function (inp) {
      if (inp._bound) return;
      inp._bound = true;
      inp.addEventListener('change', function () {
        recalcDemoReceta(root, seed);
        toast('Receta recalculada', 'success');
      });
    });

    root.querySelectorAll('[data-receta-mp]').forEach(function (sel) {
      if (sel._bound) return;
      sel._bound = true;
      sel.addEventListener('change', function () {
        var tr = sel.closest('tr[data-demo-line]');
        var C = global.CrozzoCatalogoMp;
        var mp = C && C.get ? C.get(sel.value) : null;
        if (tr && mp) {
          tr.setAttribute('data-mp-id', mp.id);
          var und = tr.querySelector('[data-receta-und]');
          if (und) und.textContent = mp.und || 'GR';
        }
        recalcDemoReceta(root, seed);
      });
    });

    root.querySelectorAll('[data-receta-del]').forEach(function (btn) {
      if (btn._bound) return;
      btn._bound = true;
      btn.addEventListener('click', function () {
        var tr = btn.closest('tr[data-demo-line]');
        if (tr) tr.remove();
        recalcDemoReceta(root, seed);
      });
    });
  }

  function initMatrizAllPanels(root, seed) {
    var boot = function () {
      seed = hub.seed || seed;
      initMatrizGerenciaPanel(root, seed);
      var costeoPanel = root.querySelector('[data-matriz-panel="costeo-mp"]');
      if (costeoPanel && global.CrozzoCosteoMp && global.CrozzoCosteoMp.init) {
        global.CrozzoCosteoMp.init(costeoPanel);
      }
      var goCat = document.getElementById('crozzoCostosGoCatalogoMp');
      if (goCat && !goCat._bound) {
        goCat._bound = true;
        goCat.addEventListener('click', function () {
          if (typeof global.navigateTo === 'function') global.navigateTo('catalogo-mp');
        });
      }
    };
    var C = global.CrozzoCatalogoMp;
    if (C && C.ensureReady) C.ensureReady(boot);
    else boot();
  }

  function renderMatrizAsync() {
    if (hub.seed) return renderMatrizPanel(hub.seed);
    loadSeed(function () {
      var host = document.getElementById('mainContent');
      if (host && hub.view === 'matriz') {
        host.innerHTML = renderMatrizPanel(hub.seed);
        bindRoot(host);
        initMatrizAllPanels(host, hub.seed);
      }
    });
    return (
      '<div class="crozzo-costos-hub"><header class="crozzo-costos-hero"><h1>F1 · Matriz de precios</h1>' +
      '<p>Cargando datos de costos…</p></header></div>'
    );
  }

  function renderPlaceholder(title, phase, formula) {
    return (
      '<div class="crozzo-costos-hub">' +
      '<header class="crozzo-costos-hero"><h1>' + esc(title) + '</h1>' +
      '<p>Fase de implementación: <strong>' + esc(phase) + '</strong>. La estructura y conexiones ya están listas.</p></header>' +
      (formula ? '<div class="crozzo-costos-formula">' + formula + '</div>' : '') +
      '<div class="crozzo-costos-placeholder">Próximo paso: pantalla detallada de este flujo.<br>Vuelva al mapa con el botón «Mapa de flujos».</div>' +
      '<button type="button" class="btn btn-outline" id="crozzoCostosBackMap" style="margin-top:16px">← Mapa de flujos</button></div>'
    );
  }

  function render(view) {
    injectStyles();
    registerDefaultListeners();
    view = view || hub.view || 'map';
    hub.view = view;
    if (view === 'map') return renderMap();
    if (view === 'planilla-feed') return renderFeedPanel();
    if (view === 'matriz') return renderMatrizAsync();
    if (view === 'inventario') return renderInventarioPanel();
    if (view === 'reservorio') return renderReservorioPanel();
    if (view === 'sql') return renderSqlPanel();
    return renderMap();
  }

  function bindRoot(root) {
    if (!root || root._costosBound) return;
    root._costosBound = true;
    root.addEventListener('click', function (e) {
      var open = e.target.closest('.crozzo-costos-open');
      if (open) {
        e.preventDefault();
        goPage(open.getAttribute('data-page'));
        return;
      }
      var det = e.target.closest('.crozzo-costos-detail');
      if (det) {
        e.preventDefault();
        var fk = det.getAttribute('data-flow');
        if (fk === 'planilla-feed') hub.view = 'planilla-feed';
        else if (fk === 'matriz') hub.view = 'matriz';
        else if (fk === 'inventario') hub.view = 'inventario';
        else hub.view = 'map';
        var host = document.getElementById('mainContent');
        if (host) {
          host.innerHTML = render(hub.view);
          bindRoot(host);
          bindMatrizOnRender(host);
        }
        return;
      }
      if (e.target.id === 'crozzoCostosBackMap') {
        hub.view = 'map';
        var h = document.getElementById('mainContent');
        if (h) { h.innerHTML = render('map'); bindRoot(h); }
      }
      if (e.target.id === 'crozzoCostosGoPlanilla') goPage('planilla-2026');
      if (e.target.id === 'crozzoCostosGoSql') {
        hub.view = 'sql';
        var hs = document.getElementById('mainContent');
        if (hs) { hs.innerHTML = render('sql'); }
      }
      if (e.target.id === 'crozzoReservorioExport') {
        if (global.CrozzoReservorioOffline && global.CrozzoReservorioOffline.exportBackupFile()) {
          toast('Backup JSON descargado', 'success');
        } else if (reservorio() && reservorio().exportSnapshot) {
          try {
            var snap = reservorio().exportSnapshot();
            var blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'crozzo-reservorio-' + new Date().toISOString().slice(0, 10) + '.json';
            a.click();
            toast('Backup JSON descargado', 'success');
          } catch (_) {
            toast('No se pudo exportar', 'error');
          }
        }
      }
      if (e.target.id === 'crozzoSqlCopy') {
        var ta = document.getElementById('crozzoSqlEditor');
        if (ta) {
          ta.select();
          try {
            document.execCommand('copy');
            toast('SQL copiado al portapapeles', 'success');
          } catch (_) {
            navigator.clipboard.writeText(ta.value).then(function () { toast('SQL copiado', 'success'); });
          }
        }
      }
      var fok = e.target.closest('.crozzo-feed-ok');
      if (fok && reservorio()) {
        reservorio().updateFeedEstado(fok.getAttribute('data-id'), 'aceptado');
        toast('Propuesta aceptada — puede ingresarla en Planilla 2026', 'success');
        var hf = document.getElementById('mainContent');
        if (hf) { hf.innerHTML = render('planilla-feed'); }
      }
      var fno = e.target.closest('.crozzo-feed-no');
      if (fno && reservorio()) {
        reservorio().updateFeedEstado(fno.getAttribute('data-id'), 'rechazado');
        toast('Propuesta rechazada', 'info');
        var hfn = document.getElementById('mainContent');
        if (hfn) { hfn.innerHTML = render('planilla-feed'); }
      }
      if (e.target.id === 'crozzoCostosFeedRefresh') {
        var hr = document.getElementById('mainContent');
        if (hr) { hr.innerHTML = render('planilla-feed'); bindRoot(hr); }
      }
      var tab = e.target.closest('[data-matriz-tab]');
      if (tab) {
        e.preventDefault();
        var tabId = tab.getAttribute('data-matriz-tab');
        root.querySelectorAll('[data-matriz-tab]').forEach(function (btn) {
          var on = btn.getAttribute('data-matriz-tab') === tabId;
          btn.classList.toggle('active', on);
          btn.classList.toggle('is-active', on);
        });
        root.querySelectorAll('[data-matriz-panel]').forEach(function (panel) {
          panel.classList.toggle('active', panel.getAttribute('data-matriz-panel') === tabId);
        });
        if (tabId === 'resumen' || tabId === 'demo' || tabId === 'costeo-mp') {
          initMatrizAllPanels(root, hub.seed);
        }
      }
    });
  }

  function bindMatrizOnRender(root) {
    if (hub.view === 'matriz' && root) initMatrizAllPanels(root, hub.seed);
  }

  function init(view) {
    injectStyles();
    registerDefaultListeners();
    var root = document.getElementById('mainContent');
    if (root) {
      bindRoot(root);
      bindMatrizOnRender(root);
    }
    hub.view = view || 'map';
  }

  function teardown() {
    hub.bound = false;
  }

  function pageToView(page) {
    if (page === 'costos-matriz') return 'matriz';
    if (page === 'costos-inventario') return 'inventario';
    if (page === 'costos-planilla-feed') return 'planilla-feed';
    if (page === 'costos-reservorio') return 'reservorio';
    if (page === 'costos-sql') return 'sql';
    return 'map';
  }

    global.CrozzoSistemaCostos = {
    FLOWS: FLOWS,
    CONNECTIONS: CONNECTIONS,
    emit: emit,
    on: on,
    enqueuePlanillaFeed: enqueuePlanillaFeed,
    loadFeed: loadFeed,
    cloudReady: cloudReady,
    render: render,
    init: init,
    teardown: teardown,
    pageToView: pageToView,
  };

  global.renderSistemaCostos = function (view) { return render(view); };
  global.initSistemaCostos = init;
  global.crozzoCostosPageToView = pageToView;
  global.crozzoSistemaCostosTeardown = teardown;
  global.crozzoCostosEmit = emit;
})(window);
