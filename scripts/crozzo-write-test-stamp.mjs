#!/usr/bin/env node
/** Escribe sello tras test:sync-clinical OK (30 min). */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(join(root, '.cursor'), { recursive: true });
writeFileSync(
  join(root, '.cursor', 'test-clinical.stamp'),
  JSON.stringify({ at: new Date().toISOString(), expiresAt: Date.now() + 30 * 60 * 1000 }),
  'utf8'
);
