//! Deteccion de la IP LAN propia en Android/iOS.
//!
//! El modulo `crozzo_mdns` no se compila en movil, pero el frontend necesita
//! la IP LAN de la caja para descubrirla y medir el ping. Se expone el mismo
//! comando (`crozzo_guess_local_ipv4`) desde este modulo movil.

use std::net::{IpAddr, Ipv4Addr, UdpSocket};

fn route_ip(gateway: &str) -> Option<Ipv4Addr> {
    let sock = UdpSocket::bind("0.0.0.0:0").ok()?;
    sock.connect(gateway).ok()?;
    match sock.local_addr().ok()?.ip() {
        IpAddr::V4(v4) if !v4.is_loopback() => Some(v4),
        _ => None,
    }
}

/// Devuelve la IPv4 LAN propia o `127.0.0.1` si no hay red disponible.
#[tauri::command]
pub fn crozzo_guess_local_ipv4() -> String {
    if let Some(v4) = route_ip("8.8.8.8:80") {
        return v4.to_string();
    }
    for gw in [
        "192.168.1.1:80",
        "192.168.0.1:80",
        "192.168.100.1:80",
        "10.0.0.1:80",
        "172.16.0.1:80",
    ] {
        if let Some(v4) = route_ip(gw) {
            return v4.to_string();
        }
    }
    Ipv4Addr::LOCALHOST.to_string()
}
