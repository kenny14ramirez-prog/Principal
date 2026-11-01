#!/usr/bin/env node
// KI Auto-Capture — genera borradores de Known Issues desde fallos de tests (ejército).
// Uso: node scripts/ki-auto-capture.mjs <log-file>  (o stdin)
// Salida: docs/maps/ki-drafts/KI-DRAFT-<timestamp>.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const draftsDir = path.join(root, 'docs/maps/ki-drafts');
fs.mkdirSync(draftsDir, { recursive: true });

// Leer log
let log = '';
const arg = process.argv[2];
if (arg && fs.existsSync(arg)) {
  log = fs.readFileSync(arg, 'utf8');
} else {
  // stdin
  let d = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', c => d += c);
  process.stdin.on('end', () => { processLog(d); });
  process.stdin.resume();
  // exit after processing
  process.on('exit', () => {});
  // keep alive handled by end event
}

function processLog(log) {
  const lines = log.split(/\r?\n/);
  const failures = [];
  // Regex para rutas de archivo con línea: app/foo.js:123 o scripts/bar.mjs:45
  const fileRe = /(app|scripts|src|src-tauri)\/[A-Za-z0-9_\-\.\/]+\.(js|mjs|ts|rs)(:\d+)?/g;
  // Detectar bloques de fallo
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/FAIL|AssertionError|Error:|✗|×/.test(line) && !/PASS/.test(line)) {
      if (!current) current = { message: line.trim(), files: new Set(), lines: [] };
      current.lines.push(line);
      const matches = line.match(fileRe);
      if (matches) matches.forEach(m => current.files.add(m.split(':')[0]));
    } else if (current && line.trim() === '') {
      // fin de bloque
      if (current.files.size > 0 || current.message.length > 10) {
        failures.push(current);
      }
      current = null;
    } else if (current) {
      current.lines.push(line);
      const matches = line.match(fileRe);
      if (matches) matches.forEach(m => current.files.add(m.split(':')[0]));
    }
  }
  if (current && (current.files.size > 0 || current.message.length > 10)) failures.push(current);

  // Dedup por mensaje
  const seen = new Set();
  const unique = failures.filter(f => {
    const key = f.message.slice(0, 80);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (unique.length === 0) {
    console.log('No se detectaron fallos. Nada que capturar.');
    process.exit(0);
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const draft = {
    generatedAt: new Date().toISOString(),
    status: 'draft',
    source: arg || 'stdin',
    failures: unique.map((f, idx) => ({
      id: `KI-DRAFT-${ts}-${idx + 1}`,
      title: f.message.slice(0, 120),
      symptoms: [f.message, ...f.lines.slice(1, 4).map(l => l.trim()).filter(Boolean)],
      files: [...f.files],
      symbols: [],
      severity: 'medium',
      status: 'draft',
      avoid: '',
      solution: '',
      relatedTests: [],
      relatedAdr: [],
      learnedFrom: 'ki-auto-capture',
    })),
  };

  const outPath = path.join(draftsDir, `KI-DRAFT-${ts}.json`);
  fs.writeFileSync(outPath, JSON.stringify(draft, null, 2));
  console.log(`Capturados ${unique.length} fallo(s) → ${outPath}`);
  console.log('Revisar y promover con: npm run issues:file (o editar known-issues.json)');
  process.exit(0);
}

if (arg) {
  processLog(log);
}
