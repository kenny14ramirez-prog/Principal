use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::time::Duration;

/// Inicia un listener one-shot en 127.0.0.1:0 y devuelve (puerto, código, state).
/// Bloquea hasta recibir un GET /callback?code=...&state=... o timeout (120s).
#[tauri::command]
pub async fn crozzo_oauth_loopback_start(
    expected_state: String,
    timeout_secs: Option<u64>,
) -> Result<(u16, String, String), String> {
    let timeout = Duration::from_secs(timeout_secs.unwrap_or(120));
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| format!("bind: {e}"))?;
    let port = listener.local_addr().map_err(|e| format!("addr: {e}"))?.port();
    listener.set_nonblocking(true).map_err(|e| format!("nonblocking: {e}"))?;

    let start = std::time::Instant::now();
    loop {
        if start.elapsed() > timeout {
            return Err("timeout esperando callback OAuth".into());
        }
        match listener.accept() {
            Ok((mut stream, _)) => {
                stream.set_read_timeout(Some(Duration::from_secs(5))).ok();
                let mut reader = BufReader::new(&stream);
                let mut request_line = String::new();
                if reader.read_line(&mut request_line).is_err() {
                    continue;
                }
                // Parsear path
                let path = request_line.split_whitespace().nth(1).unwrap_or("");
                if !path.starts_with("/callback") {
                    let _ = write!(stream, "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n");
                    continue;
                }
                // Extraer query params
                let query = path.split('?').nth(1).unwrap_or("");
                let mut code = String::new();
                let mut state = String::new();
                for pair in query.split('&') {
                    let mut kv = pair.splitn(2, '=');
                    let k = kv.next().unwrap_or("");
                    let v = kv.next().unwrap_or("");
                    let v = urlencoding_decode(v);
                    if k == "code" { code = v.clone(); }
                    if k == "state" { state = v; }
                }
                // Validar state
                if state != expected_state {
                    let _ = write!(stream, "HTTP/1.1 400 Bad Request\r\nContent-Type: text/plain\r\n\r\nstate mismatch");
                    continue;
                }
                // Responder OK
                let body = "<html><body><h1>Login exitoso</h1><p>Puede cerrar esta ventana.</p></body></html>";
                let _ = write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body);
                return Ok((port, code, state));
            }
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(_) => {
                std::thread::sleep(Duration::from_millis(100));
            }
        }
    }
}

fn urlencoding_decode(s: &str) -> String {
    // Decodificación mínima de %XX
    let mut out = String::with_capacity(s.len());
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(b) = u8::from_str_radix(&s[i+1..i+3], 16) {
                out.push(b as char);
                i += 3;
                continue;
            }
        }
        if bytes[i] == b'+' {
            out.push(' ');
        } else {
            out.push(bytes[i] as char);
        }
        i += 1;
    }
    out
}