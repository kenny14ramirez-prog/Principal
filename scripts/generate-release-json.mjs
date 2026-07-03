#!/usr/bin/env node
/**
 * Genera releases/latest.json y acumula releases/registry.json.
 * Cada publicación tiene id único: {semver}-{critical|optional}
 * (misma versión 1.0.13 puede tener crítica y opcional a la vez).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseChangelogMessage } from './lib/changelog-parse.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const versionArg = process.argv[2];
const message = process.argv[3];
const typeArg = (process.argv[4] || 'optional').toLowerCase();

if (!versionArg || !message) {
  console.error(
    'Uso: node scripts/generate-release-json.mjs <version> "<mensaje>" [critical|optional]'
  );
  process.exit(1);
}

const semver = String(versionArg).replace(/^v/i, '');
if (!/^\d+\.\d+\.\d+(-[\w.-]+)?$/.test(semver)) {
  console.error(`Versión inválida: ${versionArg} (use semver, ej. 1.0.8)`);
  process.exit(1);
}

const type =
  typeArg === 'critical' || typeArg === 'critica' || typeArg === 'crítica'
    ? 'critical'
    : 'optional';

const id = `${semver}-${type}`;
const publishedAt = new Date().toISOString();

const entry = {
  id,
  version: `v${semver}`,
  semver,
  type,
  message,
  publishedAt,
  installMode: type === 'critical' ? 'auto' : 'prompt',
  changelog: parseChangelogMessage(message),
};

const outDir = join(root, 'releases');
mkdirSync(outDir, { recursive: true });

const registryPath = join(outDir, 'registry.json');
let registry = { updatedAt: publishedAt, entries: [] };

if (existsSync(registryPath)) {
  try {
    const prev = JSON.parse(readFileSync(registryPath, 'utf8'));
    if (Array.isArray(prev.entries)) registry.entries = prev.entries.slice();
  } catch (e) {
    console.warn('[generate] registry.json ilegible, se recrea:', e.message);
  }
} else if (existsSync(join(outDir, 'latest.json'))) {
  try {
    const legacy = JSON.parse(readFileSync(join(outDir, 'latest.json'), 'utf8'));
    if (legacy.version || legacy.semver) {
      const legType =
        legacy.type === 'critical' || legacy.installMode === 'auto' ? 'critical' : 'optional';
      const legSemver = legacy.semver || String(legacy.version || '').replace(/^v/i, '');
      registry.entries.push({
        id: legacy.id || `${legSemver}-${legType}`,
        version: legacy.version || `v${legSemver}`,
        semver: legSemver,
        type: legType,
        message: legacy.message || '',
        publishedAt: legacy.publishedAt || publishedAt,
        installMode: legacy.installMode || (legType === 'critical' ? 'auto' : 'prompt'),
        changelog: Array.isArray(legacy.changelog) ? legacy.changelog : [],
      });
    }
  } catch (_) {}
}

registry.entries = registry.entries.filter((e) => e && e.id !== id);
registry.entries.push(entry);
registry.entries.sort((a, b) => {
  const pa = (a.semver || '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = (b.semver || '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  const ca = a.type === 'critical' ? 0 : 1;
  const cb = b.type === 'critical' ? 0 : 1;
  if (ca !== cb) return ca - cb;
  return String(a.publishedAt || '').localeCompare(String(b.publishedAt || ''));
});
// Mantener solo el historial reciente para que cada cliente no descargue una
// lista enorme cada 15 min (el orden es ascendente, así que conservamos la cola).
const MAX_REGISTRY_ENTRIES = 25;
if (registry.entries.length > MAX_REGISTRY_ENTRIES) {
  registry.entries = registry.entries.slice(-MAX_REGISTRY_ENTRIES);
}
registry.updatedAt = publishedAt;

const latest = {
  ...entry,
  updatedAt: registry.updatedAt,
  entries: registry.entries,
};

function writeJsonAtomic(filePath, data) {
  const body = `${JSON.stringify(data, null, 2)}\n`;
  const tmp = `${filePath}.${process.pid}.tmp`;
  writeFileSync(tmp, body, 'utf8');
  try {
    if (existsSync(filePath)) unlinkSync(filePath);
    renameSync(tmp, filePath);
  } catch (e) {
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch (_) {}
    throw e;
  }
}

writeJsonAtomic(registryPath, registry);
writeJsonAtomic(join(outDir, 'latest.json'), latest);

console.log(`OK: ${registryPath} (${registry.entries.length} entradas)`);
console.log(`OK: ${join(outDir, 'latest.json')}`);
console.log(JSON.stringify(entry, null, 2));
