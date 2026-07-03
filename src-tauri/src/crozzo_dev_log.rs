//! Append-only dev session log (desktop only, localhost diagnostics).

#[cfg(desktop)]
use std::io::Write;

#[cfg(desktop)]
#[tauri::command]
pub fn crozzo_append_dev_log(app: tauri::AppHandle, line: String) -> Result<(), String> {
    use tauri::Manager;
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("crozzo-dev-session.jsonl");
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    file.write_all(line.as_bytes())
        .and_then(|_| file.write_all(b"\n"))
        .map_err(|e| e.to_string())?;
    Ok(())
}
