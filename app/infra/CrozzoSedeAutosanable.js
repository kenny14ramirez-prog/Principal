/**
 * Crozzo — Sede autosanable (H3.1 / L3 conectividad legendaria)
 * --------------------------------------------------------------------------
 * Orquesta heal existente SIN pedir QR al mesero y SIN FleetOperationalReconcile (KI-016).
 *
 * Pasos: stagger deviceId → announceIdentity → rediscover (Rol B) → WS connect →
 * Director evaluate → softHealSoloFleet si flota≤1 → mesh standby (B).
 *
 * Consola: crozzoSedeAutosanableRescue({ reason: 'drill' })
 */
(function (global) {
  'use strict';

  var __lastRescueAt = 0;
  var RESCUE_COOLDOWN_MS = 12000;
  var __bound = false;

  function md() {
    return typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
  }

  function staggerMs(skip) {
    if (skip) return 0;
    try {
      if (typeof global.crozzoReconnectStaggerMs === 'function') {
        return global.crozzoReconnectStaggerMs(0, 800);
      }
    } catch (_) {}
    return Math.floor(Math.random() * 800);
  }

  function wait(ms) {
    return new Promise(function (resolve) {
      global.setTimeout(resolve, ms || 0);
    });
  }

  /**
   * @param {{ reason?: string, skipStagger?: boolean, force?: boolean }} [opts]
   * @returns {Promise<{ ok: boolean, steps: string[], usedFleetReconcile: boolean, fleet?: object, reason?: string }>}
   */
  async function rescue(opts) {
    opts = opts || {};
    var reason = String(opts.reason || 'autosanable');
    var now = Date.now();
    if (!opts.force && now - __lastRescueAt < RESCUE_COOLDOWN_MS) {
      return {
        ok: true,
        skipped: 'cooldown',
        steps: [],
        usedFleetReconcile: false,
        reason: reason
      };
    }
    __lastRescueAt = now;

    var steps = [];
    var usedFleetReconcile = false;
    var delay = staggerMs(!!opts.skipStagger);
    if (delay > 0) {
      steps.push('Escalonado ' + delay + 'ms (anti-estampida)');
      await wait(delay);
    }

    try {
      if (global.CrozzoLanWebSocketBridge && typeof global.CrozzoLanWebSocketBridge.connect === 'function') {
        global.CrozzoLanWebSocketBridge.connect();
        steps.push('WS LAN reconnect');
      }
    } catch (_) {}

    try {
      var role = String((md() && md().role) || '').toUpperCase();
      if (role === 'B' && global.CrozzoMdnsBridge && typeof global.CrozzoMdnsBridge.rediscoverCentral === 'function') {
        await global.CrozzoMdnsBridge.rediscoverCentral({ force: true });
        steps.push('Rediscover caja (Rol B)');
      }
    } catch (_) {}

    try {
      var ann = null;
      if (typeof global.crozzoAnnounceFleetIdentity === 'function') {
        ann = await global.crozzoAnnounceFleetIdentity({ force: true, pull: true });
      } else if (
        global.CrozzoPeerDirectory &&
        typeof global.CrozzoPeerDirectory.announceIdentity === 'function'
      ) {
        ann = await global.CrozzoPeerDirectory.announceIdentity({ force: true, pull: true });
      }
      if (ann && ann.ok !== false) steps.push('Anuncio identidad flota');
    } catch (_) {}

    try {
      if (global.CrozzoPeerDirectory && typeof global.CrozzoPeerDirectory.softHealSoloFleet === 'function') {
        var soft = await global.CrozzoPeerDirectory.softHealSoloFleet('autosanable:' + reason);
        if (soft && !soft.skipped) steps.push('Soft-heal flota solo');
      }
    } catch (_) {}

    try {
      if (global.CrozzoConnectivityDirector && typeof global.CrozzoConnectivityDirector.scheduleEvaluate === 'function') {
        global.CrozzoConnectivityDirector.scheduleEvaluate('sede_autosanable:' + reason, true);
        steps.push('Director re-evalúa path');
      }
    } catch (_) {}

    try {
      var roleB = String((md() && md().role) || '').toUpperCase() === 'B';
      if (roleB && global.CrozzoOfflineGossip) {
        if (typeof global.CrozzoOfflineGossip.ensureStandby === 'function') {
          global.CrozzoOfflineGossip.ensureStandby();
          steps.push('Mesh standby');
        } else if (typeof global.CrozzoOfflineGossip.start === 'function') {
          global.CrozzoOfflineGossip.start();
          steps.push('Mesh start');
        }
      }
    } catch (_) {}

    /* Kill KI-016: nunca activar FleetOperationalReconcile desde este orquestador. */
    var fleet = null;
    try {
      if (typeof global.crozzoFleetSnapshot === 'function') fleet = global.crozzoFleetSnapshot();
      else if (global.CrozzoPeerDirectory && typeof global.CrozzoPeerDirectory.getFleetSnapshot === 'function') {
        fleet = global.CrozzoPeerDirectory.getFleetSnapshot();
      }
    } catch (_) {}

    try {
      global.dispatchEvent(
        new CustomEvent('crozzo-sede-autosanable', {
          detail: { reason: reason, steps: steps, fleet: fleet, at: Date.now() }
        })
      );
    } catch (_) {}

    return {
      ok: true,
      reason: reason,
      steps: steps,
      usedFleetReconcile: usedFleetReconcile,
      fleet: fleet
    };
  }

  function bindAutoTriggers() {
    if (__bound) return;
    __bound = true;
    /* Silencio ancla: Rol B dispara rescue (ya hay heal en LanOps; esto unifica anuncio). */
    global.addEventListener('crozzo-lan-anchor-silence', function (ev) {
      try {
        var role = String((md() && md().role) || '').toUpperCase();
        if (role !== 'B') return;
        var silence = ev && ev.detail && ev.detail.silenceMs;
        if (silence != null && Number(silence) < 18000) return;
        rescue({ reason: 'anchor_silence' }).catch(function () {});
      } catch (_) {}
    });
  }

  global.CrozzoSedeAutosanable = {
    rescue: rescue,
    bind: bindAutoTriggers
  };
  global.crozzoSedeAutosanableRescue = rescue;

  try {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bindAutoTriggers);
    } else {
      bindAutoTriggers();
    }
  } catch (_) {
    bindAutoTriggers();
  }
})(typeof window !== 'undefined' ? window : globalThis);
