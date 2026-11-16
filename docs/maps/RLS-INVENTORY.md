# RLS Inventory — POS Crozzo

Inventario de tablas críticas sujetas a RLS por `business_id`.

## Tablas críticas
- sales
- comandas
- devices
- dian_config
- facturas
- crozzo_sede_runtime
- crozzo_mesa_runtime
- crozzo_ai_secrets
- profiles
- crozzo_pos_owners

## Funciones privadas
- user_business_ids
- has_business_role
- has_location_access

## Modo compatibilidad
Legacy hasta 2026-12-31 (cláusula `or public.crozzo_business_id() = 'default'`).