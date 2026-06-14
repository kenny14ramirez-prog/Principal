/**

 * Lector QR emparejamiento — mínimo y rápido (foto → jsQR → BOF).

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

      return det.detect(canvas).then(function (codes) {

        return codes && codes[0] && codes[0].rawValue ? String(codes[0].rawValue).trim() : '';

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



  function ensureBarcodeCameraPerm() {

    var core = tauriCore();

    if (!core) return Promise.reject(new Error('no_tauri'));

    var check =

      typeof core.checkPermissions === 'function'

        ? core.checkPermissions('barcode-scanner').then(barcodePermState)

        : Promise.resolve('');

    return check.then(function (st) {

      if (st === 'granted') return true;

      if (typeof core.requestPermissions !== 'function') {

        return Promise.reject(new Error('perm_denied'));

      }

      return core.requestPermissions('barcode-scanner').then(function (r) {

        var next = barcodePermState(r);

        if (next === 'granted') return true;

        throw new Error('perm_denied');

      });

    });

  }



  function scanNative(opts) {

    opts = opts || {};

    if (!hasNativeScanner()) return Promise.reject(new Error('no_native_scanner'));

    return ensureBarcodeCameraPerm()

      .then(function () {

        return tauriCore().invoke('plugin:barcode-scanner|scan', {

          windowed: opts.windowed !== false,

          formats: opts.formats || ['QR_CODE'],

        });

      })

      .then(function (result) {

        if (!result) return '';

        if (typeof result === 'string') return String(result).trim();

        return String(result.content || result.text || '').trim();

      });

  }



  function cancelNativeScan() {

    var core = tauriCore();

    if (!core || typeof core.invoke !== 'function') return Promise.resolve();

    return core.invoke('plugin:barcode-scanner|cancel', {}).catch(function () {});

  }



  function stopLive() {

    if (!liveState) return;

    var st = liveState;

    liveState = null;

    try {

      if (st.timer) clearInterval(st.timer);

    } catch (_) {}

    try {

      if (st.stream && st.stream.getTracks) st.stream.getTracks().forEach(function (t) { t.stop(); });

    } catch (_) {}

    try {

      if (st.video) {

        st.video.pause();

        st.video.srcObject = null;

      }

    } catch (_) {}

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

    video.style.maxHeight = 'min(55vh, 320px)';

    host.innerHTML = '';

    host.appendChild(video);

    var canvas = document.createElement('canvas');

    var ctx = canvas.getContext('2d', { willReadFrequently: true }) || canvas.getContext('2d');

    return global.navigator.mediaDevices

      .getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })

      .catch(function () {

        return global.navigator.mediaDevices.getUserMedia({ video: true, audio: false });

      })

      .then(function (stream) {

        liveState = { stream: stream, video: video, canvas: canvas, ctx: ctx, timer: null, busy: false };

        video.srcObject = stream;

        return video.play();

      })

      .then(function () {

        return ensureJsQR();

      })

      .then(function (jsQR) {

        function tick() {

          if (!liveState || liveState.busy) return;

          var v = liveState.video;

          if (!v || v.readyState < 2) return;

          var vw = v.videoWidth || 0;

          var vh = v.videoHeight || 0;

          if (vw < 16 || vh < 16) return;

          liveState.busy = true;

          var maxSide = 1400;

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

              return decodeCanvas(jsQR, liveState.canvas);

            })

            .then(function (raw) {

              if (raw && typeof opts.onResult === 'function') opts.onResult(raw);

            })

            .finally(function () {

              if (liveState) liveState.busy = false;

            });

        }

        liveState.timer = window.setInterval(tick, 320);

        tick();

      });

  }



  global.CrozzoPairingQrReader = {

    ensureReady: ensureJsQR,

    preferNativeCamera: preferNativeCamera,

    hasNativeScanner: hasNativeScanner,

    scanNative: scanNative,

    cancelNativeScan: cancelNativeScan,

    readFile: readFile,

    readCanvas: readCanvas,

    startLive: startLive,

    stopLive: stopLive,

    DECODE_BUDGET_MS: DECODE_BUDGET_MS,

  };

})(typeof window !== 'undefined' ? window : globalThis);

