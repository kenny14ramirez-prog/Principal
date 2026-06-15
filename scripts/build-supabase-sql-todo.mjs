/**
 * Genera UN solo archivo SQL con TODOS los scripts (1–12) en orden, para pegar
 * una sola vez en el SQL Editor de Supabase y crear toda la base de datos.
 *
 *   node scripts/build-supabase-sql-todo.mjs
 *   -> docs/SUPABASE-SQL-TODO.sql
 *
 * Se arma desde los mismos bundles que usa la app (idéntico a lo que verías en
 * Super Admin → Nube → Paso 2), así nunca queda desfasado.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadModule(rel, ctx) {
  vm.runInContext(fs.readFileSync(path.join(root, rel), 'utf8'), ctx, { filename: rel });
}

const ctx = {};
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
loadModule('app/modules/CrozzoSupabaseSqlBundles.js', ctx);
loadModule('app/modules/CrozzoSupabaseSqlExtras.js', ctx);

let all = [];
if (ctx.CrozzoSupabaseSqlBundles && typeof ctx.CrozzoSupabaseSqlBundles.list === 'function') {
  all = all.concat(ctx.CrozzoSupabaseSqlBundles.list());
}
if (ctx.CrozzoSupabaseSqlExtras && typeof ctx.CrozzoSupabaseSqlExtras.list === 'function') {
  all = all.concat(ctx.CrozzoSupabaseSqlExtras.list());
}
all.sort((a, b) => (a.order || 0) - (b.order || 0));

const lines = [];
lines.push('-- =============================================================================');
lines.push('-- CROZZO POS — BASE DE DATOS COMPLETA (TODO EN UNO)');
lines.push('-- Generado: ' + new Date().toISOString());
lines.push('-- Pega TODO este archivo en: Supabase → SQL Editor → New query → Run (▶).');
lines.push('-- Crea todas las tablas, funciones, RLS y Realtime de los ' + all.length + ' scripts.');
lines.push('-- Es idempotente: puedes ejecutarlo varias veces sin romper nada.');
lines.push('-- =============================================================================');
lines.push('');
lines.push('-- Orden de scripts incluidos:');
all.forEach((s) => {
  lines.push('--   ' + String(s.order).padStart(2, ' ') + '. ' + s.title + (s.required ? '  [OBLIGATORIO]' : '  [opcional]'));
});
lines.push('');

for (const s of all) {
  lines.push('');
  lines.push('-- =============================================================================');
  lines.push('-- SCRIPT ' + s.order + ' — ' + s.title + (s.required ? '  [OBLIGATORIO]' : '  [opcional]'));
  lines.push('-- ' + (s.desc || ''));
  lines.push('-- =============================================================================');
  lines.push('');
  lines.push(String(s.sql || '').replace(/\r\n/g, '\n').trim());
  lines.push('');
}

lines.push('');
lines.push('-- =============================================================================');
lines.push('-- FIN. Verifica en la app: Super Admin → Nube → "Comprobar tablas".');
lines.push('-- Luego en la caja: "Subir catálogo a la nube".');
lines.push('-- =============================================================================');

const out = path.join(root, 'docs', 'SUPABASE-SQL-TODO.sql');
fs.writeFileSync(out, lines.join('\n'), 'utf8');

console.log('OK -> docs/SUPABASE-SQL-TODO.sql (' + all.length + ' scripts, ' + Math.round(fs.statSync(out).size / 1024) + ' KB)');
all.forEach((s) => console.log('  ' + String(s.order).padStart(2, ' ') + '. ' + s.title + (s.required ? ' [OBLIGATORIO]' : '')));
