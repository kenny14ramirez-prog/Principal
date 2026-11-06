p = 'src-tauri/src/crozzo_lan_sync_server.rs'
s = open(p, encoding='utf-8').read()

old2 = """            if let Some(db) = &inner.persistence {
                let conn = db.conn.lock().unwrap();
                let payload_str = serde_json::to_string(&payload).unwrap_or_default();
                let _ = crate::crozzo_lan_persistence::persist_pending(&conn, &sub.id, &endpoint, &payload_str);
            }"""
new2 = """            if let Some(db) = &inner.persistence {
                let conn = db.conn.lock().unwrap();
                let payload_str = serde_json::to_string(&payload).unwrap_or_default();
                let _ = crate::crozzo_lan_persistence::persist_pending(&conn, &sub.id, &endpoint, &payload_str);
                let hlc_clone = inner.hlc.clone();
                let _ = inner.hlc.now();
                let _ = crate::crozzo_lan_persistence::record_op(&conn, &sub.id, &hlc_clone, &payload_str);
            }"""
assert old2 in s, 'old2 not found'
s = s.replace(old2, new2, 1)
open(p, 'w', encoding='utf-8').write(s)
print('done')