/**
 * Crozzo — Acompañante operativo (integra PerfilesLogica + Psyche + flujos POS).
 * El sistema entiende el rol y adapta guía, bloqueos amables y comodidad por pantalla.
 */
(function (global) {
  'use strict';

  var RAIL_HOST_ID = 'crozzoCompanionRailHost';
  var SS_RAIL_OFF = 'crozzo_companion_rail_off';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getUser() {
    try {
      return typeof global.getCurrentUser === 'function' ? global.getCurrentUser() : null;
    } catch (_) {
      return null;
    }
  }

  function getRol() {
    var u = getUser();
    if (!u) return '';
    if (typeof global.crozzoNormalizeAppRol === 'function') return global.crozzoNormalizeAppRol(u.rol);
    return String(u.rol || '').toLowerCase();
  }

  function getLogica() {
    return global.CrozzoPerfilesLogica || null;
  }

  function profileMeta() {
    var L = getLogica();
    if (L && L.crozzoOperativeProfileMeta) return L.crozzoOperativeProfileMeta(getRol());
    return { id: getRol(), label: getRol(), tagline: '' };
  }

  /** Guías por rol + pantalla (comodidad contextual). */
  var PAGE_GUIDES = {
    caja: {
      cajero: {
        title: 'Caja con respaldo',
        hint: 'Cobre tranquilo — validamos antes de cerrar. Unir/dividir cuenta sí; no comande mesas del mesero.',
        steps: ['Elija mesa o llevar', 'Revise el pedido', 'Cobro (efectivo, tarjeta, mixto)', 'Factura si aplica'],
      },
      'inicio-operacion': {
        title: 'Inicio de ventas',
        hint: 'Desde aquí abre POS o cierre cuando le toque.',
        steps: ['Punto de venta → cobrar', 'Facturas del turno', 'Cierre de caja al final'],
      },
      'cierre-caja': {
        title: 'Cierre de turno',
        hint: 'Cuente con calma — el arqueo queda registrado.',
        steps: ['Revise totales', 'Cuente efectivo', 'Confirme cierre'],
      },
      'centro-compras': {
        title: 'Cargar compras',
        hint: 'Suba la factura del proveedor — el encargado o bodega la revisará después.',
        steps: ['Escanee o adjunte PDF', 'Verifique proveedor', 'Guarde'],
      },
      'compras-recetario-cocina': {
        title: 'Recetas',
        hint: 'Consulte o cree recetas para orientar al cliente o a cocina.',
        steps: ['Busque producto', 'Vea ingredientes', 'Guarde cambios si tiene permiso'],
      },
    },
    mesero: {
      tablets: {
        title: 'Su mesa, su ritmo',
        hint: 'Antes de «Comandar» puede cambiar todo. Después, cocina toma el control — pida al encargado si hay error.',
        steps: ['Toque productos', 'Notas y cantidades', 'Comandar a cocina', 'Precuenta si piden'],
      },
    },
    cocina: {
      comandas: {
        title: 'Producción en vivo',
        hint: 'Marque LISTO cuando termine — el mesero y la caja reciben el aviso. Reimprima si hace falta.',
        steps: ['Lea el ticket', 'Prepare (receta a mano)', 'LISTO → despacho', 'Reimprimir opcional'],
      },
      cocina: {
        title: 'Su área',
        hint: 'Cocina, bar, fríos o panadería — solo marque listo, no edite el pedido del mesero.',
        steps: ['Ver pendientes', 'Preparar', 'LISTO'],
      },
      'compras-recetario-cocina': {
        title: 'Receta de preparación',
        hint: 'Aquí está el «cómo se hace» — sin salir de su flujo.',
        steps: ['Abra la receta', 'Siga pasos', 'Vuelva a comandas'],
      },
    },
    encargado: {
      cajero: {
        title: 'Supervisión de caja',
        hint: 'Puede corregir cuentas, anular comandado y liberar mesas.',
        steps: ['Detecte error', 'Anule ítem o cuenta', 'Informe al equipo'],
      },
      tablets: {
        title: 'Sala y tablets',
        hint: 'Apoye al mesero o tome una mesa usted mismo si hace falta.',
        steps: ['Revise ocupación', 'Coordine con cocina', 'Corrija si hay error'],
      },
      'centro-compras': {
        title: 'Revisar compras',
        hint: 'El cajero carga — usted valida y cierra el ciclo.',
        steps: ['Facturas pendientes', 'Conciliar', 'Aprobar o devolver'],
      },
    },
    inventario: {
      'centro-compras': {
        title: 'GF Compras',
        hint: 'Revise lo cargado, concilie proveedores y stock.',
        steps: ['Bandeja de facturas', 'Recepción', 'Reportes'],
      },
      inventarios: {
        title: 'Inventario',
        hint: 'Cada movimiento queda trazado.',
        steps: ['Existencias', 'Ajustes autorizados', 'Exportar si necesita'],
      },
    },
    admin: {
      admin: {
        title: 'Administración',
        hint: 'Configure una vez — el equipo opera con comodidad.',
        steps: ['Usuarios y roles', 'Salón e impuestos', 'Auditoría'],
      },
    },
  };

  var DENY_MESSAGES = {
    modificar_post_comandar: {
      mesero: 'Este plato ya está en cocina. Si hay un error, avise al encargado — no hace falta tocar nada raro.',
      caja: 'Ya comandado a cocina. Para quitarlo necesita permiso de encargado.',
      default: 'No puede modificar lo ya enviado a producción.',
    },
    comandar_mesa_ocupada: {
      caja: 'Esta mesa la está atendiendo {who}. Usted puede cobrar cuando esté listo — no agregue pedidos nuevos aquí.',
      default: '{who} está en esta mesa — coordine antes de comandar.',
    },
    eliminar_mesa: {
      caja: 'Solo el encargado puede liberar una mesa con consumo. Cobré primero o avise al encargado.',
      mesero: 'No puede vaciar la mesa — pida al encargado o cobre en caja.',
      default: 'Esta acción la realiza el encargado o administrador.',
    },
    configurar: {
      default: 'La configuración la maneja el administrador del local.',
    },
  };

  function guideFor(page) {
    var r = getRol();
    var byRole = PAGE_GUIDES[r] || PAGE_GUIDES.user || {};
    return byRole[page] || byRole[global.currentPage] || null;
  }

  function denyMessage(action, vars) {
    vars = vars || {};
    var r = getRol();
    var bag = DENY_MESSAGES[action] || {};
    var msg = bag[r] || bag.default || 'Esta acción no corresponde a su rol en este momento.';
    msg = msg.replace(/\{who\}/g, String(vars.who || 'otro operador').trim());
    return msg;
  }

  function companionRoleLine() {
    var meta = profileMeta();
    if (meta && meta.tagline) return meta.tagline;
    return '';
  }

  function companionRoleTip() {
    var L = getLogica();
    if (!L || !L.crozzoOperativeSequence) return '';
    var seq = L.crozzoOperativeSequence(getRol());
    return seq && seq.length ? 'Paso sugerido: ' + seq[0] : '';
  }

  function railEnabled() {
    try {
      if (sessionStorage.getItem(SS_RAIL_OFF) === '1') return false;
    } catch (_) {}
    if (!getUser()) return false;
    try {
      if (global.CrozzoOperativePsyche && global.CrozzoOperativePsyche.shouldApplyComfortUx) {
        return global.CrozzoOperativePsyche.shouldApplyComfortUx() || global.CrozzoOperativePsyche.shouldApplyHumanLayer();
      }
    } catch (_) {}
    return true;
  }

  function ensureRailHost() {
    var main = global.document.getElementById('mainContent');
    if (!main) return null;
    var host = global.document.getElementById(RAIL_HOST_ID);
    if (host) return host;
    host = global.document.createElement('div');
    host.id = RAIL_HOST_ID;
    host.className = 'crozzo-companion-rail-host';
    if (main.firstChild) main.insertBefore(host, main.firstChild);
    else main.appendChild(host);
    return host;
  }

  /** P0 operativo + hub post-login: sin banner de guía — el foco es elegir o cobrar. */
  var P0_SILENT_PAGES = {
    cajero: 1,
    tablets: 1,
    comandas: 1,
    cocina: 1,
    mesas: 1,
    'venta-comercial': 1,
    'inicio-operacion': 1,
  };

  function clearRailHost() {
    var h = global.document.getElementById(RAIL_HOST_ID);
    if (h) h.innerHTML = '';
  }

  function renderRail(page) {
    if (!railEnabled()) {
      clearRailHost();
      return;
    }
    page = page || global.currentPage || '';
    if (P0_SILENT_PAGES[page]) {
      clearRailHost();
      return;
    }
    var guide = guideFor(page);
    var meta = profileMeta();
    if (!guide && !meta.tagline) return;
    var host = ensureRailHost();
    if (!host) return;
    var stepsHtml = '';
    if (guide && guide.steps && guide.steps.length) {
      stepsHtml =
        '<ul class="crozzo-companion-rail__steps">' +
        guide.steps
          .map(function (s, i) {
            return '<li><span>' + (i + 1) + '</span>' + esc(s) + '</li>';
          })
          .join('') +
        '</ul>';
    }
    host.innerHTML =
      '<aside class="crozzo-companion-rail" role="status" aria-live="polite">' +
      '<div class="crozzo-companion-rail__glow" aria-hidden="true"></div>' +
      '<div class="crozzo-companion-rail__main">' +
      '<span class="crozzo-companion-rail__badge">' +
      esc(meta.label || getRol()) +
      '</span>' +
      '<p class="crozzo-companion-rail__title">' +
      esc((guide && guide.title) || 'Modo operativo') +
      '</p>' +
      '<p class="crozzo-companion-rail__hint">' +
      esc((guide && guide.hint) || meta.tagline) +
      '</p>' +
      stepsHtml +
      '</div>' +
      '<button type="button" class="crozzo-companion-rail__close" title="Ocultar guía de esta sesión" aria-label="Ocultar guía">×</button>' +
      '</aside>';
    var closeBtn = host.querySelector('.crozzo-companion-rail__close');
    if (closeBtn && !closeBtn._bound) {
      closeBtn._bound = true;
      closeBtn.addEventListener('click', function () {
        try {
          sessionStorage.setItem(SS_RAIL_OFF, '1');
        } catch (_) {}
        host.innerHTML = '';
      });
    }
  }

  /** Bloqueo amable: cajero no comanda sobre mesa del mesero. */
  function guardComandar(tipoServicio, referencia) {
    var r = getRol();
    if (r !== 'caja' && r !== 'mesero') return { ok: true };
    if (typeof global.crozzoSlotLockPeerInfo !== 'function') return { ok: true };
    var peer = global.crozzoSlotLockPeerInfo(tipoServicio, referencia);
    if (!peer || peer.mine) return { ok: true };
    var who = String(peer.userName || '').trim() || 'otro operador';
    if (r === 'caja' && peer.pageKind === 'tablet') {
      return {
        ok: false,
        block: true,
        who: who,
        message: denyMessage('comandar_mesa_ocupada', { who: who }),
      };
    }
    return { ok: true, warn: denyMessage('comandar_mesa_ocupada', { who: who }) };
  }

  function onSlotEnter(tipoServicio, referencia) {
    if (typeof global.crozzoSlotLockPeerInfo !== 'function') return { ok: true };
    var peer = global.crozzoSlotLockPeerInfo(tipoServicio, referencia);
    if (!peer || peer.mine) return { ok: true };
    var g = guardComandar(tipoServicio, referencia);
    if (g.block) {
      if (typeof global.crozzoOperativeCompanionNotifyDenied === 'function') {
        global.crozzoOperativeCompanionNotifyDenied('comandar_mesa_ocupada', { who: g.who, level: 'warning' });
      } else if (g.message && typeof global.showToast === 'function') {
        global.showToast(g.message, 'warning');
      }
      return g;
    }
    if (g.warn && g.message && typeof global.showToast === 'function') {
      global.showToast(g.message, 'info');
      return g;
    }
    var who = String(peer.userName || '').trim() || 'otro operador';
    var dev = String(peer.deviceName || '').trim() || 'otro dispositivo';
    var slotLabel = tipoServicio === 'mesa' ? 'mesa' : 'pedido llevar';
    var extra = Number(peer.count || 0) > 1 ? ' (+' + (Number(peer.count) - 1) + ' más)' : '';
    if (typeof global.showToast === 'function') {
      global.showToast(
        'Atención: ' + who + ' también está en esta ' + slotLabel + ' (' + dev + ')' + extra + '.',
        'warning'
      );
    }
    return { ok: true, peer: peer };
  }

  function notifyDenied(action, opts) {
    opts = opts || {};
    if (typeof global.showToast !== 'function') return;
    var msg =
      typeof global.crozzoOperativeCompanionDenyMsg === 'function'
        ? global.crozzoOperativeCompanionDenyMsg(action, opts)
        : denyMessage(action, opts);
    if (global.CrozzoOperativePsyche && typeof global.CrozzoOperativePsyche.humanizeToastMessage === 'function') {
      msg = global.CrozzoOperativePsyche.humanizeToastMessage(msg);
    }
    global.showToast(msg, opts.level || 'warning');
    if (global.CrozzoOperativePsyche && typeof global.CrozzoOperativePsyche.maybeAffirm === 'function') {
      if (action === 'modificar_post_comandar') global.CrozzoOperativePsyche.maybeAffirm('post_comandar_blocked');
    }
  }

  function onPage(page) {
    renderRail(page);
    try {
      global.dispatchEvent(new CustomEvent('crozzo-companion-page', { detail: { page: page, role: getRol() } }));
    } catch (_) {}
  }

  function afterLogin() {
    try {
      sessionStorage.removeItem(SS_RAIL_OFF);
    } catch (_) {}
    global.setTimeout(function () {
      onPage(global.currentPage);
    }, 400);
  }

  function init() {
    if (global.__crozzoCompanionBound) return;
    global.__crozzoCompanionBound = true;
    global.addEventListener('crozzo:auth-ready', function () {
      afterLogin();
    });
    global.addEventListener('crozzo-companion-refresh', function () {
      onPage(global.currentPage);
    });
    global.addEventListener('crozzo:theme-change', function () {
      onPage(global.currentPage);
    });
  }

  global.crozzoCompanionOnPage = onPage;
  global.crozzoCompanionRoleLine = companionRoleLine;
  global.crozzoCompanionRoleTip = companionRoleTip;
  global.crozzoOperativeCompanionDenyMsg = denyMessage;
  global.crozzoOperativeCompanionOnSlotEnter = onSlotEnter;
  global.crozzoOperativeCompanionGuardComandar = guardComandar;
  global.crozzoOperativeCompanionNotifyDenied = notifyDenied;

  global.CrozzoOperativeCompanion = {
    init: init,
    onPage: onPage,
    renderRail: renderRail,
    guardComandar: guardComandar,
    onSlotEnter: onSlotEnter,
    denyMessage: denyMessage,
    notifyDenied: notifyDenied,
    companionRoleLine: companionRoleLine,
    companionRoleTip: companionRoleTip,
    guideFor: guideFor,
    profileMeta: profileMeta,
  };

  init();
})(typeof window !== 'undefined' ? window : globalThis);
