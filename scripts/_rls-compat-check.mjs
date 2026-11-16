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

console.log('RLS Compat Mode — verificación\n');

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
  atob: (s) => Buffer.from(s, 'base64').toString('binary'),
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(readFileSync(join(root, 'app/core/CrozzoRlsCompat.js'), 'utf8'), ctx);

// Test 1: modo compat por defecto
assert(ctx.CrozzoRlsCompat.isCompatMode() === true, 'Default: compat mode', String(ctx.CrozzoRlsCompat.isCompatMode()));

// Test 2: business_id default
assert(ctx.CrozzoRlsCompat.getBusinessId() === 'default', 'Default: business_id=default', ctx.CrozzoRlsCompat.getBusinessId());

// Test 3: status
const st = ctx.CrozzoRlsCompat.status();
assert(st.compatMode === true && st.businessId === 'default', 'Status: compat+default', JSON.stringify(st));

// Test 4: setMode jwt
ctx.CrozzoRlsCompat.setMode('jwt');
assert(ctx.CrozzoRlsCompat.isCompatMode() === false, 'After setMode jwt: not compat', String(ctx.CrozzoRlsCompat.isCompatMode()));

// Test 5: JWT business_id extraction
const payload = Buffer.from(JSON.stringify({ business_id: 'biz-123' })).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fakeJwt = 'header.' + payload + '.sig';
storage['crozzo_device_jwt'] = fakeJwt;
assert(ctx.CrozzoRlsCompat.getBusinessId() === 'biz-123', 'JWT: business_id extracted', ctx.CrozzoRlsCompat.getBusinessId());

// Test 6: cutoff date
assert(typeof ctx.CrozzoRlsCompat.isCutoffPassed === 'function', 'isCutoffPassed exists', '');

console.log('');
for (const x of results) console.log((x.ok ? '  ✓ ' : '  ✗ ') + x.name + (x.detail ? ' — ' + x.detail : ''));
console.log('');
if (failed === 0) { console.log('✅ RLS COMPAT: PASS'); process.exit(0); }
else { console.log(`❌ RLS COMPAT: FAIL — ${failed}`); process.exit(1); }
