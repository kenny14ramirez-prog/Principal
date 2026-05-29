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
  var _criticalInstallState = 'idle';
  var _pendingCriticalEntry = null;
  var _installInProgress = false;
  var _installUi = {
    open: false,
    mode: 'optional',
    phase: 'probe',
    percent: 0,
    message: '',
    from: '',
    to: '',
    state: 'installing',
    changelog: [],
  };
  var _planB = { downloadUrl: '', releasePageUrl: '', version: '', ready: false };

  var INSTALL_STEPS = [
    { id: 'probe', label: 'Verificar instalador en GitHub' },
    { id: 'check', label: 'Comprobar actualización firmada' },
    { id: 'download', label: 'Descargar paquete seguro' },
    { id: 'install', label: 'Instalar en este equipo' },
    { id: 'relaunch', label: 'Reiniciar con interfaz nueva' },
  ];

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

  function readMetaBuildVersion() {
    try {
      var meta = document.querySelector('meta[name="crozzo-app-version"]');
      if (meta && meta.getAttribute('content')) {
        var v = String(meta.getAttribute('content')).trim();
        if (v) return v.indexOf('v') === 0 ? v : 'v' + v;
      }
    } catch (_) {}
    return null;
  }

  function readMetaBuildStamp() {
    try {
      var meta = document.querySelector('meta[name="crozzo-build-stamp"]');
      if (meta && meta.getAttribute('content')) {
        return String(meta.getAttribute('content')).trim();
      }
    } catch (_) {}
    return '';
  }

  function fetchTauriBinaryVersion() {
    if (!global.__TAURI__ || !global.__TAURI__.core || typeof global.__TAURI__.core.invoke !== 'function') {
      return Promise.resolve(null);
    }
    return global.__TAURI__.core
      .invoke('plugin:app|version')
      .then(function (v) {
        if (!v) return null;
        var s = String(v).trim();
        return s.indexOf('v') === 0 ? s : 'v' + s;
      })
      .catch(function () {
        return null;
      });
  }

  function loadInstalledVersion() {
    try {
      var v = localStorage.getItem(LS_INSTALLED);
      if (v && String(v).trim()) return String(v).trim();
    } catch (_) {}
    var meta = readMetaBuildVersion();
    if (meta) return meta;
    return 'v1.0.0';
  }

  function reconcileInstalledVersion(binaryVer) {
    return binaryVer || readMetaBuildVersion() || 'v1.0.0';
  }

  function refreshBinaryVersion() {
    return fetchTauriBinaryVersion().then(function (binaryVer) {
      if (binaryVer) {
        VERSION = binaryVer;
        global.CROZZO_APP_VERSION = binaryVer;
        try {
          localStorage.setItem(LS_INSTALLED, binaryVer);
        } catch (_) {}
        syncVersionLabels();
      }
      return VERSION;
    });
  }

  function entryBuildStamp(entry) {
    if (!entry) return '';
    return String(entry.publishedAt || entry.updatedAt || '').trim();
  }

  function isEntryApplied(entry) {
    if (!entry) return false;
    var remote = entry.version || 'v' + (entry.semver || '');
    var cmp = compareSemver(VERSION, remote);
    if (cmp > 0) return true;
    if (cmp < 0) return false;
    var remoteStamp = entryBuildStamp(entry);
    var localStamp = readMetaBuildStamp();
    if (!remoteStamp) return cmp >= 0;
    if (!localStamp) return false;
    return String(localStamp) >= String(remoteStamp);
  }

  function entryNeedsInstall(entry) {
    if (!entry) return false;
    return !isEntryApplied(entry);
  }

  function saveInstalledVersion(v) {
    var ver = String(v || '').trim();
    if (!ver) return;
    try {
      localStorage.setItem(LS_INSTALLED, ver);
    } catch (_) {}
  }

  function pruneStaleStateFlags() {
    if (!_registryEntries.length) return;
    var state = loadUpdateState();
    var changed = false;

    function prune(listName) {
      var list = state[listName] || [];
      var next = list.filter(function (id) {
        var entry = _registryEntries.find(function (e) {
          return entryId(e) === id;
        });
        if (!entry) return true;
        return isEntryApplied(entry);
      });
      if (next.length !== list.length) {
        state[listName] = next;
        changed = true;
      }
    }

    prune('ackCritical');
    prune('appliedOptional');
    if (changed) saveUpdateState(state);
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

  function mergeRegistryEntries(primary, secondary) {
    var map = {};
    (primary || []).concat(secondary || []).forEach(function (entry) {
      if (!entry) return;
      var id = entryId(entry);
      if (!id) return;
      map[id] = entry;
    });
    return sortEntriesForProcess(
      Object.keys(map).map(function (k) {
        return map[k];
      })
    );
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

  function ensureCriticalPlanBButtons() {
    var foot = document.querySelector('#crozzo-update-critical-overlay .crozzo-update-critical-modal');
    if (!foot || document.getElementById('crozzoUpdateCriticalPlanB')) return;
    var retry = document.getElementById('crozzoUpdateCriticalRetry');
    var html =
      '<button type="button" class="btn btn-outline" id="crozzoUpdateCriticalPlanB" style="display:none;margin-bottom:8px;width:100%">Plan B · Descarga manual</button>';
    if (retry) retry.insertAdjacentHTML('beforebegin', html);
    else foot.insertAdjacentHTML('beforeend', html);
    wireOnce(document.getElementById('crozzoUpdateCriticalPlanB'), function (e) {
      e.preventDefault();
      var ver =
        (_pendingCriticalEntry && (_pendingCriticalEntry.version || _pendingCriticalEntry.semver)) ||
        VERSION_AVAIL;
      loadPlanBFallback(ver).then(function () {
        crozzoUpdateOpenManualDownload();
      });
    });
  }

  function ensureUpdatePortals() {
    mountNormalBanner();
    ensureUpdateInstallOverlay();
    ensureCriticalProgressBar();
    ensureCriticalPlanBButtons();
    ['crozzo-update-critical-overlay', 'crozzo-update-detail-overlay', 'crozzo-update-install-overlay'].forEach(
      function (id) {
        var el = document.getElementById(id);
        if (el && el.parentElement !== document.body) {
          document.body.appendChild(el);
        }
      }
    );
  }

  function ensureCriticalProgressBar() {
    var lead = document.getElementById('crozzoUpdateCriticalLead');
    if (!lead || document.getElementById('crozzoUpdateCriticalProgress')) return;
    lead.insertAdjacentHTML(
      'afterend',
      '<div class="crozzo-update-critical-modal__progress" id="crozzoUpdateCriticalProgress" hidden>' +
        '<div class="crozzo-update-critical-modal__progress-track">' +
        '<div class="crozzo-update-critical-modal__progress-fill" id="crozzoUpdateCriticalProgressFill"></div></div>' +
        '<p class="crozzo-update-critical-modal__progress-msg" id="crozzoUpdateCriticalProgressMsg"></p></div>'
    );
  }

  function ensureUpdateInstallOverlay() {
    if (document.getElementById('crozzo-update-install-overlay')) {
      if (document.getElementById('crozzoUpdateInstallPlanB')) return;
      var old = document.getElementById('crozzo-update-install-overlay');
      if (old) old.remove();
    }
    var wrap = document.createElement('div');
    wrap.id = 'crozzo-update-install-overlay';
    wrap.className = 'crozzo-update-install-overlay';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-labelledby', 'crozzoUpdateInstallTitle');
    wrap.setAttribute('aria-hidden', 'true');
    wrap.innerHTML =
      '<div class="crozzo-update-install-card">' +
      '<div class="crozzo-update-install-card__glow" aria-hidden="true"></div>' +
      '<header class="crozzo-update-install-card__head">' +
      '<span class="crozzo-update-install-card__logo">CROZZO POS</span>' +
      '<span class="crozzo-update-install-card__eyebrow" id="crozzoUpdateInstallEyebrow">Actualización del sistema</span>' +
      '<h2 id="crozzoUpdateInstallTitle">Preparando actualización</h2>' +
      '<p id="crozzoUpdateInstallSubtitle">Mantenga la aplicación abierta hasta finalizar.</p>' +
      '</header>' +
      '<div class="crozzo-update-install-versions">' +
      '<span class="crozzo-update-install-versions__from" id="crozzoUpdateInstallFrom">—</span>' +
      '<span class="crozzo-update-install-versions__arrow" aria-hidden="true">→</span>' +
      '<span class="crozzo-update-install-versions__to" id="crozzoUpdateInstallTo">—</span>' +
      '</div>' +
      '<ol class="crozzo-update-install-steps" id="crozzoUpdateInstallSteps" aria-label="Progreso"></ol>' +
      '<div class="crozzo-update-install-progress">' +
      '<div class="crozzo-update-install-progress__track">' +
      '<div class="crozzo-update-install-progress__fill" id="crozzoUpdateInstallBarFill"></div></div>' +
      '<div class="crozzo-update-install-progress__meta">' +
      '<span class="crozzo-update-install-progress__pct" id="crozzoUpdateInstallPercent">0%</span>' +
      '<span class="crozzo-update-install-progress__msg" id="crozzoUpdateInstallMessage">Iniciando…</span>' +
      '</div></div>' +
      '<div class="crozzo-update-install-changelog" id="crozzoUpdateInstallChangelog"></div>' +
      '<div class="crozzo-update-install-planb" id="crozzoUpdateInstallPlanB" hidden>' +
      '<p class="crozzo-update-install-planb__title">Plan B — Instalación manual</p>' +
      '<p class="crozzo-update-install-planb__lead">Si la actualización automática no pudo completarse, descargue el instalador y ejecútelo en este equipo.</p>' +
      '<ol class="crozzo-update-install-planb__steps">' +
      '<li>Abra la descarga o copie el enlace del instalador.</li>' +
      '<li>Ejecute el archivo <strong>.exe</strong> descargado.</li>' +
      '<li>Cierre por completo Crozzo POS y abra la versión nueva.</li>' +
      '</ol>' +
      '<code class="crozzo-update-install-planb__url" id="crozzoUpdateInstallManualUrl"></code>' +
      '<div class="crozzo-update-install-planb__actions">' +
      '<button type="button" class="btn btn-primary btn-sm" id="crozzoUpdateInstallManualOpen">Abrir descarga</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoUpdateInstallManualCopy">Copiar enlace</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoUpdateInstallManualRelease">Ver release en GitHub</button>' +
      '</div></div>' +
      '<footer class="crozzo-update-install-foot">' +
      '<span class="crozzo-update-install-foot__plan" id="crozzoUpdateInstallPlanLabel">Plan A · automático</span>' +
      '<button type="button" class="btn btn-outline" id="crozzoUpdateInstallRetry" style="display:none">Reintentar Plan A</button>' +
      '<button type="button" class="btn btn-outline" id="crozzoUpdateInstallPlanBShow" style="display:none">Plan B manual</button>' +
      '<button type="button" class="btn btn-primary" id="crozzoUpdateInstallClose" style="display:none">Continuar</button>' +
      '</footer></div>';
    document.body.appendChild(wrap);
    wireOnce(document.getElementById('crozzoUpdateInstallRetry'), function (e) {
      e.preventDefault();
      _installUi.state = 'installing';
      _installUi.percent = 0;
      document.getElementById('crozzoUpdateInstallPlanB').hidden = true;
      if (_pendingCriticalEntry) runCriticalInstall(_pendingCriticalEntry);
      else if (_currentOptionalId) crozzoAceptarActualizacion();
    });
    wireOnce(document.getElementById('crozzoUpdateInstallPlanBShow'), function (e) {
      e.preventDefault();
      var ver = _installUi.to || VERSION_AVAIL;
      loadPlanBFallback(ver).then(function () {
        var pb = document.getElementById('crozzoUpdateInstallPlanB');
        if (pb) pb.hidden = false;
        renderInstallOverlayUi();
      });
    });
    wireOnce(document.getElementById('crozzoUpdateInstallManualOpen'), function (e) {
      e.preventDefault();
      crozzoUpdateOpenManualDownload();
    });
    wireOnce(document.getElementById('crozzoUpdateInstallManualCopy'), function (e) {
      e.preventDefault();
      crozzoUpdateCopyManualLink();
    });
    wireOnce(document.getElementById('crozzoUpdateInstallManualRelease'), function (e) {
      e.preventDefault();
      crozzoUpdateOpenReleasePage();
    });
    wireOnce(document.getElementById('crozzoUpdateInstallClose'), function (e) {
      e.preventDefault();
      closeInstallOverlay();
      if (_criticalInstallState === 'success') crozzoCerrarActualizacionCritica();
      else setDetailOpen(false);
    });
  }

  function loadPlanBFallback(targetVersion, manualFromError) {
    var ver = targetVersion || _installUi.to || VERSION_AVAIL;
    if (manualFromError && manualFromError.downloadUrl) {
      _planB = {
        version: ver,
        downloadUrl: manualFromError.downloadUrl,
        releasePageUrl: manualFromError.releasePageUrl || manualFromError.downloadUrl,
        ready: true,
      };
      return Promise.resolve(_planB);
    }
    var TU = global.CrozzoTauriUpdater;
    if (!TU || !TU.resolveManualFallback) {
      _planB = {
        version: ver,
        downloadUrl: TU && TU.releasesLatestUrl ? TU.releasesLatestUrl : '',
        releasePageUrl: TU && TU.releasesPageUrl ? TU.releasesPageUrl : '',
        ready: false,
      };
      return Promise.resolve(_planB);
    }
    return TU.resolveManualFallback(ver).then(function (info) {
      _planB = {
        version: info.version || ver,
        downloadUrl: info.downloadUrl || TU.releasesLatestUrl,
        releasePageUrl: info.releasePageUrl || TU.releasesPageUrl,
        ready: !!(info.downloadUrl || info.releasePageUrl),
      };
      return _planB;
    });
  }

  function renderPlanBUi() {
    var pb = document.getElementById('crozzoUpdateInstallPlanB');
    var urlEl = document.getElementById('crozzoUpdateInstallManualUrl');
    var adminUrl = document.getElementById('crozzoUpdatePlanBUrl');
    if (urlEl) urlEl.textContent = _planB.downloadUrl || '—';
    if (adminUrl) {
      adminUrl.innerHTML = _planB.ready
        ? '<code style="word-break:break-all">' + escapeHtml(_planB.downloadUrl) + '</code>'
        : '<span class="form-hint">Pulse «Resolver enlace manual» para la versión pendiente.</span>';
    }
    if (pb) pb.hidden = _installUi.state !== 'error';
  }

  function crozzoUpdateOpenManualDownload() {
    var url = _planB.downloadUrl;
    if (!url) {
      loadPlanBFallback(_installUi.to || VERSION_AVAIL).then(function () {
        crozzoUpdateOpenManualDownload();
      });
      return;
    }
    var TU = global.CrozzoTauriUpdater;
    var openFn = TU && TU.openExternalUrl ? TU.openExternalUrl : null;
    (openFn ? openFn(url) : Promise.resolve(false)).then(function (ok) {
      if (typeof global.showToast === 'function') {
        global.showToast(
          ok ? 'Abriendo descarga en el navegador…' : 'No se pudo abrir el enlace.',
          ok ? 'info' : 'error'
        );
      }
      appendLocalLog('plan_b_descarga', {
        version: _planB.version,
        message: url,
        type: 'manual',
      });
    });
  }

  function crozzoUpdateOpenReleasePage() {
    var url = _planB.releasePageUrl || (global.CrozzoTauriUpdater && global.CrozzoTauriUpdater.releasesPageUrl);
    if (!url) return;
    var openFn = global.CrozzoTauriUpdater && global.CrozzoTauriUpdater.openExternalUrl;
    if (openFn) openFn(url);
    else global.open(url, '_blank', 'noopener,noreferrer');
  }

  function crozzoUpdateCopyManualLink() {
    var url = _planB.downloadUrl;
    if (!url) {
      loadPlanBFallback(_installUi.to || VERSION_AVAIL).then(function () {
        crozzoUpdateCopyManualLink();
      });
      return;
    }
    function done(ok) {
      if (typeof global.showToast === 'function') {
        global.showToast(ok ? 'Enlace copiado al portapapeles.' : 'No se pudo copiar.', ok ? 'success' : 'error');
      }
    }
    if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
      global.navigator.clipboard.writeText(url).then(function () { done(true); }).catch(function () { done(false); });
      return;
    }
    try {
      var ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      done(document.execCommand('copy'));
      document.body.removeChild(ta);
    } catch (_) {
      done(false);
    }
  }

  function offerPlanBAfterFailure(targetVersion, err) {
    var manual = err && err.manualFallback;
    return loadPlanBFallback(targetVersion, manual).then(function () {
      _installUi.state = 'error';
      var pb = document.getElementById('crozzoUpdateInstallPlanB');
      if (pb) pb.hidden = false;
      renderInstallOverlayUi();
      renderPlanBAdminPanel();
    });
  }

  function renderPlanBAdminPanel() {
    renderPlanBUi();
  }

  function ensurePlanBAdminCard(root) {
    if (!root || document.getElementById('crozzoUpdatePlanBCard')) return;
    var card = document.createElement('div');
    card.className = 'card';
    card.id = 'crozzoUpdatePlanBCard';
    card.style.marginTop = '14px';
    card.innerHTML =
      '<div class="card-header"><span class="card-title">Plan B — Respaldo manual</span></div>' +
      '<p class="form-hint" style="margin:0 0 12px;">Si el Plan A (automático) falla por red, permisos o GitHub Actions, use descarga manual del instalador firmado.</p>' +
      '<div class="crozzo-updates-actions" style="flex-wrap:wrap;gap:8px;display:flex;margin-bottom:10px">' +
      '<button type="button" class="btn btn-primary btn-sm" id="crozzoUpdatePlanAForce">Reintentar Plan A</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoUpdatePlanBResolve">Resolver enlace manual</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoUpdatePlanBOpen">Abrir descarga</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoUpdatePlanBCopy">Copiar enlace</button>' +
      '</div>' +
      '<div id="crozzoUpdatePlanBUrl"></div>';
    root.appendChild(card);
    wireOnce(document.getElementById('crozzoUpdatePlanAForce'), function (e) {
      e.preventDefault();
      crozzoAceptarActualizacion();
    });
    wireOnce(document.getElementById('crozzoUpdatePlanBResolve'), function (e) {
      e.preventDefault();
      var ver = VERSION_AVAIL || VERSION;
      loadPlanBFallback(ver).then(function () {
        renderPlanBAdminPanel();
        if (typeof global.showToast === 'function') global.showToast('Enlace manual listo.', 'success');
      });
    });
    wireOnce(document.getElementById('crozzoUpdatePlanBOpen'), function (e) {
      e.preventDefault();
      crozzoUpdateOpenManualDownload();
    });
    wireOnce(document.getElementById('crozzoUpdatePlanBCopy'), function (e) {
      e.preventDefault();
      crozzoUpdateCopyManualLink();
    });
  }

  function renderInstallStepsUi() {
    var list = document.getElementById('crozzoUpdateInstallSteps');
    if (!list) return;
    var cur = _installUi.phase;
    var stepIndex = 0;
    for (var si = 0; si < INSTALL_STEPS.length; si++) {
      if (INSTALL_STEPS[si].id === cur) stepIndex = si;
    }
    if (cur === 'relaunch') stepIndex = INSTALL_STEPS.length - 1;
    if (_installUi.state === 'success') stepIndex = INSTALL_STEPS.length;
    if (_installUi.state === 'error' && stepIndex < 1) stepIndex = 1;
    list.innerHTML = INSTALL_STEPS.map(function (step, i) {
      var cls = '';
      if (_installUi.state === 'success' || i < stepIndex) cls = ' is-done';
      else if (i === stepIndex && _installUi.state !== 'error') cls = ' is-active';
      else if (_installUi.state === 'error' && i === stepIndex) cls = ' is-active';
      var icon = cls.indexOf('is-done') >= 0 ? '✓' : String(i + 1);
      return (
        '<li class="' +
        cls.trim() +
        '"><span class="crozzo-update-install-step-ico">' +
        icon +
        '</span><span>' +
        escapeHtml(step.label) +
        '</span></li>'
      );
    }).join('');
  }

  function renderInstallOverlayUi() {
    var ov = document.getElementById('crozzo-update-install-overlay');
    if (!ov) return;
    var title = document.getElementById('crozzoUpdateInstallTitle');
    var sub = document.getElementById('crozzoUpdateInstallSubtitle');
    var eyebrow = document.getElementById('crozzoUpdateInstallEyebrow');
    var fromEl = document.getElementById('crozzoUpdateInstallFrom');
    var toEl = document.getElementById('crozzoUpdateInstallTo');
    var pct = document.getElementById('crozzoUpdateInstallPercent');
    var msg = document.getElementById('crozzoUpdateInstallMessage');
    var fill = document.getElementById('crozzoUpdateInstallBarFill');
    var log = document.getElementById('crozzoUpdateInstallChangelog');
    var retry = document.getElementById('crozzoUpdateInstallRetry');
    var close = document.getElementById('crozzoUpdateInstallClose');

    ov.classList.toggle('is-critical', _installUi.mode === 'critical');
    ov.classList.toggle('is-success', _installUi.state === 'success');
    ov.classList.toggle('is-error', _installUi.state === 'error');

    if (eyebrow) {
      eyebrow.textContent =
        _installUi.mode === 'critical' ? 'Actualización crítica' : 'Actualización recomendada';
    }
    if (title) {
      if (_installUi.state === 'success') title.textContent = 'Actualización completada';
      else if (_installUi.state === 'error') title.textContent = 'No se pudo completar';
      else if (_installUi.phase === 'relaunch') title.textContent = 'Reiniciando aplicación';
      else if (_installUi.phase === 'download') title.textContent = 'Descargando actualización';
      else title.textContent = 'Instalando actualización';
    }
    if (sub) {
      if (_installUi.state === 'success') {
        sub.textContent = 'La nueva versión está lista. La aplicación se reiniciará en un momento.';
      } else if (_installUi.state === 'error') {
        sub.textContent = 'Revise la conexión o espere a que GitHub Actions termine de compilar el release.';
      } else {
        sub.textContent = 'No cierre ni apague el equipo. Este proceso puede tardar unos minutos.';
      }
    }
    if (fromEl) fromEl.textContent = _installUi.from || VERSION;
    if (toEl) toEl.textContent = _installUi.to || VERSION_AVAIL;
    if (pct) pct.textContent = Math.round(_installUi.percent) + '%';
    if (msg) msg.textContent = _installUi.message || '';
    if (fill) fill.style.width = Math.max(0, Math.min(100, _installUi.percent)) + '%';
    if (log) {
      var items = _installUi.changelog || [];
      log.innerHTML = items.length
        ? '<ul>' + items.map(function (c) { return '<li>' + escapeHtml(c) + '</li>'; }).join('') + '</ul>'
        : '';
    }
    if (retry) {
      retry.style.display = _installUi.state === 'error' ? 'inline-flex' : 'none';
      retry.textContent = 'Reintentar Plan A';
    }
    var planBShow = document.getElementById('crozzoUpdateInstallPlanBShow');
    if (planBShow) planBShow.style.display = _installUi.state === 'error' ? 'inline-flex' : 'none';
    var planLbl = document.getElementById('crozzoUpdateInstallPlanLabel');
    if (planLbl) {
      planLbl.textContent =
        _installUi.state === 'error'
          ? 'Plan A falló · Plan B disponible'
          : 'Plan A · actualización automática';
    }
    if (close) {
      close.style.display = _installUi.state === 'error' || _installUi.state === 'success' ? 'inline-flex' : 'none';
      close.textContent = _installUi.state === 'error' ? 'Cerrar' : 'Continuar';
    }
    renderInstallStepsUi();
    renderCriticalMiniProgress();
    renderPlanBUi();
  }

  function renderCriticalMiniProgress() {
    var box = document.getElementById('crozzoUpdateCriticalProgress');
    var fill = document.getElementById('crozzoUpdateCriticalProgressFill');
    var msg = document.getElementById('crozzoUpdateCriticalProgressMsg');
    if (!box) return;
    var show = _installInProgress && !_installUi.open;
    box.hidden = !show;
    if (fill) fill.style.width = Math.round(_installUi.percent) + '%';
    if (msg) msg.textContent = _installUi.message || '';
  }

  function openInstallOverlay(opts) {
    opts = opts || {};
    ensureUpdateInstallOverlay();
    _installUi.open = true;
    _installUi.mode = opts.mode || 'optional';
    _installUi.from = opts.from || VERSION;
    _installUi.to = opts.to || VERSION_AVAIL;
    _installUi.changelog = opts.changelog || [];
    _installUi.state = 'installing';
    _installUi.phase = 'probe';
    _installUi.percent = 0;
    _installUi.message = 'Preparando actualización segura…';
    var ov = document.getElementById('crozzo-update-install-overlay');
    if (ov) {
      ov.classList.add('is-open');
      ov.setAttribute('aria-hidden', 'false');
    }
    if (document.body) document.body.classList.add('crozzo-update-install-open');
    setDetailOpen(false);
    renderInstallOverlayUi();
    refreshUpdateIcons();
  }

  function closeInstallOverlay() {
    _installUi.open = false;
    var ov = document.getElementById('crozzo-update-install-overlay');
    if (ov) {
      ov.classList.remove('is-open', 'is-success', 'is-error', 'is-critical');
      ov.setAttribute('aria-hidden', 'true');
    }
    if (document.body) document.body.classList.remove('crozzo-update-install-open');
  }

  function handleInstallProgress(p) {
    if (!p) return;
    if (p.phase) _installUi.phase = p.phase;
    if (typeof p.percent === 'number') _installUi.percent = p.percent;
    if (p.message) _installUi.message = p.message;
    if (p.phase === 'error') _installUi.state = 'error';
    if (_installUi.open) renderInstallOverlayUi();
    else renderCriticalMiniProgress();
    setCheckStatus(p.message || '');
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
      populateCriticalInfo(_criticalInstallState || 'installing');
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

  function populateCriticalInfo(state, errMsg) {
    var badge = document.getElementById('crozzoUpdateCriticalBadge');
    var title = document.getElementById('crozzoUpdateCriticalTitle');
    var list = document.getElementById('crozzoUpdateCriticalList');
    var ver = document.getElementById('crozzoUpdateCriticalVersion');
    var lead = document.getElementById('crozzoUpdateCriticalLead');
    var dismiss = document.getElementById('crozzoUpdateCriticalDismiss');
    var retry = document.getElementById('crozzoUpdateCriticalRetry');
    var info = UPDATE_CRITICAL_INSTALLED;
    state = state || _criticalInstallState || 'installing';

    if (state === 'installing') {
      if (badge) {
        badge.className = 'crozzo-update-critical-modal__badge';
        badge.innerHTML = '⏳ Instalando…';
      }
      if (title) title.textContent = 'Instalando actualización crítica';
      if (lead) {
        lead.textContent = _installUi.open
          ? 'Siga el progreso en pantalla. No cierre la aplicación.'
          : 'Descargando e instalando la nueva versión (.exe). No cierre la aplicación hasta que termine.';
      }
      if (dismiss) {
        dismiss.disabled = true;
        dismiss.textContent = 'Instalando…';
      }
      if (retry) retry.style.display = 'none';
      var planBHide = document.getElementById('crozzoUpdateCriticalPlanB');
      if (planBHide) planBHide.style.display = 'none';
      renderCriticalMiniProgress();
    } else if (state === 'success') {
      if (badge) {
        badge.className =
          'crozzo-update-critical-modal__badge crozzo-update-critical-modal__badge--done';
        badge.innerHTML =
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg> Instalada';
      }
      if (title) title.textContent = 'Actualización aplicada';
      if (lead) {
        lead.textContent =
          'La nueva versión se instaló. Si no ve la interfaz nueva, cierre la app completamente y ábrala de nuevo.';
      }
      if (dismiss) {
        dismiss.disabled = false;
        dismiss.textContent = 'Entendido';
      }
      if (retry) retry.style.display = 'none';
      var planBHide2 = document.getElementById('crozzoUpdateCriticalPlanB');
      if (planBHide2) planBHide2.style.display = 'none';
    } else {
      if (badge) {
        badge.className = 'crozzo-update-critical-modal__badge';
        badge.style.background = 'rgba(220,38,38,0.15)';
        badge.style.color = '#fecaca';
        badge.innerHTML = '⚠ No instalada';
      }
      if (title) title.textContent = 'No se pudo instalar la actualización';
      if (lead) {
        lead.textContent =
          (errMsg || 'El .exe nuevo no se descargó.') +
          ' Pulse Reintentar (Plan A) o use Plan B para descargar el instalador manualmente.';
      }
      if (dismiss) {
        dismiss.disabled = false;
        dismiss.textContent = 'Cerrar';
      }
      if (retry) retry.style.display = 'inline-flex';
      var planB = document.getElementById('crozzoUpdateCriticalPlanB');
      if (planB) planB.style.display = 'inline-flex';
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
      '</strong> — pulse <strong>Instalar ahora</strong> o revise los cambios antes de continuar.';
  }

  function syncVersionLabels() {
    var label = document.getElementById('crozzoUpdatesVersionLabel');
    var binary = document.getElementById('crozzoUpdatesBinaryVersionLabel');
    if (label) label.textContent = VERSION;
    if (binary) binary.textContent = VERSION;
    global.CROZZO_APP_VERSION = VERSION;
    global.CROZZO_APP_BUILD_VERSION = VERSION;
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
      summary: entry.message || 'Nueva versión disponible.',
      changes: changes,
      notes:
        entry.notes ||
        (global.CrozzoTauriUpdater && global.CrozzoTauriUpdater.isAvailable()
          ? 'En la app de escritorio, Instalar descargará el nuevo .exe desde GitHub Releases (firmado) y reiniciará la aplicación. Hágalo al cierre del turno si puede.'
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

  function applyBinaryUpdate(targetVersion, onProgress) {
    if (!global.CrozzoTauriUpdater || !global.CrozzoTauriUpdater.isAvailable()) {
      return Promise.reject(new Error('Solo la app de escritorio (Tauri) puede instalar el .exe nuevo.'));
    }
    return global.CrozzoTauriUpdater.installLatest({
      targetVersion: targetVersion,
      onProgress: function (p) {
        handleInstallProgress(p);
        if (onProgress) onProgress(p);
      },
    });
  }

  function markCriticalInstalled(entry) {
    if (!entry) return;
    pushStateId('ackCritical', entryId(entry));
    appendLocalLog('critica_instalada', entry);
    if (VERSION) saveInstalledVersion(VERSION);
  }

  function runCriticalInstall(entry) {
    if (_installInProgress) return Promise.resolve();
    var remote = entry.version || 'v' + (entry.semver || '');
    var changes = Array.isArray(entry.changelog) ? entry.changelog.slice() : entry.message ? [entry.message] : [];
    _installInProgress = true;
    _criticalInstallState = 'installing';
    setCriticalOpen(false);
    openInstallOverlay({ mode: 'critical', from: VERSION, to: remote, changelog: changes });
    populateCriticalInfo('installing');
    setCheckStatus('Instalando ' + remote + '…');

    return applyBinaryUpdate(remote)
      .then(function (res) {
        return refreshBinaryVersion().then(function () {
          if (res && res.installed && isEntryApplied(entry)) {
            _criticalInstallState = 'success';
            _installUi.state = 'success';
            _installUi.percent = 100;
            _installUi.phase = 'relaunch';
            _installUi.message = 'Reiniciando con la interfaz nueva…';
            renderInstallOverlayUi();
            markCriticalInstalled(entry);
            setCheckStatus('Actualización ' + remote + ' instalada.');
            return res;
          }
          if (res && res.upToDate && isEntryApplied(entry)) {
            _criticalInstallState = 'success';
            _installUi.state = 'success';
            _installUi.percent = 100;
            _installUi.message = 'Este equipo ya está actualizado.';
            renderInstallOverlayUi();
            markCriticalInstalled(entry);
            closeInstallOverlay();
            setCriticalOpen(true);
            populateCriticalInfo('success');
            return res;
          }
          if (res && res.upToDate && !isEntryApplied(entry)) {
            var stampMsg =
              'La versión coincide pero falta el build nuevo en el .exe. Publique tag v' +
              String(remote).replace(/^v/, '') +
              ' y espere GitHub Actions.';
            _criticalInstallState = 'failed';
            _installUi.state = 'error';
            handleInstallProgress({ phase: 'error', percent: 100, message: stampMsg });
            offerPlanBAfterFailure(remote, null);
            setCriticalOpen(true);
            populateCriticalInfo('failed', stampMsg);
            return res;
          }
          var failMsg = 'El instalador no se aplicó. Actual: ' + VERSION + ', requerido: ' + remote + '.';
          _criticalInstallState = 'failed';
          _installUi.state = 'error';
          handleInstallProgress({ phase: 'error', percent: 100, message: failMsg });
          offerPlanBAfterFailure(remote, null);
          setCriticalOpen(true);
          populateCriticalInfo('failed', failMsg);
          return res;
        });
      })
      .catch(function (err) {
        _criticalInstallState = 'failed';
        var msg = err && err.message ? err.message : String(err);
        _installUi.state = 'error';
        handleInstallProgress({ phase: 'error', percent: 0, message: msg });
        offerPlanBAfterFailure(remote, err);
        setCriticalOpen(true);
        populateCriticalInfo('failed', msg);
        setCheckStatus('Error al instalar: ' + msg);
        console.warn('[crozzo-updates] install failed', err);
      })
      .finally(function () {
        _installInProgress = false;
        renderCriticalMiniProgress();
      });
  }

  function showCriticalEntry(entry) {
    var id = entryId(entry);
    var remote = entry.version || 'v' + (entry.semver || '');
    var prev = VERSION;
    _currentCriticalId = id;
    _pendingCriticalEntry = entry;

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

    setDetailOpen(false);
    setNormalOpen(false);

    if (global.CrozzoTauriUpdater && global.CrozzoTauriUpdater.isAvailable()) {
      runCriticalInstall(entry);
    } else {
      setCriticalOpen(true);
      _criticalInstallState = 'failed';
      populateCriticalInfo(
        'failed',
        'Abra la aplicación desde el acceso directo de escritorio (.exe), no desde el navegador, para instalar actualizaciones.'
      );
    }
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
    if (_installInProgress || _criticalInstallState === 'installing' || _installUi.open) return false;

    pruneStaleStateFlags();
    var state = loadUpdateState();
    var sorted = sortEntriesForProcess(entries);

    for (var i = 0; i < sorted.length; i++) {
      var entry = sorted[i];
      if (!entryNeedsInstall(entry)) continue;
      var id = entryId(entry);

      if (isCriticalEntry(entry)) {
        if (stateHas(state.ackCritical, id) && isEntryApplied(entry)) continue;
        return showCriticalEntry(entry);
      }

      if (stateHas(state.appliedOptional, id) && isEntryApplied(entry)) continue;
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
    var manifestUrl = getManifestUrl();
    var registryP = fetchWithTimeout(registryUrl, 12000)
      .then(function (res) {
        if (res.ok) return res.json();
        throw new Error('registry HTTP ' + res.status);
      })
      .catch(function () {
        return null;
      });
    var manifestP = fetchWithTimeout(manifestUrl, 12000)
      .then(function (res) {
        if (!res.ok) throw new Error('manifest HTTP ' + res.status);
        return res.json();
      })
      .catch(function () {
        return null;
      });
    return Promise.all([registryP, manifestP]).then(function (parts) {
      var reg = normalizeRegistryEntries(parts[0]);
      var man = normalizeRegistryEntries(parts[1]);
      if (reg.length && man.length) return mergeRegistryEntries(reg, man);
      if (reg.length) return reg;
      if (man.length) return man;
      throw new Error('No se pudo leer registry ni latest.json');
    });
  }

  function getEntryStatusLabel(entry) {
    var state = loadUpdateState();
    var id = entryId(entry);
    var applied = isEntryApplied(entry);
    var remote = entry.version || 'v' + (entry.semver || '');
    if (isCriticalEntry(entry)) {
      if (applied) return 'Instalada (.exe + build)';
      if (compareSemver(remote, VERSION) > 0) return 'Pendiente · falta .exe';
      if (compareSemver(remote, VERSION) === 0 && !applied) return 'Pendiente · recompilar .exe';
      if (stateHas(state.ackCritical, id)) return 'Vista (sin instalar)';
      return 'Pendiente';
    }
    if (applied) return 'Instalada (.exe + build)';
    if (stateHas(state.appliedOptional, id)) return 'Marcada (revisar .exe)';
    if (stateHas(state.dismissedOptional, id)) return 'Aviso oculto';
    if (compareSemver(remote, VERSION) > 0) return 'Pendiente · falta .exe';
    if (compareSemver(remote, VERSION) === 0) return 'Pendiente · recompilar .exe';
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
      '<p class="form-hint" style="margin:8px 0 0;">Aviso OTA (main) ≠ instalador: hace falta tag <code>vX.Y.Z</code> + workflow Tauri Release. Misma versión puede tener crítica y opcional con IDs distintos.</p>';
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

    return refreshBinaryVersion()
      .then(function () {
        return fetchRegistryData();
      })
      .then(function (data) {
        _registryEntries = normalizeRegistryEntries(data);
        global.CROZZO_UPDATE_REGISTRY = _registryEntries.slice();
        pruneStaleStateFlags();
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
            'Hay ' +
              pending.length +
              ' actualización(es) más nueva(s) en GitHub. Use Restablecer avisos o Instalar (requiere release v' +
              (pending[0] && pending[0].semver ? pending[0].semver : '?') +
              ' en GitHub).'
          );
        } else {
          var maxRemote = _registryEntries.reduce(function (best, e) {
            var rv = e.version || 'v' + (e.semver || '');
            return !best || compareSemver(rv, best) > 0 ? rv : best;
          }, '');
          var needsExe =
            maxRemote && compareSemver(maxRemote, VERSION) > 0
              ? ' Hay release ' + maxRemote + ' en GitHub; pulse Instalar en escritorio para bajar el .exe.'
              : '';
          setCheckStatus(
            'Avisos al día. Versión equipo: ' + VERSION + '.' + needsExe
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
    if (_criticalInstallState === 'success' && _currentCriticalId) {
      var entry = _registryEntries.find(function (e) {
        return entryId(e) === _currentCriticalId;
      });
      if (entry && !isEntryApplied(entry)) {
        try {
          if (typeof global.showToast === 'function') {
            global.showToast(
              'La versión del ejecutable aún no coincide. Cierre la aplicación por completo y vuelva a abrirla.',
              'warning'
            );
          }
        } catch (_) {}
      }
    }
    if (_criticalInstallState !== 'success' && _criticalInstallState !== 'failed') {
      return;
    }
    setCriticalOpen(false);
    _criticalInstallState = 'idle';
    _pendingCriticalEntry = null;
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
      localStorage.removeItem(LS_INSTALLED);
    } catch (_) {}
    refreshBinaryVersion().then(function () {
      if (typeof global.showToast === 'function') {
        global.showToast('Avisos restablecidos. Comprobando de nuevo…', 'info');
      }
      checkForUpdates({ silent: true, toastOnFound: true });
    });
  }

  function markOptionalInstalled(entry) {
    if (_currentOptionalId) {
      pushStateId('appliedOptional', _currentOptionalId);
      var e =
        entry ||
        _registryEntries.find(function (x) {
          return entryId(x) === _currentOptionalId;
        });
      if (e) appendLocalLog('opcional_instalada', e);
    }
    if (VERSION) saveInstalledVersion(VERSION);
  }

  function crozzoAceptarActualizacion() {
    if (_installInProgress) return;
    var next = VERSION_AVAIL;
    setDetailOpen(false);
    setNormalOpen(false);

    var acceptBtn = document.getElementById('crozzoUpdateDetailAccept');
    if (acceptBtn) {
      acceptBtn.disabled = true;
      acceptBtn.textContent = 'Instalando…';
    }

    function resetAcceptBtn() {
      if (acceptBtn) {
        acceptBtn.disabled = false;
        acceptBtn.textContent = 'Instalar actualización';
      }
    }

    if (global.CrozzoTauriUpdater && global.CrozzoTauriUpdater.isAvailable()) {
      _installInProgress = true;
      setCheckStatus('Descargando e instalando ' + next + '…');
      openInstallOverlay({
        mode: 'optional',
        from: VERSION,
        to: next,
        changelog: UPDATE_NORMAL.changes || [],
      });
      applyBinaryUpdate(next)
        .then(function (res) {
          return refreshBinaryVersion().then(function () {
            resetAcceptBtn();
            var entry =
              _registryEntries.find(function (e) {
                return entryId(e) === _currentOptionalId;
              }) || null;
            if (res && res.installed) {
              if (!entry || isEntryApplied(entry)) {
                _installUi.state = 'success';
                _installUi.percent = 100;
                _installUi.phase = 'relaunch';
                _installUi.message = 'Reiniciando…';
                renderInstallOverlayUi();
                markOptionalInstalled(entry);
                return;
              }
            }
            if (res && res.upToDate && entry && isEntryApplied(entry)) {
              closeInstallOverlay();
              markOptionalInstalled(entry);
              try {
                if (typeof global.showToast === 'function') {
                  global.showToast('Actualización ' + next + ' ya está en este ejecutable.', 'info');
                }
              } catch (_) {}
              return;
            }
            _installUi.state = 'error';
            var hint =
              res && res.upToDate && entry && !isEntryApplied(entry)
                ? 'Versión ' +
                  VERSION +
                  ' sin el build OTA nuevo. Republicar tag y esperar GitHub Actions.'
                : 'No se aplicó el .exe ' +
                  next +
                  '. Ejecutable actual: ' +
                  VERSION +
                  '. Espere GitHub Actions o republique.';
            handleInstallProgress({ phase: 'error', percent: 100, message: hint });
            offerPlanBAfterFailure(next, null);
            setNormalOpen(true);
            setCheckStatus(hint);
            try {
              if (typeof global.showToast === 'function') {
                global.showToast('No se instaló el ejecutable ' + next + '.', 'error');
              }
            } catch (_) {}
          });
        })
        .catch(function (err) {
          resetAcceptBtn();
          setNormalOpen(true);
          console.warn('[crozzo-tauri-updater]', err);
          var msg = err && err.message ? err.message : String(err);
          _installUi.state = 'error';
          handleInstallProgress({ phase: 'error', percent: 0, message: msg });
          offerPlanBAfterFailure(next, err);
          setCheckStatus('Error: ' + msg);
          try {
            if (typeof global.showToast === 'function') {
              global.showToast('Plan A falló. Plan B manual disponible.', 'error');
            }
          } catch (_) {}
        })
        .finally(function () {
          _installInProgress = false;
        });
      return;
    }

    resetAcceptBtn();
    try {
      if (typeof global.showToast === 'function') {
        global.showToast('Use la app de escritorio (.exe) para instalar actualizaciones.', 'warning');
      }
    } catch (_) {}
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

    ensurePlanBAdminCard(root);

    syncVersionLabels();
    renderRegistryPanel();
    renderLocalLogPanel();
    refreshBinaryVersion().then(function () {
      checkForUpdates({ silent: true });
    });
  }

  function initCrozzoUpdateOverlays() {
    ensureUpdatePortals();
    refreshUpdateIcons();

    wireOnce(document.getElementById('crozzoUpdateCriticalDismiss'), function (e) {
      e.preventDefault();
      crozzoCerrarActualizacionCritica();
    });
    wireOnce(document.getElementById('crozzoUpdateCriticalRetry'), function (e) {
      e.preventDefault();
      if (_pendingCriticalEntry) runCriticalInstall(_pendingCriticalEntry);
    });
    wireOnce(document.getElementById('crozzoUpdateNormalLater'), function (e) {
      e.preventDefault();
      crozzoCerrarActualizacionNormal();
    });
    wireOnce(document.getElementById('crozzoUpdateNormalChanges'), function (e) {
      e.preventDefault();
      crozzoVerCambiosActualizacion();
    });
    wireOnce(document.getElementById('crozzoUpdateNormalInstall'), function (e) {
      e.preventDefault();
      crozzoAceptarActualizacion();
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
    fetchTauriBinaryVersion().then(function (binaryVer) {
      VERSION = reconcileInstalledVersion(binaryVer);
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
    });
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
  global.crozzoUpdateOpenManualDownload = crozzoUpdateOpenManualDownload;
  global.crozzoUpdateCopyManualLink = crozzoUpdateCopyManualLink;
  global.crozzoUpdateOpenReleasePage = crozzoUpdateOpenReleasePage;
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
