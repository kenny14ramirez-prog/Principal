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

console.log('Fase 0 Integration — verificación\n');

const storage = {};
const ctx = {
  console,
  localStorage: {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null),
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: (k) => { delete storage[k]; },
  },
  crypto: { randomUUID: () => 'test-node-1', getRandomValues: (a) => { for (let i=0;i<a.length;i++) a[i]=Math.floor(Math.random()*256); } },
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);

// Load base modules
vm.runInContext(readFileSync(join(root, 'app/core/CrozzoHlc.js'), 'utf8'), ctx);
vm.runInContext(readFileSync(join(root, 'app/core/CrozzoTombstones.js'), 'utf8'), ctx);
vm.runInContext(readFileSync(join(root, 'app/core/CrozzoDedupMultilevel.js'), 'utf8'), ctx);
vm.runInContext(readFileSync(join(root, 'app/core/CrozzoOutboxRuntime.js'), 'utf8'), ctx);
// Load integration modules
vm.runInContext(readFileSync(join(root, 'app/core/CrozzoHlcIntegration.js'), 'utf8'), ctx);
vm.runInContext(readFileSync(join(root, 'app/core/CrozzoTombstonesIntegration.js'), 'utf8'), ctx);
vm.runInContext(readFileSync(join(root, 'app/core/CrozzoDedupIntegration.js'), 'utf8'), ctx);
vm.runInContext(readFileSync(join(root, 'app/core/CrozzoOutboxRuntimeIntegration.js'), 'utf8'), ctx);

// HLC Integration
const t = ctx.CrozzoHlcIntegration.now();
assert(typeof t.ms === 'number', 'HLC Integration: now retorna {ms, counter, node}', '');
ctx.CrozzoHlcIntegration.observe({ ms: t.ms + 100, counter: 0 });
assert(true, 'HLC Integration: observe no lanza error', '');

// Tombstones Integration
const shouldApply = ctx.CrozzoTombstonesIntegration.shouldApplyRemote('libre', 'pagado', { ms: 1, counter: 0, node: 'a' }, { ms: 2, counter: 0, node: 'b' });
assert(shouldApply === false, 'Tombstones Integration: estado terminal absorbente → no aplicar', String(shouldApply));
const ts = ctx.CrozzoTombstonesIntegration.createTombstoneOnDelete('mesa', 'M1', { ms: 1, counter: 0, node: 'a' });
assert(ts && ts.deletedAt, 'Tombstones Integration: createTombstoneOnDelete', '');

// Dedup Integration
const dup = ctx.CrozzoDedupIntegration.isDuplicate('tid-x', 'biz1:mesas:M1', 'hash1');
assert(dup.duplicate === false, 'Dedup Integration: nuevo → no duplicate', JSON.stringify(dup));
ctx.CrozzoDedupIntegration.markProcessed('tid-x', 'biz1:mesas:M1', 'hash1');
const dup2 = ctx.CrozzoDedupIntegration.isDuplicate('tid-x', 'biz1:mesas:M1', 'hash1');
assert(dup2.duplicate === true, 'Dedup Integration: procesado → duplicate', JSON.stringify(dup2));

// Outbox Integration
const enq = ctx.CrozzoOutboxRuntimeIntegration.enqueue('M1', [{ id: 1 }], { x: 1 });
assert(enq === true, 'Outbox Integration: enqueue true', '');
assert(ctx.CrozzoOutboxRuntimeIntegration.pendingCount() === 1, 'Outbox Integration: pendingCount 1', String(ctx.CrozzoOutboxRuntimeIntegration.pendingCount()));

console.log('');
for (const x of results) console.log((x.ok ? '  ✓ ' : '  ✗ ') + x.name + (x.detail ? ' — ' + x.detail : ''));
console.log('');
if (failed === 0) { console.log('✅ FASE 0 INTEGRATION: PASS'); process.exit(0); }
else { console.log(`❌ FAIL — ${failed}`); process.exit(1); }
