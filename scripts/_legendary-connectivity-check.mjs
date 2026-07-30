#!/usr/bin/env node
/**
 * Conectividad legendaria — verificación paquete L1+L2+L3
 * --------------------------------------------------------------------------
 * L1: drills de campo documentados + briefing mando
 * L2: jitter deviceId en WS/heal + purge agresivo 800 en Rust
 * L3: CrozzoSedeAutosanable (rescue sin FleetOperationalReconcile)
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const results = [];
function ok(n, d) { results.push({ ok: true, name: n, detail: d }); }
function fail(n, d) { results.push({ ok: false, name: n, detail: d }); failed++; }
function assert(c, n, d) { c ? ok(n, d) : fail(n, d); }
function read(rel) {
  const p = join(root, rel);
  assert(existsSync(p), 'Existe ' + rel, rel);
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
}

console.log('\n══ CROZZO — CONECTIVIDAD LEGENDARIA (L1+L2+L3) ══\n');

// ── L1 campo ─────────────────────────────────────────────────────────────
const drills = read('docs/maps/LEGENDARY-CONNECTIVITY-DRILLS.md');
assert(drills.includes('Drill D1'), 'L1: Drill D1 WAN off');
assert(drills.includes('Drill D2'), 'L1: Drill D2 ancla caja');
assert(drills.includes('Drill D3'), 'L1: Drill D3 recovery masivo');
assert(drills.includes('crozzoCommandBriefing'), 'L1: briefing mando documentado');
assert(drills.includes('Firma de campo'), 'L1: tabla firma evidencia');

const qa = read('docs/maps/QA-TIENDA-P0-CHECKLIST.md');
assert(qa.includes('LEGENDARY-CONNECTIVITY-DRILLS'), 'L1: QA-TIENDA enlaza drills legendarios');

const offline = read('docs/maps/OFFLINE-COMBAT-NARRATIVE.md');
assert(offline.includes('LEGENDARY-CONNECTIVITY-DRILLS') || offline.includes('conectividad legendaria'), 'L1: narrativa offline enlaza drills');

const bridge = read('app/infra/CrozzoCommandBridge.js');
assert(bridge.includes('crozzoCommandBriefing'), 'L1: crozzoCommandBriefing existe');
assert(bridge.includes('stressEnvelope'), 'L1: stressEnvelope existe');

// ── L2 afilado ───────────────────────────────────────────────────────────
const ws = read('app/infra/CrozzoLanWebSocketBridge.js');
assert(
  ws.includes('crozzoReconnectStaggerMs') || /reconnectDelay[\s\S]{0,200}deviceId|reconnectStagger/.test(ws),
  'L2: WS reconnect usa stagger/deviceId'
);

const lanOps = read('app/infra/CrozzoLanOpsSync.js');
assert(
  /healAnchorSilence[\s\S]{0,800}crozzoReconnectStaggerMs|healAnchorSilence[\s\S]{0,800}stagger/.test(lanOps),
  'L2: healAnchorSilence escalona connect'
);

const recon = read('app/infra/CrozzoReconnectSync.js');
assert(recon.includes('reconnectStaggerMs'), 'L2: reconnectStaggerMs canónico');

const rust = read('src-tauri/src/crozzo_lan_sync_server.rs');
assert(rust.includes('COMANDAS_ACTIVE_MAX'), 'L2: const COMANDAS_ACTIVE_MAX');
assert(rust.includes('trim_comandas_active') || rust.includes('purge_entregada'), 'L2: helper purge/trim');
assert(/entregada[\s\S]{0,120}remove|estado.*entregada/.test(rust), 'L2: entregada se purga');

// ── L3 sede autosanable ──────────────────────────────────────────────────
const auto = read('app/infra/CrozzoSedeAutosanable.js');
assert(auto.includes('crozzoSedeAutosanableRescue') || auto.includes('rescue'), 'L3: API rescue');
assert(!/FleetOperationalReconcile/.test(auto) || /NO.*FleetOperationalReconcile|KI-016/.test(auto), 'L3: no llama FleetOperationalReconcile (KI-016)');
assert(auto.includes('announceIdentity') || auto.includes('crozzoAnnounceFleetIdentity'), 'L3: anuncia identidad');

const index = read('app/index.html');
assert(index.includes('CrozzoSedeAutosanable.js'), 'L3: script en index.html');

const diag = read('app/modules/CrozzoComunicacionDiag.js');
assert(
  diag.includes('crozzoSedeAutosanableRescue') || diag.includes('CrozzoSedeAutosanable'),
  'L3: Diag Reparar usa autosanable'
);

// Runtime smoke del módulo autosanable
const ctx = {
  console,
  localStorage: {
    _m: { crozzo_device_id: 'DEV-LEGENDARY' },
    getItem(k) { return this._m[k] || null; },
    setItem(k, v) { this._m[k] = String(v); }
  },
  CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } },
  dispatchEvent() {},
  addEventListener() {},
  setTimeout(fn) { try { fn(); } catch (_) {} return 1; },
  clearTimeout() {},
  Date,
  Math,
  String,
  Number,
  Promise,
  getMultiDeviceConfig: () => ({ role: 'B', centralIp: '192.168.1.10', deviceId: 'DEV-LEGENDARY' }),
  crozzoReconnectStaggerMs: (b, s) => (b || 0) + 10,
  crozzoAnnounceFleetIdentity: async () => ({ ok: true }),
  CrozzoPeerDirectory: {
    announceIdentity: async () => ({ ok: true }),
    softHealSoloFleet: async () => ({ ok: true, reason: 'soft_heal' }),
    getFleetSnapshot: () => ({ peerCount: 2, label: 'ok' })
  },
  CrozzoMdnsBridge: { rediscoverCentral: async () => ({ ok: true }) },
  CrozzoConnectivityDirector: { scheduleEvaluate() {} },
  CrozzoLanWebSocketBridge: { connect() { ctx.__wsConnect = true; } },
  CrozzoOfflineGossip: { ensureStandby() {} }
};
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(auto, ctx);
assert(typeof ctx.crozzoSedeAutosanableRescue === 'function', 'L3: export global rescue');
const r = await ctx.crozzoSedeAutosanableRescue({ reason: 'check', skipStagger: true });
assert(r && r.ok !== false, 'L3: rescue() ok', JSON.stringify(r));
assert(!r.usedFleetReconcile, 'L3: rescue no usó FleetReconcile');

console.log('');
for (const x of results) console.log((x.ok ? '  ✓ ' : '  ✗ ') + x.name + (x.detail ? ' — ' + x.detail : ''));
console.log('');
console.log(`Total: ${results.length} · fallos: ${failed}`);
if (failed === 0) {
  console.log('✅ CONECTIVIDAD LEGENDARIA: PASS');
  process.exit(0);
}
console.log('❌ CONECTIVIDAD LEGENDARIA: FAIL');
process.exit(1);
