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
    '-- ============================================================\n' +
    '-- Crozzo POS — Runtime en vivo (mesas, comandas, CRM QR clientes)\n' +
    '-- OBLIGATORIO para multi-dispositivo: cuenta mesa → caja, comandas cocina, sync staff.\n' +
    '-- Idempotente: ejecutar varias veces sin romper nada.\n' +
    '-- Ejecutar DESPUÉS del script 1 (Base POS).\n' +
    '-- Supabase → SQL Editor → pegar todo → Run (▶)\n' +
    '-- ============================================================\n' +
    '\n' +
    'create extension if not exists "pgcrypto" with schema extensions;\n' +
    '\n' +
    '-- ---------- 1) Estado operativo compartido por sede ----------\n' +
    'create table if not exists public.crozzo_sede_runtime (\n' +
    '  location_id text primary key,\n' +
    '  business_id text not null default \'default\',\n' +
    '  payload jsonb not null default \'{}\'::jsonb,\n' +
    '  saved_at timestamptz not null default now(),\n' +
    '  source_device_id text,\n' +
    '  source_role text,\n' +
    '  updated_at timestamptz not null default now()\n' +
    ');\n' +
    '\n' +
    'create index if not exists idx_crozzo_sede_runtime_business\n' +
    '  on public.crozzo_sede_runtime (business_id);\n' +
    '\n' +
    '-- ---------- 2) Runtime particionado por mesa/slot (escala tablets) ----------\n' +
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
    ');\n' +
    '\n' +
    'create index if not exists idx_crozzo_mesa_runtime_loc on public.crozzo_mesa_runtime (location_id);\n' +
    'create index if not exists idx_crozzo_mesa_runtime_business on public.crozzo_mesa_runtime (business_id);\n' +
    'create index if not exists idx_crozzo_mesa_runtime_updated on public.crozzo_mesa_runtime (updated_at);\n' +
    '\n' +
    '-- ---------- 3) Comandas (refuerzo si script 1 ya creó la tabla) ----------\n' +
    'create table if not exists public.comandas (\n' +
    '  id uuid primary key default gen_random_uuid(),\n' +
    '  business_id text not null default \'default\',\n' +
    '  location_id text not null default \'default\',\n' +
    '  device_id uuid,\n' +
    '  status text not null default \'pendiente\',\n' +
    '  payload jsonb not null default \'{}\'::jsonb,\n' +
    '  updated_at timestamptz not null default now()\n' +
    ');\n' +
    '\n' +
    'create index if not exists idx_comandas_tenant on public.comandas (business_id, location_id, status);\n' +
    'create index if not exists idx_comandas_updated on public.comandas (updated_at desc);\n' +
    '\n' +
    'create index if not exists idx_comandas_entregada_updated\n' +
    '  on public.comandas (status, updated_at desc)\n' +
    '  where status = \'entregada\';\n' +
    '\n' +
    '-- ---------- 4) CRM autoregistro clientes (QR ~1 h) ----------\n' +
    'create table if not exists public.crozzo_crm_registro_tokens (\n' +
    '  id uuid primary key default gen_random_uuid(),\n' +
    '  token text not null unique,\n' +
    '  business_id text not null default \'default\',\n' +
    '  business_name text not null default \'\',\n' +
    '  expires_at timestamptz not null,\n' +
    '  created_at timestamptz not null default now(),\n' +
    '  created_by_device text,\n' +
    '  revoked boolean not null default false\n' +
    ');\n' +
    '\n' +
    'create index if not exists idx_crozzo_crm_reg_tokens_bid\n' +
    '  on public.crozzo_crm_registro_tokens (business_id, expires_at desc);\n' +
    '\n' +
    'create table if not exists public.crozzo_crm_registro_intake (\n' +
    '  id uuid primary key default gen_random_uuid(),\n' +
    '  token text not null,\n' +
    '  business_id text not null default \'default\',\n' +
    '  payload jsonb not null default \'{}\'::jsonb,\n' +
    '  processed boolean not null default false,\n' +
    '  processed_at timestamptz,\n' +
    '  created_at timestamptz not null default now()\n' +
    ');\n' +
    '\n' +
    'create index if not exists idx_crozzo_crm_reg_intake_pending\n' +
    '  on public.crozzo_crm_registro_intake (business_id, processed, created_at asc);\n' +
    '\n' +
    'create or replace function public.crozzo_crm_registro_intake_validate()\n' +
    'returns trigger language plpgsql as $$\n' +
    'begin\n' +
    '  if not exists (\n' +
    '    select 1 from public.crozzo_crm_registro_tokens t\n' +
    '    where t.token = new.token\n' +
    '      and t.business_id = new.business_id\n' +
    '      and t.expires_at > now()\n' +
    '      and not t.revoked\n' +
    '  ) then\n' +
    '    raise exception \'invalid_or_expired_token\';\n' +
    '  end if;\n' +
    '  return new;\n' +
    'end;\n' +
    '$$;\n' +
    '\n' +
    'drop trigger if exists trg_crozzo_crm_registro_intake_validate on public.crozzo_crm_registro_intake;\n' +
    'create trigger trg_crozzo_crm_registro_intake_validate\n' +
    '  before insert on public.crozzo_crm_registro_intake\n' +
    '  for each row execute function public.crozzo_crm_registro_intake_validate();\n' +
    '\n' +
    'create or replace function public.crozzo_crm_registro_bootstrap()\n' +
    'returns json language plpgsql security definer set search_path = public as $$\n' +
    'begin\n' +
    '  perform public.crozzo_enable_pos_rls(\'crozzo_crm_registro_tokens\');\n' +
    '  perform public.crozzo_enable_pos_rls(\'crozzo_crm_registro_intake\');\n' +
    '  perform public.crozzo_fix_all_grants();\n' +
    '  return json_build_object(\'ok\', true);\n' +
    'end;\n' +
    '$$;\n' +
    '\n' +
    'grant execute on function public.crozzo_crm_registro_bootstrap() to anon, authenticated;\n' +
    '\n' +
    '-- ---------- RLS + permisos (patrón POS) ----------\n' +
    'select public.crozzo_enable_pos_rls(\'crozzo_sede_runtime\');\n' +
    'select public.crozzo_enable_pos_rls(\'crozzo_mesa_runtime\');\n' +
    'select public.crozzo_enable_pos_rls(\'comandas\');\n' +
    'select public.crozzo_enable_pos_rls(\'crozzo_crm_registro_tokens\');\n' +
    'select public.crozzo_enable_pos_rls(\'crozzo_crm_registro_intake\');\n' +
    'select public.crozzo_fix_all_grants();\n' +
    '\n' +
    '-- ---------- Realtime ----------\n' +
    'do $$\n' +
    'declare\n' +
    '  t text;\n' +
    'begin\n' +
    '  foreach t in array array[\n' +
    '    \'crozzo_sede_runtime\', \'crozzo_mesa_runtime\', \'comandas\'\n' +
    '  ]\n' +
    '  loop\n' +
    '    begin\n' +
    '      execute format(\'alter table public.%I replica identity full\', t);\n' +
    '    exception when others then null;\n' +
    '    end;\n' +
    '    begin\n' +
    '      if not exists (\n' +
    '        select 1 from pg_publication_tables\n' +
    '        where pubname = \'supabase_realtime\'\n' +
    '          and schemaname = \'public\'\n' +
    '          and tablename = t\n' +
    '      ) then\n' +
    '        execute format(\'alter publication supabase_realtime add table public.%I\', t);\n' +
    '      end if;\n' +
    '    exception when duplicate_object then null;\n' +
    '      when others then null;\n' +
    '    end;\n' +
    '  end loop;\n' +
    'end $$;\n' +
    '\n' +
    '-- ---------- Storage CRM (bucket público Crozzo) ----------\n' +
    'insert into storage.buckets (id, name, public)\n' +
    'values (\'crozzo-public\', \'crozzo-public\', true)\n' +
    'on conflict (id) do update set public = true;\n' +
    '\n' +
    'drop policy if exists crozzo_crm_reg_pub_sel on storage.objects;\n' +
    'drop policy if exists crozzo_crm_reg_pub_ins on storage.objects;\n' +
    'drop policy if exists crozzo_crm_reg_pub_upd on storage.objects;\n' +
    'drop policy if exists crozzo_crm_reg_ofi_ins on storage.objects;\n' +
    'drop policy if exists crozzo_crm_reg_ofi_upd on storage.objects;\n' +
    '\n' +
    'create policy crozzo_crm_reg_pub_sel on storage.objects\n' +
    '  for select to anon, authenticated using (bucket_id = \'crozzo-public\');\n' +
    '\n' +
    'create policy crozzo_crm_reg_pub_ins on storage.objects\n' +
    '  for insert to anon, authenticated with check (bucket_id = \'crozzo-public\');\n' +
    '\n' +
    'create policy crozzo_crm_reg_pub_upd on storage.objects\n' +
    '  for update to anon, authenticated using (bucket_id = \'crozzo-public\') with check (bucket_id = \'crozzo-public\');\n' +
    '\n' +
    'create policy crozzo_crm_reg_ofi_ins on storage.objects\n' +
    '  for insert to anon, authenticated with check (bucket_id = \'oficina-docs\' and name like \'crozzo/%\');\n' +
    '\n' +
    'create policy crozzo_crm_reg_ofi_upd on storage.objects\n' +
    '  for update to anon, authenticated using (bucket_id = \'oficina-docs\' and name like \'crozzo/%\')\n' +
    '  with check (bucket_id = \'oficina-docs\' and name like \'crozzo/%\');\n' +
    '\n' +
    'notify pgrst, \'reload schema\';\n' +
    '\n' +
    '-- Verificación rápida:\n' +
    '-- select tablename from pg_publication_tables where pubname = \'supabase_realtime\' and tablename like \'crozzo_%\' or tablename = \'comandas\';\n'
;

  var MESA_RUNTIME_SQL =
    '-- Crozzo POS — Parche opcional: runtime por mesa (si script 10 ya se ejecutó, es no-op)\n' +
    '-- Solo re-ejecuta permisos y Realtime de crozzo_mesa_runtime.\n' +
    '\n' +
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
    ');\n' +
    '\n' +
    'create index if not exists idx_crozzo_mesa_runtime_loc on public.crozzo_mesa_runtime (location_id);\n' +
    'create index if not exists idx_crozzo_mesa_runtime_business on public.crozzo_mesa_runtime (business_id);\n' +
    'create index if not exists idx_crozzo_mesa_runtime_updated on public.crozzo_mesa_runtime (updated_at);\n' +
    '\n' +
    'select public.crozzo_enable_pos_rls(\'crozzo_mesa_runtime\');\n' +
    'select public.crozzo_fix_all_grants();\n' +
    '\n' +
    'do $$\n' +
    'begin\n' +
    '  begin\n' +
    '    alter table public.crozzo_mesa_runtime replica identity full;\n' +
    '  exception when others then null;\n' +
    '  end;\n' +
    '  if not exists (\n' +
    '    select 1 from pg_publication_tables\n' +
    '    where pubname = \'supabase_realtime\'\n' +
    '      and schemaname = \'public\'\n' +
    '      and tablename = \'crozzo_mesa_runtime\'\n' +
    '  ) then\n' +
    '    alter publication supabase_realtime add table public.crozzo_mesa_runtime;\n' +
    '  end if;\n' +
    'end $$;\n' +
    '\n' +
    'notify pgrst, \'reload schema\';\n'
;

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
    '-- Recomendado multi-dispositivo: autocompleta Business ID al emparejar tablets.\n' +
    '-- Idempotente.\n' +
    '\n' +
    'create table if not exists public.crozzo_business_registry (\n' +
    '  business_id text primary key,\n' +
    '  business_name text not null default \'\',\n' +
    '  updated_at timestamptz not null default now()\n' +
    ');\n' +
    '\n' +
    'create index if not exists idx_crozzo_business_registry_name\n' +
    '  on public.crozzo_business_registry (business_name);\n' +
    '\n' +
    'select public.crozzo_enable_pos_rls(\'crozzo_business_registry\');\n' +
    'select public.crozzo_fix_all_grants();\n' +
    '\n' +
    'notify pgrst, \'reload schema\';\n'
;

  var POS_STAFF_BUSINESS_ID_SQL =
    '-- =============================================================================\n' +
    '-- CROZZO POS — pos_staff.business_id (sync usuarios / PIN entre caja y tablets)\n' +
    '-- =============================================================================\n' +
    '-- Ejecutar si en F12 aparece: Could not find the \'business_id\' column of \'pos_staff\'\n' +
    '-- Proyecto: el mismo Supabase de caja, tablets y Super Admin nube.\n' +
    '-- Supabase → SQL → New query → pegar todo → Run (▶)\n' +
    '-- =============================================================================\n' +
    '\n' +
    'alter table if exists public.pos_staff\n' +
    '  add column if not exists business_id text;\n' +
    '\n' +
    'comment on column public.pos_staff.business_id is\n' +
    '  \'Negocio (emparejamiento QR). Opcional en sedes simples; recomendado multi-dispositivo.\';\n' +
    '\n' +
    'create index if not exists idx_pos_staff_business_location\n' +
    '  on public.pos_staff (business_id, location_id);\n' +
    '\n' +
    '-- Recarga caché PostgREST (evita PGRST204 tras el ALTER)\n' +
    'notify pgrst, \'reload schema\';\n' +
    '\n' +
    '-- Verificación (debe listar business_id)\n' +
    'select column_name, data_type, is_nullable\n' +
    'from information_schema.columns\n' +
    'where table_schema = \'public\' and table_name = \'pos_staff\'\n' +
    'order by ordinal_position;\n'
;

  var CRM_REGISTRO_QR_SQL =
    '-- =============================================================================\n' +
    '-- CROZZO POS — Autoregistro de clientes por QR (token ~1 h)\n' +
    '-- =============================================================================\n' +
    '-- Opcional si ya ejecutó script 10 (Runtime sede): incluye las mismas tablas.\n' +
    '-- El formulario web lo hospeda Crozzo (sin deploy en cada PC).\n' +
    '-- =============================================================================\n\n' +
    'create extension if not exists "pgcrypto" with schema extensions;\n\n' +
    'create table if not exists public.crozzo_crm_registro_tokens (\n' +
    '  id uuid primary key default gen_random_uuid(),\n' +
    '  token text not null unique,\n' +
    '  business_id text not null default \'default\',\n' +
    '  business_name text not null default \'\',\n' +
    '  expires_at timestamptz not null,\n' +
    '  created_at timestamptz not null default now(),\n' +
    '  created_by_device text,\n' +
    '  revoked boolean not null default false\n' +
    ');\n\n' +
    'create index if not exists idx_crozzo_crm_reg_tokens_bid\n' +
    '  on public.crozzo_crm_registro_tokens (business_id, expires_at desc);\n\n' +
    'create table if not exists public.crozzo_crm_registro_intake (\n' +
    '  id uuid primary key default gen_random_uuid(),\n' +
    '  token text not null,\n' +
    '  business_id text not null default \'default\',\n' +
    '  payload jsonb not null default \'{}\'::jsonb,\n' +
    '  processed boolean not null default false,\n' +
    '  processed_at timestamptz,\n' +
    '  created_at timestamptz not null default now()\n' +
    ');\n\n' +
    'create index if not exists idx_crozzo_crm_reg_intake_pending\n' +
    '  on public.crozzo_crm_registro_intake (business_id, processed, created_at asc);\n\n' +
    'create or replace function public.crozzo_crm_registro_intake_validate()\n' +
    'returns trigger language plpgsql as $$\n' +
    'begin\n' +
    '  if not exists (\n' +
    '    select 1 from public.crozzo_crm_registro_tokens t\n' +
    '    where t.token = new.token\n' +
    '      and t.business_id = new.business_id\n' +
    '      and t.expires_at > now()\n' +
    '      and not t.revoked\n' +
    '  ) then\n' +
    '    raise exception \'invalid_or_expired_token\';\n' +
    '  end if;\n' +
    '  return new;\n' +
    'end;\n' +
    '$$;\n\n' +
    'drop trigger if exists trg_crozzo_crm_registro_intake_validate on public.crozzo_crm_registro_intake;\n' +
    'create trigger trg_crozzo_crm_registro_intake_validate\n' +
    '  before insert on public.crozzo_crm_registro_intake\n' +
    '  for each row execute function public.crozzo_crm_registro_intake_validate();\n\n' +
    'select public.crozzo_enable_pos_rls(\'crozzo_crm_registro_tokens\');\n' +
    'select public.crozzo_enable_pos_rls(\'crozzo_crm_registro_intake\');\n' +
    'select public.crozzo_fix_all_grants();\n\n' +
    'insert into storage.buckets (id, name, public)\n' +
    "values ('crozzo-public', 'crozzo-public', true)\n" +
    'on conflict (id) do update set public = true;\n\n' +
    'drop policy if exists crozzo_crm_reg_pub_sel on storage.objects;\n' +
    'drop policy if exists crozzo_crm_reg_pub_ins on storage.objects;\n' +
    'drop policy if exists crozzo_crm_reg_pub_upd on storage.objects;\n' +
    'drop policy if exists crozzo_crm_reg_ofi_ins on storage.objects;\n' +
    'drop policy if exists crozzo_crm_reg_ofi_upd on storage.objects;\n\n' +
    'create policy crozzo_crm_reg_pub_sel on storage.objects\n' +
    "  for select to anon, authenticated using (bucket_id = 'crozzo-public');\n\n" +
    'create policy crozzo_crm_reg_pub_ins on storage.objects\n' +
    "  for insert to anon, authenticated with check (bucket_id = 'crozzo-public');\n\n" +
    'create policy crozzo_crm_reg_pub_upd on storage.objects\n' +
    "  for update to anon, authenticated using (bucket_id = 'crozzo-public') with check (bucket_id = 'crozzo-public');\n\n" +
    'create policy crozzo_crm_reg_ofi_ins on storage.objects\n' +
    "  for insert to anon, authenticated with check (bucket_id = 'oficina-docs' and name like 'crozzo/%');\n\n" +
    'create policy crozzo_crm_reg_ofi_upd on storage.objects\n' +
    "  for update to anon, authenticated using (bucket_id = 'oficina-docs' and name like 'crozzo/%') with check (bucket_id = 'oficina-docs' and name like 'crozzo/%');\n\n" +
    '-- Corrige mimetype text/plain -> text/html en archivos .html de Storage\n' +
    'create or replace function public.crozzo_crm_registro_fix_html_mimetype(p_bucket text, p_path text)\n' +
    'returns void language plpgsql security definer set search_path = public, storage as $$\n' +
    'begin\n' +
    '  update storage.objects\n' +
    '  set metadata = jsonb_set(\n' +
    '    jsonb_set(coalesce(metadata, \'{}\'::jsonb), \'{mimetype}\', \'"text/html"\'),\n' +
    '    \'{contentType}\', \'"text/html"\')\n' +
    '  where bucket_id = p_bucket and name = p_path;\n' +
    'end;\n' +
    '$$;\n\n' +
    'grant execute on function public.crozzo_crm_registro_fix_html_mimetype(text, text) to anon, authenticated;\n\n' +
    'create or replace function public.crozzo_crm_registro_bootstrap()\n' +
    'returns json language plpgsql security definer set search_path = public as $$\n' +
    'begin\n' +
    '  perform public.crozzo_enable_pos_rls(\'crozzo_crm_registro_tokens\');\n' +
    '  perform public.crozzo_enable_pos_rls(\'crozzo_crm_registro_intake\');\n' +
    '  perform public.crozzo_fix_all_grants();\n' +
    '  return json_build_object(\'ok\', true);\n' +
    'end;\n' +
    '$$;\n\n' +
    'grant execute on function public.crozzo_crm_registro_bootstrap() to anon, authenticated;\n\n' +
    'notify pgrst, \'reload schema\';\n';

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
    '-- Crozzo POS — QRs internos entre dispositivos (malla / respaldo LAN)\n' +
    '-- Cada equipo publica su QR ~cada 4 h; todos leen el catálogo en nube.\n' +
    '-- Ejecutar DESPUÉS del script 1. Requiere Realtime (este script lo activa).\n' +
    '-- Idempotente.\n' +
    '\n' +
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
    ');\n' +
    '\n' +
    'create index if not exists idx_crozzo_device_qr_loc\n' +
    '  on public.crozzo_device_qr_slots (business_id, location_id, valid_until desc);\n' +
    '\n' +
    'select public.crozzo_enable_pos_rls(\'crozzo_device_qr_slots\');\n' +
    'select public.crozzo_fix_all_grants();\n' +
    '\n' +
    'do $$\n' +
    'begin\n' +
    '  begin\n' +
    '    alter table public.crozzo_device_qr_slots replica identity full;\n' +
    '  exception when others then null;\n' +
    '  end;\n' +
    '  if not exists (\n' +
    '    select 1 from pg_publication_tables\n' +
    '    where pubname = \'supabase_realtime\'\n' +
    '      and schemaname = \'public\'\n' +
    '      and tablename = \'crozzo_device_qr_slots\'\n' +
    '  ) then\n' +
    '    alter publication supabase_realtime add table public.crozzo_device_qr_slots;\n' +
    '  end if;\n' +
    'end $$;\n' +
    '\n' +
    'notify pgrst, \'reload schema\';\n'
;

  var COMUNICACION_REPAIR_SQL =
    '-- ============================================================\n' +
    '-- Crozzo POS — REPARAR comunicacion en vivo (mesas -> caja + comandas)\n' +
    '-- Crea/repara tablas + POLITICAS DE ESCRITURA (RLS) + Realtime.\n' +
    '-- Idempotente: ejecutar las veces que haga falta sin romper nada.\n' +
    '-- Ejecutar UNA vez en Supabase; aplica para TODOS los dispositivos.\n' +
    '-- ============================================================\n\n' +
    '-- 1) Estado operativo por sede (mesas/carritos en vivo)\n' +
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
    'alter table public.crozzo_sede_runtime enable row level security;\n' +
    'drop policy if exists crozzo_sede_runtime_all on public.crozzo_sede_runtime;\n' +
    'create policy crozzo_sede_runtime_all on public.crozzo_sede_runtime\n' +
    '  for all using (true) with check (true);\n\n' +
    'do $$\n' +
    'begin\n' +
    '  if not exists (\n' +
    '    select 1 from pg_publication_tables\n' +
    '    where pubname = \'supabase_realtime\' and schemaname = \'public\'\n' +
    '      and tablename = \'crozzo_sede_runtime\'\n' +
    '  ) then\n' +
    '    alter publication supabase_realtime add table public.crozzo_sede_runtime;\n' +
    '  end if;\n' +
    'end $$;\n\n' +
    '-- 2) Runtime por mesa/slot (escala a muchas tablets sin pisarse)\n' +
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
    'alter table public.crozzo_mesa_runtime enable row level security;\n' +
    'drop policy if exists crozzo_mesa_runtime_all on public.crozzo_mesa_runtime;\n' +
    'create policy crozzo_mesa_runtime_all on public.crozzo_mesa_runtime\n' +
    '  for all using (true) with check (true);\n\n' +
    'do $$\n' +
    'begin\n' +
    '  if not exists (\n' +
    '    select 1 from pg_publication_tables\n' +
    '    where pubname = \'supabase_realtime\' and schemaname = \'public\'\n' +
    '      and tablename = \'crozzo_mesa_runtime\'\n' +
    '  ) then\n' +
    '    alter publication supabase_realtime add table public.crozzo_mesa_runtime;\n' +
    '  end if;\n' +
    'end $$;\n\n' +
    '-- 3) Comandas a cocina (si la tabla no existe la crea)\n' +
    'create table if not exists public.comandas (\n' +
    '  id uuid primary key,\n' +
    '  business_id text not null default \'default\',\n' +
    '  location_id text not null default \'default\',\n' +
    '  device_id uuid,\n' +
    '  status text not null default \'pendiente\',\n' +
    '  payload jsonb not null default \'{}\'::jsonb,\n' +
    '  updated_at timestamptz not null default now()\n' +
    ');\n\n' +
    'create index if not exists idx_comandas_tenant on public.comandas (business_id, location_id, status);\n' +
    'create index if not exists idx_comandas_updated on public.comandas (updated_at desc);\n\n' +
    'alter table public.comandas enable row level security;\n' +
    'drop policy if exists comandas_all on public.comandas;\n' +
    'create policy comandas_all on public.comandas\n' +
    '  for all using (true) with check (true);\n\n' +
    'do $$\n' +
    'begin\n' +
    '  if not exists (\n' +
    '    select 1 from pg_publication_tables\n' +
    '    where pubname = \'supabase_realtime\' and schemaname = \'public\'\n' +
    '      and tablename = \'comandas\'\n' +
    '  ) then\n' +
    '    alter publication supabase_realtime add table public.comandas;\n' +
    '  end if;\n' +
    'end $$;\n\n' +
    'notify pgrst, \'reload schema\';\n';

  var AI_INSIGHTS_SQL =
    '-- Crozzo AI Insights — secrets + historial (RLS)\n' +
    'create table if not exists public.crozzo_ai_secrets (\n' +
    '  business_id text primary key,\n' +
    '  api_key text not null,\n' +
    '  last4 text,\n' +
    '  updated_at timestamptz default now()\n' +
    ');\n' +
    'alter table public.crozzo_ai_secrets enable row level security;\n' +
    'create table if not exists public.crozzo_ai_insights (\n' +
    '  id bigserial primary key,\n' +
    '  business_id text not null,\n' +
    '  range_kind text not null check (range_kind in (\'8d\', \'month\')),\n' +
    '  range_from text,\n' +
    '  range_to text,\n' +
    '  text text not null,\n' +
    '  created_at timestamptz default now()\n' +
    ');\n' +
    'create index if not exists crozzo_ai_insights_biz_created\n' +
    '  on public.crozzo_ai_insights (business_id, created_at desc);\n' +
    'alter table public.crozzo_ai_insights enable row level security;\n' +
    'do $$\n' +
    'begin\n' +
    '  if not exists (\n' +
    '    select 1 from pg_policies\n' +
    '    where schemaname = \'public\' and tablename = \'crozzo_ai_insights\'\n' +
    '      and policyname = \'crozzo_ai_insights_select_biz\'\n' +
    '  ) then\n' +
    '    create policy crozzo_ai_insights_select_biz on public.crozzo_ai_insights\n' +
    '      for select using (business_id = coalesce(auth.jwt() ->> \'business_id\', \'\'));\n' +
    '  end if;\n' +
    'end $$;\n' +
    'notify pgrst, \'reload schema\';\n';

  global.CrozzoSupabaseSqlExtras = {
    list: function () {
      return [
        {
          key: 'pos_runtime',
          file: 'docs/SUPABASE-SQL-POS-RUNTIME.sql',
          title: '10. Runtime en vivo (mesas + comandas + CRM QR)',
          desc: 'OBLIGATORIO multi-dispositivo: crozzo_sede_runtime, crozzo_mesa_runtime, comandas Realtime, CRM autoregistro. Si mesas/comandas no propagan, re-ejecute este script.',
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
          title: '12. Runtime por mesa (parche / re-ejecutar)',
          desc: 'Incluido en script 10. Use solo para reparar permisos o Realtime de crozzo_mesa_runtime en bases antiguas.',
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
          desc: 'Recomendado multi-dispositivo: autocompleta Business ID al emparejar tablets y sincronizar sedes.',
          required: true,
          order: 14,
          sql: BUSINESS_REGISTRY_SQL,
        },
        {
          key: 'device_qr_slots',
          file: 'docs/SUPABASE-SQL-DEVICE-QR-SLOTS.sql',
          title: '15. QRs internos entre dispositivos',
          desc: 'OBLIGATORIO malla multi-dispositivo: crozzo_device_qr_slots + Realtime. Respaldo cuando cae Wi‑Fi/LAN.',
          required: true,
          order: 15,
          sql: DEVICE_QR_SLOTS_SQL,
        },
        {
          key: 'pos_staff_business_id',
          file: 'docs/SUPABASE-SQL-POS-STAFF-BUSINESS-ID.sql',
          title: '16. pos_staff — columna business_id (bases antiguas)',
          desc: 'Parche idempotente si la base se creó antes de 2026-06. El script 1 actual ya incluye business_id.',
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
        {
          key: 'crm_registro_qr',
          file: 'docs/SUPABASE-SQL-CRM-REGISTRO-QR.sql',
          title: '18. Autoregistro clientes QR',
          desc: 'Solo si NO ejecutó script 10 reciente. Tablas QR + permisos. Sin deploy por PC.',
          required: false,
          order: 18,
          sql: CRM_REGISTRO_QR_SQL,
        },
        {
          key: 'ai_insights',
          file: 'docs/SUPABASE-SQL-ai-insights.sql',
          title: '19. Reporte IA (secrets + historial)',
          desc: 'Tablas crozzo_ai_secrets (solo Edge) y crozzo_ai_insights. Luego: supabase functions deploy ai-insights.',
          required: false,
          order: 19,
          sql: AI_INSIGHTS_SQL,
        },
      ];
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
