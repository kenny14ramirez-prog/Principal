//! Emulación autónoma: SQLite de prueba + registro de impresión simulada (sin hardware).

use base64::Engine;
use rusqlite::{params, Connection};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};

use crate::crozzo_print::CrozzoPrintResult;

static EMULATION_ACTIVE: AtomicBool = AtomicBool::new(false);

fn env_flag_on() -> bool {
    std::env::var("CROZZO_EMULATION")
        .map(|v| {
            let s = v.trim().to_lowercase();
            s == "1" || s == "true" || s == "yes"
        })
        .unwrap_or(false)
}

pub fn is_active() -> bool {
    EMULATION_ACTIVE.load(Ordering::SeqCst) || env_flag_on()
}

pub fn set_active(on: bool) {
    EMULATION_ACTIVE.store(on, Ordering::SeqCst);
}

fn emulation_root() -> Result<PathBuf, String> {
    if let Ok(dir) = std::env::var("CROZZO_EMULATION_DIR") {
        let p = PathBuf::from(dir.trim());
        std::fs::create_dir_all(&p).map_err(|e| format!("No se pudo crear CROZZO_EMULATION_DIR: {e}"))?;
        return Ok(p);
    }
    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let logs = cwd.join("test-logs");
    std::fs::create_dir_all(&logs).map_err(|e| format!("No se pudo crear test-logs/: {e}"))?;
    Ok(logs)
}

pub fn test_db_path() -> Result<PathBuf, String> {
    Ok(emulation_root()?.join("test.db"))
}

pub fn print_log_path() -> Result<PathBuf, String> {
    Ok(emulation_root()?.join("impresiones.log"))
}

fn db_conn() -> Result<Connection, String> {
    let path = test_db_path()?;
    let conn = Connection::open(&path).map_err(|e| format!("SQLite test.db: {e}"))?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS print_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            at TEXT NOT NULL DEFAULT (datetime('now')),
            printer TEXT,
            kind TEXT,
            copies INTEGER,
            bytes_len INTEGER,
            preview TEXT,
            data_b64 TEXT
        );
        CREATE TABLE IF NOT EXISTS automation_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            at TEXT NOT NULL DEFAULT (datetime('now')),
            action TEXT NOT NULL,
            payload TEXT
        );",
    )
    .map_err(|e| format!("SQLite schema: {e}"))?;
    Ok(conn)
}

fn append_text_log(line: &str) -> Result<(), String> {
    use std::io::Write;
    let path = print_log_path()?;
    let mut f = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("Log impresión: {e}"))?;
    writeln!(f, "{line}").map_err(|e| format!("Escribir log: {e}"))?;
    Ok(())
}

fn preview_escpos(data: &[u8]) -> String {
    let mut out = String::new();
    for &b in data.iter().take(800) {
        if b >= 0x20 && b < 0x7f {
            out.push(b as char);
        } else if b == b'\n' {
            out.push('\n');
        } else {
            out.push('·');
        }
    }
    if data.len() > 800 {
        out.push_str("…");
    }
    out
}

pub fn mock_print_raw(
    printer_name: &str,
    data: &[u8],
    copies: u32,
    kind: Option<&str>,
) -> Result<CrozzoPrintResult, String> {
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(data);
    let preview = preview_escpos(data);
    let kind_s = kind.unwrap_or("raw");
    let copies = copies.max(1).min(10);

    let conn = db_conn()?;
    conn.execute(
        "INSERT INTO print_log (printer, kind, copies, bytes_len, preview, data_b64) VALUES (?1,?2,?3,?4,?5,?6)",
        params![
            printer_name,
            kind_s,
            copies,
            data.len() as i64,
            preview,
            b64
        ],
    )
    .map_err(|e| format!("SQLite insert print_log: {e}"))?;

    let line = format!(
        "[{kind_s}] impresora={printer_name} copias={copies} bytes={} preview={preview:?}",
        data.len()
    );
    append_text_log(&line)?;

    Ok(CrozzoPrintResult {
        ok: true,
        message: format!(
            "Emulación: ticket guardado en {} ({} bytes)",
            print_log_path()?.display(),
            data.len()
        ),
    })
}

pub fn mock_print_html(printer_name: &str, html_b64: &str, copies: u32) -> Result<CrozzoPrintResult, String> {
    use base64::Engine;
    let html = base64::engine::general_purpose::STANDARD
        .decode(html_b64.trim())
        .map_err(|e| format!("HTML base64 inválido: {e}"))?;
    let text = String::from_utf8_lossy(&html);
    let preview: String = text.chars().take(400).collect();
    let conn = db_conn()?;
    conn.execute(
        "INSERT INTO print_log (printer, kind, copies, bytes_len, preview, data_b64) VALUES (?1,'html',?2,?3,?4,?5)",
        params![
            printer_name,
            copies.max(1).min(10),
            html.len() as i64,
            preview,
            html_b64
        ],
    )
    .map_err(|e| format!("SQLite insert html: {e}"))?;
    append_text_log(&format!(
        "[html] impresora={printer_name} copias={copies} chars={}",
        html.len()
    ))?;
    Ok(CrozzoPrintResult {
        ok: true,
        message: format!(
            "Emulación HTML guardada en {}",
            print_log_path()?.display()
        ),
    })
}

#[derive(Debug, Serialize)]
pub struct CrozzoEmulationStatus {
    pub active: bool,
    pub test_db: String,
    pub print_log: String,
    pub print_rows: i64,
    pub automation_rows: i64,
}

#[tauri::command]
pub fn crozzo_emulation_set_active(active: bool) -> Result<CrozzoEmulationStatus, String> {
    set_active(active);
    crozzo_emulation_status()
}

#[tauri::command]
pub fn crozzo_emulation_status() -> Result<CrozzoEmulationStatus, String> {
    let active = is_active();
    let test_db = test_db_path()?.display().to_string();
    let print_log = print_log_path()?.display().to_string();
    let (print_rows, automation_rows) = if active {
        let conn = db_conn()?;
        let p: i64 = conn
            .query_row("SELECT COUNT(*) FROM print_log", [], |r| r.get(0))
            .unwrap_or(0);
        let a: i64 = conn
            .query_row("SELECT COUNT(*) FROM automation_log", [], |r| r.get(0))
            .unwrap_or(0);
        (p, a)
    } else {
        (0, 0)
    };
    Ok(CrozzoEmulationStatus {
        active,
        test_db,
        print_log,
        print_rows,
        automation_rows,
    })
}

#[tauri::command]
pub fn crozzo_emulation_reset_db() -> Result<CrozzoEmulationStatus, String> {
    let path = test_db_path()?;
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| format!("No se pudo borrar test.db: {e}"))?;
    }
    let _ = db_conn()?;
    crozzo_emulation_status()
}

#[tauri::command]
pub fn crozzo_emulation_log_action(action: String, payload_json: Option<String>) -> Result<(), String> {
    if !is_active() {
        return Err("Emulación no activa".into());
    }
    let conn = db_conn()?;
    conn.execute(
        "INSERT INTO automation_log (action, payload) VALUES (?1, ?2)",
        params![action, payload_json.unwrap_or_else(|| "{}".into())],
    )
    .map_err(|e| format!("automation_log: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn crozzo_emulation_query_sql(
    query: String,
) -> Result<Vec<serde_json::Value>, String> {
    if !is_active() {
        return Err("Emulación no activa".into());
    }
    let q = query.trim();
    if !q.to_lowercase().starts_with("select") {
        return Err("Solo consultas SELECT en emulación".into());
    }
    let conn = db_conn()?;
    let mut stmt = conn.prepare(q).map_err(|e| format!("SQL: {e}"))?;
    let col_count = stmt.column_count();
    let col_names: Vec<String> = (0..col_count)
        .map(|i| {
            stmt.column_name(i)
                .map(|s| s.to_string())
                .unwrap_or_else(|_| format!("col_{i}"))
        })
        .collect();
    let rows = stmt
        .query_map([], |row| {
            let mut obj = serde_json::Map::new();
            for i in 0..col_count {
                let val: rusqlite::types::Value = row.get(i)?;
                obj.insert(col_names[i].clone(), sqlite_value_to_json(val));
            }
            Ok(serde_json::Value::Object(obj))
        })
        .map_err(|e| format!("query: {e}"))?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| format!("row: {e}"))?);
    }
    Ok(out)
}

fn sqlite_value_to_json(v: rusqlite::types::Value) -> serde_json::Value {
    match v {
        rusqlite::types::Value::Null => serde_json::Value::Null,
        rusqlite::types::Value::Integer(i) => serde_json::json!(i),
        rusqlite::types::Value::Real(f) => serde_json::json!(f),
        rusqlite::types::Value::Text(s) => serde_json::Value::String(s),
        rusqlite::types::Value::Blob(b) => serde_json::Value::String(base64::engine::general_purpose::STANDARD.encode(b)),
    }
}

/// Inicializa flag desde entorno al arrancar.
pub fn init_from_env() {
    if env_flag_on() {
        set_active(true);
        let _ = db_conn();
    }
}
