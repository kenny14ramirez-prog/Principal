/**
 * Auditoría de rendimiento — boot, navegación, localStorage, paint.
 * node scripts/_perf-audit.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, statSync, readdirSync, writeFileSync, mkdirSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { performance } from 'perf_hooks';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'src');
const outDir = join(root, '..', 'scripts', '_qa-out');
mkdirSync(outDir, { recursive: true });

const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
};

function collectScriptSizes(htmlPath) {
  const html = readFileSync(htmlPath, 'utf8');
  const scripts = [
    ...html.matchAll(/<script\s+src="([^"]+)"([^>]*)>/g),
  ].map((m) => ({ src: m[1], defer: /defer/.test(m[2]), sync: !/defer/.test(m[2]) }));
  let syncKb = 0;
  let deferKb = 0;
  const deferList = [];
  for (const s of scripts) {
    if (s.src.startsWith('http')) continue;
    const p = join(root, s.src.replace(/^\.\//, ''));
    try {
      const kb = statSync(p).size / 1024;
      if (s.sync) syncKb += kb;
      else {
        deferKb += kb;
        deferList.push({ src: s.src, kb: Math.round(kb * 10) / 10 });
      }
    } catch (_) {}
  }
  deferList.sort((a, b) => b.kb - a.kb);
  const cssPath = join(root, 'css/CrozzoPosStyles.css');
  const cssKb = statSync(cssPath).size / 1024;
  return { syncKb, deferKb, cssKb, deferList, scriptCount: scripts.length };
}

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

const staticSizes = collectScriptSizes(join(root, 'index.html'));

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await context.newPage();

const navTimings = [];
const pageErrors = [];

page.on('pageerror', (e) => pageErrors.push(String(e.message || e)));

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
  localStorage.setItem('crozzo_user_role', 'super_admin');
  window.__CROZZO_IS_TAURI__ = true;
});

const t0 = performance.now();
await page.goto(url, { waitUntil: 'load', timeout: 120000 });
const loadMs = performance.now() - t0;

await page.waitForFunction(
  () => typeof window.navigateTo === 'function' && typeof window.renderPage === 'function',
  { timeout: 60000 }
);
const readyMs = performance.now() - t0;

await page.evaluate(async () => {
  document.body.classList.add('super-admin-active', 'crozzo-session-superadmin');
  if (typeof loginWithCredentials === 'function') await loginWithCredentials('KENNY', '141414');
  else if (typeof hideLoginOverlay === 'function') hideLoginOverlay();
});
const interactiveMs = performance.now() - t0;

const perfEntries = await page.evaluate(() => {
  const nav = performance.getEntriesByType('navigation')[0];
  const resources = performance.getEntriesByType('resource')
    .filter((r) => r.initiatorType === 'script' || r.initiatorType === 'link')
    .map((r) => ({
      name: r.name.split('/').pop().split('?')[0],
      type: r.initiatorType,
      duration: Math.round(r.duration),
      transfer: Math.round(r.transferSize || 0),
    }))
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 25);
  return {
    domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
    loadEvent: nav ? Math.round(nav.loadEventEnd) : null,
    scriptResources: resources,
    jsHeap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) : null,
  };
});

const testPages = [
  'cajero',
  'comandas',
  'venta-comercial',
  'tablets',
  'costos-federacion',
  'costos-matriz',
  'recepcion-facturas',
  'centro-procesos',
  'inventarios',
  'reportes',
];

for (const pg of testPages) {
  const start = performance.now();
  await page.evaluate((p) => {
    if (typeof navigateTo === 'function') navigateTo(p);
  }, pg);
  await page.waitForTimeout(300);
  const state = await page.evaluate((targetPage) => {
    const mc = document.getElementById('mainContent');
    return {
      mainLen: mc ? mc.innerHTML.length : 0,
      hasError: mc ? /No se pudo cargar/i.test(mc.innerText) : true,
    };
  }, pg);
  let stable = state.mainLen > 80 && !state.hasError;
  if (!stable) {
    await page.waitForTimeout(4000);
    const again = await page.evaluate(() => {
      const mc = document.getElementById('mainContent');
      return { mainLen: mc ? mc.innerHTML.length : 0, hasError: mc ? /No se pudo cargar/i.test(mc.innerText) : true };
    });
    stable = again.mainLen > 80 && !again.hasError;
  }
  navTimings.push({
    page: pg,
    ms: Math.round(performance.now() - start),
    mainLen: state.mainLen,
    ok: stable,
  });
}

const lsAudit = await page.evaluate(() => {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    const v = localStorage.getItem(k) || '';
    keys.push({ key: k, kb: Math.round((v.length * 2) / 1024 * 10) / 10 });
  }
  keys.sort((a, b) => b.kb - a.kb);
  const parseTimes = {};
  for (const item of keys.slice(0, 5)) {
    const raw = localStorage.getItem(item.key);
    if (!raw || raw[0] !== '{') continue;
    const t0 = performance.now();
    try {
      JSON.parse(raw);
    } catch (_) {}
    parseTimes[item.key] = Math.round(performance.now() - t0);
  }
  return { keys: keys.slice(0, 15), parseTimes, totalKb: Math.round(keys.reduce((s, k) => s + k.kb, 0) * 10) / 10 };
});

const innerHtmlCount = await page.evaluate(() => {
  const src = typeof renderPage === 'function' ? renderPage.toString() : '';
  return (src.match(/innerHTML\s*=/g) || []).length;
});

const report = {
  ts: new Date().toISOString(),
  static: {
    ...staticSizes,
    syncKb: Math.round(staticSizes.syncKb * 10) / 10,
    deferKb: Math.round(staticSizes.deferKb * 10) / 10,
    cssKb: Math.round(staticSizes.cssKb * 10) / 10,
    totalBootKb: Math.round((staticSizes.syncKb + staticSizes.deferKb + staticSizes.cssKb) * 10) / 10,
    topDefer: staticSizes.deferList.slice(0, 12),
  },
  runtime: {
    loadMs: Math.round(loadMs),
    readyMs: Math.round(readyMs),
    interactiveMs: Math.round(interactiveMs),
    jsHeapMb: perfEntries.jsHeap,
    domContentLoadedMs: perfEntries.domContentLoaded,
    loadEventMs: perfEntries.loadEvent,
    slowestResources: perfEntries.scriptResources.slice(0, 12),
  },
  navigation: navTimings,
  localStorage: lsAudit,
  renderPageInnerHtmlAssignments: innerHtmlCount,
  pageErrors: pageErrors.slice(0, 10),
};

writeFileSync(join(outDir, 'perf-audit.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

await browser.close();
server.close();
