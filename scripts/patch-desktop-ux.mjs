import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = path.join(root, 'src', 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');

const DESKTOP_CSS = `
/* === CROZZO TAURI / DESKTOP UX (solo presentación; lógica POS intacta) === */
@media (prefers-color-scheme: light) {
  html.crozzo-tauri-desktop:not([data-theme]) {
    --bg-primary: #f3f4f6;
    --bg-secondary: #ffffff;
    --text-primary: #111827;
    --text-secondary: #374151;
    --text-muted: #6b7280;
    --border: rgba(17, 24, 39, 0.12);
  }
}
html.crozzo-os-dark { color-scheme: dark; }
html.crozzo-os-light { color-scheme: light; }
body.crozzo-tauri-desktop,
body.crozzo-desktop-env {
  font-size: 15px;
  line-height: 1.5;
}
body.crozzo-tauri-desktop .btn,
body.crozzo-desktop-env .btn {
  min-height: 44px;
  padding: 12px 16px;
  font-size: 0.95rem;
}
body.crozzo-tauri-desktop .form-input,
body.crozzo-tauri-desktop .form-select,
body.crozzo-desktop-env .form-input,
body.crozzo-desktop-env .form-select {
  min-height: 44px;
  padding: 12px 14px;
  font-size: 0.95rem;
}
body.crozzo-tauri-desktop .card,
body.crozzo-desktop-env .card {
  padding: var(--space-4);
}
body.crozzo-tauri-desktop .product-card,
body.crozzo-desktop-env .product-card {
  min-height: 88px;
  padding: 14px;
}
body.crozzo-tauri-desktop .sidebar .nav-item,
body.crozzo-desktop-env .sidebar .nav-item {
  padding: 12px 16px;
}
body.crozzo-tablet .sidebar .nav-group-items .nav-item {
  padding: 14px 18px;
  font-size: 1rem;
}
.crozzo-ctx-menu {
  position: fixed;
  z-index: 10050;
  min-width: 200px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: 6px 0;
  display: none;
}
.crozzo-ctx-menu.is-open { display: block; }
.crozzo-ctx-menu button {
  display: block;
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  color: var(--text-primary);
  padding: 10px 16px;
  font-size: 0.9rem;
  cursor: pointer;
  min-height: 40px;
}
.crozzo-ctx-menu button:hover { background: var(--bg-card); }
body.crozzo-drag-over-productos .main-content .card:first-of-type {
  outline: 2px dashed var(--accent);
  outline-offset: 4px;
}
.crozzo-desktop-badge {
  position: fixed;
  bottom: 8px;
  right: 8px;
  z-index: 9990;
  font-size: 0.65rem;
  opacity: 0.45;
  pointer-events: none;
  color: var(--text-muted);
}
`;

const EARLY_SCRIPT = `<script>
/* CROZZO: detección Tauri / Desktop vs Web / Tablet (inicio) */
(function () {
  var isTauri = typeof window.__TAURI__ !== 'undefined';
  var isDesktop = isTauri || window.location.protocol === 'file:';
  var isTabletUa = /Mobi|Android|Tablet|iPad/i.test(navigator.userAgent);
  var isTabletWidth = window.innerWidth < 1024;
  var isTablet = isTabletUa || isTabletWidth;
  window.CrozzoRuntime = {
    isTauri: isTauri,
    isDesktop: isDesktop,
    isWeb: !isDesktop,
    isTablet: isTablet
  };
  var root = document.documentElement;
  function applyEnvClasses() {
    var body = document.body;
    if (!body) return;
    if (isTauri) {
      root.classList.add('crozzo-tauri');
      body.classList.add('crozzo-tauri-desktop');
    }
    if (isDesktop) body.classList.add('crozzo-desktop-env');
    if (isTablet) body.classList.add('crozzo-tablet');
    else body.classList.remove('crozzo-tablet');
  }
  applyEnvClasses();
  document.addEventListener('DOMContentLoaded', applyEnvClasses);
  try {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    function applyOsTheme() {
      root.classList.toggle('crozzo-os-dark', mq.matches);
      root.classList.toggle('crozzo-os-light', !mq.matches);
    }
    applyOsTheme();
    if (mq.addEventListener) mq.addEventListener('change', applyOsTheme);
    else if (mq.addListener) mq.addListener(applyOsTheme);
  } catch (_) {}
  if (isTauri && window.__TAURI__ && window.__TAURI__.window) {
    try {
      var getWin = window.__TAURI__.window.getCurrentWindow;
      if (typeof getWin === 'function') {
        getWin().setSize({ type: 'Logical', width: 1280, height: 800 }).catch(function () {});
      }
    } catch (_) {}
  }
})();
</script>
`;

const DESKTOP_SCRIPT = `<script>
/* CROZZO: Desktop/Tauri — atajos, menú contextual, drag-drop imágenes */
(function () {
  var RT = window.CrozzoRuntime || {};
  if (!RT.isDesktop && !RT.isTauri) return;

  var ctx = document.getElementById('crozzoCtxMenu');
  if (!ctx) {
    ctx = document.createElement('div');
    ctx.id = 'crozzoCtxMenu';
    ctx.className = 'crozzo-ctx-menu';
    ctx.setAttribute('role', 'menu');
    ctx.setAttribute('aria-hidden', 'true');
    document.body.appendChild(ctx);
  }
  var ctxTarget = null;
  function hideCtx() {
    ctx.classList.remove('is-open');
    ctx.setAttribute('aria-hidden', 'true');
    ctxTarget = null;
  }
  function showCtx(x, y, items) {
    ctx.innerHTML = items.map(function (it) {
      return '<button type="button" data-action="' + it.action + '">' + it.label + '</button>';
    }).join('');
    ctx.style.left = Math.min(x, window.innerWidth - 220) + 'px';
    ctx.style.top = Math.min(y, window.innerHeight - 200) + 'px';
    ctx.classList.add('is-open');
    ctx.setAttribute('aria-hidden', 'false');
  }
  document.addEventListener('click', hideCtx);
  document.addEventListener('contextmenu', function (e) {
    var card = e.target.closest && e.target.closest('.product-card');
    var saleRow = e.target.closest && e.target.closest('#cartItems tr, .cart-item');
    if (!card && !saleRow) return;
    if (typeof currentPage === 'undefined') return;
    if (currentPage !== 'cajero' && currentPage !== 'tablets') return;
    e.preventDefault();
    ctxTarget = card || saleRow;
    var items = [];
    if (card) {
      items.push({ action: 'add', label: '➕ Agregar al pedido' });
      items.push({ action: 'search', label: '🔍 Buscar producto' });
    }
    if (saleRow) items.push({ action: 'print', label: '🖨️ Imprimir' });
    items.push({ action: 'refresh', label: '🔄 Actualizar' });
    showCtx(e.clientX, e.clientY, items);
  });
  ctx.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('button[data-action]');
    if (!btn) return;
    var act = btn.getAttribute('data-action');
    if (act === 'add' && ctxTarget && ctxTarget.classList.contains('product-card')) ctxTarget.click();
    if (act === 'search') {
      var sp = document.getElementById('searchProduct') || document.getElementById('tabletSearchProduct');
      if (sp) { sp.focus(); if (sp.select) sp.select(); }
    }
    if (act === 'print' && typeof window.print === 'function') window.print();
    if (act === 'refresh' && typeof renderPage === 'function' && typeof currentPage !== 'undefined') renderPage(currentPage);
    hideCtx();
  });

  document.addEventListener('dragover', function (e) {
    if (typeof currentPage !== 'undefined' && currentPage === 'productos') {
      e.preventDefault();
      document.body.classList.add('crozzo-drag-over-productos');
    }
  });
  document.addEventListener('dragleave', function () {
    document.body.classList.remove('crozzo-drag-over-productos');
  });
  document.addEventListener('drop', function (e) {
    document.body.classList.remove('crozzo-drag-over-productos');
    if (typeof currentPage === 'undefined' || currentPage !== 'productos') return;
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f || !f.type || f.type.indexOf('image') !== 0) return;
    e.preventDefault();
    var reader = new FileReader();
    reader.onload = function () {
      try { sessionStorage.setItem('crozzo_pending_product_image', reader.result); } catch (_) {}
      if (typeof showToast === 'function') showToast('Imagen recibida — use Editar producto en catálogo', 'info');
    };
    reader.readAsDataURL(f);
  });

  var badge = document.createElement('div');
  badge.className = 'crozzo-desktop-badge';
  badge.textContent = RT.isTauri ? 'Crozzo POS · Tauri' : 'Crozzo POS · Desktop';
  document.body.appendChild(badge);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && typeof crozzoModalIsOpen === 'function' && crozzoModalIsOpen()) {
      e.preventDefault();
      if (typeof closeModal === 'function') closeModal();
      return;
    }
    if (e.key === 'F2' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      if (typeof currentPage !== 'undefined' && currentPage === 'cajero' && typeof clearCart === 'function') {
        e.preventDefault();
        clearCart();
        if (typeof showToast === 'function') showToast('Nueva venta', 'info');
      }
    }
    if (e.key === 'F4' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      var sp = document.getElementById('searchProduct') || document.getElementById('tabletSearchProduct');
      if (sp) { e.preventDefault(); sp.focus(); if (sp.select) sp.select(); }
    }
    if (e.key === 'F5' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      if (typeof renderPage === 'function' && typeof currentPage !== 'undefined') renderPage(currentPage);
      else location.reload();
    }
    if (e.ctrlKey && (e.key === 'p' || e.key === 'P')) {
      e.preventDefault();
      if (typeof window.print === 'function') window.print();
    }
  }, true);
})();
</script>`;

const UPDATER_SCRIPT = `<script type="importmap">
{"imports":{"@tauri-apps/plugin-updater":"./tauri-plugin-updater.js"}}
</script>
<script type="module">
/* CROZZO: Tablet + updater Tauri (fin) */
(function () {
  var RT = window.CrozzoRuntime || {};
  var isTablet = RT.isTablet || /Mobi|Android|Tablet|iPad/i.test(navigator.userAgent) || window.innerWidth < 1024;
  if (isTablet) document.body.classList.add('crozzo-tablet');
  if (window.__TAURI__) {
    import('@tauri-apps/plugin-updater').then(async function (mod) {
      try {
        var update = await mod.check();
        if (update) {
          var ok = confirm('Crozzo POS ' + update.version + ' disponible.\\n¿Descargar e instalar?');
          if (ok) {
            await update.downloadAndInstall();
            location.reload();
          }
        }
      } catch (e) {
        console.info('Updater: sin conexión o sin actualizaciones');
      }
    });
  }
})();
</script>`;

const MARKER_CSS = '/* === CROZZO TAURI / DESKTOP UX';
const MARKER_EARLY = '/* CROZZO: detección Tauri / Desktop vs Web / Tablet (inicio) */';
const MARKER_DESKTOP = '/* CROZZO: Desktop/Tauri — atajos, menú contextual';

if (!html.includes(MARKER_CSS)) {
  html = html.replace('</style>', DESKTOP_CSS + '\n</style>');
}

if (!html.includes(MARKER_EARLY)) {
  html = html.replace('<body>', '<body>\n' + EARLY_SCRIPT);
}

if (!html.includes(MARKER_DESKTOP)) {
  const insertBefore = '<script defer>\n(function () {\n  /**\n   * Orquestación de módulos POS';
  if (html.includes(insertBefore)) {
    html = html.replace(insertBefore, DESKTOP_SCRIPT + '\n' + insertBefore);
  }
}

// Replace old end tauri block
const oldEnd = /<script type="importmap">[\s\S]*?<\/script>\s*<script type="module">[\s\S]*?<\/script><\/body>/;
if (oldEnd.test(html)) {
  html = html.replace(oldEnd, UPDATER_SCRIPT + '</body>');
} else if (!html.includes('CROZZO: Tablet + updater Tauri')) {
  html = html.replace('</body>', UPDATER_SCRIPT + '</body>');
}

// Patch crozzoApplyViewportBodyClass to respect CrozzoRuntime
if (!html.includes('CrozzoRuntime.isTablet')) {
  html = html.replace(
    "    if (w <= 480) b.classList.add('mobile');\n    else if (w <= 1024) b.classList.add('tablet');\n    else b.classList.add('desktop');",
    "    if (w <= 480) b.classList.add('mobile');\n    else if (w <= 1024) b.classList.add('tablet');\n    else b.classList.add('desktop');\n    try {\n      var rt = window.CrozzoRuntime;\n      if (rt && rt.isTablet) b.classList.add('crozzo-tablet');\n      else b.classList.remove('crozzo-tablet');\n      if (rt && rt.isTauri) b.classList.add('crozzo-tauri-desktop');\n    } catch (_) {}"
  );
}

fs.writeFileSync(htmlPath, html);
console.log('Patched', htmlPath, 'bytes:', html.length);
