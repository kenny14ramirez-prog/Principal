# Validación Build & Toolchain — POS Crozzo

**Timestamp:** 2026-11-13 14:09:18
**Directorio de trabajo:** `C:\proyectos\sistema pos`

## Resumen

- Total checks: 7
- PASS: 4
- FAIL: 3
- ERROR: 0

## Detalle

| # | Check | Comando | Exit code | Duración (s) | Resultado |
|---|-------|---------|-----------|--------------|-----------|
| 1 | sync-frontend | `npm run sync` | 0 | 0.88 | PASS |
| 2 | cargo-build | `cargo build` (workdir `src-tauri`) | 0 | 67.01 | PASS |
| 3 | check-invariants | `node scripts/check-invariants.mjs` | 0 | 0.22 | PASS |
| 4 | check-maps-fresh | `node scripts/check-maps-fresh.mjs` | 1 | 1.26 | FAIL |
| 5 | known-issues-validate | `node scripts/crozzo-known-issues.mjs validate` | 1 | 0.63 | FAIL |
| 6 | rls-coherence | `node scripts/check-rls-coherence.mjs` | 1 | 0.11 | FAIL |
| 7 | map-refresh | `npm run map:refresh` | 0 | 1.13 | PASS |

## Fallas

### 4. check-maps-fresh (FAIL)

Comando: `node scripts/check-maps-fresh.mjs`
Exit code: 1
Duración: 1.26 s

Últimas 20 líneas:
```
FAIL: map:refresh produjo cambios. Ejecuta `npm run map:refresh` y commitea los mapas.
  ~BOOT-ORDER.md
  ~FILES-INDEX.md
  ~INDEX.md
  ~META.json
  ~POSMAIN-EXPORTS.md
  ~POSMAIN-SECTIONS.md
  ~POSMAIN-SYNC-SYMBOLS.md
```

### 5. known-issues-validate (FAIL)

Comando: `node scripts/crozzo-known-issues.mjs validate`
Exit code: 1
Duración: 0.63 s

Últimas 20 líneas:
```
[issues] Falta C:\proyectos\sistema pos\docs\maps\known-issues.json
```

### 6. rls-coherence (FAIL)

Comando: `node scripts/check-rls-coherence.mjs`
Exit code: 1
Duración: 0.11 s

Últimas 20 líneas:
```
node:fs:484
    return binding.readFileUtf8(path, stringToFlags(options.flag));
                   ^
Error: ENOENT: no such file or directory, open 'C:\proyectos\sistema pos\docs\SUPABASE-SQL-RLS-HARDENING.sql'
    at Object.readFileSync (node:fs:484:20)
    at file:///C:/proyectos/sistema%20pos/scripts/check-rls-coherence.mjs:7:16
    at ModuleJob.run (node:internal/modules/esm/module_job:561:25)
    at async asyncRunEntryPointWithESMLoader (node:internal/modules/loader:647:26)
    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:101:26)
Node.js v24.20.0
```

### Observación adicional — map-refresh (PASS con advertencia)

Comando: `npm run map:refresh`
Exit code: 0
Duración: 1.13 s

Últimas 20 líneas:
```
> tauri-app@1.0.296 map:refresh
> node scripts/crozzo-map-refresh.mjs
[map:refresh] issues:refresh falló: [issues] Falta C:\proyectos\sistema pos\docs\maps\known-issues.json
[map:refresh] OK → docs/maps/
  META.json, BOOT-ORDER.md, POSMAIN-SECTIONS.md, POSMAIN-EXPORTS.md
  POSMAIN-SYNC-SYMBOLS.md, FILES-INDEX.md, KNOWN-ISSUES.md
```

## Veredicto final

**RECHAZADO** — 3 fallos (check-maps-fresh, known-issues-validate, rls-coherence). Archivos faltantes: `docs/maps/known-issues.json` y `docs/SUPABASE-SQL-RLS-HARDENING.sql`. Requiere atención para restaurar/crear estos artefactos y re-ejecutar validación.
