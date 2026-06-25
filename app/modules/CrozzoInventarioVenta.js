/**
 * Orquestador de inventario al vender — best-effort, nunca bloquea la operación.
 * Restaurante: silencioso, sin fricción en menú/caja.
 * Comercial: avisos de stock relevantes, pero la venta siempre continúa.
 */
(function (global) {
  'use strict';

  var META_VERSION = 1;

  function linePid(line) {
    if (!line) return null;
    return line.id != null ? line.id : line.productId;
  }

  function getProductsArray() {
    return typeof global.products !== 'undefined' && Array.isArray(global.products) ? global.products : null;
  }

  function getPerfilTipo() {
    try {
      if (typeof global.crozzoGetPerfilEmpresa === 'function') {
        var id = global.crozzoGetPerfilEmpresa();
        if (String(id).indexOf('tienda') >= 0) return 'retail';
      }
    } catch (_) {}
    try {
      if (typeof global.CrozzoPerfilesOperativos !== 'undefined' && global.CrozzoPerfilesOperativos.getMeta) {
        var meta = global.CrozzoPerfilesOperativos.getMeta(
          typeof global.crozzoGetPerfilEmpresa === 'function' ? global.crozzoGetPerfilEmpresa() : 'basico_restaurante'
        );
        if (meta && meta.tipo) return meta.tipo;
      }
    } catch (_) {}
    return 'restaurante';
  }

  /** Vista comercial/tienda: avisos de stock activos. Restaurante/cajero/tablets: sin fricción. */
  function esVentaComercial(ctx) {
    if (ctx === 'comercial') return true;
    if (ctx === 'restaurante') return false;
    if (typeof global.currentPage !== 'undefined' && global.currentPage === 'venta-comercial') return true;
    return getPerfilTipo() === 'retail';
  }

  function stockThreshold(p) {
    if (typeof global.crozzoStockThresholdForProduct === 'function') {
      return global.crozzoStockThresholdForProduct(p);
    }
    if (p && p.stockMin != null && !Number.isNaN(Number(p.stockMin))) return Math.max(0, Number(p.stockMin));
    return 5;
  }

  function findProduct(pid) {
    var products = getProductsArray();
    if (!products || pid == null) return null;
    return products.find(function (p) {
      return String(p.id) === String(pid);
    });
  }

  /** @returns {{ tracked: boolean, qty: number|null, nivel: 'none'|'ok'|'low'|'out', umbral: number }} */
  function evaluarStockProducto(p, cantidadRequerida) {
    if (!p || p.stock == null || Number.isNaN(Number(p.stock))) {
      return { tracked: false, qty: null, nivel: 'none', umbral: stockThreshold(p) };
    }
    var qty = Number(p.stock);
    var umbral = stockThreshold(p);
    var need = Math.max(0, Number(cantidadRequerida) || 0);
    var nivel = 'ok';
    if (qty <= 0) nivel = 'out';
    else if (need > qty) nivel = 'out';
    else if (qty <= umbral) nivel = 'low';
    return { tracked: true, qty: qty, nivel: nivel, umbral: umbral };
  }

  function qtyEnCarrito(cart, productId) {
    if (!Array.isArray(cart)) return 0;
    return cart.reduce(function (sum, line) {
      if (String(linePid(line)) !== String(productId)) return sum;
      return sum + (Number(line.cantidad) || 0);
    }, 0);
  }

  /** Aviso al agregar — solo comercial; nunca bloquea. */
  function avisoStockAlAgregar(product, cart) {
    if (!esVentaComercial()) return;
    if (!product) return;
    var evalSt = evaluarStockProducto(product, qtyEnCarrito(cart, product.id) + 1);
    if (!evalSt.tracked) return;
    if (typeof global.showToast !== 'function') return;
    if (evalSt.nivel === 'out') {
      global.showToast(
        (product.nombre || 'Producto') + ': sin stock suficiente (' + evalSt.qty + ' disp.). Se agregó igual.',
        'warning'
      );
    } else if (evalSt.nivel === 'low') {
      global.showToast(
        (product.nombre || 'Producto') + ': stock bajo (' + evalSt.qty + ' disp.).',
        'info'
      );
    }
  }

  /** Resumen antes de cobrar — solo comercial; no bloquea. */
  function avisoStockPreCobro(cart) {
    if (!esVentaComercial() || !Array.isArray(cart) || !cart.length) return [];
    var avisos = [];
    cart.forEach(function (line) {
      var pid = linePid(line);
      var p = findProduct(pid);
      if (!p) return;
      var need = Number(line.cantidad) || 0;
      var evalSt = evaluarStockProducto(p, need);
      if (!evalSt.tracked) return;
      if (evalSt.nivel === 'out' || evalSt.nivel === 'low') {
        avisos.push({
          id: pid,
          nombre: line.nombre || p.nombre || '',
          cantidad: need,
          disponible: evalSt.qty,
          nivel: evalSt.nivel,
        });
      }
    });
    if (avisos.length && typeof global.showToast === 'function') {
      var outs = avisos.filter(function (a) {
        return a.nivel === 'out';
      }).length;
      global.showToast(
        outs > 0
          ? 'Atención: ' + outs + ' producto(s) sin stock suficiente. El cobro continuará.'
          : 'Atención: ' + avisos.length + ' producto(s) con stock bajo.',
        'warning'
      );
    }
    return avisos;
  }

  function retailStockBadgeHtml(p) {
    if (!esVentaComercial() || !p) return '';
    var evalSt = evaluarStockProducto(p, 1);
    if (!evalSt.tracked) return '';
    var label = evalSt.qty + ' u.';
    var cls = 'crozzo-retail-stock-badge crozzo-retail-stock-badge--' + evalSt.nivel;
    if (evalSt.nivel === 'out') label = 'Agotado';
    else if (evalSt.nivel === 'low') label = evalSt.qty + ' u. · bajo';
    return '<span class="' + cls + '" title="Stock disponible">' + label + '</span>';
  }

  function cartLineStockHintHtml(line) {
    if (!esVentaComercial() || !line) return '';
    var p = findProduct(linePid(line));
    if (!p) return '';
    var evalSt = evaluarStockProducto(p, Number(line.cantidad) || 0);
    if (!evalSt.tracked || evalSt.nivel === 'ok') return '';
    var txt =
      evalSt.nivel === 'out'
        ? 'Pide ' + (Number(line.cantidad) || 0) + ' · disp. ' + evalSt.qty
        : 'Stock bajo · ' + evalSt.qty + ' disp.';
    return (
      '<small class="crozzo-retail-stock-hint crozzo-retail-stock-hint--' +
      evalSt.nivel +
      '">' +
      txt +
      '</small>'
    );
  }

  /** @returns {{ modo: 'receta'|'pos'|'ninguno', razon: string }} */
  function inferModoLinea(line, ctx) {
    var pid = linePid(line);
    if (pid == null) return { modo: 'ninguno', razon: 'sin_id_producto' };

    var comercial = esVentaComercial(ctx);

    if (!comercial) {
      var C = global.CrozzoCatalogoMp;
      if (C && typeof C.getMenuPlatoByPosId === 'function') {
        var menu = C.getMenuPlatoByPosId(pid);
        if (menu) {
          var modoProc =
            typeof C.inferModoProcesoFromMenu === 'function'
              ? C.inferModoProcesoFromMenu(menu)
              : 'bajo_demanda';
          if (modoProc === 'bajo_demanda') {
            return { modo: 'receta', razon: 'menu_receta_bajo_demanda' };
          }
          return { modo: 'ninguno', razon: 'prep_anticipado_sin_descuento_en_venta' };
        }
      }
      return { modo: 'ninguno', razon: 'restaurante_sin_control_pos' };
    }

    var products = getProductsArray();
    if (!products) return { modo: 'ninguno', razon: 'catalogo_pos_no_disponible' };

    var idx = products.findIndex(function (p) {
      return String(p.id) === String(pid);
    });
    if (idx < 0) return { modo: 'ninguno', razon: 'producto_no_en_catalogo' };

    var prod = products[idx];
    if (prod.stock == null || Number.isNaN(Number(prod.stock))) {
      return { modo: 'ninguno', razon: 'sin_control_de_stock' };
    }
    return { modo: 'pos', razon: 'stock_catalogo_pos' };
  }

  function buildLineMeta(line, inf) {
    return {
      id: linePid(line),
      nombre: line.nombre || '',
      cantidad: Number(line.cantidad || line.qty) || 0,
      modo: inf.modo,
      razonModo: inf.razon,
      resultado: 'pendiente',
      detalle: '',
    };
  }

  function bumpResumen(meta, resultado) {
    if (resultado === 'ok') meta.resumen.ok += 1;
    else if (resultado === 'error') meta.resumen.error += 1;
    else if (resultado === 'parcial') meta.resumen.parcial += 1;
    else meta.resumen.omitido += 1;
  }

  function markEntry(entry, resultado, detalle, meta) {
    entry.resultado = resultado;
    entry.detalle = detalle || '';
    bumpResumen(meta, resultado);
  }

  function aplicarVenta(factura) {
    var ctx = (factura && factura.inventarioContexto) || null;
    var comercial = esVentaComercial(ctx);

    var emptyMeta = {
      version: META_VERSION,
      saleUuid: factura && factura.uuid ? factura.uuid : null,
      contexto: comercial ? 'comercial' : 'restaurante',
      aplicado: false,
      lineas: [],
      resumen: { ok: 0, omitido: 0, error: 0, parcial: 0 },
    };

    if (!factura || !Array.isArray(factura.items)) {
      emptyMeta.detalle = 'factura_sin_items';
      return emptyMeta;
    }

    var prev = factura.inventarioMeta;
    if (
      prev &&
      prev.version === META_VERSION &&
      prev.aplicado &&
      factura.uuid &&
      prev.saleUuid === factura.uuid
    ) {
      return prev;
    }

    var meta = {
      version: META_VERSION,
      saleUuid: factura.uuid || null,
      contexto: comercial ? 'comercial' : 'restaurante',
      aplicado: true,
      aplicadoEn: new Date().toISOString(),
      lineas: [],
      resumen: { ok: 0, omitido: 0, error: 0, parcial: 0 },
    };

    if (comercial && Array.isArray(factura.stockAvisosPreCobro) && factura.stockAvisosPreCobro.length) {
      meta.avisosPreCobro = factura.stockAvisosPreCobro.slice();
    }

    var buckets = { receta: [], pos: [], ninguno: [] };

    factura.items.forEach(function (line) {
      var inf = inferModoLinea(line, ctx);
      var entry = buildLineMeta(line, inf);
      meta.lineas.push(entry);
      var bucket = buckets[inf.modo] || buckets.ninguno;
      bucket.push({ line: line, entry: entry });
    });

    buckets.ninguno.forEach(function (row) {
      markEntry(row.entry, 'omitido', row.entry.razonModo, meta);
    });

    if (buckets.pos.length) {
      try {
        if (typeof global.crozzoInvDeductFromFactura === 'function') {
          global.crozzoInvDeductFromFactura({
            uuid: factura.uuid,
            items: buckets.pos.map(function (row) {
              return row.line;
            }),
          });
          buckets.pos.forEach(function (row) {
            var p = findProduct(linePid(row.line));
            var evalSt = p ? evaluarStockProducto(p, Number(row.line.cantidad) || 0) : null;
            if (evalSt && evalSt.nivel === 'out') {
              markEntry(row.entry, 'parcial', 'stock_pos_descontado_sin_saldo_previo', meta);
            } else {
              markEntry(row.entry, 'ok', 'stock_pos_descontado', meta);
            }
          });
        } else {
          buckets.pos.forEach(function (row) {
            markEntry(row.entry, 'omitido', 'funcion_stock_pos_no_disponible', meta);
          });
        }
      } catch (err) {
        buckets.pos.forEach(function (row) {
          markEntry(row.entry, 'error', String((err && err.message) || err || 'error_stock_pos'), meta);
        });
      }
    }

    var skipPosLedgerIds = buckets.receta
      .concat(buckets.ninguno)
      .map(function (row) {
        return String(linePid(row.line));
      })
      .filter(Boolean);

    var reservorioFn = global.crozzoReservorioRegistrarVenta;
    var llamarReservorio = buckets.receta.length > 0 || (comercial && buckets.pos.length > 0);

    if (!llamarReservorio) {
      buckets.receta.forEach(function (row) {
        markEntry(row.entry, 'omitido', 'restaurante_sin_inventario_aplicable', meta);
      });
    } else if (typeof reservorioFn !== 'function') {
      buckets.receta.forEach(function (row) {
        markEntry(row.entry, 'omitido', 'modulo_reservorio_no_cargado', meta);
      });
    } else {
      try {
        reservorioFn({
          saleId: factura.uuid,
          uuid: factura.uuid,
          monto: factura.total,
          total: factura.total,
          items: factura.items,
          concepto:
            factura.inventarioConcepto ||
            'Venta #' + (factura.consecutivo != null ? factura.consecutivo : factura.uuid || ''),
          opts: {
            orquestado: true,
            skipPosLedgerIds: skipPosLedgerIds,
          },
        });
        buckets.receta.forEach(function (row) {
          markEntry(row.entry, 'ok', 'consumo_receta_reservorio', meta);
        });
      } catch (err) {
        buckets.receta.forEach(function (row) {
          markEntry(row.entry, 'error', String((err && err.message) || err || 'error_reservorio'), meta);
        });
      }
    }

    factura.inventarioMeta = meta;

    if (comercial && meta.resumen.error > 0 && typeof global.showToast === 'function') {
      try {
        global.showToast(
          'Venta registrada. Inventario: ' +
            meta.resumen.error +
            ' línea(s) no se descontaron (quedó en la factura).',
          'warning'
        );
      } catch (_) {}
    }

    return meta;
  }

  global.CrozzoInventarioVenta = {
    META_VERSION: META_VERSION,
    esVentaComercial: esVentaComercial,
    evaluarStockProducto: evaluarStockProducto,
    inferModoLinea: inferModoLinea,
    avisoStockAlAgregar: avisoStockAlAgregar,
    avisoStockPreCobro: avisoStockPreCobro,
    retailStockBadgeHtml: retailStockBadgeHtml,
    cartLineStockHintHtml: cartLineStockHintHtml,
    aplicarVenta: aplicarVenta,
  };
  global.crozzoInventarioAplicarVenta = aplicarVenta;
  global.crozzoInvEsVentaComercial = esVentaComercial;
  global.crozzoInvAvisoStockAlAgregar = avisoStockAlAgregar;
  global.crozzoInvAvisoStockPreCobro = avisoStockPreCobro;
  global.crozzoInvRetailStockBadgeHtml = retailStockBadgeHtml;
  global.crozzoInvCartLineStockHintHtml = cartLineStockHintHtml;
})(typeof window !== 'undefined' ? window : globalThis);
