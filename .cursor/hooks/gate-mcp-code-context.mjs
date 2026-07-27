#!/usr/bin/env node
/**
 * beforeMCPExecution — gate solo para writes de mcp-code-context.
 * Otros MCP (synapse_memory, etc.) pasan sin tocar failClosed.
 * Escrituras:
 *  - niega src/ (espejo)
 *  - archivos críticos requieren stamp edit:scope
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const STAMP_DIR = join(root, '.cursor', 'scope-stamps');

const CODE_CONTEXT_SERVERS = new Set(['mcp-code-context', 'code-context']);

const WRITE_TOOLS = new Set([
  'write_file_surgical',
  'insert_symbol',
  'remove_symbol',
  'rename_symbol',
  'ast_transform',
]);

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

function allow() {
  process.stdout.write(JSON.stringify({ permission: 'allow' }));
  process.exit(0);
}

function deny(msg) {
  process.stdout.write(
    JSON.stringify({ permission: 'deny', user_message: msg, agent_message: msg })
  );
  process.exit(2);
}

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
  if (s.toLowerCase().startsWith(rootN.toLowerCase() + '/')) {
    s = s.slice(rootN.length + 1);
  }
  return s.replace(/^\.\//, '');
}

function stampPath(rel) {
  const safe = rel.replace(/[^a-zA-Z0-9._-]+/g, '_');
  return join(STAMP_DIR, safe + '.json');
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

function pickFilePath(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return '';
  return (
    toolInput.filePath ||
    toolInput.file_path ||
    toolInput.path ||
    (Array.isArray(toolInput.reads) && toolInput.reads[0] && toolInput.reads[0].filePath) ||
    ''
  );
}

function underSrc(rel) {
  return rel === 'src' || rel.startsWith('src/');
}

function isCritical(rel) {
  return CRITICAL.some((re) => re.test(rel));
}

function pickServer(payload) {
  const raw =
    payload.server ||
    payload.mcp_server ||
    payload.mcpServer ||
    payload.serverName ||
    payload.server_name ||
    '';
  return String(raw).trim().toLowerCase();
}

function isCodeContextServer(server) {
  if (!server) return null; // desconocido → decidir por tool name
  return CODE_CONTEXT_SERVERS.has(server);
}

const payload = readStdinSync();
const toolName = String(payload.tool_name || payload.toolName || '').trim();
const server = pickServer(payload);
const serverIsCc = isCodeContextServer(server);

let toolInput = payload.tool_input || payload.toolInput || payload.arguments || {};
if (typeof toolInput === 'string') {
  try {
    toolInput = JSON.parse(toolInput);
  } catch (_) {
    toolInput = {};
  }
}

// Synapse u otros MCP: no aplicar este gate (evita failClosed colateral)
if (serverIsCc === false) allow();
if (serverIsCc !== true && !WRITE_TOOLS.has(toolName)) allow();
if (!WRITE_TOOLS.has(toolName)) allow();

const rel = norm(pickFilePath(toolInput));
if (!rel) allow();

if (underSrc(rel) && !rel.startsWith('src-tauri/')) {
  deny(
    'mcp-code-context: escritura denegada en src/ (espejo). Edita app/ y deja que npm run sync copie.'
  );
}

if (isCritical(rel) && !stampValid(rel)) {
  deny(
    'mcp-code-context: archivo crítico sin edit:scope. Ejecuta:\n' +
      '  npm run edit:scope -- ' +
      rel +
      ' [nombreSimbolo]\n' +
      'Luego reintenta write_file_surgical / insert_symbol.'
  );
}

allow();
