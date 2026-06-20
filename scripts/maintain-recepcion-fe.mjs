#!/usr/bin/env node
/**
 * Mantenimiento pipeline FE recepción.
 *   node scripts/maintain-recepcion-fe.mjs check
 *   node scripts/maintain-recepcion-fe.mjs eval
 *   node scripts/maintain-recepcion-fe.mjs build-data
 *   node scripts/maintain-recepcion-fe.mjs refresh
 */
import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(import.meta.dirname, '..');
const PROFILE = join(ROOT, 'app', 'data', 'fe-training-profile.json');
const SAMPLES = join(ROOT, 'facturas de pruebas');
const cmd = process.argv[2] || 'check';
const flags = process.argv.slice(3);

function runTrain(extraArgs = []) {
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'train-recepcion-fe.mjs'), ...extraArgs], {
    stdio: 'inherit',
    cwd: ROOT,
  });
  return r.status === 0;
}

function runSync() {
  const r = spawnSync('npm', ['run', 'sync'], { stdio: 'inherit', cwd: ROOT, shell: true });
  return r.status === 0;
}

function check() {
  console.log('=== Recepción FE — diagnóstico ===\n');
  console.log('Carpeta muestras:', existsSync(SAMPLES) ? 'OK' : 'FALTA', SAMPLES);
  if (existsSync(SAMPLES)) {
    const n = readdirSync(SAMPLES).filter((f) => /\.pdf$/i.test(f)).length;
    console.log('PDFs en muestras:', n);
  }
  console.log('Perfil entrenamiento:', existsSync(PROFILE) ? 'OK' : 'FALTA', PROFILE);
  if (existsSync(PROFILE)) {
    try {
      const j = JSON.parse(readFileSync(PROFILE, 'utf8'));
      const age = statSync(PROFILE).mtime.toISOString().slice(0, 10);
      console.log('  versión:', j.version, '| muestras:', j.sampleSize, '| fecha:', j.trainedAt, '| archivo:', age);
      console.log('  probe nombre:', j.probeNombrePct + '%', '| probe NIT:', j.probeNitPct + '%');
      console.log('  proveedores:', (j.vendors || []).length);
    } catch (e) {
      console.log('  ERROR leyendo JSON:', e.message);
    }
  }
  console.log('\nScripts: train-recepcion-fe.mjs', existsSync(join(ROOT, 'scripts', 'train-recepcion-fe.mjs')) ? 'OK' : 'FALTA');
}

function main() {
  if (cmd === 'check') {
    check();
    return;
  }
  if (cmd === 'eval') {
    console.log('=== Evaluación rápida (14 PDF) ===\n');
    if (!runTrain(['--quick'])) process.exit(1);
    return;
  }
  if (cmd === 'build-data') {
    console.log('=== Generar fe-training-profile.json ===\n');
    if (!runTrain(flags)) process.exit(1);
    return;
  }
  if (cmd === 'refresh') {
    console.log('=== Refresh: entrenar + sync ===\n');
    if (!runTrain(flags)) process.exit(1);
    if (!runSync()) process.exit(1);
    console.log('\n[refresh] Listo — recargue Tauri (Ctrl+Shift+R)');
    return;
  }
  console.error('Comando desconocido:', cmd);
  process.exit(1);
}

main();
