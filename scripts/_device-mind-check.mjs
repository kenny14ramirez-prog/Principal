#!/usr/bin/env node
/**
 * Verifica mente local + mesh standby (capa fina, sin romper híbrido existente).
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const failures = [];

function mustExist(rel) {
  if (!fs.existsSync(path.join(root, rel))) failures.push('Falta: ' + rel);
}

function mustContain(rel, needle, label) {
  const txt = fs.readFileSync(path.join(root, rel), 'utf8');
  if (!txt.includes(needle)) failures.push(label || `${rel} sin: ${needle}`);
}

mustExist('app/infra/CrozzoDeviceMind.js');
mustContain('app/infra/CrozzoDeviceMind.js', 'crozzoGetDeviceMindDecision', 'API decisión');
mustContain('app/infra/CrozzoDeviceMind.js', 'meshStandbyEnabled', 'mesh standby config');
mustContain('app/infra/CrozzoOfflineGossip.js', 'ensureStandby', 'gossip ensureStandby');
mustContain('app/infra/CrozzoOfflineGossip.js', 'shouldBlockOutboundPublish', 'gossip no duplica');
mustContain('app/infra/CrozzoConnectivityOrchestrator.js', 'ensureMeshStandbyQuiet', 'orquestador standby');
mustContain('app/modules/CrozzoComunicacionDiag.js', 'mind-decision', 'diag decisión');
mustContain('app/index.html', 'CrozzoDeviceMind.js', 'script DeviceMind');
mustExist('app/infra/CrozzoOperationalIngest.js');
mustContain('app/infra/CrozzoOperationalIngest.js', 'applyComandaNew', 'ingest applyComandaNew');
mustContain('app/index.html', 'CrozzoOperationalIngest.js', 'script OperationalIngest');
mustContain('app/infra/CrozzoOfflineGossip.js', 'CrozzoOperationalIngest.applyComandaNew', 'gossip delega ingest');
mustContain('app/infra/CrozzoLanSyncBridge.js', 'CrozzoOperationalIngest.gateComandaNew', 'LAN gate ingest');
mustContain('app/modules/CrozzoComandasCloudSync.js', 'CrozzoOperationalIngest.markComandaNew', 'cloud marca ingest');
mustExist('app/infra/CrozzoEasyConnect.js');
mustContain('app/infra/CrozzoEasyConnect.js', 'crozzoGetEasyConnectStatus', 'EasyConnect API');
mustContain('app/index.html', 'CrozzoEasyConnect.js', 'script EasyConnect');

if (failures.length) {
  console.error('DEVICE-MIND CHECK: FAIL');
  failures.forEach((f) => console.error(' -', f));
  process.exit(1);
}
console.log('DEVICE-MIND CHECK: OK');
