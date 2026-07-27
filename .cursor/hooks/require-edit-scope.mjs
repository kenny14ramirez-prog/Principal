#!/usr/bin/env node
/**
 * Cursor preToolUse — exige npm run edit:scope reciente antes de editar archivos críticos.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const STAMP_DIR = join(root, '.cursor', 'scope-stamps');

const CRITICAL = [
  /^app\/core\/CrozzoPosMain\.js$/,
  /^app\/modules\/CrozzoPosRuntimeCloud\.js$/,
  /^app\/modules\/CrozzoComandasCloudSync\.js$/,
  /^app\/modules\/CrozzoOperativeSyncGate\.js$/,
  /^app\/infra\/CrozzoOpFanout\.js$/,
  /^app\/infra\/CrozzoLanOpsSync\.js$/,
  /^app\/infra\/CrozzoLanSyncBridge\.js$/,
  /^app\/infra\/CrozzoPageCloudWatch\.js$/,
  /^app\/infra\/CrozzoCloudSyncPriorities\.js$/,
  /^app\/css\/CrozzoPosStyles\.css$/,
  /^app\/css\/CrozzoPantallasShell\.css$/,
];

function readStdinSync() {
  try {
    const raw = readFileSync(0, 'utf8');
    if (!raw.trim()) return {};
    return JSON.parse(raw);
  } catch (_) {
    return {};
  }
}

function pickWritePath(payload) {
  const input = payload.input || payload.tool_input || payload.arguments || {};
  return normalize(String(input.path || input.file_path || input.filePath || payload.path || payload.file_path || ''))
    .replace(/\\/g, '/')
    .replace(/^\.\//, '');
}

function stampPath(rel) {
  const safe = rel.replace(/[^a-zA-Z0-9._-]+/g, '_');
  return join(STAMP_DIR, safe + '.json');
}

function isCritical(rel) {
  return CRITICAL.some((re) => re.test(rel));
}

function stampValid(rel) {
  const p = stampPath(rel);
  if (!existsSync(p)) return false;
  try {
    const s = JSON.parse(readFileSync(p, 'utf8'));
    if (norm(s.file) !== rel) return false;
    return Number(s.expiresAt) > Date.now();
  } catch (_) {
    return false;
  }
}

function norm(p) {
  return normalize(String(p || '')).replace(/\\/g, '/').replace(/^\.\//, '');
}

const payload = readStdinSync();
const rel = pickWritePath(payload);

if (!rel || !isCritical(rel)) {
  process.stdout.write(JSON.stringify({ permission: 'allow' }));
  process.exit(0);
}

if (stampValid(rel)) {
  process.stdout.write(JSON.stringify({ permission: 'allow' }));
  process.exit(0);
}

const msg =
  'Archivo crítico sin alcance reciente. Ejecuta en terminal:\n' +
  '  npm run edit:scope -- ' +
  rel +
  ' [nombreFuncion]\n' +
  'Luego reintenta el edit. Ver .cursor/rules/crozzo-read-before-write.mdc';

process.stdout.write(
  JSON.stringify({
    permission: 'deny',
    user_message: msg,
    agent_message: msg,
  })
);
process.exit(2);
