# POS Crozzo — Revisión Integral y Propuestas de Mejora (2026)

**Fecha:** 2026-11-13
**Alcance:** Revisión completa del proyecto (arquitectura, sync/offline, seguridad/fiscal, inventario/caja/impresión, calidad/tests) + investigación de mercado y tendencias.
**Método:** 5 agentes de exploración en paralelo + 5 búsquedas web (local-first, DIAN, Tauri/SQLite, KDS, RLS multi-tenant).
**Estado:** Análisis únicamente. No se modificó código de producción.

---

## 0. Resumen ejecutivo

El POS Crozzo es un sistema **maduro y ambicioso** con capacidades reales multi-dispositivo (PC caja, tablets, cocina, BLE mesh, WebRTC, LAN) y una capa offline-first sobre `localStorage` + IndexedDB. Los análisis previos (`POS-MAESTRO-ANALISIS-PLAN.md`) ya identificaron los riesgos P0-P3. Esta revisión **confirma y amplía** esos hallazgos con evidencia nueva del código y del mercado.

**Veredicto en una línea:** la intención arquitectónica es sólida, pero la **ejecución es frágil por tres causas raíz**: (1) persistencia en `localStorage` monolítico, (2) seguridad/fiscal con backdoor y RLS permisivo, (3) código monolítico de 53k líneas sin tests unitarios reales. La tendencia del mercado 2026 (local-first + SQLite + sync engine dedicado + RLS endurecido) coincide exactamente con las recomendaciones previas, lo que valida la dirección y reduce el riesgo de elegir el stack equivocado.

**Top 5 acciones inmediatas (P0):**
1. Eliminar backdoor superadmin `KENNY`/`141414` y credenciales por defecto.
2. No persistir P12 + contraseña en `localStorage`; usar vault del SO o fallar cerrado.
3. Endurecer RLS: quitar bypass `'default'`, cubrir tablas faltantes, exigir JWT `business_id`.
4. Implementar persistencia durable (SQLite/Tauri) para facturas/outbox/auditoría (retención 5 años).
5. No fabricar CUFE local en `dataicoStamp`; dejar `cufe=''` + `pending:true`.

---

## 1. Hallazgos por área

### 1.1 Arquitectura y deuda técnica

- `app/core/CrozzoPosMain.js`: **53.771 líneas / 2.34 MB**, 2.859 `function`, 2.031 `window.`. Monolito global.
- `src/` contiene **31 archivos stale no presentes en `app/`** (p.ej. `src/CrozzoPosMain.js`, `src/core/CrozzoPosMain.js.backup`), dead weight y fuente de confusión.
- `src-tauri`: 38 archivos Rust / ~10.9k líneas, **151 comandos Tauri**, 2 módulos gigantes (`crozzo_external.rs` 1.969 líneas, `crozzo_lan_sync_server.rs` 1.852). `Cargo.toml` versión `0.1.0` vs app `1.0.296`.
- Capabilities muy amplias (`allow-crozzo-devtools`, `http:` en `connect-src`), CSP permisiva.
- `npm audit`: **7 vulnerabilidades (1 crítica, 5 altas, 1 moderada)**; `pdfjs-dist` 3.11 → 6.5, updater 2.10 → 2.14.
- `src-tauri/target` local ≈ **47.5 GB**; artefacto monolito `Crozzo_POS_Completo.html` 1.4 MB stale.
- Pipeline `sync` de 6 pasos con pasos opcionales que pueden caer a stale; bundles duplicados en `app/` y `src/`.

### 1.2 Sync y datos offline

- Reservorio monolítico en un solo key `crozzo_reservorio_v1` (proveedores, recepciones, facturas, cortes, inventario, costeo, cotizaciones, menú, recetas, matriz, planilla, syncQueue, feLinks, meta). Backups solo 2 niveles.
- `trimForQuota` recorta histórico (recepciones >365 días → slim archive; inventarioMovimientos; syncQueue done) → pérdida de trazabilidad si no hubo sync.
- Cola global `crozzo_sync_queue` + legacy `sync_queue_temp`; dedup solo si el caller provee TID estable; sin TID → UUID random → no dedup.
- Sin lock cross-tab → races de last-write-wins.
- Runtime cloud sync (`crozzo_sede_runtime`/`crozzo_mesa_runtime`) hace merge-on-write con `_version` incrementado, pero upsert por `location_id` sin condición optimista → pérdidas concurrentes.
- HLC existe (`CrozzoHlc`) pero **no se persiste** y **no se usa** en decisiones de merge; tombstones son **locales y TTL 30 días** → no propagan borrados.
- `CrozzoOutboxRuntime` (outbox persistente) es **código muerto** y su dedup key `runtime:<slot>` es **peligrosamente gruesa** (pierde updates intermedios).
- IndexedDB (`CrozzoRuntimeIndexedDb`, `CrozzoBlobStore`) sin purga automática de blobs ni migraciones de schema.
- RLS: compatibilidad `'default'` hasta 2026-12-31; tablas `pos_runtime`, `device_qr_slots` con RLS habilitado pero sin políticas; `sync_queue` sin procesador documentado.

### 1.3 Seguridad y fiscal (DIAN)

- **Backdoor shipped:** `LEGACY_KENNY_PIN = '141414'`, `crozzoIsKennyMasterPin`, `crozzoAcceptKennyLegacy141414Login`, `crozzoKennyMasterClearAllSecurityBlocks`. Credencial no rotable en código fuente.
- Cuentas señuelo con contraseñas débiles (`admin`, `1234`, `cajero`, `mesero`) activas salvo `produccionEstricta`.
- Auth client-side: lockout en `sessionStorage` (se resetea por pestaña), fallback plaintext si no hay `crypto.subtle`.
- Certificado P12 + contraseña persistidos en `localStorage` (`pos_dian_config`); vault del SO opcional con fallback.
- `dataicoStamp` calcula CUFE local (SHA-384 sobre solo 7 campos) cuando la PT no devuelve CUFE → CUFE inválido DIAN.
- `persistirSQLite()` retorna `false` (no implementado) → no cumple retención 5 años (art. 632 ET).
- RLS legacy bypass `'default'` → exposición cross-tenant hasta 2026-12-31.
- Audit hash djb2 (32-bit) trivialmente colisionable; log cap 300 en localStorage.
- QR vía `api.qrserver.com` (fuga de datos + dependencia externa); existe `CrozzoQRCode.js` local no usado consistentemente.
- Permisos client-side only; `facturar` único para POS y FE; no hay `facturar_fe`/`anular_factura`/`nota_credito`.

### 1.4 Inventario, caja e impresión

- `facturar` ~600 líneas mezclando validación, build, persistencia, inventario, CRM, sync, UI; POS y FE duplican lógica.
- FE no registra propina (llamada a `crozzoEnrichCuentaFacturaColombia` sin `propinaMonto`/`propinaPct`).
- Side effects (inventario, CRM, cloud) envueltos en `catch (_) {}` silenciosos.
- Inventario: `inferModoLinea` depende de `CrozzoCatalogoMp` cargado; si no, líneas receta caen a `ninguno` y no descuentan stock silenciosamente.
- Reversión: heurística trata `ninguno` con producto en catálogo como retail → puede inflar stock; `devolverVenta` llamado por línea (primera elimina todo, las demás no-op pero cuentan).
- Cierre de turno: auto-cierre sin lock cross-tab; 40 catches vacíos; caches con invalidación frágil.
- Impresión: cola cap 40 con `slice(-25)` descarta jobs sin estado; timeout 45s aborta JS pero el print Rust puede seguir → duplicados; CP850 reemplaza chars sin aviso.
- Facturas page: anular por índice `idx` (riesgo si el array cambia); `config.save()` ignorado.
- Tablets: `canSeePage` fail-open al lanzar excepción; tap dedup 320ms puede tragar taps legítimos.

### 1.5 Calidad y tests

- No hay `npm test` canónico; CI corre solo 6 checks de ~90 scripts.
- `check-maps-fresh.mjs` no idempotente (timestamps en archivos generados); maps no commiteados → falla en clone fresco.
- `known-issues.json` falta → `issues:validate` falla.
- `check-rls-coherence.mjs` espera `SUPABASE-SQL-RLS-HARDENING.sql` inexistente → CI falla.
- `run-tests.mjs` falla por `qrcode` no instalado.
- Sin ESLint/Prettier/TS; sin coverage; Rust tests sintéticos (reimplementan funciones).
- `_stress-comandas-tienda-audit.mjs` reporta 9 issues pero exit 0 → CI verde con problemas.
- 138 artefactos generados sin ignorar (QA out, runs, PDFs, stamps, logs).

---

## 2. Investigación de mercado y tendencias (2026)

### 2.1 Local-first / sync

Fuentes: Smashing Magazine 2026, Turso, PowerSync, ElectricSQL, RxDB, expo local-first.

Conclusiones clave:
- **SQLite es el estándar de facto** para apps locales (Tauri, móviles, web via WASM/OPFS). Crozzo ya usa Tauri → migrar a SQLite es natural y de bajo riesgo.
- La pregunta 2026 ya no es "CRDT o OT" sino **"qué frontera de sync"**: filas Postgres, ops de documento, o event logs. Para un POS con inventario y facturación, **event log + LWW por campo con HLC** es el mejor trade-off; CRDTs complejos (Yjs) solo si hay colaboración rica (no es el caso).
- **PowerSync** (Postgres→SQLite one-way + write-back) se considera más estable que ElectricSQL (full active-active) en 2026. **Turso Sync** ofrece bidireccional con detección de conflictos.
- Patrones recomendados: local store first → reconcile on reconnect; idempotency keys; vector clocks/HLC; outbox con backoff; tombstones para deletes; **no falsificar offline con colas de requests**.
- `cr-sqlite` (CRDT columns en SQLite) es prometedor pero aún early-stage (2025); revisitar.

Aplicación a Crozzo: migrar de `localStorage` monolítico a **SQLite (Tauri) + sync engine** (PowerSync/Turso o propio con CDC) valida y acelera las Fases 1-2 del plan maestro.

### 2.2 DIAN / facturación electrónica Colombia

Fuentes: DIAN (Res. 165/2023 art. 37, Res. 227/2025), Alegra, Facele, Posdata, Katuq, DDDinvoices, LLB Solutions (draft 2026).

Conclusiones clave:
- Contingencia: **48h** para transmitir tras superar el inconveniente; no es plazo referencial.
- Si la falla es de la DIAN: se puede entregar factura sin validación previa y transmitir dentro de 48h del restablecimiento.
- DIAN cae regularmente (fin de mes); se deben verificar 4 intentos con intervalo 20s antes de decretar contingencia propia; almacenar evidencia del error del servidor.
- Se debe solicitar **rango de contingencia simultáneo** al rango regular (ej. 5.000 números reservados); si no hay rango, no se puede facturar = no se puede cobrar.
- Borrador DIAN 2026: mecanismo de regularización voluntaria para no cumplimiento (facturas pendientes, corrección de documentos), sin modificar régimen ni limitar fiscalización.
- Factura válida = XML firmado UBL 2.1 validado por DIAN; PDF es solo representación gráfica; CUFE real obligatorio; RADIAN para eventos de acuse/aceptación en ventas a crédito.
- Proveedores (Alegra, Facele, Posdata) destacan: POS y facturación DIAN deben estar **desacoplados** (POS opera sin conexión, FE se emite al recuperar conexión) — exactamente lo que Crozzo ya intenta, pero debe ser robusto.

Aplicación a Crozzo: endurecer detección de contingencia (4 intentos/20s, evidencia), solicitar rango de contingencia, automatizar drenaje con SLA 48h, no fabricar CUFE, preparar para regularización voluntaria 2026.

### 2.3 Tauri 2 desktop

Fuentes: tauri.app (SQL plugin, updater), Rustify 2026, Aptabase, medium (tauri-plugin-sync).

Conclusiones clave:
- `tauri-plugin-sql` soporta SQLite con migraciones (`MigrationKind::Up`) y preload en `tauri.conf.json`. Ideal para Crozzo.
- `tauri-plugin-sync` (comunidad) ofrece CDC automático vía triggers shadow con outbox `_sync_changes`, overhead <0.09ms, probado con 1.000 writes concurrentes. Early-stage (0.1.0) pero prometedor.
- Updater: firma criptográfica de paquetes, variables dinámicas `{{current_version}}`, `{{target}}`, `{{arch}}`; no requiere reinicio inmediato.
- Capacidades por ventana (no globales) y permisos fine-grained desde v2 — Crozzo aún usa capabilities amplias.
- SQLite con WAL mode para writes <0.38ms; migraciones con sqlx.

Aplicación a Crozzo: usar `tauri-plugin-sql` para facturas/outbox/auditoría; endurecer capabilities por ventana; alinear versión Cargo con app; evaluar `tauri-plugin-sync` para CDC.

### 2.4 KDS y restaurantes

Fuentes: Bhojan Setu, Quickbuy, TCANG, Delivety, Quantic, TechRyde, TicknCook, eatOS (2026).

Conclusiones clave:
- Tendencias 2026: **offline/hybrid obligatorio**, multi-estación con routing por área, prep-time analytics por ticket/item, recall/bump history, allergen/modifier display, multi-canal (POS + delivery + online ordering), hardware flexible (cualquier tablet/Smart TV, no cajas propietarias), pricing plano por outlet (no por pantalla).
- 60% de nuevos restaurantes en Norteamérica usan KDS; adopción crece por delivery y presión laboral.
- KDS integrado en POS vs. especializado: para cocina simple basta el del POS; para multi-estación/delivery conviene especializado con integración directa.
- Offline: cachear órdenes localmente, queue de modifiers, impresión de emergencia solo si necesario, back-sync automático.

Aplicación a Crozzo: mejorar KDS (lanes por estación, batching de platos iguales, waiter routing, timing/analytics), garantizar offline robusto, evitar dependencia de hardware propietario, integrar delivery/online ordering.

### 2.5 Seguridad / RLS multi-tenant

Fuentes: Makerkit, Road to Enterprise, iloveblogs, Starmorph, nhimg, DEV Community, supabase agent-skills.

Conclusiones clave:
- **RLS en todas las tablas del schema public, sin excepciones.** Supabase depreca keys legacy `anon`/`service_role` a finales de 2026 → migrar a publishable/secret keys.
- `service_role`/secret key **nunca en cliente**; bypassa RLS.
- Patrón producción: habilitar RLS → set tenant en transacción (`set_config('app.tenant_id', $1, true)`) → policy contra GUC → respetar connection pool. En Supabase, usar JWT claim `business_id` + `auth.uid()`.
- `SECURITY DEFINER` functions en schema no expuesto; `STABLE` para caching; índices en columnas usadas en policies.
- `security_invoker = true` en views (PG15+).
- Pruebas negativas: setear rol/claim manualmente y verificar que cross-tenant reads devuelven 0 filas.
- RLS es la **última** capa de defensa, no la única; combinar con tenant context explícito y tests.

Aplicación a Crozzo: eliminar compat `'default'`, cubrir todas las tablas, migrar a publishable/secret keys, añadir tests negativos de tenant isolation, documentar deprecación.

---

## 3. Propuestas de mejora consolidadas (priorizadas)

### P0 — Crítico (antes de cualquier release fiscal/tenant)

| # | Acción | Archivo(s) clave | Esfuerzo |
|---|--------|-------------------|----------|
| 1 | Eliminar backdoor superadmin `KENNY`/`141414` y `crozzoKennyMasterClearAllSecurityBlocks` | `app/core/CrozzoAuthSecurity.js` | Bajo |
| 2 | No persistir P12+password en `localStorage`; usar vault SO o fallar cerrado | `CrozzoPosConfigManager.js`, `CrozzoPosDianLib.js` | Medio |
| 3 | Endurecer RLS: quitar bypass `'default'`, cubrir `pos_runtime`, `device_qr_slots`, audit/fiscal; exigir JWT `business_id` | `docs/SUPABASE-SQL-*.sql` | Medio |
| 4 | Persistencia durable SQLite (Tauri) para facturas/outbox/auditoría (retención 5 años) | `CrozzoContingenciaFiscal.persistirSQLite()`, nuevo módulo Rust | Alto |
| 5 | No fabricar CUFE local en `dataicoStamp` | `CrozzoPosDianLib.js` | Bajo |
| 6 | Generar QR local (usar `CrozzoQRCode.js`) en lugar de `api.qrserver.com` | Print/FE modules | Bajo |
| 7 | Reemplazar djb2 por SHA-256 encadenado en auditoría | `crozzoAuditChainHash` | Medio |
| 8 | Separar permisos POS vs FE (`facturar_pos`/`facturar_fe`, `anular_factura`, `nota_credito`) | `CrozzoPermisosPolicy.js`, `CrozzoPosMain.js` | Medio |

### P1 — Alto (robustez operativa)

| # | Acción | Archivo(s) clave | Esfuerzo |
|---|--------|-------------------|----------|
| 9 | Migrar `localStorage` monolítico a SQLite (Tauri) con migraciones; mantener `localStorage` solo para settings | `CrozzoReservorio*.js`, nuevo Rust | Alto |
| 10 | Outbox persistente para runtime (corregir dedup key a `runtime:<slot>:<savedAt>` o latest-wins) | `CrozzoOutboxRuntime.js`, `CrozzoPosRuntimeCloud.js` | Medio |
| 11 | Persistir HLC en IndexedDB/localStorage y restaurar al boot; detectar clock skew | `CrozzoHlc*.js` | Medio |
| 12 | Tombstones sincronizados y de larga vida (90-365 días) | `CrozzoTombstones*.js` + Supabase | Medio |
| 13 | Unificar idempotencia: TID estable obligatorio; derivar de `(tabla, op, id, hash)` si falta | `CrozzoPosCloud.enqueueOfflineOperation` | Medio |
| 14 | Lock cross-tab para cola global y auto-cierre de turno | `CrozzoStorageHygiene`, `CrozzoCierreTurnos` | Bajo |
| 15 | Automatizar drenaje fiscal con SLA 48h (4 intentos/20s, evidencia, alerta 40h) | `CrozzoContingenciaFiscal.js`, `CrozzoFiscalOutboxDrain.js` | Medio |
| 16 | Endurecer capabilities/CSP por ventana; quitar `allow-crozzo-devtools` y `http:` | `src-tauri/capabilities/*.json`, `tauri.conf.json` | Bajo |
| 17 | Actualizar deps vulnerables (`pdfjs-dist`, updater, cli, process) | `package.json` | Bajo |
| 18 | Eliminar stale `src/` root-level y duplicación de bundles | `src/`, `scripts/sync-frontend-to-src.mjs` | Medio |
| 19 | Split `CrozzoPosMain.js` por secciones del mapa en módulos ES | `app/core/CrozzoPosMain.js` | Alto |
| 20 | `facturar`: split en etapas; registrar propina en FE; no tragar side effects | `CrozzoPosMain.js` | Medio |

### P2 — Medio (calidad/UX/observabilidad)

| # | Acción | Archivo(s) clave | Esfuerzo |
|---|--------|-------------------|----------|
| 21 | Reemplazar empty catches por `crozzoLogError(scope, err, context)` en inventario/print/cierre/sync | múltiples | Medio |
| 22 | Fail-closed en `canSeePage` (tablets) | `CrozzoTabletNav.js` | Bajo |
| 23 | Anular por `uuid/id` no por índice | `CrozzoPosFacturasPage.js` | Bajo |
| 24 | Gate reversión retail estrictamente en `posDeducted===true`/`modo==='pos'`; `devolverVenta` una vez por venta | `CrozzoReversionInventario.js` | Bajo |
| 25 | KDS: lanes por estación, batching de platos iguales, waiter routing, timing/analytics, offline robusto | `CrozzoTabletShell.js`, comandas | Alto |
| 26 | Delivery/online ordering integration (multi-canal) | nuevo módulo | Alto |
| 27 | Observabilidad: métricas por canal, alertas outbox, SLA fiscal, logs de impresión | nuevo | Medio |
| 28 | Auto-cierre de turno sin asumir diff 0; alertar | `CrozzoCierreTurnos.js` | Bajo |
| 29 | Tests negativos de tenant isolation + clock skew + quota trimming | `scripts/*-check.mjs`, Playwright | Medio |
| 30 | CI: hacer verde (maps, RLS SQL, qrcode, known-issues), wire `npm test`, E2E con artefactos, lint/coverage | `.github/workflows/ci.yml` | Medio |

### P3 — Bajo (innovación/optimización)

| # | Acción | Notas |
|---|--------|-------|
| 31 | Evaluar PowerSync/Turso para sync SQLite local↔cloud (vs. propio) | Validar con PoC |
| 32 | Evaluar `tauri-plugin-sync` (CDC) para outbox automático | Early-stage (0.1.0) |
| 33 | Evaluar CRDTs (cr-sqlite) cuando madure | Revisitar 2026 H2 |
| 34 | Self-service kiosk / guest-facing display | Mercado 2026 |
| 35 | IA para insights (ya existe `CrozzoAiInsights`) sobre facturas/comandas | Mejorar |
| 36 | Loyalty, gift cards, pagos digitales integrados | Mercado |
| 37 | Multi-tienda / franquicia con consolidación central | Escala |
| 38 | Migrar a publishable/secret keys de Supabase (deprecación legacy 2026) | Seguridad |
| 39 | Limpieza local: `target/` 47.5 GB, artefacto monolito, maps no commiteados | Higiene |

---

## 4. Roadmap sugerido (alineado con plan maestro)

- **Sprint 0 (1-2 sem):** P0 #1, #5, #6, #7 parcial; CI verde (P2 #30 parcial); documentar.
- **Sprint 1 (2-4 sem):** P0 #2, #3, #4; P1 #14, #16, #17, #18; P2 #21, #22, #23, #24.
- **Sprint 2 (4-8 sem):** P1 #9, #10, #11, #12, #13, #15, #19, #20; P2 #25, #29.
- **Sprint 3 (8-12 sem):** P2 #26, #27, #28; P3 #31-#39 según prioridad de negocio.
- **Continuo:** reducir monolito, aumentar tests unitarios, observabilidad.

---

## 5. Métricas de éxito (actualizadas)

- 0 credenciales hardcoded en source (grep `141414`, `admin123`).
- 0 P12/password en `localStorage` (verificar con scan).
- RLS: cross-tenant read retorna 0 filas (test negativo automatizado).
- 0 facturas `pendiente_fiscal` sin CUFE tras drenaje.
- 0 duplicados de comandas en reconexión (medir por `transaction_id`).
- 0 pérdida de estado de mesas en corte de red (test de caos).
- Retención fiscal 5 años verificable (SQLite + backup).
- SLA contingencia 48h cumplido (monitoreo).
- Auditoría con hash SHA-256 encadenado verificable.
- CI verde en `main` (maps, RLS, qrcode, known-issues, tests).
- Cobertura unitaria ≥ 60% en módulos críticos (inventario, fiscal, sync).

---

## 6. Fuentes

### Internas
- `docs/POS-MAESTRO-ANALISIS-PLAN.md`, `docs/POS-PLAN-REFORZADO-V2.md`
- `AGENTS.md`, `package.json`, `.github/workflows/ci.yml`, `.github/workflows/tauri-release.yml`
- Agentes de exploración: arquitectura, sync/offline, seguridad/fiscal, inventario/caja/impresión, tests/calidad.

### Externas (web)
- Local-first: Smashing Magazine 2026, Turso, PowerSync, ElectricSQL, RxDB, Expo docs, awesome-local-first.
- DIAN: Res. 165/2023, Res. 227/2025, borrador 2026 (LLB Solutions), Alegra, Facele, Posdata, Katuq, DDDinvoices.
- Tauri: tauri.app (SQL plugin, updater), Rustify 2026, Aptabase, medium (tauri-plugin-sync).
- KDS: Bhojan Setu, Quickbuy, TCANG, Delivety, Quantic, TechRyde, TicknCook, eatOS (2026).
- RLS/seguridad: Makerkit, Road to Enterprise, iloveblogs, Starmorph, nhimg, DEV Community, supabase agent-skills.

---

*Documento generado por revisión integral. No se modificaron archivos de producción.*