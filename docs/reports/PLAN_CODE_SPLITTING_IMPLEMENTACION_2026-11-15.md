# Plan de implementación de Code-Splitting — 2026-11-15

## Objetivo
Reducir el tiempo de carga inicial de ~800ms a <200ms mediante code-splitting de CrozzoPosMain.js (~2MB, 1,678 funciones).

## Estrategia: Lazy Loading por página

En lugar de dividir el monolito en archivos separados (riesgo alto), se implementa **lazy loading por página** usando el sistema existente de CrozzoLazyModules.js.

### Fase 1: Análisis de dependencias (COMPLETADO)
- 1,678 funciones identificadas
- 1,268 con prefijo `crozzo` + 410 otras
- Categorizadas por funcionalidad

### Fase 2: Implementación de lazy loading granular (EN PROGRESO)

#### Cambio 1: Defer de funciones no críticas
- Funciones de reportes, analytics, y diagnóstico se cargan bajo demanda
- Funciones de configuración se cargan solo al entrar a config-*
- Funciones de compras se cargan solo al entrar a compras-*

#### Cambio 2: Lazy loading de módulos pesados
- `CrozzoReportesDashboard.js` (ya defer)
- `CrozzoComprasDashboard.js` (ya defer)
- `CrozzoInventarioContinuo.js` (ya defer)
- `CrozzoOficinaHub.js` (ya defer)

#### Cambio 3: Preload de chunks críticos
- `<link rel="preload">` para CrozzoPosCore.js (primer render)
- `<link rel="prefetch">` para chunks que se cargarán pronto

### Fase 3: Optimización de parseo (PENDIENTE)
- Usar `requestIdleCallback` para carga diferida
- Implementar `IntersectionObserver` para carga on-demand

### Fase 4: Testing (PENDIENTE)
- Smoke test de todas las páginas
- Lighthouse audit
- Performance trace

## Implementación inmediata

La implementación más práctica y de menor riesgo es:
1. Añadir `defer` a más scripts no críticos
2. Usar `requestIdleCallback` para carga diferida de módulos
3. Implementar preload de chunks críticos

Esto no requiere dividir el monolito, solo optimizar la carga existente.

---

*Generado: 2026-11-15*
*Autor: Análisis automatizado*
