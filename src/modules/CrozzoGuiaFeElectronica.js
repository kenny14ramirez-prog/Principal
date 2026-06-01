/**
 * Crozzo POS — Guía paso a paso para activar facturación electrónica (FE).
 */
(function (global) {
  'use strict';

  var LS = 'crozzo_fe_guide_v1';

  var STEPS = [
    {
      id: 'dian',
      label: 'Datos DIAN',
      hint: 'NIT, razón social, régimen y datos fiscales del negocio.',
      page: 'config-dian',
    },
    {
      id: 'certificado',
      label: 'Certificado digital',
      hint: 'Cargue el .pfx/.p12 vigente con contraseña correcta.',
      page: 'config-certificado',
    },
    {
      id: 'proveedor',
      label: 'Proveedor tecnológico',
      hint: 'Credenciales del PT autorizado (API, ambiente producción/pruebas).',
      page: 'config-proveedor',
    },
    {
      id: 'resolucion',
      label: 'Resolución y numeración',
      hint: 'Prefijo, rango autorizado y vigencia de la resolución DIAN.',
      page: 'config-empresa',
    },
    {
      id: 'venta_prueba',
      label: 'Venta FE de prueba',
      hint: 'Una venta pequeña en caja; verifique CUFE, QR y XML antes del servicio real.',
      page: 'cajero',
    },
  ];

  function readStore() {
    try {
      var raw = localStorage.getItem(LS);
      if (!raw) return { manual: {}, completed: false };
      var s = JSON.parse(raw);
      s.manual = s.manual && typeof s.manual === 'object' ? s.manual : {};
      return s;
    } catch (_) {
      return { manual: {}, completed: false };
    }
  }

  function writeStore(patch) {
    var cur = readStore();
    var next = Object.assign({}, cur, patch || {});
    if (patch && patch.manual) next.manual = Object.assign({}, cur.manual, patch.manual);
    try {
      localStorage.setItem(LS, JSON.stringify(next));
    } catch (_) {}
    return next;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function detectStep(id) {
    try {
      if (readStore().manual[id]) return true;
      if (id === 'dian' && global.config && typeof global.config.getDianConfig === 'function') {
        var d = global.config.getDianConfig();
        if (d && d.nit && d.razonSocial) return true;
      }
      if (id === 'certificado' && global.config && global.config.getCertificadoConfig) {
        var c = global.config.getCertificadoConfig();
        if (c && (c.cargado || c.path || c.vigenteHasta)) return true;
      }
      if (id === 'proveedor' && global.config && global.config.getProveedorConfig) {
        var p = global.config.getProveedorConfig();
        if (p && (p.proveedor || p.apiKey || p.usuario)) return true;
      }
      if (id === 'resolucion' && global.config && global.config.getEmpresa) {
        var e = global.config.getEmpresa();
        if (e && (e.resolucionDian || e.prefijoFe || e.rangoFeDesde)) return true;
      }
      if (id === 'venta_prueba') {
        var fa = typeof global.crozzoConfigGetSecure === 'function' ? global.crozzoConfigGetSecure('facturas') : [];
        if (Array.isArray(fa)) {
          return fa.some(function (f) {
            return f && (f.cufe || f.CUFE || f.modo === 'electronic' || f.esFe);
          });
        }
      }
    } catch (_) {}
    return false;
  }

  function getProgress() {
    var items = STEPS.map(function (step) {
      return { step: step, done: detectStep(step.id) };
    });
    var done = items.filter(function (x) { return x.done; }).length;
    var pct = STEPS.length ? Math.round((done / STEPS.length) * 100) : 0;
    return { items: items, done: done, total: STEPS.length, pct: pct };
  }

  function markManual(id) {
    var manual = {};
    manual[id] = true;
    writeStore({ manual: manual });
    if (getProgress().pct >= 100) writeStore({ completed: true });
    openGuideModal();
    if (typeof global.showToast === 'function') global.showToast('Paso FE marcado', 'success');
  }

  function renderGuideBody() {
    var p = getProgress();
    var canGo = { missing: [] };
    try {
      if (global.config && typeof global.config.canGoLive === 'function') canGo = global.config.canGoLive();
    } catch (_) {}
    var faltaHtml =
      canGo.missing && canGo.missing.length
        ? '<div class="alert alert-warning crozzo-fe-guide__alert"><span>⚠️</span><div><strong>Pendiente DIAN:</strong><ul class="crozzo-fe-guide__missing">' +
          canGo.missing.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') +
          '</ul></div></div>'
        : '<p class="form-hint crozzo-fe-guide__ok">✓ Checklist DIAN del sistema completo.</p>';
    var rows = p.items
      .map(function (x) {
        var s = x.step;
        var icon = x.done ? '✅' : '⬜';
        var go =
          s.page && typeof global.navigateTo === 'function'
            ? ' <button type="button" class="btn btn-outline btn-sm" onclick="closeModal();navigateTo(\'' +
              esc(s.page) +
              '\')">Ir</button>'
            : '';
        var mark = !x.done
          ? ' <button type="button" class="btn btn-outline btn-sm" onclick="CrozzoGuiaFeElectronica.markManual(\'' +
            esc(s.id) +
            '\')">Marcar hecho</button>'
          : '';
        return (
          '<li class="crozzo-onb-row' +
          (x.done ? ' crozzo-onb-row--done' : '') +
          '">' +
          '<span class="crozzo-onb-row__icon">' +
          icon +
          '</span>' +
          '<div class="crozzo-onb-row__body"><strong>' +
          esc(s.label) +
          '</strong><p class="form-hint">' +
          esc(s.hint) +
          '</p>' +
          go +
          mark +
          '</div></li>'
        );
      })
      .join('');
    return (
      '<div class="crozzo-fe-guide">' +
      '<p class="crozzo-psyche-modal__lead">Active la FE con calma — un paso a la vez.</p>' +
      '<p class="form-hint">Modo electrónico activo. Complete la guía antes del primer timbrado real en horario pico.</p>' +
      faltaHtml +
      '<div class="crozzo-onb-modal__progress"><span>Progreso FE: <strong>' +
      p.pct +
      '%</strong> (' +
      p.done +
      '/' +
      p.total +
      ')</span>' +
      '<div class="crozzo-onb-banner__bar"><span style="width:' +
      p.pct +
      '%"></span></div></div>' +
      '<ul class="crozzo-onb-modal__list">' +
      rows +
      '</ul>' +
      '<div class="btn-group" style="justify-content:flex-end;margin-top:14px;flex-wrap:wrap;gap:8px;">' +
      '<button type="button" class="btn btn-outline" onclick="CrozzoGuiaFeElectronica.dismissGuide()">Recordar después</button>' +
      (p.pct >= 100
        ? '<button type="button" class="btn btn-primary" onclick="CrozzoGuiaFeElectronica.completeGuide()">Listo — cerrar</button>'
        : '<button type="button" class="btn btn-primary" onclick="closeModal()">Continuar después</button>') +
      '</div></div>'
    );
  }

  function openGuideModal() {
    if (typeof global.showModal !== 'function') return;
    global.showModal('🧾 Guía facturación electrónica', renderGuideBody());
  }

  function dismissGuide() {
    try {
      sessionStorage.setItem('crozzo_fe_guide_dismiss', '1');
    } catch (_) {}
    if (typeof global.closeModal === 'function') global.closeModal();
    if (typeof global.showToast === 'function') {
      global.showToast('Guía FE disponible en Configuración → Modo de operación', 'info');
    }
  }

  function completeGuide() {
    writeStore({ completed: true });
    if (typeof global.closeModal === 'function') global.closeModal();
    if (typeof global.showToast === 'function') {
      global.showToast('Guía FE completada. Buen camino hacia producción.', 'success');
    }
  }

  function onElectronicModeActivated() {
    writeStore({ activatedAt: new Date().toISOString(), completed: false });
    try {
      if (sessionStorage.getItem('crozzo_fe_guide_dismiss') === '1') return;
    } catch (_) {}
    setTimeout(function () {
      openGuideModal();
    }, 900);
  }

  function maybePromptFeGuide() {
    try {
      if (!global.config || global.config.getOperacionModo() !== 'electronic') return;
      var st = readStore();
      if (st.completed) return;
      if (getProgress().pct >= 100) return;
      var r = '';
      if (typeof global.getCurrentUser === 'function' && global.getCurrentUser() && global.crozzoNormalizeAppRol) {
        r = global.crozzoNormalizeAppRol(global.getCurrentUser().rol);
      }
      if (r !== 'admin' && r !== 'caja' && r !== 'superadmin' && r !== 'super_admin') return;
      try {
        if (sessionStorage.getItem('crozzo_fe_guide_dismiss') === '1') return;
      } catch (_) {}
      setTimeout(openGuideModal, 2500);
    } catch (_) {}
  }

  function init() {
    maybePromptFeGuide();
  }

  global.CrozzoGuiaFeElectronica = {
    init: init,
    openGuideModal: openGuideModal,
    onElectronicModeActivated: onElectronicModeActivated,
    markManual: markManual,
    getProgress: getProgress,
    completeGuide: completeGuide,
    dismissGuide: dismissGuide,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 120); });
  } else {
    setTimeout(init, 120);
  }
})(typeof window !== 'undefined' ? window : globalThis);
