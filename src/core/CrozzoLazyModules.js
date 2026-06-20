/**
 * Carga diferida de módulos pesados — no bloquean arranque ni el editor.
 * Rutas centralizadas en CrozzoManifest.js
 */
(function (global) {
  'use strict';

  var loaded = {};
  var loading = {};
  var lastEnsuredPage = '';
  var pageEnsurePromises = {};
  var lazyReady = false;
  var lazyReadyQueue = [];

  function bundleBasePath(src) {
    return String(src || '').split('?')[0];
  }

  function bundleSrc(src) {
    if (!global.__CROZZO_IS_TAURI__ || !src) return src;
    var isBundle = src.indexOf('bundles/') === 0;
    var isModule = src.indexOf('modules/') === 0;
    var isProcesosModule =
      src.indexOf('modules/CrozzoCentroProcesos') === 0 ||
      src.indexOf('modules/CrozzoProcesosSesion') === 0 ||
      src.indexOf('modules/CrozzoBonaOrigen') === 0 ||
      src.indexOf('modules/CrozzoRecetarioCocina') === 0;
    if (!isBundle && !isModule && !isProcesosModule) return src;
    var v =
      (global.CrozzoRecepcionFacturas && global.CrozzoRecepcionFacturas.version) ||
      (function () {
        try {
          var m = document.querySelector('meta[name="crozzo-app-version"]');
          return m && m.getAttribute('content');
        } catch (_) {
          return '';
        }
      })() ||
      'app';
    return src + (src.indexOf('?') >= 0 ? '&' : '?') + 'v=' + encodeURIComponent(v);
  }

  function loadOne(src) {
    var base = bundleBasePath(src);
    if (loaded[base]) return loaded[base];
    var url = bundleSrc(src);
    if (loading[base]) return loading[base];
    loading[base] = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = url;
      s.defer = true;
      s.onload = function () {
        loaded[base] = true;
        resolve();
      };
      s.onerror = function () {
        delete loading[base];
        reject(new Error('No se pudo cargar ' + url));
      };
      document.head.appendChild(s);
    });
    return loading[base];
  }

  function loadAll(list) {
    var seen = {};
    var unique = [];
    list.forEach(function (src) {
      if (!src || seen[src]) return;
      seen[src] = true;
      unique.push(src);
    });
    var chain = Promise.resolve();
    unique.forEach(function (src) {
      chain = chain.then(function () {
        return loadOne(src);
      });
    });
    return chain;
  }

  function scriptsForPage(page) {
    if (global.CrozzoManifest && typeof global.CrozzoManifest.scriptsForPage === 'function') {
      return global.CrozzoManifest.scriptsForPage(page);
    }
    return [];
  }

  function canonicalPage(page) {
    if (global.CrozzoManifest && typeof global.CrozzoManifest.resolvePageAlias === 'function') {
      return global.CrozzoManifest.resolvePageAlias(page);
    }
    return page;
  }

  function ensurePageModules(page, cb) {
    var key = canonicalPage(page);
    var cbDone = false;
    function finishCb() {
      if (cbDone) return;
      cbDone = true;
      if (typeof cb === 'function') cb();
    }
    var loadTimeout = setTimeout(function () {
      console.warn('[crozzo-lazy] module load timeout', key);
      finishCb();
    }, 25000);
    if (!pageEnsurePromises[key]) {
      pageEnsurePromises[key] = new Promise(function (resolve) {
        var scripts = scriptsForPage(page);
        if (!scripts.length) {
          lastEnsuredPage = key;
          resolve();
          return;
        }
        loadAll(scripts)
          .then(function () {
            lastEnsuredPage = key;
            resolve();
          })
          .catch(function (e) {
            console.warn('[crozzo-lazy]', e);
            delete pageEnsurePromises[key];
            lastEnsuredPage = key;
            resolve();
          });
      });
    }
    pageEnsurePromises[key].then(function () {
      clearTimeout(loadTimeout);
      finishCb();
    });
  }

  function preloadIdle() {
    var idle =
      global.requestIdleCallback ||
      function (cb) {
        setTimeout(cb, 2800);
      };
    idle(function () {
      var bundles =
        global.CrozzoManifest && global.CrozzoManifest.bundles ? global.CrozzoManifest.bundles : {};
      if (bundles.reservorio) loadOne(bundles.reservorio).catch(function () {});
      if (bundles.costos) loadOne(bundles.costos).catch(function () {});
      var hp =
        global.CrozzoManifest && global.CrozzoManifest.modules
          ? global.CrozzoManifest.modules.honeypot
          : 'modules/CrozzoHoneypotSim.js';
      loadOne(hp).catch(function () {});
    });
  }

  function wrapNavigation() {
    if (global.__crozzoLazyNavWrapped) return;
    if (typeof global.navigateTo !== 'function') return;
    global.__crozzoLazyNavWrapped = true;
    var origNav = global.navigateTo;
    global.__crozzoOrigNavigateTo = origNav;
    global.navigateTo = function (page) {
      var navArgs = arguments;
      if (global.__crozzoNavImmediate || global.__crozzoLazySkipRenderLoad) {
        return origNav.apply(global, navArgs);
      }
      var scripts = scriptsForPage(page);
      if (!scripts.length) {
        global.__crozzoLazySkipRenderLoad = true;
        try {
          return origNav.apply(global, navArgs);
        } finally {
          global.__crozzoLazySkipRenderLoad = false;
        }
      }
      if (typeof global.crozzoShowPageLoading === 'function') {
        global.crozzoShowPageLoading(page, { phase: 'modules', instant: true });
      }
      ensurePageModules(page, function () {
        global.__crozzoLazySkipRenderLoad = true;
        try {
          origNav.apply(global, navArgs);
        } catch (navErr) {
          console.warn('[crozzo-lazy] navigate', navErr);
        } finally {
          global.__crozzoLazySkipRenderLoad = false;
          if (typeof global.crozzoHidePageLoading === 'function') {
            global.crozzoHidePageLoading();
          }
        }
      });
    };
    var origRender = global.renderPage;
    if (typeof origRender === 'function') {
      global.renderPage = function (page) {
        var renderArgs = arguments;
        if (global.__crozzoLazySkipRenderLoad) {
          return origRender.apply(global, renderArgs);
        }
        ensurePageModules(page, function () {
          origRender.apply(global, renderArgs);
        });
      };
    }
  }

  function signalLazyReady() {
    if (lazyReady) return;
    lazyReady = true;
    while (lazyReadyQueue.length) {
      try {
        lazyReadyQueue.shift()();
      } catch (e) {
        console.warn('[crozzo-lazy] ready cb', e);
      }
    }
    try {
      global.dispatchEvent(new CustomEvent('crozzo-lazy-ready'));
    } catch (_) {}
  }

  global.crozzoWhenLazyReady = function (cb) {
    if (typeof cb !== 'function') return;
    if (lazyReady) {
      cb();
      return;
    }
    lazyReadyQueue.push(cb);
  };

  global.crozzoEnsureModulesForPage = function (page) {
    return new Promise(function (resolve) {
      ensurePageModules(page, resolve);
    });
  };

  function bootSequence() {
    wrapNavigation();
    preloadIdle();
    if (typeof global.initPOS === 'function') {
      try {
        global.initPOS();
      } catch (e) {
        console.warn('[crozzo-lazy] initPOS', e);
      }
    }
    signalLazyReady();
  }

  function init() {
    bootSequence();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.crozzoLoadModule = loadOne;
  global.crozzoLoadModules = loadAll;
})(typeof window !== 'undefined' ? window : globalThis);
