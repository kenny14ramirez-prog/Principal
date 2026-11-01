-- =============================================================================
-- DRAFT — pgTAP tests RLS (Fase 1)
-- =============================================================================
-- Requiere: pgTAP instalado (create extension if not exists pgtap).
-- Ejecutar en staging tras aplicar RLS-HARDENING.sql.
-- =============================================================================

create extension if not exists pgtap;

-- Test 1: RLS habilitado en tablas críticas
select plan(10);

select ok(
  (select relrowsecurity from pg_class where relname = 'sales'),
  'sales tiene RLS habilitado'
);
select ok(
  (select relrowsecurity from pg_class where relname = 'comandas'),
  'comandas tiene RLS habilitado'
);
select ok(
  (select relrowsecurity from pg_class where relname = 'devices'),
  'devices tiene RLS habilitado'
);
select ok(
  (select relrowsecurity from pg_class where relname = 'dian_config'),
  'dian_config tiene RLS habilitado'
);
select ok(
  (select relrowsecurity from pg_class where relname = 'facturas'),
  'facturas tiene RLS habilitado'
);
select ok(
  (select relrowsecurity from pg_class where relname = 'crozzo_sede_runtime'),
  'crozzo_sede_runtime tiene RLS habilitado'
);
select ok(
  (select relrowsecurity from pg_class where relname = 'crozzo_mesa_runtime'),
  'crozzo_mesa_runtime tiene RLS habilitado'
);
select ok(
  (select relrowsecurity from pg_class where relname = 'crozzo_ai_secrets'),
  'crozzo_ai_secrets tiene RLS habilitado'
);
select ok(
  (select relrowsecurity from pg_class where relname = 'profiles'),
  'profiles tiene RLS habilitado'
);
select ok(
  (select relrowsecurity from pg_class where relname = 'crozzo_pos_owners'),
  'crozzo_pos_owners tiene RLS habilitado'
);

select * from finish();

-- Test 2: FORCE RLS
select plan(1);
select ok(
  (select relforcerowsecurity from pg_class where relname = 'sales'),
  'sales tiene FORCE RLS'
);
select * from finish();

-- Test 3: Cross-tenant denial (requiere dos usuarios de negocios distintos)
-- Ejemplo (adaptar con auth.uid() de test):
-- set role authenticated;
-- set request.jwt.claims = '{"sub":"<user_a_uuid>","role":"authenticated"}';
-- select is(
--   (select count(*) from public.sales where business_id = '<business_b_uuid>'),
--   0::bigint,
--   'Usuario A no ve ventas de negocio B'
-- );
-- reset role;

-- Test 4: Anon no puede leer tablas de negocio
-- set role anon;
-- select throws_ok(
--   'select * from public.sales limit 1',
--   '42501',
--   null,
--   'anon no tiene SELECT en sales'
-- );
-- reset role;

-- Test 5: AI secrets solo service_role
-- set role authenticated;
-- select throws_ok(
--   'select * from public.crozzo_ai_secrets limit 1',
--   '42501',
--   null,
--   'authenticated no lee crozzo_ai_secrets'
-- );
-- reset role;

-- =============================================================================
-- NOTA: Completar con casos allow/deny para cada tabla y rol.
-- Objetivo: 1 test por tabla x operación x rol (mínimo).
-- =============================================================================
