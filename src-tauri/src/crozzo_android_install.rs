//! Descarga e instalación in-app de APK (tablet Android Tauri).

#[cfg(target_os = "android")]
use tauri::{AppHandle, Manager};

const MIN_APK_BYTES: usize = 400 * 1024;
const DOWNLOAD_RETRIES: u32 = 3;

#[cfg(target_os = "android")]
fn http_client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(600))
        .redirect(reqwest::redirect::Policy::limited(10))
        .user_agent("CrozzoPOS-Android-Updater/1.0")
        .build()
        .map_err(|e| e.to_string())
}

#[cfg(target_os = "android")]
fn validate_apk(bytes: &[u8]) -> Result<(), String> {
    if bytes.len() < MIN_APK_BYTES {
        return Err(format!(
            "APK demasiado pequeño ({} bytes).",
            bytes.len()
        ));
    }
    // ZIP / APK magic (PK\x03\x04)
    if bytes.len() < 4 || bytes[0] != b'P' || bytes[1] != b'K' {
        return Err("El archivo descargado no parece un APK válido.".into());
    }
    Ok(())
}

#[cfg(target_os = "android")]
fn download_apk_bytes(url: &str) -> Result<Vec<u8>, String> {
    let client = http_client()?;
    let mut last_err = String::from("Descarga del APK falló");
    for attempt in 0..DOWNLOAD_RETRIES {
        match client.get(url).send() {
            Ok(res) => {
                if !res.status().is_success() {
                    last_err = format!("HTTP {} al descargar APK", res.status());
                } else {
                    match res.bytes() {
                        Ok(b) => {
                            let bytes = b.to_vec();
                            match validate_apk(&bytes) {
                                Ok(()) => return Ok(bytes),
                                Err(e) => last_err = e,
                            }
                        }
                        Err(e) => last_err = e.to_string(),
                    }
                }
            }
            Err(e) => last_err = format!("Descarga falló: {e}"),
        }
        if attempt + 1 >= DOWNLOAD_RETRIES {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(1800 * (attempt as u64 + 1)));
    }
    Err(last_err)
}

#[tauri::command]
pub fn crozzo_android_probe_updater() -> Result<String, String> {
    #[cfg(target_os = "android")]
    {
        return Ok("android".into());
    }
    #[cfg(not(target_os = "android"))]
    {
        Err("Solo disponible en Android".into())
    }
}

#[tauri::command]
pub fn crozzo_android_download_apk(app: AppHandle, url: String) -> Result<String, String> {
    #[cfg(target_os = "android")]
    {
        let url = url.trim();
        if url.is_empty() || !url.starts_with("https://") {
            return Err("URL de APK inválida".into());
        }

        let cache_dir = app
            .path()
            .app_cache_dir()
            .map_err(|e| format!("Cache no disponible: {e}"))?;

        std::fs::create_dir_all(&cache_dir)
            .map_err(|e| format!("No se pudo crear cache: {e}"))?;

        let dest = cache_dir.join("crozzo-pos-update.apk");
        let bytes = download_apk_bytes(url)?;
        std::fs::write(&dest, &bytes).map_err(|e| format!("No se pudo guardar APK: {e}"))?;

        return dest
            .into_os_string()
            .into_string()
            .map_err(|_| "Ruta APK inválida".into());
    }

    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, url);
        Err("crozzo_android_download_apk solo en Android".into())
    }
}
