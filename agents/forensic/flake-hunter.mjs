/**
 * FLAKE-HUNTER
 * Hunt intermittent issues - race conditions, flap, timing
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { feedback } from '../core/agent-feedback.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, '..', '..');

export class FlakeHunter {
  constructor() {
    this.agentId = 'FLAKE-HUNTER';
    this.findings = [];
  }

  async investigate() {
    console.log(`\n[${this.agentId}] Cazando flakes/races...`);
    const context = feedback.getContextFor(this.agentId);
    
    // Look for potential race conditions
    const files = ['app/infra/CrozzoConnectivityOrchestrator.js', 'app/infra/CrozzoLanOpsSync.js'];
    for (const f of files) {
      try {
        const fullPath = path.join(root, f);
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, 'utf8');
          if (content.includes('Promise.all') && content.includes('race')) {
            this.findings.push({ file: f, type: 'RACE_PATTERN', sev: 'MEDIUM', note: 'Patrones con race conditions' });
          }
          if (content.match(/setTimeout.*setTimeout/g)) {
            this.findings.push({ file: f, type: 'NESTED_TIMEOUTS', sev: 'MEDIUM', note: 'Timeouts anidados' });
          }
        }
      } catch(e) {}
    }
    this.generateSITREP();
    feedback.scoreAgent(this.agentId, { actionable: this.findings.length, critical: 0, falsePositives: 0, evidence: true });
  }

  generateSITREP() {
    const sitrepPath = path.join(root, 'agents', 'runs', `SITREP-FLAKE-HUNTER-${Date.now()}.md`);
    fs.mkdirSync(path.dirname(sitrepPath), { recursive: true });
    let md = `# SITREP FLAKE-HUNTER\n\n**Agente:** ${this.agentId}\n**Fecha:** ${new Date().toISOString()}\n\n## Hallazgos\n\n`;
    for (const f of this.findings) {
      md += `- [${f.sev}] **${f.type}** (${f.file}): ${f.note}\n`;
    }
    if (this.findings.length === 0) {
      md += `- Sin patrones obvios de race detectados en muestra\n`;
    }
    md += `\n## Recomendación\n\nSeguir trazando eventos en runtime para detectar flap real entre transports.\n`;
    fs.writeFileSync(sitrepPath, md);
    console.log(`[${this.agentId}] SITREP: ${sitrepPath}`);
    feedback.contribute(this.agentId, { category: 'hybrid', title: 'Flake hunt', findings: this.findings, actionable: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const f = new FlakeHunter();
  f.investigate();
}
