#!/usr/bin/env node
// Synapse Watch — indexación incremental por watcher (ejército).
// Observa app/ y docs/maps/ y registra cambios en Synapse Vector (memoria de largo plazo).
// Uso: node scripts/synapse-watch.mjs [--debounce=500]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const debounceMs = parseInt((process.argv.find(a => a.startsWith('--debounce=')) || '--debounce=500').split('=')[1], 10);

const watchDirs = ['app', 'docs/maps'];
const pending = new Set();
let timer = null;

function flush() {
  const files = [...pending];
  pending.clear();
  timer = null;
  for (const f of files) {
    const rel = path.relative(root, f);
    const cmd = `node scripts/synapse-vector.mjs remember "File changed: ${rel}" --agent=SYNAPSE-WATCH --category=file_change --source=${rel}`;
    spawnSync('node', ['scripts/synapse-vector.mjs', 'remember', `File changed: ${rel}`, `--agent=SYNAPSE-WATCH`, `--category=file_change`, `--source=${rel}`], {
      cwd: root, stdio: 'inherit',
    });
  }
  console.log(`[watch] Flushed ${files.length} change(s).`);
}

function schedule(file) {
  pending.add(file);
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, debounceMs);
}

for (const d of watchDirs) {
  const full = path.join(root, d);
  if (!fs.existsSync(full)) continue;
  try {
    fs.watch(full, { recursive: true }, (event, filename) => {
      if (!filename) return;
      const fullpath = path.join(full, filename);
      // ignore node_modules, .git, bundles? keep all
      if (fullpath.includes('node_modules') || fullpath.includes('.git')) return;
      schedule(fullpath);
    });
    console.log(`[watch] Observando ${d}/ (debounce ${debounceMs}ms)`);
  } catch (e) {
    console.error(`[watch] No se pudo observar ${d}:`, e.message);
  }
}

console.log('[watch] Presiona Ctrl+C para detener.');
process.on('SIGINT', () => { console.log('\n[watch] Deteniendo.'); process.exit(0); });
// Mantener proceso vivo
setInterval(() => {}, 1 << 30);
