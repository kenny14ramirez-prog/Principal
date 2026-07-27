#!/usr/bin/env node
/** Launcher MCP synapse_memory — paths absolutos (repo con espacios). */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const synRoot = join(root, 'synapse');
const pyWin = join(synRoot, 'synapse', 'venv', 'Scripts', 'python.exe');
const pyUnix = join(synRoot, 'synapse', 'venv', 'bin', 'python');
const py = existsSync(pyWin) ? pyWin : pyUnix;

if (!existsSync(py)) {
  process.stderr.write('[crozzo-mcp] synapse python no encontrado: ' + py + '\n');
  process.exit(1);
}

const child = spawn(py, ['-m', 'synapse.mcp_server'], {
  cwd: synRoot,
  env: {
    ...process.env,
    PYTHONPATH: synRoot,
    MEMORY_DB_PATH: join(synRoot, 'memory.db'),
    PYTHONIOENCODING: 'utf-8',
  },
  stdio: 'inherit',
  windowsHide: true,
});

child.on('error', (err) => {
  process.stderr.write('[crozzo-mcp] synapse spawn: ' + err.message + '\n');
  process.exit(1);
});
child.on('exit', (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 1);
});
