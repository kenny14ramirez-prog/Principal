/**
 * Puente mínimo: el guardado vive en CrozzoRecepcionFacturas.ejecutarGuardadoVerificar.
 * Este archivo solo expone el global para onclick y borrado del historial.
 */
(function (global) {
  'use strict';

  function toast(msg, level) {
    if (typeof global.showToast === 'function') global.showToast(msg, level || 'info');
  }

  function ejecutarGuardar(fromEl) {
    var CXF = global.CrozzoRecepcionFacturas;
    if (!CXF || typeof CXF.ejecutarGuardadoVerificar !== 'function') {
      if (global.CrozzoLazyModules && global.CrozzoLazyModules.ensurePageModules) {
        global.CrozzoLazyModules.ensurePageModules('compras-recepcion', function () {
          ejecutarGuardar(fromEl);
        });
        return;
      }
      toast('Abra Entrada de factura desde el menú del POS y espere a que cargue', 'error');
      return;
    }
    CXF.ejecutarGuardadoVerificar(fromEl);
  }

  function ejecutarBorrar(recId) {
    var res = global.CrozzoReservorio;
    if (!res || !res.eliminarRecepcion || !recId) {
      toast('No se puede eliminar', 'warning');
      return;
    }
    var rec = res.getRecepcion(recId);
    if (!rec) {
      toast('Registro no encontrado', 'warning');
      return;
    }
    var label =
      (rec.proveedorNombre || 'Proveedor') +
      (rec.numeroFactura ? ' · ' + rec.numeroFactura : '');
    if (!global.confirm('¿Eliminar este ingreso?\n\n' + label)) return;
    var CXF = global.CrozzoRecepcionFacturas;
    if (CXF && typeof CXF.onBorrarIngreso === 'function') CXF.onBorrarIngreso(recId);
    if (!res.eliminarRecepcion(recId)) {
      toast('No se pudo eliminar', 'error');
      return;
    }
    toast('Ingreso eliminado', 'success');
    if (CXF && typeof CXF.afterIngresoGuardado === 'function') CXF.afterIngresoGuardado();
  }

  function onDocClick(e) {
    var del = e.target.closest && e.target.closest('.cxf-hist-delete');
    if (!del) return;
    var root = del.closest('.cxf-root');
    if (!root) return;
    e.preventDefault();
    var id = del.getAttribute('data-rec-id') || '';
    if (!id) {
      var tr = del.closest('.cxf-hist-row');
      if (tr) id = tr.getAttribute('data-rec-id') || '';
    }
    ejecutarBorrar(id);
  }

  global.crozzoConfirmarIngresoFactura = function (el) {
    ejecutarGuardar(el);
  };

  global.CrozzoRecepcionGuardar = {
    ejecutarGuardar: ejecutarGuardar,
    ejecutarBorrar: ejecutarBorrar,
  };

  document.addEventListener('click', onDocClick, true);
})(typeof window !== 'undefined' ? window : global);
