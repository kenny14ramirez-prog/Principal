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

const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:1200,height:900}});
await context.addInitScript(()=>{
  localStorage.setItem('pos_dian_config', JSON.stringify({seguridad:{requiereLogin:false}}));
  sessionStorage.setItem('crozzo_session_user','CHAOS');
  sessionStorage.setItem('crozzo_auth_proof_v1','1');
  localStorage.setItem('crozzo_user_role','super_admin');
  localStorage.setItem('crozzo_device_paired_v1','1');
});
const page=await context.newPage();
const fatal=[];
page.on('pageerror',e=>fatal.push(String(e&&e.message||e)));

// Simulate chaos: abort backend calls
await context.route('**/api/**', route=>route.abort());
await context.route('**/*.supabase.co/**', route=>route.abort());

await page.goto(url,{waitUntil:'domcontentloaded',timeout:90000});
await page.waitForTimeout(3000);
await page.evaluate(()=>{const lo=document.getElementById('loginOverlay');if(lo)lo.setAttribute('hidden','');const pair=document.getElementById('crozzoPairingOverlay');if(pair)pair.setAttribute('hidden','');document.body.classList.remove('crozzo-login-open');});

// Offline toggle
await context.setOffline(true);
await page.waitForTimeout(2000);
const offlineOk = await page.evaluate(()=>!!document.querySelector('.app-container'));
// Try navigate
await page.evaluate(()=>{ try{ if(typeof navigateTo==='function') navigateTo('caja'); }catch(_){} }).catch(()=>{});
await page.waitForTimeout(1000);
await context.setOffline(false);
await page.waitForTimeout(2000);
const onlineOk = await page.evaluate(()=>!!document.querySelector('.app-container'));

const obs = await page.evaluate(()=>window.crozzoObservability?window.crozzoObservability.status():null);

const checks=[
  ['app renderiza en offline', offlineOk===true],
  ['app renderiza tras reconexión', onlineOk===true],
  ['sin errores fatales JS', fatal.length===0],
  ['observabilidad captura fallos red', !!(obs && obs.networkFailures>0)],
];
console.log('\n──────── CHAOS NETWORK ────────');
let failed=0;
for(const [l,ok] of checks){ if(!ok) failed++; console.log(`  [${ok?'OK':'X '}] ${l}`); }
if(fatal.length) console.log('  Fatales:', fatal.slice(0,5));
console.log('  Obs:', JSON.stringify(obs));
console.log('──────────────────────────────');
console.log(`  ${checks.length-failed}/${checks.length} OK`);

await browser.close();
server.close();
process.exit(failed?1:0);