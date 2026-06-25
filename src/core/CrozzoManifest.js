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

  /** Tras el bundle, fuente en modules/ gana (dev sin re-consolidar). */
  var RESERVORIO_CANONICAL = [M + 'CrozzoReservorio.js', M + 'CrozzoReservorioOffline.js'];

  /** Dependencias de bundles + módulos canónicos (sobreescriben copias embebidas en bundles). */
  var PROCESOS_STACK = [
    BUNDLES.compras,
    BUNDLES.costos,
    BUNDLES.reservorio,
    'vendor/CrozzoJsPdf.js',
    M + 'CrozzoBonaOrigen.js',
    M + 'CrozzoProcesosSesion.js',
    M + 'CrozzoRecetarioCocina.js',
    M + 'CrozzoCentroProcesos.js',
  ];

  /** Alias sidebar → vista interna (disponible antes de cargar CrozzoCentroProcesos). */
  var PROCESOS_PAGE_VIEWS = {
    'compras-cortes': 'home',
    'compras-proceso-sesion': 'form',
    'compras-proceso-historial': 'hist',
    'compras-recetario-cocina': 'recetario',
    'centro-procesos': 'home',
  };

  function procesosPageToView(page) {
    var p = String(page || '').trim();
    if (PROCESOS_PAGE_VIEWS[p]) return PROCESOS_PAGE_VIEWS[p];
    try {
      if (typeof global.crozzoProcesosPageToView === 'function') {
        return global.crozzoProcesosPageToView(p);
      }
    } catch (_) {}
    return null;
  }

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
    'compras-dashboard': [BUNDLES.compras, BUNDLES.reservorio, M + 'CrozzoComprasDashboard.js'],
    'compras-proveedores': ['vendor/CrozzoPdfJs.js', BUNDLES.compras, BUNDLES.reservorio],
    'compras-recepcion': [
      'vendor/CrozzoJsQR.js',
      'vendor/CrozzoPdfJs.js',
      M + 'CrozzoRecepcionFeDian.js',
      M + 'CrozzoRecepcionFeBanco.js',
      BUNDLES.compras,
      BUNDLES.costos,
      BUNDLES.reservorio,
      M + 'CrozzoRecepcionFacturas.js',
    ],
    'compras-ordenes': ['vendor/CrozzoPdfJs.js', BUNDLES.compras, BUNDLES.reservorio],
    'compras-cotizaciones': ['vendor/CrozzoPdfJs.js', BUNDLES.compras, BUNDLES.costos, BUNDLES.reservorio],
    'centro-compras': [BUNDLES.compras, BUNDLES.reservorio, MODULES.integrados, M + 'CrozzoOficinaHub.js', M + 'CrozzoComprasLocal.js'],
    'compras-oficina': [
      BUNDLES.compras,
      BUNDLES.reservorio,
      MODULES.integrados,
      M + 'CrozzoProveedorDocumentos.js',
      M + 'CrozzoOficinaHub.js',
      M + 'CrozzoComprasLocal.js',
    ],
    'operaciones-qyc': [BUNDLES.compras, BUNDLES.reservorio, MODULES.integrados, M + 'CrozzoComprasLocal.js'],
    'centro-procesos': PROCESOS_STACK.slice(),
    'compras-cortes': PROCESOS_STACK.slice(),
    'compras-proceso-sesion': PROCESOS_STACK.slice(),
    'compras-proceso-entrada': [
      'vendor/CrozzoJsQR.js',
      'vendor/CrozzoPdfJs.js',
      M + 'CrozzoRecepcionFeDian.js',
      M + 'CrozzoRecepcionFeBanco.js',
      BUNDLES.compras,
      BUNDLES.costos,
      BUNDLES.reservorio,
      M + 'CrozzoRecepcionFacturas.js',
    ],
    'compras-proceso-historial': PROCESOS_STACK.slice(),
    'sistema-costos': [
      'vendor/CrozzoJsPdf.js',
      BUNDLES.costos,
      BUNDLES.reservorio,
      M + 'CrozzoPedidosInternosEngine.js',
      M + 'CrozzoCatalogoMp.js',
      M + 'CrozzoMatrizMp.js',
      M + 'CrozzoCosteoMp.js',
      M + 'CrozzoCostosBulkImport.js',
      M + 'CrozzoSistemaCostos.js',
      M + 'CrozzoFlujosMapaPdf.js',
      M + 'CrozzoCostosReportesPdf.js',
    ],
    'costos-matriz': [
      'vendor/CrozzoJsPdf.js',
      BUNDLES.costos,
      BUNDLES.reservorio,
      M + 'CrozzoPedidosInternosEngine.js',
      M + 'CrozzoCatalogoMp.js',
      M + 'CrozzoMatrizMp.js',
      M + 'CrozzoCosteoMp.js',
      M + 'CrozzoCostosBulkImport.js',
      M + 'CrozzoSistemaCostos.js',
      M + 'CrozzoFlujosMapaPdf.js',
      M + 'CrozzoCostosReportesPdf.js',
    ],
    'costos-inventario': [
      BUNDLES.costos,
      BUNDLES.reservorio,
      M + 'CrozzoCatalogoMp.js',
      M + 'CrozzoCosteoMp.js',
      M + 'CrozzoCostosBulkImport.js',
      M + 'CrozzoInventarioContinuo.js',
      M + 'CrozzoSistemaCostos.js',
    ],
    'costos-reservorio': [BUNDLES.costos, BUNDLES.reservorio],
    'costos-planilla-feed': [BUNDLES.costos, BUNDLES.reservorio],
    'costos-federacion': [
      BUNDLES.costos,
      BUNDLES.reservorio,
      M + 'CrozzoCatalogoMp.js',
      M + 'CrozzoFederacionSql.js',
      M + 'CrozzoFederacionEngine.js',
      M + 'CrozzoFederacionOperaciones.js',
    ],
    'super-admin-federacion': [
      M + 'CrozzoFederacionSql.js',
      M + 'CrozzoFederacionEngine.js',
      M + 'CrozzoSuperAdminFederacion.js',
    ],
    'planilla-2026': [MODULES.planilla, MODULES.integrados],
    'nomina-planilla': [MODULES.planilla, MODULES.integrados],
    'pedidos-internos': [
      BUNDLES.reservorio,
      BUNDLES.costos,
      M + 'CrozzoCatalogoMp.js',
      MODULES.pedidosEngine,
      MODULES.integrados,
      MODULES.integradosPedidos,
    ],
    'control-acceso': [MODULES.integrados, MODULES.integradosAcceso],
    productos: [MODULES.sortable],
    'catalogo-mp': [BUNDLES.costos, BUNDLES.reservorio, M + 'CrozzoCatalogoMp.js', M + 'CrozzoMatrizMp.js'],
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
    if (p === 'sistema-costos-inv') return 'costos-inventario';
    if (p === 'sistema-costos-fed') return 'costos-federacion';
    if (p === 'sistema-costos-matriz') return 'costos-matriz';
    if (p === 'punto-venta') return 'cajero';
    if (p === 'compras-proceso-entrada') return 'compras-recepcion';
    try {
      if (procesosPageToView(p)) {
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

  function appendReservorioCanonical(list) {
    if (!list || list.indexOf(BUNDLES.reservorio) < 0) return list;
    RESERVORIO_CANONICAL.forEach(function (src) {
      if (list.indexOf(src) < 0) list.push(src);
    });
    return list;
  }

  function scriptsForPage(page) {
    var canonical = resolvePageAlias(page);
    var list = PAGE_SCRIPTS[canonical] ? PAGE_SCRIPTS[canonical].slice() : [];
    if (global.__crozzoHoneypotLive && global.__crozzoHoneypotLive.active) {
      if (list.indexOf(MODULES.honeypot) < 0) list.unshift(MODULES.honeypot);
    }
    return appendReservorioCanonical(list);
  }

  global.CrozzoManifest = {
    bundles: BUNDLES,
    modules: MODULES,
    pageScripts: PAGE_SCRIPTS,
    procesosPageToView: procesosPageToView,
    resolvePageAlias: resolvePageAlias,
    scriptsForPage: scriptsForPage,
  };
  global.crozzoProcesosPageToView = procesosPageToView;
})(typeof window !== 'undefined' ? window : globalThis);
