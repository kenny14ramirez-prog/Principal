# Reporte Agente Profundo

**Run:** real-2026-11-13T19-21-53-434Z
**Preset:** real
**URL:** http://localhost:1420
**Inicio:** 2026-11-13T19:21:53.435Z
**Fin:** 2026-11-13T19:24:58.675Z

## Resumen
- Pasos: 10
- Hallazgos: 0
- Errores consola: 1
- Fallos red: 1

## Hallazgos
✅ Sin hallazgos.


## Pasos
- [WARN] 1. F0-PREVUELO: Cargar aplicación → title="BONA origen · Sistema POS"
- [PASS] 2. F1-LOGIN: Detectar y usar login → login intentado
- [PASS] 3. F2-APERTURA: Abrir caja si se requiere → no requiere apertura
- [PASS] 4. F3-NAV: Navegar a POS/mesas → navegado
- [PASS] 5. F4-VENTA: Tomar una mesa/producto → producto clickeado
- [PASS] 6. F5-COMANDA: Enviar/comandar → comandar intentado
- [PASS] 7. F6-COBRO: Cobrar venta → sin botón cobrar
- [PASS] 8. F7-FACTURACION: Intentar facturación (cliente + factura + UBL/CUFE) → UBL 3900 bytes, CUFE 0A20191260210BEC6B60
- [PASS] 9. F8-IMPRESION: Intentar imprimir comanda/cuenta → impresión intentada (ver consola/red para errores)
- [PASS] 10. F9-CIERRE: Buscar cierre de caja → cierre intentado

## Evidencia
Screenshots/trace en: C:\proyectos\sistema pos\docs\reports\agent-runs\real-2026-11-13T19-21-53-434Z
