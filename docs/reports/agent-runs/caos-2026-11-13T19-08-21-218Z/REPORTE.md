# Reporte Agente Profundo

**Run:** caos-2026-11-13T19-08-21-218Z
**Preset:** caos
**URL:** http://localhost:1420
**Inicio:** 2026-11-13T19:08:21.219Z
**Fin:** 2026-11-13T19:08:31.683Z

## Resumen
- Pasos: 10
- Hallazgos: 1
- Errores consola: 0
- Fallos red: 3

## Hallazgos
- [P0] F0-PREVUELO: Cargar aplicación falló — page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:1420/
Call log:
[2m  - navigating to "http://localhost:1420/", waiting until "domcontentloaded"[22m


## Pasos
- [FAIL] 1. F0-PREVUELO: Cargar aplicación → EXCEPTION: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:1420/
Call log:
[2m  - navigating to "http://localhost:1420/", waiting until "domcontentloaded"[22m

- [PASS] 2. F1-LOGIN: Detectar y usar login → sin botón login (quizá ya logueado)
- [PASS] 3. F2-APERTURA: Abrir caja si se requiere → no requiere apertura
- [WARN] 4. F3-NAV: Navegar a POS/mesas → navegado
- [PASS] 5. F4-VENTA: Tomar una mesa/producto → sin mesa/producto detectado
- [PASS] 6. F5-COMANDA: Enviar/comandar → sin botón comandar
- [PASS] 7. F6-COBRO: Cobrar venta → sin botón cobrar
- [WARN] 8. F7-FACTURACION: Intentar facturación (cliente + factura + UBL/CUFE) → sin funciones fiscales en runtime
- [PASS] 9. F8-IMPRESION: Intentar imprimir comanda/cuenta → sin botón imprimir detectado
- [PASS] 10. F9-CIERRE: Buscar cierre de caja → no encontrado en navegación visible

## Evidencia
Screenshots/trace en: C:\proyectos\sistema pos\docs\reports\agent-runs\caos-2026-11-13T19-08-21-218Z
