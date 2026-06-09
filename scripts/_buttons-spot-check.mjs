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
const port = server.address().port;
const browser = await chromium.launch();
const page = await browser.newPage();
await page.addInitScript(() => {
  localStorage.setItem(
    'pos_dian_config',
    JSON.stringify({
      seguridad: { requiereLogin: false },
      operacion: { modo: 'demo', demoSubmodo: 'pos' },
    })
  );
  sessionStorage.setItem('crozzo_session_user', 'KENNY');
  sessionStorage.setItem('crozzo_auth_proof_v1', '1');
  window.__CROZZO_IS_TAURI__ = true;
});
await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForTimeout(8000);
const boot = await page.evaluate(() => ({
  navigateTo: typeof navigateTo,
  renderPage: typeof renderPage,
  loginHidden: document.getElementById('loginOverlay')?.hasAttribute('hidden'),
  mainExists: !!document.getElementById('mainContent'),
  bodyClass: document.body.className.slice(0, 120),
}));
console.log('boot', JSON.stringify(boot));
await page.evaluate(async () => {
  document.body.classList.add('super-admin-active', 'crozzo-session-superadmin');
  document.body.classList.remove('crozzo-login-open', 'crozzo-auth-guest');
  if (typeof loginWithCredentials === 'function') {
    await loginWithCredentials('KENNY', '141414');
  } else if (typeof hideLoginOverlay === 'function') {
    hideLoginOverlay();
  }
});
await page.waitForTimeout(2000);
for (const pg of ['cajero', 'comandas', 'venta-comercial', 'tablets', 'costos-federacion']) {
  await page.evaluate((p) => navigateTo(p), pg);
  await page.waitForTimeout(7000);
  const s = await page.evaluate((p) => ({
    p,
    len: document.getElementById('mainContent')?.innerHTML?.length || 0,
    cur: window.currentPage,
    hasPos: !!document.querySelector('.crozzo-rest-pos'),
    hasComandas: !!document.querySelector('.comandas-container'),
    text: document.getElementById('mainContent')?.innerText?.slice(0, 100),
  }), pg);
  console.log(JSON.stringify(s));
}
await browser.close();
server.close();
