---
name: crozzo-motion
description: >-
  Project motion doctrine for Crozzo POS (BONA / P0). Use when the user asks about
  animations, motion canon, page-enter, toasts/modals feel, or design-app audit —
  NOT when they only give an example of a bug. Adapted from Emil Kowalski; does
  NOT install emilkowalski/skills. Does NOT auto-fix UI surfaces.
---

# Crozzo Motion (cherry-pick Emil Kowalski)

## Origen / matriz

| Origen | Aquí |
|--------|------|
| Frecuencia (100+/día → no animar) | ADAPT — P0 cajero/tablets/comandas/cocina/mesas |
| Easing / duration / no `transition: all` | ADAPT |
| `prefers-reduced-motion` | ADAPT + `crozzo-a11y-reduce-motion` |
| Vercel Web Interface Guidelines | ADAPT ligero — checklist abajo (no pack) |
| Frontend Design / BONA | Ya armado — no plugin extra |
| UI/UX Pro Max, Huashu, pack Emil | **REJECT** |

## Regla de oro — ejemplo ≠ ticket

Si el usuario dice **ejemplo** / “por ejemplo” / ilustra un fallo: **no** abras `app/` ni parchees esa superficie. Documentá el síntoma, aplicá doctrina, esperá orden explícita (“arreglá X”, “fix sidebar”).

Plan Motion UX Stabilization: **archivado / no re-ejecutar** (mandato erróneo). Deuda en código: no ampliar; revertir solo si el usuario lo pide.

## Canon (3 + 2)

| Token | Uso |
|-------|-----|
| `--duration-micro` (~150ms) | hover, press, nav chrome |
| `--duration-standard` (~250ms) | toast, small panels |
| `--duration-modal` (~350ms) | modal / login card |
| `--ease-out-smooth` / `--ease-premium` | ease-out **sin** overshoot |
| **Prohibido** | spring/overshoot; `transition: all` |

Dueño de tokens: `:root` en `app/css/CrozzoPosStyles.css`. Dual-copy del monolito si el selector está duplicado.

## Decisión rápida (doctrina)

1. ¿Se ve 100+/día (P0)? → casi sin motion (no page-enter / stagger / spring).
2. ¿Ocasional (modal, toast, login)? → corta, ease-out, respetar reduced-motion.
3. ¿Hover pelea con scroll/transición? → máquina de estados, no “1 cm de CSS” (ver KI-035 si el usuario pidió fix explícito).

## P0 silencioso (política)

En cajero / tablets / comandas / cocina / mesas: page-enter y stagger no son “delight”. Cambiar código P0 solo con orden explícita.

## Checklist Vercel (audit puntual)

Al auditar UI pedida (no inventar pantallas):

- [ ] Focus visible en controles accionables
- [ ] Hit target ≥ ~44px en touch/APK
- [ ] No `transition: all`
- [ ] `prefers-reduced-motion` / clase a11y respetados
- [ ] Un dueño de tokens; sin pelear temas genéricos vs BONA

## Evidencia

Tras un fix de motion **pedido**: skill `crozzo-qa-evidence` (Gate C).

## No hacer

- Instalar Pro Max / Huashu / pack Emil.
- Cazar bugs de ejemplo o re-ejecutar Motion UX Stabilization.
- Tocar sync/LAN por estética.
- Mezclar sesión de higiene `.cursor/` con diff en `app/`.
