#!/usr/bin/env node
/** Verificación — señales WAN, reconciliación flota, circuit breaker QR. */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const results = [];

function ok(name, detail) {
  results.push({ ok: true, name, detail });
}
function fail(name, detail) {
  results.push({ ok: false, name, detail });
  failed++;
}
function assert(cond, name, detail) {
  if (cond) ok(name, detail);
  else fail(name, detail);
}

function mustInclude(file, patterns, label) {
  const p = join(root, file);
  if (!existsSync(p)) {
    fail(label, 'ausente: ' + file);
    return '';
  }
  const txt = readFileSync(p, 'utf8');
  for (const pat of patterns) {
    const hit = typeof pat === 'string' ? txt.includes(pat) : pat.test(txt);
    if (!hit) {
      fail(label, 'falta: ' + String(pat));
      return txt;
    }
  }
  ok(label, file);
  return txt;
}

mustInclude('app/infra/CrozzoCloudThrottle.js', [
  'crozzoNoteWanUnreachable',
  'crozzoCloudWanReady',
  'crozzoWanOnline',
], 'Señales WAN en throttle');

mustInclude('app/infra/CrozzoFleetOperationalReconcile.js', [
  'CrozzoFleetOperationalReconcile',
  'crozzoActivateLocalSyncPath',
  'pullLocalRuntimeOnce',
], 'Reconciliación flota');

mustInclude('app/modules/CrozzoInternalQrRegistry.js', [
  'cloudPublishAllowed',
  'openCloudCircuit',
  'PUBLISH_MIN_GAP_MS',
], 'Circuit breaker QR interno');

mustInclude('app/infra/CrozzoLanSyncBridge.js', ['underPressure'], 'LAN pull bajo presión nube');

mustInclude('app/core/CrozzoConnectionManager.js', ['CrozzoConnectionManager'], 'ConnectionManager global');

mustInclude('app/infra/CrozzoStartupReady.js', ['CrozzoFleetOperationalReconcile'], 'Startup flota');

assert(existsSync(join(root, 'app/index.html')), 'Script index', 'index.html');
const idx = readFileSync(join(root, 'app/index.html'), 'utf8');
assert(idx.includes('CrozzoFleetOperationalReconcile.js'), 'Fleet script index', 'index.html');

console.log('\n=== Crozzo coordinación flota — verificación ===\n');
for (const r of results) {
  console.log((r.ok ? '✓' : '✗') + ' ' + r.name + (r.detail ? ' — ' + r.detail : ''));
}
console.log('\n' + (failed ? failed + ' fallo(s)' : 'Todo OK') + ' (' + results.length + ' checks)\n');
process.exit(failed ? 1 : 0);
