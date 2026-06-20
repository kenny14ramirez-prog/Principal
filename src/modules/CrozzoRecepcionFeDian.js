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
              : json.summary && json.summary['escaneada-sin-texto']
                ? json.summary['escaneada-sin-texto']
                : 0;
          json.scannedFailPct = json.sampleSize ? Math.round((failN / json.sampleSize) * 100) : 58;
          var nomPct = json.probeNombrePct != null ? json.probeNombrePct : json.okFePct;
          json.hint =
            'Entrenamiento ' +
            json.sampleSize +
            ' facturas (' +
            (json.trainedAt || '') +
            '): proveedor ~' +
            nomPct +
            '% · ' +
            (json.vendors ? json.vendors.length : 0) +
            ' proveedores en catálogo.';
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

  function feOcrWorkerPath() {
    return resolveFeVendorUrl('vendor/CrozzoTesseract.worker.min.js');
  }

  function feOcrCorePath() {
    return resolveFeVendorUrl('vendor/tesseract-core/');
  }

  function feOcrRecognizeOptions(extra) {
    extra = extra || {};
    return Object.assign(
      {
        logger: function () {},
        langPath: feOcrLangPath(),
        gzip: false,
        workerPath: feOcrWorkerPath(),
        corePath: feOcrCorePath(),
      },
      extra
    );
  }

  var FE_OCR_TESSDATA_CDN = 'https://tessdata.projectnaptha.com/4.0.0';
  var FE_OCR_AYUDA_LS = 'crozzo_fe_ocr_ayuda_v1';
  var FE_OCR_SPACE_URL = 'https://api.ocr.space/parse/image';

  function feOcrPuedeUsarCdn() {
    try {
      return typeof navigator === 'undefined' || navigator.onLine !== false;
    } catch (_) {
      return true;
    }
  }

  function feGetOcrAyudaConfig() {
    try {
      var raw = localStorage.getItem(FE_OCR_AYUDA_LS);
      if (!raw) return { nubeActiva: false, ocrSpaceApiKey: '' };
      var c = JSON.parse(raw);
      return {
        nubeActiva: !!c.nubeActiva,
        ocrSpaceApiKey: String(c.ocrSpaceApiKey || '').trim(),
      };
    } catch (_) {
      return { nubeActiva: false, ocrSpaceApiKey: '' };
    }
  }

  function feSetOcrAyudaConfig(patch) {
    var cur = feGetOcrAyudaConfig();
    var next = Object.assign({}, cur, patch || {});
    try {
      localStorage.setItem(FE_OCR_AYUDA_LS, JSON.stringify(next));
    } catch (_) {}
    return next;
  }

  function feRunOcrTexto(T, dataUrl, extra) {
    extra = extra || {};
    if (!feOcrPuedeUsarCdn()) {
      return feRunOcr(T, dataUrl, extra);
    }
    var opts = feOcrRecognizeOptions(extra);
    opts.langPath = FE_OCR_TESSDATA_CDN;
    opts.gzip = true;
    return T.recognize(dataUrl, 'spa+eng', opts).catch(function () {
      return feRunOcr(T, dataUrl, extra);
    });
  }

  function feOcrRenderPageDataUrl(doc, opts) {
    opts = opts || {};
    var rotationTurns = opts.rotationTurns || 0;
    var cropTop = opts.cropTop;
    if (cropTop === undefined) cropTop = 0.55;
    var fullPage = cropTop === null || cropTop === false || cropTop >= 0.99;
    return runPdfExclusive(function () {
      return openPdfDocument(doc).then(function (pdf) {
        return pdf.getPage(opts.pageNum || 1).then(function (page) {
          var scale = opts.scale || 2.8;
          var vp = page.getViewport({ scale: scale });
          var full = document.createElement('canvas');
          full.width = Math.ceil(vp.width);
          full.height = Math.ceil(vp.height);
          return page
            .render({ canvasContext: full.getContext('2d'), viewport: vp })
            .promise.then(function () {
              var src = full;
              if (!fullPage && cropTop > 0) {
                var cropH = Math.ceil(full.height * cropTop);
                var crop = document.createElement('canvas');
                crop.width = full.width;
                crop.height = cropH;
                crop
                  .getContext('2d')
                  .drawImage(full, 0, 0, full.width, cropH, 0, 0, full.width, cropH);
                src = crop;
              }
              if (rotationTurns) src = rotateCanvas90(src, rotationTurns);
              return typeof src.toDataURL === 'function' ? src.toDataURL('image/png') : '';
            });
        });
      });
    }).catch(function () {
      return '';
    });
  }

  function feOcrRenderHeaderDataUrl(doc) {
    return feOcrRenderPageDataUrl(doc, { cropTop: 0.55, rotationTurns: 0, scale: 3.2 });
  }

  function feOcrLocalDesdeDataUrl(dataUrl, extra) {
    if (!dataUrl) return Promise.resolve('');
    return ensureTesseract()
      .then(function (T) {
        return feRunOcrTexto(T, dataUrl, extra || {});
      })
      .then(function (res) {
        return String((res.data && res.data.text) || '').trim();
      })
      .catch(function () {
        return '';
      });
  }

  function feOcrNubeDesdeDataUrl(dataUrl, force) {
    var cfg = feGetOcrAyudaConfig();
    if (!force && !cfg.nubeActiva) return Promise.resolve('');
    if (!dataUrl) return Promise.resolve('');
    var apiKey = cfg.ocrSpaceApiKey || 'helloworld';
    var body = new FormData();
    body.append('apikey', apiKey);
    body.append('language', 'spa');
    body.append('OCREngine', '2');
    body.append('scale', 'true');
    body.append('isOverlayRequired', 'false');
    body.append('detectOrientation', 'true');
    body.append('base64Image', dataUrl);
    return fetch(FE_OCR_SPACE_URL, { method: 'POST', body: body })
      .then(function (r) {
        return r.json();
      })
      .then(function (j) {
        if (!j || j.IsErroredOnProcessing) return '';
        return (j.ParsedResults || [])
          .map(function (p) {
            return p.ParsedText || '';
          })
          .join('\n')
          .trim();
      })
      .catch(function () {
        return '';
      });
  }

  function feAplicarTextoOcrAFe(fe, pack, meta, ocrText) {
    if (!ocrText) return fe || {};
    var feOcr = parseFeFromText(ocrText);
    fe = feMergeFePreferFill(fe || {}, feOcr);
    return feComprenderNombresEnFactura(fe, pack, meta, ocrText);
  }

  function feScoreExtraccionFe(fe, pack) {
    fe = fe || {};
    pack = pack || {};
    var s = 0;
    if (fe.nitEmisor && normNit(fe.nitEmisor).length >= 8) s += 28;
    if (fe.razonSocial && String(fe.razonSocial).trim().length >= 4) s += 26;
    if (fe.direccionEmisor) s += 8;
    if (fe.telefonoEmisor) s += 6;
    if (fe.representanteEmisor) s += 6;
    if (fe.numeroFactura) s += 6;
    if (fe.total) s += 8;
    if (fe.cufe) s += 10;
    if ((pack.textLen || 0) > 400) s += 8;
    if ((pack.textLen || 0) > 80 && (pack.blockCount || 0) > 8) s += 6;
    return s;
  }

  function feProbeNecesitaReintento(probe, pack, nivel) {
    nivel = nivel == null ? 0 : nivel;
    probe = probe || {};
    pack = pack || probe._packRef || {};
    var fe = probe.fe || {};
    var score = feScoreExtraccionFe(fe, pack);
    if (nivel >= 2) return false;
    if (nivel === 0) {
      if (score >= 52) return false;
      if ((probe.confidence || 0) >= 55 && fe.nitEmisor && fe.razonSocial) return false;
      return true;
    }
    if (nivel === 1) {
      if (score >= 50 && fe.nitEmisor && fe.razonSocial) return false;
      if ((probe.confidence || 0) >= 58) return false;
      return score < 48 || !fe.nitEmisor || feNecesitaOcrNombres(fe, pack);
    }
    return false;
  }

  function feOcrCascadeRotaciones(doc, pack, fe, meta, opts) {
    opts = opts || {};
    meta = meta || {};
    fe = fe || {};
    pack = pack || {};
    var minScore = opts.minScore || 42;
    var turns = [0, 1, 2, 3];
    var best = { fe: fe, score: feScoreExtraccionFe(fe, pack), turns: 0, fuente: '' };
    var chain = Promise.resolve();
    turns.forEach(function (t) {
      chain = chain.then(function () {
        if (best.score >= minScore + 18) return;
        return feOcrRenderPageDataUrl(doc, {
          cropTop: opts.fullPage ? null : 0.92,
          rotationTurns: t,
          scale: opts.scale || 2.6,
        }).then(function (dataUrl) {
          if (!dataUrl) return;
          return feOcrLocalDesdeDataUrl(dataUrl).then(function (text) {
            if (!text || text.replace(/\s/g, '').length < 20) return;
            var feTry = feAplicarTextoOcrAFe(best.fe, pack, meta, text);
            var sc = feScoreExtraccionFe(feTry, pack);
            if (sc > best.score) {
              best = { fe: feTry, score: sc, turns: t, fuente: 'dispositivo' };
            }
          });
        });
      });
    });
    return chain.then(function () {
      if (best.turns) {
        best.fe._ocrRotacion = best.turns * 90;
        best.fe._ocrAyudaFuente = best.fuente || 'dispositivo';
      }
      return best.fe;
    });
  }

  function feOcrCascadeNubeRotaciones(doc, pack, fe, meta) {
    meta = meta || {};
    fe = fe || {};
    pack = pack || {};
    var force = !!(meta.cascadeLevel >= 2 || meta.forceOcrNube);
    var turns = [0, 1, 2, 3];
    var best = { fe: fe, score: feScoreExtraccionFe(fe, pack), turns: fe._ocrRotacion ? fe._ocrRotacion / 90 : 0 };
    var chain = Promise.resolve();
    turns.forEach(function (t) {
      chain = chain.then(function () {
        if (best.score >= 58) return;
        return feOcrRenderPageDataUrl(doc, { cropTop: null, rotationTurns: t, scale: 2.4 }).then(function (dataUrl) {
          if (!dataUrl) return;
          return feOcrNubeDesdeDataUrl(dataUrl, force).then(function (text) {
            if (!text || text.replace(/\s/g, '').length < 20) return;
            var feTry = feAplicarTextoOcrAFe(best.fe, pack, meta, text);
            var sc = feScoreExtraccionFe(feTry, pack);
            if (sc > best.score) {
              best = { fe: feTry, score: sc, turns: t };
            }
          });
        });
      });
    });
    return chain.then(function () {
      if (best.turns) best.fe._ocrRotacion = best.turns * 90;
      if (best.score > feScoreExtraccionFe(fe, pack)) {
        best.fe._ocrAyudaFuente = fe._ocrAyudaFuente
          ? fe._ocrAyudaFuente.indexOf('nube') >= 0
            ? fe._ocrAyudaFuente
            : fe._ocrAyudaFuente + '+nube'
          : 'nube';
      }
      return best.fe;
    });
  }

  function feOcrAyudaParaProveedor(doc, pack, fe, meta) {
    fe = fe || {};
    pack = pack || {};
    meta = meta || {};
    if (!feNecesitaOcrNombres(fe, pack)) return Promise.resolve(fe);

    return feOcrRenderHeaderDataUrl(doc).then(function (dataUrl) {
      if (!dataUrl) return fe;
      return feOcrLocalDesdeDataUrl(dataUrl).then(function (localText) {
        if (localText) {
          fe = feAplicarTextoOcrAFe(fe, pack, meta, localText);
          fe._ocrAyudaFuente = 'dispositivo';
        }
        if (!feNecesitaOcrNombres(fe, pack)) return fe;
        if (!feGetOcrAyudaConfig().nubeActiva) return fe;
        return feOcrNubeDesdeDataUrl(dataUrl).then(function (cloudText) {
          if (cloudText) {
            fe = feAplicarTextoOcrAFe(fe, pack, meta, cloudText);
            fe._ocrAyudaFuente = localText ? 'dispositivo+nube' : 'nube';
          }
          return fe;
        });
      });
    });
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

  /** Inteligencia documental — OCR por zonas, fuentes PDF, clasificación FE (con límite de tiempo). */
  var FE_INTEL_OCR_CACHE = {};
  var FE_INTEL_OCR_CACHE_MAX = 32;
  var FE_INTEL_MAX_OCR_MS = 28000;
  var FE_INTEL_BATCH_OCR_MS = 9000;
  var FE_INTEL_MIN_CONFIDENCE = 50;

  function feIntelCachePut(key, val) {
    if (!key || !val) return;
    if (FE_INTEL_OCR_CACHE[key]) delete FE_INTEL_OCR_CACHE[key];
    FE_INTEL_OCR_CACHE[key] = val;
    var keys = Object.keys(FE_INTEL_OCR_CACHE);
    while (keys.length > FE_INTEL_OCR_CACHE_MAX) {
      delete FE_INTEL_OCR_CACHE[keys.shift()];
    }
  }

  var FE_DOC_SIGNALS = [
    { re: /factura\s+electr[oó]nica\s+de\s+venta/i,                         w: 26, label: 'Título FE venta' },
    { re: /factura\s+electr[oó]nica/i,                                        w: 22, label: 'Factura electrónica' },
    { re: /\bCUFE\b/i,                                                         w: 24, label: 'Etiqueta CUFE' },
    { re: /\bCUDE\b/i,                                                         w: 22, label: 'Etiqueta CUDE' },
    { re: /c[oó]digo\s+[uú]nico\s+de\s+(?:factura|documento)/i,              w: 20, label: 'Código único FE/DIAN' },
    { re: /catalogo-vpfe|dian\.gov\.co/i,                                     w: 20, label: 'Portal DIAN' },
    { re: /documentkey=/i,                                                     w: 16, label: 'Clave DIAN' },
    { re: /PayableAmount|InvoiceTypeCode|AccountingSupplierParty/i,           w: 18, label: 'UBL/XML DIAN' },
    { re: /cbc:UUID|cbc:ID|fe:Invoice|AttachedDocument/i,                     w: 18, label: 'XML UBL namespace' },
    { re: /Representaci[oó]n\s+gr[aá]fica/i,                                  w: 14, label: 'Rep. gráfica DIAN' },
    { re: /NIT\s*(?:del\s+)?(?:emisor|proveedor|vendedor)/i,                  w: 12, label: 'NIT emisor' },
    { re: /Total\s+a\s+pagar/i,                                               w: 10, label: 'Total a pagar' },
    { re: /nota\s+(?:cr[eé]dito|d[eé]bito)\s+electr[oó]nica/i,              w: 22, label: 'Nota electrónica' },
    { re: /(?:factura|documento)\s+de\s+venta/i,                              w: 10, label: 'Doc. de venta' },
    { re: /resoluci[oó]n\s+(?:DIAN|de\s+facturaci[oó]n)/i,                  w: 14, label: 'Resolución DIAN' },
    { re: /[Nn][uú]m(?:ero)?\s*\.?\s*(?:de\s+)?[Rr]esoluci[oó]n/i,        w: 12, label: 'Número resolución' },
    { re: /autorizaci[oó]n\s+(?:de\s+)?numeraci[oó]n/i,                     w: 12, label: 'Autorización numeración' },
    { re: /numeraci[oó]n\s+(?:del\s+)?[0-9]+\s+(?:al|a)\s+[0-9]+/i,       w: 10, label: 'Rango numeración' },
    { re: /r[eé]gimen\s+(?:com[uú]n|simplificado|ordinario)/i,               w: 10, label: 'Régimen tributario' },
    { re: /responsable\s+(?:de\s+)?IVA/i,                                    w: 10, label: 'Responsable IVA' },
    { re: /no\s+responsable\s+(?:de\s+)?IVA/i,                              w: 8,  label: 'No resp. IVA' },
    { re: /gran\s+contribuyente/i,                                             w: 10, label: 'Gran contribuyente' },
    { re: /declarante\s+de\s+renta/i,                                        w: 8,  label: 'Declarante renta' },
    { re: /\bIVA\b.*?(?:19|5|0)\s*%/i,                                       w: 8,  label: 'Tasa IVA' },
    { re: /impuesto\s+sobre\s+las\s+ventas/i,                                w: 10, label: 'IVA descripción' },
    { re: /(?:subtotal|sub\s+total|valor\s+antes\s+de\s+IVA)/i,             w: 8,  label: 'Subtotal' },
    { re: /forma\s+(?:de\s+)?pago/i,                                         w: 6,  label: 'Forma de pago' },
    { re: /(?:cr[eé]dito|contado|transferencia|efectivo)\s+(?:pago|venta)/i, w: 6,  label: 'Tipo pago' },
    { re: /orden\s+(?:de\s+)?compra/i,                                       w: 6,  label: 'Orden compra' },
    { re: /(?:dirección|direcci[oó]n|tel[eé]fono|correo)\s+(?:emisor|proveedor)/i, w: 6, label: 'Contacto emisor' },
    { re: /(?:nit|c\.c\.|c\.e\.|t\.i\.)[:\s]*[0-9]{6,12}/i,               w: 10, label: 'Identificación doc' },
  ];

  var FE_LOADER_TRACK = [
    { id: 'init', label: 'Preparando documento' },
    { id: 'detect', label: 'Detección QR y CUFE' },
    { id: 'cufe', label: 'Confirmación factura electrónica' },
    { id: 'intel', label: 'Lectura inteligente (OCR)' },
    { id: 'texto', label: 'Datos del documento' },
    { id: 'dian', label: 'Consulta DIAN' },
    { id: 'cierre', label: 'Proveedor y materias primas' },
  ];

  var FE_STEP_ORDER = { init: 0, detect: 1, cufe: 2, intel: 3, texto: 4, dian: 5, cierre: 6 };

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

  function feConfirmadaElectronica(cufeResolved, qr, intelClassify) {
    if (isFacturaElectronicaDetectada(cufeResolved, qr)) return true;
    return !!(
      intelClassify &&
      intelClassify.esElectronica &&
      (intelClassify.confidence || 0) >= FE_INTEL_MIN_CONFIDENCE
    );
  }

  function feIntelMergeText(base, extra) {
    base = String(base || '');
    extra = String(extra || '');
    if (!extra.trim()) return base;
    if (!base.trim()) return extra;
    if (base.indexOf(extra.slice(0, 80)) >= 0) return base;
    return base + '\n--- ocr-intel ---\n' + extra;
  }

  function feExtractNitsFromText(text) {
    var out = [];
    var seen = {};
    text = String(text || '');
    function addNit(raw) {
      var n = normNit(raw);
      if (!n || n.length < 6) return;
      if (seen[n]) return;
      seen[n] = true;
      out.push(String(raw).replace(/\s/g, '').trim() || n);
    }
    var rePrefixed = /(?:NIT|N\.I\.T\.?|C\.?C\.?|C[eé]dula|Emisor|Proveedor|Vendedor)[:\s#.]*([0-9]{1,3}(?:\.[0-9]{3}){1,2}[-–]?\d{0,2}|[0-9]{3}\.?[0-9]{3}\.?[0-9]{3}[-–]?[0-9Kk]?)/gi;
    var m;
    while ((m = rePrefixed.exec(text))) addNit(m[1]);
    var reCedula = /\b(\d{1,2}\.\d{3}\.\d{3}-\d{1,2})\b/g;
    while ((m = reCedula.exec(text))) addNit(m[1]);
    var reFormato = /\b([0-9]{3}\.[0-9]{3}\.[0-9]{3}[-–][0-9Kk])\b/g;
    while ((m = reFormato.exec(text))) addNit(m[1]);
    var reNuda = /\b([0-9]{9,11})\b/g;
    while ((m = reNuda.exec(text))) {
      var digits = m[1];
      if (/^3\d{9}$/.test(digits)) continue;
      if (digits.length >= 9 && digits.length <= 11) addNit(digits);
    }
    return out;
  }

  function extractStructuredPdfText(docOrDataUrl, maxPages) {
    maxPages = maxPages || 3;
    return runPdfExclusive(function () {
      return openPdfDocument(docOrDataUrl).then(function (pdf) {
        var pageNums = fePdfTextExtractOrder(pdf.numPages, maxPages);
        var blocks = [];
        var fontCounts = {};
        var chain = Promise.resolve('');
        var pi;
        for (pi = 0; pi < pageNums.length; pi++) {
          (function (pageNum) {
            chain = chain.then(function (acc) {
              return pdf.getPage(pageNum).then(function (page) {
                var vp = page.getViewport({ scale: 1 });
                return page.getTextContent().then(function (tc) {
                  var pageText = '';
                  (tc.items || []).forEach(function (it) {
                    var s = it.str || '';
                    if (!s.trim()) return;
                    pageText += s + ' ';
                    var fn = String(it.fontName || 'unknown')
                      .replace(/\+/g, ' ')
                      .replace(/[^a-zA-Z0-9 _-]/g, '')
                      .trim();
                    fontCounts[fn] = (fontCounts[fn] || 0) + 1;
                    blocks.push({
                      text: s,
                      font: fn,
                      page: pageNum,
                      h: it.height || 0,
                      x: (it.transform && it.transform[4]) || 0,
                      y: (it.transform && it.transform[5]) || 0,
                      pageH: pageNum === 1 ? vp.height : 0,
                    });
                  });
                  return acc + '\n--- p' + pageNum + ' ---\n' + pageText;
                });
              });
            });
          })(pageNums[pi]);
        }
        return chain
          .then(function (text) {
            var top = Object.keys(fontCounts)
              .sort(function (a, b) {
                return fontCounts[b] - fontCounts[a];
              })
              .slice(0, 10);
            var compact = text.replace(/\s/g, '').length;
            return {
              text: text,
              blocks: blocks,
              fontStats: { counts: fontCounts, top: top },
              textLen: compact,
              blockCount: blocks.length,
              likelyScanned: compact < 80 && blocks.length < 6,
            };
          })
          .finally(function () {
            try {
              pdf.destroy();
            } catch (eD) {}
          });
      });
    });
  }

  function feIntelClassifyDocument(text, structured, cufeResolved, qr, prov) {
    text = String(text || '');
    var score = 0;
    var signals = [];
    FE_DOC_SIGNALS.forEach(function (sig) {
      if (sig.re.test(text)) {
        score += sig.w;
        signals.push(sig.label);
      }
    });
    if (cufeResolved && cufeResolved.cufeValidado) {
      score += 38;
      signals.push('CUFE válido');
    } else if (cufeResolved && cufeResolved.cufe) {
      score += 12;
      signals.push('CUFE candidato');
    }
    if (qr && (qr.cufe || qr.url)) {
      score += 14;
      signals.push('QR');
    }
    if (structured && structured.likelyScanned) {
      score += 4;
      signals.push('PDF escaneado');
    }
    if (structured && structured.fontStats && structured.fontStats.top.length) {
      var fonts = structured.fontStats.top.join(' ').toLowerCase();
      if (/arial|helvetica|times|courier|calibri|roboto/i.test(fonts)) {
        score += 6;
        signals.push('Tipografía FE habitual');
      }
    }
    var provMatch = feIntelProveedorEnTexto(prov, text);
    if (provMatch.found) {
      score += provMatch.score;
      signals.push(provMatch.label);
    }
    var confidence = Math.min(100, score);
    return {
      score: score,
      confidence: confidence,
      esElectronica: confidence >= FE_INTEL_MIN_CONFIDENCE,
      signals: signals,
      proveedorEnDoc: provMatch,
    };
  }

  function feIntelProveedorEnTexto(prov, text) {
    prov = prov || {};
    text = String(text || '').toUpperCase();
    if (!text.trim()) return { found: false, score: 0, label: '' };
    var nitP = normNit(prov.nit);
    if (nitP) {
      var nits = feExtractNitsFromText(text);
      if (nits.indexOf(nitP) >= 0) {
        return { found: true, score: 28, label: 'NIT proveedor en documento', nit: nitP };
      }
      var nitDigits = nitP.replace(/[^0-9]/g, '');
      if (nitDigits.length >= 8 && text.replace(/[^0-9]/g, '').indexOf(nitDigits) >= 0) {
        return { found: true, score: 22, label: 'NIT proveedor (parcial)', nit: nitP };
      }
    }
    var nombre = String(prov.nombre || '')
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, ' ')
      .trim();
    if (nombre.length >= 4) {
      if (text.indexOf(nombre) >= 0) {
        return { found: true, score: 24, label: 'Razón social en documento' };
      }
      var words = nombre.split(/\s+/).filter(function (w) {
        return w.length > 3;
      });
      var hit = 0;
      words.forEach(function (w) {
        if (text.indexOf(w) >= 0) hit++;
      });
      if (words.length && hit >= Math.max(2, Math.ceil(words.length * 0.55))) {
        return {
          found: true,
          score: 16,
          label: 'Nombre proveedor (' + hit + '/' + words.length + ' tokens)',
        };
      }
    }
    return { found: false, score: 0, label: '' };
  }

  function feCanvasForHandwritingOcr(sourceCanvas) {
    try {
      var ctx = sourceCanvas.getContext('2d');
      var img = ctx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
      var step1 = preprocessImageData(img, 'grayscale');
      var step2 = preprocessImageData(step1, 'gamma');
      var step3 = preprocessImageData(step2, 'contrast');
      return feCanvasFromImageData(step3);
    } catch (e) {
      return sourceCanvas;
    }
  }

  function feRunOcrProfile(T, dataUrl, profile) {
    profile = profile || {};
    var extra = Object.assign(
      {
        tessedit_pageseg_mode: profile.psm != null ? String(profile.psm) : '6',
      },
      profile.tess || {}
    );
    return feRunOcr(T, dataUrl, extra);
  }

  function feIntelOcrCropCanvas(full, region, profile) {
    if (!region || region.cw < 60 || region.ch < 40) return Promise.resolve('');
    var crop = document.createElement('canvas');
    crop.width = region.cw;
    crop.height = region.ch;
    crop
      .getContext('2d')
      .drawImage(full, region.x, region.y, region.cw, region.ch, 0, 0, region.cw, region.ch);
    var canvases =
      profile && profile.handwriting
        ? [feCanvasForHandwritingOcr(crop), feCanvasForOcr(crop)]
        : [feCanvasForOcr(crop), crop];
    var chain = Promise.resolve('');
    var ci;
    for (ci = 0; ci < canvases.length; ci++) {
      (function (canvas) {
        chain = chain.then(function (acc) {
          if (acc.length > 40) return acc;
          var dataUrl = canvas.toDataURL('image/png');
          return ensureTesseract().then(function (T) {
            return feRunOcrProfile(T, dataUrl, profile).then(function (res) {
              var t = ((res.data && res.data.text) || '').trim();
              return t.length > acc.length ? t : acc;
            });
          });
        });
      })(canvases[ci]);
    }
    return chain.catch(function () {
      return '';
    });
  }

  function feIntelOcrFromCanvas(full, opts) {
    opts = opts || {};
    var batchUi = !!(opts.batchMode || global.__cxfFeBatchMode);
    var deadline = Date.now() + (batchUi ? FE_INTEL_BATCH_OCR_MS : FE_INTEL_MAX_OCR_MS);
    var timedOut = function () {
      return Date.now() > deadline;
    };
    var w = full.width;
    var h = full.height;
    var zones = batchUi
      ? [
          {
            id: 'footer',
            x: 0,
            y: Math.floor(h * 0.58),
            cw: w,
            ch: h - Math.floor(h * 0.58),
            profile: {
              psm: 6,
              tess: { tessedit_char_whitelist: '0123456789abcdefABCDEFCUFEcufe:NIT.$, \n\r\t/-' },
            },
          },
        ]
      : [
          {
            id: 'header',
            x: 0,
            y: 0,
            cw: w,
            ch: Math.floor(h * 0.28),
            profile: { psm: 6, tess: { tessedit_char_whitelist: '' } },
          },
          {
            id: 'body',
            x: Math.floor(w * 0.02),
            y: Math.floor(h * 0.22),
            cw: Math.floor(w * 0.96),
            ch: Math.floor(h * 0.42),
            profile: { psm: 11 },
          },
          {
            id: 'footer',
            x: 0,
            y: Math.floor(h * 0.58),
            cw: w,
            ch: h - Math.floor(h * 0.58),
            profile: {
              psm: 6,
              tess: { tessedit_char_whitelist: '0123456789abcdefABCDEFCUFEcufe:NIT.$, \n\r\t/-' },
            },
          },
          {
            id: 'total-manuscrito',
            x: Math.floor(w * 0.45),
            y: Math.floor(h * 0.68),
            cw: Math.floor(w * 0.52),
            ch: Math.floor(h * 0.22),
            profile: { psm: 7, handwriting: true },
          },
        ];
    var parts = [];
    var zi;
    var chain = Promise.resolve();
    for (zi = 0; zi < zones.length; zi++) {
      (function (z) {
        chain = chain.then(function () {
          if (timedOut()) return;
          return feIntelOcrCropCanvas(full, z, z.profile).then(function (txt) {
            if (txt && txt.length > 2) parts.push('[' + z.id + ']\n' + txt);
          });
        });
      })(zones[zi]);
    }
    return chain.then(function () {
      return {
        text: parts.join('\n'),
        zones: parts.length,
        source: 'ocr-zones',
      };
    });
  }

  function feIntelOcrZones(doc, opts) {
    opts = opts || {};
    var cacheKey = doc && doc.id ? 'z_' + String(doc.id) : '';
    if (cacheKey && FE_INTEL_OCR_CACHE[cacheKey]) {
      return Promise.resolve(FE_INTEL_OCR_CACHE[cacheKey]);
    }
    var mime = String((doc && doc.mime) || '');
    var isImg = mime.indexOf('image') >= 0;
    var runP;
    if (isImg && doc.dataUrl) {
      runP = new Promise(function (resolve) {
        var img = new Image();
        img.onload = function () {
          var c = document.createElement('canvas');
          var scale = Math.min(2.2, 2200 / Math.max(img.width, img.height, 1));
          c.width = Math.ceil(img.width * scale);
          c.height = Math.ceil(img.height * scale);
          var ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0, c.width, c.height);
          feIntelOcrFromCanvas(c, opts).then(resolve, function () {
            resolve(null);
          });
        };
        img.onerror = function () {
          resolve(null);
        };
        img.src = doc.dataUrl;
      });
    } else {
      var batchUi = !!(opts.batchMode || global.__cxfFeBatchMode);
      var scale = batchUi ? 4 : 4.8;
      runP = runPdfExclusive(function () {
        return openPdfDocument(doc).then(function (pdf) {
          return pdf.getPage(1).then(function (page) {
            var vp = page.getViewport({ scale: scale });
            var full = document.createElement('canvas');
            full.width = Math.ceil(vp.width);
            full.height = Math.ceil(vp.height);
            return page
              .render({ canvasContext: full.getContext('2d'), viewport: vp })
              .promise.then(function () {
                return feIntelOcrFromCanvas(full, opts);
              });
          });
        });
      });
    }
    return runP
      .then(function (res) {
        if (cacheKey && res) feIntelCachePut(cacheKey, res);
        return res;
      })
      .catch(function (err) {
        console.warn('[FE] intel OCR', err);
        return null;
      });
  }

  function feIntelAugmentDetection(doc, pack, opts, smooth) {
    if (opts.skipIntel) return Promise.resolve(pack);
    var mergedLen = String(pack.quickText || '').replace(/\s/g, '').length;
    var resolvedNow = buildCufeResolution(pack.qr, pack.fromQuick || []);
    var batch = !!(opts.batchMode || global.__cxfFeBatchMode);
    if (
      resolvedNow.cufeValidado &&
      isFacturaElectronicaDetectada(resolvedNow, pack.qr) &&
      (mergedLen > 120 || !pack.likelyScanned)
    ) {
      pack.intelClassify = feIntelClassifyDocument(
        pack.quickText || '',
        pack.structured || null,
        resolvedNow,
        pack.qr,
        opts.proveedor
      );
      return Promise.resolve(pack);
    }
    if (batch) {
      pack.quickText = pack.quickText || '';
      pack.intelClassify = feIntelClassifyDocument(
        pack.quickText,
        null,
        resolvedNow,
        pack.qr,
        opts.proveedor
      );
      if (mergedLen > 60 || resolvedNow.cufe || (pack.fromQuick && pack.fromQuick.length)) {
        return Promise.resolve(pack);
      }
    }
    if (smooth && smooth.bump) {
      smooth.bump(57, batch ? 'Clasificando documento…' : 'Lectura inteligente del documento…');
    }
    if (typeof opts.onProgress === 'function') {
      opts.onProgress({
        pct: 57,
        label: batch ? 'Clasificando documento…' : 'Lectura inteligente (texto + OCR)…',
        stepId: 'intel',
      });
    }
    var mime = String((doc && doc.mime) || '');
    var isPdfDoc =
      mime.indexOf('pdf') >= 0 ||
      /^data:application\/pdf/i.test((doc && doc.dataUrl) || '') ||
      !!(doc && doc._pdfBlob);
    var structP = isPdfDoc
      ? extractStructuredPdfText(doc, batch ? 2 : 3)
      : Promise.resolve({
          text: pack.quickText || '',
          blocks: [],
          textLen: mergedLen,
          likelyScanned: true,
          blockCount: 0,
          fontStats: { counts: {}, top: [] },
        });
    return structP
      .catch(function () {
        return { text: pack.quickText || '', blocks: [], textLen: mergedLen, likelyScanned: !!pack.likelyScanned };
      })
      .then(function (structured) {
        pack.structured = structured;
        pack.quickText = feIntelMergeText(pack.quickText, structured.text);
        pack.fromQuick = extractAllCufeCandidates(pack.quickText).concat(pack.fromQuick || []);
        pack.intelClassify = feIntelClassifyDocument(
          pack.quickText,
          structured,
          buildCufeResolution(pack.qr, pack.fromQuick),
          pack.qr,
          opts.proveedor
        );
        var needOcr =
          !batch &&
          (pack.likelyScanned ||
            structured.likelyScanned ||
            structured.textLen < 160 ||
            !(pack.fromQuick && pack.fromQuick.length));
        if (!needOcr) return pack;
        if (smooth && smooth.bump) smooth.bump(59, 'OCR por zonas (impreso y manuscrito)…');
        return feIntelOcrZones(doc, opts).then(function (ocr) {
          if (ocr && ocr.text) {
            pack.intelOcr = ocr;
            pack.quickText = feIntelMergeText(pack.quickText, ocr.text);
            pack.fromQuick = extractAllCufeCandidates(pack.quickText).concat(pack.fromQuick || []);
            pack.intelClassify = feIntelClassifyDocument(
              pack.quickText,
              structured,
              buildCufeResolution(pack.qr, pack.fromQuick),
              pack.qr,
              opts.proveedor
            );
          }
          return pack;
        });
      })
      .catch(function () {
        return pack;
      });
  }

  function esc(s) {
    if (typeof escHtml === 'function') return escHtml(s);
    if (typeof escUserAttr === 'function') return escUserAttr(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function safeDocMediaAttr(url) {
    var u = String(url || '').trim();
    if (!u || /^javascript:/i.test(u) || /^vbscript:/i.test(u)) return '';
    if (/^(blob:|data:|https?:\/\/)/i.test(u)) {
      return typeof escHtml === 'function' ? escHtml(u) : esc(u);
    }
    return '';
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

  var _NAME_STRIP_RE = /\b(?:S\.?A\.?S\.?|S\.?A\.?|LTDA\.?|SAS|LTDA|S\.?C\.?A\.?|E\.?U\.?|S\.?C\.?S\.?|INC\.?|CORP\.?|CO\.?|DE|DEL|Y|LA|EL|LOS|LAS|UN|UNA|AND|THE|DE\s+LA|DE\s+LOS)\b/g;
  function normalizeNameForSim(s) {
    return String(s || '')
      .toUpperCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(_NAME_STRIP_RE, ' ')
      .replace(/[^A-Z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function nameSimilarity(a, b) {
    a = normalizeNameForSim(a);
    b = normalizeNameForSim(b);
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (a.indexOf(b) >= 0 || b.indexOf(a) >= 0) return 0.92;
    var aw = a.split(/\s+/).filter(function (w) { return w.length >= 3; });
    var bSet = ' ' + b + ' ';
    var hit = 0;
    aw.forEach(function (w) {
      if (bSet.indexOf(' ' + w + ' ') >= 0) hit += 1;
      else if (b.indexOf(w) >= 0 && w.length >= 5) hit += 0.6;
    });
    return aw.length ? hit / aw.length : 0;
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
          var intelHint =
            pack.intelClassify && pack.intelClassify.signals && pack.intelClassify.signals.length
              ? ' · ' + pack.intelClassify.signals.slice(0, 3).join(', ')
              : '';
          smooth.stop(
            esElectronica ? 58 : 54,
            esElectronica
              ? 'Factura electrónica confirmada' +
                (resolved.cufeValidado ? ' (QR/CUFE)' : ' (lectura documento)') +
                intelHint +
                budgetMsg
              : likelyScannedPdfHint(pack.quickText, pack.qr, resolved) + budgetMsg,
            'cufe',
            { init: true, detect: true, cufe: true, intel: !!pack.intelClassify }
          );
          return {
            esElectronica: esElectronica,
            qr: pack.qr,
            quickText: pack.quickText,
            cufeResolved: resolved,
            intelClassify: pack.intelClassify || null,
            intelOcr: pack.intelOcr || null,
            structured: pack.structured || null,
          };
        }

        function finishDetectionPass(resolved, esElectronica) {
          if (batchMode && resolved.cufeValidado) {
            pack.intelClassify = feIntelClassifyDocument(
              pack.quickText || '',
              pack.structured || null,
              resolved,
              pack.qr,
              opts.proveedor
            );
            esElectronica = feConfirmadaElectronica(resolved, pack.qr, pack.intelClassify);
            return Promise.resolve(finalizeDetect(resolved, esElectronica));
          }
          return feIntelAugmentDetection(doc, pack, opts, smooth).then(function (aug) {
            pack = aug;
            resolved = buildCufeResolution(pack.qr, pack.fromQuick);
            esElectronica = feConfirmadaElectronica(resolved, pack.qr, pack.intelClassify);
            return finalizeDetect(resolved, esElectronica);
          });
        }

        var resolved = buildCufeResolution(pack.qr, pack.fromQuick);
        var esElectronica = feConfirmadaElectronica(resolved, pack.qr, null);
        if (esElectronica && resolved.cufeValidado) return finishDetectionPass(resolved, esElectronica);
        if (batchMode && !pack.likelyScanned && esElectronica) {
          return finishDetectionPass(resolved, esElectronica);
        }
        if (!pack.likelyScanned && esElectronica) {
          return finishDetectionPass(resolved, esElectronica);
        }
        if (esElectronica && pack.qr && (pack.qr.url || pack.qr.cufe)) {
          return finishDetectionPass(resolved, esElectronica);
        }
        if (pack._batchOcrDone && !opts.forceDeepQr && resolved.cufeValidado) {
          return finishDetectionPass(resolved, esElectronica);
        }

        if (batchMode && !pack.likelyScanned && String(pack.quickText || '').replace(/\s/g, '').length > 180) {
          return finishDetectionPass(resolved, esElectronica);
        }
        smooth.bump(
          55,
          batchMode ? 'OCR en pie de página (escaneo)…' : 'Leyendo CUFE impreso (OCR)…'
        );
        return extractCufeFromScannedOcr(doc, opts)
          .then(function (ocrRes) {
            if (ocrRes && ocrRes.cufe && isValidCufeHex(ocrRes.cufe)) {
              resolved = ocrRes;
              esElectronica = isFacturaElectronicaDetectada(resolved, pack.qr);
            }
            return finishDetectionPass(resolved, esElectronica);
          })
          .catch(function () {
            return finishDetectionPass(resolved, esElectronica);
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

  function feCleanDireccion(raw) {
    raw = String(raw || '')
      .replace(/\s+/g, ' ')
      .trim();
    raw = raw.replace(
      /^(?:Direcci[oó]n(?:\s+de\s+(?:correspondencia|facturaci[oó]n|domicilio|sede))?|Dir(?:ecci[oó]n)?\.?|Domicilio(?:\s+fiscal)?|Address)[:\s]*/i,
      ''
    );
    raw = raw.replace(/\s+actividad\s+econ[oó]mica\s*:\s*\d[\d\s]*.*$/i, '').trim();
    raw = raw.replace(/\s+act\.?\s*econ[oó]mica\s*:\s*\d[\d\s]*.*$/i, '').trim();
    return raw.replace(/\s{2,}/g, ' ').trim();
  }

  function feLineLooksLikeProductLine(s) {
    s = String(s || '').trim();
    if (!s) return true;
    if (/\$|[\d]{1,3}[.,][\d]{2,}/.test(s)) return true;
    if (/^(?:descripci|producto|art[ií]culo|cantidad|vr\.?\s*unit|subtotal|total|iva)\b/i.test(s)) return true;
    return false;
  }

  function feLooksLikeColAddress(s) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    if (!s || s.length < 6 || s.length > 160) return false;
    if (feEsTextoFormaPago(s) || feIsRepresentanteGarbage(s)) return false;
    if (/^(?:total|subtotal|iva|nit|cufe|fecha|factura|cliente|comprador|adquiriente|resoluci)/i.test(s)) {
      return false;
    }
    var streetMark =
      /\b(?:CALLE|CLL?\.?|C\.|CARRERA|CRA\.|CRA\s+\d|CR\.?\s+\d|CAR\.?|CAR\s+\d|AVENIDA|AV\.?|DIAGONAL|DG\.?|TRANSVERSAL|TV\.?|TRONCAL|VARIANTE|KILOMETRO|KM\.?|BARRIO|BRR?\.?|BR\.?|MZ\.?|MANZANA|LOCAL|LOC\.?|OFICINA|OF\.?|APARTAMENTO|APTO?\.?|INTERIOR|INT\.?|SECTOR|VEREDA|VDA\.?|V[IÍ]A|URBANIZACI[ÓO]N|URB\.?|EDIFICIO|EDIF\.?|TORRE|PISO|PS\.?)\b/i;
    var numMark = /(?:#\s*[\dA-Z]+|\bN[oº°O]?\s*\.?\s*\d+|\bN[UÚ]M(?:ERO)?\.?\s*\d+|\d+\s*[-–]\s*\d+)/i;
    if (streetMark.test(s) && (numMark.test(s) || /\d{1,4}/.test(s))) return true;
    if (/\bDIRECCI[OÓ]N\b/i.test(s) && s.length > 12) return true;
    return false;
  }

  function feScoreDireccionCandidate(s) {
    s = String(s || '');
    if (!s) return -1;
    var score = 0;
    if (/\b(?:CALLE|CLL?|CARRERA|CRA?|CR|CAR)\b/i.test(s)) score += 18;
    if (/\b(?:AVENIDA|AV|DIAGONAL|DG|TRANSVERSAL|TV)\b/i.test(s)) score += 14;
    if (/#\s*[\dA-Z]/.test(s)) score += 24;
    if (/\bN[oº°O]?\s*\.?\s*\d/.test(s)) score += 16;
    if (/\d+\s*[-–]\s*\d+/.test(s)) score += 12;
    if (/\b(?:LOCAL|LOC|APTO|INT|BRR|BARRIO|OFICINA)\b/i.test(s)) score += 6;
    if (/^\d{9,}$/.test(s.replace(/[\s#.\-]/g, ''))) score -= 25;
    if (/total|subtotal|factura\s+electr|cufe|payableamount/i.test(s)) score -= 40;
    if (s.length >= 10 && s.length <= 90) score += 4;
    return score;
  }

  function feExpandAddressSlice(flat, idx, seed) {
    flat = String(flat || '');
    seed = String(seed || '').trim();
    var rest = flat.slice(idx, idx + 150);
    var m = rest.match(
      /^((?:CALLE|CLL?\.?|C\.|CARRERA|CRA?\.?|CR\.?|CAR\.?|CAR\s+|AVENIDA|AV\.?|DIAGONAL|DG\.?|TRANSVERSAL|TV\.?)[^|,]{4,110}?)(?:\s{2,}|\s+Tel|\s+NIT|\s+Ciudad|\s+Dept|,|\||$)/i
    );
    if (m && m[1]) return feCleanDireccion(m[1]);
    return feCleanDireccion(seed);
  }

  function feExtractDireccionFromText(text, opts) {
    opts = opts || {};
    text = String(text || '');
    if (!text.trim()) return '';
    var flat = text.replace(/\s+/g, ' ');
    var maxLen = opts.maxLen || 140;
    var candidates = [];

    function pushCandidate(raw, bonus) {
      var cleaned = feCleanDireccion(raw);
      if (!cleaned || cleaned.length < 6) return;
      if (!feLooksLikeColAddress(cleaned) && bonus < 20) return;
      var score = feScoreDireccionCandidate(cleaned) + (bonus || 0);
      if (score < 8) return;
      candidates.push({ text: cleaned, score: score });
    }

    var labeledPatterns = [
      /Direcci[oó]n(?:\s+de\s+(?:correspondencia|facturaci[oó]n|domicilio|sede))?[:\s]+([^|\n]{6,120}?)(?=\s{2,}|\s+Tel|\s+Cel|\s+NIT|\s+Ciudad|\||$)/i,
      /Dir(?:ecci[oó]n)?\.?[:\s]+([^|\n]{6,120}?)(?=\s{2,}|\s+Tel|\s+NIT|\||$)/i,
      /Domicilio(?:\s+fiscal)?[:\s]+([^|\n]{6,120}?)(?=\s{2,}|\s+Tel|\||$)/i,
      /Address[:\s]+([^|\n]{6,120}?)(?=\s{2,}|\s+Phone|\||$)/i,
      /StreetAddress[>\s]*([^<\n|]{6,120}?)(?:<|\||$)/i,
    ];
    for (var li = 0; li < labeledPatterns.length; li++) {
      var lm = flat.match(labeledPatterns[li]);
      if (lm && lm[1]) pushCandidate(lm[1], 28);
    }

    var anchorRe =
      /\b(?:CALLE|CLL?\.?|C\.|CARRERA|CRA?\.?|CR\.?|CAR\.?|CAR\s+|AVENIDA|AV\.?|DIAGONAL|DG\.?|TRANSVERSAL|TV\.?)\s*(?:\d+[A-Z]?|\d+\s*[A-Z])(?:\s*(?:#|N[oº°O]?\s*\.?\s*|N[UÚ]M\.?\s*)\s*[\dA-Z]+(?:\s*[-–]\s*[\dA-Z]+)?)?(?:\s*(?:,|\s+)(?:BRR?|BARRIO|BR\.?|LOCAL|LOC\.?|APTO?\.?|INT\.?)\s+[\wÁÉÍÓÚáéíóúñ.\- ]+)?/gi;
    var am;
    while ((am = anchorRe.exec(flat))) {
      pushCandidate(feExpandAddressSlice(flat, am.index, am[0]), 20);
    }

    var hashM = flat.match(
      /((?:CALLE|CLL?|CARRERA|CRA?|CR|CAR|AV|AVENIDA|DG|DIAGONAL|TV|TRANSVERSAL)[^.,|]{0,35}?(?:#\s*[\dA-Z]+(?:\s*[-–]\s*[\dA-Z]+)?)[^.,|]{0,45})/i
    );
    if (hashM) pushCandidate(hashM[1], 22);

    var lines = text.split(/\n/);
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i].replace(/\s+/g, ' ').trim();
      if (!ln || feLineLooksLikeProductLine(ln)) continue;
      if (!feLooksLikeColAddress(ln)) continue;
      pushCandidate(ln, 12);
    }

    if (!candidates.length) return '';
    candidates.sort(function (a, b) {
      return b.score - a.score;
    });
    return candidates[0].text.slice(0, maxLen);
  }

  function fePickCiudadFromText(text) {
    var flat = String(text || '').replace(/\s+/g, ' ');
    var ciudadM =
      flat.match(/(?:Ciudad|Municipio)[:\s]+([A-Za-záéíóúñ ]{3,40}?)(?=\s{2,}|\s+Tel|\s+Dept|\||$)/i) ||
      flat.match(/(?:City)[:\s]+([A-Za-záéíóúñ ]{3,40}?)(?=\s{2,}|\||$)/i);
    return ciudadM ? ciudadM[1].trim() : '';
  }

  function feRepresentanteStopword(w) {
    var x = String(w || '')
      .toLowerCase()
      .replace(/[^a-záéíóúñ]/g, '');
    if (!x) return true;
    var stops = {
      cuenta: 1,
      pago: 1,
      pagos: 1,
      banco: 1,
      bancaria: 1,
      bancario: 1,
      nombre: 1,
      razon: 1,
      razón: 1,
      social: 1,
      pesos: 1,
      peso: 1,
      mil: 1,
      millon: 1,
      millón: 1,
      mcte: 1,
      cte: 1,
      emisor: 1,
      comprador: 1,
      adquiriente: 1,
      cliente: 1,
      factura: 1,
      cuarenta: 1,
      treinta: 1,
      veinte: 1,
      cincuenta: 1,
      sesenta: 1,
      setenta: 1,
      ochenta: 1,
      noventa: 1,
      cien: 1,
      ciento: 1,
      uno: 1,
      dos: 1,
      tres: 1,
      cuatro: 1,
      cinco: 1,
      seis: 1,
      siete: 1,
      ocho: 1,
      nueve: 1,
      diez: 1,
      once: 1,
      doce: 1,
      trece: 1,
      catorce: 1,
      quince: 1,
      transferencia: 1,
      consignacion: 1,
      consignación: 1,
      nequi: 1,
      daviplata: 1,
      efectivo: 1,
      credito: 1,
      crédito: 1,
      debito: 1,
      débito: 1,
      titular: 1,
      representante: 1,
      legal: 1,
      empresa: 1,
      sociedad: 1,
      nit: 1,
      cufe: 1,
      firma: 1,
      sello: 1,
      autoriza: 1,
      tributario: 1,
      iva: 1,
      total: 1,
      valor: 1,
      son: 1,
      solo: 1,
      del: 1,
      de: 1,
      la: 1,
      el: 1,
      los: 1,
      las: 1,
      y: 1,
      o: 1,
    };
    return !!stops[x];
  }

  function feIsRepresentanteGarbage(s) {
    s = String(s || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    if (!s || s.length < 3) return true;
    var garbagePatterns = [
      /cuenta\s+de\s+pago/,
      /representante\s+cuenta/,
      /nombre\s+o\s+raz[oó]n\s+social/,
      /raz[oó]n\s+social/,
      /m\s*\/?\s*cte/,
      /\bpesos?\b/,
      /\b(mil|mill[oó]n|bill[oó]n)\b/,
      /\b(cuarenta|treinta|veinte|cincuenta|sesenta|setenta|ochenta|noventa|cien|ciento)\b/,
      /\b(uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+y\s+(uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|veinte|treinta|cuarenta|cincuenta|mil)\b/,
      /forma\s+de\s+pago/,
      /medio\s+de\s+pago/,
      /\bcuota\s+no\.?\s*\d/,
      /\bvence\s+el\s+\d{4}-\d{2}-\d{2}/,
      /^otro\s*[-–]\s*cr[eé]dito/,
      /transferencia|consignaci[oó]n|nequi|daviplata|bancolombia|\bbanco\b/,
      /tributario|gravamen|retenci|autorretenedor/,
      /firma\s+del|sello\s+del|huella/,
      /adquiriente|comprador|cliente\b/,
      /son:\s*\$/,
      /valor\s+en\s+letras/,
      /autorizaci[oó]n\s+numeraci/,
      /^nombre\s+comercial$/i,
      /^raz[oó]n\s+social$/i,
      /^nombre\s+o\s+raz[oó]n\s+social$/i,
      /^representante\s+legal$/i,
      /^nit$/i,
      /^direcci[oó]n$/i,
    ];
    for (var gi = 0; gi < garbagePatterns.length; gi++) {
      if (garbagePatterns[gi].test(s)) return true;
    }
    return false;
  }

  function feCleanRepresentanteName(raw) {
    raw = String(raw || '')
      .replace(/\s+/g, ' ')
      .trim();
    raw = raw.replace(/^(?:señor(?:a)?|sr\.?|sra\.?|don|doña)\s+/i, '');
    raw = raw.replace(/\s*(?:C\.?C\.?|N\.?I\.?T\.?|C[eé]dula|Identificaci[oó]n)[:\s#]*[\d.\s\-]+.*$/i, '');
    raw = raw.replace(/[.,;|:]+$/g, '').trim();
    return raw.slice(0, 80);
  }

  function feLooksLikePersonName(s, opts) {
    opts = opts || {};
    var allowSingle = !!opts.allowSingle;
    s = feCleanRepresentanteName(s);
    if (!s || s.length < 3 || s.length > 80) return false;
    if (feIsRepresentanteGarbage(s)) return false;
    if (
      /nit|cufe|factura|dian|total|subtotal|iva|correo|tel[eé]fono|direcci[oó]n|@|https?:|sas|ltda|s\.a\.|e\.u\.|inc\b|cia\b/i.test(
        s
      )
    ) {
      return false;
    }
    if (/\d{3,}/.test(s)) return false;
    var words = s.split(/\s+/).filter(Boolean);
    if (!words.length || words.length > 5) return false;

    var meaningful = [];
    for (var wi = 0; wi < words.length; wi++) {
      var w = words[wi];
      if (feRepresentanteStopword(w)) continue;
      if (!/^[A-ZÁÉÍÓÚÑa-záéíóúñ]{2,}([.\-'][A-ZÁÉÍÓÚÑa-záéíóúñ]+)?$/.test(w)) return false;
      meaningful.push(w);
    }
    if (!meaningful.length) return false;
    if (meaningful.length >= 2) return true;
    if (allowSingle && meaningful.length === 1) {
      return meaningful[0].length >= 4;
    }
    return false;
  }

  function feScoreRepresentanteCandidate(s, opts) {
    opts = opts || {};
    s = feCleanRepresentanteName(s);
    if (!feLooksLikePersonName(s, opts)) return -1;
    var score = 10;
    var words = s.split(/\s+/).filter(function (w) {
      return !feRepresentanteStopword(w);
    });
    if (words.length >= 2) score += 14;
    if (words.length >= 3) score += 6;
    if (words.length === 1) score += 4;
    if (words[0] && /^[A-ZÁÉÍÓÚÑ]/.test(words[0])) score += 4;
    return score;
  }

  function feSanitizeRepresentanteEmisor(val, opts) {
    opts = opts || {};
    var s = feCleanRepresentanteName(val);
    if (!s) return '';
    if (!feLooksLikePersonName(s, opts)) return '';
    return s;
  }

  function feExtractRepresentanteFromText(text, opts) {
    opts = opts || {};
    text = String(text || '');
    if (!text.trim()) return '';
    var flat = text.replace(/\s+/g, ' ');
    var lines = text.split(/\n/);
    var candidates = [];

    function pushCandidate(raw, bonus) {
      var cleaned = feCleanRepresentanteName(raw);
      var nameOpts = { allowSingle: bonus >= 22 };
      if (!feLooksLikePersonName(cleaned, nameOpts)) return;
      var score = feScoreRepresentanteCandidate(cleaned, nameOpts) + (bonus || 0);
      if (score < 12) return;
      candidates.push({ text: cleaned, score: score });
    }

    var labeledPatterns = [
      /Representante\s+legal(?:\s+de\s+la\s+empresa)?[:\s]+([A-Za-zÁÉÍÓÚáéíóúñ .'\-]{3,70}?)(?=\s{2,}|\s+Tel|\s+NIT|\s+Direcci|\s+C\.?C|\s+Ciudad|\||$)/i,
      /Rep\.?\s*Legal[:\s]+([A-Za-zÁÉÍÓÚáéíóúñ .'\-]{3,70}?)(?=\s{2,}|\s+Tel|\s+NIT|\s+C\.?C|\||$)/i,
      /R\.?\s*L\.?[:\s]+([A-Za-zÁÉÍÓÚáéíóúñ .'\-]{3,70}?)(?=\s{2,}|\s+Tel|\s+NIT|\||$)/i,
      /Nombre\s+del\s+representante\s+legal[:\s]+([A-Za-zÁÉÍÓÚáéíóúñ .'\-]{3,70}?)(?=\s{2,}|\||$)/i,
      /Gerente\s+general[:\s]+([A-Za-zÁÉÍÓÚáéíóúñ .'\-]{3,70}?)(?=\s{2,}|\s+Tel|\s+NIT|\||$)/i,
    ];
    for (var li = 0; li < labeledPatterns.length; li++) {
      var lm = flat.match(labeledPatterns[li]);
      if (lm && lm[1]) pushCandidate(lm[1], 30);
    }

    var labelLineRe =
      /^(?:Representante\s+legal|Rep\.?\s*Legal|R\.?\s*L\.?|Nombre\s+del\s+representante\s+legal|Gerente\s+general)\b/i;
    for (var i = 0; i < lines.length; i++) {
      var ln = String(lines[i] || '').replace(/\s+/g, ' ').trim();
      if (!ln || !labelLineRe.test(ln)) continue;
      if (/cuenta\s+de\s+pago|nombre\s+o\s+raz[oó]n\s+social/i.test(ln)) continue;
      var afterColon = ln.replace(/^[^:]{3,55}:\s*/, '').trim();
      if (afterColon && afterColon !== ln) pushCandidate(afterColon, 26);
      else if (lines[i + 1]) {
        var nextLn = String(lines[i + 1]).replace(/\s+/g, ' ').trim();
        if (nextLn && !feIsRepresentanteGarbage(nextLn)) pushCandidate(nextLn, 22);
      }
    }

    if (!candidates.length) return '';
    candidates.sort(function (a, b) {
      return b.score - a.score;
    });
    return feSanitizeRepresentanteEmisor(candidates[0].text, { allowSingle: true });
  }

  function feCleanNombreCampo(s) {
    return String(s || '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[.,;|:]+$/g, '')
      .slice(0, 90);
  }

  function feCleanRazonSocialEmisor(s) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    var m = s.match(/^(.+?)\s+nombre\s+comercial\s*:\s*(.+)$/i);
    if (m) {
      var a = m[1].trim();
      var b = m[2].trim();
      if (!b || feNormNombreCmp(a) === feNormNombreCmp(b)) s = a;
      else s = a;
    }
    s = s.replace(/\s*nombre\s+comercial\s*:\s*[^|]+$/i, '').trim();
    s = s.replace(/\s*nombre\s+comercial\s*:\s*/gi, ' ').trim();
    return feCleanNombreCampo(s);
  }

  function feEsSoloEtiquetaCampo(s) {
    s = String(s || '')
      .trim()
      .toLowerCase()
      .replace(/[.:]+$/g, '');
    return /^(nombre\s+comercial|raz[oó]n\s+social|nombre\s+o\s+raz[oó]n\s+social|representante\s+legal|nit|direcci[oó]n|tel[eé]fono|correo|e-?mail|m[oó]vil)$/.test(
      s
    );
  }

  function feExtractCompradorNombre(compradorText, fe) {
    fe = fe || {};
    compradorText = String(compradorText || '');
    if (fe.nombreReceptor && !feEsSoloEtiquetaCampo(fe.nombreReceptor)) {
      var nr = feCleanNombreCampo(fe.nombreReceptor);
      if (nr && !feEsSoloEtiquetaCampo(nr)) return nr;
    }
    var lines = compradorText.split(/\n/);
    var labelRe = /nombre\s+o\s+raz[oó]n\s+social|adquiriente|comprador/i;
    for (var i = 0; i < lines.length; i++) {
      var ln = String(lines[i] || '').replace(/\s+/g, ' ').trim();
      if (!ln || !labelRe.test(ln)) continue;
      if (/^nombre\s+o\s+raz[oó]n\s+social\s*$/i.test(ln)) {
        if (lines[i + 1]) {
          var nxt = feCleanNombreCampo(lines[i + 1]);
          if (nxt && !feEsSoloEtiquetaCampo(nxt)) return nxt;
        }
        continue;
      }
      var val = feExtractValorTrasEtiqueta(ln, labelRe);
      if (val && !feEsSoloEtiquetaCampo(val)) return val;
      if (lines[i + 1]) {
        var nxt2 = feCleanNombreCampo(lines[i + 1]);
        if (
          nxt2 &&
          !feEsSoloEtiquetaCampo(nxt2) &&
          !/^(?:nit|n[uú]mero|documento|tel|direcci)/i.test(nxt2)
        ) {
          return nxt2;
        }
      }
    }
    var mCom = compradorText.match(
      /(?:nombre\s+o\s+raz[oó]n\s+social)[:\s]+([^\n]{4,80}?)(?:\s+nit|\s+n[uú]mero|\s+documento|\||$)/i
    );
    if (mCom && mCom[1] && !feEsSoloEtiquetaCampo(mCom[1].trim())) return feCleanNombreCampo(mCom[1]);
    var mCli = compradorText.match(
      /cliente\s*:\s*([^\n]{4,90}?)(?:\s+nit|\s+tel[eé]fono|\s+direcci|\s+correo|\||$)/i
    );
    if (mCli && mCli[1] && !feEsSoloEtiquetaCampo(mCli[1].trim())) {
      var cliNom = feCleanNombreCampo(mCli[1]);
      if (cliNom && !/declara\s+haber\s+recibido/i.test(cliNom)) return cliNom;
    }
    return '';
  }

  function feCompradorZoneText(text) {
    text = String(text || '');
    var splitRe =
      /\b(?:ADQUIRIENTE|COMPRADOR|CLIENTE|DESTINATARIO|FACTURAR\s+A|DATOS\s+DEL\s+(?:CLIENTE|COMPRADOR|ADQUIRIENTE)|INFORMACI[ÓO]N\s+DEL\s+COMPRADOR|NOMBRE\s+DEL\s+CLIENTE)\b/i;
    var idx = text.search(splitRe);
    if (idx > 40) return text.slice(idx);
    return '';
  }

  function feValorApareceEnTexto(val, zoneText) {
    if (!val || !zoneText) return false;
    var v = String(val).replace(/\s+/g, ' ').trim();
    if (!v) return false;
    if (/^\d+$/.test(v.replace(/\D/g, ''))) {
      return zoneText.replace(/\D/g, '').indexOf(v.replace(/\D/g, '')) >= 0;
    }
    return zoneText.toUpperCase().indexOf(v.toUpperCase()) >= 0;
  }

  function feLooksLikeTelefonoColombia(val) {
    var d = String(val || '').replace(/\D/g, '');
    if (!d || d.length < 7) return false;
    if (/^3\d{9}$/.test(d)) return true;
    if (/^60[1-8]\d{7}$/.test(d)) return true;
    if (/^1\d{9}$/.test(d) && d.length === 10) return false;
    if (d.length === 10 && !/^3/.test(d)) return false;
    return d.length >= 7 && d.length <= 11 && /^3/.test(d);
  }

  function feNitCoincideTelefono(nitVal, telefonos, nitMeta) {
    nitMeta = nitMeta || {};
    if (nitMeta.fuente === 'nit-emisor-etiqueta' || nitMeta.fuente === 'etiqueta-nit') {
      return false;
    }
    var n = String(nitVal || '').replace(/\D/g, '');
    if (!n || n.length < 8) return false;
    if (/^3\d{9}$/.test(n) && feLooksLikeTelefonoColombia(n)) return true;
    var list = telefonos || [];
    for (var i = 0; i < list.length; i++) {
      var tRaw = (list[i] && list[i].valor) || list[i] || '';
      var t = String(tRaw).replace(/\D/g, '');
      if (!t || t.length < 7) continue;
      if (!feLooksLikeTelefonoColombia(tRaw)) continue;
      if (n === t) return true;
    }
    return false;
  }

  function feEsDireccionGenerica(s) {
    s = String(s || '')
      .trim()
      .toLowerCase();
    return /^calle\s+0+\b/.test(s) || /^calle\s+000/.test(s) || /^n\.?\/?\s*a\.?$/.test(s) || s === 's/n';
  }

  function feEsTextoFormaPago(s) {
    s = String(s || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    if (!s || s.length < 8) return false;
    return (
      /\b(?:forma\s+de\s+pago|medio\s+de\s+pago|cuenta\s+de\s+pago)\b/i.test(s) ||
      /\b(?:otro|cr[eé]dito|d[eé]bito|contado|transferencia|consignaci[oó]n)\b.*\b(?:cuota|vence)\b/i.test(s) ||
      /\bcuota\s+no\.?\s*\d+/i.test(s) ||
      /\bvence\s+el\s+\d{4}-\d{2}-\d{2}\b/i.test(s) ||
      /^otro\s*[-–]\s*cr[eé]dito/i.test(s)
    );
  }

  function feExtractNitEmisorEtiquetado(text) {
    text = String(text || '');
    var patterns = [
      /Nit\s+del\s+Emisor[:\s#]*([0-9.\-\s]{5,16})/i,
      /N\.?I\.?T\.?\s*(?:del\s+)?(?:Emisor|Vendedor|Proveedor)[:\s#]*([0-9.\-\s]{5,16})/i,
      /Emisor\s*\/\s*Vendedor[^0-9]{0,80}?Nit[:\s#]*([0-9.\-\s]{5,16})/i,
    ];
    for (var pi = 0; pi < patterns.length; pi++) {
      var m = text.match(patterns[pi]);
      if (m && m[1]) {
        var raw = m[1].replace(/\s/g, '').trim();
        var n = normNit(raw);
        if (n.length >= 6 && n.length <= 11) return raw;
      }
    }
    return '';
  }

  function feLooksLikeEmpresaNombre(s) {
    s = feCleanNombreCampo(s);
    if (!s || s.length < 3) return false;
    if (feIsRepresentanteGarbage(s)) return false;
    if (/S\.?A\.?S|LTDA|S\.?A\.|E\.U\.|INC\b|CIA\b|&/i.test(s)) return true;
    if (feLooksLikePersonName(s, { allowSingle: false })) return false;
    if (/^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9\s.&\-]{2,}$/.test(s) && s.split(/\s+/).length <= 8) return true;
    return s.length >= 5 && !feLooksLikePersonName(s, { allowSingle: true });
  }

  function feMergeBlocksToLines(blocks, pageNum) {
    pageNum = pageNum || 1;
    var items = [];
    for (var bi = 0; bi < (blocks || []).length; bi++) {
      var b = blocks[bi];
      if (b.page !== pageNum) continue;
      var t = String(b.text || '').trim();
      if (!t) continue;
      items.push({
        text: t,
        x: b.x || 0,
        y: b.y || 0,
        pageH: b.pageH || 0,
      });
    }
    if (!items.length) return [];

    items.sort(function (a, b) {
      var dy = b.y - a.y;
      if (Math.abs(dy) > 5) return dy > 0 ? 1 : -1;
      return a.x - b.x;
    });

    var lines = [];
    var cur = null;
    for (var ii = 0; ii < items.length; ii++) {
      var it = items[ii];
      if (!cur || Math.abs(it.y - cur.y) > 6) {
        if (cur) lines.push(cur);
        cur = { y: it.y, parts: [it.text], pageH: it.pageH };
      } else {
        cur.parts.push(it.text);
      }
    }
    if (cur) lines.push(cur);

    return lines.map(function (ln) {
      return {
        y: ln.y,
        pageH: ln.pageH,
        text: ln.parts.join(' ').replace(/\s+/g, ' ').trim(),
      };
    });
  }

  function feExtractValorTrasEtiqueta(lineText, labelRe) {
    lineText = String(lineText || '').replace(/\s+/g, ' ').trim();
    if (!lineText || !labelRe.test(lineText)) return '';

    var colonVal = lineText.replace(/^[^:]{2,72}:\s*/, '').trim();
    if (colonVal !== lineText && colonVal.length >= 2 && !labelRe.test(colonVal)) {
      return feCleanNombreCampo(colonVal);
    }

    var m = lineText.match(labelRe);
    if (m) {
      var rest = lineText.slice(m.index + m[0].length).replace(/^[\s:.\-–]+/, '').trim();
      if (rest.length >= 2 && !labelRe.test(rest)) return feCleanNombreCampo(rest);
    }
    return '';
  }

  function feComprenderNombresDesdeLineas(lines) {
    lines = lines || [];
    var out = { razonSocial: '', representanteEmisor: '' };
    var labelRazon =
      /nombre\s+o\s+raz[oó]n\s+social|raz[oó]n\s+social(?:\s+del\s+(?:emisor|vendedor|proveedor))?|nombre\s+comercial(?:\s+del\s+emisor)?/i;
    var labelRep = /representante\s+legal|rep\.?\s*legal|r\.?\s*l\.?/i;
    var labelGer = /gerente\s+general/i;

    for (var i = 0; i < lines.length; i++) {
      var ln = String(lines[i].text || '').replace(/\s+/g, ' ').trim();
      if (!ln) continue;
      if (/adquiriente|comprador|cliente\b|destinatario|facturar\s+a/i.test(ln) && !labelRep.test(ln)) continue;
      if (/cuenta\s+de\s+pago|medio\s+de\s+pago|forma\s+de\s+pago/i.test(ln)) continue;

      if (labelRazon.test(ln)) {
        var emp = feExtractValorTrasEtiqueta(ln, labelRazon);
        if (!emp && i + 1 < lines.length) {
          var nxt = String(lines[i + 1].text || '').trim();
          if (
            nxt &&
            !labelRazon.test(nxt) &&
            !labelRep.test(nxt) &&
            !/^(?:nit|tel|direcci|ciudad|departamento|email|dv)\b/i.test(nxt)
          ) {
            emp = feCleanNombreCampo(nxt);
          }
        }
        if (
          emp &&
          (feLooksLikeEmpresaNombre(emp) || feLooksLikePersonName(emp, { allowSingle: false })) &&
          !out.razonSocial
        ) {
          out.razonSocial = emp;
        }
      }

      if (labelRep.test(ln) || labelGer.test(ln)) {
        if (/nombre\s+o\s+raz[oó]n\s+social/i.test(ln)) continue;
        var repRe = labelRep.test(ln) ? labelRep : labelGer;
        var rep = feExtractValorTrasEtiqueta(ln, repRe);
        if (!rep && i + 1 < lines.length) {
          var nxtRep = String(lines[i + 1].text || '').trim();
          if (
            nxtRep &&
            !labelRazon.test(nxtRep) &&
            !labelRep.test(nxtRep) &&
            !/^(?:nit|tel|direcci|ciudad|departamento|email|dv)\b/i.test(nxtRep)
          ) {
            rep = feCleanNombreCampo(nxtRep);
          }
        }
        rep = feSanitizeRepresentanteEmisor(rep, { allowSingle: true });
        if (rep && !out.representanteEmisor) out.representanteEmisor = rep;
      }
    }
    return out;
  }

  /** Paso final: entender nombres emisor/representante desde líneas PDF + texto. */
  function feComprenderNombresEnFactura(fe, pack, meta, extraText) {
    fe = fe || {};
    pack = pack || {};
    meta = meta || {};
    if (
      fe.representanteEmisor &&
      !feSanitizeRepresentanteEmisor(fe.representanteEmisor, { allowSingle: true })
    ) {
      fe.representanteEmisor = '';
    }
    var text = String(pack.text || '') + '\n' + String(extraText || '');
    var pageH = 0;
    (pack.blocks || []).some(function (b) {
      if (b.pageH) {
        pageH = b.pageH;
        return true;
      }
      return false;
    });

    var blockLines = feMergeBlocksToLines(pack.blocks || [], 1);
    var emisorLines = pageH
      ? blockLines.filter(function (l) {
          return l.y >= pageH * 0.28;
        })
      : blockLines;

    var parsed = feComprenderNombresDesdeLineas(emisorLines);
    if (parsed.razonSocial && !feEsDatoComprador(parsed.razonSocial, fe)) {
      if (
        !fe._razonSocialFromEncabezado &&
        !fe._razonSocialFromTraining &&
        (!fe.razonSocial || feIsRepresentanteGarbage(fe.razonSocial))
      ) {
        fe.razonSocial = parsed.razonSocial;
        fe._razonSocialExplicit = true;
        fe._razonSocialFromBlocks = true;
      }
    }

    if (!fe.representanteEmisor && parsed.representanteEmisor) {
      fe.representanteEmisor = parsed.representanteEmisor;
      fe._representanteFromBlocks = true;
    }

    if (!fe.representanteEmisor) {
      var repTxt =
        feExtractRepresentanteFromText(feEmisorZoneText(text)) ||
        feBlocksEmisorRepresentante(pack.blocks || []);
      if (repTxt) {
        fe.representanteEmisor = repTxt;
        fe._representanteFromBlocks = true;
      }
    }

    if (!fe.razonSocial) {
      var blockEmp = feBlocksEmisorNombre(pack.blocks || []);
      if (
        blockEmp &&
        (feLooksLikeEmpresaNombre(blockEmp) ||
          feLooksLikePersonName(blockEmp, { allowSingle: false }) ||
          blockEmp.length >= 8)
      ) {
        fe.razonSocial = feCleanRazonSocialEmisor(blockEmp);
        fe._razonSocialFromBlocks = true;
      }
    }

    if (!fe.razonSocial && meta.nombreArchivo) {
      var fromFile = feRazonSocialFromFilename(meta.nombreArchivo);
      if (
        fromFile &&
        (feLooksLikeEmpresaNombre(fromFile) ||
          feLooksLikePersonName(fromFile, { allowSingle: false }) ||
          fromFile.length >= 6)
      ) {
        fe.razonSocial = fromFile.toUpperCase();
        fe._razonSocialFromFilename = true;
      }
    }

    if (fe.representanteEmisor) {
      fe.representanteEmisor = feSanitizeRepresentanteEmisor(fe.representanteEmisor, {
        allowSingle: !!fe._representanteFromBlocks,
      });
      if (!fe.representanteEmisor) delete fe._representanteFromBlocks;
    }

    if (fe.razonSocial && fe.representanteEmisor) {
      if (!feNombresDifieren(fe.razonSocial, fe.representanteEmisor)) {
        if (
          feLooksLikeEmpresaNombre(fe.razonSocial) &&
          feLooksLikePersonName(fe.representanteEmisor, { allowSingle: true })
        ) {
          /* empresa + persona: correcto */
        } else if (feLooksLikePersonName(fe.razonSocial, { allowSingle: true })) {
          fe.representanteEmisor = '';
        }
      }
    }

    return fe;
  }

  function feNecesitaOcrNombres(fe, pack) {
    fe = fe || {};
    pack = pack || {};
    var text = String(pack.text || '');
    if (pack.likelyScanned || (pack.textLen || 0) < 120) return true;
    if (!fe.razonSocial && /nombre\s+o\s+raz[oó]n\s+social|raz[oó]n\s+social/i.test(text)) return true;
    if (!fe.representanteEmisor && /representante\s+legal|rep\.?\s*legal/i.test(text)) return true;
    if (
      fe.representanteEmisor &&
      !feSanitizeRepresentanteEmisor(fe.representanteEmisor, { allowSingle: true })
    ) {
      return true;
    }
    if (!fe.razonSocial && !fe.representanteEmisor && (pack.textLen || 0) < 600) return true;
    return false;
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
      subtotal: 0,
      totalIva: 0,
      totalDescuentos: 0,
      fecha: '',
      fechaVencimiento: '',
      formaPago: '',
      ordenCompra: '',
      resolucionDian: '',
      rangoDesde: '',
      rangoHasta: '',
      regimen: '',
      nitReceptor: '',
      nombreReceptor: '',
      telefonoEmisor: '',
      emailEmisor: '',
      direccionEmisor: '',
      ciudadEmisor: '',
      departamentoEmisor: '',
      nombreComercialEmisor: '',
      representanteEmisor: '',
      notas: '',
      tipoDocumento: '',
      lineas: [],
      rawExcerpt: text.slice(0, 2000),
    };

    /* ── Tipo de documento ── */
    if (/nota\s+cr[e\u00e9]dito\s+electr[o\u00f3]nica/i.test(flat)) out.tipoDocumento = 'nota-credito';
    else if (/nota\s+d[e\u00e9]bito\s+electr[o\u00f3]nica/i.test(flat)) out.tipoDocumento = 'nota-debito';
    else if (/factura\s+electr[o\u00f3]nica/i.test(flat)) out.tipoDocumento = 'factura-electronica';
    else if (/factura\s+de\s+venta/i.test(flat)) out.tipoDocumento = 'factura-venta';
    else if (/factura/i.test(flat)) out.tipoDocumento = 'factura';

    /* ── NIT emisor ── */
    var nitM =
      flat.match(/\b(\d{1,2}\.\d{3}\.\d{3}-\d{1,2})\b/) ||
      flat.match(/\b(\d{3}\.\d{3}\.\d{3}-\d{1,2})\b/) ||
      flat.match(/NIT[:\s#.]*([0-9]{1,3}(?:\.[0-9]{3}){1,2}[-\u2013]?\d{0,2})/i) ||
      flat.match(/NIT[:\s#.]*([0-9]{3}\.?[0-9]{3}\.?[0-9]{3}[-\u2013]?[0-9Kk])/i) ||
      flat.match(/(?:Emisor|Proveedor|Vendedor)[^0-9]{0,30}([0-9]{3}\.?[0-9]{3}\.?[0-9]{3}[-\u2013]?[0-9Kk]?)/i) ||
      flat.match(/([0-9]{3}\.[0-9]{3}\.[0-9]{3}[-\u2013][0-9Kk])/);
    if (nitM) out.nitEmisor = nitM[1].replace(/[\s]/g, '');
    if (!out.nitEmisor) {
      var nits = feExtractNitsFromText(text);
      if (nits.length) out.nitEmisor = nits[0];
    }

    /* ── Razón social emisor ── */
    var rsM =
      flat.match(/Raz[o\u00f3]n\s+social[:\s]*([^|\n]{4,80}?)(?:\s{2,}|\s+NIT|\s+DV|\s+CUFE|$)/i) ||
      flat.match(/Nombre\s+(?:o\s+)?raz[o\u00f3]n\s+social[:\s]*([^|\n]{4,80}?)(?:\s{2,}|\s+NIT|\s+DV|$)/i) ||
      flat.match(/Emisor[:\s]+([A-Z\u00c1\u00c9\u00cd\u00d3\u00da\u00d1][A-Za-z\u00e1\u00e9\u00ed\u00f3\u00fa\u00f10-9 .,&\-]{4,70}?)(?:\s{2,}|\s+NIT|\s+CUFE|$)/i) ||
      flat.match(/Raz[o\u00f3]n\s+[Ss]ocial\s+del\s+[Vv]endedor[:\s]*([^|\n]{4,80}?)(?:\s{2,}|$)/i);
    if (rsM) {
      out.razonSocial = rsM[1].trim().replace(/\s{2,}/g, ' ');
      out._razonSocialExplicit = true;
    }

    /* ── Número de factura ── */
    var feM =
      flat.match(/(?:Factura\s+electr[o\u00f3]nica|N[u\u00fa]mero\s+de\s+factura)[:\s#]*([A-Z]{0,8}[-\s]?[0-9]{3,14})/i) ||
      flat.match(/(?:Factura\s+de\s+venta|Factura)[:\s#\-]*([A-Z]{1,6}[-\s]?[0-9]{3,14})/i) ||
      flat.match(/(?:FEV|FETV|FCV|FCEV)[:\s#]*([A-Z]{0,6}[-\s]?[0-9]{3,14})/i) ||
      flat.match(/Prefijo\s+[:\s]*([A-Z]{1,6})\s*[Nn][u\u00fa]m(?:ero)?[:\s]*([0-9]{3,14})/i) ||
      flat.match(/N[u\u00fa]mero[:\s#]*([A-Z]{1,6}[-]?[0-9]{4,12})/i) ||
      flat.match(/\b([A-Z]{2,6}[-]?[0-9]{3,12})\b/);
    if (feM) {
      out.numeroFactura = feM[2]
        ? (feM[1] + feM[2]).replace(/\s/g, '')
        : feM[1].replace(/\s/g, '');
    }

    /* ── Totales ── */
    var totM =
      flat.match(/Total\s+a\s+pagar[:\s]*\$?\s*([\d.,]+)/i) ||
      flat.match(/PayableAmount[>\s]*([0-9.,]+)/i) ||
      flat.match(/Total\s+(?:factura|neto|bruto|general|documento)[:\s]*\$?\s*([\d.,]+)/i) ||
      flat.match(/Valor\s+total[:\s]*\$?\s*([\d.,]+)/i) ||
      flat.match(/Gran\s+total[:\s]*\$?\s*([\d.,]+)/i) ||
      flat.match(/TOTAL\s*\$?\s*([\d.,]+)/i);
    if (totM) out.total = parseCopAmount(totM[1]);

    var subM =
      flat.match(/[Ss]ubtotal[:\s]*\$?\s*([\d.,]+)/i) ||
      flat.match(/[Ss]ub[\s\-][Tt]otal[:\s]*\$?\s*([\d.,]+)/i) ||
      flat.match(/Valor\s+antes\s+de\s+IVA[:\s]*\$?\s*([\d.,]+)/i) ||
      flat.match(/TaxableAmount[>\s]*([0-9.,]+)/i);
    if (subM) out.subtotal = parseCopAmount(subM[1]);

    var ivaM =
      flat.match(/Total\s+(?:IVA|impuesto)[:\s]*\$?\s*([\d.,]+)/i) ||
      flat.match(/IVA[:\s]*\$?\s*([\d.,]+)/i) ||
      flat.match(/TaxAmount[>\s]*([0-9.,]+)/i) ||
      flat.match(/Impuesto\s+(?:IVA|sobre\s+las\s+ventas)[:\s]*\$?\s*([\d.,]+)/i);
    if (ivaM) out.totalIva = parseCopAmount(ivaM[1]);

    var descM =
      flat.match(/[Dd]escuento[s]?[:\s]*\$?\s*([\d.,]+)/i) ||
      flat.match(/Total\s+descuento[s]?[:\s]*\$?\s*([\d.,]+)/i) ||
      flat.match(/AllowanceTotalAmount[>\s]*([0-9.,]+)/i);
    if (descM) out.totalDescuentos = parseCopAmount(descM[1]);

    /* ── Fecha ── */
    var fechaM =
      flat.match(/Fecha\s+(?:de\s+)?(?:emisi[o\u00f3]n|expedici[o\u00f3]n|factura)[:\s]*([0-9]{4}[-/][0-9]{2}[-/][0-9]{2})/i) ||
      flat.match(/Fecha\s+(?:de\s+)?(?:emisi[o\u00f3]n|expedici[o\u00f3]n|factura)[:\s]*([0-9]{2}[-/][0-9]{2}[-/][0-9]{4})/i) ||
      flat.match(/IssueDate[:\s>]*([0-9]{4}[-/][0-9]{2}[-/][0-9]{2})/i) ||
      flat.match(/([0-9]{4}[-][0-9]{2}[-][0-9]{2})/);
    if (fechaM) {
      var fStr = fechaM[1];
      if (/^\d{2}[-\/]\d{2}[-\/]\d{4}$/.test(fStr)) {
        var fp = fStr.split(/[-\/]/);
        fStr = fp[2] + '-' + fp[1] + '-' + fp[0];
      }
      out.fecha = fStr;
    }

    var fvencM =
      flat.match(/Fecha\s+(?:de\s+)?vencimiento[:\s]*([0-9]{4}[-/][0-9]{2}[-/][0-9]{2})/i) ||
      flat.match(/DueDate[:\s>]*([0-9]{4}[-/][0-9]{2}[-/][0-9]{2})/i);
    if (fvencM) out.fechaVencimiento = fvencM[1];

    /* ── Resolución DIAN ── */
    var resM =
      flat.match(/Resoluci[o\u00f3]n[:\s#]*(?:No\.?\s*)?([0-9]{5,20})/i) ||
      flat.match(/N[u\u00fa]m(?:ero)?\s+resoluci[o\u00f3]n[:\s#]*([0-9]{5,20})/i);
    if (resM) out.resolucionDian = resM[1].trim();

    var rangoM = flat.match(/(?:del|desde|rango)[:\s]*([0-9]+)\s+(?:al|hasta|a)\s+([0-9]+)/i);
    if (rangoM) { out.rangoDesde = rangoM[1]; out.rangoHasta = rangoM[2]; }

    /* ── Forma de pago ── */
    var fpM =
      flat.match(/Forma\s+(?:de\s+)?pago[:\s]*([^\n,|]{4,40}?)(?:\s{2,}|\s+\$|\||$)/i) ||
      flat.match(/PaymentMeansCode[:\s>]*([A-Z0-9]{1,10})/i);
    if (fpM) out.formaPago = fpM[1].trim();

    /* ── Orden de compra ── */
    var ocM = flat.match(/[Oo]rden\s+(?:de\s+)?[Cc]ompra[:\s#]*([A-Z0-9\-]{3,30})/i);
    if (ocM) out.ordenCompra = ocM[1].trim();

    /* ── Régimen ── */
    var regM = flat.match(/r[e\u00e9]gimen\s+(com[u\u00fa]n|simplificado|ordinario|especial)/i);
    if (regM) out.regimen = regM[1].trim();

    /* ── Datos receptor/comprador ── */
    var nitRec =
      flat.match(/(?:Adquiriente|Comprador|Cliente|Receptor)[^0-9]{0,30}([0-9]{3}\.?[0-9]{3}\.?[0-9]{3}[-\u2013]?[0-9Kk]?)/i) ||
      flat.match(/NIT\s+(?:del\s+)?(?:[Cc]omprador|[Aa]dquiriente|[Cc]liente)[:\s]*([0-9]{3}\.?[0-9]{3}\.?[0-9]{3}[-\u2013]?[0-9Kk]?)/i);
    if (nitRec) out.nitReceptor = nitRec[1].replace(/[\s.]/g, '');

    var nomRec =
      flat.match(/(?:Adquiriente|Comprador|Cliente)[:\s]+([A-Z\u00c1\u00c9\u00cd\u00d3\u00da\u00d1][A-Za-z\u00e1\u00e9\u00ed\u00f3\u00fa\u00f1 .,&\-]{4,70}?)(?:\s{2,}|\s+NIT|$)/i);
    if (nomRec) out.nombreReceptor = nomRec[1].trim().replace(/\s{2,}/g, ' ');

    /* ── Contacto emisor ── */
    var telM = flat.match(/Tel[e\u00e9]fono[:\s]*([+\s0-9()-]{7,20})/i);
    if (telM) out.telefonoEmisor = telM[1].trim();

    var emailM = flat.match(/([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/);
    if (emailM) out.emailEmisor = emailM[1];

    out.direccionEmisor = feExtractDireccionFromText(text);

    var ciudadM = flat.match(/(?:Ciudad|Municipio)[:\s]*([A-Za-z\u00e1\u00e9\u00ed\u00f3\u00fa\u00f1 ]{3,40}?)(?:\s{2,}|\s+Tel|\||$)/i);
    if (ciudadM) out.ciudadEmisor = ciudadM[1].trim();
    if (!out.ciudadEmisor) out.ciudadEmisor = fePickCiudadFromText(text);

    var deptoM = flat.match(/Departamento[:\s]*([A-Za-z\u00e1\u00e9\u00ed\u00f3\u00fa\u00f1 ]{3,35}?)(?:\s{2,}|\s+Ciudad|\||$)/i);
    if (deptoM) out.departamentoEmisor = deptoM[1].trim();

    var ncM =
      flat.match(/Nombre\s+comercial[:\s]*([^|\n]{4,80}?)(?:\s{2,}|\s+NIT|\s+Tel|$)/i) ||
      flat.match(/Establecimiento[:\s]*([^|\n]{4,80}?)(?:\s{2,}|$)/i);
    if (ncM) out.nombreComercialEmisor = ncM[1].trim().replace(/\s{2,}/g, ' ');

    /* ── Notas ── */
    var notasM = flat.match(/(?:[Oo]bservaci[o\u00f3]n(?:es)?|[Nn]otas?)[:\s]*([^\n]{5,200})/i);
    if (notasM) out.notas = notasM[1].trim().slice(0, 200);

    /* ── Líneas de producto ── */
    var lines = text.split(/\n/);
    var inLineas = false;
    lines.forEach(function (ln) {
      if (/(?:descripci[o\u00f3]n|producto|art[i\u00ed]culo|concepto|detalle)\s+(?:cant|cantidad|unidad|vr\.?\s*unit)/i.test(ln)) {
        inLineas = true;
        return;
      }
      if (/(?:subtotal|sub[\s-]total|total\s+a\s+pagar|base\s+gravable|gran\s+total)/i.test(ln)) {
        inLineas = false;
      }
      var row4 = ln.match(/^(.{3,70}?)\s+([\d.,]+)\s+\$?\s*([\d.,]+)\s+\$?\s*([\d.,]+)\s*$/);
      if (row4 && !/total|subtotal|iva|cufe|descuento|impuesto|tax/i.test(row4[1])) {
        var qty = parseCopAmount(row4[2]);
        var vunit = parseCopAmount(row4[3]);
        var vtot = parseCopAmount(row4[4]);
        if (qty > 0 && (vunit > 0 || vtot > 0)) {
          out.lineas.push({
            descripcion: row4[1].trim(),
            cantidad: qty,
            valorUnitario: vunit,
            valor: vtot || Math.round(qty * vunit),
          });
          return;
        }
      }
      var row3 = ln.match(/^(.{3,70}?)\s+([\d.,]+)\s+([\d.,]+)\s*$/);
      if (row3 && !/total|subtotal|iva|cufe|descuento|impuesto|tax|base/i.test(row3[1])) {
        var q3 = parseCopAmount(row3[2]);
        var v3 = parseCopAmount(row3[3]);
        if (q3 > 0 && v3 > 0) {
          out.lineas.push({ descripcion: row3[1].trim(), cantidad: q3, valor: v3 });
        }
      }
    });

    /* ── Fallback descripción ── */
    if (!out.lineas.length) {
      var descRe = /(?:Descripci[o\u00f3]n|Description)[:\s]*([^\n]{4,120})/gi;
      var m;
      while ((m = descRe.exec(text)) && out.lineas.length < 25) {
        var descTxt = m[1].trim().replace(/\s{2,}/g, ' ');
        if (descTxt.length > 3 && !/^(?:total|iva|subtotal|descuento|impuesto|cufe|fecha|nit)/i.test(descTxt)) {
          out.lineas.push({ descripcion: descTxt, cantidad: 1, valor: 0 });
        }
      }
    }

    /* ── Inferir subtotal si falta ── */
    if (!out.subtotal && out.total && out.totalIva) {
      out.subtotal = out.total - out.totalIva;
    }

    /* ── Representante legal emisor ── */
    out.representanteEmisor = feExtractRepresentanteFromText(text);

    /* ── NIT emisor: evitar confundir con receptor/comprador ── */
    if (out.nitEmisor && out.nitReceptor && normNit(out.nitEmisor) === normNit(out.nitReceptor)) {
      var allNits = feExtractNitsFromText(text);
      for (var nxi = 0; nxi < allNits.length; nxi++) {
        if (normNit(allNits[nxi]) !== normNit(out.nitReceptor)) {
          out.nitEmisor = allNits[nxi];
          break;
        }
      }
    }

    /* ── Razón social: bloque superior del documento ── */
    if (!out.razonSocial) {
      for (var rsi = 0; rsi < Math.min(lines.length, 14); rsi++) {
        var rsl = String(lines[rsi] || '').trim();
        if (rsl.length < 6 || rsl.length > 90) continue;
        if (/factura|nit|fecha|cufe|cliente|adquiriente|comprador|dian|resoluci|total|subtotal/i.test(rsl)) {
          continue;
        }
        if (/S\.?A\.?S|LTDA|S\.?A\.|E\.U\.|INC\b/i.test(rsl) && /[A-ZÁÉÍÓÚ]{3,}/.test(rsl)) {
          out.razonSocial = rsl.replace(/\s{2,}/g, ' ').trim();
          break;
        }
      }
    }

    return out;
  }

  function feTextoEncabezadoProveedorDesdeBlocks(blocks) {
    blocks = blocks || [];
    var pageH = 0;
    var clienteY = -1;
    var parts = [];

    blocks.forEach(function (b) {
      if (b.page !== 1) return;
      if (b.pageH) pageH = b.pageH;
      var s = String(b.text || '').trim();
      if (/^cliente\s*:/i.test(s) || /^cliente\b/i.test(s)) {
        if (clienteY < 0 || b.y < clienteY) clienteY = b.y;
      }
    });

    blocks.forEach(function (b) {
      if (b.page !== 1) return;
      var s = String(b.text || '').trim();
      if (!s || s.length < 2 || s.length > 120) return;
      if (/^cliente\s*:/i.test(s)) return;
      if (/factura\s+electr|total\s+a\s+pagar|descripci[oó]n|cantidad|vendedor\s*:/i.test(s)) return;
      if (pageH && b.y < pageH * 0.42) return;
      if (clienteY >= 0 && b.y < clienteY - 8) return;
      parts.push({ text: s, y: b.y || 0, x: b.x || 0 });
    });

    if (!parts.length) return '';

    parts.sort(function (a, b) {
      if (b.y !== a.y) return b.y - a.y;
      return b.x - a.x;
    });

    var seen = {};
    return parts
      .map(function (p) {
        return p.text;
      })
      .filter(function (t) {
        if (seen[t]) return false;
        seen[t] = true;
        return true;
      })
      .join('\n');
  }

  function feLineasAntesDeCliente(text) {
    text = String(text || '');
    var lines = text.split(/\n/);
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i].replace(/\s+/g, ' ').trim();
      if (/^cliente\s*:/i.test(ln) || /^cliente\b/i.test(ln)) break;
      if (ln) out.push(ln);
    }
    return out;
  }

  /** Facturas comerciales (ferretería, POS): proveedor en encabezado antes de «Cliente:». */
  function feExtraerProveedorEncabezadoComercial(text, pack) {
    pack = pack || {};
    text = String(text || '');
    var out = {};
    var zoneLines = feLineasAntesDeCliente(text);
    var blockHdr = feTextoEncabezadoProveedorDesdeBlocks(pack.blocks || []);
    if (blockHdr) {
      blockHdr.split(/\n/).forEach(function (ln) {
        ln = ln.replace(/\s+/g, ' ').trim();
        if (ln && zoneLines.indexOf(ln) < 0) zoneLines.push(ln);
      });
    }
    if (!zoneLines.length) return out;

    var bizName = '';
    var personName = '';
    var nit = '';
    var flat = zoneLines.join(' ').replace(/\s+/g, ' ');

    zoneLines.forEach(function (ln) {
      if (
        /ferreter[ií]a|ferreteria|distribuidor|comercial|ltda|s\.a\.s|sas\b|tienda|almac[eé]n|arcolores/i.test(ln) &&
        ln.length >= 6 &&
        ln.length < 90 &&
        !/@|\.com|tel|nit\b/i.test(ln)
      ) {
        var bn = feCleanNombreCampo(ln);
        if (!bizName || bn.length > bizName.length) bizName = bn;
      }
      if (
        feLooksLikePersonName(ln, { allowSingle: false }) &&
        !feIsRepresentanteGarbage(ln) &&
        !/ferreter[ií]a|factura|electr/i.test(ln)
      ) {
        if (!personName) personName = feCleanNombreCampo(ln);
      }
      var nitLn = ln.match(/\b(\d{1,2}\.\d{3}\.\d{3}-\d{1,2})\b/) || ln.match(/\b(\d{3}\.\d{3}\.\d{3}-\d{1,2})\b/);
      if (nitLn && !nit) nit = nitLn[1];
    });

    if (!nit) {
      var nitFlat = flat.match(/\b(\d{1,2}\.\d{3}\.\d{3}-\d{1,2})\b/) || flat.match(/\b(\d{3}\.\d{3}\.\d{3}-\d{1,2})\b/);
      if (nitFlat) nit = nitFlat[1];
    }

    if (personName) {
      out.razonSocial = personName;
      out._razonSocialFromEncabezado = true;
      out._razonSocialExplicit = true;
      if (bizName && feNombresDifieren(personName, bizName)) out.nombreComercialEmisor = bizName;
    } else if (bizName) {
      out.razonSocial = bizName;
      out._razonSocialFromEncabezado = true;
      out._razonSocialExplicit = true;
    }

    if (nit) {
      out.nitEmisor = nit;
      out._nitFromEncabezado = true;
    }

    if (!out.telefonoEmisor) out.telefonoEmisor = fePickTelefonoEmisor(flat);
    if (!out.emailEmisor) out.emailEmisor = fePickEmailEmisor(flat);
    if (!out.direccionEmisor) out.direccionEmisor = feExtractDireccionFromText(flat);

    return out;
  }

  function feEmisorZoneText(text, pack) {
    text = String(text || '');
    pack = pack || {};
    var splitRe =
      /\b(?:ADQUIRIENTE|COMPRADOR|CLIENTE\s*:|CLIENTE\b|DESTINATARIO|FACTURAR\s+A|SEÑOR(?:ES)?|DATOS\s+DEL\s+(?:CLIENTE|COMPRADOR|ADQUIRIENTE)|INFORMACI[ÓO]N\s+DEL\s+COMPRADOR|DATOS\s+DEL\s+ADQUIRIENTE|NOMBRE\s+DEL\s+CLIENTE)\b/i;
    var idx = text.search(splitRe);
    var pre = idx > 40 ? text.slice(0, idx) : '';
    var blockHdr = feTextoEncabezadoProveedorDesdeBlocks(pack.blocks || []);
    var lineHdr = feLineasAntesDeCliente(text).join('\n');
    var merged = [pre, lineHdr, blockHdr].filter(Boolean).join('\n');
    if (merged.length > 12) return merged;
    var p1 = text.split(/\n---\s*p2\s*---\n/i)[0];
    return p1 || text;
  }

  function feGetEmpresaContext() {
    var nit = '';
    var nombre = '';
    var displayNombre = '';
    var displayNit = '';
    try {
      var emp = null;
      if (global.config && typeof global.config.getEmpresa === 'function') {
        emp = global.config.getEmpresa() || null;
      }
      if (!emp && global.getEmpresaConfig && typeof global.getEmpresaConfig === 'function') {
        emp = global.getEmpresaConfig() || null;
      }
      if (emp) {
        displayNit = String(emp.nit || emp.identificacion || emp.documento || '').trim();
        displayNombre = String(
          emp.razonSocial || emp.nombreComercial || emp.nombre || emp.name || ''
        ).trim();
        nit = normNit(displayNit);
        nombre = feNormNombreCmp(displayNombre);
      }
    } catch (_) {}
    return { nit: nit, nombre: nombre, displayNombre: displayNombre, displayNit: displayNit };
  }

  /** ¿Aparece la empresa del POS (comprador) en el documento? Solo nota informativa. */
  function feCheckEmpresaEnFactura(fe, pack) {
    fe = fe || {};
    pack = pack || {};
    var empresa = feGetEmpresaContext();
    if (!empresa.displayNombre && !empresa.nit) {
      return { found: true, skip: true, empresaNombre: '', mensaje: '' };
    }

    var found = false;
    var textRaw = String(pack.text || '');
    var textCmp = feNormNombreCmp(textRaw);
    var textDigits = textRaw.replace(/[^0-9]/g, '');

    if (empresa.nit && empresa.nit.length >= 8) {
      if (fe.nitReceptor && normNit(fe.nitReceptor) === empresa.nit) found = true;
      var nitDigits = empresa.nit.replace(/[^0-9]/g, '');
      if (nitDigits.length >= 8 && textDigits.indexOf(nitDigits) >= 0) found = true;
    }

    if (!found && empresa.displayNombre) {
      var nomCmp = feNormNombreCmp(empresa.displayNombre);
      if (nomCmp.length >= 5 && textCmp.indexOf(nomCmp) >= 0) found = true;
      if (
        fe.nombreReceptor &&
        !feNombresDifieren(fe.nombreReceptor, empresa.displayNombre)
      ) {
        found = true;
      }
      if (!found) {
        var words = empresa.displayNombre
          .toUpperCase()
          .replace(/[^A-ZÁÉÍÓÚÑ0-9 ]/g, ' ')
          .split(/\s+/)
          .filter(function (w) {
            return w.length >= 4 && !/^(DEL|LOS|LAS|DE|LA|EL|Y|SAS|LTDA|CIA)$/.test(w);
          });
        var hits = 0;
        for (var wi = 0; wi < words.length; wi++) {
          var wc = feNormNombreCmp(words[wi]);
          if (wc.length >= 4 && textCmp.indexOf(wc) >= 0) hits++;
        }
        if (words.length && hits >= Math.max(1, Math.ceil(words.length * 0.5))) found = true;
      }
    }

    var mensaje = '';
    if (!found) {
      mensaje =
        'No aparece «' +
        (empresa.displayNombre || 'su empresa') +
        '»' +
        (empresa.displayNit ? ' (NIT ' + empresa.displayNit + ')' : '') +
        ' como comprador. Verifique que el documento sea para su negocio.';
      if (pack.likelyScanned && (pack.textLen || 0) < 120) {
        mensaje += ' PDF con poco texto legible.';
      }
      mensaje += ' Puede continuar.';
    }

    return {
      found: found,
      skip: false,
      empresaNombre: empresa.displayNombre,
      empresaNit: empresa.displayNit,
      mensaje: mensaje,
    };
  }

  function feEsDatoComprador(val, fe, empresa) {
    if (val == null || val === '') return false;
    fe = fe || {};
    empresa = empresa || feGetEmpresaContext();
    var vNom = feNormNombreCmp(val);
    var vNit = normNit(val);

    if (fe.nombreReceptor && vNom && !feNombresDifieren(val, fe.nombreReceptor)) return true;
    if (fe.nitReceptor && vNit && vNit === normNit(fe.nitReceptor)) return true;
    if (empresa.nit && vNit && vNit.length >= 8 && vNit === empresa.nit) return true;
    if (empresa.nombre && vNom && vNom.length >= 6) {
      if (vNom === empresa.nombre) return true;
      if (vNom.indexOf(empresa.nombre) >= 0 || empresa.nombre.indexOf(vNom) >= 0) return true;
    }
    if (typeof val === 'string' && /TIENDA\s+DE\s+CAF[eéÉ]/i.test(val)) return true;
    return false;
  }

  /** Quita del emisor datos que coinciden con comprador o con la empresa en sesión. */
  function feSanitizeEmisorVsComprador(fe, pack, meta) {
    fe = fe || {};
    pack = pack || {};
    meta = meta || {};
    var empresa = feGetEmpresaContext();
    var emisorText = feEmisorZoneText(pack.text || '', pack);

    if (fe.razonSocial && !fe._razonSocialFromTraining && feEsDatoComprador(fe.razonSocial, fe, empresa)) {
      if (!fe.nombreReceptor) fe.nombreReceptor = fe.razonSocial;
      fe._compradorConflicto = fe.razonSocial;
      fe.razonSocial = '';
      fe._razonSocialExplicit = false;
      fe._razonSocialFromBlocks = false;
      var encHdr = feExtraerProveedorEncabezadoComercial(pack.text || '', pack);
      if (encHdr.razonSocial && !feEsDatoComprador(encHdr.razonSocial, fe, empresa)) {
        fe.razonSocial = encHdr.razonSocial;
        fe._razonSocialFromEncabezado = true;
        fe._razonSocialExplicit = true;
      } else {
        var rsEm = parseFeFromText(emisorText);
        if (rsEm.razonSocial && !feEsDatoComprador(rsEm.razonSocial, fe, empresa)) {
          fe.razonSocial = rsEm.razonSocial;
          fe._razonSocialExplicit = !!rsEm._razonSocialExplicit;
        } else if (meta.nombreArchivo) {
          var fromFile = feRazonSocialFromFilename(meta.nombreArchivo);
          if (fromFile && !feEsDatoComprador(fromFile, fe, empresa)) {
            fe.razonSocial = fromFile.toUpperCase();
            fe._razonSocialFromFilename = true;
          }
        }
      }
    }

    if (fe.direccionEmisor && (feEsTextoFormaPago(fe.direccionEmisor) || feEsDireccionGenerica(fe.direccionEmisor))) {
      fe.direccionEmisor = '';
      var encDir = feExtraerProveedorEncabezadoComercial(pack.text || '', pack);
      if (encDir.direccionEmisor && feLooksLikeColAddress(encDir.direccionEmisor)) {
        fe.direccionEmisor = encDir.direccionEmisor;
      } else {
        var dirEm = feExtractDireccionFromText(emisorText);
        if (dirEm && feLooksLikeColAddress(dirEm)) fe.direccionEmisor = dirEm;
      }
    }

    if (fe.nitEmisor && feEsDatoComprador(fe.nitEmisor, fe, empresa)) {
      fe.nitEmisor = '';
      var nits = feExtractNitsFromText(emisorText);
      var rec = fe.nitReceptor ? normNit(fe.nitReceptor) : '';
      var empNit = empresa.nit || '';
      for (var ni = 0; ni < nits.length; ni++) {
        var nn = normNit(nits[ni]);
        if (nn === rec || (empNit && nn === empNit)) continue;
        fe.nitEmisor = nits[ni];
        break;
      }
    }

    if (fe.nombreReceptor && fe.razonSocial && !feNombresDifieren(fe.razonSocial, fe.nombreReceptor)) {
      fe._posibleComprador = true;
      fe._proveedorIgualComprador = fe.razonSocial;
    }

    return fe;
  }

  function feBlockLooksLikeProduct(s) {
    s = String(s || '').trim();
    if (!s || s.length < 4) return true;
    if (/\$|[\d]{1,3}[.,][\d]{2,}/.test(s)) return true;
    if (/^\d+([.,]\d+)?$/.test(s)) return true;
    if (/\b(kg|gr|und|unid|cant|x\s*\d|valor|unitario|subtotal)\b/i.test(s)) return true;
    if (/^(descripci|producto|art[ií]culo|cantidad|vr\.?\s*unit)/i.test(s)) return true;
    return false;
  }

  function feNormNombreCmp(s) {
    return String(s || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase()
      .replace(/[^A-ZÁÉÍÓÚÑ0-9 ]/g, '');
  }

  function feNombresDifieren(a, b) {
    var na = feNormNombreCmp(a);
    var nb = feNormNombreCmp(b);
    if (!na || !nb) return false;
    if (na === nb) return false;
    if (na.indexOf(nb) >= 0 || nb.indexOf(na) >= 0) return false;
    return true;
  }

  function feIsGenericEmail(email) {
    email = String(email || '').toLowerCase();
    return /dian\.gov|facturaelectronica|noreply|no-reply|notificaciones|soporte\.dian|@fe\.|facturacion@/i.test(
      email
    );
  }

  function fePickEmailEmisor(text) {
    var re = /([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/g;
    var m;
    while ((m = re.exec(text))) {
      if (!feIsGenericEmail(m[1])) return m[1];
    }
    return '';
  }

  function fePickTelefonoEmisor(text) {
    var patterns = [
      /(?:Cel(?:ular)?|M[oó]vil|Tel(?:[eé]fono)?|Phone|Fax)[:\s]*([+\d][\d\s().\-]{6,18})/i,
      /(\+57\s*3\d{2}\s*\d{3}\s*\d{4})/,
      /(3\d{2}[\s.-]?\d{3}[\s.-]?\d{4})/,
      /(\(\d{3,4}\)\s*\d{3,7})/,
      /Tel[eé]fono[:\s]*([+\s0-9()-]{7,20})/i,
    ];
    for (var pi = 0; pi < patterns.length; pi++) {
      var m = text.match(patterns[pi]);
      if (m && m[1]) return m[1].replace(/\s{2,}/g, ' ').trim();
    }
    return '';
  }

  function feBlocksEmisorNombre(blocks) {
    blocks = blocks || [];
    var p1 = [];
    var pageH = 0;
    for (var bi = 0; bi < blocks.length; bi++) {
      var b = blocks[bi];
      if (b.page !== 1) continue;
      if (b.pageH) pageH = b.pageH;
      var s = String(b.text || '').trim();
      if (s.length < 4 || s.length > 90) continue;
      if (feBlockLooksLikeProduct(s)) continue;
      if (
        /factura|nit|cufe|fecha|cliente|adquiriente|comprador|resoluci|total|p[aá]gina|page|dian|n[uú]mero|electr[oó]nica/i.test(
          s
        )
      ) {
        continue;
      }
      p1.push({ text: s, h: b.h || 0, y: b.y || 0, idx: bi });
    }
    if (!p1.length) return '';

    var yCut = pageH ? pageH * 0.62 : 0;
    var nitIdx = p1.length;
    for (var ni = 0; ni < p1.length; ni++) {
      if (/^NIT\b|N\.I\.T/i.test(p1[ni].text)) {
        nitIdx = ni;
        break;
      }
    }

    var best = '';
    var bestScore = -1;
    for (var ci = 0; ci < p1.length; ci++) {
      var cand = p1[ci];
      var t = cand.text.replace(/\s{2,}/g, ' ').trim();
      if (yCut && cand.y < yCut) continue;
      if (cand.idx > nitIdx + 10) continue;
      var score = (cand.h || 0) * 2;
      if (cand.idx <= nitIdx + 2) score += 40;
      if (/S\.?A\.?S|LTDA|S\.?A\.|E\.U\.|INC|CIA\b/i.test(t)) score += 25;
      if (/[A-ZÁÉÍÓÚÑ]{4,}/.test(t)) score += 10;
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
    return best.replace(/\s{2,}/g, ' ').trim().replace(/\s*nombre\s+comercial\s*:.*$/i, '').trim();
  }

  function feBlocksEmisorDireccion(blocks) {
    blocks = blocks || [];
    var best = '';
    var bestScore = -1;
    for (var bi = 0; bi < blocks.length; bi++) {
      var b = blocks[bi];
      if (b.page !== 1) continue;
      var s = String(b.text || '').replace(/\s+/g, ' ').trim();
      if (s.length < 8 || s.length > 130) continue;
      if (!feLooksLikeColAddress(s)) continue;
      if (feBlockLooksLikeProduct(s)) continue;
      if (/^(?:cliente|comprador|adquiriente|factura|nit|cufe)\b/i.test(s)) continue;
      var score = feScoreDireccionCandidate(s);
      if (/#\s*\d/.test(s)) score += 8;
      if (b.y && b.pageH && b.y < b.pageH * 0.58) score += 10;
      if (score > bestScore) {
        bestScore = score;
        best = feCleanDireccion(s);
      }
    }
    return best;
  }

  function feBlocksEmisorRepresentante(blocks) {
    blocks = blocks || [];
    var labelRe = /representante\s+legal|rep\.?\s*legal|r\.?\s*l\.?|nombre\s+del\s+representante\s+legal|gerente\s+general/i;
    var best = '';
    var bestScore = -1;

    for (var bi = 0; bi < blocks.length; bi++) {
      var b = blocks[bi];
      if (b.page !== 1) continue;
      var s = String(b.text || '').replace(/\s+/g, ' ').trim();
      if (!s || feIsRepresentanteGarbage(s)) continue;

      if (labelRe.test(s)) {
        if (/cuenta\s+de\s+pago|nombre\s+o\s+raz[oó]n\s+social/i.test(s)) continue;
        var after = s.replace(/^[^:]{2,55}:\s*/, '').trim();
        if (after !== s) {
          var scLabel = feScoreRepresentanteCandidate(after, { allowSingle: true }) + 18;
          if (scLabel > bestScore) {
            bestScore = scLabel;
            best = feSanitizeRepresentanteEmisor(after, { allowSingle: true });
          }
        }
        if (bi + 1 < blocks.length && blocks[bi + 1].page === 1) {
          var next = String(blocks[bi + 1].text || '').replace(/\s+/g, ' ').trim();
          if (next && !feIsRepresentanteGarbage(next)) {
            var scNext = feScoreRepresentanteCandidate(next, { allowSingle: true }) + 14;
            if (scNext > bestScore) {
              bestScore = scNext;
              best = feSanitizeRepresentanteEmisor(next, { allowSingle: true });
            }
          }
        }
      }
    }
    return best;
  }

  function feMergeFePreferFill(primary, extra) {
    primary = primary || {};
    extra = extra || {};
    Object.keys(extra).forEach(function (k) {
      if (k.indexOf('_') === 0 && extra[k]) {
        primary[k] = extra[k];
        return;
      }
      if (k === 'lineas' && Array.isArray(extra.lineas) && extra.lineas.length) {
        if (!primary.lineas || !primary.lineas.length) primary.lineas = extra.lineas.slice();
        return;
      }
      if (k === 'rawExcerpt') return;
      var v = extra[k];
      if (v === null || v === undefined || v === '' || v === 0) return;
      if (!primary[k] || primary[k] === '' || primary[k] === 0) primary[k] = v;
    });
    return primary;
  }

  function feEnrichFeProveedor(fe, pack, meta) {
    fe = fe || {};
    pack = pack || {};
    meta = meta || {};
    var text = pack.text || '';
    var encabezado = feExtraerProveedorEncabezadoComercial(text, pack);
    fe = feMergeFePreferFill(fe, encabezado);
    var emisorText = feEmisorZoneText(text, pack);
    var feDoc = fe;
    var feEm = parseFeFromText(emisorText);
    var out = feMergeFePreferFill(Object.assign({}, feDoc), feEm);

    out.lineas =
      feDoc.lineas && feDoc.lineas.length ? feDoc.lineas : feEm.lineas && feEm.lineas.length ? feEm.lineas : [];
    if (feEm.nitEmisor && !out._nitFromEncabezado) out.nitEmisor = feEm.nitEmisor;
    if (feEm._razonSocialExplicit && feEm.razonSocial && !out._razonSocialFromEncabezado) {
      out.razonSocial = feEm.razonSocial;
      out._razonSocialExplicit = true;
    } else if (feEm.razonSocial && !out.razonSocial) {
      out.razonSocial = feEm.razonSocial;
    }

    if (!out.telefonoEmisor) {
      out.telefonoEmisor = fePickTelefonoEmisor(emisorText) || fePickTelefonoEmisor(text);
    }
    if (!out.emailEmisor) {
      out.emailEmisor = fePickEmailEmisor(emisorText) || fePickEmailEmisor(text);
    }
    if (!out.direccionEmisor) {
      out.direccionEmisor =
        feExtractDireccionFromText(emisorText) ||
        feExtractDireccionFromText(text) ||
        feBlocksEmisorDireccion(pack.blocks || []);
    }
    if (!out.ciudadEmisor) {
      out.ciudadEmisor = fePickCiudadFromText(emisorText) || fePickCiudadFromText(text);
    }
    if (!out.representanteEmisor) {
      out.representanteEmisor =
        feExtractRepresentanteFromText(emisorText) ||
        feExtractRepresentanteFromText(text) ||
        feBlocksEmisorRepresentante(pack.blocks || []);
    }

    var blockName = feBlocksEmisorNombre(pack.blocks || []);
    if (blockName && !out.razonSocial) {
      out.razonSocial = feCleanRazonSocialEmisor(blockName);
      out._razonSocialFromBlocks = true;
    } else if (blockName && out.razonSocial && !out._razonSocialExplicit && feNombresDifieren(out.razonSocial, blockName)) {
      /* Mantener nombre del emisor ya leído; no reemplazar por comprador/ítem con fuente más grande */
    }

    if (!out.razonSocial && meta.nombreArchivo) {
      out.razonSocial = feRazonSocialFromFilename(meta.nombreArchivo);
      if (out.razonSocial) out.razonSocial = out.razonSocial.toUpperCase();
    }

    if (out._nitFromEncabezado && out.nitEmisor) {
      /* keep */
    } else if (out.nitEmisor && out.nitReceptor && normNit(out.nitEmisor) === normNit(out.nitReceptor)) {
      var emisorNits = feExtractNitsFromText(emisorText);
      var rec = normNit(out.nitReceptor);
      for (var eni = 0; eni < emisorNits.length; eni++) {
        if (normNit(emisorNits[eni]) !== rec) {
          out.nitEmisor = emisorNits[eni];
          break;
        }
      }
    }

    if (!out.nitEmisor && text) {
      var emisorNits2 = feExtractNitsFromText(emisorText);
      var rec2 = out.nitReceptor ? normNit(out.nitReceptor) : '';
      for (var eni2 = 0; eni2 < emisorNits2.length; eni2++) {
        if (!rec2 || normNit(emisorNits2[eni2]) !== rec2) {
          out.nitEmisor = emisorNits2[eni2];
          break;
        }
      }
      if (!out.nitEmisor) {
        var allNits = feExtractNitsFromText(text);
        for (var ani = 0; ani < allNits.length; ani++) {
          if (!rec2 || normNit(allNits[ani]) !== rec2) {
            out.nitEmisor = allNits[ani];
            break;
          }
        }
      }
    }

    out = feComprenderNombresEnFactura(out, pack, meta);

    return out;
  }

  function feTrainingGetVendors() {
    var p = getFeTrainingProfile();
    return (p && p.vendors) || [];
  }

  /** Aplica catálogo entrenado (facturas de pruebas) para corregir emisor en auto-detect. */
  function feTrainingResolveVendor(text, meta, fe) {
    var vendors = feTrainingGetVendors();
    if (!vendors.length) return null;
    meta = meta || {};
    fe = fe || {};
    var emisorText = feEmisorZoneText(text || '');
    var fileSlug = feSupplierSlugFromFilename(meta.nombreArchivo || '');
    var nitFe = fe.nitEmisor ? normNit(fe.nitEmisor) : '';
    var textUp = String(emisorText || '').toUpperCase();
    var best = null;
    var bestScore = 0;

    for (var vi = 0; vi < vendors.length; vi++) {
      var v = vendors[vi];
      var score = 0;
      if (fileSlug && v.slug && fileSlug === v.slug) score += 52;
      if (nitFe && v.nits && v.nits.length) {
        for (var ni = 0; ni < v.nits.length; ni++) {
          if (nitFe === normNit(v.nits[ni])) score += 48;
        }
      }
      if (v.tokens && v.tokens.length) {
        for (var ti = 0; ti < v.tokens.length; ti++) {
          var tok = String(v.tokens[ti] || '').toUpperCase();
          if (tok.length >= 4 && textUp.indexOf(tok) >= 0) score += 9;
        }
      }
      if (v.aliases && v.aliases.length && fe.razonSocial) {
        for (var ai = 0; ai < v.aliases.length; ai++) {
          if (!feNombresDifieren(fe.razonSocial, v.aliases[ai])) score += 20;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        best = v;
      }
    }
    if (!best || bestScore < 42) return null;
    return { vendor: best, score: bestScore };
  }

  function feTrainingPickAlias(v, meta) {
    v = v || {};
    meta = meta || {};
    var fileSlug = feSupplierSlugFromFilename(meta.nombreArchivo || '');
    if (v.slug && fileSlug === v.slug && v.label) {
      return String(v.label).toUpperCase();
    }
    if (v.aliases && v.aliases.length) return String(v.aliases[0]);
    return String(v.label || '').toUpperCase();
  }

  function feTrainingApplyToFe(fe, pack, meta) {
    fe = fe || {};
    pack = pack || {};
    var Banco = global.CrozzoRecepcionFeBanco;
    if (Banco && typeof Banco.feBancoApplyLearnedToFe === 'function') {
      fe = Banco.feBancoApplyLearnedToFe(fe, pack, meta);
    }
    var hit = feTrainingResolveVendor(pack.text, meta, fe);
    if (!hit || !hit.vendor) return fe;
    var v = hit.vendor;
    var alias = feTrainingPickAlias(v, meta);

    if (v.nits && v.nits.length) {
      var known = false;
      if (fe.nitEmisor) {
        var n0 = normNit(fe.nitEmisor);
        for (var i = 0; i < v.nits.length; i++) {
          if (n0 === normNit(v.nits[i])) known = true;
        }
      }
      if (!fe.nitEmisor || (!known && hit.score >= 50)) fe.nitEmisor = v.nits[0];
    }

    if (alias && !fe._razonSocialExplicit) {
      if (!fe.razonSocial) {
        fe.razonSocial = alias;
        fe._razonSocialFromTraining = true;
      } else if (feNombresDifieren(fe.razonSocial, alias) && hit.score >= 48) {
        fe.razonSocial = alias;
        fe._razonSocialFromTraining = true;
      }
    }
    return fe;
  }

  function feComputeProbeConfidence(fe, pack) {
    fe = fe || {};
    pack = pack || {};
    var fields = [];
    var score = 0;
    if (fe.nitEmisor) {
      score += 22;
      fields.push('nit');
    }
    if (fe.razonSocial) {
      score += 20;
      fields.push('razonSocial');
    }
    if (fe.telefonoEmisor) {
      score += 10;
      fields.push('telefono');
    }
    if (fe.emailEmisor) {
      score += 10;
      fields.push('email');
    }
    if (fe.direccionEmisor) {
      score += 8;
      fields.push('direccion');
    }
    if (fe.representanteEmisor) {
      score += 5;
      fields.push('representante');
    }
    if (fe.numeroFactura) {
      score += 8;
      fields.push('numeroFactura');
    }
    if (fe.fecha) {
      score += 5;
      fields.push('fecha');
    }
    if (fe.total) {
      score += 7;
      fields.push('total');
    }
    if (fe.cufe) {
      score += 5;
      fields.push('cufe');
    }
    if (fe.lineas && fe.lineas.length) {
      score += Math.min(10, fe.lineas.length * 2);
      fields.push('lineas');
    }
    if (pack.likelyScanned && (pack.textLen || 0) < 80) score = Math.max(0, score - 15);
    if ((pack.textLen || 0) > 200) score += 5;
    score = Math.min(100, score);
    var label = score >= 70 ? 'Alta' : score >= 45 ? 'Media' : 'Baja';
    return { score: score, label: label, fieldsFound: fields };
  }

  function feProbeHeaderOcr(doc) {
    return feOcrRenderHeaderDataUrl(doc).then(feOcrLocalDesdeDataUrl);
  }

  function feBolsaUniq(arr, item, keyFn) {
    keyFn =
      keyFn ||
      function (x) {
        return String((x && x.valor) || x || '');
      };
    var k = keyFn(item);
    if (!k) return;
    for (var i = 0; i < arr.length; i++) {
      if (keyFn(arr[i]) === k) return;
    }
    arr.push(item);
  }

  /** Fase 1: sacar todo lo que se pueda (números, cuentas, nombres, etiquetas…) sin filtrar aún. */
  function feExtraerBolsaCandidatos(pack, fe, meta) {
    fe = fe || {};
    pack = pack || {};
    meta = meta || {};
    var text = String(pack.text || '');
    var flat = text.replace(/\s+/g, ' ');
    var lines = text
      .split(/\n/)
      .map(function (ln) {
        return ln.replace(/\s+/g, ' ').trim();
      })
      .filter(Boolean);

    var bolsa = {
      nombres: [],
      nits: [],
      telefonos: [],
      emails: [],
      cuentas: [],
      montos: [],
      numerosFactura: [],
      fechas: [],
      direcciones: [],
      cufes: [],
      lineasEtiquetadas: [],
      numerosSueltos: [],
    };

    var emisorText = feEmisorZoneText(text, pack);
    var compradorText = feCompradorZoneText(text);

    var nitEmisorEtq = feExtractNitEmisorEtiquetado(emisorText);
    if (nitEmisorEtq) {
      feBolsaUniq(bolsa.nits, { valor: nitEmisorEtq, fuente: 'nit-emisor-etiqueta', zona: 'emisor' });
    }

    feExtractNitsFromText(emisorText).forEach(function (n) {
      feBolsaUniq(bolsa.nits, { valor: n, fuente: 'texto-emisor', zona: 'emisor' });
    });
    feExtractNitsFromText(compradorText).forEach(function (n) {
      feBolsaUniq(bolsa.nits, { valor: n, fuente: 'texto-comprador', zona: 'comprador' });
    });
    feExtractNitsFromText(text).forEach(function (n) {
      feBolsaUniq(bolsa.nits, { valor: n, fuente: 'texto', zona: 'mixto' });
    });

    var telRe = /(?:tel[eé]fono|telf\.?|cel(?:ular)?|m[oó]vil|fax)[:\s#]*([+\d\s().-]{7,22})/gi;
    var tm;
    while ((tm = telRe.exec(text))) {
      feBolsaUniq(bolsa.telefonos, { valor: tm[1].trim(), fuente: 'etiqueta' });
    }
    (flat.match(/(?:\+57\s?)?3\d{2}[\s.-]?\d{3}[\s.-]?\d{4}/g) || []).forEach(function (t) {
      if (feLooksLikeTelefonoColombia(t)) {
        feBolsaUniq(bolsa.telefonos, { valor: t.trim(), fuente: 'patron-movil' });
      }
    });

    (flat.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || []).forEach(function (e) {
      feBolsaUniq(bolsa.emails, { valor: e.toLowerCase(), fuente: 'patron', len: e.length });
    });

    var cuentaRe =
      /(?:cuenta\s+(?:de\s+)?(?:ahorros|corriente|bancaria)?|cta\.?|no\.?\s*cuenta|n[uú]mero\s+de\s+cuenta)[:\s#]*([*\d\s\-]{8,28})/gi;
    var cm;
    while ((cm = cuentaRe.exec(text))) {
      feBolsaUniq(bolsa.cuentas, { valor: cm[1].replace(/\s/g, ''), fuente: 'etiqueta', contexto: cm[0].slice(0, 40) });
    }
    (flat.match(/\b\d{9,16}\b/g) || []).forEach(function (num) {
      if (num.length >= 10 && num.length <= 11 && normNit(num).length >= 9) return;
      feBolsaUniq(bolsa.numerosSueltos, { valor: num, fuente: 'texto' });
    });

    var montoRe = /(?:total\s+a\s+pagar|valor\s+total|total\s+factura|total)[:\s$#]*([\d.,]+)/gi;
    var mm;
    while ((mm = montoRe.exec(flat))) {
      feBolsaUniq(bolsa.montos, { valor: mm[1], fuente: 'etiqueta-total' });
    }
    (flat.match(/\$\s*[\d.,]+/g) || []).slice(0, 12).forEach(function (m) {
      feBolsaUniq(bolsa.montos, { valor: m.replace(/[^\d.,]/g, ''), fuente: 'simbolo-peso' });
    });

    var facRe = /(?:factura\s*(?:electr[oó]nica|de\s+venta)?|n[uú]mero\s+de\s+factura|no\.?\s*factura)[:\s#]*([A-Z0-9\-]+)/gi;
    var fm;
    while ((fm = facRe.exec(flat))) {
      feBolsaUniq(bolsa.numerosFactura, { valor: fm[1], fuente: 'etiqueta' });
    }

    (flat.match(/\b\d{4}[-/]\d{2}[-/]\d{2}\b/g) || []).forEach(function (d) {
      feBolsaUniq(bolsa.fechas, { valor: d, fuente: 'patron' });
    });

    lines.forEach(function (ln) {
      var em = ln.match(
        /^(raz[oó]n\s+social|nombre(?:\s+o\s+raz[oó]n\s+social)?|representante(?:\s+legal)?|nit|direcci[oó]n|tel[eé]fono|correo|e-?mail|cuenta|factura|fecha|total)\s*[:\s]\s*(.+)$/i
      );
      if (em) {
        bolsa.lineasEtiquetadas.push({ etiqueta: em[1], valor: em[2].trim() });
      }
      if (feLooksLikeColAddress(ln) && ln.length >= 12 && ln.length < 120) {
        feBolsaUniq(bolsa.direcciones, { valor: ln, fuente: 'linea' });
      }
    });

    extractAllCufeCandidates(text).forEach(function (c) {
      var hex = typeof c === 'string' ? c : c.cufe;
      if (hex) feBolsaUniq(bolsa.cufes, { valor: hex, fuente: 'texto' });
    });

    if (pack.blocks && pack.blocks.length) {
      var blockNom = feBlocksEmisorNombre(pack.blocks);
      if (blockNom) {
        feBolsaUniq(bolsa.nombres, {
          valor: blockNom,
          tipo: 'empresa',
          fuente: 'bloque-pdf',
        });
      }
      var blockDir = feBlocksEmisorDireccion(pack.blocks);
      if (blockDir) feBolsaUniq(bolsa.direcciones, { valor: blockDir, fuente: 'bloque-pdf' });
      var blockRep = feBlocksEmisorRepresentante(pack.blocks);
      if (blockRep) {
        feBolsaUniq(bolsa.nombres, { valor: blockRep, tipo: 'persona', fuente: 'bloque-pdf' });
      }
    }

    [
      { v: fe.razonSocial, tipo: 'empresa', fuente: 'parser' },
      { v: fe.representanteEmisor, tipo: 'persona', fuente: 'parser' },
      { v: fe.nombreComercialEmisor, tipo: 'empresa', fuente: 'parser' },
    ].forEach(function (row) {
      if (!row.v) return;
      feBolsaUniq(bolsa.nombres, { valor: String(row.v).trim(), tipo: row.tipo, fuente: row.fuente });
    });
    if (fe.nitEmisor) feBolsaUniq(bolsa.nits, { valor: fe.nitEmisor, fuente: 'parser' });
    if (fe.telefonoEmisor) feBolsaUniq(bolsa.telefonos, { valor: fe.telefonoEmisor, fuente: 'parser' });
    if (fe.emailEmisor) feBolsaUniq(bolsa.emails, { valor: fe.emailEmisor, fuente: 'parser' });
    if (fe.direccionEmisor) feBolsaUniq(bolsa.direcciones, { valor: fe.direccionEmisor, fuente: 'parser' });
    if (fe.cufe) feBolsaUniq(bolsa.cufes, { valor: fe.cufe, fuente: 'parser' });
    if (fe.total) feBolsaUniq(bolsa.montos, { valor: String(fe.total), fuente: 'parser' });
    if (fe.numeroFactura) feBolsaUniq(bolsa.numerosFactura, { valor: fe.numeroFactura, fuente: 'parser' });

    bolsa.lineasEtiquetadas.forEach(function (le) {
      var et = String(le.etiqueta || '').toLowerCase();
      var val = le.valor;
      if (/raz[oó]n|nombre/.test(et) && !/representante/.test(et)) {
        feBolsaUniq(bolsa.nombres, {
          valor: val,
          tipo: feLooksLikeEmpresaNombre(val) ? 'empresa' : 'otro',
          fuente: 'etiqueta-' + et,
        });
      } else if (/representante/.test(et)) {
        feBolsaUniq(bolsa.nombres, { valor: val, tipo: 'persona', fuente: 'etiqueta-representante' });
      } else if (/nit/.test(et)) {
        feBolsaUniq(bolsa.nits, { valor: val, fuente: 'etiqueta-nit' });
      } else if (/direcci/.test(et)) {
        feBolsaUniq(bolsa.direcciones, { valor: val, fuente: 'etiqueta-direccion' });
      } else if (/tel/.test(et)) {
        feBolsaUniq(bolsa.telefonos, { valor: val, fuente: 'etiqueta-telefono' });
      } else if (/correo|mail/.test(et)) {
        feBolsaUniq(bolsa.emails, { valor: val, fuente: 'etiqueta-email' });
      } else if (/cuenta/.test(et)) {
        feBolsaUniq(bolsa.cuentas, { valor: val.replace(/\s/g, ''), fuente: 'etiqueta-cuenta' });
      }
    });

    bolsa.nombres.forEach(function (n) {
      if (feEsSoloEtiquetaCampo(n.valor)) {
        n.tipo = 'etiqueta';
        return;
      }
      if (!n.tipo || n.tipo === 'otro') {
        if (feLooksLikeEmpresaNombre(n.valor)) n.tipo = 'empresa';
        else if (feLooksLikePersonName(n.valor, { allowSingle: true })) n.tipo = 'persona';
        else n.tipo = 'otro';
      }
    });

    bolsa.resumen =
      bolsa.nombres.length +
      ' nombres · ' +
      bolsa.nits.length +
      ' NIT · ' +
      bolsa.cuentas.length +
      ' cuentas · ' +
      bolsa.montos.length +
      ' montos';
    return bolsa;
  }

  function feBolsaEtiquetarParte(bolsa, parteId) {
    if (!bolsa || !parteId) return bolsa;
    var keys = [
      'nombres',
      'nits',
      'telefonos',
      'emails',
      'cuentas',
      'montos',
      'numerosFactura',
      'fechas',
      'direcciones',
      'cufes',
      'numerosSueltos',
    ];
    keys.forEach(function (k) {
      (bolsa[k] || []).forEach(function (item) {
        if (item && !item.parte) item.parte = parteId;
      });
    });
    (bolsa.lineasEtiquetadas || []).forEach(function (le) {
      if (le && !le.parte) le.parte = parteId;
    });
    return bolsa;
  }

  function feBolsaFusionar(base, extra) {
    base = base || feExtraerBolsaCandidatos({ text: '' }, {}, {});
    extra = extra || {};
    var keys = [
      'nombres',
      'nits',
      'telefonos',
      'emails',
      'cuentas',
      'montos',
      'numerosFactura',
      'fechas',
      'direcciones',
      'cufes',
      'numerosSueltos',
    ];
    keys.forEach(function (k) {
      (extra[k] || []).forEach(function (item) {
        feBolsaUniq(base[k], item, function (x) {
          return String((x && x.valor) || x || '') + '|' + String((x && x.parte) || '');
        });
      });
    });
    (extra.lineasEtiquetadas || []).forEach(function (le) {
      var dup = false;
      for (var i = 0; i < (base.lineasEtiquetadas || []).length; i++) {
        if (
          base.lineasEtiquetadas[i].etiqueta === le.etiqueta &&
          base.lineasEtiquetadas[i].valor === le.valor
        ) {
          dup = true;
          break;
        }
      }
      if (!dup) base.lineasEtiquetadas.push(le);
    });
    base.resumen =
      base.nombres.length +
      ' nombres · ' +
      base.nits.length +
      ' NIT · ' +
      base.cuentas.length +
      ' cuentas · ' +
      base.montos.length +
      ' montos';
    return base;
  }

  /** Divide el PDF en 4 zonas lógicas para revisión a lupa. */
  function feDividirDocumentoCuatroPartes(pack, text) {
    text = String(text || '');
    pack = pack || {};
    var emisorText = feEmisorZoneText(text, pack);
    var compradorText = feCompradorZoneText(text);

    var idxEmisorLbl = text.search(/\b(?:emisor\s*\/\s*vendedor|datos\s+del\s+emisor|vendedor)\b/i);
    var idxComprador = compradorText ? text.indexOf(compradorText.slice(0, Math.min(40, compradorText.length))) : -1;
    if (idxComprador < 0) {
      idxComprador = text.search(
        /\b(?:ADQUIRIENTE|COMPRADOR|CLIENTE|DESTINATARIO|FACTURAR\s+A|DATOS\s+DEL\s+(?:CLIENTE|COMPRADOR|ADQUIRIENTE))\b/i
      );
    }
    var idxDetalle = text.search(
      /(?:descripci[oó]n|producto|art[ií]culo|concepto|cantidad|vr\.?\s*unit|detalle\s+de\s+productos)/i
    );
    var idxTotales = text.search(/(?:subtotal|total\s+a\s+pagar|valor\s+total|total\s+factura|gran\s+total)/i);

    var encabezadoEnd = idxEmisorLbl > 60 ? idxEmisorLbl : Math.min(text.length, Math.max(400, Math.floor(text.length * 0.12)));
    if (idxComprador > 60 && idxComprador < encabezadoEnd) encabezadoEnd = idxComprador;

    var encabezadoText = text.slice(0, encabezadoEnd).trim();
    if (!encabezadoText && emisorText) encabezadoText = emisorText.slice(0, Math.min(450, emisorText.length));

    var detalleStart = idxDetalle > 0 ? idxDetalle : idxTotales > 0 ? idxTotales : -1;
    if (compradorText && idxComprador >= 0) {
      var afterCom = text.slice(idxComprador + compradorText.length);
      if (afterCom.length > 80) {
        detalleStart = detalleStart > 0 ? Math.min(detalleStart, idxComprador + compradorText.length) : idxComprador + compradorText.length;
      }
    }
    if (detalleStart < 0 && emisorText.length + (compradorText || '').length < text.length) {
      detalleStart = (compradorText ? idxComprador + compradorText.length : emisorText.length) || Math.floor(text.length * 0.55);
    }
    var detalleText = detalleStart > 0 && detalleStart < text.length ? text.slice(detalleStart).trim() : '';

    var partes = [
      {
        id: 'encabezado',
        label: '1 · Encabezado',
        titulo: 'Encabezado y metadatos DIAN',
        rol: 'metadatos',
        text: encabezadoText,
      },
      {
        id: 'emisor',
        label: '2 · Emisor',
        titulo: 'Emisor / proveedor (quien vende)',
        rol: 'proveedor',
        text: String(emisorText || '').trim(),
      },
      {
        id: 'comprador',
        label: '3 · Comprador',
        titulo: 'Adquiriente / comprador (quien recibe)',
        rol: 'comprador',
        text: String(compradorText || '').trim(),
      },
      {
        id: 'detalle',
        label: '4 · Detalle y totales',
        titulo: 'Ítems, IVA, total y pago',
        rol: 'items_pago',
        text: detalleText,
      },
    ];

    if (pack.blocks && pack.blocks.length) {
      var pageH = 0;
      pack.blocks.some(function (b) {
        if (b.pageH) {
          pageH = b.pageH;
          return true;
        }
        return false;
      });
      if (pageH > 0) {
        partes.forEach(function (p) {
          var yMin = 0;
          var yMax = pageH;
          if (p.id === 'encabezado') yMax = pageH * 0.22;
          else if (p.id === 'emisor') {
            yMin = pageH * 0.18;
            yMax = pageH * 0.48;
          } else if (p.id === 'comprador') {
            yMin = pageH * 0.4;
            yMax = pageH * 0.62;
          } else {
            yMin = pageH * 0.55;
          }
          var blockTexts = [];
          pack.blocks.forEach(function (b) {
            if (b.page !== 1) return;
            var y = b.y || 0;
            if (y >= yMin && y <= yMax) {
              var t = String(b.text || '').trim();
              if (t.length >= 2) blockTexts.push(t);
            }
          });
          if (blockTexts.length && blockTexts.join(' ').length > (p.text || '').length * 0.6) {
            p.textBlocks = blockTexts.slice(0, 40);
            p.textPdf = blockTexts.join('\n');
          }
        });
      }
    }

    partes.forEach(function (p) {
      p.text = String(p.textPdf || p.text || '').trim();
      p.chars = p.text.length;
      p.vacia = p.chars < 12;
    });

    return partes;
  }

  /** Revisión a lupa de una de las 4 partes. */
  function feAnalizarParteALupa(parte, pack, fe, meta) {
    parte = parte || {};
    pack = pack || {};
    fe = fe || {};
    meta = meta || {};
    var text = String(parte.text || '');
    var miniPack = {
      text: text,
      textLen: text.length,
      blocks: pack.blocks || [],
      likelyScanned: pack.likelyScanned,
    };
    var feParcial = text.length >= 8 ? parseFeFromText(text) : {};
    var bolsaParcial = text.length >= 8 ? feExtraerBolsaCandidatos(miniPack, feParcial, meta) : null;
    if (bolsaParcial) feBolsaEtiquetarParte(bolsaParcial, parte.id);

    var hallazgos = [];
    var preguntas = [];
    var flat = text.replace(/\s+/g, ' ');

    function hall(clave, valor, ok) {
      hallazgos.push({ clave: clave, valor: valor || '', ok: !!ok });
    }

    if (parte.id === 'encabezado') {
      var tipo = /factura\s+electr[oó]nica\s+de\s+venta/i.test(flat)
        ? 'Factura electrónica de venta'
        : feParcial.tipoDocumento || '';
      hall('tipoDocumento', tipo, !!tipo);
      preguntas.push(
        feRazonarPregunta(
          '[Lupa parte 1] ¿Qué tipo de documento veo en el encabezado?',
          tipo || 'No identificado — revisar título DIAN',
          tipo ? 'plausible' : 'dudoso',
          null,
          tipo,
          { fase: 'lupa', patron: 'parte1:tipo-documento', parte: 'encabezado' }
        )
      );
      if (feParcial.numeroFactura) {
        hall('numeroFactura', feParcial.numeroFactura, true);
        preguntas.push(
          feRazonarPregunta(
            '[Lupa parte 1] ¿El número «' + feParcial.numeroFactura + '» es el de la factura?',
            'Sí — aparece en encabezado',
            'plausible',
            'numeroFactura',
            feParcial.numeroFactura,
            { fase: 'lupa', patron: 'parte1:numero-factura', parte: 'encabezado' }
          )
        );
      }
      if (feParcial.fecha) {
        hall('fecha', feParcial.fecha, true);
        preguntas.push(
          feRazonarPregunta(
            '[Lupa parte 1] ¿La fecha «' + feParcial.fecha + '» es la de emisión?',
            'Sí — patrón fecha en encabezado',
            'plausible',
            'fecha',
            feParcial.fecha,
            { fase: 'lupa', patron: 'parte1:fecha-emision', parte: 'encabezado' }
          )
        );
      }
      if (feParcial.cufe || (bolsaParcial && bolsaParcial.cufes && bolsaParcial.cufes[0])) {
        var cufeV = feParcial.cufe || (bolsaParcial.cufes[0] && bolsaParcial.cufes[0].valor);
        hall('cufe', cufeV, isValidCufeHex(cufeV));
        preguntas.push(
          feRazonarPregunta(
            '[Lupa parte 1] ¿Hay CUFE válido en el encabezado?',
            isValidCufeHex(cufeV) ? 'Sí — formato hex válido' : 'Dudoso — revisar QR o texto',
            isValidCufeHex(cufeV) ? 'plausible' : 'dudoso',
            'cufe',
            cufeV,
            { fase: 'lupa', patron: 'parte1:cufe', parte: 'encabezado' }
          )
        );
      }
      if (parte.vacia) {
        preguntas.push(
          feRazonarPregunta(
            '[Lupa parte 1] ¿El encabezado tiene texto legible?',
            'No — poca información; confiar en OCR o otras partes',
            'improbable',
            null,
            '',
            { fase: 'lupa', patron: 'parte1:vacio', parte: 'encabezado' }
          )
        );
      }
    }

    if (parte.id === 'emisor') {
      var encHdr = feExtraerProveedorEncabezadoComercial(text, pack);
      if (encHdr.razonSocial) {
        hall('razonSocial', encHdr.razonSocial, true);
        preguntas.push(
          feRazonarPregunta(
            '[Lupa parte 2] En el encabezado (antes de «Cliente») veo al proveedor «' +
              encHdr.razonSocial.slice(0, 45) +
              '» — ¿es quien vende?',
            'Sí — layout comercial ferretería/POS',
            'plausible',
            'razonSocial',
            encHdr.razonSocial,
            { fase: 'lupa', patron: 'parte2:encabezado-comercial', parte: 'emisor' }
          )
        );
        if (!feParcial.razonSocial) feParcial.razonSocial = encHdr.razonSocial;
      }
      var nitEtq = feExtractNitEmisorEtiquetado(text) || encHdr.nitEmisor;
      if (nitEtq) hall('nitEmisor', nitEtq, true);
      var nomE = '';
      if (!encHdr.razonSocial && (feParcial.razonSocial || (bolsaParcial && bolsaParcial.nombres && bolsaParcial.nombres[0]))) {
        nomE = feCleanRazonSocialEmisor(feParcial.razonSocial || bolsaParcial.nombres[0].valor);
      }
      if (nomE && !feEsDatoComprador(nomE, feParcial) && !feIsRepresentanteGarbage(nomE)) {
        hall('razonSocial', nomE, !!nomE);
        preguntas.push(
          feRazonarPregunta(
            '[Lupa parte 2] En zona emisor, ¿«' + nomE.slice(0, 45) + '» es quien vende?',
            nomE ? 'Sí — nombre en bloque emisor' : 'No legible',
            nomE ? 'plausible' : 'improbable',
            'razonSocial',
            nomE,
            { fase: 'lupa', patron: 'parte2:razon-social-emisor', parte: 'emisor' }
          )
        );
      }
      if (nitEtq) {
        preguntas.push(
          feRazonarPregunta(
            '[Lupa parte 2] ¿El NIT «' + nitEtq + '» está etiquetado como del emisor?',
            'Sí — «Nit del Emisor»',
            'plausible',
            'nitEmisor',
            nitEtq,
            { fase: 'lupa', patron: 'parte2:nit-etiqueta', parte: 'emisor' }
          )
        );
      }
      if (feParcial.telefonoEmisor) hall('telefono', feParcial.telefonoEmisor, true);
      if (feParcial.emailEmisor) hall('email', feParcial.emailEmisor, true);
      if (feParcial.direccionEmisor) {
        var dirE = feCleanDireccion(feParcial.direccionEmisor);
        hall('direccion', dirE, feLooksLikeColAddress(dirE));
        preguntas.push(
          feRazonarPregunta(
            '[Lupa parte 2] ¿La dirección del emisor es «' + dirE.slice(0, 40) + '»?',
            feLooksLikeColAddress(dirE) ? 'Sí — formato colombiano' : 'Dudosa',
            feLooksLikeColAddress(dirE) ? 'plausible' : 'dudoso',
            'direccionEmisor',
            dirE,
            { fase: 'lupa', patron: 'parte2:direccion-emisor', parte: 'emisor' }
          )
        );
      }
      if (parte.vacia) {
        preguntas.push(
          feRazonarPregunta(
            '[Lupa parte 2] ¿Se lee la zona del emisor?',
            'No — usar bloques PDF u OCR del encabezado',
            'improbable',
            null,
            '',
            { fase: 'lupa', patron: 'parte2:vacio', parte: 'emisor' }
          )
        );
      }
    }

    if (parte.id === 'comprador') {
      var compNom = feExtractCompradorNombre(text, feParcial);
      if (compNom) {
        hall('nombreReceptor', compNom, true);
        var empresa = feGetEmpresaContext();
        var esMia =
          (empresa.nombre && !feNombresDifieren(compNom, empresa.displayNombre)) ||
          (empresa.nit && feParcial.nitReceptor && normNit(feParcial.nitReceptor) === empresa.nit);
        preguntas.push(
          feRazonarPregunta(
            '[Lupa parte 3] ¿A quién se factura? Veo «' + compNom.slice(0, 45) + '»',
            esMia ? 'Es mi negocio (sesión)' : 'Otro adquiriente — no es el proveedor',
            esMia ? 'plausible' : 'dudoso',
            null,
            compNom,
            { fase: 'lupa', patron: 'parte3:adquiriente', parte: 'comprador' }
          )
        );
      }
      if (feParcial.nitReceptor) hall('nitReceptor', feParcial.nitReceptor, true);
      if (parte.vacia) {
        preguntas.push(
          feRazonarPregunta(
            '[Lupa parte 3] ¿Hay bloque comprador legible?',
            'No — no mezclar datos del comprador con el proveedor',
            'dudoso',
            null,
            '',
            { fase: 'lupa', patron: 'parte3:vacio', parte: 'comprador' }
          )
        );
      }
    }

    if (parte.id === 'detalle') {
      var nLineas = (feParcial.lineas || []).length;
      if (nLineas) hall('lineas', nLineas + ' ítem(s)', true);
      if (feParcial.total) hall('total', String(feParcial.total), true);
      if (feParcial.subtotal) hall('subtotal', String(feParcial.subtotal), true);
      if (feParcial.totalIva) hall('iva', String(feParcial.totalIva), true);
      if (bolsaParcial && bolsaParcial.cuentas && bolsaParcial.cuentas.length) {
        hall('cuentas', bolsaParcial.cuentas.length + ' cuenta(s)', true);
      }
      var coherente =
        feParcial.total &&
        feParcial.subtotal &&
        feParcial.totalIva &&
        Math.abs(feParcial.total - (feParcial.subtotal + feParcial.totalIva)) < 2;
      if (feParcial.total && feParcial.subtotal) {
        preguntas.push(
          feRazonarPregunta(
            '[Lupa parte 4] ¿Subtotal + IVA cuadra con el total?',
            coherente
              ? 'Sí — ' + feParcial.subtotal + ' + ' + (feParcial.totalIva || 0) + ' ≈ ' + feParcial.total
              : 'No cuadra — revisar montos',
            coherente ? 'plausible' : 'dudoso',
            'total',
            String(feParcial.total),
            { fase: 'lupa', patron: 'parte4:coherencia-montos', parte: 'detalle' }
          )
        );
      }
      if (feParcial.formaPago) hall('formaPago', feParcial.formaPago, true);
      if (parte.vacia) {
        preguntas.push(
          feRazonarPregunta(
            '[Lupa parte 4] ¿Hay detalle de ítems o totales?',
            'No legible — total puede venir del encabezado',
            'dudoso',
            null,
            '',
            { fase: 'lupa', patron: 'parte4:vacio', parte: 'detalle' }
          )
        );
      }
    }

    var resumen =
      hallazgos.length +
      ' hallazgo(s)' +
      (parte.vacia ? ' · zona vacía' : '') +
      ' · ' +
      text.length +
      ' caracteres';

    return {
      parte: parte,
      feParcial: feParcial,
      bolsaParcial: bolsaParcial,
      hallazgos: hallazgos,
      preguntas: preguntas,
      resumen: resumen,
    };
  }

  /** Unifica las 4 revisiones en un solo fe + bolsa enriquecida. */
  function feUnificarCuatroPartes(analisisPartes, feBase) {
    feBase = feBase || {};
    var fe = Object.assign({}, feBase);
    var bolsa = null;
    var preguntasLupa = [];
    var partesResumen = [];
    var mapFe = {
      encabezado: ['numeroFactura', 'fecha', 'fechaVencimiento', 'cufe', 'tipoDocumento', 'resolucionDian'],
      emisor: [
        'razonSocial',
        'nitEmisor',
        'telefonoEmisor',
        'emailEmisor',
        'direccionEmisor',
        'representanteEmisor',
        'nombreComercialEmisor',
        'ciudadEmisor',
        'departamentoEmisor',
      ],
      comprador: ['nombreReceptor', 'nitReceptor'],
      detalle: ['subtotal', 'totalIva', 'total', 'totalDescuentos', 'formaPago', 'lineas', 'notas'],
    };

    analisisPartes.forEach(function (ap) {
      partesResumen.push({
        id: ap.parte.id,
        label: ap.parte.label,
        titulo: ap.parte.titulo,
        resumen: ap.resumen,
        hallazgos: ap.hallazgos,
        chars: ap.parte.chars,
        vacia: ap.parte.vacia,
        nPreguntas: (ap.preguntas || []).length,
      });
      preguntasLupa = preguntasLupa.concat(ap.preguntas || []);
      if (ap.bolsaParcial) {
        bolsa = bolsa ? feBolsaFusionar(bolsa, ap.bolsaParcial) : ap.bolsaParcial;
      }
      var keys = mapFe[ap.parte.id] || [];
      var fp = ap.feParcial || {};
      keys.forEach(function (k) {
        var v = fp[k];
        if (v == null || v === '' || v === 0) return;
        if (k === 'lineas' && (!v.length || (fe.lineas && fe.lineas.length))) return;
        if (!fe[k] || (k === 'nitEmisor' && ap.parte.id === 'emisor')) fe[k] = v;
        else if (k === 'razonSocial' && ap.parte.id === 'emisor' && !fe.razonSocial) fe[k] = v;
        else if (
          k === 'razonSocial' &&
          ap.parte.id === 'emisor' &&
          fe.razonSocial &&
          feEsDatoComprador(fe.razonSocial, fe) &&
          !feEsDatoComprador(v, fe)
        ) {
          fe[k] = v;
        }
        else if (k === 'direccionEmisor' && ap.parte.id === 'emisor' && feEsTextoFormaPago(fe.direccionEmisor) && v) {
          fe[k] = v;
        }
        else if (k === 'total' && !fe.total) fe[k] = v;
        else if (k === 'numeroFactura' && !fe.numeroFactura) fe[k] = v;
        else if (k === 'cufe' && !fe.cufe) fe[k] = v;
      });
    });

    if (fe.direccionEmisor) fe.direccionEmisor = feCleanDireccion(fe.direccionEmisor);
    if (fe.razonSocial) fe.razonSocial = feCleanRazonSocialEmisor(fe.razonSocial);
    if (fe.razonSocial && mapFe.emisor.indexOf('razonSocial') >= 0) {
      fe._razonSocialAsignadoRazonamiento = true;
    }

    var preguntasUnificacion = [
      feRazonarPregunta(
        'Unifico 4 partes — ¿el proveedor sale solo de la parte 2 (emisor), no de la 3 (comprador)?',
        fe.razonSocial && !feEsDatoComprador(fe.razonSocial, fe)
          ? 'Sí — emisor separado del adquiriente'
          : 'Revisar — posible mezcla emisor/comprador',
        fe.razonSocial && !feEsDatoComprador(fe.razonSocial, fe) ? 'plausible' : 'improbable',
        null,
        fe.razonSocial || '',
        { fase: 'unificacion', patron: 'cuatro-partes:emisor-vs-comprador' }
      ),
      feRazonarPregunta(
        'Unifico 4 partes — ¿número/fecha (parte 1) y total (parte 4) son del mismo documento?',
        fe.numeroFactura && fe.total
          ? 'Sí — metadatos + total presentes'
          : fe.numeroFactura || fe.total
            ? 'Parcial — falta número o total'
            : 'No — datos incompletos',
        fe.numeroFactura && fe.total ? 'plausible' : fe.numeroFactura || fe.total ? 'dudoso' : 'improbable',
        null,
        [fe.numeroFactura, fe.total].filter(Boolean).join(' · '),
        { fase: 'unificacion', patron: 'cuatro-partes:metadatos-total' }
      ),
    ];

    return {
      fe: fe,
      bolsa: bolsa,
      partes: partesResumen,
      preguntasLupa: preguntasLupa,
      preguntasUnificacion: preguntasUnificacion,
    };
  }

  /** Orquestador: divide → lupa ×4 → unifica. */
  function feAnalisisDocumentoCuatroPartes(pack, fe, meta) {
    pack = pack || {};
    fe = fe || {};
    meta = meta || {};
    var text = String(pack.text || '');
    var partes = feDividirDocumentoCuatroPartes(pack, text);
    var analisisPartes = partes.map(function (parte) {
      return feAnalizarParteALupa(parte, pack, fe, meta);
    });
    var unificado = feUnificarCuatroPartes(analisisPartes, fe);
    return {
      partes: unificado.partes,
      fe: unificado.fe,
      bolsa: unificado.bolsa,
      preguntasLupa: unificado.preguntasLupa,
      preguntasUnificacion: unificado.preguntasUnificacion,
      analisisPartes: analisisPartes,
    };
  }

  function feValorCampoPresente(v) {
    if (v == null || v === '') return false;
    if (typeof v === 'number' && (isNaN(v) || v === 0)) return false;
    return true;
  }

  function feNombreEmisorProtegido(fe) {
    fe = fe || {};
    return !!(
      fe._razonSocialAsignadoRazonamiento ||
      fe._razonSocialFromBlocks ||
      fe._razonSocialFromFilename ||
      fe._razonSocialFromEncabezado ||
      fe._razonSocialFromBolsa ||
      fe._razonSocialFromTraining ||
      fe._razonSocialExplicit
    );
  }

  /** Aplica al fe los campos que el razonamiento ya eligió (evita perderlos en fusión/sanitize). */
  function feAplicarCamposDesdeAsignaciones(fe, asignaciones, bolsa, pack, meta) {
    fe = fe || {};
    asignaciones = asignaciones || {};
    pack = pack || {};
    meta = meta || {};
    var emisorText = feEmisorZoneText(pack.text || '', pack);

    function valAsig(asig) {
      if (!asig) return '';
      if (typeof asig === 'string') return asig;
      if (asig.valor != null && asig.valor !== '') return asig.valor;
      if (asig.d && asig.d.valor) return asig.d.valor;
      return '';
    }

    var campos = [
      ['razonSocial', feCleanRazonSocialEmisor],
      ['nitEmisor', null],
      ['direccionEmisor', feCleanDireccion],
      ['telefonoEmisor', null],
      ['emailEmisor', null],
      ['representanteEmisor', null],
    ];

    campos.forEach(function (row) {
      var key = row[0];
      var cleanFn = row[1];
      if (feValorCampoPresente(fe[key])) return;
      var raw = valAsig(asignaciones[key]);
      if (!feValorCampoPresente(raw)) return;
      fe[key] = cleanFn ? cleanFn(raw) : raw;
      if (key === 'razonSocial') fe._razonSocialAsignadoRazonamiento = true;
    });

    if (!fe.razonSocial && bolsa && bolsa.nombres && bolsa.nombres.length) {
      var bestVal = '';
      var bestScore = -999;
      (bolsa.nombres || []).forEach(function (n) {
        if (!n || n.tipo === 'etiqueta' || feEsSoloEtiquetaCampo(n.valor)) return;
        var sc = fePuntuarNombreEmisorCandidato(n, pack, fe, meta, emisorText, feCompradorZoneText(pack.text || ''));
        if (sc.score > bestScore && sc.val && !feEsDatoComprador(sc.val, fe)) {
          bestScore = sc.score;
          bestVal = sc.val;
        }
      });
      if (bestVal && bestScore > 6) {
        fe.razonSocial = bestVal;
        fe._razonSocialFromBolsa = true;
        fe._razonSocialAsignadoRazonamiento = true;
      }
    }

    if (!fe.razonSocial && meta.nombreArchivo) {
      var nomArch = feRazonSocialFromFilename(meta.nombreArchivo);
      if (nomArch && nomArch.length >= 4 && !feEsDatoComprador(nomArch, fe)) {
        fe.razonSocial = nomArch.toUpperCase();
        fe._razonSocialFromFilename = true;
        fe._razonSocialAsignadoRazonamiento = true;
      }
    }

    return fe;
  }

  function feRazonarPregunta(texto, respuesta, confianza, campo, valor, opts) {
    opts = opts || {};
    return {
      pregunta: texto,
      respuesta: respuesta,
      confianza: confianza,
      campo: campo || null,
      valor: valor != null ? valor : '',
      fase: opts.fase || 'asignacion',
      patron: opts.patron || null,
      comparaciones: opts.comparaciones || null,
    };
  }

  function fePuntuarNombreEmisorCandidato(cand, pack, fe, meta, emisorText, compradorText) {
    cand = cand || {};
    meta = meta || {};
    var val = feCleanRazonSocialEmisor(cand.valor);
    var score = 0;
    var notas = [];
    if (!val || feEsSoloEtiquetaCampo(val) || feIsRepresentanteGarbage(val)) {
      return { score: -99, val: val, notas: ['texto inválido o etiqueta'], cand: cand };
    }
    if (cand.fuente === 'bloque-pdf') {
      score += 32;
      notas.push('bloque PDF en zona emisor');
    }
    if (cand.fuente && /etiqueta/.test(cand.fuente) && !/representante/.test(cand.fuente)) {
      score += 28;
      notas.push('línea «Razón social» etiquetada');
    }
    if (cand.fuente === 'parser') score += 8;
    if (feLooksLikeEmpresaNombre(val)) {
      score += 16;
      notas.push('formato empresa');
    }
    if (feLooksLikePersonName(val, { allowSingle: false })) {
      score += 20;
      notas.push('persona natural (emisor habitual en FE)');
    }
    if (emisorText && feValorApareceEnTexto(val, emisorText)) {
      score += 24;
      notas.push('aparece en bloque emisor');
    }
    if (compradorText && feValorApareceEnTexto(val, compradorText) && !feValorApareceEnTexto(val, emisorText)) {
      score -= 55;
      notas.push('solo en bloque comprador');
    }
    if (feEsDatoComprador(val, fe)) {
      score -= 65;
      notas.push('coincide con adquiriente');
    }
    var fromFile = meta.nombreArchivo ? feRazonSocialFromFilename(meta.nombreArchivo) : '';
    if (fromFile && !feNombresDifieren(val, fromFile)) {
      score += 22;
      notas.push('coincide con nombre del archivo');
    }
    return { score: score, val: val, notas: notas, cand: cand };
  }

  /** Fase 0–1: contexto del documento, roles emisor/comprador y comparación de candidatos en bolsa. */
  function feRazonarContextoYComparaciones(bolsa, fe, pack, meta) {
    bolsa = bolsa || {};
    fe = fe || {};
    pack = pack || {};
    meta = meta || {};
    var preguntas = [];
    var empresa = feGetEmpresaContext();
    var text = String(pack.text || '');
    var emisorText = feEmisorZoneText(text, pack);
    var compradorText = feCompradorZoneText(text);
    var flat = text.replace(/\s+/g, ' ');

    if (meta.nombreArchivo) {
      var fromFile = feRazonSocialFromFilename(meta.nombreArchivo);
      preguntas.push(
        feRazonarPregunta(
          'El nombre del documento es «' +
            String(meta.nombreArchivo).replace(/^.*[/\\]/, '') +
            '» — ¿sugiere quién es el proveedor?',
          fromFile
            ? 'Sí — el patrón fecha_proveedor_hash da «' + fromFile + '»'
            : 'No — el archivo no trae pista clara del emisor',
          fromFile ? 'plausible' : 'dudoso',
          null,
          fromFile || '',
          { fase: 'documento', patron: 'archivo:fecha_slug_hash' }
        )
      );
    }

    var tipoDoc = /factura\s+electr[oó]nica\s+de\s+venta/i.test(flat)
      ? 'Factura electrónica de venta (DIAN)'
      : /factura\s+electr[oó]nica/i.test(flat)
        ? 'Factura electrónica'
        : /nota\s+(?:cr[eé]dito|d[eé]bito)/i.test(flat)
          ? 'Nota crédito/débito'
          : '';
    preguntas.push(
      feRazonarPregunta(
        '¿Qué tipo de documento es este?',
        tipoDoc || 'Documento tributario — revisar encabezado',
        tipoDoc ? 'plausible' : 'dudoso',
        null,
        tipoDoc,
        { fase: 'documento', patron: 'encabezado:tipo-factura-dian' }
      )
    );

    var hayEmisor = /\b(?:emisor|vendedor)\b/i.test(emisorText || text);
    preguntas.push(
      feRazonarPregunta(
        'En la factura, ¿veo la sección del emisor / vendedor?',
        hayEmisor ? 'Sí — hay bloque Emisor/Vendedor antes del comprador' : 'No claro — usar texto completo',
        hayEmisor ? 'plausible' : 'dudoso',
        null,
        '',
        { fase: 'lectura', patron: 'zona:emisor-antes-adquiriente' }
      )
    );

    var compradorNom = feExtractCompradorNombre(compradorText, fe);
    if (compradorNom && feEsSoloEtiquetaCampo(compradorNom)) compradorNom = '';
    if (compradorNom) {
      var esMiEmpresa =
        (empresa.nombre && !feNombresDifieren(compradorNom, empresa.displayNombre || empresa.nombre)) ||
        (empresa.nit && fe.nitReceptor && normNit(fe.nitReceptor) === empresa.nit);
      preguntas.push(
        feRazonarPregunta(
          'Veo que la factura se emite a «' +
            compradorNom.slice(0, 55) +
            (compradorNom.length > 55 ? '…' : '') +
            '» — ¿es mi negocio?',
          esMiEmpresa
            ? 'Sí — coincide con la empresa en sesión'
            : 'No — es otro adquiriente; el proveedor es quien emite',
          esMiEmpresa ? 'plausible' : 'dudoso',
          null,
          compradorNom,
          { fase: 'roles', patron: 'comparar:adquiriente-vs-empresa-sesion' }
        )
      );
    }

    var nombresBolsa = (bolsa.nombres || []).filter(function (n) {
      return n.tipo !== 'etiqueta' && !feEsSoloEtiquetaCampo(n.valor);
    });
    if (nombresBolsa.length) {
      var comps = nombresBolsa.slice(0, 6).map(function (n) {
        var sc = fePuntuarNombreEmisorCandidato(n, pack, fe, meta, emisorText, compradorText);
        return {
          valor: sc.val,
          score: sc.score,
          fuente: (n.fuente || '') + (n.tipo ? '/' + n.tipo : ''),
          nota: sc.notas[0] || '',
        };
      });
      comps.sort(function (a, b) {
        return b.score - a.score;
      });
      var top = comps[0];
      var detalle = comps
        .map(function (c) {
          return '«' + (c.valor || '').slice(0, 40) + '» (' + c.score + ' pts, ' + (c.nota || c.fuente) + ')';
        })
        .join(' · ');
      preguntas.push(
        feRazonarPregunta(
          'En el PDF encontré ' +
            nombresBolsa.length +
            ' nombre(s) — ¿cuál es el comerciante emisor y cuál el comprador?',
          top && top.score > 10
            ? 'Mejor candidato emisor: «' + top.valor + '» — ' + (top.nota || 'mayor puntaje')
            : 'Ninguno destaca — buscar etiqueta Razón social en zona emisor',
          top && top.score > 22 ? 'plausible' : top && top.score > 8 ? 'dudoso' : 'improbable',
          null,
          top ? top.valor : '',
          { fase: 'comparacion', patron: 'bolsa:nombres-vs-zona-emisor-comprador', comparaciones: comps }
        )
      );
    }

    (bolsa.nits || []).slice(0, 5).forEach(function (n, idx) {
      if (idx > 2) return;
      var esTel =
        n.fuente !== 'nit-emisor-etiqueta' && feNitCoincideTelefono(n.valor, bolsa.telefonos, n);
      var rol =
        n.fuente === 'nit-emisor-etiqueta' || n.zona === 'emisor' || n.fuente === 'texto-emisor'
          ? 'emisor'
          : n.zona === 'comprador'
            ? 'comprador'
            : 'mixto';
      preguntas.push(
        feRazonarPregunta(
          'El número «' +
            n.valor +
            '» — ¿qué es y con qué patrón lo analizo?',
          n.fuente === 'nit-emisor-etiqueta'
            ? 'NIT del emisor — etiqueta «Nit del Emisor» en PDF'
            : esTel
              ? 'Parece teléfono móvil colombiano (3xx), no NIT'
              : rol === 'emisor'
                ? 'NIT del emisor — patrón etiqueta/zona emisor'
                : rol === 'comprador'
                  ? 'NIT del comprador — descartar para proveedor'
                  : 'NIT suelto — contrastar con teléfono y zona',
          n.fuente === 'nit-emisor-etiqueta'
            ? 'plausible'
            : esTel
              ? 'improbable'
              : rol === 'emisor'
                ? 'plausible'
                : rol === 'comprador'
                  ? 'improbable'
                  : 'dudoso',
          null,
          n.valor,
          {
            fase: 'comparacion',
            patron:
              n.fuente === 'nit-emisor-etiqueta'
                ? 'nit:etiqueta-emisor'
                : esTel
                  ? 'nit-vs-telefono:movil-3xx'
                  : 'nit:zona-' + rol,
            comparaciones: [{ valor: n.valor, zona: rol, fuente: n.fuente }],
          }
        )
      );
    });

    (bolsa.direcciones || []).slice(0, 3).forEach(function (d) {
      var gen = feEsDireccionGenerica(d.valor);
      var enCom =
        compradorText && feValorApareceEnTexto(d.valor, compradorText) && !feValorApareceEnTexto(d.valor, emisorText);
      preguntas.push(
        feRazonarPregunta(
          'La dirección «' +
            String(d.valor).slice(0, 45) +
            (d.valor.length > 45 ? '…' : '') +
            '» — ¿de quién es?',
          gen
            ? 'Genérica (Calle 000) — suele ser placeholder del comprador'
            : enCom
              ? 'Parece del adquiriente — no asignar al emisor'
              : 'Candidata del emisor — formato dirección colombiana',
          gen || enCom ? 'improbable' : 'plausible',
          null,
          d.valor,
          {
            fase: 'comparacion',
            patron: gen ? 'direccion:generica-calle-000' : enCom ? 'direccion:zona-comprador' : 'direccion:colombiana-emisor',
          }
        )
      );
    });

    return preguntas;
  }

  /** Fase 2: preguntarse qué va en cada rol y asignar lo más lógico. */
  function feRazonarSobreBolsa(bolsa, fe, pack, meta) {
    fe = Object.assign({}, fe || {});
    bolsa = bolsa || {};
    pack = pack || {};
    meta = meta || {};
    var preguntas = feRazonarContextoYComparaciones(bolsa, fe, pack, meta);
    var asignaciones = {};
    var empresa = feGetEmpresaContext();
    var emisorText = feEmisorZoneText(pack.text || '', pack);
    var compradorText = feCompradorZoneText(pack.text || '');

    var nitEtq = null;
    for (var nei = 0; nei < (bolsa.nits || []).length; nei++) {
      if (bolsa.nits[nei].fuente === 'nit-emisor-etiqueta') {
        nitEtq = bolsa.nits[nei];
        break;
      }
    }
    if (!nitEtq) {
      var nitEtqVal = feExtractNitEmisorEtiquetado(emisorText);
      if (nitEtqVal) nitEtq = { valor: nitEtqVal, fuente: 'nit-emisor-etiqueta', zona: 'emisor' };
    }

    var nitScores = [];
    (bolsa.nits || []).forEach(function (n) {
      var nNorm = normNit(n.valor);
      var score = 10;
      var notas = [];
      if (n.fuente === 'nit-emisor-etiqueta') {
        score += 55;
        notas.push('etiqueta «Nit del Emisor»');
      }
      if (n.zona === 'emisor' || n.fuente === 'texto-emisor') {
        score += 28;
        notas.push('en zona emisor');
      }
      if (n.zona === 'comprador' || n.fuente === 'texto-comprador') {
        score -= 50;
        notas.push('en zona comprador');
      }
      if (nNorm.length >= 6 && nNorm.length <= 11) {
        score += 12;
        notas.push('longitud ID válida');
      }
      if (feNitCoincideTelefono(n.valor, bolsa.telefonos, n)) {
        score -= 85;
        notas.push('coincide con teléfono — no es NIT');
      }
      if (fe.telefonoEmisor && feNitCoincideTelefono(n.valor, [{ valor: fe.telefonoEmisor }], n)) {
        score -= 85;
        notas.push('es el teléfono del emisor');
      }
      if (empresa.nit && nNorm === empresa.nit) {
        score -= 55;
        notas.push('NIT de su empresa (comprador)');
      }
      if (fe.nitReceptor && normNit(fe.nitReceptor) === nNorm) {
        score -= 50;
        notas.push('NIT del adquiriente');
      }
      if (compradorText && feValorApareceEnTexto(n.valor, compradorText) && !feValorApareceEnTexto(n.valor, emisorText)) {
        score -= 45;
        notas.push('solo aparece en bloque comprador');
      }
      if (emisorText && feValorApareceEnTexto(n.valor, emisorText)) {
        score += 18;
        notas.push('aparece en bloque emisor');
      }
      nitScores.push({ valor: n.valor, score: score, notas: notas, fuente: n.fuente });
    });
    nitScores.sort(function (a, b) {
      return b.score - a.score;
    });

    if (nitEtq && nitEtq.valor) {
      fe.nitEmisor = nitEtq.valor;
      fe._nitFromEtiqueta = true;
      asignaciones.nitEmisor = nitEtq;
      preguntas.push(
        feRazonarPregunta(
          '¿El NIT «' + nitEtq.valor + '» es del proveedor (emisor)?',
          'Sí — leído de la etiqueta «Nit del Emisor»',
          'plausible',
          'nitEmisor',
          nitEtq.valor,
          { fase: 'asignacion', patron: 'nit:etiqueta-emisor-prioritario' }
        )
      );
    } else if (nitScores[0] && nitScores[0].score > 22) {
      var nBest = nitScores[0];
      var nBestMeta = null;
      for (var nbi = 0; nbi < (bolsa.nits || []).length; nbi++) {
        if (bolsa.nits[nbi].valor === nBest.valor) {
          nBestMeta = bolsa.nits[nbi];
          break;
        }
      }
      var nitOk = !feNitCoincideTelefono(nBest.valor, bolsa.telefonos, nBestMeta || nBest);
      preguntas.push(
        feRazonarPregunta(
          '¿El NIT «' + nBest.valor + '» es del proveedor (emisor)?',
          nitOk
            ? 'Sí — ' + (nBest.notas[0] || 'mejor candidato')
            : 'No — parece teléfono, no NIT',
          nitOk ? feVeredictoDesdeScore(Math.min(100, nBest.score + 30)) : 'improbable',
          'nitEmisor',
          nitOk ? nBest.valor : '',
          { fase: 'asignacion', patron: nitOk ? 'nit:emisor-etiqueta-zona' : 'nit:confundido-con-telefono' }
        )
      );
      if (nitOk) {
        fe.nitEmisor = nBest.valor;
        asignaciones.nitEmisor = nBest;
      } else if (fe.nitEmisor && feNitCoincideTelefono(fe.nitEmisor, bolsa.telefonos, { fuente: fe._nitFromEtiqueta ? 'nit-emisor-etiqueta' : '' })) {
        fe.nitEmisor = '';
      }
    }

    var blockNom = pack.blocks && pack.blocks.length ? feBlocksEmisorNombre(pack.blocks) : '';
    var nombreScores = [];
    if (blockNom) {
      nombreScores.push(fePuntuarNombreEmisorCandidato({ valor: blockNom, fuente: 'bloque-pdf' }, pack, fe, meta, emisorText, compradorText));
    }
    (bolsa.nombres || []).forEach(function (n) {
      if (n.tipo === 'etiqueta' || feEsSoloEtiquetaCampo(n.valor)) return;
      nombreScores.push(fePuntuarNombreEmisorCandidato(n, pack, fe, meta, emisorText, compradorText));
    });
    if (meta.nombreArchivo) {
      var nomArch = feRazonSocialFromFilename(meta.nombreArchivo);
      if (nomArch) {
        nombreScores.push(
          fePuntuarNombreEmisorCandidato({ valor: nomArch, fuente: 'archivo' }, pack, fe, meta, emisorText, compradorText)
        );
      }
    }
    nombreScores.sort(function (a, b) {
      return b.score - a.score;
    });
    var nBest = nombreScores[0];
    if (nBest && nBest.score > 6 && nBest.val) {
      var rsClean = nBest.val;
      var empOk = !feEsDatoComprador(rsClean, fe) && !feIsRepresentanteGarbage(rsClean);
      var tipoNom = feLooksLikeEmpresaNombre(rsClean)
        ? 'empresa'
        : feLooksLikePersonName(rsClean, { allowSingle: false })
          ? 'persona natural'
          : 'nombre';
      preguntas.push(
        feRazonarPregunta(
          'En la factura miro «' +
            rsClean.slice(0, 50) +
            (rsClean.length > 50 ? '…' : '') +
            '» — ¿es el comerciante que emite (no el comprador)?',
          empOk
            ? 'Sí — ' + tipoNom + ': ' + (nBest.notas[0] || 'mejor candidato')
            : 'No — parece adquiriente o texto inválido',
          empOk ? feVeredictoDesdeScore(Math.min(100, nBest.score + 35)) : 'improbable',
          'razonSocial',
          empOk ? rsClean : '',
          {
            fase: 'asignacion',
            patron: 'nombre:emisor-vs-comprador',
            comparaciones: nombreScores.slice(0, 4).map(function (s) {
              return { valor: s.val, score: s.score, nota: (s.notas || [])[0] };
            }),
          }
        )
      );
      if (empOk && (!feNombreEmisorProtegido(fe) || !fe.razonSocial || feEsDatoComprador(fe.razonSocial, fe))) {
        fe.razonSocial = rsClean;
        fe._razonSocialAsignadoRazonamiento = true;
        asignaciones.razonSocial = nBest.cand || { valor: rsClean, fuente: nBest.cand && nBest.cand.fuente };
      }
    } else {
      preguntas.push(
        feRazonarPregunta(
          '¿Hay un nombre de proveedor legible en la factura?',
          'No — ningún candidato supera el umbral; revise manualmente o use el nombre del archivo',
          'improbable',
          'razonSocial',
          '',
          { fase: 'asignacion', patron: 'nombre:sin-candidato-fiable' }
        )
      );
    }

    var perCands = (bolsa.nombres || []).filter(function (n) {
      if (n.tipo === 'etiqueta' || feEsSoloEtiquetaCampo(n.valor)) return false;
      if (!feLooksLikePersonName(n.valor, { allowSingle: true })) return false;
      if (feLooksLikeEmpresaNombre(n.valor)) return false;
      if (!feNombresDifieren(n.valor, fe.razonSocial)) return false;
      if (feScoreRepresentanteCandidate(n.valor, { allowSingle: true }) < 12) return false;
      return n.tipo === 'persona';
    });
    if (perCands[0]) {
      var pBest = perCands[0];
      var repVal = feSanitizeRepresentanteEmisor(pBest.valor, { allowSingle: true });
      if (repVal) {
        preguntas.push(
          feRazonarPregunta(
            '¿«' + repVal + '» es el representante legal del emisor?',
            'Sí — nombre de persona distinto a la empresa',
            'plausible',
            'representanteEmisor',
            repVal,
            { fase: 'asignacion', patron: 'persona:representante-legal' }
          )
        );
        fe.representanteEmisor = repVal;
        asignaciones.representanteEmisor = pBest;
      } else {
        preguntas.push(
          feRazonarPregunta(
            '¿Hay representante legal legible en el bloque emisor?',
            'No — solo etiquetas o texto inválido',
            'improbable',
            'representanteEmisor',
            '',
            { fase: 'asignacion', patron: 'persona:sin-representante' }
          )
        );
      }
    }

    var dirScores = [];
    (bolsa.direcciones || []).forEach(function (d) {
      var score = feLooksLikeColAddress(d.valor) ? 18 : 0;
      if (feEsTextoFormaPago(d.valor)) score -= 90;
      if (feEsDireccionGenerica(d.valor)) {
        score -= 60;
      }
      if (feEsDatoComprador(d.valor, fe)) score -= 45;
      if (compradorText && feValorApareceEnTexto(d.valor, compradorText) && !feValorApareceEnTexto(d.valor, emisorText)) {
        score -= 55;
      }
      if (emisorText && feValorApareceEnTexto(d.valor, emisorText)) score += 28;
      if (d.fuente === 'bloque-pdf') score += 15;
      dirScores.push({ d: d, score: score });
    });
    dirScores.sort(function (a, b) {
      return b.score - a.score;
    });
    if (dirScores[0] && dirScores[0].score > 18) {
      var dBest = dirScores[0].d;
      var puedeDir =
        !fe.direccionEmisor ||
        feEsTextoFormaPago(fe.direccionEmisor) ||
        feEsDireccionGenerica(fe.direccionEmisor) ||
        feIsRepresentanteGarbage(fe.direccionEmisor);
      preguntas.push(
        feRazonarPregunta(
          '¿La dirección «' +
            dBest.valor.slice(0, 50) +
            (dBest.valor.length > 50 ? '…' : '') +
            '» es del emisor (no del comprador)?',
          puedeDir ? 'Sí — en zona emisor, no genérica' : 'No — ya hay dirección del encabezado',
          puedeDir ? 'plausible' : 'dudoso',
          'direccionEmisor',
          puedeDir ? dBest.valor : fe.direccionEmisor || '',
          { fase: 'asignacion', patron: 'direccion:zona-emisor' }
        )
      );
      if (puedeDir) {
        fe.direccionEmisor = feCleanDireccion(dBest.valor);
        asignaciones.direccionEmisor = dBest;
      }
    } else if (fe.direccionEmisor && (feEsDireccionGenerica(fe.direccionEmisor) || feEsDatoComprador(fe.direccionEmisor, fe) || feEsTextoFormaPago(fe.direccionEmisor))) {
      fe.direccionEmisor = '';
      preguntas.push(
        feRazonarPregunta(
          '¿La dirección detectada es del emisor?',
          'No — «Calle 000» u otra dirección del comprador descartada',
          'improbable',
          'direccionEmisor',
          ''
        )
      );
    }

    if ((bolsa.telefonos || []).length) {
      var telScores = bolsa.telefonos.map(function (t) {
        var score = 10;
        if (emisorText && feValorApareceEnTexto(t.valor, emisorText)) score += 20;
        if (compradorText && feValorApareceEnTexto(t.valor, compradorText) && !feValorApareceEnTexto(t.valor, emisorText)) {
          score -= 25;
        }
        return { t: t, score: score };
      });
      telScores.sort(function (a, b) {
        return b.score - a.score;
      });
      if (telScores[0] && telScores[0].score > 5) {
        fe.telefonoEmisor = telScores[0].t.valor;
        asignaciones.telefonoEmisor = telScores[0].t;
        preguntas.push(
          feRazonarPregunta(
            '¿El teléfono «' + fe.telefonoEmisor + '» es del emisor?',
            'Sí — en zona proveedor',
            'plausible',
            'telefonoEmisor',
            fe.telefonoEmisor
          )
        );
      }
    }

    if ((bolsa.emails || []).length) {
      var mails = bolsa.emails.slice().sort(function (a, b) {
        return (b.len || b.valor.length) - (a.len || a.valor.length);
      });
      var mailPick = mails[0];
      for (var mi = 0; mi < mails.length; mi++) {
        if (emisorText && feValorApareceEnTexto(mails[mi].valor, emisorText)) {
          mailPick = mails[mi];
          break;
        }
      }
      if (mailPick && !feIsGenericEmail(mailPick.valor)) {
        fe.emailEmisor = mailPick.valor;
        asignaciones.emailEmisor = mailPick;
        preguntas.push(
          feRazonarPregunta(
            '¿El correo «' + fe.emailEmisor + '» es del emisor?',
            /\.com$/i.test(fe.emailEmisor) ? 'Sí — correo completo' : 'Dudoso — dominio incompleto',
            /\.com$/i.test(fe.emailEmisor) ? 'plausible' : 'dudoso',
            'emailEmisor',
            fe.emailEmisor
          )
        );
      }
    }

    if ((bolsa.cuentas || []).length) {
      fe._cuentasDetectadas = bolsa.cuentas.map(function (c) {
        return c.valor;
      });
      preguntas.push(
        feRazonarPregunta(
          'Se detectaron ' + bolsa.cuentas.length + ' cuenta(s) bancaria(s). ¿Son del proveedor?',
          'Información de pago — no se mezcla con nombre/NIT',
          'plausible',
          null,
          bolsa.cuentas
            .map(function (c) {
              return c.valor;
            })
            .join(', ')
        )
      );
    }

    if ((bolsa.cufes || []).length && !fe.cufe) {
      fe.cufe = bolsa.cufes[0].valor;
      preguntas.push(
        feRazonarPregunta(
          '¿El CUFE detectado pertenece a esta factura?',
          isValidCufeHex(fe.cufe) ? 'Sí — formato válido' : 'Dudoso',
          isValidCufeHex(fe.cufe) ? 'plausible' : 'dudoso',
          'cufe',
          fe.cufe
        )
      );
    }

    if ((bolsa.montos || []).length && !fe.total) {
      var mNum = Number(String(bolsa.montos[0].valor).replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.'));
      if (!isNaN(mNum) && mNum > 0) {
        fe.total = mNum;
        preguntas.push(
          feRazonarPregunta(
            '¿El total de la factura es $' + mNum + '?',
            'Tomado del primer monto etiquetado',
            'dudoso',
            'total',
            String(mNum)
          )
        );
      }
    }

    fe = feAutoFixIntercambioNombreRep(fe);

    var razonOk = 0;
    preguntas.forEach(function (p) {
      if (p.confianza === 'plausible') razonOk++;
    });
    var coherenciaRazon = preguntas.length ? Math.round((razonOk / preguntas.length) * 100) : 0;

    return {
      fe: fe,
      preguntas: preguntas,
      asignaciones: asignaciones,
      coherencia: coherenciaRazon,
      fases: ['documento', 'lectura', 'roles', 'comparacion', 'asignacion'],
    };
  }

  function feVeredictoDesdeScore(score) {
    if (score >= 62) return 'plausible';
    if (score >= 38) return 'dudoso';
    return 'improbable';
  }

  function feAutoFixIntercambioNombreRep(fe) {
    fe = fe || {};
    if (!fe.razonSocial || !fe.representanteEmisor) return fe;
    var rs = String(fe.razonSocial).trim();
    var rep = String(fe.representanteEmisor).trim();
    if (
      feLooksLikeEmpresaNombre(rep) &&
      feLooksLikePersonName(rs, { allowSingle: false }) &&
      !feLooksLikeEmpresaNombre(rs)
    ) {
      fe.razonSocial = feCleanNombreCampo(rep);
      fe.representanteEmisor = feSanitizeRepresentanteEmisor(rs, { allowSingle: true });
      fe._autoFixIntercambio = true;
    }
    return fe;
  }

  function feEvalCampoRazonSocial(fe, pack, meta) {
    var val = feCleanRazonSocialEmisor((fe && fe.razonSocial) || '');
    var motivos = [];
    var score = 50;
    if (!val) return { valor: '', rol: 'empresa', veredicto: 'improbable', score: 0, motivos: ['Vacío'] };

    if (feLooksLikeEmpresaNombre(val)) {
      score += 28;
      motivos.push('Parece razón social / nombre comercial');
    }
    if (feIsRepresentanteGarbage(val)) {
      score -= 45;
      motivos.push('Texto típico de otra sección (pago, letras, etiquetas)');
    }
    if (feLooksLikePersonName(val, { allowSingle: false }) && !/S\.?A\.?S|LTDA|S\.?A\.|E\.U\./i.test(val)) {
      var enEmisor =
        (pack && pack.text && feValorApareceEnTexto(val, feEmisorZoneText(pack.text))) ||
        fe._razonSocialFromBlocks ||
        fe._razonSocialExplicit ||
        fe._razonSocialAsignadoRazonamiento;
      if (enEmisor) {
        score += 28;
        motivos.push('Persona natural como emisor (común en factura electrónica)');
      } else {
        score -= 8;
        motivos.push('Parece persona — verificar que sea quien emite');
      }
    }
    if (fe.representanteEmisor && !feNombresDifieren(val, fe.representanteEmisor) && val.length < 40) {
      score -= 18;
      motivos.push('Igual al representante — posible duplicado');
    }
    if (feEsDatoComprador(val, fe)) {
      score -= 35;
      motivos.push('Coincide con comprador / su empresa');
    }
    var fromFile = meta && meta.nombreArchivo ? feRazonSocialFromFilename(meta.nombreArchivo) : '';
    if (fromFile && !feNombresDifieren(val, fromFile)) {
      score += 18;
      motivos.push('Coincide con proveedor en nombre del archivo');
    }
    var trainHit = feTrainingResolveVendor(pack && pack.text, meta, fe);
    if (trainHit && trainHit.vendor && trainHit.score >= 42) {
      score += 12;
      motivos.push('Reconocido en catálogo entrenado');
    }
    score = Math.max(0, Math.min(100, score));
    return { valor: val, rol: 'empresa', veredicto: feVeredictoDesdeScore(score), score: score, motivos: motivos };
  }

  function feEvalCampoRepresentante(fe, pack, meta) {
    var val = String((fe && fe.representanteEmisor) || '').trim();
    var motivos = [];
    var score = 50;
    if (!val) return { valor: '', rol: 'representante', veredicto: 'improbable', score: 0, motivos: ['Vacío'] };

    if (feLooksLikePersonName(val, { allowSingle: true })) {
      score += 30;
      motivos.push('Parece nombre de persona');
    } else {
      score -= 25;
      motivos.push('No encaja como nombre de persona');
    }
    if (feIsRepresentanteGarbage(val)) {
      score -= 50;
      motivos.push('Basura de factura (montos, pagos, etiquetas)');
    }
    if (feLooksLikeEmpresaNombre(val)) {
      score -= 28;
      motivos.push('Parece razón social, no representante');
    }
    if (fe.razonSocial && !feNombresDifieren(val, fe.razonSocial) && val.length < 40) {
      score -= 20;
      motivos.push('Duplicado de razón social');
    }
    if (feEsDatoComprador(val, fe)) {
      score -= 30;
      motivos.push('Coincide con comprador');
    }
    if (fe._representanteDesdeCatalogo) {
      score += 15;
      motivos.push('Tomado del catálogo de proveedores');
    }
    score = Math.max(0, Math.min(100, score));
    return { valor: val, rol: 'representante', veredicto: feVeredictoDesdeScore(score), score: score, motivos: motivos };
  }

  function feEvalCampoNit(fe) {
    var val = String((fe && fe.nitEmisor) || '').trim();
    var motivos = [];
    var score = 40;
    if (!val) return { valor: '', rol: 'nit', veredicto: 'improbable', score: 0, motivos: ['Vacío'] };
    var n = normNit(val);
    if (feNitCoincideTelefono(val, fe.telefonoEmisor ? [{ valor: fe.telefonoEmisor }] : [], {
      fuente: fe._nitFromEtiqueta ? 'nit-emisor-etiqueta' : '',
    })) {
      score -= 70;
      motivos.push('Coincide con teléfono — no es NIT');
    } else if (n.length >= 6 && n.length <= 11) {
      score += 35;
      motivos.push('Formato de identificación válido');
    } else {
      score -= 25;
      motivos.push('Longitud de NIT inusual');
    }
    if (feEsDatoComprador(val, fe)) {
      score -= 40;
      motivos.push('Es el NIT del comprador, no del emisor');
    }
    if (fe.nitReceptor && normNit(fe.nitReceptor) === n) {
      score -= 35;
      motivos.push('Igual al NIT receptor');
    }
    score = Math.max(0, Math.min(100, score));
    return { valor: val, rol: 'nit', veredicto: feVeredictoDesdeScore(score), score: score, motivos: motivos };
  }

  function feEvalCampoDireccion(fe) {
    var val = String((fe && fe.direccionEmisor) || '').trim();
    var motivos = [];
    var score = 45;
    if (!val) return { valor: '', rol: 'direccion', veredicto: 'improbable', score: 0, motivos: ['Vacío'] };
    if (feLooksLikeColAddress(val)) {
      score += 32;
      motivos.push('Formato de dirección colombiana');
    }
    if (feEsDireccionGenerica(val)) {
      score -= 55;
      motivos.push('Dirección genérica (ej. Calle 000) — suele ser del comprador');
    }
    if (feEsTextoFormaPago(val)) {
      score -= 70;
      motivos.push('Parece forma de pago / cuota, no dirección');
    }
    if (feIsRepresentanteGarbage(val)) {
      score -= 40;
      motivos.push('No parece dirección');
    }
    if (/@|https?:|factura|total|nit\b/i.test(val)) {
      score -= 30;
      motivos.push('Contiene texto ajeno a dirección');
    }
    score = Math.max(0, Math.min(100, score));
    return { valor: val, rol: 'direccion', veredicto: feVeredictoDesdeScore(score), score: score, motivos: motivos };
  }

  function feEvalCampoSimple(fe, key, rol, testFn, okMsg) {
    var val = fe && fe[key];
    if (val == null || val === '' || val === 0) {
      return { valor: val || '', rol: rol, veredicto: 'improbable', score: 0, motivos: ['Vacío'] };
    }
    var ok = testFn(val, fe);
    return {
      valor: val,
      rol: rol,
      veredicto: ok ? 'plausible' : 'dudoso',
      score: ok ? 72 : 42,
      motivos: ok ? [okMsg] : ['Formato poco habitual'],
    };
  }

  /**
   * Autoevaluación: ¿este valor es lógico para ese rol? (empresa, representante, NIT…)
   */
  function feAutoEvaluarExtraccion(fe, pack, meta) {
    fe = fe || {};
    pack = pack || {};
    meta = meta || {};

    var campos = {
      razonSocial: feEvalCampoRazonSocial(fe, pack, meta),
      representanteEmisor: feEvalCampoRepresentante(fe, pack, meta),
      nitEmisor: feEvalCampoNit(fe),
      direccionEmisor: feEvalCampoDireccion(fe),
      telefonoEmisor: feEvalCampoSimple(
        fe,
        'telefonoEmisor',
        'telefono',
        function (v) {
          return /\d{7,}/.test(String(v).replace(/\D/g, ''));
        },
        'Teléfono con dígitos suficientes'
      ),
      emailEmisor: feEvalCampoSimple(
        fe,
        'emailEmisor',
        'email',
        function (v) {
          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v));
        },
        'Correo con formato válido'
      ),
    };

    var alertas = [];
    if (fe._autoFixIntercambio) {
      alertas.push({
        tipo: 'correccion',
        mensaje: 'Se intercambiaron razón social y representante (estaban invertidos).',
      });
    }
    if (
      campos.razonSocial.veredicto !== 'improbable' &&
      campos.representanteEmisor.veredicto !== 'improbable' &&
      campos.razonSocial.veredicto === 'dudoso' &&
      campos.representanteEmisor.veredicto === 'dudoso'
    ) {
      alertas.push({
        tipo: 'coherencia',
        mensaje: 'Empresa y representante son dudosos — conviene revisar manualmente.',
      });
    }
    if (campos.razonSocial.veredicto === 'improbable' && fe.razonSocial) {
      alertas.push({ tipo: 'empresa', mensaje: 'La razón social detectada no parece confiable.' });
    }
    if (campos.representanteEmisor.veredicto === 'improbable' && fe.representanteEmisor) {
      alertas.push({ tipo: 'representante', mensaje: 'El representante detectado no parece un nombre válido.' });
    }

    var sum = 0;
    var n = 0;
    Object.keys(campos).forEach(function (k) {
      if (!campos[k].valor) return;
      sum += campos[k].score;
      n++;
    });
    var coherencia = n ? Math.round(sum / n) : 0;

    var resumen =
      coherencia >= 65
        ? 'Lectura coherente — los campos encajan con su rol.'
        : coherencia >= 45
          ? 'Lectura mixta — revise empresa y representante.'
          : 'Lectura poco confiable — corrija manualmente.';

    return {
      campos: campos,
      alertas: alertas,
      coherencia: coherencia,
      resumen: resumen,
      evaluadoAt: new Date().toISOString(),
    };
  }

  function feAutoAplicarEvaluacion(fe, ev) {
    fe = fe || {};
    ev = ev || {};
    if (!ev.campos) return fe;
    ['razonSocial', 'representanteEmisor', 'direccionEmisor'].forEach(function (k) {
      var c = ev.campos[k];
      if (k === 'razonSocial' && fe[k] && feEsDatoComprador(fe[k], fe)) {
        fe['_rechazadoAuto_' + k] = fe[k];
        if (!fe.nombreReceptor) fe.nombreReceptor = fe[k];
        fe[k] = '';
        return;
      }
      if (k === 'direccionEmisor' && fe[k] && feEsTextoFormaPago(fe[k])) {
        fe['_rechazadoAuto_' + k] = fe[k];
        fe[k] = '';
        return;
      }
      if (!c || c.veredicto !== 'improbable' || !fe[k]) return;
      if (k === 'razonSocial' && feNombreEmisorProtegido(fe)) return;
      if (
        k === 'razonSocial' &&
        fe._razonamiento &&
        fe._razonamiento.asignaciones &&
        fe._razonamiento.asignaciones.razonSocial
      ) {
        return;
      }
      fe['_rechazadoAuto_' + k] = fe[k];
      fe[k] = '';
    });
    if (ev.campos.nitEmisor && ev.campos.nitEmisor.veredicto === 'improbable' && fe.nitEmisor) {
      if (fe._nitFromEtiqueta || fe._nitFromEncabezado) return;
      fe._rechazadoAuto_nitEmisor = fe.nitEmisor;
      fe.nitEmisor = '';
    }
    return fe;
  }

  function feProbeEnrichQrCufe(doc, pack, probeResult, meta) {
    meta = meta || {};
    if (meta.skipQrCufe) return Promise.resolve(probeResult);
    var text = probeResult.text || (pack && pack.text) || '';
    var fromText = extractAllCufeCandidates(text);
    probeResult.cufeCandidatos = fromText;
    var quick = null;
    for (var ci = 0; ci < fromText.length; ci++) {
      var cand = fromText[ci];
      var hex = typeof cand === 'string' ? cand : cand && cand.cufe;
      if (hex && isValidCufeHex(hex)) {
        quick = hex;
        break;
      }
    }
    if (quick) {
      probeResult.qrCufe = buildCufeResolution(null, fromText);
      if (probeResult.fe && !probeResult.fe.cufe) {
        probeResult.fe.cufe = probeResult.qrCufe.cufe || quick;
      }
      return Promise.resolve(probeResult);
    }
    if (!docHasBinary(doc)) return Promise.resolve(probeResult);
    global.__cxfFeBatchMode = true;
    return detectFeElectronica(doc, { batchMode: true })
      .then(function (det) {
        var qr = det && det.qr;
        var cands = det && det.fromQuick && det.fromQuick.length ? det.fromQuick : fromText;
        probeResult.qr = qr;
        probeResult.qrCufe = buildCufeResolution(qr, cands);
        probeResult.cufeCandidatos = cands;
        if (probeResult.qrCufe && probeResult.qrCufe.cufe && probeResult.fe && !probeResult.fe.cufe) {
          probeResult.fe.cufe = probeResult.qrCufe.cufe;
        }
        return probeResult;
      })
      .catch(function () {
        return probeResult;
      });
  }

  function feFinalizeProbeResult(pack, fe, meta) {
    fe = feEnrichFeProveedor(fe, pack, meta);
    fe = feTrainingApplyToFe(fe, pack, meta);
    fe = feSanitizeEmisorVsComprador(fe, pack, meta);
    fe = feComprenderNombresEnFactura(fe, pack, meta);
    var analisis4 = feAnalisisDocumentoCuatroPartes(pack, fe, meta);
    fe = analisis4.fe;
    fe._analisisCuatroPartes = analisis4.partes;
    var bolsa = feExtraerBolsaCandidatos(pack, fe, meta);
    if (analisis4.bolsa) bolsa = feBolsaFusionar(bolsa, analisis4.bolsa);
    var razon = feRazonarSobreBolsa(bolsa, fe, pack, meta);
    fe = razon.fe;
    fe._bolsaExtraccion = bolsa;
    var preguntasCompletas = (analisis4.preguntasLupa || [])
      .concat(analisis4.preguntasUnificacion || [])
      .concat(razon.preguntas || []);
    fe._razonamiento = {
      preguntas: preguntasCompletas,
      asignaciones: razon.asignaciones,
      coherencia: razon.coherencia,
      fases: ['lupa', 'unificacion'].concat(razon.fases || []),
      analisisCuatroPartes: analisis4.partes,
    };
    fe = feSanitizeEmisorVsComprador(fe, pack, meta);
    fe = feAplicarCamposDesdeAsignaciones(fe, razon.asignaciones, bolsa, pack, meta);
    fe = feAutoFixIntercambioNombreRep(fe);
    var empCheck = feCheckEmpresaEnFactura(fe, pack);
    fe._empresaFacturaCheck = empCheck;
    if (fe.representanteEmisor) {
      fe.representanteEmisor = feSanitizeRepresentanteEmisor(fe.representanteEmisor, { allowSingle: true });
    }
    fe = feAplicarCamposDesdeAsignaciones(fe, razon.asignaciones, bolsa, pack, meta);
    var autoEval = feAutoEvaluarExtraccion(fe, pack, meta);
    fe = feAutoAplicarEvaluacion(fe, autoEval);
    fe._autoEvaluacion = autoEval;
    var conf = feComputeProbeConfidence(fe, pack);
    return {
      fe: fe,
      text: pack.text,
      textLen: pack.textLen,
      likelyScanned: pack.likelyScanned,
      confidence: conf.score,
      confidenceLabel: conf.label,
      fieldsFound: conf.fieldsFound,
      empresaEnFactura: empCheck,
      autoEvaluacion: autoEval,
      bolsaExtraccion: bolsa,
      razonamiento: fe._razonamiento,
      analisisCuatroPartes: analisis4.partes,
      ok: !!(
        fe.nitEmisor ||
        fe.razonSocial ||
        fe.telefonoEmisor ||
        fe.emailEmisor ||
        fe.direccionEmisor ||
        fe.numeroFactura ||
        fe.total
      ),
    };
  }

  function feRazonSocialFromFilename(nombre) {
    var base = String(nombre || '')
      .replace(/^.*[/\\]/, '')
      .replace(/\.(pdf|jpg|jpeg|png|webp)$/i, '');
    var m = base.match(/^\d{4}-\d{2}-\d{2}_(.+?)_[a-f0-9]{6,16}$/i);
    if (m) return m[1].replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    m = base.match(/^(.+?)_[a-f0-9]{6,16}$/i);
    if (m && m[1].length >= 4) return m[1].replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    return '';
  }

  /** Extracción enfocada en datos del proveedor (auto-detectar, sin exigir FE/CUFE). */
  function probeProveedorFromFacturaDoc(doc, meta) {
    meta = meta || {};
    var nivel = meta.cascadeLevel != null ? meta.cascadeLevel : 1;
    meta.skipQrCufe = nivel < 2 && !meta.forceQrCufe;
    var maxPages = nivel === 0 ? 2 : 3;
    return extractStructuredPdfText(doc, maxPages)
      .then(function (pack) {
        var fe = parseFeFromText(pack.text || '');
        fe = feComprenderNombresEnFactura(fe, pack, meta);

        function terminar(feIn) {
          var probeResult = feFinalizeProbeResult(pack, feIn, meta);
          probeResult._packRef = {
            text: pack.text,
            fontStats: pack.fontStats,
            blockCount: pack.blockCount,
            textLen: pack.textLen,
            likelyScanned: pack.likelyScanned,
            blocks: pack.blocks,
          };
          probeResult.cascadeLevel = nivel;
          probeResult.extraccionScore = feScoreExtraccionFe(probeResult.fe, pack);
          probeResult.necesitaReintento = feProbeNecesitaReintento(probeResult, pack, nivel);
          return feProbeEnrichQrCufe(doc, pack, probeResult, meta).then(function (enriched) {
            if (enriched.fe && enriched.fe.cufe) {
              var conf2 = feComputeProbeConfidence(enriched.fe, pack);
              enriched.confidence = conf2.score;
              enriched.confidenceLabel = conf2.label;
              enriched.fieldsFound = conf2.fieldsFound;
              enriched.extraccionScore = feScoreExtraccionFe(enriched.fe, pack);
            }
            enriched.necesitaReintento = feProbeNecesitaReintento(enriched, pack, nivel);
            return enriched;
          });
        }

        if (nivel === 0) {
          return terminar(fe);
        }
        if (nivel === 1) {
          return feOcrCascadeRotaciones(doc, pack, fe, meta, { fullPage: true }).then(terminar);
        }
        return feOcrCascadeRotaciones(doc, pack, fe, meta, { fullPage: true })
          .then(function (feRot) {
            return feOcrCascadeNubeRotaciones(doc, pack, feRot, meta);
          })
          .then(terminar);
      })
      .catch(function () {
        var feFallback = {
          nitEmisor: '',
          razonSocial: '',
          telefonoEmisor: '',
          emailEmisor: '',
          direccionEmisor: '',
          representanteEmisor: '',
        };
        if (meta.nombreArchivo) {
          feFallback.razonSocial = feRazonSocialFromFilename(meta.nombreArchivo);
          if (feFallback.razonSocial) feFallback.razonSocial = feFallback.razonSocial.toUpperCase();
        }
        var conf = feComputeProbeConfidence(feFallback, { textLen: 0, likelyScanned: true });
        return {
          fe: feFallback,
          text: '',
          textLen: 0,
          likelyScanned: true,
          confidence: conf.score,
          confidenceLabel: conf.label,
          fieldsFound: conf.fieldsFound,
          ok: !!feFallback.razonSocial,
        };
      });
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
  var FE_TESSERACT_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@7/dist/tesseract.min.js';

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
    if (!feIsBrowserOcrContext()) {
      delete opts.workerPath;
      delete opts.langPath;
      delete opts.corePath;
    }
    return T.recognize(dataUrl, 'eng', opts);
  }

  /** OCR en pie de página escaneado — CUFE impreso cuando el QR no se lee. */
  function extractCufeFromScannedOcr(doc, opts) {
    opts = opts || {};
    if (typeof opts.onProgress === 'function') {
      opts.onProgress({ pct: 54, label: 'OCR en pie de factura (CUFE impreso)…', stepId: 'detect' });
    }
    var batchUi = !!(opts.batchMode || global.__cxfFeBatchMode);
    var cropStarts = batchUi ? [0.58, 0.72] : [0.25, 0.35, 0.45, 0.55, 0.65, 0.75];
    var ocrExtra = {
      tessedit_char_whitelist: '0123456789abcdefABCDEFCUFEcufe: \n\r\t/-',
    };
    return runPdfExclusive(function () {
      return openPdfDocument(doc).then(function (pdf) {
        return pdf.getPage(1).then(function (page) {
          var scale = batchUi ? 3.6 : 4.5;
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
                if (batchUi) return ocrOneCanvas(crop);
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
              var cornerRegions = batchUi
                ? [
                    {
                      x: Math.floor(full.width * 0.48),
                      y: Math.floor(full.height * 0.58),
                      cw: Math.floor(full.width * 0.52),
                      ch: Math.floor(full.height * 0.42),
                    },
                  ]
                : [
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

  function matchProveedor(prov, fe, fullText, intelProveedor) {
    prov = prov || {};
    fe = fe || {};
    fullText = String(fullText || fe.rawExcerpt || '');
    var nitP = normNit(prov.nit);
    var nitF = normNit(fe.nitEmisor);
    var provNombre = prov.nombre || prov.name || '';
    var simNombre = nameSimilarity(provNombre, fe.razonSocial || '');
    var simRazon = nameSimilarity(prov.legal && prov.legal.razonSocial, fe.razonSocial);
    var sim = Math.max(simNombre, simRazon);

    /* ── Consultar memoria: NIT → proveedor memorizado ── */
    var rv = global.CrozzoReservorio;
    if (!provNombre && !nitP && nitF && rv && rv.resolveProveedorPorNit) {
      var provMemorizado = rv.resolveProveedorPorNit(nitF);
      if (provMemorizado && provMemorizado.proveedorId) {
        return {
          ok: true,
          score: 90,
          etiqueta: 'Proveedor memorizado',
          detalle: 'El NIT ' + nitF + ' fue vinculado anteriormente (' + (provMemorizado.hits || 1) + ' facturas).',
          proveedorMemorizadoId: provMemorizado.proveedorId,
          nitSugerido: nitF,
          nombreSugerido: provMemorizado.razonSocial || '',
        };
      }
    }

    if (!provNombre && !nitP) {
      var sugNit = nitF || '';
      var sugNombre = String(fe.razonSocial || '').trim();
      return {
        ok: false,
        score: 0,
        etiqueta: 'Sin proveedor seleccionado',
        detalle: sugNit || sugNombre
          ? 'La factura indica: ' +
            (sugNombre ? '\u201c' + sugNombre + '\u201d' : '') +
            (sugNit ? ' \u00b7 NIT ' + sugNit : '') +
            '. Puede crear el proveedor con esos datos.'
          : 'Seleccione un proveedor en el paso 1 para validar la coincidencia.',
        sugerirCrear: !!(sugNit || sugNombre),
        nitSugerido: sugNit,
        nombreSugerido: sugNombre,
      };
    }
    if (nitP && nitF && nitP === nitF) {
      return {
        ok: true,
        score: 98,
        etiqueta: 'Coincide NIT',
        detalle: 'El NIT del proveedor seleccionado coincide con el emisor de la FE.',
      };
    }
    if (intelProveedor && intelProveedor.found) {
      return {
        ok: true,
        score: Math.min(97, 70 + (intelProveedor.score || 0)),
        etiqueta: 'Proveedor en documento',
        detalle:
          'El proveedor asignado aparece en el texto del archivo (' +
          (intelProveedor.label || 'coincidencia') +
          ').',
      };
    }
    if (fullText && nitP) {
      var nitsDoc = feExtractNitsFromText(fullText);
      if (nitsDoc.indexOf(nitP) >= 0) {
        return {
          ok: true,
          score: 94,
          etiqueta: 'NIT en texto del PDF',
          detalle: 'El NIT del proveedor en sesión fue encontrado en el documento.',
        };
      }
    }
    var enTexto = feIntelProveedorEnTexto(prov, fullText);
    if (enTexto.found) {
      return {
        ok: true,
        score: Math.min(92, 68 + enTexto.score),
        etiqueta: 'Nombre en documento',
        detalle: 'El proveedor en sesión coincide con texto leído del archivo.',
      };
    }
    if (sim >= 0.72) {
      return {
        ok: true,
        score: Math.round(sim * 100),
        etiqueta: 'Nombre relacionado',
        detalle:
          'El proveedor en sesión parece corresponder al emisor (' + Math.round(sim * 100) + '% similitud).',
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

  function suggestMpLines(feLineas, mpCatalog, opts) {
    feLineas = feLineas || [];
    mpCatalog = mpCatalog || [];
    opts = opts || {};
    var proveedorId = opts.proveedorId || '';
    var nitEmisor = opts.nitEmisor || '';
    var rv = global.CrozzoReservorio;

    return feLineas.map(function (ln) {
      var desc = String(ln.descripcion || '').trim();
      var qty = ln.cantidad > 0 ? ln.cantidad : 1;
      var totalVal = ln.valor > 0 ? ln.valor : 0;
      var precio = totalVal > 0 ? totalVal : 0;
      if (!precio && ln.valorUnitario > 0) precio = Math.round(ln.valorUnitario * qty);

      /* ── 1. Consultar memoria aprendida (feLinks) ── */
      var linkMem = rv && rv.queryFeLinks ? rv.queryFeLinks(desc, proveedorId, nitEmisor) : null;
      if (linkMem && linkMem.mpId) {
        var mpMem = mpCatalog.find(function (m) { return String(m.id) === String(linkMem.mpId); });
        if (mpMem) {
          return {
            descripcion: desc,
            mpId: mpMem.id,
            mpNombre: mpMem.nombre,
            cant: String(qty),
            precio: precio > 0 ? String(Math.round(precio)) : '',
            confianza: 100,
            memorizado: true,
            feLinkSource: linkMem.source,
            feLinkHits: linkMem.hits,
          };
        }
      }

      /* ── 2. Similitud contra catálogo + aliases ── */
      var best = null;
      var bestScore = 0;
      var bestAlias = null;
      var bestAliasScore = 0;
      mpCatalog.forEach(function (mp) {
        var sim = nameSimilarity(desc, mp.nombre);
        if (sim > bestScore) { bestScore = sim; best = mp; }
        var aliases = mp.aliases || mp.sinonimos || [];
        if (typeof aliases === 'string') aliases = aliases.split(',');
        aliases.forEach(function (al) {
          var simA = nameSimilarity(desc, String(al || '').trim());
          if (simA > bestAliasScore) { bestAliasScore = simA; bestAlias = mp; }
        });
      });
      if (bestAliasScore > bestScore) { best = bestAlias; bestScore = bestAliasScore; }

      return {
        descripcion: desc,
        mpId: best && bestScore >= 0.38 ? best.id : '',
        mpNombre: best ? best.nombre : '',
        cant: String(qty),
        precio: precio > 0 ? String(Math.round(precio)) : '',
        confianza: Math.round(bestScore * 100),
        memorizado: false,
        feLinkSource: null,
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
    var provMatch = matchProveedor(prov, fe, ctx.text, ctx.intelClassify && ctx.intelClassify.proveedorEnDoc);
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
    var provId = (prov && (prov.id || prov.proveedorId)) || '';
    var sugeridas = suggestMpLines(fe.lineas, mpCatalog, { proveedorId: provId, nitEmisor: fe.nitEmisor || '' });
    pasos.push({
      id: 'mp',
      ok: sugeridas.some(function (s) {
        return s.mpId;
      }),
      titulo: 'Materias primas sugeridas',
      detalle: sugeridas.length
        ? sugeridas.length + ' línea(s) — ' +
          sugeridas.filter(function (s) { return s.mpId && s.memorizado; }).length + ' memorizadas · ' +
          sugeridas.filter(function (s) { return s.mpId && !s.memorizado; }).length + ' sugeridas'
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
      intelClassify: ctx.intelClassify || null,
      intelOcr: ctx.intelOcr || null,
      structuredFonts: ctx.structured && ctx.structured.fontStats ? ctx.structured.fontStats.top : null,
      identidad: buildFeIdentidad(
        {
          estado: 'listo',
          esElectronica: esElectronica,
          cufe: fe.cufe,
          cufeValidado: ctx.cufeResolved && ctx.cufeResolved.cufeValidado,
          fe: fe,
          proveedorMatch: provMatch,
          intelClassify: ctx.intelClassify,
        },
        prov
      ),
    };
  }

  /** Resumen legible para el operador: qué factura es y si coincide con el proveedor. */
  function buildFeIdentidad(analisis, prov) {
    analisis = analisis || {};
    var fe = analisis.fe || {};
    var pm = analisis.proveedorMatch || {};
    var intel = analisis.intelClassify || {};
    var numero = String(fe.numeroFactura || '').trim();
    var nit = String(fe.nitEmisor || '').trim();
    var razon = String(fe.razonSocial || '').trim();
    var total = Number(fe.total) || 0;
    var cufe = String(analisis.cufe || fe.cufe || '').trim();
    var conf = 0;
    if (analisis.esElectronica) conf += 35;
    if (analisis.cufeValidado) conf += 30;
    else if (cufe) conf += 12;
    if (numero) conf += 15;
    if (total > 0) conf += 12;
    if (pm.ok) conf += 18;
    else if (intel.proveedorEnDoc && intel.proveedorEnDoc.found) conf += 10;
    if (intel.confidence) conf = Math.max(conf, Math.min(95, intel.confidence));
    conf = Math.min(100, conf);
    var estadoId = 'sin-identificar';
    var titulo = 'Sin identificar';
    var subtitulo = 'No se leyeron datos claros — use Reanalizar o ingrese manualmente';
    if (analisis.esElectronica && analisis.cufeValidado && pm.ok && numero) {
      estadoId = 'confirmada';
      titulo = 'Factura identificada';
      subtitulo = 'FE confirmada · proveedor coincide';
    } else if (analisis.esElectronica && (numero || total > 0)) {
      estadoId = 'probable';
      titulo = 'Factura electrónica probable';
      subtitulo = pm.ok ? 'Revise número y total antes de continuar' : 'Verifique que el proveedor sea el correcto';
    } else if (numero || nit || total > 0) {
      estadoId = 'parcial';
      titulo = 'Datos parciales leídos';
      subtitulo = 'Puede no ser FE — confirme número y proveedor';
    } else if (intel.esElectronica) {
      estadoId = 'probable';
      titulo = 'Documento parece FE';
      subtitulo = (intel.signals || []).slice(0, 3).join(' · ') || 'Lectura inteligente';
    }
    return {
      estadoId: estadoId,
      titulo: titulo,
      subtitulo: subtitulo,
      confianza: conf,
      numeroFactura: numero,
      nitEmisor: nit,
      razonSocial: razon,
      total: total,
      totalFmt: total > 0 ? fmtCop(total) : '',
      cufe: cufe,
      cufeCorto: cufe ? cufe.slice(0, 24) + (cufe.length > 24 ? '…' : '') : '',
      proveedorOk: !!pm.ok,
      proveedorEtiqueta: pm.etiqueta || (pm.ok ? 'Coincide' : 'Sin validar'),
      proveedorDetalle: pm.detalle || '',
      proveedorSesion: prov ? prov.nombre || '' : '',
      esElectronica: !!analisis.esElectronica,
      cufeValidado: !!analisis.cufeValidado,
      puedeAutocompletar: !!(numero || total > 0),
    };
  }

  function renderFeIdentidadCard(identidad, opts) {
    opts = opts || {};
    identidad = identidad || {};
    if (!identidad.titulo && !identidad.numeroFactura) return '';
    var cls =
      'cxf-fe-identidad cxf-fe-identidad--' +
      esc(identidad.estadoId || 'sin-identificar');
    var html =
      '<div class="' +
      cls +
      '" role="status" aria-live="polite">' +
      '<div class="cxf-fe-identidad__head">' +
      '<span class="cxf-fe-identidad__icon" aria-hidden="true">' +
      (identidad.estadoId === 'confirmada'
        ? '✓'
        : identidad.estadoId === 'probable'
          ? '⚡'
          : identidad.estadoId === 'parcial'
            ? '○'
            : '?') +
      '</span>' +
      '<div><strong class="cxf-fe-identidad__title">' +
      esc(identidad.titulo) +
      '</strong>' +
      '<p class="cxf-fe-identidad__sub">' +
      esc(identidad.subtitulo || '') +
      '</p></div>' +
      (identidad.confianza
        ? '<span class="cxf-fe-identidad__pct" title="Confianza de identificación">' +
          esc(String(identidad.confianza)) +
          '%</span>'
        : '') +
      '</div>';
    html += '<dl class="cxf-fe-identidad__grid">';
    if (identidad.numeroFactura) {
      html +=
        '<div><dt>Nº factura</dt><dd><strong>' + esc(identidad.numeroFactura) + '</strong></dd></div>';
    }
    if (identidad.totalFmt) {
      html += '<div><dt>Total</dt><dd><strong>' + esc(identidad.totalFmt) + '</strong></dd></div>';
    }
    if (identidad.nitEmisor) {
      html += '<div><dt>NIT emisor</dt><dd>' + esc(identidad.nitEmisor) + '</dd></div>';
    }
    if (identidad.razonSocial) {
      html +=
        '<div class="cxf-fe-identidad__span2"><dt>Emisor en documento</dt><dd>' +
        esc(identidad.razonSocial) +
        '</dd></div>';
    }
    if (identidad.proveedorSesion) {
      html +=
        '<div class="cxf-fe-identidad__span2"><dt>Proveedor en sesión</dt><dd>' +
        esc(identidad.proveedorSesion) +
        ' <span class="cxf-fe-identidad__prov-badge' +
        (identidad.proveedorOk ? ' is-ok' : ' is-warn') +
        '">' +
        esc(identidad.proveedorEtiqueta) +
        '</span></dd></div>';
    }
    if (identidad.cufeCorto) {
      html +=
        '<div class="cxf-fe-identidad__span2"><dt>CUFE</dt><dd><code>' +
        esc(identidad.cufeCorto) +
        '</code></dd></div>';
    }
    html += '</dl>';
    if (opts.compact) return html;
    if (identidad.puedeAutocompletar && identidad.estadoId !== 'sin-identificar') {
      html +=
        '<p class="cxf-fe-identidad__hint form-hint">Los campos Nº y total ya se rellenaron abajo. Pulse <strong>Aplicar datos</strong> para llevar también las líneas sugeridas.</p>';
    }
    html += '</div>';
    return html;
  }

  function renderFeIdentidadInline(identidad) {
    identidad = identidad || {};
    if (!identidad.numeroFactura && !identidad.totalFmt && identidad.estadoId === 'sin-identificar') {
      return '';
    }
    var parts = [];
    if (identidad.numeroFactura) parts.push(esc(identidad.numeroFactura));
    if (identidad.totalFmt) parts.push(esc(identidad.totalFmt));
    if (identidad.proveedorOk) parts.push('Proveedor ✓');
    else if (identidad.proveedorEtiqueta && identidad.proveedorEtiqueta !== 'Sin validar') {
      parts.push(esc(identidad.proveedorEtiqueta));
    }
    return (
      '<p class="cxf-fe-identidad-inline" role="status">' +
      '<span class="cxf-fe-identidad-inline__label">Identificada:</span> ' +
      (parts.length ? parts.join(' · ') : esc(identidad.titulo || 'En análisis')) +
      '</p>'
    );
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
        var esElectronica = feConfirmadaElectronica(resolved, qr, det.intelClassify) || det.esElectronica;
        pushQrCufePasos(pasos, qr, resolved);
        if (det.intelClassify && det.intelClassify.signals && det.intelClassify.signals.length) {
          pasos.push({
            id: 'intel',
            ok: det.intelClassify.esElectronica,
            warn: !det.intelClassify.esElectronica && det.intelClassify.confidence >= 35,
            titulo: 'Lectura inteligente',
            detalle:
              (det.intelClassify.esElectronica ? 'Documento FE probable' : 'Señales parciales') +
              ' (' +
              det.intelClassify.confidence +
              '%) — ' +
              det.intelClassify.signals.slice(0, 4).join(', '),
          });
        }

        if (!esElectronica) {
          var feParcial = parseFeFromText(det.quickText || '');
          if (resolved.cufe) feParcial.cufe = resolved.cufe;
          var pmParcial = matchProveedor(
            prov,
            feParcial,
            det.quickText,
            det.intelClassify && det.intelClassify.proveedorEnDoc
          );
          var identParcial = buildFeIdentidad(
            {
              estado: 'listo',
              esElectronica: false,
              cufe: feParcial.cufe || resolved.cufe || '',
              cufeValidado: !!(resolved.cufeValidado),
              fe: feParcial,
              proveedorMatch: pmParcial,
              intelClassify: det.intelClassify,
            },
            prov
          );
          emitProgress(opts, 100, identParcial.titulo || 'Sin factura electrónica detectada', 'cierre', {
            init: true,
            detect: true,
            cufe: true,
            cierre: true,
          });
          return {
            estado: 'listo',
            esElectronica: false,
            cufe: resolved.cufe || feParcial.cufe || '',
            cufeValidado: !!resolved.cufeValidado,
            pasos: pasos,
            fe: feParcial,
            proveedorMatch: pmParcial,
            intelClassify: det.intelClassify || null,
            dianUrl: buildDianConsultaUrl(feParcial.cufe) || '',
            analizadoAt: new Date().toISOString(),
            progreso: { pct: 100, label: identParcial.titulo || 'Sin FE clara', stepId: 'cierre' },
            identidad: identParcial,
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
          det.quickText && det.quickText.length > 120
            ? Promise.resolve(det.quickText)
            : isPdf && det.quickText && det.quickText.length > 80 && !batchMode
              ? extractTextFromPdfDataUrl(doc, maxTextPages).then(function (full) {
                  return full.length > det.quickText.length ? full : det.quickText;
                })
              : isPdf
                ? extractTextFromPdfDataUrl(doc, maxTextPages).then(function (full) {
                    return feIntelMergeText(det.quickText, full);
                  })
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
            intelClassify: det.intelClassify || null,
            intelOcr: det.intelOcr || null,
            structured: det.structured || null,
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
      '<p class="cxf-fe-loader__title">Identificando factura</p>' +
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
    if (analisis.intelOcr && analisis.intelOcr.zones) {
      chips.push({ cls: 'ocr', label: 'OCR zonas' });
    }
    if (analisis.proveedorMatch && analisis.proveedorMatch.ok) {
      chips.push({ cls: 'prov', label: 'Proveedor OK' });
    } else if (analisis.intelClassify && analisis.intelClassify.proveedorEnDoc && analisis.intelClassify.proveedorEnDoc.found) {
      chips.push({ cls: 'prov', label: 'Prov. en doc' });
    }
    if (analisis.structuredFonts && analisis.structuredFonts.length) {
      chips.push({ cls: 'font', label: analisis.structuredFonts[0].split('+')[0].slice(0, 12) });
    }
    if (docHint.scanned || docHint.likelyScanned) chips.push({ cls: 'scan', label: 'Escaneada' });
    if (!chips.length) return '';
    var html = '<div class="cxf-fe-chips">';
    chips.forEach(function (c) {
      html += '<span class="cxf-fe-chip cxf-fe-chip--' + c.cls + '">' + esc(c.label) + '</span>';
    });
    html += '</div>';
    return html;
  }

  function renderLineasSugeridasHtml(sugeridas, opts) {
    opts = opts || {};
    if (!sugeridas || !sugeridas.length) return '';
    var html = '<div class="cxf-fe-mp-preview"><p class="cxf-eyebrow">Vista previa de líneas (' + sugeridas.length + ')</p><ul class="cxf-fe-mp-list">';
    sugeridas.forEach(function (s, i) {
      var hasMp = !!s.mpId;
      var badge = '';
      var cls = 'cxf-fe-mp-row';
      if (s.memorizado) {
        badge = '<span class="cxf-fe-badge cxf-fe-badge--mem" title="Aprendido de facturas anteriores">🧠 Memorizado</span>';
        cls += ' cxf-fe-mp-row--mem';
      } else if (hasMp) {
        badge = '<span class="cxf-fe-badge cxf-fe-badge--sug" title="Similitud ' + (s.confianza || 0) + '%">' + (s.confianza || 0) + '% coincide</span>';
        cls += ' cxf-fe-mp-row--sug';
      } else {
        badge = '<span class="cxf-fe-badge cxf-fe-badge--new">Sin match</span>';
        cls += ' cxf-fe-mp-row--new';
      }
      html += '<li class="' + cls + '" data-sug-idx="' + i + '">' +
        '<span class="cxf-fe-mp-desc" title="' + esc(s.descripcion) + '">' + esc(s.descripcion.slice(0, 48)) + '</span>' +
        '<span class="cxf-fe-mp-arrow">→</span>' +
        '<span class="cxf-fe-mp-nombre ' + (hasMp ? '' : 'cxf-fe-mp-nombre--empty') + '">' + esc(s.mpNombre || '— sin asignar —') + '</span>' +
        badge +
        (s.precio ? '<span class="cxf-fe-mp-precio">' + esc(s.precio) + '</span>' : '') +
        '</li>';
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
      (analisis.identidad && analisis.identidad.titulo
        ? esc(analisis.identidad.titulo)
        : analisis.esElectronica
          ? 'Factura electrónica detectada'
          : 'Documento sin FE clara') +
      '</h4>';
    if (analisis.identidad) {
      html += renderFeIdentidadCard(analisis.identidad, { compact: true });
    }
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

    /* ── Panel de líneas sugeridas (preview antes de aplicar) ── */
    var sugsPanel = analisis.lineasSugeridas || [];
    if (sugsPanel.length && (analisis.estado === 'listo' || analisis.estado === 'error')) {
      html += renderLineasSugeridasHtml(sugsPanel, opts);
    }

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
      var pm = analisis.proveedorMatch || {};
      if (pm.sugerirCrear && (pm.nitSugerido || pm.nombreSugerido)) {
        var nitEnc = encodeURIComponent(pm.nitSugerido || '');
        var nomEnc = encodeURIComponent(pm.nombreSugerido || '');
        html +=
          '<button type="button" class="btn btn-outline btn-sm cxf-fe-crear-prov" ' +
          'data-cxf-fe-crear-prov ' +
          'data-nit="' + esc(pm.nitSugerido || '') + '" ' +
          'data-nombre="' + esc(pm.nombreSugerido || '') + '" ' +
          'data-prov-id="' + esc(pid) + '" ' +
          'data-factura-id="' + esc(fid) + '" ' +
          'title="Crear proveedor con los datos leídos de la factura">✚ Crear proveedor</button> ';
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
    extractStructuredPdfText: extractStructuredPdfText,
    feIntelClassifyDocument: feIntelClassifyDocument,
    feIntelProveedorEnTexto: feIntelProveedorEnTexto,
    feExtractNitsFromText: feExtractNitsFromText,
    feConfirmadaElectronica: feConfirmadaElectronica,
    buildFeIdentidad: buildFeIdentidad,
    renderFeIdentidadCard: renderFeIdentidadCard,
    renderFeIdentidadInline: renderFeIdentidadInline,
    probeProveedorFromFacturaDoc: probeProveedorFromFacturaDoc,
    feProbeNecesitaReintento: feProbeNecesitaReintento,
    feScoreExtraccionFe: feScoreExtraccionFe,
    feOcrRenderPageDataUrl: feOcrRenderPageDataUrl,
    feOcrCascadeRotaciones: feOcrCascadeRotaciones,
    feRazonSocialFromFilename: feRazonSocialFromFilename,
    feSanitizeRepresentanteEmisor: feSanitizeRepresentanteEmisor,
    feComprenderNombresEnFactura: feComprenderNombresEnFactura,
    feGetOcrAyudaConfig: feGetOcrAyudaConfig,
    feSetOcrAyudaConfig: feSetOcrAyudaConfig,
    feLooksLikeRepresentantePersona: function (name, allowSingle) {
      return !!feSanitizeRepresentanteEmisor(name, { allowSingle: !!allowSingle });
    },
    feAutoEvaluarExtraccion: feAutoEvaluarExtraccion,
    feExtraerBolsaCandidatos: feExtraerBolsaCandidatos,
    feAnalisisDocumentoCuatroPartes: feAnalisisDocumentoCuatroPartes,
    feAplicarCamposDesdeAsignaciones: feAplicarCamposDesdeAsignaciones,
    feRazonarSobreBolsa: feRazonarSobreBolsa,
    feLooksLikeEmpresaNombre: feLooksLikeEmpresaNombre,
    feLooksLikePersonName: feLooksLikePersonName,
  };
})(typeof window !== 'undefined' ? window : globalThis);
