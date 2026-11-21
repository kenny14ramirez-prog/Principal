/**
 * CrozzoHoneypotJaula — Modo "jaula de ratas" para el sistema honeypot.
 * Cuando un usuario señuelo (decoy) hace login, se activa este modo que:
 * 1. Carga datos ficticios consistentes (productos, ventas, clientes, inventario).
 * 2. Permite navegación normal (el atacante cree que accedió al sistema real).
 * 3. Programa alertas progresivas (toasts → modal → bloqueo).
 * 4. Bloquea irreversiblemente al final con datos del dispositivo.
 *
 * Todo es client-side. Los datos ficticios se generan en memoria y en localStorage
 * bajo claves separadas para no contaminar datos reales.
 */
(function (global) {
  'use strict';

  var JAULA_FLAG = 'crozzo_modo_jaula';
  var JAULA_LOG_KEY = 'crozzo_jaula_log';
  var JAULA_BLOCKED_KEY = 'crozzo_jaula_bloqueado';
  var JAULA_START_KEY = 'crozzo_jaula_start';
  var JAULA_DECOY_KEY = 'crozzo_jaula_decoy';

  // ── Estado interno ──────────────────────────────────────────────
  var jaula = {
    active: false,
    decoy: null,
    ctx: null,
    fakeUser: null,
    fakeEmpresa: null,
    startTime: 0,
    alertsEscalated: false,
    visitedScreens: {},
    actionLog: [],
    alertTimers: [],
    blocked: false,
  };

  // ── Helpers ─────────────────────────────────────────────────────
  function log(action, detail) {
    var entry = {
      ts: Date.now(),
      action: action,
      detail: detail || '',
      screen: (typeof currentPage !== 'undefined' ? currentPage : 'unknown'),
      userAgent: (typeof navigator !== 'undefined' ? navigator.userAgent : ''),
      url: (typeof location !== 'undefined' ? location.href : ''),
    };
    jaula.actionLog.push(entry);
    // Guardar en cada acción para no perder datos
    try { localStorage.setItem(JAULA_LOG_KEY, JSON.stringify(jaula.actionLog)); } catch (_) {}
  }

  function isJaulaActive() {
    return jaula.active === true;
  }

  function isBlocked() {
    try { return localStorage.getItem(JAULA_BLOCKED_KEY) === '1'; } catch (_) { return false; }
  }

  // ── Generación de datos ficticios ───────────────────────────────
  var FAKE_PRODUCTS = [
    { id: 101, nombre: 'Bandeja Paisa', precio: 28000, categoria: 'Platos', icon: '🍛' },
    { id: 102, nombre: 'Ajiaco Santafereño', precio: 25000, categoria: 'Platos', icon: '🍲' },
    { id: 103, nombre: 'Lechona Tolimense', precio: 22000, categoria: 'Platos', icon: '🐷' },
    { id: 104, nombre: 'Arepa con Queso', precio: 5000, categoria: 'Entradas', icon: '🧀' },
    { id: 105, nombre: 'Empanada', precio: 3500, categoria: 'Entradas', icon: '🥟' },
    { id: 106, nombre: 'Jugo Natural', precio: 8000, categoria: 'Bebidas', icon: '🧃' },
    { id: 107, nombre: 'Cerveza Artesanal', precio: 12000, categoria: 'Bebidas', icon: '🍺' },
    { id: 108, nombre: 'Café Premium', precio: 7000, categoria: 'Bebidas', icon: '☕' },
    { id: 109, nombre: 'Postre de Nata', precio: 9000, categoria: 'Postres', icon: '🍰' },
    { id: 110, nombre: 'Chuleta Valluna', precio: 32000, categoria: 'Platos', icon: '🥩' },
    { id: 111, nombre: 'Sancocho', precio: 20000, categoria: 'Platos', icon: '🥘' },
    { id: 112, nombre: 'Agua Mineral', precio: 3000, categoria: 'Bebidas', icon: '💧' },
    { id: 113, nombre: 'Arroz con Pollo', precio: 18000, categoria: 'Platos', icon: '🍗' },
    { id: 114, nombre: 'Patacones', precio: 8000, categoria: 'Entradas', icon: '🍌' },
    { id: 115, nombre: 'Tamales', precio: 6000, categoria: 'Entradas', icon: '🫔' },
    { id: 116, nombre: 'Gaseosa 400ml', precio: 4500, categoria: 'Bebidas', icon: '🥤' },
  ];

  var FAKE_EMPRESA = {
    nombre: 'Restaurante El Rincón del Sabor',
    nit: '900987654-3',
    direccion: 'Cra 45 #23-12, Medellín',
    telefono: '+57 4 555 1234',
    email: 'contacto@rincondelsabor.co',
  };

  var FAKE_CLIENTES = [
    { id: 'C001', nombre: 'Carlos Mendoza', telefono: '3001234567', email: 'carlos@email.com' },
    { id: 'C002', nombre: 'María García', telefono: '3009876543', email: 'maria@email.com' },
    { id: 'C003', nombre: 'Juan Pérez', telefono: '3005551234', email: 'juan@email.com' },
    { id: 'C004', nombre: 'Ana Rodríguez', telefono: '3007778899', email: 'ana@email.com' },
    { id: 'C005', nombre: 'Luis Martínez', telefono: '3002223344', email: 'luis@email.com' },
  ];

  // ── Decoys de Super Admin (honeypot) ────────────────────────────
  // Cuentas señuelo que parecen super admins. Cuando un atacante las usa,
  // activa la jaula de ratas. El atacante cree que accedió al super admin real.
  var FAKE_SUPERADMINS = [
    { user: 'SOPORTE_GLOBAL', pass: 'Soporte2026!', label: 'Soporte Global', rol: 'superadmin' },
    { user: 'ADMIN_MASTER', pass: 'MasterKey#99', label: 'Administrador Maestro', rol: 'superadmin' },
    { user: 'ROOT_SYSTEM', pass: 'RootAccess$2026', label: 'Root System', rol: 'superadmin' },
    { user: 'SUPERUSER', pass: 'SuperUser@2026', label: 'Super Usuario', rol: 'superadmin' },
    { user: 'MASTER_KEY', pass: 'MasterKey!2026', label: 'Clave Maestra', rol: 'superadmin' },
  ];

  function generarVentasFalsas(count) {
    var ventas = [];
    var metodos = ['efectivo', 'tarjeta', 'nequi', 'daviplata'];
    for (var i = 0; i < count; i++) {
      var prod = FAKE_PRODUCTS[Math.floor(Math.random() * FAKE_PRODUCTS.length)];
      var cant = Math.floor(Math.random() * 3) + 1;
      var total = prod.precio * cant;
      var hora = new Date();
      hora.setHours(8 + Math.floor(Math.random() * 12));
      hora.setMinutes(Math.floor(Math.random() * 60));
      ventas.push({
        id: 'V-' + (1000 + i),
        producto: prod.nombre,
        cantidad: cant,
        total: total,
        metodo: metodos[Math.floor(Math.random() * metodos.length)],
        hora: hora.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }),
        mesa: Math.floor(Math.random() * 20) + 1,
      });
    }
    return ventas;
  }

  // ── Activación del modo jaula ───────────────────────────────────
  function activar(decoy, opts) {
    if (jaula.active) return;
    opts = opts || {};
    var isAdminPreview = !!opts.adminPreview;
    if (!isAdminPreview) {
      // Guardia: no activar si hay un usuario real logueado
      try {
        var su = sessionStorage.getItem('crozzo_session_user');
        if (su && su !== 'null' && su !== '') return;
      } catch (_) {}
      try {
        if (typeof global.getCurrentUser === 'function') {
          var u = global.getCurrentUser();
          if (u) return;
        }
      } catch (_) {}
    } else {
      // adminPreview solo válido para KENNY/superadmin
      try {
        var u2 = (typeof global.getCurrentUser === 'function') ? global.getCurrentUser() : null;
        if (!u2 || !(u2.id === 'KENNY' || u2.es_super_admin === true)) return;
      } catch (_) { return; }
    }
    jaula.active = true;
    jaula.decoy = decoy || { user: 'UNKNOWN', rol: 'caja', label: 'Usuario' };
    jaula.startTime = Date.now();
    jaula.fakeUser = {
      id: decoy.user || 'HP_USER',
      nombre: decoy.label || decoy.user || 'Usuario',
      rol: decoy.rol || 'caja',
      activo: true,
      permisos: { caja: ['vista_pos', 'vista_facturas', 'vista_clientes', 'abrir_orden', 'editar_orden', 'facturar'], comandas: ['ver'], inventario: [], productos: ['catalogo'], admin: [] },
    };
    jaula.fakeEmpresa = FAKE_EMPRESA;
    jaula.actionLog = [];
    jaula.visitedScreens = {};
    jaula.opts = opts;

    try {
      sessionStorage.setItem(JAULA_FLAG, '1');
      sessionStorage.setItem(JAULA_START_KEY, String(jaula.startTime));
      sessionStorage.setItem(JAULA_DECOY_KEY, JSON.stringify(jaula.decoy));
    } catch (_) {}

    jaula.fakeProducts = FAKE_PRODUCTS.slice();
    jaula.fakeClientes = FAKE_CLIENTES.slice();
    jaula.fakeVentas = generarVentasFalsas(15 + Math.floor(Math.random() * 10));
    jaula.fakeInventario = FAKE_PRODUCTS.map(function (p) {
      return { id: p.id, nombre: p.nombre, stock: Math.floor(Math.random() * 50) + 5, precio: p.precio };
    });

    log('jaula_activada', 'Decoy: ' + (decoy.user || 'unknown'));

    // Interceptar config.get y getUsuariosConfig para devolver datos ficticios
    interceptarConfig();

    // Programar alertas con timing basado en opts
    programarAlertas(opts.liveMs || 60000, opts.shortDemo || false);
  }

  function desactivar() {
    jaula.active = false;
    if (_origConfigGet && typeof global.config !== 'undefined') global.config.get = _origConfigGet;
    if (_origGetUsuariosConfig) global.getUsuariosConfig = _origGetUsuariosConfig;
    if (_origCrozzoGetProductos) global.crozzoGetProductos = _origCrozzoGetProductos;
    if (_origCrozzoGetClientes) global.crozzoGetClientes = _origCrozzoGetClientes;
    if (_origCrozzoGetVentas) global.crozzoGetVentas = _origCrozzoGetVentas;
    _origConfigGet = null; _origGetUsuariosConfig = null; _origCrozzoGetProductos = null; _origCrozzoGetClientes = null; _origCrozzoGetVentas = null;
    _intercepted = false;
    // Restaurar funciones originales
    if (_origConfigGet && typeof global.config !== 'undefined') global.config.get = _origConfigGet;
    if (_origGetUsuariosConfig) global.getUsuariosConfig = _origGetUsuariosConfig;
    if (_origCrozzoGetProductos) global.crozzoGetProductos = _origCrozzoGetProductos;
    if (_origCrozzoGetClientes) global.crozzoGetClientes = _origCrozzoGetClientes;
    if (_origCrozzoGetVentas) global.crozzoGetVentas = _origCrozzoGetVentas;
    _origConfigGet = null; _origGetUsuariosConfig = null; _origCrozzoGetProductos = null; _origCrozzoGetClientes = null; _origCrozzoGetVentas = null;
    _intercepted = false;
    jaula.blocked = false;
    jaula.decoy = null;
    jaula.fakeUser = null;
    jaula.actionLog = [];
    if (jaula.blockObserver) { try { jaula.blockObserver.disconnect(); } catch (_) {} jaula.blockObserver = null; }
    if (jaula.blockInterval) { clearInterval(jaula.blockInterval); jaula.blockInterval = null; }
    jaula.alertTimers.forEach(function (t) { try { clearTimeout(t); } catch (_) {} });
    jaula.alertTimers = [];
    try { sessionStorage.removeItem(JAULA_FLAG); sessionStorage.removeItem(JAULA_START_KEY); sessionStorage.removeItem(JAULA_DECOY_KEY); } catch (_) {}
    try { localStorage.removeItem(JAULA_BLOCKED_KEY); localStorage.removeItem(JAULA_LOG_KEY); } catch (_) {}
  }

  // ── Interceptores de datos ──────────────────────────────────────
  var _origConfigGet = null;
  var _origGetUsuariosConfig = null;
  var _origCrozzoGetProductos = null;
  var _origCrozzoGetClientes = null;
  var _origCrozzoGetVentas = null;
  var _intercepted = false;

  function interceptarConfig() {
    if (!jaula.active) return;
    if (_intercepted) return;
    _intercepted = true;
    if (_intercepted) return;
    _intercepted = true;
    if (typeof global.config !== 'undefined' && typeof global.config.get === 'function') {
      _origConfigGet = global.config.get.bind(global.config);
      const origGet = _origConfigGet;
      global.config.get = function (key) {
        if (!jaula.active && _origConfigGet) return _origConfigGet(key);
        if (key === 'usuarios') {
          return { staff: [jaula.fakeUser] };
        }
        if (key === 'facturas') {
          return jaula.fakeVentas.map(function (v, i) {
            return { id: 'F-' + (1000 + i), total: v.total, metodoPago: v.metodo, fecha: new Date().toISOString() };
          });
        }
        if (key === 'productos') {
          return jaula.fakeProducts.map(function (p, i) {
            return { id: p.id, nombre: p.nombre, precio: p.precio, categoria: p.cat, icon: p.icon, stock: Math.floor(Math.random() * 50) + 5, activo: true };
          });
        }
        if (key === 'clientes') {
          return jaula.fakeClientes.map(function (c, i) {
            return { id: 'CL-' + (i + 1), nombre: c.nombre, telefono: c.tel, email: c.email, nit: c.nit || '', totalCompras: Math.floor(Math.random() * 500000) + 50000 };
          });
        }
        return origGet(key);
      };
    }
    if (typeof global.getUsuariosConfig === 'function') {
      _origGetUsuariosConfig = global.getUsuariosConfig;
      global.getUsuariosConfig = function () {
        if (!jaula.active && _origGetUsuariosConfig) return _origGetUsuariosConfig();
        return { staff: [jaula.fakeUser] };
      };
    }
    // Interceptar funciones globales de datos para devolver datos ficticios
    if (typeof global.crozzoGetProductos === 'function') {
      _origCrozzoGetProductos = global.crozzoGetProductos;
      global.crozzoGetProductos = function () {
        if (!jaula.active && _origCrozzoGetProductos) return _origCrozzoGetProductos();
        return jaula.fakeProducts.map(function (p) {
          return { id: p.id, nombre: p.nombre, precio: p.precio, categoria: p.cat, icon: p.icon, stock: Math.floor(Math.random() * 50) + 5, activo: true };
        });
      };
    }
    if (typeof global.crozzoGetClientes === 'function') {
      _origCrozzoGetClientes = global.crozzoGetClientes;
      global.crozzoGetClientes = function () {
        if (!jaula.active && _origCrozzoGetClientes) return _origCrozzoGetClientes();
        return jaula.fakeClientes.map(function (c, i) {
          return { id: 'CL-' + (i + 1), nombre: c.nombre, telefono: c.tel, email: c.email, nit: c.nit || '' };
        });
      };
    }
    if (typeof global.crozzoGetVentas === 'function') {
      _origCrozzoGetVentas = global.crozzoGetVentas;
      global.crozzoGetVentas = function () {
        if (!jaula.active && _origCrozzoGetVentas) return _origCrozzoGetVentas();
        return jaula.fakeVentas.map(function (v, i) {
          return { id: 'V-' + (i + 1), total: v.total, metodoPago: v.metodo, fecha: new Date(Date.now() - Math.random() * 86400000).toISOString(), cliente: jaula.fakeClientes[Math.floor(Math.random() * jaula.fakeClientes.length)].nombre };
        });
      };
    }
  }

  // ── Alertas progresivas ─────────────────────────────────────────
  function programarAlertas(liveMs, shortDemo) {
    if (!jaula.active) return;
    // Tiempo más largo: 90-150 segundos para que el atacante explore
    liveMs = liveMs || (90000 + Math.floor(Math.random() * 60000));
    if (shortDemo) liveMs = Math.min(liveMs, 30000);
    jaula.startTime = Date.now();

    var alertas = [
      // Fase 1: Toasts sutiles (parecen normales)
      { delay: 0.15, tipo: 'toast', msg: 'Sincronizando datos con la nube…', nivel: 'info' },
      { delay: 0.25, tipo: 'toast', msg: 'Verificando permisos de dispositivo…', nivel: 'info' },
      { delay: 0.35, tipo: 'toast', msg: 'Catálogo actualizado desde servidor', nivel: 'info' },
      // Fase 2: Modal de confirmación (como Google)
      { delay: 0.50, tipo: 'modal', msg: 'Se detectó un nuevo inicio de sesión en este dispositivo. ¿Fue usted?', nivel: 'warning' },
      // Fase 3: Toasts de advertencia
      { delay: 0.60, tipo: 'toast', msg: '⚠️ Actividad inusual detectada en el sistema', nivel: 'warning' },
      { delay: 0.70, tipo: 'toast', msg: 'Verificando integridad de datos…', nivel: 'warning' },
      // Fase 4: Modal de alerta
      { delay: 0.80, tipo: 'modal', msg: 'Acceso no autorizado detectado. Se está registrando la actividad.', nivel: 'error' },
      // Fase 5: Toast crítico
      { delay: 0.88, tipo: 'toast', msg: '🔴 Violación de integridad del sistema', nivel: 'error' },
      // Fase 6: Bloqueo final
      { delay: 0.95, tipo: 'bloqueo', msg: 'SISTEMA BLOQUEADO — Contacte a soporte', nivel: 'critical' },
    ];

    alertas.forEach(function (alerta) {
      if (alerta.tipo === 'bloqueo' && jaula.opts && jaula.opts.adminPreview) return;
      var delay = Math.floor(liveMs * alerta.delay) + Math.floor(Math.random() * 8000);
      var timer = setTimeout(function () {
        if (!jaula.active) return;
        switch (alerta.tipo) {
          case 'toast':
            if (typeof showToast === 'function') showToast(alerta.msg, alerta.nivel);
            log('alerta_toast', alerta.msg);
            break;
          case 'modal':
            mostrarModal(alerta.msg);
            log('alerta_modal', alerta.msg);
            break;
          case 'bloqueo':
            bloquearFinal();
            log('bloqueo_final', 'Sistema bloqueado');
            break;
        }
      }, delay);
      jaula.alertTimers.push(timer);
    });
  }

  function mostrarModal(msg) {
    var ov = document.getElementById('crozzoHoneypotOverlay');
    if (!ov) return;
    ov.removeAttribute('hidden');
    var status = document.getElementById('honeypotStatus');
    if (status) status.textContent = msg;
    var bar = document.getElementById('honeypotProgressBar');
    if (bar) bar.style.width = '50%';
    setTimeout(function () {
      if (ov) ov.setAttribute('hidden', '');
    }, 5000);
  }

  // ── Registrar bloqueo en Supabase con reintentos ─────────────────
  function registrarBloqueoEnNube(fingerprint, userAgent, motivo) {
    var intentos = 0;
    var maxIntentos = 10;

    function intentar() {
      if (intentos >= maxIntentos) return;
      intentos++;
      if (typeof fetch === 'function') {
        fetch('https://hogeggkkodkpzossjfft.supabase.co/rest/v1/rpc/register_blocked_device', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': 'sb_publishable_rNiFFu5h4YR-Ab5n8wxJSA_G58xhE64',
            'Authorization': 'Bearer sb_publishable_rNiFFu5h4YR-Ab5n8wxJSA_G58xhE64',
          },
          body: JSON.stringify({
            p_fingerprint: fingerprint,
            p_user_agent: userAgent,
            p_motivo: motivo || 'honeypot_intrusion',
          }),
        }).then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          // Guardar en localStorage que se registró
          try { localStorage.setItem('crozzo_blocked_registered', '1'); } catch (_) {}
          try { localStorage.removeItem('crozzo_blocked_pending_fp'); } catch (_) {}
        }).catch(function () {
          // Guardar fingerprint pendiente para reintentar después
          try { localStorage.setItem('crozzo_blocked_pending_fp', fingerprint); } catch (_) {}
          // Reintentar en 5 segundos
          setTimeout(intentar, 5000);
        });
      }
    }
    intentar();
  }

  function bloquearFinal() {
    jaula.blocked = true;
    try { localStorage.setItem(JAULA_BLOCKED_KEY, '1'); } catch (_) {}
    try { localStorage.setItem(JAULA_LOG_KEY, JSON.stringify(jaula.actionLog)); } catch (_) {}

    // Enviar alerta de bloqueo por email
    try {
      var fp = generarFingerprintDispositivo();
      // Obtener email de KENNY desde Supabase
      if (typeof fetch === 'function') {
        fetch('https://hogeggkkodkpzossjfft.supabase.co/rest/v1/crozzo_superadmins?username=eq.KENNY&select=email', {
          headers: { 'apikey': 'sb_publishable_rNiFFu5h4YR-Ab5n8wxJSA_G58xhE64', 'Authorization': 'Bearer sb_publishable_rNiFFu5h4YR-Ab5n8wxJSA_G58xhE64' },
        }).then(function (res) { return res.json(); }).then(function (data) {
          if (data && data.length > 0 && data[0].email && typeof CrozzoEmailTemplates !== 'undefined') {
            var email = data[0].email;
            var html = CrozzoEmailTemplates.templateAlertaBloqueo(email, fp, new Date().toLocaleString('es-CO'));
            CrozzoEmailTemplates.enviarEmail(email, '🚫 Dispositivo bloqueado — BONA origen', html);
          }
        }).catch(function () {});
      }
    } catch (_) {}

    // Registrar dispositivo bloqueado en Supabase Central (con reintentos)
    try {
      var fp = generarFingerprintDispositivo();
      registrarBloqueoEnNube(fp, (typeof navigator !== 'undefined' ? navigator.userAgent : ''), 'honeypot_intrusion');
    } catch (_) {}

    jaula.alertTimers.forEach(function (t) { clearTimeout(t); });
    jaula.alertTimers = [];

    var ov = document.getElementById('crozzoHoneypotOverlay');
    if (ov) {
      ov.removeAttribute('hidden');
      ov.classList.add('crozzo-honeypot--blocked');
    }
    var status = document.getElementById('honeypotStatus');
    if (status) status.textContent = '🔴 ACCESO NO AUTORIZADO DETECTADO';
    var bar = document.getElementById('honeypotProgressBar');
    if (bar) bar.style.width = '100%';

    var dump = document.getElementById('honeypotDeviceDump');
    if (dump) {
      var deviceInfo = {
        dispositivo: navigator.userAgent,
        plataforma: navigator.platform,
        idioma: navigator.language,
        pantalla: screen.width + 'x' + screen.height,
        zonaHoraria: Intl.DateTimeFormat().resolvedOptions().timeZone,
        usuarioIntentado: jaula.decoy ? jaula.decoy.user : 'unknown',
        rolIntentado: jaula.decoy ? jaula.decoy.rol : 'unknown',
        pantallasVisitadas: Object.keys(jaula.visitedScreens),
        accionesRealizadas: jaula.actionLog.length,
        duracionSesion: Math.floor((Date.now() - jaula.startTime) / 1000) + ' segundos',
        fecha: new Date().toISOString(),
      };
      dump.textContent = JSON.stringify(deviceInfo, null, 2);
    }

    var footnote = document.getElementById('honeypotFootnote');
    if (footnote) footnote.textContent = 'Los datos han sido enviados a soporte. Contacte a un administrador para desbloquear.';

    document.body.style.overflow = 'hidden';
    document.body.classList.add('crozzo-hp-containment-active');

    if (typeof crozzoHpForceEndLiveSession === 'function') {
      try { crozzoHpForceEndLiveSession(); } catch (_) {}
    }
  }

  // ── Generar fingerprint robusto del dispositivo ───────────────────
  // Incluye Canvas, WebGL y AudioContext para dificultar el spoofing
  function generarFingerprintDispositivo() {
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

      // 1. Canvas fingerprint
      try {
        var canvas = document.createElement('canvas');
        var ctx = canvas.getContext('2d');
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillStyle = '#f60';
        ctx.fillRect(125, 1, 62, 20);
        ctx.fillStyle = '#069';
        ctx.fillText('CrozzoFP', 2, 15);
        ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
        ctx.fillText('CrozzoFP', 4, 17);
        components.push(canvas.toDataURL());
      } catch (_) {}

      // 2. WebGL fingerprint
      try {
        var glCanvas = document.createElement('canvas');
        var gl = glCanvas.getContext('webgl') || glCanvas.getContext('experimental-webgl');
        if (gl) {
          var debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
          if (debugInfo) {
            components.push(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || '');
            components.push(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '');
          }
          components.push(gl.getParameter(gl.VERSION) || '');
          components.push(gl.getParameter(gl.SHADING_LANGUAGE_VERSION) || '');
        }
      } catch (_) {}

      // 3. AudioContext fingerprint
      try {
        var AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          var audioCtx = new AudioCtx();
          var oscillator = audioCtx.createOscillator();
          var analyser = audioCtx.createAnalyser();
          var gain = audioCtx.createGain();
          gain.gain.value = 0;
          oscillator.connect(analyser);
          analyser.connect(gain);
          gain.connect(audioCtx.destination);
          oscillator.start(0);
          var audioData = new Float32Array(analyser.frequencyBinCount);
          analyser.getFloatFrequencyData(audioData);
          components.push(Array.prototype.slice.call(audioData, 0, 10).join(','));
          oscillator.stop();
          audioCtx.close();
        }
      } catch (_) {}

      // 4. Fuentes instaladas (detección básica)
      try {
        var fonts = ['Arial', 'Verdana', 'Times New Roman', 'Courier New', 'Georgia', 'Palatino', 'Garamond', 'Bookman', 'Comic Sans MS', 'Trebuchet MS', 'Impact'];
        var detectedFonts = [];
        var testStr = 'mmmmmmmmmmlli';
        var baseCanvas = document.createElement('canvas');
        var baseCtx = baseCanvas.getContext('2d');
        baseCtx.font = '72px monospace';
        var baseWidth = baseCtx.measureText(testStr).width;
        for (var f = 0; f < fonts.length; f++) {
          var testCanvas = document.createElement('canvas');
          var testCtx = testCanvas.getContext('2d');
          testCtx.font = '72px ' + fonts[f] + ', monospace';
          if (testCtx.measureText(testStr).width !== baseWidth) {
            detectedFonts.push(fonts[f]);
          }
        }
        components.push(detectedFonts.join(','));
      } catch (_) {}

    } catch (_) {}

    var str = components.join('|');
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      var char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return 'fp_' + Math.abs(hash).toString(36) + '_' + str.length;
  }

  // ── Proteger el bloqueo: MutationObserver + interval ────────────
  function _protegerBloqueo() {
    // MutationObserver: si alguien remueve el overlay, lo re-aplica
    if (typeof MutationObserver !== 'undefined') {
      var observer = new MutationObserver(function (mutations) {
        if (!jaula.blocked || (jaula.opts && jaula.opts.adminPreview)) return;
        var ov = document.getElementById('crozzoHoneypotOverlay');
        if (!ov || ov.hasAttribute('hidden')) {
          _mostrarBloqueo();
        }
        if (document.body.style.overflow !== 'hidden') {
          document.body.style.overflow = 'hidden';
        }
        if (!document.body.classList.contains('crozzo-hp-containment-active')) {
          document.body.classList.add('crozzo-hp-containment-active');
        }
      });
      observer.observe(document.body, { childList: true, attributes: true, subtree: true });
      jaula.blockObserver = observer;
    }

    // Interval: verificar cada segundo
    jaula.blockInterval = setInterval(function () {
      if (!jaula.blocked) return;
      var ov = document.getElementById('crozzoHoneypotOverlay');
      if (!ov || ov.hasAttribute('hidden')) {
        _mostrarBloqueo();
      }
    }, 1000);
  }

  // ── Verificación de bloqueo al arranque (ultra mega potente) ────
  function verificarBloqueo() {
    // 1. Verificar bloqueo local
    // Solo se respeta si el propio honeypot lo activó en esta sesión (adminPreview).
    // Los bloqueos persistidos stale nunca deben bloquear a un usuario legítimo.
    try {
      localStorage.removeItem(JAULA_BLOCKED_KEY);
      localStorage.removeItem('crozzo_blocked_pending_fp');
    } catch (_) {}
    jaula.blocked = false;

    // 2. Verificar bloqueo en la nube (Supabase Central)
    // DESACTIVADO: causaba falsos positivos para KENNY/demo. Se reactiva cuando se
    // implemente un unblock por superadmin. El bloqueo local (localStorage) sigue activo.
    /*
    try {
      var fp = generarFingerprintDispositivo();
      if (typeof fetch === 'function') {
        fetch('https://hogeggkkodkpzossjfft.supabase.co/rest/v1/rpc/check_device_blocked', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': 'sb_publishable_rNiFFu5h4YR-Ab5n8wxJSA_G58xhE64',
            'Authorization': 'Bearer sb_publishable_rNiFFu5h4YR-Ab5n8wxJSA_G58xhE64',
          },
          body: JSON.stringify({ p_fingerprint: fp }),
        }).then(function (res) {
          return res.json();
        }).then(function (data) {
          if (data === true) {
            // Dispositivo bloqueado en la nube → bloquear localmente
            try { localStorage.setItem(JAULA_BLOCKED_KEY, '1'); } catch (_) {}
            jaula.blocked = true;
            _mostrarBloqueo();
            _protegerBloqueo();
          }
        }).catch(function () {});
      }
    } catch (_) {}
    */

    // 3. Verificar si hay bloqueo pendiente de registrar en la nube
    try {
      var pendingFp = localStorage.getItem('crozzo_blocked_pending_fp');
      if (pendingFp) {
        registrarBloqueoEnNube(pendingFp, (typeof navigator !== 'undefined' ? navigator.userAgent : ''), 'honeypot_intrusion');
      }
    } catch (_) {}

    return false;
  }

  // ── Mostrar pantalla de bloqueo ─────────────────────────────────
  function _mostrarBloqueo() {
    var ov = document.getElementById('crozzoHoneypotOverlay');
    if (ov) {
      ov.removeAttribute('hidden');
      ov.classList.add('crozzo-honeypot--blocked');
    }
    var status = document.getElementById('honeypotStatus');
    if (status) status.textContent = '🔴 SISTEMA BLOQUEADO — Acceso no autorizado detectado';
    var dump = document.getElementById('honeypotDeviceDump');
    if (dump) {
      try { dump.textContent = localStorage.getItem(JAULA_LOG_KEY) || 'Sin datos'; } catch (_) {}
    }
    var footnote = document.getElementById('honeypotFootnote');
    if (footnote) footnote.textContent = 'Ingrese el código de recuperación del superadministrador o reinstale la aplicación.';
    document.body.style.overflow = 'hidden';
    document.body.classList.add('crozzo-hp-containment-active');
  }

  // ── Desbloqueo (verificado contra Supabase) ────────────────────
  function desbloquear(codigo, callback) {
    if (!codigo) return false;

    // Verificar código contra Supabase Central (no hardcodeado)
    try {
      var fp = generarFingerprintDispositivo();
      if (typeof fetch === 'function') {
        fetch('https://hogeggkkodkpzossjfft.supabase.co/rest/v1/rpc/verify_unlock_code', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': 'sb_publishable_rNiFFu5h4YR-Ab5n8wxJSA_G58xhE64',
            'Authorization': 'Bearer sb_publishable_rNiFFu5h4YR-Ab5n8wxJSA_G58xhE64',
          },
          body: JSON.stringify({ p_code: codigo, p_fingerprint: fp }),
        }).then(function (res) {
          return res.json();
        }).then(function (data) {
          if (data && data.ok) {
            // Desbloqueo exitoso — limpiar estado local
            try {
              localStorage.removeItem(JAULA_BLOCKED_KEY);
              localStorage.removeItem(JAULA_LOG_KEY);
              localStorage.removeItem('crozzo_blocked_pending_fp');
              localStorage.removeItem('crozzo_blocked_registered');
            } catch (_) {}
            if (jaula.blockObserver) {
              jaula.blockObserver.disconnect();
              jaula.blockObserver = null;
            }
            if (jaula.blockInterval) {
              clearInterval(jaula.blockInterval);
              jaula.blockInterval = null;
            }
            jaula.blocked = false;
            var ov = document.getElementById('crozzoHoneypotOverlay');
            if (ov) ov.setAttribute('hidden', '');
            document.body.style.overflow = '';
            document.body.classList.remove('crozzo-hp-containment-active');
            if (typeof callback === 'function') callback(true);
          } else {
            if (typeof callback === 'function') callback(false);
          }
        }).catch(function () {
          // Fallback de código hardcodeado eliminado (seguridad).
          // Usar solo verificación server-side (verify_unlock_code).
        });
      }
    } catch (_) {
      return false;
    }
    return false;
  }

  // ── Tracking de navegación ──────────────────────────────────────
  function trackScreen(screen) {
    if (!jaula.active) return;
    jaula.visitedScreens[screen] = (jaula.visitedScreens[screen] || 0) + 1;
    log('navegacion', 'Pantalla: ' + screen);
  }

  // ── Restaurar estado al recargar (Phase 3) ──────────────────────
  function restaurarEstado() {
    try {
      // Guardia 1: si hay un usuario real logueado (sessionStorage), nunca restaurar jaula
      try {
        var sessionUser = sessionStorage.getItem('crozzo_session_user');
        if (sessionUser && sessionUser !== 'null' && sessionUser !== '') {
          desactivar();
          return false;
        }
      } catch (_) {}
      // Guardia 2: si el usuario actual es real (cuando getCurrentUser ya está disponible)
      try {
        if (typeof global.getCurrentUser === 'function') {
          var u = global.getCurrentUser();
          if (u && (u.id === 'KENNY' || u.es_super_admin === true)) {
            desactivar();
            return false;
          }
        }
      } catch (_) {}
      if (sessionStorage.getItem(JAULA_FLAG) === '1') {
        // El honeypot estaba activo antes del reload
        var startTs = parseInt(sessionStorage.getItem(JAULA_START_KEY) || '0', 10);
        if (startTs > 0) {
          // Guardia 3: no restaurar sesiones stale (menos de 2 min)
          if (Date.now() - startTs > 120000) { desactivar(); return false; }
          jaula.active = true;
          jaula.startTime = startTs;
          try {
            var savedDecoy = sessionStorage.getItem(JAULA_DECOY_KEY);
            if (savedDecoy) jaula.decoy = JSON.parse(savedDecoy);
          } catch (_) {}
          try {
            var savedLog = localStorage.getItem(JAULA_LOG_KEY);
            if (savedLog) jaula.actionLog = JSON.parse(savedLog);
          } catch (_) {}
          // Restaurar alertas restantes
          var elapsed = Date.now() - startTs;
          var remainingMs = Math.max(0, 120000 - elapsed);
          if (remainingMs > 0) {
            programarAlertas(remainingMs, false);
          } else {
            // Ya debería haber bloqueado
            if (!isBlocked() && !(jaula.opts && jaula.opts.adminPreview)) bloquearFinal();
          }
          return true;
        }
      }
    } catch (_) {}
    return false;
  }

  // ── Estadísticas para panel de admin (Phase 4) ──────────────────
  function getStats() {
    return {
      active: jaula.active,
      blocked: jaula.blocked || isBlocked(),
      decoy: jaula.decoy ? jaula.decoy.user : null,
      startTime: jaula.startTime,
      duration: jaula.startTime ? Math.floor((Date.now() - jaula.startTime) / 1000) : 0,
      visitedScreens: Object.keys(jaula.visitedScreens),
      actionCount: jaula.actionLog.length,
      alertCount: jaula.actionLog.filter(function (a) { return a.action.indexOf('alerta') === 0; }).length,
      lastAction: jaula.actionLog.length > 0 ? jaula.actionLog[jaula.actionLog.length - 1] : null,
    };
  }

  // ── Modo preview para admin (Phase 4) ───────────────────────────
  function modoPreview(decoy) {
    // Activar honeypot sin bloqueo real, para que el admin vea cómo se ve
    if (jaula.active) return false;
    activar(decoy || { user: 'PREVIEW', rol: 'caja', label: 'Preview' }, { adminPreview: true, shortDemo: true, liveMs: 30000 });
    return true;
  }

  // ── Limpiar logs (admin) ────────────────────────────────────────
  function limpiarLogs() {
    jaula.actionLog = [];
    try { localStorage.removeItem(JAULA_LOG_KEY); } catch (_) {}
  }

  // ── Exportar log para auditoría (Phase 4) ───────────────────────
  function exportarLog() {
    return {
      jaulaActive: jaula.active,
      blocked: jaula.blocked || isBlocked(),
      decoy: jaula.decoy,
      startTime: jaula.startTime,
      duration: jaula.startTime ? Math.floor((Date.now() - jaula.startTime) / 1000) : 0,
      visitedScreens: Object.keys(jaula.visitedScreens),
      actionLog: jaula.actionLog.slice(),
      deviceInfo: {
        userAgent: (typeof navigator !== 'undefined' ? navigator.userAgent : ''),
        platform: (typeof navigator !== 'undefined' ? navigator.platform : ''),
        language: (typeof navigator !== 'undefined' ? navigator.language : ''),
      },
    };
  }

  // ── API pública ─────────────────────────────────────────────────
  global.CrozzoHoneypotJaula = {
    activar: activar,
    desactivar: desactivar,
    isJaulaActive: isJaulaActive,
    isBlocked: isBlocked,
    bloquearFinal: bloquearFinal,
    desbloquear: desbloquear,
    verificarBloqueo: verificarBloqueo,
    trackScreen: trackScreen,
    interceptarConfig: interceptarConfig,
    log: log,
    restaurarEstado: restaurarEstado,
    getStats: getStats,
    modoPreview: modoPreview,
    limpiarLogs: limpiarLogs,
    exportarLog: exportarLog,
    getActionLog: function () { return jaula.actionLog.slice(); },
    getVisitedScreens: function () { return Object.keys(jaula.visitedScreens); },
    FAKE_PRODUCTS: FAKE_PRODUCTS,
    FAKE_EMPRESA: FAKE_EMPRESA,
    FAKE_CLIENTES: FAKE_CLIENTES,
  };

  // Verificar bloqueo al cargar + restaurar estado (Phase 3)
  if (typeof document !== 'undefined') {
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      setTimeout(function () { verificarBloqueo(); restaurarEstado(); }, 100);
    } else {
      document.addEventListener('DOMContentLoaded', function () {
        setTimeout(function () { verificarBloqueo(); restaurarEstado(); }, 100);
      }, { once: true });
    }
  }

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));