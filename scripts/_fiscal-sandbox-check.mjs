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
const page=await browser.newPage({viewport:{width:1200,height:900}});
await page.addInitScript(()=>{
  localStorage.setItem('pos_dian_config', JSON.stringify({seguridad:{requiereLogin:false}}));
  sessionStorage.setItem('crozzo_session_user','FISCAL');
  sessionStorage.setItem('crozzo_auth_proof_v1','1');
  localStorage.setItem('crozzo_user_role','super_admin');
  localStorage.setItem('crozzo_device_paired_v1','1');
});
await page.goto(url,{waitUntil:'domcontentloaded',timeout:90000});
await page.waitForTimeout(4000);
await page.evaluate(()=>{
  const lo=document.getElementById('loginOverlay'); if(lo) lo.setAttribute('hidden','');
  const pair=document.getElementById('crozzoPairingOverlay'); if(pair) pair.setAttribute('hidden','');
  document.body.classList.remove('crozzo-login-open');
});

const probe=await page.evaluate(async()=>{
  try {
    const cfg=window.config;
    const emp={nit:'900123456',dv:'7',razonSocial:'Test SAS',direccion:'Calle 1',telefono:'3000000000',email:'test@test.com',regimenFiscal:'responsable_iva'};
    const dian={resolucion:'18760000001',prefijo:'SETT',rangoDesde:1,rangoHasta:100,fechaDesde:'2025-01-01',fechaVencimiento:'2026-12-31',tipoDocumento:'01',tipoOperacion:'01'};
    const impuestos={tarifasIVA:[{rate:0.19,description:'General',activo:true}],responsableIVA:true,retencionFuente:{aplica:false,tarifa:0.025},retencionICA:{aplica:false,tarifa:0},impuestoAlConsumo:{aplica:false,tarifa:0.08},ivaIncluidoEnPrecios:false,perfilFiscal:'comercio'};
    cfg.set('empresa',emp);
    cfg.set('dian',dian);
    cfg.set('impuestos',impuestos);
    const factura={consecutivo:1,fechaEmision:new Date().toISOString(),tipoDocumento:'01',tipoOperacion:'01',compradorNit:'222222222',compradorNombre:'Consumidor Final',items:[{descripcion:'Producto',cantidad:1,precio:10000}],totalFactura:10000};
    const xml=buildUBL21({...factura,items:factura.items}, {empresa:emp,dian:dian,impuestos:impuestos});
    const cufe=await calcularCUFE({...factura,numeroResolucion:dian.resolucion,vendedorNit:emp.nit,totalFactura:10000});
    const prov=createProvider((cfg.get('proveedor')||{}).type||'mock');
    return {xmlLen:xml.length,hasInvoice:xml.includes('<Invoice'),hasCUFE:false,cufe:String(cufe).slice(0,40),provider:typeof prov,missingGlobals:['buildUBL21','calcularCUFE','createProvider'].filter(n=>typeof window[n]!=='function')};
  } catch(e){ return {error:e.message}; }
});

const checks=[
  ['buildUBL21 genera XML', !probe.error && probe.hasInvoice === true && probe.xmlLen > 500],
  ['calcularCUFE devuelve valor', !probe.error && !!probe.cufe],
  ['createProvider disponible', !probe.error && probe.provider !== undefined],
  ['sin globals faltantes', !probe.error && (probe.missingGlobals||[]).length===0],
];
console.log('\n──────── FISCAL SANDBOX ────────');
let failed=0;
for(const [l,ok] of checks){ if(!ok) failed++; console.log(`  [${ok?'OK':'X '}] ${l}`); }
if(probe.error) console.log('  Error:',probe.error);
if(probe.cufe) console.log('  CUFE:',probe.cufe);
console.log('───────────────────────────────');
console.log(`  ${checks.length-failed}/${checks.length} OK`);

await browser.close();
server.close();
process.exit(failed?1:0);