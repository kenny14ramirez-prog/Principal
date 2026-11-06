import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
const root = process.cwd();
function walk(dir, exts) {
  const out = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p, exts));
    else if (exts.some(e => f.endsWith(e))) out.push(p);
  }
  return out;
}
const files = walk(join(root, 'app'), ['.js', '.html', '.css', '.json']);
let total = 0, strings = 0, idents = 0;
const samples = [];
for (const f of files) {
  const content = readFileSync(f, 'utf8');
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/Crozzo|Crosso|crosso/i.test(l)) {
      total++;
      // string literal containing Crozzo
      if (/'[^']*Crozzo[^']*'|"([^"]*Crozzo[^"]*)"/i.test(l)) strings++;
      else idents++;
      if (samples.length < 40) samples.push(relative(root, f) + ':' + (i+1) + '  ' + l.trim().slice(0, 120));
    }
  }
}
console.log('total lines with Crozzo/Crosso:', total);
console.log('string-literal lines:', strings);
console.log('identifier/other lines:', idents);
console.log('--- samples ---');
samples.forEach(s => console.log(s));