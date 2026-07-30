#!/usr/bin/env node
/** Verificación — sello sede + conduit pago + Dataico honesto (no stub silencioso). */
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

console.log('\n=== Crozzo sede combat — verificación ===\n');

mustInclude(
  'app/infra/CrozzoSedeReadiness.js',
  ['CrozzoSedeReadiness', 'COMBAT_READY', 'evaluate', 'diagRows'],
  'Sede Readiness Seal'
);
mustInclude(
  'app/infra/CrozzoDigitalPayConduit.js',
  ['CrozzoDigitalPayConduit', 'ensurePaid', 'Idempotency-Key', 'wompi'],
  'Digital Pay Conduit'
);
mustInclude(
  'app/core/pos/CrozzoPosDianLib.js',
  [
    'api.dataico.com/direct/dataico_api/v2/invoices',
    'crozzoFiscalOutboxEnqueue',
    'allowSimulatedStamp',
    'async function dataicoStamp(xml, factura, config)',
  ],
  'Dataico adapter real + cola'
);
const dian = readFileSync(join(root, 'app/core/pos/CrozzoPosDianLib.js'), 'utf8');
assert(
  !/Simulación de llamada a Dataico/.test(dian),
  'Sin stub silencioso Dataico',
  'comentario simulación eliminado'
);
assert(/isDemo:\s*false/.test(dian) && /pending:\s*true/.test(dian), 'Estados pending/honestos', 'pending+isDemo');

mustInclude(
  'app/index.html',
  ['infra/CrozzoSedeReadiness.js', 'infra/CrozzoDigitalPayConduit.js'],
  'Scripts en index'
);
mustInclude(
  'app/core/CrozzoPosMain.js',
  ['CrozzoDigitalPayConduit.ensurePaid', 'pendiente_fiscal', 'DIGITAL_PAY_REF_REQUIRED'],
  'Cobro cableado a conduit + fiscal pendiente'
);
mustInclude(
  'app/modules/CrozzoComunicacionDiag.js',
  ['CrozzoCommandBridge', 'diagRows'],
  'Diag usa Command Bridge unificado'
);
mustInclude(
  'app/infra/CrozzoCommandBridge.js',
  [
    'CrozzoCommandBridge',
    'briefing',
    'FULL_SPECTRUM',
    'runRecovery',
    'crozzoCommandBriefing',
    'stressEnvelope',
  ],
  'Command Bridge fachada única'
);
mustInclude(
  'app/infra/CrozzoLanOpsSync.js',
  ['fleetScalePollFactor', 'fleetPeerEstimate', 'pollScaleFactor'],
  'LAN poll adaptativo flota 100'
);
mustInclude(
  'src-tauri/src/crozzo_lan_sync_server.rs',
  ['MAX_CONCURRENT_HTTP', 'Semaphore', 'http_conn_semaphore'],
  'Rust LAN semáforo HTTP 64'
);
mustInclude(
  'docs/maps/STRESS-MILITARY-REVISION.md',
  ['MISSION_CAPABLE_STRESS', '100', 'fleetScalePollFactor'],
  'Revisión militar estrés documentada'
);
mustInclude(
  'app/infra/CrozzoAutomationApi.js',
  ['commandBriefing', 'commandRecover', 'command:'],
  'Automation expone mando'
);
mustInclude(
  'app/Crozzo_POS_Completo.html',
  [
    'infra/CrozzoDigitalPayConduit.js',
    'infra/CrozzoFiscalOutboxDrain.js',
    'infra/CrozzoSedeReadiness.js',
    'infra/CrozzoCommandScorecard.js',
    'infra/CrozzoCommandBridge.js',
  ],
  'Completo: paridad stack mando'
);
mustInclude(
  'app/infra/CrozzoFiscalOutboxDrain.js',
  ['CrozzoFiscalOutboxDrain', 'drain', 'replayEntry'],
  'Fiscal outbox drain'
);
mustInclude(
  'app/infra/CrozzoCommandScorecard.js',
  ['CrozzoCommandScorecard', 'SUPERIORIDAD', 'vs_gestro', 'offline_fleet', 'Offline real'],
  'Command scorecard mercado'
);
mustInclude(
  'scripts/_offline-combat-demo.mjs',
  ['OFFLINE REAL', 'sobrevive', 'pendiente_timbrado', 'Offline real'],
  'H3a demo offline combat'
);
mustInclude(
  'docs/maps/OFFLINE-COMBAT-NARRATIVE.md',
  ['sobrevive al corte de internet', 'Offline real', 'pendiente_timbrado'],
  'H3a narrativa offline'
);
mustInclude(
  'app/infra/CrozzoSedeAutosanable.js',
  ['crozzoSedeAutosanableRescue', 'KI-016', 'announceIdentity'],
  'L3 sede autosanable'
);
mustInclude(
  'docs/maps/LEGENDARY-CONNECTIVITY-DRILLS.md',
  ['Drill D1', 'Drill D2', 'Drill D3'],
  'L1 drills conectividad legendaria'
);
mustInclude(
  'app/infra/CrozzoReconnectSync.js',
  ['CrozzoFiscalOutboxDrain', 'fiscalDrain'],
  'Reconnect drena cola fiscal'
);
mustInclude(
  'app/index.html',
  [
    'infra/CrozzoFiscalOutboxDrain.js',
    'infra/CrozzoCommandScorecard.js',
    'infra/CrozzoCommandBridge.js',
  ],
  'Scripts mando en index'
);
mustInclude(
  'docs/maps/MILITARY-COMMAND-DOCTRINE.md',
  ['DDIL', 'crozzoCommandScorecard', 'Dataico', 'Wompi'],
  'Doctrina militar documentada'
);

console.log('');
for (const r of results) {
  console.log((r.ok ? '✓' : '✗') + ' ' + r.name + (r.detail ? ' — ' + r.detail : ''));
}
console.log(failed ? `\nFALLÓ (${failed})\n` : `\nTodo OK (${results.length} checks)\n`);
process.exit(failed ? 1 : 0);
