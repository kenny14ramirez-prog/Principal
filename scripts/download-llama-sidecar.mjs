#!/usr/bin/env node
/**
 * Descarga llama-server (llama.cpp) para Windows x86_64 con resume + SHA256,
 * y lo deja en src-tauri/binaries/llama-server-x86_64-pc-windows-msvc.exe.
 *
 * Uso: node scripts/download-llama-sidecar.mjs
 * Opcional: LLAMA_URL, LLAMA_SHA256 (verificación del zip).
 */
import { existsSync, mkdirSync, createWriteStream, statSync, rmSync, readdirSync, copyFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import os from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL = process.env.LLAMA_URL || 'https://github.com/ggml-org/llama.cpp/releases/download/b5786/llama-b5786-bin-win-cpu-x64.zip';
const BIN_DIR = join(ROOT, 'src-tauri', 'binaries');
const DEST = join(BIN_DIR, 'llama-server-x86_64-pc-windows-msvc.exe');
const ZIP_PATH = join(os.tmpdir(), 'llama-server-sidecar.zip');
const EXTRACT_DIR = join(os.tmpdir(), 'llama-server-sidecar-extract');

async function downloadWithResume(url, outPath) {
  let existing = existsSync(outPath) ? statSync(outPath).size : 0;
  const headers = existing > 0 ? { Range: `bytes=${existing}-` } : {};
  const res = await fetch(url, { headers, redirect: 'follow' });
  if (!res.ok && res.status !== 206) {
    throw new Error(`Descarga falló: HTTP ${res.status}`);
  }
  const append = res.status === 206 && existing > 0;
  if (!append) {
    existing = 0;
  }
  const ws = createWriteStream(outPath, { flags: append ? 'a' : 'w' });
  const reader = res.body.getReader();
  let downloaded = existing;
  const total = res.headers.get('content-length')
    ? Number(res.headers.get('content-length')) + (append ? existing : 0)
    : 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    ws.write(Buffer.from(value));
    downloaded += value.length;
    if (total > 0) {
      process.stdout.write(`\rDescargando… ${Math.round((downloaded / total) * 100)}%`);
    }
  }
  await new Promise((resolve, reject) => {
    ws.end(() => resolve());
    ws.on('error', reject);
  });
  process.stdout.write('\n');
  return downloaded;
}

function sha256File(p) {
  const h = createHash('sha256');
  h.update(readFileSync(p));
  return h.digest('hex');
}

async function main() {
  mkdirSync(BIN_DIR, { recursive: true });

  if (existsSync(DEST)) {
    console.log('Binario ya existe:', DEST);
    console.log('SHA256:', sha256File(DEST));
    // continuar igual para permitir re-extracción si se desea; saltar descarga
  }

  console.log('Descargando', URL);
  await downloadWithResume(URL, ZIP_PATH);

  // Verificación opcional del zip
  if (process.env.LLAMA_SHA256) {
    const got = sha256File(ZIP_PATH);
    if (got.toLowerCase() !== process.env.LLAMA_SHA256.toLowerCase()) {
      throw new Error(`SHA256 del zip no coincide: esperado ${process.env.LLAMA_SHA256}, obtenido ${got}`);
    }
    console.log('SHA256 del zip verificado.');
  }

  // Limpiar extracción previa
  try { rmSync(EXTRACT_DIR, { recursive: true, force: true }); } catch (_) {}
  mkdirSync(EXTRACT_DIR, { recursive: true });

  // Extraer con PowerShell (Windows)
  const ps = spawnSync('powershell', [
    '-NoProfile',
    '-Command',
    `Expand-Archive -Path '${ZIP_PATH}' -DestinationPath '${EXTRACT_DIR}' -Force`,
  ], { stdio: 'inherit' });
  if (ps.status !== 0) {
    throw new Error('Expand-Archive falló');
  }

  // Buscar llama-server.exe
  function findExe(dir) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const st = statSync(p);
      if (st.isDirectory()) {
        const r = findExe(p);
        if (r) return r;
      } else if (name.toLowerCase() === 'llama-server.exe') {
        return p;
      }
    }
    return null;
  }
  const exe = findExe(EXTRACT_DIR);
  if (!exe) throw new Error('No se encontró llama-server.exe en el zip');

  copyFileSync(exe, DEST);
  console.log('Guardado:', DEST);
  console.log('SHA256 exe:', sha256File(DEST));
}

main().catch((e) => {
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
});