/**
 * Servidor LAN multidispositivo en Tauri (Rol A) + drenado hacia mirror cloud.
 */
(function (global) {
  'use strict';

  var _pollTimer = null;
  var _runtimePollTimer = null;
  var _runtimePullInFlight = false;
  var _runtimeBackoffUntil = 0;
  var _runtimeBackoffMs = 0;
  var _cloudAnchorTimer = null;
  var POLL_MS = 4200;
  var RUNTIME_POLL_MS = 900;

  function isDesktopTauri() {
    try {
      var t = global.__TAURI__;
      if (t && t.core && typeof t.core.invoke === 'function') {
        global.__CROZZO_IS_TAURI__ = true;
        return true;
      }
      if (t && typeof t.invoke === 'function') {
        global.__CROZZO_IS_TAURI__ = true;
        return true;
      }
      return !!(global.__CROZZO_IS_TAURI__ && t);
    } catch (_) {
      return false;
    }
  }

  function invoke(cmd, args) {
    var t = global.__TAURI__;
    if (t && t.core && typeof t.core.invoke === 'function') return t.core.invoke(cmd, args || {});
    if (t && typeof t.invoke === 'function') return t.invoke(cmd, args || {});
    return Promise.reject(new Error('Tauri invoke no disponible'));
  }

  // ---- Token de pareo LAN (autenticación entre dispositivos) ----
  function genLanToken() {
    try {
      var a = new Uint8Array(24);
      (global.crypto || global.msCrypto).getRandomValues(a);
      return Array.prototype.map
        .call(a, function (b) {
          return ('0' + b.toString(16)).slice(-2);
        })
        .join('');
    } catch (_) {
      return 'lt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
    }
  }
  // Lee el token actual (Rol A o Rol B) de crozzo_lan_config / multidispositivo.
  function lanAuthToken() {
    try {
      var raw = global.localStorage.getItem('crozzo_lan_config');
      var lan = raw ? JSON.parse(raw) : null;
      if (lan && lan.lanToken) return String(lan.lanToken);
    } catch (_) {}
    try {
      var md = typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : null;
      if (md && md.lanToken) return String(md.lanToken);
    } catch (_) {}
    return '';
  }
  // Rol A: asegura que exista un token; lo crea y persiste si falta.
  function lanTokenEnsure() {
    try {
      var raw = global.localStorage.getItem('crozzo_lan_config');
      var lan = raw ? JSON.parse(raw) : {};
      if (!lan.lanToken) {
        lan.lanToken = genLanToken();
        lan.savedAt = Date.now();
        global.localStorage.setItem('crozzo_lan_config', JSON.stringify(lan));
        try {
          if (typeof global.getMultiDeviceConfig === 'function' && typeof global.persistMultiDeviceConfig === 'function') {
            var md = global.getMultiDeviceConfig() || {};
            md.lanToken = lan.lanToken;
            global.persistMultiDeviceConfig(md);
          }
        } catch (_) {}
      }
      return lan.lanToken;
    } catch (_) {
      return '';
    }
  }
  // Headers para peticiones LAN (firma con el token si existe).
  global.crozzoLanAuthToken = lanAuthToken;
  global.crozzoLanAuthHeaders = function (extra) {
    var h = extra ? Object.assign({}, extra) : {};
    var t = lanAuthToken();
    if (t) h['X-Crozzo-Lan-Token'] = t;
    return h;
  };

  var _lanBackoffUntil = 0;
  var _lanBackoffStep = 0;
  var _lanPostChain = Promise.resolve();
  var _lanLastPostAt = 0;
  var _lanPressureLogAt = 0;
  var LAN_MIN_GAP_MS = 650;

  /** ¿Permitir escrituras LAN HTTP? Nube viva → solo tablets; sin WAN → LAN es primario. */
  function crozzoLanTransportAllowed() {
    try {
      if (Date.now() < _lanBackoffUntil) return false;
      var md0 = typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
      if (md0.allowLan === false) return false;
      var hasTarget = md0.role === 'A';
      if (!hasTarget) {
        var ip = String(md0.centralIp || '').trim();
        if (!ip) {
          try {
            ip = String(global.localStorage.getItem('crozzo_wifi_zone_last_ip') || '').trim();
          } catch (_) {}
        }
        hasTarget = !!ip;
      }
      if (!hasTarget) return false;
      var throttle = global.CrozzoCloudThrottle;
      if (throttle && typeof throttle.isUnderPressure === 'function' && throttle.isUnderPressure()) {
        return true;
      }
      if (typeof global.crozzoDeferLocalSync === 'function' && global.crozzoDeferLocalSync()) {
        try {
          if (
            typeof global.crozzoLanTransportStandbyAllowed === 'function' &&
            global.crozzoLanTransportStandbyAllowed()
          ) {
            return true;
          }
        } catch (_) {}
        return false;
      }
      var tier = String(global.__CROZZO_TIER_LAST || 'offline');
      var wanReady =
        typeof global.crozzoCloudWanReady === 'function' ? global.crozzoCloudWanReady() : tier === 'cloud';
      if (tier === 'cloud' && wanReady) return md0.role === 'B';
      return true;
    } catch (_) {
      return false;
    }
  }

  function noteLanFetchPressure(err) {
    var msg = String((err && err.message) || err || '');
    if (/INSUFFICIENT_RESOURCES/i.test(msg)) {
      _lanBackoffStep = Math.min(_lanBackoffStep + 3, 12);
      _lanBackoffUntil = Date.now() + Math.max(180000, 8000 * Math.pow(2, _lanBackoffStep));
      if (Date.now() - _lanPressureLogAt > 15000) {
        _lanPressureLogAt = Date.now();
        try {
          console.warn('[lan-sync] pausa LAN por presión de red (~' + Math.round((_lanBackoffUntil - Date.now()) / 1000) + 's)');
        } catch (_) {}
      }
    } else if (/Failed to fetch|ERR_|aborted|network/i.test(msg)) {
      _lanBackoffStep = Math.min(_lanBackoffStep + 1, 8);
      _lanBackoffUntil = Date.now() + Math.min(90000, 4000 * Math.pow(2, _lanBackoffStep));
    } else {
      return false;
    }
    try {
      var thr = global.CrozzoCloudThrottle;
      if (thr && typeof thr.noteFetchFailure === 'function') thr.noteFetchFailure(err);
    } catch (_) {}
    return true;
  }

  function clearLanFetchPressure() {
    _lanBackoffStep = 0;
    _lanBackoffUntil = 0;
    try {
      global.__CROZZO_LAN_LAST_OK = Date.now();
    } catch (_) {}
  }

  global.crozzoLanTransportAllowed = crozzoLanTransportAllowed;
  global.crozzoNoteLanFetchPressure = noteLanFetchPressure;
  global.crozzoClearLanFetchPressure = clearLanFetchPressure;

  function lanActionGate(payload, source) {
    if (typeof global.crozzoLanShouldApplyAction !== 'function') return true;
    var typ = String((payload && payload.type) || '').toLowerCase();
    if (typ === 'lan_ops_pulse' || typ === 'lan_action_ack') return true;
    var gate = global.crozzoLanShouldApplyAction(payload, { source: source });
    if (!gate.apply) {
      if (gate.reason === 'already_seen' && typeof global.crozzoLanEmitActionAck === 'function') {
        global.crozzoLanEmitActionAck(gate.actionId);
      }
      return false;
    }
    return true;
  }

  function lanActionApplied(payload, source) {
    if (typeof global.crozzoLanMarkActionApplied === 'function') {
      global.crozzoLanMarkActionApplied(payload, source);
    }
  }

  async function postLanSyncInner(payload, opts) {
    opts = opts || {};
    if (!payload || typeof payload !== 'object') return false;
    if (typeof global.crozzoLanEnsureActionId === 'function') global.crozzoLanEnsureActionId(payload);
    var md = typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
    if (isDesktopTauri() && md.role === 'A') {
      try {
        var j = await invoke('crozzo_lan_sync_post', { body: JSON.stringify(payload) });
        if (j && j.ok !== false) {
          clearLanFetchPressure();
          if (typeof global.crozzoLanMarkActionPushed === 'function') global.crozzoLanMarkActionPushed(payload);
          return true;
        }
        return false;
      } catch (e) {
        noteLanFetchPressure(e);
        try {
          console.warn('[lan-sync] post nativo', e);
        } catch (_) {}
        return false;
      }
    }
    if (!crozzoLanTransportAllowed()) return false;
    var host = md.role === 'A' ? '127.0.0.1' : String(md.centralIp || '').trim();
    if (!host) {
      try {
        host = String(global.localStorage.getItem('crozzo_wifi_zone_last_ip') || '').trim();
      } catch (_) {}
    }
    if (!host) return false;
    var port = Number(md.port) || 3000;
    var timeout = Number(opts.timeoutMs) || 5500;
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller ? global.setTimeout(function () { controller.abort(); }, timeout) : null;
    try {
      var res = await global.fetch('http://' + host + ':' + port + '/api/sync', {
        method: 'POST',
        headers:
          typeof global.crozzoLanAuthHeaders === 'function'
            ? global.crozzoLanAuthHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' })
            : { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        signal: controller ? controller.signal : undefined,
      });
      if (timer) global.clearTimeout(timer);
      if (!res.ok) {
        noteLanFetchPressure('http_' + res.status);
        if (typeof global.crozzoSignalLanTrouble === 'function') global.crozzoSignalLanTrouble();
        return false;
      }
      var jr = await res.json().catch(function () {
        return null;
      });
      if (jr && jr.ok !== false) {
        clearLanFetchPressure();
        if (typeof global.crozzoLanMarkActionPushed === 'function') global.crozzoLanMarkActionPushed(payload);
        return true;
      }
      return false;
    } catch (e) {
      if (timer) global.clearTimeout(timer);
      noteLanFetchPressure(e);
      if (typeof global.crozzoSignalLanTrouble === 'function') global.crozzoSignalLanTrouble();
      return false;
    }
  }

  /** POST /api/sync — caja Tauri usa invoke nativo (sin CORS); tablets vía HTTP. Cola serial anti-tormenta. */
  async function postLanSync(payload, opts) {
    var md = typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
    var nativeA = isDesktopTauri() && md.role === 'A';
    if (!nativeA && !crozzoLanTransportAllowed()) return false;
    var run = function () {
      var wait = Math.max(0, LAN_MIN_GAP_MS - (Date.now() - _lanLastPostAt));
      if (wait <= 0) {
        _lanLastPostAt = Date.now();
        return postLanSyncInner(payload, opts);
      }
      return new Promise(function (resolve) {
        global.setTimeout(function () {
          _lanLastPostAt = Date.now();
          postLanSyncInner(payload, opts).then(resolve, function () {
            resolve(false);
          });
        }, wait);
      });
    };
    var p = _lanPostChain.then(run, run);
    _lanPostChain = p.catch(function () {});
    return p;
  }
  global.crozzoLanPostSync = postLanSync;

  function readSupabaseForLan() {
    try {
      if (typeof global.crozzoResolveSupabaseCredentials === 'function') {
        var c = global.crozzoResolveSupabaseCredentials();
        if (c && c.syncOn && c.url && c.key) return { url: String(c.url).trim(), key: String(c.key).trim() };
      }
    } catch (_) {}
    try {
      var raw = global.localStorage.getItem('crozzo_supabase_config');
      if (raw) {
        var j = JSON.parse(raw);
        if (j && j.syncEnabled && j.url) {
          var k =
            typeof global.crozzoSupabaseEffectiveAnonKey === 'function'
              ? global.crozzoSupabaseEffectiveAnonKey(j)
              : String(j.anonKey || j.key || '').trim();
          if (k) return { url: String(j.url).trim(), key: k };
        }
      }
    } catch (_) {}
    return { url: '', key: '' };
  }

  function pushPairingCloudToServer() {
    if (!isDesktopTauri()) return Promise.resolve(false);
    var sb = readSupabaseForLan();
    var md = typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : null;
    var bid = md && md.businessId ? String(md.businessId).trim() : '';
    var bname = md && md.businessName ? String(md.businessName).trim() : '';
    if (!sb.url || !sb.key) return Promise.resolve(false);
    return invoke('crozzo_lan_sync_update_pairing_cloud', {
      supabaseUrl: sb.url,
      supabaseAnonKey: sb.key,
      businessId: bid,
      businessName: bname,
    }).catch(function (e) {
      try {
        console.warn('[lan-sync] pairing-cloud push', e);
      } catch (_) {}
      return false;
    });
  }

  function crozzoIsLocalLanHost(ip) {
    var host = String(ip || '').trim().toLowerCase();
    if (!host || host === '127.0.0.1' || host === 'localhost' || host === '::1') return true;
    try {
      if (global.__CROZZO_DETECTED_LAN_IP && host === String(global.__CROZZO_DETECTED_LAN_IP).trim().toLowerCase()) {
        return true;
      }
      if (typeof global.getMultiDeviceConfig === 'function') {
        var md = global.getMultiDeviceConfig();
        if (md && md.role !== 'B' && md.serverIp && host === String(md.serverIp).trim().toLowerCase()) return true;
      }
    } catch (_) {}
    return false;
  }

  async function nativeHealth(port) {
    if (!isDesktopTauri()) return { ok: false, running: false };
    try {
      var h = await invoke('crozzo_lan_sync_health');
      if (h && h.ok && h.running) return { ok: true, running: true, port: h.port || port, via: 'native' };
      return { ok: false, running: false, port: port, via: 'native', error: 'Servidor LAN interno no está activo' };
    } catch (e) {
      return { ok: false, running: false, port: port, via: 'native', error: String((e && e.message) || e) };
    }
  }

  function readLanEnabledRoleA() {
    try {
      var md = typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : null;
      if (!md || md.role !== 'A' || md.allowLan === false) return null;
      var lanRaw = global.readCrozzoLanJson && global.readCrozzoLanJson();
      if (lanRaw && lanRaw.lanSyncEnabled === false) return null;
      return md;
    } catch (_) {
      return null;
    }
  }

  /** Payload HTTP LAN: Tauri aplana `payload` en el objeto raíz al drenar la cola. */
  function lanSubmissionRaw(sub) {
    if (!sub || typeof sub !== 'object') return {};
    var p = sub.payload;
    if (p && typeof p === 'object' && !Array.isArray(p) && (p.type != null || p.data != null)) return p;
    if (sub.type != null || sub.data != null) return sub;
    return p && typeof p === 'object' ? p : {};
  }

  function envelopeFromSubmission(sub) {
    var p = lanSubmissionRaw(sub);
    var data = p.data != null ? p.data : p.payload != null ? p.payload : {};
    return {
      uuid: p.uuid || sub.id,
      businessId: p.businessId || p.business_id || '',
      deviceId: p.deviceId || p.device_id || 'unknown',
      type: p.type || 'sync',
      payload: data,
      location_id: p.location_id || p.locationId || '',
      source: 'lan_http',
    };
  }

  function tryApplyPrintCaps(sub) {
    var raw = lanSubmissionRaw(sub);
    if (String(raw.type || '').toLowerCase() !== 'print_caps') return false;
    var pay = raw.data || raw.payload || null;
    if (!pay || !pay.deviceId) return false;
    try {
      if (global.CrozzoPrintDeviceRegistry && typeof global.CrozzoPrintDeviceRegistry.applyIncomingPrintCaps === 'function') {
        global.CrozzoPrintDeviceRegistry.applyIncomingPrintCaps(pay);
      }
      if (global.CrozzoPrintDeviceRegistry && typeof global.CrozzoPrintDeviceRegistry.broadcastPrintCaps === 'function') {
        global.CrozzoPrintDeviceRegistry.broadcastPrintCaps(pay);
      }
      return true;
    } catch (e) {
      try {
        console.warn('[lan-sync] print_caps', e);
      } catch (_) {}
      return false;
    }
  }

  function tryApplyLanComandaEstado(sub) {
    var raw = lanSubmissionRaw(sub);
    if (String(raw.type || '').toLowerCase() !== 'comanda_estado') return false;
    if (!lanActionGate(raw, 'lan_http_estado')) return true;
    var pay = raw.data || raw.payload || null;
    if (!pay) return false;
    try {
      if (global.CrozzoOperationalIngest && typeof global.CrozzoOperationalIngest.gateComandaEstado === 'function') {
        var gEst = global.CrozzoOperationalIngest.gateComandaEstado(pay, { via: 'lan_http' });
        if (!gEst.apply) {
          lanActionApplied(raw, 'lan_http_estado');
          return true;
        }
      }
      if (typeof global.__crozzoEmergencyFindComandaById === 'function' && global.comandas) {
        var c = null;
        if (pay.transaction_id) {
          c = global.comandas.find(function (x) {
            return x.transaction_id && String(x.transaction_id) === String(pay.transaction_id);
          });
        }
        if (!c && pay.id != null) c = global.__crozzoEmergencyFindComandaById(pay.id);
        if (!c) return false;
        if (pay.estado === 'entregada' && typeof global.despacharComanda === 'function') {
          global.despacharComanda(c.id, { skipToast: true, skipGossip: true });
        } else if (typeof global.updateComandaEstado === 'function') {
          global.updateComandaEstado(c.id, pay.estado, { skipFanout: true });
        }
        try {
          if (
            (global.currentPage === 'comandas' || global.currentPage === 'cocina') &&
            typeof global.crozzoScheduleOperationalPageRefresh === 'function'
          ) {
            global.crozzoScheduleOperationalPageRefresh(global.currentPage);
          } else if (
            (global.currentPage === 'comandas' || global.currentPage === 'cocina') &&
            typeof global.renderPage === 'function'
          ) {
            global.renderPage(global.currentPage);
          }
        } catch (_) {}
        if (global.CrozzoLanWebSocketBridge && typeof global.CrozzoLanWebSocketBridge.notifyEstado === 'function') {
          global.CrozzoLanWebSocketBridge.notifyEstado(c, pay.estado);
        }
      }
      if (
        typeof global.crozzoPushComandasCloudByIds === 'function' &&
        pay.id != null &&
        typeof global.crozzoCloudWanReady === 'function' &&
        global.crozzoCloudWanReady() &&
        typeof global.crozzoCloudBackgroundSyncAllowed === 'function' &&
        global.crozzoCloudBackgroundSyncAllowed()
      ) {
        global.crozzoPushComandasCloudByIds([pay.id]);
      }
      if (global.CrozzoOperationalIngest && typeof global.CrozzoOperationalIngest.markComandaEstado === 'function') {
        global.CrozzoOperationalIngest.markComandaEstado(pay, { via: 'lan_http' });
      }
      lanActionApplied(raw, 'lan_http_estado');
      return true;
    } catch (e) {
      try {
        console.warn('[lan-sync] comanda_estado', e);
      } catch (_) {}
      return false;
    }
  }

  function tryApplyLanComanda(sub) {
    var raw = lanSubmissionRaw(sub);
    var typ = String(raw.type || '').toLowerCase();
    if (typ !== 'comanda' && typ !== 'comanda_new') return false;
    if (!lanActionGate(raw, 'lan_http_comanda')) return true;
    var snap = raw.data || raw.payload || null;
    if (!snap || snap.id == null) return false;
    try {
      if (global.CrozzoOperationalIngest && typeof global.CrozzoOperationalIngest.gateComandaNew === 'function') {
        var gLan = global.CrozzoOperationalIngest.gateComandaNew(snap, { via: 'lan_central' });
        if (!gLan.apply) {
          lanActionApplied(raw, 'lan_http_comanda');
          return true;
        }
      }
      if (typeof global.__crozzoEmergencyApplyComandaSnapshot === 'function') {
        global.__crozzoEmergencyApplyComandaSnapshot(snap, { source: 'lan_central', skipPrint: true });
      }
      // Obtener la comanda mergeada para usarla en autoprint y cloud push.
      var merged =
        typeof global.__crozzoEmergencyFindComandaById === 'function'
          ? global.__crozzoEmergencyFindComandaById(snap.id)
          : null;
      if (!merged && snap.transaction_id && global.comandas) {
        merged = global.comandas.find(function (x) {
          return x.transaction_id && String(x.transaction_id) === String(snap.transaction_id);
        }) || null;
      }
      // Intentar autoprint en esta estación (caja central si tiene térmica
      // de cocina configurada). El broadcast WS que viene a continuación
      // hará lo mismo en cada tablet de cocina Rol B conectada.
      try {
        if (merged && typeof global.crozzoTryAutoPrintComanda === 'function') {
          global.crozzoTryAutoPrintComanda(merged);
        }
      } catch (_) {}
      if (global.CrozzoLanWebSocketBridge && typeof global.CrozzoLanWebSocketBridge.notifyComandasByIds === 'function') {
        global.CrozzoLanWebSocketBridge.notifyComandasByIds([snap.id]);
      }
      try {
        if (
          (global.currentPage === 'comandas' || global.currentPage === 'cocina') &&
          typeof global.crozzoScheduleOperationalPageRefresh === 'function'
        ) {
          global.crozzoScheduleOperationalPageRefresh(global.currentPage);
        }
      } catch (_) {}
      if (
        typeof global.crozzoPushComandasCloudByIds === 'function' &&
        typeof global.crozzoCloudWanReady === 'function' &&
        global.crozzoCloudWanReady() &&
        typeof global.crozzoCloudBackgroundSyncAllowed === 'function' &&
        global.crozzoCloudBackgroundSyncAllowed()
      ) {
        global.crozzoPushComandasCloudByIds([snap.id]);
      }
      if (global.CrozzoOperationalIngest && typeof global.CrozzoOperationalIngest.markComandaNew === 'function') {
        global.CrozzoOperationalIngest.markComandaNew(snap, { via: 'lan_central' });
      }
      lanActionApplied(raw, 'lan_http_comanda');
      return true;
    } catch (e) {
      try {
        console.warn('[lan-sync] comanda', e);
      } catch (_) {}
      return false;
    }
  }

  function tryApplyInternalQrSlot(sub) {
    var raw = lanSubmissionRaw(sub);
    var typ = String(raw.type || '').toLowerCase();
    if (typ === 'internal_qr_req') {
      if (global.CrozzoInternalQrRegistry && typeof global.CrozzoInternalQrRegistry.respondWithOwnSlots === 'function') {
        global.CrozzoInternalQrRegistry.respondWithOwnSlots();
      }
      return true;
    }
    if (typ !== 'internal_qr_slot') return false;
    var slot = raw.data || raw.payload || null;
    if (!slot || !slot.scanText) return false;
    try {
      if (global.CrozzoInternalQrRegistry && typeof global.CrozzoInternalQrRegistry.ingestPeerSlotEntry === 'function') {
        global.CrozzoInternalQrRegistry.ingestPeerSlotEntry(slot, { source: 'lan_http', apply: true });
      }
      return true;
    } catch (e) {
      try {
        console.warn('[lan-sync] internal_qr_slot', e);
      } catch (_) {}
      return false;
    }
  }

  async function pullLocalRuntimeOnce() {
    if (!isDesktopTauri()) return false;
    var mdCfg = typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : null;
    if (!mdCfg || mdCfg.role !== 'A') return false;
    var port = Number(mdCfg.port) || 3000;
    try {
      var res = await global.fetch('http://127.0.0.1:' + port + '/api/runtime', {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) return false;
      var j = await res.json().catch(function () {
        return null;
      });
      if (!j || !j.payload) return false;
      if (typeof global.crozzoApplyRemoteRuntimeRow !== 'function') return false;
      _runtimeBackoffMs = 0;
      _runtimeBackoffUntil = 0;
      var applied = global.crozzoApplyRemoteRuntimeRow(j.payload, j.saved_at || null, { quiet: true });
      if (applied && typeof global.crozzoHandleRemoteRuntimeUiSync === 'function') {
        global.crozzoHandleRemoteRuntimeUiSync({ skipCartReconcile: true });
      }
      return applied;
    } catch (e) {
      var msg = String((e && e.message) || e || '');
      if (/INSUFFICIENT_RESOURCES|Failed to fetch|ERR_/i.test(msg)) {
        _runtimeBackoffMs = Math.min(_runtimeBackoffMs ? _runtimeBackoffMs * 2 : 8000, 60000);
        _runtimeBackoffUntil = Date.now() + _runtimeBackoffMs;
      }
      return false;
    }
  }

  function pushCloudAnchorToServer() {
    if (!isDesktopTauri()) return;
    var mdCfg = typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : null;
    if (!mdCfg || mdCfg.role !== 'A') return;
    var ok =
      typeof global.crozzoTierAllowsCloudSync === 'function' && global.crozzoTierAllowsCloudSync();
    invoke('crozzo_lan_sync_set_cloud_reachable', { reachable: !!ok }).catch(function () {});
  }

  function startCloudAnchorPulse() {
    if (_cloudAnchorTimer) {
      clearInterval(_cloudAnchorTimer);
      _cloudAnchorTimer = null;
    }
    if (!isDesktopTauri()) return;
    var mdCfg = typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : null;
    if (!mdCfg || mdCfg.role !== 'A') return;
    pushCloudAnchorToServer();
    _cloudAnchorTimer = setInterval(pushCloudAnchorToServer, 90000);
  }

  async function drainPendingOnce() {
    if (!isDesktopTauri()) return 0;
    var items = [];
    try {
      items = await invoke('crozzo_lan_sync_drain_pending');
    } catch (_) {
      return 0;
    }
    if (!items || !items.length) return 0;
    var n = 0;
    var comandas = 0;
    var ackIds = [];
    for (var i = 0; i < items.length; i++) {
      var itemId = items[i] && items[i].id;
      if (tryApplyInternalQrSlot(items[i])) {
        n++;
        if (itemId) ackIds.push(itemId);
        continue;
      }
      if (tryApplyPrintCaps(items[i])) {
        n++;
        if (itemId) ackIds.push(itemId);
        continue;
      }
      if (tryApplyLanComandaEstado(items[i])) {
        comandas++;
        n++;
        if (itemId) ackIds.push(itemId);
        continue;
      }
      if (tryApplyLanComanda(items[i])) {
        comandas++;
        n++;
        if (itemId) ackIds.push(itemId);
        continue;
      }
      var env = envelopeFromSubmission(items[i]);
      try {
        if (typeof global.crozzoInboundP2PToMirror === 'function') {
          await global.crozzoInboundP2PToMirror(env);
          n++;
          if (itemId) ackIds.push(itemId);
        }
      } catch (e) {
        // No confirmamos: el central la volverá a ofrecer tras el TTL (reintento).
        try {
          console.warn('[lan-sync] mirror', e);
        } catch (_) {}
      }
    }
    // ACK: confirmar al central lo aplicado para que lo borre de su cola persistida.
    if (ackIds.length) {
      try {
        await invoke('crozzo_lan_sync_ack', { ids: ackIds });
      } catch (_) {}
    }
    if (n > 0 && typeof global.crozzoWizardTierLogLine === 'function') {
      var msg = 'LAN HTTP → central: ' + n + ' operación(es)';
      if (comandas) msg += ' (' + comandas + ' comanda(s) aplicadas)';
      global.crozzoWizardTierLogLine(msg);
    }
    return n;
  }

  function stopPolling() {
    if (_pollTimer) {
      clearInterval(_pollTimer);
      _pollTimer = null;
    }
    if (_runtimePollTimer) {
      clearInterval(_runtimePollTimer);
      _runtimePollTimer = null;
    }
    if (_cloudAnchorTimer) {
      clearInterval(_cloudAnchorTimer);
      _cloudAnchorTimer = null;
    }
  }

  function startRuntimePolling() {
    if (_runtimePollTimer) {
      clearInterval(_runtimePollTimer);
      _runtimePollTimer = null;
    }
    var mdCfg = typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : null;
    if (!isDesktopTauri() || !mdCfg || mdCfg.role !== 'A') return;
    _runtimePollTimer = setInterval(function () {
      try {
        if (typeof document !== 'undefined' && document.hidden) return;
      } catch (_) {}
      pullLocalRuntimeOnce().catch(function () {});
    }, RUNTIME_POLL_MS);
    pullLocalRuntimeOnce().catch(function () {});
  }

  function startPolling() {
    stopPolling();
    if (!isDesktopTauri()) return;
    startRuntimePolling();
    startCloudAnchorPulse();
    _pollTimer = setInterval(function () {
      try {
        if (typeof document !== 'undefined' && document.hidden) return;
      } catch (_) {}
      drainPendingOnce();
    }, POLL_MS);
  }

  async function stopServer() {
    stopPolling();
    if (!isDesktopTauri()) return { running: false };
    try {
      return await invoke('crozzo_lan_sync_stop');
    } catch (_) {
      return { running: false };
    }
  }

  function shouldAutoStartLanServer() {
    if (!isDesktopTauri()) return false;
    try {
      var lan = global.readCrozzoLanJson && global.readCrozzoLanJson();
      if (lan && lan.lanSyncEnabled === false) return false;
      var md = typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : null;
      if (md && String(md.role || 'A').toUpperCase() === 'B') return false;
      if (md && md.allowLan === false) return false;
      return true;
    } catch (_) {
      return true;
    }
  }

  async function detectLocalIpQuick() {
    if (!isDesktopTauri()) return '';
    try {
      return String((await invoke('crozzo_guess_local_ipv4')) || '').trim();
    } catch (_) {
      return '';
    }
  }

  async function bootstrapLanConfigForCaja() {
    if (!isDesktopTauri()) return false;
    var lip = await detectLocalIpQuick();
    if (!lip && typeof global.crozzoDetectLocalIpTauri === 'function') {
      try {
        lip = String((await global.crozzoDetectLocalIpTauri()) || '').trim();
      } catch (_) {}
    }
    if (!lip && typeof global.detectLocalIP === 'function') {
      try {
        lip = String((await global.detectLocalIP()) || '').trim();
      } catch (_) {}
    }
    if (lip) {
      try {
        global.__CROZZO_DETECTED_LAN_IP = lip;
        global.localStorage.setItem('crozzo_wifi_zone_last_ip', lip);
      } catch (_) {}
    }
    var changed = false;
    try {
      var lanRaw = global.localStorage.getItem('crozzo_lan_config');
      var lan = lanRaw ? JSON.parse(lanRaw) : null;
      if (!lan || lan.lanSyncEnabled !== true) {
        var devId =
          typeof global.ensureCrozzoDeviceId === 'function' ? global.ensureCrozzoDeviceId() : 'caja';
        lan = {
          version: 2,
          lanSyncEnabled: true,
          role: 'A',
          serverIp: lip || (lan && lan.serverIp) || '',
          port: 3000,
          allowLan: true,
          offlineEnabled: true,
          locationId: (lan && lan.locationId) || 'loc-' + String(devId).slice(0, 10),
          networkSsidNote: (lan && lan.networkSsidNote) || 'Red Wi‑Fi principal',
          savedAt: Date.now(),
        };
        global.localStorage.setItem('crozzo_lan_config', JSON.stringify(lan));
        changed = true;
      } else if (lip && !String(lan.serverIp || '').trim()) {
        lan.serverIp = lip;
        lan.savedAt = Date.now();
        global.localStorage.setItem('crozzo_lan_config', JSON.stringify(lan));
        changed = true;
      }
    } catch (_) {}
    if (changed && typeof global.persistMultiDeviceConfig === 'function' && typeof global.getMultiDeviceConfig === 'function') {
      try {
        global.persistMultiDeviceConfig(global.getMultiDeviceConfig());
      } catch (_) {}
    }
    try {
      lanTokenEnsure();
    } catch (_) {}
    if (global.CrozzoNetworkGuard && typeof global.CrozzoNetworkGuard.setIsActiveServer === 'function') {
      global.CrozzoNetworkGuard.setIsActiveServer(true);
    }
    return changed || !!lip;
  }

  async function probeHealthLocal(port) {
    port = Number(port) || 3000;
    if (!isDesktopTauri()) {
      return { ok: false, running: false, via: null, error: 'Solo app Tauri de escritorio' };
    }
    var st = await nativeHealth(port);
    if (st.ok) return st;
    if (lanBindCooldownActive()) {
      return { ok: false, running: false, port: port, via: 'native', error: global.__CROZZO_LAN_LAST_ERROR || 'Puerto LAN ocupado' };
    }
    await ensureServerForPairing();
    st = await nativeHealth(port);
    return st;
  }

  async function ensureServerForPairing() {
    if (!isDesktopTauri()) return { running: false, error: 'Solo app Tauri de escritorio' };
    if (lanBindCooldownActive()) {
      return { running: false, error: global.__CROZZO_LAN_LAST_ERROR || 'Puerto LAN ocupado', cached: true };
    }
    await bootstrapLanConfigForCaja();
    var md =
      typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : { role: 'A', port: 3000 };
    if (!md || String(md.role || 'A').toUpperCase() !== 'A') return { running: false, error: 'Rol distinto de caja (A)' };
    try {
      var st0 = await invoke('crozzo_lan_sync_status');
      if (st0 && st0.running) {
        _lanBindFailUntil = 0;
        _ensureLastOk = true;
        startPolling();
        return st0;
      }
    } catch (e0) {
      try {
        console.warn('[lan-sync] status', e0);
      } catch (_) {}
    }
    try {
      var sb = readSupabaseForLan();
      var st = await invoke('crozzo_lan_sync_start', {
        port: Number(md.port) || 3000,
        locationId: String(md.locationId || '').trim(),
        deviceId: String(md.deviceId || '').trim(),
        businessId: String(md.businessId || '').trim(),
        authToken: lanTokenEnsure(),
        supabaseUrl: sb.url || '',
        supabaseAnonKey: sb.key || '',
      });
      if (st && st.running) {
        _lanBindFailUntil = 0;
        _ensureLastOk = true;
        startPolling();
        return st;
      }
      markLanBindFailed('Puerto LAN no disponible');
      return { running: false, error: global.__CROZZO_LAN_LAST_ERROR };
    } catch (e) {
      if (lanPortBusyError(e)) markLanBindFailed(e);
      try {
        console.warn('[lan-sync] ensureServerForPairing', e);
      } catch (_) {}
      return { running: false, error: String((e && e.message) || e) };
    }
  }

  async function syncFromConfig() {
    var md = readLanEnabledRoleA();
    if (!md) {
      await stopServer();
      return { running: false };
    }
    if (!isDesktopTauri()) return { running: false };
    if (lanBindCooldownActive()) {
      return { running: false, error: global.__CROZZO_LAN_LAST_ERROR || 'Puerto LAN ocupado', cached: true };
    }
    try {
      var st0 = await invoke('crozzo_lan_sync_status');
      if (st0 && st0.running) {
        startPolling();
        await drainPendingOnce();
        return st0;
      }
    } catch (_) {}
    try {
      var sb = readSupabaseForLan();
      var st = await invoke('crozzo_lan_sync_start', {
        port: Number(md.port) || 3000,
        locationId: String(md.locationId || '').trim(),
        deviceId: String(md.deviceId || '').trim(),
        businessId: String(md.businessId || '').trim(),
        authToken: lanTokenEnsure(),
        supabaseUrl: sb.url || '',
        supabaseAnonKey: sb.key || '',
      });
      if (st && st.running) {
        _lanBindFailUntil = 0;
        startPolling();
        await drainPendingOnce();
        return st;
      }
      markLanBindFailed('Puerto LAN no disponible');
      return { running: false, error: global.__CROZZO_LAN_LAST_ERROR };
    } catch (e) {
      if (lanPortBusyError(e)) markLanBindFailed(e);
      try {
        console.warn('[lan-sync] start', e);
      } catch (_) {}
      return { running: false, error: String((e && e.message) || e) };
    }
  }

  async function status() {
    if (!isDesktopTauri()) return { running: false };
    try {
      return await invoke('crozzo_lan_sync_status');
    } catch (e) {
      try {
        global.__CROZZO_LAN_LAST_ERROR = String((e && e.message) || e);
        if (!global.__CROZZO_LAN_PERM_WARNED) {
          global.__CROZZO_LAN_PERM_WARNED = true;
          console.warn(
            '[lan-sync] Servidor LAN no disponible en esta app. Reinstale el .exe compilado con menu.bat [5] o use npm run tauri dev.',
            e
          );
        }
      } catch (_) {}
      return { running: false, error: String((e && e.message) || e) };
    }
  }

  function afterMainInit() {
    if (shouldAutoStartLanServer()) {
      ensureServerForPairing().catch(function () {});
      return;
    }
    syncFromConfig().catch(function () {});
  }

  var _ensureCooldownMs = 9000;
  var _ensureLastAt = 0;
  var _ensureLastOk = false;
  var _lanBindFailUntil = 0;
  var _lanBindFailWarned = false;
  var LAN_BIND_FAIL_COOLDOWN_MS = 120000;

  function lanPortBusyError(err) {
    var s = String((err && err.message) || err || '');
    return /10048|already in use|EADDRINUSE|en uso|addr.*use/i.test(s);
  }

  function markLanBindFailed(err) {
    _lanBindFailUntil = Date.now() + LAN_BIND_FAIL_COOLDOWN_MS;
    _ensureLastOk = false;
    try {
      global.__CROZZO_LAN_LAST_ERROR = String((err && err.message) || err || 'Puerto LAN ocupado');
      if (!_lanBindFailWarned && typeof global.showToast === 'function') {
        _lanBindFailWarned = true;
        global.showToast(
          'Puerto LAN 3000/3001 ocupado. Cierre otras ventanas BONA/Tauri abiertas y reinicie.',
          'warning'
        );
      }
    } catch (_) {}
  }

  function lanBindCooldownActive() {
    return Date.now() < _lanBindFailUntil;
  }

  async function ensureServerOnce(force) {
    if (!isDesktopTauri()) return { running: false, skipped: true };
    var now = Date.now();
    if (!force && now - _ensureLastAt < _ensureCooldownMs) {
      return { running: _ensureLastOk, cached: true };
    }
    _ensureLastAt = now;
    var st = await ensureServerForPairing();
    _ensureLastOk = !!(st && st.running);
    if (!_ensureLastOk) {
      try {
        global.__CROZZO_LAN_LAST_ERROR = String((st && st.error) || global.__CROZZO_LAN_LAST_ERROR || 'Servidor LAN no arrancó');
        if (!global.__CROZZO_LAN_START_WARNED && typeof global.showToast === 'function') {
          global.__CROZZO_LAN_START_WARNED = true;
          global.showToast(
            'Servidor LAN interno no arrancó. Reinstale con menu.bat [5] o ejecute npm run tauri dev.',
            'warning'
          );
        }
      } catch (_) {}
    }
    return st || { running: false };
  }

  function bootLanServerEarly() {
    if (!shouldAutoStartLanServer()) return;
    ensureServerOnce(true).catch(function (e) {
      try {
        console.warn('[lan-sync] arranque temprano', e);
      } catch (_) {}
    });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bootLanServerEarly);
    } else {
      bootLanServerEarly();
    }
  }
  function bindOfflineKeepLan() {
    if (global.__crozzoLanBridgeOfflineBound) return;
    global.__crozzoLanBridgeOfflineBound = true;
    try {
      global.addEventListener('offline', function () {
        try {
          if (typeof global.crozzoActivateLocalSyncPath === 'function') {
            global.crozzoActivateLocalSyncPath('browser_offline').catch(function () {});
          }
        } catch (_) {}
        syncFromConfig().catch(function () {});
      });
    } catch (_) {}
    try {
      global.addEventListener('online', function () {
        __degraded = true;
        try {
          if (typeof global.crozzoSignalLanTrouble === 'function') global.crozzoSignalLanTrouble();
        } catch (_) {}
      });
    } catch (_) {}
  }

  var __activateLocalInflight = null;
  var __activateLocalLastAt = 0;
  var ACTIVATE_COOLDOWN_MS = 900;

  /**
   * Enciende transporte LAN (WS, ops sync, vigilancia caja) sin bloquear UI.
   * Punto único invocado desde probe LAN, offline del navegador y PageCloudWatch.
   */
  async function crozzoActivateLocalSyncPath(source) {
    source = String(source || 'lan');
    try {
      if (global.__CROZZO_FIELD_TEST_QUIET && !global.__CROZZO_FIELD_TEST_LAN_ACTIVE) return false;
    } catch (_) {}
    var now = Date.now();
    if (__activateLocalInflight && now - __activateLocalLastAt < ACTIVATE_COOLDOWN_MS) {
      return __activateLocalInflight;
    }
    __activateLocalLastAt = now;
    __activateLocalInflight = (async function () {
      try {
        if (typeof global.crozzoClearLanFetchPressure === 'function') {
          global.crozzoClearLanFetchPressure();
        }
      } catch (_) {}
      var cfg = typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
      if (cfg.allowLan === false) return false;

      if (global.CrozzoWifiZoneBridge && typeof global.CrozzoWifiZoneBridge.startWatch === 'function') {
        global.CrozzoWifiZoneBridge.startWatch();
      }

      if (cfg.role === 'A') {
        try {
          await ensureServerOnce(false);
        } catch (_) {}
      } else if (cfg.role === 'B' && typeof global.crozzoWifiZoneResolveCentral === 'function') {
        try {
          var ip = String(cfg.centralIp || '').trim();
          if (!ip) {
            await global.crozzoWifiZoneResolveCentral({ force: false, timeoutMs: 2400 });
          }
        } catch (_) {}
      }

      try {
        if (global.CrozzoMdnsBridge && typeof global.CrozzoMdnsBridge.afterMainInit === 'function') {
          global.CrozzoMdnsBridge.afterMainInit();
        }
      } catch (_) {}

      try {
        if (global.CrozzoLanWebSocketBridge && typeof global.CrozzoLanWebSocketBridge.afterMainInit === 'function') {
          global.CrozzoLanWebSocketBridge.afterMainInit();
        }
      } catch (_) {}

      try {
        if (global.CrozzoLanOpsSync && typeof global.CrozzoLanOpsSync.afterMainInit === 'function') {
          global.CrozzoLanOpsSync.afterMainInit();
        } else if (typeof global.crozzoStartLanOpsSync === 'function') {
          global.crozzoStartLanOpsSync(source);
        }
      } catch (_) {}

      if (cfg.role === 'A') {
        try {
          await syncFromConfig();
        } catch (_) {}
      }

      var tier = String(global.__CROZZO_TIER_LAST || '');
      var wanReady =
        typeof global.crozzoCloudWanReady === 'function' ? global.crozzoCloudWanReady() : tier === 'cloud';
      var underPressure = false;
      try {
        underPressure =
          !!(global.CrozzoCloudThrottle &&
            typeof global.CrozzoCloudThrottle.isUnderPressure === 'function' &&
            global.CrozzoCloudThrottle.isUnderPressure());
      } catch (_) {}
      if (!(tier === 'cloud' && wanReady && !underPressure)) {
        try {
          if (typeof global.crozzoPullComandasFromLan === 'function') {
            await global.crozzoPullComandasFromLan({ skipPrint: true, skipRender: true, force: true }).catch(function () {});
          }
        } catch (_) {}
        try {
          if (typeof pullLocalRuntimeOnce === 'function') {
            await pullLocalRuntimeOnce().catch(function () {});
          }
        } catch (_) {}
      }
      return true;
    })();
    try {
      return await __activateLocalInflight;
    } finally {
      global.setTimeout(function () {
        if (Date.now() - __activateLocalLastAt >= ACTIVATE_COOLDOWN_MS - 40) {
          __activateLocalInflight = null;
        }
      }, ACTIVATE_COOLDOWN_MS);
    }
  }
  global.crozzoActivateLocalSyncPath = crozzoActivateLocalSyncPath;
  bindOfflineKeepLan();

  try {
    global.addEventListener('crozzo-supabase-config-saved', function () {
      pushPairingCloudToServer().catch(function () {});
    });
  } catch (_) {}
  try {
    global.addEventListener('crozzo-multidevice-config-saved', function () {
      pushPairingCloudToServer().catch(function () {});
    });
  } catch (_) {}

  global.CrozzoLanSyncBridge = {
    isDesktopTauri: isDesktopTauri,
    crozzoIsLocalLanHost: crozzoIsLocalLanHost,
    nativeHealth: nativeHealth,
    shouldAutoStartLanServer: shouldAutoStartLanServer,
    bootstrapLanConfigForCaja: bootstrapLanConfigForCaja,
    ensureServerOnce: ensureServerOnce,
    syncFromConfig: syncFromConfig,
    ensureServerForPairing: ensureServerForPairing,
    pushPairingCloudToServer: pushPairingCloudToServer,
    probeHealthLocal: probeHealthLocal,
    stopServer: stopServer,
    status: status,
    drainPendingOnce: drainPendingOnce,
    pullLocalRuntimeOnce: pullLocalRuntimeOnce,
    afterMainInit: afterMainInit,
  };
})(typeof window !== 'undefined' ? window : this);
