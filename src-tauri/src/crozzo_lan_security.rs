// Fase 2.4 — Seguridad: TLS (rustls) + pairing QR (X25519/Ed25519) + AES-GCM.
// Spike compilado; no cableado aún.
#![allow(dead_code)]

use aes_gcm::{aead::Aead, Aes256Gcm, KeyInit, Nonce};
use rcgen::generate_simple_self_signed;
use sha2::Sha256;
use hkdf::Hkdf;

/// Genera un certificado autofirmado para TLS en LAN.
pub fn generate_self_signed_cert() -> Result<(String, String), String> {
    let subject_alt_names = vec!["localhost".to_string(), "127.0.0.1".to_string()];
    let cert = generate_simple_self_signed(subject_alt_names).map_err(|e| e.to_string())?;
    let cert_pem = cert.cert.pem();
    let key_pem = cert.key_pair.serialize_pem();
    Ok((cert_pem, key_pem))
}

/// Deriva una clave de sesión AES-256 a partir de un secreto compartido (HKDF-SHA256).
pub fn derive_session_key(shared_secret: &[u8], salt: &[u8]) -> [u8; 32] {
    let hk = Hkdf::<Sha256>::new(Some(salt), shared_secret);
    let mut okm = [0u8; 32];
    hk.expand(b"crozzo-session", &mut okm).unwrap_or(());
    okm
}

/// Cifra datos con AES-256-GCM. Retorna (nonce || ciphertext).
pub fn encrypt(key: &[u8; 32], plaintext: &[u8]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| e.to_string())?;
    let nonce_bytes: [u8; 12] = rand_nonce();
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ct = cipher.encrypt(nonce, plaintext).map_err(|e| e.to_string())?;
    let mut out = Vec::with_capacity(12 + ct.len());
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ct);
    Ok(out)
}

/// Descifra datos cifrados con AES-256-GCM.
pub fn decrypt(key: &[u8; 32], data: &[u8]) -> Result<Vec<u8>, String> {
    if data.len() < 12 {
        return Err("datos demasiado cortos".into());
    }
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| e.to_string())?;
    let nonce = Nonce::from_slice(&data[..12]);
    cipher.decrypt(nonce, &data[12..]).map_err(|e| e.to_string())
}

fn rand_nonce() -> [u8; 12] {
    use std::time::{SystemTime, UNIX_EPOCH};
    let mut n = [0u8; 12];
    let t = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos();
    let bytes = t.to_le_bytes();
    for (i, b) in bytes.iter().enumerate() {
        if i < 12 { n[i] = *b; }
    }
    n
}
