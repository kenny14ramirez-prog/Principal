/**
 * CrozzoEmailRecovery — Sistema de correo de recuperación para KENNY.
 *
 * Funcionalidades:
 * 1. Guardar correo de recuperación en Supabase Central
 * 2. Verificar correo con código de 6 dígitos
 * 3. Recuperar PIN (cambiar contraseña) con código de verificación
 *
 * Seguridad:
 * - El correo se almacena en Supabase (no en el cliente)
 * - Los códigos expiran en 10 minutos
 * - Cada código solo se puede usar una vez
 * - La verificación se hace server-side (Supabase RPC)
 */
(function (global) {
  'use strict';

  var SUPABASE_CENTRAL_URL = 'https://hogeggkkodkpzossjfft.supabase.co';
  var SUPABASE_CENTRAL_ANON_KEY = 'sb_publishable_rNiFFu5h4YR-Ab5n8wxJSA_G58xhE64';

  // ── Guardar correo de KENNY ─────────────────────────────────────
  async function setEmail(username, email) {
    if (typeof fetch !== 'function') return { ok: false, error: 'no_network' };

    try {
      var res = await fetch(SUPABASE_CENTRAL_URL + '/rest/v1/rpc/set_superadmin_email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_CENTRAL_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_CENTRAL_ANON_KEY,
        },
        body: JSON.stringify({ p_username: username.toUpperCase(), p_email: email }),
      });

      if (!res.ok) return { ok: false, error: 'save_failed' };

      var data = await res.json();
      return data || { ok: false, error: 'no_data' };
    } catch (e) {
      return { ok: false, error: 'network_error', detail: e.message };
    }
  }

  // ── Generar código de verificación ──────────────────────────────
  async function generarCodigo(email, purpose) {
    if (typeof fetch !== 'function') return { ok: false, error: 'no_network' };

    try {
      var res = await fetch(SUPABASE_CENTRAL_URL + '/rest/v1/rpc/generate_verification_code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_CENTRAL_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_CENTRAL_ANON_KEY,
        },
        body: JSON.stringify({ p_email: email, p_purpose: purpose }),
      });

      if (!res.ok) return { ok: false, error: 'generate_failed' };

      var data = await res.json();
      return { ok: true, code: data };
    } catch (e) {
      return { ok: false, error: 'network_error', detail: e.message };
    }
  }

  // ── Verificar código ────────────────────────────────────────────
  async function verificarCodigo(email, code, purpose) {
    if (typeof fetch !== 'function') return { ok: false, error: 'no_network' };

    try {
      var res = await fetch(SUPABASE_CENTRAL_URL + '/rest/v1/rpc/verify_email_code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_CENTRAL_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_CENTRAL_ANON_KEY,
        },
        body: JSON.stringify({ p_email: email, p_code: code, p_purpose: purpose }),
      });

      if (!res.ok) return { ok: false, error: 'verify_failed' };

      var data = await res.json();
      return data || { ok: false, error: 'no_data' };
    } catch (e) {
      return { ok: false, error: 'network_error', detail: e.message };
    }
  }

  // ── Recuperar PIN ───────────────────────────────────────────────
  async function recuperarPin(email, code, newPin) {
    if (typeof fetch !== 'function') return { ok: false, error: 'no_network' };

    try {
      var res = await fetch(SUPABASE_CENTRAL_URL + '/rest/v1/rpc/recover_superadmin_pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_CENTRAL_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_CENTRAL_ANON_KEY,
        },
        body: JSON.stringify({ p_email: email, p_code: code, p_new_pin: newPin }),
      });

      if (!res.ok) return { ok: false, error: 'recover_failed' };

      var data = await res.json();
      return data || { ok: false, error: 'no_data' };
    } catch (e) {
      return { ok: false, error: 'network_error', detail: e.message };
    }
  }

  // ── Modal de configuración de correo ─────────────────────────────
  function mostrarModalConfigCorreo(username, onSaved) {
    var overlay = document.createElement('div');
    overlay.id = 'emailConfigOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;';

    var card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:16px;padding:32px;max-width:420px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.4);';

    card.innerHTML = CrozzoSanitize.sanitizeHtml('<h2 style="margin:0 0 8px;font-size:1.3rem;color:#1a1a2e;">📧 Correo de recuperación</h2>' +
      '<p style="margin:0 0 20px;color:#666;font-size:0.9rem;">Configura un correo para recuperar tu PIN si lo olvidas.</p>' +
      '<div style="display:flex;flex-direction:column;gap:12px;">' +
        '<label style="font-size:0.85rem;color:#555;">Correo electrónico</label>' +
        '<input id="emailConfigInput" type="email" placeholder="kenny@bonaorigen.co" style="padding:10px;border:1px solid #ddd;border-radius:8px;font-size:1rem;">' +
        '<div style="display:flex;gap:8px;margin-top:12px;">' +
          '<button id="emailConfigSaveBtn" style="flex:1;padding:12px;border:none;border-radius:8px;background:#2ecc71;color:#fff;cursor:pointer;font-size:1rem;">Guardar</button>' +
          '<button id="emailConfigCancelBtn" style="flex:1;padding:12px;border:1px solid #ddd;border-radius:8px;background:#fff;cursor:pointer;font-size:1rem;">Cancelar</button>' +
        '</div>' +
      '</div>' +
      '<div id="emailConfigResult" style="margin-top:12px;font-size:0.85rem;"></div>');

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    document.getElementById('emailConfigCancelBtn').onclick = function () { overlay.remove(); };

    document.getElementById('emailConfigSaveBtn').onclick = async function () {
      var email = document.getElementById('emailConfigInput').value.trim();
      var resultEl = document.getElementById('emailConfigResult');
      if (!email || !email.includes('@')) {
        resultEl.textContent = '⚠️ Ingresa un correo válido.';
        resultEl.style.color = '#e74c3c';
        return;
      }

      var res = await setEmail(username, email);
      if (res.ok) {
        // Generar código de verificación
        var codeRes = await generarCodigo(email, 'verify');
        if (codeRes.ok) {
          // Enviar código por email (via Edge Function + Resend)
          var emailSent = false;
          if (typeof CrozzoEmailTemplates !== 'undefined' && CrozzoEmailTemplates.enviarEmail) {
            var html = CrozzoEmailTemplates.templateVerificacion(email, codeRes.code);
            var sendRes = await CrozzoEmailTemplates.enviarEmail(email, 'Verifica tu correo — BONA origen', html);
            emailSent = sendRes.ok;
          }

          resultEl.innerHTML = CrozzoSanitize.sanitizeHtml('<div style="background:#d4edda;border:1px solid #28a745;border-radius:8px;padding:12px;">' +
            '<strong>✅ Correo guardado:</strong> ' + email + '<br>' +
            (emailSent
              ? '<span style="font-size:0.85rem;color:#155724;">📧 Código enviado a tu correo electrónico.</span>'
              : '<span style="font-size:0.85rem;color:#856404;">⚠️ No se pudo enviar por email. Código: <strong>' + codeRes.code + '</strong></span>') +
            '</div>');
          // Mostrar campo para ingresar código
          resultEl.innerHTML += '<div style="margin-top:12px;">' +
            '<input id="emailVerifyCode" type="text" maxlength="6" placeholder="000000" style="width:100%;padding:10px;font-size:1.2rem;text-align:center;letter-spacing:4px;border:1px solid #ddd;border-radius:8px;">' +
            '<button id="emailVerifyBtn" style="width:100%;margin-top:8px;padding:10px;border:none;border-radius:8px;background:#3498db;color:#fff;cursor:pointer;">Verificar correo</button>' +
          '</div>';

          document.getElementById('emailVerifyBtn').onclick = async function () {
            var code = document.getElementById('emailVerifyCode').value.trim();
            var verifyRes = await verificarCodigo(email, code, 'verify');
            if (verifyRes.ok) {
               if (typeof CrozzoEmailTemplates !== 'undefined') {
                 var html = CrozzoEmailTemplates.templateBienvenida(email, 'Kenny');
                 CrozzoEmailTemplates.enviarEmail(email, 'Bienvenido a BONA origen', html);
               }
              resultEl.innerHTML = CrozzoSanitize.sanitizeHtml('<div style="background:#d4edda;border:1px solid #28a745;border-radius:8px;padding:12px;">' +
                '<strong>✅ Correo verificado:</strong> ' + email + '</div>');
              if (typeof onSaved === 'function') onSaved(email);
            } else {
              resultEl.innerHTML += '<p style="color:#e74c3c;margin-top:8px;">' + (verifyRes.mensaje || 'Código incorrecto') + '</p>';
            }
          };
        } else {
          resultEl.textContent = '❌ Error al generar código de verificación.';
          resultEl.style.color = '#e74c3c';
        }
      } else {
        resultEl.textContent = '❌ Error al guardar correo: ' + (res.error || 'desconocido');
        resultEl.style.color = '#e74c3c';
      }
    };
  }

  // ── Modal de recuperación de PIN ────────────────────────────────
  function mostrarModalRecuperacionPin(onRecovered) {
    var overlay = document.createElement('div');
    overlay.id = 'pinRecoveryOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;';

    var card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:16px;padding:32px;max-width:420px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.4);';

    card.innerHTML = CrozzoSanitize.sanitizeHtml('<h2 style="margin:0 0 8px;font-size:1.3rem;color:#1a1a2e;">🔑 Recuperar PIN</h2>' +
      '<p style="margin:0 0 20px;color:#666;font-size:0.9rem;">Ingresa tu correo de recuperación para recibir un código.</p>' +
      '<div style="display:flex;flex-direction:column;gap:12px;">' +
        '<label style="font-size:0.85rem;color:#555;">Correo de recuperación</label>' +
        '<input id="recoveryEmail" type="email" placeholder="kenny@bonaorigen.co" style="padding:10px;border:1px solid #ddd;border-radius:8px;font-size:1rem;">' +
        '<button id="recoverySendBtn" style="padding:12px;border:none;border-radius:8px;background:#3498db;color:#fff;cursor:pointer;font-size:1rem;">Enviar código</button>' +
      '</div>' +
      '<div id="recoveryResult" style="margin-top:12px;font-size:0.85rem;"></div>');

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    document.getElementById('recoverySendBtn').onclick = async function () {
      var email = document.getElementById('recoveryEmail').value.trim();
      var resultEl = document.getElementById('recoveryResult');
      if (!email || !email.includes('@')) {
        resultEl.textContent = '⚠️ Ingresa un correo válido.';
        resultEl.style.color = '#e74c3c';
        return;
      }

      var codeRes = await generarCodigo(email, 'recovery');
      if (codeRes.ok) {
        // Enviar código por email (via Edge Function + Resend)
        var emailSent = false;
        if (typeof CrozzoEmailTemplates !== 'undefined' && CrozzoEmailTemplates.enviarEmail) {
          var html = CrozzoEmailTemplates.templateRecuperacion(email, codeRes.code);
          var sendRes = await CrozzoEmailTemplates.enviarEmail(email, 'Recuperación de PIN — BONA origen', html);
          emailSent = sendRes.ok;
        }

        resultEl.innerHTML = CrozzoSanitize.sanitizeHtml('<div style="background:#d4edda;border:1px solid #28a745;border-radius:8px;padding:12px;">' +
          '<strong>✅ Código enviado:</strong><br>' +
          (emailSent
            ? '<span style="font-size:0.85rem;color:#155724;">📧 Código de recuperación enviado a tu correo.</span>'
            : '<span style="font-size:0.85rem;color:#856404;">⚠️ No se pudo enviar por email. Código: <strong>' + codeRes.code + '</strong></span>') +
          '</div>' +
          '<div style="margin-top:12px;">' +
            '<label style="font-size:0.85rem;color:#555;">Código de recuperación</label>' +
            '<input id="recoveryCode" type="text" maxlength="6" placeholder="000000" style="width:100%;padding:10px;font-size:1.2rem;text-align:center;letter-spacing:4px;border:1px solid #ddd;border-radius:8px;margin-bottom:8px;">' +
            '<label style="font-size:0.85rem;color:#555;">Nuevo PIN</label>' +
            '<input id="recoveryNewPin" type="password" placeholder="Nuevo PIN (mín. 6 caracteres)" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;margin-bottom:8px;">' +
            '<button id="recoverySubmitBtn" style="width:100%;padding:12px;border:none;border-radius:8px;background:#2ecc71;color:#fff;cursor:pointer;font-size:1rem;">Cambiar PIN</button>' +
          '</div>');

        document.getElementById('recoverySubmitBtn').onclick = async function () {
          var code = document.getElementById('recoveryCode').value.trim();
          var newPin = document.getElementById('recoveryNewPin').value.trim();
          if (!code || !newPin || newPin.length < 6) {
            resultEl.innerHTML += '<p style="color:#e74c3c;margin-top:8px;">Ingresa el código y un PIN de al menos 6 caracteres.</p>';
            return;
          }

          var recoverRes = await recuperarPin(email, code, newPin);
          if (recoverRes.ok) {
            // Enviar alerta de cambio de PIN por email
            if (typeof CrozzoEmailTemplates !== 'undefined') {
              var html = CrozzoEmailTemplates.templateAlertaCambioPin(email, new Date().toLocaleString('es-CO'));
              CrozzoEmailTemplates.enviarEmail(email, '🔑 PIN actualizado — BONA origen', html);
            }
            resultEl.innerHTML = CrozzoSanitize.sanitizeHtml('<div style="background:#d4edda;border:1px solid #28a745;border-radius:8px;padding:12px;">' +
              '<strong>✅ PIN actualizado:</strong> ' + (recoverRes.mensaje || 'Puedes iniciar sesión con tu nuevo PIN.') + '</div>');
            setTimeout(function () { overlay.remove(); if (typeof onRecovered === 'function') onRecovered(); }, 3000);
          } else {
            resultEl.innerHTML += '<p style="color:#e74c3c;margin-top:8px;">' + (recoverRes.mensaje || 'Error al recuperar PIN.') + '</p>';
          }
        };
      } else {
        resultEl.textContent = '❌ Error al enviar código: ' + (codeRes.error || 'desconocido');
        resultEl.style.color = '#e74c3c';
      }
    };
  }

  // ── API pública ─────────────────────────────────────────────────
  global.CrozzoEmailRecovery = {
    setEmail: setEmail,
    generarCodigo: generarCodigo,
    verificarCodigo: verificarCodigo,
    recuperarPin: recuperarPin,
    mostrarModalConfigCorreo: mostrarModalConfigCorreo,
    mostrarModalRecuperacionPin: mostrarModalRecuperacionPin,
  };

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));