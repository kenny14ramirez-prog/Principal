//! mDNS — anuncio y descubrimiento de caja Crozzo en LAN (_crozzo-pos._tcp).

use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};
use serde::Serialize;
use std::collections::HashMap;
use std::net::{Ipv4Addr, UdpSocket};
use std::sync::{Mutex, OnceLock};
use std::thread;

const SERVICE_TYPE: &str = "_crozzo-pos._tcp.local.";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CrozzoMdnsPeer {
    pub instance: String,
    pub host: String,
    pub ip: String,
    pub port: u16,
    pub ws_port: u16,
    pub location_id: String,
    pub device_id: String,
    pub business_id: String,
    pub at_ms: u64,
}

struct MdnsInner {
    daemon: ServiceDaemon,
    discovered: HashMap<String, CrozzoMdnsPeer>,
    browsing: bool,
}

fn state() -> &'static Mutex<Option<MdnsInner>> {
    static S: OnceLock<Mutex<Option<MdnsInner>>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(None))
}

fn browse_thread() -> &'static Mutex<Option<thread::JoinHandle<()>>> {
    static H: OnceLock<Mutex<Option<thread::JoinHandle<()>>>> = OnceLock::new();
    H.get_or_init(|| Mutex::new(None))
}

fn now_ms() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn guess_local_ipv4() -> Ipv4Addr {
    if let Ok(sock) = UdpSocket::bind("0.0.0.0:0") {
        if sock.connect("8.8.8.8:80").is_ok() {
            if let Ok(addr) = sock.local_addr() {
                if let std::net::IpAddr::V4(v4) = addr.ip() {
                    return v4;
                }
            }
        }
    }
    Ipv4Addr::LOCALHOST
}

fn txt_get<'a>(txt: &'a HashMap<String, String>, key: &str) -> String {
    txt.get(key).cloned().unwrap_or_default()
}

fn txt_map_from_info(info: &ServiceInfo) -> HashMap<String, String> {
    let mut map = HashMap::new();
    for prop in info.get_properties().iter() {
        map.insert(prop.key().to_string(), prop.val_str().to_string());
    }
    map
}

fn peer_from_fullname(fullname: &str, host: &str, port: u16, txt: &HashMap<String, String>) -> CrozzoMdnsPeer {
    let ws_raw = txt_get(txt, "ws");
    let ws_port = ws_raw.parse::<u16>().unwrap_or(port.saturating_add(1));
    CrozzoMdnsPeer {
        instance: fullname.to_string(),
        host: host.to_string(),
        ip: host.to_string(),
        port,
        ws_port,
        location_id: txt_get(txt, "loc"),
        device_id: txt_get(txt, "dev"),
        business_id: txt_get(txt, "biz"),
        at_ms: now_ms(),
    }
}

fn ensure_daemon() -> Result<ServiceDaemon, String> {
    if let Ok(guard) = state().lock() {
        if let Some(inner) = guard.as_ref() {
            return Ok(inner.daemon.clone());
        }
    }
    ServiceDaemon::new().map_err(|e| format!("mdns daemon: {e}"))
}

fn start_browse_loop(daemon: ServiceDaemon) {
    let receiver = match daemon.browse(SERVICE_TYPE) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("[mdns] browse: {e}");
            return;
        }
    };
    while let Ok(event) = receiver.recv() {
        let mut guard = match state().lock() {
            Ok(g) => g,
            Err(_) => break,
        };
        let Some(inner) = guard.as_mut() else {
            break;
        };
        if !inner.browsing {
            break;
        }
        match event {
            ServiceEvent::ServiceResolved(info) => {
                let host = info
                    .get_addresses()
                    .iter()
                    .find(|ip| ip.is_ipv4())
                    .map(|ip| ip.to_string())
                    .unwrap_or_else(|| info.get_hostname().to_string());
                let txt = txt_map_from_info(&info);
                let peer = peer_from_fullname(info.get_fullname(), &host, info.get_port(), &txt);
                inner.discovered.insert(peer.instance.clone(), peer);
            }
            ServiceEvent::ServiceRemoved(fullname, _) => {
                inner.discovered.remove(&fullname);
            }
            _ => {}
        }
    }
}

#[tauri::command]
pub fn crozzo_mdns_start_advertise(
    port: Option<u16>,
    ws_port: Option<u16>,
    location_id: Option<String>,
    device_id: Option<String>,
    business_id: Option<String>,
) -> Result<(), String> {
    let http_port = port.unwrap_or(3000);
    let ws = ws_port.unwrap_or(http_port.saturating_add(1));
    let loc = location_id.unwrap_or_default();
    let dev = device_id.unwrap_or_default();
    let biz = business_id.unwrap_or_default();
    let daemon = ensure_daemon()?;
    let host_label = format!("crozzo-{}", if dev.is_empty() { "central" } else { dev.as_str() });
    let host = format!("{host_label}.local.");
    let ip = guess_local_ipv4();
    let ws_txt = ws.to_string();
    let props: &[(&str, &str)] = &[
        ("loc", loc.as_str()),
        ("dev", dev.as_str()),
        ("biz", biz.as_str()),
        ("ws", ws_txt.as_str()),
        ("role", "A"),
    ];
    let ip_addr = std::net::IpAddr::V4(ip);
    let info = ServiceInfo::new(
        SERVICE_TYPE,
        &host_label,
        &host,
        ip_addr,
        http_port,
        &props[..],
    )
    .map_err(|e| format!("mdns register: {e}"))?;
    daemon.register(info).map_err(|e| format!("mdns advertise: {e}"))?;
    {
        let mut guard = state().lock().map_err(|e| e.to_string())?;
        if guard.is_none() {
            *guard = Some(MdnsInner {
                daemon: daemon.clone(),
                discovered: HashMap::new(),
                browsing: false,
            });
        }
    }
    crozzo_mdns_start_browse()?;
    Ok(())
}

#[tauri::command]
pub fn crozzo_mdns_start_browse() -> Result<(), String> {
    let daemon = ensure_daemon()?;
    {
        let mut guard = state().lock().map_err(|e| e.to_string())?;
        if guard.is_none() {
            *guard = Some(MdnsInner {
                daemon: daemon.clone(),
                discovered: HashMap::new(),
                browsing: false,
            });
        }
        if let Some(inner) = guard.as_mut() {
            if inner.browsing {
                return Ok(());
            }
            inner.browsing = true;
        }
    }
    let d = daemon.clone();
    let handle = thread::spawn(move || start_browse_loop(d));
    if let Ok(mut th) = browse_thread().lock() {
        *th = Some(handle);
    }
    Ok(())
}

#[tauri::command]
pub fn crozzo_mdns_stop() -> Result<(), String> {
    {
        let mut guard = state().lock().map_err(|e| e.to_string())?;
        if let Some(inner) = guard.as_mut() {
            inner.browsing = false;
            inner.discovered.clear();
            let _ = inner.daemon.shutdown();
        }
        *guard = None;
    }
    if let Ok(mut th) = browse_thread().lock() {
        if let Some(h) = th.take() {
            let _ = h.join();
        }
    }
    Ok(())
}

#[tauri::command]
pub fn crozzo_guess_local_ipv4() -> String {
    guess_local_ipv4().to_string()
}

#[tauri::command]
pub fn crozzo_mdns_drain_discovered() -> Result<Vec<CrozzoMdnsPeer>, String> {
    let guard = state().lock().map_err(|e| e.to_string())?;
    match guard.as_ref() {
        Some(inner) => {
            let cutoff = now_ms().saturating_sub(120_000);
            let list: Vec<CrozzoMdnsPeer> = inner
                .discovered
                .values()
                .filter(|p| p.at_ms >= cutoff)
                .cloned()
                .collect();
            Ok(list)
        }
        None => Ok(Vec::new()),
    }
}

pub fn stop_with_lan() {
    let _ = crozzo_mdns_stop();
}

pub fn start_with_lan(
    port: u16,
    ws_port: u16,
    location_id: &str,
    device_id: &str,
    business_id: &str,
) {
    let _ = crozzo_mdns_start_advertise(
        Some(port),
        Some(ws_port),
        Some(location_id.to_string()),
        Some(device_id.to_string()),
        Some(business_id.to_string()),
    );
}
