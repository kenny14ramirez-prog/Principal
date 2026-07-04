/**
 * Crozzo — Sincronización con nube según la pantalla activa y prioridades.
 *
 * P0 · Realtime: runtime/comandas (PosRuntimeCloud + ComandasCloudSync).
 * P1 · Nav: pull al entrar, push al salir (facturas, cierre caja, inicio).
 * P2 · Background: catálogo/tenant con intervalos largos + scheduler global.
 *
 * Realtime global sigue en módulos existentes; aquí solo respaldo y nav.
 */
(function (global) {
  'use strict';

  var SP = global.CrozzoCloudSyncPriorities;
  var TICK_MS = 1800;
  var TICK_IDLE_MS = 4200;
  var TICK_ACTIVE_MS = 1400;
  var __lastSoftProbeAt = 0;
  var SOFT_PROBE_GAP_MS = 16000;
  var __activePage = '';
  var __prevPage = '';
  var __tickTimer = null;
  var __running = false;
  var __stamps = {};
  var __lastPullAt = {};
  var __lastProbeAt = {};

  function pri() {
    return SP || {
      P0: 0,
      P1: 1,
      P2: 2,
      resolvePage: function (p) {
        return String(p || '').trim();
      },
      resolvePageSyncPlan: function (p) {
        return { page: String(p || ''), priority: 2, profile: null };
      },
      getPageProfile: function () {
        return null;
      },
      getDomainPriority: function () {
        return 2;
      },
      domainIntervalMs: function (_d, _p, ms) {
        return ms || 30000;
      },
      isOperationalPage: function () {
        return false;
      },
      isNavPage: function () {
        return false;
      },
      getPageZone: function () {
        return 1;
      },
      Z0: 0,
      Z1: 1,
      Z3: 3,
      onPageLeave: function () {},
      onPageEnter: function () {},
      startBackgroundScheduler: function () {},
    };
  }

  function canonPage(page) {
    return pri().resolvePage ? pri().resolvePage(page) : String(page || '').trim();
  }

  function pageProfiles() {
    return (pri().PAGE_PROFILES || {});
  }

  function syncPlan(page) {
    if (pri().resolvePageSyncPlan) return pri().resolvePageSyncPlan(page);
    return { page: canonPage(page), priority: 2, profile: pageProfiles()[canonPage(page)] };
  }

  function notifyRuntimeUiApplied() {
    safe(function () {
      if (typeof global.crozzoHandleRemoteRuntimeUiSync === 'function') {
        global.crozzoHandleRemoteRuntimeUiSync();
      } else if (typeof global.crozzoScheduleOperationalPageRefresh === 'function') {
        global.crozzoScheduleOperationalPageRefresh(__activePage);
      }
    });
  }

  function notifyComandasUiApplied() {
    safe(function () {
      var onKitchen = __activePage === 'comandas' || __activePage === 'cocina';
      if (onKitchen && typeof global.crozzoPatchOperationalPageFromRemote === 'function') {
        if (global.crozzoPatchOperationalPageFromRemote(__activePage)) return;
      }
      if (typeof global.crozzoScheduleOperationalPageRefresh === 'function') {
        global.crozzoScheduleOperationalPageRefresh(__activePage);
      }
    });
  }

  function safe(fn) {
    try {
      return fn();
    } catch (_) {
      return undefined;
    }
  }

  function onlineReady() {
    if (
      typeof global.crozzoTierAllowsCloudSync === 'function' &&
      !global.crozzoTierAllowsCloudSync()
    ) {
      return false;
    }
    return (
      typeof global.crozzoOnlineConfigReady === 'function' &&
      global.crozzoOnlineConfigReady() &&
      global.__SUPABASE
    );
  }

  async function ensureClient() {
    if (!onlineReady()) return false;
    if (typeof global.crozzoEnsureCloudClientReady === 'function') {
      return !!(await global.crozzoEnsureCloudClientReady());
    }
    return !!global.__SUPABASE;
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
    return {
      businessId: String(md.businessId || 'default').trim() || 'default',
      locationId: loc,
    };
  }

  function throttleBlocks() {
    var thr = global.CrozzoCloudThrottle;
    return !!(thr && typeof thr.isUnderPressure === 'function' && thr.isUnderPressure());
  }

  function domainDue(domain, intervalMs) {
    var last = __lastProbeAt[domain] || 0;
    var gap = pri().domainIntervalMs(domain, __activePage, intervalMs);
    if (throttleBlocks()) gap = Math.min(gap * 3, 120000);
    return Date.now() - last >= gap;
  }

  function markProbe(domain) {
    __lastProbeAt[domain] = Date.now();
  }

  function stampChanged(domain, stamp) {
    if (!stamp) return false;
    var prev = __stamps[domain] || 0;
    if (!prev) {
      __stamps[domain] = stamp;
      return false;
    }
    if (stamp > prev) {
      __stamps[domain] = stamp;
      return true;
    }
    return false;
  }

  async function probeMaxUpdated(table, buildQuery) {
    var sb = global.__SUPABASE;
    if (!sb) return { ok: false, stamp: 0 };
    try {
      var q = sb.from(table).select('updated_at').order('updated_at', { ascending: false }).limit(1);
      if (buildQuery) q = buildQuery(q);
      var res = await q;
      if (res.error) return { ok: false, stamp: 0, error: res.error };
      var row = res.data && res.data[0];
      var stamp = row && row.updated_at ? Date.parse(row.updated_at) || 0 : 0;
      return { ok: true, stamp: stamp };
    } catch (e) {
      return { ok: false, stamp: 0, error: e };
    }
  }

  async function probeRuntime() {
    markProbe('runtime');
    var c = cloudCtx();
    if (!c.locationId || c.locationId === 'default') return { changed: false };
    var sb = global.__SUPABASE;
    try {
      var mesa = await probeMaxUpdated('crozzo_mesa_runtime', function (q) {
        return q.eq('location_id', c.locationId);
      });
      if (mesa.ok && stampChanged('runtime_mesa', mesa.stamp)) return { changed: true };
      var sede = await sb
        .from('crozzo_sede_runtime')
        .select('saved_at,updated_at')
        .eq('location_id', c.locationId)
        .limit(1)
        .maybeSingle();
      if (!sede.error && sede.data) {
        var st =
          Date.parse(sede.data.updated_at || sede.data.saved_at || 0) ||
          Number(sede.data.payload && sede.data.payload.savedAt) ||
          0;
        if (stampChanged('runtime_sede', st)) return { changed: true };
      }
    } catch (_) {}
    return { changed: false };
  }

  async function probeComandas() {
    markProbe('comandas');
    var c = cloudCtx();
    var res = await probeMaxUpdated('comandas', function (q) {
      q = q.neq('status', 'entregada');
      if (c.businessId && c.businessId !== 'default') q = q.eq('business_id', c.businessId);
      if (c.locationId && c.locationId !== 'default') q = q.eq('location_id', c.locationId);
      return q;
    });
    if (!res.ok) return { changed: false };
    return { changed: stampChanged('comandas', res.stamp) };
  }

  async function probeProducts() {
    markProbe('products');
    var res = await probeMaxUpdated('products', null);
    if (!res.ok) return { changed: false };
    return { changed: stampChanged('products', res.stamp) };
  }

  async function probeTenant() {
    markProbe('tenant');
    var res = await probeMaxUpdated('company_config', null);
    if (!res.ok) return { changed: false };
    return { changed: stampChanged('tenant', res.stamp) };
  }

  async function probeSales() {
    markProbe('sales');
    var c = cloudCtx();
    var res = await probeMaxUpdated('sales', function (q) {
      try {
        if (c.businessId && c.businessId !== 'default') q = q.eq('business_id', c.businessId);
      } catch (_) {}
      return q;
    });
    if (!res.ok) {
      markProbe('queue');
      return { changed: false };
    }
    return { changed: stampChanged('sales', res.stamp) };
  }

  async function probeClients() {
    markProbe('clients');
    var res = await probeMaxUpdated('clients', null);
    if (!res.ok) return { changed: false };
    return { changed: stampChanged('clients', res.stamp) };
  }

  async function probeStaff() {
    markProbe('staff');
    var res = await probeMaxUpdated('pos_staff', null);
    if (!res.ok) {
      res = await probeMaxUpdated('profiles', null);
    }
    if (!res.ok) return { changed: false };
    return { changed: stampChanged('staff', res.stamp) };
  }

  async function probePreparations() {
    markProbe('preparations');
    var res = await probeMaxUpdated('crozzo_pedidos_internos', null);
    if (!res.ok) return { changed: false };
    return { changed: stampChanged('preparations', res.stamp) };
  }

  async function pullRuntime(opts) {
    __lastPullAt.runtime = Date.now();
    var applied = false;
    var comApplied = false;
    if (typeof global.crozzoPullPosRuntimeCloud === 'function') {
      applied = await global.crozzoPullPosRuntimeCloud({ quiet: true, skipRender: true });
    }
    if (
      pri().isOperationalPage(__activePage) &&
      typeof global.crozzoPullComandasFromCloud === 'function' &&
      cloudBgAllowed({ kind: 'realtime' })
    ) {
      var canPrintStation =
        typeof global.crozzoCanStationPrintComandas === 'function' &&
        global.crozzoCanStationPrintComandas();
      comApplied = await global.crozzoPullComandasFromCloud({
        skipPrint: !canPrintStation,
        skipRender: false,
        silent: true,
      });
    }
    if (!applied && typeof global.crozzoPullPosRuntimeCloud === 'function' && localBgAllowed({ kind: 'realtime' })) {
      applied = await global.crozzoPullPosRuntimeCloud({ quiet: true, skipRender: true, force: true });
    }
    if (!comApplied && typeof global.crozzoPullComandasFromLan === 'function' && localBgAllowed({ kind: 'realtime' })) {
      comApplied = await global.crozzoPullComandasFromLan({
        skipPrint: false,
        skipRender: false,
        force: true,
      });
    }
    if (applied || comApplied) notifyRuntimeUiApplied();
    if (comApplied) notifyComandasUiApplied();
    return applied || comApplied;
  }

  async function pullComandas(opts) {
    __lastPullAt.comandas = Date.now();
    var onKitchen = __activePage === 'comandas' || __activePage === 'cocina';
    var onOps = __activePage === 'cajero' || __activePage === 'tablets';
    var printStation =
      typeof global.crozzoIsTauriPosDesktop === 'function' && global.crozzoIsTauriPosDesktop();
    var ok = false;
    if (typeof global.crozzoPullComandasFromCloud === 'function' && cloudBgAllowed({ kind: 'realtime' })) {
      ok = await global.crozzoPullComandasFromCloud({
        skipPrint: !(onKitchen || printStation),
        skipRender: !(onKitchen || onOps),
        silent: true,
      });
    }
    if (!ok && typeof global.crozzoPullComandasFromLan === 'function' && localBgAllowed({ kind: 'realtime' })) {
      ok = await global.crozzoPullComandasFromLan({
        skipPrint: !(onKitchen || printStation),
        skipRender: !(onKitchen || onOps),
        force: true,
      });
    }
    if (ok) notifyComandasUiApplied();
    return ok;
  }

  async function pullProducts() {
    __lastPullAt.products = Date.now();
    if (typeof global.__crozzoRefreshCloudCatalogUi === 'function') {
      var ok = await global.__crozzoRefreshCloudCatalogUi({ skipRender: true });
      if (ok && typeof global.crozzoPatchOperationalPageFromRemote === 'function') {
        global.crozzoPatchOperationalPageFromRemote(__activePage);
      }
      return ok;
    }
    return false;
  }

  async function pullTenant() {
    __lastPullAt.tenant = Date.now();
    if (typeof global.crozzoPullRemoteTenantState === 'function') {
      return await global.crozzoPullRemoteTenantState({
        quiet: true,
        skipRender: true,
        force: true,
        kind: 'page_watch',
      });
    }
    return false;
  }

  async function pullClients() {
    __lastPullAt.clients = Date.now();
    if (typeof global.crozzoPullRemoteClientsState === 'function') {
      return await global.crozzoPullRemoteClientsState({ quiet: true, skipRender: true });
    }
    if (typeof global.__crozzoRefreshCloudCatalogUi === 'function') {
      return await global.__crozzoRefreshCloudCatalogUi({ skipRender: true, scope: 'clients' });
    }
    return false;
  }

  async function pullStaff() {
    __lastPullAt.staff = Date.now();
    if (typeof global.crozzoPullRemoteStaffState === 'function') {
      return await global.crozzoPullRemoteStaffState({
        quiet: true,
        skipRender: true,
        force: true,
        kind: 'page_watch',
      });
    }
    return pullTenant();
  }

  async function pullPreparations() {
    __lastPullAt.preparations = Date.now();
    if (typeof global.crozzoPullRemotePreparationsState === 'function') {
      return await global.crozzoPullRemotePreparationsState({ quiet: true, skipRender: true });
    }
    return pullProducts();
  }

  async function pullQueue(force, kind) {
    __lastPullAt.queue = Date.now();
    if (typeof global.syncOfflineQueue === 'function') {
      var p = pri();
      return await global.syncOfflineQueue({
        force: !!force,
        kind: kind || (force ? 'nav_enter' : 'page_watch'),
        priority: force ? p.P1 : p.P2,
      });
    }
    return null;
  }

  async function runDomain(domain, firstPass, navPull) {
    if (!await ensureClient()) return;
    if (document.hidden) return;

    var domainPri = pri().getDomainPriority(domain);

    if (domain === 'runtime') {
      var rtSilentRun = false;
      try {
        if (typeof global.crozzoRuntimeRealtimeStatus === 'function') {
          var rrs = global.crozzoRuntimeRealtimeStatus();
          if (rrs && rrs.live && rrs.lastEventAgoMs != null && rrs.lastEventAgoMs > 20000) {
            rtSilentRun = true;
          }
        }
      } catch (_) {}
      if (domainPri === pri().P0 && !firstPass && !navPull) {
        var pr = await probeRuntime();
        if (pr.changed || rtSilentRun) await pullRuntime({ quiet: true });
      } else if (firstPass || navPull) {
        await pullRuntime({ quiet: true });
      }
      return;
    }
    if (domain === 'comandas') {
      var rtSilentCom = false;
      try {
        if (typeof global.crozzoComandaRealtimeStatus === 'function') {
          var crs = global.crozzoComandaRealtimeStatus();
          if (crs && crs.live && crs.lastEventAgoMs != null && crs.lastEventAgoMs > 20000) {
            rtSilentCom = true;
          }
        }
      } catch (_) {}
      if (domainPri === pri().P0 && !firstPass && !navPull) {
        var pc = await probeComandas();
        if (pc.changed || rtSilentCom) await pullComandas();
      } else if (firstPass || navPull) {
        await pullComandas();
      }
      return;
    }
    if (domain === 'products') {
      var pp = await probeProducts();
      if (firstPass || pp.changed) await pullProducts();
      return;
    }
    if (domain === 'tenant') {
      var pt = await probeTenant();
      if (firstPass || pt.changed || navPull) await pullTenant();
      return;
    }
    if (domain === 'clients') {
      var pcl = await probeClients();
      if (firstPass || navPull || pcl.changed) await pullClients();
      return;
    }
    if (domain === 'staff') {
      var pst = await probeStaff();
      if (firstPass || navPull || pst.changed) await pullStaff();
      return;
    }
    if (domain === 'preparations') {
      var ppr = await probePreparations();
      if (firstPass || navPull || ppr.changed) {
        await pullPreparations();
        if (navPull || firstPass) await pullQueue(true, 'nav_enter_prep');
      }
      return;
    }
    if (domain === 'sales') {
      var ps = await probeSales();
      if (firstPass || navPull || ps.changed) {
        await pullQueue(navPull || firstPass, navPull ? 'nav_enter' : 'page_watch');
        if (__activePage === 'facturas' && typeof global.renderPage === 'function') {
          try {
            global.renderPage('facturas', { background: true });
          } catch (_) {}
        }
      }
      return;
    }
    if (domain === 'queue') {
      markProbe('queue');
      if (firstPass || navPull) await pullQueue(true, 'nav_enter');
    }
  }

  async function tick() {
    if (__running || !__activePage) return;
    if (document.hidden) return;
    var profile = pageProfiles()[__activePage];
    if (!profile || profile.navOnly) return;
    var rtTier = { tier: 'off' };
    try {
      if (typeof global.crozzoCloudOperationalRealtimeTier === 'function') {
        rtTier = global.crozzoCloudOperationalRealtimeTier(38000);
      } else if (typeof global.crozzoCloudOperationalRealtimeHealthy === 'function') {
        rtTier = { tier: global.crozzoCloudOperationalRealtimeHealthy(35000) ? 'healthy' : 'off' };
      }
    } catch (_) {}
    var cloudStandby = rtTier.tier === 'healthy';
    var cloudWarm = rtTier.tier === 'warm';
    __running = true;
    try {
      if (!await ensureClient()) return;
      for (var i = 0; i < profile.domains.length; i++) {
        var d = profile.domains[i];
        var dPri = pri().getDomainPriority(d);
        if (dPri === pri().P1) continue;
        if (cloudStandby && (d === 'comandas' || d === 'runtime')) continue;
        if (cloudWarm && (d === 'comandas' || d === 'runtime')) {
          var now = Date.now();
          if (now - __lastSoftProbeAt < SOFT_PROBE_GAP_MS) continue;
          __lastSoftProbeAt = now;
          await runDomain(d, false, false);
          continue;
        }
        if (!domainDue(d, profile.intervalMs)) continue;
        await runDomain(d, false, false);
      }
    } finally {
      __running = false;
    }
  }

  function tickIntervalMs() {
    try {
      if (typeof global.crozzoZ0UserActivityRecent === 'function' && global.crozzoZ0UserActivityRecent(50000)) {
        return TICK_ACTIVE_MS;
      }
      if (typeof global.crozzoCloudOperationalRealtimeTier === 'function') {
        var t = global.crozzoCloudOperationalRealtimeTier(38000);
        if (t.tier === 'healthy') return TICK_IDLE_MS;
      }
    } catch (_) {}
    return TICK_MS;
  }

  function scheduleNextTick() {
    if (__tickTimer) {
      global.clearTimeout(__tickTimer);
      __tickTimer = null;
    }
    __tickTimer = global.setTimeout(function () {
      __tickTimer = null;
      tick()
        .catch(function () {})
        .finally(function () {
          if (__activePage) scheduleNextTick();
        });
    }, tickIntervalMs());
  }

  function startTick() {
    if (__tickTimer) return;
    scheduleNextTick();
  }

  function stopTick() {
    if (__tickTimer) {
      global.clearTimeout(__tickTimer);
      __tickTimer = null;
    }
  }

  async function initialPass(page, navPull) {
    var plan = syncPlan(page);
    page = plan.page;
    var profile = plan.profile || pageProfiles()[page];
    if (!profile || !profile.domains || !profile.domains.length || !await ensureClient()) return;
    for (var i = 0; i < profile.domains.length; i++) {
      await runDomain(profile.domains[i], !navPull, !!navPull);
    }
  }

  async function runNavPull(page) {
    page = canonPage(page || __activePage);
    if (!page || !pri().isNavPage(page)) return;
    await initialPass(page, true);
  }

  function isZone0Page(page) {
    if (pri().getPageZone) return pri().getPageZone(page) === pri().Z0;
    return pri().isOperationalPage(page);
  }

  function setPage(page) {
    page = canonPage(page);
    if (page === __activePage) return;
    if (__activePage) {
      pri().onPageLeave(__activePage);
    }
    __prevPage = __activePage;
    __activePage = page;
    var profile = pageProfiles()[page];
    if (!profile || !profile.domains || !profile.domains.length) {
      stopTick();
      return;
    }
    pri().onPageEnter(page);
    startTick();
    pri().startBackgroundScheduler();
    var plan = syncPlan(page);
    refreshOpsTransports({ source: 'page_' + page, force: isZone0Page(page) });
    safe(function () {
      if (typeof global.crozzoFlushPendingStaffSyncIfNeeded === 'function') {
        global.crozzoFlushPendingStaffSyncIfNeeded().catch(function () {});
      }
    });
    setTimeout(function () {
      initialPass(
        page,
        pri().isNavPage(page) || !!(plan.profile && plan.profile.navOnly && plan.priority === pri().P2)
      ).catch(function () {});
    }, 350);
  }

  function cloudPushFlush(reason) {
    reason = reason || 'flush';
    safe(function () {
      if (typeof global.crozzoSchedulePosRuntimeCloudPush === 'function') {
        global.crozzoSchedulePosRuntimeCloudPush('flush');
      }
    });
    safe(function () {
      if (typeof global.crozzoPushPosRuntimeCloudNow === 'function') {
        global.crozzoPushPosRuntimeCloudNow().catch(function () {});
      }
    });
    safe(function () {
      if (typeof global.syncOfflineQueue === 'function') {
        global.syncOfflineQueue({ force: true, kind: reason, priority: pri().P1 }).catch(function () {});
      }
    });
  }

  function usesGlobalComandaPoll() {
    // Igual que antes del refactor P0: el poll global de comandas queda apagado;
    // PageCloudWatch + Realtime cubren la vista activa.
    var profile = pageProfiles()[__activePage];
    if (profile && profile.domains && profile.domains.indexOf('comandas') >= 0) return false;
    return true;
  }

  function usesGlobalRuntimePoll() {
    // CRÍTICO: mantener poll de respaldo de mesas/carritos SIEMPRE activo.
    // Desactivarlo en cajero/tablets dejó tablet↔caja mudo si Realtime fallaba.
    return true;
  }

  function cloudBgAllowed(opts) {
    opts = opts || {};
    if (!opts.kind) opts.kind = 'operational';
    try {
      if (typeof global.crozzoCloudBackgroundSyncAllowed === 'function') {
        return global.crozzoCloudBackgroundSyncAllowed(opts);
      }
    } catch (_) {}
    return false;
  }

  function localBgAllowed(opts) {
    opts = opts || {};
    if (!opts.kind) opts.kind = 'operational';
    try {
      if (typeof global.crozzoLocalSyncAllowed === 'function') {
        return global.crozzoLocalSyncAllowed(opts);
      }
    } catch (_) {}
    return false;
  }

  function stopLanOpsQuiet() {
    safe(function () {
      if (typeof global.crozzoStopLanOpsSync === 'function') global.crozzoStopLanOpsSync();
    });
  }

  function refreshLanTransports(opts) {
    opts = opts || {};
    if (!localBgAllowed({ kind: 'transport', force: !!opts.force })) {
      stopLanOpsQuiet();
      return;
    }
    if (!isZone0Page(__activePage)) {
      stopLanOpsQuiet();
      return;
    }
    safe(function () {
      if (typeof global.crozzoActivateLocalSyncPath === 'function') {
        global.crozzoActivateLocalSyncPath(opts.source || 'lan_transport').catch(function () {});
      }
    });
    safe(function () {
      if (typeof global.crozzoStartLanOpsSync === 'function') {
        global.crozzoStartLanOpsSync(opts.source || 'lan_transport');
      }
    });
    safe(function () {
      if (typeof global.crozzoFlushComandaOutbox === 'function') global.crozzoFlushComandaOutbox();
    });
  }

  function stopCloudTransportsQuiet() {
    safe(function () {
      if (typeof global.crozzoStopComandasCloudSync === 'function') global.crozzoStopComandasCloudSync();
    });
    safe(function () {
      if (typeof global.crozzoStopPosRuntimeCloudSync === 'function') global.crozzoStopPosRuntimeCloudSync();
    });
    safe(function () {
      if (global.CrozzoCloudOpsPulse && typeof global.CrozzoCloudOpsPulse.stop === 'function') {
        global.CrozzoCloudOpsPulse.stop();
      }
    });
  }

  function refreshCloudTransports(opts) {
    opts = opts || {};
    if (!cloudBgAllowed({ kind: 'transport', force: !!opts.force })) {
      stopCloudTransportsQuiet();
      return false;
    }
    if (!isZone0Page(__activePage)) {
      stopCloudTransportsQuiet();
      return false;
    }
    safe(function () {
      if (typeof global.crozzoResetRuntimeSyncDedup === 'function') global.crozzoResetRuntimeSyncDedup();
    });
    safe(function () {
      if (typeof global.crozzoStartPosRuntimeCloudSync === 'function') global.crozzoStartPosRuntimeCloudSync();
    });
    safe(function () {
      if (typeof global.crozzoStartComandasCloudSync === 'function') global.crozzoStartComandasCloudSync();
    });
    safe(function () {
      if (typeof global.crozzoStartOpsPulse === 'function') global.crozzoStartOpsPulse();
    });
    safe(function () {
      if (typeof global.crozzoFlushComandaOutbox === 'function') global.crozzoFlushComandaOutbox();
    });
    return true;
  }

  /** Z0: nube + LAN en híbrido (paralelo); si no híbrido, prioriza nube y cae a LAN. */
  function refreshOpsTransports(opts) {
    opts = opts || {};
    if (!isZone0Page(__activePage)) {
      stopCloudTransportsQuiet();
      stopLanOpsQuiet();
      return 'none';
    }
    var hybrid = false;
    try {
      if (typeof global.crozzoRuntimeSyncHybrid === 'function') hybrid = global.crozzoRuntimeSyncHybrid();
    } catch (_) {}
    var forceHybrid = hybrid || !!opts.force;
    var cloudOk = cloudBgAllowed({ kind: 'transport', force: forceHybrid });
    if (!cloudOk && hybrid) {
      try {
        cloudOk =
          typeof global.crozzoTierAllowsCloudSync === 'function' && global.crozzoTierAllowsCloudSync();
      } catch (_) {}
    }
    var lanOk = localBgAllowed({ kind: 'transport', force: forceHybrid });
    if (!lanOk && hybrid) {
      try {
        lanOk = typeof global.crozzoLocalSyncPathReady === 'function' && global.crozzoLocalSyncPathReady();
      } catch (_) {}
    }
    if (cloudOk) refreshCloudTransports(Object.assign({}, opts, { force: forceHybrid }));
    else stopCloudTransportsQuiet();
    if (lanOk) refreshLanTransports(Object.assign({}, opts, { force: forceHybrid }));
    else stopLanOpsQuiet();
    if (cloudOk) return 'cloud';
    if (lanOk) return 'lan';
    return 'none';
  }

  async function ensureOpsSyncActive(opts) {
    opts = opts || {};
    var mode = refreshOpsTransports(opts);
    if (mode === 'none') return false;
    try {
      if (typeof global.crozzoEnsureSedeLocationId === 'function') global.crozzoEnsureSedeLocationId();
    } catch (_) {}
    if (mode === 'cloud' && typeof global.crozzoEnsureCloudSyncActive === 'function') {
      try {
        await global.crozzoEnsureCloudSyncActive(opts);
      } catch (_) {}
    }
    try {
      await initialPass(__activePage, pri().isNavPage(__activePage));
    } catch (_) {}
    return true;
  }

  document.addEventListener('crozzo-tier-changed', function (ev) {
    var to = ev && ev.detail && ev.detail.to;
    refreshOpsTransports({ source: 'tier_' + (to || '?'), force: to === 'cloud' || to === 'lan' || to === 'offline' });
    if (to === 'cloud' && __activePage) {
      setTimeout(function () {
        initialPass(__activePage, pri().isNavPage(__activePage))
          .then(function () {
            if (isZone0Page(__activePage)) cloudPushFlush('reconnect_tier');
          })
          .catch(function () {});
      }, 600);
    }
  });

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) {
      var thr = global.CrozzoCloudThrottle;
      if (thr && typeof thr.isUnderPressure === 'function' && thr.isUnderPressure()) return;
      refreshOpsTransports({ source: 'visibility', force: isZone0Page(__activePage) });
      if (__activePage) {
        setTimeout(function () {
          initialPass(__activePage, pri().isNavPage(__activePage)).catch(function () {});
        }, 500);
      }
    }
  });

  global.addEventListener('beforeunload', function () {
    if (__activePage) pri().onPageLeave(__activePage);
    cloudPushFlush('beforeunload');
  });

  global.CrozzoPageCloudWatch = {
    setPage: setPage,
    tick: tick,
    runNavPull: runNavPull,
    cloudPushFlush: cloudPushFlush,
    usesGlobalComandaPoll: usesGlobalComandaPoll,
    usesGlobalRuntimePoll: usesGlobalRuntimePoll,
    getActivePage: function () {
      return __activePage;
    },
    getPreviousPage: function () {
      return __prevPage;
    },
  };

  global.crozzoCloudPushFlush = cloudPushFlush;
  global.crozzoPageCloudWatchSetPage = setPage;
  global.crozzoRefreshOpsTransports = refreshOpsTransports;
  global.crozzoEnsureOpsSyncActive = ensureOpsSyncActive;
})(typeof window !== 'undefined' ? window : globalThis);
