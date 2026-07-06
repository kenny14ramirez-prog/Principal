/**
 * Crozzo — Perfiles de lógica operativa (quién hace qué y en qué orden).
 * Un escaneo de rol → secuencia clara + reglas post-comanda / mesa / compras.
 * Complementa CrozzoPermisosPolicy (delegación) y CROZZO_STAFF_PLANTILLAS (defaults).
 */
(function (global) {
  'use strict';

  var ROLE_ALIASES = {
    cajero: 'caja',
    caja: 'caja',
    mesero: 'mesero',
    cocina: 'cocina',
    despacho: 'cocina',
    bar: 'cocina',
    panaderia: 'cocina',
    frios: 'cocina',
    encargado: 'encargado',
    gf_compras: 'inventario',
    inventario: 'inventario',
    'jefe-compras': 'inventario',
    jefe_compras: 'inventario',
    admin: 'admin',
    administrador: 'admin',
    superadmin: 'superadmin',
    super_admin: 'superadmin',
  };

  /**
   * Perfiles operativos: secuencia humana + reglas duras (más allá del menú).
   * actions: clave → { allow: bool en rol base; perm?: sub permiso; comandas?: sub; inventario?: sub }
   */
  var OPERATIVE_PROFILES = {
    caja: {
      id: 'caja',
      label: 'Cajero / POS',
      tagline: 'Cobra, une/divide cuentas y carga compras — no borra lo ya comandado.',
      sequence: [
        'Abrir mesa o pedido llevar en caja',
        'Cobrar, facturar y cerrar turno',
        'Unir o dividir cuentas (sin eliminar mesas)',
        'Cargar facturas de proveedor al sistema',
        'Consultar recetas para orientar al cliente',
      ],
      cannot: [
        'Eliminar mesas con consumo',
        'Modificar ítems ya comandados a cocina',
        'Marcar LISTO en comandas (eso es cocina)',
        'Configurar el negocio',
      ],
      actions: {
        cobrar: { allow: true, perm: 'facturar' },
        unir_dividir: { allow: true, perm: ['unir_cuenta', 'dividir_cuenta'] },
        editar_pre_comandar: { allow: true, perm: ['editar_orden', 'eliminar_item'] },
        modificar_post_comandar: { allow: false },
        eliminar_cuenta: { allow: false },
        eliminar_mesa: { allow: false },
        comandar: { allow: true, perm: ['abrir_orden', 'editar_orden'] },
        marcar_listo: { allow: false },
        ver_recetas: { allow: true, productos: 'catalogo' },
        crear_receta: { allow: true, productos: 'catalogo' },
        cargar_factura_compra: { allow: true, inventario: 'proveedores' },
        revisar_factura_compra: { allow: false },
        configurar: { allow: false },
      },
    },
    mesero: {
      id: 'mesero',
      label: 'Mesero / Vendedor',
      tagline: 'Toma el pedido en tablet — antes de comandar todo; después, bloqueo total.',
      sequence: [
        'Atender al cliente en sala o mostrador',
        'Armar pedido en tablet (agregar, cantidades, notas)',
        'Comandar a cocina / despacho (botón Comandar)',
        'Precuenta si el cliente la pide',
        '→ Tras comandar: solo lectura hasta que intervenga encargado',
      ],
      cannot: [
        'Quitar o cambiar ítems ya comandados',
        'Cobrar en caja principal',
        'Eliminar mesas o cuentas',
        'Marcar LISTO en cocina',
      ],
      actions: {
        cobrar: { allow: false },
        unir_dividir: { allow: false },
        editar_pre_comandar: { allow: true, perm: ['tab_abrir', 'tab_editar', 'tab_eliminar'], context: 'tablet' },
        modificar_post_comandar: { allow: false },
        eliminar_cuenta: { allow: false },
        eliminar_mesa: { allow: false },
        comandar: { allow: true, perm: ['tab_abrir', 'tab_editar'], context: 'tablet' },
        marcar_listo: { allow: false },
        ver_recetas: { allow: false },
        crear_receta: { allow: false },
        cargar_factura_compra: { allow: false },
        revisar_factura_compra: { allow: false },
        configurar: { allow: false },
      },
    },
    cocina: {
      id: 'cocina',
      label: 'Cocina / Despacho / Bar',
      tagline: 'Recibe comandas, prepara con receta, marca LISTO — no toca el pedido del mesero.',
      sequence: [
        'Ver comandas del área (cocina, bar, fríos, panadería…)',
        'Abrir receta / subreceta de preparación',
        'Preparar y marcar LISTO (despacho a mesa o mostrador)',
        'Reimprimir ticket si hace falta',
      ],
      cannot: [
        'Editar el pedido del mesero',
        'Cobrar o abrir caja',
        'Eliminar mesas o anular comandado',
      ],
      actions: {
        cobrar: { allow: false },
        unir_dividir: { allow: false },
        editar_pre_comandar: { allow: false },
        modificar_post_comandar: { allow: false },
        eliminar_cuenta: { allow: false },
        eliminar_mesa: { allow: false },
        comandar: { allow: false },
        marcar_listo: { allow: true, comandas: 'despachar' },
        ver_recetas: { allow: true, productos: 'catalogo' },
        crear_receta: { allow: true, productos: 'catalogo' },
        cargar_factura_compra: { allow: false },
        revisar_factura_compra: { allow: false },
        configurar: { allow: false },
      },
    },
    encargado: {
      id: 'encargado',
      label: 'Encargado de turno',
      tagline: 'Supervisa, corrige cuentas mal hechas y va más allá del cajero.',
      sequence: [
        'Supervisar sala, caja y tablets',
        'Corregir cuenta: anular ítems ya comandados',
        'Eliminar o liberar mesas / cuentas problemáticas',
        'Unir, dividir y autorizar descuentos',
        'Revisar facturas de compra cargadas por caja',
      ],
      cannot: ['Cambiar configuración global del negocio (solo admin)'],
      actions: {
        cobrar: { allow: true, perm: 'facturar' },
        unir_dividir: { allow: true, perm: ['unir_cuenta', 'dividir_cuenta'] },
        editar_pre_comandar: { allow: true, perm: ['editar_orden', 'tab_editar'] },
        modificar_post_comandar: { allow: true, perm: 'anular_comandado' },
        eliminar_cuenta: { allow: true, perm: 'anular_comandado' },
        eliminar_mesa: { allow: true, perm: 'anular_comandado' },
        comandar: { allow: true, perm: ['abrir_orden', 'tab_abrir'] },
        marcar_listo: { allow: true, comandas: 'despachar' },
        ver_recetas: { allow: true, productos: 'catalogo' },
        crear_receta: { allow: true, productos: 'catalogo' },
        cargar_factura_compra: { allow: true, inventario: 'proveedores' },
        revisar_factura_compra: { allow: true, inventario: 'proveedores' },
        configurar: { allow: false },
      },
    },
    inventario: {
      id: 'inventario',
      label: 'GF Compras / Bodega',
      tagline: 'Facturas, proveedores, costos — el cajero carga, esta persona revisa y cierra.',
      sequence: [
        'Revisar facturas cargadas por caja',
        'Registrar y conciliar compras / proveedores',
        'Inventarios, costos y recetas de materia prima',
        'Reportes de stock',
      ],
      cannot: ['Cobrar en POS', 'Comandar pedidos de sala'],
      actions: {
        cobrar: { allow: false },
        unir_dividir: { allow: false },
        editar_pre_comandar: { allow: false },
        modificar_post_comandar: { allow: false },
        eliminar_cuenta: { allow: false },
        eliminar_mesa: { allow: false },
        comandar: { allow: false },
        marcar_listo: { allow: false },
        ver_recetas: { allow: true, productos: 'catalogo' },
        crear_receta: { allow: true, productos: 'catalogo' },
        cargar_factura_compra: { allow: true, inventario: 'proveedores' },
        revisar_factura_compra: { allow: true, inventario: ['proveedores', 'reportes'] },
        configurar: { allow: false },
      },
    },
    admin: {
      id: 'admin',
      label: 'Administrador del negocio',
      tagline: 'Ve y configura todo el local — usuarios, impuestos, salón, conexiones.',
      sequence: [
        'Configurar empresa, impuestos y salón',
        'Usuarios, permisos y políticas',
        'Auditoría y reportes',
        'Operación completa cuando hace falta',
      ],
      cannot: ['Herramientas de plataforma Crozzo (Super Admin)'],
      actions: {
        cobrar: { allow: true, perm: 'facturar' },
        unir_dividir: { allow: true, perm: ['unir_cuenta', 'dividir_cuenta'] },
        editar_pre_comandar: { allow: true, perm: ['editar_orden', 'tab_editar'] },
        modificar_post_comandar: { allow: true, perm: 'anular_comandado' },
        eliminar_cuenta: { allow: true, perm: 'anular_comandado' },
        eliminar_mesa: { allow: true, perm: 'anular_comandado' },
        comandar: { allow: true },
        marcar_listo: { allow: true, comandas: 'despachar' },
        ver_recetas: { allow: true, productos: 'catalogo' },
        crear_receta: { allow: true, productos: 'catalogo' },
        cargar_factura_compra: { allow: true, inventario: 'proveedores' },
        revisar_factura_compra: { allow: true, inventario: 'proveedores' },
        configurar: { allow: true, admin: 'config_usuarios' },
      },
    },
    superadmin: {
      id: 'superadmin',
      label: 'Super Administrador (plataforma)',
      tagline: 'Solo Crozzo / KENNY — no visible en plan básico del cliente.',
      sequence: ['Plataforma, nube, diagnóstico global'],
      cannot: [],
      actions: { all: { allow: true } },
    },
  };

  function normalizeRol(rol) {
    var r = String(rol || 'caja').toLowerCase().trim();
    return ROLE_ALIASES[r] || r;
  }

  function getProfile(rol) {
    return OPERATIVE_PROFILES[normalizeRol(rol)] || OPERATIVE_PROFILES.caja;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function permListIncludes(lista, subs) {
    if (!Array.isArray(lista)) lista = [];
    if (typeof subs === 'string') return lista.indexOf(subs) >= 0;
    if (!Array.isArray(subs)) return false;
    for (var i = 0; i < subs.length; i++) {
      if (lista.indexOf(subs[i]) >= 0) return true;
    }
    return false;
  }

  function checkGranular(u, rule) {
    if (!rule || rule.allow === false) return false;
    if (rule.allow === true && !rule.perm && !rule.comandas && !rule.inventario && !rule.productos && !rule.admin) {
      return true;
    }
    var permisos = (u && u.permisos) || {};
    var ctx = rule.context ? { context: rule.context } : {};
    if (rule.perm) {
      if (typeof global.crozzoHasCajaPermiso === 'function') {
        if (typeof rule.perm === 'string') {
          if (global.crozzoHasCajaPermiso(rule.perm, ctx)) return true;
        } else if (Array.isArray(rule.perm)) {
          for (var i = 0; i < rule.perm.length; i++) {
            if (global.crozzoHasCajaPermiso(rule.perm[i], ctx)) return true;
          }
        }
      }
      if (permListIncludes(permisos.caja, rule.perm)) return true;
    }
    if (rule.comandas && permListIncludes(permisos.comandas, rule.comandas)) return true;
    if (rule.inventario && permListIncludes(permisos.inventario, rule.inventario)) return true;
    if (rule.productos && permListIncludes(permisos.productos, rule.productos)) return true;
    if (rule.admin && permListIncludes(permisos.admin, rule.admin)) return true;
    return rule.allow === true && !rule.perm && !rule.comandas && !rule.inventario && !rule.productos && !rule.admin;
  }

  /** ¿Puede hacer esta acción operativa? (rol + permiso granular) */
  function crozzoOperativeCan(action, opts) {
    opts = opts || {};
    try {
      if (typeof global.isSuperAdminUser === 'function' && global.isSuperAdminUser()) return true;
      var u = opts.user;
      if (!u && typeof global.getCurrentUser === 'function') u = global.getCurrentUser();
      if (!u) return false;
      var prof = getProfile(u.rol);
      if (prof.actions.all) return true;
      var rule = prof.actions[action];
      if (!rule) return false;
      return checkGranular(u, rule);
    } catch (_) {
      return false;
    }
  }

  /** Bloqueo mesero/cajero post-comanda (ítem ya enviado a cocina). */
  function crozzoOperativeCanTouchSentLine(item, opts) {
    if (!item) return false;
    var sent =
      typeof global.crozzoCartItemSentQty === 'function'
        ? global.crozzoCartItemSentQty(item)
        : Number(item.sentCantidad) || 0;
    if (sent <= 0) {
      return crozzoOperativeCan('editar_pre_comandar', opts);
    }
    return crozzoOperativeCan('modificar_post_comandar', opts);
  }

  function crozzoOperativeSequence(rol) {
    var p = getProfile(rol);
    return (p.sequence || []).slice();
  }

  function crozzoOperativeCannot(rol) {
    var p = getProfile(rol);
    return (p.cannot || []).slice();
  }

  function crozzoOperativeProfileMeta(rol) {
    var p = getProfile(rol);
    return { id: p.id, label: p.label, tagline: p.tagline || '' };
  }

  /** Panel HTML para formulario de usuarios (admin). */
  function crozzoOperativeLogicPanelHtml(rol) {
    var p = getProfile(rol);
    if (!p) return '';
    var seq = (p.sequence || [])
      .map(function (s, i) {
        return '<li><span class="crozzo-op-logic__n">' + (i + 1) + '</span>' + esc(s) + '</li>';
      })
      .join('');
    var cant = (p.cannot || [])
      .map(function (c) {
        return '<li>' + esc(c) + '</li>';
      })
      .join('');
    return (
      '<div class="crozzo-op-logic" data-role="' +
      esc(p.id) +
      '">' +
      '<p class="crozzo-op-logic__tagline">' +
      esc(p.tagline) +
      '</p>' +
      '<p class="crozzo-op-logic__head">Flujo operativo</p>' +
      '<ol class="crozzo-op-logic__seq">' +
      seq +
      '</ol>' +
      (cant
        ? '<p class="crozzo-op-logic__head crozzo-op-logic__head--warn">No puede</p><ul class="crozzo-op-logic__cant">' +
          cant +
          '</ul>'
        : '') +
      '</div>'
    );
  }

  /** Defaults de permisos alineados con la lógica (para plantillas). */
  function crozzoOperativeDefaultPermisos(rol) {
    var r = normalizeRol(rol);
    var base = { caja: [], comandas: [], admin: [], inventario: [], productos: [] };
    if (typeof global.CROZZO_STAFF_PLANTILLAS !== 'undefined') {
      var tplId =
        typeof global.crozzoDefaultStaffPlantillaIdForRol === 'function'
          ? global.crozzoDefaultStaffPlantillaIdForRol(r)
          : r;
      var tpl = global.CROZZO_STAFF_PLANTILLAS[tplId];
      if (tpl && tpl.permisos) {
        return JSON.parse(JSON.stringify(tpl.permisos));
      }
    }
    return base;
  }

  global.CrozzoPerfilesLogica = {
    PROFILES: OPERATIVE_PROFILES,
    normalizeRol: normalizeRol,
    getProfile: getProfile,
    crozzoOperativeCan: crozzoOperativeCan,
    crozzoOperativeCanTouchSentLine: crozzoOperativeCanTouchSentLine,
    crozzoOperativeSequence: crozzoOperativeSequence,
    crozzoOperativeCannot: crozzoOperativeCannot,
    crozzoOperativeProfileMeta: crozzoOperativeProfileMeta,
    crozzoOperativeLogicPanelHtml: crozzoOperativeLogicPanelHtml,
    crozzoOperativeDefaultPermisos: crozzoOperativeDefaultPermisos,
  };

  global.crozzoOperativeCan = crozzoOperativeCan;
  global.crozzoOperativeCanTouchSentLine = crozzoOperativeCanTouchSentLine;
  global.crozzoOperativeLogicPanelHtml = crozzoOperativeLogicPanelHtml;
})(typeof window !== 'undefined' ? window : globalThis);
