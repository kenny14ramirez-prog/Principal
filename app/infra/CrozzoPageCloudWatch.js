/**
 * Crozzo — Sincronización con nube según la pantalla activa.
 * Solo consulta dominios relevantes a la vista actual, primero sondea cambios
 * (updated_at) y descarga solo si hay novedades. Realtime global sigue en los
 * módulos existentes; este módulo reemplaza el polling global redundante.
 */
(function (global) {
  'use strict';

  var TICK_MS = 2000;
  var BATCH_PUSH_MS = 180000;
  var BATCH_PUSH_FAST_MS = 120000;
  var __activePage = '';
  var __tickTimer = null;
  var __batchTimer = null;
  var __running = false;
  var __stamps = {};
  var __lastPullAt = {};
  var __lastProbeAt = {};

  var OPERATIONAL_PAGES = {
    cajero: 1,
    'venta-comercial': 1,
    tablets: 1,
    comandas: 1,
    cocina: 1,
    facturas: 1,
    'cierre-caja': 1,
  };

  var PAGE_PROFILES = {
    cajero: { domains: ['runtime', 'comandas', 'products'], intervalMs: 7500 },
    'venta-comercial': { domains: ['runtime', 'products'], intervalMs: 11000 },
    tablets: { domains: ['runtime', 'comandas', 'products'], intervalMs: 9000 },
    comandas: { domains: ['comandas'], intervalMs: 7000 },
    cocina: { domains: ['comandas'], intervalMs: 7000 },
    facturas: { domains: ['sales', 'queue'], intervalMs: 14000 },
    'cierre-caja': { domains: ['runtime', 'sales', 'tenant', 'queue'], intervalMs: 10000 },
    'inicio-operacion': { domains: ['tenant', 'runtime'], intervalMs: 22000 },
    inventarios: { domains: ['products'], intervalMs: 35000 },
    'costos-matriz': { domains: ['products'], intervalMs: 40000 },
    'config-multidispositivo': { domains: ['tenant'], intervalMs: 30000 },
    'super-admin-nube': { domains: ['tenant'], intervalMs: 30000 },
    mesas: { domains: ['runtime'], intervalMs: 12000 },
  };

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
    var gap = throttleBlocks() ? Math.min(intervalMs * 3, 90000) : intervalMs;
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

  async function pullRuntime(opts) {
    __lastPullAt.runtime = Date.now();
    if (typeof global.crozzoPullPosRuntimeCloud === 'function') {
      return await global.crozzoPullPosRuntimeCloud({ quiet: true, skipRender: true });
    }
    return false;
  }

  async function pullComandas(opts) {
    __lastPullAt.comandas = Date.now();
    if (typeof global.crozzoPullComandasFromCloud === 'function') {
      var onKitchen = __activePage === 'comandas' || __activePage === 'cocina';
      return await global.crozzoPullComandasFromCloud({
        skipPrint: !onKitchen,
        skipRender: true,
        silent: true,
      });
    }
    return false;
  }

  async function pullProducts() {
    __lastPullAt.products = Date.now();
    if (typeof global.__crozzoRefreshCloudCatalogUi === 'function') {
      return await global.__crozzoRefreshCloudCatalogUi({ skipRender: __activePage === 'cajero' || __activePage === 'tablets' });
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

  async function pullQueue(force) {
    __lastPullAt.queue = Date.now();
    if (typeof global.syncOfflineQueue === 'function') {
      return await global.syncOfflineQueue({ force: !!force, kind: force ? 'forced' : 'page_watch' });
    }
    return null;
  }

  async function runDomain(domain, firstPass) {
    if (!await ensureClient()) return;
    if (document.hidden) return;

    if (domain === 'runtime') {
      var pr = await probeRuntime();
      if (firstPass || pr.changed) await pullRuntime({ quiet: true });
      return;
    }
    if (domain === 'comandas') {
      var pc = await probeComandas();
      if (firstPass || pc.changed) await pullComandas();
      return;
    }
    if (domain === 'products') {
      var pp = await probeProducts();
      if (firstPass || pp.changed) await pullProducts();
      return;
    }
    if (domain === 'tenant') {
      var pt = await probeTenant();
      if (firstPass || pt.changed) await pullTenant();
      return;
    }
    if (domain === 'sales') {
      var ps = await probeSales();
      if (firstPass || ps.changed) {
        await pullQueue(false);
        if (__activePage === 'facturas' && typeof global.renderPage === 'function') {
          try {
            global.renderPage('facturas');
          } catch (_) {}
        }
      }
      return;
    }
    if (domain === 'queue') {
      markProbe('queue');
      await pullQueue(false);
    }
  }

  async function tick() {
    if (__running || !__activePage) return;
    if (document.hidden) return;
    var profile = PAGE_PROFILES[__activePage];
    if (!profile) return;
    __running = true;
    try {
      if (!await ensureClient()) return;
      for (var i = 0; i < profile.domains.length; i++) {
        var d = profile.domains[i];
        if (!domainDue(d, profile.intervalMs)) continue;
        await runDomain(d, false);
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

  function startBatchPush() {
    if (__batchTimer) return;
    var ms = BATCH_PUSH_MS;
    __batchTimer = global.setInterval(function () {
      if (!onlineReady() || document.hidden) return;
      if (throttleBlocks()) return;
      var fast = OPERATIONAL_PAGES[__activePage];
      if (fast && Date.now() - (__lastPullAt.queue || 0) > BATCH_PUSH_FAST_MS) {
        pullQueue(false).catch(function () {});
      }
    }, ms);
  }

  function stopBatchPush() {
    if (__batchTimer) {
      global.clearInterval(__batchTimer);
      __batchTimer = null;
    }
  }

  async function initialPass(page) {
    var profile = PAGE_PROFILES[page];
    if (!profile || !await ensureClient()) return;
    for (var i = 0; i < profile.domains.length; i++) {
      await runDomain(profile.domains[i], true);
    }
  }

  function setPage(page) {
    page = String(page || '').trim();
    if (page === __activePage) return;
    __activePage = page;
    if (!PAGE_PROFILES[page]) {
      stopTick();
      return;
    }
    startTick();
    startBatchPush();
    setTimeout(function () {
      initialPass(page).catch(function () {});
    }, 400);
  }

  function cloudPushFlush(reason) {
    reason = reason || 'flush';
    try {
      if (typeof global.crozzoSchedulePosRuntimeCloudPush === 'function') {
        global.crozzoSchedulePosRuntimeCloudPush('flush');
      }
    } catch (_) {}
    try {
      if (typeof global.crozzoPushPosRuntimeCloudNow === 'function') {
        global.crozzoPushPosRuntimeCloudNow().catch(function () {});
      }
    } catch (_) {}
    try {
      if (typeof global.syncOfflineQueue === 'function') {
        global.syncOfflineQueue({ force: true, kind: reason }).catch(function () {});
      }
    } catch (_) {}
  }

  function usesGlobalComandaPoll() {
    return false;
  }

  function usesGlobalRuntimePoll() {
    // Respaldo en PosRuntimeCloud cuando Realtime falla o la vista no está en PAGE_PROFILES.
    return true;
  }

  function refreshCloudTransports() {
    safe(function () {
      if (typeof global.crozzoStartPosRuntimeCloudSync === 'function') global.crozzoStartPosRuntimeCloudSync();
    });
    safe(function () {
      if (typeof global.crozzoStartComandasCloudSync === 'function') global.crozzoStartComandasCloudSync();
    });
    safe(function () {
      if (global.CrozzoCloudThrottle && typeof global.CrozzoCloudThrottle.clearPressure === 'function') {
        global.CrozzoCloudThrottle.clearPressure();
      }
    });
  }

  global.addEventListener('online', function () {
    refreshCloudTransports();
    if (__activePage) {
      setTimeout(function () {
        initialPass(__activePage).catch(function () {});
      }, 800);
    }
  });

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) {
      refreshCloudTransports();
      if (__activePage) {
        setTimeout(function () {
          initialPass(__activePage).catch(function () {});
        }, 500);
      }
    }
  });

  global.addEventListener('beforeunload', function () {
    cloudPushFlush('beforeunload');
  });

  global.CrozzoPageCloudWatch = {
    setPage: setPage,
    tick: tick,
    cloudPushFlush: cloudPushFlush,
    usesGlobalComandaPoll: usesGlobalComandaPoll,
    usesGlobalRuntimePoll: usesGlobalRuntimePoll,
    getActivePage: function () {
      return __activePage;
    },
  };

  global.crozzoCloudPushFlush = cloudPushFlush;
  global.crozzoPageCloudWatchSetPage = setPage;
})(typeof window !== 'undefined' ? window : globalThis);
