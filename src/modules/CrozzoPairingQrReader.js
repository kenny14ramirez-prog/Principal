/**
 * Lector QR emparejamiento — cámara en-app (getUserMedia), escáner nativo APK, foto y galería.
 *
 * Prioridad en tablet/APK:
 *   1) Cámara en vivo dentro del modal (startLive) — el operador ve el video en el marco.
 *   2) Escáner nativo pantalla completa (scanNative windowed:false) — sin WebView transparente.
 *   3) Foto / galería / pegar código manualmente.
 *
 * Evitar scanNative con windowed:true: deja WebView transparente y muchos equipos muestran pantalla negra.
 */
(function (global) {
  'use strict';

  var DECODE_BUDGET_MS = 14000;
  var liveState = null;

  function ensureJsQR() {
    if (typeof global.jsQR === 'function') return Promise.resolve(global.jsQR);
    return new Promise(function (resolve, reject) {
      var done = false;
      function finish() {
        if (done) return;
        done = true;
        if (typeof global.jsQR === 'function') resolve(global.jsQR);
        else reject(new Error('jsQR no cargado'));
      }
      var existing = document.querySelector('script[src*="CrozzoJsQR"]');
      if (existing) {
        existing.addEventListener('load', finish, { once: true });
        existing.addEventListener('error', function () {
          reject(new Error('jsQR error'));
        }, { once: true });
        window.setTimeout(finish, 4000);
        return;
      }
      reject(new Error('jsQR ausente'));
    });
  }

  function cloneImageData(img) {
    var c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    c.getContext('2d').putImageData(img, 0, 0);
    return c.getContext('2d').getImageData(0, 0, c.width, c.height);
  }

  function preprocess(img, mode) {
    var out = cloneImageData(img);
    var d = out.data;
    var i;
    if (mode === 'grayscale') {
      for (i = 0; i < d.length; i += 4) {
        var g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
        d[i] = d[i + 1] = d[i + 2] = g;
      }
      return out;
    }
    if (mode === 'threshold') {
      for (i = 0; i < d.length; i += 4) {
        var g3 = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
        var v = g3 > 128 ? 255 : 0;
        d[i] = d[i + 1] = d[i + 2] = v;
      }
    }
    return out;
  }

  function tryJsQrOnImageData(jsQR, imageData) {
    var attempts = [imageData, preprocess(imageData, 'grayscale'), preprocess(imageData, 'threshold')];
    var ai;
    for (ai = 0; ai < attempts.length; ai++) {
      var pack = attempts[ai];
      var code = jsQR(pack.data, pack.width, pack.height, { inversionAttempts: 'attemptBoth' });
      if (code && code.data) return String(code.data).trim();
    }
    return '';
  }

  function tryBarcodeAsync(canvas) {
    if (typeof global.BarcodeDetector !== 'function') return Promise.resolve('');
    try {
      var det = new global.BarcodeDetector({ formats: ['qr_code'] });
      return det
        .detect(canvas)
        .then(function (codes) {
          return codes && codes[0] && codes[0].rawValue ? String(codes[0].rawValue).trim() : '';
        })
        .catch(function () {
          return '';
        });
    } catch (_) {
      return Promise.resolve('');
    }
  }

  function drawToCanvas(source, maxSide) {
    maxSide = maxSide || 2200;
    var w = source.naturalWidth || source.width || source.videoWidth || 0;
    var h = source.naturalHeight || source.height || source.videoHeight || 0;
    if (w < 8 || h < 8) return null;
    var scale = Math.min(1, maxSide / Math.max(w, h));
    var tw = Math.max(32, Math.round(w * scale));
    var th = Math.max(32, Math.round(h * scale));
    var c = document.createElement('canvas');
    c.width = tw;
    c.height = th;
    var ctx = c.getContext('2d', { willReadFrequently: true }) || c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, 0, 0, tw, th);
    return c;
  }

  function scaleCanvas(base, sf) {
    if (!sf || sf === 1) return base;
    var c = document.createElement('canvas');
    c.width = Math.min(2800, Math.max(32, Math.round(base.width * sf)));
    c.height = Math.min(2800, Math.max(32, Math.round(base.height * sf)));
    var ctx = c.getContext('2d', { willReadFrequently: true }) || c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(base, 0, 0, c.width, c.height);
    return c;
  }

  function readCanvasWithJsQR(jsQR, canvas) {
    var w = canvas.width || 0;
    var h = canvas.height || 0;
    if (w < 8 || h < 8) return '';
    var sample = w < 480 ? scaleCanvas(canvas, Math.min(2.5, 480 / w)) : canvas;
    var ctx = sample.getContext('2d', { willReadFrequently: true }) || sample.getContext('2d');
    if (!ctx) return '';
    return tryJsQrOnImageData(jsQR, ctx.getImageData(0, 0, sample.width, sample.height));
  }

  function decodeCanvas(jsQR, canvas) {
    var hit = readCanvasWithJsQR(jsQR, canvas);
    if (hit) return hit;
    return readCanvasWithJsQR(jsQR, scaleCanvas(canvas, 1.35));
  }

  function readCanvas(canvas) {
    return tryBarcodeAsync(canvas).then(function (raw) {
      if (raw) return raw;
      return ensureJsQR().then(function (jsQR) {
        return decodeCanvas(jsQR, canvas);
      });
    });
  }

  function loadImageFromFile(file) {
    if (typeof global.createImageBitmap === 'function') {
      return global
        .createImageBitmap(file, {
          imageOrientation: 'from-image',
          resizeWidth: 2400,
          resizeHeight: 2400,
          resizeQuality: 'high',
        })
        .catch(function () {
          return loadImageLegacy(file);
        });
    }
    return loadImageLegacy(file);
  }

  function loadImageLegacy(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          resolve(img);
        };
        img.onerror = function () {
          reject(new Error('img'));
        };
        img.src = reader.result;
      };
      reader.onerror = function () {
        reject(new Error('read'));
      };
      reader.readAsDataURL(file);
    });
  }

  function readFile(file, onProgress) {
    if (!file) return Promise.resolve('');
    var deadline = Date.now() + DECODE_BUDGET_MS;
    function expired() {
      return Date.now() > deadline;
    }
    if (typeof onProgress === 'function') onProgress('Leyendo imagen…', 22);
    return ensureJsQR()
      .then(function () {
        return loadImageFromFile(file);
      })
      .then(function (img) {
        if (expired()) return '';
        var canvas = drawToCanvas(img, 2400);
        if (!canvas) return '';
        if (typeof onProgress === 'function') onProgress('Decodificando QR…', 55);
        return ensureJsQR().then(function (jsQR) {
          if (expired()) return '';
          return decodeCanvas(jsQR, canvas);
        });
      })
      .then(function (raw) {
        if (raw || expired()) return raw || '';
        if (typeof onProgress === 'function') onProgress('Último intento…', 78);
        return loadImageFromFile(file).then(function (img2) {
          if (expired()) return '';
          var c2 = drawToCanvas(img2, 2800);
          if (!c2) return '';
          return ensureJsQR().then(function (jsQR) {
            return decodeCanvas(jsQR, c2);
          });
        });
      })
      .catch(function () {
        return '';
      });
  }

  function preferNativeCamera() {
    var root = document.documentElement;
    return !!(
      root &&
      (root.classList.contains('crozzo-android-apk') ||
        root.classList.contains('crozzo-touch-shell') ||
        (global.CrozzoTabletShell &&
          typeof global.CrozzoTabletShell.isFieldTabletDevice === 'function' &&
          global.CrozzoTabletShell.isFieldTabletDevice()))
    );
  }

  function tauriCore() {
    try {
      var t = global.__TAURI__;
      if (t && t.core) return t.core;
    } catch (_) {}
    return null;
  }

  function barcodePermState(state) {
    if (!state || typeof state !== 'object') return String(state || '').toLowerCase();
    return String(state.camera || state).toLowerCase();
  }

  function hasNativeScanner() {
    if (!preferNativeCamera()) return false;
    var core = tauriCore();
    return !!(core && typeof core.invoke === 'function');
  }

  /**
   * Asegura el permiso de CÁMARA del sistema (Android/iOS vía plugin barcode-scanner).
   * Esto es lo que permite que getUserMedia funcione dentro del WebView del APK.
   * En navegador/escritorio resuelve sin hacer nada (getUserMedia pide su propio permiso).
   */
  function ensureOsCameraPermission() {
    var core = tauriCore();
    if (!core) return Promise.resolve('not_tauri');
    var check =
      typeof core.checkPermissions === 'function'
        ? Promise.resolve()
            .then(function () {
              return core.checkPermissions('barcode-scanner');
            })
            .then(barcodePermState)
            .catch(function () {
              return '';
            })
        : Promise.resolve('');
    return check.then(function (st) {
      if (st === 'granted') return 'granted';
      if (typeof core.requestPermissions !== 'function') return st || 'unknown';
      return core
        .requestPermissions('barcode-scanner')
        .then(function (r) {
          return barcodePermState(r) || 'unknown';
        })
        .catch(function () {
          return 'request_failed';
        });
    });
  }

  function ensureBarcodeCameraPerm() {
    var core = tauriCore();
    if (!core) return Promise.reject(new Error('no_tauri'));
    return ensureOsCameraPermission().then(function (st) {
      if (st === 'granted' || st === 'not_tauri') return true;
      throw new Error('perm_denied');
    });
  }

  function enterNativeScanPresentation() {
    try {
      var root = document.documentElement;
      var body = document.body;
      if (root) root.classList.add('crozzo-native-scan-active');
      if (body) body.classList.add('crozzo-native-scan-active');
      var ov = document.getElementById('crozzoPairingOverlay');
      if (ov) ov.setAttribute('hidden', '');
      if (body) body.classList.remove('crozzo-pairing-open');
      var hud = document.getElementById('crozzoNativeScanHud');
      if (!hud && body) {
        hud = document.createElement('div');
        hud.id = 'crozzoNativeScanHud';
        hud.className = 'crozzo-native-scan-hud';
        hud.innerHTML =
          '<p class="crozzo-native-scan-hud__msg">Enfoque el QR grande de la caja</p>' +
          '<button type="button" class="btn btn-outline crozzo-native-scan-hud__cancel" id="crozzoNativeScanCancel">Cancelar</button>';
        body.appendChild(hud);
        var cancelBtn = hud.querySelector('#crozzoNativeScanCancel');
        if (cancelBtn && !cancelBtn._crozzoBound) {
          cancelBtn._crozzoBound = true;
          cancelBtn.addEventListener('click', function (ev) {
            ev.preventDefault();
            cancelNativeScan();
          });
        }
      }
      if (hud) {
        hud.hidden = false;
        hud.classList.add('is-open');
      }
    } catch (_) {}
  }

  function exitNativeScanPresentation() {
    try {
      var root = document.documentElement;
      var body = document.body;
      if (root) root.classList.remove('crozzo-native-scan-active');
      if (body) body.classList.remove('crozzo-native-scan-active');
      var hud = document.getElementById('crozzoNativeScanHud');
      if (hud) {
        hud.classList.remove('is-open');
        hud.hidden = true;
      }
    } catch (_) {}
  }

  function scanNative(opts) {
    opts = opts || {};
    if (!hasNativeScanner()) return Promise.reject(new Error('no_native_scanner'));
    // windowed:true exige WebView transparente y suele verse negro en Android; solo si se pide explícito.
    var useWindowed = opts.windowed === true;
    if (useWindowed) enterNativeScanPresentation();
    return ensureBarcodeCameraPerm()
      .then(function () {
        return tauriCore().invoke('plugin:barcode-scanner|scan', {
          windowed: useWindowed,
          formats: opts.formats || ['QR_CODE'],
        });
      })
      .then(function (result) {
        if (!result) return '';
        if (typeof result === 'string') return String(result).trim();
        return String(result.content || result.text || '').trim();
      })
      .finally(function () {
        if (useWindowed) exitNativeScanPresentation();
        restoreWebViewAfterNativeScan().catch(function () {});
      });
  }

  function cancelNativeScan() {
    exitNativeScanPresentation();
    var core = tauriCore();
    if (!core || typeof core.invoke !== 'function') return Promise.resolve();
    return core.invoke('plugin:barcode-scanner|cancel', {}).catch(function () {});
  }

  function restoreWebViewAfterNativeScan() {
    return cancelNativeScan().then(function () {
      try {
        var html = document.documentElement;
        var body = document.body;
        if (html) {
          html.style.removeProperty('background');
          html.style.removeProperty('background-color');
          html.style.opacity = '0.99';
        }
        if (body) {
          body.style.removeProperty('background');
          body.style.removeProperty('background-color');
          body.style.removeProperty('opacity');
        }
      } catch (_) {}
      return new Promise(function (resolve) {
        function finish() {
          try {
            if (document.documentElement) document.documentElement.style.opacity = '';
            window.dispatchEvent(new Event('resize'));
          } catch (_) {}
          resolve();
        }
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(function () {
            requestAnimationFrame(finish);
          });
        } else {
          window.setTimeout(finish, 32);
        }
      });
    });
  }

  /* ============================ Cámara en vivo (en-app) ============================ */

  function setTorch(on) {
    if (!liveState || !liveState.track || !liveState.canTorch) return Promise.resolve(false);
    return liveState.track
      .applyConstraints({ advanced: [{ torch: !!on }] })
      .then(function () {
        liveState.torchOn = !!on;
        return liveState.torchOn;
      })
      .catch(function () {
        return liveState ? liveState.torchOn : false;
      });
  }

  function toggleTorch() {
    return setTorch(!(liveState && liveState.torchOn));
  }

  function stopLive() {
    if (!liveState) return;
    var st = liveState;
    liveState = null;
    try {
      if (st.timer) clearInterval(st.timer);
    } catch (_) {}
    try {
      if (st.track && st.canTorch && st.torchOn) {
        st.track.applyConstraints({ advanced: [{ torch: false }] }).catch(function () {});
      }
    } catch (_) {}
    try {
      if (st.stream && st.stream.getTracks) {
        st.stream.getTracks().forEach(function (t) {
          t.stop();
        });
      }
    } catch (_) {}
    try {
      if (st.video) {
        st.video.pause();
        st.video.srcObject = null;
      }
    } catch (_) {}
  }

  function waitVideoReady(video, timeoutMs) {
    timeoutMs = timeoutMs || 9000;
    return new Promise(function (resolve, reject) {
      if (!video) return reject(new Error('no_video'));
      if (video.readyState >= 2) return resolve();
      var done = false;
      function finish(ok) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        video.removeEventListener('loadeddata', onReady);
        video.removeEventListener('loadedmetadata', onReady);
        if (ok) resolve();
        else reject(new Error('video_timeout'));
      }
      function onReady() {
        if (video.readyState >= 2) finish(true);
      }
      var timer = window.setTimeout(function () {
        finish(video.readyState >= 2);
      }, timeoutMs);
      video.addEventListener('loadeddata', onReady);
      video.addEventListener('loadedmetadata', onReady);
    });
  }

  function getCameraStream() {
    var md = global.navigator.mediaDevices;
    var attempts = [
      { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false },
      { video: { facingMode: { ideal: 'environment' } }, audio: false },
      { video: true, audio: false },
    ];
    var i = 0;
    function next(lastErr) {
      if (i >= attempts.length) return Promise.reject(lastErr || new Error('no_stream'));
      var constraints = attempts[i++];
      return md.getUserMedia(constraints).catch(function (e) {
        // Si el permiso fue denegado, no tiene sentido reintentar con otras restricciones.
        var name = e && e.name ? String(e.name) : '';
        if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
          return Promise.reject(e);
        }
        return next(e);
      });
    }
    return next();
  }

  function startLive(opts) {
    opts = opts || {};
    stopLive();
    if (!global.navigator.mediaDevices || typeof global.navigator.mediaDevices.getUserMedia !== 'function') {
      return Promise.reject(new Error('no_camera_api'));
    }
    var host = opts.host;
    if (!host) return Promise.reject(new Error('no_host'));

    var video = document.createElement('video');
    video.setAttribute('playsinline', 'true');
    video.setAttribute('muted', 'true');
    video.playsInline = true;
    video.muted = true;
    video.autoplay = true;
    video.style.width = '100%';
    video.style.height = '100%';
    video.style.objectFit = 'cover';
    host.innerHTML = '';
    host.appendChild(video);

    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d', { willReadFrequently: true }) || canvas.getContext('2d');

    // En APK pedimos permiso de cámara del sistema antes de getUserMedia (no ignorar denegación).
    var permStep = tauriCore()
      ? ensureOsCameraPermission().then(function (st) {
          if (st === 'granted' || st === 'not_tauri') return st;
          var err = new Error('perm_denied');
          err.name = 'NotAllowedError';
          throw err;
        })
      : Promise.resolve('');

    return permStep
      .then(function () {
        return getCameraStream();
      })
      .then(function (stream) {
        liveState = {
          stream: stream,
          video: video,
          canvas: canvas,
          ctx: ctx,
          timer: null,
          busy: false,
          track: null,
          canTorch: false,
          torchOn: false,
          hit: false,
        };
        try {
          var track = stream.getVideoTracks && stream.getVideoTracks()[0];
          if (track) {
            liveState.track = track;
            if (typeof track.getCapabilities === 'function') {
              var caps = track.getCapabilities() || {};
              liveState.canTorch = !!caps.torch;
            }
          }
        } catch (_) {}
        video.srcObject = stream;
        var played = video.play();
        var playP =
          played && typeof played.then === 'function'
            ? played.catch(function () {
                return video.play();
              })
            : Promise.resolve();
        return playP.then(function () {
          return waitVideoReady(video);
        });
      })
      .then(function () {
        if (typeof opts.onReady === 'function') {
          try {
            opts.onReady({ canTorch: !!(liveState && liveState.canTorch) });
          } catch (_) {}
        }
        return ensureJsQR().catch(function () {
          return null;
        });
      })
      .then(function (jsQR) {
        function tick() {
          if (!liveState || liveState.busy || liveState.hit) return;
          var v = liveState.video;
          if (!v || v.readyState < 2) return;
          var vw = v.videoWidth || 0;
          var vh = v.videoHeight || 0;
          if (vw < 16 || vh < 16) return;
          liveState.busy = true;
          var maxSide = 1280;
          var scale = Math.min(1, maxSide / Math.max(vw, vh));
          var tw = Math.max(16, Math.floor(vw * scale));
          var th = Math.max(16, Math.floor(vh * scale));
          liveState.canvas.width = tw;
          liveState.canvas.height = th;
          liveState.ctx.imageSmoothingEnabled = false;
          liveState.ctx.drawImage(v, 0, 0, tw, th);
          tryBarcodeAsync(liveState.canvas)
            .then(function (raw) {
              if (raw) return raw;
              if (!jsQR) return '';
              return decodeCanvas(jsQR, liveState.canvas);
            })
            .then(function (raw) {
              if (raw && liveState && !liveState.hit) {
                liveState.hit = true;
                if (typeof opts.onResult === 'function') opts.onResult(raw);
              }
            })
            .catch(function () {})
            .finally(function () {
              if (liveState) liveState.busy = false;
            });
        }
        liveState.timer = window.setInterval(tick, 220);
        tick();
        return { canTorch: !!(liveState && liveState.canTorch) };
      });
  }

  global.CrozzoPairingQrReader = {
    ensureReady: ensureJsQR,
    preferNativeCamera: preferNativeCamera,
    hasNativeScanner: hasNativeScanner,
    ensureOsCameraPermission: ensureOsCameraPermission,
    scanNative: scanNative,
    cancelNativeScan: cancelNativeScan,
    restoreWebViewAfterNativeScan: restoreWebViewAfterNativeScan,
    enterNativeScanPresentation: enterNativeScanPresentation,
    exitNativeScanPresentation: exitNativeScanPresentation,
    readFile: readFile,
    readCanvas: readCanvas,
    startLive: startLive,
    stopLive: stopLive,
    setTorch: setTorch,
    toggleTorch: toggleTorch,
    DECODE_BUDGET_MS: DECODE_BUDGET_MS,
  };
})(typeof window !== 'undefined' ? window : globalThis);
