# DAMAGE-HISTORY — Historial de daño por release (Crozzo POS)

> Generado: 2026-11-01. Fuente: `docs/maps/known-issues.json` + `docs/maps/OPORD-MISION-CIEN-100.md` + git. Se actualiza por release (job CI) y por SITREP.

## Release actual: v1.0.254-critical (HEAD 019996b, rama wip/macro-20261029)

### Known Issues (38 total: 28 resolved, 10 watch)

**Watch (activos, requieren atención):**
| ID | Sev. | Descripción |
|---|---|---|
| KI-002 | critical | Git local detrás de origin/main |
| KI-007 | medium | Fix CSS/APK no se ve |
| KI-008 | high | Parche PosMain stale/línea incorrecta |
| KI-009 | medium | Fanout LAN-only early-return (nube no recibe) |
| KI-010 | medium | locationId distinta entre dispositivos |
| KI-011 | low | Tocar Reservorio en fix sync Z0 |
| KI-012 | medium | Editar bundles a mano |
| KI-013 | low | Hooks/reglas Cursor sin reiniciar IDE |
| KI-014 | medium | Permiso bloqueado en capa transporte |
| KI-019 | medium | Riesgos residuales reservorio operativo/sync mesas |

**Resueltos destacados (sync críticos):** KI-003 (carrito revierte), KI-004 (pin local), KI-005 (LAN→cloud stale), KI-006 (pulso LAN sin pull), KI-015 (SyntaxError PosMain), KI-016 (comandas parpadean/purge), KI-017 (despacho cocina borra cuenta), KI-018 (mesas borradas), KI-023–KI-038 (varios).

### Bloqueos vigentes
- Toolchain Rust (`RC.EXE`/`link.exe` ausentes) → `cargo check` falla.
- P0-2: cadena fuente→build degradada (módulos de `app/` no llegan al APK).
- Fase 5 SYNC-REPAIR (QA tienda) pending (requiere prueba manual en sede).
- RLS pendiente (0.3), checklist consola (0.4), puerto (0.5), locationId canónica.

### Flaky tests
- (pendiente de instrumentación — objetivo <5% failure rate)

### Violaciones de invariantes
- (pendiente de runtime monitor — objetivo 0 en producción)

### Tests clínicos
- `test:sync-clinical` reportado 92/92 OK (sesión 2026-07-07).

### Ramas / stashes
- Rama actual: `wip/macro-20261029` (HEAD 019996b).
- Divergencia vs `origin/main`: 82 commits adelante, 19 atrás.
- Stashes: 7.

## Notas
- Este archivo se regenera por release y por SITREP de auditoría (SQ-AUDITORIA).
- Formato de entrada por release: KIs abiertos/cerrados/regresionados, flaky, violaciones, bloqueos, ramas.
- Fuentes: `known-issues.json`, `OPORD-MISION-CIEN-100.md`, `sync-repair-progress.json`, git.
