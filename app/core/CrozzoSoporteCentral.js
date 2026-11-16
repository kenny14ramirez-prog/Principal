/**
 * CrozzoSoporteCentral — Sistema de cuentas de soporte técnico.
 *
 * Las cuentas de soporte se crean desde la sesión de KENNY (super admin).
 * Tienen permisos limitados: configurar sistema, diagnosticar errores, desplegar.
 * NO tienen acceso a datos de clientes (ventas, facturas, inventario).
 * Cada acción de soporte se registra en auditoría.
 *
 * Seguridad:
 * - Solo KENNY puede crear/revocar cuentas de soporte
 * - Las cuentas de soporte se almacenan en Supabase Central
 * - Cada cuenta tiene un token temporal (2 horas de expiración)
 * - Las acciones se registran en crozzo_audit
 */
(function (global) {
  'use strict';

  var SUPABASE_CENTRAL_URL = 'https://hogeggkkodkpzossjfft.supabase.co';
  var SUPABASE_CENTRAL_ANON_KEY = 'sb_publishable_rNiFFu5h4YR-Ab5n8wxJSA_G58xhE64';

  var _soporteToken = null;
  var _soporteTokenExpiry = 0;
  var _soporteUser = null;

  // ── Permisos de soporte ─────────────────────────────────────────
  // Lo que SÍ pueden hacer las cuentas de soporte:
  var SOPORTE_PERMISOS = {
    // Configuración del sistema
    config_empresa: true,
    config_impuestos: true,
    config_comandas: true,
    config_salon: true,
    config_conexiones: true,
    config_facturas_admin: true,
    config_dian: true,
    config_certificado: true,
    config_proveedor: true,
    config_usuarios: true,       // Pueden crear/editar usuarios (no super admin)
    config_seguridad: true,     // Pueden ver seguridad (no cambiar KENNY)
    // Diagnóstico
    diagnostics: true,
    connection_test: true,
    system_info: true,
    // Despliegue
    deploy_empresa: true,
    crear_negocio: true,
    sincronizar_config: true,
    // Integraciones
    siigo_config: true,
    alegra_config: true,
    supabase_config: true,
  };

  // Lo que NO pueden hacer:
  // - Ver datos de clientes (ventas, facturas, inventario)
  // - Acceder a datos financieros
  // - Modificar KENNY o cuentas de super admin
  // - Eliminar negocios
  // - Acceder a auditoría de otros negocios

  // ── Verificar si Supabase está disponible ───────────────────────
  function isAvailable() {
    return typeof fetch === 'function';
  }

  // ── Login de soporte ────────────────────────────────────────────
  async function loginSoporte(username, password) {
    if (!isAvailable()) return { ok: false, error: 'no_network' };

    try {
      var res = await fetch(SUPABASE_CENTRAL_URL + '/rest/v1/rpc/verify_soporte_password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_CENTRAL_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_CENTRAL_ANON_KEY,
        },
        body: JSON.stringify({ p_username: username, p_password: password }),
      });

      if (!res.ok) return { ok: false, error: 'auth_failed' };

      var data = await res.json();
      if (data === true) {
        _soporteToken = 'sp_' + Date.now() + '_' + Math.random().toString(36).slice(2);
        _soporteTokenExpiry = Date.now() + 2 * 60 * 60 * 1000; // 2 horas
        _soporteUser = username.toUpperCase();

        // Registrar login en auditoría
        try {
          await fetch(SUPABASE_CENTRAL_URL + '/rest/v1/crozzo_audit', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': SUPABASE_CENTRAL_ANON_KEY,
              'Authorization': 'Bearer ' + SUPABASE_CENTRAL_ANON_KEY,
            },
            body: JSON.stringify({
              accion: 'soporte_login',
              usuario: _soporteUser,
              detalle: 'Login de cuenta de soporte',
              fecha: new Date().toISOString(),
            }),
          });
        } catch (_) {}

        return { ok: true, token: _soporteToken, user: _soporteUser };
      }
      return { ok: false, error: 'invalid_credentials' };
    } catch (e) {
      return { ok: false, error: 'network_error', detail: e.message };
    }
  }

  // ── Verificar token ─────────────────────────────────────────────
  function isTokenValid() {
    return _soporteToken !== null && Date.now() < _soporteTokenExpiry;
  }

  function getToken() {
    return isTokenValid() ? _soporteToken : null;
  }

  function getUser() {
    return isTokenValid() ? _soporteUser : null;
  }

  // ── Logout ──────────────────────────────────────────────────────
  function logout() {
    _soporteToken = null;
    _soporteTokenExpiry = 0;
    _soporteUser = null;
  }

  // ── Verificar permiso de soporte ────────────────────────────────
  function hasPermiso(permiso) {
    if (!isTokenValid()) return false;
    return SOPORTE_PERMISOS[permiso] === true;
  }

  // ── Crear cuenta de soporte (solo KENNY) ───────────────────────
  async function crearCuentaSoporte(username, password, nombre, permisos) {
    if (!isAvailable()) return { ok: false, error: 'no_network' };

    // Verificar que KENNY está autenticado (token de super admin)
    if (typeof CrozzoSuperAdminCentral === 'undefined' || !CrozzoSuperAdminCentral.isTokenValid()) {
      return { ok: false, error: 'kenny_not_authenticated' };
    }

    try {
      var res = await fetch(SUPABASE_CENTRAL_URL + '/rest/v1/crozzo_soporte', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_CENTRAL_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_CENTRAL_ANON_KEY,
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({
          username: username.toUpperCase(),
          password_hash: password, // Se hashea en la DB via trigger
          nombre: nombre || username,
          permisos: permisos || SOPORTE_PERMISOS,
          activo: true,
          creado_por: 'KENNY',
          creado_en: new Date().toISOString(),
        }),
      });

      if (!res.ok) {
        var err = await res.text();
        return { ok: false, error: 'create_failed', detail: err };
      }

      var data = await res.json();
      if (data && data.length > 0) {
        // Registrar en auditoría
        try {
          await fetch(SUPABASE_CENTRAL_URL + '/rest/v1/crozzo_audit', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': SUPABASE_CENTRAL_ANON_KEY,
              'Authorization': 'Bearer ' + SUPABASE_CENTRAL_ANON_KEY,
            },
            body: JSON.stringify({
              accion: 'soporte_created',
              usuario: 'KENNY',
              detalle: 'Cuenta de soporte creada: ' + username,
              fecha: new Date().toISOString(),
            }),
          });
        } catch (_) {}

        return { ok: true, cuenta: data[0] };
      }
      return { ok: false, error: 'no_data' };
    } catch (e) {
      return { ok: false, error: 'network_error', detail: e.message };
    }
  }

  // ── Revocar cuenta de soporte (solo KENNY) ──────────────────────
  async function revocarCuentaSoporte(username) {
    if (!isAvailable()) return { ok: false, error: 'no_network' };

    if (typeof CrozzoSuperAdminCentral === 'undefined' || !CrozzoSuperAdminCentral.isTokenValid()) {
      return { ok: false, error: 'kenny_not_authenticated' };
    }

    try {
      var res = await fetch(SUPABASE_CENTRAL_URL + '/rest/v1/crozzo_soporte?username=eq.' + username.toUpperCase(), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_CENTRAL_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_CENTRAL_ANON_KEY,
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({ activo: false }),
      });

      if (!res.ok) return { ok: false, error: 'revoke_failed' };

      // Registrar en auditoría
      try {
        await fetch(SUPABASE_CENTRAL_URL + '/rest/v1/crozzo_audit', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_CENTRAL_ANON_KEY,
            'Authorization': 'Bearer ' + SUPABASE_CENTRAL_ANON_KEY,
          },
          body: JSON.stringify({
            accion: 'soporte_revoked',
            usuario: 'KENNY',
            detalle: 'Cuenta de soporte revocada: ' + username,
            fecha: new Date().toISOString(),
          }),
        });
      } catch (_) {}

      return { ok: true };
    } catch (e) {
      return { ok: false, error: 'network_error', detail: e.message };
    }
  }

  // ── Listar cuentas de soporte (solo KENNY) ──────────────────────
  async function listarCuentasSoporte() {
    if (!isAvailable()) return { ok: false, error: 'no_network' };

    if (typeof CrozzoSuperAdminCentral === 'undefined' || !CrozzoSuperAdminCentral.isTokenValid()) {
      return { ok: false, error: 'kenny_not_authenticated' };
    }

    try {
      var res = await fetch(SUPABASE_CENTRAL_URL + '/rest/v1/crozzo_soporte?select=username,nombre,activo,creado_en,creado_por,permisos', {
        headers: {
          'apikey': SUPABASE_CENTRAL_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_CENTRAL_ANON_KEY,
        },
      });

      if (!res.ok) return { ok: false, error: 'list_failed' };

      var data = await res.json();
      return { ok: true, cuentas: data || [] };
    } catch (e) {
      return { ok: false, error: 'network_error', detail: e.message };
    }
  }

  // ── Registrar acción de soporte en auditoría ────────────────────
  async function registrarAccionSoporte(accion, detalle) {
    if (!isTokenValid()) return;

    try {
      await fetch(SUPABASE_CENTRAL_URL + '/rest/v1/crozzo_audit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_CENTRAL_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_CENTRAL_ANON_KEY,
        },
        body: JSON.stringify({
          accion: accion,
          usuario: _soporteUser,
          detalle: detalle || '',
          fecha: new Date().toISOString(),
          tipo: 'soporte',
        }),
      });
    } catch (_) {}
  }

  // ── API pública ─────────────────────────────────────────────────
  global.CrozzoSoporteCentral = {
    isAvailable: isAvailable,
    loginSoporte: loginSoporte,
    isTokenValid: isTokenValid,
    getToken: getToken,
    getUser: getUser,
    logout: logout,
    hasPermiso: hasPermiso,
    crearCuentaSoporte: crearCuentaSoporte,
    revocarCuentaSoporte: revocarCuentaSoporte,
    listarCuentasSoporte: listarCuentasSoporte,
    registrarAccionSoporte: registrarAccionSoporte,
    SOPORTE_PERMISOS: SOPORTE_PERMISOS,
  };

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));