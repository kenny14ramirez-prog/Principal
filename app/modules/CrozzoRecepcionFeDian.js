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

  /** Perfil de entrenamiento (83 facturas integrar/facturas de pruebas) — métricas para UI y diagnóstico. */
  var _feTrainingProfile = null;
  var FE_TRAINING_FALLBACK = {
    version: 2,
    trainedAt: '2026-05-30',
    sampleSize: 83,
    okFePct: 41,
    scannedFailPct: 58,
    hint:
      'Entrenamiento 83 facturas: ~41% detectan FE en lote automático. Escaneos sin QR: use «Reanalizar» o marque el QR en la vista.',
  };

  function getFeTrainingProfile() {
    return _feTrainingProfile || FE_TRAINING_FALLBACK;
  }

  function loadFeTrainingProfile() {
    if (_feTrainingProfile && _feTrainingProfile._loaded) {
      return Promise.resolve(_feTrainingProfile);
    }
    if (typeof fetch !== 'function') {
      _feTrainingProfile = Object.assign({}, FE_TRAINING_FALLBACK, { _loaded: true });
      return Promise.resolve(_feTrainingProfile);
    }
    var url = feResolveAppDataUrl('fe-training-profile.json');
    return fetch(url, { cache: 'no-cache' })
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .then(function (json) {
        if (json && json.sampleSize) {
          var failN =
            json.summary && json.summary['escaneada-sin-qr-cufe']
              ? json.summary['escaneada-sin-qr-cufe']
              : 0;
          json.scannedFailPct = json.sampleSize ? Math.round((failN / json.sampleSize) * 100) : 58;
          json.hint =
            'Entrenamiento ' +
            json.sampleSize +
            ' facturas (' +
            (json.trainedAt || '') +
            '): ~' +
            json.okFePct +
            '% detectan FE en lote. Escaneos sin QR: use «Reanalizar» o marque el QR.';
          json._loaded = true;
          _feTrainingProfile = json;
        } else {
          _feTrainingProfile = Object.assign({}, FE_TRAINING_FALLBACK, { _loaded: true });
        }
        return _feTrainingProfile;
      })
      .catch(function () {
        _feTrainingProfile = Object.assign({}, FE_TRAINING_FALLBACK, { _loaded: true });
        return _feTrainingProfile;
      });
  }

  function getFeTrainingUiHint() {
    var p = getFeTrainingProfile();
    return p.hint || FE_TRAINING_FALLBACK.hint;
  }

  function feResolveAppBase() {
    return (
      (typeof global !== 'undefined' && global.__crozzoAppBase) ||
      (typeof document !== 'undefined' &&
        document.querySelector('base') &&
        document.querySelector('base').getAttribute('href')) ||
      ''
    );
  }

  function feResolveAppDataUrl(subpath) {
    var base = feResolveAppBase();
    return String(base).replace(/\/?$/, '/') + String(subpath || '').replace(/^\//, '');
  }

  function feOcrLangPath() {
    return feResolveAppDataUrl('data/');
  }

  function feOcrRecognizeOptions(extra) {
    extra = extra || {};
    return Object.assign(
      {
        logger: function () {},
        langPath: feOcrLangPath(),
        gzip: false,
      },
      extra
    );
  }

  /** Memoria de zona QR por proveedor (probe + aprendizaje en runtime). */
  var _feQrZoneMemory = null;
  var FE_QR_ZONE_LS = 'crozzo_fe_qr_zone_runtime_v1';

  function feSlugKey(str) {
    return String(str || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  }

  function feSupplierSlugFromFilename(name) {
    var base = String(name || '').replace(/^.*[/\\]/, '');
    var m = base.match(/^\d{4}-\d{2}-\d{2}_(.+?)_[a-f0-9]{6,10}\.pdf$/i);
    return m ? feSlugKey(m[1].replace(/__/g, '_')) : feSlugKey(base.replace(/\.pdf$/i, ''));
  }

  function feProvQrKey(prov, doc) {
    if (doc && doc.nombre) {
      var fromFile = feSupplierSlugFromFilename(doc.nombre);
      if (fromFile) return fromFile;
    }
    if (prov) {
      if (prov.nit) return feSlugKey(prov.nit);
      if (prov.documento) return feSlugKey(prov.documento);
      if (prov.nombre) return feSlugKey(prov.nombre);
    }
    return '';
  }

  function feLoadQrRuntimeMemory() {
    try {
      if (typeof localStorage === 'undefined') return {};
      var raw = localStorage.getItem(FE_QR_ZONE_LS);
      return raw ? JSON.parse(raw) : {};
    } catch (eR) {
      return {};
    }
  }

  function feSaveQrRuntimeMemory(runtime) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(FE_QR_ZONE_LS, JSON.stringify(runtime || {}));
      }
    } catch (eS) {}
  }

  function loadFeQrZoneMemory() {
    if (_feQrZoneMemory && _feQrZoneMemory._loaded) {
      return Promise.resolve(_feQrZoneMemory);
    }
    var runtime = feLoadQrRuntimeMemory();
    if (typeof fetch !== 'function') {
      _feQrZoneMemory = { version: 1, bySupplier: {}, runtime: runtime, _loaded: true };
      return Promise.resolve(_feQrZoneMemory);
    }
    return fetch(feResolveAppDataUrl('fe-qr-zone-memory.json'), { cache: 'no-cache' })
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .then(function (json) {
        _feQrZoneMemory = json && json.bySupplier ? json : { version: 1, bySupplier: {}, runtime: {} };
        _feQrZoneMemory.runtime = Object.assign({}, _feQrZoneMemory.runtime || {}, runtime);
        _feQrZoneMemory._loaded = true;
        return _feQrZoneMemory;
      })
      .catch(function () {
        _feQrZoneMemory = { version: 1, bySupplier: {}, runtime: runtime, _loaded: true };
        return _feQrZoneMemory;
      });
  }

  function getFeQrZoneForProv(provKey) {
    if (!provKey || !_feQrZoneMemory) return null;
    var rt = (_feQrZoneMemory.runtime && _feQrZoneMemory.runtime[provKey]) || null;
    var seed = (_feQrZoneMemory.bySupplier && _feQrZoneMemory.bySupplier[provKey]) || null;
    if (rt && seed) {
      return rt.hits >= (seed.hits || 0) ? rt : seed;
    }
    return rt || seed || null;
  }

  function feQrZonePresetRect(zoneId) {
    var z = String(zoneId || '');
    if (z.indexOf('inf-izq') >= 0) return { rx: 0, ry: 0.54, rw: 0.52, rh: 0.46 };
    if (z.indexOf('inf-der') >= 0) return { rx: 0.48, ry: 0.54, rw: 0.52, rh: 0.46 };
    if (z.indexOf('sup-der') >= 0) return { rx: 0.48, ry: 0, rw: 0.52, rh: 0.46 };
    if (z.indexOf('sup-izq') >= 0) return { rx: 0, ry: 0, rw: 0.52, rh: 0.46 };
    if (z.indexOf('borde-sup') >= 0 || z === 'borde superior') return { rx: 0, ry: 0, rw: 1, rh: 0.38 };
    if (z.indexOf('borde-inf') >= 0) return { rx: 0, ry: 0.62, rw: 1, rh: 0.38 };
    if (z === 'centro') return { rx: 0.2, ry: 0.15, rw: 0.6, rh: 0.7 };
    return null;
  }

  function buildFeQrMemoryRegions(w, h, mem) {
    if (!mem) return [];
    var size = 0.38;
    if (mem.nx != null && mem.ny != null && !isNaN(mem.nx) && !isNaN(mem.ny)) {
      var nx = Math.max(0.08, Math.min(0.92, Number(mem.nx)));
      var ny = Math.max(0.08, Math.min(0.92, Number(mem.ny)));
      return [
        feQrRegionRect(w, h, nx - size / 2, ny - size / 2, size, size, 'memoria proveedor'),
        feQrRegionRect(w, h, nx - size * 0.65, ny - size * 0.65, size * 1.3, size * 1.3, 'memoria ampliada'),
      ];
    }
    var preset = feQrZonePresetRect(mem.zone);
    if (!preset) return [];
    return [feQrRegionRect(w, h, preset.rx, preset.ry, preset.rw, preset.rh, 'zona ' + (mem.zone || 'probe'))];
  }

  function rememberFeQrZoneFromHit(provKey, hit, canvasW, canvasH) {
    if (!provKey || !hit) return;
    loadFeQrZoneMemory().then(function () {
      if (!_feQrZoneMemory) return;
      if (!_feQrZoneMemory.runtime) _feQrZoneMemory.runtime = {};
      var prev = _feQrZoneMemory.runtime[provKey] || {};
      var zoneName = hit.qrRegion || '';
      var entry = {
        zone: zoneName || prev.zone || 'memoria',
        hits: (prev.hits || 0) + 1,
        source: 'runtime',
        lastAt: new Date().toISOString(),
      };
      if (hit.qrNormX != null && hit.qrNormY != null) {
        entry.nx = hit.qrNormX;
        entry.ny = hit.qrNormY;
      } else if (zoneName) {
        var preset = feQrZonePresetRect(zoneName);
        if (preset) {
          entry.nx = preset.rx + preset.rw / 2;
          entry.ny = preset.ry + preset.rh / 2;
        }
      }
      _feQrZoneMemory.runtime[provKey] = entry;
      feSaveQrRuntimeMemory(_feQrZoneMemory.runtime);
    });
  }

  /** Detección rápida al subir: PDF escaneado vs texto nativo. */
  function probePdfQuickProfile(doc) {
    if (!doc) return Promise.resolve({ scanned: false, textLen: 0, profile: 'desconocido' });
    var mime = String(doc.mime || '');
    if (mime.indexOf('pdf') < 0 && !/^data:application\/pdf/i.test(doc.dataUrl || '')) {
      return Promise.resolve({ scanned: false, textLen: 0, profile: 'no-pdf' });
    }
    return extractTextFromPdfDataUrl(doc, 1)
      .then(function (text) {
        var compact = String(text || '').replace(/\s/g, '');
        var textLen = compact.length;
        var scanned = textLen < 40;
        return {
          scanned: scanned,
          likelyScanned: scanned,
          textLen: textLen,
          profile: scanned ? 'escaneada' : textLen > 400 ? 'texto-nativo' : 'mixta',
          probedAt: new Date().toISOString(),
        };
      })
      .catch(function () {
        return { scanned: true, likelyScanned: true, textLen: 0, profile: 'escaneada', probedAt: new Date().toISOString() };
      });
  }

  /** Perfiles de lectura QR (cascada: si uno falla, sigue el siguiente). */
  var QR_SCAN_PROFILES = {
    edges: {
      label: 'Bordes superior e inferior',
      scanned: true,
      edgesOnly: true,
      scales: [3.6, 4.2, 4.8],
      grid: false,
      topBottomGrid: true,
      maxSide: 3400,
      fullFilters: true,
    },
    lite: { label: 'Lectura rápida', scanned: true, scales: [2.8, 3.4], grid: false, maxSide: 2400 },
    standard: {
      label: 'Regiones y filtros',
      scanned: true,
      scales: [2.6, 3.2, 3.6],
      grid: true,
      maxSide: 2600,
      fullFilters: true,
    },
    high: { label: 'Alta resolución', scanned: true, scales: [3.2, 3.8, 4.2], grid: true, maxSide: 3000, fullFilters: true },
    grid: { label: 'Rejilla de página', scanned: true, scales: [3, 3.5, 4], grid: true, maxSide: 2800, fullFilters: true },
    deep: {
      label: 'Escaneo profundo',
      scanned: true,
      thorough: true,
      scales: [3.5, 4.2, 4.8],
      grid: true,
      maxSide: 3400,
      fullFilters: true,
      tryRotations: true,
    },
    max: {
      label: 'Máxima ampliación',
      scanned: true,
      thorough: true,
      scales: [4, 4.8, 5.4],
      grid: true,
      maxSide: 3800,
      fullFilters: true,
      tryRotations: true,
    },
    hunter: {
      label: 'Modo cámara (QR/CUFE)',
      scanned: true,
      thorough: true,
      scales: [3.8, 4.4, 5],
      grid: true,
      maxSide: 3600,
      fullFilters: true,
      tryRotations: true,
      gridSize: 4,
    },
    quick: { label: 'PDF con texto', scanned: false, scales: [2, 2.8], grid: false },
  };

  /** En lote: 3 métodos (entrenamiento 83 facturas — lite+standard dejaban ~58% escaneadas sin CUFE). */
  var QR_CASCADE_BATCH = ['edges', 'lite', 'standard', 'high'];
  /** Análisis normal: profundo pero acotado (evita colapsar la app). */
  var QR_CASCADE_SCANNED = ['edges', 'lite', 'standard', 'high', 'grid', 'deep'];
  /** Reanalizar / modo cámara completo. */
  var QR_CASCADE_SCANNED_DEEP = ['lite', 'standard', 'high', 'grid', 'deep', 'max', 'hunter'];
  var QR_CASCADE_TEXT = ['quick', 'standard', 'high', 'grid'];

  /** Presupuesto de tiempo por fase QR (ms) — evita congelar UI / agotar memoria. */
  var FE_QR_BUDGET_BATCH_MS = 62000;
  var FE_QR_BUDGET_SINGLE_MS = 72000;
  var FE_QR_BUDGET_DEEP_MS = 110000;
  var FE_QR_LITE_REGION_PX = 1200000;
  var FE_QR_MAX_REGION_PX = 2400000;
  var _feQrScanDeadline = 0;

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
    if (qr && qr.url) {
      if (/dian\.gov|documentkey|catalogo-vpfe/i.test(qr.url)) return true;
      if (/factura|electronic|fe\.|vpfe|cufe|dispapeles|facturacion/i.test(qr.url)) return true;
      if (/^https?:\/\//i.test(qr.url)) return true;
    }
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

  function isQrScanEdgesOnly() {
    return !!(_activeQrScan && _activeQrScan.edgesOnly);
  }

  function isQrScanTopBottomGrid() {
    return !!(_activeQrScan && _activeQrScan.topBottomGrid);
  }

  function applyQrScanProfile(profileId, extra) {
    extra = extra || {};
    var p = QR_SCAN_PROFILES[profileId] || QR_SCAN_PROFILES.standard;
    var batchUi = !!global.__cxfFeBatchMode;
    _activeQrScan = {
      profile: profileId,
      scanned: !!p.scanned,
      thorough: !!p.thorough,
      batch: batchUi,
      batchLite: profileId === 'lite',
      useGrid: !!p.grid,
      tryRotations: !!p.tryRotations,
      gridCols: p.gridSize || (p.thorough || p.grid ? 4 : 3),
      gridRows: p.gridSize || (p.thorough || p.grid ? 4 : 3),
      forceScales: p.scales ? p.scales.slice() : null,
      maxSide: p.maxSide || 0,
      fullFilters: !!p.fullFilters,
      edgesOnly: !!p.edgesOnly,
      topBottomGrid: !!p.topBottomGrid,
      provKey: extra.provKey || '',
    };
    return p;
  }

  function qrHitValid(qr, fromQuick) {
    if (!qr && (!fromQuick || !fromQuick.length)) return false;
    var resolved = buildCufeResolution(qr, fromQuick || []);
    return isFacturaElectronicaDetectada(resolved, qr);
  }

  function scanQrWithProfile(doc, mime, profileId, onProgress, scanOptsExtra) {
    applyQrScanProfile(profileId, scanOptsExtra || {});
    scanOptsExtra = scanOptsExtra || {};
    return scanQrDeep(doc, mime, onProgress, {
      doc: doc,
      scanned: _activeQrScan.scanned,
      thorough: _activeQrScan.thorough,
      preserveProfile: true,
      forceDeepQr: !!scanOptsExtra.forceDeepQr,
      provKey: scanOptsExtra.provKey || (_activeQrScan && _activeQrScan.provKey) || '',
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
      } else if (opts.forceDeepQr) {
        stages = opts.likelyScanned ? QR_CASCADE_SCANNED_DEEP : QR_CASCADE_TEXT;
      } else {
        stages = opts.likelyScanned ? QR_CASCADE_SCANNED : QR_CASCADE_TEXT;
      }
    }
    var smooth = opts.smooth;
    var forceDeepQr = !!opts.forceDeepQr;
    var base = 14;
    var span = 36;
    var chain = Promise.resolve(null);
    var i;
    for (i = 0; i < stages.length; i++) {
      (function (stageIdx, profileId) {
        var prof = QR_SCAN_PROFILES[profileId] || QR_SCAN_PROFILES.standard;
        chain = chain.then(function (prevQr) {
          if (qrHitValid(prevQr, fromQuick)) return prevQr;
          if (feQrBudgetExpired()) return prevQr || null;
          if (smooth) {
            smooth.bump(
              base + (stageIdx / stages.length) * span,
              'QR método ' + (stageIdx + 1) + '/' + stages.length + ': ' + prof.label + '…'
            );
          }
          return feYieldToMain(stageIdx > 0 ? feYieldMs() + 40 : feYieldMs()).then(function () {
            return scanQrWithProfile(
              doc,
              mime,
              profileId,
              function (ratio, msg) {
                if (smooth) {
                  smooth.bump(
                    base + ((stageIdx + Math.min(0.92, ratio || 0)) / stages.length) * span,
                    msg || prof.label
                  );
                }
              },
              { forceDeepQr: forceDeepQr, provKey: opts.provKey || '' }
            );
          });
        });
      })(i, stages[i]);
    }
    return chain;
  }

  function feYieldMs() {
    if (isQrScanBatchLite()) return 72;
    if (isFeBatchUi()) return 96;
    return 20;
  }

  function feQrBeginBudget(opts) {
    opts = opts || {};
    var ms = FE_QR_BUDGET_BATCH_MS;
    if (opts.forceDeepQr) ms = FE_QR_BUDGET_DEEP_MS;
    else if (!opts.batchMode && !global.__cxfFeBatchMode) ms = FE_QR_BUDGET_SINGLE_MS;
    _feQrScanDeadline = Date.now() + ms;
  }

  function feQrClearBudget() {
    _feQrScanDeadline = 0;
  }

  function feQrBudgetExpired() {
    return _feQrScanDeadline > 0 && Date.now() >= _feQrScanDeadline;
  }

  function feQrImagePixels(img) {
    if (!img) return 0;
    return (img.width || 0) * (img.height || 0);
  }

  function qrScanMaxCanvasSide() {
    if (_activeQrScan && _activeQrScan.maxSide) return _activeQrScan.maxSide;
    if (isQrScanBatchLite()) return 2200;
    if (isQrScanThorough()) return 3600;
    if (isQrScanScanned()) return isFeBatchUi() ? 2600 : 3400;
    return isFeBatchUi() ? 2000 : 3000;
  }

  /** Orden tipo cámara: última página primero (QR DIAN suele estar al final). */
  function fePdfPageScanOrder(numPages, maxPages) {
    maxPages = maxPages || numPages;
    var order = [];
    var seen = {};
    function add(p) {
      if (p < 1 || p > numPages || seen[p]) return;
      seen[p] = true;
      order.push(p);
    }
    if (numPages > 1) add(numPages);
    add(1);
    for (var p = 2; p <= numPages && order.length < maxPages; p++) add(p);
    return order.slice(0, maxPages);
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
    if (pdfjsLib && pdfjsLib.GlobalWorkerOptions && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = resolveFeVendorUrl('vendor/CrozzoPdfJs.worker.js');
    }
  }

  function openPdfDocumentWithPdfJs(pdfjsLib, bytes) {
    configurePdfJsWorker(pdfjsLib);
    var baseParams = { data: bytes };
    return pdfjsLib.getDocument(baseParams).promise.catch(function (err) {
      var msg = String((err && err.message) || err || '');
      if (!/worker|fake worker/i.test(msg)) throw err;
      return pdfjsLib
        .getDocument(
          Object.assign({}, baseParams, {
            disableWorker: true,
            useWorkerFetch: false,
            isEvalSupported: false,
          })
        )
        .promise;
    });
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
        return openPdfDocumentWithPdfJs(pdfjsLib, bytes);
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
    if (!url && /^www\./i.test(data)) url = 'https://' + data;
    if (
      !url &&
      /(?:^|\/\/)(?:[a-z0-9-]+\.)+(?:com|co|net|org|gov)(?:\.[a-z]{2})?(?:\/|$|\?)/i.test(data)
    ) {
      url = /^https?:\/\//i.test(data) ? data : 'https://' + data.replace(/^\/\//, '');
    }
    if (!url && /factura|electronic|fe\.|vpfe|dispapeles|facturacion/i.test(data) && data.length > 12) {
      url = /^https?:\/\//i.test(data) ? data : 'https://' + data.replace(/^\/\//, '');
    }
    return { url: url, cufe: cufe, raw: data };
  }

  function qrPayloadReadable(parsed) {
    if (!parsed) return false;
    if (parsed.cufe || parsed.url) return true;
    var raw = String(parsed.raw || '').trim();
    return raw.length >= 8;
  }

  function normalizeQrPayload(parsed) {
    parsed = parsed || { url: '', cufe: '', raw: '' };
    if (qrPayloadReadable(parsed)) return parsed;
    var raw = String(parsed.raw || '').trim();
    if (raw.length >= 8) parsed.url = raw;
    return parsed;
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
          var pageNums = fePdfTextExtractOrder(pdf.numPages, maxPages);
          var chain = Promise.resolve('');
          var pi;
          for (pi = 0; pi < pageNums.length; pi++) {
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
            })(pageNums[pi]);
          }
          return chain.finally(function () {
            try {
              pdf.destroy();
            } catch (eD) {}
          });
        });
    });
  }

  /** Páginas para texto: 1ª, última (CUFE/QR suele estar al final). */
  function fePdfTextExtractOrder(numPages, maxPages) {
    maxPages = maxPages || 3;
    var order = [];
    var seen = {};
    function add(p) {
      if (p < 1 || p > numPages || seen[p]) return;
      seen[p] = true;
      order.push(p);
    }
    add(1);
    if (numPages > 1) add(numPages);
    if (numPages > 2 && maxPages > 2) add(2);
    return order.slice(0, maxPages);
  }

  function feCanvasFromImageData(img) {
    var c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    c.getContext('2d').putImageData(img, 0, 0);
    return c;
  }

  /** Mejora contraste para OCR en escaneos (CUFE impreso). */
  function feCanvasForOcr(sourceCanvas) {
    try {
      var ctx = sourceCanvas.getContext('2d');
      var img = ctx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
      var step1 = preprocessImageData(img, 'grayscale');
      var step2 = preprocessImageData(step1, 'contrast');
      var step3 = preprocessImageData(step2, 'adaptive');
      return feCanvasFromImageData(step3);
    } catch (e) {
      return sourceCanvas;
    }
  }

  function cloneImageData(img) {
    return new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
  }

  /** Umbral Otsu — como cámaras que separan QR del fondo. */
  function computeOtsuThreshold(img) {
    var hist = new Array(256).fill(0);
    var d = img.data;
    var n = d.length / 4;
    var i;
    for (i = 0; i < d.length; i += 4) {
      var g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
      hist[g]++;
    }
    var sum = 0;
    for (i = 0; i < 256; i++) sum += i * hist[i];
    var sumB = 0;
    var wB = 0;
    var maxVar = 0;
    var threshold = 128;
    for (i = 0; i < 256; i++) {
      wB += hist[i];
      if (!wB) continue;
      var wF = n - wB;
      if (!wF) break;
      sumB += i * hist[i];
      var mB = sumB / wB;
      var mF = (sum - sumB) / wF;
      var between = wB * wF * (mB - mF) * (mB - mF);
      if (between > maxVar) {
        maxVar = between;
        threshold = i;
      }
    }
    return threshold;
  }

  function rotateCanvas90(canvas, turns) {
    turns = ((turns % 4) + 4) % 4;
    if (!turns) return canvas;
    var w = canvas.width;
    var h = canvas.height;
    var out = document.createElement('canvas');
    out.width = turns % 2 ? h : w;
    out.height = turns % 2 ? w : h;
    var ctx = out.getContext('2d');
    ctx.translate(out.width / 2, out.height / 2);
    ctx.rotate((turns * Math.PI) / 2);
    ctx.drawImage(canvas, -w / 2, -h / 2);
    return out;
  }

  /** Mejora contraste / nitidez para QR en fotos borrosas o con poca luz. */
  function preprocessImageData(img, mode) {
    var out = cloneImageData(img);
    var d = out.data;
    var i;
    var w = out.width;
    var h = out.height;
    var px = w * h;
    if (px > FE_QR_MAX_REGION_PX && (mode === 'denoise-threshold' || mode === 'sharpen')) {
      return out;
    }
    if (px > FE_QR_LITE_REGION_PX && mode === 'denoise-threshold') {
      mode = 'adaptive';
    }

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

    if (mode === 'adaptive') {
      var thr = computeOtsuThreshold(img);
      for (i = 0; i < d.length; i += 4) {
        var ga = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
        var va = ga > thr ? 255 : 0;
        d[i] = d[i + 1] = d[i + 2] = va;
      }
      return out;
    }

    if (mode === 'gamma') {
      for (i = 0; i < d.length; i += 4) {
        var gg = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255;
        gg = Math.pow(gg, 0.82);
        var gv = (gg * 255) | 0;
        d[i] = d[i + 1] = d[i + 2] = gv;
      }
      return out;
    }

    if (mode === 'denoise-threshold') {
      var srcD = new Uint8ClampedArray(d);
      for (var y = 1; y < h - 1; y++) {
        for (var x = 1; x < w - 1; x++) {
          var si = (y * w + x) * 4;
          var acc = 0;
          var cnt = 0;
          for (var ky = -1; ky <= 1; ky++) {
            for (var kx = -1; kx <= 1; kx++) {
              var pi = ((y + ky) * w + (x + kx)) * 4;
              acc += srcD[pi] * 0.299 + srcD[pi + 1] * 0.587 + srcD[pi + 2] * 0.114;
              cnt++;
            }
          }
          var avg = acc / cnt;
          d[si] = d[si + 1] = d[si + 2] = avg > 135 ? 255 : 0;
        }
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
          var parsed = normalizeQrPayload(parseQrPayload(codes[0].rawValue));
          if (qrPayloadReadable(parsed)) {
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

  function buildJsQrAttempts(imageData, meta, opts) {
    opts = opts || {};
    var batchLite = !!opts.batchLite;
    var batch = !!opts.batch;
    var scanned = !!opts.scanned;
    var full = !!opts.fullFilters;
    var thorough = !!opts.thorough;
    var px = feQrImagePixels(imageData);
    var heavy = px > FE_QR_LITE_REGION_PX;
    var liteOnly = px > FE_QR_MAX_REGION_PX || feQrBudgetExpired();
    var attempts = [{ data: imageData, label: meta + ' · original' }];
    function add(mode, label) {
      attempts.push({ data: preprocessImageData(imageData, mode), label: meta + ' · ' + label });
    }
    if (batchLite || liteOnly) {
      add('grayscale', 'gris');
      add('threshold', 'umbral');
      if (!liteOnly) add('contrast', 'contraste');
      if (!liteOnly && !heavy) add('adaptive', 'umbral adaptativo');
      return attempts;
    }
    if (batch && !scanned && !full) {
      add('threshold', 'umbral');
      add('grayscale', 'gris');
      return attempts;
    }
    add('grayscale', 'gris');
    add('contrast', 'contraste');
    add('gamma', 'gamma');
    add('adaptive', 'umbral adaptativo');
    add('threshold', 'blanco/negro');
    if (!heavy) {
      add('sharpen', 'nitidez');
      add('denoise-threshold', 'suavizado+umbral');
    }
    add('invert', 'invertido');
    if (!heavy) {
      attempts.push({
        data: preprocessImageData(preprocessImageData(imageData, 'grayscale'), 'adaptive'),
        label: meta + ' · gris+adaptativo',
      });
      attempts.push({
        data: preprocessImageData(preprocessImageData(imageData, 'contrast'), 'threshold'),
        label: meta + ' · contraste+umbral',
      });
    }
    if ((full || thorough || scanned) && !heavy) {
      attempts.push({
        data: preprocessImageData(preprocessImageData(imageData, 'sharpen'), 'adaptive'),
        label: meta + ' · nitidez+adaptativo',
      });
    }
    return attempts;
  }

  function tryJsQrOnImageData(jsQR, imageData, meta) {
    var batchLite = isQrScanBatchLite() && !(_activeQrScan && _activeQrScan.fullFilters);
    var batch = isFeBatchUi() && !isQrScanScanned() && !(_activeQrScan && _activeQrScan.fullFilters);
    var scanned = isQrScanScanned();
    var attempts = buildJsQrAttempts(imageData, meta, {
      batchLite: batchLite,
      batch: batch,
      scanned: scanned,
      fullFilters: _activeQrScan && _activeQrScan.fullFilters,
      thorough: isQrScanThorough(),
    });
    var inversion = batch && !scanned ? 'dontInvert' : 'attemptBoth';
    var chain = Promise.resolve(null);
    var ai;
    for (ai = 0; ai < attempts.length; ai++) {
      (function (pack, idx) {
        chain = chain.then(function (prev) {
          if (prev || feQrBudgetExpired()) return prev;
          if (idx > 0) return feYieldToMain(6).then(runOne);
          return runOne();
          function runOne() {
            if (feQrBudgetExpired()) return null;
            var code = jsQR(pack.data.data, pack.data.width, pack.data.height, {
              inversionAttempts: inversion,
            });
            if (code && code.data) {
              var parsed = parseQrPayload(code.data);
              if (parsed.cufe || parsed.url) {
                parsed.technique = pack.label;
                return parsed;
              }
            }
            return null;
          }
        });
      })(attempts[ai], ai);
    }
    return chain;
  }

  function decodeQrOneCanvas(canvas, label) {
    label = label || 'lectura';
    return tryBarcodeDetectorOnCanvas(canvas).then(function (hit) {
      if (hit && qrPayloadReadable(hit)) return hit;
      return ensureJsQR().then(function (jsQR) {
        var ctx = canvas.getContext('2d');
        var img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        var code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
        if (code && code.data) {
          var parsedDirect = normalizeQrPayload(parseQrPayload(code.data));
          if (qrPayloadReadable(parsedDirect)) {
            parsedDirect.technique = label + ' · jsQR directo';
            return parsedDirect;
          }
        }
        var prevScan = _activeQrScan;
        _activeQrScan = { scanned: true, fullFilters: true, thorough: true, tryRotations: false };
        return tryJsQrOnImageData(jsQR, img, label)
          .then(function (filtered) {
            if (filtered && qrPayloadReadable(filtered)) return filtered;
            return null;
          })
          .finally(function () {
            _activeQrScan = prevScan;
          });
      });
    });
  }

  /** Cámara / foto: BarcodeDetector + jsQR con filtros y multi-escala. */
  function decodeQrFromCanvas(canvas, label) {
    label = label || 'cámara';
    var maxSide = 1600;
    var w = canvas.width;
    var h = canvas.height;
    var base = canvas;
    if (Math.max(w, h) > maxSide) {
      base = document.createElement('canvas');
      var down = maxSide / Math.max(w, h);
      base.width = Math.max(8, Math.round(w * down));
      base.height = Math.max(8, Math.round(h * down));
      base.getContext('2d').drawImage(canvas, 0, 0, base.width, base.height);
    }
    var scales = [1, 1.35, 1.75, 2.2];
    var chain = Promise.resolve(null);
    var si;
    for (si = 0; si < scales.length; si++) {
      (function (sf) {
        chain = chain.then(function (prev) {
          if (prev) return prev;
          var target = base;
          if (sf !== 1) {
            target = document.createElement('canvas');
            target.width = Math.min(Math.round(base.width * sf), 2600);
            target.height = Math.min(Math.round(base.height * sf), 2600);
            target.getContext('2d').drawImage(base, 0, 0, target.width, target.height);
          }
          return decodeQrOneCanvas(target, label + ' · ' + Math.round(sf * 100) + '%');
        });
      })(scales[si]);
    }
    return chain;
  }

  function decodeQrFromVideoFrame(video, label) {
    label = label || 'cámara en vivo';
    if (!video || video.readyState < 2) return Promise.resolve(null);
    var vw = video.videoWidth || 640;
    var vh = video.videoHeight || 480;
    if (vw < 8 || vh < 8) return Promise.resolve(null);
    var maxSide = 1600;
    var sc = Math.min(1, maxSide / Math.max(vw, vh));
    var tw = Math.max(8, Math.floor(vw * sc));
    var th = Math.max(8, Math.floor(vh * sc));
    var canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    canvas.getContext('2d').drawImage(video, 0, 0, tw, th);
    return decodeQrFromCanvas(canvas, label);
  }

  /** Regiones QR priorizando esquinas y bordes (entrenamiento 83 facturas DIAN). */
  function feQrRegionRect(w, h, rx, ry, rw, rh, name) {
    return {
      name: name,
      x: Math.max(0, Math.floor(w * rx)),
      y: Math.max(0, Math.floor(h * ry)),
      cw: Math.max(24, Math.min(w, Math.floor(w * rw))),
      ch: Math.max(24, Math.min(h, Math.floor(h * rh))),
    };
  }

  function buildFeTopBottomPriorityRegions(w, h, mode) {
    mode = mode || 'full';
    var band = mode === 'edges' ? 0.48 : mode === 'batch' ? 0.44 : 0.4;
    return [
      feQrRegionRect(w, h, 0, 0, 1, band, 'franja superior'),
      feQrRegionRect(w, h, 0, 1 - band, 1, band, 'franja inferior'),
      feQrRegionRect(w, h, 0, 0, 0.52, band, 'sup izquierda'),
      feQrRegionRect(w, h, 0.48, 0, 0.52, band, 'sup derecha'),
      feQrRegionRect(w, h, 0, 1 - band, 0.52, band, 'inf izquierda'),
      feQrRegionRect(w, h, 0.48, 1 - band, 0.52, band, 'inf derecha'),
    ];
  }

  function buildFeQrCornerEdgeRegions(w, h, mode) {
    mode = mode || 'full';
    var lite = mode === 'lite';
    var batch = mode === 'batch';
    var edges = mode === 'edges';
    var cw = lite ? 0.48 : batch || edges ? 0.5 : 0.52;
    var ch = lite ? 0.42 : batch || edges ? 0.44 : 0.46;
    var edge = lite ? 0.36 : 0.4;
    var topBottom = buildFeTopBottomPriorityRegions(w, h, edges ? 'edges' : batch ? 'batch' : 'full');
    var corners = [
      feQrRegionRect(w, h, 0, 0, cw, ch, 'esquina sup-izq'),
      feQrRegionRect(w, h, 1 - cw, 0, cw, ch, 'esquina sup-der'),
      feQrRegionRect(w, h, 0, 1 - ch, cw, ch, 'esquina inf-izq'),
      feQrRegionRect(w, h, 1 - cw, 1 - ch, cw, ch, 'esquina inf-der'),
      feQrRegionRect(w, h, 0.5 - cw * 0.55, 1 - ch, cw * 1.1, ch, 'inf-der ampliado'),
      feQrRegionRect(w, h, 0, 1 - ch, cw * 1.15, ch, 'inf-izq ampliado'),
    ];
    var sides = [
      feQrRegionRect(w, h, 0, 0, edge, 1, 'borde izquierdo'),
      feQrRegionRect(w, h, 1 - edge, 0, edge, 1, 'borde derecho'),
    ];
    if (edges) {
      return topBottom.concat(corners);
    }
    var regions = topBottom.concat(corners).concat(sides);
    if (!lite) {
      regions.push(
        feQrRegionRect(w, h, 0.3, 0.5, 0.7, 0.5, 'mitad inferior'),
        feQrRegionRect(w, h, 0.2, 0.15, 0.6, 0.7, 'centro')
      );
    }
    if (!lite) {
      regions.push({ name: 'página completa', x: 0, y: 0, cw: w, ch: h });
    }
    return regions;
  }

  function getCanvasRegions(canvas, light, scanned) {
    var w = canvas.width;
    var h = canvas.height;
    var base;
    if (isQrScanBatchLite()) {
      base = buildFeQrCornerEdgeRegions(w, h, 'lite');
    } else if (isFeBatchUi() && !scanned) {
      base = [
        { name: 'página completa', x: 0, y: 0, cw: w, ch: h },
        feQrRegionRect(w, h, 1 - 0.62, 0.52, 0.62, 0.48, 'QR inferior derecha'),
        feQrRegionRect(w, h, 1 - 0.58, 0, 0.58, 0.42, 'QR superior derecha'),
        feQrRegionRect(w, h, 0, 0, 0.58, 0.42, 'QR superior izquierda'),
      ];
    } else if (scanned) {
      var scanMode = isQrScanEdgesOnly() ? 'edges' : 'batch';
      base = buildFeQrCornerEdgeRegions(w, h, scanMode);
    } else if (light) {
      base = [
        { name: 'página completa', x: 0, y: 0, cw: w, ch: h },
        feQrRegionRect(w, h, 1 - 0.55, 0, 0.55, 0.45, 'esquina superior derecha'),
        feQrRegionRect(w, h, 0, 0, 0.55, 0.45, 'esquina superior izquierda'),
      ];
    } else {
      base = buildFeQrCornerEdgeRegions(w, h, 'full');
    }
    var provKey = _activeQrScan && _activeQrScan.provKey;
    var mem = provKey ? getFeQrZoneForProv(provKey) : null;
    var pref = mem ? buildFeQrMemoryRegions(w, h, mem) : [];
    if (!pref.length) return base;
    var seen = {};
    pref.forEach(function (r) {
      seen[r.name] = true;
    });
    var tail = base.filter(function (r) {
      return !seen[r.name];
    });
    return pref.concat(tail);
  }

  function cropCanvasRegion(canvas, region) {
    var sub = document.createElement('canvas');
    sub.width = region.cw;
    sub.height = region.ch;
    sub.getContext('2d').drawImage(canvas, region.x, region.y, region.cw, region.ch, 0, 0, region.cw, region.ch);
    return sub;
  }

  function clampNormRect(norm) {
    var x = Math.max(0, Math.min(1, Number(norm.x) || 0));
    var y = Math.max(0, Math.min(1, Number(norm.y) || 0));
    var w = Math.max(0, Math.min(1 - x, Number(norm.w) || 0));
    var h = Math.max(0, Math.min(1 - y, Number(norm.h) || 0));
    return { x: x, y: y, w: w, h: h };
  }

  function normRectToPixels(canvas, norm) {
    norm = clampNormRect(norm);
    var w = canvas.width;
    var h = canvas.height;
    var x = Math.max(0, Math.min(w - 1, Math.floor(norm.x * w)));
    var y = Math.max(0, Math.min(h - 1, Math.floor(norm.y * h)));
    var cw = Math.max(12, Math.min(w - x, Math.ceil(norm.w * w)));
    var ch = Math.max(12, Math.min(h - y, Math.ceil(norm.h * h)));
    return { name: 'zona marcada', x: x, y: y, cw: cw, ch: ch };
  }

  /** Escaneo QR solo en el recuadro que marcó el usuario (coords 0–1 sobre la página). */
  function scanQrInMarkedRegion(doc, normRect, onProgress, opts) {
    opts = opts || {};
    if (!doc || !normRect) return Promise.resolve(null);
    var norm = clampNormRect(normRect);
    if (norm.w < 0.012 || norm.h < 0.012) return Promise.resolve(null);

    feQrBeginBudget({ forceDeepQr: true });
    _activeQrScan = {
      scanned: true,
      thorough: true,
      fullFilters: true,
      tryRotations: true,
      maxSide: 3800,
    };

    function tick(msg) {
      if (typeof onProgress === 'function') onProgress(msg);
    }

    var mime = String(doc.mime || '');
    var isPdf = mime.indexOf('pdf') >= 0 || !!doc._pdfBlob;
    var pageNum = Math.max(1, Math.floor(Number(opts.pageNum || doc.previewPage || 1)));

    function scanCanvasRegion(jsQR, canvas, scaleLabel) {
      var region = normRectToPixels(canvas, norm);
      return scanCanvasRegionAdvanced(jsQR, canvas, region, scaleLabel || 'marca usuario');
    }

    if (isPdf) {
      tick('Preparando página ' + pageNum + '…');
      return runPdfExclusive(function () {
        return openPdfDocument(doc).then(function (pdf) {
          var pn = Math.min(pageNum, pdf.numPages);
          var scales = [3.4, 4.2, 5];
          var chain = Promise.resolve(null);
          var si;
          for (si = 0; si < scales.length; si++) {
            (function (sc) {
              chain = chain.then(function (found) {
                if (found) return found;
                if (feQrBudgetExpired()) return null;
                tick('Ampliando zona marcada (' + sc + '×)…');
                return feYieldToMain(16).then(function () {
                  return pdf.getPage(pn).then(function (page) {
                    return renderPdfPageToCanvas(page, sc).then(function (canvas) {
                      return ensureJsQR().then(function (jsQR) {
                        return scanCanvasRegion(jsQR, canvas, 'marca · pág. ' + pn + ' · ' + sc + '×');
                      });
                    });
                  });
                });
              });
            })(scales[si]);
          }
          return chain.finally(function () {
            try {
              pdf.destroy();
            } catch (_) {}
          });
        });
      }).finally(function () {
        _activeQrScan = null;
        feQrClearBudget();
      });
    }

    if (!doc.dataUrl) return Promise.resolve(null).finally(function () {
      _activeQrScan = null;
      feQrClearBudget();
    });

    tick('Analizando zona marcada en la imagen…');
    return loadImageFromDataUrl(doc.dataUrl)
      .then(function (canvas) {
        return ensureJsQR().then(function (jsQR) {
          return scanCanvasRegion(jsQR, canvas, 'marca · imagen');
        });
      })
      .finally(function () {
        _activeQrScan = null;
        feQrClearBudget();
      });
  }

  /** Rejilla N×N con solape — como cámara que barre la hoja en tiles. */
  /** Rejilla solo en tercio superior e inferior (donde suelen ir los QR DIAN). */
  function scanCanvasTopBottomBands(jsQR, canvas, scaleLabel) {
    var w = canvas.width;
    var h = canvas.height;
    var cols = 6;
    var rows = 6;
    var tileW = Math.ceil(w / cols);
    var tileH = Math.ceil(h / rows);
    var rowRanges = [
      { r0: 0, r1: 2, label: 'tercio sup' },
      { r0: 3, r1: 5, label: 'tercio inf' },
    ];
    var chain = Promise.resolve(null);
    var ri;
    for (ri = 0; ri < rowRanges.length; ri++) {
      (function (range) {
        var r;
        for (r = range.r0; r <= range.r1; r++) {
          (function (rowIdx) {
            var c;
            for (c = 0; c < cols; c++) {
              (function (colIdx) {
                chain = chain.then(function (found) {
                  if (found) return found;
                  if (feQrBudgetExpired()) return null;
                  var padX = Math.floor(tileW * 0.14);
                  var padY = Math.floor(tileH * 0.14);
                  var x = Math.max(0, colIdx * tileW - padX);
                  var y = Math.max(0, rowIdx * tileH - padY);
                  var cw = Math.min(w - x, tileW + padX * 2);
                  var ch = Math.min(h - y, tileH + padY * 2);
                  return scanCanvasRegionAdvanced(
                    jsQR,
                    canvas,
                    {
                      name: range.label + ' · celda ' + (rowIdx + 1) + '×' + (colIdx + 1),
                      x: x,
                      y: y,
                      cw: cw,
                      ch: ch,
                    },
                    scaleLabel + ' · bandas sup/inf'
                  );
                });
              })(c);
            }
          })(r);
        }
      })(rowRanges[ri]);
    }
    return chain;
  }

  function scanCanvasGridTiles(jsQR, canvas, scaleLabel, cols, rows) {
    cols = cols || (_activeQrScan && _activeQrScan.gridCols) || 3;
    rows = rows || (_activeQrScan && _activeQrScan.gridRows) || 3;
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
            if (feQrBudgetExpired()) return null;
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
    if (feQrBudgetExpired()) return Promise.resolve(null);
    var sub = cropCanvasRegion(canvas, region);
    var meta = scaleLabel + ' · ' + region.name;
    var px = region.cw * region.ch;
    var yieldP = px > 800000 ? feYieldToMain(90) : feYieldFrame();
    function scanOne(targetCanvas, suffix) {
      return feYieldToMain().then(function () {
        var img = targetCanvas.getContext('2d').getImageData(0, 0, targetCanvas.width, targetCanvas.height);
        var code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
        if (code && code.data) {
          var parsedDirect = parseQrPayload(code.data);
          if (parsedDirect.cufe || parsedDirect.url) {
            parsedDirect.technique = meta + (suffix || '') + ' · jsQR directo';
            parsedDirect.qrRegion = region.name;
            parsedDirect.qrNormX = (region.x + region.cw / 2) / canvas.width;
            parsedDirect.qrNormY = (region.y + region.ch / 2) / canvas.height;
            return parsedDirect;
          }
        }
        return tryBarcodeDetectorOnCanvas(targetCanvas).then(function (hit) {
        if (hit) {
          hit.technique = (hit.technique || 'BarcodeDetector') + ' · ' + meta + (suffix || '');
          hit.qrRegion = region.name;
          if (canvas && canvas.width && canvas.height) {
            hit.qrNormX = (region.x + region.cw / 2) / canvas.width;
            hit.qrNormY = (region.y + region.ch / 2) / canvas.height;
          }
          return hit;
        }
        return feYieldToMain().then(function () {
          var img2 = targetCanvas.getContext('2d').getImageData(0, 0, targetCanvas.width, targetCanvas.height);
          return tryJsQrOnImageData(jsQR, img2, meta + (suffix || ''));
        });
      });
      });
    }
    return yieldP.then(function () {
      return scanOne(sub, '').then(function (hit) {
        if (hit && !hit.qrRegion) {
          hit.qrRegion = region.name;
          hit.qrNormX = (region.x + region.cw / 2) / canvas.width;
          hit.qrNormY = (region.y + region.ch / 2) / canvas.height;
        }
        if (hit) return hit;
        if (feQrBudgetExpired()) return null;
        if (!(_activeQrScan && _activeQrScan.tryRotations)) return null;
        if (px > FE_QR_LITE_REGION_PX) return null;
        var chain = Promise.resolve(null);
        var turns;
        for (turns = 1; turns <= 3; turns++) {
          (function (t) {
            chain = chain.then(function (prev) {
              if (prev || feQrBudgetExpired()) return prev;
              return feYieldToMain(48).then(function () {
                return scanOne(rotateCanvas90(sub, t), ' · rot ' + t * 90 + '°');
              });
            });
          })(turns);
        }
        return chain;
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
        (scanned ? [1, 1.22, 1.48] : light ? [1, 1.2] : [1, 1.35, 1.7]);
    }
    return ensureJsQR().then(function (jsQR) {
      var chain = Promise.resolve(null);
      var si;
      for (si = 0; si < scaleFactors.length; si++) {
        (function (sf) {
          chain = chain.then(function (found) {
            if (found) return found;
            if (feQrBudgetExpired()) return null;
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
                var inner = Promise.resolve(null);
                if (scanned) {
                  inner = inner.then(function (prev) {
                    if (prev) return prev;
                    if (feQrBudgetExpired()) return null;
                    if (onAttempt) onAttempt();
                    return scanCanvasTopBottomBands(jsQR, target, 'zoom ' + Math.round(sf * 100) + '%');
                  });
                }
                var regions = getCanvasRegions(target, light, scanned);
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
                  if (!isQrScanUseGrid() && isQrScanBatchLite()) return prev;
                  if (onAttempt) onAttempt();
                  var batchScanned = isFeBatchUi() && scanned && !isQrScanBatchLite();
                  var gCols =
                    (_activeQrScan && _activeQrScan.gridCols) ||
                    (isQrScanThorough() || isQrScanUseGrid() ? 4 : batchScanned ? 4 : 3);
                  var gRows =
                    (_activeQrScan && _activeQrScan.gridRows) ||
                    (isQrScanThorough() || isQrScanUseGrid() ? 4 : batchScanned ? 4 : 3);
                  return feYieldToMain(100).then(function () {
                    return scanCanvasGridTiles(
                      jsQR,
                      target,
                      'zoom ' + Math.round(sf * 100) + '%',
                      gCols,
                      gRows
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
    if (scanOpts.preserveProfile && _activeQrScan) {
      _activeQrScan.batch = batchUi;
      _activeQrScan.scanned = scanned || _activeQrScan.scanned;
      _activeQrScan.thorough = thorough || _activeQrScan.thorough;
      _activeQrScan.batchLite = _activeQrScan.batchLite && batchUi && !_activeQrScan.thorough;
      if (scanOpts.provKey) _activeQrScan.provKey = scanOpts.provKey;
    } else {
      _activeQrScan = {
        scanned: scanned,
        thorough: thorough,
        batch: batchUi,
        batchLite: batchUi && scanned && !thorough,
        provKey: scanOpts.provKey || '',
      };
    }
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
          var maxP = batchUi
            ? 1
            : scanOpts.forceDeepQr
              ? Math.min(pdf.numPages, 3)
              : scanned || thorough
                ? Math.min(pdf.numPages, 2)
                : quick || light
                  ? 1
                  : Math.min(pdf.numPages, 2);
          var pageOrder = fePdfPageScanOrder(pdf.numPages, maxP);
          var renderScales;
          if (_activeQrScan && _activeQrScan.forceScales && _activeQrScan.forceScales.length) {
            renderScales = _activeQrScan.forceScales;
          } else if (batchUi && !scanned && !thorough) {
            renderScales = [2];
          } else if (isQrScanBatchLite()) {
            renderScales = [2.4, 3.1];
          } else if (batchUi && scanned) {
            renderScales = isQrScanEdgesOnly()
              ? [3.6, 4.2]
              : thorough
                ? [3.4, 4.2]
                : [3.2, 3.8, 4.2];
          } else if (scanned || thorough) {
            renderScales = isQrScanEdgesOnly()
              ? [3.6, 4.2, 4.8]
              : thorough
                ? [3.2, 3.8, 4.4]
                : [3.2, 3.8, 4.2];
          } else if (light) {
            renderScales = [2, 2.6];
          } else if (quick) {
            renderScales = [2, 2.8, 3.2];
          } else {
            renderScales = [2, 2.8, 3.2, 3.6];
          }
          var chain = Promise.resolve(null);
          var pi;
          for (pi = 0; pi < pageOrder.length; pi++) {
            (function (pageNum) {
              chain = chain.then(function (found) {
                if (found) return found;
                if (feQrBudgetExpired()) return null;
                return feYieldToMain(batchUi ? 40 : 12).then(function () {
                  tickQr('Página ' + pageNum + ' · QR…');
                  var inner = Promise.resolve(null);
                  var ri;
                  for (ri = 0; ri < renderScales.length; ri++) {
                    (function (rs) {
                      inner = inner.then(function (prev) {
                        if (prev) return prev;
                        if (feQrBudgetExpired()) return null;
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
            })(pageOrder[pi]);
          }
          return chain
            .then(function (hit) {
              if (hit && _activeQrScan && _activeQrScan.provKey) {
                rememberFeQrZoneFromHit(_activeQrScan.provKey, hit);
              }
              return hit;
            })
            .finally(function () {
            try {
              pdf.destroy();
            } catch (eD2) {}
          });
        });
      })
        .finally(function () {
        _activeQrScan = null;
      });
    }
    tickQr('Imagen · buscando QR…');
    var imgProvKey = scanOpts.provKey || (_activeQrScan && _activeQrScan.provKey) || '';
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
      .then(function (hit) {
        if (hit && imgProvKey) rememberFeQrZoneFromHit(imgProvKey, hit);
        return hit;
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
    var provKey = feProvQrKey(opts.proveedor, doc);
    feQrBeginBudget({ batchMode: batchMode, forceDeepQr: !!opts.forceDeepQr });
    var mime = String((doc && doc.mime) || '');
    var isPdf =
      mime.indexOf('pdf') >= 0 ||
      /^data:application\/pdf/i.test(doc.dataUrl || '') ||
      !!(doc && doc._pdfBlob);
    var smooth = createSmoothProgress(opts);
    smooth.start(52, 'Buscando código QR y CUFE…', 'detect', { init: true });

    var quickTextP = loadFeQrZoneMemory()
      .catch(function () {})
      .then(function () {
        return isPdf
          ? extractTextFromPdfDataUrl(doc, 1).then(function (t) {
              smooth.bump(11, 'Texto página 1 · candidatos CUFE…');
              return t;
            })
          : Promise.resolve('');
      });

    return quickTextP
      .then(function (quickText) {
        var fromQuick = extractAllCufeCandidates(quickText);
        var textCompactLen = quickText.replace(/\s/g, '').length;
        if (qrHitValid(null, fromQuick)) {
          smooth.bump(48, 'CUFE detectado en texto del PDF');
          return { qr: null, quickText: quickText, fromQuick: fromQuick, likelyScanned: false };
        }
        var likelyScanned = batchMode ? textCompactLen < 40 : !fromQuick.length || textCompactLen < 400;
        if (likelyScanned) {
          smooth.bump(10, 'PDF escaneado — QR arriba/abajo + CUFE…');
        } else {
          smooth.bump(10, 'Buscando QR en el documento…');
        }
        if (likelyScanned && !opts.forceDeepQr) {
          function batchQrProfile(profileId, basePct) {
            return scanQrWithProfile(
              doc,
              mime,
              profileId,
              function (ratio, msg) {
                smooth.bump(basePct + (ratio || 0) * 16, msg || 'QR ' + profileId + '…');
              },
              { forceDeepQr: false, batchMode: true, scanned: true, provKey: provKey }
            );
          }
          function packWithQr(qr) {
            return {
              qr: qr,
              quickText: quickText,
              fromQuick: fromQuick,
              likelyScanned: likelyScanned,
              _batchOcrDone: !!(qr && (qr.url || qr.cufe)),
            };
          }
          function qrHasCufe(qr) {
            return !!(qr && qr.cufe && isValidCufeHex(qr.cufe));
          }
          function qrReadable(qr) {
            if (!qr) return false;
            if (qrHasCufe(qr)) return true;
            return qrHitValid(qr, fromQuick);
          }
          function afterQrHit(qr) {
            if (!qrReadable(qr)) return Promise.resolve(null);
            return Promise.resolve(packWithQr(qr));
          }
          smooth.bump(12, 'PDF escaneado: QR arriba/abajo (bordes)…');
          return batchQrProfile('edges', 14)
            .then(function (qr) {
              return afterQrHit(qr).then(function (packed) {
                if (packed) return packed;
                return batchQrProfile('lite', 26).then(function (qr2) {
                  return afterQrHit(qr2).then(function (packed2) {
                    if (packed2) return packed2;
                    return batchQrProfile('standard', 40).then(function (qr3) {
                      return afterQrHit(qr3).then(function (packed3) {
                        if (packed3) return packed3;
                        return batchQrProfile('high', 52).then(function (qr4) {
                          return afterQrHit(qr4).then(function (packed4) {
                            if (packed4) return packed4;
                            return {
                              qr: qr4 || qr3 || qr2 || qr || null,
                              quickText: quickText,
                              fromQuick: fromQuick,
                              likelyScanned: likelyScanned,
                              _batchOcrDone: false,
                            };
                          });
                        });
                      });
                    });
                  });
                });
              });
            });
        }
        return scanQrCascade(doc, mime, {
          likelyScanned: likelyScanned,
          fromQuick: fromQuick,
          smooth: smooth,
          batchMode: batchMode,
          thorough: !batchMode,
          forceDeepQr: !!opts.forceDeepQr,
          provKey: provKey,
          stages: !batchMode && likelyScanned && !opts.forceDeepQr ? QR_CASCADE_SCANNED : undefined,
        }).then(function (qr) {
          return { qr: qr, quickText: quickText, fromQuick: fromQuick, likelyScanned: likelyScanned };
        });
      })
      .then(function (pack) {
        var batchMode = !!(opts.batchMode || global.__cxfFeBatchMode);
        function finalizeDetect(resolved, esElectronica) {
          var budgetMsg = feQrBudgetExpired() ? ' (tiempo máximo QR — use Reanalizar si falta CUFE)' : '';
          smooth.stop(
            esElectronica ? 56 : 54,
            esElectronica
              ? 'Factura electrónica confirmada (QR/CUFE)' + budgetMsg
              : likelyScannedPdfHint(pack.quickText, pack.qr, resolved) + budgetMsg,
            'cufe',
            { init: true, detect: true, cufe: true }
          );
          return {
            esElectronica: esElectronica,
            qr: pack.qr,
            quickText: pack.quickText,
            cufeResolved: resolved,
          };
        }

        var resolved = buildCufeResolution(pack.qr, pack.fromQuick);
        var esElectronica = isFacturaElectronicaDetectada(resolved, pack.qr);
        if (esElectronica && resolved.cufeValidado) return finalizeDetect(resolved, esElectronica);
        if (!pack.likelyScanned) {
          return finalizeDetect(resolved, esElectronica);
        }
        if (esElectronica && pack.qr && (pack.qr.url || pack.qr.cufe)) {
          return finalizeDetect(resolved, esElectronica);
        }
        if (pack._batchOcrDone && !opts.forceDeepQr && resolved.cufeValidado) {
          return finalizeDetect(resolved, esElectronica);
        }

        smooth.bump(
          55,
          batchMode ? 'OCR en pie de página (escaneo)…' : 'Leyendo CUFE impreso (OCR)…'
        );
        return extractCufeFromScannedOcr(doc, opts).then(function (ocrRes) {
          if (ocrRes && ocrRes.cufe && isValidCufeHex(ocrRes.cufe)) {
            resolved = ocrRes;
            esElectronica = isFacturaElectronicaDetectada(resolved, pack.qr);
          }
          return finalizeDetect(resolved, esElectronica);
        });
      })
      .finally(function () {
        feQrClearBudget();
      });
  }

  function likelyScannedPdfHint(quickText, qr, resolved) {
    if (quickText && quickText.replace(/\s/g, '').length >= 40) {
      return 'Sin QR ni CUFE válido — no parece FE';
    }
    if (qr && qr.url && !(qr.cufe && isValidCufeHex(qr.cufe))) {
      return 'QR detectado (URL proveedor) — CUFE pendiente; use «Reanalizar» o PDF oficial DIAN';
    }
    if (resolved && resolved.cufe && !resolved.cufeValidado) {
      return 'CUFE dudoso en imagen — confirme con «Abrir en DIAN» o suba PDF original de la DIAN';
    }
    if (!qr || (!qr.cufe && !qr.url)) {
      return 'PDF escaneado: no se leyó el QR — marque la zona, use cámara o suba PDF original DIAN';
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

  function isTauriDianFetch() {
    try {
      return !!(
        global.__TAURI__ &&
        global.__TAURI__.core &&
        typeof global.__TAURI__.core.invoke === 'function'
      );
    } catch (_) {
      return false;
    }
  }

  function invokeTauriDian(cufe) {
    return global.__TAURI__.core.invoke('fetch_dian_vpfe', { cufe: String(cufe || '') });
  }

  function blobFromBase64(b64, mime, nombre) {
    if (!b64) return null;
    try {
      var bin = atob(b64);
      var len = bin.length;
      var arr = new Uint8Array(len);
      for (var i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
      var blob = new Blob([arr], { type: mime || 'application/octet-stream' });
      return {
        id: 'dian_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        nombre: nombre || 'FE-DIAN-oficial.pdf',
        mime: mime || 'application/pdf',
        dataUrl: '',
        _pdfBlob: blob,
        _viewBlob: blob,
        role: 'dian-oficial',
      };
    } catch (e) {
      console.warn('[FE] blobFromBase64', e);
      return null;
    }
  }

  function buildDocOficialPayload(tauriRes, feMeta) {
    feMeta = feMeta || {};
    if (tauriRes && tauriRes.pdf_base64) {
      return {
        pdfBase64: tauriRes.pdf_base64,
        mime: 'application/pdf',
        nombre:
          (feMeta.numeroFactura ? 'FE-DIAN-' + feMeta.numeroFactura : 'FE-DIAN-oficial') + '.pdf',
        xmlText: tauriRes.xml || null,
        source: 'dian-vpfe',
      };
    }
    if (tauriRes && tauriRes.xml) {
      return {
        xmlText: tauriRes.xml,
        mime: 'application/xml',
        nombre:
          (feMeta.numeroFactura ? 'FE-DIAN-' + feMeta.numeroFactura : 'FE-DIAN-oficial') + '.xml',
        source: 'dian-vpfe-xml',
      };
    }
    return null;
  }

  function mergeFeParsed(base, extra, officialWins) {
    base = base || {};
    extra = extra || {};
    var out = {
      cufe: base.cufe || '',
      nitEmisor: base.nitEmisor || '',
      razonSocial: base.razonSocial || '',
      numeroFactura: base.numeroFactura || '',
      total: base.total || 0,
      fecha: base.fecha || '',
      lineas: (base.lineas || []).slice(),
      rawExcerpt: base.rawExcerpt || extra.rawExcerpt || '',
      qrUrl: base.qrUrl,
    };
    ['cufe', 'nitEmisor', 'razonSocial', 'numeroFactura', 'fecha'].forEach(function (k) {
      if (extra[k] && (officialWins || !out[k])) out[k] = extra[k];
    });
    if (extra.total && (officialWins || !out.total)) out.total = extra.total;
    if (extra.lineas && extra.lineas.length) {
      if (officialWins || !out.lineas.length) out.lineas = extra.lineas.slice();
    }
    return out;
  }

  /** Parser UBL 2.1 / AttachedDocument — líneas de producto desde XML DIAN. */
  function parseFeFromXml(xmlText) {
    var out = {
      cufe: '',
      nitEmisor: '',
      razonSocial: '',
      numeroFactura: '',
      total: 0,
      fecha: '',
      lineas: [],
      rawExcerpt: String(xmlText || '').slice(0, 2000),
    };
    xmlText = String(xmlText || '').trim();
    if (!xmlText) return out;
    try {
      var parser = new DOMParser();
      var xdoc = parser.parseFromString(xmlText, 'application/xml');
      if (xdoc.querySelector('parsererror')) return out;

      function nodesLocal(name) {
        var all = xdoc.getElementsByTagName('*');
        var found = [];
        for (var i = 0; i < all.length; i++) {
          var el = all[i];
          if (el.localName === name || (el.tagName && el.tagName.indexOf(':' + name) >= 0)) {
            found.push(el);
          }
        }
        return found;
      }

      function firstText(names) {
        for (var ni = 0; ni < names.length; ni++) {
          var list = nodesLocal(names[ni]);
          if (list.length && list[0].textContent) return list[0].textContent.trim();
        }
        return '';
      }

      function allText(parent, name) {
        var list = [];
        var kids = parent.getElementsByTagName('*');
        for (var i = 0; i < kids.length; i++) {
          if (kids[i].localName === name) list.push(kids[i].textContent.trim());
        }
        return list;
      }

      out.cufe = firstText(['UUID', 'CompanyID']) || extractCufeFromText(xmlText);
      out.nitEmisor = firstText(['CompanyID']);
      out.razonSocial = firstText(['RegistrationName', 'Name']);
      out.numeroFactura = firstText(['ID']);
      out.fecha = firstText(['IssueDate']);
      var payAmt = firstText(['PayableAmount', 'TaxInclusiveAmount', 'LegalMonetaryTotal']);
      if (payAmt) out.total = parseCopAmount(payAmt);

      var invoiceLines = nodesLocal('InvoiceLine');
      invoiceLines.forEach(function (line) {
        var descs = allText(line, 'Description');
        var names = allText(line, 'Name');
        var desc = (descs[0] || names[0] || '').trim();
        var qty = parseCopAmount(allText(line, 'InvoicedQuantity')[0] || '1') || 1;
        var val = parseCopAmount(
          allText(line, 'LineExtensionAmount')[0] ||
            allText(line, 'PriceAmount')[0] ||
            '0'
        );
        if (desc && desc.length > 2) {
          out.lineas.push({ descripcion: desc, cantidad: qty, valor: val });
        }
      });

      if (!out.lineas.length) {
        var descNodes = nodesLocal('Description');
        descNodes.forEach(function (dn) {
          var t = (dn.textContent || '').trim();
          if (t.length > 3 && t.length < 120 && out.lineas.length < 24) {
            out.lineas.push({ descripcion: t, cantidad: 1, valor: 0 });
          }
        });
      }
    } catch (err) {
      console.warn('[FE] parseFeFromXml', err);
    }
    return out;
  }

  var VPFE_BASE = 'https://catalogo-vpfe.dian.gov.co';

  function vpfeResolveUrl(base, href) {
    href = String(href || '').trim();
    if (/^https?:\/\//i.test(href)) return href;
    if (href.indexOf('//') === 0) return 'https:' + href;
    base = String(base || '').replace(/\/+$/, '');
    if (href.indexOf('/') === 0) return VPFE_BASE + href;
    return base + '/' + href;
  }

  function vpfeExtractHrefLinks(html) {
    var links = [];
    var re = /href\s*=\s*"([^"#]+)"/gi;
    var m;
    html = String(html || '');
    while ((m = re.exec(html))) {
      var href = m[1].trim();
      if (href && href.indexOf('javascript:') !== 0) links.push(href);
    }
    return links;
  }

  function vpfePickDownloadUrl(links, base, kind) {
    var needles =
      kind === 'xml'
        ? ['.xml', 'xml', 'downloadxml', 'getxml', 'attacheddocument']
        : ['.pdf', 'pdf', 'downloadpdf', 'getpdf'];
    for (var i = 0; i < links.length; i++) {
      var lower = links[i].toLowerCase();
      for (var j = 0; j < needles.length; j++) {
        if (lower.indexOf(needles[j]) >= 0) return vpfeResolveUrl(base, links[i]);
      }
    }
    return '';
  }

  function vpfeBodyLooksLikeXml(body) {
    var t = String(body || '').trimStart();
    return t.indexOf('<?xml') === 0 || t.indexOf(':Invoice') >= 0 || t.indexOf('AttachedDocument') >= 0;
  }

  function arrayBufferToBase64(ab) {
    var bytes = new Uint8Array(ab);
    var chunk = 8192;
    var bin = '';
    for (var i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunk, bytes.length)));
    }
    return btoa(bin);
  }

  function vpfeDeepFetchFromHtml(html, pageUrl, cufe) {
    if (vpfeBodyLooksLikeXml(html)) {
      var parsedXml = parseFeFromXml(html);
      var parsed = mergeFeParsed(parseFeFromText(html), parsedXml, true);
      var xmlShape = { ok: true, html: '', xml: html, motivo: 'XML UBL recibido' };
      return Promise.resolve(mapTauriDianResult(xmlShape, cufe));
    }

    var links = vpfeExtractHrefLinks(html);
    var xmlUrl = vpfePickDownloadUrl(links, pageUrl, 'xml');
    var pdfUrl = vpfePickDownloadUrl(links, pageUrl, 'pdf');
    var acc = { xml: null, pdfBase64: null, pdfUrl: pdfUrl, xmlUrl: xmlUrl };

    function fetchXml() {
      if (!xmlUrl) return Promise.resolve();
      return fetch(xmlUrl, { method: 'GET', credentials: 'omit' })
        .then(function (res) {
          if (!res.ok) return;
          return res.text().then(function (body) {
            if (vpfeBodyLooksLikeXml(body)) acc.xml = body;
          });
        })
        .catch(function () {});
    }

    function fetchPdf() {
      if (!pdfUrl) return Promise.resolve();
      return fetch(pdfUrl, { method: 'GET', credentials: 'omit' })
        .then(function (res) {
          if (!res.ok) return;
          return res.arrayBuffer().then(function (ab) {
            if (ab && ab.byteLength > 80) acc.pdfBase64 = arrayBufferToBase64(ab);
          });
        })
        .catch(function () {});
    }

    return fetchXml()
      .then(function () {
        if (acc.xml) return;
        var i;
        for (i = 0; i < links.length; i++) {
          var lower = links[i].toLowerCase();
          if (lower.indexOf('.xml') >= 0 || lower.indexOf('xml') >= 0) {
            var u = vpfeResolveUrl(pageUrl, links[i]);
            return fetch(u, { method: 'GET', credentials: 'omit' })
              .then(function (res) {
                if (!res.ok) return;
                return res.text().then(function (body) {
                  if (vpfeBodyLooksLikeXml(body)) acc.xml = body;
                });
              })
              .catch(function () {});
          }
        }
      })
      .then(fetchPdf)
      .then(function () {
        var shape = {
          ok: !!(acc.xml || acc.pdfBase64 || html.length > 200),
          html: html,
          xml: acc.xml,
          pdf_base64: acc.pdfBase64,
          pdf_url: acc.pdfUrl,
          xml_url: acc.xmlUrl,
          motivo: acc.xml
            ? 'Factura electrónica XML descargada de DIAN'
            : acc.pdfBase64
              ? 'Representación PDF oficial descargada de DIAN'
              : 'Consulta DIAN OK — sin descarga automática',
        };
        return mapTauriDianResult(shape, cufe);
      });
  }

  var _tesseractPromise = null;
  var FE_TESSERACT_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
  var FE_TESSERACT_WORKER_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js';

  function ensureTesseract() {
    if (global.Tesseract && typeof global.Tesseract.recognize === 'function') {
      return Promise.resolve(global.Tesseract);
    }
    if (_tesseractPromise) return _tesseractPromise;
    _tesseractPromise = new Promise(function (resolve, reject) {
      var candidates = [
        resolveFeVendorUrl('vendor/CrozzoTesseract.min.js'),
        FE_TESSERACT_CDN,
      ];
      var idx = 0;
      function tryNext() {
        if (idx >= candidates.length) {
          reject(new Error('No se pudo cargar OCR (Tesseract)'));
          return;
        }
        var s = document.createElement('script');
        s.async = true;
        s.setAttribute('data-cxf-tesseract', String(idx));
        s.src = candidates[idx++];
        s.onload = function () {
          if (global.Tesseract && typeof global.Tesseract.recognize === 'function') {
            resolve(global.Tesseract);
          } else {
            tryNext();
          }
        };
        s.onerror = function () {
          tryNext();
        };
        document.head.appendChild(s);
      }
      tryNext();
    });
    return _tesseractPromise;
  }

  function feIsNodeRuntime() {
    return typeof process !== 'undefined' && !!(process.versions && process.versions.node);
  }

  function feIsBrowserOcrContext() {
    return !feIsNodeRuntime() && typeof document !== 'undefined' && document.head;
  }

  function feRunOcr(T, dataUrl, extra) {
    var opts = feOcrRecognizeOptions(extra);
    if (feIsBrowserOcrContext()) {
      if (!opts.workerPath) opts.workerPath = FE_TESSERACT_WORKER_CDN;
    } else {
      delete opts.workerPath;
      delete opts.langPath;
    }
    return T.recognize(dataUrl, 'eng', opts);
  }

  /** OCR en pie de página escaneado — CUFE impreso cuando el QR no se lee. */
  function extractCufeFromScannedOcr(doc, opts) {
    opts = opts || {};
    if (typeof opts.onProgress === 'function') {
      opts.onProgress({ pct: 54, label: 'OCR en pie de factura (CUFE impreso)…', stepId: 'detect' });
    }
    var cropStarts = [0.25, 0.35, 0.45, 0.55, 0.65, 0.75];
    var ocrExtra = {
      tessedit_char_whitelist: '0123456789abcdefABCDEFCUFEcufe: \n\r\t/-',
    };
    return runPdfExclusive(function () {
      return openPdfDocument(doc).then(function (pdf) {
        return pdf.getPage(1).then(function (page) {
          var batchUi = !!(opts.batchMode || global.__cxfFeBatchMode);
          var scale = batchUi ? 5 : 4.5;
          var vp = page.getViewport({ scale: scale });
          var full = document.createElement('canvas');
          full.width = Math.ceil(vp.width);
          full.height = Math.ceil(vp.height);
          return page
            .render({ canvasContext: full.getContext('2d'), viewport: vp })
            .promise.then(function () {
              function ocrOneCanvas(canvas) {
                var dataUrl =
                  typeof canvas.toDataURL === 'function' ? canvas.toDataURL('image/png') : '';
                if (!dataUrl) return Promise.resolve(null);
                return ensureTesseract().then(function (T) {
                  return feRunOcr(T, dataUrl, ocrExtra).then(function (res) {
                    var text = (res.data && res.data.text) || '';
                    var cands = extractAllCufeCandidates(text);
                    cands.forEach(function (c) {
                      c.source = 'ocr-pie-pagina';
                      c.score = (c.score || 0) + 18;
                    });
                    if (!cands.length) return null;
                    return buildCufeResolution(null, cands);
                  });
                });
              }
              function ocrCropRegion(region) {
                if (region.cw < 80 || region.ch < 60) return Promise.resolve(null);
                var crop = document.createElement('canvas');
                crop.width = region.cw;
                crop.height = region.ch;
                crop
                  .getContext('2d')
                  .drawImage(full, region.x, region.y, region.cw, region.ch, 0, 0, region.cw, region.ch);
                var enhanced = feCanvasForOcr(crop);
                return ocrOneCanvas(crop).then(function (hit) {
                  if (hit && hit.cufe && isValidCufeHex(hit.cufe)) return hit;
                  return ocrOneCanvas(enhanced);
                });
              }
              function ocrCrop(startRatio) {
                var cropY = Math.floor(full.height * startRatio);
                var cropH = full.height - cropY;
                if (cropH < 80) return Promise.resolve(null);
                return ocrCropRegion({ x: 0, y: cropY, cw: full.width, ch: cropH });
              }
              var cornerRegions = [
                {
                  x: Math.floor(full.width * 0.42),
                  y: 0,
                  cw: Math.floor(full.width * 0.58),
                  ch: Math.floor(full.height * 0.38),
                },
                {
                  x: Math.floor(full.width * 0.48),
                  y: Math.floor(full.height * 0.58),
                  cw: Math.floor(full.width * 0.52),
                  ch: Math.floor(full.height * 0.42),
                },
              ];
              var chain = Promise.resolve(null);
              var ci;
              for (ci = 0; ci < cornerRegions.length; ci++) {
                (function (reg) {
                  chain = chain.then(function (prev) {
                    if (prev && prev.cufe && isValidCufeHex(prev.cufe)) return prev;
                    return ocrCropRegion(reg);
                  });
                })(cornerRegions[ci]);
              }
              var si;
              for (si = 0; si < cropStarts.length; si++) {
                (function (ratio) {
                  chain = chain.then(function (prev) {
                    if (prev && prev.cufe && isValidCufeHex(prev.cufe)) return prev;
                    return ocrCrop(ratio);
                  });
                })(cropStarts[si]);
              }
              return chain;
            });
        });
      });
    }).catch(function (err) {
      console.warn('[FE] OCR CUFE', err);
      return null;
    });
  }

  /** Clasificación entrenada para UI y segundo pase automático. */
  function classifyFeDoc(analisis, docHint) {
    analisis = analisis || {};
    docHint = docHint || {};
    var src = String(analisis.cufeSource || '');
    if (analisis.estado === 'error') {
      return {
        id: 'error',
        hint: 'Error en análisis — use Reanalizar',
      };
    }
    if (!analisis.esElectronica || !analisis.cufeValidado) {
      var qrStepOk =
        (analisis.pasos || []).some(function (p) {
          return p.id === 'qr' && p.ok;
        }) ||
        !!(analisis.fe && analisis.fe.qrUrl) ||
        !!(analisis.dianUrl && /^https?:\/\//i.test(analisis.dianUrl));
      if (analisis.esElectronica && qrStepOk && !analisis.cufeValidado) {
        return {
          id: 'fe-qr-sin-cufe',
          hint:
            'QR leído — falta CUFE válido. Use «Reanalizar», marque el QR en vista o PDF oficial DIAN. ' +
            getFeTrainingUiHint(),
        };
      }
      if (docHint.scanned || docHint.likelyScanned) {
        return {
          id: 'escaneada-sin-qr-cufe',
          hint:
            'Escaneo sin QR/CUFE legible — marque el QR en vista, cámara o PDF oficial DIAN. ' +
            getFeTrainingUiHint(),
        };
      }
      return {
        id: 'sin-fe-detectada',
        hint: 'No se confirmó factura electrónica en este documento',
      };
    }
    if (/qr/i.test(src)) {
      return { id: 'fe-qr', hint: 'CUFE leído del código QR DIAN' };
    }
    if (/ocr/i.test(src)) {
      return { id: 'fe-ocr', hint: 'CUFE leído por OCR en pie de página' };
    }
    if (/texto|pdf|etiqueta/i.test(src) || (docHint.textLen && docHint.textLen > 80)) {
      return { id: 'fe-texto-pdf', hint: 'CUFE leído del texto del PDF' };
    }
    return { id: 'fe-detectada', hint: 'Factura electrónica confirmada' };
  }

  function classifyFeDocProfile(analisis, docHint) {
    var c = classifyFeDoc(analisis, docHint);
    return c && c.id ? c.id : 'desconocido';
  }

  function fetchDianConsultaBrowser(cufe) {
    var url = buildDianConsultaUrl(cufe);
    return fetch(url, { method: 'GET', mode: 'cors', credentials: 'omit' })
      .then(function (res) {
        if (!res.ok) return { ok: false, motivo: 'DIAN respondió ' + res.status, url: url };
        return res.text().then(function (html) {
          return vpfeDeepFetchFromHtml(html, url, cufe).catch(function (err) {
            console.warn('[FE] VPFE deep', err);
            return {
              ok: true,
              url: url,
              html: html,
              parsed: parseFeFromText(html),
              motivo: 'Consulta DIAN (sin descarga automática)',
            };
          });
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

  function mapTauriDianResult(r, cufe) {
    var url = buildDianConsultaUrl(cufe);
    if (!r) {
      return { ok: false, motivo: 'Sin respuesta DIAN', url: url };
    }
    var parsed = parseFeFromText(r.html || '');
    var parsedXml = null;
    if (r.xml) {
      parsedXml = parseFeFromXml(r.xml);
      parsed = mergeFeParsed(parsed, parsedXml, true);
    }
    return {
      ok: !!r.ok,
      url: url,
      html: r.html || '',
      xmlText: r.xml || null,
      pdfBase64: r.pdf_base64 || null,
      pdfUrl: r.pdf_url || null,
      xmlUrl: r.xml_url || null,
      parsed: parsed,
      parsedXml: parsedXml,
      motivo: r.motivo || (r.ok ? 'Consulta DIAN' : 'DIAN no disponible'),
      docOficialPayload: buildDocOficialPayload(r, parsed),
    };
  }

  /**
   * Tras CUFE: descarga oficial DIAN (Tauri) → XML UBL o PDF → análisis profundo de líneas.
   */
  function processDianOfficialDeep(ctx, opts, batchMode) {
    var cufe = (ctx.fe && ctx.fe.cufe) || '';
    if (!cufe) {
      return Promise.resolve(ctx);
    }
    var skipDownload = !!(batchMode && !opts.forceDeepQr && !isValidCufeHex(cufe) && !isTauriDianFetch());
    if (skipDownload) {
      ctx.dian = {
        ok: false,
        motivo: 'Sin CUFE válido — descarga DIAN omitida en lote',
        url: buildDianConsultaUrl(cufe),
        deferredBatch: true,
      };
      return Promise.resolve(ctx);
    }

    emitProgress(opts, 80, 'Descargando factura electrónica en DIAN…', 'dian', {
      init: true,
      detect: true,
      cufe: true,
      texto: true,
    });

    var fetchP;
    if (isTauriDianFetch()) {
      fetchP = invokeTauriDian(cufe)
        .then(function (r) {
          return mapTauriDianResult(r, cufe);
        })
        .catch(function (err) {
          console.warn('[FE] Tauri DIAN', err);
          return fetchDianConsultaBrowser(cufe);
        });
    } else {
      fetchP = fetchDianConsultaBrowser(cufe);
    }

    return fetchP.then(function (dian) {
      ctx.dian = dian;
      ctx.docOficialPayload = (dian && dian.docOficialPayload) || null;

      var deepP = Promise.resolve();
      if (dian && dian.parsedXml && dian.parsedXml.lineas && dian.parsedXml.lineas.length) {
        ctx.fe = mergeFeParsed(ctx.fe, dian.parsedXml, true);
        ctx.feDeepSource = 'xml-ubl-dian';
      } else if (dian && dian.xmlText) {
        var px = parseFeFromXml(dian.xmlText);
        ctx.fe = mergeFeParsed(ctx.fe, px, true);
        if (px.lineas.length) ctx.feDeepSource = 'xml-ubl-dian';
      }

      if (dian && dian.pdfBase64) {
        var offDoc = blobFromBase64(
          dian.pdfBase64,
          'application/pdf',
          (ctx.fe.numeroFactura ? 'FE-DIAN-' + ctx.fe.numeroFactura : 'FE-DIAN-oficial') + '.pdf'
        );
        if (offDoc) {
          ctx.docOficial = offDoc;
          var maxPages = opts.forceDeepQr ? 14 : 10;
          deepP = extractTextFromPdfDataUrl(offDoc, maxPages).then(function (text) {
            var feOff = parseFeFromText(text);
            ctx.fe = mergeFeParsed(ctx.fe, feOff, true);
            if (feOff.lineas && feOff.lineas.length) ctx.feDeepSource = 'pdf-oficial-dian';
          });
        }
      }

      return deepP.then(function () {
        return ctx;
      });
    });
  }

  function fetchDianConsulta(cufe) {
    if (isTauriDianFetch()) {
      return invokeTauriDian(cufe)
        .then(function (r) {
          return mapTauriDianResult(r, cufe);
        })
        .catch(function () {
          return fetchDianConsultaBrowser(cufe);
        });
    }
    return fetchDianConsultaBrowser(cufe);
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
          'No se leyó QR (nativo + jsQR + modo cámara) — use «Reanalizar», cámara o PDF original DIAN',
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
      qrDetectado: !!(ctx.qr && (ctx.qr.url || ctx.qr.cufe)),
      qrUrl: (ctx.qr && ctx.qr.url) || (fe && fe.qrUrl) || '',
      dianOk: !!(ctx.dian && ctx.dian.ok),
      dianDownloaded: !!(
        ctx.dian &&
        (ctx.dian.parsedXml || ctx.dian.xmlText || ctx.dian.pdfBase64 || ctx.docOficialPayload)
      ),
      fe: fe,
      pasos: pasos,
      proveedorMatch: provMatch,
      valorVerificacion: valorVer,
      lineasSugeridas: sugeridas,
      analizadoAt: new Date().toISOString(),
      progreso: { pct: 100, label: 'Completado', stepId: 'cierre' },
      docOficialPayload: ctx.docOficialPayload || null,
      feDeepSource: ctx.feDeepSource || 'pdf-subido',
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

          emitProgress(opts, 78, 'Consultando y descargando DIAN…', 'dian', {
            init: true,
            detect: true,
            cufe: true,
            texto: true,
          });
          pasos.push({ id: 'dian', ok: false, titulo: 'DIAN · descarga oficial', detalle: 'Consultando…' });
          return feYieldToMain(batchMode ? 20 : 16)
            .then(function () {
              return processDianOfficialDeep(ctx, opts, batchMode);
            })
            .then(function (ctx2) {
              var dian = ctx2.dian || {};
              if (dian.ok && (dian.parsedXml || dian.pdfBase64 || dian.xmlText)) {
                pasos[pasos.length - 1] = {
                  id: 'dian',
                  ok: true,
                  titulo: 'DIAN · descarga oficial',
                  detalle:
                    ctx2.feDeepSource === 'xml-ubl-dian'
                      ? 'XML UBL descargado — líneas de producto desde factura oficial'
                      : ctx2.feDeepSource === 'pdf-oficial-dian'
                        ? 'PDF oficial DIAN — análisis profundo de productos'
                        : dian.motivo || 'Datos leídos del portal DIAN',
                };
              } else {
                pasos[pasos.length - 1] = {
                  id: 'dian',
                  ok: false,
                  warn: true,
                  titulo: 'DIAN · descarga oficial',
                  detalle:
                    (dian && dian.motivo) ||
                    'Use «Abrir en DIAN» o Reanalizar (app de escritorio descarga sin CORS)',
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
              return finalizeFeAnalisis(ctx2, pasos, opts, prov, valorCajero, mpCatalog);
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

  function renderFeStatusChips(analisis, docHint) {
    analisis = analisis || {};
    docHint = docHint || {};
    var chips = [];
    var src = String(analisis.cufeSource || '');
    var qrPasosOk = (analisis.pasos || []).some(function (p) {
      return p.id === 'qr' && p.ok;
    });
    var qrUrlHit = !!(analisis.fe && analisis.fe.qrUrl);
    if (/qr/i.test(src) || qrPasosOk || qrUrlHit) chips.push({ cls: 'qr', label: 'QR' });
    else if (/ocr/i.test(src)) chips.push({ cls: 'ocr', label: 'OCR' });
    else if (src) chips.push({ cls: 'txt', label: 'Texto PDF' });
    if (analisis.dianDownloaded) chips.push({ cls: 'dian', label: 'DIAN XML/PDF' });
    else if (analisis.dianOk) chips.push({ cls: 'dian', label: 'DIAN OK' });
    if (docHint.scanned || docHint.likelyScanned) chips.push({ cls: 'scan', label: 'Escaneada' });
    if (!chips.length) return '';
    var html = '<div class="cxf-fe-chips">';
    chips.forEach(function (c) {
      html += '<span class="cxf-fe-chip cxf-fe-chip--' + c.cls + '">' + esc(c.label) + '</span>';
    });
    html += '</div>';
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
    html += renderFeStatusChips(analisis, opts.docHint || {});
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
    if (analisis.feDeepSource && analisis.feDeepSource !== 'pdf-subido') {
      html +=
        '<p class="form-hint cxf-fe-analisis__deep-src">Análisis profundo: <strong>' +
        esc(
          analisis.feDeepSource === 'xml-ubl-dian'
            ? 'XML oficial DIAN (UBL)'
            : analisis.feDeepSource === 'pdf-oficial-dian'
              ? 'PDF oficial DIAN'
              : analisis.feDeepSource
        ) +
        '</strong> — el PDF que subió se conserva como respaldo.</p>';
    }
    if (analisis.docOficialPayload) {
      html += '<p class="form-hint"><span class="badge badge-info">Factura DIAN guardada en adjuntos</span></p>';
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
          '<p class="cxf-fe-analisis__qr-hint">No se detectó QR en el PDF. Marque el código en la vista previa o use la cámara.</p>';
      }
      if (sinQr) {
        html +=
          '<button type="button" class="btn btn-primary btn-sm" data-cxf-fe-marca-qr data-prov-id="' +
          esc(pid) +
          '" data-factura-id="' +
          esc(fid) +
          '">🔲 Marcar QR en vista</button> ';
      }
      html +=
        '<button type="button" class="' +
        (sinQr ? 'btn btn-outline btn-sm' : 'btn btn-outline btn-sm') +
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
    renderFeStatusChips: renderFeStatusChips,
    parseFeFromText: parseFeFromText,
    parseFeFromXml: parseFeFromXml,
    fetchDianConsulta: fetchDianConsulta,
    parseQrPayload: parseQrPayload,
    normalizeQrPayload: normalizeQrPayload,
    decodeQrFromCanvas: decodeQrFromCanvas,
    decodeQrFromVideoFrame: decodeQrFromVideoFrame,
    buildDianConsultaUrl: buildDianConsultaUrl,
    matchProveedor: matchProveedor,
    verifyValorCajero: verifyValorCajero,
    suggestMpLines: suggestMpLines,
    extractCufeFromText: extractCufeFromText,
    extractAllCufeCandidates: extractAllCufeCandidates,
    scanQrDeep: scanQrDeep,
    scanQrInMarkedRegion: scanQrInMarkedRegion,
    resolveQrAndCufe: resolveQrAndCufe,
    detectFeElectronica: detectFeElectronica,
    classifyFeDocProfile: classifyFeDocProfile,
    classifyFeDoc: classifyFeDoc,
    isValidCufeHex: isValidCufeHex,
    loadFeTrainingProfile: loadFeTrainingProfile,
    getFeTrainingProfile: getFeTrainingProfile,
    getFeTrainingUiHint: getFeTrainingUiHint,
    loadFeQrZoneMemory: loadFeQrZoneMemory,
    probePdfQuickProfile: probePdfQuickProfile,
    feProvQrKey: feProvQrKey,
    rememberFeQrZoneFromHit: rememberFeQrZoneFromHit,
  };
})(typeof window !== 'undefined' ? window : globalThis);
