/**
 * Prueba rápida de botones que fallaban en auditoría.
 * node scripts/_buttons-fix-check.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, statSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'src');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/') p = '/index.html';
  const file = join(root, p.replace(/^\//, ''));
  try {
    statSync(file);
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'octet-stream' });
    res.end(readFileSync(file));
  } catch {
    res.writeHead(404);
    res.end('');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/index.html`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message || e)));

await page.addInitScript(() => {
  localStorage.setItem('pos_dian_config', JSON.stringify({ seguridad: { requiereLogin: false }, operacion: { modo: 'demo' } }));
  sessionStorage.setItem('crozzo_session_user', 'KENNY');
  localStorage.setItem('crozzo_user_role', 'super_admin');
  window.__CROZZO_IS_TAURI__ = true;
});
await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForTimeout(6000);
await page.evaluate(async () => {
  document.body.classList.add('super-admin-active', 'crozzo-session-superadmin');
  if (typeof loginWithCredentials === 'function') await loginWithCredentials('KENNY', '141414');
});
await page.waitForTimeout(1500);

const tests = [
  { page: 'compras-proveedores', click: () => page.evaluate(() => crozzoOpSetRuntimeMode('online')) },
  { page: 'config-impuestos', click: () => page.evaluate(() => crozzoSetPerfilFiscalImpuestos('restaurante')) },
  { page: 'config-facturas-admin', click: () => page.evaluate(() => saveFacturasAdminConfig()) },
  { page: 'control-acceso', click: () => page.evaluate(() => document.getElementById('ca-ce-yes')?.click()) },
];

const results = [];
for (const t of tests) {
  errors.length = 0;
  await page.evaluate((p) => navigateTo(p), t.page);
  await page.waitForTimeout(4000);
  const before = errors.length;
  await t.click();
  await page.waitForTimeout(500);
  const newErrs = errors.slice(before).filter((e) => !/Clipboard/i.test(e));
  results.push({ page: t.page, ok: newErrs.length === 0, errors: newErrs });
}

console.log(JSON.stringify(results, null, 2));
await browser.close();
server.close();
process.exit(results.some((r) => !r.ok) ? 1 : 0);
