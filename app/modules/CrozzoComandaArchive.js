/**
 * Archivo comprimido de comandas entregadas + retención operativa 12 h.
 * Caliente: comandas activas. Tibio: comandaHistory (hoy). Frío: gzip mensual en IndexedDB.
 */
(function (global) {
  'use strict';

  var DB_NAME = 'crozzo_comanda_archive_v1';
  var DB_VER = 1;
  var STORE = 'months';
  var PENDING_KEY = 'crozzo_comanda_archive_pending';
  var META_KEY = 'crozzo_comanda_archive_meta';
  var RETENTION_MS = 12 * 60 * 60 * 1000;
  var PENDING_FLUSH_MIN = 40;
  var dbPromise = null;

  function lsGet(k) {
    try {
      return global.localStorage.getItem(k);
    } catch (_) {
      return null;
    }
  }

  function lsSet(k, v) {
    try {
      global.localStorage.setItem(k, v);
      return true;
    } catch (_) {
      return false;
    }
  }

  function monthKey(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function readMeta() {
    try {
      var raw = lsGet(META_KEY);
      return raw ? JSON.parse(raw) : { lastMaintenanceAt: 0, lastCloudPurgeAt: 0 };
    } catch (_) {
      return { lastMaintenanceAt: 0, lastCloudPurgeAt: 0 };
    }
  }

  function writeMeta(meta) {
    lsSet(META_KEY, JSON.stringify(meta || {}));
  }

  function noteCloudPurgeAt() {
    var meta = readMeta();
    meta.lastCloudPurgeAt = Date.now();
    writeMeta(meta);
  }

  function readPending() {
    try {
      var raw = lsGet(PENDING_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (_) {
      return [];
    }
  }

  function writePending(arr) {
    lsSet(PENDING_KEY, JSON.stringify(arr || []));
  }

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
          var os = db.createObjectStore(STORE, { keyPath: 'monthKey' });
          os.createIndex('sealedAt', 'sealedAt', { unique: false });
        }
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
    });
    return dbPromise;
  }

  function idbGet(monthKeyVal) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var req = tx.objectStore(STORE).get(monthKeyVal);
        req.onsuccess = function () {
          resolve(req.result || null);
        };
        req.onerror = function () {
          reject(req.error);
        };
      });
    });
  }

  function idbPut(record) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.oncomplete = function () {
          resolve(true);
        };
        tx.onerror = function () {
          reject(tx.error);
        };
        tx.objectStore(STORE).put(record);
      });
    });
  }

  function slimComanda(c, reason) {
    if (!c || typeof c !== 'object') return null;
    var items = [];
    (c.items || []).forEach(function (it) {
      if (!it) return;
      items.push({
        id: it.id,
        nombre: String(it.nombre || it.nombreVenta || '').slice(0, 80),
        cantidad: Number(it.cantidad) || 0,
        notas: String(it.notas || '').slice(0, 120),
      });
    });
    return {
      id: c.id,
      transaction_id: c.transaction_id,
      tipoServicio: c.tipoServicio,
      referencia: c.referencia,
      areaId: c.areaId,
      areaNombre: c.areaNombre,
      estado: c.estado || 'entregada',
      createdAt: c.createdAt,
      despachadaAt: c.despachadaAt,
      entregadaAt: c.entregadaAt,
      items: items,
      reason: reason || '',
      archivedAt: new Date().toISOString(),
    };
  }

  function dedupeMerge(list) {
    var map = {};
    (list || []).forEach(function (row) {
      if (!row) return;
      var k = String(row.transaction_id || row.id || '');
      if (!k) return;
      map[k] = row;
    });
    return Object.keys(map).map(function (k) {
      return map[k];
    });
  }

  async function compressRows(rows) {
    var json = JSON.stringify(rows || []);
    if (typeof CompressionStream === 'undefined') {
      return { enc: 'plain', data: json, count: rows.length, rawBytes: json.length };
    }
    var blob = new Blob([json], { type: 'application/json' });
    var ab = await new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
    return { enc: 'gzip', data: ab, count: rows.length, rawBytes: json.length };
  }

  async function decompressRecord(rec) {
    if (!rec) return [];
    if (rec.enc === 'plain') {
      var plain = typeof rec.data === 'string' ? rec.data : new TextDecoder().decode(rec.data);
      return JSON.parse(plain || '[]');
    }
    if (typeof DecompressionStream === 'undefined') return [];
    var buf = rec.data instanceof ArrayBuffer ? rec.data : rec.data;
    var blob = new Blob([buf]);
    var text = await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text();
    return JSON.parse(text || '[]');
  }

  function ingest(comanda, reason) {
    var slim = slimComanda(comanda, reason);
    if (!slim) return false;
    var pending = readPending();
    var key = String(slim.transaction_id || slim.id || '');
    pending = pending.filter(function (p) {
      return String(p.transaction_id || p.id || '') !== key;
    });
    pending.unshift(slim);
    if (pending.length > 800) pending = pending.slice(0, 800);
    writePending(pending);
    return true;
  }

  async function sealMonth(monthKeyVal, rows) {
    rows = dedupeMerge(rows);
    if (!rows.length) return null;
    var existing = await idbGet(monthKeyVal);
    if (existing) {
      try {
        var prev = await decompressRecord(existing);
        rows = dedupeMerge(prev.concat(rows));
      } catch (_) {}
    }
    var packed = await compressRows(rows);
    var rec = {
      monthKey: monthKeyVal,
      enc: packed.enc,
      data: packed.data,
      count: packed.count,
      rawBytes: packed.rawBytes,
      sealedAt: new Date().toISOString(),
    };
    await idbPut(rec);
    return rec;
  }

  async function flushPendingToArchives(force) {
    var pending = readPending();
    if (!pending.length) return { flushed: 0 };
    if (!force && pending.length < PENDING_FLUSH_MIN) return { flushed: 0, pending: pending.length };

    var buckets = {};
    pending.forEach(function (row) {
      var mk = monthKey(new Date(row.despachadaAt || row.createdAt || row.archivedAt || Date.now()));
      if (!buckets[mk]) buckets[mk] = [];
      buckets[mk].push(row);
    });

    var flushed = 0;
    var keys = Object.keys(buckets);
    for (var i = 0; i < keys.length; i++) {
      var mk = keys[i];
      await sealMonth(mk, buckets[mk]);
      flushed += buckets[mk].length;
    }
    writePending([]);
    return { flushed: flushed };
  }

  function trimLocalComandaHistory() {
    if (!global.comandaHistory || !Array.isArray(global.comandaHistory)) return 0;
    var cutoff = Date.now() - RETENTION_MS;
    var kept = [];
    var archived = 0;
    global.comandaHistory.forEach(function (c) {
      if (!c) return;
      var t = Date.parse(c.despachadaAt || c.entregadaAt || c.createdAt || 0) || 0;
      if (t && t < cutoff) {
        ingest(c, 'local_history_12h');
        archived++;
        return;
      }
      kept.push(c);
    });
    if (archived) {
      global.comandaHistory = kept;
      try {
        if (typeof global.schedulePosRuntimeSave === 'function') global.schedulePosRuntimeSave();
      } catch (_) {}
    }
    return archived;
  }

  /** Comandas entregadas locales fuera del tope 12 h (p. ej. días atrás tras apagón). */
  function purgeStaleLocalComandas() {
    if (!global.comandas || !Array.isArray(global.comandas)) return 0;
    var cutoff = Date.now() - RETENTION_MS;
    var n = 0;
    for (var i = global.comandas.length - 1; i >= 0; i--) {
      var c = global.comandas[i];
      if (!c || String(c.estado || '') !== 'entregada') continue;
      var t = Date.parse(c.despachadaAt || c.entregadaAt || c.lastUpdateAt || c.createdAt || 0) || 0;
      if (!t || t >= cutoff) continue;
      ingest(c, 'local_entregada_stale');
      global.comandas.splice(i, 1);
      n++;
    }
    if (n) {
      try {
        if (typeof global.schedulePosRuntimeSave === 'function') global.schedulePosRuntimeSave();
      } catch (_) {}
    }
    return n;
  }

  async function runMaintenance(opts) {
    opts = opts || {};
    var meta = readMeta();
    var now = Date.now();
    if (!opts.force && meta.lastMaintenanceAt && now - meta.lastMaintenanceAt < 20 * 60 * 1000) {
      return { skipped: true };
    }
    var histTrim = trimLocalComandaHistory();
    var localPurge = purgeStaleLocalComandas();
    var flush = await flushPendingToArchives(!!opts.forceFlush);
    meta.lastMaintenanceAt = now;
    writeMeta(meta);
    return { histTrim: histTrim, localPurge: localPurge, flush: flush };
  }

  async function listMonths() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var req = tx.objectStore(STORE).getAll();
        req.onsuccess = function () {
          var rows = (req.result || []).sort(function (a, b) {
            return String(b.monthKey).localeCompare(String(a.monthKey));
          });
          resolve(
            rows.map(function (r) {
              return {
                monthKey: r.monthKey,
                count: r.count || 0,
                enc: r.enc,
                rawBytes: r.rawBytes || 0,
                sealedAt: r.sealedAt,
              };
            })
          );
        };
        req.onerror = function () {
          reject(req.error);
        };
      });
    });
  }

  async function loadMonth(monthKeyVal) {
    var rec = await idbGet(monthKeyVal);
    if (!rec) return [];
    return decompressRecord(rec);
  }

  function status() {
    return {
      retentionHours: RETENTION_MS / 3600000,
      pending: readPending().length,
      meta: readMeta(),
      gzip: typeof CompressionStream !== 'undefined',
    };
  }

  function crozzoArchiveComandaToHistory(comanda, reason) {
    return ingest(comanda, reason || 'archive');
  }

  async function openViewer(monthKeyVal) {
    monthKeyVal = monthKeyVal || monthKey();
    var rows = await loadMonth(monthKeyVal);
    if (!rows.length) {
      var pending = readPending();
      rows = pending.filter(function (r) {
        return monthKey(new Date(r.despachadaAt || r.createdAt || Date.now())) === monthKeyVal;
      });
    }
    rows.sort(function (a, b) {
      return new Date(b.despachadaAt || b.createdAt) - new Date(a.despachadaAt || a.createdAt);
    });
    var esc =
      typeof global.escHtml === 'function'
        ? global.escHtml
        : function (s) {
            return String(s || '')
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;');
          };
    var body =
      rows.length === 0
        ? '<p class="form-hint">Sin comandas archivadas para <strong>' +
          esc(monthKeyVal) +
          '</strong>. Las entregadas se archivan tras 12 h.</p>'
        : '<p class="form-hint">' +
          rows.length +
          ' comandas (descomprimidas al vuelo). Solo lectura.</p>' +
          '<div class="table-wrap" style="max-height:55vh;overflow:auto;"><table class="data-table"><thead><tr><th>Hora</th><th>Slot</th><th>Área</th><th>Ítems</th></tr></thead><tbody>' +
          rows
            .slice(0, 500)
            .map(function (r) {
              var when = new Date(r.despachadaAt || r.createdAt);
              var slot = String(r.tipoServicio || '') + ' ' + String(r.referencia || '');
              var nItems = (r.items || []).reduce(function (n, it) {
                return n + (Number(it.cantidad) || 0);
              }, 0);
              return (
                '<tr><td>' +
                esc(when.toLocaleString('es-CO')) +
                '</td><td>' +
                esc(slot) +
                '</td><td>' +
                esc(r.areaNombre || r.areaId || '') +
                '</td><td>' +
                esc(String(nItems)) +
                '</td></tr>'
              );
            })
            .join('') +
          '</tbody></table></div>';
    if (typeof global.showModal === 'function') {
      global.showModal('Archivo comandas · ' + monthKeyVal, body, { wide: true, showClose: true });
    }
    return rows;
  }

  global.CrozzoComandaArchive = {
    RETENTION_MS: RETENTION_MS,
    ingest: ingest,
    runMaintenance: runMaintenance,
    flushPendingToArchives: flushPendingToArchives,
    listMonths: listMonths,
    loadMonth: loadMonth,
    status: status,
    monthKey: monthKey,
    openViewer: openViewer,
    noteCloudPurgeAt: noteCloudPurgeAt,
  };
  global.crozzoArchiveComandaToHistory = crozzoArchiveComandaToHistory;
  global.crozzoOpenComandaArchiveViewer = openViewer;
  global.crozzoRunComandaArchiveMaintenance = runMaintenance;

  try {
    global.addEventListener('load', function () {
      global.setTimeout(function () {
        runMaintenance().catch(function () {});
      }, 15000);
    });
  } catch (_) {}
})(typeof window !== 'undefined' ? window : globalThis);
