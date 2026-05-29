/**
 * Mapa único de assets Crozzo — rutas y carga diferida por pantalla.
 * Editar aquí al añadir módulos; regenerar bundles: npm run consolidate
 */
(function (global) {
  'use strict';

  var B = 'bundles/';
  var M = 'modules/';

  var BUNDLES = {
    reservorio: B + 'CrozzoBundleReservorio.js',
    compras: B + 'CrozzoBundleCompras.js',
    costos: B + 'CrozzoBundleCostos.js',
  };

  var MODULES = {
    planilla: M + 'CrozzoPlanilla2026.js',
    integrados: M + 'CrozzoModulosIntegrados.js',
    integradosPedidos: M + 'CrozzoModulosIntegradosPedidos.js',
    pedidosEngine: M + 'CrozzoPedidosInternosEngine.js',
    integradosAcceso: M + 'CrozzoModulosIntegradosAcceso.js',
    honeypot: M + 'CrozzoHoneypotSim.js',
    sortable: 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/Sortable.min.js',
  };

  /** Pantallas → scripts (orden importa) */
  var PAGE_SCRIPTS = {
    inventarios: [BUNDLES.compras, BUNDLES.reservorio],
    'compras-dashboard': [BUNDLES.compras, BUNDLES.reservorio],
    'compras-proveedores': ['vendor/CrozzoPdfJs.js', BUNDLES.compras, BUNDLES.reservorio],
    'compras-recepcion': ['vendor/CrozzoJsQR.js', 'vendor/CrozzoPdfJs.js', BUNDLES.compras, BUNDLES.costos, BUNDLES.reservorio],
    'compras-ordenes': ['vendor/CrozzoPdfJs.js', BUNDLES.compras, BUNDLES.reservorio],
    'compras-cotizaciones': ['vendor/CrozzoPdfJs.js', BUNDLES.compras, BUNDLES.costos, BUNDLES.reservorio],
    'centro-compras': [BUNDLES.compras, BUNDLES.reservorio, MODULES.integrados],
    'compras-oficina': [BUNDLES.compras, BUNDLES.reservorio, MODULES.integrados],
    'operaciones-qyc': [BUNDLES.compras, BUNDLES.reservorio, MODULES.integrados],
    'centro-procesos': [BUNDLES.compras, BUNDLES.reservorio],
    'compras-cortes': [BUNDLES.compras, BUNDLES.reservorio],
    'compras-proceso-sesion': [BUNDLES.compras, BUNDLES.reservorio],
    'compras-proceso-entrada': ['vendor/CrozzoPdfJs.js', BUNDLES.compras, BUNDLES.costos, BUNDLES.reservorio],
    'compras-proceso-historial': [BUNDLES.compras, BUNDLES.reservorio],
    'sistema-costos': [
      'vendor/CrozzoJsPdf.js',
      BUNDLES.costos,
      BUNDLES.reservorio,
      M + 'CrozzoPedidosInternosEngine.js',
    ],
    'costos-matriz': [
      'vendor/CrozzoJsPdf.js',
      BUNDLES.costos,
      BUNDLES.reservorio,
      M + 'CrozzoPedidosInternosEngine.js',
    ],
    'costos-inventario': [BUNDLES.costos, BUNDLES.reservorio],
    'costos-reservorio': [BUNDLES.costos, BUNDLES.reservorio],
    'costos-planilla-feed': [BUNDLES.costos, BUNDLES.reservorio],
    'planilla-2026': [MODULES.planilla, MODULES.integrados],
    'nomina-planilla': [MODULES.planilla, MODULES.integrados],
    'pedidos-internos': [BUNDLES.reservorio, BUNDLES.costos, MODULES.pedidosEngine, MODULES.integrados, MODULES.integradosPedidos],
    'control-acceso': [MODULES.integrados, MODULES.integradosAcceso],
    productos: [MODULES.sortable],
    'catalogo-mp': [BUNDLES.costos, BUNDLES.reservorio],
    'gestion-perfiles-menus': [MODULES.sortable],
  };

  /** Alinea alias de navigateTo con el mapa de scripts. */
  function resolvePageAlias(page) {
    var p = String(page || '').trim();
    if (!p) return p;
    if (p === 'nomina-planilla') return 'planilla-2026';
    if (p === 'compras-ordenes') return 'centro-compras';
    if (p === 'compras-oficina') return 'centro-compras';
    if (p === 'costos-sql') return 'costos-reservorio';
    try {
      if (typeof global.crozzoProcesosPageToView === 'function' && global.crozzoProcesosPageToView(p)) {
        return 'centro-procesos';
      }
      if (typeof global.crozzoComprasPageToModule === 'function' && global.crozzoComprasPageToModule(p)) {
        return 'centro-compras';
      }
      if (typeof global.crozzoResolveLegacyComprasPage === 'function') {
        var leg = global.crozzoResolveLegacyComprasPage(p);
        if (leg && leg.page) return leg.page;
      }
    } catch (_) {}
    return p;
  }

  function scriptsForPage(page) {
    var canonical = resolvePageAlias(page);
    var list = PAGE_SCRIPTS[canonical] ? PAGE_SCRIPTS[canonical].slice() : [];
    if (global.__crozzoHoneypotLive && global.__crozzoHoneypotLive.active) {
      if (list.indexOf(MODULES.honeypot) < 0) list.unshift(MODULES.honeypot);
    }
    return list;
  }

  global.CrozzoManifest = {
    bundles: BUNDLES,
    modules: MODULES,
    pageScripts: PAGE_SCRIPTS,
    resolvePageAlias: resolvePageAlias,
    scriptsForPage: scriptsForPage,
  };
})(typeof window !== 'undefined' ? window : globalThis);
