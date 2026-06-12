//! Transporte UDP para gossip offline entre tablets (broadcast + multicast).
//! Solo relay de JSON; la lógica de protocolo vive en CrozzoOfflineGossip.js.

use serde::Serialize;
use std::collections::HashMap;
use std::io;
use std::net::{Ipv4Addr, SocketAddr, UdpSocket};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const GOSSIP_PORT: u16 = 45777;
const MCAST_IP: Ipv4Addr = Ipv4Addr::new(239, 255, 77, 88);
const MAX_QUEUE: usize = 256;
const MAX_PEERS: usize = 120;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CrozzoGossipUdpStatus {
    pub running: bool,
    pub device_id: String,
    pub peer_count: usize,
    pub queue_depth: usize,
}

struct Inner {
    device_id: String,
    running: bool,
    stop: bool,
    rx_queue: Vec<String>,
    peers: HashMap<String, u64>,
}

fn shared() -> &'static Arc<Mutex<Inner>> {
    static STATE: OnceLock<Arc<Mutex<Inner>>> = OnceLock::new();
    STATE.get_or_init(|| {
        Arc::new(Mutex::new(Inner {
            device_id: String::new(),
            running: false,
            stop: false,
            rx_queue: Vec::new(),
            peers: HashMap::new(),
        }))
    })
}

fn recv_handle() -> &'static Mutex<Option<thread::JoinHandle<()>>> {
    static H: OnceLock<Mutex<Option<thread::JoinHandle<()>>>> = OnceLock::new();
    H.get_or_init(|| Mutex::new(None))
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn open_listen_socket() -> Result<UdpSocket, String> {
    let bind_addr = SocketAddr::from(([0, 0, 0, 0], GOSSIP_PORT));
    let sock = UdpSocket::bind(bind_addr).map_err(|e| format!("bind gossip {e}"))?;
    sock.set_broadcast(true).map_err(|e| e.to_string())?;
    sock.set_nonblocking(true).map_err(|e| e.to_string())?;
    let iface = Ipv4Addr::UNSPECIFIED;
    sock.join_multicast_v4(&MCAST_IP, &iface)
        .map_err(|e| format!("multicast join {e}"))?;
    Ok(sock)
}

fn touch_peer(inner: &mut Inner, device_id: &str) {
    if device_id.is_empty() || device_id == inner.device_id {
        return;
    }
    inner.peers.insert(device_id.to_string(), now_ms());
    if inner.peers.len() > MAX_PEERS {
        let cutoff = now_ms().saturating_sub(120_000);
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

fn recv_loop(sock: UdpSocket) {
    let mut buf = [0u8; 8192];
    loop {
        {
            let inner = shared().lock().unwrap();
            if inner.stop {
                break;
            }
        }
        match sock.recv_from(&mut buf) {
            Ok((n, _)) => {
                if n == 0 || n > buf.len() {
                    continue;
                }
                let text = match std::str::from_utf8(&buf[..n]) {
                    Ok(s) => s.to_string(),
                    Err(_) => continue,
                };
                let mut inner = shared().lock().unwrap();
                if let Some(did) = extract_device_id(&text) {
                    touch_peer(&mut inner, &did);
                }
                if inner.rx_queue.len() >= MAX_QUEUE {
                    inner.rx_queue.remove(0);
                }
                inner.rx_queue.push(text);
            }
            Err(e) if e.kind() == io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(35));
            }
            Err(_) => thread::sleep(Duration::from_millis(180)),
        }
    }
}

fn send_raw(json: &str) -> Result<(), String> {
    let sock = UdpSocket::bind("0.0.0.0:0").map_err(|e| e.to_string())?;
    sock.set_broadcast(true).map_err(|e| e.to_string())?;
    let bytes = json.as_bytes();
    let bcast = SocketAddr::from(([255, 255, 255, 255], GOSSIP_PORT));
    sock.send_to(bytes, bcast).map_err(|e| e.to_string())?;
    let mcast = SocketAddr::from((MCAST_IP, GOSSIP_PORT));
    sock.send_to(bytes, mcast).ok();
    Ok(())
}

fn status_locked(inner: &Inner) -> CrozzoGossipUdpStatus {
    let cutoff = now_ms().saturating_sub(45_000);
    let peer_count = inner
        .peers
        .values()
        .filter(|t| **t >= cutoff)
        .count();
    CrozzoGossipUdpStatus {
        running: inner.running,
        device_id: inner.device_id.clone(),
        peer_count,
        queue_depth: inner.rx_queue.len(),
    }
}

#[tauri::command]
pub fn crozzo_gossip_udp_start(device_id: String) -> Result<CrozzoGossipUdpStatus, String> {
    let did = device_id.trim().to_string();
    if did.is_empty() {
        return Err("device_id vacío".into());
    }
    {
        let mut inner = shared().lock().unwrap();
        if inner.running {
            inner.device_id = did;
            return Ok(status_locked(&inner));
        }
        inner.device_id = did;
        inner.stop = false;
        inner.running = true;
        inner.rx_queue.clear();
    }
    let sock = open_listen_socket()?;
    let handle = thread::spawn(move || recv_loop(sock));
    *recv_handle().lock().unwrap() = Some(handle);
    Ok(status_locked(&shared().lock().unwrap()))
}

#[tauri::command]
pub fn crozzo_gossip_udp_stop() -> Result<CrozzoGossipUdpStatus, String> {
    {
        let mut inner = shared().lock().unwrap();
        inner.stop = true;
        inner.running = false;
    }
    if let Some(h) = recv_handle().lock().unwrap().take() {
        let _ = h.join();
    }
    Ok(status_locked(&shared().lock().unwrap()))
}

#[tauri::command]
pub fn crozzo_gossip_udp_send(json: String) -> Result<(), String> {
    let body = json.trim();
    if body.is_empty() {
        return Err("payload vacío".into());
    }
    if body.len() > 7800 {
        return Err("payload gossip demasiado grande".into());
    }
    send_raw(body)
}

#[tauri::command]
pub fn crozzo_gossip_udp_drain() -> Result<Vec<String>, String> {
    let mut inner = shared().lock().unwrap();
    let out = std::mem::take(&mut inner.rx_queue);
    Ok(out)
}

#[tauri::command]
pub fn crozzo_gossip_udp_status() -> Result<CrozzoGossipUdpStatus, String> {
    Ok(status_locked(&shared().lock().unwrap()))
}
