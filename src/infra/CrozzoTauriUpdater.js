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

  function isTauri() {
    return !!(global.__TAURI__ && global.__TAURI__.core && global.__TAURI__.core.invoke);
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

  function pickBestAssetUrl(platformEntry, assets) {
    if (platformEntry && platformEntry.url) {
      if (/\.exe$/i.test(platformEntry.url) && /setup/i.test(platformEntry.url)) {
        return platformEntry.url;
      }
    }
    if (Array.isArray(assets)) {
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
        var p =
          data.platforms['windows-x86_64-nsis'] ||
          data.platforms['windows-x86_64'] ||
          data.platforms['windows-x86_64-msi'] ||
          data.platforms['darwin-aarch64'] ||
          data.platforms['darwin-x86_64'];
        if (p && p.url && /\.msi$/i.test(p.url)) {
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
        if (attempt < 1) {
          onProgress({
            phase: 'download',
            percent: 12,
            message: 'Reintentando descarga automática (intento 2 de 2)…',
          });
          return delay(2500).then(function () {
            return runDownloadInstall(meta, ver, current, onProgress, toast, attempt + 1);
          });
        }
        return Promise.reject(err);
      });
  }

  /**
   * Plan A: updater Tauri firmado desde GitHub Releases.
   * Plan B: resolveManualFallback() si falla o no hay meta.
   */
  function installLatestBinary(opts) {
    opts = opts || {};
    if (!isTauri()) {
      return Promise.reject(new Error('Solo disponible en la app de escritorio (Tauri)'));
    }

    var toast = !opts.silent && typeof global.showToast === 'function' ? global.showToast : null;
    var onProgress = opts.onProgress || function () {};
    var targetVersion = opts.targetVersion ? normVersion(opts.targetVersion) : '';

    if (toast) toast('Preparando actualización automática…', 'info');
    onProgress({ phase: 'probe', percent: 2, message: 'Verificando paquete en la nube…' });

    return getAppVersion()
      .then(function (current) {
        var probeP = targetVersion ? probeReleaseArtifacts(targetVersion) : Promise.resolve(null);

        return probeP.then(function (probe) {
          if (probe) {
            onProgress({
              phase: 'probe',
              percent: 8,
              message: 'Instalador ' + (probe.version || targetVersion) + ' verificado.',
            });
          } else if (targetVersion) {
            onProgress({
              phase: 'probe',
              percent: 6,
              message:
                'Instalador v' +
                semverCore(targetVersion) +
                ' aún no verificado; intentando updater automático…',
            });
          }

          onProgress({ phase: 'check', percent: 12, message: 'Comprobando actualización con el servidor…' });

          return checkForAppUpdate({ timeout: 120000 }).then(function (meta) {
            if (!meta) {
              if (targetVersion && current && compareSemver(targetVersion, current) > 0) {
                return resolveManualFallback(targetVersion).then(function (manual) {
                  return Promise.reject(
                    attachManual(
                      new Error(
                        'Plan A: el updater no encontró un .exe más nuevo (actual ' +
                          current +
                          ', requerido ' +
                          targetVersion +
                          '). Use Plan B para descargar manualmente.'
                      ),
                      manual
                    )
                  );
                });
              }
              onProgress({ phase: 'check', percent: 100, message: 'Este equipo ya está al día.' });
              return { installed: false, upToDate: true, current: current, plan: 'A' };
            }

            var ver = normVersion(meta.version || '');
            if (targetVersion && compareSemver(ver, targetVersion) < 0) {
              return resolveManualFallback(targetVersion).then(function (manual) {
                return Promise.reject(
                  attachManual(
                    new Error(
                      'GitHub tiene ' +
                        ver +
                        ' pero el manifiesto OTA pide ' +
                        targetVersion +
                        '. Espere la compilación o use Plan B.'
                    ),
                    manual
                  )
                );
              });
            }

            if (toast) toast('Descargando versión ' + ver + '…', 'info');
            onProgress({
              phase: 'download',
              percent: 15,
              message: 'Descargando ' + ver + ' de forma segura…',
            });

            return runDownloadInstall(meta, ver, current, onProgress, toast, 0).catch(function (err) {
              return resolveManualFallback(targetVersion || ver).then(function (manual) {
                return Promise.reject(attachManual(err, manual));
              });
            });
          });
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
    getVersion: getAppVersion,
    check: checkForAppUpdate,
    probeRelease: probeReleaseArtifacts,
    fetchReleaseAssets: fetchReleaseAssets,
    resolveManualFallback: resolveManualFallback,
    openExternalUrl: openExternalUrl,
    installLatest: installLatestBinary,
    relaunch: relaunchApp,
    compareSemver: compareSemver,
    releasesLatestUrl: GITHUB_RELEASES_LATEST,
    releasesPageUrl: GITHUB_RELEASES_PAGE,
  };
})(window);
