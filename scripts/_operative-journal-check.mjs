#!/usr/bin/env node
/**
 * Verificación — diario operativo, dev tap, perf continuo, autoguarda inteligente.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const results = [];

function ok(name, detail) {
  results.push({ ok: true, name, detail });
}
function fail(name, detail) {
  results.push({ ok: false, name, detail });
  failed++;
}
function assert(cond, name, detail) {
  if (cond) ok(name, detail);
  else fail(name, detail);
}

function mustInclude(file, patterns, label) {
  const p = join(root, file);
  if (!existsSync(p)) {
    fail(label, 'ausente: ' + file);
    return '';
  }
  const txt = readFileSync(p, 'utf8');
  for (const pat of patterns) {
    const hit = typeof pat === 'string' ? txt.includes(pat) : pat.test(txt);
    if (!hit) {
      fail(label, 'falta: ' + String(pat));
      return txt;
    }
  }
  ok(label, file);
  return txt;
}

mustInclude('app/infra/CrozzoOperativeJournal.js', [
  'CrozzoOperativeJournal',
  'topFingerprints',
  'exportJson',
  'crozzo-tier-changed',
  'unhandledrejection',
], 'Diario operativo');

mustInclude('app/infra/CrozzoDevTap.js', ['CrozzoDevTap', '127.0.0.1:9876', 'crozzo_append_dev_log'], 'DevTap');

mustInclude('app/infra/CrozzoZ0AutoGuard.js', [
  'effectiveRecoverGap',
  'RECOVER_GAP_URGENT_MS',
  'journalRecord',
  'CrozzoOperativeJournal',
], 'Autoguarda + journal');

mustInclude('app/infra/CrozzoStartupReady.js', [
  'CrozzoOperativeJournal',
  'CrozzoDevTap',
  'startContinuousProbe',
], 'Startup journal/dev/perf');

mustInclude('app/core/CrozzoDevicePerf.js', [
  'startContinuousProbe',
  'jank_sustained',
  'CrozzoOperativeJournal',
], 'Perf continuo');

mustInclude('app/modules/CrozzoComunicacionDiag.js', ['operative-journal', 'Diario (automático)'], 'Diag diario');

mustInclude('app/index.html', ['CrozzoOperativeJournal.js', 'CrozzoDevTap.js'], 'Scripts index');

mustInclude('src-tauri/src/crozzo_dev_log.rs', ['crozzo_append_dev_log'], 'Rust dev log');

const libRs = mustInclude('src-tauri/src/lib.rs', ['crozzo_dev_log::crozzo_append_dev_log'], 'Lib dev log');

assert(
  existsSync(join(root, 'scripts/dev-session-observer.mjs')),
  'Observador dev',
  'dev-session-observer.mjs'
);

const pkg = readFileSync(join(root, 'package.json'), 'utf8');
assert(pkg.includes('dev:observe'), 'npm dev:observe', 'package.json');
assert(pkg.includes('_operative-journal-check.mjs'), 'test journal en sync-clinical', 'package.json');

console.log('\n=== Crozzo diario operativo — verificación ===\n');
for (const r of results) {
  console.log((r.ok ? '✓' : '✗') + ' ' + r.name + (r.detail ? ' — ' + r.detail : ''));
}
console.log('\n' + (failed ? failed + ' fallo(s)' : 'Todo OK') + ' (' + results.length + ' checks)\n');
process.exit(failed ? 1 : 0);
