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

console.log('2FA Integration — verificación\n');

const storage = {};
const ctx = {
  console,
  localStorage: {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null),
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: (k) => { delete storage[k]; },
  },
  document: { getElementById: () => null, body: { appendChild: () => {} } },
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);

vm.runInContext(readFileSync(join(root, 'app/core/CrozzoFeatureFlags.js'), 'utf8'), ctx);
vm.runInContext(readFileSync(join(root, 'app/core/CrozzoSanitize.js'), 'utf8'), ctx);
vm.runInContext(readFileSync(join(root, 'app/core/Crozzo2FAPoC.js'), 'utf8'), ctx);
vm.runInContext(readFileSync(join(root, 'app/core/Crozzo2FA.js'), 'utf8'), ctx);
vm.runInContext(readFileSync(join(root, 'app/core/Crozzo2FAModal.js'), 'utf8'), ctx);
vm.runInContext(readFileSync(join(root, 'app/core/Crozzo2FAIntegration.js'), 'utf8'), ctx);

// Test 1: isEnabled (default false)
assert(ctx.Crozzo2FAIntegration.isEnabled() === false, 'isEnabled default: false', '');

// Test 2: isAdminOrSuperadmin
assert(ctx.Crozzo2FAIntegration.isAdminOrSuperadmin('admin') === true, 'admin: true', '');
assert(ctx.Crozzo2FAIntegration.isAdminOrSuperadmin('caja') === false, 'caja: false', '');

// Test 3: shouldPrompt2FA sin secreto → false
assert(ctx.Crozzo2FAIntegration.shouldPrompt2FA({ rol: 'admin', id: 'u1' }) === false, 'shouldPrompt2FA sin secreto: false', '');

// Test 4: shouldPrompt2FA con secreto + flag activo
ctx.CrozzoFeatureFlags.set('use2faAdmin', true);
storage['crozzo_2fa_secret_u2'] = 'JBSWY3DPEHPK3PXP';
assert(ctx.Crozzo2FAIntegration.shouldPrompt2FA({ rol: 'admin', id: 'u2' }) === true, 'shouldPrompt2FA con secreto+flag: true', '');

console.log('');
for (const x of results) console.log((x.ok ? '  ✓ ' : '  ✗ ') + x.name + (x.detail ? ' — ' + x.detail : ''));
console.log('');
if (failed === 0) { console.log('✅ 2FA INTEGRATION: PASS'); process.exit(0); }
else { console.log(`❌ 2FA INTEGRATION: FAIL — ${failed}`); process.exit(1); }
