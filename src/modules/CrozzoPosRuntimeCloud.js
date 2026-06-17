/**
 * Estado operativo POS (mesas, carritos) → Supabase por sede.
 * Payload compacto · push rápido en memoria · Realtime + poll de respaldo.
 */
(function (global) {
  'use strict';

  var TABLE = 'crozzo_sede_runtime';
  var DEBOUNCE_FAST_MS = 320;
  var DEBOUNCE_NORMAL_MS = 1100;
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
  var __rtResubTimer = null;
  var __rtResubAttempt = 0;

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

  function teardownRuntimeChannel() {
    try {
      if (__pgCh && global.__SUPABASE) global.__SUPABASE.removeChannel(__pgCh);
    } catch (_) {}
    __pgCh = null;
    __realtimeLive = false;
  }

  function scheduleRuntimeResubscribe(reason) {
    if (__rtResubTimer) return;
    __rtResubAttempt = Math.min((__rtResubAttempt || 0) + 1, 14);
    __rtResubTimer = global.setTimeout(function () {
      __rtResubTimer = null;
      if (!online() || __tableMissing) return;
      subscribeRealtime(reason || 'resub');
    }, rtResubscribeDelayMs());
  }

  function online() {
    return (
      typeof global.crozzoOnlineConfigReady === 'function' &&
      global.crozzoOnlineConfigReady() &&
      !!global.__SUPABASE
    );
  }

  function cloudTransportActive() {
    if (!online() || __tableMissing) return false;
    try {
      if (typeof global.crozzoTierAllowsCloudSync === 'function') {
        return global.crozzoTierAllowsCloudSync();
      }
    } catch (_) {}
    return true;
  }

  function ctx() {
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
          md.deviceId ||
          localStorage.getItem('crozzo_device_id') ||
          ''
      ).trim();
    } catch (_) {
      deviceId = String(md.deviceId || '').trim();
    }
    return {
      businessId: String(md.businessId || 'default').trim() || 'default',
      locationId: loc,
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
    var nm = String(it.nombreVenta || it.nombre || '').trim();
    if (nm) row.push(nm.length > MAX_CART_NAME ? nm.slice(0, MAX_CART_NAME) : nm);
    var sent = Math.max(0, Number(it.sentCantidad) || 0);
    var sig = String(it.configSig || '').trim();
    var nota = String(it.notaLinea || '').trim();
    var det = String(it.detalleConfig || '').trim();
    var ext = null;
    if (sent > 0 || sig || nota || det) {
      ext = {};
      if (sent > 0) ext.s = sent;
      if (sig) ext.g = sig.length > 48 ? sig.slice(0, 48) : sig;
      if (nota) ext.n = nota.length > 100 ? nota.slice(0, 100) : nota;
      if (det) ext.d = det.length > 80 ? det.slice(0, 80) : det;
    }
    if (ext) row.push(ext);
    return row;
  }

  function expandCompactCartRow(row) {
    if (!Array.isArray(row) || !row.length) return null;
    var ext = null;
    var cut = row.length;
    var tail = row[row.length - 1];
    if (tail && typeof tail === 'object' && !Array.isArray(tail)) {
      ext = tail;
      cut = row.length - 1;
    }
    var it = { id: row[0], cantidad: row[1] || 1, icon: '🍽️', nombre: '', precio: 0 };
    if (cut > 2 && typeof row[2] === 'number') {
      it.precio = row[2];
      if (cut > 3 && typeof row[3] === 'string') it.nombre = row[3];
    } else if (cut > 2 && typeof row[2] === 'string') {
      it.nombre = row[2];
    }
    if (ext) {
      if (ext.s != null) it.sentCantidad = Math.max(0, Number(ext.s) || 0);
      if (ext.g) it.configSig = String(ext.g);
      if (ext.n) it.notaLinea = String(ext.n);
      if (ext.d) it.detalleConfig = String(ext.d);
    }
    if (typeof global.crozzoHydrateRuntimeCartLine === 'function') {
      it = global.crozzoHydrateRuntimeCartLine(it);
    }
    return it;
  }

  function compactCartsMap(map) {
    if (!map || typeof map !== 'object') return {};
    var out = {};
    Object.keys(map).forEach(function (k) {
      var arr = map[k];
      if (!Array.isArray(arr)) return;
      if (!arr.length) {
        out[k] = [];
        return;
      }
      var lines = [];
      for (var i = 0; i < arr.length; i++) {
        var ln = compactCartLine(arr[i]);
        if (ln) lines.push(ln);
      }
      out[k] = lines;
    });
    return out;
  }

  function expandCartsMap(compact) {
    if (!compact || typeof compact !== 'object') return {};
    var out = {};
    Object.keys(compact).forEach(function (k) {
      var rows = compact[k];
      if (!Array.isArray(rows)) return;
      if (!rows.length) {
        out[k] = [];
        return;
      }
      out[k] = rows
        .map(function (row) {
          return expandCompactCartRow(row);
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
        if (!Array.isArray(row)) return compactCartLine(row) ? expandCompactCartRow(compactCartLine(row)) : null;
        return expandCompactCartRow(row);
      })
      .filter(Boolean);
  }

  function payloadSig(snap) {
    try {
      var locks = snap.comandaSlotLocks || {};
      var lockN =
        Object.keys(locks.mesa || {}).length + Object.keys(locks.llevar || {}).length;
      return (
        String(snap.savedAt) +
        '|' +
        Object.keys(snap.cartsPorMesa || {}).length +
        '|' +
        Object.keys(snap.cartsPorLlevar || {}).length +
        '|' +
        (snap.cartDirecto || []).length +
        '|l' +
        lockN
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
    if (!cloudTransportActive()) return false;
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
      noteCloudErr(res.error);
      var msg = String((res.error && res.error.message) || res.error || '');
      if (/401|403|permission denied|rls|jwt|forbidden/i.test(msg)) {
        if (!global.__crozzoRuntimeRlsWarned) {
          global.__crozzoRuntimeRlsWarned = true;
          console.warn('[runtime-cloud] Permiso/RLS rechazó escritura:', msg);
          try {
            if (typeof global.showToast === 'function') {
              global.showToast('Nube: permiso denegado al guardar mesas. Revise RLS en Supabase.', 'warning');
            }
          } catch (_) {}
        }
      }
      if (/relation|does not exist|404|PGRST205|schema cache/i.test(msg)) {
        __tableMissing = true;
        console.warn('[runtime-cloud] Tabla ' + TABLE + ' no existe. Ejecute docs/SUPABASE-SQL-POS-RUNTIME.sql');
        return false;
      }
    } catch (e) {
      console.warn('[runtime-cloud] upsert', e);
      noteCloudErr(e);
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

  function deferLocalCloudSync() {
    try {
      return typeof global.crozzoDeferLocalSync === 'function' && global.crozzoDeferLocalSync();
    } catch (_) {}
    return false;
  }

  async function lanSegmentUp() {
    if (deferLocalCloudSync()) return false;
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
        headers: (typeof global.crozzoLanAuthHeaders === 'function'
          ? global.crozzoLanAuthHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' })
          : { 'Content-Type': 'application/json', Accept: 'application/json' }),
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

  // ------------------------------------------------------------------
  // Runtime PARTICIONADO por mesa (opcional, auto-detectado).
  // Si existe la tabla crozzo_mesa_runtime, cada mesa/slot escribe en SU fila
  // (no en una unica fila por sede), eliminando la contencion a escala. Si la
  // tabla no existe, todo cae a la fila unica crozzo_sede_runtime (sin cambios).
  // ------------------------------------------------------------------
  var MESA_TABLE = 'crozzo_mesa_runtime';
  var __mesaMode = null; // null=desconocido, true=por-mesa, false=fila unica
  var __mesaSlotSig = {}; // "kind:ref" -> firma; solo subimos lo que cambia
  var __mesaPullTimer = null;
  var CART_KEYS = ['cartsPorMesa', 'cartsPorLlevar', 'cartDirecto'];

  function metaFromSnap(snap) {
    var meta = {};
    Object.keys(snap || {}).forEach(function (k) {
      if (CART_KEYS.indexOf(k) >= 0) return;
      meta[k] = snap[k];
    });
    meta._c = 1;
    return meta;
  }

  function mesaRowsFromSnap(snap, c) {
    var iso = new Date(Number(snap.savedAt) || Date.now()).toISOString();
    var rows = [];
    function add(kind, ref, lines) {
      rows.push({
        location_id: c.locationId,
        business_id: c.businessId,
        kind: kind,
        ref: String(ref),
        payload: { lines: lines || [] },
        source_device_id: c.deviceId,
        source_role: c.role,
        updated_at: iso,
      });
    }
    var m = snap.cartsPorMesa || {};
    Object.keys(m).forEach(function (ref) {
      add('mesa', ref, m[ref] || []);
    });
    var l = snap.cartsPorLlevar || {};
    Object.keys(l).forEach(function (ref) {
      add('llevar', ref, l[ref] || []);
    });
    if (Array.isArray(snap.cartDirecto) && snap.cartDirecto.length) add('directo', '__directo__', snap.cartDirecto);
    rows.push({
      location_id: c.locationId,
      business_id: c.businessId,
      kind: 'meta',
      ref: '__meta__',
      payload: metaFromSnap(snap),
      source_device_id: c.deviceId,
      source_role: c.role,
      updated_at: iso,
    });
    return rows;
  }

  function snapFromMesaRows(rows) {
    if (!Array.isArray(rows) || !rows.length) return null;
    var base = null;
    var maxAt = 0;
    var carts = { mesa: {}, llevar: {}, directo: [] };
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var at = Date.parse(r.updated_at || 0) || 0;
      if (at > maxAt) maxAt = at;
      var lines = r.payload && r.payload.lines;
      if (r.kind === 'meta') {
        base = r.payload && typeof r.payload === 'object' ? r.payload : {};
      } else if (r.kind === 'mesa') {
        carts.mesa[r.ref] = Array.isArray(lines) ? lines : [];
      } else if (r.kind === 'llevar') {
        carts.llevar[r.ref] = Array.isArray(lines) ? lines : [];
      } else if (r.kind === 'directo') {
        carts.directo = Array.isArray(lines) ? lines : [];
      }
    }
    if (!base) base = { v: 1, _c: 1 };
    base._c = 1;
    base.cartsPorMesa = expandCartsMap(carts.mesa);
    base.cartsPorLlevar = expandCartsMap(carts.llevar);
    base.cartDirecto = expandCartLines(carts.directo);
    base.savedAt = Number(base.savedAt) || maxAt || Date.now();
    return { snap: base, savedAt: base.savedAt };
  }

  async function ensureMesaMode() {
    if (__mesaMode !== null) return __mesaMode;
    if (!online()) return false;
    var sb = global.__SUPABASE;
    try {
      var res = await sb.from(MESA_TABLE).select('location_id').limit(1);
      if (res && res.error) {
        var msg = String((res.error && res.error.message) || res.error || '');
        if (/relation|does not exist|404|PGRST205|schema cache/i.test(msg)) {
          __mesaMode = false;
          return false;
        }
        return false; // error transitorio (RLS/red): reintentar luego
      }
      __mesaMode = true;
      return true;
    } catch (e) {
      return false;
    }
  }

  async function pushMesaRows(snap, c) {
    var sb = global.__SUPABASE;
    var rows = mesaRowsFromSnap(snap, c);
    var toUpsert = [];
    for (var i = 0; i < rows.length; i++) {
      var key = rows[i].kind + ':' + rows[i].ref;
      var sig;
      try {
        sig = JSON.stringify(rows[i].payload);
      } catch (_) {
        sig = String(Date.now());
      }
      if (__mesaSlotSig[key] !== sig) {
        __mesaSlotSig[key] = sig;
        toUpsert.push(rows[i]);
      }
    }
    if (!toUpsert.length) {
      __echoUntil = Date.now() + ECHO_MS;
      __lastPushSig = payloadSig(snap);
      __lastPushAt = Date.now();
      return true;
    }
    try {
      var res = await sb.from(MESA_TABLE).upsert(toUpsert, { onConflict: 'location_id,kind,ref' });
      if (!res.error) {
        __echoUntil = Date.now() + ECHO_MS;
        __lastPushSig = payloadSig(snap);
        __lastPushAt = Date.now();
        return true;
      }
      noteCloudErr(res.error);
      var msg = String((res.error && res.error.message) || res.error || '');
      if (/relation|does not exist|404|PGRST205|schema cache/i.test(msg)) __mesaMode = false;
      toUpsert.forEach(function (r) {
        delete __mesaSlotSig[r.kind + ':' + r.ref];
      });
      return false;
    } catch (e) {
      toUpsert.forEach(function (r) {
        delete __mesaSlotSig[r.kind + ':' + r.ref];
      });
      return false;
    }
  }

  async function pullMesaRows(opts, c) {
    c = c || ctx();
    var sb = global.__SUPABASE;
    try {
      var res = await sb
        .from(MESA_TABLE)
        .select('kind,ref,payload,updated_at,source_device_id')
        .eq('location_id', c.locationId);
      if (res && res.error) {
        var msg = String((res.error && res.error.message) || res.error || '');
        if (/relation|does not exist|404|PGRST205/i.test(msg)) __mesaMode = false;
        return false;
      }
      var built = snapFromMesaRows(res.data || []);
      if (!built) return false;
      return applyRemoteRow(
        { payload: built.snap, saved_at: new Date(built.savedAt).toISOString(), source_device_id: '' },
        opts
      );
    } catch (e) {
      return false;
    }
  }

  function scheduleMesaPull() {
    if (__mesaPullTimer) return;
    __mesaPullTimer = global.setTimeout(function () {
      __mesaPullTimer = null;
      pullMesaRows({ quiet: true }).catch(function () {});
    }, 500);
  }

  async function pushRuntimeNow(opts) {
    opts = opts || {};
    // Durante un cambio de sede se suprime el push para no contaminar la nube
    // nueva con datos de la sede anterior (el cuerpo se vacia tras respaldar).
    if (global.__crozzoSuppressRuntimePush) return false;
    var full = collectFull();
    var snap = packForCloud(full);
    if (!snap) return false;
    if (!opts.force) {
      var sig = payloadSig(snap);
      if (sig === __lastPushSig && Date.now() - __lastPushAt < 4000) return true;
    }
    snap.savedAt = Date.now();
    var lanLikely = false;
    if (!deferLocalCloudSync()) {
      try {
        if (typeof global.crozzoIsLocalLanSegmentUp === 'function') {
          lanLikely = global.crozzoIsLocalLanSegmentUp();
        }
      } catch (_) {}
      if (!lanLikely) {
        try {
          lanLikely = await lanSegmentUp();
        } catch (_) {}
      }
    }
    // Dual-write: LAN instantáneo (WS) + nube durable — sin duplicar costo si LAN falla.
    var lanP = lanLikely ? pushRuntimeLan(snap).catch(function () { return false; }) : Promise.resolve(false);
    var cloudOk = false;
    if (cloudTransportActive()) {
      if (await ensureMesaMode()) {
        cloudOk = await pushMesaRows(snap, ctx());
      } else {
        cloudOk = await upsertRuntimeRow(snap);
      }
    }
    var lanOk = await lanP;
    return cloudOk || lanOk;
  }

  function schedulePush(priority) {
    if (global.__crozzoSuppressRuntimePush) return;
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
    if (p === 'fast') {
      __pushPending = 'fast';
      if (!deferLocalCloudSync()) {
        try {
          if (typeof global.crozzoIsLocalLanSegmentUp === 'function' && global.crozzoIsLocalLanSegmentUp()) {
            var fullFast = collectFull();
            var snapFast = packForCloud(fullFast);
            if (snapFast) {
              snapFast.savedAt = Date.now();
              pushRuntimeLan(snapFast).catch(function () {});
            }
          }
        } catch (_) {}
      }
    } else if (__pushPending !== 'fast') __pushPending = 'normal';
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
    if (Date.now() < __echoUntil && !(opts && opts.force)) {
      if (remoteAt <= localSavedAt() + 1200) return false;
    }
    if (!(opts && opts.force)) {
      var localAt = localSavedAt();
      if (__pushTimer && remoteAt <= localAt + 800) return false;
    } else if (__pushTimer) {
      clearTimeout(__pushTimer);
      __pushTimer = null;
    }
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
    try {
      if (typeof global.crozzoHandleRemoteRuntimeUiSync === 'function') global.crozzoHandleRemoteRuntimeUiSync();
    } catch (_) {}
    return true;
  }

  async function pullRuntime(opts) {
    var c = ctx();
    if (!c.locationId || c.locationId === 'default') return false;
    if (cloudTransportActive()) {
      if (await ensureMesaMode()) {
        var doneMesa = await pullMesaRows(opts, c);
        if (__mesaMode) return doneMesa; // modo por-mesa activo
        // si la tabla desaparecio (paso a false), continua a la fila unica
      }
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
          noteCloudErr(res.error);
          var msg = String((res.error && res.error.message) || res.error || '');
          if (/relation|does not exist|404|PGRST205/i.test(msg)) __tableMissing = true;
        }
      } catch (e) {
        console.warn('[runtime-cloud] pull cloud', e);
      }
      // Fase nube: no mezclar pull LAN si Supabase esta activo.
      return false;
    }
    if (await lanSegmentUp()) {
      return pullRuntimeLan(opts);
    }
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
    if (
      global.CrozzoPageCloudWatch &&
      typeof global.CrozzoPageCloudWatch.usesGlobalRuntimePoll === 'function' &&
      !global.CrozzoPageCloudWatch.usesGlobalRuntimePoll()
    ) {
      if (__pullTimer) {
        clearInterval(__pullTimer);
        __pullTimer = null;
      }
      return;
    }
    if (__pullTimer) clearInterval(__pullTimer);
    var ms = __realtimeLive ? PULL_POLL_LIVE_MS : PULL_POLL_FALLBACK_MS;
    // Escala: bajo presion de la nube (429/503/timeout) espaciamos el poll de
    // respaldo para no amplificar la carga con decenas de dispositivos.
    var thr = global.CrozzoCloudThrottle;
    if (thr && typeof thr.isUnderPressure === 'function' && thr.isUnderPressure()) {
      ms = Math.min(90000, ms * 3);
    }
    __pullTimer = global.setInterval(function () {
      pullRuntime({ quiet: true }).catch(function () {});
    }, ms);
  }

  function subscribeRealtime(reason) {
    if (!cloudTransportActive()) return;
    var c = ctx();
    if (!c.locationId || c.locationId === 'default') return;
    teardownRuntimeChannel();
    ensureMesaMode().then(function (useMesa) {
      if (!cloudTransportActive()) return;
      try {
        var filter = 'location_id=eq.' + c.locationId;
        var tbl = useMesa ? MESA_TABLE : TABLE;
        __pgCh = global.__SUPABASE.channel(
          'crozzo_runtime_live_' + (useMesa ? 'm_' : '') + c.locationId.replace(/[^a-zA-Z0-9_]/g, '_')
        );
        var onEvt = useMesa
          ? function () {
              scheduleMesaPull();
            }
          : function (p) {
              if (p.new) applyRemoteRow(p.new, { quiet: true });
            };
        __pgCh.on('postgres_changes', { event: 'INSERT', schema: 'public', table: tbl, filter: filter }, onEvt);
        __pgCh.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: tbl, filter: filter }, onEvt);
        __pgCh.subscribe(function (st) {
          if (st === 'SUBSCRIBED') {
            __realtimeLive = true;
            __rtResubAttempt = 0;
            clearCloudPressure();
            schedulePullLoop();
          } else if (st === 'CHANNEL_ERROR' || st === 'CLOSED' || st === 'TIMED_OUT') {
            __realtimeLive = false;
            schedulePullLoop();
            scheduleRuntimeResubscribe(st);
          }
        });
      } catch (e) {
        console.warn('[runtime-cloud] subscribe', e);
        noteCloudErr(e);
        scheduleRuntimeResubscribe('exception');
      }
    });
  }

  function stopRuntimeCloudSync() {
    __started = false;
    __realtimeLive = false;
    if (__rtResubTimer) {
      clearTimeout(__rtResubTimer);
      __rtResubTimer = null;
    }
    __rtResubAttempt = 0;
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
    if (__mesaPullTimer) {
      clearTimeout(__mesaPullTimer);
      __mesaPullTimer = null;
    }
    __mesaSlotSig = {};
    teardownRuntimeChannel();
  }

  function startRuntimeCloudSync(opts) {
    opts = opts || {};
    if (typeof global.crozzoEnsureSedeLocationId === 'function') {
      try {
        global.crozzoEnsureSedeLocationId();
      } catch (_) {}
    }
    if (opts.resetTableMissing) __tableMissing = false;
    if (__started) {
      subscribeRealtime('refresh');
      return;
    }
    var c = ctx();
    if (!c.locationId || c.locationId === 'default') {
      console.warn('[runtime-cloud] Sin location_id válido — sync nube inactiva. Empareje de nuevo o configure sede.');
      return;
    }
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
  global.crozzoApplyRemoteRuntimeRow = function (payload, savedAt, opts) {
    if (!payload) return false;
    return applyRemoteRow(
      {
        payload: payload,
        saved_at: savedAt || new Date().toISOString(),
        source_device_id: '',
      },
      opts || {}
    );
  };
  global.crozzoStartPosRuntimeCloudSync = startRuntimeCloudSync;
  global.crozzoStopPosRuntimeCloudSync = stopRuntimeCloudSync;

  /** Arranque/reparación central de sync nube (runtime + comandas). */
  global.crozzoEnsureCloudSyncActive = async function crozzoEnsureCloudSyncActive(opts) {
    opts = opts || {};
    try {
      if (typeof global.crozzoEnsureSedeLocationId === 'function') global.crozzoEnsureSedeLocationId();
    } catch (_) {}
    if (typeof global.crozzoEnsureCloudClientReady === 'function') {
      try {
        await global.crozzoEnsureCloudClientReady();
      } catch (_) {}
    }
    if (
      typeof global.crozzoTierAllowsCloudSync === 'function' &&
      !global.crozzoTierAllowsCloudSync()
    ) {
      return false;
    }
    if (!online()) return false;
    var wait = 0;
    while (wait < 8 && typeof global.crozzoStartPosRuntimeCloudSync !== 'function') {
      await new Promise(function (r) {
        global.setTimeout(r, 150);
      });
      wait++;
    }
    try {
      startRuntimeCloudSync({ resetTableMissing: !!opts.resetTableMissing });
    } catch (_) {}
    try {
      if (typeof global.crozzoStartComandasCloudSync === 'function') global.crozzoStartComandasCloudSync();
    } catch (_) {}
    try {
      if (typeof global.crozzoPullPosRuntimeCloud === 'function') {
        await global.crozzoPullPosRuntimeCloud({ quiet: true, skipRender: false });
      }
    } catch (_) {}
    try {
      if (typeof global.crozzoPullComandasFromCloud === 'function') {
        await global.crozzoPullComandasFromCloud({ skipPrint: true, skipRender: false });
      }
    } catch (_) {}
    try {
      if (global.CrozzoInternalQrRegistry && typeof global.CrozzoInternalQrRegistry.pullPeersFromCloud === 'function') {
        await global.CrozzoInternalQrRegistry.pullPeersFromCloud();
      }
    } catch (_) {}
    return online() && !__tableMissing;
  };
  global.crozzoPosRuntimeCloudIsLive = function () {
    return __started && !__tableMissing;
  };
  global.crozzoPosRuntimeCloudMode = function () {
    return __mesaMode === true ? 'mesa' : __mesaMode === false ? 'sede' : 'desconocido';
  };
  // Funciones puras expuestas para pruebas (extraccion/reconstruccion por mesa).
  global.__crozzoRuntimeMesaInternals = {
    mesaRowsFromSnap: mesaRowsFromSnap,
    snapFromMesaRows: snapFromMesaRows,
  };
  global.__crozzoExpandRuntimeCartRow = expandCompactCartRow;

  if (typeof document !== 'undefined') {
    document.addEventListener('crozzo-multidevice-config-saved', function () {
      try {
        if (typeof global.crozzoEnsureSedeLocationId === 'function') global.crozzoEnsureSedeLocationId();
        startRuntimeCloudSync({ resetTableMissing: true });
      } catch (_) {}
    });
    document.addEventListener('crozzo-supabase-config-saved', function () {
      try {
        if (typeof global.crozzoEnsureCloudSyncActive === 'function') {
          global.crozzoEnsureCloudSyncActive({ source: 'config_saved', resetTableMissing: true }).catch(function () {});
        } else {
          startRuntimeCloudSync({ resetTableMissing: true });
        }
      } catch (_) {}
    });
  }
  if (typeof global.addEventListener === 'function') {
    global.addEventListener('online', function () {
      if (typeof global.crozzoEnsureCloudSyncActive === 'function') {
        global.setTimeout(function () {
          global.crozzoEnsureCloudSyncActive({ source: 'online' }).catch(function () {});
        }, 400);
      }
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
