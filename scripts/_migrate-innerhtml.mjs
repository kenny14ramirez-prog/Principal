#!/usr/bin/env node
/**
 * Migración automática de innerHTML a CrozzoSanitize.sanitizeHtml (PoC).
 * Solo procesa archivos en app/ (excluye bundles/). Modo dry-run por defecto.
 * Uso: node scripts/_migrate-innerhtml.mjs [--apply]
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';

const root = join(process.cwd(), 'app');
const apply = process.argv.includes('--apply');
let totalReplaced = 0;
const filesChanged = [];

function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'bundles' || e.name === 'vendor') continue;
      walk(p);
    } else if (extname(e.name) === '.js' || extname(e.name) === '.html') {
      let content = readFileSync(p, 'utf8');
      // Regex conservador: .innerHTML = <expr>;  (expr sin ; anidado)
      const regex = /(\.innerHTML\s*=\s*)([^;]+)(;)/g;
      let changed = false;
      const newContent = content.replace(regex, (match, lhs, expr, semi) => {
        // Evitar doble wrap
        if (expr.includes('CrozzoSanitize.sanitizeHtml')) return match;
        // Evitar expresiones ya seguras (literales vacíos, números)
        if (/^\s*(['"`])\s*\1\s*$/.test(expr)) return match;
        totalReplaced++;
        changed = true;
        return lhs + 'CrozzoSanitize.sanitizeHtml(' + expr.trim() + ')' + semi;
      });
      if (changed && apply) {
        writeFileSync(p, newContent, 'utf8');
        filesChanged.push(relative(process.cwd(), p));
      } else if (changed) {
        filesChanged.push(relative(process.cwd(), p));
      }
    }
  }
}
walk(root);

console.log('Migración innerHTML' + (apply ? ' (APLICADA)' : ' (DRY-RUN)'));
console.log('Total reemplazos:', totalReplaced);
console.log('Archivos afectados:', filesChanged.length);
filesChanged.slice(0, 20).forEach(f => console.log('  ' + f));
if (!apply) console.log('\nEjecutar con --apply para aplicar cambios.');
process.exit(0);
