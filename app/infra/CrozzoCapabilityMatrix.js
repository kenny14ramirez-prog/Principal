/**
 * Crozzo — Matriz de capacidades y rutas de comunicación.
 *
 * Un solo cerebro local que entiende: ¿soy Android/Windows/Tauri? ¿qué transportes
 * tengo? ¿cuál es el plan A/B/C/D? ¿quién es el ancla (caja) hacia Supabase?
 *
 * No reemplaza al orquestador: le da contexto para no colapsar y adaptarse.
 */
(function (global) {
  'use strict';

  var EVAL_MS = 12000;
  var EVAL_FAST_MS = 3500;
  var __timer = null;
  var __started = false;
  var __evaluating = false;
  var __snapshot = null;
  var __lastEmitSig = '';

  var PATHS = ['A_cloud', 'B_lan', 'C_hotspot', 'D_mesh', 'E_qr'];

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

  function isTauri() {
    return !!(
      global.__TAURI__ ||
      global.__TAURI_INTERNALS__ ||
      global.__CROZZO_IS_TAURI__ ||
      (global.__TAURI__ && global.__TAURI__.core)
    );
  }

  function probePlatform() {
    var ua = String((global.navigator && global.navigator.userAgent) || '');
    var android = /Android/i.test(ua);
    var ios = /iPad|iPhone|iPod/i.test(ua);
    var win = /Windows/i.test(ua);
    var mac = /Macintosh|Mac OS/i.test(ua) && !ios;
    var form = 'unknown';
    if (global.CrozzoDeviceForm && typeof global.CrozzoDeviceForm.detectFormFactor === 'function') {
      form = String(global.CrozzoDeviceForm.detectFormFactor() || 'unknown');
    } else if (global.crozzoDetectFormFactor) {
      form = String(global.crozzoDetectFormFactor() || 'unknown');
    }
    var apk =
      safe(function () {
        return global.CrozzoDeviceForm && global.CrozzoDeviceForm.isAndroidApk && global.CrozzoDeviceForm.isAndroidApk();
      }, false) ||
      safe(function () {
        return global.CrozzoAndroidNative && global.CrozzoAndroidNative.isAndroidApk();
      }, false);
    var shell = apk ? 'android_apk' : isTauri() ? 'tauri' : 'web';
    var os = android ? 'android' : ios ? 'ios' : win ? 'windows' : mac ? 'mac' : 'unknown';
    var cfg = md();
    return {
      shell: shell,
      os: os,
      formFactor: form,
      role: cfg.role === 'B' ? 'B' : 'A',
      tauri: isTauri(),
      androidApk: apk,
      canDeployHotspot: isTauri() && !apk && win,
      canRunLanServer: cfg.role !== 'B' && isTauri() && !apk,
      canMdnsBrowse: isTauri() && !apk && !ios,
      webBluetooth: !!(global.navigator && global.navigator.bluetooth),
      broadcastChannel: typeof global.BroadcastChannel === 'function',
      online: typeof global.navigator === 'undefined' || !!global.navigator.onLine,
    };
  }

  function transportCloud() {
    var creds =
      typeof global.crozzoOnlineConfigReady === 'function' && global.crozzoOnlineConfigReady();
    var wan =
      typeof global.crozzoWanLikely === 'function'
        ? global.crozzoWanLikely()
        : typeof global.crozzoWanOnline === 'function'
          ? global.crozzoWanOnline()
          : creds;
    var tierOk =
      typeof global.crozzoTierAllowsCloudSync === 'function' ? global.crozzoTierAllowsCloudSync() : !!global.__SUPABASE;
    var pressure = safe(function () {
      return global.CrozzoCloudThrottle && global.CrozzoCloudThrottle.isUnderPressure();
    }, false);
    var active = false;
    safe(function () {
      var o = global.CrozzoConnectivityOrchestrator && global.CrozzoConnectivityOrchestrator.getState();
      active = !!(o && o.transports && o.transports.cloud);
    });
    return {
      id: 'cloud',
      label: 'Supabase (nube)',
      available: !!(creds && global.__SUPABASE),
      ready: !!(creds && wan && tierOk && !pressure),
      active: active,
      pressure: pressure,
      reason: !creds ? 'sin_credenciales' : !wan ? 'sin_wan' : pressure ? 'presion_db' : !tierOk ? 'tier_no_cloud' : 'ok',
    };
  }

  function transportLan() {
    var cfg = md();
    var lanUp =
      typeof global.crozzoIsLocalLanSegmentUp === 'function' ? global.crozzoIsLocalLanSegmentUp() : false;
    var lastOk = safe(function () {
      return global.__CROZZO_LAN_LAST_OK;
    }, 0);
    var recent = lastOk && Date.now() - lastOk < 55000;
    var active = false;
    safe(function () {
      var o = global.CrozzoConnectivityOrchestrator && global.CrozzoConnectivityOrchestrator.getState();
      active = !!(o && o.transports && o.transports.lan);
    });
    var ip = String(cfg.centralIp || '').trim();
    if (!ip) {
      ip = safe(function () {
        return String(global.localStorage.getItem('crozzo_wifi_zone_last_ip') || '').trim();
      }, '');
    }
    return {
      id: 'lan',
      label: 'LAN caja (:3000 + WS)',
      available: cfg.allowLan !== false && (cfg.role === 'A' || !!ip),
      ready: !!(lanUp || recent),
      active: active,
      anchorIp: ip,
      reason: recent ? 'ok' : lanUp ? 'segmento' : ip ? 'sin_respuesta' : 'sin_ip_caja',
    };
  }

  function transportHotspot() {
    var plat = probePlatform();
    var active = false;
    safe(function () {
      var o = global.CrozzoConnectivityOrchestrator && global.CrozzoConnectivityOrchestrator.getState();
      active = !!(o && o.transports && o.transports.hotspot);
    });
    return {
      id: 'hotspot',
      label: 'Zona Wi‑Fi caja (hotspot)',
      available: plat.canDeployHotspot || plat.role === 'B',
      ready: active || safe(function () {
        return global.localStorage.getItem('crozzo_connectivity_hotspot') === '1';
      }, false),
      active: active,
      deployCapable: plat.canDeployHotspot,
      reason: plat.canDeployHotspot ? 'caja_puede_desplegar' : 'solo_cliente',
    };
  }

  function transportMesh() {
    var gossip = safe(function () {
      return global.CrozzoOfflineGossip && global.CrozzoOfflineGossip.getStatus();
    }, null);
    var ble = safe(function () {
      return global.CrozzoBleMesh && global.CrozzoBleMesh.getStatus();
    }, null);
    var webrtc = safe(function () {
      return (
        global.CrozzoEmergencyMesh &&
        typeof global.CrozzoEmergencyMesh.isLinkReady === 'function' &&
        global.CrozzoEmergencyMesh.isLinkReady()
      );
    }, false);
    var active = false;
    safe(function () {
      var o = global.CrozzoConnectivityOrchestrator && global.CrozzoConnectivityOrchestrator.getState();
      active = !!(o && o.transports && o.transports.mesh);
    });
    var peerCount = Math.max(
      (gossip && gossip.peerCount) || 0,
      (ble && ble.peerCount) || 0
    );
    var clusterLikely = safe(function () {
      return global.CrozzoOfflineGossip && global.CrozzoOfflineGossip.sameSubnetLikely && global.CrozzoOfflineGossip.sameSubnetLikely();
    }, false);
    return {
      id: 'mesh',
      label: 'Malla (gossip / BLE / P2P)',
      available: true,
      ready: !!(active || (gossip && gossip.active) || (ble && ble.active) || webrtc || (clusterLikely && peerCount >= 0)),
      active: active || !!(gossip && gossip.active),
      peerCount: peerCount,
      transport: (ble && ble.transport) || (gossip && gossip.transport) || (webrtc ? 'webrtc' : 'none'),
      reason: peerCount ? 'peers_' + peerCount : active ? 'activa' : 'standby',
    };
  }

  function transportQr() {
    var active = false;
    safe(function () {
      var o = global.CrozzoConnectivityOrchestrator && global.CrozzoConnectivityOrchestrator.getState();
      active = !!(o && o.transports && o.transports.qr);
    });
    var peers = safe(function () {
      return global.CrozzoInternalQrRegistry && global.CrozzoInternalQrRegistry.getPeerCount();
    }, 0);
    return {
      id: 'qr',
      label: 'QR interno (emparejamiento)',
      available: true,
      ready: active || peers > 0,
      active: active,
      peerSlots: peers,
      reason: active ? 'emergencia' : peers ? 'peers_' + peers : 'reserva',
    };
  }

  function resolveHub(platform) {
    platform = platform || probePlatform();
    var cfg = md();
    var director = safe(function () {
      return global.CrozzoConnectivityDirector && global.CrozzoConnectivityDirector.getState();
    }, null);
    var anchor = safe(function () {
      return global.CrozzoPeerDirectory && global.CrozzoPeerDirectory.pickCloudAnchorPeer();
    }, null);
    var selfCloud =
      typeof global.crozzoCloudWanReady === 'function'
        ? global.crozzoCloudWanReady()
        : String(global.__CROZZO_TIER_LAST || '') === 'cloud';
    var hubIp = '';
    var hubDeviceId = '';
    var cloudAnchor = false;
    var writesToCloud = false;

    if (platform.role === 'A') {
      hubIp = safe(function () {
        return String(global.localStorage.getItem('crozzo_wifi_zone_last_ip') || '127.0.0.1');
      }, '127.0.0.1');
      hubDeviceId = safe(function () {
        return typeof global.ensureCrozzoDeviceId === 'function' ? global.ensureCrozzoDeviceId() : '';
      }, '');
      cloudAnchor = selfCloud || !!(cfg.supabaseSyncEnabled !== false && global.__SUPABASE);
      writesToCloud = cloudAnchor;
    } else if (director && director.anchorIp) {
      hubIp = director.anchorIp;
      hubDeviceId = director.anchorDeviceId || '';
      cloudAnchor = !!director.anchorCloud;
      writesToCloud = selfCloud;
    } else if (anchor) {
      hubIp = String(anchor.lanIp || cfg.centralIp || '').trim();
      hubDeviceId = String(anchor.deviceId || '').trim();
      cloudAnchor = !!anchor.cloudOk;
      writesToCloud = selfCloud;
    } else {
      hubIp = String(cfg.centralIp || '').trim();
      cloudAnchor = false;
      writesToCloud = selfCloud;
    }

    return {
      role: platform.role,
      deviceId: hubDeviceId,
      ip: hubIp,
      cloudAnchor: cloudAnchor,
      relayViaCentral: !selfCloud && cloudAnchor && platform.role === 'B',
      writesToCloud: writesToCloud,
      funnelCloud: shouldFunnelCloudThroughHub(platform, cloudAnchor, selfCloud),
    };
  }

  function shouldFunnelCloudThroughHub(platform, cloudAnchor, selfCloud) {
    platform = platform || probePlatform();
    if (platform.role !== 'B') return false;
    if (selfCloud) return false;
    var pressure = safe(function () {
      return global.CrozzoCloudThrottle && global.CrozzoCloudThrottle.isUnderPressure();
    }, false);
    if (!pressure && !cloudAnchor) return false;
    var lan = transportLan();
    return !!(lan.available && (lan.ready || lan.anchorIp));
  }

  function buildPathPlan(transports, hub) {
    transports = transports || probeTransports();
    hub = hub || resolveHub();
    var platform = probePlatform();
    var ownCloudReady = !!(transports.cloud && transports.cloud.ready);
    var borrowedCloud =
      platform.role === 'B' &&
      !ownCloudReady &&
      (hub.relayViaCentral || hub.cloudAnchor) &&
      !!(transports.lan && (transports.lan.ready || hub.ip));
    var list = [
      {
        key: 'A_cloud',
        transport: transports.cloud,
        use: ownCloudReady && !hub.funnelCloud,
        borrowed: false,
      },
      {
        key: 'B_lan',
        transport: transports.lan,
        use: transports.lan.ready || !!hub.ip || borrowedCloud,
        borrowed: borrowedCloud,
        borrowedCloud: borrowedCloud,
      },
      { key: 'C_hotspot', transport: transports.hotspot, use: transports.hotspot.ready },
      { key: 'D_mesh', transport: transports.mesh, use: transports.mesh.ready },
      { key: 'E_qr', transport: transports.qr, use: transports.qr.ready },
    ];
    if (borrowedCloud) {
      list[0].use = false;
    }
    var primary = 'none';
    if (borrowedCloud) {
      primary = 'B_lan';
    } else {
      for (var i = 0; i < list.length; i++) {
        if (list[i].use && list[i].transport && list[i].transport.ready) {
          primary = list[i].key;
          break;
        }
      }
      if (primary === 'none') {
        for (var j = 0; j < list.length; j++) {
          if (list[j].transport && list[j].transport.available) {
            primary = list[j].key;
            break;
          }
        }
      }
    }
    return {
      primary: primary,
      paths: list,
      hub: hub,
      borrowedCloud: borrowedCloud,
      hybrid: safe(function () {
        var m = global.config && global.config.get ? String(global.config.get('runtimeSyncModo') || 'hybrid') : 'hybrid';
        return m === 'hybrid';
      }, true),
    };
  }

  function probeTransports() {
    return {
      cloud: transportCloud(),
      lan: transportLan(),
      hotspot: transportHotspot(),
      mesh: transportMesh(),
      qr: transportQr(),
    };
  }

  function buildSnapshot(opts) {
    opts = opts || {};
    var platform = probePlatform();
    var transports = probeTransports();
    var hub = resolveHub(platform);
    var plan = buildPathPlan(transports, hub);
    var tier = String(global.__CROZZO_TIER_LAST || 'offline');
    var orch = safe(function () {
      return global.CrozzoConnectivityOrchestrator && global.CrozzoConnectivityOrchestrator.getState();
    }, null);
    var brain = safe(function () {
      return global.CrozzoBrainPolicy && global.CrozzoBrainPolicy.resolveBrainState
        ? global.CrozzoBrainPolicy.resolveBrainState({ snap: { transports: transports, hub: hub, plan: plan, platform: platform, tier: tier } })
        : null;
    }, null);
    return {
      at: Date.now(),
      platform: platform,
      tier: tier,
      orchestratorLevel: orch && orch.level ? orch.level : 'unknown',
      transports: transports,
      hub: hub,
      plan: plan,
      brain: brain,
      peers: safe(function () {
        return global.CrozzoPeerDirectory && global.CrozzoPeerDirectory.listPeers
          ? global.CrozzoPeerDirectory.listPeers().length
          : 0;
      }, 0),
      fast: !!opts.fast,
    };
  }

  function emitIfChanged(snap) {
    var sig =
      snap.tier +
      '|' +
      snap.plan.primary +
      '|' +
      (snap.transports.cloud.ready ? 'c' : '') +
      (snap.transports.lan.ready ? 'l' : '') +
      (snap.transports.mesh.ready ? 'm' : '') +
      '|' +
      snap.hub.funnelCloud;
    if (sig === __lastEmitSig) return;
    __lastEmitSig = sig;
    safe(function () {
      global.__CROZZO_CAPABILITY_SNAPSHOT = snap;
      global.dispatchEvent(new CustomEvent('crozzo-capabilities-changed', { detail: snap }));
    });
  }

  async function evaluate(opts) {
    opts = opts || {};
    if (__evaluating && !opts.force) return __snapshot;
    __evaluating = true;
    try {
      if (!opts.fast && global.CrozzoConnectivityDirector && typeof global.CrozzoConnectivityDirector.evaluate === 'function') {
        await global.CrozzoConnectivityDirector.evaluate({ force: false }).catch(function () {});
      }
      var snap = buildSnapshot(opts);
      __snapshot = snap;
      emitIfChanged(snap);
      if (global.CrozzoBrainPolicy) {
        if (snap.platform && snap.platform.role === 'A' && typeof global.CrozzoBrainPolicy.enforceBrainServe === 'function') {
          global.CrozzoBrainPolicy.enforceBrainServe({ quiet: true, force: !!opts.force }).catch(function () {});
        } else if (
          snap.platform &&
          snap.platform.role === 'B' &&
          snap.brain &&
          snap.brain.deficits &&
          snap.brain.deficits.length &&
          typeof global.CrozzoBrainPolicy.applyBorrowSeek === 'function'
        ) {
          global.CrozzoBrainPolicy.applyBorrowSeek({ quiet: true, force: !!opts.force }).catch(function () {});
        }
      }
      return snap;
    } finally {
      __evaluating = false;
    }
  }

  function getSnapshot() {
    return __snapshot || buildSnapshot({ fast: true });
  }

  function getHumanMatrix() {
    var s = getSnapshot();
    var p = s.platform;
    var rows = [];
    rows.push({
      grupo: 'Plataforma',
      item: p.shell + ' / ' + p.os,
      estado: p.role === 'A' ? 'Caja (cerebro)' : 'Terminal',
      detalle: p.formFactor,
    });
    PATHS.forEach(function (key) {
      var path = (s.plan.paths || []).find(function (x) {
        return x.key === key;
      });
      if (!path || !path.transport) return;
      var t = path.transport;
      rows.push({
        grupo: 'Ruta',
        item: key.replace('_', ' '),
        estado: t.ready ? '✓ listo' : t.available ? '○ standby' : '—',
        detalle: t.label + ' · ' + (t.reason || ''),
      });
    });
    rows.push({
      grupo: 'Ancla',
      item: s.hub.ip || '(sin caja)',
      estado: s.hub.cloudAnchor ? 'nube vía caja' : 'solo local',
      detalle: s.hub.funnelCloud ? 'Tablets → caja → Supabase (presión DB)' : s.plan.primary,
    });
    if (s.brain) {
      rows.push({
        grupo: 'Cerebro',
        item: s.brain.kind === 'A' ? 'Central (sirve)' : 'Terminal (' + (s.brain.mode || '?') + ')',
        estado: s.brain.deficits && s.brain.deficits.length ? 'pide prestado al A' : 'autónomo',
        detalle:
          (s.brain.borrowed || [])
            .map(function (b) {
              return b.cap + '←A/' + b.via;
            })
            .join(' · ') || s.brain.policy.label,
      });
    }
    return rows;
  }

  function pickActiveTransports() {
    var s = getSnapshot();
    var out = [];
    var ts = s.transports || {};
    Object.keys(ts).forEach(function (k) {
      var t = ts[k];
      if (t && (t.active || t.ready)) out.push(t.id);
    });
    return out;
  }

  function scheduleNext(delay) {
    if (!__started) return;
    if (__timer) global.clearTimeout(__timer);
    __timer = global.setTimeout(function () {
      evaluate({ fast: true })
        .catch(function () {})
        .then(function () {
          scheduleNext(EVAL_MS);
        });
    }, delay || EVAL_MS);
  }

  function bindEvents() {
    var kick = function () {
      evaluate({ fast: true, force: true }).catch(function () {});
    };
    safe(function () {
      global.addEventListener('online', kick);
      global.addEventListener('offline', kick);
      global.addEventListener('crozzo-lan-up', kick);
      global.addEventListener('crozzo-tier-changed', kick);
      global.addEventListener('crozzo-connectivity-director-changed', kick);
      global.addEventListener('crozzo-supabase-config-saved', kick);
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', function () {
          if (!document.hidden) kick();
        });
      }
    });
  }

  function start() {
    if (__started) return;
    __started = true;
    bindEvents();
    evaluate({ force: true })
      .catch(function () {})
      .then(function () {
        scheduleNext(EVAL_FAST_MS);
      });
  }

  function stop() {
    __started = false;
    if (__timer) {
      global.clearTimeout(__timer);
      __timer = null;
    }
  }

  global.CrozzoCapabilityMatrix = {
    PATHS: PATHS.slice(),
    probePlatform: probePlatform,
    probeTransports: probeTransports,
    resolveHub: resolveHub,
    buildPathPlan: buildPathPlan,
    shouldFunnelCloudThroughHub: shouldFunnelCloudThroughHub,
    evaluate: evaluate,
    getSnapshot: getSnapshot,
    getHumanMatrix: getHumanMatrix,
    pickActiveTransports: pickActiveTransports,
    start: start,
    stop: stop,
  };

  global.crozzoCapabilitySnapshot = getSnapshot;
  global.crozzoShouldFunnelCloudThroughHub = function () {
    return shouldFunnelCloudThroughHub();
  };
})(typeof window !== 'undefined' ? window : globalThis);
