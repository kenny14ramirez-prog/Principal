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

console.log('RLS Integration — verificación\n');

const storage = {};
const ctx = {
  console,
  localStorage: {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null),
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: (k) => { delete storage[k]; },
  },
  fetch: async () => ({ ok: true }),
  atob: (s) => Buffer.from(s, 'base64').toString('binary'),
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);

vm.runInContext(readFileSync(join(root, 'app/core/CrozzoFeatureFlags.js'), 'utf8'), ctx);
vm.runInContext(readFileSync(join(root, 'app/core/CrozzoRlsCompat.js'), 'utf8'), ctx);
vm.runInContext(readFileSync(join(root, 'app/core/CrozzoRlsJwt.js'), 'utf8'), ctx);
vm.runInContext(readFileSync(join(root, 'app/core/CrozzoSupabaseAuth.js'), 'utf8'), ctx);
vm.runInContext(readFileSync(join(root, 'app/core/CrozzoCertVault.js'), 'utf8'), ctx);
vm.runInContext(readFileSync(join(root, 'app/core/CrozzoRlsIntegration.js'), 'utf8'), ctx);

// Test 1: init
assert(typeof ctx.CrozzoRlsIntegration.init === 'function', 'init existe', '');
ctx.CrozzoRlsIntegration.init();

// Test 2: getBusinessId
assert(ctx.CrozzoRlsIntegration.getBusinessId() === 'default', 'getBusinessId default', ctx.CrozzoRlsIntegration.getBusinessId());

// Test 3: enrichPayload
const p = ctx.CrozzoRlsIntegration.enrichPayload({ id: 1 });
assert(p.business_id === 'default', 'enrichPayload añade business_id', JSON.stringify(p));

// Test 4: enrichPayload no sobrescribe
const p2 = ctx.CrozzoRlsIntegration.enrichPayload({ id: 2, business_id: 'biz-x' });
assert(p2.business_id === 'biz-x', 'enrichPayload no sobrescribe', p2.business_id);

// Test 5: isRlsActive
assert(typeof ctx.CrozzoRlsIntegration.isRlsActive === 'boolean' || typeof ctx.CrozzoRlsIntegration.isRlsActive === 'function', 'isRlsActive existe', '');

console.log('');
for (const x of results) console.log((x.ok ? '  ✓ ' : '  ✗ ') + x.name + (x.detail ? ' — ' + x.detail : ''));
console.log('');
if (failed === 0) { console.log('✅ RLS INTEGRATION: PASS'); process.exit(0); }
else { console.log(`❌ RLS INTEGRATION: FAIL — ${failed}`); process.exit(1); }
