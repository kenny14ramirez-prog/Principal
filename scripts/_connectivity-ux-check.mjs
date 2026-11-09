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

const f = join(app, 'infra/CrozzoConnectivityUx.js');
if (!existsSync(f)) { fail('Archivo', 'ausente'); process.exit(1); }
const txt = readFileSync(f, 'utf8');
for (const p of ['start', 'render', 'auditLog', 'getAuditLog', 'tierEmoji']) {
  if (!txt.includes(p)) { fail('API', 'falta ' + p); } else { ok('API', p); }
}

// Sandbox (minimal DOM)
const ctx = { console: { log() {}, warn() {}, error() {} }, localStorage: { _s: {}, getItem(k) { return this._s[k] || null; }, setItem(k, v) { this._s[k] = v; }, removeItem(k) { delete this._s[k]; } }, globalThis: null, window: null, document: { readyState: 'complete', body: { appendChild() {} }, querySelector: () => null, addEventListener() {}, createElement: () => ({ style: {}, textContent: '', title: '', appendChild() {} }) }, setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout, setInterval: () => {}, clearInterval: () => {}, AudioContext: undefined };
ctx.window = ctx; ctx.globalThis = ctx;
ctx.__CROZZO_TIER_LAST = 'cloud';
vm.createContext(ctx);
vm.runInContext(readFileSync(f, 'utf8'), ctx, { filename: 'CrozzoConnectivityUx.js' });

// Wait for start
setTimeout(() => {
  const audit = ctx.crozzoConnAuditLog ? ctx.crozzoConnAuditLog() : [];
  console.log('audit entries:', audit.length);
  if (audit.length > 0) { ok('audit', audit.length + ' entries'); } else { fail('audit', 'sin entries'); }
  console.log('\n' + (failed ? failed + ' fallo(s)' : 'Todo OK') + '\n');
  process.exit(failed ? 1 : 0);
}, 200);
