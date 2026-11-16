/**
 * CrozzoMfaKenny — Multi-factor authentication para KENNY (Super Admin).
 *
 * Factores:
 * 1. PIN 141414 (ya implementado via Supabase)
 * 2. TOTP (Google Authenticator compatible) — código de 6 dígitos, 30s de validez
 * 3. Verificación de dispositivo (fingerprint del navegador)
 *
 * Seguridad:
 * - El secreto TOTP se almacena en Supabase (no en el cliente)
 * - El fingerprint se verifica contra el registrado en Supabase
 * - Si el dispositivo no está registrado, se requiere aprobación de KENNY
 * - Los códigos TOTP se verifican server-side (Supabase Edge Function)
 */
(function (global) {
  'use strict';
  console.log('[CrozzoMfaKenny] Script starting...');

  var SUPABASE_CENTRAL_URL = 'https://hogeggkkodkpzossjfft.supabase.co';
  var SUPABASE_CENTRAL_ANON_KEY = 'sb_publishable_rNiFFu5h4YR-Ab5n8wxJSA_G58xhE64';

  var _mfaVerified = false;
  var _mfaToken = null;
  var _mfaTokenExpiry = 0;
  var _deviceFingerprint = null;

  // ── Generar fingerprint del dispositivo ──────────────────────────
  function generarFingerprint() {
    if (_deviceFingerprint) return _deviceFingerprint;

    var components = [];
    try {
      components.push(navigator.userAgent || '');
      components.push(navigator.language || '');
      components.push(navigator.platform || '');
      components.push(screen.width + 'x' + screen.height);
      components.push(screen.colorDepth || '');
      components.push(new Date().getTimezoneOffset());
      components.push(navigator.hardwareConcurrency || '');
      components.push(navigator.deviceMemory || '');
    } catch (_) {}

    // Hash simple (no criptográfico, suficiente para fingerprint)
    var str = components.join('|');
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      var char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    _deviceFingerprint = 'fp_' + Math.abs(hash).toString(36);
    return _deviceFingerprint;
  }

  // ── Verificar si Supabase está disponible ───────────────────────
  function isAvailable() {
    return typeof fetch === 'function';
  }

  // ── Iniciar flujo MFA (después del login inicial) ───────────────
  async function iniciarMfa(username) {
    if (!isAvailable()) return { ok: false, error: 'no_network' };

    try {
      var res = await fetch(SUPABASE_CENTRAL_URL + '/rest/v1/rpc/iniciar_mfa_kenny', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_CENTRAL_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_CENTRAL_ANON_KEY,
        },
        body: JSON.stringify({
          p_username: username.toUpperCase(),
          p_fingerprint: generarFingerprint(),
        }),
      });

      if (!res.ok) return { ok: false, error: 'mfa_init_failed' };

      var data = await res.json();
      if (data && data.requiere_totp) {
        return { ok: true, requiereTotp: true, mensaje: 'Ingresa el código de Google Authenticator' };
      }
      if (data && data.requiere_dispositivo) {
        return { ok: true, requiereDispositivo: true, mensaje: 'Dispositivo no reconocido. Se requiere aprobación.' };
      }
      if (data && data.ok) {
        _mfaVerified = true;
        _mfaToken = data.token;
        _mfaTokenExpiry = Date.now() + 60 * 60 * 1000;
        return { ok: true, verificado: true };
      }
      return { ok: false, error: data?.error || 'mfa_failed' };
    } catch (e) {
      return { ok: false, error: 'network_error', detail: e.message };
    }
  }

  // ── Verificar código TOTP ────────────────────────────────────────
  async function verificarTotp(username, codigo) {
    if (!isAvailable()) return { ok: false, error: 'no_network' };

    // Validar formato (6 dígitos)
    if (!/^\d{6}$/.test(String(codigo))) {
      return { ok: false, error: 'invalid_format', mensaje: 'El código debe ser de 6 dígitos' };
    }

    try {
      var res = await fetch(SUPABASE_CENTRAL_URL + '/rest/v1/rpc/verificar_totp_kenny', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_CENTRAL_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_CENTRAL_ANON_KEY,
        },
        body: JSON.stringify({
          p_username: username.toUpperCase(),
          p_codigo: codigo,
          p_fingerprint: generarFingerprint(),
        }),
      });

      if (!res.ok) return { ok: false, error: 'totp_verify_failed' };

      var data = await res.json();
      if (data && data.ok) {
        _mfaVerified = true;
        _mfaToken = data.token;
        _mfaTokenExpiry = Date.now() + 60 * 60 * 1000;
        return { ok: true, verificado: true, mensaje: 'MFA verificado correctamente' };
      }
      return { ok: false, error: data?.error || 'invalid_totp', mensaje: data?.mensaje || 'Código incorrecto' };
    } catch (e) {
      return { ok: false, error: 'network_error', detail: e.message };
    }
  }

  // ── Verificar si MFA está completo ───────────────────────────────
  function isMfaVerified() {
    return _mfaVerified && _mfaToken !== null && Date.now() < _mfaTokenExpiry;
  }

  // ── Obtener token MFA ────────────────────────────────────────────
  function getMfaToken() {
    return isMfaVerified() ? _mfaToken : null;
  }

  // ── Cerrar sesión MFA ────────────────────────────────────────────
  function logoutMfa() {
    _mfaVerified = false;
    _mfaToken = null;
    _mfaTokenExpiry = 0;
  }

  // ── Obtener fingerprint del dispositivo ─────────────────────────
  function getFingerprint() {
    return generarFingerprint();
  }

  // ── Mostrar modal de MFA ────────────────────────────────────────
  function mostrarModalMfa(onSuccess, onCancel) {
    var overlay = document.createElement('div');
    overlay.id = 'mfaModalOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;';

    var card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:16px;padding:32px;max-width:400px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.4);text-align:center;';

    card.innerHTML =
      '<h2 style="margin:0 0 8px;font-size:1.3rem;color:#1a1a2e;">🔐 Verificación MFA</h2>' +
      '<p style="margin:0 0 20px;color:#666;font-size:0.9rem;">Ingresa el código de 6 dígitos de Google Authenticator</p>' +
      '<input id="mfaCodeInput" type="text" maxlength="6" placeholder="000000" style="width:100%;padding:12px;font-size:1.5rem;text-align:center;letter-spacing:8px;border:2px solid #ddd;border-radius:8px;margin-bottom:16px;" autocomplete="off">' +
      '<div style="display:flex;gap:8px;">' +
        '<button id="mfaSubmitBtn" style="flex:1;padding:12px;border:none;border-radius:8px;background:#2ecc71;color:#fff;cursor:pointer;font-size:1rem;">Verificar</button>' +
        '<button id="mfaCancelBtn" style="flex:1;padding:12px;border:1px solid #ddd;border-radius:8px;background:#fff;cursor:pointer;font-size:1rem;">Cancelar</button>' +
      '</div>' +
      '<div id="mfaError" style="margin-top:12px;color:#e74c3c;font-size:0.85rem;"></div>' +
      '<p style="margin-top:16px;font-size:0.75rem;color:#999;">Dispositivo: ' + generarFingerprint() + '</p>';

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    var input = document.getElementById('mfaCodeInput');
    input.focus();

    // Auto-submit cuando se ingresan 6 dígitos
    input.oninput = function () {
      if (input.value.length === 6) {
        document.getElementById('mfaSubmitBtn').click();
      }
    };

    document.getElementById('mfaSubmitBtn').onclick = async function () {
      var codigo = input.value.trim();
      var errorEl = document.getElementById('mfaError');
      errorEl.textContent = '';

      if (!/^\d{6}$/.test(codigo)) {
        errorEl.textContent = 'Ingresa 6 dígitos';
        return;
      }

      var res = await verificarTotp('KENNY', codigo);
      if (res.ok) {
        overlay.remove();
        if (typeof onSuccess === 'function') onSuccess(res);
      } else {
        errorEl.textContent = res.mensaje || 'Código incorrecto';
        input.value = '';
        input.focus();
      }
    };

    document.getElementById('mfaCancelBtn').onclick = function () {
      overlay.remove();
      if (typeof onCancel === 'function') onCancel();
    };

    // Enter para submit
    input.onkeydown = function (e) {
      if (e.key === 'Enter') document.getElementById('mfaSubmitBtn').click();
      if (e.key === 'Escape') document.getElementById('mfaCancelBtn').click();
    };
  }

  // ── Registrar dispositivo nuevo ──────────────────────────────────
  async function registrarDispositivo(username, nombre, ubicacion) {
    if (!isAvailable()) return { ok: false, error: 'no_network' };

    var fp = generarFingerprint();
    try {
      var res = await fetch(SUPABASE_CENTRAL_URL + '/rest/v1/rpc/registrar_dispositivo_kenny', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_CENTRAL_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_CENTRAL_ANON_KEY,
        },
        body: JSON.stringify({
          p_username: username.toUpperCase(),
          p_fingerprint: fp,
          p_nombre: nombre || null,
          p_ubicacion: ubicacion || null,
        }),
      });

      if (!res.ok) return { ok: false, error: 'register_failed' };

      var data = await res.json();
      if (data && data.ok) {
        if (data.aprobado) {
          _mfaVerified = false; // Se necesita TOTP después
        }
        return data;
      }
      return { ok: false, error: data?.error || 'unknown' };
    } catch (e) {
      return { ok: false, error: 'network_error', detail: e.message };
    }
  }

  // ── Listar dispositivos registrados ──────────────────────────────
  async function listarDispositivos(username) {
    if (!isAvailable()) return { ok: false, error: 'no_network' };

    try {
      var res = await fetch(SUPABASE_CENTRAL_URL + '/rest/v1/rpc/listar_dispositivos_kenny', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_CENTRAL_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_CENTRAL_ANON_KEY,
        },
        body: JSON.stringify({ p_username: username.toUpperCase() }),
      });

      if (!res.ok) return { ok: false, error: 'list_failed' };

      var data = await res.json();
      return data || { ok: false, error: 'no_data' };
    } catch (e) {
      return { ok: false, error: 'network_error', detail: e.message };
    }
  }

  // ── Modal de registro de dispositivo ─────────────────────────────
  function mostrarModalRegistroDispositivo(username, onRegistered, onCancel) {
    var overlay = document.createElement('div');
    overlay.id = 'deviceRegistrationOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;';

    var card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:16px;padding:32px;max-width:420px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.4);';

    card.innerHTML =
      '<h2 style="margin:0 0 8px;font-size:1.3rem;color:#1a1a2e;">📱 Registrar dispositivo</h2>' +
      '<p style="margin:0 0 20px;color:#666;font-size:0.9rem;">Este dispositivo no está registrado. Ingresa un nombre para identificarlo.</p>' +
      '<div style="display:flex;flex-direction:column;gap:12px;">' +
        '<label style="font-size:0.85rem;color:#555;">Nombre del dispositivo</label>' +
        '<input id="devRegNombre" type="text" placeholder="Ej: Caja Principal, Laptop Kenny" style="padding:10px;border:1px solid #ddd;border-radius:8px;font-size:1rem;">' +
        '<label style="font-size:0.85rem;color:#555;">Ubicación</label>' +
        '<input id="devRegUbicacion" type="text" placeholder="Ej: Oficina, Tienda Centro" style="padding:10px;border:1px solid #ddd;border-radius:8px;font-size:1rem;">' +
        '<div style="display:flex;gap:8px;margin-top:12px;">' +
          '<button id="devRegBtn" style="flex:1;padding:12px;border:none;border-radius:8px;background:#2ecc71;color:#fff;cursor:pointer;font-size:1rem;">Registrar</button>' +
          '<button id="devRegCancelBtn" style="flex:1;padding:12px;border:1px solid #ddd;border-radius:8px;background:#fff;cursor:pointer;font-size:1rem;">Cancelar</button>' +
        '</div>' +
      '</div>' +
      '<div id="devRegError" style="margin-top:12px;color:#e74c3c;font-size:0.85rem;"></div>' +
      '<p style="margin-top:16px;font-size:0.75rem;color:#999;">Fingerprint: ' + generarFingerprint() + '</p>';

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    var nombreInput = document.getElementById('devRegNombre');
    nombreInput.focus();

    document.getElementById('devRegBtn').onclick = async function () {
      var nombre = nombreInput.value.trim();
      var ubicacion = document.getElementById('devRegUbicacion').value.trim();
      var errorEl = document.getElementById('devRegError');
      errorEl.textContent = '';

      if (!nombre) {
        errorEl.textContent = 'Ingresa un nombre para el dispositivo.';
        return;
      }

      var btn = document.getElementById('devRegBtn');
      btn.disabled = true;
      btn.textContent = 'Registrando...';

      var res = await registrarDispositivo(username, nombre, ubicacion);
      if (res.ok) {
        overlay.remove();
        if (res.aprobado) {
          if (typeof showToast === 'function') showToast('Dispositivo registrado y aprobado.', 'success');
        } else {
          if (typeof showToast === 'function') showToast('Dispositivo registrado. Se requiere aprobación desde otro dispositivo.', 'warning');
        }
        if (typeof onRegistered === 'function') onRegistered(res);
      } else {
        errorEl.textContent = res.error || 'Error al registrar dispositivo.';
        btn.disabled = false;
        btn.textContent = 'Registrar';
      }
    };

    document.getElementById('devRegCancelBtn').onclick = function () {
      overlay.remove();
      if (typeof onCancel === 'function') onCancel();
    };

    nombreInput.onkeydown = function (e) {
      if (e.key === 'Enter') document.getElementById('devRegBtn').click();
      if (e.key === 'Escape') document.getElementById('devRegCancelBtn').click();
    };
  }

  // ── API pública ─────────────────────────────────────────────────
  global.CrozzoMfaKenny = {
    isAvailable: isAvailable,
    iniciarMfa: iniciarMfa,
    verificarTotp: verificarTotp,
    isMfaVerified: isMfaVerified,
    getMfaToken: getMfaToken,
    logoutMfa: logoutMfa,
    getFingerprint: getFingerprint,
    mostrarModalMfa: mostrarModalMfa,
    registrarDispositivo: registrarDispositivo,
    listarDispositivos: listarDispositivos,
    mostrarModalRegistroDispositivo: mostrarModalRegistroDispositivo,
  };

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
console.log('[CrozzoMfaKenny] Module loaded, CrozzoMfaKenny defined:', typeof CrozzoMfaKenny);