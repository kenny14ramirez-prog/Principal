#!/usr/bin/env node
// Benchmark de memoria híbrida (BM25+vector+recencia) — set de queries reales del POS.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const QUERIES = [
  'carrito revierte al cobrar',
  'fanout LAN-only early-return nube no recibe',
  'comandas parpadean purge',
  'mesas borradas sync',
  'LISTO cocina reaparece',
  'caja Limpiar Directa',
  'permiso bloqueado transporte',
  'locationId distinta dispositivos',
  'OCR factura recepcion FE',
  'contingencia fiscal 03 04',
  'retenciones B2B',
  'ticket QR',
  'semáforo margen',
  'rentabilidad page',
  'plan producto',
  'CMV rentabilidad',
  'reversion inventario',
  'perfiles barrio',
  'tipo documento fiscal',
  'impuestos saludables',
  'niveles madurez',
  'rampa madurez',
  'conectividad equilibrio',
  'LAN ops sync',
  'op fanout check',
  'sede combat',
  'legendary connectivity',
  'ops plane presence',
  'slot presence merge',
  'salon mesas sync',
  'mesa clear propaga',
  'mesa UI remote',
  'picker flicker',
  'white screen',
  'perf baseline',
  'responsive audit',
  'bottom gap',
  'kiosk comanda UI',
  'toggle CSS',
  'asset size',
  'boot hang',
  'smoke boot',
  'connectivity standby',
  'operative journal',
  'fleet coordination',
  'connectivity equilibrium',
  'legalidad fiscal',
  'tipo documento',
  'ticket QR diseño',
  'reporte IA',
  'diseñador ticket',
];

const results = [];
let totalMs = 0;
let withResults = 0;

for (const q of QUERIES) {
  const t0 = Date.now();
  let out = '';
  try {
    out = execSync(`node scripts/synapse-hybrid.mjs search "${q.replace(/"/g, '\\"')}" --limit=5 --json`, {
      cwd: root, encoding: 'utf8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (e) {
    out = e.stdout || '';
  }
  const ms = Date.now() - t0;
  totalMs += ms;
  let parsed = [];
  try { parsed = JSON.parse(out); } catch {}
  const n = Array.isArray(parsed) ? parsed.length : 0;
  if (n > 0) withResults++;
  results.push({ query: q, results: n, latencyMs: ms, topScore: parsed[0]?.score ?? 0 });
}

const coverage = (withResults / QUERIES.length * 100).toFixed(1);
const avgLatency = (totalMs / QUERIES.length).toFixed(1);

const report = `# Benchmark de memoria híbrida — Crozzo POS

> Generado: ${new Date().toISOString()}. Queries: ${QUERIES.length}. Fuente: scripts/benchmark-memory.mjs.

## Resumen
- **Queries:** ${QUERIES.length}
- **Con resultados (≥1):** ${withResults} (${coverage}%)
- **Latencia total:** ${totalMs} ms
- **Latencia promedio:** ${avgLatency} ms/query

## Resultados por query

| # | Query | Resultados | Top score | Latencia (ms) |
|---|---|---|---|---|
${results.map((r, i) => `| ${i + 1} | ${r.query} | ${r.results} | ${r.topScore.toFixed(4)} | ${r.latencyMs} |`).join('\n')}

## Notas
- Sin Ollama disponible, vector weight = 0 (solo BM25 + recencia).
- Con Ollama (nomic-embed-text), vector search activa y calidad mejora.
- Ground truth manual pendiente para precision/recall/MRR.
`;

const outPath = path.join(root, 'docs/maps/BENCHMARK-MEMORY.md');
fs.writeFileSync(outPath, report);
console.log(`Benchmark completado: ${QUERIES.length} queries, ${coverage}% cobertura, ${avgLatency} ms/query promedio.`);
console.log(`Reporte: ${outPath}`);
