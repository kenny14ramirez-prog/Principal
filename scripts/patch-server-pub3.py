p = 'src-tauri/src/crozzo_lan_sync_server.rs'
s = open(p, encoding='utf-8').read()
for f in ['location_id', 'device_id', 'business_id', 'business_name', 'supabase_url', 'supabase_anon_key']:
    s = s.replace(f'    {f}: String,', f'    pub {f}: String,')
open(p, 'w', encoding='utf-8').write(s)
print('done')