#!/usr/bin/env node
/**
 * Wrapper npm → Synapse mind CLI (Python venv).
 * Uso: node scripts/synapse-mind.mjs status|search|remember|seed|reindex -- ...
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const py = join(root, 'synapse', 'synapse', 'venv', 'Scripts', 'python.exe');
const script = join(root, 'scripts', 'synapse-mind.py');

if (!existsSync(py)) {
  console.error('[synapse] Falta venv:', py);
  process.exit(1);
}

const args = process.argv.slice(2);
const r = spawnSync(py, [script, ...args], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    PYTHONPATH: join(root, 'synapse'),
    PYTHONIOENCODING: 'utf-8',
    MEMORY_DB_PATH: join(root, 'synapse', 'memory.db'),
  },
});
process.exit(r.status == null ? 1 : r.status);
