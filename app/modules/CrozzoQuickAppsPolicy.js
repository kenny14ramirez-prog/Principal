/**
 * Política de apps rápidas (FAB +) por rol — PC Tauri.
 * El administrador define qué apps ve cada rol (WhatsApp, Gmail, Drive, Dataico, DIAN, Spotify).
 */
(function (global) {
  'use strict';

  var APPS = [
    { id: 'wa', label: 'WhatsApp Web', page: 'whatsapp-web' },
    { id: 'gmail', label: 'Gmail', page: 'gmail-web' },
    { id: 'drive', label: 'Google Drive', page: 'drive-web' },
    { id: 'dataico', label: 'Dataico', page: 'dataico-web' },
    { id: 'dian', label: 'DIAN · CUFE', page: 'dian-vpfe-web' },
    { id: 'spotify', label: 'Spotify', page: 'spotify-web' },
  ];

  var ROLE_ORDER = ['caja', 'mesero', 'cocina', 'inventario', 'user', 'admin'];

  var ROLE_LABELS = {
    caja: 'Caja / POS',
    mesero: 'Mesero / Tablet',
    cocina: 'Cocina / KDS',
    inventario: 'Inventario / Compras',
    user: 'Usuario básico',
    admin: 'Administrador',
  };

  var DEFAULTS = {
    admin: ['wa', 'gmail', 'drive', 'dataico', 'dian', 'spotify'],
    caja: ['wa', 'dataico', 'dian'],
    user: ['wa', 'dataico', 'dian'],
    mesero: [],
    cocina: [],
    inventario: ['gmail', 'drive', 'dian'],
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function normalizePolicyRole(rol) {
    if (typeof global.crozzoNormalizeAppRol === 'function') {
      rol = global.crozzoNormalizeAppRol(rol);
    } else {
      rol = String(rol || 'caja')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/-/g, '_');
    }
    if (rol === 'administrador' || rol === 'gerente' || rol === 'superadmin' || rol === 'super_admin') return 'admin';
    if (rol === 'jefe_compras' || rol === 'jefe-compras') return 'inventario';
    if (rol === 'cajero' || rol === 'cajera' || rol === 'punto_venta' || rol === 'pos' || rol === 'cajero_pos') return 'caja';
    if (ROLE_ORDER.indexOf(rol) >= 0) return rol;
    return 'user';
  }

  function migrateRoleQuickAppsKeys(client) {
    if (!client || !client.roleQuickApps || typeof client.roleQuickApps !== 'object') return client;
    if (Array.isArray(client.roleQuickApps.cajero) && !Array.isArray(client.roleQuickApps.caja)) {
      client.roleQuickApps.caja = client.roleQuickApps.cajero.slice();
    }
    if (Array.isArray(client.roleQuickApps.cajera) && !Array.isArray(client.roleQuickApps.caja)) {
      client.roleQuickApps.caja = client.roleQuickApps.cajera.slice();
    }
    delete client.roleQuickApps.cajero;
    delete client.roleQuickApps.cajera;
    return client;
  }

  function resolveStoredRoleQuickApps(client, policyRole) {
    if (!client || !client.roleQuickApps || typeof client.roleQuickApps !== 'object') return null;
    if (Array.isArray(client.roleQuickApps[policyRole])) return client.roleQuickApps[policyRole].slice();
    if (policyRole === 'caja') {
      if (Array.isArray(client.roleQuickApps.cajero)) return client.roleQuickApps.cajero.slice();
      if (Array.isArray(client.roleQuickApps.cajera)) return client.roleQuickApps.cajera.slice();
    }
    return null;
  }

  function buildEmptyRoleQuickApps() {
    var out = {};
    ROLE_ORDER.forEach(function (role) {
      out[role] = [];
    });
    return out;
  }

  function getActiveClient() {
    return typeof global.crozzoGetActiveClientProfile === 'function' ? global.crozzoGetActiveClientProfile() : null;
  }

  function defaultForRole(role) {
    var r = normalizePolicyRole(role);
    return (DEFAULTS[r] || []).slice();
  }

  function getClientRoleQuickApps(client, role) {
    var r = normalizePolicyRole(role);
    if (!client) client = getActiveClient();
    migrateRoleQuickAppsKeys(client);
    var stored = resolveStoredRoleQuickApps(client, r);
    if (stored) return stored;
    return defaultForRole(r);
  }

  function syncClientRoleQuickApps(client) {
    if (!client || typeof client !== 'object') return client;
    if (!client.roleQuickApps || typeof client.roleQuickApps !== 'object') client.roleQuickApps = {};
    migrateRoleQuickAppsKeys(client);
    ROLE_ORDER.forEach(function (role) {
      if (!Array.isArray(client.roleQuickApps[role])) {
        client.roleQuickApps[role] = defaultForRole(role);
      }
    });
    return client;
  }

  function userBypassQuickAppsPolicy(u) {
    if (!u) return false;
    if (typeof global.isSuperAdminUser === 'function' && global.isSuperAdminUser()) return true;
    return false;
  }

  function userCanUseQuickApp(appId, u) {
    if (!appId) return false;
    if (!u) u = typeof global.getCurrentUser === 'function' ? global.getCurrentUser() : null;
    if (!u) return false;
    if (userBypassQuickAppsPolicy(u)) return true;
    var allowed = getClientRoleQuickApps(getActiveClient(), u.rol);
    return allowed.indexOf(appId) >= 0;
  }

  function userAllowedQuickApps(u) {
    if (!u) u = typeof global.getCurrentUser === 'function' ? global.getCurrentUser() : null;
    if (!u) return [];
    if (userBypassQuickAppsPolicy(u)) return APPS.map(function (a) { return a.id; });
    return getClientRoleQuickApps(getActiveClient(), u.rol);
  }

  function userHasAnyQuickApp(u) {
    return userAllowedQuickApps(u).length > 0;
  }

  function webEmbedPageToQuickApp(page) {
    for (var i = 0; i < APPS.length; i++) {
      if (APPS[i].page === page) return APPS[i].id;
    }
    return null;
  }

  function userCanAccessWebEmbedPage(page, u) {
    if (typeof global.crozzoIsTauriWebEmbedAllowed === 'function' && !global.crozzoIsTauriWebEmbedAllowed()) return false;
    var appId = webEmbedPageToQuickApp(page);
    if (!appId) return false;
    return userCanUseQuickApp(appId, u);
  }

  function renderPolicyEditor(client, opts) {
    opts = opts || {};
    if (!client) client = getActiveClient() || {};
    syncClientRoleQuickApps(client);

    var tabs =
      '<div class="crozzo-perm-policy-tabs crozzo-quick-apps-policy-tabs" role="tablist">' +
      ROLE_ORDER.map(function (role, idx) {
        return (
          '<button type="button" class="crozzo-perm-policy-tab crozzo-quick-apps-policy-tab' +
          (idx === 0 ? ' crozzo-perm-policy-tab--active' : '') +
          '" data-quick-apps-role-tab="' +
          esc(role) +
          '" role="tab">' +
          esc(ROLE_LABELS[role] || role) +
          '</button>'
        );
      }).join('') +
      '</div>';

    var panels = ROLE_ORDER.map(function (role, idx) {
      var allowed = new Set(getClientRoleQuickApps(client, role));
      var checks = APPS.map(function (app) {
        var on = allowed.has(app.id);
        return (
          '<label class="crozzo-quick-apps-policy-check">' +
          '<input type="checkbox" data-quick-apps-role="' +
          esc(role) +
          '" data-quick-app="' +
          esc(app.id) +
          '"' +
          (on ? ' checked' : '') +
          '>' +
          '<span>' +
          esc(app.label) +
          '</span></label>'
        );
      }).join('');
      return (
        '<div class="crozzo-perm-policy-panel crozzo-quick-apps-policy-panel' +
        (idx === 0 ? ' crozzo-perm-policy-panel--active' : '') +
        '" data-quick-apps-role-panel="' +
        esc(role) +
        '" role="tabpanel">' +
        '<p class="form-hint" style="margin:0 0 10px;">Marque las apps que verá el botón <strong>+</strong> en PC para «' +
        esc(ROLE_LABELS[role] || role) +
        '». Sin ninguna marcada, no verán el botón.</p>' +
        '<div class="crozzo-quick-apps-policy-checks">' +
        checks +
        '</div>' +
        '<div class="crozzo-quick-apps-policy-presets">' +
        '<button type="button" class="btn btn-outline btn-sm" data-quick-apps-preset="' +
        esc(role) +
        '" data-quick-apps-mode="none">Ninguna</button>' +
        '<button type="button" class="btn btn-outline btn-sm" data-quick-apps-preset="' +
        esc(role) +
        '" data-quick-apps-mode="caja">Cajero (WA + Dataico + DIAN)</button>' +
        '<button type="button" class="btn btn-outline btn-sm" data-quick-apps-preset="' +
        esc(role) +
        '" data-quick-apps-mode="all">Todas</button>' +
        '</div></div>'
      );
    }).join('');

    var intro =
      opts.context === 'usuarios'
        ? 'Define qué integraciones web muestra el botón flotante <strong>+</strong> en PC según el rol.'
        : 'Configure qué apps del botón <strong>+</strong> (WhatsApp, Gmail, Drive, Dataico, DIAN, Spotify) puede usar cada rol en PC Tauri.';

    return (
      '<div class="card crozzo-gestion-page__card crozzo-quick-apps-policy-card">' +
      '<h3 class="crozzo-gestion-page__card-title">Apps rápidas (botón +)</h3>' +
      '<p class="form-hint">' +
      intro +
      ' Mesero y cocina suelen quedar sin acceso.</p>' +
      tabs +
      '<div class="crozzo-perm-policy-panels">' +
      panels +
      '</div></div>'
    );
  }

  function bindPolicyEditor(root) {
    if (!root) return;
    root.querySelectorAll('[data-quick-apps-role-tab]').forEach(function (btn) {
      if (btn._crozzoQuickAppsTab) return;
      btn._crozzoQuickAppsTab = true;
      btn.addEventListener('click', function () {
        var role = btn.getAttribute('data-quick-apps-role-tab');
        root.querySelectorAll('[data-quick-apps-role-tab]').forEach(function (b) {
          b.classList.toggle('crozzo-perm-policy-tab--active', b === btn);
        });
        root.querySelectorAll('[data-quick-apps-role-panel]').forEach(function (p) {
          p.classList.toggle('crozzo-perm-policy-panel--active', p.getAttribute('data-quick-apps-role-panel') === role);
        });
      });
    });
    root.querySelectorAll('[data-quick-apps-preset]').forEach(function (btn) {
      if (btn._crozzoQuickAppsPreset) return;
      btn._crozzoQuickAppsPreset = true;
      btn.addEventListener('click', function () {
        var role = btn.getAttribute('data-quick-apps-preset');
        var mode = btn.getAttribute('data-quick-apps-mode');
        var panel = root.querySelector('[data-quick-apps-role-panel="' + role + '"]');
        if (!panel) return;
        var pick = [];
        if (mode === 'all') pick = APPS.map(function (a) { return a.id; });
        else if (mode === 'caja') pick = ['wa', 'dataico', 'dian'];
        panel.querySelectorAll('input[data-quick-apps-role][data-quick-app]').forEach(function (cb) {
          var id = cb.getAttribute('data-quick-app');
          cb.checked = mode === 'none' ? false : pick.indexOf(id) >= 0;
        });
      });
    });
  }

  function collectRoleQuickAppsFromDom(root, opts) {
    opts = opts || {};
    var scope = root || document;
    if (!scope.querySelectorAll) {
      if (opts.preserveClient) {
        migrateRoleQuickAppsKeys(opts.preserveClient);
        syncClientRoleQuickApps(opts.preserveClient);
        return JSON.parse(JSON.stringify(opts.preserveClient.roleQuickApps || buildEmptyRoleQuickApps()));
      }
      return buildEmptyRoleQuickApps();
    }
    var inputs = scope.querySelectorAll('input[data-quick-apps-role][data-quick-app]');
    if (!inputs.length) {
      if (opts.preserveClient) {
        migrateRoleQuickAppsKeys(opts.preserveClient);
        syncClientRoleQuickApps(opts.preserveClient);
        return JSON.parse(JSON.stringify(opts.preserveClient.roleQuickApps || buildEmptyRoleQuickApps()));
      }
      return buildEmptyRoleQuickApps();
    }
    var out = buildEmptyRoleQuickApps();
    inputs.forEach(function (cb) {
      if (!cb.checked) return;
      var role = cb.getAttribute('data-quick-apps-role');
      var app = cb.getAttribute('data-quick-app');
      if (!out[role]) out[role] = [];
      if (out[role].indexOf(app) < 0) out[role].push(app);
    });
    migrateRoleQuickAppsKeys({ roleQuickApps: out });
    return out;
  }

  global.CrozzoQuickAppsPolicy = {
    APPS: APPS,
    ROLE_ORDER: ROLE_ORDER,
    DEFAULTS: DEFAULTS,
    migrateRoleQuickAppsKeys: migrateRoleQuickAppsKeys,
    syncClientRoleQuickApps: syncClientRoleQuickApps,
    getClientRoleQuickApps: getClientRoleQuickApps,
    userCanUseQuickApp: userCanUseQuickApp,
    userAllowedQuickApps: userAllowedQuickApps,
    userHasAnyQuickApp: userHasAnyQuickApp,
    webEmbedPageToQuickApp: webEmbedPageToQuickApp,
    userCanAccessWebEmbedPage: userCanAccessWebEmbedPage,
    renderPolicyEditor: renderPolicyEditor,
    bindPolicyEditor: bindPolicyEditor,
    collectRoleQuickAppsFromDom: collectRoleQuickAppsFromDom,
  };

  global.crozzoUserCanUseQuickApp = userCanUseQuickApp;
  global.crozzoUserAllowedQuickApps = userAllowedQuickApps;
  global.crozzoUserHasAnyQuickApp = userHasAnyQuickApp;
  global.crozzoWebEmbedPageToQuickApp = webEmbedPageToQuickApp;
  global.crozzoUserCanAccessWebEmbedPage = userCanAccessWebEmbedPage;
})(typeof window !== 'undefined' ? window : global);
