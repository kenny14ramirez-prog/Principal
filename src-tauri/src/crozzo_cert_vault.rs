//! Vault de certificados DIAN (PoC Fase -2).
//! Almacena el certificado cifrado con DPAPI en Windows.
//! En otras plataformas se degrada a "no disponible".

#[cfg(windows)]
mod imp {
    use std::fs;
    use std::path::PathBuf;
    use windows::Win32::Security::Cryptography::{CryptProtectData, CryptUnprotectData, CRYPT_INTEGER_BLOB};

    fn vault_dir() -> Result<PathBuf, String> {
        let base = std::env::var("APPDATA").map_err(|e| e.to_string())?;
        let dir = PathBuf::from(base).join("crozzo-pos").join("cert-vault");
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        Ok(dir)
    }

    fn file_path() -> Result<PathBuf, String> {
        Ok(vault_dir()?.join("dian_cert.bin"))
    }

    pub fn save(cert_b64: &str) -> Result<(), String> {
        let input = cert_b64.as_bytes();
        let data_in = CRYPT_INTEGER_BLOB {
            cbData: input.len() as u32,
            pbData: input.as_ptr() as *mut u8,
        };
        let mut data_out = CRYPT_INTEGER_BLOB::default();
        unsafe {
            CryptProtectData(&data_in, None, None, None, None, 0, &mut data_out)
                .map_err(|e| e.to_string())?;
        }
        let slice = unsafe { std::slice::from_raw_parts(data_out.pbData, data_out.cbData as usize) };
        let bytes = slice.to_vec();
        // Liberar buffer asignado por DPAPI
        unsafe {
            if !data_out.pbData.is_null() {
                let _ = windows::Win32::Foundation::LocalFree(Some(windows::Win32::Foundation::HLOCAL(data_out.pbData as *mut _)));
            }
        }
        fs::write(file_path()?, bytes).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn load() -> Result<Option<String>, String> {
        let path = file_path()?;
        if !path.exists() {
            return Ok(None);
        }
        let bytes = fs::read(path).map_err(|e| e.to_string())?;
        if bytes.is_empty() {
            return Ok(None);
        }
        let data_in = CRYPT_INTEGER_BLOB {
            cbData: bytes.len() as u32,
            pbData: bytes.as_ptr() as *mut u8,
        };
        let mut data_out = CRYPT_INTEGER_BLOB::default();
        unsafe {
            CryptUnprotectData(&data_in, None, None, None, None, 0, &mut data_out)
                .map_err(|e| e.to_string())?;
        }
        let slice = unsafe { std::slice::from_raw_parts(data_out.pbData, data_out.cbData as usize) };
        let value = String::from_utf8(slice.to_vec()).map_err(|e| e.to_string())?;
        unsafe {
            if !data_out.pbData.is_null() {
                let _ = windows::Win32::Foundation::LocalFree(Some(windows::Win32::Foundation::HLOCAL(data_out.pbData as *mut _)));
            }
        }
        Ok(Some(value))
    }
}

#[cfg(desktop)]
#[tauri::command]
pub fn crozzo_cert_vault_set(cert_b64: String) -> Result<(), String> {
    #[cfg(windows)]
    { imp::save(&cert_b64) }
    #[cfg(not(windows))]
    { let _ = cert_b64; Err("cert_vault_not_available_on_this_platform".into()) }
}

#[cfg(desktop)]
#[tauri::command]
pub fn crozzo_cert_vault_get() -> Result<Option<String>, String> {
    #[cfg(windows)]
    { imp::load() }
    #[cfg(not(windows))]
    { Ok(None) }
}

#[cfg(not(desktop))]
#[tauri::command]
pub fn crozzo_cert_vault_set(_cert_b64: String) -> Result<(), String> {
    Err("cert_vault_not_available_on_this_platform".into())
}

#[cfg(not(desktop))]
#[tauri::command]
pub fn crozzo_cert_vault_get() -> Result<Option<String>, String> {
    Ok(None)
}
