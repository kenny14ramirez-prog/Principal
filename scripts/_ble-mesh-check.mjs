import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function must(rel, needles) {
  const p = join(root, rel);
  if (!existsSync(p)) {
    console.error('✗ Falta', rel);
    process.exitCode = 1;
    return;
  }
  const txt = readFileSync(p, 'utf8');
  const miss = needles.filter((n) => !txt.includes(n));
  if (miss.length) {
    console.error('✗', rel, 'falta:', miss.join(', '));
    process.exitCode = 1;
    return;
  }
  console.log('✓', rel.split('/').pop());
}

must('app/infra/CrozzoBleMesh.js', [
  'CrozzoBleMesh',
  'MESH_INV',
  'MESH_PROFILE',
  'MESH_NAME_CHANGE',
  'MESH_WHO',
  'MAX_HOPS',
  'requestBluetoothEnable',
  'publishProfile',
  'publishNameChange',
  'publishWhoQuery',
  'tryPreconnectPeer',
  'isDesktopTauri',
  'isWindowsDesktop',
  'meshParticipationEnabled',
  'publishComandaNewByIds',
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
]);
must('app/infra/CrozzoBlePeerRegistry.js', [
  'CrozzoBlePeerRegistry',
  'prewarmBluetoothOnApkBoot',
  'startBackgroundWiring',
  'ingestMeshProfile',
  'ingestNameChange',
  'resolvePeerByName',
  'applyIdentityChange',
  'identityRev',
  'aliases',
]);
must('app/modules/CrozzoInternalQrRegistry.js', ['refreshIdentityOnCloud']);
must('app/infra/CrozzoStartupReady.js', ['prewarmBluetoothMesh']);
must('app/infra/CrozzoOfflineGossip.js', ['CrozzoBleMesh.sendRaw']);
must('app/infra/CrozzoConnectivityOrchestrator.js', ['mesh_ble', 'CrozzoBleMesh']);
must('app/core/CrozzoPosExtensions.js', ['MESH_FRAME', 'relayMeshFrame']);
must('app/core/CrozzoAndroidNative.js', ['requestBluetoothEnable']);
must('src-tauri/src/crozzo_ble_mesh.rs', ['crozzo_ble_mesh_start', 'win-udp-mesh', 'desktop']);
must('src-tauri/src/crozzo_gossip_udp.rs', ['ensure_started', 'send_json']);
must('src-tauri/permissions/crozzo-commands.toml', ['allow-crozzo-ble-mesh']);
must('app/index.html', ['CrozzoBlePeerRegistry.js', 'CrozzoBleMesh.js']);

if (!process.exitCode) {
  console.log('\nTodo OK (BLE mesh checks)');
}
