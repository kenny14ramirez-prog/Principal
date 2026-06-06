#!/usr/bin/env node
/**
 * Versión Crozzo POS (local + GitHub Releases + OTA).
 *   node scripts/bump-tauri-version.mjs           → siguiente patch
 *   node scripts/bump-tauri-version.mjs --current → versión máxima actual
 *   node scripts/bump-tauri-version.mjs --local   → solo archivos locales (sin GitHub)
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bumpPatchSemver,
  resolveMaxVersion,
  resolveMaxVersionLocal,
} from './resolve-crozzo-version.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const localOnly = args.has('--local');
const max = localOnly
  ? resolveMaxVersionLocal(root)
  : await resolveMaxVersion(root, { includeRemote: !localOnly });

if (args.has('--current')) {
  process.stdout.write(max);
} else {
  process.stdout.write(bumpPatchSemver(max));
}
