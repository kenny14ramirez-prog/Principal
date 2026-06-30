/**
 * Crozzo — Política de cerebros A (caja) y B (terminal).
 *
 * Cerebro A: ancla — sirve LAN, nube, hotspot, publica presencia y QR.
 * Cerebro B: satélite — intenta lo propio; si falla, pide prestado al A
 * (credenciales, IP, relay nube, catálogo QR) sin colapsar ni bloquear operación.
 */
(function (global) {
  'use strict';

  var BORROW_GAP_MS = 22000;
  var BORROW_GAP_URGENT_MS = 7000;
  var __lastBorrowAt = 0;
  var __borrowInflight = null;

  var BRAIN_A = {
    kind: 'A',
    label: 'Cerebro central (caja)',
    owns: ['lan_server', 'hotspot_deploy', 'cloud_anchor', 'peer_publish', 'qr_emit', 'pairing_cloud_api'],
    seeks: ['cloud', 'lan_local'],
    serves: ['lan_clients', 'cloud_relay', 'runtime_push', 'comanda_relay'],
  };

  var BRAIN_B = {
    kind: 'B',
    label: 'Cerebro terminal (tablet)',
    owns: ['lan_client', 'mesh_peer', 'own_cloud_optional'],
    seeks: ['own_cloud', 'anchor_lan', 'anchor_cloud_relay', 'anchor_hotspot', 'anchor_qr', 'anchor_credentials'],
    borrowsFrom: 'A',
  };

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

  function localBrainKind() {
    return md().role === 'B' ? 'B' : 'A';
  }

  function policyFor(kind) {
    return kind === 'B' ? BRAIN_B : BRAIN_A;
  }

  function directorState() {
    return safe(function () {
      return global.CrozzoConnectivityDirector && global.CrozzoConnectivityDirector.getState
        ? global.CrozzoConnectivityDirector.getState()
        : null;
    }, null);
  }

  function capabilitySnap() {
    return safe(function () {
      return global.CrozzoCapabilityMatrix && global.CrozzoCapabilityMatrix.getSnapshot
        ? global.CrozzoCapabilityMatrix.getSnapshot()
        : null;
    }, null);
  }

  /** Qué le falta al cerebro B respecto a lo que necesita operar. */
  function computeDeficits(snap, director) {
    snap = snap || capabilitySnap();
    director = director || directorState();
    var kind = localBrainKind();
    if (kind !== 'B') return [];
    var ts = (snap && snap.transports) || {};
    var hub = (snap && snap.hub) || {};
    var out = [];
    if (!ts.cloud || !ts.cloud.ready) out.push('cloud');
    if (!ts.lan || !ts.lan.ready) out.push('lan');
    if (director && director.mode === 'lan_seek') out.push('anchor_seek');
    if (!hub.ip && !(ts.lan && ts.lan.anchorIp)) out.push('anchor_ip');
    if (!ts.cloud || !ts.cloud.ready) {
      if (!hub.relayViaCentral && !hub.cloudAnchor) out.push('anchor_cloud');
    }
    return out;
  }

  /** Rutas de préstamo desde cerebro A hacia B. */
  function buildBorrowStrategies(snap, director) {
    snap = snap || capabilitySnap();
    director = director || directorState();
    var cfg = md();
    var hub = (snap && snap.hub) || {};
    var anchorIp =
      String(hub.ip || (snap && snap.transports && snap.transports.lan && snap.transports.lan.anchorIp) || cfg.centralIp || '').trim();
    var port = Math.max(1, Number(cfg.port) || 3000);
    var strategies = [];

    strategies.push({
      cap: 'anchor_ip',
      via: 'peer_directory',
      ready: !!anchorIp,
      action: 'wifi_zone_resolve',
      detail: anchorIp || 'buscar caja en memoria',
    });
    strategies.push({
      cap: 'lan',
      via: 'anchor_lan',
      ready: !!(snap && snap.transports && snap.transports.lan && snap.transports.lan.ready),
      action: 'activate_local_sync',
      detail: anchorIp ? anchorIp + ':' + port : 'sin IP',
    });
    strategies.push({
      cap: 'cloud',
      via: 'pairing_cloud_api',
      ready: !!(snap && snap.transports && snap.transports.cloud && snap.transports.cloud.ready),
      action: 'heal_cloud_from_caja',
      detail: hub.relayViaCentral ? 'relay estrella activo' : 'GET /api/pairing-cloud',
    });
    strategies.push({
      cap: 'cloud',
      via: 'anchor_relay',
      ready: !!(hub.relayViaCentral || hub.cloudAnchor),
      action: 'lan_ops_only',
      detail: 'operar por LAN; caja escribe Supabase',
    });
    strategies.push({
      cap: 'qr',
      via: 'internal_qr_catalog',
      ready: !!(snap && snap.transports && snap.transports.qr && snap.transports.qr.ready),
      action: 'request_peer_qr',
      detail: 'slots QR del cerebro A',
    });
    strategies.push({
      cap: 'hotspot',
      via: 'anchor_hotspot',
      ready: !!(director && director.selfLan),
      action: 'wifi_zone_watch',
      detail: 'conectar al hotspot de la caja',
    });

    return strategies;
  }

  /** Capacidades efectivas: propias + prestadas del A cuando B no alcanza. */
  function resolveEffectiveCapabilities(snap, director) {
    snap = snap || capabilitySnap();
    director = director || directorState();
    var kind = localBrainKind();
    var policy = policyFor(kind);
    var ts = (snap && snap.transports) || {};
    var hub = (snap && snap.hub) || {};
    var deficits = computeDeficits(snap, director);
    var borrowed = [];
    var effective = {
      cloud: !!(ts.cloud && ts.cloud.ready),
      lan: !!(ts.lan && ts.lan.ready),
      hotspot: !!(ts.hotspot && ts.hotspot.ready),
      mesh: !!(ts.mesh && ts.mesh.ready),
      qr: !!(ts.qr && ts.qr.ready),
    };

    if (kind === 'A') {
      return {
        kind: kind,
        policy: policy,
        own: effective,
        effective: effective,
        borrowed: borrowed,
        deficits: [],
        mode: 'serve',
      };
    }

    if (!effective.cloud && (hub.relayViaCentral || hub.cloudAnchor)) {
      effective.cloud = true;
      borrowed.push({ cap: 'cloud', from: 'A', via: 'relay_lan' });
    }
    if (!effective.lan && hub.ip && director && (director.mode === 'lan_client' || director.selfLan)) {
      effective.lan = true;
      borrowed.push({ cap: 'lan', from: 'A', via: 'director_anchor' });
    }
    if (!effective.cloud && effective.lan && hub.cloudAnchor) {
      effective.cloud = true;
      borrowed.push({ cap: 'cloud', from: 'A', via: 'caja_nube' });
    }

    return {
      kind: kind,
      policy: policy,
      own: {
        cloud: !!(ts.cloud && ts.cloud.ready),
        lan: !!(ts.lan && ts.lan.ready),
        hotspot: !!(ts.hotspot && ts.hotspot.ready),
        mesh: !!(ts.mesh && ts.mesh.ready),
        qr: !!(ts.qr && ts.qr.ready),
      },
      effective: effective,
      borrowed: borrowed,
      deficits: deficits,
      mode: deficits.length ? 'borrow' : 'autonomous',
      anchorIp: hub.ip || '',
    };
  }

  function resolveBrainState(opts) {
    opts = opts || {};
    var snap = opts.snap || capabilitySnap();
    var director = opts.director || directorState();
    var kind = localBrainKind();
    var eff = resolveEffectiveCapabilities(snap, director);
    return {
      kind: kind,
      policy: eff.policy,
      mode: eff.mode,
      own: eff.own,
      effective: eff.effective,
      borrowed: eff.borrowed,
      deficits: eff.deficits,
      strategies: buildBorrowStrategies(snap, director),
      anchorIp: eff.anchorIp || '',
      directorMode: director && director.mode ? director.mode : '',
    };
  }

  /** Cerebro A: publicar y servir. Cerebro B: buscar A si falta algo. */
  async function enforceBrainServe(opts) {
    opts = opts || {};
    var kind = localBrainKind();
    if (kind !== 'A') return { ok: true, kind: kind, action: 'skip_not_a' };

    safe(function () {
      if (global.CrozzoLanSyncBridge && typeof global.CrozzoLanSyncBridge.ensureServerOnce === 'function') {
        global.CrozzoLanSyncBridge.ensureServerOnce(false).catch(function () {});
      }
    });
    safe(function () {
      if (global.CrozzoLanSyncBridge && typeof global.CrozzoLanSyncBridge.pushPairingCloudToServer === 'function') {
        global.CrozzoLanSyncBridge.pushPairingCloudToServer().catch(function () {});
      }
    });
    safe(function () {
      if (global.CrozzoPeerDirectory && typeof global.CrozzoPeerDirectory.publishPresenceToCloud === 'function' && global.__SUPABASE) {
        global.CrozzoPeerDirectory.publishPresenceToCloud(global.__SUPABASE, { force: !!opts.force }).catch(function () {});
      }
    });
    safe(function () {
      if (global.CrozzoInternalQrRegistry && typeof global.CrozzoInternalQrRegistry.refreshIdentityOnCloud === 'function') {
        global.CrozzoInternalQrRegistry.refreshIdentityOnCloud({ force: !!opts.force }).catch(function () {});
      }
    });
    return { ok: true, kind: 'A', action: 'serve' };
  }

  /** Cerebro B pide prestado al A (debounced). */
  async function applyBorrowSeek(opts) {
    opts = opts || {};
    if (localBrainKind() !== 'B') return { ok: false, reason: 'not_brain_b' };
    var ds = directorState();
    var urgent =
      ds &&
      (ds.mode === 'isolated' || ds.mode === 'lan_seek') &&
      !safe(function () {
        return global.crozzoIsLocalLanSegmentUp && global.crozzoIsLocalLanSegmentUp();
      }, false);
    var gap = urgent ? BORROW_GAP_URGENT_MS : BORROW_GAP_MS;
    var now = Date.now();
    if (!opts.force && now - __lastBorrowAt < gap) {
      return { ok: false, reason: 'debounced' };
    }
    if (__borrowInflight && !opts.force) {
      try {
        return await __borrowInflight;
      } catch (_) {
        return { ok: false, reason: 'inflight_failed' };
      }
    }
    __lastBorrowAt = now;

    __borrowInflight = (async function () {
      var snap = capabilitySnap();
      var director = directorState();
      var deficits = computeDeficits(snap, director);
      var applied = [];

      if (deficits.indexOf('anchor_ip') >= 0 || deficits.indexOf('anchor_seek') >= 0 || deficits.indexOf('lan') >= 0) {
        if (typeof global.crozzoWifiZoneResolveCentral === 'function') {
          try {
            var wr = await global.crozzoWifiZoneResolveCentral({ force: !!opts.force, timeoutMs: 2800 });
            if (wr && wr.ip) applied.push('wifi_zone:' + wr.ip);
          } catch (_) {}
        }
        if (global.CrozzoConnectivityDirector && typeof global.CrozzoConnectivityDirector.resolveCentralFromMemory === 'function') {
          try {
            var mem = await global.CrozzoConnectivityDirector.resolveCentralFromMemory({ timeoutMs: 1400 });
            if (mem && mem.ip) applied.push('memory:' + mem.ip);
          } catch (_) {}
        }
      }

      if (deficits.indexOf('cloud') >= 0 || deficits.indexOf('anchor_cloud') >= 0) {
        if (typeof global.crozzoHealRoleBCloudFromCaja === 'function') {
          try {
            var healed = await global.crozzoHealRoleBCloudFromCaja({ force: !!opts.force, source: 'brain_borrow' });
            if (healed && healed.healed) applied.push('cloud_heal');
          } catch (_) {}
        }
      }

      if (deficits.indexOf('lan') >= 0 || deficits.some(function (d) { return d.indexOf('anchor') >= 0; })) {
        if (typeof global.crozzoActivateLocalSyncPath === 'function') {
          try {
            await global.crozzoActivateLocalSyncPath('brain_borrow');
            applied.push('lan_activate');
          } catch (_) {}
        }
      }

      if (global.CrozzoInternalQrRegistry) {
        if (typeof global.CrozzoInternalQrRegistry.requestPeerQrCatalog === 'function') {
          global.CrozzoInternalQrRegistry.requestPeerQrCatalog({ force: !!opts.force });
          applied.push('qr_catalog');
        }
        if (typeof global.CrozzoInternalQrRegistry.pullPeersFromCloud === 'function') {
          try {
            await global.CrozzoInternalQrRegistry.pullPeersFromCloud();
            applied.push('qr_cloud_pull');
          } catch (_) {}
        }
      }

      if (global.CrozzoPeerDirectory && typeof global.CrozzoPeerDirectory.pullPresenceFromCloud === 'function') {
        try {
          await global.CrozzoPeerDirectory.pullPresenceFromCloud({ force: !!opts.force });
          applied.push('peer_presence');
        } catch (_) {}
      }

      var state = resolveBrainState();
      safe(function () {
        global.__CROZZO_BRAIN_STATE = state;
        global.dispatchEvent(new CustomEvent('crozzo-brain-changed', { detail: state }));
      });
      if (
        global.CrozzoHumanConnectivityPredict &&
        typeof global.CrozzoHumanConnectivityPredict.runRecovery === 'function'
      ) {
        global.CrozzoHumanConnectivityPredict.runRecovery({ quiet: true, force: !!opts.force }).catch(function () {});
      }
      return { ok: applied.length > 0, applied: applied, deficits: deficits, state: state };
    })();

    try {
      return await __borrowInflight;
    } finally {
      global.setTimeout(function () {
        __borrowInflight = null;
      }, BORROW_GAP_MS - 200);
    }
  }

  function start() {
    safe(function () {
      global.addEventListener('crozzo-capabilities-changed', function (ev) {
        var detail = ev && ev.detail;
        if (localBrainKind() === 'B') {
          var deficits = computeDeficits(detail, directorState());
          if (deficits.length) applyBorrowSeek({ quiet: true }).catch(function () {});
        }
      });
      global.addEventListener('crozzo-connectivity-director-changed', function () {
        if (localBrainKind() === 'B') applyBorrowSeek({ quiet: true }).catch(function () {});
        else enforceBrainServe({ quiet: true }).catch(function () {});
      });
    });
    if (localBrainKind() === 'A') enforceBrainServe({ force: true }).catch(function () {});
    else applyBorrowSeek({ force: true }).catch(function () {});
    safe(function () {
      if (global.CrozzoHumanConnectivityPredict && typeof global.CrozzoHumanConnectivityPredict.start === 'function') {
        global.CrozzoHumanConnectivityPredict.start();
      }
    });
  }

  global.CrozzoBrainPolicy = {
    BRAIN_A: BRAIN_A,
    BRAIN_B: BRAIN_B,
    localBrainKind: localBrainKind,
    policyFor: policyFor,
    resolveBrainState: resolveBrainState,
    resolveEffectiveCapabilities: resolveEffectiveCapabilities,
    computeDeficits: computeDeficits,
    buildBorrowStrategies: buildBorrowStrategies,
    enforceBrainServe: enforceBrainServe,
    applyBorrowSeek: applyBorrowSeek,
    start: start,
  };

  global.crozzoResolveBrainState = resolveBrainState;
  global.crozzoBrainEffectiveCloud = function () {
    var st = resolveBrainState();
    return !!(st.effective && st.effective.cloud);
  };
})(typeof window !== 'undefined' ? window : globalThis);
