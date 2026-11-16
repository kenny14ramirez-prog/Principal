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

console.log('Fase 0 PoC — verificación\n');

const ctx = { console };
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(readFileSync(join(root, 'app/core/CrozzoFase0PoC.js'), 'utf8'), ctx);

// Test 1: hasComandarPermiso (fallback true)
assert(ctx.CrozzoFase0PoC.hasComandarPermiso() === true, 'hasComandarPermiso fallback: true', '');

// Test 2: registrarFaltante retorna objeto
const mov = ctx.CrozzoFase0PoC.registrarFaltante(1, 'Gaseosa', 2, 'f-001');
assert(mov && mov.tipo === 'faltante_stock', 'registrarFaltante: tipo faltante_stock', JSON.stringify(mov));
assert(mov.productId === 1 && mov.cantidad === 2, 'registrarFaltante: productId+cantidad', '');

// Test 3: canGoLiveStrict sin config
const r1 = ctx.CrozzoFase0PoC.canGoLiveStrict(null);
assert(r1.ok === false, 'canGoLiveStrict sin config: false', r1.reason);

// Test 4: canGoLiveStrict con config incompleto
const r2 = ctx.CrozzoFase0PoC.canGoLiveStrict({ proveedor: { type: 'dataico', apiKey: 'key' }, certificado: { encrypted: true }, dian: {} });
assert(r2.ok === false && r2.reason === 'dian_incompleto', 'canGoLiveStrict dian incompleto', r2.reason);

// Test 5: canGoLiveStrict con config completo
const r3 = ctx.CrozzoFase0PoC.canGoLiveStrict({
  proveedor: { type: 'dataico', apiKey: 'key' },
  certificado: { encrypted: true, expiryDate: '2030-01-01' },
  dian: { resolucion: '123', prefijo: 'SETT' }
});
assert(r3.ok === true, 'canGoLiveStrict completo: ok', r3.reason);

console.log('');
for (const x of results) console.log((x.ok ? '  ✓ ' : '  ✗ ') + x.name + (x.detail ? ' — ' + x.detail : ''));
console.log('');
if (failed === 0) { console.log('✅ FASE 0 PoC: PASS'); process.exit(0); }
else { console.log(`❌ FASE 0 PoC: FAIL — ${failed}`); process.exit(1); }
