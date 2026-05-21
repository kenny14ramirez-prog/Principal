/**
 * Crozzo POS — Actualizaciones OTA (GitHub latest.json + UI integrada)
 */
(function (global) {
  'use strict';

  var DEFAULT_MANIFEST_URL =
    'https://raw.githubusercontent.com/kenny14ramirez-prog/Principal/main/releases/latest.json';
  var LS_INSTALLED = 'crozzo_app_installed_version';
  var LS_MANIFEST = 'crozzo_update_manifest_url';
  var LS_DISMISSED_OPTIONAL = 'crozzo_update_dismissed_optional';
  var LS_ACK_CRITICAL = 'crozzo_update_ack_critical';
  var CHECK_INTERVAL_MS = 30 * 60 * 1000;
  var BOOT_DELAY_MS = 5000;

  var VERSION = 'v1.0.0';
  var VERSION_AVAIL = 'v2.0.0';
  var _checkTimer = null;
  var _bootTimer = null;

  var UPDATE_NORMAL = {
    version: VERSION_AVAIL,
    current: VERSION,
    date: '',
    size: '',
    type: 'Actualización recomendada',
    summary: '',
    changes: [],
    notes:
      'La instalación reiniciará la aplicación en este equipo. Se recomienda hacerlo al cierre del turno o con la caja sin ventas en curso.',
  };

  var UPDATE_CRITICAL_INSTALLED = {
    version: 'v1.0.1-security',
    previous: VERSION,
    date: '',
    installed: [],
  };

  function refreshUpdateIcons() {
    try {
      if (global.lucide && typeof global.lucide.createIcons === 'function') {
        global.lucide.createIcons();
      }
    } catch (_) {}
  }

  function loadInstalledVersion() {
    try {
      var v = localStorage.getItem(LS_INSTALLED);
      if (v && String(v).trim()) return String(v).trim();
    } catch (_) {}
    return 'v1.0.0';
  }

  function saveInstalledVersion(v) {
    var ver = String(v || '').trim();
    if (!ver) return;
    try {
      localStorage.setItem(LS_INSTALLED, ver);
    } catch (_) {}
    VERSION = ver;
    syncVersionLabels();
    global.CROZZO_APP_VERSION = VERSION;
  }

  function parseSemver(v) {
    var s = String(v || '').replace(/^v/i, '');
    var core = s.split('-')[0];
    var parts = core.split('.').map(function (n) {
      return parseInt(n, 10) || 0;
    });
    while (parts.length < 3) parts.push(0);
    return parts;
  }

  function compareSemver(a, b) {
    var pa = parseSemver(a);
    var pb = parseSemver(b);
    for (var i = 0; i < 3; i++) {
      if (pa[i] > pb[i]) return 1;
      if (pa[i] < pb[i]) return -1;
    }
    return 0;
  }

  function formatManifestDate(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString('es-CO', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch (_) {
      return String(iso);
    }
  }

  function getManifestUrl() {
    try {
      var u = localStorage.getItem(LS_MANIFEST);
      if (u && String(u).trim()) return String(u).trim();
    } catch (_) {}
    if (global.CROZZO_UPDATE_MANIFEST_URL && String(global.CROZZO_UPDATE_MANIFEST_URL).trim()) {
      return String(global.CROZZO_UPDATE_MANIFEST_URL).trim();
    }
    return DEFAULT_MANIFEST_URL;
  }

  function setManifestUrl(url) {
    var u = String(url || '').trim();
    try {
      if (u) localStorage.setItem(LS_MANIFEST, u);
      else localStorage.removeItem(LS_MANIFEST);
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
    if (open) refreshUpdateIcons();
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
    var lead = document.getElementById('crozzoUpdateCriticalLead');
    var info = UPDATE_CRITICAL_INSTALLED;
    if (lead) {
      lead.textContent =
        'La actualización crítica se instaló automáticamente. Esto es lo que se aplicó en su equipo:';
    }
    if (list) {
      list.innerHTML = (info.installed || [])
        .map(function (item) {
          return '<li>' + escapeHtml(item) + '</li>';
        })
        .join('');
    }
    if (ver) {
      ver.textContent =
        'Versión ' + info.previous + ' → ' + info.version + (info.date ? ' · ' + info.date : '');
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function setNormalBannerMessage() {
    var msg = document.getElementById('crozzoUpdateNormalMsg');
    if (!msg) return;
    msg.innerHTML =
      'En uso: <strong>' +
      escapeHtml(VERSION) +
      '</strong> · Disponible: <strong>' +
      escapeHtml(VERSION_AVAIL) +
      '</strong> — abra el detalle para revisar e instalar cuando desee.';
  }

  function syncVersionLabels() {
    var label = document.getElementById('crozzoUpdatesVersionLabel');
    if (label) label.textContent = VERSION;
    global.CROZZO_APP_VERSION = VERSION;
  }

  function buildUpdateNormalFromManifest(manifest, currentVer) {
    var remote = manifest.version || 'v' + (manifest.semver || '');
    var changes = Array.isArray(manifest.changelog) ? manifest.changelog.slice() : [];
    if (!changes.length && manifest.message) changes.push(manifest.message);
    return {
      version: remote,
      current: currentVer,
      date: formatManifestDate(manifest.publishedAt),
      size: manifest.size || '',
      type: manifest.type === 'optional' ? 'Actualización opcional' : 'Actualización disponible',
      summary: manifest.message || 'Nueva versión disponible para Crozzo POS.',
      changes: changes,
      notes:
        manifest.notes ||
        'La instalación reiniciará la aplicación en este equipo. Se recomienda hacerlo al cierre del turno o con la caja sin ventas en curso.',
    };
  }

  function buildDetailBodyHtml() {
    var u = UPDATE_NORMAL;
    var changesHtml = (u.changes || [])
      .map(function (c) {
        return '<li>' + escapeHtml(c) + '</li>';
      })
      .join('');
    return (
      '<p>' +
      escapeHtml(u.summary) +
      '</p>' +
      '<h3>Novedades incluidas</h3>' +
      '<ul>' +
      changesHtml +
      '</ul>' +
      '<p class="crozzo-update-detail-modal__note">' +
      escapeHtml(u.notes) +
      '</p>'
    );
  }

  function populateDetailPanel() {
    var u = UPDATE_NORMAL;
    var title = document.getElementById('crozzoUpdateDetailTitle');
    var meta = document.getElementById('crozzoUpdateDetailMeta');
    var body = document.getElementById('crozzoUpdateDetailBody');
    if (title) title.textContent = 'Actualización ' + u.version;
    if (meta) {
      meta.innerHTML =
        '<span class="crozzo-update-detail-modal__chip">Actual: ' +
        escapeHtml(u.current) +
        '</span>' +
        '<span class="crozzo-update-detail-modal__chip crozzo-update-detail-modal__chip--avail">Nueva: ' +
        escapeHtml(u.version) +
        '</span>' +
        (u.date
          ? '<span class="crozzo-update-detail-modal__chip">' + escapeHtml(u.date) + '</span>'
          : '') +
        (u.size
          ? '<span class="crozzo-update-detail-modal__chip">' + escapeHtml(u.size) + '</span>'
          : '');
    }
    if (body) body.innerHTML = buildDetailBodyHtml();
  }

  function applyRemoteManifest(manifest) {
    if (!manifest) return false;
    var remote = manifest.version || (manifest.semver ? 'v' + manifest.semver : '');
    if (!remote || compareSemver(remote, VERSION) <= 0) return false;

    var prev = VERSION;
    var isCritical =
      manifest.type === 'critical' ||
      manifest.installMode === 'auto' ||
      manifest.type === 'critica';

    if (isCritical) {
      try {
        if (localStorage.getItem(LS_ACK_CRITICAL) === remote) return false;
      } catch (_) {}

      UPDATE_CRITICAL_INSTALLED = {
        version: remote,
        previous: prev,
        date: formatManifestDate(manifest.publishedAt),
        installed: Array.isArray(manifest.changelog)
          ? manifest.changelog.slice()
          : manifest.message
            ? [manifest.message]
            : [],
      };

      saveInstalledVersion(remote);
      setDetailOpen(false);
      setNormalOpen(false);
      setCriticalOpen(true);
      return true;
    }

    try {
      if (localStorage.getItem(LS_DISMISSED_OPTIONAL) === remote) return false;
    } catch (_) {}

    VERSION_AVAIL = remote;
    global.CROZZO_APP_VERSION_DISPONIBLE = VERSION_AVAIL;
    UPDATE_NORMAL = buildUpdateNormalFromManifest(manifest, prev);
    setCriticalOpen(false);
    setNormalOpen(true);
    return true;
  }

  function fetchWithTimeout(url, ms) {
    return new Promise(function (resolve, reject) {
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = setTimeout(function () {
        if (ctrl) ctrl.abort();
        reject(new Error('timeout'));
      }, ms || 12000);
      var sep = url.indexOf('?') >= 0 ? '&' : '?';
      fetch(url + sep + '_=' + Date.now(), {
        cache: 'no-store',
        signal: ctrl ? ctrl.signal : undefined,
      })
        .then(function (res) {
          clearTimeout(timer);
          resolve(res);
        })
        .catch(function (err) {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  function checkForUpdates(opts) {
    opts = opts || {};
    var url = getManifestUrl();
    if (!url) {
      if (opts.toastIfNoUrl && typeof global.showToast === 'function') {
        global.showToast(
          'Configure la URL del manifiesto en Actualizaciones del sistema (GitHub raw → releases/latest.json).',
          'warning'
        );
      }
      return Promise.resolve({ ok: false, reason: 'no_url' });
    }

    return fetchWithTimeout(url, 12000)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        var shown = applyRemoteManifest(data);
        var remote = data.version || (data.semver ? 'v' + data.semver : '');
        if (shown) {
          setCheckStatus(
            'Última comprobación: nueva versión ' + remote + ' (' + (data.type || 'update') + ').'
          );
          if (opts.toastOnFound && typeof global.showToast === 'function') {
            global.showToast('Nueva actualización detectada: ' + remote, 'info');
          }
        } else {
          setCheckStatus(
            'Última comprobación: sin novedades (remoto ' +
              remote +
              ', equipo ' +
              VERSION +
              ').'
          );
        }
        return { ok: true, shown: shown, manifest: data };
      })
      .catch(function (err) {
        setCheckStatus('Error al comprobar actualizaciones. Revise la URL y la conexión.');
        if (!opts.silent && typeof global.showToast === 'function') {
          global.showToast('No se pudo comprobar actualizaciones.', 'error');
        }
        console.warn('[crozzo-updates]', err);
        return { ok: false, reason: 'error', error: err };
      });
  }

  function crozzoCerrarActualizacionNormal() {
    setDetailOpen(false);
    setNormalOpen(false);
    try {
      if (VERSION_AVAIL) localStorage.setItem(LS_DISMISSED_OPTIONAL, VERSION_AVAIL);
    } catch (_) {}
  }

  function crozzoCerrarActualizacionCritica() {
    try {
      var v = UPDATE_CRITICAL_INSTALLED.version || VERSION;
      if (v) localStorage.setItem(LS_ACK_CRITICAL, v);
    } catch (_) {}
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
          'Actualización ' + VERSION_AVAIL + ' pospuesta. El aviso seguirá en la franja superior.',
          'info'
        );
      }
    } catch (_) {}
  }

  function resetUpdateDismissals() {
    try {
      localStorage.removeItem(LS_DISMISSED_OPTIONAL);
      localStorage.removeItem(LS_ACK_CRITICAL);
    } catch (_) {}
    if (typeof global.showToast === 'function') {
      global.showToast('Avisos de actualización restablecidos. Comprobando de nuevo…', 'info');
    }
    checkForUpdates({ silent: true, toastOnFound: true });
  }

  function setCheckStatus(text) {
    var el = document.getElementById('crozzoUpdateCheckStatus');
    if (el) el.textContent = text || '';
  }

  function crozzoAceptarActualizacion() {
    var next = VERSION_AVAIL;
    setDetailOpen(false);
    setNormalOpen(false);
    try {
      localStorage.removeItem(LS_DISMISSED_OPTIONAL);
    } catch (_) {}
    saveInstalledVersion(next);
    try {
      if (typeof global.showToast === 'function') {
        global.showToast('Actualización ' + next + ' instalada. Reiniciando…', 'success');
      }
    } catch (_) {}
    setTimeout(function () {
      global.location.reload();
    }, 800);
  }

  function lanzarAlerta(tipo) {
    ensureUpdatePortals();
    var t = String(tipo || '').toLowerCase();
    if (t === 'critica' || t === 'crítica' || t === 'critical') {
      UPDATE_CRITICAL_INSTALLED = {
        version: 'v1.0.1-security',
        previous: VERSION,
        date: '21 de mayo de 2026',
        installed: [
          'Parche de seguridad en autenticación y tokens de sesión.',
          'Cifrado reforzado del almacenamiento local de credenciales.',
          'Corrección de validación en sincronización de cola offline.',
        ],
      };
      setDetailOpen(false);
      setNormalOpen(false);
      setCriticalOpen(true);
      return;
    }
    if (t === 'normal') {
      VERSION_AVAIL = 'v2.0.0';
      UPDATE_NORMAL = {
        version: VERSION_AVAIL,
        current: VERSION,
        date: '21 de mayo de 2026',
        size: '48 MB',
        type: 'Simulación',
        summary: 'Mejoras de rendimiento y estabilidad (simulación local).',
        changes: [
          'Sincronización LAN más rápida.',
          'Correcciones de comandas en red lenta.',
          'Mejoras de accesibilidad.',
        ],
        notes: UPDATE_NORMAL.notes,
      };
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

    var urlInput = document.getElementById('crozzoUpdateManifestUrl');
    if (urlInput) urlInput.value = getManifestUrl();

    wireOnce(document.getElementById('crozzoUpdateSaveManifestUrl'), function (e) {
      e.preventDefault();
      if (urlInput) setManifestUrl(urlInput.value);
      if (typeof global.showToast === 'function') {
        global.showToast('URL de actualizaciones guardada.', 'success');
      }
    });

    wireOnce(document.getElementById('crozzoUpdateCheckNow'), function (e) {
      e.preventDefault();
      if (urlInput) setManifestUrl(urlInput.value);
      setCheckStatus('Comprobando…');
      checkForUpdates({ toastIfNoUrl: true, toastOnFound: true });
    });

    wireOnce(document.getElementById('crozzoUpdateResetAlerts'), function (e) {
      e.preventDefault();
      resetUpdateDismissals();
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
        if (e.target === detailOv) setDetailOpen(false);
      });
    }
  }

  function onAuthReady() {
    setTimeout(function () {
      checkForUpdates({ silent: true });
    }, 2000);
  }

  function startCrozzoUpdateChecks() {
    VERSION = loadInstalledVersion();
    global.CROZZO_APP_VERSION = VERSION;
    syncVersionLabels();

    if (_bootTimer) clearTimeout(_bootTimer);
    _bootTimer = setTimeout(function () {
      checkForUpdates({ silent: true });
    }, BOOT_DELAY_MS);

    if (_checkTimer) clearInterval(_checkTimer);
    _checkTimer = setInterval(function () {
      checkForUpdates({ silent: true });
    }, CHECK_INTERVAL_MS);

    if (!global.__crozzoUpdateAuthWired) {
      global.__crozzoUpdateAuthWired = true;
      global.addEventListener('crozzo:auth-ready', onAuthReady);
      global.addEventListener('crozzo-ready', onAuthReady);
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) checkForUpdates({ silent: true });
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
  global.checkForUpdates = checkForUpdates;
  global.startCrozzoUpdateChecks = startCrozzoUpdateChecks;
  global.initActualizacionesSistema = initActualizacionesSistema;
  global.initCrozzoUpdateOverlays = initCrozzoUpdateOverlays;
  global.CrozzoSystemUpdates = {
    check: checkForUpdates,
    start: startCrozzoUpdateChecks,
    getManifestUrl: getManifestUrl,
    setManifestUrl: setManifestUrl,
    resetDismissals: resetUpdateDismissals,
    defaultManifestUrl: DEFAULT_MANIFEST_URL,
  };

  function boot() {
    initCrozzoUpdateOverlays();
    startCrozzoUpdateChecks();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
