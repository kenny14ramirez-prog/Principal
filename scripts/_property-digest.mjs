#!/usr/bin/env node
/**
 * Property-based test: digest invariante (mismo estado → mismo hash).
 */
import fc from 'fast-check';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = join(root, 'app');

// Load module in VM
const ctx = { console: { log() {}, warn() {}, error() {} }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, globalThis: null, window: null, comandas: [], addEventListener: () => {}, dispatchEvent: () => {} };
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(readFileSync(join(app, 'infra/CrozzoLanOpsSync.js'), 'utf8'), ctx, { filename: 'CrozzoLanOpsSync.js' });

const localDigest = ctx.CrozzoLanOpsSync.localComandasDigest;

// Property: same comandas array → same digest
fc.assert(
  fc.property(
    fc.array(fc.record({ id: fc.integer({ min: 1, max: 100 }), transaction_id: fc.string({ minLength: 1, maxLength: 10 }), estado: fc.constantFrom('pendiente', 'listo', 'entregado'), lastUpdateAt: fc.integer({ min: 1000, max: 9999 }) }), { maxLength: 20 }),
    (comandas) => {
      ctx.comandas = comandas;
      const d1 = localDigest();
      const d2 = localDigest();
      return d1.hash === d2.hash && d1.count === d2.count && d1.maxAt === d2.maxAt;
    }
  ),
  { numRuns: 1000 }
);
console.log('✓ Property digest invariante: PASS (1000 runs)');

// Property: different estado → different hash (for same ids)
fc.assert(
  fc.property(
    fc.integer({ min: 1, max: 100 }),
    fc.constantFrom('pendiente', 'listo'),
    fc.constantFrom('pendiente', 'listo'),
    (id, e1, e2) => {
      if (e1 === e2) return true;
      ctx.comandas = [{ id, transaction_id: 't' + id, estado: e1, lastUpdateAt: 1000 }];
      const d1 = localDigest();
      ctx.comandas = [{ id, transaction_id: 't' + id, estado: e2, lastUpdateAt: 1000 }];
      const d2 = localDigest();
      return d1.hash !== d2.hash;
    }
  ),
  { numRuns: 500 }
);
console.log('✓ Property digest estado sensible: PASS (500 runs)');
process.exit(0);
