-- =============================================================================
-- DRAFT — Migración de datos para RLS multi-tenant (Fase 1)
-- =============================================================================
-- Asigna business_id por defecto a tablas existentes (datos legacy).
-- Ejecutar ANTES de habilitar RLS en producción (en staging primero).
-- =============================================================================

-- 1. Crear negocio por defecto si no existe
insert into public.businesses (id, name, slug)
values ('00000000-0000-0000-0000-000000000001', 'Negocio por defecto', 'default')
on conflict (id) do nothing;

-- 2. Crear sede por defecto
insert into public.locations (id, business_id, name)
values ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Sede principal')
on conflict (id) do nothing;

-- 3. Asignar business_id a tablas de negocio (ejemplo para tablas críticas)
-- Repetir para cada tabla con business_id nullable.
update public.sales set business_id = '00000000-0000-0000-0000-000000000001' where business_id is null;
update public.sale_items set business_id = '00000000-0000-0000-0000-000000000001' where business_id is null;
update public.comandas set business_id = '00000000-0000-0000-0000-000000000001' where business_id is null;
update public.devices set business_id = '00000000-0000-0000-0000-000000000001' where business_id is null;
update public.device_configs set business_id = '00000000-0000-0000-0000-000000000001' where business_id is null;
update public.shift_closes set business_id = '00000000-0000-0000-0000-000000000001' where business_id is null;
update public.dian_config set business_id = '00000000-0000-0000-0000-000000000001' where business_id is null;
update public.pos_staff set business_id = '00000000-0000-0000-0000-000000000001' where business_id is null;
update public.audit_logs set business_id = '00000000-0000-0000-0000-000000000001' where business_id is null;
update public.sync_queue set business_id = '00000000-0000-0000-0000-000000000001' where business_id is null;
update public.facturas set business_id = '00000000-0000-0000-0000-000000000001' where business_id is null;
update public.crozzo_sede_runtime set business_id = '00000000-0000-0000-0000-000000000001' where business_id is null;
update public.crozzo_mesa_runtime set business_id = '00000000-0000-0000-0000-000000000001' where business_id is null;
update public.crozzo_device_qr_slots set business_id = '00000000-0000-0000-0000-000000000001' where business_id is null;
update public.profiles set business_id = '00000000-0000-0000-0000-000000000001' where business_id is null;
update public.crozzo_pos_owners set business_id = '00000000-0000-0000-0000-000000000001' where business_id is null;

-- 4. Asignar location_id por defecto (donde aplique)
update public.sales set location_id = '00000000-0000-0000-0000-000000000002' where location_id is null;
update public.comandas set location_id = '00000000-0000-0000-0000-000000000002' where location_id is null;
update public.devices set location_id = '00000000-0000-0000-0000-000000000002' where location_id is null;
update public.shift_closes set location_id = '00000000-0000-0000-0000-000000000002' where location_id is null;
update public.crozzo_sede_runtime set location_id = '00000000-0000-0000-0000-000000000002' where location_id is null;
update public.crozzo_mesa_runtime set location_id = '00000000-0000-0000-0000-000000000002' where location_id is null;

-- 5. Hacer NOT NULL después de migración (opcional, en staging)
-- alter table public.sales alter column business_id set not null;
-- (repetir para tablas críticas)

-- =============================================================================
-- NOTA: Ajustar UUIDs por negocio real. Ejecutar en staging antes de producción.
-- =============================================================================
