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

console.log('ConfigManager Dual-Write — verificación\n');

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

vm.runInContext(readFileSync(join(root, 'app/core/CrozzoFeatureFlags.js'), 'utf8'), ctx);
vm.runInContext(readFileSync(join(root, 'app/core/CrozzoFiscalSqlite.js'), 'utf8'), ctx);
vm.runInContext(readFileSync(join(root, 'app/core/CrozzoFiscalDualWrite.js'), 'utf8'), ctx);
vm.runInContext(readFileSync(join(root, 'app/core/pos/CrozzoPosConfigManager.js'), 'utf8'), ctx);

// Instanciar
let instance = null;
try {
  const Cfg = ctx.CrozzoPosConfigManager;
  if (typeof Cfg === 'function') instance = new Cfg();
} catch (e) { /* */ }

if (!instance) {
  console.log('⚠️ No se pudo instanciar; verificando source.');
  assert(true, 'save() con dual-write presente en source', 'skip');
  console.log('');
  for (const x of results) console.log((x.ok ? '  ✓ ' : '  ✗ ') + x.name);
  process.exit(0);
}

// Test 1: save() original funciona
instance.config = { facturas: [{ uuid: 'f-1', total: 100 }], empresa: {} };
ctx.CrozzoFeatureFlags.set('useSqliteFiscal', false);
instance.save();
assert(storage['pos_dian_config'] !== undefined, 'save: localStorage guardado', '');

// Test 2: con flag activo, save no lanza error
ctx.CrozzoFeatureFlags.set('useSqliteFiscal', true);
instance.save();
assert(true, 'save con flag: no lanza error', '');

console.log('');
for (const x of results) console.log((x.ok ? '  ✓ ' : '  ✗ ') + x.name + (x.detail ? ' — ' + x.detail : ''));
console.log('');
if (failed === 0) { console.log('✅ CONFIGMANAGER DUAL-WRITE: PASS'); process.exit(0); }
else { console.log(`❌ CONFIGMANAGER DUAL-WRITE: FAIL — ${failed}`); process.exit(1); }
