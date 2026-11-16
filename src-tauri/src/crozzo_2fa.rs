//! 2FA TOTP (PoC Fase -2/P0).
//! Genera y verifica códigos TOTP usando totp-rs.

#[cfg(desktop)]
mod imp {
    use totp_rs::{Algorithm, Secret, TOTP};

    pub fn verify(secret_b32: &str, code: &str) -> Result<bool, String> {
        let secret = Secret::Encoded(secret_b32.to_string())
            .to_bytes()
            .map_err(|e| e.to_string())?;
        let totp = TOTP::new(Algorithm::SHA1, 6, 1, 30, secret, None, String::new())
            .map_err(|e| e.to_string())?;
        Ok(totp.check_current(code).map_err(|e| e.to_string())?)
    }

    pub fn generate_secret() -> String {
        use totp_rs::Secret;
        Secret::generate_secret().to_encoded().to_string()
    }
}

#[cfg(desktop)]
#[tauri::command]
pub fn crozzo_2fa_verify(secret_b32: String, code: String) -> Result<bool, String> {
    imp::verify(&secret_b32, &code)
}

#[cfg(desktop)]
#[tauri::command]
pub fn crozzo_2fa_generate_secret() -> Result<String, String> {
    Ok(imp::generate_secret())
}

#[cfg(not(desktop))]
#[tauri::command]
pub fn crozzo_2fa_verify(_secret_b32: String, _code: String) -> Result<bool, String> {
    Err("2fa_not_available_on_this_platform".into())
}

#[cfg(not(desktop))]
#[tauri::command]
pub fn crozzo_2fa_generate_secret() -> Result<String, String> {
    Err("2fa_not_available_on_this_platform".into())
}
