---
name: crozzo-qa-evidence
description: >-
  Evidence gate before claiming Crozzo work ready for sede/prod. Trigger: qa
  evidencia, listo para sede, production ready, evidencia visual, certify change.
  Needs clinical and/or QA-TIENDA proof — no fantasy scores. Agency Evidence idea
  only; does NOT install agency-agents.
---

# Crozzo QA Evidence (cherry-pick agency-agents)

## Origen / matriz

| Origen | Aquí |
|--------|------|
| Evidence Collector ADAPT | Gates anclados a Crozzo |
| Reality Checker / Playwright pack / install.sh roster | **REJECT** |

**Prohibido:** instalar agency-agents; READY sin evidencia; sustituir QA humana de sede.

## Principio

Claims sin evidencia = fantasía. Default: **NEEDS WORK**.

## Gates

### A — Sync / LAN / runtime

Si tocó Z0/sync: `npm run test:sync-clinical` → PASS o **FAILED**. Si no tocó sync: “clinical N/A porque …” (1 línea).

### B — QA tienda / P0

Si caja/tablets/comandas/cocina/mesas/cobro/BONA/sede: ítems relevantes de `docs/maps/QA-TIENDA-P0-CHECKLIST.md`. NO PROBADO en P0 del alcance → máx **NEEDS WORK**.

### C — UI / APK

Si visual: screenshot browser IDE o pasos Tauri (`Ctrl+Shift+R` tras sync) + grep APK si aplica. Sin evidencia → **NEEDS WORK**.

## Informe corto

Alcance · Gate A · Gate B · Gate C · Issues (≥1 si UI/sync en primer pase) · Veredicto: FAILED | NEEDS WORK | READY (sede).

READY solo con A OK/N-A, B sin FAIL del alcance, C OK si hubo UI. Verdad final de tienda = humano.

## Relación

Bug → `crozzo-diagnose` primero. Alcance ambiguo → `crozzo-grill`. Motion pedido → `crozzo-motion` + Gate C. PR grande → bugbot solo si el usuario pide.

## No hacer

- A+ / “zero issues” primer pase.
- Paths Laravel/Playwright del pack original.
- Certificar ejemplos no pedidos como “listo”.
