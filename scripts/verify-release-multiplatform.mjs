#!/usr/bin/env node
/**
 * CI / local: un release debe incluir Win + Mac + Android para ser estable en todos los dispositivos.
 * Uso: node scripts/verify-release-multiplatform.mjs v1.0.36
 */
import { evaluateReleaseStability, norm } from './lib/release-artifact-checks.mjs';

const tag = String(process.argv[2] || '').trim();
if (!tag) {
  console.error('Uso: node scripts/verify-release-multiplatform.mjs v1.0.36');
  process.exit(1);
}

const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
const report = await evaluateReleaseStability(tag, token);

console.log('');
console.log('  Verificación multiplataforma —', report.version);
console.log('  =================================================');
console.log('  Windows (.exe):', report.windows.ok ? 'OK' : 'FALLO', report.windows.name || '(ausente)');
console.log('  macOS (.dmg):  ', report.mac.ok ? 'OK' : 'FALLO', report.mac.arm || report.mac.intel || report.mac.any || '(ausente)');
console.log('  Android (.apk):', report.android.ok ? 'OK' : 'FALLO', report.android.name || '(ausente)');
console.log('  latest.json:   ', report.latestJson.ok ? 'OK' : 'FALLO', report.latestJson.windowsExe ? 'setup.exe' : 'revisar URL');
console.log('');

if (!report.tagFound) {
  console.error('  FALLO: tag no encontrado en GitHub.');
  process.exit(1);
}

const failures = [];
if (!report.windows.ok) failures.push('Falta setup.exe válido (≥400 KB)');
if (!report.mac.ok) failures.push('Falta .dmg macOS (aarch64 o x86_64)');
if (!report.android.ok) failures.push('Falta .apk Android ARM');
if (!report.latestJson.ok || !report.latestJson.windowsExe) {
  failures.push('latest.json incompleto o apunta a MSI en lugar de setup.exe');
}

if (failures.length) {
  console.error('  FALLO — release NO listo para todos los dispositivos:');
  failures.forEach((f) => console.error('    • ' + f));
  console.error('');
  console.error('  Espere a que terminen todos los jobs de GitHub Actions (Windows, Mac, Android).');
  process.exit(1);
}

console.log('  OK — Release estable para PC Windows, Mac y tablets Android.');
console.log('  Navegador / iOS: OTA vía registry.json + recarga (no requiere .exe).');
console.log('');
process.exit(0);
