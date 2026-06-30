/**
 * QR rápido para tablet mesero — mismo código y acabado que el asistente completo.
 */
(function (global) {
  'use strict';

  var QUICK_HOST_ID = 'crozzoTabletQrQuickHost';
  var _renderToken = 0;

  function el(id) {
    return global.document.getElementById(id);
  }

  function isCajaRole() {
    try {
      var md = typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
      return String(md.role || 'A').toUpperCase() !== 'B';
    } catch (_) {
      return true;
    }
  }

  function isLoggedInShell() {
    try {
      var login = el('loginOverlay');
      if (login && !login.hasAttribute('hidden')) return false;
      var app = global.document.querySelector('.app-container');
      if (!app) return false;
      return app.offsetParent !== null || global.getComputedStyle(app).display !== 'none';
    } catch (_) {
      return false;
    }
  }

  function renderQr() {
    var host = el(QUICK_HOST_ID);
    if (!host) return Promise.resolve();
    var token = ++_renderToken;
    if (typeof global.crozzoPairingShowQrSkeleton === 'function') {
      global.crozzoPairingShowQrSkeleton(QUICK_HOST_ID);
    } else {
      host.innerHTML =
        '<div class="crozzo-pairing-qr-skeleton" aria-busy="true"><p>Generando código cifrado…</p></div>';
    }
    var prep =
      typeof global.crozzoPairingEnsureCajaReady === 'function'
        ? global.crozzoPairingEnsureCajaReady().catch(function () {
            return null;
          })
        : Promise.resolve(null);
    return prep.then(function () {
      if (token !== _renderToken) return;
      var built =
        typeof global.crozzoPairingBuildPayload === 'function'
          ? global.crozzoPairingBuildPayload('tablet')
          : { error: 'Emparejamiento no cargado aún.' };
      if (typeof global.crozzoPairingPaintReceiverMeta === 'function') {
        global.crozzoPairingPaintReceiverMeta(built, {
          warnId: 'crozzoTabletQrQuickWarn',
          bizId: 'crozzoTabletQrQuickBiz',
        });
      }
      if (built.error) {
        host.innerHTML =
          '<p class="form-hint" style="text-align:center;margin:12px 0;">' + built.error + '</p>';
        return false;
      }
      if (typeof global.crozzoPairingRenderScanQrIntoHost === 'function') {
        return global.crozzoPairingRenderScanQrIntoHost(host, built);
      }
      host.innerHTML =
        '<p class="form-hint" style="text-align:center;">Módulo de emparejamiento no listo. Recargue la app.</p>';
      return false;
    });
  }

  function openQuick() {
    if (!isCajaRole()) {
      if (typeof global.crozzoOpenPairingModal === 'function') global.crozzoOpenPairingModal();
      return;
    }
    var ov = el('crozzoTabletQrQuick');
    if (!ov) return;
    try {
      if (typeof global.crozzoCspWireTree === 'function') global.crozzoCspWireTree(ov);
    } catch (_) {}
    ov.removeAttribute('hidden');
    global.document.body.classList.add('crozzo-tablet-qr-quick-open');
    renderQr();
    try {
      if (typeof global.crozzoRefreshLucideIcons === 'function') global.crozzoRefreshLucideIcons();
    } catch (_) {}
  }

  function closeQuick() {
    var ov = el('crozzoTabletQrQuick');
    if (ov) ov.setAttribute('hidden', '');
    global.document.body.classList.remove('crozzo-tablet-qr-quick-open');
    _renderToken++;
  }

  function syncVisibility() {
    var show = isCajaRole() && isLoggedInShell();
    var btn = el('crozzoToolbarTabletQr');
    var item = el('userMenuTabletQrItem');
    if (btn) btn.hidden = !show;
    if (item) item.hidden = !show;
  }

  function wireControls() {
    var ov = el('crozzoTabletQrQuick');
    if (!ov || ov._crozzoQuickQrBound) return;
    ov._crozzoQuickQrBound = true;
    ov.addEventListener('click', function (ev) {
      if (ev.target === ov.querySelector('.crozzo-tablet-qr-quick__backdrop')) {
        closeQuick();
        return;
      }
      var btn =
        ev.target && ev.target.closest ? ev.target.closest('[data-crozzo-act]') : null;
      if (!btn || !ov.contains(btn)) return;
      var act = btn.getAttribute('data-crozzo-act');
      if (!act) return;
      ev.preventDefault();
      if (act === 'crozzoOpenTabletQrQuick') openQuick();
      else if (act === 'crozzoCloseTabletQrQuick') closeQuick();
      else if (act === 'crozzoTabletQrQuickRefresh') renderQr();
      else if (act === 'crozzoPairingShareQr' && typeof global.crozzoPairingShareQr === 'function') {
        global.crozzoPairingShareQr(QUICK_HOST_ID);
      } else if (act === 'crozzoPairingDownloadPng' && typeof global.crozzoPairingDownloadPng === 'function') {
        global.crozzoPairingDownloadPng(QUICK_HOST_ID);
      } else if (act === 'crozzoPairingCopyJson' && typeof global.crozzoPairingCopyJson === 'function') {
        global.crozzoPairingCopyJson();
      } else if (act === 'crozzoPairingOpenFullAssistant') {
        closeQuick();
        if (typeof global.crozzoOpenPairingModal === 'function') global.crozzoOpenPairingModal();
        if (typeof global.crozzoPairingSelectChoice === 'function') global.crozzoPairingSelectChoice();
      }
    });
    global.document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape') return;
      if (!ov || ov.hasAttribute('hidden')) return;
      closeQuick();
    });
  }

  global.crozzoOpenTabletQrQuick = openQuick;
  global.crozzoCloseTabletQrQuick = closeQuick;
  global.crozzoTabletQrQuickRefresh = function () {
    renderQr();
  };
  global.crozzoPairingOpenFullAssistant = function crozzoPairingOpenFullAssistant() {
    closeQuick();
    if (typeof global.crozzoOpenPairingModal === 'function') global.crozzoOpenPairingModal();
    if (typeof global.crozzoPairingSelectChoice === 'function') global.crozzoPairingSelectChoice();
  };

  global.CrozzoPairingQuickQr = {
    open: openQuick,
    close: closeQuick,
    refresh: renderQr,
    syncVisibility: syncVisibility,
    hostId: QUICK_HOST_ID,
  };

  function boot() {
    wireControls();
    syncVisibility();
    global.document.addEventListener('crozzo-lazy-ready', syncVisibility, { once: true });
    global.setTimeout(syncVisibility, 1200);
  }

  if (global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
