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

const f = join(app, 'infra/CrozzoCloudDiscovery.js');
if (!existsSync(f)) { fail('Archivo', 'ausente'); process.exit(1); }
const txt = readFileSync(f, 'utf8');
for (const p of ['isCloudAvailable', 'registerDevice', 'pullDevices', 'discoverCentral', 'startHeartbeatWatch', 'afterMainInit']) {
  if (!txt.includes(p)) { fail('API', 'falta ' + p); } else { ok('API', p); }
}

const ctx = { console: { log() {}, warn() {}, error() {} }, localStorage: { _s: {}, getItem(k) { return this._s[k] || null; }, setItem(k, v) { this._s[k] = v; }, removeItem(k) { delete this._s[k]; } }, globalThis: null, window: null, setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout, setInterval: () => {}, clearInterval: () => {}, fetch: async () => ({ ok: false, json: async () => ({}) }) };
ctx.window = ctx; ctx.globalThis = ctx;
ctx.__SUPABASE = { from: () => ({ upsert: async () => ({ error: null }), select: () => ({ eq: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }) };
vm.createContext(ctx);
vm.runInContext(readFileSync(f, 'utf8'), ctx, { filename: 'CrozzoCloudDiscovery.js' });

const avail = ctx.CrozzoCloudDiscovery.isCloudAvailable();
console.log('isCloudAvailable:', avail);
ok('isCloudAvailable', String(avail));

console.log('\n' + (failed ? failed + ' fallo(s)' : 'Todo OK') + '\n');
process.exit(failed ? 1 : 0);
