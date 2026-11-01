#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[1], '../..');
const latestPath = path.join(root, 'releases/latest.json');
const data = JSON.parse(fs.readFileSync(latestPath, 'utf8'));

const newSemver = '1.0.256';
const newId = `${newSemver}-critical`;
const now = new Date().toISOString();
const changelog = [
  'Fase 2: backend Rust modernizado (Axum, persistencia SQLite, HLC, seguridad TLS, observabilidad)',
  'Fase 1: diseño RLS multi-tenant (inventario + draft SQL + tests pgTAP)',
  'Ejército: conectividad del arsenal (doctrina, registry, escuadrones, alto mando)',
  'Synapse Vector: LanceDB + multi-scope + hybrid search + validez temporal + dedup',
  'Herramientas: Starlight docs (80 pages), Vale config, benchmarks (51 queries)',
  'Calidad: clippy limpio (-D warnings PASS), sync sin warnings',
  'Disco: cargo clean (35.4 GB liberados)',
];

const newEntry = {
  id: newId,
  version: `v${newSemver}`,
  semver: newSemver,
  type: 'critical',
  message: 'Actualización mayor: Fase 2 backend + ejército conectado + RLS diseño + clippy limpio',
  publishedAt: now,
  installMode: 'auto',
  changelog,
  sha256: null,
};

// Update top-level
data.id = newId;
data.version = `v${newSemver}`;
data.semver = newSemver;
data.message = newEntry.message;
data.publishedAt = now;
data.updatedAt = now;
data.changelog = changelog;

// Prepend entry
data.entries.unshift(newEntry);

fs.writeFileSync(latestPath, JSON.stringify(data, null, 2));
console.log('Bumped to', newSemver);
console.log('Entries:', data.entries.length);
