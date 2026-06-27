//! Servidor HTTP LAN para sincronización multidispositivo (Rol A / caja Windows).
//! Expone GET /health, GET /status y POST /api/{sync,orders,sales,invoices}.

use crate::crozzo_lan_ws;
use crate::crozzo_mdns;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::Duration;

const DEFAULT_PORT: u16 = 3000;
/// Cabecera con la que las tablets (Rol B) firman las peticiones de escritura.
const LAN_AUTH_HEADER: &str = "x-crozzo-lan-token";
/// Tiempo que una operación drenada espera un ACK antes de volver a ofrecerse (reintento).
const INFLIGHT_TTL_MS: u128 = 20_000;
/// Tope de operaciones persistidas para no crecer sin límite.
const PENDING_MAX: usize = 2000;

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
    business_name: String,
    /// URL Supabase (anon key es pública; solo se entrega con token LAN de pareo).
    supabase_url: String,
    supabase_anon_key: String,
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
    /// id → instante (ms) en que se entregó al JS; espera ACK antes de reintentar.
    in_flight: HashMap<String, u128>,
    runtime_snapshot: Option<serde_json::Value>,
    runtime_saved_at: String,
    /// Comandas activas en LAN (id → payload) para GET /api/comandas.
    comandas_active: HashMap<String, serde_json::Value>,
    p2p_signals: Vec<P2pSignalMsg>,
    /// Secreto compartido del pareo. Vacío = sin exigir auth (compatibilidad).
    auth_token: String,
    /// Archivo donde se persiste `pending` (sobrevive reinicios).
    pending_path: Option<PathBuf>,
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
    now_ms_u128().to_string()
}

fn now_ms_u128() -> u128 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

/// Sufijo monotónico para evitar colisiones de id cuando llegan varias
/// operaciones en el mismo milisegundo.
fn rand_suffix() -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    static CTR: AtomicU64 = AtomicU64::new(0);
    format!("{:x}", CTR.fetch_add(1, Ordering::Relaxed))
}

/// Extrae el valor de una cabecera HTTP (nombre en minúsculas) del request crudo.
fn header_value(raw: &str, name_lower: &str) -> Option<String> {
    for line in raw.split("\r\n") {
        if line.is_empty() {
            break;
        }
        if let Some(idx) = line.find(':') {
            let key = line[..idx].trim().to_ascii_lowercase();
            if key == name_lower {
                return Some(line[idx + 1..].trim().to_string());
            }
        }
    }
    None
}

/// Ruta del archivo de cola persistida (sobrevive reinicios de la caja).
fn pending_file_in(dir: &str) -> Option<PathBuf> {
    let base = dir.trim();
    let mut p = if base.is_empty() {
        // Fallback: APPDATA (Windows) / HOME / temp.
        let env_base = std::env::var("APPDATA")
            .ok()
            .or_else(|| std::env::var("HOME").ok())
            .unwrap_or_else(|| std::env::temp_dir().to_string_lossy().to_string());
        let mut pb = PathBuf::from(env_base);
        pb.push("BonaOrigenPOS");
        pb
    } else {
        PathBuf::from(base)
    };
    let _ = std::fs::create_dir_all(&p);
    p.push("crozzo_lan_pending.json");
    Some(p)
}

fn load_pending(path: &Option<PathBuf>) -> Vec<CrozzoLanSyncSubmission> {
    if let Some(p) = path {
        if let Ok(txt) = std::fs::read_to_string(p) {
            if let Ok(v) = serde_json::from_str::<Vec<CrozzoLanSyncSubmission>>(&txt) {
                return v;
            }
        }
    }
    Vec::new()
}

fn save_pending(path: &Option<PathBuf>, pending: &[CrozzoLanSyncSubmission]) {
    if let Some(p) = path {
        if let Ok(txt) = serde_json::to_string(pending) {
            // Escritura atómica: archivo temporal + rename para evitar corrupción.
            let tmp = p.with_extension("json.tmp");
            if std::fs::write(&tmp, txt.as_bytes()).is_ok() {
                let _ = std::fs::rename(&tmp, p);
            }
        }
    }
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

fn comanda_store_key(payload: &serde_json::Value) -> Option<String> {
    let data = payload.get("data").unwrap_or(payload);
    if let Some(tid) = data.get("transaction_id").and_then(|v| v.as_str()) {
        let t = tid.trim();
        if !t.is_empty() {
            return Some(t.to_string());
        }
    }
    if let Some(id) = data.get("id") {
        return Some(id.to_string());
    }
    None
}

fn upsert_comanda_snapshot(inner: &mut ServerInner, payload: &serde_json::Value) {
    let typ = payload
        .get("type")
        .and_then(|t| t.as_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let data = payload.get("data").cloned().unwrap_or_else(|| payload.clone());
    if typ == "comanda_estado" {
        let est = data
            .get("estado")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if est == "entregada" {
            if let Some(k) = comanda_store_key(payload) {
                inner.comandas_active.remove(&k);
            }
            return;
        }
        if let Some(k) = comanda_store_key(payload) {
            if let Some(existing) = inner.comandas_active.get_mut(&k) {
                if let Some(obj) = existing.as_object_mut() {
                    if let Some(estado) = data.get("estado") {
                        obj.insert("estado".into(), estado.clone());
                    }
                    if let Some(lu) = data.get("lastUpdateAt") {
                        obj.insert("lastUpdateAt".into(), lu.clone());
                    }
                }
            }
        }
        return;
    }
    if typ == "comanda" || typ == "comanda_new" {
        if let Some(k) = comanda_store_key(payload) {
            inner.comandas_active.insert(k, data);
            if inner.comandas_active.len() > 800 {
                let overflow = inner.comandas_active.len() - 800;
                let keys: Vec<String> = inner
                    .comandas_active
                    .keys()
                    .take(overflow)
                    .cloned()
                    .collect();
                for rk in keys {
                    inner.comandas_active.remove(&rk);
                }
            }
        }
    }
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
    let raw_text = String::from_utf8_lossy(&buf[..n]).to_string();
    let (method, path, body) = match parse_request(&buf[..n]) {
        Some(v) => v,
        None => return,
    };

    if method == "OPTIONS" {
        let _ = write_http_response(&mut stream, 204, "No Content", "text/plain", b"");
        return;
    }

    let (meta, port, auth_token) = {
        let guard = state.lock().unwrap();
        match guard.as_ref() {
            Some(s) => (s.meta.clone(), s.port, s.auth_token.clone()),
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

    // Auth de escritura: si la caja tiene token de pareo, las peticiones POST de
    // datos deben firmarse con la cabecera x-crozzo-lan-token. Los GET de
    // descubrimiento (/health, /status, /mesh-ping) quedan abiertos a propósito.
    let provided_token = header_value(&raw_text, LAN_AUTH_HEADER).unwrap_or_default();
    let auth_ok = auth_token.is_empty() || provided_token == auth_token;

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

    if method == "GET" && (path == "/api/pairing-cloud" || path.starts_with("/api/pairing-cloud?")) {
        if !auth_ok {
            let _ = write_http_response(
                &mut stream,
                401,
                "Unauthorized",
                "application/json",
                b"{\"ok\":false,\"error\":\"auth_required\"}",
            );
            return;
        }
        let has_cloud = !meta.supabase_url.is_empty() && !meta.supabase_anon_key.is_empty();
        let resp = serde_json::json!({
            "ok": has_cloud,
            "supabase_url": meta.supabase_url,
            "supabase_anon_key": meta.supabase_anon_key,
            "location_id": meta.location_id,
            "business_id": meta.business_id,
            "business_name": meta.business_name,
        });
        let bytes = serde_json::to_vec(&resp).unwrap_or_else(|_| b"{\"ok\":false}".to_vec());
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

    if method == "GET" && (path == "/api/comandas" || path.starts_with("/api/comandas?")) {
        let rows: Vec<serde_json::Value> = {
            let guard = state.lock().unwrap();
            match guard.as_ref() {
                Some(inner) => inner.comandas_active.values().cloned().collect(),
                None => Vec::new(),
            }
        };
        let resp = serde_json::json!({
            "ok": true,
            "comandas": rows,
            "count": rows.len(),
            "saved_at": now_ms()
        });
        let bytes = serde_json::to_vec(&resp).unwrap_or_else(|_| b"{\"ok\":true,\"comandas\":[]}".to_vec());
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
        if !auth_ok {
            let _ = write_http_response(
                &mut stream,
                401,
                "Unauthorized",
                "application/json",
                b"{\"ok\":false,\"error\":\"auth_required\"}",
            );
            return;
        }
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
            if !auth_ok {
                let _ = write_http_response(
                    &mut stream,
                    401,
                    "Unauthorized",
                    "application/json",
                    b"{\"ok\":false,\"error\":\"auth_required\"}",
                );
                return;
            }
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
            let is_pulse = payload
                .get("type")
                .and_then(|t| t.as_str())
                .map(|t| t == "lan_ops_pulse")
                .unwrap_or(false);
            if is_pulse {
                if let Ok(txt) = serde_json::to_string(&payload.get("data").cloned().unwrap_or(payload.clone())) {
                    let wrapped = format!("{{\"event\":\"lan_ops_pulse\",\"payload\":{}}}", txt);
                    let _ = crozzo_lan_ws::broadcast_text(&wrapped);
                }
                let resp = serde_json::json!({ "ok": true, "pulse": true });
                let bytes = serde_json::to_vec(&resp).unwrap_or_else(|_| b"{\"ok\":true}".to_vec());
                let _ = write_http_response(&mut stream, 200, "OK", "application/json", &bytes);
                return;
            }
            if is_runtime {
                if let Some(data) = payload.get("data") {
                    let mut guard = state.lock().unwrap();
                    if let Some(inner) = guard.as_mut() {
                        inner.runtime_snapshot = Some(data.clone());
                        inner.runtime_saved_at = now_ms();
                    }
                }
                if let Ok(txt) = serde_json::to_string(&serde_json::json!({
                    "event": "lan_push",
                    "endpoint": endpoint,
                    "payload": payload
                })) {
                    let _ = crozzo_lan_ws::broadcast_text(&txt);
                }
                let resp = serde_json::json!({ "ok": true, "runtime": true });
                let bytes = serde_json::to_vec(&resp).unwrap_or_else(|_| b"{\"ok\":true}".to_vec());
                let _ = write_http_response(&mut stream, 200, "OK", "application/json", &bytes);
                return;
            }
            {
                let mut guard = state.lock().unwrap();
                if let Some(inner) = guard.as_mut() {
                    upsert_comanda_snapshot(inner, &payload);
                }
            }
            if let Ok(txt) = serde_json::to_string(&serde_json::json!({
                "event": "lan_push",
                "endpoint": endpoint,
                "payload": payload
            })) {
                let _ = crozzo_lan_ws::broadcast_text(&txt);
            }
            let sub = CrozzoLanSyncSubmission {
                id: format!("lan_{}_{}", now_ms(), rand_suffix()),
                received_at: now_ms(),
                endpoint,
                payload,
            };
            // Persistir ANTES de responder ok → la tablet recibe un ACK durable
            // (no se pierde si la caja se reinicia).
            {
                let mut guard = state.lock().unwrap();
                if let Some(inner) = guard.as_mut() {
                    inner.pending.push(sub.clone());
                    if inner.pending.len() > PENDING_MAX {
                        let overflow = inner.pending.len() - PENDING_MAX;
                        inner.pending.drain(0..overflow);
                    }
                    let path = inner.pending_path.clone();
                    save_pending(&path, &inner.pending);
                }
            }
            let resp = serde_json::json!({ "ok": true, "id": sub.id, "durable": true });
            let bytes = serde_json::to_vec(&resp).unwrap_or_else(|_| b"{\"ok\":true}".to_vec());
            let _ = write_http_response(&mut stream, 200, "OK", "application/json", &bytes);
            return;
        }
    }

    let _ = write_http_response(&mut stream, 404, "Not Found", "application/json", b"{\"ok\":false,\"error\":\"not_found\"}");
}

fn run_server(state: Arc<Mutex<Option<ServerInner>>>, listener: TcpListener) {
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
    auth_token: Option<String>,
    supabase_url: Option<String>,
    supabase_anon_key: Option<String>,
    data_dir: Option<String>,
) -> Result<CrozzoLanSyncStatus, String> {
    let port = port.unwrap_or(DEFAULT_PORT);
    if port < 1024 {
        return Err("Puerto inválido (use ≥ 1024)".into());
    }
    crozzo_lan_sync_stop()?;
    let addr = format!("0.0.0.0:{}", port);
    let listener = TcpListener::bind(&addr).map_err(|e| {
        format!("No se pudo abrir el puerto {}: {}", port, e)
    })?;
    let _ = listener.set_nonblocking(true);
    let meta = ServerMeta {
        location_id: location_id.unwrap_or_default().trim().to_string(),
        device_id: device_id.unwrap_or_default().trim().to_string(),
        business_id: business_id.unwrap_or_default().trim().to_string(),
        business_name: String::new(),
        supabase_url: supabase_url.unwrap_or_default().trim().to_string(),
        supabase_anon_key: supabase_anon_key.unwrap_or_default().trim().to_string(),
    };
    let loc_id = meta.location_id.clone();
    let dev_id = meta.device_id.clone();
    let biz_id = meta.business_id.clone();
    let pending_path = pending_file_in(&data_dir.unwrap_or_default());
    let restored = load_pending(&pending_path);
    let shared = Arc::clone(shared_state());
    {
        let mut guard = shared.lock().map_err(|e| e.to_string())?;
        *guard = Some(ServerInner {
            port,
            meta,
            pending: restored,
            in_flight: HashMap::new(),
            runtime_snapshot: None,
            runtime_saved_at: String::new(),
            comandas_active: HashMap::new(),
            p2p_signals: Vec::new(),
            auth_token: auth_token.unwrap_or_default().trim().to_string(),
            pending_path,
            stop: false,
        });
    }
    let st = Arc::clone(&shared);
    let handle = thread::spawn(move || run_server(st, listener));
    {
        let mut th = server_thread().lock().map_err(|e| e.to_string())?;
        *th = Some(handle);
    }
    let ws_port = port.saturating_add(1);
    if let Err(e) = crozzo_lan_ws::crozzo_lan_ws_start(Some(ws_port)) {
        let _ = crozzo_lan_sync_stop();
        return Err(e);
    }
    crozzo_mdns::start_with_lan(port, ws_port, &loc_id, &dev_id, &biz_id);
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
pub fn crozzo_lan_sync_update_pairing_cloud(
    supabase_url: Option<String>,
    supabase_anon_key: Option<String>,
    business_id: Option<String>,
    business_name: Option<String>,
) -> Result<bool, String> {
    let shared = Arc::clone(shared_state());
    let mut guard = shared.lock().map_err(|e| e.to_string())?;
    match guard.as_mut() {
        Some(inner) => {
            if let Some(u) = supabase_url {
                inner.meta.supabase_url = u.trim().to_string();
            }
            if let Some(k) = supabase_anon_key {
                inner.meta.supabase_anon_key = k.trim().to_string();
            }
            if let Some(bid) = business_id {
                inner.meta.business_id = bid.trim().to_string();
            }
            if let Some(bn) = business_name {
                inner.meta.business_name = bn.trim().to_string();
            }
            Ok(
                !inner.meta.supabase_url.is_empty() && !inner.meta.supabase_anon_key.is_empty(),
            )
        }
        None => Ok(false),
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
            let now = now_ms_u128();
            // Purgar el registro in-flight de ids que ya no existen.
            let ids: std::collections::HashSet<String> =
                inner.pending.iter().map(|s| s.id.clone()).collect();
            inner.in_flight.retain(|k, _| ids.contains(k));
            // Ofrecer solo lo que no está in-flight o cuyo ACK venció (reintento).
            let mut out = Vec::new();
            for sub in inner.pending.iter() {
                let df = inner.in_flight.get(&sub.id).copied().unwrap_or(0);
                if now.saturating_sub(df) >= INFLIGHT_TTL_MS {
                    out.push(sub.clone());
                }
            }
            for sub in out.iter() {
                inner.in_flight.insert(sub.id.clone(), now);
            }
            Ok(out)
        }
        None => Ok(Vec::new()),
    }
}

/// Confirma (ACK) que el JS aplicó las operaciones: las elimina de la cola
/// persistida. Lo que no se confirma se vuelve a ofrecer tras INFLIGHT_TTL_MS.
#[tauri::command]
pub fn crozzo_lan_sync_ack(ids: Vec<String>) -> Result<usize, String> {
    if ids.is_empty() {
        return Ok(0);
    }
    let mut guard = shared_state().lock().map_err(|e| e.to_string())?;
    match guard.as_mut() {
        Some(inner) => {
            let set: std::collections::HashSet<&String> = ids.iter().collect();
            let before = inner.pending.len();
            inner.pending.retain(|s| !set.contains(&s.id));
            for id in ids.iter() {
                inner.in_flight.remove(id);
            }
            let removed = before - inner.pending.len();
            let path = inner.pending_path.clone();
            save_pending(&path, &inner.pending);
            Ok(removed)
        }
        None => Ok(0),
    }
}

/// Health check nativo (sin HTTP desde el WebView).
#[tauri::command]
pub fn crozzo_lan_sync_health() -> Result<serde_json::Value, String> {
    let guard = shared_state().lock().map_err(|e| e.to_string())?;
    match guard.as_ref() {
        Some(inner) if !inner.stop => Ok(serde_json::json!({
            "ok": true,
            "running": true,
            "port": inner.port,
            "service": "crozzo-lan-sync"
        })),
        _ => Ok(serde_json::json!({
            "ok": false,
            "running": false,
            "port": DEFAULT_PORT,
            "service": "crozzo-lan-sync"
        })),
    }
}
