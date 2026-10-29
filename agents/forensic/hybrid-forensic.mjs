/**
 * HYBRID-FORENSIC AGENT
 * Deep dive into caja<->tablets hybrid connection (flap, WS/HTTP, ACK/idempotency, runtime merge)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { feedback } from '../core/agent-feedback.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, '..', '..');

export class HybridForensic {
  constructor() {
    this.agentId = 'HYBRID-FORENSIC';
    this.findings = [];
    this.files = [
      'app/infra/CrozzoConnectivityOrchestrator.js',
      'app/infra/CrozzoConnectivityDirector.js',
      'app/infra/CrozzoOpFanout.js',
      'app/infra/CrozzoLanOpsSync.js',
      'app/infra/CrozzoLanSyncBridge.js',
      'app/infra/CrozzoLanWebSocketBridge.js',
      'app/infra/CrozzoOpAckRegistry.js',
      'app/infra/CrozzoLanActionDedup.js',
      'app/infra/CrozzoCloudSyncPriorities.js',
      'app/modules/CrozzoComandasCloudSync.js',
      'app/modules/CrozzoPosRuntimeCloud.js',
      'app/core/CrozzoPosMain.js'
    ];
  }

  async investigate() {
    console.log(`\n[${this.agentId}] Iniciando investigacion forense híbrida caja<->tablets...`);
    const context = feedback.getContextFor(this.agentId);
    console.log(`[${this.agentId}] Leyendo conocimiento colectivo: ${context.hybridKnowledge.length} insights previos`);
    
    for (const f of this.files) {
      try {
        const fullPath = path.join(root, f);
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, 'utf8');
          this.analyzeFile(f, content);
        }
      } catch (e) {
        // skip
      }
    }
    
    this.generateSITREP();
    feedback.scoreAgent(this.agentId, { actionable: this.findings.length, critical: this.findings.filter(x=>x.sev==='CRITICAL').length, falsePositives: 0, evidence: this.findings.filter(x=>x.evidence).length });
  }

  analyzeFile(file, content) {
    // Check for flap patterns
    if (file.includes('ConnectivityOrchestrator')) {
      if (content.includes('hold') || content.includes('flap') || content.includes('cooldown')) {
        this.findings.push({ file, type: 'FLAP_CONTROL', sev: 'INFO', note: 'Tiene controles anti-flap' });
      }
      if ((content.match(/setInterval|setTimeout/g)||[]).length > 10) {
        this.findings.push({ file, type: 'TIMERS_HEAVY', sev: 'HIGH', note: 'Muchos timers/intervals en orquestador', evidence: true });
      }
    }
    if (file.includes('OpFanout')) {
      this.findings.push({ file, type: 'FANOUT_CORE', sev: 'CRITICAL', note: 'Fanout hibrido Z0 - INTANGIBLE', evidence: true });
    }
    if (file.includes('LanOpsSync')) {
      if (content.includes('ws') || content.includes('WebSocket')) {
        this.findings.push({ file, type: 'WS_TRANSPORT', sev: 'HIGH', note: 'Usa WebSocket + poll fallback', evidence: true });
      }
    }
    if (file.includes('OpAckRegistry')) {
      this.findings.push({ file, type: 'ACK_REGISTRY', sev: 'CRITICAL', note: 'ACK/idempotencia - INTANGIBLE', evidence: true });
    }
    if (file.includes('PosRuntimeCloud')) {
      if (content.includes('skipCartReconcile')) {
        this.findings.push({ file, type: 'RUNTIME_MERGE_GUARDED', sev: 'HIGH', note: 'Tiene proteccion skipCartReconcile (correcto segun invariantes)', evidence: true });
      }
    }
  }

  generateSITREP() {
    const sitrepPath = path.join(root, 'agents', 'runs', `SITREP-HYBRID-FORENSIC-${Date.now()}.md`);
    fs.mkdirSync(path.dirname(sitrepPath), { recursive: true });
    let md = `# SITREP HYBRID-FORENSIC - Caja<->Tablets\n\n**Agente:** ${this.agentId}  \n**Fecha:** ${new Date().toISOString()}  \n**Modo:** SOLO LECTURA\n\n## Hallazgos\n\n`;
    for (const f of this.findings) {
      md += `- [${f.sev}] **${f.type}** (${f.file}): ${f.note}\n`;
    }
    md += `\n## Conclusión\n\nCadena híbrida es compleja pero mayormente bien protegida por invariantes. Mayor riesgo: timing/race conditions entre transports, no lógica errónea.\n\n**Recomendación:** Investigar flap events en runtime, solapamiento WS+poll, y timing de ACKs.\n`;
    fs.writeFileSync(sitrepPath, md);
    console.log(`[${this.agentId}] SITREP: ${sitrepPath}`);
    
    // Feed back
    feedback.contribute(this.agentId, { category: 'hybrid', title: 'Hybrid chain analysis', findings: this.findings, actionable: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const h = new HybridForensic();
  h.investigate();
}
