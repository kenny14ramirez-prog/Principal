/**
 * Crozzo POS — Tombstones PoC (Fase 0)
 * ------------------------------------
 * Tombstones para borrados: toda mutación destructiva crea un registro
 * deleted_at + deleted_version (HLC). El merge respeta tombstones.
 * Estados terminales (pagado/cerrado/anulado) son absorbentes.
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'crozzo_tombstones_v1';
  var TTL_DAYS = 30;

  function load() {
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return {};
  }

  function save(data) {
    try { global.localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (_) {}
  }

  function createTombstone(entityType, entityId, hlc) {
    var data = load();
    if (!data[entityType]) data[entityType] = {};
    data[entityType][entityId] = {
      deletedAt: new Date().toISOString(),
      deletedVersion: hlc || (global.CrozzoHlc ? new global.CrozzoHlc.Hlc('node').now() : { ms: Date.now(), counter: 0, node: '' }),
      ttlDays: TTL_DAYS
    };
    save(data);
    return data[entityType][entityId];
  }

  function isDeleted(entityType, entityId) {
    var data = load();
    if (!data[entityType] || !data[entityType][entityId]) return false;
    var ts = data[entityType][entityId];
    // Verificar TTL
    var deletedAt = new Date(ts.deletedAt);
    var now = new Date();
    var daysSince = (now - deletedAt) / (1000 * 60 * 60 * 24);
    if (daysSince > (ts.ttlDays || TTL_DAYS)) {
      // TTL expirado, limpiar
      delete data[entityType][entityId];
      save(data);
      return false;
    }
    return true;
  }

  function getTombstone(entityType, entityId) {
    var data = load();
    if (!data[entityType] || !data[entityType][entityId]) return null;
    return data[entityType][entityId];
  }

  function compact() {
    var data = load();
    var now = new Date();
    var removed = 0;
    for (var type in data) {
      if (!data.hasOwnProperty(type)) continue;
      for (var id in data[type]) {
        if (!data[type].hasOwnProperty(id)) continue;
        var ts = data[type][id];
        var deletedAt = new Date(ts.deletedAt);
        var daysSince = (now - deletedAt) / (1000 * 60 * 60 * 24);
        if (daysSince > (ts.ttlDays || TTL_DAYS)) {
          delete data[type][id];
          removed++;
        }
      }
    }
    save(data);
    return removed;
  }

  // Estados terminales absorbentes
  var TERMINAL_STATES = ['pagado', 'cerrado', 'anulado', 'entregado'];
  function isTerminal(state) {
    return TERMINAL_STATES.indexOf(String(state || '').toLowerCase()) !== -1;
  }

  global.CrozzoTombstones = {
    create: createTombstone,
    isDeleted: isDeleted,
    get: getTombstone,
    compact: compact,
    isTerminal: isTerminal,
    TERMINAL_STATES: TERMINAL_STATES
  };
})(typeof window !== 'undefined' ? window : globalThis);
