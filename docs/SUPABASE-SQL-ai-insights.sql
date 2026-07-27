-- Crozzo AI Insights — secrets + historial (RLS)
-- Ejecutar en SQL Editor de Supabase (Super Admin → Nube → Paso 2).

create table if not exists public.crozzo_ai_secrets (
  business_id text primary key,
  api_key text not null,
  last4 text,
  updated_at timestamptz default now()
);

alter table public.crozzo_ai_secrets enable row level security;

-- Sin políticas para anon/authenticated: solo service_role (Edge Function) lee/escribe.

create table if not exists public.crozzo_ai_insights (
  id bigserial primary key,
  business_id text not null,
  range_kind text not null check (range_kind in ('8d', 'month')),
  range_from text,
  range_to text,
  text text not null,
  created_at timestamptz default now()
);

create index if not exists crozzo_ai_insights_biz_created
  on public.crozzo_ai_insights (business_id, created_at desc);

alter table public.crozzo_ai_insights enable row level security;

-- Lectura opcional por business_id en JWT (si usan claim); escritura solo service_role.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'crozzo_ai_insights' and policyname = 'crozzo_ai_insights_select_biz'
  ) then
    create policy crozzo_ai_insights_select_biz on public.crozzo_ai_insights
      for select
      using (
        business_id = coalesce(auth.jwt() ->> 'business_id', '')
      );
  end if;
end $$;

comment on table public.crozzo_ai_secrets is 'API keys NVIDIA por sede — solo Edge Function (service_role)';
comment on table public.crozzo_ai_insights is 'Historial de lecturas IA — rate limit + auditoría';
