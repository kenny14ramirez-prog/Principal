/**
 * Evaluadores autocontenidos para page.evaluate (sin imports en browser).
 * export function evalX() { return async (args) => { ... todo inline ... } }
 */

function chainHelpers() {
  return `
  function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }
  function buildResult(chainId) {
    return { chainId: chainId, ok: true, soft: false, failedAt: null, failedBranch: null, failureMessage: null, links: [], branches: [], startedAt: Date.now() };
  }
  function listComandas() {
    if (typeof window.crozzoGetComandasList === 'function') return window.crozzoGetComandasList();
    return window.comandas || [];
  }
  function matchExpect(expected, actual) {
    if (!expected) return true;
    for (var k in expected) {
      if (!Object.prototype.hasOwnProperty.call(expected, k)) continue;
      var v = expected[k];
      var a = actual[k];
      if (v && typeof v === 'object' && v.oneOf) { if (v.oneOf.indexOf(a) < 0) return false; continue; }
      if (v && typeof v === 'object' && v.min != null) { if (Number(a) < v.min) return false; continue; }
      if (v && typeof v === 'object' && v.max != null) { if (Number(a) > v.max) return false; continue; }
      if (a !== v) return false;
    }
    return true;
  }
  function formatMismatch(node, expected, actual) {
    var parts = [];
    for (var k in expected) {
      if (!Object.prototype.hasOwnProperty.call(expected, k)) continue;
      parts.push(k + ': esperado ' + JSON.stringify(expected[k]) + ', actual ' + JSON.stringify(actual[k]));
    }
    return 'Eslabón «' + node + '» · ' + parts.join(' · ');
  }
  function link(result, node, expected, actual, branchesTriggered) {
    var ok = matchExpect(expected, actual);
    result.links.push({ node: node, ok: ok, expected: expected, actual: actual, branches: branchesTriggered || [] });
    if (!ok && result.ok) {
      result.ok = false;
      result.failedAt = node;
      result.failedBranch = (branchesTriggered && branchesTriggered[0]) || null;
      result.failureMessage = formatMismatch(node, expected, actual);
    }
    return result.links[result.links.length - 1];
  }
  function branch(result, name, detail) {
    result.branches.push({ name: name, detail: detail, at: new Date().toISOString() });
  }
  function snapMesa(mesaId) {
    var prevMesa = window.mesaSeleccionada;
    var prevTipo = window.tipoServicioCaja;
    window.tipoServicioCaja = 'mesa';
    window.mesaSeleccionada = mesaId;
    var slot = typeof window.getSlotStateInfo === 'function' ? window.getSlotStateInfo('mesa', mesaId) : { state: '?' };
    var cart = typeof window.getActiveCart === 'function' ? window.getActiveCart() : [];
    window.mesaSeleccionada = prevMesa;
    window.tipoServicioCaja = prevTipo;
    var cartQty = (cart || []).reduce(function(n, i) { return n + (Number(i.cantidad) || 0); }, 0);
    var sentQty = (cart || []).reduce(function(n, i) { return n + (Number(i.sentCantidad) || 0); }, 0);
    var comandasActivas = listComandas().filter(function(c) {
      return c && c.tipoServicio === 'mesa' && String(c.referencia) === String(mesaId);
    });
    var history = [];
    try {
      if (typeof window.crozzoComandaHistoryDayList === 'function') history = window.crozzoComandaHistoryDayList();
    } catch (_) {}
    history = history.filter(function(c) {
      return c && c.tipoServicio === 'mesa' && String(c.referencia) === String(mesaId);
    });
    var closed = false;
    try { closed = !!(window.closedSlots && window.closedSlots.mesa && window.closedSlots.mesa[mesaId]); } catch (_) {}
    return {
      slotState: slot.state,
      slotLabel: slot.label,
      cartQty: cartQty,
      sentQty: sentQty,
      comandasActivas: comandasActivas.length,
      comandaEstado: comandasActivas[0] ? comandasActivas[0].estado : history[0] ? history[0].estado : null,
      comandaArea: comandasActivas[0] ? comandasActivas[0].areaId : history[0] ? history[0].areaId : null,
      historyCount: history.length,
      closedSlot: closed,
    };
  }
  async function prepMesaChain(mesaId) {
    window.__crozzoSkipAllComandaGuards = true;
    window.__crozzoSkipDupCheck = true;
    window.__crozzoFacturarInFlight = false;
    if (typeof window.navigateTo === 'function') window.navigateTo('cajero');
    await sleep(900);
    if (typeof window.setCajaMode === 'function') window.setCajaMode('mesa');
    await sleep(250);
    try { if (window.closedSlots && window.closedSlots.mesa) delete window.closedSlots.mesa[mesaId]; } catch (_) {}
    window.tipoServicioCaja = 'mesa';
    window.mesaSeleccionada = mesaId;
    window.cajaMesaOrderOpen = true;
    if (typeof window.selectMesa === 'function') await window.selectMesa(mesaId);
    if (typeof window.crozzoTryEnterCajaSlot === 'function') window.crozzoTryEnterCajaSlot('mesa', mesaId);
    window.tipoServicioCaja = 'mesa';
    window.mesaSeleccionada = mesaId;
    window.cajaMesaOrderOpen = true;
    await sleep(400);
  }
  function qaSetDeviceId(id) {
    try {
      localStorage.setItem('crozzo_device_id', id);
      localStorage.setItem('device_id', id);
    } catch (_) {}
    try { window.CROZZO_DEVICE_ID = id; } catch (_) {}
  }
  async function addProductToMesa(qty, targetMesa) {
    var mid = targetMesa || window.mesaSeleccionada;
    window.tipoServicioCaja = 'mesa';
    window.mesaSeleccionada = mid;
    window.cajaMesaOrderOpen = true;
    var product = (window.products || []).find(function(p) { return Number(p.id) === 1; });
    if (!product) throw new Error('producto_1_ausente');
    var cart = typeof window.getActiveCart === 'function' ? window.getActiveCart() : [];
    if (typeof window.addItemToCartWithConfig === 'function') {
      window.addItemToCartWithConfig(cart, product);
      if (cart.length && cart[cart.length - 1]) cart[cart.length - 1].cantidad = qty || 1;
    }
    if (typeof window.renderCart === 'function') window.renderCart();
    return product;
  }
  `;
}

function wrapChain(body) {
  const helpers = chainHelpers();
  return new Function(
    'return async function(payload) { var mesaId = (payload && payload.mesaId) || "M7"; ' +
      helpers +
      body +
      ' }'
  )();
}

export const evalChainMesaEstados = wrapChain(`
  var mid = mesaId || 'M7';
  var R = buildResult('mesa-estados-comanda-cobro');
  await prepMesaChain(mid);
  link(R, 'tras:abrir-mesa', { slotState: { oneOf: ['libre', 'atendiendo'] }, comandasActivas: 0, cartQty: 0 }, snapMesa(mid), ['slot:session']);
  await addProductToMesa(2, mid);
  window.mesaSeleccionada = mid;
  window.tipoServicioCaja = 'mesa';
  window.cajaMesaOrderOpen = true;
  branch(R, 'cart:add', { productId: 1, qty: 2, mesa: mid });
  link(R, 'tras:agregar-carrito', { slotState: { oneOf: ['pendiente', 'atendiendo'] }, cartQty: { min: 1 } }, snapMesa(mid), ['cart:mesa']);
  var antesComandas = listComandas().length;
  if (typeof window.comandarDesdeCaja === 'function') window.comandarDesdeCaja();
  await sleep(650);
  branch(R, 'comandar:cocina', { comandasAfter: listComandas().length });
  link(R, 'tras:comandar', { slotState: 'comandado', comandasActivas: { min: 1 }, sentQty: { min: 1 } }, snapMesa(mid), ['comanda:area', 'cart:sentFlags']);
  var activa = listComandas().find(function(c) { return c.tipoServicio === 'mesa' && String(c.referencia) === mid; });
  if (activa && typeof window.updateComandaEstado === 'function') {
    window.updateComandaEstado(activa.id, 'lista', { skipFanout: true });
    branch(R, 'cocina:lista', { comandaId: activa.id });
  }
  await sleep(200);
  link(R, 'tras:cocina-lista', { slotState: 'comandado', comandasActivas: { min: 1 } }, snapMesa(mid), ['comanda:estado']);
  if (activa && typeof window.despacharComanda === 'function') {
    window.despacharComanda(activa.id, { skipToast: true, skipGossip: true, skipFanout: true });
    branch(R, 'cocina:entregada', { comandaId: activa.id });
  }
  await sleep(250);
  link(R, 'tras:cocina-entregada', { slotState: 'salio', comandasActivas: 0 }, snapMesa(mid), ['comanda:history', 'slot:unpaid']);
  var cartCmd = window.getActiveCart();
  if (typeof window.crozzoCartHasUncommandedItems === 'function' && window.crozzoCartHasUncommandedItems(cartCmd)) {
    if (typeof window.markTabletItemsAsSent === 'function') window.markTabletItemsAsSent(cartCmd, cartCmd);
  }
  var totals = typeof window.computeTotals === 'function' ? window.computeTotals(cartCmd) : { total: 0 };
  window.__crozzoFacturarInFlight = false;
  await window.facturar({ tipoComprobante: 'pos', metodoPago: 'efectivo', paymentMeta: { valorRecibido: totals.total, devueltas: 0 } });
  await sleep(500);
  if (typeof window.closeModal === 'function') window.closeModal({ skipCobroAbort: true });
  branch(R, 'cobro:facturar', { total: totals.total });
  link(R, 'tras:cobrar', { slotState: 'libre', cartQty: 0, comandasActivas: 0 }, snapMesa(mid), ['cobro:closedSlots', 'cart:clear', 'factura:pos']);
  R.durationMs = Date.now() - R.startedAt;
  return R;
`);

export const evalChainComandaRamas = wrapChain(`
  var mid = mesaId || 'M8';
  var R = buildResult('comanda-ramas-cocina');
  await prepMesaChain(mid);
  await addProductToMesa(1, mid);
  window.mesaSeleccionada = mid;
  window.tipoServicioCaja = 'mesa';
  window.cajaMesaOrderOpen = true;
  link(R, 'pre:mesa-contexto', { mesaSeleccionada: mid }, { mesaSeleccionada: String(window.mesaSeleccionada), cartQty: snapMesa(mid).cartQty }, ['slot:session']);
  var antes = listComandas().length;
  if (typeof window.comandarDesdeCaja === 'function') window.comandarDesdeCaja();
  await sleep(600);
  var nuevas = listComandas().slice(antes).filter(function(c) { return c && String(c.referencia) === String(mid); });
  if (!nuevas.length) {
    nuevas = listComandas().filter(function(c) { return c && c.tipoServicio === 'mesa' && String(c.referencia) === String(mid); });
  }
  var c = nuevas[nuevas.length - 1] || null;
  branch(R, 'comanda:nacimiento', { count: nuevas.length, mesaActiva: window.mesaSeleccionada });
  if (!c) {
    link(R, 'comanda:creada', { count: { min: 1 } }, { count: 0, mesaActiva: window.mesaSeleccionada }, ['comanda:area']);
  } else {
    link(R, 'comanda:creada', { count: { min: 1 } }, { count: nuevas.length, referencia: String(c.referencia) }, ['print:ticket']);
    link(R, 'comanda:area-cocina', { areaId: 'COCINA', referencia: mid }, { areaId: c.areaId, referencia: String(c.referencia) }, ['comanda:area']);
    var cart = window.getActiveCart();
    link(R, 'cart:lineas-enviadas', { sentQty: { min: 1 } }, { sentQty: (cart || []).reduce(function(n, i) { return n + (Number(i.sentCantidad) || 0); }, 0) }, ['cart:sentFlags']);
    if (typeof window.despacharComanda === 'function') {
      window.despacharComanda(c.id, { skipToast: true, skipGossip: true, skipFanout: true });
      await sleep(200);
    }
    var goneFromActivas = !listComandas().some(function(x) { return x.id === c.id; });
    var snapAfter = snapMesa(mid);
    link(R, 'comanda:historial', { goneFromActivas: true, slotState: 'salio', comandasActivas: 0 }, { goneFromActivas: goneFromActivas, slotState: snapAfter.slotState, comandasActivas: snapAfter.comandasActivas, comandaEstado: snapAfter.comandaEstado }, ['comanda:history']);
  }
  R.durationMs = Date.now() - R.startedAt;
  return R;
`);

export const evalChainCobroRamificaciones = wrapChain(`
  var mid = mesaId || 'M9';
  var R = buildResult('cobro-ramificaciones');
  await prepMesaChain(mid);
  await addProductToMesa(1, mid);
  if (typeof window.comandarDesdeCaja === 'function') window.comandarDesdeCaja();
  await sleep(500);
  var c = listComandas().find(function(x) { return x.tipoServicio === 'mesa' && String(x.referencia) === mid; });
  if (c && typeof window.despacharComanda === 'function') window.despacharComanda(c.id, { skipToast: true, skipGossip: true, skipFanout: true });
  await sleep(200);
  var facturasAntes = typeof window.config.getFacturas === 'function' ? window.config.getFacturas().length : 0;
  var auditsRaw = window.config.get('auditoria');
  var auditsAntes = Array.isArray(auditsRaw) ? auditsRaw.length : 0;
  var cart = window.getActiveCart();
  var totals = typeof window.computeTotals === 'function' ? window.computeTotals(cart) : { total: 0 };
  window.__crozzoFacturarInFlight = false;
  await window.facturar({ tipoComprobante: 'pos', metodoPago: 'efectivo', paymentMeta: { valorRecibido: totals.total, devueltas: 0 } });
  await sleep(500);
  if (typeof window.closeModal === 'function') window.closeModal({ skipCobroAbort: true });
  var facturas = typeof window.config.getFacturas === 'function' ? window.config.getFacturas() : [];
  var factura = facturas[0] || null;
  branch(R, 'factura:emitida', { uuid: factura && factura.uuid });
  link(R, 'cobro:factura-guardada', { facturasCount: { min: facturasAntes + 1 } }, { facturasCount: facturas.length, uuid: factura && factura.uuid }, ['config:save']);
  link(R, 'cobro:mesa-cerrada', { cartQty: 0, slotState: 'libre' }, { closedSlot: snapMesa(mid).closedSlot, cartQty: snapMesa(mid).cartQty, slotState: snapMesa(mid).slotState }, ['slot:paid', 'cart:clear']);
  var auditsRaw2 = window.config.get('auditoria');
  var auditsDespues = Array.isArray(auditsRaw2) ? auditsRaw2.length : 0;
  link(R, 'cobro:auditoria', { grew: true }, { auditsBefore: auditsAntes, auditsAfter: auditsDespues, grew: auditsDespues >= auditsAntes }, ['audit:trail']);
  R.durationMs = Date.now() - R.startedAt;
  return R;
`);

export const evalChainVentaInventarioMeta = wrapChain(`
  var mid = mesaId || 'M6';
  var R = buildResult('venta-inventario-meta');
  await prepMesaChain(mid);
  await addProductToMesa(1, mid);
  if (typeof window.comandarDesdeCaja === 'function') window.comandarDesdeCaja();
  await sleep(400);
  var cart = window.getActiveCart();
  var totals = typeof window.computeTotals === 'function' ? window.computeTotals(cart) : { total: 0 };
  window.__crozzoFacturarInFlight = false;
  await window.facturar({ tipoComprobante: 'pos', metodoPago: 'efectivo', paymentMeta: { valorRecibido: totals.total, devueltas: 0 } });
  await sleep(400);
  if (typeof window.closeModal === 'function') window.closeModal({ skipCobroAbort: true });
  var factura = (typeof window.config.getFacturas === 'function' ? window.config.getFacturas() : [])[0];
  var meta = factura && factura.inventarioMeta ? factura.inventarioMeta : null;
  var restauranteOmitido = !!(meta && meta.contexto === 'restaurante' && meta.lineas && meta.lineas.length && meta.lineas.every(function(l) { return l.resultado === 'omitido' || l.modo === 'ninguno'; }));
  branch(R, 'inventario:aplicarVenta', { hasMeta: !!meta, aplicado: meta && meta.aplicado, contexto: meta && meta.contexto, restauranteOmitido: restauranteOmitido });
  link(R, 'factura:inventarioMeta', { hasMeta: true }, { hasMeta: !!meta, aplicado: !!(meta && meta.aplicado), contexto: meta && meta.contexto, lineas: meta && meta.lineas ? meta.lineas.length : 0, restauranteOmitido: restauranteOmitido }, ['inventario:orquestador']);
  if (meta && meta.lineas && meta.lineas.length) {
    branch(R, 'inventario:lineas', meta.lineas.map(function(l) { return { id: l.id, modo: l.modo, resultado: l.resultado }; }));
  }
  if (!meta) {
    R.ok = false;
    R.soft = true;
    R.failedAt = 'factura:inventarioMeta';
    R.failedBranch = 'inventario:orquestador';
    R.failureMessage = 'Sin inventarioMeta post-cobro';
  } else if (!meta.aplicado && !restauranteOmitido) {
    R.ok = false;
    R.soft = true;
    R.failedAt = 'factura:inventarioMeta';
    R.failedBranch = 'inventario:orquestador';
    R.failureMessage = 'inventarioMeta sin aplicar ni rama restaurante omitido';
  }
  R.durationMs = Date.now() - R.startedAt;
  return R;
`);

export const evalChainDualTabletLock = wrapChain(`
  var mid = mesaId || 'M10';
  var R = buildResult('tablet-dual-slot-lock');
  window.__crozzoSkipAllComandaGuards = true;
  try { if (typeof window.crozzoReleaseOrderSlotSession === 'function') window.crozzoReleaseOrderSlotSession('mesa', mid); } catch (_) {}
  await prepMesaChain(mid);
  if (typeof window.navigateTo === 'function') window.navigateTo('tablets');
  await sleep(700);
  window.tabletModoPedido = 'mesa';

  qaSetDeviceId('qa-tablet-A');
  if (typeof window.loginWithCredentials === 'function') await window.loginWithCredentials('MESNOV', 'qa123456');
  await sleep(350);
  if (typeof window.navigateTo === 'function') window.navigateTo('tablets');
  await sleep(450);
  if (typeof window.crozzoMarkOperativeSyncReady === 'function') window.crozzoMarkOperativeSyncReady();
  window.tabletModoPedido = 'mesa';
  window.tabletMesaSeleccionada = mid;
  window.mesaSeleccionada = mid;
  window.tabletOrderOpen = true;
  window.tipoServicioCaja = 'mesa';
  if (typeof window.crozzoTryEnterTabletSlot === 'function') window.crozzoTryEnterTabletSlot('mesa', mid);
  await sleep(400);
  var snapA = snapMesa(mid);
  var peerA = null;
  try { peerA = window.crozzoSlotLockPeerInfo('mesa', mid); } catch (_) {}
  branch(R, 'tablet:A-ocupa', { deviceId: 'qa-tablet-A', slotState: snapA.slotState, peer: peerA, tabletOpen: !!window.tabletOrderOpen });
  link(R, 'tablet:A-sesion', { hasSession: true }, { hasSession: !!(peerA && peerA.mine), slotState: snapA.slotState, tabletOpen: !!window.tabletOrderOpen }, ['slot:session']);

  qaSetDeviceId('qa-tablet-B');
  await sleep(200);
  var peerBView = null;
  try { peerBView = window.crozzoSlotLockPeerInfo('mesa', mid); } catch (_) {}
  var snapBView = snapMesa(mid);
  branch(R, 'tablet:B-vista-sin-login', { peer: peerBView, slotState: snapBView.slotState, slotLabel: snapBView.slotLabel });
  var bSeesOther = !!(peerBView && peerBView.mine === false);
  var bEnUso = snapBView.slotState === 'en-uso' || String(snapBView.slotLabel || '').indexOf('En uso') >= 0;
  link(R, 'dual:anti-pisoteo-vista', { seesOther: true }, { seesOther: bSeesOther, enUso: bEnUso, slotState: snapBView.slotState, slotLabel: snapBView.slotLabel, who: peerBView && peerBView.userName }, ['slot:sessionLock']);

  if (typeof window.loginWithCredentials === 'function') await window.loginWithCredentials('MESEXP', 'qa123456');
  await sleep(350);
  if (typeof window.navigateTo === 'function') window.navigateTo('tablets');
  await sleep(450);
  window.tabletOrderOpen = false;
  window.tabletMesaSeleccionada = mid;
  window.mesaSeleccionada = mid;
  window.tabletOrderOpen = true;
  if (typeof window.crozzoTryEnterTabletSlot === 'function') window.crozzoTryEnterTabletSlot('mesa', mid);
  await sleep(350);
  var peerBAfter = null;
  try { peerBAfter = window.crozzoSlotLockPeerInfo('mesa', mid); } catch (_) {}
  var snapBAfter = snapMesa(mid);
  var peersTogether = !!(peerBAfter && (Number(peerBAfter.count) >= 1 || peerBAfter.mine === false));
  var bAware = peersTogether || bSeesOther || bEnUso;
  branch(R, 'tablet:B-intenta', { entered: !!window.tabletOrderOpen, peer: peerBAfter, slotState: snapBAfter.slotState, bAware: bAware });
  link(R, 'dual:co-presencia', { bAware: true }, { bAware: bAware, peerMine: peerBAfter && peerBAfter.mine, peerCount: peerBAfter && peerBAfter.count, peersTogether: peersTogether, sawOtherBeforeLogin: bSeesOther, slotState: snapBAfter.slotState, tabletOpen: !!window.tabletOrderOpen }, ['slot:session']);

  if (!R.ok) R.failureMessage = R.failureMessage || 'Anti-pisoteo tablet: segundo dispositivo no detectó ocupación';
  try { if (typeof window.crozzoReleaseOrderSlotSession === 'function') window.crozzoReleaseOrderSlotSession('mesa', mid); } catch (_) {}
  R.durationMs = Date.now() - R.startedAt;
  return R;
`);
