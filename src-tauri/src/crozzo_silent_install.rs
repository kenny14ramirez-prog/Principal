//! Descarga e instala artefactos del release (Windows .exe silencioso, macOS .dmg).

const MIN_INSTALLER_BYTES: usize = 400 * 1024;
const MIN_DMG_BYTES: usize = 1024 * 1024;
const DOWNLOAD_RETRIES: u32 = 3;

fn http_client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .redirect(reqwest::redirect::Policy::limited(10))
        .user_agent("CrozzoPOS-Updater/1.0")
        .build()
        .map_err(|e| e.to_string())
}

fn download_bytes(client: &reqwest::blocking::Client, url: &str) -> Result<Vec<u8>, String> {
    client
        .get(url)
        .send()
        .map_err(|e| format!("Descarga falló: {e}"))?
        .bytes()
        .map_err(|e| e.to_string())
        .map(|b| b.to_vec())
}

fn download_with_retries<F>(url: &str, validate: F) -> Result<Vec<u8>, String>
where
    F: Fn(&[u8]) -> Result<(), String>,
{
    let client = http_client()?;
    let mut last_err = String::from("Descarga falló");
    for attempt in 0..DOWNLOAD_RETRIES {
        match download_bytes(&client, url) {
            Ok(b) => match validate(&b) {
                Ok(()) => return Ok(b),
                Err(e) => {
                    last_err = e;
                    if attempt + 1 >= DOWNLOAD_RETRIES {
                        return Err(last_err);
                    }
                }
            },
            Err(e) => {
                last_err = e;
                if attempt + 1 >= DOWNLOAD_RETRIES {
                    return Err(last_err);
                }
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(1500 * (attempt as u64 + 1)));
    }
    Err(last_err)
}

fn validate_exe(bytes: &[u8]) -> Result<(), String> {
    if bytes.len() < MIN_INSTALLER_BYTES {
        return Err(format!(
            "Instalador demasiado pequeño ({} bytes).",
            bytes.len()
        ));
    }
    if bytes.len() < 2 || bytes[0] != b'M' || bytes[1] != b'Z' {
        return Err("El archivo no parece un .exe válido.".into());
    }
    Ok(())
}

fn validate_dmg(bytes: &[u8]) -> Result<(), String> {
    if bytes.len() < MIN_DMG_BYTES {
        return Err(format!("DMG demasiado pequeño ({} bytes).", bytes.len()));
    }
    Ok(())
}

#[tauri::command]
pub fn install_setup_from_url(url: String) -> Result<(), String> {
    let url = url.trim();
    if url.is_empty() || !url.starts_with("https://") {
        return Err("URL de instalador inválida".into());
    }

    let tmp = std::env::temp_dir().join(format!(
        "crozzo-setup-{}.exe",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0)
    ));

    let bytes = download_with_retries(url, validate_exe)?;
    std::fs::write(&tmp, &bytes).map_err(|e| format!("No se pudo guardar instalador: {e}"))?;

    #[cfg(windows)]
    {
        std::process::Command::new(&tmp)
            .arg("/S")
            .spawn()
            .map_err(|e| format!("No se pudo ejecutar instalador: {e}"))?;
        return Ok(());
    }

    #[cfg(not(windows))]
    {
        let _ = tmp;
        Err("install_setup_from_url solo en Windows".into())
    }
}

#[cfg(target_os = "macos")]
fn find_app_bundle(dir: &std::path::Path) -> Option<std::path::PathBuf> {
    let entries = std::fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("app") {
            return Some(path);
        }
    }
    None
}

#[tauri::command]
pub fn install_dmg_from_url(url: String) -> Result<(), String> {
    let url = url.trim();
    if url.is_empty() || !url.starts_with("https://") {
        return Err("URL de DMG inválida".into());
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = url;
        return Err("install_dmg_from_url solo en macOS".into());
    }

    #[cfg(target_os = "macos")]
    {
        use std::process::Command;

        let dmg_path = std::env::temp_dir().join(format!(
            "crozzo-update-{}.dmg",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0)
        ));

        let bytes = download_with_retries(url, validate_dmg)?;
        std::fs::write(&dmg_path, &bytes).map_err(|e| format!("No se pudo guardar DMG: {e}"))?;

        let attach_out = Command::new("hdiutil")
            .args(["attach", "-nobrowse", "-quiet", dmg_path.to_string_lossy().as_ref()])
            .output()
            .map_err(|e| format!("hdiutil attach: {e}"))?;

        if !attach_out.status.success() {
            let err = String::from_utf8_lossy(&attach_out.stderr);
            return Err(format!("No se pudo montar DMG: {err}"));
        }

        let attach_text = String::from_utf8_lossy(&attach_out.stdout);
        let mount_point = attach_text
            .lines()
            .filter_map(|line| {
                let parts: Vec<&str> = line.split('\t').collect();
                if parts.len() >= 3 {
                    Some(parts.last()?.trim().to_string())
                } else {
                    None
                }
            })
            .last()
            .ok_or_else(|| "No se detectó punto de montaje del DMG.".to_string())?;

        let mount = std::path::PathBuf::from(&mount_point);
        let app_bundle = find_app_bundle(&mount)
            .ok_or_else(|| "No se encontró .app dentro del DMG.".to_string())?;

        let dest = std::path::PathBuf::from("/Applications").join(
            app_bundle
                .file_name()
                .ok_or_else(|| "Nombre de app inválido.".to_string())?,
        );

        if dest.exists() {
            std::fs::remove_dir_all(&dest).map_err(|e| format!("No se pudo reemplazar app: {e}"))?;
        }

        Command::new("cp")
            .arg("-R")
            .arg(&app_bundle)
            .arg(&dest)
            .status()
            .map_err(|e| format!("cp a Applications: {e}"))?
            .success()
            .then_some(())
            .ok_or_else(|| "No se pudo copiar la app a /Applications.".to_string())?;

        let _ = Command::new("hdiutil")
            .args(["detach", "-quiet", mount_point.as_str()])
            .status();

        let _ = std::fs::remove_file(&dmg_path);

        return Ok(());
    }
}

#[tauri::command]
pub fn probe_platform_installer() -> Result<String, String> {
    #[cfg(windows)]
    {
        return Ok("windows-exe".into());
    }
    #[cfg(target_os = "macos")]
    {
        return Ok("macos-dmg".into());
    }
    #[cfg(target_os = "android")]
    {
        return Ok("android".into());
    }
    Ok("unsupported".into())
}
