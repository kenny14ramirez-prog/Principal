# RUNBOOK — P0-16 Hotspot Android (implementación nativa)

**Estado:** Plan detallado. Implementación pendiente de entorno Android (SDK/NDK/Gradle).
**Prioridad:** F7-T05 (gateway/lease). Bloqueo actual: no hay Android SDK en la estación de desarrollo.

## Objetivo

Reemplazar el stub honesto `hotspot_guiado_manual_en_esta_plataforma` en Android por una implementación nativa usando `WifiManager.startLocalOnlyHotspot()`, expuesta a Rust/JS vía plugin Tauri v2, con ACL de clientes y límite configurable.

## Arquitectura (Tauri v2)

```
JS (app/infra/CrozzoConnectivityOrchestrator o CrozzoPosMain)
  -> window.__TAURI__.core.invoke('crozzo_hotspot_start')
  -> Rust command (cfg android) -> plugin invoke
  -> Kotlin plugin (WifiManager LocalOnlyHotspot)
  -> callback con SSID/passphrase/IP
```

## Pasos de implementación

### 1. Crear plugin Android (Kotlin)
Ubicación: `src-tauri/gen/android/...` o plugin separado `tauri-plugin-crozzo-hotspot`.

Archivo `HotspotPlugin.kt`:
```kotlin
package com.crozzo.hotspot

import android.content.Context
import android.net.wifi.WifiManager
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import app.tauri.plugin.Invoke

class HotspotPlugin(private val activity: android.app.Activity) : Plugin(activity) {
    private var hotspotCallback: WifiManager.LocalOnlyHotspotReservation? = null

    @Command
    fun start(invoke: Invoke) {
        val wifiManager = activity.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
        wifiManager.startLocalOnlyHotspot(object : WifiManager.LocalOnlyHotspotCallback() {
            override fun onStarted(reservation: WifiManager.LocalOnlyHotspotReservation) {
                hotspotCallback = reservation
                val config = reservation.wifiConfiguration
                val ret = JSObject()
                ret.put("ok", true)
                ret.put("ssid", config?.SSID ?: "")
                ret.put("passphrase", config?.preSharedKey ?: "")
                ret.put("status", "Success")
                invoke.resolve(ret)
            }
            override fun onStopped() {
                hotspotCallback = null
            }
            override fun onFailed(reason: Int) {
                val ret = JSObject()
                ret.put("ok", false)
                ret.put("status", "Failed_$reason")
                invoke.reject(ret.toString())
            }
        }, null)
    }

    @Command
    fun stop(invoke: Invoke) {
        hotspotCallback?.close()
        hotspotCallback = null
        val ret = JSObject()
        ret.put("ok", true)
        ret.put("status", "Stopped")
        invoke.resolve(ret)
    }

    @Command
    fun status(invoke: Invoke) {
        val ret = JSObject()
        ret.put("on", hotspotCallback != null)
        ret.put("state", if (hotspotCallback != null) "On" else "Off")
        ret.put("ssid", "")
        invoke.resolve(ret)
    }
}
```

### 2. Permisos Android (AndroidManifest.xml)
```xml
<uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
<uses-permission android:name="android.permission.CHANGE_WIFI_STATE" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<!-- Android 13+ -->
<uses-permission android:name="android.permission.NEARBY_WIFI_DEVICES" android:usesPermissionFlags="neverForLocation" />
```

### 3. Rust side (cfg android)
En `crozzo_hotspot.rs`, reemplazar el stub Android por delegación al plugin:
```rust
#[cfg(target_os = "android")]
#[tauri::command]
pub async fn crozzo_hotspot_start(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    app.run_mobile_plugin("HotspotPlugin", "start", serde_json::json!({}))
        .map_err(|e| e.to_string())
}
// idem stop/status
```
(Verificar API exacta de `run_mobile_plugin` en Tauri v2.)

### 4. Capability
Añadir `allow-crozzo-hotspot` en `permissions/crozzo-commands.toml` y `default.json`/`mobile.json`.

### 5. Frontend
Ya llama `crozzo_hotspot_start` y muestra toast guiado. Solo cambiar el mensaje de error a "hotspot nativo disponible" cuando ok=true. Mantener fallback guiado si falla.

### 6. Build & verificación
- Requiere Android SDK + NDK + Gradle.
- `cargo tauri android build` o `cargo tauri android dev`.
- Probar en emulador con Wi-Fi (LocalOnlyHotspot requiere dispositivo/emulador con Wi-Fi).
- Evidencia en `docs/maps/ops/evidencia/P0-16/`: captura de SSID/passphrase, conexión de tablet, ping.

## Riesgos
- LocalOnlyHotspot no da internet al cliente (solo LAN local). Aceptable: es respaldo para operación LAN.
- Límite de clientes: Android impone ~10-16 clientes en LocalOnlyHotspot. Para 100 dispositivos se requiere router, no hotspot.
- Permisos de ubicación en Android 10-12 (NEARBY_WIFI_DEVICES en 13+).

## Estado
- Stubs honestos ya en producción (no crash, mensaje guiado).
- Implementación nativa bloqueada por ausencia de SDK Android en esta estación.
- Código Rust host compila (cargo check EXIT 0).

## Siguiente acción
Provisionar estación con Android Studio + NDK y ejecutar pasos 1-6. O delegar a agente con entorno Android.
