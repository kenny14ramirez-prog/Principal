/**
 * Crozzo POS — Instalador nativo Tauri (plugin-updater + relaunch)
 */
(function (global) {
  'use strict';

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

  function parseSemver(v) {
    var s = String(v || '').replace(/^v/i, '');
    var core = s.split('-')[0];
    var parts = core.split('.').map(function (n) {
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
    if (!isTauri()) return Promise.resolve(null);
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

  function downloadAndInstallUpdate(meta, onEvent, opts) {
    if (!meta || meta.rid == null) {
      return Promise.reject(new Error('Sin metadatos de actualización Tauri'));
    }
    var payload = { rid: meta.rid };
    if (opts && opts.headers) payload.headers = opts.headers;
    var ch = createProgressChannel(onEvent);
    if (ch) payload.onEvent = ch;
    return invoke('plugin:updater|download_and_install', payload);
  }

  function relaunchApp() {
    if (!isTauri()) {
      global.location.reload();
      return Promise.resolve();
    }
    return invoke('plugin:process|restart', {}).catch(function () {
      return invoke('plugin:process|exit', { code: 0 });
    });
  }

  /**
   * Descarga e instala el .exe desde GitHub Releases.
   * opts.targetVersion — versión OTA esperada (ej. v1.0.17); valida que realmente haya .exe nuevo.
   */
  function installLatestBinary(opts) {
    opts = opts || {};
    if (!isTauri()) {
      return Promise.reject(new Error('Solo disponible en la app de escritorio (Tauri)'));
    }

    var toast = typeof global.showToast === 'function' ? global.showToast : null;
    var onProgress = opts.onProgress || function () {};
    var targetVersion = opts.targetVersion ? normVersion(opts.targetVersion) : '';

    if (toast) toast('Buscando instalador en GitHub…', 'info');
    onProgress({ phase: 'check', percent: 0, message: 'Comprobando versión del ejecutable…' });

    return getAppVersion()
      .then(function (current) {
        return checkForAppUpdate({ timeout: 120000 }).then(function (meta) {
          if (!meta) {
            onProgress({
              phase: 'done',
              percent: 100,
              message: 'Sin .exe nuevo en GitHub Releases.',
            });
            if (targetVersion && current && compareSemver(targetVersion, current) > 0) {
              return Promise.reject(
                new Error(
                  'Hay aviso ' +
                    targetVersion +
                    ' pero GitHub aún no tiene ese instalador (ejecutable actual ' +
                    current +
                    '). Espere a que termine GitHub Actions o republique.'
                )
              );
            }
            return { installed: false, upToDate: true, current: current };
          }

          var ver = normVersion(meta.version || '');
          if (toast) toast('Descargando Crozzo POS ' + ver + '…', 'info');
          onProgress({ phase: 'download', percent: 5, message: 'Descargando ' + ver + '…' });

          var downloaded = 0;
          var total = 0;

          return downloadAndInstallUpdate(meta, function (event) {
            if (!event || !event.event) return;
            if (event.event === 'Started' && event.data) {
              total = event.data.contentLength || 0;
            }
            if (event.event === 'Progress' && event.data) {
              downloaded += event.data.chunkLength || 0;
              var pct = total > 0 ? Math.min(99, Math.round((downloaded / total) * 100)) : 50;
              onProgress({ phase: 'download', percent: pct, message: 'Descargando…' });
            }
            if (event.event === 'Finished') {
              onProgress({ phase: 'install', percent: 100, message: 'Instalando…' });
            }
          })
            .then(function () {
              if (toast) toast('Instalación lista. Reiniciando Crozzo POS…', 'success');
              onProgress({ phase: 'relaunch', percent: 100, message: 'Reiniciando con interfaz nueva…' });
              return relaunchApp().then(function () {
                return { installed: true, version: ver, previous: current };
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
        });
      });
  }

  global.CrozzoTauriUpdater = {
    isAvailable: isTauri,
    getVersion: getAppVersion,
    check: checkForAppUpdate,
    installLatest: installLatestBinary,
    relaunch: relaunchApp,
    compareSemver: compareSemver,
  };
})(window);
