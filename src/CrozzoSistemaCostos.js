/**
 * Crozzo POS — Sistema de costos (Fase 1: flujos, conexiones, hub)
 * Matriz precios · Recetas · Inventario · Compras · Oficina · Cola planilla
 */
(function (global) {
  'use strict';

  var LS_FEED = 'crozzo_costos_feed_v1';
  var LS_MATRIZ = 'crozzo_costos_matriz_v1';
  var LS_EVENT_LOG = 'crozzo_costos_event_log_v1';

  var FLOWS = {
    F1: {
      id: 'F1',
      key: 'matriz',
      title: 'Matriz de precios',
      subtitle: 'Necesidades del negocio → decisión socios/gerentes → vigencia POS',
      icon: '💰',
      roles: ['socio', 'gerente', 'admin'],
      status: 'motor-qyc',
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
      sources: ['QyC catalogo', 'QyC procesado'],
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

  var hub = { view: 'map', flowKey: null, bound: false, seed: null, seedLoading: false };

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
    if (hub.seed) {
      if (cb) cb(hub.seed);
      return Promise.resolve(hub.seed);
    }
    if (hub.seedLoading) {
      return new Promise(function (resolve) {
        var t = setInterval(function () {
          if (hub.seed) { clearInterval(t); resolve(hub.seed); if (cb) cb(hub.seed); }
        }, 80);
      });
    }
    hub.seedLoading = true;
    return fetch('data/costo-qyc-seed.json')
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (j) {
        hub.seed = j || { precios: {}, resumen: [], demoRecipe: { lineas: [] } };
        hub.seedLoading = false;
        if (cb) cb(hub.seed);
        return hub.seed;
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
    try {
      return JSON.parse(raw);
    } catch (_) {
      return fb;
    }
  }

  function reservorio() {
    return global.CrozzoReservorio || null;
  }

  function loadFeed() {
    var rv = reservorio();
    if (rv) return rv.listFeed(500);
    try {
      return safeJsonParse(localStorage.getItem(LS_FEED), []);
    } catch (_) {
      return [];
    }
  }

  function saveFeed(list) {
    try {
      localStorage.setItem(LS_FEED, JSON.stringify(list.slice(0, 500)));
    } catch (_) {}
  }

  function loadEventLog() {
    try {
      return safeJsonParse(localStorage.getItem(LS_EVENT_LOG), []);
    } catch (_) {
      return [];
    }
  }

  function appendEventLog(entry) {
    var log = loadEventLog();
    log.unshift(
      Object.assign({ ts: new Date().toISOString() }, entry)
    );
    try {
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
    appendEventLog({ event: eventName, detail: detail });
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
      console.info('[costos] recepción → inventario + oficina', ev.detail);
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
      '.crozzo-costos-sql{width:100%;min-height:420px;font-family:ui-monospace,monospace;font-size:12px;padding:12px;border:1px solid var(--border);border-radius:10px;background:var(--bg-secondary);color:var(--text-primary);resize:vertical}';
    document.head.appendChild(el);
  }

  function statusBadge(status) {
    if (status === 'conectado') return '<span class="crozzo-costos-badge crozzo-costos-badge--ok">Conectado</span>';
    if (status === 'motor-qyc') return '<span class="crozzo-costos-badge crozzo-costos-badge--local">Motor QyC</span>';
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
      '<strong>Matriz QyC (F1):</strong> K7 = costo al costo · K10 = K7 / % MP objetivo · RESUMEN: margen = (precio − costo) / precio</div>' +
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
    var movs = rv ? rv.listInventarioMovimientos(80) : [];
    var rows = movs.map(function (m) {
      return (
        '<tr><td>' + esc(m.fecha) + '</td><td>' + esc(m.tipo) + '</td><td>' + esc(m.productoNombre || m.productoRefId) + '</td>' +
        '<td style="text-align:right">' + esc(m.cantidad) + ' ' + esc(m.unidad) + '</td><td>' + esc(m.notas || '') + '</td></tr>'
      );
    }).join('');
    return (
      '<div class="crozzo-costos-hub">' +
      '<header class="crozzo-costos-hero"><h1>F3 · Inventario continuo</h1>' +
      '<p>Ledger del reservorio: entradas − salidas.</p></header>' +
      '<div class="crozzo-costos-scroll"><table class="crozzo-costos-feed-table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Producto</th><th>Cant.</th><th>Notas</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="5">Sin movimientos</td></tr>') + '</tbody></table></div>' +
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

  function renderMatrizPanel(seed) {
    seed = seed || hub.seed || { resumen: [], demoRecipe: { lineas: [], nombre: 'Demo' }, stats: {} };
    var e = engine();
    var formulas = e ? e.FORMULAS : {};
    var formulaHtml = Object.keys(formulas).map(function (k) {
      return '<div><strong>' + esc(k) + ':</strong> ' + esc(formulas[k]) + '</div>';
    }).join('');

    var demoCalc = null;
    var demoRows = '';
    if (e && seed.demoRecipe && seed.demoRecipe.lineas.length) {
      demoCalc = e.calcularReceta(seed.demoRecipe.lineas, seed.demoRecipe.opts || {});
      demoRows = demoCalc.lineas.map(function (ln) {
        return (
          '<tr><td>' + esc(ln.ingrediente) + '</td><td>' + esc(ln.unidad) + '</td><td style="text-align:right">' +
          esc(ln.cantidad) + '</td><td style="text-align:right">' + engFmt(ln.costoXUnidad) + '</td>' +
          '<td style="text-align:right">' + engFmt(ln.total) + '</td><td style="text-align:right">' + engPct(ln.pctDelTotal) + '</td></tr>'
        );
      }).join('');
    }

    var resumenRows = '';
    if (e && seed.resumen && seed.resumen.length) {
      resumenRows = seed.resumen.slice(0, 25).map(function (row) {
        var r = e.calcularResumen(row.costoMp, row.precioVenta);
        var ev = e.evaluarMargen(r, 0.30);
        var alertCls = ev.alerta === 'ok' ? 'crozzo-costos-alert--ok' : 'crozzo-costos-alert--warn';
        return (
          '<tr><td>' + esc(row.producto) + '</td>' +
          '<td style="text-align:right">' + engFmt(r.costoMp) + '</td>' +
          '<td style="text-align:right">' + engFmt(r.precioVenta) + '</td>' +
          '<td style="text-align:right">' + engFmt(r.utilidadBruta) + '</td>' +
          '<td style="text-align:right">' + engPct(r.pctCostoMp) + '</td>' +
          '<td style="text-align:right">' + engPct(r.pctUtilidad) + '</td>' +
          '<td><span class="crozzo-costos-alert ' + alertCls + '" style="padding:2px 6px;margin:0">' +
          (ev.dentroObjetivo ? 'OK' : 'Sobre 30%') + '</span></td></tr>'
        );
      }).join('');
    }

    var kpi = demoCalc
      ? (
        '<div class="crozzo-costos-kpi">' +
        '<div>Total MP<strong>' + engFmt(demoCalc.totalMp) + '</strong></div>' +
        '<div>Al costo (K5)<strong>' + engFmt(demoCalc.totalAlCosto) + '</strong></div>' +
        '<div>Costo ref. (K7)<strong>' + engFmt(demoCalc.costoReferencia) + '</strong></div>' +
        '<div>Sugerido (K10)<strong>' + engFmt(demoCalc.precioSugerido) + '</strong></div>' +
        '<div>Con impuesto (K11)<strong>' + engFmt(demoCalc.precioConImpuesto) + '</strong></div></div>'
      )
      : '<p class="crozzo-costos-placeholder">Motor de costos no cargado. Incluya CrozzoCostosEngine.js</p>';

    return (
      '<div class="crozzo-costos-hub">' +
      '<header class="crozzo-costos-hero">' +
      '<h1>F1 · Matriz de precios (lógica QyC)</h1>' +
      '<p>Basado en <strong>COSTO DE PRODUCTOS QYC.xlsx</strong>: PRECIOS → recetas → RESUMEN. ' +
      'Datos demo: ' + esc(String((seed.stats && seed.stats.precios) || 0)) + ' MP · ' +
      esc(String((seed.resumen && seed.resumen.length) || 0)) + ' productos RESUMEN.</p></header>' +
      '<div class="crozzo-costos-tabs crozzo-costos-matriz-tabs">' +
      '<button type="button" class="active" data-matriz-tab="formulas">Fórmulas</button>' +
      '<button type="button" data-matriz-tab="demo">Receta demo</button>' +
      '<button type="button" data-matriz-tab="resumen">RESUMEN</button></div>' +
      '<div class="crozzo-costos-panel active" data-matriz-panel="formulas">' +
      '<div class="crozzo-costos-formula">' + formulaHtml + '</div>' +
      '<p style="font-size:.82rem;opacity:.8">Cadena: matriz PRECIOS (E/C) → líneas receta (E×D) → K3…K11 → RESUMEN (precio G manual).</p></div>' +
      '<div class="crozzo-costos-panel" data-matriz-panel="demo">' +
      '<h3 style="margin:0 0 8px;font-size:.95rem">' + esc(seed.demoRecipe.nombre || 'Receta demo') + '</h3>' +
      kpi +
      '<div class="crozzo-costos-scroll"><table class="crozzo-costos-feed-table"><thead><tr>' +
      '<th>Ingrediente</th><th>U.</th><th>Cant.</th><th>$/u</th><th>Total</th><th>% MP</th>' +
      '</tr></thead><tbody>' + (demoRows || '<tr><td colspan="6">Sin datos demo</td></tr>') + '</tbody></table></div></div>' +
      '<div class="crozzo-costos-panel" data-matriz-panel="resumen">' +
      '<p style="font-size:.82rem;margin:0 0 10px">Comparación Excel RESUMEN — precio venta decidido vs costo MP (K7) y objetivo 30% food cost.</p>' +
      '<div class="crozzo-costos-scroll"><table class="crozzo-costos-feed-table"><thead><tr>' +
      '<th>Producto</th><th>Costo MP</th><th>Precio</th><th>Utilidad</th><th>% Costo</th><th>% Util.</th><th>Obj.</th>' +
      '</tr></thead><tbody>' + (resumenRows || '<tr><td colspan="7">Cargue data/costo-qyc-seed.json</td></tr>') + '</tbody></table></div></div>' +
      '<button type="button" class="btn btn-outline" id="crozzoCostosBackMap" style="margin-top:16px">← Mapa de flujos</button></div>'
    );
  }

  function renderMatrizAsync() {
    if (hub.seed) return renderMatrizPanel(hub.seed);
    loadSeed(function () {
      var host = document.getElementById('mainContent');
      if (host && hub.view === 'matriz') {
        host.innerHTML = renderMatrizPanel(hub.seed);
        bindRoot(host);
      }
    });
    return (
      '<div class="crozzo-costos-hub"><header class="crozzo-costos-hero"><h1>F1 · Matriz de precios</h1>' +
      '<p>Cargando datos del Excel QyC…</p></header></div>'
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
          btn.classList.toggle('active', btn.getAttribute('data-matriz-tab') === tabId);
        });
        root.querySelectorAll('[data-matriz-panel]').forEach(function (panel) {
          panel.classList.toggle('active', panel.getAttribute('data-matriz-panel') === tabId);
        });
      }
    });
  }

  function init(view) {
    injectStyles();
    registerDefaultListeners();
    var root = document.getElementById('mainContent');
    if (root) bindRoot(root);
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
