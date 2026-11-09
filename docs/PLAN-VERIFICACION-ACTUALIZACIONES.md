# Plan de verificación — Actualizaciones Bona Origen

> Objetivo: convertir el subsistema de actualizaciones en un **pilar que jamás falle**.
> Alcance: OTA (`registry.json` / `latest.json` en `main`) + Tauri updater (`latest.json` del Release) + Plan A/C/B.
> Archivos auditados: `app/infra/CrozzoSystemUpdates.js`, `app/infra/CrozzoTauriUpdater.js`, `src-tauri/tauri.conf.json`, scripts de publicación/verificación.

---

## 1. Baseline actual (2026-11-09)

- `src-tauri/tauri.conf.json` → versión `1.0.260`.
- `releases/latest.json` local → `1.0.260`.
- GitHub `main` → `1.0.260` (OTA coincide).
- Último Release GitHub → `v1.0.274` (publicado).
- `npm run updates:health` → OK (sync app/src, capabilities, updater).
- `npm run updates:verify` → OTA OK, pero release GitHub está 14 versiones por delante del árbol local.

**Conclusión baseline:** la cadena está configurada, pero hay desfase de versiones y el cliente puede recibir una actualización muy superior a la esperada. Cualquier prueba debe fijar explícitamente `from`/`to`.

---

## 2. Mapa del flujo (dónde puede fallar)

1. **Arranque**
   - `runBootUpdatePipeline()` (`CrozzoSystemUpdates.js:4569`)
   - `refreshBinaryVersion()` (`:659`) → Tauri `plugin:app|version` o meta/localStorage.
   - `fetchRegistryData()` (`:5260`) → registry.json + latest.json.
   - `reconcileAppliedEntriesForVersion()` (`:878`) marca entradas como aplicadas.
   - Si hay crítica pendiente → `beginDesktopBootCriticalInstall()` / Android diferido.

2. **Detección**
   - `entryIsPending()` (`:2223`) usa `isEntryApplied()` (`:862`) + snooze/session dismiss/state.

3. **Instalación**
   - `applyClientUpdate()` (`:3966`) → Android / binario / web.
   - Binario: `CrozzoTauriUpdater.installAutomatic()` (`CrozzoTauriUpdater.js:1583`) → Plan A (updater firmado) → Plan C (setup.exe silencioso) → Plan B (manual).

4. **Marcado final**
   - `markEntryFullyApplied()` / `commitEntryInstall()` (`:698` / `:740`) actualiza `VERSION`, localStorage y estado.

---

## 3. Causas raíz probables de “a veces actualiza, a veces no”

### A. Supresión por estado persistente (más probable)
- `isEntryApplied()` (`:862`) devuelve `true` si `VERSION >= remoto` (o mismo semver con stamp igual).
- `markEntryFullyApplied()` (`:698`) **avanza `VERSION` al remoto aunque la instalación no haya terminado** o el binario no haya cambiado.
- `reconcileAppliedEntriesForVersion()` (`:878`) marca todas las entradas ≤ versión instalada como aplicadas.
- Estado en `localStorage` (`crozzo_update_state`, `crozzo_update_applied_entry_ids`, `crozzo_app_installed_version`) puede quedar “phantom” tras un fallo o cierre abrupto.
- **Efecto:** la app cree que ya está actualizada y no vuelve a ofrecer la actualización hasta “Restablecer avisos”.

### B. Versión instalada mal reconciliada
- `reconcileInstalledVersion()` (`:556`) usa binario → meta → stored → `v1.0.0`.
- Si `plugin:app|version` falla (invoke no disponible, timing), cae a meta/localStorage, que puede ser viejo o inflado.
- En web/PWA no hay binario: depende de meta tag y localStorage, que pueden desincronizarse.

### C. Build stamp inconsistente
- `isEntryApplied()` (`:862`) para misma semver exige `localStamp === remoteStamp`.
- Si falta alguno (`readMetaBuildStamp()` vacío o `entry.publishedAt` vacío), devuelve `false` → bucle de “pendiente”.
- Si el navegador cachea el HTML viejo, el stamp local no cambia aunque el registry sí → nunca se marca aplicada.

### D. Red / endpoints intermitentes
- `fetchRegistryData()` (`:5260`) depende de `raw.githubusercontent.com` y GitHub API; fallos CORS/red devuelven `null` y tras 2 reintentos lanza.
- `checkForUpdates()` (`:5417`) captura el error y no muestra nada si `silent`.
- Plan A (`CrozzoTauriUpdater.js:1682`) hace `check` con timeout 45s y 2 reintentos; si falla por firma/red, pasa a Plan C.

### E. Nombres de artefacto (Plan C)
- `setupExeFilenameCandidates()` (`CrozzoTauriUpdater.js:521`) asume nombres derivados de `BONA origen` y `Proyecto_`.
- Si el asset real tiene otro nombre (espacios, capitalización, versión con sufijo), la sonda puede fallar antes de consultar la API de GitHub.
- Ya hay fallback por API, pero el orden y las sondas HEAD pueden ser bloqueadas por rate limit.

### F. Estado atascado en memoria
- `_installInProgress`, `_criticalInstallState` (`installing`/`downloading`/`pending_restart`) bloquean `processPendingUpdates()` (`:5206`).
- Algunas rutas tempranas no resetean `_installInProgress` en `finally` (ej. rutas de `releaseDesktopUpdateToLogin`).
- `posIsOperationBusy()` puede no emitir nunca el evento `crozzo:pos-operation-state`, dejando la crítica esperando indefinidamente.

### G. Auto-instalación desactivada
- `otaAutoInstallAllowed()` (`:1304`) consulta `crozzo_ota_auto`; si es `'0'`, la crítica no se auto-instala y solo queda aviso manual.

### H. Release no listo a tiempo
- `waitUntilReleaseReady()` espera hasta 90s; si GitHub Actions aún compila, se difiere con reintento a 2 min.
- El usuario puede cerrar/reiniciar antes y perder el reintento (timer en memoria).

---

## 4. Plan de verificación (paso a paso)

### Fase 0 — Baseline reproducible
1. Ejecutar:
   - `npm run updates:health`
   - `npm run updates:verify`
2. Registrar en el equipo de prueba:
   - versión del binario instalado (`plugin:app|version`),
   - `localStorage`: `crozzo_app_installed_version`, `crozzo_update_state`, `crozzo_update_applied_entry_ids`, `crozzo_ota_auto`,
   - `window.CROZZO_APP_VERSION`, `window.CROZZO_APP_VERSION_DISPONIBLE`, `window.CROZZO_UPDATE_REGISTRY`.
3. Super Admin → **Actualizaciones del sistema** → **Diagnosticar cadena** y exportar el log local.

**Criterio de salida:** tener una “foto” del estado antes de tocar nada.

### Fase 1 — Prueba de detección (sin instalar)
1. Forzar `v1.0.260` instalado (o usar un equipo con esa versión).
2. Asegurar registry GitHub en `1.0.274`.
3. Limpiar solo avisos: `Restablecer avisos`.
4. Pulsar **Comprobar ahora**.
5. Verificar:
   - aparece aviso crítico/opcional,
   - `VERSION_AVAIL = v1.0.274`,
   - `entryIsPending()` devuelve `true` para esa entrada.

**Fallo si:** no aparece aviso a pesar de registry > instalado → investigar Fase 2.

### Fase 2 — Auditoría de estado persistente
1. En consola del cliente ejecutar un volcado (agregar helper `crozzoUpdateDumpState()`):
   - `VERSION`, `_registryEntries`, `_criticalInstallState`, `_installInProgress`,
   - `_pendingCriticalEntry`, `_currentCriticalId`, `_currentOptionalId`,
   - applied ids, snooze map, pending restart.
2. Comparar `crozzo_app_installed_version` con la versión real del binario.
3. Si stored > binary → estado corrupto: limpiar `LS_INSTALLED`, `LS_APPLIED_ENTRIES`, `LS_STATE`, `LS_PENDING_RESTART` y reintentar Fase 1.

**Criterio de salida:** identificar si el fallo es de estado y no de red/publicación.

### Fase 3 — Prueba de instalación controlada
1. Equipo con `crozzo_ota_auto` distinto de `'0'`.
2. Sin venta en curso (POS idle).
3. Ejecutar **Forzar actualización** (Super Admin).
4. Observar:
   - Plan usado (A/C),
   - progreso,
   - reinicio automático,
   - versión post-reinicio.
5. Tras reinicio, verificar:
   - `plugin:app|version` = versión objetivo,
   - entrada marcada aplicada,
   - no reaparece el aviso.

**Fallo si:** la app reinicia pero el aviso vuelve → problema de marcado (Causa A/C).

### Fase 4 — Prueba de resiliencia
1. Cortar red a mitad de descarga → debe mostrar error y ofrecer Plan B.
2. Volver red → **Comprobar ahora** debe reintentar.
3. Simular POS ocupado → crítica debe esperar y auto-instalar al cerrar venta.
4. Tablet Android → verificar APK, conflicto de firma y guía de desinstalación.

### Fase 5 — Regresión automatizada
1. Añadir validador de registry:
   - JSON válido,
   - IDs únicos,
   - versiones monótonas,
   - campos `type`/`installMode` válidos.
2. Extraer funciones puras (`compareSemver`, `isEntryApplied`, `entryIsPending`) a un módulo testeable y añadir tests unitarios.
3. Añadir test de humo Playwright: abrir app, verificar que `updates:health` equivalente en runtime no reporta errores.

---

## 5. Acciones de corrección recomendadas (ordenadas)

### P0 — No avanzar versión sin evidencia
- En `markEntryFullyApplied()` no asignar `VERSION = tv` si `tv > binaryVersion` real.
- Marcar “aplicada” solo tras `refreshBinaryVersion()` confirmar la versión.
- Separar `aplicada (OTA)` de `binario instalado`.

### P1 — Higiene de estado
- Resetear `_installInProgress` en todos los `catch/finally` de rutas de boot.
- Limpiar estado aplicado cuando `binaryVersion < storedVersion`.
- Exponer `crozzoUpdateDumpState()` para soporte.

### P2 — Red y endpoints
- En desktop usar `crozzo_http_get_text` como primario y JS como fallback.
- Cachear último registry exitoso en localStorage para modo offline.
- Validar que `latest.json` del release tenga `releaseTag` correspondiente; no confiar en `raw.githubusercontent.com/releases/latest.json`.

### P3 — Resolución de artefactos
- Consultar API de GitHub primero para nombres reales; usar sondas solo como fallback.
- Mantener candidatos pero ordenar por coincidencia exacta de versión.

### P4 — UX / botones
- Usar delegación de eventos o re-init al montar la vista para no perder botones.
- Mantener visible el estado: versión actual, disponible, último chequeo, último error.
- Botón “Restablecer avisos” siempre accesible.

### P5 — Observabilidad
- Registrar en log local cada decisión: detectado, suprimido (motivo), instalado, fallido, reintentado.
- Añadir contador de fallos por plan para detectar degradación.

---

## 6. Criterios de aceptación (pilar “jamás falla”)

1. Con release publicado y registry actualizado, **100% de clientes elegibles** muestran el aviso en ≤ 30s tras arranque.
2. Una actualización crítica se instala y reinicia sin intervención en ≤ 5 min en red estable.
3. Tras reinicio, la versión del binario coincide con la del release y el aviso **no reaparece**.
4. Ante fallo de red, la app no queda en estado inconsistente y reintenta automáticamente.
5. “Restablecer avisos” siempre recupera la detección.
6. No existen estados atascados (`_installInProgress=true` sin instalación activa) tras 10 min.

---

## 7. Comandos de diagnóstico rápido

```bash
npm run updates:health
npm run updates:verify
```

En cliente (consola):

```js
console.log('VERSION', window.CROZZO_APP_VERSION);
console.log('DISPONIBLE', window.CROZZO_APP_VERSION_DISPONIBLE);
console.log('REGISTRY', window.CROZZO_UPDATE_REGISTRY);
console.log('INSTALLED LS', localStorage.getItem('crozzo_app_installed_version'));
console.log('STATE', localStorage.getItem('crozzo_update_state'));
console.log('APPLIED', localStorage.getItem('crozzo_update_applied_entry_ids'));
console.log('OTA AUTO', localStorage.getItem('crozzo_ota_auto'));
```
