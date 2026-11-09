#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const memFile = path.join(root, 'synapse', 'memory.json');

function load() {
  try { return JSON.parse(fs.readFileSync(memFile, 'utf8')); } catch (_) { return []; }
}
function save(m) {
  fs.mkdirSync(path.dirname(memFile), { recursive: true });
  fs.writeFileSync(memFile, JSON.stringify(m, null, 2) + '\n', 'utf8');
}

const args = process.argv.slice(2);
const cmd = args[0] || 'status';

const SEED = [
  { path: 'crozzo/canon', title: 'Fuente canónica app/', content: 'Editar siempre app/, luego npm run sync. No editar src/.' },
  { path: 'crozzo/sync', title: 'Z0 sync', content: 'Pantallas P0: cajero, tablets, comandas, cocina, mesas. Ver SYNC-INVARIANTS.' },
  { path: 'crozzo/fiscal', title: 'Fiscal DIAN', content: 'buildUBL21 + calcularCUFE + timbrarFactura. Sandbox bloquea CUFE real en nivel 0.' },
  { path: 'crozzo/chaos', title: 'Caos de red', content: '__degraded ReferenceError corregido en CrozzoLanSyncBridge online handler.' },
];

if (cmd === 'status') {
  const m = load();
  console.log('Synapse (Node) — status');
  console.log('  db:', memFile);
  console.log('  memories:', m.length, 'activas');
  process.exit(0);
}
if (cmd === 'search') {
  const q = (args[1] || '').toLowerCase();
  const m = load();
  const hits = m.filter(x => (x.title + ' ' + x.content + ' ' + x.path).toLowerCase().includes(q));
  if (!hits.length) { console.log('Sin memorias relevantes.'); process.exit(0); }
  for (const h of hits) console.log(`--- [${h.path}] ${h.title}\n${h.content}\n`);
  process.exit(0);
}
if (cmd === 'remember') {
  const get = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : ''; };
  const pathArg = get('--path') || 'crozzo/misc';
  const title = get('--title') || '';
  const content = get('--content') || '';
  if (!content.trim()) { console.error('Error: --content requerido'); process.exit(2); }
  const m = load();
  const id = 'mem-' + (m.length + 1);
  m.push({ id, path: pathArg, title, content: content.trim(), createdAt: new Date().toISOString() });
  save(m);
  console.log('OK', id, pathArg);
  process.exit(0);
}
if (cmd === 'seed') {
  const m = load();
  if (m.length >= SEED.length) { console.log('Seed ya presente (' + m.length + ').'); process.exit(0); }
  for (const s of SEED) m.push({ id: 'mem-' + (m.length + 1), ...s, createdAt: new Date().toISOString() });
  save(m);
  console.log('Seed OK:', m.length, 'memorias');
  process.exit(0);
}
console.log('Uso: node scripts/synapse-node.mjs status|search|remember|seed');