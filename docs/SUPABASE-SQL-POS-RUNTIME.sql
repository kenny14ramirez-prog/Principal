-- Crozzo POS — Runtime de mesas/carritos por sede (Supabase)
-- Tabla única por sede para estado operativo (mesas, carritos, slots).
create table if not exists public.pos_runtime (
  location_id text primary key,
  business_id text,
  payload jsonb not null default '{}'::jsonb,
  saved_at timestamptz not null default now(),
  source_device_id text,
  source_role text,
  updated_at timestamptz not null default now(),
  version bigint not null default 0
);
create index if not exists pos_runtime_updated_at_idx on public.pos_runtime (updated_at desc);
alter table public.pos_runtime enable row level security;
