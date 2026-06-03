/**
 * Crozzo POS — Entorno de emulación autónoma (Paso 1).
 * Aísla IndexedDB/localStorage, activa mock de impresión vía Tauri y SQLite test.db.
 */
(function (global) {
  'use strict';

  var LS_FLAG = 'crozzo_emulation_mode';
  var LS_PREFIX = 'emu:';
  var IDB_MAP = {
    CrozzoLocalData: 'CrozzoLocalData_EMU',
    CrozzoSyncDB: 'CrozzoSyncDB_EMU',
    CrozzoMultiSyncDB: 'CrozzoMultiSyncDB_EMU',
    crozzo_blob_store_v1: 'crozzo_blob_store_v1_EMU',
  };

  var _active = false;
  var _idbPatched = false;
  var _lsPatched = false;

  function detectAutoEnable() {
    try {
      if (global.localStorage && global.localStorage.getItem(LS_FLAG) === '1') return true;
    } catch (_) {}
    try {
      if (typeof location !== 'undefined' && location.search) {
        var q = new URLSearchParams(location.search);
        if (q.get('crozzo_emulation') === '1' || q.get('crozzo_test') === '1') return true;
      }
    } catch (_) {}
    return !!global.__CROZZO_EMULATION;
  }

  function isActive() {
    return _active;
  }

  function tauriInvoke(cmd, args) {
    var inv =
      global.__TAURI__ && global.__TAURI__.core && typeof global.__TAURI__.core.invoke === 'function'
        ? global.__TAURI__.core.invoke.bind(global.__TAURI__.core)
        : null;
    if (!inv) return Promise.reject(new Error('Tauri invoke no disponible'));
    return inv(cmd, args || {});
  }

  function installIdbIsolation() {
    if (_idbPatched || !global.indexedDB) return;
    _idbPatched = true;
    var origOpen = global.indexedDB.open.bind(global.indexedDB);
    global.indexedDB.open = function (name, version) {
      var n = String(name || '');
      var mapped = IDB_MAP[n] || (n.indexOf('_EMU') >= 0 ? n : n + '_EMU');
      return origOpen(mapped, version);
    };
  }

  function installLocalStorageIsolation() {
    if (_lsPatched || !global.localStorage) return;
    _lsPatched = true;
    var proto = global.Storage.prototype;
    var origGet = proto.getItem;
    var origSet = proto.setItem;
    var origRemove = proto.removeItem;
    var origKey = proto.key;
    var origClear = proto.clear;

    function mapKey(key) {
      var k = String(key || '');
      if (!_active) return k;
      if (k === LS_FLAG || k.indexOf(LS_PREFIX) === 0) return k;
      return LS_PREFIX + k;
    }

    proto.getItem = function (key) {
      return origGet.call(this, mapKey(key));
    };
    proto.setItem = function (key, value) {
      return origSet.call(this, mapKey(key), value);
    };
    proto.removeItem = function (key) {
      return origRemove.call(this, mapKey(key));
    };
    proto.key = function (index) {
      var k = origKey.call(this, index);
      if (!_active || !k || k.indexOf(LS_PREFIX) !== 0) return k;
      return k.slice(LS_PREFIX.length);
    };
    proto.clear = function () {
      if (!_active) return origClear.call(this);
      var toRemove = [];
      for (var i = 0; i < this.length; i++) {
        var k = origKey.call(this, i);
        if (k && k.indexOf(LS_PREFIX) === 0) toRemove.push(k);
      }
      toRemove.forEach(function (k) {
        origRemove.call(this, k);
      }, this);
    };
  }

  function markDom() {
    try {
      if (document.documentElement) document.documentElement.setAttribute('data-crozzo-emulation', '1');
      if (document.body) document.body.classList.add('crozzo-emulation-active');
    } catch (_) {}
  }

  function enable(opts) {
    opts = opts || {};
    if (_active && !opts.force) return Promise.resolve(getStatusSync());
    _active = true;
    global.__CROZZO_EMULATION_ACTIVE = true;
    global.__CROZZO_EMULATION = true;
    try {
      global.localStorage.setItem(LS_FLAG, '1');
    } catch (_) {}
    installIdbIsolation();
    installLocalStorageIsolation();
    markDom();
    global.__CROZZO_SYSTEM_PRINTERS = ['MOCK_80mm (emulación)'];
    global.__CROZZO_DEFAULT_PRINTER = 'MOCK_80mm (emulación)';
    return tauriInvoke('crozzo_emulation_set_active', { active: true })
      .then(function (st) {
        global.__CROZZO_EMULATION_STATUS = st;
        console.info('[crozzo-emulation] Activo', st);
        return st;
      })
      .catch(function (err) {
        console.warn('[crozzo-emulation] Tauri no activó Rust (navegador QA):', err);
        return getStatusSync();
      });
  }

  function disable() {
    _active = false;
    global.__CROZZO_EMULATION_ACTIVE = false;
    try {
      global.localStorage.removeItem(LS_FLAG);
    } catch (_) {}
    return tauriInvoke('crozzo_emulation_set_active', { active: false }).catch(function () {});
  }

  function getStatusSync() {
    return {
      active: _active,
      idbIsolated: _idbPatched,
      lsPrefix: LS_PREFIX,
      mockPrinter: 'MOCK_80mm (emulación)',
    };
  }

  function status() {
    return tauriInvoke('crozzo_emulation_status', {}).catch(function () {
      return getStatusSync();
    });
  }

  function resetDb() {
    return tauriInvoke('crozzo_emulation_reset_db', {});
  }

  function resetBrowserStorage() {
    return new Promise(function (resolve, reject) {
      if (!global.indexedDB) {
        resolve(false);
        return;
      }
      var names = Object.keys(IDB_MAP).map(function (k) {
        return IDB_MAP[k];
      });
      var pending = names.length;
      if (!pending) {
        resolve(true);
        return;
      }
      names.forEach(function (dbName) {
        var req = global.indexedDB.deleteDatabase(dbName);
        req.onsuccess = req.onerror = req.onblocked = function () {
          pending--;
          if (pending <= 0) resolve(true);
        };
      });
    });
  }

  function resetAll() {
    return resetBrowserStorage().then(function () {
      try {
        var keys = [];
        for (var i = 0; i < global.localStorage.length; i++) {
          var k = global.localStorage.key(i);
          if (k && k.indexOf(LS_PREFIX) === 0) keys.push(k);
        }
        keys.forEach(function (k) {
          global.localStorage.removeItem(k);
        });
      } catch (_) {}
      return resetDb().catch(function () {
        return { browserOnly: true };
      });
    });
  }

  function logAction(action, payload) {
    var payloadJson = '{}';
    try {
      payloadJson = JSON.stringify(payload || {});
    } catch (_) {}
    return tauriInvoke('crozzo_emulation_log_action', {
      action: String(action || 'unknown'),
      payloadJson: payloadJson,
    }).catch(function () {});
  }

  function querySql(selectQuery) {
    return tauriInvoke('crozzo_emulation_query_sql', { query: String(selectQuery || '') });
  }

  if (detectAutoEnable()) {
    enable({ force: true });
  }

  global.CrozzoEmulationHarness = {
    enable: enable,
    disable: disable,
    isActive: isActive,
    status: status,
    resetDb: resetDb,
    resetBrowserStorage: resetBrowserStorage,
    resetAll: resetAll,
    logAction: logAction,
    querySql: querySql,
    LS_FLAG: LS_FLAG,
  };
})(typeof window !== 'undefined' ? window : globalThis);
