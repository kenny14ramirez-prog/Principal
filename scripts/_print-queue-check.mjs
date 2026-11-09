#!/usr/bin/env node
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = join(root, 'app');
let failed = 0;
function ok(n, d) { console.log('✓ ' + n + (d ? ' — ' + d : '')); }
function fail(n, d) { console.log('✗ ' + n + (d ? ' — ' + d : '')); failed++; }

const f = join(app, 'infra/CrozzoPrintQueue.js');
if (!existsSync(f)) { fail('Archivo', 'ausente'); process.exit(1); }
const txt = readFileSync(f, 'utf8');
for (const p of ['enqueue', 'pending', 'drain', 'crozzoEnqueuePrint']) {
  if (!txt.includes(p)) { fail('API', 'falta ' + p); } else { ok('API', p); }
}

// Sandbox
const ctx = { console: { log() {}, warn() {}, error() {} }, localStorage: { _s: {}, getItem(k) { return this._s[k] || null; }, setItem(k, v) { this._s[k] = v; }, removeItem(k) { delete this._s[k]; } }, globalThis: null, window: null, setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout, setInterval: () => {}, clearInterval: () => {} };
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(readFileSync(f, 'utf8'), ctx, { filename: 'CrozzoPrintQueue.js' });

// Enqueue test
ctx.crozzoEnqueuePrint({ type: 'ticket', payload: { text: 'test' } });
const pending = ctx.CrozzoPrintQueue.pending();
console.log('pending after enqueue:', pending);
if (pending !== 1) { fail('enqueue', 'esperado 1, got ' + pending); } else { ok('enqueue', '1 job'); }

console.log('\n' + (failed ? failed + ' fallo(s)' : 'Todo OK') + '\n');
process.exit(failed ? 1 : 0);
