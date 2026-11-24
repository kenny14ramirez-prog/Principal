/**
 * Bona Origen — Contexto IA por página (inyector de snapshot).
 * Permite al asistente IA saber en qué pantalla está el usuario y qué datos hay.
 */
(function (global) {
  'use strict';

  var _registry = {}; // page -> function() { return snapshot }
  var _current = null;

  function register(page, fn) {
    if (typeof page !== 'string' || typeof fn !== 'function') return;
    _registry[page] = fn;
  }

  function snapshot(page) {
    page = page || (typeof global.currentPage !== 'undefined' ? global.currentPage : '');
    var snap = { page: page, timestamp: Date.now(), user: null, data: null };
    try {
      if (typeof global.getCurrentUser === 'function') {
        var u = global.getCurrentUser();
        if (u) snap.user = { id: u.id, rol: u.rol, nombre: u.nombre };
      }
    } catch (_) {}
    // Try registered function first
    try {
      if (_registry[page]) snap.data = _registry[page]();
    } catch (_) { snap.data = null; }
    // Fallback: gather common data from global scope
    if (!snap.data) {
      var d = {};
      try { if (typeof global.products !== 'undefined' && Array.isArray(global.products)) d.productCount = global.products.length; } catch (_) {}
      try { if (typeof global.currentCart !== 'undefined' && Array.isArray(global.currentCart)) d.cartItems = global.currentCart.length; } catch (_) {}
      try { if (typeof global.currentPage !== 'undefined') d.page = global.currentPage; } catch (_) {}
      if (Object.keys(d).length > 0) snap.data = d;
    }
    _current = snap;
    return snap;
  }

  function current() { return _current; }

  function forPrompt(page) {
    var snap = snapshot(page);
    var lines = ['Pantalla actual: ' + (snap.page || '?')];
    if (snap.user) lines.push('Usuario: ' + (snap.user.nombre || snap.user.id) + ' (' + (snap.user.rol || '') + ')');
    if (snap.data) {
      try { lines.push('Datos: ' + JSON.stringify(snap.data).slice(0, 2000)); } catch (_) {}
    }
    return lines.join(' | ');
  }

  global.CrozzoAiContext = { register: register, snapshot: snapshot, current: current, forPrompt: forPrompt };
})(typeof window !== 'undefined' ? window : globalThis);