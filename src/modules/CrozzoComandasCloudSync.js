/**
 * Sincroniza comandas entre dispositivos vía Supabase (tabla public.comandas).
 * El que comanda sube; el que tiene impresora descarga e imprime.
 */
(function (global) {
  'use strict';

  var __started = false;
  var __pullTimer = null;
  var __realtimeLive = false;
  var PULL_MS_LIVE = 22000;
  var PULL_MS_FALLBACK = 7000;
  var __pushEcho = {};
  var __printedTids = {};
  var TID_TTL_MS = 600000;

  function tierNow() {
    return String(global.__CROZZO_TIER_LAST || 'offline');
  }

  function tierAllowsCloudPush() {
    var t = tierNow();
    return t === 'cloud' || t === 'lan' || t === 'hotspot';
  }

  function markComandaTid(tid, source) {
    if (!tid) return;
    if (!global.__crozzoComandaTidSeen) global.__crozzoComandaTidSeen = {};
    global.__crozzoComandaTidSeen[String(tid)] = { at: Date.now(), src: source || 'local' };
    var keys = Object.keys(global.__crozzoComandaTidSeen);
    if (keys.length > 600) {
      var cutoff = Date.now() - TID_TTL_MS;
      keys.forEach(function (k) {
        if (global.__crozzoComandaTidSeen[k].at < cutoff) delete global.__crozzoComandaTidSeen[k];
      });
    }
  }

  function comandaTidRecent(tid, maxMs) {
    if (!tid || !global.__crozzoComandaTidSeen) return false;
    var e = global.__crozzoComandaTidSeen[String(tid)];
    return !!(e && Date.now() - e.at < (maxMs || 120000));
  }

  global.__crozzoComandaTidMark = markComandaTid;
  global.__crozzoComandaTidRecent = comandaTidRecent;

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

  function slimComandaPayload(c) {
    var items = Array.isArray(c.items)
      ? c.items.map(function (it) {
          if (!it) return null;
          return {
            id: it.id,
            nombre: it.nombre,
            cantidad: it.cantidad,
            precio: it.precio,
            nota: it.nota || it.observacion || '',
          };
        }).filter(Boolean)
      : [];
    return {
      id: c.id,
      transaction_id: c.transaction_id,
      areaId: c.areaId,
      estado: c.estado,
      items: items,
      mesaRef: c.mesaRef,
      tipoServicio: c.tipoServicio,
      createdAt: c.createdAt,
      notas: c.notas,
      slotRef: c.slotRef,
    };
  }

  function fullComandaLanPayload(c) {
    try {
      return JSON.parse(JSON.stringify(c));
    } catch (_) {
      return slimComandaPayload(c);
    }
  }

  async function pushComandaLan(comanda) {
    if (!comanda) return false;
    var md = typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
    if (!md || md.role === 'A') return false;
    var ip = String(md.centralIp || '').trim();
    if (!ip) return false;
    var port = Number(md.port) || 3000;
    var ctx = cloudCtx();
    var body = {
      uuid: String(comanda.transaction_id || comanda.id || ''),
      businessId: ctx.businessId,
      deviceId: ctx.deviceId,
      location_id: ctx.locationId,
      type: 'comanda',
      data: fullComandaLanPayload(comanda),
    };
    try {
      var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = controller ? global.setTimeout(function () { controller.abort(); }, 5500) : null;
      var res = await fetch('http://' + ip + ':' + port + '/api/sync', {
        method: 'POST',
        headers: (typeof global.crozzoLanAuthHeaders === 'function'
          ? global.crozzoLanAuthHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' })
          : { 'Content-Type': 'application/json', Accept: 'application/json' }),
        body: JSON.stringify(body),
        signal: controller ? controller.signal : undefined,
      });
      if (timer) global.clearTimeout(timer);
      if (!res.ok) {
        if (typeof global.crozzoSignalLanTrouble === 'function') global.crozzoSignalLanTrouble();
        return false;
      }
      var j = await res.json().catch(function () { return null; });
      return !!(j && j.ok !== false);
    } catch (e) {
      if (typeof global.crozzoSignalLanTrouble === 'function') global.crozzoSignalLanTrouble();
      return false;
    }
  }

  function pushComandasLanByIds(ids) {
    if (!Array.isArray(ids) || !ids.length) return;
    var t = tierNow();
    if (t !== 'lan' && t !== 'hotspot') return;
    ids.forEach(function (id) {
      var c = findComanda(id);
      if (c) pushComandaLan(c).catch(function () {});
    });
  }

  async function pushComanda(comanda) {
    if (!online() || !comanda || !tierAllowsCloudPush()) return false;
    var sb = global.__SUPABASE;
    var ctx = cloudCtx();
    var rowId = rowIdForComanda(comanda);
    var payload = slimComandaPayload(comanda);
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
    if (comanda.transaction_id) markComandaTid(comanda.transaction_id, 'cloud_push');
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
      if (!c) return;
      pushComanda(c)
        .then(function (ok) {
          if (ok) return;
          var t = tierNow();
          if (t === 'lan' || t === 'hotspot') return pushComandaLan(c);
        })
        .catch(function (e) {
          console.warn('[crozzo-comanda-cloud]', e);
          var t = tierNow();
          if (t === 'lan' || t === 'hotspot') pushComandaLan(c).catch(function () {});
        });
    });
  }

  async function pushComandaEstadoLan(comanda, estado) {
    if (!comanda) return false;
    var md = typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
    if (!md || md.role === 'A') return false;
    var ip = String(md.centralIp || '').trim();
    if (!ip) return false;
    var port = Number(md.port) || 3000;
    var ctx = cloudCtx();
    var body = {
      uuid: String(comanda.transaction_id || comanda.id || '') + ':' + String(estado || comanda.estado || ''),
      businessId: ctx.businessId,
      deviceId: ctx.deviceId,
      location_id: ctx.locationId,
      type: 'comanda_estado',
      data: {
        id: comanda.id,
        transaction_id: comanda.transaction_id,
        estado: estado || comanda.estado,
        lastUpdateAt: new Date().toISOString(),
      },
    };
    try {
      var res = await fetch('http://' + ip + ':' + port + '/api/sync', {
        method: 'POST',
        headers: (typeof global.crozzoLanAuthHeaders === 'function'
          ? global.crozzoLanAuthHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' })
          : { 'Content-Type': 'application/json', Accept: 'application/json' }),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        if (typeof global.crozzoSignalLanTrouble === 'function') global.crozzoSignalLanTrouble();
        return false;
      }
      var j = await res.json().catch(function () { return null; });
      return !!(j && j.ok !== false);
    } catch (_) {
      if (typeof global.crozzoSignalLanTrouble === 'function') global.crozzoSignalLanTrouble();
      return false;
    }
  }

  function fanoutComandaEstado(comanda, estado) {
    if (!comanda) return;
    var est = estado || comanda.estado;
    var tier = tierNow();
    if (tier === 'offline') {
      try {
        if (global.CrozzoOfflineGossip && typeof global.CrozzoOfflineGossip.publishEstado === 'function') {
          global.CrozzoOfflineGossip.publishEstado(comanda.id, est, comanda.transaction_id);
        }
      } catch (_) {}
      return;
    }
    if (tierAllowsCloudPush() && online()) {
      pushComanda(comanda).catch(function () {});
    }
    if (tier === 'lan' || tier === 'hotspot') {
      pushComandaEstadoLan(comanda, est).catch(function () {});
    }
    try {
      if (global.CrozzoLanWebSocketBridge && typeof global.CrozzoLanWebSocketBridge.notifyEstado === 'function') {
        global.CrozzoLanWebSocketBridge.notifyEstado(comanda, est);
      }
    } catch (_) {}
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
    var tidEarly = String(pay.transaction_id || row.id || '');
    if (tidEarly && comandaTidRecent(tidEarly, 45000)) {
      var existing =
        findComanda(pay.id) ||
        (global.comandas || []).find(function (c) {
          return c.transaction_id && String(c.transaction_id) === tidEarly;
        });
      if (existing && !opts.forceApply) return false;
    }
    if (!deviceReceivesComandaArea(pay.areaId)) return false;
    var ctx = cloudCtx();
    var tid = String(pay.transaction_id || row.id || '');
    var myUuid = String(ctx.deviceUuid || '');
    var originUuid = row.device_id ? String(row.device_id) : '';
    var isOwnPush = myUuid && originUuid && myUuid === originUuid;
    var recentOwn = isRecentEcho(String(row.id)) || (tid && isRecentEcho(tid));

    if (tidEarly) markComandaTid(tidEarly, 'cloud_pull');
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
        .select('id,status,payload,updated_at,device_id,location_id,business_id')
        .neq('status', 'entregada')
        .order('updated_at', { ascending: false })
        .limit(100);
      if (ctx.businessId) q = q.eq('business_id', ctx.businessId);
      // Filtro por sede: a escala (varias sedes en un mismo negocio) evita traer
      // comandas ajenas; rowMatchesTenant igual las descartaria, pero asi no viajan.
      if (ctx.locationId && ctx.locationId !== 'default') q = q.eq('location_id', ctx.locationId);
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

    function scheduleComandaPull() {
      if (
        global.CrozzoPageCloudWatch &&
        typeof global.CrozzoPageCloudWatch.usesGlobalComandaPoll === 'function' &&
        !global.CrozzoPageCloudWatch.usesGlobalComandaPoll()
      ) {
        if (__pullTimer) {
          global.clearInterval(__pullTimer);
          __pullTimer = null;
        }
        return;
      }
      if (__pullTimer) clearInterval(__pullTimer);
      var ms = __realtimeLive ? PULL_MS_LIVE : PULL_MS_FALLBACK;
      // Escala: bajo presion (429/503/timeout) o si Realtime esta vivo, el polling
      // de respaldo se espacia para no amplificar la carga con muchos dispositivos.
      var thr = global.CrozzoCloudThrottle;
      if (thr && typeof thr.isUnderPressure === 'function' && thr.isUnderPressure()) {
        ms = Math.min(60000, ms * 3);
      }
      __pullTimer = global.setInterval(function () {
        pullComandasFromCloud({ skipPrint: false }).catch(function () {});
      }, ms);
    }
    scheduleComandaPull();

    try {
      if (global.__crozzoComandaCloudCh) return;
      // Canal y filtro por negocio: cada dispositivo solo recibe los eventos de su
      // tenant, evitando el fan-out N x M (todos recibiendo todo) a gran escala.
      var bid = String(cloudCtx().businessId || '').trim();
      var chName = bid && bid !== 'default' ? 'crozzo_comandas_live_' + bid.replace(/[^a-zA-Z0-9_]/g, '_') : 'crozzo_comandas_live_v1';
      var insOpts = { event: 'INSERT', schema: 'public', table: 'comandas' };
      var updOpts = { event: 'UPDATE', schema: 'public', table: 'comandas' };
      if (bid && bid !== 'default') {
        insOpts.filter = 'business_id=eq.' + bid;
        updOpts.filter = 'business_id=eq.' + bid;
      }
      var ch = global.__SUPABASE.channel(chName);
      ch.on('postgres_changes', insOpts, function (payload) {
        if (payload.new) applyComandaFromCloudRow(payload.new);
      });
      ch.on('postgres_changes', updOpts, function (payload) {
        if (payload.new) applyComandaFromCloudRow(payload.new);
      });
      ch.subscribe(function (status) {
        if (status === 'SUBSCRIBED') {
          __realtimeLive = true;
          scheduleComandaPull();
        } else if (status === 'CHANNEL_ERROR') {
          __realtimeLive = false;
          if (!online()) {
            stopComandasCloudSync();
            return;
          }
          scheduleComandaPull();
          if (!global.__crozzoComandaRtErrOnce) {
            global.__crozzoComandaRtErrOnce = true;
            console.warn('[crozzo-comanda-cloud] realtime error');
          }
        }
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

  function fanoutComandasByIds(ids) {
    if (!Array.isArray(ids) || !ids.length) return;
    ids.forEach(function (id) {
      var c = findComanda(id);
      if (c && c.transaction_id) markComandaTid(c.transaction_id, 'local_create');
    });
    try {
      if (typeof global.maybeEmergencyBroadcastComandas === 'function') {
        global.maybeEmergencyBroadcastComandas(ids);
      }
    } catch (_) {}
    var tier = tierNow();
    if (tier === 'offline') {
      try {
        if (global.CrozzoOfflineGossip && typeof global.CrozzoOfflineGossip.publishComandaNewByIds === 'function') {
          global.CrozzoOfflineGossip.publishComandaNewByIds(ids);
        }
      } catch (_) {}
      return;
    }
    pushComandasByIds(ids);
    pushComandasLanByIds(ids);
    try {
      if (global.CrozzoLanWebSocketBridge && typeof global.CrozzoLanWebSocketBridge.notifyComandasByIds === 'function') {
        global.CrozzoLanWebSocketBridge.notifyComandasByIds(ids);
      }
    } catch (_) {}
  }

  global.crozzoFanoutComandasByIds = fanoutComandasByIds;
  global.crozzoFanoutComandaEstado = fanoutComandaEstado;
  global.crozzoPushComandaToCloud = pushComanda;
  global.crozzoPushComandasCloudByIds = pushComandasByIds;
  global.crozzoPushComandasLanByIds = pushComandasLanByIds;
  global.crozzoPullComandasFromCloud = pullComandasFromCloud;
  global.crozzoStartComandasCloudSync = startComandasCloudSync;
  global.crozzoStopComandasCloudSync = stopComandasCloudSync;
})(typeof window !== 'undefined' ? window : globalThis);
