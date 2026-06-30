/**
 * Reservorio seguro — Comunicación v2 (mesas, comandas, sync nube/LAN).
 * Uso:
 *   node scripts/reservorio-comunicacion-v2.mjs guardar
 *   node scripts/reservorio-comunicacion-v2.mjs verificar
 *   node scripts/reservorio-comunicacion-v2.mjs restaurar
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const VAULT = path.join(ROOT, 'reservorio', 'comunicacion-v2');
const MANIFEST_PATH = path.join(VAULT, 'MANIFEST.json');

/** Archivos que forman el stack de comunicación v2 (rutas relativas al repo). */
export const COMUNICACION_V2_FILES = [
  'app/modules/CrozzoComandasCloudSync.js',
  'app/modules/CrozzoPosRuntimeCloud.js',
  'app/modules/CrozzoCloudOpsPulse.js',
  'app/modules/CrozzoComunicacionDiag.js',
  'app/modules/CrozzoComandaArchive.js',
  'app/modules/CrozzoOperativeSyncGate.js',
  'app/modules/CrozzoSuperAdminSyncPriorities.js',
  'app/infra/CrozzoPageCloudWatch.js',
  'app/infra/CrozzoCloudSyncPriorities.js',
  'app/infra/CrozzoConnectivityOrchestrator.js',
  'app/infra/CrozzoReconnectSync.js',
  'app/infra/CrozzoOfflineGossip.js',
  'app/infra/CrozzoLanWebSocketBridge.js',
  'app/infra/CrozzoLanSyncBridge.js',
  'app/infra/CrozzoLanOpsSync.js',
  'app/infra/CrozzoLanActionDedup.js',
  'app/infra/CrozzoSyncQueueHygiene.js',
  'app/infra/CrozzoWifiZoneBridge.js',
  'app/core/CrozzoPosCloud.js',
  'app/core/CrozzoPosMain.js',
  'app/core/CrozzoStorageHygiene.js',
  'scripts/_mesa-sync-repro.mjs',
  'scripts/_comandar-cobro-flow.mjs',
  'scripts/_mutaciones-sync.mjs',
  'scripts/_mesa-clear-propaga.mjs',
  'scripts/_sede-merge-write.mjs',
  'scripts/_comanda-outbox-repro.mjs',
  'scripts/_ops-pulse-repro.mjs',
  'scripts/_reconcile-stale-comandas.mjs',
  'scripts/_salon-mesas-sync.mjs',
  'scripts/_comanda-cart-reconcile.mjs',
  'scripts/_diag-comunicacion-smoke.mjs',
  'scripts/_connectivity-orchestrator-check.mjs',
  'scripts/_lan-ops-sync-check.mjs',
];

function sha256File(abs) {
  const buf = fs.readFileSync(abs);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function readPkgVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    return String(pkg.version || '');
  } catch (_) {
    return '';
  }
}

function ensureDirFor(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function vaultPath(rel) {
  return path.join(VAULT, rel);
}

function guardar() {
  const savedAt = new Date().toISOString();
  const entries = [];
  let copied = 0;
  let missing = 0;

  for (const rel of COMUNICACION_V2_FILES) {
    const src = path.join(ROOT, rel);
    const dst = vaultPath(rel);
    if (!fs.existsSync(src)) {
      missing++;
      entries.push({ path: rel, missing: true });
      continue;
    }
    ensureDirFor(dst);
    fs.copyFileSync(src, dst);
    const hash = sha256File(src);
    const stat = fs.statSync(src);
    entries.push({ path: rel, sha256: hash, bytes: stat.size });
    copied++;
  }

  const manifest = {
    label: 'comunicacion-v2',
    savedAt,
    appVersion: readPkgVersion(),
    note: 'Punto seguro del stack sync mesas/comandas/nube/LAN. Restaurar solo si el código activo se dañó.',
    files: entries,
    fileCount: copied,
    missingCount: missing,
  };
  fs.mkdirSync(VAULT, { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
  console.log('[reservorio/comunicacion-v2] guardado:', copied, 'archivos ·', savedAt);
  if (missing) console.warn('[reservorio/comunicacion-v2] ausentes en app/:', missing);
  return manifest;
}

function loadManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  } catch (_) {
    return null;
  }
}

function verificar() {
  const manifest = loadManifest();
  if (!manifest) {
    console.error('Sin MANIFEST.json — ejecute: node scripts/reservorio-comunicacion-v2.mjs guardar');
    process.exit(1);
  }
  let ok = 0;
  let drift = 0;
  let vaultMissing = 0;
  for (const e of manifest.files || []) {
    if (e.missing) {
      vaultMissing++;
      continue;
    }
    const rel = e.path;
    const live = path.join(ROOT, rel);
    const vault = vaultPath(rel);
    if (!fs.existsSync(vault)) {
      console.log('FALTA en reservorio:', rel);
      vaultMissing++;
      continue;
    }
    if (!fs.existsSync(live)) {
      console.log('FALTA en app/:', rel);
      drift++;
      continue;
    }
    const liveHash = sha256File(live);
    const vaultHash = sha256File(vault);
    if (liveHash === vaultHash) ok++;
    else {
      console.log('DRIFT:', rel);
      drift++;
    }
  }
  console.log('---');
  console.log('Reservorio:', manifest.savedAt, '· app', manifest.appVersion || '?');
  console.log('Iguales:', ok, '· Diferentes/ausentes:', drift + vaultMissing);
  process.exit(drift + vaultMissing > 0 ? 2 : 0);
}

function restaurar() {
  const manifest = loadManifest();
  if (!manifest) {
    console.error('Sin MANIFEST.json en reservorio/comunicacion-v2');
    process.exit(1);
  }
  let n = 0;
  for (const e of manifest.files || []) {
    if (e.missing) continue;
    const rel = e.path;
    const src = vaultPath(rel);
    const dst = path.join(ROOT, rel);
    if (!fs.existsSync(src)) continue;
    ensureDirFor(dst);
    fs.copyFileSync(src, dst);
    console.log('  restaurado:', rel);
    n++;
  }
  console.log('[reservorio/comunicacion-v2] restaurados:', n, '→ ejecute npm run sync');
  return n;
}

const cmd = process.argv[2] || 'guardar';
if (cmd === 'guardar' || cmd === 'save') guardar();
else if (cmd === 'verificar' || cmd === 'verify') verificar();
else if (cmd === 'restaurar' || cmd === 'restore') restaurar();
else {
  console.log('Uso: node scripts/reservorio-comunicacion-v2.mjs guardar|verificar|restaurar');
  process.exit(1);
}
