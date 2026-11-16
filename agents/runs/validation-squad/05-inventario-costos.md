# Validación — Inventario / Costos / Rentabilidad

Directorio: `C:\proyectos\sistema pos`  
Ejecución: secuencial, sin detener por fallos. No se modificó código fuente.

## Resumen

| # | Check | Comando | Exit code | Resultado |
|---|-------|---------|-----------|-----------|
| 1 | reversion-inventario | `npm run test:reversion-inventario` | 0 | PASS |
| 2 | cmv-rentabilidad | `npm run test:cmv-rentabilidad` | 0 | PASS |
| 3 | semaforo-margen | `npm run test:semaforo-margen` | 0 | PASS |
| 4 | rentabilidad-page | `npm run test:rentabilidad-page` | 0 | PASS |
| 5 | plan-producto | `npm run test:plan-producto` | 0 | PASS |
| 6 | costos-ui | `node scripts/_costos-ui-check.mjs` | 0 | Ejecutado (sin asserts; UI no renderizó) |
| 7 | costos-matriz-load | `node scripts/_costos-matriz-load-check.mjs` | 0 | Ejecutado (panel no apareció) |
| 8 | compras-sync-mode | `node scripts/_compras-sync-mode-check.mjs` | 0 | PASS |
| 9 | acogida | `node scripts/_acogida-check.mjs` | 1 | FAIL |

## Detalle por check

### 1. reversion-inventario — exit 0
Últimas 20 líneas:
```
  ✓ Factura: inventarioRevertido flag
  ✓ Idempotencia: no revierte dos veces
  ✓ Sin inventario aplicado: ok sin revertir
  ✓ Sin inventario: factura igual queda anulada
  ✓ Sin inventario: inventarioRevertido false
  ✓ Movimiento: productId + cantidad
  ✓ Movimiento: facturaId
  ✓ Movimiento: motivo registrado
  ✓ Movimiento: timestamp + por (auditoría)
  ✓ Movimiento: stock antes/después (trazabilidad)
  ✓ anularFactura(config): ok
  ✓ anularFactura(config): estado anulada
  ✓ anularFactura(config): stock +1
  ✓ anularFactura(config): llama config.save

✅ REVERSIÓN INVENTARIO: PASS — anular restaura stock + deja auditoría.
```

### 2. cmv-rentabilidad — exit 0
Últimas 20 líneas:
```
  ✓ Rentabilidad rango: 2 facturas activas (no anulada) — $2
  ✓ Rentabilidad rango: 1 anulada excluida
  ✓ Ingresos: 32500 + 18000 = 50500 — $50500
  ✓ CMV: 11300 + 9500 = 20800 — $20800
  ✓ Utilidad: 21200 + 8500 = 29700 — $29700
  ✓ Por categoría: al menos 2 categorías
  ✓ Categoría bebidas: ingresos 4500
  ✓ Categoría platos-fuertes: 2 unidades vendidas
  ✓ Top platos: al menos 1
  ✓ Bottom platos: al menos 1
  ✓ Top: Bandeja entre los mejores
  ✓ KPI diario: fecha correcta
  ✓ KPI diario: 2 facturas
  ✓ KPI diario: mejor plato identificado

✅ CMV + RENTABILIDAD: PASS — círculo del costeo cerrado. El dueño ve cuánto ganó.
```

### 3. semaforo-margen — exit 0
Últimas 20 líneas:
```
  ✓ Plato alto → verde
  ✓ Plato bajo → rojo
  ✓ Plato bajo emoji 🔴
  ✓ semaforoDesdeRentabilidad devuelve nivel
  ✓ KPI día margen alto típico — 59.3%
  ✓ Día consolidado no vacío — 🟡 59.3%
  ✓ Día: 2 facturas
  ✓ platosRojos es array
  ✓ Plato rojo detectado en peores
  ✓ Sugerencia sube precio para 🟢 — $17143
  ✓ Delta positivo — $7143
  ✓ Mensaje contiene 🔴
  ✓ Mensaje nombra el plato
  ✓ Mensaje sugiere subir
  ✓ Sin ventas: semáforo seguro — rojo

✅ SEMÁFORO MARGEN: PASS — dueño ve 🟢🟡🔴 sin ser contador.
```

### 4. rentabilidad-page — exit 0
Últimas 20 líneas:
```
  ✓ Módulo CrozzoRentabilidadPage cargado
  ✓ Admin: puedeVer true
  ✓ Caja: puedeVer false
  ✓ HTML: root crozzo-rent-page
  ✓ HTML: título
  ✓ HTML: toggle Hoy/7d
  ✓ HTML: KPI Ingresos
  ✓ HTML: top platos
  ✓ Modelo: 2 facturas hoy — 2
  ✓ Modelo: semáforo presente — 🟡
  ✓ Modelo: top platos
  ✓ Modelo 7d: mismas ventas recientes
  ✓ index.html: script página
  ✓ index.html: nav item
  ✓ PosMain: case rentabilidad
  ✓ PosMain: PAGE_MENU_MAP

✅ PÁGINA RENTABILIDAD: PASS
```

### 5. plan-producto — exit 0
Últimas 20 líneas:
```
  ✓ Grande: auditoria OK
  ✓ Grande: conexiones OK
  ✓ setPlanProducto medio
  ✓ Tras set medio: conexiones usan getPlan
  ✓ normalizePlan inválido → basico
  ✓ index.html: script PlanProducto
  ✓ ConfigManager: default planProducto
  ✓ ConfigManager: getters/setters
  ✓ PosMain: gate planProducto
  ✓ PosMain: crozzoIsBasicoEmpresaPerfil existe
  ✓ PosMain: isBasico NO mutado por planProducto (ortogonal)
  ✓ Onboarding: panel muestra plan

Total: 32 asserts · fallos: 0
✅ PLAN PRODUCTO: PASS
```

### 6. costos-ui — exit 0
Observación: el script no define asserts ni PASS/FAIL; solo dump JSON. Tras `navigateTo('costos-matriz')`, la UI no renderizó: `mainLen: 186`, `mainText: ""`, `currentPage: ""`, y todos los selectores clave en `false` (`goCatalogoMp`, `newPlatoBtn`, `newMpBtn`, `demoGoCatalogo`, `menuProductos`, `menuCatalogoMp`, `hasMatrizHero`, `hasLoading`). `hasRenderSistemaCostos: true`, `hasCrozzoSistemaCostos: true`. `errors: []`. Todos los scripts cargaron con status 200.
Últimas 20 líneas:
```
    },
    {
      "url": "CrozzoCostosBulkImport.js",
      "status": 200
    },
    {
      "url": "CrozzoSistemaCostos.js",
      "status": 200
    },
    {
      "url": "CrozzoFlujosMapaPdf.js",
      "status": 200
    },
    {
      "url": "CrozzoCostosReportesPdf.js",
      "status": 200
    }
  ],
  "errors": []
}
```

### 7. costos-matriz-load — exit 0
Observación: tras `navigateTo('costos-matriz')`, durante 20s `loading: false`, `hasPanel: false`, `hasTabs: false`; `innerLen: 186`, `txtHead: ""`. Errores de consola: dos `Failed to load resource: the server responded with a status of 403 ()`. El script sale 0 porque no está en estado "loading"; pero el panel de matriz no apareció.
Últimas 20 líneas:
```
t+1s {"loading":false,"hasPanel":false,"hasTabs":false}
t+2s {"loading":false,"hasPanel":false,"hasTabs":false}
t+3s {"loading":false,"hasPanel":false,"hasTabs":false}
t+4s {"loading":false,"hasPanel":false,"hasTabs":false}
t+5s {"loading":false,"hasPanel":false,"hasTabs":false}
t+6s {"loading":false,"hasPanel":false,"hasTabs":false}
t+7s {"loading":false,"hasPanel":false,"hasTabs":false}
t+8s {"loading":false,"hasPanel":false,"hasTabs":false}
t+9s {"loading":false,"hasPanel":false,"hasTabs":false}
t+10s {"loading":false,"hasPanel":false,"hasTabs":false}
t+11s {"loading":false,"hasPanel":false,"hasTabs":false}
t+12s {"loading":false,"hasPanel":false,"hasTabs":false}
t+13s {"loading":false,"hasPanel":false,"hasTabs":false}
t+14s {"loading":false,"hasPanel":false,"hasTabs":false}
t+15s {"loading":false,"hasPanel":false,"hasTabs":false}
t+16s {"loading":false,"hasPanel":false,"hasTabs":false}
t+17s {"loading":false,"hasPanel":false,"hasTabs":false}
t+18s {"loading":false,"hasPanel":false,"hasTabs":false}
t+19s {"loading":false,"hasPanel":false,"hasTabs":false}
t+20s {"loading":false,"hasPanel":false,"hasTabs":false}
```

### 8. compras-sync-mode — exit 0
Últimas 20 líneas:
```
[
  {
    "mode": "online",
    "saved": "online",
    "ok": true,
    "errors": []
  },
  {
    "mode": "hybrid",
    "saved": "hybrid",
    "ok": true,
    "errors": []
  },
  {
    "mode": "offline",
    "saved": "offline",
    "ok": true,
    "errors": []
  }
]
```

### 9. acogida — exit 1 (FAIL)
Últimas 20 líneas:
```
{
  "ok": false,
  "steps": [
    {
      "id": "welcome-strip",
      "ok": false,
      "extra": {
        "hasStrip": false
      }
    },
    {
      "id": "warm-phrase",
      "ok": false,
      "extra": {
        "warmText": ""
      }
    },
    {
      "id": "animations",
      "ok": false,
      "extra": {
        "markAnim": "",
        "sheenAnim": ""
      }
    },
    {
      "id": "no-page-errors",
      "ok": true,
      "extra": {
        "errors": []
      }
    }
  ],
  "errors": []
}
```

## Conclusiones

- 5/9 checks de lógica (reversión, CMV, semáforo, página rentabilidad, plan producto) pasan.
- compras-sync-mode pasa.
- costos-ui y costos-matriz-load ejecutan sin crash pero la página de costos no se renderiza en el navegador de prueba (panel ausente); hay recursos 403. Posible problema de carga/gating que merece revisión.
- acogida falla: no se muestra el strip de bienvenida ni la frase cálida ni las animaciones.

REPORTE ESCRITO