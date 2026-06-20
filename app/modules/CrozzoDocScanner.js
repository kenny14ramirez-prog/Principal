/**
 * CrozzoDocScanner — deteccion de bordes de documento + correccion de perspectiva
 * (estilo CamScanner) para el escaner de facturas. Usa OpenCV.js (offline,
 * vendorizado en app/vendor/CrozzoOpenCv.js) cargado de forma perezosa: solo se
 * descarga/inicializa al abrir la camara, nunca en el arranque del POS.
 *
 * API global (window.CrozzoDocScanner):
 *   ready()                      -> Promise<cv>  (precarga OpenCV)
 *   isReady()                    -> bool
 *   detectQuad(canvas, opts?)    -> { quad:[{x,y}*4], confidence } | null
 *   warpToCanvas(canvas, quad)   -> HTMLCanvasElement (documento enderezado)
 *   orderQuad(points)            -> [{x,y}*4] en orden tl,tr,br,bl
 *
 * Nota: requiere un dispositivo con camara para validarse en runtime; degrada con
 * gracia (detectQuad devuelve null) si OpenCV no esta disponible, de modo que el
 * flujo de captura existente sigue funcionando.
 */
(function (global) {
  'use strict';

  var OPENCV_VENDOR = 'vendor/CrozzoOpenCv.js';
  var OPENCV_CDN = 'https://docs.opencv.org/4.8.0/opencv.js';
  var _loading = null;

  function resolveVendorUrl(path) {
    try {
      var a = document.createElement('a');
      a.href = path;
      return a.href;
    } catch (e) {
      return path;
    }
  }

  function cvReady() {
    return !!(global.cv && global.cv.Mat && typeof global.cv.matFromArray === 'function');
  }

  function injectScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        reject(new Error('No se pudo cargar OpenCV.js desde ' + src));
      };
      document.head.appendChild(s);
    });
  }

  function waitForRuntime(timeoutMs) {
    return new Promise(function (resolve, reject) {
      if (cvReady()) return resolve(global.cv);
      var settled = false;
      var finish = function () {
        if (settled) return;
        if (!cvReady()) return;
        settled = true;
        clearInterval(iv);
        resolve(global.cv);
      };
      // OpenCV.js dispara onRuntimeInitialized cuando el wasm queda listo.
      try {
        if (global.cv && typeof global.cv === 'object') global.cv.onRuntimeInitialized = finish;
      } catch (e) {
        /* algunos builds exponen cv como getter */
      }
      var waited = 0;
      var iv = setInterval(function () {
        waited += 60;
        if (cvReady()) return finish();
        if (waited >= (timeoutMs || 20000)) {
          settled = true;
          clearInterval(iv);
          reject(new Error('OpenCV.js no inicializo a tiempo'));
        }
      }, 60);
    });
  }

  function ready() {
    if (cvReady()) return Promise.resolve(global.cv);
    if (_loading) return _loading;
    _loading = injectScript(resolveVendorUrl(OPENCV_VENDOR))
      .catch(function () {
        return injectScript(OPENCV_CDN);
      })
      .then(function () {
        return waitForRuntime(25000);
      })
      .catch(function (err) {
        _loading = null;
        throw err;
      });
    return _loading;
  }

  function isReady() {
    return cvReady();
  }

  function dist(a, b) {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** Ordena 4 puntos como [tl, tr, br, bl]. */
  function orderQuad(pts) {
    if (!pts || pts.length !== 4) return pts;
    var bySum = pts
      .map(function (p) {
        return { p: p, sum: p.x + p.y, diff: p.y - p.x };
      });
    var tl = bySum.reduce(function (m, c) {
      return c.sum < m.sum ? c : m;
    }).p;
    var br = bySum.reduce(function (m, c) {
      return c.sum > m.sum ? c : m;
    }).p;
    var tr = bySum.reduce(function (m, c) {
      return c.diff < m.diff ? c : m;
    }).p;
    var bl = bySum.reduce(function (m, c) {
      return c.diff > m.diff ? c : m;
    }).p;
    return [tl, tr, br, bl];
  }

  /**
   * Detecta el cuadrilatero del documento en un canvas.
   * @param {HTMLCanvasElement} canvas frame de origen (ya dibujado)
   * @param {{scaleX?:number, scaleY?:number, minAreaRatio?:number}} opts
   *   scaleX/scaleY: factor para devolver las esquinas en coordenadas de un frame
   *   mayor (p. ej. el video a resolucion completa). Por defecto 1.
   */
  function detectQuad(canvas, opts) {
    if (!cvReady() || !canvas) return null;
    opts = opts || {};
    var scaleX = opts.scaleX || 1;
    var scaleY = opts.scaleY || 1;
    var minAreaRatio = opts.minAreaRatio || 0.18;
    var cv = global.cv;

    var src = null,
      gray = null,
      edges = null,
      kernel = null,
      contours = null,
      hierarchy = null;
    var best = null;
    try {
      src = cv.imread(canvas);
      var imgArea = src.cols * src.rows;
      gray = new cv.Mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
      cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
      edges = new cv.Mat();
      cv.Canny(gray, edges, 60, 180, 3, false);
      kernel = cv.Mat.ones(3, 3, cv.CV_8U);
      cv.dilate(edges, edges, kernel, new cv.Point(-1, -1), 1);
      contours = new cv.MatVector();
      hierarchy = new cv.Mat();
      cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

      var bestArea = 0;
      for (var i = 0; i < contours.size(); i++) {
        var cnt = contours.get(i);
        var area = cv.contourArea(cnt, false);
        if (area < imgArea * minAreaRatio) {
          cnt.delete();
          continue;
        }
        var peri = cv.arcLength(cnt, true);
        var approx = new cv.Mat();
        cv.approxPolyDP(cnt, approx, 0.02 * peri, true);
        if (approx.rows === 4 && cv.isContourConvex(approx) && area > bestArea) {
          var pts = [];
          for (var j = 0; j < 4; j++) {
            pts.push({ x: approx.data32S[j * 2], y: approx.data32S[j * 2 + 1] });
          }
          bestArea = area;
          best = { pts: pts, area: area, imgArea: imgArea };
        }
        approx.delete();
        cnt.delete();
      }
    } catch (e) {
      best = null;
    } finally {
      if (src) src.delete();
      if (gray) gray.delete();
      if (edges) edges.delete();
      if (kernel) kernel.delete();
      if (contours) contours.delete();
      if (hierarchy) hierarchy.delete();
    }

    if (!best) return null;
    var ordered = orderQuad(best.pts).map(function (p) {
      return { x: p.x * scaleX, y: p.y * scaleY };
    });
    return { quad: ordered, confidence: Math.min(1, best.area / best.imgArea) };
  }

  /**
   * Corrige la perspectiva: recorta y endereza el documento del canvas de origen.
   * @param {HTMLCanvasElement} srcCanvas frame a resolucion completa
   * @param {Array<{x,y}>} quad esquinas en coordenadas de srcCanvas (tl,tr,br,bl)
   * @returns {HTMLCanvasElement}
   */
  function warpToCanvas(srcCanvas, quad) {
    if (!cvReady() || !srcCanvas || !quad || quad.length !== 4) return srcCanvas;
    var cv = global.cv;
    var q = orderQuad(quad);
    var wTop = dist(q[0], q[1]);
    var wBot = dist(q[3], q[2]);
    var hLeft = dist(q[0], q[3]);
    var hRight = dist(q[1], q[2]);
    var outW = Math.max(1, Math.round(Math.max(wTop, wBot)));
    var outH = Math.max(1, Math.round(Math.max(hLeft, hRight)));

    var src = null,
      dst = null,
      M = null,
      srcTri = null,
      dstTri = null;
    var outCanvas = document.createElement('canvas');
    outCanvas.width = outW;
    outCanvas.height = outH;
    try {
      src = cv.imread(srcCanvas);
      dst = new cv.Mat();
      srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
        q[0].x, q[0].y, q[1].x, q[1].y, q[2].x, q[2].y, q[3].x, q[3].y,
      ]);
      dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, outW, 0, outW, outH, 0, outH]);
      M = cv.getPerspectiveTransform(srcTri, dstTri);
      cv.warpPerspective(
        src,
        dst,
        M,
        new cv.Size(outW, outH),
        cv.INTER_LINEAR,
        cv.BORDER_CONSTANT,
        new cv.Scalar()
      );
      cv.imshow(outCanvas, dst);
    } catch (e) {
      return srcCanvas;
    } finally {
      if (src) src.delete();
      if (dst) dst.delete();
      if (M) M.delete();
      if (srcTri) srcTri.delete();
      if (dstTri) dstTri.delete();
    }
    return outCanvas;
  }

  global.CrozzoDocScanner = {
    ready: ready,
    isReady: isReady,
    available: isReady,
    detectQuad: detectQuad,
    warpToCanvas: warpToCanvas,
    orderQuad: orderQuad,
  };
})(typeof window !== 'undefined' ? window : this);
