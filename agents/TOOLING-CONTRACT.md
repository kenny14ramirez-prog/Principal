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
