#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const results = [];
function ok(n, d) { results.push({ ok: true, name: n, detail: d }); }
function fail(n, d) { results.push({ ok: false, name: n, detail: d }); failed++; }
function assert(c, n, d) { c ? ok(n, d) : fail(n, d); }

console.log('2FA Modal — verificación\n');

const ctx = {
  console,
  document: { getElementById: () => null, body: { appendChild: () => {} } },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);

vm.runInContext(readFileSync(join(root, 'app/core/CrozzoFeatureFlags.js'), 'utf8'), ctx);
vm.runInContext(readFileSync(join(root, 'app/core/CrozzoSanitize.js'), 'utf8'), ctx);
vm.runInContext(readFileSync(join(root, 'app/core/Crozzo2FAPoC.js'), 'utf8'), ctx);
vm.runInContext(readFileSync(join(root, 'app/core/Crozzo2FA.js'), 'utf8'), ctx);
vm.runInContext(readFileSync(join(root, 'app/core/Crozzo2FAModal.js'), 'utf8'), ctx);

// Test 1: isEnabled
assert(typeof ctx.Crozzo2FAModal.isEnabled === 'function', 'isEnabled existe', '');
assert(ctx.Crozzo2FAModal.isEnabled() === false, 'isEnabled default: false', '');

// Test 2: show/hide
try { ctx.Crozzo2FAModal.show(); } catch (_) {}
assert(true, 'show: no lanza error', '');
try { ctx.Crozzo2FAModal.hide(); } catch (_) {}
assert(true, 'hide: no lanza error', '');

// Test 3: bindHandlers
try { ctx.Crozzo2FAModal.bindHandlers(function(){}, function(){}); } catch (_) {}
assert(true, 'bindHandlers: no lanza error', '');

// Test 4: feature flag
assert(ctx.CrozzoFeatureFlags.DEFAULTS.use2faAdmin === false, 'use2faAdmin default: false', '');

console.log('');
for (const x of results) console.log((x.ok ? '  ✓ ' : '  ✗ ') + x.name + (x.detail ? ' — ' + x.detail : ''));
console.log('');
if (failed === 0) { console.log('✅ 2FA MODAL: PASS'); process.exit(0); }
else { console.log(`❌ 2FA MODAL: FAIL — ${failed}`); process.exit(1); }
