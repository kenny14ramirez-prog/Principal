//! Bluetooth LE: detección de adaptador y escaneo básico.
//!
//! Implementación real con btleplug cuando la feature `ble-btleplug` está
//! habilitada (por defecto en desktop). En caso contrario, o si no hay
//! adaptador, se reporta como no disponible sin romper el sistema.
//!
//! # Mobile (Android/iOS)
//!
//! Investigación de crates.io (2026-11) sobre plugins BLE para Tauri 2:
//!
//! - `tauri-plugin-ble` (v0.1.2): sin mantenimiento reciente, README no carga,
//!   plugin móvil basado en código nativo opaco. **No recomendado.**
//! - `tauri-plugin-blec` (v0.18.0): cliente BLE cross-platform basado en
//!   `btleplug`, con backend Android/iOS propio y permisos nativos. Es la
//!   opción viable para "BLE real" en mobile, pero su integración requiere:
//!   dependencia por target móvil, registro del plugin en `lib.rs`,
//!   capabilities `blec:default`, entradas `NSBluetoothAlwaysUsageDescription`
//!   (iOS) y verificación con NDK/Xcode. **Diferida** para no romper el build
//!   estable ni el comportamiento desktop.
//! - `tauri-plugin-blew` (v0.5.x, beta): sobre `blew`, licencia AGPL-3.0,
//!   API en evolución. **No recomendado** por licencia y madurez.
//!
//! Decisión actual: en mobile BLE se reporta como no disponible (stub) y el
//! sistema degrada al transporte de fallback: gossip UDP / Wi-Fi (ver
//! `crozzo_gossip_udp` y `crozzo_wifi_direct`). La UI puede llamar a
//! `crozzo_ble_request_permissions` sin fallar; en mobile devuelve
//! `granted: false` con motivo `mobile_ble_not_available` y la lista de
//! fallbacks. Cuando se integre `tauri-plugin-blec`, este stub se reemplaza
//! por la llamada real sin cambiar la firma del comando.

#[cfg(all(feature = "ble-btleplug", not(any(target_os = "android", target_os = "ios"))))]
use btleplug::api::{Central, Manager as _, Peripheral as _};
#[cfg(all(feature = "ble-btleplug", not(any(target_os = "android", target_os = "ios"))))]
use btleplug::platform::Manager;

#[tauri::command]
pub async fn crozzo_ble_available() -> bool {
    #[cfg(all(feature = "ble-btleplug", not(any(target_os = "android", target_os = "ios"))))]
    {
        if let Ok(manager) = Manager::new().await {
            if let Ok(adapters) = manager.adapters().await {
                return !adapters.is_empty();
            }
        }
        false
    }
    #[cfg(not(all(feature = "ble-btleplug", not(any(target_os = "android", target_os = "ios")))))]
    {
        // Mobile / sin btleplug: no hay plugin BLE nativo disponible todavía.
        false
    }
}

#[tauri::command]
pub async fn crozzo_ble_status() -> serde_json::Value {
    let available = crozzo_ble_available().await;
    if !available {
        let (reason, note) = if cfg!(any(target_os = "android", target_os = "ios")) {
            (
                "mobile_ble_not_available",
                "BLE nativo en mobile pendiente: no hay plugin Tauri BLE instalado. Se usa gossip UDP/Wi-Fi como fallback.",
            )
        } else if cfg!(feature = "ble-btleplug") {
            ("no_adapter_or_btleplug", "Adaptador BLE no detectado o btleplug sin adaptador.")
        } else {
            ("btleplug_not_enabled", "Feature ble-btleplug deshabilitada en este build.")
        };
        let fallback = if cfg!(any(target_os = "android", target_os = "ios")) {
            serde_json::json!(["gossip_udp", "wifi"])
        } else {
            serde_json::json!([])
        };
        return serde_json::json!({
            "available": false,
            "state": "not_available",
            "reason": reason,
            "note": note,
            "platform": if cfg!(any(target_os = "android", target_os = "ios")) { "mobile" } else { "desktop" },
            "fallback": fallback
        });
    }
    serde_json::json!({
        "available": true,
        "state": "ready",
        "backend": "btleplug"
    })
}

/// Solicita permisos BLE al sistema operativo.
///
/// En desktop no se requieren permisos especiales para el escaneo básico, por
/// lo que devuelve `granted: true`. En mobile (Android/iOS) BLE nativo aún no
/// está disponible (no hay plugin Tauri BLE integrado), así que devuelve
/// `granted: false` con el motivo `mobile_ble_not_available` y la UI debe
/// degradar a gossip UDP/Wi-Fi.
#[tauri::command]
pub async fn crozzo_ble_request_permissions() -> serde_json::Value {
    if cfg!(any(target_os = "android", target_os = "ios")) {
        serde_json::json!({
            "granted": false,
            "state": "not_available",
            "reason": "mobile_ble_not_available",
            "note": "BLE nativo en mobile pendiente: no hay plugin Tauri BLE instalado. Se usa gossip UDP/Wi-Fi como fallback.",
            "platform": "mobile",
            "fallback": ["gossip_udp", "wifi"]
        })
    } else {
        serde_json::json!({
            "granted": true,
            "state": "not_required",
            "reason": "desktop_permissions_not_required",
            "note": "En desktop btleplug no requiere permisos explícitos para escaneo básico.",
            "platform": "desktop",
            "fallback": []
        })
    }
}

#[tauri::command]
pub async fn crozzo_ble_scan(seconds: Option<u64>) -> Result<Vec<serde_json::Value>, String> {
    #[cfg(all(feature = "ble-btleplug", not(any(target_os = "android", target_os = "ios"))))]
    {
        use btleplug::api::ScanFilter;

        let manager = Manager::new().await.map_err(|e| e.to_string())?;
        let adapters = manager.adapters().await.map_err(|e| e.to_string())?;
        let adapter = adapters.into_iter().next().ok_or_else(|| "no_adapter".to_string())?;

        adapter
            .start_scan(ScanFilter::default())
            .await
            .map_err(|e| e.to_string())?;

        let dur = seconds.unwrap_or(5).clamp(1, 15);
        tokio::time::sleep(tokio::time::Duration::from_secs(dur)).await;

        let _ = adapter.stop_scan().await;

        let peripherals = adapter.peripherals().await.map_err(|e| e.to_string())?;
        let mut out = Vec::with_capacity(peripherals.len());
        for p in peripherals {
            let props = p.properties().await.ok().flatten();
            let name = props.as_ref().and_then(|x| x.local_name.clone());
            let rssi = props.as_ref().and_then(|x| x.rssi);
            out.push(serde_json::json!({
                "id": p.id().to_string(),
                "address": p.address().to_string(),
                "name": name,
                "rssi": rssi,
            }));
        }
        Ok(out)
    }
    #[cfg(not(all(feature = "ble-btleplug", not(any(target_os = "android", target_os = "ios")))))]
    {
        let _ = seconds;
        if cfg!(any(target_os = "android", target_os = "ios")) {
            Err("mobile_ble_not_available: BLE nativo pendiente; no hay plugin Tauri BLE. Fallback gossip UDP/Wi-Fi.".to_string())
        } else {
            Err("btleplug_not_enabled".to_string())
        }
    }
}