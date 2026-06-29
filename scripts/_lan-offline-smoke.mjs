#!/usr/bin/env node
/**
 * Smoke: tier LAN sin nube + wiring push nativo caja.
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = join(root, 'app');
let failed = 0;

function ok(name) {
  console.log('✓', name);
}
function fail(name, detail) {
  console.log('✗', name, detail || '');
  failed++;
}

function mustInclude(file, patterns) {
  const p = file.startsWith('src-tauri') ? join(root, file) : join(app, file);
  if (!existsSync(p)) {
    fail(file, 'ausente');
    return;
  }
  const txt = readFileSync(p, 'utf8');
  for (const pat of patterns) {
    if (!txt.includes(pat)) {
      fail(file, 'falta ' + pat);
      return;
    }
  }
  ok(file);
}

function loadScript(rel) {
  const p = join(app, rel);
  const code = readFileSync(p, 'utf8');
  const sandbox = {
    global: {},
    window: {},
    document: { hidden: false, addEventListener: function () {} },
    localStorage: {
      _m: {},
      getItem(k) {
        return this._m[k] || null;
      },
      setItem(k, v) {
        this._m[k] = v;
      },
    },
    navigator: { onLine: true },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    fetch: global.fetch,
    AbortController: global.AbortController,
    Promise,
    console,
  };
  sandbox.window = sandbox.global;
  vm.runInNewContext(code, sandbox, { filename: p });
  return sandbox.global;
}

console.log('=== LAN offline smoke ===\n');

mustInclude('infra/CrozzoLanSyncBridge.js', ['crozzoLanPostSync', 'crozzo_lan_sync_post']);
mustInclude('modules/CrozzoPosRuntimeCloud.js', ['crozzoLanPostSync']);
mustInclude('infra/CrozzoConnectivityOrchestrator.js', ['ensureLevelStable', 'lanEvidenceForLevel']);
mustInclude('infra/CrozzoLanWebSocketBridge.js', ['resolveCentralIp', 'crozzo_wifi_zone_last_ip']);
mustInclude('src-tauri/src/crozzo_lan_sync_server.rs', ['crozzo_lan_sync_post', 'ingest_api_sync']);

const g = loadScript('infra/CrozzoLanOpsSync.js');
g.__CROZZO_TIER_LAST = 'lan';
g.crozzoDeferLocalSync = () => false;
g.getMultiDeviceConfig = () => ({ role: 'B', centralIp: '192.168.1.50', port: 3000 });
g.crozzoOperationalRealtimeActive = () => true;
if (typeof g.crozzoStartLanOpsSync === 'function') g.crozzoStartLanOpsSync('smoke');
if (g.CrozzoLanOpsSync && g.CrozzoLanOpsSync.status().started) ok('LanOpsSync tier lan');
else fail('LanOpsSync tier lan');

console.log('\n' + (failed ? failed + ' fallo(s)' : 'OK'));

process.exit(failed ? 1 : 0);
