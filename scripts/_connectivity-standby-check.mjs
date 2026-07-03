#!/usr/bin/env node
/** Verificación — standby LAN paralelo + calidad WAN estricta. */
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

mustInclude('app/infra/CrozzoConnectivityStandby.js', [
  'CrozzoConnectivityStandby',
  'crozzoCloudQualityReliable',
  'crozzoLanWsStandbyActive',
  'crozzoLanTransportStandbyAllowed',
  'crozzoCloudOperationalRealtimeHealthy',
], 'Standby conectividad');

mustInclude('app/infra/CrozzoCloudThrottle.js', [
  'if (isUnderPressure()) return false',
  'crozzoNoteWanUnreachable',
], 'WAN bajo presión');

mustInclude('app/infra/CrozzoLanWebSocketBridge.js', ['crozzoLanWsStandbyActive'], 'WS standby');

mustInclude('app/infra/CrozzoLanSyncBridge.js', [
  'crozzoLanTransportStandbyAllowed',
  'isUnderPressure',
], 'Transport LAN standby');

mustInclude('app/infra/CrozzoLanOpsSync.js', [
  'shouldRunLanStandby',
  'startLanStandby',
  'STANDBY_TICK_MS',
], 'LanOps standby');

mustInclude('app/modules/CrozzoComandasCloudSync.js', ['crozzoLanTransportStandbyAllowed'], 'Comandas LAN standby');

const idx = readFileSync(join(root, 'app/index.html'), 'utf8');
const posPos = idx.indexOf('CrozzoPosMain.js');
const standbyPos = idx.indexOf('CrozzoConnectivityStandby.js');
assert(posPos > 0 && standbyPos > posPos, 'Standby después PosMain', 'index.html');

const pkg = readFileSync(join(root, 'package.json'), 'utf8');
assert(pkg.includes('_connectivity-standby-check.mjs'), 'test standby en sync-clinical', 'package.json');

console.log('\n=== Crozzo standby LAN — verificación ===\n');
for (const r of results) {
  console.log((r.ok ? '✓' : '✗') + ' ' + r.name + (r.detail ? ' — ' + r.detail : ''));
}
console.log('\n' + (failed ? failed + ' fallo(s)' : 'Todo OK') + ' (' + results.length + ' checks)\n');
process.exit(failed ? 1 : 0);
