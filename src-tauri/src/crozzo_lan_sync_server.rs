//! Servidor HTTP LAN para sincronización multidispositivo (Rol A / caja Windows).
//! Expone GET /health, GET /status y POST /api/{sync,orders,sales,invoices}.

use crate::crozzo_lan_ws;
use crate::crozzo_mdns;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};
use crate::crozzo_lan_persistence::PersistenceDb;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use sha2::Digest;
use tokio::sync::{Mutex as AsyncMutex, Semaphore};

const DEFAULT_PORT: u16 = 3000;
/// Cabecera con la que las tablets (Rol B) firman las peticiones de escritura.
const LAN_AUTH_HEADER: &str = "x-crozzo-lan-token";
/// Cabeceras permitidas en preflight CORS (tablets + webview Tauri ? :3000).
const CORS_ALLOW_HEADERS: &str =
    "Content-Type, Accept, x-crozzo-lan-token, X-Crozzo-Lan-Token";
/// Origen CORS permitido (F2.1). Override con CROZZO_LAN_CORS_ORIGIN.
fn cors_origin() -> String {
    // Default "*" para compatibilidad con WebView2 (origin puede ser http://tauri.localhost o tauri://localhost).
    // Override con CROZZO_LAN_CORS_ORIGIN en producción para restringir.
    std::env::var("CROZZO_LAN_CORS_ORIGIN").unwrap_or_else(|_| "*".to_string())
}
/// Tiempo que una operación drenada espera un ACK antes de volver a ofrecerse (reintento).
const INFLIGHT_TTL_MS: u128 = 20_000;
/// Tope de operaciones persistidas para no crecer sin límite.
const PENDING_MAX: usize = 2000;
const SEEN_ACTION_TTL_MS: u128 = 6 * 60 * 60 * 1000;
const SEEN_ACTION_MAX: usize = 4000;
/// Tope de comandas activas en memoria LAN (S-03). Overflow: purga entregada luego más viejas.
const COMANDAS_ACTIVE_MAX: usize = 800;
/// Soft threshold: purga entregada al 90% del techo (antes del overflow duro).
const COMANDAS_PURGE_SOFT: usize = (COMANDAS_ACTIVE_MAX * 9) / 10;
/// Rate limiting para consultas RUT: 1 consulta cada 6 segundos por IP
const RUT_RATE_LIMIT_MS: u128 = 6_000;
/// Tope de handlers HTTP concurrentes (techo diseño ~100 dispositivos: evita avalancha accept?spawn).
/// Tope de handlers HTTP concurrentes (configurable por env CROZZO_LAN_MAX_HTTP; default 64).
const MAX_CONCURRENT_HTTP: usize = 64;

fn http_conn_semaphore() -> &'static Arc<Semaphore> {
    static SEM: OnceLock<Arc<Semaphore>> = OnceLock::new();
    SEM.get_or_init(|| {
        let n = std::env::var("CROZZO_LAN_MAX_HTTP")
            .ok()
            .and_then(|v| v.parse::<usize>().ok())
            .filter(|&x| x > 0 && x <= 10_000)
            .unwrap_or(MAX_CONCURRENT_HTTP);
        Arc::new(Semaphore::new(n))
    })
}

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

#[derive(Clone, Default)]
pub struct ServerMeta {
    pub location_id: String,
    pub device_id: String,
    pub business_id: String,
    pub business_name: String,
    /// URL Supabase (anon key es pública; solo se entrega con token LAN de pareo).
    pub supabase_url: String,
    pub supabase_anon_key: String,
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

#[derive(Deserialize)]
struct ConsultarRutRequest {
    nit: String,
}

#[derive(Serialize)]
struct ConsultarRutResponse {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<EmpresaData>,
}

#[derive(Serialize)]
struct EmpresaData {
    nit: String,
    razon_social: String,
    direccion: String,
    telefono: String,
    email: String,
    estado: String,
    tipo_contribuyente: String,
}

pub struct ServerInner {
    port: u16,
    meta: ServerMeta,
    /// Caja reporta si alcanzó Supabase recientemente (tablets leen /status).
    cloud_reachable: bool,
    cloud_reachable_at_ms: u128,
    pending: Vec<CrozzoLanSyncSubmission>,
    /// id ? instante (ms) en que se entregó al JS; espera ACK antes de reintentar.
    in_flight: HashMap<String, u128>,
    runtime_snapshot: Option<serde_json::Value>,
    runtime_saved_at: String,
    /// Comandas activas en LAN (id ? payload) para GET /api/comandas.
    comandas_active: HashMap<String, serde_json::Value>,
    /// action_id/uuid ya ingeridos — evita re-broadcast infinito P2P.
    seen_actions: HashMap<String, u128>,
    p2p_signals: Vec<P2pSignalMsg>,
    /// Secreto compartido del pareo. Vacío = sin exigir auth (compatibilidad).
    auth_token: String,
    /// Archivo donde se persiste `pending` (sobrevive reinicios).
    pending_path: Option<PathBuf>,
    /// Rate limiting para consultas RUT: IP ? último timestamp de consulta
    rut_rate_limit: HashMap<String, u128>,
    stop: bool,
    /// Persistencia robusta (SQLite + HLC). Fase 2.3.
    persistence: Option<PersistenceDb>,
    /// Hybrid Logical Clock (Fase 2.3).
    hlc: crate::crozzo_lan_persistence::Hlc,
}


impl ServerInner {
    pub fn meta(&self) -> ServerMeta { self.meta.clone() }
    pub fn port(&self) -> u16 { self.port }
    pub fn auth_token(&self) -> String { self.auth_token.clone() }
    pub fn cloud_reachable(&self) -> bool { self.cloud_reachable }
    pub fn cloud_reachable_at_ms(&self) -> u128 { self.cloud_reachable_at_ms }
    pub fn comandas_count(&self) -> usize { self.comandas_active.len() }
    pub fn comandas_values(&self) -> Vec<serde_json::Value> { self.comandas_active.values().cloned().collect() }
    pub fn runtime_saved_at(&self) -> String { self.runtime_saved_at.clone() }
    pub fn runtime_snapshot(&self) -> Option<serde_json::Value> { self.runtime_snapshot.clone() }
    pub fn p2p_signals_filtered(&self, for_dev: &str, since: u128) -> Vec<serde_json::Value> {
        let mut out = Vec::new();
        for sig in &self.p2p_signals {
            let at = sig.at_ms.parse::<u128>().unwrap_or(0);
            if at < since { continue; }
            let include = if for_dev.is_empty() {
                true
            } else if for_dev == "central" {
                sig.to == "central"
            } else {
                sig.to == for_dev
            };
            if include {
                out.push(serde_json::to_value(sig).unwrap_or(serde_json::json!({})));
            }
        }
        out
    }
    pub fn ops_digest(&self) -> serde_json::Value {
        let rows: Vec<serde_json::Value> = self.comandas_active.values().cloned().collect();
        ops_digest_from_comandas(&rows, &self.runtime_saved_at)
    }
}


fn shared_state() -> &'static Arc<Mutex<Option<ServerInner>>> {
    static STATE: OnceLock<Arc<Mutex<Option<ServerInner>>>> = OnceLock::new();
    STATE.get_or_init(|| Arc::new(Mutex::new(None)))
}

fn server_thread() -> &'static Mutex<Option<tokio::task::JoinHandle<()>>> {
    static HANDLE: OnceLock<Mutex<Option<tokio::task::JoinHandle<()>>>> = OnceLock::new();
    HANDLE.get_or_init(|| Mutex::new(None))
}

fn lifecycle_lock() -> &'static AsyncMutex<()> {
    static L: OnceLock<AsyncMutex<()>> = OnceLock::new();
    L.get_or_init(|| AsyncMutex::new(()))
}

/// Breve pausa tras abort para que Windows libere 3000/3001 antes de re-bind.
const PORT_RELEASE_WAIT_MS: u64 = 150;

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

/// Anti-entropy digest (alineado con CrozzoLanOpsSync.localComandasDigest — FNV-1a 32).
pub fn ops_digest_from_comandas(rows: &[serde_json::Value], runtime_saved_at: &str) -> serde_json::Value {
    let mut ids: Vec<String> = Vec::new();
    let mut max_at: i64 = 0;
    for row in rows {
        let estado = row
            .get("estado")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if estado == "entregada" {
            continue;
        }
        let key = row
            .get("transaction_id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .or_else(|| {
                row.get("id").map(|v| match v {
                    serde_json::Value::String(s) => s.clone(),
                    other => other.to_string(),
                })
            });
        let Some(key) = key else { continue };
        if key.is_empty() || key == "null" {
            continue;
        }
        /* Incluir estado en el hash (alineado con JS): detecta cambios de estado. */
        ids.push(format!("{}:{}", key, estado));
        let at_ms = row
            .get("lastUpdateAt")
            .or_else(|| row.get("createdAt"))
            .and_then(|v| match v {
                serde_json::Value::Number(n) => n.as_i64(),
                serde_json::Value::String(s) => {
                    if let Ok(n) = s.parse::<i64>() {
                        Some(n)
                    } else {
                        // Epoch ms aproximado desde prefijo ISO (YYYY-MM-DDTHH:MM:SS) via Date-like digits.
                        let digits: String = s.chars().filter(|c| c.is_ascii_digit()).take(14).collect();
                        if digits.len() >= 14 {
                            Some(0) // hash+count mandan; maxAt solo desempate laxo en JS
                        } else {
                            None
                        }
                    }
                }
                _ => None,
            })
            .unwrap_or(0);
        if at_ms > max_at {
            max_at = at_ms;
        }
    }
    ids.sort();
    let mut h: u32 = 2166136261;
    for id in &ids {
        let s = format!("{id}|");
        // Alinear con JS (charCodeAt = code unit UTF-16) (P0-07).
        for b in s.encode_utf16() {
            h ^= u32::from(b);
            h = h.wrapping_mul(16777619);
        }
    }
    serde_json::json!({
        "ok": true,
        "count": ids.len(),
        "maxAt": max_at,
        "hash": format!("{:x}", h),
        "runtimeSavedAt": runtime_saved_at,
    })
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
            // Escritura atómica + fsync para durabilidad (F2.1).
            let tmp = p.with_extension("json.tmp");
            if let Ok(mut f) = std::fs::File::create(&tmp) {
                use std::io::Write;
                if f.write_all(txt.as_bytes()).is_ok() {
                    let _ = f.sync_all();
                    let _ = std::fs::rename(&tmp, p);
                }
            }
        }
    }
}

async fn write_http_response(
    stream: &mut LanStream,
    status: u16,
    status_text: &str,
    content_type: &str,
    body: &[u8],
) -> tokio::io::Result<()> {
    // Esta conexión atiende UNA sola petición y se cierra. Anunciar
    // `keep-alive` hacía que el WebView reutilizara el socket tras el
    // preflight OPTIONS y el GET quedara colgado hasta su timeout (AbortError).
    // `Access-Control-Max-Age` evita repetir el preflight en cada request.
    let headers = format!(
        "HTTP/1.1 {} {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nConnection: close\r\nAccess-Control-Allow-Origin: {}\r\nAccess-Control-Allow-Headers: {}\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Max-Age: 86400\r\n\r\n",
        status, status_text, content_type, body.len(), cors_origin(), CORS_ALLOW_HEADERS
    );
    stream.write_all(headers.as_bytes()).await?;
    stream.write_all(body).await?;
    stream.flush().await
}

/// Devuelve el índice inmediatamente después de la secuencia CRLFCRLF real.
/// Importante: debe compararse contra bytes CRLF (0x0D 0x0A), no contra el
/// texto literal `\\r\\n`, o el servidor nunca detecta el fin de cabeceras.
fn find_header_end(buf: &[u8]) -> Option<usize> {
    buf.windows(4).position(|w| w == b"\r\n\r\n").map(|i| i + 4)
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

fn comanda_row_at_ms(row: &serde_json::Value) -> i64 {
    row.get("lastUpdateAt")
        .or_else(|| row.get("createdAt"))
        .and_then(|v| match v {
            serde_json::Value::Number(n) => n.as_i64(),
            serde_json::Value::String(s) => s.parse::<i64>().ok(),
            _ => None,
        })
        .unwrap_or(0)
}

fn purge_entregada_comandas(inner: &mut ServerInner) -> usize {
    let keys: Vec<String> = inner
        .comandas_active
        .iter()
        .filter(|(_, v)| {
            v.get("estado")
                .and_then(|e| e.as_str())
                .unwrap_or("")
                .eq_ignore_ascii_case("entregada")
        })
        .map(|(k, _)| k.clone())
        .collect();
    let n = keys.len();
    for k in keys {
        inner.comandas_active.remove(&k);
    }
    n
}

/// S-03: al acercarse al techo, sacar entregadas; si sigue alto, dropear las más viejas.
fn trim_comandas_active(inner: &mut ServerInner) {
    if inner.comandas_active.len() >= COMANDAS_PURGE_SOFT {
        purge_entregada_comandas(inner);
    }
    if inner.comandas_active.len() <= COMANDAS_ACTIVE_MAX {
        // Persistir estado tras posible purge.
        if let Some(db) = &inner.persistence {
            let conn = db.conn.lock().unwrap();
            let _ = crate::crozzo_lan_persistence::save_comandas(&conn, &inner.comandas_active);
        }
        return;
    }
    purge_entregada_comandas(inner);
    while inner.comandas_active.len() > COMANDAS_ACTIVE_MAX {
        let oldest = inner
            .comandas_active
            .iter()
            .min_by_key(|(_, v)| comanda_row_at_ms(v))
            .map(|(k, _)| k.clone());
        match oldest {
            Some(k) => {
                inner.comandas_active.remove(&k);
            }
            None => break,
        }
    }
    // Persistir estado tras trim.
    if let Some(db) = &inner.persistence {
        let conn = db.conn.lock().unwrap();
        let _ = crate::crozzo_lan_persistence::save_comandas(&conn, &inner.comandas_active);
    }
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
            } else {
                // Si la fila no existe, insertar el estado (P0-05: no descartar).
                inner.comandas_active.insert(k, data.clone());
                trim_comandas_active(inner);
            }
        }
        return;
    }
    if typ == "comanda" || typ == "comanda_new" {
        if let Some(k) = comanda_store_key(payload) {
            let est = data
                .get("estado")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            if est == "entregada" {
                // No re-hidratar entregadas en el mapa activo (S-03).
                inner.comandas_active.remove(&k);
                return;
            }
            inner.comandas_active.insert(k, data);
            trim_comandas_active(inner);
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

pub fn mesh_ping_json(meta: &ServerMeta, port: u16) -> Vec<u8> {
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

fn extract_action_id(payload: &serde_json::Value) -> Option<String> {
    for key in ["action_id", "uuid"] {
        if let Some(v) = payload.get(key).and_then(|x| x.as_str()) {
            let s = v.trim();
            if !s.is_empty() {
                return Some(s.to_string());
            }
        }
    }
    None
}

fn prune_seen_actions(seen: &mut HashMap<String, u128>, now: u128) {
    seen.retain(|_, ts| now.saturating_sub(*ts) < SEEN_ACTION_TTL_MS);
    if seen.len() > SEEN_ACTION_MAX {
        let mut items: Vec<(String, u128)> = seen.iter().map(|(k, v)| (k.clone(), *v)).collect();
        items.sort_by_key(|(_, v)| *v);
        let drop_n = seen.len().saturating_sub(SEEN_ACTION_MAX);
        for (k, _) in items.into_iter().take(drop_n) {
            seen.remove(&k);
        }
    }
}

/// true = duplicado reciente (no re-broadcast ni re-cola).
fn register_action_or_duplicate(inner: &mut ServerInner, action_id: &str) -> bool {
    let now = now_ms_u128();
    // Persistencia durable: consultar SQLite primero (Fase 2.3).
    if let Some(db) = &inner.persistence {
        let conn = db.conn.lock().unwrap();
        if crate::crozzo_lan_persistence::is_seen(&conn, action_id) {
            return true;
        }
    }
    prune_seen_actions(&mut inner.seen_actions, now);
    if let Some(ts) = inner.seen_actions.get(action_id) {
        if now.saturating_sub(*ts) < SEEN_ACTION_TTL_MS {
            return true;
        }
    }
    inner.seen_actions.insert(action_id.to_string(), now);
    // Marcar en SQLite para durabilidad.
    if let Some(db) = &inner.persistence {
        let conn = db.conn.lock().unwrap();
        let _ = crate::crozzo_lan_persistence::mark_seen(&conn, action_id);
    }
    false
}

fn broadcast_lan_push(endpoint: &str, payload: &serde_json::Value) {
    if let Ok(txt) = serde_json::to_string(&serde_json::json!({
        "event": "lan_push",
        "endpoint": endpoint,
        "payload": payload
    })) {
        let _ = crozzo_lan_ws::broadcast_text(&txt);
    }
}

/// Valida que el NIT tenga el formato correcto (10-15 dígitos)
fn validate_nit(nit: &str) -> Result<String, String> {
    let cleaned = nit.trim().replace("-", "").replace(".", "").replace(" ", "");
    
    // Verificar que solo contenga dígitos
    if !cleaned.chars().all(|c| c.is_ascii_digit()) {
        return Err("NIT debe contener solo números".to_string());
    }
    
    // Verificar longitud
    if cleaned.len() < 10 || cleaned.len() > 15 {
        return Err("NIT debe tener entre 10 y 15 dígitos".to_string());
    }
    
    Ok(cleaned)
}

/// Verifica rate limiting para consultas RUT por IP
fn check_rut_rate_limit(inner: &mut ServerInner, client_ip: &str) -> Result<(), String> {
    let now = now_ms_u128();
    
    // Limpiar entradas antiguas (más de 1 hora)
    inner.rut_rate_limit.retain(|_, timestamp| {
        now.saturating_sub(*timestamp) < 3_600_000 // 1 hora en ms
    });
    
    if let Some(&last_request) = inner.rut_rate_limit.get(client_ip) {
        let time_since_last = now.saturating_sub(last_request);
        if time_since_last < RUT_RATE_LIMIT_MS {
            let wait_seconds = (RUT_RATE_LIMIT_MS - time_since_last) / 1000;
            return Err(format!("Rate limit excedido. Espere {} segundos", wait_seconds));
        }
    }
    
    // Actualizar timestamp para esta IP
    inner.rut_rate_limit.insert(client_ip.to_string(), now);
    Ok(())
}

/// Genera datos mock de empresa para el NIT dado
fn generate_mock_empresa_data(nit: &str) -> EmpresaData {
    // Generar datos mock basados en el NIT para consistencia
    let nit_num: u64 = nit.parse().unwrap_or(900123456);
    let company_types = ["SAS", "LTDA", "SA", "E.U.", "CORP"];
    let cities = ["BOGOTÁ", "MEDELLÍN", "CALI", "BARRANQUILLA", "CARTAGENA"];
    let states = ["ACTIVA", "ACTIVA", "ACTIVA", "SUSPENDIDA"]; // Más probabilidad de activa
    
    let type_idx = (nit_num % company_types.len() as u64) as usize;
    let city_idx = (nit_num % cities.len() as u64) as usize;
    let state_idx = (nit_num % states.len() as u64) as usize;
    
    EmpresaData {
        nit: nit.to_string(),
        razon_social: format!("EMPRESA DEMO {} {}", nit_num % 1000, company_types[type_idx]),
        direccion: format!("CALLE {} # {}-{}, {}", 
            (nit_num % 200) + 1, 
            (nit_num % 50) + 10, 
            (nit_num % 99) + 1, 
            cities[city_idx]
        ),
        telefono: format!("601{:07}", nit_num % 10000000),
        email: format!("contacto{}@empresa.com", nit_num % 1000),
        estado: states[state_idx].to_string(),
        tipo_contribuyente: if nit_num.is_multiple_of(3) { 
            "GRAN CONTRIBUYENTE".to_string() 
        } else { 
            "RÉGIMEN COMÚN".to_string() 
        },
    }
}

/// Maneja la consulta RUT con validación y rate limiting
async fn handle_consultar_rut(
    stream: &mut LanStream,
    body: &str,
    client_ip: &str,
    state: &Arc<Mutex<Option<ServerInner>>>,
) {
    // Parsear request
    let request: ConsultarRutRequest = match serde_json::from_str(body) {
        Ok(req) => req,
        Err(_) => {
            let response = ConsultarRutResponse {
                ok: false,
                error: Some("JSON inválido".to_string()),
                data: None,
            };
            let bytes = serde_json::to_vec(&response).unwrap_or_default();
            let _ = write_http_response(stream, 400, "Bad Request", "application/json", &bytes).await;
            return;
        }
    };
    
    // Validar NIT
    let validated_nit = match validate_nit(&request.nit) {
        Ok(nit) => nit,
        Err(error) => {
            let response = ConsultarRutResponse {
                ok: false,
                error: Some(error),
                data: None,
            };
            let bytes = serde_json::to_vec(&response).unwrap_or_default();
            let _ = write_http_response(stream, 400, "Bad Request", "application/json", &bytes).await;
            return;
        }
    };
    
    // Verificar rate limiting
    let rate_limit_result = {
        match state.lock() {
            Ok(mut guard) => {
                if let Some(inner) = guard.as_mut() {
                    check_rut_rate_limit(inner, client_ip)
                } else {
                    Err("Servidor no disponible".to_string())
                }
            }
            Err(_) => Err("Error interno del servidor".to_string())
        }
    };
    
    // Manejar errores de lock antes del rate limiting
    if let Err(error) = &rate_limit_result {
        if error == "Error interno del servidor" {
            let response = ConsultarRutResponse {
                ok: false,
                error: Some(error.clone()),
                data: None,
            };
            let bytes = serde_json::to_vec(&response).unwrap_or_default();
            let _ = write_http_response(stream, 500, "Internal Server Error", "application/json", &bytes).await;
            return;
        }
    }
    
    // Manejar el resultado del rate limiting
    if let Err(error) = rate_limit_result {
        let (status_code, status_text) = if error == "Servidor no disponible" {
            (503, "Service Unavailable")
        } else {
            (429, "Too Many Requests")
        };
        
        let response = ConsultarRutResponse {
            ok: false,
            error: Some(error),
            data: None,
        };
        let bytes = serde_json::to_vec(&response).unwrap_or_default();
        let _ = write_http_response(stream, status_code, status_text, "application/json", &bytes).await;
        return;
    }
    
    // Generar datos mock
    let empresa_data = generate_mock_empresa_data(&validated_nit);
    
    let response = ConsultarRutResponse {
        ok: true,
        error: None,
        data: Some(empresa_data),
    };
    
    let bytes = serde_json::to_vec(&response).unwrap_or_default();
    let _ = write_http_response(stream, 200, "OK", "application/json", &bytes).await;
}

/// Aplica POST /api/sync en memoria (cola + WS). Usado por HTTP y por invoke IPC
/// de la caja (evita CORS tauri.localhost ? 127.0.0.1).
pub fn ingest_api_sync(
    state: &Arc<Mutex<Option<ServerInner>>>,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let endpoint = "/api/sync".to_string();
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
    let is_ack = payload
        .get("type")
        .and_then(|t| t.as_str())
        .map(|t| t == "lan_action_ack")
        .unwrap_or(false);
    if is_ack {
        broadcast_lan_push(&endpoint, &payload);
        return Ok(serde_json::json!({ "ok": true, "ack": true }));
    }
    if is_pulse {
        if let Ok(txt) = serde_json::to_string(&payload.get("data").cloned().unwrap_or(payload.clone())) {
            let wrapped = format!("{{\"event\":\"lan_ops_pulse\",\"payload\":{}}}", txt);
            let _ = crozzo_lan_ws::broadcast_text(&wrapped);
        }
        return Ok(serde_json::json!({ "ok": true, "pulse": true }));
    }
    if let Some(aid) = extract_action_id(&payload) {
        let mut guard = state.lock().map_err(|e| e.to_string())?;
        if let Some(inner) = guard.as_mut() {
            if register_action_or_duplicate(inner, &aid) {
                return Ok(serde_json::json!({
                    "ok": true,
                    "duplicate": true,
                    "action_id": aid,
                    "message": "already_have"
                }));
            }
        }
        drop(guard);
    }
    if is_runtime {
        if let Some(data) = payload.get("data") {
            let mut guard = state.lock().map_err(|e| e.to_string())?;
            if let Some(inner) = guard.as_mut() {
                inner.runtime_snapshot = Some(data.clone());
                inner.runtime_saved_at = now_ms();
            }
        }
        broadcast_lan_push(&endpoint, &payload);
        return Ok(serde_json::json!({ "ok": true, "runtime": true }));
    }
    let typ_str = payload
        .get("type")
        .and_then(|t| t.as_str())
        .unwrap_or("");
    /* POE: presencia efímera — solo broadcast, sin pending ni mapa comandas */
    if typ_str == "slot_presence" {
        broadcast_lan_push(&endpoint, &payload);
        return Ok(serde_json::json!({ "ok": true, "ephemeral": true }));
    }
    let is_identity = typ_str == "identity_card"
        || typ_str == "identity"
        || typ_str == "fleet_roster"
        || typ_str == "identity_roster";
    if !is_identity {
        let mut guard = state.lock().map_err(|e| e.to_string())?;
        if let Some(inner) = guard.as_mut() {
            if let Some(hlc) = payload.get("hlc") {
                let rms = hlc.get("ms").and_then(|v| v.as_u64()).unwrap_or(0);
                let rct = hlc.get("counter").and_then(|v| v.as_u64()).unwrap_or(0) as u16;
                inner.hlc.observe(rms, rct);
            }
            upsert_comanda_snapshot(inner, &payload);
            if typ_str.to_ascii_lowercase().contains("comanda") {
                if let Some(db) = &inner.persistence {
                    let conn = db.conn.lock().unwrap();
                    let _ = crate::crozzo_lan_persistence::save_comandas(&conn, &inner.comandas_active);
                }
            }
        }
    }
    broadcast_lan_push(&endpoint, &payload);
    let sub = CrozzoLanSyncSubmission {
        id: format!("lan_{}_{}", now_ms(), rand_suffix()),
        received_at: now_ms(),
        endpoint: endpoint.clone(),
        payload: payload.clone(),
    };
    {
        let mut guard = state.lock().map_err(|e| e.to_string())?;
        if let Some(inner) = guard.as_mut() {
            inner.pending.push(sub.clone());
            if inner.pending.len() > PENDING_MAX {
                let overflow = inner.pending.len() - PENDING_MAX;
                inner.pending.drain(0..overflow);
            }
            let path = inner.pending_path.clone();
            save_pending(&path, &inner.pending);
            if let Some(db) = &inner.persistence {
                let conn = db.conn.lock().unwrap();
                let payload_str = serde_json::to_string(&payload).unwrap_or_default();
                let _ = crate::crozzo_lan_persistence::persist_pending(&conn, &sub.id, &endpoint, &payload_str);
                let hlc_clone = inner.hlc.clone();
                let _ = inner.hlc.now();
                let _ = crate::crozzo_lan_persistence::record_op(&conn, &sub.id, &hlc_clone, &payload_str);
            }
        }
    }
    Ok(serde_json::json!({ "ok": true, "id": sub.id, "durable": true, "action_id": extract_action_id(&payload) }))
}

/// Stream unificado (plano o TLS) para que el resto del handler sea agnóstico.
/// La detección TLS se hace por el primer byte (0x16 = TLS handshake).
enum LanStream {
    Plain(TcpStream),
    Tls(tokio_rustls::server::TlsStream<TcpStream>),
}

impl tokio::io::AsyncRead for LanStream {
    fn poll_read(
        self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
        buf: &mut tokio::io::ReadBuf<'_>,
    ) -> std::task::Poll<std::io::Result<()>> {
        match self.get_mut() {
            LanStream::Plain(s) => std::pin::Pin::new(s).poll_read(cx, buf),
            LanStream::Tls(s) => std::pin::Pin::new(s).poll_read(cx, buf),
        }
    }
}

impl tokio::io::AsyncWrite for LanStream {
    fn poll_write(
        self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
        buf: &[u8],
    ) -> std::task::Poll<std::io::Result<usize>> {
        match self.get_mut() {
            LanStream::Plain(s) => std::pin::Pin::new(s).poll_write(cx, buf),
            LanStream::Tls(s) => std::pin::Pin::new(s).poll_write(cx, buf),
        }
    }
    fn poll_flush(
        self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<std::io::Result<()>> {
        match self.get_mut() {
            LanStream::Plain(s) => std::pin::Pin::new(s).poll_flush(cx),
            LanStream::Tls(s) => std::pin::Pin::new(s).poll_flush(cx),
        }
    }
    fn poll_shutdown(
        self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<std::io::Result<()>> {
        match self.get_mut() {
            LanStream::Plain(s) => std::pin::Pin::new(s).poll_shutdown(cx),
            LanStream::Tls(s) => std::pin::Pin::new(s).poll_shutdown(cx),
        }
    }
}

async fn handle_connection(mut stream: TcpStream, state: Arc<Mutex<Option<ServerInner>>>) {
    // Obtener la IP del cliente para rate limiting (antes del handshake TLS).
    let client_ip = match stream.peer_addr() {
        Ok(addr) => addr.ip().to_string(),
        Err(_) => "unknown".to_string(),
    };

    // Detectar TLS: peek del primer byte (0x16 = TLS handshake record).
    let mut peek_buf = [0u8; 1];
    let is_tls = match stream.peek(&mut peek_buf).await {
        Ok(1) => peek_buf[0] == 0x16,
        _ => false,
    };
    // Si es TLS, hacer handshake con tokio-rustls antes de leer HTTP.
    let mut stream = if is_tls {
        let acceptor = match crate::crozzo_tls::tls_acceptor() {
            Ok(a) => a,
            Err(_) => return,
        };
        match acceptor.accept(stream).await {
            Ok(tls) => LanStream::Tls(tls),
            Err(_) => return,
        }
    } else {
        LanStream::Plain(stream)
    };
    // Lectura completa del request (cabeceras + body segun Content-Length).
    // Antes se hacia una sola lectura de 64KB, truncando bodies grandes o
    // partidos en varios paquetes TCP.
    let mut buf: Vec<u8> = Vec::with_capacity(8192);
    let mut tmp = [0u8; 8192];
    let deadline = tokio::time::Instant::now() + Duration::from_secs(8);
    // 1) Leer hasta tener las cabeceras completas.
    loop {
        if find_header_end(&buf).is_some() {
            break;
        }
        if buf.len() > 1_048_576 {
            return;
        }
        if tokio::time::Instant::now() >= deadline {
            if buf.is_empty() {
                return;
            }
            break;
        }
        match tokio::time::timeout(Duration::from_millis(200), stream.read(&mut tmp)).await {
            Ok(Ok(0)) => break,
            Ok(Ok(n)) => buf.extend_from_slice(&tmp[..n]),
            Ok(Err(_)) => return,
            Err(_) => {
                if buf.is_empty() {
                    return;
                }
                break;
            }
        }
    }
    let header_end = match find_header_end(&buf) {
        Some(i) => i,
        None => return,
    };
    // 2) Content-Length para saber cuantos bytes de body leer.
    let headers_str = String::from_utf8_lossy(&buf[..header_end]);
    let mut content_length: usize = 0;
    for line in headers_str.split("\r\n") {
        let lower = line.to_ascii_lowercase();
        if let Some(rest) = lower.strip_prefix("content-length:") {
            content_length = rest.trim().parse().unwrap_or(0);
            break;
        }
    }
    if content_length > 2_097_152 {
        return;
    }
    let total_needed = header_end + content_length;
    // 3) Leer el resto del body hasta completar Content-Length.
    while buf.len() < total_needed {
        if tokio::time::Instant::now() >= deadline {
            break;
        }
        match tokio::time::timeout(Duration::from_millis(200), stream.read(&mut tmp)).await {
            Ok(Ok(0)) => break,
            Ok(Ok(n)) => buf.extend_from_slice(&tmp[..n]),
            Ok(Err(_)) => break,
            Err(_) => break,
        }
    }
    let raw_text = String::from_utf8_lossy(&buf).to_string();
    let (method, path, body) = match parse_request(&buf) {
        Some(v) => v,
        None => return,
    };

    if method == "OPTIONS" {
        let _ = write_http_response(&mut stream, 204, "No Content", "text/plain", b"").await;
        return;
    }

    // Primero verificamos si el servidor está activo y obtenemos los datos necesarios
    let server_data = {
        let guard = state.lock().unwrap();
        guard.as_ref().map(|inner| (inner.meta.clone(), inner.port, inner.auth_token.clone()))
    };
    
    let (meta, port, auth_token) = match server_data {
        Some(data) => data,
        None => {
            let msg = b"{\"ok\":false,\"error\":\"server_stopped\"}";
            let _ = write_http_response(
                &mut stream,
                503,
                "Service Unavailable",
                "application/json",
                msg,
            ).await;
            return;
        }
    };

    // Auth de escritura: si la caja tiene token de pareo, las peticiones POST de
    // datos deben firmarse con la cabecera x-crozzo-lan-token. Los GET de
    // descubrimiento (/health, /status, /mesh-ping) quedan abiertos a propósito.
    let provided_token = header_value(&raw_text, LAN_AUTH_HEADER).unwrap_or_default();
    // Constant-time comparison of SHA-256 digests (evita fuga de longitud y contenido).
    let provided_hash = sha2::Sha256::digest(provided_token.as_bytes());
    let expected_hash = sha2::Sha256::digest(auth_token.as_bytes());
    let mut diff: u8 = 0;
    for (a, b) in provided_hash.iter().zip(expected_hash.iter()) {
        diff |= a ^ b;
    }
    let auth_ok = diff == 0;

    if method == "GET" && (path == "/health" || path == "/health/") {
        let msg = b"{\"ok\":true,\"service\":\"crozzo-lan-sync\"}";
        let _ = write_http_response(&mut stream, 200, "OK", "application/json", msg).await;
        return;
    }

    if method == "GET" && (path == "/status" || path == "/status/") {
        let (cloud_ok, cloud_at, comandas_active_count) = {
            let guard = state.lock().unwrap();
            guard
                .as_ref()
                .map(|s| {
                    (
                        s.cloud_reachable,
                        s.cloud_reachable_at_ms,
                        s.comandas_active.len(),
                    )
                })
                .unwrap_or((false, 0, 0))
        };
        let resp = serde_json::json!({
            "ok": true,
            "role": "A",
            "is_active_server": true,
            "location_id": meta.location_id,
            "device_id": meta.device_id,
            "business_id": meta.business_id,
            "service": "crozzo-lan-sync",
            "port": port,
            "cloud_reachable": cloud_ok,
            "cloud_reachable_at_ms": cloud_at,
            "comandas_active_count": comandas_active_count,
            "comandas_active_max": COMANDAS_ACTIVE_MAX
        });
        let bytes = serde_json::to_vec(&resp).unwrap_or_else(|_| b"{\"ok\":true}".to_vec());
        let _ = write_http_response(&mut stream, 200, "OK", "application/json", &bytes).await;
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
            ).await;
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
        let _ = write_http_response(&mut stream, 200, "OK", "application/json", &bytes).await;
        return;
    }

    if method == "GET"
        && (path == "/mesh-ping"
            || path == "/mesh-ping/"
            || path == "/mesh-ping.json"
            || path == "/mesh-ping.json/")
    {
        let bytes = mesh_ping_json(&meta, port);
        let _ = write_http_response(&mut stream, 200, "OK", "application/json", &bytes).await;
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
        let _ = write_http_response(&mut stream, 200, "OK", "application/json", &bytes).await;
        return;
    }

    if method == "GET" && (path == "/api/ops-digest" || path.starts_with("/api/ops-digest?")) {
        if !auth_ok {
            let _ = write_http_response(&mut stream, 401, "Unauthorized", "application/json", b"{\"ok\":false,\"error\":\"auth_required\"}").await;
            return;
        }
        let (rows, runtime_saved): (Vec<serde_json::Value>, String) = {
            let guard = state.lock().unwrap();
            match guard.as_ref() {
                Some(inner) => (
                    inner.comandas_active.values().cloned().collect(),
                    inner.runtime_saved_at.clone(),
                ),
                None => (Vec::new(), String::new()),
            }
        };
        let resp = ops_digest_from_comandas(&rows, &runtime_saved);
        let bytes = serde_json::to_vec(&resp).unwrap_or_else(|_| b"{\"ok\":false}".to_vec());
        let _ = write_http_response(&mut stream, 200, "OK", "application/json", &bytes).await;
        return;
    }

    if method == "GET" && (path == "/api/comandas" || path.starts_with("/api/comandas?")) {
        if !auth_token.is_empty() && !auth_ok {
            let _ = write_http_response(&mut stream, 401, "Unauthorized", "application/json", b"{\"ok\":false,\"error\":\"unauthorized\"}").await;
            return;
        }
        // Parametro opcional ?since=<ms> para sync incremental.
        let mut since_ms: i64 = 0;
        if let Some(q) = path.split('?').nth(1) {
            for pair in q.split('&') {
                let mut kv = pair.splitn(2, '=');
                let k = kv.next().unwrap_or("");
                let v = kv.next().unwrap_or("");
                if k == "since" {
                    since_ms = v.parse::<i64>().unwrap_or(0);
                }
            }
        }
        let (rows_all, runtime_saved): (Vec<serde_json::Value>, String) = {
            let guard = state.lock().unwrap();
            match guard.as_ref() {
                Some(inner) => (
                    inner.comandas_active.values().cloned().collect(),
                    inner.runtime_saved_at.clone(),
                ),
                None => (Vec::new(), String::new()),
            }
        };
        let rows: Vec<serde_json::Value> = if since_ms > 0 {
            rows_all
                .into_iter()
                .filter(|r| {
                    let at = comanda_row_at_ms(r);
                    at == 0 || at > since_ms
                })
                .collect()
        } else {
            rows_all
        };
        let digest = ops_digest_from_comandas(&rows, &runtime_saved);
        let resp = serde_json::json!({
            "ok": true,
            "comandas": rows,
            "count": rows.len(),
            "saved_at": runtime_saved.clone(),
            "digest": digest,
            "since": since_ms
        });
        let bytes = serde_json::to_vec(&resp).unwrap_or_else(|_| b"{\"ok\":true,\"comandas\":[]}".to_vec());
        let _ = write_http_response(&mut stream, 200, "OK", "application/json", &bytes).await;
        return;
    }

    if method == "GET" && (path == "/api/runtime" || path.starts_with("/api/runtime?")) {
        if !auth_ok {
            let _ = write_http_response(&mut stream, 401, "Unauthorized", "application/json", b"{\"ok\":false,\"error\":\"auth_required\"}").await;
            return;
        }
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
        let _ = write_http_response(&mut stream, 200, "OK", "application/json", &bytes).await;
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
            ).await;
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
                ).await;
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
        let _ = write_http_response(&mut stream, 200, "OK", "application/json", &bytes).await;
        return;
    }

    // Endpoint para consultar RUT
    if method == "POST" && (path == "/api/consultar-rut" || path == "/api/consultar-rut/") {
        if !auth_ok {
            let _ = write_http_response(
                &mut stream,
                401,
                "Unauthorized",
                "application/json",
                b"{\"ok\":false,\"error\":\"auth_required\"}",
            ).await;
            return;
        }
        handle_consultar_rut(&mut stream, &body, &client_ip, &state).await;
        return;
    }

    if method == "POST" {
        if let Some(_endpoint) = normalize_api_path(&path) {
            if !auth_ok {
                let _ = write_http_response(
                    &mut stream,
                    401,
                    "Unauthorized",
                    "application/json",
                    b"{\"ok\":false,\"error\":\"auth_required\"}",
                ).await;
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
                    ).await;
                    return;
                }
            };
            match ingest_api_sync(&state, payload) {
                Ok(resp) => {
                    let bytes = serde_json::to_vec(&resp).unwrap_or_else(|_| b"{\"ok\":true}".to_vec());
                    let _ = write_http_response(&mut stream, 200, "OK", "application/json", &bytes).await;
                }
                Err(err) => {
                    let msg = format!("{{\"ok\":false,\"error\":\"{}\"}}", err.replace('"', "'"));
                    let _ = write_http_response(
                        &mut stream,
                        503,
                        "Service Unavailable",
                        "application/json",
                        msg.as_bytes(),
                    ).await;
                }
            }
            return;
        }
    }

    let _ = write_http_response(&mut stream, 404, "Not Found", "application/json", b"{\"ok\":false,\"error\":\"not_found\"}").await;
}

async fn run_server(state: Arc<Mutex<Option<ServerInner>>>, listener: TcpListener) {
    loop {
        {
            let guard = state.lock().unwrap();
            if guard.as_ref().map(|s| s.stop).unwrap_or(true) {
                break;
            }
        }
        match listener.accept().await {
            Ok((stream, _)) => {
                let st = Arc::clone(&state);
                let sem = Arc::clone(http_conn_semaphore());
                tokio::spawn(async move {
                    let permit = match sem.acquire_owned().await {
                        Ok(p) => p,
                        Err(_) => return,
                    };
                    handle_connection(stream, st).await;
                    drop(permit);
                });
            }
            Err(e) => {
                eprintln!("[lan-sync] accept: {}", e);
                tokio::time::sleep(Duration::from_millis(200)).await;
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
#[allow(clippy::too_many_arguments)]
pub async fn crozzo_lan_sync_start(
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
        return Err("Puerto inválido (use = 1024)".into());
    }
    let auth_token = auth_token.unwrap_or_default().trim().to_string();
    if auth_token.is_empty() {
        return Err("Token de autenticación LAN vacío: configura un token de pareo antes de iniciar el servidor (seguridad).".into());
    }
    // F2.1: tracing (JSON opcional via RUST_LOG).
    let _ = tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .with_target(false)
        .try_init();
    tracing::info!(port = port, "crozzo lan sync starting");
    let _lifecycle = lifecycle_lock().lock().await;
    {
        let guard = shared_state().lock().map_err(|e| e.to_string())?;
        if let Some(inner) = guard.as_ref() {
            if !inner.stop && inner.port == port {
                return Ok(status_from_inner(inner));
            }
        }
    }
    crozzo_lan_sync_stop_inner()?;
    tokio::time::sleep(Duration::from_millis(PORT_RELEASE_WAIT_MS)).await;
    let lan_ip = crate::crozzo_mdns::guess_local_ipv4();
    if lan_ip.is_loopback() {
        return Err("No se detecto IP LAN (solo loopback); no se permite bind a 0.0.0.0 por seguridad.".into());
    }
    let bind_ip = lan_ip.to_string();
    let addr = format!("{}:{}", bind_ip, port);
    let listener = TcpListener::bind(&addr).await.map_err(|e| {
        format!("No se pudo abrir el puerto {}: {}", port, e)
    })?;
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
    let pending_path = pending_file_in(&data_dir.clone().unwrap_or_default());
    let persistence_db = data_dir.as_ref().and_then(|d| {
        let p = std::path::PathBuf::from(d).join("crozzo_lan.db");
        crate::crozzo_lan_persistence::PersistenceDb::open(&p).ok()
    });
    let restored_comandas = persistence_db.as_ref().map(|db| {
        let conn = db.conn.lock().unwrap();
        crate::crozzo_lan_persistence::load_comandas(&conn)
    }).unwrap_or_default();
    // Restaurar pending desde SQLite (fallback JSON si vacío).
    let restored = if let Some(db) = &persistence_db {
        let conn = db.conn.lock().unwrap();
        let rows = crate::crozzo_lan_persistence::load_pending(&conn);
        if rows.is_empty() {
            load_pending(&pending_path)
        } else {
            rows.into_iter().map(|(id, endpoint, payload)| {
                let payload_val = serde_json::from_str(&payload).unwrap_or_else(|_| serde_json::json!({}));
                CrozzoLanSyncSubmission {
                    id,
                    received_at: now_ms(),
                    endpoint,
                    payload: payload_val,
                }
            }).collect()
        }
    } else {
        load_pending(&pending_path)
    };
    let shared = Arc::clone(shared_state());
    {
        let mut guard = shared.lock().map_err(|e| e.to_string())?;
        *guard = Some(ServerInner {
            port,
            meta: meta.clone(),
            cloud_reachable: false,
            cloud_reachable_at_ms: 0,
            pending: restored,
            in_flight: HashMap::new(),
            runtime_snapshot: None,
            runtime_saved_at: String::new(),
            comandas_active: restored_comandas,
            seen_actions: HashMap::new(),
            p2p_signals: Vec::new(),
            auth_token,
            pending_path,
            rut_rate_limit: HashMap::new(),
            stop: false,
            persistence: persistence_db,
            hlc: crate::crozzo_lan_persistence::Hlc::new(meta.device_id.clone()),
        });
    }
    let st = Arc::clone(&shared);
    let handle = if std::env::var("CROZZO_USE_AXUM").unwrap_or_default() == "1" {
        tokio::spawn(crate::crozzo_lan_sync_axum::run_axum_server(st, listener))
    } else {
        tokio::spawn(run_server(st, listener))
    };
    {
        let mut th = server_thread().lock().map_err(|e| e.to_string())?;
        *th = Some(handle);
    }
    let ws_port = port.saturating_add(1);
    if let Err(e) = crozzo_lan_ws::crozzo_lan_ws_start(Some(ws_port)).await {
        let _ = crozzo_lan_sync_stop_inner();
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

fn crozzo_lan_sync_stop_inner() -> Result<CrozzoLanSyncStatus, String> {
    let shared = Arc::clone(shared_state());
    {
        let mut guard = shared.lock().map_err(|e| e.to_string())?;
        if let Some(inner) = guard.as_mut() {
            inner.stop = true;
        }
    }
    let mut th = server_thread().lock().map_err(|e| e.to_string())?;
    if let Some(handle) = th.take() {
        handle.abort();
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
pub fn crozzo_lan_sync_stop() -> Result<CrozzoLanSyncStatus, String> {
    // Sin block_on: evita panic "Cannot start a runtime from within a runtime".
    crozzo_lan_sync_stop_inner()
}

#[tauri::command]
pub fn crozzo_lan_sync_set_cloud_reachable(reachable: bool) -> Result<bool, String> {
    let mut guard = shared_state().lock().map_err(|e| e.to_string())?;
    if let Some(inner) = guard.as_mut() {
        inner.cloud_reachable = reachable;
        if reachable {
            inner.cloud_reachable_at_ms = now_ms_u128();
        }
        return Ok(inner.cloud_reachable);
    }
    Ok(false)
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

/// Escritura LAN desde el WebView de la caja (IPC nativo, sin CORS HTTP).
#[tauri::command]
pub fn crozzo_lan_sync_post(body: String) -> Result<serde_json::Value, String> {
    let payload: serde_json::Value =
        serde_json::from_str(body.trim()).map_err(|e| format!("invalid_json: {}", e))?;
    ingest_api_sync(shared_state(), payload)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn header_end_uses_real_crlf_bytes() {
        let req = b"GET /health HTTP/1.1\r\nHost: 192.168.1.15\r\n\r\n";
        let end = find_header_end(req).expect("debe detectar CRLFCRLF real");
        assert_eq!(end, req.len());
    }

    #[test]
    fn header_end_rejects_literal_backslash_text() {
        let req = b"GET /health HTTP/1.1\\r\\nHost: x\\r\\n\\r\\n";
        assert_eq!(find_header_end(req), None);
    }

    #[test]
    fn parse_request_reads_method_path_and_body() {
        let req = b"POST /api/sync HTTP/1.1\r\nContent-Length: 2\r\n\r\n{}";
        let (method, path, body) = parse_request(req).expect("parse ok");
        assert_eq!(method, "POST");
        assert_eq!(path, "/api/sync");
        assert_eq!(body, "{}");
    }

    /// Regresión del bug v1.0.274: con un request HTTP válido el servidor debe
    /// escribir una respuesta HTTP (aquí 503 porque el estado está vacío) en
    /// lugar de cerrar la conexión sin enviar nada.
    #[tokio::test]
    async fn connection_responds_instead_of_closing_without_reply() {
        let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind");
        let addr = listener.local_addr().expect("addr");
        let state: Arc<Mutex<Option<ServerInner>>> = Arc::new(Mutex::new(None));
        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.expect("accept");
            handle_connection(stream, state).await;
        });

        let mut client = TcpStream::connect(addr).await.expect("connect");
        client
            .write_all(b"GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n")
            .await
            .expect("write");
        let mut buf = Vec::new();
        let read = tokio::time::timeout(Duration::from_secs(3), client.read_to_end(&mut buf)).await;
        assert!(read.is_ok(), "el servidor debe cerrar tras responder, no colgar");
        let text = String::from_utf8_lossy(&buf);
        assert!(
            text.starts_with("HTTP/1.1 "),
            "debe responder HTTP; recibido: {:?}",
            text
        );
        assert!(text.contains("\r\n\r\n"), "debe incluir fin de cabeceras");
        let _ = server.await;
    }
}
