#!/usr/bin/env node
/**
 * Base de errores conocidos — buscar, validar, regenerar MD, lookup por archivo/símbolo.
 *
 * Uso:
 *   node scripts/crozzo-known-issues.mjs search "carrito revierte"
 *   node scripts/crozzo-known-issues.mjs file app/core/CrozzoPosMain.js
 *   node scripts/crozzo-known-issues.mjs symbol crozzoReplaceCartsMaps
 *   node scripts/crozzo-known-issues.mjs validate
 *   node scripts/crozzo-known-issues.mjs refresh
 *   node scripts/crozzo-known-issues.mjs next-id
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const JSON_PATH = join(root, 'docs', 'maps', 'known-issues.json');
const MD_PATH = join(root, 'docs', 'maps', 'KNOWN-ISSUES.md');

const REQUIRED_ISSUE_KEYS = [
  'id',
  'status',
  'severity',
  'title',
  'symptoms',
  'rootCause',
  'solution',
  'avoid',
  'tags',
  'files',
  'symbols',
];

function loadDb() {
  if (!existsSync(JSON_PATH)) {
    console.error('[issues] Falta', JSON_PATH);
    process.exit(1);
  }
  return JSON.parse(readFileSync(JSON_PATH, 'utf8'));
}

function normPath(p) {
  return normalize(String(p || '')).replace(/\\/g, '/').replace(/^\.\//, '');
}

function validateDb(db) {
  const errors = [];
  if (!db.schemaVersion) errors.push('schemaVersion requerido');
  if (!Array.isArray(db.issues)) errors.push('issues debe ser array');
  const ids = new Set();
  for (const issue of db.issues || []) {
    for (const k of REQUIRED_ISSUE_KEYS) {
      if (!(k in issue)) errors.push(`${issue.id || '?'}: falta campo ${k}`);
    }
    if (ids.has(issue.id)) errors.push(`ID duplicado: ${issue.id}`);
    ids.add(issue.id);
    if (!/^KI-\d{3}$/.test(issue.id)) errors.push(`ID inválido: ${issue.id}`);
  }
  return errors;
}

function scoreIssue(issue, query) {
  const q = query.toLowerCase();
  let score = 0;
  const blob = [
    issue.id,
    issue.title,
    issue.rootCause,
    issue.solution,
    ...(issue.symptoms || []),
    ...(issue.avoid || []),
    ...(issue.tags || []),
    ...(issue.symbols || []),
    ...(issue.files || []),
  ]
    .join(' ')
    .toLowerCase();
  const terms = q.split(/\s+/).filter(Boolean);
  for (const t of terms) {
    if (blob.includes(t)) score += 2;
    if (issue.title.toLowerCase().includes(t)) score += 3;
    if ((issue.tags || []).some((tag) => tag.includes(t))) score += 2;
  }
  return score;
}

function printIssue(issue, compact) {
  if (compact) {
    console.log(`${issue.id} [${issue.severity}/${issue.status}] ${issue.title}`);
    console.log(`  → ${issue.solution.split('\n')[0].slice(0, 120)}`);
    return;
  }
  console.log(`\n### ${issue.id} — ${issue.title}`);
  console.log(`Estado: ${issue.status} · Severidad: ${issue.severity}`);
  if (issue.tags?.length) console.log('Tags:', issue.tags.join(', '));
  console.log('\nSíntomas:');
  issue.symptoms.forEach((s) => console.log('  -', s));
  console.log('\nCausa:', issue.rootCause);
  console.log('\nSolución:', issue.solution);
  if (issue.avoid?.length) {
    console.log('\nNO repetir:');
    issue.avoid.forEach((a) => console.log('  -', a));
  }
  if (issue.files?.length) console.log('\nArchivos:', issue.files.join(', '));
  if (issue.symbols?.length) console.log('Símbolos:', issue.symbols.join(', '));
  if (issue.relatedAdr) console.log('ADR:', issue.relatedAdr);
  if (issue.relatedTests?.length) console.log('Tests:', issue.relatedTests.join(', '));
  if (issue.learnedFrom) console.log('Aprendido de:', issue.learnedFrom);
}

function cmdSearch(query) {
  const db = loadDb();
  const ranked = db.issues
    .map((i) => ({ issue: i, score: scoreIssue(i, query) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!ranked.length) {
    console.log('[issues] Sin coincidencias para:', query);
    console.log('Tip: npm run issues:search -- cart | lan | css | stale');
    process.exit(0);
  }
  console.log(`\n=== Errores conocidos (${ranked.length} hits) ===\n`);
  ranked.slice(0, 8).forEach(({ issue }) => printIssue(issue, false));
  console.log('\nFuente completa: docs/maps/KNOWN-ISSUES.md · JSON: known-issues.json\n');
}

function matchFile(issue, fileRel) {
  const f = normPath(fileRel);
  return (issue.files || []).some((p) => {
    const pat = normPath(p);
    if (pat.endsWith('/')) return f.startsWith(pat);
    return f === pat || f.startsWith(pat.replace(/\.js$/, ''));
  });
}

function cmdFile(fileRel) {
  const db = loadDb();
  const hits = db.issues.filter((i) => matchFile(i, fileRel));
  console.log(`\n=== Issues relacionados: ${normPath(fileRel)} (${hits.length}) ===\n`);
  if (!hits.length) {
    console.log('(ninguno — revisar docs/maps/known-issues.json para agregar)');
    return;
  }
  hits.forEach((i) => printIssue(i, true));
  console.log('');
}

function cmdSymbol(symbol) {
  const db = loadDb();
  const sym = String(symbol || '').trim();
  const hits = db.issues.filter(
    (i) =>
      (i.symbols || []).includes(sym) ||
      (i.symbols || []).some((s) => sym.includes(s) || s.includes(sym))
  );
  console.log(`\n=== Issues relacionados: ${sym} (${hits.length}) ===\n`);
  hits.forEach((i) => printIssue(i, true));
  console.log('');
}

function cmdValidate() {
  const db = loadDb();
  const errors = validateDb(db);
  if (errors.length) {
    console.error('[issues] VALIDACIÓN FALLÓ:');
    errors.forEach((e) => console.error('  -', e));
    process.exit(1);
  }
  console.log(`[issues] OK — ${db.issues.length} entradas, schema v${db.schemaVersion}`);
}

function cmdNextId() {
  const db = loadDb();
  let max = 0;
  for (const i of db.issues) {
    const n = parseInt(String(i.id).replace('KI-', ''), 10);
    if (n > max) max = n;
  }
  const next = 'KI-' + String(max + 1).padStart(3, '0');
  console.log(next);
}

function renderMarkdown(db) {
  const now = new Date().toISOString();
  let md = '<!-- AUTO-GENERATED from known-issues.json — editar JSON, luego npm run issues:refresh -->\n\n';
  md += '# Errores conocidos y soluciones\n\n';
  md += `> **${db.issues.length} entradas** · actualizado ${now} · fuente canónica: [\`known-issues.json\`](known-issues.json)\n\n`;
  md += 'Consultar **antes** de parchear sync/LAN/CSS/APK. Buscar: `npm run issues:search -- "texto"`\n\n';
  md += '---\n\n## Índice rápido\n\n';
  md += '| ID | Severidad | Título | Tags |\n|----|-----------|--------|------|\n';
  for (const i of db.issues) {
    md += `| [${i.id}](#${i.id.toLowerCase()}) | ${i.severity} | ${i.title} | ${(i.tags || []).join(', ')} |\n`;
  }
  md += '\n---\n\n## Entradas\n\n';
  for (const i of db.issues) {
    md += `### ${i.id}\n\n`;
    md += `**${i.title}** · \`${i.status}\` · severidad **${i.severity}**\n\n`;
    md += '**Síntomas**\n\n';
    i.symptoms.forEach((s) => {
      md += `- ${s}\n`;
    });
    md += `\n**Causa raíz:** ${i.rootCause}\n\n`;
    md += `**Solución verificada:** ${i.solution}\n\n`;
    if (i.avoid?.length) {
      md += '**NO repetir**\n\n';
      i.avoid.forEach((a) => {
        md += `- ${a}\n`;
      });
      md += '\n';
    }
    const meta = [];
    if (i.files?.length) meta.push('Archivos: `' + i.files.join('`, `') + '`');
    if (i.symbols?.length) meta.push('Símbolos: `' + i.symbols.join('`, `') + '`');
    if (i.relatedAdr) meta.push('ADR: ' + i.relatedAdr);
    if (i.relatedTests?.length) meta.push('Tests: `' + i.relatedTests.join('`, `') + '`');
    if (i.fixedIn) meta.push('Corregido: ' + i.fixedIn);
    if (i.learnedFrom) meta.push('Aprendido de: ' + i.learnedFrom);
    if (meta.length) md += meta.join(' · ') + '\n\n';
    md += '---\n\n';
  }
  md += '## Agregar entrada nueva\n\n';
  md += '1. `npm run issues:next-id` → copiar plantilla en [`ISSUE-TEMPLATE.json`](ISSUE-TEMPLATE.json)\n';
  md += '2. Pegar en `known-issues.json` → `issues[]`\n';
  md += '3. `npm run issues:validate && npm run issues:refresh`\n';
  md += '4. Si es decisión permanente, también [`DECISIONS.md`](DECISIONS.md)\n';
  return md;
}

function cmdRefresh() {
  const db = loadDb();
  const errors = validateDb(db);
  if (errors.length) {
    console.error('[issues] refresh abortado — validación falló');
    errors.forEach((e) => console.error('  -', e));
    process.exit(1);
  }
  db.updatedAt = new Date().toISOString();
  writeFileSync(JSON_PATH, JSON.stringify(db, null, 2) + '\n', 'utf8');
  writeFileSync(MD_PATH, renderMarkdown(db), 'utf8');
  console.log('[issues:refresh] OK →', MD_PATH);
  console.log('  Entradas:', db.issues.length);
}

function findRelated(fileRel, symbol) {
  const db = loadDb();
  const f = normPath(fileRel);
  return db.issues.filter((i) => {
    if (symbol && (i.symbols || []).includes(symbol)) return true;
    if (matchFile(i, f)) return true;
    if (symbol && (i.symbols || []).some((s) => symbol.includes(s) || s.includes(symbol))) return true;
    return false;
  });
}

export { loadDb, findRelated, validateDb, JSON_PATH };

function runCli() {
  const cmd = process.argv[2];
  const arg = process.argv.slice(3).join(' ').trim();

  switch (cmd) {
    case 'search':
      if (!arg) {
        console.error('Uso: node scripts/crozzo-known-issues.mjs search "query"');
        process.exit(1);
      }
      cmdSearch(arg);
      break;
    case 'file':
      if (!arg) {
        console.error('Uso: node scripts/crozzo-known-issues.mjs file app/...');
        process.exit(1);
      }
      cmdFile(arg);
      break;
    case 'symbol':
      if (!arg) {
        console.error('Uso: node scripts/crozzo-known-issues.mjs symbol nombreFuncion');
        process.exit(1);
      }
      cmdSymbol(arg);
      break;
    case 'validate':
      cmdValidate();
      break;
    case 'refresh':
      cmdRefresh();
      break;
    case 'next-id':
      cmdNextId();
      break;
    default:
      console.log(`Crozzo known-issues — comandos:
  search "texto"     Buscar por síntoma/causa/tag
  file app/...       Issues del archivo
  symbol nombre      Issues del símbolo
  validate           Schema JSON
  refresh            Regenerar KNOWN-ISSUES.md
  next-id            Siguiente KI-NNN`);
      process.exit(cmd ? 1 : 0);
  }
}

const isDirectRun =
  process.argv[1] &&
  normalize(process.argv[1]).replace(/\\/g, '/').endsWith('scripts/crozzo-known-issues.mjs');

if (isDirectRun) runCli();
