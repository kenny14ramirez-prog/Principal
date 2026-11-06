p = 'src-tauri/src/crozzo_lan_sync_server.rs'
s = open(p, encoding='utf-8').read()

# 1. Startup: load comandas from SQLite
old1 = """    let pending_path = pending_file_in(&data_dir.clone().unwrap_or_default());
    let persistence_db = data_dir.as_ref().and_then(|d| {
        let p = std::path::PathBuf::from(d).join("crozzo_lan.db");
        crate::crozzo_lan_persistence::PersistenceDb::open(&p).ok()
    });
    let restored = load_pending(&pending_path);"""
new1 = """    let pending_path = pending_file_in(&data_dir.unwrap_or_default());
    let persistence_db = data_dir.as_ref().and_then(|d| {
        let p = std::path::PathBuf::from(d).join("crozzo_lan.db");
        crate::crozzo_lan_persistence::PersistenceDb::open(&p).ok()
    });
    let restored_comandas = persistence_db.as_ref().map(|db| {
        let conn = db.conn.lock().unwrap();
        crate::crozzo_lan_persistence::load_comandas(&conn)
    }).unwrap_or_default();
    let restored = load_pending(&pending_path);"""
assert old1 in s
s = s.replace(old1, new1, 1)

# 2. Initializer: use restored_comandas
old2 = """            comandas_active: HashMap::new(),"""
new2 = """            comandas_active: restored_comandas,"""
assert old2 in s
s = s.replace(old2, new2, 1)

# 3. In ingest: dual-write comandas
old3 = """    if !is_identity {
        let mut guard = state.lock().map_err(|e| e.to_string())?;
        if let Some(inner) = guard.as_mut() {
            upsert_comanda_snapshot(inner, &payload);
        }
    }"""
new3 = """    if !is_identity {
        let mut guard = state.lock().map_err(|e| e.to_string())?;
        if let Some(inner) = guard.as_mut() {
            upsert_comanda_snapshot(inner, &payload);
            if typ_str.to_ascii_lowercase().contains("comanda") {
                if let Some(db) = &inner.persistence {
                    let conn = db.conn.lock().unwrap();
                    let _ = crate::crozzo_lan_persistence::save_comandas(&conn, &inner.comandas_active);
                }
            }
        }
    }"""
assert old3 in s
s = s.replace(old3, new3, 1)

open(p, 'w', encoding='utf-8').write(s)
print('done')