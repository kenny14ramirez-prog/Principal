//! TLS para LAN: genera y persiste un certificado self-signed (rcgen) para la caja.
//! El servidor HTTP principal sigue operando en paralelo (fallback plano).
//! El certificado incluye SAN para localhost, 127.0.0.1 y la IP LAN detectada.
//! No activa TLS por defecto para no romper clientes existentes; la detección
//! de handshake (primer byte 0x16) en el servidor decide si se usa TLS.

use crate::crozzo_mdns;
use rcgen::{CertificateParams, DistinguishedName, KeyPair, SanType};
use sha2::{Digest, Sha256};
use rustls::ServerConfig;
use serde_json::json;
use std::path::PathBuf;
use std::sync::{Arc, OnceLock};

const CERT_FILE: &str = "cert.pem";
const KEY_FILE: &str = "key.pem";
const ENABLED_FILE: &str = "enabled";

/// Directorio de persistencia del certificado TLS.
/// Windows: %APPDATA%/CrozzoPOS/tls ; Unix: ~/.config/crozzo-pos/tls ; fallback: ./crozzo_tls
pub fn tls_dir() -> PathBuf {
    if let Ok(appdata) = std::env::var("APPDATA") {
        PathBuf::from(appdata).join("CrozzoPOS").join("tls")
    } else if let Ok(home) = std::env::var("HOME") {
        PathBuf::from(home).join(".config").join("crozzo-pos").join("tls")
    } else {
        PathBuf::from(".").join("crozzo_tls")
    }
}

fn ensure_dir() -> Result<PathBuf, String> {
    let dir = tls_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Genera (si no existe) y devuelve el certificado + clave privada en PEM.
/// Persiste en disco para no regenerar en cada arranque.
pub fn ensure_cert_pem() -> Result<(String, String), String> {
    let dir = ensure_dir()?;
    let cert_path = dir.join(CERT_FILE);
    let key_path = dir.join(KEY_FILE);

    // Reusar certificado persistido si existe y es válido.
    if cert_path.exists() && key_path.exists() {
        let cert_pem = std::fs::read_to_string(&cert_path).map_err(|e| e.to_string())?;
        let key_pem = std::fs::read_to_string(&key_path).map_err(|e| e.to_string())?;
        if !cert_pem.trim().is_empty() && !key_pem.trim().is_empty() {
            return Ok((cert_pem, key_pem));
        }
    }

    // Generar nuevo certificado self-signed con SAN para la IP LAN.
    let lan_ip = crozzo_mdns::guess_local_ipv4();
    let mut params = CertificateParams::default();
    let mut dn = DistinguishedName::new();
    dn.push(rcgen::DnType::CommonName, "Crozzo POS LAN");
    params.distinguished_name = dn;
    params.subject_alt_names = vec![
        SanType::DnsName(rcgen::Ia5String::try_from("localhost").map_err(|e| e.to_string())?),
        SanType::IpAddress(std::net::IpAddr::V4(std::net::Ipv4Addr::new(127, 0, 0, 1))),
        SanType::IpAddress(std::net::IpAddr::V4(lan_ip)),
    ];

    let key_pair = KeyPair::generate().map_err(|e| e.to_string())?;
    let cert = params.self_signed(&key_pair).map_err(|e| e.to_string())?;
    let cert_pem = cert.pem();
    let key_pem = key_pair.serialize_pem();

    std::fs::write(&cert_path, &cert_pem).map_err(|e| e.to_string())?;
    std::fs::write(&key_path, &key_pem).map_err(|e| e.to_string())?;

    Ok((cert_pem, key_pem))
}

/// Construye un ServerConfig de rustls a partir del certificado persistido.
pub fn tls_server_config() -> Result<Arc<ServerConfig>, String> {
    let (cert_pem, key_pem) = ensure_cert_pem()?;
    let cert = rustls_pemfile::certs(&mut cert_pem.as_bytes())
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let key = rustls_pemfile::pkcs8_private_keys(&mut key_pem.as_bytes())
        .next()
        .ok_or("no private key found")?
        .map_err(|e| e.to_string())?;
    let config = ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(cert, rustls::pki_types::PrivateKeyDer::Pkcs8(key))
        .map_err(|e| e.to_string())?;
    Ok(Arc::new(config))
}

static TLS_CFG: OnceLock<Arc<ServerConfig>> = OnceLock::new();

/// ServerConfig cacheado (no regenera en cada conexión).
pub fn tls_server_config_cached() -> Result<Arc<ServerConfig>, String> {
    if let Some(c) = TLS_CFG.get() {
        return Ok(Arc::clone(c));
    }
    let c = tls_server_config()?;
    let _ = TLS_CFG.set(Arc::clone(&c));
    Ok(TLS_CFG.get().cloned().unwrap_or(c))
}

/// Aceptor TLS para tokio-rustls.
pub fn tls_acceptor() -> Result<tokio_rustls::TlsAcceptor, String> {
    let cfg = tls_server_config_cached()?;
    Ok(tokio_rustls::TlsAcceptor::from(cfg))
}

fn read_enabled_flag() -> bool {
    let path = tls_dir().join(ENABLED_FILE);
    std::fs::read_to_string(&path)
        .map(|s| s.trim() == "1" || s.trim().eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

/// Calcula el fingerprint SHA-256 (hex minúsculas) del certificado DER.
pub fn cert_fingerprint_sha256(cert_pem: &str) -> Result<String, String> {
    let mut reader = cert_pem.as_bytes();
    let cert = rustls_pemfile::certs(&mut reader)
        .next()
        .ok_or("no certificate found in PEM")?
        .map_err(|e| e.to_string())?;
    let hash = Sha256::digest(cert.as_ref());
    Ok(hash.iter().map(|b| format!("{:02x}", b)).collect())
}

#[tauri::command]
pub fn crozzo_lan_tls_cert() -> Result<serde_json::Value, String> {
    let (cert_pem, key_pem) = ensure_cert_pem()?;
    let fingerprint = cert_fingerprint_sha256(&cert_pem)?;
    Ok(json!({
        "ok": true,
        "cert_pem": cert_pem,
        "key_pem": key_pem,
        "fingerprint": fingerprint,
        "fingerprint_sha256": fingerprint,
        "tls_dir": tls_dir().display().to_string(),
    }))
}

#[tauri::command]
pub fn crozzo_lan_tls_available() -> bool {
    true
}

#[tauri::command]
pub fn crozzo_lan_tls_status() -> serde_json::Value {
    let dir = tls_dir();
    let cert_exists = dir.join(CERT_FILE).exists() && dir.join(KEY_FILE).exists();
    let enabled = read_enabled_flag();
    json!({
        "ok": true,
        "enabled": enabled,
        "cert_exists": cert_exists,
        "tls_dir": dir.display().to_string(),
    })
}

#[tauri::command]
pub fn crozzo_lan_tls_enable(enabled: bool) -> serde_json::Value {
    let dir = match ensure_dir() {
        Ok(d) => d,
        Err(e) => return json!({"ok": false, "error": e}),
    };
    let value = if enabled { "1" } else { "0" };
    if let Err(e) = std::fs::write(dir.join(ENABLED_FILE), value) {
        return json!({"ok": false, "error": e.to_string()});
    }
    // Si se habilita, asegurar que el certificado exista.
    if enabled {
        if let Err(e) = ensure_cert_pem() {
            return json!({"ok": false, "error": e});
        }
    }
    json!({"ok": true, "enabled": enabled})
}

/// Instala el certificado self-signed de la caja en el almacen de raiz del
/// usuario (Windows: CurrentUser\Root via PowerShell/.NET). En otros SO devuelve
/// ok:false para que el frontend caiga al fallback localStorage + instrucciones.
#[tauri::command]
pub fn crozzo_lan_tls_install_ca(cert_pem: Option<String>) -> Result<serde_json::Value, String> {
    let pem = match cert_pem {
        Some(p) if !p.trim().is_empty() => p,
        _ => match ensure_cert_pem() { Ok((c, _)) => c, Err(e) => return Ok(json!({"ok": false, "installed": false, "method": "none", "error": e})) },
    };
    let fp = match cert_fingerprint_sha256(&pem) {
        Ok(f) => f,
        Err(e) => return Ok(json!({"ok": false, "installed": false, "method": "none", "error": e})),
    };

    #[cfg(not(target_os = "windows"))]
    {
        return Ok(json!({
            "ok": false,
            "installed": false,
            "method": "unsupported",
            "error": "instalacion automatica solo disponible en Windows (WebView2). Usar localStorage + instrucciones.",
            "fingerprint": fp,
            "instructions": "Importa manualmente el certificado (PEM) en el almacen de confianza del sistema/navegador.",
        }));
    }

    #[cfg(target_os = "windows")]
    {
        let dir = match ensure_dir() { Ok(d) => d, Err(e) => return Ok(json!({"ok": false, "installed": false, "method": "none", "error": e, "fingerprint": fp})) };
        let cert_path = dir.join("ca_install.pem");
        if let Err(e) = std::fs::write(&cert_path, &pem) {
            return Ok(json!({"ok": false, "installed": false, "method": "none", "error": e.to_string(), "fingerprint": fp}));
        }
        let path_str = cert_path.display().to_string().replace('\\', "/");

        let script = format!(
            "$ErrorActionPreference='Stop'; \
             $p='{}'; \
             $raw=Get-Content -Raw $p; \
             $clean=$raw -replace '-----BEGIN CERTIFICATE-----','' -replace '-----END CERTIFICATE-----','' -replace '\\s',''; \
             $bytes=[Convert]::FromBase64String($clean); \
             $cert=[System.Security.Cryptography.X509Certificates.X509Certificate2]::new($bytes); \
             $store=New-Object System.Security.Cryptography.X509Certificates.X509Store('Root','CurrentUser'); \
             $store.Open('ReadWrite'); \
             foreach ($c in @($store.Certificates)) {{ if ($c.Thumbprint -eq $cert.Thumbprint) {{ $store.Remove($c) | Out-Null }} }}; \
             $store.Add($cert); \
             $store.Close(); \
             Write-Output $cert.Thumbprint;",
            path_str
        );

        let out = std::process::Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-Command", &script])
            .output();
        match out {
            Ok(o) if o.status.success() => {
                let thumb = String::from_utf8_lossy(&o.stdout).trim().to_string();
                Ok(json!({
                    "ok": true,
                    "installed": true,
                    "method": "powershell:CurrentUser\\Root",
                    "fingerprint": fp,
                    "thumbprint": thumb,
                }))
            }
            Ok(o) => {
                let err = String::from_utf8_lossy(&o.stderr).trim().to_string();
                #[cfg(windows)]
                {
                    use std::os::windows::process::CommandExt;
                    let certutil = std::process::Command::new("certutil")
                        .args(["-user", "-addstore", "Root", &path_str])
                        .creation_flags(0x08000000)
                        .output();
                    match certutil {
                        Ok(cu) if cu.status.success() => Ok(json!({
                            "ok": true,
                            "installed": true,
                            "method": "certutil:CurrentUser\\Root",
                            "fingerprint": fp,
                        })),
                        other => {
                            let cuerr = match other {
                                Ok(c) => String::from_utf8_lossy(&c.stderr).trim().to_string(),
                                Err(e) => e.to_string(),
                            };
                            Ok(json!({
                                "ok": false,
                                "installed": false,
                                "method": "powershell",
                                "error": if err.is_empty() { cuerr.clone() } else { err },
                                "fallback_error": cuerr,
                                "fingerprint": fp,
                            }))
                        }
                    }
                }
                #[cfg(not(windows))]
                {
                    let certutil = std::process::Command::new("certutil")
                        .args(["-user", "-addstore", "Root", &path_str])
                        .output();
                    let _ = certutil;
                }
                #[cfg(not(windows))]
                Ok(json!({"ok": false, "installed": false, "method": "powershell", "error": err, "fingerprint": fp}))
            }
            Err(e) => Ok(json!({"ok": false, "installed": false, "method": "none", "error": e.to_string(), "fingerprint": fp})),
        }
    }
}
