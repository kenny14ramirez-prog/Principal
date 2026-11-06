p = 'src-tauri/src/crozzo_lan_sync_server.rs'
s = open(p, encoding='utf-8').read()
s = s.replace('fn ingest_api_sync(', 'pub fn ingest_api_sync(')
open(p, 'w', encoding='utf-8').write(s)
print('done')