#!/usr/bin/env node
/** @deprecated Use patch-android-signing.mjs (incluye firma + APK in-app). */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const script = join(dirname(fileURLToPath(import.meta.url)), 'patch-android-signing.mjs');
const r = spawnSync(process.execPath, [script], { stdio: 'inherit' });
process.exit(r.status ?? 1);
