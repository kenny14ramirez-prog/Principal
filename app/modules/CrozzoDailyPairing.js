/**

 * Crozzo — QR de emparejamiento por franjas (rotacion cada 4 h).

 * Delega generacion y registro de pares a CrozzoInternalQrRegistry.

 */

(function (global) {

  'use strict';



  var SURFACE_THROTTLE_MS = 120000;

  var __lastSurfaceAt = 0;



  function safe(fn) {

    try {

      return fn();

    } catch (e) {

      return undefined;

    }

  }



  function nowMs() {

    return typeof global.crozzoNow === 'function' ? global.crozzoNow() : Date.now();

  }



  function roleNow() {

    var r = safe(function () {

      return (global.getMultiDeviceConfig && global.getMultiDeviceConfig().role) || '';

    });

    return r === 'B' ? 'B' : 'A';

  }



  function registry() {

    return global.CrozzoInternalQrRegistry || null;

  }



  function ensureCurrent(opts) {

    var R = registry();

    if (R && typeof R.ensureOwnSlot === 'function') return R.ensureOwnSlot(opts || {});

    return null;

  }



  function getCurrent() {

    return safe(function () {

      var raw = global.localStorage.getItem('crozzo_daily_pairing_v2');

      var s = raw ? JSON.parse(raw) : null;

      if (!s || !s.scanText) return null;

      var R = registry();

      if (R && typeof R.slotKey === 'function' && s.slot !== R.slotKey()) return null;

      return s;

    });

  }



  function getHistory() {

    var stored = getCurrent();

    if (!stored) return [];

    var out = [stored];

    if (Array.isArray(stored.history)) {

      stored.history.forEach(function (h) {

        if (h && h.scanText) out.push(h);

      });

    }

    return out;

  }



  function showToday() {

    ensureCurrent({ force: false });

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



  function surfaceLastResort() {

    var now = nowMs();

    if (now - __lastSurfaceAt < SURFACE_THROTTLE_MS) return;

    __lastSurfaceAt = now;

    var role = roleNow();

    var R = registry();

    safe(function () {

      if (typeof global.showToast !== 'function') return;

      if (R && typeof R.startEmergencyLoop === 'function') R.startEmergencyLoop();

      if (role === 'A') {

        ensureCurrent({ force: false });

        var n = R && typeof R.getPeerCount === 'function' ? R.getPeerCount() : 0;

        global.showToast(

          'Modo QR interno: ' +

            (n ? n + ' dispositivo(s) en la base local.' : 'Sincronizando QRs de respaldo…') +

            ' Renueva cada 4 h (validos ~24 h).',

          'warning'

        );

      } else {

        global.showToast(

          'Modo QR interno activo: reconectando con QRs guardados de la caja y tablets (4 h / ~24 h validez).',

          'warning'

        );

      }

    });

  }



  function start() {

    var R = registry();

    if (R && typeof R.start === 'function') {

      R.start();

      return;

    }

    ensureCurrent({ force: false });

  }



  function stop() {

    var R = registry();

    if (R && typeof R.stop === 'function') R.stop();

  }



  global.CrozzoDailyPairing = {

    SLOT_HOURS: 4,

    slotKey: function (ts) {

      var R = registry();

      return R && typeof R.slotKey === 'function' ? R.slotKey(ts) : '';

    },

    ensureCurrent: function (force) {

      var r = ensureCurrent({ force: !!force });

      start();

      return r;

    },

    ensureToday: function (force) {

      return global.CrozzoDailyPairing.ensureCurrent(force);

    },

    getCurrent: getCurrent,

    getToday: getCurrent,

    getHistory: getHistory,

    showToday: showToday,

    surfaceLastResort: surfaceLastResort,

    start: start,

    stop: stop,

  };

})(typeof window !== 'undefined' ? window : globalThis);

