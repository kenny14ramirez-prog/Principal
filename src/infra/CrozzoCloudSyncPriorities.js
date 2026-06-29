/**
 * Crozzo — Prioridades de sincronización con la nube (catálogo completo).
 *
 * Zona 0 · OPERACIÓN — tiempo real siempre (mesas, comandas, KDS).
 * Zona 1 · FUERA OPERACIÓN — sync al navegar + background moderado.
 * Zona 3 · DIFERIDO — solo al abrir la pantalla; sin tick ambiental fuera de ella.
 *
 * P0/P1/P2 se mantienen para colas y throttle; Z0/Z1/Z3 gobiernan transportes.
 */
(function (global) {
  'use strict';

  var P0 = 0;
  var P1 = 1;
  var P2 = 2;
  var Z0 = 0;
  var Z1 = 1;
  var Z3 = 3;

  /** Pantallas admin/diag/lab: no mantener sync de fondo fuera de operación. */
  var Z3_DEFER_PAGES = {
    auditoria: 1,
    'laboratorio-admin': 1,
    'modo-demo': 1,
    'super-admin-nube': 1,
    'super-admin-sync-priorities': 1,
    'super-admin-diagnostics': 1,
    'super-admin-federacion': 1,
    'gestion-perfiles-menus': 1,
    'costos-reservorio': 1,
    'costos-federacion': 1,
    'costos-planilla-feed': 1,
    'planilla-2026': 1,
    'control-acceso': 1,
    'config-seguridad': 1,
    'operaciones-qyc': 1,
    'compras-cotizaciones': 1,
  };

  /** Alias navigateTo / sidebar → clave canónica de sync. */
  var PAGE_ALIASES = {
    'punto-venta': 'cajero',
    caja: 'caja-clientes',
    'compras-dashboard': 'centro-compras',
    'compras-ordenes': 'centro-compras',
    'compras-oficina': 'centro-compras',
    'compras-proceso-entrada': 'compras-recepcion',
    'centro-procesos': 'compras-cortes',
    'sistema-costos': 'costos-matriz',
    'sistema-costos-matriz': 'costos-matriz',
    'sistema-costos-inv': 'costos-inventario',
    'sistema-costos-fed': 'costos-federacion',
    'sistema-costos-feed': 'costos-planilla-feed',
    'nomina-planilla': 'planilla-2026',
    impuestos: 'config-impuestos',
    admin: 'config-usuarios',
    'conexion-sistemas': 'config-conexiones-sistemas',
    'facturas-admin': 'config-facturas-admin',
  };

  /**
   * Catálogo por pantalla.
   * basico: 'both' | 'restaurante' | 'tienda' | false (solo completo)
   * domains: qué dominio nube tocar en esta vista
   * navOnly: true → solo sync al entrar/salir (sin tick continuo)
   */
  var PAGE_REGISTRY = {
    /* ── P0 · Operación en tiempo real ── */
    cajero: {
      p: P0,
      basico: 'restaurante',
      note: 'Mesas, carritos, comandando, locks de slot',
      domains: ['runtime', 'comandas'],
      intervalMs: 5000,
    },
    tablets: {
      p: P0,
      basico: 'restaurante',
      note: 'Pedidos mesa/llevar desde tablet',
      domains: ['runtime', 'comandas'],
      intervalMs: 5000,
    },
    comandas: {
      p: P0,
      basico: 'restaurante',
      note: 'Corcho / estados de comanda entre equipos',
      domains: ['comandas'],
      intervalMs: 4000,
    },
    cocina: {
      p: P0,
      basico: 'restaurante',
      note: 'KDS — cambios de estado cocina al instante',
      domains: ['comandas'],
      intervalMs: 4000,
    },
    'venta-comercial': {
      p: P0,
      basico: 'tienda',
      note: 'Carrito comercial / venta directa tienda',
      domains: ['runtime'],
      intervalMs: 7000,
    },
    mesas: {
      p: P0,
      basico: false,
      note: 'Layout mesas (modo mesa por fila)',
      domains: ['runtime'],
      intervalMs: 5000,
    },

    /* ── P1 · Sync al entrar / salir ── */
    'inicio-operacion': {
      p: P1,
      basico: 'both',
      note: 'Hub de módulos — snapshot operativo + tenant al abrir',
      domains: ['runtime', 'tenant'],
      intervalMs: 60000,
      navOnly: true,
    },
    facturas: {
      p: P1,
      basico: 'both',
      note: 'Historial ventas / FE — pull al entrar, cola al salir',
      domains: ['sales', 'queue'],
      intervalMs: 60000,
      navOnly: true,
    },
    'cierre-caja': {
      p: P1,
      basico: 'both',
      note: 'Cierres de turno — shift_closes + ventas del día',
      domains: ['sales', 'queue', 'runtime'],
      intervalMs: 60000,
      navOnly: true,
    },
    'caja-clientes': {
      p: P1,
      basico: 'both',
      note: 'Maestro clientes FE — cambios al guardar, pull al entrar',
      domains: ['clients', 'tenant'],
      intervalMs: 60000,
      navOnly: true,
    },
    'cartera-comercial': {
      p: P1,
      basico: false,
      note: 'Cartera por cobrar — consulta al abrir módulo',
      domains: ['clients', 'sales'],
      intervalMs: 90000,
      navOnly: true,
    },
    'cupos-clientes': {
      p: P1,
      basico: false,
      note: 'Cupos crédito clientes',
      domains: ['clients'],
      intervalMs: 90000,
      navOnly: true,
    },
    'pedidos-internos': {
      p: P1,
      basico: false,
      note: 'Pedidos entre áreas (cocina ↔ bodega)',
      domains: ['queue', 'products'],
      intervalMs: 90000,
      navOnly: true,
    },
    'compras-cortes': {
      p: P1,
      basico: 'restaurante',
      note: 'Preparaciones — ¿Qué hago hoy? (sesión del día)',
      domains: ['preparations', 'products'],
      intervalMs: 90000,
      navOnly: true,
    },
    'compras-recetario-cocina': {
      p: P1,
      basico: 'restaurante',
      note: 'Recetario — referencia para preparación',
      domains: ['products', 'preparations'],
      intervalMs: 120000,
      navOnly: true,
    },
    'compras-proceso-sesion': {
      p: P1,
      basico: 'restaurante',
      note: 'Anotar preparación — sube al salir del formulario',
      domains: ['preparations', 'queue'],
      intervalMs: 90000,
      navOnly: true,
    },
    'compras-proceso-historial': {
      p: P1,
      basico: 'restaurante',
      note: 'Historial preparaciones — pull al consultar',
      domains: ['preparations'],
      intervalMs: 120000,
      navOnly: true,
    },

    /* ── P2 · Background / administración ── */
    inventarios: {
      p: P2,
      basico: 'both',
      note: 'Dashboard reportes — lectura, catálogo de respaldo',
      domains: ['products'],
      intervalMs: 50000,
    },
    productos: {
      p: P2,
      basico: 'both',
      note: 'Catálogo y precios POS',
      domains: ['products'],
      intervalMs: 45000,
    },
    'catalogo-mp': {
      p: P2,
      basico: 'both',
      note: 'Materia prima / insumos',
      domains: ['products'],
      intervalMs: 50000,
    },
    'costos-matriz': {
      p: P2,
      basico: 'both',
      note: 'Costos y márgenes',
      domains: ['products'],
      intervalMs: 55000,
    },
    'costos-inventario': {
      p: P2,
      basico: 'both',
      note: 'Inventario continuo costos',
      domains: ['products'],
      intervalMs: 55000,
    },
    'costos-reservorio': {
      p: P2,
      basico: false,
      note: 'Reservorio SQL costos',
      domains: ['products'],
      intervalMs: 70000,
    },
    'costos-planilla-feed': {
      p: P2,
      basico: false,
      note: 'Cola planilla → costos',
      domains: ['queue'],
      intervalMs: 120000,
    },
    'costos-federacion': {
      p: P2,
      basico: false,
      note: 'Bodegas y remisiones (completo)',
      domains: ['products'],
      intervalMs: 60000,
    },
    'compras-recepcion': {
      p: P2,
      basico: 'both',
      note: 'Entrada factura compra — lote, no tiempo real',
      domains: ['products', 'queue'],
      intervalMs: 90000,
    },
    'centro-compras': {
      p: P2,
      basico: 'both',
      note: 'Hub compras / recepción',
      domains: ['products'],
      intervalMs: 90000,
    },
    'operaciones-qyc': {
      p: P2,
      basico: false,
      note: 'Operaciones QyC',
      domains: ['products'],
      intervalMs: 90000,
    },
    'compras-proveedores': {
      p: P2,
      basico: 'both',
      note: 'Directorio proveedores',
      domains: ['tenant'],
      intervalMs: 80000,
    },
    'compras-cotizaciones': {
      p: P2,
      basico: false,
      note: 'Cotizaciones compra',
      domains: ['products'],
      intervalMs: 90000,
    },
    'planilla-2026': {
      p: P2,
      basico: false,
      note: 'Planillas nómina',
      domains: ['tenant', 'queue'],
      intervalMs: 120000,
    },
    'control-acceso': {
      p: P2,
      basico: false,
      note: 'Marcación personal',
      domains: ['queue'],
      intervalMs: 120000,
    },
    'config-empresa': {
      p: P2,
      basico: 'both',
      note: 'Datos empresa / sede',
      domains: ['tenant'],
      intervalMs: 60000,
      navOnly: true,
    },
    'config-impuestos': {
      p: P2,
      basico: 'both',
      note: 'Impuestos y tasas',
      domains: ['tenant'],
      intervalMs: 70000,
      navOnly: true,
    },
    'config-comandas': {
      p: P2,
      basico: 'restaurante',
      note: 'Impresoras y áreas comanda',
      domains: ['tenant'],
      intervalMs: 70000,
      navOnly: true,
    },
    'config-salon': {
      p: P2,
      basico: 'restaurante',
      note: 'Mesas del salón y pedidos llevar',
      domains: ['tenant'],
      intervalMs: 70000,
      navOnly: true,
    },
    'config-dian': {
      p: P2,
      basico: false,
      note: 'Config DIAN',
      domains: ['tenant'],
      intervalMs: 90000,
      navOnly: true,
    },
    'config-certificado': {
      p: P2,
      basico: false,
      note: 'Certificado P12',
      domains: ['tenant'],
      intervalMs: 90000,
      navOnly: true,
    },
    'config-proveedor': {
      p: P2,
      basico: false,
      note: 'Proveedor tecnológico FE',
      domains: ['tenant'],
      intervalMs: 90000,
      navOnly: true,
    },
    'config-conexiones-sistemas': {
      p: P2,
      basico: 'both',
      note: 'Integraciones externas',
      domains: ['tenant'],
      intervalMs: 80000,
      navOnly: true,
    },
    'config-multidispositivo': {
      p: P2,
      basico: 'both',
      note: 'Emparejamiento multidispositivo',
      domains: ['tenant'],
      intervalMs: 50000,
      navOnly: true,
    },
    'config-facturas-admin': {
      p: P2,
      basico: 'both',
      note: 'Formatos impresión factura',
      domains: ['tenant'],
      intervalMs: 80000,
      navOnly: true,
    },
    'config-usuarios': {
      p: P2,
      basico: 'both',
      note: 'Usuarios y roles (profiles / pos_staff)',
      domains: ['staff', 'tenant'],
      intervalMs: 70000,
      navOnly: true,
    },
    'config-seguridad': {
      p: P2,
      basico: false,
      note: 'Seguridad sistema',
      domains: ['tenant'],
      intervalMs: 120000,
      navOnly: true,
    },
    auditoria: {
      p: P2,
      basico: false,
      note: 'Log auditoría — subida diferida',
      domains: ['queue'],
      intervalMs: 180000,
    },
    'super-admin-nube': {
      p: P2,
      basico: false,
      note: 'Credenciales Supabase global',
      domains: ['tenant'],
      intervalMs: 60000,
      navOnly: true,
    },
    'super-admin-sync-priorities': {
      p: P2,
      basico: false,
      note: 'Mapa de prioridades P0/P1/P2 — referencia Super Admin',
      domains: [],
      intervalMs: 0,
      navOnly: true,
    },
    'super-admin-federacion': {
      p: P2,
      basico: false,
      note: 'Federación multi-sede (completo)',
      domains: ['tenant'],
      intervalMs: 90000,
      navOnly: true,
    },
    'super-admin-diagnostics': {
      p: P2,
      basico: false,
      note: 'Diagnóstico conexión',
      domains: [],
      intervalMs: 0,
      navOnly: true,
    },
    'gestion-perfiles-menus': {
      p: P2,
      basico: false,
      note: 'Perfiles menú por cliente',
      domains: ['tenant'],
      intervalMs: 120000,
      navOnly: true,
    },
    'modo-demo': {
      p: P2,
      basico: false,
      note: 'Modo demostración',
      domains: [],
      intervalMs: 0,
    },
    'laboratorio-admin': {
      p: P2,
      basico: false,
      note: 'Laboratorio interno',
      domains: [],
      intervalMs: 0,
    },
  };

  var DOMAIN_PRIORITY = {
    runtime: P0,
    comandas: P0,
    sales: P1,
    queue: P1,
    clients: P1,
    preparations: P1,
    tenant: P2,
    products: P2,
    staff: P2,
  };

  var OPERATION_PRIORITY = {
    emergency_comanda: P0,
    comanda: P0,
    runtime: P0,
    sale: P1,
    shift_close: P1,
    factura: P1,
    client: P1,
    pedido_interno: P1,
    preparation: P1,
    recepcion: P2,
    oficina_factura: P2,
    planilla_feed: P2,
    product: P2,
    catalog: P2,
    tenant: P2,
    audit: P2,
    staff: P2,
    marcation: P2,
  };

  var PAGE_PRIORITY = {};
  var PAGE_PROFILES = {};
  var P0_PAGES = {};
  var P1_PAGES = {};
  var P2_PAGES = {};

  function buildDerivedMaps() {
    Object.keys(PAGE_REGISTRY).forEach(function (pg) {
      var e = PAGE_REGISTRY[pg];
      PAGE_PRIORITY[pg] = e.p;
      PAGE_PROFILES[pg] = {
        domains: (e.domains || []).slice(),
        intervalMs: e.intervalMs || 60000,
        navOnly: !!e.navOnly,
        basico: e.basico,
        note: e.note || '',
      };
      if (e.p === P0) P0_PAGES[pg] = 1;
      else if (e.p === P1) P1_PAGES[pg] = 1;
      else P2_PAGES[pg] = 1;
    });
  }
  buildDerivedMaps();

  var __bgTimer = null;
  var BG_TICK_MS = 240000;

  function safe(fn) {
    try {
      return fn();
    } catch (_) {
      return undefined;
    }
  }

  function resolvePage(page) {
    var p = String(page || '').trim();
    if (!p) return p;
    if (PAGE_REGISTRY[p]) return p;
    if (PAGE_ALIASES[p]) return PAGE_ALIASES[p];
    try {
      if (global.CrozzoManifest && typeof global.CrozzoManifest.resolvePageAlias === 'function') {
        var canon = global.CrozzoManifest.resolvePageAlias(p);
        if (canon && PAGE_REGISTRY[canon]) return canon;
      }
    } catch (_) {}
    return p;
  }

  function resolvePageSyncPlan(page) {
    var canon = resolvePage(page);
    var reg = PAGE_REGISTRY[canon];
    if (reg) {
      return {
        page: canon,
        priority: reg.p,
        profile: PAGE_PROFILES[canon],
        registry: reg,
      };
    }
    return {
      page: canon,
      priority: P2,
      profile: { domains: ['tenant'], intervalMs: 90000, navOnly: false },
      registry: null,
    };
  }

  function priorityLabel(n) {
    if (n === P0) return 'realtime';
    if (n === P1) return 'nav';
    return 'background';
  }

  function zoneLabel(z) {
    if (z === Z0) return 'operacion';
    if (z === Z1) return 'nav';
    return 'defer';
  }

  function getPageZone(page) {
    page = resolvePage(page);
    if (!page) return Z1;
    if (P0_PAGES[page]) return Z0;
    if (Z3_DEFER_PAGES[page]) return Z3;
    return Z1;
  }

  function isDeferredPage(page) {
    return getPageZone(page) === Z3;
  }

  function activePageNow() {
    try {
      if (global.CrozzoPageCloudWatch && typeof global.CrozzoPageCloudWatch.getActivePage === 'function') {
        return resolvePage(global.CrozzoPageCloudWatch.getActivePage());
      }
    } catch (_) {}
    try {
      if (typeof global.currentPage !== 'undefined') return resolvePage(global.currentPage);
    } catch (_) {}
    return '';
  }

  function crozzoCloudBackgroundSyncAllowed(opts) {
    opts = opts || {};
    var kind = String(opts.kind || '');

    try {
      if (typeof global.crozzoCloudSyncSessionGateOpen === 'function' && !global.crozzoCloudSyncSessionGateOpen()) {
        if (!opts.force) return false;
      }
    } catch (_) {}

    var underPressure = false;
    try {
      var thr0 = global.CrozzoCloudThrottle;
      underPressure = !!(thr0 && typeof thr0.isUnderPressure === 'function' && thr0.isUnderPressure());
    } catch (_) {}

    var bypassKinds = [
      'nav_enter',
      'nav_leave',
      'flush',
      'beforeunload',
      'startup',
      'postInit',
      'post_login',
      'online',
      'reconnect',
      'reconnect_push',
      'reconnect_pull',
      'page_watch',
      'operational',
    ];
    var recoveryKinds = [
      'online',
      'reconnect',
      'reconnect_push',
      'reconnect_pull',
      'page_watch',
      'startup',
      'postInit',
      'post_login',
      'operational',
    ];
    var tierOk = true;
    try {
      if (typeof global.crozzoTierAllowsCloudSync === 'function') {
        tierOk = global.crozzoTierAllowsCloudSync();
      }
    } catch (_) {
      tierOk = false;
    }

    if (underPressure) {
      // Bajo presión se bloquea el tráfico normal, pero NO la recuperación cuando
      // vuelve internet/tier cloud — si no, el throttle se auto-perpetúa.
      if (opts.force || recoveryKinds.indexOf(kind) >= 0) {
        return tierOk;
      }
      return false;
    }

    if (opts.force || bypassKinds.indexOf(kind) >= 0) {
      return tierOk;
    }

    if (!tierOk) {
      return false;
    }

    var zone = getPageZone(activePageNow());

    // Sin kind: transportes realtime (runtime/comandas/ops pulse) — solo en operación.
    if (!kind || kind === 'realtime' || kind === 'transport') {
      return zone === Z0;
    }
    if (kind === 'background') {
      return zone !== Z3;
    }
    if (kind === 'queue') {
      return zone !== Z3;
    }
    return zone === Z0 || zone === Z1;
  }

  function crozzoCloudRealtimeAllowed(opts) {
    return crozzoCloudBackgroundSyncAllowed(Object.assign({ kind: 'realtime' }, opts || {}));
  }

  function getDomainPriority(domain) {
    var d = String(domain || '').trim();
    return DOMAIN_PRIORITY[d] != null ? DOMAIN_PRIORITY[d] : P2;
  }

  function getPagePriority(page) {
    return resolvePageSyncPlan(page).priority;
  }

  function getOperationPriority(type) {
    var t = String(type || '').trim().toLowerCase();
    return OPERATION_PRIORITY[t] != null ? OPERATION_PRIORITY[t] : P2;
  }

  function getPageProfile(page) {
    return resolvePageSyncPlan(page).profile;
  }

  function isOperationalPage(page) {
    return !!P0_PAGES[resolvePage(page)];
  }

  function isNavPage(page) {
    return !!P1_PAGES[resolvePage(page)];
  }

  function isBasicoLaunchPage(page, perfilTipo) {
    var plan = resolvePageSyncPlan(page);
    var b = plan.registry && plan.registry.basico;
    if (!b) return false;
    if (b === 'both') return true;
    var perfil = String(perfilTipo || '').trim();
    if (!perfil) {
      try {
        perfil = String(global.localStorage.getItem('crozzo_perfil_empresa') || 'basico_restaurante');
      } catch (_) {
        perfil = 'basico_restaurante';
      }
    }
    if (perfil.indexOf('tienda') >= 0) return b === 'tienda' || b === 'both';
    if (perfil.indexOf('restaurante') >= 0) return b === 'restaurante' || b === 'both';
    return b === 'both';
  }

  function domainIntervalMs(domain, page, baseMs) {
    var pr = getDomainPriority(domain);
    var ms = baseMs || 30000;
    if (pr === P0) return ms;
    if (pr === P1) return Math.max(ms, 45000);
    return Math.max(ms, 35000);
  }

  function shouldBypassThrottle(priority, opts) {
    opts = opts || {};
    if (opts.force) return true;
    var kind = String(opts.kind || '');
    if (priority <= P1 && (kind === 'nav_enter' || kind === 'nav_leave' || kind === 'flush' || kind === 'realtime')) {
      return true;
    }
    return false;
  }

  function sortQueueByPriority(rows) {
    if (!Array.isArray(rows) || rows.length < 2) return rows || [];
    return rows.slice().sort(function (a, b) {
      var pa = a.syncPriority != null ? a.syncPriority : getOperationPriority(a.type);
      var pb = b.syncPriority != null ? b.syncPriority : getOperationPriority(b.type);
      if (pa !== pb) return pa - pb;
      return (Number(a.ts) || 0) - (Number(b.ts) || 0);
    });
  }

  function tagOperation(op) {
    if (!op || op.syncPriority != null) return op;
    var pr = getOperationPriority(op.type);
    return Object.assign({}, op, { syncPriority: pr });
  }

  function getSyncCatalog() {
    var out = [];
    Object.keys(PAGE_REGISTRY).forEach(function (pg) {
      var e = PAGE_REGISTRY[pg];
      out.push({
        page: pg,
        priority: e.p,
        zone: getPageZone(pg),
        zoneLabel: zoneLabel(getPageZone(pg)),
        label: priorityLabel(e.p),
        basico: e.basico,
        domains: e.domains || [],
        navOnly: !!e.navOnly,
        note: e.note || '',
      });
    });
    out.sort(function (a, b) {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.page.localeCompare(b.page);
    });
    return out;
  }

  function pushOperationalNow(reason) {
    safe(function () {
      if (typeof global.crozzoSchedulePosRuntimeCloudPush === 'function') {
        global.crozzoSchedulePosRuntimeCloudPush(reason === 'leave' ? 'flush' : 'fast');
      }
    });
    safe(function () {
      if (reason === 'leave' && typeof global.crozzoPushPosRuntimeCloudNow === 'function') {
        global.crozzoPushPosRuntimeCloudNow().catch(function () {});
      }
    });
  }

  function pushQueueNow(opts) {
    opts = opts || {};
    safe(function () {
      if (typeof global.syncOfflineQueue === 'function') {
        global.syncOfflineQueue({
          force: !!opts.force,
          kind: opts.kind || 'nav_leave',
          priority: opts.priority != null ? opts.priority : P1,
        }).catch(function () {});
      }
    });
  }

  function onPageLeave(page) {
    page = resolvePage(page);
    if (!page) return;
    var pr = getPagePriority(page);
    if (pr === P0) {
      pushOperationalNow('leave');
    }
    if (pr <= P1) {
      pushQueueNow({ force: true, kind: 'nav_leave', priority: P1 });
    }
    if (pr === P1 || page === 'facturas' || page === 'cierre-caja' || page.indexOf('compras-proceso') >= 0) {
      pushQueueNow({ force: true, kind: 'nav_leave_' + page, priority: P1 });
    }
  }

  function onPageEnter(page) {
    page = resolvePage(page);
    if (!page) return;
    var pr = getPagePriority(page);
    if (pr === P0) {
      pushOperationalNow('enter');
    }
    if (pr === P1 && global.CrozzoPageCloudWatch && typeof global.CrozzoPageCloudWatch.runNavPull === 'function') {
      safe(function () {
        global.CrozzoPageCloudWatch.runNavPull(page).catch(function () {});
      });
    }
  }

  function startBackgroundScheduler() {
    if (__bgTimer) return;
    __bgTimer = global.setInterval(function () {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (getPageZone(activePageNow()) === Z3) return;
      var thr = global.CrozzoCloudThrottle;
      if (thr && typeof thr.isUnderPressure === 'function' && thr.isUnderPressure()) return;
      safe(function () {
        if (typeof global.syncOfflineQueue === 'function') {
          global.syncOfflineQueue({ kind: 'background', priority: P2 }).catch(function () {});
        }
      });
    }, BG_TICK_MS);
  }

  function stopBackgroundScheduler() {
    if (__bgTimer) {
      global.clearInterval(__bgTimer);
      __bgTimer = null;
    }
  }

  global.CrozzoCloudSyncPriorities = {
    P0: P0,
    P1: P1,
    P2: P2,
    Z0: Z0,
    Z1: Z1,
    Z3: Z3,
    REALTIME: P0,
    NAV: P1,
    BACKGROUND: P2,
    ZONE_OPERATION: Z0,
    ZONE_NAV: Z1,
    ZONE_DEFER: Z3,
    Z3_DEFER_PAGES: Z3_DEFER_PAGES,
    PAGE_ALIASES: PAGE_ALIASES,
    PAGE_REGISTRY: PAGE_REGISTRY,
    DOMAIN_PRIORITY: DOMAIN_PRIORITY,
    OPERATION_PRIORITY: OPERATION_PRIORITY,
    PAGE_PRIORITY: PAGE_PRIORITY,
    PAGE_PROFILES: PAGE_PROFILES,
    P0_PAGES: P0_PAGES,
    P1_PAGES: P1_PAGES,
    P2_PAGES: P2_PAGES,
    resolvePage: resolvePage,
    resolvePageSyncPlan: resolvePageSyncPlan,
    getSyncCatalog: getSyncCatalog,
    getDomainPriority: getDomainPriority,
    getPagePriority: getPagePriority,
    getOperationPriority: getOperationPriority,
    getPageProfile: getPageProfile,
    isOperationalPage: isOperationalPage,
    isNavPage: isNavPage,
    isBasicoLaunchPage: isBasicoLaunchPage,
    domainIntervalMs: domainIntervalMs,
    shouldBypassThrottle: shouldBypassThrottle,
    sortQueueByPriority: sortQueueByPriority,
    tagOperation: tagOperation,
    priorityLabel: priorityLabel,
    zoneLabel: zoneLabel,
    getPageZone: getPageZone,
    isDeferredPage: isDeferredPage,
    activePageNow: activePageNow,
    onPageLeave: onPageLeave,
    onPageEnter: onPageEnter,
    pushOperationalNow: pushOperationalNow,
    pushQueueNow: pushQueueNow,
    startBackgroundScheduler: startBackgroundScheduler,
    stopBackgroundScheduler: stopBackgroundScheduler,
  };

  global.crozzoSyncPriorityForType = getOperationPriority;
  global.crozzoSyncPriorityForPage = getPagePriority;
  global.crozzoSyncZoneForPage = getPageZone;
  global.crozzoResolveCloudSyncPage = resolvePage;
  global.crozzoCloudBackgroundSyncAllowed = crozzoCloudBackgroundSyncAllowed;
  global.crozzoCloudRealtimeAllowed = crozzoCloudRealtimeAllowed;
  global.CrozzoCloudSyncPriorities.crozzoCloudBackgroundSyncAllowed = crozzoCloudBackgroundSyncAllowed;
  global.CrozzoCloudSyncPriorities.crozzoCloudRealtimeAllowed = crozzoCloudRealtimeAllowed;
})(typeof window !== 'undefined' ? window : globalThis);
