import re
p = 'src-tauri/src/crozzo_lan_sync_server.rs'
s = open(p, encoding='utf-8').read()
old = "    stop: bool,\n}\n\n\nimpl ServerInner {"
new = "    stop: bool,\n    /// Persistencia robusta (SQLite + HLC). Fase 2.3.\n    persistence: Option<PersistenceDb>,\n}\n\n\nimpl ServerInner {"
assert old in s, 'anchor not found'
s = s.replace(old, new, 1)
open(p, 'w', encoding='utf-8').write(s)
print('done')