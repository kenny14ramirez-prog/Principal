-- RLS hardening draft (Fase -2/P0) — POS Crozzo
-- Coherencia con docs/maps/RLS-INVENTORY.md
-- Ejecutar EN ORDEN en SQL Editor de Supabase.

-- ============================================================
-- 0. Funciones helper privadas
-- ============================================================
create or replace function public.user_business_ids() returns setof text
language sql stable security definer as $$
  select business_id from public.profiles where user_id = auth.uid();
$$;

create or replace function public.has_business_role(p_role text) returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and role = p_role
  );
$$;

create or replace function public.has_location_access(p_location text) returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and (location_id = p_location or location_id is null)
  );
$$;

-- ============================================================
-- 1. Columna business_id en tablas críticas
-- ============================================================
alter table if exists public.sales add column if not exists business_id text not null default 'default';
alter table if exists public.comandas add column if not exists business_id text not null default 'default';
alter table if exists public.devices add column if not exists business_id text not null default 'default';
alter table if exists public.dian_config add column if not exists business_id text not null default 'default';
alter table if exists public.facturas add column if not exists business_id text not null default 'default';
alter table if exists public.crozzo_sede_runtime add column if not exists business_id text not null default 'default';
alter table if exists public.crozzo_mesa_runtime add column if not exists business_id text not null default 'default';
alter table if exists public.crozzo_ai_secrets add column if not exists business_id text not null default 'default';
alter table if exists public.profiles add column if not exists business_id text not null default 'default';
alter table if exists public.crozzo_pos_owners add column if not exists business_id text not null default 'default';

-- ============================================================
-- 2. Índices por business_id
-- ============================================================
create index if not exists idx_sales_business on public.sales (business_id);
create index if not exists idx_comandas_business on public.comandas (business_id);
create index if not exists idx_devices_business on public.devices (business_id);
create index if not exists idx_dian_config_business on public.dian_config (business_id);
create index if not exists idx_facturas_business on public.facturas (business_id);
create index if not exists idx_sede_runtime_business on public.crozzo_sede_runtime (business_id);
create index if not exists idx_mesa_runtime_business on public.crozzo_mesa_runtime (business_id);
create index if not exists idx_ai_secrets_business on public.crozzo_ai_secrets (business_id);
create index if not exists idx_profiles_business on public.profiles (business_id);
create index if not exists idx_pos_owners_business on public.crozzo_pos_owners (business_id);

-- ============================================================
-- 3. Función helper: extraer business_id del JWT (compat)
-- ============================================================
create or replace function public.crozzo_business_id() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'business_id', ''),
    'default'
  );
$$;

-- ============================================================
-- 4. Políticas restrictivas (modo compatibilidad legacy)
-- ============================================================
-- sales
drop policy if exists "allow all sales" on public.sales;
create policy "sales_business_isolation" on public.sales
  for all using (business_id = public.crozzo_business_id() or public.crozzo_business_id() = 'default')
  with check (business_id = public.crozzo_business_id() or public.crozzo_business_id() = 'default');

-- comandas
drop policy if exists "allow all comandas" on public.comandas;
create policy "comandas_business_isolation" on public.comandas
  for all using (business_id = public.crozzo_business_id() or public.crozzo_business_id() = 'default')
  with check (business_id = public.crozzo_business_id() or public.crozzo_business_id() = 'default');

-- devices
drop policy if exists "allow all devices" on public.devices;
create policy "devices_business_isolation" on public.devices
  for all using (business_id = public.crozzo_business_id() or public.crozzo_business_id() = 'default')
  with check (business_id = public.crozzo_business_id() or public.crozzo_business_id() = 'default');

-- dian_config
drop policy if exists "allow all dian_config" on public.dian_config;
create policy "dian_config_business_isolation" on public.dian_config
  for all using (business_id = public.crozzo_business_id() or public.crozzo_business_id() = 'default')
  with check (business_id = public.crozzo_business_id() or public.crozzo_business_id() = 'default');

-- facturas
drop policy if exists "allow all facturas" on public.facturas;
create policy "facturas_business_isolation" on public.facturas
  for all using (business_id = public.crozzo_business_id() or public.crozzo_business_id() = 'default')
  with check (business_id = public.crozzo_business_id() or public.crozzo_business_id() = 'default');

-- crozzo_sede_runtime
drop policy if exists "allow all sede runtime" on public.crozzo_sede_runtime;
create policy "sede_runtime_business_isolation" on public.crozzo_sede_runtime
  for all using (business_id = public.crozzo_business_id() or public.crozzo_business_id() = 'default')
  with check (business_id = public.crozzo_business_id() or public.crozzo_business_id() = 'default');

-- crozzo_mesa_runtime
drop policy if exists "allow all mesa runtime" on public.crozzo_mesa_runtime;
create policy "mesa_runtime_business_isolation" on public.crozzo_mesa_runtime
  for all using (business_id = public.crozzo_business_id() or public.crozzo_business_id() = 'default')
  with check (business_id = public.crozzo_business_id() or public.crozzo_business_id() = 'default');

-- crozzo_ai_secrets
drop policy if exists "allow all ai secrets" on public.crozzo_ai_secrets;
create policy "ai_secrets_business_isolation" on public.crozzo_ai_secrets
  for all using (business_id = public.crozzo_business_id() or public.crozzo_business_id() = 'default')
  with check (business_id = public.crozzo_business_id() or public.crozzo_business_id() = 'default');

-- profiles
drop policy if exists "allow all profiles" on public.profiles;
create policy "profiles_business_isolation" on public.profiles
  for all using (business_id = public.crozzo_business_id() or public.crozzo_business_id() = 'default')
  with check (business_id = public.crozzo_business_id() or public.crozzo_business_id() = 'default');

-- crozzo_pos_owners
drop policy if exists "allow all pos owners" on public.crozzo_pos_owners;
create policy "pos_owners_business_isolation" on public.crozzo_pos_owners
  for all using (business_id = public.crozzo_business_id() or public.crozzo_business_id() = 'default')
  with check (business_id = public.crozzo_business_id() or public.crozzo_business_id() = 'default');

-- ============================================================
-- 5. Fecha de expiración del modo compatibilidad
-- ============================================================
-- Después de 2026-12-31, eliminar la cláusula "or public.crozzo_business_id() = 'default'"
-- y requerir JWT en todos los dispositivos.
comment on table public.comandas is 'RLS por business_id. Modo compatibilidad legacy hasta 2026-12-31.';