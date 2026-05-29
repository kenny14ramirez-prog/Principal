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
