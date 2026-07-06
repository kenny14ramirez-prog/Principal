import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '../_qa-out');

export function initFleetReport(intensity) {
  return {
    at: new Date().toISOString(),
    suite: 'fleet-escala',
    intensity: intensity.label,
    preset: { pcs: intensity.pcs, tablets: intensity.tablets },
    designCeiling: 100,
    policy: {
      superadminInOperationalFlows: false,
      note: 'KENNY/superadmin solo en auditorías dedicadas, nunca en caja/tablet/comandas',
    },
    connectivityTopology: null,
    connectivityLayers: [],
    horizons: [],
    salonRealista: null,
    adversarial: [],
    summary: { passed: 0, failed: 0, ok: false },
  };
}

export function recordLayer(report, layer, result) {
  report.connectivityLayers.push({ ...layer, ...result });
  if (result.ok) report.summary.passed++;
  else report.summary.failed++;
}

export function recordHorizonTier(report, horizon, tierResult) {
  let h = report.horizons.find((x) => x.id === horizon.id);
  if (!h) {
    h = { id: horizon.id, label: horizon.label, tiers: [] };
    report.horizons.push(h);
  }
  h.tiers.push(tierResult);
  if (tierResult.ok) report.summary.passed++;
  else report.summary.failed++;
}

export function finishFleetReport(report) {
  report.summary.ok = report.summary.failed === 0;
  mkdirSync(outDir, { recursive: true });
  const path = join(outDir, 'fleet-escala-latest.json');
  writeFileSync(path, JSON.stringify(report, null, 2), 'utf8');
  console.log('\nReporte flota: ' + path);
  console.log(
    'Resumen flota: OK=' +
      report.summary.passed +
      ' FAIL=' +
      report.summary.failed +
      (report.summary.ok ? ' · APROBADA' : ' · REVISAR')
  );
  return path;
}
