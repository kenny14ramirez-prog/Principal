#!/usr/bin/env node
/**
 * Cursor hook preToolUse — bloquea escritura directa en src/ (espejo de app/).
 * Permite src-tauri/ (Rust). fail-open si stdin inválido.
 */
import { readFileSync } from 'node:fs';
import { normalize } from 'node:path';

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
  return (
    input.path ||
    input.file_path ||
    input.filePath ||
    payload.path ||
    payload.file_path ||
    ''
  );
}

function isBlockedMirrorWrite(rel) {
  const n = normalize(String(rel || '')).replace(/\\/g, '/').replace(/^\.\//, '');
  if (!n.startsWith('src/')) return false;
  if (n.startsWith('src-tauri/')) return false;
  return true;
}

const payload = readStdinSync();
const rel = pickWritePath(payload);

if (isBlockedMirrorWrite(rel)) {
  const msg =
    'No editar src/ (espejo Tauri). Edita app/ equivalente y corre npm run sync.';
  process.stdout.write(
    JSON.stringify({
      permission: 'deny',
      user_message: msg,
      agent_message: msg + ' Path: ' + rel,
    })
  );
  process.exit(2);
}

process.stdout.write(JSON.stringify({ permission: 'allow' }));
process.exit(0);
