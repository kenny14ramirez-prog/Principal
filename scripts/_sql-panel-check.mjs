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
  try { statSync(file); res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' }); res.end(readFileSync(file)); }
  catch { res.writeHead(404); res.end(''); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const baseUrl = `http://127.0.0.1:${server.address().port}/index.html`;
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e?.message || e)));
await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForTimeout(4000);
const res = await page.evaluate(() => {
  const out = { hasExtras: !!(window.CrozzoSupabaseSqlExtras && window.CrozzoSupabaseSqlExtras.list) };
  const list = out.hasExtras ? window.CrozzoSupabaseSqlExtras.list() : [];
  const entry = list.find((s) => s.key === 'comunicacion_repair');
  out.found = !!entry;
  out.title = entry && entry.title;
  out.sqlKb = entry && Math.round(entry.sql.length / 1024);
  out.hasSedeRuntime = entry && entry.sql.includes('crozzo_sede_runtime');
  out.hasComandas = entry && entry.sql.includes('public.comandas');
  out.hasWriteRls = entry && entry.sql.includes('with check (true)');
  return out;
});
console.log('Resultado:', JSON.stringify(res, null, 2));
console.log('Errores de página:', errors.length, errors.slice(0, 5));
await browser.close();
server.close();
const ok = res.found && res.hasSedeRuntime && res.hasComandas && res.hasWriteRls && errors.length === 0;
console.log(ok ? 'PANEL OK' : 'PANEL FALLO');
process.exit(ok ? 0 : 1);
