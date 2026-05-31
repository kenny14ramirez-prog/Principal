//! Descarga setup.exe del release y lo ejecuta en silencio (fallback sin verificar firma del updater).

const MIN_INSTALLER_BYTES: usize = 400 * 1024;
const DOWNLOAD_RETRIES: u32 = 3;

fn validate_installer_bytes(bytes: &[u8]) -> Result<(), String> {
    if bytes.len() < MIN_INSTALLER_BYTES {
        return Err(format!(
            "Archivo descargado demasiado pequeño ({} bytes). ¿Red, antivirus o enlace incorrecto?",
            bytes.len()
        ));
    }
    if bytes.len() < 2 || bytes[0] != b'M' || bytes[1] != b'Z' {
        return Err(
            "El archivo descargado no parece un instalador Windows (.exe). Verifique el release en GitHub."
                .into(),
        );
    }
    Ok(())
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

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(900))
        .build()
        .map_err(|e| e.to_string())?;

    let mut last_err = String::from("Descarga falló");
    let mut bytes: Vec<u8> = Vec::new();

    for attempt in 0..DOWNLOAD_RETRIES {
        match download_bytes(&client, url) {
            Ok(b) => match validate_installer_bytes(&b) {
                Ok(()) => {
                    bytes = b;
                    break;
                }
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

    if bytes.is_empty() {
        return Err(last_err);
    }

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
        Err("Instalación silenciosa solo disponible en Windows".into())
    }
}
