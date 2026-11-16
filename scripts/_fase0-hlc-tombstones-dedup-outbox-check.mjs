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

console.log('HLC + Tombstones + Dedup + Outbox — verificación\n');

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

vm.runInContext(readFileSync(join(root, 'app/core/CrozzoHlc.js'), 'utf8'), ctx);
vm.runInContext(readFileSync(join(root, 'app/core/CrozzoTombstones.js'), 'utf8'), ctx);
vm.runInContext(readFileSync(join(root, 'app/core/CrozzoDedupMultilevel.js'), 'utf8'), ctx);
vm.runInContext(readFileSync(join(root, 'app/core/CrozzoOutboxRuntime.js'), 'utf8'), ctx);

// HLC tests
const h1 = new ctx.CrozzoHlc.Hlc('node-a');
const t1 = h1.now();
assert(typeof t1.ms === 'number' && t1.node === 'node-a', 'HLC.now: retorna {ms, counter, node}', JSON.stringify(t1));
const h2 = new ctx.CrozzoHlc.Hlc('node-b');
h2.observe(t1.ms, t1.counter);
assert(h2.physicalMs >= t1.ms, 'HLC.observe: actualiza physicalMs', '');
const cmp = ctx.CrozzoHlc.compare(t1, { ms: t1.ms, counter: t1.counter, node: 'node-b' });
assert(cmp === null, 'HLC.compare: concurrente si mismo ms+counter diferente nodo', String(cmp));

// Tombstones tests
const ts = ctx.CrozzoTombstones.create('mesa', 'M1', t1);
assert(ts && ts.deletedAt, 'Tombstone create: retorna {deletedAt, deletedVersion}', '');
assert(ctx.CrozzoTombstones.isDeleted('mesa', 'M1') === true, 'Tombstone isDeleted: true', '');
assert(ctx.CrozzoTombstones.isTerminal('pagado') === true, 'isTerminal pagado: true', '');
assert(ctx.CrozzoTombstones.isTerminal('libre') === false, 'isTerminal libre: false', '');

// Dedup tests
const isNew = ctx.CrozzoDedupMultilevel.markTidSeen('tid-1');
assert(isNew === true, 'markTidSeen tid-1: nuevo', '');
assert(ctx.CrozzoDedupMultilevel.isTidSeen('tid-1') === true, 'isTidSeen tid-1: true', '');
assert(ctx.CrozzoDedupMultilevel.markTidSeen('tid-1') === false, 'markTidSeen tid-1 de nuevo: false (dedup)', '');
const key = ctx.CrozzoDedupMultilevel.entityIdKey('biz1', 'mesas', 'M1');
assert(key === 'biz1:mesas:M1', 'entityIdKey: correcto', key);
ctx.CrozzoDedupMultilevel.markAcked(key, 'acked');
assert(ctx.CrozzoDedupMultilevel.isAcked(key) === true, 'isAcked: true', '');
assert(typeof ctx.CrozzoDedupMultilevel.simpleHash('test') === 'string', 'simpleHash: retorna string', '');

// Outbox tests
const enq = ctx.CrozzoOutboxRuntime.enqueue({ type: 'runtime_push', ref: 'M1', payload: { x: 1 }, idempotencyKey: 'rt:M1' });
assert(enq === true, 'enqueue: true', '');
assert(ctx.CrozzoOutboxRuntime.size() === 1, 'size: 1', String(ctx.CrozzoOutboxRuntime.size()));
// Dedup
const enq2 = ctx.CrozzoOutboxRuntime.enqueue({ type: 'runtime_push', ref: 'M1', payload: { x: 2 }, idempotencyKey: 'rt:M1' });
assert(enq2 === false, 'enqueue dedup: false', '');
assert(ctx.CrozzoOutboxRuntime.size() === 1, 'size sigue 1', String(ctx.CrozzoOutboxRuntime.size()));
const pending = ctx.CrozzoOutboxRuntime.getPending();
assert(pending.length === 1, 'getPending: 1', String(pending.length));
ctx.CrozzoOutboxRuntime.markSent(pending[0].id);
assert(ctx.CrozzoOutboxRuntime.pendingCount() === 0, 'pendingCount después de markSent: 0', String(ctx.CrozzoOutboxRuntime.pendingCount()));

console.log('');
for (const x of results) console.log((x.ok ? '  ✓ ' : '  ✗ ') + x.name + (x.detail ? ' — ' + x.detail : ''));
console.log('');
if (failed === 0) { console.log('✅ HLC + TOMBSTONES + DEDUP + OUTBOX: PASS'); process.exit(0); }
else { console.log(`❌ FAIL — ${failed}`); process.exit(1); }
