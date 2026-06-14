/**
 * Lector QR emparejamiento — simple y directo.
 * Decodifica cualquier QR legible; la validación BOF/BO1 la hace CrozzoPairingSeal en PosMain.
 */
(function (global) {
  'use strict';

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
        window.setTimeout(finish, 6000);
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
    if (mode === 'contrast') {
      for (i = 0; i < d.length; i += 4) {
        var g2 = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
        g2 = g2 < 128 ? Math.max(0, g2 - 56) : Math.min(255, g2 + 56);
        d[i] = d[i + 1] = d[i + 2] = g2;
      }
      return out;
    }
    if (mode === 'threshold') {
      for (i = 0; i < d.length; i += 4) {
        var g3 = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
        var v = g3 > 128 ? 255 : 0;
        d[i] = d[i + 1] = d[i + 2] = v;
      }
      return out;
    }
    if (mode === 'invert') {
      for (i = 0; i < d.length; i += 4) {
        d[i] = 255 - d[i];
        d[i + 1] = 255 - d[i + 1];
        d[i + 2] = 255 - d[i + 2];
      }
    }
    return out;
  }

  function tryJsQrOnImageData(jsQR, imageData) {
    var attempts = [
      imageData,
      preprocess(imageData, 'grayscale'),
      preprocess(imageData, 'contrast'),
      preprocess(imageData, 'threshold'),
      preprocess(preprocess(imageData, 'contrast'), 'threshold'),
      preprocess(imageData, 'invert'),
    ];
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
    maxSide = maxSide || 2600;
    var w = source.naturalWidth || source.width || source.videoWidth || 0;
    var h = source.naturalHeight || source.height || source.videoHeight || 0;
    if (w < 8 || h < 8) return null;
    var scale = Math.min(1, maxSide / Math.max(w, h));
    var tw = Math.max(16, Math.round(w * scale));
    var th = Math.max(16, Math.round(h * scale));
    var c = document.createElement('canvas');
    c.width = tw;
    c.height = th;
    var ctx = c.getContext('2d', { willReadFrequently: true }) || c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, 0, 0, tw, th);
    return c;
  }

  function cropCenter(canvas, frac) {
    var w = canvas.width;
    var h = canvas.height;
    var cw = Math.max(48, Math.floor(w * frac));
    var ch = Math.max(48, Math.floor(h * frac));
    var x = Math.floor((w - cw) / 2);
    var y = Math.floor((h - ch) / 2);
    var c2 = document.createElement('canvas');
    c2.width = cw;
    c2.height = ch;
    var ctx = c2.getContext('2d', { willReadFrequently: true }) || c2.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(canvas, x, y, cw, ch, 0, 0, cw, ch);
    return c2;
  }

  function scaleCanvas(base, sf, maxSide) {
    if (sf === 1) return base;
    maxSide = maxSide || 3200;
    var c = document.createElement('canvas');
    c.width = Math.min(Math.max(16, Math.round(base.width * sf)), maxSide);
    c.height = Math.min(Math.max(16, Math.round(base.height * sf)), maxSide);
    var ctx = c.getContext('2d', { willReadFrequently: true }) || c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(base, 0, 0, c.width, c.height);
    return c;
  }

  function readCanvasWithJsQR(jsQR, canvas) {
    var w = canvas.width || 0;
    var h = canvas.height || 0;
    if (w < 8 || h < 8) return '';
    var sample = canvas;
    if (w < 400) {
      sample = scaleCanvas(canvas, Math.min(3, 400 / w), 3200);
    }
    var ctx = sample.getContext('2d', { willReadFrequently: true }) || sample.getContext('2d');
    if (!ctx) return '';
    return tryJsQrOnImageData(jsQR, ctx.getImageData(0, 0, sample.width, sample.height));
  }

  function decodeCanvas(jsQR, canvas, deep) {
    var crops = deep ? [1, 0.82, 0.65, 0.48, 0.35] : [1, 0.72, 0.55];
    var scales = deep ? [1, 1.25, 1.55, 1.9, 2.35, 2.9] : [1, 1.4, 1.85, 2.3];
    var ci;
    var si;
    for (ci = 0; ci < crops.length; ci++) {
      var base = crops[ci] >= 0.99 ? canvas : cropCenter(canvas, crops[ci]);
      for (si = 0; si < scales.length; si++) {
        var target = scaleCanvas(base, scales[si]);
        var hit = readCanvasWithJsQR(jsQR, target);
        if (hit) return hit;
      }
    }
    return '';
  }

  function readCanvas(canvas, deep) {
    return tryBarcodeAsync(canvas).then(function (raw) {
      if (raw) return raw;
      return ensureJsQR().then(function (jsQR) {
        return decodeCanvas(jsQR, canvas, !!deep);
      });
    });
  }

  function loadImageFromFile(file) {
    if (typeof global.createImageBitmap === 'function') {
      return global
        .createImageBitmap(file, { resizeWidth: 3200, resizeHeight: 3200, resizeQuality: 'high' })
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
    if (typeof onProgress === 'function') onProgress('Preparando cámara…', 12);
    return ensureJsQR()
      .then(function () {
        if (typeof onProgress === 'function') onProgress('Leyendo imagen…', 28);
        return loadImageFromFile(file);
      })
      .then(function (img) {
        var canvas = drawToCanvas(img, 2800);
        if (!canvas) return '';
        if (typeof onProgress === 'function') onProgress('Decodificando QR…', 50);
        return readCanvas(canvas, false);
      })
      .then(function (raw) {
        if (raw) return raw;
        if (typeof onProgress === 'function') onProgress('Segundo intento (más cerca del código)…', 72);
        return loadImageFromFile(file).then(function (img2) {
          var c2 = drawToCanvas(img2, 3200);
          if (!c2) return '';
          return readCanvas(c2, true);
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
          var maxSide = 1600;
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
              return decodeCanvas(jsQR, liveState.canvas, false);
            })
            .then(function (raw) {
              if (raw && typeof opts.onResult === 'function') opts.onResult(raw);
            })
            .finally(function () {
              if (liveState) liveState.busy = false;
            });
        }
        liveState.timer = window.setInterval(tick, 280);
        tick();
      });
  }

  global.CrozzoPairingQrReader = {
    ensureReady: ensureJsQR,
    preferNativeCamera: preferNativeCamera,
    readFile: readFile,
    readCanvas: readCanvas,
    startLive: startLive,
    stopLive: stopLive,
  };
})(typeof window !== 'undefined' ? window : globalThis);
