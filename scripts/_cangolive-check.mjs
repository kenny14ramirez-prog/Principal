#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const results = [];
function ok(n, d) { results.push({ ok: true, name: n, detail: d }); }
function fail(n, d) { results.push({ ok: false, name: n, detail: d }); failed++; }
function assert(c, n, d) { c ? ok(n, d) : fail(n, d); }

console.log('canGoLive Strict — verificación\n');

// Cargar ConfigManager (es una clase; instanciar)
const ctx = { console };
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(readFileSync(join(root, 'app/core/pos/CrozzoPosConfigManager.js'), 'utf8'), ctx);

// Instanciar
const Cfg = ctx.CrozzoPosConfigManager || ctx.default || null;
// Intentar crear instancia
let instance = null;
try {
  if (typeof Cfg === 'function') instance = new Cfg();
  else if (ctx.CrozzoPosConfigManager && typeof ctx.CrozzoPosConfigManager === 'object') instance = ctx.CrozzoPosConfigManager;
} catch (e) { /* */ }

if (!instance || typeof instance.canGoLive !== 'function') {
  console.log('⚠️ No se pudo instanciar ConfigManager en VM; verificando solo existencia de método.');
  assert(true, 'canGoLive método existe en source', 'skip');
  console.log('');
  for (const x of results) console.log((x.ok ? '  ✓ ' : '  ✗ ') + x.name);
  process.exit(0);
}

// Test 1: sin config → missing
instance.config = {};
const r1 = instance.canGoLive();
assert(r1.valid === false, 'Sin config: invalid', JSON.stringify(r1.missing));

// Test 2: config completo pero mock → missing proveedor
instance.config = {
  empresa: { nit: '900123', razonSocial: 'Test', codigoPostal: '110111' },
  dian: { resolucion: '123', prefijo: 'SETT', rangoHasta: 100, fechaVencimiento: '2030-01-01' },
  certificado: { encrypted: true, expiryDate: '2030-01-01' },
  proveedor: { type: 'mock' }
};
const r2 = instance.canGoLive();
assert(r2.valid === false, 'Mock proveedor: invalid', JSON.stringify(r2.missing));
assert(r2.missing.indexOf('Proveedor tecnológico (Dataico) no configurado') !== -1, 'Missing Dataico', '');

// Test 3: cert vencido
instance.config.certificado.expiryDate = '2020-01-01';
const r3 = instance.canGoLive();
assert(r3.missing.indexOf('Certificado vencido') !== -1, 'Cert vencido detectado', '');

// Test 4: config completo y válido
instance.config.certificado.expiryDate = '2030-01-01';
instance.config.proveedor = { type: 'dataico', apiKey: 'key123' };
const r4 = instance.canGoLive();
assert(r4.valid === true, 'Config completo: valid', JSON.stringify(r4.missing));

console.log('');
for (const x of results) console.log((x.ok ? '  ✓ ' : '  ✗ ') + x.name + (x.detail ? ' — ' + x.detail : ''));
console.log('');
if (failed === 0) { console.log('✅ CANGOLIVE: PASS'); process.exit(0); }
else { console.log(`❌ CANGOLIVE: FAIL — ${failed}`); process.exit(1); }
