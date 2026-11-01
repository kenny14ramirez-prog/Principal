#!/usr/bin/env node
// Verifica que los mapas estén frescos SIN modificar archivos.
// Ejecuta map:refresh en copia temporal y compara con docs/maps/.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import os from 'node:os';

const root = path.resolve(process.cwd());
const mapsDir = path.join(root, 'docs', 'maps');
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'maps-fresh-'));
const backupDir = path.join(tmpRoot, 'backup');
const workDir = path.join(tmpRoot, 'work');

// 1. Backup actual
fs.cpSync(mapsDir, backupDir, { recursive: true });

// 2. Copia de trabajo para regenerar
fs.cpSync(mapsDir, workDir, { recursive: true });

// 3. Regenerar en la copia de trabajo (cambiando cwd no sirve; map:refresh usa process.cwd())
//    En su lugar, regeneramos en docs/maps y luego restauramos.
let failed = false;
try {
  execSync('node scripts/crozzo-map-refresh.mjs', { cwd: root, stdio: 'pipe' });
} catch (e) {
  console.error('map:refresh falló:', e.message);
  // restaurar
  fs.rmSync(mapsDir, { recursive: true, force: true });
  fs.cpSync(backupDir, mapsDir, { recursive: true });
  process.exit(1);
}

// 4. Comparar
function listFiles(dir) {
  const out = [];
  const walk = (d, base) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, base);
      else out.push(path.relative(base, p));
    }
  };
  walk(dir, dir);
  return out.sort();
}

const before = listFiles(backupDir);
const after = listFiles(mapsDir);

let diff = false;
const changed = [];
if (before.join('\n') !== after.join('\n')) {
  diff = true;
  console.log('Archivos añadidos/eliminados por map:refresh:');
  const setBefore = new Set(before), setAfter = new Set(after);
  for (const f of after) if (!setBefore.has(f)) { changed.push('+' + f); diff = true; }
  for (const f of before) if (!setAfter.has(f)) { changed.push('-' + f); diff = true; }
}
for (const f of after) {
  if (!before.includes(f)) continue;
  const a = fs.readFileSync(path.join(backupDir, f));
  const b = fs.readFileSync(path.join(mapsDir, f));
  if (!a.equals(b)) { changed.push('~' + f); diff = true; }
}

// 5. Restaurar estado original (no modificar working tree)
fs.rmSync(mapsDir, { recursive: true, force: true });
fs.cpSync(backupDir, mapsDir, { recursive: true });

if (diff) {
  console.log('FAIL: map:refresh produjo cambios. Ejecuta `npm run map:refresh` y commitea los mapas.');
  for (const c of changed) console.log('  ' + c);
  process.exit(1);
} else {
  console.log('PASS: mapas frescos.');
  process.exit(0);
}
