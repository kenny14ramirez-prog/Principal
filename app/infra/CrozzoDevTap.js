/**
 * Crozzo — DevTap (solo desarrollo / localhost).
 *
 * Envía eventos estructurados al observador local (npm run dev:observe)
 * y al archivo JSONL vía Tauri. Invisible para usuarios en producción.
 *
 * RUIDO DEV (ignorar en consola): POST :9876/event → ERR_CONNECTION_REFUSED si no corre
 * `npm run dev:observe`. No afecta POS ni sync. Solo telemetría opcional de QA.
 */
(function (global) {
  'use strict';

  var OBSERVER_URL = 'http://127.0.0.1:9876/event';
  var OBSERVER_HEALTH_URL = 'http://127.0.0.1:9876/health';
  var __started = false;
  var __observerLive = false;
  var __observerProbed = false;

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

  /** Solo POST al observador si npm run dev:observe respondió /health (evita ERR_CONNECTION_REFUSED). */
  function probeObserverOnce() {
    if (__observerProbed) return Promise.resolve(__observerLive);
    __observerProbed = true;
    if (!isDevTapEnabled() || typeof global.fetch !== 'function') {
      return Promise.resolve(false);
    }
    return new Promise(function (resolve) {
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = ctrl
        ? global.setTimeout(function () {
            try {
              ctrl.abort();
            } catch (_) {}
          }, 350)
        : null;
      global
        .fetch(OBSERVER_HEALTH_URL, { method: 'GET', signal: ctrl ? ctrl.signal : undefined })
        .then(function (r) {
          __observerLive = !!(r && r.ok);
        })
        .catch(function () {
          __observerLive = false;
        })
        .finally(function () {
          if (timer) global.clearTimeout(timer);
          resolve(__observerLive);
        });
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
    if (__observerLive) {
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
    }
    invokeAppend(line);
    // RUIDO DEV: console [crozzo-dev-tap] — activar con localStorage crozzo_debug_devtap=1
    safe(function () {
      if (global.localStorage && global.localStorage.getItem('crozzo_debug_devtap') === '1') {
        if (typeof console !== 'undefined' && console.debug) console.debug('[crozzo-dev-tap]', row);
      }
    });
  }

  function start() {
    if (__started || !isDevTapEnabled()) return;
    __started = true;
    probeObserverOnce().then(function () {
      tap({ source: 'devtap', code: 'session_start', observerLive: __observerLive });
    });
  }

  global.CrozzoDevTap = {
    enabled: isDevTapEnabled,
    tap: tap,
    start: start,
  };
})(typeof window !== 'undefined' ? window : globalThis);
