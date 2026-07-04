/**
 * Crozzo — Mente local del dispositivo (capa fina, no reemplaza nada).
 *
 * Unifica la decisión operativa en lenguaje humano y activa mesh standby
 * (escucha sin publicar duplicados) cuando híbrido nube/LAN está sano.
 */
(function (global) {
  'use strict';

  var PRIMARY_LABELS = {
    A_cloud: 'Nube (Supabase)',
    B_lan: 'Red local con la caja',
    C_hotspot: 'Zona Wi‑Fi de la caja',
    D_mesh: 'Malla entre tablets',
    E_qr: 'QR de emparejamiento',
    none: 'Sin ruta confirmada',
  };

  var __lastDecisionSig = '';
  var __lastToastAt = 0;
  var TOAST_GAP_MS = 90000;
  var __lastFleetPulseAt = 0;
  var FLEET_PULSE_GAP_MS = 120000;

  function safe(fn, def) {
    try {
      return fn();
    } catch (_) {
      return def;
    }
  }

  function meshStandbyEnabled() {
    try {
      if (typeof global.config !== 'undefined' && global.config.get) {
        var m = String(global.config.get('runtimeSyncModo') || 'hybrid').toLowerCase();
        if (m !== 'hybrid') return false;
        var sb = global.config.get('runtimeSyncMeshStandby');
        if (sb === false || sb === '0') return false;
      }
    } catch (_) {}
    return true;
  }

  function getSnapshot() {
    return safe(function () {
      if (global.CrozzoCapabilityMatrix && typeof global.CrozzoCapabilityMatrix.getSnapshot === 'function') {
        return global.CrozzoCapabilityMatrix.getSnapshot();
      }
      return global.__CROZZO_CAPABILITY_SNAPSHOT || null;
    }, null);
  }

  function gossipStatus() {
    return safe(function () {
      if (global.CrozzoOfflineGossip && typeof global.CrozzoOfflineGossip.getStatus === 'function') {
        return global.CrozzoOfflineGossip.getStatus();
      }
      return null;
    }, null);
  }

  function buildDecision(snap) {
    snap = snap || getSnapshot();
    var orch = safe(function () {
      if (global.CrozzoConnectivityOrchestrator && typeof global.CrozzoConnectivityOrchestrator.getState === 'function') {
        return global.CrozzoConnectivityOrchestrator.getState();
      }
      return null;
    }, null);
    var gs = gossipStatus();
    var primary = (snap && snap.plan && snap.plan.primary) || 'none';
    var primaryLabel = PRIMARY_LABELS[primary] || primary;
    var backups = [];
    if (snap && snap.transports) {
      if (snap.transports.cloud && snap.transports.cloud.ready && primary !== 'A_cloud') backups.push('nube');
      if (snap.transports.lan && snap.transports.lan.ready && primary !== 'B_lan') backups.push('LAN');
    }
    if (gs && gs.active && meshStandbyEnabled() && (primary === 'A_cloud' || primary === 'B_lan' || primary === 'C_hotspot')) {
      backups.push('malla escucha' + (gs.peerCount ? ' (' + gs.peerCount + ' peer(s))' : ''));
    } else if (snap && snap.transports && snap.transports.mesh && snap.transports.mesh.ready && primary !== 'D_mesh') {
      backups.push('malla');
    }
    var fleetN = safe(function () {
      return typeof global.crozzoListFleetCommStates === 'function' ? global.crozzoListFleetCommStates().length : 0;
    }, 0);
    if (fleetN > 1) backups.push(fleetN + ' equipos visibles en flota');
    var human = primaryLabel;
    if (backups.length) human += ' · respaldo: ' + backups.join(', ');
    if (snap && snap.hub && snap.hub.relayViaCentral) human += ' · nube vía caja';
    return {
      at: Date.now(),
      primary: primary,
      primaryLabel: primaryLabel,
      backups: backups,
      human: human,
      tier: String(global.__CROZZO_TIER_LAST || 'offline'),
      orchestratorLevel: orch && orch.level ? orch.level : 'unknown',
      meshStandby: !!(gs && gs.standby && gs.active),
      peerCount: gs ? gs.peerCount || 0 : 0,
      brain: snap && snap.brain ? snap.brain : null,
    };
  }

  function ensureMeshStandby() {
    if (!meshStandbyEnabled()) return false;
    if (global.CrozzoOfflineGossip && typeof global.CrozzoOfflineGossip.ensureStandby === 'function') {
      return !!global.CrozzoOfflineGossip.ensureStandby();
    }
    return false;
  }

  function updateBadgeHint(decision) {
    if (!decision || typeof document === 'undefined') return;
    var el = document.getElementById('crozzoConnectivityTierBadge');
    if (!el) return;
    var hint = String(decision.human || '').trim();
    if (!hint) return;
    try {
      el.setAttribute('data-crozzo-mind', hint);
      var base = String(el.getAttribute('title') || '')
        .replace(/\s*·\s*Mente:.*$/i, '')
        .replace(/\s*·\s*latencia\s*~[\d.]+\s*ms\s*$/i, '')
        .trim();
      el.setAttribute('title', base + ' · Mente: ' + hint);
    } catch (_) {}
  }

  function pulseFleetIfNeeded(decision) {
    if (!decision || typeof global.crozzoPublishFleetCommState !== 'function') return;
    var now = Date.now();
    if (now - __lastFleetPulseAt < FLEET_PULSE_GAP_MS) return;
    __lastFleetPulseAt = now;
    global.crozzoPublishFleetCommState({ force: false }).catch(function () {});
  }

  function maybeNotifyOperator(decision) {
    if (!decision || typeof global.showToast !== 'function') return;
    var sig = decision.primary + '|' + decision.meshStandby + '|' + decision.peerCount;
    if (sig === __lastDecisionSig) return;
    var now = Date.now();
    __lastDecisionSig = sig;
    if (now - __lastToastAt < TOAST_GAP_MS) return;
    __lastToastAt = now;
    global.showToast('Comunicación: ' + decision.human, decision.primary === 'none' ? 'warning' : 'info');
  }

  function evaluate(opts) {
    opts = opts || {};
    var snap = getSnapshot();
    if (!snap || opts.force) {
      safe(function () {
        if (global.CrozzoCapabilityMatrix && typeof global.CrozzoCapabilityMatrix.evaluate === 'function') {
          return global.CrozzoCapabilityMatrix.evaluate({ fast: true, force: !!opts.force });
        }
      });
      snap = getSnapshot();
    }
    if (meshStandbyEnabled()) ensureMeshStandby();
    var decision = buildDecision(snap);
    global.__CROZZO_DEVICE_MIND = decision;
    updateBadgeHint(decision);
    pulseFleetIfNeeded(decision);
    safe(function () {
      global.dispatchEvent(new CustomEvent('crozzo-device-mind-changed', { detail: decision }));
    });
    if (!opts.quiet) maybeNotifyOperator(decision);
    return decision;
  }

  function startWatch() {
    if (global.__crozzoDeviceMindWatch) return;
    global.__crozzoDeviceMindWatch = true;
    global.addEventListener('crozzo-capabilities-changed', function () {
      evaluate({ quiet: true });
    });
    global.addEventListener('crozzo-tier-changed', function () {
      evaluate({ quiet: true });
      if (meshStandbyEnabled()) ensureMeshStandby();
    });
    global.setInterval(function () {
      try {
        if (typeof document !== 'undefined' && document.hidden) return;
      } catch (_) {}
      evaluate({ quiet: true });
    }, 22000);
  }

  global.crozzoMeshStandbyEnabled = meshStandbyEnabled;
  global.crozzoGetDeviceMindDecision = function () {
    return global.__CROZZO_DEVICE_MIND || buildDecision(getSnapshot());
  };

  global.CrozzoDeviceMind = {
    evaluate: evaluate,
    ensureMeshStandby: ensureMeshStandby,
    getDecision: function () {
      return global.crozzoGetDeviceMindDecision();
    },
    meshStandbyEnabled: meshStandbyEnabled,
    startWatch: startWatch,
  };

  if (typeof document !== 'undefined') {
    var boot = function () {
      startWatch();
      global.setTimeout(function () {
        evaluate({ quiet: true });
      }, 4000);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})(typeof window !== 'undefined' ? window : this);
