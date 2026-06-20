import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mainPath = path.join(root, 'app/core/CrozzoPosMain.js');
const outPath = path.join(root, 'app/modules/CrozzoPrinterRescue.js');

const lines = fs.readFileSync(mainPath, 'utf8').split(/\r?\n/);
const dbStart = lines.findIndex((l) => l.includes('/** Catálogo rescate impresoras'));
const dbEnd = lines.findIndex((l, i) => i > dbStart && l.startsWith('let products = ['));
const uiStart = lines.findIndex((l) => l.includes('function crozzoPrinterRescueModalRoot()'));
const uiEnd = lines.findIndex((l, i) => i > uiStart && l.startsWith('function crozzoFacturasAdminPersistPrinters'));

if (dbStart < 0 || dbEnd < 0 || uiStart < 0 || uiEnd < 0) {
  console.error('markers not found', { dbStart, dbEnd, uiStart, uiEnd });
  process.exit(1);
}

const dbBlock = lines.slice(dbStart, dbEnd);
const uiBlock = lines.slice(uiStart, uiEnd);

const moduleSrc =
  '(function (global) {\n' +
  "  'use strict';\n" +
  dbBlock.join('\n') +
  '\n' +
  uiBlock.join('\n') +
  '\n  global.CrozzoPrinterRescue = { open: openPrinterRescue };\n' +
  "})(typeof window !== 'undefined' ? window : globalThis);\n";

fs.writeFileSync(outPath, moduleSrc);

const stub = [
  'function openPrinterRescue(source) {',
  '  if (window.CrozzoPrinterRescue && typeof window.CrozzoPrinterRescue.open === "function") {',
  '    return window.CrozzoPrinterRescue.open(source);',
  '  }',
  '  if (typeof showToast === "function") showToast("Asistente de impresora no disponible. Recargue la app.", "warning");',
  '}',
  'window.openPrinterRescue = openPrinterRescue;',
];

const newLines = [
  ...lines.slice(0, dbStart),
  ...stub,
  ...lines.slice(dbEnd, uiStart),
  ...lines.slice(uiEnd),
];

fs.writeFileSync(mainPath, newLines.join('\n'));
console.log('Extracted module:', outPath);
console.log('Main lines:', lines.length, '->', newLines.length);
