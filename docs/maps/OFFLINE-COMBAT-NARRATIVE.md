# Narrativa de combate — Offline real (H3a / G1)

**Vigencia:** 2026-07-30 · **Grieta:** G1 · **Doctrina:** [MILITARY-COMMAND-DOCTRINE.md](MILITARY-COMMAND-DOCTRINE.md)

---

## Pitch (15 segundos)

> **Crozzo sobrevive al corte de internet.**  
> La flota de sede sigue cobrando y comandando por Bridge LAN.  
> La factura electrónica queda en `pendiente_timbrado` (honesta).  
> Cuando vuelve la nube, la cola fiscal drena sola.

No digas “también tenemos offline”. Di **supervivencia de sede**.

---

## Qué ve el encargado (demo de campo)

| Paso | Acción | Resultado esperado |
|------|--------|-------------------|
| 1 | Cortar WAN (dejar Wi‑Fi/LAN local) | Tier LAN / path local |
| 2 | Cobrar mesa / venta mostrador | Opera sin nube |
| 3 | Comandar a cocina (si resta) | Llega por LAN |
| 4 | Abrir Facturas / sello | FE `pendiente_*` — **sin CUFE falso** |
| 5 | Resta scorecard / diag | Dimensión **Offline real** (= `offline_fleet`) |
| 6 | Resta internet | `CrozzoFiscalOutboxDrain` drena cola |

---

## Armas que lo hacen posible (ya en código)

| Arma | Rol |
|------|-----|
| `CrozzoLanSyncBridge` + `crozzoActivateLocalSyncPath` | Path local / `browser_offline` |
| `CrozzoOpFanout` + mesh (Gossip/BLE/Wi‑Fi Direct) | Flota sin nube |
| `CrozzoContingenciaFiscal` | `pendiente_timbrado` + SLA 48h |
| `CrozzoFiscalOutboxDrain` | Drena al volver WAN (`no_wan` si force=false) |
| `CrozzoCommandScorecard` | Dimensión **Offline real** (peso ×2.5) |

---

## Verificación automatizada

```bash
npm run test:offline-combat   # este empaque H3a
npm run test:sede-combat      # gate armamento sede
npm run test:contingencia-fiscal
```

---

## Vs mercado (por qué es asimétrico)

Alegra / Siigo / Gestro / Fudo / Loggro: **cloud puro** o offline de mentiras.  
Vendty: offline ~3h.  
Crozzo: Bridge LAN + cola fiscal honesta → **único en Colombia (G1)**.
