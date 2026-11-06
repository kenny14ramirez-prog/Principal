p = 'src-tauri/src/crozzo_lan_sync_server.rs'
s = open(p, encoding='utf-8').read()
old = """            stop: false,
        });"""
new = """            stop: false,
            persistence: None,
        });"""
assert old in s
s = s.replace(old, new, 1)
# Now add persistence init before the initializer. Insert after pending_path line in the start function.
old2 = "    let pending_path = pending_file_in(&data_dir.unwrap_or_default());\n    let restored = load_pending(&pending_path);"
new2 = """    let pending_path = pending_file_in(&data_dir.unwrap_or_default());
    let persistence_db = data_dir.as_ref().and_then(|d| {
        let p = std::path::PathBuf::from(d).join("crozzo_lan.db");
        crate::crozzo_lan_persistence::PersistenceDb::open(&p).ok()
    });
    let restored = load_pending(&pending_path);"""
assert old2 in s
s = s.replace(old2, new2, 1)
# Assign persistence_db into initializer: change 'persistence: None,' to use the variable (already None placeholder; replace)
s = s.replace("            persistence: None,\n        });", "            persistence: persistence_db,\n        });", 1)
open(p, 'w', encoding='utf-8').write(s)
print('done')