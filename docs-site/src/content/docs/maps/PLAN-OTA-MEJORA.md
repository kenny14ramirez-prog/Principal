---
title: "PLAN OTA MEJORA"
---

# PLAN — MEJORA DEL SISTEMA OTA (actualizaciones)

**Clasificación:** Interna — agentes y generales.
**Estado:** Plan (pendiente de aprobación de AM-1).
**Autoridad:** G3 COMMS (transportes) + G5 PERF + AM-1.

## 0. Contexto (investigación completada)

El sistema OTA está centralizado en `app/infra/CrozzoSystemUpdates.js` (~6.400 líneas) con soporte nativo en `CrozzoTauriUpdater.js`. No bloquea el login (gate desactivado). La actualización crítica se descarga en segundo plano y se aplica al reiniciar. El estado se preserva implícitamente por el OS/instalador.

### Problemas identificados (12)
1. Fuente de verdad fragmentada (VERSION/VERSION_AVAIL hardcoded vs meta/binario/registry).
2. `isEntryApplied` retorna `true` siempre para misma semver (dead code `isBuildOnlyUpdate`).
3. Preservación de estado no garantizada por código (no hay backup/restore de carritos/IndexedDB).
4. Android no reabre solo (pending en sessionStorage, se pierde al morir el proceso).
5. Dos rutas de instalación solapadas (Plan A/B/C/D).
6. Sin verificación de integridad (solo tamaño mínimo, no SHA256).
7. Timeouts largos (BOOT_GATE_MAX_MS 12s + watchdog 22s).
8. `CrozzoMobileInstall.js` no es OTA (solo QR).
9. Estado `_installInProgress` mutable sin sincronización.
10. Cloud sync post-update depende de `crozzoOnlineConfigReady`.
11. Sin retry automático si ambos fetch fallan.
12. Sin telemetría remota de fallos OTA.

## 1. Objetivo

Hacer el sistema OTA **robusto, no bloqueante y resiliente**: buscar actualizaciones al arrancar sin frenar la app, descargar en segundo plano, instalar cuando el usuario decida, preservar estado (ventas, mesas, memoria), informar al final qué se actualizó, y funcionar en todas las plataformas (Windows, macOS, Android, Linux).

## 2. Principios (no negociables)

1. **No bloquear el uso.** La app debe seguir funcionando al 100% mientras se descarga/instala. El usuario decide cuándo instalar.
2. **Preservar estado.** Ventas, mesas abiertas, carrito, memoria persistente no se pierden.
3. **No invasivo.** Avisos no bloqueantes (banner arriba), no modales que obliguen.
4. **Informar al final.** Changelog visible tras actualizar.
5. **Todas las plataformas.** Windows, macOS, Android, Linux.
6. **Fuente canónica:** editar `app/`, publicar con `npm run sync` → `src/`.

## 3. Plan de ejecución (fases)

### Fase OTA-1 — Corregir detección de build-only updates (P1)
- **Archivo:** `app/infra/CrozzoSystemUpdates.js`
- **Cambio:** en `isEntryApplied`, comparar `crozzo-build-stamp` además de semver. Si el stamp difiere, marcar como pendiente aunque la semver sea igual.
- **Eliminar dead code:** `isBuildOnlyUpdate` (nunca se usa) o implementarlo correctamente.
- **PASS:** `test:sync-clinical` 44/44 + test manual.

### Fase OTA-2 — Preservar estado antes de reload/restart (P2)
- **Archivo:** `app/infra/CrozzoSystemUpdates.js`
- **Cambio:** en `applyWebClientUpdate` y `finishUpdateRelaunch`, guardar `collectPosRuntimeState()` en `localStorage` bajo `crozzo_update_state_backup`. Al arrancar, restaurar si existe.
- **Bloquear reload** si `crozzoUpdateUserBusy()` (ya parcial) → mostrar "Actualización lista, se aplicará al cerrar".
- **PASS:** test manual: venta abierta → actualizar → venta sigue.

### Fase OTA-3 — Android post-instalación (P3)
- **Archivo:** `app/infra/CrozzoSystemUpdates.js`, `CrozzoTauriUpdater.js`
- **Cambio:** migrar `SS_ANDROID_PENDING` de `sessionStorage` a `localStorage`. Añadir instrucción clara de reabrir la app. Intentar deep link si es posible.
- **PASS:** test en Android: instalar APK → reabrir app → finalizeAndroidPendingInstall ejecuta.

### Fase OTA-4 — Reducir timeouts y mejorar feedback (P5)
- **Archivo:** `app/infra/CrozzoSystemUpdates.js`
- **Cambio:** `BOOT_GATE_MAX_MS` 12s → 8s. Skip button visible tras 2s. Mostrar estado de red ("Buscando actualizaciones…").
- **PASS:** test con red lenta: login disponible en <8s.

### Fase OTA-5 — Lock de concurrencia (P7)
- **Archivo:** `app/infra/CrozzoSystemUpdates.js`
- **Cambio:** serializar operaciones críticas/opcionales con una cola (evitar carreras en `_installInProgress`).
- **PASS:** test: crítica + opcional simultáneas no se interfieren.

### Fase OTA-6 — Unificar fuente de verdad (P1/P6)
- **Archivo:** `app/infra/CrozzoSystemUpdates.js`, `app/index.html`
- **Cambio:** generar meta `crozzo-app-version` desde CI (ya lo hace `sync-version-from-tag.mjs`). Eliminar hardcoded `v1.0.0`/`v2.0.0` o marcarlos como fallback explícito.
- **PASS:** `test:sync-clinical` 44/44.

### Fase OTA-7 — Checksums SHA256 (P4)
- **Archivo:** `releases/latest.json`, `CrozzoTauriUpdater.js`
- **Cambio:** añadir campo `sha256` a cada entrada. Verificar en `verifySetupDownloadUrl`/`verifyApkDownloadUrl`.
- **PASS:** test: artefacto corrupto se rechaza.

### Fase OTA-8 — Telemetría OTA (P8)
- **Archivo:** `app/infra/CrozzoSystemUpdates.js`
- **Cambio:** enviar `crozzo_update_local_log` a Supabase (tabla de eventos).
- **PASS:** test: evento se registra en Supabase.

### Fase OTA-9 — Consolidar rutas de instalación (P5)
- **Archivo:** `CrozzoTauriUpdater.js`
- **Cambio:** elegir un plan primario por plataforma, degradar a fallback documentado.
- **PASS:** test: instalación funciona en Windows/macOS/Android.

### Fase OTA-10 — Verificar y publicar
- Ejecutar `test:sync-clinical` (44/44) + `connectivity` (111/111) + `cargo build` (EXIT 0).
- Publicar release v1.0.240 con todos los cambios.
- Probar OTA en VM.

## 4. Orden de ejecución (quirúrgico, paso a paso)

1. OTA-1 (corregir detección) → auditoría.
2. OTA-2 (preservar estado) → auditoría.
3. OTA-3 (Android post-instalación) → auditoría.
4. OTA-4 (timeouts) → auditoría.
5. OTA-5 (lock concurrencia) → auditoría.
6. OTA-6 (fuente de verdad) → auditoría.
7. OTA-7 (checksums) → auditoría.
8. OTA-8 (telemetría) → auditoría.
9. OTA-9 (consolidar rutas) → auditoría.
10. OTA-10 (verificar + publicar).

## 5. Riesgos

- **Fiscal:** no afecta datos fiscales; solo infraestructura de actualización.
- **Compatibilidad:** cambios en `isEntryApplied` pueden hacer que builds antiguas se re-descarguen. Mitigar con `crozzo-build-stamp`.
- **Estado:** backup/restore de IndexedDB es complejo; empezar con localStorage (carrito) y expandir.
- **Android:** deep link puede no funcionar en todos los launchers; mantener instrucción manual como fallback.

## 6. Estimación

- OTA-1 a OTA-4: 1 semana.
- OTA-5 a OTA-7: 1 semana.
- OTA-8 a OTA-10: 1 semana.
- **Total:** ~3 semanas.

## 7. Decisión requerida

AM-1 debe aprobar:
1. El orden de ejecución (OTA-1 primero).
2. El enfoque de preservación de estado (localStorage → IndexedDB).
3. La adición de checksums SHA256 a `latest.json`.

---

**Próximo paso sugerido:** aprobar OTA-1 (corregir detección de build-only updates) y ejecutar con asuntos internos revisando paso a paso. ¿Autorizo?