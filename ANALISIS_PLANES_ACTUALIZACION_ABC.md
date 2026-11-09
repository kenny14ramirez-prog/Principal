# Análisis del Sistema de Planes de Actualización (A/B/C) — Bona Origen

**Archivos analizados:**
- `app/infra/CrozzoTauriUpdater.js` (~1860 líneas) — instalador nativo Tauri + Plan B manual
- `app/infra/CrozzoSystemUpdates.js` (~7000 líneas) — OTA, registry, UI, cola persistente
- `src-tauri/src/crozzo_silent_install.rs` — descarga/instalación silenciosa en Rust
- `src-tauri/tauri.conf.json` — config del plugin-updater

**Contexto:** el sistema ya implementa store v2, sanitización, `recoverStore`, lease, cola persistente y `markEntryFullyApplied` con verificación de binario (cambios P0). Este análisis se concentra exclusivamente en el **subsistema de planes A/B/C** y en cómo hacerlo robusto.

---

## 1. Resumen ejecutivo

El sistema actual **ya tiene** una noción de planes, pero es **implícita y dispersa**:

- **Plan A** = Tauri plugin-updater firmado (`plugin:updater|check` + `download_and_install`), con relaunch.
- **Plan C** = instalación silenciosa por `setup.exe` (Windows) / `.dmg` (macOS) descargado desde GitHub y lanzado por Rust.
- **Plan B** = descarga manual del instalador desde GitHub (fallback cuando A/C fallan).
- Además existe un flujo Android (APK in-app + fallback a descarga externa) y un flujo web (reload).

El problema principal **no es la ausencia de fallbacks, sino la falta de un orquestador explícito**:

1. La decisión de qué plan usar está **hardcodeada en ramas `if`** repartidas entre `installAutomatic`, `installLatestBinary`, `applyClientUpdate`, `applyBinaryUpdate`, `tryPlatformFallback`. No hay un único punto de decisión.
2. El Plan C (silencioso) es el **camino preferido en Windows** (`preferSilentSetup !== false`), pero su implementación en Rust es frágil: sin verificación de firma/hash del instalador, sin limpieza de temporales, sin callback de progreso, sin cancelación, y con un script `.cmd` que puede fallar silenciosamente (relaunch).
3. El Plan B **no siempre está disponible**: `_planB` se carga solo cuando falla un plan (`offerPlanBAfterFailure`), y `loadPlanBFallback` depende de red. Si la red cae antes de cargarlo, el usuario no tiene enlace manual.
4. No existe **detección automática robusta** del plan según el estado del sistema (capacidades, red, espacio en disco, permisos, firma). La selección actual se basa en `kind` + flags, no en salud real.

**Severidad global del subsistema de planes: ALTA.**

---

## 2. Arquitectura actual de los planes

### 2.1 Mapa de funciones clave (CrozzoTauriUpdater.js)

| Función | Rol |
|---|---|
| `installAutomatic(opts)` | Punto de entrada "inteligente": en Windows intenta Plan C primero (`trySilentSetupInstall`), si falla cae a `installLatestBinary`. |
| `installLatestBinary(opts)` | Orquestador "clásico": Plan A (updater Tauri) → si falla, `tryPlatformFallback` (Plan C en Windows, Plan D en Mac, Plan B en otros). |
| `tryPlatformFallback(err, ver, ...)` | Decide fallback por plataforma: Windows→`trySilentSetupInstall` (Plan C), Mac→`tryMacDmgInstall` (Plan D) o Plan B. |
| `trySilentSetupInstall(...)` | Wrapper de Plan C en Windows: resuelve URL, llama `installViaSilentSetupExe`. |
| `installViaSilentSetupExe(...)` | Plan C: descarga `setup.exe` vía Rust `install_setup_from_url`, luego `finishUpdateRelaunch(..., 'C')` (exit only, el `.cmd` relanza). |
| `installViaSilentDmgMac(...)` | Plan D (macOS): `install_dmg_from_url`. |
| `resolveManualFallback(ver)` | Resuelve Plan B: assets de GitHub + URL predicha. |
| `attachManual(err, manual)` | Adjunta `manualFallback` al error para que la UI muestre Plan B. |

### 2.2 Mapa en CrozzoSystemUpdates.js

| Función | Rol |
|---|---|
| `applyClientUpdate(target, onProgress, opts)` | Router por perfil: Android→`applyAndroidClientUpdate`, binario→`applyBinaryUpdate`, web→`applyWebClientUpdate`. |
| `applyBinaryUpdate(...)` | Llama `TU.installAutomatic` o `TU.installLatest`. |
| `applyAndroidClientUpdate(...)` | Plan APK in-app (`installApkAutomatic`) o fallback descarga externa (`apk_download` = Plan B móvil). |
| `loadPlanBFallback(target, manualFromError)` | Puebla `_planB` (URL + release page). |
| `offerPlanBAfterFailure(target, err)` | Muestra UI de Plan B tras fallo. |
| `runInstallFromQueue(item, entry)` | Ejecuta un item de la cola con `applyClientUpdate`, actualiza estado. |

### 2.3 Flujos por plataforma

```
Windows (Tauri)   → Plan C (setup.exe silencioso)  → fallback Plan A (updater) → fallback Plan B (manual)
Mac (Tauri)       → Plan A (updater Tauri)          → fallback Plan D (dmg)      → fallback Plan B
Android (Tauri)   → Plan APK in-app (un toque)      → fallback descarga externa (Plan B móvil)
Web/iOS           → Plan web_reload (recarga)        → (sin instalador) Plan B = abrir release page
```

Nota: en `installAutomatic` (Windows) el orden es **C primero**, mientras que en `installLatestBinary` el orden es **A primero**. Esta inconsistencia es una fuente de confusión y de resultados distintos según el entry point.

---

## 3. Qué puede fallar en cada plan y cómo se recupera

### 3.1 Plan A — Tauri plugin-updater firmado

**Puntos de fallo:**
1. **Firma mismatch** (`isSignatureMismatchError`): el `latest.json` del release fue firmado con una clave distinta a la `pubkey` en `tauri.conf.json`. Resultado: OTA bloqueado. Recuperación actual: `isRecoverableUpdaterError` retorna `true` → `trySilentFallback`. Pero si `automaticOnly !== false`, en Mac se rechaza y solo se ofrece Plan B.
2. **404 / release no publicado**: `checkForAppUpdate` falla con 404. Recuperación: retry 2 veces (`checkForAppUpdateWithRetry`), luego fallback.
3. **Red lenta / timeout**: `UPDATER_CHECK_TIMEOUT_MS = 45000`. Recuperación: retry con delay 1.8s, luego fallback.
4. **`meta.rid == null`**: sin metadatos → `runDownloadInstall` rechaza → fallback.
5. **Descarga interrumpida a mitad**: `runDownloadInstall` reintenta hasta 2 veces con delay 2.5s; si sigue fallando, fallback a Plan C/B.
6. **Updater no disponible** (binario antiguo sin plugin): `canUseTauriUpdater` false → se rechaza directamente.

**Debilidades:**
- No hay verificación de **integridad del paquete descargado** más allá de la firma Tauri (bien, pero depende del endpoint).
- El relaunch (`relaunchApp`) puede fallar y la app queda cerrada sin reabrir; no hay watchdog que reabra.
- No hay **resume** de descarga parcial.

### 3.2 Plan C — Instalador silencioso (Windows .exe / macOS .dmg)

**Windows (`install_setup_from_url` en Rust):**
1. **Comando no registrado** en binarios antiguos: `not found|unknown command` → error fatal, no hay fallback automático a Plan B (solo mensaje).
2. **Descarga parcial/corrupta**: `validate_exe` solo verifica tamaño ≥ 400KB y magic bytes `MZ`. Un instalador truncado pero >400KB con `MZ` pasa.
3. **Escritura a disco falla** (permisos, disco lleno): `std::fs::write` falla → error propagado, JS reintenta 2 veces (`SILENT_INSTALL_RETRY_MAX`).
4. **El script `.cmd` no relanza**: si `current_exe()` es `None` y el guess de ruta es incorrecto, la app no vuelve a abrir. No hay verificación.
5. **UAC / antivirus bloquea** el instalador NSIS `/S`: el `start /wait` termina con código de error, pero el script ignora el código (`start /wait` no aborta el `.cmd`). La app se relanza igual con la versión vieja → falsa sensación de éxito.
6. **Doble instancia**: el instalador NSIS puede fallar si la app no cerró a tiempo (timeout 2s). No hay retry del instalador, solo de la descarga.
7. **Temp files no se limpian**: `crozzo-setup-{stamp}.exe` y `crozzo-relaunch-{stamp}.cmd` quedan en `%TEMP%` indefinidamente.
8. **Sin progreso real**: el JS simula progreso con `setInterval` (tick cada 2.5s). No hay canal de progreso desde Rust.
9. **Sin cancelación**: una vez lanzado `install_setup_from_url`, no se puede abortar.
10. **Firma del instalador no verificada** en Rust: solo magic bytes. Un atacante que sustituya el asset en el CDN (no en GitHub, pero sí en tránsito) podría inyectar un .exe. Mitigación actual: allowlist de hosts + HTTPS, pero no hay firma Authenticode ni hash SHA-256.

**macOS (`install_dmg_from_url`):**
1. `hdiutil attach` puede fallar por permisos/quarantine.
2. `cp -R` a `/Applications` puede fallar si no hay permisos (aunque suele ser el usuario actual).
3. `find_app_bundle` solo busca en el primer nivel del mount.
4. No se verifica la firma del `.app` ni se quita quarantine (`xattr -dr com.apple.quarantine`).
5. Si `/Applications/BONA origen.app` está en uso, `remove_dir_all` falla.
6. El `open -a` final puede abrir una instancia vieja si el bundle no se reemplazó.

**Debilidades comunes:**
- No hay **checksum** verificado contra el `latest.json`/registry.
- No hay **rollback**: si la instalación falla a mitad, la app anterior puede quedar dañada.
- No hay **idempotencia**: relanzar el mismo comando re-descarga todo.

### 3.3 Plan B — Descarga manual

**Puntos de fallo:**
1. `_planB` se carga **solo tras fallo** (`offerPlanBAfterFailure`). Si el usuario entra directo a "Actualizaciones" sin haber fallado, `_planB.ready === false` y el botón "Descargar" no tiene URL hasta pulsar "Resolver enlace manual".
2. `loadPlanBFallback` usa `resolveFn = TU.resolveBestDownloadUrl || ... || TU.resolveManualFallback`. Si la red está caída, `_planB.downloadUrl` queda vacío y solo se ofrece `releasesPageUrl` (página de releases, no el asset).
3. La URL puede ser incorrecta si el asset no sigue el patrón de nombres (`setupExeFilenameCandidates` / `apkFilenameCandidates`). Se mitiga con `resolveManualFallback` que consulta la API de GitHub, pero eso depende de red y del rate limit (60 req/h sin token).
4. En Windows, el asset `setup.exe` puede no existir aún (GitHub Actions no terminó). `_planB.ready` queda true con la URL "predicha" pero el HEAD falla → descarga 404.
5. No hay **mirror** ni **CDN** alternativo.
6. No hay **QR/copia** robusta para móvil (solo `openExternalUrl`).

**Debilidades:**
- El Plan B **no está garantizado como último recurso** porque depende de resolver URL en el momento del fallo. Si la resolución falla, el usuario se queda sin salida.
- No se pre-calienta `_planB` al arrancar para la versión objetivo.

### 3.4 Android APK

**Puntos de fallo:**
1. `installApkAutomatic` depende de `crozzo_android_download_apk` (Rust) + `plugin:android-package-install`. Si el plugin no está disponible en el binario, cae a descarga externa.
2. **Conflicto de firma** (`isAndroidInstallConflictError`): la APK nueva no tiene la misma firma que la instalada → el usuario debe desinstalar manualmente. La app no puede auto-desinstalar.
3. **FileProvider / parse errors**: APK corrupto o ruta inválida.
4. La app **no se reabre sola** tras instalar (limitación de Android). El usuario debe abrirla manualmente.
5. `finalizeAndroidPendingInstall` solo marca aplicado si `compareSemver(installedVer, pv) >= 0`. Si el usuario no abre la app tras instalar, el estado queda pendiente.

### 3.5 Web / iOS

- Plan `web_reload`: recarga la página. Si el servidor sirve la versión nueva, OK. Si hay caché agresiva (service worker / CDN), el usuario sigue viendo la vieja.
- No hay **versionado de assets** ni **cache-busting** explícito más allá del query `_boot=`.
- iOS no permite instalación de PWA automática; solo recarga.

---

## 4. Cómo otras apps implementan fallbacks robustos

### 4.1 Google Chrome (Omaha / Update Engine)

- **Tres canales**: stable/beta/dev + canary. Cada uno con su endpoint.
- **Differential updates**: solo descarga el delta (binary diff), reduce tamaño y probabilidad de fallo de red.
- **A/B slots** (en Android/ChromeOS): la nueva versión se instala en la partición inactiva; si falla el boot, se revierte automáticamente a la partición activa.
- **Verificación de firma** del instalador completo antes de aplicar; hash SHA-256 publicado en el manifest.
- **Fallback**: si el updater falla, Chrome muestra "Actualizar Chrome" que abre la página de descarga manual.
- **Telemetría**: reporta código de error del updater (RESULT_CODE) para diagnóstico.

### 4.2 Mozilla Firefox

- **MAR (Mozilla ARchive)**: paquete firmado con certificado de Mozilla. El updater verifica la firma antes de aplicar.
- **Staged updates**: descarga en background, aplica al reiniciar. Si el usuario no reinicia, aplica en el siguiente arranque.
- **Fallback a instalador completo** si el incremental (partial MAR) falla o no está disponible.
- **Rollback**: mantiene la versión anterior en `updated`/`removed-files.log` para poder revertir.
- **AUS (Application Update Service)**: endpoint con fallback a mirrors (CDN).

### 4.3 VS Code

- **Code - Insiders / Stable**: dos canales.
- **Updater por plataforma**: Windows usa NSIS silencioso (`/S`), macOS usa `Squirrel.Mac` (in-app), Linux usa apt/snap.
- **Fallback explícito**: si la actualización automática falla, muestra "Update Available" con botón "Download Update" que abre el instalador manual.
- **Checksum verification**: el manifest incluye `sha256hash` del instalador; el updater lo verifica.
- **Progress reporting**: canal de progreso real desde el proceso de actualización.
- **Rollback manual**: el usuario puede reinstalar la versión anterior desde la página de releases.

### 4.4 Android (Play Store / APK sideload)

- **A/B partitions (seamless updates)**: la nueva versión se instala en la partición inactiva; el reboot cambia la partición activa. Si falla el boot, rollback automático.
- **APK signature verification**: el sistema verifica que la nueva APK tenga la misma firma que la instalada (o sea una actualización válida). Si no, `INSTALL_FAILED_UPDATE_INCOMPATIBLE`.
- **Delta updates**: Play Store descarga solo los cambios (file-by-file patch).
- **Fallback**: si la instalación in-app falla, el usuario puede descargar el APK manualmente.
- **Install sessions**: `PackageInstaller` API con callbacks de estado (PENDING, INSTALLING, FAILED) y códigos de error detallados.

### 4.5 Lecciones aplicables a Bona Origen

| Técnica | Aplicabilidad | Prioridad |
|---|---|---|
| Verificación de hash/firma del instalador antes de aplicar | Alta (Plan C) | Crítica |
| A/B slots / rollback | Media (requiere Rust + installer) | Alta |
| Delta updates | Baja (tamaño ~8MB, no justifica) | Baja |
| Fallback explícito a instalador manual | Ya existe, pero no garantizado | Crítica |
| Progress real desde Rust | Alta (UX) | Media |
| Códigos de error detallados + telemetría | Alta | Media |
| Mirrors/CDN | Media | Media |
| Install sessions con estado | Media (Android) | Media |

---

## 5. Cómo reforzar el Plan C (instalador silencioso)

### 5.1 Objetivos

1. **Confiabilidad**: que el instalador se aplique correctamente o se reporte el fallo real (no "éxito" falso).
2. **Verificabilidad**: hash SHA-256 del instalador verificado contra el manifest antes de ejecutar.
3. **Observabilidad**: progreso real y código de error detallado.
4. **Limpieza**: temporales eliminados siempre (éxito o fallo).
5. **Rollback**: si la instalación falla, la app anterior queda funcional.
6. **Fallback**: cualquier fallo de Plan C cae automáticamente a Plan B con URL ya resuelta.

### 5.2 Cambios en Rust (`crozzo_silent_install.rs`)

#### 5.2.1 Verificación de hash SHA-256

```rust
// En install_setup_from_url, después de download_with_retries:
// Recibir expected_sha256 opcional desde JS.
pub fn install_setup_from_url(url: String, expected_sha256: Option<String>) -> Result<(), String> {
    // ... validación host ...
    let bytes = download_with_retries(url, validate_exe)?;
    if let Some(hash) = expected_sha256 {
        let actual = sha256_hex(&bytes);
        if !hash.eq_ignore_ascii_case(&actual) {
            return Err(format!("Hash del instalador no coincide: esperado {hash}, obtenido {actual}"));
        }
    }
    // ... escribir y lanzar ...
}
```

El hash debe venir del `latest.json`/registry (campo `sha256` o del asset). Si no está disponible, se acepta con advertencia (modo degradado).

#### 5.2.2 Limpieza garantizada (RAII / finally)

```rust
// Usar un struct con Drop para limpiar temporales.
struct TempFileGuard { path: PathBuf }
impl Drop for TempFileGuard {
    fn drop(&mut self) { let _ = std::fs::remove_file(&self.path); }
}
// Aplicar a tmp (setup) y helper (cmd).
```

También exponer comando `cleanup_update_temp_files` para limpieza proactiva al arrancar.

#### 5.2.3 Verificación del código de salida del instalador

En el script `.cmd`, capturar el exit code y solo relanzar si fue 0 (o códigos conocidos de "ya instalado"). Si falla, escribir un archivo de estado `crozzo-install-result.txt` con el código para que la app lo lea al reabrir.

```cmd
start /wait "" "{installer}" /S
set INSTALL_RC=%ERRORLEVEL%
echo %INSTALL_RC% > "%TEMP%\crozzo-install-result.txt"
if %INSTALL_RC% neq 0 (
    echo Instalación falló con código %INSTALL_RC% >> "%TEMP%\crozzo-install-error.log"
    pause
    exit /b %INSTALL_RC%
)
timeout /t 2 /nobreak >nul
start "" "{exe}"
```

#### 5.2.4 Progreso vía Channel (Tauri 2)

Usar `tauri::ipc::Channel` para reportar fases (download bytes, write, launch) en lugar de simular en JS:

```rust
#[tauri::command]
pub fn install_setup_from_url(url: String, expected_sha256: Option<String>, on_progress: Channel<ProgressEvent>) -> Result<(), String> { ... }
```

JS: `invoke('install_setup_from_url', { url, expectedSha256, onProgress: channel })`.

#### 5.2.5 Cancelación

Mantener un `Arc<AtomicBool>` global `CANCEL_FLAG`. Exponer `cancel_install()`. En el loop de descarga (cambiar `download_bytes` a streaming con chunks), verificar el flag.

#### 5.2.6 Eliminación de quarantine en macOS

```rust
let _ = Command::new("xattr").args(["-dr", "com.apple.quarantine", &dest.to_string_lossy()]).status();
```

#### 5.2.7 Pre-flight checks

Antes de descargar, verificar:
- Espacio libre en disco ≥ 2× tamaño esperado (`sysinfo` o `std::fs` metadata).
- Permisos de escritura en el directorio de instalación.
- Que no haya otra instancia del instalador corriendo (lock file).

### 5.3 Cambios en JS

#### 5.3.1 Unificar entry points

Decidir un único orquestador `PlanRouter.run(targetVersion, opts)` que:
1. Detecta el plan inicial según perfil + salud.
2. Ejecuta el plan.
3. En cualquier fallo, registra el error y cae al siguiente plan en la cadena de fallback predefinida.
4. Garantiza que Plan B (URL resuelta) esté disponible al final.

#### 5.3.2 Cadena de fallback explícita

```
Windows:  C → A → B
Mac:      A → D → B
Android:  APK in-app → apk_download (B móvil)
Web:      web_reload → B (abrir release page)
```

Cada plan retorna `{ ok, plan, error?, nextPlan? }`. El router itera hasta `ok` o hasta agotar la cadena.

#### 5.3.3 Pre-calentar Plan B

Al arrancar (`runBootUpdatePipeline` o al detectar versión objetivo), llamar `loadPlanBFallback(VERSION_AVAIL)` en background para que `_planB.ready === true` antes de cualquier fallo.

#### 5.3.4 Verificación post-instalación

Tras Plan C, no asumir éxito: al reabrir, `recoverStore`/`refreshBinaryVersion` debe confirmar que `VERSION >= target`. Si no, marcar el item como `failed` y ofrecer Plan B. (Ya existe parcialmente en `markEntryFullyApplied`.)

---

## 6. Cómo hacer que el Plan B siempre esté disponible como último recurso

### 6.1 Principio

El Plan B debe ser **resoluble offline** (al menos la URL de la página de releases) y **pre-calentado** para la versión objetivo. Nunca debe depender de que un plan falle primero.

### 6.2 Implementación propuesta

#### 6.2.1 Resolver URL en cascada con mirrors

```js
function resolvePlanBUrl(targetVersion) {
  var ver = normVersion(targetVersion);
  // 1. Caché local (último URL válido para esta versión)
  var cached = readPlanBCache(ver);
  if (cached && cached.url) return Promise.resolve(cached);
  // 2. GitHub API (assets)
  // 3. Predicción por nombre
  // 4. Página de releases (siempre disponible offline como fallback mínimo)
  return resolveManualFallback(ver)
    .then(function (info) {
      var url = info.downloadUrl || predictUrlForPlatform(ver) || GITHUB_RELEASES_LATEST;
      writePlanBCache(ver, url, info.releasePageUrl);
      return { version: ver, url: url, releasePageUrl: info.releasePageUrl || GITHUB_RELEASES_LATEST, ready: true };
    })
    .catch(function () {
      // Último recurso: página de releases (siempre reachable si hay red)
      return { version: ver, url: GITHUB_RELEASES_LATEST, releasePageUrl: GITHUB_RELEASES_LATEST, ready: true, degraded: true };
    });
}
```

#### 6.2.2 Caché persistente de Plan B

Guardar en `localStorage` (`crozzo_planb_cache_v1`) el último URL válido por versión y por plataforma. TTL de 7 días. Si la red cae, usar el caché.

#### 6.2.3 Mirrors

Definir lista ordenada de endpoints para metadata:
```
1. https://raw.githubusercontent.com/.../releases/latest.json
2. https://cdn.jsdelivr.net/gh/.../releases/latest.json  (si se publica en jsdelivr)
3. https://github.com/.../releases/latest/download/latest.json
```

Y para assets, GitHub Releases es el único host confiable (no hay mirror oficial). Pero la **página de releases** siempre está disponible.

#### 6.2.4 Garantizar disponibilidad en UI

- El botón "Plan B — Descarga manual" siempre visible en la pantalla de Actualizaciones (no solo tras fallo).
- Si `_planB.ready === false`, al pulsar se resuelve en ese momento (con spinner) y luego abre.
- Mostrar siempre el enlace de la página de releases como fallback de último recurso.
- En móvil, mostrar QR con la URL del APK (para escanear desde otro dispositivo si el navegador del tablet falla).

#### 6.2.5 Pre-calentamiento

```js
// En runBootUpdatePipeline, tras cargar registry:
if (VERSION_AVAIL && compareSemver(VERSION_AVAIL, VERSION) > 0) {
  loadPlanBFallback(VERSION_AVAIL).catch(function(){});
}
```

---

## 7. Cómo detectar automáticamente qué plan usar según el estado del sistema

### 7.1 Matriz de capacidades (PlanCapabilityProbe)

Antes de elegir plan, ejecutar un probe rápido (< 2s) que evalúa:

| Capacidad | Cómo detectar | Plan preferido si OK |
|---|---|---|
| Tauri disponible | `isTauri()` | binario |
| Updater plugin disponible | `invoke('plugin:updater|check')` con timeout 5s | Plan A |
| Comando silencioso disponible | `invoke('probe_platform_installer')` | Plan C |
| Red OK | `navigator.onLine` + fetch a raw.githubusercontent con timeout 5s | A/C |
| Espacio en disco suficiente | Rust `check_disk_space` o heurística | C |
| Permisos de instalación | Rust `check_install_permissions` | C |
| Firma del binario actual válida | `getAppVersion()` no vacío | A |
| Asset disponible en GitHub | `resolveReleaseInstallTarget(target)` | C/A |

### 7.2 Árbol de decisión (PlanRouter.selectPlan)

```
function selectPlan(profile, targetVersion, opts) {
  if (profile.isWeb) return 'web_reload';
  if (profile.isAndroid) {
    if (canUseAndroidInAppUpdater()) return 'apk_inapp';
    return 'apk_download'; // Plan B móvil
  }
  // Desktop
  if (!isTauri()) return 'web_reload';
  // Health probes
  var health = probeSystemHealth(targetVersion);
  if (health.updaterAvailable && health.networkOk && !health.signatureMismatch) {
    // Plan A preferido si el release tiene firma válida
    if (health.releaseHasSignature) return 'A';
  }
  if (health.silentInstallerAvailable && health.diskOk && health.permissionsOk && health.networkOk) {
    return 'C';
  }
  if (health.silentInstallerAvailable && health.networkOk) {
    return 'C'; // intentar, con fallback a B
  }
  return 'B'; // último recurso
}
```

### 7.3 Detección de Plan A vs C en Windows

Hoy Windows prefiere C (`preferSilentSetup`). La razón: el updater Tauri requiere que el release tenga `latest.json` firmado, y si la firma no coincide, Plan A falla. Pero Plan A es más "nativo" y maneja delta/relaunch mejor.

**Recomendación:** preferir Plan A si:
- El `latest.json` del target está disponible y su firma valida contra la `pubkey`.
- El binario actual soporta el updater plugin.

Preferir Plan C si:
- Plan A falla por firma/network.
- El release aún no tiene `latest.json` pero ya tiene `setup.exe`.

Esto evita depender siempre de Plan C (que es más frágil en relaunch).

### 7.4 Detección de degradación (fallback automático)

Durante la ejecución, si un plan falla, el router debe:
1. Registrar el error con código.
2. Marcar el plan como "no disponible para esta sesión" (para no reintentarlo inmediatamente).
3. Caer al siguiente plan.
4. Si todos fallan, garantizar Plan B con URL resuelta (o página de releases).

### 7.5 Persistencia de salud

Guardar en `localStorage` (`crozzo_plan_health_v1`) el último resultado de salud por plan y por versión, con TTL de 1 hora. Esto evita re-probar planes que ya fallaron recientemente. Al cambiar de versión objetivo, invalidar.

---

## 8. Código de referencia

### 8.1 PlanRouter (JS) — orquestador unificado

```js
// CrozzoUpdatePlanRouter.js (nuevo módulo)
(function (global) {
  'use strict';
  var FALLBACK_CHAINS = {
    windows: ['C', 'A', 'B'],
    mac:     ['A', 'D', 'B'],
    android: ['apk_inapp', 'apk_download'],
    web:     ['web_reload', 'B'],
  };

  function selectInitialPlan(profile, health) {
    health = health || {};
    if (profile.isWeb) return 'web_reload';
    if (profile.isAndroid) return canUseAndroidInAppUpdater() ? 'apk_inapp' : 'apk_download';
    if (!isTauri()) return 'web_reload';
    // Desktop
    if (profile.isWindows) {
      if (health.updaterAvailable && health.releaseHasSignature && health.networkOk) return 'A';
      if (health.silentInstallerAvailable && health.networkOk) return 'C';
      return 'B';
    }
    if (profile.isMac) {
      if (health.updaterAvailable && health.releaseHasSignature && health.networkOk) return 'A';
      if (health.silentInstallerAvailable && health.networkOk) return 'D';
      return 'B';
    }
    return 'B';
  }

  function executePlan(plan, targetVersion, onProgress, opts) {
    var TU = global.CrozzoTauriUpdater;
    opts = opts || {};
    switch (plan) {
      case 'A':
        return TU.installLatest({ targetVersion: targetVersion, onProgress: onProgress,
          automaticOnly: opts.automaticOnly !== false, preferSilentSetup: false, skipReleaseWait: true });
      case 'C':
        return TU.installViaSilentSetup(targetVersion, onProgress, 0)
          .then(function () { return { installed: true, plan: 'C', exiting: true }; });
      case 'D':
        return TU.installViaSilentDmg(targetVersion, onProgress, 0)
          .then(function () { return { installed: true, plan: 'D', exiting: true }; });
      case 'apk_inapp':
        return TU.installApkAutomatic({ targetVersion: targetVersion, onProgress: onProgress, forceInstall: !!opts.forceInstall });
      case 'apk_download':
        return applyAndroidManualDownload(targetVersion, onProgress);
      case 'web_reload':
        return applyWebClientUpdate(targetVersion, onProgress);
      case 'B':
        return resolvePlanB(targetVersion).then(function (pb) {
          // No instala automáticamente: deja la URL lista para el usuario.
          return { installed: false, plan: 'B', downloadUrl: pb.url, releasePageUrl: pb.releasePageUrl, needsManualInstall: true };
        });
      default:
        return Promise.reject(new Error('Plan desconocido: ' + plan));
    }
  }

  function run(targetVersion, onProgress, opts) {
    opts = opts || {};
    var profile = getUpdateClientProfile();
    var chain = FALLBACK_CHAINS[profile.kind === 'windows' ? 'windows' : profile.kind === 'mac' ? 'mac' : profile.isAndroid ? 'android' : 'web'] || ['B'];
    // Preferir plan inicial según salud
    var health = readPlanHealth(profile, targetVersion);
    var initial = selectInitialPlan(profile, health);
    // Reordenar cadena para empezar por el plan inicial
    var ordered = [initial].concat(chain.filter(function (p) { return p !== initial; }));
    // Dedup
    var seen = {};
    ordered = ordered.filter(function (p) { if (seen[p]) return false; seen[p] = true; return true; });

    var lastError = null;
    function tryNext(i) {
      if (i >= ordered.length) {
        // Garantizar Plan B disponible
        return resolvePlanB(targetVersion).then(function (pb) {
          return { installed: false, plan: 'B', downloadUrl: pb.url, releasePageUrl: pb.releasePageUrl, needsManualInstall: true, lastError: lastError };
        });
      }
      var plan = ordered[i];
      return executePlan(plan, targetVersion, onProgress, opts)
        .then(function (res) {
          if (res && (res.installed || res.upToDate || res.awaitingSystemConfirm || res.needsManualInstall)) {
            writePlanHealth(profile, targetVersion, plan, true);
            return res;
          }
          // Plan "no-op" → siguiente
          return tryNext(i + 1);
        })
        .catch(function (err) {
          lastError = err;
          writePlanHealth(profile, targetVersion, plan, false, err);
          // Marcar plan como no disponible para esta sesión
          markPlanUnavailable(plan, targetVersion);
          return tryNext(i + 1);
        });
    }
    return tryNext(0);
  }

  global.CrozzoUpdatePlanRouter = { selectInitialPlan: selectInitialPlan, executePlan: executePlan, run: run };
})(window);
```

### 8.2 Refuerzo de Plan C en Rust (resumen de cambios)

Ver sección 5.2. Los cambios clave:
- Parámetro `expected_sha256: Option<String>`.
- `TempFileGuard` con `Drop`.
- Captura de exit code del instalador en el `.cmd`.
- Canal de progreso `Channel<ProgressEvent>`.
- Flag de cancelación `Arc<AtomicBool>`.
- Pre-flight de espacio en disco.
- `xattr` de quarantine en macOS.

### 8.3 Plan B garantizado (JS)

```js
function resolvePlanB(targetVersion) {
  var ver = normVersion(targetVersion || VERSION_AVAIL || VERSION);
  // 1. Caché
  var cached = readPlanBCache(ver);
  if (cached && cached.url && (Date.now() - cached.at < 7*24*3600000)) {
    _planB = cached; return Promise.resolve(cached);
  }
  var TU = global.CrozzoTauriUpdater;
  var resolveFn = TU && (TU.resolveBestDownloadUrl || TU.resolveBestApkUrl || TU.resolveBestSetupUrl || TU.resolveManualFallback);
  if (!resolveFn) {
    var fallback = { version: ver, url: (TU && TU.releasesLatestUrl) || GITHUB_RELEASES_LATEST,
      releasePageUrl: (TU && TU.releasesPageUrl) || GITHUB_RELEASES_LATEST, ready: true, degraded: true, at: Date.now() };
    _planB = fallback; writePlanBCache(ver, fallback); return Promise.resolve(fallback);
  }
  return resolveFn(ver).then(function (info) {
    var url = info && info.downloadUrl;
    if (!url) url = (TU && (TU.predictSetupExeUrl || TU.predictApkUrl)) ? (TU.predictSetupExeUrl && TU.predictSetupExeUrl(ver)) : '';
    if (!url) url = GITHUB_RELEASES_LATEST;
    var pb = { version: info && info.version || ver, url: url,
      releasePageUrl: (info && info.releasePageUrl) || GITHUB_RELEASES_LATEST,
      ready: true, verified: !!(info && info.verified), at: Date.now() };
    _planB = pb; writePlanBCache(ver, pb); return pb;
  }).catch(function () {
    var pb = { version: ver, url: GITHUB_RELEASES_LATEST, releasePageUrl: GITHUB_RELEASES_LATEST, ready: true, degraded: true, at: Date.now() };
    _planB = pb; writePlanBCache(ver, pb); return pb;
  });
}
```

### 8.4 Health probe (JS)

```js
function probeSystemHealth(targetVersion) {
  var TU = global.CrozzoTauriUpdater;
  var profile = getUpdateClientProfile();
  var health = { networkOk: false, updaterAvailable: false, silentInstallerAvailable: false,
    releaseHasSignature: false, diskOk: true, permissionsOk: true };
  // Red
  var netP = TU && TU.httpHead ? TU.httpHead('https://raw.githubusercontent.com/kenny14ramirez-prog/Principal/main/releases/latest.json')
    .then(function (r) { health.networkOk = !!(r && r.ok); }) : Promise.resolve();
  // Updater
  var upP = (TU && TU.check) ? TU.check({ timeout: 5000 }).then(function (m) {
    health.updaterAvailable = true; health.releaseHasSignature = !!(m && m.rid != null);
  }).catch(function () { health.updaterAvailable = false; }) : Promise.resolve();
  // Silencioso
  var silP = (TU && TU.probePlatformInstaller) ? TU.probePlatformInstaller().then(function (p) {
    health.silentInstallerAvailable = !!(p && p.ok);
  }).catch(function () { health.silentInstallerAvailable = false; }) : Promise.resolve();
  // Asset disponible
  var assetP = (TU && TU.resolveReleaseInstallTarget) ? TU.resolveReleaseInstallTarget(targetVersion).then(function (hit) {
    health.assetAvailable = !!(hit && hit.url);
  }).catch(function () { health.assetAvailable = false; }) : Promise.resolve();
  return Promise.all([netP, upP, silP, assetP]).then(function () { return health; });
}
```

---

## 9. Hoja de ruta de implementación

### Fase 1 — Confiabilidad inmediata (1-2 sprints)
1. Pre-calentar `_planB` al arrancar para `VERSION_AVAIL`.
2. Garantizar que Plan B siempre tenga URL (página de releases como último recurso).
3. Hacer que cualquier fallo de Plan C/A caiga a Plan B automáticamente (no solo mostrar botón).
4. Verificación post-instalación: si `VERSION < target` tras Plan C, marcar failed y ofrecer B.

### Fase 2 — Refuerzo de Plan C (2-3 sprints)
1. Hash SHA-256 en Rust + verificación.
2. `TempFileGuard` para limpieza.
3. Captura de exit code del instalador + archivo de resultado.
4. Canal de progreso real.
5. Pre-flight de espacio en disco.
6. Cancelación.
7. Quarantine removal en macOS.

### Fase 3 — Orquestador unificado (1-2 sprints)
1. Implementar `PlanRouter` con cadenas de fallback.
2. `selectInitialPlan` basado en health probe.
3. Persistencia de salud por plan/versión.
4. Unificar entry points (`installAutomatic` y `installLatestBinary` usan el router).

### Fase 4 — Observabilidad y recuperación (1 sprint)
1. Códigos de error detallados por plan.
2. Telemetría local (log de qué plan se usó y por qué).
3. Rollback manual desde la UI (reinstalar versión anterior).
4. Mirrors para metadata.

---

## 10. Matriz de riesgos del subsistema de planes

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Plan C falla silenciosamente (falso éxito) | Media | Alto | Captura de exit code + verificación post-install |
| Plan B sin URL disponible | Media | Alto | Pre-calentamiento + página de releases como fallback |
| Firma mismatch bloquea todo | Baja | Alto | Plan C no depende de firma Tauri; Plan B siempre disponible |
| Instalador corrupto ejecutado | Baja | Crítico | Hash SHA-256 + magic bytes + tamaño mínimo |
| App no se reabre tras Plan C | Media | Alto | Script `.cmd` robusto + watchdog + relaunch fallback |
| Doble descarga concurrente | Media | Medio | Lease compartido (ver informe de infraestructura) |
| Versión no avanza tras instalar | Media | Medio | `markEntryFullyApplied` con verificación de binario |
| Antivirus bloquea instalador | Baja | Alto | Mensaje claro + Plan B manual |
| Disco lleno | Baja | Alto | Pre-flight + propagación de ENOSPC |
| Red caída durante Plan C | Media | Medio | Retry 3× en Rust + fallback a B |

---

## 11. Conclusiones

El sistema de planes de Bona Origen es **funcionalmente completo** pero **arquitectónicamente implícito**. Las recomendaciones prioritarias son:

1. **Unificar la decisión de plan** en un solo router con cadenas de fallback explícitas.
2. **Reforzar Plan C** con verificación de hash, limpieza garantizada, captura de exit code y progreso real.
3. **Garantizar Plan B** como último recurso: pre-calentado, con URL siempre resoluble (página de releases como fallback mínimo).
4. **Detectar el plan automáticamente** mediante health probes (red, updater, instalador silencioso, espacio, permisos).
5. **Verificar post-instalación** que la versión realmente avanzó; si no, ofrecer Plan B.

Estas mejoras convierten el sistema actual (que ya tiene los bloques) en un sistema **resiliente de grado producción**, comparable a Chrome/Firefox/VS Code en robustez de fallback, adaptado al contexto de un POS de tienda (red inestable, múltiples dispositivos, usuarios no técnicos).

---

*Análisis generado para el subsistema de planes A/B/C de Bona Origen.*
