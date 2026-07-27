# Reporte IA (admin macro)

## Rol

- **POS:** métricas verdaderas (cierres / ventas agregadas).
- **Modelo (NVIDIA NIM vía Edge Function):** narrativo — picos, valles, vs periodo anterior, 3 acciones.
- **Solo admin** (página Reportes). Flag por establecimiento desde Super Admin → Nube.

## Dónde está en la UI

1. Login **KENNY** → menú **Nube global**
2. Justo debajo del panel **Estado de la nube** aparece el card dorado **Inteligencia — Reporte IA (NVIDIA)**
3. Botón rápido en Identidad: **Configurar Reporte IA / key NVIDIA**
4. Consola: `crozzoOpenAiInsightsConfig()`

Pegue `nvapi-…` → **1. Guardar key NVIDIA** (persiste al instante en `localStorage` `crozzo_ai_nvidia_key_local_v1`) → **3. Probar conexión** (Tauri/Rust, sin Edge) → toggle → **2. Guardar habilitación**.

**Reglas anti-wipe:** el card no se remonta si ya está vivo o hay draft/probe en curso. `crozzoOpenAiInsightsConfig()` en la misma página solo hace scroll (no `navigateTo` de nuevo). Guardar no espera Edge (background ≤3 s). Probe guarda estado en memoria (`__crozzoAiInsightsLock`) y lo reaplica si Nube remonta; Rust timeout NVIDIA = **120 s** (reinicio Tauri obligatorio tras cambio Rust).

Si la Edge Function aún no está desplegada, la key queda en este PC Super Admin (local) y igual puede probar/generar desde aquí.

**HTML canónico Tauri:** el sync copia `app/Crozzo_POS_Completo.html` → `src/index.html` (no basta editar solo `app/index.html`). El script `modules/CrozzoAiInsights.js` debe estar en Completo.

## Edge Function y CORS

Si F12 muestra CORS a `/functions/v1/ai-insights`, la función **no está desplegada** (o JWT del gateway tumba el OPTIONS).

Modo actual del POS: **local-first** — guarda `nvapi` en el PC Super Admin y llama a NVIDIA directo. No spamea la Edge caída (cooldown 15 min).

Para nube multi-sede:

```bash
supabase functions deploy ai-insights --no-verify-jwt
# o con supabase/config.toml [functions.ai-insights] verify_jwt = false
```

Luego vuelva a **Guardar key** para subirla a `crozzo_ai_secrets`.

| Dato | Dónde |
|------|--------|
| `aiReportes.enabled` / `cadence` | `pos_dian_config` + `company_config.tenant_snapshot` (sin key) |
| API key `nvapi-…` | Tabla `crozzo_ai_secrets` (solo service_role) o secret `NVIDIA_API_KEY` |
| Tablets / QR pairing | **Nunca** reciben la key |

## Flujo

1. Super Admin habilita flag → push tenant snapshot.
2. Reportes muestra tab **Reporte IA** activo; si flag off → “Próxima versión”.
3. Admin genera lectura 8d / mes → `POST /functions/v1/ai-insights` `{ action: 'generate', pack }`.
4. Edge llama `integrate.api.nvidia.com` y devuelve texto; se guarda en `crozzo_ai_insight_v1` (local) y opcionalmente `crozzo_ai_insights`.

## Deploy

```bash
# SQL (Super Admin → Nube → script 19, o docs/SUPABASE-SQL-ai-insights.sql)
supabase functions deploy ai-insights
# Opcional fallback plataforma:
supabase secrets set NVIDIA_API_KEY=nvapi-...
```

Guardar key por sede: Super Admin → card Inteligencia → “Guardar key en nube” (`action: save_key`).

## Archivos

- `app/modules/CrozzoAiInsights.js`
- `app/modules/CrozzoSuperAdminNube.js` (card)
- `app/modules/CrozzoReportesDashboard.js` + PosMain paneles
- `supabase/functions/ai-insights/index.ts`
- `docs/SUPABASE-SQL-ai-insights.sql`

## Pack (v1)

Agregados: `totalSales`, `totalCount`, `ticketAvg`, `peakHour`, `valleyHour`, `byHour`, `daySales`, bloque `previous`. Sin NIT, CUFE ni líneas de factura.

## M1 — Auditar con IA (contraespionaje)

Auditoría on-demand de voids / efectivo / outliers. **Admin** ve el card; NVIDIA requiere flag `aiReportes` + key.

| Superficie | Dónde |
|------------|--------|
| Cierre de turnos | Card «Auditoría con IA» |
| Reportes → Reporte IA | Misma card bajo macros |

Flujo usable:
1. Presets Hoy / 8d / Mes / Personalizado
2. **Vista previa** (local, instantánea): métricas + banderas — funciona sin NVIDIA
3. **Auditar con IA**: narrativa NVIDIA (~1–2 min). Cuota **12/h** (solo éxitos; fallos/timeout no queman). Key `crozzo_ai_behavior_rate_v2`. Reset consola: `crozzoAiClearBehaviorRate()`.

API: `buildBehaviorPack` → `requestBehaviorInsight` (peek + commit rate). Verdad fiscal (`getFacturasFiscal`). Voids desde `cajaVoidLog`. Flag `lab_mask_activa` si hay máscara Lab.

Si flag off: card gated con CTA a Super Admin → Nube.

**Datos de prueba:** Configuración → Empresa → **Cargar datos demo completo** siembra empresa + productos + empleados/cajeros + ventas/voids/cierres + sesiones + costeos (`crozzoSeedDemoOperativoData`, tag `DEMO-SEED` / ids 9001–9010). **Borrar todo y empezar de 0** (`crozzoWipeLocalDemoAndOpsData`) exige Super Admin + escribir `BORRAR`; vacía ventas/voids/cierres/catálogo/insights (opcional vaciar empresa). No borra la nube remota sola.

**No es M2 Lab:** no mejorar purge/máscara para ocultar caja.

## Tab Operativo (Reportes) — distinto de IA

En **Reportes → Operativo**: catálogo local por rango (ítems eliminados, mesas voids/ventas, meseros, pico/valle, platos, platos por pantalla). Motor: `CrozzoStaffOpsReport.buildOperativoReport`. **Sin NVIDIA.** No confundir con el tab Reporte IA.
