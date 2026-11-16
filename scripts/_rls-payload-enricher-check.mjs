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

console.log('RLS Payload Enricher — verificación\n');

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
vm.runInContext(readFileSync(join(root, 'app/core/CrozzoRlsPayloadEnricher.js'), 'utf8'), ctx);

// Test 1: enrichPayload function exists
assert(typeof ctx.CrozzoRlsPayloadEnricher.patchFetch === 'function', 'patchFetch existe', '');

// Test 2: isPatched
assert(typeof ctx.CrozzoRlsPayloadEnricher.isPatched === 'function', 'isPatched existe', '');

console.log('');
for (const x of results) console.log((x.ok ? '  ✓ ' : '  ✗ ') + x.name + (x.detail ? ' — ' + x.detail : ''));
console.log('');
if (failed === 0) { console.log('✅ RLS PAYLOAD ENRICHER: PASS'); process.exit(0); }
else { console.log(`❌ RLS PAYLOAD ENRICHER: FAIL — ${failed}`); process.exit(1); }
