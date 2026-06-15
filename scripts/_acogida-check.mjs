/**
 * Verifica el sistema de acogida: panel de bienvenida con frase cálida del día
 * y animaciones (sin errores de consola).
 * node scripts/_acogida-check.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, statSync, mkdirSync } from 'fs';
import { join, extname, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const outDir = join(dirname(fileURLToPath(import.meta.url)), '_qa-out');
mkdirSync(outDir, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

const server = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
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
const url = `http://127.0.0.1:${server.address().port}/index.html`;

const report = { ok: true, steps: [], errors: [] };
const step = (id, ok, extra) => { report.steps.push({ id, ok, extra: extra || null }); if (!ok) report.ok = false; };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('pageerror', (e) => report.errors.push(String(e.message || e)));

await page.addInitScript(() => {
  localStorage.setItem('pos_dian_config', JSON.stringify({ seguridad: { requiereLogin: false } }));
});
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(3500);
await page.evaluate(async () => {
  try { if (typeof loginWithCredentials === 'function') await loginWithCredentials('KENNY', '141414'); } catch (_) {}
  var lo = document.getElementById('loginOverlay'); if (lo) lo.setAttribute('hidden', '');
  if (typeof hideLoginOverlay === 'function') hideLoginOverlay();
});
await page.waitForTimeout(900);
// Forzar perfil mixto/novato para que aplique la capa de acogida (psyche).
await page.evaluate(() => {
  window.crozzoGetPerfilOperativo = function () { return { experiencia: 'mixed' }; };
  if (typeof navigateTo === 'function') navigateTo('inicio-operacion');
});
await page.waitForTimeout(1200);

const r = await page.evaluate(() => {
  const strip = document.querySelector('.crozzo-concierge-strip');
  const warm = document.querySelector('.crozzo-concierge-strip__warm');
  const mark = document.querySelector('.crozzo-concierge-strip__mark');
  let sheenAnim = '';
  if (strip) {
    const cs = getComputedStyle(strip, '::before');
    sheenAnim = cs.animationName || '';
  }
  return {
    hasStrip: !!strip,
    warmText: warm ? warm.textContent.trim() : '',
    markAnim: mark ? getComputedStyle(mark).animationName : '',
    sheenAnim,
  };
});
step('welcome-strip', r.hasStrip, { hasStrip: r.hasStrip });
step('warm-phrase', !!r.warmText && r.warmText.length > 8, { warmText: r.warmText });
step('animations', r.markAnim === 'crozzoWelcomeTwinkle' && r.sheenAnim === 'crozzoWelcomeSheen', { markAnim: r.markAnim, sheenAnim: r.sheenAnim });
step('no-page-errors', report.errors.length === 0, { errors: report.errors });

await page.screenshot({ path: join(outDir, 'acogida-check.png') });
await browser.close();
server.close();
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
