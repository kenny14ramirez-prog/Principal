# Mapas Crozzo POS — índice maestro

**Última regeneración:** 2026-07-29T06:00:48.704Z · v1.0.231 · `ab7dfe7`
**Mapa global (humano + agente):** [`../AGENT-SYSTEM-MAP.md`](../AGENT-SYSTEM-MAP.md)

> Reorganizado H0 (2026-07-27): 4 secciones temáticas en vez de tabla única.
> OTA deja de estar hardcodeada — consultar siempre META.json.

---

## Cómo usar (agente / Cursor / ZCode)

1. **Localiza tu tarea** en las secciones A–D de abajo.
2. **`npm run map:refresh`** — si cambiaste `index.html`, infra sync, o PosMain (secciones/exports).
3. **`npm run edit:scope -- app/.../file.js symbol`** — antes de editar archivos críticos.
4. **No leer PosMain entero** — usar [POSMAIN-SECTIONS.md](POSMAIN-SECTIONS.md) + [POSMAIN-SYNC-SYMBOLS.md](POSMAIN-SYNC-SYMBOLS.md).
5. **`npm run issues:search -- "síntoma"`** — antes de parchear; buscar si ya se arregló.

---

## A. Referencia automática (`npm run map:refresh`)

Generados desde `app/`. No editar a mano.

| Archivo | Contenido |
|---------|-----------|
| [META.json](META.json) | Timestamp, semver, git HEAD, líneas PosMain |
| [BOOT-ORDER.md](BOOT-ORDER.md) | Orden `<script>` en `app/index.html` |
| [POSMAIN-SECTIONS.md](POSMAIN-SECTIONS.md) | Secciones `// ===` con rangos de línea |
| [POSMAIN-EXPORTS.md](POSMAIN-EXPORTS.md) | `window.crozzo*` / API global |
| [POSMAIN-SYNC-SYMBOLS.md](POSMAIN-SYNC-SYMBOLS.md) | Funciones sync filtradas + línea |
| [FILES-INDEX.md](FILES-INDEX.md) | Todos los `.js` en core/infra/modules/ui + líneas |
| [KNOWN-ISSUES.md](KNOWN-ISSUES.md) | Generado desde `known-issues.json` |
| [known-issues.json](known-issues.json) | Base machine-readable (`npm run issues:search`) |
| [ISSUE-TEMPLATE.json](ISSUE-TEMPLATE.json) | Plantilla para nuevo KI |

---

## B. Doctrina y reglas (curado manual — inmutables salvo decisión)

| Mapa | Cuándo leerlo |
|------|----------------|
| [DECISIONS.md](DECISIONS.md) | ADRs D-001..D-NNN. Evitar re-debatir en código. ADRs referenciados: D-010 (path scoreboard/mesh), D-012 (fleet_roster), D-014 (sello sede/Dataico honesto), D-016 (fachada Command Bridge) |
| [FISCAL-CO-BLOQUEANTES.md](FISCAL-CO-BLOQUEANTES.md) | ⚖️ **Los 12 requisitos fiscales DIAN bloqueantes** + estado código + plan H1. Lectura obligatoria antes de tocar módulo fiscal. |
| [MILITARY-COMMAND-DOCTRINE.md](MILITARY-COMMAND-DOCTRINE.md) | Doctrina armamento DDIL; `crozzoCommandBriefing()`; INTEL mercado CO actualizada (WARO/Cuenti/iFood como nuevos entrantes) |
| [SYNC-INVARIANTS.md](SYNC-INVARIANTS.md) | Reglas fijas (nunca violar) — cualquier cambio Z0 |
| [CONNECTIONS.md](CONNECTIONS.md) | Conexiones (quién llama a quién) — grafo Mermaid capa Z0 |
| [SEQUENCES.md](SEQUENCES.md) | Secuencias lógicas (flujos paso a paso) — cobro, comandar |
| [DOMAINS.md](DOMAINS.md) | Dominio → archivos — "¿dónde está X?" |
| [FLEET-IDENTITY.md](FLEET-IDENTITY.md) | Carnet deviceId/sede/IP/vías + anuncio post-QR |
| [LOGICAS-PLAN-BASICO.md](LOGICAS-PLAN-BASICO.md) | Lógicas plan básico + roles por oficio (restaurante/tienda/hotel F&B) |
| [ROLE-OPS-INTERACTIONS.md](ROLE-OPS-INTERACTIONS.md) | Matriz acción×rol (gestión cuenta, LISTO, precuenta) |
| [EDIT-PACKET-TEMPLATE.md](EDIT-PACKET-TEMPLATE.md) | Plantilla de tarea para pedir cambio al editor |

---

## C. Planes activos (seguimiento en curso)

| Plan | Progress JSON | Cuándo leerlo |
|------|---------------|----------------|
| [MEJORA-SUPERIOR-MERCADO-CO-PLAN.md](MEJORA-SUPERIOR-MERCADO-CO-PLAN.md) | [mejora-superior-progress.json](mejora-superior-progress.json) | Paraguas H0–H4 vs mercado CO. Llevar producto a nota ~4.5 |
| [OPS-COMMAND-CENTER.md](OPS-COMMAND-CENTER.md) | — | Centro ops (doctrina, COA, gates, OPORD). Ejecutar mejoras como operación |
| [SYNC-REPAIR-PLAN.md](SYNC-REPAIR-PLAN.md) | [sync-repair-progress.json](sync-repair-progress.json) | Plan reparación sync Z0 — mesas/comandas/LAN/nube |
| [COMANDA-AUTOPRINT-REPAIR-PLAN.md](COMANDA-AUTOPRINT-REPAIR-PLAN.md) | [comanda-autoprint-repair-progress.json](comanda-autoprint-repair-progress.json) | Plan auto-print cocina/KDS — comanda llega pero no imprime sola |
| [STRESS-MILITARY-REVISION.md](STRESS-MILITARY-REVISION.md) | — | Revisión militar de estrés — lab 100-dev + afilados |

### Planes archivados (code-complete, solo falta QA sede)
En [`archive/`](archive/): COMM-CASCADE-IMPROVE-PLAN, LOG-RUNTIME-REPAIR-PLAN, ROLE-OPS-AUDIT-PLAN + sus progress JSON.

---

## D. Campo y QA (sede / validación)

| Mapa | Cuándo leerlo |
|------|----------------|
| [QA-TIENDA-P0-CHECKLIST.md](QA-TIENDA-P0-CHECKLIST.md) | Antes de dar por listo en tienda — login, directa, CRM, cobro CTA, flota, nav rol |
| [FLEET-DIAG-SEDE.md](FLEET-DIAG-SEDE.md) | Sprint 0 sync / tablet↔caja — OTA, locationId, latencias WAN on/off |
| [VALIDATION-REPORT-OPS-2026-07-17.md](VALIDATION-REPORT-OPS-2026-07-17.md) | Reporte validación lab + INTEL — ¿pass/fail? qué falta para mercado |
| [AI-INSIGHTS.md](AI-INSIGHTS.md) | Reporte IA admin (flag, Edge, NVIDIA) — Super Admin habilita; key solo en nube |

---

## Mantenimiento

| Evento | Acción |
|--------|--------|
| Nuevo script en `index.html` | `npm run map:refresh` + revisar CONNECTIONS si es infra |
| Nueva función export en PosMain | `map:refresh` |
| Cambio de flujo sync | Actualizar SEQUENCES + SYNC-INVARIANTS + DECISIONS |
| Bug corregido / regresión evitada | Nueva entrada en `known-issues.json` → `issues:refresh` |
| Decisión de diseño nueva | Entrada en DECISIONS.md |
| Plan completado (code-complete) | Mover a `archive/` con su progress JSON |

---

## Comandos rápidos

```bash
npm run map:refresh           # regenerar A (auto-generados)
npm run issues:search -- "carrito revierte"   # buscar antes de parchear
npm run edit:scope -- app/core/CrozzoPosMain.js crozzoSyncPosRuntimeCritical
npm run test:sync-clinical    # gate clínico obligatorio tras edits sync/LAN
npm run mind:refresh          # map:refresh + synapse:reindex (con drenaje KG)
```
