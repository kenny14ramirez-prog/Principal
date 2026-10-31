//! Almacén de secretos del SO (DPAPI en Windows) para claves de emparejamiento.
//! Reemplaza el almacenamiento en texto plano en localStorage para claves privadas.
//! En plataformas no-Windows se degrada a "no disponible" y el front usa localStorage.

#[cfg(windows)]
mod imp {
    use std::fs;
    use std::path::PathBuf;
    use windows::Win32::Security::Cryptography::{CryptProtectData, CryptUnprotectData, CRYPT_INTEGER_BLOB};

    fn secrets_dir() -> Result<PathBuf, String> {
        let base = std::env::var("APPDATA").map_err(|e| e.to_string())?;
        let dir = PathBuf::from(base).join("crozzo-pos").join("secrets");
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        Ok(dir)
    }

    fn file_path(name: &str) -> Result<PathBuf, String> {
        // Sanitizar nombre para evitar path traversal.
        let safe: String = name.chars().filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-').collect();
        if safe.is_empty() {
            return Err("invalid_secret_name".into());
        }
        Ok(secrets_dir()?.join(format!("{}.bin", safe)))
    }

    pub fn set(name: &str, value: &str) -> Result<(), String> {
        let input = value.as_bytes();
        let mut data_in = CRYPT_INTEGER_BLOB {
            cbData: input.len() as u32,
            pbData: input.as_ptr() as *mut u8,
        };
        let mut data_out = CRYPT_INTEGER_BLOB::default();
        unsafe {
            CryptProtectData(&mut data_in, None, None, None, None, 0, &mut data_out)
                .map_err(|e| e.to_string())?;
        }
        let slice = unsafe { std::slice::from_raw_parts(data_out.pbData, data_out.cbData as usize) };
        let bytes = slice.to_vec();
        // Liberar buffer asignado por DPAPI.
        unsafe {
            windows::Win32::Foundation::LocalFree(Some(windows::Win32::Foundation::HLOCAL(data_out.pbData as *mut _)));
        }
        let path = file_path(name)?;
        fs::write(&path, &bytes).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get(name: &str) -> Result<Option<String>, String> {
        let path = file_path(name)?;
        if !path.exists() {
            return Ok(None);
        }
        let bytes = fs::read(&path).map_err(|e| e.to_string())?;
        if bytes.is_empty() {
            return Ok(None);
        }
        let mut data_in = CRYPT_INTEGER_BLOB {
            cbData: bytes.len() as u32,
            pbData: bytes.as_ptr() as *mut u8,
        };
        let mut data_out = CRYPT_INTEGER_BLOB::default();
        unsafe {
            CryptUnprotectData(&mut data_in, None, None, None, None, 0, &mut data_out)
                .map_err(|e| e.to_string())?;
        }
        let slice = unsafe { std::slice::from_raw_parts(data_out.pbData, data_out.cbData as usize) };
        let out = String::from_utf8(slice.to_vec()).map_err(|e| e.to_string())?;
        unsafe {
            windows::Win32::Foundation::LocalFree(Some(windows::Win32::Foundation::HLOCAL(data_out.pbData as *mut _)));
        }
        Ok(Some(out))
    }

    pub fn delete(name: &str) -> Result<(), String> {
        let path = file_path(name)?;
        if path.exists() {
            let _ = fs::remove_file(&path);
        }
        Ok(())
    }
}

#[cfg(windows)]
#[tauri::command]
pub fn crozzo_secret_set(name: String, value: String) -> Result<(), String> {
    imp::set(&name, &value)
}

#[cfg(windows)]
#[tauri::command]
pub fn crozzo_secret_get(name: String) -> Result<Option<String>, String> {
    imp::get(&name)
}

#[cfg(windows)]
#[tauri::command]
pub fn crozzo_secret_delete(name: String) -> Result<(), String> {
    imp::delete(&name)
}

// Stubs no-Windows (degradación honesta: front usa localStorage).
#[cfg(not(windows))]
#[tauri::command]
pub fn crozzo_secret_set(_name: String, _value: String) -> Result<(), String> {
    Err("secret_store_no_soportado_en_esta_plataforma".into())
}

#[cfg(not(windows))]
#[tauri::command]
pub fn crozzo_secret_get(_name: String) -> Result<Option<String>, String> {
    Ok(None)
}

#[cfg(not(windows))]
#[tauri::command]
pub fn crozzo_secret_delete(_name: String) -> Result<(), String> {
    Ok(())
}
