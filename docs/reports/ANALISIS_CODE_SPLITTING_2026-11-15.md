# Análisis de Code-Splitting para CrozzoPosMain.js — 2026-11-15

## Estado actual
- `CrozzoPosMain.js`: 53,797 líneas, ~2MB
- 1,678 funciones (1,268 con prefijo crozzo + 410 otras)
- Se carga completo en todas las páginas
- Lighthouse: 4 long tasks, 815ms de bloqueo

## Categorización de funciones por prefijo

| Categoría | Funciones | Tamaño est. | Páginas que lo usan |
|-----------|-----------|-------------|---------------------|
| crozzoRest* | ~60 | ~50 KB | cajero |
| crozzoFact* | ~44 | ~35 KB | facturas |
| crozzoCobr* | ~35 | ~25 KB | cajero |
| crozzoKios* | ~27 | ~20 KB | tablets, comandas |
| crozzoSlot* | ~22 | ~15 KB | cajero |
| crozzoCart* | ~17 | ~12 KB | cajero, venta-comercial |
| crozzoCaja* | ~17 | ~12 KB | cajero |
| crozzoStaff* | ~17 | ~12 KB | config-usuarios |
| crozzoIdent* | ~16 | ~12 KB | super-admin-identidad |
| crozzoApply* | ~16 | ~12 KB | config-* |
| crozzoReso* | ~16 | ~12 KB | reportes |
| crozzoRetail* | ~15 | ~10 KB | venta-comercial |
| crozzoTerm* | ~14 | ~10 KB | config-facturas-admin |
| crozzoRep* | ~13 | ~10 KB | reportes |
| crozzoInit* | ~13 | ~10 KB | boot |
| crozzoInic* | ~13 | ~10 KB | boot |
| crozzoBind* | ~13 | ~10 KB | boot |
| crozzoHp* | ~50 | ~40 KB | honeypot (solo decoys) |
| crozzoComa* | ~53 | ~40 KB | comandas |
| other | ~410 | ~300 KB | varias |

## Chunks propuestos

| Chunk | Contenido | Tamaño est. | Carga |
|-------|-----------|-------------|-------|
| CrozzoPosCore.js | Boot, login, navegación, sesión, permisos | ~300 KB | Siempre (inicial) |
| CrozzoPosCajero.js | POS, carrito, cobro, comandas, mesas | ~400 KB | Lazy (al entrar a cajero) |
| CrozzoPosConfig.js | Configuración, usuarios, permisos | ~200 KB | Lazy (al entrar a config-*) |
| CrozzoPosReportes.js | Reportes, dashboard, analytics | ~150 KB | Lazy (al entrar a reportes) |
| CrozzoPosCompras.js | Compras, recepción, proveedores | ~300 KB | Lazy (al entrar a compras-*) |
| CrozzoPosAdmin.js | Super admin, nube, sync | ~150 KB | Lazy (al entrar a super-admin-*) |

## Implementación por fases

### Fase 1: Análisis (COMPLETADO)
- Mapeado el grafo de dependencias
- Identificado 1,678 funciones en 1268 con prefijo crozzo
- Categorizado por funcionalidad

### Fase 2: Separación (PENDIENTE)
- Crear archivos de chunks
- Mover funciones a sus chunks
- Mantener funciones globales para compatibilidad

### Fase 3: Dynamic imports (PENDIENTE)
- Implementar carga lazy de chunks
- Añadir preload/prefetch
- Verificar race conditions

### Fase 4: Testing (PENDIENTE)
- Smoke test de todas las páginas
- Lighthouse audit
- Performance trace

## Riesgos

1. **Alto:** Muchas funciones son globales y se llaman entre sí. Separarlas puede romper dependencias.
2. **Alto:** El sistema de bundles (consolidate-crozzo-bundles.mjs) es complejo.
3. **Medio:** Dynamic imports pueden causar race conditions.
4. **Bajo:** Lighthouse puede no reflejar mejoras reales en producción (Tauri).

## Estimación

- Fase 2: 3-5 días
- Fase 3: 2-3 días
- Fase 4: 2-3 días
- **Total: 7-11 días**

## Nota importante

Este refactor es **opcional** — el sistema funciona correctamente sin él. Es una optimización de rendimiento que mejora la experiencia de usuario pero no es crítica para la funcionalidad.

La implementación completa requiere modificar ~50,000 líneas de código y tiene alto riesgo de romper dependencias. Se recomienda hacerlo en un branch separado con testing exhaustivo.

---

*Generado: 2026-11-15*
*Autor: Análisis automatizado*
