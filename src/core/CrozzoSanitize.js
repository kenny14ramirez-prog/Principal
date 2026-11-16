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
      try { return global.DOMPurify.sanitize(String(str)); } catch (_) {}
    }
    return escapeHtml(str);
  }
  function escapeAttr(str) { return escapeHtml(str); }
  // Monkey-patch opcional: sanitizar innerHTML automáticamente (feature flag)
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
  // Intentar instalar al cargar (si el flag está activo)
  try { installInnerHtmlGuard(); } catch (_) {}

  global.CrozzoSanitize = { escapeHtml: escapeHtml, sanitizeHtml: sanitizeHtml, escapeAttr: escapeAttr, installInnerHtmlGuard: installInnerHtmlGuard };
})(typeof window !== 'undefined' ? window : globalThis);
