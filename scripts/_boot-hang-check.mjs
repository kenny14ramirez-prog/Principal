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
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  } catch {
    res.writeHead(404);
    res.end();
  }
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/index.html`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message || e)));

await page.addInitScript(() => {
  localStorage.setItem('pos_dian_config', JSON.stringify({ seguridad: { requiereLogin: true } }));
  window.__CROZZO_IS_TAURI__ = true;
  document.documentElement.classList.add('crozzo-form-desktop', 'tauri-desktop');
});

await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForTimeout(4000);

const boot = await page.evaluate(() => ({
  initDone: !!window.__crozzoAppInitDone,
  bootReady: !!window.__crozzoBootUpdatesReady,
  loginOpen: document.body.classList.contains('crozzo-login-open'),
  gateOpen: document.getElementById('crozzo-boot-update-gate')?.classList.contains('is-open'),
}));

await page.fill('#loginUsername', 'KENNY');
await page.fill('#loginPassword', '141414');
const loginStart = Date.now();
await page.evaluate(() => {
  if (typeof handleLoginSubmit === 'function') handleLoginSubmit();
});

let afterLogin = null;
for (let step = 0; step < 40; step++) {
  await page.waitForTimeout(500);
  afterLogin = await page.evaluate(() => ({
    loginOpen: document.body.classList.contains('crozzo-login-open'),
    loginHidden: document.getElementById('loginOverlay')?.hasAttribute('hidden'),
    mainLen: document.getElementById('mainContent')?.innerHTML?.length || 0,
    mainText: (document.getElementById('mainContent')?.innerText || '').slice(0, 300),
    user: typeof getCurrentUser === 'function' ? getCurrentUser() : null,
    currentPage: typeof currentPage !== 'undefined' ? currentPage : null,
    loginErr: document.getElementById('loginError')?.textContent || '',
    gateOpen: document.getElementById('crozzo-boot-update-gate')?.classList.contains('is-open'),
  }));
  if (afterLogin.mainLen > 500 && !afterLogin.loginOpen) break;
}

const report = {
  ok: afterLogin && afterLogin.mainLen > 500 && !afterLogin.loginOpen && !!afterLogin.user,
  boot,
  afterLogin,
  loginMs: Date.now() - loginStart,
  errors,
};
console.log(JSON.stringify(report, null, 2));
await browser.close();
server.close();
process.exit(report.ok ? 0 : 1);
