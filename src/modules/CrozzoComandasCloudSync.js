/**
 * Sincroniza comandas entre dispositivos vía Supabase (tabla public.comandas).
 * El que comanda sube; el que tiene impresora descarga e imprime.
 */
(function (global) {
  'use strict';

  var __started = false;
  var __pullTimer = null;
  var __realtimeLive = false;
  var __lastRtEventAt = 0;
  var SILENCE_WATCHDOG_MS = 30000;
  var PULL_MS_LIVE = 12000;
  var PULL_MS_FALLBACK = 4500;
  var __pushEcho = {};
  var __printedTids = {};
  var TID_TTL_MS = 600000;
  var __rtResubTimer = null;
  var __rtResubAttempt = 0;
  var __comandaUiNotifyAt = {};
  var COMANDA_NOTIFY_GAP_MS = 300000;

  function noteCloudErr(err) {
    try {
      var thr = global.CrozzoCloudThrottle;
      if (thr && typeof thr.noteSupabaseError === 'function') thr.noteSupabaseError(err);
    } catch (_) {}
  }

  function clearCloudPressure() {
    try {
      var thr = global.CrozzoCloudThrottle;
      if (thr && typeof thr.clearPressure === 'function') thr.clearPressure();
    } catch (_) {}
  }

  function rtResubscribeDelayMs() {
    try {
      var thr = global.CrozzoCloudThrottle;
      if (thr && typeof thr.resubscribeDelayMs === 'function') return thr.resubscribeDelayMs(__rtResubAttempt);
    } catch (_) {}
    return 2500 + __rtResubAttempt * 900;
  }

  function teardownComandaChannel() {
    try {
      if (global.__crozzoComandaCloudCh && global.__SUPABASE) {
        global.__SUPABASE.removeChannel(global.__crozzoComandaCloudCh);
      }
    } catch (_) {}
    global.__crozzoComandaCloudCh = null;
    __realtimeLive = false;
  }

  function scheduleComandaRealtimeResubscribe(reason) {
    if (__rtResubTimer) return;
    __rtResubAttempt = Math.min((__rtResubAttempt || 0) + 1, 14);
    var ms = rtResubscribeDelayMs();
    __rtResubTimer = global.setTimeout(function () {
      __rtResubTimer = null;
      if (!online()) return;
      subscribeComandaRealtime(reason || 'resub');
    }, ms);
  }

  function comandaRealtimeFilter(ctx, bid) {
    var parts = [];
    if (bid && bid !== 'default') parts.push('business_id=eq.' + bid);
    if (ctx.locationId && ctx.locationId !== 'default') parts.push('location_id=eq.' + ctx.locationId);
    return parts.length ? parts.join(',') : null;
  }

  function tierNow() {
    return String(global.__CROZZO_TIER_LAST || 'offline');
  }

  function tierAllowsCloudPush() {
    try {
      if (typeof global.crozzoTierAllowsCloudSync === 'function') {
        return global.crozzoTierAllowsCloudSync() && online();
      }
    } catch (_) {}
    if (online()) return true;
    var t = tierNow();
    return t === 'cloud';
  }

  function tierAllowsCloudRead() {
    return tierAllowsCloudPush();
  }

  function deferLocalCloudSync() {
    try {
      return typeof global.crozzoDeferLocalSync === 'function' && global.crozzoDeferLocalSync();
    } catch (_) {}
    return false;
  }

  function tenantIdsReady(ctx) {
    ctx = ctx || cloudCtx();
    return !!(
      ctx.businessId &&
      ctx.businessId !== 'default' &&
      ctx.locationId &&
      ctx.locationId !== 'default'
    );
  }

  /** LAN local disponible (cache o IP de caja) — sin costo nube, push instantáneo. */
  function lanSegmentLikely() {
    if (deferLocalCloudSync()) return false;
    try {
      if (typeof global.crozzoIsLocalLanSegmentUp === 'function' && global.crozzoIsLocalLanSegmentUp()) {
        return true;
      }
    } catch (_) {}
    var md = typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
    if (md.role === 'A') return true;
    return !!(String(md.centralIp || '').trim());
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
  global.__crozzoComandaMarkPrinted = function (tid) {
    if (!tid) return;
    __printedTids[String(tid)] = Date.now();
  };
  global.__crozzoComandaWasPrintedRecently = function (tid, maxMs) {
    if (!tid) return false;
    var t = __printedTids[String(tid)];
    return !!(t && Date.now() - t < (maxMs || 90000));
  };

  function online() {
    return (
      typeof global.crozzoOnlineConfigReady === 'function' &&
      global.crozzoOnlineConfigReady() &&
      !!global.__SUPABASE
    );
  }

  function cloudCtx() {
    var md = typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
    var loc = String(md.locationId || 'default').trim() || 'default';
    if (!loc || loc === 'default') {
      try {
        if (typeof global.crozzoEnsureSedeLocationId === 'function') {
          var ensured = String(global.crozzoEnsureSedeLocationId() || '').trim();
          if (ensured && ensured !== 'default') loc = ensured;
        }
      } catch (_) {}
    }
    var deviceId = '';
    try {
      deviceId = String(
        (typeof global.ensureCrozzoDeviceId === 'function' && global.ensureCrozzoDeviceId()) ||
          global.localStorage.getItem('crozzo_device_id') ||
          global.localStorage.getItem('device_id') ||
          md.deviceId ||
          ''
      ).trim();
    } catch (_) {
      deviceId = String(md.deviceId || '').trim();
    }
    return {
      businessId: String(md.businessId || 'default').trim() || 'default',
      locationId: loc,
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

  function findComandaForCloudPay(pay, row) {
    if (!pay) return null;
    var tid = String(pay.transaction_id || (row && row.id) || '').trim();
    var list = global.comandas || [];
    if (tid) {
      var byTid = list.find(function (c) {
        return c && c.transaction_id && String(c.transaction_id) === tid && c.estado !== 'entregada';
      });
      if (byTid) return byTid;
    }
    if (pay.id != null) return findComanda(pay.id);
    return null;
  }

  function scheduleComandaUiIfKitchen() {
    try {
      if (global.currentPage !== 'comandas' && global.currentPage !== 'cocina') return;
      if (typeof global.crozzoPatchOperationalPageFromRemote === 'function') {
        if (global.crozzoPatchOperationalPageFromRemote(global.currentPage)) return;
      }
      scheduleComandaPageRefresh();
    } catch (_) {}
  }

  function deviceReceivesComandaArea(areaId) {
    if (typeof global.crozzoDeviceShowsComandaArea === 'function') {
      return global.crozzoDeviceShowsComandaArea(areaId);
    }
    return true;
  }

  function deviceShouldIngestComandaArea(areaId) {
    if (typeof global.crozzoDeviceShouldIngestComandaArea === 'function') {
      return global.crozzoDeviceShouldIngestComandaArea(areaId);
    }
    if (deviceReceivesComandaArea(areaId)) return true;
    return deviceCanPrintComandaArea(areaId);
  }

  function deviceCanPrintComandaArea(areaId) {
    if (typeof global.crozzoIsLocalPrintTargetForArea === 'function') {
      return global.crozzoIsLocalPrintTargetForArea(areaId);
    }
    if (typeof global.crozzoHasPrinterForComandaArea === 'function') {
      return global.crozzoHasPrinterForComandaArea(areaId);
    }
    return false;
  }

  function slimComandaPayload(c, opts) {
    opts = opts || {};
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
    var estado = opts.estado != null ? String(opts.estado) : String(c.estado || 'pendiente');
    return {
      id: c.id,
      transaction_id: c.transaction_id,
      areaId: c.areaId,
      estado: estado,
      items: items,
      mesaRef: c.mesaRef,
      tipoServicio: c.tipoServicio,
      referencia: c.referencia,
      createdAt: c.createdAt,
      lastUpdateAt: opts.lastUpdateAt || c.lastUpdateAt || c.createdAt,
      preparandoAt: c.preparandoAt,
      listaAt: c.listaAt,
      entregadaAt: c.entregadaAt,
      notas: c.notas,
      slotRef: c.slotRef,
      origen: c.origen,
      creadoPor: c.creadoPor,
      creadoPorNombre: c.creadoPorNombre,
      creadoPorRol: c.creadoPorRol,
      creadoPorEtiqueta: c.creadoPorEtiqueta,
      printed_by: opts.printed_by || c.printed_by || null,
      printed_at: opts.printed_at || c.printed_at || null,
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
    if (!lanSegmentLikely()) return;
    ids.forEach(function (id) {
      var c = findComanda(id);
      if (c) pushComandaLan(c).catch(function () {});
    });
  }

  async function pushComanda(comanda, opts) {
    opts = opts || {};
    if (!online() || !comanda || !tierAllowsCloudPush()) return false;
    var sb = global.__SUPABASE;
    var ctx = cloudCtx();
    var rowId = rowIdForComanda(comanda);
    var estado = opts.estado != null ? String(opts.estado) : String(comanda.estado || 'pendiente');
    var payload = slimComandaPayload(comanda, {
      estado: estado,
      lastUpdateAt: opts.lastUpdateAt || comanda.lastUpdateAt,
    });
    payload._cloudOriginDevice = ctx.deviceId;
    payload._cloudDeviceUuid = ctx.deviceUuid;
    payload._cloudSyncedAt = new Date().toISOString();
    var body = {
      id: rowId,
      device_id: ctx.deviceUuid || null,
      location_id: ctx.locationId,
      business_id: ctx.businessId,
      status: estado,
      payload: payload,
      updated_at: payload.lastUpdateAt || payload._cloudSyncedAt,
    };
    markPushEcho(comanda, rowId);
    if (comanda.transaction_id) markComandaTid(comanda.transaction_id, 'cloud_push');
    try {
      var res = await sb.from('comandas').upsert(body, { onConflict: 'id' });
      if (res.error) {
        console.warn('[crozzo-comanda-cloud] push', res.error.message || res.error);
        noteCloudErr(res.error);
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
    var lan = lanSegmentLikely();
    ids.forEach(function (id) {
      var c = findComanda(id);
      if (!c) return;
      if (tierAllowsCloudPush() && online()) {
        pushComanda(c).catch(function () {});
      }
      if (!deferLocalCloudSync() && lan) pushComandaLan(c).catch(function () {});
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
      pushComanda(comanda, {
        estado: est,
        lastUpdateAt: comanda.lastUpdateAt,
      }).catch(function () {});
    }
    if (!deferLocalCloudSync() && lanSegmentLikely()) {
      pushComandaEstadoLan(comanda, est).catch(function () {});
    }
    if (!deferLocalCloudSync()) {
      try {
        if (global.CrozzoLanWebSocketBridge && typeof global.CrozzoLanWebSocketBridge.notifyEstado === 'function') {
          global.CrozzoLanWebSocketBridge.notifyEstado(comanda, est);
        }
      } catch (_) {}
    }
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

  function shouldNotifyComandaUi(id, kind) {
    if (!id) return false;
    var k = String(kind || 'ui') + ':' + String(id);
    var last = __comandaUiNotifyAt[k] || 0;
    if (Date.now() - last < COMANDA_NOTIFY_GAP_MS) return false;
    __comandaUiNotifyAt[k] = Date.now();
    return true;
  }

  function scheduleComandaPageRefresh() {
    try {
      if (typeof global.crozzoScheduleOperationalPageRefresh === 'function') {
        global.crozzoScheduleOperationalPageRefresh(global.currentPage);
        return;
      }
    } catch (_) {}
    if (
      typeof global.renderPage === 'function' &&
      (global.currentPage === 'comandas' || global.currentPage === 'cocina')
    ) {
      try {
        global.renderPage(global.currentPage);
      } catch (_) {}
    }
  }

  function applyComandaRemovedFromCloud(pay, row) {
    if (typeof global.crozzoApplyComandaRemovedFromRemote === 'function') {
      return global.crozzoApplyComandaRemovedFromRemote({
        id: pay && pay.id,
        transaction_id: (pay && pay.transaction_id) || (row && row.id),
        lastUpdateAt: (row && row.updated_at) || (pay && pay.lastUpdateAt),
      });
    }
    return false;
  }

  function hydrateComandaPrinter(comanda) {
    if (!comanda || comanda.areaId == null) return comanda;
    if (String(comanda.impresora || '').trim()) return comanda;
    try {
      var areas =
        typeof global.getComandasConfig === 'function' ? global.getComandasConfig().areas || [] : [];
      var areaCfg = areas.find(function (a) {
        return a && a.id === comanda.areaId;
      });
      if (areaCfg) {
        if (typeof global.crozzoComandaAreaEffectivePrinter === 'function') {
          comanda.impresora = global.crozzoComandaAreaEffectivePrinter(areaCfg) || comanda.impresora;
        } else if (areaCfg.impresora) {
          comanda.impresora = areaCfg.impresora;
        }
      }
    } catch (_) {}
    return comanda;
  }

  function tryAutoPrintMerged(merged, opts) {
    if (!merged || opts.skipPrint || opts.silent) return false;
    hydrateComandaPrinter(merged);
    if (typeof global.crozzoTryAutoPrintComanda === 'function') {
      global.crozzoTryAutoPrintComanda(merged);
      return typeof global.crozzoComandaHasPrinter === 'function' && global.crozzoComandaHasPrinter(merged);
    }
    return false;
  }

  function applyComandaFromCloudRow(row, opts) {
    opts = opts || {};
    if (!row || !row.payload || row.payload.id == null) return false;
    if (!rowMatchesTenant(row)) return false;

    var pay = row.payload;
    if (row.status && pay) pay.estado = row.status;
    var est = String(row.status || pay.estado || '');
    if (est === 'entregada') {
      var removed = applyComandaRemovedFromCloud(pay, row);
      if (removed && !opts.skipRender) scheduleComandaPageRefresh();
      return removed;
    }

    var tidEarly = String(pay.transaction_id || row.id || '');
    var existingEarly = findComandaForCloudPay(pay, row);
    if (existingEarly && !opts.forceApply) {
      var remoteAtEarly =
        Date.parse(row.updated_at || pay.lastUpdateAt || pay._cloudSyncedAt || 0) || 0;
      var localAtEarly =
        Date.parse(existingEarly.lastUpdateAt || existingEarly.createdAt || 0) || 0;
      if (localAtEarly > remoteAtEarly + 500) {
        if (!opts.skipPrint && !opts.silent) tryAutoPrintMerged(existingEarly, opts);
        return false;
      }
    }
    if (
      tidEarly &&
      comandaTidRecent(tidEarly, 45000) &&
      existingEarly &&
      !opts.forceApply &&
      existingEarly.transaction_id &&
      String(existingEarly.transaction_id) === tidEarly
    ) {
      var remoteEst = String(row.status || pay.estado || '');
      var localEst = String(existingEarly.estado || '');
      var remoteAt = Date.parse(row.updated_at || pay.lastUpdateAt || pay._cloudSyncedAt || 0) || 0;
      var localAt = Date.parse(existingEarly.lastUpdateAt || existingEarly.createdAt || 0) || 0;
      if (localAt > remoteAt + 500) return false;
      if (remoteEst === localEst && remoteAt <= localAt + 500) {
        if (!opts.skipPrint && !opts.silent && typeof global.crozzoTryAutoPrintComanda === 'function') {
          tryAutoPrintMerged(existingEarly, opts);
        }
        return false;
      }
    }
    if (!deviceShouldIngestComandaArea(pay.areaId)) {
      try {
        console.log(
          '[crozzo-rt] comanda descartada por área:',
          pay.areaId,
          '— pantalla/impresora no corresponde a este equipo'
        );
      } catch (_) {}
      return false;
    }
    // Si el payload del cloud indica que otro dispositivo ya imprimió esta
    // comanda, registrar en el tracker distribuido local para evitar duplicado.
    if (pay.printed_by && pay.printed_at) {
      try {
        var printKey = pay.transaction_id || String(pay.id || '');
        if (printKey && typeof global.__crozzoComandaMarkPrinted === 'function') {
          var myCtx = cloudCtx();
          if (String(pay.printed_by) !== String(myCtx.deviceId || '')) {
            global.__crozzoComandaMarkPrinted(printKey);
          }
        }
      } catch (_) {}
    }
    var ctx = cloudCtx();
    var tid = String(pay.transaction_id || row.id || '');
    var myUuid = String(ctx.deviceUuid || '');
    var originUuid = row.device_id ? String(row.device_id) : '';
    var isOwnPush = myUuid && originUuid && myUuid === originUuid;
    var recentOwn = isRecentEcho(String(row.id)) || (tid && isRecentEcho(tid));

    var existed = findComandaForCloudPay(pay, row);
    var prevEst = existed ? String(existed.estado || '') : '';
    var prevItemsJson = existed ? JSON.stringify(existed.items || []) : '';

    if (tidEarly) markComandaTid(tidEarly, 'cloud_pull');
    var changed = false;
    if (typeof global.__crozzoEmergencyApplyComandaSnapshot === 'function') {
      changed = !!global.__crozzoEmergencyApplyComandaSnapshot(pay, { skipPrint: true, skipRender: true });
    }
    var merged = findComandaForCloudPay(pay, row);
    if (!changed && merged && existed) {
      var remoteEst2 = String(row.status || pay.estado || '');
      if (remoteEst2 && remoteEst2 !== prevEst) changed = true;
      if (JSON.stringify(merged.items || []) !== prevItemsJson) changed = true;
    }
    if (!changed && !existed && merged) changed = true;
    if (!changed) {
      if (!isOwnPush && !recentOwn && merged && !opts.skipPrint && !opts.silent) {
        tryAutoPrintMerged(merged, opts);
      }
      if (merged && !opts.skipRender) scheduleComandaUiIfKitchen();
      return false;
    }

    var printId = merged ? merged.id : pay.id;

    var isNew = !existed && !!merged;
    var itemsChanged = !!(
      existed &&
      merged &&
      JSON.stringify(merged.items || []) !== prevItemsJson
    );
    var estadoChanged = !!existed && !!merged && String(merged.estado || '') !== prevEst;

    var shouldPrint = false;
    if (!isOwnPush && !recentOwn && merged && !opts.skipPrint && !opts.silent) {
      shouldPrint = tryAutoPrintMerged(merged, opts);
    }
    var shouldNotifyScreen =
      !opts.silent &&
      opts.notify !== false &&
      (isNew || estadoChanged) &&
      !isOwnPush &&
      !recentOwn &&
      deviceReceivesComandaArea(pay.areaId) &&
      !shouldPrint;
    if (shouldNotifyScreen && typeof global.showToast === 'function' && shouldNotifyComandaUi(printId, 'screen')) {
      try {
        var areaLabel =
          typeof global.crozzoComandaAreaLabel === 'function'
            ? global.crozzoComandaAreaLabel(pay.areaId)
            : pay.areaId || 'pantalla';
        global.showToast('📺 Comanda #' + printId + ' en pantalla ' + areaLabel, 'info');
      } catch (_) {}
    }
    if (shouldPrint && typeof global.showToast === 'function' && shouldNotifyComandaUi(printId, 'print')) {
      global.showToast('🖨️ Comanda #' + printId + ' — ticket impreso', 'info');
    }

    try {
      if (typeof global.schedulePosRuntimeSave === 'function') global.schedulePosRuntimeSave();
    } catch (_) {}
    if (!opts.skipRender && (global.currentPage === 'comandas' || global.currentPage === 'cocina')) {
      scheduleComandaUiIfKitchen();
    } else if (!opts.skipRender) {
      scheduleComandaPageRefresh();
    }
    return true;
  }

  async function pullComandasFromCloud(opts) {
    if (!tierAllowsCloudRead()) return false;
    var ctx = cloudCtx();
    if (!tenantIdsReady(ctx)) return false;
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
        noteCloudErr(res.error);
        return false;
      }
      var rows = res.data || [];
      var now = Date.now();
      var anyChanged = false;
      for (var i = rows.length - 1; i >= 0; i--) {
        var row = rows[i];
        var updated = Date.parse(row.updated_at || 0) || 0;
        var skipPrint = !!(opts && opts.skipPrint) || now - updated > 8 * 60 * 1000;
        if (
          applyComandaFromCloudRow(row, {
            skipPrint: skipPrint,
            skipRender: true,
            silent: !!(opts && opts.silent),
            notify: opts && opts.notify === false ? false : undefined,
          })
        ) {
          anyChanged = true;
        }
      }
      try {
        var since = new Date(now - 45 * 60 * 1000).toISOString();
        var tq = sb
          .from('comandas')
          .select('id,status,payload,updated_at')
          .eq('status', 'entregada')
          .gte('updated_at', since)
          .order('updated_at', { ascending: false })
          .limit(40);
        if (ctx.businessId) tq = tq.eq('business_id', ctx.businessId);
        if (ctx.locationId && ctx.locationId !== 'default') tq = tq.eq('location_id', ctx.locationId);
        var tomb = await tq;
        if (!tomb.error && tomb.data && tomb.data.length) {
          for (var j = 0; j < tomb.data.length; j++) {
            if (applyComandaRemovedFromCloud(tomb.data[j].payload || {}, tomb.data[j])) {
              anyChanged = true;
            }
          }
        }
      } catch (_) {}
      if (
        anyChanged &&
        (global.currentPage === 'comandas' || global.currentPage === 'cocina')
      ) {
        scheduleComandaUiIfKitchen();
      }
      return anyChanged;
    } catch (e) {
      console.warn('[crozzo-comanda-cloud] pull', e);
      return false;
    }
  }

  /** Ventana en ms dentro de la cual una comanda recién actualizada
   *  puede activar impresión automática aunque venga del poll periódico.
   *  Evita reimprimir comandas viejas al reconectar, pero sí imprime
   *  las que llegaron mientras el dispositivo estaba sin red. */
  var POLL_PRINT_WINDOW_MS = 8 * 60 * 1000;

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
    var silenceSinceEvt = __lastRtEventAt ? Date.now() - __lastRtEventAt : Infinity;
    var watchdogStale = __realtimeLive && silenceSinceEvt > SILENCE_WATCHDOG_MS;
    var ms = (watchdogStale || !__realtimeLive) ? PULL_MS_FALLBACK : PULL_MS_LIVE;
    var thr = global.CrozzoCloudThrottle;
    if (thr && typeof thr.isUnderPressure === 'function' && thr.isUnderPressure()) {
      ms = Math.min(60000, ms * 3);
    }
    __pullTimer = global.setInterval(function () {
      if (!tierAllowsCloudRead()) return;
      var stale = __lastRtEventAt ? Date.now() - __lastRtEventAt : Infinity;
      var rtSilent = __realtimeLive && stale > SILENCE_WATCHDOG_MS;
      pullComandasFromCloud({
        skipPrint: __realtimeLive && !rtSilent,
        skipRender: rtSilent,
        silent: true,
      }).catch(function () {});
    }, ms);
  }

  function subscribeComandaRealtime(reason) {
    if (!tierAllowsCloudRead()) return;
    // Si ya hay canal activo y vivo, no destruirlo — evita loop CLOSED.
    if (__realtimeLive && global.__crozzoComandaCloudCh) return;
    var ctx = cloudCtx();
    if (!tenantIdsReady(ctx)) {
      try {
        console.warn('[crozzo-comanda-cloud] Realtime omitido: configure businessId y locationId');
      } catch (_) {}
      return;
    }
    teardownComandaChannel();
    // Sanear sesión JWT antes de conectar — evita el loop 401→CLOSED→resub.
    // crozzoEnsureSupabaseAuthHealthy limpia tokens expirados y vuelve a
    // la clave anónima si hace falta. La suscripción del canal se hace en
    // el callback para no bloquear el hilo principal.
    if (global.__SUPABASE && typeof global.crozzoEnsureSupabaseAuthHealthy === 'function') {
      global.crozzoEnsureSupabaseAuthHealthy(global.__SUPABASE).then(function () {
        _doSubscribeComandaRealtime(reason);
      }).catch(function () {
        _doSubscribeComandaRealtime(reason);
      });
      return;
    }
    _doSubscribeComandaRealtime(reason);
  }

  function _doSubscribeComandaRealtime(reason) {
    if (!tierAllowsCloudRead()) return;
    var ctx = cloudCtx();
    if (!tenantIdsReady(ctx)) return;
    try {
      var bid = String(ctx.businessId || '').trim();
      var chName =
        bid && bid !== 'default'
          ? 'crozzo_comandas_live_' + bid.replace(/[^a-zA-Z0-9_]/g, '_')
          : 'crozzo_comandas_live_v1';
      if (ctx.locationId && ctx.locationId !== 'default') {
        chName += '_' + ctx.locationId.replace(/[^a-zA-Z0-9_]/g, '_');
      }
      var insOpts = { event: 'INSERT', schema: 'public', table: 'comandas' };
      var updOpts = { event: 'UPDATE', schema: 'public', table: 'comandas' };
      var flt = comandaRealtimeFilter(ctx, bid);
      if (!flt) {
        try {
          console.warn('[crozzo-comanda-cloud] Realtime sin filtro tenant — omitido');
        } catch (_) {}
        return;
      }
      insOpts.filter = flt;
      updOpts.filter = flt;
      var ch = global.__SUPABASE.channel(chName);
      ch.on('postgres_changes', insOpts, function (payload) {
        __lastRtEventAt = Date.now();
        try { console.log('[crozzo-rt] INSERT comanda', payload.new && payload.new.id); } catch (_) {}
        var applied = !!(payload.new && applyComandaFromCloudRow(payload.new, { skipPrint: false, skipRender: false }));
        try { console.log('[crozzo-rt] INSERT aplicado:', applied); } catch (_) {}
        scheduleComandaUiIfKitchen();
      });
      ch.on('postgres_changes', updOpts, function (payload) {
        if (!payload.new) return;
        __lastRtEventAt = Date.now();
        try { console.log('[crozzo-rt] UPDATE comanda', payload.new.id, payload.new.status); } catch (_) {}
        var st = String(payload.new.status || (payload.new.payload && payload.new.payload.estado) || '');
        if (st === 'entregada') {
          if (applyComandaRemovedFromCloud(payload.new.payload || {}, payload.new)) {
            scheduleComandaUiIfKitchen();
          }
          return;
        }
        var applied2 = applyComandaFromCloudRow(payload.new, { skipPrint: false, skipRender: false });
        try { console.log('[crozzo-rt] UPDATE aplicado:', applied2); } catch (_) {}
        scheduleComandaUiIfKitchen();
      });
      ch.subscribe(function (status) {
        try { console.log('[crozzo-rt] canal estado:', status); } catch (_) {}
        if (status === 'SUBSCRIBED') {
          __realtimeLive = true;
          __rtResubAttempt = 0;
          clearCloudPressure();
          scheduleComandaPull();
        } else if (status === 'CHANNEL_ERROR' || status === 'CLOSED' || status === 'TIMED_OUT') {
          __realtimeLive = false;
          scheduleComandaPull();
          if (!online()) {
            stopComandasCloudSync();
            return;
          }
          scheduleComandaRealtimeResubscribe(status);
          console.warn('[crozzo-comanda-cloud] realtime ' + status + (reason ? ' (' + reason + ')' : ''));
        }
      });
      global.__crozzoComandaCloudCh = ch;
    } catch (e) {
      console.warn('[crozzo-comanda-cloud] subscribe', e);
      noteCloudErr(e);
      scheduleComandaRealtimeResubscribe('exception');
    }
  }

  function startComandasCloudSync() {
    if (__started) {
      // Si el canal realtime ya está vivo no lo destruir — el teardown
      // que hace subscribeComandaRealtime generaría un CLOSED innecesario
      // y reiniciaría el loop que el ConnectivityOrchestrator puede provocar.
      if (!__realtimeLive) subscribeComandaRealtime('refresh');
      return;
    }
    if (!tierAllowsCloudRead()) {
      global.setTimeout(function () {
        if (tierAllowsCloudRead()) startComandasCloudSync();
      }, 1200);
      return;
    }
    if (!tenantIdsReady()) {
      try {
        if (typeof global.crozzoEnsureSedeLocationId === 'function') global.crozzoEnsureSedeLocationId();
      } catch (_) {}
      global.setTimeout(function () {
        if (tenantIdsReady()) startComandasCloudSync();
      }, 800);
      return;
    }
    __started = true;

    pullComandasFromCloud({ skipPrint: true, skipRender: true, silent: true }).catch(function () {});

    scheduleComandaPull();
    global.setTimeout(function () {
      if (!__started || !tierAllowsCloudRead() || !global.__SUPABASE) return;
      subscribeComandaRealtime('start');
    }, 900);
  }

  function stopComandasCloudSync() {
    __started = false;
    if (__rtResubTimer) {
      global.clearTimeout(__rtResubTimer);
      __rtResubTimer = null;
    }
    __rtResubAttempt = 0;
    if (__pullTimer) {
      global.clearInterval(__pullTimer);
      __pullTimer = null;
    }
    teardownComandaChannel();
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
    try {
      if (global.CrozzoLanWebSocketBridge && typeof global.CrozzoLanWebSocketBridge.notifyComandasByIds === 'function') {
        global.CrozzoLanWebSocketBridge.notifyComandasByIds(ids);
      }
    } catch (_) {}
  }

  /** Notifica al cloud que este dispositivo ya imprimió la comanda,
   *  propagando printed_by + printed_at. Otros dispositivos que reciban
   *  esta fila marcarán la comanda como impresa y no duplicarán el ticket. */
  async function pushComandaPrintedAck(comanda) {
    if (!comanda || !tierAllowsCloudPush() || !online()) return false;
    var ctx = cloudCtx();
    var deviceLabel = ctx.deviceId || ctx.deviceUuid || 'unknown';
    try {
      var c = Object.assign({}, comanda, {
        printed_by: deviceLabel,
        printed_at: new Date().toISOString(),
      });
      return await pushComanda(c, {
        estado: comanda.estado,
        printed_by: deviceLabel,
        printed_at: c.printed_at,
      });
    } catch (_) {
      return false;
    }
  }

  global.crozzoFanoutComandasByIds = fanoutComandasByIds;
  global.crozzoFanoutComandaEstado = fanoutComandaEstado;
  global.crozzoPushComandaToCloud = pushComanda;
  global.crozzoPushComandasCloudByIds = pushComandasByIds;
  global.crozzoPushComandasLanByIds = pushComandasLanByIds;
  global.crozzoPullComandasFromCloud = pullComandasFromCloud;
  global.crozzoStartComandasCloudSync = startComandasCloudSync;
  global.crozzoStopComandasCloudSync = stopComandasCloudSync;
  global.crozzoComandaPrintedAck = pushComandaPrintedAck;
  global.crozzoComandaRealtimeStatus = function () {
    return {
      live: __realtimeLive,
      hasChannel: !!global.__crozzoComandaCloudCh,
      lastEventAt: __lastRtEventAt,
      lastEventAgoMs: __lastRtEventAt ? Date.now() - __lastRtEventAt : null,
      started: __started,
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
