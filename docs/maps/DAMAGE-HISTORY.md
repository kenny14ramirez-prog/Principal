# DAMAGE-HISTORY — Historial de daño por release (Crozzo POS)

> Generado: 2026-11-18T17:04:04.006Z. Fuente: known-issues.json + git + OPORD.
> Regenerar: `node scripts/generate-damage-history.mjs`

## Release actual (HEAD cab2b77, rama main)

### Known Issues (48 total: 32 resolved, 16 watch)

**Watch (activos):**
| ID | Sev. | Descripción |
|---|---|---|
| KI-002 | critical | Git local detrÃ¡s de origin/main |
| KI-007 | medium | Fix CSS/APK no se ve ('no aplica') |
| KI-008 | high | Parche PosMain con fragmento stale / lÃ­nea incorrecta |
| KI-009 | medium | Fanout LAN-only early-return (nube no recibe) |
| KI-010 | medium | locationId distinta entre dispositivos |
| KI-011 | low | Tocar Reservorio en fix de sync Z0 |
| KI-012 | medium | Editar app/bundles/*.js a mano |
| KI-013 | low | Hooks/reglas Cursor nuevos sin reiniciar IDE |
| KI-014 | medium | Permiso bloqueado en capa transporte (mesero no escribe) |
| KI-019 | medium | Riesgos residuales â€” reservorio operativo y sync mesas |
| KI-042 | high | Timer de 2s + show() sin comprobar WANT_VISIBLE en 9 ventanas |
| KI-044 | medium | Supabase dock: id desalineado (supabase vs supabase-nube vs supabase-nube-web) |
| KI-045 | high | YouTube y Facebook no están en la política de apps (no usables) |
| KI-046 | medium | Click-outside atado al primer dock inicializado |
| KI-047 | high | Auth LAN desactivable con token vacío |
| KI-048 | critical | OTA con clave no coincidente |

**Resueltos:** 32 issues cerrados.

### Severidad
- Critical: 14
- High: 22
- Medium/Low: 12

### Bloqueos vigentes
- Ver OPORD-MISION-CIEN-100.md §0.

### Flaky tests
- (pendiente de instrumentación — objetivo <5% failure rate)

### Violaciones de invariantes
- (pendiente de runtime monitor — objetivo 0 en producción)

### Tests clínicos
- `test:sync-clinical` — ver última ejecución.

### Notas
- Este archivo se regenera por release y por SITREP de auditoría (SQ-AUDITORIA).
- Fuentes: `known-issues.json`, `OPORD-MISION-CIEN-100.md`, `sync-repair-progress.json`, git.
