//! WebSocket LAN — push en tiempo real a tablets (puerto HTTP+1, ej. 3001).
//! Soporta WS plano (backward compat) y WSS (TLS) por detección del primer
//! byte 0x16 (TLS handshake record), igual que el servidor HTTP LAN.

use serde_json::json;
use std::pin::Pin;
use std::sync::{Arc, Mutex, OnceLock};
use std::task::{Context, Poll};
use std::time::Duration;
use tokio::io::{AsyncRead, AsyncWrite, ReadBuf};
use tokio::net::{TcpListener, TcpStream};
use tokio_tungstenite::{accept_async, tungstenite::Message, WebSocketStream};
use tokio_rustls::server::TlsStream;

/// Stream unificado (plano o TLS) para que el resto del handler sea agnóstico.
enum WsTransport {
    Plain(TcpStream),
    Tls(TlsStream<TcpStream>),
}

impl AsyncRead for WsTransport {
    fn poll_read(self: Pin<&mut Self>, cx: &mut Context<'_>, buf: &mut ReadBuf<'_>) -> Poll<std::io::Result<()>> {
        match self.get_mut() {
            WsTransport::Plain(s) => Pin::new(s).poll_read(cx, buf),
            WsTransport::Tls(s) => Pin::new(s).poll_read(cx, buf),
        }
    }
}

impl AsyncWrite for WsTransport {
    fn poll_write(self: Pin<&mut Self>, cx: &mut Context<'_>, buf: &[u8]) -> Poll<std::io::Result<usize>> {
        match self.get_mut() {
            WsTransport::Plain(s) => Pin::new(s).poll_write(cx, buf),
            WsTransport::Tls(s) => Pin::new(s).poll_write(cx, buf),
        }
    }
    fn poll_flush(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        match self.get_mut() {
            WsTransport::Plain(s) => Pin::new(s).poll_flush(cx),
            WsTransport::Tls(s) => Pin::new(s).poll_flush(cx),
        }
    }
    fn poll_shutdown(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        match self.get_mut() {
            WsTransport::Plain(s) => Pin::new(s).poll_shutdown(cx),
            WsTransport::Tls(s) => Pin::new(s).poll_shutdown(cx),
        }
    }
}

// Los streams subyacentes son Unpin; el enum compuesto también.
impl Unpin for WsTransport {}

type WsConn = WebSocketStream<WsTransport>;

struct WsInner {
    port: u16,
    stop: bool,
    conns: Vec<Arc<tokio::sync::Mutex<WsConn>>>,
    rt: tokio::runtime::Handle,
}

fn hub() -> &'static Arc<Mutex<Option<WsInner>>> {
    static H: OnceLock<Arc<Mutex<Option<WsInner>>>> = OnceLock::new();
    H.get_or_init(|| Arc::new(Mutex::new(None)))
}

fn ws_thread_handle() -> &'static Mutex<Option<tokio::task::JoinHandle<()>>> {
    static T: OnceLock<Mutex<Option<tokio::task::JoinHandle<()>>>> = OnceLock::new();
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
    let rt = inner.rt.clone();
    let mut sent = 0;
    for c in &inner.conns {
        let conn = Arc::clone(c);
        let msg = Message::Text(json_text.to_string());
        rt.spawn(async move {
            // Esperar el lock (no try_lock ciego) para no perder el mensaje.
            let mut w = conn.lock().await;
            use futures_util::SinkExt;
            let _ = w.send(msg).await;
        });
        sent += 1;
    }
    sent
}

async fn handle_ws_client(stream: TcpStream, shared: Arc<Mutex<Option<WsInner>>>) {
    // Detección TLS: peek del primer byte (0x16 = TLS handshake record).
    let mut peek_buf = [0u8; 1];
    let is_tls = match stream.peek(&mut peek_buf).await {
        Ok(1) => peek_buf[0] == 0x16,
        _ => false,
    };
    // Si es TLS, handshake con tokio-rustls antes de accept_async (backward compat: plano si no).
    let transport = if is_tls {
        let acceptor = match crate::crozzo_tls::tls_acceptor() {
            Ok(a) => a,
            Err(e) => {
                eprintln!("[lan-ws] tls acceptor: {e}");
                return;
            }
        };
        match acceptor.accept(stream).await {
            Ok(tls) => WsTransport::Tls(tls),
            Err(e) => {
                eprintln!("[lan-ws] tls handshake: {e}");
                return;
            }
        }
    } else {
        WsTransport::Plain(stream)
    };

    let ws = match accept_async(transport).await {
        Ok(w) => w,
        Err(e) => {
            eprintln!("[lan-ws] handshake: {e}");
            return;
        }
    };
    let arc = Arc::new(tokio::sync::Mutex::new(ws));
    {
        if let Ok(mut g) = shared.lock() {
            if let Some(inner) = g.as_mut() {
                inner.conns.push(Arc::clone(&arc));
            }
        }
    }
    loop {
        let msg = {
            let mut w = arc.lock().await;
            use futures_util::StreamExt;
            w.next().await
        };
        match msg {
            Some(Ok(Message::Close(_))) | None => break,
            Some(Ok(Message::Ping(data))) => {
                let mut w = arc.lock().await;
                use futures_util::SinkExt;
                let _ = w.send(Message::Pong(data)).await;
            }
            Some(Ok(_)) => {}
            Some(Err(_)) => break,
        }
    }
    if let Ok(mut g) = shared.lock() {
        if let Some(inner) = g.as_mut() {
            inner.conns.retain(|c| !Arc::ptr_eq(c, &arc));
        }
    }
}

async fn run_ws_server(shared: Arc<Mutex<Option<WsInner>>>, listener: TcpListener) {
    loop {
        let stop = shared
            .lock()
            .ok()
            .and_then(|g| g.as_ref().map(|i| i.stop))
            .unwrap_or(true);
        if stop {
            break;
        }
        match listener.accept().await {
            Ok((stream, _)) => {
                let sh = Arc::clone(&shared);
                tokio::spawn(async move {
                    handle_ws_client(stream, sh).await;
                });
            }
            Err(e) => {
                eprintln!("[lan-ws] accept: {e}");
                tokio::time::sleep(Duration::from_millis(180)).await;
            }
        }
    }
}

#[tauri::command]
pub async fn crozzo_lan_ws_start(ws_port: Option<u16>) -> Result<serde_json::Value, String> {
    crozzo_lan_ws_stop()?;
    let port = ws_port.unwrap_or(3001);
    if port < 1024 {
        return Err("Puerto WS inválido".into());
    }
    let lan_ip = crate::crozzo_mdns::guess_local_ipv4();
    if lan_ip.is_loopback() {
        return Err("No se detecto IP LAN (solo loopback); no se permite bind WS a 0.0.0.0 por seguridad.".into());
    }
    let addr = format!("{}:{}", lan_ip, port);
    let listener = TcpListener::bind(&addr).await.map_err(|e| format!("No se pudo abrir el puerto WS {port}: {e}"))?;
    let shared = Arc::clone(hub());
    {
        let mut g = shared.lock().map_err(|e| e.to_string())?;
        *g = Some(WsInner {
            port,
            stop: false,
            conns: Vec::new(),
            rt: tokio::runtime::Handle::current(),
        });
    }
    let sh = Arc::clone(&shared);
    let handle = tokio::spawn(async move {
        run_ws_server(sh, listener).await;
    });
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
            h.abort();
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

/// Estado TLS para el canal WS: reutiliza el estado del módulo TLS global y
/// añade el estado de ejecución del servidor WS. Permite a clientes/UI saber
/// si el WS puede aceptar conexiones WSS (detección automática por 0x16).
#[tauri::command]
pub fn crozzo_lan_ws_tls_status() -> Result<serde_json::Value, String> {
    let tls = crate::crozzo_tls::crozzo_lan_tls_status();
    let ws = crozzo_lan_ws_status()?;
    Ok(json!({
        "ws": ws,
        "tls": tls,
        "wss_available": true,
    }))
}