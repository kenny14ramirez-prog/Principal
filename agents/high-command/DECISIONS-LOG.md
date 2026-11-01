# Actas de Decisión del Alto Mando — Crozzo POS

> Formato: AD-HC-NNN. Cada acta incluye fecha, contexto, opciones, decisión, justificación, criterio PASS/FAIL, firma.

---

## AD-HC-001 — Toolchain Rust desbloqueado
- **Fecha:** 2026-11-01
- **Contexto:** OPORD declaraba bloqueo de compilación (`RC.EXE`/`link.exe` ausentes). `cargo check` ejecutado → PASS (exit 0, 2 warnings menores).
- **Decisión:** Cerrar F0-T02. El toolchain está disponible; F2–F7 pueden verificarse contra servidor Rust real.
- **Justificación:** Evidencia empírica (comando + salida + exit code) prevalece sobre OPORD.
- **PASS/FAIL:** PASS (`cargo check` exit 0).
- **Firma:** Alto Mando.

## AD-HC-002 — Iniciar Fase 1 (seguridad RLS) como prioridad
- **Fecha:** 2026-11-01
- **Contexto:** RLS permisiva (`USING (true)`) + token LAN vacío por defecto = riesgo de seguridad en multi-tenant. Reporte Supabase RLS disponible.
- **Decisión:** Iniciar Fase 1 (inventario de tablas sin RLS → diseño tenant-aware → migración → tests pgTAP).
- **Justificación:** Seguridad es bloqueante de SaaS multi-tenant; debe preceder a escala.
- **PASS/FAIL:** PASS cuando Security Advisor sin hallazgos críticos y cross-tenant denial test OK.
- **Firma:** Alto Mando.

## AD-HC-003 — Adoptar PowerSync en piloto
- **Fecha:** 2026-11-01
- **Contexto:** Sync custom funciona pero escala limitada (10-15 dispositivos). PowerSync es Supabase-native con SDK Tauri (alpha).
- **Decisión:** Piloto PowerSync en 1 sede, 4-6 semanas, con plan B custom (Replicache-style) si falla.
- **Justificación:** Acelera time-to-production; riesgo de alpha mitigado con aislamiento de connector.
- **PASS/FAIL:** PASS si piloto sostiene 100 dispositivos sin pérdida de datos.
- **Firma:** Alto Mando.

## AD-HC-004 — Adoptar @dian-kit para fiscal
- **Fecha:** 2026-11-01
- **Contexto:** Facturación electrónica DIAN requiere UBL 2.1 + XAdES-EPES + SOAP. @dian-kit (MIT) es el más maduro en Node/TS.
- **Decisión:** Usar @dian-kit como base para emisión FE; motor Rust propio a mediano plazo (seguridad de claves .p12).
- **Justificación:** Velocidad de implementación + licencia MIT; migración a Rust cuando claves .p12 requieran Vault Transit.
- **PASS/FAIL:** PASS si transmisión exitosa en ambiente de habilitación DIAN.
- **Firma:** Alto Mando.

## AD-HC-005 — Mantener custom sync como fallback
- **Fecha:** 2026-11-01
- **Contexto:** PowerSync en alpha; no se puede depender exclusivamente.
- **Decisión:** Mantener sync custom operativo hasta que piloto PowerSync se valide.
- **Justificación:** Redundancia; evita vendor lock-in prematuro.
- **PASS/FAIL:** PASS si ambos sistemas pueden coexistir sin conflicto.
- **Firma:** Alto Mando.

## AD-HC-006 — Activar pre-commit hook
- **Fecha:** 2026-11-01
- **Contexto:** Conectividad del arsenal requiere gates automáticos.
- **Decisión:** Activar `.githooks/pre-commit` (`git config core.hooksPath .githooks`).
- **Justificación:** verify-army + issues:validate + check-maps-fresh en cada commit.
- **PASS/FAIL:** PASS (hook activado, verificado).
- **Firma:** Alto Mando.

## AD-HC-007 — Crear rama fase1-seguridad-rls
- **Fecha:** 2026-11-01
- **Contexto:** Fase 1 requiere trabajo aislado.
- **Decisión:** Crear rama `fase1-seguridad-rls` desde `wip/macro-20261029`.
- **Justificación:** Aislamiento de cambios de seguridad.
- **PASS/FAIL:** PASS (rama creada).
- **Firma:** Alto Mando.

## AD-HC-008 — OPORD actualizado (toolchain)
- **Fecha:** 2026-11-01
- **Contexto:** OPORD declaraba toolchain bloqueado; ya resuelto.
- **Decisión:** Actualizar §0 punto 8, H-11, E2, F0-T02 para reflejar estado real.
- **Justificación:** No-inventar: el OPORD no debe mentir sobre el estado.
- **PASS/FAIL:** PASS (commit c7cd173).
- **Firma:** Alto Mando.
