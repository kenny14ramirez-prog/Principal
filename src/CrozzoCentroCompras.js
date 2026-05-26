/**
 * Contenido de compras (sin menú duplicado): QyC en iframe si hay nube, si no almacenamiento local.
 * La navegación vive en el sidebar del POS (grupo Compras).
 */
(function (global) {
  'use strict';

  var hub = { qycModule: 'recepcion', loadedQyc: false, frameToken: 0 };

  var QYC_ONLY = { recepcion: 1, procesado: 1, oficina: 1, dashboard: 1, ventas: 1 };

  function esc(s) {
    if (typeof escUserAttr === 'function') return escUserAttr(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function toast(m, t) {
    if (typeof showToast === 'function') showToast(m, t || 'info');
  }

  function cloudOk() {
    try {
      if (typeof global.crozzoShouldUseCloud === 'function') return global.crozzoShouldUseCloud();
      return typeof crozzoOnlineConfigReady === 'function' && crozzoOnlineConfigReady();
    } catch (_) {
      return false;
    }
  }

  function injectHubStyles() {
    if (document.getElementById('crozzo-hub-compras-css')) return;
    var el = document.createElement('style');
    el.id = 'crozzo-hub-compras-css';
    el.textContent =
      'body.crozzo-page-centro-compras .main-body,#mainContent.main-body--centro-compras{padding:0;overflow:hidden;height:calc(100vh - 56px);min-height:480px}' +
      '.crozzo-hub-compras{display:flex;flex-direction:column;height:100%;min-height:calc(100vh - 56px);background:var(--bg-primary)}' +
      '.crozzo-hub-compras__body{flex:1;min-height:0;position:relative}' +
      '.crozzo-hub-engine{position:absolute;inset:0;display:flex;flex-direction:column}' +
      '.crozzo-hub-engine__frame{flex:1;border:0;width:100%;background:var(--bg-primary)}' +
      '.crozzo-hub-local{position:absolute;inset:0;overflow:auto;padding:12px 16px}' +
      '.crozzo-hub-native{position:absolute;inset:0;overflow:auto;padding:12px 16px}' +
      '.crozzo-hub-no-cloud{display:none}' +
      '.crozzo-hub-status{padding:6px 14px;font-size:11px;border-bottom:1px solid var(--border);background:var(--bg-card);color:var(--text-muted)}' +
      '.crozzo-hub-status strong{color:var(--text-primary)}';
    document.head.appendChild(el);
  }

  function qycUrl() {
    return 'CrozzoQyC_App.html?embed=1&pos_auto=1&hub=1&_=' + Date.now() + '_' + ++hub.frameToken;
  }

  function postToQycFrame(payload) {
    var fr = document.getElementById('crozzo-hub-qyc-frame');
    if (!fr || !fr.contentWindow) return;
    try {
      fr.contentWindow.postMessage(payload, '*');
    } catch (_) {}
  }

  function statusBarHtml() {
    if (global.CrozzoReservorioOffline && global.CrozzoReservorioOffline.statusBarHtml) {
      return global.CrozzoReservorioOffline.statusBarHtml();
    }
    var cloud = cloudOk();
    return (
      '<div class="crozzo-hub-status" id="crozzo-hub-status">' +
      (cloud
        ? '<span>☁️ <strong>Nube activa</strong> — módulo QyC sincronizado con Supabase del POS</span>'
        : '<span>💾 <strong>Modo local</strong> — datos en este equipo. Active Cloud en Multi-dispositivo para QyC completo.</span>') +
      '</div>'
    );
  }

  function showLocalModule(mod) {
    var host = document.getElementById('crozzo-hub-local-host');
    var eng = document.getElementById('crozzo-hub-engine');
    if (eng) eng.style.display = 'none';
    if (!host) return;
    host.style.display = 'block';
    if (global.CrozzoComprasLocal) {
      host.innerHTML = global.CrozzoComprasLocal.render(mod);
      global.CrozzoComprasLocal.init(host, mod);
    } else {
      host.innerHTML = '<div class="card"><p>Cargue CrozzoComprasLocal.js</p></div>';
    }
  }

  function showQycEngine(mod) {
    hub.qycModule = mod || 'recepcion';
    var host = document.getElementById('crozzo-hub-local-host');
    var eng = document.getElementById('crozzo-hub-engine');
    if (!hub.loadedQyc) {
      showLocalModule(mod);
      if (eng) eng.style.display = 'none';
      ensureQycFrameLoaded(function () {
        if (!hub.loadedQyc || !cloudOk()) return;
        if (host) host.style.display = 'none';
        if (eng) eng.style.display = 'flex';
        postToQycFrame({ type: 'crozzo-qyc-nav', module: hub.qycModule });
      });
      return;
    }
    if (host) host.style.display = 'none';
    if (eng) eng.style.display = 'flex';
    postToQycFrame({ type: 'crozzo-qyc-nav', module: hub.qycModule });
  }

  function openModule(mod) {
    if (!QYC_ONLY[mod]) {
      toast('Use el menú lateral para esta sección', 'info');
      return;
    }
    hub.qycModule = mod;
    if (cloudOk()) showQycEngine(mod);
    else showLocalModule(mod);
    var st = document.getElementById('crozzo-hub-status');
    if (st) st.outerHTML = statusBarHtml();
  }

  function reloadQycFrame() {
    hub.loadedQyc = false;
    var fr = document.getElementById('crozzo-hub-qyc-frame');
    if (!fr) return;
    if (!cloudOk()) {
      fr.removeAttribute('src');
      openModule(hub.qycModule);
      return;
    }
    postToQycFrame({ type: 'crozzo-pos-supabase-sync' });
    fr.src = qycUrl();
  }

  function syncThemeToQycFrame() {
    if (typeof global.crozzoBroadcastThemeToEmbeds === 'function') {
      global.crozzoBroadcastThemeToEmbeds();
    }
  }

  function ensureQycFrameLoaded(onReady) {
    var fr = document.getElementById('crozzo-hub-qyc-frame');
    if (!fr || hub.loadedQyc || !cloudOk()) {
      if (onReady) onReady();
      return;
    }
    var token = hub.frameToken;
    if (hub._loadTimer) clearTimeout(hub._loadTimer);
    hub._loadTimer = setTimeout(function () {
      if (hub.loadedQyc || token !== hub.frameToken) return;
      hub.loadedQyc = false;
      try {
        fr.removeAttribute('src');
      } catch (_) {}
      toast('Sin conexión con QyC — modo local seguro activado', 'warning');
      showLocalModule(hub.qycModule);
      var st = document.getElementById('crozzo-hub-status');
      if (st) st.outerHTML = statusBarHtml();
    }, 10000);
    fr.onerror = function () {
      if (hub._loadTimer) clearTimeout(hub._loadTimer);
      if (hub.loadedQyc) return;
      toast('Error cargando QyC — modo local', 'warning');
      showLocalModule(hub.qycModule);
    };
    fr.onload = function () {
      if (hub._loadTimer) clearTimeout(hub._loadTimer);
      hub.loadedQyc = true;
      postToQycFrame({ type: 'crozzo-pos-supabase-sync' });
      postToQycFrame({ type: 'crozzo-qyc-nav', module: hub.qycModule });
      syncThemeToQycFrame();
      if (onReady) onReady();
    };
    fr.src = qycUrl();
  }

  function bindSupabaseListeners() {
    if (hub._sbBound) return;
    hub._sbBound = true;
    document.addEventListener('crozzo-supabase-config-saved', function () {
      reloadQycFrame();
      toast('Nube actualizada — compras recargadas', 'success');
    });
    window.addEventListener('storage', function (ev) {
      if (ev && ev.key === 'crozzo_supabase_config') reloadQycFrame();
    });
    document.addEventListener('crozzo-connectivity-changed', function () {
      if (typeof currentPage === 'undefined') return;
      if (currentPage !== 'centro-compras' && currentPage !== 'operaciones-qyc') return;
      hub.loadedQyc = false;
      var st = document.getElementById('crozzo-hub-status');
      if (st) st.outerHTML = statusBarHtml();
      openModule(hub.qycModule);
    });
    window.addEventListener('message', function (ev) {
      var d = ev.data;
      if (!d || typeof d !== 'object') return;
      if (d.type === 'crozzo-qyc-recepcion-guardada' && global.CrozzoReservorio) {
        global.CrozzoReservorio.registrarRecepcion({
          proveedorId: d.proveedorId,
          proveedorNombre: d.proveedorNombre,
          valor: d.valor || d.total,
          notas: d.notas || 'QyC nube',
          crearOficina: d.crearOficina !== false,
        });
      }
      if (d.type === 'crozzo-qyc-factura-pagada' && global.CrozzoReservorio && d.facturaId) {
        global.CrozzoReservorio.actualizarEstadoOficina(d.facturaId, 'pagada');
      }
    });
  }

  function renderOrdenesEmbed() {
    return (
      '<div id="crozzo-hub-ordenes-host">' +
      (typeof renderComprasProveedores === 'function'
        ? '<div class="card" style="margin-bottom:12px"><p class="page-subtitle" style="margin:0">Órdenes de compra al catálogo POS.</p></div>' + renderComprasProveedores()
        : '<div class="card"><p>Módulo de proveedores no disponible</p></div>') +
      '</div>'
    );
  }

  global.crozzoComprasPageToModule = function (page) {
    var map = {
      'compras-recepcion': 'recepcion',
      'compras-oficina': 'oficina',
      'centro-compras': 'recepcion',
      'operaciones-qyc': 'recepcion'
    };
    return map[page] || null;
  };

  global.crozzoNavGroupForPage = function (page) {
    if (
      page === 'compras-recepcion' ||
      page === 'compras-proveedores' ||
      page === 'compras-ordenes' ||
      page === 'centro-compras' ||
      page === 'operaciones-qyc'
    ) {
      return 'compras';
    }
    if (
      page === 'compras-cortes' ||
      page === 'centro-procesos' ||
      page === 'compras-proceso-sesion' ||
      page === 'compras-proceso-entrada' ||
      page === 'compras-proceso-historial'
    ) {
      return 'procesos';
    }
    if (page === 'compras-oficina') return 'administrativo';
    if (page === 'compras-dashboard' || page === 'inventarios') return 'gestion';
    if (page === 'planilla-2026' || page === 'nomina-planilla') return 'administrativo';
    if (page === 'pedidos-internos') return 'compras';
    return null;
  };

  global.crozzoOpenNavGroup = function (groupId) {
    if (!groupId) return;
    var g = document.querySelector(
      '#sidebar [data-group="' + groupId + '"], #sidebar [data-nav-group="' + groupId + '"]'
    );
    if (g && global.CrozzoSidebarNav && global.CrozzoSidebarNav.applyGroupOpen) {
      global.CrozzoSidebarNav.applyGroupOpen(g, true, false);
    } else if (g) {
      g.classList.add('open');
      g.classList.remove('nav-group-collapsed');
    }
  };

  global.crozzoOpenComprasGroup = function () {
    global.crozzoOpenNavGroup('compras');
  };

  global.CrozzoCentroCompras = {
    openModule: openModule,

    render: function (startModule) {
      injectHubStyles();
      hub.loadedQyc = false;
      hub.frameToken = 0;
      hub.qycModule = startModule && QYC_ONLY[startModule] ? startModule : 'recepcion';

      if (startModule === 'ordenes') {
        return (
          '<section class="crozzo-hub-compras" id="crozzo-hub-compras">' +
          statusBarHtml() +
          '<div class="crozzo-hub-compras__body"><div class="crozzo-hub-native" style="position:relative;inset:auto;height:100%">' +
          renderOrdenesEmbed() +
          '</div></div></section>'
        );
      }

      return (
        '<section class="crozzo-hub-compras" id="crozzo-hub-compras">' +
        statusBarHtml() +
        '<div class="crozzo-hub-compras__body">' +
        '<div class="crozzo-hub-engine" id="crozzo-hub-engine" style="display:none">' +
        '<iframe id="crozzo-hub-qyc-frame" class="crozzo-hub-engine__frame" title="Facturas de compra"></iframe></div>' +
        '<div class="crozzo-hub-local" id="crozzo-hub-local-host" style="display:none"></div>' +
        '</div></section>'
      );
    },

    init: function (startModule) {
      if (global.CrozzoReservorioOffline) global.CrozzoReservorioOffline.ensureReservorioReady();
      bindSupabaseListeners();
      if (startModule === 'ordenes') {
        if (typeof initComprasProveedores === 'function') initComprasProveedores();
        return;
      }
      openModule(hub.qycModule);
    }
  };

  global.renderCentroCompras = function (start) {
    return global.CrozzoCentroCompras.render(start);
  };

  global.initCentroCompras = function (start) {
    return global.CrozzoCentroCompras.init(start);
  };

  global.crozzoResolveLegacyComprasPage = function (page) {
    var mod = global.crozzoComprasPageToModule(page);
    if (mod) return { page: 'centro-compras', module: mod };
    if (page === 'compras-proveedores') return { page: 'compras-proveedores', module: null };
    if (page === 'compras-ordenes') return { page: 'centro-compras', module: 'ordenes' };
    return { page: page, module: null };
  };

  function centroComprasTeardown() {
    hub.loadedQyc = false;
    var fr = document.getElementById('crozzo-hub-qyc-frame');
    if (fr) {
      try {
        fr.src = 'about:blank';
      } catch (_) {}
    }
    var lh = document.getElementById('crozzo-hub-local-host');
    if (lh) lh.innerHTML = '';
  }

  global.crozzoCentroComprasTeardown = centroComprasTeardown;
  if (typeof window !== 'undefined') window.crozzoCentroComprasTeardown = centroComprasTeardown;
})(typeof window !== 'undefined' ? window : globalThis);
