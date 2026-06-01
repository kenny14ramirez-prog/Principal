#!/usr/bin/env node
/**
 * Elige el APK firmado para subir al release (evita *unsigned*).
 * Uso: node scripts/pick-android-apk.mjs
 */
import { readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const base = join(root, 'src-tauri', 'gen', 'android');

function walk(dir, out) {
  if (!dir) return;
  let entries = [];
  try {
    entries = readdirSync(dir);
  } catch (_) {
    return;
  }
  for (const name of entries) {
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch (_) {
      continue;
    }
    if (st.isDirectory()) walk(p, out);
    else if (/\.apk$/i.test(name)) out.push({ path: p, name, mtime: st.mtimeMs, unsigned: /unsigned/i.test(name) });
  }
}

const apks = [];
walk(base, apks);
if (!apks.length) {
  console.error('NO_APK');
  process.exit(1);
}

apks.sort((a, b) => {
  if (a.unsigned !== b.unsigned) return a.unsigned ? 1 : -1;
  return b.mtime - a.mtime;
});

const pick = apks.find((a) => !a.unsigned) || apks[0];
if (pick.unsigned) {
  console.error('WARN_UNSIGNED');
}
console.log(pick.path);
