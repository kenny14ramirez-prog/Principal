#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const steps = [
  { name: 'sync', cmd: 'npm', args: ['run', 'sync'] },
  { name: 'smoke-boot', cmd: 'node', args: ['scripts/_smoke-boot-check.mjs'] },
  { name: 'fiscal-sandbox', cmd: 'node', args: ['scripts/_fiscal-sandbox-check.mjs'] },
  { name: 'chaos-network', cmd: 'node', args: ['scripts/_chaos-network-check.mjs'] },
  { name: 'sync-property', cmd: 'node', args: ['scripts/_sync-property-check.mjs'] },
  { name: 'printer-emulator', cmd: 'node', args: ['scripts/_printer-emulator-check.mjs'] },
  { name: 'agent-eval', cmd: 'node', args: ['scripts/_agent-eval-check.mjs'] },
];

const report = { startedAt: new Date().toISOString(), steps: [], passed: 0, failed: 0 };

for (const s of steps) {
  console.log(`\n▶ ${s.name}...`);
  const r = spawnSync(s.cmd, s.args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32', timeout: 300000 });
  const ok = r.status === 0;
  report.steps.push({ name: s.name, status: ok ? 'PASS' : 'FAIL', code: r.status });
  if (ok) report.passed++; else report.failed++;
  console.log(ok ? `✅ ${s.name}` : `❌ ${s.name} (code ${r.status})`);
}

// Run deep agent last (full flow) if not already failed badly
console.log('\n▶ agent-deep...');
const srv = spawn('node', ['scripts/_serve-src.mjs', '8131'], { cwd: root, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 8000));
const agent = spawnSync('node', ['scripts/qa-agente-profundo.mjs'], { cwd: root, stdio: 'inherit', timeout: 300000, env: { ...process.env, QA_URL: 'http://127.0.0.1:8131/index.html', QA_HEADLESS: 'true' } });
try { srv.kill(); } catch (_) {}
const agentOk = agent.status === 0;
report.steps.push({ name: 'agent-deep', status: agentOk ? 'PASS' : 'FAIL', code: agent.status });
if (agentOk) report.passed++; else report.failed++;

report.finishedAt = new Date().toISOString();
const outDir = path.join(root, 'docs', 'reports');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `verification-${new Date().toISOString().replace(/[:.]/g, '-')}.md`);
let md = `# Verificación completa\n\n`;
md += `**Inicio:** ${report.startedAt}\n**Fin:** ${report.finishedAt}\n\n`;
md += `## Resultados\n\n| Paso | Estado |\n|------|--------|\n`;
for (const s of report.steps) md += `| ${s.name} | ${s.status} |\n`;
md += `\n**Pasados:** ${report.passed} | **Fallidos:** ${report.failed}\n`;
md += `\nVeredicto: ${report.failed === 0 ? '✅ TODO OK' : '❌ HAY FALLOS'}\n`;
fs.writeFileSync(outFile, md, 'utf8');

console.log(`\n📄 Reporte: ${outFile}`);
console.log(`📊 ${report.passed} pasados / ${report.failed} fallidos`);
process.exit(report.failed > 0 ? 1 : 0);