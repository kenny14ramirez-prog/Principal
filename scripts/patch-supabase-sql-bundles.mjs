/**
 * Parches idempotentes en script 1 embebido (CrozzoSupabaseSqlBundles.js).
 *   node scripts/patch-supabase-sql-bundles.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundlesPath = path.join(root, 'app/modules/CrozzoSupabaseSqlBundles.js');
let src = fs.readFileSync(bundlesPath, 'utf8');

const patches = [
  [
    "perform public.crozzo_add_col_if_missing('pos_staff', 'pin_hash', 'text');\\n  perform public.crozzo_add_col_if_missing('pos_staff', 'updated_at'",
    "perform public.crozzo_add_col_if_missing('pos_staff', 'pin_hash', 'text');\\n  perform public.crozzo_add_col_if_missing('pos_staff', 'business_id', 'text');\\n  perform public.crozzo_add_col_if_missing('pos_staff', 'updated_at'",
  ],
  [
    "perform public.crozzo_add_col_if_missing('devices', 'last_sync_at', 'timestamptz');\\n\\n  perform public.crozzo_add_col_if_missing('company_config'",
    "perform public.crozzo_add_col_if_missing('devices', 'last_sync_at', 'timestamptz');\\n  perform public.crozzo_add_col_if_missing('devices', 'business_id', 'text');\\n  perform public.crozzo_add_col_if_missing('devices', 'presence_json', 'jsonb');\\n  perform public.crozzo_add_col_if_missing('devices', 'meta', 'jsonb');\\n  perform public.crozzo_add_col_if_missing('devices', 'config_json', 'jsonb');\\n\\n  perform public.crozzo_add_col_if_missing('company_config'",
  ],
  [
    "perform public.crozzo_add_col_if_missing('sync_queue', 'payload', 'jsonb default \\'{}\\'::jsonb');\\n\\n  perform public.crozzo_add_col_if_missing('shift_closes'",
    "perform public.crozzo_add_col_if_missing('sync_queue', 'payload', 'jsonb default \\'{}\\'::jsonb');\\n  perform public.crozzo_add_col_if_missing('sync_queue', 'transaction_id', 'text');\\n\\n  perform public.crozzo_add_col_if_missing('shift_closes'",
  ],
  [
    "'company_config', 'pos_staff', 'products', 'clients', 'devices'\\n  ]",
    "'company_config', 'pos_staff', 'products', 'clients', 'devices', 'comandas', 'shift_closes', 'sync_queue'\\n  ]",
  ],
  [
    "create unique index if not exists devices_device_id_unique on public.devices (device_id)\\n  where device_id is not null;\\ncreate index if not exists pos_staff_location_idx",
    "create unique index if not exists devices_device_id_unique on public.devices (device_id)\\n  where device_id is not null;\\ncreate unique index if not exists idx_sync_queue_transaction_id_unique\\n  on public.sync_queue (transaction_id)\\n  where transaction_id is not null and transaction_id <> '';\\ncreate index if not exists pos_staff_location_idx",
  ],
  [
    "create index if not exists pos_staff_location_idx on public.pos_staff (location_id);\\ncreate index if not exists idx_shift_closes_business_date",
    "create index if not exists pos_staff_location_idx on public.pos_staff (location_id);\\ncreate index if not exists idx_pos_staff_business_location\\n  on public.pos_staff (business_id, location_id);\\ncreate index if not exists idx_shift_closes_business_date",
  ],
];

let applied = 0;
for (const [from, to] of patches) {
  if (src.includes(from)) {
    src = src.replace(from, to);
    applied++;
    console.log('OK patch', applied);
  } else if (src.includes(to)) {
    console.log('SKIP ya aplicado:', applied + 1);
    applied++;
  } else {
    console.warn('WARN: no match patch', applied + 1);
  }
}

fs.writeFileSync(bundlesPath, src, 'utf8');
console.log('Bundles actualizado:', applied, 'parches');
