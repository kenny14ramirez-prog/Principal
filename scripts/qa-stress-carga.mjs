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
function record(name, ok, detail) { totalTests++; if (ok) passed++; else { failed++; findings.push({name,detail}); } console.log(`  [${ok?'OK':'X '}] ${name}${detail?' — '+detail:''}`); }

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await context.addInitScript(() => {
  try {
    localStorage.setItem('pos_dian_config', JSON.stringify({ seguridad: { requiereLogin: false } }));
    sessionStorage.setItem('crozzo_session_user', 'LOADTEST');
    sessionStorage.setItem('crozzo_auth_proof_v1', '1');
    localStorage.setItem('crozzo_user_role', 'super_admin');
    localStorage.setItem('crozzo_device_paired_v1', '1');
  } catch (_) {}
});
const page = await context.newPage();
const fatal = [];
page.on('pageerror', e => fatal.push(String(e&&e.message||e)));
const memBefore = process.memoryUsage().heapUsed;

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(4000);
await page.evaluate(() => {
  const lo = document.getElementById('loginOverlay'); if (lo) lo.setAttribute('hidden','');
  document.body.classList.remove('crozzo-login-open');
}).catch(()=>{});

// ═══ 1. INYECCIÓN MASIVA DE DATOS ═══
console.log('\n══════ 1. INYECCIÓN MASIVA DE DATOS ══════');
const injectResult = await page.evaluate(() => {
  try {
    // Generar 1000 productos ficticios en localStorage
    const products = [];
    for (let i = 0; i < 1000; i++) {
      products.push({ id: i, nombre: 'Producto ' + i, precio: Math.random()*100000, stock: Math.floor(Math.random()*100), categoria: 'cat'+(i%10) });
    }
    localStorage.setItem('crozzo_test_products', JSON.stringify(products));
    // Generar 500 facturas
    const facturas = [];
    for (let i = 0; i < 500; i++) {
      facturas.push({ id: i, numero: 'FAC-'+i, total: Math.random()*500000, fecha: new Date().toISOString(), items: [{id:1,qty:2,price:1000}] });
    }
    localStorage.setItem('crozzo_test_facturas', JSON.stringify(facturas));
    return { products: products.length, facturas: facturas.length, ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});
record('inyección 1000 productos + 500 facturas', injectResult.ok, injectResult.error);
record('datos persisten en localStorage', await page.evaluate(() => {
  const p = JSON.parse(localStorage.getItem('crozzo_test_products')||'[]');
  const f = JSON.parse(localStorage.getItem('crozzo_test_facturas')||'[]');
  return p.length === 1000 && f.length === 500;
}));

// ═══ 2. RED INTERMITENTE ═══
console.log('\n══════ 2. RED INTERMITENTE (10 ciclos) ══════');
let networkCrashes = 0;
for (let i = 0; i < 10; i++) {
  await context.setOffline(true);
  await page.waitForTimeout(2000);
  // Intentar operación offline
  await page.evaluate(() => { try { if (typeof navigateTo==='function') navigateTo('caja'); } catch(_){} }).catch(()=>{});
  await page.waitForTimeout(500);
  await context.setOffline(false);
  await page.waitForTimeout(2000);
  if (fatal.length > 0) networkCrashes++;
}
record('10 ciclos offline/online sin crash', networkCrashes === 0 && fatal.length === 0, fatal.slice(0,2).join('; '));
record('app viva tras red intermitente', await page.evaluate(()=>!!document.querySelector('.app-container')));

// ═══ 3. STRESS DE NAVEGACIÓN (100 cambios de página) ═══
console.log('\n══════ 3. STRESS DE NAVEGACIÓN (100 cambios) ══════');
const pages = ['caja','mesas','facturas','clientes','inventario','config','reportes','inicio'];
let navCrashes = 0;
for (let i = 0; i < 100; i++) {
  const pg = pages[i % pages.length];
  try {
    await page.evaluate((p) => { try { if (typeof navigateTo==='function') navigateTo(p); } catch(_){} }, pg);
    await page.waitForTimeout(100);
  } catch (_) { navCrashes++; }
}
record('100 cambios de página sin crash', navCrashes === 0 && fatal.length === 0);

// ═══ 4. MEMORIA / RENDIMIENTO ═══
console.log('\n══════ 4. MEMORIA / RENDIMIENTO ══════');
const memAfter = process.memoryUsage().heapUsed;
const memGrowthMB = ((memAfter - memBefore) / 1024 / 1024).toFixed(2);
record('crecimiento de memoria < 500MB', (memAfter - memBefore) < 500*1024*1024, `${memGrowthMB} MB`);
record('app sigue viva tras stress', await page.evaluate(()=>!!document.querySelector('.app-container')));

// ═══ 5. LIMPIEZA ═══
await page.evaluate(() => {
  localStorage.removeItem('crozzo_test_products');
  localStorage.removeItem('crozzo_test_facturas');
}).catch(()=>{});

await browser.close();

console.log('\n══════ RESUMEN CARGA ══════');
console.log(`Tests: ${totalTests} | OK: ${passed} | FAIL: ${failed}`);
if (findings.length) {
  console.log('\nHallazgos:');
  for (const f of findings) console.log(`  - ${f.name}: ${f.detail}`);
}
console.log(`Memoria: +${memGrowthMB} MB`);
console.log('══════════════════════════');
server.close();
process.exit(failed > 0 ? 1 : 0);