# Revisión militar de estrés — Crozzo POS

**Fecha:** 2026-07-17 · **OTA:** v1.0.230 · **Techo diseño:** 100 dispositivos  
**Doctrina:** [MILITARY-COMMAND-DOCTRINE.md](MILITARY-COMMAND-DOCTRINE.md) · Bridge: `crozzoCommandBriefing()` / `CrozzoCommandBridge.stressEnvelope()`

> Premisa: el arma se prueba en pantano. Lab + storm HTTP + flota intensiva.  
> Objetivo: con 5–15 equipos el sistema se sienta **tranquilo** porque aguanta 100.

---

## 1. Batería ejecutada (banco de pruebas)

| Prueba | Resultado | Evidencia |
|--------|-----------|-----------|
| `mind:health` | PASS (sesión) | stack mente |
| `test:sede-combat` | PASS (16) | armas mando |
| `test:sync-clinical` | PASS | Z0 / LAN / fanout / standby |
| `test:fleet-escala` (normal) | **APROBADA** OK=10 FAIL=0 | `_qa-out/fleet-escala-latest.json` |
| `test:fleet-escala:intensiva` | **APROBADA** OK=17 FAIL=0 | hasta **100 dispositivos** · 479ms |
| HTTP storm `_field-device-scale` | **OK** 2→100 | 100-dev: 99/99 comandas · **166ms** |
| Playwright Chromium | instalado | requerido para flota |

### Escalones intensivos (latencia caja mock)

| Dispositivos | Latencia storm | Notas |
|--------------|----------------|-------|
| 2–10 | 9–33ms | Arranque |
| 20 | 104ms | Fin de semana |
| 40 | 174ms | Sala llena |
| 50 | 272ms | Operación dura |
| **100** | **479ms** (flota) / **166ms** (HTTP storm) | Techo diseño — **sin fallos** |

Salón realista intensivo: **10/10 tablets + 5 PCs**. Adversarial dedup: **PASS**.

---

## 2. Mecanismos bajo lupa (por qué aguantan / dónde fallan)

### 2.1 Transporte LAN (WS + poll HTTP)

| Hallazgo | Análisis | Estado |
|----------|----------|--------|
| Poll runtime 650ms × N peers ≈ tormenta | Con WS fresco, `softPollCoveredByWs` omite poll (4.8s) | Mitigado |
| Digest match salta pull | Anti-entropy sin CRDT | OK |
| **Afilado 2026-07-17** | `fleetScalePollFactor`: peers≥10…60 estira poll hasta ×2.4 | **Nuevo** |
| Path health expone `fleetPeersEst`, `pollScaleFactor` | Observabilidad mando | **Nuevo** |

**¿Está bien?** Sí como doctrina WS-primary.  
**¿Mejorar?** Poll adaptativo hecho; siguiente: jitter aleatorio por deviceId (anti-thundering herd al recovery).

### 2.2 Servidor Rust LAN

| Hallazgo | Análisis | Estado |
|----------|----------|--------|
| Tokio async (ya no hilo sync) | Synapse viejo decía sync — **obsoleto** | OK |
| `tokio::spawn` por accept sin tope | Avalancha 100 conn simultáneas | **Debilidad** |
| **Afilado** | `Semaphore` **64** handlers HTTP concurrentes | **Nuevo** |
| Cap 800 comandas activas | Overflow trim | Documentado — riesgo en turno extremo |
| PENDING_MAX 2000 | Cola durable | OK |

**¿Por qué se rompería?** Disco sync + mutex en cada write bajo storm persistente.  
**Aguante:** storm 100 OK en mock; producción: semáforo + WS reducen HTTP.

### 2.3 Fanout / OpAck / dedup

| Hallazgo | Análisis | Estado |
|----------|----------|--------|
| Adversarial mismo `action_id` | Dedup PASS en flota | OK |
| MAX_RETRIES 2 · ACK 3.8s | Acota tormentas de reintento | OK |
| KI-009 watch LAN-only early-return | Regresión vigilada por clinical | Watch |

### 2.4 Fiscal / pagos / Command Bridge

| Hallazgo | Análisis | Estado |
|----------|----------|--------|
| Dataico honesto + cola + drain | No CUFE falso | OK lab |
| Digital pay idempotent | Bloquea sin ref/Wompi | OK |
| Bridge unificado | No parches sueltos | OK |
| Llaves reales sede | No en lab | **Gap campo** |

### 2.5 UI / P0

| Hallazgo | Análisis | Estado |
|----------|----------|--------|
| Sin banners mando en caja | Preferencia premium | OK |
| PosMain monolito 51k | Riesgo de regresión | Deuda H2 |

---

## 3. Debilidades abiertas (prioridad mando)

| ID | Severidad | Debilidad | Acción |
|----|-----------|-----------|--------|
| S-01 | Alta (campo) | QA sede humana DDIL no firmada | Checklist + drills |
| S-02 | Alta (producto) | FE/pago sin credenciales piloto | Dataico Auth + Wompi |
| S-03 | Media → mitigado | Cap 800 comandas activas en Rust | `COMANDAS_ACTIVE_MAX` + `trim_comandas_active` (purge entregada + oldest); `/status` expone count |
| S-04 | Media → mitigado | Recovery masivo sin jitter | WS `reconnectDelay` + `healAnchorSilence` usan `crozzoReconnectStaggerMs` (deviceId) |
| S-05 | Media | Git 7 behind origin | Alinear con OK dueño |
| S-06 | Baja | Playwright lab ≠ 100 browsers reales | Lab dedicado futuro |
| S-07 | Info | Synapse “HTTP sync” stale | Actualizado: Tokio + semáforo |

---

## 4. Plan de estrés continuo (ciclos)

| Ciclo | Qué | Criterio GO |
|-------|-----|-------------|
| Cada PR Z0 | `test:sync-clinical` + `test:sede-combat` | PASS |
| Cada oleada mando | `test:fleet-escala` | APROBADA |
| Semanal | `test:fleet-escala:intensiva` + HTTP storm 100 | FAIL=0 · p95&lt;1s |
| Pre-demo | Briefing GO + seal ≤2 + storm 50 | GO |
| Pre-producción sede | QA-TIENDA-P0 + drills §9 | Firmado |

Consola:

```js
crozzoCommandBriefing()
CrozzoCommandBridge.stressEnvelope()
```

---

## 5. Veredicto de mando

| Pregunta | Respuesta |
|----------|-----------|
| ¿Aguanta 100 en lab? | **SÍ** (intensiva + HTTP storm) |
| ¿Se siente arma o parche? | Stack unificado Bridge + semáforo + backoff |
| ¿Listo para mercado CO? | **Lab sí / Campo no** (sede + llaves) |
| ¿Lógica “mucho margen → calma”? | Correcta; backoff flota refuerza esa calma |

**Clasificación:** `MISSION_CAPABLE_STRESS` — techo 100 verificado en banco; afilado de producción aplicado; falta munición de campo (QA humana + credenciales).
