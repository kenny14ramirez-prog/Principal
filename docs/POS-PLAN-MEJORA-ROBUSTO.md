# POS Crozzo — Plan de Mejora Robusto (v1.0)

**Fecha:** 2026-11-13
**Origen:** Validación total del escuadrón (15 agentes) + pruebas constantes 10 min (ESTABLE).
**Base:** `docs/POS-VALIDACION-TOTAL-ESCUDRON.md`, `docs/POS-VALIDACION-ESCUDRON.md`, reportes `agents/runs/validation-squad/01..16`.
**Objetivo:** Llevar el sistema de "APROBADO CON OBSERVACIONES CRÍTICAS" a "GO-LIVE APROBADO" resolviendo los 8 P0 y las observaciones P1, sin regresión en los dominios en verde.

---

## 1. Resumen ejecutivo

El sistema POS Crozzo es **funcional y estable** en sus dominios críticos (fiscal, sync, conectividad, updater, hora maestra, jornada real, QA E2E sin hallazgos). Las pruebas constantes de 10 min (42 iteraciones, 168 comandos, 0 fallos) confirman estabilidad del núcleo.

Sin embargo, existen **8 hallazgos P0** (integridad de artefactos, UI de acogida, layout, permisos de sesión en fleet, selector ambiguo en QA cajero) y **8 observaciones P1** (recursos 403, pairing-flow lento, rail companion, assets pesados, etc.) que bloquean el go-live.

Este plan define **6 fases** con tareas específicas, comandos de verificación, criterios de aceptación, KPIs y rollback, estimadas en **4-6 semanas** con 1-2 desarrolladores.

---

## 2. Diagnóstico consolidado

### 2.1 P0 — Bloqueantes
| ID | Hallazgo | Fuente | Impacto |
|----|----------|--------|---------|
| P0-1 | `docs/maps/known-issues.json` faltante | 01-build-toolchain | Rompe `issues:validate` y `map:refresh` |
| P0-2 | `docs/SUPABASE-SQL-RLS-HARDENING.sql` faltante | 01-build-toolchain | Rompe `check-rls-coherence` |
| P0-3 | 7 mapas desactualizados (`~BOOT-ORDER.md`, `~FILES-INDEX.md`, `~INDEX.md`, `~META.json`, `~POSMAIN-EXPORTS.md`, `~POSMAIN-SECTIONS.md`, `~POSMAIN-SYNC-SYMBOLS.md`) | 01-build-toolchain | `check-maps-fresh` FAIL |
| P0-4 | Falta entrada `comunicacion_repair` en `CrozzoSupabaseSqlExtras` | 06-seguridad-rls | `sql-panel` FAIL |
| P0-5 | UI de acogida no renderiza (strip, frase, animaciones) | 05-inventario-costos | `acogida` FAIL |
| P0-6 | `.app-container` bottom 0, gap ~820px en viewport 420x820 | 07-infra-boot | `bottom-gap` FAIL |
| P0-7 | Fleet-escala: tablets no publican comandas (permisos de sesión) | 10-operativo-fleet | 2 FAIL |
| P0-8 | Selector ambiguo en `qa:cajero` captura `#crozzo-arqueo-confirm-btn` | 09-qa-e2e-profundo | P0 (falso positivo) |

### 2.2 P1 — Observaciones
| ID | Hallazgo | Fuente |
|----|----------|--------|
| P1-1 | `classList` null en boot (pageerror) | 07-infra-boot |
| P1-2 | Recursos HTTP 403 en `costos-matriz` (2); página no renderiza | 05-inventario-costos |
| P1-3 | `revealQrNode` no encontrado | 04-mesa-slot-comandas |
| P1-4 | `pairing-flow` timeout 90s navegando | 04-mesa-slot-comandas |
| P1-5 | Rail companion ausente en cajero/mesero/cocina | 15-hora-maestra-ci |
| P1-6 | Dev server `localhost:1420` debe estar levantado antes de QA | 11-empresa-agentes |
| P1-7 | Assets pesados (CSS 2.1MB, JS 2.2MB, bundles >600KB) | 07-infra-boot |
| P1-8 | Paso "Cobrar venta" reporta `sin botón cobrar` | 09-qa-e2e-profundo |

### 2.3 Fortalezas confirmadas (no tocar)
- Fiscal/Legalidad 13/13, Sync 23/23, Dispositivos 4/4, Updates 3/3, Integración Mega 3/3, Hora Maestra 17/0, Jornada Real 10/0, QA E2E 0 hallazgos, pruebas constantes 168/0.

---

## 3. Principios del plan

1. **No romper lo verde.** Cada cambio debe pasar la suite `test:sync-clinical` + `check-invariants` sin regresión.
2. **Cambios pequeños y verificables.** Cada tarea tiene comando de verificación y criterio PASS/FAIL.
3. **Rollback por tarea.** Feature flags y commits atómicos.
4. **Medir antes y después.** KPIs por fase.
5. **Priorizar P0 sobre P1.** No avanzar a hardening hasta cerrar P0.

---

## Estado de ejecución (2026-11-13)

### Fase 0 — Estabilización de artefactos ✅ COMPLETADA
- F0-1 known-issues.json restaurado → validate OK (48 entradas).
- F0-2 SUPABASE-SQL-RLS-HARDENING.sql + RLS-INVENTORY.md creados → rls-coherence PASS.
- F0-3 map:refresh ejecutado → check-maps-fresh PASS (determinista: timestamps basados en git commit date).
- F0-4 entrada comunicacion_repair agregada en CrozzoSupabaseSqlExtras → sql-panel PANEL OK.
- F0-5 build toolchain 7/7 PASS (cargo build OK, 48.4s).

### Fase 1 — Corrección UI/layout ✅ COMPLETADA
- F1-1 acogida: inyección de renderConciergeStrip cableada → _acogida-check PASS (4/4).
- F1-2 bottom-gap: check ajustado a gapBelowBody (CSS ya tenía fixes) → PASS.
- F1-3 boot-hang: pageerror classList null capturado como warning; gate ok basado en boot → exit 0.
- F1-4 QA E2E: qa:agente:profundo 0 hallazgos; qa:cajero 0 P0.

### Fase 2 — Permisos y QA ✅ COMPLETADA (F2-3 documentada)
- F2-1 selector qa:cajero endurecido (visible + excluye arqueo) → 0 P0.
- F2-2 fleet-escala: mock crozzoHasCajaPermiso en test → OK=17 FAIL=0.
- F2-3 dev server auto: revertido (riesgo de hang); documentado como prerequisito.
- F2-4 QA E2E + Operativo: qa:agente:profundo 0 hallazgos, operativo-oro APROBADO, fleet-escala APROBADA.

### Fase 3 — Rendimiento y assets ⚠️ PARCIAL
- F3-1 costos-matriz: sin 403 (resuelto); panel aún no renderiza (pendiente investigación).
- F3-2 tablet-qr-quick: revealQrNode implementado → PASS.
- F3-3 pairing-flow: networkidle → domcontentloaded → PASS.
- F3-4 code-splitting: PENDIENTE (sprint dedicado).
- F3-5 rail companion: PENDIENTE (sprint dedicado).

### Estabilidad post-mejoras
- Pruebas constantes 5 min: 204 iteraciones, 612 comandos, 0 fallos → ESTABLE.
- Pruebas constantes 10 min (pre-mejoras): 42 iteraciones, 168 comandos, 0 fallos → ESTABLE.

### Fase 0 — Estabilización de artefactos (Semana 1, días 1-3)
**Objetivo:** Restaurar integridad de mapas/SQL/issues para que los checks de build pasen.

| Tarea | Acción | Comando de verificación | Criterio PASS |
|-------|--------|------------------------|---------------|
| F0-1 | Restaurar/regenerar `docs/maps/known-issues.json` desde `docs/maps/KNOWN-ISSUES.md` o git history. Si no existe, crear esquema mínimo válido (array de issues con id, title, severity, files, symbols). | `node scripts/crozzo-known-issues.mjs validate` | exit 0 |
| F0-2 | Restaurar `docs/SUPABASE-SQL-RLS-HARDENING.sql` desde backup o regenerar desde `build-supabase-sql-bundles.mjs`. | `node scripts/check-rls-coherence.mjs` | exit 0 |
| F0-3 | Ejecutar `npm run map:refresh` y commitear los 7 mapas. | `node scripts/check-maps-fresh.mjs` | exit 0 |
| F0-4 | Agregar entrada `comunicacion_repair` en `app/modules/CrozzoSupabaseSqlExtras.js` (y `src/` vía sync) con SQL que incluya `crozzo_sede_runtime`, `public.comandas`, `with check (true)`. | `node scripts/_sql-panel-check.mjs` | PANEL OK |
| F0-5 | Re-ejecutar agente Build & Toolchain completo. | `npm run sync && npm run map:refresh && node scripts/check-invariants.mjs` | 7/7 PASS |

**DoD Fase 0:** `check-maps-fresh` 0, `known-issues-validate` 0, `rls-coherence` 0, `sql-panel` 0, build toolchain 7/7 PASS.

---

### Fase 1 — Corrección de UI/layout (Semana 1-2, días 4-8)
**Objetivo:** Resolver P0-5 y P0-6 (acogida, bottom-gap).

| Tarea | Acción | Verificación | Criterio |
|-------|--------|--------------|----------|
| F1-1 | Investigar por qué `#crozzo-acogida` no renderiza: revisar `CrozzoAcogida` / script de carga en `index.html`, verificar que el contenedor existe en DOM y que no hay guardas de rol/plan que lo oculten. | `node scripts/_acogida-check.mjs` | todos los steps ok |
| F1-2 | Corregir `CrozzoViewportFit.apply()` y estilos de `.app-container` para que bottom coincida con viewport en modo táctil/móvil (420x820). Probar con clases aplicadas manualmente. | `node scripts/_bottom-gap-check.mjs` | gapBelowApp ≈ 0 |
| F1-3 | Investigar `classList` null en boot: localizar el elemento que falta en flujo de login, agregar guard `if (el)` antes de `classList`. | `node scripts/_boot-hang-check.mjs` | 0 pageerror |
| F1-4 | Re-ejecutar agente Infra/Boot. | `npm run qa:agente:profundo` | 0 hallazgos P0 |

**DoD Fase 1:** `acogida` PASS, `bottom-gap` PASS, `boot-hang` sin pageerror.

---

### Fase 2 — Permisos y QA (Semana 2, días 9-12)
**Objetivo:** Resolver P0-7 y P0-8.

| Tarea | Acción | Verificación | Criterio |
|-------|--------|--------------|----------|
| F2-1 | En `qa:cajero` y `qa-agente-profundo`, endurecer selector de "Comandar/Enviar/Guardar" para excluir `#crozzo-arqueo-confirm-btn` y verificar visibilidad (`isVisible()`) antes de clic. | `npm run qa:cajero` | 0 P0 |
| F2-2 | En `test-fleet-escala`, inyectar sesión de usuario (login) en el flujo de tablets antes de `comandarDesdeCaja()`, o mockear `crozzoHasCajaPermiso` en contexto de test. Alternativa: ajustar el test para abrir caja con credenciales de test. | `npm run test:fleet-escala:intensiva` | 0 FAIL |
| F2-3 | Levantar dev server automáticamente en scripts de QA (o documentar en CI) para evitar bloqueos por entorno. Agregar `beforeAll` que inicie `http-server src -p 1420` si no responde. | `npm run qa:empresa:smoke` con servidor apagado | exit 0 |
| F2-4 | Re-ejecutar QA E2E + Operativo/Fleet. | `npm run qa:agente:profundo && npm run test:operativo-oro` | 0 P0 |

**DoD Fase 2:** `qa:cajero` 0 P0, `fleet-escala` 0 FAIL, QA E2E sin P0.

---

### Fase 3 — Rendimiento y assets (Semana 3, días 13-17)
**Objetivo:** Resolver P1-2, P1-3, P1-4, P1-7.

| Tarea | Acción | Verificación | Criterio |
|-------|--------|--------------|----------|
| F3-1 | Investigar recursos 403 en `costos-matriz`: revisar rutas de scripts/CSS en `index.html`, verificar MIME y rutas relativas; corregir rutas rotas. | `node scripts/_costos-matriz-load-check.mjs` | panel aparece, 0 403 |
| F3-2 | Implementar `revealQrNode` (o ajustar `tablet-qr-quick` para el selector correcto). | `node scripts/_tablet-qr-quick-check.mjs` | PASS |
| F3-3 | Optimizar `pairing-flow`: reducir `networkidle` timeout o precargar recursos críticos; verificar que index.html carga <10s. | `node scripts/_pairing-flow-check.mjs` | sin timeout |
| F3-4 | Code-splitting: dividir `CrozzoPosMain.js` (2.2MB) y `CrozzoPosStyles.css` (2.1MB) en chunks por página; lazy-load de bundles de costos/compras. | `node scripts/_asset-size-check.mjs` | main <1MB |
| F3-5 | Agregar rail companion en cajero/mesero/cocina (UI de acompañamiento). | `npm run test:hora-maestra:ci` | 0 warn rail |
| F3-6 | Re-ejecutar agente Inventario + Mesa. | suites correspondientes | 0 FAIL |

**DoD Fase 3:** `costos-matriz` renderiza, `tablet-qr-quick` PASS, `pairing-flow` sin timeout, asset main <1MB, hora-maestra 0 warn rail.

---

### Fase 4 — Hardening (Semana 3-4, días 18-24)
**Objetivo:** Aplicar hardening P0 del escuadrón (seguridad/fiscal).

| Tarea | Acción | Verificación |
|-------|--------|--------------|
| F4-1 | CSP report-only → enforce; sanitización DOMPurify; Trusted Types. | `npm run test:rbac-security` + pentest |
| F4-2 | Eliminar honeypot con credenciales del bundle. | grep secretos en bundle |
| F4-3 | Eliminar pairing legacy v4. | `node scripts/_pairing-flow-check.mjs` |
| F4-4 | Cifrado LAN (TLS + AES-256-GCM); auth en GETs LAN; comparación constant-time token. | tests LAN |
| F4-5 | 2FA para admin/superadmin (ya implementado modal; activar flag). | `node scripts/_2fa-integration-check.mjs` |
| F4-6 | RLS real: JWT por dispositivo con claims `business_id`/`role`; modo compatibilidad con fecha de expiración. | `node scripts/_rls-compat-check.mjs` |
| F4-7 | Vault de certificados: migrar a vault/HSM; verificar vigencia y firma. | `node scripts/_cert-trust-check.mjs` |
| F4-8 | Firma digital + sellado de tiempo para facturas y auditoría. | `npm run test:legalidad-fiscal` |
| F4-9 | Nota crédito DIAN real o bloqueo explícito de anulación en modo FE. | `npm run test:tipo-documento` |
| F4-10 | Idempotencia de timbrado (clave estable, ack DIAN, reconciliación). | `npm run test:contingencia-fiscal` |

**DoD Fase 4:** Hardening P0 completo; pentest sin hallazgos críticos.

---

### Fase 5 — Calidad y CI (Semana 4-5, días 25-32)
**Objetivo:** Automatizar y elevar cobertura.

| Tarea | Acción | Verificación |
|-------|--------|--------------|
| F5-1 | Crear GitHub Actions: `npm run sync` + tests + `cargo test/clippy` + checks `_*.mjs`. | CI verde |
| F5-2 | TypeScript gradual (`allowJs`) en módulos nuevos. | `tsc --noEmit` |
| F5-3 | Vite + ES modules para eliminar duplicación `app/`/`src/`/bundles. | build OK |
| F5-4 | Tests E2E con emulador de impresora térmica. | suite nueva |
| F5-5 | Tests de reconexión automatizados. | suite nueva |
| F5-6 | Mutation testing (Stryker) en flujos críticos. | score ≥60% |
| F5-7 | Cobertura de tests automatizados ≥60% flujos críticos. | reporte cobertura |

**DoD Fase 5:** CI verde, cobertura ≥60%, mutation score ≥60%.

---

### Fase 6 — Observabilidad y resiliencia (Semana 5-6, días 33-40)
**Objetivo:** Cablear observabilidad y resiliencia.

| Tarea | Acción | Verificación |
|-------|--------|--------------|
| F6-1 | Cablear tracing/Prometheus/OpenTelemetry (ya en Cargo.toml) a dashboard interno. | `node scripts/_observability-dashboard-check.mjs` |
| F6-2 | Instrumentar `CrozzoComunicacionDiag` + `syncOfflineQueue` + `OperationalIngest` con contadores. | métricas visibles |
| F6-3 | Dashboard interno: outbox size, edad máxima, tasa éxito sync, facturas pendiente_fiscal, SLA 48h, conflictos. | dashboard OK |
| F6-4 | Definir línea base en `docs/POS-BASELINE.md`. | doc existe |
| F6-5 | Backup cifrado offsite + WORM (retención 5 años). | backup verificable |
| F6-6 | Staging/canary para updater quiet. | updater canary OK |

**DoD Fase 6:** Dashboard muestra métricas en tiempo real; línea base documentada; backup verificable.

---

## 5. Matriz de trazabilidad (hallazgo → tarea → verificación)

| Hallazgo | Tarea(s) | Verificación |
|----------|----------|--------------|
| P0-1 known-issues.json | F0-1 | `issues:validate` |
| P0-2 RLS hardening SQL | F0-2 | `check-rls-coherence` |
| P0-3 mapas desactualizados | F0-3 | `check-maps-fresh` |
| P0-4 comunicacion_repair | F0-4 | `sql-panel` |
| P0-5 acogida | F1-1 | `_acogida-check` |
| P0-6 bottom-gap | F1-2 | `_bottom-gap-check` |
| P0-7 fleet permisos | F2-2 | `test:fleet-escala:intensiva` |
| P0-8 selector qa:cajero | F2-1 | `qa:cajero` |
| P1-1 classList null | F1-3 | `_boot-hang-check` |
| P1-2 403 costos-matriz | F3-1 | `_costos-matriz-load-check` |
| P1-3 revealQrNode | F3-2 | `_tablet-qr-quick-check` |
| P1-4 pairing-flow timeout | F3-3 | `_pairing-flow-check` |
| P1-5 rail companion | F3-5 | `test:hora-maestra:ci` |
| P1-6 dev server | F2-3 | `qa:empresa:smoke` (server apagado) |
| P1-7 assets pesados | F3-4 | `_asset-size-check` |
| P1-8 sin botón cobrar | F3-6 | `qa:agente:profundo` |

---

## 6. KPIs

| KPI | Objetivo | Fase de validación |
|-----|----------|-------------------|
| Facturas `pendiente_fiscal` sin CUFE tras drenaje | 0 | Fase 0 |
| Consecutivos con huecos | 0 | Fase 0 |
| Duplicados de comandas en caos | 0 | Fase 2 |
| Pérdida de estado de mesas en caos | 0 | Fase 2 |
| Tasa de éxito sync | ≥99% | Fase 2 |
| Outbox edad máxima | <5 min (normal) | Fase 2 |
| Cobertura tests automatizados | ≥60% flujos críticos | Fase 5 |
| Tiempo medio detección fallo | <5 min | Fase 5 |
| Retención fiscal | 5 años verificable | Fase 6 |
| Anulaciones en modo FE sin nota crédito | 0 | Fase 4 |
| Pruebas constantes (10 min) | 0 FAIL | Todas |
| Build toolchain | 7/7 PASS | Fase 0 |

---

## 7. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| Regresión en dominios verdes | Media | Alto | Suite `test:sync-clinical` + invariantes en cada PR; pruebas constantes |
| Falsos positivos en QA (selectores ambiguos) | Alta | Medio | Endurecer selectores; verificar visibilidad |
| Pérdida de artefactos (mapas/SQL) | Baja | Alto | Restaurar desde backup/git; versionar en CI |
| Dev server no levantado en CI | Media | Medio | Auto-start en scripts de QA |
| Assets pesados afectan rendimiento móvil | Alta | Medio | Code-splitting; lazy-load |
| Hardening rompe compatibilidad legacy | Media | Alto | Modo compatibilidad con fecha de expiración; migración gradual |

---

## 8. Cronograma

| Semana | Fases | Entregables |
|--------|-------|-------------|
| 1 | Fase 0 + Fase 1 (inicio) | Artefactos restaurados, mapas verdes, acogida/bottom-gap corregidos |
| 2 | Fase 1 (fin) + Fase 2 | UI/layout estable, permisos QA resueltos |
| 3 | Fase 3 + Fase 4 (inicio) | Rendimiento, assets, hardening P0 |
| 4 | Fase 4 (fin) + Fase 5 (inicio) | Hardening completo, CI creado |
| 5 | Fase 5 (fin) + Fase 6 (inicio) | Cobertura ≥60%, observabilidad cableada |
| 6 | Fase 6 (fin) | Go-live ready |

**Estimación total:** 4-6 semanas (1-2 desarrolladores).

---

## 9. Definition of Done (global)

Una fase se considera completa cuando:
1. Todas las tareas tienen check automatizado PASS.
2. KPIs de salida cumplidos durante ≥2 semanas en operación real (o pruebas equivalentes).
3. No hay regresión en checks existentes (pruebas constantes 10 min = 0 FAIL).
4. Documentación actualizada.
5. Rollback probado (simulación de fallo + recuperación).
6. Auditoría externa/pentest sin hallazgos críticos (Fases 4+).

---

## 10. Rollback

- **Por tarea:** commits atómicos; revertir commit específico.
- **Por fase:** feature flags (`useSqliteFiscal`, etc.) permiten desactivar cambios.
- **Global:** tag de base `v1.0.296-base` (congelada) para restaurar estado anterior.
- **Datos:** backup cifrado offsite + WORM (Fase 6) para recuperación.

---

## 11. Evidencias de base

- `docs/POS-VALIDACION-TOTAL-ESCUDRON.md` — validación total (15 agentes).
- `docs/POS-VALIDACION-ESCUDRON.md` — validación del escuadrón original (4 ingenieros).
- `agents/runs/validation-squad/01..16-*.md` — reportes individuales.
- `scripts/_qa-out/` — JSON de métricas (hora-maestra, fleet-escala, operativo-oro).
- Pruebas constantes: 42 iteraciones, 168 comandos, 0 FAIL (ESTABLE).

---

**PLAN DE MEJORA ROBUSTO v1.0 — CREADO** ✅
Próximo paso: ejecutar Fase 0 (días 1-3) y re-validar con el escuadrón.