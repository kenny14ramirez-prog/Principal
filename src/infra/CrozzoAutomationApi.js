/**
 * Crozzo POS — API de automatización (sin clics).
 * Expone acciones operativas vía funciones globales para Playwright, Tauri o scripts.
 */
(function (global) {
  'use strict';

  function waitFor(fn, label, maxMs) {
    maxMs = maxMs || 30000;
    var start = Date.now();
    return new Promise(function (resolve, reject) {
      (function tick() {
        try {
          if (fn()) return resolve(true);
        } catch (_) {}
        if (Date.now() - start > maxMs) {
          return reject(new Error('Timeout esperando: ' + (label || 'ready')));
        }
        setTimeout(tick, 150);
      })();
    });
  }

  function waitAppReady() {
    return waitFor(function () {
      return (
        typeof global.navigateTo === 'function' &&
        typeof global.renderPage === 'function' &&
        typeof global.getCurrentUser === 'function'
      );
    }, 'app-ready');
  }

  function ensureEmulation() {
    if (global.CrozzoEmulationHarness && global.CrozzoEmulationHarness.isActive()) {
      return Promise.resolve(global.CrozzoEmulationHarness.status());
    }
    if (global.CrozzoEmulationHarness && global.CrozzoEmulationHarness.enable) {
      return global.CrozzoEmulationHarness.enable({ force: true });
    }
    global.__CROZZO_EMULATION_ACTIVE = true;
    return Promise.resolve({ active: true, browserOnly: true });
  }

  function log(action, payload) {
    if (global.CrozzoEmulationHarness && global.CrozzoEmulationHarness.logAction) {
      return global.CrozzoEmulationHarness.logAction(action, payload);
    }
    return Promise.resolve();
  }

  function navigate(page) {
    return waitAppReady().then(function () {
      if (typeof global.navigateTo !== 'function') throw new Error('navigateTo no disponible');
      global.navigateTo(String(page || 'inicio-operacion'));
      return log('navigate', { page: page });
    });
  }

  function getState() {
    var cart =
      typeof global.getActiveCart === 'function' ? global.getActiveCart() : null;
    var page = typeof global.currentPage !== 'undefined' ? global.currentPage : null;
    var user = typeof global.getCurrentUser === 'function' ? global.getCurrentUser() : null;
    return {
      page: page,
      user: user ? { id: user.id, nombre: user.nombre, rol: user.rol } : null,
      cartItems: cart && cart.items ? cart.items.length : 0,
      cartTotal: cart && cart.total != null ? cart.total : 0,
      tipoServicioCaja: typeof global.tipoServicioCaja !== 'undefined' ? global.tipoServicioCaja : null,
      lastPrint: global.__CROZZO_LAST_PRINT || null,
      emulation: global.__CROZZO_EMULATION_STATUS || null,
    };
  }

  function automationAddToCart(productId, configSig) {
    if (typeof global.getActiveCart !== 'function') throw new Error('getActiveCart no disponible');
    var cart = global.getActiveCart();
    var product = (global.products || []).find(function (p) {
      return Number(p.id) === Number(productId);
    });
    if (!product) throw new Error('Producto no encontrado: ' + productId);
    if (typeof global.addItemToCartWithConfig === 'function') {
      global.addItemToCartWithConfig(cart, product);
    } else if (typeof global.addToCart === 'function') {
      global.addToCart(Number(productId), configSig || '');
      return;
    } else {
      throw new Error('No hay API de carrito');
    }
    if (typeof global.renderCart === 'function') global.renderCart();
  }

  function automationComandar() {
    if (typeof global.getActiveCart !== 'function') throw new Error('getActiveCart no disponible');
    var cart = global.getActiveCart();
    if (!cart.length) throw new Error('Carrito vacío');
    var pending =
      typeof global.getTabletPendingItems === 'function' ? global.getTabletPendingItems(cart) : cart;
    if (!pending.length) throw new Error('Sin ítems pendientes por comandar');
    var totals = typeof global.computeTotals === 'function' ? global.computeTotals(pending) : { total: 0 };
    var tipo = typeof global.tipoServicioCaja !== 'undefined' ? global.tipoServicioCaja : 'directa';
    var ref =
      tipo === 'mesa'
        ? global.mesaSeleccionada
        : tipo === 'llevar'
          ? global.llevarSeleccionado
          : 'MOSTRADOR';
    if (typeof global.crearComanda !== 'function') throw new Error('crearComanda no disponible');
    var touchedIds = global.crearComanda('caja', tipo, ref, pending, totals.total) || [];
    if (typeof global.markTabletItemsAsSent === 'function') {
      global.markTabletItemsAsSent(cart, pending);
    }
    return touchedIds;
  }

  function addProduct(productId, configSig) {
    return waitAppReady().then(function () {
      automationAddToCart(productId, configSig);
      return log('add_product', { productId: productId }).then(function () {
        return getState();
      });
    });
  }

  function setServiceMode(mode) {
    return waitAppReady().then(function () {
      if (typeof global.setCajaMode === 'function') {
        global.setCajaMode(String(mode || 'directa'));
      }
      return log('set_service_mode', { mode: mode }).then(getState);
    });
  }

  function sendToKitchen() {
    return waitAppReady().then(function () {
      try {
        automationComandar();
      } catch (e) {
        if (typeof global.comandarDesdeCaja === 'function') global.comandarDesdeCaja();
        else throw e;
      }
      return log('send_to_kitchen', {}).then(getState);
    });
  }

  function openCashier(page) {
    var p = page || 'cajero';
    return navigate(p);
  }

  function closeCashRegister(opts) {
    opts = opts || {};
    return waitAppReady().then(function () {
      if (opts.navigate !== false && typeof global.navigateTo === 'function') {
        global.navigateTo('cierre-caja');
      }
      if (typeof global.crozzoCierreRefreshPanel === 'function') {
        try {
          global.crozzoCierreRefreshPanel({ full: true });
        } catch (_) {}
      }
      return log('close_cash_register', opts).then(getState);
    });
  }

  function runSteps(steps) {
    var list = Array.isArray(steps) ? steps : [];
    var chain = Promise.resolve();
    list.forEach(function (step) {
      chain = chain.then(function () {
        if (!step || !step.action) return null;
        var a = step.action;
        if (a === 'navigate') return navigate(step.page);
        if (a === 'add_product') return addProduct(step.productId, step.configSig);
        if (a === 'send_to_kitchen') return sendToKitchen();
        if (a === 'set_service_mode') return setServiceMode(step.mode);
        if (a === 'close_cash_register') return closeCashRegister(step);
        if (a === 'receive_stock') return receiveStock(step.name, step.qty);
        if (a === 'create_sale_order') return createSaleOrder(step.productIds, step);
        if (a === 'charge') return chargeOrder(step.metodo, step);
        if (a === 'perform_arqueo') return performArqueo(step);
        if (a === 'wait') {
          return new Promise(function (r) {
            setTimeout(r, Number(step.ms) || 500);
          });
        }
        return log('unknown_step', step);
      });
    });
    return chain.then(getState);
  }

  function seedDemoLogin(userId, password) {
    var uid = String(userId || 'KENNY');
    var pass = String(password || '141414');
    return waitAppReady().then(function () {
      if (typeof global.loginWithCredentials !== 'function') {
        throw new Error('loginWithCredentials no disponible');
      }
      return global.loginWithCredentials(uid, pass).then(function (r) {
        if (!r || !r.ok) throw new Error((r && r.message) || 'Login falló');
        if (r.mustChangePassword && typeof global.crozzoCloseForcePasswordChangeModal === 'function') {
          global.crozzoCloseForcePasswordChangeModal();
        }
        if (typeof global.hideLoginOverlay === 'function') global.hideLoginOverlay();
        if (typeof global.crozzoFinishLoginSuccess === 'function') {
          global.crozzoFinishLoginSuccess({ channel: 'local', toastMessage: 'Emulación QA' });
        }
        return log('seed_login', { userId: uid }).then(getState);
      });
    });
  }

  global.crozzoQaSeedLogin = function (userId, password) {
    return seedDemoLogin(userId, password);
  };

  function ensureTestMpProducts() {
    if (typeof global.products === 'undefined' || !Array.isArray(global.products)) {
      global.products = [];
    }
    var defs = [
      { id: 901, nombre: 'Carne', precio: 1, stock: 0, icon: '🥩', categoria: 'insumos', areaComanda: 'COCINA' },
      { id: 902, nombre: 'Refresco', precio: 1, stock: 0, icon: '🥤', categoria: 'insumos', areaComanda: 'COCINA' },
    ];
    defs.forEach(function (d) {
      var idx = global.products.findIndex(function (p) {
        return String(p.nombre).toLowerCase() === d.nombre.toLowerCase();
      });
      if (idx < 0) {
        global.products.push(Object.assign({}, d));
      } else {
        global.products[idx] = Object.assign({}, global.products[idx], { nombre: d.nombre });
      }
    });
    return defs;
  }

  function receiveStock(nameOrId, qty) {
    return waitAppReady().then(function () {
      ensureTestMpProducts();
      var q = Math.max(1, Number(qty) || 1);
      var pid = nameOrId;
      if (typeof nameOrId === 'string' && isNaN(Number(nameOrId))) {
        var p = global.products.find(function (x) {
          return String(x.nombre).toLowerCase() === String(nameOrId).toLowerCase();
        });
        if (!p) throw new Error('Producto no encontrado: ' + nameOrId);
        pid = p.id;
      }
      var idx = global.products.findIndex(function (p) {
        return String(p.id) === String(pid);
      });
      if (idx < 0) throw new Error('ID producto inválido: ' + pid);
      var row = global.products[idx];
      var base = row.stock != null && !isNaN(Number(row.stock)) ? Number(row.stock) : 0;
      global.products[idx] = Object.assign({}, row, { stock: base + q });
      if (typeof global.persistCatalogProductosLocal === 'function') global.persistCatalogProductosLocal();
      try {
        if (typeof global.persistCatalogProductos === 'function') global.persistCatalogProductos(global.products[idx].id);
      } catch (_) {}
      return log('receive_stock', { id: pid, nombre: row.nombre, qty: q, stock: global.products[idx].stock });
    });
  }

  function openCashRegister(fondo) {
    return waitAppReady().then(function () {
      if (typeof global.crozzoShiftEnsureTurn === 'function') global.crozzoShiftEnsureTurn();
      var f = Number(fondo);
      if (!isFinite(f)) f = 500000;
      if (typeof global.crozzoShiftLoadTurn === 'function' && typeof global.crozzoShiftSaveTurn === 'function') {
        var sh = global.crozzoShiftLoadTurn();
        if (sh) {
          sh.cashOpen = f;
          global.crozzoShiftSaveTurn(sh);
        }
      }
      return log('open_cash_register', { fondo: f }).then(getState);
    });
  }

  function clearCartNow() {
    if (typeof global.clearCart === 'function') global.clearCart();
    else if (typeof global.cartDirecto !== 'undefined') global.cartDirecto = [];
  }

  function createSaleOrder(itemIds, opts) {
    opts = opts || {};
    return waitAppReady().then(function () {
      if (typeof global.setCajaMode === 'function') global.setCajaMode(opts.mode || 'directa');
      clearCartNow();
      var ids = Array.isArray(itemIds) ? itemIds : [itemIds];
      ids.forEach(function (id) {
        automationAddToCart(Number(id), '');
      });
      var touchedIds = [];
      if (opts.comandar !== false) {
        touchedIds = automationComandar() || [];
      }
      return log('create_sale_order', { items: ids, mode: opts.mode || 'directa', touchedIds: touchedIds }).then(
        function () {
          return {
            state: getState(),
            comandas: getComandasSnapshot(),
            touchedIds: touchedIds,
          };
        }
      );
    });
  }

  function getComandasSnapshot() {
    var list = [];
    if (typeof global.crozzoGetComandasList === 'function') {
      list = global.crozzoGetComandasList();
    } else if (typeof global.comandas !== 'undefined' && Array.isArray(global.comandas)) {
      list = global.comandas;
    }
    return list.map(function (c) {
      return { id: c.id, estado: c.estado, referencia: c.referencia, total: c.total, items: (c.items || []).length };
    });
  }

  function updateKitchenOrder(comandaId, estado) {
    return waitAppReady().then(function () {
      if (typeof global.updateComandaEstado !== 'function') throw new Error('updateComandaEstado no disponible');
      /* Automatización confiable: no aplicar gate UI de despachar (KI-032/034). */
      global.updateComandaEstado(Number(comandaId), String(estado || 'preparando'), { skipPermiso: true });
      return log('update_kitchen', { comandaId: comandaId, estado: estado }).then(function () {
        return getComandasSnapshot();
      });
    });
  }

  function printPrecuenta() {
    return waitAppReady().then(function () {
      var cart = typeof global.getActiveCart === 'function' ? global.getActiveCart() : [];
      if (!cart.length) throw new Error('Carrito vacío para precuenta');
      if (typeof global.showPrecuenta === 'function') global.showPrecuenta();
      if (typeof global.crozzoPrecuentaPrintThermal === 'function') {
        global.crozzoPrecuentaPrintThermal();
      } else if (
        typeof global.crozzoFacturaPrintThermal === 'function' &&
        global.__crozzoPrecuentaThermalFactura
      ) {
        global.crozzoFacturaPrintThermal(global.__crozzoPrecuentaThermalFactura);
      }
      return log('print_precuenta', { items: cart.length });
    });
  }

  function chargeOrder(metodoPago, opts) {
    opts = opts || {};
    return waitAppReady().then(function () {
      var cart = typeof global.getActiveCart === 'function' ? global.getActiveCart() : [];
      if (!cart.length) throw new Error('Carrito vacío para cobro');
      if (typeof global.comandarDesdeCaja === 'function' && typeof global.crozzoCartHasUncommandedItems === 'function') {
        if (global.crozzoCartHasUncommandedItems(cart)) global.comandarDesdeCaja();
      }
      var metodo = String(metodoPago || 'efectivo');
      var totals =
        typeof global.computeTotals === 'function' ? global.computeTotals(cart) : { total: 0 };
      var payOpts = {
        tipoComprobante: opts.tipoComprobante || 'pos',
        metodoPago: metodo,
        paymentMeta: opts.paymentMeta || {},
      };
      if (metodo === 'efectivo' && !opts.paymentMeta) {
        payOpts.paymentMeta = { valorRecibido: totals.total, devueltas: 0 };
      }
      if (typeof global.facturar !== 'function') throw new Error('facturar no disponible');
      return Promise.resolve(global.facturar(payOpts))
        .then(function () {
          return waitFor(function () {
            var carts = typeof global.getActiveCart === 'function' ? global.getActiveCart() : [];
            return !carts || !carts.length;
          }, 'cart-cleared-after-sale', 8000);
        })
        .then(function () {
          return log('charge_order', { metodo: metodo, total: totals.total }).then(getState);
        });
    });
  }

  function registerExpense(label, valor, proveedorNombre) {
    return waitAppReady().then(function () {
      if (!global.CrozzoReservorio || typeof global.CrozzoReservorio.registrarOficina !== 'function') {
        throw new Error('CrozzoReservorio no cargado — navegue a Compras primero');
      }
      var fac = global.CrozzoReservorio.registrarOficina({
        proveedorId: 'emu-' + String(label || 'gasto').replace(/\s+/g, '-').toLowerCase(),
        proveedorNombre: proveedorNombre || String(label || 'Gasto emulado'),
        valor: Number(valor) || 0,
        metodo: 'efectivo',
        estado: 'pendiente',
        notas: 'Emulación día completo · ' + String(label || ''),
        numeroFactura: 'EMU-' + Date.now(),
      });
      return log('register_expense', { label: label, valor: valor, id: fac && fac.id }).then(function () {
        return fac;
      });
    });
  }

  function registerMpReceipt(label, valor) {
    return waitAppReady().then(function () {
      if (!global.CrozzoReservorio || typeof global.CrozzoReservorio.registrarRecepcion !== 'function') {
        throw new Error('CrozzoReservorio no cargado');
      }
      var rec = global.CrozzoReservorio.registrarRecepcion({
        proveedorId: 'emu-prov-' + String(label || 'mp').replace(/\s+/g, '-').toLowerCase(),
        proveedorNombre: String(label || 'Proveedor emulado'),
        valor: Number(valor) || 0,
        notas: 'Recepción emulación · ' + String(label || ''),
        numeroFactura: 'REC-EMU-' + Date.now(),
        _forceNew: true,
      });
      return log('register_mp_receipt', { label: label, valor: valor, id: rec && rec.id }).then(function () {
        return rec;
      });
    });
  }

  function performArqueo(opts) {
    opts = opts || {};
    return waitAppReady().then(function () {
      return navigate('cierre-caja').then(function () {
        var type = opts.shiftType || 'manana';
        if (typeof global.crozzoShiftOpenArqueoType === 'function') global.crozzoShiftOpenArqueoType(type);
        var fondoEl = document.getElementById('crozzo-shift-fondo');
        var countEl = document.getElementById('crozzo-shift-count');
        var fondo = Number(opts.fondo);
        var actual = Number(opts.actual);
        if (!isFinite(fondo)) {
          var m =
            typeof global.crozzoShiftMetrics === 'function' ? global.crozzoShiftMetrics(type) : null;
          var sh = m && m.shift ? m.shift : null;
          fondo = sh && sh.cashOpen != null ? Number(sh.cashOpen) : 500000;
        }
        if (!isFinite(actual)) {
          var metrics =
            typeof global.crozzoShiftMetrics === 'function' ? global.crozzoShiftMetrics(type) : null;
          actual = fondo + (metrics && metrics.cash ? Number(metrics.cash) : 0);
        }
        if (fondoEl) fondoEl.value = String(fondo);
        if (countEl) countEl.value = String(actual);
        if (typeof global.crozzoShiftCalcArqueo === 'function') global.crozzoShiftCalcArqueo();
        var notesEl = document.getElementById('crozzo-shift-notes');
        if (notesEl && opts.notes) notesEl.value = String(opts.notes);
        global.__crozzoSkipNoviceArqueoGuard = true;
        if (typeof global.crozzoShiftFinalize === 'function') global.crozzoShiftFinalize();
        global.__crozzoSkipNoviceArqueoGuard = false;
        return log('perform_arqueo', { type: type, fondo: fondo, actual: actual, diff: actual - fondo }).then(
          getState
        );
      });
    });
  }

  function closeBusinessDay() {
    return performArqueo({ shiftType: 'dia', notes: 'Cierre día — emulación QA' });
  }

  function getPrintLogStats() {
    return waitAppReady().then(function () {
      if (global.CrozzoEmulationHarness && global.CrozzoEmulationHarness.querySql) {
        return global.CrozzoEmulationHarness.querySql(
          'SELECT COUNT(*) as n, SUM(bytes_len) as bytes FROM print_log'
        ).catch(function () {
          return browserPrintLogStats();
        });
      }
      return browserPrintLogStats();
    });
  }

  function browserPrintLogStats() {
    try {
      var raw = global.localStorage.getItem('emu:print_log_mirror') || '';
      var lines = raw.split('\n').filter(Boolean);
      return [{ n: lines.length, source: 'localStorage' }];
    } catch (_) {
      return [{ n: global.__CROZZO_LAST_PRINT ? 1 : 0, source: 'last_print' }];
    }
  }

  function loadReservorioBundle() {
    return waitAppReady().then(function () {
      if (global.CrozzoReservorio) return true;
      if (typeof global.crozzoLoadModule === 'function') {
        return global.crozzoLoadModule('bundles/CrozzoBundleReservorio.js').then(function () {
          return !!global.CrozzoReservorio;
        });
      }
      return false;
    });
  }

  global.CrozzoAutomation = {
    waitAppReady: waitAppReady,
    ensureEmulation: ensureEmulation,
    enableEmulation: ensureEmulation,
    resetAll: function () {
      return global.CrozzoEmulationHarness && global.CrozzoEmulationHarness.resetAll
        ? global.CrozzoEmulationHarness.resetAll()
        : Promise.resolve();
    },
    navigate: navigate,
    getState: getState,
    addProduct: addProduct,
    setServiceMode: setServiceMode,
    sendToKitchen: sendToKitchen,
    openCashier: openCashier,
    closeCashRegister: closeCashRegister,
    runSteps: runSteps,
    seedDemoLogin: seedDemoLogin,
    ensureTestMpProducts: ensureTestMpProducts,
    receiveStock: receiveStock,
    openCashRegister: openCashRegister,
    createSaleOrder: createSaleOrder,
    getComandasSnapshot: getComandasSnapshot,
    updateKitchenOrder: updateKitchenOrder,
    printPrecuenta: printPrecuenta,
    chargeOrder: chargeOrder,
    registerExpense: registerExpense,
    registerMpReceipt: registerMpReceipt,
    performArqueo: performArqueo,
    closeBusinessDay: closeBusinessDay,
    getPrintLogStats: getPrintLogStats,
    loadReservorioBundle: loadReservorioBundle,
    log: log,
  };
})(typeof window !== 'undefined' ? window : globalThis);
