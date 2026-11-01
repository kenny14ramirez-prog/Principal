p = 'src-tauri/src/crozzo_lan_sync_server.rs'
s = open(p, encoding='utf-8').read()

# 1. Add field to struct: after persistence field
s = s.replace(
    "    /// Persistencia robusta (SQLite + HLC). Fase 2.3.\n    persistence: Option<PersistenceDb>,\n}",
    "    /// Persistencia robusta (SQLite + HLC). Fase 2.3.\n    persistence: Option<PersistenceDb>,\n    /// Hybrid Logical Clock (Fase 2.3).\n    hlc: crate::crozzo_lan_persistence::Hlc,\n}",
    1
)

# 2. Init in crozzo_lan_sync_start: add hlc field
s = s.replace(
    "            persistence: persistence_db,\n        });",
    "            persistence: persistence_db,\n            hlc: crate::crozzo_lan_persistence::Hlc::new(meta.device_id.clone()),\n        });",
    1
)

open(p, 'w', encoding='utf-8').write(s)
print('done')