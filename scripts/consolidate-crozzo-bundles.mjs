#!/usr/bin/env node
/**
 * Regenera bundles/CrozzoBundle*.js desde app/modules (fuente canónica).
 * Ejecutar: npm run consolidate (también lo invoca npm run sync si existe).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const modulesDir = join(root, 'app', 'modules');
const bundlesDir = join(root, 'app', 'bundles');

/** bundle filename → módulos en orden de concatenación */
const BUNDLE_MAP = {
  'CrozzoBundleReservorio.js': [
    'CrozzoBlobStore.js',
    'CrozzoProveedorDocumentos.js',
    'CrozzoReservorioSql.js',
    'CrozzoReservorio.js',
    'CrozzoReservorioOffline.js',
  ],
  'CrozzoBundleCostos.js': [
    'CrozzoCostosEngine.js',
    'CrozzoCatalogoMp.js',
    'CrozzoMatrizMp.js',
    'CrozzoCosteoMp.js',
    'CrozzoCatalogoHub.js',
    'CrozzoSistemaCostos.js',
    'CrozzoCostosReportesPdf.js',
  ],
  'CrozzoBundleCompras.js': [
    'CrozzoRecepcionFeDian.js',
    'CrozzoRecepcionFacturas.js',
    'CrozzoComprasLocal.js',
    'CrozzoCotizacionesMp.js',
    'CrozzoCentroCompras.js',
    'CrozzoBonaOrigen.js',
    'CrozzoCentroProcesos.js',
  ],
};

function readModule(name) {
  const path = join(modulesDir, name);
  if (!existsSync(path)) {
    throw new Error('Módulo no encontrado: ' + path);
  }
  return readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
}

function buildBundle(bundleName, moduleNames) {
  const parts = [`/* Crozzo bundle: ${bundleName} — generado, no editar */`, ''];
  for (const mod of moduleNames) {
    parts.push(`/* --- ${mod} --- */`, '', readModule(mod), '');
  }
  return parts.join('\n');
}

if (!existsSync(bundlesDir)) mkdirSync(bundlesDir, { recursive: true });

let ok = 0;
for (const [bundleName, moduleNames] of Object.entries(BUNDLE_MAP)) {
  const outPath = join(bundlesDir, bundleName);
  const content = buildBundle(bundleName, moduleNames);
  writeFileSync(outPath, content, 'utf8');
  const kb = (Buffer.byteLength(content, 'utf8') / 1024).toFixed(1);
  console.log('[consolidate]', bundleName, '←', moduleNames.length, 'módulos', '(' + kb + ' KB)');
  ok++;
}

console.log('[consolidate] listo:', ok, 'bundles');
