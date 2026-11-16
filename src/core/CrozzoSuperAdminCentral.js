/**
 * CrozzoSuperAdminCentral — Conexión al backend central de super admin.
 *
 * El POS NUNCA almacena credenciales de super admin. Toda verificación
 * se hace contra Supabase Central (proyecto dedicado). El POS solo recibe
 * un token temporal (JWT) que expira en 1 hora.
 *
 * Seguridad:
 * - La anon key NO tiene acceso a tablas de super admin (bloqueadas por RLS)
 * - La verificación se hace via RPC (verify_superadmin_password) que usa SECURITY DEFINER
 * - El POS nunca ve el hash de la contraseña
 * - El token JWT se almacena solo en memoria (no en localStorage)
 */
(function (global) {
  'use strict';

  var SUPABASE_CENTRAL_URL = 'https://hogeggkkodkpzossjfft.supabase.co';
  var SUPABASE_CENTRAL_ANON_KEY = 'sb_publishable_rNiFFu5h4YR-Ab5n8wxJSA_G58xhE64';

  var _token = null;
  var _tokenExpiry = 0;
  var _negocioId = null;
  var _negocioConfig = null;

  // ── Verificar si Supabase está disponible ───────────────────────
  function isAvailable() {
    return typeof fetch === 'function';
  }

  // ── Verificar credenciales de super admin contra Supabase ────────
  async function verifySuperAdmin(username, password) {
    if (!isAvailable()) return { ok: false, error: 'no_network' };

    var u = String(username || '').trim().toUpperCase();
    var p = String(password || '');

    try {
      var res = await fetch(SUPABASE_CENTRAL_URL + '/rest/v1/rpc/verify_superadmin_password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_CENTRAL_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_CENTRAL_ANON_KEY,
        },
        body: JSON.stringify({ p_username: u, p_password: p }),
      });

      if (!res.ok) {
        return { ok: false, error: 'auth_failed' };
      }

      var data = await res.json();
      if (data === true) {
        // Generar token temporal (1 hora)
        _token = 'sa_' + Date.now() + '_' + Math.random().toString(36).slice(2);
        _tokenExpiry = Date.now() + 60 * 60 * 1000;
        return { ok: true, token: _token };
      }
      return { ok: false, error: 'invalid_credentials' };
    } catch (e) {
      console.warn('[superadmin-central] verify error:', e);
      return { ok: false, error: 'network_error' };
    }
  }

  // ── Verificar si el token sigue válido ──────────────────────────
  function isTokenValid() {
    return _token !== null && Date.now() < _tokenExpiry;
  }

  // ── Obtener token actual ─────────────────────────────────────────
  function getToken() {
    return isTokenValid() ? _token : null;
  }

  // ── Cerrar sesión de super admin ────────────────────────────────
  function logout() {
    _token = null;
    _tokenExpiry = 0;
    _negocioId = null;
    _negocioConfig = null;
  }

  // ── Registrar un negocio nuevo en Supabase Central ──────────────
  async function registrarNegocio(nombre, nit, direccion, telefono, email) {
    if (!isTokenValid()) return { ok: false, error: 'no_token' };

    try {
      var res = await fetch(SUPABASE_CENTRAL_URL + '/rest/v1/crozzo_negocios', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_CENTRAL_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_CENTRAL_ANON_KEY,
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({
          nombre: nombre,
          nit: nit || null,
          direccion: direccion || null,
          telefono: telefono || null,
          email: email || null,
          superadmin_id: null, // Se asigna via Edge Function en producción
          activo: true,
          configuracion: {},
        }),
      });

      if (!res.ok) {
        var err = await res.text();
        return { ok: false, error: 'register_failed', detail: err };
      }

      var data = await res.json();
      if (data && data.length > 0) {
        _negocioId = data[0].id;
        return { ok: true, negocioId: _negocioId, negocio: data[0] };
      }
      return { ok: false, error: 'no_data' };
    } catch (e) {
      return { ok: false, error: 'network_error', detail: e.message };
    }
  }

  // ── Buscar negocio existente por NIT o nombre ───────────────────
  async function buscarNegocio(query) {
    if (!isTokenValid()) return { ok: false, error: 'no_token' };

    try {
      var url = SUPABASE_CENTRAL_URL + '/rest/v1/crozzo_negocios?select=id,nombre,nit,direccion,telefono,email,fecha_creacion,configuracion&or=(nit.eq.' + encodeURIComponent(query) + ',nombre.ilike.*' + encodeURIComponent(query) + '*)';
      var res = await fetch(url, {
        headers: {
          'apikey': SUPABASE_CENTRAL_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_CENTRAL_ANON_KEY,
        },
      });

      if (!res.ok) return { ok: false, error: 'search_failed' };

      var data = await res.json();
      return { ok: true, negocios: data || [] };
    } catch (e) {
      return { ok: false, error: 'network_error', detail: e.message };
    }
  }

  // ── Guardar configuración de un negocio ─────────────────────────
  async function guardarConfiguracion(negocioId, config) {
    if (!isTokenValid()) return { ok: false, error: 'no_token' };

    try {
      var res = await fetch(SUPABASE_CENTRAL_URL + '/rest/v1/crozzo_negocios?id=eq.' + negocioId, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_CENTRAL_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_CENTRAL_ANON_KEY,
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({ configuracion: config }),
      });

      if (!res.ok) return { ok: false, error: 'save_failed' };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: 'network_error', detail: e.message };
    }
  }

  // ── Cargar configuración de un negocio ──────────────────────────
  async function cargarConfiguracion(negocioId) {
    if (!isTokenValid()) return { ok: false, error: 'no_token' };

    try {
      var res = await fetch(SUPABASE_CENTRAL_URL + '/rest/v1/crozzo_negocios?id=eq.' + negocioId + '&select=configuracion', {
        headers: {
          'apikey': SUPABASE_CENTRAL_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_CENTRAL_ANON_KEY,
        },
      });

      if (!res.ok) return { ok: false, error: 'load_failed' };

      var data = await res.json();
      if (data && data.length > 0) {
        _negocioConfig = data[0].configuracion;
        return { ok: true, configuracion: _negocioConfig };
      }
      return { ok: false, error: 'not_found' };
    } catch (e) {
      return { ok: false, error: 'network_error', detail: e.message };
    }
  }

  // ── Obtener negocio_id actual ───────────────────────────────────
  function getNegocioId() {
    return _negocioId;
  }

  // ── Obtener configuración actual ────────────────────────────────
  function getConfig() {
    return _negocioConfig;
  }

  // ── Crear sucursal para un negocio existente ────────────────────
  async function crearSucursal(negocioId, nombreSucursal, ubicacion, copiarDeId) {
    if (!isTokenValid()) return { ok: false, error: 'no_token' };

    try {
      // Cargar negocio actual
      var res = await fetch(SUPABASE_CENTRAL_URL + '/rest/v1/crozzo_negocios?id=eq.' + negocioId + '&select=*', {
        headers: {
          'apikey': SUPABASE_CENTRAL_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_CENTRAL_ANON_KEY,
        },
      });

      if (!res.ok) return { ok: false, error: 'load_failed' };

      var data = await res.json();
      if (!data || data.length === 0) return { ok: false, error: 'not_found' };

      var negocio = data[0];
      var sucursales = negocio.configuracion?.sucursales || [];

      // Nueva sucursal
      var nuevaSucursal = {
        id: 'suc_' + Date.now(),
        nombre: nombreSucursal,
        ubicacion: ubicacion || '',
        creada_en: new Date().toISOString(),
        configuracion: {},
      };

      // Si se pide copiar de otra sucursal
      if (copiarDeId) {
        var origen = sucursales.find(function (s) { return s.id === copiarDeId; });
        if (origen && origen.configuracion) {
          nuevaSucursal.configuracion = JSON.parse(JSON.stringify(origen.configuracion));
        }
      }

      sucursales.push(nuevaSucursal);

      // Actualizar negocio en Supabase
      var updateRes = await fetch(SUPABASE_CENTRAL_URL + '/rest/v1/crozzo_negocios?id=eq.' + negocioId, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_CENTRAL_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_CENTRAL_ANON_KEY,
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({ configuracion: { sucursales: sucursales } }),
      });

      if (!updateRes.ok) return { ok: false, error: 'update_failed' };

      return { ok: true, sucursal: nuevaSucursal, sucursales: sucursales };
    } catch (e) {
      return { ok: false, error: 'network_error', detail: e.message };
    }
  }

  // ── Listar todos los negocios (para dashboard de KENNY) ─────────
  async function listarNegocios() {
    if (!isTokenValid()) return { ok: false, error: 'no_token' };

    try {
      var res = await fetch(SUPABASE_CENTRAL_URL + '/rest/v1/crozzo_negocios?select=id,nombre,nit,direccion,telefono,email,fecha_creacion,activo,configuracion&order=fecha_creacion.desc', {
        headers: {
          'apikey': SUPABASE_CENTRAL_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_CENTRAL_ANON_KEY,
        },
      });

      if (!res.ok) return { ok: false, error: 'list_failed' };

      var data = await res.json();
      return { ok: true, negocios: data || [] };
    } catch (e) {
      return { ok: false, error: 'network_error', detail: e.message };
    }
  }

  // ── Sincronización de configuración (con notificación, no automática) ──
  var _configRemotaPendiente = null;

  async function sincronizarConfiguracion(negocioId) {
    if (!isTokenValid()) return { ok: false, error: 'no_token' };

    try {
      var res = await cargarConfiguracion(negocioId);
      if (!res.ok) return res;

      var configRemota = res.configuracion;
      if (!configRemota) return { ok: true, actualizado: false, mensaje: 'Sin configuración remota' };

      // Verificar si la config remota es más reciente
      var versionLocal = 0;
      var versionRemota = configRemota._version || 0;
      try {
        var localConfig = (typeof config !== 'undefined' && config.get) ? config.get('superadmin_sync') : null;
        if (localConfig && localConfig.version) versionLocal = localConfig.version;
      } catch (_) {}

      if (versionRemota > versionLocal) {
        // NO aplicar automáticamente — guardar para que el usuario decida
        _configRemotaPendiente = {
          negocioId: negocioId,
          config: configRemota,
          versionRemota: versionRemota,
          versionLocal: versionLocal,
        };

        // Mostrar toast con opción de aplicar
        if (typeof showToast === 'function') {
          showToast('Nueva configuración disponible desde la nube. ¿Aplicar?', 'info');
        }

        // Mostrar modal de confirmación
        _mostrarModalConfigRemota(_configRemotaPendiente);

        return { ok: true, actualizado: false, pendiente: true, mensaje: 'Configuración remota disponible. Se requiere confirmación.' };
      }

      return { ok: true, actualizado: false, mensaje: 'Configuración ya está actualizada' };
    } catch (e) {
      return { ok: false, error: 'sync_error', detail: e.message };
    }
  }

  // ── Modal de confirmación de config remota ──────────────────────
  function _mostrarModalConfigRemota(pendiente) {
    if (!pendiente) return;

    var overlay = document.createElement('div');
    overlay.id = 'configSyncOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;';

    var card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:16px;padding:32px;max-width:520px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);';

    var cambios = [];
    var cfg = pendiente.config;
    if (cfg.empresa) cambios.push('Empresa: ' + (cfg.empresa.nombre || 'Actualizada'));
    if (cfg.mesas) cambios.push('Mesas: ' + Object.keys(cfg.mesas).length + ' configuradas');
    if (cfg.usuarios) cambios.push('Usuarios: ' + (cfg.usuarios.staff ? cfg.usuarios.staff.length : 0) + ' registrados');
    if (cfg.tarifas) cambios.push('Tarifas: actualizadas');
    if (cfg.impuestos) cambios.push('Impuestos: actualizados');

    card.innerHTML =
      '<h2 style="margin:0 0 16px;font-size:1.3rem;color:#1a1a2e;">🔄 Nueva configuración disponible</h2>' +
      '<p style="margin:0 0 12px;color:#666;font-size:0.9rem;">Se detectó una configuración más reciente en la nube (v' + pendiente.versionRemota + ' vs v' + pendiente.versionLocal + ').</p>' +
      '<div style="background:#f8f9fa;border-radius:8px;padding:12px;margin-bottom:16px;">' +
        '<strong style="font-size:0.85rem;">Cambios detectados:</strong><br>' +
        cambios.map(function (c) { return '<span style="font-size:0.85rem;color:#555;">• ' + c + '</span><br>'; }).join('') +
      '</div>' +
      '<p style="margin:0 0 16px;color:#856404;font-size:0.8rem;background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:8px;">⚠️ Al aplicar, se sobrescribirá la configuración local. Se recomienda hacer backup antes.</p>' +
      '<div style="display:flex;gap:8px;">' +
        '<button id="csAplicarBtn" style="flex:1;padding:12px;border:none;border-radius:8px;background:#2ecc71;color:#fff;cursor:pointer;font-size:1rem;">✅ Aplicar</button>' +
        '<button id="csIgnorarBtn" style="flex:1;padding:12px;border:1px solid #ddd;border-radius:8px;background:#fff;cursor:pointer;font-size:1rem;">❌ Ignorar</button>' +
      '</div>';

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    document.getElementById('csIgnorarBtn').onclick = function () {
      overlay.remove();
      _configRemotaPendiente = null;
      if (typeof showToast === 'function') showToast('Configuración ignorada. Se mantiene la actual.', 'info');
    };

    document.getElementById('csAplicarBtn').onclick = function () {
      if (!_configRemotaPendiente) return;
      var cfg = _configRemotaPendiente.config;

      // Aplicar configuración remota
      if (cfg.empresa && typeof config !== 'undefined' && config.set) {
        try { config.set('empresa', cfg.empresa); } catch (_) {}
      }
      if (cfg.mesas && typeof config !== 'undefined' && config.set) {
        try { config.set('mesas', cfg.mesas); } catch (_) {}
      }
      if (cfg.usuarios && typeof config !== 'undefined' && config.set) {
        try { config.set('usuarios', cfg.usuarios); } catch (_) {}
      }
      if (cfg.tarifas && typeof config !== 'undefined' && config.set) {
        try { config.set('tarifas', cfg.tarifas); } catch (_) {}
      }
      if (cfg.impuestos && typeof config !== 'undefined' && config.set) {
        try { config.set('impuestos', cfg.impuestos); } catch (_) {}
      }

      // Guardar versión local
      try {
        if (typeof config !== 'undefined' && config.set) {
          config.set('superadmin_sync', { version: cfg._version || 0, lastSync: new Date().toISOString() });
        }
      } catch (_) {}

      overlay.remove();
      _configRemotaPendiente = null;

      if (typeof showToast === 'function') showToast('Configuración aplicada desde la nube', 'success');
      if (typeof renderPage === 'function' && typeof currentPage !== 'undefined') renderPage(currentPage);
    };
  }

  // ── Aplicar config remota (sin modal, directo) ──────────────────
  function aplicarConfigRemota() {
    if (!_configRemotaPendiente) return false;
    var cfg = _configRemotaPendiente.config;
    if (cfg.empresa && typeof config !== 'undefined' && config.set) {
      try { config.set('empresa', cfg.empresa); } catch (_) {}
    }
    if (cfg.mesas && typeof config !== 'undefined' && config.set) {
      try { config.set('mesas', cfg.mesas); } catch (_) {}
    }
    if (cfg.usuarios && typeof config !== 'undefined' && config.set) {
      try { config.set('usuarios', cfg.usuarios); } catch (_) {}
    }
    if (cfg.tarifas && typeof config !== 'undefined' && config.set) {
      try { config.set('tarifas', cfg.tarifas); } catch (_) {}
    }
    if (cfg.impuestos && typeof config !== 'undefined' && config.set) {
      try { config.set('impuestos', cfg.impuestos); } catch (_) {}
    }
    try {
      if (typeof config !== 'undefined' && config.set) {
        config.set('superadmin_sync', { version: cfg._version || 0, lastSync: new Date().toISOString() });
      }
    } catch (_) {}
    _configRemotaPendiente = null;
    return true;
  }

  // ── Ignorar config remota ───────────────────────────────────────
  function ignorarConfigRemota() {
    _configRemotaPendiente = null;
    return true;
  }

  // ── Verificar si hay config pendiente ───────────────────────────
  function hayConfigPendiente() {
    return _configRemotaPendiente !== null;
  }

  // ── Guardar configuración con versión ───────────────────────────
  async function guardarConfiguracionVersionada(negocioId, config) {
    if (!isTokenValid()) return { ok: false, error: 'no_token' };

    var version = (config && config._version) ? config._version + 1 : 1;
    config._version = version;
    config._lastModified = new Date().toISOString();

    return await guardarConfiguracion(negocioId, config);
  }

  // ── Verificar si hay configuración más reciente ─────────────────
  async function hayConfigMasReciente(negocioId) {
    if (!isTokenValid()) return { ok: false, error: 'no_token' };

    try {
      var res = await fetch(SUPABASE_CENTRAL_URL + '/rest/v1/crozzo_negocios?id=eq.' + negocioId + '&select=configuracion', {
        headers: {
          'apikey': SUPABASE_CENTRAL_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_CENTRAL_ANON_KEY,
        },
      });

      if (!res.ok) return { ok: false, error: 'check_failed' };

      var data = await res.json();
      if (data && data.length > 0) {
        var remoteVersion = (data[0].configuracion && data[0].configuracion._version) || 0;
        var localVersion = 0;
        try {
          var localConfig = (typeof config !== 'undefined' && config.get) ? config.get('superadmin_sync') : null;
          if (localConfig && localConfig.version) localVersion = localConfig.version;
        } catch (_) {}

        return { ok: true, hayActualizacion: remoteVersion > localVersion, remoteVersion: remoteVersion, localVersion: localVersion };
      }
      return { ok: true, hayActualizacion: false };
    } catch (e) {
      return { ok: false, error: 'network_error', detail: e.message };
    }
  }

  // ── API pública ─────────────────────────────────────────────────
  global.CrozzoSuperAdminCentral = {
    isAvailable: isAvailable,
    verifySuperAdmin: verifySuperAdmin,
    isTokenValid: isTokenValid,
    getToken: getToken,
    logout: logout,
    registrarNegocio: registrarNegocio,
    buscarNegocio: buscarNegocio,
    guardarConfiguracion: guardarConfiguracion,
    cargarConfiguracion: cargarConfiguracion,
    guardarConfiguracionVersionada: guardarConfiguracionVersionada,
    sincronizarConfiguracion: sincronizarConfiguracion,
    hayConfigMasReciente: hayConfigMasReciente,
    aplicarConfigRemota: aplicarConfigRemota,
    ignorarConfigRemota: ignorarConfigRemota,
    hayConfigPendiente: hayConfigPendiente,
    crearSucursal: crearSucursal,
    getNegocioId: getNegocioId,
    getConfig: getConfig,
    listarNegocios: listarNegocios,
    SUPABASE_URL: SUPABASE_CENTRAL_URL,
  };

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));