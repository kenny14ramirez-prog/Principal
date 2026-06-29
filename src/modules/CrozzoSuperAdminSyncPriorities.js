/**
 * Super Admin — Prioridades de sincronización con la nube (P0 / P1 / P2).
 * Vista de referencia + estado en vivo del motor de sync.
 */
(function (global) {
  'use strict';

  var PRIORITY_META = [
    {
      level: 0,
      key: 'realtime',
      icon: '⚡',
      title: 'P0 · Tiempo real',
      badge: 'badge-danger',
      desc: 'Operación en vivo. Realtime Supabase + push inmediato (~180 ms). Sin esperar navegación.',
      examples: 'Cajero, tablets, comandas, cocina (KDS), venta comercial',
      transport: 'Realtime + LAN + respaldo cada 4–5 s',
    },
    {
      level: 1,
      key: 'nav',
      icon: '🚪',
      title: 'P1 · Al entrar / salir',
      badge: 'badge-warning',
      desc: 'Pull al abrir el apartado · push de cola al salir. Sin polling continuo en segundo plano.',
      examples: 'Facturas, cierre caja, clientes, preparaciones de cocina',
      transport: 'Nav + cola offline priorizada',
    },
    {
      level: 2,
      key: 'background',
      icon: '🌙',
      title: 'P2 · Background',
      badge: 'badge-info',
      desc: 'Catálogo, compras, costos y config. Intervalos largos; cede si la nube está saturada.',
      examples: 'Productos, inventarios, proveedores, usuarios, auditoría',
      transport: 'Probe updated_at · scheduler ~4 min',
    },
  ];

  var DOMAIN_LABELS = {
    runtime: 'Estado operativo (mesas/carritos)',
    comandas: 'Comandas activas',
    sales: 'Ventas / facturas',
    queue: 'Cola offline → sync_queue',
    clients: 'Clientes FE',
    preparations: 'Preparaciones cocina',
    products: 'Catálogo products',
    tenant: 'Config empresa / sede',
    staff: 'Usuarios pos_staff / profiles',
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function sp() {
    return global.CrozzoCloudSyncPriorities || null;
  }

  function perfilLabel() {
    try {
      if (typeof global.crozzoResolvePerfilEmpresaId === 'function') {
        var p = global.crozzoResolvePerfilEmpresaId(
          (global.crozzoGetActiveClientProfile && global.crozzoGetActiveClientProfile().perfil) ||
            global.localStorage.getItem('crozzo_perfil_empresa') ||
            'basico_restaurante'
        );
        if (p === 'basico_tienda') return 'Básico tienda';
        if (p === 'basico_restaurante') return 'Básico restaurante';
        if (p === 'personalizado') return 'Personalizado';
        return p;
      }
    } catch (_) {}
    return '—';
  }

  function liveStatusHtml() {
    var online =
      typeof global.crozzoOnlineConfigReady === 'function' && global.crozzoOnlineConfigReady();
    var page =
      (global.CrozzoPageCloudWatch && global.CrozzoPageCloudWatch.getActivePage && global.CrozzoPageCloudWatch.getActivePage()) ||
      (typeof global.currentPage !== 'undefined' ? global.currentPage : '—');
    var thr = global.CrozzoCloudThrottle && global.CrozzoCloudThrottle.snapshot ? global.CrozzoCloudThrottle.snapshot() : null;
    var tier = String(global.__CROZZO_TIER_LAST || 'offline');
    var pagePri = sp() && sp().getPagePriority ? sp().getPagePriority(page) : '—';
    var priLbl = sp() && sp().priorityLabel ? sp().priorityLabel(pagePri) : pagePri;
    var pageZone = sp() && sp().getPageZone ? sp().getPageZone(page) : '—';
    var zoneLbl = sp() && sp().zoneLabel ? sp().zoneLabel(pageZone) : pageZone;

    return (
      '<div class="crozzo-sync-pri-live">' +
      '<div class="crozzo-sync-pri-live__item"><span class="crozzo-sync-pri-live__k">Nube</span><span class="badge ' +
      (online ? 'badge-success' : 'badge-warning') +
      '">' +
      (online ? 'Config OK' : 'Sin credenciales') +
      '</span></div>' +
      '<div class="crozzo-sync-pri-live__item"><span class="crozzo-sync-pri-live__k">Tier</span><code>' +
      esc(tier) +
      '</code></div>' +
      '<div class="crozzo-sync-pri-live__item"><span class="crozzo-sync-pri-live__k">Pantalla activa</span><code>' +
      esc(page) +
      '</code> <span class="badge badge-outline">Z' +
      esc(pageZone) +
      ' · ' +
      esc(zoneLbl) +
      '</span> <span class="badge badge-outline">P' +
      esc(pagePri) +
      ' · ' +
      esc(priLbl) +
      '</span></div>' +
      '<div class="crozzo-sync-pri-live__item"><span class="crozzo-sync-pri-live__k">Perfil cliente</span>' +
      esc(perfilLabel()) +
      '</div>' +
      (thr
        ? '<div class="crozzo-sync-pri-live__item"><span class="crozzo-sync-pri-live__k">Throttle</span>' +
          (thr.underPressure
            ? '<span class="badge badge-warning">Presión (' + esc(thr.reason || 'rate') + ')</span>'
            : '<span class="badge badge-success">Normal</span>') +
          ' · lote ' +
          esc(thr.batchLimit) +
          '</div>'
        : '') +
      '</div>'
    );
  }

  function basicoBadge(b) {
    if (!b) return '<span class="badge badge-outline">Completo</span>';
    if (b === 'both') return '<span class="badge badge-success">Básico ambos</span>';
    if (b === 'restaurante') return '<span class="badge badge-info">Básico restaurante</span>';
    if (b === 'tienda') return '<span class="badge badge-info">Básico tienda</span>';
    return '<span class="badge">' + esc(b) + '</span>';
  }

  function priorityBadge(p) {
    if (p === 0) return '<span class="badge badge-danger">P0</span>';
    if (p === 1) return '<span class="badge badge-warning">P1</span>';
    return '<span class="badge badge-info">P2</span>';
  }

  function buildCatalogRows(filter) {
    filter = filter || 'all';
    var cat = sp() && sp().getSyncCatalog ? sp().getSyncCatalog() : [];
    var perfil = perfilLabel();
    var isRest = perfil.indexOf('restaurante') >= 0;
    var isTienda = perfil.indexOf('tienda') >= 0;

    return cat
      .filter(function (row) {
        if (filter === 'p0') return row.priority === 0;
        if (filter === 'p1') return row.priority === 1;
        if (filter === 'p2') return row.priority === 2;
        if (filter === 'basico') {
          if (!row.basico) return false;
          if (row.basico === 'both') return true;
          if (row.basico === 'restaurante') return isRest;
          if (row.basico === 'tienda') return isTienda;
          return false;
        }
        return true;
      })
      .map(function (row) {
        var doms = (row.domains || [])
          .map(function (d) {
            return '<code class="crozzo-sync-pri-dom">' + esc(d) + '</code>';
          })
          .join(' ');
        return (
          '<tr data-priority="' +
          row.priority +
          '" data-basico="' +
          esc(row.basico || '') +
          '">' +
          '<td>' +
          priorityBadge(row.priority) +
          '</td>' +
          '<td><code>' +
          esc(row.page) +
          '</code></td>' +
          '<td>' +
          basicoBadge(row.basico) +
          (row.navOnly ? ' <span class="badge badge-outline" title="Solo al entrar/salir">nav</span>' : '') +
          '</td>' +
          '<td>' +
          (doms || '—') +
          '</td>' +
          '<td class="crozzo-sync-pri-note">' +
          esc(row.note) +
          '</td></tr>'
        );
      })
      .join('');
  }

  function renderPriorityCards() {
    return PRIORITY_META.map(function (m) {
      return (
        '<div class="crozzo-sync-pri-card crozzo-sync-pri-card--p' +
        m.level +
        '">' +
        '<div class="crozzo-sync-pri-card__head">' +
        '<span class="crozzo-sync-pri-card__icon" aria-hidden="true">' +
        m.icon +
        '</span>' +
        '<span class="crozzo-sync-pri-card__title">' +
        esc(m.title) +
        '</span>' +
        '<span class="badge ' +
        m.badge +
        '">Nivel ' +
        m.level +
        '</span></div>' +
        '<p class="crozzo-sync-pri-card__desc">' +
        esc(m.desc) +
        '</p>' +
        '<p class="form-hint"><strong>Ejemplos:</strong> ' +
        esc(m.examples) +
        '</p>' +
        '<p class="form-hint"><strong>Transporte:</strong> ' +
        esc(m.transport) +
        '</p></div>'
      );
    }).join('');
  }

  function renderDomainRef() {
    var S = sp();
    if (!S || !S.DOMAIN_PRIORITY) return '';
    var rows = Object.keys(S.DOMAIN_PRIORITY)
      .map(function (d) {
        return (
          '<tr><td><code>' +
          esc(d) +
          '</code></td><td>' +
          priorityBadge(S.DOMAIN_PRIORITY[d]) +
          '</td><td>' +
          esc(DOMAIN_LABELS[d] || d) +
          '</td></tr>'
        );
      })
      .join('');
    return (
      '<div class="card crozzo-sync-pri-ref">' +
      '<div class="card-header"><span class="card-title">Dominios nube</span></div>' +
      '<div class="table-wrap"><table class="data-table crozzo-sync-pri-table"><thead><tr><th>Dominio</th><th>P</th><th>Qué sincroniza</th></tr></thead><tbody>' +
      rows +
      '</tbody></table></div></div>'
    );
  }

  function renderOperationRef() {
    var S = sp();
    if (!S || !S.OPERATION_PRIORITY) return '';
    var rows = Object.keys(S.OPERATION_PRIORITY)
      .map(function (t) {
        return (
          '<tr><td><code>' +
          esc(t) +
          '</code></td><td>' +
          priorityBadge(S.OPERATION_PRIORITY[t]) +
          '</td></tr>'
        );
      })
      .join('');
    return (
      '<div class="card crozzo-sync-pri-ref">' +
      '<div class="card-header"><span class="card-title">Tipos en cola offline</span></div>' +
      '<div class="table-wrap"><table class="data-table crozzo-sync-pri-table"><thead><tr><th>Tipo</th><th>P</th></tr></thead><tbody>' +
      rows +
      '</tbody></table></div></div>'
    );
  }

  function renderSuperAdminSyncPrioritiesHTML() {
    if (!sp()) {
      return (
        '<div class="card"><p>No se cargó <code>CrozzoCloudSyncPriorities.js</code>. Verifique el orden de scripts en index.html.</p></div>'
      );
    }

    return (
      '<div class="crozzo-sync-pri-page">' +
      '<div class="crozzo-nube-callout crozzo-sync-pri-intro">' +
      '<p><strong>Mapa oficial de prioridades</strong> — define qué va en tiempo real (P0), qué sincroniza al entrar o salir de un módulo (P1) y qué puede esperar (P2). ' +
      'El motor <code>CrozzoPageCloudWatch</code> y la cola offline leen este catálogo.</p>' +
      '<p class="form-hint">Distinción clave: la pantalla <strong>Cocina (KDS)</strong> es <strong>P0</strong>; el menú <strong>Preparaciones de cocina</strong> (¿Qué hago hoy?, recetario) es <strong>P1</strong>.</p>' +
      '</div>' +
      liveStatusHtml() +
      '<div class="crozzo-sync-pri-cards">' +
      renderPriorityCards() +
      '</div>' +
      '<div class="card">' +
      '<div class="card-header">' +
      '<span class="card-title">📋 Catálogo por apartado</span>' +
      '<div class="crozzo-sync-pri-filters" role="tablist" aria-label="Filtrar catálogo">' +
      '<button type="button" class="btn btn-sm btn-outline crozzo-sync-pri-filter is-active" data-filter="all">Todos</button>' +
      '<button type="button" class="btn btn-sm btn-outline crozzo-sync-pri-filter" data-filter="p0">P0</button>' +
      '<button type="button" class="btn btn-sm btn-outline crozzo-sync-pri-filter" data-filter="p1">P1</button>' +
      '<button type="button" class="btn btn-sm btn-outline crozzo-sync-pri-filter" data-filter="p2">P2</button>' +
      '<button type="button" class="btn btn-sm btn-outline crozzo-sync-pri-filter" data-filter="basico">Plan básico activo</button>' +
      '</div></div>' +
      '<div class="table-wrap"><table class="data-table crozzo-sync-pri-table" id="crozzoSyncPriCatalogTable">' +
      '<thead><tr><th>P</th><th>Página</th><th>Plan</th><th>Dominios</th><th>Lógica</th></tr></thead>' +
      '<tbody id="crozzoSyncPriCatalogBody">' +
      buildCatalogRows('all') +
      '</tbody></table></div>' +
      '<p class="form-hint" id="crozzoSyncPriCatalogCount"></p>' +
      '</div>' +
      '<div class="crozzo-sync-pri-refs">' +
      renderDomainRef() +
      renderOperationRef() +
      '</div>' +
      '<div class="card">' +
      '<div class="card-header"><span class="card-title">Acciones</span></div>' +
      '<div class="crozzo-nube-actions" style="flex-wrap:wrap;gap:8px;">' +
      '<button type="button" class="btn btn-outline btn-sm" id="sanSyncPriRefresh">🔄 Actualizar estado</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="sanSyncPriFlush" title="Push operativo + cola">☁️ Flush sync ahora</button>' +
      '<button type="button" class="btn btn-outline btn-sm" onclick="navigateTo(\'super-admin-nube\')">↩ Nube global</button>' +
      '<button type="button" class="btn btn-outline btn-sm" onclick="navigateTo(\'super-admin-diagnostics\')">🧪 Diagnóstico</button>' +
      '</div></div></div>'
    );
  }

  function updateCatalogCount(filter) {
    var body = document.getElementById('crozzoSyncPriCatalogBody');
    var el = document.getElementById('crozzoSyncPriCatalogCount');
    if (!body || !el) return;
    var n = body.querySelectorAll('tr').length;
    el.textContent = n + ' apartado(s) · filtro: ' + filter;
  }

  function refreshLiveStrip() {
    var wrap = document.querySelector('.crozzo-sync-pri-live');
    if (wrap && wrap.parentNode) {
      var fresh = document.createElement('div');
      fresh.innerHTML = liveStatusHtml();
      wrap.parentNode.replaceChild(fresh.firstChild, wrap);
    }
  }

  function initSuperAdminSyncPriorities() {
    var root = document.querySelector('.crozzo-sync-pri-page');
    if (!root || root._crozzoSyncPriInit) return;
    root._crozzoSyncPriInit = true;

    var currentFilter = 'all';

    root.querySelectorAll('.crozzo-sync-pri-filter').forEach(function (btn) {
      btn.addEventListener('click', function () {
        currentFilter = btn.getAttribute('data-filter') || 'all';
        root.querySelectorAll('.crozzo-sync-pri-filter').forEach(function (b) {
          b.classList.toggle('is-active', b === btn);
        });
        var body = document.getElementById('crozzoSyncPriCatalogBody');
        if (body) body.innerHTML = buildCatalogRows(currentFilter);
        updateCatalogCount(currentFilter);
      });
    });

    updateCatalogCount('all');

    var refBtn = document.getElementById('sanSyncPriRefresh');
    if (refBtn) {
      refBtn.addEventListener('click', function () {
        refreshLiveStrip();
        var body = document.getElementById('crozzoSyncPriCatalogBody');
        if (body) body.innerHTML = buildCatalogRows(currentFilter);
        updateCatalogCount(currentFilter);
        if (global.showToast) global.showToast('Estado de prioridades actualizado', 'success');
      });
    }

    var flushBtn = document.getElementById('sanSyncPriFlush');
    if (flushBtn) {
      flushBtn.addEventListener('click', function () {
        if (typeof global.crozzoCloudPushFlush === 'function') {
          global.crozzoCloudPushFlush('super_admin_manual');
        }
        if (global.showToast) global.showToast('Sincronización forzada enviada', 'info');
      });
    }
  }

  global.renderSuperAdminSyncPrioritiesHTML = renderSuperAdminSyncPrioritiesHTML;
  global.initSuperAdminSyncPriorities = initSuperAdminSyncPriorities;
})(typeof window !== 'undefined' ? window : globalThis);
