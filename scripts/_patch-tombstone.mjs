import { readFileSync, writeFileSync } from 'node:fs';
const p = 'app/modules/CrozzoPosRuntimeCloud.js';
let s = readFileSync(p, 'utf8');
const needle = 'localClosed[ref]) return;';
const i = s.indexOf(needle);
console.log('found at', i);
if (i !== -1) {
  const j = s.indexOf('\n', i) + 1;
  const insert = "         // Fase 0: tombstone check\n         if (global.CrozzoTombstonesIntegration && typeof global.CrozzoTombstonesIntegration.isDeleted === \"function\" && global.CrozzoTombstonesIntegration.isDeleted(tipo, ref)) return;\n";
  s = s.slice(0, j) + insert + s.slice(j);
  writeFileSync(p, s, 'utf8');
  console.log('done');
}
