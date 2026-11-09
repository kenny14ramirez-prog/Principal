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

// Static checks
const f = join(app, 'infra/CrozzoTlsPinning.js');
if (!existsSync(f)) { fail('Archivo', 'ausente'); process.exit(1); }
const txt = readFileSync(f, 'utf8');
for (const p of ['crozzoTlsVerifyFingerprint', 'crozzoTlsSaveFingerprint', 'crozzoTlsGetPairedFingerprint', 'verifyConnection', 'trustOnFirstUse']) {
  if (!txt.includes(p)) { fail('API', 'falta ' + p); } else { ok('API', p); }
}

// Sandbox
const ctx = { console: { log() {}, warn() {}, error() {} }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, globalThis: null, window: null };
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(readFileSync(f, 'utf8'), ctx, { filename: 'CrozzoTlsPinning.js' });

// TOFU test
ctx.localStorage = { _s: {}, getItem(k) { return this._s[k] || null; }, setItem(k, v) { this._s[k] = v; }, removeItem(k) { delete this._s[k]; } };
ctx.window = ctx; ctx.globalThis = ctx;
vm.runInContext(readFileSync(f, 'utf8'), ctx, { filename: 'CrozzoTlsPinning.js' });
const save = ctx.crozzoTlsSaveFingerprint('abc123');
const verify1 = ctx.crozzoTlsVerifyFingerprint('abc123');
const verify2 = ctx.crozzoTlsVerifyFingerprint('wrong');
console.log('TOFU save:', save, 'verify match:', verify1, 'verify mismatch:', verify2);
if (verify1 !== true) { fail('TOFU match', 'esperado true'); } else { ok('TOFU match', 'true'); }
if (verify2 !== false) { fail('TOFU mismatch', 'esperado false'); } else { ok('TOFU mismatch', 'false'); }

console.log('\n' + (failed ? failed + ' fallo(s)' : 'Todo OK') + '\n');
process.exit(failed ? 1 : 0);
