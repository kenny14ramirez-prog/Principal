-- ============================================================
-- Supabase → SQL Editor → pegar todo → Run (▶)
-- Tabla: public.crozzo_device_qr_slots (registro interno de QRs entre dispositivos)
-- ============================================================

create extension if not exists "pgcrypto" with schema extensions;

create table if not exists public.crozzo_device_qr_slots (
  id text primary key,
  business_id text not null default 'default',
  location_id text not null default 'default',
  device_id text not null default '',
  device_role text not null default 'B',
  device_name text not null default '',
  slot_key text not null default '',
  scan_text text not null default '',
  payload_json jsonb not null default '{}'::jsonb,
  built_at timestamptz not null default now(),
  valid_until timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_crozzo_device_qr_slots_business on public.crozzo_device_qr_slots (business_id);
create index if not exists idx_crozzo_device_qr_slots_location on public.crozzo_device_qr_slots (location_id);
create index if not exists idx_crozzo_device_qr_slots_valid on public.crozzo_device_qr_slots (valid_until);

alter table public.crozzo_device_qr_slots enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename='crozzo_device_qr_slots' and policyname='pos_tenant') then
    create policy pos_tenant on public.crozzo_device_qr_slots
      for all to anon, authenticated
      using (business_id = current_setting('request.jwt.claims', true)::json->>'business_id' or business_id = 'default')
      with check (true);
  end if;
end $$;
EOF