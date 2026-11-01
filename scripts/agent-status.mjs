#!/usr/bin/env node
// Agent status — lee agents/registry.json y muestra árbol de mando + conectividad.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const regPath = path.join(root, 'agents', 'registry.json');

if (!fs.existsSync(regPath)) {
  console.error('registry.json no encontrado:', regPath);
  process.exit(1);
}

const reg = JSON.parse(fs.readFileSync(regPath, 'utf8'));

console.log(`\n=== ${reg.name} v${reg.version} ===`);
console.log(`Comandante: ${reg.commander}`);
console.log(`Doctrina: ${reg.doctrine}`);
console.log(`Contrato: ${reg.toolingContract}\n`);

const squadsByGeneral = {};
for (const s of reg.squads) {
  (squadsByGeneral[s.general] = squadsByGeneral[s.general] || []).push(s);
}

const agentsBySquad = {};
for (const a of reg.agents) {
  (agentsBySquad[a.squad] = agentsBySquad[a.squad] || []).push(a);
}

for (const g of reg.generals) {
  console.log(`[${g.id}] ${g.name} — ${g.mission}`);
  for (const s of squadsByGeneral[g.id] || []) {
    console.log(`  ├─ ${s.id} (líder: ${s.leader}) — ${s.mission}`);
    for (const a of agentsBySquad[s.id] || []) {
      console.log(`  │   ├─ ${a.id} [${a.level}] — ${a.role}`);
    }
  }
}

console.log('\n--- Agentes existentes asignados ---');
for (const [k, v] of Object.entries(reg.assignment || {})) {
  console.log(`  ${k} → ${v}`);
}

console.log('\n--- Protocolos ---');
for (const [k, v] of Object.entries(reg.protocols || {})) {
  console.log(`  ${k}: ${v}`);
}

// Últimos SITREPs
const runsDir = path.join(root, 'agents', 'runs');
let sitreps = [];
try {
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/SITREP/i.test(e.name)) sitreps.push(p);
    }
  };
  if (fs.existsSync(runsDir)) walk(runsDir);
} catch (e) {}
sitreps.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
console.log('\n--- Últimos SITREPs (5) ---');
for (const s of sitreps.slice(0, 5)) {
  const rel = path.relative(root, s);
  console.log(`  ${rel}  (${new Date(fs.statSync(s).mtimeMs).toISOString()})`);
}
if (sitreps.length === 0) console.log('  (ninguno aún)');

console.log('\n--- Conectividad (herramientas) ---');
console.log('  map:refresh | issues:* | graph:* | synapse:* | edit:scope | sync | test:* | qa:*');
console.log('  Contrato: agents/TOOLING-CONTRACT.md');
console.log('  Doctrina: docs/maps/ARMY-DOCTRINE.md');
console.log('  SITREP template: agents/templates/SITREP-TEMPLATE.md');
console.log('  Verificación: node scripts/verify-army.mjs');
console.log('  Damage history: docs/maps/DAMAGE-HISTORY.md\n');
