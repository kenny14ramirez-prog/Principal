#!/usr/bin/env node
/**
 * afterMCPExecution — si mcp-code-context escribió en app/, corre npm run sync
 * (el hook afterFileEdit de Cursor no cubre writes MCP).
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const STATE = join(root, '.cursor', 'session-state.json');
const SYNC_RE =
  /^app\/(core\/CrozzoPosMain|modules\/Crozzo(PosRuntimeCloud|ComandasCloudSync|OperativeSyncGate)|infra\/Crozzo(OpFanout|LanOpsSync|LanSyncBridge|PageCloudWatch|CloudSyncPriorities))\.js$/;

const WRITE_TOOLS = new Set([
  'write_file_surgical',
  'insert_symbol',
  'remove_symbol',
  'rename_symbol',
  'ast_transform',
]);

function readStdinSync() {
  try {
    const raw = readFileSync(0, 'utf8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

function norm(p) {
  let s = normalize(String(p || '')).replace(/\\/g, '/');
  const rootN = root.replace(/\\/g, '/');
  if (s.toLowerCase().startsWith(rootN.toLowerCase() + '/')) s = s.slice(rootN.length + 1);
  return s.replace(/^\.\//, '');
}

function pickFilePath(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return '';
  return toolInput.filePath || toolInput.file_path || toolInput.path || '';
}

const payload = readStdinSync();
const server = String(
  payload.server || payload.mcp_server || payload.mcpServer || payload.serverName || ''
)
  .trim()
  .toLowerCase();
// Solo sync tras writes de mcp-code-context (no Synapse / codebase-memory)
if (server && server !== 'mcp-code-context' && server !== 'code-context') process.exit(0);

const toolName = String(payload.tool_name || payload.toolName || '').trim();
if (!WRITE_TOOLS.has(toolName)) process.exit(0);

let toolInput = payload.tool_input || payload.toolInput || payload.arguments || {};
if (typeof toolInput === 'string') {
  try {
    toolInput = JSON.parse(toolInput);
  } catch (_) {
    toolInput = {};
  }
}

const rel = norm(pickFilePath(toolInput));
if (!rel.startsWith('app/')) process.exit(0);

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = spawnSync(npmCmd, ['run', 'sync'], {
  cwd: root,
  stdio: 'pipe',
  encoding: 'utf8',
  timeout: 120000,
  shell: process.platform === 'win32',
});
if (run.status !== 0) {
  process.stderr.write('[crozzo-hook] sync tras MCP write falló: ' + (run.stderr || run.stdout || '').slice(0, 400) + '\n');
}

try {
  mkdirSync(join(root, '.cursor'), { recursive: true });
  const prev = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : { files: [], editedApp: [] };
  const files = Array.isArray(prev.files) ? prev.files : [];
  const editedApp = Array.isArray(prev.editedApp) ? prev.editedApp : [];
  if (!editedApp.includes(rel)) editedApp.push(rel);
  let editedSync = !!prev.editedSync;
  if (SYNC_RE.test(rel) || rel === 'app/index.html') {
    if (!files.includes(rel)) files.push(rel);
    editedSync = true;
  }
  writeFileSync(
    STATE,
    JSON.stringify({ editedSync, files, editedApp, at: new Date().toISOString() }),
    'utf8'
  );
} catch (_) {}

process.exit(0);
