#!/usr/bin/env node
/** Verificación cascada LAN (nivel 2): activate path, rediscovery, dual-path con nube. */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const results = [];
function ok(n, d) { results.push({ ok: true, name: n, detail: d }); }
function fail(n, d) { results.push({ ok: false, name: n, detail: d }); failed++; }
function assert(c, n, d) { c ? ok(n, d) : fail(n, d); }

const lan = readFileSync(join(root, 'app/infra/CrozzoLanSyncBridge.js'), 'utf8');
const wifi = readFileSync(join(root, 'app/infra/CrozzoWifiZoneBridge.js'), 'utf8');
const pri = readFileSync(join(root, 'app/infra/CrozzoCloudSyncPriorities.js'), 'utf8');
const ops = readFileSync(join(root, 'app/infra/CrozzoLanOpsSync.js'), 'utf8');
const rec = readFileSync(join(root, 'app/infra/CrozzoReconnectSync.js'), 'utf8');
const main = readFileSync(join(root, 'app/core/CrozzoPosMain.js'), 'utf8');

assert(/function crozzoActivateLocalSyncPath/.test(lan), 'activate path definido', 'CrozzoLanSyncBridge');
assert(/global\.crozzoActivateLocalSyncPath\s*=/.test(lan), 'activate exportado', 'window global');
assert(/IP guardada inválida/.test(wifi), 'rediscover en cambio red', 'watchTick');
assert(!/crozzoPullPosRuntimeCloud.*watchTick/s.test(wifi), 'sin pull nube en watch', 'evita tormenta');
assert(/conn\.addEventListener\('change'/.test(wifi), 'listener cambio red', 'connection change');
assert(/mdLan\.role === 'B'/.test(pri), 'LAN paralela rol B', 'crozzoLocalSyncAllowed');
assert(/__CROZZO_LAN_LAST_OK/.test(ops), 'ops sync con LAN reciente', 'tierAllowsLan cloud');
assert(/crozzoWifiZoneResolveCentral/.test(rec), 'reconnect rediscover', 'runFullReconnectSync');
assert(/crozzoActivateLocalSyncPath/.test(rec), 'reconnect activate LAN', 'runFullReconnectSync');
assert(/cloud_and_lan/.test(main), 'dual path cloud+lan', 'detectConnectivityTier');

console.log('\n=== lan-cascade-check ===\n');
results.forEach((r) => console.log((r.ok ? 'OK  ' : 'FAIL') + '  ' + r.name + (r.detail ? ' — ' + r.detail : '')));
console.log('\n' + results.filter((r) => r.ok).length + '/' + results.length + ' checks\n');
process.exit(failed ? 1 : 0);
