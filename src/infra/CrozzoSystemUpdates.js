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
  var LS_APPLIED_ENTRIES = 'crozzo_update_applied_entry_ids';
  var LS_SESSION_DISMISS = 'crozzo_update_session_dismiss';
  /** Crítica ya descargada: el usuario pulsó «Continuar operando» (no volver a mostrar en esta sesión). */
  var LS_CRITICAL_OVERLAY_ACK = 'crozzo_critical_overlay_ack';
  var LS_SNOOZE_UNTIL = 'crozzo_update_snooze_until';
  var LS_POST_UPDATE_WELCOME = 'crozzo_update_post_welcome';
  var LS_PENDING_RESTART = 'crozzo_update_pending_restart';
  var SS_ANDROID_PENDING = 'crozzo_android_pending_apk_version';
  var CHANGELOG_TAG_META = {
    FIX: { key: 'fix', label: 'Correcciones', icon: '🔧' },
    UI: { key: 'ui', label: 'Pantalla más clara', icon: '✨' },
    PERF: { key: 'perf', label: 'Más velocidad', icon: '⚡' },
    NEW: { key: 'new', label: 'Funciones nuevas', icon: '🆕' },
    UPD: { key: 'upd', label: 'Mejoras', icon: '📈' },
    AUTO: { key: 'auto', label: 'Automatización', icon: '🤖' },
    SEC: { key: 'sec', label: 'Seguridad', icon: '🔒' },
  };
  var CHECK_INTERVAL_MS = 15 * 60 * 1000;
  var BOOT_DELAY_MS = 2000;
  var BOOT_GATE_MAX_MS = 12000;
  var _bootUpdatePhase = false;
  var _bootUpdatesReady = false;
  var _bootReadyWaiters = [];
  var _deferOptionalBannerSession = false;

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
  var POS_IDLE_POLL_MS = 4000;
  var _criticalIdleTimer = null;
  var _criticalWaitingForIdle = false;
  var _criticalIdleToastShown = false;
  var _optionalIdleTimer = null;
  var CRITICAL_AUTO_RETRY_MS = 10 * 60 * 1000;
  var _criticalRetryTimer = null;
  var _criticalFailCount = 0;
  var _criticalAutoAttempts = 0;
  var CRITICAL_AUTO_INSTALL_MAX = 3;
  var CRITICAL_INFO_DELAY_MS = 2400;
  var _optionalWizard = { step: 0, steps: [], entry: null };
  var _deferredAndroidCritical = null;
  var _criticalDownloadSilent = false;

  function requestUpdateAbort() {
    global.__CROZZO_UPDATE_USER_ABORT__ = true;
  }

  function clearUpdateAbort() {
    global.__CROZZO_UPDATE_USER_ABORT__ = false;
  }

  function loadPendingRestartInstall() {
    try {
      var raw = localStorage.getItem(LS_PENDING_RESTART);
      if (!raw || raw.length > 4000) return null;
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function savePendingRestartInstall(entry, meta) {
    meta = meta || {};
    var payload = {
      version: meta.version || normEntryVersion(entry),
      entryId: entryId(entry),
      critical: meta.critical != null ? !!meta.critical : isCriticalEntry(entry),
      url: String(meta.url || ''),
      webReload: !!meta.webReload,
      ready: meta.ready !== false,
      savedAt: Date.now(),
    };
    try {
      localStorage.setItem(LS_PENDING_RESTART, JSON.stringify(payload));
    } catch (_) {}
    return payload;
  }

  function clearPendingRestartInstall() {
    try {
      localStorage.removeItem(LS_PENDING_RESTART);
    } catch (_) {}
  }

  function prefetchUpdateArtifactForRestart(entry, onProgress) {
    var remote = normEntryVersion(entry);
    var profile = getUpdateClientProfile();
    var TU = global.CrozzoTauriUpdater;
    function tick(phase, percent, message) {
      if (typeof onProgress === 'function') onProgress({ phase: phase, percent: percent, message: message });
    }
    tick('probe', 8, 'Buscando paquete ' + remote + ' en GitHub…');
    if (profile.canAutoInstall && TU) {
      var resolveFn =
        typeof TU.waitUntilReleaseReady === 'function'
          ? function () {
              return TU.waitUntilReleaseReady(remote, onProgress, 90000);
            }
          : function () {
              return TU.resolveReleaseInstallTarget
                ? TU.resolveReleaseInstallTarget(remote)
                : Promise.resolve(null);
            };
      return resolveFn().then(function (hit) {
        if (!hit || !hit.url) throw new Error('El instalador aún no está en GitHub. Espere GitHub Actions.');
        tick('download', 92, 'Paquete verificado — listo para instalar al reiniciar');
        return { version: remote, url: hit.url, ready: true };
      });
    }
    if (profile.isAndroid && TU && typeof TU.resolveBestApkUrl === 'function') {
      return TU.resolveBestApkUrl(remote).then(function (info) {
        if (!info || !info.downloadUrl) throw new Error('APK no disponible en GitHub todavía.');
        tick('download', 92, 'APK listo — se instalará al reiniciar la app');
        return { version: remote, url: info.downloadUrl, ready: true };
      });
    }
    tick('download', 90, 'Recarga al reiniciar con la versión del servidor');
    return Promise.resolve({ version: remote, url: '', webReload: true, ready: true });
  }

  function startCriticalDownloadForRestart(entry, opts) {
    opts = opts || {};
    if (!entry) return Promise.resolve({ skipped: true });
    _pendingCriticalEntry = entry;
    _currentCriticalId = entryId(entry);
    _criticalDownloadSilent = !!opts.silent;
    _criticalInstallState = 'downloading';
    _installUi.phase = 'download';
    _installUi.percent = 10;
    _installUi.message = 'Descargando actualización crítica…';
    setDetailOpen(false);
    setNormalOpen(false);
    hideBootUpdateGate();
    if (!_criticalDownloadSilent) {
      setCriticalOpen(true);
      populateCriticalInfo('downloading');
    }
    setCheckStatus('Descargando actualización crítica ' + normEntryVersion(entry) + '…');
    return prefetchUpdateArtifactForRestart(entry, function (p) {
      if (!p) return;
      if (p.phase) _installUi.phase = p.phase;
      if (typeof p.percent === 'number') _installUi.percent = p.percent;
      if (p.message) _installUi.message = p.message;
      populateCriticalInfo('downloading');
      renderCriticalMiniProgress();
    })
      .then(function (meta) {
        savePendingRestartInstall(entry, Object.assign({ critical: true }, meta));
        appendLocalLog('critica_lista_reinicio', entry);
        _criticalInstallState = 'pending_restart';
        _criticalDownloadSilent = false;
        _installUi.percent = 100;
        _installUi.message = 'Descarga lista. Se instalará al reiniciar la app.';
        if (shouldShowCriticalOverlay(entry)) {
          setCriticalOpen(true);
          populateCriticalInfo('pending_restart');
        } else {
          setCriticalOpen(false);
        }
        setCheckStatus('Actualización crítica lista — se aplicará al reiniciar BONA origen.');
        if (typeof global.showToast === 'function' && shouldShowCriticalOverlay(entry)) {
          global.showToast('Actualización crítica descargada. Se instalará al reiniciar la app.', 'info');
        }
        return { ok: true, pendingRestart: true };
      })
      .catch(function (err) {
        _criticalInstallState = 'failed';
        _criticalDownloadSilent = false;
        populateCriticalInfo('failed', humanizeInstallError(err));
        setCheckStatus('Error descarga crítica: ' + humanizeInstallError(err));
        return Promise.reject(err);
      });
  }

  function startOptionalDownloadForRestart(entry) {
    if (!entry || _installInProgress) return Promise.resolve();
    var remote = normEntryVersion(entry);
    _currentOptionalId = entryId(entry);
    _installInProgress = true;
    openInstallOverlay({
      mode: 'optional',
      from: VERSION,
      to: remote,
      changelog: UPDATE_NORMAL.changes || [],
    });
    _installUi.state = 'installing';
    _installUi.phase = 'download';
    _installUi.percent = 12;
    _installUi.message = 'Descargando actualización opcional…';
    renderInstallOverlayUi();
    setCheckStatus('Descargando mejora ' + remote + '…');
    return prefetchUpdateArtifactForRestart(entry, function (p) {
      handleInstallProgress(p);
    })
      .then(function (meta) {
        savePendingRestartInstall(entry, Object.assign({ critical: false }, meta));
        appendLocalLog('opcional_lista_reinicio', entry);
        _installUi.state = 'success';
        _installUi.percent = 100;
        _installUi.phase = 'install';
        _installUi.message =
          'Descarga lista. Al reiniciar BONA origen se instalará automáticamente (también si luego hay una crítica).';
        renderInstallOverlayUi();
        sessionDismissEntry(entry);
        setNormalOpen(false);
        setCheckStatus('Mejora ' + remote + ' lista para el próximo reinicio.');
        if (typeof global.showToast === 'function') {
          global.showToast('Actualización opcional descargada. Se instalará al reiniciar.', 'success');
        }
      })
      .catch(function (err) {
        _installUi.state = 'error';
        handleInstallProgress({ phase: 'error', percent: 0, message: humanizeInstallError(err) });
        setNormalOpen(true);
      })
      .finally(function () {
        _installInProgress = false;
      });
  }

  /**
   * Instala la mejora opcional AHORA, enrutando por plataforma (lo más rápido,
   * "un toque"): en APK descarga y abre el instalador del sistema (un solo toque);
   * en escritorio prepara/instala; en web recarga. Se usa al iniciar sesión / en
   * pantalla de inicio para no mostrar el letrero "puede seguir operando".
   */
  function installOptionalNowAtStartup(entry) {
    if (!entry || _installInProgress) return Promise.resolve();
    var remote = normEntryVersion(entry);
    _currentOptionalId = entryId(entry);
    _installInProgress = true;
    openInstallOverlay({
      mode: 'optional',
      from: VERSION,
      to: remote,
      changelog: (UPDATE_NORMAL && UPDATE_NORMAL.changes) || [],
    });
    _installUi.state = 'installing';
    _installUi.phase = 'download';
    _installUi.percent = 10;
    _installUi.message = 'Actualizando…';
    renderInstallOverlayUi();
    setCheckStatus('Actualizando a ' + remote + '…');
    return applyClientUpdate(remote, handleInstallProgress, {
      automaticOnly: false,
      userInitiated: true,
      markInstalled: getUpdateClientProfile().kind !== 'android',
    })
      .then(function (res) {
        if (res && res.exiting && res.plan === 'web_reload') return res;
        return handleAndroidOtaResult(res, {
          entry: entry,
          remote: remote,
          uiMode: 'optional',
          allowForceRetry: true,
        }).then(function () {
          return res;
        });
      })
      .catch(function (err) {
        _installUi.state = 'error';
        handleInstallProgress({ phase: 'error', percent: 0, message: humanizeInstallError(err) });
        // Respaldo: si la instalación automática falla, mostramos el banner.
        setNormalOpen(true);
      })
      .finally(function () {
        _installInProgress = false;
      });
  }

  function applyPendingRestartInstallOnBoot(entries) {
    var pending = loadPendingRestartInstall();
    if (!pending || !pending.ready || !pending.version) return Promise.resolve(false);
    if (compareSemver(VERSION, pending.version) >= 0) {
      clearPendingRestartInstall();
      return Promise.resolve(false);
    }
    var pool = entries || _registryEntries || [];
    var entry =
      pool.find(function (e) {
        return entryId(e) === pending.entryId;
      }) || null;
    if (!entry) {
      entry = {
        id: pending.entryId || pending.version,
        version: pending.version,
        semver: String(pending.version).replace(/^v/i, ''),
        type: pending.critical ? 'critical' : 'optional',
      };
    }
    _pendingCriticalEntry = entry;
    setCheckStatus('Aplicando actualización pendiente ' + pending.version + '…');
    return runCriticalInstall(entry)
      .then(function () {
        clearPendingRestartInstall();
        return true;
      })
      .catch(function () {
        return false;
      });
  }

  var INSTALL_STEPS = [
    { id: 'probe', label: 'Verificando paquete en la nube' },
    { id: 'check', label: 'Validando firma de seguridad' },
    { id: 'download', label: 'Descargando actualización' },
    { id: 'install', label: 'Aplicando en este equipo' },
    { id: 'relaunch', label: 'Reiniciando con la nueva versión' },
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
      'Al actualizar, Crozzo POS se reiniciará automáticamente. Hágalo con la caja sin ventas en curso.',
  };

  var UPDATE_CRITICAL_INSTALLED = {
    version: 'v1.0.1-security',
    previous: VERSION,
    date: '',
    installed: [],
  };

  function refreshUpdateIcons() {
    try {
      if (typeof global.crozzoRefreshLucideIcons === 'function') {
        var updRoot = document.getElementById('mainContent') || document.querySelector('.crozzo-updates-page');
        global.crozzoRefreshLucideIcons(updRoot || null);
      } else if (global.lucide && typeof global.lucide.createIcons === 'function') {
        var mc = document.getElementById('mainContent');
        if (mc) global.lucide.createIcons({ nodes: [mc] });
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

  function readStoredInstalledVersion() {
    try {
      var v = localStorage.getItem(LS_INSTALLED);
      if (v && String(v).trim()) return String(v).trim();
    } catch (_) {}
    return null;
  }

  function loadInstalledVersion() {
    var meta = readMetaBuildVersion();
    if (meta) return meta;
    return readStoredInstalledVersion() || 'v1.0.0';
  }

  /** Binario del APK manda sobre localStorage (evita “versión fantasma” en Android OTA). */
  function reconcileInstalledVersion(binaryVer) {
    var binary = binaryVer ? normEntryVersion({ version: binaryVer }) : null;
    var meta = readMetaBuildVersion();
    var stored = readStoredInstalledVersion();
    if (binary) {
      if (stored && compareSemver(stored, binary) > 0) {
        console.warn(
          '[crozzo-updates] localStorage decía',
          stored,
          'pero el binario es',
          binary,
          '— corrigiendo'
        );
      }
      return binary;
    }
    return meta || stored || 'v1.0.0';
  }

  function finalizeAndroidPendingInstall(installedVer) {
    var pending = null;
    try {
      pending = sessionStorage.getItem(SS_ANDROID_PENDING);
    } catch (_) {}
    if (!pending) return;
    var pv = normEntryVersion({ version: pending });
    if (!pv || compareSemver(installedVer, pv) < 0) return;
    try {
      sessionStorage.removeItem(SS_ANDROID_PENDING);
    } catch (_) {}
    _registryEntries.forEach(function (entry) {
      if (!entry) return;
      if (compareSemver(installedVer, normEntryVersion(entry)) >= 0 && !isEntryApplied(entry)) {
        markEntryFullyApplied(entry, installedVer, { skipAndroidGuard: true });
      }
    });
    try {
      if (typeof global.showToast === 'function') {
        global.showToast('Actualización ' + installedVer + ' instalada correctamente.', 'success');
      }
    } catch (_) {}
  }

  function refreshBinaryVersion() {
    return fetchTauriBinaryVersion().then(function (binaryVer) {
      VERSION = reconcileInstalledVersion(binaryVer);
      global.CROZZO_APP_VERSION = VERSION;
      try {
        localStorage.setItem(LS_INSTALLED, VERSION);
      } catch (_) {}
      syncVersionLabels();
      if (getUpdateClientProfile().kind === 'android') {
        finalizeAndroidPendingInstall(VERSION);
      }
      return VERSION;
    });
  }

  function normEntryVersion(entry) {
    if (!entry) return '';
    var v = entry.version || entry.semver || '';
    v = String(v).trim();
    return v.indexOf('v') === 0 ? v : 'v' + v;
  }

  function loadAppliedEntryIds() {
    try {
      var raw = localStorage.getItem(LS_APPLIED_ENTRIES);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function markEntryFullyApplied(entry, targetVersion, opts) {
    opts = opts || {};
    if (!entry) return;
    var id = entryId(entry);
    if (!id) return;
    var tv = targetVersion ? normEntryVersion({ version: targetVersion }) : normEntryVersion(entry);
    if (
      tv &&
      !opts.skipAndroidGuard &&
      getUpdateClientProfile().kind === 'android' &&
      compareSemver(tv, VERSION) > 0
    ) {
      console.warn(
        '[crozzo-updates] no marcar',
        tv,
        'como instalada: binario actual',
        VERSION
      );
      return;
    }
    if (tv) {
      VERSION = tv;
      global.CROZZO_APP_VERSION = tv;
      saveInstalledVersion(tv);
      syncVersionLabels();
    }
    try {
      var ids = loadAppliedEntryIds();
      if (ids.indexOf(id) < 0) ids.push(id);
      localStorage.setItem(LS_APPLIED_ENTRIES, JSON.stringify(ids));
    } catch (_) {}
    queuePostUpdateWelcome(entry, tv);
    if (isCriticalEntry(entry)) {
      pushStateId('ackCritical', id);
      appendLocalLog('critica_instalada', entry);
    } else {
      pushStateId('appliedOptional', id);
      appendLocalLog('opcional_instalada', entry);
    }
  }

  function commitEntryInstall(entry, targetVersion) {
    if (!entry) return;
    markEntryFullyApplied(entry, targetVersion || normEntryVersion(entry));
  }

  function clearSessionDismissals() {
    try {
      sessionStorage.removeItem(LS_SESSION_DISMISS);
      sessionStorage.removeItem(LS_CRITICAL_OVERLAY_ACK);
    } catch (_) {}
  }

  function loadSessionDismissIds() {
    try {
      var raw = sessionStorage.getItem(LS_SESSION_DISMISS);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function sessionDismissEntry(entry) {
    var id = entryId(entry);
    if (!id) return;
    var ids = loadSessionDismissIds();
    if (ids.indexOf(id) < 0) ids.push(id);
    try {
      sessionStorage.setItem(LS_SESSION_DISMISS, JSON.stringify(ids));
    } catch (_) {}
  }

  function isSessionDismissed(entry) {
    return loadSessionDismissIds().indexOf(entryId(entry)) >= 0;
  }

  function loadCriticalOverlayAckIds() {
    try {
      var raw = sessionStorage.getItem(LS_CRITICAL_OVERLAY_ACK);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function isCriticalOverlayAcked(entry) {
    return loadCriticalOverlayAckIds().indexOf(entryId(entry)) >= 0;
  }

  function sessionDismissCriticalOverlay(entry) {
    if (!entry) return;
    sessionDismissEntry(entry);
    var id = entryId(entry);
    if (!id) return;
    var ids = loadCriticalOverlayAckIds();
    if (ids.indexOf(id) < 0) ids.push(id);
    try {
      sessionStorage.setItem(LS_CRITICAL_OVERLAY_ACK, JSON.stringify(ids));
    } catch (_) {}
  }

  function shouldShowCriticalOverlay(entry) {
    if (_criticalInstallState === 'downloading' && _criticalDownloadSilent) return false;
    if (_criticalInstallState === 'pending_restart') return !isCriticalOverlayAcked(entry);
    return true;
  }

  function loadSnoozeMap() {
    try {
      var raw = localStorage.getItem(LS_SNOOZE_UNTIL);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function saveSnoozeMap(map) {
    try {
      localStorage.setItem(LS_SNOOZE_UNTIL, JSON.stringify(map || {}));
    } catch (_) {}
  }

  function snoozeEntry(entry, hours) {
    var id = entryId(entry);
    if (!id) return;
    var map = loadSnoozeMap();
    map[id] = Date.now() + (hours || 6) * 3600000;
    saveSnoozeMap(map);
  }

  function isSnoozed(entry) {
    var map = loadSnoozeMap();
    var until = map[entryId(entry)];
    if (!until) return false;
    if (Date.now() >= until) {
      delete map[entryId(entry)];
      saveSnoozeMap(map);
      return false;
    }
    return true;
  }

  function isBuildOnlyUpdate(entry) {
    if (!entry) return false;
    if (compareSemver(normEntryVersion(entry), VERSION) !== 0) return false;
    if (isCriticalEntry(entry)) return false;
    return !isEntryApplied(entry);
  }

  function entryBuildStamp(entry) {
    if (!entry) return '';
    return String(entry.publishedAt || entry.updatedAt || '').trim();
  }

  function isEntryApplied(entry) {
    if (!entry) return false;
    var remote = normEntryVersion(entry);
    var cmp = compareSemver(VERSION, remote);
    if (cmp < 0) return false;
    if (cmp > 0) return true;
    // Misma semver que el binario: nunca reinstalar por sello OTA distinto.
    return true;
  }

  /** Marca entradas del registry ya cubiertas por la versión instalada (evita bucles al arrancar). */
  function reconcileAppliedEntriesForVersion(installedVer) {
    var ver = normEntryVersion({ version: installedVer || VERSION });
    if (!ver || !_registryEntries.length) return;
    _registryEntries.forEach(function (entry) {
      if (!entry) return;
      if (compareSemver(ver, normEntryVersion(entry)) >= 0 && !isEntryApplied(entry)) {
        markEntryFullyApplied(entry, ver);
      }
    });
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

  function resolveAppBrandName() {
    try {
      if (typeof global.crozzoAppDisplayName === 'function') {
        var n = String(global.crozzoAppDisplayName() || '').trim();
        if (n) return n;
      }
      if (global.CROZZO_APP_DISPLAY_NAME) {
        return String(global.CROZZO_APP_DISPLAY_NAME).trim();
      }
    } catch (_) {}
    return 'BONA origen';
  }

  function androidInstallUninstallGuide(short) {
    var TU = global.CrozzoTauriUpdater;
    if (!short && TU && typeof TU.androidInstallConflictHelp === 'function') {
      return TU.androidInstallConflictHelp();
    }
    return (
      'Si Android dice «no se pudo instalar» o «conflicto de paquetes»: Ajustes → Apps → busque «BONA origen» → Desinstalar. ' +
      'Luego instale el APK BONA_origen_*_arm64.apk desde GitHub Releases (no use «Actualizar» sobre la app vieja).'
    );
  }

  function humanizeInstallError(err) {
    var raw = err && err.message ? err.message : String(err || '');
    if (
      /conflicto de paquetes|conflicting packages|UPDATE_INCOMPATIBLE|INSTALL_FAILED_UPDATE|signatures do not match|signature mismatch|different key|signature was created|no coinciden las firmas|firma incompatible/i.test(
        raw
      )
    ) {
      if (getUpdateClientProfile().isAndroid) return androidInstallUninstallGuide(false);
    }
    if (/different key|signature was created/i.test(raw)) {
      return 'Actualizando por método alternativo automático (instalador silencioso)…';
    }
    if (/APK aún no está|compilación Android/i.test(raw)) {
      return 'El APK aún no está listo en GitHub. Espere la compilación o use el enlace manual en Actualizaciones.';
    }
    if (/No se pudo abrir la descarga del APK|navegador para descargar/i.test(raw)) {
      return raw;
    }
    if (/pospuesta por el usuario|cancelada por el usuario/i.test(raw)) {
      return 'Actualización pospuesta. Puede seguir operando e instalar al cierre del turno.';
    }
    if (/timeout|timed out|abort/i.test(raw)) {
      return 'La conexión tardó demasiado. Intente de nuevo con mejor señal o use «Continuar al login» si aparece.';
    }
    if (/failed to fetch|network error|fetch failed|enotfound|econn/i.test(raw)) {
      return 'Sin conexión estable. Revise su internet e intente de nuevo.';
    }
    if (typeof global.crozzoUserFacingError === 'function') {
      var mapped = global.crozzoUserFacingError(err);
      if (mapped && mapped.length <= 160) return mapped;
    }
    if (raw.length > 140) return 'No se pudo completar la actualización. Intente de nuevo o use el enlace manual.';
    return raw || 'No se pudo completar la actualización.';
  }

  function getUpdateClientProfile() {
    var TU = global.CrozzoTauriUpdater;
    var kind = TU && TU.getClientKind ? TU.getClientKind() : 'web';
    var canAutoInstall =
      (TU &&
        TU.canUseTauriUpdater &&
        TU.canUseTauriUpdater() &&
        TU.isAvailable &&
        TU.isAvailable()) ||
      (kind === 'android' &&
        TU &&
        TU.canUseAndroidInAppUpdater &&
        TU.canUseAndroidInAppUpdater());
    var assetKind =
      TU && TU.getPlatformAssetKind ? TU.getPlatformAssetKind() : kind === 'android' || kind === 'android-web'
        ? 'apk'
        : kind === 'mac'
          ? 'dmg'
          : kind === 'windows' || kind === 'desktop'
            ? 'exe'
            : 'web';
    var artifactLabel =
      TU && TU.platformArtifactLabel
        ? TU.platformArtifactLabel(assetKind)
        : assetKind === 'exe'
          ? 'Windows (.exe)'
          : assetKind === 'dmg'
            ? 'macOS (.dmg)'
            : assetKind === 'apk'
              ? 'Android (APK)'
              : 'navegador';
    return {
      kind: kind,
      assetKind: assetKind,
      artifactLabel: artifactLabel,
      isWeb: kind === 'web' || kind === 'ios-web',
      isAndroid: kind === 'android' || kind === 'android-web',
      isWindows: kind === 'windows' || kind === 'desktop',
      isMac: kind === 'mac',
      isDesktopBinary: kind === 'windows' || kind === 'mac' || kind === 'desktop',
      canAutoInstall: !!canAutoInstall,
    };
  }

  /** Escritorio: ON por defecto; opt-out con localStorage crozzo_ota_auto=0 (desarrollo). */
  function otaAutoInstallAllowed() {
    var TU = global.CrozzoTauriUpdater;
    if (TU && typeof TU.isDesktopBinaryInstallAllowed === 'function') {
      return TU.isDesktopBinaryInstallAllowed({ automaticOnly: true });
    }
    try {
      if (localStorage.getItem('crozzo_ota_auto') === '0') return false;
    } catch (_) {}
    return true;
  }

  function getPlatformUpdateDescriptor() {
    return getUpdateClientProfile().artifactLabel || 'este equipo';
  }

  function desktopRestartNotice() {
    var profile = getUpdateClientProfile();
    if (profile.isDesktopBinary) {
      return (
        'Al actualizar, BONA origen se cerrará un momento e volverá a abrir sola con la versión nueva. ' +
        'No cierre la ventana manualmente; espere a que reaparezca.'
      );
    }
    if (profile.isAndroid) {
      return (
        'Descargará el APK. Tras pulsar «Actualizar» en Android, la app se cierra; ' +
        'ábrala de nuevo desde el icono (el sistema no permite reabrir sola tras instalar).'
      );
    }
    return 'La aplicación se recargará con la versión nueva del servidor.';
  }

  /** Perfil operativo + rol: adapta tono del aviso (simulación E1 — equipo inexperto). */
  function getUpdateOperativeContext() {
    var ctx = {
      experiencia: 'mixed',
      canInstall: true,
      isPeak: false,
      roleLabel: '',
      isStaffOnly: false,
    };
    try {
      if (typeof global.crozzoGetPerfilOperativo === 'function' && typeof global.crozzoGetPerfilEmpresa === 'function') {
        var op = global.crozzoGetPerfilOperativo(global.crozzoGetPerfilEmpresa());
        if (op && op.experiencia) ctx.experiencia = op.experiencia;
      }
    } catch (_) {}
    try {
      if (typeof global.isSuperAdminUser === 'function' && global.isSuperAdminUser()) {
        ctx.canInstall = true;
        ctx.roleLabel = 'super_admin';
        return ctx;
      }
      var u = typeof global.getCurrentUser === 'function' ? global.getCurrentUser() : null;
      if (u) {
        var r =
          typeof global.crozzoNormalizeAppRol === 'function'
            ? global.crozzoNormalizeAppRol(u.rol)
            : String(u.rol || '').toLowerCase();
        ctx.roleLabel = r;
        ctx.canInstall =
          r === 'admin' || r === 'super_admin' || r === 'gerente' || r === 'caja' || r === 'inventario';
        ctx.isStaffOnly = !ctx.canInstall && (r === 'mesero' || r === 'cocina' || r === 'user' || !r);
      }
    } catch (_) {}
    try {
      var stress = document.body && document.body.getAttribute('data-crozzo-stress');
      ctx.isPeak =
        stress === 'busy' || stress === 'rush' || stress === 'critical' ||
        !!(document.body && document.body.classList.contains('crozzo-peak-novice'));
    } catch (_) {}
    return ctx;
  }

  /**
   * ¿El usuario está TRABAJANDO en la app? (operación en curso)
   * - Sin sesión / en pantalla de inicio => NO está trabajando.
   * - Logueado pero sin ventas/carritos/comandas abiertas => NO está trabajando.
   * - Con carritos o comandas activas => SÍ está trabajando (no interrumpir).
   * Sirve para: en login/inicio aplicar la actualización; solo mostrar el letrero
   * "puede seguir operando" cuando ya hay operación en curso.
   */
  function crozzoUpdateUserBusy() {
    try {
      var u = typeof global.getCurrentUser === 'function' ? global.getCurrentUser() : null;
      if (!u) return false; // pantalla de inicio / sin sesión
      var s = typeof global.collectPosRuntimeState === 'function' ? global.collectPosRuntimeState() : null;
      if (!s) return false;
      var hasCart = function (m) {
        return (
          m &&
          typeof m === 'object' &&
          Object.keys(m).some(function (k) {
            return Array.isArray(m[k]) && m[k].length;
          })
        );
      };
      if (hasCart(s.cartsPorMesa) || hasCart(s.cartsPorLlevar)) return true;
      if (Array.isArray(s.cartDirecto) && s.cartDirecto.length) return true;
      if (
        Array.isArray(s.comandas) &&
        s.comandas.some(function (c) {
          return c && c.estado !== 'entregada';
        })
      ) {
        return true;
      }
      return false;
    } catch (_) {
      return false;
    }
  }
  global.crozzoUpdateUserBusy = crozzoUpdateUserBusy;

  function parseChangelogLine(line) {
    var raw = String(line || '').trim();
    if (!raw) return { tag: 'general', text: '', label: 'Novedades', icon: '📋' };
    var m = /^\[(FIX|UI|PERF|NEW|UPD|AUTO|SEC)\]\s*(.*)$/i.exec(raw);
    if (!m) return { tag: 'general', text: raw, label: 'Novedades', icon: '📋' };
    var meta = CHANGELOG_TAG_META[m[1].toUpperCase()] || CHANGELOG_TAG_META.UPD;
    return {
      tag: meta.key,
      text: String(m[2] || raw).trim(),
      label: meta.label,
      icon: meta.icon,
    };
  }

  function noviceFriendlyChange(parsed) {
    if (!parsed || !parsed.text) return '';
    if (parsed.tag === 'perf') return 'El sistema responderá más rápido, sobre todo en horas pico.';
    if (parsed.tag === 'sec') return 'Refuerzo de seguridad: sus datos y la caja quedan más protegidos.';
    if (parsed.tag === 'ui') return 'Pantallas más fáciles de leer durante el servicio.';
    if (parsed.tag === 'fix') return 'Corregimos un detalle para que el turno fluya mejor: ' + parsed.text;
    return parsed.text;
  }

  function buildHumanChangelogHtml(changes, opts) {
    opts = opts || {};
    var ctx = opts.ctx || getUpdateOperativeContext();
    var novice = ctx.experiencia === 'novice' || ctx.experiencia === 'mixed';
    var list = (changes || []).filter(Boolean);
    if (!list.length) {
      return '<p class="crozzo-update-detail-modal__empty">Sin detalle de cambios en el registro remoto.</p>';
    }
    var groups = {};
    list.forEach(function (line) {
      var p = parseChangelogLine(line);
      var key = p.tag || 'general';
      if (!groups[key]) groups[key] = { meta: p, items: [] };
      groups[key].items.push(p);
    });
    var order = ['sec', 'fix', 'perf', 'ui', 'new', 'upd', 'auto', 'general'];
    var html = '<div class="crozzo-update-changelog-human">';
    order.forEach(function (key) {
      var g = groups[key];
      if (!g || !g.items.length) return;
      html +=
        '<section class="crozzo-update-changelog-human__group">' +
        '<h4 class="crozzo-update-changelog-human__title">' +
        escapeHtml(g.meta.icon + ' ' + g.meta.label) +
        '</h4><ul class="crozzo-update-changelog-human__list">';
      g.items.forEach(function (p) {
        var txt = novice ? noviceFriendlyChange(p) : p.text;
        html += '<li>' + escapeHtml(txt) + '</li>';
      });
      html += '</ul></section>';
    });
    html += '</div>';
    return html;
  }

  function buildNoviceImpactHtml(changes) {
    var top = (changes || []).slice(0, 3).map(parseChangelogLine);
    if (!top.length) return '';
    var bullets = top
      .map(function (p) {
        return '<li>' + escapeHtml(noviceFriendlyChange(p)) + '</li>';
      })
      .join('');
    return (
      '<div class="crozzo-update-detail-modal__impact">' +
      '<h3>Qué significa para su turno</h3>' +
      '<ul>' +
      bullets +
      '</ul>' +
      '<p class="form-hint">No tiene que memorizar nada: la app sigue igual de usar. Instale al cierre o cuando no haya ventas abiertas.</p>' +
      '</div>'
    );
  }

  function applyNormalBannerRoleChrome(ctx) {
    var banner = document.getElementById('crozzo-update-normal-banner');
    var installBtn = document.getElementById('crozzoUpdateNormalInstall');
    var laterBtn = document.getElementById('crozzoUpdateNormalLater');
    var changesBtn = document.getElementById('crozzoUpdateNormalChanges');
    if (!banner) return;
    ctx = ctx || getUpdateOperativeContext();
    banner.classList.toggle('crozzo-update-normal-banner--novice', ctx.experiencia === 'novice');
    banner.classList.toggle('crozzo-update-normal-banner--peak', !!ctx.isPeak);
    banner.classList.toggle('crozzo-update-normal-banner--staff', !!ctx.isStaffOnly);
    if (installBtn) {
      if (ctx.isStaffOnly) {
        installBtn.hidden = true;
      } else {
        installBtn.hidden = false;
        installBtn.textContent =
          ctx.experiencia === 'novice'
            ? ctx.isPeak
              ? 'Descargar al cierre'
              : 'Descargar mejora'
            : 'Descargar actualización';
      }
    }
    if (laterBtn) {
      laterBtn.textContent = ctx.experiencia === 'novice' ? 'Recordarme mañana' : 'Recordar después';
    }
    if (changesBtn) {
      changesBtn.textContent = ctx.experiencia === 'novice' ? 'Ver qué cambia' : 'Ver cambios';
    }
  }

  function buildUpdateToastMessage(entry, isCritical) {
    var ctx = getUpdateOperativeContext();
    var ver = normEntryVersion(entry);
    if (isCritical) {
      return ctx.experiencia === 'novice'
        ? 'Actualización importante: se descarga sola. Al reiniciar BONA origen se instalará.'
        : 'Actualización crítica: descargando… se aplicará al reiniciar.';
    }
    if (ctx.isStaffOnly) {
      return 'Hay una mejora del sistema. Avise al encargado cuando haya un momento tranquilo.';
    }
    if (ctx.experiencia === 'novice') {
      return 'Mejora disponible (' + ver + '). Instálela al cierre — no interrumpe ventas en curso.';
    }
    return 'Nueva versión ' + ver + ' disponible.';
  }

  function queuePostUpdateWelcome(entry, targetVersion) {
    var changes = [];
    if (entry && Array.isArray(entry.changelog)) changes = entry.changelog.slice();
    else if (UPDATE_NORMAL && Array.isArray(UPDATE_NORMAL.changes)) changes = UPDATE_NORMAL.changes.slice();
    var ctx = getUpdateOperativeContext();
    var headline =
      ctx.experiencia === 'novice'
        ? 'Listo — la app quedó actualizada. Siga con su turno con normalidad.'
        : 'Actualización ' + (targetVersion || normEntryVersion(entry)) + ' aplicada correctamente.';
    try {
      localStorage.setItem(
        LS_POST_UPDATE_WELCOME,
        JSON.stringify({
          at: Date.now(),
          version: targetVersion || normEntryVersion(entry),
          headline: headline,
          changes: changes.slice(0, 4),
          experiencia: ctx.experiencia,
        })
      );
    } catch (_) {}
  }

  function maybeShowPostUpdateWelcome() {
    var pack = null;
    try {
      var raw = localStorage.getItem(LS_POST_UPDATE_WELCOME);
      if (raw) pack = JSON.parse(raw);
    } catch (_) {}
    if (!pack || !pack.headline) return;
    try {
      localStorage.removeItem(LS_POST_UPDATE_WELCOME);
    } catch (_) {}
    if (typeof global.showToast !== 'function') return;
    global.showToast(pack.headline, 'success');
    if (pack.changes && pack.changes.length && typeof global.openModal === 'function') {
      var body =
        buildNoviceImpactHtml(pack.changes) ||
        buildHumanChangelogHtml(pack.changes, { ctx: { experiencia: pack.experiencia || 'mixed' } });
      setTimeout(function () {
        try {
          global.openModal(
            'Actualización instalada · ' + escapeHtml(pack.version || ''),
            body +
              '<div class="modal-actions" style="margin-top:14px;"><button type="button" class="btn btn-primary" onclick="closeModal()">Entendido — continuar</button></div>'
          );
        } catch (_) {}
      }, 900);
    }
  }

  function fetchEmbeddedChangelogLines() {
    var urls = ['changelog.txt', '../changelog.txt', 'app/changelog.txt'];
    var idx = 0;
    function tryNext() {
      if (idx >= urls.length) return Promise.resolve([]);
      var url = urls[idx++];
      return fetch(url + '?_=' + Date.now(), { cache: 'no-store' })
        .then(function (res) {
          if (!res.ok) return tryNext();
          return res.text();
        })
        .then(function (text) {
          if (!text || typeof text !== 'string') return tryNext();
          var lines = [];
          text.split(/\r?\n/).forEach(function (line) {
            var t = String(line || '').trim();
            if (!t || /^CHANGELOG/i.test(t) || /^=+$/.test(t)) return;
            if (/^\[/.test(t)) lines.push(t);
            else if (lines.length && /^\s+-/.test(line)) {
              lines[lines.length - 1] += ' — ' + t.replace(/^\s+-+\s*/, '');
            } else if (t.indexOf('—') >= 0 || t.indexOf('-') === 0) {
              lines.push('[UPD] ' + t.replace(/^[-–—]\s*/, ''));
            }
          });
          return lines.length ? lines : tryNext();
        })
        .catch(function () {
          return tryNext();
        });
    }
    return tryNext();
  }

  function enrichEntryChangelog(entry) {
    if (!entry) return Promise.resolve(entry);
    var existing = Array.isArray(entry.changelog) ? entry.changelog.slice() : [];
    if (existing.length) return Promise.resolve(entry);
    return fetchEmbeddedChangelogLines().then(function (lines) {
      if (!lines.length) return entry;
      entry.changelog = lines;
      return entry;
    });
  }

  function planBAssetLabel(profile) {
    profile = profile || getUpdateClientProfile();
    if (profile.isAndroid) return 'APK Android';
    if (profile.kind === 'mac') return 'instalador .dmg';
    if (profile.isDesktopBinary) return 'instalador .exe';
    return 'release de GitHub';
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
    if (!entry) return false;
    var t = String(entry.type || '').toLowerCase();
    if (t === 'optional' || t === 'opcional' || t === 'normal') return false;
    return (
      t === 'critical' ||
      t === 'critica' ||
      t === 'crítica' ||
      entry.installMode === 'auto'
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

  function appendLocalLog(action, entry, extraMessage) {
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
      version: entry && (entry.version || entry.semver),
      type: entry && entry.type,
      message: extraMessage || (entry && entry.message) || '',
    });
    if (log.length > 80) log.length = 80;
    try {
      localStorage.setItem(LS_LOCAL_LOG, JSON.stringify(log));
    } catch (_) {}
    renderLocalLogPanel();
  }

  function logInstallFailure(entry, err, plan) {
    var msg = err && err.message ? err.message : String(err || 'error');
    appendLocalLog('instalacion_fallida', entry, (plan ? plan + ': ' : '') + msg);
  }

  function cancelCriticalAutoRetry() {
    if (_criticalRetryTimer) {
      clearTimeout(_criticalRetryTimer);
      _criticalRetryTimer = null;
    }
  }

  function scheduleCriticalInstallRetry(entry, err) {
    if (!entry) return;
    _criticalFailCount += 1;
    logInstallFailure(entry, err, 'critica');
    cancelCriticalAutoRetry();
    var msg = humanizeInstallError(err);
    _criticalInstallState = 'failed';
    _installInProgress = false;
    setCriticalOpen(true);
    populateCriticalInfo(
      'failed',
      msg + ' Puede seguir operando e instalar cuando quiera desde Actualizaciones.'
    );
    offerPlanBAfterFailure(normEntryVersion(entry), err);
    setCheckStatus('Actualización pendiente — la caja sigue operando.');
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
    if (Array.isArray(data)) {
      return data.filter(function (e) {
        return e && (e.id || e.version || e.semver);
      });
    }
    if (Array.isArray(data.entries) && data.entries.length) {
      return data.entries.slice();
    }
    if (data.version || data.semver) {
      return [data];
    }
    return [];
  }

  function entryIsPending(entry) {
    if (!entry || !entryNeedsInstall(entry)) return false;
    if (isSnoozed(entry)) return false;
    if (isSessionDismissed(entry)) return false;
    if (isCriticalEntry(entry)) return true;
    var state = loadUpdateState();
    if (stateHas(state.dismissedOptional, entryId(entry))) return false;
    return true;
  }

  function getNewestEntry(entries) {
    if (!entries || !entries.length) return null;
    return entries.reduce(function (best, e) {
      if (!best) return e;
      return compareSemver(normEntryVersion(e), normEntryVersion(best)) > 0 ? e : best;
    }, null);
  }

  function applyAvailabilityFromRegistry(entries) {
    var next = pickNextPendingEntry(entries) || getNewestEntry(entries);
    if (!next) return;
    var remote = normEntryVersion(next);
    VERSION_AVAIL = remote;
    global.CROZZO_APP_VERSION_DISPONIBLE = remote;
    if (!isCriticalEntry(next)) {
      UPDATE_NORMAL = buildUpdateNormalFromEntry(next, VERSION);
    }
  }

  function pickNextPendingEntry(entries) {
    var pending = (entries || []).filter(entryIsPending);
    if (!pending.length) return null;
    var critical = pending.filter(isCriticalEntry);
    var pool = critical.length ? critical : pending.filter(function (e) {
      return !isCriticalEntry(e);
    });
    if (!pool.length) pool = pending;
    return pool.reduce(function (best, e) {
      if (!best) return e;
      var cmp = compareSemver(e.version || e.semver, best.version || best.semver);
      return cmp > 0 ? e : best;
    }, null);
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

  function ensureCriticalAndroidDeferButton() {
    ensureCriticalPlanBButtons();
    var foot = document.querySelector('#crozzo-update-critical-overlay .crozzo-update-critical-modal');
    if (!foot || document.getElementById('crozzoUpdateCriticalLater')) return;
    var ref = document.getElementById('crozzoUpdateCriticalDismiss');
    var html =
      '<button type="button" class="btn btn-outline" id="crozzoUpdateCriticalLater" style="display:none;margin-bottom:8px;width:100%">Seguir usando la app</button>';
    if (ref) ref.insertAdjacentHTML('beforebegin', html);
    else foot.insertAdjacentHTML('beforeend', html);
    wireOnce(document.getElementById('crozzoUpdateCriticalLater'), function (e) {
      e.preventDefault();
      crozzoPosponerActualizacionCritica();
    });
  }

  function ensureUpdatePortals() {
    mountNormalBanner();
    ensureUpdateInstallOverlay();
    ensureCriticalProgressBar();
    ensureCriticalAndroidDeferButton();
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
      '<span class="crozzo-update-install-card__logo" id="crozzoUpdateInstallBrand"></span>' +
      '<span class="crozzo-update-install-card__eyebrow" id="crozzoUpdateInstallEyebrow">Actualización del sistema</span>' +
      '<h2 id="crozzoUpdateInstallTitle">Preparando actualización</h2>' +
      '<p id="crozzoUpdateInstallSubtitle">Mantenga la aplicación abierta. La actualización es silenciosa, sin ventanas de Windows.</p>' +
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
      '<li>Cierre por completo la aplicación y abra la versión nueva.</li>' +
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
      '<button type="button" class="btn btn-primary" id="crozzoUpdateInstallClose" style="display:none">Continuar usando la app</button>' +
      '</footer></div>';
    document.body.appendChild(wrap);
    wireOnce(document.getElementById('crozzoUpdateInstallRetry'), function (e) {
      e.preventDefault();
      _installUi.state = 'installing';
      _installUi.percent = 0;
      document.getElementById('crozzoUpdateInstallPlanB').hidden = true;
      if (_pendingCriticalEntry) scheduleCriticalInstallWhenIdle(_pendingCriticalEntry);
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
      dismissInstallOverlayAndContinue();
    });
    if (!wrap.__crozzoEscWired) {
      wrap.__crozzoEscWired = true;
      document.addEventListener('keydown', function (ev) {
        if (ev.key !== 'Escape' || !_installUi.open || _installUi.state !== 'error') return;
        dismissInstallOverlayAndContinue();
      });
    }
  }

  function dismissInstallOverlayAndContinue() {
    if (_installUi.state === 'success' && loadPendingRestartInstall()) {
      closeInstallOverlay();
      _installInProgress = false;
      return;
    }
    requestUpdateAbort();
    cancelCriticalAutoRetry();
    var entry = _pendingCriticalEntry;
    var optEntry = findCurrentOptionalEntry();
    closeInstallOverlay();
    _installInProgress = false;
    _criticalInstallState = 'idle';
    setCriticalOpen(false);
    if (entry) {
      snoozeEntry(entry, 6);
      sessionDismissEntry(entry);
    }
    if (optEntry) {
      snoozeEntry(optEntry, 6);
      sessionDismissEntry(optEntry);
      _currentOptionalId = null;
    }
    _pendingCriticalEntry = null;
    if (typeof global.showToast === 'function') {
      global.showToast(
        'Puede seguir usando la app. Instale la actualización al cierre del turno desde Actualizaciones.',
        'info'
      );
    }
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
        downloadUrl: '',
        releasePageUrl: TU && TU.releasesPageUrl ? TU.releasesPageUrl : '',
        ready: false,
      };
      return Promise.resolve(_planB);
    }
    var resolveFn = TU.resolveBestDownloadUrl || TU.resolveBestApkUrl || TU.resolveBestSetupUrl || TU.resolveManualFallback;
    return resolveFn(ver).then(function (info) {
      _planB = {
        version: info.version || ver,
        downloadUrl: info.downloadUrl || TU.releasesLatestUrl,
        releasePageUrl: info.releasePageUrl || TU.releasesPageUrl,
        ready: !!(info.downloadUrl || info.releasePageUrl),
        verified: !!info.verified,
        assetType: info.assetType || '',
      };
      return _planB;
    });
  }

  function runInternalUpdateAudit(opts) {
    opts = opts || {};
    var TU = global.CrozzoTauriUpdater;
    var profile = getUpdateClientProfile();
    var report = {
      at: new Date().toISOString(),
      ok: true,
      profile: profile,
      versionLocal: VERSION,
      versionObjetivo: VERSION_AVAIL,
      steps: [],
    };

    function step(name, ok, detail) {
      report.steps.push({ name: name, ok: !!ok, detail: detail || '' });
      if (!ok) report.ok = false;
    }

    step('plataforma', true, profile.kind + ' → ' + (profile.artifactLabel || profile.assetKind));
    step('boot_pipeline', typeof runBootUpdatePipeline === 'function', 'runBootUpdatePipeline registrado');
    step('auditoria_exportada', typeof global.crozzoUpdateRunDiagnostic === 'function', 'crozzoUpdateRunDiagnostic en consola');

    var registryP = fetch(DEFAULT_REGISTRY_URL, { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) {
          step('registry_ota', false, 'HTTP ' + res.status);
          return null;
        }
        return res.json();
      })
      .then(function (data) {
        var entries = data && Array.isArray(data.entries) ? data.entries : [];
        step('registry_ota', entries.length > 0, entries.length + ' entrada(s) en main');
      })
      .catch(function (e) {
        step('registry_ota', false, e && e.message ? e.message : 'sin red');
      });

    var probeP = Promise.resolve();
    if (TU && TU.probePlatformInstaller) {
      probeP = TU.probePlatformInstaller().then(function (p) {
        step('comando_nativo', p.ok, p.platform || p.error || '');
      });
    }

    var target = VERSION_AVAIL || VERSION;
    var assetP = TU && TU.resolveReleaseInstallTarget
      ? TU.resolveReleaseInstallTarget(target)
          .then(function (hit) {
            step('artefacto_github', !!(hit && hit.url), hit ? hit.url + ' (' + (hit.assetType || '') + ')' : 'no encontrado');
            if (TU.validateArtifactForPlatform && hit) {
              var v = TU.validateArtifactForPlatform(hit, profile.assetKind);
              step('compatible_plataforma', v.ok, v.ok ? 'paquete correcto para este equipo' : v.message || v.reason);
            }
          })
          .catch(function (e) {
            step('artefacto_github', false, e && e.message ? e.message : String(e));
          })
      : Promise.resolve();

    var stabilityP =
      TU && TU.checkReleaseMultiplatformStability
        ? TU.checkReleaseMultiplatformStability(target)
            .then(function (st) {
              step('release_windows', !!st.windows, st.windows ? 'setup.exe listo' : 'falta o incompleto');
              step('release_mac', !!st.mac, st.mac ? 'dmg listo' : 'falta');
              step('release_android', !!st.android, st.android ? 'apk listo' : 'falta');
              step(
                'release_estable_mayoria',
                st.complete || st.majorityStable,
                st.complete
                  ? 'Win+Mac+Android completos'
                  : st.majorityStable
                    ? 'mayoría de plataformas OK'
                    : 'publique de nuevo el tag y espere CI'
              );
            })
            .catch(function (e) {
              step('release_estable_mayoria', false, e && e.message ? e.message : String(e));
            })
        : Promise.resolve();

    return registryP
      .then(function () {
        return probeP;
      })
      .then(function () {
        return assetP;
      })
      .then(function () {
        return stabilityP;
      })
      .then(function () {
        var pending = (_registryEntries || []).filter(entryIsPending);
        step('parches_pendientes', pending.length === 0, pending.length ? pending.length + ' pendiente(s)' : 'ninguno');
        global.__CROZZO_LAST_UPDATE_AUDIT = report;
        if (!opts.silent) {
          console.info('[crozzo-audit]', report);
        }
        return report;
      });
  }

  function crozzoUpdateRunDiagnostic() {
    var ver = VERSION_AVAIL || VERSION;
    var TU = global.CrozzoTauriUpdater;
    var profile = getUpdateClientProfile();
    setCheckStatus('Auditoría automática para ' + (profile.artifactLabel || ver) + '…');

    return runInternalUpdateAudit({ silent: false })
      .then(function (audit) {
        if (!profile.canAutoInstall || !TU || !TU.getVersion) {
          var msg =
            'Auditoría ' +
            profile.kind +
            ': ' +
            (audit.ok ? 'lista para actualizar' : 'revisar red o release en GitHub');
          setCheckStatus(msg);
          if (typeof global.showToast === 'function') {
            global.showToast(msg, audit.ok ? 'success' : 'warning');
          }
          return audit;
        }
        var lines = audit.steps.map(function (s) {
          return (s.ok ? '✓ ' : '✗ ') + s.name + ': ' + s.detail;
        });
        return TU.getVersion().then(function (current) {
          lines.push('Versión ejecutable: ' + (current || '—'));
          lines.push('Objetivo OTA: ' + ver);
          if (TU.check) {
            return TU.check({ timeout: 45000 })
              .then(function (meta) {
                lines.push(
                  meta
                    ? 'Updater Tauri: meta v' + (meta.version || '?')
                    : 'Updater Tauri: sin actualización pendiente'
                );
                return { ok: audit.ok, lines: lines, audit: audit, meta: meta };
              })
              .catch(function (err) {
                lines.push(
                  'Updater Tauri: ' + (err && err.message ? err.message : String(err)) + ' (se usará instalador nativo)'
                );
                return { ok: audit.ok, lines: lines, audit: audit, error: err };
              });
          }
          return { ok: audit.ok, lines: lines, audit: audit };
        });
      })
      .then(function (report) {
        var text = (report.lines || []).join(' · ');
        setCheckStatus(text);
        appendLocalLog('diagnostico', { version: ver, type: 'diagnostico', message: text.slice(0, 500) });
        if (typeof global.showToast === 'function') {
          global.showToast(
            report.ok ? 'Auditoría OK — actualización automática disponible.' : 'Auditoría: hay problemas (F12 → __CROZZO_LAST_UPDATE_AUDIT).',
            report.ok ? 'success' : 'warning'
          );
        }
        console.info('[crozzo-audit]', global.__CROZZO_LAST_UPDATE_AUDIT || report);
        return report;
      });
  }

  function renderPlanBUi() {
    var pb = document.getElementById('crozzoUpdateInstallPlanB');
    var urlEl = document.getElementById('crozzoUpdateInstallManualUrl');
    var adminUrl = document.getElementById('crozzoUpdatePlanBUrl');
    var hint = document.getElementById('crozzoUpdatePlanBHint');
    var profile = getUpdateClientProfile();
    if (hint) {
      hint.textContent = profile.isAndroid
        ? androidInstallUninstallGuide(true)
        : profile.isWeb
          ? 'En navegador la interfaz se recarga sola; si usa app nativa, descargue el instalador correspondiente.'
          : 'Si el Plan A (automático) falla por red, permisos o GitHub Actions, use descarga manual del instalador firmado.';
    }
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
      var profile = getUpdateClientProfile();
      var label = /\.apk/i.test(url) ? 'APK' : planBAssetLabel(profile);
      if (typeof global.showToast === 'function') {
        global.showToast(
          ok ? 'Abriendo descarga del ' + label + '…' : 'No se pudo abrir el enlace.',
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
      '<p class="form-hint" style="margin:0 0 12px;" id="crozzoUpdatePlanBHint">Si el Plan A (automático) falla, descargue el instalador desde GitHub.</p>' +
      '<div class="crozzo-updates-actions" style="flex-wrap:wrap;gap:8px;display:flex;margin-bottom:10px">' +
      '<button type="button" class="btn btn-primary btn-sm" id="crozzoUpdatePlanAForce">Reintentar Plan A</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoUpdatePlanBResolve">Resolver enlace manual</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoUpdatePlanBOpen">Abrir descarga</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoUpdatePlanBCopy">Copiar enlace</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoUpdateDiagnose">Diagnosticar cadena</button>' +
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
    wireOnce(document.getElementById('crozzoUpdateDiagnose'), function (e) {
      e.preventDefault();
      crozzoUpdateRunDiagnostic();
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
        sub.textContent =
          _installUi.message ||
          'Al reiniciar BONA origen se instalará automáticamente. Puede seguir operando la caja.';
      } else if (_installUi.state === 'error') {
        sub.textContent = 'Revise la conexión o espere a que GitHub Actions termine de compilar el release.';
      } else if (_installUi.phase === 'relaunch') {
        sub.textContent = 'Reiniciando Crozzo POS con la versión nueva…';
      } else if (getUpdateClientProfile().isDesktopBinary) {
        sub.textContent =
          'Al terminar, la aplicación se cerrará y volverá a abrir sola. No la cierre manualmente.';
      } else {
        sub.textContent = 'No cierre la aplicación hasta que termine la actualización.';
      }
    }
    var brandEl = document.getElementById('crozzoUpdateInstallBrand');
    if (brandEl) brandEl.textContent = resolveAppBrandName();
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
      var canDeferWhileInstalling =
        _installUi.state === 'installing' &&
        (_installUi.phase === 'probe' || _installUi.phase === 'check' || (_installUi.percent || 0) < 35);
      close.style.display =
        _installUi.state === 'error' || _installUi.state === 'success' || canDeferWhileInstalling
          ? 'inline-flex'
          : 'none';
      close.textContent = canDeferWhileInstalling
        ? 'Seguir operando — descargar al cierre'
        : _installUi.state === 'error'
          ? 'Continuar usando la app'
          : _installUi.state === 'success'
            ? 'Continuar operando'
            : 'Continuar';
    }
    if (_installUi.state === 'error') {
      var pbErr = document.getElementById('crozzoUpdateInstallPlanB');
      if (pbErr) pbErr.hidden = false;
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
    var show = _criticalInstallState === 'installing' || _criticalInstallState === 'downloading';
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
    if (p.message) {
      _installUi.message =
        p.phase === 'error' ? humanizeInstallError({ message: p.message }) : p.message;
    }
    if (p.phase === 'error') _installUi.state = 'error';
    if (_installUi.open) renderInstallOverlayUi();
    if (_installUi.open || _criticalInstallState === 'installing' || _criticalInstallState === 'downloading') {
      setCheckStatus(p.message || '');
      if ((_criticalInstallState === 'installing' || _criticalInstallState === 'downloading') && !_installUi.open) {
        populateCriticalInfo(_criticalInstallState === 'downloading' ? 'downloading' : 'installing');
        renderCriticalMiniProgress();
      }
    }
    if (_bootUpdatePhase && p.message) setBootGateMessage(p.message);
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

    if (state === 'info') {
      if (badge) {
        badge.className = 'crozzo-update-critical-modal__badge';
        badge.style.background = 'rgba(220,38,38,0.18)';
        badge.style.color = '#fecaca';
        badge.innerHTML = '🔒 Actualización crítica';
      }
      if (title) title.textContent = 'Actualización crítica obligatoria';
      if (lead) {
        lead.textContent =
          desktopRestartNotice() +
          ' Mantenga Crozzo POS abierto hasta que termine el reinicio.';
      }
      if (dismiss) {
        dismiss.disabled = true;
        dismiss.textContent = 'Preparando instalación…';
      }
      if (retry) retry.style.display = 'none';
      var planBInfo = document.getElementById('crozzoUpdateCriticalPlanB');
      if (planBInfo) planBInfo.style.display = 'none';
      var laterInfo = document.getElementById('crozzoUpdateCriticalLater');
      if (laterInfo) laterInfo.style.display = 'none';
      var progInfo = document.getElementById('crozzoUpdateCriticalProgress');
      if (progInfo) progInfo.hidden = true;
    } else if (state === 'downloading') {
      if (badge) {
        badge.className = 'crozzo-update-critical-modal__badge';
        badge.style.background = 'rgba(59,130,246,0.18)';
        badge.style.color = '#bfdbfe';
        badge.innerHTML = '⬇ Descargando…';
      }
      if (title) title.textContent = 'Descargando actualización crítica';
      if (lead) {
        lead.textContent =
          _installUi.message ||
          'No cierre la app. La instalación se aplicará automáticamente al reiniciar BONA origen.';
      }
      if (dismiss) {
        dismiss.disabled = true;
        dismiss.textContent = 'Descargando…';
      }
      if (retry) retry.style.display = 'none';
      var planBDl = document.getElementById('crozzoUpdateCriticalPlanB');
      if (planBDl) planBDl.style.display = 'none';
      var laterDl = document.getElementById('crozzoUpdateCriticalLater');
      if (laterDl) laterDl.style.display = 'none';
      renderCriticalMiniProgress();
    } else if (state === 'pending_restart') {
      if (badge) {
        badge.className =
          'crozzo-update-critical-modal__badge crozzo-update-critical-modal__badge--done';
        badge.style.background = '';
        badge.style.color = '';
        badge.innerHTML = '✓ Lista para reinicio';
      }
      if (title) title.textContent = 'Actualización crítica descargada';
      if (lead) {
        var prProfile = getUpdateClientProfile();
        lead.textContent = prProfile.isDesktopBinary
          ? 'La actualización ya está descargada. Al cerrar y volver a abrir BONA origen se instalará sola (o pulse Instalar en Configuración → Actualizaciones).'
          : 'Al reiniciar BONA origen se instalará automáticamente. Puede seguir operando la caja con normalidad.';
      }
      if (dismiss) {
        dismiss.disabled = false;
        dismiss.textContent = 'Continuar operando';
      }
      if (retry) retry.style.display = 'none';
      var planBPr = document.getElementById('crozzoUpdateCriticalPlanB');
      if (planBPr) planBPr.style.display = 'none';
      var laterPr = document.getElementById('crozzoUpdateCriticalLater');
      if (laterPr) laterPr.style.display = 'none';
      var progPr = document.getElementById('crozzoUpdateCriticalProgress');
      if (progPr) progPr.hidden = true;
    } else if (state === 'idle' || state === 'pending') {
      var profile = getUpdateClientProfile();
      if (badge) {
        badge.className = 'crozzo-update-critical-modal__badge';
        badge.style.background = '';
        badge.style.color = '';
        badge.innerHTML = profile.isAndroid ? '📱 Actualización tablet' : '🌐 Actualización web';
      }
      if (title) {
        title.textContent =
          profile.kind === 'android'
            ? 'Actualización disponible para tablet'
            : 'Actualización crítica disponible';
      }
      if (lead) {
        lead.textContent =
          errMsg || 'Preparando descarga de la actualización crítica…';
      }
      if (dismiss) {
        dismiss.disabled = true;
        dismiss.textContent = 'Iniciando descarga…';
      }
      if (retry) retry.style.display = 'none';
      var planBIdle = document.getElementById('crozzoUpdateCriticalPlanB');
      if (planBIdle) planBIdle.style.display = 'none';
      var laterIdle = document.getElementById('crozzoUpdateCriticalLater');
      if (laterIdle) laterIdle.style.display = 'none';
    } else if (state === 'installing') {
      if (badge) {
        badge.className = 'crozzo-update-critical-modal__badge';
        badge.innerHTML = '⏳ Instalando…';
      }
      if (title) title.textContent = 'Instalando actualización crítica';
      if (lead) {
        lead.textContent = _installUi.message
          ? _installUi.message
          : desktopRestartNotice();
      }
      if (dismiss) {
        dismiss.disabled = true;
        dismiss.textContent = 'Instalando…';
      }
      if (retry) retry.style.display = 'none';
      var planBHide = document.getElementById('crozzoUpdateCriticalPlanB');
      if (planBHide) planBHide.style.display = 'none';
      var laterInstalling = document.getElementById('crozzoUpdateCriticalLater');
      if (laterInstalling) laterInstalling.style.display = 'none';
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
      var laterSuccess = document.getElementById('crozzoUpdateCriticalLater');
      if (laterSuccess) laterSuccess.style.display = 'none';
    } else {
      if (badge) {
        badge.className = 'crozzo-update-critical-modal__badge';
        badge.style.background = 'rgba(220,38,38,0.15)';
        badge.style.color = '#fecaca';
        badge.innerHTML = '⚠ No instalada';
      }
      if (title) title.textContent = 'No se pudo instalar la actualización';
      if (lead) {
        var failProfile = getUpdateClientProfile();
        if (failProfile.isAndroid) {
          lead.textContent =
            (errMsg ? errMsg + ' ' : '') + androidInstallUninstallGuide(false);
        } else {
          lead.textContent =
            (errMsg || 'El instalador no se descargó.') +
            ' Pulse Reintentar (Plan A) o use Plan B para descargar el instalador manualmente.';
        }
      }
      if (dismiss) {
        dismiss.disabled = false;
        dismiss.textContent = 'Cerrar';
      }
      if (retry) retry.style.display = 'inline-flex';
      var planB = document.getElementById('crozzoUpdateCriticalPlanB');
      if (planB) planB.style.display = 'inline-flex';
      var laterFail = document.getElementById('crozzoUpdateCriticalLater');
      if (laterFail) laterFail.style.display = 'none';
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
    var ctx = getUpdateOperativeContext();
    applyNormalBannerRoleChrome(ctx);
    var profile = getUpdateClientProfile();
    var summary =
      UPDATE_NORMAL.summary && String(UPDATE_NORMAL.summary).trim()
        ? String(UPDATE_NORMAL.summary).trim()
        : 'Mejoras de rendimiento y estabilidad.';
    if (ctx.isStaffOnly) {
      msg.textContent =
        'Hay una mejora del sistema (' +
        VERSION_AVAIL +
        '). Avise al encargado para instalarla al cierre del turno.';
      return;
    }
    if (ctx.experiencia === 'novice') {
      if (ctx.isPeak) {
        msg.innerHTML =
          '<strong>Mejora lista</strong> (' +
          escapeHtml(VERSION_AVAIL) +
          ') — ' +
          escapeHtml(summary) +
          '. <strong>Instálela al cierre</strong>; ahora hay servicio activo y la app esperará a que no haya ventas abiertas.';
      } else {
        msg.innerHTML =
          'Mejora disponible: <strong>' +
          escapeHtml(VERSION_AVAIL) +
          '</strong> — ' +
          escapeHtml(summary) +
          '. ¿Desea descargarla? Se instalará al reiniciar la app.';
      }
      return;
    }
    var typeLabel = UPDATE_NORMAL.type || 'Actualización opcional';
    var actionHint = profile.canAutoInstall
      ? 'descargar en este equipo'
      : profile.isAndroid
        ? 'descargar APK'
        : 'recargar la interfaz';
    msg.innerHTML =
      'En uso: <strong>' +
      escapeHtml(VERSION) +
      '</strong> · ' +
      escapeHtml(typeLabel) +
      ': <strong>' +
      escapeHtml(VERSION_AVAIL) +
      '</strong> — pulse <strong>Descargar actualización</strong> para ' +
      escapeHtml(actionHint) +
      '. Se instalará al reiniciar la app.';
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
          ? 'Descargue la mejora cuando quiera. Se instalará al reiniciar BONA origen, sin interrumpir ventas en curso.'
          : 'La descarga prepara la actualización para el próximo reinicio. Hágalo al cierre del turno si puede.'),
    };
  }

  function buildDetailBodyHtml() {
    var u = UPDATE_NORMAL;
    var ctx = getUpdateOperativeContext();
    var changesHtml = buildHumanChangelogHtml(u.changes || [], { ctx: ctx });
    var impactHtml = ctx.experiencia === 'novice' || ctx.experiencia === 'mixed' ? buildNoviceImpactHtml(u.changes || []) : '';
    return (
      '<p class="crozzo-update-detail-modal__lead">' +
      escapeHtml(u.summary || 'Nueva versión disponible.') +
      '</p>' +
      impactHtml +
      '<h3>Novedades incluidas</h3>' +
      changesHtml +
      '<p class="crozzo-update-detail-modal__note">' +
      escapeHtml(u.notes) +
      '</p>'
    );
  }

  function buildOptionalWizardSteps(entry) {
    var u = buildUpdateNormalFromEntry(entry, VERSION);
    var changes = (u.changes || []).slice();
    if (!changes.length && u.summary) changes.push(u.summary);
    var steps = [
      {
        kind: 'intro',
        title: 'Mejora disponible ' + u.version,
        summary: u.summary || 'Nueva versión con mejoras.',
        from: u.current,
        to: u.version,
        date: u.date || '',
      },
    ];
    var chunk = 3;
    var pages = Math.max(1, Math.ceil(changes.length / chunk));
    for (var i = 0; i < changes.length; i += chunk) {
      steps.push({
        kind: 'changes',
        title: 'Qué incluye esta mejora',
        items: changes.slice(i, i + chunk),
        page: Math.floor(i / chunk) + 1,
        pages: pages,
      });
    }
    if (changes.length === 0) {
      steps.push({
        kind: 'changes',
        title: 'Qué incluye esta mejora',
        items: ['Mejoras de rendimiento y estabilidad.'],
        page: 1,
        pages: 1,
      });
    }
    steps.push({
      kind: 'decide',
      title: '¿Desea descargar esta mejora?',
      summary:
        'Si descarga ahora, la actualización se instalará automáticamente al reiniciar BONA origen. También puede recordarla para después.',
    });
    return steps;
  }

  function openOptionalWizard(entry, opts) {
    opts = opts || {};
    if (!entry) return;
    _optionalWizard.entry = entry;
    _optionalWizard.steps = buildOptionalWizardSteps(entry);
    _optionalWizard.step = typeof opts.step === 'number' ? opts.step : 0;
    var remote = normEntryVersion(entry);
    _currentOptionalId = entryId(entry);
    VERSION_AVAIL = remote;
    global.CROZZO_APP_VERSION_DISPONIBLE = remote;
    UPDATE_NORMAL = buildUpdateNormalFromEntry(entry, VERSION);
    setCriticalOpen(false);
    setNormalOpen(false);
    enrichEntryChangelog(entry).then(function (enriched) {
      if (!enriched || entryId(enriched) !== _currentOptionalId) return;
      UPDATE_NORMAL = buildUpdateNormalFromEntry(enriched, VERSION);
      _optionalWizard.steps = buildOptionalWizardSteps(enriched);
      var detailOv = document.getElementById('crozzo-update-detail-overlay');
      if (detailOv && detailOv.classList.contains('is-open')) {
        renderOptionalWizard();
      }
    });
    renderOptionalWizard();
    setDetailOpen(true);
  }

  function renderOptionalWizard() {
    var steps = _optionalWizard.steps || [];
    var stepIdx = Math.max(0, Math.min(_optionalWizard.step || 0, steps.length - 1));
    _optionalWizard.step = stepIdx;
    var step = steps[stepIdx];
    if (!step) return;

    var title = document.getElementById('crozzoUpdateDetailTitle');
    var meta = document.getElementById('crozzoUpdateDetailMeta');
    var body = document.getElementById('crozzoUpdateDetailBody');
    var bar = document.getElementById('crozzoUpdateDetailStepbar');
    var back = document.getElementById('crozzoUpdateDetailBack');
    var next = document.getElementById('crozzoUpdateDetailNext');
    var reject = document.getElementById('crozzoUpdateDetailReject');
    var accept = document.getElementById('crozzoUpdateDetailAccept');

    if (title) title.textContent = step.title || 'Actualización opcional';
    if (meta) {
      meta.innerHTML =
        '<span class="crozzo-update-detail-modal__chip">Paso ' +
        (stepIdx + 1) +
        ' de ' +
        steps.length +
        '</span>' +
        '<span class="crozzo-update-detail-modal__chip">Actual: ' +
        escapeHtml(VERSION) +
        '</span>' +
        '<span class="crozzo-update-detail-modal__chip crozzo-update-detail-modal__chip--avail">Nueva: ' +
        escapeHtml(VERSION_AVAIL) +
        '</span>';
    }
    if (bar) {
      bar.hidden = false;
      bar.innerHTML = steps
        .map(function (_, i) {
          var cls = 'crozzo-update-wizard-dot';
          if (i < stepIdx) cls += ' is-done';
          if (i === stepIdx) cls += ' is-active';
          return '<span class="' + cls + '" aria-hidden="true"></span>';
        })
        .join('');
    }

    if (body) {
      if (step.kind === 'intro') {
        body.innerHTML =
          '<p class="crozzo-update-detail-modal__lead">' +
          escapeHtml(step.summary) +
          '</p>' +
          '<div class="crozzo-update-wizard-versions">' +
          '<span>' +
          escapeHtml(step.from) +
          '</span><span aria-hidden="true">→</span><strong>' +
          escapeHtml(step.to) +
          '</strong></div>' +
          (step.date
            ? '<p class="form-hint">Publicada: ' + escapeHtml(step.date) + '</p>'
            : '') +
          '<p class="crozzo-update-detail-modal__note">Esta mejora es <strong>opcional</strong>. Revise los cambios paso a paso y decida si instalar.</p>';
      } else if (step.kind === 'changes') {
        body.innerHTML =
          (step.pages > 1
            ? '<p class="form-hint">Parte ' + step.page + ' de ' + step.pages + '</p>'
            : '') +
          '<ul class="crozzo-update-wizard-list">' +
          (step.items || [])
            .map(function (item) {
              return '<li>' + escapeHtml(item) + '</li>';
            })
            .join('') +
          '</ul>';
      } else {
        body.innerHTML =
          '<p class="crozzo-update-detail-modal__lead">' +
          escapeHtml(step.summary) +
          '</p>' +
          '<p class="crozzo-update-detail-modal__note">Si elige <strong>Descargar actualización</strong>, verá la barra de progreso. Se instalará al reiniciar la app (también si luego hay una crítica).</p>';
      }
    }

    var isFirst = stepIdx <= 0;
    var isLast = stepIdx >= steps.length - 1;
    var isDecide = step.kind === 'decide';
    if (back) back.style.display = isFirst ? 'none' : 'inline-flex';
    if (next) next.style.display = isDecide ? 'none' : 'inline-flex';
    if (accept) {
      accept.style.display = isDecide ? 'inline-flex' : 'none';
      accept.textContent = 'Descargar actualización';
      accept.disabled = false;
    }
    if (reject) {
      reject.style.display = 'inline-flex';
      reject.textContent = isDecide ? 'Ahora no' : 'Recordar después';
    }
  }

  function optionalWizardNext() {
    if (!_optionalWizard.steps.length) return;
    if (_optionalWizard.step >= _optionalWizard.steps.length - 1) return;
    _optionalWizard.step += 1;
    renderOptionalWizard();
  }

  function optionalWizardBack() {
    if (!_optionalWizard.steps.length) return;
    if (_optionalWizard.step <= 0) return;
    _optionalWizard.step -= 1;
    renderOptionalWizard();
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

  function isAppShellHref(href) {
    href = String(href || '');
    if (!href) return false;
    if (/^https?:\/\//i.test(href)) {
      return /localhost|127\.0\.0\.1|tauri\.|asset\.|crozzo/i.test(href);
    }
    return /^(file:|tauri:|asset:|capacitor:|ionic:|content:)/i.test(href);
  }

  function applyWebClientUpdate(targetVersion, onProgress) {
    if (onProgress) {
      onProgress({
        phase: 'relaunch',
        percent: 95,
        message: 'Recargando interfaz (tablet / navegador)…',
      });
    }
    appendLocalLog('web_reload', {
      version: targetVersion || VERSION_AVAIL,
      type: 'web',
      message: 'Recarga forzada tras aviso OTA',
    });
    return delay(800).then(function () {
      try {
        var href = global.location.href.split('#')[0];
        if (!isAppShellHref(href)) {
          console.warn('[crozzo-updates] recarga bloqueada: origen externo', href);
          return { installed: false, plan: 'web_reload_blocked', version: targetVersion };
        }
        var sep = href.indexOf('?') >= 0 ? '&' : '?';
        global.location.replace(href + sep + '_crozzo=' + Date.now());
      } catch (_) {
        global.location.reload();
      }
      return { installed: true, plan: 'web_reload', version: targetVersion, exiting: true };
    });
  }

  function applyAndroidClientUpdate(targetVersion, onProgress, opts) {
    opts = opts || {};
    var TU = global.CrozzoTauriUpdater;
    var profile = getUpdateClientProfile();
    if (profile.kind === 'android-web') {
      return applyWebClientUpdate(targetVersion, onProgress);
    }
    if (TU && typeof TU.installApkAutomatic === 'function' && TU.canUseAndroidInAppUpdater()) {
      return TU.installApkAutomatic({
        targetVersion: targetVersion,
        onProgress: onProgress,
        forceInstall: !!opts.forceInstall,
      }).then(function (res) {
        if (res && res.plan === 'android_apk') {
          appendLocalLog('apk_install_intent', {
            version: targetVersion || VERSION_AVAIL,
            type: 'android',
            message: res.localPath || res.downloadUrl || '',
          });
          try {
            var pendingVer = normEntryVersion({ version: targetVersion || VERSION_AVAIL });
            if (pendingVer) sessionStorage.setItem(SS_ANDROID_PENDING, pendingVer);
          } catch (_) {}
        }
        return res;
      });
    }
    if (onProgress) {
      onProgress({
        phase: 'probe',
        percent: 18,
        message: 'Buscando APK v' + String(targetVersion || '').replace(/^v/i, '') + ' en GitHub…',
      });
    }
    var resolveFn =
      TU && (TU.resolveBestApkUrl || TU.resolveBestDownloadUrl || TU.resolveManualFallback);
    if (!resolveFn) {
      if (profile.kind === 'android-web') return applyWebClientUpdate(targetVersion, onProgress);
      return Promise.reject(new Error('No se pudo resolver enlace del APK.'));
    }
    return resolveFn(targetVersion).then(function (info) {
      var apkUrl = info && info.downloadUrl && /\.apk(\?|$)/i.test(info.downloadUrl) ? info.downloadUrl : '';
      if (apkUrl && TU && TU.openExternalUrl) {
        if (onProgress) {
          onProgress({
            phase: 'download',
            percent: 72,
            message: info.verified
              ? 'Abriendo descarga verificada del APK…'
              : 'Abriendo descarga del APK…',
          });
        }
        return TU.openExternalUrl(apkUrl).then(function (ok) {
          if (!ok) {
            return Promise.reject(
              new Error(
                'No se pudo abrir el navegador para descargar el APK. Use Actualizaciones → enlace manual o copie la URL del release.'
              )
            );
          }
          appendLocalLog('apk_download', {
            version: targetVersion || VERSION_AVAIL,
            type: 'android',
            message: apkUrl,
          });
          if (opts.markInstalled === true) {
            saveInstalledVersion(targetVersion || VERSION_AVAIL);
          }
          if (onProgress) {
            onProgress({
              phase: 'install',
              percent: 88,
              message: 'Instale el APK. Si Android rechaza: desinstale «BONA origen» primero (Ajustes → Apps).',
            });
          }
          return {
            installed: false,
            plan: 'apk_download',
            version: targetVersion,
            downloadUrl: apkUrl,
            needsManualInstall: true,
          };
        });
      }
      if (profile.kind === 'android-web' && opts.allowWebFallback !== false) {
        return applyWebClientUpdate(targetVersion, onProgress);
      }
      return Promise.reject(
        new Error('El APK aún no está en GitHub. Espere a que termine la compilación Android o use Plan B.')
      );
    });
  }

  function handleAndroidOtaResult(res, ctx) {
    ctx = ctx || {};
    var entry = ctx.entry || null;
    var remote = normEntryVersion({ version: ctx.remote || '' });
    var onProgress = ctx.onProgress || handleInstallProgress;
    var uiMode = ctx.uiMode || 'critical';

    function failMsg(base) {
      return (
        base +
        ' Versión del equipo: ' +
        VERSION +
        (remote ? '. Requerida: ' + remote + '.' : '.') +
        ' Confirme «Actualizar» en Android o use el enlace manual en Actualizaciones.'
      );
    }

    function applyCriticalSuccess(status, msg) {
      _criticalInstallState = 'success';
      _criticalFailCount = 0;
      _criticalAutoAttempts = 0;
      cancelCriticalAutoRetry();
      if (entry && remote && compareSemver(VERSION, remote) >= 0) {
        markCriticalInstalled(entry, remote);
      }
      setCriticalOpen(true);
      populateCriticalInfo('success', msg);
      if (status) setCheckStatus(status);
    }

    function applyCriticalAwaiting(status, msg) {
      _criticalInstallState = 'idle';
      _criticalAutoAttempts = 0;
      setCriticalOpen(true);
      populateCriticalInfo('success', msg);
      if (status) setCheckStatus(status);
    }

    function applyCriticalFail(msg, status) {
      _criticalInstallState = 'failed';
      setCriticalOpen(true);
      populateCriticalInfo('failed', msg);
      if (status) setCheckStatus(status);
      if (remote) offerPlanBAfterFailure(remote, null);
    }

    function applyOptionalAwaiting(msg) {
      _installUi.state = 'success';
      _installUi.percent = 100;
      _installUi.phase = 'install';
      _installUi.message = msg;
      renderInstallOverlayUi();
    }

    function applyOptionalFail(msg) {
      _installUi.state = 'error';
      handleInstallProgress({ phase: 'error', percent: 0, message: msg });
      if (remote) offerPlanBAfterFailure(remote, null);
      setNormalOpen(true);
    }

    if (res && res.plan === 'android_apk') {
      var awaitingMsg =
        (res.installHint ? res.installHint + ' ' : androidInstallUninstallGuide(true) + ' ') +
        'Instalador abierto: confirme en Android. Si falla, desinstale «BONA origen» e instale el APK de GitHub.';
      if (uiMode === 'optional') {
        applyOptionalAwaiting(awaitingMsg);
        return Promise.resolve({ handled: true, res: res });
      }
      applyCriticalAwaiting('Esperando confirmación de Android…', awaitingMsg);
      return Promise.resolve({ handled: true, res: res });
    }

    if (res && res.plan === 'apk_download' && !res.exiting) {
      var dlMsg =
        (res.installHint ? res.installHint + ' ' : '') +
        'Descarga del APK iniciada. Al instalar: si falla, desinstale «BONA origen» en Ajustes → Apps e instale el APK de nuevo.';
      if (uiMode === 'optional') {
        applyOptionalAwaiting(dlMsg);
        if (typeof global.showToast === 'function') global.showToast('Descarga del APK iniciada.', 'info');
        return Promise.resolve({ handled: true, res: res });
      }
      _criticalInstallState = 'idle';
      setCriticalOpen(true);
      populateCriticalInfo('idle', dlMsg);
      setCheckStatus('Instale el APK descargado para completar la actualización.');
      return Promise.resolve({ handled: true, res: res });
    }

    if (res && res.upToDate) {
      return refreshBinaryVersion().then(function () {
        if (remote && compareSemver(VERSION, remote) >= 0) {
          if (uiMode === 'optional') {
            _installUi.state = 'success';
            _installUi.percent = 100;
            renderInstallOverlayUi();
            if (entry) markOptionalInstalled(entry, remote);
            return { handled: true, res: res, upToDate: true };
          }
          applyCriticalSuccess('Este equipo ya está en ' + VERSION + '.');
          return { handled: true, res: res, upToDate: true };
        }
        if (ctx.allowForceRetry !== false && getUpdateClientProfile().kind === 'android' && remote) {
          return applyAndroidClientUpdate(remote, onProgress, { forceInstall: true }).then(function (res2) {
            return handleAndroidOtaResult(res2, Object.assign({}, ctx, { allowForceRetry: false }));
          });
        }
        var upFail = failMsg('El APK no se actualizó.');
        if (uiMode === 'optional') {
          applyOptionalFail(upFail);
          return { handled: true, res: res, failed: true };
        }
        applyCriticalFail(upFail, 'Actualización pendiente: binario ' + VERSION + ', requerido ' + remote + '.');
        return { handled: true, res: res, failed: true };
      });
    }

    if (res && res.installed) {
      return refreshBinaryVersion().then(function () {
        if (remote && compareSemver(VERSION, remote) >= 0) {
          if (uiMode === 'optional') {
            _installUi.state = 'success';
            _installUi.percent = 100;
            renderInstallOverlayUi();
            if (entry) markOptionalInstalled(entry, remote);
            return { handled: true, res: res };
          }
          applyCriticalSuccess('Actualización ' + remote + ' instalada.');
          return { handled: true, res: res };
        }
        var inFail = failMsg('La instalación no cambió la versión del APK.');
        if (uiMode === 'optional') {
          applyOptionalFail(inFail);
          return { handled: true, res: res, failed: true };
        }
        applyCriticalFail(inFail, 'Reintente o instale el APK manualmente.');
        return { handled: true, res: res, failed: true };
      });
    }

    return Promise.resolve({ handled: false, res: res });
  }

  function applyClientUpdate(targetVersion, onProgress, opts) {
    opts = Object.assign({ automaticOnly: true }, opts || {});
    var profile = getUpdateClientProfile();
    if (profile.isAndroid) {
      return applyAndroidClientUpdate(targetVersion, onProgress, opts);
    }
    if (profile.canAutoInstall) {
      return applyBinaryUpdate(targetVersion, onProgress, opts);
    }
    return applyWebClientUpdate(targetVersion, onProgress);
  }

  function applyBinaryUpdate(targetVersion, onProgress, opts) {
    opts = opts || {};
    var profile = getUpdateClientProfile();
    if (!global.CrozzoTauriUpdater || !global.CrozzoTauriUpdater.canUseTauriUpdater()) {
      if (profile.canAutoInstall) {
        return Promise.reject(new Error('Instalador automático no disponible en este equipo.'));
      }
      return applyWebClientUpdate(targetVersion, onProgress);
    }
    var windowsExe = profile.assetKind === 'exe';
    var TU = global.CrozzoTauriUpdater;
    var installFn = TU && typeof TU.installAutomatic === 'function' ? TU.installAutomatic : TU.installLatest;
    return installFn({
      targetVersion: targetVersion,
      silent: !!opts.silent,
      automaticOnly: opts.automaticOnly !== false,
      allowSilentSetup: opts.allowSilentSetup !== false && windowsExe,
      preferSilentSetup: opts.preferSilentSetup !== false && windowsExe,
      skipReleaseWait: opts.skipReleaseWait !== false,
      maxWaitMs: opts.maxWaitMs,
      onProgress: function (p) {
        handleInstallProgress(p);
        if (onProgress) onProgress(p);
      },
    });
  }

  function markCriticalInstalled(entry, targetVersion) {
    if (!entry) return;
    commitEntryInstall(entry, targetVersion);
  }

  function posIsOperationBusy() {
    try {
      if (typeof global.crozzoPosIsOperationBusyForUpdates === 'function') {
        return !!global.crozzoPosIsOperationBusyForUpdates();
      }
      if (typeof global.crozzoPosIsOperationBusy === 'function') {
        return !!global.crozzoPosIsOperationBusy();
      }
    } catch (_) {}
    try {
      if (typeof global.crozzoModalIsOpen === 'function') return !!global.crozzoModalIsOpen();
    } catch (_) {}
    return false;
  }

  function notifyBootUpdatesReady(detail) {
    if (_bootUpdatesReady) return;
    _bootUpdatesReady = true;
    global.__crozzoBootUpdatesReady = true;
    _bootUpdatePhase = false;
    global.__crozzoBootUpdatePhase = false;
    _deferOptionalBannerSession = false;
    try {
      document.documentElement.classList.remove('crozzo-boot-updates-active');
      document.body.classList.remove('crozzo-boot-updates-active');
    } catch (_) {}
    hideBootUpdateGate();
    var waiters = _bootReadyWaiters.slice();
    _bootReadyWaiters = [];
    waiters.forEach(function (fn) {
      try {
        fn();
      } catch (e) {
        console.warn('[crozzo-updates] boot waiter', e);
      }
    });
    try {
      global.dispatchEvent(
        new CustomEvent('crozzo:boot-updates-ready', { detail: detail || { ok: true } })
      );
    } catch (_) {}
    setTimeout(function () {
      if (_installInProgress || _criticalInstallState === 'installing') return;
      if (_deferredAndroidCritical) {
        var deferredEntry = _deferredAndroidCritical;
        _deferredAndroidCritical = null;
        var pendingRestart = loadPendingRestartInstall();
        if (
          pendingRestart &&
          pendingRestart.ready &&
          pendingRestart.entryId === entryId(deferredEntry) &&
          compareSemver(VERSION, pendingRestart.version) < 0
        ) {
          _pendingCriticalEntry = deferredEntry;
          _currentCriticalId = entryId(deferredEntry);
          _criticalInstallState = 'pending_restart';
          if (shouldShowCriticalOverlay(deferredEntry)) {
            setCriticalOpen(true);
            populateCriticalInfo('pending_restart');
          }
          setCheckStatus(
            'Actualización crítica ' + normEntryVersion(deferredEntry) + ' lista — se aplicará al reiniciar.'
          );
          return;
        }
        if (shouldInstallCriticalImmediately()) {
          beginCriticalEntryInstall(deferredEntry, { returnPromise: true });
          return;
        }
        startCriticalDownloadForRestart(deferredEntry, {
          silent: crozzoUpdateUserBusy() || posIsOperationBusy(),
        });
        return;
      }
      var opt = pickNextPendingEntry(
        _registryEntries.filter(function (e) {
          return entryIsPending(e) && !isCriticalEntry(e);
        })
      );
      if (opt && !posIsOperationBusy()) {
        openOptionalWizard(opt);
      } else if (opt) {
        setNormalOpen(true);
        setNormalBannerMessage();
      }
    }, 500);
  }

  function crozzoWhenBootUpdatesReady(cb) {
    if (typeof cb !== 'function') return;
    if (_bootUpdatesReady) {
      cb();
      return;
    }
    _bootReadyWaiters.push(cb);
  }

  function ensureBootUpdateGate() {
    var el = document.getElementById('crozzo-boot-update-gate');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'crozzo-boot-update-gate';
    el.className = 'crozzo-boot-update-gate';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-busy', 'true');
    el.innerHTML =
      '<div class="crozzo-boot-update-gate__card">' +
      '<div class="crozzo-boot-update-gate__spinner" aria-hidden="true"></div>' +
      '<p class="crozzo-boot-update-gate__brand" id="crozzoBootUpdateBrand">Crozzo POS</p>' +
      '<h2 class="crozzo-boot-update-gate__title">Preparando el sistema</h2>' +
      '<p class="crozzo-boot-update-gate__msg" id="crozzoBootUpdateMsg">Comprobando actualizaciones…</p>' +
      '<p class="crozzo-boot-update-gate__hint" id="crozzoBootUpdateHint">No cierre la aplicación. Se descargará el paquete correcto para este dispositivo (Windows, Mac, tablet o navegador) antes del inicio de sesión.</p>' +
      '<button type="button" class="btn btn-outline crozzo-boot-update-gate__skip" id="crozzoBootUpdateSkip" hidden>Continuar al login</button>' +
      '</div>';
    document.body.appendChild(el);
    var skipBtn = document.getElementById('crozzoBootUpdateSkip');
    if (skipBtn && !skipBtn._crozzoBound) {
      skipBtn._crozzoBound = true;
      skipBtn.addEventListener('click', function () {
        if (_installInProgress || _criticalInstallState === 'installing') return;
        setBootGateMessage('Continuando al inicio de sesión…');
        notifyBootUpdatesReady({ ok: false, reason: 'user_skip' });
      });
    }
    return el;
  }

  function showBootUpdateGateSlowOptions() {
    var skip = document.getElementById('crozzoBootUpdateSkip');
    if (!skip) return;
    var profile = getUpdateClientProfile();
    if (profile.isWeb || profile.kind === 'ios-web' || profile.kind === 'android-web') {
      skip.hidden = false;
    }
  }

  function setBootGateMessage(msg) {
    var el = document.getElementById('crozzoBootUpdateMsg');
    if (el) el.textContent = msg || '';
    setCheckStatus(msg || '');
  }

  function showBootUpdateGate() {
    ensureBootUpdateGate();
    try {
      document.documentElement.classList.add('crozzo-boot-updates-active');
      document.body.classList.add('crozzo-boot-updates-active');
    } catch (_) {}
    var gate = document.getElementById('crozzo-boot-update-gate');
    if (gate) gate.classList.add('is-open');
    var brand = document.getElementById('crozzoBootUpdateBrand');
    if (brand && typeof global.crozzoAppDisplayName === 'function') {
      brand.textContent = global.crozzoAppDisplayName();
    }
    var hint = document.getElementById('crozzoBootUpdateHint');
    if (hint) {
      hint.textContent =
        'Este equipo recibirá ' +
        getPlatformUpdateDescriptor() +
        '. No cierre la aplicación hasta que termine.';
    }
  }

  function hideBootUpdateGate() {
    var gate = document.getElementById('crozzo-boot-update-gate');
    if (gate) {
      gate.classList.remove('is-open');
      gate.setAttribute('aria-busy', 'false');
    }
    try {
      document.documentElement.classList.remove('crozzo-boot-updates-active');
      document.body.classList.remove('crozzo-boot-updates-active');
    } catch (_) {}
  }

  function prefetchOptionalAtBoot(entries) {
    var pending = (entries || []).filter(function (e) {
      return e && entryIsPending(e) && !isCriticalEntry(e);
    });
    if (!pending.length) return Promise.resolve();
    var entry = pickNextPendingEntry(pending);
    if (!entry) return Promise.resolve();
    var remote = normEntryVersion(entry);
    _deferOptionalBannerSession = true;
    var profile = getUpdateClientProfile();
    var TU = global.CrozzoTauriUpdater;
    setBootGateMessage(
      'Preparando ' + (profile.artifactLabel || 'actualización') + ' ' + remote + '…'
    );
    if (profile.isAndroid && TU && typeof TU.resolveBestApkUrl === 'function') {
      return TU.resolveBestApkUrl(remote).catch(function () {
        return null;
      });
    }
    if (profile.isMac && TU && typeof TU.resolveBestDownloadUrl === 'function') {
      return TU.resolveBestDownloadUrl(remote).catch(function () {
        return null;
      });
    }
    if (profile.isWindows && TU && typeof TU.resolveReleaseInstallTarget === 'function') {
      return TU.resolveReleaseInstallTarget(remote).catch(function () {
        return null;
      });
    }
    if (profile.canAutoInstall && TU && typeof TU.check === 'function') {
      return TU.check({}).catch(function () {
        return null;
      });
    }
    if (profile.isWeb || profile.kind === 'android-web' || profile.kind === 'ios-web') {
      var base = String(global.location && global.location.pathname ? global.location.pathname : '');
      return fetch((base || '.') + '?_boot=' + Date.now(), { cache: 'no-store', credentials: 'same-origin' }).catch(
        function () {
          return null;
        }
      );
    }
    return Promise.resolve();
  }

  function isAndroidSoftCriticalClient(profile) {
    profile = profile || getUpdateClientProfile();
    return profile.kind === 'android' || profile.kind === 'android-web';
  }

  /** Android: descarga + reinicio. Escritorio: instalar al momento si la caja está libre. */
  function shouldDeferCriticalAutoOnBoot(profile) {
    profile = profile || getUpdateClientProfile();
    return !!(profile.isAndroid || profile.kind === 'android-web');
  }

  function shouldInstallCriticalImmediately(profile) {
    profile = profile || getUpdateClientProfile();
    if (!profile.canAutoInstall || !profile.isDesktopBinary) return false;
    if (shouldDeferCriticalAutoOnBoot(profile)) return false;
    if (crozzoUpdateUserBusy() || posIsOperationBusy()) return false;
    return true;
  }

  /** Tras login: instalar críticas pendientes (paridad tauri dev — no bloquear arranque). */
  function scheduleDeferredCriticalAfterLogin() {
    if (global.__crozzoPostLoginCriticalWired) return;
    global.__crozzoPostLoginCriticalWired = true;

    function tryInstallPendingCritical() {
      if (!_bootUpdatesReady || _installInProgress || _criticalInstallState === 'installing') return;
      refreshBinaryVersion().then(function () {
        reconcileAppliedEntriesForVersion(VERSION);
        var pending = (_registryEntries || []).filter(entryIsPending).filter(isCriticalEntry);
        if (!pending.length) return;
        var entry = pickNextPendingEntry(pending);
        if (!entry) return;
        var remote = normEntryVersion(entry);
        if (compareSemver(VERSION, remote) >= 0) {
          markEntryFullyApplied(entry, VERSION);
          return;
        }
        if (typeof global.getCurrentUser === 'function' && !global.getCurrentUser()) return;
        var profile = getUpdateClientProfile();
        if (shouldDeferCriticalAutoOnBoot(profile)) {
          beginCriticalEntryInstall(entry, { returnPromise: true, forceAuto: false, deferOverlay: true });
          return;
        }
        if (shouldInstallCriticalImmediately(profile)) {
          beginCriticalEntryInstall(entry, { returnPromise: true, forceAuto: false });
          return;
        }
        beginCriticalEntryInstall(entry, {
          returnPromise: true,
          forceAuto: false,
          deferOverlay: false,
        });
      });
    }

    global.addEventListener('crozzo:auth-ready', function () {
      setTimeout(tryInstallPendingCritical, 2500);
    });
    global.addEventListener('crozzo-ready', function (ev) {
      if (ev && ev.detail && ev.detail.session) {
        setTimeout(tryInstallPendingCritical, 2500);
      }
    });
  }

  function runBootCriticalInstallLoop() {
    pruneStaleStateFlags();
    var pending = _registryEntries.filter(entryIsPending);
    var entry = pickNextPendingEntry(pending);
    if (!entry || !isCriticalEntry(entry)) return Promise.resolve({ done: true });
    var profile = getUpdateClientProfile();
    if (shouldDeferCriticalAutoOnBoot(profile)) {
      beginCriticalEntryInstall(entry, { returnPromise: true, forceAuto: false, deferOverlay: true });
      return Promise.resolve({ done: true, deferredAndroid: true });
    }
    return beginCriticalEntryInstall(entry, { returnPromise: true }).then(function (res) {
      if (res && res.exiting) return res;
      return refreshBinaryVersion().then(function () {
        return runBootCriticalInstallLoop();
      });
    });
  }

  function runBootUpdatePipeline() {
    if (_bootUpdatesReady) return Promise.resolve({ ok: true, skipped: true });
    scheduleDeferredCriticalAfterLogin();
    _bootUpdatePhase = true;
    global.__crozzoBootUpdatePhase = true;

    return refreshBinaryVersion()
      .then(function (installedVer) {
        return fetchRegistryData().then(function (data) {
          return { data: data, installedVer: installedVer };
        });
      })
      .then(function (payload) {
        var data = payload && payload.data;
        var installedVer = (payload && payload.installedVer) || VERSION;
        _registryEntries = sortEntriesForProcess(normalizeRegistryEntries(data));
        global.CROZZO_UPDATE_REGISTRY = _registryEntries.slice();
        reconcileAppliedEntriesForVersion(installedVer);
        applyAvailabilityFromRegistry(_registryEntries);
        pruneStaleStateFlags();
        return applyPendingRestartInstallOnBoot(_registryEntries).then(function (installedPending) {
          if (installedPending) return { ok: true, installedPending: true };
          var pending = _registryEntries.filter(entryIsPending);
          var optionalOnly = pending.filter(function (e) {
            return !isCriticalEntry(e);
          });
          return prefetchOptionalAtBoot(optionalOnly);
        });
      })
      .catch(function (err) {
        console.warn('[crozzo-updates] background registry check', err);
        return { ok: false, error: err };
      })
      .finally(function () {
        _bootUpdatePhase = false;
        global.__crozzoBootUpdatePhase = false;
        if (!_bootUpdatesReady) {
          notifyBootUpdatesReady({ ok: true, reason: 'non_blocking' });
        }
      });
  }

  function cancelCriticalIdleWait() {
    if (_criticalIdleTimer) {
      clearTimeout(_criticalIdleTimer);
      _criticalIdleTimer = null;
    }
    _criticalWaitingForIdle = false;
    _criticalIdleToastShown = false;
  }

  function cancelOptionalIdleWait() {
    if (_optionalIdleTimer) {
      clearTimeout(_optionalIdleTimer);
      _optionalIdleTimer = null;
    }
  }

  function notifyCriticalWaitingForIdle(entry) {
    var remote = normEntryVersion(entry);
    var msg =
      'Actualización crítica ' +
      remote +
      ' en espera: termine o cierre la venta en curso para reiniciar.';
    setCheckStatus(msg);
    if (!_criticalIdleToastShown && typeof global.showToast === 'function') {
      _criticalIdleToastShown = true;
      try {
        global.showToast(msg, 'info');
      } catch (_) {}
    }
    _criticalWaitingForIdle = true;
  }

  function scheduleCriticalInstallWhenIdle(entry) {
    if (!entry) return;
    var profile = getUpdateClientProfile();
    if (shouldDeferCriticalAutoOnBoot(profile)) {
      beginCriticalEntryInstall(entry, { returnPromise: true, forceAuto: false, deferOverlay: true });
      return;
    }
    if (_bootUpdatePhase || entry.installMode === 'auto' || isCriticalEntry(entry)) {
      if (!posIsOperationBusy()) {
        runCriticalInstall(entry);
      } else {
        _pendingCriticalEntry = entry;
        _currentCriticalId = entryId(entry);
        notifyCriticalWaitingForIdle(entry);
        wirePosIdleListener();
      }
      return;
    }
    cancelCriticalIdleWait();
    _pendingCriticalEntry = entry;
    _currentCriticalId = entryId(entry);

    function attempt() {
      _criticalIdleTimer = null;
      if (!_pendingCriticalEntry || entryId(_pendingCriticalEntry) !== entryId(entry)) return;
      if (_installInProgress || _criticalInstallState === 'installing') return;

      if (!posIsOperationBusy()) {
        cancelCriticalIdleWait();
        runCriticalInstall(entry);
        return;
      }

      notifyCriticalWaitingForIdle(entry);
      _criticalIdleTimer = setTimeout(attempt, POS_IDLE_POLL_MS);
    }

    attempt();
  }

  function waitForPosIdleBeforeInstall(startInstall) {
    cancelOptionalIdleWait();
    var idleToastShown = false;
    return new Promise(function (resolve, reject) {
      function attempt() {
        if (!posIsOperationBusy()) {
          cancelOptionalIdleWait();
          try {
            resolve(startInstall());
          } catch (err) {
            reject(err);
          }
          return;
        }
        if (_installUi.open) {
          _installUi.message = 'Esperando cierre de venta en curso…';
          renderInstallOverlayUi();
        } else if (!idleToastShown && typeof global.showToast === 'function') {
          idleToastShown = true;
          try {
            global.showToast('Esperando cierre de venta para instalar…', 'info');
          } catch (_) {}
        }
        _optionalIdleTimer = setTimeout(attempt, POS_IDLE_POLL_MS);
      }
      attempt();
    });
  }

  function wirePosIdleListener() {
    if (global.__crozzoUpdatePosIdleWired) return;
    global.__crozzoUpdatePosIdleWired = true;
    global.addEventListener('crozzo:pos-operation-state', function (ev) {
      if (ev && ev.detail && ev.detail.busy) return;
      if (_pendingCriticalEntry && !_installInProgress && _criticalInstallState !== 'installing') {
        scheduleCriticalInstallWhenIdle(_pendingCriticalEntry);
      }
    });
  }

  function runCriticalInstall(entry) {
    if (!otaAutoInstallAllowed()) {
      beginCriticalEntryInstall(entry, { returnPromise: true, forceAuto: false, deferOverlay: true });
      return Promise.resolve({ deferred: true, reason: 'ota_manual_only' });
    }
    if (_installInProgress) return Promise.resolve();
    clearUpdateAbort();
    cancelCriticalIdleWait();
    _criticalAutoAttempts = _criticalAutoAttempts || 0;
    var remote = entry.version || 'v' + (entry.semver || '');
    var changes = Array.isArray(entry.changelog) ? entry.changelog.slice() : entry.message ? [entry.message] : [];
    _installInProgress = true;
    _criticalInstallState = 'installing';
    setNormalOpen(false);
    closeInstallOverlay();
    _installUi.open = false;
    _installUi.mode = 'critical';
    _installUi.from = VERSION;
    _installUi.to = remote;
    _installUi.changelog = changes;
    _installUi.state = 'installing';
    _installUi.phase = 'probe';
    _installUi.percent = 0;
    _installUi.message = 'Preparando instalación crítica…';
    hideBootUpdateGate();
    setCriticalOpen(true);
    populateCriticalInfo('installing');
    setCheckStatus('Actualizando ' + remote + '…');

    var profile = getUpdateClientProfile();
    setBootGateMessage(
      'Instalando ' +
        normEntryVersion({ version: remote }) +
        ' para ' +
        (profile.artifactLabel || getPlatformUpdateDescriptor()) +
        '…'
    );
    return applyClientUpdate(remote, null, {
      silent: true,
      automaticOnly: true,
      allowSilentSetup: profile.isWindows || profile.isMac,
      preferSilentSetup: profile.isWindows,
      skipReleaseWait: true,
      maxWaitMs: 90000,
    })
      .then(function (res) {
        if (res && res.exiting && (res.plan === 'C' || res.plan === 'D' || res.plan === 'web_reload')) {
          _criticalInstallState = 'success';
          markCriticalInstalled(entry, remote);
          if (res.plan === 'web_reload') {
            setCheckStatus('Recargando interfaz con ' + remote + '…');
          } else {
            setCheckStatus('Instalando ' + remote + '… la aplicación se reiniciará sola.');
          }
          return res;
        }
        if (res && res.plan === 'apk_download' && !res.exiting) {
          _criticalAutoAttempts = 0;
          _criticalInstallState = 'idle';
          setCriticalOpen(true);
          populateCriticalInfo(
            'idle',
            'Descarga del APK iniciada. ' + androidInstallUninstallGuide(true)
          );
          setCheckStatus('Instale el APK descargado para completar la actualización.');
          return res;
        }
        if (res && res.plan === 'android_apk') {
          return handleAndroidOtaResult(res, {
            entry: entry,
            remote: remote,
            uiMode: 'critical',
            allowForceRetry: false,
          }).then(function () {
            return res;
          });
        }
        return handleAndroidOtaResult(res, {
          entry: entry,
          remote: remote,
          uiMode: 'critical',
          allowForceRetry: true,
        }).then(function (out) {
          if (!out.handled) {
            var failMsg = 'El instalador no se aplicó. Actual: ' + VERSION + ', requerido: ' + remote + '.';
            _criticalInstallState = 'failed';
            setCriticalOpen(true);
            populateCriticalInfo('failed', failMsg);
            offerPlanBAfterFailure(remote, null);
            scheduleCriticalInstallRetry(entry, new Error(failMsg));
          }
          return res;
        });
      })
      .catch(function (err) {
        _criticalAutoAttempts += 1;
        var msg = humanizeInstallError(err);
        if (_criticalAutoAttempts < CRITICAL_AUTO_INSTALL_MAX) {
          setBootGateMessage('Reintento automático (' + _criticalAutoAttempts + '/' + CRITICAL_AUTO_INSTALL_MAX + ')…');
          return delay(5000 * _criticalAutoAttempts).then(function () {
            _installInProgress = false;
            return runCriticalInstall(entry);
          });
        }
        _criticalInstallState = 'failed';
        if (!/método alternativo/i.test(msg) && !_bootUpdatePhase) {
          setCriticalOpen(true);
          populateCriticalInfo('failed', msg);
          offerPlanBAfterFailure(remote, err);
        } else if (_bootUpdatePhase) {
          setBootGateMessage('Error: ' + msg);
        }
        setCheckStatus('Error al instalar: ' + msg);
        console.warn('[crozzo-updates] install failed', err);
        scheduleCriticalInstallRetry(entry, err);
      })
      .finally(function () {
        _installInProgress = false;
        renderCriticalMiniProgress();
      });
  }

  function showBuildOnlyUpdate(entry, opts) {
    opts = opts || {};
    var remote = normEntryVersion(entry);
    _currentCriticalId = entryId(entry);
    _pendingCriticalEntry = entry;
    VERSION_AVAIL = remote;
    global.CROZZO_APP_VERSION_DISPONIBLE = remote;
    UPDATE_NORMAL = buildUpdateNormalFromEntry(entry, VERSION);
    UPDATE_NORMAL.type = 'Build nuevo disponible';
    UPDATE_NORMAL.summary =
      (entry.message || 'Hay un build nuevo del programa.') +
      ' Reinstalación automática del ' +
      getPlatformUpdateDescriptor() +
      ' en curso.';
    UPDATE_CRITICAL_INSTALLED = {
      version: remote,
      previous: VERSION,
      date: formatManifestDate(entry.publishedAt),
      installed: Array.isArray(entry.changelog) ? entry.changelog.slice() : entry.message ? [entry.message] : [],
    };
    setNormalOpen(false);
    hideBootUpdateGate();
    if (opts.forceAuto === true) {
      setCriticalOpen(true);
      populateCriticalInfo('info');
      setCheckStatus('Build nuevo ' + remote + ': reinstalando automáticamente…');
      var installP = delay(opts.skipInfoDelay ? 0 : CRITICAL_INFO_DELAY_MS).then(function () {
        populateCriticalInfo('installing');
        return runCriticalInstall(entry);
      });
      if (opts.returnPromise) return installP;
      return true;
    }
    if (opts.deferOverlay) {
      _deferredAndroidCritical = entry;
      setCheckStatus('Build nuevo ' + remote + ' — descarga al terminar el arranque.');
      if (opts.returnPromise) return Promise.resolve({ deferred: true });
      return true;
    }
    if (opts.returnPromise) return startCriticalDownloadForRestart(entry, opts);
    startCriticalDownloadForRestart(entry, opts);
    return true;
  }

  function beginCriticalEntryInstall(entry, opts) {
    opts = opts || {};
    var remoteNorm = normEntryVersion(entry);
    if (remoteNorm && compareSemver(VERSION, remoteNorm) >= 0 && isCriticalEntry(entry)) {
      markEntryFullyApplied(entry, VERSION);
      clearPendingRestartInstall();
      if (opts.returnPromise) return Promise.resolve({ done: true, upToDate: true });
      return true;
    }
    if (isBuildOnlyUpdate(entry) && !opts.skipBuildAuto) {
      return showBuildOnlyUpdate(entry, opts);
    }
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
    _criticalAutoAttempts = 0;
    hideBootUpdateGate();

    if (opts.forceAuto === true) {
      setCriticalOpen(true);
      populateCriticalInfo('info');
      var forceP = delay(opts.skipInfoDelay ? 0 : CRITICAL_INFO_DELAY_MS).then(function () {
        populateCriticalInfo('installing');
        return runCriticalInstall(entry);
      });
      if (opts.returnPromise) return forceP;
      return true;
    }

    var pendingRestart = loadPendingRestartInstall();
    if (
      pendingRestart &&
      pendingRestart.ready &&
      pendingRestart.entryId === id &&
      compareSemver(VERSION, pendingRestart.version) < 0
    ) {
      _criticalInstallState = 'pending_restart';
      if (opts.deferOverlay) {
        _deferredAndroidCritical = entry;
      } else if (shouldShowCriticalOverlay(entry)) {
        setCriticalOpen(true);
        populateCriticalInfo('pending_restart');
      } else {
        setCriticalOpen(false);
      }
      setCheckStatus('Actualización crítica descargada — se aplicará al reiniciar BONA origen.');
      if (opts.returnPromise) return Promise.resolve({ pendingRestart: true });
      return true;
    }

    var profile = getUpdateClientProfile();
    var userBusy = crozzoUpdateUserBusy() || posIsOperationBusy();

    if (opts.deferOverlay) {
      _deferredAndroidCritical = entry;
      if (shouldInstallCriticalImmediately(profile)) {
        if (opts.returnPromise) return runCriticalInstall(entry);
        runCriticalInstall(entry);
        return true;
      }
      setCheckStatus('Actualización crítica ' + remote + ' — descarga en segundo plano…');
      if (opts.returnPromise) {
        return startCriticalDownloadForRestart(entry, { silent: userBusy });
      }
      startCriticalDownloadForRestart(entry, { silent: userBusy });
      return true;
    }

    if (shouldInstallCriticalImmediately(profile)) {
      if (opts.returnPromise) return runCriticalInstall(entry);
      runCriticalInstall(entry);
      return true;
    }

    if (opts.returnPromise) {
      return startCriticalDownloadForRestart(entry, { silent: userBusy });
    }
    startCriticalDownloadForRestart(entry, { silent: userBusy });
    return true;
  }

  function showCriticalEntry(entry) {
    return beginCriticalEntryInstall(entry);
  }

  function showOptionalEntry(entry) {
    var id = entryId(entry);
    var remote = entry.version || 'v' + (entry.semver || '');
    _currentOptionalId = id;
    VERSION_AVAIL = remote;
    global.CROZZO_APP_VERSION_DISPONIBLE = VERSION_AVAIL;
    UPDATE_NORMAL = buildUpdateNormalFromEntry(entry, VERSION);
    setCriticalOpen(false);
    if (_deferOptionalBannerSession || _bootUpdatePhase) {
      setCheckStatus(
        'Mejora ' + remote + ' lista. Se mostrará el asistente al terminar el arranque.'
      );
      return true;
    }
    // Si NO está trabajando (pantalla de inicio / recién inició sesión, sin ventas
    // abiertas): actualizar de una, sin mostrar el letrero "puede seguir operando".
    // El letrero solo aparece cuando ya hay operación en curso (no interrumpir).
    if (!crozzoUpdateUserBusy()) {
      var prof = getUpdateClientProfile();
      if (prof && prof.canAutoInstall) {
        // En APK: descarga + instalador del sistema (un solo toque). En escritorio:
        // instala/prepara. Sin el letrero "puede seguir operando".
        installOptionalNowAtStartup(entry);
        return true;
      }
    }
    openOptionalWizard(entry);
    setNormalOpen(true);
    setNormalBannerMessage();
    return true;
  }

  function processPendingUpdates(entries) {
    if (_installInProgress || _installUi.open) return false;
    if (_criticalInstallState === 'installing' || _criticalInstallState === 'downloading' || _criticalInstallState === 'pending_restart') return false;

    pruneStaleStateFlags();
    applyAvailabilityFromRegistry(entries);

    var entry = pickNextPendingEntry(entries);
    if (!entry) {
      setNormalOpen(false);
      return false;
    }

    if (isCriticalEntry(entry) && !otaAutoInstallAllowed()) {
      setCheckStatus(
        'Hay actualización ' +
          normEntryVersion(entry) +
          ' en GitHub. En este equipo no se instala sola: use Configuración → Actualizaciones.'
      );
      return false;
    }

    if (isCriticalEntry(entry)) {
      return showCriticalEntry(entry);
    }
    return showOptionalEntry(entry);
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
      var merged = mergeRegistryEntries(reg, man);
      if (merged.length) return merged;
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
      if (compareSemver(remote, VERSION) > 0) return 'Disponible · no instalada en este equipo';
      if (compareSemver(remote, VERSION) === 0 && !applied) return 'Misma versión · falta build local';
      if (stateHas(state.ackCritical, id)) return 'Vista (sin instalar)';
      return 'Pendiente';
    }
    if (applied) return 'Instalada (.exe + build)';
    if (stateHas(state.appliedOptional, id)) return 'Marcada (revisar .exe)';
    if (stateHas(state.dismissedOptional, id)) return 'Aviso oculto';
    if (compareSemver(remote, VERSION) > 0) return 'Disponible · no instalada en este equipo';
    if (compareSemver(remote, VERSION) === 0) return 'Misma versión · falta build local';
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
      '<p class="form-hint" style="margin:8px 0 0;">El registro remoto (main) avisa de versiones nuevas. El instalador <code>.exe</code> está en cada <strong>GitHub Release</strong> (tag <code>vX.Y.Z</code>). «No instalada aquí» = su PC aún no tiene esa versión — use <strong>Instalar</strong> en escritorio.</p>';
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

    // Backoff offline: en chequeos automáticos (silenciosos) no intentamos ni
    // hacemos ruido si no hay internet — se reanuda solo al volver la red.
    if (opts.silent && typeof navigator !== 'undefined' && navigator.onLine === false) {
      return Promise.resolve({ ok: false, reason: 'offline', skipped: true });
    }

    return refreshBinaryVersion()
      .then(function () {
        return fetchRegistryData();
      })
      .then(function (data) {
        _registryEntries = sortEntriesForProcess(normalizeRegistryEntries(data));
        if (!_registryEntries.length) {
          console.warn('[crozzo-updates] Registro remoto vacío o ilegible');
        }
        global.CROZZO_UPDATE_REGISTRY = _registryEntries.slice();
        applyAvailabilityFromRegistry(_registryEntries);
        pruneStaleStateFlags();
        renderRegistryPanel();
        renderLocalLogPanel();

        var pending = _registryEntries.filter(entryIsPending);
        var shown = false;
        if (otaAutoInstallAllowed()) {
          shown = processPendingUpdates(_registryEntries);
        } else {
          reconcileAppliedEntriesForVersion(VERSION);
        }

        if (shown) {
          var active = _currentCriticalId || _currentOptionalId || '';
          var tipo = _currentCriticalId ? 'crítica' : 'opcional';
          setCheckStatus(
            'Actualización ' + tipo + ' detectada (' + active + '). Equipo: ' + VERSION + ' → ' + VERSION_AVAIL + '.'
          );
          if (opts.toastOnFound !== false && typeof global.showToast === 'function') {
            var pendingEntry = pickNextPendingEntry(pending) || pending[0] || {};
            global.showToast(
              buildUpdateToastMessage(pendingEntry, isCriticalEntry(pendingEntry)),
              isCriticalEntry(pendingEntry) ? 'warning' : 'info'
            );
          }
        } else if (pending.length) {
          setCheckStatus(
            'Pendiente ' +
              normEntryVersion(pending[pending.length - 1]) +
              ' (actual ' +
              VERSION +
              '). Use Instalar o Restablecer avisos.'
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
        var msg = err && err.message ? err.message : String(err);
        setCheckStatus('Error al comprobar: ' + msg);
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

  function findCurrentOptionalEntry() {
    if (!_currentOptionalId) return null;
    return (
      _registryEntries.find(function (e) {
        return entryId(e) === _currentOptionalId;
      }) || null
    );
  }

  function crozzoPosponerActualizacionCritica() {
    if (_criticalInstallState === 'pending_restart') {
      setCriticalOpen(false);
      return;
    }
    if (_criticalInstallState === 'downloading' || _criticalInstallState === 'installing') {
      try {
        if (typeof global.showToast === 'function') {
          global.showToast(
            'La actualización crítica no se puede posponer. Espere a que termine la descarga.',
            'warning'
          );
        }
      } catch (_) {}
      return;
    }
    try {
      if (typeof global.showToast === 'function') {
        global.showToast(
          'Las actualizaciones críticas no se posponen: se descargan solas y se instalan al reiniciar.',
          'warning'
        );
      }
    } catch (_) {}
  }

  function crozzoPosponerActualizacionCriticaAndroid() {
    crozzoPosponerActualizacionCritica();
  }

  function crozzoPosponerActualizacionOpcional() {
    setDetailOpen(false);
    setNormalOpen(false);
    var entry = findCurrentOptionalEntry();
    if (entry) {
      sessionDismissEntry(entry);
      snoozeEntry(entry, 6);
      appendLocalLog('aviso_pospuesto', entry);
      try {
        if (typeof global.showToast === 'function') {
          var ctx = getUpdateOperativeContext();
          global.showToast(
            ctx.experiencia === 'novice'
              ? 'Mejora pospuesta — le recordaremos mañana o al próximo inicio tranquilo.'
              : 'Actualización ' + normEntryVersion(entry) + ' pospuesta. El aviso volverá más tarde.',
            'info'
          );
        }
      } catch (_) {}
    }
  }

  function crozzoOcultarActualizacionOpcional() {
    setDetailOpen(false);
    setNormalOpen(false);
    if (_currentOptionalId) {
      pushStateId('dismissedOptional', _currentOptionalId);
      var entry = findCurrentOptionalEntry();
      if (entry) appendLocalLog('aviso_oculto', entry);
      try {
        if (typeof global.showToast === 'function') {
          global.showToast(
            'Actualización ' + VERSION_AVAIL + ' oculta. Puede instalarla cuando quiera desde Actualizaciones del sistema.',
            'info'
          );
        }
      } catch (_) {}
    }
  }

  function crozzoCerrarActualizacionNormal() {
    crozzoPosponerActualizacionOpcional();
  }

  function crozzoCerrarActualizacionCritica() {
    if (_criticalInstallState === 'pending_restart') {
      if (_pendingCriticalEntry) sessionDismissCriticalOverlay(_pendingCriticalEntry);
      setCriticalOpen(false);
      try {
        if (typeof global.showToast === 'function') {
          global.showToast(
            'Sigue operando. La actualización se aplicará al cerrar y abrir BONA origen.',
            'info'
          );
        }
      } catch (_) {}
      return;
    }
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
    var entry =
      _registryEntries.find(function (e) {
        return entryId(e) === _currentOptionalId;
      }) || null;
    if (entry) openOptionalWizard(entry);
    else {
      populateDetailPanel();
      setDetailOpen(true);
    }
  }

  function crozzoRechazarActualizacion() {
    setDetailOpen(false);
    crozzoPosponerActualizacionOpcional();
  }

  function resetUpdateDismissals() {
    try {
      localStorage.removeItem(LS_STATE);
      localStorage.removeItem(LS_DISMISSED_OPTIONAL);
      localStorage.removeItem(LS_ACK_CRITICAL);
      localStorage.removeItem(LS_INSTALLED);
      localStorage.removeItem(LS_APPLIED_ENTRIES);
      localStorage.removeItem(LS_SNOOZE_UNTIL);
      localStorage.removeItem(LS_PENDING_RESTART);
      try {
        sessionStorage.removeItem(SS_ANDROID_PENDING);
      } catch (_) {}
      clearSessionDismissals();
    } catch (_) {}
    refreshBinaryVersion().then(function () {
      if (typeof global.showToast === 'function') {
        global.showToast('Avisos restablecidos. Comprobando de nuevo…', 'info');
      }
      checkForUpdates({ silent: true, toastOnFound: true });
    });
  }

  function markOptionalInstalled(entry, targetVersion) {
    var e =
      entry ||
      (_currentOptionalId
        ? _registryEntries.find(function (x) {
            return entryId(x) === _currentOptionalId;
          })
        : null);
    if (e) commitEntryInstall(e, targetVersion || normEntryVersion(e));
    else if (targetVersion) saveInstalledVersion(targetVersion);
    else if (VERSION) saveInstalledVersion(VERSION);
  }

  function runClientCriticalInstall(entry) {
    if (!entry || _installInProgress) return Promise.resolve();
    clearUpdateAbort();
    var remote = entry.version || 'v' + (entry.semver || '');
    _installInProgress = true;
    _criticalInstallState = 'installing';
    setCriticalOpen(true);
    populateCriticalInfo('installing');
    setCheckStatus('Aplicando actualización ' + remote + '…');
    return applyClientUpdate(remote, handleInstallProgress, {
      silent: false,
      userInitiated: true,
      automaticOnly: false,
      markInstalled: getUpdateClientProfile().kind !== 'android',
    })
      .then(function (res) {
        if (res && res.exiting && res.plan === 'web_reload') return res;
        return handleAndroidOtaResult(res, {
          entry: entry,
          remote: remote,
          uiMode: 'critical',
          allowForceRetry: true,
        }).then(function (out) {
          if (!out.handled) {
            _criticalInstallState = 'failed';
            populateCriticalInfo(
              'failed',
              'No se pudo aplicar la actualización. Versión actual: ' + VERSION + '.'
            );
          }
          return res;
        });
      })
      .catch(function (err) {
        _criticalInstallState = 'failed';
        populateCriticalInfo('failed', humanizeInstallError(err));
        loadPlanBFallback(remote, err && err.manualFallback);
        setCheckStatus('Error: ' + humanizeInstallError(err));
        return Promise.reject(err);
      })
      .finally(function () {
        _installInProgress = false;
      });
  }

  function crozzoAceptarActualizacion() {
    if (_installInProgress) return;
    clearUpdateAbort();
    setDetailOpen(false);
    setNormalOpen(false);

    var entry = findCurrentOptionalEntry();
    if (!entry && _currentOptionalId) {
      entry =
        _registryEntries.find(function (e) {
          return entryId(e) === _currentOptionalId;
        }) || null;
    }
    if (!entry) return;

    var acceptBtn = document.getElementById('crozzoUpdateDetailAccept');
    var installBtn = document.getElementById('crozzoUpdateNormalInstall');
    if (acceptBtn) {
      acceptBtn.disabled = true;
      acceptBtn.textContent = 'Descargando…';
    }
    if (installBtn) {
      installBtn.disabled = true;
      installBtn.textContent = 'Descargando…';
    }

    function resetBtns() {
      if (acceptBtn) {
        acceptBtn.disabled = false;
        acceptBtn.textContent = 'Descargar actualización';
      }
      if (installBtn) {
        installBtn.disabled = false;
        applyNormalBannerRoleChrome();
      }
    }

    return startOptionalDownloadForRestart(entry)
      .catch(function () {})
      .finally(function () {
        resetBtns();
      });
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

    var desktopAuto = document.getElementById('crozzoUpdateDesktopAutoInstall');
    if (desktopAuto) {
      try {
        desktopAuto.checked = localStorage.getItem('crozzo_ota_auto') !== '0';
      } catch (_) {
        desktopAuto.checked = true;
      }
      wireOnce(desktopAuto, function () {
        try {
          if (desktopAuto.checked) localStorage.removeItem('crozzo_ota_auto');
          else localStorage.setItem('crozzo_ota_auto', '0');
        } catch (_) {}
        if (typeof global.showToast === 'function') {
          global.showToast(
            desktopAuto.checked
              ? 'Auto-instalación en PC activada.'
              : 'Auto-instalación en PC desactivada (solo avisos).',
            'info'
          );
        }
      });
    }

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
      if (_criticalInstallState === 'pending_restart' || _criticalInstallState === 'success' || _criticalInstallState === 'failed') {
        crozzoCerrarActualizacionCritica();
        return;
      }
      if (_criticalInstallState === 'downloading' || _criticalInstallState === 'installing') {
        return;
      }
      if (_pendingCriticalEntry) {
        startCriticalDownloadForRestart(_pendingCriticalEntry);
      }
    });
    wireOnce(document.getElementById('crozzoUpdateCriticalRetry'), function (e) {
      e.preventDefault();
      if (_pendingCriticalEntry) startCriticalDownloadForRestart(_pendingCriticalEntry);
    });
    wireOnce(document.getElementById('crozzoUpdateNormalLater'), function (e) {
      e.preventDefault();
      crozzoPosponerActualizacionOpcional();
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
      crozzoOcultarActualizacionOpcional();
    });
    wireOnce(document.getElementById('crozzoUpdateDetailBack'), function (e) {
      e.preventDefault();
      optionalWizardBack();
    });
    wireOnce(document.getElementById('crozzoUpdateDetailNext'), function (e) {
      e.preventDefault();
      optionalWizardNext();
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
    if (!otaAutoInstallAllowed()) return;
    setTimeout(function () {
      maybeShowPostUpdateWelcome();
      checkForUpdates({ silent: true, toastOnFound: false });
    }, 1500);
  }

  function startCrozzoUpdateChecks() {
    fetchTauriBinaryVersion().then(function (binaryVer) {
      VERSION = reconcileInstalledVersion(binaryVer);
      global.CROZZO_APP_VERSION = VERSION;
      syncVersionLabels();

      if (!_bootUpdatesReady) return;

      if (!otaAutoInstallAllowed()) {
        setCheckStatus('Versión ' + VERSION + ' · sin auto-instalación OTA en escritorio.');
        return;
      }

      checkForUpdates({ silent: true, toastOnFound: false });

      if (_bootTimer) clearTimeout(_bootTimer);
      _bootTimer = setTimeout(function () {
        checkForUpdates({ silent: true, toastOnFound: false });
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
          if (document.hidden) return;
          refreshBinaryVersion().then(function () {
            checkForUpdates({ silent: true });
          });
        });
        global.addEventListener('focus', function () {
          if (getUpdateClientProfile().kind !== 'android') return;
          refreshBinaryVersion().then(function () {
            checkForUpdates({ silent: true });
          });
        });
        // Al recuperar la red, ponerse al día (tras el backoff offline).
        global.addEventListener('online', function () {
          setTimeout(function () {
            checkForUpdates({ silent: true });
          }, 1500);
        });
      }
    });
  }

  global.CROZZO_APP_VERSION = VERSION;
  global.CROZZO_APP_VERSION_DISPONIBLE = VERSION_AVAIL;
  global.lanzarAlerta = lanzarAlerta;
  global.crozzoCerrarActualizacionNormal = crozzoCerrarActualizacionNormal;
  global.crozzoPosponerActualizacionOpcional = crozzoPosponerActualizacionOpcional;
  global.crozzoOcultarActualizacionOpcional = crozzoOcultarActualizacionOpcional;
  global.crozzoCerrarActualizacionCritica = crozzoCerrarActualizacionCritica;
  global.crozzoVerCambiosActualizacion = crozzoVerCambiosActualizacion;
  global.crozzoAbrirDetalleActualizacion = crozzoAbrirDetalleActualizacion;
  global.crozzoAceptarActualizacion = crozzoAceptarActualizacion;
  global.crozzoRechazarActualizacion = crozzoRechazarActualizacion;
  global.crozzoUpdateRunDiagnostic = crozzoUpdateRunDiagnostic;
  global.crozzoUpdateRunAudit = runInternalUpdateAudit;
  global.crozzoUpdateCopyManualLink = crozzoUpdateCopyManualLink;
  global.crozzoUpdateOpenReleasePage = crozzoUpdateOpenReleasePage;
  global.crozzoDismissUpdateOverlay = dismissInstallOverlayAndContinue;
  function crozzoTriggerAppUpdate() {
    var TU = global.CrozzoTauriUpdater;
    if (TU && typeof TU.canUseAndroidInAppUpdater === 'function' && TU.canUseAndroidInAppUpdater()) {
      return refreshBinaryVersion()
        .then(function () {
          return fetchRegistryData();
        })
        .then(function (data) {
          _registryEntries = sortEntriesForProcess(normalizeRegistryEntries(data));
          global.CROZZO_UPDATE_REGISTRY = _registryEntries.slice();
          applyAvailabilityFromRegistry(_registryEntries);
          var pending = _registryEntries.filter(entryIsPending);
          var entry =
            pickNextPendingEntry(pending.filter(isCriticalEntry)) || pickNextPendingEntry(pending);
          if (entry) {
            return beginCriticalEntryInstall(entry, {
              returnPromise: true,
              forceAuto: true,
              skipInfoDelay: true,
            });
          }
          if (typeof global.showToast === 'function') {
            global.showToast('Ya tiene la versión más reciente instalada.', 'info');
          }
          return { upToDate: true };
        })
        .catch(function (err) {
          if (typeof global.showToast === 'function') {
            global.showToast(
              err && err.message ? err.message : 'No se pudo comprobar actualizaciones.',
              'error'
            );
          }
        });
    }
    if (typeof global.crozzoOpenAppDownloadQr === 'function') {
      global.crozzoOpenAppDownloadQr();
      return Promise.resolve();
    }
    return Promise.resolve();
  }

  global.crozzoTriggerAppUpdate = crozzoTriggerAppUpdate;
  global.checkForUpdates = checkForUpdates;
  global.crozzoWhenBootUpdatesReady = crozzoWhenBootUpdatesReady;
  global.startCrozzoUpdateChecks = startCrozzoUpdateChecks;
  global.initActualizacionesSistema = initActualizacionesSistema;
  global.initCrozzoUpdateOverlays = initCrozzoUpdateOverlays;
  global.CrozzoSystemUpdates = {
    check: checkForUpdates,
    start: startCrozzoUpdateChecks,
    otaAutoInstallAllowed: otaAutoInstallAllowed,
    getManifestUrl: getManifestUrl,
    getRegistryUrl: getRegistryUrl,
    setManifestUrl: setManifestUrl,
    resetDismissals: resetUpdateDismissals,
    defaultManifestUrl: DEFAULT_MANIFEST_URL,
    defaultRegistryUrl: DEFAULT_REGISTRY_URL,
    renderRegistry: renderRegistryPanel,
    renderLocalLog: renderLocalLogPanel,
    getOperativeContext: getUpdateOperativeContext,
    humanizeChangelog: buildHumanChangelogHtml,
    runAudit: runInternalUpdateAudit,
  };

  function wirePendingRestartOnAppExit() {
    if (global.__crozzoPendingRestartExitWired) return;
    global.__crozzoPendingRestartExitWired = true;
    global.addEventListener('beforeunload', function () {
      var pending = loadPendingRestartInstall();
      if (!pending || !pending.ready || !pending.version) return;
      if (compareSemver(VERSION, pending.version) >= 0) return;
      try {
        sessionStorage.setItem(
          'crozzo_apply_pending_restart_on_launch',
          JSON.stringify({ version: pending.version, at: Date.now() })
        );
      } catch (_) {}
    });
  }

  function boot() {
    initCrozzoUpdateOverlays();
    wirePosIdleListener();
    wirePendingRestartOnAppExit();
    if (otaAutoInstallAllowed()) {
      scheduleDeferredCriticalAfterLogin();
    }
    runBootUpdatePipeline()
      .finally(function () {
        startCrozzoUpdateChecks();
        if (otaAutoInstallAllowed()) {
          checkForUpdates({ silent: true, toastOnFound: false });
        } else {
          refreshBinaryVersion()
            .then(function (installedVer) {
              return fetchRegistryData()
                .then(function (data) {
                  _registryEntries = sortEntriesForProcess(normalizeRegistryEntries(data));
                  global.CROZZO_UPDATE_REGISTRY = _registryEntries.slice();
                  reconcileAppliedEntriesForVersion(installedVer);
                  pruneStaleStateFlags();
                  setCheckStatus('Versión local ' + VERSION + ' (sin auto-instalación OTA en escritorio).');
                })
                .catch(function () {
                  setCheckStatus('Versión local ' + VERSION + '.');
                });
            })
            .catch(function () {});
        }
        return runInternalUpdateAudit({ silent: true });
      })
      .catch(function () {
        return runInternalUpdateAudit({ silent: true });
      });
    global.addEventListener('crozzo:operational-stress', function () {
      var banner = document.getElementById('crozzo-update-normal-banner');
      if (banner && banner.classList.contains('is-open')) setNormalBannerMessage();
    });
    setTimeout(maybeShowPostUpdateWelcome, 3200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
