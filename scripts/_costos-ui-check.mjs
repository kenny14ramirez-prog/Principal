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
const url = `http://127.0.0.1:${port}/index.html`;

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
const scriptLoads = [];
page.on('pageerror', (e) => errors.push(String(e.message || e)));
page.on('console', (msg) => {
  if (msg.type() === 'warning' && String(msg.text()).includes('[crozzo-lazy]')) {
    errors.push('WARN: ' + msg.text());
  }
});
page.on('response', (res) => {
  const u = res.url();
  if (u.includes('modules/Crozzo') && u.includes('.js')) {
    scriptLoads.push({ url: u.split('/').slice(-1)[0], status: res.status() });
  }
});

await page.addInitScript(() => {
  localStorage.setItem('pos_dian_config', JSON.stringify({ seguridad: { requiereLogin: false } }));
  window.__CROZZO_IS_TAURI__ = true;
});

await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForTimeout(4000);

await page.evaluate(() => {
  if (typeof navigateTo === 'function') navigateTo('costos-matriz');
});
await page.waitForTimeout(12000);

const ui = await page.evaluate(() => {
  const mc = document.getElementById('mainContent');
  return {
    goCatalogoMp: !!document.getElementById('crozzoCostosGoCatalogoMp'),
    newPlatoBtn: !!document.getElementById('crozzoCostosToggleNewPlato'),
    newMpBtn: !!document.getElementById('crozzoCosteoMpToggleNew'),
    demoGoCatalogo: !!document.getElementById('crozzoDemoGoCatalogo'),
    menuProductos: !!document.querySelector('[data-page="productos"]'),
    menuCatalogoMp: !!document.querySelector('[data-page="catalogo-mp"]'),
    hasMatrizHero: !!document.getElementById('crozzoMatrizHero'),
    hasLoading: !!document.querySelector('.crozzo-matriz-loading'),
    bodyPageClass: document.body.className,
    mainLen: mc ? mc.innerHTML.length : 0,
    mainText: mc ? mc.innerText.slice(0, 500) : '',
    currentPage: window.__crozzoCurrentPage || window.currentPage || '',
    hasRenderSistemaCostos: typeof window.renderSistemaCostos === 'function',
    hasCrozzoSistemaCostos: !!window.CrozzoSistemaCostos,
  };
});

console.log(JSON.stringify({ ui, scriptLoads, errors }, null, 2));
await browser.close();
server.close();
