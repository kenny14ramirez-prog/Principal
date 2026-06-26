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
  var TICK_MS = 2500;
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
    if (typeof global.crozzoPullPosRuntimeCloud === 'function') {
      var applied = await global.crozzoPullPosRuntimeCloud({ quiet: true, skipRender: true });
      var comApplied = false;
      if (
        pri().isOperationalPage(__activePage) &&
        typeof global.crozzoPullComandasFromCloud === 'function'
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
      if (applied || comApplied) notifyRuntimeUiApplied();
      if (comApplied) notifyComandasUiApplied();
      return applied || comApplied;
    }
    return false;
  }

  async function pullComandas(opts) {
    __lastPullAt.comandas = Date.now();
    if (typeof global.crozzoPullComandasFromCloud === 'function') {
      var onKitchen = __activePage === 'comandas' || __activePage === 'cocina';
      var onOps = __activePage === 'cajero' || __activePage === 'tablets';
      var printStation =
        typeof global.crozzoIsTauriPosDesktop === 'function' && global.crozzoIsTauriPosDesktop();
      var ok = await global.crozzoPullComandasFromCloud({
        skipPrint: !(onKitchen || printStation),
        skipRender: !(onKitchen || onOps),
        silent: true,
      });
      if (ok) notifyComandasUiApplied();
      return ok;
    }
    return false;
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
      return await global.crozzoPullRemoteTenantState({ quiet: true, skipRender: true });
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
      return await global.crozzoPullRemoteStaffState({ quiet: true, skipRender: true });
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
          if (rrs && rrs.live && rrs.lastEventAgoMs != null && rrs.lastEventAgoMs > 28000) {
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
          if (crs && crs.live && crs.lastEventAgoMs != null && crs.lastEventAgoMs > 28000) {
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
    __running = true;
    try {
      if (!await ensureClient()) return;
      for (var i = 0; i < profile.domains.length; i++) {
        var d = profile.domains[i];
        var dPri = pri().getDomainPriority(d);
        if (dPri === pri().P1) continue;
        if (!domainDue(d, profile.intervalMs)) continue;
        await runDomain(d, false, false);
      }
    } finally {
      __running = false;
    }
  }

  function startTick() {
    if (__tickTimer) return;
    __tickTimer = global.setInterval(function () {
      tick().catch(function () {});
    }, TICK_MS);
  }

  function stopTick() {
    if (__tickTimer) {
      global.clearInterval(__tickTimer);
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
    if (plan.priority === pri().P0) {
      safe(function () {
        if (typeof global.crozzoEnsureCloudSyncActive === 'function') {
          global.crozzoEnsureCloudSyncActive({ source: 'page_p0_' + page }).catch(function () {});
        } else {
          refreshCloudTransports();
        }
      });
    }
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

  function refreshCloudTransports() {
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
      // Segunda vía de tiempo real (pulso broadcast operativo).
      if (typeof global.crozzoStartOpsPulse === 'function') global.crozzoStartOpsPulse();
    });
    safe(function () {
      // Respaldo de entrega: al recuperar transporte, drenar comandas pendientes.
      if (typeof global.crozzoFlushComandaOutbox === 'function') global.crozzoFlushComandaOutbox();
    });
    safe(function () {
      if (global.CrozzoCloudThrottle && typeof global.CrozzoCloudThrottle.clearPressure === 'function') {
        global.CrozzoCloudThrottle.clearPressure();
      }
    });
  }

  global.addEventListener('crozzo-tier-changed', function (ev) {
    var to = ev && ev.detail && ev.detail.to;
    if (to !== 'cloud') return;
    refreshCloudTransports();
    if (__activePage) {
      setTimeout(function () {
        // PULL primero (baja y reconcilia el estado autoritativo de la nube),
        // y SOLO DESPUÉS re-publicar. Así un equipo que vuelve de estar offline
        // no sube su estado viejo (mesas ya cobradas) y resucita datos.
        initialPass(__activePage, pri().isNavPage(__activePage))
          .then(function () {
            if (pri().isOperationalPage(__activePage)) cloudPushFlush('reconnect_tier');
          })
          .catch(function () {});
      }, 600);
    }
  });

  global.addEventListener('online', function () {
    refreshCloudTransports();
    if (__activePage) {
      setTimeout(function () {
        initialPass(__activePage, pri().isNavPage(__activePage))
          .then(function () {
            if (pri().isOperationalPage(__activePage)) cloudPushFlush('reconnect_online');
          })
          .catch(function () {});
      }, 800);
    }
  });

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) {
      refreshCloudTransports();
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
})(typeof window !== 'undefined' ? window : globalThis);
