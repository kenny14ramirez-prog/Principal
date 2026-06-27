#!/usr/bin/env node
/**
 * Verificación estática + sandbox del nivel 2 LAN (CrozzoLanOpsSync).
 * No modifica producción — solo cableado y comportamiento simulado.
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import vm from 'node:vm';
import { execSync } from 'child_process';

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

function scriptOrder(html, before, after) {
  const txt = readFileSync(join(root, html), 'utf8');
  const iA = txt.indexOf(before);
  const iB = txt.indexOf(after);
  assert(iA > 0 && iB > 0 && iA < iB, 'Orden ' + html, before + ' antes de ' + after);
}

// --- Estáticos: cableado nuevo ---
assert(existsSync(join(app, 'infra/CrozzoLanOpsSync.js')), 'Archivo', 'CrozzoLanOpsSync.js');
mustInclude('app/infra/CrozzoLanOpsSync.js', [
  'crozzoPullComandasFromLan',
  'crozzoStartLanOpsSync',
  'crozzoLanOpsPulseEmit',
  '/api/comandas',
  'crozzoRunFullReconnectSync',
  'tierAllowsLan',
], 'LanOpsSync API');

mustInclude('app/infra/CrozzoConnectivityOrchestrator.js', ['lan_ops_sync', 'CrozzoLanOpsSync'], 'Orquestador → LanOps');
mustInclude('app/infra/CrozzoLanWebSocketBridge.js', ['lan_ops_pulse', '__crozzoLanOpsHandlePulse', 'postComandaToCentralStore'], 'WS pulso LAN');
mustInclude('src-tauri/src/crozzo_lan_sync_server.rs', ['x-crozzo-lan-token', 'CORS_ALLOW_HEADERS'], 'Rust CORS LAN token');
mustInclude('src-tauri/src/crozzo_lan_sync_server.rs', ['/api/comandas', 'comandas_active', 'upsert_comanda_snapshot'], 'Rust comandas snapshot');
mustInclude('src-tauri/tauri.conf.json', ['ws:', 'wss:'], 'CSP permite WebSocket LAN');

const main = readFileSync(join(app, 'core/CrozzoPosMain.js'), 'utf8');
assert(/cloudPingFailed/.test(main) && /Base de datos no alcanzable/.test(main), 'Tier cascada', 'ping falla → LAN inmediato');
assert(/activeTier === 'lan'/.test(main), 'Tier cloud gate', 'crozzoTierAllowsCloudSync respeta tier lan');

for (const html of ['app/index.html', 'app/Crozzo_POS_Completo.html']) {
  mustInclude(html, ['CrozzoLanOpsSync.js'], 'Script en ' + html);
  scriptOrder(html, 'CrozzoLanOpsSync.js', 'CrozzoLanWebSocketBridge.js');
  scriptOrder(html, 'CrozzoLanSyncBridge.js', 'CrozzoLanOpsSync.js');
}

const srcOps = join(root, 'src/infra/CrozzoLanOpsSync.js');
assert(existsSync(srcOps), 'Sync src', 'CrozzoLanOpsSync en src/ (npm run sync)');

// Compatibilidad con flujo existente (no roto)
mustInclude('app/modules/CrozzoComandasCloudSync.js', ['pushComandaLan', 'outboxEnqueue', 'deferLocalCloudSync'], 'Comandas cloud intacto');
mustInclude('app/infra/CrozzoReconnectSync.js', ['reconcileStale: true', 'crozzoFlushComandaOutbox'], 'Reconnect intacto');
mustInclude('app/infra/CrozzoLanSyncBridge.js', ['tryApplyLanComanda', 'crozzoPushComandaToCloud', 'crozzoLanPostSync'], 'LAN bridge puente nube');
mustInclude('src-tauri/src/crozzo_lan_sync_server.rs', ['crozzo_lan_sync_post', 'ingest_api_sync'], 'Rust post LAN nativo');

try {
  execSync('cargo check -q', { cwd: join(root, 'src-tauri'), stdio: 'pipe' });
  ok('Rust compile', 'cargo check OK');
} catch (e) {
  fail('Rust compile', String(e.stderr || e.message).slice(0, 200));
}

// --- Sandbox: LanOpsSync en tier lan ---
function makeSandbox() {
  const listeners = {};
  const spies = {};
  const fetchCalls = [];
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: clearTimeout,
    setInterval: (fn) => setInterval(fn, 999999),
    clearInterval: clearInterval,
    Date,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { hidden: false, addEventListener() {} },
    addEventListener: (t, cb) => {
      (listeners[t] = listeners[t] || []).push(cb);
    },
    dispatchEvent(ev) {
      (listeners[ev.type] || []).forEach((cb) => {
        try {
          cb(ev);
        } catch (_) {}
      });
    },
    CustomEvent: class {
      constructor(type, init) {
        this.type = type;
        this.detail = init && init.detail;
      }
    },
    getMultiDeviceConfig: () => ({ role: 'B', centralIp: '192.168.1.50', port: 3000, deviceId: 'TAB-1' }),
    __CROZZO_TIER_LAST: 'lan',
    crozzoDeferLocalSync: () => false,
    crozzoOperationalRealtimeActive: () => true,
    ensureCrozzoDeviceId: () => 'TAB-1',
    comandas: [{ id: 99, transaction_id: 'tid-99', estado: 'pendiente', items: [] }],
    __crozzoEmergencyApplyComandaSnapshot: (snap, opts) => {
      spies.applied = snap;
      spies.applyOpts = opts;
      return true;
    },
    crozzoPullPosRuntimeCloud: () => Promise.resolve(true),
    crozzoHandleRemoteRuntimeUiSync: () => {
      spies.uiSync = (spies.uiSync || 0) + 1;
    },
    crozzoRunFullReconnectSync: () => {
      spies.reconnect = (spies.reconnect || 0) + 1;
      return Promise.resolve({ ok: true });
    },
    fetch: (url, opts) => {
      fetchCalls.push({ url, opts });
      if (String(url).includes('/api/comandas')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              comandas: [{ id: 42, transaction_id: 'tid-42', estado: 'listo', items: [{ id: 1 }] }],
            }),
        });
      }
      return Promise.resolve({ ok: false });
    },
    CrozzoLanWebSocketBridge: { afterMainInit: () => {}, connect: () => {} },
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(readFileSync(join(app, 'infra/CrozzoLanOpsSync.js'), 'utf8'), ctx, {
    filename: 'CrozzoLanOpsSync.js',
  });
  return { ctx, spies, fetchCalls, listeners };
}

async function sandboxTests() {
  const h = makeSandbox();
  const c = h.ctx;

  assert(typeof c.crozzoPullComandasFromLan === 'function', 'Sandbox carga', 'API global');
  assert(c.CrozzoLanOpsSync.tierAllows(), 'tier lan activo', 'tierAllows=true');

  const pulled = await c.crozzoPullComandasFromLan({ force: true, skipPrint: true });
  assert(pulled === true, 'Pull comandas LAN', 'aplicó snapshot remoto');
  assert(h.spies.applied && h.spies.applied.id === 42, 'Apply comanda', 'id=42 desde /api/comandas');
  assert(h.fetchCalls.some((x) => x.url.includes('192.168.1.50:3000/api/comandas')), 'Fetch central', 'Rol B apunta a caja');

  c.crozzoLanOpsPulseEmit('comanda');
  await new Promise((r) => setTimeout(r, 400));
  assert(h.fetchCalls.length >= 2, 'Pulso dispara pull', 'fetch adicional tras emit');

  // Recuperación tier → cloud
  c.__CROZZO_TIER_LAST = 'cloud';
  c.dispatchEvent(new c.CustomEvent('crozzo-tier-changed', { detail: { from: 'lan', to: 'cloud' } }));
  assert((h.spies.reconnect || 0) >= 1, 'Recover cloud', 'crozzoRunFullReconnectSync al volver nube');

  // deferLocalSync bloquea LAN ops
  const h2 = makeSandbox();
  h2.ctx.crozzoDeferLocalSync = () => true;
  vm.runInContext(readFileSync(join(app, 'infra/CrozzoLanOpsSync.js'), 'utf8'), h2.ctx, {
    filename: 'CrozzoLanOpsSync.js',
  });
  assert(h2.ctx.CrozzoLanOpsSync.tierAllows() === false, 'Nube activa defer', 'no LAN ops cuando deferLocalSync');
}

await sandboxTests();

console.log('\n=== Crozzo LAN Ops Sync — verificación ===\n');
for (const r of results) {
  console.log((r.ok ? '✓' : '✗') + ' ' + r.name + (r.detail ? ' — ' + r.detail : ''));
}
console.log('\n' + (failed ? failed + ' fallo(s)' : 'Todo OK') + ' (' + results.length + ' checks)\n');
process.exit(failed ? 1 : 0);
