p = 'src-tauri/src/crozzo_lan_persistence.rs'
s = open(p, encoding='utf-8').read()
addition = '''

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
'''
s = s + addition
open(p, 'w', encoding='utf-8').write(s)
print('done')