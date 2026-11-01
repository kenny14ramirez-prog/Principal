p = 'src-tauri/src/crozzo_lan_sync_server.rs'
s = open(p, encoding='utf-8').read()
old = """            let path = inner.pending_path.clone();
            save_pending(&path, &inner.pending);
        }
    }
    Ok(serde_json::json!({ "ok": true, "id": sub.id, "durable": true, "action_id": extract_action_id(&payload) }))"""
new = """            let path = inner.pending_path.clone();
            save_pending(&path, &inner.pending);
            if let Some(db) = &inner.persistence {
                let conn = db.conn.lock().unwrap();
                let payload_str = serde_json::to_string(&payload).unwrap_or_default();
                let _ = crate::crozzo_lan_persistence::persist_pending(&conn, &sub.id, &endpoint, &payload_str);
            }
        }
    }
    Ok(serde_json::json!({ "ok": true, "id": sub.id, "durable": true, "action_id": extract_action_id(&payload) }))"""
assert old in s
s = s.replace(old, new, 1)
open(p, 'w', encoding='utf-8').write(s)
print('done')