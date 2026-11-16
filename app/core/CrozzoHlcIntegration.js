/**
 * Crozzo POS — HLC Integration (Fase 0)
 * ------------------------------------
 * Integra HLC en sync: observa versiones remotas y detecta concurrencia.
 */
(function (global) {
  'use strict';

  var _hlc = null;

  function getHlc() {
    if (!_hlc && global.CrozzoHlc) {
      var nodeId = 'node-' + Math.random().toString(36).slice(2);
      try { nodeId = (global.localStorage.getItem('crozzo_device_id') || nodeId); } catch (_) {}
      _hlc = new global.CrozzoHlc.Hlc(nodeId);
    }
    return _hlc;
  }

  function now() {
    var h = getHlc();
    return h ? h.now() : { ms: Date.now(), counter: 0, node: 'unknown' };
  }

  function observe(remote) {
    var h = getHlc();
    if (h && remote) {
      h.observe(remote.ms || 0, remote.counter || 0);
    }
  }

  function compare(a, b) {
    if (global.CrozzoHlc) return global.CrozzoHlc.compare(a, b);
    return null;
  }

  function isConcurrent(a, b) {
    return compare(a, b) === null;
  }

  global.CrozzoHlcIntegration = {
    getHlc: getHlc,
    now: now,
    observe: observe,
    compare: compare,
    isConcurrent: isConcurrent
  };
})(typeof window !== 'undefined' ? window : globalThis);
