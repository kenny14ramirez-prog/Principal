/**
 * Pedidos internos — áreas desde comandas, ítems desde catálogo MP,
 * asignación por override manual, recetas (platos → areaComanda) o categoría.
 */
(function (global) {
  'use strict';

  var LS_CONFIG = 'crozzo_pedidos_internos_config_v1';

  /** Respaldo para migrar nombres del listado histórico QyC → área lógica */
  var LEGACY_NAME_AREA = {
    cocina: [
      'Chorizos', 'Pechuga', 'Carne Molida', 'Arepas', 'Queso Crema', 'Arroz', 'Cilantro', 'Tomate Chonto',
      'Papa', 'Huevo', 'Leche', 'Mantequilla', 'Aceite', 'Sal Refisal',
    ],
    bar: [
      'Café Cuarteron', 'Hielo', 'Leche Condensada', 'Chocolate', 'CocaCola Original', 'Pulpa de Lulo',
      'Naranja', 'Limón Tahiti', 'Té Chai',
    ],
    panaderia: ['Harina de Trigo', 'Azúcar', 'Arequipe', 'Margarina Astra', 'Queso Costeño'],
    desechables: ['Servilleta', 'Vaso', 'Bolsa', 'Pitillo', 'Guante', 'Contenedor'],
  };

  function norm(s) {
    return String(s || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function loadConfig() {
    try {
      var raw = localStorage.getItem(LS_CONFIG);
      if (raw) {
        var j = JSON.parse(raw);
        if (j && typeof j === 'object') {
          if (!j.overrides || typeof j.overrides !== 'object') j.overrides = {};
          return j;
        }
      }
    } catch (_) {}
    return { version: 1, overrides: {}, migratedLegacy: false };
  }

  function saveConfig(cfg) {
    try {
      localStorage.setItem(LS_CONFIG, JSON.stringify(cfg));
    } catch (_) {}
  }

  function getComandasAreas() {
    if (typeof global.getComandasConfig === 'function') {
      var cfg = global.getComandasConfig();
      if (cfg && Array.isArray(cfg.areas) && cfg.areas.length) return cfg.areas.slice();
    }
    return [{ id: 'COCINA', nombre: 'Cocina' }];
  }

  function matchAreaToken(token, areas) {
    var t = norm(token);
    if (!t) return null;
    for (var i = 0; i < areas.length; i++) {
      var a = areas[i];
      var id = norm(a.id);
      var nom = norm(a.nombre);
      if (t === id || t === nom) return a.id;
      if (nom && (nom.indexOf(t) >= 0 || t.indexOf(nom) >= 0)) return a.id;
      if (id && (id.indexOf(t) >= 0 || t.indexOf(id) >= 0)) return a.id;
    }
    return null;
  }

  function legacyAreaForNombre(nombre, areas) {
    var n = norm(nombre);
    var keys = ['cocina', 'bar', 'panaderia', 'desechables'];
    for (var k = 0; k < keys.length; k++) {
      var list = LEGACY_NAME_AREA[keys[k]] || [];
      for (var i = 0; i < list.length; i++) {
        if (norm(list[i]) === n) return matchAreaToken(keys[k], areas);
      }
      var hints = LEGACY_NAME_AREA[keys[k]];
      for (var j = 0; j < hints.length; j++) {
        if (n.indexOf(norm(hints[j])) >= 0 || norm(hints[j]).indexOf(n) >= 0) {
          return matchAreaToken(keys[k], areas);
        }
      }
    }
    return null;
  }

  function reservorioStore() {
    var rv = global.CrozzoReservorio;
    if (!rv || !rv.migrateLegacy) return null;
    return rv.migrateLegacy();
  }

  function posProducts() {
    if (typeof global.products !== 'undefined' && Array.isArray(global.products)) return global.products;
    return [];
  }

  function findProductForPlato(plato) {
    var slug = norm(plato.slug || '');
    var nombre = norm(plato.producto || '');
    var list = posProducts();
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (slug && norm(p.sku || '') === slug) return p;
      if (slug && norm(String(p.id)) === slug) return p;
      if (nombre && norm(p.nombre) === nombre) return p;
    }
    for (var j = 0; j < list.length; j++) {
      var q = list[j];
      if (nombre && norm(q.nombre).indexOf(nombre) >= 0) return q;
    }
    return null;
  }

  function getAllRecetas(st) {
    if (!st) return [];
    var out = [];
    if (Array.isArray(st.recetasPlatos)) out = st.recetasPlatos.slice();
    if (Array.isArray(st.recetas)) {
      st.recetas.forEach(function (r) {
        if (r && r.slug && !out.some(function (x) { return norm(x.slug) === norm(r.slug); })) out.push(r);
      });
    }
    if (st.recetaDemo && st.recetaDemo.slug) {
      if (!out.some(function (x) { return norm(x.slug) === norm(st.recetaDemo.slug); })) {
        out.push(st.recetaDemo);
      }
    }
    return out;
  }

  function collectRecipeLines(st) {
    var lines = [];
    getAllRecetas(st).forEach(function (rec) {
      if (rec && Array.isArray(rec.lineas)) lines = lines.concat(rec.lineas);
    });
    return lines;
  }

  function slugsUsingMp(mpId, st) {
    var id = String(mpId || '').trim();
    var slugs = {};
    getAllRecetas(st).forEach(function (rec) {
      if (!rec || !Array.isArray(rec.lineas) || !rec.slug) return;
      var uses = rec.lineas.some(function (ln) {
        return String(ln.mpId || '').trim() === id;
      });
      if (uses) slugs[rec.slug] = true;
    });
    return Object.keys(slugs);
  }

  function inferAreaFromRecipes(mpId, areas) {
    var st = reservorioStore();
    if (!st) return null;
    var votes = {};
    var slugs = slugsUsingMp(mpId, st);
    var menu = Array.isArray(st.menuCostos) ? st.menuCostos : [];
    slugs.forEach(function (slug) {
      var plato = menu.find(function (r) {
        return norm(r.slug) === norm(slug);
      });
      if (!plato) plato = menu.find(function (r) {
        return norm(r.producto) === norm(slug);
      });
      if (!plato) return;
      var prod = findProductForPlato(plato);
      if (prod && prod.areaComanda) {
        var aid = String(prod.areaComanda).trim();
        votes[aid] = (votes[aid] || 0) + 1;
      }
    });
    var best = null;
    var bestN = 0;
    Object.keys(votes).forEach(function (k) {
      if (votes[k] > bestN) {
        bestN = votes[k];
        best = k;
      }
    });
    if (best && areas.some(function (a) {
      return a.id === best;
    })) return best;
    if (best) return matchAreaToken(best, areas) || areas[0].id;
    return null;
  }

  function inferAreaFromCategory(categoria, areas) {
    var c = norm(categoria);
    if (c.indexOf('desech') >= 0) return matchAreaToken('desechables', areas) || matchAreaToken('desechable', areas);
    if (c.indexOf('bebida') >= 0 || c.indexOf('licor') >= 0 || c.indexOf('pulpa') >= 0) {
      return matchAreaToken('bar', areas) || matchAreaToken('frio', areas);
    }
    if (c.indexOf('panad') >= 0 || c.indexOf('harina') >= 0 || c.indexOf('reposter') >= 0) {
      return matchAreaToken('panaderia', areas);
    }
    return matchAreaToken('cocina', areas) || (areas[0] && areas[0].id);
  }

  function formatCategoriaLabel(cat) {
    var c = String(cat || 'OTRO').trim();
    return c
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, function (ch) {
        return ch.toUpperCase();
      });
  }

  function normRol(rol) {
    return String(rol || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/-/g, '_');
  }

  function isAdminEditor() {
    var u = typeof global.getCurrentUser === 'function' ? global.getCurrentUser() : null;
    if (!u) return false;
    var r = normRol(u.rol);
    return (
      r === 'superadmin' ||
      r === 'super_admin' ||
      r === 'admin' ||
      r === 'gerente' ||
      r === 'chef' ||
      r === 'jefe_compras' ||
      r === 'jefe_compras'
    );
  }

  function resolveMpArea(mp, areas, cfg) {
    var id = String(mp.id || '').trim();
    var ov = cfg.overrides[id];
    if (ov && ov.areaId) return ov.areaId;
    if (mp.areaPedido) return mp.areaPedido;
    var fromRecipe = inferAreaFromRecipes(id, areas);
    if (fromRecipe) return fromRecipe;
    var legacy = legacyAreaForNombre(mp.nombre, areas);
    if (legacy) return legacy;
    return inferAreaFromCategory(mp.categoria, areas) || (areas[0] && areas[0].id);
  }

  function migrateLegacyNames(cfg, areas) {
    if (cfg.migratedLegacy) return;
    var C = global.CrozzoCatalogoMp;
    if (!C || !C.list) return;
    C.list().forEach(function (mp) {
      var la = legacyAreaForNombre(mp.nombre, areas);
      if (la && !cfg.overrides[mp.id]) {
        cfg.overrides[mp.id] = { areaId: la, source: 'legacy' };
      }
    });
    cfg.migratedLegacy = true;
    saveConfig(cfg);
  }

  function buildAreaPanels(opts) {
    opts = opts || {};
    var areas = getComandasAreas();
    var cfg = loadConfig();
    migrateLegacyNames(cfg, areas);
    var C = global.CrozzoCatalogoMp;
    if (!C || !C.list) {
      return areas.map(function (a) {
        return { id: a.id, label: a.nombre || a.id, sections: [] };
      });
    }
    var items = C.list().filter(function (mp) {
      return mp && mp.activo !== false && mp.nombre;
    });
    var buckets = {};
    areas.forEach(function (a) {
      buckets[a.id] = {};
    });

    items.forEach(function (mp) {
      var ov = cfg.overrides[mp.id] || {};
      if (ov.hidden) return;
      var areaId = resolveMpArea(mp, areas, cfg);
      if (!buckets[areaId]) buckets[areaId] = {};
      var sec = ov.seccion || formatCategoriaLabel(mp.categoria);
      if (!buckets[areaId][sec]) buckets[areaId][sec] = [];
      buckets[areaId][sec].push({
        mpId: mp.id,
        nombre: mp.nombre,
        categoria: mp.categoria,
        areaId: areaId,
        areaSource: ov.areaId ? 'manual' : mp.areaPedido ? 'catalogo' : inferAreaFromRecipes(mp.id, areas) ? 'receta' : 'categoria',
      });
    });

    return areas.map(function (a) {
      var secs = buckets[a.id] || {};
      var sections = Object.keys(secs)
        .sort(function (x, y) {
          return x.localeCompare(y, 'es');
        })
        .map(function (sec) {
          return {
            sec: sec,
            items: secs[sec].sort(function (p, q) {
              return String(p.nombre).localeCompare(String(q.nombre), 'es');
            }),
          };
        });
      return {
        id: a.id,
        label: a.nombre || a.id,
        sections: sections,
      };
    });
  }

  function areaLabel(areaId) {
    var areas = getComandasAreas();
    var hit = areas.find(function (a) {
      return a.id === areaId;
    });
    return hit ? hit.nombre || hit.id : areaId;
  }

  function setOverride(mpId, patch) {
    var cfg = loadConfig();
    var id = String(mpId || '').trim();
    if (!id) return;
    cfg.overrides[id] = Object.assign({}, cfg.overrides[id] || {}, patch);
    saveConfig(cfg);
  }

  function recalcAllFromRecipes() {
    var cfg = loadConfig();
    var areas = getComandasAreas();
    var C = global.CrozzoCatalogoMp;
    if (!C || !C.list) return 0;
    var n = 0;
    C.list().forEach(function (mp) {
      var ar = inferAreaFromRecipes(mp.id, areas);
      if (ar) {
        cfg.overrides[mp.id] = Object.assign({}, cfg.overrides[mp.id] || {}, { areaId: ar, source: 'receta' });
        n++;
      }
    });
    saveConfig(cfg);
    return n;
  }

  global.CrozzoPedidosInternosEngine = {
    LS_CONFIG: LS_CONFIG,
    loadConfig: loadConfig,
    saveConfig: saveConfig,
    getComandasAreas: getComandasAreas,
    buildAreaPanels: buildAreaPanels,
    areaLabel: areaLabel,
    resolveMpArea: resolveMpArea,
    inferAreaFromRecipes: inferAreaFromRecipes,
    setOverride: setOverride,
    recalcAllFromRecipes: recalcAllFromRecipes,
    isAdminEditor: isAdminEditor,
    formatCategoriaLabel: formatCategoriaLabel,
    matchAreaToken: matchAreaToken,
  };
})(typeof window !== 'undefined' ? window : globalThis);
