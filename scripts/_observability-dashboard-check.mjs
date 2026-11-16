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

console.log('Observability Dashboard — verificación\n');

const storage = {};
const ctx = {
  console,
  localStorage: {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null),
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: (k) => { delete storage[k]; },
  },
  document: { getElementById: () => ({ innerHTML: '' }), body: { innerHTML: '' } },
  atob: (s) => Buffer.from(s, 'base64').toString('binary'),
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);

vm.runInContext(readFileSync(join(root, 'app/core/CrozzoFeatureFlags.js'), 'utf8'), ctx);
vm.runInContext(readFileSync(join(root, 'app/core/CrozzoSanitize.js'), 'utf8'), ctx);
vm.runInContext(readFileSync(join(root, 'app/core/CrozzoRlsCompat.js'), 'utf8'), ctx);
vm.runInContext(readFileSync(join(root, 'app/core/CrozzoStorage.js'), 'utf8'), ctx);
vm.runInContext(readFileSync(join(root, 'app/core/CrozzoObservabilityDashboard.js'), 'utf8'), ctx);

// Test 1: collectMetrics
const m = ctx.CrozzoObservabilityDashboard.collectMetrics();
assert(typeof m === 'object' && m.timestamp, 'collectMetrics: retorna objeto con timestamp', '');
assert(typeof m.outboxSize === 'number', 'collectMetrics: outboxSize number', String(m.outboxSize));
assert(typeof m.facturasTotal === 'number', 'collectMetrics: facturasTotal number', String(m.facturasTotal));

// Test 2: renderHtml
const html = ctx.CrozzoObservabilityDashboard.renderHtml(m);
assert(typeof html === 'string' && html.length > 0, 'renderHtml: retorna string', String(html.length));

// Test 3: show
ctx.CrozzoObservabilityDashboard.show();
assert(true, 'show: no lanza error', '');

console.log('');
for (const x of results) console.log((x.ok ? '  ✓ ' : '  ✗ ') + x.name + (x.detail ? ' — ' + x.detail : ''));
console.log('');
if (failed === 0) { console.log('✅ OBSERVABILITY DASHBOARD: PASS'); process.exit(0); }
else { console.log(`❌ OBSERVABILITY DASHBOARD: FAIL — ${failed}`); process.exit(1); }
