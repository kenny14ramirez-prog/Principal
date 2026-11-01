---
title: "RLS STAGING APPLY"
---

# Guía de aplicación RLS en staging (Fase 1)

> Aplicar SOLO en ambiente de habilitación/staging. NO en producción sin validación.

## Pre-requisitos
- Acceso a Supabase SQL Editor (staging project).
- Backup de la BD (Supabase Dashboard → Database → Backups).
- Variables: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` para tests.

## Pasos

### 1. Aplicar schema de tenancy + funciones
- Ejecutar secciones 1-2 de `docs/SUPABASE-SQL-RLS-HARDENING.sql` (schema `private`, funciones, tablas `businesses`, `locations`, `business_members`, `role_permissions`).

### 2. Migrar datos existentes
- Ejecutar `docs/SUPABASE-MIGRATION-DATA.sql` (negocio/sede por defecto + asignar business_id/location_id).

### 3. Habilitar RLS + FORCE + revoke/grant + policies
- Ejecutar secciones 3-7 del draft SQL (adaptando para todas las tablas según `RLS-INVENTORY.md`).

### 4. Índices
- Ejecutar sección 7 (índices en business_id, location_id).

### 5. Vistas / Realtime / Storage / Edge Functions
- Vistas: `security_invoker = true`.
- Realtime: policies en `realtime.messages`.
- Storage: policies por bucket + tenant.
- Edge Functions: migrar a `@supabase/server`.

### 6. Secrets
- Migrar a publishable/secret keys.
- Vault para secretos en DB.

### 7. Validar
- Ejecutar `docs/SUPABASE-TESTS-RLS.sql` (pgTAP).
- Verificar Security Advisor (Dashboard).
- Probar cross-tenant denial (2 usuarios de negocios distintos).
- Probar anon denial.

### 8. Rollback
- Restaurar backup de BD si falla.
- Revertir policies con `drop policy` + `create policy ... using (true)`.

## Checklist
- [ ] Backup creado
- [ ] Schema private + funciones aplicados
- [ ] Tablas de tenancy creadas
- [ ] Datos migrados (business_id/location_id no null)
- [ ] RLS + FORCE en tablas críticas
- [ ] Policies por operación creadas
- [ ] Índices creados
- [ ] pgTAP tests PASS
- [ ] Security Advisor sin hallazgos críticos
- [ ] Cross-tenant denial verificado
- [ ] Anon denial verificado
- [ ] Rollback documentado y probado
