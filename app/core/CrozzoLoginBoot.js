/**
 * Arranque del login — disponible antes de CrozzoPosMain (defer).
 * Repara overlays huérfanos, stubs de login/kiosko y consola F12 en Tauri.
 */
(function (global) {
  'use strict';

  function crozzoPresentLoginBootFault(msg) {
    try {
      var el = document.getElementById('loginJsFault');
      if (!el) return;
      el.hidden = false;
      el.textContent = String(msg || '').trim();
    } catch (_) {}
    try {
      var st = document.getElementById('loginBootStatus');
      if (st) {
        st.hidden = false;
        st.textContent = String(msg || '').trim();
      }
    } catch (_) {}
  }

  function crozzoHasActivePosSessionEarly() {
    try {
      if (global.__crozzoKioskChosenThisBoot) return true;
      var sid = sessionStorage.getItem('crozzo_session_user');
      if (sid && String(sid).trim()) return true;
      if (global.__crozzoAuthInteractiveThisBoot) return true;
    } catch (_) {}
    return false;
  }

  function crozzoRepairLoginShell() {
    try {
      var containment = document.getElementById('crozzoHpContainmentOverlay');
      if (document.body.classList.contains('crozzo-hp-containment-active')) {
        if (!containment || containment.hasAttribute('hidden')) {
          document.body.classList.remove('crozzo-hp-containment-active');
        }
      }
      var hpOv = document.getElementById('crozzoHoneypotOverlay');
      if (
        document.body.classList.contains('crozzo-honeypot-active') &&
        !document.body.classList.contains('crozzo-honeypot-live')
      ) {
        if (!hpOv || hpOv.hasAttribute('hidden')) {
          document.body.classList.remove(
            'crozzo-honeypot-active',
            'crozzo-honeypot-real-app',
            'crozzo-hp-trap-prep'
          );
        }
      }
      var gate = document.getElementById('crozzo-boot-update-gate');
      if (!gate || !gate.classList.contains('is-open')) {
        document.documentElement.classList.remove('crozzo-boot-updates-active');
        document.body.classList.remove('crozzo-boot-updates-active');
      }
      document.body.classList.remove('crozzo-login-hp-blocked', 'crozzo-hp-trap-prep');
      var pairOv = document.getElementById('crozzoPairingOverlay');
      if (!pairOv || pairOv.hasAttribute('hidden')) {
        document.body.classList.remove('crozzo-pairing-open');
      }
    } catch (_) {}

    if (crozzoHasActivePosSessionEarly()) return;

    try {
      var gatePending =
        document.documentElement.classList.contains('crozzo-auth-gate-pending') &&
        !document.documentElement.classList.contains('crozzo-app-ready');
      var loginOpen = document.body.classList.contains('crozzo-login-open');
      if (gatePending || loginOpen) {
        var ov = document.getElementById('loginOverlay');
        if (ov) {
          ov.removeAttribute('hidden');
          ov.style.pointerEvents = 'auto';
        }
        document.body.classList.add('crozzo-login-open');
        document.body.style.overflow = 'hidden';
        var form = document.getElementById('loginForm');
        if (form) {
          form.querySelectorAll('input, button, select, textarea').forEach(function (el) {
            el.disabled = false;
            el.removeAttribute('inert');
            el.style.pointerEvents = 'auto';
          });
        }
        ['btnKioskCocinaBar', 'btnPairDevice', 'btnDownloadApk'].forEach(function (id) {
          var btn = document.getElementById(id);
          if (!btn) return;
          btn.disabled = false;
          btn.removeAttribute('inert');
          btn.style.pointerEvents = 'auto';
        });
      }
    } catch (_) {}
    if (typeof global.crozzoTabletShellRefresh === 'function') {
      global.crozzoTabletShellRefresh();
    }
  }

  function crozzoOpenDevtools() {
    try {
      if (global.__TAURI__ && global.__TAURI__.core && typeof global.__TAURI__.core.invoke === 'function') {
        global.__TAURI__.core.invoke('crozzo_open_devtools').catch(function () {});
        return;
      }
    } catch (_) {}
    crozzoPresentLoginBootFault('Consola técnica: use F12 si el navegador lo permite.');
  }

  function crozzoWireLoginBootUi() {
    var devBtn = document.getElementById('loginDevToolsBtn');
    if (devBtn && !devBtn._crozzoBound) {
      devBtn._crozzoBound = true;
      if (global.__CROZZO_IS_TAURI__) devBtn.style.display = '';
      devBtn.addEventListener('click', function (e) {
        e.preventDefault();
        crozzoOpenDevtools();
      });
    }
    var loginForm = document.getElementById('loginForm');
    if (loginForm && !loginForm._crozzoBound) {
      loginForm._crozzoBound = true;
      loginForm.addEventListener('submit', function (e) {
        e.preventDefault();
        if (typeof global.handleLoginSubmit === 'function') {
          global.handleLoginSubmit();
        }
      });
    }
    var kioskBtn = document.getElementById('btnKioskCocinaBar');
    if (kioskBtn && !kioskBtn._crozzoBound) {
      kioskBtn._crozzoBound = true;
      kioskBtn.addEventListener('click', function (e) {
        e.preventDefault();
        if (typeof global.crozzoKioskEnterComandasFromLogin === 'function') {
          global.crozzoKioskEnterComandasFromLogin('comandas');
        }
      });
    }
    var pairBtn = document.getElementById('btnPairDevice');
    if (pairBtn && !pairBtn._crozzoBound) {
      pairBtn._crozzoBound = true;
      pairBtn.addEventListener('click', function (e) {
        e.preventDefault();
        if (typeof global.crozzoOpenPairingModal === 'function') {
          global.crozzoOpenPairingModal();
        }
      });
    }
    var apkQrBtn = document.getElementById('btnDownloadApk');
    if (apkQrBtn && !apkQrBtn._crozzoBound) {
      apkQrBtn._crozzoBound = true;
      apkQrBtn.addEventListener('click', function (e) {
        e.preventDefault();
        if (typeof global.crozzoTriggerAppUpdate === 'function') {
          global.crozzoTriggerAppUpdate();
        } else if (typeof global.crozzoOpenAppDownloadQr === 'function') {
          global.crozzoOpenAppDownloadQr();
        } else if (typeof global.crozzoDownloadLatestApk === 'function') {
          global.crozzoDownloadLatestApk();
        }
      });
    }
    if (!document._crozzoDevtoolsKey) {
      document._crozzoDevtoolsKey = true;
      document.addEventListener('keydown', function (e) {
        if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i'))) {
          e.preventDefault();
          crozzoOpenDevtools();
        }
      });
    }
    if (typeof global.crozzoTabletShellRefresh === 'function') {
      global.crozzoTabletShellRefresh();
    }
  }

  function crozzoLoginBootPoll() {
    crozzoRepairLoginShell();
    if (global.__crozzoAppInitDone) {
      var st = document.getElementById('loginBootStatus');
      if (st && !document.getElementById('loginJsFault')?.textContent) {
        st.hidden = true;
      }
      return;
    }
    var st2 = document.getElementById('loginBootStatus');
    if (st2 && document.body.classList.contains('crozzo-login-open')) {
      st2.hidden = false;
      st2.textContent = 'Cargando módulos del POS…';
    }
    setTimeout(crozzoLoginBootPoll, 400);
  }

  global.crozzoPresentLoginBootFault = crozzoPresentLoginBootFault;
  global.crozzoRepairLoginShell = crozzoRepairLoginShell;
  global.crozzoOpenDevtools = crozzoOpenDevtools;

  if (typeof global.handleLoginSubmit !== 'function') {
    global.handleLoginSubmit = async function crozzoLoginSubmitStub() {
      if (typeof global.__crozzoHandleLoginSubmitMain === 'function') {
        return global.__crozzoHandleLoginSubmitMain.apply(global, arguments);
      }
      crozzoPresentLoginBootFault('El sistema aún carga. Espere unos segundos e intente de nuevo.');
      crozzoRepairLoginShell();
    };
  }

  if (typeof global.crozzoKioskEnterComandasFromLogin !== 'function') {
    global.crozzoKioskEnterComandasFromLogin = function crozzoKioskBootStub(targetPage) {
      if (typeof global.__crozzoKioskEnterComandasFromLoginMain === 'function') {
        return global.__crozzoKioskEnterComandasFromLoginMain(targetPage);
      }
      crozzoPresentLoginBootFault('Modo pantallas: espere a que termine de cargar el sistema.');
      crozzoRepairLoginShell();
    };
  }

  if (typeof global.crozzoOpenPairingModal !== 'function') {
    global.crozzoOpenPairingModal = function crozzoPairingBootStub() {
      crozzoPresentLoginBootFault('Emparejamiento: espere a que termine de cargar el sistema.');
    };
  }

  global.addEventListener('error', function (ev) {
    if (ev && ev.message && /ResizeObserver|Script error/i.test(ev.message)) return;
    crozzoPresentLoginBootFault(
      (ev && ev.message ? ev.message : 'Error JS') +
        (ev && ev.filename ? ' · ' + String(ev.filename).split('/').pop() : '')
    );
    crozzoRepairLoginShell();
  });

  global.addEventListener('unhandledrejection', function (ev) {
    var reason = ev && ev.reason;
    var msg = reason && reason.message ? reason.message : String(reason || 'Promesa rechazada');
    if (/ResizeObserver/i.test(msg)) return;
    crozzoPresentLoginBootFault(msg);
    crozzoRepairLoginShell();
  });

  function boot() {
    crozzoWireLoginBootUi();
    crozzoRepairLoginShell();
    crozzoLoginBootPoll();
    if (document.body && document.body.classList.contains('crozzo-login-open')) {
      setTimeout(crozzoRepairLoginShell, 0);
      setTimeout(crozzoRepairLoginShell, 800);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  global.addEventListener('load', function () {
    crozzoRepairLoginShell();
  });
})(typeof window !== 'undefined' ? window : globalThis);
