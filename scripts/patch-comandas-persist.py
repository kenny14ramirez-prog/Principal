# Append comandas persistence functions to crozzo_lan_persistence.rs
p = 'src-tauri/src/crozzo_lan_persistence.rs'
s = open(p, encoding='utf-8').read()
addition = '''

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
'''
s = s + addition
open(p, 'w', encoding='utf-8').write(s)
print('done')