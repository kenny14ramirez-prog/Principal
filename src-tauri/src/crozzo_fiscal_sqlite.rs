//! Almacén fiscal en SQLite (PoC Fase -2).
//! Persistencia durable para facturas/outbox/config en desktop.
//! En plataformas no-desktop se degrada a "no disponible" y el front usa localStorage.

#[cfg(desktop)]
mod imp {
    use rusqlite::{params, Connection};
    use std::fs;
    use std::path::PathBuf;

    fn db_path() -> Result<PathBuf, String> {
        let base = std::env::var("APPDATA").map_err(|e| e.to_string())?;
        let dir = PathBuf::from(base).join("crozzo-pos").join("fiscal");
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        Ok(dir.join("fiscal.db"))
    }

    pub fn save(key: &str, value: &str) -> Result<(), String> {
        let path = db_path()?;
        let conn = Connection::open(path).map_err(|e| e.to_string())?;
        conn.execute(
            "CREATE TABLE IF NOT EXISTS fiscal_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)",
            [],
        )
        .map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO fiscal_kv (key, value, updated_at) VALUES (?1, ?2, datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
            params![key, value],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn load(key: &str) -> Result<Option<String>, String> {
        let path = db_path()?;
        if !path.exists() {
            return Ok(None);
        }
        let conn = Connection::open(path).map_err(|e| e.to_string())?;
        conn.execute(
            "CREATE TABLE IF NOT EXISTS fiscal_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)",
            [],
        )
        .map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT value FROM fiscal_kv WHERE key = ?1")
            .map_err(|e| e.to_string())?;
        let mut rows = stmt.query(params![key]).map_err(|e| e.to_string())?;
        if let Some(row) = rows.next().map_err(|e| e.to_string())? {
            let v: String = row.get(0).map_err(|e| e.to_string())?;
            Ok(Some(v))
        } else {
            Ok(None)
        }
    }
}

#[cfg(desktop)]
#[tauri::command]
pub fn crozzo_fiscal_save_sqlite(key: String, value: String) -> Result<(), String> {
    imp::save(&key, &value)
}

#[cfg(desktop)]
#[tauri::command]
pub fn crozzo_fiscal_load_sqlite(key: String) -> Result<Option<String>, String> {
    imp::load(&key)
}

#[cfg(not(desktop))]
#[tauri::command]
pub fn crozzo_fiscal_save_sqlite(_key: String, _value: String) -> Result<(), String> {
    Err("fiscal_sqlite_not_available_on_this_platform".into())
}

#[cfg(not(desktop))]
#[tauri::command]
pub fn crozzo_fiscal_load_sqlite(_key: String) -> Result<Option<String>, String> {
    Ok(None)
}
