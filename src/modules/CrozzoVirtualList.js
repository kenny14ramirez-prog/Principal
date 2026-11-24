/**
 * Bona Origen — Virtualización de listas largas (productos, ventas, inventario).
 * Renderiza solo los elementos visibles + buffer para mejorar performance en Android.
 */
(function (global) {
  'use strict';

  function virtualize(container, items, renderItem, opts) {
    opts = opts || {};
    var itemHeight = opts.itemHeight || 56;
    var buffer = opts.buffer || 6;
    if (!container) return;
    var viewport = container.parentElement || container;
    var total = (items && items.length) || 0;

    // Wrapper
    var spacer = document.createElement('div');
    spacer.style.height = (total * itemHeight) + 'px';
    spacer.style.position = 'relative';
    container.innerHTML = '';
    container.appendChild(spacer);

    var pool = [];
    function renderWindow() {
      var scrollTop = container.scrollTop || 0;
      var viewH = container.clientHeight || viewport.clientHeight || 600;
      var start = Math.max(0, Math.floor(scrollTop / itemHeight) - buffer);
      var end = Math.min(total, Math.ceil((scrollTop + viewH) / itemHeight) + buffer);
      // remove out-of-range
      pool.forEach(function (el) {
        var idx = parseInt(el.getAttribute('data-vl-idx'), 10);
        if (idx < start || idx >= end) {
          if (el.parentNode) el.parentNode.removeChild(el);
        }
      });
      pool = pool.filter(function (el) {
        var idx = parseInt(el.getAttribute('data-vl-idx'), 10);
        return idx >= start && idx < end;
      });
      var existing = {};
      pool.forEach(function (el) { existing[el.getAttribute('data-vl-idx')] = el; });
      for (var i = start; i < end; i++) {
        if (existing[String(i)]) continue;
        var el = renderItem(items[i], i);
        if (!el) continue;
        el.setAttribute('data-vl-idx', String(i));
        el.style.position = 'absolute';
        el.style.top = (i * itemHeight) + 'px';
        el.style.left = '0';
        el.style.right = '0';
        el.style.height = itemHeight + 'px';
        spacer.appendChild(el);
        pool.push(el);
      }
    }

    container.style.overflow = 'auto';
    container.style.position = 'relative';
    container.addEventListener('scroll', renderWindow, { passive: true });
    renderWindow();
    // re-render on resize
    try {
      var ro = new ResizeObserver(renderWindow);
      ro.observe(container);
    } catch (_) {}
    container.__crozzoVirtualList = { refresh: renderWindow, setItems: function (ni) { items = ni; total = ni.length; spacer.style.height = (total * itemHeight) + 'px'; pool.forEach(function (el){ if (el.parentNode) el.parentNode.removeChild(el);}); pool = []; renderWindow(); } };
  }

  global.CrozzoVirtualList = { virtualize: virtualize };

  // Auto-apply content-visibility for long lists (CSS-level virtualization)
  try {
    var style = document.createElement('style');
    style.textContent = '.crozzo-virtual-list > * { content-visibility: auto; contain-intrinsic-size: 0 56px; }';
    document.head.appendChild(style);
  } catch (_) {}
})(typeof window !== 'undefined' ? window : globalThis);