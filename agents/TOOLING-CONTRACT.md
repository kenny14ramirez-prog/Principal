# Contrato de herramientas — Arsenal compartido (obligatorio para todo agente)

> Todo agente, sin excepción, sigue este contrato antes/después de actuar. Es la "conectividad interna" del ejército.

## A. Antes de actuar (reconocimiento)

| # | Herramienta | Comando / Acción | Propósito |
|---|---|---|---|
| 1 | Mapas | Leer `docs/maps/INDEX.md` + `SYNC-INVARIANTS.md` | Entender arquitectura e invariantes |
| 2 | Known Issues | `npm run issues:search -- "síntoma"` | Evitar re-trabajo |
| 3 | Grafo | `npm run graph:search` / `trace_path` | Blast radius, quién llama a quién |
| 4 | Símbolos | `mcp-code-context` (`search_symbols`, `read_file_surgical`) | Lectura quirúrgica en archivos grandes |
| 5 | Memoria | `npm run synapse:search -- "tema"` | Contexto de largo plazo |
| 6 | Scope | `npm run edit:scope -- app/ruta/archivo.js simbodo` | Issues relacionados al archivo/símbodo |
| 7 | Git | `git status` + `git log -5` | Frescura y rama |

## B. Durante la ejecución

- Editar **solo** `app/` (fuente canónica). `src/` es espejo (bloqueado por hooks).
- Archivos críticos → `npm run edit:scope` **antes** del primer edit.
- Bundles Reservorio/Compras/Costos → `npm run consolidate` → `npm run sync`.
- No tocar `src/`, bundles generados, reservorio, respaldos sin pedido explícito.

## C. Después de actuar (verificación y reporte)

| # | Herramienta | Comando | Cuándo |
|---|---|---|---|
| 1 | Sync | `npm run sync` | Si tocó `app/` |
| 2 | Mapas | `npm run map:refresh` | Si cambió estructura/archivos |
| 3 | Issues | `npm run issues:refresh` | Si creó/cerró un KI |
| 4 | Clínico | `npm run test:sync-clinical` | Si tocó sync/LAN/runtime |
| 5 | Memoria | `npm run synapse:remember -- --path ... --title ... --content ...` | Si hubo decisión estable |
| 6 | SITREP | Escribir en `agents/runs/<escuadron>/` | Siempre al cerrar misión |
| 7 | Grafo | `npm run graph:index` | Si se añadieron módulos nuevos |

## D. Clasificación de herramientas por general

| General | Herramientas primarias | Herramientas secundarias |
|---|---|---|
| G2 Inteligencia | Synapse, mapas, grafo, KI, websearch, webfetch, docs | git log, npm scripts |
| G3 Operaciones | edit:scope, sync, consolidate, test:*, map:refresh | grafo, KI, Synapse |
| G4/IG Auditoría | test:*, qa:*, issues:validate, clippy, cargo audit, eslint | mapas, KI, Synapse |
| G1/G4 Logística | tauri-action, npm scripts, graph:index, synapse:reindex | mapas, git |

## E. Prohibiciones

- No escribir en `src/` directo.
- No editar bundles generados a mano.
- No instalar packs externos (mattpocock/skills, agency-agents, Superpowers, gstack, etc.).
- No montar MCP de orquestación adicional.
- No responder sin evidencia.

## F. Conectividad entre herramientas (flujo de datos)

```
Código (app/) ──sync──► src/ (espejo Tauri)
     │
     ├──map:refresh──► docs/maps/* (BOOT-ORDER, POSMAIN-*, FILES-INDEX, META, KI view)
     │
     ├──graph:index──► codebase-memory (grafo SQLite, comunidades, dependencias)
     │
     ├──issues:refresh──► known-issues.json + KNOWN-ISSUES.md
     │
     └──synapse:remember──► synapse/memory.db (memoria de largo plazo)
```

Toda herramienta lee/escribe sobre la misma fuente de verdad: `app/` + `docs/maps/` + `synapse/memory.db`.

## G. Automatización del ejército (conectividad)

1. CI gate de mapas: `map:refresh` debe dejar diff vacío en PR; si no, falla.
2. CI gate de issues: `issues:validate` + KI `fixed` con tests; bloquear merge si falla.
3. CI gate de docs: build Starlight + Vale + link-check.
4. CI gate de invariantes: property tests (fast-check/proptest) en cada PR.
5. Impact-based test selection: `detect_changes` (grafo) → símbodos afectados → dependientes → subset de tests.
6. Auto-captura de KI: hook de CI sobre fallo de test → borrador KI con stack trace y archivos.
7. Auto-regresión: cuando cambian archivos de un KI, re-correr sus tests; si fallan → `status: regressed` + notificación.
8. Auto-ADR desde PR: template con sección "Decision"; bot extrae a `DECISIONS.md` (MADR).
9. Auto-memoria post-merge: CI llama `synapse:remember` con resumen del PR.
10. Watcher de embeddings: re-indexar Synapse incrementalmente al cambiar `app/`/`docs/`.
11. Damage history por release: job que genera `DAMAGE-HISTORY.md` y lo commitea.
12. Pre-commit hook: `issues:search` sobre archivos cambiados; avisar si se toca un símbodo con KI.
13. Quarantine automática de flaky tests: si failure rate >5% en N runs, mover a cuarentena y abrir issue.
14. Runtime invariant monitor: contador de violaciones por sede; alerta si >0.
15. Doc drift detection: comparar firmas JSDoc con código; fallar si stale.
16. Auto-generar secuencias Mermaid desde `trace_path` en `map:refresh`.
17. Snapshot de grafo por release + diff estructural en damage history.

Scripts disponibles:
- `npm run army:status` — árbol de mando + últimos SITREPs.
- `npm run army:verify` — integridad del ejército (22+ checks).
- `npm run rls:coherence` — coherencia SQL↔inventario.
- `node scripts/check-invariants.mjs` — invariantes documentados.
- `node scripts/generate-damage-history.mjs` — regenerar DAMAGE-HISTORY.md.
- `node scripts/check-maps-fresh.mjs` — mapas frescos (sin modificar).
