/**
 * WebSocket LAN — push instantáneo de comandas/estados desde caja (puerto HTTP+1).
 */
(function (global) {
  'use strict';

  var _ws = null;
  var _reconnectTimer = null;
  var _url = '';
  var RECONNECT_MS = 4200;
  // TLS/WSS: caché de disponibilidad y degradación controlada (wss -> ws).
  var _tlsCache = { value: null, at: 0, ttl: 30000 };
  var _forcePlain = false;
  var _wssFailedAt = 0;
  var _wssRetryAfterMs = 60000;
  var _openedThisAttempt = false;
  // Jitter anti-estampida (S-04): deviceId-determinista + azar corto.
  // Preferir crozzoReconnectStaggerMs (ReconnectSync); fallback hash local.
  function reconnectDelay() {
    try {
      if (typeof global.crozzoReconnectStaggerMs === 'function') {
        return global.crozzoReconnectStaggerMs(RECONNECT_MS, 2600);
      }
    } catch (_) {}
    var id = '';
    try {
      id = String(
        (typeof global.ensureCrozzoDeviceId === 'function' && global.ensureCrozzoDeviceId()) ||
          (global.localStorage && global.localStorage.getItem('crozzo_device_id')) ||
          ''
      );
    } catch (_) {
      id = '';
    }
    var h = 0;
    for (var i = 0; i < id.length; i++) {
      h = (h * 31 + id.charCodeAt(i)) >>> 0;
    }
    return RECONNECT_MS + (h % 2600) + Math.floor(Math.random() * 400);
  }

  function md() {
    return typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
  }

  function isDesktopTauri() {
    try {
      return !!(global.__TAURI__ && global.__TAURI__.core && typeof global.__TAURI__.core.invoke === 'function');
    } catch (_) {
      return false;
    }
  }

  function invoke(cmd, args) {
    return global.__TAURI__.core.invoke(cmd, args || {});
  }

  function tierAllows() {
    try {
      // Strict: only allow if LAN ops are actively running or in standby
      if (global.CrozzoLanOpsSync && typeof global.CrozzoLanOpsSync.getPathHealth === 'function') {
        var h = global.CrozzoLanOpsSync.getPathHealth();
        if (h && h.started) return true;
      }
      if (typeof global.crozzoLanWsStandbyActive === 'function' && global.crozzoLanWsStandbyActive()) {
        return true;
      }
    } catch (_) {}
    try {
      if (typeof global.crozzoCloudSyncPathReady === 'function' && global.crozzoCloudSyncPathReady()) {
        return false;
      }
    } catch (_) {}
    if (canUseLanWs()) {
      // Double check with orchestrator
      try {
        if (global.CrozzoConnectivityOrchestrator && typeof global.CrozzoConnectivityOrchestrator.getState === 'function') {
          var st = global.CrozzoConnectivityOrchestrator.getState();
          if (st && (st.level === 'mesh' || st.level === 'qr')) return false;
        }
      } catch (_) {}
      return true;
    }
    try {
      if (typeof global.crozzoLanTransportAllowed === 'function') {
        return global.crozzoLanTransportAllowed();
      }
    } catch (_) {}
    var t = String(global.__CROZZO_TIER_LAST || 'offline');
    return t === 'lan' || t === 'hotspot';
  }

  function wsPort(cfg) {
    var p = Number(global.__CROZZO_LAN_WS_PORT);
    if (p > 0) return p;
    return (Number(cfg.port) || 3000) + 1;
  }

  async function tlsAvailable(cfg) {
    try {
      // Reintento periódico de WSS tras degradación.
      if (_forcePlain && _wssFailedAt && (Date.now() - _wssFailedAt) > _wssRetryAfterMs) {
        _forcePlain = false;
        _tlsCache.value = null;
        _tlsCache.at = 0;
      }
      var now = Date.now();
      if (_tlsCache.value !== null && (now - _tlsCache.at) < _tlsCache.ttl) {
        if (_forcePlain) return false;
        return !!_tlsCache.value;
      }
      var avail = false;
      try {
        if (isDesktopTauri()) {
          if (cfg.role === 'A') {
            var st = null;
            try { st = await invoke('crozzo_lan_ws_tls_status'); } catch (_) { st = null; }
            var tls = st && st.tls;
            if (tls && tls.cert_exists && tls.enabled !== false && (st.wss_available !== false)) {
              avail = true;
              // Verificación de fingerprint contra el cert local.
              try {
                var cert = await invoke('crozzo_lan_tls_cert');
                var fp = cert && (cert.fingerprint || cert.fingerprint_sha256);
                if (fp && typeof global.crozzoTlsVerifyFingerprint === 'function') {
                  if (!global.crozzoTlsVerifyFingerprint(fp)) avail = false;
                }
              } catch (_) {}
            }
          } else {
            var paired = (typeof global.crozzoTlsGetPairedFingerprint === 'function') ? global.crozzoTlsGetPairedFingerprint() : '';
            if (paired) {
              avail = true;
              if (global.CrozzoTlsPinning && typeof global.CrozzoTlsPinning.verifyConnection === 'function') {
                var ipV = String(cfg.centralIp || '').trim();
                var portV = Number(cfg.port) || 3000;
                try {
                  var vr = await global.CrozzoTlsPinning.verifyConnection(ipV, portV, paired);
                  if (vr && vr.ok === false) avail = false;
                } catch (_) {}
              }
            }
          }
        } else {
          var paired2 = (typeof global.crozzoTlsGetPairedFingerprint === 'function') ? global.crozzoTlsGetPairedFingerprint() : '';
          if (paired2) {
            avail = true;
            if (global.CrozzoTlsPinning && typeof global.CrozzoTlsPinning.verifyConnection === 'function') {
              var ip2 = String(cfg.centralIp || '').trim() || '127.0.0.1';
              var port2 = Number(cfg.port) || 3000;
              try {
                var vr2 = await global.CrozzoTlsPinning.verifyConnection(ip2, port2, paired2);
                if (vr2 && vr2.ok === false) avail = false;
              } catch (_) {}
            }
          }
        }
      } catch (_) {
        avail = false;
      }
      _tlsCache.value = avail;
      _tlsCache.at = now;
      if (!avail) _forcePlain = false;
      return avail;
    } catch (_) {
      return false;
    }
  }

  async function buildUrl() {
    var cfg = md();
    if (cfg.role === 'A') {
      if (!isDesktopTauri()) return '';
      var port = wsPort(cfg);
      var useTls = !_forcePlain && (await tlsAvailable(cfg));
      var proto = useTls ? 'wss' : 'ws';
      return proto + '://127.0.0.1:' + port + '/';
    }
    var ip = String(cfg.centralIp || '').trim();
    if (!ip) return '';
    var port2 = wsPort(cfg);
    var useTls2 = !_forcePlain && (await tlsAvailable(cfg));
    var proto2 = useTls2 ? 'wss' : 'ws';
    return proto2 + '://' + ip + ':' + port2 + '/';
  }

  function canUseLanWs() {
    var cfg = md();
    if (cfg.allowLan === false) return false;
    if (cfg.role === 'A') return isDesktopTauri();
    if (cfg.role === 'B') return !!String(cfg.centralIp || '').trim();
    return false;
  }

  function emitOpAckFromRaw(raw, via) {
    if (typeof global.crozzoOpEmitAck !== 'function') return;
    var id = typeof global.crozzoOpResolveId === 'function' ? global.crozzoOpResolveId(raw) : '';
    if (!id && typeof global.crozzoOpEnsureId === 'function') {
      global.crozzoOpEnsureId(raw);
      id = typeof global.crozzoOpResolveId === 'function' ? global.crozzoOpResolveId(raw) : '';
    }
    if (id) global.crozzoOpEmitAck(id, via || 'lan');
  }

  function applyLanPush(msg) {
    if (!msg || !msg.payload) return;
    var raw = msg.payload;
    if (msg.event === 'lan_ops_pulse' || raw.event === 'lan_ops_pulse') {
      var pulse = raw.kind ? raw : raw.data || raw;
      if (typeof global.__crozzoLanOpsHandlePulse === 'function') {
        global.__crozzoLanOpsHandlePulse(pulse);
      }
      return;
    }
    var typEarly = String(raw.type || '').toLowerCase();
    if (typEarly === 'lan_action_ack' || typEarly === 'op_ack') {
      if (typeof global.crozzoOpHandleAck === 'function') global.crozzoOpHandleAck(raw);
      else if (typeof global.crozzoLanHandleActionAck === 'function') global.crozzoLanHandleActionAck(raw);
      return;
    }
    if (typEarly === 'identity_card' || typEarly === 'identity') {
      var idCard = raw.data || raw.payload || raw;
      if (global.CrozzoPeerDirectory && typeof global.CrozzoPeerDirectory.ingestIdentityCard === 'function') {
        global.CrozzoPeerDirectory.ingestIdentityCard(idCard, 'lan_ws');
      }
      /* Rol A: eco de roster (relay-peers) para que el nuevo equipo conozca a los demás. */
      try {
        if (global.CrozzoPeerDirectory && typeof global.CrozzoPeerDirectory.maybeEchoFleetRoster === 'function') {
          global.CrozzoPeerDirectory.maybeEchoFleetRoster((idCard && idCard.deviceId) || '', {});
        }
      } catch (_) {}
      noteWsActivity();
      return;
    }
    if (typEarly === 'fleet_roster' || typEarly === 'identity_roster') {
      var rosterPay = raw.data || raw.payload || raw;
      try {
        if (global.CrozzoPeerDirectory && typeof global.CrozzoPeerDirectory.ingestFleetRoster === 'function') {
          global.CrozzoPeerDirectory.ingestFleetRoster(rosterPay, 'lan_ws');
        }
      } catch (_) {}
      noteWsActivity();
      return;
    }
    /* POE — presencia efímera (sin snap runtime completo) */
    if (typEarly === 'slot_presence') {
      var presPay = raw.data || raw.payload || raw;
      try {
        if (typeof global.crozzoOpsPresenceApply === 'function') {
          global.crozzoOpsPresenceApply(presPay, 'lan_ws');
        }
      } catch (_) {}
      noteWsActivity();
      return;
    }
    if (typeof global.crozzoLanShouldApplyAction === 'function') {
      var gate = global.crozzoLanShouldApplyAction(raw, { source: 'lan_ws' });
      if (!gate.apply) {
        if (gate.reason === 'already_seen' && typeof global.crozzoLanEmitActionAck === 'function') {
          global.crozzoLanEmitActionAck(gate.actionId);
        }
        return;
      }
    }
    var typ = typEarly;
    if (typ === 'runtime') {
      var snap = raw.data || raw.payload || raw;
      if (snap && typeof global.crozzoApplyRemoteRuntimeRow === 'function') {
        var applied = global.crozzoApplyRemoteRuntimeRow(
          snap,
          snap.savedAt ? new Date(Number(snap.savedAt)).toISOString() : null,
          { quiet: true }
        );
        if (applied && typeof global.crozzoHandleRemoteRuntimeUiSync === 'function') {
          global.crozzoHandleRemoteRuntimeUiSync({ skipCartReconcile: true });
        }
        if (typeof global.crozzoLanMarkActionApplied === 'function') global.crozzoLanMarkActionApplied(raw, 'lan_ws_runtime');
      }
      return;
    }
    if (typ === 'comanda' || typ === 'comanda_new') {
      var snap = raw.data || raw.payload || raw;
      if (snap && snap.id != null) {
        if (global.CrozzoOperationalIngest && typeof global.CrozzoOperationalIngest.applyComandaNew === 'function') {
          var ingRes = global.CrozzoOperationalIngest.applyComandaNew(snap, { via: 'lan_ws', skipPrint: false });
          if (ingRes && ingRes.applied) {
            try {
              var printKey = snap.transaction_id || String(snap.id || '');
              if (
                printKey &&
                typeof global.__crozzoComandaWasPrintedRecently === 'function' &&
                global.__crozzoComandaWasPrintedRecently(printKey, 5000) &&
                typeof global.crozzoComandaPrintedAck === 'function'
              ) {
                var mergedSnap =
                  typeof global.__crozzoEmergencyFindComandaById === 'function'
                    ? global.__crozzoEmergencyFindComandaById(snap.id)
                    : null;
                if (mergedSnap) global.crozzoComandaPrintedAck(mergedSnap).catch(function () {});
              }
            } catch (_) {}
          }
          if (typeof global.crozzoLanMarkActionApplied === 'function') global.crozzoLanMarkActionApplied(raw, 'lan_ws_comanda');
          emitOpAckFromRaw(raw, 'lan');
          return;
        }
      }
      if (snap && snap.id != null && typeof global.__crozzoEmergencyApplyComandaSnapshot === 'function') {
        var changed = global.__crozzoEmergencyApplyComandaSnapshot(snap, { source: 'lan_ws', skipPrint: false });
        if (changed) {
          try {
            if (typeof global.crozzoScheduleOperationalPageRefresh === 'function') {
              global.crozzoScheduleOperationalPageRefresh(global.currentPage);
            } else if (
              (global.currentPage === 'comandas' || global.currentPage === 'cocina') &&
              typeof global.renderPage === 'function'
            ) {
              global.renderPage(global.currentPage, { background: true });
            }
          } catch (_) {}
          // Si este dispositivo imprimió la comanda (detectado via dedup tracker),
          // propagar el ack al cloud para que la caja y otras tablets no reimpriman.
          try {
            var printKey = snap.transaction_id || String(snap.id || '');
            if (
              printKey &&
              typeof global.__crozzoComandaWasPrintedRecently === 'function' &&
              global.__crozzoComandaWasPrintedRecently(printKey, 5000) &&
              typeof global.crozzoComandaPrintedAck === 'function'
            ) {
              var mergedSnap =
                typeof global.__crozzoEmergencyFindComandaById === 'function'
                  ? global.__crozzoEmergencyFindComandaById(snap.id)
                  : null;
              if (mergedSnap) global.crozzoComandaPrintedAck(mergedSnap).catch(function () {});
            }
          } catch (_) {}
        }
        if (typeof global.crozzoLanMarkActionApplied === 'function') global.crozzoLanMarkActionApplied(raw, 'lan_ws_comanda');
        emitOpAckFromRaw(raw, 'lan');
      }
      return;
    }
    if (typ === 'comanda_estado') {
      var pay = raw.data || raw.payload || raw;
      if (pay && global.CrozzoOperationalIngest && typeof global.CrozzoOperationalIngest.applyComandaEstado === 'function') {
        global.CrozzoOperationalIngest.applyComandaEstado(pay, { via: 'lan_ws' });
        if (typeof global.crozzoLanMarkActionApplied === 'function') global.crozzoLanMarkActionApplied(raw, 'lan_ws_estado');
        emitOpAckFromRaw(raw, 'lan');
        return;
      }
      if (!pay) return;
      var c = null;
      if (pay.transaction_id && global.comandas) {
        c = global.comandas.find(function (x) {
          return x.transaction_id && String(x.transaction_id) === String(pay.transaction_id);
        });
      }
      if (!c && pay.id != null && typeof global.__crozzoEmergencyFindComandaById === 'function') {
        c = global.__crozzoEmergencyFindComandaById(pay.id);
      }
      if (!c) return;
      if (pay.estado === 'entregada' && typeof global.despacharComanda === 'function') {
        global.despacharComanda(c.id, { skipToast: true, skipGossip: true, skipFanout: true });
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
          global.renderPage(global.currentPage, { background: true });
        }
      } catch (_) {}
      if (typeof global.crozzoLanMarkActionApplied === 'function') global.crozzoLanMarkActionApplied(raw, 'lan_ws_estado');
      emitOpAckFromRaw(raw, 'lan');
      return;
    }
    if (typ === 'internal_qr_slot' || typ === 'internal_qr_req') {
      if (typ === 'internal_qr_req') {
        if (global.CrozzoInternalQrRegistry && typeof global.CrozzoInternalQrRegistry.respondWithOwnSlots === 'function') {
          global.CrozzoInternalQrRegistry.respondWithOwnSlots();
        }
        return;
      }
      var slot = raw.data || raw.payload || raw;
      if (slot && global.CrozzoInternalQrRegistry && typeof global.CrozzoInternalQrRegistry.ingestPeerSlotEntry === 'function') {
        global.CrozzoInternalQrRegistry.ingestPeerSlotEntry(slot, { source: 'lan_ws', apply: true });
      }
      return;
    }
    if (typ === 'print_caps') {
      if (global.CrozzoPrintDeviceRegistry && typeof global.CrozzoPrintDeviceRegistry.applyIncomingPrintCaps === 'function') {
        global.CrozzoPrintDeviceRegistry.applyIncomingPrintCaps(raw);
      } else if (typeof global.crozzoPublishLocalPrintCaps === 'function') {
        var payCaps = raw.data || raw.payload || raw;
        if (payCaps && payCaps.deviceId) {
          try {
            var map = JSON.parse(localStorage.getItem('crozzo_print_device_registry_v1') || '{}');
            map[payCaps.deviceId] = payCaps;
            localStorage.setItem('crozzo_print_device_registry_v1', JSON.stringify(map));
          } catch (_) {}
        }
      }
      return;
    }
  }

  var _lastMsgAt = 0;

  function noteWsActivity() {
    _lastMsgAt = Date.now();
    try {
      if (typeof global.__crozzoLanOpsNoteRx === 'function') {
        global.__crozzoLanOpsNoteRx('ws');
      }
    } catch (_) {}
  }

  function isOpen() {
    try {
      return !!(_ws && typeof WebSocket !== 'undefined' && _ws.readyState === WebSocket.OPEN);
    } catch (_) {
      return false;
    }
  }

  function onMessage(ev) {
    try {
      var msg = JSON.parse(ev.data);
      if (msg && msg.event === 'lan_ops_pulse') {
        noteWsActivity();
        if (typeof global.__crozzoLanOpsHandlePulse === 'function') {
          global.__crozzoLanOpsHandlePulse(msg.payload || msg);
        }
        return;
      }
      if (msg && msg.event === 'lan_push') {
        noteWsActivity();
        applyLanPush(msg);
        return;
      }
      if (
        msg &&
        (msg.type === 'comanda' ||
          msg.type === 'comanda_estado' ||
          msg.type === 'comanda_new' ||
          msg.type === 'identity_card' ||
          msg.type === 'identity' ||
          msg.type === 'internal_qr_slot' ||
          msg.type === 'internal_qr_req' ||
          msg.type === 'print_caps')
      ) {
        noteWsActivity();
        applyLanPush({ payload: msg });
      }
    } catch (_) {}
  }

  function scheduleReconnect() {
    if (_reconnectTimer) return;
    _reconnectTimer = global.setTimeout(function () {
      _reconnectTimer = null;
      connect();
    }, reconnectDelay());
  }

  function disconnect() {
    if (_reconnectTimer) {
      global.clearTimeout(_reconnectTimer);
      _reconnectTimer = null;
    }
    if (_ws) {
      try {
        _ws.onclose = null;
        _ws.close();
      } catch (_) {}
      _ws = null;
    }
    _url = '';
  }

  async function connect() {
    if (!tierAllows()) {
      disconnect();
      return false;
    }
    if (!canUseLanWs()) return false;
    var url = await buildUrl();
    if (!url || typeof WebSocket === 'undefined') return false;
    if (_ws && _url === url && (_ws.readyState === WebSocket.OPEN || _ws.readyState === WebSocket.CONNECTING)) {
      return true;
    }
    disconnect();
    _url = url;
    _openedThisAttempt = false;
    var isWss = String(url).indexOf('wss://') === 0;
    try {
      _ws = new WebSocket(url);
      _ws.onopen = function () {
        _openedThisAttempt = true;
        // WSS exitoso: limpiar degradación.
        if (isWss) {
          _forcePlain = false;
          _wssFailedAt = 0;
          _tlsCache.value = true;
          _tlsCache.at = Date.now();
        }
        try {
          if (typeof global.crozzoWizardTierLogLine === 'function') {
            global.crozzoWizardTierLogLine('WebSocket LAN conectado' + (isWss ? ' (WSS)' : ''));
          }
        } catch (_) {}
      };
      _ws.onmessage = onMessage;
      _ws.onclose = function () {
        var wasOpened = _openedThisAttempt;
        _ws = null;
        // Degradación: si WSS falló antes de abrir, caer a ws://.
        if (isWss && !wasOpened) {
          _forcePlain = true;
          _wssFailedAt = Date.now();
          _tlsCache.value = null;
          _tlsCache.at = 0;
        }
        scheduleReconnect();
      };
      _ws.onerror = function () {
        // No degradar aquí de forma definitiva; onclose decide.
        try { scheduleReconnect(); } catch (_) {}
      };
      return true;
    } catch (_) {
      if (isWss) {
        _forcePlain = true;
        _wssFailedAt = Date.now();
        _tlsCache.value = null;
        _tlsCache.at = 0;
      }
      scheduleReconnect();
      return false;
    }
  }

  function internalQrLanBody(entry) {
    return {
      type: 'internal_qr_slot',
      data: {
        deviceId: entry.deviceId,
        deviceRole: entry.deviceRole,
        deviceName: entry.deviceName,
        businessId: entry.businessId,
        locationId: entry.locationId,
        slot: entry.slot,
        builtAt: entry.builtAt,
        validUntil: entry.validUntil,
        scanText: entry.scanText,
        payloadJson: entry.payloadJson || null,
        ip: entry.ip || '',
        port: entry.port || 3000,
      },
    };
  }

  function pushInternalQrSlotLanHttp(entry) {
    if (!tierAllows()) return Promise.resolve(false);
    var cfg = md();
    if (cfg.role !== 'B') return Promise.resolve(false);
    var ip = String(cfg.centralIp || '').trim();
    if (!ip || !entry || !entry.scanText) return Promise.resolve(false);
    var port = Number(cfg.port) || 3000;
    var body = internalQrLanBody(entry);
    try {
      var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = controller ? global.setTimeout(function () { controller.abort(); }, 5500) : null;
      return global
        .fetch('http://' + ip + ':' + port + '/api/sync', {
          method: 'POST',
          headers:
            typeof global.crozzoLanAuthHeaders === 'function'
              ? global.crozzoLanAuthHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' })
              : { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(body),
          signal: controller ? controller.signal : undefined,
        })
        .then(function (res) {
          if (timer) global.clearTimeout(timer);
          return !!(res && res.ok);
        })
        .catch(function () {
          if (timer) global.clearTimeout(timer);
          return false;
        });
    } catch (_) {
      return Promise.resolve(false);
    }
  }

  function notifyInternalQrSlot(entry) {
    if (!entry || !entry.scanText) return false;
    var cfg = md();
    if (cfg.role === 'A') {
      var body = JSON.stringify({
        event: 'lan_push',
        endpoint: '/api/sync',
        payload: internalQrLanBody(entry),
      });
      if (isDesktopTauri()) {
        invoke('crozzo_lan_ws_broadcast', { json: body }).catch(function () {});
        return true;
      }
      return false;
    }
    if (cfg.role === 'B') {
      pushInternalQrSlotLanHttp(entry).catch(function () {});
      return true;
    }
    return false;
  }

  function requestInternalQrCatalogLan() {
    if (!tierAllows()) return Promise.resolve(false);
    var cfg = md();
    if (cfg.role !== 'B') return Promise.resolve(false);
    var ip = String(cfg.centralIp || '').trim();
    if (!ip) return Promise.resolve(false);
    var port = Number(cfg.port) || 3000;
    var body = { type: 'internal_qr_req', data: { from: cfg.deviceId || '' } };
    try {
      return global
        .fetch('http://' + ip + ':' + port + '/api/sync', {
          method: 'POST',
          headers:
            typeof global.crozzoLanAuthHeaders === 'function'
              ? global.crozzoLanAuthHeaders({ 'Content-Type': 'application/json', Accept: 'application/json' })
              : { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(body),
        })
        .then(function (res) {
          return !!(res && res.ok);
        })
        .catch(function () {
          return false;
        });
    } catch (_) {
      return Promise.resolve(false);
    }
  }

  function postComandaToCentralStore(c) {
    if (!c || c.id == null) return Promise.resolve(false);
    if (!tierAllows()) return Promise.resolve(false);
    if (typeof global.crozzoLanPostSync !== 'function') return Promise.resolve(false);
    return global
      .crozzoLanPostSync({
        uuid: String(c.transaction_id || c.id),
        type: 'comanda',
        data: c,
      })
      .catch(function () {
        return false;
      });
  }

  function notifyComandasByIds(ids) {
    if (!Array.isArray(ids) || !ids.length) return;
    if (!tierAllows()) return;
    var cfg = md();
    ids.forEach(function (id) {
      var c =
        typeof global.__crozzoEmergencyFindComandaById === 'function'
          ? global.__crozzoEmergencyFindComandaById(id)
          : null;
      if (!c) return;
      if (cfg.role === 'A') {
        postComandaToCentralStore(c).catch(function () {});
      }
      var body = JSON.stringify({
        event: 'lan_push',
        endpoint: '/api/sync',
        payload: { type: 'comanda', data: c },
      });
      if (isDesktopTauri() && cfg.role === 'A') {
        invoke('crozzo_lan_ws_broadcast', { json: body }).catch(function () {});
      }
    });
  }

  function notifyEstado(comanda, estado) {
    if (!comanda) return;
    if (!tierAllows()) return;
    var cfg = md();
    if (cfg.role !== 'A') return;
    var pay = {
      id: comanda.id,
      transaction_id: comanda.transaction_id,
      estado: estado || comanda.estado,
      lastUpdateAt: new Date().toISOString(),
    };
    postComandaToCentralStore(
      Object.assign({}, comanda, { estado: pay.estado, lastUpdateAt: pay.lastUpdateAt })
    ).catch(function () {});
    var body = JSON.stringify({
      event: 'lan_push',
      endpoint: '/api/sync',
      payload: {
        type: 'comanda_estado',
        data: pay,
      },
    });
    if (isDesktopTauri()) {
      invoke('crozzo_lan_ws_broadcast', { json: body }).catch(function () {});
    }
  }

  function afterMainInit() {
    connect();
    if (!global.__crozzoLanWsTierBound) {
      global.__crozzoLanWsTierBound = true;
      global.addEventListener('crozzo-lan-up', function () {
        connect();
      });
      global.addEventListener('crozzo-tier-changed', function () {
        if (!tierAllows()) disconnect();
        else connect();
      });
      global.setInterval(function () {
        if (tierAllows()) connect();
      }, 12000);
    }
  }

  global.CrozzoLanWebSocketBridge = {
    connect: connect,
    disconnect: disconnect,
    isOpen: isOpen,
    lastMsgAt: function () {
      return _lastMsgAt;
    },
    notifyComandasByIds: notifyComandasByIds,
    notifyEstado: notifyEstado,
    notifyInternalQrSlot: notifyInternalQrSlot,
    requestInternalQrCatalogLan: requestInternalQrCatalogLan,
    afterMainInit: afterMainInit,
  };
})(typeof window !== 'undefined' ? window : globalThis);
