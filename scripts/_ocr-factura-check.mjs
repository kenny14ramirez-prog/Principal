#!/usr/bin/env node
/**
 * Verificación — OCR facturas proveedor H2.F
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const results = [];
function ok(n, d) { results.push({ ok: true, name: n, detail: d }); }
function fail(n, d) { results.push({ ok: false, name: n, detail: d }); failed++; }
function assert(c, n, d) { c ? ok(n, d) : fail(n, d); }

console.log('🧾 OCR Factura (H2.F) — verificación\n');

// 1
const appMod = join(root, 'app/modules/CrozzoOcrFactura.js');
assert(existsSync(appMod), '1. app/modules/CrozzoOcrFactura.js existe', appMod);

// 2
const srcMod = join(root, 'src/modules/CrozzoOcrFactura.js');
assert(existsSync(srcMod), '2. src/modules/CrozzoOcrFactura.js existe tras sync', srcMod);

// 3
const idx = readFileSync(join(root, 'app/index.html'), 'utf8');
assert(idx.includes('CrozzoOcrFactura.js'), '3. Script incluido en app/index.html', 'defer');

// 4
let code = '';
try { code = readFileSync(appMod, 'utf8'); } catch(e) { fail('4. Leer módulo', e.message); }
assert(typeof code === 'string' && code.length > 1000, '4. Módulo con contenido', code.length + ' bytes');

// 5-12: vm context
const ctx = {
  console,
  setTimeout, clearTimeout, setInterval, clearInterval,
  document: { createElement: () => ({ set src(v){}, onload:null, onerror:null }), head: { appendChild(){} } },
  localStorage: { _d:{}, getItem(k){return this._d[k]||null;}, setItem(k,v){this._d[k]=String(v);} }
};
ctx.window = ctx;
ctx.globalThis = ctx;
try {
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
} catch(e) {
  fail('5. Carga en contexto vm', e.message);
}

// 5
assert(typeof ctx.CrozzoOcrFactura === 'object', '5. CrozzoOcrFactura exportado global');

// 6
assert(typeof ctx.CrozzoOcrFactura.parseNumber === 'function', '6. parseNumber disponible');
const pn1 = ctx.CrozzoOcrFactura.parseNumber('$1.500.000');
const pn2 = ctx.CrozzoOcrFactura.parseNumber('1.500,50');
assert(pn1 > 0 && pn2 > 0, '6b. parseNumber formatos CO', {pn1,pn2});

// 7
assert(typeof ctx.CrozzoOcrFactura.extractHeader === 'function', '7. extractHeader disponible');
assert(typeof ctx.CrozzoOcrFactura.extractItems === 'function', '8. extractItems disponible');

// 9
assert(typeof ctx.CrozzoOcrFactura.findMatch === 'function', '9. findMatch disponible');

// 10
assert(typeof ctx.CrozzoOcrFactura.mapToRecepcionItems === 'function', '10. mapToRecepcionItems disponible');
const mapped = ctx.CrozzoOcrFactura.mapToRecepcionItems([{ mpId:'MP-1', cantidad:2, precioTotal:10000 }]);
assert(Array.isArray(mapped) && mapped.length >= 0, '10b. mapToRecepcionItems retorna array');

// 11
assert(typeof ctx.CrozzoOcrFactura.confidenceScore === 'function', '11. confidenceScore disponible');
assert(typeof ctx.CrozzoOcrFactura.parsearFactura === 'function', '11b. parsearFactura disponible');

// 12
assert(typeof ctx.CrozzoOcrFactura.sugerirCatalogo === 'function', '12. sugerirCatalogo disponible');

console.log('\nResultados:');
for (const r of results) {
  console.log((r.ok?'✓':'✗'), r.name, r.detail? '- '+JSON.stringify(r.detail):'');
}
console.log('\n' + (failed===0 ? 'TODO OK' : failed + ' fallo(s)'));
process.exit(failed===0?0:1);
