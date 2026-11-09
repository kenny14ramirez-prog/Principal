# Reporte Agente Profundo

**Run:** smoke-2026-11-08T17-59-17-386Z
**Preset:** smoke
**URL:** http://localhost:1420
**Inicio:** 2026-11-08T17:59:17.387Z
**Fin:** 2026-11-08T18:02:21.468Z

## Resumen
- Pasos: 10
- Hallazgos: 0
- Errores consola: 92
- Fallos red: 90

## Hallazgos
✅ Sin hallazgos.


## Pasos
- [WARN] 1. F0-PREVUELO: Cargar aplicación → title="BONA origen · Sistema POS"
- [WARN] 2. F1-LOGIN: Detectar y usar login → login intentado
- [PASS] 3. F2-APERTURA: Abrir caja si se requiere → no requiere apertura
- [WARN] 4. F3-NAV: Navegar a POS/mesas → navegado
- [WARN] 5. F4-VENTA: Tomar una mesa/producto → producto clickeado
- [WARN] 6. F5-COMANDA: Enviar/comandar → comandar intentado
- [PASS] 7. F6-COBRO: Cobrar venta → sin botón cobrar
- [WARN] 8. F7-FACTURACION: Intentar facturación (cliente + factura + UBL/CUFE) → UBL 3900 bytes, CUFE 677B7F71B42BA1323D56
- [WARN] 9. F8-IMPRESION: Intentar imprimir comanda/cuenta → impresión intentada (ver consola/red para errores)
- [WARN] 10. F9-CIERRE: Buscar cierre de caja → cierre intentado

## Evidencia
Screenshots/trace en: C:\proyectos\sistema pos\docs\reports\agent-runs\smoke-2026-11-08T17-59-17-386Z
