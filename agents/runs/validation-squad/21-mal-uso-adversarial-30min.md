# Mal Uso / Adversarial POS — 30 minutos

- Directorio: `C:\proyectos\sistema pos`
- Inicio: `2026-11-14T00:10:00Z` (aprox.)
- Fin: `2026-11-14T00:40:00Z`
- Duración total: `~1,800,000 ms` (~30 min)
- Servidor de prueba: `http://127.0.0.1:1420` (src sincronizado, sin modificar código fuente)
- Nota: solo se crearon archivos de log/evidencia en `%TEMP%` y reportes en `docs/reports/agent-runs`; no se modificó código fuente.

## Plan ejecutado (bucle)

Se ejecutó un bucle adversarial durante ~30 min. En cada iteración se corrieron, secuencialmente:

1. `npm run qa:empresa:caos` (JornadaCaos → agente profundo con `QA_PRESET=caos`, `QA_CHAOS=1`)
2. `npm run test:fleet-escala:intensiva`
3. `node scripts/_offline-combat-demo.mjs`
4. `node scripts/_chaos-network-check.mjs`
5. `node scripts/_sync-property-check.mjs`
6. `node scripts/_op-fanout-check.mjs`

Total de iteraciones completas del bucle: **7** (caos) + **3** (fleet intensiva) + **~28** ejecuciones de cada check rápido.

## Escenarios adversariales ejecutados

### 1. `qa:empresa:caos` (uso errático / datos inválidos / mal uso de UI)

- Ejecuciones: 7 (exit 0 en todas)
- Pasos por ejecución: 10 (F0–F9)
- Hallazgos P0/P1: 0 en todas
- Errores de consola por ejecución: 5 (404/403 a recursos opcionales + `net::ERR_CONNECTION_REFUSED` a `127.0.0.1:9876/health`, benignos)
- Fallos de red por ejecución: 1 (probe de conectividad, benigno)
- Comportamiento del sistema:
  - Carga inicial: WARN (recursos opcionales no disponibles) pero app renderiza.
  - Login/apertura/navegación/venta/comanda/cobro/facturación/impresión/cierre: PASS.
  - UBL/CUFE se generó correctamente (~3900 bytes, CUFE válido) aun con datos de prueba (NIT `900000000`).
  - No se produjo pantalla en blanco ni crash JS.

### 2. `test:fleet-escala:intensiva` (abuso / duplicados / escala)

- Ejecuciones: 3 (exit 0 en todas)
- Resultado: `OK=17 FAIL=0` en cada ejecución.
- Adversarial `malicious-duplicate-action`: **bloqueado** — reintentar 3 veces el mismo `action_id` incrementó el contador de dedup (94→96); no se duplicaron comandas.
- Escala verificada: 2→100 dispositivos, HTTP storm, 10 tablets reales en navegador, 5 PCs leyendo central.
- Comportamiento: el sistema **bloqueó** el doble cobro/duplicado por `action_id` y mantuvo consistencia.

### 3. `_offline-combat-demo.mjs` (corte de internet / arqueo fiscal)

- Ejecuciones: ~28 (exit 0 en todas)
- Verificó cableado offline REAL: LAN Bridge, cola fiscal honesta (`pendiente_timbrado`, sin CUFE falso), scorecard `offline_fleet ≥ 4`.
- Comportamiento: **bloqueó** el drenaje fiscal sin WAN (salvo `force`) y mantuvo estado honesto. PASS.

### 4. `_chaos-network-check.mjs` (red caótica / offline toggle)

- Ejecuciones: ~28 (exit 0 en todas)
- Checks: 4/4 OK en cada ejecución:
  - App renderiza en offline.
  - App renderiza tras reconexión.
  - Sin errores fatales JS.
  - Observabilidad captura fallos de red (`networkFailures > 0`).
- Comportamiento: **permitió** seguir operando offline y recuperarse al reconectar; observabilidad registró los fallos.

### 5. `_sync-property-check.mjs` (propiedades de sincronización / arqueo)

- Ejecuciones: ~28 (exit 0 en todas)
- Suites: 4/4 OK, 1000 runs c/u:
  - `allowCloudAuthoritativeEmpty` (cloud vacío solo con flags explícitos).
  - `allowAutoDiscard` (solo con `userConfirmed`).
  - `activeWorkBlocksDiscard` (carrito/comanda/mesa activa bloquea auto-descarte).
  - `LWW no contradiction` (sin contradicción por timestamp).
- Comportamiento: **bloqueó** auto-descarte con trabajo activo y vaciado cloud no autorizado.

### 6. `_op-fanout-check.mjs` (fanout multi-canal / ACK)

- Ejecuciones: ~28 (exit 0 en todas)
- Checks: 20/20 OK en cada ejecución.
- Verificó Registry ACK, fanout multi-canal, transport path health, Wi-Fi Direct/P2P, dedup, comandas fanout + outbox entregada, anti-resurrección, despacho KDS, sync gate, LAN/WS/ingest sin re-fanout, caja directa/cobro/precuenta, orden de scripts.
- Comportamiento: **bloqueó** re-fanout indebido y anti-resurrección de comandas entregadas; ACK multi-canal operativo.

## Resumen agregado

| Métrica | Valor |
|---|---|
| Iteraciones del bucle | 7 (caos) + 3 (fleet) |
| Ejecuciones `qa:empresa:caos` | 7 |
| Ejecuciones `test:fleet-escala:intensiva` | 3 |
| Ejecuciones checks rápidos (cada uno) | ~28 |
| Pasos de agente ejecutados | 70 |
| Hallazgos P0/P1 formales | 0 |
| Errores de consola (agente, total) | 35 (5 × 7) benignos |
| Fallos de red (agente, total) | 7 benignos |
| Fleet OK / FAIL | 51 / 0 (17 × 3) |
| Checks rápidos fallidos | 0 |

## Comportamiento del sistema (bloqueó / permitió)

- **Bloqueó:** doble cobro/duplicado por `action_id`; auto-descarte con trabajo activo; vaciado cloud no autorizado; drenaje fiscal sin WAN; re-fanout indebido; anti-resurrección de comandas entregadas.
- **Permitió (correctamente):** operación offline y recuperación al reconectar; generación UBL/CUFE con datos de prueba; navegación errática sin crash; observabilidad de fallos de red; escala 2→100 dispositivos.
- **No bloqueante:** recursos opcionales (dev tap 9876, GitHub releases 403) no disponibles en entorno de prueba; no afectan operación del POS.

## Veredicto

**RESILIENTE** — El sistema resistió 30 minutos de mal uso/adversarial: datos inválidos, anulaciones, doble cobro, navegación errática, arqueo incorrecto, facturas mal y red caótica. No se registraron P0/P1; todos los checks (caos, fleet, offline, red, sync, fanout) pasaron. Las incidencias son benignas/no bloqueantes.

REPORTE ESCRITO