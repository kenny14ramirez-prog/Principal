---
title: "ARMY DOCTRINE"
---

# Doctrina del Ejército — Crozzo POS (mando y conectividad)

> Estándar: mission-critical / militar. Todo agente, escuadrón y general opera bajo esta doctrina. Sin excepciones.

## 1. Cadena de mando

```
MANDO (usuario / director del proyecto)
  └── COMANDANTE DE TEATRO (agente principal / Cursor AI)
        ├── GENERAL DE INTELIGENCIA (G2) — investigación, memoria, mapas, conocimiento
        ├── GENERAL DE OPERACIONES (G3) — terreno, código, sync, fiscal, refactor
        ├── GENERAL DE ASUNTOS INTERNOS (G4/IG) — auditoría, QA, seguridad, compliance
        └── GENERAL DE LOGÍSTICA (G1/G4) — infra, CI, releases, tooling, observabilidad
```

- El Comandante de Teatro recibe órdenes del Mando y las traduce en OPORD (órdenes de operación) por general.
- Cada general comanda escuadrones; cada escuadrón tiene un líder y agentes especializados.
- Todo agente reporta a su líder de escuadrón → general → Comandante → Mando.

## 2. Protocolo de órdenes (OPORD)

Toda orden seria sigue 5 pasos (no negociable):

1. **Investigar** — consultar arsenal (mapas, grafo, KI, memoria, invariantes) antes de actuar.
2. **Mostrar plan** — causa, archivos, pasos, criterio PASS/FAIL.
3. **Ejecutar al pie de la letra** — `edit:scope` en críticos, editar solo `app/`, `npm run sync`.
4. **Verificar hasta PASS** — si falla, repetir. Prohibido "casi" / "prueba luego" como cierre.
5. **Reportar SITREP** — situación, hallazgos, evidencia, riesgos residuales.

## 3. Protocolo de reporte (SITREP)

Toda misión termina con un SITREP en `agents/runs/<escuadron>/`:

```markdown
# SITREP-<ESC>-<YYYYMMDD-HHMM>
## Misión
## Arsenal consultado (mapas/KI/grafo/memoria/invariantes)
## Hallazgos (con evidencia: archivo:línea, commit, comando+salida)
## Acciones ejecutadas
## Verificación (PASS/FAIL + comandos)
## Riesgos residuales
## Recomendación al mando
```

## 4. Reglas de no-inventar (anti-alucinación)

- Prohibido responder "no se puede", "solo básico" a trabajo legítimo del repo.
- Toda afirmación técnica debe tener evidencia (archivo, línea, comando, salida, hash).
- Si no se sabe, investigar (G2) antes de responder.
- "COMPLETO" = código entregado + verificado, nunca solo código.

## 5. Conectividad interna (arsenal compartido)

Todo agente, antes de actuar, consulta en este orden:

1. `docs/maps/INDEX.md` + `SYNC-INVARIANTS.md` — mapa e invariantes.
2. `docs/maps/known-issues.json` — ¿ya arreglamos esto? (`npm run issues:search`).
3. `codebase-memory` grafo — quién llama a quién (blast radius).
4. `mcp-code-context` — símbolos en archivos grandes.
5. Synapse — memoria de largo plazo (`synapse:search`).
6. `npm run edit:scope` — issues relacionados al archivo/símbolo.

Después de actuar:

1. `npm run sync` (si tocó `app/`).
2. `npm run map:refresh` (si cambió estructura).
3. `npm run test:sync-clinical` (si tocó sync/LAN/runtime).
4. SITREP + `synapse:remember` si hubo decisión estable.

## 6. Estándares de evidencia

- Evidencia válida solo en `docs/maps/ops/evidencia/<TASK-ID>/` (commit, comando, salida, hash, timestamp).
- `agents/runs/**`, BITACORA, STRESS, CONTINUIDAD no son evidencia certificada.
- Jerarquía probatoria: código actual > OPORD > AM-2.

## 7. Clasificación de misiones

| Clase | Descripción | Aprobación |
|---|---|---|
| RUTINA | Cambio chico, 1 símbolo | Agent directo |
| TÁCTICA | Varios archivos, 1 dominio | Plan → Agent |
| OPERATIVA | Sync/LAN, >1 crítico, arquitectura | Plan mode → Agent (grill si ambiguo) |
| ESTRATÉGICA | Nuevo módulo, migración, seguridad | OPORD completo + aprobación Mando |

## 8. No tocar sin pedido explícito

- `app/modules/CrozzoReservorio*.js` y bundle Reservorio
- `app/bundles/*.js` (generados)
- `src/` directo (usar sync)
- `reservorio/`, `respaldo-comunicacion/`

## 9. Referencias

- `AGENTS.md` — guía para agentes.
- `docs/maps/OPORD-MISION-CIEN-100.md` — operación vigente.
- `docs/maps/INDEX.md` — hub de mapas.
- `docs/maps/SYNC-INVARIANTS.md` — invariantes.
- `docs/maps/known-issues.json` — anti-patrones.
- `.cursor/rules/` — reglas Cursor.
- `agents/registry.json` — registro de generales/escuadrones/agentes.
- `agents/TOOLING-CONTRACT.md` — contrato de herramientas.
