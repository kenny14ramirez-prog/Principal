/**
 * Crozzo — análisis factura electrónica DIAN (QR, CUFE, totales, líneas MP).
 * Usado por Entrada de facturas · modo complejo.
 */
(function (global) {
  'use strict';

  var DIAN_QR_BASE = 'https://catalogo-vpfe.dian.gov.co/document/searchqr';
  var _jsQrPromise = null;
  /** Contexto del escaneo QR en curso (PDF escaneado vs lote, etc.). */
  var _activeQrScan = null;
  /** CUFE DIAN: cadena hexadecimal (habitual 96 caracteres). */
  var CUFE_HEX_MIN = 64;
  var CUFE_HEX_MAX = 96;
  var CUFE_PREFERRED = 96;

  /** Perfiles de lectura QR (cascada: si uno falla, sigue el siguiente). */
  var QR_SCAN_PROFILES = {
    lite: { label: 'Lectura rápida', scanned: true, scales: [2.4, 3], grid: false, maxSide: 2200 },
    standard: {
      label: 'Regiones y filtros',
      scanned: true,
      scales: [2.6, 3.2, 3.6],
      grid: false,
      maxSide: 2600,
      fullFilters: true,
    },
    high: { label: 'Alta resolución', scanned: true, scales: [3.2, 3.8], grid: false, maxSide: 3000, fullFilters: true },
    grid: { label: 'Rejilla de página', scanned: true, scales: [3, 3.5], grid: true, maxSide: 2800, fullFilters: true },
    deep: { label: 'Escaneo profundo', scanned: true, thorough: true, scales: [3.5, 4.2], grid: false, maxSide: 3200 },
    max: {
      label: 'Máxima ampliación',
      scanned: true,
      thorough: true,
      scales: [4, 4.8],
      grid: true,
      maxSide: 3400,
      fullFilters: true,
    },
    quick: { label: 'PDF con texto', scanned: false, scales: [2, 2.8], grid: false },
  };

  /** En lote: solo 2 métodos (evita congelar la UI). Use cámara o Reanalizar para el resto. */
  var QR_CASCADE_BATCH = ['lite', 'standard'];
  var QR_CASCADE_SCANNED = ['lite', 'standard', 'high', 'grid', 'deep', 'max'];
  var QR_CASCADE_TEXT = ['quick', 'standard', 'high'];

  var FE_LOADER_TRACK = [
    { id: 'init', label: 'Preparando documento' },
    { id: 'detect', label: 'Detección QR y CUFE' },
    { id: 'cufe', label: 'Confirmación factura electrónica' },
    { id: 'texto', label: 'Datos del documento' },
    { id: 'dian', label: 'Consulta DIAN' },
    { id: 'cierre', label: 'Proveedor y materias primas' },
  ];

  var FE_STEP_ORDER = { init: 0, detect: 1, cufe: 2, texto: 3, dian: 4, cierre: 5 };

  function buildLoaderSteps(activeId, doneIds) {
    doneIds = doneIds || {};
    return FE_LOADER_TRACK.map(function (s) {
      return {
        id: s.id,
        label: s.label,
        active: s.id === activeId,
        done: !!doneIds[s.id],
      };
    });
  }

  function createInitialProgreso() {
    return {
      pct: 4,
      label: 'Iniciando análisis de factura electrónica…',
      stepId: 'init',
      steps: buildLoaderSteps('init', {}),
    };
  }

  function emitProgress(opts, pct, label, stepId, doneExtra) {
    if (typeof opts.onProgress !== 'function') return;
    var done = doneExtra || {};
    var cur = FE_STEP_ORDER[stepId] != null ? FE_STEP_ORDER[stepId] : 0;
    FE_LOADER_TRACK.forEach(function (s) {
      if (FE_STEP_ORDER[s.id] != null && FE_STEP_ORDER[s.id] < cur) done[s.id] = true;
    });
    var pctRounded = Math.min(100, Math.max(0, Math.round(pct * 10) / 10));
    opts.onProgress({
      pct: pctRounded,
      pctDisplay: Math.round(pctRounded),
      label: label,
      stepId: stepId,
      steps: buildLoaderSteps(stepId, done),
    });
  }

  /** Avance suave de la barra mientras el QR tarda (evita congelarse en 45%). */
  function createSmoothProgress(opts) {
    var batchUi = !!(opts && opts.batchMode) || !!global.__cxfFeBatchMode;
    var st = {
      pct: 6,
      cap: 50,
      label: '',
      stepId: 'detect',
      done: {},
      timer: null,
      stopped: false,
      lastEmit: 0,
    };
    function pulse() {
      if (st.stopped) return;
      if (st.pct < st.cap - 0.4) {
        st.pct = Math.min(st.cap - 0.4, st.pct + 0.28 + Math.random() * 0.22);
        emitProgressThrottled();
      }
    }
    function emitProgressThrottled() {
      if (batchUi) {
        var now = Date.now();
        if (now - st.lastEmit < (batchUi ? 720 : 420)) return;
        st.lastEmit = now;
      }
      emitProgress(opts, st.pct, st.label, st.stepId, st.done);
    }
    return {
      start: function (cap, label, stepId, done) {
        st.cap = cap || 50;
        st.label = label || '';
        st.stepId = stepId || 'detect';
        st.done = done || {};
        st.stopped = false;
        st.pct = Math.min(st.pct, st.cap - 5);
        if (st.timer) clearInterval(st.timer);
        st.timer = null;
        if (!batchUi) st.timer = setInterval(pulse, 130);
        emitProgressThrottled();
      },
      setLabel: function (label) {
        st.label = label;
        emitProgressThrottled();
      },
      bump: function (pct, label) {
        if (pct != null) st.pct = Math.max(st.pct, Math.min(st.cap - 1, pct));
        if (label) st.label = label;
        emitProgressThrottled();
      },
      stop: function (pct, label, stepId, done) {
        st.stopped = true;
        if (st.timer) {
          clearInterval(st.timer);
          st.timer = null;
        }
        if (pct != null) st.pct = Math.max(st.pct, pct);
        if (label) st.label = label;
        if (stepId) st.stepId = stepId;
        if (done) st.done = Object.assign({}, st.done, done);
        st.lastEmit = 0;
        emitProgress(opts, st.pct, st.label, st.stepId, st.done);
      },
    };
  }

  function isFacturaElectronicaDetectada(cufeResolved, qr) {
    if (cufeResolved && cufeResolved.cufeValidado) return true;
    if (cufeResolved && cufeResolved.cufe && isValidCufeHex(cufeResolved.cufe)) return true;
    if (qr && qr.cufe && isValidCufeHex(qr.cufe)) return true;
    if (qr && qr.url && /dian\.gov|documentkey|catalogo-vpfe/i.test(qr.url)) return true;
    return false;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function normNit(raw) {
    if (global.CrozzoProveedorDocumentos && global.CrozzoProveedorDocumentos.normIdentificador) {
      return global.CrozzoProveedorDocumentos.normIdentificador(raw);
    }
    return String(raw || '')
      .replace(/[^0-9Kk-]/g, '')
      .replace(/\./g, '')
      .toUpperCase();
  }

  function parseCopAmount(s) {
    if (s == null || s === '') return 0;
    var t = String(s).trim().replace(/\s/g, '');
    if (t.indexOf(',') >= 0 && t.indexOf('.') >= 0) {
      t = t.replace(/\./g, '').replace(',', '.');
    } else {
      t = t.replace(/,/g, '');
    }
    var n = parseFloat(t);
    return isFinite(n) ? n : 0;
  }

  function nameSimilarity(a, b) {
    a = String(a || '')
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, '')
      .trim();
    b = String(b || '')
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, '')
      .trim();
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (a.indexOf(b) >= 0 || b.indexOf(a) >= 0) return 0.88;
    var aw = a.split(/\s+/);
    var hit = 0;
    aw.forEach(function (w) {
      if (w.length >= 3 && b.indexOf(w) >= 0) hit++;
    });
    return hit / Math.max(aw.length, 1);
  }

  function resolveFeVendorUrl(path) {
    try {
      var a = document.createElement('a');
      a.href = path;
      return a.href;
    } catch (e) {
      return path;
    }
  }

  function ensureJsQR() {
    if (typeof global.jsQR === 'function') return Promise.resolve(global.jsQR);
    if (_jsQrPromise) return _jsQrPromise;
    _jsQrPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.async = true;
      s.setAttribute('data-cxf-jsqr', '1');
      s.src = resolveFeVendorUrl('vendor/CrozzoJsQR.js');
      s.onload = function () {
        if (typeof global.jsQR === 'function') resolve(global.jsQR);
        else reject(new Error('jsQR no disponible'));
      };
      s.onerror = function () {
        reject(new Error('No se pudo cargar jsQR local'));
      };
      document.head.appendChild(s);
    });
    return _jsQrPromise;
  }

  function loadPdfJs() {
    if (global.pdfjsLib && global.pdfjsLib.getDocument) return Promise.resolve(global.pdfjsLib);
    return Promise.reject(new Error('pdf.js no cargado'));
  }

  function runPdfExclusive(fn) {
    var pw = global.CrozzoRecepcionPdfWork;
    if (pw && typeof pw.runExclusive === 'function') return pw.runExclusive(fn);
    return Promise.resolve().then(fn);
  }

  /** Cede el hilo principal para que la navegación siga respondiendo. */
  function feYieldToMain(ms) {
    if (ms == null) ms = feYieldMs();
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function feYieldFrame() {
    return new Promise(function (resolve) {
      requestAnimationFrame(function () {
        setTimeout(resolve, feYieldMs());
      });
    });
  }

  function isFeBatchUi() {
    return !!global.__cxfFeBatchMode;
  }

  function isQrScanScanned() {
    return !!(_activeQrScan && (_activeQrScan.scanned || _activeQrScan.thorough));
  }

  function isQrScanThorough() {
    return !!(_activeQrScan && _activeQrScan.thorough);
  }

  /** Lote + PDF escaneado: lectura QR equilibrada (no congela la UI). */
  function isQrScanBatchLite() {
    return !!(_activeQrScan && (_activeQrScan.profile === 'lite' || _activeQrScan.batchLite));
  }

  function isQrScanUseGrid() {
    return !!(_activeQrScan && _activeQrScan.useGrid);
  }

  function applyQrScanProfile(profileId) {
    var p = QR_SCAN_PROFILES[profileId] || QR_SCAN_PROFILES.standard;
    var batchUi = !!global.__cxfFeBatchMode;
    _activeQrScan = {
      profile: profileId,
      scanned: !!p.scanned,
      thorough: !!p.thorough,
      batch: batchUi,
      batchLite: profileId === 'lite',
      useGrid: !!p.grid,
      forceScales: p.scales ? p.scales.slice() : null,
      maxSide: p.maxSide || 0,
      fullFilters: !!p.fullFilters,
    };
    return p;
  }

  function qrHitValid(qr, fromQuick) {
    if (!qr && (!fromQuick || !fromQuick.length)) return false;
    var resolved = buildCufeResolution(qr, fromQuick || []);
    return isFacturaElectronicaDetectada(resolved, qr);
  }

  function scanQrWithProfile(doc, mime, profileId, onProgress) {
    applyQrScanProfile(profileId);
    return scanQrDeep(doc, mime, onProgress, {
      doc: doc,
      scanned: _activeQrScan.scanned,
      thorough: _activeQrScan.thorough,
    });
  }

  /**
   * Cascada QR: hasta 6 métodos seguidos hasta encontrar CUFE/QR válido.
   */
  function scanQrCascade(doc, mime, opts) {
    opts = opts || {};
    var fromQuick = opts.fromQuick || [];
    var batchMode = !!(opts.batchMode || global.__cxfFeBatchMode);
    var stages = opts.stages;
    if (!stages) {
      if (batchMode) {
        stages = opts.likelyScanned ? QR_CASCADE_BATCH : ['quick', 'standard'];
      } else {
        stages = opts.likelyScanned ? QR_CASCADE_SCANNED : QR_CASCADE_TEXT;
      }
    }
    var smooth = opts.smooth;
    var base = 14;
    var span = 36;
    var chain = Promise.resolve(null);
    var i;
    for (i = 0; i < stages.length; i++) {
      (function (stageIdx, profileId) {
        var prof = QR_SCAN_PROFILES[profileId] || QR_SCAN_PROFILES.standard;
        chain = chain.then(function (prevQr) {
          if (qrHitValid(prevQr, fromQuick)) return prevQr;
          if (smooth) {
            smooth.bump(
              base + (stageIdx / stages.length) * span,
              'QR método ' + (stageIdx + 1) + '/' + stages.length + ': ' + prof.label + '…'
            );
          }
          return feYieldToMain(stageIdx > 0 ? feYieldMs() + 40 : feYieldMs()).then(function () {
            return scanQrWithProfile(doc, mime, profileId, function (ratio, msg) {
              if (smooth) {
                smooth.bump(
                  base + ((stageIdx + Math.min(0.92, ratio || 0)) / stages.length) * span,
                  msg || prof.label
                );
              }
            });
          });
        });
      })(i, stages[i]);
    }
    return chain;
  }

  function feYieldMs() {
    if (isQrScanBatchLite()) return 64;
    if (isFeBatchUi()) return 88;
    return 14;
  }

  function qrScanMaxCanvasSide() {
    if (_activeQrScan && _activeQrScan.maxSide) return _activeQrScan.maxSide;
    if (isQrScanBatchLite()) return 2200;
    if (isQrScanThorough()) return 3600;
    if (isQrScanScanned()) return isFeBatchUi() ? 2800 : 3600;
    return isFeBatchUi() ? 2000 : 3200;
  }

  function dataUrlToUint8(dataUrl) {
    var parts = String(dataUrl || '').split(',');
    var b64 = parts.length > 1 ? parts[1] : parts[0];
    var bin = atob(b64);
    var len = bin.length;
    var arr = new Uint8Array(len);
    for (var i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }

  function configurePdfJsWorker(pdfjsLib) {
    if (pdfjsLib && pdfjsLib.GlobalWorkerOptions) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = resolveFeVendorUrl('vendor/CrozzoPdfJs.worker.js');
    }
  }

  function getPdfBytesFromDoc(doc) {
    if (!doc) return Promise.resolve(null);
    if (doc._viewBlob && !doc._pdfBlob) {
      doc._pdfBlob = doc._viewBlob;
    }
    if (doc._pdfBlob) {
      return doc._pdfBlob.arrayBuffer().then(function (ab) {
        return new Uint8Array(ab);
      });
    }
    if (doc.dataUrl && doc.dataUrl.length > 80) {
      return Promise.resolve(dataUrlToUint8(doc.dataUrl));
    }
    return Promise.resolve(null);
  }

  function openPdfDocument(docOrDataUrl) {
    var bytesP =
      typeof docOrDataUrl === 'object' && docOrDataUrl !== null && !(docOrDataUrl instanceof Uint8Array)
        ? getPdfBytesFromDoc(docOrDataUrl)
        : Promise.resolve(
            typeof docOrDataUrl === 'string' ? dataUrlToUint8(docOrDataUrl) : docOrDataUrl
          );
    return bytesP.then(function (bytes) {
      if (!bytes || !bytes.length) throw new Error('PDF sin datos');
      return loadPdfJs().then(function (pdfjsLib) {
        configurePdfJsWorker(pdfjsLib);
        return pdfjsLib.getDocument({ data: bytes }).promise;
      });
    });
  }

  /** Corrige confusiones típicas de OCR / foto movida en hex. */
  function repairHexOcr(s) {
    return String(s || '')
      .replace(/[\s\r\n\t.\-_:;|'"#]/g, '')
      .replace(/[OoQ]/g, '0')
      .replace(/[Il|!]/g, '1')
      .replace(/[Ss]/g, '5')
      .replace(/[Bb]/g, '8')
      .replace(/[Zz]/g, '2')
      .replace(/[^0-9a-fA-F]/g, '')
      .toLowerCase();
  }

  function isValidCufeHex(hex) {
    hex = repairHexOcr(hex);
    if (!hex) return false;
    if (hex.length < CUFE_HEX_MIN || hex.length > CUFE_HEX_MAX) return false;
    return /^[0-9a-f]+$/.test(hex);
  }

  function scoreCufeCandidate(hex, source) {
    hex = repairHexOcr(hex);
    if (!isValidCufeHex(hex)) return 0;
    var score = 40;
    if (hex.length === CUFE_PREFERRED) score += 35;
    else if (hex.length >= 88) score += 20;
    if (/^cufe|documentkey|qr|dian/i.test(source || '')) score += 25;
    if (/texto|xml|pdf/i.test(source || '')) score += 10;
    if (/qr/i.test(source || '')) score += 30;
    return score;
  }

  function addCufeCandidate(list, raw, source, seen) {
    seen = seen || {};
    var hex = repairHexOcr(raw);
    if (!hex || hex.length < CUFE_HEX_MIN) return;
    if (hex.length > CUFE_HEX_MAX) hex = hex.slice(0, CUFE_HEX_MAX);
    if (!isValidCufeHex(hex)) return;
    if (seen[hex]) return;
    seen[hex] = true;
    list.push({
      cufe: hex,
      source: source || 'texto',
      score: scoreCufeCandidate(hex, source),
    });
  }

  /** Varias técnicas de extracción CUFE (texto plano, espaciado, URL, XML). */
  function extractAllCufeCandidates(text) {
    text = String(text || '');
    var list = [];
    var seen = {};
    var patterns = [
      /CUFE\s*(?:\/\s*CUDE)?[:\s]*([0-9a-fA-F\s.\-]{64,120})/gi,
      /CUDE\s*(?:\/\s*CUFE)?[:\s]*([0-9a-fA-F\s.\-]{64,120})/gi,
      /C[oó]digo\s+[uú]nico[^\n]{0,40}?([0-9a-fA-F\s.\-]{64,120})/gi,
      /documentkey\s*[=:]\s*["']?([0-9a-fA-F\s.\-]{64,120})/gi,
      /DocumentKey\s*[=:]\s*["']?([0-9a-fA-F\s.\-]{64,120})/gi,
      /UUID\s*[>:]?\s*([0-9a-fA-F\-]{64,120})/gi,
      /cbc:UUID[^>]*>([0-9a-fA-F\-]{64,120})</gi,
      /([0-9a-fA-F]{8}[\s.\-]?[0-9a-fA-F]{8}[\s.\-]?[0-9a-fA-F]{8}[\s.\-]?[0-9a-fA-F]{8}[\s.\-]?[0-9a-fA-F]{8}[\s.\-]?[0-9a-fA-F]{8}[\s.\-]?[0-9a-fA-F]{8}[\s.\-]?[0-9a-fA-F]{8}[\s.\-]?[0-9a-fA-F]{8}[\s.\-]?[0-9a-fA-F]{8}[\s.\-]?[0-9a-fA-F]{8}[\s.\-]?[0-9a-fA-F]{8})/gi,
    ];
    patterns.forEach(function (re) {
      var m;
      while ((m = re.exec(text))) {
        addCufeCandidate(list, m[1], 'etiqueta-' + re.source.slice(0, 12), seen);
      }
    });
    var compact = text.replace(/\s+/g, '');
    var blocks = compact.match(/[0-9a-fA-F]{64,96}/g) || [];
    blocks.forEach(function (b) {
      addCufeCandidate(list, b, 'bloque-hex', seen);
    });
    var spaced = text.match(/(?:[0-9a-fA-F][\s.\-]){63,95}[0-9a-fA-F]/gi) || [];
    spaced.forEach(function (b) {
      addCufeCandidate(list, b, 'hex-espaciado', seen);
    });
    list.sort(function (a, b) {
      return b.score - a.score;
    });
    return list;
  }

  function extractCufeFromText(text) {
    var list = extractAllCufeCandidates(text);
    return list.length ? list[0].cufe : '';
  }

  function pickBestCufe(candidates) {
    if (!candidates || !candidates.length) return { cufe: '', source: '', score: 0 };
    var best = candidates[0];
    for (var i = 1; i < candidates.length; i++) {
      if (candidates[i].score > best.score) best = candidates[i];
    }
    return best;
  }

  function mergeCufeCandidates() {
    var lists = [];
    for (var i = 0; i < arguments.length; i++) {
      if (arguments[i] && arguments[i].length) lists = lists.concat(arguments[i]);
    }
    var seen = {};
    var merged = [];
    lists.forEach(function (c) {
      var hex = repairHexOcr(c.cufe || c);
      if (!hex) return;
      if (seen[hex]) {
        var ex = merged.find(function (x) {
          return x.cufe === hex;
        });
        if (ex && c.score > ex.score) ex.score = c.score;
        return;
      }
      seen[hex] = true;
      merged.push(typeof c === 'string' ? { cufe: hex, source: 'merge', score: scoreCufeCandidate(hex, 'merge') } : c);
    });
    merged.sort(function (a, b) {
      return b.score - a.score;
    });
    return merged;
  }

  function parseQrPayload(data) {
    data = String(data || '').trim();
    if (!data) return { url: '', cufe: '' };
    var cufe = '';
    var url = '';
    if (/^https?:\/\//i.test(data)) {
      url = data;
      try {
        var u = new URL(data);
        cufe =
          u.searchParams.get('documentkey') ||
          u.searchParams.get('DocumentKey') ||
          u.searchParams.get('cufe') ||
          u.searchParams.get('CUFE') ||
          extractCufeFromText(data);
      } catch (_) {
        cufe = extractCufeFromText(data);
      }
    } else {
      var kv =
        data.match(/(?:^|[|&;\s])(?:CUFE|CUDE|documentkey|DocumentKey)\s*[=:]\s*([0-9a-fA-F]{64,120})/i) ||
        data.match(/CUFE\s*[=:]\s*([0-9a-fA-F]{64,120})/i);
      if (kv) cufe = kv[1];
      if (!cufe) cufe = extractCufeFromText(data);
      if (!cufe) {
        var compact = data.replace(/\s+/g, '');
        if (compact.length >= 64 && /^[0-9a-f]+$/i.test(compact)) cufe = compact;
      }
    }
    cufe = repairHexOcr(cufe);
    if (cufe && !isValidCufeHex(cufe)) cufe = '';
    if (cufe && !url) url = buildDianConsultaUrl(cufe);
    if (!url && /dian\.gov|catalogo-vpfe|documentkey/i.test(data)) url = data.split(/\s/)[0];
    return { url: url, cufe: cufe, raw: data };
  }

  function buildDianConsultaUrl(cufe) {
    cufe = String(cufe || '').trim();
    if (!cufe) return '';
    return DIAN_QR_BASE + '?documentkey=' + encodeURIComponent(cufe);
  }

  function extractTextFromPdfDataUrl(docOrDataUrl, maxPages) {
    maxPages = maxPages || 3;
    return runPdfExclusive(function () {
      return openPdfDocument(docOrDataUrl).then(function (pdf) {
          var n = Math.min(pdf.numPages, maxPages);
          var chain = Promise.resolve('');
          for (var p = 1; p <= n; p++) {
            (function (pageNum) {
              chain = chain.then(function (acc) {
                return pdf.getPage(pageNum).then(function (page) {
                  return page.getTextContent().then(function (tc) {
                    var t = (tc.items || [])
                      .map(function (it) {
                        return it.str || '';
                      })
                      .join(' ');
                    return acc + '\n' + t;
                  });
                });
              });
            })(p);
          }
          return chain.finally(function () {
            try {
              pdf.destroy();
            } catch (eD) {}
          });
        });
    });
  }

  function cloneImageData(img) {
    return new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
  }

  /** Mejora contraste / nitidez para QR en fotos borrosas o con poca luz. */
  function preprocessImageData(img, mode) {
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
        g2 = g2 < 128 ? Math.max(0, g2 - 40) : Math.min(255, g2 + 40);
        d[i] = d[i + 1] = d[i + 2] = g2;
      }
      return out;
    }

    if (mode === 'threshold') {
      for (i = 0; i < d.length; i += 4) {
        var g3 = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
        var v = g3 > 140 ? 255 : 0;
        d[i] = d[i + 1] = d[i + 2] = v;
      }
      return out;
    }

    if (mode === 'sharpen' && w > 2 && h > 2) {
      var src = new Uint8ClampedArray(d);
      var kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
      for (var y = 1; y < h - 1; y++) {
        for (var x = 1; x < w - 1; x++) {
          var si = (y * w + x) * 4;
          var sum = 0;
          var ki = 0;
          for (var ky = -1; ky <= 1; ky++) {
            for (var kx = -1; kx <= 1; kx++) {
              var pi = ((y + ky) * w + (x + kx)) * 4;
              sum += src[pi] * kernel[ki++];
            }
          }
          sum = Math.max(0, Math.min(255, sum));
          d[si] = d[si + 1] = d[si + 2] = sum;
        }
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

  var PREPROCESS_MODES = ['normal', 'grayscale', 'contrast', 'threshold', 'sharpen', 'invert'];

  /** API nativa del navegador (Edge/Chrome) — suele leer QR más rápido que jsQR solo. */
  function tryBarcodeDetectorOnCanvas(canvas) {
    if (typeof global.BarcodeDetector === 'undefined') return Promise.resolve(null);
    try {
      var det = new global.BarcodeDetector({ formats: ['qr_code'] });
      return det
        .detect(canvas)
        .then(function (codes) {
          if (!codes || !codes.length || !codes[0].rawValue) return null;
          var parsed = parseQrPayload(codes[0].rawValue);
          if (parsed.cufe || parsed.url) {
            parsed.technique = 'BarcodeDetector (nativo)';
            return parsed;
          }
          return null;
        })
        .catch(function () {
          return null;
        });
    } catch (e) {
      return Promise.resolve(null);
    }
  }

  function tryJsQrOnImageData(jsQR, imageData, meta) {
    var batchLite = isQrScanBatchLite() && !(_activeQrScan && _activeQrScan.fullFilters);
    var batch = isFeBatchUi() && !isQrScanScanned() && !(_activeQrScan && _activeQrScan.fullFilters);
    var scanned = isQrScanScanned();
    var attempts = batchLite
      ? [
          { data: imageData, label: meta + ' · original' },
          { data: preprocessImageData(imageData, 'grayscale'), label: meta + ' · gris' },
          { data: preprocessImageData(imageData, 'threshold'), label: meta + ' · umbral' },
          { data: preprocessImageData(imageData, 'contrast'), label: meta + ' · contraste' },
        ]
      : batch
      ? [
          { data: imageData, label: meta + ' · original' },
          { data: preprocessImageData(imageData, 'threshold'), label: meta + ' · umbral' },
        ]
      : scanned
        ? [
            { data: imageData, label: meta + ' · original' },
            { data: preprocessImageData(imageData, 'grayscale'), label: meta + ' · gris' },
            { data: preprocessImageData(imageData, 'contrast'), label: meta + ' · contraste' },
            { data: preprocessImageData(imageData, 'threshold'), label: meta + ' · blanco/negro' },
            { data: preprocessImageData(imageData, 'sharpen'), label: meta + ' · nitidez' },
            { data: preprocessImageData(imageData, 'invert'), label: meta + ' · invertido' },
            {
              data: preprocessImageData(preprocessImageData(imageData, 'grayscale'), 'threshold'),
              label: meta + ' · gris+umbral',
            },
            {
              data: preprocessImageData(preprocessImageData(imageData, 'contrast'), 'threshold'),
              label: meta + ' · contraste+umbral',
            },
          ]
        : [
          { data: imageData, label: meta + ' · original' },
          { data: preprocessImageData(imageData, 'grayscale'), label: meta + ' · gris' },
          { data: preprocessImageData(imageData, 'contrast'), label: meta + ' · contraste' },
          { data: preprocessImageData(imageData, 'threshold'), label: meta + ' · blanco/negro' },
          { data: preprocessImageData(imageData, 'sharpen'), label: meta + ' · nitidez' },
          { data: preprocessImageData(imageData, 'invert'), label: meta + ' · invertido' },
          {
            data: preprocessImageData(preprocessImageData(imageData, 'grayscale'), 'contrast'),
            label: meta + ' · gris+contraste',
          },
          {
            data: preprocessImageData(preprocessImageData(imageData, 'grayscale'), 'threshold'),
            label: meta + ' · gris+umbral',
          },
        ];
    for (var i = 0; i < attempts.length; i++) {
      var pack = attempts[i];
      var code = jsQR(pack.data.data, pack.data.width, pack.data.height, {
        inversionAttempts: batch && !scanned ? 'dontInvert' : 'attemptBoth',
      });
      if (code && code.data) {
        var parsed = parseQrPayload(code.data);
        if (parsed.cufe || parsed.url) {
          parsed.technique = pack.label;
          return parsed;
        }
      }
    }
    return null;
  }

  function getCanvasRegions(canvas, light, scanned) {
    var w = canvas.width;
    var h = canvas.height;
    if (isQrScanBatchLite()) {
      return [
        { name: 'página completa', x: 0, y: 0, cw: w, ch: h },
        {
          name: 'QR inferior derecha',
          x: Math.floor(w * 0.35),
          y: Math.floor(h * 0.5),
          cw: Math.floor(w * 0.65),
          ch: Math.floor(h * 0.5),
        },
        {
          name: 'QR superior derecha',
          x: Math.floor(w * 0.42),
          y: 0,
          cw: Math.floor(w * 0.58),
          ch: Math.floor(h * 0.42),
        },
      ];
    }
    if (isFeBatchUi() && !scanned) {
      return [
        { name: 'página completa', x: 0, y: 0, cw: w, ch: h },
        {
          name: 'QR inferior derecha',
          x: Math.floor(w * 0.38),
          y: Math.floor(h * 0.52),
          cw: Math.floor(w * 0.62),
          ch: Math.floor(h * 0.48),
        },
      ];
    }
    if (scanned) {
      return [
        { name: 'página completa', x: 0, y: 0, cw: w, ch: h },
        { name: 'esquina superior derecha', x: Math.floor(w * 0.4), y: 0, cw: Math.floor(w * 0.6), ch: Math.floor(h * 0.42) },
        { name: 'esquina inferior derecha', x: Math.floor(w * 0.35), y: Math.floor(h * 0.52), cw: Math.floor(w * 0.65), ch: Math.floor(h * 0.48) },
        { name: 'esquina inferior izquierda', x: 0, y: Math.floor(h * 0.5), cw: Math.floor(w * 0.65), ch: Math.floor(h * 0.5) },
        { name: 'franja inferior', x: 0, y: Math.floor(h * 0.62), cw: w, ch: Math.floor(h * 0.38) },
        { name: 'centro', x: Math.floor(w * 0.12), y: Math.floor(h * 0.12), cw: Math.floor(w * 0.76), ch: Math.floor(h * 0.76) },
      ];
    }
    if (light) {
      return [
        { name: 'página completa', x: 0, y: 0, cw: w, ch: h },
        {
          name: 'esquina superior derecha',
          x: Math.floor(w * 0.45),
          y: 0,
          cw: Math.floor(w * 0.55),
          ch: Math.floor(h * 0.45),
        },
      ];
    }
    return [
      { name: 'página completa', x: 0, y: 0, cw: w, ch: h },
      { name: 'esquina superior derecha', x: Math.floor(w * 0.45), y: 0, cw: Math.floor(w * 0.55), ch: Math.floor(h * 0.45) },
      { name: 'esquina superior izquierda', x: 0, y: 0, cw: Math.floor(w * 0.55), ch: Math.floor(h * 0.45) },
      { name: 'esquina inferior derecha', x: Math.floor(w * 0.4), y: Math.floor(h * 0.5), cw: Math.floor(w * 0.6), ch: Math.floor(h * 0.5) },
      { name: 'tercio inferior', x: 0, y: Math.floor(h * 0.55), cw: w, ch: Math.floor(h * 0.45) },
      { name: 'centro ampliado', x: Math.floor(w * 0.15), y: Math.floor(h * 0.15), cw: Math.floor(w * 0.7), ch: Math.floor(h * 0.7) },
    ];
  }

  function cropCanvasRegion(canvas, region) {
    var sub = document.createElement('canvas');
    sub.width = region.cw;
    sub.height = region.ch;
    sub.getContext('2d').drawImage(canvas, region.x, region.y, region.cw, region.ch, 0, 0, region.cw, region.ch);
    return sub;
  }

  /** Rejilla 3×3 con solape — útil cuando el QR es pequeño en PDF escaneado. */
  function scanCanvasGridTiles(jsQR, canvas, scaleLabel, cols, rows) {
    cols = cols || 3;
    rows = rows || 3;
    var w = canvas.width;
    var h = canvas.height;
    var tileW = Math.ceil(w / cols);
    var tileH = Math.ceil(h / rows);
    var chain = Promise.resolve(null);
    var r;
    var c;
    for (r = 0; r < rows; r++) {
      for (c = 0; c < cols; c++) {
        (function (ri, ci) {
          chain = chain.then(function (found) {
            if (found) return found;
            var padX = Math.floor(tileW * 0.08);
            var padY = Math.floor(tileH * 0.08);
            var x = Math.max(0, ci * tileW - padX);
            var y = Math.max(0, ri * tileH - padY);
            var cw = Math.min(w - x, tileW + padX * 2);
            var ch = Math.min(h - y, tileH + padY * 2);
            return scanCanvasRegionAdvanced(
              jsQR,
              canvas,
              { name: 'celda ' + (ri + 1) + '×' + (ci + 1), x: x, y: y, cw: cw, ch: ch },
              scaleLabel + ' · rejilla'
            );
          });
        })(r, c);
      }
    }
    return chain;
  }

  function scanCanvasRegionAdvanced(jsQR, canvas, region, scaleLabel) {
    var sub = cropCanvasRegion(canvas, region);
    var meta = scaleLabel + ' · ' + region.name;
    var px = region.cw * region.ch;
    var yieldP = px > 800000 ? feYieldToMain(90) : feYieldFrame();
    return yieldP.then(function () {
      return tryBarcodeDetectorOnCanvas(sub).then(function (hit) {
        if (hit) {
          hit.technique = (hit.technique || 'BarcodeDetector') + ' · ' + meta;
          return hit;
        }
        return feYieldToMain().then(function () {
          var img = sub.getContext('2d').getImageData(0, 0, sub.width, sub.height);
          return tryJsQrOnImageData(jsQR, img, meta);
        });
      });
    });
  }

  function renderPdfPageToCanvas(page, scale) {
    var viewport = page.getViewport({ scale: scale });
    var maxSide = qrScanMaxCanvasSide();
    var side = Math.max(viewport.width, viewport.height);
    if (side > maxSide) {
      scale = scale * (maxSide / side);
      viewport = page.getViewport({ scale: scale });
    }
    var canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    return page
      .render({ canvasContext: canvas.getContext('2d'), viewport: viewport })
      .promise.then(function () {
        return feYieldToMain(8).then(function () {
          return canvas;
        });
      });
  }

  function loadImageFromDataUrl(dataUrl) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var maxSide = isQrScanScanned() ? 3600 : 2400;
        var w = img.naturalWidth || img.width;
        var h = img.naturalHeight || img.height;
        var sc = 1;
        if (Math.max(w, h) > maxSide) sc = maxSide / Math.max(w, h);
        var canvas = document.createElement('canvas');
        canvas.width = Math.round(w * sc);
        canvas.height = Math.round(h * sc);
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas);
      };
      img.onerror = function () {
        reject(new Error('imagen'));
      };
      img.src = dataUrl;
    });
  }

  function scanCanvasMultiAdvanced(canvas, scaleFactors, onAttempt, light, scanned) {
    if (isQrScanBatchLite()) {
      scaleFactors = [1, 1.12];
      light = false;
      scanned = true;
    } else if (isFeBatchUi() && !scanned) {
      scaleFactors = [1];
      light = true;
    } else if (isFeBatchUi() && scanned) {
      scaleFactors = scaleFactors || [1, 1.22];
      light = false;
    } else {
      scaleFactors =
        scaleFactors ||
        (scanned ? [1, 1.25, 1.5, 1.85, 2.15] : light ? [1, 1.2] : [1, 1.35, 1.7]);
    }
    return ensureJsQR().then(function (jsQR) {
      var chain = Promise.resolve(null);
      var si;
      for (si = 0; si < scaleFactors.length; si++) {
        (function (sf) {
          chain = chain.then(function (found) {
            if (found) return found;
            return feYieldToMain().then(function () {
              var w = canvas.width;
              var h = canvas.height;
              var target = canvas;
              var maxSide = qrScanMaxCanvasSide();
              if (sf !== 1) {
                target = document.createElement('canvas');
                target.width = Math.min(Math.round(w * sf), maxSide);
                target.height = Math.min(Math.round(h * sf), maxSide);
                target.getContext('2d').drawImage(canvas, 0, 0, target.width, target.height);
              }
              return tryBarcodeDetectorOnCanvas(target).then(function (fullHit) {
                if (fullHit) {
                  fullHit.technique =
                    (fullHit.technique || 'BarcodeDetector') +
                    ' · página completa · zoom ' +
                    Math.round(sf * 100) +
                    '%';
                  return fullHit;
                }
                var regions = getCanvasRegions(target, light, scanned);
                var inner = Promise.resolve(null);
                var r;
                for (r = 0; r < regions.length; r++) {
                  (function (reg) {
                    inner = inner.then(function (prev) {
                      if (prev) return prev;
                      if (onAttempt) onAttempt();
                      return feYieldToMain().then(function () {
                        return scanCanvasRegionAdvanced(jsQR, target, reg, 'zoom ' + Math.round(sf * 100) + '%');
                      });
                    });
                  })(regions[r]);
                }
                return inner.then(function (prev) {
                  if (prev || !scanned) return prev;
                  if (!isQrScanUseGrid() && (isQrScanBatchLite() || (!isQrScanThorough() && isFeBatchUi()))) {
                    return prev;
                  }
                  if (onAttempt) onAttempt();
                  return feYieldToMain(100).then(function () {
                    return scanCanvasGridTiles(
                      jsQR,
                      target,
                      'zoom ' + Math.round(sf * 100) + '%',
                      isQrScanThorough() || isQrScanUseGrid() ? 4 : 3,
                      isQrScanThorough() || isQrScanUseGrid() ? 4 : 3
                    );
                  });
                });
              });
            });
          });
        })(scaleFactors[si]);
      }
      return chain;
    });
  }

  /**
   * Lectura QR: BarcodeDetector nativo + jsQR multi-escala, regiones y filtros.
   * scanOpts.scanned = PDF escaneado (foto); scanOpts.thorough = segundo pase profundo.
   */
  function scanQrDeep(dataUrlOrDoc, mime, onProgress, scanOpts) {
    scanOpts = scanOpts || {};
    var batchUi = !!global.__cxfFeBatchMode || !!scanOpts.batchMode;
    var scanned = !!scanOpts.scanned;
    var thorough = !!scanOpts.thorough;
    var light = !scanned && !thorough && (batchUi || !!scanOpts.light);
    _activeQrScan = {
      scanned: scanned,
      thorough: thorough,
      batch: batchUi,
      batchLite: batchUi && scanned && !thorough,
    };
    var doc =
      scanOpts.doc ||
      (typeof dataUrlOrDoc === 'object' && dataUrlOrDoc !== null && !(dataUrlOrDoc instanceof Uint8Array)
        ? dataUrlOrDoc
        : null);
    var dataUrl =
      typeof dataUrlOrDoc === 'string'
        ? dataUrlOrDoc
        : (doc && doc.dataUrl) || '';
    mime = String(mime || (doc && doc.mime) || '');
    var isPdf =
      mime.indexOf('pdf') >= 0 ||
      /^data:application\/pdf/i.test(dataUrl) ||
      !!(doc && doc._pdfBlob);
    var quick = !!scanOpts.quick;
    var attempt = 0;
    var totalEst = scanned || thorough ? 52 : quick || light ? 14 : 36;
    var lastQrProgressAt = 0;
    function tickQr(msg) {
      attempt++;
      if (typeof onProgress !== 'function') return;
      var now = Date.now();
      if (batchUi && now - lastQrProgressAt < 500) return;
      lastQrProgressAt = now;
      onProgress(Math.min(0.98, attempt / totalEst), msg || 'Escaneando código QR…');
    }
    tickQr(
      scanned || thorough
        ? 'Escaneo profundo (PDF foto/escáner)…'
        : 'Iniciando lectores QR (nativo + jsQR)…'
    );
    if (isPdf) {
      tickQr('Abriendo PDF…');
      return runPdfExclusive(function () {
        return openPdfDocument(doc || dataUrl).then(function (pdf) {
          var maxP = batchUi ? 1 : scanned || thorough ? Math.min(pdf.numPages, 2) : quick || light ? 1 : Math.min(pdf.numPages, 2);
          var renderScales;
          if (_activeQrScan && _activeQrScan.forceScales && _activeQrScan.forceScales.length) {
            renderScales = _activeQrScan.forceScales;
          } else if (batchUi && !scanned && !thorough) {
            renderScales = [2];
          } else if (isQrScanBatchLite()) {
            renderScales = [2.4, 3.1];
          } else if (batchUi && scanned) {
            renderScales = thorough ? [3.2, 4] : [2.6, 3.2];
          } else if (scanned || thorough) {
            renderScales = thorough ? [3.2, 3.8, 4.4, 5] : [2.6, 3.2, 3.8, 4.2, 4.8];
          } else if (light) {
            renderScales = [2, 2.6];
          } else if (quick) {
            renderScales = [2, 2.8, 3.2];
          } else {
            renderScales = [2, 2.8, 3.2, 3.6];
          }
          var chain = Promise.resolve(null);
          var p;
          for (p = 1; p <= maxP; p++) {
            (function (pageNum) {
              chain = chain.then(function (found) {
                if (found) return found;
                return feYieldToMain(batchUi ? 40 : 12).then(function () {
                  tickQr('Página ' + pageNum + ' · QR…');
                  var inner = Promise.resolve(null);
                  var ri;
                  for (ri = 0; ri < renderScales.length; ri++) {
                    (function (rs) {
                      inner = inner.then(function (prev) {
                        if (prev) return prev;
                        return feYieldToMain().then(function () {
                          tickQr('Pág. ' + pageNum + ' · escala ' + rs + '×…');
                          return pdf.getPage(pageNum).then(function (page) {
                            return renderPdfPageToCanvas(page, rs).then(function (cvs) {
                              return scanCanvasMultiAdvanced(cvs, null, tickQr, light, scanned || thorough).then(
                                function (hit) {
                                  if (hit) {
                                    hit.page = pageNum;
                                    hit.technique = (hit.technique || '') + ' · pág. ' + pageNum;
                                  }
                                  return hit;
                                }
                              );
                            });
                          });
                        });
                      });
                    })(renderScales[ri]);
                  }
                  return inner;
                });
              });
            })(p);
          }
          return chain.finally(function () {
            try {
              pdf.destroy();
            } catch (eD2) {}
          });
        });
      }).finally(function () {
        _activeQrScan = null;
      });
    }
    tickQr('Imagen · buscando QR…');
    return loadImageFromDataUrl(dataUrl)
      .then(function (canvas) {
        return scanCanvasMultiAdvanced(
          canvas,
          scanned || thorough ? [1, 1.35, 1.7, 2] : light ? [1, 1.35] : [1, 1.35, 1.7],
          tickQr,
          light,
          scanned || thorough
        );
      })
      .finally(function () {
        _activeQrScan = null;
      });
  }

  function scanQrFromPdfDataUrl(dataUrl) {
    return scanQrDeep(dataUrl, 'application/pdf').catch(function () {
      return null;
    });
  }

  function buildCufeResolution(qr, textCandidates) {
    var fromQr = [];
    if (qr && qr.cufe) {
      fromQr.push({
        cufe: qr.cufe,
        source: 'qr-' + (qr.technique || 'lectura'),
        score: scoreCufeCandidate(qr.cufe, 'qr') + 30,
      });
    }
    if (qr && qr.raw && !qr.cufe) {
      extractAllCufeCandidates(qr.raw).forEach(function (c) {
        fromQr.push(c);
      });
    }
    var merged = mergeCufeCandidates(fromQr, textCandidates || []);
    var best = pickBestCufe(merged);
    return {
      qr: qr,
      cufe: best.cufe,
      cufeSource: best.source,
      cufeScore: best.score,
      cufeCandidates: merged.slice(0, 5),
      cufeValidado: isValidCufeHex(best.cufe),
    };
  }

  /**
   * Resuelve CUFE unificando QR + texto PDF con validación y mejor candidato.
   */
  function resolveQrAndCufe(doc, pdfText, onProgress) {
    pdfText = pdfText || '';
    var fromText = extractAllCufeCandidates(pdfText);
    var likelyScanned = pdfText.replace(/\s/g, '').length < 40;
    return scanQrDeep(doc, doc.mime || '', function (ratio, msg) {
      if (typeof onProgress === 'function') onProgress(32 + ratio * 36, msg);
    }, { doc: doc, scanned: likelyScanned }).then(function (qr) {
      return buildCufeResolution(qr, fromText);
    });
  }

  /**
   * Fase 1: solo QR + CUFE (rápido). Si hay FE, el análisis completo sigue después.
   */
  function docHasBinary(doc) {
    return !!(doc && (doc._pdfBlob || (doc.dataUrl && doc.dataUrl.length > 80)));
  }

  function detectFeElectronica(doc, opts) {
    opts = opts || {};
    var batchMode = !!(opts.batchMode || global.__cxfFeBatchMode);
    if (opts.batchMode) global.__cxfFeBatchMode = true;
    var mime = String((doc && doc.mime) || '');
    var isPdf =
      mime.indexOf('pdf') >= 0 ||
      /^data:application\/pdf/i.test(doc.dataUrl || '') ||
      !!(doc && doc._pdfBlob);
    var smooth = createSmoothProgress(opts);
    smooth.start(52, 'Buscando código QR y CUFE…', 'detect', { init: true });

    var quickTextP = isPdf
      ? extractTextFromPdfDataUrl(doc, 1).then(function (t) {
          smooth.bump(11, 'Texto página 1 · candidatos CUFE…');
          return t;
        })
      : Promise.resolve('');

    return quickTextP
      .then(function (quickText) {
        var fromQuick = extractAllCufeCandidates(quickText);
        var likelyScanned = quickText.replace(/\s/g, '').length < 40;
        if (qrHitValid(null, fromQuick)) {
          smooth.bump(48, 'CUFE detectado en texto del PDF');
          return { qr: null, quickText: quickText, fromQuick: fromQuick };
        }
        if (likelyScanned) {
          smooth.bump(10, 'PDF escaneado — probando varios métodos de lectura QR…');
        }
        return scanQrCascade(doc, mime, {
          likelyScanned: likelyScanned,
          fromQuick: fromQuick,
          smooth: smooth,
          batchMode: batchMode,
        }).then(function (qr) {
          return { qr: qr, quickText: quickText, fromQuick: fromQuick };
        });
      })
      .then(function (pack) {
        var resolved = buildCufeResolution(pack.qr, pack.fromQuick);
        var esElectronica = isFacturaElectronicaDetectada(resolved, pack.qr);
        smooth.stop(
          esElectronica ? 56 : 54,
          esElectronica
            ? 'Factura electrónica confirmada (QR/CUFE)'
            : likelyScannedPdfHint(pack.quickText, pack.qr, resolved),
          'cufe',
          { init: true, detect: true, cufe: true }
        );
        return {
          esElectronica: esElectronica,
          qr: pack.qr,
          quickText: pack.quickText,
          cufeResolved: resolved,
        };
      });
  }

  function likelyScannedPdfHint(quickText, qr, resolved) {
    if (quickText && quickText.replace(/\s/g, '').length >= 40) {
      return 'Sin QR ni CUFE válido — no parece FE';
    }
    if (resolved && resolved.cufe && !resolved.cufeValidado) {
      return 'CUFE dudoso en imagen — confirme con «Abrir en DIAN» o suba PDF original de la DIAN';
    }
    if (!qr || !qr.cufe) {
      return 'PDF escaneado: no se leyó el QR — acerque foto, más luz, o suba el PDF original (no solo escáner)';
    }
    return 'Sin QR ni CUFE válido — no parece FE';
  }

  function parseFeFromText(text) {
    text = String(text || '');
    var flat = text.replace(/\s+/g, ' ');
    var out = {
      cufe: extractCufeFromText(text),
      nitEmisor: '',
      razonSocial: '',
      numeroFactura: '',
      total: 0,
      fecha: '',
      lineas: [],
      rawExcerpt: text.slice(0, 2000),
    };
    var nitM =
      flat.match(/NIT[:\s]*([0-9]{3,3}\.?[0-9]{3}\.?[0-9]{3}[-–]?[0-9K])/i) ||
      flat.match(/Emisor[^0-9]*([0-9]{9,10}[-–]?[0-9K])/i);
    if (nitM) out.nitEmisor = nitM[1].replace(/\s/g, '');
    var rsM = flat.match(/Raz[oó]n\s+social[:\s]*([^|]{4,80}?)(?:\s+NIT|\s+DV|\s+CUFE|$)/i);
    if (rsM) out.razonSocial = rsM[1].trim();
    var feM =
      flat.match(/(?:Factura\s+electr[oó]nica|N[uú]mero\s+de\s+factura|FEV|Prefijo)[:\s#]*([A-Z]{0,6}[-\s]?[0-9]{4,12})/i) ||
      flat.match(/\b(FE[A-Z]?[-_]?\d{4,})\b/i);
    if (feM) out.numeroFactura = feM[1].replace(/\s/g, '');
    var totM =
      flat.match(/Total\s+a\s+pagar[:\s]*\$?\s*([\d.,]+)/i) ||
      flat.match(/PayableAmount[^0-9]*([\d.,]+)/i) ||
      flat.match(/Total\s+factura[:\s]*\$?\s*([\d.,]+)/i) ||
      flat.match(/Valor\s+total[:\s]*\$?\s*([\d.,]+)/i);
    if (totM) out.total = parseCopAmount(totM[1]);
    var lines = text.split(/\n/);
    lines.forEach(function (ln) {
      var row = ln.match(/^(.{3,60}?)\s+([\d.,]+)\s+([\d.,]+)\s*$/);
      if (row && !/total|subtotal|iva|cufe/i.test(row[1])) {
        out.lineas.push({
          descripcion: row[1].trim(),
          cantidad: parseCopAmount(row[2]),
          valor: parseCopAmount(row[3]),
        });
      }
    });
    if (!out.lineas.length) {
      var descRe = /Descripción[:\s]*([^\n]{4,80})/gi;
      var m;
      while ((m = descRe.exec(text)) && out.lineas.length < 12) {
        out.lineas.push({ descripcion: m[1].trim(), cantidad: 1, valor: 0 });
      }
    }
    return out;
  }

  function fetchDianConsulta(cufe) {
    var url = buildDianConsultaUrl(cufe);
    if (!url) return Promise.resolve({ ok: false, motivo: 'Sin CUFE' });
    return fetch(url, { method: 'GET', mode: 'cors', credentials: 'omit' })
      .then(function (res) {
        if (!res.ok) return { ok: false, motivo: 'DIAN respondió ' + res.status, url: url };
        return res.text().then(function (html) {
          return {
            ok: true,
            url: url,
            html: html,
            parsed: parseFeFromText(html),
          };
        });
      })
      .catch(function (err) {
        return {
          ok: false,
          motivo: 'No se pudo consultar DIAN en automático (red o CORS). Use «Abrir en DIAN».',
          url: url,
          error: String((err && err.message) || err),
        };
      });
  }

  function matchProveedor(prov, fe) {
    prov = prov || {};
    fe = fe || {};
    var nitP = normNit(prov.nit);
    var nitF = normNit(fe.nitEmisor);
    var simNombre = nameSimilarity(
      prov.nombre || prov.name,
      fe.razonSocial || prov.legal && prov.legal.razonSocial
    );
    var simRazon = nameSimilarity(
      prov.legal && prov.legal.razonSocial,
      fe.razonSocial
    );
    var sim = Math.max(simNombre, simRazon);
    if (nitP && nitF && nitP === nitF) {
      return {
        ok: true,
        score: 98,
        etiqueta: 'Coincide NIT',
        detalle: 'El NIT del proveedor seleccionado coincide con el emisor de la FE.',
      };
    }
    if (sim >= 0.72) {
      return {
        ok: true,
        score: Math.round(sim * 100),
        etiqueta: 'Nombre relacionado',
        detalle: 'El proveedor en sesión parece corresponder al emisor (' + Math.round(sim * 100) + '% similitud).',
      };
    }
    if (nitF && nitP && nitP !== nitF) {
      return {
        ok: false,
        score: 20,
        etiqueta: 'NIT distinto',
        detalle:
          'Proveedor en sesión: ' +
          (prov.nit || '—') +
          ' · Emisor en factura: ' +
          (fe.nitEmisor || '—') +
          '. Revise que eligió el proveedor correcto.',
      };
    }
    return {
      ok: false,
      score: 0,
      etiqueta: 'Sin validar',
      detalle: 'No se pudo relacionar automáticamente — confirme manualmente.',
    };
  }

  function verifyValorCajero(valorCajero, totalFe) {
    var caj = Number(valorCajero) || 0;
    var fe = Number(totalFe) || 0;
    if (!fe) return { ok: null, detalle: 'Total en FE no detectado — ingrese valor manualmente.' };
    if (!caj) return { ok: null, detalle: 'Ingrese el valor que registró el cajero para comparar.' };
    var diff = Math.abs(caj - fe);
    var tol = Math.max(100, fe * 0.005);
    if (diff <= tol) {
      return {
        ok: true,
        detalle: 'Coincide: cajero ' + fmtCop(caj) + ' · FE ' + fmtCop(fe),
        diff: diff,
      };
    }
    return {
      ok: false,
      detalle:
        'Diferencia ' +
        fmtCop(diff) +
        ' — cajero ' +
        fmtCop(caj) +
        ' vs FE ' +
        fmtCop(fe),
      diff: diff,
    };
  }

  function fmtCop(n) {
    if (global.CrozzoReservorio && global.CrozzoReservorio.fmtCop) {
      return global.CrozzoReservorio.fmtCop(n);
    }
    return '$' + Math.round(Number(n) || 0).toLocaleString('es-CO');
  }

  function suggestMpLines(feLineas, mpCatalog) {
    feLineas = feLineas || [];
    mpCatalog = mpCatalog || [];
    return feLineas.map(function (ln) {
      var desc = String(ln.descripcion || '').trim();
      var best = null;
      var bestScore = 0;
      mpCatalog.forEach(function (mp) {
        var sim = nameSimilarity(desc, mp.nombre);
        if (sim > bestScore) {
          bestScore = sim;
          best = mp;
        }
      });
      var precio = ln.valor > 0 ? ln.valor : ln.cantidad > 0 && ln.valor ? ln.valor / ln.cantidad : 0;
      return {
        descripcion: desc,
        mpId: best && bestScore >= 0.35 ? best.id : '',
        mpNombre: best ? best.nombre : '',
        cant: ln.cantidad > 0 ? String(ln.cantidad) : '1',
        precio: precio > 0 ? String(Math.round(precio)) : '',
        confianza: Math.round(bestScore * 100),
      };
    });
  }

  function pushQrCufePasos(pasos, qr, resolved) {
    if (qr && (qr.cufe || qr.url)) {
      pasos.push({
        id: 'qr',
        ok: true,
        titulo: 'Código QR',
        detalle:
          (qr.cufe ? 'CUFE en QR' : 'URL DIAN') +
          (qr.technique ? ' · ' + qr.technique : '') +
          (qr.page ? ' · página ' + qr.page : ''),
      });
    } else {
      pasos.push({
        id: 'qr',
        ok: false,
        titulo: 'Código QR',
        detalle:
          'No se leyó QR (BarcodeDetector + jsQR) — suba PDF original o foto más nítida',
      });
    }
    var cufeOk = resolved.cufeValidado;
    var alt = resolved.cufeCandidates && resolved.cufeCandidates.length > 1;
    pasos.push({
      id: 'cufe',
      ok: cufeOk,
      warn: !cufeOk && resolved.cufe,
      titulo: 'CUFE / factura electrónica',
      detalle: cufeOk
        ? resolved.cufe.length +
          ' caracteres · ' +
          (resolved.cufeSource || 'consenso') +
          (alt ? ' · ' + resolved.cufeCandidates.length + ' candidatos' : '')
        : resolved.cufe
          ? 'CUFE dudoso — verifique en DIAN'
          : 'Sin CUFE válido — no se confirmó FE',
    });
  }

  function finalizeFeAnalisis(ctx, pasos, opts, prov, valorCajero, mpCatalog) {
    var fe = ctx.fe || {};
    var esElectronica = ctx.esElectronica;
    var provMatch = matchProveedor(prov, fe);
    pasos.push({
      id: 'prov',
      ok: provMatch.ok,
      titulo: 'Proveedor en sesión',
      detalle: provMatch.detalle,
    });
    var valorVer = verifyValorCajero(valorCajero, fe.total);
    pasos.push({
      id: 'valor',
      ok: valorVer.ok === true,
      warn: valorVer.ok === null,
      titulo: 'Valor cajero vs FE',
      detalle: valorVer.detalle,
    });
    var sugeridas = suggestMpLines(fe.lineas, mpCatalog);
    pasos.push({
      id: 'mp',
      ok: sugeridas.some(function (s) {
        return s.mpId;
      }),
      titulo: 'Materias primas sugeridas',
      detalle: sugeridas.length
        ? sugeridas.length +
          ' línea(s) — ' +
          sugeridas.filter(function (s) {
            return s.mpId;
          }).length +
          ' con match en catálogo'
        : 'Sin ítems detectados — cargue líneas manualmente',
    });
    emitProgress(opts, 100, 'Análisis completado', 'cierre', {
      init: true,
      detect: true,
      cufe: true,
      texto: true,
      dian: true,
      cierre: true,
    });
    return {
      estado: 'listo',
      esElectronica: esElectronica,
      cufe: fe.cufe,
      cufeValidado: ctx.cufeResolved && ctx.cufeResolved.cufeValidado,
      cufeSource: ctx.cufeResolved && ctx.cufeResolved.cufeSource,
      cufeCandidates: (ctx.cufeResolved && ctx.cufeResolved.cufeCandidates) || [],
      dianUrl: buildDianConsultaUrl(fe.cufe) || (ctx.qr && ctx.qr.url) || '',
      fe: fe,
      pasos: pasos,
      proveedorMatch: provMatch,
      valorVerificacion: valorVer,
      lineasSugeridas: sugeridas,
      analizadoAt: new Date().toISOString(),
      progreso: { pct: 100, label: 'Completado', stepId: 'cierre' },
    };
  }

  /**
   * Analiza FE: primero QR+CUFE; si es electrónica, texto completo → DIAN → proveedor/MP.
   */
  function analyzeFacturaElectronica(opts) {
    opts = opts || {};
    var doc = opts.doc;
    var prov = opts.proveedor;
    var valorCajero = opts.valorCajero;
    var mpCatalog = opts.mpCatalog || [];
    var mime = String((doc && doc.mime) || '');
    var isPdf = mime.indexOf('pdf') >= 0;
    var isImg = mime.indexOf('image') >= 0;
    if (!doc || (!doc.dataUrl && !doc._pdfBlob)) {
      return Promise.resolve({
        estado: 'error',
        esElectronica: false,
        pasos: [{ id: 'doc', ok: false, titulo: 'Documento', detalle: 'Sin archivo' }],
      });
    }

    var pasos = [];
    var batchMode = !!(opts.batchMode || global.__cxfFeBatchMode);
    emitProgress(opts, 5, 'Preparando lectura del documento…', 'init');

    var detectP;
    if (opts.qrPrefill && (opts.qrPrefill.cufe || opts.qrPrefill.url)) {
      var preResolved = buildCufeResolution(opts.qrPrefill, []);
      detectP = Promise.resolve({
        esElectronica: isFacturaElectronicaDetectada(preResolved, opts.qrPrefill),
        qr: opts.qrPrefill,
        quickText: '',
        cufeResolved: preResolved,
      });
      emitProgress(opts, 52, 'QR capturado — completando análisis…', 'detect', { init: true });
    } else {
      detectP = feYieldToMain(batchMode ? 48 : 0).then(function () {
        return detectFeElectronica(doc, opts);
      });
    }

    return detectP
      .then(function (det) {
        var qr = det.qr;
        var resolved = det.cufeResolved;
        var esElectronica = det.esElectronica;
        pushQrCufePasos(pasos, qr, resolved);

        if (!esElectronica) {
          emitProgress(opts, 100, 'Sin factura electrónica detectada', 'cierre', {
            init: true,
            detect: true,
            cufe: true,
            cierre: true,
          });
          return {
            estado: 'listo',
            esElectronica: false,
            cufe: resolved.cufe || '',
            cufeValidado: false,
            pasos: pasos,
            fe: {},
            dianUrl: '',
            analizadoAt: new Date().toISOString(),
            progreso: { pct: 100, label: 'Sin FE clara', stepId: 'cierre' },
          };
        }

        emitProgress(opts, 60, 'Extrayendo datos del documento…', 'texto', {
          init: true,
          detect: true,
          cufe: true,
        });
        pasos.push({ id: 'texto', ok: false, titulo: 'Texto del documento', detalle: 'Extrayendo…' });

        var maxTextPages = batchMode ? 1 : 4;
        var textP =
          isPdf && det.quickText && det.quickText.length > 80 && !batchMode
            ? extractTextFromPdfDataUrl(doc, maxTextPages).then(function (full) {
                return full.length > det.quickText.length ? full : det.quickText;
              })
            : isPdf
              ? extractTextFromPdfDataUrl(doc, maxTextPages)
              : Promise.resolve(det.quickText || '');

        return feYieldToMain(batchMode ? 40 : 0).then(function () {
          return textP;
        }).then(function (text) {
          var fe = parseFeFromText(text);
          if (resolved.cufe) fe.cufe = resolved.cufe;
          if (qr && qr.url) fe.qrUrl = qr.url;
          if (qr && qr.cufe && !fe.cufe) fe.cufe = qr.cufe;

          var okText = !!(fe.cufe || fe.total || fe.nitEmisor || fe.lineas.length);
          pasos[pasos.length - 1] = {
            id: 'texto',
            ok: okText,
            titulo: 'Texto del documento',
            detalle: okText
              ? (fe.total ? 'Total y datos leídos' : 'Datos parciales del PDF')
              : isImg
                ? 'Imagen — datos desde QR/CUFE'
                : 'Poco texto en el archivo',
          };
          emitProgress(opts, 72, 'Texto procesado', 'texto', {
            init: true,
            detect: true,
            cufe: true,
            texto: true,
          });

          var ctx = {
            qr: qr,
            fe: fe,
            text: text,
            cufeResolved: resolved,
            esElectronica: true,
          };
          var cufe = fe.cufe || '';
          if (!cufe) {
            pasos.push({
              id: 'dian',
              ok: false,
              titulo: 'Consulta DIAN',
              detalle: 'Sin CUFE para consultar VPFE',
            });
            return finalizeFeAnalisis(ctx, pasos, opts, prov, valorCajero, mpCatalog);
          }

          emitProgress(opts, 78, 'Consultando portal DIAN…', 'dian', {
            init: true,
            detect: true,
            cufe: true,
            texto: true,
          });
          pasos.push({ id: 'dian', ok: false, titulo: 'Consulta DIAN', detalle: 'Consultando…' });
          if (batchMode) {
            pasos[pasos.length - 1] = {
              id: 'dian',
              ok: null,
              warn: true,
              titulo: 'Consulta DIAN',
              detalle: 'Omitida en lote — use «Abrir en DIAN» o Reanalizar en esta factura',
            };
            ctx.dian = { ok: false, motivo: 'Consulta diferida en análisis por lote', url: buildDianConsultaUrl(cufe) };
            return feYieldToMain(20).then(function () {
              return finalizeFeAnalisis(ctx, pasos, opts, prov, valorCajero, mpCatalog);
            });
          }
          return feYieldToMain(16).then(function () {
            return fetchDianConsulta(cufe);
          }).then(function (dian) {
            ctx.dian = dian;
            if (dian.ok && dian.parsed) {
              if (dian.parsed.total && !ctx.fe.total) ctx.fe.total = dian.parsed.total;
              if (dian.parsed.numeroFactura && !ctx.fe.numeroFactura) {
                ctx.fe.numeroFactura = dian.parsed.numeroFactura;
              }
              if (dian.parsed.nitEmisor && !ctx.fe.nitEmisor) ctx.fe.nitEmisor = dian.parsed.nitEmisor;
              pasos[pasos.length - 1] = {
                id: 'dian',
                ok: true,
                titulo: 'Consulta DIAN',
                detalle: 'Datos leídos del portal DIAN',
              };
            } else {
              pasos[pasos.length - 1] = {
                id: 'dian',
                ok: false,
                titulo: 'Consulta DIAN',
                detalle: (dian && dian.motivo) || 'Use el enlace para validar en el navegador',
                url: (dian && dian.url) || buildDianConsultaUrl(cufe),
              };
            }
            emitProgress(opts, 88, 'Cruzando proveedor, total y líneas…', 'cierre', {
              init: true,
              detect: true,
              cufe: true,
              texto: true,
              dian: true,
            });
            return finalizeFeAnalisis(ctx, pasos, opts, prov, valorCajero, mpCatalog);
          });
        });
      })
      .catch(function (err) {
        return {
          estado: 'error',
          esElectronica: false,
          pasos: pasos.concat([
            { id: 'err', ok: false, titulo: 'Error', detalle: String((err && err.message) || err) },
          ]),
        };
      });
  }

  function renderFeAnalisisLoader(progreso, opts) {
    opts = opts || {};
    progreso = progreso || createInitialProgreso();
    var pct = progreso.pct || 0;
    var pid = opts.provId || '';
    var fid = opts.facturaId || '';
    var steps = progreso.steps || buildLoaderSteps(progreso.stepId || 'init', {});
    var html =
      '<div class="cxf-fe-loader" data-fe-loader data-prov-id="' +
      esc(pid) +
      '" data-factura-id="' +
      esc(fid) +
      '" role="status" aria-live="polite" aria-busy="true">' +
      '<div class="cxf-fe-loader__head">' +
      '<div class="cxf-fe-loader__spinner" aria-hidden="true"></div>' +
      '<div class="cxf-fe-loader__head-text">' +
      '<p class="cxf-fe-loader__eyebrow">Modo complejo</p>' +
      '<p class="cxf-fe-loader__title">Analizando factura electrónica</p>' +
      '<p class="cxf-fe-loader__label" data-fe-loader-label>' +
      esc(progreso.label || 'Procesando…') +
      '</p></div></div>' +
      '<div class="cxf-fe-loader__bar-wrap">' +
      '<div class="cxf-fe-loader__bar" data-fe-loader-bar style="width:' +
      pct +
      '%"><span class="cxf-fe-loader__bar-shine"></span></div></div>' +
      '<div class="cxf-fe-loader__pct-row">' +
      '<span class="cxf-fe-loader__pct" data-fe-loader-pct>' +
      pct +
      '%</span>' +
      '<span class="cxf-fe-loader__hint">Puede revisar otras facturas arriba/abajo</span></div>' +
      '<ul class="cxf-fe-loader__steps" data-fe-loader-steps>';
    steps.forEach(function (s) {
      var cls = 'cxf-fe-loader__step';
      if (s.done) cls += ' is-done';
      else if (s.active) cls += ' is-active';
      html +=
        '<li class="' +
        cls +
        '" data-fe-step="' +
        esc(s.id) +
        '">' +
        '<span class="cxf-fe-loader__step-dot" aria-hidden="true"></span>' +
        '<span>' +
        esc(s.label) +
        '</span></li>';
    });
    html += '</ul></div>';
    return html;
  }

  function renderAnalisisPanel(analisis, opts) {
    opts = opts || {};
    analisis = analisis || {};
    var pasos = analisis.pasos || [];
    var pid = opts.provId || '';
    var fid = opts.facturaId || '';
    var html =
      '<div class="cxf-fe-analisis" data-fe-analisis data-prov-id="' +
      esc(pid) +
      '" data-factura-id="' +
      esc(fid) +
      '">';
    html +=
      '<header class="cxf-fe-analisis__head">' +
      '<p class="cxf-eyebrow">Modo complejo · Análisis FE</p>' +
      '<h4 class="cxf-fe-analisis__title">' +
      (analisis.esElectronica
        ? 'Factura electrónica detectada'
        : 'Documento sin FE clara') +
      '</h4>';
    if (analisis.cufe) {
      html +=
        '<p class="form-hint cxf-fe-analisis__cufe"><strong>CUFE:</strong> <code title="' +
        esc(analisis.cufe) +
        '">' +
        esc(analisis.cufe.slice(0, 28)) +
        '…</code>' +
        (analisis.cufeValidado
          ? ' <span class="badge badge-success">Validado</span>'
          : ' <span class="badge badge-warning">Revisar</span>') +
        (analisis.cufeSource
          ? ' <span class="form-hint">(' + esc(analisis.cufeSource) + ')</span>'
          : '') +
        '</p>';
    }
    html += '</header><ol class="cxf-fe-analisis__steps">';
    pasos.forEach(function (p) {
      var cls = p.ok ? 'is-ok' : p.warn ? 'is-warn' : 'is-fail';
      html +=
        '<li class="cxf-fe-analisis__step ' +
        cls +
        '"><span class="cxf-fe-analisis__icon" aria-hidden="true">' +
        (p.ok ? '✓' : p.warn ? '○' : '✗') +
        '</span><div><strong>' +
        esc(p.titulo) +
        '</strong><p class="form-hint">' +
        esc(p.detalle) +
        '</p>' +
        (p.url
          ? '<a class="btn btn-link btn-sm" href="' +
            esc(p.url) +
            '" target="_blank" rel="noopener">Abrir en DIAN</a>'
          : '') +
        '</div></li>';
    });
    html += '</ol>';
    if (analisis.estado === 'listo' || analisis.estado === 'error') {
      var sinQr = !analisis.cufe;
      html += '<div class="cxf-fe-analisis__actions">';
      if (sinQr) {
        html +=
          '<p class="cxf-fe-analisis__qr-hint">No se detectó QR en el PDF. Use la cámara para leer el código impreso en la factura.</p>';
      }
      html +=
        '<button type="button" class="' +
        (sinQr ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm') +
        '" data-cxf-fe-camara data-prov-id="' +
        esc(pid) +
        '" data-factura-id="' +
        esc(fid) +
        '">📷 ' +
        (sinQr ? 'Escanear QR con cámara' : 'Cámara QR') +
        '</button> ';
      if (analisis.dianUrl) {
        html +=
          '<a class="btn btn-outline btn-sm" href="' +
          esc(analisis.dianUrl) +
          '" target="_blank" rel="noopener">🌐 Validar en DIAN</a> ';
      }
      if (analisis.estado === 'listo') {
        html +=
          '<button type="button" class="btn btn-primary btn-sm" data-cxf-fe-aplicar data-prov-id="' +
          esc(pid) +
          '" data-factura-id="' +
          esc(fid) +
          '">Aplicar datos al formulario</button> ';
      }
      html +=
        '<button type="button" class="btn btn-outline btn-sm" data-cxf-fe-reanalizar data-prov-id="' +
        esc(pid) +
        '" data-factura-id="' +
        esc(fid) +
        '">↻ Reanalizar</button></div>';
    } else if (analisis.estado === 'analizando') {
      html += '<p class="cxf-muted">Analizando documento…</p>';
    }
    html += '</div>';
    return html;
  }

  global.CrozzoRecepcionFeDian = {
    analyzeFacturaElectronica: analyzeFacturaElectronica,
    renderFeAnalisisLoader: renderFeAnalisisLoader,
    createInitialProgreso: createInitialProgreso,
    renderAnalisisPanel: renderAnalisisPanel,
    parseFeFromText: parseFeFromText,
    parseQrPayload: parseQrPayload,
    buildDianConsultaUrl: buildDianConsultaUrl,
    matchProveedor: matchProveedor,
    verifyValorCajero: verifyValorCajero,
    suggestMpLines: suggestMpLines,
    extractCufeFromText: extractCufeFromText,
    extractAllCufeCandidates: extractAllCufeCandidates,
    scanQrDeep: scanQrDeep,
    resolveQrAndCufe: resolveQrAndCufe,
    detectFeElectronica: detectFeElectronica,
    isValidCufeHex: isValidCufeHex,
  };
})(typeof window !== 'undefined' ? window : globalThis);
