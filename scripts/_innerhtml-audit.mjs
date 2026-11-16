#!/usr/bin/env node
/**
 * Auditoría de innerHTML — cuenta usos y sugiere migración a CrozzoSanitize.sanitizeHtml
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const root = join(process.cwd(), 'app');
let total = 0;
const files = [];

function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (extname(e.name) === '.js' || extname(e.name) === '.html') {
      const content = readFileSync(p, 'utf8');
      const matches = content.match(/\.innerHTML\s*=/g) || [];
      if (matches.length > 0) {
        files.push({ file: p.replace(process.cwd() + '\\', ''), count: matches.length });
        total += matches.length;
      }
    }
  }
}
walk(root);

console.log('Auditoría innerHTML en app/\n');
console.log('Total usos de .innerHTML =:', total);
console.log('Archivos afectados:', files.length);
console.log('');
files.sort((a, b) => b.count - a.count).slice(0, 15).forEach(f => {
  console.log(`  ${f.count.toString().padStart(4)}  ${f.file}`);
});
console.log('');
console.log('Migración: activar feature flag useSanitizeInnerHtml para sanitización automática (monkey-patch).');
console.log('O migrar manualmente: element.innerHTML = CrozzoSanitize.sanitizeHtml(value);');
process.exit(0);
