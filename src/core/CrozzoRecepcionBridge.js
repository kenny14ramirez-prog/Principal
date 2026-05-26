/**
 * Expone confirmar ingreso al bundle de compras (carga diferida).
 */
(function (g) {
  'use strict';
  g.crozzoConfirmarIngresoFactura = function () {
    var CXF = g.CrozzoRecepcionFacturas;
    if (CXF && typeof CXF.confirmarIngresoFactura === 'function') {
      return CXF.confirmarIngresoFactura();
    }
    if (g.CrozzoLazyModules && typeof g.CrozzoLazyModules.ensurePageModules === 'function') {
      g.CrozzoLazyModules.ensurePageModules('compras-recepcion', function () {
        var M = g.CrozzoRecepcionFacturas;
        if (M && typeof M.confirmarIngresoFactura === 'function') M.confirmarIngresoFactura();
      });
    }
  };
  g.cxfGuardarRecepcion = g.crozzoConfirmarIngresoFactura;
})(typeof window !== 'undefined' ? window : globalThis);
