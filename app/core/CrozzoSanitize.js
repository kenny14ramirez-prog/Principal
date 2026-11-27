/**
 * Crozzo POS — Sanitización básica (Fase -2 hardening PoC)
 * ---------------------------------------------------------
 * Escape de HTML para prevenir XSS en innerHTML.
 * Uso: CrozzoSanitize.escapeHtml(str)
 * Nota: migrar a DOMPurify en Fase 3 para sanitización completa.
 */
(function (global) {
  'use strict';
  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function sanitizeHtml(str) {
    if (str == null) return '';
    // Usar DOMPurify si está disponible (CDN), fallback a escapeHtml
    if (global.DOMPurify && typeof global.DOMPurify.sanitize === 'function') {
      try { return global.DOMPurify.sanitize(String(str), { ADD_ATTR: ['onclick', 'onchange', 'onsubmit', 'oninput', 'onkeydown', 'onkeyup', 'onfocus', 'onblur', 'onmouseover', 'onmouseout'], ADD_DATA_ATTR: true }); } catch (_) {}
    }
    return escapeHtml(str);
  }
  function escapeAttr(str) { return escapeHtml(str); }
  // Helper: fetch con timeout (AbortController) para evitar UI colgada
  function fetchWithTimeout(url, opts, timeoutMs) {
    opts = opts || {};
    timeoutMs = timeoutMs || 10000;
    if (typeof AbortController !== 'undefined' && !opts.signal) {
      var ctrl = new AbortController();
      opts.signal = ctrl.signal;
      var timer = setTimeout(function() { try { ctrl.abort(); } catch (_) {} }, timeoutMs);
      return fetch(url, opts).finally(function() { clearTimeout(timer); });
    }
    return fetch(url, opts);
  }
  global.fetchWithTimeout = fetchWithTimeout;
  if (typeof window !== 'undefined') window.fetchWithTimeout = fetchWithTimeout;
  // Helper: parse seguro de JSON desde localStorage
  function safeJsonParse(key, fallback) {
    try {
      var raw = (global.localStorage) ? global.localStorage.getItem(key) : null;
      if (raw == null) return (fallback !== undefined ? fallback : null);
      var parsed = JSON.parse(raw);
      return (parsed !== null && typeof parsed === 'object') ? parsed : (fallback !== undefined ? fallback : null);
    } catch (_) {
      return (fallback !== undefined ? fallback : null);
    }
  }
  global.safeJsonParse = safeJsonParse;
  if (typeof window !== 'undefined') window.safeJsonParse = safeJsonParse;
  // Helper: localStorage seguro (previene crashes en modo privado/bloqueado)
  function safeLocalStorageGet(key, fallback) {
    try { var v = (global.localStorage) ? global.localStorage.getItem(key) : null; return v != null ? v : (fallback !== undefined ? fallback : null); } catch (_) { return (fallback !== undefined ? fallback : null); }
  }
  function safeLocalStorageSet(key, value) {
    try { if (global.localStorage) { global.localStorage.setItem(key, value); return true; } } catch (_) {}
    return false;
  }
  global.safeLocalStorageGet = safeLocalStorageGet;
  global.safeLocalStorageSet = safeLocalStorageSet;
  if (typeof window !== 'undefined') { window.safeLocalStorageGet = safeLocalStorageGet; window.safeLocalStorageSet = safeLocalStorageSet; }
  function installInnerHtmlGuard() {
    try {
      if (!global.CrozzoFeatureFlags || !global.CrozzoFeatureFlags.isEnabled('useSanitizeInnerHtml')) return;
      var proto = global.Element && global.Element.prototype;
      if (!proto || proto.__crozzoSanitizePatched) return;
      var desc = Object.getOwnPropertyDescriptor(proto, 'innerHTML');
      if (!desc || !desc.set) return;
      var origSet = desc.set;
      Object.defineProperty(proto, 'innerHTML', {
        get: desc.get,
        set: function (v) {
          try { v = sanitizeHtml(v); } catch (_) {}
          return origSet.call(this, v);
        },
        configurable: true
      });
      proto.__crozzoSanitizePatched = true;
    } catch (_) {}
  }
  // Intentar instalar al cargar (si el flag está activo) y reintentar tras DOMContentLoaded
  try { installInnerHtmlGuard(); } catch (_) {}
  try {
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('DOMContentLoaded', function () { try { installInnerHtmlGuard(); } catch (_) {} }, { once: true });
    }
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('load', function () { try { installInnerHtmlGuard(); } catch (_) {} }, { once: true });
    }
  } catch (_) {}

  var namedIntervals = {};
  var CrozzoTimers = {
    every: function (name, fn, ms) {
      if (namedIntervals[name]) global.clearInterval(namedIntervals[name]);
      namedIntervals[name] = global.setInterval(fn, ms);
      return namedIntervals[name];
    },
    clear: function (name) {
      if (!namedIntervals[name]) return;
      global.clearInterval(namedIntervals[name]);
      delete namedIntervals[name];
    },
    clearAll: function () {
      Object.keys(namedIntervals).forEach(function (k) { CrozzoTimers.clear(k); });
    }
  };
  global.CrozzoTimers = CrozzoTimers;

  global.CrozzoSanitize = { escapeHtml: escapeHtml, sanitizeHtml: sanitizeHtml, escapeAttr: escapeAttr, installInnerHtmlGuard: installInnerHtmlGuard };
})(typeof window !== 'undefined' ? window : globalThis);
