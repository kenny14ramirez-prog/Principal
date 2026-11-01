-- =============================================================================
-- DRAFT — RLS HARDENING MULTI-TENANT — Crozzo POS (Fase 1)
-- =============================================================================
-- ESTADO: BORRADOR — NO APLICAR EN PRODUCCIÓN SIN REVISIÓN Y PRUEBAS pgTAP.
-- Generado: 2026-11-01. Basado en docs/maps/RLS-DESIGN.md y reporte Supabase RLS.
-- Ejecutar primero en ambiente de habilitación/staging.
-- =============================================================================

-- 1. Schema privado + funciones security definer
create schema if not exists private;

create or replace function private.user_business_ids()
returns setof uuid
language sql security definer set search_path = ''
stable as $$
  select business_id from public.business_members
  where user_id = (select auth.uid())
$$;

create or replace function private.has_business_role(p_business_id uuid, p_min_role text default 'viewer')
returns boolean
language plpgsql security definer set search_path = ''
stable as $$
declare
  v_level int;
begin
  select case role
    when 'owner' then 4 when 'admin' then 3 when 'manager' then 2
    when 'cashier' then 1 when 'viewer' then 0 else -1 end
  into v_level
  from public.business_members
  where user_id = (select auth.uid()) and business_id = p_business_id;
  return coalesce(v_level, -1) >= case p_min_role
    when 'owner' then 4 when 'admin' then 3 when 'manager' then 2
    when 'cashier' then 1 else 0 end;
end;
$$;

create or replace function private.has_location_access(p_business_id uuid, p_location_id uuid)
returns boolean
language sql security definer set search_path = ''
stable as $$
  select exists (
    select 1 from public.business_members m
    where m.user_id = (select auth.uid())
      and m.business_id = p_business_id
      and (m.location_ids is null or p_location_id = any(m.location_ids))
  );
$$;

revoke execute on function private.user_business_ids() from public;
revoke execute on function private.has_business_role(uuid,text) from public;
revoke execute on function private.has_location_access(uuid,uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.user_business_ids() to authenticated;
grant execute on function private.has_business_role(uuid,text) to authenticated;
grant execute on function private.has_location_access(uuid,uuid) to authenticated;

-- 2. Tablas de tenancy (crear si no existen)
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  created_at timestamptz default now()
);

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

create table if not exists public.business_members (
  user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  role text not null default 'viewer',
  location_ids uuid[],
  primary key (user_id, business_id)
);

create index if not exists idx_business_members_user_id on public.business_members(user_id);
create index if not exists idx_business_members_business_id on public.business_members(business_id);

create table if not exists public.role_permissions (
  role text not null,
  permission text not null,
  primary key (role, permission)
);

-- 3. Asegurar business_id/location_id en tablas de negocio (ejemplo)
-- alter table public.sales add column if not exists business_id uuid references public.businesses(id);
-- alter table public.sales add column if not exists location_id uuid references public.locations(id);
-- (repetir para todas las tablas de negocio — ver RLS-INVENTORY.md)

-- 4. Habilitar RLS + FORCE en tablas críticas (ejemplo)
do $$
declare t text;
begin
  for t in select unnest(array[
    'sales','sale_items','comandas','devices','device_configs','shift_closes',
    'dian_config','pos_staff','audit_logs','sync_queue','facturas',
    'crozzo_sede_runtime','crozzo_mesa_runtime','crozzo_device_qr_slots',
    'crozzo_ai_insights','crozzo_ai_secrets','profiles','crozzo_pos_owners'
  ]) loop
    if exists (select 1 from information_schema.tables where table_schema='public' and table_name=t) then
      execute format('alter table public.%I enable row level security', t);
      execute format('alter table public.%I force row level security', t);
    end if;
  end loop;
end $$;

-- 5. Revocar grants y otorgar mínimo
do $$
declare t text;
begin
  for t in select unnest(array[
    'sales','sale_items','comandas','devices','device_configs','shift_closes',
    'dian_config','pos_staff','audit_logs','sync_queue','facturas',
    'crozzo_sede_runtime','crozzo_mesa_runtime','crozzo_device_qr_slots',
    'crozzo_ai_insights','profiles','crozzo_pos_owners'
  ]) loop
    if exists (select 1 from information_schema.tables where table_schema='public' and table_name=t) then
      execute format('revoke all on table public.%I from anon, authenticated', t);
      execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    end if;
  end loop;
end $$;

-- 6. Policies por operación (ejemplo para 'sales'; repetir patrón para cada tabla)
-- SELECT
drop policy if exists sales_select on public.sales;
create policy sales_select on public.sales for select to authenticated
using (
  business_id in (select private.user_business_ids())
  and (location_id is null or private.has_location_access(business_id, location_id))
);

-- INSERT
drop policy if exists sales_insert on public.sales;
create policy sales_insert on public.sales for insert to authenticated
with check (
  business_id in (select private.user_business_ids())
  and private.has_business_role(business_id, 'cashier')
  and (location_id is null or private.has_location_access(business_id, location_id))
);

-- UPDATE
drop policy if exists sales_update on public.sales;
create policy sales_update on public.sales for update to authenticated
using (business_id in (select private.user_business_ids()))
with check (
  business_id in (select private.user_business_ids())
  and private.has_business_role(business_id, 'manager')
);

-- DELETE
drop policy if exists sales_delete on public.sales;
create policy sales_delete on public.sales for delete to authenticated
using (
  business_id in (select private.user_business_ids())
  and private.has_business_role(business_id, 'admin')
);

-- 7. Índices en columnas de política
create index if not exists idx_sales_business_id on public.sales(business_id);
create index if not exists idx_sales_location_id on public.sales(location_id);
create index if not exists idx_comandas_business_id on public.comandas(business_id);
create index if not exists idx_comandas_location_id on public.comandas(location_id);
create index if not exists idx_devices_business_id on public.devices(business_id);
create index if not exists idx_devices_location_id on public.devices(location_id);

-- 8. Vistas con security_invoker (Postgres 15+)
-- create view public.xxx with (security_invoker = true) as select ...;

-- 9. AI secrets: solo service_role (ya restrictivo, mantener)
-- (no policies for anon/authenticated → only service_role)

-- 10. Storage policies (ejemplo)
-- create policy invoices_read on storage.objects for select to authenticated
-- using (bucket_id = 'invoices' and (storage.foldername(name))[1] in (select business_id::text from private.user_business_ids()));
-- create policy invoices_write on storage.objects for insert to authenticated
-- with check (bucket_id = 'invoices' and private.has_business_role(((storage.foldername(name))[1])::uuid, 'cashier'));

-- =============================================================================
-- NOTA: Repetir el patrón de policies (sección 6) para cada tabla de negocio.
-- Usar RLS-INVENTORY.md para clasificación y prioridad.
-- Tests pgTAP: crear en supabase/tests/ (allow/deny por tabla y rol).
-- =============================================================================
