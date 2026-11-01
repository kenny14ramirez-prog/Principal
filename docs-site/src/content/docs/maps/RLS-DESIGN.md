---
title: "RLS DESIGN"
---

# Diseño RLS multi-tenant — Crozzo POS (Fase 1)

> Basado en reporte de investigación Supabase RLS. Diseño para migración de modo "POS simple" (USING true) a tenant-aware.

## 1. Modelo de tenancy

```
auth.users ──< business_members ──> businesses
                     │
                     └── location_ids[] (sedes accesibles)
businesses ──< locations
locations / businesses ──< invoices, customers, products, cash_registers, comandas, sales, ...
```

- Toda tabla de negocio tiene `business_id uuid not null references businesses(id)`.
- Tablas por sede además `location_id uuid references locations(id)`.
- `business_members(user_id, business_id, role, location_ids[])` es la única fuente de verdad de acceso.
- Roles: `owner`, `admin`, `manager`, `cashier`, `viewer` (enum `business_role`).
- Permisos finos opcionales: `role_permissions(role, permission)`.

## 2. Funciones security definer (schema `private`)

```sql
create schema if not exists private;

create or replace function private.user_business_ids()
returns setof uuid language sql security definer set search_path = ''
stable as $$ select business_id from public.business_members where user_id = (select auth.uid()) $$;

create or replace function private.has_business_role(p_business_id uuid, p_min_role text default 'viewer')
returns boolean language plpgsql security definer set search_path = ''
stable as $$ ... $$;  -- ver reporte Supabase RLS

create or replace function private.has_location_access(p_business_id uuid, p_location_id uuid)
returns boolean language sql security definer set search_path = ''
stable as $$ select exists (select 1 from public.business_members m where m.user_id = (select auth.uid()) and m.business_id = p_business_id and (m.location_ids is null or p_location_id = any(m.location_ids))) $$;
```

- `set search_path = ''` + nombres schema-calificados = defensa contra shadowing.
- Revoke execute from public; grant a authenticated.

## 3. Políticas por operación (patrón)

Ejemplo para `invoices` (aplicar a todas las tablas de negocio):

```sql
alter table public.invoices enable row level security;
alter table public.invoices force row level security;

revoke all on table public.invoices from anon, authenticated;
grant select, insert, update, delete on table public.invoices to authenticated;

create policy invoices_select on public.invoices for select to authenticated
using (business_id in (select private.user_business_ids())
  and (location_id is null or private.has_location_access(business_id, location_id)));

create policy invoices_insert on public.invoices for insert to authenticated
with check (business_id in (select private.user_business_ids())
  and private.has_business_role(business_id, 'cashier')
  and (location_id is null or private.has_location_access(business_id, location_id)));

create policy invoices_update on public.invoices for update to authenticated
using (business_id in (select private.user_business_ids()))
with check (business_id in (select private.user_business_ids())
  and private.has_business_role(business_id, 'manager'));

create policy invoices_delete on public.invoices for delete to authenticated
using (business_id in (select private.user_business_ids())
  and private.has_business_role(business_id, 'admin'));
```

Reglas:
- `INSERT`/`UPDATE` usan `WITH CHECK` (evita insertar con business_id de otro tenant).
- `UPDATE` combina `USING` (fila existente) + `WITH CHECK` (fila resultante).
- Una política por operación (no `FOR ALL`).
- Sin `USING (true)` salvo tablas genuinamente públicas.
- `to anon`/`to authenticated` explícito.

## 4. Grants y column-level

- Revoke all grants a anon/authenticated; grant mínimo.
- Column-level para columnas sensibles (cost_price, tax_id, primary_owner_user_id).
- Trigger `before update` como defense-in-depth (comparar old vs new).

## 5. Rendimiento

- Envolver funciones en `(select ...)`: `(select auth.uid())`, `(select private.user_business_ids())` → initPlan cacheado.
- Índice en toda columna usada en política: `business_id`, `location_id`, `user_id` en membresías.
- Membresías con PK `(business_id, user_id)` no indexa `user_id` → crear `idx_business_members_user_id`.
- Añadir filtros explícitos en queries (`.eq('business_id', id)`).
- Security definer para checks de 3+ tablas.
- `EXPLAIN (ANALYZE, BUFFERS)` para verificar Index Scan vs Seq Scan.

## 6. Vistas

Postgres 15+: `create view ... with (security_invoker = true)`. Versiones anteriores: revocar acceso o schema no expuesto.

## 7. Evitar recursión

Políticas que se leen entre sí (businesses ↔ business_members) generan `42P17`. Romper con security definer que lee una sola tabla.

## 8. Realtime

- Postgres Changes respeta RLS automáticamente.
- Broadcast/Presence requieren policies RLS sobre `realtime.messages` (extension broadcast/presence) y canal `private: true`.
- No hacer `ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY` (ya está).
- Usar `realtime.topic()` para filtrar por canal/tenant.
- Acceso a claims: `current_setting('request.jwt.claims')::json`.
- Caché de políticas por conexión → JWT corto (≤1h) + refresh.
- Recomendación POS: Broadcast para eventos alta frecuencia (comandas, presencia) con políticas por canal `pos-{business_id}-{location_id}`; Postgres Changes para datos críticos (facturas, inventario).

## 9. Storage

- Bucket por tipo: `invoices`, `crm_attachments`, `avatars`.
- RLS sobre `storage.objects` por `bucket_id` + tenant extraído del path.
- Nombrar archivos con UUID del business/entidad.
- Buckets públicos solo para assets verdaderamente públicos (logos). Facturas siempre privadas.
- Service key bypassa RLS → solo server.

## 10. Edge Functions

- Migrar a `@supabase/server` con `withSupabase` y modos de auth explícitos:
  - Funciones de usuario: `auth: 'user'` (JWT validado por plataforma, `verify_jwt = true`).
  - Cron/workers: `auth: 'secret'` (`verify_jwt = false`).
  - Webhooks externos: `auth: 'none'` + verificación de firma del proveedor.
- Nunca `ctx.supabaseAdmin` sin filtrar por `ctx.userClaims.id`.
- CORS: usar `withSupabase` o importar `corsHeaders` (allowlist). Evitar `*` en endpoints con datos sensibles.
- Rate limiting con Upstash Redis (`@upstash/ratelimit`).
- Validar entrada (Zod) y tamaños.
- Secretos: leer de `SUPABASE_SECRET_KEYS` o Vault; nunca hardcodear.

## 11. Secretos y rotación

- Usar publishable (`sb_publishable_...`) en cliente y secret (`sb_secret_...`) en server. Legacy `anon`/`service_role` deprecados a fin 2026.
- Crear secret keys separadas por componente.
- Secretos de DB (API keys de terceros por business) en Supabase Vault.
- Rotación documentada y probada.
- Nunca en source control, URLs, query params, logs.

## 12. Migración (orden sugerido)

1. Inventario de tablas sin RLS.
2. Schema: añadir `business_id`/`location_id` a tablas de negocio; crear `businesses`, `locations`, `business_members`, `role_permissions`.
3. Funciones: schema `private` + security definer.
4. Enable RLS + FORCE en todas las tablas expuestas.
5. Revoke all grants; grant mínimo.
6. Crear policies por operación.
7. Índices en columnas de política.
8. Vistas: security_invoker.
9. Realtime: policies en realtime.messages.
10. Storage: buckets + policies.
11. Edge Functions: migrar a @supabase/server.
12. Secrets: migrar a publishable/secret keys; Vault.
13. Tests pgTAP allow/deny por tabla y rol.
14. CI: bloquear deploy si fallan tests o hay tablas sin RLS.
15. Monitoreo: Security Advisor, logs de 42501.

## 13. Checklist de seguridad

- [ ] RLS habilitado en todas las tablas de public.
- [ ] FORCE RLS en tablas de negocio.
- [ ] Una política por operación.
- [ ] Sin USING (true) salvo tablas públicas justificadas.
- [ ] Sin FOR ALL.
- [ ] to anon/authenticated explícito.
- [ ] Grants mínimos (revocar all, grant solo lo necesario).
- [ ] Funciones de autorización en schema no expuesto, security definer, set search_path = ''.
- [ ] Sin uso de user_metadata para autorización.
- [ ] Índices en columnas de política.
- [ ] Funciones envueltas en (select ...).
- [ ] Vistas con security_invoker = true.
- [ ] Sin recursión entre políticas.
- [ ] JWT corto + refresh.
- [ ] Realtime: canales privados + policies.
- [ ] Storage: buckets privados + RLS por tenant.
- [ ] Edge Functions: auth mode explícito, CORS restringido, rate limiting, validación.
- [ ] Secret keys solo server; publishable en cliente.
- [ ] Vault para secretos en DB.
- [ ] Rotación documentada.
- [ ] pgTAP tests allow/deny.
- [ ] CI bloquea deploy si fallan tests o hay tablas sin RLS.
- [ ] Security Advisor revisado.
