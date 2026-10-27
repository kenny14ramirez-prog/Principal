#!/usr/bin/env node
/**
 * POE — Plano Ops Efímero (presencia ≠ DB)
 * --------------------------------------------------------------------------
 * Gate R0/R1/R2 cableado: enter/exit no fuerzan meta; bus + Broadcast + LAN
 * + gossip SLOT_PRESENCE; Rust ephemeral; boot script; drills D4–D7.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const results = [];
function ok(n, d) {
  results.push({ ok: true, name: n, detail: d });
}
function fail(n, d) {
  results.push({ ok: false, name: n, detail: d });
  failed++;
}
function assert(c, n, d) {
  c ? ok(n, d) : fail(n, d);
}
function read(rel) {
  const p = join(root, rel);
  assert(existsSync(p), 'Existe ' + rel, rel);
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
}

console.log('\n══ CROZZO — OPS PLANE PRESENCE (POE) ══\n');

const proto = read('docs/maps/OPS-PLANE-PROTOCOL.md');
assert(proto.includes('Regla de oro'), 'R0: protocolo documentado');
assert(proto.includes('crozzoOpsPresenceMetrics'), 'R0: métricas documentadas');
assert(proto.includes('skippedMetaForce') || proto.includes('metaCheckpoint'), 'R0: contadores POE');

const bus = read('app/infra/CrozzoOpsPresenceBus.js');
assert(bus.includes('crozzoOpsPresencePublish'), 'R1: publish API');
assert(bus.includes('crozzoOpsPresenceApply'), 'R1: apply API');
assert(bus.includes('crozzoOpsPresenceMetrics'), 'R1: metrics API');
assert(bus.includes('emitCloud') || bus.includes('crozzoOpsPulseEmitPresence'), 'R1: cloud emit');
assert(bus.includes("type: 'slot_presence'"), 'R1: envelope slot_presence');
assert(bus.includes('dbMetaUpserts') || bus.includes('__crozzoOpsPlaneMetaStats'), 'R0: contadores meta DB');

const posMain = read('app/core/CrozzoPosMain.js');
assert(
  /slot_presence_enter[\s\S]{0,400}crozzoOpsPresencePublish|isPoePresence[\s\S]{0,200}crozzoOpsPresencePublish/.test(
    posMain
  ),
  'R1: enter/exit → POE publish'
);
assert(
  /isPoePresence[\s\S]{0,900}runtime_sync_critical[\s\S]{0,120}:poe[\s\S]{0,80}return;/.test(posMain),
  'R1: POE rama early-return (sin force meta en enter/exit)'
);
assert(
  !/slot_presence_enter[\s\S]{0,120}__crozzoForceMetaPresencePush\s*=\s*true/.test(posMain),
  'R1: enter no setea ForceMetaPresencePush'
);

const pulse = read('app/modules/CrozzoCloudOpsPulse.js');
assert(pulse.includes("kind === 'presence'") || pulse.includes('kind: \'presence\''), 'R1: handle presence');
assert(pulse.includes('emitPresence') && pulse.includes('crozzoOpsPulseEmitPresence'), 'R1: emitPresence export');
assert(pulse.includes('crozzoOpsPresenceApply'), 'R1: apply desde Broadcast');

const ws = read('app/infra/CrozzoLanWebSocketBridge.js');
assert(ws.includes("typEarly === 'slot_presence'") || ws.includes("=== 'slot_presence'"), 'R1: LAN WS slot_presence');
assert(ws.includes('crozzoOpsPresenceApply'), 'R1: WS → apply');

const rust = read('src-tauri/src/crozzo_lan_sync_server.rs');
assert(rust.includes('slot_presence'), 'R1: Rust conoce slot_presence');
assert(
  /slot_presence[\s\S]{0,200}ephemeral|ephemeral[\s\S]{0,80}slot_presence/.test(rust),
  'R1: Rust ephemeral (no upsert comanda)'
);

const gossip = read('app/infra/CrozzoOfflineGossip.js');
assert(gossip.includes('SLOT_PRESENCE'), 'R2: kind SLOT_PRESENCE');
assert(gossip.includes('publishSlotPresence'), 'R2: publishSlotPresence');
assert(/publishSlotPresence:\s*publishSlotPresence/.test(gossip), 'R2: export API');

const rtc = read('app/modules/CrozzoPosRuntimeCloud.js');
assert(rtc.includes('__crozzoOpsPlaneMetaStats') || rtc.includes('noteOpsPlaneMetaUpsert'), 'R0: instrumentación meta upsert');

const index = read('app/index.html');
assert(index.includes('CrozzoOpsPresenceBus.js'), 'R1: boot index.html');
const completo = read('app/Crozzo_POS_Completo.html');
assert(completo.includes('CrozzoOpsPresenceBus.js'), 'R1: boot Completo');

const drills = read('docs/maps/LEGENDARY-CONNECTIVITY-DRILLS.md');
assert(drills.includes('Drill D4'), 'R3: Drill D4 enter/leave storm');
assert(drills.includes('Drill D5'), 'R3: Drill D5 WAN off presencia LAN');
assert(drills.includes('Drill D6'), 'R3: Drill D6 caja off WAN on');
assert(drills.includes('Drill D7'), 'R3: Drill D7 ambos off + backup');
assert(drills.includes('crozzoOpsPresenceMetrics') || drills.includes('OPS-PLANE'), 'R3: métricas/POE en drills');
assert(
  drills.includes('CentralFailover') || drills.includes('backup central') || drills.includes('Backup central'),
  'R2: drill backup central'
);

const idxMaps = read('docs/maps/INDEX.md');
assert(idxMaps.includes('OPS-PLANE-PROTOCOL'), 'R0: INDEX enlaza protocolo');

console.log('');
results.forEach(function (r) {
  console.log((r.ok ? '  PASS' : '  FAIL') + '  ' + r.name + (r.detail ? ' — ' + r.detail : ''));
});
console.log('\n─── ' + (failed ? 'FAIL ' + failed : 'PASS') + ' (' + results.length + ' checks) ───\n');
process.exit(failed ? 1 : 0);
