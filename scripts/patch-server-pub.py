import re
p = 'src-tauri/src/crozzo_lan_sync_server.rs'
s = open(p, encoding='utf-8').read()
s = s.replace('struct ServerMeta {', 'pub struct ServerMeta {')
s = s.replace('struct ServerInner {', 'pub struct ServerInner {')
for f in ['port','meta','cloud_reachable','cloud_reachable_at_ms','pending','in_flight','runtime_snapshot','runtime_saved_at','comandas_active','seen_actions','p2p_signals','auth_token','pending_path','rut_rate_limit','stop']:
    s = s.replace(f'    {f}:', f'    pub {f}:')
open(p, 'w', encoding='utf-8').write(s)
print('done')