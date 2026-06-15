#!/usr/bin/env node
/**
 * Verifica endurecimiento de flujos mixtos (cloud/LAN/offline/gossip).
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const fails = [];

function must(rel, needles, label) {
  const txt = fs.readFileSync(path.join(root, rel), 'utf8');
  needles.forEach(function (n) {
    if (!txt.includes(n)) fails.push((label || rel) + ': falta "' + n + '"');
  });
}

must('app/modules/CrozzoComandasCloudSync.js', [
  'crozzoFanoutComandasByIds',
  'tierAllowsCloudPush',
  'pushComandaLan',
  '__crozzoComandaTidMark',
], 'fanout comandas');
must('app/core/CrozzoPosMain.js', [
  'crozzoFanoutComandasByIds',
  'probeHealthLocal',
  'sameEstado && sameItems',
  'comandaSlotLocks',
  'crozzoTryAcquireComandaSlotLock',
  'crozzoMergeCartsMaps',
], 'PosMain tier/apply');
must('app/modules/CrozzoComandasCloudSync.js', ['crozzoFanoutComandaEstado', 'comanda_estado'], 'fanout estado');
must('app/modules/CrozzoPosRuntimeCloud.js', ['comandaSlotLocks'], 'runtime locks sync');
must('app/infra/CrozzoLanSyncBridge.js', ['tryApplyLanComanda', "typ !== 'comanda'"], 'LAN comanda central');
must('app/modules/CrozzoComandasCloudSync.js', ["type: 'comanda'"], 'LAN push comanda');
must('app/infra/CrozzoOfflineGossip.js', ['cloudPathLikely', 'markTidSeen', '__crozzoComandaTidRecent'], 'gossip dedup');

const main = fs.readFileSync(path.join(root, 'app/core/CrozzoPosMain.js'), 'utf8');
if (main.includes("return markOk('role_a')")) {
  fails.push('Role A aún marca LAN ok sin servidor');
}
if (main.includes('md.role === \'A\')')) {
  const tierBlock = main.slice(main.indexOf('if (lanReach || gwReach'), main.indexOf('setLast(\'offline\')'));
  if (tierBlock.includes("md.role === 'A'")) {
    fails.push('detectConnectivityTier aún fuerza LAN por rol A');
  }
}

if (fails.length) {
  console.error('MIXED-FLOW CHECK: FAIL');
  fails.forEach((f) => console.error(' -', f));
  process.exit(1);
}
console.log('MIXED-FLOW CHECK: OK');
