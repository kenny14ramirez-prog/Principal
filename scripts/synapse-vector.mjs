#!/usr/bin/env node
// Synapse Vector — memoria de largo plazo con LanceDB + multi-scope + embeddings (Ollama).
// Complementa Synapse (SQLite/BM25). Uso: node scripts/synapse-vector.mjs status|remember|search|reindex -- ...
import { connect } from '@lancedb/lancedb';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = path.join(root, 'synapse', 'lancedb');
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const EMBED_MODEL = process.env.EMBED_MODEL || 'nomic-embed-text';

// --- Embeddings ---
const DIM = 768;
async function embed(text) {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`ollama ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data.embedding)) {
      const v = data.embedding;
      // pad/truncate to DIM
      if (v.length >= DIM) return v.slice(0, DIM);
      return v.concat(new Array(DIM - v.length).fill(0));
    }
    throw new Error('no embedding');
  } catch (e) {
    return hashEmbedding(text, DIM);
  }
}

function hashEmbedding(text, dim) {
  const v = new Array(dim).fill(0);
  for (let i = 0; i < text.length; i++) {
    v[i % dim] += text.charCodeAt(i) / 255;
  }
  // normalize
  const norm = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
  return v.map(x => x / norm);
}

// --- DB ---
async function getTable() {
  const db = await connect(dbPath);
  try {
    return await db.openTable('synapse_memory');
  } catch {
    return await db.createTable('synapse_memory', [
      { id: 'init', text: 'init', vector: await embed('init'), scope_user: '', scope_agent: '', scope_run: '', scope_app: '', scope_org: '', category: 'init', timestamp: new Date().toISOString(), valid_from: new Date().toISOString(), valid_to: '', source: '' },
    ]);
  }
}

function parseScope(args) {
  const scope = { user: '', agent: '', run: '', app: '', org: '' };
  for (const a of args) {
    const m = a.match(/^--(user|agent|run|app|org)=(.+)$/);
    if (m) scope[m[1]] = m[2];
  }
  return scope;
}

function buildWhere(scope) {
  const parts = [];
  if (scope.user) parts.push(`scope_user = '${scope.user.replace(/'/g, "''")}'`);
  if (scope.agent) parts.push(`scope_agent = '${scope.agent.replace(/'/g, "''")}'`);
  if (scope.run) parts.push(`scope_run = '${scope.run.replace(/'/g, "''")}'`);
  if (scope.app) parts.push(`scope_app = '${scope.app.replace(/'/g, "''")}'`);
  if (scope.org) parts.push(`scope_org = '${scope.org.replace(/'/g, "''")}'`);
  return parts.join(' AND ');
}

// --- Commands ---
const args = process.argv.slice(2);
const cmd = args[0] || 'status';

if (cmd === 'status') {
  const table = await getTable();
  const count = await table.countRows();
  console.log('Synapse Vector status:');
  console.log('  DB:', dbPath);
  console.log('  Table: synapse_memory');
  console.log('  Rows:', count);
  console.log('  Embed model:', EMBED_MODEL);
  console.log('  Ollama:', OLLAMA_URL);
  process.exit(0);
}

if (cmd === 'remember') {
  const text = args.slice(1).filter(a => !a.startsWith('--')).join(' ');
  if (!text) { console.error('Uso: remember "texto" [--user=...] [--agent=...] [--run=...] [--app=...] [--org=...] [--category=...] [--source=...]'); process.exit(1); }
  const scope = parseScope(args);
  const category = (args.find(a => a.startsWith('--category=')) || '').split('=')[1] || 'general';
  const source = (args.find(a => a.startsWith('--source=')) || '').split('=')[1] || '';
  const validFrom = (args.find(a => a.startsWith('--valid-from=')) || '').split('=')[1] || new Date().toISOString();
  const validTo = (args.find(a => a.startsWith('--valid-to=')) || '').split('=')[1] || '';
  const vector = await embed(text);
  const table = await getTable();
  const threshold = parseFloat((args.find(a => a.startsWith('--dedup-threshold=')) || '--dedup-threshold=0.92').split('=')[1]);
  // Dedup semántica: buscar memorias similares en el mismo scope
  let mergedId = null;
  try {
    const where = buildWhere(scope);
    let q = table.search(vector).limit(5);
    if (where) q = q.where(where);
    const hits = await q.toArray();
    for (const h of hits) {
      const sim = 1 - (h._distance || 0);
      if (sim >= threshold) { mergedId = h.id; break; }
    }
  } catch (e) { /* ignore */ }

  if (mergedId) {
    const mergedText = text; // reemplazar con nuevo (o concatenar si se prefiere)
    await table.update({ where: `id = '${mergedId.replace(/'/g, "''")}'`, values: { text: mergedText, vector, timestamp: new Date().toISOString(), valid_from: validFrom, valid_to: validTo, source } });
    console.log('Merged into existing:', mergedId, '| sim>=', threshold, '| scope:', JSON.stringify(scope));
  } else {
    const id = `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await table.add([{ id, text, vector, scope_user: scope.user, scope_agent: scope.agent, scope_run: scope.run, scope_app: scope.app, scope_org: scope.org, category, timestamp: new Date().toISOString(), valid_from: validFrom, valid_to: validTo, source }]);
    console.log('Remembered:', id, '| scope:', JSON.stringify(scope));
  }
  process.exit(0);
}

if (cmd === 'search') {
  const query = args.slice(1).filter(a => !a.startsWith('--')).join(' ');
  if (!query) { console.error('Uso: search "query" [--user=...] [--agent=...] [--run=...] [--app=...] [--org=...] [--limit=N]'); process.exit(1); }
  const scope = parseScope(args);
  const limit = parseInt((args.find(a => a.startsWith('--limit=')) || '--limit=5').split('=')[1], 10);
  const asOf = (args.find(a => a.startsWith('--as-of=')) || '').split('=')[1] || new Date().toISOString();
  const vector = await embed(query);
  const table = await getTable();
  let q = table.search(vector).limit(limit);
  const whereParts = [];
  const sw = buildWhere(scope);
  if (sw) whereParts.push(sw);
  // Validez temporal: memoria válida en asOf
  whereParts.push(`(valid_from = '' OR valid_from <= '${asOf.replace(/'/g, "''")}')`);
  whereParts.push(`(valid_to = '' OR valid_to >= '${asOf.replace(/'/g, "''")}')`);
  const where = whereParts.join(' AND ');
  if (where) q = q.where(where);
  const results = await q.toArray();
  console.log(`Search "${query}" (${results.length} results):`);
  for (const r of results) {
    console.log(`  [${r.id}] (dist=${r._distance?.toFixed(4)}) ${r.text}`);
    if (r.source) console.log(`      source: ${r.source}`);
    if (r.category) console.log(`      category: ${r.category}, ts: ${r.timestamp}, valid: ${r.valid_from || '?'} -> ${r.valid_to || 'inf'}`);
  }
  process.exit(0);
}

if (cmd === 'reindex') {
  // Re-generar embeddings para filas con vector vacío (fallback hash) — placeholder.
  const table = await getTable();
  const rows = await table.toArray();
  console.log(`Reindex: ${rows.length} filas. (Embeddings se generan en remember; reindex completo requiere fuente original.)`);
  process.exit(0);
}

console.error('Comando desconocido:', cmd);
console.error('Uso: status | remember "texto" | search "query" | reindex');
process.exit(1);
