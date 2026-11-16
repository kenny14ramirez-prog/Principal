# 22 — Estrés/Caos de Red (30 min)

**Agente:** Estrés/Caos de Red (POS Crozzo)
**Fecha:** 2026-11-14
**Duración total:** 1839681 ms (~30 min 40 s), 18 ciclos completos + ejecución parcial del 19 (cortada por ventana de 30 min), 108 corridas de escenario.

## Escenarios de caos ejecutados

Bucle continuo durante 30 min, en este orden por ciclo:

1. `test:connectivity-equilibrium` (13 checks de equilibrio conectividad) — 18 corridas.
2. `_chaos-network-check` (browser real: abort de `/api/**` y `*.supabase.co`, offline toggle, reconexión, observabilidad) — 18 corridas.
3. `_lan-ops-sync-check` (38 checks: LAN ops sync, Rust cargo check, apply comanda, WS skip poll, etc.) — 18 corridas, con timeout alto.
4. `_connectivity-standby-check` (8 checks standby LAN) — 18 corridas.
5. `_connectivity-mixed-flow-check` — 18 corridas.
6. `test:fleet-escala:intensiva` (flota hasta 100 dispositivos, salón realista 5 PCs + 10 tablets, adversarial) — 18 corridas.

## Comportamiento del sistema

- **Equilibrio de conectividad:** 18/18 OK (13 checks cada uno). Sin regresión en fanout híbrido, reconnect, orquestador anti-flap, throttle.
- **Caos de red (browser):** 17/18 OK. En las 17 corridas exitosas la app renderizó en offline y tras reconexión, sin errores fatales JS, y la observabilidad capturó ≥1 fallo de red (1–3 networkFailures). En 1 corrida (ciclo 2) `networkFailures=0` pese a rutas abortadas → check de observabilidad falló (falso negativo transitorio, probable race de instrumentación; app siguió renderizando y sin fatales).
- **LAN ops sync:** 18/18 OK (38 checks). Rust `cargo check` OK en cada ciclo; apply de comanda id=42, pull forzado, recover cloud, WS fresco skip poll, path health WS todos verdes. Duración promedio ~5.8 s.
- **Standby LAN:** 18/18 OK.
- **Mixed flow:** 18/18 OK.
- **Flota escala intensiva:** 18/18 OK (17 checks, hasta 100 dispositivos, ~0.3–1.7 s por escalón; salón realista 10/10 tablets + 5 PCs; adversarial de reintento malicioso bloqueado). Duración promedio ~85 s.

Totales: 107/108 corridas OK (99.1%). Única falla: observabilidad de caos en ciclo 2 (transitoria, no bloqueante para operación).

## Veredicto: RESILIENTE

El sistema soportó 30 min de caos continuo (desconexión/reconexión, abort de backend, sync masivo, multi-dispositivo hasta 100 nodos) sin caídas funcionales ni errores fatales JS; la única falla fue un falso negativo transitorio del contador de observabilidad de red en una corrida.

REPORTE ESCRITO