/**
 * Crozzo — Tolerancia a reloj mal puesto (error humano muy comun).
 *
 * Muchas tablets baratas pierden la hora/fecha o quedan en otra zona horaria.
 * Eso rompe en silencio cosas como la caducidad del QR (24 h) y el orden de la
 * sincronizacion. Este modulo estima un "desfase" contra una hora de servidor
 * (best-effort) y expone crozzoNow() = hora corregida, persistida entre sesiones.
 *
 * Si no logra una hora de servidor, el desfase queda en 0 y la app sigue igual;
 * la red de seguridad real esta en la validacion tolerante del QR.
 */
(function (global) {
  'use strict';

  var LS = 'crozzo_clock_offset_v1';
  var THRESHOLD_MS = 30000; // ignora desfases pequenos (reloj practicamente OK)
  var REFRESH_MS = 600000; // re-estima cada 10 min
  var MAX_PLAUSIBLE_MS = 3650 * 24 * 3600 * 1000; // ~10 anios: descarta basura
  var __offset = 0;
  var __timer = null;

  function safe(fn) {
    try {
      return fn();
    } catch (e) {
      return undefined;
    }
  }

  (function loadPersisted() {
    var v = safe(function () {
      return Number(global.localStorage.getItem(LS));
    });
    if (Number.isFinite(v) && Math.abs(v) < MAX_PLAUSIBLE_MS) __offset = v;
  })();

  function now() {
    return Date.now() + __offset;
  }

  function setOffsetFromServerMs(serverMs) {
    if (!serverMs || !Number.isFinite(serverMs)) return false;
    var off = serverMs - Date.now();
    if (!Number.isFinite(off) || Math.abs(off) > MAX_PLAUSIBLE_MS) return false;
    if (Math.abs(off) < THRESHOLD_MS) {
      // El reloj local esta bien: desfase despreciable.
      __offset = 0;
      safe(function () {
        global.localStorage.removeItem(LS);
      });
      safe(function () {
        global.__CROZZO_CLOCK_OFFSET = 0;
      });
      return true;
    }
    __offset = off;
    safe(function () {
      global.localStorage.setItem(LS, String(off));
    });
    safe(function () {
      global.__CROZZO_CLOCK_OFFSET = off;
    });
    return true;
  }

  function parseDateHeader(res) {
    var d = safe(function () {
      return res && res.headers && typeof res.headers.get === 'function' ? res.headers.get('date') : '';
    });
    if (!d) return 0;
    var ms = Date.parse(d);
    return Number.isFinite(ms) ? ms : 0;
  }

  /** Alimenta el desfase desde cualquier respuesta HTTP de servidor (header Date). */
  function noteResponse(res) {
    var ms = parseDateHeader(res);
    if (ms) return setOffsetFromServerMs(ms);
    return false;
  }

  /** Alimenta el desfase desde una hora de servidor ya conocida (ms epoch). */
  function noteServerMs(ms) {
    return setOffsetFromServerMs(Number(ms));
  }

  async function refresh() {
    // 1) Supabase REST (si esta configurado): leemos el header Date de la respuesta.
    var got = false;
    try {
      var j = typeof global.readCrozzoSupabaseJson === 'function' ? global.readCrozzoSupabaseJson() : null;
      if (j && j.syncEnabled && j.url) {
        var base = String(j.url).replace(/\/$/, '');
        var headers = {};
        if (typeof global.crozzoSupabaseRestHeaders === 'function') {
          var key =
            typeof global.crozzoSupabaseEffectiveAnonKey === 'function'
              ? global.crozzoSupabaseEffectiveAnonKey(j)
              : String(j.key || j.anonKey || '').trim();
          if (key) headers = global.crozzoSupabaseRestHeaders(key);
        }
        var res = await global.fetch(base + '/rest/v1/', { method: 'HEAD', headers: headers });
        got = noteResponse(res);
      }
    } catch (_) {}
    // 2) Caja LAN /health (mismo segmento): otra fuente de hora.
    if (!got) {
      try {
        var md = typeof global.getMultiDeviceConfig === 'function' ? global.getMultiDeviceConfig() : {};
        var ip = String(md.centralIp || '').trim();
        var port = Number(md.port) || 3000;
        if (ip) {
          var r2 = await global.fetch('http://' + ip + ':' + port + '/health', { method: 'HEAD' });
          got = noteResponse(r2);
        }
      } catch (_) {}
    }
    return got;
  }

  function start() {
    refresh().catch(function () {});
    if (__timer) global.clearInterval(__timer);
    __timer = global.setInterval(function () {
      refresh().catch(function () {});
    }, REFRESH_MS);
  }

  global.crozzoNow = now;
  global.CrozzoClockSync = {
    now: now,
    refresh: refresh,
    start: start,
    noteResponse: noteResponse,
    noteServerMs: noteServerMs,
    getOffset: function () {
      return __offset;
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
