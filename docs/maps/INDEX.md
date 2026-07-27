# Mapas Crozzo POS — índice maestro

**Última regeneración:** 2026-07-14T22:55:52.318Z · v1.0.229 · `8842306`
**Versión OTA:** ver [`META.json`](META.json)  
**Mapa global (humano + agente):** [`../AGENT-SYSTEM-MAP.md`](../AGENT-SYSTEM-MAP.md)

---

## Cómo usar (agente / Aider / Cursor)

1. **Leer este INDEX** — elige el mapa según la tarea.
2. **`npm run map:refresh`** — si cambiaste `index.html`, infra sync, o PosMain (secciones/exports).
3. **`npm run edit:scope -- app/.../file.js symbol`** — antes de editar archivos críticos.
4. **No leer PosMain entero** — usar [`POSMAIN-SECTIONS.md`](POSMAIN-SECTIONS.md) + [`POSMAIN-SYNC-SYMBOLS.md`](POSMAIN-SYNC-SYMBOLS.md).

---

## Mapas por tipo

| Mapa | Tipo | Cuándo leerlo |
|------|------|----------------|
| [CONNECTIONS.md](CONNECTIONS.md) | **Conexiones** (quién llama a quién) | Antes de tocar sync, fanout, runtime |
| [SEQUENCES.md](SEQUENCES.md) | **Secuencias lógicas** (flujos paso a paso) | Bug “no llega a caja”, cobro, comandar |
| [SYNC-INVARIANTS.md](SYNC-INVARIANTS.md) | **Reglas fijas** (nunca violar) | Cualquier cambio Z0 |
| [DECISIONS.md](DECISIONS.md) | **Decisiones arquitectónicas** | Evitar re-debatir en código |
| [DOMAINS.md](DOMAINS.md) | **Dominio → archivos** | “¿Dónde está X?” |
| [KNOWN-ISSUES.md](KNOWN-ISSUES.md) | **Errores conocidos + soluciones** | Antes de parchear; buscar si ya se arregló |
| [AI-INSIGHTS.md](AI-INSIGHTS.md) | **Reporte IA admin** (flag, Edge, NVIDIA) | Super Admin habilita; key solo en nube |
| [known-issues.json](known-issues.json) | **Base machine-readable** | `npm run issues:search` |
| [EDIT-PACKET-TEMPLATE.md](EDIT-PACKET-TEMPLATE.md) | **Plantilla de tarea** | Pedir cambio al editor |
| [SYNC-REPAIR-PLAN.md](SYNC-REPAIR-PLAN.md) | **Plan reparación sync Z0** (paso a paso) | Reparar operación mesas/comandas/LAN/nube |
| [LOG-RUNTIME-REPAIR-PLAN.md](LOG-RUNTIME-REPAIR-PLAN.md) | **Plan logs runtime Tauri** (impresión, realtime flap) | Errores consola post-login |
| [COMANDA-AUTOPRINT-REPAIR-PLAN.md](COMANDA-AUTOPRINT-REPAIR-PLAN.md) | **Plan auto-print cocina/KDS** (ingest nube, toggle, silent) | Comanda llega pero no imprime sola |
| [QA-TIENDA-P0-CHECKLIST.md](QA-TIENDA-P0-CHECKLIST.md) | **Checklist QA sede P0** (login hotelero, directa, CRM, cobro CTA, flota, nav rol) | Antes de dar por listo en tienda |
| [MEJORA-SUPERIOR-MERCADO-CO-PLAN.md](MEJORA-SUPERIOR-MERCADO-CO-PLAN.md) | **Plan superior vs mercado CO** (H0–H4 desde auditoría) | Llevar producto a nota ~4.5; confianza→fiscal→wow |
| [OPS-COMMAND-CENTER.md](OPS-COMMAND-CENTER.md) | **Centro ops** (doctrina, COA, gates, OPORD H0) | Ejecutar mejoras como operación, no parches sueltos |
| [VALIDATION-REPORT-OPS-2026-07-17.md](VALIDATION-REPORT-OPS-2026-07-17.md) | **Reporte validación** lab + INTEL + PLAN-R1 | ¿Pass/fail? qué falta para mercado |
| ADR D-014 (en DECISIONS.md) | Sello sede + Dataico honesto + pago idempotente | No fingir CUFE/pagos; cola fiscal offline |
| [MILITARY-COMMAND-DOCTRINE.md](MILITARY-COMMAND-DOCTRINE.md) | **Doctrina armamento** + Command Bridge | Barra DDIL; `crozzoCommandBriefing()` |
| [STRESS-MILITARY-REVISION.md](STRESS-MILITARY-REVISION.md) | **Revisión militar de estrés** (lab 100-dev + afilados) | Pantano: flota intensiva, storm HTTP, backoff, semáforo |
| ADR D-016 (en DECISIONS.md) | Fachada única Command Bridge | Diag/Automation no ensamblan a mano |
| [mejora-superior-progress.json](mejora-superior-progress.json) | **Progreso** horizontes H0–H4 | Agente: marcar steps done/pending |
| [ROLE-OPS-AUDIT-PLAN.md](ROLE-OPS-AUDIT-PLAN.md) | **Auditoría 1×1 por rol** (caja→mesero→cocina→encargado→admin) | Mejorar operación acción por acción |
| [ROLE-OPS-INTERACTIONS.md](ROLE-OPS-INTERACTIONS.md) | **Matriz acción×rol** (gestión cuenta, LISTO, precuenta) | Qué puede cada rol y qué no |
| [role-ops-audit-progress.json](role-ops-audit-progress.json) | **Progreso** oleadas ROLE-OPS | Agente: marcar waves A–F |
| [FLEET-DIAG-SEDE.md](FLEET-DIAG-SEDE.md) | Diagnóstico flota (OTA, locationId, latencias WAN on/off) | Sprint 0 sync / tablet↔caja |
| [LOGICAS-PLAN-BASICO.md](LOGICAS-PLAN-BASICO.md) | Lógicas plan básico + roles por oficio | Restaurante / tienda / hotel F&B |
| [COMM-CASCADE-IMPROVE-PLAN.md](COMM-CASCADE-IMPROVE-PLAN.md) | Anti-solape WS/poll, failover ancla, path health | Comunicaciones zero-touch |
| ADR D-010 (en DECISIONS.md) | Path scoreboard + digest + mesh unificado + Wi‑Fi Direct bridge | Protocolos externos → Crozzo |
| ADR D-012 (en DECISIONS.md) | Eco `fleet_roster` desde caja + soft-heal descubrimiento | Flota sin CRDT/SWIM |
| [FLEET-IDENTITY.md](FLEET-IDENTITY.md) | Carnet deviceId/sede/IP/vías + anuncio post-QR | Descubrimiento flota |
| [sync-repair-progress.json](sync-repair-progress.json) | **Progreso machine-readable** del plan sync | Agente: marcar steps done/pending |
| [log-runtime-repair-progress.json](log-runtime-repair-progress.json) | **Progreso plan logs** | Agente: Fase A→F |

---

## Mapas auto-generados (`npm run map:refresh`)

| Archivo | Contenido |
|---------|-----------|
| [META.json](META.json) | Timestamp, semver, git HEAD, líneas PosMain |
| [BOOT-ORDER.md](BOOT-ORDER.md) | Orden `<script>` en `app/index.html` |
| [POSMAIN-SECTIONS.md](POSMAIN-SECTIONS.md) | Secciones `// ===` con rangos de línea |
| [POSMAIN-EXPORTS.md](POSMAIN-EXPORTS.md) | `window.crozzo*` / API global |
| [POSMAIN-SYNC-SYMBOLS.md](POSMAIN-SYNC-SYMBOLS.md) | Funciones sync filtradas + línea |
| [FILES-INDEX.md](FILES-INDEX.md) | Todos los `.js` en core/infra/modules/ui + líneas |

---

## Mantenimiento

| Evento | Acción |
|--------|--------|
| Nuevo script en `index.html` | `npm run map:refresh` + revisar CONNECTIONS si es infra |
| Nueva función export en PosMain | `map:refresh` |
| Cambio de flujo sync | Actualizar SEQUENCES + SYNC-INVARIANTS + DECISIONS |
| Bug corregido / regresión evitada | Nueva entrada en `known-issues.json` → `issues:refresh` |
| Decisión de diseño nueva | Entrada en DECISIONS.md |

---

## Comandos rápidos

```bash
npm run map:refresh
npm run issues:search -- "carrito revierte"
npm run edit:scope -- app/core/CrozzoPosMain.js crozzoSyncPosRuntimeCritical
npm run test:sync-clinical
```
