/**
 * CrozzoContextualHelp — Ayuda contextual (tooltips) activable por el usuario.
 *
 * Deshabilitado por defecto. Se activa desde el panel de accesibilidad.
 * Cuando está activo, muestra descripciones de botones/elementos al pasar el mouse.
 *
 * Preferencia guardada en localStorage: 'crozzo_contextual_help' (true/false)
 */
(function (global) {
  'use strict';

  var HELP_LS_KEY = 'crozzo_contextual_help';
  var _active = false;
  var _tooltipEl = null;

  // ── Descripciones de elementos clave ─────────────────────────────
  var HELP_MAP = {
    // Navegación principal
    'nav-toggle-operacion': 'Abre/cierra el menú de operación (ventas, mesas, comandas)',
    'nav-toggle-procesos': 'Abre/cierra preparaciones de cocina (recetas, procesos)',
    'nav-toggle-gestion': 'Abre/cierra gestión (facturas, cierre de caja, clientes)',
    'nav-toggle-costos': 'Abre/cierra costos (márgenes, inventario continuo, planilla)',
    'nav-toggle-administrativo': 'Abre/cierra administrativo (oficina, pagos, planillas)',
    'nav-toggle-compras': 'Abre/cierra compras (proveedores, recepción, órdenes)',
    'nav-toggle-configuracion': 'Abre/cierra configuración (empresa, impuestos, usuarios, etc.)',
    'nav-toggle-super-admin': 'Abre/cierra menú de Super Admin (solo KENNY)',

    // Botones principales
    'userMenuTrigger': 'Menú de usuario: ver perfil, cambiar contraseña, cerrar sesión',
    'crozzoA11yTrigger': 'Panel de accesibilidad: tamaño de fuente, contraste, ayuda contextual',
    'crozzoQuickAppsFabMain': 'Apps rápidas: accesos directos a funciones frecuentes',

    // Páginas clave
    'cajero': 'Punto de venta: vender, cobrar, gestionar mesas y cuentas',
    'facturas': 'Ver y gestionar facturas emitidas',
    'cierre-caja': 'Cerrar caja: arqueo de efectivo y cierre de turno',
    'comandas': 'Ver comandas activas y su estado',
    'cocina': 'Pantalla de cocina (KDS): ver y despachar comandas',
    'inventarios': 'Reportes y dashboard de inventario',
    'config-usuarios': 'Gestión de usuarios y permisos del sistema',
    'config-empresa': 'Configuración de datos de la empresa (NIT, dirección, etc.)',
    'config-impuestos': 'Configuración de impuestos (IVA, INC, etc.)',
    'auditoria': 'Registro de auditoría: ver todas las acciones del sistema',
  };

  // ── Cargar preferencia ───────────────────────────────────────────
  function isEnabled() {
    try {
      var raw = localStorage.getItem(HELP_LS_KEY);
      if (raw !== null) return raw === 'true';
    } catch (_) {}
    return false; // deshabilitado por defecto
  }

  function setEnabled(enabled) {
    try { localStorage.setItem(HELP_LS_KEY, enabled ? 'true' : 'false'); } catch (_) {}
    _active = !!enabled;
    // Sincronizar toggle si existe
    var toggle = document.getElementById('contextualHelpToggle');
    if (toggle) toggle.checked = _active;
    if (_active) {
      activar();
    } else {
      desactivar();
    }
  }

  // ── Crear tooltip ────────────────────────────────────────────────
  function crearTooltip() {
    if (_tooltipEl) return _tooltipEl;
    var el = document.createElement('div');
    el.id = 'crozzoContextualTooltip';
    el.style.cssText = 'position:fixed;z-index:999999;background:rgba(30,30,40,0.95);color:#fff;padding:8px 12px;border-radius:8px;font-size:0.85rem;max-width:280px;pointer-events:none;opacity:0;transition:opacity 0.15s;box-shadow:0 4px 12px rgba(0,0,0,0.3);line-height:1.4;';
    document.body.appendChild(el);
    _tooltipEl = el;
    return el;
  }

  function mostrarTooltip(text, target) {
    var tip = crearTooltip();
    tip.textContent = text;
    var rect = target.getBoundingClientRect();
    tip.style.left = Math.min(rect.left, window.innerWidth - 300) + 'px';
    tip.style.top = (rect.bottom + 8) + 'px';
    tip.style.opacity = '1';
  }

  function ocultarTooltip() {
    if (_tooltipEl) _tooltipEl.style.opacity = '0';
  }

  // ── Activar/desactivar ───────────────────────────────────────────
  function activar() {
    document.body.classList.add('crozzo-contextual-help-active');
    document.addEventListener('mouseover', onMouseOver, true);
    document.addEventListener('mouseout', onMouseOut, true);
  }

  function desactivar() {
    document.body.classList.remove('crozzo-contextual-help-active');
    document.removeEventListener('mouseover', onMouseOver, true);
    document.removeEventListener('mouseout', onMouseOut, true);
    ocultarTooltip();
  }

  function onMouseOver(e) {
    if (!_active) return;
    var target = e.target;
    // Buscar el elemento más cercano con data-help o en HELP_MAP
    var el = target;
    var helpText = null;
    var attempts = 0;
    while (el && el !== document.body && attempts < 5) {
      if (el.getAttribute && el.getAttribute('data-help')) {
        helpText = el.getAttribute('data-help');
        break;
      }
      if (el.id && HELP_MAP[el.id]) {
        helpText = HELP_MAP[el.id];
        break;
      }
      if (el.getAttribute && el.getAttribute('data-page') && HELP_MAP[el.getAttribute('data-page')]) {
        helpText = HELP_MAP[el.getAttribute('data-page')];
        break;
      }
      if (el.getAttribute && el.getAttribute('title')) {
        helpText = el.getAttribute('title');
        break;
      }
      el = el.parentElement;
      attempts++;
    }
    if (helpText) {
      mostrarTooltip(helpText, target);
    }
  }

  function onMouseOut() {
    ocultarTooltip();
  }

  // ── Integración con panel A11y ───────────────────────────────────
  function inyectarToggleEnPanel() {
    var panel = document.getElementById('crozzoA11yPanel');
    if (!panel) return;
    if (document.getElementById('contextualHelpToggle')) return; // ya inyectado

    // Buscar la sección de toggles
    var toggles = panel.querySelectorAll('.a11y-toggle, [class*="toggle"]');
    var container = toggles.length ? toggles[toggles.length - 1].parentElement : null;
    if (!container) {
      // Buscar cualquier contenedor de opciones
      var sections = panel.querySelectorAll('div, section');
      for (var i = sections.length - 1; i >= 0; i--) {
        if (sections[i].querySelector('input[type="checkbox"]')) {
          container = sections[i].parentElement;
          break;
        }
      }
    }
    if (!container) return;

    var wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:8px;padding:8px 0;border-top:1px solid #eee;';
    wrapper.innerHTML = CrozzoSanitize.sanitizeHtml('<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:0.85rem;">' +
      '<input type="checkbox" id="contextualHelpToggle" ' + (_active ? 'checked' : '') + '> ' +
      '💡 Ayuda contextual (tooltips)' +
      '</label>' +
      '<span style="font-size:0.75rem;color:#888;">Muestra descripciones al pasar el mouse</span>');

    container.appendChild(wrapper);

    document.getElementById('contextualHelpToggle').addEventListener('change', function (e) {
      setEnabled(e.target.checked);
    });
  }

  // ── Inicialización ───────────────────────────────────────────────
  function init() {
    _active = isEnabled();
    if (_active) {
      // Esperar a que el DOM esté listo
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', activar, { once: true });
      } else {
        setTimeout(activar, 500);
      }
    }
    // Inyectar toggle en panel A11y cuando esté disponible
    var attempts = 0;
    var interval = setInterval(function () {
      inyectarToggleEnPanel();
      attempts++;
      if (attempts > 20) clearInterval(interval);
    }, 1000);
  }

  // ── API pública ─────────────────────────────────────────────────
  global.CrozzoContextualHelp = {
    isEnabled: isEnabled,
    setEnabled: setEnabled,
    activar: activar,
    desactivar: desactivar,
    HELP_MAP: HELP_MAP,
  };

  // Iniciar
  if (typeof document !== 'undefined') {
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      setTimeout(init, 1000);
    } else {
      document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 1000); }, { once: true });
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
