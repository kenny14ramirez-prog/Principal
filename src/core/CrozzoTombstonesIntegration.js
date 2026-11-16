/**
 * Crozzo POS — Tombstones Integration (Fase 0)
 * --------------------------------------------
 * Integra tombstones en merge-on-write: anti-resurrección.
 * Estados terminales son absorbentes.
 */
(function (global) {
  'use strict';

  function shouldApplyRemote(remoteState, localState, remoteVersion, localVersion) {
    // Si local está en estado terminal, no aplicar remoto con versión menor
    if (global.CrozzoTombstones && global.CrozzoTombstones.isTerminal(localState)) {
      if (global.CrozzoHlcIntegration) {
        var cmp = global.CrozzoHlcIntegration.compare(remoteVersion, localVersion);
        if (cmp !== null && cmp < 0) return false; // remoto más viejo
      }
      return false; // estado terminal absorbente
    }
    // Si remoto tiene tombstone, aplicar borrado
    if (global.CrozzoTombstones && global.CrozzoTombstones.isDeleted('mesa', remoteState)) {
      return true;
    }
    // LWW con HLC
    if (global.CrozzoHlcIntegration) {
      var c = global.CrozzoHlcIntegration.compare(remoteVersion, localVersion);
      if (c !== null) return c >= 0;
    }
    return true;
  }

  function createTombstoneOnDelete(entityType, entityId, version) {
    if (global.CrozzoTombstones) {
      return global.CrozzoTombstones.create(entityType, entityId, version);
    }
    return null;
  }

  global.CrozzoTombstonesIntegration = {
    shouldApplyRemote: shouldApplyRemote,
    createTombstoneOnDelete: createTombstoneOnDelete
  };
})(typeof window !== 'undefined' ? window : globalThis);
