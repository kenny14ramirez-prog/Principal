-- Crozzo POS — Slots de QR por dispositivo (pairing interno)
create table if not exists public.device_qr_slots (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  location_id text,
  business_id text,
  scan_text text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);
create index if not exists device_qr_slots_device_idx on public.device_qr_slots (device_id, created_at desc);
alter table public.device_qr_slots enable row level security;
