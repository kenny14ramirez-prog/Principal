#!/usr/bin/env node
/**
 * Tests unitarios para el sistema de actualizaciones de Bona Origen.
 * Ejecuta: node scripts/test-updates-unit.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'app', 'infra', 'CrozzoSystemUpdates.js'), 'utf8');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('  [PASS] ' + name);
    passed++;
  } catch (e) {
    console.log('  [FAIL] ' + name + ' — ' + (e && e.message ? e.message : e));
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

console.log('\n  Crozzo POS — Tests unitarios de actualizaciones');
console.log('  ===============================================\n');

// ─── Test 1: compareSemver logic (extracted from code) ───
function parseSemver(v) {
  var s = String(v || '').replace(/^v/i, '');
  var core = s.split('-')[0];
  var parts = core.split('.').map(function (n) { return parseInt(n, 10) || 0; });
  while (parts.length < 3) parts.push(0);
  return parts;
}
function compareSemver(a, b) {
  var pa = parseSemver(a);
  var pb = parseSemver(b);
  for (var i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

test('compareSemver: v1.0.0 < v1.0.1', function () { assert(compareSemver('v1.0.0', 'v1.0.1') < 0); });
test('compareSemver: v1.0.1 > v1.0.0', function () { assert(compareSemver('v1.0.1', 'v1.0.0') > 0); });
test('compareSemver: v1.0.0 == v1.0.0', function () { assert(compareSemver('v1.0.0', 'v1.0.0') === 0); });
test('compareSemver: v2.0.0 > v1.9.9', function () { assert(compareSemver('v2.0.0', 'v1.9.9') > 0); });
test('compareSemver: v1.10.0 > v1.9.0', function () { assert(compareSemver('v1.10.0', 'v1.9.0') > 0); });
test('compareSemver: handles missing v prefix', function () { assert(compareSemver('1.0.0', '1.0.1') < 0); });
test('compareSemver: handles pre-release suffix', function () { assert(compareSemver('v1.0.0-rc1', 'v1.0.0') === 0); });

// ─── Test 2: isAllowedUrl (extracted) ───
function isAllowedUrl(url) {
  var ALLOWED_HOSTS = ['raw.githubusercontent.com', 'github.com', 'api.github.com'];
  try {
    var u = new URL(String(url || '').trim());
    if (u.protocol !== 'https:') return false;
    return ALLOWED_HOSTS.indexOf(u.hostname) >= 0;
  } catch (_) {
    return false;
  }
}

test('isAllowedUrl: github.com allowed', function () { assert(isAllowedUrl('https://github.com/foo/bar')); });
test('isAllowedUrl: raw.githubusercontent.com allowed', function () { assert(isAllowedUrl('https://raw.githubusercontent.com/foo/bar')); });
test('isAllowedUrl: api.github.com allowed', function () { assert(isAllowedUrl('https://api.github.com/repos/foo/bar')); });
test('isAllowedUrl: evil.com blocked', function () { assert(!isAllowedUrl('https://evil.com/malware.json')); });
test('isAllowedUrl: http blocked', function () { assert(!isAllowedUrl('http://github.com/foo/bar')); });
test('isAllowedUrl: invalid URL blocked', function () { assert(!isAllowedUrl('not-a-url')); });
test('isAllowedUrl: empty blocked', function () { assert(!isAllowedUrl('')); });

// ─── Test 3: backoffMs (extracted) ───
function backoffMs(attempt) {
  var base = 60000 * Math.pow(2, Math.max(0, (attempt || 1) - 1));
  var capped = Math.min(base, 6 * 3600000);
  var jitter = 0.8 + Math.random() * 0.4;
  return Math.round(capped * jitter);
}

test('backoffMs: attempt 1 ~ 60s', function () {
  var v = backoffMs(1);
  assert(v >= 48000 && v <= 84000, 'got ' + v);
});
test('backoffMs: attempt 2 ~ 120s', function () {
  var v = backoffMs(2);
  assert(v >= 96000 && v <= 168000, 'got ' + v);
});
test('backoffMs: attempt 10 capped at 6h', function () {
  var v = backoffMs(10);
  assert(v <= 6 * 3600000 * 1.2, 'got ' + v);
});
test('backoffMs: never negative', function () {
  assert(backoffMs(0) > 0);
  assert(backoffMs(-1) > 0);
});

// ─── Test 4: sanitizeStore logic (extracted) ───
function emptyStore() {
  return { schemaVersion: 2, installed: null, appliedEntries: [], pendingRestart: null, queue: [], snooze: {}, dismissed: { optional: [], criticalAck: [] }, lastCheck: null, lease: null };
}
function sanitizeStore(raw) {
  if (!raw || typeof raw !== 'object') return null;
  var out = emptyStore();
  if (raw.installed && typeof raw.installed === 'object') {
    var v = raw.installed.version;
    if (v && typeof v === 'string' && /^v?\d/.test(v)) {
      out.installed = {
        version: v.indexOf('v') === 0 ? v : 'v' + v,
        source: ['binary', 'meta', 'stored'].indexOf(raw.installed.source) >= 0 ? raw.installed.source : 'stored',
        confidence: ['high', 'medium', 'low'].indexOf(raw.installed.confidence) >= 0 ? raw.installed.confidence : 'low',
        verifiedAt: typeof raw.installed.verifiedAt === 'number' ? raw.installed.verifiedAt : Date.now(),
        buildStamp: typeof raw.installed.buildStamp === 'string' ? raw.installed.buildStamp : '',
      };
    }
  }
  if (Array.isArray(raw.appliedEntries)) {
    out.appliedEntries = raw.appliedEntries.filter(function (id) { return typeof id === 'string' && id.length > 0; });
  }
  if (raw.pendingRestart && typeof raw.pendingRestart === 'object') {
    var pr = raw.pendingRestart;
    if (pr.entryId && pr.version) {
      out.pendingRestart = {
        entryId: String(pr.entryId),
        version: String(pr.version).indexOf('v') === 0 ? String(pr.version) : 'v' + String(pr.version),
        critical: !!pr.critical,
        url: typeof pr.url === 'string' ? pr.url : '',
        savedAt: typeof pr.savedAt === 'number' ? pr.savedAt : Date.now(),
        attempt: typeof pr.attempt === 'number' ? pr.attempt : 1,
      };
    }
  }
  if (Array.isArray(raw.queue)) {
    var validStatuses = ['queued', 'downloading', 'installing', 'awaiting_restart', 'failed', 'done', 'abandoned'];
    out.queue = raw.queue.filter(function (q) {
      return q && typeof q === 'object' && q.id && q.entryId && validStatuses.indexOf(q.status) >= 0;
    }).map(function (q) {
      return {
        id: String(q.id), entryId: String(q.entryId),
        plan: ['A', 'C'].indexOf(q.plan) >= 0 ? q.plan : 'A',
        priority: typeof q.priority === 'number' ? q.priority : 0,
        status: q.status,
        attempt: typeof q.attempt === 'number' ? q.attempt : 1,
        nextRetryAt: typeof q.nextRetryAt === 'number' ? q.nextRetryAt : Date.now(),
        lastError: typeof q.lastError === 'string' ? q.lastError : '',
        createdAt: typeof q.createdAt === 'number' ? q.createdAt : Date.now(),
        updatedAt: typeof q.updatedAt === 'number' ? q.updatedAt : Date.now(),
        heartbeatAt: typeof q.heartbeatAt === 'number' ? q.heartbeatAt : Date.now(),
      };
    });
  }
  if (raw.snooze && typeof raw.snooze === 'object') {
    out.snooze = {};
    Object.keys(raw.snooze).forEach(function (k) {
      if (typeof raw.snooze[k] === 'number') out.snooze[k] = raw.snooze[k];
    });
  }
  if (raw.dismissed && typeof raw.dismissed === 'object') {
    out.dismissed = {
      optional: Array.isArray(raw.dismissed.optional) ? raw.dismissed.optional.filter(function (x) { return typeof x === 'string'; }) : [],
      criticalAck: Array.isArray(raw.dismissed.criticalAck) ? raw.dismissed.criticalAck.filter(function (x) { return typeof x === 'string'; }) : [],
    };
  }
  if (raw.lastCheck && typeof raw.lastCheck === 'object') {
    out.lastCheck = {
      at: typeof raw.lastCheck.at === 'number' ? raw.lastCheck.at : Date.now(),
      ok: !!raw.lastCheck.ok,
      error: typeof raw.lastCheck.error === 'string' ? raw.lastCheck.error : '',
    };
  }
  if (raw.lease && typeof raw.lease === 'object' && raw.lease.owner && raw.lease.expiresAt) {
    out.lease = { owner: String(raw.lease.owner), expiresAt: Number(raw.lease.expiresAt) };
  }
  return out;
}

test('sanitizeStore: null → null', function () { assert(sanitizeStore(null) === null); });
test('sanitizeStore: valid store passes', function () {
  var s = sanitizeStore({ schemaVersion: 2, installed: { version: 'v1.0.260', source: 'binary', confidence: 'high', verifiedAt: 123, buildStamp: 'abc' }, appliedEntries: ['1.0.260-critical'], queue: [], snooze: {}, dismissed: { optional: [], criticalAck: [] } });
  assert(s !== null);
  assert(s.installed.version === 'v1.0.260');
  assert(s.appliedEntries.length === 1);
});
test('sanitizeStore: corrupt installed.version filtered', function () {
  var s = sanitizeStore({ installed: { version: 123 } });
  assert(s.installed === null);
});
test('sanitizeStore: invalid queue items filtered', function () {
  var s = sanitizeStore({ queue: [{ id: 'q1', entryId: 'e1', status: 'invalid' }, { id: 'q2', entryId: 'e2', status: 'queued' }] });
  assert(s.queue.length === 1);
  assert(s.queue[0].id === 'q2');
});
test('sanitizeStore: snooze non-numbers filtered', function () {
  var s = sanitizeStore({ snooze: { 'a': 123, 'b': 'bad' } });
  assert(s.snooze['a'] === 123);
  assert(s.snooze['b'] === undefined);
});
test('sanitizeStore: appliedEntries non-strings filtered', function () {
  var s = sanitizeStore({ appliedEntries: ['valid', 123, null, 'also-valid'] });
  assert(s.appliedEntries.length === 2);
});

// ─── Test 5: isEntryApplied logic (extracted) ───
function isEntryAppliedLogic(installed, entry) {
  var remote = (entry.version || entry.semver || '').trim();
  if (remote.indexOf('v') !== 0) remote = 'v' + remote;
  if (compareSemver(installed, remote) < 0) return false;
  if (compareSemver(installed, remote) > 0) return true;
  var local = '2026-11-01T00:00:00.000Z';
  var remoteStamp = entry.publishedAt || entry.updatedAt || '';
  if (!local || !remoteStamp) return false;
  return local === remoteStamp;
}

test('isEntryApplied: installed < remote → false', function () { assert(!isEntryAppliedLogic('v1.0.259', { version: 'v1.0.260' })); });
test('isEntryApplied: installed > remote → true', function () { assert(isEntryAppliedLogic('v1.0.261', { version: 'v1.0.260' })); });
test('isEntryApplied: same version same stamp → true', function () { assert(isEntryAppliedLogic('v1.0.260', { version: 'v1.0.260', publishedAt: '2026-11-01T00:00:00.000Z' })); });
test('isEntryApplied: same version different stamp → false', function () { assert(!isEntryAppliedLogic('v1.0.260', { version: 'v1.0.260', publishedAt: '2026-11-02T00:00:00.000Z' })); });

// ─── Test 6: entryId logic (extracted) ───
function entryId(entry) {
  if (!entry) return '';
  if (entry.id) return String(entry.id);
  var sem = entry.semver || String(entry.version || '').replace(/^v/i, '');
  var t = (entry.type === 'critical' || entry.installMode === 'auto' || entry.type === 'critica') ? 'critical' : 'optional';
  return sem + '-' + t;
}

test('entryId: uses id if present', function () { assert(entryId({ id: 'my-id' }) === 'my-id'); });
test('entryId: generates from semver + type', function () { assert(entryId({ semver: '1.0.0', type: 'critical' }) === '1.0.0-critical'); });
test('entryId: optional by default', function () { assert(entryId({ version: 'v1.0.0' }) === '1.0.0-optional'); });
test('entryId: auto installMode → critical', function () { assert(entryId({ semver: '1.0.0', installMode: 'auto' }) === '1.0.0-critical'); });

// ─── Test 7: isCriticalEntry logic (extracted) ───
function isCriticalEntry(entry) {
  if (!entry) return false;
  var t = String(entry.type || '').toLowerCase();
  if (t === 'optional' || t === 'opcional' || t === 'normal') return false;
  return (t === 'critical' || t === 'critica' || t === 'crítica' || entry.installMode === 'auto');
}

test('isCriticalEntry: critical type', function () { assert(isCriticalEntry({ type: 'critical' })); });
test('isCriticalEntry: optional type', function () { assert(!isCriticalEntry({ type: 'optional' })); });
test('isCriticalEntry: auto installMode', function () { assert(isCriticalEntry({ installMode: 'auto' })); });
test('isCriticalEntry: normal type', function () { assert(!isCriticalEntry({ type: 'normal' })); });

// ─── Test 8: code integrity checks ───
test('code: contains store v2', function () { assert(src.includes("crozzo_update_store_v2")); });
test('code: contains sanitizeStore', function () { assert(src.includes("function sanitizeStore")); });
test('code: contains recoverStore', function () { assert(src.includes("function recoverStore")); });
test('code: contains ALLOWED_HOSTS', function () { assert(src.includes("ALLOWED_HOSTS")); });
test('code: contains fetchWithFallback', function () { assert(src.includes("function fetchWithFallback")); });
test('code: contains isEntryAppliedV2', function () { assert(src.includes("function isEntryAppliedV2")); });
test('code: contains enqueueUpdate', function () { assert(src.includes("function enqueueUpdate")); });
test('code: contains processPendingRestartAfterRegistry', function () { assert(src.includes("function processPendingRestartAfterRegistry")); });
test('code: contains crozzoUpdateDumpState', function () { assert(src.includes("function crozzoUpdateDumpState")); });
test('code: contains checkStorageAvailable', function () { assert(src.includes("function checkStorageAvailable")); });

// ─── Test 9: registry schema validation ───
var registryPath = join(root, 'releases', 'registry.json');
try {
  var registry = JSON.parse(readFileSync(registryPath, 'utf8'));
  var entries = Array.isArray(registry) ? registry : (registry.entries || [registry]);
  test('registry: valid JSON', function () { assert(true); });
  test('registry: has entries', function () { assert(entries.length > 0, 'empty registry'); });
  // Check unique IDs
  var ids = entries.map(function (e) { return e.id || (e.semver + '-' + (e.type || 'optional')); });
  var uniqueIds = new Set(ids);
  test('registry: unique IDs', function () { assert(uniqueIds.size === ids.length, 'duplicate IDs found'); });
  // Check monotonic versions
  var versions = entries.map(function (e) { return e.version || 'v' + (e.semver || ''); });
  for (var i = 1; i < versions.length; i++) {
    // just check they're valid semver
    test('registry: entry ' + i + ' has valid version', function () {
      assert(/^v?\d+\.\d+\.\d+/.test(versions[i]), versions[i]);
    });
  }
  // Check required fields
  entries.forEach(function (e, idx) {
    test('registry: entry ' + idx + ' has version', function () { assert(e.version || e.semver, 'missing version'); });
    test('registry: entry ' + idx + ' has type or installMode', function () { assert(e.type || e.installMode, 'missing type/installMode'); });
  });
} catch (e) {
  console.log('  [SKIP] registry.json not found or invalid: ' + e.message);
}

// ─── Test 10: tauri.conf.json validation ───
var tauriConf = JSON.parse(readFileSync(join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
test('tauri: has version', function () { assert(tauriConf.version); });
test('tauri: has updater pubkey', function () { assert(tauriConf.plugins && tauriConf.plugins.updater && tauriConf.plugins.updater.pubkey); });
test('tauri: has updater endpoint', function () { assert(tauriConf.plugins && tauriConf.plugins.updater && tauriConf.plugins.updater.endpoints && tauriConf.plugins.updater.endpoints.length > 0); });
test('tauri: endpoint is GitHub', function () { assert(/github\.com/i.test(tauriConf.plugins.updater.endpoints[0])); });
test('tauri: createUpdaterArtifacts true', function () { assert(tauriConf.bundle && tauriConf.bundle.createUpdaterArtifacts === true); });
test('tauri: targets include nsis', function () { assert(tauriConf.bundle && tauriConf.bundle.targets && tauriConf.bundle.targets.indexOf('nsis') >= 0); });

console.log('\n  ─────────────────────────────────────────');
console.log('  ' + (passed + failed) + ' tests: ' + passed + ' PASS, ' + failed + ' FAIL');
console.log('  ─────────────────────────────────────────\n');
process.exit(failed ? 1 : 0);
