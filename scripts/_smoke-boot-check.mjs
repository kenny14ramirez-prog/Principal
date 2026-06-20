#!/usr/bin/env node
/**
 * Smoke test de arranque del frontend (sin Tauri): sirve src/, carga index.html
 * en un navegador headless y verifica que la app arranca sin errores fatales y
 * pinta el contenedor principal. Es el lazo de verificacion para dividir/mover
 * archivos del frontend con seguridad.
 *
 * Uso: npm run sync && node scripts/_smoke-boot-check.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'src');
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};

const server = createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/') p = '/index.html';
  const file = join(root, p.replace(/^\//, ''));
  try {
    statSync(file);
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const url = `http://127.0.0.1:${port}/index.html`;

// Errores de runtime benignos en entorno navegador puro (sin Tauri/red).
const BENIGN = /ResizeObserver|Script error|Failed to fetch|NetworkError|supabase|Tauri|__TAURI|favicon/i;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const fatal = [];
page.on('pageerror', (e) => {
  const msg = String((e && e.message) || e);
  if (!BENIGN.test(msg)) fatal.push(msg);
});

await page.addInitScript(() => {
  localStorage.setItem('pos_dian_config', JSON.stringify({ seguridad: { requiereLogin: false } }));
  sessionStorage.setItem('crozzo_session_user', 'SMOKE');
  sessionStorage.setItem('crozzo_auth_proof_v1', '1');
  localStorage.setItem('crozzo_user_role', 'super_admin');
  localStorage.setItem('crozzo_device_paired_v1', '1');
});

await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForTimeout(2500);

// Revela la app cerrando overlays de login/pairing (en navegador puro no hay
// flujo de auth real); equivale a entrar a la pantalla principal.
await page.evaluate(() => {
  const lo = document.getElementById('loginOverlay');
  if (lo) lo.setAttribute('hidden', '');
  const pair = document.getElementById('crozzoPairingOverlay');
  if (pair) pair.setAttribute('hidden', '');
  document.body.classList.remove('crozzo-login-open');
  if (typeof window.hideLoginOverlay === 'function') window.hideLoginOverlay();
  if (typeof window.crozzoClosePairingModal === 'function') window.crozzoClosePairingModal();
});
await page.waitForTimeout(500);

const probe = await page.evaluate(() => {
  const app = document.querySelector('.app-container');
  const cs = app ? getComputedStyle(app) : null;
  return {
    hasApp: !!app,
    appDisplay: cs ? cs.display : null,
    hasMain: !!document.getElementById('mainContent'),
    displayName:
      typeof window.crozzoAppDisplayName === 'function' ? window.crozzoAppDisplayName() : null,
    hasNav: typeof window.navigateTo === 'function' || typeof window.renderPage === 'function',
    configReady: !!window.config && typeof window.config === 'object',
    docScannerReady:
      !!window.CrozzoDocScanner &&
      typeof window.CrozzoDocScanner.detectQuad === 'function' &&
      typeof window.CrozzoDocScanner.warpToCanvas === 'function',
    ocrLearningReady:
      !!window.CrozzoOcrLearning && typeof window.CrozzoOcrLearning.record === 'function',
    facturasRenders:
      typeof window.renderFacturas === 'function' &&
      (() => {
        try {
          return String(window.renderFacturas()).length > 50;
        } catch (_) {
          return false;
        }
      })(),
    // Globals criticos que deben sobrevivir a cualquier division de archivos.
    missingGlobals: [
      'crozzoAuditChainHash',
      'crozzoIsReservedBrowserKey',
      'crozzoIsTypingTarget',
      'crozzoPosShortcutsBlocked',
      'crozzoPosGlobalKeydown',
      'normalizarEntradaNit',
      'calcularCUFE',
      'buildUBL21',
      'createProvider',
      'timbrarFactura',
      'renderFacturas',
      'crozzoFacturaEstadoBadgeHtml',
      'confirmClearFacturasHistorial',
    ].filter((n) => typeof window[n] !== 'function'),
  };
});

const checks = [
  ['sin errores fatales de runtime', fatal.length === 0],
  ['existe .app-container', probe.hasApp === true],
  ['app-container visible (display)', probe.appDisplay && probe.appDisplay !== 'none'],
  ['existe #mainContent', probe.hasMain === true],
  ['nombre de app resuelve', !!probe.displayName],
  ['navegacion expuesta (navigateTo/renderPage)', probe.hasNav === true],
  ['singleton config instanciado (ConfigManager)', probe.configReady === true],
  ['CrozzoDocScanner disponible (escaner CV)', probe.docScannerReady === true],
  ['CrozzoOcrLearning disponible (aprendizaje)', probe.ocrLearningReady === true],
  ['pagina facturas renderiza (renderFacturas)', probe.facturasRenders === true],
  [
    `globals criticos presentes${probe.missingGlobals.length ? ' (faltan: ' + probe.missingGlobals.join(', ') + ')' : ''}`,
    probe.missingGlobals.length === 0,
  ],
];

console.log('\n──────── SMOKE DE ARRANQUE ────────');
let failed = 0;
for (const [label, ok] of checks) {
  if (!ok) failed++;
  console.log(`  [${ok ? 'OK' : 'X '}] ${label}`);
}
if (fatal.length) {
  console.log('\n  Errores fatales:');
  for (const f of fatal.slice(0, 10)) console.log('   -', f);
}
console.log('───────────────────────────────────');
console.log(`  ${checks.length - failed}/${checks.length} OK`);

await browser.close();
server.close();
process.exit(failed ? 1 : 0);
