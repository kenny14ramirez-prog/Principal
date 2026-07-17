//! Wi‑Fi Direct / P2P — stub nativo + status para el puente JS.
//! En Android: marca supported (GO nativo evolutivo). En desktop: relay HTTP en JS.

use serde_json::json;

#[tauri::command]
pub fn crozzo_wifi_direct_status() -> Result<serde_json::Value, String> {
    #[cfg(target_os = "android")]
    {
        Ok(json!({
            "ok": true,
            "supported": true,
            "mode": "android_pending_native_go",
            "peers": [],
            "note": "P2P: JS http_peer_relay activo; WifiP2p GO nativo en evolución"
        }))
    }
    #[cfg(not(target_os = "android"))]
    {
        Ok(json!({
            "ok": false,
            "supported": false,
            "mode": "http_peer_relay",
            "peers": [],
            "note": "Desktop: supervivencia vía peers LAN / hotspot; Wi‑Fi Direct es APK"
        }))
    }
}

#[tauri::command]
pub fn crozzo_wifi_direct_start(location_id: Option<String>) -> Result<serde_json::Value, String> {
    let loc = location_id.unwrap_or_default();
    #[cfg(target_os = "android")]
    {
        Ok(json!({
            "ok": true,
            "started": true,
            "locationId": loc,
            "mode": "android_pending_native_go",
            "note": "Relay P2P JS activo; native WifiP2p pendiente"
        }))
    }
    #[cfg(not(target_os = "android"))]
    {
        Ok(json!({
            "ok": true,
            "started": false,
            "locationId": loc,
            "mode": "http_peer_relay",
            "note": "Sin WifiP2p en desktop; CrozzoWifiDirectBridge usa peers HTTP"
        }))
    }
}
