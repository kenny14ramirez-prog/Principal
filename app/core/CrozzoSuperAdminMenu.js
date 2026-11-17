/**
 * CrozzoSuperAdminMenu — Menú de opciones para Super Admin (KENNY).
 *
 * Se muestra después del login de KENNY. Permite:
 * 1. Modo Demo (datos ficticios, sin registro)
 * 2. Registrar nueva empresa
 * 3. Acceder a empresa existente
 * 4. Dashboard de negocios registrados
 */
(function (global) {
  'use strict';

  var MENU_ID = 'crozzoSuperAdminMenu';

  function crearMenu() {
    // Eliminar menú anterior si existe
    var existing = document.getElementById(MENU_ID);
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = MENU_ID;
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;';

    var card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:16px;padding:32px;max-width:480px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);';

    card.innerHTML = CrozzoSanitize.sanitizeHtml('<h2 style="margin:0 0 8px;font-size:1.4rem;color:#1a1a2e;">Super Admin</h2>' +
      '<p style="margin:0 0 24px;color:#666;font-size:0.9rem;">Bienvenido, Kenny. ¿Qué deseas hacer?</p>' +
      '<div style="display:flex;flex-direction:column;gap:12px;">' +
        '<button id="samDemo" style="padding:14px 20px;border:1px solid #e0e0e0;border-radius:10px;background:#f8f9fa;cursor:pointer;font-size:1rem;text-align:left;">' +
          '<strong>Modo Demo</strong><br><span style="font-size:0.8rem;color:#888;">Carga datos ficticios para mostrar al cliente. No se registra en la nube.</span>' +
        '</button>' +
        '<button id="samRegistrar" style="padding:14px 20px;border:1px solid #e0e0e0;border-radius:10px;background:#f8f9fa;cursor:pointer;font-size:1rem;text-align:left;">' +
          '<strong>Registrar nueva empresa</strong><br><span style="font-size:0.8rem;color:#888;">Crea un negocio nuevo en Supabase Central.</span>' +
        '</button>' +
        '<button id="samAcceder" style="padding:14px 20px;border:1px solid #e0e0e0;border-radius:10px;background:#f8f9fa;cursor:pointer;font-size:1rem;text-align:left;">' +
          '<strong>Acceder a empresa existente</strong><br><span style="font-size:0.8rem;color:#888;">Busca por NIT o nombre.</span>' +
        '</button>' +
        '<button id="samDashboard" style="padding:14px 20px;border:1px solid #e0e0e0;border-radius:10px;background:#f8f9fa;cursor:pointer;font-size:1rem;text-align:left;">' +
          '<strong>Dashboard de negocios</strong><br><span style="font-size:0.8rem;color:#888;">Lista de empresas registradas.</span>' +
        '</button>' +
        '<button id="samCerrar" style="padding:10px 20px;border:none;border-radius:10px;background:#e74c3c;color:#fff;cursor:pointer;font-size:0.9rem;margin-top:8px;">' +
          'Cerrar menú' +
        '</button>' +
      '</div>');

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Event handlers
    document.getElementById('samDemo').onclick = function () { activarModoDemo(); cerrarMenu(); };
    document.getElementById('samRegistrar').onclick = function () { cerrarMenu(); mostrarFormularioRegistro(); };
    document.getElementById('samAcceder').onclick = function () { cerrarMenu(); mostrarFormularioAcceso(); };
    document.getElementById('samDashboard').onclick = function () { cerrarMenu(); mostrarDashboard(); };
    document.getElementById('samCerrar').onclick = function () { cerrarMenu(); };
  }

  function cerrarMenu() {
    var m = document.getElementById(MENU_ID);
    if (m) m.remove();
  }

  // ── Modo Demo ───────────────────────────────────────────────────
  function activarModoDemo() {
    // Activar honeypot con datos ficticios (sin bloqueo)
    if (window.CrozzoHoneypotJaula && typeof CrozzoHoneypotJaula.modoPreview === 'function') {
      CrozzoHoneypotJaula.modoPreview({ user: 'DEMO', rol: 'caja', label: 'Demo' });
    } else if (window.CrozzoHoneypotJaula && typeof CrozzoHoneypotJaula.activar === 'function') {
      CrozzoHoneypotJaula.activar({ user: 'DEMO', rol: 'caja', label: 'Demo' }, { adminPreview: true, shortDemo: false, liveMs: 999999999 });
    }

    // Cargar datos ficticios en el POS
    if (typeof products !== 'undefined' && window.CrozzoHoneypotJaula && CrozzoHoneypotJaula.FAKE_PRODUCTS) {
      // Reemplazar productos con los ficticios
      try {
        var fakeProds = CrozzoHoneypotJaula.FAKE_PRODUCTS.map(function (p) {
          return { id: p.id, nombre: p.nombre, precio: p.precio, ivaRate: 0, icon: p.icon, categoria: (p.categoria || 'platos').toLowerCase(), tieneRecetaProceso: true };
        });
        // Guardar productos originales
        if (!window._originalProducts) window._originalProducts = products.slice();
        products = fakeProds;
        if (typeof global !== 'undefined') global.products = products;
      } catch (_) {}
    }

    // Mostrar banner de modo demo
    var banner = document.createElement('div');
    banner.id = 'demoModeBanner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99998;background:linear-gradient(135deg,#B59A6D,#7A6342);color:#fff;text-align:center;padding:8px;font-size:0.85rem;font-weight:600;';
    banner.innerHTML = CrozzoSanitize.sanitizeHtml('MODO DEMO — Datos ficticios · <button onclick="window._exitDemoMode()" style="background:rgba(255,255,255,0.2);border:1px solid rgba(255,255,255,0.4);color:#fff;padding:2px 8px;border-radius:4px;cursor:pointer;margin-left:8px;">Salir del demo</button>');
    document.body.appendChild(banner);

    // Desplazar contenido para el banner
    document.body.style.paddingTop = '36px';

    if (typeof showToast === 'function') showToast('Modo Demo activado — datos ficticios cargados', 'success');
    if (typeof renderPage === 'function' && typeof currentPage !== 'undefined') renderPage(currentPage);
  }

  // ── Salir del modo demo ─────────────────────────────────────────
  global._exitDemoMode = function () {
    // Restaurar productos originales
    if (window._originalProducts) {
      products = window._originalProducts;
      if (typeof global !== 'undefined') global.products = products;
      delete window._originalProducts;
    }

    // Desactivar honeypot
    if (window.CrozzoHoneypotJaula && typeof CrozzoHoneypotJaula.desactivar === 'function') {
      CrozzoHoneypotJaula.desactivar();
    }

    // Eliminar banner
    var banner = document.getElementById('demoModeBanner');
    if (banner) banner.remove();
    document.body.style.paddingTop = '';

    if (typeof showToast === 'function') showToast('Modo Demo desactivado', 'info');
    if (typeof renderPage === 'function' && typeof currentPage !== 'undefined') renderPage(currentPage);
  };

  // ── Formulario de registro de empresa ───────────────────────────
  function mostrarFormularioRegistro() {
    var overlay = document.createElement('div');
    overlay.id = MENU_ID;
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;';

    var card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:16px;padding:32px;max-width:520px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);';

    card.innerHTML = CrozzoSanitize.sanitizeHtml('<h2 style="margin:0 0 16px;font-size:1.3rem;color:#1a1a2e;">Registrar nueva empresa</h2>' +
      '<div style="display:flex;flex-direction:column;gap:12px;">' +
        '<label style="font-size:0.85rem;color:#555;">Nombre de la empresa</label>' +
        '<input id="samNombre" type="text" placeholder="Pepito Flores" style="padding:10px;border:1px solid #ddd;border-radius:8px;font-size:1rem;">' +
        '<label style="font-size:0.85rem;color:#555;">NIT</label>' +
        '<input id="samNit" type="text" placeholder="900123456-7" style="padding:10px;border:1px solid #ddd;border-radius:8px;font-size:1rem;">' +
        '<label style="font-size:0.85rem;color:#555;">Dirección</label>' +
        '<input id="samDireccion" type="text" placeholder="Cra 45 #23-12, Medellín" style="padding:10px;border:1px solid #ddd;border-radius:8px;font-size:1rem;">' +
        '<label style="font-size:0.85rem;color:#555;">Teléfono</label>' +
        '<input id="samTelefono" type="text" placeholder="+57 4 555 1234" style="padding:10px;border:1px solid #ddd;border-radius:8px;font-size:1rem;">' +
        '<label style="font-size:0.85rem;color:#555;">Email</label>' +
        '<input id="samEmail" type="email" placeholder="contacto@empresa.co" style="padding:10px;border:1px solid #ddd;border-radius:8px;font-size:1rem;">' +
        '<div style="display:flex;gap:8px;margin-top:12px;">' +
          '<button id="samRegistrarBtn" style="flex:1;padding:12px;border:none;border-radius:8px;background:#2ecc71;color:#fff;cursor:pointer;font-size:1rem;">Registrar</button>' +
          '<button id="samCancelarBtn" style="flex:1;padding:12px;border:1px solid #ddd;border-radius:8px;background:#fff;cursor:pointer;font-size:1rem;">Cancelar</button>' +
        '</div>' +
      '</div>' +
      '<div id="samResultado" style="margin-top:16px;font-size:0.9rem;"></div>');

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    document.getElementById('samCancelarBtn').onclick = function () { overlay.remove(); };

    document.getElementById('samRegistrarBtn').onclick = async function () {
      var nombre = document.getElementById('samNombre').value.trim();
      var nit = document.getElementById('samNit').value.trim();
      var direccion = document.getElementById('samDireccion').value.trim();
      var telefono = document.getElementById('samTelefono').value.trim();
      var email = document.getElementById('samEmail').value.trim();
      var resultado = document.getElementById('samResultado');

      if (!nombre) { resultado.textContent = '⚠️ El nombre es obligatorio.'; resultado.style.color = '#e74c3c'; return; }

      // Verificar si ya existe una empresa con ese NIT
      if (nit && typeof CrozzoSuperAdminCentral !== 'undefined') {
        var busqueda = await CrozzoSuperAdminCentral.buscarNegocio(nit);
        if (busqueda.ok && busqueda.negocios && busqueda.negocios.length > 0) {
          var existente = busqueda.negocios[0];
          resultado.innerHTML = CrozzoSanitize.sanitizeHtml('<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:12px;">' +
            '<strong>⚠️ Empresa encontrada:</strong> ' + existente.nombre + '<br>' +
            '<span style="font-size:0.85rem;">NIT: ' + (existente.nit || 'N/A') + ' · ' + (existente.direccion || '') + '</span><br><br>' +
            '<strong>¿Qué deseas hacer?</strong><br>' +
            '<button onclick="window._samCrearSucursal(\'' + existente.id + '\')" style="margin:4px;padding:6px 12px;border:1px solid #ddd;border-radius:6px;cursor:pointer;">Crear sucursal</button>' +
            '<button onclick="window._samAccederNegocio(\'' + existente.id + '\')" style="margin:4px;padding:6px 12px;border:1px solid #ddd;border-radius:6px;cursor:pointer;">Acceder</button>' +
          '</div>');
          return;
        }
      }

      // Registrar nueva empresa
      if (typeof CrozzoSuperAdminCentral !== 'undefined') {
        var reg = await CrozzoSuperAdminCentral.registrarNegocio(nombre, nit, direccion, telefono, email);
        if (reg.ok) {
          resultado.innerHTML = CrozzoSanitize.sanitizeHtml('<div style="background:#d4edda;border:1px solid #28a745;border-radius:8px;padding:12px;">' +
            '<strong>✅ Empresa registrada:</strong> ' + nombre + '<br>' +
            '<span style="font-size:0.85rem;">ID: ' + reg.negocioId + '</span></div>');
        } else {
          resultado.textContent = '❌ Error al registrar: ' + (reg.error || 'desconocido');
          resultado.style.color = '#e74c3c';
        }
      } else {
        resultado.textContent = '❌ Módulo de super admin no disponible.';
        resultado.style.color = '#e74c3c';
      }
    };
  }

  // ── Formulario de acceso a empresa existente ─────────────────────
  function mostrarFormularioAcceso() {
    var overlay = document.createElement('div');
    overlay.id = MENU_ID;
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;';

    var card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:16px;padding:32px;max-width:520px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);';

    card.innerHTML = CrozzoSanitize.sanitizeHtml('<h2 style="margin:0 0 16px;font-size:1.3rem;color:#1a1a2e;">🔍 Acceder a empresa existente</h2>' +
      '<div style="display:flex;flex-direction:column;gap:12px;">' +
        '<label style="font-size:0.85rem;color:#555;">NIT o nombre de la empresa</label>' +
        '<input id="samBusqueda" type="text" placeholder="900123456 o Pepito Flores" style="padding:10px;border:1px solid #ddd;border-radius:8px;font-size:1rem;">' +
        '<div style="display:flex;gap:8px;margin-top:12px;">' +
          '<button id="samBuscarBtn" style="flex:1;padding:12px;border:none;border-radius:8px;background:#3498db;color:#fff;cursor:pointer;font-size:1rem;">Buscar</button>' +
          '<button id="samCancelarBtn2" style="flex:1;padding:12px;border:1px solid #ddd;border-radius:8px;background:#fff;cursor:pointer;font-size:1rem;">Cancelar</button>' +
        '</div>' +
      '</div>' +
      '<div id="samResultadoAcceso" style="margin-top:16px;font-size:0.9rem;"></div>');

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    document.getElementById('samCancelarBtn2').onclick = function () { overlay.remove(); };

    document.getElementById('samBuscarBtn').onclick = async function () {
      var query = document.getElementById('samBusqueda').value.trim();
      var resultado = document.getElementById('samResultadoAcceso');
      if (!query) { resultado.textContent = '⚠️ Ingresa un NIT o nombre.'; resultado.style.color = '#e74c3c'; return; }

      if (typeof CrozzoSuperAdminCentral !== 'undefined') {
        var busqueda = await CrozzoSuperAdminCentral.buscarNegocio(query);
        if (busqueda.ok && busqueda.negocios && busqueda.negocios.length > 0) {
          var html = '<div style="background:#d4edda;border:1px solid #28a745;border-radius:8px;padding:12px;">';
          busqueda.negocios.forEach(function (n) {
            html += '<div style="margin-bottom:8px;padding:8px;border-bottom:1px solid #ccc;">' +
              '<strong>' + n.nombre + '</strong><br>' +
              '<span style="font-size:0.85rem;">NIT: ' + (n.nit || 'N/A') + ' · ' + (n.direccion || '') + '</span><br>' +
              '<span style="font-size:0.8rem;color:#888;">Creada: ' + new Date(n.fecha_creacion).toLocaleDateString('es-CO') + '</span><br>' +
              '<button onclick="window._samAccederNegocio(\'' + n.id + '\')" style="margin:4px 0;padding:6px 12px;border:1px solid #ddd;border-radius:6px;cursor:pointer;font-size:0.85rem;">Acceder</button>' +
            '</div>';
          });
          html += '</div>';
          resultado.innerHTML = CrozzoSanitize.sanitizeHtml(html);
        } else {
          resultado.textContent = '❌ No se encontraron empresas con ese NIT o nombre.';
          resultado.style.color = '#e74c3c';
        }
      } else {
        resultado.textContent = '❌ Módulo de super admin no disponible.';
        resultado.style.color = '#e74c3c';
      }
    };
  }

  // ── Dashboard de negocios ───────────────────────────────────────
  function mostrarDashboard() {
    var overlay = document.createElement('div');
    overlay.id = MENU_ID;
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;';

    var card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:16px;padding:32px;max-width:600px;width:90%;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);';

    card.innerHTML = CrozzoSanitize.sanitizeHtml('<h2 style="margin:0 0 16px;font-size:1.3rem;color:#1a1a2e;">Dashboard de negocios</h2>' +
      '<div id="samDashboardContent" style="font-size:0.9rem;">Cargando...</div>' +
      '<button id="samCerrarDashboard" style="margin-top:16px;padding:10px 20px;border:1px solid #ddd;border-radius:8px;background:#fff;cursor:pointer;">Cerrar</button>');

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    document.getElementById('samCerrarDashboard').onclick = function () { overlay.remove(); };

    if (typeof CrozzoSuperAdminCentral !== 'undefined') {
      CrozzoSuperAdminCentral.listarNegocios().then(function (res) {
        var content = document.getElementById('samDashboardContent');
        if (res.ok && res.negocios && res.negocios.length > 0) {
          var html = '<p style="margin-bottom:12px;"><strong>' + res.negocios.length + ' negocios registrados</strong></p>';
          res.negocios.forEach(function (n) {
            var config = n.configuracion || {};
            var sucursales = config.sucursales || [];
            html += '<div style="border:1px solid #eee;border-radius:8px;padding:12px;margin-bottom:8px;">' +
              '<div style="display:flex;justify-content:space-between;align-items:center;">' +
                '<strong>' + n.nombre + '</strong>' +
                '<span style="font-size:0.75rem;padding:2px 8px;border-radius:4px;background:' + (n.activo ? '#d4edda' : '#f8d7da') + ';color:' + (n.activo ? '#155724' : '#721c24') + ';">' + (n.activo ? 'Activo' : 'Inactivo') + '</span>' +
              '</div>' +
              '<span style="font-size:0.85rem;color:#666;">NIT: ' + (n.nit || 'N/A') + ' · ' + (n.direccion || '') + '</span><br>' +
              '<span style="font-size:0.8rem;color:#888;">Creada: ' + new Date(n.fecha_creacion).toLocaleDateString('es-CO') + ' · Sucursales: ' + sucursales.length + '</span><br>' +
              '<div style="margin-top:8px;display:flex;gap:4px;">' +
                '<button onclick="window._samAccederNegocio(\'' + n.id + '\')" style="padding:4px 8px;border:1px solid #ddd;border-radius:4px;cursor:pointer;font-size:0.8rem;">Acceder</button>' +
                '<button onclick="window._samCrearSucursal(\'' + n.id + '\')" style="padding:4px 8px;border:1px solid #ddd;border-radius:4px;cursor:pointer;font-size:0.8rem;">+ Sucursal</button>' +
              '</div>' +
            '</div>';
          });
          content.innerHTML = CrozzoSanitize.sanitizeHtml(html);
        } else {
          content.innerHTML = CrozzoSanitize.sanitizeHtml('<p style="color:#888;">No hay negocios registrados aún.</p>');
        }
      });
    } else {
      document.getElementById('samDashboardContent').textContent = '❌ Módulo no disponible.';
    }
  }

  // ── Funciones globales para botones inline ───────────────────────
  global._samCrearSucursal = function (negocioId) {
    // Modal amigable para crear sucursal (reemplaza prompt())
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;';

    var card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:16px;padding:32px;max-width:480px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);';

    card.innerHTML = CrozzoSanitize.sanitizeHtml('<h3 style="margin:0 0 16px;font-size:1.2rem;color:#1a1a2e;">Crear sucursal</h3>' +
      '<div style="display:flex;flex-direction:column;gap:12px;">' +
        '<label style="font-size:0.85rem;color:#555;">Nombre de la sucursal</label>' +
        '<input id="scNombre" type="text" placeholder="Pepito Flores - Cerritos" style="padding:10px;border:1px solid #ddd;border-radius:8px;font-size:1rem;">' +
        '<label style="font-size:0.85rem;color:#555;">Ubicación</label>' +
        '<input id="scUbicacion" type="text" placeholder="Cerritos, Centro, etc." style="padding:10px;border:1px solid #ddd;border-radius:8px;font-size:1rem;">' +
        '<label style="font-size:0.85rem;color:#555;">Copiar configuración de otra sucursal</label>' +
        '<select id="scCopiar" style="padding:10px;border:1px solid #ddd;border-radius:8px;font-size:1rem;">' +
          '<option value="">No copiar (en blanco)</option>' +
        '</select>' +
        '<div style="display:flex;gap:8px;margin-top:12px;">' +
          '<button id="scCrearBtn" style="flex:1;padding:12px;border:none;border-radius:8px;background:#2ecc71;color:#fff;cursor:pointer;font-size:1rem;">Crear</button>' +
          '<button id="scCancelarBtn" style="flex:1;padding:12px;border:1px solid #ddd;border-radius:8px;background:#fff;cursor:pointer;font-size:1rem;">Cancelar</button>' +
        '</div>' +
      '</div>' +
      '<div id="scResultado" style="margin-top:12px;font-size:0.9rem;"></div>');

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    document.getElementById('scCancelarBtn').onclick = function () { overlay.remove(); };

    document.getElementById('scCrearBtn').onclick = async function () {
      var nombre = document.getElementById('scNombre').value.trim();
      var ubicacion = document.getElementById('scUbicacion').value.trim();
      var copiarDeId = document.getElementById('scCopiar').value || null;
      var resultado = document.getElementById('scResultado');

      if (!nombre) { resultado.textContent = '⚠️ El nombre es obligatorio.'; resultado.style.color = '#e74c3c'; return; }

      if (typeof CrozzoSuperAdminCentral !== 'undefined') {
        var res = await CrozzoSuperAdminCentral.crearSucursal(negocioId, nombre, ubicacion, copiarDeId);
        if (res.ok) {
          resultado.innerHTML = CrozzoSanitize.sanitizeHtml('<div style="background:#d4edda;border:1px solid #28a745;border-radius:8px;padding:12px;">' +
            '<strong>✅ Sucursal creada:</strong> ' + nombre + '<br>' +
            '<span style="font-size:0.85rem;">' + (copiarDeId ? 'Configuración copiada de la sucursal origen' : 'Configuración en blanco') + '</span></div>');
        } else {
          resultado.textContent = '❌ Error: ' + (res.error || 'desconocido');
          resultado.style.color = '#e74c3c';
        }
      }
    };
  };

  global._samAccederNegocio = function (negocioId) {
    if (typeof CrozzoSuperAdminCentral !== 'undefined') {
      CrozzoSuperAdminCentral.cargarConfiguracion(negocioId).then(function (res) {
        if (res.ok) {
          alert('✅ Configuración cargada para negocio: ' + negocioId);
          // Aplicar configuración localmente
          if (res.configuracion && typeof config !== 'undefined') {
            try { config.set('empresa', res.configuracion.empresa || {}); } catch (_) {}
            try { config.set('mesas', res.configuracion.mesas || {}); } catch (_) {}
            try { config.set('usuarios', res.configuracion.usuarios || {}); } catch (_) {}
          }
        } else {
          alert('❌ Error: ' + (res.error || 'desconocido'));
        }
      });
    }
  };

  // ── API pública ─────────────────────────────────────────────────
  global.crozzoShowSuperAdminMenu = crearMenu;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));