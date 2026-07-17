/**
 * Crozzo — Estado operativo de comunicación compartido entre equipos.
 *
 * Cada dispositivo publica un snapshot compacto (tier, canales, usuario, pantalla)
 * al roster nube y por gossip LAN. Cualquier equipo puede armar un reporte
 * consolidado de toda la flota sin re-escanear QR.
 */
(function (global) {
  'use strict';

  var LS_LAST_PUBLISH = 'crozzo_fleet_comm_publish_at_v1';
  var PUBLISH_MIN_MS = 180000;
  var PUBLISH_FORCE_MIN_MS = 15000;
  var STATE_MAX_AGE_MS = 3600000;

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

  function selfDeviceId() {
    return safe(function () {
      return String(
        (typeof global.ensureCrozzoDeviceId === 'function' && global.ensureCrozzoDeviceId()) ||
          md().deviceId ||
          global.localStorage.getItem('crozzo_device_id') ||
          ''
      ).trim();
    }, '');
  }

  function captureLocalCommState() {
    var cfg = md();
    var tier = String(global.__CROZZO_TIER_LAST || 'offline');
    var cloudReady = safe(function () {
      return typeof global.crozzoOnlineConfigReady === 'function' && global.crozzoOnlineConfigReady();
    }, false);
    var lanUp = safe(function () {
      return typeof global.crozzoIsLocalLanSegmentUp === 'function' && global.crozzoIsLocalLanSegmentUp();
    }, false);
    var rtRun = safe(function () {
      return typeof global.crozzoRuntimeRealtimeStatus === 'function' ? global.crozzoRuntimeRealtimeStatus() : null;
    }, null);
    var rtCom = safe(function () {
      return typeof global.crozzoComandaRealtimeStatus === 'function' ? global.crozzoComandaRealtimeStatus() : null;
    }, null);
    var page = safe(function () {
      return global.CrozzoPageCloudWatch && global.CrozzoPageCloudWatch.getActivePage
        ? String(global.CrozzoPageCloudWatch.getActivePage() || '')
        : '';
    }, '');
    var u = safe(function () {
      return typeof global.getCurrentUser === 'function' ? global.getCurrentUser() : null;
    }, null);
    var userName = u ? String(u.nombre || u.usuario || u.name || u.email || '').trim() : '';
    /* D-011: Rol B = IP propia (nunca centralIp). Rol A = IP LAN de caja. */
    var lanIp = '';
    if (cfg.role === 'A') {
      lanIp = safe(function () {
        return String(global.localStorage.getItem('crozzo_wifi_zone_last_ip') || '').trim();
      }, '');
      if (!lanIp || lanIp === '127.0.0.1') {
        lanIp = safe(function () {
          return String(global.localStorage.getItem('crozzo_own_lan_ip_v1') || '127.0.0.1').trim();
        }, '127.0.0.1');
      }
    } else {
      lanIp = safe(function () {
        return String(global.localStorage.getItem('crozzo_own_lan_ip_v1') || '').trim();
      }, '');
      if (!lanIp && global.CrozzoPeerDirectory && typeof global.CrozzoPeerDirectory.buildIdentityCard === 'function') {
        try {
          var card = global.CrozzoPeerDirectory.buildIdentityCard();
          lanIp = String((card && card.lanIp) || '').trim();
        } catch (_) {}
      }
    }
    var channels = {
      cloud: cloudReady && (tier === 'cloud' || tier === 'lan'),
      lan: lanUp,
      realtime: !!(rtRun && rtRun.live && rtCom && rtCom.live),
      gossip: safe(function () {
        var st = global.CrozzoOfflineGossip && global.CrozzoOfflineGossip.getStatus ? global.CrozzoOfflineGossip.getStatus() : null;
        return !!(st && st.active && st.peerCount > 0);
      }, false),
      ble: safe(function () {
        var st = global.CrozzoBleMesh && global.CrozzoBleMesh.getStatus ? global.CrozzoBleMesh.getStatus() : null;
        return !!(st && st.active && st.peerCount > 0);
      }, false),
    };
    var okCount = 0;
    Object.keys(channels).forEach(function (k) {
      if (channels[k]) okCount++;
    });
    var overall = okCount >= 2 || (channels.cloud && channels.lan) ? 'ok' : okCount >= 1 ? 'warn' : 'fail';
    return {
      v: 1,
      at: Date.now(),
      deviceId: selfDeviceId(),
      role: cfg.role === 'B' ? 'B' : 'A',
      tier: tier,
      userName: userName,
      page: page,
      lanIp: lanIp,
      channels: channels,
      overall: overall,
    };
  }

  function ingestRemoteCommState(payload, via) {
    if (!payload || !payload.deviceId) return false;
    var cs = payload.commState || payload;
    if (!cs || !cs.at) return false;
    if (global.CrozzoPeerDirectory && typeof global.CrozzoPeerDirectory.notePeer === 'function') {
      global.CrozzoPeerDirectory.notePeer({
        deviceId: String(payload.deviceId).trim(),
        businessId: payload.businessId,
        locationId: payload.locationId,
        role: payload.role,
        name: payload.name,
        lanIp: payload.lanIp || cs.lanIp,
        cloudOk: payload.cloudOk !== false,
        commState: cs,
        commStateAt: Number(cs.at) || Date.now(),
        via: via || 'fleet_comm',
      });
      return true;
    }
    return false;
  }

  function publishGossipCommState(state) {
    if (!state || !global.CrozzoOfflineGossip) return false;
    if (typeof global.CrozzoOfflineGossip.publishPeerCommState === 'function') {
      return global.CrozzoOfflineGossip.publishPeerCommState(state);
    }
    return false;
  }

  async function publishFleetCommState(opts) {
    opts = opts || {};
    var now = Date.now();
    var last = Number(safe(function () {
      return global.localStorage.getItem(LS_LAST_PUBLISH);
    }, 0) || 0);
    var minMs = opts.force ? PUBLISH_FORCE_MIN_MS : PUBLISH_MIN_MS;
    if (!opts.force && last && now - last < minMs) return { ok: true, skipped: 'throttle' };

    var state = captureLocalCommState();
    if (!state.deviceId) return { ok: false, reason: 'no_device_id' };

    var out = { ok: false, cloud: false, gossip: false, state: state };

    if (global.CrozzoPeerDirectory && typeof global.CrozzoPeerDirectory.publishPresenceToCloud === 'function' && global.__SUPABASE) {
      try {
        var u = safe(function () {
          return typeof global.getCurrentUser === 'function' ? global.getCurrentUser() : null;
        }, null);
        var name = u ? String(u.nombre || u.usuario || '').trim() : '';
        out.cloud = !!(await global.CrozzoPeerDirectory.publishPresenceToCloud(global.__SUPABASE, {
          force: !!opts.force,
          fleetPulse: true,
          name: name,
          commState: state,
        }));
      } catch (_) {}
    }

    out.gossip = publishGossipCommState(state);
    out.ok = out.cloud || out.gossip || !!opts.localOnly;

    safe(function () {
      global.localStorage.setItem(LS_LAST_PUBLISH, String(now));
    });

    if (global.CrozzoPeerDirectory && typeof global.CrozzoPeerDirectory.noteSelf === 'function') {
      global.CrozzoPeerDirectory.noteSelf({
        cloudOk: out.cloud,
        commState: state,
        commStateAt: state.at,
        via: 'fleet_publish',
      });
    }

    return out;
  }

  function listFleetCommStates(opts) {
    opts = opts || {};
    var maxAge = Number(opts.maxAgeMs) > 0 ? Number(opts.maxAgeMs) : STATE_MAX_AGE_MS;
    var now = Date.now();
    var rows = safe(function () {
      return global.CrozzoPeerDirectory && global.CrozzoPeerDirectory.listPeers ? global.CrozzoPeerDirectory.listPeers() : [];
    }, []);
    return rows
      .filter(function (p) {
        return p && p.commState && p.commStateAt && now - Number(p.commStateAt) <= maxAge;
      })
      .map(function (p) {
        return {
          deviceId: p.deviceId,
          name: p.name,
          role: p.role,
          lanIp: p.lanIp,
          commState: p.commState,
          commStateAt: p.commStateAt,
          via: p.via,
        };
      })
      .sort(function (a, b) {
        return (Number(b.commStateAt) || 0) - (Number(a.commStateAt) || 0);
      });
  }

  async function buildFleetCommReport(opts) {
    opts = opts || {};
    await publishFleetCommState({ force: !!opts.force });
    if (global.CrozzoPeerDirectory && typeof global.CrozzoPeerDirectory.pullPresenceFromCloud === 'function') {
      try {
        await global.CrozzoPeerDirectory.pullPresenceFromCloud({ force: true });
      } catch (_) {}
    }
    var vis = null;
    if (global.CrozzoConnectivityVisibilityProbe && typeof global.CrozzoConnectivityVisibilityProbe.probeAll === 'function') {
      vis = await global.CrozzoConnectivityVisibilityProbe.probeAll({
        force: true,
        activeLan: true,
        bootstrap: true,
      });
    }
    var fleetStates = listFleetCommStates();
    return {
      generatedAt: new Date().toISOString(),
      self: captureLocalCommState(),
      fleetStates: fleetStates,
      devices: vis && vis.devices ? vis.devices : [],
      hiddenStaleCount: vis && vis.deviceMatrix ? vis.deviceMatrix.hiddenStaleCount : 0,
      channels: vis && vis.channels ? vis.channels : null,
      summary: {
        devicesLive: vis && vis.devices ? vis.devices.length : 0,
        fleetStatesShared: fleetStates.length,
        verdict:
          fleetStates.length >= 2
            ? 'La flota comparte estados — reporte consolidado disponible.'
            : fleetStates.length === 1
              ? 'Solo este equipo reportó estado reciente — encienda más equipos en la misma sede.'
              : 'Sin estados compartidos recientes — pulse Reparar y espere sincronización.',
      },
    };
  }

  function afterMainInit() {
    global.setTimeout(function () {
      publishFleetCommState({ localOnly: true }).catch(function () {});
    }, 8000);
    global.setInterval(function () {
      publishFleetCommState().catch(function () {});
    }, PUBLISH_MIN_MS);
  }

  global.crozzoCaptureLocalCommState = captureLocalCommState;
  global.crozzoPublishFleetCommState = publishFleetCommState;
  global.crozzoIngestRemoteCommState = ingestRemoteCommState;
  global.crozzoListFleetCommStates = listFleetCommStates;
  global.crozzoBuildFleetCommReport = buildFleetCommReport;
  global.CrozzoFleetCommState = {
    captureLocal: captureLocalCommState,
    publish: publishFleetCommState,
    ingest: ingestRemoteCommState,
    list: listFleetCommStates,
    buildReport: buildFleetCommReport,
    afterMainInit: afterMainInit,
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('crozzo-tier-changed', function () {
      publishFleetCommState({ force: true }).catch(function () {});
    });
    global.addEventListener('crozzo-login-success', function () {
      publishFleetCommState({ force: true }).catch(function () {});
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
