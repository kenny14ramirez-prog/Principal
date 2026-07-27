#!/usr/bin/env node
/**
 * Cursor hook afterFileEdit — si el agente editó app/, corre npm run sync.
 * stdin: JSON del hook (file_path | path | file).
 * fail-open: errores de sync no bloquean al agente.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const hookDir = dirname(fileURLToPath(import.meta.url));
const root = join(hookDir, '..', '..');
const STATE = join(root, '.cursor', 'session-state.json');
const SYNC_RE =
  /^app\/(core\/CrozzoPosMain|modules\/Crozzo(PosRuntimeCloud|ComandasCloudSync|OperativeSyncGate)|infra\/Crozzo(OpFanout|LanOpsSync|LanSyncBridge|PageCloudWatch|CloudSyncPriorities))\.js$/;

function readStdinSync() {
  try {
    const raw = readFileSync(0, 'utf8');
    if (!raw.trim()) return {};
    return JSON.parse(raw);
  } catch (_) {
    return {};
  }
}

function pickPath(payload) {
  return (
    payload.file_path ||
    payload.path ||
    payload.file ||
    payload.filePath ||
    (payload.input && (payload.input.path || payload.input.file_path)) ||
    ''
  );
}

function underApp(rel) {
  const n = normalize(String(rel || '')).replace(/\\/g, '/');
  return n.startsWith('app/') || n.startsWith('./app/');
}

const payload = readStdinSync();
const rel = pickPath(payload);

if (!underApp(rel)) {
  process.exit(0);
}

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = spawnSync(npmCmd, ['run', 'sync'], {
  cwd: root,
  stdio: 'pipe',
  encoding: 'utf8',
  timeout: 120000,
  shell: process.platform === 'win32',
});

if (run.status !== 0) {
  const err = (run.stderr || run.stdout || '').slice(0, 800);
  process.stderr.write('[crozzo-hook] npm run sync falló tras editar ' + rel + '\n' + err + '\n');
}

try {
  const n = normalize(String(rel || '')).replace(/\\/g, '/').replace(/^\.\//, '');
  mkdirSync(join(root, '.cursor'), { recursive: true });
  const prev = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : { files: [], editedApp: [] };
  const files = Array.isArray(prev.files) ? prev.files : [];
  const editedApp = Array.isArray(prev.editedApp) ? prev.editedApp : [];
  if (!editedApp.includes(n)) editedApp.push(n);
  let editedSync = !!prev.editedSync;
  if (SYNC_RE.test(n) || n === 'app/index.html') {
    if (!files.includes(n)) files.push(n);
    editedSync = true;
  }
  writeFileSync(
    STATE,
    JSON.stringify({
      editedSync,
      files,
      editedApp,
      at: new Date().toISOString(),
    }),
    'utf8'
  );
} catch (_) {}

process.exit(0);
