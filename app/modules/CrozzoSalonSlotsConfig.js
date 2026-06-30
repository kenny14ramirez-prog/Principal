(function (global) {
  'use strict';

  var DEFAULT_MESA_COUNT = 40;
  var DEFAULT_LLEVAR_COUNT = 10;

  function escHtml(s) {
    if (typeof global.escHtml === 'function') return global.escHtml(s);
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escUserAttr(s) {
    if (typeof global.escUserAttr === 'function') return global.escUserAttr(s);
    return escHtml(s);
  }

  function getCfg() {
    return typeof global.config !== 'undefined' && global.config ? global.config : null;
  }

  function normalizeEtiquetaTablet(v) {
    return v === 'nombre' ? 'nombre' : 'solo_numero';
  }

  function normalizeSalonConfig(raw) {
    var base = {
      mesaCount: DEFAULT_MESA_COUNT,
      llevarCount: DEFAULT_LLEVAR_COUNT,
      mesaEtiquetaTablet: 'solo_numero',
      llevarEtiquetaTablet: 'solo_numero',
      mesaNombres: {},
      llevarNombres: {},
    };
    var c = raw && typeof raw === 'object' ? Object.assign({}, base, raw) : base;
    c.mesaCount = Math.max(1, Math.min(100, Number(c.mesaCount) || DEFAULT_MESA_COUNT));
    c.llevarCount = Math.max(1, Math.min(60, Number(c.llevarCount) || DEFAULT_LLEVAR_COUNT));
    c.mesaEtiquetaTablet = normalizeEtiquetaTablet(c.mesaEtiquetaTablet);
    c.llevarEtiquetaTablet = normalizeEtiquetaTablet(c.llevarEtiquetaTablet);
    c.mesaNombres = c.mesaNombres && typeof c.mesaNombres === 'object' ? c.mesaNombres : {};
    c.llevarNombres = c.llevarNombres && typeof c.llevarNombres === 'object' ? c.llevarNombres : {};
    return c;
  }

  function getSalonConfig() {
    var cm = getCfg();
    if (!cm || typeof cm.get !== 'function') return normalizeSalonConfig(null);
    return normalizeSalonConfig(cm.get('salon'));
  }

  function saveSalonConfig(next) {
    var cm = getCfg();
    var normalized = normalizeSalonConfig(next);
    if (!cm || typeof cm.set !== 'function') {
      console.warn('[salon] ConfigManager no disponible al guardar mesas');
      if (typeof global.showToast === 'function') {
        global.showToast('No se guardaron las mesas. Recargue la app e intente de nuevo.', 'error');
      }
      return normalized;
    }
    cm.set('salon', normalized);
    if (typeof cm.addAudit === 'function') {
      cm.addAudit('config_salon_actualizada', 'Mesas: ' + normalized.mesaCount + ' · Llevar: ' + normalized.llevarCount);
    }
    return normalized;
  }

  function slotNumFromId(id) {
    var n = parseInt(String(id || '').replace(/\D/g, ''), 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function buildSalonSlotList(tipo, cfg) {
    cfg = normalizeSalonConfig(cfg || getSalonConfig());
    var isMesa = tipo === 'mesa';
    var count = isMesa ? cfg.mesaCount : cfg.llevarCount;
    var prefix = isMesa ? 'M' : 'L';
    var defaultLabel = isMesa ? 'Mesa ' : 'Llevar ';
    var nombres = isMesa ? cfg.mesaNombres : cfg.llevarNombres;
    var out = [];
    for (var i = 1; i <= count; i++) {
      var id = prefix + i;
      var custom = String((nombres && nombres[id]) || '').trim();
      out.push({
        id: id,
        num: i,
        nombre: custom || defaultLabel + i,
      });
    }
    return out;
  }

  function crozzoSlotDisplayLabel(tipo, slot, vista) {
    if (!slot) return '';
    vista = vista === 'tablet' ? 'tablet' : 'caja';
    var cfg = getSalonConfig();
    var isMesa = tipo === 'mesa';
    if (vista === 'caja') return String(slot.nombre || '');
    var modo = isMesa ? cfg.mesaEtiquetaTablet : cfg.llevarEtiquetaTablet;
    if (modo === 'solo_numero') {
      var num = slot.num != null ? slot.num : slotNumFromId(slot.id);
      return num ? String(num) : String(slot.id || '');
    }
    return String(slot.nombre || '');
  }

  function crozzoSlotCardExtraClass(tipo, vista) {
    vista = vista === 'tablet' ? 'tablet' : 'caja';
    if (vista !== 'tablet') return '';
    var cfg = getSalonConfig();
    var modo = tipo === 'mesa' ? cfg.mesaEtiquetaTablet : cfg.llevarEtiquetaTablet;
    return modo === 'solo_numero' ? ' crozzo-slot--solo-numero' : '';
  }

  function applySalonSlotsToRuntime(opts) {
    opts = opts || {};
    var cfg = getSalonConfig();
    var mesas = buildSalonSlotList('mesa', cfg);
    var llevar = buildSalonSlotList('llevar', cfg);
    if (typeof global.crozzoApplySalonSlotLists === 'function') {
      global.crozzoApplySalonSlotLists(mesas, llevar);
    } else if (typeof global.mesasCaja !== 'undefined' && Array.isArray(global.mesasCaja)) {
      global.mesasCaja.length = 0;
      mesas.forEach(function (m) {
        global.mesasCaja.push(m);
      });
    } else {
      global.mesasCaja = mesas.slice();
    }
    if (typeof global.crozzoApplySalonSlotLists !== 'function') {
      if (typeof global.llevarCaja !== 'undefined' && Array.isArray(global.llevarCaja)) {
        global.llevarCaja.length = 0;
        llevar.forEach(function (l) {
          global.llevarCaja.push(l);
        });
      } else {
        global.llevarCaja = llevar.slice();
      }
    }
    if (!opts.silent) {
      try {
        if (typeof global.mesaSeleccionada === 'string' && !mesas.some(function (m) { return m.id === global.mesaSeleccionada; })) {
          global.mesaSeleccionada = mesas[0] ? mesas[0].id : 'M1';
        }
        if (typeof global.llevarSeleccionado === 'string' && !llevar.some(function (l) { return l.id === global.llevarSeleccionado; })) {
          global.llevarSeleccionado = llevar[0] ? llevar[0].id : 'L1';
        }
        if (typeof global.tabletMesaSeleccionada === 'string' && !mesas.some(function (m) { return m.id === global.tabletMesaSeleccionada; })) {
          global.tabletMesaSeleccionada = mesas[0] ? mesas[0].id : 'M1';
        }
        if (typeof global.tabletLlevarSeleccionado === 'string' && !llevar.some(function (l) { return l.id === global.llevarSeleccionado; })) {
          global.tabletLlevarSeleccionado = llevar[0] ? llevar[0].id : 'L1';
        }
      } catch (_) {}
    }
    return { mesas: mesas, llevar: llevar };
  }

  function renderNameGrid(tipo, cfg) {
    var list = buildSalonSlotList(tipo, cfg);
    var key = tipo === 'mesa' ? 'mesaNombres' : 'llevarNombres';
    var fieldPrefix = tipo === 'mesa' ? 'cfgSalonMesaName' : 'cfgSalonLlevarName';
    return (
      '<div class="crozzo-salon-names-grid">' +
      list
        .map(function (s) {
          var val = String((cfg[key] && cfg[key][s.id]) || '').trim();
          return (
            '<label class="crozzo-salon-name-row">' +
            '<span class="crozzo-salon-name-row__id">' +
            escHtml(String(s.num)) +
            '</span>' +
            '<input type="text" class="form-input crozzo-salon-name-row__input" id="' +
            fieldPrefix +
            escUserAttr(s.id) +
            '" data-slot-id="' +
            escUserAttr(s.id) +
            '" value="' +
            escUserAttr(val) +
            '" placeholder="' +
            escUserAttr(s.nombre) +
            '">' +
            '</label>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function renderConfigSalon() {
    var cfg = getSalonConfig();
    return (
      '<div class="card crozzo-salon-config">' +
      '<div class="card-header">' +
      '<div><h2 class="card-title">🍽️ Mesas y pedidos de llevar</h2>' +
      '<p class="page-subtitle" style="margin-top:4px;">Cantidad de slots y cómo los ven los meseros en tablets</p></div></div>' +
      '<p class="form-hint crozzo-salon-config__intro">La caja siempre muestra el nombre completo (personalizado o «Mesa N»). En tablets puede mostrar solo el número (etiqueta invisible) o nombres propios.</p>' +
      '<div class="crozzo-salon-config__grid">' +
      '<section class="crozzo-salon-config__panel">' +
      '<h3 class="crozzo-salon-config__panel-title">Mesas del salón</h3>' +
      '<div class="form-group">' +
      '<label class="form-label" for="cfgSalonMesaCount">Cantidad de mesas</label>' +
      '<input type="number" min="1" max="100" class="form-input" id="cfgSalonMesaCount" value="' +
      escUserAttr(cfg.mesaCount) +
      '">' +
      '</div>' +
      '<div class="form-group">' +
      '<label class="form-label" for="cfgSalonMesaEtiqueta">En tablet mesero</label>' +
      '<select class="form-select" id="cfgSalonMesaEtiqueta" onchange="crozzoSalonToggleNamePanels()">' +
      '<option value="solo_numero"' +
      (cfg.mesaEtiquetaTablet === 'solo_numero' ? ' selected' : '') +
      '>Solo número (nombre invisible)</option>' +
      '<option value="nombre"' +
      (cfg.mesaEtiquetaTablet === 'nombre' ? ' selected' : '') +
      '>Con nombre personalizado</option>' +
      '</select>' +
      '<span class="form-hint">«Solo número» muestra 1, 2, 3… sin texto «Mesa». Útil para meseros que conocen el mapa del local.</span>' +
      '</div>' +
      '<div class="form-group crozzo-salon-names-wrap" id="cfgSalonMesaNamesWrap" style="display:' +
      (cfg.mesaEtiquetaTablet === 'nombre' ? 'block' : 'none') +
      ';">' +
      '<label class="form-label">Nombres de mesa (opcional)</label>' +
      renderNameGrid('mesa', cfg) +
      '</div>' +
      '</section>' +
      '<section class="crozzo-salon-config__panel">' +
      '<h3 class="crozzo-salon-config__panel-title">Pedidos para llevar</h3>' +
      '<div class="form-group">' +
      '<label class="form-label" for="cfgSalonLlevarCount">Cantidad de slots llevar</label>' +
      '<input type="number" min="1" max="60" class="form-input" id="cfgSalonLlevarCount" value="' +
      escUserAttr(cfg.llevarCount) +
      '">' +
      '</div>' +
      '<div class="form-group">' +
      '<label class="form-label" for="cfgSalonLlevarEtiqueta">En tablet mesero</label>' +
      '<select class="form-select" id="cfgSalonLlevarEtiqueta" onchange="crozzoSalonToggleNamePanels()">' +
      '<option value="solo_numero"' +
      (cfg.llevarEtiquetaTablet === 'solo_numero' ? ' selected' : '') +
      '>Solo número (nombre invisible)</option>' +
      '<option value="nombre"' +
      (cfg.llevarEtiquetaTablet === 'nombre' ? ' selected' : '') +
      '>Con nombre personalizado</option>' +
      '</select>' +
      '</div>' +
      '<div class="form-group crozzo-salon-names-wrap" id="cfgSalonLlevarNamesWrap" style="display:' +
      (cfg.llevarEtiquetaTablet === 'nombre' ? 'block' : 'none') +
      ';">' +
      '<label class="form-label">Nombres de pedido llevar (opcional)</label>' +
      renderNameGrid('llevar', cfg) +
      '</div>' +
      '</section>' +
      '</div>' +
      '<div class="btn-group" style="margin-top:16px;">' +
      '<button type="button" class="btn btn-primary" onclick="saveSalonConfigFromForm()">💾 Guardar mesas y llevar</button>' +
      '</div>' +
      '</div>'
    );
  }

  function initConfigSalon() {
    crozzoSalonToggleNamePanels();
    var mesaCount = document.getElementById('cfgSalonMesaCount');
    var llevarCount = document.getElementById('cfgSalonLlevarCount');
    if (mesaCount) {
      mesaCount.addEventListener('change', function () {
        if (typeof global.renderPage === 'function') global.renderPage('config-salon');
      });
    }
    if (llevarCount) {
      llevarCount.addEventListener('change', function () {
        if (typeof global.renderPage === 'function') global.renderPage('config-salon');
      });
    }
  }

  function crozzoSalonToggleNamePanels() {
    var mesaSel = document.getElementById('cfgSalonMesaEtiqueta');
    var llevarSel = document.getElementById('cfgSalonLlevarEtiqueta');
    var mesaWrap = document.getElementById('cfgSalonMesaNamesWrap');
    var llevarWrap = document.getElementById('cfgSalonLlevarNamesWrap');
    if (mesaWrap && mesaSel) mesaWrap.style.display = mesaSel.value === 'nombre' ? 'block' : 'none';
    if (llevarWrap && llevarSel) llevarWrap.style.display = llevarSel.value === 'nombre' ? 'block' : 'none';
  }

  function collectNamesFromForm(prefix, count, tipo) {
    var cfg = getSalonConfig();
    var list = buildSalonSlotList(tipo, Object.assign({}, cfg, tipo === 'mesa' ? { mesaCount: count } : { llevarCount: count }));
    var names = {};
    list.forEach(function (s) {
      var el = document.getElementById(prefix + s.id);
      if (!el) return;
      var val = String(el.value || '').trim();
      if (val) names[s.id] = val;
    });
    return names;
  }

  function saveSalonConfigFromForm() {
    var mesaCount = Math.max(1, Math.min(100, Number(document.getElementById('cfgSalonMesaCount')?.value) || DEFAULT_MESA_COUNT));
    var llevarCount = Math.max(1, Math.min(60, Number(document.getElementById('cfgSalonLlevarCount')?.value) || DEFAULT_LLEVAR_COUNT));
    var mesaEtiquetaTablet = normalizeEtiquetaTablet(document.getElementById('cfgSalonMesaEtiqueta')?.value);
    var llevarEtiquetaTablet = normalizeEtiquetaTablet(document.getElementById('cfgSalonLlevarEtiqueta')?.value);
    var mesaNombres = mesaEtiquetaTablet === 'nombre' ? collectNamesFromForm('cfgSalonMesaName', mesaCount, 'mesa') : {};
    var llevarNombres = llevarEtiquetaTablet === 'nombre' ? collectNamesFromForm('cfgSalonLlevarName', llevarCount, 'llevar') : {};

    var activeWarn = [];
    try {
      if (typeof global.crozzoSlotHasUnpaidConsumption === 'function') {
        (global.mesasCaja || []).forEach(function (m) {
          if (slotNumFromId(m.id) > mesaCount && global.crozzoSlotHasUnpaidConsumption('mesa', m.id)) {
            activeWarn.push(m.id);
          }
        });
        (global.llevarCaja || []).forEach(function (l) {
          if (slotNumFromId(l.id) > llevarCount && global.crozzoSlotHasUnpaidConsumption('llevar', l.id)) {
            activeWarn.push(l.id);
          }
        });
      }
    } catch (_) {}
    if (activeWarn.length) {
      if (
        !confirm(
          'Hay mesas/pedidos activos fuera del nuevo rango (' +
            activeWarn.join(', ') +
            '). Si guarda, seguirán en memoria pero no aparecerán en el selector. ¿Continuar?'
        )
      ) {
        return;
      }
    }

    saveSalonConfig({
      mesaCount: mesaCount,
      llevarCount: llevarCount,
      mesaEtiquetaTablet: mesaEtiquetaTablet,
      llevarEtiquetaTablet: llevarEtiquetaTablet,
      mesaNombres: mesaNombres,
      llevarNombres: llevarNombres,
    });
    applySalonSlotsToRuntime();
    try {
      document.dispatchEvent(new CustomEvent('crozzo-salon-config-changed', { bubbles: true }));
    } catch (_) {}
    // Propaga la nueva configuración de mesas a los demás equipos vía la nube
    // (tenant snapshot). Sin esto, caja y tablets quedaban con conteos distintos.
    try {
      if (typeof global.crozzoScheduleTenantSnapshotPush === 'function') {
        global.crozzoScheduleTenantSnapshotPush();
      } else if (typeof global.crozzoPushTenantSnapshotToCloud === 'function') {
        global.crozzoPushTenantSnapshotToCloud().catch(function () {});
      }
    } catch (_) {}
    if (typeof global.showToast === 'function') {
      global.showToast('Mesas y llevar actualizados (' + mesaCount + ' mesas · ' + llevarCount + ' llevar)', 'success');
    }
    if (typeof global.renderPage === 'function' && typeof global.currentPage !== 'undefined' && global.currentPage === 'config-salon') {
      global.renderPage('config-salon');
    }
    try {
      if (typeof global.crozzoCajeroRefreshSlotPicker === 'function') global.crozzoCajeroRefreshSlotPicker();
    } catch (_) {}
  }

  global.getSalonConfig = getSalonConfig;
  global.saveSalonConfig = saveSalonConfig;
  global.buildSalonSlotList = buildSalonSlotList;
  global.crozzoSlotDisplayLabel = crozzoSlotDisplayLabel;
  global.crozzoSlotCardExtraClass = crozzoSlotCardExtraClass;
  global.applySalonSlotsToRuntime = applySalonSlotsToRuntime;
  global.renderConfigSalon = renderConfigSalon;
  global.initConfigSalon = initConfigSalon;
  global.crozzoSalonToggleNamePanels = crozzoSalonToggleNamePanels;
  global.saveSalonConfigFromForm = saveSalonConfigFromForm;
})(typeof window !== 'undefined' ? window : global);
