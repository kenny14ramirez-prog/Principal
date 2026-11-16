# Hora Maestra (CI) — Validación

- Comando: `npm run test:hora-maestra:ci`
- Directorio: `C:\proyectos\sistema pos`
- Exit code: `0`
- Duración aproximada: 38s (según reporte maestro)
- Resultado: ✅ APROBADA — `OK=17 WARN=3 FAIL=0`

## Detalle (últimas 50 líneas del log)

```
    ✓ Cajero · primer turno
    ✓ Mesero · aprendiz
    ✓ Cocina / producción
    ✓ Encargado de turno

▶ Fase 3 · Escenario oro (1 venta(s))

    ✓ Encargado abre turno operativo
    ✓ Venta mesa M1 (ciclo 1)

▶ Fase 4 · Cadenas de acción (rama → rama)

    ✓ Mesa · pendiente → morado → rojo → verde
    ✓ Comanda · carrito + área + historial
    ✓ Cobro · factura + slot pagado + carrito vacío
    ✓ Venta · meta inventario / reservatorio
    ✓ 2 meseros · misma mesa · anti-pisoteo

▶ Cadenas de acción · resumen
    ✓ Mesa · pendiente → morado → rojo → verde
    ✓ Comanda · carrito + área + historial
    ✓ Cobro · factura + slot pagado + carrito vacío
    ✓ Venta · meta inventario / reservorio
    ✓ 2 meseros · misma mesa · anti-pisoteo
    Total: 5/5 OK

▶ Fase 5 · Adversarial / humano orgánico

    ✓ Paquete adversarial
    ✓ Mesero intenta quitar plato ya en cocina
    ✓ Doble cobro simultáneo
    ✓ Navegación errática entre pantallas
    ✓ Arqueo con conteo incorrecto
    ✓ Comandar carrito vacío

▶ Fase 6 · Cierre de turno

    ✓ Arqueo mañana coherente con ventas

▶ Fase 7 · Diario operativo

    ~ Journal local accesible

╔══════════════════════════════════════════════════════════════╗
║  ✅ HORA MAESTRA — APROBADA                                  ║
╚══════════════════════════════════════════════════════════════╝

Reporte maestro: C:\proyectos\sistema pos\scripts\_qa-out\hora-maestra-oro-latest.json
Resumen: OK=17 WARN=3 FAIL=0 · 38s
```

## Advertencias (WARN=3)
Las 3 advertencias aparecen en el reporte maestro JSON; no se listan en el tail capturado. Revisar `scripts/_qa-out/hora-maestra-oro-latest.json` para detalle.

## Notas
- El pipeline incluyó sync + playwright install chromium + operativo-oro raw.
- Sin fallos (FAIL=0).
- No se modificó código fuente.
path: "C:\proyectos\sistema pos\agents\runs\validation-squad\15-hora-maestra-ci.md"