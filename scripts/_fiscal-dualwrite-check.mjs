#!/usr/bin/env node
/**
 * Verificación — FISCAL DUAL-WRITE PoC (Fase -2)
 * Valida que CrozzoFiscalDualWrite y CrozzoFiscalMigrationPoC funcionen
 * en modo fallback (localStorage) sin Tauri.
 */
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

console.log('Dual-Write Fiscal PoC — verificación\n');

// Contexto con localStorage simulado
const storage = {};
const ctx = {
  console,
  localStorage: {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null),
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: (k) => { delete storage[k]; },
    get length() { return Object.keys(storage).length; },
    key: (i) => Object.keys(storage)[i] || null,
  },
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);

// Cargar FeatureFlags
vm.runInContext(readFileSync(join(root, 'app/core/CrozzoFeatureFlags.js'), 'utf8'), ctx);
// Activar flag
ctx.CrozzoFeatureFlags.set('useSqliteFiscal', true);

// Cargar FiscalSqlite (fallback a localStorage)
vm.runInContext(readFileSync(join(root, 'app/core/CrozzoFiscalSqlite.js'), 'utf8'), ctx);
// Cargar DualWrite
vm.runInContext(readFileSync(join(root, 'app/core/CrozzoFiscalDualWrite.js'), 'utf8'), ctx);

// Test 1: saveFacturas en fallback
const facturas = [{ uuid: 'f-001', total: 1000 }, { uuid: 'f-002', total: 2000 }];
const r1 = await ctx.CrozzoFiscalDualWrite.saveFacturas(facturas);
assert(r1 === true, 'saveFacturas fallback: ok', String(r1));

// Test 2: loadFacturas
const loaded = await ctx.CrozzoFiscalDualWrite.loadFacturas();
assert(Array.isArray(loaded) && loaded.length === 2, 'loadFacturas: 2 facturas', String(loaded && loaded.length));

// Test 3: persistencia en localStorage
const cached = storage['crozzo_fiscal_facturas_cache'];
assert(!!cached, 'localStorage cache: guardado', cached ? cached.slice(0, 40) : '');

// Test 4: Migration PoC
vm.runInContext(readFileSync(join(root, 'app/core/CrozzoFiscalMigrationPoC.js'), 'utf8'), ctx);
// Simular config
ctx.config = { getFacturas: () => facturas };
const mig = await ctx.CrozzoFiscalMigrationPoC.run();
assert(mig && mig.migrated === true, 'Migration: migrated=true', JSON.stringify(mig));
assert(mig.count === 2, 'Migration: count=2', String(mig.count));

// Test 5: status
const st = ctx.CrozzoFiscalMigrationPoC.status();
assert(st.migrated === true, 'Status: migrated=true', JSON.stringify(st));

console.log('');
for (const x of results) console.log((x.ok ? '  ✓ ' : '  ✗ ') + x.name + (x.detail ? ' — ' + x.detail : ''));
console.log('');
if (failed === 0) {
  console.log('✅ FISCAL DUAL-WRITE PoC: PASS');
  process.exit(0);
} else {
  console.log(`❌ FISCAL DUAL-WRITE PoC: FAIL — ${failed} verificación(es) fallaron.`);
  process.exit(1);
}
