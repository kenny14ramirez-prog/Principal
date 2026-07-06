/**
 * Runner Hora Maestra — pasos, observaciones, métricas humanas.
 */
import { writeReport, finalizeReport } from './qa-report.mjs';

export function createMasterReport(intensity) {
  return {
    scenario: 'hora-maestra-operativo-oro',
    version: 1,
    intensity: intensity.key,
    intensityLabel: intensity.label,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    ok: false,
    humanPsychology: {
      premise:
        'El sistema debe acompañar al humano orgánico: novato y experto, por rol, con errores esperables y abuso sin colapsar.',
      psycheModule: 'CrozzoOperativePsyche',
      companionModule: 'CrozzoOperativeCompanion',
      journalKey: 'crozzo_operative_journal_v1',
      personasTested: [],
      adversarialOutcomes: [],
      comfortSignals: [],
    },
    observations: [],
    metrics: { stepsOk: 0, stepsWarn: 0, stepsFail: 0, durationMs: 0 },
    phases: [],
    steps: [],
    errors: [],
    context: {},
    actionChains: null,
  };
}

export function observe(report, level, area, message, detail) {
  report.observations.push({
    level,
    area,
    message,
    detail: detail || null,
    at: new Date().toISOString(),
  });
  if (level === 'warn') report.metrics.stepsWarn++;
}

export function phaseStart(report, id, title) {
  const p = { id, title, startedAt: new Date().toISOString(), steps: [] };
  report.phases.push(p);
  return p;
}

export function runStep(report, phase, id, label, fn, opts) {
  opts = opts || {};
  const step = { id, label, ok: null, at: new Date().toISOString() };
  return Promise.resolve()
    .then(fn)
    .then((detail) => {
      step.ok = true;
      step.detail = detail || null;
      report.steps.push(step);
      if (phase) phase.steps.push(step);
      report.metrics.stepsOk++;
      const mark = opts.soft ? '~' : '✓';
      console.log(`    ${mark} ${label}`);
      return detail;
    })
    .catch((e) => {
      step.ok = false;
      step.error = e.message || String(e);
      step.detail = opts.detailOnFail || null;
      report.steps.push(step);
      if (phase) phase.steps.push(step);
      report.errors.push({ step: id, phase: phase && phase.id, message: step.error });
      if (opts.soft) {
        report.metrics.stepsWarn++;
        observe(report, 'warn', phase && phase.id, label + ' (blando)', step.error);
        console.log(`    ~ ${label}: ${step.error}`);
        return null;
      }
      report.metrics.stepsFail++;
      console.error(`    ✗ ${label}: ${step.error}`);
      throw e;
    });
}

export function printBanner(intensity) {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  CROZZO POS · HORA MAESTRA · Escenario Oro + Matriz Humana     ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Intensidad: ${(intensity.label + ' (' + intensity.key + ')').padEnd(47)}║`);
  console.log('║  Psique · Companion · Cadenas de acción · Abuso              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
}

export function finishMasterReport(report, ok) {
  report.finishedAt = new Date().toISOString();
  report.metrics.durationMs = Date.now() - new Date(report.startedAt).getTime();
  finalizeReport(report, ok);
  const primary = writeReport(report, 'hora-maestra-oro');
  writeReport(report, 'operativo-oro');
  return primary;
}
