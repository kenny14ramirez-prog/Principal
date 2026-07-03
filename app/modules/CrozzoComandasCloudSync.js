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
  var __startRetryTimer = null;
  var __outboxDraining = false;
  var __comandaUiNotifyAt = {};
  var COMANDA_NOTIFY_GAP_MS = 300000;
  var COMANDA_CLOUD_RETENTION_MS = 12 * 60 * 60 * 1000;
  var COMANDA_PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000;
  var PURGE_BATCH_SIZE = 100;
  var PURGE_MAX_BATCHES = 8;
  var PURGE_MAX_BATCHES_CATCHUP = 30;
  var __comandaPurgeTimer = null;
  var BOOT_PRINT_GRACE_MS = 3 * 60 * 1000;
  var PRINTED_LS_KEY = 'crozzo_comanda_printed_v1';
  var PRINTED_LS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  if (!global.__crozzoPosBootAt) global.__crozzoPosBootAt = Date.now();

  // ── Delay mínimo antes de reaccionar a un CLOSED ─────────────────────────
  // ANTES era setTimeout(..., 0): evaluaba tierAllowsCloudRead() en el mismo
  // tick en que el orchestrator acababa de cambiar el tier → siempre false →
  // llamaba stopComandasCloudSync() → loop SUBSCRIBED→CLOSED.
  // Con 2500 ms el orchestrator ya estabilizó su estado y la decisión es real.
  var RT_CLOSED_REACT_MS = 2500;

  function noteCloudErr(err) {
    try {
      var msg = String((err && err.message) || err || '');
      if (/INSUFFICIENT_RESOURCES/i.test(msg)) {
        if (typeof global.crozzoNoteLanFetchPressure === 'function') global.crozzoNoteLanFetchPressure(err);
      } else if (/ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|Failed to fetch|network/i.test(msg)) {
        if (typeof global.crozzoNoteWanUnreachable === 'function') global.crozzoNoteWanUnreachable(msg);
      }
      var thr = global.CrozzoCloudThrottle;
      if (thr && typeof thr.noteSupabaseError === 'function') thr.noteSupabaseError(err);
      else if (thr && typeof thr.noteFetchFailure === 'function') thr.noteFetchFailure(err);
    } catch (_) {}
  }

  function rtLog() {
    if (!tierAllowsCloudRead()) return;
    try {
      console.log.apply(console, arguments);
    } catch (_) {}
  }

  function clearCloudPressure() {
    try {
      var thr = global.CrozzoCloudThrottle;
      if (thr && typeof thr.clearPressure === 'function') thr.clearPressure();
    } catch (_) {}
  }

  function cloudUnderPressure() {
    try {
      var thr = global.CrozzoCloudThrottle;
      return !!(thr && typeof thr.isUnderPressure === 'function' && thr.isUnderPressure());
    } catch (_) {
      return false;
    }
  }

  function rtResubscribeDelayMs() {
    try {
      var thr = global.CrozzoCloudThrottle;
      if (thr && typeof thr.resubscribeDelayMs === 'function') return thr.resubscribeDelayMs(__rtResubAttempt);
    } catch (_) {}
    return 2500 + __rtResubAttempt * 900;
  }

  var __comandaTeardownTimer = null;
  var __comandaSubscribing = false;

  function cloudWanReady() {
    try {
      if (typeof global.crozzoCloudWanReady === 'function') return global.crozzoCloudWanReady();
      if (typeof global.crozzoTierAllowsCloudSync === 'function') return global.crozzoTierAllowsCloudSync();
    } catch (_) {}
    return false;
  }

  function teardownComandaChannel(opts) {
    opts = opts || {};
    var oldCh = global.__crozzoComandaCloudCh;
    global.__crozzoComandaCloudCh = null;
    var wasLive = __realtimeLive;
    __realtimeLive = false;
    if (!oldCh || !global.__SUPABASE) return;
    if (opts.skipRemove || !wasLive) return;
    if (__comandaTeardownTimer) global.clearTimeout(__comandaTeardownTimer);
    __comandaTeardownTimer = global.setTimeout(function () {
      __comandaTeardownTimer = null;
      try {
        global.__SUPABASE.removeChannel(oldCh);
      } catch (_) {}
    }, 0);
  }

  function scheduleComandaRealtimeResubscribe(reason) {
    if (__rtResubTimer) return;
    __rtResubAttempt = Math.min((__rtResubAttempt || 0) + 1, 14);
    var ms = rtResubscribeDelayMs();
    __rtResubTimer = global.setTimeout(function () {
      __rtResubTimer = null;
      if (!online() || !tierAllowsCloudRead()) return;
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
      if (typeof global.crozzoCloudSyncSessionGateOpen === 'function' && !global.crozzoCloudSyncSessionGateOpen()) {
        return false;
      }
    } catch (_) {}
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

  /** Push LAN paralelo solo cuando la nube no lleva el transporte o está degradada. */
  function lanParallelPushNeeded() {
    if (!lanSegmentLikely()) return false;
    if (cloudUnderPressure()) return true;
    if (!tierAllowsCloudPush()) return true;
    try {
      if (typeof global.crozzoActiveSyncTransport === 'function') {
        if (global.crozzoActiveSyncTransport({ kind: 'transport' }) === 'lan') return true;
      }
    } catch (_) {}
    try {
      if (typeof global.crozzoCloudOperationalRealtimeHealthy === 'function') {
        if (global.crozzoCloudOperationalRealtimeHealthy(40000)) return false;
      }
    } catch (_) {}
    try {
      if (typeof global.crozzoCloudWanReady === 'function' && global.crozzoCloudWanReady()) {
        return false;
      }
    } catch (_) {}
    return true;
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

  function readPrintedPersist() {
    try {
      var raw = global.localStorage.getItem(PRINTED_LS_KEY);
      var o = raw ? JSON.parse(raw) : {};
      return o && typeof o === 'object' ? o : {};
    } catch (_) {
      return {};
    }
  }

  function writePrintedPersist(map) {
    try {
      global.localStorage.setItem(PRINTED_LS_KEY, JSON.stringify(map || {}));
    } catch (_) {}
  }

  function persistPrintedKey(tid) {
    if (!tid) return;
    var key = String(tid);
    var map = readPrintedPersist();
    map[key] = Date.now();
    var cutoff = Date.now() - PRINTED_LS_TTL_MS;
    Object.keys(map).forEach(function (k) {
      if (!map[k] || map[k] < cutoff) delete map[k];
    });
    writePrintedPersist(map);
  }

  global.__crozzoComandaMarkPrinted = function (tid) {
    if (!tid) return;
    __printedTids[String(tid)] = Date.now();
    persistPrintedKey(tid);
  };

  global.__crozzoComandaWasPrintedPersisted = function (tid, maxMs) {
    if (!tid) return false;
    maxMs = maxMs || PRINTED_LS_TTL_MS;
    var map = readPrintedPersist();
    var t = map[String(tid)];
    return !!(t && Date.now() - t < maxMs);
  };

  global.__crozzoComandaInBootPrintGrace = function () {
    return Date.now() - (global.__crozzoPosBootAt || 0) < BOOT_PRINT_GRACE_MS;
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

  var OUTBOX_LS_KEY = 'crozzo_comanda_outbox_v1';
  var __outbox = {};
  var __outboxTimer = null;
  var __outboxLoaded = false;
  var OUTBOX_BASE_MS = 2500;
  var OUTBOX_MAX_MS = 30000;
  var OUTBOX_MAX_AGE_MS = 6 * 60 * 60 * 1000;
  var OUTBOX_BATCH_NORMAL = 2;
  var __comandaPushChain = Promise.resolve();

  function outboxKey(c) {
    if (!c) return '';
    return String(c.transaction_id || c.id || '');
  }

  function loadOutbox() {
    if (__outboxLoaded) return;
    __outboxLoaded = true;
    try {
      var raw = global.localStorage.getItem(OUTBOX_LS_KEY);
      if (!raw) return;
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return;
      arr.forEach(function (e) {
        if (!e || (e.id == null && !e.tid)) return;
        var k = String(e.tid || e.id);
        __outbox[k] = {
          id: e.id,
          tid: e.tid || '',
          attempts: Number(e.attempts) || 0,
          firstAt: Number(e.firstAt) || Date.now(),
          nextAt: 0,
          lastErr: '',
        };
      });
    } catch (_) {}
  }

  function persistOutbox() {
    try {
      var arr = Object.keys(__outbox).map(function (k) {
        var e = __outbox[k];
        return { id: e.id, tid: e.tid, attempts: e.attempts, firstAt: e.firstAt };
      });
      if (arr.length) global.localStorage.setItem(OUTBOX_LS_KEY, JSON.stringify(arr));
      else global.localStorage.removeItem(OUTBOX_LS_KEY);
    } catch (_) {}
  }

  function outboxPending() {
    return Object.keys(__outbox).length;
  }

  function outboxEnqueue(comanda) {
    loadOutbox();
    if (!comanda) return;
    var k = outboxKey(comanda);
    if (!k) return;
    var existing = __outbox[k];
    __outbox[k] = {
      id: comanda.id,
      tid: String(comanda.transaction_id || ''),
      attempts: existing ? existing.attempts : 0,
      firstAt: existing ? existing.firstAt : Date.now(),
      nextAt: 0,
      lastErr: existing ? existing.lastErr : '',
    };
    persistOutbox();
    if (tierAllowsCloudPush()) scheduleOutboxDrain(600);
  }

  function outboxRemove(key) {
    if (__outbox[key]) {
      delete __outbox[key];
      persistOutbox();
    }
  }

  function outboxFindComanda(e) {
    if (!e) return null;
    var c = findComanda(e.id);
    if (c) return c;
    if (e.tid) {
      var list = global.comandas || [];
      for (var i = 0; i < list.length; i++) {
        if (list[i] && String(list[i].transaction_id) === e.tid) return list[i];
      }
    }
    return null;
  }

  async function drainOutbox() {
    __outboxTimer = null;
    if (__outboxDraining) return;
    var keys = Object.keys(__outbox);
    if (!keys.length) return;
    var cloudOk = online() && tierAllowsCloudPush();
    var lanOk = lanSegmentLikely();
    if (!cloudOk && !lanOk) {
      return;
    }
    if (cloudOk && cloudUnderPressure()) {
      scheduleOutboxDrain(12000);
      return;
    }
    __outboxDraining = true;
    try {
      var now = Date.now();
      var processed = 0;
      for (var i = 0; i < keys.length; i++) {
        if (cloudOk && cloudUnderPressure()) break;
        if (processed >= OUTBOX_BATCH_NORMAL) break;
        var k = keys[i];
        var e = __outbox[k];
        if (!e) continue;
        if (now - e.firstAt > OUTBOX_MAX_AGE_MS) {
          outboxRemove(k);
          continue;
        }
        if (e.nextAt && e.nextAt > now) continue;
        var c = outboxFindComanda(e);
        if (!c) {
          outboxRemove(k);
          continue;
        }
        var ok = false;
        if (cloudOk) {
          try {
            ok = await pushComanda(c, { estado: c.estado, lastUpdateAt: c.lastUpdateAt });
          } catch (err) {
            ok = false;
            e.lastErr = String((err && err.message) || err || '');
            noteCloudErr(err);
          }
        }
        if (!ok && lanOk) {
          try {
            ok = await pushComandaLan(c);
          } catch (_) {
            ok = false;
          }
        }
        processed++;
        if (ok) {
          outboxRemove(k);
        } else {
          e.attempts = (e.attempts || 0) + 1;
          var backoff = Math.min(OUTBOX_MAX_MS, OUTBOX_BASE_MS * Math.pow(1.7, Math.min(e.attempts, 8)));
          e.nextAt = Date.now() + backoff;
          persistOutbox();
          if (cloudUnderPressure()) break;
        }
      }
      if (outboxPending() && (cloudOk || lanOk)) {
        scheduleOutboxDrain(cloudOk && cloudUnderPressure() ? 12000 : OUTBOX_BASE_MS);
      }
    } finally {
      __outboxDraining = false;
    }
  }

  function scheduleOutboxDrain(ms) {
    if (!outboxPending()) return;
    var cloudOk = online() && tierAllowsCloudPush();
    var lanOk = lanSegmentLikely();
    if (!cloudOk && !lanOk) return;
    if (cloudUnderPressure()) {
      ms = Math.max(ms || 0, 12000);
    }
    if (__outboxTimer) return;
    __outboxTimer = global.setTimeout(function () {
      drainOutbox().catch(function () {});
    }, Math.max(250, ms || OUTBOX_BASE_MS));
  }

  function activePosPage() {
    var pg = '';
    try {
      if (typeof global.crozzoGetActivePageId === 'function') {
        pg = String(global.crozzoGetActivePageId() || '').trim();
        if (pg) return pg;
      }
    } catch (_) {}
    try {
      if (global.CrozzoPageCloudWatch && typeof global.CrozzoPageCloudWatch.getActivePage === 'function') {
        pg = String(global.CrozzoPageCloudWatch.getActivePage() || '').trim();
        if (pg) return pg;
      }
    } catch (_) {}
    try {
      if (typeof global.currentPage !== 'undefined') pg = String(global.currentPage || '').trim();
    } catch (_) {}
    return pg || '';
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

  function scheduleComandaOperationalUiRefresh() {
    try {
      var pg = activePosPage();
      if (pg === 'cajero' || pg === 'tablets') {
        if (typeof global.crozzoHandleRemoteRuntimeUiSync === 'function') {
          global.crozzoHandleRemoteRuntimeUiSync();
        }
        if (typeof global.crozzoPullPosRuntimeCloud === 'function') {
          global.crozzoPullPosRuntimeCloud({ quiet: true, skipRender: true }).catch(function () {});
        }
        return;
      }
      if (pg !== 'comandas' && pg !== 'cocina') return;
      if (typeof global.crozzoPatchOperationalPageFromRemote === 'function') {
        if (global.crozzoPatchOperationalPageFromRemote(pg)) return;
      }
      scheduleComandaPageRefresh();
    } catch (_) {}
  }

  function scheduleComandaUiIfKitchen() {
    scheduleComandaOperationalUiRefresh();
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
    if (typeof global.crozzoLanTransportAllowed === 'function' && !global.crozzoLanTransportAllowed()) {
      return false;
    }
    var md = typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
    if (!md || md.role === 'A') return false;
    var ip = String(md.centralIp || '').trim();
    if (!ip) return false;
    var port = Number(md.port) || 3000;
    var ctx = cloudCtx();
    var body = {
      uuid: String(comanda.transaction_id || comanda.id || ''),
      action_id: String(comanda.transaction_id || comanda.id || ''),
      businessId: ctx.businessId,
      deviceId: ctx.deviceId,
      location_id: ctx.locationId,
      type: 'comanda',
      data: fullComandaLanPayload(comanda),
    };
    if (typeof global.crozzoLanEnsureActionId === 'function') global.crozzoLanEnsureActionId(body);
    try {
      if (typeof global.crozzoLanPostSync === 'function') {
        return !!(await global.crozzoLanPostSync(body, { timeoutMs: 5500 }));
      }
      return false;
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

  async function pushComandaInner(comanda, opts) {
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
        // 409 Conflict en comandas: el registro ya existe con datos más nuevos.
        // No es un error crítico — el dato ya está en la nube.
        var errStatus = (res.error && (res.error.status || res.error.code)) || 0;
        var errMsg = String((res.error && res.error.message) || res.error || '');
        if (errStatus === 409 || /409|conflict/i.test(errMsg)) {
          return true;
        }
        console.warn('[crozzo-comanda-cloud] push', res.error.message || res.error);
        noteCloudErr(res.error);
        return false;
      }
      try {
        if (typeof global.crozzoOpsPulseEmit === 'function') global.crozzoOpsPulseEmit('comanda');
      } catch (_) {}
      return true;
    } catch (e) {
      console.warn('[crozzo-comanda-cloud] push', e);
      noteCloudErr(e);
      return false;
    }
  }

  function pushComanda(comanda, opts) {
    if (cloudUnderPressure() || !tierAllowsCloudPush()) {
      if (lanSegmentLikely()) return pushComandaLan(comanda);
      return Promise.resolve(false);
    }
    var run = function () {
      return pushComandaInner(comanda, opts);
    };
    var p = __comandaPushChain.then(run, run);
    __comandaPushChain = p.catch(function () {});
    return p;
  }

  function pushComandasByIds(ids) {
    if (!Array.isArray(ids) || !ids.length) return;
    var lanExtra = lanParallelPushNeeded();
    ids.forEach(function (id) {
      var c = findComanda(id);
      if (!c) return;
      outboxEnqueue(c);
      if (lanExtra) pushComandaLan(c).catch(function () {});
    });
    if (outboxPending() && (tierAllowsCloudPush() || lanExtra)) scheduleOutboxDrain(lanExtra ? 600 : 1200);
  }

  async function pushComandaEstadoLan(comanda, estado) {
    if (!comanda) return false;
    if (typeof global.crozzoLanTransportAllowed === 'function' && !global.crozzoLanTransportAllowed()) {
      return false;
    }
    var md = typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
    if (!md || md.role === 'A') return false;
    var ip = String(md.centralIp || '').trim();
    if (!ip) return false;
    var port = Number(md.port) || 3000;
    var ctx = cloudCtx();
    var estActionId =
      String(comanda.transaction_id || comanda.id || '') +
      ':' +
      String(estado || comanda.estado || '') +
      ':' +
      String(comanda.lastUpdateAt || new Date().toISOString());
    var body = {
      uuid: estActionId,
      action_id: estActionId,
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
    if (typeof global.crozzoLanEnsureActionId === 'function') global.crozzoLanEnsureActionId(body);
    try {
      if (typeof global.crozzoLanPostSync === 'function') {
        return !!(await global.crozzoLanPostSync(body, { timeoutMs: 5500 }));
      }
      return false;
    } catch (e) {
      if (typeof global.crozzoNoteLanFetchPressure === 'function') global.crozzoNoteLanFetchPressure(e);
      if (typeof global.crozzoSignalLanTrouble === 'function') global.crozzoSignalLanTrouble();
      return false;
    }
  }

  function fanoutComandaEstado(comanda, estado) {
    if (!comanda) return;
    var est = estado || comanda.estado;
    var lanExtra = lanParallelPushNeeded();
    outboxEnqueue(comanda);
    if (lanExtra) {
      pushComandaEstadoLan(comanda, est).catch(function () {});
      try {
        if (global.CrozzoLanWebSocketBridge && typeof global.CrozzoLanWebSocketBridge.notifyEstado === 'function') {
          global.CrozzoLanWebSocketBridge.notifyEstado(comanda, est);
        }
      } catch (_) {}
      try {
        if (typeof global.crozzoActivateLocalSyncPath === 'function') {
          global.crozzoActivateLocalSyncPath('comanda_estado').catch(function () {});
        }
      } catch (_) {}
    }
    if (tierAllowsCloudPush() && !cloudUnderPressure()) {
      scheduleOutboxDrain(450);
    } else if (!lanExtra) {
      var tier = tierNow();
      if (tier === 'offline' || tier === 'mesh') {
        try {
          if (global.CrozzoOfflineGossip && typeof global.CrozzoOfflineGossip.publishEstado === 'function') {
            global.CrozzoOfflineGossip.publishEstado(comanda.id, est, comanda.transaction_id);
          }
        } catch (_) {}
      }
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
        global.crozzoScheduleOperationalPageRefresh(activePosPage());
        return;
      }
    } catch (_) {}
    var pgRefresh = activePosPage();
    if (
      typeof global.renderPage === 'function' &&
      (pgRefresh === 'comandas' || pgRefresh === 'cocina')
    ) {
      try {
        global.renderPage(pgRefresh);
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

  function tryAutoPrintMerged(merged, opts, reason) {
    if (!merged || opts.skipPrint || opts.silent) return false;
    if (global.__crozzoComandaInBootPrintGrace && global.__crozzoComandaInBootPrintGrace()) return false;
    var printKey = merged.transaction_id || String(merged.id || '');
    if (printKey && global.__crozzoComandaWasPrintedPersisted && global.__crozzoComandaWasPrintedPersisted(printKey)) {
      return false;
    }
    if (merged.printed_at || merged.printed_by) {
      if (printKey && global.__crozzoComandaMarkPrinted) global.__crozzoComandaMarkPrinted(printKey);
      return false;
    }
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
    if (pay.printed_by && pay.printed_at) {
      try {
        var printKey = pay.transaction_id || String(pay.id || '');
        if (printKey && typeof global.__crozzoComandaMarkPrinted === 'function') {
          global.__crozzoComandaMarkPrinted(printKey);
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
    if (!isOwnPush && !recentOwn && merged && !opts.skipPrint && !opts.silent && (isNew || itemsChanged)) {
      shouldPrint = tryAutoPrintMerged(merged, opts, isNew ? 'new' : 'items');
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
    if (!opts.skipRender) {
      scheduleComandaOperationalUiRefresh();
    }
    return true;
  }

  function reconcileStaleLocalComandas(cloudRows) {
    var activeTids = {};
    var activeIds = {};
    (cloudRows || []).forEach(function (r) {
      if (!r) return;
      var pay = r.payload || {};
      var tid = String(pay.transaction_id || r.id || '').trim();
      if (tid) activeTids[tid] = 1;
      if (pay.id != null) activeIds[String(pay.id)] = 1;
      if (r.id != null) activeIds[String(r.id)] = 1;
    });
    var pendingKeys = {};
    Object.keys(__outbox).forEach(function (k) {
      pendingKeys[String(k)] = 1;
      var e = __outbox[k];
      if (e && e.tid) pendingKeys[String(e.tid)] = 1;
      if (e && e.id != null) pendingKeys[String(e.id)] = 1;
    });
    if (typeof global.crozzoRemoveStaleComandas === 'function') {
      return global.crozzoRemoveStaleComandas(activeTids, activeIds, pendingKeys, 120000);
    }
    return false;
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
      if (opts && opts.reconcileStale) {
        try {
          if (reconcileStaleLocalComandas(rows)) anyChanged = true;
        } catch (_) {}
      }
      if (anyChanged) {
        var pgPull = activePosPage();
        if (pgPull === 'comandas' || pgPull === 'cocina') scheduleComandaUiIfKitchen();
      }
      return anyChanged;
    } catch (e) {
      console.warn('[crozzo-comanda-cloud] pull', e);
      return false;
    }
  }

  async function purgeDeliveredComandasFromCloud(opts) {
    opts = opts || {};
    if (!tierAllowsCloudPush()) return { purged: 0 };
    if (!opts.force && !opts.catchUp && cloudUnderPressure()) return { purged: 0, skipped: 'pressure' };
    var now = Date.now();
    try {
      if (!opts.force && !opts.catchUp && global.CrozzoComandaArchive && global.CrozzoComandaArchive.status) {
        var st = global.CrozzoComandaArchive.status();
        var last = (st.meta && st.meta.lastCloudPurgeAt) || 0;
        if (last && now - last < COMANDA_PURGE_INTERVAL_MS) {
          return { purged: 0, skipped: 'throttle' };
        }
      }
    } catch (_) {}
    var ctx = cloudCtx();
    if (!tenantIdsReady(ctx)) return { purged: 0 };
    var sb = global.__SUPABASE;
    if (!sb) return { purged: 0 };
    var cutoff = new Date(now - COMANDA_CLOUD_RETENTION_MS).toISOString();
    var maxBatches = opts.catchUp ? PURGE_MAX_BATCHES_CATCHUP : opts.force ? PURGE_MAX_BATCHES * 2 : PURGE_MAX_BATCHES;
    var totalPurged = 0;
    var batches = 0;
    try {
      while (batches < maxBatches) {
        if (batches > 0 && cloudUnderPressure()) break;
        var q = sb
          .from('comandas')
          .select('id,status,payload,updated_at')
          .eq('status', 'entregada')
          .lt('updated_at', cutoff)
          .order('updated_at', { ascending: true })
          .limit(PURGE_BATCH_SIZE);
        if (ctx.businessId) q = q.eq('business_id', ctx.businessId);
        if (ctx.locationId && ctx.locationId !== 'default') q = q.eq('location_id', ctx.locationId);
        var res = await q;
        if (res.error) {
          noteCloudErr(res.error);
          return { purged: totalPurged, error: res.error.message || String(res.error), batches: batches };
        }
        var rows = res.data || [];
        if (!rows.length) break;
        for (var i = 0; i < rows.length; i++) {
          var row = rows[i];
          var pay = row.payload && typeof row.payload === 'object' ? row.payload : {};
          if (typeof global.crozzoArchiveComandaToHistory === 'function') {
            global.crozzoArchiveComandaToHistory(
              Object.assign({}, pay, { id: pay.id != null ? pay.id : row.id, estado: 'entregada' }),
              'cloud_purge_12h'
            );
          }
        }
        var ids = rows
          .map(function (r) { return r.id; })
          .filter(Boolean);
        if (!ids.length) break;
        var del = await sb.from('comandas').delete().in('id', ids);
        if (del.error) {
          noteCloudErr(del.error);
          return { purged: totalPurged, error: del.error.message || String(del.error), batches: batches };
        }
        totalPurged += ids.length;
        batches++;
        if (rows.length < PURGE_BATCH_SIZE) break;
      }
      if (totalPurged > 0) {
        try {
          if (global.CrozzoComandaArchive && typeof global.CrozzoComandaArchive.flushPendingToArchives === 'function') {
            await global.CrozzoComandaArchive.flushPendingToArchives(true);
          }
        } catch (_) {}
      }
      try {
        if (global.CrozzoComandaArchive && typeof global.CrozzoComandaArchive.noteCloudPurgeAt === 'function') {
          global.CrozzoComandaArchive.noteCloudPurgeAt();
        }
      } catch (_) {}
      if (totalPurged > 0) {
        try {
          console.log(
            '[crozzo-comanda-cloud] purge entregadas >12h: ' +
              totalPurged +
              ' filas (' +
              batches +
              ' lote(s), incluye antiguas fuera de tope)'
          );
        } catch (_) {}
      }
      return { purged: totalPurged, batches: batches };
    } catch (e) {
      noteCloudErr(e);
      return { purged: totalPurged, error: String(e && e.message ? e.message : e), batches: batches };
    }
  }

  function scheduleComandaCloudPurge() {
    if (__comandaPurgeTimer) return;
    __comandaPurgeTimer = global.setInterval(function () {
      if (!__started || !tierAllowsCloudPush()) return;
      purgeDeliveredComandasFromCloud().catch(function () {});
    }, COMANDA_PURGE_INTERVAL_MS);
    if (!global.__crozzoComandaPurgeCatchUpDone) {
      global.__crozzoComandaPurgeCatchUpDone = true;
      global.setTimeout(function () {
        if (!__started || !tierAllowsCloudPush()) return;
        purgeDeliveredComandasFromCloud({ catchUp: true }).catch(function () {});
      }, 180000);
    }
  }

  function stopComandaCloudPurge() {
    if (__comandaPurgeTimer) {
      global.clearInterval(__comandaPurgeTimer);
      __comandaPurgeTimer = null;
    }
  }

  var POLL_PRINT_WINDOW_MS = 8 * 60 * 1000;

  function scheduleComandaPull() {
    if (cloudUnderPressure()) {
      if (__pullTimer) {
        global.clearInterval(__pullTimer);
        __pullTimer = null;
      }
      return;
    }
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
      if (cloudUnderPressure()) return;
      try {
        if (typeof global.crozzoOperationalRealtimeActive === 'function' && !global.crozzoOperationalRealtimeActive()) {
          return;
        }
      } catch (_) {}
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
    if (__comandaSubscribing) return;
    if (__realtimeLive && global.__crozzoComandaCloudCh) return;
    var ctx = cloudCtx();
    if (!tenantIdsReady(ctx)) {
      try {
        console.warn('[crozzo-comanda-cloud] Realtime omitido: configure businessId y locationId');
      } catch (_) {}
      return;
    }
    teardownComandaChannel({ skipRemove: !__realtimeLive });
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
    if (__comandaSubscribing) return;
    var ctx = cloudCtx();
    if (!tenantIdsReady(ctx)) return;
    __comandaSubscribing = true;
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
        if (!tierAllowsCloudRead()) return;
        __lastRtEventAt = Date.now();
        rtLog('[crozzo-rt] INSERT comanda', payload.new && payload.new.id);
        var applied = !!(
          payload.new &&
          applyComandaFromCloudRow(payload.new, {
            skipPrint: global.__crozzoComandaInBootPrintGrace && global.__crozzoComandaInBootPrintGrace(),
            skipRender: false,
          })
        );
        rtLog('[crozzo-rt] INSERT aplicado:', applied);
        scheduleComandaUiIfKitchen();
      });
      ch.on('postgres_changes', updOpts, function (payload) {
        if (!tierAllowsCloudRead()) return;
        if (!payload.new) return;
        __lastRtEventAt = Date.now();
        rtLog('[crozzo-rt] UPDATE comanda', payload.new.id, payload.new.status);
        var st = String(payload.new.status || (payload.new.payload && payload.new.payload.estado) || '');
        if (st === 'entregada') {
          if (applyComandaRemovedFromCloud(payload.new.payload || {}, payload.new)) {
            scheduleComandaUiIfKitchen();
          }
          return;
        }
        var applied2 = applyComandaFromCloudRow(payload.new, {
          skipPrint: global.__crozzoComandaInBootPrintGrace && global.__crozzoComandaInBootPrintGrace(),
          skipRender: false,
        });
        if (applied2) rtLog('[crozzo-rt] UPDATE aplicado:', applied2);
        scheduleComandaUiIfKitchen();
      });
      ch.subscribe(function (status) {
        rtLog('[crozzo-rt] canal estado:', status);
        if (status === 'SUBSCRIBED') {
          __realtimeLive = true;
          __rtResubAttempt = 0;
          try {
            var thrOk = global.CrozzoCloudThrottle;
            if (thrOk && typeof thrOk.maybeClearPressureOnHealthySignal === 'function') {
              thrOk.maybeClearPressureOnHealthySignal('subscribed');
            }
          } catch (_) {}
          scheduleComandaPull();
        } else if (status === 'CHANNEL_ERROR' || status === 'CLOSED' || status === 'TIMED_OUT') {
          __realtimeLive = false;
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            try {
              if (typeof global.crozzoNoteWanUnreachable === 'function') {
                global.crozzoNoteWanUnreachable('comanda_realtime_' + status);
              }
            } catch (_) {}
          }
          scheduleComandaPull();
          // ── Delay anti-flapping antes de reaccionar al CLOSED ────────────
          // ANTES: setTimeout(..., 0) → evaluaba tier en el mismo tick que el
          // orchestrator lo cambió → siempre false → stopComandasCloudSync()
          // → loop SUBSCRIBED→CLOSED.
          // AHORA: RT_CLOSED_REACT_MS (2500 ms) da tiempo al orchestrator de
          // estabilizar su estado. Si el tier sigue sin cloud después de ese
          // tiempo, la decisión de parar es real y no un parpadeo.
          global.setTimeout(function () {
            if (!tierAllowsCloudRead() || !cloudWanReady()) {
              stopComandasCloudSync();
              return;
            }
            if (cloudUnderPressure()) return;
            scheduleComandaRealtimeResubscribe(status);
          }, RT_CLOSED_REACT_MS);
          console.warn('[crozzo-comanda-cloud] realtime ' + status + (reason ? ' (' + reason + ')' : ''));
        }
      });
      global.__crozzoComandaCloudCh = ch;
    } catch (e) {
      console.warn('[crozzo-comanda-cloud] subscribe', e);
      noteCloudErr(e);
      scheduleComandaRealtimeResubscribe('exception');
    } finally {
      __comandaSubscribing = false;
    }
  }

  function scheduleStartRetry(ms) {
    if (__startRetryTimer) return;
    if (cloudUnderPressure()) return;
    __startRetryTimer = global.setTimeout(function () {
      __startRetryTimer = null;
      if (cloudUnderPressure()) return;
      if (tierAllowsCloudRead()) startComandasCloudSync();
    }, Math.max(400, ms || 1200));
  }

  function startComandasCloudSync() {
    if (__started) {
      if (!tierAllowsCloudRead()) {
        stopComandasCloudSync();
        return;
      }
      if (!__realtimeLive) subscribeComandaRealtime('refresh');
      return;
    }
    if (!tierAllowsCloudRead()) {
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

    loadOutbox();
    if (outboxPending() && (tierAllowsCloudPush() || lanSegmentLikely())) scheduleOutboxDrain(300);

    pullComandasFromCloud({ skipPrint: true, skipRender: true, silent: true, reconcileStale: true }).catch(function () {});

    scheduleComandaPull();
    global.setTimeout(function () {
      if (!__started || !tierAllowsCloudRead() || !global.__SUPABASE) return;
      subscribeComandaRealtime('start');
    }, 900);
    scheduleComandaCloudPurge();
  }

  function stopComandasCloudSync() {
    __started = false;
    stopComandaCloudPurge();
    __comandaSubscribing = false;
    if (__startRetryTimer) {
      global.clearTimeout(__startRetryTimer);
      __startRetryTimer = null;
    }
    if (__outboxTimer) {
      global.clearTimeout(__outboxTimer);
      __outboxTimer = null;
    }
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
    var lanExtra = lanParallelPushNeeded();
    if (lanExtra) {
      try {
        if (typeof global.crozzoActivateLocalSyncPath === 'function') {
          global.crozzoActivateLocalSyncPath('comanda_new').catch(function () {});
        }
      } catch (_) {}
    }
    pushComandasByIds(ids);
    if (lanExtra) {
      try {
        if (global.CrozzoLanWebSocketBridge && typeof global.CrozzoLanWebSocketBridge.notifyComandasByIds === 'function') {
          global.CrozzoLanWebSocketBridge.notifyComandasByIds(ids);
        }
      } catch (_) {}
    }
    if (!lanExtra && !tierAllowsCloudPush()) {
      var tier = tierNow();
      if (tier === 'offline' || tier === 'mesh') {
        try {
          if (global.CrozzoOfflineGossip && typeof global.CrozzoOfflineGossip.publishComandaNewByIds === 'function') {
            global.CrozzoOfflineGossip.publishComandaNewByIds(ids);
          }
        } catch (_) {}
      }
    }
  }

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

  global.crozzoReconcileStaleLocalComandas = reconcileStaleLocalComandas;
  global.crozzoFanoutComandasByIds = fanoutComandasByIds;
  global.crozzoFanoutComandaEstado = fanoutComandaEstado;
  global.crozzoPushComandaToCloud = pushComanda;
  global.crozzoPushComandasCloudByIds = pushComandasByIds;
  global.crozzoPushComandasLanByIds = pushComandasLanByIds;
  global.crozzoPullComandasFromCloud = pullComandasFromCloud;
  global.crozzoPurgeDeliveredComandasFromCloud = purgeDeliveredComandasFromCloud;
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
  global.crozzoFlushComandaOutbox = function () {
    var cloudOk = tierAllowsCloudPush();
    var lanOk = lanSegmentLikely();
    if (!cloudOk && !lanOk) return false;
    if (cloudOk && cloudUnderPressure()) return outboxPending();
    loadOutbox();
    if (outboxPending()) {
      if (__outboxTimer) {
        global.clearTimeout(__outboxTimer);
        __outboxTimer = null;
      }
      scheduleOutboxDrain(800);
    }
    return outboxPending();
  };
  global.crozzoScheduleComandaOutboxLanDrain = function () {
    loadOutbox();
    if (!outboxPending()) return;
    if (__outboxTimer) return;
    scheduleOutboxDrain(lanSegmentLikely() ? 400 : 1200);
  };
  global.crozzoComandaOutboxStatus = function () {
    loadOutbox();
    var keys = Object.keys(__outbox);
    return {
      pending: keys.length,
      entries: keys.map(function (k) {
        var e = __outbox[k];
        return { id: e.id, tid: e.tid, attempts: e.attempts, ageMs: Date.now() - e.firstAt, lastErr: e.lastErr || '' };
      }),
    };
  };

  if (!global.__crozzoComandaCloudTierBound) {
    global.__crozzoComandaCloudTierBound = true;
    var onTierShift = function () {
      try {
        if (!tierAllowsCloudRead()) {
          stopComandasCloudSync();
          return;
        }
        if (!__started) startComandasCloudSync();
        else if (!__realtimeLive) subscribeComandaRealtime('tier_up');
        if (outboxPending() && (tierAllowsCloudPush() || lanSegmentLikely()) && !cloudUnderPressure()) {
          scheduleOutboxDrain(1200);
        }
      } catch (_) {}
    };
    global.addEventListener('crozzo-tier-changed', onTierShift);
    global.addEventListener('crozzo-detector-tier-changed', onTierShift);
  }
})(typeof window !== 'undefined' ? window : globalThis);
