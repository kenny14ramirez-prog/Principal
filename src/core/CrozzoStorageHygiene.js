/**
 * Higiene de almacenamiento local — migraciones ligeras al arranque.
 */
(function (global) {
  'use strict';

  var QUEUE_KEY = 'crozzo_sync_queue';
  var LEGACY_QUEUE = 'sync_queue_temp';
  var RUNTIME_KEY = 'crozzo_pos_runtime_v1';
  var RUNTIME_HISTORY_CAP = 120;

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

  function lsRemove(k) {
    try {
      global.localStorage.removeItem(k);
    } catch (_) {}
  }

  /** Une sync_queue_temp → crozzo_sync_queue (deduplicado por transaction_id). */
  function migrateOfflineQueues() {
    try {
      var legacyRaw = lsGet(LEGACY_QUEUE);
      if (!legacyRaw) return;
      var legacy = JSON.parse(legacyRaw);
      if (!Array.isArray(legacy) || !legacy.length) {
        lsRemove(LEGACY_QUEUE);
        return;
      }
      var main = [];
      try {
        main = JSON.parse(lsGet(QUEUE_KEY) || '[]');
        if (!Array.isArray(main)) main = [];
      } catch (_) {
        main = [];
      }
      var seen = {};
      main.forEach(function (r) {
        var tid =
          r &&
          (r.transaction_id ||
            r.sync_transaction_id ||
            r._emergency_tid ||
            (r.payload && r.payload.transaction_id));
        if (tid) seen[String(tid)] = true;
      });
      legacy.forEach(function (r) {
        var tid =
          r &&
          (r.transaction_id ||
            r.sync_transaction_id ||
            r._emergency_tid ||
            (r.payload && r.payload.transaction_id));
        if (tid && seen[String(tid)]) return;
        if (tid) seen[String(tid)] = true;
        main.push(r);
      });
      lsSet(QUEUE_KEY, JSON.stringify(main));
      lsRemove(LEGACY_QUEUE);
    } catch (e) {
      console.warn('[crozzo-storage] migrateOfflineQueues', e);
    }
  }

  /** Recorta historial de comandas en runtime para parse/guardado más rápido. */
  function trimPosRuntimeSnapshot() {
    try {
      var raw = lsGet(RUNTIME_KEY);
      if (!raw || raw.length < 180000) return;
      var s = JSON.parse(raw);
      if (!s || !Array.isArray(s.comandaHistory) || s.comandaHistory.length <= RUNTIME_HISTORY_CAP) return;
      s.comandaHistory = s.comandaHistory.slice(0, RUNTIME_HISTORY_CAP);
      lsSet(RUNTIME_KEY, JSON.stringify(s));
    } catch (e) {
      console.warn('[crozzo-storage] trimPosRuntimeSnapshot', e);
    }
  }

  function migrateReservorioBlobs() {
    try {
      var R = global.CrozzoReservorio;
      var B = global.CrozzoBlobStore;
      if (!R || !B || !R.load || !B.migrateReservorioAdjuntos) return;
      var st = R.load();
      B.migrateReservorioAdjuntos(st).then(function (r) {
        if (r && r.migrated && R.save) R.save(st);
      });
    } catch (e) {
      console.warn('[crozzo-storage] migrateReservorioBlobs', e);
    }
  }

  function runHygiene() {
    migrateOfflineQueues();
    trimPosRuntimeSnapshot();
    if (global.CrozzoBlobStore) migrateReservorioBlobs();
  }

  global.CrozzoStorageHygiene = {
    migrateOfflineQueues: migrateOfflineQueues,
    trimPosRuntimeSnapshot: trimPosRuntimeSnapshot,
    run: runHygiene,
    RUNTIME_HISTORY_CAP: RUNTIME_HISTORY_CAP,
  };

  runHygiene();
})(typeof window !== 'undefined' ? window : globalThis);
