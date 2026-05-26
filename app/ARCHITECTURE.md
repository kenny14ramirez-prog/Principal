# Arquitectura frontend Crozzo POS

Objetivo: **pocas piezas en arranque**, módulos de negocio **bajo demanda**, carpetas claras para humanos y herramientas.

## Carpetas (`app/`)

| Carpeta | Contenido | Cuándo editar |
|---------|-----------|----------------|
| `css/` | Estilos globales | Temas, layout, componentes |
| `core/` | POS principal, auth, boot, manifest, lazy loader | Lógica caja, navegación, sync |
| `vendor/` | QR, Supabase UMD | Casi nunca (librerías) |
| `ui/` | Sidebar, accesibilidad | Chrome de la app |
| `infra/` | Tauri updater, OTA | Actualizaciones |
| `modules/` | **Fuentes** de dominio (compras, costos, reservorio, planilla…) | Feature por módulo |
| `bundles/` | **Generado** (`npm run consolidate`) | No editar a mano |
| `data/`, `assets/` | JSON seed, xlsx, logos | Datos estáticos |

Raíz: solo HTML de entrada (`Crozzo_POS_Completo.html`), QyC embebido, diseñador ticket.

## Arranque (orden crítico)

1. `CrozzoStorageHygiene.js` — migraciones LS (colas, runtime)
2. Auth + viewport (síncronos)
3. Manifest → Cloud → Main → Extensions → Boot → LazyModules (defer)
4. **LazyModules** envuelve navegación, dispara `initPOS`, señal `crozzo-lazy-ready`
5. **Main** espera `crozzo-lazy-ready` antes de `init()` y primera `navigateTo`

**No** se cargan al inicio: bundles de reservorio/compras/costos/planilla (bajo demanda + preload idle del reservorio).

## Almacenamiento (capas)

| Capa | Uso |
|------|-----|
| `pos_dian_config` | Config maestra, catálogo, usuarios |
| `crozzo_pos_runtime_v1` | Estado caja/comandas (historial cap 120) |
| `crozzo_reservorio_v1` | Compras + costos + feed planilla unificado |
| `crozzo_sync_queue` | Cola offline Supabase (legacy `sync_queue_temp` migrada al arranque) |
| IndexedDB `CrozzoLocalData` | Espejo entidades offline-first |

Higiene automática: `core/CrozzoStorageHygiene.js` al cargar.


`core/CrozzoManifest.js` define qué pantalla pide qué script/bundle.  
`core/CrozzoLazyModules.js` intercepta `navigateTo` / `renderPage` y carga antes de pintar.

Bundles:

- `bundles/CrozzoBundleReservorio.js` ← sql + reservorio + offline
- `bundles/CrozzoBundleCompras.js` ← compras local + centro + bona + procesos
- `bundles/CrozzoBundleCostos.js` ← motor + sistema costos

Tras cambiar archivos en `modules/` que entran en un bundle:

```bat
npm run consolidate
npm run sync
```

## Monolito (edición masiva)

`Crozzo_POS_Completo.monolith.html` — backup / edición única. Regenerar trozos:

```bat
node scripts/split-pos-html.mjs
npm run consolidate
npm run sync
```

## Flujo habitual

1. Cambio pequeño → editar un archivo en `modules/` o `core/`
2. Si toca bundle → `npm run consolidate`
3. `npm run sync` (o Herramientas Crozzo POS → sync)
