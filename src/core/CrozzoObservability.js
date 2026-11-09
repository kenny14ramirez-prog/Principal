(function () {
  'use strict';
  const KEY = 'crozzo_obs_log_v1';
  const MAX = 500;
  const state = {
    startedAt: new Date().toISOString(),
    errors: [],
    rejections: [],
    consoleErrors: [],
    networkFailures: [],
    replays: [],
    rrwebStarted: false,
  };

  function safe(fn) { try { return fn(); } catch (_) { return null; } }
  function trim() {
    while (state.errors.length + state.rejections.length + state.consoleErrors.length + state.networkFailures.length > MAX) {
      if (state.errors.length) state.errors.shift();
      else if (state.rejections.length) state.rejections.shift();
      else if (state.consoleErrors.length) state.consoleErrors.shift();
      else state.networkFailures.shift();
    }
  }
  function persist() {
    safe(() => localStorage.setItem(KEY, JSON.stringify(state)));
  }
  function record(kind, payload) {
    const entry = { ts: new Date().toISOString(), kind, ...payload };
    if (kind === 'error') state.errors.push(entry);
    else if (kind === 'rejection') state.rejections.push(entry);
    else if (kind === 'console') state.consoleErrors.push(entry);
    else if (kind === 'network') state.networkFailures.push(entry);
    trim();
    persist();
    // Forward to Sentry/GlitchTip if available
    safe(() => {
      if (window.Sentry && typeof window.Sentry.captureException === 'function' && payload && payload.error) {
        window.Sentry.captureException(payload.error);
      } else if (window.Sentry && typeof window.Sentry.captureMessage === 'function') {
        window.Sentry.captureMessage(`${kind}: ${payload && (payload.message || payload.url) || ''}`);
      }
    });
  }

  // Global errors
  window.addEventListener('error', (e) => {
    record('error', { message: e.message, source: e.filename, line: e.lineno, col: e.colno, error: e.error });
  }, true);
  window.addEventListener('unhandledrejection', (e) => {
    record('rejection', { reason: String(e.reason && (e.reason.stack || e.reason.message || e.reason)) });
  });

  // Console.error capture
  const origConsoleError = console.error;
  console.error = function (...args) {
    record('console', { message: args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ').slice(0, 500) });
    return origConsoleError.apply(console, args);
  };

  // Network failure capture (fetch)
  const origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = function (...args) {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
      return origFetch.apply(this, args).then((res) => {
        if (!res.ok) record('network', { method: (args[1] && args[1].method) || 'GET', url, status: res.status });
        return res;
      }).catch((err) => {
        record('network', { method: (args[1] && args[1].method) || 'GET', url, failure: String(err && err.message || err) });
        throw err;
      });
    };
  }

  // rrweb session replay (optional, if loaded)
  function startReplay() {
    if (state.rrwebStarted) return;
    if (!window.rrweb || typeof window.rrweb.record !== 'function') return;
    state.rrwebStarted = true;
    try {
      window.rrweb.record({
        emit(event) {
          state.replays.push(event);
          if (state.replays.length > 2000) state.replays.shift();
        },
        checkoutEveryNms: 15000,
      });
    } catch (_) { state.rrwebStarted = false; }
  }
  // Try start now and later (rrweb may load deferred)
  safe(startReplay);
  setTimeout(safe.bind(null, startReplay), 3000);
  setTimeout(safe.bind(null, startReplay), 10000);

  // Load persisted state
  safe(() => {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        state.startedAt = parsed.startedAt || state.startedAt;
        state.errors = Array.isArray(parsed.errors) ? parsed.errors : [];
        state.rejections = Array.isArray(parsed.rejections) ? parsed.rejections : [];
        state.consoleErrors = Array.isArray(parsed.consoleErrors) ? parsed.consoleErrors : [];
        state.networkFailures = Array.isArray(parsed.networkFailures) ? parsed.networkFailures : [];
      }
    }
  });

  const api = {
    version: '1.0.0',
    status() {
      return {
        startedAt: state.startedAt,
        errors: state.errors.length,
        rejections: state.rejections.length,
        consoleErrors: state.consoleErrors.length,
        networkFailures: state.networkFailures.length,
        replayEvents: state.replays.length,
        rrwebStarted: state.rrwebStarted,
      };
    },
    recent(n) {
      n = n || 20;
      return {
        errors: state.errors.slice(-n),
        rejections: state.rejections.slice(-n),
        consoleErrors: state.consoleErrors.slice(-n),
        networkFailures: state.networkFailures.slice(-n),
      };
    },
    export() { return JSON.stringify(state); },
    clear() {
      state.errors = []; state.rejections = []; state.consoleErrors = []; state.networkFailures = []; state.replays = [];
      safe(() => localStorage.removeItem(KEY));
    },
    log: record,
  };
  window.crozzoObservability = api;
  // Back-compat alias
  window.crozzoObs = api;
})();