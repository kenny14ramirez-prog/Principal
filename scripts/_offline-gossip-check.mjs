#!/usr/bin/env node
/**
 * Verifica que la malla gossip offline esté cableada sin romper rutas cloud/LAN.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const failures = [];

function mustExist(rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) failures.push('Falta archivo: ' + rel);
}

function mustContain(rel, needle, label) {
  const p = path.join(root, rel);
  const txt = fs.readFileSync(p, 'utf8');
  if (!txt.includes(needle)) failures.push(label || `${rel} no contiene: ${needle}`);
}

mustExist('app/infra/CrozzoOfflineGossip.js');
mustExist('src-tauri/src/crozzo_gossip_udp.rs');
mustContain('app/index.html', 'CrozzoOfflineGossip.js', 'index.html sin script gossip');
mustContain('app/core/CrozzoPosMain.js', 'crozzoFanoutComandasByIds', 'crearComanda sin fanout unificado');
mustContain('app/modules/CrozzoComandasCloudSync.js', 'CrozzoOfflineGossip.publishComandaNewByIds', 'fanout sin gossip offline');
mustContain('app/core/CrozzoPosMain.js', 'maybeGossipPublishEstado', 'sin publish estado gossip');
mustContain('app/core/CrozzoPosExtensions.js', 'CrozzoOfflineGossip.afterMainInit', 'NetworkGuard sin init gossip');
mustContain('src-tauri/src/lib.rs', 'crozzo_gossip_udp_start', 'lib.rs sin commands gossip');
mustContain('app/infra/CrozzoOfflineGossip.js', "t === 'cloud' || t === 'lan' || t === 'hotspot'", 'gossip debe apagarse con cloud/lan');

const gossip = fs.readFileSync(path.join(root, 'app/infra/CrozzoOfflineGossip.js'), 'utf8');
if (!gossip.includes('meshLinkReady()')) failures.push('gossip debe respetar EmergencyMesh activo');
if (!gossip.includes('_applying')) failures.push('gossip sin guard anti-bucle');

if (failures.length) {
  console.error('OFFLINE-GOSSIP CHECK: FAIL');
  failures.forEach((f) => console.error(' -', f));
  process.exit(1);
}
console.log('OFFLINE-GOSSIP CHECK: OK (' + (8 - failures.length) + '/8)');
