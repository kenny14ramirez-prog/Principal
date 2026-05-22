/**
 * Crozzo POS — Instalador nativo Tauri (plugin-updater + relaunch)
 * Usa __TAURI__.core.invoke (sin bundler).
 */
(function (global) {
  'use strict';

  function isTauri() {
    return !!(global.__TAURI__ && global.__TAURI__.core && global.__TAURI__.core.invoke);
  }

  function invoke(cmd, args) {
    return global.__TAURI__.core.invoke(cmd, args || {});
  }

  function createProgressChannel(onEvent) {
    if (!global.__TAURI__.core.Channel) return undefined;
    var ch = new global.__TAURI__.core.Channel();
    if (onEvent) ch.onmessage = onEvent;
    return ch;
  }

  function checkForAppUpdate(opts) {
    if (!isTauri()) return Promise.resolve(null);
    return invoke('plugin:updater|check', opts || {}).then(function (meta) {
      return meta || null;
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
    return invoke('plugin:process|restart', {});
  }

  /**
   * Descarga e instala el .exe desde GitHub Releases (tauri-latest.json).
   * onProgress: function({ phase, percent, message })
   */
  function installLatestBinary(opts) {
    opts = opts || {};
    if (!isTauri()) {
      return Promise.reject(new Error('Solo disponible en la app de escritorio (Tauri)'));
    }

    var toast = typeof global.showToast === 'function' ? global.showToast : null;
    var onProgress = opts.onProgress || function () {};

    if (toast) toast('Buscando instalador en GitHub…', 'info');
    onProgress({ phase: 'check', percent: 0, message: 'Comprobando versión…' });

    return checkForAppUpdate({ timeout: 120000 })
      .then(function (meta) {
        if (!meta) {
          onProgress({ phase: 'done', percent: 100, message: 'Ya tiene la última versión del instalador.' });
          return { installed: false, upToDate: true };
        }
        var ver = meta.version || '';
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
        }).then(function () {
          if (toast) toast('Instalación lista. Reiniciando Crozzo POS…', 'success');
          onProgress({ phase: 'relaunch', percent: 100, message: 'Reiniciando…' });
          return relaunchApp().then(function () {
            return { installed: true, version: ver };
          });
        });
      });
  }

  global.CrozzoTauriUpdater = {
    isAvailable: isTauri,
    check: checkForAppUpdate,
    installLatest: installLatestBinary,
    relaunch: relaunchApp,
  };
})(window);
