/**
 * Crozzo POS — Storage Abstraction (Fase -2 / PoC)
 * -----------------------------------------------
 * Interfaz uniforme de persistencia por plataforma.
 * Desktop: delega a SQLite vía Tauri (cuando esté cableado).
 * Web/Android: delega a IndexedDB (Dexie) o localStorage (fallback).
 * El monolito debe llamar a CrozzoStorage, no a localStorage directamente.
 *
 * Estado: PoC. Solo localStorage fallback implementado hoy; SQLite/IndexedDB se cablean en Fase 1.
 */
(function (global) {
  'use strict';

  var BACKEND = 'localstorage'; // 'sqlite' | 'indexeddb' | 'localstorage'

  function _lsKey(table, key) { return 'crozzo_store_' + table + '_' + key; }

  function get(table, key) {
    return new Promise(function (resolve) {
      try {
        var raw = global.localStorage.getItem(_lsKey(table, key));
        resolve(raw ? JSON.parse(raw) : null);
      } catch (_) { resolve(null); }
    });
  }

  function set(table, key, value) {
    return new Promise(function (resolve) {
      try {
        global.safeLocalStorageSet(_lsKey(table, key), JSON.stringify(value));
        resolve(true);
      } catch (_) { resolve(false); }
    });
  }

  function remove(table, key) {
    return new Promise(function (resolve) {
      try {
        global.localStorage.removeItem(_lsKey(table, key));
        resolve(true);
      } catch (_) { resolve(false); }
    });
  }

  function query(table, filter) {
    return new Promise(function (resolve) {
      var out = [];
      try {
        var prefix = 'crozzo_store_' + table + '_';
        for (var i = 0; i < global.localStorage.length; i++) {
          var k = global.localStorage.key(i);
          if (k && k.indexOf(prefix) === 0) {
            try { out.push(JSON.parse(global.localStorage.getItem(k))); } catch (_) {}
          }
        }
        if (typeof filter === 'function') out = out.filter(filter);
      } catch (_) {}
      resolve(out);
    });
  }

  function transaction(fn) {
    return Promise.resolve().then(function () { return fn({ get: get, set: set, remove: remove, query: query }); });
  }

  function backend() { return BACKEND; }

  global.CrozzoStorage = {
    backend: backend,
    get: get,
    set: set,
    remove: remove,
    query: query,
    transaction: transaction
  };
})(typeof window !== 'undefined' ? window : globalThis);
