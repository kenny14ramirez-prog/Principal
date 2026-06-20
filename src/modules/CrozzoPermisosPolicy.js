/**
 * Crozzo POS — Política de permisos delegables (Super Admin → Admin → Usuario).
 * Vincula módulos habilitados por empresa/rol con permisos granulares que el admin puede asignar.
 */
(function (global) {
  'use strict';

  /** Menú lateral → permisos granulares que habilita. */
  var MENU_PERM_MAP = {
    'inicio-operacion': {},
    'punto-venta': {
      caja: ['vista_pos', 'abrir_orden', 'editar_orden', 'eliminar_item', 'anular_comandado', 'unir_cuenta', 'dividir_cuenta', 'descuento_autorizado', 'facturar'],
    },
    'venta-comercial': {
      caja: ['vista_pos', 'abrir_orden', 'editar_orden', 'eliminar_item', 'descuento_autorizado', 'facturar'],
    },
    tablets: {
      caja: ['vista_tablets', 'tab_abrir', 'tab_editar', 'tab_eliminar', 'tab_precuenta'],
    },
    facturas: { caja: ['vista_facturas', 'facturar'] },
    'cierre-caja': { caja: ['vista_pos', 'vista_facturas'] },
    caja: { caja: ['vista_clientes'] },
    comandas: { comandas: ['ver', 'despachar', 'reimprimir'] },
    cocina: { comandas: ['ver', 'despachar'] },
    inventarios: { inventario: ['reportes'] },
    'compras-dashboard': { inventario: ['reportes'] },
    productos: { productos: ['catalogo'] },
    'catalogo-mp': { productos: ['catalogo'] },
    'centro-compras': { inventario: ['proveedores'] },
    'compras-cotizaciones': { inventario: ['proveedores'] },
    'compras-proveedores': { inventario: ['proveedores'] },
    'compras-recepcion': { inventario: ['proveedores'] },
    'compras-ordenes': { inventario: ['proveedores'] },
    'compras-cortes': { inventario: ['proveedores', 'reportes'] },
    'compras-recetario-cocina': { comandas: ['ver'], inventario: ['reportes', 'proveedores'] },
    'compras-proceso-sesion': { comandas: ['ver'], inventario: ['reportes', 'proveedores'] },
    'compras-proceso-historial': { comandas: ['ver'], inventario: ['reportes', 'proveedores'] },
    'compras-oficina': { inventario: ['proveedores', 'reportes'] },
    'pedidos-internos': { inventario: ['reportes'] },
    'sistema-costos-matriz': { inventario: ['reportes', 'proveedores'] },
    'sistema-costos-inv': { inventario: ['reportes'] },
    'sistema-costos-fed': { inventario: ['reportes', 'proveedores'] },
    'costos-matriz': { inventario: ['reportes', 'proveedores'] },
    'config-empresa': { admin: ['config_empresa'] },
    impuestos: { admin: ['config_impuestos'] },
    'config-comandas': { admin: ['config_comandas'] },
    'conexion-sistemas': { admin: ['config_conexiones'] },
    'facturas-admin': { admin: ['config_facturas_admin'] },
    admin: { admin: ['config_usuarios'] },
    'control-acceso': { admin: ['marcacion_personal'] },
    auditoria: { admin: ['auditoria'] },
    'nomina-planilla': { admin: ['nomina_planilla'] },
    'planilla-2026': { admin: ['nomina_planilla'] },
  };

  /** Presets por rol: qué puede delegar el admin por defecto (sin permisos sensibles). */
  var ROLE_PERM_PRESETS = {
    caja: {
      caja: ['vista_pos', 'vista_facturas', 'vista_clientes', 'abrir_orden', 'editar_orden', 'eliminar_item', 'facturar', 'unir_cuenta', 'dividir_cuenta', 'descuento_autorizado'],
      comandas: ['ver'],
      inventario: ['reportes', 'proveedores'],
      productos: [],
      admin: [],
    },
    mesero: {
      caja: ['vista_tablets', 'vista_clientes', 'tab_abrir', 'tab_editar', 'tab_eliminar', 'tab_precuenta'],
      comandas: ['ver', 'despachar'],
      inventario: [],
      productos: [],
      admin: [],
    },
    cocina: {
      caja: [],
      comandas: ['ver', 'despachar'],
      inventario: ['reportes', 'proveedores'],
      productos: [],
      admin: [],
    },
    inventario: {
      caja: [],
      comandas: ['ver'],
      inventario: ['reportes', 'proveedores'],
      productos: ['catalogo'],
      admin: [],
    },
    user: {
      caja: ['vista_pos', 'abrir_orden', 'editar_orden', 'facturar'],
      comandas: [],
      inventario: [],
      productos: [],
      admin: [],
    },
    admin: {
      caja: ['vista_pos', 'vista_tablets', 'vista_facturas', 'vista_clientes', 'abrir_orden', 'editar_orden', 'eliminar_item', 'anular_comandado', 'unir_cuenta', 'dividir_cuenta', 'descuento_autorizado', 'tab_abrir', 'tab_editar', 'tab_eliminar', 'tab_precuenta', 'facturar'],
      comandas: ['ver', 'despachar', 'reimprimir'],
      inventario: ['reportes', 'proveedores'],
      productos: ['catalogo'],
      admin: ['config_empresa', 'config_impuestos', 'config_comandas', 'config_usuarios', 'marcacion_personal'],
    },
  };

  var ROLE_ORDER = ['caja', 'mesero', 'cocina', 'inventario', 'user', 'admin'];
  var ROLE_LABELS = {
    caja: 'Caja / POS',
    mesero: 'Mesero / Tablet',
    cocina: 'Cocina / KDS',
    inventario: 'Inventario / Compras',
    user: 'Usuario básico',
    admin: 'Administrador',
  };

  var CAT_IDS = ['caja', 'comandas', 'inventario', 'productos', 'admin'];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function resolveClientPerfil(client) {
    var raw = (client && client.perfil) || 'basico_restaurante';
    if (typeof global.crozzoResolvePerfilEmpresaId === 'function') return global.crozzoResolvePerfilEmpresaId(raw);
    if (typeof global.crozzoNormalizePerfilEmpresaId === 'function') return global.crozzoNormalizePerfilEmpresaId(raw);
    var p = String(raw).toLowerCase();
    return p === 'completo' ? 'basico_restaurante' : p;
  }

  function normalizeRol(rol) {
    if (typeof global.crozzoNormalizeAppRol === 'function') return global.crozzoNormalizeAppRol(rol);
    var r = String(rol || 'caja')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/-/g, '_');
    if (r === 'jefe_compras') return 'inventario';
    return r;
  }

  function emptyPolicy() {
    return { caja: [], comandas: [], inventario: [], productos: [], admin: [] };
  }

  function mergePermBag(target, source) {
    if (!source || typeof source !== 'object') return target;
    Object.keys(source).forEach(function (cat) {
      if (!target[cat]) target[cat] = [];
      var set = new Set(target[cat]);
      (source[cat] || []).forEach(function (sub) {
        set.add(sub);
      });
      target[cat] = Array.from(set);
    });
    return target;
  }

  function permsFromMenuIds(menuIds) {
    var bag = emptyPolicy();
    (menuIds || []).forEach(function (menuId) {
      var map = MENU_PERM_MAP[menuId];
      if (map) mergePermBag(bag, map);
    });
    return bag;
  }

  function getRoleMenuIds(client, role) {
    if (!client) return [];
    var r = normalizeRol(role);
    var perfil = resolveClientPerfil(client);
    if (perfil !== 'personalizado' && typeof global.crozzoResolveRoleMenus === 'function') {
      var fromPreset = global.crozzoResolveRoleMenus(perfil, r);
      if (fromPreset && fromPreset.length) return fromPreset.slice();
    }
    if (client.roles && client.roles[r] && typeof client.roles[r] === 'object') {
      return Object.keys(client.roles[r]).filter(function (k) {
        return !!client.roles[r][k];
      });
    }
    return [];
  }

  /** Universo máximo de permisos según menús del rol. */
  function computeMaxPolicyFromMenus(client, role) {
    return permsFromMenuIds(getRoleMenuIds(client, role));
  }

  /** Preset acotado al universo de menús del rol. */
  function computeDefaultPolicy(client, role) {
    var r = normalizeRol(role);
    var preset = ROLE_PERM_PRESETS[r] || ROLE_PERM_PRESETS.user;
    var maxFromMenus = computeMaxPolicyFromMenus(client, role);
    var perfil = resolveClientPerfil(client);
    var out = emptyPolicy();
    CAT_IDS.forEach(function (cat) {
      var allowedMax = new Set(maxFromMenus[cat] || []);
      var presetList = preset[cat] || [];
      if (perfil === 'personalizado' && !getRoleMenuIds(client, role).length) {
        out[cat] = presetList.slice();
        return;
      }
      out[cat] = presetList.filter(function (sub) {
        return allowedMax.has(sub);
      });
    });
    return out;
  }

  function policyToPlain(obj) {
    var out = emptyPolicy();
    CAT_IDS.forEach(function (cat) {
      out[cat] = Array.isArray(obj && obj[cat]) ? obj[cat].slice() : [];
    });
    return out;
  }

  function getClientRolePermPolicy(client, role) {
    var r = normalizeRol(role);
    if (!client) client = typeof global.crozzoGetActiveClientProfile === 'function' ? global.crozzoGetActiveClientProfile() : null;
    if (client && client.rolePerms && client.rolePerms[r]) {
      return policyToPlain(client.rolePerms[r]);
    }
    return computeDefaultPolicy(client || {}, r);
  }

  function syncClientRolePerms(client) {
    if (!client || typeof client !== 'object') return client;
    if (!client.rolePerms || typeof client.rolePerms !== 'object') client.rolePerms = {};
    ROLE_ORDER.forEach(function (role) {
      if (!client.rolePerms[role] || !Object.keys(client.rolePerms[role]).length) {
        client.rolePerms[role] = computeDefaultPolicy(client, role);
      }
    });
    return client;
  }

  function isPermDelegable(role, cat, sub, client) {
    if (typeof global.isSuperAdminUser === 'function' && global.isSuperAdminUser()) return true;
    var pol = getClientRolePermPolicy(client, role);
    return (pol[cat] || []).indexOf(sub) >= 0;
  }

  function sanitizeUserPermisos(permisos, role, client) {
    var pol = getClientRolePermPolicy(client, role);
    var out = emptyPolicy();
    CAT_IDS.forEach(function (cat) {
      var allowed = new Set(pol[cat] || []);
      out[cat] = ((permisos && permisos[cat]) || []).filter(function (sub) {
        return allowed.has(sub);
      });
    });
    return out;
  }

  function getPermCatalog() {
    if (typeof global.PERMISOS_CATALOGO !== 'undefined') return global.PERMISOS_CATALOGO;
    return [];
  }

  function filterCatalogForRole(role, client) {
    var pol = getClientRolePermPolicy(client, role);
    var catalog = getPermCatalog();
    return catalog
      .map(function (cat) {
        var allowedSubs = new Set(pol[cat.id] || []);
        if (!allowedSubs.size) return null;
        var grupos = (cat.grupos || []).map(function (g) {
          var items = (g.items || []).filter(function (it) {
            return allowedSubs.has(it.id);
          });
          if (!items.length) return null;
          return Object.assign({}, g, { items: items });
        }).filter(Boolean);
        if (!grupos.length) return null;
        return Object.assign({}, cat, { grupos: grupos });
      })
      .filter(Boolean);
  }

  function renderPolicyEditor(client) {
    if (!client) client = typeof global.crozzoGetActiveClientProfile === 'function' ? global.crozzoGetActiveClientProfile() : {};
    syncClientRolePerms(client);
    var catalog = getPermCatalog();
    var tabs =
      '<div class="crozzo-perm-policy-tabs" role="tablist">' +
      ROLE_ORDER.map(function (role, idx) {
        return (
          '<button type="button" class="crozzo-perm-policy-tab' +
          (idx === 0 ? ' crozzo-perm-policy-tab--active' : '') +
          '" data-perm-role-tab="' +
          esc(role) +
          '" role="tab">' +
          esc(ROLE_LABELS[role] || role) +
          '</button>'
        );
      }).join('') +
      '</div>';

    var panels = ROLE_ORDER.map(function (role, idx) {
      var pol = getClientRolePermPolicy(client, role);
      var maxPol = computeMaxPolicyFromMenus(client, role);
      var menuCount = getRoleMenuIds(client, role).length;
      var rows = '';
      catalog.forEach(function (cat) {
        var subs = [];
        (cat.grupos || []).forEach(function (g) {
          (g.items || []).forEach(function (it) {
            subs.push({ group: g.nombre, item: it });
          });
        });
        var catSubs = subs.filter(function (row) {
          return (maxPol[cat.id] || []).indexOf(row.item.id) >= 0;
        });
        if (!catSubs.length) return;
        rows += '<tr class="crozzo-perm-policy-cat-row"><td colspan="3"><strong>' + esc(cat.nombre) + '</strong></td></tr>';
        catSubs.forEach(function (row) {
          var inMax = (maxPol[cat.id] || []).indexOf(row.item.id) >= 0;
          var checked = (pol[cat.id] || []).indexOf(row.item.id) >= 0;
          var dis = inMax ? '' : ' disabled';
          rows +=
            '<tr>' +
            '<td class="crozzo-perm-policy-sub">' +
            esc(row.item.nombre) +
            '</td>' +
            '<td class="crozzo-perm-policy-grp">' +
            esc(row.group) +
            '</td>' +
            '<td class="crozzo-perm-policy-chk">' +
            '<input type="checkbox" data-role-perm="' +
            esc(role) +
            '" data-perm-cat="' +
            esc(cat.id) +
            '" data-perm-sub="' +
            esc(row.item.id) +
            '"' +
            (checked ? ' checked' : '') +
            dis +
            '>' +
            '</td></tr>';
        });
      });
      if (!rows) {
        rows = '<tr><td colspan="3" class="form-hint">Sin permisos vinculados a los módulos de este rol. Revise el menú por rol arriba.</td></tr>';
      }
      return (
        '<div class="crozzo-perm-policy-panel' +
        (idx === 0 ? ' crozzo-perm-policy-panel--active' : '') +
        '" data-perm-role-panel="' +
        esc(role) +
        '" role="tabpanel">' +
        '<div class="crozzo-perm-policy-panel__head">' +
        '<p class="form-hint" style="margin:0;">' +
        esc(ROLE_LABELS[role] || role) +
        ' · ' +
        menuCount +
        ' módulos en menú · el administrador del negocio solo podrá asignar permisos marcados aquí.</p>' +
        '<button type="button" class="btn btn-outline btn-sm" data-perm-recalc-role="' +
        esc(role) +
        '">Recalcular desde menús</button>' +
        '<button type="button" class="btn btn-outline btn-sm" data-perm-preset-role="' +
        esc(role) +
        '" data-perm-preset-mode="operativo">Operativo básico</button>' +
        '<button type="button" class="btn btn-outline btn-sm" data-perm-preset-role="' +
        esc(role) +
        '" data-perm-preset-mode="seguro">Sin acciones sensibles</button>' +
        '</div>' +
        '<div class="crozzo-perm-policy-table-wrap">' +
        '<table class="data-table crozzo-perm-policy-table">' +
        '<thead><tr><th>Permiso</th><th>Área</th><th>Delegable</th></tr></thead>' +
        '<tbody>' +
        rows +
        '</tbody></table></div></div>'
      );
    }).join('');

    return (
      '<div class="card crozzo-gestion-page__card crozzo-perm-policy-card">' +
      '<h3 class="crozzo-gestion-page__card-title">Permisos delegables por rol</h3>' +
      '<p class="form-hint">Define qué acciones puede otorgar el <strong>administrador del negocio</strong> al crear usuarios. ' +
      'Se vincula con los módulos habilitados arriba: un cajero puede ver proveedores pero no borrar pedidos ni editar precios si no está marcado.</p>' +
      tabs +
      '<div class="crozzo-perm-policy-panels">' +
      panels +
      '</div></div>'
    );
  }

  function bindPolicyEditor(root) {
    if (!root) root = document.getElementById('gestion-perfiles');
    if (!root) return;
    root.querySelectorAll('[data-perm-role-tab]').forEach(function (btn) {
      if (btn._crozzoPermTab) return;
      btn._crozzoPermTab = true;
      btn.addEventListener('click', function () {
        var role = btn.getAttribute('data-perm-role-tab');
        root.querySelectorAll('[data-perm-role-tab]').forEach(function (b) {
          b.classList.toggle('crozzo-perm-policy-tab--active', b === btn);
        });
        root.querySelectorAll('[data-perm-role-panel]').forEach(function (p) {
          p.classList.toggle('crozzo-perm-policy-panel--active', p.getAttribute('data-perm-role-panel') === role);
        });
      });
    });
    root.querySelectorAll('[data-perm-recalc-role]').forEach(function (btn) {
      if (btn._crozzoPermRecalc) return;
      btn._crozzoPermRecalc = true;
      btn.addEventListener('click', function () {
        var role = btn.getAttribute('data-perm-recalc-role');
        var cfg = typeof global.crozzoLoadMenuProfilesConfig === 'function' ? global.crozzoLoadMenuProfilesConfig() : null;
        if (!cfg) return;
        var c = cfg.clients[cfg.activeClientId] || cfg.clients.default;
        if (!c) return;
        if (!c.rolePerms) c.rolePerms = {};
        c.rolePerms[role] = computeDefaultPolicy(c, role);
        if (typeof global.crozzoSaveMenuProfilesConfig === 'function') global.crozzoSaveMenuProfilesConfig(cfg);
        if (typeof global.crozzoGestionPerfilesRefreshUI === 'function') global.crozzoGestionPerfilesRefreshUI();
        if (typeof global.showToast === 'function') global.showToast('Permisos de «' + (ROLE_LABELS[role] || role) + '» recalculados desde menús', 'success');
      });
    });
    root.querySelectorAll('[data-perm-preset-role]').forEach(function (btn) {
      if (btn._crozzoPermPreset) return;
      btn._crozzoPermPreset = true;
      btn.addEventListener('click', function () {
        var role = btn.getAttribute('data-perm-preset-role');
        var mode = btn.getAttribute('data-perm-preset-mode');
        var panel = root.querySelector('[data-perm-role-panel="' + role + '"]');
        if (!panel) return;
        var sensibles = { eliminar_item: 1, tab_eliminar: 1, anular_comandado: 1, catalogo: 1, config_usuarios: 1 };
        panel.querySelectorAll('input[data-role-perm][data-perm-sub]').forEach(function (cb) {
          var sub = cb.getAttribute('data-perm-sub');
          if (mode === 'seguro' && sensibles[sub]) {
            cb.checked = false;
            return;
          }
          if (mode === 'operativo') {
            cb.checked = !sensibles[sub];
          }
        });
        if (typeof global.showToast === 'function') {
          global.showToast(
            mode === 'seguro' ? 'Acciones sensibles desmarcadas — pulse Guardar' : 'Perfil operativo marcado — pulse Guardar',
            'info'
          );
        }
      });
    });
  }

  function collectRolePermsFromDom() {
    var out = {};
    ROLE_ORDER.forEach(function (role) {
      out[role] = emptyPolicy();
    });
    document.querySelectorAll('#gestion-perfiles input[data-role-perm][data-perm-cat][data-perm-sub]').forEach(function (cb) {
      if (!cb.checked) return;
      var role = cb.getAttribute('data-role-perm');
      var cat = cb.getAttribute('data-perm-cat');
      var sub = cb.getAttribute('data-perm-sub');
      if (!out[role]) out[role] = emptyPolicy();
      if (!out[role][cat]) out[role][cat] = [];
      if (out[role][cat].indexOf(sub) < 0) out[role][cat].push(sub);
    });
    return out;
  }

  function getSuggestedPermisosForRole(role, client) {
    return policyToPlain(getClientRolePermPolicy(client, role));
  }

  global.CrozzoPermisosPolicy = {
    MENU_PERM_MAP: MENU_PERM_MAP,
    ROLE_PERM_PRESETS: ROLE_PERM_PRESETS,
    ROLE_ORDER: ROLE_ORDER,
    ROLE_LABELS: ROLE_LABELS,
    computeDefaultPolicy: computeDefaultPolicy,
    computeMaxPolicyFromMenus: computeMaxPolicyFromMenus,
    getClientRolePermPolicy: getClientRolePermPolicy,
    syncClientRolePerms: syncClientRolePerms,
    isPermDelegable: isPermDelegable,
    sanitizeUserPermisos: sanitizeUserPermisos,
    filterCatalogForRole: filterCatalogForRole,
    renderPolicyEditor: renderPolicyEditor,
    bindPolicyEditor: bindPolicyEditor,
    collectRolePermsFromDom: collectRolePermsFromDom,
    getSuggestedPermisosForRole: getSuggestedPermisosForRole,
  };

  global.crozzoGetClientRolePermPolicy = getClientRolePermPolicy;
  global.crozzoIsPermDelegable = isPermDelegable;
  global.crozzoSanitizeUserPermisos = sanitizeUserPermisos;
  global.crozzoFilterPermCatalogForRole = filterCatalogForRole;
})(typeof window !== 'undefined' ? window : globalThis);
