#!/usr/bin/env node
// Verificación de integridad del ejército: conectividad del arsenal.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const checks = [];
function check(name, cond, detail) {
  checks.push({ name, ok: !!cond, detail });
}

// 1. Doctrina y contrato
check('Doctrina (ARMY-DOCTRINE.md)', fs.existsSync(path.join(root, 'docs/maps/ARMY-DOCTRINE.md')));
check('Contrato (TOOLING-CONTRACT.md)', fs.existsSync(path.join(root, 'agents/TOOLING-CONTRACT.md')));
check('Registry (agents/registry.json)', fs.existsSync(path.join(root, 'agents/registry.json')));
check('Escuadrones (agents/squads/SQUADS.md)', fs.existsSync(path.join(root, 'agents/squads/SQUADS.md')));
check('SITREP template', fs.existsSync(path.join(root, 'agents/templates/SITREP-TEMPLATE.md')));
check('Status script', fs.existsSync(path.join(root, 'scripts/agent-status.mjs')));

// 2. Registry JSON válido y estructura mínima
let reg = null;
try {
  reg = JSON.parse(fs.readFileSync(path.join(root, 'agents/registry.json'), 'utf8'));
  check('Registry JSON válido', true);
  check('Generales >= 4', (reg.generals || []).length >= 4, `found ${(reg.generals||[]).length}`);
  check('Escuadrones >= 10', (reg.squads || []).length >= 10, `found ${(reg.squads||[]).length}`);
  check('Agentes >= 40', (reg.agents || []).length >= 40, `found ${(reg.agents||[]).length}`);
  check('Protocolos definidos', !!reg.protocols && Object.keys(reg.protocols).length >= 4);
} catch (e) {
  check('Registry JSON válido', false, String(e));
}

// 3. AGENTS.md referencia la doctrina
const agentsMd = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
check('AGENTS.md referencia ARMY-DOCTRINE', agentsMd.includes('ARMY-DOCTRINE.md'));
check('AGENTS.md referencia TOOLING-CONTRACT', agentsMd.includes('TOOLING-CONTRACT.md'));
check('AGENTS.md referencia registry', agentsMd.includes('agents/registry.json'));

// 4. config/agents-factory.json referencia army
const factory = JSON.parse(fs.readFileSync(path.join(root, 'config/agents-factory.json'), 'utf8'));
check('agents-factory.json sección army', !!factory.army && factory.army.registry === 'agents/registry.json');

// 5. Mapas clave
for (const f of ['INDEX.md', 'SYNC-INVARIANTS.md', 'KNOWN-ISSUES.md', 'known-issues.json']) {
  check(`Mapa ${f}`, fs.existsSync(path.join(root, 'docs/maps', f)));
}

// 6. Herramientas del arsenal
for (const f of ['crozzo-map-refresh.mjs', 'crozzo-known-issues.mjs', 'crozzo-edit-scope.mjs']) {
  check(`Script ${f}`, fs.existsSync(path.join(root, 'scripts', f)));
}

// Reporte
let ok = 0, fail = 0;
for (const c of checks) {
  if (c.ok) { ok++; console.log(`  PASS  ${c.name}${c.detail ? ' — ' + c.detail : ''}`); }
  else { fail++; console.log(`  FAIL  ${c.name}${c.detail ? ' — ' + c.detail : ''}`); }
}
console.log(`\n=== ARMY VERIFY: ${ok} PASS / ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
