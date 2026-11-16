# Validación Operativo Oro & Fleet Escala Intensiva

Directorio de trabajo: `C:\proyectos\sistema pos`  
No se modificó código fuente.

## 1. operativo-oro — `npm run test:operativo-oro`

- **Exit code:** 0 (aprobado)
- **Resultado:** HORA MAESTRA — APROBADA. OK=17 WARN=3 FAIL=0 · 38s
- **Reporte:** `scripts/_qa-out/hora-maestra-oro-latest.json`

### Últimas 40 líneas (resumen)

```
▶ Fase 7 · Diario operativo

    ~ Journal local accesible

╔══════════════════════════════════════════════════════════════╗
║  ✅ HORA MAESTRA — APROBADA                                  ║
╚══════════════════════════════════════════════════════════════╝

Reporte maestro: C:\proyectos\sistema pos\scripts\_qa-out\hora-maestra-oro-latest.json
Resumen: OK=17 WARN=3 FAIL=0 · 38s
```

## 2. fleet-escala-intensiva — `npm run test:fleet-escala:intensiva`

- **Exit code:** 1 (REVISAR)
- **Resultado:** OK=15 FAIL=2
- **Reporte:** `scripts/_qa-out/fleet-escala-latest.json`

### Fallos detectados

1. `browser-tablets-*` (4, 9 tablets y 10 tablets en salón realista): `okCount=0/total`, sin `pageErrors`. Causa raíz observada en debug: `crozzoHasCajaPermiso('comandar')` y `('abrir_orden')` devuelven `false` porque no hay usuario logueado en el flujo de tablets del test (permiso requiere sesión activa); `comandarDesdeCaja()` retorna `false` y no se crea comanda.
2. `salonRealista.pcs` (`pc-pull-5`): `comandasEnCentral=0` porque las tablets anteriores no publicaron comandas; los 5 PCs reportan `count=0` (aunque `ok=true` por pull).

### Últimas 40 líneas (resumen)

```
▶ Salón realista · 5 PCs + 10 tablets

  ✗ 0/10 tablets · 5 PCs leyeron central

▶ Adversarial · abuso / duplicados

  ✓ Reintento malicioso · mismo action_id

Reporte flota: C:\proyectos\sistema pos\scripts\_qa-out\fleet-escala-latest.json
Resumen flota: OK=15 FAIL=2 · REVISAR
```

## Conclusión

- `operativo-oro`: **APROBADO**.
- `fleet-escala:intensiva`: **FALLA** (2 fallos) — bloqueado por permisos de sesión en el escenario browser de tablets; no es un fallo de carga HTTP (storms 2→100 dispositivos OK).