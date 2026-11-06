p = 'src-tauri/src/crozzo_lan_sync_server.rs'
s = open(p, encoding='utf-8').read()
old = """    let restored_comandas = persistence_db.as_ref().map(|db| {
        let conn = db.conn.lock().unwrap();
        crate::crozzo_lan_persistence::load_comandas(&conn)
    }).unwrap_or_default();
    let restored = load_pending(&pending_path);"""
new = """    let restored_comandas = persistence_db.as_ref().map(|db| {
        let conn = db.conn.lock().unwrap();
        crate::crozzo_lan_persistence::load_comandas(&conn)
    }).unwrap_or_default();
    // Restaurar pending desde SQLite (fallback JSON si vacío).
    let restored = if let Some(db) = &persistence_db {
        let conn = db.conn.lock().unwrap();
        let rows = crate::crozzo_lan_persistence::load_pending(&conn);
        if rows.is_empty() {
            load_pending(&pending_path)
        } else {
            rows.into_iter().map(|(id, endpoint, payload)| {
                let payload_val = serde_json::from_str(&payload).unwrap_or_else(|_| serde_json::json!({}));
                CrozzoLanSyncSubmission {
                    id,
                    received_at: now_ms(),
                    endpoint,
                    payload: payload_val,
                }
            }).collect()
        }
    } else {
        load_pending(&pending_path)
    };"""
assert old in s
s = s.replace(old, new, 1)
open(p, 'w', encoding='utf-8').write(s)
print('done')