//! Servidor HTTP LAN para sincronización multidispositivo (Rol A / caja Windows).
//! Expone GET /health, GET /status y POST /api/{sync,orders,sales,invoices}.

use crate::crozzo_lan_ws;
use crate::crozzo_mdns;
use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::Duration;

const DEFAULT_PORT: u16 = 3000;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrozzoLanSyncStatus {
    pub running: bool,
    pub port: u16,
    pub pending_count: usize,
    pub location_id: String,
    pub device_id: String,
    pub business_id: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrozzoLanSyncSubmission {
    pub id: String,
    pub received_at: String,
    pub endpoint: String,
    #[serde(flatten)]
    pub payload: serde_json::Value,
}

#[derive(Clone)]
struct ServerMeta {
    location_id: String,
    device_id: String,
    business_id: String,
}

#[derive(Clone, Serialize, Deserialize)]
struct P2pSignalMsg {
    id: String,
    at_ms: String,
    from: String,
    to: String,
    #[serde(flatten)]
    body: serde_json::Value,
}

struct ServerInner {
    port: u16,
    meta: ServerMeta,
    pending: Vec<CrozzoLanSyncSubmission>,
    runtime_snapshot: Option<serde_json::Value>,
    runtime_saved_at: String,
    p2p_signals: Vec<P2pSignalMsg>,
    stop: bool,
}

fn shared_state() -> &'static Arc<Mutex<Option<ServerInner>>> {
    static STATE: OnceLock<Arc<Mutex<Option<ServerInner>>>> = OnceLock::new();
    STATE.get_or_init(|| Arc::new(Mutex::new(None)))
}

fn server_thread() -> &'static Mutex<Option<thread::JoinHandle<()>>> {
    static HANDLE: OnceLock<Mutex<Option<thread::JoinHandle<()>>>> = OnceLock::new();
    HANDLE.get_or_init(|| Mutex::new(None))
}

fn now_ms() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis().to_string())
        .unwrap_or_else(|_| "0".into())
}

fn write_http_response(
    stream: &mut std::net::TcpStream,
    status: u16,
    status_text: &str,
    content_type: &str,
    body: &[u8],
) -> std::io::Result<()> {
    let headers = format!(
        "HTTP/1.1 {} {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nConnection: close\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: Content-Type, Accept\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\n\r\n",
        status, status_text, content_type, body.len()
    );
    stream.write_all(headers.as_bytes())?;
    stream.write_all(body)?;
    stream.flush()
}

fn parse_request(buf: &[u8]) -> Option<(String, String, String)> {
    let text = String::from_utf8_lossy(buf);
    let mut lines = text.split("\r\n");
    let first = lines.next()?;
    let mut parts = first.split_whitespace();
    let method = parts.next()?.to_string();
    let path = parts.next()?.to_string();
    for line in lines.by_ref() {
        if line.is_empty() {
            break;
        }
    }
    let body_start = text.find("\r\n\r\n").map(|i| i + 4).unwrap_or(text.len());
    let body = text[body_start..].to_string();
    Some((method, path, body))
}

fn normalize_api_path(path: &str) -> Option<String> {
    let p = path.split('?').next().unwrap_or(path);
    match p {
        "/api/sync" | "/api/orders" | "/api/sales" | "/api/invoices" => Some(p.to_string()),
        _ => None,
    }
}

fn prune_old_signals(signals: &mut Vec<P2pSignalMsg>) {
    let cutoff = now_ms().parse::<u128>().unwrap_or(0).saturating_sub(300_000);
    signals.retain(|s| s.at_ms.parse::<u128>().unwrap_or(0) >= cutoff);
}

fn query_param(path: &str, key: &str) -> Option<String> {
    let q = path.split('?').nth(1)?;
    for pair in q.split('&') {
        let mut kv = pair.splitn(2, '=');
        if kv.next()? == key {
            return kv.next().map(|v| v.to_string());
        }
    }
    None
}

fn mesh_ping_json(meta: &ServerMeta, port: u16) -> Vec<u8> {
    let resp = serde_json::json!({
        "ok": true,
        "device_id": meta.device_id,
        "location_id": meta.location_id,
        "business_id": meta.business_id,
        "role": "A",
        "port": port,
        "timestamp": now_ms(),
        "service": "crozzo-lan-sync"
    });
    serde_json::to_vec(&resp).unwrap_or_else(|_| b"{\"ok\":true}".to_vec())
}

fn handle_connection(mut stream: std::net::TcpStream, state: Arc<Mutex<Option<ServerInner>>>) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(8)));
    let mut buf = vec![0u8; 65536];
    let n = match stream.read(&mut buf) {
        Ok(0) | Err(_) => return,
        Ok(n) => n,
    };
    let (method, path, body) = match parse_request(&buf[..n]) {
        Some(v) => v,
        None => return,
    };

    if method == "OPTIONS" {
        let _ = write_http_response(&mut stream, 204, "No Content", "text/plain", b"");
        return;
    }

    let (meta, port) = {
        let guard = state.lock().unwrap();
        match guard.as_ref() {
            Some(s) => (s.meta.clone(), s.port),
            None => {
                let msg = b"{\"ok\":false,\"error\":\"server_stopped\"}";
                let _ = write_http_response(
                    &mut stream,
                    503,
                    "Service Unavailable",
                    "application/json",
                    msg,
                );
                return;
            }
        }
    };

    if method == "GET" && (path == "/health" || path == "/health/") {
        let msg = b"{\"ok\":true,\"service\":\"crozzo-lan-sync\"}";
        let _ = write_http_response(&mut stream, 200, "OK", "application/json", msg);
        return;
    }

    if method == "GET" && (path == "/status" || path == "/status/") {
        let resp = serde_json::json!({
            "ok": true,
            "role": "A",
            "is_active_server": true,
            "location_id": meta.location_id,
            "device_id": meta.device_id,
            "business_id": meta.business_id,
            "service": "crozzo-lan-sync",
            "port": port
        });
        let bytes = serde_json::to_vec(&resp).unwrap_or_else(|_| b"{\"ok\":true}".to_vec());
        let _ = write_http_response(&mut stream, 200, "OK", "application/json", &bytes);
        return;
    }

    if method == "GET"
        && (path == "/mesh-ping"
            || path == "/mesh-ping/"
            || path == "/mesh-ping.json"
            || path == "/mesh-ping.json/")
    {
        let bytes = mesh_ping_json(&meta, port);
        let _ = write_http_response(&mut stream, 200, "OK", "application/json", &bytes);
        return;
    }

    if method == "GET" && (path == "/api/p2p/signal" || path.starts_with("/api/p2p/signal?")) {
        let for_dev = query_param(&path, "for").unwrap_or_default();
        let since = query_param(&path, "since")
            .and_then(|s| s.parse::<u128>().ok())
            .unwrap_or(0);
        let mut out: Vec<P2pSignalMsg> = Vec::new();
        {
            let mut guard = state.lock().unwrap();
            if let Some(inner) = guard.as_mut() {
                prune_old_signals(&mut inner.p2p_signals);
                for sig in inner.p2p_signals.iter() {
                    let at = sig.at_ms.parse::<u128>().unwrap_or(0);
                    if at < since {
                        continue;
                    }
                    let include = if for_dev.is_empty() {
                        true
                    } else if for_dev == "central" {
                        sig.to == "central"
                    } else {
                        sig.to == for_dev
                    };
                    if include {
                        out.push(sig.clone());
                    }
                }
            }
        }
        let resp = serde_json::json!({ "ok": true, "signals": out });
        let bytes = serde_json::to_vec(&resp).unwrap_or_else(|_| b"{\"ok\":true,\"signals\":[]}".to_vec());
        let _ = write_http_response(&mut stream, 200, "OK", "application/json", &bytes);
        return;
    }

    if method == "GET" && (path == "/api/runtime" || path.starts_with("/api/runtime?")) {
        let (snap, saved) = {
            let guard = state.lock().unwrap();
            match guard.as_ref() {
                Some(inner) => (inner.runtime_snapshot.clone(), inner.runtime_saved_at.clone()),
                None => (None, String::new()),
            }
        };
        let resp = serde_json::json!({
            "ok": snap.is_some(),
            "payload": snap,
            "saved_at": saved
        });
        let bytes = serde_json::to_vec(&resp).unwrap_or_else(|_| b"{\"ok\":false}".to_vec());
        let _ = write_http_response(&mut stream, 200, "OK", "application/json", &bytes);
        return;
    }

    if method == "POST" && (path == "/api/p2p/signal" || path == "/api/p2p/signal/") {
        let payload: serde_json::Value = match serde_json::from_str(&body) {
            Ok(v) => v,
            Err(_) => {
                let msg = b"{\"ok\":false,\"error\":\"invalid_json\"}";
                let _ = write_http_response(
                    &mut stream,
                    400,
                    "Bad Request",
                    "application/json",
                    msg,
                );
                return;
            }
        };
        let from = payload
            .get("from")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let to = payload
            .get("to")
            .and_then(|v| v.as_str())
            .unwrap_or("central")
            .to_string();
        let sig = P2pSignalMsg {
            id: format!("sig_{}", now_ms()),
            at_ms: now_ms(),
            from,
            to,
            body: payload,
        };
        {
            let mut guard = state.lock().unwrap();
            if let Some(inner) = guard.as_mut() {
                prune_old_signals(&mut inner.p2p_signals);
                inner.p2p_signals.push(sig.clone());
            }
        }
        let resp = serde_json::json!({ "ok": true, "id": sig.id });
        let bytes = serde_json::to_vec(&resp).unwrap_or_else(|_| b"{\"ok\":true}".to_vec());
        let _ = write_http_response(&mut stream, 200, "OK", "application/json", &bytes);
        return;
    }

    if method == "POST" {
        if let Some(endpoint) = normalize_api_path(&path) {
            let payload: serde_json::Value = match serde_json::from_str(&body) {
                Ok(v) => v,
                Err(_) => {
                    let msg = b"{\"ok\":false,\"error\":\"invalid_json\"}";
                    let _ = write_http_response(
                        &mut stream,
                        400,
                        "Bad Request",
                        "application/json",
                        msg,
                    );
                    return;
                }
            };
            let is_runtime = payload
                .get("type")
                .and_then(|t| t.as_str())
                .map(|t| t == "runtime")
                .unwrap_or(false);
            if is_runtime {
                if let Some(data) = payload.get("data") {
                    let mut guard = state.lock().unwrap();
                    if let Some(inner) = guard.as_mut() {
                        inner.runtime_snapshot = Some(data.clone());
                        inner.runtime_saved_at = now_ms();
                    }
                }
                let resp = serde_json::json!({ "ok": true, "runtime": true });
                let bytes = serde_json::to_vec(&resp).unwrap_or_else(|_| b"{\"ok\":true}".to_vec());
                let _ = write_http_response(&mut stream, 200, "OK", "application/json", &bytes);
                return;
            }
            if let Ok(txt) = serde_json::to_string(&serde_json::json!({
                "event": "lan_push",
                "endpoint": endpoint,
                "payload": payload
            })) {
                let _ = crozzo_lan_ws::broadcast_text(&txt);
            }
            let sub = CrozzoLanSyncSubmission {
                id: format!("lan_{}", now_ms()),
                received_at: now_ms(),
                endpoint,
                payload,
            };
            {
                let mut guard = state.lock().unwrap();
                if let Some(inner) = guard.as_mut() {
                    inner.pending.push(sub.clone());
                }
            }
            let resp = serde_json::json!({ "ok": true, "id": sub.id });
            let bytes = serde_json::to_vec(&resp).unwrap_or_else(|_| b"{\"ok\":true}".to_vec());
            let _ = write_http_response(&mut stream, 200, "OK", "application/json", &bytes);
            return;
        }
    }

    let _ = write_http_response(&mut stream, 404, "Not Found", "application/json", b"{\"ok\":false,\"error\":\"not_found\"}");
}

fn run_server(state: Arc<Mutex<Option<ServerInner>>>, port: u16) {
    let addr = format!("0.0.0.0:{}", port);
    let listener = match TcpListener::bind(&addr) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("[lan-sync] bind {}: {}", addr, e);
            let mut guard = state.lock().unwrap();
            *guard = None;
            return;
        }
    };
    let _ = listener.set_nonblocking(true);
    loop {
        {
            let guard = state.lock().unwrap();
            if guard.as_ref().map(|s| s.stop).unwrap_or(true) {
                break;
            }
        }
        match listener.accept() {
            Ok((stream, _)) => {
                let st = Arc::clone(&state);
                thread::spawn(move || handle_connection(stream, st));
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(40));
            }
            Err(e) => {
                eprintln!("[lan-sync] accept: {}", e);
                thread::sleep(Duration::from_millis(200));
            }
        }
    }
}

fn status_from_inner(inner: &ServerInner) -> CrozzoLanSyncStatus {
    CrozzoLanSyncStatus {
        running: !inner.stop,
        port: inner.port,
        pending_count: inner.pending.len(),
        location_id: inner.meta.location_id.clone(),
        device_id: inner.meta.device_id.clone(),
        business_id: inner.meta.business_id.clone(),
    }
}

#[tauri::command]
pub fn crozzo_lan_sync_start(
    port: Option<u16>,
    location_id: Option<String>,
    device_id: Option<String>,
    business_id: Option<String>,
) -> Result<CrozzoLanSyncStatus, String> {
    let port = port.unwrap_or(DEFAULT_PORT);
    if port < 1024 {
        return Err("Puerto inválido (use ≥ 1024)".into());
    }
    crozzo_lan_sync_stop()?;
    let meta = ServerMeta {
        location_id: location_id.unwrap_or_default().trim().to_string(),
        device_id: device_id.unwrap_or_default().trim().to_string(),
        business_id: business_id.unwrap_or_default().trim().to_string(),
    };
    let loc_id = meta.location_id.clone();
    let dev_id = meta.device_id.clone();
    let biz_id = meta.business_id.clone();
    let shared = Arc::clone(shared_state());
    {
        let mut guard = shared.lock().map_err(|e| e.to_string())?;
        *guard = Some(ServerInner {
            port,
            meta,
            pending: Vec::new(),
            runtime_snapshot: None,
            runtime_saved_at: String::new(),
            p2p_signals: Vec::new(),
            stop: false,
        });
    }
    let st = Arc::clone(&shared);
    let handle = thread::spawn(move || run_server(st, port));
    {
        let mut th = server_thread().lock().map_err(|e| e.to_string())?;
        *th = Some(handle);
    }
    let ws_port = port.saturating_add(1);
    let _ = crozzo_lan_ws::crozzo_lan_ws_start(Some(ws_port));
    crozzo_mdns::start_with_lan(port, ws_port, &loc_id, &dev_id, &biz_id);
    thread::sleep(Duration::from_millis(80));
    let guard = shared.lock().map_err(|e| e.to_string())?;
    match guard.as_ref() {
        Some(inner) => Ok(status_from_inner(inner)),
        None => Err(format!(
            "No se pudo abrir el puerto {} (¿otro proceso lo usa?)",
            port
        )),
    }
}

#[tauri::command]
pub fn crozzo_lan_sync_stop() -> Result<CrozzoLanSyncStatus, String> {
    let shared = Arc::clone(shared_state());
    {
        let mut guard = shared.lock().map_err(|e| e.to_string())?;
        if let Some(inner) = guard.as_mut() {
            inner.stop = true;
        }
    }
    let mut th = server_thread().lock().map_err(|e| e.to_string())?;
    if let Some(handle) = th.take() {
        let _ = handle.join();
    }
    {
        let mut guard = shared.lock().map_err(|e| e.to_string())?;
        *guard = None;
    }
    let _ = crozzo_lan_ws::crozzo_lan_ws_stop();
    crozzo_mdns::stop_with_lan();
    Ok(CrozzoLanSyncStatus {
        running: false,
        port: DEFAULT_PORT,
        pending_count: 0,
        location_id: String::new(),
        device_id: String::new(),
        business_id: String::new(),
    })
}

#[tauri::command]
pub fn crozzo_lan_sync_status() -> Result<CrozzoLanSyncStatus, String> {
    let guard = shared_state().lock().map_err(|e| e.to_string())?;
    match guard.as_ref() {
        Some(inner) if !inner.stop => Ok(status_from_inner(inner)),
        _ => Ok(CrozzoLanSyncStatus {
            running: false,
            port: DEFAULT_PORT,
            pending_count: 0,
            location_id: String::new(),
            device_id: String::new(),
            business_id: String::new(),
        }),
    }
}

#[tauri::command]
pub fn crozzo_lan_sync_drain_pending() -> Result<Vec<CrozzoLanSyncSubmission>, String> {
    let mut guard = shared_state().lock().map_err(|e| e.to_string())?;
    match guard.as_mut() {
        Some(inner) => {
            let out = std::mem::take(&mut inner.pending);
            Ok(out)
        }
        None => Ok(Vec::new()),
    }
}
