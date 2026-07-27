#!/usr/bin/env node
/**
 * Cursor hook sessionStart — inyecta versión canónica y recordatorio anti-código viejo.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function readJson(rel) {
  try {
    return JSON.parse(readFileSync(join(root, rel), 'utf8'));
  } catch (_) {
    return null;
  }
}

function gitHeadShort() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: root, encoding: 'utf8' }).trim();
  } catch (_) {
    return '?';
  }
}

function gitBehindOrigin() {
  try {
    execSync('git fetch origin --quiet', { cwd: root, stdio: 'ignore', timeout: 15000 });
    const out = execSync('git rev-list --count HEAD..origin/main', { cwd: root, encoding: 'utf8' }).trim();
    return Number(out) || 0;
  } catch (_) {
    return -1;
  }
}

const latest = readJson('releases/latest.json');
const ver = latest && latest.semver ? latest.semver : '?';
const head = gitHeadShort();
const behind = gitBehindOrigin();

let ctx =
  'Crozzo POS — sesión agente. Fuente: app/ (NO src/ espejo). Versión OTA: v' +
  ver +
  '. HEAD: ' +
  head +
  '.';

if (behind > 0) {
  ctx += ' ALERTA: main está ' + behind + ' commits detrás de origin/main — hacer git pull antes de editar sync.';
} else if (behind === 0) {
  ctx += ' Git alineado con origin/main.';
}

ctx += ' Mapas: docs/maps/INDEX.md · Errores conocidos: docs/maps/KNOWN-ISSUES.md (npm run issues:search). Tras cambios sync: npm run test:sync-clinical.';
ctx +=
  ' Stack mente (3 MCP): synapse_memory + mcp-code-context + codebase-memory. Health: npm run mind:health. Flujo: cambio chico=Agent; sync/>1 critico=Plan mode; explorar=explore/grafo; PR grande=bugbot si se pide; best-of-n solo con OK (caro). Regla crozzo-pro-workflow.';
ctx +=
  ' Synapse: search al empezar tareas no triviales; remember tras fixes. PosMain: read_file_surgical/search_symbols (edit:scope antes de writes).';

process.stdout.write(JSON.stringify({ additional_context: ctx }));
process.exit(0);
