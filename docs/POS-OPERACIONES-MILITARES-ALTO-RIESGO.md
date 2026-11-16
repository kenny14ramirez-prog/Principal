# POS Crozzo — Operaciones Militares de Alto Riesgo

**Fecha:** 2026-11-11
**Clasificación:** Operaciones de alto riesgo — requieren análisis militar detallado.
**Principio:** Opera con cuidado. Cada detalle importa. Cero margen de error.

---

## 1. Doctrina de operaciones militares

### 1.1 Principios
1. **Reconocimiento antes de acción** — analizar el terreno antes de moverse.
2. **Fuerza mínima necesaria** — no usar más fuerza de la requerida.
3. **Contingencia siempre** — cada operación tiene plan B, C, D.
4. **Rollback inmediato** — si falla, revertir en < 5 min.
5. **Verificación triple** — antes, durante, después.
6. **Comunicación constante** — reportar cada paso.
7. **No dejar bajas** — cada cambio debe ser reversible.

### 1.2 Niveles de riesgo
- **R1 (Bajo):** Cambios aditivos, no tocan flujo existente. Rollback trivial.
- **R2 (Medio):** Cambios en flujo existente con feature flag. Rollback con flag.
- **R3 (Alto):** Cambios en monolito, múltiples archivos. Rollback con backup.
- **R4 (Crítico):** Cambios en Rust, DB schema, RLS. Rollback complejo.

---

## 2. Análisis de tareas de alto riesgo

### OP-01: Integrar dual-write en ConfigManager (R4)

**Objetivo:** Hacer que `config.save()` persista facturas en SQLite además de localStorage.

**Riesgo:** Editar monolito de 58k líneas. Un error puede romper toda la facturación.

**Reconocimiento:**
- `config.save()` se llama en ~20 lugares en `CrozzoPosMain.js`.
- `config.getFacturas()` retorna array de facturas.
- `CrozzoConfigWrapper.js` ya envuelve `config.save()` con dual-write (PoC).
- El wrapper se auto-activa al cargar si `config` existe.

**Operación:**
1. ✅ Crear `CrozzoConfigWrapper.js` (hecho).
2. ✅ Integrar en `facturar()` directamente (hecho, líneas 33160 y 33343).
3. ⏳ Añadir `CrozzoConfigWrapper.wrap()` en el arranque (index.html o boot).
4. ⏳ Probar con flag `useSqliteFiscal` activo.
5. ⏳ Verificar que facturas persisten en SQLite.

**Contingencia:** Si `wrap()` rompe, desactivar flag y revertir a `config.save()` original.

**Rollback:** Eliminar la llamada a `wrap()` y restaurar `config.save()` original.

**Verificación:** `node scripts/_config-wrapper-check.mjs` + prueba manual en Tauri.

**Agente asignado:** Ingeniero de datos (sync).

---

### OP-02: RLS real — implementación frontend (R3)

**Objetivo:** Integrar JWT por dispositivo en llamadas Supabase para RLS por business_id.

**Riesgo:** Si JWT no se envía correctamente, todas las llamadas a Supabase fallan (sin datos).

**Reconocimiento:**
- `CrozzoRlsJwt.js` creado (getJwt, setJwt, authHeaders).
- `CrozzoSupabaseAuth.js` creado (intercepta fetch, añade headers).
- `CrozzoRlsCompat.js` creado (modo compatibilidad).
- SQL de migración creado (`SUPABASE-SQL-RLS-REAL.sql`).
- Flag `useRlsBusinessId` por defecto false.

**Operación:**
1. ✅ Crear módulos JS (hecho).
2. ✅ Crear SQL de migración (hecho).
3. ⏳ Ejecutar SQL en Supabase (modo compatibilidad).
4. ⏳ Añadir `CrozzoRlsJwt.setJwt()` en el flujo de pairing (QR).
5. ⏳ Activar flag `useRlsBusinessId` gradualmente (tablets nuevas primero).
6. ⏳ Monitorear errores de RLS.

**Contingencia:** Si RLS bloquea, desactivar flag y volver a modo compatibilidad.

**Rollback:** `CrozzoFeatureFlags.set('useRlsBusinessId', false)` + reload.

**Verificación:** `node scripts/_rls-compat-check.mjs` + prueba manual con JWT.

**Agente asignado:** Ingeniero de seguridad (RLS).

---

### OP-03: Migración masiva de innerHTML (R3)

**Objetivo:** Sanitizar 841 usos de `innerHTML` en 67 archivos.

**Riesgo:** DOMPurify puede remover scripts/estilos necesarios, rompiendo UI.

**Reconocimiento:**
- Monkey-patch disponible (`useSanitizeInnerHtml` activado por defecto).
- `CrozzoSanitize.js` con `sanitizeHtml` (DOMPurify fallback).
- Script `_migrate-innerhtml.mjs` con dry-run/apply.
- 841 usos en 67 archivos (mayor: CrozzoPosMain.js con 204).

**Operación:**
1. ✅ Monkey-patch activado por defecto (hecho).
2. ✅ Auditoría de innerHTML (841 usos, 67 archivos).
3. ⏳ Probar con flag activo en desarrollo (verificar UI no se rompe).
4. ⏳ Migrar manualmente los archivos de mayor riesgo (facturación, clientes, comandas).
5. ⏳ Desactivar monkey-patch cuando migración manual complete.

**Contingencia:** Si UI se rompe, desactivar flag `useSanitizeInnerHtml`.

**Rollback:** `CrozzoFeatureFlags.set('useSanitizeInnerHtml', false)` + reload.

**Verificación:** Prueba manual de UI + `node scripts/_innerhtml-audit.mjs`.

**Agente asignado:** Ingeniero de arquitectura (frontend).

---

### OP-04: WAF + auditoría externa (R4)

**Objetivo:** Proteger endpoints con WAF, pentest, SIEM.

**Riesgo:** Infraestructura externa; costo y tiempo.

**Reconocimiento:**
- Diseño completo en `docs/POS-WAF-AUDITORIA-EXTERNA.md`.
- Requiere Cloudflare, pentest, Sentry.

**Operación:**
1. ⏳ Configurar Cloudflare WAF (rate limiting, DDoS).
2. ⏳ Contratar pentest.
3. ⏳ Integrar Sentry en frontend y Rust.
4. ⏳ Configurar alertas.

**Contingencia:** Si WAF bloquea tráfico legítimo, desactivar reglas específicas.

**Rollback:** Desactivar WAF rules en Cloudflare dashboard.

**Verificación:** Monitoreo de bloqueos + pentest report.

**Agente asignado:** Ingeniero de seguridad (infra).

---

### OP-05: Cablear tracing/Prometheus en Rust (R3)

**Objetivo:** Cablear observabilidad en Rust (tracing, Prometheus, OpenTelemetry).

**Riesgo:** Editar Rust; puede romper build.

**Reconocimiento:**
- `tracing`, `tracing-subscriber`, `opentelemetry`, `prometheus` ya en Cargo.toml.
- `crozzo_lan_observability.rs` existe.
- Servidor LAN (axum) ya presente.

**Operación:**
1. ⏳ Cablear `tracing-subscriber` con formato JSON.
2. ⏳ Exponer endpoint `/metrics` en axum.
3. ⏳ Cablear `opentelemetry-otlp` a collector.
4. ⏳ Compilar y verificar.

**Contingencia:** Si build falla, revertir cambios en Rust.

**Rollback:** `git checkout` (si git) o restaurar backup.

**Verificación:** `cargo build` + `cargo test` + endpoint /metrics.

**Agente asignado:** Ingeniero de arquitectura (Rust).

---

### OP-06: Eliminar secretos restantes (R3)

**Objetivo:** Redactar contraseñas seed de usuarios (admin, cajero, etc.).

**Riesgo:** Puede romper login de usuarios de prueba/demo.

**Reconocimiento:**
- 20+ usuarios con contraseñas hardcodeadas.
- Ya redactados: SUPERADMIN, SOPORTE, ROOT, BACKDOOR, RECOVERY, SOPORTE_CROZZO, decoyPass.
- Pendientes: ADMIN, GERENTE, CAJERO, etc.

**Operación:**
1. ⏳ Redactar contraseñas de usuarios seed (admin, gerente, cajero, etc.).
2. ⏳ Forzar cambio de contraseña en primer login.
3. ⏳ Mover usuarios seed a config inicial (no bundle).

**Contingencia:** Si login se rompe, restaurar contraseñas originales.

**Rollback:** Restaurar desde backup.

**Verificación:** Prueba de login manual.

**Agente asignado:** Ingeniero de seguridad (auth).

---

### OP-07: 2FA implementación real (R4)

**Objetivo:** Implementar TOTP (Rust totp-rs) + UI para admin/superadmin.

**Riesgo:** Requiere Rust (totp-rs crate) + UI + vault.

**Reconocimiento:**
- `Crozzo2FAPoC.js` creado (PoC en JS).
- Diseño completo en `docs/POS-HARDENING-DESIGN.md`.
- Requiere crate `totp-rs` en Cargo.toml.

**Operación:**
1. ⏳ Añadir `totp-rs` a Cargo.toml.
2. ⏳ Crear comando Tauri `crozzo_totp_verify`.
3. ⏳ Crear UI modal de TOTP en login.
4. ⏳ Integrar con vault de certificados (DPAPI).
5. ⏳ Compilar y verificar.

**Contingencia:** Si build falla, revertir cambios en Rust.

**Rollback:** `git checkout` o restaurar backup.

**Verificación:** `cargo build` + prueba manual de login con 2FA.

**Agente asignado:** Ingeniero de seguridad (auth) + arquitectura (Rust).

---

### OP-08: Vault de certificados implementación real (R3)

**Objetivo:** Usar DPAPI vault para certificado DIAN (ya cableado).

**Riesgo:** Bajo (ya cableado en Rust).

**Reconocimiento:**
- `crozzo_cert_vault.rs` creado y compilado.
- `CrozzoCertVault.js` wrapper creado.
- Falta integrar en `CrozzoPosConfigManager` (canGoLive).

**Operación:**
1. ✅ Cablear Rust (hecho).
2. ✅ Crear JS wrapper (hecho).
3. ⏳ Integrar en `canGoLive()` (verificar cert vigente).
4. ⏳ Añadir UI para subir/verificar certificado.
5. ⏳ Probar con certificado real.

**Contingencia:** Si cert no se puede cargar, usar localStorage fallback.

**Rollback:** Desactivar vault, usar localStorage.

**Verificación:** Prueba manual de carga/verificación de cert.

**Agente asignado:** Ingeniero de seguridad (fiscal).

---

## 3. Plan de ejecución militar (orden de prioridad)

### Fase A — Inmediata (esta semana)
1. **OP-03** (monitoreo): Activar monkey-patch innerHTML (ya activo). Probar UI.
2. **OP-06** (bajo riesgo): Redactar contraseñas seed restantes.
3. **OP-08** (bajo riesgo): Integrar vault de certificados en canGoLive.

### Fase B — Corto plazo (1-2 semanas)
4. **OP-01** (medio riesgo): Integrar dual-write en ConfigManager.
5. **OP-02** (medio riesgo): RLS real frontend.
6. **OP-05** (medio riesgo): Cablear tracing/Prometheus.

### Fase C — Medio plazo (2-4 semanas)
7. **OP-07** (alto riesgo): 2FA implementación real.
8. **OP-04** (alto riesgo): WAF + auditoría externa.

### Fase D — Largo plazo (4+ semanas)
9. Monitoreo continuo.
10. Pentest anual.

---

## 4. Contingencias globales

| Escenario | Acción inmediata |
|-----------|------------------|
| Build Rust falla | Revertir cambios en lib.rs y módulos Rust; restaurar backup. |
| UI se rompe (sanitización) | `CrozzoFeatureFlags.set('useSanitizeInnerHtml', false)` + reload. |
| Facturación falla (dual-write) | `CrozzoFeatureFlags.set('useSqliteFiscal', false)` + reload. |
| Supabase bloquea (RLS) | `CrozzoFeatureFlags.set('useRlsBusinessId', false)` + reload. |
| Certificado no carga | Usar localStorage fallback. |
| 2FA bloquea login | Desactivar 2FA en config. |

---

## 5. Verificación triple

| Fase | Verificación |
|------|--------------|
| Antes | Backup creado, checks PASS, feature flags desactivados. |
| Durante | Monitoreo de errores, logs estructurados, smoke tests. |
| Después | Checks automatizados PASS, prueba manual, auditoría externa. |

---

*Documento de operaciones militares de alto riesgo. Cada operación requiere aprobación del escuadrón antes de ejecutar.*
