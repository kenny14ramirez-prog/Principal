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

const f = join(app, 'infra/CrozzoChannelFallback.js');
if (!existsSync(f)) { fail('Archivo', 'ausente'); process.exit(1); }
const txt = readFileSync(f, 'utf8');
for (const p of ['tryLan', 'tryCloud', 'tryHotspot', 'runFallback', 'getActive', 'isDesktopTauri']) {
  if (!txt.includes(p)) { fail('API', 'falta ' + p); } else { ok('API', p); }
}

// Sandbox with Tauri mock
const ctx = { console: { log() {}, warn() {}, error() {} }, localStorage: { _s: {}, getItem(k) { return this._s[k] || null; }, setItem(k, v) { this._s[k] = v; }, removeItem(k) { delete this._s[k]; } }, globalThis: null, window: null, document: { readyState: 'complete', body: { appendChild() {} }, addEventListener() {} }, setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout, fetch: async () => ({ ok: false }), navigator: { onLine: true } };
ctx.window = ctx; ctx.globalThis = ctx;
ctx.__TAURI__ = { core: { invoke: async (cmd) => ({ ok: true, ssid: 'TestSSID', passphrase: 'TestPass' }) } };
vm.createContext(ctx);
vm.runInContext(readFileSync(f, 'utf8'), ctx, { filename: 'CrozzoChannelFallback.js' });

// Test tryHotspot
const r = await ctx.CrozzoChannelFallback.tryHotspot(1000);
console.log('tryHotspot result:', r);
if (r !== true) { fail('tryHotspot', 'esperado true'); } else { ok('tryHotspot', 'true'); }
console.log('active channel:', ctx.__CROZZO_ACTIVE_CHANNEL);
if (ctx.__CROZZO_ACTIVE_CHANNEL !== 'hotspot') { fail('active channel', 'esperado hotspot'); } else { ok('active channel', 'hotspot'); }

console.log('\n' + (failed ? failed + ' fallo(s)' : 'Todo OK') + '\n');
process.exit(failed ? 1 : 0);
