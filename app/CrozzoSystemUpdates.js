/**
 * Crozzo POS — Actualizaciones OTA (registry.json + crítica/opcional por id)
 */
(function (global) {
  'use strict';

  var DEFAULT_MANIFEST_URL =
    'https://raw.githubusercontent.com/kenny14ramirez-prog/Principal/main/releases/latest.json';
  var DEFAULT_REGISTRY_URL =
    'https://raw.githubusercontent.com/kenny14ramirez-prog/Principal/main/releases/registry.json';
  var LS_INSTALLED = 'crozzo_app_installed_version';
  var LS_MANIFEST = 'crozzo_update_manifest_url';
  var LS_STATE = 'crozzo_update_state';
  var LS_LOCAL_LOG = 'crozzo_update_local_log';
  var LS_DISMISSED_OPTIONAL = 'crozzo_update_dismissed_optional';
  var LS_ACK_CRITICAL = 'crozzo_update_ack_critical';
  var CHECK_INTERVAL_MS = 30 * 60 * 1000;
  var BOOT_DELAY_MS = 5000;

  var VERSION = 'v1.0.0';
  var VERSION_AVAIL = 'v2.0.0';
  var _checkTimer = null;
  var _bootTimer = null;
  var _registryEntries = [];
  var _currentCriticalId = null;
  var _currentOptionalId = null;

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

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function entryId(entry) {
    if (!entry) return '';
    if (entry.id) return String(entry.id);
    var sem = entry.semver || String(entry.version || '').replace(/^v/i, '');
    var t =
      entry.type === 'critical' ||
      entry.installMode === 'auto' ||
      entry.type === 'critica'
        ? 'critical'
        : 'optional';
    return sem + '-' + t;
  }

  function isCriticalEntry(entry) {
    return (
      entry.type === 'critical' ||
      entry.installMode === 'auto' ||
      entry.type === 'critica'
    );
  }

  function loadUpdateState() {
    var state = { ackCritical: [], dismissedOptional: [], appliedOptional: [] };
    try {
      var raw = localStorage.getItem(LS_STATE);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed.ackCritical)) state.ackCritical = parsed.ackCritical.slice();
        if (Array.isArray(parsed.dismissedOptional)) {
          state.dismissedOptional = parsed.dismissedOptional.slice();
        }
        if (Array.isArray(parsed.appliedOptional)) {
          state.appliedOptional = parsed.appliedOptional.slice();
        }
      }
    } catch (_) {}

    try {
      var legAck = localStorage.getItem(LS_ACK_CRITICAL);
      if (legAck && state.ackCritical.indexOf(legAck) < 0) {
        var sem = String(legAck).replace(/^v/i, '');
        state.ackCritical.push(sem + '-critical');
      }
    } catch (_) {}
    try {
      var legDis = localStorage.getItem(LS_DISMISSED_OPTIONAL);
      if (legDis && state.dismissedOptional.indexOf(legDis) < 0) {
        var sem2 = String(legDis).replace(/^v/i, '');
        state.dismissedOptional.push(sem2 + '-optional');
      }
    } catch (_) {}

    return state;
  }

  function saveUpdateState(state) {
    try {
      localStorage.setItem(LS_STATE, JSON.stringify(state));
    } catch (_) {}
  }

  function stateHas(list, id) {
    return list && list.indexOf(id) >= 0;
  }

  function pushStateId(listName, id) {
    var state = loadUpdateState();
    if (!state[listName]) state[listName] = [];
    if (state[listName].indexOf(id) < 0) state[listName].push(id);
    saveUpdateState(state);
  }

  function appendLocalLog(action, entry) {
    var log = [];
    try {
      var raw = localStorage.getItem(LS_LOCAL_LOG);
      if (raw) log = JSON.parse(raw);
      if (!Array.isArray(log)) log = [];
    } catch (_) {
      log = [];
    }
    log.unshift({
      at: new Date().toISOString(),
      action: action,
      id: entryId(entry),
      version: entry.version || entry.semver,
      type: entry.type,
      message: entry.message || '',
    });
    if (log.length > 80) log.length = 80;
    try {
      localStorage.setItem(LS_LOCAL_LOG, JSON.stringify(log));
    } catch (_) {}
    renderLocalLogPanel();
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

  function getRegistryUrl() {
    var base = getManifestUrl();
    if (/registry\.json/i.test(base)) return base;
    if (/latest\.json/i.test(base)) return base.replace(/latest\.json/i, 'registry.json');
    return DEFAULT_REGISTRY_URL;
  }

  function setManifestUrl(url) {
    var u = String(url || '').trim();
    try {
      if (u) localStorage.setItem(LS_MANIFEST, u);
      else localStorage.removeItem(LS_MANIFEST);
    } catch (_) {}
  }

  function normalizeRegistryEntries(data) {
    if (!data) return [];
    if (Array.isArray(data.entries) && data.entries.length) {
      return data.entries.slice();
    }
    if (data.version || data.semver) {
      return [data];
    }
    return [];
  }

  function sortEntriesForProcess(entries) {
    return entries.slice().sort(function (a, b) {
      var cmp = compareSemver(a.version || a.semver, b.version || b.semver);
      if (cmp !== 0) return cmp;
      var ca = isCriticalEntry(a) ? 0 : 1;
      var cb = isCriticalEntry(b) ? 0 : 1;
      if (ca !== cb) return ca - cb;
      return String(a.publishedAt || '').localeCompare(String(b.publishedAt || ''));
    });
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

  function setNormalBannerMessage() {
    var msg = document.getElementById('crozzoUpdateNormalMsg');
    if (!msg) return;
    var typeLabel = UPDATE_NORMAL.type || 'Actualización opcional';
    msg.innerHTML =
      'En uso: <strong>' +
      escapeHtml(VERSION) +
      '</strong> · ' +
      escapeHtml(typeLabel) +
      ': <strong>' +
      escapeHtml(VERSION_AVAIL) +
      '</strong> — abra el detalle para revisar e instalar cuando desee.';
  }

  function syncVersionLabels() {
    var label = document.getElementById('crozzoUpdatesVersionLabel');
    if (label) label.textContent = VERSION;
    global.CROZZO_APP_VERSION = VERSION;
  }

  function buildUpdateNormalFromEntry(entry, currentVer) {
    var remote = entry.version || 'v' + (entry.semver || '');
    var changes = Array.isArray(entry.changelog) ? entry.changelog.slice() : [];
    if (!changes.length && entry.message) changes.push(entry.message);
    return {
      version: remote,
      current: currentVer,
      date: formatManifestDate(entry.publishedAt),
      size: entry.size || '',
      type: 'Actualización opcional',
      summary: entry.message || 'Nueva versión disponible para Crozzo POS.',
      changes: changes,
      notes:
        entry.notes ||
        (global.CrozzoTauriUpdater && global.CrozzoTauriUpdater.isAvailable()
          ? 'En la app de escritorio, Instalar descargará el nuevo .exe desde GitHub Releases (firmado) y reiniciará Crozzo POS. Hágalo al cierre del turno si puede.'
          : 'La instalación reiniciará la aplicación en este equipo. Se recomienda hacerlo al cierre del turno o con la caja sin ventas en curso.'),
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

  function showCriticalEntry(entry) {
    var id = entryId(entry);
    var remote = entry.version || 'v' + (entry.semver || '');
    var prev = VERSION;
    _currentCriticalId = id;

    UPDATE_CRITICAL_INSTALLED = {
      version: remote,
      previous: prev,
      date: formatManifestDate(entry.publishedAt),
      installed: Array.isArray(entry.changelog)
        ? entry.changelog.slice()
        : entry.message
          ? [entry.message]
          : [],
    };

    saveInstalledVersion(remote);
    setDetailOpen(false);
    setNormalOpen(false);
    setCriticalOpen(true);
    return true;
  }

  function showOptionalEntry(entry) {
    var id = entryId(entry);
    var remote = entry.version || 'v' + (entry.semver || '');
    _currentOptionalId = id;
    VERSION_AVAIL = remote;
    global.CROZZO_APP_VERSION_DISPONIBLE = VERSION_AVAIL;
    UPDATE_NORMAL = buildUpdateNormalFromEntry(entry, VERSION);
    setCriticalOpen(false);
    setNormalOpen(true);
    return true;
  }

  function processPendingUpdates(entries) {
    var state = loadUpdateState();
    var sorted = sortEntriesForProcess(entries);

    for (var i = 0; i < sorted.length; i++) {
      var entry = sorted[i];
      var id = entryId(entry);

      if (isCriticalEntry(entry)) {
        if (stateHas(state.ackCritical, id)) continue;
        return showCriticalEntry(entry);
      }

      if (stateHas(state.appliedOptional, id)) continue;
      if (stateHas(state.dismissedOptional, id)) continue;
      return showOptionalEntry(entry);
    }

    return false;
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

  function fetchRegistryData() {
    var registryUrl = getRegistryUrl();
    return fetchWithTimeout(registryUrl, 12000)
      .then(function (res) {
        if (res.ok) return res.json();
        throw new Error('registry HTTP ' + res.status);
      })
      .catch(function () {
        return fetchWithTimeout(getManifestUrl(), 12000).then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        });
      });
  }

  function getEntryStatusLabel(entry) {
    var state = loadUpdateState();
    var id = entryId(entry);
    if (isCriticalEntry(entry)) {
      return stateHas(state.ackCritical, id) ? 'Vista / aplicada' : 'Pendiente';
    }
    if (stateHas(state.appliedOptional, id)) return 'Instalada';
    if (stateHas(state.dismissedOptional, id)) return 'Aviso oculto';
    return 'Pendiente';
  }

  function renderRegistryPanel() {
    var el = document.getElementById('crozzoUpdateRegistryTable');
    if (!el) return;

    if (!_registryEntries.length) {
      el.innerHTML = '<p style="margin:0;">Sin entradas en el registro remoto. Use <strong>Comprobar ahora</strong>.</p>';
      return;
    }

    var rows = _registryEntries
      .slice()
      .reverse()
      .map(function (entry) {
        var tipo = isCriticalEntry(entry) ? 'Crítica' : 'Opcional';
        var badgeClass = isCriticalEntry(entry) ? 'badge-danger' : 'badge-info';
        return (
          '<tr>' +
          '<td><code>' +
          escapeHtml(entryId(entry)) +
          '</code></td>' +
          '<td>' +
          escapeHtml(entry.version || '') +
          '</td>' +
          '<td><span class="badge ' +
          badgeClass +
          '" style="font-size:0.72rem;">' +
          tipo +
          '</span></td>' +
          '<td>' +
          escapeHtml(formatManifestDate(entry.publishedAt) || '—') +
          '</td>' +
          '<td>' +
          escapeHtml(getEntryStatusLabel(entry)) +
          '</td>' +
          '</tr>'
        );
      })
      .join('');

    el.innerHTML =
      '<div style="overflow-x:auto;">' +
      '<table class="data-table" style="width:100%;font-size:0.82rem;">' +
      '<thead><tr><th>ID</th><th>Versión</th><th>Tipo</th><th>Publicada</th><th>En este equipo</th></tr></thead>' +
      '<tbody>' +
      rows +
      '</tbody></table></div>' +
      '<p class="form-hint" style="margin:8px 0 0;">Misma versión (ej. 1.0.13) puede tener fila <strong>crítica</strong> y otra <strong>opcional</strong> con IDs distintos.</p>';
  }

  function renderLocalLogPanel() {
    var el = document.getElementById('crozzoUpdateLocalLog');
    if (!el) return;
    var log = [];
    try {
      var raw = localStorage.getItem(LS_LOCAL_LOG);
      if (raw) log = JSON.parse(raw);
    } catch (_) {}
    if (!Array.isArray(log) || !log.length) {
      el.innerHTML =
        '<p class="form-hint" style="margin:0;">Historial local vacío (se llena al ver críticas, instalar u ocultar opcionales).</p>';
      return;
    }
    var items = log
      .slice(0, 15)
      .map(function (row) {
        var when = '';
        try {
          when = new Date(row.at).toLocaleString('es-CO');
        } catch (_) {
          when = row.at;
        }
        return (
          '<li><strong>' +
          escapeHtml(row.action) +
          '</strong> · ' +
          escapeHtml(row.id || '') +
          ' (' +
          escapeHtml(row.type || '') +
          ') — ' +
          escapeHtml(when) +
          '</li>'
        );
      })
      .join('');
    el.innerHTML =
      '<p style="margin:0 0 6px;font-weight:600;font-size:0.85rem;">Historial en este equipo</p><ul style="margin:0;padding-left:1.2rem;font-size:0.8rem;">' +
      items +
      '</ul>';
  }

  function setCheckStatus(text) {
    var el = document.getElementById('crozzoUpdateCheckStatus');
    if (el) el.textContent = text || '';
  }

  function checkForUpdates(opts) {
    opts = opts || {};

    return fetchRegistryData()
      .then(function (data) {
        _registryEntries = normalizeRegistryEntries(data);
        global.CROZZO_UPDATE_REGISTRY = _registryEntries.slice();
        renderRegistryPanel();
        renderLocalLogPanel();

        var shown = processPendingUpdates(_registryEntries);
        var pending = _registryEntries.filter(function (e) {
          return getEntryStatusLabel(e) === 'Pendiente';
        });

        if (shown) {
          var active = _currentCriticalId || _currentOptionalId || '';
          setCheckStatus(
            'Última comprobación: mostrando actualización pendiente (' + active + ').'
          );
          if (opts.toastOnFound && typeof global.showToast === 'function') {
            global.showToast('Actualización pendiente detectada.', 'info');
          }
        } else if (pending.length) {
          setCheckStatus(
            'Hay ' + pending.length + ' pendiente(s) en cola; cierre avisos previos o use Restablecer avisos.'
          );
        } else {
          setCheckStatus(
            'Última comprobación: al día (' +
              _registryEntries.length +
              ' en registro remoto, equipo ' +
              VERSION +
              ').'
          );
        }

        return { ok: true, shown: shown, entries: _registryEntries, manifest: data };
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

  function continueAfterCriticalAck() {
    setTimeout(function () {
      processPendingUpdates(_registryEntries);
    }, 400);
  }

  function crozzoCerrarActualizacionNormal() {
    setDetailOpen(false);
    setNormalOpen(false);
    if (_currentOptionalId) {
      pushStateId('dismissedOptional', _currentOptionalId);
      var entry = _registryEntries.find(function (e) {
        return entryId(e) === _currentOptionalId;
      });
      if (entry) appendLocalLog('aviso_oculto', entry);
    }
  }

  function crozzoCerrarActualizacionCritica() {
    if (_currentCriticalId) {
      pushStateId('ackCritical', _currentCriticalId);
      var entry = _registryEntries.find(function (e) {
        return entryId(e) === _currentCriticalId;
      });
      if (entry) appendLocalLog('critica_vista', entry);
    }
    setCriticalOpen(false);
    continueAfterCriticalAck();
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
      localStorage.removeItem(LS_STATE);
      localStorage.removeItem(LS_DISMISSED_OPTIONAL);
      localStorage.removeItem(LS_ACK_CRITICAL);
    } catch (_) {}
    if (typeof global.showToast === 'function') {
      global.showToast('Avisos restablecidos. Comprobando de nuevo…', 'info');
    }
    checkForUpdates({ silent: true, toastOnFound: true });
  }

  function markOptionalInstalled(next) {
    if (_currentOptionalId) {
      pushStateId('appliedOptional', _currentOptionalId);
      var entry = _registryEntries.find(function (e) {
        return entryId(e) === _currentOptionalId;
      });
      if (entry) appendLocalLog('opcional_instalada', entry);
    }
    saveInstalledVersion(next);
  }

  function crozzoAceptarActualizacion() {
    var next = VERSION_AVAIL;
    setDetailOpen(false);
    setNormalOpen(false);
    markOptionalInstalled(next);

    var acceptBtn = document.getElementById('crozzoUpdateDetailAccept');
    if (acceptBtn) {
      acceptBtn.disabled = true;
      acceptBtn.textContent = 'Instalando…';
    }

    function resetAcceptBtn() {
      if (acceptBtn) {
        acceptBtn.disabled = false;
        acceptBtn.textContent = 'Instalar';
      }
    }

    function finishReloadOnly() {
      try {
        if (typeof global.showToast === 'function') {
          global.showToast('Actualización ' + next + ' registrada. Reiniciando…', 'success');
        }
      } catch (_) {}
      setTimeout(function () {
        global.location.reload();
      }, 800);
    }

    if (global.CrozzoTauriUpdater && global.CrozzoTauriUpdater.isAvailable()) {
      setCheckStatus('Descargando instalador desde GitHub Releases…');
      global.CrozzoTauriUpdater.installLatest({
        onProgress: function (p) {
          if (p && p.message) setCheckStatus(p.message);
        },
      })
        .then(function (res) {
          resetAcceptBtn();
          if (res && res.upToDate) {
            try {
              if (typeof global.showToast === 'function') {
                global.showToast(
                  'El instalador en GitHub ya coincide con esta app. Recargando interfaz…',
                  'info'
                );
              }
            } catch (_) {}
            finishReloadOnly();
          }
        })
        .catch(function (err) {
          resetAcceptBtn();
          console.warn('[crozzo-tauri-updater]', err);
          setCheckStatus(
            'No se pudo descargar el .exe. Publique un release (tag vX.Y.Z) con el workflow Tauri Release.'
          );
          try {
            if (typeof global.showToast === 'function') {
              global.showToast(
                'No se pudo instalar el ejecutable: ' + (err && err.message ? err.message : err),
                'error'
              );
            }
          } catch (_) {}
        });
      return;
    }

    resetAcceptBtn();
    finishReloadOnly();
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
      _currentCriticalId = 'sim-critical';
      setDetailOpen(false);
      setNormalOpen(false);
      setCriticalOpen(true);
      return;
    }
    if (t === 'normal') {
      VERSION_AVAIL = 'v2.0.0';
      _currentOptionalId = 'sim-optional';
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
      setCheckStatus('Comprobando registro…');
      checkForUpdates({ toastIfNoUrl: true, toastOnFound: true });
    });

    wireOnce(document.getElementById('crozzoUpdateResetAlerts'), function (e) {
      e.preventDefault();
      resetUpdateDismissals();
    });

    syncVersionLabels();
    renderRegistryPanel();
    renderLocalLogPanel();
    checkForUpdates({ silent: true });
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
    getRegistryUrl: getRegistryUrl,
    setManifestUrl: setManifestUrl,
    resetDismissals: resetUpdateDismissals,
    defaultManifestUrl: DEFAULT_MANIFEST_URL,
    defaultRegistryUrl: DEFAULT_REGISTRY_URL,
    renderRegistry: renderRegistryPanel,
    renderLocalLog: renderLocalLogPanel,
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
