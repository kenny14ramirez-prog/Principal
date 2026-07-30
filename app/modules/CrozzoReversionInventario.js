/**
 * Crozzo — Reversión de Inventario al Anular (H2.B)
 * --------------------------------------------------------------------------
 * Resuelve el agujero fiscal/contable detectado: hoy si se anula una factura,
 * el stock queda descontado PARA SIEMPRE. No existe reversión.
 *
 * Este módulo:
 *  - Lee factura.inventarioMeta (qué se descontó al vender)
 *  - Devuelve el stock a su estado previo (suma lo descontado)
 *  - Genera movimiento 'entrada_devolucion' en el ledger (auditable)
 *  - Marca la factura como 'anulada' + registra quién/anuladaAt
 *
 * Candado: solo admin/encargado puede anular (verifica rol).
 *
 * Integración:
 *  - Retail (catálogo POS): suma qty a product.stock
 *  - Recetas (Reservorio): registra entrada_devolucion (movimiento de inventario)
 *
 * Doc: auditoría de anulación (punto ciego #1 del estudio de campo H2)
 */
(function (global) {
  'use strict';

  var ROLES_PERMITIDOS_ANULAR = ['admin', 'encargado', 'super_admin', 'superadmin'];

  function puedeAnular() {
    try {
      var u = (typeof global.getCurrentUser === 'function') ? global.getCurrentUser() : null;
      if (!u) return false;
      var rol = String((u && (u.rol || u.role)) || '').toLowerCase().trim();
      // super_admin shortcut
      if (typeof global.isSuperAdminUser === 'function' && global.isSuperAdminUser()) return true;
      return ROLES_PERMITIDOS_ANULAR.indexOf(rol) !== -1;
    } catch (_) {
      return false;
    }
  }

  /**
   * Revierte el inventario de una factura anulada.
   * @param {object} factura con inventarioMeta + items
   * @param {object} opts { por: 'admin', motivo: 'error de cobro' }
   * @returns {object} { ok, revertidas, errores, detalle, movimientos }
   */
  function revertirVenta(factura, opts) {
    var o = opts || {};
    var resultado = {
      ok: false,
      revertidas: 0,
      errores: 0,
      omitidas: 0,
      detalle: '',
      movimientos: [],
      facturaId: factura && (factura.uuid || factura.id) || null
    };

    // Candado: solo roles autorizados
    if (!puedeAnular()) {
      resultado.detalle = 'Permiso denegado: solo admin/encargado puede anular ventas';
      return resultado;
    }

    if (!factura) {
      resultado.detalle = 'Factura no proporcionada';
      return resultado;
    }

    // Idempotencia: si ya está anulada, no revertir dos veces
    if (factura.estado === 'anulada' || factura.anulada === true) {
      resultado.detalle = 'Factura ya anulada (idempotente)';
      resultado.ok = true;
      return resultado;
    }

    var meta = factura.inventarioMeta;
    if (!meta || !meta.aplicado) {
      // No se aplicó inventario en la venta (ej: restaurante sin receta) — nada que revertir
      resultado.ok = true;
      resultado.detalle = 'Sin inventario aplicado en la venta original';
      return resultado;
    }

    var lineas = Array.isArray(meta.lineas) ? meta.lineas : [];
    var productosTocados = new Set();
    var productosArr = (typeof global.crozzoGetProductos === 'function')
      ? global.crozzoGetProductos()
      : (typeof products !== 'undefined' ? products : null);

    lineas.forEach(function (linea) {
      // Solo revertir líneas que SÍ se descontaron (resultado 'ok')
      if (linea.resultado !== 'ok') {
        resultado.omitidas += 1;
        return;
      }
      var pid = linea.id;
      var qty = Number(linea.cantidad) || 0;
      if (pid == null || qty <= 0) {
        resultado.omitidas += 1;
        return;
      }

      var movimiento = {
        tipo: 'entrada_devolucion',
        productId: pid,
        nombre: linea.nombre || '',
        cantidad: qty,
        facturaId: resultado.facturaId,
        motivo: o.motivo || 'anulacion_venta',
        timestamp: new Date().toISOString(),
        por: o.por || (typeof global.crozzoGetCurrentUserLabel === 'function' ? global.crozzoGetCurrentUserLabel() : 'admin')
      };

      // Retail (catálogo POS): sumar qty de vuelta al stock
      if (productosArr && Array.isArray(productosArr)) {
        var idx = productosArr.findIndex(function (p) { return String(p.id) === String(pid); });
        if (idx >= 0) {
          var p = productosArr[idx];
          var cur = Number(p.stock);
          if (!Number.isNaN(cur)) {
            productosArr[idx] = Object.assign({}, p, { stock: cur + qty });
            productosTocados.add(pid);
            movimiento.modo = 'retail';
            movimiento.stockAntes = cur;
            movimiento.stockDespues = cur + qty;
            resultado.revertidas += 1;
            resultado.movimientos.push(movimiento);
            return;
          }
        }
      }

      // Receta (Reservorio): registrar entrada_devolucion vía movimiento
      // El Reservorio maneja su propio ledger; le pedimos que devuelva ingredientes
      if (typeof global.crozzoReservorioDevolverVenta === 'function') {
        try {
          global.crozzoReservorioDevolverVenta(resultado.facturaId, qty, movimiento);
          movimiento.modo = 'receta';
          resultado.revertidas += 1;
          resultado.movimientos.push(movimiento);
          return;
        } catch (e) {
          resultado.errores += 1;
          movimiento.error = String(e.message || e);
          resultado.movimientos.push(movimiento);
          return;
        }
      }

      // No se pudo revertir (producto no encontrado, sin reservorio)
      resultado.errores += 1;
      movimiento.modo = 'no_revertible';
      movimiento.error = 'producto_no_encontrado_o_sin_reservorio';
      resultado.movimientos.push(movimiento);
    });

    // Persistir catálogo actualizado (retail)
    if (productosTocados.size > 0 && typeof global.persistCatalogProductosLocal === 'function') {
      try { global.persistCatalogProductosLocal(); } catch (_) {}
      productosTocados.forEach(function (pid) {
        try { if (typeof global.persistCatalogProductos === 'function') global.persistCatalogProductos(pid); } catch (_) {}
      });
    }

    // Registrar movimientos en el ledger de inventario (si existe)
    if (resultado.movimientos.length > 0 && typeof global.crozzoInvRegistrarMovimiento === 'function') {
      resultado.movimientos.forEach(function (mov) {
        try { global.crozzoInvRegistrarMovimiento(mov); } catch (_) {}
      });
    }

    // Marcar factura como anulada
    factura.estado = 'anulada';
    factura.anulada = true;
    factura.anuladaAt = new Date().toISOString();
    factura.anuladaPor = o.por || (typeof global.crozzoGetCurrentUserLabel === 'function' ? global.crozzoGetCurrentUserLabel() : 'admin');
    factura.anuladaMotivo = o.motivo || 'anulacion_venta';
    factura.inventarioRevertido = true;

    resultado.ok = resultado.errores === 0;
    resultado.detalle = resultado.revertidas + ' revertidas, ' + resultado.omitidas + ' omitidas, ' + resultado.errores + ' errores';
    return resultado;
  }

  /**
   * Hook para el flujo de anulación existente.
   * Llamar antes de mapear estado 'anulada' a Supabase.
   * @returns {object} resultado de revertirVenta
   */
  function anularFactura(facturaId, opts) {
    // Buscar la factura en config.getFacturas()
    var factura = null;
    try {
      if (typeof global.crozzoGetFacturaById === 'function') {
        factura = global.crozzoGetFacturaById(facturaId);
      } else if (typeof global.crozzoPosConfigManager === 'object' && global.crozzoPosConfigManager) {
        var facturas = global.crozzoPosConfigManager.getFacturas && global.crozzoPosConfigManager.getFacturas();
        if (Array.isArray(facturas)) {
          factura = facturas.find(function (f) { return (f.uuid || f.id) === facturaId; });
        }
      }
    } catch (_) {}
    if (!factura) {
      return { ok: false, detalle: 'Factura no encontrada: ' + facturaId };
    }
    var r = revertirVenta(factura, opts);
    // Persistir la factura actualizada (estado anulada)
    if (r.ok && typeof global.crozzoPosConfigManager === 'object' && global.crozzoPosConfigManager) {
      try { if (typeof global.crozzoPosConfigManager.save === 'function') global.crozzoPosConfigManager.save(); } catch (_) {}
    }
    return r;
  }

  global.CrozzoReversionInventario = {
    puedeAnular: puedeAnular,
    revertirVenta: revertirVenta,
    anularFactura: anularFactura,
    ROLES_PERMITIDOS_ANULAR: ROLES_PERMITIDOS_ANULAR
  };
})(typeof window !== 'undefined' ? window : globalThis);
