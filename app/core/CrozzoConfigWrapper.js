/**
 * Crozzo POS — Config Wrapper (Fase -2 PoC)
 * -----------------------------------------
 * Envuelve global.config para añadir dual-write de facturas a SQLite
 * sin modificar el monolito. Se activa con feature flag useSqliteFiscal.
 *
 * Uso: incluir después de CrozzoPosConfigManager.js en el HTML.
 *       CrozzoConfigWrapper.wrap()  (idempotente)
 */
(function (global) {
  'use strict';

  var _wrapped = false;

  function wrap() {
    if (_wrapped) return;
    if (!global.config || typeof global.config.save !== 'function') return;
    var origSave = global.config.save.bind(global.config);
    global.config.save = function () {
      var r = origSave();
      // Dual-write facturas (fire-and-forget)
      try {
        if (global.CrozzoFeatureFlags && global.CrozzoFeatureFlags.isEnabled('useSqliteFiscal')) {
          if (global.CrozzoFiscalDualWrite && typeof global.CrozzoFiscalDualWrite.saveFacturas === 'function') {
            var facturas = (typeof global.config.getFacturas === 'function') ? global.config.getFacturas() : null;
            if (Array.isArray(facturas)) {
              global.CrozzoFiscalDualWrite.saveFacturas(facturas).catch(function () {});
            }
          }
        }
      } catch (_) {}
      return r;
    };
    _wrapped = true;
  }

  function isWrapped() { return _wrapped; }

  // Auto-wrap al cargar si config está disponible
  try {
    if (global.config && typeof global.config.save === 'function') {
      // defer para asegurar que todos los módulos carguen
      setTimeout(function () { wrap(); }, 100);
    }
  } catch (_) {}

  global.CrozzoConfigWrapper = { wrap: wrap, isWrapped: isWrapped };
})(typeof window !== 'undefined' ? window : globalThis);
