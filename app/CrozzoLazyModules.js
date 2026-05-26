/**
 * Carga diferida de módulos pesados — no bloquean arranque ni el editor.
 */
(function (global) {
  'use strict';

  var loaded = {};
  var loading = {};

  function loadOne(src) {
    if (loaded[src]) return loaded[src];
    if (loading[src]) return loading[src];
    loading[src] = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.defer = true;
      s.onload = function () {
        loaded[src] = true;
        resolve();
      };
      s.onerror = function () {
        reject(new Error('No se pudo cargar ' + src));
      };
      document.head.appendChild(s);
    });
    return loading[src];
  }

  function loadAll(list) {
    var chain = Promise.resolve();
    list.forEach(function (src) {
      chain = chain.then(function () {
        return loadOne(src);
      });
    });
    return chain;
  }

  /** Página → scripts necesarios (orden importa) */
  var PAGE_SCRIPTS = {
    'planilla-2026': ['CrozzoPlanilla2026.js', 'CrozzoModulosIntegrados.js'],
    'nomina-planilla': ['CrozzoPlanilla2026.js', 'CrozzoModulosIntegrados.js'],
    'pedidos-internos': ['CrozzoModulosIntegrados.js', 'CrozzoModulosIntegradosPedidos.js'],
    'control-acceso': ['CrozzoModulosIntegrados.js', 'CrozzoModulosIntegradosAcceso.js'],
  };

  function scriptsForPage(page) {
    var list = PAGE_SCRIPTS[page] ? PAGE_SCRIPTS[page].slice() : [];
    if (page === 'productos' || page === 'gestion-perfiles-menus') {
      if (list.indexOf('https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/Sortable.min.js') < 0) {
        list.push('https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/Sortable.min.js');
      }
    }
    return list;
  }

  function preloadIdle() {
    var idle = global.requestIdleCallback || function (cb) {
      setTimeout(cb, 1200);
    };
    idle(function () {
      loadOne('CrozzoHoneypotSim.js').catch(function () {});
    });
  }

  function wrapNavigation() {
    if (global.__crozzoLazyNavWrapped) return;
    if (typeof global.navigateTo !== 'function') return;
    global.__crozzoLazyNavWrapped = true;
    var orig = global.navigateTo;
    global.navigateTo = function (page) {
      var navArgs = arguments;
      var scripts = scriptsForPage(page);
      if (!scripts.length) return orig.apply(this, navArgs);
      loadAll(scripts)
        .then(function () {
          orig.apply(global, navArgs);
        })
        .catch(function (e) {
          console.warn('[crozzo-lazy]', e);
          orig.apply(global, navArgs);
        });
    };
    var origRender = global.renderPage;
    if (typeof origRender === 'function') {
      global.renderPage = function (page) {
        var renderArgs = arguments;
        var scripts = scriptsForPage(page);
        if (!scripts.length) return origRender.apply(this, renderArgs);
        loadAll(scripts)
          .then(function () {
            origRender.apply(global, renderArgs);
          })
          .catch(function (e) {
            console.warn('[crozzo-lazy render]', e);
            origRender.apply(global, renderArgs);
          });
      };
    }
  }

  function init() {
    preloadIdle();
    var tries = 0;
    var poll = setInterval(function () {
      tries++;
      wrapNavigation();
      if (global.__crozzoLazyNavWrapped || tries > 200) clearInterval(poll);
    }, 25);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.crozzoLoadModule = loadOne;
  global.crozzoLoadModules = loadAll;
})(typeof window !== 'undefined' ? window : globalThis);
