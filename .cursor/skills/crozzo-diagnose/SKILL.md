---
name: crozzo-diagnose
description: >-
  Red-loop diagnosis for hard Crozzo bugs (sync/LAN/caja/UI regressions). Trigger:
  diagnostica, diagnose, debug, or explicit “broken/flaky/reverting”. Requires a
  red-capable loop before hypotheses. Not for vague “ejemplo” without a fix ask.
  Cherry-pick Matt diagnosing-bugs — no mattpocock/skills pack.
---

# Crozzo Diagnose (cherry-pick Matt)

## Origen / matriz

| Origen Matt | Aquí |
|-------------|------|
| diagnosing-bugs ADAPT | Loop rojo + KI + clinical + edit:scope |
| tdd / implement | **REJECT** (clinical/checks, no TDD unitario obligatorio) |
| improve-architecture / code-review pack | **REJECT** (bugbot solo si el usuario pide) |

**Prohibido:** pack Matt; editar `src/`; saltar `edit:scope` en críticos.

## Principio

Sin **comando/pasos rojos** del síntoma, no hipotetizar ni parchear.

## Fase 0 — Memoria

1. `npm run issues:search -- "síntoma"`
2. Synapse `search_memory`
3. Maps si sync (KNOWN-ISSUES, SYNC-INVARIANTS, POSMAIN-SYNC-SYMBOLS)

KI/Synapse con fix → aplicar, no reinventar.

## Fase 1 — Loop rojo

Un signal pass/fail. Preferir: issues + repro → `test:sync-clinical` / `_*-check` → DevTap/logs → browser IDE si UI.

**Hecho:** nombrás comando/pasos ya corridos que pueden ponerse rojos en el síntoma exacto.

Sin loop → pedir artefacto; no pasar a hipótesis.

## Fases 2–6

2. Reproducir + minimizar.  
3. 3–5 hipótesis falsificables; mostrar ranking.  
4. Instrumentar una variable; prefijo `[DEBUG-crozzo-<tag>]`.  
5. Fix mínimo en `app/` + `edit:scope` + sync + clinical si sync; re-correr loop.  
6. Cleanup debug; Synapse corto; KI nuevo si anti-patrón.  
7. **Hasta PASS:** si el rojo sigue, no cerrar — otra hipótesis, otro fix. Entrega a medias = fallo (`crozzo-military-delivery`).

## No hacer

- Hipótesis sin rojo.
- Multi-agente / Superpowers TDD.
- Tratar “ejemplo” como ticket sin orden de fix.
- Editar `src/` o bundles a mano.
