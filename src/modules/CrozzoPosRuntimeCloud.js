/**
 * Estado operativo POS (mesas, carritos) → Supabase por sede.
 * Payload compacto · push rápido en memoria · Realtime + poll de respaldo.
 */
(function (global) {
  'use strict';

  var TABLE = 'crozzo_sede_runtime';
  var DEBOUNCE_FAST_MS = 520;
  var DEBOUNCE_NORMAL_MS = 1400;
  var PULL_POLL_LIVE_MS = 28000;
  var PULL_POLL_FALLBACK_MS = 9000;
  var ECHO_MS = 2600;
  var STABILITY_MS = 26000;
  var MAX_CART_NAME = 36;
  var __pushTimer = null;
  var __pushPending = 'normal';
  var __pullTimer = null;
  var __stabilityTimer = null;
  var __echoUntil = 0;
  var __lastRemoteAt = 0;
  var __lastPushSig = '';
  var __lastPushAt = 0;
  var __realtimeLive = false;
  var __started = false;
  var __tableMissing = false;
  var __pgCh = null;

  function online() {
    return (
      typeof global.crozzoOnlineConfigReady === 'function' &&
      global.crozzoOnlineConfigReady() &&
      !!global.__SUPABASE
    );
  }

  function ctx() {
    var md = typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
    var deviceId = '';
    try {
      deviceId = String(
        (typeof global.ensureCrozzoDeviceId === 'function' && global.ensureCrozzoDeviceId()) ||
          md.deviceId ||
          localStorage.getItem('crozzo_device_id') ||
          ''
      ).trim();
    } catch (_) {
      deviceId = String(md.deviceId || '').trim();
    }
    return {
      businessId: String(md.businessId || 'default').trim() || 'default',
      locationId: String(md.locationId || 'default').trim() || 'default',
      deviceId: deviceId,
      role: md.role === 'B' ? 'B' : 'A',
    };
  }

  function localSavedAt() {
    try {
      var raw = localStorage.getItem('crozzo_pos_runtime_v1');
      if (!raw) return 0;
      var s = JSON.parse(raw);
      return Number(s && s.savedAt) || 0;
    } catch (_) {
      return 0;
    }
  }

  function compactCartLine(it) {
    if (!it || it.id == null) return null;
    var row = [Number(it.id), Math.max(1, Number(it.cantidad) || 1)];
    var pr = Number(it.precio);
    if (Number.isFinite(pr) && pr > 0) row.push(Math.round(pr));
    var nm = String(it.nombre || '').trim();
    if (nm) row.push(nm.length > MAX_CART_NAME ? nm.slice(0, MAX_CART_NAME) : nm);
    return row;
  }

  function compactCartsMap(map) {
    if (!map || typeof map !== 'object') return {};
    var out = {};
    Object.keys(map).forEach(function (k) {
      var arr = map[k];
      if (!Array.isArray(arr) || !arr.length) return;
      var lines = [];
      for (var i = 0; i < arr.length; i++) {
        var ln = compactCartLine(arr[i]);
        if (ln) lines.push(ln);
      }
      if (lines.length) out[k] = lines;
    });
    return out;
  }

  function expandCartsMap(compact) {
    if (!compact || typeof compact !== 'object') return {};
    var out = {};
    Object.keys(compact).forEach(function (k) {
      var rows = compact[k];
      if (!Array.isArray(rows)) return;
      out[k] = rows
        .map(function (row) {
          if (!Array.isArray(row) || !row.length) return null;
          var it = {
            id: row[0],
            cantidad: row[1] || 1,
            icon: '🍽️',
            nombre: '',
            precio: 0,
          };
          if (row.length > 2 && typeof row[2] === 'number') {
            it.precio = row[2];
            if (row.length > 3 && typeof row[3] === 'string') it.nombre = row[3];
          } else if (row.length > 2 && typeof row[2] === 'string') {
            it.nombre = row[2];
          }
          return it;
        })
        .filter(Boolean);
    });
    return out;
  }

  function compactSlotMap(slotObj) {
    if (!slotObj || typeof slotObj !== 'object') return {};
    var out = {};
    Object.keys(slotObj).forEach(function (k) {
      var v = slotObj[k];
      if (v != null && v !== '' && !(typeof v === 'object' && !Object.keys(v).length)) out[k] = v;
    });
    return Object.keys(out).length ? out : undefined;
  }

  function packForCloud(full) {
    if (!full || typeof full !== 'object') return null;
    var ts = Date.now();
    var snap = {
      v: 1,
      _c: 1,
      savedAt: ts,
      tipoServicioCaja: full.tipoServicioCaja,
      mesaSeleccionada: full.mesaSeleccionada,
      llevarSeleccionado: full.llevarSeleccionado,
      cartDirecto: (full.cartDirecto || []).map(compactCartLine).filter(Boolean),
      cartsPorMesa: compactCartsMap(full.cartsPorMesa),
      cartsPorLlevar: compactCartsMap(full.cartsPorLlevar),
      tabletModoPedido: full.tabletModoPedido,
      tabletMesaSeleccionada: full.tabletMesaSeleccionada,
      tabletLlevarSeleccionado: full.tabletLlevarSeleccionado,
      tabletOrderOpen: !!full.tabletOrderOpen,
      cajaMesaOrderOpen: !!full.cajaMesaOrderOpen,
      cajaLlevarOrderOpen: !!full.cajaLlevarOrderOpen,
      closedSlots: full.closedSlots,
      comandaSlotLocks: full.comandaSlotLocks,
    };
    var cps = full.clientePorSlot;
    if (cps && typeof cps === 'object') {
      var m = compactSlotMap(cps.mesa);
      var l = compactSlotMap(cps.llevar);
      if (m || l) snap.clientePorSlot = { mesa: m || {}, llevar: l || {} };
    }
    var dps = full.descuentosPorSlot;
    if (dps && typeof dps === 'object') {
      var dm = compactSlotMap(dps.mesa);
      var dl = compactSlotMap(dps.llevar);
      if (dm || dl) snap.descuentosPorSlot = { mesa: dm || {}, llevar: dl || {} };
    }
    if (full.descuentoDirecto != null) snap.descuentoDirecto = full.descuentoDirecto;
    if (full.descuentoComercial != null) snap.descuentoComercial = full.descuentoComercial;
    return snap;
  }

  function unpackForApply(pay) {
    if (!pay || typeof pay !== 'object') return null;
    if (!pay._c) return pay;
    var out = {
      v: 1,
      savedAt: Number(pay.savedAt) || Date.now(),
      tipoServicioCaja: pay.tipoServicioCaja,
      mesaSeleccionada: pay.mesaSeleccionada,
      llevarSeleccionado: pay.llevarSeleccionado,
      cartDirecto: expandCartLines(pay.cartDirecto),
      cartsPorMesa: expandCartsMap(pay.cartsPorMesa),
      cartsPorLlevar: expandCartsMap(pay.cartsPorLlevar),
      tabletModoPedido: pay.tabletModoPedido,
      tabletMesaSeleccionada: pay.tabletMesaSeleccionada,
      tabletLlevarSeleccionado: pay.tabletLlevarSeleccionado,
      tabletOrderOpen: pay.tabletOrderOpen,
      cajaMesaOrderOpen: pay.cajaMesaOrderOpen,
      cajaLlevarOrderOpen: pay.cajaLlevarOrderOpen,
      closedSlots: pay.closedSlots,
      comandaSlotLocks: pay.comandaSlotLocks,
      clientePorSlot: pay.clientePorSlot,
      descuentosPorSlot: pay.descuentosPorSlot,
      descuentoDirecto: pay.descuentoDirecto,
      descuentoComercial: pay.descuentoComercial,
    };
    return out;
  }

  function expandCartLines(rows) {
    if (!Array.isArray(rows)) return [];
    return rows
      .map(function (row) {
        if (!Array.isArray(row)) return compactCartLine(row) ? expandCartsMap({ x: [compactCartLine(row)] }).x[0] : null;
        var it = { id: row[0], cantidad: row[1] || 1, icon: '🍽️', nombre: '', precio: 0 };
        if (row.length > 2 && typeof row[2] === 'number') {
          it.precio = row[2];
          if (row.length > 3) it.nombre = String(row[3] || '');
        } else if (row.length > 2) it.nombre = String(row[2] || '');
        return it;
      })
      .filter(Boolean);
  }

  function payloadSig(snap) {
    try {
      return (
        String(snap.savedAt) +
        '|' +
        Object.keys(snap.cartsPorMesa || {}).length +
        '|' +
        Object.keys(snap.cartsPorLlevar || {}).length +
        '|' +
        (snap.cartDirecto || []).length
      );
    } catch (_) {
      return String(Date.now());
    }
  }

  function collectFull() {
    if (typeof global.collectPosRuntimeState === 'function') {
      return global.collectPosRuntimeState();
    }
    try {
      var raw = localStorage.getItem('crozzo_pos_runtime_v1');
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function rowFromSnapshot(snap, c) {
    var iso = new Date(Number(snap.savedAt) || Date.now()).toISOString();
    return {
      location_id: c.locationId,
      business_id: c.businessId,
      payload: snap,
      saved_at: iso,
      source_device_id: c.deviceId,
      source_role: c.role,
      updated_at: iso,
    };
  }

  async function upsertRuntimeRow(snap) {
    if (!online() || __tableMissing) return false;
    var c = ctx();
    if (!c.locationId || c.locationId === 'default') return false;
    var sb = global.__SUPABASE;
    var body = rowFromSnapshot(snap, c);
    try {
      var res = await sb.from(TABLE).upsert(body, { onConflict: 'location_id' });
      if (!res.error) {
        __echoUntil = Date.now() + ECHO_MS;
        __lastPushSig = payloadSig(snap);
        __lastPushAt = Date.now();
        return true;
      }
      var msg = String((res.error && res.error.message) || res.error || '');
      if (/relation|does not exist|404|PGRST205|schema cache/i.test(msg)) {
        __tableMissing = true;
        console.warn('[runtime-cloud] Tabla ' + TABLE + ' no existe. Ejecute docs/SUPABASE-SQL-POS-RUNTIME.sql');
        return false;
      }
    } catch (e) {
      console.warn('[runtime-cloud] upsert', e);
    }
    return false;
  }

  function lanCentralHost() {
    var md = typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
    if (md.role === 'A') return '127.0.0.1';
    var ip = String(md.centralIp || '').trim();
    if (!ip) {
      try {
        ip = String(global.localStorage.getItem('crozzo_wifi_zone_last_ip') || '').trim();
      } catch (_) {}
    }
    return ip;
  }

  async function lanSegmentUp() {
    if (typeof global.crozzoProbeLocalLanReachable !== 'function') return false;
    try {
      var p = await global.crozzoProbeLocalLanReachable();
      if (p && p.ok) return true;
      if (global.crozzoWifiZoneResolveCentral) {
        var r = await global.crozzoWifiZoneResolveCentral({ force: true });
        if (r && r.ip) return true;
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  async function pushRuntimeLan(snap) {
    var host = lanCentralHost();
    if (!host) return false;
    var md = typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
    var port = Number(md.port) || 3000;
    var c = ctx();
    var controller = new AbortController();
    var t = global.setTimeout(function () {
      controller.abort();
    }, 5000);
    try {
      var res = await global.fetch('http://' + host + ':' + port + '/api/sync', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          uuid: 'rt_' + String(snap.savedAt || Date.now()),
          businessId: c.businessId,
          deviceId: c.deviceId,
          type: 'runtime',
          data: snap,
        }),
      });
      global.clearTimeout(t);
      if (!res.ok) return false;
      var j = await res.json().catch(function () {
        return null;
      });
      if (j && j.ok !== false) {
        __echoUntil = Date.now() + ECHO_MS;
        __lastPushSig = payloadSig(snap);
        __lastPushAt = Date.now();
        return true;
      }
    } catch (e) {
      global.clearTimeout(t);
    }
    return false;
  }

  async function pullRuntimeLan(opts) {
    var host = lanCentralHost();
    if (!host) return false;
    var md = typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
    var port = Number(md.port) || 3000;
    var controller = new AbortController();
    var t = global.setTimeout(function () {
      controller.abort();
    }, 4500);
    try {
      var res = await global.fetch('http://' + host + ':' + port + '/api/runtime', {
        method: 'GET',
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      global.clearTimeout(t);
      if (!res.ok) return false;
      var j = await res.json().catch(function () {
        return null;
      });
      if (!j || !j.payload) return false;
      return applyRemoteRow(
        { payload: j.payload, saved_at: j.saved_at, source_device_id: '' },
        opts || { quiet: true }
      );
    } catch (e) {
      global.clearTimeout(t);
      return false;
    }
  }

  async function pushRuntimeNow(opts) {
    opts = opts || {};
    var full = collectFull();
    var snap = packForCloud(full);
    if (!snap) return false;
    if (!opts.force) {
      var sig = payloadSig(snap);
      if (sig === __lastPushSig && Date.now() - __lastPushAt < 4000) return true;
    }
    snap.savedAt = Date.now();
    if (online() && !__tableMissing) {
      var cloudOk = await upsertRuntimeRow(snap);
      if (cloudOk) return true;
    }
    if (await lanSegmentUp()) return pushRuntimeLan(snap);
    return false;
  }

  function schedulePush(priority) {
    var c = ctx();
    if (!c.locationId || c.locationId === 'default') return;
    var p = priority === 'fast' || priority === 'flush' ? priority : 'normal';
    if (p === 'flush') {
      if (__pushTimer) {
        clearTimeout(__pushTimer);
        __pushTimer = null;
      }
      pushRuntimeNow({ force: true }).catch(function () {});
      return;
    }
    if (p === 'fast') __pushPending = 'fast';
    else if (__pushPending !== 'fast') __pushPending = 'normal';
    if (__pushTimer) clearTimeout(__pushTimer);
    var ms = __pushPending === 'fast' ? DEBOUNCE_FAST_MS : DEBOUNCE_NORMAL_MS;
    __pushTimer = global.setTimeout(function () {
      __pushTimer = null;
      var mode = __pushPending;
      __pushPending = 'normal';
      pushRuntimeNow({ force: mode === 'fast' }).catch(function () {});
    }, ms);
  }

  function maybeRerender() {
    var pages = ['cajero', 'tablets', 'comandas', 'cocina', 'mesas'];
    try {
      if (pages.indexOf(global.currentPage) >= 0 && typeof global.renderPage === 'function') {
        global.renderPage(global.currentPage);
      }
    } catch (_) {}
  }

  function applyRemoteRow(row, opts) {
    if (!row) return false;
    var pay = row.payload || row.payload_json;
    if (!pay || typeof pay !== 'object') return false;
    pay = unpackForApply(pay);
    var remoteAt = Number(pay.savedAt) || Date.parse(row.saved_at || row.updated_at || 0) || 0;
    if (!remoteAt) return false;
    if (Date.now() < __echoUntil) return false;
    var srcDev = String(row.source_device_id || '').trim();
    var myDev = ctx().deviceId;
    if (srcDev && myDev && srcDev === myDev && remoteAt <= localSavedAt() + 500) return false;
    if (remoteAt <= Math.max(localSavedAt(), __lastRemoteAt) - 700) return false;
    if (typeof global.applyPosRuntimeSnapshot !== 'function') return false;
    var ok = global.applyPosRuntimeSnapshot(pay, { skipUiFields: true });
    if (!ok) return false;
    __lastRemoteAt = remoteAt;
    try {
      global.__crozzoRuntimeCloudApplying = true;
      if (typeof global.savePosRuntimeToLocalStorage === 'function') {
        global.savePosRuntimeToLocalStorage();
      }
    } catch (_) {}
    try {
      global.__crozzoRuntimeCloudApplying = false;
    } catch (_) {}
    if (!(opts && opts.skipRender)) maybeRerender();
    return true;
  }

  async function pullRuntime(opts) {
    var c = ctx();
    if (!c.locationId || c.locationId === 'default') return false;
    if (online() && !__tableMissing) {
      var sb = global.__SUPABASE;
      try {
        var res = await sb
          .from(TABLE)
          .select('location_id,payload,saved_at,source_device_id,updated_at')
          .eq('location_id', c.locationId)
          .limit(1)
          .maybeSingle();
        if (!res.error && res.data) {
          return applyRemoteRow(res.data, opts);
        }
        if (res.error) {
          var msg = String((res.error && res.error.message) || res.error || '');
          if (/relation|does not exist|404|PGRST205/i.test(msg)) __tableMissing = true;
        }
      } catch (e) {
        console.warn('[runtime-cloud] pull cloud', e);
      }
    }
    if (await lanSegmentUp()) return pullRuntimeLan(opts);
    return false;
  }

  function cloudStabilityTick() {
    try {
      if (typeof document !== 'undefined' && document.hidden) return;
    } catch (_) {}
    if (!online()) return;
    var throttle = global.CrozzoCloudThrottle;
    if (throttle && typeof throttle.isUnderPressure === 'function' && throttle.isUnderPressure()) return;
    if (typeof global.syncOfflineQueue === 'function') {
      global.syncOfflineQueue({ kind: 'stability' }).catch(function () {});
    }
  }

  function schedulePullLoop() {
    if (__pullTimer) clearInterval(__pullTimer);
    var ms = __realtimeLive ? PULL_POLL_LIVE_MS : PULL_POLL_FALLBACK_MS;
    __pullTimer = global.setInterval(function () {
      pullRuntime({ quiet: true }).catch(function () {});
    }, ms);
  }

  function subscribeRealtime() {
    if (__pgCh || !online() || __tableMissing) return;
    var c = ctx();
    if (!c.locationId || c.locationId === 'default') return;
    try {
      var filter = 'location_id=eq.' + c.locationId;
      __pgCh = global.__SUPABASE.channel('crozzo_runtime_live_' + c.locationId.replace(/[^a-zA-Z0-9_]/g, '_'));
      __pgCh.on('postgres_changes', { event: 'INSERT', schema: 'public', table: TABLE, filter: filter }, function (p) {
        if (p.new) applyRemoteRow(p.new, { quiet: true });
      });
      __pgCh.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: TABLE, filter: filter }, function (p) {
        if (p.new) applyRemoteRow(p.new, { quiet: true });
      });
      __pgCh.subscribe(function (st) {
        if (st === 'SUBSCRIBED') {
          __realtimeLive = true;
          schedulePullLoop();
        } else if (st === 'CHANNEL_ERROR' || st === 'CLOSED' || st === 'TIMED_OUT') {
          __realtimeLive = false;
          schedulePullLoop();
        }
      });
    } catch (e) {
      console.warn('[runtime-cloud] subscribe', e);
    }
  }

  function stopRuntimeCloudSync() {
    __started = false;
    __realtimeLive = false;
    if (__pushTimer) {
      clearTimeout(__pushTimer);
      __pushTimer = null;
    }
    if (__pullTimer) {
      clearInterval(__pullTimer);
      __pullTimer = null;
    }
    if (__stabilityTimer) {
      clearInterval(__stabilityTimer);
      __stabilityTimer = null;
    }
    try {
      if (__pgCh && global.__SUPABASE) {
        global.__SUPABASE.removeChannel(__pgCh);
      }
    } catch (_) {}
    __pgCh = null;
  }

  function startRuntimeCloudSync() {
    if (__started) return;
    var c = ctx();
    if (!c.locationId || c.locationId === 'default') return;
    __started = true;
    __tableMissing = false;
    pullRuntime({ skipRender: true, quiet: true }).catch(function () {});
    schedulePullLoop();
    subscribeRealtime();
    if (__stabilityTimer) clearInterval(__stabilityTimer);
    __stabilityTimer = global.setInterval(cloudStabilityTick, STABILITY_MS);
    cloudStabilityTick();
  }

  global.crozzoSchedulePosRuntimeCloudPush = schedulePush;
  global.crozzoPushPosRuntimeCloudNow = function () {
    return pushRuntimeNow({ force: true });
  };
  global.crozzoPullPosRuntimeCloud = pullRuntime;
  global.crozzoStartPosRuntimeCloudSync = startRuntimeCloudSync;
  global.crozzoStopPosRuntimeCloudSync = stopRuntimeCloudSync;
  global.crozzoPosRuntimeCloudIsLive = function () {
    return __started && !__tableMissing;
  };
})(typeof window !== 'undefined' ? window : globalThis);
