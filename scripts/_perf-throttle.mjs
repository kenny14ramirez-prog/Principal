/**
 * Boot + navegación con CPU throttling (simula tablet).
 * node scripts/_perf-throttle.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, statSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { performance } from 'perf_hooks';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'src');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

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
    res.end('');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/index.html`;

async function runScenario(label, throttleRate) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttleRate });

  await page.addInitScript(() => {
    localStorage.setItem('pos_dian_config', JSON.stringify({ seguridad: { requiereLogin: false }, operacion: { modo: 'demo' } }));
    sessionStorage.setItem('crozzo_session_user', 'KENNY');
    localStorage.setItem('crozzo_user_role', 'super_admin');
    window.__CROZZO_IS_TAURI__ = true;
  });

  const t0 = performance.now();
  await page.goto(url, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => typeof navigateTo === 'function', { timeout: 120000 });
  await page.evaluate(async () => {
    if (typeof loginWithCredentials === 'function') await loginWithCredentials('KENNY', '141414');
  });
  const bootMs = Math.round(performance.now() - t0);

  const pages = ['cajero', 'comandas', 'costos-matriz', 'centro-procesos'];
  const nav = [];
  for (const pg of pages) {
    const s = performance.now();
    await page.evaluate((p) => navigateTo(p), pg);
    await page.waitForTimeout(800);
    const len = await page.evaluate(() => document.getElementById('mainContent')?.innerHTML.length || 0);
    nav.push({ page: pg, ms: Math.round(performance.now() - s), mainLen: len });
  }

  const heap = await page.evaluate(() =>
    performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) : null
  );
  await browser.close();
  return { label, throttleRate, bootMs, nav, heapMb: heap };
}

const results = [];
results.push(await runScenario('desktop', 1));
results.push(await runScenario('tablet-4x', 4));
results.push(await runScenario('tablet-6x', 6));

console.log(JSON.stringify(results, null, 2));
server.close();
