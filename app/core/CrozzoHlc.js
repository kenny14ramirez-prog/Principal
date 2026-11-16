/**
 * Crozzo POS — HLC (Hybrid Logical Clock) PoC (Fase 0)
 * -----------------------------------------------------
 * HLC por entidad: (physical_ms, counter, node_id).
 * Detecta concurrencia y evita LWW ciego.
 * Referencia: src-tauri/src/crozzo_lan_persistence.rs (Hlc struct).
 */
(function (global) {
  'use strict';

  function nowMs() { return Date.now(); }

  function Hlc(nodeId) {
    this.physicalMs = nowMs();
    this.counter = 0;
    this.nodeId = nodeId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'node-' + Math.random().toString(36).slice(2));
  }

  Hlc.prototype.now = function () {
    var now = nowMs();
    if (now > this.physicalMs) {
      this.physicalMs = now;
      this.counter = 0;
    } else if (now === this.physicalMs) {
      this.counter = (this.counter + 1) & 0xffff;
    } else {
      // reloj retrocedió
      this.counter = (this.counter + 1) & 0xffff;
    }
    return { ms: this.physicalMs, counter: this.counter, node: this.nodeId };
  };

  Hlc.prototype.observe = function (remoteMs, remoteCounter) {
    var now = nowMs();
    if (remoteMs > this.physicalMs || (remoteMs === this.physicalMs && remoteCounter > this.counter)) {
      this.physicalMs = Math.max(remoteMs, now);
      this.counter = (remoteCounter + 1) & 0xffff;
    } else if (now > this.physicalMs) {
      this.physicalMs = now;
      this.counter = 0;
    } else {
      this.counter = (this.counter + 1) & 0xffff;
    }
  };

  Hlc.prototype.toString = function () {
    return this.physicalMs + '-' + this.counter + '-' + this.nodeId;
  };

  Hlc.parse = function (str) {
    var parts = String(str || '').split('-');
    return { ms: parseInt(parts[0]) || 0, counter: parseInt(parts[1]) || 0, node: parts.slice(2).join('-') || '' };
  };

  Hlc.compare = function (a, b) {
    // retorna -1 si a < b, 0 si iguales, 1 si a > b, null si concurrentes
    if (!a || !b) return null;
    if (a.ms !== b.ms) return a.ms < b.ms ? -1 : 1;
    if (a.counter !== b.counter) return a.counter < b.counter ? -1 : 1;
    if (a.node !== b.node) return null; // concurrente (diferente nodo, misma ms+counter)
    return 0;
  };

  global.CrozzoHlc = { Hlc: Hlc, nowMs: nowMs, parse: Hlc.parse, compare: Hlc.compare };
})(typeof window !== 'undefined' ? window : globalThis);
