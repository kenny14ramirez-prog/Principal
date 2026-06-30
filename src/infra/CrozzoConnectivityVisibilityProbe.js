/**
 * Crozzo — Sonda de visibilidad entre equipos por canal de comunicación.
 *
 * Responde: ¿este dispositivo VE a otros? en nube, LAN, zona Wi‑Fi, gossip y BLE.
 * Usado por Diagnóstico (Ctrl+Alt+D) y Pruebas de sistema.
 */
(function (global) {
  'use strict';

  var RECENT_MS = 3600000; // 1 h = "visible recientemente"
  var LAN_LIVE_MS = 900000; // 15 min = LAN reciente
  var QR_LIVE_MS = RECENT_MS;
  var CLOUD_ROSTER_MAX_AGE_MS = 86400000; // 24 h — no indexar basura antigua en directorio

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

  function ageLabel(ms) {
    if (!ms || ms < 0) return 'sin actividad';
    var s = Math.round(ms / 1000);
    if (s < 60) return 'hace ' + s + 's';
    if (s < 3600) return 'hace ' + Math.round(s / 60) + 'min';
    return 'hace ' + Math.round(s / 3600) + 'h';
  }

  function peerLabel(p) {
    if (!p) return '?';
    var name = String(p.name || p.deviceName || '').trim();
    var id = String(p.deviceId || p.id || '').trim();
    var role = p.role === 'A' ? 'caja' : p.role === 'B' ? 'tablet' : String(p.role || '');
    return (name || id || 'equipo') + (role ? ' (' + role + ')' : '');
  }

  async function fetchHealth(ip, port, timeoutMs) {
    ip = String(ip || '').trim();
    if (!ip) return false;
    port = Number(port) || 3000;
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller
      ? global.setTimeout(function () {
          controller.abort();
        }, timeoutMs || 1400)
      : null;
    try {
      var res = await global.fetch('http://' + ip + ':' + port + '/health', {
        method: 'GET',
        signal: controller ? controller.signal : undefined,
        headers: { Accept: 'application/json' },
      });
      if (timer) global.clearTimeout(timer);
      return !!(res && res.ok);
    } catch (_) {
      if (timer) global.clearTimeout(timer);
      return false;
    }
  }

  function recentPeers(filterFn) {
    var now = Date.now();
    var rows = safe(function () {
      return global.CrozzoPeerDirectory && global.CrozzoPeerDirectory.listPeers
        ? global.CrozzoPeerDirectory.listPeers()
        : [];
    }, []);
    var selfId = selfDeviceId();
    return rows.filter(function (p) {
      if (!p) return false;
      if (selfId && String(p.deviceId || '') === selfId) return false;
      var seen = Number(p.lastSeenAt) || Number(p.lastLanOkAt) || Number(p.lastCloudOkAt) || 0;
      if (now - seen > RECENT_MS) return false;
      return filterFn ? filterFn(p) : true;
    });
  }

  async function probeCloud(opts) {
    opts = opts || {};
    var detail = '';
    var peers = [];
    var ready = safe(function () {
      return typeof global.crozzoOnlineConfigReady === 'function' && global.crozzoOnlineConfigReady();
    }, false);

    if (global.CrozzoPeerDirectory && typeof global.CrozzoPeerDirectory.pullPresenceFromCloud === 'function') {
      try {
        var pull = await global.CrozzoPeerDirectory.pullPresenceFromCloud({ force: !!opts.force });
        if (pull && pull.merged) detail = 'Roster nube: ' + pull.merged + ' registro(s) actualizado(s). ';
      } catch (_) {}
    }

    peers = recentPeers(function (p) {
      return !!(p.cloudOk || p.lastCloudOkAt);
    });

    var status = peers.length ? 'ok' : ready ? 'warn' : 'fail';
    if (!peers.length && ready) {
      detail += 'Nube activa pero aún no hay otros equipos en el directorio (¿solo este dispositivo online?).';
    } else if (!ready) {
      detail += 'Sin nube — visibilidad por Supabase no disponible.';
    } else {
      detail +=
        peers
          .slice(0, 6)
          .map(function (p) {
            return peerLabel(p) + ' · ' + ageLabel(Date.now() - (Number(p.lastCloudOkAt) || Number(p.lastSeenAt) || 0));
          })
          .join(' · ') + (peers.length > 6 ? ' · +' + (peers.length - 6) + ' más' : '');
    }

    return { id: 'cloud', label: 'Nube (Supabase)', status: status, peerCount: peers.length, peers: peers, detail: detail.trim() };
  }

  async function probeLan(opts) {
    opts = opts || {};
    var cfg = md();
    var port = Number(cfg.port) || 3000;
    var reachable = [];
    var candidates = safe(function () {
      return global.CrozzoPeerDirectory && global.CrozzoPeerDirectory.getCentralCandidates
        ? global.CrozzoPeerDirectory.getCentralCandidates()
        : [];
    }, []);

    if (opts.activeLan !== false) {
      for (var i = 0; i < candidates.length && i < 5; i++) {
        var c = candidates[i];
        /* eslint-disable no-await-in-loop */
        var ok = await fetchHealth(c.ip, port, 1500);
        if (ok) {
          reachable.push({ ip: c.ip, via: c.via || 'probe', meta: c.meta || null });
          if (global.CrozzoPeerDirectory && typeof global.CrozzoPeerDirectory.noteLanReachable === 'function') {
            global.CrozzoPeerDirectory.noteLanReachable(c.ip, 'visibility_probe', null);
          }
        }
      }
    }

    var memPeers = recentPeers(function (p) {
      return !!(p.lanIp && (p.lastLanOkAt || p.role === 'A'));
    });

    var director = safe(function () {
      return global.CrozzoConnectivityDirector && global.CrozzoConnectivityDirector.getState
        ? global.CrozzoConnectivityDirector.getState()
        : null;
    }, null);

    var segmentUp =
      typeof global.crozzoIsLocalLanSegmentUp === 'function' && global.crozzoIsLocalLanSegmentUp();
    var peerCount = Math.max(reachable.length, memPeers.length);
    var status = reachable.length ? 'ok' : segmentUp || (director && director.selfLan) ? 'warn' : memPeers.length ? 'warn' : 'fail';

    var detailParts = [];
    if (reachable.length) {
      detailParts.push(
        'Caja alcanzable: ' +
          reachable
            .map(function (r) {
              return r.ip + ' (' + r.via + ')';
            })
            .join(', ')
      );
    }
    if (memPeers.length) {
      detailParts.push(
        'En memoria LAN: ' +
          memPeers
            .slice(0, 5)
            .map(function (p) {
              return peerLabel(p) + (p.lanIp ? '@' + p.lanIp : '');
            })
            .join(' · ')
      );
    }
    if (director && director.anchorIp && !reachable.length) {
      detailParts.push('Ancla configurada ' + director.anchorIp + ' sin respuesta /health.');
    }
    if (!detailParts.length) {
      detailParts.push(
        segmentUp
          ? 'Segmento LAN activo pero sin caja detectada — verifique IP central o escanee QR.'
          : 'Sin respuesta LAN — conecte a la misma red que la caja.'
      );
    }

    return {
      id: 'lan',
      label: 'LAN local (:3000)',
      status: status,
      peerCount: peerCount,
      reachable: reachable,
      peers: memPeers,
      detail: detailParts.join(' · '),
    };
  }

  function probeHotspot() {
    var lastIp = safe(function () {
      return String(global.localStorage.getItem('crozzo_wifi_zone_last_ip') || '').trim();
    }, '');
    var director = safe(function () {
      return global.CrozzoConnectivityDirector && global.CrozzoConnectivityDirector.getState
        ? global.CrozzoConnectivityDirector.getState()
        : null;
    }, null);
    var orch = safe(function () {
      return global.CrozzoConnectivityOrchestrator && global.CrozzoConnectivityOrchestrator.getState
        ? global.CrozzoConnectivityOrchestrator.getState()
        : null;
    }, null);
    var hotspotActive = !!(orch && orch.transports && orch.transports.hotspot);
    var anchorIp = (director && director.anchorIp) || lastIp || String(md().centralIp || '').trim();
    var status = hotspotActive && anchorIp ? 'ok' : anchorIp ? 'warn' : 'fail';
    var detail =
      hotspotActive && anchorIp
        ? 'Zona Wi‑Fi caja activa · última IP conocida ' + anchorIp
        : anchorIp
          ? 'Última IP zona Wi‑Fi: ' + anchorIp + (hotspotActive ? '' : ' · hotspot no desplegado aún')
          : 'Sin IP de zona Wi‑Fi — la caja aún no publicó su red o no se ha conectado.';
    return { id: 'hotspot', label: 'Zona Wi‑Fi caja (hotspot)', status: status, peerCount: anchorIp ? 1 : 0, anchorIp: anchorIp, detail: detail };
  }

  function probeGossip(opts) {
    opts = opts || {};
    if (opts.bootstrap && global.CrozzoOfflineGossip && typeof global.CrozzoOfflineGossip.bootstrapCluster === 'function') {
      global.CrozzoOfflineGossip.bootstrapCluster();
    }
    if (global.CrozzoOfflineGossip && typeof global.CrozzoOfflineGossip.reconcileTier === 'function') {
      global.CrozzoOfflineGossip.reconcileTier();
    }
    var st = safe(function () {
      return global.CrozzoOfflineGossip && global.CrozzoOfflineGossip.getStatus
        ? global.CrozzoOfflineGossip.getStatus()
        : null;
    }, null);
    var peerCount = (st && st.peerCount) || 0;
    var active = !!(st && st.active);
    var tier = String(global.__CROZZO_TIER_LAST || 'offline');
    var hybridUp =
      tier === 'cloud' ||
      tier === 'lan' ||
      (typeof global.crozzoIsLocalLanSegmentUp === 'function' && global.crozzoIsLocalLanSegmentUp());
    var status = peerCount > 0 ? 'ok' : active ? 'warn' : hybridUp ? 'na' : 'fail';
    var detail = active
      ? 'Malla gossip ' +
        (st.transport || 'activa') +
        ' · ' +
        peerCount +
        ' peer(s)' +
        (peerCount ? '' : ' — escuchando (conecte más tablets a la misma Wi‑Fi)')
      : 'Gossip inactivo — normal si hay nube o LAN; en offline puro debe activarse solo.';
    return { id: 'gossip', label: 'Malla gossip (Wi‑Fi sin internet)', status: status, peerCount: peerCount, active: active, transport: (st && st.transport) || 'none', detail: detail };
  }

  function probeBle() {
    var st = safe(function () {
      return global.CrozzoBleMesh && global.CrozzoBleMesh.getStatus ? global.CrozzoBleMesh.getStatus() : null;
    }, null);
    var peerCount = (st && st.peerCount) || 0;
    var active = !!(st && st.active);
    var capable = safe(function () {
      return global.CrozzoBleMesh && global.CrozzoBleMesh.webBtCapable && global.CrozzoBleMesh.webBtCapable();
    }, false);
    var status = peerCount > 0 ? 'ok' : active ? 'warn' : capable ? 'warn' : 'fail';
    var detail = active
      ? 'BLE mesh ' + (st.transport || 'activo') + ' · ' + peerCount + ' peer(s)'
      : capable
        ? 'Bluetooth disponible pero malla aún sin peers — acerque tablets y active BT.'
        : 'Bluetooth mesh no activo en este equipo (normal en PC sin BT o sin permiso).';
    return { id: 'ble', label: 'Bluetooth mesh', status: status, peerCount: peerCount, active: active, detail: detail };
  }

  function probeQr() {
    var count = safe(function () {
      return global.CrozzoInternalQrRegistry && global.CrozzoInternalQrRegistry.getPeerCount
        ? global.CrozzoInternalQrRegistry.getPeerCount()
        : 0;
    }, 0);
    var emergency = safe(function () {
      return global.CrozzoInternalQrRegistry && global.CrozzoInternalQrRegistry.isEmergencyActive
        ? global.CrozzoInternalQrRegistry.isEmergencyActive()
        : false;
    }, false);
    var status = count > 0 ? 'ok' : emergency ? 'warn' : 'warn';
    var detail =
      count > 0
        ? count + ' slot(s) QR de peers conocidos en catálogo interno.'
        : emergency
          ? 'Modo QR emergencia activo — buscando peers por catálogo/malla.'
          : 'Sin slots QR de peers aún (reserva / último recurso).';
    return { id: 'qr', label: 'QR interno (emparejamiento)', status: status, peerCount: count, detail: detail };
  }

  async function fetchLanStatus(ip, port, timeoutMs) {
    ip = String(ip || '').trim();
    if (!ip) return null;
    port = Number(port) || 3000;
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller
      ? global.setTimeout(function () {
          controller.abort();
        }, timeoutMs || 1600)
      : null;
    try {
      var res = await global.fetch('http://' + ip + ':' + port + '/status', {
        method: 'GET',
        signal: controller ? controller.signal : undefined,
        headers: { Accept: 'application/json' },
      });
      if (timer) global.clearTimeout(timer);
      if (!res || !res.ok) return null;
      return await res.json().catch(function () {
        return null;
      });
    } catch (_) {
      if (timer) global.clearTimeout(timer);
      return null;
    }
  }

  function freshAt(ts, windowMs) {
    var t = Number(ts) || 0;
    if (!t) return false;
    return Date.now() - t <= (Number(windowMs) > 0 ? Number(windowMs) : RECENT_MS);
  }

  function chan(status, detail) {
    return { status: status, detail: String(detail || '').trim() };
  }

  function roleLabel(role) {
    return role === 'A' ? 'Central' : role === 'B' ? 'Tablet' : role ? String(role) : '—';
  }

  function resolveSelfLanIp() {
    var cfg = md();
    if (cfg.role === 'A') {
      return safe(function () {
        return String(global.localStorage.getItem('crozzo_wifi_zone_last_ip') || '127.0.0.1').trim();
      }, '127.0.0.1');
    }
    return String(cfg.centralIp || cfg.serverIp || '').trim();
  }

  function selfUserName() {
    return safe(function () {
      var u = typeof global.getCurrentUser === 'function' ? global.getCurrentUser() : null;
      if (!u) return '';
      return String(u.nombre || u.usuario || u.name || u.email || '').trim();
    }, '');
  }

  function dirPeerById(allPeers, id) {
    id = String(id || '').trim();
    for (var i = 0; i < allPeers.length; i++) {
      if (String(allPeers[i].deviceId || '') === id) return allPeers[i];
    }
    return null;
  }

  function isPseudoCentralId(id) {
    return String(id || '').indexOf('central-') === 0;
  }

  function preferDeviceIdScore(id) {
    id = String(id || '');
    if (isPseudoCentralId(id)) return 0;
    if (/^DEV-/i.test(id)) return 30;
    return 10;
  }

  function peerRelevantForMatrix(p) {
    if (!p || !p.deviceId) return false;
    if (isPseudoCentralId(p.deviceId)) return true;
    return (
      freshAt(p.lastSeenAt, RECENT_MS) ||
      freshAt(p.lastCloudOkAt, RECENT_MS) ||
      freshAt(p.lastLanOkAt, LAN_LIVE_MS)
    );
  }

  function applyReportedCommState(d, peer) {
    if (!d || !peer || !peer.commState || !freshAt(peer.commStateAt, RECENT_MS)) return;
    var cs = peer.commState;
    d.reportedByPeer = true;
    d.reportedAt = peer.commStateAt;
    if (cs.userName && !d.userName) d.userName = cs.userName;
    if (cs.role && !d.isSelf) d.role = cs.role === 'B' ? 'B' : 'A';
    if (cs.lanIp && cs.role === 'B') d.ip = String(cs.lanIp).trim() || d.ip;
    var rep = cs.channels || {};
    if (rep.cloud && !d.isSelf) {
      d.channels.cloud = chan('ok', 'Estado reportado · nube · ' + ageLabel(Date.now() - (Number(cs.at) || 0)));
    }
    if (rep.lan) {
      d.channels.lan = chan('ok', 'Estado reportado · LAN activa en el equipo');
    }
    if (rep.realtime) {
      d.channels.gossip = d.channels.gossip || chan('na', '');
      d.reportedRealtime = true;
    }
    if (cs.page) d.reportedPage = cs.page;
    if (cs.tier) d.reportedTier = cs.tier;
    if (cs.overall === 'ok' && d.overall !== 'ok') d.overall = 'ok';
  }

  function isMatrixDeviceLive(d, peer, qr) {
    if (!d) return false;
    if (d.isSelf) return true;
    if (peer && peer.commStateAt && freshAt(peer.commStateAt, RECENT_MS)) return true;
    var ch = d.channels || {};
    if (ch.cloud && ch.cloud.status === 'ok') return true;
    if (ch.lan && ch.lan.status === 'ok') return true;
    if (ch.hotspot && ch.hotspot.status === 'ok') return true;
    if (ch.gossip && ch.gossip.status === 'ok') return true;
    if (ch.ble && ch.ble.status === 'ok') return true;
    if (ch.qr && ch.qr.status === 'ok') return true;
    if (peer && freshAt(peer.lastSeenAt, RECENT_MS)) return true;
    if (peer && freshAt(peer.lastCloudOkAt, RECENT_MS)) return true;
    if (peer && freshAt(peer.lastLanOkAt, LAN_LIVE_MS)) return true;
    if (qr && qr.bestSlot && freshAt(qr.bestSlot.builtAt, QR_LIVE_MS)) return true;
    return false;
  }

  function consolidateMatrixDevices(devices, ctx) {
    ctx = ctx || {};
    var hidden = 0;
    var live = [];
    var selfIp = String(ctx.selfIp || '').trim();
    var peerById = ctx.peerById || {};

    devices.forEach(function (d) {
      var peer = peerById[d.deviceId];
      var qr = ctx.qrById && ctx.qrById[d.deviceId];
      if (!isMatrixDeviceLive(d, peer, qr)) {
        hidden++;
        return;
      }
      live.push(d);
    });

    var realCentralByIp = {};
    live.forEach(function (d) {
      if (d.role === 'A' && d.ip && !isPseudoCentralId(d.deviceId)) {
        var prev = realCentralByIp[d.ip];
        if (!prev || preferDeviceIdScore(d.deviceId) > preferDeviceIdScore(prev)) {
          realCentralByIp[d.ip] = d.deviceId;
        }
      }
    });

    live = live.filter(function (d) {
      if (isPseudoCentralId(d.deviceId)) {
        var ip = d.deviceId.slice(8);
        if (realCentralByIp[ip]) {
          hidden++;
          return false;
        }
      }
      if (!d.isSelf && selfIp && d.ip === selfIp && d.role === 'A') {
        var hasSelf = live.some(function (x) {
          return x.isSelf;
        });
        if (hasSelf) {
          hidden++;
          return false;
        }
      }
      return true;
    });

    return { devices: live, hiddenStaleCount: hidden };
  }

  function computeDeviceOverall(channels) {
    channels = channels || {};
    var keys = ['cloud', 'lan', 'hotspot', 'gossip', 'ble', 'qr'];
    var ok = 0;
    var warn = 0;
    var fail = 0;
    keys.forEach(function (k) {
      var st = channels[k] && channels[k].status;
      if (st === 'ok') ok++;
      else if (st === 'warn') warn++;
      else if (st === 'fail') fail++;
    });
    if (ok >= 2 || (ok >= 1 && (channels.cloud && channels.cloud.status === 'ok'))) return 'ok';
    if (ok >= 1 || warn >= 2) return 'warn';
    if (fail >= 3 && !ok) return 'fail';
    return warn ? 'warn' : 'fail';
  }

  /**
   * Matriz por dispositivo: usuario, ID, IP y estado por canal (nube, LAN, Wi‑Fi, gossip, BT, QR).
   * Consolida CrozzoPeerDirectory (roster nube), LAN /status, BLE, QR y gossip.
   */
  async function buildDeviceMatrix(opts) {
    opts = opts || {};
    var cfg = md();
    var port = Number(cfg.port) || 3000;
    var selfId = selfDeviceId();
    var map = {};
    var lanReach = {};
    var gossipActive = false;
    var gossipPeerIds = {};
    var anchorIp = '';
    var hotspotActive = false;

    function upsert(id, patch) {
      id = String(id || '').trim();
      if (!id) return null;
      var cur =
        map[id] ||
        ({
          deviceId: id,
          name: '',
          userName: '',
          role: '',
          ip: '',
          locationId: String(cfg.locationId || '').trim(),
          isSelf: id === selfId,
          sources: [],
          channels: {
            cloud: chan('fail', 'Sin señal en roster nube'),
            lan: chan('fail', 'Sin respuesta LAN'),
            hotspot: chan('na', 'Sin dato zona Wi‑Fi'),
            gossip: chan('na', 'Malla gossip apagada o sin dato'),
            ble: chan('fail', 'Sin señal Bluetooth'),
            qr: chan('fail', 'Sin slot QR / emparejamiento'),
          },
        });
      patch = patch || {};
      if (patch.name) cur.name = String(patch.name).trim();
      if (patch.userName) cur.userName = String(patch.userName).trim();
      if (patch.role) cur.role = patch.role === 'B' ? 'B' : patch.role === 'A' ? 'A' : String(patch.role);
      if (patch.ip) cur.ip = String(patch.ip).trim();
      if (patch.locationId) cur.locationId = String(patch.locationId).trim();
      if (patch.isSelf) cur.isSelf = true;
      if (patch.source) {
        cur.sources.push(String(patch.source));
        cur.sources = cur.sources.filter(function (v, idx, arr) {
          return arr.indexOf(v) === idx;
        }).slice(0, 8);
      }
      map[id] = cur;
      return cur;
    }

    upsert(selfId, {
      isSelf: true,
      name: selfUserName() || 'Este equipo',
      userName: selfUserName(),
      role: cfg.role === 'B' ? 'B' : 'A',
      ip: resolveSelfLanIp(),
      source: 'self',
    });

    if (global.CrozzoPeerDirectory && typeof global.CrozzoPeerDirectory.pullPresenceFromCloud === 'function') {
      try {
        await global.CrozzoPeerDirectory.pullPresenceFromCloud({ force: !!opts.force });
      } catch (_) {}
    }

    var allDirPeers = safe(function () {
      return global.CrozzoPeerDirectory && global.CrozzoPeerDirectory.listPeers
        ? global.CrozzoPeerDirectory.listPeers()
        : [];
    }, []);

    allDirPeers.forEach(function (p) {
      if (!p || !p.deviceId) return;
      if (!peerRelevantForMatrix(p)) return;
      if (isPseudoCentralId(p.deviceId)) {
        upsert(p.deviceId, {
          name: p.name || 'Caja LAN',
          role: 'A',
          ip: p.lanIp || String(p.deviceId).slice(8),
          source: 'peer_dir_central',
        });
        return;
      }
      upsert(p.deviceId, {
        name: p.name,
        role: p.role,
        ip: p.lanIp,
        locationId: p.locationId,
        source: 'peer_directory',
      });
    });

    var bleById = {};
    safe(function () {
      if (!global.CrozzoBlePeerRegistry || typeof global.CrozzoBlePeerRegistry.getPeers !== 'function') return;
      global.CrozzoBlePeerRegistry.getPeers({ maxAgeMs: RECENT_MS }).forEach(function (p) {
        if (!p || !p.deviceId) return;
        bleById[p.deviceId] = p;
        upsert(p.deviceId, {
          name: p.btDisplayName || p.deviceName,
          userName: p.userName,
          role: p.deviceRole,
          source: 'ble_registry',
        });
      });
    });

    var qrById = {};
    safe(function () {
      if (!global.CrozzoInternalQrRegistry || typeof global.CrozzoInternalQrRegistry.getValidPeers !== 'function') return;
      global.CrozzoInternalQrRegistry.getValidPeers().forEach(function (p) {
        if (!p || !p.deviceId) return;
        if (!p.bestSlot || !freshAt(p.bestSlot.builtAt, QR_LIVE_MS)) return;
        qrById[p.deviceId] = p;
        var ip = p.bestSlot && p.bestSlot.ip ? String(p.bestSlot.ip).trim() : '';
        upsert(p.deviceId, {
          name: p.deviceName,
          role: p.deviceRole === 'B' ? 'B' : p.deviceRole === 'A' ? 'A' : '',
          ip: ip,
          source: 'qr_registry',
        });
      });
    });

    safe(function () {
      if (!global.CrozzoOfflineGossip) return;
      if (opts.bootstrap && typeof global.CrozzoOfflineGossip.bootstrapCluster === 'function') {
        global.CrozzoOfflineGossip.bootstrapCluster();
      }
      if (typeof global.CrozzoOfflineGossip.reconcileTier === 'function') {
        global.CrozzoOfflineGossip.reconcileTier();
      }
      var gst = global.CrozzoOfflineGossip.getStatus ? global.CrozzoOfflineGossip.getStatus() : null;
      gossipActive = !!(gst && gst.active);
      if (typeof global.CrozzoOfflineGossip.listRecentPeers === 'function') {
        global.CrozzoOfflineGossip.listRecentPeers(RECENT_MS).forEach(function (p) {
          if (!p || !p.deviceId) return;
          gossipPeerIds[p.deviceId] = p.lastSeenAt;
          upsert(p.deviceId, { source: 'gossip_live' });
        });
      }
    });

    var chHotspot = opts.channels && opts.channels.hotspot;
    var chLan = opts.channels && opts.channels.lan;
    anchorIp =
      (chHotspot && chHotspot.anchorIp) ||
      safe(function () {
        return String(global.localStorage.getItem('crozzo_wifi_zone_last_ip') || '').trim();
      }, '') ||
      String(cfg.centralIp || '').trim();
    hotspotActive = !!(chHotspot && chHotspot.status === 'ok');

    var orch = safe(function () {
      return global.CrozzoConnectivityOrchestrator && global.CrozzoConnectivityOrchestrator.getState
        ? global.CrozzoConnectivityOrchestrator.getState()
        : null;
    }, null);
    var tier = String(global.__CROZZO_TIER_LAST || 'offline');
    var hybridUp = tier === 'cloud' || tier === 'lan' || !!(orch && orch.transports && (orch.transports.cloud || orch.transports.lan));

    var candidates = safe(function () {
      return global.CrozzoPeerDirectory && global.CrozzoPeerDirectory.getCentralCandidates
        ? global.CrozzoPeerDirectory.getCentralCandidates()
        : [];
    }, []);

    if (opts.activeLan !== false) {
      var seenIp = {};
      var probeList = candidates.slice(0, 6);
      if (chLan && Array.isArray(chLan.reachable)) {
        chLan.reachable.forEach(function (r) {
          if (r && r.ip && !seenIp[r.ip]) {
            seenIp[r.ip] = true;
            probeList.push({ ip: r.ip, via: r.via || 'probe' });
          }
        });
      }
      allDirPeers.forEach(function (p) {
        if (p && p.lanIp && p.role === 'A' && !seenIp[p.lanIp]) {
          seenIp[p.lanIp] = true;
          probeList.push({ ip: p.lanIp, via: 'peer_ip' });
        }
      });
      for (var pi = 0; pi < probeList.length && pi < 8; pi++) {
        var ip = String(probeList[pi].ip || '').trim();
        if (!ip || lanReach[ip]) continue;
        /* eslint-disable no-await-in-loop */
        var healthOk = await fetchHealth(ip, port, 1500);
        var statusJson = healthOk ? await fetchLanStatus(ip, port, 1600) : null;
        lanReach[ip] = { ok: healthOk, status: statusJson, via: probeList[pi].via || 'probe' };
        if (healthOk) {
          if (global.CrozzoPeerDirectory && typeof global.CrozzoPeerDirectory.noteLanReachable === 'function') {
            global.CrozzoPeerDirectory.noteLanReachable(ip, 'device_matrix', statusJson);
          }
          var did =
            statusJson && statusJson.device_id
              ? String(statusJson.device_id).trim()
              : 'central-' + ip;
          upsert(did, {
            name: (statusJson && (statusJson.name || statusJson.device_name)) || '',
            userName: (statusJson && (statusJson.user_name || statusJson.staff_name)) || '',
            role: statusJson && statusJson.role ? statusJson.role : 'A',
            ip: ip,
            locationId: statusJson && statusJson.location_id,
            source: 'lan_status',
          });
        }
      }
    }

    var cloudReady = safe(function () {
      return typeof global.crozzoOnlineConfigReady === 'function' && global.crozzoOnlineConfigReady();
    }, false);

    Object.keys(map).forEach(function (id) {
      var d = map[id];
      var peer = dirPeerById(allDirPeers, id);
      var ip = d.ip || (peer && peer.lanIp) || '';
      var ble = bleById[id];
      var qr = qrById[id];

      if (peer && peer.name && !d.name) d.name = peer.name;
      if (peer && peer.lanIp && !d.ip) d.ip = peer.lanIp;
      if (peer && peer.role && !d.role) d.role = peer.role;
      if (ble && ble.userName && !d.userName) d.userName = ble.userName;
      if (qr && qr.deviceRole && !d.role) d.role = qr.deviceRole === 'B' ? 'B' : qr.deviceRole === 'A' ? 'A' : d.role;
      if (!d.role && /^DEV-/i.test(d.deviceId) && d.isSelf) d.role = cfg.role === 'B' ? 'B' : 'A';

      if (d.isSelf && cloudReady) {
        d.channels.cloud = chan('ok', 'Este equipo publicado / conectado a Supabase');
      } else if (peer && peer.cloudOk && freshAt(peer.lastCloudOkAt || peer.lastSeenAt)) {
        d.channels.cloud = chan(
          'ok',
          'Roster nube · visto ' + ageLabel(Date.now() - (Number(peer.lastCloudOkAt || peer.lastSeenAt) || 0))
        );
      } else if (peer && (peer.cloudOk || peer.lastCloudOkAt)) {
        d.channels.cloud = chan(
          'warn',
          'En roster nube pero inactivo · ' + ageLabel(Date.now() - (Number(peer.lastCloudOkAt || peer.lastSeenAt) || 0))
        );
      } else if (qr) {
        d.channels.cloud = chan('warn', 'Emparejado por QR — confirme presencia en nube');
      } else {
        d.channels.cloud = chan('fail', 'No aparece en roster nube (¿escaneó QR y tiene internet?)');
      }

      if (ip && lanReach[ip] && lanReach[ip].ok) {
        d.channels.lan = chan('ok', 'LAN OK · ' + ip + ':' + port + ' responde /health');
      } else if (peer && peer.lanIp && freshAt(peer.lastLanOkAt)) {
        d.channels.lan = chan('ok', 'LAN reciente @' + peer.lanIp + ' · ' + ageLabel(Date.now() - Number(peer.lastLanOkAt)));
      } else if (peer && peer.lanIp) {
        d.channels.lan = chan('warn', 'IP conocida ' + peer.lanIp + ' sin respuesta /health ahora');
      } else if (ip && id.indexOf('central-') === 0) {
        d.channels.lan = chan('fail', 'Caja ' + ip + ' no responde en LAN');
      } else {
        d.channels.lan = chan('fail', 'Sin señal LAN directa');
      }

      if (ip && anchorIp && ip === anchorIp && (d.role === 'A' || id.indexOf('central-') === 0)) {
        d.channels.hotspot = chan(
          hotspotActive ? 'ok' : 'warn',
          hotspotActive
            ? 'Ancla zona Wi‑Fi activa · ' + anchorIp
            : 'IP zona Wi‑Fi ' + anchorIp + ' · hotspot no desplegado aún'
        );
      } else if (d.role === 'B' && anchorIp && (freshAt(peer && peer.lastLanOkAt) || (ip && lanReach[ip] && lanReach[ip].ok))) {
        d.channels.hotspot = chan('warn', 'Tablet alcanza caja en zona ' + anchorIp + ' vía router/LAN');
      } else if (anchorIp) {
        d.channels.hotspot = chan('na', 'Sin confirmación de zona Wi‑Fi para este equipo');
      } else {
        d.channels.hotspot = chan('na', 'Zona Wi‑Fi caja aún sin IP publicada');
      }

      if (!gossipActive) {
        d.channels.gossip = chan(
          'na',
          hybridUp ? 'Gossip apagado — normal con nube/LAN activos' : 'Gossip inactivo en este tier'
        );
      } else if (gossipPeerIds[id]) {
        d.channels.gossip = chan(
          'ok',
          'Señal gossip · ' + ageLabel(Date.now() - Number(gossipPeerIds[id]))
        );
      } else {
        d.channels.gossip = chan('fail', 'Sin señal gossip reciente (misma subred Wi‑Fi)');
      }

      if (ble && freshAt(ble.lastSeenAt, RECENT_MS)) {
        d.channels.ble = chan(
          'ok',
          'BLE mesh · ' + (ble.btDisplayName || ble.userName || 'peer') + ' · ' + ageLabel(Date.now() - Number(ble.lastSeenAt))
        );
      } else if (ble) {
        d.channels.ble = chan('warn', 'Bluetooth conocido pero sin actividad reciente');
      } else {
        d.channels.ble = chan('fail', 'Sin peer Bluetooth registrado');
      }

      if (qr && qr.bestSlot) {
        if (freshAt(qr.bestSlot.builtAt, QR_LIVE_MS)) {
          d.channels.qr = chan(
            'ok',
            'QR emparejado · slot ' + String(qr.bestSlot.slot || '—') + (qr.bestSlot.ip ? ' · IP ' + qr.bestSlot.ip : '')
          );
        } else {
          d.channels.qr = chan(
            'warn',
            'QR histórico · slot ' + String(qr.bestSlot.slot || '—') + ' · sin actividad en la última hora'
          );
        }
      } else if (qr) {
        d.channels.qr = chan('warn', 'Catálogo QR sin slot vigente');
      } else {
        d.channels.qr = chan('fail', 'No consta en catálogo QR interno');
      }

      d.overall = computeDeviceOverall(d.channels);
      applyReportedCommState(d, peer);
      if (d.reportedByPeer && peer && peer.commState && peer.commState.overall) {
        d.overall =
          peer.commState.overall === 'ok' || d.overall === 'ok'
            ? 'ok'
            : peer.commState.overall === 'warn' || d.overall === 'warn'
              ? 'warn'
              : d.overall;
      }
      d.displayName =
        (d.name || d.userName || (d.isSelf ? 'Este equipo' : 'Equipo')) +
        (d.isSelf ? ' (local)' : d.reportedByPeer ? ' (reportado)' : '') +
        ' · ' +
        roleLabel(d.role);
    });

    var peerById = {};
    allDirPeers.forEach(function (p) {
      if (p && p.deviceId) peerById[p.deviceId] = p;
    });

    var devices = Object.keys(map)
      .map(function (k) {
        return map[k];
      })
      .sort(function (a, b) {
        if (a.isSelf && !b.isSelf) return -1;
        if (b.isSelf && !a.isSelf) return 1;
        if (a.role === 'A' && b.role !== 'A') return -1;
        if (b.role === 'A' && a.role !== 'A') return 1;
        if (a.overall === 'ok' && b.overall !== 'ok') return -1;
        if (b.overall === 'ok' && a.overall !== 'ok') return 1;
        return String(a.displayName || a.deviceId).localeCompare(String(b.displayName || b.deviceId));
      });

    var consolidated = consolidateMatrixDevices(devices, {
      selfIp: resolveSelfLanIp(),
      peerById: peerById,
      qrById: qrById,
    });
    devices = consolidated.devices;

    return {
      at: new Date().toISOString(),
      count: devices.length,
      hiddenStaleCount: consolidated.hiddenStaleCount || 0,
      devices: devices,
    };
  }

  async function probeAll(opts) {
    opts = opts || {};
    if (global.CrozzoConnectivityDirector && typeof global.CrozzoConnectivityDirector.evaluate === 'function') {
      try {
        await global.CrozzoConnectivityDirector.evaluate({ force: !!opts.force });
      } catch (_) {}
    }

    var channels = {
      cloud: await probeCloud(opts),
      lan: await probeLan(opts),
      hotspot: probeHotspot(),
      gossip: probeGossip(opts),
      ble: probeBle(),
      qr: probeQr(),
    };

    var deviceMatrix = await buildDeviceMatrix(
      Object.assign({}, opts, {
        channels: channels,
      })
    );

    var okCount = 0;
    var warnCount = 0;
    Object.keys(channels).forEach(function (k) {
      if (channels[k].status === 'ok') okCount++;
      else if (channels[k].status === 'warn') warnCount++;
    });

    var totalPeers = 0;
    Object.keys(channels).forEach(function (k) {
      totalPeers += Number(channels[k].peerCount) || 0;
    });

    return {
      at: new Date().toISOString(),
      self: {
        deviceId: selfDeviceId(),
        role: md().role === 'B' ? 'B' : 'A',
        locationId: String(md().locationId || 'default'),
        tier: String(global.__CROZZO_TIER_LAST || 'offline'),
      },
      channels: channels,
      devices: deviceMatrix.devices || [],
      deviceMatrix: deviceMatrix,
      summary: {
        channelsOk: okCount,
        channelsWarn: warnCount,
        channelsTotal: Object.keys(channels).length,
        peerSignals: totalPeers,
        verdict:
          okCount >= 2
            ? 'Varios canales ven otros equipos — comunicación probablemente operativa.'
            : okCount === 1
              ? 'Solo un canal confirma visibilidad — revise red o encienda la caja.'
              : warnCount
                ? 'Canales activos pero sin peers confirmados — conecte a la misma red o escanee QR.'
                : 'Ningún canal confirma otros equipos — revise Wi‑Fi, caja encendida y emparejamiento.',
      },
    };
  }

  global.CrozzoConnectivityVisibilityProbe = {
    probeAll: probeAll,
    probeCloud: probeCloud,
    probeLan: probeLan,
    probeHotspot: probeHotspot,
    probeGossip: probeGossip,
    probeBle: probeBle,
    probeQr: probeQr,
    buildDeviceMatrix: buildDeviceMatrix,
  };
  global.crozzoProbeDeviceVisibility = probeAll;
})(typeof window !== 'undefined' ? window : globalThis);
