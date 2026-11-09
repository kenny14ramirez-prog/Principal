# Telemetría de adopción de actualizaciones + Staged Rollout (Canary)

> Aplicable a **Bona Origen** (Crozzo POS): apps distribuidas por **GitHub Releases** + **registry.json** en rama `main`, con backend **Supabase**.
>
> Complementa `docs/TAURI_UPDATER.md` y `docs/PLAN-VERIFICACION-ACTUALIZACIONES.md`. No reemplaza el canal OTA/Tauri; agrega **medición** y **liberación por porcentaje**.

---

## 0. Objetivo

1. Saber **cuántos clientes** (instalaciones) están en cada versión y **qué plan** usaron para actualizar.
2. Liberar una versión nueva a un **porcentaje controlado** (canary) antes de GA, sin tocar código cliente.
3. **Abortar automáticamente** si la nueva versión degrada métricas (errores de instalación, crashes, fallos de arranque).
4. Mantener privacidad: **nunca enviar PII**; identificar instalación por hash irreversible.

---

## 1. Identificador de cliente (rollout key)

Fuente estable por instalación (ya existe en el cliente):

- `business_id` = `localStorage.getItem('crozzo_business_id')` (o `'default'`).
- `device_id` = `localStorage.getItem('crozzo_device_id')` (UUID local, generado si no existe).
- `app_type` = `'desktop' | 'web' | 'android'`.
- `platform` = `'windows' | 'macos' | 'linux' | 'android' | 'web'`.

**Rollout key** (string estable):

```
rolloutKey = `${business_id}|${device_id}|${app_type}`
```

**Hash de bucket** (determinista, sin PII):

```js
// FNV-1a 32-bit sobre `${salt}|${rolloutKey}` -> bucket 0..9999
function rolloutBucket(salt, rolloutKey) {
  let h = 0x811c9dc5;
  const s = salt + '|' + rolloutKey;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 10000;
}
function inRollout(entry, rolloutKey) {
  if (!entry.rollout || !entry.rollout.enabled) return true; // GA = 100%
  const b = rolloutBucket(entry.rollout.salt, rolloutKey);
  return b < (entry.rollout.percentage * 100); // percentage 0..100 -> 0..10000
}
```

- Cambiar `salt` redistribuye clientes (útil para reintentar un canary fallido).
- `percentage: 100` = GA. `percentage: 0` = bloqueado (solo admin).
- El cálculo ocurre **en el cliente**; el servidor solo define `percentage`/`salt` en `registry.json` y/o override en Supabase.

---

## 2. Campos nuevos en `registry.json`

### 2.1 Nivel raíz

```json
{
  "updatedAt": "2026-11-09T00:00:00.000Z",
  "schemaVersion": 2,
  "telemetry": {
    "endpoint": "https://<project>.supabase.co/rest/v1/bona_update_telemetry",
    "anonKey": "<supabase anon key publica>",
    "batchSize": 20,
    "flushIntervalMs": 30000
  },
  "rolloutDefaults": {
    "salt": "bona-2026q4",
    "percentage": 100
  },
  "killSwitch": {
    "disabledEntryIds": [],
    "globalDisable": false,
    "reason": null
  },
  "entries": [ /* ... */ ]
}
```

### 2.2 Por entrada (nuevos campos)

```json
{
  "id": "1.0.261-critical",
  "version": "v1.0.261",
  "semver": "1.0.261",
  "type": "critical",
  "message": "Canary: nueva sincronización",
  "publishedAt": "2026-11-09T12:00:00.000Z",
  "installMode": "auto",
  "changelog": ["..."],
  "sha256": null,

  "rollout": {
    "enabled": true,
    "percentage": 5,
    "salt": "bona-2026q4-261",
    "startAt": "2026-11-09T12:00:00.000Z",
    "endAt": null,
    "minFromVersion": "1.0.240",
    "platforms": ["windows", "macos", "android", "web"],
    "appTypes": ["desktop", "web", "android"]
  },
  "telemetryTag": "canary-261",
  "abortPolicy": {
    "windowMinutes": 60,
    "minSamples": 30,
    "maxErrorRate": 0.05,
    "maxInstallFailureRate": 0.03,
    "maxBootCrashRate": 0.01
  }
}
```

### 2.3 Semántica

| Campo | Significado |
|-------|-------------|
| `rollout.enabled` | Si `false`, la entrada se trata como GA (100%) — útil para hotfix urgentes. |
| `rollout.percentage` | 0..100. Clientes con bucket < percentage*100 son elegibles. |
| `rollout.salt` | Semilla del hash. Cambiarla = nueva distribución. |
| `rollout.startAt/endAt` | Ventana temporal; fuera de ella no se ofrece (a menos que `endAt=null`). |
| `rollout.minFromVersion` | Solo clientes con versión instalada ≥ minFromVersion reciben (evita saltos grandes). |
| `rollout.platforms/appTypes` | Filtro por plataforma/tipo de app. |
| `killSwitch.globalDisable` | Si `true`, **ninguna** entrada se ofrece (parada total). |
| `killSwitch.disabledEntryIds` | Lista de entries desactivadas manualmente. |

**Regla de elegibilidad final** (`entryIsPending` extendido):

```
eligible = !killSwitch.globalDisable
        && !disabledEntryIds.includes(entry.id)
        && versionInstalled < entry.semver
        && now in [startAt, endAt]
        && platform in entry.rollout.platforms
        && appType in entry.rollout.appTypes
        && versionInstalled >= entry.rollout.minFromVersion
        && inRollout(entry, rolloutKey)
```

---

## 3. Reporte a backend (Supabase)

### 3.1 Tabla

```sql
-- Ejecutar en SQL Editor de Supabase (proyecto Bona Origen)
create table if not exists public.bona_update_telemetry (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null,
  business_id   text not null default 'default',
  device_hash   text not null,            -- sha256(device_id) truncado 16 hex (no reversible)
  rollout_key_hash text not null,        -- sha256(rolloutKey) truncado 16 hex
  app_type      text not null check (app_type in ('desktop','web','android')),
  platform      text not null,
  from_version  text,
  to_version    text,
  entry_id      text,
  telemetry_tag text,
  event_type    text not null check (event_type in (
    'detected','eligible','not_eligible','install_started','install_ok',
    'install_failed','applied','aborted_client','crash_boot','rollback'
  )),
  plan_used     text check (plan_used in ('A','C','B','web_reload','manual')),
  rollout_bucket int,
  rollout_percentage int,
  error_code    text,
  duration_ms   int,
  client_ts     timestamptz not null,
  received_at   timestamptz not null default now(),
  extra         jsonb default '{}'::jsonb
);

create index if not exists idx_bona_upd_tel_entry_ts
  on public.bona_update_telemetry (entry_id, client_ts desc);
create index if not exists idx_bona_upd_tel_event
  on public.bona_update_telemetry (event_type, client_ts desc);
create index if not exists idx_bona_upd_tel_business
  on public.bona_update_telemetry (business_id, client_ts desc);

-- RLS: inserción anónima permitida, lectura solo service_role/admin
alter table public.bona_update_telemetry enable row level security;

create policy "anon_insert_telemetry"
  on public.bona_update_telemetry
  for insert
  to anon, authenticated
  with check (true);

-- Sin policy de SELECT para anon -> solo service_role (bypass RLS) puede leer.
```

### 3.2 Override de rollout (kill switch rápido)

Tabla auxiliar para abortar sin tocar GitHub:

```sql
create table if not exists public.bona_rollout_overrides (
  entry_id       text primary key,
  disabled       boolean not null default false,
  percentage     int check (percentage between 0 and 100),
  reason         text,
  updated_at     timestamptz not null default now(),
  updated_by     text
);

alter table public.bona_rollout_overrides enable row level security;

create policy "anon_read_overrides"
  on public.bona_rollout_overrides
  for select
  to anon, authenticated
  using (true);
-- insert/update solo service_role (sin policy para anon).
```

**Merge en cliente:** `effectivePercentage = override.percentage ?? entry.rollout.percentage`; `disabled = override.disabled || killSwitch.disabledEntryIds.includes(id)`.

### 3.3 Cliente: envío

```js
// En CrozzoSystemUpdates.js (o módulo nuevo CrozzoUpdateTelemetry.js)
const TELEMETRY_QUEUE_KEY = 'crozzo_update_telemetry_queue';

function enqueueTelemetry(evt) {
  const q = JSON.parse(localStorage.getItem(TELEMETRY_QUEUE_KEY) || '[]');
  q.push(Object.assign({ event_id: crypto.randomUUID(), client_ts: new Date().toISOString() }, evt));
  // cap 500
  while (q.length > 500) q.shift();
  localStorage.setItem(TELEMETRY_QUEUE_KEY, JSON.stringify(q));
}

async function flushTelemetry() {
  const cfg = window.CROZZO_UPDATE_REGISTRY?.telemetry;
  if (!cfg || !navigator.onLine) return;
  const q = JSON.parse(localStorage.getItem(TELEMETRY_QUEUE_KEY) || '[]');
  if (!q.length) return;
  const batch = q.slice(0, cfg.batchSize || 20);
  try {
    const r = await fetch(cfg.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': cfg.anonKey,
        'Authorization': 'Bearer ' + cfg.anonKey,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(batch.map(toSupabaseRow))
    });
    if (r.ok) {
      const rest = q.slice(batch.length);
      localStorage.setItem(TELEMETRY_QUEUE_KEY, JSON.stringify(rest));
    }
  } catch (e) { /* reintentar luego */ }
}

function toSupabaseRow(e) {
  return {
    event_id: e.event_id,
    business_id: e.business_id || 'default',
    device_hash: sha256hex(e.device_id).slice(0, 16),
    rollout_key_hash: sha256hex(e.rolloutKey).slice(0, 16),
    app_type: e.app_type,
    platform: e.platform,
    from_version: e.from_version || null,
    to_version: e.to_version || null,
    entry_id: e.entry_id || null,
    telemetry_tag: e.telemetry_tag || null,
    event_type: e.event_type,
    plan_used: e.plan_used || null,
    rollout_bucket: e.rollout_bucket ?? null,
    rollout_percentage: e.rollout_percentage ?? null,
    error_code: e.error_code || null,
    duration_ms: e.duration_ms ?? null,
    client_ts: e.client_ts,
    extra: e.extra || {}
  };
}
```

- `flushTelemetry()` se llama en boot, tras cada evento, y cada `flushIntervalMs` (setInterval).
- Reintentos con backoff; si falla, queda en cola (localStorage) → no se pierde.

### 3.4 Eventos a emitir (puntos de enganche)

| Evento | Dónde | Campos clave |
|--------|-------|--------------|
| `detected` | `fetchRegistryData()` tras parsear | from_version, entry_id, rollout_bucket |
| `eligible` | `entryIsPending()` true | entry_id, rollout_percentage |
| `not_eligible` | entry pendiente pero fuera de rollout | entry_id, rollout_bucket, reason |
| `install_started` | `applyClientUpdate()` | entry_id, plan_used |
| `install_ok` | tras instalación exitosa | entry_id, plan_used, duration_ms |
| `install_failed` | catch | entry_id, plan_used, error_code |
| `applied` | `markEntryFullyApplied()` | entry_id, to_version |
| `aborted_client` | 3 fallos consecutivos | entry_id, reason |
| `crash_boot` | arranque con versión nueva < 5 min y error fatal | to_version, error_code |
| `rollback` | usuario/admin revierte | from_version, to_version |

---

## 4. Dashboard mínimo

### 4.1 Vistas SQL (Supabase)

**Adopción por versión (últimos 7 días):**

```sql
create or replace view public.v_bona_adoption_by_version as
select
  to_version,
  count(distinct rollout_key_hash) as clients,
  count(*) filter (where event_type='applied') as applied_events,
  min(client_ts) as first_seen,
  max(client_ts) as last_seen
from public.bona_update_telemetry
where client_ts > now() - interval '7 days'
group by to_version
order by to_version desc;
```

**Tasa de error por entry (canary):**

```sql
create or replace view public.v_bona_rollout_health as
select
  entry_id,
  telemetry_tag,
  count(*) filter (where event_type='install_started') as started,
  count(*) filter (where event_type='install_ok') as ok,
  count(*) filter (where event_type='install_failed') as failed,
  count(*) filter (where event_type='crash_boot') as crashes,
  round(100.0 * count(*) filter (where event_type='install_failed')
        / nullif(count(*) filter (where event_type='install_started'),0), 2) as fail_rate_pct,
  round(100.0 * count(*) filter (where event_type='crash_boot')
        / nullif(count(distinct rollout_key_hash) filter (where event_type='detected'),0), 2) as crash_rate_pct
from public.bona_update_telemetry
where client_ts > now() - interval '1 hour'
group by entry_id, telemetry_tag;
```

**Cobertura de rollout (cuántos en canary vs GA):**

```sql
select entry_id, rollout_percentage,
       count(distinct rollout_key_hash) filter (where event_type='eligible') as eligible_clients
from public.bona_update_telemetry
where client_ts > now() - interval '24 hours'
group by entry_id, rollout_percentage;
```

### 4.2 Panel mínimo (Metabase/Grafana/Supabase Dashboard)

Widgets obligatorios:

1. **Adopción actual**: pie/bar de `to_version` (clientes únicos) — última 24h.
2. **Canary health**: tabla `v_bona_rollout_health` con semáforo:
   - verde: fail_rate < 3% y crash_rate < 1%
   - amarillo: fail_rate 3-5% o crash_rate 1-2%
   - rojo: fail_rate > 5% o crash_rate > 2%
3. **Throughput**: eventos/min (línea) — detectar caídas de red.
4. **Top errores**: `error_code` agrupado (últimas 24h).
5. **Rollout coverage**: % de clientes elegibles vs total por entry.

### 4.3 Consultas de soporte

```sql
-- Clientes atascados (detectaron pero no aplicaron en 24h)
select rollout_key_hash, from_version, to_version, entry_id,
       max(client_ts) as last_event
from bona_update_telemetry
where event_type in ('detected','eligible')
  and rollout_key_hash not in (
    select rollout_key_hash from bona_update_telemetry
    where event_type='applied' and client_ts > now() - interval '24 hours'
  )
group by rollout_key_hash, from_version, to_version, entry_id
having max(client_ts) < now() - interval '2 hours';
```

---

## 5. Criterios de abort automático

### 5.1 Señales y umbrales (por entry, ventana 60 min, min 30 muestras)

| Señal | Umbral | Acción |
|-------|--------|--------|
| `fail_rate_pct` (install_failed / install_started) | > 5% | Abort |
| `crash_rate_pct` (crash_boot / detected) | > 1% | Abort |
| `error_rate` (install_failed con mismo error_code > 40% de fallos) | > 40% concentración | Abort (bug determinista) |
| `applied` sin `install_ok` (marcado fantasma) | > 2% de applied | Abort (problema de marcado) |
| Sin eventos `detected` durante 30 min tras startAt (con clientes elegibles) | 0 eventos | Alerta (no abort; posible problema de red/registry) |

### 5.2 Mecanismo de abort

**Nivel 1 — Override inmediato (segundos, sin GitHub):**

Un job (Supabase Edge Function cron cada 5 min) evalúa `v_bona_rollout_health` y si algún entry supera umbral:

```sql
insert into bona_rollout_overrides (entry_id, disabled, reason, updated_by)
values ('1.0.261-critical', true, 'auto: fail_rate 7.2% > 5%', 'auto-abort')
on conflict (entry_id) do update
  set disabled=true, reason=excluded.reason, updated_at=now();
```

El cliente consulta overrides al hacer `fetchRegistryData()` (GET a Supabase) y **no ofrece** la entry si `disabled=true`. Respuesta en ≤ 5 min sin redesplegar.

**Nivel 2 — Actualización de registry.json (minutos, requiere commit):**

Si abort confirmado, actualizar `registry.json`:
- `rollout.percentage = 0` para esa entry, o
- mover entry a `killSwitch.disabledEntryIds`, o
- `killSwitch.globalDisable = true` (emergencia).

Commit + push a `main`. El cliente lo recoge en el siguiente fetch (≤ 30s tras arranque).

**Nivel 3 — Abort cliente-side (sin red):**

Si una instalación falla 3 veces consecutivas (`_installFailCount >= 3`), el cliente:
1. Marca la entry como `aborted_client` (evento telemetría).
2. La excluye localmente por 24h (`localStorage crozzo_aborted_entries`).
3. Muestra botón "Reintentar manualmente" (Plan B).

### 5.3 Auto-promoción (canary → GA)

Si tras `windowMinutes` (ej. 24h) con ≥ `minSamples` y todas las métricas dentro de umbral:
- Edge Function actualiza override: `percentage = 100` (o crea PR/commit a registry.json).
- O humano promueve vía dashboard (botón "Promover a GA").

**Recomendación:** promoción automática solo hasta 50%; de 50% a 100% requiere confirmación humana (evita automatizar un desastre).

### 5.4 Rollback

Si abort a nivel GA (ya liberado a 100% y se detecta degradación):
- `killSwitch.globalDisable = true` en registry.json → ningún cliente nuevo recibe la entry.
- Clientes que ya instalaron **no** se revierten automáticamente (riesgo). Se publica nueva entry con `minFromVersion` apuntando a la versión estable anterior y `type: critical` para forzar downgrade? **No recomendado**: downgrade de datos puede corromper. Mejor: hotfix forward (nueva versión que corrige).

---

## 6. Integración con código existente (Bona Origen)

Archivos a tocar:

- `app/infra/CrozzoSystemUpdates.js`:
  - `fetchRegistryData()` → parsear `schemaVersion`, `telemetry`, `killSwitch`, `rollout`, overrides (fetch Supabase).
  - `entryIsPending()` → agregar filtros de rollout y kill switch.
  - `applyClientUpdate()` → emitir `install_started`/`install_ok`/`install_failed`, medir `duration_ms`.
  - `markEntryFullyApplied()` → emitir `applied`.
- Nuevo módulo `app/infra/CrozzoUpdateTelemetry.js` (cola + flush + hash).
- `app/core/CrozzoPosMain.js` o boot → `flushTelemetry()` periódico.
- Supabase: ejecutar SQL de §3.1 y §3.2.
- `scripts/validate-registry.mjs` (P5 del plan de verificación) → validar campos nuevos.

### 6.1 Pseudo-código de `entryIsPending` extendido

```js
function entryIsPending(entry) {
  if (!entry || entryIsApplied(entry)) return false;
  if (killSwitch.globalDisable) return false;
  if (killSwitch.disabledEntryIds.includes(entry.id)) return false;
  if (overrides[entry.id]?.disabled) return false;
  if (!inTimeWindow(entry.rollout)) return false;
  if (!entry.rollout.platforms.includes(platform)) return false;
  if (!entry.rollout.appTypes.includes(appType)) return false;
  if (compareSemver(installedVersion, entry.rollout.minFromVersion) < 0) return false;
  const bucket = rolloutBucket(effectiveSalt(entry), rolloutKey);
  if (bucket >= effectivePercentage(entry) * 100) {
    enqueueTelemetry({ event_type: 'not_eligible', entry_id: entry.id,
      rollout_bucket: bucket, rollout_percentage: effectivePercentage(entry), ...ctx });
    return false;
  }
  enqueueTelemetry({ event_type: 'eligible', entry_id: entry.id,
    rollout_bucket: bucket, rollout_percentage: effectivePercentage(entry), ...ctx });
  return true;
}
```

---

## 7. Privacidad y seguridad

- **Nunca** enviar `device_id` ni `business_id` en claro; solo hashes truncados (16 hex) para correlación.
- `business_id` se envía en claro **solo** porque ya es identificador de tenant (no PII personal); si se considera sensible, hashearlo también y mantener mapeo server-side.
- RLS: anon solo `INSERT` en telemetría y `SELECT` en overrides. Lectura de telemetría solo service_role.
- Rate limit: Supabase por defecto; adicionalmente batch + flush interval para no saturar.
- El `anonKey` es público por diseño (ya se usa en el cliente); no es secreto.

---

## 8. Plan de implementación (fases)

| Fase | Entregable | Criterio de salida |
|------|-----------|-------------------|
| 1 | SQL tablas + RLS en Supabase | Tablas creadas, insert anon OK |
| 2 | Módulo `CrozzoUpdateTelemetry.js` + cola | Eventos se guardan en localStorage y flushean |
| 3 | Campos rollout en registry.json + validador | `updates:verify` valida schema v2 |
| 4 | Integración en `entryIsPending` + overrides | Canary al 5% funciona en 2 equipos de prueba |
| 5 | Dashboard (vistas + panel) | Métricas visibles en ≤ 5 min |
| 6 | Edge Function auto-abort | Simulación de fallo → override disabled en ≤ 5 min |
| 7 | Auto-promoción hasta 50% | Canary sano 24h → promueve automáticamente |

---

## 9. Ejemplo completo de entry canary

```json
{
  "id": "1.0.261-critical",
  "version": "v1.0.261",
  "semver": "1.0.261",
  "type": "critical",
  "message": "Canary: nueva sincronización de comandas",
  "publishedAt": "2026-11-09T12:00:00.000Z",
  "installMode": "auto",
  "changelog": ["Sync de comandas 2x más rápida", "Fix de reconexión LAN"],
  "sha256": null,
  "rollout": {
    "enabled": true,
    "percentage": 5,
    "salt": "bona-2026q4-261",
    "startAt": "2026-11-09T12:00:00.000Z",
    "endAt": null,
    "minFromVersion": "1.0.240",
    "platforms": ["windows", "macos", "android", "web"],
    "appTypes": ["desktop", "web", "android"]
  },
  "telemetryTag": "canary-261",
  "abortPolicy": {
    "windowMinutes": 60,
    "minSamples": 30,
    "maxErrorRate": 0.05,
    "maxInstallFailureRate": 0.03,
    "maxBootCrashRate": 0.01
  }
}
```

---

## 10. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|-----------|
| Hash no uniforme (sesgo) | FNV-1a sobre string con salt; validar distribución con test (χ²) sobre 10k keys sintéticas. |
| Clientes sin red no reportan | Cola en localStorage + flush al recuperar red; métricas con lag aceptable. |
| Abuso de endpoint (spam) | Rate limit Supabase + batch; RLS insert-only; validar payload con check constraints. |
| Override desincronizado con registry | Cliente hace merge (override gana); humano sincroniza registry después. |
| Downgrade no soportado | Política forward-only; hotfix nuevo en lugar de rollback. |

---

*Documento de diseño. Implementación pendiente de aprobación.*