/**
 * Verificación estática del flujo PC ↔ tablet ↔ nube ↔ LAN.
 * node scripts/_connectivity-flow-check.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = join(root, 'app');
const srcTauri = join(root, 'src-tauri');

const checks = [];
let failed = 0;

function ok(name, detail) {
  checks.push({ ok: true, name, detail });
}
function fail(name, detail) {
  checks.push({ ok: false, name, detail });
  failed++;
}

function mustInclude(file, patterns, label) {
  const p = join(root, file);
  if (!existsSync(p)) {
    fail(label, 'archivo ausente: ' + file);
    return;
  }
  const txt = readFileSync(p, 'utf8');
  for (const pat of patterns) {
    if (typeof pat === 'string' ? !txt.includes(pat) : !pat.test(txt)) {
      fail(label, 'falta: ' + String(pat));
      return;
    }
  }
  ok(label, file);
}

function scriptOrder(before, after) {
  const html = readFileSync(join(app, 'index.html'), 'utf8');
  const iA = html.indexOf(before);
  const iB = html.indexOf(after);
  if (iA < 0 || iB < 0) {
    fail('Orden scripts', `no encontrado ${before} o ${after}`);
    return;
  }
  if (iA >= iB) {
    fail('Orden scripts', `${before} debe cargar antes que ${after}`);
    return;
  }
  ok('Orden scripts', `${before} → ${after}`);
}

// Archivos del pilar conectividad
const required = [
  'app/infra/CrozzoReconnectSync.js',
  'app/infra/CrozzoLanSyncBridge.js',
  'app/infra/CrozzoWifiZoneBridge.js',
  'app/modules/CrozzoPosRuntimeCloud.js',
  'app/modules/CrozzoComandasCloudSync.js',
  'app/core/CrozzoPosCloud.js',
  'src-tauri/src/crozzo_lan_sync_server.rs',
  'docs/SUPABASE-SQL-POS-RUNTIME.sql',
];
for (const f of required) {
  if (existsSync(join(root, f))) ok('Archivo', f);
  else fail('Archivo', 'ausente: ' + f);
}

// Wiring JS
mustInclude('app/infra/CrozzoReconnectSync.js', [
  'crozzoRunFullReconnectSync',
  'centralAuthorityPush',
  'allDevicesPull',
  "addEventListener('online'",
  'crozzo-lan-up',
], 'ReconnectSync API');
mustInclude('app/infra/CrozzoLanSyncBridge.js', ['afterMainInit', 'drainPendingOnce', 'syncFromConfig'], 'LAN bridge');
mustInclude('app/infra/CrozzoWifiZoneBridge.js', ['resolveCentral', 'crozzoPullPosRuntimeCloud'], 'WiFi zone');
mustInclude('app/core/CrozzoPosMain.js', [
  'CROZZO_CLOUD_PAIRING',
  'crozzoOpenPairingModal',
  'btnPairDevice',
  'crozzoProbeLocalLanReachable',
  'CrozzoP2PDataHub',
  '/api/p2p/signal',
  'updateConnectivityTierBadge',
  'wizardOpenPairingScan',
], 'PosMain conectividad');
mustInclude('src-tauri/src/crozzo_lan_sync_server.rs', [
  '/health',
  '/api/runtime',
  '/api/p2p/signal',
  '/mesh-ping',
], 'Servidor LAN Rust');
mustInclude('app/index.html', ['btnPairDevice', 'crozzoConnectivityTierBadge', 'crozzoPairingOverlay', 'CrozzoReconnectSync.js'], 'UI login + badge');

// Orden de carga crítico
scriptOrder('core/CrozzoPosMain.js', 'infra/CrozzoReconnectSync.js');
scriptOrder('modules/CrozzoComandasCloudSync.js', 'infra/CrozzoReconnectSync.js');
scriptOrder('infra/CrozzoLanSyncBridge.js', 'core/CrozzoPosExtensions.js');

// Pairing payload v4
const mainJs = readFileSync(join(app, 'core/CrozzoPosMain.js'), 'utf8');
if (/version:\s*4/.test(mainJs) && /supabase_url/.test(mainJs) && /central_ip/.test(mainJs)) {
  ok('QR emparejamiento', 'payload v4 con nube + LAN');
} else {
  fail('QR emparejamiento', 'payload incompleto');
}

// P2P LAN fallback
if (/async _ensureCh/.test(mainJs) && /_canUseLanSig/.test(mainJs) && /_transport === 'lan'/.test(mainJs)) {
  ok('P2P dual', 'señalización nube + LAN');
} else {
  fail('P2P dual', 'falta fallback LAN en P2PDataHub');
}

// Rust compile
try {
  execSync('cargo check -q', { cwd: srcTauri, stdio: 'pipe', encoding: 'utf8' });
  ok('Rust', 'cargo check OK');
} catch (e) {
  fail('Rust', (e.stderr || e.stdout || e.message || 'cargo check falló').slice(0, 400));
}

// Sync app→src
const srcReconnect = join(root, 'src/infra/CrozzoReconnectSync.js');
if (existsSync(srcReconnect)) ok('Sync src', 'CrozzoReconnectSync en src/');
else fail('Sync src', 'ejecute npm run sync');

console.log('\n=== Crozzo connectivity flow check ===\n');
for (const c of checks) {
  console.log((c.ok ? '✓' : '✗') + ' ' + c.name + (c.detail ? ' — ' + c.detail : ''));
}
console.log('\n' + (failed ? failed + ' fallo(s)' : 'Todo OK') + ' (' + checks.length + ' checks)\n');
process.exit(failed ? 1 : 0);
