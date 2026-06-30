/**
 * Sincroniza SQL canónico desde docs/*.sql hacia CrozzoSupabaseSqlExtras.js
 * (evita desfase entre archivos docs y lo que muestra Super Admin → Nube).
 *
 *   node scripts/inject-supabase-sql-docs.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extrasPath = path.join(root, 'app/modules/CrozzoSupabaseSqlExtras.js');

const DOC_MAP = {
  POS_RUNTIME_SQL: 'docs/SUPABASE-SQL-POS-RUNTIME.sql',
  MESA_RUNTIME_SQL: 'docs/SUPABASE-SQL-MESA-RUNTIME-PATCH.sql',
  DEVICE_QR_SLOTS_SQL: 'docs/SUPABASE-SQL-DEVICE-QR-SLOTS.sql',
  BUSINESS_REGISTRY_SQL: 'docs/SUPABASE-SQL-BUSINESS-REGISTRY.sql',
  POS_STAFF_BUSINESS_ID_SQL: 'docs/SUPABASE-SQL-POS-STAFF-BUSINESS-ID.sql',
};

function readDoc(rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) {
    console.warn('WARN: falta', rel);
    return null;
  }
  return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n').trim();
}

function toJsString(sql) {
  return (
    sql
      .split('\n')
      .map((line) => "    '" + line.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "\\n'")
      .join(' +\n') + '\n'
  );
}

function replaceVar(src, varName, sql) {
  if (!sql) return src;
  const startMarker = 'var ' + varName + ' =';
  const start = src.indexOf(startMarker);
  if (start < 0) {
    throw new Error('No se encontró var ' + varName + ' en ' + extrasPath);
  }
  const afterStart = start + startMarker.length;
  const nextVar = src.indexOf('\n\n  var ', afterStart);
  const nextGlobal = src.indexOf('\n\n  global.', afterStart);
  const nextExport = src.indexOf('\n\n  /**', afterStart);
  let end = src.length;
  for (const pos of [nextVar, nextGlobal, nextExport]) {
    if (pos >= 0 && pos < end) end = pos;
  }
  const tail = src.slice(end);
  const head = src.slice(0, start);
  const replacement = startMarker + '\n' + toJsString(sql) + ';';
  return head + replacement + tail;
}

let src = fs.readFileSync(extrasPath, 'utf8');
let n = 0;
for (const [varName, rel] of Object.entries(DOC_MAP)) {
  const sql = readDoc(rel);
  if (!sql) continue;
  src = replaceVar(src, varName, sql);
  n++;
  console.log('OK inject', varName, '<-', rel, '(' + Math.round(sql.length / 1024) + ' KB)');
}

fs.writeFileSync(extrasPath, src, 'utf8');
console.log('Listo:', n, 'bloques inyectados en', extrasPath);
