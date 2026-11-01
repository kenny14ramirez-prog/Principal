p = 'src-tauri/src/crozzo_lan_sync_server.rs'
s = open(p, encoding='utf-8').read()
old = '''fn register_action_or_duplicate(inner: &mut ServerInner, action_id: &str) -> bool {
    let now = now_ms_u128();
    prune_seen_actions(&mut inner.seen_actions, now);
    if let Some(ts) = inner.seen_actions.get(action_id) {
        if now.saturating_sub(*ts) < SEEN_ACTION_TTL_MS {
            return true;
        }
    }
    inner.seen_actions.insert(action_id.to_string(), now);
    false
}'''
new = '''fn register_action_or_duplicate(inner: &mut ServerInner, action_id: &str) -> bool {
    let now = now_ms_u128();
    // Persistencia durable: consultar SQLite primero (Fase 2.3).
    if let Some(db) = &inner.persistence {
        let conn = db.conn.lock().unwrap();
        if crate::crozzo_lan_persistence::is_seen(&conn, action_id) {
            return true;
        }
    }
    prune_seen_actions(&mut inner.seen_actions, now);
    if let Some(ts) = inner.seen_actions.get(action_id) {
        if now.saturating_sub(*ts) < SEEN_ACTION_TTL_MS {
            return true;
        }
    }
    inner.seen_actions.insert(action_id.to_string(), now);
    // Marcar en SQLite para durabilidad.
    if let Some(db) = &inner.persistence {
        let conn = db.conn.lock().unwrap();
        let _ = crate::crozzo_lan_persistence::mark_seen(&conn, action_id);
    }
    false
}'''
assert old in s
s = s.replace(old, new, 1)
open(p, 'w', encoding='utf-8').write(s)
print('done')