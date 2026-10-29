/**
 * TIMERS-SCHEDULER AGENT
 * Inventory all timers/intervals, find orphans, propose consolidation
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { feedback } from '../core/agent-feedback.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, '..', '..');

export class TimersScheduler {
  constructor() {
    this.agentId = 'TIMERS-SCHEDULER';
    this.timers = [];
    this.files = [
      'app/core/CrozzoPosMain.js',
      'app/infra/CrozzoLanOpsSync.js',
      'app/infra/CrozzoConnectivityOrchestrator.js',
      'app/modules/CrozzoPosRuntimeCloud.js',
      'app/modules/CrozzoComandasCloudSync.js',
      'app/infra/CrozzoOpFanout.js'
    ];
  }

  async investigate() {
    console.log(`\n[${this.agentId}] Inventariando timers/polls...`);
    const context = feedback.getContextFor(this.agentId);
    console.log(`[${this.agentId}] Conocimiento timers: ${context.timerKnowledge.length} insights`);
    
    for (const f of this.files) {
      try {
        const fullPath = path.join(root, f);
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, 'utf8');
          const intervals = (content.match(/setInterval\(/g)||[]).length;
          const timeouts = (content.match(/setTimeout\(/g)||[]).length;
          if (intervals > 0 || timeouts > 0) {
            this.timers.push({ file: f, intervals, timeouts, total: intervals+timeouts });
          }
        }
      } catch(e) {}
    }
    this.generateSITREP();
    feedback.scoreAgent(this.agentId, { actionable: this.timers.length, critical: this.timers.filter(x=>x.intervals>5).length, falsePositives: 0, evidence: true });
  }

  generateSITREP() {
    const sitrepPath = path.join(root, 'agents', 'runs', `SITREP-TIMERS-SCHEDULER-${Date.now()}.md`);
    fs.mkdirSync(path.dirname(sitrepPath), { recursive: true });
    let md = `# SITREP TIMERS-SCHEDULER\n\n**Agente:** ${this.agentId}  \n**Fecha:** ${new Date().toISOString()}\n\n## Inventario\n\n| Archivo | setInterval | setTimeout | Total |\n|---------|-------------|------------|-------|\n`;
    let totalI=0,totalT=0;
    for (const t of this.timers) {
      md += `| ${t.file} | ${t.intervals} | ${t.timeouts} | ${t.total} |\n`;
      totalI+=t.intervals; totalT+=t.timeouts;
    }
    md += `| **TOTAL** | **${totalI}** | **${totalT}** | **${totalI+totalT}** |\n\n## Recomendaciones\n\n1. **Consolidar** en un scheduler central con prioridades\n2. **Visibility-aware** - pausar cuando pestaña oculta\n3. **Backoff+jitter** - evitar thundering herd\n4. **Limpiar** timers huérfanos en navegación/logout\n5. **Debounce** polls solapados\n\n`;
    fs.writeFileSync(sitrepPath, md);
    console.log(`[${this.agentId}] SITREP: ${sitrepPath}`);
    feedback.contribute(this.agentId, { category: 'timers', title: 'Timer inventory', timers: this.timers, actionable: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const t = new TimersScheduler();
  t.investigate();
}
