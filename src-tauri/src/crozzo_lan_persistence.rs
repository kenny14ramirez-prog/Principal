// Fase 2.3 — Persistencia robusta: SQLite + HLC + operation log (spike).
// Módulo nuevo; no cableado aún al servidor crudo/Axum.
#![allow(dead_code)]

use rusqlite::{params, Connection};
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

/// Hybrid Logical Clock: 48 bits ms + 16 bits counter + node_id.
#[derive(Clone, Debug)]
pub struct Hlc {
    pub physical_ms: u64,
    pub counter: u16,
    pub node_id: String,
}

impl Hlc {
    pub fn new(node_id: String) -> Self {
        Self { physical_ms: now_ms(), counter: 0, node_id }
    }

    pub fn now(&mut self) -> (u64, u16) {
        let now = now_ms();
        if now > self.physical_ms {
            self.physical_ms = now;
            self.counter = 0;
        } else if now == self.physical_ms {
            self.counter = self.counter.saturating_add(1);
        } else {
            // reloj retrocedió: mantener physical_ms, incrementar counter
            self.counter = self.counter.saturating_add(1);
        }
        (self.physical_ms, self.counter)
    }

    pub fn observe(&mut self, remote_ms: u64, remote_counter: u16) {
        let now = now_ms();
        if remote_ms > self.physical_ms || (remote_ms == self.physical_ms && remote_counter > self.counter) {
            self.physical_ms = remote_ms.max(now);
            self.counter = remote_counter.saturating_add(1);
        } else if now > self.physical_ms {
            self.physical_ms = now;
            self.counter = 0;
        } else {
            self.counter = self.counter.saturating_add(1);
        }
    }

    pub fn to_string_repr(&self) -> String {
        format!("{}-{}-{}", self.physical_ms, self.counter, self.node_id)
    }
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64
}

/// Inicializa el schema SQLite para persistencia robusta.
pub fn init_schema(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS pending_ops (
            op_id TEXT PRIMARY KEY,
            created_at TEXT NOT NULL,
            endpoint TEXT NOT NULL,
            payload TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            attempts INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS seen_ops (
            op_id TEXT PRIMARY KEY,
            seen_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS op_log (
            seq INTEGER PRIMARY KEY AUTOINCREMENT,
            op_id TEXT NOT NULL,
            hlc_ms INTEGER NOT NULL,
            hlc_counter INTEGER NOT NULL,
            node_id TEXT NOT NULL,
            payload TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_pending_status ON pending_ops(status);
        CREATE INDEX IF NOT EXISTS idx_seen_op ON seen_ops(op_id);
        CREATE INDEX IF NOT EXISTS idx_oplog_op ON op_log(op_id);",
    )?;
    Ok(())
}

/// Persiste una operación pendiente (idempotente por op_id).
pub fn persist_pending(conn: &Connection, op_id: &str, endpoint: &str, payload: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT OR IGNORE INTO pending_ops (op_id, created_at, endpoint, payload) VALUES (?1, ?2, ?3, ?4)",
        params![op_id, now_ms().to_string(), endpoint, payload],
    )?;
    Ok(())
}

/// Marca una operación como vista (dedup).
pub fn mark_seen(conn: &Connection, op_id: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT OR IGNORE INTO seen_ops (op_id, seen_at) VALUES (?1, ?2)",
        params![op_id, now_ms().to_string()],
    )?;
    Ok(())
}

/// Verifica si una operación ya fue vista.
pub fn is_seen(conn: &Connection, op_id: &str) -> bool {
    conn.query_row("SELECT 1 FROM seen_ops WHERE op_id = ?1", params![op_id], |_| Ok(()))
        .is_ok()
}

/// Registra en el operation log (append-only).
pub fn record_op(conn: &Connection, op_id: &str, hlc: &Hlc, payload: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO op_log (op_id, hlc_ms, hlc_counter, node_id, payload, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![op_id, hlc.physical_ms as i64, hlc.counter as i64, hlc.node_id, payload, now_ms().to_string()],
    )?;
    Ok(())
}

/// Carga operaciones pendientes.
pub fn load_pending(conn: &Connection) -> Vec<(String, String, String)> {
    let mut stmt = match conn.prepare("SELECT op_id, endpoint, payload FROM pending_ops WHERE status = 'pending'") {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?))
    });
    match rows {
        Ok(iter) => iter.filter_map(|r| r.ok()).collect(),
        Err(_) => Vec::new(),
    }
}

/// Marca operación como drenada.
pub fn mark_drained(conn: &Connection, op_id: &str) -> rusqlite::Result<()> {
    conn.execute("UPDATE pending_ops SET status = 'drained' WHERE op_id = ?1", params![op_id])?;
    Ok(())
}

/// Wrapper thread-safe para Connection.
pub struct PersistenceDb {
    pub conn: Arc<Mutex<Connection>>,
}

impl PersistenceDb {
    pub fn open(path: &Path) -> Result<Self, rusqlite::Error> {
        let conn = Connection::open(path)?;
        init_schema(&conn)?;
        Ok(Self { conn: Arc::new(Mutex::new(conn)) })
    }
}


/// Guarda el snapshot de comandas activas (JSON blob) para durabilidad.
pub fn save_comandas(conn: &Connection, comandas: &std::collections::HashMap<String, serde_json::Value>) -> rusqlite::Result<()> {
    let txt = serde_json::to_string(comandas).unwrap_or_default();
    conn.execute(
        "CREATE TABLE IF NOT EXISTS comandas_snapshot (id TEXT PRIMARY KEY, payload TEXT NOT NULL, saved_at TEXT NOT NULL)",
        [],
    )?;
    conn.execute(
        "INSERT INTO comandas_snapshot (id, payload, saved_at) VALUES ('active', ?1, ?2)
         ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, saved_at=excluded.saved_at",
        rusqlite::params![txt, now_ms().to_string()],
    )?;
    Ok(())
}

/// Carga el snapshot de comandas activas desde SQLite.
pub fn load_comandas(conn: &Connection) -> std::collections::HashMap<String, serde_json::Value> {
    let mut out = std::collections::HashMap::new();
    let txt: Option<String> = conn
        .query_row("SELECT payload FROM comandas_snapshot WHERE id='active'", [], |r| r.get(0))
        .ok();
    if let Some(t) = txt {
        if let Ok(m) = serde_json::from_str::<std::collections::HashMap<String, serde_json::Value>>(&t) {
            out = m;
        }
    }
    out
}


/// Compacta op_log: elimina entradas más antiguas que retention_ms.
pub fn compact_op_log(conn: &Connection, retention_ms: u64) -> rusqlite::Result<usize> {
    let cutoff = now_ms().saturating_sub(retention_ms).to_string();
    let n = conn.execute("DELETE FROM op_log WHERE created_at < ?1", rusqlite::params![cutoff])?;
    Ok(n)
}

/// Snapshot de op_log a archivo JSON y truncación.
pub fn snapshot_op_log(conn: &Connection, snapshot_path: &std::path::Path) -> rusqlite::Result<usize> {
    let mut stmt = conn.prepare("SELECT seq, op_id, hlc_ms, hlc_counter, node_id, payload, created_at FROM op_log")?;
    let rows = stmt.query_map([], |row| {
        Ok(serde_json::json!({
            "seq": row.get::<_, i64>(0)?,
            "op_id": row.get::<_, String>(1)?,
            "hlc_ms": row.get::<_, i64>(2)?,
            "hlc_counter": row.get::<_, i64>(3)?,
            "node_id": row.get::<_, String>(4)?,
            "payload": row.get::<_, String>(5)?,
            "created_at": row.get::<_, String>(6)?,
        }))
    })?;
    let mut arr = Vec::new();
    for r in rows {
        if let Ok(v) = r { arr.push(v); }
    }
    let n = arr.len();
    if let Ok(txt) = serde_json::to_string_pretty(&arr) {
        let _ = std::fs::write(snapshot_path, txt);
    }
    // Truncar op_log tras snapshot.
    conn.execute("DELETE FROM op_log", [])?;
    Ok(n)
}

/// Cuenta operaciones en op_log.
pub fn op_log_count(conn: &Connection) -> usize {
    conn.query_row("SELECT COUNT(*) FROM op_log", [], |r| r.get::<_, i64>(0)).unwrap_or(0) as usize
}

/// Purga operaciones drenadas antiguas en pending_ops.
pub fn prune_drained_pending(conn: &Connection, retention_ms: u64) -> rusqlite::Result<usize> {
    let cutoff = now_ms().saturating_sub(retention_ms).to_string();
    let n = conn.execute("DELETE FROM pending_ops WHERE status='drained' AND created_at < ?1", rusqlite::params![cutoff])?;
    Ok(n)
}
