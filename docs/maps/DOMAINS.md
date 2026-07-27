# Mapa de dominios → archivos

| Dominio | Archivos principales | Mapa detalle |
|---------|---------------------|--------------|
| **Sync runtime Z0** | PosMain, PosRuntimeCloud, OpFanout, LanOps | [CONNECTIONS](CONNECTIONS.md), [SEQUENCES S1-S2](SEQUENCES.md) |
| **Comandas / cocina** | ComandasCloudSync, PosMain `comandas[]` | SEQUENCES S3 |
| **Conectividad** | Orchestrator, CloudThrottle, ReconnectSync, PageCloudWatch | AGENT-SYSTEM-MAP §5.4 |
| **Permisos mesero/caja** | PosMain `crozzoHasCajaPermiso` ~14245 | POSMAIN-SECTIONS (auth/cajero) |
| **Auth / login** | CrozzoAuthSecurity, LoginBoot, PosMain ~997+ | POSMAIN-SECTIONS |
| **Impresión** | PrintService, PrintPresets, Rust print | FILES-INDEX |
| **LAN / Rust** | LanOpsSync, crozzo_lan_sync_server.rs | CONNECTIONS |
| **OTA / versión** | TauriUpdater, releases/latest.json | META.json |
| **Compras / costos** | bundles Reservorio/Compras/Costos | CrozzoManifest PAGE_SCRIPTS |
| **CSS APK/tablet** | CrozzoPosStyles.css, CrozzoPantallasShell.css | regla crozzo-css-apk |
| **UX operativa / rol** | CrozzoOperativeCompanion, CrozzoPerfilesLogica, CrozzoOperativePsyche | CONNECTIONS § UX |
| **QA escenario oro** | `scripts/test-operativo-oro.mjs`, `npm run test:operativo-oro` | docs/QA-OPERATIVO-ORO.md |
| **Supabase SQL** | docs/SUPABASE-SQL-*.sql, SupabaseSqlBundles | — |

## PosMain — atajo por sección

Ver rangos exactos: [POSMAIN-SECTIONS.md](POSMAIN-SECTIONS.md) (auto).

| Buscar | Sección típica (línea approx) |
|--------|-------------------------------|
| Carrito / merge remoto | Global State → antes UI Rendering; símbolos ~8143+ |
| UI cajero/tablet | CAJERO PAGE ~21856, ROL B TABLET ~40106 |
| Comandas corcho | UI + comandas arrays (grep `comandas`) |
| Cobro / facturar | CAJERO PAGE, funciones `facturar` |

## Comandos por dominio

```bash
# Sync Z0
npm run edit:scope -- app/core/CrozzoPosMain.js crozzoSyncPosRuntimeCritical
npm run test:sync-clinical

# Mapa
npm run map:refresh
```
