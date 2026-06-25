//! WebSocket LAN — push en tiempo real a tablets (puerto HTTP+1, ej. 3001).

use serde_json::json;
use std::io::ErrorKind;
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::Duration;
use tungstenite::{accept, Message, WebSocket};

type WsConn = WebSocket<TcpStream>;

struct WsInner {
    port: u16,
    stop: bool,
    conns: Vec<Arc<Mutex<WsConn>>>,
}

fn hub() -> &'static Arc<Mutex<Option<WsInner>>> {
    static H: OnceLock<Arc<Mutex<Option<WsInner>>>> = OnceLock::new();
    H.get_or_init(|| Arc::new(Mutex::new(None)))
}

fn ws_thread_handle() -> &'static Mutex<Option<thread::JoinHandle<()>>> {
    static T: OnceLock<Mutex<Option<thread::JoinHandle<()>>>> = OnceLock::new();
    T.get_or_init(|| Mutex::new(None))
}

pub fn broadcast_text(json_text: &str) -> usize {
    let Ok(guard) = hub().lock() else {
        return 0;
    };
    let Some(inner) = guard.as_ref() else {
        return 0;
    };
    if inner.stop {
        return 0;
    }
    let mut sent = 0;
    for c in &inner.conns {
        if let Ok(mut w) = c.lock() {
            if w.send(Message::Text(json_text.to_string())).is_ok() {
                sent += 1;
            }
        }
    }
    sent
}

fn handle_ws_client(stream: TcpStream, shared: Arc<Mutex<Option<WsInner>>>) {
    let ws = match accept(stream) {
        Ok(w) => w,
        Err(e) => {
            eprintln!("[lan-ws] handshake: {e}");
            return;
        }
    };
    let arc = Arc::new(Mutex::new(ws));
    {
        if let Ok(mut g) = shared.lock() {
            if let Some(inner) = g.as_mut() {
                inner.conns.push(Arc::clone(&arc));
            }
        }
    }
    loop {
        let msg = { arc.lock().ok().and_then(|mut w| w.read().ok()) };
        match msg {
            Some(Message::Close(_)) | None => break,
            Some(Message::Ping(data)) => {
                if let Ok(mut w) = arc.lock() {
                    let _ = w.send(Message::Pong(data));
                }
            }
            Some(_) => {}
        }
    }
    if let Ok(mut g) = shared.lock() {
        if let Some(inner) = g.as_mut() {
            inner.conns.retain(|c| !Arc::ptr_eq(c, &arc));
        }
    }
}

fn run_ws_server(shared: Arc<Mutex<Option<WsInner>>>, listener: TcpListener) {
    loop {
        let stop = shared
            .lock()
            .ok()
            .and_then(|g| g.as_ref().map(|i| i.stop))
            .unwrap_or(true);
        if stop {
            break;
        }
        match listener.accept() {
            Ok((stream, _)) => {
                let sh = Arc::clone(&shared);
                thread::spawn(move || handle_ws_client(stream, sh));
            }
            Err(ref e) if e.kind() == ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(45));
            }
            Err(e) => {
                eprintln!("[lan-ws] accept: {e}");
                thread::sleep(Duration::from_millis(180));
            }
        }
    }
}

#[tauri::command]
pub fn crozzo_lan_ws_start(ws_port: Option<u16>) -> Result<serde_json::Value, String> {
    crozzo_lan_ws_stop()?;
    let port = ws_port.unwrap_or(3001);
    if port < 1024 {
        return Err("Puerto WS inválido".into());
    }
    let addr = format!("0.0.0.0:{port}");
    let listener = TcpListener::bind(&addr).map_err(|e| format!("No se pudo abrir el puerto WS {port}: {e}"))?;
    let _ = listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let shared = Arc::clone(hub());
    {
        let mut g = shared.lock().map_err(|e| e.to_string())?;
        *g = Some(WsInner {
            port,
            stop: false,
            conns: Vec::new(),
        });
    }
    let sh = Arc::clone(&shared);
    let handle = thread::spawn(move || run_ws_server(sh, listener));
    if let Ok(mut th) = ws_thread_handle().lock() {
        *th = Some(handle);
    }
    crozzo_lan_ws_status()
}

#[tauri::command]
pub fn crozzo_lan_ws_stop() -> Result<serde_json::Value, String> {
    {
        let mut g = hub().lock().map_err(|e| e.to_string())?;
        if let Some(inner) = g.as_mut() {
            inner.stop = true;
            inner.conns.clear();
        }
        *g = None;
    }
    if let Ok(mut th) = ws_thread_handle().lock() {
        if let Some(h) = th.take() {
            let _ = h.join();
        }
    }
    Ok(json!({ "running": false, "port": 0, "clients": 0 }))
}

#[tauri::command]
pub fn crozzo_lan_ws_status() -> Result<serde_json::Value, String> {
    let g = hub().lock().map_err(|e| e.to_string())?;
    match g.as_ref() {
        Some(i) if !i.stop => Ok(json!({
            "running": true,
            "port": i.port,
            "clients": i.conns.len()
        })),
        _ => Ok(json!({ "running": false, "port": 0, "clients": 0 })),
    }
}

#[tauri::command]
pub fn crozzo_lan_ws_broadcast(json: String) -> Result<usize, String> {
    let body = json.trim();
    if body.is_empty() {
        return Err("payload vacío".into());
    }
    Ok(broadcast_text(body))
}
