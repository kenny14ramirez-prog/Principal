/**
 * Crozzo — DevTap (solo desarrollo / localhost).
 *
 * Envía eventos estructurados al observador local (npm run dev:observe)
 * y al archivo JSONL vía Tauri. Invisible para usuarios en producción.
 */
(function (global) {
  'use strict';

  var OBSERVER_URL = 'http://127.0.0.1:9876/event';
  var __started = false;

  function safe(fn) {
    try {
      return fn();
    } catch (_) {}
  }

  function isDevTapEnabled() {
    if (global.__CROZZO_DEV_TAP === false) return false;
    if (global.__CROZZO_DEV_TAP === true) return true;
    return safe(function () {
      var h = String((global.location && global.location.hostname) || '');
      return h === 'localhost' || h === '127.0.0.1' || h === '';
    }, false);
  }

  function invokeAppend(line) {
    safe(function () {
      var t = global.__TAURI__;
      if (!t) return;
      var inv =
        t.core && typeof t.core.invoke === 'function'
          ? t.core.invoke.bind(t.core)
          : typeof t.invoke === 'function'
            ? t.invoke.bind(t)
            : null;
      if (inv) inv('crozzo_append_dev_log', { line: line }).catch(function () {});
    });
  }

  function tap(payload) {
    if (!isDevTapEnabled()) return;
    var row = {
      at: Date.now(),
      iso: new Date().toISOString(),
    };
    if (payload && typeof payload === 'object') {
      Object.keys(payload).forEach(function (k) {
        row[k] = payload[k];
      });
    } else if (payload != null) {
      row.message = String(payload);
    }
    var line = JSON.stringify(row);
    safe(function () {
      if (typeof global.fetch === 'function') {
        global.fetch(OBSERVER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: line,
          keepalive: true,
        }).catch(function () {});
      }
    });
    invokeAppend(line);
    safe(function () {
      if (typeof console !== 'undefined' && console.debug) console.debug('[crozzo-dev-tap]', row);
    });
  }

  function start() {
    if (__started || !isDevTapEnabled()) return;
    __started = true;
    tap({ source: 'devtap', code: 'session_start' });
  }

  global.CrozzoDevTap = {
    enabled: isDevTapEnabled,
    tap: tap,
    start: start,
  };
})(typeof window !== 'undefined' ? window : globalThis);
