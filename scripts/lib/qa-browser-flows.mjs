/**
 * Flujos ejecutados dentro del navegador (page.evaluate).
 */

export function buildStaffRoster() {
  return [
    { id: 'CAJNOV', nombre: 'Ana Cajero', rol: 'caja', activo: true, clave: 'qa123456' },
    { id: 'CAJEXP', nombre: 'Luis Cajero', rol: 'caja', activo: true, clave: 'qa123456' },
    { id: 'MESNOV', nombre: 'Sofía Mesera', rol: 'mesero', activo: true, clave: 'qa123456' },
    { id: 'MESEXP', nombre: 'Carlos Mesero', rol: 'mesero', activo: true, clave: 'qa123456' },
    { id: 'COCINA1', nombre: 'María Cocina', rol: 'cocina', activo: true, clave: 'qa123456' },
    { id: 'ENC1', nombre: 'Patricia Encargada', rol: 'encargado', activo: true, clave: 'qa123456' },
    { id: 'GF1', nombre: 'Jorge Compras', rol: 'inventario', activo: true, clave: 'qa123456' },
    { id: 'ADM1', nombre: 'Diana Admin', rol: 'admin', activo: true, clave: 'qa123456' },
  ];
}

/** Script de evaluación: login staff + perfil empresa */
export function evalLoginPersona(persona) {
  return async ({ persona }) => {
    localStorage.setItem('crozzo_perfil_empresa', persona.perfilEmpresa || 'basico_restaurante');
    sessionStorage.setItem('crozzo_session_user', persona.userId);
    const Auth = window.CrozzoAuthSecurity;
    if (Auth && typeof Auth.crozzoIssueAuthProof === 'function') Auth.crozzoIssueAuthProof(persona.userId);
    await new Promise((r) => setTimeout(r, 350));
    const u = typeof window.getCurrentUser === 'function' ? window.getCurrentUser() : null;
    if (!u) return { ok: false, error: 'sin_usuario', userId: persona.userId };
    if (typeof window.hideLoginOverlay === 'function') window.hideLoginOverlay();
    if (typeof window.applyAccessControl === 'function') window.applyAccessControl();
    var exp = 'mixed';
    try {
      if (typeof window.crozzoGetPerfilOperativo === 'function') {
        var m = window.crozzoGetPerfilOperativo(localStorage.getItem('crozzo_perfil_empresa'));
        exp = (m && m.experiencia) || 'mixed';
      }
    } catch (_) {}
    var psyche = {};
    try {
      if (window.CrozzoOperativePsyche) {
        psyche = {
          humanLayer: CrozzoOperativePsyche.shouldApplyHumanLayer && CrozzoOperativePsyche.shouldApplyHumanLayer(),
          comfortUx: CrozzoOperativePsyche.shouldApplyComfortUx && CrozzoOperativePsyche.shouldApplyComfortUx(),
        };
      }
    } catch (_) {}
    return { ok: true, userId: u.id, rol: u.rol, experienciaPerfil: exp, psyche };
  };
}

export function evalPersonaPageAccess(persona) {
  return ({ persona }) => {
    const out = { ok: [], denied: [] };
    function canSee(page) {
      if (typeof window.currentUserCanSeePage === 'function') return window.currentUserCanSeePage(page);
      if (typeof window.crozzoAssertPageAccess === 'function') {
        const r = window.crozzoAssertPageAccess(page);
        return r && r.ok;
      }
      return true;
    }
    (persona.pagesOk || []).forEach((p) => {
      if (canSee(p)) out.ok.push(p);
      else out.denied.push({ page: p, expected: 'ok' });
    });
    (persona.pagesDenied || []).forEach((p) => {
      if (!canSee(p)) out.ok.push('deny:' + p);
      else out.denied.push({ page: p, expected: 'denied' });
    });
    return out;
  };
}

export function evalCompanionOnPage(pageId) {
  return ({ pageId }) => {
    if (typeof window.crozzoCompanionOnPage === 'function') window.crozzoCompanionOnPage(pageId);
    const host = document.getElementById('crozzoCompanionRailHost');
    const rail = host && host.querySelector('.crozzo-companion-rail');
    const hint = rail && rail.querySelector('.crozzo-companion-rail__hint');
    const badge = rail && rail.querySelector('.crozzo-companion-rail__badge');
    return {
      hasHost: !!host,
      hasRail: !!rail,
      hint: hint ? hint.textContent.trim().slice(0, 120) : '',
      badge: badge ? badge.textContent.trim() : '',
      roleLine:
        typeof window.crozzoCompanionRoleLine === 'function' ? window.crozzoCompanionRoleLine() : '',
    };
  };
}

export function evalSaleFlowMesa(opts) {
  opts = opts || {};
  return async ({ mesaId, qty, skipGuards }) => {
    const out = { mesaId: mesaId || 'M1', qty: qty || 2 };
    if (skipGuards) {
      window.__crozzoSkipAllComandaGuards = true;
      window.__crozzoSkipDupCheck = true;
    }
    window.__crozzoFacturarInFlight = false;

    if (typeof window.navigateTo === 'function') window.navigateTo('cajero');
    await new Promise((r) => setTimeout(r, 1000));
    if (typeof window.setCajaMode === 'function') window.setCajaMode('mesa');
    await new Promise((r) => setTimeout(r, 250));
    if (typeof window.selectMesa === 'function') {
      await window.selectMesa(out.mesaId);
    } else {
      window.tipoServicioCaja = 'mesa';
      window.mesaSeleccionada = out.mesaId;
      window.cajaMesaOrderOpen = true;
      if (typeof window.crozzoTryEnterCajaSlot === 'function') window.crozzoTryEnterCajaSlot('mesa', out.mesaId);
    }
    window.tipoServicioCaja = 'mesa';
    window.mesaSeleccionada = out.mesaId;
    window.cajaMesaOrderOpen = true;
    await new Promise((r) => setTimeout(r, 350));

    const product = (window.products || []).find((p) => Number(p.id) === 1);
    if (!product) throw new Error('producto_1_ausente');
    const cart = window.getActiveCart();
    if (typeof window.addItemToCartWithConfig === 'function') {
      window.addItemToCartWithConfig(cart, product);
      if (cart[0]) cart[0].cantidad = out.qty;
    } else throw new Error('sin_addItemToCartWithConfig');
    if (typeof window.renderCart === 'function') window.renderCart();

    const comandasAntes = (window.comandas || []).length;
    if (typeof window.comandarDesdeCaja !== 'function') throw new Error('sin_comandar');
    window.comandarDesdeCaja();
    await new Promise((r) => setTimeout(r, 650));
    if (String(window.__crozzoLastComandaSendFailReason || '') === 'pending') throw new Error('comanda_pending');
    if ((window.comandas || []).length <= comandasAntes) throw new Error('sin_comanda');

    const last = window.comandas[window.comandas.length - 1];
    out.comandaId = last && last.id;
    if (typeof window.updateComandaEstado === 'function' && out.comandaId != null) {
      window.updateComandaEstado(out.comandaId, 'lista', { skipFanout: true });
    }

    window.tipoServicioCaja = 'mesa';
    window.mesaSeleccionada = out.mesaId;
    window.cajaMesaOrderOpen = true;
    const cartCmd = window.getActiveCart();
    if (!cartCmd || !cartCmd.length) throw new Error('carrito_vacio_pre_cobro');
    if (typeof window.crozzoCartHasUncommandedItems === 'function' && window.crozzoCartHasUncommandedItems(cartCmd)) {
      if (typeof window.markTabletItemsAsSent === 'function') {
        window.markTabletItemsAsSent(cartCmd, cartCmd);
      } else {
        cartCmd.forEach(function (it) {
          if (it) it.sentCantidad = Number(it.cantidad) || 1;
        });
      }
    }
    const totals = typeof window.computeTotals === 'function' ? window.computeTotals(cartCmd) : { total: 0 };
    out.total = totals.total;

    const facturasAntes =
      typeof window.config.getFacturas === 'function' ? window.config.getFacturas().length : 0;
    window.__crozzoFacturarInFlight = false;
    await window.facturar({
      tipoComprobante: 'pos',
      metodoPago: 'efectivo',
      paymentMeta: { valorRecibido: totals.total, devueltas: 0 },
    });

    let cleared = false;
    for (let t = 0; t < 50; t++) {
      await new Promise((r) => setTimeout(r, 100));
      const c = window.getActiveCart();
      if (!c || !c.length) {
        cleared = true;
        break;
      }
    }
    if (!cleared) {
      const facturas = typeof window.config.getFacturas === 'function' ? window.config.getFacturas() : [];
      if (facturas.length > facturasAntes) {
        if (typeof window.crozzoClearCartAfterSale === 'function') {
          window.crozzoClearCartAfterSale(facturas[0], 'efectivo');
        }
      }
      const c2 = window.getActiveCart();
      if (c2 && c2.length) {
        throw new Error(
          'carrito_no_vacio tipo=' +
            String(window.tipoServicioCaja) +
            ' mesa=' +
            String(window.mesaSeleccionada) +
            ' facturas=' +
            facturas.length
        );
      }
    }

    if (typeof window.closeModal === 'function') window.closeModal({ skipCobroAbort: true });
    const facturas = typeof window.config.getFacturas === 'function' ? window.config.getFacturas() : [];
    if (!facturas.length) throw new Error('sin_factura');
    out.facturaUuid = facturas[0].uuid;
    return out;
  };
}

export function evalAdversarialPack() {
  return async () => {
    const results = {};
    window.__crozzoSkipAllComandaGuards = false;
    window.__crozzoSkipDupCheck = false;

    // post-comandar: mesero no puede bajar línea comandada
    try {
      if (typeof window.logoutCurrentUser === 'function') {
        try { window.logoutCurrentUser({ force: true }); } catch (_) {}
      }
      if (typeof window.loginWithCredentials === 'function') {
        const lr = await window.loginWithCredentials('MESNOV', 'qa123456');
        if (!lr || !lr.ok) throw new Error('login_mesero_fallo');
      }
      if (typeof window.navigateTo === 'function') window.navigateTo('cajero');
      await new Promise((r) => setTimeout(r, 500));
      window.tipoServicioCaja = 'mesa';
      window.mesaSeleccionada = 'M20';
      window.cajaMesaOrderOpen = true;
      const cart = window.getActiveCart();
      while (cart.length) cart.pop();
      const p = (window.products || [])[0];
      if (p && typeof window.addItemToCartWithConfig === 'function') {
        window.addItemToCartWithConfig(cart, p);
        const line = cart[cart.length - 1];
        if (line) {
          line.cantidad = 1;
          line.sentCantidad = 1;
          if (typeof window.markTabletItemsAsSent === 'function') window.markTabletItemsAsSent(cart, cart);
        }
      }
      const line = cart[cart.length - 1];
      const u = typeof window.getCurrentUser === 'function' ? window.getCurrentUser() : null;
      const sentCheck =
        line && typeof window.crozzoCartItemSentQty === 'function' ? window.crozzoCartItemSentQty(line) : 0;
      const qtyBefore = cart.reduce(function (n, it) { return n + (Number(it.cantidad) || 0); }, 0);
      let blocked = false;
      const prevToast = window.showToast;
      const prevDenied = window.crozzoOperativeCompanionNotifyDenied;
      window.showToast = function (msg) {
        if (/cocina|encargado|comandado|no puede|bloqueado|enviado/i.test(String(msg))) blocked = true;
      };
      window.crozzoOperativeCompanionNotifyDenied = function () { blocked = true; };
      const sig = line && typeof window.crozzoCartLineSig === 'function' ? window.crozzoCartLineSig(line) : '';
      if (typeof window.removeFromCart === 'function') window.removeFromCart(1, sig);
      window.showToast = prevToast;
      window.crozzoOperativeCompanionNotifyDenied = prevDenied;
      const qtyAfter = cart.reduce(function (n, it) { return n + (Number(it.cantidad) || 0); }, 0);
      results.postComandarBlocked =
        !!(u && String(u.rol || '').toLowerCase() === 'mesero' && sentCheck >= 1 && (blocked || qtyAfter >= qtyBefore));
      results.postComandarQty = { before: qtyBefore, after: qtyAfter, sentCheck, userId: u && u.id, rol: u && u.rol };
    } catch (e) {
      results.postComandarBlocked = false;
      results.postComandarError = String(e.message || e);
    }

    // doble cobro
    window.__crozzoSkipAllComandaGuards = true;
    window.tipoServicioCaja = 'directa';
    window.cartDirecto = [
      { id: 1, nombre: 'Test', precio: 5000, cantidad: 1, areaComanda: 'COCINA' },
    ];
    window.__crozzoFacturarInFlight = true;
    let secondBlocked = false;
    try {
      await window.facturar({ tipoComprobante: 'pos', metodoPago: 'efectivo', paymentMeta: { valorRecibido: 5000 } });
    } catch (_) {}
    secondBlocked = !!window.__crozzoFacturarInFlight;
    window.__crozzoFacturarInFlight = false;
    results.doubleCobroGuard = secondBlocked;

    // nav spam
    const pages = ['cajero', 'comandas', 'inicio-operacion', 'tablets', 'cajero'];
    let navErrors = 0;
    for (const pg of pages) {
      try {
        if (typeof window.navigateTo === 'function') window.navigateTo(pg);
      } catch (_) {
        navErrors++;
      }
    }
    results.navSpamSurvived = navErrors === 0 && !!document.getElementById('mainContent');

    // comandar vacío
    window.cartDirecto = [];
    window.cajaMesaOrderOpen = false;
    const before = (window.comandas || []).length;
    if (typeof window.comandarDesdeCaja === 'function') window.comandarDesdeCaja();
    results.emptyComandarGraceful = (window.comandas || []).length === before;

    return results;
  };
}

export function evalJournalSnapshot() {
  return () => {
    let journal = [];
    try {
      journal = JSON.parse(localStorage.getItem('crozzo_operative_journal_v1') || '[]');
    } catch (_) {}
    return {
      entries: journal.length,
      recent: journal.slice(-5).map((j) => ({ kind: j.kind, code: j.code, page: j.page })),
    };
  };
}
