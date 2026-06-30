/**
 * Corrige comillas rotas en script 1 (config_json) y valida SQL embebido.
 *   node scripts/fix-supabase-sql-quotes.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundlesPath = path.join(root, 'app/modules/CrozzoSupabaseSqlBundles.js');

let src = fs.readFileSync(bundlesPath, 'utf8');

const BAD = [
  "perform public.crozzo_add_col_if_missing('devices', 'config_json', 'jsonb default '{}'::jsonb');",
  "perform public.crozzo_add_col_if_missing('devices', 'config_json', 'jsonb default \\'{}\\'::jsonb');",
];
const GOOD =
  "perform public.crozzo_add_col_if_missing('devices', 'config_json', 'jsonb');";

let fixed = false;
for (const bad of BAD) {
  if (src.includes(bad)) {
    src = src.split(bad).join(GOOD);
    fixed = true;
    console.log('Corregido fragmento config_json');
  }
}

if (!fixed && !src.includes(GOOD)) {
  console.warn('WARN: no se encontró línea config_json — revisar manualmente');
} else if (!fixed) {
  console.log('OK: config_json ya estaba correcto');
} else {
  fs.writeFileSync(bundlesPath, src, 'utf8');
  console.log('Bundles guardado');
}

// Validación: extraer SQL script 1 y buscar patrones rotos
const match = src.match(/"key":"editor"[\s\S]*?"sql":"([\s\S]*?)"\s*,\s*"required"/);
if (match) {
  const sql = match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
  const broken = /crozzo_add_col_if_missing\([^)]*jsonb default '\{\}'::jsonb/.test(sql);
  const hasRls = sql.includes('create or replace function public.crozzo_enable_pos_rls');
  console.log('Validación script 1: crozzo_enable_pos_rls definida =', hasRls);
  console.log('Validación script 1: comillas config_json rotas =', broken);
  if (broken) {
    console.error('FAIL: aún hay comillas rotas');
    process.exit(1);
  }
}

process.exit(0);
