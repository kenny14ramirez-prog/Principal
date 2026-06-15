/**
 * Crozzo — QR del dia (rotacion automatica de emparejamiento).
 *
 * Los QR de emparejamiento caducan a las 24 h. En la caja (rol A) este modulo
 * genera/refresca automaticamente el "QR del dia" al arrancar, al cambiar de
 * dia y periodicamente, dejandolo siempre disponible para re-emparejar como
 * ultimo recurso cuando todo lo demas falla (nube, LAN, hotspot y malla).
 *
 * Nota: sin ningun transporte de red, el QR es por naturaleza un escaneo
 * manual; lo que se automatiza es la generacion diaria, su disponibilidad y el
 * recordatorio. El intercambio sin escaneo requeriria Bluetooth nativo (futuro).
 */
(function (global) {
  'use strict';

  var LS_KEY = 'crozzo_daily_pairing_v1';
  var REFRESH_CHECK_MS = 1800000; // revisa rollover de dia cada 30 min
  var SURFACE_THROTTLE_MS = 120000; // 1 recordatorio cada 2 min como maximo
  var __timer = null;
  var __lastSurfaceAt = 0;

  function safe(fn) {
    try {
      return fn();
    } catch (e) {
      return undefined;
    }
  }

  function roleNow() {
    var r = safe(function () {
      return (global.getMultiDeviceConfig && global.getMultiDeviceConfig().role) || '';
    });
    return r === 'B' ? 'B' : 'A';
  }

  function todayKey() {
    var d = new Date();
    var m = String(d.getMonth() + 1);
    var day = String(d.getDate());
    if (m.length < 2) m = '0' + m;
    if (day.length < 2) day = '0' + day;
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function readStored() {
    return (
      safe(function () {
        var raw = global.localStorage.getItem(LS_KEY);
        return raw ? JSON.parse(raw) : null;
      }) || null
    );
  }

  function writeStored(obj) {
    safe(function () {
      global.localStorage.setItem(LS_KEY, JSON.stringify(obj));
    });
  }

  function buildScanText(payload) {
    var seal = global.CrozzoPairingSeal;
    if (seal && typeof seal.buildFastQrText === 'function') {
      var t = safe(function () {
        return seal.buildFastQrText(payload);
      });
      if (t) return t;
    }
    return (
      safe(function () {
        return JSON.stringify({
          type: payload.type,
          version: payload.version || 4,
          target_profile: payload.target_profile || 'tablet',
          lan: payload.lan || {},
          location_id: payload.location_id || '',
          timestamp: payload.timestamp || Date.now(),
        });
      }) || ''
    );
  }

  /**
   * Asegura que exista el QR del dia de hoy en la caja. Si ya esta generado para
   * hoy no hace nada (salvo force). Devuelve el registro guardado o null.
   */
  function ensureToday(opts) {
    opts = opts || {};
    if (roleNow() !== 'A') return null; // solo la caja emite el QR
    if (typeof global.crozzoPairingBuildPayload !== 'function') return null;
    var key = todayKey();
    var stored = readStored();
    if (!opts.force && stored && stored.date === key && stored.scanText) return stored;

    var built = safe(function () {
      return global.crozzoPairingBuildPayload('tablet');
    });
    if (!built || built.error || !built.payload) {
      // No se pudo construir (ej. sin IP de caja); reintentara en el proximo ciclo.
      return stored && stored.date === key ? stored : null;
    }
    var scanText = buildScanText(built.payload);
    if (!scanText) return stored && stored.date === key ? stored : null;
    var rec = {
      date: key,
      builtAt: Date.now(),
      scanText: scanText,
      locationId: String(built.payload.location_id || ''),
      cloud: !!built.payload.cloud_sync,
    };
    writeStored(rec);
    safe(function () {
      global.dispatchEvent(new CustomEvent('crozzo-daily-qr', { detail: { date: key } }));
    });
    return rec;
  }

  function getToday() {
    var stored = readStored();
    if (stored && stored.date === todayKey() && stored.scanText) return stored;
    return null;
  }

  /** Abre el modal de emparejamiento y muestra un QR fresco listo para escanear. */
  function showToday() {
    ensureToday();
    safe(function () {
      if (typeof global.crozzoOpenPairingModal === 'function') global.crozzoOpenPairingModal();
    });
    safe(function () {
      if (typeof global.crozzoPairingSelectReceiver === 'function') {
        global.setTimeout(function () {
          global.crozzoPairingSelectReceiver('tablet');
        }, 120);
      }
    });
  }

  /**
   * Ultimo recurso (nivel 5 de la cascada): cuando el dispositivo lleva mucho
   * tiempo aislado, recuerda compartir/escanear el QR del dia. No bloquea.
   */
  function surfaceLastResort() {
    var now = Date.now();
    if (now - __lastSurfaceAt < SURFACE_THROTTLE_MS) return;
    __lastSurfaceAt = now;
    var role = roleNow();
    safe(function () {
      if (typeof global.showToast !== 'function') return;
      if (role === 'A') {
        ensureToday();
        global.showToast(
          'Sin conexion prolongada: comparta el QR del dia de la caja para reconectar las tablets.',
          'warning'
        );
      } else {
        global.showToast(
          'Sin conexion: escanee el QR del dia de la caja (se renueva cada manana) para reconectar.',
          'warning'
        );
      }
    });
  }

  function tick() {
    safe(function () {
      if (typeof document !== 'undefined' && document.hidden) return;
    });
    ensureToday();
  }

  function start() {
    ensureToday();
    if (__timer) clearInterval(__timer);
    __timer = global.setInterval(tick, REFRESH_CHECK_MS);
    safe(function () {
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', function () {
          if (!document.hidden) ensureToday();
        });
      }
    });
  }

  function stop() {
    if (__timer) {
      clearInterval(__timer);
      __timer = null;
    }
  }

  global.CrozzoDailyPairing = {
    ensureToday: function (force) {
      var r = ensureToday({ force: !!force });
      if (!__timer) start();
      return r;
    },
    getToday: getToday,
    showToday: showToday,
    surfaceLastResort: surfaceLastResort,
    start: start,
    stop: stop,
  };
})(typeof window !== 'undefined' ? window : globalThis);
