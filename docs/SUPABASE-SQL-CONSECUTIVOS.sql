-- ============================================================
-- Supabase → SQL Editor → pegar todo → Run (▶)
-- Secuenciador atómico de consecutivos fiscales (P0-03)
-- Tablas: crozzo_consecutivos, crozzo_consecutivo_asignaciones
-- RPC: crozzo_next_consecutivo
-- ============================================================

create extension if not exists "pgcrypto" with schema extensions;

-- ---------- 1) Contador por negocio/prefijo/resolución ----------
create table if not exists public.crozzo_consecutivos (
  business_id text not null default 'default',
  prefijo text not null default '',
  resolucion text not null default '',
  next_value bigint not null default 1,
  rango_desde bigint not null default 1,
  rango_hasta bigint,
  updated_at timestamptz not null default now(),
  primary key (business_id, prefijo, resolucion)
);

create index if not exists idx_crozzo_consecutivos_biz
  on public.crozzo_consecutivos (business_id);

-- ---------- 2) Idempotencia por venta ----------
create table if not exists public.crozzo_consecutivo_asignaciones (
  business_id text not null default 'default',
  sale_attempt_id text not null,
  prefijo text not null default '',
  resolucion text not null default '',
  consecutivo bigint not null,
  created_at timestamptz not null default now(),
  primary key (business_id, sale_attempt_id)
);

create index if not exists idx_crozzo_consec_asig_biz
  on public.crozzo_consecutivo_asignaciones (business_id);

-- ---------- 3) RPC atómico ----------
create or replace function public.crozzo_next_consecutivo(
  p_business_id text,
  p_prefijo text,
  p_resolucion text,
  p_sale_attempt_id text
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing bigint;
  v_next bigint;
  v_hasta bigint;
begin
  -- Idempotencia: si ya se asignó para esta venta, devolver el mismo.
  select consecutivo into v_existing
  from public.crozzo_consecutivo_asignaciones
  where business_id = p_business_id
    and sale_attempt_id = p_sale_attempt_id;
  if v_existing is not null then
    return v_existing;
  end if;

  -- Row-lock implícito por UPDATE → serializa asignaciones por fila.
  update public.crozzo_consecutivos
     set next_value = next_value + 1,
         updated_at = now()
   where business_id = p_business_id
     and prefijo = p_prefijo
     and resolucion = p_resolucion
  returning next_value - 1 into v_next;

  if v_next is null then
    raise exception 'secuenciador no inicializado para %/%/%', p_business_id, p_prefijo, p_resolucion;
  end if;

  select rango_hasta into v_hasta
  from public.crozzo_consecutivos
  where business_id = p_business_id
    and prefijo = p_prefijo
    and resolucion = p_resolucion;

  if v_hasta is not null and v_next > v_hasta then
    raise exception 'rango de consecutivos agotado';
  end if;

  insert into public.crozzo_consecutivo_asignaciones (business_id, sale_attempt_id, prefijo, resolucion, consecutivo)
  values (p_business_id, p_sale_attempt_id, p_prefijo, p_resolucion, v_next)
  on conflict (business_id, sale_attempt_id) do nothing;

  -- Si otro proceso ganó la idempotencia, devolver el suyo.
  select consecutivo into v_existing
  from public.crozzo_consecutivo_asignaciones
  where business_id = p_business_id
    and sale_attempt_id = p_sale_attempt_id;
  if v_existing is not null and v_existing <> v_next then
    -- Revertir el incremento (mejor esfuerzo; el hueco se acepta por concurrencia)
    return v_existing;
  end if;

  return v_next;
end;
$$;

grant execute on function public.crozzo_next_consecutivo(text, text, text, text) to anon, authenticated;

-- ---------- 4) RLS + permisos ----------
alter table public.crozzo_consecutivos enable row level security;
alter table public.crozzo_consecutivo_asignaciones enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename='crozzo_consecutivos' and policyname='pos_tenant') then
    create policy pos_tenant on public.crozzo_consecutivos
      for all to anon, authenticated
      using (business_id = current_setting('request.jwt.claims', true)::json->>'business_id' or business_id = 'default')
      with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='crozzo_consecutivo_asignaciones' and policyname='pos_tenant') then
    create policy pos_tenant on public.crozzo_consecutivo_asignaciones
      for all to anon, authenticated
      using (business_id = current_setting('request.jwt.claims', true)::json->>'business_id' or business_id = 'default')
      with check (true);
  end if;
end $$;

select public.crozzo_fix_all_grants();