/**
 * Sincroniza comandas entre dispositivos vía Supabase (tabla public.comandas).
 * El que comanda sube; el que tiene impresora descarga e imprime.
 */
(function (global) {
  'use strict';

  var __started = false;
  var __pullTimer = null;
  var __pushEcho = {};
  var __printedTids = {};

  function online() {
    return (
      typeof global.crozzoOnlineConfigReady === 'function' &&
      global.crozzoOnlineConfigReady() &&
      !!global.__SUPABASE
    );
  }

  function cloudCtx() {
    var md = typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
    var deviceId = '';
    try {
      deviceId = String(localStorage.getItem('device_id') || md.deviceId || '').trim();
    } catch (_) {
      deviceId = String(md.deviceId || '').trim();
    }
    return {
      businessId: String(md.businessId || 'default').trim() || 'default',
      locationId: String(md.locationId || 'default').trim() || 'default',
      deviceUuid:
        typeof global.crozzoCloudDeviceUuidForRest === 'function' ? global.crozzoCloudDeviceUuidForRest() : '',
      deviceId: deviceId,
    };
  }

  function findComanda(id) {
    if (typeof global.__crozzoEmergencyFindComandaById === 'function') {
      return global.__crozzoEmergencyFindComandaById(id);
    }
    return null;
  }

  function isUuid(s) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(s || ''));
  }

  function rowIdForComanda(c) {
    var tid = String(c.transaction_id || '').trim();
    if (isUuid(tid)) return tid;
    if (c._cloudRowId && isUuid(c._cloudRowId)) return c._cloudRowId;
    var id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (ch) {
            var r = (Math.random() * 16) | 0;
            var v = ch === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
          });
    c._cloudRowId = id;
    return id;
  }

  function markPushEcho(c, rowId) {
    var now = Date.now();
    __pushEcho[rowId] = now;
    if (c.transaction_id) __pushEcho[String(c.transaction_id)] = now;
  }

  function isRecentEcho(key) {
    var t = __pushEcho[key];
    return t && Date.now() - t < 12000;
  }

  function deviceReceivesComandaArea(areaId) {
    if (typeof global.crozzoDeviceShowsComandaArea === 'function') {
      return global.crozzoDeviceShowsComandaArea(areaId);
    }
    return true;
  }

  function deviceCanPrintComandaArea(areaId) {
    if (typeof global.crozzoHasPrinterForComandaArea === 'function') {
      return global.crozzoHasPrinterForComandaArea(areaId);
    }
    return false;
  }

  async function pushComanda(comanda) {
    if (!online() || !comanda) return false;
    var sb = global.__SUPABASE;
    var ctx = cloudCtx();
    var rowId = rowIdForComanda(comanda);
    var payload = JSON.parse(JSON.stringify(comanda));
    payload._cloudOriginDevice = ctx.deviceId;
    payload._cloudDeviceUuid = ctx.deviceUuid;
    payload._cloudSyncedAt = new Date().toISOString();
    var body = {
      id: rowId,
      device_id: ctx.deviceUuid || null,
      location_id: ctx.locationId,
      business_id: ctx.businessId,
      status: String(comanda.estado || 'pendiente'),
      payload: payload,
      updated_at: new Date().toISOString(),
    };
    markPushEcho(comanda, rowId);
    try {
      var res = await sb.from('comandas').upsert(body, { onConflict: 'id' });
      if (res.error) {
        console.warn('[crozzo-comanda-cloud] push', res.error.message || res.error);
        return false;
      }
      return true;
    } catch (e) {
      console.warn('[crozzo-comanda-cloud] push', e);
      return false;
    }
  }

  function pushComandasByIds(ids) {
    if (!Array.isArray(ids) || !ids.length) return;
    ids.forEach(function (id) {
      var c = findComanda(id);
      if (c) {
        pushComanda(c).catch(function (e) {
          console.warn('[crozzo-comanda-cloud]', e);
        });
      }
    });
  }

  function rowMatchesTenant(row) {
    var ctx = cloudCtx();
    if (row.business_id && ctx.businessId && row.business_id !== ctx.businessId) return false;
    if (
      row.location_id &&
      ctx.locationId &&
      row.location_id !== 'default' &&
      ctx.locationId !== 'default' &&
      row.location_id !== ctx.locationId
    ) {
      return false;
    }
    return true;
  }

  function applyComandaFromCloudRow(row, opts) {
    opts = opts || {};
    if (!row || !row.payload || row.payload.id == null) return false;
    if (!rowMatchesTenant(row)) return false;
    if (String(row.status || '') === 'entregada') return false;

    var pay = row.payload;
    if (!deviceReceivesComandaArea(pay.areaId)) return false;
    var ctx = cloudCtx();
    var tid = String(pay.transaction_id || row.id || '');
    var myUuid = String(ctx.deviceUuid || '');
    var originUuid = row.device_id ? String(row.device_id) : '';
    var isOwnPush = myUuid && originUuid && myUuid === originUuid;
    var recentOwn = isRecentEcho(String(row.id)) || (tid && isRecentEcho(tid));

    if (typeof global.__crozzoEmergencyApplyComandaSnapshot === 'function') {
      global.__crozzoEmergencyApplyComandaSnapshot(pay, { skipPrint: true });
    }
    var merged =
      findComanda(pay.id) ||
      (pay.transaction_id
        ? (global.comandas || []).find(function (c) {
            return c.transaction_id === pay.transaction_id;
          })
        : null);
    var printId = merged ? merged.id : pay.id;

    var shouldPrint = false;
    var shouldNotifyScreen = true;
    if (!opts.skipPrint && deviceReceivesComandaArea(pay.areaId) && !isOwnPush && !recentOwn) {
      var cfg = typeof global.getComandasConfig === 'function' ? global.getComandasConfig() : {};
      if (cfg.autoPrint !== false && deviceCanPrintComandaArea(pay.areaId)) shouldPrint = true;
    }
    if (shouldNotifyScreen && !shouldPrint && !isOwnPush && !recentOwn && typeof global.showToast === 'function') {
      try {
        var areaLabel =
          typeof global.crozzoComandaAreaLabel === 'function'
            ? global.crozzoComandaAreaLabel(pay.areaId)
            : pay.areaId || 'pantalla';
        global.showToast('📺 Comanda #' + printId + ' en pantalla ' + areaLabel, 'info');
      } catch (_) {}
    }
    if (shouldPrint && tid) {
      if (!__printedTids[tid] || Date.now() - __printedTids[tid] > 90000) {
        __printedTids[tid] = Date.now();
        try {
          if (typeof global.printComandaNow === 'function') global.printComandaNow(printId, true);
          if (typeof global.showToast === 'function') {
            global.showToast('🖨️ Comanda #' + printId + ' — ticket impreso', 'info');
          }
        } catch (e) {
          console.warn('[crozzo-comanda-cloud] print', e);
        }
      }
    }

    try {
      if (typeof global.schedulePosRuntimeSave === 'function') global.schedulePosRuntimeSave();
    } catch (_) {}
    if (
      !opts.skipRender &&
      typeof global.renderPage === 'function' &&
      (global.currentPage === 'comandas' || global.currentPage === 'cocina')
    ) {
      try {
        global.renderPage(global.currentPage);
      } catch (_) {}
    }
    return true;
  }

  async function pullComandasFromCloud(opts) {
    if (!online()) return false;
    var ctx = cloudCtx();
    var sb = global.__SUPABASE;
    try {
      var q = sb
        .from('comandas')
        .select('*')
        .neq('status', 'entregada')
        .order('updated_at', { ascending: false })
        .limit(100);
      if (ctx.businessId) q = q.eq('business_id', ctx.businessId);
      var res = await q;
      if (res.error) {
        console.warn('[crozzo-comanda-cloud] pull', res.error.message || res.error);
        return false;
      }
      var rows = res.data || [];
      var now = Date.now();
      for (var i = rows.length - 1; i >= 0; i--) {
        var row = rows[i];
        var updated = Date.parse(row.updated_at || 0) || 0;
        var skipPrint = !!(opts && opts.skipPrint) || now - updated > 8 * 60 * 1000;
        applyComandaFromCloudRow(row, { skipPrint: skipPrint, skipRender: true });
      }
      if (
        typeof global.renderPage === 'function' &&
        (global.currentPage === 'comandas' || global.currentPage === 'cocina')
      ) {
        try {
          global.renderPage(global.currentPage);
        } catch (_) {}
      }
      return true;
    } catch (e) {
      console.warn('[crozzo-comanda-cloud] pull', e);
      return false;
    }
  }

  function startComandasCloudSync() {
    if (__started) return;
    if (!online()) return;
    __started = true;

    pullComandasFromCloud({ skipPrint: false }).catch(function () {});

    if (__pullTimer) clearInterval(__pullTimer);
    __pullTimer = global.setInterval(function () {
      pullComandasFromCloud({ skipPrint: false }).catch(function () {});
    }, 10000);

    try {
      if (global.__crozzoComandaCloudCh) return;
      var ch = global.__SUPABASE.channel('crozzo_comandas_live_v1');
      ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comandas' }, function (payload) {
        if (payload.new) applyComandaFromCloudRow(payload.new);
      });
      ch.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'comandas' }, function (payload) {
        if (payload.new) applyComandaFromCloudRow(payload.new);
      });
      ch.subscribe(function (status) {
        if (status === 'CHANNEL_ERROR') console.warn('[crozzo-comanda-cloud] realtime error');
      });
      global.__crozzoComandaCloudCh = ch;
    } catch (e) {
      console.warn('[crozzo-comanda-cloud] subscribe', e);
    }
  }

  function stopComandasCloudSync() {
    __started = false;
    if (__pullTimer) {
      global.clearInterval(__pullTimer);
      __pullTimer = null;
    }
    try {
      if (global.__crozzoComandaCloudCh) {
        global.__SUPABASE.removeChannel(global.__crozzoComandaCloudCh);
        global.__crozzoComandaCloudCh = null;
      }
    } catch (_) {}
  }

  global.crozzoPushComandaToCloud = pushComanda;
  global.crozzoPushComandasCloudByIds = pushComandasByIds;
  global.crozzoPullComandasFromCloud = pullComandasFromCloud;
  global.crozzoStartComandasCloudSync = startComandasCloudSync;
  global.crozzoStopComandasCloudSync = stopComandasCloudSync;
})(typeof window !== 'undefined' ? window : globalThis);
