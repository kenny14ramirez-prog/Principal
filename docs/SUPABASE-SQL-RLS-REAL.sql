-- RLS real por business_id (Fase -2/P0)
-- Migración gradual: modo compatibilidad para tablets legacy.
-- Ejecutar EN ORDEN en SQL Editor de Supabase.

-- 1. Añadir columna business_id a tablas (si no existe)
alter table if exists public.comandas
  add column if not exists business_id text not null default 'default';
alter table if exists public.crozzo_sede_runtime
  add column if not exists business_id text not null default 'default';
alter table if exists public.crozzo_mesa_runtime
  add column if not exists business_id text not null default 'default';

-- 2. Índices por business_id
create index if not exists idx_comandas_business on public.comandas (business_id);
create index if not exists idx_sede_runtime_business on public.crozzo_sede_runtime (business_id);
create index if not exists idx_mesa_runtime_business on public.crozzo_mesa_runtime (business_id);

-- 3. Función helper: extraer business_id del JWT
create or replace function public.crozzo_business_id() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'business_id', ''),
    'default'
  );
$$;

-- 4. Políticas restrictivas (modo compatibilidad: permitir legacy si no hay JWT)
-- Comandas
drop policy if exists "allow all comandas" on public.comandas;
create policy "comandas_business_isolation" on public.comandas
  for all
  using (
    business_id = public.crozzo_business_id()
    or public.crozzo_business_id() = 'default'  -- modo compatibilidad legacy
  )
  with check (
    business_id = public.crozzo_business_id()
    or public.crozzo_business_id() = 'default'
  );

-- Sede runtime
drop policy if exists "allow all sede runtime" on public.crozzo_sede_runtime;
create policy "sede_runtime_business_isolation" on public.crozzo_sede_runtime
  for all
  using (
    business_id = public.crozzo_business_id()
    or public.crozzo_business_id() = 'default'
  )
  with check (
    business_id = public.crozzo_business_id()
    or public.crozzo_business_id() = 'default'
  );

-- Mesa runtime
drop policy if exists "allow all mesa runtime" on public.crozzo_mesa_runtime;
create policy "mesa_runtime_business_isolation" on public.crozzo_mesa_runtime
  for all
  using (
    business_id = public.crozzo_business_id()
    or public.crozzo_business_id() = 'default'
  )
  with check (
    business_id = public.crozzo_business_id()
    or public.crozzo_business_id() = 'default'
  );

-- 5. Fecha de expiración del modo compatibilidad (documentar)
-- Después de 2026-12-31, eliminar la cláusula "or public.crozzo_business_id() = 'default'"
-- y requerir JWT en todos los dispositivos.
comment on table public.comandas is 'RLS por business_id. Modo compatibilidad legacy hasta 2026-12-31.';
