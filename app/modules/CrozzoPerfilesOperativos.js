/**
 * Crozzo POS — Perfiles operativos (tamaño + tipo negocio) con menús por rol y reglas de guarda.
 */
(function (global) {
  'use strict';

  var ROLE_FALLBACK = ['caja', 'user'];

  /** Módulos permitidos por perfil (cliente / negocio). */
  var PERFIL_CLIENT_MENUS = {
    completo: ['all'],
    pequeno: [
      'inicio-operacion', 'punto-venta', 'tablets', 'cierre-caja', 'comandas', 'cocina', 'facturas', 'caja',
      'productos', 'inventarios', 'centro-compras', 'pedidos-internos', 'control-acceso', 'admin',
      'config-empresa', 'config-comandas', 'nomina-planilla',
    ],
    mediano: [
      'inicio-operacion', 'punto-venta', 'tablets', 'cierre-caja', 'comandas', 'cocina', 'facturas', 'caja',
      'productos', 'inventarios', 'catalogo-mp', 'costos-matriz', 'centro-compras', 'compras-cotizaciones',
      'compras-proveedores', 'pedidos-internos', 'control-acceso', 'admin', 'config-empresa', 'config-comandas',
      'nomina-planilla', 'auditoria',
    ],
    grande: [
      'inicio-operacion', 'caja', 'punto-venta', 'tablets', 'facturas', 'cierre-caja', 'comandas', 'cocina',
      'inventarios', 'productos', 'catalogo-mp', 'costos-matriz', 'sistema-costos-matriz', 'sistema-costos-inv',
      'centro-compras', 'compras-cotizaciones', 'compras-recepcion', 'compras-proveedores', 'compras-ordenes',
      'compras-cortes', 'compras-proceso-sesion', 'compras-proceso-entrada', 'compras-proceso-historial',
      'compras-oficina', 'pedidos-internos', 'control-acceso', 'nomina-planilla', 'admin', 'config-empresa',
      'config-comandas', 'auditoria',
    ],
    restaurante: [
      'inicio-operacion', 'caja', 'punto-venta', 'tablets', 'facturas', 'cierre-caja', 'comandas', 'cocina',
      'inventarios', 'productos', 'catalogo-mp', 'costos-matriz', 'centro-compras', 'compras-cotizaciones',
      'compras-recepcion', 'compras-proveedores', 'compras-cortes', 'compras-proceso-sesion',
      'compras-proceso-entrada', 'compras-proceso-historial', 'compras-oficina', 'pedidos-internos',
      'control-acceso', 'nomina-planilla', 'admin', 'config-empresa', 'config-comandas', 'auditoria',
    ],
    retail: [
      'inicio-operacion', 'caja', 'venta-comercial', 'facturas', 'cierre-caja', 'inventarios', 'productos',
      'admin', 'config-empresa', 'impuestos', 'nomina-planilla', 'compras-oficina', 'control-acceso',
      'centro-compras', 'compras-ordenes',
    ],
    servicios: [
      'inicio-operacion', 'caja', 'venta-comercial', 'facturas', 'cierre-caja', 'productos', 'admin',
      'config-empresa', 'impuestos', 'control-acceso',
    ],
    basico: ['caja', 'venta-comercial', 'productos', 'admin', 'config-empresa'],
  };

  /** Menú lateral por rol (solo perfiles con roles definidos; completo/personalizado = sin filtro). */
  var PERFIL_ROLE_MENUS = {
    pequeno: {
      caja: ['inicio-operacion', 'punto-venta', 'cierre-caja', 'facturas', 'caja'],
      mesero: ['tablets', 'comandas'],
      cocina: ['cocina', 'comandas', 'pedidos-internos'],
      inventario: ['centro-compras', 'pedidos-internos', 'inventarios'],
      admin: [
        'inicio-operacion', 'punto-venta', 'tablets', 'cierre-caja', 'comandas', 'cocina', 'facturas', 'productos',
        'inventarios', 'centro-compras', 'pedidos-internos', 'control-acceso', 'admin', 'config-empresa',
        'config-comandas', 'nomina-planilla',
      ],
      user: ['inicio-operacion', 'punto-venta', 'cierre-caja'],
    },
    mediano: {
      caja: ['inicio-operacion', 'punto-venta', 'cierre-caja', 'facturas', 'caja', 'comandas'],
      mesero: ['tablets', 'comandas'],
      cocina: ['cocina', 'comandas', 'pedidos-internos'],
      inventario: [
        'centro-compras', 'compras-cotizaciones', 'compras-proveedores', 'pedidos-internos', 'inventarios',
        'catalogo-mp',
      ],
      admin: [
        'inicio-operacion', 'punto-venta', 'tablets', 'cierre-caja', 'comandas', 'cocina', 'facturas', 'caja',
        'productos', 'inventarios', 'catalogo-mp', 'costos-matriz', 'centro-compras', 'compras-cotizaciones',
        'compras-proveedores', 'pedidos-internos', 'control-acceso', 'admin', 'config-empresa', 'config-comandas',
        'nomina-planilla', 'auditoria',
      ],
      user: ['inicio-operacion', 'punto-venta', 'cierre-caja'],
    },
    grande: {
      caja: ['inicio-operacion', 'punto-venta', 'tablets', 'cierre-caja', 'facturas', 'caja', 'comandas', 'inventarios'],
      mesero: ['tablets', 'comandas'],
      cocina: [
        'cocina', 'comandas', 'pedidos-internos', 'compras-cortes', 'compras-proceso-sesion',
        'compras-proceso-entrada',
      ],
      inventario: [
        'centro-compras', 'compras-cotizaciones', 'compras-recepcion', 'compras-proveedores', 'compras-ordenes',
        'compras-cortes', 'compras-proceso-entrada', 'compras-proceso-historial', 'pedidos-internos', 'inventarios',
        'catalogo-mp', 'costos-matriz', 'sistema-costos-inv',
      ],
      admin: PERFIL_CLIENT_MENUS.grande.filter(function (m) {
        return m !== 'all';
      }),
      user: ['inicio-operacion', 'punto-venta', 'cierre-caja'],
    },
    restaurante: {
      caja: ['inicio-operacion', 'punto-venta', 'cierre-caja', 'facturas', 'caja', 'comandas'],
      mesero: ['tablets', 'comandas', 'cocina'],
      cocina: ['cocina', 'comandas', 'pedidos-internos'],
      inventario: [
        'centro-compras', 'compras-recepcion', 'compras-proveedores', 'inventarios', 'catalogo-mp', 'costos-matriz',
        'pedidos-internos',
      ],
      admin: PERFIL_CLIENT_MENUS.restaurante.filter(function (m) {
        return m !== 'all';
      }),
      user: ['inicio-operacion', 'punto-venta', 'tablets', 'cierre-caja'],
    },
    retail: {
      caja: ['inicio-operacion', 'venta-comercial', 'cierre-caja', 'facturas', 'caja'],
      mesero: ['venta-comercial'],
      inventario: ['inventarios', 'productos', 'centro-compras', 'compras-ordenes', 'compras-oficina'],
      admin: PERFIL_CLIENT_MENUS.retail.filter(function (m) {
        return m !== 'all';
      }),
      user: ['venta-comercial', 'cierre-caja'],
    },
    servicios: {
      caja: ['inicio-operacion', 'venta-comercial', 'cierre-caja', 'facturas', 'caja'],
      admin: PERFIL_CLIENT_MENUS.servicios.filter(function (m) {
        return m !== 'all';
      }),
      user: ['venta-comercial', 'cierre-caja'],
    },
    basico: {
      caja: ['venta-comercial', 'caja'],
      admin: ['venta-comercial', 'caja', 'productos', 'admin', 'config-empresa'],
      user: ['venta-comercial'],
    },
  };

  /** Metadatos operativos: guardas, onboarding, página inicio. */
  var PERFIL_META = {
    completo: {
      id: 'completo',
      label: 'Completo',
      desc: 'Todos los módulos; sin restricción por rol.',
      icon: '🌐',
      tipo: 'general',
      tamano: null,
      experiencia: 'expert',
      home: 'inicio-operacion',
      roleMenus: false,
      onboarding: false,
      debounceMs: 400,
      dupWindowMs: 60000,
      dupRatio: 0.88,
      shiftTip: false,
    },
    pequeno: {
      id: 'pequeno',
      label: 'Pequeño negocio',
      desc: '10–20 cubiertos · 3–5 empleados · menú mínimo por rol.',
      icon: '🏠',
      tipo: 'restaurante',
      tamano: 'pequeno',
      experiencia: 'novice',
      home: 'inicio-operacion',
      roleMenus: true,
      onboarding: true,
      debounceMs: 900,
      dupWindowMs: 120000,
      dupRatio: 0.75,
      shiftTip: true,
    },
    mediano: {
      id: 'mediano',
      label: 'Restaurante mediano',
      desc: '20–50 cubiertos · 8–12 empleados · compras y costos básicos.',
      icon: '🍽️',
      tipo: 'restaurante',
      tamano: 'mediano',
      experiencia: 'mixed',
      home: 'inicio-operacion',
      roleMenus: true,
      onboarding: true,
      debounceMs: 650,
      dupWindowMs: 90000,
      dupRatio: 0.78,
      shiftTip: true,
    },
    grande: {
      id: 'grande',
      label: 'Restaurante grande',
      desc: '50–150+ cubiertos · producción, compras avanzadas y auditoría.',
      icon: '🏨',
      tipo: 'restaurante',
      tamano: 'grande',
      experiencia: 'expert',
      home: 'inicio-operacion',
      roleMenus: true,
      onboarding: false,
      debounceMs: 450,
      dupWindowMs: 60000,
      dupRatio: 0.85,
      shiftTip: false,
    },
    restaurante: {
      id: 'restaurante',
      label: 'Restaurante estándar',
      desc: 'Operación gastronómica completa con roles definidos (equipo con experiencia).',
      icon: '👨‍🍳',
      tipo: 'restaurante',
      tamano: 'mediano',
      experiencia: 'expert',
      home: 'inicio-operacion',
      roleMenus: true,
      onboarding: false,
      debounceMs: 500,
      dupWindowMs: 75000,
      dupRatio: 0.82,
      shiftTip: false,
    },
    retail: {
      id: 'retail',
      label: 'Retail / Tienda',
      desc: 'Venta comercial, inventario y cierre; roles caja vs bodega.',
      icon: '🏪',
      tipo: 'retail',
      tamano: null,
      experiencia: 'mixed',
      home: 'venta-comercial',
      roleMenus: true,
      onboarding: true,
      debounceMs: 600,
      dupWindowMs: 90000,
      dupRatio: 0.8,
      shiftTip: true,
    },
    servicios: {
      id: 'servicios',
      label: 'Servicios / Mostrador',
      desc: 'Venta rápida sin comandas de cocina.',
      icon: '💼',
      tipo: 'servicios',
      tamano: null,
      experiencia: 'mixed',
      home: 'venta-comercial',
      roleMenus: true,
      onboarding: true,
      debounceMs: 550,
      dupWindowMs: 80000,
      dupRatio: 0.8,
      shiftTip: false,
    },
    basico: {
      id: 'basico',
      label: 'Básico',
      desc: 'Solo mostrador y catálogo mínimo.',
      icon: '⚡',
      tipo: 'retail',
      tamano: 'pequeno',
      experiencia: 'novice',
      home: 'venta-comercial',
      roleMenus: true,
      onboarding: true,
      debounceMs: 800,
      dupWindowMs: 100000,
      dupRatio: 0.76,
      shiftTip: true,
    },
    personalizado: {
      id: 'personalizado',
      label: 'Personalizado',
      desc: 'Módulos marcados manualmente por cliente.',
      icon: '⚙️',
      tipo: 'general',
      tamano: null,
      experiencia: 'mixed',
      home: 'inicio-operacion',
      roleMenus: false,
      onboarding: false,
      debounceMs: 500,
      dupWindowMs: 90000,
      dupRatio: 0.8,
      shiftTip: false,
    },
  };

  function normalizeRol(rol) {
    if (typeof global.crozzoNormalizeAppRol === 'function') return global.crozzoNormalizeAppRol(rol);
    return String(rol || 'caja')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_');
  }

  function getPerfilId(perfil) {
    var p = String(perfil || '').toLowerCase();
    if (!p && typeof global.crozzoGetPerfilEmpresa === 'function') p = global.crozzoGetPerfilEmpresa();
    if (!p) {
      try {
        p = String(localStorage.getItem('crozzo_perfil_empresa') || 'completo').toLowerCase();
      } catch (_) {
        p = 'completo';
      }
    }
    return p;
  }

  function getMeta(perfil) {
    var id = getPerfilId(perfil);
    return PERFIL_META[id] || PERFIL_META.completo;
  }

  function usesRoleMenus(perfil) {
    var meta = getMeta(perfil);
    if (!meta.roleMenus) return false;
    return !!PERFIL_ROLE_MENUS[getPerfilId(perfil)];
  }

  function resolveRoleMenus(perfil, role) {
    var p = getPerfilId(perfil);
    var meta = getMeta(p);
    if (!meta.roleMenus) return null;
    var map = PERFIL_ROLE_MENUS[p];
    if (!map) return null;
    var r = normalizeRol(role);
    if (map[r]) return map[r].slice();
    for (var i = 0; i < ROLE_FALLBACK.length; i++) {
      if (map[ROLE_FALLBACK[i]]) return map[ROLE_FALLBACK[i]].slice();
    }
    var keys = Object.keys(map);
    return keys.length ? map[keys[0]].slice() : null;
  }

  function getClientMenus(perfil) {
    var p = getPerfilId(perfil);
    if (PERFIL_CLIENT_MENUS[p]) return PERFIL_CLIENT_MENUS[p].slice();
    return null;
  }

  function listPerfiles() {
    return Object.keys(PERFIL_META)
      .filter(function (id) {
        return id !== 'personalizado';
      })
      .map(function (id) {
        return PERFIL_META[id];
      });
  }

  function listPerfilesRestaurante() {
    return listPerfiles().filter(function (m) {
      return m.tipo === 'restaurante';
    });
  }

  var ROLE_LABELS = {
    caja: 'Caja / POS',
    mesero: 'Mesero / Tablet',
    cocina: 'Cocina / KDS',
    inventario: 'Inventario / Compras',
    admin: 'Administrador',
    user: 'Usuario básico',
  };

  function menuLabel(menuId) {
    if (typeof global.crozzoMenuLabelById === 'function') return global.crozzoMenuLabelById(menuId);
    return menuId;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function isPerfilPreset(perfilId) {
    var id = getPerfilId(perfilId);
    var meta = getMeta(id);
    return !!(meta.roleMenus && PERFIL_ROLE_MENUS[id]);
  }

  function buildRolesConfigObject(perfilId) {
    var map = PERFIL_ROLE_MENUS[getPerfilId(perfilId)];
    if (!map) return { user: {}, mesero: {}, admin: {}, caja: {}, cocina: {}, inventario: {} };
    var roles = {};
    Object.keys(map).forEach(function (role) {
      roles[role] = {};
      map[role].forEach(function (menuId) {
        roles[role][menuId] = true;
      });
    });
    return roles;
  }

  /** Sincroniza cliente Super Admin con preset operativo (perfil + roles). */
  function syncClientConfig(client, perfilId) {
    if (!client || typeof client !== 'object') return client;
    var id = getPerfilId(perfilId);
    client.perfil = id;
    if (id === 'personalizado') return client;
    client.menus = {};
    if (id === 'completo') {
      client.roles = { user: {}, mesero: {}, admin: {}, caja: {}, cocina: {}, inventario: {} };
      return client;
    }
    client.roles = buildRolesConfigObject(id);
    return client;
  }

  function renderGestionPanel(perfilId, clientName) {
    var id = getPerfilId(perfilId);
    var meta = getMeta(id);
    var modCount = 0;
    var mods = getClientMenus(id);
    if (mods && mods[0] !== 'all') modCount = mods.length;
    else if (mods && mods[0] === 'all') modCount = 'todos';
    return (
      '<div class="crozzo-gestion-perfil-panel">' +
      '<div class="crozzo-gestion-perfil-panel__head">' +
      '<div class="crozzo-gestion-perfil-panel__title">' +
      '<span class="crozzo-gestion-perfil-panel__icon">' +
      (meta.icon || '📦') +
      '</span>' +
      '<div><strong>' +
      esc(meta.label) +
      '</strong>' +
      (clientName ? '<span class="form-hint">Cliente: ' + esc(clientName) + '</span>' : '') +
      '<p class="form-hint" style="margin:6px 0 0;">' +
      esc(meta.desc) +
      '</p></div></div>' +
      '<div class="crozzo-gestion-perfil-panel__meta">' +
      '<span>Módulos: <strong>' +
      modCount +
      '</strong></span>' +
      '<span>Menú por rol: <strong>' +
      (meta.roleMenus ? 'Sí' : 'No') +
      '</strong></span>' +
      (meta.tamano ? '<span>Tamaño: <strong>' + esc(meta.tamano) + '</strong></span>' : '') +
      '</div></div>' +
      '<p class="form-hint" style="margin:0 0 8px;">Aplicar preset al cliente activo (actualiza perfil y menús por rol):</p>' +
      '<div class="crozzo-perfil-pills">' +
      renderGestionQuickPills(id) +
      '</div></div>'
    );
  }

  function renderGestionQuickPills(currentId) {
    var cur = getPerfilId(currentId);
    var targets = ['pequeno', 'mediano', 'grande', 'restaurante', 'retail', 'servicios', 'basico', 'completo'];
    return targets
      .map(function (pid) {
        var m = PERFIL_META[pid];
        if (!m) return '';
        var active = cur === pid ? ' crozzo-perfil-pill--active' : '';
        return (
          '<button type="button" class="crozzo-perfil-pill' +
          active +
          '" onclick="CrozzoPerfilesOperativos.applyToGestion(\'' +
          pid +
          '\')" title="' +
          esc(m.desc) +
          '">' +
          (m.icon || '') +
          ' ' +
          m.label +
          '</button>'
        );
      })
      .join('');
  }

  function renderRolePreview(perfilId) {
    var id = getPerfilId(perfilId);
    var meta = getMeta(id);
    if (id === 'completo') {
      return (
        '<div class="crozzo-gestion-role-preview crozzo-gestion-role-preview--info">' +
        '<p><strong>Perfil completo</strong> — todos los roles ven todos los módulos del sistema (sin recorte automático).</p></div>'
      );
    }
    if (id === 'personalizado') {
      return (
        '<div class="crozzo-gestion-role-preview crozzo-gestion-role-preview--info">' +
        '<p><strong>Personalizado</strong> — marque módulos y roles manualmente en las secciones de abajo.</p></div>'
      );
    }
    var map = PERFIL_ROLE_MENUS[id];
    if (!map || !meta.roleMenus) {
      return '<p class="form-hint">Sin vista previa para este perfil.</p>';
    }
    var html = '<div class="crozzo-gestion-role-preview">';
    Object.keys(map).forEach(function (role) {
      var items = map[role] || [];
      html +=
        '<div class="crozzo-gestion-role-card">' +
        '<h4>' +
        esc(ROLE_LABELS[role] || role) +
        ' <span class="form-hint">(' +
        items.length +
        ' módulos)</span></h4>' +
        '<ul class="crozzo-gestion-role-card__list">';
      items.forEach(function (mid) {
        html += '<li>' + esc(menuLabel(mid)) + '</li>';
      });
      html += '</ul></div>';
    });
    html += '</div>';
    return html;
  }

  function applyToGestion(perfilId) {
    if (typeof global.crozzoLoadMenuProfilesConfig !== 'function') return false;
    var cfg = global.crozzoLoadMenuProfilesConfig();
    var cid = cfg.activeClientId || 'default';
    var c = cfg.clients[cid] || cfg.clients.default;
    if (!c) return false;
    syncClientConfig(c, perfilId);
    if (typeof global.crozzoSaveMenuProfilesConfig === 'function') {
      global.crozzoSaveMenuProfilesConfig(cfg);
    }
    try {
      localStorage.setItem('crozzo_perfil_empresa', getPerfilId(perfilId));
    } catch (_) {}
    if (typeof global.crozzoRebuildMenusFromRoles === 'function') {
      global.crozzoRebuildMenusFromRoles();
    }
    if (typeof global.crozzoGestionPerfilesRefreshUI === 'function') {
      global.crozzoGestionPerfilesRefreshUI();
    }
    if (typeof global.showToast === 'function') {
      global.showToast('Perfil «' + (getMeta(perfilId).label || perfilId) + '» aplicado a «' + (c.nombre || cid) + '»', 'success');
    }
    try {
      global.dispatchEvent(
        new CustomEvent('crozzo-perfil-operativo-changed', { detail: { perfil: getPerfilId(perfilId), meta: getMeta(perfilId) } })
      );
    } catch (_) {}
    return true;
  }

  function applyPerfil(perfilId, opts) {
    var id = getPerfilId(perfilId);
    if (!PERFIL_META[id] || id === 'personalizado') return false;
    if (typeof global.crozzoLoadMenuProfilesConfig !== 'function') return false;
    var cfg = global.crozzoLoadMenuProfilesConfig();
    var cid = cfg.activeClientId || 'default';
    var c = cfg.clients[cid] || cfg.clients.default;
    if (!c) return false;
    syncClientConfig(c, id);
    if (typeof global.crozzoSaveMenuProfilesConfig === 'function') {
      global.crozzoSaveMenuProfilesConfig(cfg);
    }
    try {
      localStorage.setItem('crozzo_perfil_empresa', id);
      localStorage.setItem('crozzo_perfil_operativo_v1', id);
    } catch (_) {}
    if (global.config && typeof global.config.addAudit === 'function') {
      global.config.addAudit('perfil_operativo_aplicado', 'Perfil «' + (PERFIL_META[id].label || id) + '» → ' + (c.nombre || cid));
    }
    if (typeof global.crozzoRebuildMenusFromRoles === 'function') {
      global.crozzoRebuildMenusFromRoles();
    }
    if (!(opts && opts.silent) && typeof global.showToast === 'function') {
      global.showToast('Perfil «' + (PERFIL_META[id].label || id) + '» activo', 'success');
    }
    try {
      global.dispatchEvent(new CustomEvent('crozzo-perfil-operativo-changed', { detail: { perfil: id, meta: PERFIL_META[id] } }));
    } catch (_) {}
    try {
      if (document.body) document.body.setAttribute('data-crozzo-perfil', id);
    } catch (_) {}
    return true;
  }

  function renderPerfilSelectOptions(selected) {
    var sel = getPerfilId(selected);
    return Object.keys(PERFIL_META)
      .map(function (id) {
        var m = PERFIL_META[id];
        return (
          '<option value="' +
          id +
          '"' +
          (sel === id ? ' selected' : '') +
          '>' +
          (m.icon || '') +
          ' ' +
          m.label +
          ' — ' +
          m.desc +
          '</option>'
        );
      })
      .join('');
  }

  function renderQuickApplyButtons(excludeCurrent) {
    var cur = getPerfilId();
    var targets = ['pequeno', 'mediano', 'grande', 'restaurante', 'retail', 'servicios', 'basico'];
    return targets
      .filter(function (id) {
        return !excludeCurrent || id !== cur;
      })
      .map(function (id) {
        var m = PERFIL_META[id];
        if (!m) return '';
        var active = cur === id ? ' crozzo-perfil-pill--active' : '';
        return (
          '<button type="button" class="crozzo-perfil-pill' +
          active +
          '" onclick="CrozzoPerfilesOperativos.apply(\'' +
          id +
          '\')" title="' +
          m.desc.replace(/"/g, '&quot;') +
          '">' +
          (m.icon || '') +
          ' ' +
          m.label +
          '</button>'
        );
      })
      .join('');
  }

  global.CROZZO_PERFIL_CLIENT_MENUS = PERFIL_CLIENT_MENUS;
  global.CROZZO_PERFIL_ROLE_MENUS = PERFIL_ROLE_MENUS;
  global.CROZZO_PERFIL_META = PERFIL_META;

  global.crozzoGetPerfilOperativo = getMeta;
  global.crozzoResolveRoleMenus = resolveRoleMenus;
  global.crozzoGetPerfilClientMenus = getClientMenus;
  global.crozzoPerfilUsesRoleMenus = usesRoleMenus;
  global.crozzoApplyPerfilEmpresa = applyPerfil;
  global.crozzoListPerfilesOperativos = listPerfiles;

  global.CrozzoPerfilesOperativos = {
    apply: applyPerfil,
    applyToGestion: applyToGestion,
    syncClient: syncClientConfig,
    buildRolesConfig: buildRolesConfigObject,
    isPreset: isPerfilPreset,
    getMeta: getMeta,
    getCurrent: function () {
      return getMeta();
    },
    list: listPerfiles,
    listRestaurante: listPerfilesRestaurante,
    resolveRoleMenus: resolveRoleMenus,
    renderSelectOptions: renderPerfilSelectOptions,
    renderQuickPills: renderQuickApplyButtons,
    renderGestionPanel: renderGestionPanel,
    renderRolePreview: renderRolePreview,
    CLIENT_MENUS: PERFIL_CLIENT_MENUS,
    ROLE_MENUS: PERFIL_ROLE_MENUS,
    META: PERFIL_META,
    ROLE_LABELS: ROLE_LABELS,
  };

  /** Compat alias simulación pequeño inexperto */
  global.crozzoApplyPerfilPequenoNegocio = function () {
    return applyPerfil('pequeno');
  };
})(typeof window !== 'undefined' ? window : globalThis);
