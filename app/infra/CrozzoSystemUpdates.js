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
  var LS_SNOOZE_UNTIL = 'crozzo_update_snooze_until';
  var LS_POST_UPDATE_WELCOME = 'crozzo_update_post_welcome';
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
  var BOOT_GATE_MAX_MS = 300000;
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
      VERSION = reconcileInstalledVersion(binaryVer);
      global.CROZZO_APP_VERSION = VERSION;
      try {
        localStorage.setItem(LS_INSTALLED, VERSION);
      } catch (_) {}
      syncVersionLabels();
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

  function markEntryFullyApplied(entry, targetVersion) {
    if (!entry) return;
    var id = entryId(entry);
    if (!id) return;
    var tv = targetVersion ? normEntryVersion({ version: targetVersion }) : normEntryVersion(entry);
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
    if (!entry || !entryNeedsInstall(entry)) return false;
    return compareSemver(normEntryVersion(entry), VERSION) === 0;
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
    var id = entryId(entry);
    if (id && loadAppliedEntryIds().indexOf(id) >= 0) return true;
    var remoteStamp = entryBuildStamp(entry);
    var localStamp = readMetaBuildStamp();
    if (remoteStamp && localStamp) {
      return String(localStamp) >= String(remoteStamp);
    }
    return false;
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
    return 'Proyecto';
  }

  function humanizeInstallError(err) {
    var raw = err && err.message ? err.message : String(err || '');
    if (/different key|signature was created/i.test(raw)) {
      return 'Actualizando por método alternativo automático (instalador silencioso)…';
    }
    return raw;
  }

  function getUpdateClientProfile() {
    var TU = global.CrozzoTauriUpdater;
    var kind = TU && TU.getClientKind ? TU.getClientKind() : 'web';
    var canAutoInstall =
      TU &&
      TU.canUseTauriUpdater &&
      TU.canUseTauriUpdater() &&
      TU.isAvailable &&
      TU.isAvailable();
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

  function getPlatformUpdateDescriptor() {
    return getUpdateClientProfile().artifactLabel || 'este equipo';
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
              ? 'Instalar al cierre'
              : 'Instalar al cierre'
            : 'Instalar ahora';
      }
    }
    if (laterBtn) {
      laterBtn.textContent = ctx.experiencia === 'novice' ? 'Recordarme mañana' : 'Instalar después';
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
        ? 'Actualización importante en camino — no cierre la app. El encargado verá el progreso.'
        : 'Actualización crítica: instalando…';
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
    var mins = Math.round(CRITICAL_AUTO_RETRY_MS / 60000);
    setCheckStatus(
      'Actualización crítica falló. Reintento automático en ~' +
        mins +
        ' min (intento ' +
        _criticalFailCount +
        ').'
    );
    _criticalRetryTimer = setTimeout(function () {
      _criticalRetryTimer = null;
      _criticalInstallState = 'idle';
      _installInProgress = false;
      scheduleCriticalInstallWhenIdle(entry);
    }, CRITICAL_AUTO_RETRY_MS);
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
    if (isCriticalEntry(entry)) return true;
    if (isSnoozed(entry)) return false;
    if (isSessionDismissed(entry)) return false;
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
    var entry = _pendingCriticalEntry;
    closeInstallOverlay();
    _installInProgress = false;
    _criticalInstallState = 'idle';
    setCriticalOpen(false);
    if (entry && _installUi.state === 'error') {
      snoozeEntry(entry, 6);
      sessionDismissEntry(entry);
    }
    if (typeof global.showToast === 'function') {
      global.showToast(
        'Puede seguir usando la app. Reinstale cuando quiera desde Actualizaciones del sistema.',
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
        downloadUrl: TU && TU.releasesLatestUrl ? TU.releasesLatestUrl : '',
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
        ? 'Descargue el APK del release e instálelo en la tablet (orígenes desconocidos o MDM).'
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
        sub.textContent = 'La nueva versión está lista. La aplicación se reiniciará en un momento.';
      } else if (_installUi.state === 'error') {
        sub.textContent = 'Revise la conexión o espere a que GitHub Actions termine de compilar el release.';
      } else {
        sub.textContent = 'No cierre la aplicación. Todo ocurre dentro de Crozzo POS, sin asistentes externos.';
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
      close.style.display = _installUi.state === 'error' || _installUi.state === 'success' ? 'inline-flex' : 'none';
      close.textContent = _installUi.state === 'error' ? 'Continuar usando la app' : 'Continuar';
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
    if (p.message) {
      _installUi.message =
        p.phase === 'error' ? humanizeInstallError({ message: p.message }) : p.message;
    }
    if (p.phase === 'error') _installUi.state = 'error';
    if (_installUi.open) renderInstallOverlayUi();
    if (_installUi.open || _criticalInstallState === 'installing') {
      setCheckStatus(p.message || '');
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

    if (state === 'idle' || state === 'pending') {
      var profile = getUpdateClientProfile();
      if (badge) {
        badge.className = 'crozzo-update-critical-modal__badge';
        badge.style.background = '';
        badge.style.color = '';
        badge.innerHTML = profile.isAndroid ? '📱 Actualización tablet' : '🌐 Actualización web';
      }
      if (title) title.textContent = 'Actualización crítica disponible';
      if (lead) {
        lead.textContent =
          errMsg ||
          (profile.isAndroid
            ? 'Pulse «Instalar ahora» para descargar el APK o recargar la interfaz si usa navegador.'
            : 'Pulse «Instalar ahora» para recargar la app con la versión nueva del servidor.');
      }
      if (dismiss) {
        dismiss.disabled = false;
        dismiss.textContent = 'Instalar ahora';
      }
      if (retry) retry.style.display = 'none';
      var planBIdle = document.getElementById('crozzoUpdateCriticalPlanB');
      if (planBIdle) planBIdle.style.display = profile.isAndroid ? 'inline-flex' : 'none';
    } else if (state === 'installing') {
      if (badge) {
        badge.className = 'crozzo-update-critical-modal__badge';
        badge.innerHTML = '⏳ Instalando…';
      }
      if (title) title.textContent = 'Instalando actualización crítica';
      if (lead) {
        lead.textContent = _installUi.open
          ? 'Siga el progreso en pantalla. No cierre la aplicación.'
          : 'Actualizando en segundo plano. La aplicación se reiniciará sola al terminar.';
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
          '. Puede instalar ahora; <strong>no interrumpe ventas en curso</strong>.';
      }
      return;
    }
    var typeLabel = UPDATE_NORMAL.type || 'Actualización opcional';
    var actionHint = profile.canAutoInstall
      ? 'instalar en este equipo'
      : profile.isAndroid
        ? 'descargar APK o recargar'
        : 'recargar la interfaz';
    msg.innerHTML =
      'En uso: <strong>' +
      escapeHtml(VERSION) +
      '</strong> · ' +
      escapeHtml(typeLabel) +
      ': <strong>' +
      escapeHtml(VERSION_AVAIL) +
      '</strong> — pulse <strong>Instalar ahora</strong> para ' +
      escapeHtml(actionHint) +
      ' o revise los cambios antes de continuar.';
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
          ? 'Pulse Instalar para aplicar la nueva versión en segundo plano (sin asistente de Windows). Hágalo al cierre del turno si puede.'
          : 'La instalación reiniciará la aplicación en este equipo. Se recomienda hacerlo al cierre del turno o con la caja sin ventas en curso.'),
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
            return Promise.reject(new Error('No se pudo abrir la descarga del APK.'));
          }
          appendLocalLog('apk_download', {
            version: targetVersion || VERSION_AVAIL,
            type: 'android',
            message: apkUrl,
          });
          if (opts.markInstalled !== false) {
            saveInstalledVersion(targetVersion || VERSION_AVAIL);
          }
          if (onProgress) {
            onProgress({
              phase: 'install',
              percent: 88,
              message: 'Instale el APK descargado y vuelva a abrir Crozzo POS.',
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
      if (profile.kind === 'android-web' || opts.allowWebFallback !== false) {
        return applyWebClientUpdate(targetVersion, onProgress);
      }
      return Promise.reject(
        new Error('El APK aún no está en GitHub. Espere a que termine la compilación Android.')
      );
    });
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
      return applyClientUpdate(targetVersion, onProgress, opts);
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
      '</div>';
    document.body.appendChild(el);
    return el;
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

  function runBootCriticalInstallLoop() {
    pruneStaleStateFlags();
    var pending = _registryEntries.filter(entryIsPending);
    var entry = pickNextPendingEntry(pending);
    if (!entry || !isCriticalEntry(entry)) return Promise.resolve({ done: true });
    var remote = normEntryVersion(entry);
    var profile = getUpdateClientProfile();
    setBootGateMessage(
      'Instalando ' + remote + ' (' + (profile.artifactLabel || getPlatformUpdateDescriptor()) + ')…'
    );
    return runCriticalInstall(entry).then(function (res) {
      if (res && res.exiting) return res;
      return refreshBinaryVersion().then(function () {
        return runBootCriticalInstallLoop();
      });
    });
  }

  function runBootUpdatePipeline() {
    if (_bootUpdatesReady) return Promise.resolve({ ok: true, skipped: true });
    _bootUpdatePhase = true;
    global.__crozzoBootUpdatePhase = true;
    showBootUpdateGate();
    setBootGateMessage(
      'Comprobando actualizaciones para ' + getPlatformUpdateDescriptor() + '…'
    );

    var safetyTimer = setTimeout(function () {
      if (
        !_bootUpdatesReady &&
        !_installInProgress &&
        _criticalInstallState !== 'installing'
      ) {
        console.warn('[crozzo-updates] tiempo máximo de arranque; continuando sin bloquear');
        notifyBootUpdatesReady({ ok: false, reason: 'timeout' });
      }
    }, BOOT_GATE_MAX_MS);

    return refreshBinaryVersion()
      .then(function () {
        return fetchRegistryData();
      })
      .then(function (data) {
        _registryEntries = sortEntriesForProcess(normalizeRegistryEntries(data));
        global.CROZZO_UPDATE_REGISTRY = _registryEntries.slice();
        applyAvailabilityFromRegistry(_registryEntries);
        pruneStaleStateFlags();

        var pending = _registryEntries.filter(entryIsPending);
        var hasCritical = pending.some(isCriticalEntry);
        if (hasCritical) {
          return runBootCriticalInstallLoop();
        }
        return prefetchOptionalAtBoot(pending);
      })
      .then(function (res) {
        clearTimeout(safetyTimer);
        if (res && res.exiting) return res;
        notifyBootUpdatesReady({ ok: true });
        return res;
      })
      .catch(function (err) {
        clearTimeout(safetyTimer);
        console.warn('[crozzo-updates] boot pipeline', err);
        notifyBootUpdatesReady({ ok: false, error: err });
        return { ok: false, error: err };
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
    if (_installInProgress) return Promise.resolve();
    cancelCriticalIdleWait();
    _criticalAutoAttempts = _criticalAutoAttempts || 0;
    var remote = entry.version || 'v' + (entry.semver || '');
    var changes = Array.isArray(entry.changelog) ? entry.changelog.slice() : entry.message ? [entry.message] : [];
    _installInProgress = true;
    _criticalInstallState = 'installing';
    setCriticalOpen(false);
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
    _installUi.message = 'Actualizando en segundo plano…';
    setCheckStatus('Actualizando ' + remote + ' en segundo plano…');

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
          _criticalAutoAttempts += 1;
          if (_criticalAutoAttempts < CRITICAL_AUTO_INSTALL_MAX) {
            setBootGateMessage('Reintentando actualización Android…');
            return delay(4000).then(function () {
              return runCriticalInstall(entry);
            });
          }
          _criticalInstallState = 'failed';
          setCheckStatus('APK Android: requiere confirmación del sistema.');
          return res;
        }
        return refreshBinaryVersion().then(function () {
          if (res && res.installed) {
            _criticalInstallState = 'success';
            _criticalFailCount = 0;
            _criticalAutoAttempts = 0;
            cancelCriticalAutoRetry();
            markCriticalInstalled(entry, remote);
            setCheckStatus('Actualización ' + remote + ' instalada.');
            return res;
          }
          if (res && res.upToDate) {
            _criticalInstallState = 'success';
            _criticalFailCount = 0;
            cancelCriticalAutoRetry();
            markCriticalInstalled(entry, remote);
            _registryEntries.forEach(function (e) {
              if (
                isCriticalEntry(e) &&
                entryIsPending(e) &&
                compareSemver(VERSION, normEntryVersion(e)) >= 0
              ) {
                markCriticalInstalled(e, VERSION);
              }
            });
            setCheckStatus('Este equipo ya está en ' + VERSION + '.');
            return res;
          }
          var failMsg = 'El instalador no se aplicó. Actual: ' + VERSION + ', requerido: ' + remote + '.';
          _criticalInstallState = 'failed';
          openInstallOverlay({ mode: 'critical', from: VERSION, to: remote, changelog: changes });
          _installUi.state = 'error';
          handleInstallProgress({ phase: 'error', percent: 100, message: failMsg });
          offerPlanBAfterFailure(remote, null);
          scheduleCriticalInstallRetry(entry, new Error(failMsg));
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
          openInstallOverlay({ mode: 'critical', from: VERSION, to: remote, changelog: changes });
          _installUi.state = 'error';
          handleInstallProgress({ phase: 'error', percent: 0, message: msg });
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

  function showBuildOnlyUpdate(entry) {
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
    setCriticalOpen(false);
    setNormalOpen(false);
    setCheckStatus('Build nuevo ' + remote + ': reinstalando automáticamente…');
    runCriticalInstall(entry);
    return true;
  }

  function showCriticalEntry(entry) {
    if (isBuildOnlyUpdate(entry)) {
      return showBuildOnlyUpdate(entry);
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
    setCriticalOpen(false);
    _criticalAutoAttempts = 0;
    runCriticalInstall(entry);
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
    if (_deferOptionalBannerSession || _bootUpdatePhase) {
      setCheckStatus(
        'Mejora ' + remote + ' lista. Instálela desde Actualizaciones del sistema cuando convenga.'
      );
      return true;
    }
    setNormalOpen(true);
    enrichEntryChangelog(entry).then(function (enriched) {
      if (!enriched || entryId(enriched) !== _currentOptionalId) return;
      if (!Array.isArray(enriched.changelog) || !enriched.changelog.length) return;
      UPDATE_NORMAL = buildUpdateNormalFromEntry(enriched, VERSION);
      setNormalBannerMessage();
      var detailOv = document.getElementById('crozzo-update-detail-overlay');
      if (detailOv && detailOv.classList.contains('is-open')) populateDetailPanel();
    });
    return true;
  }

  function processPendingUpdates(entries) {
    if (_installInProgress || _installUi.open) return false;
    if (_criticalInstallState === 'installing') return false;

    pruneStaleStateFlags();
    applyAvailabilityFromRegistry(entries);

    var entry = pickNextPendingEntry(entries);
    if (!entry) {
      setNormalOpen(false);
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
        var shown = processPendingUpdates(_registryEntries);

        if (!shown && pending.length) {
          var hasPendingCritical = pending.some(isCriticalEntry);
          if (hasPendingCritical) {
            clearSessionDismissals();
            shown = processPendingUpdates(_registryEntries);
          }
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
      localStorage.removeItem(LS_APPLIED_ENTRIES);
      localStorage.removeItem(LS_SNOOZE_UNTIL);
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
    var remote = entry.version || 'v' + (entry.semver || '');
    _installInProgress = true;
    _criticalInstallState = 'installing';
    setCriticalOpen(true);
    populateCriticalInfo('installing');
    setCheckStatus('Aplicando actualización ' + remote + '…');
    return applyClientUpdate(remote, handleInstallProgress, { silent: false, markInstalled: true })
      .then(function (res) {
        if (res && res.exiting && (res.plan === 'web_reload' || res.plan === 'apk_download')) {
          return res;
        }
        if (res && res.plan === 'apk_download') {
          _criticalInstallState = 'success';
          markCriticalInstalled(entry, remote);
          populateCriticalInfo(
            'success',
            'Descarga del APK iniciada. Instálelo y vuelva a abrir la app.'
          );
          setCheckStatus('Descargue e instale el APK v' + String(remote).replace(/^v/i, '') + '.');
          return res;
        }
        if (res && res.installed) {
          _criticalInstallState = 'success';
          markCriticalInstalled(entry, remote);
          populateCriticalInfo('success');
          setCheckStatus('Actualización ' + remote + ' aplicada.');
        } else {
          _criticalInstallState = 'failed';
          populateCriticalInfo('failed', 'No se pudo aplicar la actualización.');
        }
        return res;
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

    if (getUpdateClientProfile().canAutoInstall) {
      _installInProgress = true;
      setCheckStatus('Descargando e instalando ' + next + '…');
      openInstallOverlay({
        mode: 'optional',
        from: VERSION,
        to: next,
        changelog: UPDATE_NORMAL.changes || [],
      });
      waitForPosIdleBeforeInstall(function () {
        return applyBinaryUpdate(next, null, { silent: false, allowSilentSetup: true }).then(function (res) {
          if (res && res.exiting && res.plan === 'C') {
            resetAcceptBtn();
            _installUi.state = 'installing';
            _installUi.percent = 98;
            _installUi.message = 'Instalando… la aplicación se reiniciará sola.';
            renderInstallOverlayUi();
            var entryExit =
              _registryEntries.find(function (e) {
                return entryId(e) === _currentOptionalId;
              }) || null;
            markOptionalInstalled(entryExit, next);
            return res;
          }
          return refreshBinaryVersion().then(function () {
            resetAcceptBtn();
            var entry =
              _registryEntries.find(function (e) {
                return entryId(e) === _currentOptionalId;
              }) || null;
            if (res && res.installed) {
              _installUi.state = 'success';
              _installUi.percent = 100;
              _installUi.phase = 'relaunch';
              _installUi.message = 'Reiniciando…';
              renderInstallOverlayUi();
              markOptionalInstalled(entry, next);
              return;
            }
            if (res && res.upToDate && entry && isEntryApplied(entry)) {
              closeInstallOverlay();
              markOptionalInstalled(entry, next);
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
        });
      })
        .catch(function (err) {
          resetAcceptBtn();
          setNormalOpen(true);
          console.warn('[crozzo-tauri-updater]', err);
          var msg = humanizeInstallError(err);
          _installUi.state = 'error';
          handleInstallProgress({ phase: 'error', percent: 0, message: msg });
          offerPlanBAfterFailure(next, err);
          setCheckStatus('Error: ' + msg);
          try {
            if (typeof global.showToast === 'function') {
              global.showToast(
                /método alternativo/i.test(msg)
                  ? 'Instalando actualización automáticamente…'
                  : 'No se pudo instalar solo. Use Plan B en pantalla si persiste.',
                /método alternativo/i.test(msg) ? 'info' : 'error'
              );
            }
          } catch (_) {}
        })
        .finally(function () {
          _installInProgress = false;
        });
      return;
    }

    var profile = getUpdateClientProfile();
    if (profile.isWeb || profile.isAndroid) {
      _installInProgress = true;
      openInstallOverlay({
        mode: 'optional',
        from: VERSION,
        to: next,
        changelog: UPDATE_NORMAL.changes || [],
      });
      waitForPosIdleBeforeInstall(function () {
        return applyClientUpdate(next, handleInstallProgress, { silent: false }).then(function (res) {
          resetAcceptBtn();
          var entry =
            _registryEntries.find(function (e) {
              return entryId(e) === _currentOptionalId;
            }) || null;
          if (res && res.exiting && res.plan === 'web_reload') {
            markOptionalInstalled(entry, next);
            return res;
          }
          if (res && res.plan === 'apk_download') {
            _installUi.state = 'success';
            _installUi.percent = 100;
            _installUi.phase = 'install';
            _installUi.message = 'Instale el APK descargado y vuelva a abrir Crozzo POS.';
            renderInstallOverlayUi();
            markOptionalInstalled(entry, next);
            if (typeof global.showToast === 'function') {
              global.showToast('Descarga del APK iniciada.', 'info');
            }
            return res;
          }
          if (res && res.installed) {
            _installUi.state = 'success';
            _installUi.percent = 100;
            renderInstallOverlayUi();
            markOptionalInstalled(entry, next);
            return res;
          }
          _installUi.state = 'error';
          handleInstallProgress({
            phase: 'error',
            percent: 0,
            message: 'No se pudo aplicar la actualización en este cliente.',
          });
          offerPlanBAfterFailure(next, null);
          setNormalOpen(true);
          return res;
        });
      })
        .catch(function (err) {
          resetAcceptBtn();
          setNormalOpen(true);
          _installUi.state = 'error';
          handleInstallProgress({ phase: 'error', percent: 0, message: humanizeInstallError(err) });
          offerPlanBAfterFailure(next, err);
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
      if (_criticalInstallState === 'idle' && _pendingCriticalEntry) {
        runClientCriticalInstall(_pendingCriticalEntry);
        return;
      }
      crozzoCerrarActualizacionCritica();
    });
    wireOnce(document.getElementById('crozzoUpdateCriticalRetry'), function (e) {
      e.preventDefault();
      if (_pendingCriticalEntry) scheduleCriticalInstallWhenIdle(_pendingCriticalEntry);
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
      maybeShowPostUpdateWelcome();
      checkForUpdates({ silent: true, toastOnFound: false });
    }, 1500);
  }

  function startCrozzoUpdateChecks() {
    clearSessionDismissals();
    fetchTauriBinaryVersion().then(function (binaryVer) {
      VERSION = reconcileInstalledVersion(binaryVer);
      global.CROZZO_APP_VERSION = VERSION;
      syncVersionLabels();

      if (!_bootUpdatesReady) return;

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
          if (!document.hidden) checkForUpdates({ silent: true });
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
  global.checkForUpdates = checkForUpdates;
  global.crozzoWhenBootUpdatesReady = crozzoWhenBootUpdatesReady;
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
    getOperativeContext: getUpdateOperativeContext,
    humanizeChangelog: buildHumanChangelogHtml,
    runAudit: runInternalUpdateAudit,
  };

  function boot() {
    initCrozzoUpdateOverlays();
    wirePosIdleListener();
    runBootUpdatePipeline()
      .finally(function () {
        startCrozzoUpdateChecks();
        checkForUpdates({ silent: true, toastOnFound: false });
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
