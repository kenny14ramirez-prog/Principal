/**
 * Bona Origen — Componente inline de IA (chip "✨ Sugerir").
 * Reutilizable en formularios, tablas y páginas.
 */
(function (global) {
  'use strict';

  function chip(label, onClick, icon) {
    icon = icon || '✨';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'crozzo-ai-inline-chip';
    btn.textContent = icon + ' ' + (label || 'Sugerir');
    btn.style.cssText = 'display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border:1px solid rgba(181,154,109,0.4);border-radius:999px;background:rgba(181,154,109,0.08);color:#7A6342;cursor:pointer;font-size:0.78rem;font-weight:600;transition:background 0.15s;';
    btn.addEventListener('mouseenter', function () { btn.style.background = 'rgba(181,154,109,0.18)'; });
    btn.addEventListener('mouseleave', function () { btn.style.background = 'rgba(181,154,109,0.08)'; });
    if (typeof onClick === 'function') btn.addEventListener('click', onClick);
    return btn;
  }

  function badge(text, color) {
    color = color || '#B59A6D';
    var span = document.createElement('span');
    span.className = 'crozzo-ai-inline-badge';
    span.textContent = text;
    span.style.cssText = 'display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;background:' + color + '20;color:' + color + ';font-size:0.72rem;font-weight:600;';
    return span;
  }

  function suggestion(text) {
    var div = document.createElement('div');
    div.className = 'crozzo-ai-inline-suggestion';
    div.style.cssText = 'padding:8px 12px;background:rgba(181,154,109,0.06);border:1px solid rgba(181,154,109,0.2);border-radius:8px;font-size:0.85rem;color:#4a4a4a;margin:4px 0;';
    div.textContent = text;
    return div;
  }

  global.CrozzoAiInline = { chip: chip, badge: badge, suggestion: suggestion };
})(typeof window !== 'undefined' ? window : globalThis);