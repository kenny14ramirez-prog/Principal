/* ========== ModeManager.js ========== */
/**
 * ModeManager — Demo / Simple / Electrónica (Colombia POS).
 *
 * Limitaciones: el modo legal real depende de config DIAN ya validada en Crozzo pos.html (canGoLive).
 * Marca de agua PDF: expone __CROZZO_PDF_WATERMARK para futuros generadores; no hay motor PDF embebido aquí.
 */
(function (global) {
  'use strict';
  var _origPageBlocked = null;
  function getConfig() {
    return global.config;
  }
  /** Texto opcional superpuesto en documentos generados (ticket/PDF) cuando no es producción electrónica plena. */
  function getPdfWatermarkLine() {
    try {
      var c = getConfig();
      if (!c || typeof c.getOperacionModo !== 'function') return '';
      var m = c.getOperacionModo();
      if (m === 'demo') return 'MODO DEMO — SIN VALIDEZ FISCAL';
      if (m === 'simple') return 'FACTURACIÓN SIMPLE / TICKET';
      if (m === 'electronic') {
        var live = c.canGoLive && c.canGoLive();
        if (live && !live.valid) return 'CONFIGURACIÓN DIAN INCOMPLETA — NO EMITIR COMO PRODUCCIÓN';
      }
      return '';
    } catch (e) {
      return '';
    }
  }
  /**
   * En modo DEMO ocultamos módulos que pueden inducir a error fiscal (mismo criterio conservador).
   * SIMPLE ya oculta páginas vía pageBlockedByOperacionModo en el bundle principal.
   */
  function pageBlockedByDemo(page) {
    try {
      if (typeof global.isSuperAdminUser === 'function' && global.isSuperAdminUser()) return false;
      var c = getConfig();
      if (!c || c.getOperacionModo() !== 'demo') return false;
      var hidden = {
        'config-dian': true,
        'config-certificado': true,
        'config-proveedor': true,
        'config-multidispositivo': true
      };
      return !!hidden[page];
    } catch (e) {
      return false;
    }
  }
  function patchedPageBlocked(page) {
    if (pageBlockedByDemo(page)) return true;
    if (typeof _origPageBlocked === 'function') return _origPageBlocked(page);
    return false;
  }
  function applyNavModeFilter() {
    if (typeof global.applyAccessControl !== 'function') return;
    global.applyAccessControl();
    try {
      document.querySelectorAll('.nav-item[data-page]').forEach(function (el) {
        var page = el.getAttribute('data-page');
        if (pageBlockedByDemo(page)) el.style.display = 'none';
      });
    } catch (e) { /* ignore */ }
  }
  /**
   * @param {'demo'|'simple'|'electronic'} mode
   */
  function applyOperatingMode(mode) {
    var allowed = ['demo', 'simple', 'electronic'];
    if (allowed.indexOf(mode) < 0) return false;
    var c = getConfig();
    if (!c || typeof c.setOperacionModo !== 'function') return false;
    c.setOperacionModo(mode);
    try {
      global.__CROZZO_PDF_WATERMARK = getPdfWatermarkLine();
    } catch (e2) { /* ignore */ }
    if (typeof global.updateOperacionModeBadges === 'function') global.updateOperacionModeBadges();
    if (typeof global.updateDemoBadge === 'function') global.updateDemoBadge();
    applyNavModeFilter();
    if (typeof global.navigateTo === 'function' && typeof global.currentPage === 'string') {
      try {
        global.navigateTo(global.currentPage);
      } catch (e3) { /* ignore */ }
    }
    if (typeof global.showToast === 'function') {
      global.showToast('Modo de operación: ' + mode.toUpperCase(), 'success');
    }
    return true;
  }
  function assertElectronicSaleAllowed() {
    var c = getConfig();
    if (!c) return { ok: true, reason: '' };
    if (typeof c.isElectronicMode !== 'function' || !c.isElectronicMode()) return { ok: true, reason: '' };
    var v = c.canGoLive ? c.canGoLive() : { valid: false, missing: ['config'] };
    if (v.valid) return { ok: true, reason: '' };
    return { ok: false, reason: 'Falta configuración DIAN: ' + (v.missing || []).join(', ') };
  }
  function init() {
    try {
      global.__CROZZO_PDF_WATERMARK = getPdfWatermarkLine();
    } catch (e) { /* ignore */ }
    if (typeof global.pageBlockedByOperacionModo === 'function' && !_origPageBlocked) {
      _origPageBlocked = global.pageBlockedByOperacionModo;
      global.pageBlockedByOperacionModo = patchedPageBlocked;
    }
    var chain = global.applyAccessControl;
    if (typeof chain === 'function' && !global.__crozzoModeManagerPatchedApply) {
      global.__crozzoModeManagerPatchedApply = true;
      global.applyAccessControl = function () {
        chain.apply(global, arguments);
      };
    }
    applyNavModeFilter();
  }
  global.CrozzoModeManager = {
    init: init,
    applyOperatingMode: applyOperatingMode,
    getPdfWatermarkLine: getPdfWatermarkLine,
    assertElectronicSaleAllowed: assertElectronicSaleAllowed,
    pageBlockedByDemo: pageBlockedByDemo
  };
  global.applyOperatingMode = applyOperatingMode;
})(typeof window !== 'undefined' ? window : this);
/* ========== NetworkGuard.js ========== */
/**
 * Crozzo NetworkGuard — autoridad única por ubicación (browser/PWA).
 *
 * SPLIT-BRAIN: checkActiveServers() / checkActiveServersOnNetwork() buscan otro rol A con el mismo
 * location_id vía (1) HTTP GET /status en hosts LAN muestreados y (2) broadcast Supabase Realtime.
 * Sin servicio HTTP opcional en :puerto/status, solo aplica detección por nube.
 *
 * LIMITACIONES: no hay MAC ni SSID real en la web; location_id = hash(deviceId estable + nota manual + subred).
 * La PWA no abre puerto TCP; /status requiere proceso auxiliar opcional.
 */
(function (global) {
  'use strict';
  var LS_ACTIVE = 'crozzo_is_active_server';
  var LS_FORCE_A = 'crozzo_force_dual_server_a';
  var LS_CONFLICT = 'crozzo_server_conflict_banner';
  var CHAN = 'crozzo_network_guard_v1';
  var _hbTimer = null;
  var _whoUnsub = null;
  function sleep(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  }
  function bufToHex(buf) {
    return Array.from(new Uint8Array(buf))
      .map(function (b) {
        return b.toString(16).padStart(2, '0');
      })
      .join('');
  }
  async function sha256Hex(str) {
    if (!global.crypto || !global.crypto.subtle) {
      var h = 0;
      for (var i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
      return ('0000000' + (h >>> 0).toString(16)).slice(-8);
    }
    var enc = new TextEncoder().encode(str);
    var digest = await global.crypto.subtle.digest('SHA-256', enc);
    return bufToHex(digest);
  }
  /**
   * @param {{ localIp?: string, subnet?: string, ssidNote?: string, deviceId?: string }} opts
   */
  async function generateLocationId(opts) {
    opts = opts || {};
    var localIp = (opts.localIp || '').trim();
    var subnet =
      (opts.subnet || '').trim() ||
      (localIp
        ? localIp
            .split('.')
            .slice(0, 3)
            .join('.')
        : '0.0.0');
    var ssidNote = (opts.ssidNote || opts.networkSsidNote || '').trim();
    var dev =
      (opts.deviceId || (global.ensureCrozzoDeviceId && global.ensureCrozzoDeviceId()) || 'nodevice').trim();
    var raw = 'crozzo_loc_v1|' + dev + '|' + ssidNote + '|' + subnet;
    var full = await sha256Hex(raw);
    var short = full.slice(0, 6).toUpperCase();
    return 'LOC-' + short + '-' + subnet;
  }
  function getIsActiveServer() {
    try {
      return global.localStorage.getItem(LS_ACTIVE) === '1';
    } catch (e) {
      return false;
    }
  }
  function setIsActiveServer(v) {
    try {
      if (v) global.localStorage.setItem(LS_ACTIVE, '1');
      else global.localStorage.removeItem(LS_ACTIVE);
    } catch (e) { /* ignore */ }
  }
  function isForceDualServerA() {
    try {
      return global.localStorage.getItem(LS_FORCE_A) === '1';
    } catch (e) {
      return false;
    }
  }
  function setForceDualServerA(v) {
    try {
      if (v) global.localStorage.setItem(LS_FORCE_A, '1');
      else global.localStorage.removeItem(LS_FORCE_A);
    } catch (e) { /* ignore */ }
  }
  function setConflictBanner(text) {
    try {
      if (text) global.localStorage.setItem(LS_CONFLICT, text);
      else global.localStorage.removeItem(LS_CONFLICT);
    } catch (e) { /* ignore */ }
  }
  async function probeCentralStatus(ip, port) {
    var p = Number(port) || 3000;
    if (!ip) return null;
    var c = new AbortController();
    var t = setTimeout(function () {
      c.abort();
    }, 1400);
    try {
      var res = await global.fetch('http://' + ip + ':' + p + '/status', {
        method: 'GET',
        signal: c.signal,
        headers: { Accept: 'application/json' }
      });
      clearTimeout(t);
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      clearTimeout(t);
      return null;
    }
  }
  async function scanHttpForServerA(locationId, myDeviceId, port) {
    var peers = [];
    if (!global.scanLocalNetwork) return peers;
    var scan = await global.scanLocalNetwork({
      ports: [Number(port) || 3000],
      maxHosts: 40,
      timeoutMs: 550
    });
    var pr = Number(port) || 3000;
    for (var i = 0; i < scan.found.length; i++) {
      var f = scan.found[i];
      var j = await probeCentralStatus(f.ip, f.port || pr);
      if (
        j &&
        j.role === 'A' &&
        j.is_active_server &&
        j.location_id === locationId &&
        j.device_id &&
        j.device_id !== myDeviceId
      ) {
        peers.push({ source: 'http', ip: f.ip, port: f.port || pr, payload: j });
      }
    }
    return peers;
  }
  function dedupePeers(arr) {
    var m = {};
    for (var i = 0; i < arr.length; i++) {
      var d = arr[i].payload && arr[i].payload.device_id;
      if (d) m[d] = arr[i];
    }
    return Object.keys(m).map(function (k) {
      return m[k];
    });
  }
  async function querySupabaseServerA(locationId, myDeviceId) {
    var found = [];
    if (!global.__SUPABASE) return found;
    var ch = global.__SUPABASE.channel(CHAN);
    var handler = function (wr) {
      var payload = wr && wr.payload != null ? wr.payload : wr;
      if (!payload || payload.role !== 'A' || !payload.is_active_server) return;
      if (payload.location_id !== locationId) return;
      if (payload.device_id === myDeviceId) return;
      found.push({ source: 'supabase', payload: payload });
    };
    ch.on('broadcast', { event: 'server_iam' }, handler);
    await new Promise(function (resolve) {
      ch.subscribe(function (st) {
        if (st === 'SUBSCRIBED' || st === 'CHANNEL_ERROR') resolve();
      });
    });
    try {
      await ch.send({
        type: 'broadcast',
        event: 'server_who',
        payload: { location_id: locationId, device_id: myDeviceId, ts: Date.now() }
      });
    } catch (e) { /* ignore */ }
    await sleep(1900);
    try {
      ch.unsubscribe();
    } catch (e2) { /* ignore */ }
    return dedupePeers(found);
  }
  async function ensureLocationIdForPayload(L) {
    var note = (L && L.networkSsidNote) || '';
    var ip = '';
    if (global.detectLocalIP) {
      try {
        ip = (await global.detectLocalIP()) || '';
      } catch (e) { /* ignore */ }
    }
    return generateLocationId({
      localIp: ip,
      ssidNote: note,
      deviceId: global.ensureCrozzoDeviceId && global.ensureCrozzoDeviceId()
    });
  }
  async function checkActiveServersOnNetwork(opt) {
    opt = opt || {};
    var locationId = opt.locationId;
    var myDeviceId = opt.deviceId || (global.ensureCrozzoDeviceId && global.ensureCrozzoDeviceId());
    var port = opt.port || 3000;
    var httpP = await scanHttpForServerA(locationId, myDeviceId, port);
    var sbP = await querySupabaseServerA(locationId, myDeviceId);
    var all = httpP.concat(sbP);
    return {
      peers: dedupePeers(all),
      conflict: all.length > 0
    };
  }
  function logWizard(msg) {
    if (global.crozzoWizardTierLogLine) global.crozzoWizardTierLogLine(msg);
  }
  async function announceIamServer() {
    if (!global.__SUPABASE || !getIsActiveServer()) return;
    var cfg = global.getMultiDeviceConfig && global.getMultiDeviceConfig();
    if (!cfg || cfg.role !== 'A') return;
    var loc = cfg.locationId;
    if (!loc) return;
    try {
      var ch = global.__SUPABASE.channel(CHAN);
      await new Promise(function (resolve) {
        ch.subscribe(function (st) {
          if (st === 'SUBSCRIBED' || st === 'CHANNEL_ERROR') resolve();
        });
      });
      await ch.send({
        type: 'broadcast',
        event: 'server_iam',
        payload: {
          role: 'A',
          is_active_server: true,
          location_id: loc,
          device_id: cfg.deviceId,
          ts: Date.now()
        }
      });
      setTimeout(function () {
        try {
          ch.unsubscribe();
        } catch (e) { /* ignore */ }
      }, 400);
    } catch (e) { /* ignore */ }
  }
  function respondToWhoIfServerA() {
    if (_whoUnsub) {
      try {
        _whoUnsub();
      } catch (e) { /* ignore */ }
      _whoUnsub = null;
    }
    if (!global.__SUPABASE) return;
    var cfg = global.getMultiDeviceConfig && global.getMultiDeviceConfig();
    if (!cfg || cfg.role !== 'A' || !getIsActiveServer()) return;
    var ch = global.__SUPABASE.channel(CHAN);
    ch.on('broadcast', { event: 'server_who' }, function (wr) {
      var p = wr && wr.payload != null ? wr.payload : wr;
      if (!p || !p.location_id) return;
      if (p.location_id !== cfg.locationId) return;
      if (!getIsActiveServer()) return;
      ch.send({
        type: 'broadcast',
        event: 'server_iam',
        payload: {
          role: 'A',
          is_active_server: true,
          location_id: cfg.locationId,
          device_id: cfg.deviceId,
          ts: Date.now()
        }
      }).catch(function () {});
    });
    ch.subscribe();
    _whoUnsub = function () {
      try {
        ch.unsubscribe();
      } catch (e) { /* ignore */ }
    };
  }
  function startHeartbeat() {
    stopHeartbeat();
    _hbTimer = setInterval(function () {
      announceIamServer();
    }, 28000);
  }
  function stopHeartbeat() {
    if (_hbTimer) {
      clearInterval(_hbTimer);
      _hbTimer = null;
    }
  }
  function afterMainInit() {
    respondToWhoIfServerA();
    var cfg = global.getMultiDeviceConfig && global.getMultiDeviceConfig();
    if (cfg && cfg.role === 'A' && getIsActiveServer()) {
      startHeartbeat();
      announceIamServer();
    }
    if (global.updateCrozzoServerConflictBadge) global.updateCrozzoServerConflictBadge();
  }
  async function checkActiveServers(opt) {
    return checkActiveServersOnNetwork(opt);
  }
  global.CrozzoNetworkGuard = {
    generateLocationId: generateLocationId,
    ensureLocationIdForPayload: ensureLocationIdForPayload,
    probeCentralStatus: probeCentralStatus,
    checkActiveServers: checkActiveServers,
    checkActiveServersOnNetwork: checkActiveServersOnNetwork,
    getIsActiveServer: getIsActiveServer,
    setIsActiveServer: setIsActiveServer,
    isForceDualServerA: isForceDualServerA,
    setForceDualServerA: setForceDualServerA,
    setConflictBanner: setConflictBanner,
    logWizard: logWizard,
    announceIamServer: announceIamServer,
    afterMainInit: afterMainInit,
    respondToWhoIfServerA: respondToWhoIfServerA,
    startHeartbeat: startHeartbeat,
    stopHeartbeat: stopHeartbeat
  };
  global.NetworkGuard = global.CrozzoNetworkGuard;
})(typeof window !== 'undefined' ? window : this);
/* ========== QRPairing.js ========== */
/**
 * QRPairing — emparejamiento v2 con location_id y ventana de tiempo.
 *
 * Formato QR: { type: 'CROZZO_PAIRING', v: 2, role, deviceId, locationId, centralIp, port, name, ts }
 * Legacy v1: { type: 'crozzo_pair', ... } sigue soportado en validate/migrate.
 */
(function (global) {
  'use strict';
  var TYPE = 'CROZZO_PAIRING';
  var LEGACY = 'crozzo_pair';
  function now() {
    return Date.now();
  }
  /**
   * @param {{
   *   deviceId: string,
   *   locationId: string,
   *   centralIp: string,
   *   port?: number,
   *   name?: string,
   *   businessName?: string
   * }} p
   */
  function generate(p) {
    p = p || {};
    return {
      type: TYPE,
      v: 2,
      role: 'A',
      deviceId: String(p.deviceId || '').trim(),
      locationId: String(p.locationId || '').trim(),
      centralIp: String(p.centralIp || p.serverIp || '').trim(),
      port: Math.max(1, Number(p.port) || 3000),
      name: String(p.name || p.businessName || '').trim(),
      ts: typeof p.ts === 'number' ? p.ts : now()
    };
  }
  function toJSON(obj) {
    try {
      return JSON.stringify(obj);
    } catch (e) {
      return '';
    }
  }
  /**
   * @param {string|object} raw
   * @param {{ maxAgeMs?: number, localLocationId?: string, myDeviceId?: string }} opts
   */
  function validate(raw, opts) {
    opts = opts || {};
    var maxAge = opts.maxAgeMs != null ? opts.maxAgeMs : 24 * 60 * 60 * 1000;
    var obj = null;
    if (typeof raw === 'string') {
      try {
        obj = JSON.parse(raw);
      } catch (e) {
        return { ok: false, code: 'json', message: 'JSON inválido' };
      }
    } else {
      obj = raw;
    }
    if (!obj || typeof obj !== 'object') return { ok: false, code: 'shape', message: 'Payload vacío' };
    if (obj.type === LEGACY) {
      return {
        ok: true,
        legacy: true,
        data: {
          centralIp: String(obj.centralIp || obj.serverIp || '').trim(),
          port: Math.max(1, Number(obj.port) || 3000),
          locationId: '',
          deviceId: String(obj.deviceId || '')
        }
      };
    }
    if (obj.type !== TYPE) return { ok: false, code: 'type', message: 'Tipo de QR no reconocido' };
    if (Number(obj.v) !== 2) return { ok: false, code: 'version', message: 'Versión de pareo no soportada' };
    if (obj.role !== 'A') return { ok: false, code: 'role', message: 'Solo el central (A) genera QR de pareo' };
    var ts = Number(obj.ts) || 0;
    if (!ts || now() - ts > maxAge) {
      return { ok: false, code: 'stale', message: 'Código QR expirado (máx. ' + Math.round(maxAge / 3600000) + ' h)' };
    }
    var deviceId = String(obj.deviceId || '').trim();
    var myId = String(opts.myDeviceId || (global.ensureCrozzoDeviceId && global.ensureCrozzoDeviceId()) || '').trim();
    if (deviceId && myId && deviceId === myId) {
      return { ok: false, code: 'self', message: 'Este QR fue generado en el mismo dispositivo' };
    }
    var loc = String(obj.locationId || '').trim();
    var localLoc = String(opts.localLocationId || '').trim();
    if (localLoc && loc && loc !== localLoc) {
      return {
        ok: false,
        code: 'location',
        message: 'La ubicación de red no coincide. Revisa Wi‑Fi / nota SSID en ambos equipos.'
      };
    }
    var ip = String(obj.centralIp || '').trim();
    if (!ip) return { ok: false, code: 'ip', message: 'Falta IP del central en el QR' };
    return {
      ok: true,
      legacy: false,
      data: {
        centralIp: ip,
        port: Math.max(1, Number(obj.port) || 3000),
        locationId: loc,
        deviceId: deviceId,
        name: String(obj.name || '')
      }
    };
  }
  global.CrozzoQRPairing = {
    TYPE: TYPE,
    generate: generate,
    validate: validate,
    toJSON: toJSON
  };
  global.QRPairing = global.CrozzoQRPairing;
})(typeof window !== 'undefined' ? window : this);
/* ========== IdempotentSync.js ========== */
/**
 * Crozzo IdempotentSync — inserción segura local y deduplicación de cola.
 */
(function (global) {
  'use strict';
  var CRITICAL_DEFAULT = ['nombre', 'name', 'total', 'items', 'cliente_id', 'product_id', 'qty', 'cantidad', 'precio'];
  async function sha256Hex(str) {
    if (!global.crypto || !global.crypto.subtle) {
      return 'nohash_' + String(str.length) + '_' + String(str).slice(0, 40);
    }
    var enc = new TextEncoder().encode(str);
    var digest = await global.crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(digest))
      .map(function (b) {
        return b.toString(16).padStart(2, '0');
      })
      .join('');
  }
  async function computeSyncHash(record, fields) {
    var r = record || {};
    var use = fields && fields.length ? fields : CRITICAL_DEFAULT;
    var o = {};
    for (var i = 0; i < use.length; i++) {
      var k = use[i];
      if (Object.prototype.hasOwnProperty.call(r, k)) o[k] = r[k];
    }
    var canonical = JSON.stringify(o, Object.keys(o).sort());
    return sha256Hex(canonical);
  }
  function tsOf(x) {
    if (!x) return 0;
    var u = x.updated_at != null ? x.updated_at : x.updatedAt;
    if (typeof u === 'number') return u;
    if (typeof u === 'string') {
      var n = Date.parse(u);
      return isNaN(n) ? 0 : n;
    }
    return 0;
  }
  /**
   * @returns {'incoming'|'existing'|'same'}
   */
  function mergeRecord(existing, incoming) {
    var te = tsOf(existing);
    var ti = tsOf(incoming);
    if (ti > te) return 'incoming';
    if (ti < te) return 'existing';
    var he = existing.sync_hash || '';
    var hi = incoming.sync_hash || '';
    if (hi && he === hi) return 'same';
    if (incoming.sync_hash && !existing.sync_hash) return 'incoming';
    return 'existing';
  }
  async function safeInsert(table, record) {
    var row = Object.assign({}, record);
    if (row.id == null || row.id === '') {
      if (global.crypto && global.crypto.randomUUID) row.id = global.crypto.randomUUID();
      else row.id = 'L' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
    }
    if (!row.updated_at && !row.updatedAt) {
      var now = Date.now();
      row.updated_at = now;
      row.updatedAt = now;
    }
    row.sync_hash = row.sync_hash || (await computeSyncHash(row));
    var db = global.crozzoLocalDb;
    if (!db || typeof db.get !== 'function') {
      return { action: 'insert', record: row };
    }
    var existing = await db.get(table, row.id);
    if (!existing) {
      await db.insert(table, row);
      return { action: 'insert', record: row };
    }
    var winner = mergeRecord(existing, row);
    if (winner === 'same' || winner === 'existing') {
      return { action: 'skip', record: existing };
    }
    var merged = Object.assign({}, existing, row, { id: existing.id });
    await db.insert(table, merged);
    return { action: 'update', record: merged };
  }
  function queueTransactionId(q) {
    if (!q) return '';
    var tid =
      q.transaction_id ||
      q.sync_transaction_id ||
      (q.payload && (q.payload.transaction_id || q.payload.sync_transaction_id));
    if (!tid && q.type === 'emergency_comanda') {
      tid = q._emergency_tid || (q.payload && q.payload.transaction_id);
    }
    return tid ? String(tid) : '';
  }
  function deduplicateQueue(queue) {
    if (!Array.isArray(queue)) return [];
    var byTid = {};
    var byUuid = {};
    for (var i = 0; i < queue.length; i++) {
      var q = queue[i];
      if (!q) continue;
      var tid = queueTransactionId(q);
      if (tid) {
        var prevT = byTid[tid];
        var tq = q.ts != null ? q.ts : q.createdAt != null ? q.createdAt : 0;
        var tprev = prevT ? (prevT.ts != null ? prevT.ts : prevT.createdAt != null ? prevT.createdAt : 0) : -1;
        if (!prevT || tq >= tprev) byTid[tid] = q;
        continue;
      }
      var id = q.uuid != null ? q.uuid : q.id;
      if (id == null || id === '') continue;
      var prev = byUuid[id];
      var ta = prev ? prev.createdAt || prev.ts || 0 : 0;
      var tb = q.createdAt || q.ts || 0;
      if (!prev || tb >= ta) byUuid[id] = q;
    }
    var out = [];
    Object.keys(byTid).forEach(function (k) {
      out.push(byTid[k]);
    });
    Object.keys(byUuid).forEach(function (k) {
      var row = byUuid[k];
      var t = queueTransactionId(row);
      if (t && byTid[t]) return;
      out.push(row);
    });
    return out;
  }
  function wrapCrozzoDbInsert() {
    var orig = global.crozzoDbInsert;
    if (typeof orig !== 'function') return;
    global.crozzoDbInsert = async function (table, row) {
      if (global.__CROZZO_ONLINE_DATA && global.__SUPABASE) return orig(table, row);
      try {
        var out = await safeInsert(table, row);
        return { data: [out.record], error: null, _syncAction: out.action };
      } catch (e) {
        return { data: null, error: e };
      }
    };
  }
  function reconcileAfterOnline() {
    var r = null;
    try {
      if (typeof global.__crozzoGetMultiSyncRouter === 'function') r = global.__crozzoGetMultiSyncRouter();
    } catch (e) { /* ignore */ }
    try {
      if (r && typeof r.runHealthChecks === 'function') r.runHealthChecks();
      if (r && typeof r.processQueue === 'function') r.processQueue();
    } catch (e2) {
      console.warn('[IdempotentSync] reconcileAfterOnline', e2);
    }
  }
  global.CrozzoIdempotentSync = {
    computeSyncHash: computeSyncHash,
    mergeRecord: mergeRecord,
    safeInsert: safeInsert,
    deduplicateQueue: deduplicateQueue,
    queueTransactionId: queueTransactionId,
    reconcileAfterOnline: reconcileAfterOnline,
    wrapCrozzoDbInsert: wrapCrozzoDbInsert
  };
  global.IdempotentSync = global.CrozzoIdempotentSync;
  wrapCrozzoDbInsert();
})(typeof window !== 'undefined' ? window : this);
/* ========== SyncRouter.js ========== */
/**
 * SyncRouter (módulo Crozzo) — tier con latencia, badges y reconciliación al volver online.
 *
 * LIMITACIONES (navegador): sin SSID/MAC reales; hotspot “real” no es detectable de forma fiable —
 * se combina marcador UI + navigator.connection cuando existe. WebRTC P2P requiere señalización
 * (p. ej. Supabase Realtime) salvo acuerdos fuera de banda.
 */
(function (global) {
  'use strict';
  var _tierTimer = null;
  var TIER_INTERVAL_MS = 14000;
  /** Referencia a la implementación “built-in” del HTML (antes del parche). */
  var _detectBuiltin = null;
  async function detectConnectivityTier() {
    var t0 = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    var fn = _detectBuiltin;
    if (typeof fn !== 'function') {
      return {
        tier: 'offline',
        reason: 'Detector no inicializado',
        details: 'Ejecute initPOS()',
        latency: 0
      };
    }
    var out = await fn();
    var t1 = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    var latencyMs = Math.max(0, Math.round(t1 - t0));
    var detailParts = [];
    if (out && out.reason) detailParts.push(out.reason);
    if (out && out.hotspotUi) detailParts.push('UI hotspot');
    var merged = Object.assign({}, out, {
      details: detailParts.join(' · ') || (out && out.reason) || '',
      latency: latencyMs
    });
    try {
      global.__CROZZO_LAST_TIER_INFO = merged;
    } catch (e) { /* ignore */ }
    return merged;
  }
  function hasConflictFlag() {
    try {
      if (global.CrozzoNetworkGuard && CrozzoNetworkGuard.isForceDualServerA()) return true;
      if (global.localStorage.getItem('crozzo_server_conflict_banner')) return true;
    } catch (e) { /* ignore */ }
    return false;
  }
  async function refreshConnectivityBadges() {
    var info;
    try {
      info = await detectConnectivityTier();
    } catch (e) {
      console.warn('[CrozzoSyncRouter]', e);
      info = { tier: 'offline', details: String(e.message || e), latency: 0 };
    }
    if (typeof global.updateConnectivityTierBadge === 'function') {
      global.updateConnectivityTierBadge(info);
    }
    var el = document.getElementById('crozzoConnectivityTierBadge');
    if (el) {
      var conflict = hasConflictFlag();
      if (conflict && el.textContent.indexOf('⚠️') < 0) {
        el.textContent = el.textContent.replace(/\s*·\s*⚠️\s*$/, '') + ' · ⚠️';
      }
      if (!conflict) {
        el.textContent = el.textContent.replace(/\s*·\s*⚠️\s*$/, '');
      }
      el.classList.toggle('crozzo-tier-with-conflict', conflict);
      var baseTitle = el.getAttribute('title') || '';
      if (info.latency != null && baseTitle.indexOf('ms') < 0) {
        el.setAttribute('title', baseTitle + ' · latencia ~' + info.latency + ' ms');
      }
    }
    if (typeof global.updateCrozzoServerConflictBadge === 'function') {
      global.updateCrozzoServerConflictBadge();
    }
  }
  function routeOperation(operation) {
    if (global.SyncRouter && typeof global.SyncRouter.getInstance === 'function') {
      return global.SyncRouter.getInstance().route(operation);
    }
    if (typeof global.crozzoMultiSend === 'function') {
      return global.crozzoMultiSend(operation);
    }
    return Promise.resolve({ success: false, error: 'SyncRouter no disponible' });
  }
  function startTierWatch() {
    stopTierWatch();
    _tierTimer = setInterval(function () {
      refreshConnectivityBadges();
    }, TIER_INTERVAL_MS);
  }
  function stopTierWatch() {
    if (_tierTimer) {
      clearInterval(_tierTimer);
      _tierTimer = null;
    }
  }
  function init() {
    if (_detectBuiltin == null && typeof global.detectConnectivityTier === 'function') {
      _detectBuiltin = global.detectConnectivityTier;
    }
    global.detectConnectivityTier = detectConnectivityTier;
    global.addEventListener('online', function () {
      refreshConnectivityBadges();
      if (global.CrozzoIdempotentSync && typeof global.CrozzoIdempotentSync.reconcileAfterOnline === 'function') {
        global.CrozzoIdempotentSync.reconcileAfterOnline();
      }
    });
    global.addEventListener('offline', function () {
      refreshConnectivityBadges();
    });
    refreshConnectivityBadges();
    startTierWatch();
  }
  global.CrozzoSyncRouterModule = {
    init: init,
    detectConnectivityTier: detectConnectivityTier,
    refreshConnectivityBadges: refreshConnectivityBadges,
    routeOperation: routeOperation,
    startTierWatch: startTierWatch,
    stopTierWatch: stopTierWatch
  };
  global.routePOSOperation = routeOperation;
})(typeof window !== 'undefined' ? window : this);
/* ========== AutoConfig.js ========== */
/**
 * Crozzo AutoConfig — capa fina sobre NetworkGuard + SyncRouter (sin reemplazarlos).
 * La orquestación completa vive en window.__crozzoAutoConfigExecute (HTML).
 */
(function (global) {
  'use strict';
  async function detectOptimalTier() {
    if (global.CrozzoSyncRouterModule && typeof global.CrozzoSyncRouterModule.detectConnectivityTier === 'function') {
      return global.CrozzoSyncRouterModule.detectConnectivityTier();
    }
    if (typeof global.detectConnectivityTier === 'function') {
      return global.detectConnectivityTier();
    }
    return { tier: 'offline', reason: 'Sin detector', details: '', latency: 0 };
  }
  function checkActiveServers(opt) {
    if (global.CrozzoNetworkGuard && typeof global.CrozzoNetworkGuard.checkActiveServers === 'function') {
      return global.CrozzoNetworkGuard.checkActiveServers(opt);
    }
    return Promise.resolve({ peers: [], conflict: false });
  }
  function generateLocationId(opts) {
    if (global.CrozzoNetworkGuard && typeof global.CrozzoNetworkGuard.generateLocationId === 'function') {
      return global.CrozzoNetworkGuard.generateLocationId(opts);
    }
    return Promise.resolve('');
  }
  function syncRouterStart() {
    if (global.CrozzoSyncRouterModule && typeof global.CrozzoSyncRouterModule.refreshConnectivityBadges === 'function') {
      return global.CrozzoSyncRouterModule.refreshConnectivityBadges();
    }
    return Promise.resolve();
  }
  async function start() {
    if (typeof global.__crozzoAutoConfigExecute === 'function') {
      return global.__crozzoAutoConfigExecute();
    }
    if (global.showToast) global.showToast('Auto-config no enlazada.', 'error');
    return false;
  }
  async function applyAdvancedConfig(data) {
    if (typeof global.__crozzoApplyAdvancedWizardConfig === 'function') {
      return global.__crozzoApplyAdvancedWizardConfig(data);
    }
    if (global.showToast) global.showToast('Configuración avanzada no disponible.', 'warning');
    return false;
  }
  var api = {
    start: start,
    detectOptimalTier: detectOptimalTier,
    checkActiveServers: checkActiveServers,
    generateLocationId: generateLocationId,
    applyAdvancedConfig: applyAdvancedConfig,
    syncRouterStart: syncRouterStart
  };
  global.CrozzoAutoConfig = api;
  global.AutoConfig = api;
})(typeof window !== 'undefined' ? window : this);
/* ========== DiagnosticsPanel.js ========== */
/**
 * Crozzo — Panel de diagnóstico (solo lectura, Super Admin).
 * Depende de APIs globales del bundle principal; no modifica datos de negocio.
 */
(function (global) {
  'use strict';
  var TIMEOUT_MS = 3000;
  var LS_DIAG = '__crozzo_diag_ls_probe__';
  var _state = {
    entries: [],
    aborts: [],
    root: null,
    onKey: null
  };
  function ts() {
    return new Date().toISOString().replace('T', ' ').slice(0, 23);
  }
  function withTimeout(promise, ms) {
    var c = new AbortController();
    _state.aborts.push(c);
    var t;
    var timeoutP = new Promise(function (_, rej) {
      t = global.setTimeout(function () {
        try {
          c.abort();
        } catch (e) { /* ignore */ }
        rej(new Error('timeout'));
      }, ms || TIMEOUT_MS);
    });
    return Promise.race([promise, timeoutP]).finally(function () {
      global.clearTimeout(t);
    });
  }
  function logLine(level, message, testId) {
    var line = { t: ts(), level: level, testId: testId || '', message: String(message || '') };
    _state.entries.push(line);
    var host = global.document.getElementById('diagnostics-logs');
    if (!host) return;
    var span = global.document.createElement('div');
    span.className = 'diag-log-line diag-lvl-' + level;
    span.textContent = line.t + ' [' + (line.testId || '—') + '] ' + line.message;
    host.appendChild(span);
    host.scrollTop = host.scrollHeight;
  }
  function setCardState(testId, state) {
    var el = global.document.querySelector('.diag-card[data-test-id="' + testId + '"]');
    if (!el) return;
    el.classList.remove('is-running', 'is-ok', 'is-warn', 'is-fail', 'is-muted');
    if (state === 'run') el.classList.add('is-running');
    else if (state === 'ok') el.classList.add('is-ok');
    else if (state === 'warn') el.classList.add('is-warn');
    else if (state === 'fail') el.classList.add('is-fail');
    else el.classList.add('is-muted');
  }
  function badgeChar(level) {
    if (level === 'ok') return '✅';
    if (level === 'warn') return '⚠️';
    if (level === 'fail') return '❌';
    return '⚪';
  }
  async function testSupabase() {
    var id = 'supabase';
    setCardState(id, 'run');
    var online = typeof navigator !== 'undefined' ? !!navigator.onLine : true;
    logLine('ok', 'navigator.onLine=' + online, id);
    var j =
      typeof global.readCrozzoSupabaseJson === 'function'
        ? global.readCrozzoSupabaseJson()
        : null;
    if (!j || !j.syncEnabled) {
      logLine('muted', 'Cloud Supabase no configurado o sync desactivado (crozzo_supabase_config).', id);
      setCardState(id, 'muted');
      return { level: 'muted', summary: 'No configurado' };
    }
    var url = String(j.url || '').trim();
    var key = typeof global.crozzoSupabaseEffectiveAnonKey === 'function'
      ? global.crozzoSupabaseEffectiveAnonKey(j)
      : String(j.anonKey || '').trim();
    if (!url || !key) {
      logLine('warn', 'Faltan URL o anon key en archivo de credenciales.', id);
      setCardState(id, 'warn');
      return { level: 'warn', summary: 'Credenciales incompletas' };
    }
    try {
      await withTimeout(
        (async function () {
          var base = url.replace(/\/$/, '');
          var u = base + '/rest/v1/devices?limit=1&select=id';
          var c = new AbortController();
          _state.aborts.push(c);
          var hdr = {
            'apikey': key,
            'Authorization': 'Bearer ' + key,
            'Content-Type': 'application/json',
          };
          var res = await global.fetch(u, { method: 'GET', signal: c.signal, headers: hdr });
          if (res && res.status === 401 && typeof global.crozzoNotifySupabase401Once === 'function') {
            global.crozzoNotifySupabase401Once();
          }
          if (!res || (!res.ok && res.status !== 200 && res.status !== 206)) {
            throw new Error('HTTP ' + (res && res.status));
          }
        })(),
        TIMEOUT_MS
      );
      logLine('ok', 'REST alcanzable (cabeceras apikey/Authorization).', id);
    } catch (e) {
      logLine('fail', 'REST no respondió a tiempo o error: ' + (e && e.message), id);
      setCardState(id, 'fail');
      return { level: 'fail', summary: 'REST timeout/error' };
    }
    var sb = global.__SUPABASE;
    if (!sb || !sb.auth || typeof sb.auth.getUser !== 'function') {
      logLine('warn', 'Cliente __SUPABASE no inicializado (getUser omitido).', id);
      setCardState(id, 'warn');
      return { level: 'warn', summary: 'Cliente ausente' };
    }
    try {
      var gu = await withTimeout(sb.auth.getUser(), TIMEOUT_MS);
      if (gu && gu.error) logLine('warn', 'auth.getUser: ' + (gu.error.message || String(gu.error)), id);
      else if (gu && gu.data && gu.data.user) logLine('ok', 'Sesión: usuario ' + (gu.data.user.email || gu.data.user.id || 'ok'), id);
      else logLine('muted', 'Sin sesión Supabase Auth (anon / no logueado).', id);
    } catch (e2) {
      logLine('warn', 'auth.getUser falló: ' + (e2 && e2.message), id);
    }
    try {
      if (typeof global.loadTableData === 'function') {
        var r = await withTimeout(global.loadTableData('company_config', { limit: 1, select: 'id' }), TIMEOUT_MS);
        if (r && r.error) logLine('warn', 'RLS/lectura company_config: ' + (r.error.message || String(r.error)), id);
        else logLine('ok', 'Lectura company_config permitida (muestra 0–1 filas).', id);
      }
    } catch (e3) {
      logLine('warn', 'Prueba RLS básica omitida: ' + (e3 && e3.message), id);
    }
    setCardState(id, 'ok');
    return { level: 'ok', summary: 'Cloud OK' };
  }
  async function testLan() {
    var id = 'lan';
    setCardState(id, 'run');
    if (typeof global.config !== 'undefined' && global.config.getOperacionModo && global.config.getOperacionModo() === 'demo') {
      logLine('muted', 'ℹ️ Modo DEMO: diagnóstico LAN sigue activo pero puede no reflejar producción.', id);
    }
    var lip = null;
    if (typeof global.detectLocalIP === 'function') {
      try {
        lip = await withTimeout(global.detectLocalIP(), TIMEOUT_MS);
      } catch (e) {
        logLine('warn', 'detectLocalIP: ' + (e && e.message), id);
      }
    } else {
      logLine('muted', 'detectLocalIP() no expuesto en window.', id);
    }
    logLine(lip ? 'ok' : 'warn', 'IP local (WebRTC/heurística): ' + (lip || '—'), id);
    var gw = '';
    if (lip && typeof global.crozzoGatewayGuessForTier === 'function') {
      gw = global.crozzoGatewayGuessForTier(lip) || '';
    }
    if (gw) {
      var pingGw = false;
      if (typeof global.crozzoPingGatewayQuick === 'function') {
        try {
          pingGw = await withTimeout(global.crozzoPingGatewayQuick(gw), 2200);
        } catch (e2) {
          pingGw = false;
        }
      }
      logLine(pingGw ? 'ok' : 'warn', 'Gateway ' + gw + ' → respuesta HTTP opaca: ' + (pingGw ? 'probable' : 'no detectada'), id);
    } else {
      logLine('muted', 'Sin IP local; no se estimó gateway.', id);
    }
    setCardState(id, lip ? 'ok' : 'warn');
    return { level: lip ? 'ok' : 'warn', summary: lip ? 'LAN ' + lip : 'Sin IP' };
  }
  async function testHotspot() {
    var id = 'hotspot';
    setCardState(id, 'run');
    var lan = null;
    if (typeof global.readCrozzoLanJson === 'function') {
      try {
        lan = global.readCrozzoLanJson();
      } catch (e) {
        lan = null;
      }
    }
    if (!lan || !lan.lanSyncEnabled) {
      logLine('muted', 'LAN multidispositivo no activa en crozzo_lan_config.', id);
      setCardState(id, 'muted');
      return { level: 'muted', summary: 'LAN off' };
    }
    logLine('ok', 'Rol LAN: ' + (lan.role || '?') + ', location_id: ' + (lan.locationId || '—'), id);
    if (lan.role === 'A') {
      var active = global.CrozzoNetworkGuard && typeof global.CrozzoNetworkGuard.getIsActiveServer === 'function' ? global.CrozzoNetworkGuard.getIsActiveServer() : null;
      logLine('ok', 'Servidor A · is_active_server (LS): ' + String(active), id);
    }
    if (typeof global.getConexionSistemasConfig === 'function' && typeof global.crozzoPingHealthQuick === 'function') {
      try {
        var cs = global.getConexionSistemasConfig();
        if (cs && cs.role === 'A' && (cs.serverIp || '').trim()) {
          var hp = await withTimeout(
            global.crozzoPingHealthQuick((cs.serverIp || '').trim(), cs.port || 3000),
            2200
          );
          logLine(hp ? 'ok' : 'warn', '/health en IP configurada (rol A): ' + (hp ? 'respuesta opaca / probable OK' : 'sin señal'), id);
        } else if (cs && cs.role === 'B' && (cs.centralIp || '').trim()) {
          var hpB = await withTimeout(
            global.crozzoPingHealthQuick((cs.centralIp || '').trim(), cs.port || 3000),
            2200
          );
          logLine(hpB ? 'ok' : 'warn', '/health hacia central (rol B): ' + (hpB ? 'respuesta opaca / probable OK' : 'sin señal'), id);
        }
      } catch (e0) {
        logLine('muted', 'Prueba /health opcional omitida.', id);
      }
    }
    if (global.CrozzoNetworkGuard && typeof global.CrozzoNetworkGuard.checkActiveServers === 'function' && lan.locationId) {
      try {
        var dev = typeof global.ensureCrozzoDeviceId === 'function' ? global.ensureCrozzoDeviceId() : '';
        var res = await withTimeout(
          global.CrozzoNetworkGuard.checkActiveServers({
            locationId: lan.locationId,
            deviceId: dev,
            port: Number(lan.port) || 3000
          }),
          TIMEOUT_MS
        );
        var n = (res && res.peers && res.peers.length) || 0;
        logLine(n ? 'warn' : 'ok', 'Otros servidores A detectados en misma ubicación: ' + n, id);
      } catch (e) {
        logLine('warn', 'checkActiveServers: ' + (e && e.message), id);
      }
    } else {
      logLine('muted', 'checkActiveServers omitido (sin NetworkGuard o location_id).', id);
    }
    setCardState(id, 'ok');
    return { level: 'ok', summary: 'LAN sync' };
  }
  async function testStorage() {
    var id = 'storage';
    setCardState(id, 'run');
    var t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    try {
      global.localStorage.setItem(LS_DIAG, String(Date.now()));
      var v = global.localStorage.getItem(LS_DIAG);
      global.localStorage.removeItem(LS_DIAG);
      if (!v) throw new Error('readback');
    } catch (e) {
      logLine('fail', 'localStorage: ' + (e && e.message), id);
      setCardState(id, 'fail');
      return { level: 'fail', summary: 'localStorage' };
    }
    var lsMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0);
    logLine('ok', 'localStorage ciclo write/read/delete OK (~' + lsMs + ' ms).', id);
    var idbMs = null;
    try {
      idbMs = await withTimeout(
        new Promise(function (resolve, reject) {
          var req = global.indexedDB.open('CrozzoDiagSandbox', 1);
          req.onerror = function () {
            reject(req.error);
          };
          req.onupgradeneeded = function () {
            try {
              if (!req.result.objectStoreNames.contains('__diag_test')) {
                req.result.createObjectStore('__diag_test');
              }
            } catch (e2) {
              reject(e2);
            }
          };
          req.onsuccess = function () {
            var db = req.result;
            var t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
            try {
              var tx = db.transaction('__diag_test', 'readwrite');
              tx.objectStore('__diag_test').put({ ok: 1, at: Date.now() }, 'probe');
              tx.oncomplete = function () {
                var tx2 = db.transaction('__diag_test', 'readwrite');
                tx2.objectStore('__diag_test').delete('probe');
                tx2.oncomplete = function () {
                  try {
                    db.close();
                  } catch (e3) { /* ignore */ }
                  resolve(Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t1));
                };
                tx2.onerror = function () {
                  try {
                    db.close();
                  } catch (e4) { /* ignore */ }
                  resolve(null);
                };
              };
              tx.onerror = function () {
                try {
                  db.close();
                } catch (e5) { /* ignore */ }
                reject(tx.error);
              };
            } catch (e6) {
              try {
                db.close();
              } catch (e7) { /* ignore */ }
              reject(e6);
            }
          };
        }),
        TIMEOUT_MS
      );
    } catch (e8) {
      logLine('warn', 'IndexedDB sandbox: ' + (e8 && e8.message), id);
    }
    if (idbMs != null) logLine('ok', 'IndexedDB sandbox __diag_test OK (~' + idbMs + ' ms).', id);
    else logLine('muted', 'IndexedDB sandbox no disponible o timeout.', id);
    setCardState(id, 'ok');
    return { level: 'ok', summary: 'Storage OK' };
  }
  async function testSyncQueue() {
    var id = 'syncqueue';
    setCardState(id, 'run');
    if (typeof global.config !== 'undefined' && global.config.getOperacionModo && global.config.getOperacionModo() === 'demo') {
      logLine('muted', 'ℹ️ Modo DEMO: colas pueden estar vacías o simuladas.', id);
    }
    var q = [];
    try {
      var raw = global.localStorage.getItem('crozzo_sync_queue') || global.localStorage.getItem('sync_queue_temp');
      q = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(q)) q = [];
    } catch (e) {
      q = [];
    }
    var pending = q.filter(function (x) {
      return (x.status || x.state || 'pending') === 'pending';
    }).length;
    logLine('ok', 'Cola local (crozzo_sync_queue / temp): ' + q.length + ' ítems, ~' + pending + ' pendientes.', id);
    var r = typeof global.__crozzoGetMultiSyncRouter === 'function' ? global.__crozzoGetMultiSyncRouter() : null;
    if (r && r.status) {
      logLine('ok', 'MultiDeviceSyncRouter: cloud=' + r.status.cloud + ', lan=' + r.status.lan + ', pending=' + (r.status.pending || 0), id);
      if (Array.isArray(r.queue)) logLine('ok', 'Router.queue (memoria): ' + r.queue.length + ' ítems.', id);
    } else {
      logLine('muted', 'MultiDeviceSyncRouter no activo en esta vista.', id);
    }
    if (global.CrozzoIdempotentSync && typeof global.CrozzoIdempotentSync.getQueueStatus === 'function') {
      try {
        var st = await withTimeout(Promise.resolve(global.CrozzoIdempotentSync.getQueueStatus()), TIMEOUT_MS);
        logLine('ok', 'IdempotentSync.getQueueStatus: ' + JSON.stringify(st).slice(0, 200), id);
      } catch (e2) {
        logLine('muted', 'getQueueStatus error', id);
      }
    } else {
      logLine('muted', 'IdempotentSync.getQueueStatus no expuesto; solo inspección pasiva.', id);
    }
    var sb = global.__SUPABASE;
    if (sb && typeof global.loadTableData === 'function') {
      try {
        var cloud = await withTimeout(global.loadTableData('sync_queue', { limit: 3, select: 'id,status' }), TIMEOUT_MS);
        if (cloud && cloud.error) logLine('warn', 'Cloud sync_queue lectura: ' + (cloud.error.message || String(cloud.error)), id);
        else logLine('ok', 'Cloud sync_queue: ' + ((cloud.data && cloud.data.length) || 0) + ' filas (muestra).', id);
      } catch (e3) {
        logLine('warn', 'sync_queue cloud: ' + (e3 && e3.message), id);
      }
    }
    setCardState(id, 'ok');
    return { level: 'ok', summary: 'Cola OK' };
  }
  async function testDian() {
    var id = 'dian';
    setCardState(id, 'run');
    var modo = typeof global.config !== 'undefined' && global.config.getOperacionModo ? global.config.getOperacionModo() : '—';
    logLine('ok', 'Modo operación (config): ' + modo, id);
    if (modo === 'demo') {
      logLine('muted', 'ℹ️ No aplica validación DIAN productiva en modo prueba.', id);
      setCardState(id, 'muted');
      return { level: 'muted', summary: 'Demo' };
    }
    if (typeof global.config !== 'undefined' && global.config.isElectronicMode && global.config.isElectronicMode()) {
      var v = typeof global.config.canGoLive === 'function' ? global.config.canGoLive() : { valid: true };
      if (!v.valid) {
        logLine('warn', 'Electrónica sin go-live: faltan ' + ((v.missing || []).join(', ') || 'datos'), id);
        setCardState(id, 'warn');
        return { level: 'warn', summary: 'Pendiente DIAN' };
      }
      logLine('ok', 'canGoLive: listo para operación electrónica.', id);
    }
    setCardState(id, 'ok');
    return { level: 'ok', summary: 'Modo ' + modo };
  }
  async function testPermissions() {
    var id = 'permissions';
    setCardState(id, 'run');
    var u = typeof global.getCurrentUser === 'function' ? global.getCurrentUser() : null;
    if (!u) {
      logLine('warn', 'Sin usuario de sesión (getCurrentUser null).', id);
      setCardState(id, 'warn');
      return { level: 'warn', summary: 'Sin sesión' };
    }
    logLine('ok', 'Usuario: ' + (u.nombre || u.id || '—') + ', rol app: ' + (u.rol || '—'), id);
    var isSuper = typeof global.isSuperAdminUser === 'function' && global.isSuperAdminUser();
    logLine(isSuper ? 'ok' : 'warn', 'Super Admin: ' + (isSuper ? 'sí' : 'no'), id);
    var sb = global.__SUPABASE;
    if (sb && typeof global.loadTableData === 'function') {
      try {
        var a = await withTimeout(global.loadTableData('audit_logs', { limit: 1, select: 'id' }), TIMEOUT_MS);
        if (a && a.error) logLine('warn', 'audit_logs lectura: ' + (a.error.message || String(a.error)), id);
        else logLine('ok', 'audit_logs: lectura permitida.', id);
      } catch (e) {
        logLine('warn', 'audit_logs: ' + (e && e.message), id);
      }
      try {
        var d = await withTimeout(global.loadTableData('devices', { limit: 1, select: 'id' }), TIMEOUT_MS);
        if (d && d.error) logLine('warn', 'devices lectura: ' + (d.error.message || String(d.error)), id);
        else logLine('ok', 'devices: lectura permitida.', id);
      } catch (e2) {
        logLine('muted', 'devices: ' + (e2 && e2.message), id);
      }
    } else {
      logLine('muted', 'Sin Supabase / loadTableData; pruebas RLS omitidas.', id);
    }
    setCardState(id, isSuper ? 'ok' : 'warn');
    return { level: isSuper ? 'ok' : 'warn', summary: isSuper ? 'Super OK' : 'Rol' };
  }
  function detectTier() {
    if (global.CrozzoSyncRouterModule && typeof global.CrozzoSyncRouterModule.detectConnectivityTier === 'function') {
      return global.CrozzoSyncRouterModule.detectConnectivityTier();
    }
    if (global.SyncRouter && typeof global.SyncRouter.detectConnectivityTier === 'function') {
      return global.SyncRouter.detectConnectivityTier();
    }
    if (typeof global.detectConnectivityTier === 'function') {
      return global.detectConnectivityTier();
    }
    return Promise.resolve({ tier: 'unknown', reason: 'no detector' });
  }
  var TESTS = {
    supabase: testSupabase,
    lan: testLan,
    hotspot: testHotspot,
    storage: testStorage,
    syncqueue: testSyncQueue,
    dian: testDian,
    permissions: testPermissions
  };
  async function runTest(testId) {
    var fn = TESTS[testId];
    if (!fn) {
      logLine('fail', 'Prueba desconocida: ' + testId, testId);
      return;
    }
    if (global.requestIdleCallback) {
      await new Promise(function (r) {
        global.requestIdleCallback(function () {
          r();
        }, { timeout: 800 });
      });
    } else {
      await new Promise(function (r) {
        global.setTimeout(r, 0);
      });
    }
    try {
      await fn();
    } catch (e) {
      logLine('fail', testId + ' error: ' + (e && e.message), testId);
      setCardState(testId, 'fail');
    }
  }
  async function runAllTests() {
    logLine('ok', '=== Ejecutando todas las pruebas (paralelo, ' + TIMEOUT_MS + ' ms c/u) ===', '');
    var ids = Object.keys(TESTS);
    await Promise.allSettled(ids.map(function (id) {
      return runTest(id);
    }));
    try {
      var ti = await withTimeout(detectTier(), TIMEOUT_MS);
      logLine('ok', 'Tier global detectado: ' + ((ti && ti.tier) || '—') + ' — ' + ((ti && ti.reason) || ''), '');
    } catch (e) {
      logLine('muted', 'Tier: no disponible', '');
    }
    logLine('ok', '=== Fin lote ===', '');
  }
  function formatReport() {
    return _state.entries
      .map(function (e) {
        return e.t + '\t' + badgeChar(e.level) + '\t' + (e.testId || '—') + '\t' + e.message;
      })
      .join('\n');
  }
  async function copyReport() {
    var txt =
      'Diagnóstico del sistema\n' +
      'Generado: ' +
      new Date().toISOString() +
      '\nUA: ' +
      (typeof navigator !== 'undefined' ? navigator.userAgent : '') +
      '\n\n' +
      formatReport();
    try {
      await navigator.clipboard.writeText(txt);
      if (global.showToast) global.showToast('Reporte copiado al portapapeles.', 'success');
    } catch (e) {
      if (global.showToast) global.showToast('No se pudo copiar (permiso portapapeles).', 'warning');
    }
  }
  function renderSuperAdminDiagnosticsHTML() {
    return (
      '<div id="diagnostics-panel" class="diagnostics-panel">' +
      '  <div class="card">' +
      '    <div class="card-header">' +
      '      <div><span class="card-title">🧪 Pruebas de Conexión y Sistema</span>' +
      '      <p class="form-hint" style="margin-top:6px;">Solo lectura. No modifica ventas, inventario ni colas de negocio.</p></div>' +
      '      <div class="btn-group">' +
      '        <button type="button" class="btn btn-primary" id="diag-run-all">🚀 Ejecutar todas las pruebas</button>' +
      '        <button type="button" class="btn btn-outline" id="diag-copy">📋 Copiar reporte</button>' +
      '      </div>' +
      '    </div>' +
      '    <div class="diag-grid">' +
      card('supabase', '🌐 Supabase Cloud') +
      card('lan', '📡 Red LAN Local') +
      card('hotspot', '📶 Hotspot / Servidor A') +
      card('storage', '💾 Almacenamiento Local') +
      card('syncqueue', '🔄 Cola de Sincronización') +
      card('dian', '🔐 Configuración DIAN / Modo') +
      card('permissions', '🛡️ Permisos y Rol') +
      '    </div>' +
      '    <div class="diag-logs-wrap">' +
      '      <div class="diag-logs-head">Registro</div>' +
      '      <div id="diagnostics-logs" class="diag-logs" aria-live="polite"></div>' +
      '    </div>' +
      '  </div>' +
      '  <div class="card" style="margin-top:14px;">' +
      '    <div class="card-header">' +
      '      <div><span class="card-title">✅ Listo para producción (pulido final)</span>' +
      '      <p class="form-hint" style="margin-top:6px;">Validación ligera sobre <code>pos_dian_config</code>, certificado y entorno. No sustituye pruebas DIAN en ambiente de certificación.</p></div>' +
      '    </div>' +
      '    <div class="btn-group" style="margin-top:8px;">' +
      '      <button type="button" class="btn btn-primary" id="crozzo-readiness-run">🔎 Evaluar preparación</button>' +
      '    </div>' +
      '    <div id="crozzo-readiness-out" style="margin-top:12px;"></div>' +
      '  </div>' +
      '</div>'
    );
  }
  function card(id, title) {
    return (
      '<div class="diag-card" data-test-id="' +
      id +
      '">' +
      '  <div class="diag-card-title">' +
      title +
      '</div>' +
      '  <button type="button" class="btn btn-outline diag-run-one" data-run="' +
      id +
      '">Ejecutar</button>' +
      '</div>'
    );
  }
  function destroyDiagnosticsPanel() {
    if (_state.onKey && global.document) {
      global.document.removeEventListener('keydown', _state.onKey);
    }
    _state.onKey = null;
    _state.aborts.forEach(function (c) {
      try {
        if (c && typeof c.abort === 'function') c.abort();
      } catch (e) { /* ignore */ }
    });
    _state.aborts = [];
    _state.root = null;
  }
  function initDiagnosticsPanel() {
    destroyDiagnosticsPanel();
    _state.entries = [];
    _state.root = global.document.getElementById('diagnostics-panel');
    var logs = global.document.getElementById('diagnostics-logs');
    if (logs) logs.innerHTML = '';
    global.document.getElementById('diag-run-all')?.addEventListener('click', function () {
      runAllTests();
    });
    global.document.getElementById('diag-copy')?.addEventListener('click', function () {
      copyReport();
    });
    global.document.getElementById('crozzo-readiness-run')?.addEventListener('click', function () {
      if (typeof global.crozzoRunProductionReadiness === 'function') global.crozzoRunProductionReadiness();
    });
    global.document.querySelectorAll('.diag-run-one').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-run');
        if (id) runTest(id);
      });
    });
    _state.onKey = function (e) {
      if (e.key === 'Escape' && global.document.getElementById('diagnostics-panel')) {
        /* no cerrar app; solo evita propagación si se añade overlay */
      }
    };
    global.document.addEventListener('keydown', _state.onKey);
    logLine('ok', 'Panel listo. Pulse una prueba o «Ejecutar todas».', '');
  }
  global.renderSuperAdminDiagnosticsHTML = renderSuperAdminDiagnosticsHTML;
  global.initDiagnosticsPanel = initDiagnosticsPanel;
  global.destroyDiagnosticsPanel = destroyDiagnosticsPanel;
  global.runDiagnosticsTest = runTest;
  global.runAllDiagnosticsTests = runAllTests;
  global.formatDiagnosticsReport = formatReport;
  global.copyDiagnosticsReport = copyReport;
})(typeof window !== 'undefined' ? window : this);
/* ========== PersistentWebRTC.js ========== */
/**
 * Crozzo PersistentWebRTC — RTCPeerConnection resiliente, persistencia SDP/ICE (IDB), restartIce.
 * Sin STUN/TURN externos (solo host / candidatos locales).
 */
(function (global) {
  'use strict';
  var DB_NAME = 'CrozzoMeshSessionDB';
  var DB_VER = 1;
  var STORE = 'sessions';
  var SESSION_KEY = 'active_mesh_v1';
  var _db = null;
  function log(m) {
    try {
      console.info('[PersistentWebRTC]', m);
    } catch (e) { /* ignore */ }
  }
  function buildRtcConfiguration() {
    return {
      iceServers: [],
      bundlePolicy: 'max-bundle',
      iceTransportPolicy: 'all'
    };
  }
  function openSessionDb() {
    return new Promise(function (resolve, reject) {
      if (_db) return resolve(_db);
      var req = global.indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = function () {
        _db = req.result;
        resolve(_db);
      };
      req.onerror = function () {
        reject(req.error);
      };
    });
  }
  function sessionPut(doc) {
    return openSessionDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(doc);
        tx.oncomplete = function () {
          resolve();
        };
        tx.onerror = function () {
          reject(tx.error);
        };
      });
    });
  }
  function sessionGet(id) {
    return openSessionDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var rq = tx.objectStore(STORE).get(id);
        rq.onsuccess = function () {
          resolve(rq.result || null);
        };
        rq.onerror = function () {
          reject(rq.error);
        };
      });
    });
  }
  function candidateToJson(c) {
    if (!c) return null;
    try {
      return c.toJSON ? c.toJSON() : { candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex };
    } catch (e) {
      return { candidate: String(c.candidate || ''), sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex };
    }
  }
  /**
   * Persiste SDP local/remoto y candidatos ICE para recuperación tras reload o diagnóstico.
   */
  function saveSessionSnapshot(pc, meta) {
    if (!pc) return Promise.resolve();
    meta = meta || {};
    var doc = {
      id: SESSION_KEY,
      updatedAt: Date.now(),
      localDescription: pc.localDescription ? { type: pc.localDescription.type, sdp: pc.localDescription.sdp } : null,
      remoteDescription: pc.remoteDescription ? { type: pc.remoteDescription.type, sdp: pc.remoteDescription.sdp } : null,
      iceGatheringState: pc.iceGatheringState,
      connectionState: pc.connectionState,
      iceLocal: meta.iceLocal || [],
      iceRemote: meta.iceRemote || [],
      extra: meta.extra || {}
    };
    return sessionPut(doc).catch(function (e) {
      log('saveSessionSnapshot ' + e);
    });
  }
  function attachIcePersistence(pc, metaRef) {
    metaRef = metaRef || { iceLocal: [], iceRemote: [] };
    pc.addEventListener('icecandidate', function (ev) {
      if (!ev.candidate) return;
      var j = candidateToJson(ev.candidate);
      if (!j) return;
      metaRef.iceLocal.push(j);
      if (metaRef.iceLocal.length > 80) metaRef.iceLocal.shift();
      saveSessionSnapshot(pc, metaRef).catch(function () {});
    });
    return metaRef;
  }
  function rememberRemoteIceCandidate(pc, candidateInit, metaRef) {
    if (!candidateInit) return Promise.resolve();
    metaRef = metaRef || { iceLocal: [], iceRemote: [] };
    metaRef.iceRemote.push(candidateInit);
    if (metaRef.iceRemote.length > 80) metaRef.iceRemote.shift();
    return saveSessionSnapshot(pc, metaRef).catch(function () {});
  }
  /**
   * Tras reload: reconstruye PC y descripciones; addIceCandidate en cola si hace falta.
   * Puede fallar (DTLS) — caller debe ofrecer QR si reject.
   */
  function tryRestorePeerConnection(saved, hooks) {
    hooks = hooks || {};
    if (!saved || !saved.localDescription || !saved.remoteDescription) return Promise.resolve(null);
    var cfg = buildRtcConfiguration();
    var pc = new global.RTCPeerConnection(cfg);
    var metaRef = { iceLocal: saved.iceLocal ? saved.iceLocal.slice() : [], iceRemote: saved.iceRemote ? saved.iceRemote.slice() : [] };
    return pc
      .setRemoteDescription(new global.RTCSessionDescription(saved.remoteDescription))
      .then(function () {
        return pc.setLocalDescription(new global.RTCSessionDescription(saved.localDescription));
      })
      .then(function () {
        var chain = Promise.resolve();
        (saved.iceRemote || []).forEach(function (c) {
          chain = chain.then(function () {
            return pc.addIceCandidate(new global.RTCIceCandidate(c)).catch(function () {});
          });
        });
        return chain.then(function () {
          return { pc: pc, metaRef: metaRef };
        });
      })
      .catch(function (e) {
        log('tryRestorePeerConnection ' + e);
        try {
          pc.close();
        } catch (e2) { /* ignore */ }
        if (typeof hooks.onRestoreFailed === 'function') hooks.onRestoreFailed(e);
        return null;
      });
  }
  function loadSavedSession() {
    return sessionGet(SESSION_KEY).catch(function () {
      return null;
    });
  }
  var _reconnectTimer = null;
  var _restartIceInFlight = false;
  function restartIceSafe(pc) {
    if (!pc || typeof pc.restartIce !== 'function') return Promise.resolve(false);
    if (_restartIceInFlight) return Promise.resolve(false);
    _restartIceInFlight = true;
    return new Promise(function (resolve) {
      try {
        pc.restartIce();
        log('restartIce()');
        resolve(true);
      } catch (e) {
        log('restartIce err ' + e);
        resolve(false);
      }
      global.setTimeout(function () {
        _restartIceInFlight = false;
      }, 2000);
    });
  }
  function debounce(fn, ms) {
    return function () {
      var args = arguments;
      if (_reconnectTimer) global.clearTimeout(_reconnectTimer);
      _reconnectTimer = global.setTimeout(function () {
        _reconnectTimer = null;
        fn.apply(null, args);
      }, ms);
    };
  }
  /**
   * connectionState disconnected/failed → restartIce (sin cerrar PC ni regenerar SDP completo primero).
   */
  function attachConnectionStateAutoReconnect(pc, hooks) {
    hooks = hooks || {};
    var debounced = debounce(function () {
      if (!pc || pc.connectionState === 'connected' || pc.connectionState === 'closed') return;
      if (typeof hooks.onBeforeRestartIce === 'function') hooks.onBeforeRestartIce();
      restartIceSafe(pc).then(function (ok) {
        if (typeof hooks.onAfterRestartIce === 'function') hooks.onAfterRestartIce(ok);
        saveSessionSnapshot(pc, hooks.metaRef).catch(function () {});
      });
    }, hooks.debounceMs != null ? hooks.debounceMs : 600);
    pc.addEventListener('connectionstatechange', function () {
      var s = pc.connectionState;
      if (typeof hooks.onConnectionState === 'function') hooks.onConnectionState(s);
      if (s === 'disconnected' || s === 'failed') {
        debounced();
      }
    });
    pc.addEventListener('iceconnectionstatechange', function () {
      if (typeof hooks.onIceConnectionState === 'function') hooks.onIceConnectionState(pc.iceConnectionState);
    });
  }
  global.CrozzoPersistentWebRTC = {
    buildRtcConfiguration: buildRtcConfiguration,
    saveSessionSnapshot: saveSessionSnapshot,
    loadSavedSession: loadSavedSession,
    tryRestorePeerConnection: tryRestorePeerConnection,
    attachIcePersistence: attachIcePersistence,
    rememberRemoteIceCandidate: rememberRemoteIceCandidate,
    attachConnectionStateAutoReconnect: attachConnectionStateAutoReconnect,
    restartIceSafe: restartIceSafe,
    SESSION_KEY: SESSION_KEY
  };
})(typeof window !== 'undefined' ? window : this);
/* ========== MeshHeartbeat.js ========== */
/**
 * Crozzo MeshHeartbeat — ping/pong DataChannel, visibilidad, Wake Lock, tick SW.
 */
(function (global) {
  'use strict';
  var PING = 'MESH_PING';
  var PONG = 'MESH_PONG';
  var _interval = null;
  var _bgInterval = null;
  var _miss = 0;
  var _paused = false;
  var _lastPong = 0;
  var _seq = 0;
  var _api = null;
  var _wakeLock = null;
  function getDc() {
    return _api && typeof _api.getDc === 'function' ? _api.getDc() : null;
  }
  function sendRaw(obj) {
    var dc = getDc();
    if (!dc || dc.readyState !== 'open') return false;
    try {
      dc.send(JSON.stringify(obj));
      return true;
    } catch (e) {
      return false;
    }
  }
  function ping() {
    if (_paused) return;
    var now = Date.now();
    if (_lastPong && now - _lastPong > 9000) {
      _miss += 1;
      if (_api && typeof _api.onMissedPongs === 'function') _api.onMissedPongs(_miss);
      if (_miss >= 3 && _api && typeof _api.onUnstable === 'function') {
        _api.onUnstable();
        _miss = 0;
      }
    }
    _seq += 1;
    sendRaw({ type: PING, seq: _seq, ts: now });
  }
  function handleIncoming(ev) {
    var msg;
    try {
      msg = JSON.parse(ev.data);
    } catch (e) {
      return false;
    }
    if (msg.type === PING) {
      sendRaw({ type: PONG, seq: msg.seq, ts: Date.now() });
      return true;
    }
    if (msg.type === PONG) {
      _lastPong = Date.now();
      _miss = 0;
      if (_api && typeof _api.onPong === 'function') _api.onPong(msg);
      return true;
    }
    return false;
  }
  function quickHandshake() {
    _miss = 0;
    ping();
  }
  function start() {
    stop();
    _lastPong = Date.now();
    _interval = global.setInterval(ping, 3000);
  }
  function stop() {
    if (_interval) {
      global.clearInterval(_interval);
      _interval = null;
    }
    releaseWakeLock();
  }
  function stopAllIncludingSw() {
    stop();
    if (_bgInterval) {
      global.clearInterval(_bgInterval);
      _bgInterval = null;
    }
  }
  function pause() {
    _paused = true;
  }
  function resume() {
    _paused = false;
    quickHandshake();
  }
  function releaseWakeLock() {
    if (_wakeLock && typeof _wakeLock.release === 'function') {
      _wakeLock.release().catch(function () {});
    }
    _wakeLock = null;
  }
  function requestWakeLockIfNeeded() {
    var nav = global.navigator;
    if (!nav || !nav.wakeLock || typeof nav.wakeLock.request !== 'function') return;
    if (global.document.hidden) return;
    if (_wakeLock) return;
    nav.wakeLock
      .request('screen')
      .then(function (wl) {
        _wakeLock = wl;
        wl.addEventListener('release', function () {
          _wakeLock = null;
        });
      })
      .catch(function () {});
  }
  function attachVisibility(api) {
    _api = api;
    global.document.addEventListener('visibilitychange', function () {
      if (global.document.hidden) {
        pause();
        releaseWakeLock();
        if (_api && typeof _api.onHidden === 'function') _api.onHidden();
      } else {
        resume();
        requestWakeLockIfNeeded();
        if (_api && typeof _api.onVisible === 'function') _api.onVisible();
      }
    });
    if (typeof global.document.addEventListener === 'function') {
      try {
        global.document.addEventListener('freeze', function () {
          pause();
          if (_api && typeof _api.onFreeze === 'function') _api.onFreeze();
        });
        global.document.addEventListener('resume', function () {
          resume();
          if (_api && typeof _api.onResume === 'function') _api.onResume();
        });
      } catch (e) { /* ignore */ }
    }
  }
  function registerServiceWorkerKeepalive(scriptUrl, onTick) {
    /* Service Worker deshabilitado (Tauri / sin crozzo-mesh-sw.js) */
    return;
  }
  global.CrozzoMeshHeartbeat = {
    PING: PING,
    PONG: PONG,
    start: start,
    stop: stop,
    stopAllIncludingSw: stopAllIncludingSw,
    pause: pause,
    resume: resume,
    quickHandshake: quickHandshake,
    handleIncoming: handleIncoming,
    attachVisibility: attachVisibility,
    requestWakeLockIfNeeded: requestWakeLockIfNeeded,
    releaseWakeLock: releaseWakeLock,
    registerServiceWorkerKeepalive: registerServiceWorkerKeepalive
  };
})(typeof window !== 'undefined' ? window : this);
/* ========== AutoDiscovery.js ========== */
/**
 * Crozzo AutoDiscovery — peers conocidos (TTL 24h), mesh-ping HTTP (/mesh-ping + /mesh-ping.json), BLE stub.
 */
(function (global) {
  'use strict';
  var DB_NAME = 'CrozzoAutoDiscoveryDB';
  var DB_VER = 1;
  var STORE = 'known_peers';
  var TTL_MS = 24 * 60 * 60 * 1000;
  var _db = null;
  function log(m) {
    try {
      console.info('[AutoDiscovery]', m);
    } catch (e) { /* ignore */ }
  }
  function openDb() {
    return new Promise(function (resolve, reject) {
      if (_db) return resolve(_db);
      var req = global.indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          var st = db.createObjectStore(STORE, { keyPath: 'device_id' });
          st.createIndex('by_expires', 'expiresAt', { unique: false });
        }
      };
      req.onsuccess = function () {
        _db = req.result;
        resolve(_db);
      };
      req.onerror = function () {
        reject(req.error);
      };
    });
  }
  function rememberPeer(rec) {
    if (!rec || !rec.device_id) return Promise.resolve();
    var now = Date.now();
    var row = {
      device_id: String(rec.device_id),
      location_id: rec.location_id || '',
      mesh_role: rec.mesh_role || '',
      mesh_ping_url: rec.mesh_ping_url || '',
      lastSeen: now,
      expiresAt: now + TTL_MS,
      meta: rec.meta || {}
    };
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(row);
        tx.oncomplete = function () {
          resolve();
        };
        tx.onerror = function () {
          reject(tx.error);
        };
      });
    });
  }
  function getActivePeers() {
    var now = Date.now();
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var rq = tx.objectStore(STORE).getAll();
        rq.onsuccess = function () {
          var rows = (rq.result || []).filter(function (r) {
            return r && r.expiresAt > now;
          });
          resolve(rows);
        };
        rq.onerror = function () {
          reject(rq.error);
        };
      });
    });
  }
  function pruneExpired() {
    var now = Date.now();
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        var st = tx.objectStore(STORE);
        var rq = st.openCursor();
        rq.onsuccess = function () {
          var cur = rq.result;
          if (cur) {
            if (cur.value.expiresAt < now) cur.delete();
            cur.continue();
          }
        };
        tx.oncomplete = function () {
          resolve();
        };
        tx.onerror = function () {
          reject(tx.error);
        };
      });
    });
  }
  /** Expande a /mesh-ping y /mesh-ping.json sobre el mismo origen (host:puerto). */
  function expandMeshPingUrls(urls) {
    var seen = {};
    var out = [];
    function add(u) {
      if (!u || typeof u !== 'string') return;
      u = u.trim();
      if (seen[u]) return;
      seen[u] = true;
      out.push(u);
    }
    (urls || []).forEach(function (u) {
      if (!u) return;
      add(u);
      try {
        var parsed = new URL(u, global.location && global.location.href ? global.location.href : undefined);
        add(parsed.origin + '/mesh-ping');
        add(parsed.origin + '/mesh-ping.json');
      } catch (e1) {
        var m = String(u).match(/^(https?:\/\/[^/?#]+)(?::(\d+))?/i);
        if (m) {
          var base = m[1] + (m[2] ? ':' + m[2] : '');
          add(base + '/mesh-ping');
          add(base + '/mesh-ping.json');
        }
      }
    });
    return out;
  }
  function parseMeshPingJson(text) {
    try {
      var o = JSON.parse(text);
      if (o && o.status === 'ok' && (o.device_id || o.location_id)) return o;
    } catch (e) { /* ignore */ }
    return null;
  }
  function readResponseBody(res) {
    return res.text().then(function (txt) {
      var body = parseMeshPingJson(txt);
      return { body: body, raw: txt };
    });
  }
  function tryNoCorsThenImg(url) {
    return global
      .fetch(url, { method: 'GET', cache: 'no-store', mode: 'no-cors', credentials: 'omit' })
      .then(function (res) {
        if (res.type === 'opaque') {
          return { ok: true, url: url, body: null, transport: 'no-cors-opaque' };
        }
        return pingMeshViaImage(url);
      })
      .catch(function () {
        return pingMeshViaImage(url);
      });
  }
  function fetchMeshPingOne(url) {
    if (!url) return Promise.resolve({ ok: false, reason: 'no_url' });
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var t = ctrl
      ? global.setTimeout(function () {
          try {
            ctrl.abort();
          } catch (e) { /* ignore */ }
        }, 1000)
      : null;
    function clearT() {
      if (t) global.clearTimeout(t);
    }
    return global
      .fetch(url, {
        method: 'GET',
        cache: 'no-store',
        signal: ctrl ? ctrl.signal : undefined,
        mode: 'cors',
        credentials: 'omit'
      })
      .then(function (res) {
        clearT();
        if (!res.ok) return tryNoCorsThenImg(url);
        return readResponseBody(res).then(function (parsed) {
          if (parsed.body) {
            return { ok: true, url: url, status: res.status, body: parsed.body, transport: 'cors+json' };
          }
          return { ok: true, url: url, status: res.status, body: null, transport: 'cors' };
        });
      })
      .catch(function () {
        clearT();
        return tryNoCorsThenImg(url);
      });
  }
  function pingMeshViaImage(url) {
    return new Promise(function (resolve) {
      try {
        var img = new global.Image();
        var done = function (hit) {
          resolve({ ok: !!hit, url: url, body: null, transport: 'img' });
        };
        var timer = global.setTimeout(function () {
          done(false);
        }, 1000);
        img.onload = function () {
          global.clearTimeout(timer);
          done(true);
        };
        img.onerror = function () {
          global.clearTimeout(timer);
          done(false);
        };
        img.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + '_mp=' + Date.now();
      } catch (e) {
        resolve({ ok: false, url: url, transport: 'img-fail' });
      }
    });
  }
  function tryHttpMeshPing(urls) {
    var list = expandMeshPingUrls(urls || []).filter(Boolean);
    if (!list.length) return Promise.resolve({ ok: false, reason: 'empty' });
    var i = 0;
    function next() {
      if (i >= list.length) return Promise.resolve({ ok: false, reason: 'all_failed' });
      var u = list[i++];
      return fetchMeshPingOne(u).then(function (r) {
        if (r && r.ok) return r;
        return next();
      });
    }
    return next();
  }
  function maybeBleAdvertiseHint(meta) {
    return new Promise(function (resolve) {
      try {
        if (!meta || !global.navigator.bluetooth) return resolve({ supported: false });
        resolve({ supported: false, note: 'BLE mesh broadcast no disponible en este navegador' });
      } catch (e) {
        resolve({ supported: false });
      }
    });
  }
  global.CrozzoAutoDiscovery = {
    rememberPeer: rememberPeer,
    getActivePeers: getActivePeers,
    pruneExpired: pruneExpired,
    tryHttpMeshPing: tryHttpMeshPing,
    expandMeshPingUrls: expandMeshPingUrls,
    maybeBleAdvertiseHint: maybeBleAdvertiseHint,
    TTL_MS: TTL_MS
  };
})(typeof window !== 'undefined' ? window : this);
/* ========== EmergencyMesh.js ========== */
/**
 * Crozzo EmergencyMesh — P2P WebRTC (QR) + outbox deduplicado + reconciliación idempotente.
 */
(function (global) {
  'use strict';
  var DC_LABEL = 'crozzo_emergency_sync';
  var PROTO = 1;
  var DB_NAME = 'CrozzoEmergencyMeshDB';
  var DB_VER = 2;
  var STORE = 'outbox';
  var PRINT_STORE = 'printed_orders';
  var STATUS = {
    PENDING: 'PENDING',
    SENT_P2P: 'SENT_P2P',
    ACK_RECEIVED: 'ACK_RECEIVED',
    RECONCILED: 'RECONCILED',
    PENDING_CLOUD: 'PENDING_CLOUD'
  };
  var _db = null;
  var _checkTimer = null;
  var _cacheTimer = null;
  var _ackTimers = {};
  var _inited = false;
  var _reconcileRunning = false;
  var _iceMetaRef = { iceLocal: [], iceRemote: [] };
  var _hbStarted = false;
  var _discoveryInterval = null;
  var _autoQrInterval = null;
  var _isolatedAt = 0;
  var _lastRemotePack = null;
  var _meshLogLines = [];
  var state = {
    isolated: false,
    cableHint: false,
    preferCable: false,
    pc: null,
    dc: null,
    role: null,
    lastCheck: null,
    peers: [],
    linkUi: 'stable',
    autoQrRenew: false
  };
  function log(m) {
    try {
      console.info('[EmergencyMesh]', m);
    } catch (e) { /* ignore */ }
  }
  function getMd() {
    return typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
  }
  function getLocId() {
    var md = getMd();
    if (md.locationId) return String(md.locationId);
    try {
      var L = global.readCrozzoLanJson && global.readCrozzoLanJson();
      return (L && L.locationId) || '';
    } catch (e) {
      return '';
    }
  }
  function getDevId() {
    return typeof global.ensureCrozzoDeviceId === 'function' ? global.ensureCrozzoDeviceId() : 'nodevice';
  }
  function getMeshRole() {
    var md = getMd();
    return md.role === 'B' ? 'B' : 'A';
  }
  function getMeshHintPingUrl() {
    var md = getMd();
    var port = Number(md.port) || 3000;
    if (md.role === 'B' && md.centralIp) return 'http://' + String(md.centralIp).trim() + ':' + port + '/mesh-ping';
    if (md.role === 'A' && md.serverIp) return 'http://' + String(md.serverIp).trim() + ':' + port + '/mesh-ping';
    return '';
  }
  function meshLog(line) {
    var t = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    _meshLogLines.unshift(t + ' ' + line);
    _meshLogLines = _meshLogLines.slice(0, 24);
    var el = global.document.getElementById('crozzoMeshAttemptLog');
    if (el) el.textContent = _meshLogLines.join('\n');
  }
  function updateLinkBadge() {
    var el = global.document.getElementById('crozzoMeshLinkBadge');
    if (!el) return;
    el.className = 'crozzo-mesh-link-badge ' + (state.linkUi || 'stable');
    if (state.linkUi === 'stable') el.textContent = '🟢 Enlace estable';
    else if (state.linkUi === 'unstable') el.textContent = '🟡 Enlace inestable';
    else if (state.linkUi === 'reconnecting') el.textContent = '🔴 Reconectando…';
    else el.textContent = '⚪ Sin enlace P2P';
  }
  function newPeerConnection() {
    var cfg =
      global.CrozzoPersistentWebRTC && typeof global.CrozzoPersistentWebRTC.buildRtcConfiguration === 'function'
        ? global.CrozzoPersistentWebRTC.buildRtcConfiguration()
        : { iceServers: [], bundlePolicy: 'max-bundle', iceTransportPolicy: 'all' };
    var pc = new global.RTCPeerConnection(cfg);
    _iceMetaRef = { iceLocal: [], iceRemote: [] };
    if (global.CrozzoPersistentWebRTC && typeof global.CrozzoPersistentWebRTC.attachIcePersistence === 'function') {
      _iceMetaRef = global.CrozzoPersistentWebRTC.attachIcePersistence(pc, _iceMetaRef);
    }
    if (global.CrozzoPersistentWebRTC && typeof global.CrozzoPersistentWebRTC.attachConnectionStateAutoReconnect === 'function') {
      global.CrozzoPersistentWebRTC.attachConnectionStateAutoReconnect(pc, {
        metaRef: _iceMetaRef,
        debounceMs: 600,
        onConnectionState: function (s) {
          if (s === 'connected') {
            state.linkUi = 'stable';
            meshLog('connectionState: connected');
          } else if (s === 'connecting' || s === 'checking') {
            state.linkUi = 'unstable';
            meshLog('connectionState: ' + s);
          } else if (s === 'disconnected' || s === 'failed') {
            state.linkUi = 'reconnecting';
            meshLog('connectionState: ' + s + ' → restartIce');
          } else {
            meshLog('connectionState: ' + s);
          }
          updateLinkBadge();
          updateShell();
        },
        onAfterRestartIce: function () {
          meshLog('restartIce completado');
          updateLinkBadge();
        }
      });
    }
    pc.addEventListener('icegatheringstatechange', function () {
      if (pc.iceGatheringState === 'complete' && global.CrozzoPersistentWebRTC && typeof global.CrozzoPersistentWebRTC.saveSessionSnapshot === 'function') {
        global.CrozzoPersistentWebRTC.saveSessionSnapshot(pc, _iceMetaRef).catch(function () {});
      }
    });
    return pc;
  }
  function initMeshHeartbeatOnce() {
    if (_hbStarted || !global.CrozzoMeshHeartbeat) return;
    _hbStarted = true;
    global.CrozzoMeshHeartbeat.attachVisibility({
      getDc: function () {
        return state.dc;
      },
      onHidden: function () {
        meshLog('Pestaña en segundo plano — latido reducido');
      },
      onVisible: function () {
        global.CrozzoMeshHeartbeat.quickHandshake();
        meshLog('Pestaña visible — quickHandshake');
        if (global.CrozzoMeshHeartbeat.requestWakeLockIfNeeded) global.CrozzoMeshHeartbeat.requestWakeLockIfNeeded();
      },
      onFreeze: function () {
        meshLog('Documento freeze — pausa');
      },
      onResume: function () {
        global.CrozzoMeshHeartbeat.quickHandshake();
      },
      onUnstable: function () {
        state.linkUi = 'reconnecting';
        updateLinkBadge();
        if (global.CrozzoPersistentWebRTC && typeof global.CrozzoPersistentWebRTC.restartIceSafe === 'function') {
          global.CrozzoPersistentWebRTC.restartIceSafe(state.pc).catch(function () {});
        }
        meshLog('3× sin pong — restartIce');
      },
      onMissedPongs: function (n) {
        meshLog('Pong perdidos acumulados: ' + n);
      },
      onPong: function () {
        state.linkUi = 'stable';
        updateLinkBadge();
      }
    });
    /* registerServiceWorkerKeepalive deshabilitado — sin SW en Tauri */
  }
  function tryDiscoveryPing() {
    if (!state.isolated || !global.CrozzoAutoDiscovery) return;
    global.CrozzoAutoDiscovery.pruneExpired().catch(function () {});
    global.CrozzoAutoDiscovery.getActivePeers().then(function (peers) {
      var urls = [];
      (peers || []).forEach(function (p) {
        if (p.mesh_ping_url) urls.push(p.mesh_ping_url);
      });
      var hint = getMeshHintPingUrl();
      if (hint) urls.push(hint);
      if (!urls.length) return;
      return global.CrozzoAutoDiscovery.tryHttpMeshPing(urls).then(function (r) {
        if (r && r.ok) meshLog('mesh-ping alcanzable: ' + (r.url || r.status || '') + (r.transport ? ' [' + r.transport + ']' : ''));
        if (r && r.ok && r.body && typeof global.CrozzoAutoDiscovery.rememberPeer === 'function') {
          global.CrozzoAutoDiscovery
            .rememberPeer({
              device_id: r.body.device_id || 'mesh-ping-host',
              location_id: r.body.location_id || '',
              mesh_role: '',
              mesh_ping_url: r.url || '',
              meta: { source: 'mesh-ping', timestamp: r.body.timestamp }
            })
            .catch(function () {});
        }
      });
    }).catch(function () {});
  }
  function resolveTransactionId(comanda) {
    if (!comanda) return '';
    if (comanda.transaction_id) return String(comanda.transaction_id);
    if (comanda.id != null) return 'legacy-comanda:' + String(comanda.id);
    return '';
  }
  function appendHist(arr, ev) {
    var a = Array.isArray(arr) ? arr.slice() : [];
    if (a[a.length - 1] !== ev) a.push(ev);
    return a;
  }
  function guessUsbTethering() {
    var c = global.navigator && (global.navigator.connection || global.navigator.mozConnection || global.navigator.webkitConnection);
    if (!c) return false;
    if (c.type === 'ethernet') return true;
    if (String(c.effectiveType || '').indexOf('4g') >= 0 && /Linux.*Android/i.test(global.navigator.userAgent || '')) return false;
    return false;
  }
  function setCableBadge() {
    var el = global.document.getElementById('crozzoEmergencyCableBadge');
    if (!el) return;
    var show = state.preferCable || state.cableHint;
    el.style.display = show ? 'inline-flex' : 'none';
    el.textContent = '🔌 Sync por Cable';
  }
  function waitIceComplete(pc) {
    return new Promise(function (resolve) {
      if (pc.iceGatheringState === 'complete') return resolve();
      var t = global.setTimeout(function () {
        resolve();
      }, 4500);
      pc.addEventListener(
        'icegatheringstatechange',
        function () {
          if (pc.iceGatheringState === 'complete') {
            global.clearTimeout(t);
            resolve();
          }
        },
        { once: true }
      );
    });
  }
  function packSdp(role, sdp, type) {
    return {
      v: PROTO,
      kind: role,
      type: type,
      sdp: sdp,
      device_id: getDevId(),
      location_id: getLocId(),
      mesh_role: getMeshRole(),
      mesh_hint_ping: getMeshHintPingUrl(),
      ts: Date.now()
    };
  }
  function openDb() {
    return new Promise(function (resolve, reject) {
      if (_db) return resolve(_db);
      var req = global.indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = function (e) {
        var db = req.result;
        var old = e.oldVersion;
        if (old < 2) {
          if (db.objectStoreNames.contains(STORE)) db.deleteObjectStore(STORE);
          if (db.objectStoreNames.contains(PRINT_STORE)) db.deleteObjectStore(PRINT_STORE);
        }
        if (!db.objectStoreNames.contains(STORE)) {
          var ob = db.createObjectStore(STORE, { keyPath: 'transaction_id' });
          ob.createIndex('by_comanda_id', 'comanda_id', { unique: false });
        }
        if (!db.objectStoreNames.contains(PRINT_STORE)) {
          db.createObjectStore(PRINT_STORE, { keyPath: 'transaction_id' });
        }
      };
      req.onsuccess = function () {
        _db = req.result;
        _db.onversionchange = function () {
          try {
            _db.close();
          } catch (e) { /* ignore */ }
          _db = null;
        };
        resolve(_db);
      };
      req.onerror = function () {
        reject(req.error);
      };
    });
  }
  function idbPut(rec) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(rec);
        tx.oncomplete = function () {
          resolve();
        };
        tx.onerror = function () {
          reject(tx.error);
        };
      });
    });
  }
  function idbGet(tid) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var rq = tx.objectStore(STORE).get(tid);
        rq.onsuccess = function () {
          resolve(rq.result || null);
        };
        rq.onerror = function () {
          reject(rq.error);
        };
      });
    });
  }
  function idbGetByComandaId(cid) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var st = tx.objectStore(STORE);
        if (!st.indexNames.contains('by_comanda_id')) {
          resolve(null);
          return;
        }
        var rq = st.index('by_comanda_id').getAll(Number(cid));
        rq.onsuccess = function () {
          var arr = rq.result || [];
          resolve(arr[0] || null);
        };
        rq.onerror = function () {
          reject(rq.error);
        };
      });
    });
  }
  function idbGetAll() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var rq = tx.objectStore(STORE).getAll();
        rq.onsuccess = function () {
          resolve(rq.result || []);
        };
        rq.onerror = function () {
          reject(rq.error);
        };
      });
    });
  }
  function idbPrintedHas(tid) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(PRINT_STORE, 'readonly');
        var rq = tx.objectStore(PRINT_STORE).get(tid);
        rq.onsuccess = function () {
          resolve(!!rq.result);
        };
        rq.onerror = function () {
          reject(rq.error);
        };
      });
    });
  }
  function idbPrintedAdd(tid, comanda_id) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(PRINT_STORE, 'readwrite');
        var rq = tx.objectStore(PRINT_STORE).add({
          transaction_id: tid,
          comanda_id: comanda_id,
          at: Date.now()
        });
        rq.onsuccess = function () {
          resolve(true);
        };
        rq.onerror = function () {
          if (rq.error && rq.error.name === 'ConstraintError') resolve(false);
          else reject(rq.error);
        };
      });
    });
  }
  function mirrorStatusCaches(row) {
    if (!row || !row.transaction_id) return;
    global.__crozzoEmergencyStatusCache = global.__crozzoEmergencyStatusCache || {};
    global.__crozzoEmergencyStatusByComandaId = global.__crozzoEmergencyStatusByComandaId || {};
    global.__crozzoEmergencyStatusCache[row.transaction_id] = row.status;
    if (row.comanda_id != null) global.__crozzoEmergencyStatusByComandaId[row.comanda_id] = row.status;
  }
  function refreshOutboxCache() {
    return idbGetAll()
      .then(function (rows) {
        global.__crozzoEmergencyStatusCache = global.__crozzoEmergencyStatusCache || {};
        global.__crozzoEmergencyStatusByComandaId = global.__crozzoEmergencyStatusByComandaId || {};
        rows.forEach(function (r) {
          if (r && r.transaction_id) mirrorStatusCaches(r);
        });
      })
      .catch(function () {});
  }
  function getLocalStatusForComanda(c) {
    if (!c) return null;
    var tid = resolveTransactionId(c);
    var byTid = global.__crozzoEmergencyStatusCache && global.__crozzoEmergencyStatusCache[tid];
    if (byTid) return byTid;
    if (c.id != null && global.__crozzoEmergencyStatusByComandaId) {
      return global.__crozzoEmergencyStatusByComandaId[c.id] || null;
    }
    return null;
  }
  function refreshForceButtonsGlobal() {
    var dis = shouldDisableForceSend();
    ['crozzoEmergencyForceCaja', 'crozzoEmergencyForceCocina'].forEach(function (id) {
      var el = global.document.getElementById(id);
      if (el) {
        el.disabled = !!dis;
        el.setAttribute('aria-disabled', dis ? 'true' : 'false');
        el.title = dis ? 'Cocina ya confirmó (ACK) o nube reconcilió — no hace falta forzar.' : '';
      }
    });
  }
  function shouldDisableForceSend() {
    var ids = typeof global.__crozzoEmergencyGetLastComandaIds === 'function' ? global.__crozzoEmergencyGetLastComandaIds() : [];
    if (!ids || !ids.length) return true;
    var map = global.__crozzoEmergencyStatusByComandaId || {};
    for (var i = 0; i < ids.length; i++) {
      var st = map[ids[i]];
      if (st !== STATUS.ACK_RECEIVED && st !== STATUS.RECONCILED) return false;
    }
    return true;
  }
  function ensureStandaloneDeviceId() {
    return typeof global.ensureStandaloneDeviceId === 'function' ? global.ensureStandaloneDeviceId() : getDevId();
  }
  /** Insert directo a sync_queue (misma forma que syncOfflineQueue). Idempotente por transaction_id. */
  function pushEmergencyRowToSupabase(row) {
    var sb = global.window && global.window.__SUPABASE;
    if (!sb || !global.navigator || !global.navigator.onLine) return Promise.resolve(false);
    var tid =
      (row && row.transaction_id) ||
      (row && row.payload && row.payload.transaction_id) ||
      (typeof global.__crozzoNewOfflineSyncTransactionId === 'function' && global.__crozzoNewOfflineSyncTransactionId()) ||
      String(Date.now());
    var insertBody = {
      type: 'emergency_comanda',
      payload: row.payload,
      status: 'pending',
      device_id: ensureStandaloneDeviceId(),
      transaction_id: tid
    };
    return sb
      .from('sync_queue')
      .insert(insertBody)
      .then(function (res) {
        if (!res.error) return true;
        if (typeof global.__crozzoIsSyncQueueUniqueViolation === 'function' && global.__crozzoIsSyncQueueUniqueViolation(res.error)) {
          return true;
        }
        if (insertBody.transaction_id) {
          return sb.from('sync_queue').upsert(insertBody, { onConflict: 'transaction_id', ignoreDuplicates: true }).then(function (res2) {
            if (!res2.error) return true;
            if (typeof global.__crozzoIsSyncQueueUniqueViolation === 'function' && global.__crozzoIsSyncQueueUniqueViolation(res2.error)) {
              return true;
            }
            throw res2.error;
          });
        }
        throw res.error;
      })
      .catch(function (e) {
        log('pushEmergencyRowToSupabase ' + e);
        return false;
      });
  }
  function closePc() {
    if (global.CrozzoMeshHeartbeat) {
      try {
        global.CrozzoMeshHeartbeat.stop();
      } catch (e0) { /* ignore */ }
    }
    if (_autoQrInterval) {
      global.clearInterval(_autoQrInterval);
      _autoQrInterval = null;
    }
    try {
      if (state.dc) state.dc.close();
    } catch (e) { /* ignore */ }
    try {
      if (state.pc) state.pc.close();
    } catch (e2) { /* ignore */ }
    state.dc = null;
    state.pc = null;
    state.role = null;
    state.peers = [];
    state.linkUi = 'stable';
    updateLinkBadge();
  }
  function sendOrderAck(dc, pay, tid) {
    try {
      dc.send(
        JSON.stringify({
          type: 'ORDER_ACK',
          comanda_id: pay.id,
          transaction_id: tid,
          status: 'PRINTING',
          ts: Date.now()
        })
      );
    } catch (e) { /* ignore */ }
  }
  function processKitchenNewOrder(dc, msg) {
    var pay = msg.payload;
    if (!pay) return Promise.resolve();
    var tid = resolveTransactionId(pay);
    if (!tid) tid = pay.id != null ? 'legacy-comanda:' + String(pay.id) : '';
    if (!tid) return Promise.resolve();
    return idbPrintedHas(tid)
      .then(function (already) {
        if (already) {
          sendOrderAck(dc, pay, tid);
          return;
        }
        try {
          if (typeof global.__crozzoEmergencyApplyComandaSnapshot === 'function') {
            global.__crozzoEmergencyApplyComandaSnapshot(pay);
          }
        } catch (e1) {
          log('apply snapshot ' + e1);
          return;
        }
        return idbPrintedAdd(tid, pay.id).then(function () {
          sendOrderAck(dc, pay, tid);
        });
      })
      .catch(function (e2) {
        log('kitchen NEW_ORDER ' + e2);
      });
  }
  function wireDataChannel(dc) {
    state.dc = dc;
    dc.onopen = function () {
      state.peers = [{ id: 'peer', label: DC_LABEL, at: Date.now() }];
      state.linkUi = 'stable';
      updateLinkBadge();
      initMeshHeartbeatOnce();
      if (global.CrozzoMeshHeartbeat) {
        try {
          global.CrozzoMeshHeartbeat.start();
          global.CrozzoMeshHeartbeat.quickHandshake();
        } catch (eH) { /* ignore */ }
      }
      if (global.CrozzoMeshHeartbeat && global.CrozzoMeshHeartbeat.requestWakeLockIfNeeded) {
        global.CrozzoMeshHeartbeat.requestWakeLockIfNeeded();
      }
      updateShell();
      refreshOutboxCache().finally(function () {
        refreshForceButtonsGlobal();
      });
      if (global.CrozzoPersistentWebRTC && state.pc && typeof global.CrozzoPersistentWebRTC.saveSessionSnapshot === 'function') {
        global.CrozzoPersistentWebRTC.saveSessionSnapshot(state.pc, _iceMetaRef).catch(function () {});
      }
      if (global.showToast) global.showToast('📡 Canal P2P de emergencia listo.', 'success');
      meshLog('DataChannel abierto');
    };
    dc.onclose = function () {
      state.peers = [];
      if (global.CrozzoMeshHeartbeat) {
        try {
          global.CrozzoMeshHeartbeat.stop();
        } catch (eS) { /* ignore */ }
      }
      state.linkUi = 'stable';
      updateLinkBadge();
      updateShell();
      refreshForceButtonsGlobal();
      meshLog('DataChannel cerrado');
    };
    dc.onmessage = function (ev) {
      if (global.CrozzoMeshHeartbeat && global.CrozzoMeshHeartbeat.handleIncoming(ev)) return;
      var msg;
      try {
        msg = JSON.parse(ev.data);
      } catch (e) {
        return;
      }
      if (msg.type === 'NEW_ORDER' && msg.payload) {
        processKitchenNewOrder(dc, msg);
      }
      if (msg.type === 'ORDER_ACK') {
        onOrderAckFromPeer(msg);
        var tidAck = msg.transaction_id;
        if (!tidAck && msg.comanda_id != null) {
          idbGetByComandaId(msg.comanda_id).then(function (row) {
            if (row && row.transaction_id && _ackTimers[row.transaction_id]) {
              global.clearTimeout(_ackTimers[row.transaction_id]);
              delete _ackTimers[row.transaction_id];
            }
          });
        } else if (tidAck && _ackTimers[tidAck]) {
          global.clearTimeout(_ackTimers[tidAck]);
          delete _ackTimers[tidAck];
        }
      }
    };
  }
  function onOrderAckFromPeer(msg) {
    var tid = msg.transaction_id;
    var p = Promise.resolve(tid);
    if (!tid && msg.comanda_id != null) {
      p = idbGetByComandaId(msg.comanda_id).then(function (row) {
        return row && row.transaction_id ? row.transaction_id : '';
      });
    }
    p.then(function (resolvedTid) {
      if (!resolvedTid) return null;
      return idbGet(resolvedTid);
    })
      .then(function (row) {
        if (!row || row.kind !== 'NEW_ORDER') return;
        if (row.status === STATUS.RECONCILED) return;
        row.status = STATUS.ACK_RECEIVED;
        row.status_history = appendHist(row.status_history, 'ack_received');
        row.updated_at = Date.now();
        return idbPut(row);
      })
      .then(function () {
        return refreshOutboxCache();
      })
      .then(function () {
        refreshForceButtonsGlobal();
        if (typeof global.__crozzoEmergencyOnOrderAck === 'function') global.__crozzoEmergencyOnOrderAck(msg);
      })
      .catch(function (e) {
        log('onOrderAckFromPeer ' + e);
      });
  }
  function armAckTimeout(tid, comandaIdForUi) {
    if (!tid) return;
    if (_ackTimers[tid]) global.clearTimeout(_ackTimers[tid]);
    _ackTimers[tid] = global.setTimeout(function () {
      idbGet(tid).then(function (row) {
        if (row && row.status === STATUS.ACK_RECEIVED) return;
        if (global.showToast) global.showToast('⚠️ Sin ACK de cocina en 5s. Use «Forzar envío P2P» si aplica.', 'warning');
      });
    }, 5000);
  }
  async function evaluateIsolation() {
    var online = global.navigator ? !!global.navigator.onLine : true;
    var tier = { tier: 'offline' };
    try {
      var fn = global.CrozzoSyncRouterModule && global.CrozzoSyncRouterModule.detectConnectivityTier;
      if (typeof fn === 'function') tier = await fn();
      else if (typeof global.detectConnectivityTier === 'function') tier = await global.detectConnectivityTier();
    } catch (e) {
      tier = { tier: 'offline' };
    }
    var cloudOk = tier && tier.tier === 'cloud';
    var md = getMd();
    var centralOk = false;
    if (md.role === 'B' && md.centralIp && typeof global.crozzoPingHealthQuick === 'function') {
      try {
        centralOk = await global.crozzoPingHealthQuick(md.centralIp, Number(md.port) || 3000);
      } catch (e2) {
        centralOk = false;
      }
    } else if (md.role === 'A' && md.serverIp && typeof global.crozzoPingHealthQuick === 'function') {
      try {
        centralOk = await global.crozzoPingHealthQuick(md.serverIp, Number(md.port) || 3000);
      } catch (e3) {
        centralOk = false;
      }
    } else if (md.role === 'A') {
      centralOk = true;
    }
    var isolated = !online || (!cloudOk && !centralOk);
    state.lastCheck = { online: online, tier: tier.tier, cloudOk: cloudOk, centralOk: centralOk, isolated: isolated };
    state.cableHint = guessUsbTethering();
    setCableBadge();
    return state.lastCheck;
  }
  function updateShell() {
    var sh = global.document.getElementById('crozzo-emergency-shell');
    if (!sh) return;
    var p2p = !!(state.dc && state.dc.readyState === 'open');
    sh.style.display = state.isolated || p2p ? 'block' : 'none';
    var forceBtn = global.document.getElementById('btnEmergencyOfferForce');
    if (forceBtn) {
      var showForce =
        state.isolated &&
        !p2p &&
        _isolatedAt &&
        Date.now() - _isolatedAt > 10000;
      forceBtn.style.display = showForce ? 'inline-block' : 'none';
    }
    updateLinkBadge();
    var list = global.document.getElementById('crozzoEmergencyPeerList');
    if (list) {
      list.innerHTML = state.peers.length
        ? state.peers.map(function (p) {
            return '<li>' + (p.label || 'peer') + ' · ' + new Date(p.at).toLocaleTimeString() + '</li>';
          }).join('')
        : '<li style="color:#94a3b8;">Sin par conectado</li>';
    }
    var st = global.document.getElementById('crozzoEmergencyStatusLine');
    if (st && state.lastCheck) {
      st.textContent =
        'Red: ' +
        (state.lastCheck.online ? 'online' : 'offline') +
        ' · Tier: ' +
        state.lastCheck.tier +
        ' · Cloud: ' +
        (state.lastCheck.cloudOk ? 'OK' : '—') +
        ' · Central LAN: ' +
        (state.lastCheck.centralOk ? 'OK' : '—');
    }
    refreshForceButtonsGlobal();
  }
  function showIsolationBanner(first) {
    updateShell();
    if (first && global.showToast) {
      global.showToast('🔴 Red central caída. Activando modo P2P de emergencia.', 'warning');
    }
  }
  function hideIsolationBanner() {
    updateShell();
  }
  async function isolationLoop() {
    var prev = state.isolated;
    var r = await evaluateIsolation();
    state.isolated = !!r.isolated;
    if (state.isolated && !prev) {
      _isolatedAt = Date.now();
      showIsolationBanner(true);
      meshLog('Aislamiento detectado — discovery + P2P');
      tryDiscoveryPing();
      if (global.CrozzoPersistentWebRTC && state.pc && typeof global.CrozzoPersistentWebRTC.restartIceSafe === 'function') {
        global.CrozzoPersistentWebRTC.restartIceSafe(state.pc).catch(function () {});
      }
    }
    if (!state.isolated && prev) {
      _isolatedAt = 0;
      hideIsolationBanner();
      try {
        await reconcileSafe();
      } catch (e) {
        log('reconcileSafe ' + e);
      }
    }
    if (state.isolated && !isLinkReady() && state.autoQrRenew && !_autoQrInterval) {
      _autoQrInterval = global.setInterval(function () {
        if (!state.isolated || isLinkReady()) return;
        meshLog('Auto-refresh QR (60s)');
        startOfferFlow().catch(function () {});
      }, 60000);
    }
    if (!state.isolated && _autoQrInterval) {
      global.clearInterval(_autoQrInterval);
      _autoQrInterval = null;
    }
    updateShell();
  }
  async function reconcileSafe() {
    if (_reconcileRunning) return;
    _reconcileRunning = true;
    try {
      await refreshOutboxCache();
      var rows = await idbGetAll().catch(function () {
        return [];
      });
      var sbOk = !!(global.window && global.window.__SUPABASE && global.navigator && global.navigator.onLine);
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        if (!row || row.kind !== 'NEW_ORDER' || !row.transaction_id) continue;
        if (row.status === STATUS.RECONCILED) continue;
        if (row.status === STATUS.ACK_RECEIVED) {
          var ok = await pushEmergencyRowToSupabase(row);
          if (ok) {
            row.status = STATUS.RECONCILED;
            row.status_history = appendHist(row.status_history, 'reconciled');
            row.updated_at = Date.now();
            await idbPut(row).catch(function () {});
          }
          continue;
        }
        if (row.status === STATUS.SENT_P2P || row.status === STATUS.PENDING || row.status === STATUS.PENDING_CLOUD) {
          if (isLinkReady() && row.payload) {
            await broadcastNewOrderInternal(row.payload, { force: true, skipReconcileHint: true });
          } else if (sbOk && row.payload) {
            row.status = STATUS.PENDING_CLOUD;
            row.status_history = appendHist(row.status_history, 'pending_cloud');
            row.updated_at = Date.now();
            await idbPut(row).catch(function () {});
            var ok2 = await pushEmergencyRowToSupabase(row);
            if (ok2) {
              row.status = STATUS.RECONCILED;
              row.status_history = appendHist(row.status_history, 'reconciled');
              row.updated_at = Date.now();
              await idbPut(row).catch(function () {});
            }
          }
        }
      }
      await refreshOutboxCache();
      if (typeof global.syncOfflineQueue === 'function') await global.syncOfflineQueue();
    } finally {
      _reconcileRunning = false;
    }
  }
  /** Compat: antes vaciaba outbox; ahora delega en reconcileSafe. */
  async function reconcile() {
    return reconcileSafe();
  }
  function attachShell() {
    if (global.document.getElementById('crozzo-emergency-shell')) return;
    var sh = global.document.createElement('div');
    sh.id = 'crozzo-emergency-shell';
    sh.className = 'crozzo-emergency-shell';
    sh.innerHTML =
      '<div class="crozzo-emergency-inner">' +
      '  <div class="crozzo-emergency-title">⚠️ MODO DESCENTRALIZADO · Supervivencia P2P</div>' +
      '  <div id="crozzoMeshLinkBadge" class="crozzo-mesh-link-badge stable">⚪ Sin enlace P2P</div>' +
      '  <div id="crozzoEmergencyStatusLine" class="crozzo-emergency-meta"></div>' +
      '  <span id="crozzoEmergencyCableBadge" class="crozzo-emergency-cable" style="display:none;">🔌 Sync por Cable</span>' +
      '  <label class="crozzo-emergency-toggle"><input type="checkbox" id="crozzoPreferCable"> Priorizar ruta cable (USB tethering)</label>' +
      '  <div><strong>Log intentos:</strong></div>' +
      '  <pre id="crozzoMeshAttemptLog" class="crozzo-mesh-log"></pre>' +
      '  <div><strong>Pares:</strong></div>' +
      '  <ul id="crozzoEmergencyPeerList" class="crozzo-emergency-peers"></ul>' +
      '  <div class="crozzo-emergency-actions">' +
      '    <button type="button" class="btn btn-outline" id="btnEmergencyOffer">📡 Generar QR de Emergencia (Caja)</button>' +
      '    <button type="button" class="btn btn-outline" id="btnEmergencyOfferForce" style="display:none;">📡 Forzar QR (manual)</button>' +
      '    <label class="crozzo-emergency-toggle" style="margin-left:4px;"><input type="checkbox" id="crozzoAutoQrRenew"> Auto-renovar QR cada 60s si sigo aislado</label>' +
      '    <button type="button" class="btn btn-outline" id="btnEmergencyScanOffer">📷 Escanear QR (Cocina)</button>' +
      '    <button type="button" class="btn btn-outline" id="btnEmergencyScanAnswer">📷 Escanear respuesta (Caja)</button>' +
      '  </div>' +
      '</div>';
    global.document.body.appendChild(sh);
    global.document.getElementById('crozzoPreferCable').addEventListener('change', function (e) {
      state.preferCable = !!e.target.checked;
      setCableBadge();
    });
    global.document.getElementById('btnEmergencyOffer').addEventListener('click', function () {
      startOfferFlow();
    });
    var forceQ = global.document.getElementById('btnEmergencyOfferForce');
    if (forceQ) {
      forceQ.addEventListener('click', function () {
        meshLog('Forzar QR (usuario)');
        startOfferFlow();
      });
    }
    var autoQr = global.document.getElementById('crozzoAutoQrRenew');
    if (autoQr) {
      autoQr.addEventListener('change', function (e) {
        state.autoQrRenew = !!e.target.checked;
        if (!state.autoQrRenew && _autoQrInterval) {
          global.clearInterval(_autoQrInterval);
          _autoQrInterval = null;
        }
        if (state.autoQrRenew && state.isolated && !isLinkReady() && !_autoQrInterval) {
          _autoQrInterval = global.setInterval(function () {
            if (!state.isolated || isLinkReady()) return;
            meshLog('Auto-refresh QR (60s)');
            startOfferFlow().catch(function () {});
          }, 60000);
        }
        meshLog('Auto-renovar QR: ' + (state.autoQrRenew ? 'sí' : 'no'));
      });
    }
    global.document.getElementById('btnEmergencyScanOffer').addEventListener('click', function () {
      startScanFlow('offer');
    });
    global.document.getElementById('btnEmergencyScanAnswer').addEventListener('click', function () {
      startScanFlow('answer');
    });
  }
  function showQrModal(title, textPayload) {
    if (typeof global.showModal !== 'function') {
      global.prompt('Copia el JSON / QR texto:', textPayload);
      return;
    }
    global.showModal(title, '<p class="form-hint">Escanea con el otro dispositivo o copia el JSON del área inferior.</p><div id="emergencyQrMount"></div>');
    global.setTimeout(function () {
      var mount = global.document.getElementById('emergencyQrMount');
      if (!mount) return;
      var ta = global.document.createElement('textarea');
      ta.className = 'form-input';
      ta.style.width = '100%';
      ta.style.minHeight = '88px';
      ta.style.fontSize = '11px';
      ta.readOnly = true;
      ta.value = textPayload;
      mount.appendChild(ta);
      var host = global.document.createElement('div');
      host.style.marginTop = '12px';
      host.style.display = 'flex';
      host.style.justifyContent = 'center';
      mount.appendChild(host);
      if (typeof global.QRCode === 'function') {
        try {
          new global.QRCode(host, { text: textPayload, width: 200, height: 200, correctLevel: global.QRCode.CorrectLevel.M });
        } catch (e) {
          host.textContent = 'No se pudo generar QR';
        }
      }
    }, 30);
  }
  async function startOfferFlow() {
    closePc();
    state.role = 'offerer';
    state.pc = newPeerConnection();
    var pc = state.pc;
    var dc = pc.createDataChannel(DC_LABEL, { ordered: true });
    wireDataChannel(dc);
    var offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitIceComplete(pc);
    var pack = packSdp('offer', pc.localDescription.sdp, pc.localDescription.type);
    if (global.CrozzoPersistentWebRTC && typeof global.CrozzoPersistentWebRTC.saveSessionSnapshot === 'function') {
      await global.CrozzoPersistentWebRTC.saveSessionSnapshot(pc, _iceMetaRef).catch(function () {});
    }
    showQrModal('QR de emergencia · Oferta WebRTC', JSON.stringify(pack));
  }
  async function applyRemoteOffer(pack) {
    closePc();
    state.role = 'answerer';
    state.pc = newPeerConnection();
    var pc = state.pc;
    pc.ondatachannel = function (ev) {
      if (ev.channel && ev.channel.label === DC_LABEL) wireDataChannel(ev.channel);
    };
    await pc.setRemoteDescription({ type: pack.type || 'offer', sdp: pack.sdp });
    var ans = await pc.createAnswer();
    await pc.setLocalDescription(ans);
    await waitIceComplete(pc);
    var out = packSdp('answer', pc.localDescription.sdp, pc.localDescription.type);
    if (global.CrozzoPersistentWebRTC && typeof global.CrozzoPersistentWebRTC.saveSessionSnapshot === 'function') {
      await global.CrozzoPersistentWebRTC.saveSessionSnapshot(pc, _iceMetaRef).catch(function () {});
    }
    if (global.CrozzoAutoDiscovery && pack) {
      global.CrozzoAutoDiscovery
        .rememberPeer({
          device_id: pack.device_id,
          location_id: pack.location_id,
          mesh_role: pack.mesh_role,
          mesh_ping_url: pack.mesh_hint_ping || ''
        })
        .catch(function () {});
    }
    showQrModal('QR de respuesta · Vuelve a Caja y escanéalo', JSON.stringify(out));
  }
  async function applyRemoteAnswer(pack) {
    if (!state.pc) return;
    await state.pc.setRemoteDescription({ type: pack.type || 'answer', sdp: pack.sdp });
    if (global.CrozzoPersistentWebRTC && typeof global.CrozzoPersistentWebRTC.saveSessionSnapshot === 'function') {
      await global.CrozzoPersistentWebRTC.saveSessionSnapshot(state.pc, _iceMetaRef).catch(function () {});
    }
    if (typeof global.closeModal === 'function') global.closeModal();
    if (global.showToast) global.showToast('✅ Enlace P2P completado.', 'success');
    meshLog('Respuesta remota aplicada');
    if (global.CrozzoAutoDiscovery && pack) {
      global.CrozzoAutoDiscovery
        .rememberPeer({
          device_id: pack.device_id,
          location_id: pack.location_id,
          mesh_role: pack.mesh_role,
          mesh_ping_url: pack.mesh_hint_ping || ''
        })
        .catch(function () {});
    }
  }
  function startScanFlow(mode) {
    if (!global.navigator.mediaDevices || !global.navigator.mediaDevices.getUserMedia) {
      var raw = global.prompt('Pega aquí el JSON del QR:');
      if (raw) handleScannedJson(raw, mode);
      return;
    }
    var video = global.document.createElement('video');
    video.playsInline = true;
    video.muted = true;
    video.style.width = '100%';
    video.style.maxHeight = '220px';
    video.style.background = '#000';
    if (typeof global.showModal === 'function') {
      global.showModal('Escanear QR de emergencia', '<div id="emergencyScanMount"></div>');
      var mount = global.document.getElementById('emergencyScanMount');
      if (mount) mount.appendChild(video);
    }
    global.navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then(function (stream) {
        video.srcObject = stream;
        return video.play();
      })
      .then(function () {
        if (typeof BarcodeDetector === 'undefined') {
          if (typeof global.closeModal === 'function') global.closeModal();
          var rawFallback = global.prompt('BarcodeDetector no disponible. Pegar JSON del QR:');
          if (rawFallback) handleScannedJson(rawFallback, mode);
          return;
        }
        var det = new BarcodeDetector({ formats: ['qr_code'] });
        var iv = global.setInterval(function () {
          det
            .detect(video)
            .then(function (codes) {
              if (!codes || !codes.length) return;
              var raw = codes[0].rawValue;
              global.clearInterval(iv);
              try {
                if (video.srcObject) {
                  video.srcObject.getTracks().forEach(function (t) {
                    t.stop();
                  });
                }
              } catch (e) { /* ignore */ }
              if (typeof global.closeModal === 'function') global.closeModal();
              handleScannedJson(raw, mode);
            })
            .catch(function () {});
        }, 700);
      })
      .catch(function () {
        var raw = global.prompt('Permiso cámara denegado. Pegar JSON del QR:');
        if (raw) handleScannedJson(raw, mode);
      });
  }
  function handleScannedJson(raw, mode) {
    var pack;
    try {
      pack = JSON.parse(raw);
    } catch (e) {
      if (global.showToast) global.showToast('JSON inválido', 'error');
      return;
    }
    if (!pack || pack.v !== PROTO) {
      if (global.showToast) global.showToast('QR de emergencia no reconocido', 'error');
      return;
    }
    var myLoc = getLocId();
    if (pack.location_id && myLoc && pack.location_id !== myLoc) {
      if (global.showToast) global.showToast('Ubicación distinta: no se enlaza por seguridad.', 'error');
      return;
    }
    _lastRemotePack = pack;
    if (global.CrozzoAutoDiscovery && typeof global.CrozzoAutoDiscovery.maybeBleAdvertiseHint === 'function') {
      global.CrozzoAutoDiscovery.maybeBleAdvertiseHint({ device_id: pack.device_id }).catch(function () {});
    }
    if (pack.kind === 'offer' && mode === 'offer') {
      applyRemoteOffer(pack);
    } else if (pack.kind === 'answer' && mode === 'answer') {
      applyRemoteAnswer(pack);
    } else {
      if (global.showToast) global.showToast('Tipo de QR incorrecto para este paso.', 'warning');
    }
  }
  async function broadcastNewOrderInternal(comanda, opts) {
    opts = opts || {};
    var tid = resolveTransactionId(comanda);
    if (!tid || !state.dc || state.dc.readyState !== 'open') return false;
    var existing = await idbGet(tid).catch(function () {
      return null;
    });
    if (existing && (existing.status === STATUS.ACK_RECEIVED || existing.status === STATUS.RECONCILED)) {
      if (_ackTimers[tid]) {
        global.clearTimeout(_ackTimers[tid]);
        delete _ackTimers[tid];
      }
      refreshForceButtonsGlobal();
      if (!opts.skipReconcileHint && !state.isolated) {
        global.setTimeout(function () {
          reconcileSafe().catch(function () {});
        }, 300);
      }
      return true;
    }
    var row =
      existing && existing.kind === 'NEW_ORDER'
        ? existing
        : {
            transaction_id: tid,
            comanda_id: comanda.id,
            kind: 'NEW_ORDER',
            status: STATUS.PENDING,
            status_history: ['created'],
            updated_at: Date.now()
          };
    row.payload = JSON.parse(JSON.stringify(comanda));
    row.comanda_id = comanda.id;
    row.transaction_id = tid;
    if (!existing) row.status_history = appendHist(row.status_history, 'created');
    else row.status_history = appendHist(row.status_history, 'payload_refresh');
    row.updated_at = Date.now();
    await idbPut(row).catch(function () {});
    try {
      state.dc.send(
        JSON.stringify({
          type: 'NEW_ORDER',
          payload: row.payload,
          transaction_id: tid,
          ts: Date.now()
        })
      );
    } catch (e) {
      return false;
    }
    row.status = STATUS.SENT_P2P;
    row.status_history = appendHist(row.status_history, 'p2p_sent');
    row.updated_at = Date.now();
    await idbPut(row).catch(function () {});
    armAckTimeout(tid, comanda.id);
    await refreshOutboxCache();
    refreshForceButtonsGlobal();
    return true;
  }
  function broadcastNewOrder(comanda, opts) {
    if (!state.dc || state.dc.readyState !== 'open') return false;
    broadcastNewOrderInternal(comanda, opts || {}).catch(function (e) {
      log('broadcastNewOrderInternal ' + e);
    });
    return true;
  }
  function sendOrder(comanda, opts) {
    return broadcastNewOrder(comanda, opts);
  }
  async function forcePendingResend() {
    if (!state.dc || state.dc.readyState !== 'open') {
      if (global.showToast) global.showToast('Sin canal P2P. Genere / escanee QR primero.', 'warning');
      return;
    }
    var ids = typeof global.__crozzoEmergencyGetLastComandaIds === 'function' ? global.__crozzoEmergencyGetLastComandaIds() : [];
    if (!ids || !ids.length) {
      if (global.showToast) global.showToast('No hay comandas recientes para reenviar.', 'info');
      return;
    }
    var any = false;
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      var c = typeof global.__crozzoEmergencyFindComandaById === 'function' ? global.__crozzoEmergencyFindComandaById(id) : null;
      if (!c) continue;
      var tid = resolveTransactionId(c);
      var row = await idbGet(tid).catch(function () {
        return null;
      });
      if (row && (row.status === STATUS.ACK_RECEIVED || row.status === STATUS.RECONCILED)) continue;
      await broadcastNewOrderInternal(JSON.parse(JSON.stringify(c)), { force: true });
      any = true;
    }
    if (global.showToast) global.showToast(any ? '⚡ Reenvío P2P disparado (solo sin ACK definitivo).' : 'Nada que reenviar: ya hay ACK o reconciliación.', any ? 'info' : 'warning');
  }
  function isActive() {
    return !!state.isolated;
  }
  function isLinkReady() {
    return !!(state.dc && state.dc.readyState === 'open');
  }
  function init() {
    if (_inited) return;
    _inited = true;
    global.__crozzoEmergencyStatusCache = global.__crozzoEmergencyStatusCache || {};
    global.__crozzoEmergencyStatusByComandaId = global.__crozzoEmergencyStatusByComandaId || {};
    attachShell();
    if (_checkTimer) global.clearInterval(_checkTimer);
    _checkTimer = global.setInterval(isolationLoop, 10000);
    if (_cacheTimer) global.clearInterval(_cacheTimer);
    _cacheTimer = global.setInterval(function () {
      refreshOutboxCache().finally(function () {
        refreshForceButtonsGlobal();
      });
    }, 4000);
    isolationLoop();
    refreshOutboxCache().catch(function () {});
    initMeshHeartbeatOnce();
    if (_discoveryInterval) global.clearInterval(_discoveryInterval);
    _discoveryInterval = global.setInterval(function () {
      if (state.isolated) tryDiscoveryPing();
    }, 12000);
    global.addEventListener('online', function () {
      isolationLoop();
      reconcileSafe().catch(function () {});
    });
  }
  global.CrozzoEmergencyMesh = {
    init: init,
    evaluateIsolation: evaluateIsolation,
    isActive: isActive,
    isLinkReady: isLinkReady,
    broadcastNewOrder: broadcastNewOrder,
    sendOrder: sendOrder,
    forcePendingResend: forcePendingResend,
    reconcile: reconcile,
    reconcileSafe: reconcileSafe,
    closePc: closePc,
    getLocalStatusForComanda: getLocalStatusForComanda,
    refreshOutboxCache: refreshOutboxCache,
    meshLog: meshLog,
    STATUS: STATUS,
    _state: state
  };
})(typeof window !== 'undefined' ? window : this);
/* ========== Crozzo namespace ========== */
(function () {
  if (typeof window === 'undefined') return;
  window.Crozzo = window.Crozzo || {};
  Object.assign(window.Crozzo, {
    ModeManager: window.CrozzoModeManager,
    NetworkGuard: window.CrozzoNetworkGuard,
    QRPairing: window.CrozzoQRPairing,
    IdempotentSync: window.CrozzoIdempotentSync,
    SyncRouterModule: window.CrozzoSyncRouterModule,
    AutoConfig: window.CrozzoAutoConfig,
    Diagnostics: {
      init: window.initDiagnosticsPanel,
      runAll: window.runAllDiagnosticsTests,
      runOne: window.runDiagnosticsTest,
    },
    PersistentWebRTC: window.CrozzoPersistentWebRTC,
    MeshHeartbeat: window.CrozzoMeshHeartbeat,
    AutoDiscovery: window.CrozzoAutoDiscovery,
    EmergencyMesh: window.CrozzoEmergencyMesh,
  });
})();