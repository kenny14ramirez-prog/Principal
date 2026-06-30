#!/usr/bin/env node
/** Sync operativo: overlay rápido, sin probes/LAN redundantes en entrada. */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gate = readFileSync(join(root, 'app/modules/CrozzoOperativeSyncGate.js'), 'utf8');
const rtc = readFileSync(join(root, 'app/modules/CrozzoPosRuntimeCloud.js'), 'utf8');

let failed = 0;
function ok(n, d) {
  console.log('OK   ' + n + (d ? ' — ' + d : ''));
}
function fail(n, d) {
  console.log('FAIL ' + n + (d ? ' — ' + d : ''));
  failed++;
}

if (/OVERLAY_MAX_MS/.test(gate) && /overlayTimer/.test(gate)) ok('overlay timeout', '≤4.5s');
else fail('overlay timeout');

if (/skipHeavyPull/.test(gate) && /cloudSyncRecentlyFresh/.test(gate)) ok('recent pull fast path', 'sin overlay si bootstrap reciente');
else fail('recent pull fast path');

if (/Promise\.all\(\[runtimeP, comandasP\]\)/.test(gate)) ok('parallel pulls', 'runtime + comandas en paralelo');
else fail('parallel pulls');

if (/skipPreAnalyze|fastEntry/.test(gate) && !/await analyzeAndDiscardStale\('pre'\)/.test(gate)) {
  ok('skip pre probe on fast entry', 'sin SELECT duplicado antes del pull');
} else if (/!fastEntry && !opts\.skipPreAnalyze/.test(gate)) {
  ok('skip pre probe on fast entry', 'pre solo fuera de fastEntry');
} else {
  fail('skip pre probe on fast entry');
}

if (/skipProbe: true/.test(gate) && /buildRemoteMetaFromAppliedRuntime/.test(gate)) {
  ok('post analyze sin probe', 'usa runtime ya aplicado');
} else fail('post analyze sin probe');

if (/lanSegmentLikelyUp/.test(gate) && !/force: true\s*\}\)/.test(gate.match(/pullComandasFromLan[\s\S]{0,120}/)?.[0] || '')) {
  ok('lan gated', 'LAN solo si segmento activo');
} else if (/lanSegmentLikelyUp\(\)/.test(gate)) {
  ok('lan gated', 'LAN condicionado');
} else {
  fail('lan gated');
}

if (/crozzoRuntimeCloudLastPullAt/.test(rtc)) ok('last pull timestamp', 'expuesto para fast path');
else fail('last pull timestamp');

if (/lanTimeoutMs/.test(rtc) && /skipLan/.test(rtc)) ok('probe lan opts', 'timeout configurable');
else fail('probe lan opts');

console.log('\n' + (failed ? failed + ' fallo(s)\n' : '0 fallos — operative-sync-gate-check OK\n'));
process.exit(failed ? 1 : 0);
