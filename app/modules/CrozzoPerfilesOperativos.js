/**
 * Crozzo POS — Perfiles operativos (tamaño + tipo negocio) con menús por rol y reglas de guarda.
 */
(function (global) {
  'use strict';

  var ROLE_FALLBACK = ['caja', 'user'];

  /** Perfiles legacy → plan básico de lanzamiento. */
  var LEGACY_PERFIL_MAP = {
    completo: 'basico_restaurante',
    pequeno: 'basico_restaurante',
    mediano: 'basico_restaurante',
    grande: 'basico_restaurante',
    restaurante: 'basico_restaurante',
    retail: 'basico_tienda',
    servicios: 'basico_tienda',
    basico: 'basico_tienda',
  };

  /** Módulos compartidos del plan básico (sin bodegas/remisiones, sin planilla, compras básicas). */
  var BASICO_SHARED = [
    'inventarios',
    'productos',
    'catalogo-mp',
    'sistema-costos-matriz',
    'sistema-costos-inv',
    'compras-oficina',
    'centro-compras',
    'compras-proveedores',
    'config-empresa',
    'impuestos',
    'conexion-sistemas',
    'facturas-admin',
    'admin',
  ];

  var BASICO_RESTAURANTE_EXTRA = [
    'inicio-operacion',
    'punto-venta',
    'tablets',
    'facturas',
    'cierre-caja',
    'caja',
    'comandas',
    'cocina',
    'compras-cortes',
    'compras-recetario-cocina',
    'compras-proceso-sesion',
    'compras-proceso-historial',
    'config-comandas',
  ];

  var BASICO_TIENDA_EXTRA = ['inicio-operacion', 'venta-comercial', 'facturas', 'cierre-caja', 'caja'];

  /** Módulos permitidos por perfil (cliente / negocio). */
  var PERFIL_CLIENT_MENUS = {
    basico_restaurante: BASICO_SHARED.concat(BASICO_RESTAURANTE_EXTRA),
    basico_tienda: BASICO_SHARED.concat(BASICO_TIENDA_EXTRA),
  };

  /** Menú lateral por rol (solo perfiles con roles definidos; personalizado = sin filtro). */
  var PERFIL_ROLE_MENUS = {
    basico_restaurante: {
      caja: ['inicio-operacion', 'punto-venta', 'cierre-caja', 'facturas', 'caja', 'comandas'],
      mesero: ['tablets', 'comandas'],
      cocina: [
        'cocina',
        'comandas',
        'compras-cortes',
        'compras-recetario-cocina',
        'compras-proceso-sesion',
        'compras-proceso-historial',
      ],
      inventario: [
        'centro-compras',
        'compras-proveedores',
        'inventarios',
        'productos',
        'catalogo-mp',
        'sistema-costos-matriz',
        'sistema-costos-inv',
        'compras-oficina',
      ],
      admin: PERFIL_CLIENT_MENUS.basico_restaurante.slice(),
      user: ['inicio-operacion', 'punto-venta', 'cierre-caja'],
    },
    basico_tienda: {
      caja: ['inicio-operacion', 'venta-comercial', 'cierre-caja', 'facturas', 'caja'],
      mesero: ['venta-comercial'],
      inventario: [
        'centro-compras',
        'compras-proveedores',
        'inventarios',
        'productos',
        'catalogo-mp',
        'sistema-costos-matriz',
        'sistema-costos-inv',
        'compras-oficina',
      ],
      admin: PERFIL_CLIENT_MENUS.basico_tienda.slice(),
      user: ['venta-comercial', 'cierre-caja'],
    },
  };

  /** Metadatos operativos: guardas, onboarding, página inicio. */
  var PERFIL_META = {
    basico_restaurante: {
      id: 'basico_restaurante',
      label: 'Plan básico · Restaurante',
      desc:
        'Operación gastronómica, cocina/KDS, preparaciones, gestión, costos (sin planilla) y compras básicas.',
      icon: '🍽️',
      tipo: 'restaurante',
      tamano: 'basico',
      experiencia: 'novice',
      home: 'inicio-operacion',
      roleMenus: true,
      onboarding: true,
      debounceMs: 750,
      dupWindowMs: 100000,
      dupRatio: 0.78,
      shiftTip: true,
    },
    basico_tienda: {
      id: 'basico_tienda',
      label: 'Plan básico · Tienda comercial',
      desc:
        'Venta comercial, gestión, costos (sin planilla), compras básicas, administración y marcación de personal (sin cocina).',
      icon: '🏪',
      tipo: 'retail',
      tamano: 'basico',
      experiencia: 'novice',
      home: 'venta-comercial',
      roleMenus: true,
      onboarding: true,
      debounceMs: 700,
      dupWindowMs: 100000,
      dupRatio: 0.78,
      shiftTip: true,
    },
    personalizado: {
      id: 'personalizado',
      label: 'Personalizado (Super Admin)',
      desc: 'Marcado manual de módulos — solo para ajustes internos.',
      icon: '⚙️',
      tipo: 'general',
      tamano: null,
      experiencia: 'expert',
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
    var r;
    if (typeof global.crozzoNormalizeAppRol === 'function') r = global.crozzoNormalizeAppRol(rol);
    else
      r = String(rol || 'caja')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/-/g, '_');
    if (r === 'jefe_compras') return 'inventario';
    return r;
  }

  function normalizePerfilId(perfil) {
    var p = String(perfil || '').toLowerCase();
    if (LEGACY_PERFIL_MAP[p]) return LEGACY_PERFIL_MAP[p];
    return p;
  }

  function getPerfilId(perfil) {
    var p = String(perfil || '').toLowerCase();
    if (!p && typeof global.crozzoGetPerfilEmpresa === 'function') p = global.crozzoGetPerfilEmpresa();
    if (!p) {
      try {
        p = String(localStorage.getItem('crozzo_perfil_empresa') || 'basico_restaurante').toLowerCase();
      } catch (_) {
        p = 'basico_restaurante';
      }
    }
    return normalizePerfilId(p);
  }

  function getMeta(perfil) {
    var id = getPerfilId(perfil);
    return PERFIL_META[id] || PERFIL_META.basico_restaurante;
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
    return [PERFIL_META.basico_restaurante, PERFIL_META.basico_tienda];
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
  var GESTION_ROLE_ORDER = ['caja', 'mesero', 'cocina', 'inventario', 'user', 'admin'];

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
    if (id === 'personalizado') {
      if (typeof global.crozzoSyncClientFeaturesDefault === 'function') {
        global.crozzoSyncClientFeaturesDefault(client, id);
      }
      return client;
    }
    client.menus = {};
    client.roles = buildRolesConfigObject(id);
    if (typeof global.crozzoSyncClientFeaturesDefault === 'function') {
      global.crozzoSyncClientFeaturesDefault(client, id);
    }
    if (typeof global.CrozzoPermisosPolicy !== 'undefined' && global.CrozzoPermisosPolicy.syncClientRolePerms) {
      global.CrozzoPermisosPolicy.syncClientRolePerms(client);
    }
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
    var targets = ['basico_restaurante', 'basico_tienda'];
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
    var rolesDone = {};
    function appendRoleCard(role) {
      if (rolesDone[role] || !map[role] || !map[role].length) return;
      rolesDone[role] = true;
      var items = map[role];
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
    }
    GESTION_ROLE_ORDER.forEach(appendRoleCard);
    Object.keys(map).forEach(appendRoleCard);
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
    if (typeof global.crozzoSyncFiscalPerfilOperativo === 'function') {
      global.crozzoSyncFiscalPerfilOperativo(getPerfilId(perfilId));
    }
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
    if (typeof global.crozzoSyncFiscalPerfilOperativo === 'function') {
      global.crozzoSyncFiscalPerfilOperativo(id);
    }
    try {
      if (document.body) document.body.setAttribute('data-crozzo-perfil', id);
    } catch (_) {}
    return true;
  }

  function renderPerfilSelectOptions(selected, opts) {
    opts = opts || {};
    var sel = getPerfilId(selected);
    var ids = ['basico_restaurante', 'basico_tienda'];
    if (opts.includePersonalizado) ids.push('personalizado');
    return ids
      .map(function (id) {
        var m = PERFIL_META[id];
        if (!m) return '';
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
    var targets = ['basico_restaurante', 'basico_tienda'];
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
  global.CROZZO_PERFIL_LEGACY_MAP = LEGACY_PERFIL_MAP;
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

  /** Compat alias simulación / onboarding */
  global.crozzoApplyPerfilPequenoNegocio = function () {
    return applyPerfil('basico_restaurante');
  };
  global.crozzoNormalizePerfilEmpresaId = normalizePerfilId;
})(typeof window !== 'undefined' ? window : globalThis);
