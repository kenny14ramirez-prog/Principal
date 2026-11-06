#!/usr/bin/env node
// Coherencia entre inventario RLS y draft SQL (Fase 1).
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const sql = fs.readFileSync(path.join(root, 'docs/SUPABASE-SQL-RLS-HARDENING.sql'), 'utf8');
const inv = fs.readFileSync(path.join(root, 'docs/maps/RLS-INVENTORY.md'), 'utf8');

// Tablas críticas que deben aparecer en el draft
const critical = ['sales','comandas','devices','dian_config','facturas','crozzo_sede_runtime','crozzo_mesa_runtime','crozzo_ai_secrets','profiles','crozzo_pos_owners'];

let ok = true;
for (const t of critical) {
  if (!sql.includes(t)) { console.log('MISSING in SQL draft:', t); ok = false; }
  if (!inv.includes(t)) { console.log('MISSING in inventory:', t); ok = false; }
}
// Verificar funciones private
for (const f of ['user_business_ids','has_business_role','has_location_access']) {
  if (!sql.includes(f)) { console.log('MISSING function:', f); ok = false; }
}
console.log(ok ? 'RLS coherence: PASS' : 'RLS coherence: FAIL');
process.exit(ok ? 0 : 1);
