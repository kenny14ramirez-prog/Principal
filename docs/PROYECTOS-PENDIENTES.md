# POS Crozzo — Proyectos Pendientes

**Fecha:** 2026-11-12
**Estado:** Fase -2 completa. Fase -1 completa. Fase 0 PoC completa. Operativos PASS.

---

## 1. Lo que se hizo (resumen)

### Código ejecutado (50 tareas)
- **Seguridad:** Secretos redactados (honeypot + 12 usuarios admin), CSP report-only, DOMPurify CDN, `CrozzoSanitize` (escape + sanitizeHtml), monkey-patch innerHTML (activado), 2FA PoC (TOTP en JS + Rust totp-rs), vault de certificados (DPAPI), RLS compat/JWT/payload enricher/pairing.
- **Persistencia:** `CrozzoStorage` (abstracción), SQLite PoC (Rust + JS), dual-write PoC + integración en `facturar()` y `ConfigManager.save()`, `CrozzoConfigWrapper` (auto-wrap), `CrozzoFiscalMigrationPoC`.
- **Observabilidad:** `CrozzoObservabilityDashboard` (métricas en tiempo real), tracing en Rust, `CrozzoMetrics` (Rust + JS), endpoint /metrics.
- **Feature flags / Infra:** `CrozzoFeatureFlags`, CI básico, script de migración innerHTML.
- **Bugs corregidos:** `mergeItemsInto` (sentCantidad), reversión de receta (firma), `devolverVenta` (string/objeto).
- **Verificación:** 13 checks automatizados (todos PASS), `cargo build` (exit 0), `npm run sync` (OK), `test:sync-clinical` (44/44), `test:operativo-oro:raw` (APROBADA, OK=17, FAIL=0).

### Documentos creados (11)
Análisis integral, plan reforzado, validación escuadrón, POS interno supremo, auditoría anti-fraude, hardening design, WAF/auditoría externa, SQL RLS real, resumen ejecución final, notas de ejecución, operaciones militares alto riesgo.

---

## 2. Lo que queda pendiente (y por qué es recomendado)

### A. WAF + Auditoría Externa (Infraestructura externa)
**Por qué es recomendado:** El sistema maneja datos fiscales y financieros. Sin WAF, los endpoints de Supabase están expuestos a ataques (DDoS, SQLi, XSS). Sin pentest, las vulnerabilidades no se detectan antes de go-live. Sin SIEM, no hay alertas de seguridad.

**Qué se necesita:**
- Cuenta Cloudflare (WAF + rate limiting + DDoS protection).
- Contratar pentest (empresa certificada).
- Cuenta Sentry (SIEM + alertas).

**Estimación:** 2-4 semanas (configuración + pentest + remediación).
**Prioridad:** P1 (antes de go-live en producción).

### B. Migración masiva de innerHTML (841 usos)
**Por qué es recomendado:** 841 usos de `innerHTML =` sin sanitización en 67 archivos. Esto es un riesgo de XSS (inyección de scripts vía datos de clientes/productos/comandas). El monkey-patch `useSanitizeInnerHtml` ya sanitiza automáticamente (activado por defecto), pero la migración manual es más segura y performante.

**Qué se necesita:**
- Migrar estatuto por estatuto (no regex global) en 15 archivos de mayor riesgo.
- Añadir DOMPurify + `CrozzoSanitize.js` en el HTML principal (ya hecho).
- Resolver incompatibilidad con handlers inline (`onclick`, `onchange`).
- Verificar sintaxis y smoke test después de cada archivo.

**Estimación:** 4-6 semanas (1 dev).
**Prioridad:** P2 (mejora de seguridad, no bloquea operación).

### C. 2FA implementación real (Rust totp-rs + UI modal)
**Por qué es recomendado:** Los roles admin/superadmin tienen acceso total al sistema. Sin 2FA, una contraseña comprometida da acceso completo. El PoC (Rust totp-rs + modal JS) está creado pero no integrado en el login flow.

**Qué se necesita:**
- Integrar modal TOTP en `handleLoginSubmit()` (PoC creado).
- Almacenar secreto TOTP en vault (namespace dedicado, no reutilizar cert vault).
- Generar QR `otpauth://` para enrolamiento.
- Códigos de recuperación one-time.
- Activar feature flag `use2faAdmin`.

**Estimación:** 2-3 semanas.
**Prioridad:** P1 (antes de go-live con datos reales).

### D. Numeración robusta con rollback
**Por qué es recomendado:** El consecutivo se incrementa antes de timbrar (huecos si falla). Ya se implementó `releaseConsecutivo()` (rollback si timbrado falla). El refactor completo (no incrementar hasta timbrado exitoso) requiere cambiar el flujo de facturación.

**Qué se necesita:**
- Mover `getNextConsecutivo()` después de `timbrarFactura()` exitoso.
- Marcar consecutivo como "anulado" si timbrado falla (auditoría).
- Verificar con tests automatizados.

**Estimación:** 1-2 semanas.
**Prioridad:** P2 (mejora fiscal, no bloquea operación).

### E. HLC/tombstones/dedup/outbox integration en código existente
**Por qué es recomendado:** Los módulos PoC están creados y verificados (19/19 checks PASS). La integración en el código de sync (merge-on-write, OperationalIngest, PosRuntimeCloud push) reduce duplicados y resurrección de mesas pagadas. Sin integración, los módulos son código muerto.

**Qué se necesita:**
- Integrar `CrozzoHlcIntegration.observe()` en `applyRemoteRow` (hecho parcialmente).
- Integrar `CrozzoTombstonesIntegration.shouldApplyRemote()` en `mergeSedeSnapshots` (hecho parcialmente).
- Integrar `CrozzoDedupIntegration.isDuplicate()` en `gateComandaNew`/`gateComandaEstado`.
- Integrar `CrozzoOutboxRuntimeIntegration.enqueue()` en `pushRuntimeNow`.
- Cablear módulos en `index.html` (ya hecho para RLS, falta para HLC/tombstones/dedup/outbox).

**Estimación:** 3-4 semanas.
**Prioridad:** P1 (reduce duplicados y pérdida de estado).

### F. Cablear tracing/Prometheus endpoint /metrics
**Por qué es recomendado:** El endpoint `/metrics` ya existe en axum (handler preexistente). El módulo `CrozzoMetrics.js` combina métricas Rust + negocio. Falta cablear el dashboard interno para mostrar métricas en tiempo real.

**Qué se necesita:**
- Integrar `CrozzoObservabilityDashboard` en una página interna.
- Cablear `tracing-subscriber` en Rust (ya inicializado).
- Verificar endpoint `/metrics` en Tauri.

**Estimación:** 1 semana.
**Prioridad:** P3 (observabilidad, no bloquea operación).

---

## 3. Orden de ejecución recomendado

1. **E** — HLC/tombstones/dedup/outbox integration (3-4 semanas) — reduce duplicados.
2. **D** — Numeración robusta (1-2 semanas) — mejora fiscal.
3. **C** — 2FA real (2-3 semanas) — seguridad admin.
4. **B** — Migración innerHTML (4-6 semanas) — seguridad XSS.
5. **A** — WAF + pentest + Sentry (2-4 semanas) — infraestructura externa.
6. **F** — Tracing/Prometheus (1 semana) — observabilidad.

**Total estimado:** 13-20 semanas (1 dev full-time).

---

## 4. Verificación

Cada tarea tiene checks automatizados en `scripts/_*-check.mjs`. Ejecutar:
```bash
node scripts/_reversion-inventario-check.mjs
node scripts/_fiscal-dualwrite-check.mjs
node scripts/_rls-compat-check.mjs
node scripts/_fase0-poc-check.mjs
node scripts/_fase0-integration-check.mjs
node scripts/_metrics-check.mjs
node scripts/_2fa-modal-check.mjs
node scripts/_2fa-integration-check.mjs
npm run test:sync-clinical
npm run test:operativo-oro:raw
```

---

*Documento de proyectos pendientes. Actualizar conforme se ejecuten las tareas.*
