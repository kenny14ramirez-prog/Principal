/**
 * Scripts SQL opcionales (runtime sede, federación) — complemento de CrozzoSupabaseSqlBundles.
 */
(function (global) {
  'use strict';

  var FEDERACION_SQL =
    '-- =============================================================================\n' +
    '-- CROZZO POS — Federación: bodegas, remisiones e intercambio entre negocios\n' +
    '-- =============================================================================\n' +
    '-- Ejecutar en CADA proyecto Supabase de cada negocio.\n' +
    '-- Después de: SUPABASE-SQL-EDITOR.sql y SUPABASE-SQL-COSTOS.sql (recomendado).\n' +
    '-- =============================================================================\n\n' +
    'create extension if not exists "pgcrypto" with schema extensions;\n\n' +
    'create table if not exists public.crozzo_bodegas (\n' +
    '  id text primary key,\n' +
    '  business_id text not null default \'default\',\n' +
    '  nombre text not null default \'\',\n' +
    '  tipo text not null default \'central\'\n' +
    '    check (tipo in (\'central\', \'frios\', \'area\', \'produccion\', \'transito\')),\n' +
    '  link_comanda_area text,\n' +
    '  activo boolean not null default true,\n' +
    '  meta jsonb not null default \'{}\'::jsonb,\n' +
    '  created_at timestamptz not null default now(),\n' +
    '  updated_at timestamptz not null default now()\n' +
    ');\n\n' +
    'create index if not exists idx_crozzo_bodegas_bid on public.crozzo_bodegas (business_id, activo);\n\n' +
    'create table if not exists public.crozzo_remisiones (\n' +
    '  id uuid primary key default gen_random_uuid(),\n' +
    '  remision_uuid text not null unique,\n' +
    '  business_id text not null default \'default\',\n' +
    '  tipo text not null default \'transferencia\',\n' +
    '  estado text not null default \'borrador\',\n' +
    '  origen_bodega_id text,\n' +
    '  destino_bodega_id text,\n' +
    '  destino_negocio_id text,\n' +
    '  destino_negocio_nombre text,\n' +
    '  lineas jsonb not null default \'[]\'::jsonb,\n' +
    '  notas text,\n' +
    '  enviado_por text,\n' +
    '  recibido_por text,\n' +
    '  payload jsonb not null default \'{}\'::jsonb,\n' +
    '  created_at timestamptz not null default now(),\n' +
    '  enviada_at timestamptz,\n' +
    '  recibida_at timestamptz\n' +
    ');\n\n' +
    'create index if not exists idx_crozzo_remisiones_estado on public.crozzo_remisiones (business_id, estado, created_at desc);\n\n' +
    'create table if not exists public.crozzo_federacion_entrante (\n' +
    '  id uuid primary key default gen_random_uuid(),\n' +
    '  remision_uuid text not null,\n' +
    '  origen_negocio_id text not null,\n' +
    '  origen_negocio_nombre text,\n' +
    '  tipo text not null default \'transferencia\',\n' +
    '  payload jsonb not null default \'{}\'::jsonb,\n' +
    '  estado text not null default \'pendiente\',\n' +
    '  recibido_por text,\n' +
    '  acuse jsonb,\n' +
    '  created_at timestamptz not null default now(),\n' +
    '  procesada_at timestamptz,\n' +
    '  unique (remision_uuid, origen_negocio_id)\n' +
    ');\n\n' +
    'create table if not exists public.crozzo_federacion_acuse (\n' +
    '  id uuid primary key default gen_random_uuid(),\n' +
    '  remision_uuid text not null,\n' +
    '  destino_negocio_id text not null,\n' +
    '  origen_negocio_id text not null,\n' +
    '  estado text not null,\n' +
    '  acuse jsonb not null default \'{}\'::jsonb,\n' +
    '  created_at timestamptz not null default now(),\n' +
    '  unique (remision_uuid, destino_negocio_id)\n' +
    ');\n\n' +
    'create table if not exists public.crozzo_federacion_socios (\n' +
    '  id text primary key,\n' +
    '  business_id text not null default \'default\',\n' +
    '  partner_negocio_id text not null,\n' +
    '  partner_nombre text not null default \'\',\n' +
    '  partner_supabase_url text,\n' +
    '  puede_enviar boolean not null default true,\n' +
    '  puede_recibir boolean not null default true,\n' +
    '  bodega_default_id text,\n' +
    '  activo boolean not null default true,\n' +
    '  meta jsonb not null default \'{}\'::jsonb,\n' +
    '  updated_at timestamptz not null default now(),\n' +
    '  unique (business_id, partner_negocio_id)\n' +
    ');\n\n' +
    'select public.crozzo_enable_pos_rls(\'crozzo_bodegas\');\n' +
    'select public.crozzo_enable_pos_rls(\'crozzo_remisiones\');\n' +
    'select public.crozzo_enable_pos_rls(\'crozzo_federacion_entrante\');\n' +
    'select public.crozzo_enable_pos_rls(\'crozzo_federacion_acuse\');\n' +
    'select public.crozzo_enable_pos_rls(\'crozzo_federacion_socios\');\n' +
    'select public.crozzo_fix_all_grants();\n' +
    'notify pgrst, \'reload schema\';\n';

  var POS_RUNTIME_SQL =
    '-- Crozzo POS — Estado operativo compartido por sede (mesas, carritos, comandas)\n' +
    '-- Requiere Realtime habilitado en la tabla.\n\n' +
    'create table if not exists public.crozzo_sede_runtime (\n' +
    '  location_id text primary key,\n' +
    '  business_id text not null default \'default\',\n' +
    '  payload jsonb not null default \'{}\'::jsonb,\n' +
    '  saved_at timestamptz not null default now(),\n' +
    '  source_device_id text,\n' +
    '  source_role text,\n' +
    '  updated_at timestamptz not null default now()\n' +
    ');\n\n' +
    'create index if not exists idx_crozzo_sede_runtime_business\n' +
    '  on public.crozzo_sede_runtime (business_id);\n\n' +
    'alter table public.crozzo_sede_runtime enable row level security;\n\n' +
    'drop policy if exists crozzo_sede_runtime_all on public.crozzo_sede_runtime;\n' +
    'create policy crozzo_sede_runtime_all on public.crozzo_sede_runtime\n' +
    '  for all using (true) with check (true);\n\n' +
    'do $$\n' +
    'begin\n' +
    '  if not exists (\n' +
    '    select 1 from pg_publication_tables\n' +
    '    where pubname = \'supabase_realtime\'\n' +
    '      and schemaname = \'public\'\n' +
    '      and tablename = \'crozzo_sede_runtime\'\n' +
    '  ) then\n' +
    '    alter publication supabase_realtime add table public.crozzo_sede_runtime;\n' +
    '  end if;\n' +
    'end $$;\n\n' +
    'notify pgrst, \'reload schema\';\n';

  var MESA_RUNTIME_SQL =
    '-- Crozzo POS — Runtime PARTICIONADO por mesa/slot (escala a muchas tablets sin pisarse)\n' +
    '-- Opcional y compatible: si NO existe, la app usa crozzo_sede_runtime (una fila por sede).\n' +
    '-- Si existe, cada mesa/slot escribe en SU fila, eliminando la contencion a gran escala.\n\n' +
    'create table if not exists public.crozzo_mesa_runtime (\n' +
    '  location_id text not null default \'default\',\n' +
    '  kind text not null,\n' +
    '  ref text not null,\n' +
    '  business_id text not null default \'default\',\n' +
    '  payload jsonb not null default \'{}\'::jsonb,\n' +
    '  source_device_id text,\n' +
    '  source_role text,\n' +
    '  updated_at timestamptz not null default now(),\n' +
    '  primary key (location_id, kind, ref)\n' +
    ');\n\n' +
    'create index if not exists idx_crozzo_mesa_runtime_loc on public.crozzo_mesa_runtime (location_id);\n' +
    'create index if not exists idx_crozzo_mesa_runtime_business on public.crozzo_mesa_runtime (business_id);\n' +
    'create index if not exists idx_crozzo_mesa_runtime_updated on public.crozzo_mesa_runtime (updated_at);\n\n' +
    'alter table public.crozzo_mesa_runtime enable row level security;\n\n' +
    'drop policy if exists crozzo_mesa_runtime_all on public.crozzo_mesa_runtime;\n' +
    'create policy crozzo_mesa_runtime_all on public.crozzo_mesa_runtime\n' +
    '  for all using (true) with check (true);\n\n' +
    'do $$\n' +
    'begin\n' +
    '  if not exists (\n' +
    '    select 1 from pg_publication_tables\n' +
    '    where pubname = \'supabase_realtime\'\n' +
    '      and schemaname = \'public\'\n' +
    '      and tablename = \'crozzo_mesa_runtime\'\n' +
    '  ) then\n' +
    '    alter publication supabase_realtime add table public.crozzo_mesa_runtime;\n' +
    '  end if;\n' +
    'end $$;\n\n' +
    'notify pgrst, \'reload schema\';\n';

  var PROFILES_AUTH_SQL =
    '-- Crozzo POS — Perfiles de login nube (Supabase Auth → profiles)\n' +
    '-- Ejecutar DESPUÉS del script 1 (base POS). Idempotente.\n' +
    '-- Crea fila en profiles automáticamente al registrar usuario en Authentication.\n\n' +
    'create or replace function public.crozzo_handle_new_user()\n' +
    'returns trigger\n' +
    'language plpgsql\n' +
    'security definer\n' +
    'set search_path = public\n' +
    'as $$\n' +
    'begin\n' +
    '  insert into public.profiles (id, email, role, updated_at)\n' +
    '  values (\n' +
    '    new.id,\n' +
    '    new.email,\n' +
    '    coalesce(new.raw_user_meta_data->>\'role\', \'cajero\'),\n' +
    '    now()\n' +
    '  )\n' +
    '  on conflict (id) do update set\n' +
    '    email = excluded.email,\n' +
    '    updated_at = now();\n' +
    '  return new;\n' +
    'end;\n' +
    '$$;\n\n' +
    'drop trigger if exists crozzo_on_auth_user_created on auth.users;\n' +
    'create trigger crozzo_on_auth_user_created\n' +
    '  after insert on auth.users\n' +
    '  for each row execute function public.crozzo_handle_new_user();\n\n' +
    '-- Rellenar profiles para usuarios Auth ya existentes (Dashboard → Authentication)\n' +
    'insert into public.profiles (id, email, role, updated_at)\n' +
    'select\n' +
    '  u.id,\n' +
    '  u.email,\n' +
    '  coalesce(u.raw_user_meta_data->>\'role\', \'cajero\'),\n' +
    '  now()\n' +
    'from auth.users u\n' +
    'where not exists (select 1 from public.profiles p where p.id = u.id);\n\n' +
    'select public.crozzo_enable_pos_rls(\'profiles\');\n' +
    'select public.crozzo_fix_all_grants();\n' +
    'notify pgrst, \'reload schema\';\n';

  var BUSINESS_REGISTRY_SQL =
    '-- Crozzo POS — Registro de negocios (nombre ↔ Business ID)\n' +
    '-- Ejecutar en el mismo proyecto Supabase que caja y tablets.\n' +
    '-- Permite autocompletar Business ID al escribir el nombre del negocio.\n\n' +
    'create table if not exists public.crozzo_business_registry (\n' +
    '  business_id text primary key,\n' +
    '  business_name text not null default \'\',\n' +
    '  updated_at timestamptz not null default now()\n' +
    ');\n\n' +
    'create index if not exists idx_crozzo_business_registry_name\n' +
    '  on public.crozzo_business_registry (business_name);\n\n' +
    'alter table public.crozzo_business_registry enable row level security;\n\n' +
    'drop policy if exists crozzo_business_registry_all on public.crozzo_business_registry;\n' +
    'create policy crozzo_business_registry_all on public.crozzo_business_registry\n' +
    '  for all using (true) with check (true);\n\n' +
    'notify pgrst, \'reload schema\';\n';

  var POS_STAFF_BUSINESS_ID_SQL =
    '-- =============================================================================\n' +
    '-- CROZZO POS — pos_staff.business_id (sync usuarios / PIN entre caja y tablets)\n' +
    '-- =============================================================================\n' +
    '-- Ejecutar si en F12 aparece: Could not find the \'business_id\' column of \'pos_staff\'\n' +
    '-- Proyecto: el mismo Supabase de caja, tablets y Super Admin nube.\n' +
    '-- =============================================================================\n\n' +
    'alter table if exists public.pos_staff\n' +
    '  add column if not exists business_id text;\n\n' +
    'comment on column public.pos_staff.business_id is\n' +
    '  \'Negocio (emparejamiento QR). Opcional en sedes simples; recomendado multi-dispositivo.\';\n\n' +
    'create index if not exists idx_pos_staff_business_location\n' +
    '  on public.pos_staff (business_id, location_id);\n\n' +
    '-- Recarga caché PostgREST (evita PGRST204 tras el ALTER)\n' +
    'notify pgrst, \'reload schema\';\n\n' +
    '-- Verificación\n' +
    'select column_name, data_type, is_nullable\n' +
    'from information_schema.columns\n' +
    'where table_schema = \'public\' and table_name = \'pos_staff\'\n' +
    'order by ordinal_position;\n';

  var POS_FACTURAS_SHARE_STORAGE_SQL =
    '-- =============================================================================\n' +
    '-- CROZZO POS — Enlaces temporales de facturas PDF (WhatsApp, hasta 7 días)\n' +
    '-- =============================================================================\n' +
    '-- Bucket PRIVADO: el cliente recibe URL firmada que caduca (no enlace público eterno).\n' +
    '-- Ejecutar en el mismo proyecto Supabase del POS (después de scripts 1–3).\n' +
    '-- =============================================================================\n\n' +
    'insert into storage.buckets (id, name, public)\n' +
    "values ('pos-facturas-share', 'pos-facturas-share', false)\n" +
    'on conflict (id) do update set public = false;\n\n' +
    'drop policy if exists crozzo_pos_facturas_share_select on storage.objects;\n' +
    'drop policy if exists crozzo_pos_facturas_share_insert on storage.objects;\n\n' +
    'drop policy if exists crozzo_pos_facturas_share_update on storage.objects;\n\n' +
    'create policy crozzo_pos_facturas_share_insert on storage.objects\n' +
    "  for insert to anon, authenticated with check (bucket_id = 'pos-facturas-share');\n\n" +
    'create policy crozzo_pos_facturas_share_update on storage.objects\n' +
    "  for update to anon, authenticated using (bucket_id = 'pos-facturas-share') with check (bucket_id = 'pos-facturas-share');\n\n" +
    'create policy crozzo_pos_facturas_share_select on storage.objects\n' +
    "  for select to anon, authenticated using (bucket_id = 'pos-facturas-share');\n";

  var DEVICE_QR_SLOTS_SQL =
    '-- Crozzo POS — Registro de QRs internos de comunicación entre dispositivos\n' +
    '-- Cada equipo publica su QR cada ~4 h (valido ~24 h). Todos leen los de los demas.\n' +
    '-- Active Realtime para sincronizacion instantanea del catalogo de QRs.\n\n' +
    'create table if not exists public.crozzo_device_qr_slots (\n' +
    '  id text primary key,\n' +
    '  business_id text not null default \'default\',\n' +
    '  location_id text not null default \'default\',\n' +
    '  device_id text not null,\n' +
    '  device_role text not null default \'B\',\n' +
    '  device_name text not null default \'\',\n' +
    '  slot_key text not null,\n' +
    '  scan_text text not null,\n' +
    '  payload_json jsonb,\n' +
    '  built_at timestamptz not null,\n' +
    '  valid_until timestamptz not null,\n' +
    '  updated_at timestamptz not null default now()\n' +
    ');\n\n' +
    'create index if not exists idx_crozzo_device_qr_loc\n' +
    '  on public.crozzo_device_qr_slots (business_id, location_id, valid_until desc);\n\n' +
    'alter table public.crozzo_device_qr_slots enable row level security;\n\n' +
    'drop policy if exists crozzo_device_qr_slots_all on public.crozzo_device_qr_slots;\n' +
    'create policy crozzo_device_qr_slots_all on public.crozzo_device_qr_slots\n' +
    '  for all using (true) with check (true);\n\n' +
    'do $$\n' +
    'begin\n' +
    '  if not exists (\n' +
    '    select 1 from pg_publication_tables\n' +
    '    where pubname = \'supabase_realtime\'\n' +
    '      and schemaname = \'public\'\n' +
    '      and tablename = \'crozzo_device_qr_slots\'\n' +
    '  ) then\n' +
    '    alter publication supabase_realtime add table public.crozzo_device_qr_slots;\n' +
    '  end if;\n' +
    'end $$;\n\n' +
    'notify pgrst, \'reload schema\';\n';

  global.CrozzoSupabaseSqlExtras = {
    list: function () {
      return [
        {
          key: 'pos_runtime',
          file: 'docs/SUPABASE-SQL-POS-RUNTIME.sql',
          title: '10. Runtime sede (mesas en vivo)',
          desc: 'OBLIGATORIO para sincronizar mesas/carritos entre cajas y tablets. Active Realtime.',
          required: true,
          order: 10,
          sql: POS_RUNTIME_SQL,
        },
        {
          key: 'federacion',
          file: 'docs/SUPABASE-SQL-FEDERACION.sql',
          title: '11. Federación de bodegas',
          desc: 'Remisiones entre bodegas/negocios. Un script por proyecto Supabase.',
          required: false,
          order: 11,
          sql: FEDERACION_SQL,
        },
        {
          key: 'mesa_runtime',
          file: 'docs/SUPABASE-SQL-MESA-RUNTIME.sql',
          title: '12. Runtime por mesa (escala a muchas tablets)',
          desc: 'Una fila por mesa/slot: evita que se pisen ediciones con decenas de tablets. Active Realtime.',
          required: false,
          order: 12,
          sql: MESA_RUNTIME_SQL,
        },
        {
          key: 'profiles_auth',
          file: 'docs/SUPABASE-SQL-PROFILES-AUTH.sql',
          title: '13. Perfiles login nube (Auth → profiles)',
          desc: 'Trigger automático + relleno de profiles. Ejecute si profiles=0 pero ya tiene usuarios en Authentication.',
          required: false,
          order: 13,
          sql: PROFILES_AUTH_SQL,
        },
        {
          key: 'business_registry',
          file: 'docs/SUPABASE-SQL-BUSINESS-REGISTRY.sql',
          title: '14. Registro de negocios (nombre ↔ Business ID)',
          desc: 'Recomendado para muchos dispositivos: autocompleta el Business ID al escribir el nombre del negocio.',
          required: false,
          order: 14,
          sql: BUSINESS_REGISTRY_SQL,
        },
        {
          key: 'device_qr_slots',
          file: 'docs/SUPABASE-SQL-DEVICE-QR-SLOTS.sql',
          title: '15. QRs internos entre dispositivos',
          desc: 'Cada equipo publica su QR cada 4 h; todos guardan los de los demas. Respaldo ultimo recurso. Active Realtime.',
          required: false,
          order: 15,
          sql: DEVICE_QR_SLOTS_SQL,
        },
        {
          key: 'pos_staff_business_id',
          file: 'docs/SUPABASE-SQL-POS-STAFF-BUSINESS-ID.sql',
          title: '16. pos_staff — columna business_id',
          desc: 'Corrige error PGRST204 al subir usuarios/PIN a la nube. Ejecutar si F12 muestra business_id en pos_staff.',
          required: false,
          order: 16,
          sql: POS_STAFF_BUSINESS_ID_SQL,
        },
        {
          key: 'pos_facturas_share_storage',
          file: 'docs/SUPABASE-SQL-POS-FACTURAS-SHARE-STORAGE.sql',
          title: '17. Storage facturas WhatsApp (enlace ~7 días)',
          desc: 'Bucket privado pos-facturas-share. Si no existe, el POS usa oficina-docs (script 3).',
          required: false,
          order: 17,
          sql: POS_FACTURAS_SHARE_STORAGE_SQL,
        },
      ];
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
