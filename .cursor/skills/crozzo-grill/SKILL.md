---
name: crozzo-grill
description: >-
  One-question-at-a-time alignment before editing Crozzo POS. Trigger: user says
  grill, alinea, alinear antes, scope ambiguous, or Plan needs decisions. Not for
  “ejemplo” bug stories (those are not tickets). Cherry-pick Matt grilling — no
  mattpocock/skills pack.
---

# Crozzo Grill (cherry-pick Matt)

## Origen / matriz (no instalar el pack)

| Origen Matt | Aquí |
|-------------|------|
| grilling ADAPT | Este skill |
| grill-with-docs / domain | Synapse + `docs/maps/DECISIONS.md` — **no** `CONTEXT.md` |
| handoff | Ya: Synapse preCompact/stop |
| tdd / setup / wayfinder / triage / ask-matt | **REJECT** |

**Prohibido:** `npx skills add mattpocock/skills`, Superpowers, gstack.

## Objetivo

Cerrar malentendidos **antes** de tocar `app/`. Humano decide; agente recomienda.

**No usar grill para diluir una orden clara.** Si el mando ya dijo el PASS (ej. “mouse dentro abre, fuera cierra”), no preguntes de más: tesis → plan → act → verify hasta PASS (`crozzo-military-delivery`).

## Cómo interrogar

1. **Una pregunta a la vez** — solo si falta un dato que bloquea el plan. Esperar respuesta.
2. Recomendación breve (1–2 líneas) + por qué.
3. **Hechos** → Synapse, `issues:search`, maps, grep `app/` — no preguntar lo legible.
4. **Decisiones** → preguntar (alcance, nube vs LAN, desktop vs APK).
5. **No editar** hasta confirmación solo cuando el grill era necesario (“sí, eso” / plan aprobado).
6. Si dijo **ejemplo**: no conviertas el ejemplo en alcance de fix.

## Tras el grill

Plan corto: objetivo, archivos `app/`, pasos atómicos, criterio (`edit:scope` / `sync` / `test:sync-clinical` si sync), qué no tocar.

## Glosario

`store_memory` en `crozzo/*` o DECISIONS/KI — no `CONTEXT.md`.

## Relación

Plan mode (`crozzo-pro-workflow`): grill dentro o justo antes. Luego Agent.
