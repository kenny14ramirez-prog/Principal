/**
 * Lector QR de emparejamiento — motor dedicado (no depende de módulos lazy).
 * Prioriza marcas BONA (BOF rápido, BO1 completo, regiones de la caja).
 */
(function (global) {
  'use strict';

  var liveState = null;
  var PAIR_FAST_PREFIX = 'BOF.';
  var PAIR_FULL_PREFIX = 'BO1.';

  /** Regiones que coinciden con el layout de la caja (QR rápido arriba, completo abajo). */
  var PAIR_EMITTER_REGIONS = [
    { name: 'fast', rx: 0.22, ry: 0.02, rw: 0.56, rh: 0.38 },
    { name: 'full', rx: 0.08, ry: 0.34, rw: 0.84, rh: 0.58 },
    { name: 'center', rx: 0.18, ry: 0.18, rw: 0.64, rh: 0.64 },
  ];

  function isPairingHit(raw) {
    var t = String(raw || '').trim();
    if (!t) return false;
    if (t.indexOf(PAIR_FAST_PREFIX) === 0 || t.indexOf(PAIR_FULL_PREFIX) === 0) return true;
    if (t.indexOf('CROZZO_CLOUD_PAIRING') >= 0 || t.indexOf('"t":"C"') >= 0) return true;
    var seal = global.CrozzoPairingSeal;
    if (seal && typeof seal.isPairingQr === 'function' && seal.isPairingQr(t)) return true;
    return false;
  }

  function ensureJsQR() {
    if (typeof global.jsQR === 'function') return Promise.resolve(global.jsQR);
    return new Promise(function (resolve, reject) {
      var done = false;
      function finish() {
        if (done) return;
        done = true;
        if (typeof global.jsQR === 'function') resolve(global.jsQR);
        else reject(new Error('jsQR'));
      }
      var existing = document.querySelector('script[src*="CrozzoJsQR"]');
      if (existing) {
        if (existing.getAttribute('data-loaded') === '1') {
          finish();
          return;
        }
        existing.addEventListener('load', finish, { once: true });
        existing.addEventListener('error', function () {
          reject(new Error('jsQR load'));
        }, { once: true });
        window.setTimeout(finish, 5000);
        return;
      }
      var s = document.createElement('script');
      s.src = 'vendor/CrozzoJsQR.js';
      s.onload = function () {
        s.setAttribute('data-loaded', '1');
        finish();
      };
      s.onerror = function () {
        reject(new Error('jsQR load'));
      };
      document.head.appendChild(s);
    });
  }

  function cloneImageData(img) {
    var c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    c.getContext('2d').putImageData(img, 0, 0);
    return c.getContext('2d').getImageData(0, 0, c.width, c.height);
  }

  function otsuThreshold(img) {
    var hist = new Array(256);
    var i;
    for (i = 0; i < 256; i++) hist[i] = 0;
    var d = img.data;
    var n = 0;
    for (i = 0; i < d.length; i += 4) {
      var g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
      hist[g]++;
      n++;
    }
    if (!n) return 128;
    var sum = 0;
    for (i = 0; i < 256; i++) sum += i * hist[i];
    var sumB = 0;
    var wB = 0;
    var max = 0;
    var thr = 128;
    for (i = 0; i < 256; i++) {
      wB += hist[i];
      if (!wB) continue;
      var wF = n - wB;
      if (!wF) break;
      sumB += i * hist[i];
      var mB = sumB / wB;
      var mF = (sum - sumB) / wF;
      var between = wB * wF * (mB - mF) * (mB - mF);
      if (between > max) {
        max = between;
        thr = i;
      }
    }
    return thr;
  }

  function preprocess(img, mode) {
    var out = cloneImageData(img);
    var d = out.data;
    var i;
    var w = out.width;
    var h = out.height;
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
        g2 = g2 < 128 ? Math.max(0, g2 - 48) : Math.min(255, g2 + 48);
        d[i] = d[i + 1] = d[i + 2] = g2;
      }
      return out;
    }
    if (mode === 'threshold') {
      for (i = 0; i < d.length; i += 4) {
        var g3 = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
        var v = g3 > 132 ? 255 : 0;
        d[i] = d[i + 1] = d[i + 2] = v;
      }
      return out;
    }
    if (mode === 'adaptive') {
      var thr = otsuThreshold(img);
      for (i = 0; i < d.length; i += 4) {
        var ga = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
        var va = ga > thr ? 255 : 0;
        d[i] = d[i + 1] = d[i + 2] = va;
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

  function buildAttempts(imageData, fastOnly) {
    if (fastOnly) {
      return [imageData, preprocess(imageData, 'grayscale'), preprocess(imageData, 'adaptive')];
    }
    return [
      imageData,
      preprocess(imageData, 'grayscale'),
      preprocess(imageData, 'contrast'),
      preprocess(imageData, 'adaptive'),
      preprocess(imageData, 'threshold'),
      preprocess(preprocess(imageData, 'contrast'), 'threshold'),
      preprocess(preprocess(imageData, 'grayscale'), 'adaptive'),
      preprocess(imageData, 'invert'),
    ];
  }

  function tryJsQrSync(jsQR, imageData, fastOnly) {
    var attempts = buildAttempts(imageData, fastOnly);
    var ai;
    for (ai = 0; ai < attempts.length; ai++) {
      var pack = attempts[ai];
      var code = jsQR(pack.data, pack.width, pack.height, { inversionAttempts: 'attemptBoth' });
      if (code && code.data) {
        var raw = String(code.data);
        if (isPairingHit(raw)) return raw;
        if (!fastOnly) return raw;
      }
    }
    return '';
  }

  function tryBarcodeSync(canvas) {
    if (typeof global.BarcodeDetector !== 'function') return '';
    try {
      /* sync path unavailable — use async wrapper in pipeline */
    } catch (_) {}
    return '';
  }

  function tryBarcodeAsync(canvas) {
    if (typeof global.BarcodeDetector !== 'function') return Promise.resolve('');
    try {
      var det = new global.BarcodeDetector({ formats: ['qr_code'] });
      return det.detect(canvas).then(function (codes) {
        return codes && codes[0] && codes[0].rawValue ? String(codes[0].rawValue) : '';
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
    var tw = Math.max(8, Math.round(w * scale));
    var th = Math.max(8, Math.round(h * scale));
    var c = document.createElement('canvas');
    c.width = tw;
    c.height = th;
    var ctx = c.getContext('2d', { willReadFrequently: true }) || c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(source, 0, 0, tw, th);
    return c;
  }

  function cropRect(canvas, rx, ry, rw, rh) {
    var w = canvas.width;
    var h = canvas.height;
    var cw = Math.max(40, Math.floor(w * rw));
    var ch = Math.max(40, Math.floor(h * rh));
    var x = Math.max(0, Math.floor(w * rx));
    var y = Math.max(0, Math.floor(h * ry));
    if (x + cw > w) cw = w - x;
    if (y + ch > h) ch = h - y;
    var c2 = document.createElement('canvas');
    c2.width = cw;
    c2.height = ch;
    var ctx = c2.getContext('2d', { willReadFrequently: true }) || c2.getContext('2d');
    ctx.drawImage(canvas, x, y, cw, ch, 0, 0, cw, ch);
    return c2;
  }

  function cropCenter(canvas, frac) {
    var w = canvas.width;
    var h = canvas.height;
    var cw = Math.max(40, Math.floor(w * frac));
    var ch = Math.max(40, Math.floor(h * frac));
    var x = Math.floor((w - cw) / 2);
    var y = Math.floor((h - ch) / 2);
    var c2 = document.createElement('canvas');
    c2.width = cw;
    c2.height = ch;
    var ctx = c2.getContext('2d', { willReadFrequently: true }) || c2.getContext('2d');
    ctx.drawImage(canvas, x, y, cw, ch, 0, 0, cw, ch);
    return c2;
  }

  function scaleCanvas(base, sf, maxSide) {
    if (sf === 1) return base;
    maxSide = maxSide || 3000;
    var c = document.createElement('canvas');
    c.width = Math.min(Math.max(8, Math.round(base.width * sf)), maxSide);
    c.height = Math.min(Math.max(8, Math.round(base.height * sf)), maxSide);
    var ctx = c.getContext('2d', { willReadFrequently: true }) || c.getContext('2d');
    ctx.imageSmoothingEnabled = sf < 1;
    ctx.drawImage(base, 0, 0, c.width, c.height);
    return c;
  }

  function readCanvasSync(jsQR, canvas, fastOnly) {
    var ctx = canvas.getContext('2d', { willReadFrequently: true }) || canvas.getContext('2d');
    if (!ctx) return '';
    var id = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return tryJsQrSync(jsQR, id, !!fastOnly);
  }

  function readCanvasPairingRegions(jsQR, canvas) {
    var ri;
    for (ri = 0; ri < PAIR_EMITTER_REGIONS.length; ri++) {
      var reg = PAIR_EMITTER_REGIONS[ri];
      var slice = cropRect(canvas, reg.rx, reg.ry, reg.rw, reg.rh);
      var hit = readCanvasSync(jsQR, slice, reg.name === 'fast');
      if (hit) return hit;
      if (reg.name === 'fast') {
        hit = readCanvasSync(jsQR, scaleCanvas(slice, 1.8, 2400), true);
        if (hit) return hit;
      }
    }
    return '';
  }

  function readCanvasDeep(jsQR, canvas) {
    var scales = [1, 1.35, 1.7, 2.1, 2.6, 3.2, 3.8, 4.4];
    var crops = [1, 0.78, 0.58, 0.42];
    var ci;
    var si;
    for (ci = 0; ci < crops.length; ci++) {
      var base = crops[ci] >= 0.99 ? canvas : cropCenter(canvas, crops[ci]);
      for (si = 0; si < scales.length; si++) {
        var target = scaleCanvas(base, scales[si]);
        var hit = readCanvasSync(jsQR, target);
        if (hit) return hit;
      }
    }
    return '';
  }

  function readCanvasGrid(jsQR, canvas) {
    var cols = 3;
    var rows = 3;
    var w = canvas.width;
    var h = canvas.height;
    var tileW = Math.max(48, Math.floor(w / cols));
    var tileH = Math.max(48, Math.floor(h / rows));
    var r;
    var c;
    for (r = 0; r < rows; r++) {
      for (c = 0; c < cols; c++) {
        var tc = document.createElement('canvas');
        tc.width = tileW;
        tc.height = tileH;
        var tctx = tc.getContext('2d', { willReadFrequently: true }) || tc.getContext('2d');
        tctx.drawImage(canvas, c * tileW, r * tileH, tileW, tileH, 0, 0, tileW, tileH);
        var hit = readCanvasSync(jsQR, tc);
        if (hit) return hit;
      }
    }
    return '';
  }

  function readCanvas(canvas, deep) {
    return tryBarcodeAsync(canvas).then(function (raw) {
      if (raw && isPairingHit(raw)) return raw;
      if (raw && !deep) return raw;
      return ensureJsQR().then(function (jsQR) {
        var regionHit = readCanvasPairingRegions(jsQR, canvas);
        if (regionHit) return regionHit;
        var fast = readCanvasSync(jsQR, canvas, true);
        if (fast) return fast;
        if (!deep) return '';
        var deepHit = readCanvasDeep(jsQR, canvas);
        if (deepHit) return deepHit;
        return readCanvasGrid(jsQR, canvas);
      });
    });
  }

  function loadImageFromFileLegacy(file) {
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

  function loadImageFromFile(file) {
    if (typeof global.createImageBitmap === 'function') {
      return global
        .createImageBitmap(file, {
          resizeWidth: 3000,
          resizeHeight: 3000,
          resizeQuality: 'high',
        })
        .catch(function () {
          return loadImageFromFileLegacy(file);
        });
    }
    return loadImageFromFileLegacy(file);
  }

  function readFile(file, onProgress) {
    if (!file) return Promise.resolve('');
    if (typeof onProgress === 'function') onProgress('Preparando lector…', 10);
    return loadImageFromFile(file)
      .then(function (img) {
        if (typeof onProgress === 'function') onProgress('Analizando imagen…', 30);
        var canvas = drawToCanvas(img, 2400);
        if (!canvas) return '';
        if (typeof onProgress === 'function') onProgress('Buscando enlace rápido (BOF)…', 48);
        return readCanvas(canvas, false);
      })
      .then(function (raw) {
        if (raw) return raw;
        if (typeof onProgress === 'function') onProgress('Análisis profundo (BO1)…', 68);
        return loadImageFromFile(file).then(function (img2) {
          var c2 = drawToCanvas(img2, 2800);
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
    video.style.maxHeight = 'min(55vh, 300px)';
    host.innerHTML = '';
    host.appendChild(video);
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d', { willReadFrequently: true }) || canvas.getContext('2d');
    var constraints = { video: { facingMode: { ideal: 'environment' } }, audio: false };
    return global.navigator.mediaDevices
      .getUserMedia(constraints)
      .catch(function () {
        return global.navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      })
      .then(function (stream) {
        liveState = {
          stream: stream,
          video: video,
          canvas: canvas,
          ctx: ctx,
          timer: null,
          busy: false,
        };
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
          var tw = Math.max(8, Math.floor(vw * scale));
          var th = Math.max(8, Math.floor(vh * scale));
          liveState.canvas.width = tw;
          liveState.canvas.height = th;
          liveState.ctx.drawImage(v, 0, 0, tw, th);
          tryBarcodeAsync(liveState.canvas)
            .then(function (raw) {
              if (raw && isPairingHit(raw)) return raw;
              var regionHit = readCanvasPairingRegions(jsQR, liveState.canvas);
              if (regionHit) return regionHit;
              var crops = [1, 0.65, 0.48];
              var i;
              for (i = 0; i < crops.length; i++) {
                var sample = crops[i] >= 0.99 ? liveState.canvas : cropCenter(liveState.canvas, crops[i]);
                var hit = readCanvasSync(jsQR, sample, true);
                if (hit) return hit;
                hit = readCanvasSync(jsQR, scaleCanvas(sample, 1.5, 2200), true);
                if (hit) return hit;
              }
              return '';
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
    isPairingHit: isPairingHit,
    readFile: readFile,
    readCanvas: readCanvas,
    startLive: startLive,
    stopLive: stopLive,
  };
})(typeof window !== 'undefined' ? window : globalThis);
