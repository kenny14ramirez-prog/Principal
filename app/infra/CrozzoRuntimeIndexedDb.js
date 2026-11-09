/**
 * Wrapper IndexedDB para el runtime de mesas/carritos (snapshot operativo POS).
 * API: open, get, set, delete, getAll. Usa solo IndexedDB, con fallback a memoria.
 * Migración one-time desde localStorage al arranque (sin fallback en operación).
 */
(function (global) {
  'use strict';

  var DB_NAME = 'CrozzoRuntimeIndexedDb';
  var DB_VERSION = 1;
  var STORE_NAME = 'runtime_kv';

  var db = null;
  var opening = null;
  var memory = new Map();
  var migrated = false;

  var MIGRATION_KEYS = [
    'crozzo_pos_runtime_v1',
    'crozzo_device_id',
    'crozzo_wifi_zone_last_ip',
    'crozzo_debug_sync',
  ];

  function hasIndexedDb() {
    try {
      return typeof global.indexedDB !== 'undefined' && !!global.indexedDB;
    } catch (_) {
      return false;
    }
  }

  function dbGet(d, key) {
    return new Promise(function (resolve) {
      try {
        var tx = d.transaction(STORE_NAME, 'readonly');
        var st = tx.objectStore(STORE_NAME);
        var r = st.get(key);
        r.onsuccess = function () {
          var rec = r.result;
          resolve(rec && Object.prototype.hasOwnProperty.call(rec, 'value') ? rec.value : null);
        };
        r.onerror = function () {
          resolve(null);
        };
      } catch (_) {
        resolve(null);
      }
    });
  }

  function dbSet(d, key, value) {
    return new Promise(function (resolve) {
      try {
        var tx = d.transaction(STORE_NAME, 'readwrite');
        var st = tx.objectStore(STORE_NAME);
        var r = st.put({ key: key, value: value, updatedAt: Date.now() });
        r.onsuccess = function () {
          resolve(true);
        };
        r.onerror = function () {
          resolve(false);
        };
      } catch (_) {
        resolve(false);
      }
    });
  }

  function dbDelete(d, key) {
    return new Promise(function (resolve) {
      try {
        var tx = d.transaction(STORE_NAME, 'readwrite');
        var st = tx.objectStore(STORE_NAME);
        var r = st.delete(key);
        r.onsuccess = function () {
          resolve(true);
        };
        r.onerror = function () {
          resolve(false);
        };
      } catch (_) {
        resolve(false);
      }
    });
  }

  async function migrateFromLocalStorage(d) {
    if (migrated) return;
    migrated = true;
    if (!d) return;
    var flagKey = '__crozzo_runtime_idb_migrated_v1';
    try {
      var flag = await dbGet(d, flagKey);
      if (flag) return;
    } catch (_) {}
    for (var i = 0; i < MIGRATION_KEYS.length; i++) {
      var key = MIGRATION_KEYS[i];
      try {
        var raw = null;
        try {
          raw = global.localStorage.getItem(String(key));
        } catch (_) {
          raw = null;
        }
        if (raw == null) continue;
        var val;
        try {
          val = JSON.parse(raw);
        } catch (_) {
          val = raw;
        }
        var existing = await dbGet(d, key);
        if (existing == null) {
          await dbSet(d, key, val);
          memory.set(key, val);
        }
      } catch (_) {}
    }
    try {
      await dbSet(d, flagKey, true);
    } catch (_) {}
  }

  function open() {
    if (db) return Promise.resolve(db);
    if (opening) return opening;
    if (!hasIndexedDb()) {
      return Promise.resolve(null);
    }
    opening = new Promise(function (resolve) {
      var req;
      try {
        req = global.indexedDB.open(DB_NAME, DB_VERSION);
      } catch (_) {
        opening = null;
        resolve(null);
        return;
      }
      req.onupgradeneeded = function () {
        try {
          var d = req.result;
          if (!d.objectStoreNames.contains(STORE_NAME)) {
            d.createObjectStore(STORE_NAME, { keyPath: 'key' });
          }
        } catch (_) {}
      };
      req.onsuccess = function () {
        db = req.result;
        opening = null;
        migrateFromLocalStorage(db)
          .then(function () {
            resolve(db);
          })
          .catch(function () {
            resolve(db);
          });
      };
      req.onerror = function () {
        opening = null;
        resolve(null);
      };
      req.onblocked = function () {
        /* no-op */
      };
    });
    return opening;
  }

  async function get(key) {
    var d = await open();
    if (!d) {
      if (memory.has(key)) return memory.get(key);
      return null;
    }
    var v = await dbGet(d, key);
    if (v != null) memory.set(key, v);
    return v;
  }

  async function set(key, value) {
    var d = await open();
    if (!d) {
      memory.set(key, value);
      return true;
    }
    var ok = await dbSet(d, key, value);
    if (ok) {
      memory.set(key, value);
      return true;
    }
    memory.set(key, value);
    return false;
  }

  async function remove(key) {
    var d = await open();
    if (!d) {
      memory.delete(key);
      return true;
    }
    var ok = await dbDelete(d, key);
    memory.delete(key);
    return ok;
  }

  async function getAll() {
    var d = await open();
    if (!d) {
      var out = [];
      memory.forEach(function (v, k) {
        out.push({ key: k, value: v, updatedAt: 0 });
      });
      return out;
    }
    return new Promise(function (resolve) {
      try {
        var tx = d.transaction(STORE_NAME, 'readonly');
        var st = tx.objectStore(STORE_NAME);
        var r = st.getAll();
        r.onsuccess = function () {
          resolve(Array.isArray(r.result) ? r.result : []);
        };
        r.onerror = function () {
          resolve([]);
        };
      } catch (_) {
        resolve([]);
      }
    });
  }

  var api = {
    open: open,
    get: get,
    set: set,
    delete: remove,
    getAll: getAll,
  };

  global.CrozzoRuntimeIndexedDb = api;
  global.crozzoRuntimeIndexedDb = api;
})(typeof window !== 'undefined' ? window : globalThis);