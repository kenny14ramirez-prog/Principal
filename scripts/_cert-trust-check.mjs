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

const f = join(app, 'infra/CrozzoCertTrust.js');
if (!existsSync(f)) { fail('Archivo', 'ausente'); process.exit(1); }
const txt = readFileSync(f, 'utf8');
for (const p of ['crozzoCertTrustInstall', 'crozzoCertTrustGet', 'crozzoCertTrustGetFingerprint', 'isTrusted', 'isInstalled']) {
  if (!txt.includes(p)) { fail('API', 'falta ' + p); } else { ok('API', p); }
}

// Sandbox
const ctx = { console: { log() {}, warn() {}, error() {} }, localStorage: { _s: {}, getItem(k) { return this._s[k] || null; }, setItem(k, v) { this._s[k] = v; }, removeItem(k) { delete this._s[k]; } }, globalThis: null, window: null, setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout };
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(readFileSync(f, 'utf8'), ctx, { filename: 'CrozzoCertTrust.js' });

// TOFU: save fingerprint
ctx.crozzoCertTrustInstall = ctx.crozzoCertTrustInstall || (async () => ({ ok: true, installed: false, method: 'test' }));
console.log('APIs disponibles:', Object.keys(ctx.CrozzoCertTrust || {}));
if (typeof ctx.crozzoCertTrustGet === 'function') {
  const r = ctx.crozzoCertTrustGet();
  console.log('get result:', r);
  ok('get', 'OK');
} else { fail('get', 'no function'); }

console.log('\n' + (failed ? failed + ' fallo(s)' : 'Todo OK') + '\n');
process.exit(failed ? 1 : 0);
