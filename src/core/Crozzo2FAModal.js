/**
 * Crozzo POS — 2FA Modal (Fase -2/P0)
 * ------------------------------------
 * Modal de TOTP para login de admin/superadmin.
 * Se activa con feature flag use2faAdmin.
 */
(function (global) {
  'use strict';

  var MODAL_ID = 'crozzo2faModal';

  function createModal() {
    if (document.getElementById(MODAL_ID)) return;
    var div = document.createElement('div');
    div.id = MODAL_ID;
    div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:none;align-items:center;justify-content:center;z-index:9999;';
    div.innerHTML = CrozzoSanitize ? CrozzoSanitize.sanitizeHtml(
      '<div style="background:#fff;padding:24px;border-radius:12px;max-width:360px;width:90%;text-align:center;">' +
      '<h3 style="margin:0 0 12px;">Verificacion 2FA</h3>' +
      '<p style="font-size:0.9rem;color:#666;margin:0 0 16px;">Ingrese el codigo de 6 digitos de su app autenticadora.</p>' +
      '<input id="crozzo2faCode" type="text" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" ' +
      'style="font-size:2rem;letter-spacing:8px;text-align:center;width:100%;padding:8px;border:1px solid #ccc;border-radius:8px;" ' +
      'placeholder="000000" autocomplete="one-time-code" />' +
      '<div style="margin-top:12px;display:flex;gap:8px;justify-content:center;">' +
      '<button id="crozzo2faVerify" class="btn btn-primary">Verificar</button>' +
      '<button id="crozzo2faCancel" class="btn btn-outline">Cancelar</button>' +
      '</div>' +
      '<p id="crozzo2faMsg" style="margin-top:8px;font-size:0.85rem;color:#b91c1c;"></p>' +
      '</div>'
    ) : '';
    document.body.appendChild(div);
  }

  function show() {
    createModal();
    var modal = document.getElementById(MODAL_ID);
    if (modal) {
      modal.style.display = 'flex';
      var input = document.getElementById('crozzo2faCode');
      if (input) { input.value = ''; input.focus(); }
      var msg = document.getElementById('crozzo2faMsg');
      if (msg) msg.textContent = '';
    }
  }

  function hide() {
    var modal = document.getElementById(MODAL_ID);
    if (modal) modal.style.display = 'none';
  }

  async function verify(secret, code) {
    if (!global.Crozzo2FA) return false;
    try {
      return await global.Crozzo2FA.verify(secret, code);
    } catch (e) {
      console.warn('2FA verify failed', e);
      return false;
    }
  }

  function bindHandlers(onSuccess, onCancel) {
    createModal();
    var verifyBtn = document.getElementById('crozzo2faVerify');
    var cancelBtn = document.getElementById('crozzo2faCancel');
    var input = document.getElementById('crozzo2faCode');
    if (verifyBtn) {
      verifyBtn.onclick = async function () {
        var code = input ? input.value.trim() : '';
        if (code.length !== 6) {
          var msg = document.getElementById('crozzo2faMsg');
          if (msg) msg.textContent = 'Codigo debe tener 6 digitos';
          return;
        }
        var secret = null;
        try {
          if (global.localStorage) secret = global.localStorage.getItem('crozzo_2fa_secret_temp');
        } catch (_) {}
        var ok = await verify(secret, code);
        if (ok) {
          hide();
          if (typeof onSuccess === 'function') onSuccess();
        } else {
          var msg2 = document.getElementById('crozzo2faMsg');
          if (msg2) msg2.textContent = 'Codigo invalido o expirado';
        }
      };
    }
    if (cancelBtn) {
      cancelBtn.onclick = function () {
        hide();
        if (typeof onCancel === 'function') onCancel();
      };
    }
    if (input) {
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (verifyBtn) verifyBtn.click();
        }
      });
    }
  }

  function isEnabled() {
    try {
      return !!(global.CrozzoFeatureFlags && global.CrozzoFeatureFlags.isEnabled('use2faAdmin'));
    } catch (_) { return false; }
  }

  global.Crozzo2FAModal = {
    show: show,
    hide: hide,
    bindHandlers: bindHandlers,
    isEnabled: isEnabled,
    createModal: createModal
  };
})(typeof window !== 'undefined' ? window : globalThis);
