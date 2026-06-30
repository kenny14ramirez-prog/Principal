/**
 * Auditoría estática: tablas/columnas que el código JS usa vs scripts SQL embebidos.
 *   node scripts/_supabase-schema-audit.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const REQUIRED_TABLES = [
  'products',
  'sales',
  'comandas',
  'devices',
  'company_config',
  'pos_staff',
  'clients',
  'sync_queue',
  'shift_closes',
  'profiles',
  'crozzo_sede_runtime',
  'crozzo_mesa_runtime',
  'crozzo_device_qr_slots',
  'crozzo_business_registry',
  'crozzo_crm_registro_tokens',
  'crozzo_crm_registro_intake',
];

const REQUIRED_IN_SCRIPT = {
  crozzo_sede_runtime: 10,
  crozzo_mesa_runtime: 10,
  crozzo_crm_registro_tokens: 10,
  crozzo_crm_registro_intake: 10,
  crozzo_device_qr_slots: 15,
  crozzo_business_registry: 14,
};

function loadScripts() {
  const ctx = {};
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'app/modules/CrozzoSupabaseSqlBundles.js'), 'utf8'), ctx, {
    filename: 'bundles.js',
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'app/modules/CrozzoSupabaseSqlExtras.js'), 'utf8'), ctx, {
    filename: 'extras.js',
  });
  let all = [];
  if (ctx.CrozzoSupabaseSqlBundles) all = all.concat(ctx.CrozzoSupabaseSqlBundles.list());
  if (ctx.CrozzoSupabaseSqlExtras) all = all.concat(ctx.CrozzoSupabaseSqlExtras.list());
  all.sort((a, b) => (a.order || 0) - (b.order || 0));
  return all;
}

function tableInSql(sql, table) {
  const re = new RegExp('create\\s+table\\s+if\\s+not\\s+exists\\s+public\\.' + table + '\\b', 'i');
  return re.test(sql);
}

function combinedSqlUpTo(scripts, maxOrder) {
  return scripts
    .filter((s) => (s.order || 0) <= maxOrder)
    .map((s) => s.sql || '')
    .join('\n');
}

const scripts = loadScripts();
const requiredScripts = scripts.filter((s) => s.required);
const freshSql = requiredScripts.map((s) => s.sql).join('\n');

let fail = 0;
const lines = [];

REQUIRED_TABLES.forEach((table) => {
  const minOrder = REQUIRED_IN_SCRIPT[table] || 1;
  const sql = combinedSqlUpTo(scripts, minOrder);
  const ok = tableInSql(sql, table);
  lines.push((ok ? 'OK' : 'FAIL') + '  tabla ' + table + ' (script ≤' + minOrder + ')');
  if (!ok) fail++;
});

const rtTables = ['crozzo_sede_runtime', 'crozzo_mesa_runtime', 'comandas', 'crozzo_device_qr_slots'];
const script10 = scripts.find((s) => s.key === 'pos_runtime');
const script15 = scripts.find((s) => s.key === 'device_qr_slots');
const sql10 = script10 ? script10.sql : '';
const sql15 = script15 ? script15.sql : '';

rtTables.forEach((t) => {
  const in10 =
    sql10.includes('add table public.' + t) ||
    sql10.includes("tablename = '" + t + "'") ||
    sql10.includes('public.' + t);
  const in15 = t === 'crozzo_device_qr_slots' ? sql15.includes('supabase_realtime') : true;
  const ok = t === 'crozzo_device_qr_slots' ? in15 : in10;
  lines.push((ok ? 'OK' : 'FAIL') + '  realtime ' + t);
  if (!ok) fail++;
});

const grantsOk =
  sql10.includes('crozzo_fix_all_grants') &&
  sql10.includes('crozzo_enable_pos_rls') &&
  (script15 ? script15.sql.includes('crozzo_fix_all_grants') : true);
lines.push((grantsOk ? 'OK' : 'FAIL') + '  RLS + grants en scripts críticos');
if (!grantsOk) fail++;

const staffBid =
  freshSql.includes('pos_staff') &&
  (freshSql.includes('business_id text') || freshSql.includes("business_id', 'text'"));
lines.push((staffBid ? 'OK' : 'FAIL') + '  pos_staff.business_id en scripts obligatorios');
if (!staffBid) fail++;

const dupOrders = {};
scripts.forEach((s) => {
  const o = s.order || 0;
  dupOrders[o] = (dupOrders[o] || 0) + 1;
});
const dupOk = !Object.values(dupOrders).some((n) => n > 1);
lines.push((dupOk ? 'OK' : 'FAIL') + '  números de orden únicos (' + scripts.length + ' scripts)');
if (!dupOk) fail++;

console.log('=== Supabase schema audit ===');
lines.forEach((l) => console.log(l));
console.log('---');
console.log(fail === 0 ? 'RESULTADO: ' + lines.length + '/' + lines.length + ' OK' : 'RESULTADO: ' + fail + ' fallo(s)');
process.exit(fail ? 1 : 0);
