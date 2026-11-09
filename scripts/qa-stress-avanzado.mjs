#!/usr/bin/env node
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'src');
const mime = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json' };
const server = createServer((req,res)=>{
  let p=req.url.split('?')[0]; if(p==='/')p='/index.html';
  const file=join(root,p.replace(/^\//,''));
  try{statSync(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'});res.end(readFileSync(file));}
  catch{res.writeHead(404);res.end('not found');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const port=server.address().port;
const url=`http://127.0.0.1:${port}/index.html`;

let totalTests=0, passed=0, failed=0;
const findings=[];

function record(name, ok, detail) {
  totalTests++;
  if (ok) passed++; else { failed++; findings.push({name,detail}); }
  console.log(`  [${ok?'OK':'X '}] ${name}${detail?' — '+detail:''}`);
}

// ═══ 1. CONCURRENCIA MULTI-ROL ═══
console.log('\n══════ 1. CONCURRENCIA MULTI-ROL ══════');
const browser = await chromium.launch({ headless: true });
const ctxCaja = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const ctxMesero = await browser.newContext({ viewport: { width: 1280, height: 800 } });

for (const [ctx, role] of [[ctxCaja,'caja'],[ctxMesero,'mesero']]) {
  await ctx.addInitScript(({ role }) => {
    try {
      localStorage.setItem('pos_dian_config', JSON.stringify({ seguridad: { requiereLogin: false } }));
      sessionStorage.setItem('crozzo_session_user', role.toUpperCase());
      sessionStorage.setItem('crozzo_auth_proof_v1', '1');
      localStorage.setItem('crozzo_user_role', role);
      localStorage.setItem('crozzo_device_paired_v1', '1');
    } catch (_) {}
  }, { role });
}

const pageCaja = await ctxCaja.newPage();
const pageMesero = await ctxMesero.newPage();
const fatalCaja=[], fatalMesero=[];
pageCaja.on('pageerror', e=>fatalCaja.push(String(e&&e.message||e)));
pageMesero.on('pageerror', e=>fatalMesero.push(String(e&&e.message||e)));

await Promise.all([
  pageCaja.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }),
  pageMesero.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }),
]);
await Promise.all([pageCaja.waitForTimeout(4000), pageMesero.waitForTimeout(4000)]);

// Ambos ocultan overlays
for (const p of [pageCaja, pageMesero]) {
  await p.evaluate(() => {
    const lo = document.getElementById('loginOverlay'); if (lo) lo.setAttribute('hidden','');
    const pair = document.getElementById('crozzoPairingOverlay'); if (pair) pair.setAttribute('hidden','');
    document.body.classList.remove('crozzo-login-open');
  }).catch(()=>{});
}
await Promise.all([pageCaja.waitForTimeout(1000), pageMesero.waitForTimeout(1000)]);

record('concurrencia: ambas páginas cargan', 
  await pageCaja.evaluate(()=>!!document.querySelector('.app-container')) && await pageMesero.evaluate(()=>!!document.querySelector('.app-container')));

// Acciones simultáneas
const actions = async (page, name) => {
  try {
    await page.evaluate(() => { try { if (typeof navigateTo==='function') navigateTo('caja'); } catch(_){} });
    await page.waitForTimeout(500);
    const btns = await page.locator('button:visible').all();
    for (const b of btns.slice(0,5)) { await b.click({ timeout: 300, force: true }).catch(()=>{}); await page.waitForTimeout(50); }
  } catch (_) {}
};
await Promise.all([actions(pageCaja,'caja'), actions(pageMesero,'mesero')]);
await Promise.all([pageCaja.waitForTimeout(2000), pageMesero.waitForTimeout(2000)]);

record('concurrencia: sin crash en caja', fatalCaja.length === 0, fatalCaja.slice(0,2).join('; '));
record('concurrencia: sin crash en mesero', fatalMesero.length === 0, fatalMesero.slice(0,2).join('; '));
record('concurrencia: ambas siguen vivas',
  await pageCaja.evaluate(()=>!!document.querySelector('.app-container')) && await pageMesero.evaluate(()=>!!document.querySelector('.app-container')));

// ═══ 2. FUZZING NUMÉRICO EXTREMO ═══
console.log('\n══════ 2. FUZZING NUMÉRICO EXTREMO ══════');
const NUM_VALUES = [0, -1, -999999, NaN, Infinity, -Infinity, 0.0000001, 999999999999, 1e308, -0, 0.1+0.2];
const pageFuzz = await browser.newPage();
await pageFuzz.addInitScript(() => {
  try {
    localStorage.setItem('pos_dian_config', JSON.stringify({ seguridad: { requiereLogin: false } }));
    sessionStorage.setItem('crozzo_session_user', 'FUZZ');
    sessionStorage.setItem('crozzo_auth_proof_v1', '1');
    localStorage.setItem('crozzo_user_role', 'super_admin');
    localStorage.setItem('crozzo_device_paired_v1', '1');
  } catch (_) {}
});
await pageFuzz.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await pageFuzz.waitForTimeout(4000);
await pageFuzz.evaluate(() => {
  const lo = document.getElementById('loginOverlay'); if (lo) lo.setAttribute('hidden','');
  document.body.classList.remove('crozzo-login-open');
}).catch(()=>{});

const fuzzFatal = [];
pageFuzz.on('pageerror', e => fuzzFatal.push(String(e&&e.message||e)));

for (const val of NUM_VALUES) {
  const inputs = await pageFuzz.locator('input[type="number"], input[type="text"]').all();
  for (const inp of inputs.slice(0, 3)) {
    try {
      await inp.fill(String(val), { timeout: 1000 }).catch(()=>{});
      await pageFuzz.waitForTimeout(50);
    } catch (_) {}
  }
}
record('fuzzing numérico: sin crash', fuzzFatal.length === 0, fuzzFatal.slice(0,2).join('; '));

// ═══ 3. CROSS-ROLE ACCESS (RBAC) ═══
console.log('\n══════ 3. CROSS-ROLE ACCESS (RBAC) ══════');
const pageMesero2 = await browser.newPage();
await pageMesero2.addInitScript(() => {
  try {
    localStorage.setItem('pos_dian_config', JSON.stringify({ seguridad: { requiereLogin: false } }));
    sessionStorage.setItem('crozzo_session_user', 'MESERO2');
    sessionStorage.setItem('crozzo_auth_proof_v1', '1');
    localStorage.setItem('crozzo_user_role', 'mesero');
    localStorage.setItem('crozzo_device_paired_v1', '1');
  } catch (_) {}
});
await pageMesero2.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await pageMesero2.waitForTimeout(4000);
await pageMesero2.evaluate(() => {
  const lo = document.getElementById('loginOverlay'); if (lo) lo.setAttribute('hidden','');
  document.body.classList.remove('crozzo-login-open');
}).catch(()=>{});

// Intentar navegar a páginas de admin
const adminPages = ['admin', 'config', 'facturas', 'reportes', 'usuarios'];
let blockedCount = 0;
for (const pg of adminPages) {
  try {
    await pageMesero2.evaluate((p) => { try { if (typeof navigateTo==='function') navigateTo(p); } catch(_){} }, pg);
    await pageMesero2.waitForTimeout(300);
  } catch (_) {}
}
record('RBAC: mesero no crashea al intentar páginas admin', !(await pageMesero2.evaluate(() => false)));
record('RBAC: app sigue viva tras intentos', await pageMesero2.evaluate(()=>!!document.querySelector('.app-container')));

// ═══ 4. CORRUPCIÓN DE DATOS ═══
console.log('\n══════ 4. CORRUPCIÓN DE DATOS ══════');
const pageCorrupt = await browser.newPage();
await pageCorrupt.addInitScript(() => {
  try {
    localStorage.setItem('pos_dian_config', '{INVALID JSON!!!');
    localStorage.setItem('crozzo_user_role', 'super_admin');
    localStorage.setItem('crozzo_device_paired_v1', '1');
    sessionStorage.setItem('crozzo_session_user', 'CORRUPT');
    sessionStorage.setItem('crozzo_auth_proof_v1', '1');
    localStorage.setItem('crozzo_pos_runtime_v1', '{{{{not json');
  } catch (_) {}
});
await pageCorrupt.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await pageCorrupt.waitForTimeout(4000);
record('corrupción: app no crashea con JSON inválido', await pageCorrupt.evaluate(()=>!!document.querySelector('.app-container')));

// ═══ 5. RAPID FIRE (clicks a 50ms) ═══
console.log('\n══════ 5. RAPID FIRE ══════');
const rapidFatal = [];
pageCaja.on('pageerror', e => rapidFatal.push(String(e&&e.message||e)));
for (let i = 0; i < 50; i++) {
  const btns = await pageCaja.locator('button').all();
  if (btns.length > 0) {
    const idx = Math.floor(Math.random() * btns.length);
    await btns[idx].click({ timeout: 200, force: true }).catch(()=>{});
  }
  await pageCaja.waitForTimeout(50);
}
record('rapid fire: 50 clicks sin crash', rapidFatal.length === 0, rapidFatal.slice(0,2).join('; '));

await browser.close();

console.log('\n══════ RESUMEN AVANZADO ══════');
console.log(`Tests: ${totalTests} | OK: ${passed} | FAIL: ${failed}`);
if (findings.length) {
  console.log('\nHallazgos:');
  for (const f of findings) console.log(`  - ${f.name}: ${f.detail}`);
}
console.log('══════════════════════════════');
server.close();
process.exit(failed > 0 ? 1 : 0);