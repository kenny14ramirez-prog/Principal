import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const srcRoot = join(root, 'src');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/') p = '/index.html';
  const file = join(srcRoot, p.replace(/^\//, ''));
  try {
    statSync(file);
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  } catch {
    res.writeHead(404);
    res.end('');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const baseUrl = `http://127.0.0.1:${server.address().port}/index.html`;

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e?.message || e)));
await page.addInitScript(() => {
  window.__CROZZO_IS_TAURI__ = true;
});
await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForTimeout(5000);

const result = await page.evaluate(async () => {
  const out = {
    hasDiag: typeof window.crozzoDiagComunicacion === 'function',
    hasRepair: typeof window.crozzoRepararComunicacion === 'function',
    hasOpen: typeof window.crozzoAbrirDiagnostico === 'function',
    hasForceSede: typeof window.crozzoForceSedeCanonical === 'function',
  };
  try {
    const rep = await window.crozzoDiagComunicacion();
    out.reportRows = (rep && rep.rows && rep.rows.length) || 0;
    out.reportOkFlag = !!(rep && typeof rep.ok === 'boolean');
    out.rowIds = (rep.rows || []).map((r) => r.id);
  } catch (e) {
    out.diagError = String(e && e.message || e);
  }
  try {
    window.crozzoAbrirDiagnostico();
    await new Promise((r) => setTimeout(r, 600));
    out.overlayPresent = !!document.getElementById('crozzo-diag-comunicacion');
  } catch (e) {
    out.overlayError = String(e && e.message || e);
  }
  return out;
});

console.log('Resultado:', JSON.stringify(result, null, 2));
console.log('Errores de página:', errors.length, errors.slice(0, 5));
await browser.close();
server.close();
const ok = result.hasDiag && result.hasRepair && result.hasOpen && result.hasForceSede && result.reportRows > 0 && result.overlayPresent;
console.log(ok ? 'SMOKE OK' : 'SMOKE FALLO');
process.exit(ok ? 0 : 1);
