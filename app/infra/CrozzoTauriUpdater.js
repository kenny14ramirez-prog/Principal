/**
 * Crozzo POS — Instalador nativo Tauri (plugin-updater + relaunch) + Plan B manual
 */
(function (global) {
  'use strict';

  var GITHUB_OWNER = 'kenny14ramirez-prog';
  var GITHUB_REPO = 'Principal';
  var GITHUB_RELEASE_BASE =
    'https://github.com/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/releases/download';
  var GITHUB_RELEASES_PAGE =
    'https://github.com/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/releases';
  var GITHUB_RELEASES_LATEST = GITHUB_RELEASES_PAGE + '/latest';
  var GITHUB_API_RELEASE =
    'https://api.github.com/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/releases/tags/';
  var PRODUCT_NAME = 'Proyecto';
  var SETUP_MIN_BYTES = 400 * 1024;
  var APK_MIN_BYTES = 800 * 1024;
  var CHECK_RETRY_MAX = 2;
  var SILENT_INSTALL_RETRY_MAX = 2;
  var MIN_ARTIFACT_BYTES = { exe: 400 * 1024, dmg: 1024 * 1024, apk: 800 * 1024 };

  function isTauri() {
    return !!(global.__TAURI__ && global.__TAURI__.core && global.__TAURI__.core.invoke);
  }

  function ua() {
    return String((global.navigator && global.navigator.userAgent) || '');
  }

  function isWindowsDesktop() {
    if (!isTauri()) return /Windows/i.test(ua());
    return /Win/i.test(ua()) || /Windows/i.test(global.navigator.platform || '');
  }

  function isMacDesktop() {
    return /Mac OS X|Macintosh/i.test(ua()) || /^Mac/i.test(global.navigator.platform || '');
  }

  function isAndroidTablet() {
    return /Android/i.test(ua());
  }

  function getClientKind() {
    if (!isTauri()) {
      if (isAndroidTablet()) return 'android-web';
      if (/iPad|iPhone|iPod/i.test(ua())) return 'ios-web';
      return 'web';
    }
    if (isAndroidTablet()) return 'android';
    if (isMacDesktop()) return 'mac';
    if (isWindowsDesktop()) return 'windows';
    return 'desktop';
  }

  function prefersApkDownload() {
    var kind = getClientKind();
    return kind === 'android' || kind === 'android-web';
  }

  function prefersWebReload() {
    var kind = getClientKind();
    return kind === 'web' || kind === 'ios-web';
  }

  function canUseTauriUpdater() {
    if (!isTauri()) return false;
    return !isAndroidTablet();
  }

  function updaterPlatformKeys() {
    if (isMacDesktop()) {
      return ['darwin-aarch64', 'darwin-x86_64', 'darwin-universal'];
    }
    return ['windows-x86_64-nsis', 'windows-x86_64', 'windows-x86_64-msi'];
  }

  function pickPlatformEntry(platforms) {
    if (!platforms) return null;
    var keys = updaterPlatformKeys();
    for (var i = 0; i < keys.length; i++) {
      var p = platforms[keys[i]];
      if (p && p.url && p.signature) return p;
    }
    return null;
  }

  function invoke(cmd, args) {
    return global.__TAURI__.core.invoke(cmd, args || {});
  }

  function normVersion(v) {
    if (!v) return '';
    var s = String(v).trim();
    return s.indexOf('v') === 0 ? s : 'v' + s;
  }

  function semverCore(v) {
    return String(v || '')
      .replace(/^v/i, '')
      .split('-')[0]
      .trim();
  }

  function parseSemver(v) {
    var parts = semverCore(v).split('.').map(function (n) {
      return parseInt(n, 10) || 0;
    });
    while (parts.length < 3) parts.push(0);
    return parts.slice(0, 3);
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

  function delay(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function createProgressChannel(onEvent) {
    if (!global.__TAURI__.core.Channel) return undefined;
    var ch = new global.__TAURI__.core.Channel();
    if (onEvent) ch.onmessage = onEvent;
    return ch;
  }

  function getAppVersion() {
    if (!isTauri()) return Promise.resolve('');
    return invoke('plugin:app|version')
      .then(function (v) {
        return normVersion(v);
      })
      .catch(function () {
        return '';
      });
  }

  function checkForAppUpdate(opts) {
    if (!isTauri()) return Promise.reject(new Error('Updater solo en app de escritorio'));
    return invoke('plugin:updater|check', opts || {})
      .then(function (meta) {
        return meta || null;
      })
      .catch(function (err) {
        return Promise.reject(
          new Error(
            'No se pudo contactar el updater de GitHub: ' +
              (err && err.message ? err.message : String(err))
          )
        );
      });
  }

  function downloadAndInstallUpdate(meta, onEvent) {
    if (!meta || meta.rid == null) {
      return Promise.reject(new Error('Sin metadatos de actualización Tauri'));
    }
    var payload = { rid: meta.rid };
    var ch = createProgressChannel(onEvent);
    if (ch) payload.onEvent = ch;
    return invoke('plugin:updater|download_and_install', payload);
  }

  function openExternalUrl(url) {
    url = String(url || '').trim();
    if (!url) return Promise.resolve(false);
    if (isTauri()) {
      return invoke('plugin:opener|open_url', { url: url })
        .then(function () {
          return true;
        })
        .catch(function () {
          try {
            global.open(url, '_blank', 'noopener,noreferrer');
            return true;
          } catch (_) {
            return false;
          }
        });
    }
    try {
      global.open(url, '_blank', 'noopener,noreferrer');
      return Promise.resolve(true);
    } catch (_) {
      return Promise.resolve(false);
    }
  }

  var RELEASE_WAIT_MS = 90 * 1000;
  var RELEASE_POLL_MS = 4000;
  var UPDATER_CHECK_TIMEOUT_MS = 45000;

  function isSignatureMismatchError(err) {
    var msg = err && err.message ? err.message : String(err || '');
    return /different key|signature was created/i.test(msg);
  }

  function isRecoverableUpdaterError(err) {
    if (isSignatureMismatchError(err)) return true;
    var msg = err && err.message ? err.message : String(err || '');
    return /timeout|timed out|network|fetch|failed|econn|could not|unable|404|403|502|503|certificate|dns|abort|sin metadatos|updater/i.test(
      msg
    );
  }

  function predictSetupExeUrl(targetVersion) {
    var ver = semverCore(targetVersion);
    if (!ver) return '';
    return (
      GITHUB_RELEASE_BASE +
      '/v' +
      ver +
      '/' +
      encodeURIComponent(PRODUCT_NAME + '_' + ver + '_x64-setup.exe')
    );
  }

  function verifySetupDownloadUrl(url) {
    url = String(url || '').trim();
    if (!url || !/^https:\/\//i.test(url)) {
      return Promise.resolve({ ok: false, reason: 'url_invalida', url: url });
    }
    var sep = url.indexOf('?') >= 0 ? '&' : '?';
    return fetch(url + sep + '_=' + Date.now(), { method: 'HEAD', cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) return { ok: false, reason: 'http_' + res.status, url: url };
        var len = parseInt(res.headers.get('content-length') || '0', 10);
        if (len > 0 && len < SETUP_MIN_BYTES) {
          return { ok: false, reason: 'archivo_pequeno', url: url, bytes: len };
        }
        return { ok: true, url: url, bytes: len };
      })
      .catch(function () {
        return { ok: false, reason: 'red', url: url };
      });
  }

  function pickVerifiedSetupUrl(candidates) {
    var list = (candidates || []).filter(function (u) {
      return u && /^https:\/\//i.test(String(u));
    });
    var seen = {};
    list = list.filter(function (u) {
      if (seen[u]) return false;
      seen[u] = true;
      return true;
    });
    if (!list.length) return Promise.resolve(null);

    function next(i) {
      if (i >= list.length) return Promise.resolve(null);
      return verifySetupDownloadUrl(list[i]).then(function (v) {
        if (v.ok) return v;
        return next(i + 1);
      });
    }
    return next(0);
  }

  function resolveBestSetupUrl(targetVersion) {
    var ver = normVersion(targetVersion);
    return resolveManualFallback(ver).then(function (info) {
      var candidates = [];
      if (info.downloadUrl) candidates.push(info.downloadUrl);
      var predicted = predictSetupExeUrl(ver);
      if (predicted) candidates.push(predicted);
      if (Array.isArray(info.assets)) {
        info.assets.forEach(function (a) {
          if (a && a.url && /setup\.exe/i.test(a.name || a.url)) candidates.push(a.url);
        });
      }
      return pickVerifiedSetupUrl(candidates).then(function (verified) {
        if (verified && verified.url) {
          return {
            version: ver,
            downloadUrl: verified.url,
            releasePageUrl: info.releasePageUrl || GITHUB_RELEASES_PAGE + '/tag/' + ver,
            verified: true,
            bytes: verified.bytes || 0,
          };
        }
        return {
          version: ver,
          downloadUrl: info.downloadUrl || predicted || GITHUB_RELEASES_LATEST,
          releasePageUrl: info.releasePageUrl || GITHUB_RELEASES_LATEST,
          verified: false,
          bytes: 0,
        };
      });
    });
  }

  function checkForAppUpdateWithRetry(opts, attempt) {
    attempt = attempt || 0;
    return checkForAppUpdate(opts).catch(function (err) {
      if (attempt >= CHECK_RETRY_MAX) return Promise.reject(err);
      return delay(1800 * (attempt + 1)).then(function () {
        return checkForAppUpdateWithRetry(opts, attempt + 1);
      });
    });
  }

  function releaseUrlLooksInstallable(url) {
    if (!url) return false;
    var u = String(url);
    if (/setup\.exe/i.test(u) || /\.dmg$/i.test(u) || /\.apk$/i.test(u)) return true;
    if (/\.exe$/i.test(u) && /setup|nsis/i.test(u)) return true;
    return false;
  }

  function getPlatformAssetKind() {
    var kind = getClientKind();
    if (kind === 'android' || kind === 'android-web') return 'apk';
    if (kind === 'mac') return 'dmg';
    if (kind === 'windows' || kind === 'desktop') return 'exe';
    if (kind === 'ios-web') return 'web';
    return 'web';
  }

  function platformArtifactLabel(assetKind) {
    assetKind = assetKind || getPlatformAssetKind();
    if (assetKind === 'exe') return 'instalador Windows (.exe)';
    if (assetKind === 'dmg') return 'instalador macOS (.dmg)';
    if (assetKind === 'apk') return 'APK Android';
    return 'paquete web';
  }

  function pickMacDmgFromAssets(assets) {
    if (!Array.isArray(assets)) return '';
    var armHint = /aarch64|arm64|apple.?silicon|universal/i;
    var arm = assets.find(function (a) {
      var name = String(a.name || a.url || '');
      return /\.dmg$/i.test(name) && armHint.test(name);
    });
    if (arm) return arm.browser_download_url || arm.url || '';
    var intel = assets.find(function (a) {
      var name = String(a.name || a.url || '');
      return /\.dmg$/i.test(name) && /x64|x86_64|intel/i.test(name);
    });
    if (intel) return intel.browser_download_url || intel.url || '';
    var any = assets.find(function (a) {
      return /\.dmg$/i.test(a.name || a.url || '');
    });
    return any ? any.browser_download_url || any.url || '' : '';
  }

  /** Artefacto correcto según dispositivo (exe / dmg / apk). */
  function resolveReleaseInstallTarget(targetVersion) {
    var ver = normVersion(targetVersion);
    if (!ver) return Promise.resolve(null);
    var assetKind = getPlatformAssetKind();

    return resolveBestDownloadUrl(ver)
      .then(function (info) {
        if (info && info.downloadUrl && releaseUrlLooksInstallable(info.downloadUrl)) {
          return {
            version: normVersion(info.version || ver),
            url: info.downloadUrl,
            releasePageUrl: info.releasePageUrl,
            assetType: info.assetType || assetKind,
            verified: !!info.verified,
            source: 'platform-' + (info.assetType || assetKind),
          };
        }
        return probeReleaseArtifacts(ver).then(function (probe) {
          if (probe && probe.url && (releaseUrlLooksInstallable(probe.url) || probe.hasSignature)) {
            return {
              version: normVersion(probe.version || ver),
              url: probe.url,
              releasePageUrl: probe.releasePageUrl,
              hasSignature: !!probe.hasSignature,
              assetType: assetKind,
              source: 'latest-json',
            };
          }
          if (assetKind === 'exe' && isWindowsDesktop()) {
            var predicted = predictSetupExeUrl(ver);
            if (!predicted) return null;
            return verifySetupDownloadUrl(predicted).then(function (v) {
              if (!v.ok) return null;
              return {
                version: ver,
                url: v.url,
                bytes: v.bytes || 0,
                assetType: 'exe',
                source: 'predicted-exe',
              };
            });
          }
          return null;
        });
      })
      .catch(function () {
        return null;
      });
  }

  function waitUntilReleaseReady(targetVersion, onProgress, maxWaitMs) {
    var ver = normVersion(targetVersion);
    if (!ver) return Promise.resolve(null);
    var started = Date.now();
    maxWaitMs = typeof maxWaitMs === 'number' ? maxWaitMs : RELEASE_WAIT_MS;

    function attempt() {
      return resolveReleaseInstallTarget(ver).then(function (hit) {
        if (hit && hit.url) return hit;
        if (Date.now() - started > maxWaitMs) {
          return Promise.reject(
            new Error(
              'No se encontró el instalador v' +
                semverCore(ver) +
                ' en GitHub. Compruebe que el release exista o use Plan B (descarga manual).'
            )
          );
        }
        if (onProgress) {
          onProgress({
            phase: 'probe',
            percent: Math.min(15, 5 + Math.floor((Date.now() - started) / 4000)),
            message:
              'Buscando instalador v' + semverCore(ver) + ' en GitHub… (' +
              Math.ceil((maxWaitMs - (Date.now() - started)) / 1000) +
              ' s restantes)',
          });
        }
        return delay(RELEASE_POLL_MS).then(attempt);
      });
    }

    return attempt();
  }

  function installViaSilentSetupExe(targetVersion, onProgress, attempt) {
    if (!isWindowsDesktop()) {
      return Promise.reject(
        new Error('Instalación silenciosa (.exe) solo en Windows. En Mac use el updater automático (Plan A).')
      );
    }
    attempt = attempt || 0;
    var ver = normVersion(targetVersion);
    return resolveBestSetupUrl(ver).then(function (info) {
      var url = info && info.downloadUrl;
      if (!url || !/\.exe/i.test(url)) {
        return Promise.reject(new Error('No hay setup.exe verificado en el release de GitHub.'));
      }
      if (onProgress) {
        onProgress({
          phase: 'download',
          percent: 50 + attempt * 4,
          message:
            (info.verified ? 'Instalador verificado (' : 'Descargando instalador (') +
            (info.bytes ? fmtMb(info.bytes) + ')…' : 'en la nube)…'),
        });
      }
      var tick = null;
      var tickPct = 50 + attempt * 4;
      if (onProgress) {
        tick = setInterval(function () {
          tickPct = Math.min(88, tickPct + 2);
          onProgress({
            phase: 'download',
            percent: tickPct,
            message: 'Descargando instalador desde GitHub…',
          });
        }, 2500);
      }
      return invoke('install_setup_from_url', { url: url })
        .finally(function () {
          if (tick) clearInterval(tick);
        })
        .catch(function (invokeErr) {
          var msg = invokeErr && invokeErr.message ? invokeErr.message : String(invokeErr);
          if (/not found|unknown command|install_setup_from_url/i.test(msg)) {
            return Promise.reject(
              new Error(
                'Este ejecutable no incluye el instalador automático. Cierre la app, instale el .exe nuevo desde GitHub una vez, y las siguientes actualizaciones serán automáticas.'
              )
            );
          }
          if (attempt < SILENT_INSTALL_RETRY_MAX) {
            if (onProgress) {
              onProgress({
                phase: 'download',
                percent: 45,
                message: 'Reintentando descarga silenciosa (intento ' + (attempt + 2) + ')…',
              });
            }
            return delay(3000 * (attempt + 1)).then(function () {
              return installViaSilentSetupExe(targetVersion, onProgress, attempt + 1);
            });
          }
          return Promise.reject(invokeErr);
        })
        .then(function () {
          if (onProgress) {
            onProgress({
              phase: 'install',
              percent: 96,
              message: 'Instalador en ejecución. La app se cerrará y abrirá la versión nueva…',
            });
          }
          return delay(2500).then(function () {
            return invoke('plugin:process|exit', { code: 0 }).catch(function () {
              return { installed: true, version: ver, plan: 'C', exiting: true };
            });
          });
        });
    });
  }

  function relaunchApp() {
    if (!isTauri()) {
      try {
        global.location.reload();
      } catch (_) {}
      return Promise.resolve();
    }
    return delay(600).then(function () {
      return invoke('plugin:process|restart', {}).catch(function () {
        return invoke('plugin:process|exit', { code: 0 });
      });
    });
  }

  function pickApkFromAssets(assets) {
    if (!Array.isArray(assets)) return '';
    var preferred = assets.find(function (a) {
      var name = String(a.name || a.url || '');
      return (
        /\.apk$/i.test(name) &&
        (/aarch64|arm64|arm-v8|universal/i.test(name) || !/x86|x86_64|i686/i.test(name))
      );
    });
    if (preferred) return preferred.browser_download_url || preferred.url || '';
    var anyApk = assets.find(function (a) {
      return /\.apk$/i.test(a.name || a.url || '');
    });
    return anyApk ? anyApk.browser_download_url || anyApk.url || '' : '';
  }

  function predictApkUrl(targetVersion) {
    var ver = semverCore(targetVersion);
    if (!ver) return '';
    var candidates = [
      PRODUCT_NAME + '_' + ver + '_aarch64.apk',
      PRODUCT_NAME + '_' + ver + '_arm64-v8a.apk',
      PRODUCT_NAME + '_' + ver + '.apk',
      PRODUCT_NAME + '-v' + ver + '-aarch64.apk',
    ];
    return (
      GITHUB_RELEASE_BASE +
      '/v' +
      ver +
      '/' +
      encodeURIComponent(candidates[0])
    );
  }

  function verifyApkDownloadUrl(url) {
    url = String(url || '').trim();
    if (!url || !/^https:\/\//i.test(url)) {
      return Promise.resolve({ ok: false, reason: 'url_invalida', url: url });
    }
    var sep = url.indexOf('?') >= 0 ? '&' : '?';
    return fetch(url + sep + '_=' + Date.now(), { method: 'HEAD', cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) return { ok: false, reason: 'http_' + res.status, url: url };
        var len = parseInt(res.headers.get('content-length') || '0', 10);
        if (len > 0 && len < APK_MIN_BYTES) {
          return { ok: false, reason: 'archivo_pequeno', url: url, bytes: len };
        }
        return { ok: true, url: url, bytes: len };
      })
      .catch(function () {
        return { ok: false, reason: 'red', url: url };
      });
  }

  function pickVerifiedApkUrl(candidates) {
    var list = (candidates || []).filter(function (u) {
      return u && /^https:\/\//i.test(String(u));
    });
    var seen = {};
    list = list.filter(function (u) {
      if (seen[u]) return false;
      seen[u] = true;
      return true;
    });
    if (!list.length) return Promise.resolve(null);

    function next(i) {
      if (i >= list.length) return Promise.resolve(null);
      return verifyApkDownloadUrl(list[i]).then(function (v) {
        if (v.ok) return v;
        return next(i + 1);
      });
    }
    return next(0);
  }

  function resolveBestApkUrl(targetVersion) {
    var ver = normVersion(targetVersion);
    return resolveManualFallback(ver).then(function (info) {
      var candidates = [];
      if (Array.isArray(info.assets)) {
        var apk = pickApkFromAssets(info.assets);
        if (apk) candidates.push(apk);
      }
      var predicted = predictApkUrl(ver);
      if (predicted) candidates.push(predicted);
      if (info.downloadUrl && /\.apk$/i.test(info.downloadUrl)) candidates.push(info.downloadUrl);
      return pickVerifiedApkUrl(candidates).then(function (verified) {
        if (verified && verified.url) {
          return {
            version: ver,
            downloadUrl: verified.url,
            releasePageUrl: info.releasePageUrl || GITHUB_RELEASES_PAGE + '/tag/' + ver,
            verified: true,
            bytes: verified.bytes || 0,
            assetType: 'apk',
          };
        }
        return {
          version: ver,
          downloadUrl: pickApkFromAssets(info.assets) || predicted || info.releasePageUrl || GITHUB_RELEASES_LATEST,
          releasePageUrl: info.releasePageUrl || GITHUB_RELEASES_LATEST,
          verified: false,
          bytes: 0,
          assetType: 'apk',
        };
      });
    });
  }

  function resolveBestDownloadUrl(targetVersion) {
    var kind = getClientKind();
    if (kind === 'android' || kind === 'android-web') return resolveBestApkUrl(targetVersion);
    if (kind === 'mac') {
      return resolveManualFallback(targetVersion).then(function (info) {
        var dmg =
          pickBestAssetUrl(null, info.assets) ||
          (info.downloadUrl && /\.dmg$/i.test(info.downloadUrl) ? info.downloadUrl : '');
        return {
          version: info.version || normVersion(targetVersion),
          downloadUrl: dmg || info.downloadUrl || info.releasePageUrl,
          releasePageUrl: info.releasePageUrl || GITHUB_RELEASES_PAGE,
          verified: !!dmg,
          assetType: 'dmg',
        };
      });
    }
    if (kind === 'windows' || kind === 'desktop') {
      return resolveBestSetupUrl(targetVersion).then(function (info) {
        info.assetType = 'exe';
        return info;
      });
    }
    return resolveManualFallback(targetVersion).then(function (info) {
      info.assetType = 'release';
      return info;
    });
  }

  function pickBestAssetUrl(platformEntry, assets) {
    if (Array.isArray(assets) && prefersApkDownload()) {
      var apkUrl = pickApkFromAssets(assets);
      if (apkUrl) return apkUrl;
    }
    if (platformEntry && platformEntry.url) {
      if (/\.exe$/i.test(platformEntry.url) && /setup/i.test(platformEntry.url)) {
        return platformEntry.url;
      }
      if (/\.dmg$/i.test(platformEntry.url)) {
        return platformEntry.url;
      }
      if (/\.apk$/i.test(platformEntry.url)) {
        return platformEntry.url;
      }
    }
    if (Array.isArray(assets)) {
      if (isMacDesktop()) {
        var dmgUrl = pickMacDmgFromAssets(assets);
        if (dmgUrl) return dmgUrl;
      }
      var setupExe = assets.find(function (a) {
        return /\.exe$/i.test(a.name || a.url || '') && /setup/i.test(a.name || '');
      });
      if (setupExe) return setupExe.browser_download_url || setupExe.url;
      var anyExe = assets.find(function (a) {
        return /\.exe$/i.test(a.name || a.url || '');
      });
      if (anyExe) return anyExe.browser_download_url || anyExe.url;
      var msi = assets.find(function (a) {
        return /\.msi$/i.test(a.name || a.url || '');
      });
      if (msi) return msi.browser_download_url || msi.url;
    }
    if (platformEntry && platformEntry.url) return platformEntry.url;
    return '';
  }

  function probeReleaseArtifacts(targetVersion) {
    var ver = semverCore(targetVersion);
    if (!ver) return Promise.resolve(null);
    var url = GITHUB_RELEASE_BASE + '/v' + ver + '/latest.json?_=' + Date.now();
    return fetch(url, { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) return null;
        return res.json();
      })
      .then(function (data) {
        if (!data || !data.platforms) return null;
        var p = pickPlatformEntry(data.platforms);
        if (p && p.url && /\.msi$/i.test(p.url) && isWindowsDesktop()) {
          var nsis = data.platforms['windows-x86_64-nsis'];
          if (nsis && nsis.url) p = nsis;
        }
        if (!p || !p.signature) return null;
        return {
          version: normVersion(data.version || ver),
          url: p.url || '',
          hasSignature: !!p.signature,
          releaseTag: 'v' + ver,
          releasePageUrl: GITHUB_RELEASES_PAGE + '/tag/v' + ver,
          platform: getClientKind(),
        };
      })
      .catch(function () {
        return null;
      });
  }

  function fetchReleaseAssets(targetVersion) {
    var tag = 'v' + semverCore(targetVersion);
    return fetch(GITHUB_API_RELEASE + tag + '?_=' + Date.now(), {
      cache: 'no-store',
      headers: { Accept: 'application/vnd.github+json' },
    })
      .then(function (res) {
        if (!res.ok) return null;
        return res.json();
      })
      .then(function (data) {
        if (!data) return null;
        var assets = (data.assets || []).map(function (a) {
          return { name: a.name, url: a.browser_download_url, size: a.size };
        });
        var downloadUrl = pickBestAssetUrl(null, assets);
        return {
          version: normVersion(data.tag_name || tag),
          tag: data.tag_name || tag,
          downloadUrl: downloadUrl,
          releasePageUrl: data.html_url || GITHUB_RELEASES_PAGE + '/tag/' + tag,
          assets: assets,
        };
      })
      .catch(function () {
        return null;
      });
  }

  function resolveManualFallback(targetVersion) {
    var ver = normVersion(targetVersion);
    return probeReleaseArtifacts(ver)
      .then(function (probe) {
        return fetchReleaseAssets(ver).then(function (api) {
          var downloadUrl =
            (api && api.downloadUrl) ||
            (probe && probe.url) ||
            predictSetupExeUrl(ver) ||
            GITHUB_RELEASES_LATEST;
          return {
            version: ver,
            tag: (api && api.tag) || ver,
            downloadUrl: downloadUrl,
            releasePageUrl:
              (api && api.releasePageUrl) ||
              (probe && probe.releasePageUrl) ||
              GITHUB_RELEASES_LATEST,
            assets: (api && api.assets) || [],
            fromProbe: !!probe,
            fromApi: !!api,
          };
        });
      })
      .catch(function () {
        return {
          version: ver,
          tag: ver,
          downloadUrl: GITHUB_RELEASES_LATEST,
          releasePageUrl: GITHUB_RELEASES_LATEST,
          assets: [],
          fromProbe: false,
          fromApi: false,
        };
      });
  }

  function attachManual(err, manual) {
    var e = err instanceof Error ? err : new Error(String(err));
    e.manualFallback = manual || null;
    return e;
  }

  function fmtMb(bytes) {
    if (!bytes) return '';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function runDownloadInstall(meta, ver, current, onProgress, toast, attempt) {
    attempt = attempt || 0;
    var downloaded = 0;
    var total = 0;

    return downloadAndInstallUpdate(meta, function (event) {
      if (!event || !event.event) return;
      if (event.event === 'Started' && event.data) {
        total = event.data.contentLength || 0;
        onProgress({
          phase: 'download',
          percent: 18,
          message: total
            ? 'Descargando paquete (' + fmtMb(total) + ')…'
            : 'Descargando paquete…',
        });
      }
      if (event.event === 'Progress' && event.data) {
        downloaded += event.data.chunkLength || 0;
        var pct = total > 0 ? Math.min(88, 18 + Math.round((downloaded / total) * 70)) : 45;
        onProgress({
          phase: 'download',
          percent: pct,
          message: total
            ? 'Descargando ' + fmtMb(downloaded) + ' / ' + fmtMb(total)
            : 'Descargando actualización…',
        });
      }
      if (event.event === 'Finished') {
        onProgress({
          phase: 'install',
          percent: 92,
          message: 'Instalando en este equipo (silencioso)…',
        });
      }
    })
      .then(function () {
        if (toast) toast('Instalación lista. Reiniciando…', 'success');
        onProgress({
          phase: 'relaunch',
          percent: 98,
          message: 'Reiniciando con la interfaz nueva…',
        });
        return relaunchApp().then(function () {
          return { installed: true, version: ver, previous: current, plan: 'A' };
        });
      })
      .catch(function (err) {
        if (attempt < 2) {
          onProgress({
            phase: 'download',
            percent: 12,
            message: 'Reintentando descarga automática (intento ' + (attempt + 2) + ' de 3)…',
          });
          return delay(2500 * (attempt + 1)).then(function () {
            return runDownloadInstall(meta, ver, current, onProgress, toast, attempt + 1);
          });
        }
        return Promise.reject(err);
      });
  }

  function trySilentSetupInstall(targetVersion, ver, currentVer, onProgress, opts) {
    if (opts.allowSilentSetup === false || !isWindowsDesktop()) {
      return Promise.reject(new Error('Instalación silenciosa (.exe) solo en Windows.'));
    }
    onProgress({
      phase: 'download',
      percent: 28,
      message:
        'Windows: descargando v' +
        semverCore(targetVersion || ver) +
        ' (.exe, ~8 MB, 1–3 min)…',
    });
    return installViaSilentSetupExe(targetVersion || ver, onProgress).then(function () {
      return {
        installed: true,
        version: normVersion(ver || targetVersion),
        previous: currentVer,
        plan: 'C',
        exiting: true,
      };
    });
  }

  function probePlatformInstallerCommand() {
    if (!isTauri()) return Promise.resolve({ ok: false, platform: 'none' });
    return invoke('probe_platform_installer')
      .then(function (p) {
        return { ok: true, platform: p };
      })
      .catch(function (err) {
        return { ok: false, platform: 'unknown', error: err && err.message ? err.message : String(err) };
      });
  }

  function installViaSilentDmgMac(targetVersion, onProgress, attempt) {
    if (!isMacDesktop()) {
      return Promise.reject(new Error('Instalación automática .dmg solo en macOS.'));
    }
    attempt = attempt || 0;
    var ver = normVersion(targetVersion);
    return resolveBestDownloadUrl(ver).then(function (info) {
      var dmg = info && info.downloadUrl && /\.dmg$/i.test(info.downloadUrl) ? info.downloadUrl : '';
      if (!dmg) {
        return Promise.reject(new Error('No hay .dmg para macOS en GitHub.'));
      }
      if (onProgress) {
        onProgress({
          phase: 'download',
          percent: 30 + attempt * 5,
          message: 'macOS: descargando e instalando v' + semverCore(ver) + ' automáticamente…',
        });
      }
      return invoke('install_dmg_from_url', { url: dmg })
        .catch(function (invokeErr) {
          var msg = invokeErr && invokeErr.message ? invokeErr.message : String(invokeErr);
          if (attempt < SILENT_INSTALL_RETRY_MAX) {
            return delay(3000 * (attempt + 1)).then(function () {
              return installViaSilentDmgMac(targetVersion, onProgress, attempt + 1);
            });
          }
          return Promise.reject(invokeErr || new Error(msg));
        })
        .then(function () {
          if (onProgress) {
            onProgress({
              phase: 'install',
              percent: 96,
              message: 'Instalación en /Applications completada. Reiniciando…',
            });
          }
          return delay(1200).then(function () {
            return invoke('plugin:process|exit', { code: 0 }).catch(function () {
              return { installed: true, version: ver, plan: 'D', exiting: true };
            });
          });
        });
    });
  }

  function tryMacDmgInstall(targetVersion, ver, currentVer, onProgress, opts) {
    opts = opts || {};
    if (opts.automaticOnly !== false) {
      return installViaSilentDmgMac(targetVersion || ver, onProgress).then(function () {
        return {
          installed: true,
          version: normVersion(ver || targetVersion),
          previous: currentVer,
          plan: 'D',
          exiting: true,
        };
      });
    }
    return resolveBestDownloadUrl(targetVersion || ver).then(function (info) {
      var dmg = info && info.downloadUrl && /\.dmg$/i.test(info.downloadUrl) ? info.downloadUrl : '';
      if (!dmg) return Promise.reject(new Error('No hay .dmg para macOS.'));
      return openExternalUrl(dmg).then(function (ok) {
        if (!ok) return Promise.reject(new Error('No se pudo abrir el .dmg.'));
        return {
          installed: false,
          version: normVersion(ver || targetVersion),
          previous: currentVer,
          plan: 'dmg_download',
          downloadUrl: dmg,
          needsManualInstall: true,
        };
      });
    });
  }

  function tryPlatformFallback(err, ver, currentVer, onProgress, opts, targetVer) {
    var tv = targetVer || ver;
    opts = opts || {};
    if (isWindowsDesktop()) {
      return trySilentSetupInstall(tv, ver, currentVer, onProgress, opts);
    }
    if (isMacDesktop()) {
      return tryMacDmgInstall(tv, ver, currentVer, onProgress, opts).catch(function (macErr) {
        if (opts.automaticOnly !== false) {
          return Promise.reject(macErr || err);
        }
        return resolveManualFallback(tv).then(function (manual) {
          return Promise.reject(attachManual(macErr || err, manual));
        });
      });
    }
    if (opts.automaticOnly !== false) {
      return Promise.reject(err || new Error('Plataforma sin instalador automático.'));
    }
    return resolveManualFallback(tv).then(function (manual) {
      return Promise.reject(attachManual(err, manual));
    });
  }

  function artifactMatchesPlatform(url, kind) {
    if (!url) return false;
    if (kind === 'exe') return /setup\.exe/i.test(url);
    if (kind === 'dmg') return /\.dmg$/i.test(url);
    if (kind === 'apk') return /\.apk$/i.test(url);
    return false;
  }

  function validateArtifactForPlatform(hit, kind) {
    if (!hit || !hit.url) {
      return { ok: false, reason: 'sin_url', message: 'No hay instalador en GitHub para esta versión.' };
    }
    if (!artifactMatchesPlatform(hit.url, kind)) {
      return {
        ok: false,
        reason: 'incompatible',
        message:
          'El release no trae el paquete correcto para ' +
          platformArtifactLabel(kind) +
          ' (URL: ' +
          hit.url.split('/').pop() +
          ').',
      };
    }
    var minB = MIN_ARTIFACT_BYTES[kind] || 0;
    if (hit.bytes && hit.bytes > 0 && hit.bytes < minB) {
      return {
        ok: false,
        reason: 'pequeno',
        message: 'Archivo demasiado pequeño o corrupto (' + hit.bytes + ' bytes).',
      };
    }
    return { ok: true };
  }

  function ensureInstallTargetReady(targetVersion) {
    var kind = getPlatformAssetKind();
    var ver = normVersion(targetVersion);
    return resolveReleaseInstallTarget(ver).then(function (hit) {
      var v = validateArtifactForPlatform(hit, kind);
      if (!v.ok) {
        return Promise.reject(new Error(v.message || 'Artefacto no válido para esta plataforma.'));
      }
      return hit;
    });
  }

  /** Comprueba Win + Mac + APK en GitHub (estabilidad del release completo). */
  function checkReleaseMultiplatformStability(targetVersion) {
    var ver = normVersion(targetVersion);
    return fetchReleaseAssets(ver).then(function (api) {
      var assets = (api && api.assets) || [];
      var setup = assets.find(function (a) {
        return /setup\.exe/i.test(a.name || '');
      });
      var dmgArm = assets.find(function (a) {
        return /\.dmg$/i.test(a.name || '') && /aarch64|arm64|universal/i.test(a.name || '');
      });
      var dmgX64 = assets.find(function (a) {
        return /\.dmg$/i.test(a.name || '') && /x86_64|intel|x64/i.test(a.name || '');
      });
      var dmgAny = assets.find(function (a) {
        return /\.dmg$/i.test(a.name || '');
      });
      var apk = pickApkFromAssets(assets);
      var winOk = setup && (!setup.size || setup.size >= MIN_ARTIFACT_BYTES.exe);
      var macOk =
        (dmgArm && (!dmgArm.size || dmgArm.size >= MIN_ARTIFACT_BYTES.dmg)) ||
        (dmgX64 && (!dmgX64.size || dmgX64.size >= MIN_ARTIFACT_BYTES.dmg)) ||
        (dmgAny && (!dmgAny.size || dmgAny.size >= MIN_ARTIFACT_BYTES.dmg));
      var apkOk = apk && (!apk.size || apk.size >= MIN_ARTIFACT_BYTES.apk);
      return {
        version: ver,
        tagFound: !!api,
        windows: !!winOk,
        mac: !!macOk,
        android: !!apkOk,
        complete: !!(winOk && macOk && apkOk),
        majorityStable: [winOk, macOk, apkOk].filter(Boolean).length >= 2,
      };
    });
  }

  /**
   * Instalación totalmente automática según plataforma (exe / dmg / updater).
   */
  function installAutomatic(opts) {
    opts = opts || {};
    opts.automaticOnly = opts.automaticOnly !== false;
    opts.preferSilentSetup = opts.preferSilentSetup !== false;
    opts.skipReleaseWait = opts.skipReleaseWait !== false;
    var kind = getPlatformAssetKind();
    var targetVersion = opts.targetVersion ? normVersion(opts.targetVersion) : '';
    var onProgress = opts.onProgress || function () {};

    return getAppVersion().then(function (current) {
      if (targetVersion && current && compareSemver(targetVersion, current) < 0) {
        return Promise.reject(
          new Error(
            'La versión ' +
              targetVersion +
              ' es anterior a la instalada (' +
              current +
              '). No se permite retroceder.'
          )
        );
      }
      if (targetVersion && current && compareSemver(targetVersion, current) <= 0) {
        return { installed: false, upToDate: true, current: current, plan: 'none' };
      }
      var readyP = targetVersion ? ensureInstallTargetReady(targetVersion) : Promise.resolve(null);
      return readyP.then(function () {
      if (kind === 'exe' && targetVersion) {
        onProgress({ phase: 'probe', percent: 5, message: 'Windows: instalación automática…' });
        return trySilentSetupInstall(targetVersion, targetVersion, current, onProgress, opts).catch(
          function (silentErr) {
            return installLatestBinary(
              Object.assign({}, opts, { automaticOnly: false, preferSilentSetup: false, skipReleaseWait: true })
            ).catch(function (planErr) {
              return Promise.reject(planErr || silentErr);
            });
          }
        );
      }
      if (kind === 'dmg' && targetVersion) {
        onProgress({ phase: 'probe', percent: 5, message: 'macOS: instalación automática…' });
        return tryMacDmgInstall(targetVersion, targetVersion, current, onProgress, opts);
      }
      return installLatestBinary(opts);
      });
    });
  }

  /**
   * Plan C (Windows): setup.exe silencioso — más fiable y rápido.
   * Plan A: updater Tauri firmado.
   * Plan B: resolveManualFallback() si falla.
   */
  function installLatestBinary(opts) {
    opts = opts || {};
    if (!isTauri()) {
      return Promise.reject(new Error('Solo disponible en la app de escritorio (Tauri)'));
    }
    if (!canUseTauriUpdater()) {
      return Promise.reject(
        new Error('En Android use la descarga del APK desde Actualizaciones del sistema.')
      );
    }

    var toast = !opts.silent && typeof global.showToast === 'function' ? global.showToast : null;
    var onProgress = opts.onProgress || function () {};
    var targetVersion = opts.targetVersion ? normVersion(opts.targetVersion) : '';
    var skipWait = !!opts.skipReleaseWait;
    var assetKind = getPlatformAssetKind();
    var preferSilent = opts.preferSilentSetup !== false && assetKind === 'exe' && !!targetVersion;

    if (toast) toast('Preparando actualización automática…', 'info');
    onProgress({
      phase: 'probe',
      percent: 2,
      message: 'Buscando ' + platformArtifactLabel(assetKind) + ' en GitHub…',
    });

    function trySilentFallback(err, ver, currentVer) {
      if (!targetVersion && !ver) return Promise.reject(err);
      return tryPlatformFallback(err, ver, currentVer, onProgress, opts, targetVersion);
    }

    function runPlanA(current, releaseHit) {
      if (releaseHit) {
        onProgress({
          phase: 'probe',
          percent: 10,
          message: 'Instalador v' + semverCore(releaseHit.version || targetVersion) + ' listo.',
        });
      }

      onProgress({ phase: 'check', percent: 14, message: 'Comprobando firma con el servidor…' });

      return checkForAppUpdateWithRetry({ timeout: UPDATER_CHECK_TIMEOUT_MS })
        .catch(function (err) {
          if (isRecoverableUpdaterError(err)) {
            return trySilentFallback(err, targetVersion, current);
          }
          return Promise.reject(err);
        })
        .then(function (meta) {
          if (meta && meta.plan === 'C') return meta;
          if (!meta) {
            if (targetVersion && current && compareSemver(targetVersion, current) > 0) {
              return trySilentFallback(
                new Error('Updater sin paquete nuevo'),
                targetVersion,
                current
              );
            }
            onProgress({ phase: 'check', percent: 100, message: 'Este equipo ya está al día.' });
            return { installed: false, upToDate: true, current: current, plan: 'A' };
          }

          var ver = normVersion(meta.version || '');
          if (targetVersion && compareSemver(ver, targetVersion) < 0) {
            return trySilentFallback(
              new Error('GitHub publicó ' + ver + ' pero se requiere ' + targetVersion),
              targetVersion,
              current
            );
          }

          if (
            releaseHit &&
            releaseHit.url &&
            ((assetKind === 'exe' && /setup\.exe/i.test(releaseHit.url)) ||
              (assetKind === 'dmg' && /\.dmg$/i.test(releaseHit.url)))
          ) {
            return trySilentFallback(null, ver || targetVersion, current);
          }

          if (toast) toast('Descargando versión ' + ver + '…', 'info');
          onProgress({
            phase: 'download',
            percent: 18,
            message: 'Descargando actualización firmada…',
          });

          return runDownloadInstall(meta, ver, current, onProgress, toast, 0).catch(function (err) {
            return trySilentFallback(err, ver, current);
          });
        });
    }

    return getAppVersion()
      .then(function (current) {
        if (targetVersion && current && compareSemver(targetVersion, current) <= 0) {
          onProgress({ phase: 'check', percent: 100, message: 'Versión actual: ' + current });
          return { installed: false, upToDate: true, current: current, plan: 'A' };
        }

        var resolveP = targetVersion
          ? resolveReleaseInstallTarget(targetVersion)
          : Promise.resolve(null);
        var waitP =
          targetVersion && !skipWait && !preferSilent
            ? waitUntilReleaseReady(targetVersion, onProgress, opts.maxWaitMs)
            : Promise.resolve(null);

        return Promise.all([resolveP, waitP]).then(function (parts) {
          var hit = parts[0] || parts[1];

          if (preferSilent && targetVersion && compareSemver(targetVersion, current) > 0) {
            if (hit && hit.url && /setup\.exe/i.test(hit.url)) {
              return trySilentSetupInstall(targetVersion, targetVersion, current, onProgress, opts);
            }
            return waitUntilReleaseReady(targetVersion, onProgress, opts.maxWaitMs || RELEASE_WAIT_MS).then(
              function (hit2) {
                if (hit2 && hit2.url && /setup\.exe/i.test(hit2.url)) {
                  return trySilentSetupInstall(targetVersion, targetVersion, current, onProgress, opts);
                }
                return trySilentFallback(
                  new Error('No hay instalador .exe para Windows en el release'),
                  targetVersion,
                  current
                );
              }
            );
          }

          if (
            assetKind === 'dmg' &&
            targetVersion &&
            compareSemver(targetVersion, current) > 0 &&
            hit &&
            hit.url &&
            /\.dmg$/i.test(hit.url)
          ) {
            return runPlanA(current, hit).catch(function (planErr) {
              return tryMacDmgInstall(targetVersion, targetVersion, current, onProgress).catch(function () {
                return Promise.reject(planErr);
              });
            });
          }

          return runPlanA(current, hit);
        });
      })
      .catch(function (err) {
        onProgress({
          phase: 'error',
          percent: 0,
          message: err && err.message ? err.message : String(err),
        });
        return Promise.reject(err);
      });
  }

  global.CrozzoTauriUpdater = {
    isAvailable: isTauri,
    canUseTauriUpdater: canUseTauriUpdater,
    getClientKind: getClientKind,
    getPlatformAssetKind: getPlatformAssetKind,
    platformArtifactLabel: platformArtifactLabel,
    prefersApkDownload: prefersApkDownload,
    prefersWebReload: prefersWebReload,
    isWindowsDesktop: isWindowsDesktop,
    isMacDesktop: isMacDesktop,
    isAndroidTablet: isAndroidTablet,
    getVersion: getAppVersion,
    check: checkForAppUpdate,
    resolveReleaseInstallTarget: resolveReleaseInstallTarget,
    probeRelease: probeReleaseArtifacts,
    waitUntilReleaseReady: waitUntilReleaseReady,
    fetchReleaseAssets: fetchReleaseAssets,
    resolveManualFallback: resolveManualFallback,
    resolveBestSetupUrl: resolveBestSetupUrl,
    resolveBestApkUrl: resolveBestApkUrl,
    resolveBestDownloadUrl: resolveBestDownloadUrl,
    pickApkFromAssets: pickApkFromAssets,
    verifySetupDownloadUrl: verifySetupDownloadUrl,
    verifyApkDownloadUrl: verifyApkDownloadUrl,
    predictSetupExeUrl: predictSetupExeUrl,
    openExternalUrl: openExternalUrl,
    installLatest: installLatestBinary,
    installAutomatic: installAutomatic,
    ensureInstallTargetReady: ensureInstallTargetReady,
    checkReleaseMultiplatformStability: checkReleaseMultiplatformStability,
    validateArtifactForPlatform: validateArtifactForPlatform,
    installViaSilentSetup: installViaSilentSetupExe,
    installViaSilentDmg: installViaSilentDmgMac,
    probePlatformInstaller: probePlatformInstallerCommand,
    isSignatureMismatchError: isSignatureMismatchError,
    relaunch: relaunchApp,
    compareSemver: compareSemver,
    releasesLatestUrl: GITHUB_RELEASES_LATEST,
    releasesPageUrl: GITHUB_RELEASES_PAGE,
  };
})(window);
