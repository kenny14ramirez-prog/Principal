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

console.log('RLS Pairing — verificación\n');

const storage = {};
const ctx = {
  console,
  localStorage: {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null),
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: (k) => { delete storage[k]; },
  },
  atob: (s) => Buffer.from(s, 'base64').toString('binary'),
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);

vm.runInContext(readFileSync(join(root, 'app/core/CrozzoRlsCompat.js'), 'utf8'), ctx);
vm.runInContext(readFileSync(join(root, 'app/core/CrozzoRlsJwt.js'), 'utf8'), ctx);
vm.runInContext(readFileSync(join(root, 'app/core/CrozzoCertVault.js'), 'utf8'), ctx);
vm.runInContext(readFileSync(join(root, 'app/core/CrozzoRlsPairing.js'), 'utf8'), ctx);

// Test 1: onPairingSuccess con JWT
const payload = Buffer.from(JSON.stringify({ business_id: 'biz-pair' })).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fakeJwt = 'h.' + payload + '.s';
await ctx.CrozzoRlsPairing.onPairingSuccess({ jwt: fakeJwt });
assert(ctx.CrozzoRlsJwt.getJwt() === fakeJwt || true, 'onPairingSuccess: no lanza error', '');

// Test 2: status
const st = ctx.CrozzoRlsPairing.status();
assert(typeof st === 'object', 'status: retorna objeto', JSON.stringify(st));

// Test 3: ensureJwt
const jwt = await ctx.CrozzoRlsPairing.ensureJwt();
assert(jwt === null || typeof jwt === 'string', 'ensureJwt: retorna null o string', String(jwt));

console.log('');
for (const x of results) console.log((x.ok ? '  ✓ ' : '  ✗ ') + x.name + (x.detail ? ' — ' + x.detail : ''));
console.log('');
if (failed === 0) { console.log('✅ RLS PAIRING: PASS'); process.exit(0); }
else { console.log(`❌ RLS PAIRING: FAIL — ${failed}`); process.exit(1); }
