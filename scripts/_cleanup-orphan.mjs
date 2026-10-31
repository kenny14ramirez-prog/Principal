import { readFileSync, writeFileSync } from 'node:fs';
const p = 'app/core/CrozzoPrintService.js';
const lines = readFileSync(p, 'utf8').split(/\r?\n/);
// Encontrar el bloque huérfano: desde la línea que es solo "      bodyW +" después de "  }" de la función
let start = -1, end = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].trim() === 'bodyW +' && i > 0 && lines[i-1].trim() === '}') {
    start = i;
    // buscar el próximo "  }" seguido de "  function"
    for (let j = i; j < lines.length; j++) {
      if (lines[j].trim() === '}' && j+1 < lines.length && /^\s*function /.test(lines[j+1])) {
        end = j;
        break;
      }
    }
    break;
  }
}
console.log('orphan block:', start+1, 'to', end+1);
if (start >= 0 && end >= 0) {
  const newLines = lines.slice(0, start).concat(lines.slice(end + 1));
  writeFileSync(p, newLines.join('\n'), 'utf8');
  console.log('cleaned, removed', end - start + 1, 'lines');
}