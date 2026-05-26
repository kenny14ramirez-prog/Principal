# Frontend (fuente canónica)

Edite aquí el POS. Tras cambios:

```bat
npm run sync
```

Si modificó módulos que van en bundles (`modules/` reservorio, compras, costos):

```bat
npm run consolidate
npm run sync
```

## Estructura (2026 consolidada)

Ver **`ARCHITECTURE.md`** para el mapa completo.

| Entrada | Descripción |
|---------|-------------|
| `Crozzo_POS_Completo.html` | Shell (~850 líneas) — DOM + enlaces |
| `Crozzo_POS_Completo.monolith.html` | Monolito (edición masiva / backup) |
| `core/CrozzoPosMain.js` | Lógica POS principal |
| `core/CrozzoManifest.js` | Mapa de carga diferida por pantalla |
| `bundles/*.js` | Generados — no editar |

**Regenerar desde monolito:** `node scripts/split-pos-html.mjs` → `npm run consolidate` → `npm run sync`

**Rendimiento:** Tauri o PCs ≤4 núcleos activan `crozzo-perf-lite`. `localStorage.crozzo_perf_lite = '1'` o `'0'`.
