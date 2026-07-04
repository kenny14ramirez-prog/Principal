/**
 * Estado operativo POS (mesas, carritos) → Supabase por sede.
 * Payload compacto · push rápido en memoria · Realtime + poll de respaldo.
 */
(function (global) {
  'use strict';

  var TABLE = 'crozzo_sede_runtime';
  var DEBOUNCE_FAST_MS = 120;
  var DEBOUNCE_NORMAL_MS = 380;
  var PULL_POLL_LIVE_MS = 8000;
  var PULL_POLL_FALLBACK_MS = 2800;
  var SILENCE_WATCHDOG_MS = 18000;
  var MESA_PULL_COALESCE_MS = 420;
  var MESA_PULL_MIN_GAP_MS = 900;
  var ECHO_MS = 2600;
  var STABILITY_MS = 26000;
  var MAX_CART_NAME = 36;
  var __pushTimer = null;
  var __pushPending = 'normal';
  var __pullTimer = null;
  var __stabilityTimer = null;
  var __echoUntil = 0;
  var __lastRemoteAt = 0;
  var __lastAppliedContentSig = '';
  var __lastAppliedPickerSig = '';
  var __lastApplyRemoteLogAt = 0;
  var __lastPushSig = '';
  var __lastPushAt = 0;
  var __realtimeLive = false;
  var __lastRtEventAt = 0;
  var __started = false;
  var __tableMissing = false;
  var __pgCh = null;
  var __rtResubTimer = null;
  var __rtResubAttempt = 0;
  // Respaldo de entrega del estado de mesas: si un push a la nube no se
  // confirma (red intermitente, RLS transitoria, 503), se reintenta forzado
  // con backoff hasta que la fila quede en la nube. Sin esto, una mesa cuyo
  // único push falló quedaba invisible para caja hasta el siguiente cambio.
  var __pushRetryTimer = null;
  var __pushRetryAttempt = 0;
  var PUSH_RETRY_BASE_MS = 2200;
  var PUSH_RETRY_MAX_MS = 25000;

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
    } catch (_) {}
  }

  function runtimeLanPushAllowed() {
    if (typeof global.crozzoLocalSyncPathReady === 'function' && !global.crozzoLocalSyncPathReady()) {
      return false;
    }
    if (typeof global.crozzoZ0HybridParallelLan === 'function' && global.crozzoZ0HybridParallelLan()) {
      return true;
    }
    if (typeof global.crozzoCloudSyncPathReady === 'function' && global.crozzoCloudSyncPathReady()) {
      return false;
    }
    return true;
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

  function cloudWanReady() {
    try {
      if (typeof global.crozzoCloudWanReady === 'function') return global.crozzoCloudWanReady();
      if (typeof global.crozzoTierAllowsCloudSync === 'function') return global.crozzoTierAllowsCloudSync();
    } catch (_) {}
    return false;
  }

  function teardownRuntimeChannel(opts) {
    opts = opts || {};
    var oldCh = __pgCh;
    __pgCh = null;
    var wasLive = __realtimeLive;
    __realtimeLive = false;
    if (!oldCh || !global.__SUPABASE) return;
    if (opts.skipRemove || !wasLive) return;
    if (__runtimeTeardownTimer) global.clearTimeout(__runtimeTeardownTimer);
    __runtimeTeardownTimer = global.setTimeout(function () {
      __runtimeTeardownTimer = null;
      try {
        global.__SUPABASE.removeChannel(oldCh);
      } catch (_) {}
    }, 0);
  }

  function scheduleRuntimeResubscribe(reason) {
    if (__rtResubTimer) return;
    __rtResubAttempt = Math.min((__rtResubAttempt || 0) + 1, 14);
    __rtResubTimer = global.setTimeout(function () {
      __rtResubTimer = null;
      if (!online() || __tableMissing || !cloudTransportActive()) return;
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
    // No sincronizar antes del login (evita 401 sin sesión y push de estado viejo).
    try {
      if (typeof global.crozzoCloudSyncSessionGateOpen === 'function' && !global.crozzoCloudSyncSessionGateOpen()) {
        return false;
      }
    } catch (_) {}
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

  function compactCartsMap(map, opts) {
    opts = opts || {};
    var forceEmpty = opts.forceEmpty || {};
    if (!map || typeof map !== 'object') return {};
    var out = {};
    Object.keys(map).forEach(function (k) {
      var arr = map[k];
      if (!Array.isArray(arr)) return;
      if (!arr.length) {
        if (forceEmpty[k]) out[k] = [];
        return;
      }
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
    var forceEmpty = global.__crozzoRuntimeForceEmptySlots || { mesa: {}, llevar: {} };
    var snap = {
      v: 1,
      _c: 1,
      savedAt: ts,
      tipoServicioCaja: full.tipoServicioCaja,
      mesaSeleccionada: full.mesaSeleccionada,
      llevarSeleccionado: full.llevarSeleccionado,
      cartDirecto: (full.cartDirecto || []).map(compactCartLine).filter(Boolean),
      cartsPorMesa: compactCartsMap(full.cartsPorMesa, { forceEmpty: forceEmpty.mesa || {} }),
      cartsPorLlevar: compactCartsMap(full.cartsPorLlevar, { forceEmpty: forceEmpty.llevar || {} }),
      tabletModoPedido: full.tabletModoPedido,
      tabletMesaSeleccionada: full.tabletMesaSeleccionada,
      tabletLlevarSeleccionado: full.tabletLlevarSeleccionado,
      tabletOrderOpen: !!full.tabletOrderOpen,
      cajaMesaOrderOpen: !!full.cajaMesaOrderOpen,
      cajaLlevarOrderOpen: !!full.cajaLlevarOrderOpen,
      closedSlots: full.closedSlots,
      slotCartDetachedFromComandas: full.slotCartDetachedFromComandas,
      comandaSlotLocks: full.comandaSlotLocks,
      slotSessionPresence: full.slotSessionPresence,
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
    snap.activeComandas = slimComandasForRuntimeSync(full.comandas);
    return snap;
  }

  /** Comandas activas mínimas para estado de mesa (comandado/pendiente) en otros equipos. */
  function slimComandasForRuntimeSync(list) {
    if (!Array.isArray(list)) return [];
    var out = [];
    for (var i = 0; i < list.length && out.length < 72; i++) {
      var c = list[i];
      if (!c || c.estado === 'entregada' || !c.referencia) continue;
      var items = [];
      var src = c.items || [];
      for (var j = 0; j < src.length && j < 36; j++) {
        var it = src[j];
        if (!it || it.id == null) continue;
        items.push([
          Number(it.id),
          Math.max(1, Number(it.cantidad) || 1),
          String(it.nombre || it.nombreVenta || '').slice(0, MAX_CART_NAME),
        ]);
      }
      out.push({
        id: c.id,
        transaction_id: c.transaction_id,
        tipoServicio: c.tipoServicio,
        referencia: c.referencia,
        estado: c.estado,
        areaId: c.areaId,
        createdAt: c.createdAt,
        lastUpdateAt: c.lastUpdateAt,
        origen: c.origen,
        creadoPor: c.creadoPor,
        creadoPorNombre: c.creadoPorNombre,
        creadoPorRol: c.creadoPorRol,
        creadoPorEtiqueta: c.creadoPorEtiqueta,
        items: items,
      });
    }
    return out;
  }

  function expandRuntimeSyncComandas(rows) {
    if (!Array.isArray(rows)) return [];
    return rows
      .map(function (c) {
        if (!c || c.id == null) return null;
        var items = (c.items || [])
          .map(function (it) {
            if (Array.isArray(it)) {
              return { id: it[0], cantidad: it[1] || 1, nombre: it[2] || '', icon: '🍽️', precio: 0 };
            }
            return it;
          })
          .filter(function (it) {
            return it && it.id != null;
          });
        return {
          id: c.id,
          transaction_id: c.transaction_id,
          tipoServicio: c.tipoServicio,
          referencia: c.referencia,
          estado: c.estado,
          areaId: c.areaId,
          createdAt: c.createdAt,
          lastUpdateAt: c.lastUpdateAt,
          origen: c.origen,
          creadoPor: c.creadoPor,
          creadoPorNombre: c.creadoPorNombre,
          creadoPorRol: c.creadoPorRol,
          creadoPorEtiqueta: c.creadoPorEtiqueta,
          items: items,
        };
      })
      .filter(Boolean);
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
      slotCartDetachedFromComandas: pay.slotCartDetachedFromComandas,
      comandaSlotLocks: pay.comandaSlotLocks,
      slotSessionPresence: pay.slotSessionPresence,
      clientePorSlot: pay.clientePorSlot,
      descuentosPorSlot: pay.descuentosPorSlot,
      descuentoDirecto: pay.descuentoDirecto,
      descuentoComercial: pay.descuentoComercial,
    };
    if (Array.isArray(pay.activeComandas) && pay.activeComandas.length) {
      out.comandas = expandRuntimeSyncComandas(pay.activeComandas);
    }
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

  function cartMapContentSig(map) {
    if (!map || typeof map !== 'object') return '';
    return Object.keys(map)
      .sort()
      .map(function (ref) {
        var lines = map[ref];
        if (!Array.isArray(lines) || !lines.length) return ref + ':_';
        return (
          ref +
          ':' +
          lines
            .map(function (row) {
              if (Array.isArray(row)) {
                var ext = row.length && row[row.length - 1] && typeof row[row.length - 1] === 'object' ? row[row.length - 1] : null;
                var sent = ext && ext.s != null ? Number(ext.s) || 0 : 0;
                return String(row[0]) + 'x' + (Number(row[1]) || 0) + 's' + sent;
              }
              if (!row || row.id == null) return '';
              return String(row.id) + 'x' + (Number(row.cantidad) || 0) + 's' + (Number(row.sentCantidad) || 0);
            })
            .join(',')
        );
      })
      .join('|');
  }

  function activeComandasSig(list) {
    if (!Array.isArray(list) || !list.length) return '';
    return list
      .map(function (c) {
        if (!c || c.id == null) return '';
        return (
          String(c.tipoServicio || '') +
          ':' +
          String(c.referencia || '') +
          ':' +
          String(c.estado || '') +
          ':' +
          String(c.transaction_id || c.id) +
          ':' +
          String(c.creadoPorEtiqueta || c.creadoPorNombre || '')
        );
      })
      .sort()
      .join('|');
  }

  function payloadSig(snap) {
    try {
      var locks = snap.comandaSlotLocks || {};
      var lockS = ['mesa', 'llevar']
        .map(function (tipo) {
          var bag = locks[tipo] || {};
          return Object.keys(bag)
            .sort()
            .map(function (ref) {
              var l = bag[ref];
              return (
                ref +
                '@' +
                (l && l.deviceId ? String(l.deviceId) : '') +
                ':' +
                String((l && l.kind) || '') +
                ':' +
                String((l && l.userName) || '')
              );
            })
            .join(',');
        })
        .join(';');
      var presence = snap.slotSessionPresence || {};
      var presS = ['mesa', 'llevar']
        .map(function (tipo) {
          var bag = presence[tipo] || {};
          return Object.keys(bag)
            .sort()
            .map(function (ref) {
              var peers = bag[ref] || {};
              return (
                ref +
                '=' +
                Object.keys(peers)
                  .sort()
                  .map(function (devId) {
                    var p = peers[devId];
                    return devId + '@' + String((p && p.userName) || '');
                  })
                  .join('+')
              );
            })
            .join(',');
        })
        .join(';');
      var closed = snap.closedSlots || {};
      var closedS = ['mesa', 'llevar']
        .map(function (tipo) {
          return Object.keys(closed[tipo] || {})
            .sort()
            .join(',');
        })
        .join(';');
      var comSig = activeComandasSig(snap.activeComandas || snap.comandas);
      return (
        cartMapContentSig(snap.cartsPorMesa) +
        '||' +
        cartMapContentSig(snap.cartsPorLlevar) +
        '||d' +
        (snap.cartDirecto || []).length +
        '||l' +
        lockS +
        '||p' +
        presS +
        '||c' +
        closedS +
        '||a' +
        comSig
      );
    } catch (_) {
      return String(Date.now()) + Math.random();
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

  /**
   * MERGE-ON-WRITE para modo SEDE (una sola fila por sede).
   *
   * El problema raíz de "comando en una mesa y otra no se ve": en modo sede
   * todos los equipos escriben la MISMA fila; un upsert ciego pisa las mesas de
   * los demás (el último que escribe gana). Las COMANDAS no sufren esto porque
   * cada una es su propia fila. Aquí replicamos esa idea: antes de escribir,
   * fusionamos con lo que ya hay en la nube para NO borrar mesas de otros
   * equipos. Lo local manda para sus mesas; lo de otros se preserva; lo cobrado
   * localmente (closedSlots) no se resucita.
   */
  function mergeSedeSnapshots(cloudPay, localSnap) {
    if (!cloudPay || typeof cloudPay !== 'object') return localSnap;
    var merged = localSnap;
    ['cartsPorMesa', 'cartsPorLlevar'].forEach(function (mapKey) {
      var tipo = mapKey === 'cartsPorMesa' ? 'mesa' : 'llevar';
      var localMap = merged[mapKey] && typeof merged[mapKey] === 'object' ? merged[mapKey] : {};
      var cloudMap = cloudPay[mapKey] && typeof cloudPay[mapKey] === 'object' ? cloudPay[mapKey] : {};
      var localClosed = (merged.closedSlots && merged.closedSlots[tipo]) || {};
      Object.keys(cloudMap).forEach(function (ref) {
        var cloudLines = cloudMap[ref];
        if (!Array.isArray(cloudLines) || !cloudLines.length) return;
        var localLines = localMap[ref];
        if (Array.isArray(localLines) && localLines.length) return; // local manda para su mesa
        if (localClosed[ref]) return; // local la cobró → no resucitar
        localMap[ref] = cloudLines; // mesa de OTRO equipo → preservar (no pisar)
      });
      merged[mapKey] = localMap;
    });
    // closedSlots: lo pagado por cualquiera se respeta, salvo que ahora tenga
    // consumo (mesa reabierta). Así el cobro se propaga sin re-resucitar.
    ['mesa', 'llevar'].forEach(function (tipo) {
      var mapKey = tipo === 'mesa' ? 'cartsPorMesa' : 'cartsPorLlevar';
      var cloudClosed = (cloudPay.closedSlots && cloudPay.closedSlots[tipo]) || {};
      if (!merged.closedSlots) merged.closedSlots = { mesa: {}, llevar: {} };
      if (!merged.closedSlots[tipo]) merged.closedSlots[tipo] = {};
      var mergedClosed = merged.closedSlots[tipo];
      var carts = merged[mapKey] || {};
      Object.keys(cloudClosed).forEach(function (ref) {
        if (!cloudClosed[ref]) return;
        var lines = carts[ref];
        if (Array.isArray(lines) && lines.length) return; // reabierta con consumo
        mergedClosed[ref] = true;
      });
    });
    merged.slotSessionPresence = mergeSedePresence(
      cloudPay.slotSessionPresence,
      merged.slotSessionPresence
    );
    return merged;
  }

  /** Presencia parcial por equipo: vacío en un tipo = no tocar ese tipo en nube.
   *  Ref vacío local = no tocar ese slot (nunca borrar peers ajenos).
   *  Peer con _remove = quitar solo ese deviceId del slot en nube. */
  /** Quita peers expirados del meta remoto antes de aplicar (TTL presencia sesión). */
  function pruneExpiredSlotPresence(presence) {
    if (!presence || typeof presence !== 'object') return { mesa: {}, llevar: {} };
    var now = Date.now();
    var out = { mesa: {}, llevar: {} };
    ['mesa', 'llevar'].forEach(function (tipo) {
      var bag = presence[tipo] && typeof presence[tipo] === 'object' ? presence[tipo] : {};
      var mergedBag = {};
      Object.keys(bag).forEach(function (ref) {
        var peers = bag[ref];
        if (!peers || typeof peers !== 'object') return;
        var kept = {};
        Object.keys(peers).forEach(function (devId) {
          var p = peers[devId];
          if (!p || p._remove === true) return;
          if (Number(p.expiresAt || 0) > now) kept[devId] = p;
        });
        if (Object.keys(kept).length) mergedBag[ref] = kept;
      });
      out[tipo] = mergedBag;
    });
    return out;
  }

  function mergeSedePresence(cloudPresence, localPresence) {
    var cloud =
      cloudPresence && typeof cloudPresence === 'object' ? cloudPresence : { mesa: {}, llevar: {} };
    var local =
      localPresence && typeof localPresence === 'object' ? localPresence : { mesa: {}, llevar: {} };
    var out = { mesa: {}, llevar: {} };
    ['mesa', 'llevar'].forEach(function (tipo) {
      var cloudBag = cloud[tipo] && typeof cloud[tipo] === 'object' ? cloud[tipo] : {};
      var localBag = local[tipo] && typeof local[tipo] === 'object' ? local[tipo] : {};
      var mergedBag = JSON.parse(JSON.stringify(cloudBag));
      if (!Object.keys(localBag).length) {
        out[tipo] = mergedBag;
        return;
      }
      Object.keys(localBag).forEach(function (ref) {
        var localPeers = localBag[ref];
        if (!localPeers || typeof localPeers !== 'object') return;
        var peerKeys = Object.keys(localPeers);
        if (!peerKeys.length) return;
        if (!mergedBag[ref]) mergedBag[ref] = {};
        peerKeys.forEach(function (devId) {
          var peer = localPeers[devId];
          if (!peer || peer._remove === true) {
            delete mergedBag[ref][devId];
            return;
          }
          mergedBag[ref][devId] = peer;
        });
        if (!Object.keys(mergedBag[ref]).length) delete mergedBag[ref];
      });
      out[tipo] = mergedBag;
    });
    return out;
  }

  async function upsertRuntimeRow(snap) {
    if (!cloudTransportActive()) return false;
    var c = ctx();
    if (!c.locationId || c.locationId === 'default') return false;
    var sb = global.__SUPABASE;
    // MERGE-ON-WRITE: leer el estado actual en la nube y fusionar, para no pisar
    // las mesas de otros equipos (la fila es única por sede).
    try {
      var cur = await sb
        .from(TABLE)
        .select('payload')
        .eq('location_id', c.locationId)
        .limit(1)
        .maybeSingle();
      if (cur && !cur.error && cur.data && cur.data.payload) {
        var before = Object.keys((snap && snap.cartsPorMesa) || {}).length;
        snap = mergeSedeSnapshots(cur.data.payload, snap);
        var after = Object.keys((snap && snap.cartsPorMesa) || {}).length;
        try { console.log('[runtime-cloud] sede merge mesas ' + before + '→' + after + ' (preserva otras mesas)'); } catch (_) {}
      }
    } catch (_) {}
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
    if (!runtimeLanPushAllowed()) return false;
    var c = ctx();
    var rtId = 'rt:' + String(snap.savedAt || snap.v || Date.now());
    var body = {
      uuid: rtId,
      action_id: rtId,
      businessId: c.businessId,
      deviceId: c.deviceId,
      type: 'runtime',
      data: snap,
    };
    if (typeof global.crozzoLanEnsureActionId === 'function') global.crozzoLanEnsureActionId(body);
    if (typeof global.crozzoLanPostSync !== 'function') return false;
    try {
      var okNative = await global.crozzoLanPostSync(body, { timeoutMs: 5000 });
      if (okNative) {
        __echoUntil = Date.now() + ECHO_MS;
        __lastPushSig = payloadSig(snap);
        __lastPushAt = Date.now();
        return true;
      }
    } catch (_) {}
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
  var __mesaPullPending = false;
  var __lastMesaPullAt = 0;
  var __runtimeTeardownTimer = null;
  var __runtimeSubscribing = false;
  var __lastDiscardLogAt = 0;
  var CART_KEYS = ['cartsPorMesa', 'cartsPorLlevar', 'cartDirecto'];
  /** Estado de navegación local por terminal — no sincronizar en fila meta de nube. */
  var UI_LOCAL_KEYS = [
    'tipoServicioCaja',
    'mesaSeleccionada',
    'llevarSeleccionado',
    'tabletModoPedido',
    'tabletMesaSeleccionada',
    'tabletLlevarSeleccionado',
    'tabletOrderOpen',
    'cajaMesaOrderOpen',
    'cajaLlevarOrderOpen',
    'cajaMesaSearch',
    'cajaLlevarSearch',
    'cajaSlotFilter',
    'directSaveMenuOpen',
    'directSaveMode',
    'directSaveTargetId',
    'productCategoryOpen',
    'selectedProductCategory',
    'productSearchTerm',
    'tabletTargetSearch',
  ];

  function metaFromSnap(snap) {
    var meta = {};
    Object.keys(snap || {}).forEach(function (k) {
      if (CART_KEYS.indexOf(k) >= 0) return;
      if (UI_LOCAL_KEYS.indexOf(k) >= 0) return;
      // savedAt es VOLÁTIL (cambia en cada push). Si va en el payload de la fila
      // meta, su firma cambia siempre → la fila meta se re-escribe en CADA push →
      // evento realtime → pull → tormenta de "mismo contenido". Lo excluimos: el
      // orden/tiempo lo da la columna updated_at de la fila (y snapFromMesaRows
      // reconstruye savedAt desde el max(updated_at)).
      if (k === 'savedAt') return;
      meta[k] = snap[k];
    });
    meta._c = 1;
    return meta;
  }

  function mesaRowsFromSnap(snap, c) {
    var iso = new Date(Number(snap.savedAt) || Date.now()).toISOString();
    var rows = [];
    var forceEmpty = global.__crozzoRuntimeForceEmptySlots || { mesa: {}, llevar: {} };
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
      var lines = m[ref] || [];
      if (!lines.length && !(forceEmpty.mesa && forceEmpty.mesa[ref])) return;
      add('mesa', ref, lines);
    });
    var l = snap.cartsPorLlevar || {};
    Object.keys(l).forEach(function (ref) {
      var lines = l[ref] || [];
      if (!lines.length && !(forceEmpty.llevar && forceEmpty.llevar[ref])) return;
      add('llevar', ref, lines);
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
    // Timestamp por slot (updated_at de su fila): permite al receptor decidir si
    // un slot VACÍO remoto es un vaciado AUTORITATIVO más nuevo (caja borró/
    // liquidó/movió) que debe aplicarse, vs un dato viejo que no debe pisar.
    var slotTs = {};
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var at = Date.parse(r.updated_at || 0) || 0;
      if (at > maxAt) maxAt = at;
      var lines = r.payload && r.payload.lines;
      if (r.kind === 'meta') {
        base = r.payload && typeof r.payload === 'object' ? r.payload : {};
        if (base.slotSessionPresence) {
          base.slotSessionPresence = pruneExpiredSlotPresence(base.slotSessionPresence);
        }
      } else if (r.kind === 'mesa') {
        carts.mesa[r.ref] = Array.isArray(lines) ? lines : [];
        slotTs['mesa:' + r.ref] = at;
      } else if (r.kind === 'llevar') {
        carts.llevar[r.ref] = Array.isArray(lines) ? lines : [];
        slotTs['llevar:' + r.ref] = at;
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
    base._slotUpdatedAt = slotTs;
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
    // VACIADO AUTORITATIVO: una mesa/llevar que ANTES empujamos (está en
    // __mesaSlotSig) y que YA NO aparece en el snap (caja la borró/liquidó/movió/
    // dividió/juntó) debe escribirse como fila VACÍA en la nube, con timestamp
    // fresco. Sin esto, su fila quedaba con los ítems viejos y los demás equipos
    // seguían viendo la mesa ocupada. Se hace una sola vez (luego su firma ya es
    // vacía y no se repite).
    var emptySig = JSON.stringify({ lines: [] });
    var presentKeys = {};
    for (var ri = 0; ri < rows.length; ri++) {
      presentKeys[rows[ri].kind + ':' + rows[ri].ref] = 1;
    }
    var nowIso = new Date().toISOString();
    Object.keys(__mesaSlotSig).forEach(function (key) {
      if (presentKeys[key]) return;
      var parts = key.split(':');
      var kind = parts[0];
      if (kind !== 'mesa' && kind !== 'llevar') return;
      if (__mesaSlotSig[key] === emptySig) return; // ya está vacía en la nube
      var ref = parts.slice(1).join(':');
      rows.push({
        location_id: c.locationId,
        business_id: c.businessId,
        kind: kind,
        ref: ref,
        payload: { lines: [] },
        source_device_id: c.deviceId,
        source_role: c.role,
        updated_at: nowIso,
      });
    });
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
    var metaPushIdx = -1;
    for (var mj = 0; mj < toUpsert.length; mj++) {
      if (toUpsert[mj].kind === 'meta') {
        metaPushIdx = mj;
        break;
      }
    }
    if (metaPushIdx >= 0) {
      try {
        var curMeta = await sb
          .from(MESA_TABLE)
          .select('payload')
          .eq('location_id', c.locationId)
          .eq('kind', 'meta')
          .eq('ref', '__meta__')
          .maybeSingle();
        if (curMeta && !curMeta.error && curMeta.data && curMeta.data.payload) {
          var mergedMeta = mergeSedeSnapshots(curMeta.data.payload, toUpsert[metaPushIdx].payload);
          toUpsert[metaPushIdx].payload = mergedMeta;
          try {
            __mesaSlotSig['meta:__meta__'] = JSON.stringify(mergedMeta);
          } catch (_) {}
        }
      } catch (_) {}
    }
    try {
      var res = await sb.from(MESA_TABLE).upsert(toUpsert, { onConflict: 'location_id,kind,ref' });
      if (!res.error) {
        try {
          var refsUp = toUpsert.filter(function (r) { return r.kind !== 'meta'; }).map(function (r) { return r.kind + ':' + r.ref; });
          console.log('[runtime-cloud] pushMesaRows OK · filas=' + toUpsert.length + ' [' + refsUp.join(',') + ']');
        } catch (_) {}
        __echoUntil = Date.now() + ECHO_MS;
        __lastPushSig = payloadSig(snap);
        __lastPushAt = Date.now();
        return true;
      }
      noteCloudErr(res.error);
      var msg = String((res.error && res.error.message) || res.error || '');
      console.warn('[runtime-cloud] pushMesaRows ERROR (las mesas NO llegan a la nube): ' + msg);
      if (/401|403|permission denied|rls|jwt|forbidden/i.test(msg)) {
        console.warn('[runtime-cloud] → RLS/permiso bloquea crozzo_mesa_runtime. Ejecute el SQL "10. Runtime en vivo" en Supabase.');
      }
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
    if (!opRealtimeActive()) return false;
    opts = opts || {};
    var now = Date.now();
    if (!opts.force) {
      var minGap = MESA_PULL_MIN_GAP_MS;
      var thrGap = global.CrozzoCloudThrottle;
      if (thrGap && typeof thrGap.isUnderPressure === 'function' && thrGap.isUnderPressure()) {
        minGap = Math.min(15000, minGap * 2);
      }
      if (__lastMesaPullAt && now - __lastMesaPullAt < minGap) {
        __mesaPullPending = true;
        if (!__mesaPullTimer) {
          scheduleMesaPull({ deferMs: minGap - (now - __lastMesaPullAt) + 80 });
        }
        return false;
      }
    }
    __lastMesaPullAt = now;
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
      var originDev = '';
      try {
        var rowsIn = res.data || [];
        var bestAt = 0;
        for (var ri = 0; ri < rowsIn.length; ri++) {
          var rr = rowsIn[ri];
          if (!rr || rr.kind === 'meta') continue;
          var rat = Date.parse(rr.updated_at || 0) || 0;
          if (rat >= bestAt && rr.source_device_id) {
            bestAt = rat;
            originDev = String(rr.source_device_id).trim();
          }
        }
      } catch (_) {}
      return applyRemoteRow(
        { payload: built.snap, saved_at: new Date(built.savedAt).toISOString(), source_device_id: originDev },
        Object.assign({ aggregate: true }, opts || {})
      );
    } catch (e) {
      return false;
    }
  }

  function notifyRuntimeUiIfApplied(applied) {
    if (!applied) return;
    try {
      if (typeof global.crozzoHandleRemoteRuntimeUiSync === 'function') {
        global.crozzoHandleRemoteRuntimeUiSync();
      }
    } catch (_) {}
  }

  function scheduleMesaPull(opts) {
    opts = opts || {};
    if (__mesaPullTimer) return;
    // Coalescer ráfagas Realtime → un pull. Min-gap en pullMesaRows evita SELECT
    // repetidos cuando muchos equipos renuevan presencia (equilibrio meses en nube).
    var delay = Number(opts.deferMs);
    if (!Number.isFinite(delay) || delay < 0) {
      delay = opts.immediate ? 60 : MESA_PULL_COALESCE_MS;
    }
    __mesaPullTimer = global.setTimeout(function () {
      __mesaPullTimer = null;
      pullMesaRows({ quiet: true, skipRender: true })
        .then(function (applied) {
          if (__mesaPullPending) {
            __mesaPullPending = false;
            scheduleMesaPull({ deferMs: 120 });
          }
          notifyRuntimeUiIfApplied(applied);
        })
        .catch(function () {});
    }, delay);
  }

  async function pushRuntimeNow(opts) {
    opts = opts || {};
    if (global.__crozzoSuppressRuntimePush) return false;
    try {
      if (typeof global.crozzoEnsureSedeLocationId === 'function') global.crozzoEnsureSedeLocationId();
    } catch (_) {}
    var allowCloud = cloudTransportActive();
    var allowLan = runtimeLanPushAllowed();
    if (!allowCloud && !allowLan) return false;
    var full = collectFull();
    var snap = packForCloud(full);
    if (!snap) return false;
    var sig = payloadSig(snap);
    var dedupWindow = opts.force ? 1200 : 4000;
    if (sig === __lastPushSig && Date.now() - __lastPushAt < dedupWindow) {
      return true;
    }
    snap.savedAt = Date.now();
    var lanLikely = allowLan;
    if (allowLan && !lanLikely) {
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
    var lanP = lanLikely ? pushRuntimeLan(snap).catch(function () { return false; }) : Promise.resolve(false);
    var cloudOk = false;
    if (allowCloud) {
      if (await ensureMesaMode()) {
        cloudOk = await pushMesaRows(snap, ctx());
      } else {
        cloudOk = await upsertRuntimeRow(snap);
      }
    }
    var lanOk = await lanP;
    try {
      if (global.__crozzoRuntimeForceEmptySlots) {
        global.__crozzoRuntimeForceEmptySlots = { mesa: {}, llevar: {} };
      }
    } catch (_) {}
    if (cloudOk || lanOk) {
      __lastPushSig = sig;
      __lastPushAt = Date.now();
    }
    if (allowCloud && !cloudOk) {
      if (!cloudUnderPressure()) scheduleRuntimePushRetry();
    } else if (cloudOk) {
      __pushRetryAttempt = 0;
      if (__pushRetryTimer) {
        clearTimeout(__pushRetryTimer);
        __pushRetryTimer = null;
      }
      try {
        if (typeof global.crozzoOpsPulseEmit === 'function') global.crozzoOpsPulseEmit('runtime');
      } catch (_) {}
    }
    return cloudOk || lanOk;
  }

  function scheduleRuntimePushRetry() {
    if (__pushRetryTimer) return;
    if (!cloudTransportActive()) return;
    if (cloudUnderPressure()) return;
    __pushRetryAttempt = Math.min(__pushRetryAttempt + 1, 10);
    var ms = Math.min(PUSH_RETRY_MAX_MS, PUSH_RETRY_BASE_MS * Math.pow(1.6, __pushRetryAttempt));
    __pushRetryTimer = global.setTimeout(function () {
      __pushRetryTimer = null;
      if (!cloudTransportActive()) {
        __pushRetryAttempt = 0;
        return;
      }
      if (cloudUnderPressure()) return;
      pushRuntimeNow({ force: true }).catch(function () {});
    }, ms);
  }

  function schedulePush(priority) {
    if (global.__crozzoSuppressRuntimePush) return;
    try {
      if (typeof global.crozzoEnsureSedeLocationId === 'function') global.crozzoEnsureSedeLocationId();
    } catch (_) {}
    var c = ctx();
    if (!c.locationId || c.locationId === 'default') return;
    var p = priority === 'fast' || priority === 'flush' ? priority : 'normal';
    if (p === 'flush') {
      if (__pushTimer) {
        clearTimeout(__pushTimer);
        __pushTimer = null;
      }
      if (cloudUnderPressure()) return;
      pushRuntimeNow({ force: true }).catch(function () {});
      return;
    }
    if (p === 'fast') {
      __pushPending = 'fast';
      if (runtimeLanPushAllowed()) {
        try {
          var fullFast = collectFull();
          var snapFast = packForCloud(fullFast);
          if (snapFast) {
            snapFast.savedAt = Date.now();
            pushRuntimeLan(snapFast).catch(function () {});
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
      if (cloudUnderPressure()) return;
      pushRuntimeNow({ force: mode === 'fast' }).catch(function () {});
    }, ms);
  }

  function maybeRerender() {
    var pages = ['cajero', 'tablets', 'comandas', 'cocina', 'mesas'];
    try {
      if (pages.indexOf(global.currentPage) >= 0 && typeof global.crozzoScheduleOperationalPageRefresh === 'function') {
        global.crozzoScheduleOperationalPageRefresh(global.currentPage);
      }
    } catch (_) {}
  }

  function applyRemoteRow(row, opts) {
    if (!row) return false;
    var pay = row.payload || row.payload_json;
    if (!pay || typeof pay !== 'object') { console.warn('[runtime-cloud] applyRemoteRow: payload inválido', row); return false; }
    var slotTs = pay._slotUpdatedAt || null; // timestamp por slot (modo por-mesa)
    pay = unpackForApply(pay);
    var remoteAt = Number(pay.savedAt) || Date.parse(row.saved_at || row.updated_at || 0) || 0;
    if (!remoteAt) { console.warn('[runtime-cloud] applyRemoteRow: sin timestamp remoto'); return false; }
    var mesaKeys2 = Object.keys(pay.cartsPorMesa || {});
    if (pay.slotSessionPresence) {
      pay.slotSessionPresence = pruneExpiredSlotPresence(pay.slotSessionPresence);
    }
    var contentSig = payloadSig(pay);
    var sameContent = contentSig === __lastAppliedContentSig;
    if (sameContent && !(opts && opts.force)) {
      if (remoteAt > __lastRemoteAt) __lastRemoteAt = remoteAt;
      var nowLog = Date.now();
      if (nowLog - __lastDiscardLogAt > 8000) {
        __lastDiscardLogAt = nowLog;
        try {
          console.log('[runtime-cloud] applyRemoteRow: mismo contenido, descartado');
        } catch (_) {}
      }
      return false;
    }
    var isAggregate = !!(opts && opts.aggregate);
    if (!(opts && opts.force) && !isAggregate && mesaKeys2.length === 0) {
      if (__lastRemoteAt && remoteAt && remoteAt < __lastRemoteAt - 400) {
        return false;
      }
      var localMesas = 0;
      try {
        var lm = global.cartsPorMesa || {};
        localMesas = Object.keys(lm).filter(function (k) {
          return Array.isArray(lm[k]) && lm[k].length;
        }).length;
      } catch (_) {}
      if (localMesas > 0) {
        var nowEmpty = Date.now();
        if (nowEmpty - __lastDiscardLogAt > 8000) {
          __lastDiscardLogAt = nowEmpty;
          try {
            console.warn('[runtime-cloud] applyRemoteRow: snapshot vacío ignorado (local mesas=' + localMesas + ')');
          } catch (_) {}
        }
        return false;
      }
    }
    // opts.aggregate: el pull por-mesa reconstruye un snapshot que MEZCLA mesas
    // de TODOS los equipos. No tiene un solo "dueño", así que NO se le puede
    // aplicar el guard de "mismo equipo + más viejo" (rechazaba TODO el agregado
    // —incluida la mesa que comandó el otro equipo— solo porque la fila más
    // reciente resultaba ser de este equipo). La deduplicación por contenido y
    // el merge de carritos ya evitan reaplicar lo propio o pisar lo local.
    var srcDevGuard = String(row.source_device_id || pay._cloudOriginDevice || '').trim();
    var myDevGuard = ctx().deviceId;
    var sameDeviceGuard = !!(srcDevGuard && myDevGuard && srcDevGuard === myDevGuard);
    if (!(opts && opts.force) && !isAggregate) {
      var localAtGuard = localSavedAt();
      /* Solo el mismo equipo rechaza por savedAt viejo; tablet→caja puede traer carrito más reciente con timestamp anterior. */
      if (sameDeviceGuard && localAtGuard && remoteAt && remoteAt < localAtGuard - 500) {
        try { console.warn('[runtime-cloud] applyRemoteRow: remoto más viejo que local (mismo equipo), descartado. remote=' + remoteAt + ' local=' + localAtGuard); } catch (_) {}
        return false;
      }
    }
    if (Date.now() < __echoUntil && !(opts && opts.force) && !isAggregate) {
      var localAtEcho = localSavedAt();
      if (!remoteAt || remoteAt <= localAtEcho + 1200) return false;
    }
    if (!(opts && opts.force)) {
      var localAt = localSavedAt();
      if (__pushTimer && sameContent && remoteAt <= localAt + 800) return false;
    } else if (__pushTimer) {
      clearTimeout(__pushTimer);
      __pushTimer = null;
    }
    var srcDev = String(row.source_device_id || '').trim();
    var myDev = ctx().deviceId;
    if (srcDev && myDev && srcDev === myDev && sameContent && remoteAt <= localSavedAt() + 500) return false;
    if (typeof global.applyPosRuntimeSnapshot !== 'function') return false;
    try {
      var nowApplyLog = Date.now();
      if (nowApplyLog - __lastApplyRemoteLogAt > 4000) {
        __lastApplyRemoteLogAt = nowApplyLog;
        console.log(
          '[runtime-cloud] applyRemoteRow: aplicando v=' +
            pay.v +
            ' mesas=' +
            mesaKeys2.length +
            ' remoteAt=' +
            remoteAt
        );
      }
    } catch (_) {}
    var ok = global.applyPosRuntimeSnapshot(pay, { skipUiFields: true, slotUpdatedAt: slotTs });
    if (!ok) return false;
    __lastRemoteAt = remoteAt;
    __lastAppliedContentSig = contentSig;
    if (pickerSig) __lastAppliedPickerSig = pickerSig;
    else if (localPickerSig) __lastAppliedPickerSig = localPickerSig;
    try {
      global.__crozzoRuntimeCloudApplying = true;
      if (typeof global.savePosRuntimeToLocalStorage === 'function') {
        global.savePosRuntimeToLocalStorage();
      }
    } catch (_) {}
    try {
      global.__crozzoRuntimeCloudApplying = false;
    } catch (_) {}
    var uiQuiet = !!(opts && (opts.skipRender || opts.quiet));
    if (!uiQuiet) maybeRerender();
    notifyRuntimeUiIfApplied(true);
    return true;
  }

  /** Tiempo real solo en pantallas operativas (cajero/tablets/comandas/cocina/mesas/venta). */
  function opRealtimeActive() {
    try {
      if (typeof global.crozzoOperationalRealtimeActive === 'function') {
        return global.crozzoOperationalRealtimeActive();
      }
    } catch (_) {}
    return false;
  }

  async function pullRuntime(opts) {
    // Fuera de operación (Inicio, Gestión, Costos, Config…) no se sincroniza en vivo.
    if (!opRealtimeActive()) return false;
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
          var applied = applyRemoteRow(res.data, opts);
          if (applied) __lastMesaPullAt = Date.now();
          return applied;
        }
        if (res.error) {
          noteCloudErr(res.error);
          var msg = String((res.error && res.error.message) || res.error || '');
          if (/relation|does not exist|404|PGRST205/i.test(msg)) __tableMissing = true;
        }
      } catch (e) {
        console.warn('[runtime-cloud] pull cloud', e);
        noteCloudErr(e);
      }
      if (!cloudWanReady()) {
        try {
          if (await lanSegmentUp()) return pullRuntimeLan(opts);
        } catch (_) {}
      }
      // Fase nube: no mezclar pull LAN si Supabase responde bien.
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
    if (typeof global.crozzoCloudBackgroundSyncAllowed === 'function' && !global.crozzoCloudBackgroundSyncAllowed()) {
      return;
    }
    var throttle = global.CrozzoCloudThrottle;
    if (throttle && typeof throttle.isUnderPressure === 'function' && throttle.isUnderPressure()) return;
    if (typeof global.syncOfflineQueue === 'function') {
      global.syncOfflineQueue({ kind: 'stability', priority: 2 }).catch(function () {});
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
      // Watchdog: si el canal dice estar vivo pero lleva mucho tiempo
      // sin entregar eventos, forzar pull de reconciliación.
      var silenceSinceEvt = __lastRtEventAt ? Date.now() - __lastRtEventAt : Infinity;
      var watchdogFired = __realtimeLive && silenceSinceEvt > SILENCE_WATCHDOG_MS;
      pullRuntime({ quiet: true, skipRender: !watchdogFired, force: watchdogFired })
        .then(notifyRuntimeUiIfApplied)
        .catch(function () {});
    }, ms);
  }

  function subscribeRealtime(reason) {
    if (!cloudTransportActive()) return;
    if (__runtimeSubscribing) return;
    // Si el canal ya está vivo no destruirlo — evita loop CLOSED.
    if (__realtimeLive && __pgCh) return;
    var c = ctx();
    if (!c.locationId || c.locationId === 'default') return;
    teardownRuntimeChannel({ skipRemove: !__realtimeLive });
    __runtimeSubscribing = true;
    ensureMesaMode().then(function (useMesa) {
      if (!cloudTransportActive()) {
        __runtimeSubscribing = false;
        return;
      }
      try {
        var filter = 'location_id=eq.' + c.locationId;
        var tbl = useMesa ? MESA_TABLE : TABLE;
        __pgCh = global.__SUPABASE.channel(
          'crozzo_runtime_live_' + (useMesa ? 'm_' : '') + c.locationId.replace(/[^a-zA-Z0-9_]/g, '_')
        );
        var onEvt = useMesa
          ? function () {
              __lastRtEventAt = Date.now();
              if (!opRealtimeActive()) return;
              scheduleMesaPull({ immediate: true, deferMs: 80 });
            }
          : function (p) {
              __lastRtEventAt = Date.now();
              if (!opRealtimeActive()) return;
              if (p.new) {
                var appliedRow = applyRemoteRow(p.new, { quiet: true });
                if (appliedRow) notifyRuntimeUiIfApplied(true);
              }
            };
        __pgCh.on('postgres_changes', { event: 'INSERT', schema: 'public', table: tbl, filter: filter }, onEvt);
        __pgCh.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: tbl, filter: filter }, onEvt);
        __pgCh.subscribe(function (st) {
          if (st === 'SUBSCRIBED') {
            __realtimeLive = true;
            __rtResubAttempt = 0;
            try {
              var thrOk = global.CrozzoCloudThrottle;
              if (thrOk && typeof thrOk.maybeClearPressureOnHealthySignal === 'function') {
                thrOk.maybeClearPressureOnHealthySignal('subscribed');
              }
            } catch (_) {}
            schedulePullLoop();
          } else if (st === 'CHANNEL_ERROR' || st === 'CLOSED' || st === 'TIMED_OUT') {
            __realtimeLive = false;
            schedulePullLoop();
            global.setTimeout(function () {
              if (!cloudTransportActive() || !cloudWanReady()) {
                stopRuntimeCloudSync();
                return;
              }
              if (cloudUnderPressure()) return;
              scheduleRuntimeResubscribe(st);
            }, 0);
          }
        });
      } catch (e) {
        console.warn('[runtime-cloud] subscribe', e);
        noteCloudErr(e);
        scheduleRuntimeResubscribe('exception');
      } finally {
        __runtimeSubscribing = false;
      }
    });
  }

  function stopRuntimeCloudSync() {
    __started = false;
    __realtimeLive = false;
    __runtimeSubscribing = false;
    if (__rtResubTimer) {
      clearTimeout(__rtResubTimer);
      __rtResubTimer = null;
    }
    __rtResubAttempt = 0;
    if (__pushTimer) {
      clearTimeout(__pushTimer);
      __pushTimer = null;
    }
    if (__pushRetryTimer) {
      clearTimeout(__pushRetryTimer);
      __pushRetryTimer = null;
    }
    __pushRetryAttempt = 0;
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
    if (!cloudTransportActive()) {
      stopRuntimeCloudSync();
      return;
    }
    if (typeof global.crozzoEnsureSedeLocationId === 'function') {
      try {
        global.crozzoEnsureSedeLocationId();
      } catch (_) {}
    }
    if (opts.resetTableMissing) {
      __tableMissing = false;
      __mesaMode = null; // re-detectar modo por-mesa tras reparar RLS/tabla
      __mesaSlotSig = {};
    }
    if (__started) {
      if (!cloudTransportActive()) {
        stopRuntimeCloudSync();
        return;
      }
      // No re-suscribir si el canal ya está vivo — el teardown generaría
      // un CLOSED innecesario que corta la sincronización de mesas.
      if (!__realtimeLive) subscribeRealtime('refresh');
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
  global.crozzoBumpRuntimeCloudEcho = function (ms) {
    __echoUntil = Date.now() + (Number(ms) > 0 ? Number(ms) : ECHO_MS);
  };
  global.crozzoPushPosRuntimeCloudNow = function () {
    return pushRuntimeNow({ force: true });
  };
  /** Solo metadatos de frescura remota (savedAt), sin aplicar snapshot. */
  async function probeRemoteRuntimeMeta(opts) {
    opts = opts || {};
    var skipLan = !!opts.skipLan;
    var lanTimeoutMs = Number(opts.lanTimeoutMs) > 0 ? Number(opts.lanTimeoutMs) : 4500;
    var out = { found: false, savedAt: 0, remoteAt: 0, source: '', slotUpdatedAt: {}, remoteSlotLines: {} };
    function fillSlotMetaFromSnap(snap) {
      if (!snap || typeof snap !== 'object') return;
      out.slotUpdatedAt = snap._slotUpdatedAt && typeof snap._slotUpdatedAt === 'object' ? snap._slotUpdatedAt : {};
      try {
        var cm = snap.cartsPorMesa || {};
        Object.keys(cm).forEach(function (ref) {
          out.remoteSlotLines['mesa:' + ref] = Array.isArray(cm[ref]) ? cm[ref].length : 0;
        });
        var cl = snap.cartsPorLlevar || {};
        Object.keys(cl).forEach(function (ref) {
          out.remoteSlotLines['llevar:' + ref] = Array.isArray(cl[ref]) ? cl[ref].length : 0;
        });
      } catch (_) {}
    }
    var c = ctx();
    if (!c.locationId || c.locationId === 'default') return out;
    if (cloudTransportActive()) {
      var sb = global.__SUPABASE;
      if (sb) {
        try {
          if (await ensureMesaMode()) {
            var mres = await sb
              .from(MESA_TABLE)
              .select('updated_at,payload,kind')
              .eq('location_id', c.locationId);
            if (!mres.error && Array.isArray(mres.data)) {
              var built = snapFromMesaRows(mres.data);
              if (built && built.savedAt) {
                out.found = true;
                out.savedAt = Number(built.savedAt) || 0;
                out.remoteAt = out.savedAt;
                out.source = 'cloud_mesa';
                fillSlotMetaFromSnap(built.snap);
                return out;
              }
            }
          }
          var res = await sb
            .from(TABLE)
            .select('saved_at,updated_at,payload')
            .eq('location_id', c.locationId)
            .limit(1)
            .maybeSingle();
          if (!res.error && res.data) {
            var pay = res.data.payload || {};
            var remoteAt =
              Number(pay.savedAt) ||
              Date.parse(res.data.saved_at || res.data.updated_at || 0) ||
              0;
            if (remoteAt) {
              out.found = true;
              out.savedAt = remoteAt;
              out.remoteAt = remoteAt;
              out.source = 'cloud';
              fillSlotMetaFromSnap(pay);
              return out;
            }
          }
        } catch (_) {}
      }
    }
    var host = lanCentralHost();
    if (!skipLan && host) {
      try {
        var md = typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
        var port = Number(md.port) || 3000;
        var controller = new AbortController();
        var t = global.setTimeout(function () {
          controller.abort();
        }, lanTimeoutMs);
        var lanRes = await global.fetch('http://' + host + ':' + port + '/api/runtime', {
          method: 'GET',
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        global.clearTimeout(t);
        if (lanRes.ok) {
          var j = await lanRes.json().catch(function () {
            return null;
          });
          if (j) {
            var lanAt = Number(j.payload && j.payload.savedAt) || Date.parse(j.saved_at || 0) || 0;
            if (lanAt) {
              out.found = true;
              out.savedAt = lanAt;
              out.remoteAt = lanAt;
              out.source = 'lan';
              fillSlotMetaFromSnap(j.payload || {});
              return out;
            }
          }
        }
      } catch (_) {}
    }
    return out;
  }

  global.crozzoProbeRemoteRuntimeMeta = probeRemoteRuntimeMeta;
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
  global.crozzoResetRuntimeSyncDedup = function () {
    __lastAppliedContentSig = '';
    __lastAppliedPickerSig = '';
    __lastRemoteAt = 0;
    __lastPushSig = '';
    __mesaSlotSig = {};
  };

  /** Arranque/reparación central de sync nube (runtime + comandas). */
  var __ensureCloudSyncInflight = null;
  global.crozzoEnsureCloudSyncActive = async function crozzoEnsureCloudSyncActive(opts) {
    opts = opts || {};
    if (__ensureCloudSyncInflight && !opts.force) {
      return __ensureCloudSyncInflight;
    }
    __ensureCloudSyncInflight = (async function () {
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
      if (opts.restartRealtime && typeof global.crozzoStopComandasCloudSync === 'function') {
        try {
          global.crozzoStopComandasCloudSync();
        } catch (_) {}
      }
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
        if (typeof global.crozzoStartOpsPulse === 'function') global.crozzoStartOpsPulse();
      } catch (_) {}
      try {
        if (typeof global.crozzoPullPosRuntimeCloud === 'function') {
          await global.crozzoPullPosRuntimeCloud({ quiet: true, skipRender: true });
        }
      } catch (_) {}
      try {
        if (typeof global.crozzoPullComandasFromCloud === 'function') {
          await global.crozzoPullComandasFromCloud({ skipPrint: true, skipRender: true, silent: true });
        }
      } catch (_) {}
      try {
        if (global.CrozzoInternalQrRegistry && typeof global.CrozzoInternalQrRegistry.pullPeersFromCloud === 'function') {
          await global.CrozzoInternalQrRegistry.pullPeersFromCloud();
        }
      } catch (_) {}
      try {
        if (typeof global.startCrozzoRemoteTenantSync === 'function') {
          global.startCrozzoRemoteTenantSync();
        }
      } catch (_) {}
      try {
        if (typeof global.crozzoEnsureRemoteStaffCatalogSync === 'function') {
          await global.crozzoEnsureRemoteStaffCatalogSync({ quiet: true });
        } else if (typeof global.crozzoPullRemoteStaffState === 'function') {
          await global.crozzoPullRemoteStaffState({ quiet: true, force: true, kind: 'post_login' });
        }
      } catch (_) {}
      try {
        global.__crozzoCloudSyncBootstrapped = true;
      } catch (_) {}
      return online() && !__tableMissing;
    })();
    try {
      return await __ensureCloudSyncInflight;
    } finally {
      __ensureCloudSyncInflight = null;
    }
  };
  global.crozzoPosRuntimeCloudIsLive = function () {
    return __started && !__tableMissing;
  };
  global.crozzoRuntimeCloudLastPullAt = function () {
    return __lastMesaPullAt || 0;
  };
  global.crozzoPosRuntimeCloudMode = function () {
    return __mesaMode === true ? 'mesa' : __mesaMode === false ? 'sede' : 'desconocido';
  };
  global.crozzoRuntimeRealtimeStatus = function () {
    return {
      live: __realtimeLive,
      hasChannel: !!__pgCh,
      lastEventAt: __lastRtEventAt,
      lastEventAgoMs: __lastRtEventAt ? Date.now() - __lastRtEventAt : null,
      started: __started,
      tableMissing: __tableMissing,
      mode: __mesaMode === true ? 'mesa' : __mesaMode === false ? 'sede' : 'desconocido',
    };
  };
  // Funciones puras expuestas para pruebas (extraccion/reconstruccion por mesa).
  global.__crozzoRuntimeMesaInternals = {
    mesaRowsFromSnap: mesaRowsFromSnap,
    snapFromMesaRows: snapFromMesaRows,
    mergeSedeSnapshots: mergeSedeSnapshots,
  };
  global.__crozzoMergeSedeSnapshots = mergeSedeSnapshots;
  global.__crozzoExpandRuntimeCartRow = expandCompactCartRow;

  if (typeof document !== 'undefined') {
    document.addEventListener('crozzo-multidevice-config-saved', function () {
      try {
        if (typeof global.crozzoEnsureSedeLocationId === 'function') global.crozzoEnsureSedeLocationId();
        if (cloudTransportActive()) startRuntimeCloudSync({ resetTableMissing: true });
      } catch (_) {}
    });
    document.addEventListener('crozzo-supabase-config-saved', function () {
      try {
        if (!cloudTransportActive()) return;
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
      if (!cloudTransportActive()) return;
      if (typeof global.crozzoEnsureCloudSyncActive === 'function') {
        global.setTimeout(function () {
          global.crozzoEnsureCloudSyncActive({ source: 'online' }).catch(function () {});
        }, 400);
      }
    });
    if (!global.__crozzoRuntimeCloudTierBound) {
      global.__crozzoRuntimeCloudTierBound = true;
      var onRuntimeTierShift = function () {
        try {
          if (!cloudTransportActive()) stopRuntimeCloudSync();
          else if (!__started) startRuntimeCloudSync();
        } catch (_) {}
      };
      global.addEventListener('crozzo-tier-changed', onRuntimeTierShift);
      global.addEventListener('crozzo-detector-tier-changed', onRuntimeTierShift);
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
