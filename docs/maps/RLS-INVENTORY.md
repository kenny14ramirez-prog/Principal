# Inventario RLS — Supabase (Fase 1)

> Fuente: `app/modules/CrozzoSupabaseSqlBundles.js`, `CrozzoSupabaseSqlExtras.js`, docs SQL, reporte Supabase RLS. Generado 2026-11-01. Inventario estático (sin conexión a BD real).

## Resumen
- **Tablas identificadas:** 60 (en bundles; reporte menciona 63 incl. consecutivos y registro tokens).
- **Modo actual:** `crozzo_pos_all` policy `FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)` en la mayoría → **permisivo**.
- **Tenant-aware actual:** `crozzo_consecutivos`, `crozzo_consecutivo_asignaciones`, `crozzo_device_qr_slots`, `crozzo_mesa_runtime` (docs), `crozzo_ai_insights`, `crozzo_ai_secrets`.
- **Realtime:** `crozzo_sede_runtime`, `crozzo_mesa_runtime`, `comandas` en `supabase_realtime`.
- **Edge Function:** `ai-insights` (verify_jwt=false, CORS *, service role).

## Clasificación por tenancy

### A. Globales (sin business_id) — acceso controlado por rol
| Tabla | Tenancy | Sensibilidad | Prioridad |
|---|---|---|---|
| profiles | user (auth.users) | media | alta |
| users | user | media | alta |
| pos_system_owner | global (owner único) | alta | alta |
| crozzo_pos_owners | global | alta | alta |
| crozzo_business_registry | global | media | media |

### B. Por negocio (business_id) — sin location
| Tabla | Tenancy | Sensibilidad | Prioridad |
|---|---|---|---|
| products | business | media | alta |
| categories | business | media | media |
| taxes | business | media | media |
| clients | business | alta (PII) | alta |
| company_config | business | media | media |
| dian_config | business | alta (certs) | crítica |
| pos_staff | business | alta (PII) | alta |
| sync_queue | business | media | alta |
| audit_logs | business | alta | alta |
| crozzo_business_registry | business | media | media |
| crozzo_pos_owners | business | alta | alta |
| crozzo_reservorio_snapshots | business | media | media |
| crozzo_reservorio_sync_queue | business | media | media |
| crozzo_matriz_precios | business | media | media |
| crozzo_matriz_precios_items | business | media | media |
| crozzo_matriz_programaciones | business | media | media |
| crozzo_planilla_feed | business | media | media |
| crozzo_integracion_config | business | media | media |
| crozzo_ai_secrets | business (service role only) | crítica | crítica |
| crozzo_ai_insights | business | media | media |

### C. Por negocio + sede (business_id + location_id)
| Tabla | Tenancy | Sensibilidad | Prioridad |
|---|---|---|---|
| sales | business+location | alta | crítica |
| sale_items | business+location | alta | crítica |
| comandas | business+location | alta | crítica |
| devices | business+location | media | alta |
| device_configs | business+location | media | media |
| shift_closes | business+location | alta | alta |
| crozzo_sede_runtime | business+location | alta (realtime) | crítica |
| crozzo_mesa_runtime | business+location | alta (realtime) | crítica |
| crozzo_device_qr_slots | business+location | media | media |
| crozzo_crm_registro_tokens | business+location | media | media |
| crozzo_crm_registro_intake | business+location | alta (PII) | alta |

### D. Inventario / compras / costos (business + location)
| Tabla | Tenancy | Sensibilidad | Prioridad |
|---|---|---|---|
| proveedores | business | media | media |
| materias_primas | business | media | media |
| productos | business | media | media |
| recepciones | business+location | alta | alta |
| cortes_recepcion | business+location | alta | alta |
| facturas | business+location | alta | crítica |
| lotes_procesado | business+location | media | media |
| porciones_producidas | business+location | media | media |
| conteos_inventario | business+location | media | media |
| receta_ingredientes | business | media | media |
| pagos_internos | business | alta | alta |
| configuracion | business | media | media |
| usuarios | business | alta (PII) | alta |
| crozzo_proveedores_ops | business | media | media |
| crozzo_recepciones | business+location | alta | alta |
| crozzo_inventario_movimientos | business+location | media | media |
| crozzo_inventario_cierres | business+location | media | media |

### E. RRHH / nómina
| Tabla | Tenancy | Sensibilidad | Prioridad |
|---|---|---|---|
| crozzo_empleados | business | alta (PII) | alta |
| crozzo_marcaciones | business+location | alta | alta |
| crozzo_rrhh_config | business | media | media |
| crozzo_nomina_periodos | business | alta | alta |
| crozzo_pedidos_internos | business+location | media | media |

### F. Federación entre negocios
| Tabla | Tenancy | Sensibilidad | Prioridad |
|---|---|---|---|
| crozzo_bodegas | business | media | media |
| crozzo_remisiones | business | alta | alta |
| crozzo_federacion_entrante | business | alta | alta |
| crozzo_federacion_acuse | business | media | media |
| crozzo_federacion_socios | business | media | media |

### G. Consecutivos fiscales (ya tenant-aware por JWT)
| Tabla | Tenancy | Sensibilidad | Prioridad |
|---|---|---|---|
| crozzo_consecutivos | business (JWT claim) | crítica | crítica |
| crozzo_consecutivo_asignaciones | business (JWT claim) | crítica | crítica |

## Estado actual de RLS

| Tabla/Grupo | Política actual | Modo |
|---|---|---|
| La mayoría (public) | `crozzo_pos_all` FOR ALL USING(true) WITH CHECK(true) | permisivo |
| Runtime (sede/mesa/comandas) | `*_all` USING(true) WITH CHECK(true) | permisivo |
| Consecutivos | tenant por JWT `business_id = current_setting(...)` | tenant-aware (parcial) |
| Device QR slots | tenant por JWT | tenant-aware (parcial) |
| Mesa runtime | tenant por JWT | tenant-aware (parcial) |
| AI insights | `crozzo_ai_insights_select_biz` (SELECT only) + service_role write | restrictivo |
| AI secrets | RLS on, sin policies → solo service_role | restrictivo |
| Storage | policies por bucket + tenant en path | restrictivo |

## Riesgos críticos
1. **Tablas con PII** (clients, pos_staff, usuarios, empleados, marcaciones, crm_intake) con `USING (true)` → cualquier anon puede leer/escribir.
2. **Tablas fiscales** (dian_config, consecutivos, facturas) permisivas → riesgo de manipulación de numeración.
3. **Tablas financieras** (sales, sale_items, shift_closes) permisivas → riesgo de alteración de ventas.
4. **Runtime** (sede/mesa/comandas) permisivas → riesgo de inyección de datos de otro tenant.
5. **Tokens JWT** pueden estar desactualizados → membresía revocada sigue válida hasta expiración.

## Próximos pasos (Fase 1)
1. Crear schema `private` + funciones security definer (user_business_ids, has_business_role, has_location_access).
2. Crear tablas `businesses`, `locations`, `business_members`, `role_permissions`.
3. Enable RLS + FORCE en todas las tablas.
4. Revoke all grants a anon/authenticated; grant mínimo.
5. Crear policies por operación (SELECT/INSERT/UPDATE/DELETE) con USING/WITH CHECK.
6. Índices en business_id, location_id, user_id.
7. Vistas con security_invoker.
8. Realtime: policies en realtime.messages.
9. Storage: policies por bucket + tenant.
10. Edge Functions: migrar a @supabase/server, CORS, rate limit.
11. Secrets: publishable/secret keys, Vault.
12. Tests pgTAP allow/deny por tabla y rol.
13. CI: bloquear deploy si fallan tests o hay tablas sin RLS.

Ver diseño detallado en `docs/maps/RLS-DESIGN.md` (a crear) y reporte Supabase RLS.
