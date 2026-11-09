-- Crozzo POS — Runtime por mesa (particionado)
-- Una fila por mesa para evitar pisado multi-writer.
create table if not exists public.crozzo_mesa_runtime (
  location_id text not null,
  ref text not null,
  kind text not null default 'mesa',
  payload jsonb not null default '{}'::jsonb,
  saved_at timestamptz not null default now(),
  source_device_id text,
  updated_at timestamptz not null default now(),
  version bigint not null default 0,
  primary key (location_id, kind, ref)
);
create index if not exists crozzo_mesa_runtime_updated_idx on public.crozzo_mesa_runtime (location_id, updated_at desc);
alter table public.crozzo_mesa_runtime enable row level security;
