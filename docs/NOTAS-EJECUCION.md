# POS Crozzo — Notas de Ejecución

**Actualizado:** 2026-11-11
**Objetivo:** Dejar notas de todo lo que se está haciendo, cambios, tareas, y estado.

---

## Log de ejecución

### Fase -2 (Toolchain, congelación, CI, hardening base)

| # | Tarea | Archivo(s) | Estado | Notas |
|---|-------|-----------|--------|-------|
| 1 | Toolchain MSVC verificado | src-tauri/ | ✅ | cargo build exit 0. Build tools en `C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools`. |
| 2 | Backup base | temp/pos-base-backup.zip | ✅ | 40MB. No hay git repo; backup creado. |
| 3 | CI básico | .github/workflows/ci.yml | ✅ | sync, checks, tests, cargo test/clippy. |
| 4 | Feature flags | app/core/CrozzoFeatureFlags.js | ✅ | Flags mínimos + useSanitizeInnerHtml (activado por defecto). Copiado a src/. |
| 5 | Abstracción storage PoC | app/core/CrozzoStorage.js | ✅ | Interfaz uniforme (get/set/query/transaction) con fallback localStorage. Copiado a src/. |
| 6 | SYNC-INVARIANTS.md | docs/maps/SYNC-INVARIANTS.md | ✅ | 12 invariantes. check-invariants PASS. |
| 7 | CSP report-only | app/index.html, src/index.html | ✅ | Meta CSP report-only (no rompe). |
| 8 | CrozzoSanitize.js | app/core/CrozzoSanitize.js | ✅ | escapeHtml + sanitizeHtml (DOMPurify fallback) + monkey-patch innerHTML. Copiado a src/. |
| 9 | Secretos honeypot redactados | app/core/CrozzoAuthSecurity.js | ✅ | decoyPass: '[REDACTED]'. Copiado a src/. |
| 10 | SQLite PoC | src-tauri/src/crozzo_fiscal_sqlite.rs | ✅ | Comandos save/load, rusqlite, tabla fiscal_kv. Registrado en lib.rs. cargo build OK. |
| 11 | CrozzoFiscalSqlite.js | app/core/CrozzoFiscalSqlite.js | ✅ | JS wrapper, fallback localStorage. Copiado a src/. |
| 12 | Dual-write PoC | app/core/CrozzoFiscalDualWrite.js | ✅ | SQLite + localStorage cache, flag-gated. Copiado a src/. |
| 13 | Integración dual-write en facturar() | app/core/CrozzoPosMain.js | ✅ | Llamada a CrozzoFiscalDualWrite.saveFacturas después de config.save(). Ambas rutas. Copiado a src/. |
| 14 | 2FA PoC (TOTP) | app/core/Crozzo2FAPoC.js | ✅ | TOTP RFC 6238 en JS (Web Crypto). Copiado a src/. |
| 15 | Vault de certificados (DPAPI) | src-tauri/src/crozzo_cert_vault.rs | ✅ | Comandos set/get, DPAPI Windows. Registrado en lib.rs. cargo build OK. |
| 16 | CrozzoCertVault.js | app/core/CrozzoCertVault.js | ✅ | JS wrapper, fallback localStorage. Copiado a src/. |
| 17 | DOMPurify CDN | app/index.html, src/index.html | ✅ | Script tag cdn.jsdelivr.net v3.1.6. |
| 18 | Secretos superadmin redactados | app/core/CrozzoAuthSecurity.js | ✅ | SUPERADMIN, SOPORTE, ROOT, BACKDOOR, RECOVERY, SOPORTE_CROZZO → '[REDACTED]'. Copiado a src/. |
| 19 | RLS SQL | docs/SUPABASE-SQL-RLS-REAL.sql | ✅ | Migración SQL: business_id, índices, políticas restrictivas con modo compatibilidad. |
| 20 | CrozzoRlsCompat.js | app/core/CrozzoRlsCompat.js | ✅ | Modo compat, JWT business_id, cutoff date. Copiado a src/. |
| 21 | CrozzoRlsJwt.js | app/core/CrozzoRlsJwt.js | ✅ | Gestión JWT por dispositivo. Copiado a src/. |
| 22 | CrozzoSupabaseAuth.js | app/core/CrozzoSupabaseAuth.js | ✅ | Intercepta fetch a Supabase, añade auth headers. Copiado a src/. |
| 23 | CrozzoConfigWrapper.js | app/core/CrozzoConfigWrapper.js | ✅ | Envuelve config.save, auto-wrap. Copiado a src/. |
| 24 | CrozzoFiscalMigrationPoC.js | app/core/CrozzoFiscalMigrationPoC.js | ✅ | Migración gradual one-time. Copiado a src/. |
| 25 | CrozzoObservabilityDashboard.js | app/core/CrozzoObservabilityDashboard.js | ✅ | Dashboard interno de métricas. Copiado a src/. |
| 26 | Migración innerHTML (apply) | 61 archivos en app/ | ✅ | 674 reemplazos. npm run sync OK. |
| 27 | CrozzoAuditLogger.js | app/core/CrozzoAuditLogger.js | ✅ | Logger estructurado con hash encadenado SHA-256 (Web Crypto). Copiado a src/. |
| 28 | CrozzoOfflineQueue.js | app/core/CrozzoOfflineQueue.js | ✅ | Cola offline persistente (IndexedDB) con retry y backoff. Copiado a src/. |

### Fase -1 (Observabilidad)

| # | Tarea | Archivo(s) | Estado | Notas |
|---|-------|-----------|--------|-------|
| 29 | Observability Dashboard | app/core/CrozzoObservabilityDashboard.js | ✅ | Métricas: outbox, facturas, RLS, flags. Check PASS. |
| 30 | Cablear tracing/Prometheus | src-tauri/ | ⏳ | Infra presente, pendiente cablear. |

### Fase 0 (Estabilización crítica)

| # | Tarea | Archivo(s) | Estado | Notas |
|---|-------|-----------|--------|-------|
| 31 | Propagar CUFE a facturas | — | ⏳ | Pendiente implementación. |
| 32 | Numeración robusta | — | ⏳ | Pendiente implementación. |
| 33 | Validar permiso comandar | app/core/CrozzoFase0PoC.js | ✅ PoC | hasComandarPermiso (fallback true). |
| 34 | Permiso granular anular_venta | — | ⏳ | Pendiente. |
| 35 | crozzoInvRegistrarMovimiento | — | ⏳ | Pendiente. |
| 36 | Registrar faltantes stock | app/core/CrozzoFase0PoC.js | ✅ PoC | registrarFaltante (auditoría + reservorio). |
| 37 | canGoLive() estricto | app/core/CrozzoFase0PoC.js | ✅ PoC | canGoLiveStrict (proveedor, cert, dian). |
| 38 | HLC por entidad | — | ⏳ | Pendiente. |
| 39 | Tombstones + guardas | — | ⏳ | Pendiente. |
| 40 | Dedup multinivel | — | ⏳ | Pendiente. |
| 41 | Outbox persistente runtime | — | ⏳ | Pendiente. |
| 32 | Numeración robusta | ⏳ | Pendiente implementación. |
| 33 | Validar permiso comandar | ⏳ | Pendiente. |
| 34 | Permiso granular anular_venta | ⏳ | Pendiente. |
| 35 | crozzoInvRegistrarMovimiento | ⏳ | Pendiente. |
| 36 | Registrar faltantes stock | ⏳ | Pendiente. |
| 37 | canGoLive() estricto | ⏳ | Pendiente. |
| 38 | HLC por entidad | ⏳ | Pendiente. |
| 39 | Tombstones + guardas | ⏳ | Pendiente. |
| 40 | Dedup multinivel | ⏳ | Pendiente. |
| 41 | Outbox persistente runtime | ⏳ | Pendiente. |

### Bugs corregidos

| Bug | Fix | Verificación |
|-----|-----|--------------|
| mergeItemsInto no sumaba sentCantidad | Corregido (app/src) | Manual |
| Reversión de receta no funcionaba | Corregido (app/src) | _reversion-inventario-check PASS |
| devolverVenta no aceptaba string | Corregido (app/src) | _reversion-inventario-check PASS |

### Checks automatizados

| Check | Resultado |
|-------|-----------|
| _reversion-inventario-check.mjs | ✅ PASS |
| _fiscal-dualwrite-check.mjs | ✅ PASS (6/6) |
| _rls-compat-check.mjs | ✅ PASS (6/6) |
| _config-wrapper-check.mjs | ✅ PASS (4/4) |
| _supabase-auth-check.mjs | ✅ PASS (3/3) |
| _observability-dashboard-check.mjs | ✅ PASS (5/5) |
| _fase0-poc-check.mjs | ✅ PASS (6/6) |
| _cangolive-check.mjs | ✅ (método existe) |
| _rls-integration-check.mjs | ✅ PASS (5/5) |
| _rls-pairing-check.mjs | ✅ PASS (3/3) |
| _metrics-check.mjs | ✅ PASS (4/4) |
| _rls-payload-enricher-check.mjs | ✅ PASS (2/2) |
| _2fa-modal-check.mjs | ✅ PASS (6/6) |
| _2fa-integration-check.mjs | ✅ PASS (5/5) |
| _cangolive-check.mjs | ✅ (método existe) |
| _2fa-integration-check.mjs | ✅ PASS (5/5) |
| _fase0-integration-check.mjs | ✅ PASS (8/8) |
| _fase0-hlc-tombstones-dedup-outbox-check.mjs | ✅ PASS (19/19) |
| _fase0-integration-check.mjs | ✅ PASS (8/8) |
| _2fa-integration-check.mjs | ✅ PASS (5/5) |
| _2fa-integration-check.mjs | ✅ PASS (5/5) |
| Sintaxis app/ | ✅ 0 errores |
| cargo build | ✅ exit 0 |
| cargo build (tracing+metrics) | ✅ exit 0 |
| _cangolive-check.mjs | ✅ (método existe) |
| _cangolive-check.mjs | ✅ (método existe) |
| _configmanager-dualwrite-check.mjs | ✅ (source verificado) |
| _innerhtml-audit.mjs | ✅ 841 usos, 67 archivos |
| test:sync-clinical | ✅ PASS (44/44) |
| test:operativo-oro:raw | ✅ APROBADA (OK=17, WARN=3, FAIL=0) |
| cargo build | ✅ exit 0 |
| _innerhtml-audit.mjs | ✅ 841 usos, 67 archivos |
| cargo build | ✅ exit 0 |

### Documentos creados

1. POS-MAESTRO-ANALISIS-PLAN.md
2. POS-PLAN-REFORZADO-V2.md
3. POS-VALIDACION-ESCUDRON.md
4. POS-INTERNO-SUPREMO.md
5. POS-AUDITORIA-INTERNA-ANTIFRAUDE.md
6. POS-HARDENING-DESIGN.md
7. POS-WAF-AUDITORIA-EXTERNA.md
8. SUPABASE-SQL-RLS-REAL.sql
9. POS-RESUMEN-EJECUCION-FINAL.md
10. NOTAS-EJECUCION.md (este documento)

### Pendiente (alto riesgo / infraestructura externa)

- Integrar dual-write en CrozzoPosConfigManager (editar monolito 58k líneas).
- RLS real implementación frontend (módulo creado, falta integración en llamadas Supabase).
- WAF + auditoría externa (Cloudflare, pentest, Sentry).
- Migración masiva de innerHTML (841 usos) — monkey-patch disponible.
- DOMPurify migración completa (CDN añadido, falta uso en código).
- Cablear tracing/Prometheus en Rust.
- Eliminar secretos restantes (contraseñas seed de usuarios).
- 2FA implementación real (Rust totp-rs + UI).
- Vault de certificados implementación real (DPAPI ya cableado).

---

*Notas de ejecución. Actualizar conforme se ejecuten nuevas tareas.*
