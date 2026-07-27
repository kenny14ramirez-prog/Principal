# Crozzo POS — guía para agentes (Cursor / Aider)

## Estándar de entrega (no negociable)

Barra: **mission-critical / militar**. Reglas: `.cursor/rules/crozzo-military-delivery.mdc` + `crozzo-validate-plan-execute-verify.mdc`.

Por cada orden seria del mando:

1. **Investigar** (`app/`, KI, Synapse, mapas) — tesis corta
2. **Mostrar plan** (causa, archivos, pasos, criterio PASS/FAIL)
3. **Ejecutar al pie de la letra** (`edit:scope`, `app/` → `npm run sync`)
4. **Verificar hasta PASS** — si falla, repetir; prohibido “casi” / “prueba luego” como cierre
5. **Prohibido** responder NO inventado (“no se puede”, “solo básico”) a trabajo legítimo del repo

Techo de packs ≠ techo de esfuerzo. Usar el arsenal a fondo.

## Empieza aquí

1. **Hub de mapas:** [`docs/maps/INDEX.md`](docs/maps/INDEX.md) — conexiones, secuencias, invariantes, dominios
2. **Plan reparación sync:** [`docs/maps/SYNC-REPAIR-PLAN.md`](docs/maps/SYNC-REPAIR-PLAN.md) + [`sync-repair-progress.json`](docs/maps/sync-repair-progress.json)
3. **Mapa global:** [`docs/AGENT-SYSTEM-MAP.md`](docs/AGENT-SYSTEM-MAP.md)
4. **Reglas Cursor:** `.cursor/rules/` (`crozzo-military-delivery`, `crozzo-validate-plan-execute-verify`, `crozzo-maps-system`, `crozzo-known-issues`, `crozzo-sync-z0`, `crozzo-synapse-mind`, `crozzo-code-context`, `crozzo-code-graph`, `crozzo-pro-workflow`, `crozzo-apk-verify-before-change`)
5. **Skills Crozzo (techo / arsenal congelado):** `crozzo-grill`, `crozzo-diagnose`, `crozzo-qa-evidence`, `crozzo-motion` — cherry-pick; **no** packs externos. **ejemplo ≠ ticket.**
6. **Segunda mente Synapse:** memoria local + Ollama (ver sección abajo)
7. **mcp-code-context:** lectura/edición por símbolo en archivos grandes (ver sección abajo)
8. **Grafo codebase-memory:** quién llama a quién (ver sección abajo)
9. **Flujo profesional:** Plan / grill / diagnose / qa-evidence / Bugbot — ver sección abajo
10. **Fuente canónica:** editar **`app/`** — Tauri sirve **`src/`** (espejo)

## Segunda mente Synapse (Ollama)

Memoria de largo plazo del proyecto en `synapse/memory.db`. Cursor MCP: `.cursor/mcp.json` → `synapse_memory` (launcher `.cursor/mcp-launchers/`).

**Activar tools MCP:** cierra Cursor por completo y vuelve a abrirlo (o `Developer: Reload Window`). No reinicia Windows ni el POS.

```bash
npm run mind:health    # ¿están Synapse + code-context + grafo + hooks?
npm run mind:refresh   # map:refresh + synapse:reindex + graph:index
npm run synapse:status
npm run synapse:search -- "cliente facturación caja"
npm run synapse:remember -- --path crozzo/crm --title "Leccion" --content "..."
npm run synapse:seed
npm run synapse:reindex
```

- **Buscar** al empezar tareas no triviales (MCP `search_memory` o CLI).
- **Guardar** tras fixes/decisiones estables (`store_memory` / `synapse:remember`).
- Synapse ≠ KNOWN-ISSUES: Synapse guarda contexto/preferencias; `known-issues.json` guarda anti-patrones de código.
- Embeddings: `nomic-embed-text`. LLM ayudante: `qwen2.5:3b` (local).
- **Fase A hooks:** `preCompact` marca pendiente de guardar; al `stop` tras compactar el agente recibe followup para `store_memory`. Edits en `app/` generan snapshot automático en `crozzo/sessions`.

## mcp-code-context (símbolos / PosMain)

Server MCP en `.cursor/mcp.json` → `mcp-code-context` (devDependency). Útil para no cargar `CrozzoPosMain.js` entero.

- **Leer:** preferir tools quirúrgicas (`read_file_surgical`, `search_symbols`) en archivos grandes.
- **Escribir:** `write_file_surgical` / `insert_symbol` solo tras `npm run edit:scope` en críticos; el gate `beforeMCPExecution` lo exige y bloquea `src/`.
- **Sync:** writes MCP en `app/` disparan `npm run sync` vía `afterMCPExecution` (no solo `afterFileEdit`).
- Tras cambiar MCP: **Reload Window** en Cursor.
- Regla: `.cursor/rules/crozzo-code-context.mdc`

## Grafo codebase-memory (Fase C)

MCP `.cursor/mcp.json` → `codebase-memory` (devDependency). Complementa maps; no sustituye Synapse.

```bash
npm run graph:index
npm run graph:search -- --name_pattern ".*printComanda.*"
```

- Tools: `search_graph`, `trace_path`, `get_code_snippet`, …
- Hard-gates shell: `beforeShellExecution` bloquea force-push a main/master y writes a `src/` (permite `npm run sync`).
- Regla: `.cursor/rules/crozzo-code-graph.mdc`
- Graphify legacy: `graphify-out/GRAPH_REPORT.md` (puede estar desactualizado)

## Flujo profesional (Plan / subagentes)

Regla: `.cursor/rules/crozzo-pro-workflow.mdc`.

| Caso | Usar |
|------|------|
| Cambio chico / 1 símbolo | Agent directo |
| Alcance ambiguo / alinear antes | Skill [`.cursor/skills/crozzo-grill`](.cursor/skills/crozzo-grill/SKILL.md) → Plan → Agent |
| Sync/LAN, >1 crítico, arquitectura | **Plan mode** → Agent (grill si sigue ambiguo) |
| Bug duro / “diagnostica” | Skill [`.cursor/skills/crozzo-diagnose`](.cursor/skills/crozzo-diagnose/SKILL.md) (loop rojo antes de parchear) |
| “¿Listo para sede?” / qa evidencia | Skill [`.cursor/skills/crozzo-qa-evidence`](.cursor/skills/crozzo-qa-evidence/SKILL.md) (clinical + QA-TIENDA + UI) |
| Animaciones / canon motion (doctrina; no cazar ejemplos) | Skill [`.cursor/skills/crozzo-motion`](.cursor/skills/crozzo-motion/SKILL.md) |
| Explorar sin editar | Subagente `explore` o MCP grafo/símbolos |
| Diff/PR grande | `bugbot` (si se pide) |
| 2 enfoques reales | `best-of-n` solo con OK (caro) |

Handoff entre sesiones: Synapse (`preCompact` / `stop` + `crozzo/sessions`) — no skill Matt `handoff`.

Cherry-pick: Matt → grill + diagnose; agency → `crozzo-qa-evidence`; Emil → `crozzo-motion`. **No** instalar packs (`mattpocock/skills`, `agency-agents`, Superpowers, gstack, Emil, Pro Max, Huashu). **ejemplo ≠ ticket.** Motion UX Stabilization = archivado.

No montar “agencia” de 5 agentes ni más MCP de orquestación.

## Pipeline obligatorio tras editar frontend

```bash
npm run map:refresh   # regenerar BOOT-ORDER, POSMAIN-*, FILES-INDEX, KNOWN-ISSUES
npm run issues:search -- "síntoma"   # ¿ya arreglamos esto?
npm run edit:scope -- app/ruta/archivo.js nombreFuncion   # ANTES del primer edit en archivos críticos
npm run sync          # app/ → src/ (hook automático si editas app/ en Cursor)
npm run test:sync-clinical   # antes de dar por terminado cambios sync/LAN/runtime
```

Si tocas módulos dentro de bundles Reservorio/Compras/Costos:

```bash
npm run consolidate
npm run sync
```

## Archivos críticos (sync operativo Z0)

| Área | Archivo |
|------|---------|
| POS / mesas / carrito | `app/core/CrozzoPosMain.js` |
| Runtime nube | `app/modules/CrozzoPosRuntimeCloud.js` |
| Comandas cloud | `app/modules/CrozzoComandasCloudSync.js` |
| Fanout híbrido | `app/infra/CrozzoOpFanout.js` |
| LAN | `app/infra/CrozzoLanOpsSync.js` |
| Zonas Z0 | `app/infra/CrozzoCloudSyncPriorities.js` |

## No tocar sin pedido explícito

- `app/modules/CrozzoReservorio*.js` y bundle Reservorio
- `app/bundles/*.js` (generados)
- `src/` directo (usar sync)
- `reservorio/`, `respaldo-comunicacion/` (copias de respaldo)

## Verificación UI/APK

- Grep: `crozzo-android-apk`, `crozzo-touch-shell`, `crozzo-page-operativa`
- Recarga: `Ctrl+Shift+R` en Tauri tras sync
- Versión OTA: `releases/latest.json` + meta en `app/index.html`

## Git y frescura

- Mantener `main` alineado con `origin/main` (`git pull` antes de sesiones largas).
- Versión OTA: `releases/latest.json` + meta en `app/index.html`.
- **Cursor indexa solo `app/`** — `src/` está en `.cursorignore` (espejo); no editar `src/`.
- Hook bloquea escritura en `src/`; hook de sesión avisa si git va atrás de GitHub.

## Cursor — stack anti-código viejo

| Capa | Qué hace |
|------|----------|
| `.cursorignore` | Excluye espejo `src/`, respaldos, PDFs |
| `sessionStart` hook | Inyecta versión OTA + alerta git behind |
| `beforeShellExecution` | Bloquea force-push a main/master y writes directos a `src/` (permite `npm run sync`) |
| `preToolUse` hook | Deniega Write en `src/`; **exige `edit:scope`** en archivos críticos |
| `beforeMCPExecution` | Gate **solo** writes `mcp-code-context`: niega `src/`; exige stamp (`failClosed`) |
| `afterFileEdit` / `afterMCPExecution` | `npm run sync` tras editar `app/` (Write o MCP code-context); session-state |
| `stop` hook | Recuerda `test:sync-clinical` si hubo edits sync sin test reciente |
| Reglas | `crozzo-maps-system`, `crozzo-known-issues`, `crozzo-no-stale-code`, `crozzo-code-context`, `crozzo-code-graph`, `crozzo-sync-z0` |

## Aprendizaje acumulado (errores conocidos)

- Fuente: `docs/maps/known-issues.json` → vista `KNOWN-ISSUES.md`
- Buscar antes de parchear: `npm run issues:search -- "texto"`
- `edit:scope` muestra issues relacionados al archivo/símbolo
- Tras fix nuevo: `issues:next-id` → JSON → `issues:refresh`
