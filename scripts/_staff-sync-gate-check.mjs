#!/usr/bin/env node
/** Verifica cableado sync usuarios pos_staff (pre-login + broadcast). */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

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

const cloud = readFileSync(join(root, 'app/core/CrozzoPosCloud.js'), 'utf8');
const main = readFileSync(join(root, 'app/core/CrozzoPosMain.js'), 'utf8');
const pri = readFileSync(join(root, 'app/infra/CrozzoCloudSyncPriorities.js'), 'utf8');
const rtc = readFileSync(join(root, 'app/modules/CrozzoPosRuntimeCloud.js'), 'utf8');

assert(/function crozzoEnsureRemoteStaffCatalogSync/.test(cloud), 'API staff auth', 'crozzoEnsureRemoteStaffCatalogSync');
assert(/preLogin/.test(cloud) && /staff_auth/.test(cloud), 'tenant sync pre-login', 'startCrozzoRemoteTenantSync');
assert(/crozzoTenantHubBroadcast\(\)/.test(cloud) && /push pos_staff/.test(cloud), 'broadcast tras push', 'pos_staff notify');
assert(/kind:\s*'staff_pull'/.test(cloud) && /force:\s*true/.test(cloud), 'debounced pull force', 'staff_pull');
assert(/staff_auth/.test(pri), 'bypass staff_auth', 'CloudSyncPriorities');
assert(/inicio-operacion[\s\S]{0,200}'staff'/.test(pri), 'hub staff domain', 'inicio-operacion');
assert(/crozzoEnsureRemoteStaffCatalogSync/.test(main), 'login overlay pull', 'showLoginOverlay');
assert(/crozzoStartLoginStaffCatalogPull/.test(main), 'login interval', '45s refresh');
assert(/staff_auth/.test(main) && /usuario_no_encontrado/.test(main), 'login retry pull', 'loginWithCredentials');
assert(/crozzoEnsureRemoteStaffCatalogSync/.test(rtc), 'ensure cloud staff', 'crozzoEnsureCloudSyncActive');

console.log('\n=== staff-sync-gate-check ===\n');
results.forEach((r) => console.log((r.ok ? 'OK  ' : 'FAIL') + '  ' + r.name + (r.detail ? ' — ' + r.detail : '')));
console.log('\n' + results.filter((r) => r.ok).length + '/' + results.length + ' checks\n');
process.exit(failed ? 1 : 0);
