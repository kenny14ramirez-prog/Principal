#!/usr/bin/env node
/**
 * Sync remoto no debe reasignar mesaSeleccionada (salto M20 → M2).
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const main = readFileSync(join(root, 'app/core/CrozzoPosMain.js'), 'utf8');
const rtc = readFileSync(join(root, 'app/modules/CrozzoPosRuntimeCloud.js'), 'utf8');

let failed = 0;
function ok(n, d) {
  console.log('OK   ' + n + (d ? ' — ' + d : ''));
}
function fail(n, d) {
  console.log('FAIL ' + n + (d ? ' — ' + d : ''));
  failed++;
}

const skipBlock = main.match(
  /if \(!\(opts && opts\.skipUiFields\)\) \{[\s\S]*?cajaLlevarOrderOpen = !!s\.cajaLlevarOrderOpen;\s*\}/
);
if (!skipBlock) fail('skipUiFields block', 'bloque navegación no encontrado');
else {
  const b = skipBlock[0];
  if (/mesaSeleccionada = assign/.test(b)) ok('mesa dentro skipUiFields', 'remoto no pisa mesa local');
  else fail('mesa dentro skipUiFields', 'mesaSeleccionada fuera del guard');
  if (!/tabletModoPedido = assign/.test(main.split('if (!(opts && opts.skipUiFields))')[0].slice(-500) + b))
    ok('tablet nav en skipUiFields', 'tablet tampoco se pisa');
}

if (/UI_LOCAL_KEYS[\s\S]*?'mesaSeleccionada'/.test(rtc)) ok('meta excluye mesaSeleccionada', 'nube meta limpia');
else fail('meta excluye mesaSeleccionada');

if (/applyPosRuntimeSnapshot\(pay, \{ skipUiFields: true/.test(rtc)) ok('applyRemoteRow skipUiFields', 'ruta cloud correcta');
else fail('applyRemoteRow skipUiFields');

console.log('\n' + (failed ? failed + ' fallo(s)\n' : '0 fallos — mesa-ui-remote-check OK\n'));
process.exit(failed ? 1 : 0);
