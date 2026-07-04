#!/usr/bin/env node
/**
 * Alcance pre-edición — mapa de símbolo + referencias + contexto de líneas.
 * Uso: node scripts/crozzo-edit-scope.mjs <ruta-app> [símbolo]
 * Ejemplo: node scripts/crozzo-edit-scope.mjs app/core/CrozzoPosMain.js crozzoReplaceCartsMaps
 *
 * Escribe sello en .cursor/scope-stamps/ (válido 30 min) para el hook require-edit-scope.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { findRelated } from './crozzo-known-issues.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const STAMP_DIR = join(root, '.cursor', 'scope-stamps');
const STAMP_TTL_MS = 30 * 60 * 1000;
const CONTEXT_LINES = 35;

function usage() {
  console.error('Uso: node scripts/crozzo-edit-scope.mjs <ruta-app> [simbolo]');
  console.error('Ej:  node scripts/crozzo-edit-scope.mjs app/core/CrozzoPosMain.js crozzoReplaceCartsMaps');
  process.exit(1);
}

function normRel(p) {
  return normalize(String(p || '')).replace(/\\/g, '/').replace(/^\.\//, '');
}

function stampPath(rel) {
  const safe = rel.replace(/[^a-zA-Z0-9._-]+/g, '_');
  return join(STAMP_DIR, safe + '.json');
}

function findSymbolLine(lines, symbol) {
  if (!symbol) return 0;
  const patterns = [
    new RegExp('^function\\s+' + symbol + '\\s*\\('),
    new RegExp('^async\\s+function\\s+' + symbol + '\\s*\\('),
    new RegExp('^const\\s+' + symbol + '\\s*='),
    new RegExp('^let\\s+' + symbol + '\\s*='),
    new RegExp('^var\\s+' + symbol + '\\s*='),
    new RegExp('^window\\.' + symbol + '\\s*='),
  ];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (patterns.some((re) => re.test(line))) return i + 1;
  }
  const idx = lines.findIndex((l) => l.includes(symbol));
  return idx >= 0 ? idx + 1 : 0;
}

function sliceContext(lines, center1, before, after) {
  const i = Math.max(0, center1 - 1);
  const start = Math.max(0, i - before);
  const end = Math.min(lines.length, i + after + 1);
  const out = [];
  for (let n = start; n < end; n++) {
    out.push(String(n + 1).padStart(6) + ' | ' + lines[n]);
  }
  return out.join('\n');
}

function rgRefs(symbol, fileRel) {
  if (!symbol) return [];
  const args =
    process.platform === 'win32'
      ? ['rg', '-l', symbol, 'app', '--glob', '!**/bundles/**']
      : ['rg', '-l', symbol, 'app', '--glob', '!**/bundles/**'];
  const run = spawnSync(args[0], args.slice(1), { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' });
  const out = (run.stdout || '').trim().split(/\r?\n/).filter(Boolean);
  return out.filter((f) => normRel(f) !== fileRel).slice(0, 25);
}

const fileArg = process.argv[2];
if (!fileArg) usage();

const rel = normRel(fileArg);
const abs = join(root, rel);
if (!rel.startsWith('app/') || !existsSync(abs)) {
  console.error('[edit-scope] Archivo debe existir bajo app/: ' + rel);
  process.exit(1);
}

const symbol = process.argv[3] ? String(process.argv[3]).trim() : '';
const text = readFileSync(abs, 'utf8');
const lines = text.split(/\r?\n/);
const symLine = findSymbolLine(lines, symbol);

console.log('\n=== Crozzo edit-scope ===\n');
console.log('Archivo:', rel);
console.log('Lineas:', lines.length);
if (symbol) {
  console.log('Simbolo:', symbol);
  console.log('Definicion ~linea:', symLine || '(no encontrada — revisar grep manual)');
}

if (symLine > 0) {
  console.log('\n--- Contexto (' + CONTEXT_LINES + ' arriba/abajo) ---\n');
  console.log(sliceContext(lines, symLine, CONTEXT_LINES, CONTEXT_LINES));
} else if (symbol) {
  console.log('\n--- Primeras coincidencias de texto ---\n');
  let shown = 0;
  for (let i = 0; i < lines.length && shown < 8; i++) {
    if (lines[i].includes(symbol)) {
      console.log(String(i + 1).padStart(6) + ' | ' + lines[i]);
      shown++;
    }
  }
}

if (symbol) {
  const refs = rgRefs(symbol, rel);
  console.log('\n--- Referencias en app/ (max 25) ---\n');
  if (!refs.length) console.log('(ninguna fuera del archivo — verificar window.export)');
  else refs.forEach((f) => console.log('  ' + f));
}

try {
  const related = findRelated(rel, symbol || '');
  if (related.length) {
    console.log('\n--- Errores conocidos (NO repetir) ---\n');
    related.slice(0, 6).forEach((i) => {
      console.log('  ' + i.id + ' [' + i.severity + '] ' + i.title);
      console.log('    → ' + i.solution.split('\n')[0].slice(0, 100));
    });
    console.log('\n  Buscar más: npm run issues:search -- "' + (symbol || rel.split('/').pop()) + '"');
    console.log('  Ver: docs/maps/KNOWN-ISSUES.md');
  }
} catch (_) {}

mkdirSync(STAMP_DIR, { recursive: true });
const stamp = {
  file: rel,
  symbol: symbol || null,
  line: symLine || null,
  lineCount: lines.length,
  at: new Date().toISOString(),
  expiresAt: Date.now() + STAMP_TTL_MS,
};
writeFileSync(stampPath(rel), JSON.stringify(stamp, null, 2), 'utf8');

console.log('\n--- Sello OK ---');
console.log('Valido 30 min. Hook require-edit-scope permite editar', rel);
console.log('Antes de entregar: npm run sync && npm run test:sync-clinical (si sync/LAN)\n');
