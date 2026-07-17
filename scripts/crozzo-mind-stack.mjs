#!/usr/bin/env node
/**
 * Stack "segunda mente" Crozzo — health + refresh local
 * (equivalente práctico a Automation map:refresh / reindex / graph).
 *
 *   node scripts/crozzo-mind-stack.mjs health
 *   node scripts/crozzo-mind-stack.mjs refresh
 *   node scripts/crozzo-mind-stack.mjs refresh --skip-graph
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: opts.stdio || 'inherit',
    timeout: opts.timeout || 600000,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  });
  return r.status === 0;
}

function ok(label, pass, detail = '') {
  const mark = pass ? 'OK ' : 'FAIL';
  console.log(`[${mark}] ${label}${detail ? ' — ' + detail : ''}`);
  return pass;
}

function health() {
  let all = true;
  const py = join(root, 'synapse', 'synapse', 'venv', 'Scripts', 'python.exe');
  const pyAlt = join(root, 'synapse', 'synapse', 'venv', 'bin', 'python');
  const pyOk = existsSync(py) || existsSync(pyAlt);
  all = ok('Synapse venv', pyOk, pyOk ? 'python listo' : 'falta synapse/synapse/venv') && all;

  const memDb = join(root, 'synapse', 'memory.db');
  all = ok('Synapse DB', existsSync(memDb), existsSync(memDb) ? 'memory.db' : 'falta memory.db') && all;

  const cc = join(root, 'node_modules', 'mcp-code-context', 'dist', 'src', 'index.js');
  all = ok('mcp-code-context', existsSync(cc)) && all;

  const cm = join(root, 'node_modules', 'codebase-memory-mcp', 'bin.js');
  all = ok('codebase-memory-mcp', existsSync(cm)) && all;

  const launchers = [
    'synapse.mjs',
    'code-context.mjs',
    'codebase-memory.mjs',
  ].map((f) => join(root, '.cursor', 'mcp-launchers', f));
  all = ok(
    'MCP launchers',
    launchers.every((p) => existsSync(p)),
    '.cursor/mcp-launchers/*'
  ) && all;

  let mcpOk = false;
  try {
    const mcp = JSON.parse(readFileSync(join(root, '.cursor', 'mcp.json'), 'utf8'));
    const names = Object.keys(mcp.mcpServers || {});
    mcpOk =
      names.includes('synapse_memory') &&
      names.includes('mcp-code-context') &&
      names.includes('codebase-memory');
    all = ok('mcp.json servers', mcpOk, names.join(', ')) && all;
  } catch (_) {
    all = ok('mcp.json', false, 'no parseable') && all;
  }

  const hooks = join(root, '.cursor', 'hooks.json');
  let hooksOk = false;
  try {
    const h = JSON.parse(readFileSync(hooks, 'utf8'));
    hooksOk = !!(
      h.hooks?.beforeMCPExecution &&
      h.hooks?.beforeShellExecution &&
      h.hooks?.preCompact &&
      h.hooks?.stop
    );
    all = ok('hooks.json stack', hooksOk, 'MCP+shell+compact+stop') && all;
  } catch (_) {
    all = ok('hooks.json', false) && all;
  }

  // graph index via CLI (rápido)
  if (existsSync(cm)) {
    const r = spawnSync(
      process.execPath,
      [cm, 'cli', 'index_status', '--project', 'crozzo-pos'],
      { cwd: root, encoding: 'utf8', timeout: 60000, windowsHide: true }
    );
    const out = (r.stdout || '') + (r.stderr || '');
    const indexed = /indexed|nodes|ready|ok/i.test(out) && r.status === 0;
    all = ok('Grafo crozzo-pos', indexed || /indexed/i.test(out), (out.match(/"status":"[^"]+"/) || [''])[0] || 'ver graph:index') && all;
  }

  console.log(all ? '\nStack mente: LISTO (tras cerrar/abrir Cursor verás los 3 MCP).' : '\nStack mente: incompleto — revisa FAIL arriba.');
  process.exit(all ? 0 : 1);
}

function refresh(argv) {
  const skipGraph = argv.includes('--skip-graph');
  const skipSynapse = argv.includes('--skip-synapse');
  console.log('=== mind:refresh — map:refresh ===');
  if (!run(npmCmd, ['run', 'map:refresh'])) process.exit(1);
  if (!skipSynapse) {
    console.log('=== mind:refresh — synapse:reindex ===');
    if (!run(npmCmd, ['run', 'synapse:reindex'])) {
      console.warn('[warn] synapse:reindex falló (¿Ollama abajo?). Continúo.');
    }
  }
  if (!skipGraph) {
    console.log('=== mind:refresh — graph:index (app/) ===');
    if (!run(npmCmd, ['run', 'graph:index'])) {
      console.warn('[warn] graph:index falló. Continúo.');
    }
  }
  console.log('=== mind:refresh OK ===');
  process.exit(0);
}

const cmd = process.argv[2] || 'health';
if (cmd === 'health') health();
else if (cmd === 'refresh') refresh(process.argv.slice(3));
else {
  console.error('Uso: node scripts/crozzo-mind-stack.mjs health|refresh [--skip-graph] [--skip-synapse]');
  process.exit(2);
}
