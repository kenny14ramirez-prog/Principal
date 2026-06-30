/**
 * Regenera SQL embebido desde docs/ y parches del script 1.
 *
 *   node scripts/build-supabase-sql-bundles.mjs
 *
 * Equivalente a:
 *   node scripts/inject-supabase-sql-docs.mjs
 *   node scripts/patch-supabase-sql-bundles.mjs
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(script) {
  const r = spawnSync(process.execPath, [path.join(root, 'scripts', script)], {
    cwd: root,
    stdio: 'inherit',
  });
  if (r.status !== 0) process.exit(r.status || 1);
}

run('inject-supabase-sql-docs.mjs');
run('patch-supabase-sql-bundles.mjs');
run('fix-supabase-sql-quotes.mjs');
console.log('OK build-supabase-sql-bundles');
