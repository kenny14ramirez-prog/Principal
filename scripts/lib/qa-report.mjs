/**
 * Reportes JSON para pruebas operativas QA.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
export const QA_OUT_DIR = join(root, 'scripts', '_qa-out');

export function ensureQaOutDir() {
  mkdirSync(QA_OUT_DIR, { recursive: true });
}

export function createReport(scenarioId) {
  return {
    scenario: scenarioId,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    ok: false,
    steps: [],
    errors: [],
    context: {},
  };
}

export function stepOk(report, id, label, detail) {
  report.steps.push({
    id,
    label,
    ok: true,
    at: new Date().toISOString(),
    detail: detail || null,
  });
}

export function stepFail(report, id, label, error, detail) {
  const msg = error instanceof Error ? error.message : String(error || 'fallo');
  report.steps.push({
    id,
    label,
    ok: false,
    at: new Date().toISOString(),
    error: msg,
    detail: detail || null,
  });
  report.errors.push({ step: id, message: msg, detail: detail || null });
}

export function finalizeReport(report, ok) {
  report.ok = ok === undefined ? report.errors.length === 0 : !!ok;
  report.finishedAt = new Date().toISOString();
  return report;
}

export function writeReport(report, basename) {
  ensureQaOutDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const stamped = join(QA_OUT_DIR, `${basename}-${stamp}.json`);
  const latest = join(QA_OUT_DIR, `${basename}-latest.json`);
  const body = JSON.stringify(report, null, 2);
  writeFileSync(stamped, body, 'utf8');
  writeFileSync(latest, body, 'utf8');
  return { stamped, latest };
}
