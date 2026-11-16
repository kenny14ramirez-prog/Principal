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

console.log('Metrics — verificación\n');

const storage = {};
const ctx = {
  console,
  localStorage: {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null),
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: (k) => { delete storage[k]; },
  },
  __TAURI__: null,
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);

vm.runInContext(readFileSync(join(root, 'app/core/CrozzoMetrics.js'), 'utf8'), ctx);

const snap = await ctx.CrozzoMetrics.snapshot();
assert(typeof snap === 'object' && snap.timestamp, 'snapshot: retorna objeto con timestamp', '');
assert(typeof snap.rust === 'object', 'snapshot: rust metrics', '');
assert(typeof snap.business === 'object', 'snapshot: business metrics', '');
assert(typeof snap.business.outboxSize === 'number', 'snapshot: outboxSize number', String(snap.business.outboxSize));

console.log('');
for (const x of results) console.log((x.ok ? '  ✓ ' : '  ✗ ') + x.name + (x.detail ? ' — ' + x.detail : ''));
console.log('');
if (failed === 0) { console.log('✅ METRICS: PASS'); process.exit(0); }
else { console.log(`❌ METRICS: FAIL — ${failed}`); process.exit(1); }
