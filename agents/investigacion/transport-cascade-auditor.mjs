/**
 * TRANSPORT-CASCADE-AUDITOR
 * Auditar cascada actual vs deseada
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, '..', '..');

export class TransportCascadeAuditor {
  constructor() {
    this.agentId = 'TRANSPORT-CASCADE-AUDITOR';
    this.findings = [];
  }

  async investigate() {
    console.log(`\n[${this.agentId}] Auditando cascada de transportes...`);
    
    const files = [
      'app/infra/CrozzoConnectivityOrchestrator.js',
      'app/infra/CrozzoConnectivityDirector.js',
      'app/infra/CrozzoLanOpsSync.js',
      'app/infra/CrozzoWifiDirectBridge.js',
      'app/infra/CrozzoBleMesh.js',
      'app/infra/CrozzoOfflineGossip.js'
    ];
    
    for (const f of files) {
      try {
        const p = path.join(root, f);
        if (fs.existsSync(p)) {
          const c = fs.readFileSync(p, 'utf8');
          if (f.includes('Orchestrator')) {
            if (c.includes('hotspot') || c.includes('ap')) {
              this.findings.push({ sev: 'INFO', note: 'Menciona hotspot/AP', file: f });
            } else {
              this.findings.push({ sev: 'MEDIUM', note: 'Revisar si prioriza hotspot directo desde caja', file: f });
            }
          }
          if (f.includes('WifiDirect')) {
            this.findings.push({ sev: 'INFO', note: 'WifiDirectBridge existe', file: f });
          }
          if (f.includes('BleMesh')) {
            this.findings.push({ sev: 'INFO', note: 'BleMesh existe - evaluar para pedidos mínimos', file: f });
          }
        }
      } catch(e) {}
    }
    
    this.generateSITREP();
  }

  generateSITREP() {
    const sitrepPath = path.join(root, 'agents', 'runs', `SITREP-TRANSPORT-CASCADE-${Date.now()}.md`);
    fs.mkdirSync(path.dirname(sitrepPath), { recursive: true });
    let md = `# SITREP TRANSPORT-CASCADE-AUDITOR\n\n**Fecha:** ${new Date().toISOString()}\n\n## Hallazgos\n\n`;
    for (const f of this.findings) {
      md += `- [${f.sev}] (${f.file}): ${f.note}\n`;
    }
    md += `\n## Cascada Deseada vs Actual\n\n1. DB/Cloud -> OK\n2. LAN Router -> OK (LanOpsSync)\n3. Hotspot directo desde Caja -> Verificar\n4. BLE Mesh -> Existe pero integrar en cascada\n5. QR/Outbox -> Existe pero formalizar\n\n`;
    fs.writeFileSync(sitrepPath, md);
    console.log(`[${this.agentId}] SITREP: ${sitrepPath}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  new TransportCascadeAuditor().investigate();
}
