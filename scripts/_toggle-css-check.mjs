/**
 * Verifica computed styles del sidebar y toggle con html.tauri-desktop forzado.
 * node scripts/_toggle-css-check.mjs
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
await page.addInitScript(() => {
  localStorage.setItem('pos_dian_config', JSON.stringify({ seguridad: { requiereLogin: false }, operacion: { modo: 'demo' } }));
  sessionStorage.setItem('crozzo_session_user', 'KENNY');
  localStorage.setItem('crozzo_user_role', 'super_admin');
  window.__CROZZO_IS_TAURI__ = true;
  window.__TAURI__ = window.__TAURI__ || {};
});
await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForTimeout(6000);
const out = await page.evaluate(async () => {
  document.documentElement.classList.add('tauri-desktop', 'crozzo-vp-ready');
  if (typeof loginWithCredentials === 'function') await loginWithCredentials('KENNY', '141414');
  await new Promise((r) => setTimeout(r, 1200));
  const sb = document.getElementById('sidebar');
  const btn = document.getElementById('menu-toggle-btn');
  const cs = sb ? getComputedStyle(sb) : null;
  const cb = btn ? getComputedStyle(btn) : null;
  const headerH = getComputedStyle(document.documentElement).getPropertyValue('--crozzo-header-h');
  return {
    sidebarClass: sb ? sb.className : null,
    sidebarPaddingTop: cs ? cs.paddingTop : null,
    sidebarTop: cs ? cs.top : null,
    headerH: headerH.trim(),
    btnExists: !!btn,
    btnPosition: cb ? cb.position : null,
    btnTop: cb ? cb.top : null,
    btnLeft: cb ? cb.left : null,
    btnDisplay: cb ? cb.display : null,
  };
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
server.close();
