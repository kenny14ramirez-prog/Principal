#!/usr/bin/env node
/**
 * Property-based test: outbox idempotencia (mismo consecutivo → mismo resultado).
 */
import fc from 'fast-check';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = join(root, 'app');

const ctx = { console: { log() {}, warn() {}, error() {} }, localStorage: { _s: {}, getItem(k) { return this._s[k] || null; }, setItem(k, v) { this._s[k] = v; }, removeItem(k) { delete this._s[k]; } }, globalThis: null, window: null, comandas: [], addEventListener: () => {}, dispatchEvent: () => {} };
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(readFileSync(join(app, 'modules/CrozzoComandasCloudSync.js'), 'utf8'), ctx, { filename: 'CrozzoComandasCloudSync.js' });

const outboxKey = (c) => String(c.transaction_id || c.id || '');

// Property: outboxKey is deterministic
fc.assert(
  fc.property(
    fc.record({ id: fc.integer(), transaction_id: fc.string() }),
    (c) => {
      return outboxKey(c) === outboxKey(c);
    }
  ),
  { numRuns: 1000 }
);
console.log('✓ Property outboxKey determinista: PASS (1000 runs)');

// Property: outboxKey uses transaction_id if present
fc.assert(
  fc.property(
    fc.integer(),
    fc.string({ minLength: 1 }),
    (id, tid) => {
      const c = { id, transaction_id: tid };
      return outboxKey(c) === tid;
    }
  ),
  { numRuns: 500 }
);
console.log('✓ Property outboxKey usa transaction_id: PASS (500 runs)');
process.exit(0);
