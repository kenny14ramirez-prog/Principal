#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const runsDir = path.join(root, 'docs', 'reports', 'agent-runs');
if (!fs.existsSync(runsDir)) { console.error('Sin runs de agente.'); process.exit(1); }
const runs = fs.readdirSync(runsDir).filter(d => fs.statSync(path.join(runsDir, d)).isDirectory() && fs.existsSync(path.join(runsDir, d, 'findings.json'))).sort();
const latest = runs[runs.length - 1];
const runPath = path.join(runsDir, latest);
const findingsPath = path.join(runPath, 'findings.json');
if (!fs.existsSync(findingsPath)) { console.error('Sin findings.json en', latest); process.exit(1); }
const data = JSON.parse(fs.readFileSync(findingsPath, 'utf8'));

const checks = [
  ['runId presente', !!data.runId],
  ['steps es array', Array.isArray(data.steps)],
  ['steps >= 1', data.steps.length >= 1],
  ['findings es array', Array.isArray(data.findings)],
  ['finishedAt presente', !!data.finishedAt],
  ['cada step tiene verdict', data.steps.every(s => ['PASS','WARN','FAIL'].includes(s.verdict))],
];
console.log('\n──────── AGENT EVAL ────────');
console.log('Run:', latest);
let failed = 0;
for (const [l, ok] of checks) { if (!ok) failed++; console.log(`  [${ok ? 'OK' : 'X '}] ${l}`); }
// Eval: pasos fallidos
const failedSteps = data.steps.filter(s => s.verdict === 'FAIL').length;
const p0 = data.findings.filter(f => f.severity === 'P0').length;
console.log(`  Pasos FAIL: ${failedSteps} | Hallazgos P0: ${p0}`);
console.log('───────────────────────────');
console.log(`  ${checks.length - failed}/${checks.length} checks OK`);
process.exit(failed ? 1 : 0);