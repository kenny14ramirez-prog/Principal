#!/usr/bin/env node
/**
 * Genera releases/latest.json y acumula releases/registry.json.
 * Cada publicación tiene id único: {semver}-{critical|optional}
 * (misma versión 1.0.13 puede tener crítica y opcional a la vez).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  changelog: message
    .replace(/^[\p{Extended_Pictographic}\uFE0F\u200D]+\s*/u, '')
    .split(/\s*\+\s*|\s*;\s*|\n+/)
    .map((s) => s.trim())
    .filter(Boolean),
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
registry.updatedAt = publishedAt;

const latest = {
  ...entry,
  updatedAt: registry.updatedAt,
  entries: registry.entries,
};

writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
writeFileSync(join(outDir, 'latest.json'), `${JSON.stringify(latest, null, 2)}\n`, 'utf8');

console.log(`OK: ${registryPath} (${registry.entries.length} entradas)`);
console.log(`OK: ${join(outDir, 'latest.json')}`);
console.log(JSON.stringify(entry, null, 2));
