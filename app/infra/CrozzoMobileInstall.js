/**
 * Crozzo POS — QR de descarga app móvil (Android APK + iPhone/iPad web o App Store).
 */
(function (global) {
  'use strict';

  var LS_WEB_BASE = 'crozzo_mobile_web_base_v1';
  var LS_IOS_STORE = 'crozzo_ios_app_store_url_v1';
  var MANIFEST_URL =
    'https://raw.githubusercontent.com/kenny14ramirez-prog/Principal/main/releases/latest.json';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function lsGet(key) {
    try {
      return localStorage.getItem(key) || '';
    } catch (_) {
      return '';
    }
  }

  function lsSet(key, val) {
    try {
      localStorage.setItem(key, String(val || ''));
      return true;
    } catch (_) {
      return false;
    }
  }

  function getWebAppBaseUrl() {
    var saved = String(lsGet(LS_WEB_BASE) || '').trim();
    if (/^https?:\/\//i.test(saved)) return saved.replace(/\/+$/, '');
    try {
      if (global.location && /^https?:\/\//i.test(global.location.href)) {
        var u = new URL(global.location.href);
        var path = u.pathname || '/';
        if (/\.html$/i.test(path)) path = path.replace(/[^/]+$/, '');
        if (!path.endsWith('/')) path += '/';
        return (u.origin + path).replace(/\/+$/, '');
      }
    } catch (_) {}
    return '';
  }

  function getIosInstallUrl(webBase) {
    var store = String(lsGet(LS_IOS_STORE) || '').trim();
    if (/^https?:\/\//i.test(store)) return store;
    webBase = webBase || getWebAppBaseUrl();
    if (webBase) return webBase.replace(/\/+$/, '') + '/index.html';
    var TU = global.CrozzoTauriUpdater;
    return TU && TU.releasesPageUrl ? TU.releasesPageUrl : '';
  }

  function getMobileLandingUrl(webBase) {
    webBase = webBase || getWebAppBaseUrl();
    if (webBase) return webBase.replace(/\/+$/, '') + '/movil.html';
    return '';
  }

  function fetchLatestVersion() {
    var TU = global.CrozzoTauriUpdater;
    var cur =
      typeof global.CROZZO_APP_VERSION !== 'undefined'
        ? String(global.CROZZO_APP_VERSION)
        : TU && TU.getVersion
          ? TU.getVersion()
          : '';
    return fetch(MANIFEST_URL + '?_=' + Date.now(), { cache: 'no-store' })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .catch(function () {
        return null;
      })
      .then(function (data) {
        var v = (data && (data.version || data.semver)) || cur || 'v1.0.0';
        if (v && v.charAt(0) !== 'v') v = 'v' + v;
        return v;
      });
  }

  function resolveInstallPayload() {
    var timeoutMs = 12000;
    var payloadPromise = fetchLatestVersion().then(function (ver) {
      var TU = global.CrozzoTauriUpdater;
      var apkPromise =
        TU && typeof TU.resolveBestApkUrl === 'function'
          ? TU.resolveBestApkUrl(ver)
          : Promise.resolve(null);
      return apkPromise.then(function (apkInfo) {
        var webBase = getWebAppBaseUrl();
        var iosStore = String(lsGet(LS_IOS_STORE) || '').trim();
        var androidUrl = (apkInfo && apkInfo.downloadUrl) || '';
        var landingUrl = getMobileLandingUrl(webBase);
        var releasePageUrl =
          (apkInfo && apkInfo.releasePageUrl) ||
          (TU && TU.releasesPageUrl) ||
          'https://github.com/kenny14ramirez-prog/Principal/releases/latest';
        return {
          version: ver,
          androidUrl: androidUrl,
          androidVerified: !!(apkInfo && apkInfo.verified),
          qrUrl: androidUrl || landingUrl || releasePageUrl,
          releasePageUrl: releasePageUrl,
          iosUrl: getIosInstallUrl(webBase),
          iosIsStore: /^https?:\/\//i.test(iosStore),
          landingUrl: landingUrl,
          webBase: webBase,
        };
      });
    });
    var timeoutPromise = new Promise(function (resolve) {
      setTimeout(function () {
        resolve({
          version: typeof global.CROZZO_APP_VERSION !== 'undefined' ? global.CROZZO_APP_VERSION : '—',
          androidUrl: '',
          qrUrl:
            (global.CrozzoTauriUpdater && global.CrozzoTauriUpdater.releasesPageUrl) ||
            'https://github.com/kenny14ramirez-prog/Principal/releases/latest',
          releasePageUrl:
            (global.CrozzoTauriUpdater && global.CrozzoTauriUpdater.releasesPageUrl) ||
            'https://github.com/kenny14ramirez-prog/Principal/releases/latest',
          iosUrl: getIosInstallUrl(),
          landingUrl: getMobileLandingUrl(),
          webBase: getWebAppBaseUrl(),
          timedOut: true,
        });
      }, timeoutMs);
    });
    return Promise.race([payloadPromise, timeoutPromise]);
  }

  function qrImgHtml(url, size) {
    if (!url) return '';
    var sz = size || 168;
    return (
      '<img src="https://api.qrserver.com/v1/create-qr-code/?size=' +
      sz +
      'x' +
      sz +
      '&amp;data=' +
      encodeURIComponent(url) +
      '" width="' +
      sz +
      '" height="' +
      sz +
      '" alt="QR" style="display:block;margin:0 auto;image-rendering:pixelated;"/>'
    );
  }

  function paintQrHost(host, url, size) {
    if (!host || !url) return;
    var sz = size || 220;
    if (typeof global.QRCode !== 'undefined') {
      host.innerHTML = '';
      new global.QRCode(host, {
        text: url,
        width: sz,
        height: sz,
        correctLevel: global.QRCode.CorrectLevel.M,
      });
    } else {
      host.innerHTML = qrImgHtml(url, sz);
    }
  }

  function toast(msg, kind) {
    if (typeof global.showToast === 'function') global.showToast(msg, kind || 'info');
  }

  function openExternal(url) {
    if (typeof global.crozzoOpenExternal === 'function') {
      global.crozzoOpenExternal(url);
      return;
    }
    var TU = global.CrozzoTauriUpdater;
    if (TU && typeof TU.openExternalUrl === 'function') {
      TU.openExternalUrl(url);
      return;
    }
    try {
      global.open(url, '_blank', 'noopener,noreferrer');
    } catch (_) {}
  }

  function bindAppDownloadQrModal(payload) {
    var qrUrl = payload.qrUrl || payload.androidUrl || payload.landingUrl || payload.releasePageUrl;
    var host = document.getElementById('crozzoAppDownloadQrHost');
    if (!qrUrl && payload.releasePageUrl) qrUrl = payload.releasePageUrl;
    if (host) {
      if (qrUrl) {
        paintQrHost(host, qrUrl, 220);
      } else {
        host.innerHTML = '<span class="form-hint">Sin enlace APK</span>';
      }
    }

    var verEl = document.getElementById('crozzoAppDownloadQrVersion');
    if (verEl) verEl.textContent = payload.version || '—';

    var urlEl = document.getElementById('crozzoAppDownloadQrUrl');
    if (urlEl) urlEl.textContent = qrUrl || '—';

    var hintEl = document.getElementById('crozzoAppDownloadQrHint');
    if (hintEl) {
      hintEl.textContent = payload.androidUrl
        ? 'El QR apunta al APK en GitHub. Escanéelo con la tablet Android para instalar la versión actualizada.'
        : payload.landingUrl
          ? 'El QR abre la página de instalación (detecta Android o iPhone).'
          : 'Sin APK directo: el QR abre el release en GitHub.';
    }

    var dlBtn = document.getElementById('crozzoAppDownloadQrDlHere');
    if (dlBtn) {
      dlBtn.onclick = function () {
        var u = payload.androidUrl || payload.releasePageUrl;
        if (u) openExternal(u);
      };
    }

    var advBtn = document.getElementById('crozzoAppDownloadQrAdvanced');
    if (advBtn) {
      advBtn.onclick = function () {
        if (typeof global.closeModal === 'function') global.closeModal();
        openMobileInstallAdvancedModal();
      };
    }
  }

  /** Modal principal: un QR grande para descargar la app actualizada. */
  function openAppDownloadQrModal() {
    var body =
      '<div class="crozzo-app-download-qr-modal" style="text-align:center;">' +
      '<p class="form-hint" style="margin:0 0 8px;">Versión publicada: <strong id="crozzoAppDownloadQrVersion">…</strong></p>' +
      '<p class="form-hint" id="crozzoAppDownloadQrHint" style="margin:0 0 14px;font-size:0.82rem;">Consultando GitHub…</p>' +
      '<div class="wizard-qr-box crozzo-app-download-qr-modal__box" style="margin:0 auto 12px;">' +
      '<div id="crozzoAppDownloadQrHost" style="min-height:220px;min-width:220px;display:flex;align-items:center;justify-content:center;">⏳</div>' +
      '</div>' +
      '<p class="form-hint" style="margin:0 0 12px;font-size:0.72rem;word-break:break-all;" id="crozzoAppDownloadQrUrl">…</p>' +
      '<p class="form-hint" style="margin:0 0 14px;font-size:0.75rem;">Escanee con la tablet Android. No requiere Supabase · solo internet.</p>' +
      '<div class="btn-group" style="justify-content:center;flex-wrap:wrap;gap:8px;">' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoAppDownloadQrDlHere">Descargar en este equipo</button>' +
      '<button type="button" class="btn btn-outline btn-sm" id="crozzoAppDownloadQrAdvanced">Más opciones (iPhone)</button>' +
      '<button type="button" class="btn btn-primary btn-sm" onclick="typeof closeModal===\'function\'&&closeModal()">Cerrar</button>' +
      '</div>' +
      '</div>';

    if (typeof global.showModal !== 'function') {
      toast('Cargando interfaz… intente de nuevo en unos segundos.', 'warning');
      return;
    }
    global.showModal('📱 QR — Instalar app actualizada', body, {
      modalClass: 'modal--mobile-install',
      wide: false,
      stackTop: true,
    });

    resolveInstallPayload()
      .then(bindAppDownloadQrModal)
      .catch(function () {
        bindAppDownloadQrModal({
          version: '—',
          androidUrl: '',
          qrUrl: '',
          releasePageUrl:
            (global.CrozzoTauriUpdater && global.CrozzoTauriUpdater.releasesPageUrl) ||
            'https://github.com/kenny14ramirez-prog/Principal/releases/latest',
          iosUrl: getIosInstallUrl(),
          landingUrl: getMobileLandingUrl(),
          webBase: getWebAppBaseUrl(),
        });
        toast('Sin conexión a GitHub; el QR usará el enlace de respaldo.', 'warning');
      });
  }

  function bindMobileInstallModal(payload) {
    var webIn = document.getElementById('crozzoMobileInstallWebBase');
    var iosIn = document.getElementById('crozzoMobileInstallIosStore');
    if (webIn) webIn.value = payload.webBase || '';
    if (iosIn) iosIn.value = lsGet(LS_IOS_STORE);

    function refreshPayload(next) {
      payload = next;
      var landing = payload.landingUrl || payload.androidUrl || payload.releasePageUrl;
      paintQrHost(document.getElementById('crozzoMobileQrUnified'), landing, 168);
      paintQrHost(document.getElementById('crozzoMobileQrAndroid'), payload.androidUrl || payload.releasePageUrl, 168);
      paintQrHost(document.getElementById('crozzoMobileQrIos'), payload.iosUrl, 168);
      var verEl = document.getElementById('crozzoMobileInstallVersion');
      if (verEl) verEl.textContent = payload.version || '—';
      var apkEl = document.getElementById('crozzoMobileInstallApkUrl');
      if (apkEl) {
        apkEl.textContent = payload.androidUrl || 'No disponible — use el release en GitHub';
      }
      var iosEl = document.getElementById('crozzoMobileInstallIosUrl');
      if (iosEl) {
        iosEl.textContent = payload.iosUrl || 'Configure URL web o App Store abajo';
      }
      var landEl = document.getElementById('crozzoMobileInstallLandingUrl');
      if (landEl) landEl.textContent = payload.landingUrl || '— (configure URL base del servidor web)';
    }

    refreshPayload(payload);

    var saveBtn = document.getElementById('crozzoMobileInstallSaveUrls');
    if (saveBtn) {
      saveBtn.onclick = function () {
        if (webIn) lsSet(LS_WEB_BASE, String(webIn.value || '').trim());
        if (iosIn) lsSet(LS_IOS_STORE, String(iosIn.value || '').trim());
        toast('URLs guardadas', 'success');
        resolveInstallPayload().then(refreshPayload);
      };
    }

    var dlApk = document.getElementById('crozzoMobileInstallDlApk');
    if (dlApk) {
      dlApk.onclick = function () {
        var u = payload.androidUrl || payload.releasePageUrl;
        if (u) openExternal(u);
      };
    }

    var openIos = document.getElementById('crozzoMobileInstallOpenIos');
    if (openIos) {
      openIos.onclick = function () {
        if (payload.iosUrl) openExternal(payload.iosUrl);
      };
    }

    var openLand = document.getElementById('crozzoMobileInstallOpenLanding');
    if (openLand) {
      openLand.onclick = function () {
        var u = payload.landingUrl || payload.androidUrl;
        if (u) openExternal(u);
      };
    }
  }

  function openMobileInstallAdvancedModal() {
    if (typeof global.showModal !== 'function') {
      toast('Modal no disponible', 'warning');
      return;
    }
    global.showModal(
      '📱 QR — Opciones avanzadas',
      '<div class="crozzo-mobile-install-modal">' +
        '<p class="form-hint" style="margin:0 0 12px;">Versión: <strong id="crozzoMobileInstallVersion">…</strong></p>' +
        '<div class="crozzo-mobile-install-grid">' +
        '<div class="crozzo-mobile-install-card crozzo-mobile-install-card--hero">' +
        '<h4>QR auto (Android / iPhone)</h4>' +
        '<div class="wizard-qr-box"><div id="crozzoMobileQrUnified"></div></div>' +
        '<p class="form-hint" id="crozzoMobileInstallLandingUrl" style="word-break:break-all;font-size:0.72rem;">…</p>' +
        '<button type="button" class="btn btn-outline btn-sm" id="crozzoMobileInstallOpenLanding">Abrir enlace</button>' +
        '</div>' +
        '<div class="crozzo-mobile-install-card">' +
        '<h4>🤖 Android (APK)</h4>' +
        '<div class="wizard-qr-box"><div id="crozzoMobileQrAndroid"></div></div>' +
        '<p class="form-hint" id="crozzoMobileInstallApkUrl" style="word-break:break-all;font-size:0.68rem;">…</p>' +
        '<button type="button" class="btn btn-primary btn-sm" id="crozzoMobileInstallDlApk">Descargar APK</button>' +
        '</div>' +
        '<div class="crozzo-mobile-install-card">' +
        '<h4>🍎 iPhone / iPad</h4>' +
        '<div class="wizard-qr-box"><div id="crozzoMobileQrIos"></div></div>' +
        '<p class="form-hint" id="crozzoMobileInstallIosUrl" style="word-break:break-all;font-size:0.68rem;">…</p>' +
        '<button type="button" class="btn btn-outline btn-sm" id="crozzoMobileInstallOpenIos">Abrir enlace iOS</button>' +
        '</div>' +
        '</div>' +
        '<details class="crozzo-mobile-install-advanced" style="margin-top:14px;">' +
        '<summary style="cursor:pointer;font-weight:600;font-size:0.85rem;">Configurar URLs</summary>' +
        '<div class="form-grid" style="margin-top:10px;">' +
        '<div class="form-group full">' +
        '<label class="form-label">URL base del POS en servidor</label>' +
        '<input class="form-input" id="crozzoMobileInstallWebBase" placeholder="https://su-dominio.com/pos/" autocomplete="off">' +
        '</div>' +
        '<div class="form-group full">' +
        '<label class="form-label">App Store (opcional)</label>' +
        '<input class="form-input" id="crozzoMobileInstallIosStore" placeholder="https://apps.apple.com/app/…" autocomplete="off">' +
        '</div>' +
        '<button type="button" class="btn btn-outline" id="crozzoMobileInstallSaveUrls">Guardar y actualizar QR</button>' +
        '</div>' +
        '</details>' +
        '</div>',
      { modalClass: 'modal--mobile-install', wide: true, stackTop: true }
    );

    resolveInstallPayload()
      .then(bindMobileInstallModal)
      .catch(function () {
        bindMobileInstallModal({
          version: '—',
          androidUrl: '',
          releasePageUrl:
            (global.CrozzoTauriUpdater && global.CrozzoTauriUpdater.releasesPageUrl) ||
            'https://github.com/kenny14ramirez-prog/Principal/releases/latest',
          iosUrl: getIosInstallUrl(),
          landingUrl: getMobileLandingUrl(),
          webBase: getWebAppBaseUrl(),
        });
      });
  }

  function downloadLatestApk(opts) {
    openAppDownloadQrModal();
    return Promise.resolve(true);
  }

  global.CrozzoMobileInstall = {
    resolveInstallPayload: resolveInstallPayload,
    getWebAppBaseUrl: getWebAppBaseUrl,
    getMobileLandingUrl: getMobileLandingUrl,
    downloadLatestApk: downloadLatestApk,
    openModal: openAppDownloadQrModal,
    openAdvancedModal: openMobileInstallAdvancedModal,
  };
  global.crozzoOpenAppDownloadQr = openAppDownloadQrModal;
  global.crozzoOpenMobileInstallQr = openAppDownloadQrModal;
  global.crozzoDownloadLatestApk = downloadLatestApk;
})(window);
