#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const fails = [];

function must(rel, needles) {
  const txt = fs.readFileSync(path.join(root, rel), 'utf8');
  needles.forEach((n) => {
    if (!txt.includes(n)) fails.push(rel + ': falta ' + n);
  });
}

must('app/infra/CrozzoMdnsBridge.js', ['pickCentralFromMdns', 'crozzo_mdns_drain_discovered']);
must('app/infra/CrozzoLanWebSocketBridge.js', ['WebSocket', 'notifyComandasByIds', 'lan_push']);
must('app/infra/CrozzoWifiZoneBridge.js', ['pickCentralFromMdns']);
must('app/index.html', ['CrozzoMdnsBridge.js', 'CrozzoLanWebSocketBridge.js']);
must('src-tauri/src/crozzo_mdns.rs', ['_crozzo-pos._tcp']);
must('src-tauri/src/crozzo_lan_ws.rs', ['crozzo_lan_ws_broadcast']);
must('src-tauri/src/crozzo_lan_sync_server.rs', ['broadcast_text', 'start_with_lan']);

if (fails.length) {
  console.error('LAN-MDNS-WS CHECK: FAIL');
  fails.forEach((f) => console.error(' -', f));
  process.exit(1);
}
console.log('LAN-MDNS-WS CHECK: OK');
