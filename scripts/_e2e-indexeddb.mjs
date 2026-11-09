#!/usr/bin/env node
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = join(root, 'app');
let failed = 0;
function ok(n, d) { console.log('✓ ' + n + (d ? ' — ' + d : '')); }
function fail(n, d) { console.log('✗ ' + n + (d ? ' — ' + d : '')); failed++; }

const store = {};
const mockIDB = {
  open: function() {
    const req = { result: null, onsuccess: null, onerror: null, onupgradeneeded: null };
    setTimeout(function() {
      req.result = {
        objectStoreNames: { contains: function() { return true; } },
        createObjectStore: function() {},
        transaction: function() {
          return {
            objectStore: function() {
              return {
                get: function(k) {
                  const r = { result: store[k], onsuccess: null };
                  setTimeout(function() { if (r.onsuccess) r.onsuccess({ target: r }); }, 0);
                  return r;
                },
                put: function(v) {
                  store[v.key] = v;
                  const r = { onsuccess: null };
                  setTimeout(function() { if (r.onsuccess) r.onsuccess({ target: r }); }, 0);
                  return r;
                },
                delete: function(k) {
                  delete store[k];
                  const r = { onsuccess: null };
                  setTimeout(function() { if (r.onsuccess) r.onsuccess({ target: r }); }, 0);
                  return r;
                },
                getAll: function() {
                  const vals = Object.values(store);
                  const r = { result: vals, onsuccess: null };
                  setTimeout(function() { if (r.onsuccess) r.onsuccess({ target: r }); }, 0);
                  return r;
                }
              };
            }
          };
        }
      };
      if (req.onsuccess) req.onsuccess({ target: req });
    }, 0);
    return req;
  }
};

const ctx = {
  console: { log() {}, warn() {}, error() {} },
  localStorage: { _s: {}, getItem(k) { return this._s[k] || null; }, setItem(k, v) { this._s[k] = v; }, removeItem(k) { delete this._s[k]; } },
  globalThis: null, window: null,
  document: { readyState: 'complete', body: { appendChild() {} }, querySelector: function() { return null; }, addEventListener: function() {}, createElement: function() { return { style: {}, textContent: '', title: '', appendChild() {} }; } },
  setTimeout: function(fn, ms) { return setTimeout(fn, ms); },
  clearTimeout: clearTimeout,
  setInterval: function() { return 0; },
  clearInterval: function() {},
  navigator: { onLine: true },
  indexedDB: mockIDB,
  addEventListener: function() {},
  dispatchEvent: function() {},
  TextEncoder: globalThis.TextEncoder,
  TextDecoder: globalThis.TextDecoder,
};
ctx.window = ctx; ctx.globalThis = ctx;

vm.createContext(ctx);
vm.runInContext(readFileSync(join(app, 'infra/CrozzoRuntimeIndexedDb.js'), 'utf8'), ctx, { filename: 'CrozzoRuntimeIndexedDb.js' });

await new Promise(function(r) { setTimeout(r, 50); });

await ctx.CrozzoRuntimeIndexedDb.set('test-key', { value: 42 });
const val = await ctx.CrozzoRuntimeIndexedDb.get('test-key');
console.log('get result:', val);
if (val && val.value === 42) { ok('Set/Get', 'value=42'); } else { fail('Set/Get', 'expected 42, got ' + JSON.stringify(val)); }

const all = await ctx.CrozzoRuntimeIndexedDb.getAll();
console.log('getAll count:', all.length);
if (all.length >= 1) { ok('GetAll', all.length + ' items'); } else { fail('GetAll', 'empty'); }

await ctx.CrozzoRuntimeIndexedDb.delete('test-key');
const afterDelete = await ctx.CrozzoRuntimeIndexedDb.get('test-key');
if (afterDelete === undefined || afterDelete === null) { ok('Delete', 'removed'); } else { fail('Delete', 'still exists'); }

console.log('\n' + (failed ? failed + ' fallo(s)' : 'Todo OK') + '\n');
process.exit(failed ? 1 : 0);
