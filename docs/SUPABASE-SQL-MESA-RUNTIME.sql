-- ============================================================
-- Supabase → SQL Editor → pegar todo → Run (▶)
-- Tabla: public.crozzo_mesa_runtime (runtime particionado por mesa/slot)
-- ============================================================

create extension if not exists "pgcrypto" with schema extensions;

create table if not exists public.crozzo_mesa_runtime (
  location_id text not null default 'default',
  kind text not null,
  ref text not null,
  business_id text not null default 'default',
  payload jsonb not null default '{}'::jsonb,
  source_device_id text,
  source_role text,
  updated_at timestamptz not null default now(),
  primary key (location_id, kind, ref)
);

create index if not exists idx_crozzo_mesa_runtime_loc on public.crozzo_mesa_runtime (location_id);
create index if not exists idx_crozzo_mesa_runtime_business on public.crozzo_mesa_runtime (business_id);
create index if not exists idx_crozzo_mesa_runtime_updated on public.crozzo_mesa_runtime (updated_at);

-- RLS POS pattern
alter table public.crozzo_mesa_runtime enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename='crozzo_mesa_runtime' and policyname='pos_tenant') then
    create policy pos_tenant on public.crozzo_mesa_runtime
      for all to anon, authenticated
      using (business_id = current_setting('request.jwt.claims', true)::json->>'business_id' or business_id = 'default')
      with check (true);
  end if;
end $$;
EOF