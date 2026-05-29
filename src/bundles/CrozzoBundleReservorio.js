/* Crozzo bundle: CrozzoBundleReservorio.js — generado, no editar */


/* --- CrozzoBlobStore.js --- */

/**
 * Crozzo — almacén de archivos (facturas PDF/fotos) en IndexedDB.
 * El reservorio guarda solo referencias; capacidad ~cientos de MB.
 * Preparado para cola de subida a Supabase Storage (fase nube).
 */
(function (global) {
  'use strict';

  var DB_NAME = 'crozzo_blob_store_v1';
  var DB_VER = 1;
  var STORE = 'blobs';
  var RETENTION_DAYS = 365;
  var THUMB_MAX = 320;

  var dbPromise = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!global.indexedDB) {
        reject(new Error('IndexedDB no disponible'));
        return;
      }
      var req = global.indexedDB.open(DB_NAME, DB_VER);
      req.onerror = function () {
        reject(req.error || new Error('open failed'));
      };
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          var os = db.createObjectStore(STORE, { keyPath: 'id' });
          os.createIndex('recepcionId', 'recepcionId', { unique: false });
          os.createIndex('createdAt', 'createdAt', { unique: false });
          os.createIndex('syncEstado', 'syncEstado', { unique: false });
        }
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
    });
    return dbPromise;
  }

  function uid(prefix) {
    return (prefix || 'blob') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
  }

  function dataUrlToBlob(dataUrl) {
    if (!dataUrl || dataUrl.indexOf('data:') !== 0) return null;
    var parts = dataUrl.split(',');
    if (parts.length < 2) return null;
    var meta = parts[0];
    var b64 = parts[1];
    var mime = 'application/octet-stream';
    var m = meta.match(/data:([^;]+)/);
    if (m) mime = m[1];
    try {
      var bin = atob(b64);
      var len = bin.length;
      var arr = new Uint8Array(len);
      for (var i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
      return new Blob([arr], { type: mime });
    } catch (_) {
      return null;
    }
  }

  function makeThumb(dataUrl, mime) {
    return new Promise(function (resolve) {
      if (!dataUrl || (mime && mime.indexOf('pdf') >= 0)) {
        resolve(null);
        return;
      }
      var img = new Image();
      img.onload = function () {
        try {
          var w = img.width;
          var h = img.height;
          var scale = w > THUMB_MAX ? THUMB_MAX / w : 1;
          var cw = Math.max(1, Math.round(w * scale));
          var ch = Math.max(1, Math.round(h * scale));
          var c = document.createElement('canvas');
          c.width = cw;
          c.height = ch;
          var ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0, cw, ch);
          resolve(c.toDataURL('image/jpeg', 0.72));
        } catch (_) {
          resolve(null);
        }
      };
      img.onerror = function () {
        resolve(null);
      };
      img.src = dataUrl;
    });
  }

  function txStore(mode) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, mode);
        var store = tx.objectStore(STORE);
        tx.oncomplete = function () {
          resolve(store);
        };
        tx.onerror = function () {
          reject(tx.error);
        };
      });
    });
  }

  function putRecord(rec) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(rec);
        tx.oncomplete = function () {
          resolve(rec);
        };
        tx.onerror = function () {
          reject(tx.error);
        };
      });
    });
  }

  function getRecord(id) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var req = tx.objectStore(STORE).get(id);
        req.onsuccess = function () {
          resolve(req.result || null);
        };
        req.onerror = function () {
          reject(req.error);
        };
      });
    });
  }

  function putBlob(input) {
    input = input || {};
    var id = input.id || uid('blob');
    var dataUrl = input.dataUrl;
    var blob = input.blob || (dataUrl ? dataUrlToBlob(dataUrl) : null);
    if (!blob && !dataUrl) return Promise.reject(new Error('Sin datos de archivo'));

    return makeThumb(dataUrl, input.mime || (blob && blob.type)).then(function (thumb) {
      var rec = {
        id: id,
        recepcionId: input.recepcionId || null,
        proveedorId: input.proveedorId || null,
        refTipo: input.refTipo || 'recepcion',
        nombre: input.nombre || 'archivo',
        mime: input.mime || (blob && blob.type) || 'application/octet-stream',
        bytes: blob ? blob.size : 0,
        blob: blob,
        thumbDataUrl: thumb,
        createdAt: input.createdAt || new Date().toISOString(),
        syncEstado: input.syncEstado || 'local',
        supabasePath: input.supabasePath || null,
      };
      if (!rec.blob && dataUrl) {
        rec.blob = dataUrlToBlob(dataUrl);
        rec.bytes = rec.blob ? rec.blob.size : 0;
      }
      return putRecord(rec);
    });
  }

  function getBlobUrl(id) {
    return getRecord(id).then(function (rec) {
      if (!rec || !rec.blob) return null;
      try {
        return URL.createObjectURL(rec.blob);
      } catch (_) {
        return null;
      }
    });
  }

  function getDataUrl(id) {
    return getRecord(id).then(function (rec) {
      if (!rec || !rec.blob) return null;
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () {
          resolve(reader.result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(rec.blob);
      });
    });
  }

  function toAdjuntoRef(rec) {
    if (!rec) return null;
    return {
      id: rec.id,
      nombre: rec.nombre,
      mime: rec.mime,
      bytes: rec.bytes,
      blobRef: rec.id,
      thumbDataUrl: rec.thumbDataUrl || null,
      syncEstado: rec.syncEstado || 'local',
    };
  }

  /**
   * Guarda documentos de una recepción en IDB y devuelve referencias ligeras (sin dataUrl).
   */
  function persistAdjuntos(recepcionId, docs) {
    docs = docs || [];
    if (!docs.length) return Promise.resolve([]);
    var chain = Promise.resolve([]);
    docs.forEach(function (d) {
      chain = chain.then(function (refs) {
        if (d.blobRef && !d.dataUrl) {
          refs.push({
            id: d.id,
            nombre: d.nombre,
            mime: d.mime,
            bytes: d.bytes,
            blobRef: d.blobRef,
            thumbDataUrl: d.thumbDataUrl,
            syncEstado: d.syncEstado || 'local',
          });
          return refs;
        }
        if (!d.dataUrl) return refs;
        return putBlob({
          id: d.id,
          recepcionId: recepcionId,
          nombre: d.nombre,
          mime: d.mime,
          dataUrl: d.dataUrl,
        }).then(function (rec) {
          refs.push(toAdjuntoRef(rec));
          return refs;
        });
      });
    });
    return chain;
  }

  function loadAdjuntosForUi(adjuntos) {
    adjuntos = adjuntos || [];
    return Promise.all(
      adjuntos.map(function (a) {
        if (a.dataUrl) {
          return Promise.resolve({
            id: a.id,
            nombre: a.nombre,
            mime: a.mime,
            dataUrl: a.dataUrl,
            blobRef: a.blobRef,
          });
        }
        if (!a.blobRef) return Promise.resolve(null);
        return getDataUrl(a.blobRef).then(function (url) {
          if (!url) {
            return {
              id: a.id,
              nombre: a.nombre,
              mime: a.mime,
              dataUrl: a.thumbDataUrl || '',
              blobRef: a.blobRef,
              _missing: true,
            };
          }
          return {
            id: a.id,
            nombre: a.nombre,
            mime: a.mime,
            dataUrl: url,
            blobRef: a.blobRef,
          };
        });
      })
    ).then(function (list) {
      return list.filter(Boolean);
    });
  }

  function migrateReservorioAdjuntos(reservorio) {
    if (!reservorio || !Array.isArray(reservorio.recepciones)) return Promise.resolve({ migrated: 0 });
    var n = 0;
    var chain = Promise.resolve();
    reservorio.recepciones.forEach(function (rec) {
      if (!rec || !rec.adjuntos || !rec.adjuntos.length) return;
      var needs = rec.adjuntos.some(function (a) {
        return a && a.dataUrl && !a.blobRef;
      });
      if (!needs) return;
      chain = chain.then(function () {
        return persistAdjuntos(rec.id, rec.adjuntos).then(function (refs) {
          rec.adjuntos = refs;
          n++;
        });
      });
    });
    return chain.then(function () {
      return { migrated: n };
    });
  }

  function estimateUsage() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var req = tx.objectStore(STORE).getAll();
        req.onsuccess = function () {
          var rows = req.result || [];
          var bytes = 0;
          rows.forEach(function (r) {
            bytes += Number(r.bytes) || 0;
          });
          resolve({
            count: rows.length,
            bytes: bytes,
            mb: Math.round((bytes / (1024 * 1024)) * 10) / 10,
          });
        };
        req.onerror = function () {
          reject(req.error);
        };
      });
    });
  }

  function listPendingCloud() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var idx = tx.objectStore(STORE).index('syncEstado');
        var req = idx.getAll('pendiente_nube');
        req.onsuccess = function () {
          resolve(req.result || []);
        };
        req.onerror = function () {
          reject(req.error);
        };
      });
    });
  }

  function markSyncEstado(blobId, estado, supabasePath) {
    return getRecord(blobId).then(function (rec) {
      if (!rec) return null;
      rec.syncEstado = estado || rec.syncEstado;
      if (supabasePath) rec.supabasePath = supabasePath;
      return putRecord(rec);
    });
  }

  function isWithinRetention(fechaIso) {
    if (!fechaIso) return true;
    var d = new Date(fechaIso);
    if (isNaN(d.getTime())) return true;
    var cut = new Date();
    cut.setDate(cut.getDate() - RETENTION_DAYS);
    return d >= cut;
  }

  function retentionDays() {
    return RETENTION_DAYS;
  }

  global.CrozzoBlobStore = {
    RETENTION_DAYS: RETENTION_DAYS,
    open: openDb,
    putBlob: putBlob,
    getBlobUrl: getBlobUrl,
    getDataUrl: getDataUrl,
    persistAdjuntos: persistAdjuntos,
    loadAdjuntosForUi: loadAdjuntosForUi,
    migrateReservorioAdjuntos: migrateReservorioAdjuntos,
    estimateUsage: estimateUsage,
    listPendingCloud: listPendingCloud,
    markSyncEstado: markSyncEstado,
    isWithinRetention: isWithinRetention,
    retentionDays: retentionDays,
  };
})(typeof window !== 'undefined' ? window : globalThis);



/* --- CrozzoProveedorDocumentos.js --- */

/**
 * Crozzo — importación de proveedores desde certificado RUT/NIT (PDF o imagen).
 * Extracción local (pdf.js texto / OCR básico futuro), match y wizard crear/actualizar.
 */
(function (global) {
  'use strict';

  var VIGENCIA_MESES = 12;
  var _pdfJsLoading = null;
  var _importRegistry = {};
  var _globalHandlersReady = false;

  var RUBROS_KEYWORDS = [
    ['Carnicería', /CARNIC|CERDO|VACUN|AVE|POLLO|CORDERO/i],
    ['Quesería', /QUESO|LACTEO|LÁCTEO|LACTEO/i],
    ['Verduras y frutas', /VERDUR|FRUT|HORTAL|AGRO/i],
    ['Lácteos', /LECHE|CREMA|YOGUR|MANTEQUILLA/i],
    ['Bebidas', /BEBIDA|GASEOSA|JUGO|CERVEZA|VINO|LICOR/i],
    ['Panadería', /PANADER|PAN |PASTEL|REPOSTER/i],
    ['Pescadería', /PESCAD|MARISC|SALMON|ATUN/i],
    ['Abarrotes', /ABARROT|ALIMENT|GROCER|COMESTIB/i],
    ['Empaques', /EMPAQ|ENVASE|DESCART/i],
  ];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getPaisTributario() {
    try {
      if (global.config && global.config.get) {
        var c = global.config.get('empresa') || global.config.get('configEmpresa') || {};
        var p = c.paisTributario || c.pais || '';
        if (p) return String(p).toUpperCase().slice(0, 2);
      }
    } catch (_) {}
    return 'CO';
  }

  function labelIdentificador() {
    return getPaisTributario() === 'CL' ? 'RUT' : 'NIT';
  }

  /** Solo dígitos + DV (K) para comparar */
  function normIdentificador(raw) {
    var s = String(raw || '').trim().toUpperCase();
    if (!s) return '';
    var isRut = /-[\dK]$/.test(s.replace(/\./g, '')) || getPaisTributario() === 'CL';
    if (isRut) {
      s = s.replace(/\./g, '').replace(/\s/g, '');
      var m = s.match(/^(\d{7,9})-?([\dK])$/);
      if (m) return m[1] + '-' + m[2];
      var digits = s.replace(/[^0-9K]/g, '');
      if (digits.length >= 8) {
        var dv = digits.slice(-1);
        var body = digits.slice(0, -1).replace(/^0+/, '');
        if (body.length >= 7) return body + '-' + dv;
      }
    }
    var digits = s.replace(/[^\dK]/g, '');
    if (digits.length === 10 && getPaisTributario() !== 'CL') {
      return digits.slice(0, 9) + '-' + digits.slice(9);
    }
    if (digits.length === 9 && getPaisTributario() !== 'CL') {
      return digits;
    }
    return s.replace(/[^0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
  }

  function formatNitColombia(norm) {
    var m = String(norm || '').match(/^(\d{9})-?(\d)$/);
    if (!m) return norm || '';
    return m[1].slice(0, 3) + '.' + m[1].slice(3, 6) + '.' + m[1].slice(6) + '-' + m[2];
  }

  function formatIdentificadorDisplay(norm, pais) {
    if (!norm) return '';
    pais = pais || getPaisTributario();
    if (pais === 'CL' && /^\d+-[\dK]$/i.test(norm)) {
      var parts = norm.split('-');
      var b = parts[0];
      var dv = parts[1];
      if (b.length === 8) return b.slice(0, 2) + '.' + b.slice(2, 5) + '.' + b.slice(5) + '-' + dv;
      if (b.length === 7) return b.slice(0, 1) + '.' + b.slice(1, 4) + '.' + b.slice(4) + '-' + dv;
    }
    if (/^\d{9}-?\d$/.test(String(norm).replace(/\./g, ''))) {
      return formatNitColombia(norm.replace(/\./g, '').replace(/(\d{9})(\d)$/, '$1-$2'));
    }
    return norm;
  }

  function rutCalcDv(body) {
    var sum = 0;
    var mul = 2;
    for (var i = body.length - 1; i >= 0; i--) {
      sum += parseInt(body.charAt(i), 10) * mul;
      mul = mul >= 7 ? 2 : mul + 1;
    }
    var rest = 11 - (sum % 11);
    if (rest === 11) return '0';
    if (rest === 10) return 'K';
    return String(rest);
  }

  function validarRutChile(norm) {
    var m = String(norm || '').match(/^(\d{7,9})-([\dK])$/);
    if (!m) return { ok: false, motivo: 'formato' };
    var dv = rutCalcDv(m[1]);
    if (dv !== m[2]) return { ok: false, motivo: 'dv', esperado: dv };
    return { ok: true, tipo: 'RUT', norm: m[1] + '-' + m[2] };
  }

  function validarIdentificador(raw) {
    var norm = normIdentificador(raw);
    if (!norm) return { ok: false, norm: '', tipo: 'unknown' };
    if (getPaisTributario() === 'CL' || /-[\dK]$/.test(norm)) {
      var r = validarRutChile(norm);
      return Object.assign({ norm: norm, display: formatIdentificadorDisplay(r.ok ? r.norm : norm) }, r);
    }
    if (norm.replace(/-/g, '').length >= 9) {
      return { ok: true, tipo: 'NIT', norm: norm, display: formatNitColombia(norm) || norm };
    }
    if (norm.replace(/-/g, '').length >= 6) {
      return { ok: true, tipo: 'NIT', norm: norm, display: norm };
    }
    return { ok: false, norm: norm, tipo: 'NIT', motivo: 'corto' };
  }

  function resolveVendorUrl(path) {
    try {
      var a = document.createElement('a');
      a.href = path;
      return a.href;
    } catch (e) {
      return path;
    }
  }

  function loadPdfJs() {
    if (global.pdfjsLib && global.pdfjsLib.getDocument) {
      if (global.pdfjsLib.GlobalWorkerOptions) {
        global.pdfjsLib.GlobalWorkerOptions.workerSrc = resolveVendorUrl('vendor/CrozzoPdfJs.worker.js');
      }
      return Promise.resolve(global.pdfjsLib);
    }
    if (_pdfJsLoading) return _pdfJsLoading;
    _pdfJsLoading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = resolveVendorUrl('vendor/CrozzoPdfJs.js');
      s.async = true;
      s.onload = function () {
        var lib = global.pdfjsLib;
        if (lib && lib.GlobalWorkerOptions) {
          lib.GlobalWorkerOptions.workerSrc = resolveVendorUrl('vendor/CrozzoPdfJs.worker.js');
        }
        if (lib && lib.getDocument) resolve(lib);
        else reject(new Error('pdf.js no disponible'));
      };
      s.onerror = function () {
        reject(new Error('No se pudo cargar pdf.js'));
      };
      document.head.appendChild(s);
    });
    return _pdfJsLoading;
  }

  function fileToArrayBuffer(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () {
        resolve(r.result);
      };
      r.onerror = reject;
      r.readAsArrayBuffer(file);
    });
  }

  function fileToDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () {
        resolve(r.result);
      };
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  function pdfItemsToLines(items) {
    var rows = [];
    (items || []).forEach(function (it) {
      var s = String(it.str || '').trim();
      if (!s) return;
      rows.push({
        str: s,
        x: it.transform ? it.transform[4] : 0,
        y: it.transform ? it.transform[5] : 0,
      });
    });
    if (!rows.length) return [];
    rows.sort(function (a, b) {
      return b.y - a.y || a.x - b.x;
    });
    var lines = [];
    var bucket = [];
    var y0 = null;
    rows.forEach(function (r) {
      if (y0 === null || Math.abs(r.y - y0) > 5) {
        if (bucket.length) {
          bucket.sort(function (a, b) {
            return a.x - b.x;
          });
          lines.push(
            bucket
              .map(function (x) {
                return x.str;
              })
              .join(' ')
              .replace(/\s+/g, ' ')
              .trim()
          );
        }
        bucket = [r];
        y0 = r.y;
      } else {
        bucket.push(r);
      }
    });
    if (bucket.length) {
      bucket.sort(function (a, b) {
        return a.x - b.x;
      });
      lines.push(
        bucket
          .map(function (x) {
            return x.str;
          })
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim()
      );
    }
    return lines;
  }

  function extractPdfText(arrayBuffer, maxPages) {
    maxPages = maxPages || 3;
    return loadPdfJs().then(function (pdfjsLib) {
      var data = arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer);
      return pdfjsLib.getDocument({ data: data }).promise.then(function (pdf) {
        var pages = Math.min(pdf.numPages, maxPages);
        var chain = Promise.resolve({ text: '', lines: [] });
        for (var i = 1; i <= pages; i++) {
          (function (pageNum) {
            chain = chain.then(function (acc) {
              return pdf.getPage(pageNum).then(function (page) {
                return page.getTextContent().then(function (tc) {
                  var pageLines = pdfItemsToLines(tc.items);
                  var flat = pageLines.join('\n');
                  return {
                    text: acc.text + (acc.text ? '\n' : '') + flat,
                    lines: acc.lines.concat(pageLines),
                  };
                });
              });
            });
          })(i);
        }
        return chain.then(function (out) {
          return {
            text: out.text,
            lines: out.lines,
            numPages: pdf.numPages,
            metodo: 'pdf-text-layout',
          };
        });
      });
    });
  }

  function extractImageText(_dataUrl) {
    return Promise.resolve({ text: '', numPages: 1, metodo: 'image-pending', ocrRequerido: true });
  }

  function parseFecha(str) {
    if (!str) return null;
    var m = String(str).match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
    if (!m) return null;
    var d = parseInt(m[1], 10);
    var mo = parseInt(m[2], 10);
    var y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    try {
      var dt = new Date(y, mo - 1, d);
      if (dt.getFullYear() !== y) return null;
      return dt.toISOString().slice(0, 10);
    } catch (_) {
      return null;
    }
  }

  function fieldFromPatterns(text, patterns) {
    for (var i = 0; i < patterns.length; i++) {
      var m = text.match(patterns[i]);
      if (m && m[1]) return String(m[1]).trim().replace(/\s{2,}/g, ' ');
    }
    return '';
  }

  function inferRubroFromGiro(giro) {
    giro = String(giro || '');
    if (!giro) return 'Otro';
    for (var i = 0; i < RUBROS_KEYWORDS.length; i++) {
      if (RUBROS_KEYWORDS[i][1].test(giro)) return RUBROS_KEYWORDS[i][0];
    }
    return 'Otro';
  }

  /** Rechaza etiquetas del formulario DIAN/RUT (no valores reales). */
  function looksLikeFormLabel(s) {
    s = String(s || '').trim();
    if (!s || s.length < 2) return true;
    if (/Certificado\s+Fecha\s+generaci[oó]n|documento\s+PDF\s*:/i.test(s)) return true;
    if (/Sin\s+perjuicio\s+de\s+las\s+verificaciones/i.test(s)) return true;
    if (/Primer\s+apellido|Segundo\s+apellido|Primer\s+nombre|Segundo\s+nombre/i.test(s)) return true;
    if (/Tipo\s+de\s+contribuyente|Tipo\s+de\s+documento|Buz[oó]n\s+electr[oó]nico/i.test(s)) return true;
    if (/N[uú]mero\s+establecimientos|Otros\s+nombres|Departamento|Seccional/i.test(s) && s.length < 80) return true;
    if (/Fecha\s+inicio\s+actividad\s+\d+\.|C[oó]digo\s+\d/i.test(s) && !/S\.?A\.?S|LTDA/i.test(s)) return true;
    var numbered = s.match(/\d{1,2}\.\s+[A-Za-zÁÉÍÓÚáéíóú]/g);
    if (numbered && numbered.length >= 2) return true;
    if (/^\d{1,2}\.\s+[A-Za-z].{2,50}$/.test(s) && s.length < 55) return true;
    return false;
  }

  function cleanFieldValue(s) {
    s = String(s || '')
      .trim()
      .replace(/\s{2,}/g, ' ');
    if (!s || looksLikeFormLabel(s)) return '';
    return s;
  }

  function razonFromFilename(nombreArchivo) {
    if (!nombreArchivo) return '';
    var base = String(nombreArchivo).replace(/\.(pdf|png|jpe?g|webp)$/i, '').trim();
    var m = base.match(/^(?:RUT|NIT|CC?)\s+(.+)$/i);
    var name = (m ? m[1] : base).replace(/[_-]+/g, ' ').trim();
    if (name.length < 4) return '';
    if (!/S\.?A\.?S|LTDA|LIMITADA|S\.?A\.?|E\.?U\.|INC/i.test(name)) return '';
    return name.toUpperCase();
  }

  /** Algoritmo DV NIT DIAN (mismo criterio que validarNIT en POS). */
  function calcularDvDian(nitBase) {
    var primos = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
    var base = String(nitBase || '').replace(/\D/g, '');
    if (!base) return -1;
    var suma = 0;
    for (var i = 0; i < base.length; i++) {
      suma += parseInt(base.charAt(base.length - 1 - i), 10) * primos[i % primos.length];
    }
    var residuo = suma % 11;
    return residuo <= 1 ? 0 : 11 - residuo;
  }

  function nitDvOk(norm) {
    var m = String(norm || '').match(/^(\d{6,15})-(\d)$/);
    if (!m) return false;
    return calcularDvDian(m[1]) === parseInt(m[2], 10);
  }

  function nitDvWrong(norm) {
    var m = String(norm || '').match(/^(\d{6,15})-(\d)$/);
    if (!m) return false;
    return calcularDvDian(m[1]) !== parseInt(m[2], 10);
  }

  /**
   * Fila de valores DIAN con dígitos separados por espacio (ej. "9 0 1 1 1 8 5 7 2 8 Impuestos…").
   * En el RUT oficial, la línea debajo de las etiquetas 5+6+12+14 trae NIT, DV y dirección seccional juntos.
   */
  function parseSpacedDigitRowNit(line) {
    line = String(line || '').trim();
    if (!line || looksLikeFormLabel(line)) return null;

    var digitPrefix = '';
    var letterAt = line.search(/[A-Za-zÁÉÍÓÚáéíóúñÑ]/);
    if (letterAt > 0) {
      digitPrefix = line.slice(0, letterAt);
    } else if (/^[\d\s]+$/.test(line)) {
      digitPrefix = line;
    } else {
      var m = line.match(/^((?:\d(?:\s+\d){8,14}))/);
      if (m) digitPrefix = m[1];
    }
    if (!digitPrefix) return null;

    var digits = digitPrefix.replace(/\s/g, '');
    if (digits.length < 10) return null;
    if (/^20\d{8}$/.test(digits.slice(0, 10))) return null;

    var base = digits.slice(0, 9);
    var dv = digits.slice(9, 10);
    var norm = base + '-' + dv;
    var v = validarIdentificador(norm);
    if (!v || !v.norm) return null;
    v.fuenteExtraccion = 'campo5-fila-espaciada';
    v.scoreExtraccion = 240;
    v.dvVerificado = nitDvOk(norm);
    if (v.dvVerificado) v.ok = true;
    return v;
  }

  function extractNitFromSpacedDianRow(lines) {
    lines = lines || [];
    var i;
    for (i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (
        /5\.?\s*N[uú]mero\s+de\s+Identificaci[oó]n/i.test(line) &&
        (/\b6\.?\s*DV\b/i.test(line) || /Direcci[oó]n\s+seccional/i.test(line))
      ) {
        var next = lines[i + 1];
        if (next) {
          var p = parseSpacedDigitRowNit(next);
          if (p) return p;
        }
      }
    }
    for (i = 0; i < lines.length; i++) {
      line = lines[i];
      if (
        /^\d(?:\s+\d){8,}/.test(line) &&
        /Impuestos\s+y\s+Aduanas|Direcci[oó]n\s+seccional|Buz[oó]n\s+electr/i.test(line)
      ) {
        var p2 = parseSpacedDigitRowNit(line);
        if (p2) return p2;
      }
    }
    return null;
  }

  /**
   * Formulario DIAN: campo 5 = base NIT (9 dígitos), campo 6 = dígito verificador (1 dígito).
   * Es la fuente más fiable; evita confundir con códigos de dirección u otros números del PDF.
   */
  function extractNitDianCampo5Campo6(text, lines) {
    lines = lines || [];
    text = String(text || '');

    var spaced = extractNitFromSpacedDianRow(lines);
    if (spaced && spaced.norm) return spaced;

    var block = text.match(
      /5\.?\s*N[uú]mero\s+de\s+Identificaci[oó]n(?:\s+Tributaria)?(?:\s*\(NIT\))?[\s\S]{0,180}?(\d{8,10})[\s\S]{0,100}?6\.?\s*D[ií]gito\s+de\s+Verificaci[oó]n\D{0,20}(\d)\b/i
    );
    if (block) {
      var baseB = String(block[1]).replace(/\D/g, '');
      var dvB = block[2];
      if (baseB.length === 10) baseB = baseB.slice(0, 9);
      if (baseB.length >= 8 && baseB.length <= 9 && dvB) {
        if (baseB.length === 8) baseB = baseB.padStart(9, '0');
        var normB = baseB + '-' + dvB;
        var vB = validarIdentificador(normB);
        if (vB && vB.norm) {
          vB.fuenteExtraccion = 'campo5-6-bloque';
          vB.scoreExtraccion = 220;
          vB.dvVerificado = nitDvOk(normB);
          if (vB.dvVerificado) vB.ok = true;
          return vB;
        }
      }
    }

    var i;
    for (i = 0; i < lines.length; i++) {
      if (!/5\.?\s*N[uú]mero\s+de\s+Identificaci|Identificaci[oó]n\s+Tributaria/i.test(lines[i])) continue;

      var base = '';
      var dv = '';
      var j;
      for (j = 0; j <= 8 && i + j < lines.length; j++) {
        var nl = String(lines[i + j] || '').trim();
        if (/^7\.|Fecha\s+de\s+expedici|Lugar\s+de\s+expedici/i.test(nl)) break;

        if (/^6\.|D[ií]gito\s+de\s+Verificaci[oó]n/i.test(nl)) {
          var dvm = nl.match(/(\d)\s*$/);
          if (dvm) dv = dvm[1];
          var soloDv = nl.replace(/^6\.?\s*D[ií]gito\s+de\s+Verificaci[oó]n\s*/i, '').trim();
          if (/^\d$/.test(soloDv)) dv = soloDv;
          continue;
        }

        if (/^\d{9}$/.test(nl)) {
          base = nl;
          continue;
        }
        if (/^\d{3}\.\d{3}\.\d{3}$/.test(nl)) {
          base = nl.replace(/\./g, '');
          continue;
        }
        var enLinea = nl.match(/(\d{3})[\.\s]?(\d{3})[\.\s]?(\d{3})/);
        if (enLinea && /5\.|Identificaci/i.test(lines[i])) {
          base = enLinea[1] + enLinea[2] + enLinea[3];
        }
      }

      if (!dv && base) {
        for (j = 1; j <= 4 && i + j < lines.length; j++) {
          var lnDv = String(lines[i + j] || '').trim();
          if (/^7\./i.test(lnDv)) break;
          if (/^6\.|D[ií]gito\s+de\s+Verificaci/i.test(lnDv)) {
            var mDv = lnDv.match(/(\d)\s*$/);
            if (mDv) dv = mDv[1];
            break;
          }
          if (/^\d$/.test(lnDv) && base) {
            dv = lnDv;
            break;
          }
        }
      }

      if (base && dv) {
        var normL = base + '-' + dv;
        var vL = validarIdentificador(normL);
        if (vL && vL.norm) {
          vL.fuenteExtraccion = 'campo5-6-lineas';
          vL.scoreExtraccion = 225;
          vL.dvVerificado = nitDvOk(normL);
          if (vL.dvVerificado) vL.ok = true;
          return vL;
        }
      }
      if (base && !dv) {
        var dvCalc = calcularDvDian(base);
        if (dvCalc >= 0) {
          var normC = base + '-' + dvCalc;
          var vC = validarIdentificador(normC);
          if (vC && vC.norm) {
            vC.fuenteExtraccion = 'campo5-dv-calculado';
            vC.scoreExtraccion = 200;
            vC.dvVerificado = true;
            vC.ok = true;
            return vC;
          }
        }
      }
    }

    return null;
  }

  /** Parsea un fragmento de texto a base+DV (formato DIAN). */
  function digitsFromNitChunk(chunk) {
    chunk = String(chunk || '').trim();
    if (!chunk || looksLikeFormLabel(chunk)) return null;

    var formatted = chunk.match(/(\d{3})[\.\s]?(\d{3})[\.\s]?(\d{3})[\s.\-]+(\d)\b/);
    if (formatted) {
      var baseF = formatted[1] + formatted[2] + formatted[3];
      return { base: baseF, dv: formatted[4], norm: baseF + '-' + formatted[4] };
    }
    var m9 = chunk.match(/\b(\d{9})[\s.\-]+(\d)\b/);
    if (m9 && !/^20\d{7}$/.test(m9[1])) {
      return { base: m9[1], dv: m9[2], norm: m9[1] + '-' + m9[2] };
    }
    var digitsOnly = chunk.replace(/[^\d]/g, '');
    if (digitsOnly.length === 10 && !/^20\d{8}$/.test(digitsOnly) && !/^0{3,}/.test(digitsOnly)) {
      return {
        base: digitsOnly.slice(0, 9),
        dv: digitsOnly.slice(9),
        norm: digitsOnly.slice(0, 9) + '-' + digitsOnly.slice(9),
      };
    }
    if (digitsOnly.length === 9 && /^\d{9}$/.test(digitsOnly) && !/^20\d{7}$/.test(digitsOnly)) {
      return { base: digitsOnly, dv: '', norm: digitsOnly };
    }
    return null;
  }

  function isLikelyFalseNit(base, ctx) {
    base = String(base || '').replace(/\D/g, '');
    ctx = String(ctx || '');
    if (!base || base.length < 6) return true;
    if (/^20\d{6,7}$/.test(base) || /^19\d{6,7}$/.test(base)) return true;
    if (/^(\d)\1{5,}$/.test(base)) return true;
    if (/generaci[oó]n|certificado\s+no|sin\s+perjuicio|a[nñ]o\s+tributario/i.test(ctx)) return true;
    if (/n[uú]mero\s+de\s+formulario|formulario\s+\d/i.test(ctx)) return true;
    if (/establecimiento|matr[ií]cula|consecutivo|p[aá]gina\s+\d/i.test(ctx)) return true;
    if (/c[oó]digo\s+postal|tel[eé]fono\s+1|actividad\s+secundaria|53\.\s*c[oó]digo/i.test(ctx)) return true;
    if (/c[oó]digo\s+\d{2}|actividad\s+econ[oó]mica|ciiu/i.test(ctx) && base.length <= 6) return true;
    if (/apellido|primer\s+nombre|segundo\s+nombre|tipo\s+de\s+documento/i.test(ctx) && !/identificaci/i.test(ctx)) {
      return true;
    }
    if (/tel[eé]fono|celular|m[oó]vil/i.test(ctx) && /^3\d{9}$/.test(base)) return true;
    return false;
  }

  function pushNitCandidate(bucket, norm, source, baseScore, lineCtx, lineIndex) {
    var parsed = digitsFromNitChunk(norm) || { norm: norm };
    norm = parsed.norm || norm;
    if (!norm) return;
    var v = validarIdentificador(norm);
    if (!v || !v.norm) return;
    var digits = v.norm.replace(/\D/g, '');
    if (digits.length < 9) return;
    if (isLikelyFalseNit(digits.length >= 10 ? digits.slice(0, 9) : digits, lineCtx || source)) return;
    if (nitDvWrong(norm)) baseScore -= 80;

    var key = digits.length >= 10 ? digits.slice(0, 9) + digits.slice(9) : v.norm;
    var entry = {
      norm: v.norm,
      source: source,
      score: baseScore,
      lineCtx: lineCtx || '',
      lineIndex: typeof lineIndex === 'number' ? lineIndex : -1,
      validacion: v,
    };
    if (!bucket[key] || bucket[key].score < baseScore) bucket[key] = entry;
  }

  function collectNitCandidates(text, lines) {
    lines = lines || [];
    var bucket = {};
    var i;

    var field5Patterns = [
      /5\.?\s*N[uú]mero\s+de\s+Identificaci[oó]n(?:\s+Tributaria)?(?:\s*\(NIT\))?[^\d]{0,25}([\d\.\s\-]{10,24})/i,
      /N[uú]mero\s+de\s+Identificaci[oó]n\s+Tributaria(?:\s*\(NIT\))?[^\d]{0,20}([\d\.\s\-]{10,24})/i,
    ];
    field5Patterns.forEach(function (re) {
      var m = text.match(re);
      if (m && m[1]) {
        var p = digitsFromNitChunk(m[1]);
        if (p) pushNitCandidate(bucket, p.norm, 'campo5-bloque', 130, m[0]);
      }
    });

    for (i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!/^(5\.|.*N[uú]mero\s+de\s+Identificaci|Identificaci[oó]n\s+Tributaria)/i.test(line)) continue;

      var afterLabel = line
        .replace(/^.*?5\.?\s*N[uú]mero\s+de\s+Identificaci[oó]n[^\d]*/i, '')
        .replace(/^.*?Identificaci[oó]n\s+Tributaria[^\d]*/i, '')
        .trim();
      var pLine = digitsFromNitChunk(afterLabel) || digitsFromNitChunk(line);
      if (pLine) pushNitCandidate(bucket, pLine.norm, 'campo5-linea', 135, line, i);

      var j;
      for (j = 1; j <= 4 && i + j < lines.length; j++) {
        var nl = lines[i + j];
        if (looksLikeFormLabel(nl)) continue;
        if (/^7\.|Fecha\s+de\s+expedici/i.test(nl)) break;
        if (/^\d{1,2}\.\s+[A-Za-zÁÉÍÓÚ]/.test(nl) && !/\d{3}\.\d{3}\.\d{3}/.test(nl) && !/^\d{9}$/.test(nl.trim())) {
          break;
        }
        if (/^\d{9}$/.test(nl.trim()) && !/^[67]\./.test(lines[i + j + 1] || '')) {
          continue;
        }
        var pNext = digitsFromNitChunk(nl);
        if (pNext && pNext.base.length >= 8) {
          pushNitCandidate(bucket, pNext.norm, 'campo5-siguiente+' + j, 128 - j * 3, nl, i + j);
        }
      }
    }

    var header = text.match(/\bNIT\s*[:\s]+(\d{3}[\.\s]?\d{3}[\.\s]?\d{3}[\s\.\-]+\d)/i);
    if (header) {
      var ph = digitsFromNitChunk(header[1]);
      if (ph) pushNitCandidate(bucket, ph.norm, 'encabezado-nit', 115, header[0]);
    }

    var reFmt = /\b(\d{3}\.\d{3}\.\d{3}-\d)\b/g;
    var fm;
    while ((fm = reFmt.exec(text)) !== null) {
      var ctx = text.slice(Math.max(0, fm.index - 50), fm.index + fm[0].length + 30);
      pushNitCandidate(bucket, fm[1], 'formato-puntos', 95, ctx);
    }

    for (i = 0; i < lines.length; i++) {
      var ln = lines[i].trim();
      if (/^\d{3}\.\d{3}\.\d{3}-\d$/.test(ln)) {
        pushNitCandidate(bucket, ln, 'linea-sola-formato', 100, ln);
        continue;
      }
      if (looksLikeFormLabel(ln)) continue;
      if (/apellido|primer nombre|segundo nombre|tipo de documento|fecha inicio actividad/i.test(ln)) continue;
      if (/^\d{1,2}\.\s+[A-Za-z]/.test(ln) && !/\d{9}/.test(ln)) continue;

      var re9 = ln.match(/\b(\d{9})[\s.\-]+(\d)\b/);
      if (re9 && !/^20\d{7}$/.test(re9[1])) {
        if (/direcci[oó]n|c[oó]digo\s+de\s+la|establecimiento|matr[ií]cula|48\.|49\./i.test(ln)) continue;
        pushNitCandidate(bucket, re9[1] + '-' + re9[2], 'linea-9dv', 72, ln, i);
      }
    }

    return Object.keys(bucket).map(function (k) {
      return bucket[k];
    });
  }

  function scoreNitCandidate(c) {
    var score = c.score || 0;
    var norm = c.norm;
    if (nitDvWrong(norm)) score -= 120;
    if (nitDvOk(norm)) score += 55;
    var m = String(norm).match(/^(\d+)-(\d)$/);
    if (m) {
      if (m[1].length === 9) score += 12;
      if (/^[89]/.test(m[1])) score += 6;
      if (/^900|^901|^902|^830|^800|^890|^811/.test(m[1])) score += 4;
    }
    if (/campo5-6/.test(c.source || '')) score += 30;
    if (/campo5/.test(c.source || '')) score += 15;
    if (typeof c.lineIndex === 'number' && c.lineIndex >= 0) {
      if (c.nearField5) score += 28;
      if (c.farFromField5) score -= 50;
    }
    if (isLikelyFalseNit(m ? m[1] : norm, c.lineCtx)) score -= 100;
    return score;
  }

  function extractNitColombia(text, lines) {
    lines = lines || [];

    var campo56 = extractNitDianCampo5Campo6(text, lines);
    if (campo56 && campo56.norm) return campo56;

    var field5Line = -1;
    var li;
    for (li = 0; li < lines.length; li++) {
      if (/5\.?\s*N[uú]mero\s+de\s+Identificaci/i.test(lines[li])) {
        field5Line = li;
        break;
      }
    }

    var candidates = collectNitCandidates(text, lines);
    candidates.forEach(function (c) {
      if (field5Line < 0 || typeof c.lineIndex !== 'number') return;
      c.nearField5 = c.lineIndex >= field5Line && c.lineIndex <= field5Line + 8;
      c.farFromField5 = c.lineIndex > field5Line + 14;
    });

    if (!candidates.length) {
      var re10 = /\b(\d{10})\b/g;
      var hit;
      while ((hit = re10.exec(text)) !== null) {
        if (/^20\d{8}$/.test(hit[1]) || /^0{3,}/.test(hit[1])) continue;
        var normFb = hit[1].slice(0, 9) + '-' + hit[1].slice(9);
        if (nitDvOk(normFb)) {
          candidates.push({
            norm: normFb,
            source: 'fallback-dv-ok',
            score: 60,
            lineCtx: text.slice(Math.max(0, hit.index - 30), hit.index + 40),
          });
        }
      }
    }

    if (!candidates.length) return null;

    candidates.sort(function (a, b) {
      var aOk = nitDvOk(a.norm);
      var bOk = nitDvOk(b.norm);
      if (aOk && !bOk) return -1;
      if (!aOk && bOk) return 1;
      var aBad = nitDvWrong(a.norm);
      var bBad = nitDvWrong(b.norm);
      if (!aBad && bBad) return -1;
      if (aBad && !bBad) return 1;
      return scoreNitCandidate(b) - scoreNitCandidate(a);
    });

    var best = candidates[0];
    var bestScore = scoreNitCandidate(best);
    if (bestScore < 45) return null;

    var v = best.validacion || validarIdentificador(best.norm);
    if (!v || !v.norm) return null;
    v.fuenteExtraccion = best.source;
    v.scoreExtraccion = bestScore;
    v.dvVerificado = nitDvOk(v.norm);
    if (v.dvVerificado) v.ok = true;
    return v;
  }

  function extractRazonSocialColombia(text, lines, meta) {
    meta = meta || {};
    var fn = razonFromFilename(meta.nombreArchivo);
    if (fn) return { value: fn, conf: 0.88 };

    var i;
    for (i = 0; i < lines.length; i++) {
      if (/^35\.?\s*Raz[oó]n\s+social\s*$/i.test(String(lines[i] || '').trim())) {
        var ln35 = cleanFieldValue(lines[i + 1] || '');
        if (ln35 && !looksLikeFormLabel(ln35) && !/^36\./.test(ln35)) {
          return { value: ln35.toUpperCase(), conf: 0.95 };
        }
      }
    }
    for (i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!/S\.?A\.?S\.?|LTDA|LIMITADA|S\.?A\.?[^A-Z]|E\.U\./i.test(line)) continue;
      if (looksLikeFormLabel(line)) continue;
      var cleaned = line
        .replace(/^\d+\.\s*Raz[oó]n\s+social\s*/i, '')
        .replace(/^\d+\.\s*/i, '')
        .trim();
      cleaned = cleanFieldValue(cleaned);
      if (cleaned.length >= 4 && /[A-ZÁÉÍÓÚ]/.test(cleaned)) {
        return { value: cleaned.toUpperCase(), conf: 0.9 };
      }
    }

    var block = text.match(
      /35\.?\s*Raz[oó]n\s+social\s+([A-Z0-9][A-Z0-9\s\.\&\-\']{3,90}?)(?=\s+\d{1,2}\.\s|\s+31\.|\s+24\.|$)/i
    );
    if (block && block[1]) {
      var b = cleanFieldValue(block[1].toUpperCase());
      if (b) return { value: b, conf: 0.82 };
    }

    for (i = 0; i < lines.length; i++) {
      line = lines[i];
      if (line.length < 10 || line.length > 90) continue;
      if (!/[A-ZÁÉÍÓÚ]{3,}/.test(line)) continue;
      if (looksLikeFormLabel(line)) continue;
      if (/DIAN|IMPUESTOS|CERTIFICADO|REGISTRO/i.test(line)) continue;
      if (/S\.?A\.?S|LTDA/i.test(line)) {
        return { value: line.toUpperCase(), conf: 0.7 };
      }
    }
    return { value: '', conf: 0 };
  }

  function extractNombreComercialDian(text, lines) {
    var i;
    for (i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!/36\.?\s*Nombre\s+comercial/i.test(line)) continue;
      var enLinea = line
        .replace(/^.*?36\.?\s*Nombre\s+comercial\s*/i, '')
        .replace(/\s*37\.?\s*Sigla.*$/i, '')
        .trim();
      enLinea = cleanFieldValue(enLinea);
      if (enLinea && enLinea.length > 2) return enLinea.toUpperCase();
      var nl = cleanFieldValue(lines[i + 1] || '');
      if (nl && !/^37\.|^38\.|UBICACI/i.test(nl) && !looksLikeFormLabel(nl)) {
        var partes = nl.split(/\s{2,}/);
        return (partes[0] || nl).trim().toUpperCase();
      }
    }
    var m = text.match(/36\.?\s*Nombre\s+comercial\s+([^\n]{3,80}?)(?=\s+37\.|\s+38\.|$)/i);
    if (m && m[1]) {
      var v = cleanFieldValue(m[1]);
      if (v) return v.toUpperCase();
    }
    return '';
  }

  function formatTelefonoColombia(digits) {
    digits = String(digits || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length === 12 && /^57/.test(digits)) digits = digits.slice(2);
    var m = digits.match(/3\d{9}/);
    if (m) return m[0];
    if (digits.length >= 7 && digits.length <= 11) return digits;
    return '';
  }

  /** Campo 44 RUT DIAN: teléfono con dígitos separados por espacio en la misma fila que la etiqueta. */
  function extractTelefonoCampo44Dian(text, lines) {
    lines = lines || [];
    var i;
    for (i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!/44\.?\s*Tel[eé]fono/i.test(line)) continue;
      var chunk = line.split(/44\.?\s*Tel[eé]fono\s*/i)[1];
      if (!chunk) continue;
      var before45 = chunk.split(/45\.?\s*Tel[eé]fono/i)[0] || chunk;
      var letterAt = before45.search(/[A-Za-zÁÉÍÓÚáéíóú]/);
      var digitPart = letterAt > 0 ? before45.slice(0, letterAt) : before45;
      var digits = digitPart.replace(/\s/g, '').replace(/[^\d]/g, '');
      var tel = formatTelefonoColombia(digits);
      if (tel) return tel;
    }
    for (i = 0; i < lines.length; i++) {
      line = lines[i];
      if (/^44\.?\s*Tel[eé]fono\s*$/i.test(line.trim()) && lines[i + 1]) {
        tel = formatTelefonoColombia(lines[i + 1].replace(/\s/g, '').replace(/[^\d]/g, ''));
        if (tel) return tel;
      }
    }
    return '';
  }

  function extractNombrePersonaNaturalDian(text, lines) {
    var i;
    for (i = 0; i < lines.length; i++) {
      if (!/31\.?\s*Primer\s+apellido|32\.?\s*Segundo\s+apellido/i.test(lines[i])) continue;
      var j;
      for (j = 1; j <= 5 && i + j < lines.length; j++) {
        var nl = String(lines[i + j] || '').trim();
        if (/^35\.|Raz[oó]n\s+social|36\.|Persona\s+jur[ií]dica/i.test(nl)) break;
        if (looksLikeFormLabel(nl)) continue;
        if (/^\d{1,2}\.\s+[A-Za-z]/.test(nl) && !/[áéíóúñÁÉÍÓÚÑ]{2,}/i.test(nl)) continue;
        if (nl.length >= 5 && /[A-Za-zÁÉÍÓÚáéíóúñÑ]/.test(nl)) {
          return cleanFieldValue(nl).replace(/\s+/g, ' ').toUpperCase();
        }
      }
    }
    var parts = [];
    var re =
      /31\.?\s*Primer\s+apellido\s+([^\n]+?)\s+32\.?\s*Segundo\s+apellido\s+([^\n]+?)\s+33\.?\s*Primer\s+nombre\s+([^\n]+?)(?:\s+34\.|$)/i;
    var m = text.match(re);
    if (m) {
      [m[1], m[2], m[3]].forEach(function (x) {
        x = cleanFieldValue(x);
        if (x && !looksLikeFormLabel(x)) parts.push(x);
      });
      if (parts.length) return parts.join(' ').toUpperCase();
    }
    return '';
  }

  function resolveNombreParaBanco(p) {
    p = p || {};
    if (p.nombreParaBanco) return p.nombreParaBanco;
    if (p.tipoPersona && p.tipoPersona.tipo === 'natural') {
      return p.nombrePersonaNatural || p.razonSocial || p.nombreComercial || '';
    }
    return p.razonSocial || p.representante || p.nombrePersonaNatural || p.nombreComercial || '';
  }

  function resolveNombreDirectorio(p) {
    p = p || {};
    return (
      p.nombreComercial ||
      p.nombreParaBanco ||
      p.razonSocial ||
      p.nombrePersonaNatural ||
      ''
    );
  }

  function extractDianField(text, lines, fieldRe, valueTest) {
    var m = text.match(fieldRe);
    if (m && m[1]) {
      var v = cleanFieldValue(m[1]);
      if (v && (!valueTest || valueTest(v))) return v;
    }
    return '';
  }

  /** Campo 24 RUT + inferencia por razón social. */
  function extractTipoPersonaDian(text, lines, razonSocial) {
    var m = text.match(
      /24\.?\s*Tipo\s+de\s+contribuyente\s+([^\n]{4,50}?)(?=\s+\d{1,2}\.\s|\s+25\.|$)/i
    );
    if (m && m[1]) {
      var v = cleanFieldValue(m[1]);
      if (/jur[ií]dica/i.test(v)) return { tipo: 'juridica', etiqueta: v, confianza: 0.9 };
      if (/natural/i.test(v)) return { tipo: 'natural', etiqueta: v, confianza: 0.9 };
    }
    var i;
    for (i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (/Persona\s+jur[ií]dica/i.test(line) && !/Persona\s+natural/i.test(line)) {
        if (/\bSI\b|\bS[IÍ]\b|✓|√|X\b/i.test(line) || line.length < 35) {
          return { tipo: 'juridica', etiqueta: 'Persona jurídica', confianza: 0.75 };
        }
      }
      if (/Persona\s+natural/i.test(line) && !/jur[ií]dica/i.test(line)) {
        if (/\bSI\b|\bS[IÍ]\b|✓|√|X\b/i.test(line) || line.length < 35) {
          return { tipo: 'natural', etiqueta: 'Persona natural', confianza: 0.75 };
        }
      }
    }
    if (/S\.?A\.?S\.?|LTDA|LIMITADA|S\.?A\.?\s|E\.U\.|INC\b/i.test(razonSocial || '')) {
      return { tipo: 'juridica', etiqueta: 'Inferido por razón social (SAS/LTDA)', confianza: 0.7 };
    }
    if (razonSocial && !/S\.?A\.?S|LTDA/i.test(razonSocial)) {
      var parts = String(razonSocial).trim().split(/\s+/);
      if (parts.length >= 2 && parts.length <= 5 && /^[A-ZÁÉÍÓÚ]/i.test(razonSocial)) {
        return { tipo: 'natural', etiqueta: 'Inferido por nombre tipo persona', confianza: 0.45 };
      }
    }
    return { tipo: 'desconocido', etiqueta: '', confianza: 0 };
  }

  /** Actividades económicas CIIU (campos 46–48 y tabla del RUT). */
  function extractActividadesEconomicasDian(text, lines) {
    var byCode = {};
    var re = /(\d{2})\.?\s*C[oó]digo\s*(\d{4})/gi;
    var m;
    while ((m = re.exec(text)) !== null) {
      byCode[m[2]] = {
        codigo: m[2],
        descripcion: '',
        orden: parseInt(m[1], 10) || 0,
        principal: Object.keys(byCode).length === 0,
      };
    }
    var re2 = /\b(\d{4})\s+(\d{2})\s+([A-Za-zÁÉÍÓÚ][A-Za-záéíóúñÑ0-9\s,\.\-]{8,120})/g;
    while ((m = re2.exec(text)) !== null) {
      var desc = cleanFieldValue(m[3]);
      if (!desc || looksLikeFormLabel(desc)) continue;
      if (!byCode[m[1]]) {
        byCode[m[1]] = { codigo: m[1], descripcion: desc, orden: parseInt(m[2], 10) || 0, principal: false };
      } else {
        byCode[m[1]].descripcion = desc;
      }
    }
    var i;
    for (i = 0; i < lines.length; i++) {
      var line = lines[i];
      var lm = line.match(/^(\d{4})\s+(.+)$/);
      if (lm) {
        var d = cleanFieldValue(lm[2]);
        if (d && !looksLikeFormLabel(d)) {
          if (!byCode[lm[1]]) {
            byCode[lm[1]] = { codigo: lm[1], descripcion: d, orden: 0, principal: false };
          } else if (!byCode[lm[1]].descripcion) {
            byCode[lm[1]].descripcion = d;
          }
        }
      }
    }
    var list = Object.keys(byCode)
      .map(function (k) {
        return byCode[k];
      })
      .sort(function (a, b) {
        return (a.orden || 99) - (b.orden || 99);
      });
    if (list.length && !list.some(function (a) {
      return a.principal;
    })) {
      list[0].principal = true;
    }
    return list;
  }

  /** Obligaciones tributarias (códigos 05, 07, 14, etc.). */
  function extractObligacionesDian(text, lines) {
    var out = [];
    var seen = {};
    var inSection = false;
    var i;
    for (i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (/^Obligaciones\b/i.test(line) || /Obligaciones\s+tributarias/i.test(line)) {
        inSection = true;
        continue;
      }
      if (inSection && /^(Actividades|Establecimientos|Responsabilidades|Usuarios|RUT\s)/i.test(line)) {
        break;
      }
      var m = line.match(/^(\d{2})\s+(.+)$/);
      if (!m) m = line.match(/(\d{2})\s*[-–]\s*(.+)/);
      if (m) {
        var cod = m[1];
        var desc = cleanFieldValue(m[2]);
        if (desc && !seen[cod] && desc.length > 3) {
          seen[cod] = true;
          out.push({
            codigo: cod,
            descripcion: desc,
            activa: true,
            esRetencion: /^07|RETENCI[oó]N/i.test(cod + ' ' + desc),
          });
        }
      }
    }
    var re = /\b(\d{2})\s*[-–]\s*((?:Impuesto|Retenci[oó]n|Informante|IVA|Consumo|Declaraci[oó]n)[^\n]{4,90})/gi;
    while ((m = re.exec(text)) !== null) {
      var c = m[1];
      var d = cleanFieldValue(m[2]);
      if (!d || seen[c]) continue;
      seen[c] = true;
      out.push({
        codigo: c,
        descripcion: d,
        activa: true,
        esRetencion: /^07|RETENCI/i.test(c + ' ' + d),
      });
    }
    out.sort(function (a, b) {
      return a.codigo.localeCompare(b.codigo);
    });
    return out;
  }

  function detectRegimenTributarioDian(text, obligaciones) {
    var upper = String(text || '').toUpperCase();
    var esSimple =
      /R[EÉ]GIMEN\s+SIMPLE|SIMPLE\s+DE\s+TRIBUTACI[OÓ]N|\bRST\b|TRIBUTACI[OÓ]N\s+SIMPLIFICADA/i.test(
        upper
      );
    var esOrdinario =
      !esSimple && /R[EÉ]GIMEN\s+ORDINARIO|R[EÉ]GIMEN\s+COM[IÚ]N|GRAN\s+CONTRIBUYENTE/i.test(upper);
    var label = '';
    if (esSimple) {
      var m = text.match(
        /R[eé]gimen\s+Simple[^\n]{0,100}|Simple\s+de\s+Tributaci[oó]n[^\n]{0,80}/i
      );
      label = m ? cleanFieldValue(m[0]) : 'Régimen Simple de Tributación';
    } else if (esOrdinario) {
      label = 'Régimen ordinario / común';
    }
    return {
      codigo: esSimple ? 'simple' : esOrdinario ? 'ordinario' : 'otro',
      etiqueta: label,
      esSimple: esSimple,
      esOrdinario: esOrdinario,
    };
  }

  function normalizeCiudadNombre(s) {
    return String(s || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .replace(/\s+d\.?\s*c\.?$/i, '')
      .replace(/\s+dc$/i, '');
  }

  function ciudadesCoinciden(ciudadA, ciudadB) {
    var a = normalizeCiudadNombre(ciudadA);
    var b = normalizeCiudadNombre(ciudadB);
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.length >= 4 && b.length >= 4 && (a.indexOf(b) >= 0 || b.indexOf(a) >= 0)) return true;
    return false;
  }

  function getEmpresaSedeTributaria() {
    try {
      if (global.config && global.config.get) {
        var emp = global.config.get('empresa') || {};
        return {
          ciudad: String(emp.ciudad || emp.ciudadMunicipio || '').trim(),
          departamento: String(emp.departamento || '').trim(),
        };
      }
    } catch (_) {}
    return { ciudad: '', departamento: '' };
  }

  function getImpuestosEmpresaConfig() {
    try {
      if (global.config && global.config.get) {
        var imp = global.config.get('impuestos') || {};
        return {
          retencionFuente: imp.retencionFuente || { aplica: false, tarifa: 0.025 },
          retencionICA: imp.retencionICA || { aplica: false, tarifa: 0 },
        };
      }
    } catch (_) {}
    return {
      retencionFuente: { aplica: false, tarifa: 0.025 },
      retencionICA: { aplica: false, tarifa: 0 },
    };
  }

  function extractUbicacionDian(text, lines) {
    text = String(text || '');
    lines = lines || [];
    var ciudad = '';
    var departamento = '';
    var i;
    for (i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!/38\.|40\.|41\.|COLOMBIA|Ciudad\/Municipio|Departamento/i.test(line)) continue;
      if (/Risaralda|Antioquia|Cundinamarca|Valle del Cauca|Atl[aá]ntico|Bol[ií]var|Nari[nñ]o/i.test(line)) {
        var dm = line.match(
          /(Risaralda|Antioquia|Cundinamarca|Valle(?:\s+del\s+Cauca)?|Atl[aá]ntico|Bol[ií]var|Nari[nñ]o|Caldas|Quind[ií]o)/i
        );
        if (dm) departamento = cleanFieldValue(dm[1]);
      }
      if (
        /Pereira|Bogot[aá]|Medell[ií]n|Cali|Barranquilla|Manizales|Armenia|Cartagena|Bucaramanga/i.test(
          line
        )
      ) {
        var cm = line.match(
          /(Pereira|Bogot[aá](?:\s+D\.?C\.?)?|Medell[ií]n|Cali|Barranquilla|Manizales|Armenia|Cartagena|Bucaramanga)/i
        );
        if (cm) ciudad = cleanFieldValue(cm[1]);
      }
      var bloque = line.match(
        /COLOMBIA[\s\d]*([A-Za-zÁÉÍÓÚáéíóúñÑ]{4,28})[\s\d]+([A-Za-zÁÉÍÓÚáéíóúñÑ]{4,28})/i
      );
      if (bloque) {
        if (!departamento) departamento = cleanFieldValue(bloque[1]);
        if (!ciudad) ciudad = cleanFieldValue(bloque[2]);
      }
    }
    if (!ciudad) {
      ciudad =
        extractDianField(text, lines, /41\.?\s*Ciudad\/Municipio\s+([^\n\r]{3,50}?)(?=\s+\d{1,2}\.\s|$)/i) ||
        '';
    }
    if (!departamento) {
      departamento =
        extractDianField(text, lines, /40\.?\s*Departamento\s+([^\n\r]{3,40}?)(?=\s+\d{1,2}\.\s|$)/i) || '';
    }
    return { ciudad: ciudad, departamento: departamento };
  }

  /**
   * Retención renta (fuente) + RETE ICA.
   * ICA: solo si sede y proveedor misma ciudad, ICA activa en impuestos, y aplica retención renta primero.
   */
  function computeRetencionesProveedor(regimenInfo, obligaciones, tipoPersona, opts) {
    regimenInfo = regimenInfo || {};
    obligaciones = obligaciones || [];
    opts = opts || {};
    var impCfg = getImpuestosEmpresaConfig();
    var sede = getEmpresaSedeTributaria();
    var ciudadProv = String(opts.ciudadProveedor || opts.ciudad || '').trim();
    var mismaCiudad = ciudadesCoinciden(ciudadProv, sede.ciudad);

    var retRenta;
    if (regimenInfo.esSimple) {
      retRenta = {
        aplica: false,
        exento: true,
        motivo:
          'Régimen Simple de Tributación — no aplican retenciones en la fuente (renta).',
        regimenCodigo: 'simple',
        obligacionesRetencion: [],
      };
    } else {
      var retObs = obligaciones.filter(function (o) {
        return o.esRetencion || /^07\b/.test(o.codigo);
      });
      var aplicaRenta = retObs.length > 0;
      retRenta = {
        aplica: aplicaRenta,
        exento: !aplicaRenta,
        motivo: aplicaRenta
          ? 'Obligación ' + retObs[0].codigo + ': ' + retObs[0].descripcion
          : 'Sin obligación 07 en RUT — revise contador antes de retener renta.',
        regimenCodigo: regimenInfo.codigo || 'otro',
        obligacionesRetencion: retObs,
      };
    }

    var retIca = {
      aplica: false,
      exento: true,
      tarifa: impCfg.retencionICA.tarifa || 0,
      mismaCiudad: mismaCiudad,
      ciudadProveedor: ciudadProv,
      ciudadSede: sede.ciudad,
      motivo: '',
    };

    if (!impCfg.retencionICA.aplica) {
      retIca.motivo = 'RETE ICA desactivada en Administración → Impuestos.';
    } else if (!sede.ciudad) {
      retIca.motivo =
        'Configure la ciudad de la sede en Administración → Empresa para evaluar RETE ICA.';
      retIca.pendienteConfig = true;
    } else if (!ciudadProv) {
      retIca.motivo =
        'Ciudad del proveedor no detectada — complete en el RUT o en la ficha del proveedor.';
      retIca.pendienteDatos = true;
    } else if (!mismaCiudad) {
      retIca.motivo =
        'Proveedor (' +
        ciudadProv +
        ') y sede (' +
        sede.ciudad +
        ') son ciudades distintas — no aplica RETE ICA.';
    } else if (retRenta.exento || !retRenta.aplica) {
      retIca.motivo =
        'Misma ciudad (' +
        sede.ciudad +
        '), pero no aplica retención en la fuente (renta) — no se sugiere RETE ICA.';
    } else {
      retIca.aplica = true;
      retIca.exento = false;
      retIca.motivo =
        'Misma ciudad que la sede (' +
        sede.ciudad +
        ') y aplica retención renta — aplicar RETE ICA (tarifa ' +
        (impCfg.retencionICA.tarifa * 1000).toFixed(2) +
        '‰ configurada).';
    }

    return {
      aplicaRetencion: retRenta.aplica,
      exento: retRenta.exento && retIca.exento,
      motivo: retRenta.motivo,
      regimenCodigo: retRenta.regimenCodigo,
      obligacionesRetencion: retRenta.obligacionesRetencion,
      retencionRenta: retRenta,
      retencionICA: retIca,
      aplicaRetencionICA: retIca.aplica,
    };
  }

  function formatActividadesLista(actividades) {
    if (!actividades || !actividades.length) return '—';
    return actividades
      .map(function (a) {
        var p = a.principal ? ' (principal)' : '';
        return a.codigo + (a.descripcion ? ' — ' + a.descripcion : '') + p;
      })
      .join('; ');
  }

  function formatObligacionesLista(obligaciones) {
    if (!obligaciones || !obligaciones.length) return '—';
    return obligaciones
      .map(function (o) {
        return o.codigo + ' — ' + o.descripcion;
      })
      .join('; ');
  }

  function renderRetencionesAlert(p) {
    var ret = p.retenciones || {};
    var ica = ret.retencionICA || {};
    var renta = ret.retencionRenta || ret;
    var html = '';
    if (renta.regimenCodigo || renta.aplicaRetencion !== undefined || renta.exento !== undefined) {
      var clsR = renta.exento ? 'alert-success' : renta.aplica ? 'alert-warning' : 'alert-info';
      html +=
        '<div class="alert ' +
        clsR +
        '" style="margin:10px 0;font-size:0.88rem">' +
        '<strong>Retención renta (fuente):</strong> ' +
        esc(renta.motivo || '—') +
        '</div>';
    }
    if (ica.motivo || ica.aplica || ica.ciudadSede) {
      var clsI = ica.aplica ? 'alert-warning' : ica.pendienteConfig ? 'alert-info' : 'alert-success';
      html +=
        '<div class="alert ' +
        clsI +
        '" style="margin:10px 0;font-size:0.88rem">' +
        '<strong>RETE ICA:</strong> ' +
        esc(ica.motivo || '—') +
        (ica.ciudadProveedor && ica.ciudadSede
          ? ' <span class="form-hint">(' +
            esc(ica.ciudadProveedor) +
            ' vs sede ' +
            esc(ica.ciudadSede) +
            ')</span>'
          : '') +
        '</div>';
    }
    if (!html && ret.motivo) {
      var cls = ret.exento ? 'alert-success' : ret.aplicaRetencion ? 'alert-warning' : 'alert-info';
      html =
        '<div class="alert ' +
        cls +
        '" style="margin:12px 0;font-size:0.88rem">' +
        '<strong>Retenciones:</strong> ' +
        esc(ret.motivo) +
        '</div>';
    }
    return html;
  }

  function getRetencionProveedor(proveedor) {
    var leg = proveedor && proveedor.legal;
    if (leg && leg.retenciones) return leg.retenciones;
    if (leg && leg.regimenTributario && leg.regimenTributario.esSimple) {
      return {
        aplicaRetencion: false,
        exento: true,
        motivo: 'Régimen Simple — no aplica retenciones',
        regimenCodigo: 'simple',
        retencionICA: { aplica: false, exento: true, motivo: 'Régimen Simple' },
      };
    }
    return { aplicaRetencion: true, exento: false, motivo: 'Sin certificado RUT — aplicar criterio contable' };
  }

  function parseDianRutColombia(text, lines, meta) {
    text = String(text || '');
    lines = lines || [];
    meta = meta || {};
    var confianza = { global: 0.5 };
    var nitVal = extractNitColombia(text, lines);
    var identificador = { raw: '', norm: '', display: '', validacion: nitVal };
    if (nitVal && nitVal.norm) {
      identificador.raw = nitVal.display || nitVal.norm;
      identificador.norm = nitVal.norm;
      identificador.display = nitVal.display || formatNitColombia(nitVal.norm);
      identificador.validacion = nitVal;
      confianza.rut = nitVal.dvVerificado ? 0.98 : nitVal.scoreExtraccion >= 100 ? 0.92 : 0.78;
    }

    var rs = extractRazonSocialColombia(text, lines, meta);
    var razonSocial = rs.value || '';
    if (razonSocial) confianza.razonSocial = rs.conf || 0.85;

    var nombreComercial = extractNombreComercialDian(text, lines);
    if (nombreComercial) confianza.nombreComercial = 0.85;

    var nombrePersonaNatural = extractNombrePersonaNaturalDian(text, lines);
    if (nombrePersonaNatural) confianza.nombrePersonaNatural = 0.85;

    var fechas = [];
    var reFecha = /\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/g;
    var fm;
    while ((fm = reFecha.exec(text)) !== null) {
      var iso = parseFecha(fm[0]);
      if (iso) fechas.push(iso);
    }
    fechas.sort();
    var fechaDocumento = fechas.length ? fechas[fechas.length - 1] : null;
    if (fechaDocumento) confianza.fecha = 0.75;

    var anioTributario = null;
    var anioM = text.match(/A[nñ]o\s+(\d{4})/i);
    if (anioM) anioTributario = parseInt(anioM[1], 10);
    if (!anioTributario && fechaDocumento) anioTributario = parseInt(fechaDocumento.slice(0, 4), 10);

    var vigencia = evaluarVigencia(fechaDocumento, anioTributario, new Date());

    var emails = [];
    var em;
    var reMail = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
    while ((em = reMail.exec(text)) !== null) emails.push(em[0].toLowerCase());

    var telefono = extractTelefonoCampo44Dian(text, lines);
    if (!telefono) {
      telefono = extractDianField(
        text,
        lines,
        /Tel[eé]fono\s*\d*\s*[:\s]+([+\d\s\-()]{7,22})/i,
        function (v) {
          return /\d{7,}/.test(v) && !looksLikeFormLabel(v);
        }
      );
    }
    if (!telefono) {
      var tp = text.match(/(\+?57[\s\-]?[13][\d\s\-]{8,12})/);
      if (tp) telefono = tp[1].replace(/\s+/g, ' ').trim();
    }

    var direccion = extractDianField(
      text,
      lines,
      /39\.?\s*Direcci[oó]n\s+principal\s+([^\n\r]{6,100}?)(?=\s+\d{1,2}\.\s|\s+40\.|$)/i
    );
    if (!direccion) {
      direccion = extractDianField(
        text,
        lines,
        /Direcci[oó]n\s+(?:principal|comercial)?\s*[:\s]+([^\n\r]{8,100}?)(?=\s+\d{1,2}\.\s|$)/i
      );
    }

    var ubic = extractUbicacionDian(text, lines);
    var ciudad = ubic.ciudad;
    var departamento = ubic.departamento;

    var actividadesEconomicas = extractActividadesEconomicasDian(text, lines);
    var actividades = actividadesEconomicas.map(function (a) {
      return a.codigo;
    });
    var giro = formatActividadesLista(actividadesEconomicas);
    if (actividadesEconomicas.length) confianza.giro = 0.8;

    var obligaciones = extractObligacionesDian(text, lines);
    if (obligaciones.length) confianza.obligaciones = 0.75;

    var tipoPersona = extractTipoPersonaDian(text, lines, razonSocial);
    if (tipoPersona.tipo !== 'desconocido') confianza.tipoPersona = tipoPersona.confianza || 0.8;

    var regimenTributario = detectRegimenTributarioDian(text, obligaciones);
    var regimen = regimenTributario.etiqueta || extractDianField(
      text,
      lines,
      /(?:R[eé]gimen|Regimen)\s+[:\s]+([^\n\r]{4,60}?)(?=\s+\d{1,2}\.\s|$)/i
    );
    if (regimenTributario.esSimple) confianza.regimen = 0.9;

    var retenciones = computeRetencionesProveedor(regimenTributario, obligaciones, tipoPersona, {
      ciudadProveedor: ciudad,
      departamentoProveedor: departamento,
    });

    var representante = extractDianField(
      text,
      lines,
      /Representante\s+legal\s+([A-ZÁÉÍÓÚ][^\n\r]{4,60}?)(?=\s+\d{1,2}\.\s|$)/i,
      function (v) {
        return !/Certificado|PDF|generaci/i.test(v);
      }
    );
    if (!representante) {
      var m984 = text.match(/984\.?\s*Nombre\s+([A-ZÁÉÍÓÚ][A-ZÁÉÍÓÚ\s]{4,70})/i);
      if (m984 && m984[1]) representante = cleanFieldValue(m984[1]);
    }

    var nombreParaBanco = resolveNombreParaBanco({
      tipoPersona: tipoPersona,
      nombrePersonaNatural: nombrePersonaNatural,
      razonSocial: razonSocial,
      nombreComercial: nombreComercial,
      representante: representante,
    });

    var fechaInicio = parseFecha(
      extractDianField(
        text,
        lines,
        /47\.?\s*Fecha\s+inicio\s+actividad\s+(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i
      )
    );

    var estadoContribuyente = '';
    if (/T[EÉ]RMINO\s+DE\s+GIRO|NO\s+VIGENTE|CESADO/i.test(text)) estadoContribuyente = 'no_vigente';
    else if (/ACTIVO|VIGENTE|HABILITADO/i.test(text)) estadoContribuyente = 'activo';

    var rubroInferido = inferRubroFromGiro(giro);
    if (telefono) confianza.telefono = 0.65;
    if (direccion) confianza.direccion = 0.6;

    var globalScore = 0;
    var n = 0;
    Object.keys(confianza).forEach(function (k) {
      if (k === 'global') return;
      globalScore += confianza[k];
      n++;
    });
    confianza.global = n ? Math.min(0.99, globalScore / n) : 0.4;

    return {
      identificador: identificador,
      razonSocial: razonSocial,
      nombreComercial: nombreComercial,
      nombrePersonaNatural: nombrePersonaNatural,
      nombreParaBanco: nombreParaBanco,
      fechaDocumento: fechaDocumento,
      fechaInicioActividades: fechaInicio,
      anioTributario: anioTributario,
      vigencia: vigencia,
      tipoDoc: 'dian_rut_co',
      email: emails[0] || '',
      telefono: telefono,
      direccion: direccion,
      comuna: '',
      ciudad: ciudad,
      departamento: departamento,
      giro: giro,
      rubroInferido: rubroInferido,
      representante: representante,
      regimen: regimen,
      regimenTributario: regimenTributario,
      tipoPersona: tipoPersona,
      obligaciones: obligaciones,
      actividadesEconomicas: actividadesEconomicas,
      retenciones: retenciones,
      estadoContribuyente: estadoContribuyente,
      actividades: actividades,
      confianza: confianza,
      textoMuestra: text.slice(0, 1200),
      lineasPdf: lines.slice(0, 80),
    };
  }

  function parseTextoCertificado(text, meta) {
    meta = meta || {};
    text = String(text || '');
    var lines = meta.lineasPdf || text.split(/\n+/).map(function (l) {
      return l.trim();
    }).filter(Boolean);

    if (/DIAN|REGISTRO\s+ÚNICO\s+TRIBUTARIO|IMPUESTOS\s+Y\s+ADUANAS|NIT/i.test(text)) {
      var dian = parseDianRutColombia(text, lines, meta);
      if (dian.identificador.norm || dian.razonSocial) return dian;
    }

    var upper = text.toUpperCase();
    var confianza = { global: 0.5 };
    var rutMatch =
      text.match(/\b(\d{1,2}\.?\d{3}\.?\d{3}\s*-\s*[\dkK])\b/i) ||
      text.match(/\b(\d{7,9}\s*-\s*[\dkK])\b/i) ||
      (getPaisTributario() !== 'CL'
        ? text.match(/\b(\d{3}[\.\s]?\d{3}[\.\s]?\d{3}[\-\.]?\d)\b/)
        : null);
    var identificador = { raw: '', norm: '', display: '', validacion: null };
    if (rutMatch) {
      identificador.raw = rutMatch[1].replace(/\s/g, '');
      identificador.validacion = validarIdentificador(identificador.raw);
      identificador.norm = identificador.validacion.norm || normIdentificador(identificador.raw);
      identificador.display = formatIdentificadorDisplay(identificador.norm);
      confianza.rut = identificador.validacion.ok ? 0.95 : 0.75;
    }

    var fechas = [];
    var reFecha = /\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/g;
    var fm;
    while ((fm = reFecha.exec(text)) !== null) {
      var iso = parseFecha(fm[0]);
      if (iso) fechas.push(iso);
    }
    fechas.sort();
    var fechaDocumento = fechas.length ? fechas[fechas.length - 1] : null;
    if (fechaDocumento) confianza.fecha = 0.7;

    var anioMatch = upper.match(/(?:ACTUALIZAD[OA]|VIGENTE|AÑO|ANO)\s*(?:AL?\s*)?(\d{4})/);
    var anioTributario = anioMatch ? parseInt(anioMatch[1], 10) : null;
    if (!anioTributario && fechaDocumento) anioTributario = parseInt(fechaDocumento.slice(0, 4), 10);
    var now = new Date();
    var vigencia = evaluarVigencia(fechaDocumento, anioTributario, now);

    var razonSocial = '';
    var rsPatterns = [
      /RAZ[ÓO]N\s+SOCIAL\s*[:\s]+([^\n\r]{4,120})/i,
      /NOMBRE\s+(?:O\s+)?RAZ[ÓO]N\s+SOCIAL\s*[:\s]+([^\n\r]{4,120})/i,
      /CONTRIBUYENTE\s*[:\s]+([^\n\r]{4,120})/i,
    ];
    for (var ri = 0; ri < rsPatterns.length; ri++) {
      var rm = text.match(rsPatterns[ri]);
      if (rm && rm[1]) {
        razonSocial = cleanFieldValue(rm[1]);
        if (razonSocial) {
          confianza.razonSocial = 0.85;
          break;
        }
      }
    }
    if (!razonSocial) {
      var rsFn = razonFromFilename(meta.nombreArchivo);
      if (rsFn) {
        razonSocial = rsFn;
        confianza.razonSocial = 0.8;
      }
    }
    if (!razonSocial && identificador.norm) {
      var textLines = lines.length ? lines : text.split(/\n/).map(function (l) {
        return l.trim();
      });
      var candidates = textLines.filter(function (l) {
        return l.length > 8 && l.length < 100 && !looksLikeFormLabel(l) && !/^\d{5,}$/.test(l);
      });
      candidates.sort(function (a, b) {
        return b.length - a.length;
      });
      if (candidates[0]) {
        razonSocial = candidates[0];
        confianza.razonSocial = 0.55;
      }
    }

    var tipoDoc = 'desconocido';
    if (/SERVICIO\s+DE\s+IMPUESTOS\s+INTERNOS|SII|INICIO\s+DE\s+ACTIVIDADES/i.test(upper)) {
      tipoDoc = 'sii_chile';
    } else if (/CAMARA\s+DE\s+COMERCIO|DIAN|REGISTRO\s+ÚNICO/i.test(upper)) {
      tipoDoc = 'dian_rut_co';
    }

    var emails = [];
    var em;
    var reMail = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
    while ((em = reMail.exec(text)) !== null) emails.push(em[0].toLowerCase());

    var telefono =
      fieldFromPatterns(text, [
        /TEL[ÉE]FONO(?:\s+COMERCIAL)?\s*[:\s]+([+\d\s\-()]{8,22})/i,
        /FONO\s*[:\s]+([+\d\s\-()]{8,22})/i,
        /(\+?56\s?[29]\d{4}\s?\d{4})/,
        /(\+?57\s?\d{3}\s?\d{3}\s?\d{4})/,
        /(\b[29]\d{8}\b)/,
      ]) || '';
    telefono = telefono.replace(/\s{2,}/g, ' ').trim();

    var direccion = cleanFieldValue(
      fieldFromPatterns(text, [
        /DIRECCI[ÓO]N\s*(?:COMERCIAL|LEGAL|principal)?\s*[:\s]+([^\n\r]{8,120})/i,
        /DOMICILIO\s*[:\s]+([^\n\r]{8,120})/i,
      ])
    );
    var comuna = fieldFromPatterns(text, [/COMUNA\s*[:\s]+([^\n\r]{3,60})/i]);
    var ciudad = fieldFromPatterns(text, [
      /CIUDAD\s*[:\s]+([^\n\r]{3,60})/i,
      /MUNICIPIO\s*[:\s]+([^\n\r]{3,60})/i,
    ]);
    var giro = cleanFieldValue(
      fieldFromPatterns(text, [
        /GIRO\s*[:\s]+([^\n\r]{4,120})/i,
        /ACTIVIDAD\s+ECON[ÓO]MICA\s*[:\s]+([^\n\r]{4,120})/i,
      ])
    );
    var representante = cleanFieldValue(
      fieldFromPatterns(text, [
        /REPRESENTANTE\s+LEGAL\s*[:\s]+([^\n\r]{4,80})/i,
        /NOMBRE\s+REPRESENTANTE\s*[:\s]+([^\n\r]{4,80})/i,
      ])
    );
    var regimen = cleanFieldValue(
      fieldFromPatterns(text, [
        /R[ÉE]GIMEN\s*[:\s]+([^\n\r]{4,80})/i,
        /REGIMEN\s+TRIBUTARIO\s*[:\s]+([^\n\r]{4,80})/i,
      ])
    );
    var fechaInicio = parseFecha(
      fieldFromPatterns(text, [
        /INICIO\s+(?:DE\s+)?ACTIVIDADES?\s*[:\s]+(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i,
        /FECHA\s+INICIO\s*[:\s]+(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i,
      ])
    );
    var estadoContribuyente = '';
    if (/T[EÉ]RMINO\s+DE\s+GIRO|NO\s+VIGENTE|CESADO/i.test(upper)) estadoContribuyente = 'no_vigente';
    else if (/ACTIVO|VIGENTE|HABILITADO/i.test(upper)) estadoContribuyente = 'activo';

    var actividades = [];
    var actRe = /C[ÓO]DIGO\s*[:\s]*(\d{5,6})/gi;
    var actM;
    while ((actM = actRe.exec(text)) !== null) {
      if (actividades.indexOf(actM[1]) < 0) actividades.push(actM[1]);
    }

    var rubroInferido = inferRubroFromGiro(giro);
    if (giro) confianza.giro = 0.75;
    if (telefono) confianza.telefono = 0.65;
    if (direccion) confianza.direccion = 0.6;

    var globalScore = 0;
    var n = 0;
    Object.keys(confianza).forEach(function (k) {
      if (k === 'global') return;
      globalScore += confianza[k];
      n++;
    });
    confianza.global = n ? Math.min(0.99, globalScore / n) : 0.4;

    return {
      identificador: identificador,
      razonSocial: razonSocial,
      fechaDocumento: fechaDocumento,
      fechaInicioActividades: fechaInicio,
      anioTributario: anioTributario,
      vigencia: vigencia,
      tipoDoc: tipoDoc,
      email: emails[0] || '',
      telefono: telefono,
      direccion: direccion,
      comuna: comuna,
      ciudad: ciudad,
      giro: giro,
      rubroInferido: rubroInferido,
      representante: representante,
      regimen: regimen,
      estadoContribuyente: estadoContribuyente,
      actividades: actividades,
      confianza: confianza,
      textoMuestra: text.slice(0, 1200),
    };
  }

  function evaluarVigencia(fechaDocumento, anioTributario, now) {
    now = now || new Date();
    var estado = 'desconocido';
    var notas = [];
    if (fechaDocumento) {
      var fd = new Date(fechaDocumento + 'T12:00:00');
      var meses =
        (now.getFullYear() - fd.getFullYear()) * 12 + (now.getMonth() - fd.getMonth());
      if (meses <= VIGENCIA_MESES) {
        estado = 'vigente';
        notas.push('Documento con menos de ' + VIGENCIA_MESES + ' meses');
      } else if (meses <= VIGENCIA_MESES + 3) {
        estado = 'por_vencer';
        notas.push('Documento antiguo — conviene renovar');
      } else {
        estado = 'desactualizado';
        notas.push('Fecha del documento supera vigencia recomendada');
      }
    }
    if (anioTributario && anioTributario >= now.getFullYear()) {
      if (estado === 'desconocido' || estado === 'desactualizado') estado = 'vigente';
      notas.push('Año tributario ' + anioTributario);
    } else if (anioTributario && anioTributario === now.getFullYear() - 1) {
      if (estado === 'desconocido') estado = 'por_vencer';
    }
    return { estado: estado, anioTributario: anioTributario, notas: notas };
  }

  function vigenciaBadge(estado) {
    if (estado === 'vigente') return '<span class="badge badge-success">Vigente</span>';
    if (estado === 'por_vencer') return '<span class="badge badge-warning">Por revisar</span>';
    if (estado === 'desactualizado') return '<span class="badge badge-danger">Desactualizado</span>';
    return '<span class="badge badge-info">Sin fecha clara</span>';
  }

  function formatFechaIsoDisplay(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
    } catch (_) {
      return String(iso);
    }
  }

  function formatVigenciaTexto(vig) {
    vig = vig || {};
    var map = {
      vigente: 'Certificado vigente',
      por_vencer: 'Por revisar — conviene renovar el RUT',
      desactualizado: 'Desactualizado — renueve el certificado ante la DIAN',
      desconocido: 'Sin fecha clara en el certificado archivado',
    };
    var t = map[vig.estado] || vig.estado || 'Sin evaluar';
    if (vig.anioTributario) t += ' · Año tributario ' + vig.anioTributario;
    if (vig.notas && vig.notas.length) t += ' · ' + vig.notas.join(' · ');
    return t;
  }

  function renderRutCertificadoSection(leg, provId) {
    leg = leg || {};
    var doc = leg.document || {};
    var vig = leg.vigencia || {};
    var estado = vig.estado || 'desconocido';
    var blobId = doc.blobId;
    var sid = String(provId || '')
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'");

    if (!blobId) {
      return (
        '<div class="crozzo-prov-rut crozzo-prov-rut--empty">' +
        '<div class="crozzo-prov-rut__head">' +
        '<p class="form-label">Certificado RUT</p>' +
        vigenciaBadge(estado) +
        '</div>' +
        '<p class="form-hint">No hay certificado archivado en este equipo. Use <strong>Importar certificado RUT</strong> en Compras → Proveedores para guardar el PDF y evaluar vigencia automáticamente.</p>' +
        '</div>'
      );
    }

    return (
      '<div class="crozzo-prov-rut">' +
      '<div class="crozzo-prov-rut__head">' +
      '<p class="form-label">Certificado RUT archivado</p>' +
      vigenciaBadge(estado) +
      '</div>' +
      '<p class="crozzo-prov-rut__file" title="Archivo guardado localmente">📄 ' +
      esc(doc.nombre || 'Certificado RUT.pdf') +
      '</p>' +
      '<p class="form-hint crozzo-prov-rut__meta">' +
      'Guardado en Crozzo: ' +
      esc(formatFechaIsoDisplay(doc.subidoAt)) +
      (leg.fechaDocumento
        ? ' · Fecha en certificado: <strong>' + esc(leg.fechaDocumento) + '</strong>'
        : '') +
      '</p>' +
      '<p class="crozzo-prov-rut__vig-text">' +
      esc(formatVigenciaTexto(vig)) +
      '</p>' +
      '<button type="button" class="btn btn-outline btn-sm" onclick="crozzoProvViewRut(\'' +
      sid +
      '\')">Ver certificado</button>' +
      '</div>'
    );
  }

  function openProveedorRut(provId) {
    var prov = null;
    if (global.CrozzoReservorio && global.CrozzoReservorio.getProveedor) {
      prov = global.CrozzoReservorio.getProveedor(provId);
    }
    var leg = prov && prov.legal;
    var blobId = leg && leg.document && leg.document.blobId;
    if (!blobId) {
      if (global.showToast) global.showToast('Este proveedor no tiene RUT archivado', 'warning');
      return;
    }
    if (!global.CrozzoBlobStore || !global.CrozzoBlobStore.getDataUrl) {
      if (global.showToast) global.showToast('Almacén de documentos no disponible', 'error');
      return;
    }
    if (global.showToast) global.showToast('Abriendo certificado…', 'info');
    global.CrozzoBlobStore.getDataUrl(blobId)
      .then(function (url) {
        if (!url) {
          if (global.showToast) global.showToast('No se encontró el archivo del RUT', 'error');
          return;
        }
        var nombre = (leg.document && leg.document.nombre) || 'RUT.pdf';
        var esPdf = /\.pdf$/i.test(nombre) || String(url).indexOf('application/pdf') >= 0;
        var viewer = esPdf
          ? '<iframe class="crozzo-prov-rut__viewer" src="' +
            esc(url) +
            '" title="Certificado RUT"></iframe>'
          : '<img class="crozzo-prov-rut__viewer-img" src="' +
            esc(url) +
            '" alt="Certificado RUT">';
        var body =
          '<div class="crozzo-prov-rut-view">' +
          '<p class="form-hint" style="margin-bottom:8px">' +
          esc(nombre) +
          ' · ' +
          vigenciaBadge((leg.vigencia && leg.vigencia.estado) || 'desconocido') +
          '</p>' +
          viewer +
          '</div>';
        if (global.showModal) {
          global.showModal('RUT · ' + (prov.nombre || 'Proveedor'), body, {
            wide: true,
            modalClass: 'modal--prov-rut-view',
          });
        }
      })
      .catch(function () {
        if (global.showToast) global.showToast('Error al abrir el certificado', 'error');
      });
  }

  function listProveedores() {
    if (global.CrozzoReservorio && global.CrozzoReservorio.listProveedores) {
      return global.CrozzoReservorio.listProveedores();
    }
    try {
      if (global.config && global.config.get) return global.config.get('proveedoresOC') || [];
    } catch (_) {}
    return [];
  }

  function proveedorNormFromRow(p) {
    return normIdentificador(p.nit || p.NIT || '');
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
    if (a.indexOf(b) >= 0 || b.indexOf(a) >= 0) return 0.85;
    var aw = a.split(/\s+/);
    var bw = b.split(/\s+/);
    var hit = 0;
    aw.forEach(function (w) {
      if (w.length > 3 && bw.indexOf(w) >= 0) hit++;
    });
    return hit / Math.max(aw.length, bw.length);
  }

  function diffFields(extracted, prov) {
    var diffs = [];
    var nom = prov.nombre || prov.name || '';
    if (extracted.razonSocial && nom && nameSimilarity(extracted.razonSocial, nom) < 0.7) {
      diffs.push({ campo: 'Nombre', antes: nom, despues: extracted.razonSocial });
    }
    var nitP = proveedorNormFromRow(prov);
    if (extracted.identificador.norm && nitP && extracted.identificador.norm !== nitP) {
      diffs.push({
        campo: labelIdentificador(),
        antes: prov.nit || '—',
        despues: extracted.identificador.display || extracted.identificador.norm,
      });
    }
    if (extracted.email && prov.email && extracted.email !== prov.email) {
      diffs.push({ campo: 'Correo', antes: prov.email, despues: extracted.email });
    }
    return diffs;
  }

  /** Solo NIT coincidente (no por nombre) activa actualización automática. */
  function matchSuggestsAutoUpdate(matches) {
    if (!matches || !matches.length) return false;
    var top = matches[0];
    if (top.score < 90) return false;
    return /mismo/i.test(top.razon || '');
  }

  function defaultImportItemMode(matches) {
    return matchSuggestsAutoUpdate(matches) ? 'update' : 'create';
  }

  function defaultImportSelectedId(matches) {
    if (!matchSuggestsAutoUpdate(matches)) return null;
    return matches[0].proveedor.id;
  }

  function findMatches(extracted, proveedores) {
    proveedores = proveedores || listProveedores();
    var idNorm = extracted.identificador && extracted.identificador.norm;
    var out = [];
    proveedores.forEach(function (p) {
      var pNorm = proveedorNormFromRow(p);
      var score = 0;
      var razon = '';
      if (idNorm && pNorm && idNorm === pNorm) {
        score = 98;
        razon = 'Mismo ' + labelIdentificador();
      } else if (idNorm && pNorm && idNorm.replace(/-[\dK]$/, '') === pNorm.replace(/-[\dK]$/, '')) {
        score = 85;
        razon = labelIdentificador() + ' casi igual (revise DV)';
      } else {
        var sim = nameSimilarity(extracted.razonSocial, p.nombre || p.name);
        if (sim >= 0.55) {
          score = Math.round(40 + sim * 45);
          razon = 'Nombre similar (' + Math.round(sim * 100) + '%)';
        }
      }
      if (score > 0) {
        out.push({
          proveedor: p,
          score: score,
          razon: razon,
          diffs: diffFields(extracted, p),
        });
      }
    });
    out.sort(function (a, b) {
      return b.score - a.score;
    });
    return out.slice(0, 8);
  }

  function extractFromFile(file) {
    if (!file) return Promise.reject(new Error('Sin archivo'));
    var mime = file.type || '';
    var isPdf = mime.indexOf('pdf') >= 0 || /\.pdf$/i.test(file.name);
    return fileToArrayBuffer(file).then(function (buf) {
      if (isPdf) {
        return extractPdfText(buf).then(function (pdfOut) {
          var meta = { nombreArchivo: file.name, lineasPdf: pdfOut.lines || [] };
          if (!pdfOut.text || pdfOut.text.replace(/\s/g, '').length < 40) {
            return {
              parsed: parseTextoCertificado('', meta),
              metodo: 'pdf-sin-texto',
              ocrRequerido: true,
              archivo: { nombre: file.name, mime: mime },
            };
          }
          return {
            parsed: parseTextoCertificado(pdfOut.text, meta),
            metodo: pdfOut.metodo,
            numPages: pdfOut.numPages,
            ocrRequerido: false,
            archivo: { nombre: file.name, mime: mime },
          };
        });
      }
      return fileToDataUrl(file).then(function (dataUrl) {
        return extractImageText(dataUrl).then(function (imgOut) {
          return {
            parsed: parseTextoCertificado(imgOut.text, { nombreArchivo: file.name }),
            metodo: imgOut.metodo,
            ocrRequerido: true,
            dataUrl: dataUrl,
            archivo: { nombre: file.name, mime: mime || 'image/jpeg' },
          };
        });
      });
    });
  }

  function persistDocumento(file, dataUrl, proveedorId) {
    var store = global.CrozzoBlobStore;
    if (!store || !store.putBlob) {
      return fileToDataUrl(file).then(function (url) {
        return { blobRef: null, dataUrl: url };
      });
    }
    var chain = dataUrl ? Promise.resolve(dataUrl) : fileToDataUrl(file);
    return chain.then(function (url) {
      return store
        .putBlob({
          nombre: file.name,
          mime: file.type || 'application/octet-stream',
          dataUrl: url,
          proveedorId: proveedorId || null,
          refTipo: 'proveedor_legal',
        })
        .then(function (rec) {
          return { blobRef: rec.id, dataUrl: url };
        });
    });
  }

  function buildLegalPayload(extracted, blobRef, meta, form) {
    meta = meta || {};
    form = form || {};
    var p = extracted.parsed || extracted;
    return {
      identificador: {
        tipo: (p.identificador.validacion && p.identificador.validacion.tipo) || labelIdentificador(),
        raw: p.identificador.raw,
        norm: p.identificador.norm,
        display: p.identificador.display,
        dvOk: !!(p.identificador.validacion && p.identificador.validacion.ok),
      },
      razonSocial: form.razonSocial || p.razonSocial,
      nombreComercial: form.nombreComercial || p.nombreComercial || '',
      nombrePersonaNatural: form.nombrePersona || p.nombrePersonaNatural || '',
      nombreParaTransferencias: form.nombreBanco || p.nombreParaBanco || '',
      fechaDocumento: p.fechaDocumento,
      fechaInicioActividades: p.fechaInicioActividades || null,
      vigencia: p.vigencia,
      tipoDoc: p.tipoDoc,
      giro: p.giro || '',
      direccion: p.direccion || '',
      comuna: p.comuna || '',
      ciudad: (form.ciudad || p.ciudad || '').trim(),
      departamento: p.departamento || '',
      regimen: p.regimen || (p.regimenTributario && p.regimenTributario.etiqueta) || '',
      regimenTributario: p.regimenTributario || null,
      tipoPersona: p.tipoPersona || { tipo: 'desconocido', etiqueta: '' },
      estadoContribuyente: p.estadoContribuyente || '',
      actividades: p.actividades || [],
      actividadesEconomicas: p.actividadesEconomicas || [],
      obligaciones: p.obligaciones || [],
      retenciones: p.retenciones || null,
      representanteLegal: form.representante || p.representante || '',
      documento: {
        blobId: blobRef || null,
        nombre: (meta.archivo && meta.archivo.nombre) || '',
        subidoAt: new Date().toISOString(),
      },
      extraccion: {
        metodo: meta.metodo || 'manual',
        confianzaGlobal: (p.confianza && p.confianza.global) || 0,
        campos: p.confianza || {},
        revisado: true,
        revisadoAt: new Date().toISOString(),
      },
    };
  }

  function upsertProveedorFinal(payload) {
    if (global.CrozzoReservorio && global.CrozzoReservorio.upsertProveedor) {
      return global.CrozzoReservorio.upsertProveedor(payload);
    }
    if (global.crozzoReservorioUpsertProveedor) {
      return global.crozzoReservorioUpsertProveedor(payload);
    }
    return null;
  }

  function mergeLegal(existing, nuevo) {
    return Object.assign({}, existing && typeof existing === 'object' ? existing : {}, nuevo);
  }

  function applyProveedor(opts) {
    opts = opts || {};
    var extracted = opts.extracted;
    var p = extracted.parsed || extracted;
    var matches = opts.matches || [];
    var mode = opts.mode || 'create';
    var provId = opts.proveedorId || null;
    var form = opts.form || {};

    var nombreBanco = (form.nombreBanco || p.nombreParaBanco || '').trim();
    var razonSocial = (form.razonSocial || p.razonSocial || '').trim();
    var nombreComercial = (form.nombreComercial || p.nombreComercial || '').trim();
    var nombrePersona = (form.nombrePersona || p.nombrePersonaNatural || '').trim();
    var esNatural = p.tipoPersona && p.tipoPersona.tipo === 'natural';

    if (!nombreBanco) {
      return {
        ok: false,
        error: esNatural
          ? 'Indique el nombre para transferencias (como aparece en banco)'
          : 'Indique el nombre para transferencias / pagos',
      };
    }
    if (esNatural && !nombrePersona && !razonSocial) {
      return { ok: false, error: 'Persona natural: complete el nombre en el RUT (campos 31–34)' };
    }
    if (!esNatural && !razonSocial && p.tipoPersona && p.tipoPersona.tipo === 'juridica') {
      return { ok: false, error: 'Persona jurídica: razón social requerida' };
    }

    var nombre =
      (form.nombreDirectorio || nombreComercial || nombreBanco || razonSocial || nombrePersona).trim();
    if (!nombre) return { ok: false, error: 'Nombre en directorio requerido' };

    var nitDisplay = form.nit || p.identificador.display || p.identificador.norm || '';
    var ciudadFinal = (form.ciudad || p.ciudad || '').trim();
    if (ciudadFinal) p.ciudad = ciudadFinal;
    if (p.regimenTributario !== undefined || (p.obligaciones && p.obligaciones.length)) {
      p.retenciones = computeRetencionesProveedor(
        p.regimenTributario || {},
        p.obligaciones || [],
        p.tipoPersona,
        { ciudadProveedor: ciudadFinal }
      );
    }
    var legal = buildLegalPayload(
      extracted,
      opts.blobRef,
      {
        metodo: extracted.metodo,
        archivo: extracted.archivo,
      },
      {
        nombreBanco: nombreBanco,
        razonSocial: razonSocial,
        nombreComercial: nombreComercial,
        nombrePersona: nombrePersona,
        representante: form.representante,
        ciudad: ciudadFinal,
      }
    );

    var existing = null;
    if (mode === 'update' && provId) {
      existing =
        (global.CrozzoReservorio && global.CrozzoReservorio.getProveedor
          ? global.CrozzoReservorio.getProveedor(provId)
          : null) || (matches[0] && matches[0].proveedor);
    }

    var payload = {
      id: mode === 'update' && provId ? provId : undefined,
      forceNew: mode === 'create',
      nombre: nombre,
      nit: nitDisplay,
      telefono: (form.telefono || p.telefono || (existing && existing.telefono) || '').trim(),
      email: (form.email || p.email || (existing && existing.email) || '').trim(),
      tipoRubro: (
        form.tipoRubro ||
        p.rubroInferido ||
        (existing && (existing.tipoRubro || existing.categoria)) ||
        'Otro'
      ).trim(),
      representante: (
        form.representante ||
        p.representante ||
        (existing && existing.representante) ||
        ''
      ).trim(),
      legal: mergeLegal(existing && existing.legal, legal),
    };

    var row = upsertProveedorFinal(payload);
    if (!row) return { ok: false, error: 'No se pudo guardar' };
    try {
      if (global.config && global.config.addAudit) {
        global.config.addAudit(
          mode === 'update' ? 'proveedor_doc_actualizado' : 'proveedor_doc_creado',
          nombre + ' · ' + (p.identificador.norm || nitDisplay)
        );
      }
    } catch (_) {}
    var toastMsg = nombre + ' guardado';
    if (legal.retenciones) {
      if (legal.retenciones.retencionICA && legal.retenciones.retencionICA.aplica) {
        toastMsg += ' — RETE ICA aplica (misma ciudad)';
      } else if (legal.retenciones.exento && legal.retenciones.retencionRenta && legal.retenciones.retencionRenta.exento) {
        toastMsg += ' — sin retención renta';
      } else if (legal.retenciones.aplicaRetencion) {
        toastMsg += ' — retención renta';
      }
    }
    return { ok: true, row: row, mode: mode, toastMsg: toastMsg };
  }

  function renderImportBlock(prefix) {
    prefix = prefix || 'crozzo-prov-doc';
    var idLabel = labelIdentificador();
    return (
      '<div class="crozzo-prov-doc crozzo-prov-doc--premium" id="' +
      esc(prefix) +
      '-wrap" data-prov-doc-root="' +
      esc(prefix) +
      '">' +
      '<div class="crozzo-prov-doc__hero">' +
      '<h3 class="crozzo-prov-doc__title">Importar certificado ' +
      esc(idLabel) +
      '</h3>' +
      '<p class="form-hint">Lectura inteligente del RUT DIAN: identificación, nombres, banco, actividades y retenciones. Revise en el panel editable antes de guardar.</p>' +
      '</div>' +
      '<div class="crozzo-prov-doc__status crozzo-prov-doc__status--info" data-prov-doc-status role="status">' +
      'Preparando… haga clic en la zona o arrastre archivos.' +
      '</div>' +
      '<div class="crozzo-prov-doc__drop" data-prov-doc-drop tabindex="0" role="button" aria-label="Subir certificado">' +
      '<input type="file" class="crozzo-prov-doc__input" accept=".pdf,image/jpeg,image/png,image/webp" multiple data-prov-doc-input>' +
      '<div class="crozzo-prov-doc__drop-inner">' +
      '<span class="crozzo-prov-doc__drop-icon" aria-hidden="true">📄</span>' +
      '<p class="crozzo-prov-doc__drop-title"><strong>Clic aquí</strong> o arrastre PDF / imagen</p>' +
      '<p class="form-hint">PDF del SII o cámara de comercio (texto seleccionable). Varias fichas: cola masiva.</p>' +
      '<button type="button" class="btn btn-primary btn-sm" data-prov-doc-pick>Elegir archivos</button>' +
      '</div></div>' +
      '<ul class="crozzo-prov-doc__checklist form-hint">' +
      '<li>' +
      esc(idLabel) +
      ' con dígito verificador</li>' +
      '<li>Razón social y vigencia tributaria</li>' +
      '<li>Tipo persona, actividades CIIU y obligaciones</li>' +
      '<li>Régimen Simple → sin retenciones</li>' +
      '<li>Match con proveedores existentes</li></ul>' +
      '<div class="crozzo-prov-doc__queue" data-prov-doc-queue hidden></div>' +
      '<div class="crozzo-prov-doc__wizard" data-prov-doc-wizard hidden></div>' +
      '</div>'
    );
  }

  function getWizardState(prefix) {
    var key = '__crozzoProvDoc_' + prefix;
    if (!global[key]) global[key] = { items: [], active: null, step: 'idle' };
    return global[key];
  }

  function setImportStatus(root, msg, type) {
    if (!root) return;
    var el = root.querySelector('[data-prov-doc-status]');
    if (!el) return;
    el.textContent = msg;
    el.className = 'crozzo-prov-doc__status crozzo-prov-doc__status--' + (type || 'info');
    el.hidden = false;
  }

  function isPdfFile(file) {
    if (!file) return false;
    var t = String(file.type || '').toLowerCase();
    if (t === 'application/pdf') return true;
    return /\.pdf$/i.test(String(file.name || ''));
  }

  function revokeItemPreview(item) {
    if (!item) return;
    if (item.previewBlobUrl) {
      try {
        URL.revokeObjectURL(item.previewBlobUrl);
      } catch (_) {}
      item.previewBlobUrl = null;
    }
  }

  function assignItemPreview(item, file, dataUrl) {
    revokeItemPreview(item);
    item.previewType = null;
    item.previewUrl = null;
    if (!file) return;
    if (String(file.type || '').indexOf('image') >= 0 && dataUrl) {
      item.previewUrl = dataUrl;
      item.previewType = 'image';
      return;
    }
    if (isPdfFile(file)) {
      try {
        item.previewBlobUrl = URL.createObjectURL(file);
        item.previewUrl = item.previewBlobUrl;
        item.previewType = 'pdf';
      } catch (_) {
        if (dataUrl) {
          item.previewUrl = dataUrl;
          item.previewType = 'pdf';
        }
      }
    }
  }

  function bindDocumentPreview(wizardEl, item) {
    if (!wizardEl || !item) return;
    if (item.previewType === 'pdf' && item.previewUrl) {
      var iframe = wizardEl.querySelector('[data-prov-doc-pdf]');
      if (iframe && iframe.getAttribute('src') !== item.previewUrl) {
        iframe.setAttribute('src', item.previewUrl);
      }
    }
    if (item.previewType === 'image' && item.previewUrl) {
      var img = wizardEl.querySelector('[data-prov-doc-preview]');
      if (img && img.getAttribute('src') !== item.previewUrl) {
        img.setAttribute('src', item.previewUrl);
      }
    }
  }

  function renderDocumentViewer(item) {
    if (!item || !item.previewUrl) {
      return (
        '<div class="crozzo-prov-doc__viewer crozzo-prov-doc__viewer--empty">' +
        '<p class="form-hint">Sin vista previa del archivo. Si es PDF escaneado, use los datos del formulario a la derecha.</p>' +
        '</div>'
      );
    }
    if (item.previewType === 'pdf') {
      return (
        '<div class="crozzo-prov-doc__viewer">' +
        '<iframe class="crozzo-prov-doc__pdf" data-prov-doc-pdf title="Certificado PDF" src=""></iframe>' +
        '<a class="btn btn-outline btn-sm crozzo-prov-doc__open-tab" href="' +
        esc(item.previewUrl) +
        '" target="_blank" rel="noopener">Abrir PDF en pestaña</a>' +
        '</div>'
      );
    }
    return (
      '<div class="crozzo-prov-doc__viewer">' +
      '<img data-prov-doc-preview class="crozzo-prov-doc__preview" alt="Certificado cargado" src="' +
      esc(item.previewUrl) +
      '">' +
      '</div>'
    );
  }

  function refreshImportUi(prefix) {
    var reg = _importRegistry[prefix];
    if (!reg || !reg.root) return;
    var root = reg.root;
    var st = getWizardState(prefix);
    var queueEl = root.querySelector('[data-prov-doc-queue]');
    var wizardEl = root.querySelector('[data-prov-doc-wizard]');
    if (queueEl) {
      queueEl.hidden = !st.items.length;
      queueEl.innerHTML = st.items.length
        ? '<p class="form-label">Archivos en cola (' + st.items.length + ')</p>' + renderQueue(st)
        : '';
    }
    if (wizardEl) {
      wizardEl.hidden = !st.active;
      wizardEl.innerHTML = st.active ? renderWizardPanel(st, prefix) : '';
      if (st.active) {
        bindDocumentPreview(wizardEl, st.active);
        bindInlineFieldChips(wizardEl);
      }
    }
  }

  function fieldChip(val, required, recommended) {
    var ok = String(val || '').trim().length > 0;
    if (ok) {
      return (
        '<span class="crozzo-prov-doc__chip crozzo-prov-doc__chip--ok" title="Cargado">✓</span>'
      );
    }
    if (required) {
      return (
        '<span class="crozzo-prov-doc__chip crozzo-prov-doc__chip--miss" title="Requerido — no detectado">✗</span>'
      );
    }
    if (recommended) {
      return (
        '<span class="crozzo-prov-doc__chip crozzo-prov-doc__chip--warn" title="Recomendado — complete si aplica">○</span>'
      );
    }
    return (
      '<span class="crozzo-prov-doc__chip crozzo-prov-doc__chip--opt" title="Opcional">·</span>'
    );
  }

  function renderEditRow(label, fieldKey, value, opts) {
    opts = opts || {};
    var req = !!opts.required;
    var rec = !!opts.recommended;
    var hint = opts.hint || '';
    var ph = opts.placeholder || '';
    if (opts.readonly) {
      return (
        '<tr class="crozzo-prov-doc__row">' +
        '<th scope="row">' +
        fieldChip(value, false, false) +
        ' ' +
        esc(label) +
        '</th><td><span class="crozzo-prov-doc__readonly">' +
        esc(String(value || '—')) +
        '</span></td></tr>'
      );
    }
    return (
      '<tr class="crozzo-prov-doc__row' +
      (req ? ' crozzo-prov-doc__row--req' : rec ? ' crozzo-prov-doc__row--rec' : '') +
      '" data-prov-row="' +
      esc(fieldKey) +
      '">' +
      '<th scope="row">' +
      fieldChip(value, req, rec && !req) +
      ' ' +
      esc(label) +
      (req ? ' <span class="crozzo-prov-doc__req" title="Requerido">*</span>' : '') +
      '</th><td>' +
      '<input type="' +
      esc(opts.type || 'text') +
      '" class="form-input crozzo-prov-doc__input-inline" data-prov-f="' +
      esc(fieldKey) +
      '" value="' +
      esc(value || '') +
      '" placeholder="' +
      esc(ph) +
      '">' +
      (hint ? '<p class="form-hint crozzo-prov-doc__row-hint">' + hint + '</p>' : '') +
      '</td></tr>'
    );
  }

  function renderEditableResumen(p) {
    var idLabel = labelIdentificador();
    var esNatural = p.tipoPersona && p.tipoPersona.tipo === 'natural';
    var esJuridica = !esNatural || (p.tipoPersona && p.tipoPersona.tipo === 'juridica');
    var nombreBanco = p.nombreParaBanco || resolveNombreParaBanco(p);
    var nombreDir =
      p.nombreComercial || p.razonSocial || nombreBanco || p.nombrePersonaNatural || '';
    var nitVal = p.identificador.display || p.identificador.norm || '';
    var retRentaTxt =
      p.retenciones && p.retenciones.retencionRenta
        ? p.retenciones.retencionRenta.motivo
        : p.retenciones
          ? p.retenciones.motivo
          : '—';
    var retIcaTxt =
      p.retenciones && p.retenciones.retencionICA
        ? p.retenciones.retencionICA.motivo
        : '—';

    var html =
      '<div class="crozzo-prov-doc__resumen">' +
      '<p class="form-label">Datos del proveedor — edite aquí</p>' +
      '<p class="form-hint crozzo-prov-doc__legend">' +
      '<span class="crozzo-prov-doc__chip crozzo-prov-doc__chip--ok">✓</span> cargado ' +
      '<span class="crozzo-prov-doc__chip crozzo-prov-doc__chip--miss">✗</span> falta (requerido) ' +
      '<span class="crozzo-prov-doc__chip crozzo-prov-doc__chip--warn">○</span> recomendado' +
      '</p>' +
      '<table class="crozzo-prov-doc__table crozzo-prov-doc__table--edit"><tbody>';

    html += renderEditRow('Nombre para banco / transferencias', 'nombre-banco', nombreBanco, {
      required: true,
      hint:
        'Como debe aparecer al pagar o recibir transferencias. En persona natural suele ser el nombre de la persona, no el de la tienda.',
      placeholder: 'Ej. MARÍA LÓPEZ GARCÍA o EMPRESA SAS',
    });
    html += renderEditRow(
      esNatural ? 'Nombre completo (RUT campos 31–34)' : 'Nombre persona natural (si aplica)',
      'nombre-persona',
      p.nombrePersonaNatural || '',
      {
        required: esNatural,
        recommended: esJuridica,
        hint: esNatural
          ? 'Apellidos y nombres del titular según el certificado.'
          : 'Solo si el proveedor es persona natural o desea registrar al titular.',
        placeholder: 'Primer apellido, segundo apellido, nombres…',
      }
    );
    html += renderEditRow('Razón social (campo 35 RUT)', 'razon-social', p.razonSocial || '', {
      required: esJuridica,
      recommended: esNatural,
      hint: 'Nombre legal registrado en DIAN. En jurídicas es obligatorio.',
      placeholder: 'Ej. DISTRIBUIDORA ABC S.A.S.',
    });
    html += renderEditRow('Nombre comercial / tienda', 'nombre-comercial', p.nombreComercial || '', {
      recommended: true,
      hint:
        'Marca o local con el que opera (campo 36). Puede diferir del RUT; útil en directorio y compras.',
      placeholder: 'Ej. Tienda El Buen Precio',
    });
    html += renderEditRow('Nombre en directorio Crozzo', 'nombre-directorio', nombreDir, {
      required: true,
      hint: 'Cómo verá el proveedor en listados del POS (puede ser comercial o razón social).',
      placeholder: 'Nombre corto para buscar en el sistema',
    });
    html += renderEditRow(idLabel, 'nit', nitVal, {
      required: true,
      hint:
        p.identificador.validacion && p.identificador.validacion.dvVerificado
          ? '✓ DV verificado (DIAN)' +
            (p.identificador.validacion.fuenteExtraccion
              ? ' · ' + p.identificador.validacion.fuenteExtraccion
              : '')
          : p.identificador.norm
            ? 'Confirme el dígito verificador con el PDF'
            : 'Campo 5 y 6 del RUT',
      placeholder: '900.123.456-7',
    });
    html += renderEditRow('Teléfono', 'tel', p.telefono || '', {
      recommended: true,
      placeholder: '300…',
    });
    html += renderEditRow('Correo', 'email', p.email || '', {
      recommended: true,
      type: 'email',
      placeholder: 'correo@empresa.com',
    });
    html += renderEditRow('Representante legal', 'rep', p.representante || '', {
      recommended: esJuridica,
      hint: 'Campo 984 o representante en pie de página del RUT.',
    });
    html +=
      '<tr class="crozzo-prov-doc__row crozzo-prov-doc__row--rec" data-prov-row="rubro">' +
      '<th scope="row">' +
      fieldChip(p.rubroInferido, false, true) +
      ' Rubro</th><td><select class="form-input crozzo-prov-doc__input-inline" data-prov-f="rubro">' +
      rubroOptionsHtml(p.rubroInferido || 'Otro') +
      '</select><p class="form-hint crozzo-prov-doc__row-hint">Clasificación interna Crozzo.</p></td></tr>';

    html += renderEditRow(
      'Tipo persona',
      '',
      (p.tipoPersona && p.tipoPersona.etiqueta) || (p.tipoPersona && p.tipoPersona.tipo) || '—',
      { readonly: true }
    );
    html += renderEditRow('Vigencia certificado', '', (p.vigencia && p.vigencia.estado) || '—', {
      readonly: true,
    });
    html += renderEditRow('Retención renta (fuente)', '', retRentaTxt, { readonly: true });
    html += renderEditRow('RETE ICA', '', retIcaTxt, { readonly: true });
    html += renderEditRow('Dirección', '', p.direccion || '—', { readonly: true });
    html += renderEditRow('Ciudad / municipio (RUT)', 'ciudad', p.ciudad || '', {
      recommended: true,
      hint:
        'Para RETE ICA debe coincidir con la ciudad de su sede (Administración → Empresa). Si cambia la ciudad, vuelva a importar o guarde y edite la ficha.',
      placeholder: 'Ej. Pereira, Bogotá',
    });
    if (p.departamento) {
      html += renderEditRow('Departamento', '', p.departamento, { readonly: true });
    }
    html += renderEditRow('Giro / CIIU', '', p.giro || '—', { readonly: true });
    html += renderEditRow('Obligaciones', '', formatObligacionesLista(p.obligaciones), {
      readonly: true,
    });
    html += renderEditRow(
      'Fecha documento',
      '',
      (p.fechaDocumento || '—') + (p.anioTributario ? ' · Año ' + p.anioTributario : ''),
      { readonly: true }
    );

    html += '</tbody></table></div>';
    return html;
  }

  function bindInlineFieldChips(wizardEl) {
    if (!wizardEl) return;
    wizardEl.querySelectorAll('[data-prov-f]').forEach(function (inp) {
      if (inp.tagName === 'SELECT') return;
      inp.addEventListener('input', function () {
        var row = inp.closest('[data-prov-row]');
        if (!row) return;
        var chip = row.querySelector('.crozzo-prov-doc__chip');
        if (!chip) return;
        var req = row.classList.contains('crozzo-prov-doc__row--req');
        var rec = row.classList.contains('crozzo-prov-doc__row--rec');
        var ok = String(inp.value || '').trim().length > 0;
        chip.className =
          'crozzo-prov-doc__chip ' +
          (ok
            ? 'crozzo-prov-doc__chip--ok'
            : req
              ? 'crozzo-prov-doc__chip--miss'
              : rec
                ? 'crozzo-prov-doc__chip--warn'
                : 'crozzo-prov-doc__chip--opt');
        chip.textContent = ok ? '✓' : req ? '✗' : rec ? '○' : '·';
        chip.title = ok ? 'Cargado' : req ? 'Requerido — falta' : rec ? 'Recomendado' : 'Opcional';
      });
    });
  }

  function readWizardForm(wizardEl) {
    function v(key) {
      var el = wizardEl.querySelector('[data-prov-f="' + key + '"]');
      return el ? String(el.value || '').trim() : '';
    }
    return {
      nombreBanco: v('nombre-banco'),
      nombrePersona: v('nombre-persona'),
      razonSocial: v('razon-social'),
      nombreComercial: v('nombre-comercial'),
      nombreDirectorio: v('nombre-directorio'),
      nit: v('nit'),
      telefono: v('tel'),
      email: v('email'),
      representante: v('rep'),
      tipoRubro: v('rubro'),
      ciudad: v('ciudad'),
    };
  }

  function rubroOptionsHtml(selected) {
    var opts = [
      'Carnicería',
      'Quesería',
      'Verduras y frutas',
      'Abarrotes',
      'Bebidas',
      'Panadería',
      'Lácteos',
      'Pescadería',
      'Empaques',
      'Otro',
    ];
    return opts
      .map(function (o) {
        return (
          '<option' +
          (o === selected ? ' selected' : '') +
          '>' +
          esc(o) +
          '</option>'
        );
      })
      .join('');
  }

  function renderWizardPanel(st, prefix) {
    var item = st.active;
    if (!item) return '<p class="form-hint">Seleccione un archivo de la cola.</p>';
    var p = item.parsed;
    var matches = item.matches || [];
    var idLabel = labelIdentificador();
    var matchHtml =
      matches.length === 0
        ? '<p class="form-hint">Sin coincidencias — se creará proveedor nuevo.</p>'
        : matches
            .map(function (m, idx) {
              var pr = m.proveedor;
              var sel = item.selectedId === pr.id ? ' is-selected' : '';
              var diff =
                m.diffs.length === 0
                  ? '<span class="form-hint">Sin cambios detectados</span>'
                  : '<ul class="crozzo-prov-doc__diff">' +
                    m.diffs
                      .map(function (d) {
                        return (
                          '<li><strong>' +
                          esc(d.campo) +
                          ':</strong> ' +
                          esc(d.antes) +
                          ' → ' +
                          esc(d.despues) +
                          '</li>'
                        );
                      })
                      .join('') +
                    '</ul>';
              return (
                '<button type="button" class="crozzo-prov-doc__match' +
                sel +
                '" data-prov-match-id="' +
                esc(String(pr.id)) +
                '">' +
                '<div class="crozzo-prov-doc__match-head"><strong>' +
                esc(pr.nombre || pr.name) +
                '</strong> <span class="badge badge-info">' +
                m.score +
                '%</span></div>' +
                '<div class="form-hint">' +
                esc(m.razon) +
                ' · ' +
                esc(pr.nit || '—') +
                '</div>' +
                diff +
                '</button>'
              );
            })
            .join('');

    var mode = item.mode || defaultImportItemMode(matches);
    var pendientes = st.items.filter(function (x) {
      return x.status !== 'done';
    }).length;

    return (
      '<div class="crozzo-prov-doc__panel">' +
      (pendientes > 1
        ? '<p class="alert alert-info crozzo-prov-doc__queue-banner" style="margin:0 0 12px;font-size:0.88rem">' +
          '<strong>Cola:</strong> ' +
          pendientes +
          ' archivo(s) pendiente(s). Guarde <strong>uno por uno</strong> con «Confirmar». Los ya guardados muestran ✓ en la cola.' +
          '</p>'
        : '') +
      '<div class="crozzo-prov-doc__meta">' +
      vigenciaBadge((p.vigencia && p.vigencia.estado) || 'desconocido') +
      ' <span class="form-hint">' +
      esc(item.archivo && item.archivo.nombre) +
      '</span>' +
      (item.ocrRequerido
        ? ' <span class="badge badge-warning">PDF escaneado o imagen — complete lo que falte</span>'
        : ' <span class="badge badge-success">Texto leído</span>') +
      '</div>' +
      '<p class="form-hint crozzo-prov-doc__split-hint">Compare el certificado (izquierda) con los datos detectados (derecha) antes de guardar.</p>' +
      '<div class="crozzo-prov-doc__split">' +
      '<aside class="crozzo-prov-doc__split-doc" aria-label="Vista del certificado">' +
      '<p class="form-label crozzo-prov-doc__split-label">Certificado cargado</p>' +
      renderDocumentViewer(item) +
      '</aside>' +
      '<div class="crozzo-prov-doc__split-data" aria-label="Datos extraídos">' +
      '<p class="form-label crozzo-prov-doc__split-label">Datos detectados por el sistema</p>' +
      renderEditableResumen(p) +
      renderRetencionesAlert(p) +
      '</div></div>' +
      '<div class="crozzo-prov-doc__modes">' +
      '<span class="form-label">¿Qué desea hacer?</span>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0">' +
      '<button type="button" class="btn ' +
      (mode === 'update' ? 'btn-primary' : 'btn-outline') +
      '" data-prov-mode="update">Actualizar existente</button>' +
      '<button type="button" class="btn ' +
      (mode === 'create' ? 'btn-primary' : 'btn-outline') +
      '" data-prov-mode="create">Crear nuevo</button>' +
      '</div></div>' +
      (mode === 'update'
        ? '<div class="crozzo-prov-doc__matches"><p class="form-label">Proveedor coincidente</p>' +
          matchHtml +
          '<button type="button" class="btn btn-link btn-sm" data-prov-match-none>Ninguno — crear como nuevo</button></div>'
        : '') +
      '<div class="crozzo-prov-doc__actions">' +
      '<button type="button" class="btn btn-primary" data-prov-confirm>Confirmar y guardar</button>' +
      '<button type="button" class="btn btn-outline" data-prov-cancel>Cancelar</button>' +
      '</div></div>'
    );
  }

  function renderQueue(st) {
    if (!st.items.length) return '';
    return st.items
      .map(function (it, i) {
        var p = it.parsed;
        var stLabel = it.status === 'done' ? '✓' : it.status === 'error' ? '✗' : '…';
        return (
          '<button type="button" class="crozzo-prov-doc__queue-item' +
          (st.active === it ? ' is-active' : '') +
          '" data-prov-queue-idx="' +
          i +
          '">' +
          stLabel +
          ' ' +
          esc((it.archivo && it.archivo.nombre) || 'archivo') +
          ' — ' +
          esc(
            p.nombreParaBanco ||
              p.nombreComercial ||
              p.identificador.norm ||
              p.razonSocial ||
              'sin datos'
          ) +
          '</button>'
        );
      })
      .join('');
  }

  function toast(msg, type) {
    if (typeof global.showToast === 'function') global.showToast(msg, type || 'info');
    else console.log('[ProvDoc]', type, msg);
  }

  function processImportFiles(prefix, fileList) {
    var reg = _importRegistry[prefix];
    if (!reg || !reg.root) return;
    var root = reg.root;
    var st = getWizardState(prefix);
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;

    files.forEach(function (file) {
      setImportStatus(root, 'Leyendo «' + file.name + '»…', 'loading');
      extractFromFile(file)
        .then(function (result) {
          return fileToDataUrl(file).then(function (dataUrl) {
            result.dataUrl = result.dataUrl || dataUrl;
            var matches = findMatches(result.parsed);
            var item = {
              file: file,
              archivo: result.archivo || { nombre: file.name, mime: file.type },
              parsed: result.parsed,
              metodo: result.metodo,
              ocrRequerido: result.ocrRequerido,
              dataUrl: result.dataUrl,
              previewUrl: null,
              previewType: null,
              previewBlobUrl: null,
              matches: matches,
              selectedId: defaultImportSelectedId(matches),
              mode: defaultImportItemMode(matches),
              status: 'ready',
            };
            assignItemPreview(item, file, result.dataUrl);
            st.items.push(item);
            var cur = st.active;
            if (!cur || cur.status === 'done') {
              st.active = item;
            } else {
              toast(
                '«' +
                  file.name +
                  '» en cola. Termine «' +
                  ((cur.archivo && cur.archivo.nombre) || 'el actual') +
                  '» y selecciónelo arriba.',
                'info'
              );
            }
            refreshImportUi(prefix);
            var idOk = result.parsed.identificador && result.parsed.identificador.norm;
            if (result.ocrRequerido) {
              setImportStatus(
                root,
                'Archivo cargado. Complete RUT/NIT y razón social en el formulario inferior.',
                'warn'
              );
              toast('Documento sin texto automático — revise los campos', 'warning');
            } else if (idOk) {
              setImportStatus(
                root,
                'Listo: ' +
                  (result.parsed.razonSocial || 'proveedor') +
                  ' · ' +
                  (result.parsed.identificador.display || result.parsed.identificador.norm),
                'ok'
              );
              toast('Datos extraídos — confirme abajo', 'success');
            } else {
              setImportStatus(root, 'PDF leído pero RUT/NIT no detectado — ingréselo manualmente.', 'warn');
              toast('Revise el RUT/NIT en el formulario', 'warning');
            }
          });
        })
        .catch(function (err) {
          console.error('[ProvDoc]', err);
          setImportStatus(root, 'Error al leer: ' + (err.message || 'archivo no válido'), 'error');
          toast('No se pudo leer el archivo: ' + (err.message || ''), 'error');
        });
    });
  }

  function initGlobalImportHandlers() {
    if (_globalHandlersReady) return;
    _globalHandlersReady = true;

    document.addEventListener(
      'change',
      function (e) {
        var input = e.target;
        if (!input || !input.matches || !input.matches('[data-prov-doc-input]')) return;
        var root = input.closest('[data-prov-doc-root]');
        if (!root) return;
        var prefix = root.getAttribute('data-prov-doc-root');
        e.stopPropagation();
        processImportFiles(prefix, input.files);
        input.value = '';
      },
      true
    );

    document.addEventListener(
      'click',
      function (e) {
        var pick = e.target.closest('[data-prov-doc-pick]');
        if (pick) {
          e.preventDefault();
          e.stopPropagation();
          var root = pick.closest('[data-prov-doc-root]');
          var input = root && root.querySelector('[data-prov-doc-input]');
          if (input) input.click();
          return;
        }

        var root = e.target.closest('[data-prov-doc-root]');
        if (!root) return;
        var prefix = root.getAttribute('data-prov-doc-root');
        var st = getWizardState(prefix);

        var q = e.target.closest('[data-prov-queue-idx]');
        if (q) {
          e.preventDefault();
          var qi = parseInt(q.getAttribute('data-prov-queue-idx'), 10);
          st.active = st.items[qi];
          if (st.active && st.active.parsed && st.active.status !== 'done') {
            st.active.matches = findMatches(st.active.parsed);
          }
          refreshImportUi(prefix);
          return;
        }
        var matchBtn = e.target.closest('[data-prov-match-id]');
        if (matchBtn && st.active) {
          e.preventDefault();
          st.active.selectedId = matchBtn.getAttribute('data-prov-match-id');
          st.active.mode = 'update';
          refreshImportUi(prefix);
          return;
        }
        if (e.target.closest('[data-prov-match-none]') && st.active) {
          e.preventDefault();
          st.active.selectedId = null;
          st.active.mode = 'create';
          refreshImportUi(prefix);
          return;
        }
        var modeBtn = e.target.closest('[data-prov-mode]');
        if (modeBtn && st.active) {
          e.preventDefault();
          st.active.mode = modeBtn.getAttribute('data-prov-mode');
          refreshImportUi(prefix);
          return;
        }
        if (e.target.closest('[data-prov-cancel]')) {
          e.preventDefault();
          st.active = null;
          refreshImportUi(prefix);
          setImportStatus(root, 'Cancelado. Puede subir otro archivo.', 'info');
          return;
        }
        if (e.target.closest('[data-prov-confirm]') && st.active) {
          e.preventDefault();
          var reg = _importRegistry[prefix];
          var item = st.active;
          var wizardEl = root.querySelector('[data-prov-doc-wizard]');
          var form = readWizardForm(wizardEl);
          var nombre = form.nombreDirectorio;
          var nit = form.nit;
          var rubro = form.tipoRubro || 'Otro';
          var tel = form.telefono;
          var email = form.email;
          var rep = form.representante;
          var mode = item.mode || 'create';
          if (mode === 'create') {
            item.selectedId = null;
          }
          var provId = mode === 'update' ? item.selectedId : null;
          item.matches = findMatches(item.parsed);
          if (!nombre.trim()) {
            toast('Nombre en directorio requerido', 'warning');
            return;
          }
          if (!form.nombreBanco.trim()) {
            toast('Indique el nombre para transferencias / banco', 'warning');
            return;
          }
          if (mode === 'update' && !provId) {
            toast('Elija un proveedor o use Crear nuevo', 'warning');
            return;
          }
          setImportStatus(root, 'Guardando proveedor y certificado…', 'loading');
          persistDocumento(item.file, item.dataUrl, provId)
            .then(function (blobOut) {
              var res = applyProveedor({
                extracted: item,
                matches: item.matches,
                mode: mode,
                proveedorId: provId,
                blobRef: blobOut.blobRef,
                form: {
                  nombreDirectorio: nombre,
                  nombreBanco: form.nombreBanco,
                  nombrePersona: form.nombrePersona,
                  razonSocial: form.razonSocial,
                  nombreComercial: form.nombreComercial,
                  nit: nit,
                  tipoRubro: rubro,
                  telefono: tel,
                  email: email,
                  representante: rep,
                  ciudad: form.ciudad,
                },
              });
              if (res.ok) {
                item.status = 'done';
                var pend = st.items.filter(function (x) {
                  return x.status !== 'done';
                });
                if (pend.length) {
                  st.active = pend[0];
                  var sigNombre =
                    (pend[0].archivo && pend[0].archivo.nombre) ||
                    (pend[0].parsed && pend[0].parsed.razonSocial) ||
                    'siguiente';
                  setImportStatus(
                    root,
                    'Guardado. Quedan ' +
                      pend.length +
                      ' en cola — revise y confirme: «' +
                      sigNombre +
                      '».',
                    'ok'
                  );
                  toast(
                    (res.toastMsg || 'Guardado') +
                      '. Siguiente en cola: ' +
                      sigNombre,
                    'success'
                  );
                } else {
                  st.active = null;
                  setImportStatus(root, 'Todos los proveedores de la cola fueron guardados.', 'ok');
                  toast(res.toastMsg || 'Cola completada', 'success');
                }
                if (reg && reg.opts && typeof reg.opts.onSaved === 'function') reg.opts.onSaved(res);
                refreshImportUi(prefix);
              } else {
                setImportStatus(root, res.error || 'No se pudo guardar', 'error');
                toast(res.error || 'Error al guardar', 'error');
              }
            })
            .catch(function (err) {
              setImportStatus(root, 'Error al guardar archivo', 'error');
              toast(err.message || 'Error', 'error');
            });
        }
      },
      true
    );

    document.addEventListener(
      'dragover',
      function (e) {
        if (e.target.closest && e.target.closest('[data-prov-doc-drop]')) {
          e.preventDefault();
          e.target.closest('[data-prov-doc-drop]').classList.add('is-dragover');
        }
      },
      false
    );
    document.addEventListener(
      'dragleave',
      function (e) {
        var drop = e.target.closest && e.target.closest('[data-prov-doc-drop]');
        if (drop) drop.classList.remove('is-dragover');
      },
      false
    );
    document.addEventListener(
      'drop',
      function (e) {
        var drop = e.target.closest && e.target.closest('[data-prov-doc-drop]');
        if (!drop) return;
        e.preventDefault();
        drop.classList.remove('is-dragover');
        var root = drop.closest('[data-prov-doc-root]');
        if (!root) return;
        processImportFiles(root.getAttribute('data-prov-doc-root'), e.dataTransfer && e.dataTransfer.files);
      },
      false
    );
  }

  function bindImportRoot(root, opts) {
    if (!root) return;
    opts = opts || {};
    var prefix = root.getAttribute('data-prov-doc-root') || 'crozzo-prov-doc';
    _importRegistry[prefix] = { root: root, opts: opts };
    initGlobalImportHandlers();
    setImportStatus(root, 'Listo — clic en la zona punteada o arrastre su certificado.', 'info');
    loadPdfJs()
      .then(function () {
        setImportStatus(root, 'Motor PDF listo. Suba certificado ' + labelIdentificador() + '.', 'ok');
      })
      .catch(function () {
        setImportStatus(
          root,
          'PDF no cargó — aún puede subir imagen y completar datos manualmente.',
          'warn'
        );
      });
    refreshImportUi(prefix);
  }

  function fillCreateForm(host, extracted) {
    var p = extracted.parsed || extracted;
    var nom = host.querySelector('#cxf-new-nombre, #crozzo-op-prov-name');
    var nit = host.querySelector('#cxf-new-nit, #crozzo-op-prov-nit');
    var email = host.querySelector('#cxf-new-email');
    if (nom) {
      nom.value =
        p.nombreComercial || p.nombreParaBanco || p.razonSocial || p.nombrePersonaNatural || '';
    }
    if (nit && (p.identificador.display || p.identificador.norm)) {
      nit.value = p.identificador.display || p.identificador.norm;
    }
    if (email && p.email) email.value = p.email;
  }

  function fichaRow(label, value) {
    return (
      '<div class="crozzo-prov-ficha__row">' +
      '<span class="crozzo-prov-ficha__label">' +
      esc(label) +
      '</span>' +
      '<span class="crozzo-prov-ficha__value">' +
      esc(String(value || '—')) +
      '</span></div>'
    );
  }

  function renderProveedorFicha(prov) {
    prov = prov || {};
    var leg = prov.legal && typeof prov.legal === 'object' ? prov.legal : {};
    var ini = String(prov.nombre || '?')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(function (w) {
        return w.charAt(0);
      })
      .join('')
      .toUpperCase();
    var tipo =
      (leg.tipoPersona && leg.tipoPersona.etiqueta) ||
      (leg.tipoPersona && leg.tipoPersona.tipo) ||
      '—';
    var html =
      '<div class="crozzo-prov-ficha">' +
      '<div class="crozzo-prov-ficha__hero">' +
      '<div class="crozzo-prov-ficha__avatar" aria-hidden="true">' +
      esc(ini || '?') +
      '</div>' +
      '<div><h4 class="crozzo-prov-ficha__name">' +
      esc(prov.nombre || '—') +
      '</h4>' +
      '<p class="crozzo-prov-ficha__sub">' +
      esc(labelIdentificador() + ' ' + (prov.nit || '—')) +
      ' · ' +
      esc(prov.tipoRubro || prov.categoria || '—') +
      '</p></div></div>' +
      renderRutCertificadoSection(leg, prov.id) +
      '<div class="crozzo-prov-ficha__grid">' +
      fichaRow('Nombre transferencias / banco', leg.nombreParaTransferencias) +
      fichaRow('Razón social (RUT)', leg.razonSocial) +
      fichaRow('Nombre comercial / tienda', leg.nombreComercial) +
      fichaRow('Persona natural (31–34)', leg.nombrePersonaNatural) +
      fichaRow('Teléfono', prov.telefono) +
      fichaRow('Correo', prov.email) +
      fichaRow('Representante legal', leg.representanteLegal || prov.representante) +
      fichaRow('Tipo persona', tipo) +
      fichaRow('Dirección', leg.direccion) +
      fichaRow('Ciudad', leg.ciudad) +
      fichaRow('Giro / CIIU', leg.giro) +
      fichaRow(
        'Retención renta',
        leg.retenciones && leg.retenciones.retencionRenta
          ? leg.retenciones.retencionRenta.motivo
          : leg.retenciones
            ? leg.retenciones.motivo
            : '—'
      ) +
      fichaRow(
        'RETE ICA',
        leg.retenciones && leg.retenciones.retencionICA
          ? leg.retenciones.retencionICA.motivo
          : '—'
      ) +
      '</div>';
    if (leg.obligaciones && leg.obligaciones.length) {
      html +=
        '<div class="crozzo-prov-ficha__section"><p class="form-label">Obligaciones</p><p class="form-hint">' +
        esc(formatObligacionesLista(leg.obligaciones)) +
        '</p></div>';
    }
    html += '</div>';
    return html;
  }

  function renderProveedorEditForm(prov) {
    prov = prov || {};
    var leg = prov.legal && typeof prov.legal === 'object' ? prov.legal : {};
    var rubros = [
      'Carnicería',
      'Quesería',
      'Verduras y frutas',
      'Abarrotes',
      'Bebidas',
      'Panadería',
      'Lácteos',
      'Pescadería',
      'Empaques',
      'Otro',
    ];
    var rubroSel = prov.tipoRubro || prov.categoria || 'Otro';
    return (
      '<div class="crozzo-prov-edit">' +
      '<input type="hidden" id="crozzo-prov-edit-id" value="' +
      esc(String(prov.id || '')) +
      '">' +
      '<div class="form-grid">' +
      '<div class="form-group cxf-field-span-2"><label class="form-label">Nombre en directorio *</label>' +
      '<input class="form-input" id="crozzo-prov-edit-nombre" value="' +
      esc(prov.nombre || '') +
      '"></div>' +
      '<div class="form-group"><label class="form-label">' +
      esc(labelIdentificador()) +
      '</label><input class="form-input" id="crozzo-prov-edit-nit" value="' +
      esc(prov.nit || '') +
      '"></div>' +
      '<div class="form-group"><label class="form-label">Teléfono</label><input class="form-input" id="crozzo-prov-edit-tel" value="' +
      esc(prov.telefono || '') +
      '"></div>' +
      '<div class="form-group"><label class="form-label">Correo</label><input class="form-input" id="crozzo-prov-edit-email" value="' +
      esc(prov.email || '') +
      '"></div>' +
      '<div class="form-group"><label class="form-label">Rubro</label><select class="form-input" id="crozzo-prov-edit-rubro">' +
      rubros
        .map(function (r) {
          return (
            '<option' + (r === rubroSel ? ' selected' : '') + '>' + esc(r) + '</option>'
          );
        })
        .join('') +
      '</select></div>' +
      '<div class="form-group cxf-field-span-2"><label class="form-label">Nombre banco / transferencias</label>' +
      '<input class="form-input" id="crozzo-prov-edit-banco" value="' +
      esc(leg.nombreParaTransferencias || '') +
      '"></div>' +
      '<div class="form-group cxf-field-span-2"><label class="form-label">Razón social</label>' +
      '<input class="form-input" id="crozzo-prov-edit-razon" value="' +
      esc(leg.razonSocial || '') +
      '"></div>' +
      '<div class="form-group cxf-field-span-2"><label class="form-label">Nombre comercial</label>' +
      '<input class="form-input" id="crozzo-prov-edit-comercial" value="' +
      esc(leg.nombreComercial || '') +
      '"></div>' +
      '<div class="form-group cxf-field-span-2"><label class="form-label">Representante</label>' +
      '<input class="form-input" id="crozzo-prov-edit-rep" value="' +
      esc(leg.representanteLegal || prov.representante || '') +
      '"></div>' +
      '<div class="form-group"><label class="form-label">Ciudad / municipio</label>' +
      '<input class="form-input" id="crozzo-prov-edit-ciudad" value="' +
      esc(leg.ciudad || '') +
      '" placeholder="Ej. Pereira">' +
      '<span class="form-hint">Usada para evaluar RETE ICA vs sede de la empresa.</span></div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">' +
      '<button type="button" class="btn btn-primary" onclick="crozzoProvSaveEdit()">Guardar cambios</button>' +
      '<button type="button" class="btn btn-outline" onclick="closeModal()">Cancelar</button>' +
      '</div></div>'
    );
  }

  global.CrozzoProveedorDocumentos = {
    normIdentificador: normIdentificador,
    validarIdentificador: validarIdentificador,
    formatIdentificadorDisplay: formatIdentificadorDisplay,
    labelIdentificador: labelIdentificador,
    getPaisTributario: getPaisTributario,
    extractFromFile: extractFromFile,
    parseTextoCertificado: parseTextoCertificado,
    findMatches: findMatches,
    buildLegalPayload: buildLegalPayload,
    applyProveedor: applyProveedor,
    renderImportBlock: renderImportBlock,
    bindImportRoot: bindImportRoot,
    refreshImportUi: refreshImportUi,
    fillCreateForm: fillCreateForm,
    evaluarVigencia: evaluarVigencia,
    vigenciaBadge: vigenciaBadge,
    formatVigenciaTexto: formatVigenciaTexto,
    renderRutCertificadoSection: renderRutCertificadoSection,
    openProveedorRut: openProveedorRut,
    getRetencionProveedor: getRetencionProveedor,
    formatActividadesLista: formatActividadesLista,
    computeRetencionesProveedor: computeRetencionesProveedor,
    normalizeCiudadNombre: normalizeCiudadNombre,
    ciudadesCoinciden: ciudadesCoinciden,
    getEmpresaSedeTributaria: getEmpresaSedeTributaria,
    getImpuestosEmpresaConfig: getImpuestosEmpresaConfig,
    renderProveedorFicha: renderProveedorFicha,
    renderProveedorEditForm: renderProveedorEditForm,
  };
})(typeof window !== 'undefined' ? window : globalThis);



/* --- CrozzoReservorioSql.js --- */

/**
 * SQL visible en POS — Reservorio y flujos unificados (generado, no editar a mano)
 * Regenerar: node scripts/build-reservorio-sql-js.mjs
 */
(function (global) {
  'use strict';
  global.CrozzoReservorioSql = {
    version: 1,
    generatedAt: "2026-05-23T23:57:40.601Z",
    bundles: [
  {
    "key": "orden",
    "label": "Orden de ejecución",
    "sql": "-- ORDEN OBLIGATORIO EN SUPABASE SQL EDITOR\n-- 1. SUPABASE-SQL-EDITOR.sql\n-- 2. SUPABASE-SQL-INTEGRACION.sql\n-- 3. SUPABASE-SQL-QYC.sql\n-- 4. SUPABASE-STORAGE-FOTOS-MARCACIONES.sql\n-- 5. SUPABASE-SQL-QYC-FIX-TARJETA.sql\n-- 6. SUPABASE-SQL-COSTOS.sql\n-- 7. SUPABASE-SQL-RESERVORIO-UNIFICADO.sql (este bloque)\n"
  },
  {
    "key": "costos",
    "label": "Sistema de costos (F1/F3/F6)",
    "sql": "-- Crozzo POS — Sistema de costos (matriz, inventario ledger, cola planilla)\r\n-- Ejecutar DESPUÉS de: SUPABASE-SQL-EDITOR.sql, INTEGRACION.sql, QYC.sql\r\n\r\n-- ── F1 · Matriz de precios ───────────────────────────────────────────────────\r\n\r\ncreate table if not exists public.crozzo_matriz_precios (\r\n  id uuid primary key default gen_random_uuid(),\r\n  business_id text not null default 'default',\r\n  nombre text not null default 'Matriz principal',\r\n  estado text not null default 'borrador'\r\n    check (estado in ('borrador', 'revision', 'aprobada', 'vigente', 'historica')),\r\n  vigencia_desde timestamptz,\r\n  vigencia_hasta timestamptz,\r\n  notas text,\r\n  creado_por text,\r\n  aprobado_por text,\r\n  created_at timestamptz not null default now(),\r\n  updated_at timestamptz not null default now()\r\n);\r\n\r\ncreate table if not exists public.crozzo_matriz_precios_items (\r\n  id uuid primary key default gen_random_uuid(),\r\n  matriz_id uuid not null references public.crozzo_matriz_precios(id) on delete cascade,\r\n  ref_tipo text not null check (ref_tipo in ('producto_pos', 'producto_qyc', 'materia_prima', 'receta', 'corte')),\r\n  ref_id text not null,\r\n  nombre_display text not null,\r\n  costo_unitario numeric(14, 4) not null default 0,\r\n  margen_objetivo_pct numeric(8, 4) not null default 0,\r\n  precio_recomendado numeric(14, 2) not null default 0,\r\n  precio_decidido numeric(14, 2),\r\n  unidad text default 'und',\r\n  meta jsonb default '{}'::jsonb,\r\n  created_at timestamptz not null default now(),\r\n  updated_at timestamptz not null default now(),\r\n  unique (matriz_id, ref_tipo, ref_id)\r\n);\r\n\r\ncreate table if not exists public.crozzo_matriz_programaciones (\r\n  id uuid primary key default gen_random_uuid(),\r\n  matriz_id uuid not null references public.crozzo_matriz_precios(id) on delete cascade,\r\n  fecha_vigencia date not null,\r\n  hora_vigencia time default '06:00:00',\r\n  estado text not null default 'programada'\r\n    check (estado in ('programada', 'aplicada', 'cancelada', 'fallida')),\r\n  aplicada_at timestamptz,\r\n  dispositivos_ok int default 0,\r\n  dispositivos_total int default 0,\r\n  log jsonb default '[]'::jsonb,\r\n  created_at timestamptz not null default now()\r\n);\r\n\r\n-- ── F3 · Inventario ledger ───────────────────────────────────────────────────\r\n\r\ncreate table if not exists public.crozzo_inventario_movimientos (\r\n  id uuid primary key default gen_random_uuid(),\r\n  business_id text not null default 'default',\r\n  fecha date not null default (current_date),\r\n  tipo text not null check (tipo in (\r\n    'inicial', 'entrada_proveedor', 'entrada_proceso', 'salida_venta',\r\n    'salida_merma', 'ajuste_conteo', 'ajuste_manual'\r\n  )),\r\n  ref_tipo text,\r\n  ref_id text,\r\n  producto_ref_tipo text check (producto_ref_tipo in ('producto_pos', 'producto_qyc', 'materia_prima')),\r\n  producto_ref_id text not null,\r\n  cantidad numeric(14, 4) not null,\r\n  unidad text default 'kg',\r\n  costo_unitario numeric(14, 4) default 0,\r\n  valor_total numeric(14, 2) generated always as (cantidad * costo_unitario) stored,\r\n  notas text,\r\n  usuario text,\r\n  created_at timestamptz not null default now()\r\n);\r\n\r\ncreate index if not exists idx_crozzo_inv_mov_fecha on public.crozzo_inventario_movimientos (business_id, fecha);\r\ncreate index if not exists idx_crozzo_inv_mov_prod on public.crozzo_inventario_movimientos (producto_ref_tipo, producto_ref_id);\r\n\r\ncreate table if not exists public.crozzo_inventario_cierres (\r\n  id uuid primary key default gen_random_uuid(),\r\n  business_id text not null default 'default',\r\n  fecha date not null,\r\n  inventario_inicial_valor numeric(14, 2) default 0,\r\n  entradas_valor numeric(14, 2) default 0,\r\n  salidas_valor numeric(14, 2) default 0,\r\n  teorico_final_valor numeric(14, 2) default 0,\r\n  conteo_fisico_valor numeric(14, 2),\r\n  diferencia_valor numeric(14, 2),\r\n  diferencia_pct numeric(8, 4),\r\n  estado text not null default 'abierto' check (estado in ('abierto', 'cerrado', 'auditado')),\r\n  cerrado_por text,\r\n  cerrado_at timestamptz,\r\n  detalle jsonb default '{}'::jsonb,\r\n  created_at timestamptz not null default now(),\r\n  unique (business_id, fecha)\r\n);\r\n\r\n-- ── F6 · Cola planilla (admin elige qué ingresar) ────────────────────────────\r\n\r\ncreate table if not exists public.crozzo_planilla_feed (\r\n  id uuid primary key default gen_random_uuid(),\r\n  business_id text not null default 'default',\r\n  origen text not null check (origen in ('ventas', 'compra', 'oficina', 'inventario', 'nomina', 'manual')),\r\n  fecha date not null default (current_date),\r\n  concepto text not null,\r\n  monto numeric(14, 2) not null default 0,\r\n  tipo_movimiento text not null default 'egreso' check (tipo_movimiento in ('ingreso', 'egreso')),\r\n  referencia_tipo text,\r\n  referencia_id text,\r\n  payload jsonb default '{}'::jsonb,\r\n  estado text not null default 'pendiente'\r\n    check (estado in ('pendiente', 'aceptado', 'rechazado', 'ingresado')),\r\n  revisado_por text,\r\n  revisado_at timestamptz,\r\n  planilla_periodo_id text,\r\n  planilla_dia date,\r\n  created_at timestamptz not null default now()\r\n);\r\n\r\ncreate index if not exists idx_crozzo_planilla_feed_estado on public.crozzo_planilla_feed (business_id, estado, fecha desc);\r\n\r\n-- ── RLS (mismo patrón POS) ───────────────────────────────────────────────────\r\n\r\nselect public.crozzo_enable_pos_rls('crozzo_matriz_precios');\r\nselect public.crozzo_enable_pos_rls('crozzo_matriz_precios_items');\r\nselect public.crozzo_enable_pos_rls('crozzo_matriz_programaciones');\r\nselect public.crozzo_enable_pos_rls('crozzo_inventario_movimientos');\r\nselect public.crozzo_enable_pos_rls('crozzo_inventario_cierres');\r\nselect public.crozzo_enable_pos_rls('crozzo_planilla_feed');\r\n"
  },
  {
    "key": "reservorio",
    "label": "Reservorio unificado + sync",
    "sql": "-- Crozzo POS — Reservorio unificado + flujos conectados\r\n-- Ejecutar EN ORDEN en SQL Editor de Supabase (proyecto del POS)\r\n--\r\n-- 1. docs/SUPABASE-SQL-EDITOR.sql\r\n-- 2. docs/SUPABASE-SQL-INTEGRACION.sql\r\n-- 3. docs/SUPABASE-SQL-QYC.sql\r\n-- 4. docs/SUPABASE-STORAGE-FOTOS-MARCACIONES.sql\r\n-- 5. docs/SUPABASE-SQL-QYC-FIX-TARJETA.sql\r\n-- 6. docs/SUPABASE-SQL-COSTOS.sql\r\n-- 7. ESTE ARCHIVO (reservorio + cola sync + puente proveedores)\r\n\r\n-- ── Puente proveedores POS ↔ QyC ───────────────────────────────────────────\r\n\r\nalter table if exists public.proveedores\r\n  add column if not exists pos_proveedor_id text,\r\n  add column if not exists categoria text default '',\r\n  add column if not exists activo boolean not null default true;\r\n\r\ncreate unique index if not exists idx_proveedores_pos_id\r\n  on public.proveedores (pos_proveedor_id)\r\n  where pos_proveedor_id is not null and pos_proveedor_id <> '';\r\n\r\ncomment on column public.proveedores.pos_proveedor_id is\r\n  'ID del proveedor en POS (proveedoresOC) para sincronizar offline → nube';\r\n\r\n-- ── Cola de sincronización (reservorio offline → nube) ───────────────────────\r\n\r\ncreate table if not exists public.crozzo_reservorio_sync_queue (\r\n  id uuid primary key default gen_random_uuid(),\r\n  business_id text not null default 'default',\r\n  op text not null check (op in ('insert', 'update', 'upsert', 'delete')),\r\n  tabla text not null,\r\n  payload jsonb not null default '{}'::jsonb,\r\n  estado text not null default 'pendiente'\r\n    check (estado in ('pendiente', 'procesando', 'ok', 'error')),\r\n  intentos int not null default 0,\r\n  error_msg text,\r\n  local_id text,\r\n  created_at timestamptz not null default now(),\r\n  processed_at timestamptz\r\n);\r\n\r\ncreate index if not exists idx_crozzo_sync_queue_pend\r\n  on public.crozzo_reservorio_sync_queue (business_id, estado, created_at desc);\r\n\r\n-- ── Snapshot reservorio (backup opcional por dispositivo) ────────────────────\r\n\r\ncreate table if not exists public.crozzo_reservorio_snapshots (\r\n  id uuid primary key default gen_random_uuid(),\r\n  business_id text not null default 'default',\r\n  device_id text,\r\n  version int not null default 1,\r\n  snapshot jsonb not null,\r\n  stats jsonb default '{}'::jsonb,\r\n  created_at timestamptz not null default now()\r\n);\r\n\r\ncreate index if not exists idx_crozzo_reservorio_snap\r\n  on public.crozzo_reservorio_snapshots (business_id, created_at desc);\r\n\r\n-- ── Vista operativa: flujo compras conectado ─────────────────────────────────\r\n\r\ncreate or replace view public.crozzo_v_flujo_compras as\r\nselect\r\n  r.id as recepcion_id,\r\n  r.fecha as recepcion_fecha,\r\n  r.proveedor_id,\r\n  p.nombre as proveedor_nombre,\r\n  r.total as recepcion_total,\r\n  f.id as factura_id,\r\n  f.estado as factura_estado,\r\n  f.metodo_pago,\r\n  f.total as factura_total\r\nfrom public.recepciones r\r\nleft join public.proveedores p on p.id = r.proveedor_id\r\nleft join public.facturas f on f.recepcion_id = r.id;\r\n\r\ncomment on view public.crozzo_v_flujo_compras is\r\n  'Recepción → proveedor → factura oficina (cadena F4/F5)';\r\n\r\n-- ── RLS ──────────────────────────────────────────────────────────────────────\r\n\r\nselect public.crozzo_enable_pos_rls('crozzo_reservorio_sync_queue');\r\nselect public.crozzo_enable_pos_rls('crozzo_reservorio_snapshots');\r\n\r\n-- ── Función auxiliar: marcar sync procesado ──────────────────────────────────\r\n\r\ncreate or replace function public.crozzo_sync_queue_done(p_id uuid, p_ok boolean, p_error text default null)\r\nreturns void\r\nlanguage plpgsql\r\nsecurity definer\r\nas $$\r\nbegin\r\n  update public.crozzo_reservorio_sync_queue\r\n  set\r\n    estado = case when p_ok then 'ok' else 'error' end,\r\n    error_msg = p_error,\r\n    processed_at = now(),\r\n    intentos = intentos + 1\r\n  where id = p_id;\r\nend;\r\n$$;\r\n"
  }
],
    getFullScript: function () {
      return this.bundles.map(function (b) {
        return '-- ═══ ' + b.label + ' ═══\n' + b.sql;
      }).join('\n\n');
    },
    getBundle: function (key) {
      var b = this.bundles.find(function (x) { return x.key === key; });
      return b ? b.sql : '';
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);



/* --- CrozzoReservorio.js --- */

/**
 * Crozzo POS — Reservorio unificado (memoria interna / localStorage)
 * Proveedores · Recepciones · Oficina · Inventario ledger · Cola planilla · Sync pendiente
 */
(function (global) {
  'use strict';

  var LS = 'crozzo_reservorio_v1';
  var LS_BACKUP = 'crozzo_reservorio_backup_v1';
  var LS_BACKUP2 = 'crozzo_reservorio_backup_v2';
  var VERSION = 1;
  var RETENTION_DAYS = 365;
  var healthMeta = { recoveredFromBackup: false, lastSaveOk: true, lastSaveError: null, blobMigrated: 0 };

  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  }

  function safeParse(raw, fb) {
    if (raw == null || (typeof raw === 'string' && !String(raw).trim())) return fb;
    try {
      var v = JSON.parse(raw);
      return v == null ? fb : v;
    } catch (_) {
      return fb;
    }
  }

  function emptyStore() {
    return {
      version: VERSION,
      businessId: 'default',
      updatedAt: new Date().toISOString(),
      proveedores: [],
      recepciones: [],
      facturasOficina: [],
      cortes: [],
      inventarioMovimientos: [],
      inventarioConteos: [],
      catalogoMp: [],
      costeoMp: [],
      cotizacionesMp: [],
      menuCostos: [],
      recetasPlatos: [],
      recetaDemo: null,
      matrizMp: [],
      planillaFeed: [],
      syncQueue: [],
      meta: { migrated: false, migrationNotes: [] },
    };
  }

  function businessId() {
    try {
      if (typeof global.getBusinessId === 'function') return global.getBusinessId();
      if (global.config && global.config.businessId) return global.config.businessId;
    } catch (_) {}
    return 'default';
  }

  function validateStore(st) {
    if (!st || typeof st !== 'object') return false;
    if (!Array.isArray(st.proveedores)) return false;
    return true;
  }

  function normalizeStore(st) {
    if (!st || typeof st !== 'object') st = emptyStore();
    if (!Array.isArray(st.proveedores)) st.proveedores = [];
    if (!Array.isArray(st.recepciones)) st.recepciones = [];
    if (!Array.isArray(st.facturasOficina)) st.facturasOficina = [];
    if (!Array.isArray(st.cortes)) st.cortes = [];
    if (!Array.isArray(st.inventarioMovimientos)) st.inventarioMovimientos = [];
    if (!Array.isArray(st.inventarioConteos)) st.inventarioConteos = [];
    if (!Array.isArray(st.catalogoMp)) st.catalogoMp = [];
    if (!Array.isArray(st.costeoMp)) st.costeoMp = [];
    if (!Array.isArray(st.cotizacionesMp)) st.cotizacionesMp = [];
    if (!Array.isArray(st.menuCostos)) st.menuCostos = [];
    if (!Array.isArray(st.recetasPlatos)) st.recetasPlatos = [];
    if (!st.recetaDemo) st.recetaDemo = null;
    if (!Array.isArray(st.matrizMp)) st.matrizMp = [];
    if (!Array.isArray(st.planillaFeed)) st.planillaFeed = [];
    if (!Array.isArray(st.syncQueue)) st.syncQueue = [];
    st.businessId = businessId();
    if (!st.meta) st.meta = { migrated: false, migrationNotes: [] };
    if (!Array.isArray(st.meta.archivoRecepciones)) st.meta.archivoRecepciones = [];
    st.version = VERSION;
    return st;
  }

  function isWithinRetention(fecha) {
    if (!fecha) return true;
    var d = new Date(fecha);
    if (isNaN(d.getTime())) return true;
    var cut = new Date();
    cut.setDate(cut.getDate() - RETENTION_DAYS);
    return d >= cut;
  }

  /** Quita base64 del JSON; los bytes viven en CrozzoBlobStore (IndexedDB). */
  function sanitizeAdjuntos(adjuntos) {
    if (!Array.isArray(adjuntos)) return [];
    return adjuntos.slice(0, 16).map(function (a) {
      if (!a) return null;
      return {
        id: a.id,
        nombre: a.nombre,
        mime: a.mime,
        bytes: a.bytes || 0,
        blobRef: a.blobRef || null,
        thumbDataUrl: a.thumbDataUrl || null,
        syncEstado: a.syncEstado || 'local',
        supabasePath: a.supabasePath || null,
      };
    }).filter(Boolean);
  }

  function slimRecepcionArchivo(rec) {
    return {
      id: rec.id,
      fecha: rec.fecha,
      proveedorId: rec.proveedorId,
      proveedorNombre: rec.proveedorNombre,
      valor: rec.valor,
      numeroFactura: rec.numeroFactura,
      metodoPago: rec.metodoPago,
      estado: rec.estado,
      createdAt: rec.createdAt,
      archivedAt: new Date().toISOString(),
    };
  }

  function stripHeavyFromRecepciones(st) {
    st.recepciones.forEach(function (rec) {
      if (rec.adjuntos) rec.adjuntos = sanitizeAdjuntos(rec.adjuntos);
    });
    return st;
  }

  function trimForQuota(st) {
    stripHeavyFromRecepciones(st);
    if (st.syncQueue.length > 300) {
      var pend = st.syncQueue.filter(function (q) { return q.estado === 'pendiente'; });
      var done = st.syncQueue.filter(function (q) { return q.estado !== 'pendiente'; }).slice(0, 80);
      st.syncQueue = pend.concat(done).slice(0, 300);
    }
    if (st.inventarioMovimientos.length > 2500) {
      var invRecientes = st.inventarioMovimientos.filter(function (m) {
        return isWithinRetention(m.fecha || m.createdAt);
      });
      var invViejos = st.inventarioMovimientos.filter(function (m) {
        return !isWithinRetention(m.fecha || m.createdAt);
      });
      st.inventarioMovimientos = invRecientes.concat(invViejos.slice(0, 400));
    }
    var recientes = [];
    var viejas = [];
    st.recepciones.forEach(function (r) {
      if (isWithinRetention(r.fecha || r.createdAt)) recientes.push(r);
      else viejas.push(r);
    });
    if (viejas.length) {
      viejas.forEach(function (r) {
        if (!st.meta.archivoRecepciones.some(function (x) { return x.id === r.id; })) {
          st.meta.archivoRecepciones.unshift(slimRecepcionArchivo(r));
        }
      });
      if (st.meta.archivoRecepciones.length > 800) st.meta.archivoRecepciones.length = 800;
    }
    st.recepciones = recientes;
    if (st.recepciones.length > 2500) st.recepciones.length = 2500;
    if (st.planillaFeed.length > 600) st.planillaFeed.length = 600;
    if (st.facturasOficina.length > 600) st.facturasOficina.length = 600;
    if (st.matrizMp.length > 800) st.matrizMp.length = 800;
    if (st.cotizacionesMp.length > 800) st.cotizacionesMp.length = 800;
    return st;
  }

  function calcCotizacionUnit(precioTotal, peso) {
    var p = Number(precioTotal) || 0;
    var w = Number(peso) || 0;
    if (w <= 0) return 0;
    return Math.round((p / w) * 1000000) / 1000000;
  }

  function listCotizacionesMp(opts) {
    opts = opts || {};
    var st = migrateLegacy();
    var rows = (st.cotizacionesMp || []).slice();
    if (opts.mpId) {
      rows = rows.filter(function (r) {
        return r && String(r.mpId) === String(opts.mpId);
      });
    }
    rows.sort(function (a, b) {
      return String(b.fecha || b.createdAt || '').localeCompare(String(a.fecha || a.createdAt || ''));
    });
    return rows.slice(0, opts.limit || 500);
  }

  function addCotizacionMp(input) {
    if (!input || !input.mpId) return null;
    var st = migrateLegacy();
    var peso = Number(input.peso) || Number(input.cantidad) || 1000;
    var precioTotal = Number(input.precioTotal) || 0;
    if (precioTotal <= 0) return null;
    var row = {
      id: input.id || uid('cot'),
      mpId: String(input.mpId),
      proveedorId: input.proveedorId || null,
      proveedorNombre: String(input.proveedorNombre || input.proveedor || 'Proveedor').trim(),
      precioTotal: precioTotal,
      peso: peso,
      und: String(input.und || 'GR').toUpperCase(),
      precioUnit: calcCotizacionUnit(precioTotal, peso),
      fecha: input.fecha || new Date().toISOString().slice(0, 10),
      notas: input.notas || '',
      vigente: input.vigente !== false,
      createdAt: new Date().toISOString(),
    };
    st.cotizacionesMp.unshift(row);
    pushSync(st, { tipo: 'insert', tabla: 'crozzo_cotizaciones_mp', payload: row });
    save(st);
    try {
      document.dispatchEvent(new CustomEvent('crozzo-cotizaciones-mp:changed', { detail: { row: row }, bubbles: true }));
    } catch (_) {}
    return row;
  }

  function removeCotizacionMp(id) {
    var st = migrateLegacy();
    var before = st.cotizacionesMp.length;
    st.cotizacionesMp = st.cotizacionesMp.filter(function (r) {
      return r && String(r.id) !== String(id);
    });
    if (st.cotizacionesMp.length === before) return false;
    save(st);
    try {
      document.dispatchEvent(new CustomEvent('crozzo-cotizaciones-mp:changed', { detail: { id: id, tipo: 'delete' }, bubbles: true }));
    } catch (_) {}
    return true;
  }

  function upsertMatrizMp(item) {
    if (!item || !item.id) return null;
    var st = migrateLegacy();
    var idx = st.matrizMp.findIndex(function (x) {
      return x.id === item.id;
    });
    var row = {
      id: item.id,
      nombre: item.nombre,
      categoria: item.categoria,
      und: item.und,
      peso: item.peso,
      precioTotal: item.precioTotal,
      precioUnit: item.precioUnit,
      materiaPrimaId: item.materiaPrimaId || null,
      updatedAt: new Date().toISOString(),
    };
    if (idx >= 0) st.matrizMp[idx] = row;
    else st.matrizMp.unshift(row);
    pushSync(st, { tipo: 'upsert', tabla: 'crozzo_matriz_mp', payload: row });
    save(st);
    return row;
  }

  function listMatrizMp(limit) {
    return migrateLegacy().matrizMp.slice(0, limit || 500);
  }

  function rotateBackup(prevJson) {
    try {
      var b1 = localStorage.getItem(LS_BACKUP);
      if (b1) localStorage.setItem(LS_BACKUP2, b1);
      if (prevJson) localStorage.setItem(LS_BACKUP, prevJson);
    } catch (_) {}
  }

  function loadWithRecovery() {
    var st = safeParse(localStorage.getItem(LS), null);
    if (!validateStore(st)) {
      var bk = safeParse(localStorage.getItem(LS_BACKUP), null);
      if (validateStore(bk)) {
        st = bk;
        healthMeta.recoveredFromBackup = true;
      } else {
        var bk2 = safeParse(localStorage.getItem(LS_BACKUP2), null);
        if (validateStore(bk2)) {
          st = bk2;
          healthMeta.recoveredFromBackup = true;
        } else {
          st = emptyStore();
        }
      }
      try {
        localStorage.setItem(LS, JSON.stringify(normalizeStore(st)));
      } catch (_) {}
    }
    return normalizeStore(st);
  }

  function saveSafe(st) {
    st.updatedAt = new Date().toISOString();
    st.businessId = businessId();
    st.version = VERSION;
    var json = JSON.stringify(st);
    try {
      var prev = localStorage.getItem(LS);
      if (prev && prev !== json) rotateBackup(prev);
      localStorage.setItem(LS, json);
      healthMeta.lastSaveOk = true;
      healthMeta.lastSaveError = null;
      return { ok: true };
    } catch (e) {
      if (e && (e.name === 'QuotaExceededError' || e.code === 22)) {
        trimForQuota(st);
        json = JSON.stringify(st);
        try {
          rotateBackup(localStorage.getItem(LS));
          localStorage.setItem(LS, json);
          healthMeta.lastSaveOk = true;
          healthMeta.lastSaveError = null;
          return { ok: true, trimmed: true };
        } catch (e2) {
          healthMeta.lastSaveOk = false;
          healthMeta.lastSaveError = String(e2);
          return { ok: false, error: String(e2) };
        }
      }
      healthMeta.lastSaveOk = false;
      healthMeta.lastSaveError = String(e);
      return { ok: false, error: String(e) };
    }
  }

  function load() {
    return loadWithRecovery();
  }

  function save(st) {
    var r = saveSafe(st);
    if (!r.ok) {
      try {
        if (typeof global.showToast === 'function') {
          global.showToast('No se pudo guardar el reservorio: ' + (r.error || 'error'), 'error');
        }
      } catch (_) {}
    } else if (r.trimmed) {
      try {
        if (typeof global.showToast === 'function') {
          global.showToast('Espacio local ajustado — datos recientes conservados', 'warning');
        }
      } catch (_) {}
    }
    try {
      document.dispatchEvent(
        new CustomEvent('crozzo-reservorio-updated', { detail: { updatedAt: st.updatedAt, saveOk: r.ok } })
      );
    } catch (_) {}
    return st;
  }

  function getHealth() {
    var st = load();
    var arch = (st.meta && st.meta.archivoRecepciones) || [];
    return {
      ok: healthMeta.lastSaveOk !== false,
      hasBackup: !!localStorage.getItem(LS_BACKUP),
      hasBackup2: !!localStorage.getItem(LS_BACKUP2),
      recoveredFromBackup: healthMeta.recoveredFromBackup,
      lastSaveError: healthMeta.lastSaveError,
      blobMigrated: healthMeta.blobMigrated,
      retentionDays: RETENTION_DAYS,
      updatedAt: st.updatedAt,
      itemCounts: {
        proveedores: st.proveedores.length,
        recepciones: st.recepciones.length,
        recepcionesArchivo: arch.length,
        syncQueue: st.syncQueue.length,
      },
    };
  }

  function getStorageSummary() {
    var st = load();
    var arch = (st.meta && st.meta.archivoRecepciones) || [];
    var base = {
      retentionDays: RETENTION_DAYS,
      recepcionesActivas: st.recepciones.length,
      recepcionesArchivo: arch.length,
      reservorioKey: LS,
    };
    var B = global.CrozzoBlobStore;
    if (!B || !B.estimateUsage) return Promise.resolve(base);
    return B.estimateUsage()
      .then(function (u) {
        return Object.assign(base, { blobs: u });
      })
      .catch(function () {
        return base;
      });
  }

  function runBlobMigration(st) {
    var B = global.CrozzoBlobStore;
    if (!B || !B.migrateReservorioAdjuntos) return Promise.resolve(st);
    return B.migrateReservorioAdjuntos(st).then(function (r) {
      healthMeta.blobMigrated = (r && r.migrated) || 0;
      if (r && r.migrated) {
        stripHeavyFromRecepciones(st);
        saveSafe(st);
      }
      return st;
    });
  }

  function repairIfNeeded() {
    var st = loadWithRecovery();
    if (!st.meta.migrated) st = migrateLegacy();
    stripHeavyFromRecepciones(st);
    if (dedupeRecepcionesBurst(st)) save(st);
    syncProveedoresBidirectional();
    runBlobMigration(st);
    return st;
  }

  function flushBackup() {
    try {
      var cur = localStorage.getItem(LS);
      if (cur) rotateBackup(cur);
    } catch (_) {}
  }

  function emitCostos(eventName, detail) {
    detail = detail || {};
    try {
      if (typeof global.crozzoCostosEmit === 'function') global.crozzoCostosEmit(eventName, detail);
      else if (global.CrozzoSistemaCostos && global.CrozzoSistemaCostos.emit) global.CrozzoSistemaCostos.emit(eventName, detail);
    } catch (_) {}
  }

  function pushSync(st, op) {
    st.syncQueue.unshift({
      id: uid('sync'),
      op: op.tipo,
      tabla: op.tabla,
      payload: op.payload || {},
      estado: 'pendiente',
      createdAt: new Date().toISOString(),
    });
    if (st.syncQueue.length > 500) st.syncQueue.length = 500;
  }

  function migrateLegacy() {
    var st = load();
    if (st.meta.migrated) return st;
    var notes = [];

    try {
      var oldCompras = safeParse(localStorage.getItem('crozzo_compras_local_v1'), null);
      if (oldCompras) {
        (oldCompras.recepciones || []).forEach(function (r) {
          if (!st.recepciones.some(function (x) { return x.id === r.id; })) st.recepciones.push(r);
        });
        (oldCompras.cortes || []).forEach(function (c) {
          if (!st.cortes.some(function (x) { return x.id === c.id; })) st.cortes.push(c);
        });
        (oldCompras.facturasOficina || []).forEach(function (f) {
          if (!st.facturasOficina.some(function (x) { return x.id === f.id; })) st.facturasOficina.push(f);
        });
        notes.push('crozzo_compras_local_v1');
      }
    } catch (_) {}

    try {
      var oldFeed = safeParse(localStorage.getItem('crozzo_costos_feed_v1'), []);
      if (Array.isArray(oldFeed)) {
        oldFeed.forEach(function (it) {
          if (!st.planillaFeed.some(function (x) { return x.id === it.id; })) st.planillaFeed.push(it);
        });
        notes.push('crozzo_costos_feed_v1');
      }
    } catch (_) {}

    try {
      if (typeof global.config !== 'undefined' && global.config.get) {
        var poc = global.config.get('proveedoresOC') || [];
        poc.forEach(function (p) {
          upsertProveedorInternal(st, {
            id: p.id,
            nombre: p.name || p.nombre,
            nit: p.nit,
            telefono: p.phone || p.telefono,
            origen: 'proveedoresOC',
          });
        });
        if (poc.length) notes.push('proveedoresOC');
      }
    } catch (_) {}

    st.meta.migrated = true;
    st.meta.migrationNotes = notes;
    return save(st);
  }

  function normProvNit(raw) {
    if (global.CrozzoProveedorDocumentos && global.CrozzoProveedorDocumentos.normIdentificador) {
      return global.CrozzoProveedorDocumentos.normIdentificador(raw);
    }
    return String(raw || '')
      .replace(/[^0-9-]/gi, '')
      .replace(/\./g, '')
      .trim()
      .toUpperCase();
  }

  function upsertProveedorInternal(st, p) {
    var forceNew = p.forceNew === true;
    var id = String(p.id || uid('prov'));
    var nombre = String(p.nombre || p.name || '').trim();
    if (!nombre) return null;
    var nitNorm = normProvNit(p.nit);
    var idx = -1;
    if (p.id) {
      idx = st.proveedores.findIndex(function (x) {
        return String(x.id) === id;
      });
    }
    if (!forceNew && idx < 0 && nitNorm) {
      idx = st.proveedores.findIndex(function (x) {
        return normProvNit(x.nit) === nitNorm;
      });
    }
    if (!forceNew && idx < 0) {
      idx = st.proveedores.findIndex(function (x) {
        return String(x.nombre || x.name || '').toUpperCase() === nombre.toUpperCase();
      });
    }
    if (idx >= 0) id = String(st.proveedores[idx].id);
    var prev = idx >= 0 ? st.proveedores[idx] : {};
    var legalNew = p.legal && typeof p.legal === 'object' ? p.legal : {};
    var legalPrev = prev.legal && typeof prev.legal === 'object' ? prev.legal : {};
    var row = {
      id: id,
      nombre: nombre,
      nit: p.nit || prev.nit || '',
      telefono: p.telefono || p.phone || prev.telefono || '',
      categoria: p.categoria || p.tipoRubro || prev.categoria || '',
      tipoRubro: p.tipoRubro || p.categoria || prev.tipoRubro || '',
      representante: p.representante || prev.representante || '',
      email: p.email || prev.email || '',
      legal: Object.assign({}, legalPrev, legalNew),
      activo: p.activo !== false,
      updatedAt: new Date().toISOString(),
    };
    if (idx >= 0) st.proveedores[idx] = Object.assign({}, st.proveedores[idx], row);
    else st.proveedores.push(row);
    return row;
  }

  function upsertProveedor(p) {
    var st = migrateLegacy();
    var row = upsertProveedorInternal(st, p);
    if (row) {
      pushSync(st, { tipo: 'upsert', tabla: 'proveedores', payload: row });
      syncProveedoresToConfig(st);
      save(st);
    }
    return row;
  }

  function syncProveedoresToConfig(st) {
    try {
      if (typeof global.config === 'undefined' || !global.config.set || !global.config.get) return;
      var list = (st || load()).proveedores.map(function (p) {
        return { id: p.id, name: p.nombre, nit: p.nit, phone: p.telefono };
      });
      global.config.set('proveedoresOC', list);
    } catch (_) {}
  }

  function listProveedores() {
    return migrateLegacy().proveedores.filter(function (p) { return p.activo !== false; });
  }

  /** Une reservorio ↔ config.proveedoresOC (entrada de factura + módulo Proveedores). */
  function syncProveedoresBidirectional() {
    var st = migrateLegacy();
    try {
      if (typeof global.config !== 'undefined' && global.config.get) {
        var oc = global.config.get('proveedoresOC') || [];
        if (Array.isArray(oc)) {
          oc.forEach(function (p) {
            if (!p || !(p.name || p.nombre)) return;
            upsertProveedorInternal(st, {
              id: p.id,
              nombre: p.name || p.nombre,
              nit: p.nit,
              telefono: p.phone || p.telefono,
              tipoRubro: p.tipoRubro || p.categoria || '',
            });
          });
        }
      }
    } catch (_) {}
    syncProveedoresToConfig(st);
    save(st);
    return st.proveedores.filter(function (p) { return p.activo !== false; });
  }

  function proveedorToOcRow(p) {
    return {
      id: p.id,
      name: p.nombre,
      nombre: p.nombre,
      nit: p.nit || '',
      phone: p.telefono || '',
      telefono: p.telefono || '',
      tipoRubro: p.tipoRubro || p.categoria || '',
      representante: p.representante || '',
      email: p.email || '',
    };
  }

  function listProveedoresOcFormat() {
    return syncProveedoresBidirectional().map(proveedorToOcRow);
  }

  function getProveedor(id) {
    return listProveedores().find(function (p) { return String(p.id) === String(id); });
  }

  function deleteProveedor(id) {
    var st = migrateLegacy();
    var idx = st.proveedores.findIndex(function (p) {
      return String(p.id) === String(id);
    });
    if (idx < 0) return false;
    st.proveedores[idx] = Object.assign({}, st.proveedores[idx], {
      activo: false,
      updatedAt: new Date().toISOString(),
    });
    pushSync(st, { tipo: 'delete', tabla: 'proveedores', payload: { id: String(id) } });
    syncProveedoresToConfig(st);
    save(st);
    return true;
  }

  function addInventarioMovimiento(st, mov) {
    var row = {
      id: uid('inv'),
      fecha: mov.fecha || new Date().toISOString().slice(0, 10),
      tipo: mov.tipo,
      refTipo: mov.refTipo || null,
      refId: mov.refId || null,
      productoRefTipo: mov.productoRefTipo || 'producto_pos',
      productoRefId: String(mov.productoRefId || mov.producto || 'general'),
      productoNombre: mov.productoNombre || mov.producto || '',
      cantidad: Number(mov.cantidad) || 0,
      unidad: mov.unidad || 'und',
      costoUnitario: Number(mov.costoUnitario) || 0,
      notas: mov.notas || '',
      createdAt: new Date().toISOString(),
    };
    st.inventarioMovimientos.unshift(row);
    if (st.inventarioMovimientos.length > 2000) st.inventarioMovimientos.length = 2000;
    pushSync(st, { tipo: 'insert', tabla: 'crozzo_inventario_movimientos', payload: row });
    return row;
  }

  function mpInvUnidad(und) {
    var u = String(und || 'GR').toUpperCase();
    if (u === 'ML') return 'ml';
    if (u === 'UND' || u === 'UNI') return 'und';
    if (u === 'KG') return 'kg';
    return 'g';
  }

  /** Reemplaza movimientos de inventario de una recepción y registra entradas por línea MP. */
  function syncInventarioRecepcion(st, rec, items) {
    if (!rec || !rec.id) return;
    st.inventarioMovimientos = (st.inventarioMovimientos || []).filter(function (m) {
      return !(m.refTipo === 'recepcion' && String(m.refId) === String(rec.id));
    });
    (items || []).forEach(function (line) {
      if (!line) return;
      var mpId = line.mpId || line.productoRefId;
      if (!mpId) return;
      var cant = Number(line.cantidad) || Number(line.peso) || 0;
      if (cant <= 0) return;
      var pTotal = Number(line.precioTotal != null ? line.precioTotal : line.valor) || 0;
      addInventarioMovimiento(st, {
        tipo: 'entrada_proveedor',
        refTipo: 'recepcion',
        refId: rec.id,
        productoRefId: mpId,
        productoRefTipo: 'materia_prima',
        productoNombre: line.productoNombre || line.nombre || 'Materia prima',
        cantidad: cant,
        unidad: mpInvUnidad(line.und || line.unidad),
        costoUnitario: cant > 0 && pTotal > 0 ? pTotal / cant : 0,
        notas:
          'Ingreso por factura' +
          (rec.numeroFactura ? ' ' + rec.numeroFactura : '') +
          (rec.proveedorNombre ? ' · ' + rec.proveedorNombre : ''),
        fecha: rec.fecha,
      });
    });
  }

  /**
   * Compras por materia prima en un rango (recepciones confirmadas).
   * opts: { dias, desde, hasta, categoria, mpId, q }
   */
  function getComprasMpResumen(opts) {
    opts = opts || {};
    var dias = Number(opts.dias);
    if (!isFinite(dias) || dias <= 0) dias = 30;
    var hasta = opts.hasta || new Date().toISOString().slice(0, 10);
    var desde = opts.desde;
    if (!desde) {
      var d0 = new Date();
      d0.setDate(d0.getDate() - dias);
      desde = d0.toISOString().slice(0, 10);
    }
    var catFilt = opts.categoria ? String(opts.categoria).toUpperCase() : '';
    var mpFilt = opts.mpId ? String(opts.mpId) : '';
    var q = opts.q ? String(opts.q).toLowerCase().trim() : '';
    var catApi = global.CrozzoCatalogoMp;
    var byMp = {};

    migrateLegacy().recepciones.forEach(function (rec) {
      if (!rec || rec.estado === 'anulada') return;
      var fecha = String(rec.fecha || rec.createdAt || '').slice(0, 10);
      if (fecha < desde || fecha > hasta) return;
      (rec.items || []).forEach(function (line) {
        if (!line) return;
        var mpId = String(line.mpId || line.productoRefId || '').trim();
        if (!mpId) return;
        var mp = catApi && catApi.get ? catApi.get(mpId) : null;
        var nombre = line.productoNombre || (mp && mp.nombre) || mpId;
        var categoria = String(line.categoria || (mp && mp.categoria) || 'OTRO').toUpperCase();
        if (catFilt && categoria !== catFilt) return;
        if (mpFilt && mpId !== mpFilt) return;
        if (q && nombre.toLowerCase().indexOf(q) < 0 && categoria.toLowerCase().indexOf(q) < 0) return;
        if (!byMp[mpId]) {
          byMp[mpId] = {
            mpId: mpId,
            nombre: nombre,
            categoria: categoria,
            und: (mp && mp.und) || line.und || 'GR',
            cantidad: 0,
            valor: 0,
            compras: 0,
          };
        }
        byMp[mpId].cantidad += Number(line.cantidad) || Number(line.peso) || 0;
        byMp[mpId].valor += Number(line.precioTotal) || 0;
        byMp[mpId].compras += 1;
      });
    });

    var filas = Object.keys(byMp).map(function (k) {
      return byMp[k];
    });
    filas.sort(function (a, b) {
      return b.valor - a.valor;
    });
    var totalValor = filas.reduce(function (s, f) {
      return s + f.valor;
    }, 0);
    var totalCant = filas.reduce(function (s, f) {
      return s + f.cantidad;
    }, 0);
    return {
      desde: desde,
      hasta: hasta,
      dias: dias,
      filas: filas,
      totalValor: totalValor,
      totalCant: totalCant,
      totalFilas: filas.length,
    };
  }

  function enqueuePlanilla(st, item) {
    var row = {
      id: item.id || uid('feed'),
      business_id: businessId(),
      origen: item.origen || 'manual',
      fecha: item.fecha || new Date().toISOString().slice(0, 10),
      concepto: item.concepto || 'Movimiento',
      monto: Number(item.monto) || 0,
      tipo_movimiento: item.tipo_movimiento || 'egreso',
      referencia_tipo: item.referencia_tipo || null,
      referencia_id: item.referencia_id || null,
      payload: item.payload || {},
      estado: item.estado || 'pendiente',
      created_at: item.created_at || new Date().toISOString(),
    };
    st.planillaFeed.unshift(row);
    if (st.planillaFeed.length > 500) st.planillaFeed.length = 500;
    pushSync(st, { tipo: 'insert', tabla: 'crozzo_planilla_feed', payload: row });
    emitCostos('crozzo-costos:feed-planilla', Object.assign({}, row, { enqueuePlanilla: false }));
    return row;
  }

  function pushAlertaPrecio(st, alerta) {
    if (!st.meta) st.meta = {};
    if (!Array.isArray(st.meta.alertasPrecio)) st.meta.alertasPrecio = [];
    var row = Object.assign(
      {
        id: uid('alrt'),
        fecha: new Date().toISOString(),
        leida: false,
      },
      alerta || {}
    );
    st.meta.alertasPrecio.unshift(row);
    if (st.meta.alertasPrecio.length > 80) st.meta.alertasPrecio.length = 80;
    return row;
  }

  /** Evita ráfagas de la misma factura (doble clic / handlers duplicados). */
  function findRecepcionDuplicadaReciente(input) {
    input = input || {};
    var pid = String(input.proveedorId || '');
    var nf = String(input.numeroFactura || '').trim();
    var val = Number(input.valor) || 0;
    var nItems = (input.items && input.items.length) || 0;
    var lim = Date.now() - 120000;
    var st = migrateLegacy();
    for (var i = 0; i < st.recepciones.length && i < 30; i++) {
      var r = st.recepciones[i];
      if (!r) continue;
      var t = new Date(r.createdAt || r.fecha || 0).getTime();
      if (t < lim) break;
      if (String(r.proveedorId) !== pid) continue;
      if (String(r.numeroFactura || '').trim() !== nf) continue;
      if (Math.abs(Number(r.valor) - val) >= 1) continue;
      if (((r.items && r.items.length) || 0) !== nItems) continue;
      return r;
    }
    return null;
  }

  function dedupeRecepcionesBurst(st) {
    if (!st || !Array.isArray(st.recepciones) || st.recepciones.length < 2) return false;
    var seen = {};
    var kept = [];
    var removed = 0;
    st.recepciones.forEach(function (r) {
      if (!r) return;
      var t = new Date(r.createdAt || r.fecha || 0).getTime();
      var bucket = isFinite(t) ? Math.floor(t / 3000) : 0;
      var sig =
        String(r.proveedorId || '') +
        '|' +
        String(r.numeroFactura || '').trim() +
        '|' +
        Math.round(Number(r.valor) || 0) +
        '|' +
        ((r.items && r.items.length) || 0) +
        '|' +
        bucket;
      if (seen[sig]) {
        removed++;
        return;
      }
      seen[sig] = true;
      kept.push(r);
    });
    if (!removed) return false;
    st.recepciones = kept;
    return true;
  }

  function registrarRecepcion(input) {
    input = input || {};
    var rid = input.id ? String(input.id) : '';
    if (rid) {
      var prev = getRecepcion(rid);
      if (prev) return actualizarRecepcion(rid, input);
    }
    if (!input._forceNew) {
      var dup = findRecepcionDuplicadaReciente(input);
      if (dup) return actualizarRecepcion(dup.id, input);
    }
    var st = migrateLegacy();
    var prov = getProveedor(input.proveedorId) || { id: input.proveedorId, nombre: input.proveedorNombre || 'Proveedor' };
    var valor = Number(input.valor) || 0;
    var rec = {
      id: input.id || uid('rec'),
      fecha: input.fecha || new Date().toISOString().slice(0, 10),
      proveedorId: prov.id,
      proveedorNombre: prov.nombre || input.proveedorNombre,
      valor: valor,
      notas: input.notas || '',
      numeroFactura: input.numeroFactura || '',
      metodoPago: input.metodoPago || input.metodo || 'por_definir',
      comentarios: input.comentarios || '',
      adjuntos: sanitizeAdjuntos(input.adjuntos),
      syncEstado: input.syncEstado || 'pendiente_nube',
      alertasPrecio: Array.isArray(input.alertasPrecio) ? input.alertasPrecio : [],
      estado: input.estado || 'confirmada',
      items: input.items || [],
      createdAt: input.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    st.recepciones.unshift(rec);

    var items = Array.isArray(input.items) ? input.items : [];
    if (items.length) {
      syncInventarioRecepcion(st, rec, items);
    } else {
      addInventarioMovimiento(st, {
        tipo: 'entrada_proveedor',
        refTipo: 'recepcion',
        refId: rec.id,
        productoRefId: input.productoRefId || 'recepcion-' + rec.id,
        productoNombre: input.productoNombre || rec.notas || 'Recepción proveedor',
        cantidad: input.cantidad || 1,
        unidad: input.unidad || 'und',
        costoUnitario: valor > 0 ? valor : 0,
        notas: 'Recepción: ' + (rec.proveedorNombre || ''),
      });
    }

    var factura = null;
    if (valor > 0 && input.crearOficina !== false) {
      factura = {
        id: uid('of'),
        fecha: rec.fecha,
        proveedorId: prov.id,
        proveedorNombre: prov.nombre,
        valor: valor,
        metodo: input.metodoPago || input.metodo || 'por_definir',
        estado: 'pendiente',
        recepcionId: rec.id,
        notas: rec.comentarios || rec.notas,
        numeroFactura: rec.numeroFactura,
        createdAt: new Date().toISOString(),
      };
      st.facturasOficina.unshift(factura);
      pushSync(st, { tipo: 'insert', tabla: 'facturas', payload: factura });
    }

    pushSync(st, { tipo: 'insert', tabla: 'recepciones', payload: rec });
    save(st);

    var costeoActualizado = [];
    if (items.length && global.CrozzoCatalogoMp && global.CrozzoCatalogoMp.applyRecepcionItems) {
      try {
        costeoActualizado = global.CrozzoCatalogoMp.applyRecepcionItems(items, {
          recepcionId: rec.id,
          fecha: rec.createdAt,
          skipConfirm: input.skipConfirmVariacion === true,
        }) || [];
      } catch (costeoErr) {
        console.warn('[reservorio] costeo recepción', costeoErr);
      }
    }

    if (rec.alertasPrecio && rec.alertasPrecio.length) {
      rec.alertasPrecio.forEach(function (a) {
        pushAlertaPrecio(st, Object.assign({ recepcionId: rec.id, proveedorNombre: rec.proveedorNombre }, a));
      });
    }

    emitCostos('crozzo-costos:recepcion-registrada', {
      recepcion: rec,
      facturaOficina: factura,
      proveedor: prov,
      items: items,
      costeoActualizado: costeoActualizado,
      alertasPrecio: rec.alertasPrecio,
    });
    try {
      global.dispatchEvent(
        new CustomEvent('crozzo-recepcion:guardada', {
          detail: { recepcion: rec, alertasPrecio: rec.alertasPrecio },
        })
      );
    } catch (_) {}

    return { recepcion: rec, facturaOficina: factura, costeoActualizado: costeoActualizado };
  }

  function getRecepcion(id) {
    return migrateLegacy().recepciones.find(function (r) {
      return String(r.id) === String(id);
    });
  }

  function listRecepciones(limit) {
    return migrateLegacy().recepciones.slice(0, limit || 100);
  }

  function eliminarRecepcion(id) {
    var st = migrateLegacy();
    var sid = String(id || '');
    if (!sid) return false;
    var idx = st.recepciones.findIndex(function (r) {
      return String(r.id) === sid;
    });
    if (idx < 0) return false;
    var removed = st.recepciones[idx];

    st.inventarioMovimientos = (st.inventarioMovimientos || []).filter(function (m) {
      return !(m.refTipo === 'recepcion' && String(m.refId) === sid);
    });

    st.facturasOficina = (st.facturasOficina || []).filter(function (f) {
      return String(f.recepcionId || '') !== sid;
    });

    if (st.meta && Array.isArray(st.meta.alertasPrecio)) {
      st.meta.alertasPrecio = st.meta.alertasPrecio.filter(function (a) {
        return String(a.recepcionId || '') !== sid;
      });
    }

    st.recepciones.splice(idx, 1);
    pushSync(st, { tipo: 'delete', tabla: 'recepciones', payload: { id: sid } });
    save(st);

    emitCostos('crozzo-costos:recepcion-eliminada', { recepcion: removed, id: sid });
    try {
      global.dispatchEvent(
        new CustomEvent('crozzo-recepcion:eliminada', {
          detail: { recepcion: removed, id: sid },
        })
      );
    } catch (_) {}

    return true;
  }

  function actualizarRecepcion(id, input) {
    var st = migrateLegacy();
    var idx = st.recepciones.findIndex(function (r) {
      return String(r.id) === String(id);
    });
    if (idx < 0) return null;
    var prev = st.recepciones[idx];
    var patch = Object.assign({}, input || {}, { updatedAt: new Date().toISOString() });
    if (patch.adjuntos) patch.adjuntos = sanitizeAdjuntos(patch.adjuntos);
    var next = Object.assign({}, prev, patch);
    st.recepciones[idx] = next;
    if (input && input.items && input.items.length) {
      syncInventarioRecepcion(st, next, input.items);
    }
    pushSync(st, { tipo: 'update', tabla: 'recepciones', payload: next });
    save(st);
    var costeoActualizado = [];
    if (input && input.items && global.CrozzoCatalogoMp && global.CrozzoCatalogoMp.applyRecepcionItems) {
      try {
        costeoActualizado = global.CrozzoCatalogoMp.applyRecepcionItems(input.items, {
          recepcionId: next.id,
          fecha: next.updatedAt,
          skipConfirm: input.skipConfirmVariacion === true,
        }) || [];
      } catch (costeoErr) {
        console.warn('[reservorio] costeo recepción (update)', costeoErr);
      }
    }
    emitCostos('crozzo-costos:recepcion-actualizada', {
      recepcion: next,
      anterior: prev,
      costeoActualizado: costeoActualizado,
    });
    return { recepcion: next, costeoActualizado: costeoActualizado };
  }

  function listAlertasPrecio(limit) {
    var st = migrateLegacy();
    var list = (st.meta && st.meta.alertasPrecio) || [];
    return list.slice(0, limit || 40);
  }

  function registrarOficina(input) {
    var st = migrateLegacy();
    var prov = getProveedor(input.proveedorId) || { id: input.proveedorId, nombre: input.proveedorNombre };
    var fac = {
      id: input.id || uid('of'),
      fecha: input.fecha || new Date().toISOString().slice(0, 10),
      proveedorId: prov.id,
      proveedorNombre: prov.nombre || input.proveedorNombre,
      numeroFactura: String(input.numeroFactura || '').trim(),
      valor: Number(input.valor) || 0,
      metodo: input.metodo || 'efectivo',
      estado: input.estado || 'pendiente',
      recepcionId: input.recepcionId || null,
      notas: input.notas || '',
      createdAt: new Date().toISOString(),
    };
    st.facturasOficina.unshift(fac);
    pushSync(st, { tipo: 'insert', tabla: 'facturas', payload: fac });
    save(st);
    if (fac.estado === 'pagada') onFacturaPagada(fac);
    return fac;
  }

  function actualizarEstadoOficina(facturaId, estado, extra) {
    var st = migrateLegacy();
    var fac = st.facturasOficina.find(function (f) { return f.id === facturaId; });
    if (!fac) return null;
    fac.estado = estado;
    if (extra) Object.assign(fac, extra);
    fac.updatedAt = new Date().toISOString();
    pushSync(st, { tipo: 'update', tabla: 'facturas', payload: fac });
    save(st);
    if (estado === 'pagada') onFacturaPagada(fac);
    return fac;
  }

  function onFacturaPagada(fac) {
    emitCostos('crozzo-costos:factura-pagada', { factura: fac });
    var st = load();
    var exists = st.planillaFeed.some(function (f) {
      return f.referencia_id === fac.id && f.origen === 'oficina' && f.estado !== 'rechazado';
    });
    if (exists) return;
    enqueuePlanilla(st, {
      origen: 'oficina',
      concepto: 'Pago proveedor: ' + (fac.proveedorNombre || ''),
      monto: fac.valor,
      tipo_movimiento: 'egreso',
      referencia_tipo: 'factura_oficina',
      referencia_id: fac.id,
      payload: fac,
    });
    save(st);
  }

  function registrarProceso(input) {
    var st = migrateLegacy();
    var cor = {
      id: input.id || uid('cor'),
      fecha: input.fecha || new Date().toISOString().slice(0, 10),
      producto: input.producto || '',
      kg: Number(input.kg) || 0,
      notas: input.notas || '',
      createdAt: new Date().toISOString(),
    };
    st.cortes.unshift(cor);
    addInventarioMovimiento(st, {
      tipo: 'entrada_proceso',
      refTipo: 'proceso',
      refId: cor.id,
      productoRefId: cor.producto,
      productoNombre: cor.producto,
      cantidad: cor.kg || 1,
      unidad: 'kg',
      notas: cor.notas,
    });
    pushSync(st, { tipo: 'insert', tabla: 'lotes_procesado', payload: cor });
    save(st);
    emitCostos('crozzo-costos:proceso-cerrado', { proceso: cor });
    return cor;
  }

  function registrarVenta(input) {
    var st = migrateLegacy();
    var total = Number(input.monto || input.total) || 0;
    var items = input.items || [];

    items.forEach(function (line) {
      var qty = Number(line.cantidad || line.qty) || 0;
      if (qty <= 0) return;
      addInventarioMovimiento(st, {
        tipo: 'salida_venta',
        refTipo: 'venta',
        refId: input.saleId || input.uuid,
        productoRefTipo: 'producto_pos',
        productoRefId: line.id || line.productId,
        productoNombre: line.nombre || '',
        cantidad: qty,
        unidad: 'und',
        notas: 'Venta POS',
      });
    });

    if (total > 0) {
      enqueuePlanilla(st, {
        origen: 'ventas',
        concepto: input.concepto || 'Ventas del día',
        monto: total,
        tipo_movimiento: 'ingreso',
        referencia_tipo: 'venta',
        referencia_id: input.saleId || input.uuid,
        payload: input,
      });
    }

    save(st);
    emitCostos('crozzo-costos:venta-registrada', input);
    return true;
  }

  function registrarOrdenCompraRecibida(po) {
    if (!po) return null;
    var st = migrateLegacy();
    (po.items || []).forEach(function (line) {
      addInventarioMovimiento(st, {
        tipo: 'entrada_proveedor',
        refTipo: 'orden_compra',
        refId: po.id,
        productoRefTipo: 'producto_pos',
        productoRefId: line.productId,
        productoNombre: line.nombre,
        cantidad: Number(line.qty) || 0,
        unidad: 'und',
        notas: 'OC recibida: ' + po.id,
      });
    });
    var rec = {
      id: uid('rec'),
      fecha: new Date().toISOString().slice(0, 10),
      proveedorId: po.supplierId,
      proveedorNombre: po.supplierName,
      valor: 0,
      notas: 'Recepción automática OC ' + po.id,
      ordenCompraId: po.id,
      items: po.items || [],
      createdAt: new Date().toISOString(),
    };
    st.recepciones.unshift(rec);
    pushSync(st, { tipo: 'insert', tabla: 'recepciones', payload: rec });
    save(st);
    emitCostos('crozzo-costos:recepcion-registrada', { recepcion: rec, origen: 'orden_compra' });
    return rec;
  }

  function getStats() {
    var st = migrateLegacy();
    var totalRec = st.recepciones.reduce(function (s, r) { return s + (Number(r.valor) || 0); }, 0);
    var totalOf = st.facturasOficina.reduce(function (s, f) { return s + (Number(f.valor) || 0); }, 0);
    var pagadas = st.facturasOficina.filter(function (f) { return f.estado === 'pagada'; });
    var pendientes = st.facturasOficina.filter(function (f) { return f.estado === 'pendiente' || f.estado === 'en_proceso'; });
    return {
      proveedores: st.proveedores.length,
      recepciones: st.recepciones.length,
      totalRecepciones: totalRec,
      facturasOficina: st.facturasOficina.length,
      totalOficina: totalOf,
      pagadas: pagadas.length,
      pendientes: pendientes.length,
      cortes: st.cortes.length,
      movimientosInv: st.inventarioMovimientos.length,
      colaPlanilla: st.planillaFeed.filter(function (f) { return f.estado === 'pendiente'; }).length,
      syncPendiente: st.syncQueue.filter(function (q) { return q.estado === 'pendiente'; }).length,
      updatedAt: st.updatedAt,
    };
  }

  function listInventarioMovimientos(limit) {
    return migrateLegacy().inventarioMovimientos.slice(0, limit || 100);
  }

  function inventarioConteoResumen(lineas) {
    var contadas = 0;
    var difs = 0;
    var difValor = 0;
    Object.keys(lineas || {}).forEach(function (k) {
      var l = lineas[k];
      if (!l || l.fisico == null || l.fisico === '' || !isFinite(Number(l.fisico))) return;
      contadas++;
      var teo = Number(l.teorico) || 0;
      var fis = Number(l.fisico) || 0;
      var diff = Math.round((fis - teo) * 100) / 100;
      if (Math.abs(diff) > 0.001) {
        difs++;
        difValor += diff * (Number(l.precioUnit) || 0);
      }
    });
    return {
      contadas: contadas,
      difs: difs,
      difValor: Math.round(difValor),
    };
  }

  function listInventarioConteos(limit) {
    return migrateLegacy()
      .inventarioConteos.slice()
      .sort(function (a, b) {
        return String(b.updatedAt || b.fecha || '').localeCompare(String(a.updatedAt || a.fecha || ''));
      })
      .slice(0, limit || 50);
  }

  function getInventarioConteoAbierto(fecha) {
    var f = String(fecha || '').slice(0, 10);
    return (
      migrateLegacy().inventarioConteos.find(function (c) {
        return c.estado === 'borrador' && String(c.fecha || '').slice(0, 10) === f;
      }) || null
    );
  }

  function getInventarioConteo(id) {
    return migrateLegacy().inventarioConteos.find(function (c) {
      return String(c.id) === String(id);
    }) || null;
  }

  function upsertInventarioConteo(data) {
    var st = migrateLegacy();
    var now = new Date().toISOString();
    var row = Object.assign({}, data || {});
    if (!row.id) row.id = uid('cnt');
    row.fecha = String(row.fecha || now.slice(0, 10)).slice(0, 10);
    row.contadoPor = String(row.contadoPor || '').trim();
    row.estado = row.estado === 'cerrado' ? 'cerrado' : 'borrador';
    row.lineas = row.lineas && typeof row.lineas === 'object' ? row.lineas : {};
    row.resumen = inventarioConteoResumen(row.lineas);
    row.updatedAt = now;
    if (!row.createdAt) row.createdAt = now;
    var idx = st.inventarioConteos.findIndex(function (c) {
      return String(c.id) === String(row.id);
    });
    if (idx >= 0) st.inventarioConteos[idx] = row;
    else st.inventarioConteos.unshift(row);
    if (st.inventarioConteos.length > 200) st.inventarioConteos.length = 200;
    pushSync(st, { tipo: 'upsert', tabla: 'crozzo_inventario_cierres', payload: row });
    save(st);
    return row;
  }

  function cerrarInventarioConteo(conteoId, opts) {
    opts = opts || {};
    var st = migrateLegacy();
    var idx = st.inventarioConteos.findIndex(function (c) {
      return String(c.id) === String(conteoId);
    });
    if (idx < 0) return null;
    var row = st.inventarioConteos[idx];
    row.estado = 'cerrado';
    row.cerradoAt = new Date().toISOString();
    row.resumen = inventarioConteoResumen(row.lineas);
    row.ajustesAplicados = !!opts.aplicarAjustes;
    if (opts.aplicarAjustes) {
      Object.keys(row.lineas || {}).forEach(function (mpId) {
        var l = row.lineas[mpId];
        if (!l || l.fisico == null || l.fisico === '' || !isFinite(Number(l.fisico))) return;
        var teo = Number(l.teorico) || 0;
        var fis = Number(l.fisico) || 0;
        var diff = Math.round((fis - teo) * 100) / 100;
        if (Math.abs(diff) < 0.001) return;
        addInventarioMovimiento(st, {
          tipo: diff > 0 ? 'ajuste_entrada' : 'ajuste_salida',
          refTipo: 'conteo',
          refId: row.id,
          productoRefId: mpId,
          productoRefTipo: 'materia_prima',
          productoNombre: l.nombre || mpId,
          cantidad: Math.abs(diff),
          unidad: mpInvUnidad(l.und),
          costoUnitario: Number(l.precioUnit) || 0,
          notas: 'Ajuste conteo ' + row.fecha + (l.obs ? ' · ' + l.obs : ''),
        });
      });
    }
    st.inventarioConteos[idx] = row;
    pushSync(st, { tipo: 'upsert', tabla: 'crozzo_inventario_cierres', payload: row });
    save(st);
    return row;
  }

  function listFeed(limit) {
    return migrateLegacy().planillaFeed.slice(0, limit || 100);
  }

  function updateFeedEstado(feedId, estado) {
    var st = migrateLegacy();
    var it = st.planillaFeed.find(function (f) { return f.id === feedId; });
    if (!it) return null;
    it.estado = estado;
    it.revisado_at = new Date().toISOString();
    pushSync(st, { tipo: 'update', tabla: 'crozzo_planilla_feed', payload: it });
    save(st);
    return it;
  }

  function exportSnapshot() {
    return migrateLegacy();
  }

  function fmtCop(n) {
    var x = Number(n);
    if (!isFinite(x)) return '—';
    try {
      return x.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
    } catch (_) {
      return '$' + Math.round(x);
    }
  }

  function renderComprasMpDashboardHtml(opts) {
    opts = opts || {};
    var res = getComprasMpResumen(opts);
    var undLbl = function (und) {
      var u = String(und || 'GR').toUpperCase();
      if (u === 'ML') return 'ml';
      if (u === 'UND' || u === 'UNI') return 'und';
      return 'g';
    };
    if (!res.filas.length) {
      return (
        '<p class="form-hint" style="margin:8px 0 0">Sin compras de materia prima entre ' +
        esc(res.desde) +
        ' y ' +
        esc(res.hasta) +
        '.</p>'
      );
    }
    var top = res.filas.slice(0, 15);
    return (
      '<div class="crozzo-compras-mp-dash" style="margin-top:14px">' +
      '<h3 style="margin:0 0 8px;font-size:1rem">Compras por materia prima</h3>' +
      '<p class="form-hint" style="margin:0 0 10px">Período ' +
      esc(res.desde) +
      ' → ' +
      esc(res.hasta) +
      ' · ' +
      res.totalFilas +
      ' producto(s) · ' +
      fmtCop(res.totalValor) +
      '</p>' +
      '<div class="crozzo-mod-table-scroll"><table class="crozzo-mod-table"><thead><tr>' +
      '<th>Materia prima</th><th>Categoría</th><th style="text-align:right">Cantidad</th><th style="text-align:right">Valor comprado</th><th style="text-align:right"># compras</th>' +
      '</tr></thead><tbody>' +
      top
        .map(function (f) {
          return (
            '<tr><td><strong>' +
            esc(f.nombre) +
            '</strong></td><td>' +
            esc(f.categoria) +
            '</td><td style="text-align:right">' +
            (Math.round(f.cantidad * 100) / 100).toLocaleString('es-CO') +
            ' ' +
            esc(undLbl(f.und)) +
            '</td><td style="text-align:right">' +
            fmtCop(f.valor) +
            '</td><td style="text-align:right">' +
            f.compras +
            '</td></tr>'
          );
        })
        .join('') +
      '</tbody></table></div>' +
      (res.filas.length > 15
        ? '<p class="form-hint" style="margin:8px 0 0">Mostrando top 15 de ' + res.filas.length + '.</p>'
        : '') +
      '</div>'
    );
  }

  function renderDashboardHtml(opts) {
    opts = opts || {};
    var s = getStats();
    var dias = Number(opts.dias) > 0 ? Number(opts.dias) : 30;
    return (
      '<div class="crozzo-reservorio-dash" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-bottom:14px">' +
      '<div class="card" style="padding:12px"><div class="form-hint">Proveedores</div><strong style="font-size:1.3rem">' + s.proveedores + '</strong></div>' +
      '<div class="card" style="padding:12px"><div class="form-hint">Recepciones</div><strong style="font-size:1.3rem">' + s.recepciones + '</strong><div style="font-size:.78rem;opacity:.8">' + fmtCop(s.totalRecepciones) + '</div></div>' +
      '<div class="card" style="padding:12px"><div class="form-hint">Oficina pend.</div><strong style="font-size:1.3rem">' + s.pendientes + '</strong></div>' +
      '<div class="card" style="padding:12px"><div class="form-hint">Cola planilla</div><strong style="font-size:1.3rem">' + s.colaPlanilla + '</strong></div>' +
      '<div class="card" style="padding:12px"><div class="form-hint">Sync pendiente</div><strong style="font-size:1.3rem">' + s.syncPendiente + '</strong></div>' +
      '<div class="card" style="padding:12px"><div class="form-hint">Mov. inventario</div><strong style="font-size:1.3rem">' + s.movimientosInv + '</strong></div>' +
      (function () {
        var al = (migrateLegacy().meta && migrateLegacy().meta.alertasPrecio) || [];
        var pend = al.filter(function (a) { return !a.leida && (a.nivel === 'alerta' || a.nivel === 'sube'); }).length;
        if (!pend) return '';
        return '<div class="card" style="padding:12px;border-color:rgba(255,159,10,.4)"><div class="form-hint">Alertas precio</div><strong style="font-size:1.3rem;color:var(--warning)">' + pend + '</strong></div>';
      })() +
      '</div>' +
      '<p class="form-hint" style="margin:0">Reservorio unificado · actualizado ' + esc(s.updatedAt || '') + '</p>' +
      renderComprasMpDashboardHtml({ dias: dias, categoria: opts.categoria, q: opts.q })
    );
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // Init migration on load
  migrateLegacy();

  global.CrozzoReservorio = {
    LS: LS,
    load: load,
    save: save,
    migrateLegacy: migrateLegacy,
    listProveedores: listProveedores,
    syncProveedoresBidirectional: syncProveedoresBidirectional,
    listProveedoresOcFormat: listProveedoresOcFormat,
    getProveedor: getProveedor,
    deleteProveedor: deleteProveedor,
    upsertProveedor: upsertProveedor,
    syncProveedoresToConfig: syncProveedoresToConfig,
    listCotizacionesMp: listCotizacionesMp,
    addCotizacionMp: addCotizacionMp,
    removeCotizacionMp: removeCotizacionMp,
    registrarRecepcion: registrarRecepcion,
    getRecepcion: getRecepcion,
    listRecepciones: listRecepciones,
    eliminarRecepcion: eliminarRecepcion,
    actualizarRecepcion: actualizarRecepcion,
    listAlertasPrecio: listAlertasPrecio,
    pushAlertaPrecio: function (alerta) {
      var st = migrateLegacy();
      var row = pushAlertaPrecio(st, alerta);
      save(st);
      return row;
    },
    registrarOficina: registrarOficina,
    actualizarEstadoOficina: actualizarEstadoOficina,
    registrarProceso: registrarProceso,
    registrarVenta: registrarVenta,
    registrarOrdenCompraRecibida: registrarOrdenCompraRecibida,
    addInventarioMovimiento: function (mov) {
      var st = migrateLegacy();
      var row = addInventarioMovimiento(st, mov);
      save(st);
      return row;
    },
    getStats: getStats,
    listInventarioMovimientos: listInventarioMovimientos,
    listInventarioConteos: listInventarioConteos,
    getInventarioConteoAbierto: getInventarioConteoAbierto,
    getInventarioConteo: getInventarioConteo,
    upsertInventarioConteo: upsertInventarioConteo,
    cerrarInventarioConteo: cerrarInventarioConteo,
    upsertMatrizMp: upsertMatrizMp,
    listMatrizMp: listMatrizMp,
    listCatalogoMp: function (limit) {
      return migrateLegacy().catalogoMp.slice(0, limit || 500);
    },
    listFeed: listFeed,
    updateFeedEstado: updateFeedEstado,
    exportSnapshot: exportSnapshot,
    renderDashboardHtml: renderDashboardHtml,
    getComprasMpResumen: getComprasMpResumen,
    renderComprasMpDashboardHtml: renderComprasMpDashboardHtml,
    fmtCop: fmtCop,
    getHealth: getHealth,
    getStorageSummary: getStorageSummary,
    sanitizeAdjuntos: sanitizeAdjuntos,
    retentionDays: function () {
      return RETENTION_DAYS;
    },
    repairIfNeeded: repairIfNeeded,
    runBlobMigration: runBlobMigration,
    flushBackup: flushBackup,
  };

  global.crozzoReservorioRegistrarVenta = registrarVenta;
  global.crozzoReservorioUpsertProveedor = upsertProveedor;
})(typeof window !== 'undefined' ? window : globalThis);



/* --- CrozzoReservorioOffline.js --- */

/**
 * Crozzo POS — Guardián offline: conectividad, modo local seguro, salud del reservorio.
 */
(function (global) {
  'use strict';

  var state = { online: true, lastCheck: null };

  function isBrowserOnline() {
    try {
      return global.navigator ? global.navigator.onLine !== false : true;
    } catch (_) {
      return true;
    }
  }

  function hasCloudConfig() {
    try {
      return typeof global.crozzoOnlineConfigReady === 'function' && global.crozzoOnlineConfigReady();
    } catch (_) {
      return false;
    }
  }

  function runtimePrefersOffline() {
    try {
      if (global.config && global.config.get) {
        var m = global.config.get('runtimeSyncModo');
        if (m === 'offline') return true;
      }
    } catch (_) {}
    return false;
  }

  /** Nube solo si hay config, navegador online y preferencia no es offline puro */
  function shouldUseCloud() {
    if (runtimePrefersOffline()) return false;
    if (!isBrowserOnline()) return false;
    if (!hasCloudConfig()) return false;
    return true;
  }

  function modeInfo() {
    if (shouldUseCloud()) {
      return { mode: 'cloud', label: 'Nube activa', icon: '☁️', secure: true };
    }
    if (hasCloudConfig() && !isBrowserOnline()) {
      return { mode: 'offline-local', label: 'Sin internet — local seguro', icon: '🔒', secure: true };
    }
    if (runtimePrefersOffline()) {
      return { mode: 'offline-pref', label: 'Modo offline (preferencia)', icon: '💾', secure: true };
    }
    return { mode: 'local', label: 'Modo local — datos en este equipo', icon: '💾', secure: true };
  }

  function refreshConnectivity() {
    state.online = isBrowserOnline();
    state.lastCheck = new Date().toISOString();
    try {
      document.dispatchEvent(
        new CustomEvent('crozzo-connectivity-changed', {
          detail: { online: state.online, mode: modeInfo() },
        })
      );
    } catch (_) {}
    return state.online;
  }

  function onOffline() {
    refreshConnectivity();
    try {
      if (typeof global.showToast === 'function') {
        global.showToast('Sin internet — operando en modo local seguro (reservorio)', 'info');
      }
    } catch (_) {}
  }

  function onOnline() {
    refreshConnectivity();
    try {
      if (typeof global.showToast === 'function') {
        global.showToast('Conexión restablecida', 'success');
      }
    } catch (_) {}
  }

  function ensureReservorioReady() {
    var R = global.CrozzoReservorio;
    if (!R) return false;
    try {
      if (R.repairIfNeeded) R.repairIfNeeded();
      else if (R.migrateLegacy) R.migrateLegacy();
      if (R.syncProveedoresToConfig) R.syncProveedoresToConfig();
    } catch (e) {
      console.warn('[offline] reservorio init', e);
    }
    return true;
  }

  function getHealth() {
    var R = global.CrozzoReservorio;
    var base = R && R.getHealth ? R.getHealth() : { ok: !!R };
    var mi = modeInfo();
    return Object.assign({}, base, {
      connectivity: mi,
      browserOnline: isBrowserOnline(),
      cloudConfigured: hasCloudConfig(),
      shouldUseCloud: shouldUseCloud(),
      lastConnectivityCheck: state.lastCheck,
    });
  }

  function statusBarHtml(prefix) {
    prefix = prefix || '';
    var mi = modeInfo();
    var R = global.CrozzoReservorio;
    var h = R && R.getHealth ? R.getHealth() : {};
    var backup = h.hasBackup ? ' · copia de seguridad OK' : '';
    var recovered = h.recoveredFromBackup ? ' · <span style="color:#f59e0b">recuperado de backup</span>' : '';
    return (
      prefix +
      '<div class="crozzo-hub-status crozzo-offline-status" id="crozzo-hub-status" style="padding:6px 14px;font-size:11px;border-bottom:1px solid var(--border);background:var(--bg-card);color:var(--text-muted)">' +
      '<span>' +
      mi.icon +
      ' <strong style="color:var(--text-primary)">' +
      mi.label +
      '</strong>' +
      backup +
      recovered +
      '</span></div>'
    );
  }

  function exportBackupFile() {
    var R = global.CrozzoReservorio;
    if (!R || !R.exportSnapshot) return false;
    try {
      var snap = R.exportSnapshot();
      var name = 'crozzo-reservorio-' + new Date().toISOString().slice(0, 10) + '.json';
      var blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 500);
      return true;
    } catch (e) {
      console.warn('[offline] export', e);
      return false;
    }
  }

  function init() {
    if (global.__crozzoOfflineInited) return;
    global.__crozzoOfflineInited = true;
    state.online = isBrowserOnline();
    ensureReservorioReady();
    global.addEventListener('online', onOnline);
    global.addEventListener('offline', onOffline);
    global.addEventListener('beforeunload', function () {
      try {
        if (global.CrozzoReservorio && global.CrozzoReservorio.flushBackup) global.CrozzoReservorio.flushBackup();
      } catch (_) {}
    });
    setInterval(function () {
      ensureReservorioReady();
    }, 120000);
  }

  global.crozzoShouldUseCloud = shouldUseCloud;
  global.crozzoIsBrowserOnline = isBrowserOnline;
  global.CrozzoReservorioOffline = {
    init: init,
    shouldUseCloud: shouldUseCloud,
    isBrowserOnline: isBrowserOnline,
    hasCloudConfig: hasCloudConfig,
    modeInfo: modeInfo,
    getHealth: getHealth,
    statusBarHtml: statusBarHtml,
    exportBackupFile: exportBackupFile,
    ensureReservorioReady: ensureReservorioReady,
    refreshConnectivity: refreshConnectivity,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : globalThis);

