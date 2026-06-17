//! Puente malla BLE — cola JSON + relay UDP en escritorio (Windows/macOS/Linux).
//! Android/iOS: cola nativa para GATT/BLE (plugin futuro).

use crate::crozzo_gossip_udp;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_QUEUE: usize = 256;
const MAX_PEERS: usize = 120;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CrozzoBleMeshStatus {
    pub running: bool,
    pub device_id: String,
    pub peer_count: usize,
    pub queue_depth: usize,
    pub transport: String,
    pub native_ble: bool,
    pub platform: String,
    pub desktop: bool,
}

struct Inner {
    device_id: String,
    running: bool,
    rx_queue: Vec<String>,
    peers: HashMap<String, u64>,
}

fn shared() -> &'static Arc<Mutex<Inner>> {
    static STATE: OnceLock<Arc<Mutex<Inner>>> = OnceLock::new();
    STATE.get_or_init(|| {
        Arc::new(Mutex::new(Inner {
            device_id: String::new(),
            running: false,
            rx_queue: Vec::new(),
            peers: HashMap::new(),
        }))
    })
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn is_desktop() -> bool {
    !cfg!(any(target_os = "android", target_os = "ios"))
}

fn platform_label() -> String {
    if cfg!(target_os = "windows") {
        "windows".to_string()
    } else if cfg!(target_os = "macos") {
        "macos".to_string()
    } else if cfg!(target_os = "linux") {
        "linux".to_string()
    } else if cfg!(target_os = "android") {
        "android".to_string()
    } else if cfg!(target_os = "ios") {
        "ios".to_string()
    } else {
        "unknown".to_string()
    }
}

fn desktop_transport() -> String {
    if cfg!(target_os = "windows") {
        "win-udp-mesh".to_string()
    } else {
        "desktop-udp-mesh".to_string()
    }
}

fn touch_peer(inner: &mut Inner, device_id: &str) {
    if device_id.is_empty() || device_id == inner.device_id {
        return;
    }
    inner.peers.insert(device_id.to_string(), now_ms());
    if inner.peers.len() > MAX_PEERS {
        let cutoff = now_ms().saturating_sub(180_000);
        inner.peers.retain(|_, t| *t >= cutoff);
    }
}

fn extract_device_id(json: &str) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(json).ok()?;
    v.get("deviceId")
        .or_else(|| v.get("device_id"))
        .and_then(|x| x.as_str())
        .map(|s| s.to_string())
}

fn status_locked(inner: &Inner) -> CrozzoBleMeshStatus {
    let cutoff = now_ms().saturating_sub(120_000);
    let mut peer_count = inner.peers.values().filter(|t| **t >= cutoff).count();
    if is_desktop() {
        if let Ok(n) = crozzo_gossip_udp::peer_count_active() {
            peer_count = peer_count.max(n);
        }
    }
    let (transport, native_ble) = if is_desktop() {
        (desktop_transport(), false)
    } else {
        ("native-queue".to_string(), true)
    };
    CrozzoBleMeshStatus {
        running: inner.running,
        device_id: inner.device_id.clone(),
        peer_count,
        queue_depth: inner.rx_queue.len(),
        transport,
        native_ble,
        platform: platform_label(),
        desktop: is_desktop(),
    }
}

#[tauri::command]
pub fn crozzo_ble_mesh_start(device_id: String) -> Result<CrozzoBleMeshStatus, String> {
    let did = device_id.trim().to_string();
    if did.is_empty() {
        return Err("device_id vacío".into());
    }
    if is_desktop() {
        crozzo_gossip_udp::ensure_started(&did)?;
    }
    let mut inner = shared().lock().map_err(|e| e.to_string())?;
    inner.device_id = did;
    inner.running = true;
    Ok(status_locked(&inner))
}

#[tauri::command]
pub fn crozzo_ble_mesh_stop() -> Result<CrozzoBleMeshStatus, String> {
    let mut inner = shared().lock().map_err(|e| e.to_string())?;
    inner.running = false;
    inner.rx_queue.clear();
    Ok(status_locked(&inner))
}

#[tauri::command]
pub fn crozzo_ble_mesh_send(json: String) -> Result<(), String> {
    let body = json.trim();
    if body.is_empty() {
        return Err("payload vacío".into());
    }
    let mut inner = shared().lock().map_err(|e| e.to_string())?;
    if !inner.running {
        return Err("malla BLE no iniciada".into());
    }
    if let Some(did) = extract_device_id(body) {
        touch_peer(&mut inner, &did);
    }
    drop(inner);
    if is_desktop() {
        return crozzo_gossip_udp::send_json(body);
    }
    Ok(())
}

#[tauri::command]
pub fn crozzo_ble_mesh_drain() -> Result<Vec<String>, String> {
    let mut out = Vec::new();
    if is_desktop() {
        if let Ok(rows) = crozzo_gossip_udp::drain_rx() {
            out.extend(rows);
        }
    }
    let mut inner = shared().lock().map_err(|_| string_from_poison())?;
    if !inner.rx_queue.is_empty() {
        out.extend(inner.rx_queue.clone());
        inner.rx_queue.clear();
    }
    Ok(out)
}

fn string_from_poison() -> String {
    "lock poisoned".to_string()
}

/// Entrada para plugin nativo Android/iOS (futuro): inyecta tramas recibidas por GATT.
pub fn native_push_rx(json: String) {
    if let Ok(mut inner) = shared().lock() {
        if !inner.running {
            return;
        }
        if let Some(did) = extract_device_id(&json) {
            touch_peer(&mut inner, &did);
        }
        if inner.rx_queue.len() >= MAX_QUEUE {
            inner.rx_queue.remove(0);
        }
        inner.rx_queue.push(json);
    }
}

#[tauri::command]
pub fn crozzo_ble_mesh_status() -> Result<CrozzoBleMeshStatus, String> {
    let inner = shared().lock().map_err(|e| e.to_string())?;
    Ok(status_locked(&inner))
}

#[tauri::command]
pub fn crozzo_ble_mesh_request_enable() -> Result<serde_json::Value, String> {
    if is_desktop() {
        return Ok(serde_json::json!({
            "ok": true,
            "transport": desktop_transport(),
            "platform": platform_label(),
            "note": "PC unida a la malla UDP (Wi‑Fi/Ethernet). Bluetooth Web opcional en Edge."
        }));
    }
    Ok(serde_json::json!({
        "ok": true,
        "transport": "native-queue",
        "platform": platform_label(),
        "note": "Active Bluetooth en Ajustes. Web Bluetooth complementa en Chrome/Android."
    }))
}
