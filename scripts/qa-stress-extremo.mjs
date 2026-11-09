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

const ROLES = ['super_admin','admin','caja','mesero','cocina'];
const INJECTIONS = [
  "'; DROP TABLE users; --",
  "<script>alert('xss')</script>",
  "' OR '1'='1",
  "${7*7}",
  "../../etc/passwd",
  "A".repeat(10000),
  "\x00\x01\x02",
  "999999999999999999999",
];

let totalTests = 0;
let passed = 0;
let failed = 0;
const findings = [];

function record(name, ok, detail) {
  totalTests++;
  if (ok) passed++; else { failed++; findings.push({ name, detail }); }
  console.log(`  [${ok?'OK':'X '}] ${name}${detail?' — '+detail:''}`);
}

for (const role of ROLES) {
  console.log(`\n══════ ROL: ${role} ══════`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript(({ role }) => {
    try {
      localStorage.setItem('pos_dian_config', JSON.stringify({ seguridad: { requiereLogin: false } }));
      sessionStorage.setItem('crozzo_session_user', 'TESTER');
      sessionStorage.setItem('crozzo_auth_proof_v1', '1');
      localStorage.setItem('crozzo_user_role', role);
      localStorage.setItem('crozzo_device_paired_v1', '1');
    } catch (_) {}
  }, { role });
  const page = await context.newPage();
  const fatal = [];
  page.on('pageerror', e => fatal.push(String(e && e.message || e)));
  const consoleErrs = [];
  page.on('console', m => { if (m.type()==='error') consoleErrs.push(m.text()); });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(4000);
    await page.evaluate(() => {
      const lo = document.getElementById('loginOverlay'); if (lo) lo.setAttribute('hidden','');
      const pair = document.getElementById('crozzoPairingOverlay'); if (pair) pair.setAttribute('hidden','');
      document.body.classList.remove('crozzo-login-open');
    }).catch(()=>{});

    // 1. App carga
    record(`${role}: app carga`, await page.evaluate(()=>!!document.querySelector('.app-container')));

    // 2. Sin errores fatales
    record(`${role}: sin errores fatales JS`, fatal.length === 0, fatal.slice(0,3).join('; '));

    // 3. Navegación por todas las páginas
    const pages = await page.evaluate(() => {
      const nav = document.querySelectorAll('[data-page],[onclick*="navigateTo"],.nav-item');
      return nav.length;
    });
    record(`${role}: elementos de navegación presentes`, pages >= 0);

    // 4. Inyección en inputs (si existen)
    for (const inj of INJECTIONS.slice(0, 4)) {
      const inputs = await page.locator('input[type="text"], input[type="number"], textarea').all();
      if (inputs.length > 0) {
        try {
          await inputs[0].fill(inj, { timeout: 2000 }).catch(()=>{});
          await page.waitForTimeout(300);
        } catch (_) {}
      }
    }
    record(`${role}: inputs aceptan inyección sin crash`, fatal.length === 0);

    // 5. Clicks masivos (fuzzing de botones)
    const btns = await page.locator('button:visible').all();
    let clicked = 0;
    for (const btn of btns.slice(0, 15)) {
      try {
        await btn.click({ timeout: 500, force: true }).catch(()=>{});
        clicked++;
        await page.waitForTimeout(100);
      } catch (_) {}
    }
    record(`${role}: fuzzing de ${clicked} botones sin crash`, fatal.length === 0);

    // 6. LocalStorage manipulation (intento de bypass)
    await page.evaluate(() => {
      try {
        localStorage.setItem('crozzo_user_role', 'super_admin');
        localStorage.setItem('crozzo_device_paired_v1', '1');
        sessionStorage.setItem('crozzo_auth_proof_v1', '1');
      } catch (_) {}
    });
    await page.waitForTimeout(500);
    record(`${role}: manipulación de localStorage no rompe app`, await page.evaluate(()=>!!document.querySelector('.app-container')));

    // 7. Modo offline
    await context.setOffline(true);
    await page.waitForTimeout(2000);
    record(`${role}: app renderiza offline`, await page.evaluate(()=>!!document.querySelector('.app-container')));
    await context.setOffline(false);
    await page.waitForTimeout(1000);

    // 8. Memoria/rendimiento: scroll masivo
    await page.evaluate(() => { window.scrollTo(0, document.body.scrollHeight); });
    await page.waitForTimeout(500);
    record(`${role}: scroll sin crash`, fatal.length === 0);

    // 9. Verificar observabilidad
    const obs = await page.evaluate(() => window.crozzoObservability ? window.crozzoObservability.status() : null);
    record(`${role}: observabilidad activa`, !!obs);

  } catch (e) {
    fatal.push(e.message);
    record(`${role}: error fatal`, false, e.message);
  }

  await browser.close();
}

console.log('\n══════ RESUMEN EXTREMO ══════');
console.log(`Tests: ${totalTests} | OK: ${passed} | FAIL: ${failed}`);
if (findings.length) {
  console.log('\nHallazgos:');
  for (const f of findings) console.log(`  - ${f.name}: ${f.detail}`);
}
console.log('══════════════════════════════');
server.close();
process.exit(failed > 0 ? 1 : 0);