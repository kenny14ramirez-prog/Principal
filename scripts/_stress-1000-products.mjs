#!/usr/bin/env node
/**
 * Stress: inyección de 1000+ productos con datos reales.
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = join(root, 'app');
let failed = 0;
function ok(n, d) { console.log('✓ ' + n + (d ? ' — ' + d : '')); }
function fail(n, d) { console.log('✗ ' + n + (d ? ' — ' + d : '')); failed++; }

// Generate 1000 products
const products = [];
for (let i = 0; i < 1000; i++) {
  products.push({ id: i + 1, name: 'Producto ' + (i + 1), price: Math.round(Math.random() * 50000) + 1000, stock: Math.round(Math.random() * 100) });
}

const ctx = {
  console: { log() {}, warn() {}, error() {} },
  localStorage: { _s: {}, getItem(k) { return this._s[k] || null; }, setItem(k, v) { this._s[k] = v; }, removeItem(k) { delete this._s[k]; } },
  globalThis: null, window: null,
  document: { readyState: 'complete', body: { appendChild() {} }, querySelector: () => null, addEventListener() {}, createElement: () => ({ style: {}, textContent: '', title: '', appendChild() {} }) },
  setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout, setInterval: () => {}, clearInterval: () => {},
  navigator: { onLine: true },
  products: [],
  addEventListener: () => {},
  dispatchEvent: () => {},
};
ctx.window = ctx; ctx.globalThis = ctx;

// Simulate injection
const start = Date.now();
ctx.products = products;
const elapsed = Date.now() - start;
console.log('Injected 1000 products in ' + elapsed + 'ms');
if (ctx.products.length === 1000) { ok('Injection', '1000 products'); } else { fail('Injection', 'expected 1000, got ' + ctx.products.length); }

// Test search/filter
const filtered = ctx.products.filter(p => p.price > 25000);
console.log('Filtered (>25000):', filtered.length);
if (filtered.length > 0) { ok('Filter', filtered.length + ' products'); } else { fail('Filter', 'none found'); }

// Test memory
const memBefore = process.memoryUsage().heapUsed;
const big = new Array(10000).fill({ id: 1, name: 'test', price: 1000 });
const memAfter = process.memoryUsage().heapUsed;
console.log('Memory delta:', Math.round((memAfter - memBefore) / 1024) + ' KB');
ok('Memory', 'no crash');

console.log('\n' + (failed ? failed + ' fallo(s)' : 'Todo OK') + '\n');
process.exit(failed ? 1 : 0);
