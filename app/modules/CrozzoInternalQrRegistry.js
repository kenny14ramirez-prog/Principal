/**
 * Crozzo — Registro interno de QRs de comunicación entre dispositivos.
 *
 * Cada equipo genera su QR cada 4 h (válido ~24 h). Todos guardan los QRs
 * de los demás (local + nube). Si falla cloud/LAN/malla, el sistema usa esa
 * base interna para reconectar y seguir enviando instrucciones sin parar.
 */
(function (global) {
  'use strict';

  var TABLE = 'crozzo_device_qr_slots';
  var LS_OWN = 'crozzo_daily_pairing_v2';
  var LS_PEERS = 'crozzo_internal_qr_peers_v1';
  var SLOT_HOURS = 4;
  var VALID_MS = 24 * 60 * 60 * 1000;
  var REFRESH_MS = 15 * 60 * 1000;
  var EMERGENCY_MS = 22000;
  var PEER_MAX = 48;
  var SLOTS_PER_PEER = 6;

  var __timer = null;
  var __emergencyTimer = null;
  var __emergencyActive = false;
  var __rtChannel = null;
  var __lastEmergencyAt = 0;
  var __lastMeshBroadcastAt = 0;
  var __lastMeshRequestAt = 0;
  var __tableMissing = false;
  var __tableMissingNotified = false;
  var MESH_BROADCAST_GAP_MS = 45000;
  var MESH_REQUEST_GAP_MS = 35000;

  // ── Backoff exponencial ──────────────────────────────────────────────────
  // Reintentos para peticiones cloud: 1 s, 2 s, 4 s (máx 3 intentos extra).
  // NO se reintenta si:
  //   - La tabla no existe (error permanente de esquema).
  //   - 409 Conflict: el registro ya existe/fue procesado por otro dispositivo,
  //     reintentar es inútil y genera ruido en los logs.
  //   - 401 Unauthorized: credenciales inválidas, reintentar no ayuda.
  var BACKOFF_BASE_MS = 1000;
  var BACKOFF_MAX_RETRIES = 3;
  var PUBLISH_MIN_GAP_MS = 45000;
  var CLOUD_CIRCUIT_MS = 90000;
  var __lastPublishAt = 0;
  var __cloudCircuitUntil = 0;
  var __publishInflight = false;

  function isConnectionFailure(err) {
    var msg = String((err && err.message) || err || '');
    return /ERR_CONNECTION_CLOSED|CONNECTION_CLOSED|CONNECTION_RESET|Failed to fetch|network error|fetch failed|WebSocket is closed|INSUFFICIENT_RESOURCES|resource exhausted|EHOSTUNREACH|10065|host no accesible/i.test(
      msg
    );
  }

  function isNonRetryableError(err) {
    if (isTableMissingError(err)) return true;
    var msg = String((err && err.message) || err || '');
    var status = (err && (err.status || err.code)) || 0;
    // 409 Conflict: ya existe, no reintentar.
    if (status === 409 || /409|conflict/i.test(msg)) return true;
    // 401 Unauthorized: credenciales inválidas, no reintentar.
    if (status === 401 || /401|unauthorized/i.test(msg)) return true;
    // 403 Forbidden: permisos insuficientes, no reintentar.
    if (status === 403 || /403|forbidden/i.test(msg)) return true;
    return false;
  }

  function withExponentialBackoff(fn, retries, delayMs) {
    retries = retries == null ? BACKOFF_MAX_RETRIES : retries;
    delayMs = delayMs == null ? BACKOFF_BASE_MS : delayMs;
    return fn().catch(function (err) {
      if (retries <= 0) return Promise.reject(err);
      // No reintentar errores permanentes o no recuperables.
      if (isNonRetryableError(err)) return Promise.reject(err);
      return new Promise(function (resolve, reject) {
        global.setTimeout(function () {
          withExponentialBackoff(fn, retries - 1, delayMs * 2).then(resolve, reject);
        }, delayMs);
      });
    });
  }
  // ────────────────────────────────────────────────────────────────────────

  function safe(fn) {
    try {
      return fn();
    } catch (_) {
      return undefined;
    }
  }

  function nowMs() {
    return typeof global.crozzoNow === 'function' ? global.crozzoNow() : Date.now();
  }

  function pad2(n) {
    n = String(n);
    return n.length < 2 ? '0' + n : n;
  }

  function slotKey(ts) {
    var d = new Date(ts == null ? nowMs() : ts);
    var slotHour = Math.floor(d.getHours() / SLOT_HOURS) * SLOT_HOURS;
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + 'T' + pad2(slotHour) + '00';
  }

  function tenantCtx() {
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
          ''
      ).trim();
    } catch (_) {
      deviceId = String(md.deviceId || '').trim();
    }
    var name = String(md.deviceName || md.tabletName || '').trim();
    if (!name) {
      try {
        var cs =
          typeof global.config !== 'undefined' && global.config && global.config.get
            ? global.config.get('conexionSistemas') || {}
            : {};
        name = String(cs.tabletName || cs.deviceName || '').trim();
      } catch (_) {}
    }
    return {
      businessId: String(md.businessId || 'default').trim() || 'default',
      locationId: loc,
      deviceId: deviceId || 'unknown',
      deviceRole: md.role === 'B' ? 'B' : 'A',
      deviceName: name || (md.role === 'B' ? 'Tablet' : 'Caja'),
    };
  }

  function tenantReady(ctx) {
    ctx = ctx || tenantCtx();
    return !!(ctx.businessId && ctx.businessId !== 'default' && ctx.locationId && ctx.locationId !== 'default' && ctx.deviceId && ctx.deviceId !== 'unknown');
  }

  function cloudReady() {
    return (
      typeof global.crozzoTierAllowsCloudSync === 'function' &&
      global.crozzoTierAllowsCloudSync() &&
      global.__SUPABASE
    );
  }

  function isTableMissingError(err) {
    var msg = String((err && err.message) || err || '');
    return /relation|does not exist|PGRST205|schema cache|Could not find the table|404/i.test(msg);
  }

  function notifyTableMissingOnce() {
    if (__tableMissingNotified) return;
    __tableMissingNotified = true;
    console.warn(
      '[internal-qr] Falta la tabla public.crozzo_device_qr_slots en Supabase. ' +
        'Ejecute docs/SUPABASE-SQL-DEVICE-QR-SLOTS.sql (o script 15 en Super Admin → SQL).'
    );
    safe(function () {
      if (typeof global.showToast === 'function') {
        global.showToast(
          'QR entre dispositivos: falta tabla en Supabase. Ejecute el SQL «QRs internos» y recargue (F5).',
          'warning'
        );
      }
    });
  }

  function markTableMissing(err) {
    if (__tableMissing) return;
    __tableMissing = true;
    notifyTableMissingOnce();
  }

  function cloudQrTableReady() {
    return cloudReady() && !__tableMissing;
  }

  function cloudPublishAllowed(force) {
    if (!cloudQrTableReady()) return false;
    if (__cloudCircuitUntil && Date.now() < __cloudCircuitUntil) return false;
    if (!force && __lastPublishAt && Date.now() - __lastPublishAt < PUBLISH_MIN_GAP_MS) return false;
    try {
      if (typeof global.crozzoCloudWanReady === 'function' && !global.crozzoCloudWanReady()) return false;
    } catch (_) {}
    try {
      var thr = global.CrozzoCloudThrottle;
      if (thr && typeof thr.isUnderPressure === 'function' && thr.isUnderPressure()) return false;
    } catch (_) {}
    return true;
  }

  function openCloudCircuit(reason) {
    __cloudCircuitUntil = Date.now() + CLOUD_CIRCUIT_MS;
    safe(function () {
      if (typeof global.crozzoNoteWanUnreachable === 'function') {
        global.crozzoNoteWanUnreachable(String(reason || 'internal_qr'));
      }
    });
  }

  function resetCloudQrTableMissing() {
    __tableMissing = false;
    __tableMissingNotified = false;
  }

  function readOwn() {
    return safe(function () {
      var raw = global.localStorage.getItem(LS_OWN);
      return raw ? JSON.parse(raw) : null;
    });
  }

  function writeOwn(obj) {
    safe(function () {
      global.localStorage.setItem(LS_OWN, JSON.stringify(obj));
    });
  }

  function readPeersDb() {
    return (
      safe(function () {
        var raw = global.localStorage.getItem(LS_PEERS);
        return raw ? JSON.parse(raw) : { updatedAt: 0, peers: {} };
      }) || { updatedAt: 0, peers: {} }
    );
  }

  function writePeersDb(db) {
    db.updatedAt = nowMs();
    safe(function () {
      global.localStorage.setItem(LS_PEERS, JSON.stringify(db));
    });
  }

  function buildScanText(payload) {
    var seal = global.CrozzoPairingSeal;
    if (seal && typeof seal.buildFastQrText === 'function') {
      var t = safe(function () {
        return seal.buildFastQrText(payload);
      });
      if (t) return t;
    }
    return (
      safe(function () {
        return JSON.stringify({
          type: payload.type,
          version: payload.version || 4,
          device_id: payload.device_id || '',
          device_role: payload.device_role || '',
          target_profile: payload.target_profile || 'device',
          lan: payload.lan || {},
          location_id: payload.location_id || '',
          timestamp: payload.timestamp || nowMs(),
        });
      }) || ''
    );
  }

  function resolvePayloadFromScan(scanText, payloadJson) {
    if (payloadJson && typeof payloadJson === 'object' && payloadJson.type) return payloadJson;
    var raw = String(scanText || '').trim();
    if (!raw) return null;
    var seal = global.CrozzoPairingSeal;
    if (seal && typeof seal.unsealFromQr === 'function') {
      return seal.unsealFromQr(raw).then(function (obj) {
        if (obj) return obj;
        try {
          var p = JSON.parse(raw);
          if (p && p.type) return p;
        } catch (_) {}
        return null;
      });
    }
    try {
      return Promise.resolve(JSON.parse(raw));
    } catch (_) {
      return Promise.resolve(null);
    }
  }

  function slotValid(slot) {
    if (!slot || !slot.scanText) return false;
    var until = Number(slot.validUntil) || 0;
    if (until && nowMs() > until + 6 * 60 * 60 * 1000) return false;
    var built = Number(slot.builtAt) || 0;
    if (built && nowMs() - built > VALID_MS + 6 * 60 * 60 * 1000) return false;
    return true;
  }

  function mergePeerSlot(db, entry) {
    if (!entry || !entry.deviceId || !entry.scanText) return db;
    if (String(entry.deviceId) === String(tenantCtx().deviceId)) return db;
    if (!slotValid(entry)) return db;
    var peers = db.peers || {};
    var peer = peers[entry.deviceId] || {
      deviceId: entry.deviceId,
      deviceRole: entry.deviceRole || 'B',
      deviceName: entry.deviceName || '',
      businessId: entry.businessId || '',
      locationId: entry.locationId || '',
      slots: [],
    };
    peer.deviceRole = entry.deviceRole || peer.deviceRole;
    peer.deviceName = entry.deviceName || peer.deviceName;
    peer.businessId = entry.businessId || peer.businessId;
    peer.locationId = entry.locationId || peer.locationId;
    var slots = Array.isArray(peer.slots) ? peer.slots.slice() : [];
    var dup = -1;
    for (var i = 0; i < slots.length; i++) {
      if (slots[i].slot === entry.slot) {
        dup = i;
        break;
      }
    }
    var rec = {
      slot: entry.slot,
      builtAt: entry.builtAt || nowMs(),
      validUntil: entry.validUntil || entry.builtAt + VALID_MS,
      scanText: entry.scanText,
      payloadJson: entry.payloadJson || null,
      ip: entry.ip || '',
      port: entry.port || 3000,
    };
    if (dup >= 0) slots[dup] = rec;
    else slots.unshift(rec);
    slots = slots
      .filter(function (s) {
        return slotValid(s);
      })
      .slice(0, SLOTS_PER_PEER);
    peer.slots = slots;
    peer.updatedAt = nowMs();
    peers[entry.deviceId] = peer;
    var keys = Object.keys(peers);
    if (keys.length > PEER_MAX) {
      keys
        .sort(function (a, b) {
          return (peers[b].updatedAt || 0) - (peers[a].updatedAt || 0);
        })
        .slice(PEER_MAX)
        .forEach(function (k) {
          delete peers[k];
        });
    }
    db.peers = peers;
    return db;
  }

  function ingestCloudRow(row) {
    if (!row) return;
    var db = readPeersDb();
    var ctx = tenantCtx();
    if (row.business_id && ctx.businessId !== 'default' && row.business_id !== ctx.businessId) return;
    if (row.location_id && ctx.locationId !== 'default' && row.location_id !== ctx.locationId) return;
    var lan = (row.payload_json && row.payload_json.lan) || {};
    var ip = String(lan.central_ip || lan.server_ip || (row.payload_json && row.payload_json.central_ip) || '').trim();
    db = mergePeerSlot(db, {
      deviceId: row.device_id,
      deviceRole: row.device_role || 'B',
      deviceName: row.device_name || '',
      businessId: row.business_id,
      locationId: row.location_id,
      slot: row.slot_key,
      builtAt: Date.parse(row.built_at || 0) || nowMs(),
      validUntil: Date.parse(row.valid_until || 0) || nowMs() + VALID_MS,
      scanText: row.scan_text,
      payloadJson: row.payload_json,
      ip: ip,
      port: Number(lan.port || row.payload_json && row.payload_json.port) || 3000,
    });
    writePeersDb(db);
  }

  function ingestOwnRecord(rec) {
    if (!rec || !rec.scanText) return;
    var ctx = tenantCtx();
    var db = readPeersDb();
    var lan = (rec.payload && rec.payload.lan) || {};
    db = mergePeerSlot(db, {
      deviceId: ctx.deviceId,
      deviceRole: ctx.deviceRole,
      deviceName: ctx.deviceName,
      businessId: ctx.businessId,
      locationId: rec.locationId || ctx.locationId,
      slot: rec.slot,
      builtAt: rec.builtAt,
      validUntil: rec.validUntil,
      scanText: rec.scanText,
      payloadJson: rec.payload,
      ip: String(lan.central_ip || lan.server_ip || '').trim(),
      port: Number(lan.port) || 3000,
    });
    writePeersDb(db);
  }

  function recToPeerEntry(rec, ctx) {
    ctx = ctx || tenantCtx();
    var lan = (rec.payload && rec.payload.lan) || {};
    return {
      deviceId: ctx.deviceId,
      deviceRole: ctx.deviceRole,
      deviceName: ctx.deviceName,
      businessId: ctx.businessId,
      locationId: rec.locationId || ctx.locationId,
      slot: rec.slot,
      builtAt: rec.builtAt,
      validUntil: rec.validUntil,
      scanText: rec.scanText,
      payloadJson: rec.payload || null,
      ip: String(lan.central_ip || lan.server_ip || '').trim(),
      port: Number(lan.port) || 3000,
    };
  }

  // ── backfillPeerSlotToCloud: con verificación de tier + backoff exponencial ──
  async function backfillPeerSlotToCloud(entry) {
    // Verificación de tier: solo intentar si el cloud está disponible.
    if (!cloudReady() || !tenantReady() || !entry || !entry.scanText) return false;
    var sb = global.__SUPABASE;
    var row = {
      id: entry.deviceId + '|' + entry.slot,
      business_id: entry.businessId || tenantCtx().businessId,
      location_id: entry.locationId || tenantCtx().locationId,
      device_id: entry.deviceId,
      device_role: entry.deviceRole || 'B',
      device_name: entry.deviceName || '',
      slot_key: entry.slot,
      scan_text: entry.scanText,
      payload_json: entry.payloadJson || null,
      built_at: new Date(entry.builtAt || nowMs()).toISOString(),
      valid_until: new Date(entry.validUntil || entry.builtAt + VALID_MS).toISOString(),
      updated_at: new Date().toISOString(),
    };
    try {
      await withExponentialBackoff(function () {
        // Re-verificar tier en cada intento del backoff.
        if (!cloudReady()) return Promise.reject(new Error('tier_no_cloud'));
        return sb.from(TABLE).upsert(row, { onConflict: 'id' }).then(function (res) {
          if (res && res.error) return Promise.reject(res.error);
          return res;
        });
      });
      return true;
    } catch (err) {
      if (isTableMissingError(err)) markTableMissing(err);
      // 409/401/403: silencioso, no es un error crítico para este módulo.
      return false;
    }
  }

  /** Recibe un QR de otro dispositivo (malla, LAN o escaneo). */
  function ingestPeerSlotEntry(entry, opts) {
    opts = opts || {};
    if (!entry || !entry.deviceId || !entry.scanText) return false;
    var ctx = tenantCtx();
    if (entry.businessId && ctx.businessId !== 'default' && entry.businessId !== ctx.businessId) return false;
    if (entry.locationId && ctx.locationId !== 'default' && entry.locationId !== ctx.locationId) return false;
    var db = readPeersDb();
    var peerBefore = db.peers && db.peers[entry.deviceId] ? JSON.stringify(db.peers[entry.deviceId].slots) : '';
    db = mergePeerSlot(db, entry);
    writePeersDb(db);
    var peerAfter = db.peers && db.peers[entry.deviceId] ? JSON.stringify(db.peers[entry.deviceId].slots) : '';
    var changed = peerBefore !== peerAfter;
    if (changed) {
      if (cloudReady() && String(entry.deviceId) !== String(ctx.deviceId)) {
        backfillPeerSlotToCloud(entry).catch(function () {});
      }
      safe(function () {
        global.dispatchEvent(
          new CustomEvent('crozzo-internal-qr-received', {
            detail: { deviceId: entry.deviceId, slot: entry.slot, source: opts.source || 'peer' },
          })
        );
      });
      if (opts.apply && String(entry.deviceId) !== String(ctx.deviceId)) {
        resolvePayloadFromScan(entry.scanText, entry.payloadJson).then(function (payload) {
          if (payload) applyPeerPayload(payload, { quiet: true, reason: 'mesh_qr:' + entry.deviceId });
        });
      }
      if (changed && opts.respond !== false) {
        var src = String(opts.source || '');
        if (src === 'lan_http' || src === 'lan_ws') {
          global.setTimeout(function () {
            emitOwnSlotsToMesh(readOwn(), { force: true });
            requestPeerQrCatalog({ force: true });
          }, 220);
        }
      }
    }
    return changed;
  }

  function meshExchangeEnabled() {
    if (__emergencyActive) return true;
    try {
      var t = String(global.__CROZZO_TIER_LAST || 'offline');
      if (t === 'offline' || t === 'mesh' || t === 'qr') return true;
      if (typeof global.crozzoTierAllowsCloudSync === 'function' && !global.crozzoTierAllowsCloudSync()) return true;
    } catch (_) {}
    return false;
  }

  function lanExchangeEnabled() {
    try {
      if (typeof global.crozzoIsLocalLanSegmentUp === 'function' && global.crozzoIsLocalLanSegmentUp()) return true;
    } catch (_) {}
    var md = typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
    if (md.role === 'B' && String(md.centralIp || '').trim()) return true;
    return md.role === 'A';
  }

  function broadcastSlotsToMesh(slots, opts) {
    opts = opts || {};
    if (!Array.isArray(slots) || !slots.length) return 0;
    if (!opts.force && !meshExchangeEnabled() && !lanExchangeEnabled()) return 0;
    var now = nowMs();
    if (!opts.force && now - __lastMeshBroadcastAt < MESH_BROADCAST_GAP_MS) return 0;
    __lastMeshBroadcastAt = now;
    var sent = 0;
    slots.forEach(function (entry) {
      if (!entry || !entry.scanText) return;
      try {
        if (global.CrozzoOfflineGossip && typeof global.CrozzoOfflineGossip.publishInternalQrSlot === 'function') {
          if (global.CrozzoOfflineGossip.publishInternalQrSlot(entry)) sent++;
        }
      } catch (_) {}
      try {
        if (global.CrozzoLanWebSocketBridge && typeof global.CrozzoLanWebSocketBridge.notifyInternalQrSlot === 'function') {
          if (global.CrozzoLanWebSocketBridge.notifyInternalQrSlot(entry)) sent++;
        }
      } catch (_) {}
    });
    return sent;
  }

  function requestPeerQrCatalog(opts) {
    opts = opts || {};
    var now = nowMs();
    if (!opts.force && now - __lastMeshRequestAt < MESH_REQUEST_GAP_MS) return false;
    __lastMeshRequestAt = now;
    var sent = false;
    try {
      if (global.CrozzoOfflineGossip && typeof global.CrozzoOfflineGossip.publishInternalQrRequest === 'function') {
        sent = global.CrozzoOfflineGossip.publishInternalQrRequest() || sent;
      }
    } catch (_) {}
    try {
      if (global.CrozzoLanWebSocketBridge && typeof global.CrozzoLanWebSocketBridge.requestInternalQrCatalogLan === 'function') {
        global.CrozzoLanWebSocketBridge.requestInternalQrCatalogLan().catch(function () {});
        sent = true;
      }
    } catch (_) {}
    return sent;
  }

  function gatherOwnSlotsForShare(max) {
    max = max || 3;
    var ctx = tenantCtx();
    var out = [];
    var own = readOwn();
    if (own && own.scanText) out.push(recToPeerEntry(own, ctx));
    if (own && Array.isArray(own.history)) {
      own.history.forEach(function (h) {
        if (out.length >= max || !h || !h.scanText) return;
        out.push({
          deviceId: ctx.deviceId,
          deviceRole: ctx.deviceRole,
          deviceName: ctx.deviceName,
          businessId: ctx.businessId,
          locationId: h.locationId || ctx.locationId,
          slot: h.slot,
          builtAt: h.builtAt,
          validUntil: h.validUntil || h.builtAt + VALID_MS,
          scanText: h.scanText,
          payloadJson: h.payload || null,
          ip: h.ip || '',
          port: h.port || 3000,
        });
      });
    }
    return out.slice(0, max);
  }

  function emitOwnSlotsToMesh(rec, opts) {
    opts = opts || {};
    var ctx = tenantCtx();
    var slots = [];
    if (rec && rec.scanText) slots.push(recToPeerEntry(rec, ctx));
    gatherOwnSlotsForShare(2).forEach(function (e) {
      if (!slots.some(function (s) {
        return s.slot === e.slot;
      })) {
        slots.push(e);
      }
    });
    return broadcastSlotsToMesh(slots, { force: !!opts.force });
  }

  // ── publishOwnSlot: con verificación de tier + backoff exponencial ───────
  async function publishOwnSlot(rec, opts) {
    opts = opts || {};
    if (!cloudPublishAllowed(!!opts.force)) return false;
    if (__publishInflight) return false;
    if (!tenantReady() || !rec || !rec.scanText) return false;
    __publishInflight = true;
    var ctx = tenantCtx();
    var sb = global.__SUPABASE;
    var row = {
      id: ctx.deviceId + '|' + rec.slot,
      business_id: ctx.businessId,
      location_id: ctx.locationId,
      device_id: ctx.deviceId,
      device_role: ctx.deviceRole,
      device_name: ctx.deviceName,
      slot_key: rec.slot,
      scan_text: rec.scanText,
      payload_json: rec.payload || null,
      built_at: new Date(rec.builtAt).toISOString(),
      valid_until: new Date(rec.validUntil).toISOString(),
      updated_at: new Date().toISOString(),
    };
    try {
      await withExponentialBackoff(function () {
        if (!cloudPublishAllowed(!!opts.force)) return Promise.reject(new Error('cloud_unavailable'));
        return sb.from(TABLE).upsert(row, { onConflict: 'id' }).then(function (res) {
          if (res && res.error) return Promise.reject(res.error);
          return res;
        });
      });
      __lastPublishAt = Date.now();
      return true;
    } catch (e) {
      if (isTableMissingError(e)) {
        markTableMissing(e);
        return false;
      }
      var msg = String((e && e.message) || e || '');
      var status = (e && (e.status || e.code)) || 0;
      if (status === 409 || /409|conflict/i.test(msg)) {
        __lastPublishAt = Date.now();
        return true;
      }
      if (status === 401 || status === 403 || /401|403|unauthorized|forbidden/i.test(msg)) return false;
      __lastPublishAt = Date.now();
      if (isConnectionFailure(e) || msg === 'cloud_unavailable' || /INSUFFICIENT_RESOURCES|resource exhausted/i.test(msg)) {
        openCloudCircuit('internal_qr_publish');
        try {
          var thr = global.CrozzoCloudThrottle;
          if (thr && typeof thr.markPressure === 'function') thr.markPressure(120000, 'resource_exhausted');
        } catch (_) {}
        return false;
      }
      console.warn('[internal-qr] publish', e);
      return false;
    } finally {
      __publishInflight = false;
    }
  }
  // ────────────────────────────────────────────────────────────────────────

  async function pullPeersFromCloud() {
    if (!cloudPublishAllowed(false) || !tenantReady()) return 0;
    var ctx = tenantCtx();
    var sb = global.__SUPABASE;
    var since = new Date(nowMs() - VALID_MS - 6 * 60 * 60 * 1000).toISOString();
    try {
      var res = await sb
        .from(TABLE)
        .select('*')
        .eq('business_id', ctx.businessId)
        .eq('location_id', ctx.locationId)
        .gte('valid_until', since)
        .order('updated_at', { ascending: false })
        .limit(120);
      if (res.error) {
        if (isTableMissingError(res.error)) markTableMissing(res.error);
        return 0;
      }
      var n = 0;
      (res.data || []).forEach(function (row) {
        ingestCloudRow(row);
        n++;
      });
      return n;
    } catch (e) {
      if (isTableMissingError(e)) markTableMissing(e);
      else console.warn('[internal-qr] pull', e);
      return 0;
    }
  }

  function subscribePeerRealtime() {
    if (!cloudQrTableReady() || !tenantReady() || !global.__SUPABASE) return;
    if (__rtChannel) return;
    var ctx = tenantCtx();
    try {
      var chName = 'crozzo_internal_qr_' + ctx.locationId.replace(/[^a-zA-Z0-9_]/g, '_');
      var flt = 'location_id=eq.' + ctx.locationId + ',business_id=eq.' + ctx.businessId;
      var ch = global.__SUPABASE.channel(chName);
      ch.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLE, filter: flt },
        function (payload) {
          if (payload.new) ingestCloudRow(payload.new);
        }
      );
      ch.subscribe();
      __rtChannel = ch;
    } catch (e) {
      console.warn('[internal-qr] realtime', e);
    }
  }

  function trimHistory(history) {
    var list = Array.isArray(history) ? history.slice() : [];
    var cutoff = nowMs() - 30 * 60 * 60 * 1000;
    return list
      .filter(function (h) {
        return h && slotValid(h);
      })
      .slice(0, SLOTS_PER_PEER);
  }

  function pushPriorSlot(prior, history) {
    var list = trimHistory(history);
    if (!prior || !prior.scanText) return list;
    var dup = list.some(function (h) {
      return h.scanText === prior.scanText;
    });
    if (!dup) {
      list.unshift({
        slot: prior.slot,
        builtAt: prior.builtAt || nowMs(),
        validUntil: prior.validUntil || prior.builtAt + VALID_MS,
        scanText: prior.scanText,
        locationId: prior.locationId || '',
        cloud: !!prior.cloud,
        payload: prior.payload || null,
      });
    }
    return list.slice(0, SLOTS_PER_PEER);
  }

  /** Genera/refresca el QR de este dispositivo (cada 4 h). */
  function ensureOwnSlot(opts) {
    opts = opts || {};
    var key = slotKey();
    var stored = readOwn();
    if (!opts.force && stored && stored.slot === key && stored.scanText) {
      ingestOwnRecord(stored);
      emitOwnSlotsToMesh(stored, { force: false });
      return stored;
    }
    var built = null;
    if (typeof global.crozzoPairingBuildDeviceSelfPayload === 'function') {
      built = safe(function () {
        return global.crozzoPairingBuildDeviceSelfPayload();
      });
    } else if (tenantCtx().deviceRole === 'A' && typeof global.crozzoPairingBuildPayload === 'function') {
      built = safe(function () {
        return global.crozzoPairingBuildPayload('tablet');
      });
    }
    if (!built || built.error || !built.payload) {
      return stored && stored.slot === key ? stored : stored || null;
    }
    var payload = built.payload;
    payload.device_role = tenantCtx().deviceRole;
    payload.device_id = tenantCtx().deviceId;
    payload.device_name = tenantCtx().deviceName;
    payload.target_profile = payload.target_profile || 'device';
    var scanText = buildScanText(payload);
    if (!scanText) return stored && stored.slot === key ? stored : stored || null;
    var builtAt = nowMs();
    var history =
      stored && stored.slot !== key ? pushPriorSlot(stored, stored.history) : trimHistory(stored && stored.history);
    var rec = {
      slot: key,
      date: key.slice(0, 10),
      builtAt: builtAt,
      validUntil: builtAt + VALID_MS,
      scanText: scanText,
      locationId: String(payload.location_id || ''),
      cloud: !!payload.cloud_sync,
      payload: payload,
      history: history,
    };
    writeOwn(rec);
    ingestOwnRecord(rec);
    if (cloudPublishAllowed(false)) publishOwnSlot(rec).catch(function () {});
    emitOwnSlotsToMesh(rec, { force: true });
    safe(function () {
      global.dispatchEvent(new CustomEvent('crozzo-daily-qr', { detail: { slot: key, builtAt: builtAt, deviceId: tenantCtx().deviceId } }));
    });
    return rec;
  }

  async function refreshIdentityOnCloud(opts) {
    opts = opts || {};
    var rec = ensureOwnSlot({ force: true });
    if (!rec) return false;
    var ok = await publishOwnSlot(rec);
    emitOwnSlotsToMesh(rec, { force: true });
    return ok;
  }

  function getValidPeers(opts) {
    opts = opts || {};
    var db = readPeersDb();
    var mine = String(tenantCtx().deviceId);
    var out = [];
    Object.keys(db.peers || {}).forEach(function (id) {
      if (id === mine) return;
      var p = db.peers[id];
      if (!p || !Array.isArray(p.slots) || !p.slots.length) return;
      var valid = p.slots.filter(function (s) {
        return slotValid(s);
      });
      if (!valid.length) return;
      valid.sort(function (a, b) {
        return (b.builtAt || 0) - (a.builtAt || 0);
      });
      out.push({
        deviceId: p.deviceId,
        deviceRole: p.deviceRole,
        deviceName: p.deviceName,
        bestSlot: valid[0],
        slots: valid,
      });
    });
    out.sort(function (a, b) {
      if (a.deviceRole === 'A' && b.deviceRole !== 'A') return -1;
      if (b.deviceRole === 'A' && a.deviceRole !== 'A') return 1;
      return (b.bestSlot.builtAt || 0) - (a.bestSlot.builtAt || 0);
    });
    if (opts.preferCaja) {
      out.sort(function (a, b) {
        if (a.deviceRole === 'A' && b.deviceRole !== 'A') return -1;
        if (b.deviceRole === 'A' && a.deviceRole !== 'A') return 1;
        return 0;
      });
    }
    return out;
  }

  async function applyPeerPayload(payload, opts) {
    opts = opts || {};
    if (!payload) return false;
    var role = tenantCtx().deviceRole;
    var lan = payload.lan || {};
    var ip = String(lan.central_ip || lan.server_ip || payload.central_ip || '').trim();
    var applied = false;
    if (role === 'B' && ip && typeof global.crozzoPairingApplyLanFromPayload === 'function') {
      try {
        await global.crozzoPairingApplyLanFromPayload(payload);
        applied = true;
      } catch (e) {
        if (!opts.quiet) console.warn('[internal-qr] apply lan', e);
      }
    }
    if (payload.cloud_sync !== false && payload.supabase_url && payload.supabase_key) {
      try {
        if (typeof global.crozzoFinalizeCloudConfigAfterPairing === 'function') {
          await global.crozzoFinalizeCloudConfigAfterPairing(payload);
          applied = true;
        }
      } catch (e2) {
        if (!opts.quiet) console.warn('[internal-qr] apply cloud', e2);
      }
    }
    if (applied && typeof global.crozzoEnsureCloudSyncActive === 'function') {
      global.crozzoEnsureCloudSyncActive({ source: 'internal_qr', resetTableMissing: false }).catch(function () {});
    }
    if (applied && typeof global.crozzoRunFullReconnectSync === 'function') {
      global.crozzoRunFullReconnectSync({ source: 'internal_qr', reason: opts.reason || 'peer_qr' }).catch(function () {});
    }
    if (applied) {
      safe(function () {
        if (typeof global.crozzoPairingAutoConnect === 'function') {
          global.crozzoPairingAutoConnect(opts.reason || 'peer_qr', { force: true, skipInvalidate: true }).catch(function () {});
        } else {
          if (typeof global.crozzoActivateLocalSyncPath === 'function') {
            global.crozzoActivateLocalSyncPath('internal_qr_peer').catch(function () {});
          }
          if (typeof global.crozzoFleetOperationalReconcile === 'function') {
            global.crozzoFleetOperationalReconcile('peer_qr').catch(function () {});
          }
        }
      });
    }
    return applied;
  }

  async function runEmergencyTransport() {
    var now = nowMs();
    if (now - __lastEmergencyAt < 8000) return { peers: 0, applied: 0 };
    __lastEmergencyAt = now;
    ensureOwnSlot({ force: false });
    requestPeerQrCatalog();
    if (cloudReady()) await pullPeersFromCloud();
    var peers = getValidPeers({ preferCaja: true });
    if (!peers.length) {
      emitOwnSlotsToMesh(readOwn(), { force: true });
      return { peers: 0, applied: 0, requested: true };
    }
    var applied = 0;
    for (var i = 0; i < peers.length && i < 8; i++) {
      var slot = peers[i].bestSlot;
      var payload = slot.payloadJson;
      if (!payload) {
        payload = await resolvePayloadFromScan(slot.scanText, null);
      }
      if (payload && (await applyPeerPayload(payload, { quiet: true, reason: 'emergency:' + peers[i].deviceId }))) {
        applied++;
        if (tenantCtx().deviceRole === 'B') break;
      }
    }
    try {
      if (global.CrozzoOfflineGossip && typeof global.CrozzoOfflineGossip.publishInternalQrBeacon === 'function') {
        global.CrozzoOfflineGossip.publishInternalQrBeacon({
          deviceId: tenantCtx().deviceId,
          peerCount: peers.length,
          slot: slotKey(),
        });
      }
      requestPeerQrCatalog();
    } catch (_) {}
    safe(function () {
      global.dispatchEvent(
        new CustomEvent('crozzo-internal-qr-recovery', { detail: { peers: peers.length, applied: applied } })
      );
    });
    return { peers: peers.length, applied: applied };
  }

  function startEmergencyLoop() {
    if (__emergencyTimer) return;
    __emergencyActive = true;
    runEmergencyTransport().catch(function () {});
    __emergencyTimer = global.setInterval(function () {
      runEmergencyTransport().catch(function () {});
    }, EMERGENCY_MS);
  }

  function stopEmergencyLoop() {
    __emergencyActive = false;
    if (__emergencyTimer) {
      global.clearInterval(__emergencyTimer);
      __emergencyTimer = null;
    }
  }

  function tick() {
    safe(function () {
      if (typeof document !== 'undefined' && document.hidden) return;
    });
    var rec = ensureOwnSlot({ force: false });
    if (meshExchangeEnabled() || lanExchangeEnabled()) {
      requestPeerQrCatalog();
      if (rec) emitOwnSlotsToMesh(rec, { force: false });
    }
    if (cloudPublishAllowed(false)) {
      pullPeersFromCloud().catch(function () {});
      subscribePeerRealtime();
    }
  }

  function start() {
    ensureOwnSlot({ force: false });
    tick();
    if (__timer) global.clearInterval(__timer);
    __timer = global.setInterval(tick, REFRESH_MS);
    safe(function () {
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', function () {
          if (!document.hidden) tick();
        });
      }
      global.addEventListener('online', function () {
        global.setTimeout(tick, 500);
      });
      global.addEventListener('crozzo-supabase-config-saved', function () {
        try {
          if (typeof global.crozzoInvalidateCloudPingCache === 'function') global.crozzoInvalidateCloudPingCache();
        } catch (_) {}
        refreshIdentityOnCloud({ force: true }).catch(function () {});
      });
    });
  }

  function stop() {
    if (__timer) {
      global.clearInterval(__timer);
      __timer = null;
    }
    stopEmergencyLoop();
  }

  /** Intercambio inmediato de QRs al configurar o emparejar un dispositivo nuevo. */
  async function exchangeOnDeviceSetup(opts) {
    opts = opts || {};
    __lastMeshBroadcastAt = 0;
    __lastMeshRequestAt = 0;
    if (!__timer) start();

    var scanText = String(opts.scanText || '').trim();
    if (scanText) {
      resolvePayloadFromScan(scanText, null).then(function (payload) {
        if (!payload) return;
        var lan = payload.lan || {};
        ingestPeerSlotEntry(
          {
            deviceId: payload.device_id || 'unknown',
            deviceRole: opts.role === 'A' || opts.role === 'caja' ? 'A' : payload.device_role || 'B',
            deviceName: String(opts.deviceName || payload.device_name || '').trim(),
            businessId: payload.business_id || tenantCtx().businessId,
            locationId: payload.location_id || tenantCtx().locationId,
            slot: slotKey(Number(payload.timestamp) || nowMs()),
            builtAt: Number(payload.timestamp) || nowMs(),
            validUntil: (Number(payload.timestamp) || nowMs()) + VALID_MS,
            scanText: scanText,
            payloadJson: payload,
            ip: String(lan.central_ip || lan.server_ip || '').trim(),
            port: Number(lan.port) || 3000,
          },
          { source: 'scan', relay: false, respond: false }
        );
      });
    }

    var rec = ensureOwnSlot({ force: opts.forceOwn !== false });
    if (rec && rec.scanText) {
      if (cloudPublishAllowed(false)) publishOwnSlot(rec).catch(function () {});
      emitOwnSlotsToMesh(rec, { force: true });
    }
    requestPeerQrCatalog({ force: true });
    if (cloudPublishAllowed(!!opts.forceOwn)) {
      await pullPeersFromCloud();
      if (rec && rec.scanText) await publishOwnSlot(rec, { force: !!opts.forceOwn });
    }

    function retryPass() {
      requestPeerQrCatalog({ force: true });
      emitOwnSlotsToMesh(readOwn(), { force: true });
      if (cloudPublishAllowed(false)) pullPeersFromCloud().catch(function () {});
      safe(function () {
        if (typeof global.crozzoPairingAutoConnect === 'function') {
          global.crozzoPairingAutoConnect('qr_setup', { force: false, skipInvalidate: true }).catch(function () {});
        } else {
          if (typeof global.crozzoActivateLocalSyncPath === 'function') {
            global.crozzoActivateLocalSyncPath('qr_setup').catch(function () {});
          }
          if (typeof global.crozzoFleetOperationalReconcile === 'function') {
            global.crozzoFleetOperationalReconcile('qr_setup').catch(function () {});
          }
        }
      });
    }
    [1200, 4500, 11000].forEach(function (ms) {
      global.setTimeout(retryPass, ms);
    });

    safe(function () {
      global.dispatchEvent(
        new CustomEvent('crozzo-internal-qr-setup-exchange', {
          detail: {
            reason: opts.reason || 'setup',
            peers: getValidPeers().length,
            own: !!(rec && rec.scanText),
          },
        })
      );
    });
    return { peers: getValidPeers().length, own: !!(rec && rec.scanText) };
  }

  global.CrozzoInternalQrRegistry = {
    SLOT_HOURS: SLOT_HOURS,
    VALID_MS: VALID_MS,
    slotKey: slotKey,
    ensureOwnSlot: ensureOwnSlot,
    ingestCloudRow: ingestCloudRow,
    ingestPeerScan: function (scanText, meta) {
      meta = meta || {};
      resolvePayloadFromScan(scanText, null).then(function (payload) {
        if (!payload) return;
        var lan = payload.lan || {};
        var role = tenantCtx().deviceRole;
        ingestPeerSlotEntry(
          {
            deviceId: meta.deviceId || payload.device_id || 'unknown',
            deviceRole: meta.deviceRole || payload.device_role || 'B',
            deviceName: meta.deviceName || payload.device_name || '',
            businessId: meta.businessId || payload.business_id || tenantCtx().businessId,
            locationId: meta.locationId || payload.location_id || tenantCtx().locationId,
            slot: meta.slot || slotKey(Number(payload.timestamp) || nowMs()),
            builtAt: Number(payload.timestamp) || nowMs(),
            validUntil: (Number(payload.timestamp) || nowMs()) + VALID_MS,
            scanText: scanText,
            payloadJson: payload,
            ip: String(lan.central_ip || lan.server_ip || '').trim(),
            port: Number(lan.port) || 3000,
          },
          { source: 'scan', relay: false, apply: role === 'B' }
        );
        if (role === 'B') {
          applyPeerPayload(payload, { quiet: true, reason: 'peer_scan' }).catch(function () {});
        }
      });
    },
    ingestPeerSlotEntry: ingestPeerSlotEntry,
    gatherOwnSlotsForShare: gatherOwnSlotsForShare,
    broadcastSlotsToMesh: broadcastSlotsToMesh,
    requestPeerQrCatalog: requestPeerQrCatalog,
    respondWithOwnSlots: function () {
      return emitOwnSlotsToMesh(readOwn(), { force: true });
    },
    exchangeOnDeviceSetup: exchangeOnDeviceSetup,
    pullPeersFromCloud: pullPeersFromCloud,
    refreshIdentityOnCloud: refreshIdentityOnCloud,
    cloudQrTableReady: cloudQrTableReady,
    isCloudQrTableMissing: function () {
      return __tableMissing;
    },
    resetCloudQrTableMissing: resetCloudQrTableMissing,
    getValidPeers: getValidPeers,
    getPeerCount: function () {
      return getValidPeers().length;
    },
    runEmergencyTransport: runEmergencyTransport,
    startEmergencyLoop: startEmergencyLoop,
    stopEmergencyLoop: stopEmergencyLoop,
    isEmergencyActive: function () {
      return __emergencyActive;
    },
    start: start,
    stop: stop,
  };
})(typeof window !== 'undefined' ? window : globalThis);
