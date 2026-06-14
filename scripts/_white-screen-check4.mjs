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
  sessionStorage.setItem('crozzo_session_user', 'KENNY');
  sessionStorage.setItem('crozzo_auth_proof_v1', '1');
  localStorage.setItem('crozzo_user_role', 'super_admin');
  localStorage.setItem('crozzo_device_paired_v1', '1');
  localStorage.setItem(
    'crozzo_lan_config',
    JSON.stringify({ role: 'A', serverIp: '192.168.1.50', centralIp: '192.168.1.50', port: 3000, lanSyncEnabled: true })
  );
  sessionStorage.setItem('crozzo_pairing_autoprompt_v1', '1');
  document.documentElement.classList.add('crozzo-form-tablet');
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
await page.waitForTimeout(3000);

await page.evaluate(() => {
  document.documentElement.classList.remove('tauri-desktop', 'crozzo-form-desktop');
  document.documentElement.classList.add('crozzo-form-tablet');
  document.body.classList.add('tablet', 'crozzo-touch-shell');
  document.body.classList.remove('crozzo-login-open', 'desktop');
  var lo = document.getElementById('loginOverlay');
  if (lo) lo.setAttribute('hidden', '');
  var pair = document.getElementById('crozzoPairingOverlay');
  if (pair) pair.setAttribute('hidden', '');
  if (typeof hideLoginOverlay === 'function') hideLoginOverlay();
  if (typeof crozzoClosePairingModal === 'function') crozzoClosePairingModal();
  if (typeof crozzoRefreshTabletBottomNav === 'function') crozzoRefreshTabletBottomNav();
  else if (window.CrozzoTabletNav && typeof CrozzoTabletNav.refresh === 'function') CrozzoTabletNav.refresh();
});

const boot = await snap('boot');

const menuBtn = page.locator('[data-crozzo-action="open-menu"], .crozzo-mbn-more, .mobile-menu-btn').first();
const menuVisible = await menuBtn.isVisible().catch(() => false);
if (!menuVisible) {
  await page.evaluate(() => {
    if (typeof crozzoOpenSidebarDrawer === 'function') crozzoOpenSidebarDrawer();
    else if (typeof toggleSidebar === 'function') toggleSidebar();
  });
} else {
  await menuBtn.click();
}
await page.waitForTimeout(800);
const menuOpen = await snap('menu-open');

await page.keyboard.press('Escape');
await page.waitForTimeout(500);
const afterEsc = await snap('after-esc');

const ok =
  boot.mainVis === 'visible' &&
  boot.mainOp === '1' &&
  boot.appDisplay === 'flex' &&
  menuOpen.drawerOpen === true &&
  afterEsc.drawerOpen === false;
const report = { ok, menuVisible, boot, menuOpen, afterEsc, errors };
console.log(JSON.stringify(report, null, 2));
await page.screenshot({ path: 'scripts/_qa-out/white-screen-menu.png', fullPage: true });
await browser.close();
server.close();
process.exit(ok ? 0 : 1);
