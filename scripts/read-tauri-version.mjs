#!/usr/bin/env node
/**
 * Versión declarada en src-tauri/tauri.conf.json (sin consultar GitHub).
 * Uso: node scripts/read-tauri-version.mjs
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTauriVersion } from './resolve-crozzo-version.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
process.stdout.write(readTauriVersion(root));
