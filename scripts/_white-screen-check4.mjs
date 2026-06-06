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
const page = await browser.newPage({ viewport: { width: 800, height: 1024 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message || e)));

await page.addInitScript(() => {
  localStorage.setItem('pos_dian_config', JSON.stringify({ seguridad: { requiereLogin: false } }));
});

async function snap(label) {
  return page.evaluate((label) => {
    const mc = document.getElementById('mainContent');
    const cs = mc ? getComputedStyle(mc) : null;
    return {
      label,
      mainH: mc?.getBoundingClientRect().height,
      mainInner: mc?.innerHTML.length,
      mainVis: cs?.visibility,
      mainOp: cs?.opacity,
      appDisplay: getComputedStyle(document.querySelector('.app-container')).display,
      sidebarOpen: document.getElementById('sidebar')?.classList.contains('open'),
      drawerOpen: document.body.classList.contains('crozzo-sidebar-drawer-open'),
      backdropActive: !!document.querySelector('.sidebar-backdrop.active'),
    };
  }, label);
}

await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForTimeout(5000);
const boot = await snap('boot');

await page.click('[data-crozzo-action="open-menu"]');
await page.waitForTimeout(800);
const menuOpen = await snap('menu-open');

await page.keyboard.press('Escape');
await page.waitForTimeout(500);
const afterEsc = await snap('after-esc');

console.log(JSON.stringify({ boot, menuOpen, afterEsc, errors }, null, 2));
await page.screenshot({ path: 'scripts/_qa-out/white-screen-menu.png', fullPage: true });
await browser.close();
server.close();
