#!/usr/bin/env node
/**
 * Verificación clínica — equilibrio cloud/LAN, zonas Z0/Z1/Z3, fanout híbrido.
 * Complementa _lan-ops-sync-check.mjs (nivel 2 LAN).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = join(root, 'app');
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

function mustNotInclude(file, pattern, label) {
  const p = join(root, file);
  if (!existsSync(p)) {
    fail(label, 'ausente: ' + file);
    return;
  }
  const txt = readFileSync(p, 'utf8');
  if (typeof pattern === 'string' ? txt.includes(pattern) : pattern.test(txt)) {
    fail(label, 'regresión: contiene ' + String(pattern));
  } else {
    ok(label, 'sin regresión ' + String(pattern).slice(0, 40));
  }
}

// --- Zonas y transporte ---
mustInclude('app/infra/CrozzoCloudSyncPriorities.js', [
  'cloudOperationalRealtimeHealthy',
  'ZONE_OPERATION',
  'ZONE_NAV',
  'ZONE_DEFER',
  'getPageZone',
], 'Prioridades zonas');

mustInclude('app/infra/CrozzoPageCloudWatch.js', [
  'cloudStandby',
  'refreshOpsTransports',
  'isZone0Page',
], 'PageCloudWatch Z0');

// --- Equilibrio LAN standby ---
mustInclude('app/infra/CrozzoLanOpsSync.js', [
  'opRealtimeActive()',
  'cloudRealtimeStandby',
  'lanOpsTransportPrimary',
  'shouldRunLanOps',
], 'LanOps equilibrio');

// --- Fanout híbrido (nube + LAN condicional) ---
const comTxt = mustInclude('app/modules/CrozzoComandasCloudSync.js', [
  'lanParallelPushNeeded',
  'scheduleOutboxDrain',
  'fanoutComandaEstado',
  'fanoutComandasByIds',
], 'Comandas fanout híbrido');

assert(
  comTxt.includes('if (tierAllowsCloudPush()') && comTxt.includes('scheduleOutboxDrain'),
  'Estado comanda → outbox cloud',
  'fanoutComandaEstado drena nube'
);

mustNotInclude(
  'app/modules/CrozzoComandasCloudSync.js',
  /if \(lan\) \{\s*[\s\S]{0,120}return;\s*\}\s*var tier = tierNow\(\)/,
  'Fanout sin early-return LAN-only'
);

// --- Reconnect intermitente ---
mustInclude('app/infra/CrozzoReconnectSync.js', ['ONLINE_STABLE_MS', 'navigator.onLine'], 'Reconnect estable');

mustInclude('app/infra/CrozzoConnectivityOrchestrator.js', [
  'CLOUD_TO_LAN_HOLD_MS',
  'stopCloudTransportsDeferred',
  '__CROZZO_FIELD_TEST_QUIET',
], 'Orquestador anti-flap');

// --- Throttle nube ---
mustInclude('app/infra/CrozzoCloudThrottle.js', ['canRunDrain', 'markPressure', 'resubscribeDelayMs'], 'Cloud throttle');

console.log('\n=== Crozzo equilibrio conectividad — verificación clínica ===\n');
for (const r of results) {
  console.log((r.ok ? '✓' : '✗') + ' ' + r.name + (r.detail ? ' — ' + r.detail : ''));
}
console.log('\n' + (failed ? failed + ' fallo(s)' : 'Todo OK') + ' (' + results.length + ' checks)\n');
process.exit(failed ? 1 : 0);
