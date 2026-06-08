import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, statSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'src');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const server = createServer((req, res) => {
  let p = req.url.split('?')[0];
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

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('page:' + String(e.message || e)));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push('console:' + msg.text());
});

await page.addInitScript(() => {
  localStorage.setItem(
    'pos_dian_config',
    JSON.stringify({
      empresa: { nombreComercial: 'Test', razonSocial: 'Test SAS', nit: '900', direccion: 'Calle 1' },
      seguridad: { requiereLogin: false },
    })
  );
  localStorage.setItem('pos_productos', JSON.stringify([]));
});

await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForFunction(() => typeof navigateTo === 'function', null, { timeout: 30000 });
await page.waitForTimeout(3000);

await page.evaluate(() => navigateTo('costos-matriz'));

for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(1000);
  const snap = await page.evaluate(() => {
    const mc = document.getElementById('mainContent');
    const txt = mc ? mc.innerText : '';
    return {
      loading: txt.includes('Cargando matriz de costos'),
      hasPanel: !!document.querySelector('[data-matriz-panel="resumen"]'),
      hasTabs: !!document.querySelector('[data-matriz-tab="costeo-mp"]'),
      seedLoading: window.__crozzoCostosSeedLoading,
    };
  });
  console.log('t+' + (i + 1) + 's', JSON.stringify(snap));
  if (snap.hasPanel && !snap.loading) break;
}

const final = await page.evaluate(() => {
  const mc = document.getElementById('mainContent');
  const txt = mc ? mc.innerText : '';
  return {
    loading: txt.includes('Cargando matriz de costos'),
    hasPanel: !!document.querySelector('[data-matriz-panel="resumen"]'),
    innerLen: mc ? mc.innerHTML.length : 0,
    txtHead: txt.slice(0, 400),
  };
});

console.log('FINAL', JSON.stringify({ final, errors: errors.slice(0, 25) }, null, 2));
await browser.close();
server.close();
process.exit(final.loading && !final.hasPanel ? 1 : 0);
