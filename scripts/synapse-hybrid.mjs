#!/usr/bin/env node
// Synapse Hybrid — búsqueda híbrida: BM25 (SQLite) + vector (LanceDB/SQLite embeddings) + recencia.
// Uso: node scripts/synapse-hybrid.mjs search "query" [--limit=N] [--scope agent=JS-SYNC] [--json]
import { DatabaseSync } from 'node:sqlite';
import { connect } from '@lancedb/lancedb';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = path.join(root, 'synapse', 'memory.db');
const lancePath = path.join(root, 'synapse', 'lancedb');
const DIM = 768;
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const EMBED_MODEL = process.env.EMBED_MODEL || 'nomic-embed-text';

async function embed(text) {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`ollama ${res.status}`);
    const data = await res.json();
    if (Array.isArray(data.embedding)) {
      const v = data.embedding;
      if (v.length >= DIM) return v.slice(0, DIM);
      return v.concat(new Array(DIM - v.length).fill(0));
    }
    throw new Error('no embedding');
  } catch {
    const v = new Array(DIM).fill(0);
    for (let i = 0; i < text.length; i++) v[i % DIM] += text.charCodeAt(i) / 255;
    const norm = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
    return v.map(x => x / norm);
  }
}

function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
  return dot / (Math.sqrt(na)*Math.sqrt(nb) || 1);
}

function bm25Score(text, terms) {
  const lower = (text || '').toLowerCase();
  let score = 0;
  for (const t of terms) {
    const re = new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const matches = lower.match(re);
    score += matches ? matches.length : 0;
  }
  return score;
}

function recencyBoost(ts) {
  if (!ts) return 0;
  const days = (Date.now() - new Date(ts).getTime()) / (1000*60*60*24);
  return Math.exp(-days / 30);
}

const args = process.argv.slice(2);
const cmd = args[0] || 'search';
const query = args.slice(1).filter(a => !a.startsWith('--')).join(' ');
const limit = parseInt((args.find(a => a.startsWith('--limit=')) || '--limit=10').split('=')[1], 10);
const jsonOut = args.includes('--json');

if (cmd !== 'search' || !query) {
  console.error('Uso: node scripts/synapse-hybrid.mjs search "query" [--limit=N] [--json]');
  process.exit(1);
}

const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
// Detectar Ollama
let ollamaOk = false;
try {
  const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2000) });
  ollamaOk = r.ok;
} catch {}
const vectorWeight = ollamaOk ? 0.45 : 0.0;
const bmWeight = ollamaOk ? 0.35 : 0.7;
const recWeight = ollamaOk ? 0.2 : 0.3;
const qVec = await embed(query);

// 1. Load from SQLite (Synapse)
const memories = [];
try {
  const db = new DatabaseSync(dbPath);
  const rows = db.prepare('SELECT id, path, title, content, updated_at, last_used_at, embedding FROM memory WHERE status IS NULL OR status != ?').all('deleted');
  for (const r of rows) {
    let vec = null;
    try { vec = JSON.parse(r.embedding); } catch {}
    const bm = bm25Score((r.title || '') + ' ' + (r.content || ''), terms);
    const vs = vec ? cosine(qVec, vec) : 0;
    const rb = recencyBoost(r.updated_at || r.last_used_at);
    const score = bmWeight * (bm / (bm + 1)) + vectorWeight * vs + recWeight * rb;
    memories.push({ id: r.id, path: r.path, title: r.title, content: (r.content || '').slice(0, 200), source: 'synapse-sqlite', score, bm, vs, rb, ts: r.updated_at });
  }
  db.close();
} catch (e) {
  console.error('SQLite load error:', e.message);
}

// 2. Load from LanceDB (synapse-vector)
try {
  const db = await connect(lancePath);
  const table = await db.openTable('synapse_memory');
  const rows = await table.toArray();
  for (const r of rows) {
    const bm = bm25Score(r.text || '', terms);
    let vs = 0;
    if (Array.isArray(r.vector)) vs = cosine(qVec, r.vector);
    const rb = recencyBoost(r.timestamp);
    const score = bmWeight * (bm / (bm + 1)) + vectorWeight * vs + recWeight * rb;
    memories.push({ id: r.id, path: r.scope_agent || '', title: r.text, content: (r.text || '').slice(0, 200), source: 'synapse-vector', score, bm, vs, rb, ts: r.timestamp });
  }
} catch (e) {
  // LanceDB may not exist yet — ignore.
}

// Dedup by id (keep highest score)
const byId = new Map();
for (const m of memories) {
  const existing = byId.get(m.id);
  if (!existing || m.score > existing.score) byId.set(m.id, m);
}
const results = [...byId.values()].sort((a, b) => b.score - a.score).slice(0, limit);

if (jsonOut) {
  console.log(JSON.stringify(results.map(r => ({ id: r.id, title: r.title, score: r.score, source: r.source, ts: r.ts })), null, 2));
} else {
  console.log(`Hybrid search "${query}" (${results.length} results):`);
  for (const r of results) {
    console.log(`  [${r.id}] score=${r.score.toFixed(4)} (bm=${r.bm}, vec=${r.vs.toFixed(3)}, rec=${r.rb.toFixed(3)}) [${r.source}]`);
    console.log(`      ${r.title}`);
    if (r.content) console.log(`      ${r.content.slice(0, 120)}...`);
  }
}
