#!/usr/bin/env node
/**
 * Vendoriza OpenCV.js (offline) en app/vendor/CrozzoOpenCv.js.
 *
 * OpenCV.js se usa para la deteccion de bordes del documento y la correccion de
 * perspectiva en el escaner de facturas (estilo CamScanner). El build de
 * docs.opencv.org embebe el wasm en base64, asi que es un unico archivo
 * autocontenido apto para Tauri sin conexion.
 *
 * Uso: npm run vendor:opencv
 */
import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const VERSION = '4.8.0';
const URL = `https://docs.opencv.org/${VERSION}/opencv.js`;
const root = process.cwd();
const vendorDir = join(root, 'app', 'vendor');
const out = join(vendorDir, 'CrozzoOpenCv.js');

if (existsSync(out) && !process.argv.includes('--force')) {
  const kb = Math.round(statSync(out).size / 1024);
  console.log(`[opencv-vendor] Ya existe app/vendor/CrozzoOpenCv.js (${kb} KB). Usa --force para re-descargar.`);
  process.exit(0);
}

mkdirSync(vendorDir, { recursive: true });
console.log(`[opencv-vendor] Descargando OpenCV.js ${VERSION} ...`);

const res = await fetch(URL);
if (!res.ok) {
  console.error(`[opencv-vendor] Error HTTP ${res.status} al descargar ${URL}`);
  process.exit(1);
}
await pipeline(Readable.fromWeb(res.body), createWriteStream(out));

const kb = Math.round(statSync(out).size / 1024);
console.log(`[opencv-vendor] OK -> app/vendor/CrozzoOpenCv.js (${kb} KB)`);
