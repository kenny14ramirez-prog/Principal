// Extraido de CrozzoPosMain.js (cirugia de modularizacion). Declaraciones
// globales puras; el listener se registra en CrozzoPosMain (document keydown).
// ==========================================
// Atajos de teclado POS (filtros navegador / Tauri)
// ==========================================
/** Teclas/combos reservadas del navegador o Tauri — no capturar para el POS. */
function crozzoIsReservedBrowserKey(e) {
  if (!e || !e.key) return false;
  var k = e.key;
  if (k === 'F12' || k === 'F5') return true;
  if (e.ctrlKey && (k === 'r' || k === 'R' || k === 's' || k === 'S' || k === 'p' || k === 'P')) return true;
  if (e.ctrlKey && e.shiftKey && (k === 'i' || k === 'I')) return true;
  return false;
}
function crozzoIsTypingTarget(el) {
  if (!el) return false;
  var tag = (el.tagName || '').toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!el.isContentEditable;
}
function crozzoPosShortcutsBlocked() {
  if (typeof crozzoModalIsOpen === 'function' && crozzoModalIsOpen()) return true;
  try {
    if (typeof wizardState !== 'undefined' && wizardState && wizardState.open) return true;
  } catch (_) {}
  return false;
}
function crozzoPosGlobalKeydown(e) {
  if (crozzoIsReservedBrowserKey(e)) return;
  if (crozzoPosShortcutsBlocked()) return;
  var ae = document.activeElement;
  if (crozzoIsTypingTarget(ae)) return;
  if (e.ctrlKey && (e.key === 'k' || e.key === 'K')) {
    if (typeof currentPage === 'undefined') return;
    if (currentPage === 'cajero') {
      const el = document.getElementById('searchProduct');
      if (el) {
        e.preventDefault();
        el.focus();
        if (typeof el.select === 'function') el.select();
      }
    } else if (currentPage === 'venta-comercial') {
      const el = document.getElementById('searchProductCommercial');
      if (el) {
        e.preventDefault();
        el.focus();
        if (typeof el.select === 'function') el.select();
      }
    } else if (currentPage === 'tablets') {
      const el = document.getElementById('tabletSearchProduct') || document.getElementById('tabletSearchTarget');
      if (el) {
        e.preventDefault();
        el.focus();
        if (typeof el.select === 'function') el.select();
      }
    }
    return;
  }
  if (e.ctrlKey && e.shiftKey && e.key === 'Enter') {
    if (typeof currentPage !== 'undefined' && currentPage === 'cajero') {
      e.preventDefault();
      if (typeof crozzoCuentaCobroElegir === 'function') crozzoCuentaCobroElegir('cobrar', { metodoInicial: 'efectivo' });
      return;
    }
    if (typeof currentPage !== 'undefined' && currentPage === 'venta-comercial') {
      const btnRapido = document.getElementById('btnCobroEfectivoRapido');
      if (btnRapido && !btnRapido.disabled) {
        e.preventDefault();
        btnRapido.click();
        return;
      }
    }
  }
  if (e.ctrlKey && e.key === 'Enter') {
    if (typeof currentPage === 'undefined') return;
    if (currentPage === 'cajero') {
      e.preventDefault();
      if (typeof crozzoCuentaCobroElegir === 'function') crozzoCuentaCobroElegir('cobrar');
      return;
    }
    if (currentPage === 'venta-comercial') {
      const btn = document.getElementById('btnComandarCobrar');
      if (btn && !btn.disabled) {
        e.preventDefault();
        btn.click();
      }
    } else if (currentPage === 'tablets') {
      const btn = document.getElementById('btnTabletConfirmComanda');
      if (btn && !btn.disabled) {
        e.preventDefault();
        btn.click();
      }
    }
  }
  /* F1–F11: atajo producto visible (F12 = DevTools, no POS) */
  if (!e.ctrlKey && !e.altKey && !e.metaKey && /^F([1-9]|1[0-1])$/.test(e.key)) {
    if (typeof currentPage === 'undefined') return;
    if (currentPage !== 'cajero' && currentPage !== 'venta-comercial' && currentPage !== 'tablets') return;
    const n = parseInt(e.key.replace('F', ''), 10);
    if (n < 1 || n > 11) return;
    const sel =
      currentPage === 'tablets' ? '#tabletProducts .product-card' : '#posProducts .product-card';
    const cards = document.querySelectorAll(sel);
    const card = cards[n - 1];
    if (!card || card.style.display === 'none') return;
    e.preventDefault();
    card.click();
  }
}
try { window.crozzoIsReservedBrowserKey = crozzoIsReservedBrowserKey; } catch (_) {}
