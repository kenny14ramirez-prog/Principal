p = 'src-tauri/src/crozzo_lan_sync_server.rs'
s = open(p, encoding='utf-8').read()
old = '    let handle = tokio::spawn(run_server(st, listener));'
new = '''    let handle = if std::env::var("CROZZO_USE_AXUM").unwrap_or_default() == "1" {
        tokio::spawn(crozzo_lan_sync_axum::run_axum_server(st, listener))
    } else {
        tokio::spawn(run_server(st, listener))
    };'''
assert old in s
s = s.replace(old, new)
open(p, 'w', encoding='utf-8').write(s)
print('done')