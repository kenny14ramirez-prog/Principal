# Uso Normal POS — 30 minutos

- Directorio: `C:\proyectos\sistema pos`
- Inicio: `2026-11-13T19:16:01.735-05:00` (UTC `2026-11-14T00:16:01.735Z`)
- Fin: `2026-11-13T19:47:01.263-05:00` (UTC `2026-11-14T00:47:01.263Z`)
- Duración total: `1,859,528 ms` (~30 min 59 s)
- Servidor de prueba: `http://127.0.0.1:1420` (src sincronizado, sin modificar código fuente)

## Plan ejecutado (bucle)

Se ejecutaron 4 iteraciones completas. En cada iteración, secuencialmente:

1. `npm run qa:empresa:jornada:real`
2. `npm run test:operativo-oro`
3. `npm run test:hora-maestra:ci`
4. `npm run qa:agente:profundo`

Total de comandos ejecutados: `16` (4 flujos × 4 iteraciones). Todos con exit code `0`.

## Flujos ejecutados

### 1. `qa:empresa:jornada:real`

- Ejecuciones: 4
- Pasos por ejecución: 10 (F0–F9)
- Hallazgos P0/P1: 0 en todas las ejecuciones
- Errores de consola por ejecución: 3 (2× HTTP 403 a `api.github.com` por update check + 1× `net::ERR_CONNECTION_REFUSED` a `127.0.0.1:9876/health`, benigno)
- Fallos de red por ejecución: 1 (benigno, probe de conectividad)
- Resultado: todos los pasos PASS excepto step 1 (WARN por carga inicial). UBL/CUFE se generó correctamente (~3900 bytes).

### 2. `test:operativo-oro`

- Ejecuciones: 4
- Pasos por ejecución: 17 (OK) + 3 (WARN) + 0 (FAIL)
- Hallazgos P0/P1: 0
- Errores de consola: no capturados por el script (runner Playwright sin listener de consola); sin fallos de red reportados
- Advertencias recurrentes (WARN=3 por ejecución): `Sin rail companion en cajero`, `...en tablets`, `...en comandas` para roles novato/cocina
- Resultado: `OK=17 WARN=3 FAIL=0` en las 4 ejecuciones (38–48 s c/u). Cadenas de acción 5/5 OK. Adversarial pack completo.

### 3. `test:hora-maestra:ci`

- Ejecuciones: 4
- Pasos por ejecución: 17 (OK) + 3 (WARN) + 0 (FAIL)
- Hallazgos P0/P1: 0
- Resultado: `OK=17 WARN=3 FAIL=0` en las 4 ejecuciones (36–48 s c/u). Incluye sync + install chromium + raw. APROBADA.
- Pipeline completo (sync, playwright install, operativo-oro raw) sin fallos funcionales.

### 4. `qa:agente:profundo`

- Ejecuciones: 4
- Pasos por ejecución: 10
- Hallazgos P0/P1: 0 en todas
- Errores de consola por ejecución: 3 (mismo patrón que jornada:real: 2× 403 GitHub + 1 benigno)
- Fallos de red por ejecución: 1 (benigno)
- Resultado: 10/10 pasos PASS excepto step 1 (WARN carga inicial).

## Resumen agregado

| Métrica | Valor |
|---|---|
| Iteraciones completas | 4 |
| Comandos ejecutados | 16 |
| Comandos con exit 0 | 16 |
| Ejecuciones de agente (real+smoke) | 8 |
| Pasos de agente ejecutados | 80 |
| Hallazgos formales P0 | 0 |
| Hallazgos formales P1 | 0 |
| Errores consola (agente, total) | 24 (16× HTTP 403 GitHub + 8× benigno) |
| Fallos de red (agente, total) | 8 (benignos) |
| WARN operativo/hora-maestra (total) | 24 (3 × 8 ejecuciones) |
| FAIL operativo/hora-maestra (total) | 0 |

## Hallazgos P0

Ninguno. No se registró ningún fallo bloqueante (P0) en 30 minutos de uso normal.

## Hallazgos P1

Ninguno formal (0 findings en los 8 runs de agente).

### Observaciones no bloqueantes (para seguimiento, no P0/P1 funcional)

- **Companion rail ausente** en `cajero`, `tablets` y `comandas` para roles novato/cocina (`Sin rail companion en …`). Impacto: la guía acompañante no se muestra en esas pantallas/roles. Recurrente en 8/8 ejecuciones de operativo/hora-maestra. Clasificación sugerida: P2 (UX/guidance), no bloquea operación.
- **HTTP 403 en `api.github.com`** al consultar releases del repo `kenny14ramirez-prog/Principal` (update check). Es rate-limit de GitHub, no fallo del POS. Recurrente 2× por carga.
- **`net::ERR_CONNECTION_REFUSED` a `127.0.0.1:9876/health`**: probe de conectividad esperado en modo offline/benigno.
- **Sync (no fatal):** `ENOENT` al regenerar `supabase/functions/crm-registro-cliente/template.ts`; se usa el template JS existente. No afecta la app servida.

## Veredicto

**ESTABLE** — Uso normal del POS durante 30 minutos sin fallos P0/P1. Todos los flujos (apertura, venta, comanda, cobro, facturación UBL/CUFE, impresión, cierre) completaron; cadenas de acción 5/5 OK; adversarial pack sin colapsos. Las únicas incidencias son observaciones no bloqueantes (companion rail, rate-limit GitHub, probe de conectividad, template CRM).

REPORTE ESCRITO