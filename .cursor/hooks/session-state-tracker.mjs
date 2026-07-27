#!/usr/bin/env node
/**
 * Cursor stop — recordatorio si hubo edits en sync sin test reciente.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const STATE = join(root, '.cursor', 'session-state.json');
const TEST_STAMP = join(root, '.cursor', 'test-clinical.stamp');

const SYNC_RE =
  /^app\/(core\/CrozzoPosMain|modules\/Crozzo(PosRuntimeCloud|ComandasCloudSync|OperativeSyncGate)|infra\/Crozzo(OpFanout|LanOpsSync|LanSyncBridge|PageCloudWatch|CloudSyncPriorities))\.js$/;

function readStdinSync() {
  try {
    const raw = readFileSync(0, 'utf8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

function loadState() {
  try {
    return JSON.parse(readFileSync(STATE, 'utf8'));
  } catch (_) {
    return { editedSync: false, files: [] };
  }
}

function testRecent() {
  try {
    if (!existsSync(TEST_STAMP)) return false;
    const s = JSON.parse(readFileSync(TEST_STAMP, 'utf8'));
    return Number(s.expiresAt) > Date.now();
  } catch (_) {
    return false;
  }
}

const payload = readStdinSync();
const state = loadState();

if (state.editedSync && !testRecent()) {
  const msg =
    'Sesión editó archivos sync/LAN sin test reciente. Ejecuta: npm run test:sync-clinical';
  process.stdout.write(
    JSON.stringify({
      followup_message: msg,
    })
  );
}

try {
  mkdirSync(join(root, '.cursor'), { recursive: true });
  const prev = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
  writeFileSync(
    STATE,
    JSON.stringify({
      editedSync: false,
      files: [],
      editedApp: Array.isArray(prev.editedApp) ? prev.editedApp : [],
      at: new Date().toISOString(),
    }),
    'utf8'
  );
} catch (_) {}

process.exit(0);
