/**
 * FLEET-SCALE-AUDITOR
 * Simular 100 dispositivos - contención, cuellos de botella
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, '..', '..');

export class FleetScaleAuditor {
  constructor() {
    this.agentId = 'FLEET-SCALE-AUDITOR';
    this.findings = [];
  }

  async investigate() {
    console.log(`\n[${this.agentId}] Simulando escalado a 100 dispositivos...`);
    
    const files = [
      'app/infra/CrozzoLanOpsSync.js',
      'app/infra/CrozzoLanSyncBridge.js',
      'app/infra/CrozzoOpFanout.js',
      'app/infra/CrozzoOpAckRegistry.js',
      'src-tauri/src/crozzo_lan_sync_server.rs'
    ];
    
    for (const f of files) {
      try {
        const p = path.join(root, f);
        if (fs.existsSync(p)) {
          const c = fs.readFileSync(p, 'utf8');
          if (f.includes('OpFanout')) {
            this.findings.push({ cat: 'FANOUT', sev: 'HIGH', note: 'Revisar broadcast a todos los peers vs room-based', file: f });
          }
          if (f.includes('LanOpsSync')) {
            if ((c.match(/setInterval/g)||[]).length > 5) {
              this.findings.push({ cat: 'POLLS', sev: 'HIGH', note: 'Múltiples polls - con 100 devices puede saturar', file: f });
            }
          }
          if (f.includes('OpAckRegistry')) {
            this.findings.push({ cat: 'ACK', sev: 'MEDIUM', note: 'Ver limpieza de ACKs antiguos', file: f });
          }
        }
      } catch(e) {}
    }
    
    this.generateSITREP();
  }

  generateSITREP() {
    const sitrepPath = path.join(root, 'agents', 'runs', `SITREP-FLEET-SCALE-${Date.now()}.md`);
    fs.mkdirSync(path.dirname(sitrepPath), { recursive: true });
    let md = `# SITREP FLEET-SCALE-AUDITOR - 100 DISPOSITIVOS\n\n**Fecha:** ${new Date().toISOString()}\n\n## Hallazgos\n\n`;
    for (const f of this.findings) {
      md += `- [${f.sev}] **${f.cat}** (${f.file}): ${f.note}\n`;
    }
    md += `\n## Recomendaciones\n\n1. **Room-based subscriptions** - Solo enviar a interesados\n2. **Delta sync** - No enviar snapshot completo\n3. **Fanout selectivo** - Evitar broadcast masivo\n4. **Throttle/Backpressure** - Por dispositivo\n5. **Conexión límite + queue** - En Rust server\n\n`;
    fs.writeFileSync(sitrepPath, md);
    console.log(`[${this.agentId}] SITREP: ${sitrepPath}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  new FleetScaleAuditor().investigate();
}
