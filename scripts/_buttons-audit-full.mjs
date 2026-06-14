/**
 * Auditoría ampliada de botones — 46 pantallas, onclick + tabs + chrome.
 * node scripts/_buttons-audit-full.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, statSync, writeFileSync, mkdirSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'src');
const outDir = join(root, '..', 'scripts', '_qa-out');
mkdirSync(outDir, { recursive: true });

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

function collectOnclickExprs() {
  const exprs = new Map();
  const re = /onclick\s*=\s*["']([^"']+)["']/g;
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
  if (!first || first.startsWith('return')) return { skip: true };
  if (/^(void|typeof)\s/.test(first)) return { skip: true };
  if (first === 'fn' || /^fn$/i.test(first)) return { skip: true };
  if (/\($/.test(first) && !first.includes('.')) return { skip: true };
  if (/^(event|e)\.(stopPropagation|preventDefault)/.test(first)) return { skip: true };
  if (/^(closeModal|navigateTo|renderPage|showToast|toggleSidebar)\(/.test(first)) return { skip: true };
  const chain = first.replace(/\(\s*$/, '').split('.');
  let ctx = 'window';
  for (const p of chain) {
    if (!p) continue;
    ctx += p.match(/^[a-zA-Z_$][\w$]*$/) ? `.${p}` : `[${JSON.stringify(p)}]`;
  }
  return { check: `typeof (${ctx}) === 'function'`, expr: first };
}

const SKIP_LABEL = /eliminar|borrar|logout|cerrar sesión|anular|reset|destroy|vaciar|limpiar todo|borrar todo/i;
const SKIP_ONCLICK = /logout|deleteUser|eliminar|borrar|anular|resetAll|clearAll|confirmDelete|removeItem|dropTable|navigateTo\(|location\.|window\.open/i;

function isSafeButton(btn) {
  if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return false;
  if (btn.type === 'submit') return false;
  const label = (btn.textContent || btn.getAttribute('aria-label') || '').trim();
  if (SKIP_LABEL.test(label)) return false;
  const oc = btn.getAttribute('onclick') || '';
  if (SKIP_ONCLICK.test(oc)) return false;
  if (btn.closest('[data-crozzo-no-auto-click]')) return false;
  return true;
}

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
    res.end('not found');
  }
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/index.html`;

const staticExprs = collectOnclickExprs();
const checks = [];
for (const [expr, source] of staticExprs) {
  const r = resolveHandler(expr);
  if (r.check) checks.push({ expr, source, check: r.check });
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
await page.waitForTimeout(4000);

await page.evaluate(async () => {
  document.body.classList.add('super-admin-active', 'crozzo-session-superadmin');
  document.body.classList.remove('crozzo-login-open', 'crozzo-auth-guest');
  if (typeof loginWithCredentials === 'function') await loginWithCredentials('KENNY', '141414');
  else if (typeof hideLoginOverlay === 'function') hideLoginOverlay();
  if (typeof crozzoInitCollapsibleSidebar === 'function') crozzoInitCollapsibleSidebar();
});
await page.waitForTimeout(1500);

const missingHandlers = await page.evaluate((items) => {
  const out = [];
  for (const it of items) {
    try {
      if (!eval(it.check)) out.push(it);
    } catch (e) {
      out.push({ ...it, evalError: String(e.message || e) });
    }
  }
  return out;
}, checks);

const navPages = await page.evaluate(() =>
  [...new Set([...document.querySelectorAll('.nav-item[data-page]')].map((el) => el.getAttribute('data-page')).filter(Boolean))]
);

const navResults = [];
for (const pg of navPages) {
  const errsBefore = pageErrors.length;
  await page.evaluate((p) => navigateTo(p), pg);
  await page.waitForTimeout(1800);
  const state = await page.evaluate((targetPage) => {
    const mc = document.getElementById('mainContent');
    const txt = mc ? mc.innerText : '';
    return {
      targetPage,
      mainLen: mc ? mc.innerHTML.length : 0,
      hasErrorCard: /No se pudo cargar esta pantalla/i.test(txt),
      sample: txt.slice(0, 100).replace(/\s+/g, ' '),
    };
  }, pg);
  const newErrs = pageErrors.slice(errsBefore);
  navResults.push({
    ...state,
    pageErrors: newErrs,
    ok: state.mainLen > 80 && !state.hasErrorCard && newErrs.length === 0,
  });
}

const clickResults = [];
for (const nr of navResults.filter((r) => r.ok)) {
  await page.evaluate((p) => navigateTo(p), nr.targetPage);
  await page.waitForTimeout(1200);

  const btns = await page.$$eval(
    '#mainContent button, #mainContent [role="tab"], #mainContent .crozzo-rep-tab, #mainContent .btn, #mainContent [data-action]',
    (els, opts) => {
      function safe(btn) {
        if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return false;
        if (btn.type === 'submit') return false;
        const label = (btn.textContent || btn.getAttribute('aria-label') || '').trim();
        if (new RegExp(opts.skipLabel, 'i').test(label)) return false;
        const oc = btn.getAttribute('onclick') || '';
        if (new RegExp(opts.skipOnclick, 'i').test(oc)) return false;
        return true;
      }
      const out = [];
      const seen = new Set();
      for (const btn of els) {
        if (seen.has(btn)) continue;
        seen.add(btn);
        if (!safe(btn)) continue;
        out.push({
          label: (btn.textContent || btn.getAttribute('aria-label') || btn.className || '').trim().slice(0, 60),
          onclick: (btn.getAttribute('onclick') || '').slice(0, 80),
        });
        if (out.length >= 8) break;
      }
      return out;
    },
    { skipLabel: SKIP_LABEL.source, skipOnclick: SKIP_ONCLICK.source }
  );

  const failures = [];
  const jsErrors = [];
  for (const btn of btns) {
    const errsBefore = pageErrors.length;
    try {
      await page.evaluate((label) => {
        const all = [
          ...document.querySelectorAll('#mainContent button, #mainContent [role="tab"], #mainContent .crozzo-rep-tab, #mainContent .btn, #mainContent [data-action]'),
        ];
        const target = all.find((el) => {
          const t = (el.textContent || el.getAttribute('aria-label') || el.className || '').trim().slice(0, 60);
          return t === label;
        });
        if (target) target.click();
      }, btn.label);
      await page.waitForTimeout(80);
    } catch (e) {
      failures.push({ ...btn, err: String(e.message || e) });
    }
    const newErrs = pageErrors.slice(errsBefore).filter((e) => !/Clipboard|Write permission/i.test(e));
    if (newErrs.length) jsErrors.push({ ...btn, errors: newErrs });
  }
  if (failures.length || jsErrors.length) {
    clickResults.push({ page: nr.targetPage, clicked: btns.length, failures, jsErrors });
  }
}

const report = {
  ts: new Date().toISOString(),
  staticOnclickExprs: staticExprs.size,
  missingHandlersTotal: missingHandlers.length,
  missingHandlers: missingHandlers.slice(0, 30),
  navTotal: navPages.length,
  navOk: navResults.filter((r) => r.ok).length,
  navBroken: navResults.filter((r) => !r.ok),
  clickIssues: clickResults,
  clickIssuesCount: clickResults.length,
  bootPageErrors: pageErrors.filter((e) => !/Clipboard|Write permission/i.test(e)).slice(0, 15),
};

writeFileSync(join(outDir, 'buttons-audit-full.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

await browser.close();
server.close();
process.exit(report.navBroken.length || report.clickIssuesCount > 0 ? 1 : 0);
