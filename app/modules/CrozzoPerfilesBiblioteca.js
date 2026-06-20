/**
 * Crozzo POS — Biblioteca de plantillas de empresa y perfiles de usuario.
 * Guardar → aplicar en un clic (Super Admin + Admin negocio).
 */
(function (global) {
  'use strict';

  var LS_STAFF_TPL = 'crozzo_staff_templates_v1';

  var TIPO_GRUPOS = [
    {
      id: 'lanzamiento',
      label: 'Plan básico (lanzamiento)',
      desc: 'Perfiles incluidos en la oferta inicial. Solo cambia la operación (restaurante vs tienda).',
      presets: [
        { id: 'basico_restaurante', tag: 'Restaurante · mesas y cocina' },
        { id: 'basico_tienda', tag: 'Tienda comercial · mostrador' },
      ],
    },
  ];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getMeta(presetId) {
    if (global.CrozzoPerfilesOperativos && global.CrozzoPerfilesOperativos.getMeta) {
      return global.CrozzoPerfilesOperativos.getMeta(presetId);
    }
    return { label: presetId, desc: '', icon: '📦' };
  }

  function loadCfg() {
    if (typeof global.crozzoLoadMenuProfilesConfig === 'function') {
      return global.crozzoLoadMenuProfilesConfig();
    }
    return { clients: {}, activeClientId: 'default', savedTemplates: [] };
  }

  function saveCfg(cfg) {
    if (typeof global.crozzoSaveMenuProfilesConfig === 'function') {
      global.crozzoSaveMenuProfilesConfig(cfg);
    }
  }

  function ensureSavedTemplates(cfg) {
    if (!cfg.savedTemplates || !Array.isArray(cfg.savedTemplates)) cfg.savedTemplates = [];
    return cfg.savedTemplates;
  }

  function captureClientSnapshot(client) {
    if (!client) return null;
    return {
      perfil: client.perfil || 'basico_restaurante',
      tema: client.tema || 'bona-origen',
      menus: JSON.parse(JSON.stringify(client.menus || {})),
      roles: JSON.parse(JSON.stringify(client.roles || {})),
      rolePerms: JSON.parse(JSON.stringify(client.rolePerms || {})),
    };
  }

  function applySnapshotToClient(client, snap) {
    if (!client || !snap) return client;
    client.perfil = snap.perfil || 'basico_restaurante';
    client.tema = snap.tema || client.tema || 'bona-origen';
    client.menus = JSON.parse(JSON.stringify(snap.menus || {}));
    client.roles = JSON.parse(JSON.stringify(snap.roles || {}));
    client.rolePerms = JSON.parse(JSON.stringify(snap.rolePerms || {}));
    if (client.perfil !== 'personalizado' && global.CrozzoPerfilesOperativos && global.CrozzoPerfilesOperativos.syncClient) {
      global.CrozzoPerfilesOperativos.syncClient(client, client.perfil);
    }
    if (global.CrozzoPermisosPolicy && global.CrozzoPermisosPolicy.syncClientRolePerms) {
      if (snap.rolePerms && Object.keys(snap.rolePerms).length) {
        client.rolePerms = JSON.parse(JSON.stringify(snap.rolePerms));
      } else {
        global.CrozzoPermisosPolicy.syncClientRolePerms(client);
      }
    }
    return client;
  }

  function saveEmpresaPlantilla(nombre, descripcion) {
    var cfg = loadCfg();
    var cid = cfg.activeClientId || 'default';
    var client = cfg.clients[cid] || cfg.clients.default;
    if (!client) return false;
    var name = String(nombre || '').trim();
    if (!name) {
      if (typeof global.showToast === 'function') global.showToast('Indique un nombre para la plantilla', 'warning');
      return false;
    }
    var list = ensureSavedTemplates(cfg);
    var id = 'tpl_' + Date.now().toString(36);
    var meta = getMeta(client.perfil);
    list.unshift({
      id: id,
      nombre: name,
      descripcion: String(descripcion || '').trim(),
      tipo: meta.tipo || 'general',
      basePreset: client.perfil || 'basico_restaurante',
      snapshot: captureClientSnapshot(client),
      createdAt: new Date().toISOString(),
    });
    saveCfg(cfg);
    if (typeof global.showToast === 'function') global.showToast('Plantilla «' + name + '» guardada', 'success');
    return id;
  }

  function applyEmpresaPlantilla(templateId) {
    var cfg = loadCfg();
    var list = ensureSavedTemplates(cfg);
    var tpl = list.find(function (t) {
      return t.id === templateId;
    });
    if (!tpl || !tpl.snapshot) return false;
    var cid = cfg.activeClientId || 'default';
    var client = cfg.clients[cid] || cfg.clients.default;
    applySnapshotToClient(client, tpl.snapshot);
    saveCfg(cfg);
    try {
      localStorage.setItem('crozzo_perfil_empresa', client.perfil || 'basico_restaurante');
    } catch (_) {}
    if (typeof global.crozzoRebuildMenusFromRoles === 'function') global.crozzoRebuildMenusFromRoles();
    if (typeof global.crozzoGestionPerfilesRefreshUI === 'function') global.crozzoGestionPerfilesRefreshUI();
    if (typeof global.showToast === 'function') {
      global.showToast('Plantilla «' + tpl.nombre + '» aplicada a «' + (client.nombre || cid) + '»', 'success');
    }
    try {
      global.dispatchEvent(
        new CustomEvent('crozzo-perfil-operativo-changed', { detail: { perfil: client.perfil, template: tpl.id } })
      );
    } catch (_) {}
    return true;
  }

  function deleteEmpresaPlantilla(templateId) {
    var cfg = loadCfg();
    var list = ensureSavedTemplates(cfg);
    var idx = list.findIndex(function (t) {
      return t.id === templateId;
    });
    if (idx < 0) return false;
    var name = list[idx].nombre;
    list.splice(idx, 1);
    saveCfg(cfg);
    if (typeof global.showToast === 'function') global.showToast('Plantilla «' + name + '» eliminada', 'info');
    if (typeof global.crozzoGestionPerfilesRefreshUI === 'function') global.crozzoGestionPerfilesRefreshUI();
    return true;
  }

  function loadStaffTemplates() {
    try {
      var fromCfg = global.config && typeof global.config.get === 'function' ? global.config.get('usuarios') : null;
      if (fromCfg && Array.isArray(fromCfg.staffTemplates) && fromCfg.staffTemplates.length) {
        return fromCfg.staffTemplates.slice();
      }
    } catch (_) {}
    try {
      var raw = localStorage.getItem(LS_STAFF_TPL);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return [];
  }

  function persistStaffTemplates(list) {
    try {
      var base = global.config && typeof global.config.get === 'function' ? global.config.get('usuarios') || {} : {};
      base.staffTemplates = list;
      if (global.config && typeof global.config.set === 'function') {
        global.config.set('usuarios', base);
      }
    } catch (_) {}
    try {
      localStorage.setItem(LS_STAFF_TPL, JSON.stringify(list));
    } catch (_) {}
  }

  function saveStaffPlantilla(nombre, userId) {
    var name = String(nombre || '').trim();
    if (!name) return false;
    var conf = typeof global.getUsuariosConfig === 'function' ? global.getUsuariosConfig() : { staff: [] };
    var u = (conf.staff || []).find(function (s) {
      return s.id === userId;
    });
    if (!u) return false;
    var list = loadStaffTemplates();
    list.unshift({
      id: 'staff_' + Date.now().toString(36),
      nombre: name,
      rol: u.rol,
      permisos: JSON.parse(JSON.stringify(u.permisos || {})),
      configDispositivo: JSON.parse(JSON.stringify(u.configDispositivo || {})),
      createdAt: new Date().toISOString(),
    });
    persistStaffTemplates(list);
    if (typeof global.showToast === 'function') global.showToast('Perfil de usuario «' + name + '» guardado', 'success');
    return true;
  }

  function applyStaffPlantilla(userId, templateId) {
    var list = loadStaffTemplates();
    var tpl = list.find(function (t) {
      return t.id === templateId;
    });
    if (!tpl) return false;
    var conf = typeof global.getUsuariosConfig === 'function' ? global.getUsuariosConfig() : { staff: [] };
    var permisos = JSON.parse(JSON.stringify(tpl.permisos || {}));
    if (typeof global.crozzoSanitizeUserPermisos === 'function') {
      permisos = global.crozzoSanitizeUserPermisos(permisos, tpl.rol || 'caja');
    }
    conf.staff = (conf.staff || []).map(function (u) {
      if (u.id !== userId) return u;
      return Object.assign({}, u, {
        rol: tpl.rol || u.rol,
        permisos: permisos,
        configDispositivo: Object.assign({}, u.configDispositivo || {}, tpl.configDispositivo || {}),
      });
    });
    if (typeof global.saveUsuarios === 'function') global.saveUsuarios(conf.staff);
    if (typeof global.crozzoRefreshUsuariosPage === 'function') global.crozzoRefreshUsuariosPage();
    if (typeof global.showToast === 'function') global.showToast('Perfil «' + tpl.nombre + '» aplicado', 'success');
    return true;
  }

  function deleteStaffPlantilla(templateId) {
    var list = loadStaffTemplates().filter(function (t) {
      return t.id !== templateId;
    });
    persistStaffTemplates(list);
    if (typeof global.showToast === 'function') global.showToast('Perfil de usuario eliminado', 'info');
    return true;
  }

  function renderBusinessTypeGrid(activePresetId) {
    var cur = String(activePresetId || 'basico_restaurante');
    var html = '<div class="crozzo-tipo-negocio-grid">';
    TIPO_GRUPOS.forEach(function (grupo) {
      html +=
        '<div class="crozzo-tipo-negocio-group">' +
        '<div class="crozzo-tipo-negocio-group__head">' +
        '<strong>' +
        esc(grupo.label) +
        '</strong>' +
        '<span class="form-hint">' +
        esc(grupo.desc) +
        '</span></div>' +
        '<div class="crozzo-tipo-negocio-cards">';
      grupo.presets.forEach(function (p) {
        var meta = getMeta(p.id);
        var active = cur === p.id ? ' crozzo-tipo-negocio-card--active' : '';
        html +=
          '<button type="button" class="crozzo-tipo-negocio-card' +
          active +
          '" data-preset-id="' +
          esc(p.id) +
          '" onclick="CrozzoPerfilesBiblioteca.selectPreset(\'' +
          esc(p.id) +
          '\')" title="' +
          esc(meta.desc || '') +
          '">' +
          '<span class="crozzo-tipo-negocio-card__icon">' +
          (meta.icon || '📦') +
          '</span>' +
          '<span class="crozzo-tipo-negocio-card__title">' +
          esc(meta.label || p.id) +
          '</span>' +
          '<span class="crozzo-tipo-negocio-card__tag">' +
          esc(p.tag) +
          '</span></button>';
      });
      html += '</div></div>';
    });
    html += '</div>';
    return html;
  }

  function renderEmpresaPlantillasPanel(activeClient) {
    var cfg = loadCfg();
    var list = ensureSavedTemplates(cfg);
    var html =
      '<div class="card crozzo-gestion-page__card crozzo-plantillas-card">' +
      '<div class="crozzo-plantillas-card__head">' +
      '<div><h3 class="crozzo-gestion-page__card-title" style="margin:0;">Mis plantillas de empresa</h3>' +
      '<p class="form-hint" style="margin:6px 0 0;">Guarde la configuración actual (módulos, roles y permisos) y aplíquela a cualquier cliente en un clic.</p></div>' +
      '<div class="crozzo-plantillas-card__actions">' +
      '<button type="button" class="btn btn-primary btn-sm" onclick="CrozzoPerfilesBiblioteca.promptSaveEmpresa()">Guardar configuración actual</button>' +
      '</div></div>';
    if (!list.length) {
      html += '<p class="form-hint crozzo-plantillas-empty">Aún no hay plantillas. Configure el negocio abajo y pulse <strong>Guardar configuración actual</strong>.</p>';
    } else {
      html += '<div class="crozzo-plantillas-list">';
      list.forEach(function (tpl) {
        var meta = getMeta(tpl.basePreset);
        html +=
          '<div class="crozzo-plantilla-row">' +
          '<div class="crozzo-plantilla-row__info">' +
          '<strong>' +
          esc(tpl.nombre) +
          '</strong>' +
          '<span class="form-hint">' +
          esc(meta.label || tpl.basePreset) +
          (tpl.descripcion ? ' · ' + esc(tpl.descripcion) : '') +
          '</span></div>' +
          '<div class="crozzo-plantilla-row__btns">' +
          '<button type="button" class="btn btn-primary btn-sm" onclick="CrozzoPerfilesBiblioteca.applyEmpresa(\'' +
          esc(tpl.id) +
          '\')">Aplicar</button>' +
          '<button type="button" class="btn btn-outline btn-sm" onclick="CrozzoPerfilesBiblioteca.confirmDeleteEmpresa(\'' +
          esc(tpl.id) +
          '\',\'' +
          esc(tpl.nombre).replace(/'/g, '') +
          '\')">Eliminar</button>' +
          '</div></div>';
      });
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  function renderGestionWizardTabs(activeTab) {
    var tab = activeTab || 'empresa';
    var tabs = [
      { id: 'empresa', label: '1. Tipo de negocio' },
      { id: 'modulos', label: '2. Módulos y roles' },
      { id: 'permisos', label: '3. Permisos delegables' },
      { id: 'plantillas', label: '4. Mis plantillas' },
    ];
    var html = '<div class="crozzo-gestion-wizard-tabs" role="tablist">';
    tabs.forEach(function (t) {
      html +=
        '<button type="button" class="crozzo-gestion-wizard-tab' +
        (tab === t.id ? ' crozzo-gestion-wizard-tab--active' : '') +
        '" data-gestion-tab="' +
        esc(t.id) +
        '" role="tab">' +
        esc(t.label) +
        '</button>';
    });
    html += '</div>';
    return html;
  }

  function renderStaffPlantillasSelect(selectedId, includeEmpty) {
    var list = loadStaffTemplates();
    var html = includeEmpty !== false ? '<option value="">Elegir perfil…</option>' : '';
    var builtins = global.CROZZO_STAFF_PLANTILLAS || {};
    html += '<optgroup label="Plantillas estándar">';
    Object.keys(builtins).forEach(function (key) {
      var t = builtins[key];
      html += '<option value="builtin:' + esc(key) + '">' + esc(t.label || key) + '</option>';
    });
    html += '</optgroup>';
    if (list.length) {
      html += '<optgroup label="Mis perfiles guardados">';
      list.forEach(function (t) {
        html +=
          '<option value="saved:' +
          esc(t.id) +
          '"' +
          (selectedId === t.id ? ' selected' : '') +
          '>' +
          esc(t.nombre) +
          ' (' +
          esc(t.rol) +
          ')</option>';
      });
      html += '</optgroup>';
    }
    return html;
  }

  function renderUsuariosPlantillasPanel() {
    var list = loadStaffTemplates();
    if (!list.length) return '';
    var rows = list
      .map(function (t) {
        return (
          '<div class="crozzo-staff-tpl-row">' +
          '<div><strong>' +
          esc(t.nombre) +
          '</strong> <span class="badge">' +
          esc(t.rol) +
          '</span></div>' +
          '<button type="button" class="btn btn-outline btn-sm" onclick="CrozzoPerfilesBiblioteca.confirmDeleteStaff(\'' +
          esc(t.id) +
          '\')">Eliminar</button></div>'
        );
      })
      .join('');
    return (
      '<div class="card crozzo-staff-tpl-card" style="margin-bottom:14px;">' +
      '<div class="card-header"><span class="card-title">Perfiles de usuario guardados</span></div>' +
      '<p class="form-hint">Al crear o editar un usuario, elija uno de estos perfiles para aplicar permisos en un clic.</p>' +
      '<div class="crozzo-staff-tpl-list">' +
      rows +
      '</div></div>'
    );
  }

  function selectPreset(presetId) {
    var sel = document.getElementById('perfil-empresa-select');
    if (sel) sel.value = presetId;
    if (typeof global.crozzoGestionPerfilesRefreshUI === 'function') {
      global.crozzoGestionPerfilesRefreshUI(presetId);
    }
    if (typeof global.showToast === 'function') {
      var meta = getMeta(presetId);
      global.showToast('Tipo «' + (meta.label || presetId) + '» — pulse Guardar para confirmar', 'info');
    }
  }

  function promptSaveEmpresa() {
    var nombre = prompt('Nombre de la plantilla de empresa:', 'Mi configuración');
    if (!nombre || !nombre.trim()) return;
    var desc = prompt('Descripción breve (opcional):', '') || '';
    saveEmpresaPlantilla(nombre.trim(), desc.trim());
    if (typeof global.crozzoGestionPerfilesRefreshUI === 'function') global.crozzoGestionPerfilesRefreshUI();
  }

  function confirmDeleteEmpresa(id, name) {
    if (!confirm('¿Eliminar la plantilla «' + (name || id) + '»?')) return;
    deleteEmpresaPlantilla(id);
  }

  function confirmDeleteStaff(id) {
    if (!confirm('¿Eliminar este perfil de usuario guardado?')) return;
    deleteStaffPlantilla(id);
    if (typeof global.crozzoRefreshUsuariosPage === 'function') global.crozzoRefreshUsuariosPage();
  }

  function promptSaveStaff(userId) {
    var nombre = prompt('Nombre del perfil (ej. Cajero fin de semana):', '');
    if (!nombre || !nombre.trim()) return;
    saveStaffPlantilla(nombre.trim(), userId);
  }

  function resolveStaffPlantillaValue(val, rolFallback) {
    if (!val) return null;
    if (val.indexOf('builtin:') === 0) {
      var key = val.slice(8);
      if (typeof global.crozzoStaffFromPlantilla === 'function') {
        return global.crozzoStaffFromPlantilla(key, rolFallback);
      }
    }
    if (val.indexOf('saved:') === 0) {
      var id = val.slice(6);
      var tpl = loadStaffTemplates().find(function (t) {
        return t.id === id;
      });
      if (tpl) {
        return { rol: tpl.rol, permisos: JSON.parse(JSON.stringify(tpl.permisos || {})) };
      }
    }
    return null;
  }

  function bindGestionWizard(root) {
    if (!root) root = document.getElementById('gestion-perfiles');
    if (!root) return;
    var tab = root.getAttribute('data-gestion-tab') || 'empresa';
    root.querySelectorAll('[data-gestion-tab]').forEach(function (btn) {
      if (btn._crozzoTabBound) return;
      btn._crozzoTabBound = true;
      btn.addEventListener('click', function () {
        var next = btn.getAttribute('data-gestion-tab');
        root.setAttribute('data-gestion-tab', next);
        root.querySelectorAll('.crozzo-gestion-wizard-tab').forEach(function (b) {
          b.classList.toggle('crozzo-gestion-wizard-tab--active', b === btn);
        });
        root.querySelectorAll('[data-gestion-panel]').forEach(function (panel) {
          panel.hidden = panel.getAttribute('data-gestion-panel') !== next;
        });
      });
    });
    root.querySelectorAll('[data-gestion-panel]').forEach(function (panel) {
      panel.hidden = panel.getAttribute('data-gestion-panel') !== tab;
    });
  }

  global.CrozzoPerfilesBiblioteca = {
    TIPO_GRUPOS: TIPO_GRUPOS,
    saveEmpresaPlantilla: saveEmpresaPlantilla,
    applyEmpresaPlantilla: applyEmpresaPlantilla,
    deleteEmpresaPlantilla: deleteEmpresaPlantilla,
    saveStaffPlantilla: saveStaffPlantilla,
    applyStaffPlantilla: applyStaffPlantilla,
    deleteStaffPlantilla: deleteStaffPlantilla,
    loadStaffTemplates: loadStaffTemplates,
    renderBusinessTypeGrid: renderBusinessTypeGrid,
    renderEmpresaPlantillasPanel: renderEmpresaPlantillasPanel,
    renderGestionWizardTabs: renderGestionWizardTabs,
    renderStaffPlantillasSelect: renderStaffPlantillasSelect,
    renderUsuariosPlantillasPanel: renderUsuariosPlantillasPanel,
    selectPreset: selectPreset,
    promptSaveEmpresa: promptSaveEmpresa,
    confirmDeleteEmpresa: confirmDeleteEmpresa,
    confirmDeleteStaff: confirmDeleteStaff,
    promptSaveStaff: promptSaveStaff,
    resolveStaffPlantillaValue: resolveStaffPlantillaValue,
    bindGestionWizard: bindGestionWizard,
    applyEmpresa: applyEmpresaPlantilla,
  };
})(typeof window !== 'undefined' ? window : globalThis);
