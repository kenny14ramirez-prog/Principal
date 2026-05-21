/**
 * Crozzo POS — Simulación de actualizaciones del sistema (Super Admin)
 */
(function (global) {
  'use strict';

  var VERSION = 'v1.0.0';
  var VERSION_AVAIL = 'v2.0.0';
  var VERSION_CRITICAL_INSTALLED = 'v1.0.1-security';

  var UPDATE_NORMAL = {
    version: VERSION_AVAIL,
    current: VERSION,
    date: '21 de mayo de 2026',
    size: '48 MB',
    type: 'Actualización recomendada',
    summary:
      'Mejoras de rendimiento, sincronización multi-dispositivo y correcciones de estabilidad. No es obligatoria: puede seguir operando con la versión actual.',
    changes: [
      'Sincronización LAN más rápida entre caja principal y tablets.',
      'Corrección al reimprimir comandas cuando la red está inestable.',
      'Asistente de accesibilidad (tamaño de texto, contraste, modo enfoque).',
      'Menú de usuario unificado con cambio de contraseña.',
      'Optimización del consumo de memoria en sesiones largas de caja.',
    ],
    notes:
      'La instalación reiniciará la aplicación en este equipo. Se recomienda hacerlo al cierre del turno o con la caja sin ventas en curso.',
  };

  var UPDATE_CRITICAL_INSTALLED = {
    version: VERSION_CRITICAL_INSTALLED,
    previous: VERSION,
    date: '21 de mayo de 2026',
    installed: [
      'Parche de seguridad en autenticación y tokens de sesión.',
      'Cifrado reforzado del almacenamiento local de credenciales.',
      'Corrección de validación en sincronización de cola offline.',
      'Actualización de dependencias con vulnerabilidades reportadas.',
    ],
  };

  function refreshUpdateIcons() {
    try {
      if (global.lucide && typeof global.lucide.createIcons === 'function') {
        global.lucide.createIcons();
      }
    } catch (_) {}
  }

  function mountNormalBanner() {
    var banner = document.getElementById('crozzo-update-normal-banner');
    var main = document.querySelector('main.main-content');
    if (!banner || !main) return;
    var header = main.querySelector('header.main-header, header.crozzo-header-refined');
    if (header && banner.parentElement === main && banner.previousElementSibling === header) {
      return;
    }
    if (header) {
      header.insertAdjacentElement('afterend', banner);
    } else if (banner.parentElement !== main) {
      main.insertBefore(banner, main.firstChild);
    }
  }

  function ensureUpdatePortals() {
    mountNormalBanner();
    ['crozzo-update-critical-overlay', 'crozzo-update-detail-overlay'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.parentElement !== document.body) {
        document.body.appendChild(el);
      }
    });
  }

  function setOverlayOpen(id, open, bodyClass) {
    ensureUpdatePortals();
    var ov = document.getElementById(id);
    if (!ov) return;
    ov.classList.toggle('is-open', !!open);
    ov.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (document.body && bodyClass) {
      document.body.classList.toggle(bodyClass, !!open);
    }
    if (open) {
      refreshUpdateIcons();
    }
  }

  function setCriticalOpen(open) {
    setOverlayOpen('crozzo-update-critical-overlay', open, 'crozzo-update-critical-open');
    if (open) {
      populateCriticalInfo();
      var btn = document.getElementById('crozzoUpdateCriticalDismiss');
      if (btn) {
        setTimeout(function () {
          try {
            btn.focus();
          } catch (_) {}
        }, 80);
      }
    }
  }

  function setDetailOpen(open) {
    setOverlayOpen('crozzo-update-detail-overlay', open, 'crozzo-update-detail-open');
  }

  function setNormalOpen(open) {
    var banner = document.getElementById('crozzo-update-normal-banner');
    if (!banner) return;
    mountNormalBanner();
    banner.classList.toggle('is-open', !!open);
    banner.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (document.body) {
      document.body.classList.toggle('crozzo-update-normal-open', !!open);
    }
    if (open) {
      setNormalBannerMessage();
      refreshUpdateIcons();
    }
  }

  function populateCriticalInfo() {
    var list = document.getElementById('crozzoUpdateCriticalList');
    var ver = document.getElementById('crozzoUpdateCriticalVersion');
    var info = UPDATE_CRITICAL_INSTALLED;
    if (list) {
      list.innerHTML = info.installed
        .map(function (item) {
          return '<li>' + item + '</li>';
        })
        .join('');
    }
    if (ver) {
      ver.textContent =
        'Versión ' + info.previous + ' → ' + info.version + ' · ' + info.date;
    }
  }

  function setNormalBannerMessage() {
    var msg = document.getElementById('crozzoUpdateNormalMsg');
    if (!msg) return;
    msg.innerHTML =
      'En uso: <strong>' +
      VERSION +
      '</strong> · Disponible: <strong>' +
      VERSION_AVAIL +
      '</strong> — abra el detalle para revisar e instalar cuando desee.';
  }

  function syncVersionLabels() {
    var label = document.getElementById('crozzoUpdatesVersionLabel');
    if (label) label.textContent = VERSION;
    global.CROZZO_APP_VERSION = VERSION;
  }

  function buildDetailBodyHtml() {
    var u = UPDATE_NORMAL;
    var changesHtml = u.changes
      .map(function (c) {
        return '<li>' + c + '</li>';
      })
      .join('');
    return (
      '<p>' +
      u.summary +
      '</p>' +
      '<h3>Novedades incluidas</h3>' +
      '<ul>' +
      changesHtml +
      '</ul>' +
      '<p class="crozzo-update-detail-modal__note">' +
      u.notes +
      '</p>'
    );
  }

  function populateDetailPanel() {
    var u = UPDATE_NORMAL;
    var title = document.getElementById('crozzoUpdateDetailTitle');
    var meta = document.getElementById('crozzoUpdateDetailMeta');
    var body = document.getElementById('crozzoUpdateDetailBody');
    if (title) {
      title.textContent = 'Actualización ' + u.version;
    }
    if (meta) {
      meta.innerHTML =
        '<span class="crozzo-update-detail-modal__chip">Actual: ' +
        u.current +
        '</span>' +
        '<span class="crozzo-update-detail-modal__chip crozzo-update-detail-modal__chip--avail">Nueva: ' +
        u.version +
        '</span>' +
        '<span class="crozzo-update-detail-modal__chip">' +
        u.date +
        '</span>' +
        '<span class="crozzo-update-detail-modal__chip">' +
        u.size +
        '</span>';
    }
    if (body) {
      body.innerHTML = buildDetailBodyHtml();
    }
  }

  function crozzoCerrarActualizacionNormal() {
    setDetailOpen(false);
    setNormalOpen(false);
  }

  function crozzoCerrarActualizacionCritica() {
    setCriticalOpen(false);
  }

  function crozzoAbrirDetalleActualizacion() {
    populateDetailPanel();
    setDetailOpen(true);
  }

  function crozzoRechazarActualizacion() {
    setDetailOpen(false);
    try {
      if (typeof global.showToast === 'function') {
        global.showToast(
          'Actualización ' + VERSION_AVAIL + ' pospuesta. El aviso seguirá visible.',
          'info'
        );
      }
    } catch (_) {}
  }

  function crozzoAceptarActualizacion() {
    setDetailOpen(false);
    setNormalOpen(false);
    VERSION = VERSION_AVAIL;
    syncVersionLabels();
    try {
      if (typeof global.showToast === 'function') {
        global.showToast('Actualización ' + VERSION + ' instalada correctamente.', 'success');
      }
    } catch (_) {}
  }

  function lanzarAlerta(tipo) {
    ensureUpdatePortals();
    var t = String(tipo || '').toLowerCase();
    if (t === 'critica' || t === 'crítica' || t === 'critical') {
      setDetailOpen(false);
      setNormalOpen(false);
      setCriticalOpen(true);
      return;
    }
    if (t === 'normal') {
      setCriticalOpen(false);
      setDetailOpen(false);
      setNormalOpen(true);
    }
  }

  function crozzoVerCambiosActualizacion() {
    crozzoAbrirDetalleActualizacion();
  }

  function wireOnce(el, handler) {
    if (!el || el.__crozzoUpdatesWired) return;
    el.__crozzoUpdatesWired = true;
    el.addEventListener('click', handler);
  }

  function initActualizacionesSistema() {
    var root = document.getElementById('actualizaciones-sistema');
    if (!root) return;
    root.querySelectorAll('[data-crozzo-sim-update]').forEach(function (btn) {
      wireOnce(btn, function (e) {
        e.preventDefault();
        e.stopPropagation();
        lanzarAlerta(btn.getAttribute('data-crozzo-sim-update'));
      });
    });
    syncVersionLabels();
  }

  function initCrozzoUpdateOverlays() {
    ensureUpdatePortals();
    refreshUpdateIcons();

    wireOnce(document.getElementById('crozzoUpdateCriticalDismiss'), function (e) {
      e.preventDefault();
      crozzoCerrarActualizacionCritica();
    });

    wireOnce(document.getElementById('crozzoUpdateNormalLater'), function (e) {
      e.preventDefault();
      crozzoCerrarActualizacionNormal();
    });
    wireOnce(document.getElementById('crozzoUpdateNormalChanges'), function (e) {
      e.preventDefault();
      crozzoVerCambiosActualizacion();
    });
    wireOnce(document.getElementById('crozzoUpdateNormalDismiss'), function (e) {
      e.preventDefault();
      crozzoCerrarActualizacionNormal();
    });

    wireOnce(document.getElementById('crozzoUpdateDetailClose'), function (e) {
      e.preventDefault();
      setDetailOpen(false);
    });
    wireOnce(document.getElementById('crozzoUpdateDetailReject'), function (e) {
      e.preventDefault();
      crozzoRechazarActualizacion();
    });
    wireOnce(document.getElementById('crozzoUpdateDetailAccept'), function (e) {
      e.preventDefault();
      crozzoAceptarActualizacion();
    });

    var detailOv = document.getElementById('crozzo-update-detail-overlay');
    if (detailOv && !detailOv.__crozzoBackdropWired) {
      detailOv.__crozzoBackdropWired = true;
      detailOv.addEventListener('click', function (e) {
        if (e.target === detailOv) {
          setDetailOpen(false);
        }
      });
    }
  }

  global.CROZZO_APP_VERSION = VERSION;
  global.CROZZO_APP_VERSION_DISPONIBLE = VERSION_AVAIL;
  global.lanzarAlerta = lanzarAlerta;
  global.crozzoCerrarActualizacionNormal = crozzoCerrarActualizacionNormal;
  global.crozzoCerrarActualizacionCritica = crozzoCerrarActualizacionCritica;
  global.crozzoVerCambiosActualizacion = crozzoVerCambiosActualizacion;
  global.crozzoAbrirDetalleActualizacion = crozzoAbrirDetalleActualizacion;
  global.crozzoAceptarActualizacion = crozzoAceptarActualizacion;
  global.crozzoRechazarActualizacion = crozzoRechazarActualizacion;
  global.initActualizacionesSistema = initActualizacionesSistema;
  global.initCrozzoUpdateOverlays = initCrozzoUpdateOverlays;

  function boot() {
    initCrozzoUpdateOverlays();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
