/**
 * Crozzo — Pulso operativo en la nube (segunda vía de tiempo real).
 *
 * Nivel 1 (nube) "tocho tocho": además del Realtime por postgres_changes de
 * cada tabla (mesas/comandas) y del poll de respaldo, este módulo abre UN canal
 * de broadcast compartido por sede. Cuando un equipo guarda una comanda o un
 * cambio de mesa, emite un "pulso" liviano; los demás equipos lo reciben y
 * bajan al instante — aunque la réplica de postgres_changes esté lenta o caída.
 *
 * Vías independientes que se cubren entre sí:
 *   a) Realtime postgres_changes (en CrozzoComandasCloudSync / PosRuntimeCloud)
 *   b) Pulso broadcast (este módulo) — instantáneo e independiente de la réplica
 *   c) BroadcastChannel local — pestañas/ventanas del mismo equipo, gratis
 *   d) Poll de respaldo (en los módulos de transporte)
 *
 * Si cualquiera falla, las otras mantienen la operación. Sin timers duplicados:
 * un solo canal, un solo watchdog, dedupe por dispositivo de origen.
 */
(function (global) {
  'use strict';

  var __started = false;
  var __ch = null;
  var __bc = null;
  var __live = false;
  var __connecting = false;
  var __connectStartedAt = 0;
  var __lastRxAt = 0;
  var __resubTimer = null;
  var __resubAttempt = 0;
  var __watchdog = null;
  var __pullTimers = {}; // kind -> debounce timer
  var __emitTimers = {}; // kind -> debounce timer
  var __pendingEmit = {}; // kind -> bool
  var WATCHDOG_MS = 20000;
  var PULL_DEBOUNCE_MS = 220;
  var EMIT_DEBOUNCE_MS = 350;

  function safe(fn) {
    try {
      return fn();
    } catch (_) {
      return undefined;
    }
  }

  function online() {
    return (
      typeof global.crozzoOnlineConfigReady === 'function' &&
      global.crozzoOnlineConfigReady() &&
      !!global.__SUPABASE
    );
  }

  function tierAllowsCloud() {
    try {
      if (typeof global.crozzoCloudSyncSessionGateOpen === 'function' && !global.crozzoCloudSyncSessionGateOpen()) {
        return false;
      }
    } catch (_) {}
    try {
      if (typeof global.crozzoTierAllowsCloudSync === 'function') return global.crozzoTierAllowsCloudSync();
    } catch (_) {}
    return online();
  }

  function ctx() {
    var md = typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
    var loc = String(md.locationId || 'default').trim() || 'default';
    if (!loc || loc === 'default') {
      safe(function () {
        if (typeof global.crozzoEnsureSedeLocationId === 'function') {
          var ensured = String(global.crozzoEnsureSedeLocationId() || '').trim();
          if (ensured && ensured !== 'default') loc = ensured;
        }
      });
    }
    var dev = '';
    safe(function () {
      dev = String(
        (typeof global.ensureCrozzoDeviceId === 'function' && global.ensureCrozzoDeviceId()) ||
          (md && md.deviceId) ||
          (global.localStorage && global.localStorage.getItem('crozzo_device_id')) ||
          ''
      ).trim();
    });
    return {
      businessId: String(md.businessId || 'default').trim() || 'default',
      locationId: loc,
      deviceId: dev,
    };
  }

  function ready(c) {
    c = c || ctx();
    return !!(c.businessId && c.businessId !== 'default' && c.locationId && c.locationId !== 'default');
  }

  function channelName(c) {
    var base = 'crozzo_ops_pulse_' + String(c.businessId).replace(/[^a-zA-Z0-9_]/g, '_');
    if (c.locationId && c.locationId !== 'default') {
      base += '_' + String(c.locationId).replace(/[^a-zA-Z0-9_]/g, '_');
    }
    return base;
  }

  // --- Recepción: baja la tabla correspondiente al pulso recibido ----------
  function triggerPull(kind) {
    if (__pullTimers[kind]) return; // ya hay un pull programado para esta clase
    __pullTimers[kind] = global.setTimeout(function () {
      __pullTimers[kind] = null;
      if (!tierAllowsCloud()) return;
      if (kind === 'comanda') {
        safe(function () {
          if (typeof global.crozzoPullComandasFromCloud === 'function') {
            global.crozzoPullComandasFromCloud({ skipPrint: true, skipRender: false, silent: true }).catch(function () {});
          }
        });
      } else if (kind === 'runtime') {
        safe(function () {
          if (typeof global.crozzoPullPosRuntimeCloud === 'function') {
            global.crozzoPullPosRuntimeCloud({ quiet: true, skipRender: false })
              .then(function (applied) {
                if (applied && typeof global.crozzoHandleRemoteRuntimeUiSync === 'function') {
                  global.crozzoHandleRemoteRuntimeUiSync();
                }
              })
              .catch(function () {});
          }
        });
      }
    }, PULL_DEBOUNCE_MS);
  }

  function handleIncoming(payload) {
    if (!payload) return;
    var myDev = ctx().deviceId;
    if (myDev && payload.dev && String(payload.dev) === String(myDev)) return; // eco propio
    __lastRxAt = Date.now();
    var kind = String(payload.kind || '');
    if (kind === 'comanda' || kind === 'runtime') {
      triggerPull(kind);
    } else if (kind === 'all') {
      triggerPull('comanda');
      triggerPull('runtime');
    }
  }

  // --- Emisión: anuncia a los demás equipos que hay novedad ----------------
  function doEmit(kind) {
    var c = ctx();
    var payload = { kind: kind, dev: c.deviceId, at: Date.now() };
    // a) Broadcast nube (otros equipos)
    safe(function () {
      if (__ch && typeof __ch.send === 'function') {
        __ch.send({ type: 'broadcast', event: 'ops', payload: payload }).catch(function () {});
      }
    });
    // c) BroadcastChannel local (otras pestañas/ventanas del mismo equipo)
    safe(function () {
      if (__bc) __bc.postMessage(payload);
    });
  }

  function emit(kind) {
    kind = String(kind || '').trim();
    if (kind !== 'comanda' && kind !== 'runtime' && kind !== 'all') return;
    if (!tierAllowsCloud()) return;
    // Debounce por clase: cambios en ráfaga producen un solo pulso.
    __pendingEmit[kind] = true;
    if (__emitTimers[kind]) return;
    __emitTimers[kind] = global.setTimeout(function () {
      __emitTimers[kind] = null;
      if (!__pendingEmit[kind]) return;
      __pendingEmit[kind] = false;
      doEmit(kind);
    }, EMIT_DEBOUNCE_MS);
  }

  // --- Suscripción + auto-reparación --------------------------------------
  function teardown() {
    safe(function () {
      if (__ch && global.__SUPABASE) global.__SUPABASE.removeChannel(__ch);
    });
    __ch = null;
    __live = false;
  }

  function resubDelayMs() {
    safe(function () {
      var thr = global.CrozzoCloudThrottle;
      if (thr && typeof thr.resubscribeDelayMs === 'function') return thr.resubscribeDelayMs(__resubAttempt);
    });
    return Math.min(20000, 2000 + __resubAttempt * 800);
  }

  function scheduleResub(reason) {
    if (__resubTimer) return;
    __resubAttempt = Math.min(__resubAttempt + 1, 12);
    __resubTimer = global.setTimeout(function () {
      __resubTimer = null;
      if (!online()) return;
      subscribe(reason || 'resub');
    }, resubDelayMs());
  }

  function subscribe(reason) {
    if (!tierAllowsCloud() || !online()) return;
    if (__live && __ch) return; // ya vivo: no recrear (evita CLOSED innecesario)
    // Evita recrear el canal mientras una conexión está en curso (anti-churn).
    if (__connecting && Date.now() - __connectStartedAt < 8000) return;
    var c = ctx();
    if (!ready(c)) return;
    teardown();
    __connecting = true;
    __connectStartedAt = Date.now();
    safe(function () {
      var ch = global.__SUPABASE.channel(channelName(c), { config: { broadcast: { self: false } } });
      ch.on('broadcast', { event: 'ops' }, function (msg) {
        handleIncoming(msg && msg.payload);
      });
      ch.subscribe(function (status) {
        if (status === 'SUBSCRIBED') {
          __live = true;
          __connecting = false;
          __resubAttempt = 0;
          __lastRxAt = Date.now();
        } else if (status === 'CHANNEL_ERROR' || status === 'CLOSED' || status === 'TIMED_OUT') {
          __live = false;
          __connecting = false;
          if (!online()) {
            stop();
            return;
          }
          scheduleResub(status);
        }
      });
      __ch = ch;
    });
  }

  function startWatchdog() {
    if (__watchdog) return;
    // Vigilancia liviana: si el canal no está vivo (y hay nube), reabrirlo.
    // No se fuerza resuscripción por "silencio": el broadcast solo llega cuando
    // otro equipo emite, así que el silencio es normal. El socket de Supabase
    // tiene su propio heartbeat y dispara CLOSED/ERROR si muere → resub por evento.
    __watchdog = global.setInterval(function () {
      if (safe(function () { return typeof document !== 'undefined' && document.hidden; })) return;
      if (!online() || !tierAllowsCloud()) return;
      if (!__ch || !__live) subscribe('watchdog');
    }, WATCHDOG_MS);
  }

  function ensureLocalBc() {
    if (__bc || typeof global.BroadcastChannel === 'undefined') return;
    safe(function () {
      __bc = new global.BroadcastChannel('crozzo_ops_pulse');
      __bc.onmessage = function (ev) {
        handleIncoming(ev && ev.data);
      };
    });
  }

  function start() {
    if (!tierAllowsCloud() || !online()) return;
    if (!ready()) {
      safe(function () {
        if (typeof global.crozzoEnsureSedeLocationId === 'function') global.crozzoEnsureSedeLocationId();
      });
      if (!ready()) return;
    }
    ensureLocalBc();
    if (!__started) {
      __started = true;
      startWatchdog();
    }
    subscribe('start');
  }

  function stop() {
    __started = false;
    __live = false;
    __connecting = false;
    if (__resubTimer) {
      global.clearTimeout(__resubTimer);
      __resubTimer = null;
    }
    __resubAttempt = 0;
    teardown();
    // El watchdog se deja vivo para reabrir solo al recuperar red; pero si no
    // hay sesión configurada, se detiene para no gastar.
    if (!online() && __watchdog) {
      global.clearInterval(__watchdog);
      __watchdog = null;
      __started = false;
    }
  }

  function status() {
    return {
      started: __started,
      live: __live,
      hasChannel: !!__ch,
      lastRxAgoMs: __lastRxAt ? Date.now() - __lastRxAt : null,
    };
  }

  global.CrozzoCloudOpsPulse = {
    start: start,
    stop: stop,
    emit: emit,
    status: status,
  };
  // API corta usada por los módulos de transporte tras un push confirmado.
  global.crozzoOpsPulseEmit = emit;
  global.crozzoStartOpsPulse = start;
  global.crozzoStopOpsPulse = stop;

  function cloudPulseAllowed() {
    try {
      if (typeof global.crozzoCloudBackgroundSyncAllowed === 'function') {
        return global.crozzoCloudBackgroundSyncAllowed();
      }
    } catch (_) {}
    return tierAllowsCloud() && online();
  }

  // Reabre solo al recuperar conectividad y tier cloud.
  if (typeof global.addEventListener === 'function') {
    global.addEventListener('online', function () {
      global.setTimeout(function () {
        if (cloudPulseAllowed()) start();
      }, 500);
    });
    global.addEventListener('crozzo-tier-changed', function (ev) {
      var to = ev && ev.detail && ev.detail.to;
      if (to === 'cloud' && cloudPulseAllowed()) {
        global.setTimeout(function () {
          if (cloudPulseAllowed()) start();
        }, 600);
        return;
      }
      if (to && to !== 'cloud') stop();
    });
    global.addEventListener('crozzo-detector-tier-changed', function (ev) {
      var to = ev && ev.detail && ev.detail.to;
      if (to === 'cloud' && cloudPulseAllowed()) {
        global.setTimeout(function () {
          if (cloudPulseAllowed()) start();
        }, 600);
        return;
      }
      if (to && to !== 'cloud') stop();
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
