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

console.log('Config Wrapper — verificación\n');

const storage = {};
const ctx = {
  console,
  localStorage: {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null),
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: (k) => { delete storage[k]; },
  },
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);

// Load deps
vm.runInContext(readFileSync(join(root, 'app/core/CrozzoFeatureFlags.js'), 'utf8'), ctx);
vm.runInContext(readFileSync(join(root, 'app/core/CrozzoFiscalSqlite.js'), 'utf8'), ctx);
vm.runInContext(readFileSync(join(root, 'app/core/CrozzoFiscalDualWrite.js'), 'utf8'), ctx);

// Simular config
let savedCount = 0;
ctx.config = {
  getFacturas: () => [{ uuid: 'f-1', total: 500 }],
  save: () => { savedCount++; return true; }
};

// Load wrapper
vm.runInContext(readFileSync(join(root, 'app/core/CrozzoConfigWrapper.js'), 'utf8'), ctx);

// Test 1: wrap es idempotente
ctx.CrozzoConfigWrapper.wrap();
assert(ctx.CrozzoConfigWrapper.isWrapped() === true, 'wrap: isWrapped=true', '');
const origSave = ctx.config.save;
ctx.CrozzoConfigWrapper.wrap(); // segunda llamada no debe re-wrappar
assert(ctx.CrozzoConfigWrapper.isWrapped() === true, 'wrap: idempotente', '');

// Test 2: save llama al original
ctx.CrozzoFeatureFlags.set('useSqliteFiscal', false); // flag off → no dual-write
ctx.config.save();
assert(savedCount === 1, 'save: original llamado', String(savedCount));

// Test 3: con flag activo, save sigue funcionando
ctx.CrozzoFeatureFlags.set('useSqliteFiscal', true);
ctx.config.save();
assert(savedCount === 2, 'save con flag: original llamado', String(savedCount));

console.log('');
for (const x of results) console.log((x.ok ? '  ✓ ' : '  ✗ ') + x.name + (x.detail ? ' — ' + x.detail : ''));
console.log('');
if (failed === 0) { console.log('✅ CONFIG WRAPPER: PASS'); process.exit(0); }
else { console.log(`❌ CONFIG WRAPPER: FAIL — ${failed}`); process.exit(1); }
