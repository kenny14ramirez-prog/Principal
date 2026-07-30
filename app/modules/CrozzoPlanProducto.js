/**
 * Crozzo — planProducto (H2.E)
 * --------------------------------------------------------------------------
 * 3ª dimensión ortogonal a perfil operativo y madurez fiscal.
 *   basico | medio | grande
 * Default: basico. Subir plan = decisión manual del comerciante.
 *
 * NO mutar crozzoIsBasicoEmpresaPerfil ni PERFIL_ROLE_MENUS.
 * Gate: crozzoPageVisibleByPlan(page|menuId, plan)
 */
(function (global) {
  'use strict';

  var PLANES_OK = ['basico', 'medio', 'grande'];

  /** Páginas canónicas bloqueadas por plan (data-page). */
  var DENY_PAGES = {
    basico: [
      'config-conexiones-sistemas',
      'costos-federacion',
      'planilla-2026',
      'compras-dashboard',
      'auditoria'
    ],
    medio: ['costos-federacion', 'auditoria'],
    grande: []
  };

  /** Menús (data-menu) bloqueados — NO incluir centro-compras (rompe caja/encargado). */
  var DENY_MENUS = {
    basico: ['conexion-sistemas', 'sistema-costos-fed', 'nomina-planilla', 'auditoria'],
    medio: ['sistema-costos-fed', 'auditoria'],
    grande: []
  };

  var PLAN_META = {
    basico: {
      id: 'basico',
      label: 'Básico',
      desc: 'Venta, caja, inventario y rentabilidad esenciales.'
    },
    medio: {
      id: 'medio',
      label: 'Medio',
      desc: 'Conexiones, nómina/planilla y reportes avanzados.'
    },
    grande: {
      id: 'grande',
      label: 'Grande',
      desc: 'Federación, auditoría avanzada y consolidación.'
    }
  };

  function normalizePlan(plan) {
    var p = String(plan || 'basico').toLowerCase().trim();
    return PLANES_OK.indexOf(p) >= 0 ? p : 'basico';
  }

  function getPlanProducto() {
    try {
      var cfg = global.config;
      if (cfg && typeof cfg.getPlanProducto === 'function') return normalizePlan(cfg.getPlanProducto());
      if (cfg && cfg.madurez && cfg.madurez.planProducto) return normalizePlan(cfg.madurez.planProducto);
    } catch (_) {}
    return 'basico';
  }

  function setPlanProducto(plan) {
    var p = normalizePlan(plan);
    try {
      var cfg = global.config;
      if (cfg && typeof cfg.setPlanProducto === 'function') {
        cfg.setPlanProducto(p);
        return p;
      }
      if (cfg && cfg.madurez) {
        cfg.madurez.planProducto = p;
        if (typeof cfg.save === 'function') cfg.save();
      }
    } catch (_) {}
    return p;
  }

  function modulosBloqueados(plan) {
    var p = normalizePlan(plan);
    return {
      pages: (DENY_PAGES[p] || []).slice(),
      menus: (DENY_MENUS[p] || []).slice()
    };
  }

  /**
   * @param {string} pageOrMenu data-page o data-menu
   * @param {string} [plan]
   * @returns {boolean} true = visible/permitido
   */
  function crozzoPageVisibleByPlan(pageOrMenu, plan) {
    var id = String(pageOrMenu || '').trim();
    if (!id) return true;
    var p = normalizePlan(plan != null ? plan : getPlanProducto());
    if (p === 'grande') return true;
    var pages = DENY_PAGES[p] || [];
    var menus = DENY_MENUS[p] || [];
    if (pages.indexOf(id) >= 0) return false;
    if (menus.indexOf(id) >= 0) return false;
    // Alias PAGE_MENU_MAP: si el page mapea a menú denegado
    try {
      var map = global.CROZZO_PAGE_MENU_MAP;
      if (map && map[id] && menus.indexOf(map[id]) >= 0) return false;
    } catch (_) {}
    return true;
  }

  function sugerirSiguientePlan(plan) {
    var p = normalizePlan(plan);
    if (p === 'basico') return PLAN_META.medio;
    if (p === 'medio') return PLAN_META.grande;
    return null;
  }

  function metaPlan(plan) {
    return PLAN_META[normalizePlan(plan)] || PLAN_META.basico;
  }

  global.CrozzoPlanProducto = {
    PLANES_OK: PLANES_OK,
    PLAN_META: PLAN_META,
    normalizePlan: normalizePlan,
    getPlanProducto: getPlanProducto,
    setPlanProducto: setPlanProducto,
    modulosBloqueados: modulosBloqueados,
    crozzoPageVisibleByPlan: crozzoPageVisibleByPlan,
    sugerirSiguientePlan: sugerirSiguientePlan,
    metaPlan: metaPlan
  };
  global.crozzoPageVisibleByPlan = crozzoPageVisibleByPlan;
  global.crozzoGetPlanProducto = getPlanProducto;
  global.crozzoSetPlanProducto = setPlanProducto;
})(typeof window !== 'undefined' ? window : globalThis);
