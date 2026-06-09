/**
 * Auditoría de botones — navegación + handlers onclick (con namespace).
 * node scripts/_buttons-audit.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, statSync, readdirSync, writeFileSync, mkdirSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'src');
const outDir = join(root, '..', 'scripts', '_qa-out');
mkdirSync(outDir, { recursive: true });

const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
};

function collectOnclickExprs() {
  const exprs = new Map();
  const dirs = ['core', 'modules', 'ui', 'infra', 'bundles'];
  const re = /onclick\s*=\s*["']([^"']+)["']/g;
  for (const d of dirs) {
    let files = [];
    try {
      files = readdirSync(join(root, d)).filter((f) => f.endsWith('.js') || f.endsWith('.html'));
    } catch {
      continue;
    }
    for (const f of files) {
      const text = readFileSync(join(root, d, f), 'utf8');
      let m;
      while ((m = re.exec(text))) {
        const expr = m[1].trim();
        if (!/^if\s*\(/i.test(expr) && !exprs.has(expr)) exprs.set(expr, `${d}/${f}`);
      }
    }
  }
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  let m;
  while ((m = re.exec(html))) {
    const expr = m[1].trim();
    if (!/^if\s*\(/i.test(expr) && !exprs.has(expr)) exprs.set(expr, 'index.html');
  }
  return exprs;
}

function resolveHandler(expr) {
  const first = expr.split(/[;(]/)[0].trim();
  if (!first || first.startsWith('return')) return { ok: true, skip: true };
  if (/^(event|e)\.(stopPropagation|preventDefault)/.test(first)) return { ok: true, skip: true };
  if (/^(closeModal|navigateTo|renderPage|showToast|toggleSidebar)\(/.test(first)) return { ok: true };
  const chain = first.replace(/\(\s*$/, '').split('.');
  let ctx = 'window';
  for (const p of chain) {
    if (!p) continue;
    ctx += p.match(/^[a-zA-Z_$][\w$]*$/) ? `.${p}` : `[${JSON.stringify(p)}]`;
  }
  return { ok: false, check: `typeof (${ctx}) === 'function'`, expr: first };
}

const server = createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/index.html') p = '/index.html';
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

const staticExprs = collectOnclickExprs();
const checks = [];
for (const [expr, source] of staticExprs) {
  const r = resolveHandler(expr);
  if (!r.skip && r.check) checks.push({ expr, source, check: r.check });
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
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

await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
await page.waitForTimeout(8000);

await page.evaluate(async () => {
  document.body.classList.add('super-admin-active', 'crozzo-session-superadmin');
  if (typeof loginWithCredentials === 'function') {
    await loginWithCredentials('KENNY', '141414');
  } else if (typeof hideLoginOverlay === 'function') {
    hideLoginOverlay();
  }
  if (typeof crozzoInitCollapsibleSidebar === 'function') crozzoInitCollapsibleSidebar();
});
await page.waitForTimeout(1500);

const missingAfterBoot = await page.evaluate((items) => {
  const out = [];
  for (const it of items) {
    try {
      // eslint-disable-next-line no-eval
      if (!eval(it.check)) out.push(it);
    } catch (e) {
      out.push(Object.assign({}, it, { evalError: String(e.message || e) }));
    }
  }
  return out;
}, checks.slice(0, 120));

const navPages = await page.evaluate(() =>
  [...new Set([...document.querySelectorAll('.nav-item[data-page]')].map((el) => el.getAttribute('data-page')).filter(Boolean))]
);

const navResults = [];
for (const pg of navPages) {
  const errsBefore = pageErrors.length;
  await page.evaluate((p) => {
    if (typeof navigateTo === 'function') navigateTo(p);
  }, pg);
  await page.waitForTimeout(5000);
  const state = await page.evaluate((targetPage) => {
    const mc = document.getElementById('mainContent');
    const txt = mc ? mc.innerText : '';
    return {
      targetPage,
      currentPage: window.currentPage || window.__crozzoCurrentPage || '',
      mainLen: mc ? mc.innerHTML.length : 0,
      empty: !mc || mc.innerHTML.trim().length < 80,
      hasErrorCard: /No se pudo cargar esta pantalla/i.test(txt),
      sample: txt.slice(0, 140).replace(/\s+/g, ' '),
    };
  }, pg);
  const newPageErrs = pageErrors.slice(errsBefore);
  navResults.push({
    ...state,
    pageErrors: newPageErrs,
    ok: state.mainLen > 80 && !state.hasErrorCard && newPageErrs.length === 0,
  });
}

const brokenNav = navResults.filter((r) => !r.ok);
const buttonClicks = [];

for (const nr of navResults.filter((r) => r.ok).slice(0, 20)) {
  await page.evaluate((p) => {
    if (typeof navigateTo === 'function') navigateTo(p);
  }, nr.targetPage);
  await page.waitForTimeout(4000);
  const clicks = await page.evaluate(() => {
    const failures = [];
    const btns = [...document.querySelectorAll('#mainContent button[type="button"], #mainContent .btn')].slice(0, 12);
    for (const btn of btns) {
      const label = (btn.textContent || '').trim().slice(0, 50);
      if (/eliminar|borrar|logout|cerrar sesión|anular|reset/i.test(label)) continue;
      const oc = btn.getAttribute('onclick') || '';
      if (oc && !/^closeModal|^navigateTo/.test(oc)) continue;
      try {
        btn.click();
      } catch (e) {
        failures.push({ label, err: String(e.message || e) });
      }
    }
    return failures;
  });
  if (clicks.length) buttonClicks.push({ page: nr.targetPage, clicks });
}

const report = {
  ts: new Date().toISOString(),
  staticOnclickExprs: staticExprs.size,
  missingHandlersSample: missingAfterBoot.slice(0, 40),
  missingHandlersTotal: missingAfterBoot.length,
  navTotal: navPages.length,
  navOk: navResults.filter((r) => r.ok).length,
  navBroken: brokenNav.length,
  brokenNav,
  buttonClickFailures: buttonClicks,
  bootPageErrors: pageErrors.slice(0, 20),
};

writeFileSync(join(outDir, 'buttons-audit.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

await browser.close();
server.close();

process.exit(brokenNav.length || missingAfterBoot.length > 5 ? 1 : 0);
