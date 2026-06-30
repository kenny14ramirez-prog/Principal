/**
 * Crozzo — Sonda de visibilidad entre equipos por canal de comunicación.
 *
 * Responde: ¿este dispositivo VE a otros? en nube, LAN, zona Wi‑Fi, gossip y BLE.
 * Usado por Diagnóstico (Ctrl+Alt+D) y Pruebas de sistema.
 */
(function (global) {
  'use strict';

  var RECENT_MS = 3600000; // 1 h = "visible recientemente"

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
    var status = peerCount > 0 ? 'ok' : active ? 'warn' : 'fail';
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
  };
  global.crozzoProbeDeviceVisibility = probeAll;
})(typeof window !== 'undefined' ? window : globalThis);
