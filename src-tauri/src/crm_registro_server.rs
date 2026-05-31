//! Servidor HTTP local para autoregistro de clientes CRM (QR en LAN).

use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use std::sync::OnceLock;

const DEFAULT_PORT: u16 = 8765;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrmRegistroStatus {
    pub running: bool,
    pub port: u16,
    pub token: String,
    pub pending_count: usize,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrmRegistroSubmission {
    pub id: String,
    pub received_at: String,
    #[serde(flatten)]
    pub payload: serde_json::Value,
}

struct ServerInner {
    token: String,
    port: u16,
    static_root: PathBuf,
    pending: Vec<CrmRegistroSubmission>,
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

fn resolve_static_root(custom: Option<String>) -> PathBuf {
    if let Some(p) = custom {
        let pb = PathBuf::from(p);
        if pb.is_dir() {
            return pb;
        }
    }
    if cfg!(debug_assertions) {
        let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../src");
        if dev.is_dir() {
            return dev;
        }
    }
    std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."))
}

fn read_file_safe(root: &Path, rel: &str) -> Option<Vec<u8>> {
    let path = root.join(rel);
    if !path.starts_with(root) {
        return None;
    }
    std::fs::read(path).ok()
}

fn mime_for(path: &str) -> &'static str {
    if path.ends_with(".html") {
        "text/html; charset=utf-8"
    } else if path.ends_with(".js") {
        "application/javascript; charset=utf-8"
    } else if path.ends_with(".css") {
        "text/css; charset=utf-8"
    } else if path.ends_with(".json") {
        "application/json; charset=utf-8"
    } else {
        "application/octet-stream"
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
        "HTTP/1.1 {} {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nConnection: close\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: Content-Type, X-Crozzo-Token\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\n\r\n",
        status, status_text, content_type, body.len()
    );
    stream.write_all(headers.as_bytes())?;
    stream.write_all(body)?;
    stream.flush()
}

fn parse_request(buf: &[u8]) -> Option<(String, String, Vec<(String, String)>, String)> {
    let text = String::from_utf8_lossy(buf);
    let mut lines = text.split("\r\n");
    let first = lines.next()?;
    let mut parts = first.split_whitespace();
    let method = parts.next()?.to_string();
    let path = parts.next()?.to_string();
    let mut headers = Vec::new();
    for line in lines.by_ref() {
        if line.is_empty() {
            break;
        }
        if let Some((k, v)) = line.split_once(':') {
            headers.push((k.trim().to_lowercase(), v.trim().to_string()));
        }
    }
    let body_start = text.find("\r\n\r\n").map(|i| i + 4).unwrap_or(text.len());
    let body = text[body_start..].to_string();
    Some((method, path, headers, body))
}

fn header_value(headers: &[(String, String)], key: &str) -> Option<String> {
    headers
        .iter()
        .find(|(k, _)| k == key)
        .map(|(_, v)| v.clone())
}

fn now_ms() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis().to_string())
        .unwrap_or_else(|_| "0".into())
}

fn handle_connection(mut stream: std::net::TcpStream, state: Arc<Mutex<Option<ServerInner>>>) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(8)));
    let mut buf = vec![0u8; 65536];
    let n = match stream.read(&mut buf) {
        Ok(0) | Err(_) => return,
        Ok(n) => n,
    };
    let (method, path, headers, body) = match parse_request(&buf[..n]) {
        Some(v) => v,
        None => return,
    };

    if method == "OPTIONS" {
        let _ = write_http_response(&mut stream, 204, "No Content", "text/plain", b"");
        return;
    }

    let (token, static_root) = {
        let guard = state.lock().unwrap();
        match guard.as_ref() {
            Some(s) => (s.token.clone(), s.static_root.clone()),
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

    if method == "GET" && path == "/api/crm-registro/health" {
        let msg = b"{\"ok\":true,\"service\":\"crozzo-crm-registro\"}";
        let _ = write_http_response(&mut stream, 200, "OK", "application/json", msg);
        return;
    }

    if method == "POST" && path == "/api/crm-registro" {
        let hdr_token = header_value(&headers, "x-crozzo-token").unwrap_or_default();
        let mut ok_token = hdr_token == token;
        if !ok_token {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&body) {
                if json.get("token").and_then(|t| t.as_str()) == Some(token.as_str()) {
                    ok_token = true;
                }
            }
        }
        if !ok_token {
            let msg = b"{\"ok\":false,\"error\":\"invalid_token\"}";
            let _ = write_http_response(&mut stream, 403, "Forbidden", "application/json", msg);
            return;
        }
        let mut payload: serde_json::Value = match serde_json::from_str(&body) {
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
        if let Some(obj) = payload.as_object_mut() {
            obj.remove("token");
        }
        let sub = CrmRegistroSubmission {
            id: format!("reg_{}", now_ms()),
            received_at: now_ms(),
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

    if method == "GET" && (path == "/registro" || path == "/registro/" || path == "/") {
        if let Some(bytes) = read_file_safe(&static_root, "crm-registro-cliente.html") {
            let _ = write_http_response(
                &mut stream,
                200,
                "OK",
                "text/html; charset=utf-8",
                &bytes,
            );
            return;
        }
    }

    for prefix in ["/vendor/", "/modules/", "/css/"] {
        if method == "GET" && path.starts_with(prefix) {
            let rel = path.trim_start_matches('/');
            if let Some(bytes) = read_file_safe(&static_root, rel) {
                let _ = write_http_response(&mut stream, 200, "OK", mime_for(rel), &bytes);
                return;
            }
        }
    }

    let _ = write_http_response(&mut stream, 404, "Not Found", "text/plain", b"Not Found");
}

fn run_server(state: Arc<Mutex<Option<ServerInner>>>, port: u16) {
    let addr = format!("0.0.0.0:{}", port);
    let listener = match TcpListener::bind(&addr) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("[crm-registro] bind {}: {}", addr, e);
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
                eprintln!("[crm-registro] accept: {}", e);
                thread::sleep(Duration::from_millis(200));
            }
        }
    }
}

#[tauri::command]
pub fn crm_registro_start(
    token: String,
    port: Option<u16>,
    static_dir: Option<String>,
) -> Result<CrmRegistroStatus, String> {
    let port = port.unwrap_or(DEFAULT_PORT);
    let token = token.trim().to_string();
    if token.len() < 8 {
        return Err("Token demasiado corto (mín. 8 caracteres)".into());
    }
    crm_registro_stop()?;
    let static_root = resolve_static_root(static_dir);
    if !static_root.is_dir() {
        return Err(format!(
            "Carpeta estática no encontrada: {}",
            static_root.display()
        ));
    }
    let shared = Arc::clone(shared_state());
    {
        let mut guard = shared.lock().map_err(|e| e.to_string())?;
        *guard = Some(ServerInner {
            token: token.clone(),
            port,
            static_root,
            pending: Vec::new(),
            stop: false,
        });
    }
    let st = Arc::clone(shared_state());
    let handle = thread::spawn(move || run_server(st, port));
    {
        let mut h = server_thread().lock().map_err(|e| e.to_string())?;
        *h = Some(handle);
    }
    crm_registro_status()
}

#[tauri::command]
pub fn crm_registro_stop() -> Result<CrmRegistroStatus, String> {
    {
        let mut guard = shared_state().lock().map_err(|e| e.to_string())?;
        if let Some(inner) = guard.as_mut() {
            inner.stop = true;
        } else {
            return Ok(CrmRegistroStatus {
                running: false,
                port: DEFAULT_PORT,
                token: String::new(),
                pending_count: 0,
            });
        }
    }
    if let Ok(mut h) = server_thread().lock() {
        if let Some(handle) = h.take() {
            let _ = handle.join();
        }
    }
    {
        let mut guard = shared_state().lock().map_err(|e| e.to_string())?;
        *guard = None;
    }
    Ok(CrmRegistroStatus {
        running: false,
        port: DEFAULT_PORT,
        token: String::new(),
        pending_count: 0,
    })
}

#[tauri::command]
pub fn crm_registro_status() -> Result<CrmRegistroStatus, String> {
    let guard = shared_state().lock().map_err(|e| e.to_string())?;
    match guard.as_ref() {
        Some(s) => Ok(CrmRegistroStatus {
            running: !s.stop,
            port: s.port,
            token: s.token.clone(),
            pending_count: s.pending.len(),
        }),
        None => Ok(CrmRegistroStatus {
            running: false,
            port: DEFAULT_PORT,
            token: String::new(),
            pending_count: 0,
        }),
    }
}

#[tauri::command]
pub fn crm_registro_drain_pending() -> Result<Vec<CrmRegistroSubmission>, String> {
    let mut guard = shared_state().lock().map_err(|e| e.to_string())?;
    let inner = guard
        .as_mut()
        .ok_or_else(|| "Servidor no activo".to_string())?;
    Ok(std::mem::take(&mut inner.pending))
}

#[tauri::command]
pub fn crm_registro_push_pending(
    payload: serde_json::Value,
) -> Result<CrmRegistroSubmission, String> {
    let sub = CrmRegistroSubmission {
        id: format!("reg_local_{}", now_ms()),
        received_at: now_ms(),
        payload,
    };
    let mut guard = shared_state().lock().map_err(|e| e.to_string())?;
    if let Some(inner) = guard.as_mut() {
        inner.pending.push(sub.clone());
        return Ok(sub);
    }
    Err("Servidor no activo".into())
}
