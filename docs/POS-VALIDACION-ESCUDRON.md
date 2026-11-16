# POS Crozzo — Validación del Escuadrón de Ingeniería de Alto Rendimiento

**Fecha:** 2026-11-11
**Estructura:** 4 ingenieros senior (Arquitectura, Datos/Sync, Seguridad/Fiscal) + Jefe de Asuntos Internos (auditoría).
**Objetivo:** Validar el Plan V2 y las herramientas actuales para minimizar el margen de error (<1%) y llevar el sistema al 100% de desempeño.

---

## 1. Composición y veredictos

| Rol | Veredicto | Condición clave |
|-----|-----------|-----------------|
| Ingeniero Senior de Arquitectura | **MEJORAR** | Corregir asunción de SQLite universal; aprovechar spike Rust existente; re-evaluar CRDTs para carritos. |
| Ingeniero Senior de Datos/Sync | **MEJORAR (ajustes estructurales)** | HLC + tombstones + dedup multinivel antes de Fase 2; no engine dedicado aún. |
| Ingeniero Senior de Seguridad/Fiscal | **INSUFICIENTE** | Necesita Fase de Hardening (P0) antes de go-live fiscal; XSS, RLS, vault, firma digital, 2FA. |
| Jefe de Asuntos Internos (auditor) | **APROBADO CON MODIFICACIONES CRÍTICAS** | Fase -2 (toolchain + congelación + CI) antes de todo; 22 semanas realistas. |

**Veredicto consolidado del escuadrón:** **APROBADO CON MODIFICACIONES CRÍTICAS.** El Plan V2 es la mejor alternativa disponible, pero **no puede ejecutarse tal como está**. Requiere Fase -2 (toolchain/congelación/CI/hardening) antes de Fase -1.

---

## 2. Análisis de herramientas actuales vs. alternativas

### 2.1 Herramientas actuales (veredicto por área)

| Herramienta | Área | Juicio | Acción |
|-------------|------|--------|--------|
| Tauri 2 (Windows WebView2) | Runtime desktop | Viable | Mantener |
| Tauri 2 (Android WebView) | Runtime mobile | **Gap**: sin SQLite nativo; localStorage evictable | wa-sqlite/Dexie + abstracción |
| Supabase (Postgres + Realtime + RLS) | Backend | Viable para cloud; RLS permisivo | Endurecer RLS por business_id |
| localStorage + IndexedDB | Persistencia local | **Insuficiente** para fiscal (5 años) | Dual-write SQLite (desktop) + Dexie (web/Android) |
| Multi-canal sync (cloud/LAN/WS/mesh/P2P) | Sync | **Diferenciador real**; no replicable por engine genérico | Mantener; externalizar solo cloud sync (Fase 4) |
| Prometheus/OpenTelemetry/tracing (Cargo.toml) | Observabilidad | Infra presente, **no cableada** | Cablear a dashboard interno |
| `crozzo_lan_persistence.rs` (HLC + op_log + seen_ops) | Persistencia Rust | **Infrautilizada** (dead_code) | Cablear y endurecer (no reescribir) |
| Playwright + fast-check + proptest | Testing | Sin CI | Crear GitHub Actions |
| Dataico (único PT real) | Fiscal | Vendor único; Siigo/Facturama no implementados | Plan de contingencia multi-PT |

### 2.2 Alternativas evaluadas (resumen)

| Alternativa | Veredicto del escuadrón |
|-------------|------------------------|
| PowerSync / Electric SQL | Complemento para cloud sync (Fase 4), no reemplazo de LAN/BLE/mesh. |
| Turso (libSQL) | Interesante para multi-sede, no para Fase 1. |
| Ditto (CRDT + mesh) | Relevante a largo plazo; vendor lock; evaluar Fase 4+. |
| WatermelonDB / Replicache | No encajan (React Native-first / web-first). |
| Dexie.js (IndexedDB) | **Recomendado** como capa unificada web/Android + cache desktop. |
| wa-sqlite (WASM + OPFS) | **Recomendado** para unificar esquema entre plataformas. |
| Yjs / Automerge (CRDTs) | **Recomendado solo para carritos/mesas concurrentes**, no generalizado. |
| RxDB | Candidato si KPIs de sync no se cumplen tras Fase 2. |

### 2.3 Herramientas nuevas recomendadas

1. **TypeScript** (gradual, `allowJs`) — elimina clase entera de bugs.
2. **Vite + ES modules** — elimina duplicación `app/`/`src/`/bundles.
3. **GitHub Actions (CI)** — lint, typecheck, tests, checks `_*.mjs`, cargo test/clippy.
4. **Sentry** (frontend + Rust) — captura de errores en producción.
5. **Zod** — validación de schemas en fronteras.
6. **qrcode (npm)** — QR local, eliminar `api.qrserver.com`.
7. **UUID v7 / ULID** — IDs ordenables por tiempo para idempotencia.
8. **DOMPurify** — sanitización XSS.
9. **fast-check + proptest** — property-based testing para invariantes de sync.
10. **Mutation testing (Stryker)** — validar que tests detectan regresiones.

---

## 3. Ajustes estructurales obligatorios al Plan V2

### 3.1 De Datos/Sync (ingeniero senior)
1. Reemplazar "versiones monotónicas (counter+device)" por **HLC + detección de concurrencia** + merge por campos con prioridad por rol/canal.
2. Añadir **tombstones + guardas de estado terminal** (anti-resurrección) al merge-on-write de mesas.
3. Convertir dedup de "TID seen" a **idempotencia por entidad** (upsert) + dedup en backend.
4. Añadir **causal ordering** de dependencias (comanda_new antes de comanda_estado).
5. Añadir **schema versioning** de payloads + **compaction** de tombstones (30 días).
6. Unificar TTLs de dedup (15 min mínimo o basado en versión de entidad).
7. Ack registry persistente (sobrevive recarga).

### 3.2 De Seguridad/Fiscal (ingeniero senior)
1. **Fase de Hardening (P0)** antes de Fase -1: CSP report-only→enforce, sanitización, Trusted Types, eliminación de secretos/honeypot del bundle, 2FA para admin/superadmin.
2. **RLS real:** JWT por dispositivo con claims `business_id`/`role`; políticas restrictivas; modo compatibilidad con fecha de expiración.
3. **Vault de certificados:** migrar a vault/HSM; verificar vigencia y firma; rotación.
4. **Firma digital + sellado de tiempo** para facturas y auditoría.
5. **Backup cifrado offsite + WORM** para retención 5 años.
6. **Nota crédito DIAN** real o bloqueo explícito de anulación en modo FE.
7. **Migración de permisos versionada y auditable.**
8. **Idempotencia de timbrado** (clave estable por factura, ack de DIAN, reconciliación periódica).
9. **Inventario con control optimista** y bloqueo de venta sin stock (o registro de faltante con alerta).
10. **WAF + auditoría externa + pentest + SIEM.**

### 3.3 De Arquitectura (ingeniero senior)
1. **No asumir SQLite universal:** estrategia por plataforma (rusqlite desktop + wa-sqlite/Dexie web/Android + abstracción `CrozzoStorage`).
2. **Cablear spike `crozzo_lan_persistence.rs`** (HLC + op_log + seen_ops + pending_ops) en lugar de reescribir.
3. **Cablear tracing/Prometheus/OpenTelemetry** ya en Cargo.toml para observabilidad.
4. **CRDTs (Yjs/Automerge) para carritos/mesas concurrentes** (re-evaluar: no solo inventario multi-sede).
5. **Sync engine dedicado (PowerSync/RxDB) solo para cloud** (Fase 4), manteniendo LAN/BLE/WebRTC.
6. **Estimación realista:** 2-3× la original (1.400-2.000h).

### 3.4 De Asuntos Internos (auditor)
1. **Fase -2 (nueva):** toolchain MSVC + congelación base + CI mínimo + feature flags + cablear SQLite (PoC).
2. **Reducir alcance Fase 1:** SQLite solo facturas, no todo el reservorio.
3. **Mover RLS por business_id a Fase 3+** (blast radius alto).
4. **Mover "centralizar dedup en backend" a backlog** (no hay backend propio).
5. **Eliminar KDS/IA de Fase 4** (mover a backlog condicional).
6. **Eliminar CRDTs del roadmap por defecto** (mantener condicional solo inventario multi-sede).
7. **Estimación ajustada:** 22 semanas (vs 17).
8. **Staging/canary** para updater quiet.
9. **Incorporar 68 omisiones** (toolchain, congelación, CI, feature flags, Android WebView, updater quiet, honeypot, pairing legacy v4, certificado, RLS, migraciones, clock skew, IndexedDB retry, encolado_nube, transaction_id, cuota localStorage, backups, trim, echo windows, presencia stale, merge-on-write, mesh dedup, outbox max age, bloqueo venta, concurrencia, idempotencia reversión, crozzoInvRegistrarMovimiento, permiso anular_venta, facturar() async, errores post-proceso, timeout impresión, unificación render, auto-cierre, nota crédito DIAN, QR local, etc.).

---

## 4. Plan consolidado final (Fase -2 → Backlog)

### Fase -2 — Toolchain, congelación y hardening base (Semana 0-1)
**Bloqueantes antes de cualquier otra fase.**
- [ ] Congelar base: `git tag v1.0.296-base` + commit.
- [ ] Instalar toolchain MSVC: `winget install Microsoft.VisualStudio.2022.BuildTools`.
- [ ] Verificar build Tauri: `npm run tauri:build`.
- [ ] Crear CI mínimo: GitHub Actions con `npm run sync` + tests + cargo test/clippy.
- [ ] Implementar feature flags mínimos (`useSqliteFiscal`, etc.).
- [ ] Cablear módulo SQLite existente (prueba de concepto).
- [ ] **Hardening P0:** CSP report-only→enforce, sanitización (DOMPurify), Trusted Types, eliminación de secretos/honeypot del bundle, 2FA para admin/superadmin.
- [ ] **RLS real (diseño):** JWT por dispositivo con claims; políticas restrictivas; modo compatibilidad con fecha de expiración.
- [ ] **Vault de certificados (diseño):** migrar a vault/HSM; verificar vigencia y firma.

**DoD:** Build Tauri OK, CI verde, base congelada, hardening P0 implementado.

### Fase -1 — Línea base y observabilidad (Semana 1)
- [ ] Cablear tracing/Prometheus/OpenTelemetry (ya en Cargo.toml) a dashboard interno.
- [ ] Instrumentar `CrozzoComunicacionDiag` + `syncOfflineQueue` + `OperationalIngest` con contadores estructurados.
- [ ] Dashboard interno: outbox size, edad máxima, tasa éxito sync, facturas `pendiente_fiscal`, SLA 48h, conflictos detectados.
- [ ] Definir línea base documentada en `docs/POS-BASELINE.md`.

**DoD:** Dashboard muestra métricas en tiempo real; línea base documentada.

### Fase 0 — Estabilización crítica (Semanas 2-3)
Prioridad por ROI:
- [ ] Propagar CUFE a `config.facturas` en drenaje (fiscal crítico).
- [ ] Numeración robusta con rollback/compensación (fiscal crítico).
- [ ] Validar permiso `comandar` explícito en `comandarDesdeCaja`.
- [ ] Agregar permiso granular `anular_venta` y verificar en `puedeAnular()`.
- [ ] Implementar `crozzoInvRegistrarMovimiento` (alias a Reservorio).
- [ ] Registrar faltantes de stock cuando `cur < qty`.
- [ ] `canGoLive()` estricto (`prov.type==='dataico'` + credenciales + certificado vigente).
- [ ] Normalizar tipos en dedup de outbox (`String(consecutivo)`).
- [ ] **Firma digital + sellado de tiempo** para facturas y auditoría.
- [ ] **Nota crédito DIAN** real o bloqueo explícito de anulación en modo FE.
- [ ] **Eliminar honeypot** con credenciales del bundle.
- [ ] **Eliminar pairing legacy v4.**
- [ ] **Cifrado en LAN** (TLS + AES-256-GCM).
- [ ] **Autenticación en GETs de LAN.**
- [ ] **Comparación constant-time** para token LAN.

**KPIs:** Facturas `pendiente_fiscal` sin CUFE: 0; Consecutivos con huecos: 0; Duplicados de comandas: reducción ≥50%.

### Fase 1 — Durabilidad fiscal (Semanas 4-9)
- [ ] **Dual-write SQLite solo facturas:** comandos Tauri (`crozzo_fiscal_save_sqlite`/`load_sqlite`) cableando spike existente; SQLite autoritativo, localStorage cache.
- [ ] **Abstracción `CrozzoStorage`** por plataforma (rusqlite desktop + wa-sqlite/Dexie web/Android).
- [ ] **Migración gradual:** importar desde localStorage si SQLite vacío; verificar integridad (count + hash); marcar `migrated=true`; no borrar localStorage hasta verificar.
- [ ] **Rollback:** feature flag `useSqliteFiscal`; si falla, caer a localStorage.
- [ ] **Retención 5 años:** archivado durable en SQLite con partición por mes; exportación JSON.
- [ ] **Backup cifrado offsite + WORM.**
- [ ] **Bloquear emisión FE** si falta email del adquiriente.
- [ ] **Separar permisos** `facturar_pos` vs `facturar_electronica`.
- [ ] **Hash SHA-256 encadenado** para auditoría.
- [ ] **Enviar eventos significativos pendientes** al recuperar PT.
- [ ] **Validación de certificado real** (vigencia/firma).
- [ ] **Validación de NIT con DV.**
- [ ] **Bloqueo de consumidor final por defecto.**
- [ ] **Migración de permisos versionada y auditable.**

**KPIs:** 0 pérdida de facturas tras limpieza de navegador; Retención 5 años verificable; Auditoría con hash encadenado verificable.

### Fase 2 — Robustez multi-dispositivo (Semanas 10-17)
Dependencias: Fase 1 (SQLite) completada.
- [ ] **HLC por entidad** + detección de concurrencia + merge por campos con prioridad por rol/canal (reemplaza versiones monotónicas).
- [ ] **Tombstones + guardas de estado terminal** (anti-resurrección) para mesas/slots.
- [ ] **Causal ordering** de dependencias (comanda_new antes de comanda_estado).
- [ ] **Outbox persistente para runtime** (cola SQLite de pushes de mesas/carritos con reintentos y merge).
- [ ] **Dedup multinivel:** TID seen persistente (TTL unificado 15 min) + idempotency key por entidad + unique constraint backend + content-hash fallback + ack registry persistente.
- [ ] **Idempotencia por entidad:** clave estable `business_id + tabla + local_id` con `upsert` en cola global.
- [ ] **Reconciliación con ack:** marcar entradas como `ok` solo tras confirmación cloud; si falla, revertir a `pendiente` con backoff.
- [ ] **Backoff exponencial + dead-letter** en sync y outbox fiscal.
- [ ] **Drenaje fiscal por lotes más grandes** con throttling y monitoreo SLA.
- [ ] **Schema versioning** de payloads de sync.
- [ ] **Compaction** de tombstones (30 días).
- [ ] **RLS por business_id** con modo compatibilidad (permitir legacy tokens) y migración gradual de tablets.
- [ ] **Failover de ancla LAN:** degradación a cloud sin bloquear escrituras.
- [ ] **Eliminar duplicación app/src/bundles** con build automatizado + verificación en CI.
- [ ] **Manejo de clock skew inicial.**
- [ ] **Reintentos para migración IndexedDB.**
- [ ] **Vuelta a `pendiente` para `encolado_nube` fallido.**
- [ ] **`transaction_id` unificado** para insert/update.
- [ ] **Verificación de aplicación** tras violación de unicidad.
- [ ] **Reloj lógico para merge.**
- [ ] **Manejo de schema mismatch** (retry con backoff).
- [ ] **Manejo de cuota localStorage** (fallback a IndexedDB).
- [ ] **Persistencia de timers** (beforeunload + flush).
- [ ] **Backups rotatorios de 3+ niveles.**
- [ ] **Trim inteligente** (mantener pendientes).
- [ ] **Manejo de echo windows** (aumentar a 30s/5s).
- [ ] **Manejo de presencia stale** (timeout 60s).
- [ ] **Manejo de merge-on-write** (no resucitar borrados).
- [ ] **Manejo de mesh dedup** (aumentar TTL a 1h).
- [ ] **Manejo de outbox max age** (aumentar a 24h + alerta).
- [ ] **Bloqueo de venta si stock insuficiente** (configurable).
- [ ] **Control de concurrencia** (bloqueo optimista por versión).
- [ ] **Idempotencia de reversión.**
- [ ] **Test automatizado para reversión de receta.**
- [ ] **`crozzoInvRegistrarMovimiento`.**
- [ ] **Permiso granular `anular_venta`.**
- [ ] **Mover `facturar()` a worker/async.**
- [ ] **Manejo de errores post-proceso** (no tragar).
- [ ] **Timeout configurable** para colas de impresión.
- [ ] **Unificación de rutas de render.**
- [ ] **Manejo de errores** (no catch vacíos).
- [ ] **Auto-cierre sin diff 0 asumido** (alertar).
- [ ] **QR local** (librería cliente).
- [ ] **WAF** (Cloudflare) frente a Supabase/edge.

**KPIs:** Duplicados de comandas: 0 en test de caos; Pérdida de estado de mesas: 0; Tasa de éxito sync: ≥99%; Outbox edad máxima: <5 min.

### Fase 3 — Calidad, UX y observabilidad (Semanas 18-21)
- [ ] **Observabilidad:** métricas por canal, alertas de outbox, SLA fiscal, logs estructurados de impresión.
- [ ] **CRDTs (Yjs/Automerge) para carritos/mesas concurrentes** (re-evaluación condicional).
- [ ] **TypeScript gradual** (`allowJs` + migración de módulos nuevos).
- [ ] **Vite + ES modules** para eliminar duplicación.
- [ ] **Tests E2E** con emulador de impresora térmica.
- [ ] **Tests de reconexión** automatizados.
- [ ] **Control de concurrencia multi-terminal.**
- [ ] **Auto-cierre de turno** sin diff 0 asumido; alertar.
- [ ] **Nota crédito DIAN** o deshabilitar anulación en modo FE (si no se hizo en Fase 0).
- [ ] **UX offline:** indicador visible de estado de conexión y cola pendiente; reintento manual.
- [ ] **Plan de contingencia operativa:** backup/restauración de datos, procedimiento de caja dañada.
- [ ] **Migraciones de permisos idempotentes** + auditoría de cambios.
- [ ] **Auditoría externa** y pentest inicial; escaneo de dependencias en CI.
- [ ] **SIEM** y alertas de seguridad.
- [ ] **CSP enforcement** completo y Trusted Types en todo el monolito.
- [ ] **Honeypot** rediseñado sin credenciales en bundle; detección server-side.
- [ ] **Idempotencia de timbrado:** clave estable, ack de DIAN, reconciliación periódica.
- [ ] **Inventario con control optimista** y bloqueo de venta sin stock.

**KPIs:** Cobertura de tests automatizados: ≥60%; Tiempo medio de detección de fallo: <5 min; 0 anulaciones en modo FE sin nota crédito.

### Backlog (condicional, solo si hay demanda)
- [ ] **PowerSync** para sync cloud↔local (solo cloud).
- [ ] **Evaluar Ditto** como reemplazo de largo plazo del sync multi-canal.
- [ ] **KDS** con lanes por estación, batching de platos iguales, waiter routing, timing.
- [ ] **Failover de ancla** y alta disponibilidad.
- [ ] **IA insights** (ya existe `CrozzoAiInsights`).
- [ ] **CRDTs para inventario multi-sede** (si merge manual resulta insuficiente).

---

## 5. KPIs consolidados

| KPI | Objetivo | Fase de validación |
|-----|----------|-------------------|
| Facturas `pendiente_fiscal` sin CUFE tras drenaje | 0 | Fase 0 |
| Consecutivos con huecos por fallo de timbrado | 0 | Fase 0 |
| Duplicados de comandas en test de caos | 0 | Fase 2 |
| Pérdida de estado de mesas en test de caos | 0 | Fase 2 |
| Tasa de éxito sync | ≥99% | Fase 2 |
| Outbox edad máxima | <5 min (normal), <24h (offline) | Fase 2 |
| Cobertura de tests automatizados | ≥60% flujos críticos | Fase 3 |
| Tiempo medio de detección de fallo | <5 min | Fase 3 |
| Retención fiscal | 5 años verificable (SQLite + backup offsite) | Fase 1 |
| 0 anulaciones en modo FE sin nota crédito | 0 | Fase 0/3 |

---

## 6. Definition of Done (global)

Una fase se considera completa cuando:
1. Todas las tareas tienen check automatizado PASS.
2. KPIs de salida cumplidos durante ≥2 semanas en operación real.
3. No hay regresión en checks existentes.
4. Documentación actualizada.
5. Rollback probado (simulación de fallo + recuperación).
6. Auditoría externa/pentest sin hallazgos críticos (Fases 1+).

---

## 7. Veredicto final del escuadrón

**APROBADO CON MODIFICACIONES CRÍTICAS.**

El Plan V2 es la mejor alternativa disponible para ordenar el trabajo, pero requiere:
1. **Fase -2 (nueva)** para toolchain, congelación, CI y hardening base.
2. **Reducción de alcance** en Fases 1-2 (SQLite solo facturas, HLC solo mesas/carritos).
3. **Reutilización** del módulo SQLite/HLC ya existente en Rust.
4. **Incorporación** de los ajustes de HLC, tombstones, dedup multinivel, hardening, vault, firma digital, backup offsite, nota crédito, 2FA, CSP, WAF, SIEM.
5. **Estimación realista** de 22 semanas (vs 17).
6. **Staging/canary** para el updater quiet.

**Ejecutar Fase -2 inmediatamente. No tocar código de producción hasta tener toolchain, base congelada, CI y hardening base.**

---

*Documento generado por el escuadrón de ingeniería de alto rendimiento. Complementa `docs/POS-MAESTRO-ANALISIS-PLAN.md` (V1) y `docs/POS-PLAN-REFORZADO-V2.md` (V2).*
