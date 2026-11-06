# Drills — Conectividad legendaria (L1 campo)

**Vigencia:** 2026-07-30 · **Campaña:** lab → sala · **Complementa:** [QA-TIENDA-P0-CHECKLIST.md](QA-TIENDA-P0-CHECKLIST.md) §6/§9 · [OFFLINE-COMBAT-NARRATIVE.md](OFFLINE-COMBAT-NARRATIVE.md) · [STRESS-MILITARY-REVISION.md](STRESS-MILITARY-REVISION.md)

> Lab 100 dispositivos ≠ listo sede. Este documento es el **pase de campo** que convierte calma de banco en calma de sala.

---

## Definición PASS (legendaria)

1. Corta internet → mesero cobra/comanda por LAN (sin CUFE falso).
2. Cae caja ancla → flota se re-ancla **sin** pedir QR al mesero.
3. Vuelve la red → sin thundering herd (tablets escalonadas).
4. Pill P0: **Sede lista** / **En local…** / **Recuperando…** — nunca DEFCON/SEAL.

Consola mando (encargado/diag):

```js
crozzoCommandBriefing()
CrozzoCommandBridge.stressEnvelope()
typeof crozzoSedeAutosanableRescue === 'function' && crozzoSedeAutosanableRescue({ reason: 'drill' })
```

---

## Setup mínimo

| Rol | Equipos |
|-----|---------|
| Rol A (caja ancla) | 1–2 PCs Tauri |
| Rol B (mesero) | 2 tablets |
| Cocina/comandas | 1 pantalla |
| Misma `locationId` | **Obligatorio** (invariante #9) |

Antes: `npm run test:legendary-connectivity` (paquete + cableado).  
Opcional lab: `npm run test:fleet-escala:intensiva`.

---

## Drill D1 — WAN off 10 min (G1)

| Paso | Acción | Esperado | OK |
|------|--------|----------|----|
| 1 | Cortar internet (dejar Wi‑Fi LAN) | Pill → En local / Recuperando | [ ] |
| 2 | Cobrar o venta mostrador | Opera sin nube | [ ] |
| 3 | Comandar desde tablet | Llega a cocina por LAN | [ ] |
| 4 | Ver factura/sello | `pendiente_*` — sin CUFE falso | [ ] |
| 5 | Resta WAN | Cola fiscal drena; pill → Sede lista | [ ] |

**FAIL si:** re-login forzado · CUFE demo · carrito fantasma post-cobro.

---

## Drill D2 — Apagar caja ancla 30–45 s

| Paso | Acción | Esperado | OK |
|------|--------|----------|----|
| 1 | Mesa abierta en tablet | Estado estable | [ ] |
| 2 | Apagar/matar Tauri caja Rol A ~40s | Tablet no pide QR; heal/mesh | [ ] |
| 3 | Encender caja | Re-ancla; peers visibles | [ ] |
| 4 | Comandar de nuevo | Sin duplicar comanda | [ ] |

**FAIL si:** mesero debe escanear QR otra vez · `solo_este_equipo` permanente · KI-016 parpadeo mesas.

---

## Drill D3 — Recovery masivo (anti-tormenta)

| Paso | Acción | Esperado | OK |
|------|--------|----------|----|
| 1 | 4+ equipos en LAN | Flota estable | [ ] |
| 2 | Toggle Wi‑Fi sede off→on | Reconnect escalonado (jitter) | [ ] |
| 3 | Observar path health / diag | Sin saturación HTTP larga | [ ] |
| 4 | `stressEnvelope()` | Techo/peers coherentes | [ ] |

**FAIL si:** todos reconectan al mismo ms y LAN muere 30s+.

---

## Drills POE — presencia viva (canal ops ≠ DB)

Complementa [OPS-PLANE-PROTOCOL.md](OPS-PLANE-PROTOCOL.md). Consola:

```js
crozzoOpsPresenceMetrics()
// Esperado tras enter/exit storm: skippedMetaForce ↑ · dbMetaUpserts casi plano
CrozzoCentralFailover && CrozzoCentralFailover.isPromoted && CrozzoCentralFailover.isPromoted()
```

### Drill D4 — Enter/leave storm (8 tablets)

| Paso | Acción | Esperado | OK |
|------|--------|----------|----|
| 1 | 6–8 tablets misma `locationId`, LAN+WAN up | Flota estable | [ ] |
| 2 | Abrir/cerrar mesas en ráfaga 2 min | Nombres visibles &lt;1s en peers | [ ] |
| 3 | `crozzoOpsPresenceMetrics()` | `publishEnter/Exit` ↑; `dbMetaUpserts` casi plano | [ ] |
| 4 | Cobrar una mesa | Carrito/cobro en DB; checkpoint meta OK | [ ] |

**FAIL si:** tormenta upserts `meta:__meta__` · carrito revierte (KI-003) · parpadeo mesas (KI-016).

### Drill D5 — WAN off — presencia LAN

| Paso | Acción | Esperado | OK |
|------|--------|----------|----|
| 1 | Cortar internet (Wi‑Fi LAN viva, caja up) | Pill → En local | [ ] |
| 2 | Enter mesa en tablet A | Tablet B ve nombre vía LAN `slot_presence` | [ ] |
| 3 | Exit mesa | Peers limpian presencia | [ ] |

**FAIL si:** presencia solo vuelve al restaurar WAN · force meta como único camino.

### Drill D6 — Caja off, WAN on — presencia cloud

| Paso | Acción | Esperado | OK |
|------|--------|----------|----|
| 1 | Apagar caja ancla; tablets con WAN | CloudOpsPulse live | [ ] |
| 2 | Enter/exit entre tablets | Presencia vía Broadcast (sin tormenta meta) | [ ] |
| 3 | Métricas | `cloudBroadcast` ↑; meta no dispara por cada enter | [ ] |

**FAIL si:** cada enter fuerza upsert meta · flota pide QR al mesero (ver D2).

### Drill D7 — Caja + WAN off (+ backup central)

| Paso | Acción | Esperado | OK |
|------|--------|----------|----|
| 1 | **Con backup central** configurado (2º PC / `CrozzoCentralFailover`) | Promote automático | [ ] |
| 2 | Enter/exit + comandar | Presencia + comandas vivas; carts vía hub backup | [ ] |
| 3 | **Sin backup** (solo mesh) | `SLOT_PRESENCE` gossip + comandas; carts limitados (documentar) | [ ] |
| 4 | FE | `pendiente_*` — sin CUFE falso | [ ] |

**FAIL si:** se inventa CUFE · se promete carrito compartido sin hub · mesero bloqueado en QR.

**Backup central (sede &gt;1 caja):** obligatorio ensayar promote/demote en D7. API: `CrozzoCentralFailover.promote` / `isPromoted`.

---

## Firma de campo (evidencia)

| Fecha | Sede | Quién | D1 | D2 | D3 | D4 | D5 | D6 | D7 | Notas |
|-------|------|-------|----|----|----|----|----|----|----|-------|
|       |      |       |    |    |    |    |    |    |    |       |

Si falla: `npm run issues:search -- "síntoma"` + deviceId + locationId.

---

## Relación con oleadas L2/L3 / POE

| Oleada | Qué aporta al drill |
|--------|---------------------|
| L2 jitter + purge 800 | D3 menos tormenta; techo comandas sano |
| L3 sede autosanable | D2 sin QR; `crozzoSedeAutosanableRescue` |
| POE (ops plane) | D4–D7 presencia efímera; meta DB no es bus de “estoy en mesa” |
