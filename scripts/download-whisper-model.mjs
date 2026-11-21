#!/usr/bin/env node
/**
 * Descarga un modelo whisper.cpp (base o small) y lo deja en src-tauri/models/.
 *
 * Uso:
 *   node scripts/download-whisper-model.mjs            # base por defecto
 *   node scripts/download-whisper-model.mjs small      # small
 *   WHISPER_MODEL=small node scripts/download-whisper-model.mjs
 *   WHISPER_URL=... WHISPER_SHA256=... node scripts/download-whisper-model.mjs
 */
import { existsSync, mkdirSync, createWriteStream, statSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODEL = (process.argv[2] || process.env.WHISPER_MODEL || 'base').toLowerCase();
const MODELS = {
  base: {
    file: 'ggml-base.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
  },
  small: {
    file: 'ggml-small.bin',
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
  },
};
const chosen = MODELS[MODEL];
if (!chosen) {
  console.error('Modelo desconocido:', MODEL, '(use base o small)');
  process.exit(1);
}
const URL = process.env.WHISPER_URL || chosen.url;
const DEST_DIR = join(ROOT, 'src-tauri', 'models');
const DEST = join(DEST_DIR, chosen.file);

async function downloadWithResume(url, outPath) {
  let existing = existsSync(outPath) ? statSync(outPath).size : 0;
  const headers = existing > 0 ? { Range: `bytes=${existing}-` } : {};
  const res = await fetch(url, { headers, redirect: 'follow' });
  if (!res.ok && res.status !== 206) throw new Error(`Descarga falló: HTTP ${res.status}`);
  const append = res.status === 206 && existing > 0;
  if (!append) existing = 0;
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
    if (total > 0) process.stdout.write(`\rDescargando ${chosen.file}… ${Math.round((downloaded / total) * 100)}%`);
  }
  await new Promise((resolve, reject) => { ws.end(() => resolve()); ws.on('error', reject); });
  process.stdout.write('\n');
  return downloaded;
}

function sha256File(p) {
  const h = createHash('sha256');
  h.update(readFileSync(p));
  return h.digest('hex');
}

async function main() {
  mkdirSync(DEST_DIR, { recursive: true });
  if (existsSync(DEST)) {
    console.log('Modelo ya existe:', DEST);
    console.log('SHA256:', sha256File(DEST));
  }
  console.log('Descargando', URL);
  await downloadWithResume(URL, DEST);
  if (process.env.WHISPER_SHA256) {
    const got = sha256File(DEST);
    if (got.toLowerCase() !== process.env.WHISPER_SHA256.toLowerCase()) {
      throw new Error(`SHA256 no coincide: esperado ${process.env.WHISPER_SHA256}, obtenido ${got}`);
    }
    console.log('SHA256 verificado.');
  }
  console.log('Guardado:', DEST);
  console.log('SHA256:', sha256File(DEST));
}

main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
