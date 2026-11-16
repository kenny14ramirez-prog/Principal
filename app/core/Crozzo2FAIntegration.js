/**
 * Crozzo POS — 2FA Integration (Fase -2/P0)
 * -----------------------------------------
 * Integra 2FA TOTP en el flujo de login.
 * Se activa con feature flag use2faAdmin.
 */
(function (global) {
  'use strict';

  function isEnabled() {
    try { return !!(global.CrozzoFeatureFlags && global.CrozzoFeatureFlags.isEnabled('use2faAdmin')); } catch (_) { return false; }
  }

  function isAdminOrSuperadmin(rol) {
    var r = String(rol || '').toLowerCase();
    return r === 'admin' || r === 'superadmin' || r === 'super_admin';
  }

  async function verify2FA(secret, code) {
    if (!global.Crozzo2FA) return false;
    try { return await global.Crozzo2FA.verify(secret, code); } catch (_) { return false; }
  }

  // Hook para integrar en crozzoFinishLoginSuccess
  // Uso: if (Crozzo2FAIntegration.shouldPrompt2FA(user)) { Crozzo2FAIntegration.prompt(user, onSuccess, onCancel); return; }
  function shouldPrompt2FA(user) {
    if (!isEnabled()) return false;
    if (!user || !isAdminOrSuperadmin(user.rol)) return false;
    // Verificar si el usuario tiene secreto TOTP configurado
    try {
      var secret = global.localStorage.getItem('crozzo_2fa_secret_' + String(user.id || user.user || '').toLowerCase());
      return !!secret;
    } catch (_) { return false; }
  }

  async function prompt(user, onSuccess, onCancel) {
    if (!global.Crozzo2FAModal) return;
    global.Crozzo2FAModal.bindHandlers(
      async function onVerified() {
        var code = (document.getElementById('crozzo2faCode') || {}).value || '';
        var secret = null;
        try { secret = global.localStorage.getItem('crozzo_2fa_secret_' + String(user.id || user.user || '').toLowerCase()); } catch (_) {}
        var ok = await verify2FA(secret, code);
        if (ok) {
          if (typeof onSuccess === 'function') onSuccess();
        } else {
          var msg = document.getElementById('crozzo2faMsg');
          if (msg) msg.textContent = 'Código inválido o expirado';
        }
      },
      function onCancelled() {
        if (typeof onCancel === 'function') onCancel();
      }
    );
    global.Crozzo2FAModal.show();
  }

  global.Crozzo2FAIntegration = {
    isEnabled: isEnabled,
    isAdminOrSuperadmin: isAdminOrSuperadmin,
    shouldPrompt2FA: shouldPrompt2FA,
    prompt: prompt,
    verify2FA: verify2FA
  };
})(typeof window !== 'undefined' ? window : globalThis);
