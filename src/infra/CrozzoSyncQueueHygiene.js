/**
 * Limpieza segura de sync_queue en Supabase.
 * sync_queue = cola de operaciones offline (ventas, sync) ya replicadas al servidor.
 * Solo elimina filas terminadas (synced/failed) más viejas que el tope; nunca pending.
 */
(function (global) {
  'use strict';

  var RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
  var PURGE_INTERVAL_MS = 12 * 60 * 60 * 1000;
  var BATCH_SIZE = 100;
  var MAX_BATCHES = 10;
  var DONE_STATUSES = ['synced', 'done', 'completed', 'failed', 'error'];
  var __purgeTimer = null;

  function cloudCtx() {
    try {
      if (typeof global.crozzoCloudTenantContext === 'function') return global.crozzoCloudTenantContext();
    } catch (_) {}
    return { businessId: '', locationId: '', deviceId: '' };
  }

  function tierAllowsCloud() {
    try {
      if (typeof global.crozzoTierAllowsCloudSync === 'function') return global.crozzoTierAllowsCloudSync();
    } catch (_) {}
    return false;
  }

  function underPressure() {
    try {
      var t = global.CrozzoCloudThrottle;
      if (t && typeof t.snapshot === 'function') {
        var s = t.snapshot();
        return !!(s && s.underPressure);
      }
    } catch (_) {}
    return false;
  }

  function noteErr(e) {
    try {
      if (global.CrozzoCloudThrottle && typeof global.CrozzoCloudThrottle.noteSupabaseError === 'function') {
        global.CrozzoCloudThrottle.noteSupabaseError(e);
      }
    } catch (_) {}
  }

  function readMeta() {
    try {
      return JSON.parse(global.localStorage.getItem('crozzo_sync_queue_purge_meta') || '{}') || {};
    } catch (_) {
      return {};
    }
  }

  function writeMeta(meta) {
    try {
      global.localStorage.setItem('crozzo_sync_queue_purge_meta', JSON.stringify(meta || {}));
    } catch (_) {}
  }

  /** Borra en nube filas sync_queue ya procesadas (synced/failed) más viejas que 7 días. */
  async function purgeCloudSyncQueue(opts) {
    opts = opts || {};
    if (!tierAllowsCloud()) return { purged: 0, skipped: 'tier' };
    if (!opts.force && underPressure()) return { purged: 0, skipped: 'pressure' };
    var now = Date.now();
    if (!opts.force) {
      var meta = readMeta();
      if (meta.lastPurgeAt && now - meta.lastPurgeAt < PURGE_INTERVAL_MS) {
        return { purged: 0, skipped: 'throttle' };
      }
    }
    var sb = global.__SUPABASE;
    if (!sb) return { purged: 0, skipped: 'no_client' };
    var ctx = cloudCtx();
    var cutoff = new Date(now - RETENTION_MS).toISOString();
    var totalPurged = 0;
    var batches = 0;
    var maxBatches = opts.force ? MAX_BATCHES * 2 : MAX_BATCHES;

    try {
      while (batches < maxBatches) {
        if (batches > 0 && underPressure()) break;
        var q = sb
          .from('sync_queue')
          .select('id,uuid,status,created_at,synced_at')
          .in('status', DONE_STATUSES)
          .lt('created_at', cutoff)
          .order('created_at', { ascending: true })
          .limit(BATCH_SIZE);
        if (ctx.businessId && ctx.businessId !== 'default') {
          try {
            q = q.eq('business_id', ctx.businessId);
          } catch (_) {}
        }
        var res = await q;
        if (res.error) {
          noteErr(res.error);
          return { purged: totalPurged, error: res.error.message || String(res.error), batches: batches };
        }
        var rows = res.data || [];
        if (!rows.length) break;
        var ids = rows
          .map(function (r) {
            return r.id || r.uuid;
          })
          .filter(Boolean);
        if (!ids.length) break;
        var del = await sb.from('sync_queue').delete().in('id', ids);
        if (del.error) {
          del = await sb.from('sync_queue').delete().in('uuid', ids);
        }
        if (del.error) {
          noteErr(del.error);
          return { purged: totalPurged, error: del.error.message || String(del.error), batches: batches };
        }
        totalPurged += ids.length;
        batches++;
        if (rows.length < BATCH_SIZE) break;
      }
      writeMeta({ lastPurgeAt: now, lastPurged: totalPurged });
      if (totalPurged > 0) {
        try {
          console.log(
            '[crozzo-sync-queue] purge terminadas >7d: ' + totalPurged + ' filas (' + batches + ' lote(s))'
          );
        } catch (_) {}
      }
      return { purged: totalPurged, batches: batches };
    } catch (e) {
      noteErr(e);
      return { purged: totalPurged, error: String(e && e.message ? e.message : e), batches: batches };
    }
  }

  function scheduleSyncQueuePurge() {
    if (__purgeTimer) return;
    __purgeTimer = global.setInterval(function () {
      if (!tierAllowsCloud()) return;
      purgeCloudSyncQueue().catch(function () {});
    }, PURGE_INTERVAL_MS);
    global.setTimeout(function () {
      if (tierAllowsCloud()) purgeCloudSyncQueue({ catchUp: true }).catch(function () {});
    }, 240000);
  }

  function status() {
    var meta = readMeta();
    return {
      retentionDays: RETENTION_MS / 86400000,
      intervalHours: PURGE_INTERVAL_MS / 3600000,
      lastPurgeAt: meta.lastPurgeAt || 0,
      lastPurged: meta.lastPurged || 0,
      safeStatuses: DONE_STATUSES.slice(),
    };
  }

  global.CrozzoSyncQueueHygiene = {
    purge: purgeCloudSyncQueue,
    schedule: scheduleSyncQueuePurge,
    status: status,
    RETENTION_MS: RETENTION_MS,
  };
  global.crozzoPurgeCloudSyncQueue = purgeCloudSyncQueue;

  if (typeof global.crozzoOnCloudSyncReady === 'function') {
    global.crozzoOnCloudSyncReady(function () {
      scheduleSyncQueuePurge();
    });
  } else {
    global.setTimeout(scheduleSyncQueuePurge, 60000);
  }
})(typeof window !== 'undefined' ? window : globalThis);
