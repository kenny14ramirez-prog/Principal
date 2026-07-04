/**
 * Crozzo — Reservorio operativo (mesas, carritos, comandas en caja/tablet).
 * Mismo contrato que CrozzoReservorio: load → editar → save; borrar solo con acción explícita.
 * Desactiva descartes automáticos por sync/navegación/sesión.
 */
(function (global) {
  'use strict';

  var LS = 'crozzo_pos_runtime_v1';
  var LS_BACKUP = 'crozzo_pos_runtime_backup_v1';
  var LS_BACKUP2 = 'crozzo_pos_runtime_backup_v2';
  var MAX_BYTES = 4500000;

  var health = { recoveredFromBackup: false, lastSaveOk: true, lastSaveError: null };

  function safeParse(raw, fb) {
    if (raw == null || (typeof raw === 'string' && !String(raw).trim())) return fb;
    try {
      var v = JSON.parse(raw);
      return v == null ? fb : v;
    } catch (_) {
      return fb;
    }
  }

  function validateSnap(snap) {
    return !!(snap && typeof snap === 'object' && snap.v === 1);
  }

  function rotateBackup(prevJson) {
    try {
      var b1 = global.localStorage.getItem(LS_BACKUP);
      if (b1) global.localStorage.setItem(LS_BACKUP2, b1);
      if (prevJson) global.localStorage.setItem(LS_BACKUP, prevJson);
    } catch (_) {}
  }

  function loadRaw() {
    var snap = safeParse(global.localStorage.getItem(LS), null);
    if (validateSnap(snap)) return snap;
    var bk = safeParse(global.localStorage.getItem(LS_BACKUP), null);
    if (validateSnap(bk)) {
      health.recoveredFromBackup = true;
      try {
        global.localStorage.setItem(LS, JSON.stringify(bk));
      } catch (_) {}
      return bk;
    }
    var bk2 = safeParse(global.localStorage.getItem(LS_BACKUP2), null);
    if (validateSnap(bk2)) {
      health.recoveredFromBackup = true;
      try {
        global.localStorage.setItem(LS, JSON.stringify(bk2));
      } catch (_) {}
      return bk2;
    }
    return null;
  }

  function persist(snap) {
    if (!snap || typeof snap !== 'object') return { ok: false, error: 'snap_invalid' };
    if (Array.isArray(snap.comandaHistory) && snap.comandaHistory.length > 120) {
      snap.comandaHistory = snap.comandaHistory.slice(0, 120);
    }
    snap.savedAt = Number(snap.savedAt) || Date.now();
    var json = JSON.stringify(snap);
    if (json.length > MAX_BYTES) {
      health.lastSaveOk = false;
      health.lastSaveError = 'too_large';
      try {
        console.warn('[operative-reservorio] snapshot demasiado grande; no se guardó');
      } catch (_) {}
      return { ok: false, error: 'too_large' };
    }
    try {
      var prev = global.localStorage.getItem(LS);
      if (prev && prev !== json) rotateBackup(prev);
      global.localStorage.setItem(LS, json);
      health.lastSaveOk = true;
      health.lastSaveError = null;
      return { ok: true };
    } catch (e) {
      if (
        e &&
        (e.name === 'QuotaExceededError' || e.code === 22) &&
        typeof global.crozzoPruneExpendableStorage === 'function' &&
        global.crozzoPruneExpendableStorage() > 0
      ) {
        try {
          rotateBackup(global.localStorage.getItem(LS));
          global.localStorage.setItem(LS, json);
          health.lastSaveOk = true;
          health.lastSaveError = null;
          return { ok: true, trimmed: true };
        } catch (e2) {
          health.lastSaveOk = false;
          health.lastSaveError = String(e2);
          return { ok: false, error: String(e2) };
        }
      }
      health.lastSaveOk = false;
      health.lastSaveError = String(e);
      return { ok: false, error: String(e) };
    }
  }

  /** No descartar local por antigüedad, freshness ni pull parcial. */
  function allowAutoDiscard(opts) {
    if (opts && opts.userConfirmed) return true;
    return false;
  }

  /** Vaciado en nube solo tras cobro o vaciar explícito del usuario. */
  function allowCloudAuthoritativeEmpty(tipo, ref) {
    tipo = String(tipo || '').trim();
    ref = String(ref || '').trim();
    if (!ref || (tipo !== 'mesa' && tipo !== 'llevar')) return false;
    try {
      var fe = global.__crozzoRuntimeForceEmptySlots;
      if (fe && fe[tipo] && fe[tipo][ref]) return true;
    } catch (_) {}
    try {
      var cs = global.closedSlots;
      if (cs && cs[tipo] && cs[tipo][ref]) return true;
    } catch (_) {}
    try {
      if (typeof global.crozzoSlotLocallyClearedAt === 'function' && global.crozzoSlotLocallyClearedAt(tipo, ref)) {
        return true;
      }
    } catch (_) {}
    return false;
  }

  function cartHasLines(lines) {
    if (!Array.isArray(lines) || !lines.length) return false;
    return lines.some(function (l) {
      if (!l) return false;
      var q = Number(l.cantidad) || 0;
      var s = Number(l.sentCantidad) || 0;
      return q > 0 || s > 0;
    });
  }

  /** ¿Hay pedido activo en este slot? (no resetear al abrir). */
  function slotHasActiveWork(tipo, ref) {
    tipo = String(tipo || '').trim();
    ref = String(ref || '').trim();
    if (!ref || (tipo !== 'mesa' && tipo !== 'llevar')) return false;
    try {
      var map = tipo === 'mesa' ? global.cartsPorMesa : global.cartsPorLlevar;
      if (cartHasLines(map && map[ref])) return true;
    } catch (_) {}
    try {
      var list = global.comandas || [];
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (!c || String(c.estado || '') === 'entregada') continue;
        if (c.tipoServicio === tipo && String(c.referencia || '').trim() === ref) return true;
      }
    } catch (_) {}
    return false;
  }

  function getHealth() {
    return {
      ok: health.lastSaveOk !== false,
      recoveredFromBackup: health.recoveredFromBackup,
      lastSaveError: health.lastSaveError,
      hasBackup: !!global.localStorage.getItem(LS_BACKUP),
      hasBackup2: !!global.localStorage.getItem(LS_BACKUP2),
    };
  }

  global.CrozzoOperativeReservorio = {
    LS: LS,
    loadRaw: loadRaw,
    persist: persist,
    allowAutoDiscard: allowAutoDiscard,
    allowCloudAuthoritativeEmpty: allowCloudAuthoritativeEmpty,
    slotHasActiveWork: slotHasActiveWork,
    getHealth: getHealth,
  };
})(typeof window !== 'undefined' ? window : globalThis);
