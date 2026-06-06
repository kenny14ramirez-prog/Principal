//! Descarga e instalación in-app de APK (tablet Android Tauri).

#[cfg(target_os = "android")]
use tauri::{AppHandle, Manager};

const MIN_APK_BYTES: usize = 800 * 1024;
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
fn validate_apk(bytes: &[u8], expected_bytes: Option<u64>) -> Result<(), String> {
    if bytes.len() < MIN_APK_BYTES {
        return Err(format!(
            "APK demasiado pequeño ({} bytes). La descarga puede estar incompleta.",
            bytes.len()
        ));
    }
    if bytes.len() < 4 || bytes[0] != b'P' || bytes[1] != b'K' {
        return Err("El archivo descargado no parece un APK válido.".into());
    }
    if !bytes.windows(19).any(|w| w == b"AndroidManifest.xml") {
        return Err(
            "APK inválido (falta AndroidManifest). Descargue de nuevo desde GitHub.".into(),
        );
    }
    let tail_start = bytes.len().saturating_sub(65557);
    let tail = &bytes[tail_start..];
    if !tail.windows(4).any(|w| w == b"PK\x05\x06") {
        return Err(
            "APK corrupto o incompleto (ZIP truncado). Intente actualizar otra vez.".into(),
        );
    }
    if let Some(expected) = expected_bytes {
        if expected > 0 {
            let got = bytes.len() as u64;
            if got.abs_diff(expected) > 4096 {
                return Err(format!(
                    "Tamaño del APK no coincide (esperado ~{} bytes, recibido {}).",
                    expected,
                    got
                ));
            }
        }
    }
    Ok(())
}

#[cfg(target_os = "android")]
fn download_apk_bytes(url: &str, expected_bytes: Option<u64>) -> Result<Vec<u8>, String> {
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
                            match validate_apk(&bytes, expected_bytes) {
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

#[cfg(target_os = "android")]
fn write_apk_for_install(app: &AppHandle, bytes: &[u8]) -> Result<String, String> {
    let files_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Almacenamiento interno no disponible: {e}"))?;
    std::fs::create_dir_all(&files_dir)
        .map_err(|e| format!("No se pudo preparar carpeta de instalación: {e}"))?;

    let dest = files_dir.join("crozzo-pos-update.apk");
    std::fs::write(&dest, bytes).map_err(|e| format!("No se pudo guardar APK: {e}"))?;

    // Copia en cache por si FileProvider usa cache-path en builds antiguos.
    if let Ok(cache_dir) = app.path().app_cache_dir() {
        let _ = std::fs::create_dir_all(&cache_dir);
        let cache_dest = cache_dir.join("crozzo-pos-update.apk");
        let _ = std::fs::write(&cache_dest, bytes);
    }

    dest.into_os_string()
        .into_string()
        .map_err(|_| "Ruta APK inválida".into())
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
pub fn crozzo_android_download_apk(
    app: AppHandle,
    url: String,
    expected_bytes: Option<u64>,
) -> Result<String, String> {
    #[cfg(target_os = "android")]
    {
        let url = url.trim();
        if url.is_empty() || !url.starts_with("https://") {
            return Err("URL de APK inválida".into());
        }

        let bytes = download_apk_bytes(url, expected_bytes)?;
        return write_apk_for_install(&app, &bytes);
    }

    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, url, expected_bytes);
        Err("crozzo_android_download_apk solo en Android".into())
    }
}
