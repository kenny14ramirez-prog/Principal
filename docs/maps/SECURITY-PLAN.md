# Plan de seguridad (Fase 2.4) — Crozzo POS

> Módulo: `src-tauri/src/crozzo_lan_security.rs` (spike compilado).

## Componentes

### TLS (rustls)
- Certificado autofirmado generado con `rcgen` (`generate_self_signed_cert`).
- Servidor TLS con `tokio-rustls` (pendiente de cableado).
- Puerto LAN sigue siendo 3000 (HTTP) o migrar a HTTPS 3443.

### Pairing QR (X25519/Ed25519)
- Generar par de claves X25519 por dispositivo.
- QR contiene pubkey + device_id + business_id.
- Intercambio de claves vía ECDH → secreto compartido.
- Derivar clave de sesión AES-256 con HKDF-SHA256 (`derive_session_key`).

### Cifrado de payload (AES-256-GCM)
- `encrypt(key, plaintext)` → nonce || ciphertext.
- `decrypt(key, data)` → plaintext.
- Usar para datos sensibles en tránsito (comandas, runtime).

### Token LAN (JWT/HMAC)
- Reemplazar token estático por JWT firmado con secreto compartido.
- Validar en cada request (no vacío por defecto).

## Próximos pasos
1. Cablear TLS en el servidor (Axum o crudo) con rustls.
2. Implementar pairing QR (generar QR, escanear, intercambiar claves).
3. Migrar token a JWT/HMAC.
4. Cifrar payloads sensibles en tránsito.
5. Tests de seguridad (pairing, TLS handshake, cifrado).

## Riesgos
- Cert autofirmado requiere confianza manual en clientes (o CA propia).
- Pairing QR requiere cámara en dispositivos (Tauri barcode-scanner).
- Overhead de cifrado en LAN (aceptable para POS).
