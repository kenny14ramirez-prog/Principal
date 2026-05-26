/**
 * Crozzo POS — Catálogo: platos de venta + materias primas (fuente única de MP)
 */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function injectStyles() {
    if (document.getElementById('crozzo-catalogo-hub-css')) return;
    var el = document.createElement('style');
    el.id = 'crozzo-catalogo-hub-css';
    el.textContent =
      '.crozzo-cat-hub{max-width:1200px;margin:0 auto}' +
      '.crozzo-cat-hero{padding:16px 0 12px;border-bottom:1px solid var(--border);margin-bottom:16px}' +
      '.crozzo-cat-hero h1{font-size:1.3rem;margin:0 0 6px}' +
      '.crozzo-cat-hero p{margin:0;opacity:.8;font-size:.88rem;max-width:720px;line-height:1.5}' +
      '.crozzo-cat-tabs{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}' +
      '.crozzo-cat-tabs a,.crozzo-cat-tabs button{padding:10px 16px;border-radius:10px;border:1px solid var(--border);background:var(--bg-card);font-size:13px;font-weight:600;cursor:pointer;text-decoration:none;color:inherit;font-family:inherit}' +
      '.crozzo-cat-tabs .is-active{background:var(--accent);color:#111;border-color:var(--accent)}' +
      '.crozzo-cat-note{padding:12px 14px;border-radius:10px;background:rgba(var(--accent-rgb,201,169,98),.08);border:1px solid rgba(var(--accent-rgb,201,169,98),.2);font-size:.82rem;line-height:1.55;margin-bottom:14px}';
    document.head.appendChild(el);
  }

  function render(active) {
    injectStyles();
    active = active || 'mp';
    return (
      '<div class="crozzo-mod-page crozzo-cat-hub">' +
      '<p class="crozzo-mod-lead">Platos de venta y materias primas. Aquí define <strong>nombre y proveedores</strong>; en Costos define <strong>peso y precios</strong> para costear gramos.</p>' +
      '<nav class="crozzo-mod-nav crozzo-cat-tabs" aria-label="Secciones catálogo">' +
      '<a href="#" class="crozzo-mod-nav__item' +
      (active === 'platos' ? ' is-active' : '') +
      '" data-cat-go="productos">Platos de venta</a>' +
      '<button type="button" class="crozzo-mod-nav__item' +
      (active === 'mp' ? ' is-active' : '') +
      '" data-cat-go="catalogo-mp">Materias primas</button></nav>' +
      (active === 'mp'
        ? '<p class="crozzo-mod-lead crozzo-cat-note"><strong>Materias primas:</strong> nombre y proveedor(es) para recetas, compras e inventario. El <em>nombre</em> se sincroniza con Costos. Unidad, peso y precio total se editan en <strong>Costos → Costeo materias primas</strong>.</p>' +
          (global.CrozzoMatrizMp && global.CrozzoMatrizMp.renderPanel
            ? global.CrozzoMatrizMp.renderPanel({ embedded: true })
            : '<p>Cargando catálogo…</p>')
        : '') +
      '</div>'
    );
  }

  function init(active) {
    var root = document.getElementById('mainContent');
    if (!root) return;
    root.querySelectorAll('[data-cat-go]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        var p = el.getAttribute('data-cat-go');
        if (p && typeof global.navigateTo === 'function') global.navigateTo(p);
      });
    });
    if (active !== 'mp') return;
    var C = global.CrozzoCatalogoMp;
    var boot = function () {
      var panel = root.querySelector('.crozzo-mp-root');
      if (panel && global.CrozzoMatrizMp && global.CrozzoMatrizMp.init) {
        global.CrozzoMatrizMp.init(panel);
      }
    };
    if (C && C.ensureReady) C.ensureReady(boot);
    else boot();
  }

  global.CrozzoCatalogoHub = {
    render: render,
    init: init,
  };
  global.renderCatalogoMp = function () {
    return render('mp');
  };
  global.initCatalogoMp = function () {
    init('mp');
  };
})(typeof window !== 'undefined' ? window : globalThis);
