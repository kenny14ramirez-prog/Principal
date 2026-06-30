/**
 * Crozzo — Predicción de errores humanos en conectividad + recuperación guiada.
 *
 * Anticipa fallos orgánicos (WiFi equivocado, caja apagada, QR no escaneado,
 * tablets en subredes distintas) y dispara acciones automáticas + avisos claros.
 */
(function (global) {
  'use strict';

  var HINT_COOLDOWN_MS = 180000;
  var RECOVERY_GAP_MS = 12000;
  var __lastHintAt = {};
  var __lastRecoveryAt = 0;

  function safe(fn, def) {
    try {
      return fn();
    } catch (_) {
      return def;
    }
  }

  function md() {
    return typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
  }

  function directorState() {
    return safe(function () {
      return global.CrozzoConnectivityDirector && global.CrozzoConnectivityDirector.getState();
    }, null);
  }

  function orchestratorState() {
    return safe(function () {
      return global.CrozzoConnectivityOrchestrator && global.CrozzoConnectivityOrchestrator.getState();
    }, null);
  }

  function gossipStatus() {
    return safe(function () {
      return global.CrozzoOfflineGossip && global.CrozzoOfflineGossip.getStatus();
    }, null);
  }

  function broadcastLikely() {
    return typeof global.BroadcastChannel === 'function';
  }

  function wanLikely() {
    if (typeof global.crozzoWanLikely === 'function') return global.crozzoWanLikely();
    if (typeof global.crozzoWanOnline === 'function') return global.crozzoWanOnline();
    return typeof global.navigator !== 'undefined' && !!global.navigator.onLine;
  }

  function lanSegmentUp() {
    return typeof global.crozzoIsLocalLanSegmentUp === 'function' && global.crozzoIsLocalLanSegmentUp();
  }

  function hintOnce(key, message, level) {
    var now = Date.now();
    if (now - (__lastHintAt[key] || 0) < HINT_COOLDOWN_MS) return;
    __lastHintAt[key] = now;
    safe(function () {
      if (typeof global.showToast === 'function') {
        global.showToast(message, level || 'warning');
      }
    });
  }

  /** Escenarios humanos predecibles → acciones + mensajes. */
  function predict(opts) {
    opts = opts || {};
    var cfg = md();
    var role = cfg.role === 'B' ? 'B' : 'A';
    var ds = directorState();
    var orch = orchestratorState();
    var gossip = gossipStatus();
    var tier = String(global.__CROZZO_TIER_LAST || 'offline');
    var predictions = [];
    var actions = [];

    // H1: WiFi del local vs datos personales / invitado
    if (role === 'B' && wanLikely() && !lanSegmentUp() && tier !== 'cloud') {
      predictions.push({
        id: 'H1_wrong_wifi',
        severity: 'warn',
        message:
          'Hay internet en el celular pero no en la red del restaurante. Conecte la tablet a la misma Wi‑Fi de la caja.',
      });
      actions.push('wifi_zone_watch');
    }

    // H2: Caja apagada pero memoria/nube recuerda ancla
    var anchorMem =
      safe(function () {
        return global.CrozzoPeerDirectory && global.CrozzoPeerDirectory.pickCloudAnchorPeer();
      }, null) ||
      safe(function () {
        return String(cfg.centralIp || '').trim();
      }, '');
    if (
      role === 'B' &&
      ds &&
      (ds.mode === 'lan_seek' || ds.mode === 'isolated') &&
      (anchorMem || (ds.anchorCloud && !ds.selfLan))
    ) {
      predictions.push({
        id: 'H2_caja_off',
        severity: 'warn',
        message:
          'La caja no responde. Verifique que esté encendida y en la misma red; si acaba de reiniciar, espere 30 s o escanee el QR del día.',
      });
      actions.push('resolve_central_memory', 'request_peer_qr');
    }

    // H3: Credenciales rotas / nunca escaneó QR
    if (
      role === 'B' &&
      !safe(function () {
        return typeof global.crozzoOnlineConfigReady === 'function' && global.crozzoOnlineConfigReady();
      }, false) &&
      wanLikely()
    ) {
      predictions.push({
        id: 'H3_missing_qr',
        severity: 'info',
        message: 'Faltan credenciales de nube en esta tablet. Escanee el QR de emparejamiento de la caja.',
      });
      actions.push('heal_cloud_from_caja', 'surface_qr');
    }

    // H4: Aislamiento total pero misma subred WiFi → malla gossip
    if (
      tier === 'offline' ||
      tier === 'mesh' ||
      (ds && (ds.mode === 'isolated' || ds.mode === 'lan_seek'))
    ) {
      var peerCount = (gossip && gossip.peerCount) || 0;
      var gossipActive = !!(gossip && gossip.active);
      if (broadcastLikely() && !lanSegmentUp() && peerCount === 0 && !gossipActive) {
        predictions.push({
          id: 'H4_same_wifi_cluster',
          severity: 'info',
          message:
            'Sin caja ni internet: conecte todas las tablets a la misma Wi‑Fi del local para que se encuentren solas.',
        });
        actions.push('bootstrap_gossip_cluster');
      } else if (peerCount >= 1 || gossipActive) {
        predictions.push({
          id: 'H4_mesh_active',
          severity: 'ok',
          message: 'Malla local activa: las tablets se están sincronizando entre sí.',
        });
      }
    }

    // H5: Caja Rol A sin WAN — operador olvidó cable/router
    if (role === 'A' && lanSegmentUp() && !wanLikely() && tier !== 'cloud') {
      predictions.push({
        id: 'H5_router_down',
        severity: 'warn',
        message:
          'La red local funciona pero no hay internet. Las tablets pueden operar por LAN; revise el router o datos del local.',
      });
      actions.push('enforce_serve_lan');
    }

    // H6: Modo avión / offline duro
    if (typeof global.navigator !== 'undefined' && global.navigator.onLine === false) {
      predictions.push({
        id: 'H6_airplane',
        severity: 'warn',
        message: 'El equipo está sin conexión. Desactive modo avión o active Wi‑Fi/datos.',
      });
    }

    if (opts.includeActions !== false) {
      return { predictions: predictions, actions: actions, role: role, tier: tier, at: Date.now() };
    }
    return predictions;
  }

  async function runRecovery(opts) {
    opts = opts || {};
    var now = Date.now();
    if (!opts.force && now - __lastRecoveryAt < RECOVERY_GAP_MS) {
      return { ok: false, reason: 'debounced' };
    }
    __lastRecoveryAt = now;

    var pack = predict({ includeActions: true });
    var applied = [];

    pack.actions.forEach(function (action) {
      if (action === 'wifi_zone_watch') {
        safe(function () {
          if (global.CrozzoWifiZoneBridge && typeof global.CrozzoWifiZoneBridge.startWatch === 'function') {
            global.CrozzoWifiZoneBridge.startWatch();
            applied.push(action);
          }
        });
      }
      if (action === 'resolve_central_memory') {
        safe(function () {
          if (
            global.CrozzoConnectivityDirector &&
            typeof global.CrozzoConnectivityDirector.resolveCentralFromMemory === 'function'
          ) {
            global.CrozzoConnectivityDirector.resolveCentralFromMemory({ timeoutMs: 2200 })
              .then(function (r) {
                if (r && r.ip) applied.push(action + ':' + r.ip);
              })
              .catch(function () {});
            applied.push(action);
          }
        });
      }
      if (action === 'request_peer_qr' || action === 'surface_qr') {
        safe(function () {
          if (global.CrozzoInternalQrRegistry) {
            if (typeof global.CrozzoInternalQrRegistry.requestPeerQrCatalog === 'function') {
              global.CrozzoInternalQrRegistry.requestPeerQrCatalog({ force: !!opts.force });
              applied.push('request_peer_qr');
            }
            if (action === 'surface_qr' && typeof global.CrozzoDailyPairing.surfaceLastResort === 'function') {
              global.CrozzoDailyPairing.surfaceLastResort();
              applied.push('surface_qr');
            }
          }
        });
      }
      if (action === 'heal_cloud_from_caja') {
        safe(function () {
          if (typeof global.crozzoHealRoleBCloudFromCaja === 'function') {
            global.crozzoHealRoleBCloudFromCaja({ force: !!opts.force, source: 'human_predict' })
              .then(function (r) {
                if (r && r.healed) applied.push('cloud_healed');
              })
              .catch(function () {});
            applied.push(action);
          }
        });
      }
      if (action === 'bootstrap_gossip_cluster') {
        safe(function () {
          if (global.CrozzoOfflineGossip) {
            if (typeof global.CrozzoOfflineGossip.bootstrapCluster === 'function') {
              global.CrozzoOfflineGossip.bootstrapCluster();
            } else if (typeof global.CrozzoOfflineGossip.afterMainInit === 'function') {
              global.CrozzoOfflineGossip.afterMainInit();
            }
            applied.push(action);
          }
          if (
            global.CrozzoConnectivityOrchestrator &&
            typeof global.CrozzoConnectivityOrchestrator.evaluateNow === 'function'
          ) {
            global.CrozzoConnectivityOrchestrator.evaluateNow().catch(function () {});
          }
        });
      }
      if (action === 'enforce_serve_lan') {
        safe(function () {
          if (global.CrozzoBrainPolicy && typeof global.CrozzoBrainPolicy.enforceBrainServe === 'function') {
            global.CrozzoBrainPolicy.enforceBrainServe({ force: !!opts.force }).catch(function () {});
            applied.push(action);
          }
        });
      }
    });

    pack.predictions.forEach(function (p) {
      if (p.severity === 'warn' || p.severity === 'info') {
        hintOnce(p.id, p.message, p.severity === 'info' ? 'info' : 'warning');
      }
    });

    return { ok: applied.length > 0, applied: applied, predictions: pack.predictions };
  }

  function start() {
    safe(function () {
      global.addEventListener('crozzo-tier-changed', function () {
        runRecovery({ quiet: true }).catch(function () {});
      });
      global.addEventListener('crozzo-connectivity-director-changed', function () {
        runRecovery({ quiet: true }).catch(function () {});
      });
      global.addEventListener('offline', function () {
        runRecovery({ force: true }).catch(function () {});
      });
    });
    global.setTimeout(function () {
      runRecovery({ force: true }).catch(function () {});
    }, 4000);
  }

  global.CrozzoHumanConnectivityPredict = {
    predict: predict,
    runRecovery: runRecovery,
    start: start,
  };
})(typeof window !== 'undefined' ? window : globalThis);
