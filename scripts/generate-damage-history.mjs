#!/usr/bin/env node
// Regenera docs/maps/DAMAGE-HISTORY.md con datos actuales (KI, git, cargo check).
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const root = path.resolve(process.cwd());
const kiPath = path.join(root, 'docs/maps/known-issues.json');
const outPath = path.join(root, 'docs/maps/DAMAGE-HISTORY.md');

const ki = JSON.parse(fs.readFileSync(kiPath, 'utf8'));
const issues = ki.issues || [];
const total = issues.length;
const resolved = issues.filter(i => i.status === 'resolved').length;
const watch = issues.filter(i => i.status === 'watch').length;
const critical = issues.filter(i => i.severity === 'critical').length;
const high = issues.filter(i => i.severity === 'high').length;

let branch = 'unknown', head = 'unknown';
try { branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: root }).toString().trim(); } catch {}
try { head = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim(); } catch {}

const watchList = issues.filter(i => i.status === 'watch')
  .map(i => `| ${i.id} | ${i.severity} | ${i.title || i.description || ''} |`)
  .join('\n');

const content = `# DAMAGE-HISTORY — Historial de daño por release (Crozzo POS)

> Generado: ${new Date().toISOString()}. Fuente: known-issues.json + git + OPORD.
> Regenerar: \`node scripts/generate-damage-history.mjs\`

## Release actual (HEAD ${head}, rama ${branch})

### Known Issues (${total} total: ${resolved} resolved, ${watch} watch)

**Watch (activos):**
| ID | Sev. | Descripción |
|---|---|---|
${watchList}

**Resueltos:** ${resolved} issues cerrados.

### Severidad
- Critical: ${critical}
- High: ${high}
- Medium/Low: ${total - critical - high}

### Bloqueos vigentes
- Ver OPORD-MISION-CIEN-100.md §0.

### Flaky tests
- (pendiente de instrumentación — objetivo <5% failure rate)

### Violaciones de invariantes
- (pendiente de runtime monitor — objetivo 0 en producción)

### Tests clínicos
- \`test:sync-clinical\` — ver última ejecución.

### Notas
- Este archivo se regenera por release y por SITREP de auditoría (SQ-AUDITORIA).
- Fuentes: \`known-issues.json\`, \`OPORD-MISION-CIEN-100.md\`, \`sync-repair-progress.json\`, git.
`;

fs.writeFileSync(outPath, content);
console.log('DAMAGE-HISTORY.md regenerado:', outPath);
console.log(`  Issues: ${total} total, ${resolved} resolved, ${watch} watch`);
console.log(`  Branch: ${branch}, HEAD: ${head}`);
