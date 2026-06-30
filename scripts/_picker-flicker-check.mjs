#!/usr/bin/env node
/**
 * Grilla cajero: sin bucle pull↔refresh ni apply cuando picker visible no cambió.
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

if (!/crozzoPullPosRuntimeCloud/.test(main.match(/function crozzoCajeroRefreshSlotPicker[\s\S]*?^}/m)?.[0] || '')) {
  ok('picker sin pull', 'crozzoCajeroRefreshSlotPicker no dispara nube');
} else {
  fail('picker sin pull', 'sigue llamando crozzoPullPosRuntimeCloud');
}

if (/__lastCajeroSlotPickerDomSig/.test(main) && /domSig === __lastCajeroSlotPickerDomSig/.test(main)) {
  ok('picker dom dedupe', 'innerHTML solo si cambió');
} else {
  fail('picker dom dedupe');
}

if (/function crozzoBuildPickerVisibleSig/.test(main) && /window\.crozzoBuildPickerVisibleSig/.test(main)) {
  ok('picker visible sig', 'exportada para runtime-cloud');
} else {
  fail('picker visible sig');
}

if (/samePicker/.test(rtc) && /crozzoBuildPickerVisibleSig/.test(rtc)) {
  ok('applyRemoteRow picker gate', 'descarta si UI grilla igual');
} else {
  fail('applyRemoteRow picker gate');
}

const uiSyncBlock = rtc.match(/var uiQuiet[\s\S]*?return true;\s*\}/);
if (uiSyncBlock && !/uiQuiet[\s\S]*crozzoHandleRemoteRuntimeUiSync/.test(uiSyncBlock[0])) {
  ok('quiet skip ui sync', 'pull silencioso no dispara handleRemoteRuntimeUiSync');
} else if (/if \(!uiQuiet\)[\s\S]*crozzoHandleRemoteRuntimeUiSync/.test(rtc)) {
  ok('quiet skip ui sync', 'handleRemoteRuntimeUiSync gated por uiQuiet');
} else {
  fail('quiet skip ui sync');
}

console.log('\n' + (failed ? failed + ' fallo(s)\n' : '0 fallos — picker-flicker-check OK\n'));
process.exit(failed ? 1 : 0);
