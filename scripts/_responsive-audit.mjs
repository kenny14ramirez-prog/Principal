/**
 * Auditoría visual responsiva — captura pantallas clave en celular y tablet
 * (simulando shell APK Android: compact-chrome + tauri-fill) y mide espacio
 * desperdiciado dentro del viewport visible.
 *
 * node scripts/_responsive-audit.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, statSync, mkdirSync } from 'fs';
import { join, extname, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'app');
const outDir = join(dirname(fileURLToPath(import.meta.url)), '_qa-out', 'responsive');
mkdirSync(outDir, { recursive: true });

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

const server = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = join(root, p.replace(/^\//, ''));
  try {
    statSync(file);
    const ext = extname(file);
    res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
    res.end(readFileSync(file));
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const url = `http://127.0.0.1:${port}/index.html`;

const MOBILE_UA =
  'Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const APK_UA =
  'Mozilla/5.0 (Linux; Android 13; SM-A536B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Safari/537.36';

const APK = process.argv.includes('--apk');

const PROFILES = APK
  ? [
      { id: 'cel-apk', label: 'Celular APK', width: 390, height: 844, apk: true },
      { id: 'tablet-apk', label: 'Tablet APK', width: 800, height: 1280, apk: true },
    ]
  : process.argv.includes('--desktop')
  ? [{ id: 'desktop', label: 'Escritorio', width: 1440, height: 900 }]
  : [
      { id: 'cel', label: 'Celular', width: 390, height: 844 },
      { id: 'tablet', label: 'Tablet', width: 800, height: 1024 },
    ];

const PAGES = [
  'inicio-operacion',
  'cajero',
  'venta-comercial',
  'tablets',
  'comandas',
  'compras-cortes',
  'compras-recetario-cocina',
  'facturas',
  'cierre-caja',
  'inventarios',
  'costos-matriz',
  'compras-proveedores',
  'pedidos-internos',
  'config-empresa',
  'config-usuarios',
  'super-admin-nube',
];

const browser = await chromium.launch();

const allResults = [];

for (const profile of PROFILES) {
  const isDesktopProfile = profile.id === 'desktop';
  const context = await browser.newContext({
    viewport: { width: profile.width, height: profile.height },
    userAgent: isDesktopProfile
      ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      : profile.apk
        ? APK_UA
        : MOBILE_UA,
    deviceScaleFactor: 1,
    isMobile: !isDesktopProfile,
    hasTouch: !isDesktopProfile,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));

  if (profile.apk) {
    await page.addInitScript(() => {
      window.__TAURI__ = { core: { invoke: function () { return Promise.reject(new Error('mock')); } } };
      window.__TAURI_INTERNALS__ = { invoke: function () { return Promise.reject(new Error('mock')); } };
      window.__CROZZO_IS_TAURI__ = true;
    });
  }

  await page.addInitScript(() => {
    // Bypass login/pairing
    localStorage.setItem('pos_dian_config', JSON.stringify({ seguridad: { requiereLogin: false } }));
    sessionStorage.setItem('crozzo_session_user', 'KENNY');
    sessionStorage.setItem('crozzo_auth_proof_v1', '1');
    localStorage.setItem('crozzo_user_role', 'super_admin');
    localStorage.setItem('crozzo_device_paired_v1', '1');
    sessionStorage.setItem('crozzo_pairing_autoprompt_v1', '1');
    // Silenciar modales de actualización
    localStorage.setItem('crozzo_update_session_dismiss', '1');
    localStorage.setItem('crozzo_update_dismissed_optional', '1');
    localStorage.setItem('crozzo_update_snooze_until', String(Date.now() + 7 * 24 * 3600 * 1000));
  });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(4000);

  // Login real (Super Admin KENNY) para que navigateTo no bloquee
  await page.evaluate(async () => {
    try {
      if (typeof loginWithCredentials === 'function') {
        await loginWithCredentials('KENNY', '141414');
      }
    } catch (_) {}
    var lo = document.getElementById('loginOverlay');
    if (lo) lo.setAttribute('hidden', '');
    var pair = document.getElementById('crozzoPairingOverlay');
    if (pair) pair.setAttribute('hidden', '');
    document.body.classList.remove('crozzo-login-open', 'crozzo-pairing-open');
    if (typeof hideLoginOverlay === 'function') hideLoginOverlay();
    if (typeof crozzoClosePairingModal === 'function') crozzoClosePairingModal();
    if (typeof crozzoScheduleFormFactor === 'function') crozzoScheduleFormFactor();
  });
  await page.waitForTimeout(1200);

  for (const pageId of PAGES) {
    try {
      await page.evaluate((pid) => {
        // Abrir POS directo para ver pantalla completa de venta
        if (pid === 'cajero' || pid === 'venta-comercial') {
          try { window.tipoServicioCaja = 'directa'; } catch (_) {}
        }
        if (typeof navigateTo === 'function') navigateTo(pid);
        else if (typeof renderPage === 'function') renderPage(pid);
      }, pageId);
    } catch (_) {}
    await page.waitForTimeout(900);

    // Cerrar drawer y overlays/modales que tapen la vista
    await page.evaluate(() => {
      try {
        var s = document.getElementById('sidebar');
        if (s) s.classList.remove('open');
        document.body.classList.remove('crozzo-sidebar-drawer-open');
        var bd = document.querySelector('.sidebar-backdrop');
        if (bd) bd.classList.remove('active');
      } catch (_) {}
      try {
        ['loginOverlay', 'crozzoPairingOverlay'].forEach(function (id) {
          var el = document.getElementById(id);
          if (el) el.setAttribute('hidden', '');
        });
        document.body.classList.remove('crozzo-login-open', 'crozzo-pairing-open');
        if (typeof hideLoginOverlay === 'function') hideLoginOverlay();
        // Quitar modales de actualización u otros overlays flotantes
        document.querySelectorAll(
          '[id*="update"][class*="overlay"], .crozzo-update-detail-modal, #crozzo-update-critical-overlay, .crozzo-modal-overlay.active, .modal-overlay.active'
        ).forEach(function (el) { el.remove(); });
      } catch (_) {}
    });
    await page.waitForTimeout(250);

    const metrics = await page.evaluate(() => {
      function rect(sel) {
        var el = typeof sel === 'string' ? document.querySelector(sel) : sel;
        if (!el) return null;
        var r = el.getBoundingClientRect();
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height), width: Math.round(r.width) };
      }
      var vh = Math.round(window.innerHeight);
      var vw = Math.round(window.innerWidth);
      var mc = document.getElementById('mainContent');
      var mcRect = rect('#mainContent');
      // Altura real del contenido dentro de mainContent
      var contentBottom = mcRect ? mcRect.top : 0;
      if (mc) {
        var kids = Array.from(mc.children);
        kids.forEach(function (k) {
          var r = k.getBoundingClientRect();
          if (r.height > 0 && r.bottom > contentBottom) contentBottom = r.bottom;
        });
      }
      var gapBottom = mcRect ? vh - contentBottom : 0; // espacio vacío bajo el contenido hasta el fondo del viewport
      return {
        vh: vh,
        vw: vw,
        contentH: getComputedStyle(document.documentElement).getPropertyValue('--crozzo-content-h').trim(),
        header: rect('.main-header'),
        app: rect('.app-container'),
        mainContent: mcRect,
        contentBottom: Math.round(contentBottom),
        gapBottom: Math.round(gapBottom),
        bodyClasses: document.body.className,
        htmlClasses: document.documentElement.className,
        scrollH: mc ? mc.scrollHeight : 0,
        clientH: mc ? mc.clientHeight : 0,
        overflowed: mc ? mc.scrollHeight > mc.clientHeight + 2 : false,
      };
    });

    const shot = `${profile.id}-${pageId}.png`;
    await page.screenshot({ path: join(outDir, shot) });
    allResults.push({ profile: profile.id, page: pageId, shot, ...metrics });

    // Variante: carrito desplegado en POS (verificar hoja inferior)
    if (pageId === 'cajero' || pageId === 'venta-comercial') {
      await page.evaluate(() => {
        if (typeof crozzoTogglePosCartSheet === 'function') crozzoTogglePosCartSheet(true);
      });
      await page.waitForTimeout(450);
      await page.screenshot({ path: join(outDir, `${profile.id}-${pageId}-open.png`) });
      await page.evaluate(() => {
        if (typeof crozzoTogglePosCartSheet === 'function') crozzoTogglePosCartSheet(false);
      });
    }
  }

  await context.close();
}

await browser.close();
server.close();

// Resumen de espacio desperdiciado (gapBottom grande = espacio vacío bajo el contenido)
console.log('\n=== Auditoría responsiva ===');
for (const profile of PROFILES) {
  console.log(`\n--- ${profile.label} (${profile.width}x${profile.height}) ---`);
  allResults
    .filter((r) => r.profile === profile.id)
    .forEach((r) => {
      const flag = r.gapBottom > 60 ? '  ⚠ ESPACIO VACÍO' : '';
      console.log(
        `${r.page.padEnd(26)} vh=${r.vh} contentBottom=${r.contentBottom} gapBottom=${String(r.gapBottom).padStart(4)} overflow=${r.overflowed ? 'Y' : 'n'} contentH=${r.contentH}${flag}`
      );
    });
}
console.log(`\nCapturas en: ${outDir}`);
