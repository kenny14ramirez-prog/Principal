#!/usr/bin/env node
/**
 * Cursor preCompact — marca pendiente de guardar en Synapse antes de compactar contexto.
 * Output: solo user_message (schema Cursor). No followup_message aquí.
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PENDING = join(root, '.cursor', 'synapse-pending-save.json');
const STATE = join(root, '.cursor', 'session-state.json');

function readStdinSync() {
  try {
    const raw = readFileSync(0, 'utf8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

function readJsonFile(path, fallback) {
  try {
    let raw = readFileSync(path, 'utf8');
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

const payload = readStdinSync();
const pct = payload.context_usage_percent ?? payload.contextUsagePercent ?? '?';
const trigger = payload.trigger || 'auto';

let editedApp = [];
const st = readJsonFile(STATE, null);
if (st && Array.isArray(st.editedApp)) editedApp = st.editedApp;

try {
  mkdirSync(join(root, '.cursor'), { recursive: true });
  writeFileSync(
    PENDING,
    JSON.stringify({
      at: new Date().toISOString(),
      trigger,
      context_usage_percent: pct,
      editedApp,
      reason: 'preCompact',
    }),
    'utf8'
  );
} catch (_) {}

const filesHint =
  editedApp.length > 0
    ? ' Archivos tocados en sesión: ' + editedApp.slice(0, 8).join(', ') + (editedApp.length > 8 ? '…' : '') + '.'
    : '';

const msg =
  'Contexto a punto de compactarse (' +
  trigger +
  ', ~' +
  pct +
  '%).' +
  filesHint +
  ' Tras compactar: guarda en Synapse lo esencial (store_memory / npm run synapse:remember) — causas raíz, decisiones y preferencias. No pegues dumps de código.';

process.stdout.write(JSON.stringify({ user_message: msg }));
process.exit(0);
