p = 'src-tauri/src/crozzo_lan_sync_server.rs'
s = open(p, encoding='utf-8').read()
s = s.replace('#[derive(Clone)]\nstruct ServerMeta {', '#[derive(Clone, Default)]\npub struct ServerMeta {')
s = s.replace('struct ServerInner {', 'pub struct ServerInner {')
s = s.replace('fn mesh_ping_json(meta: &ServerMeta, port: u16) -> Vec<u8> {',
              'pub fn mesh_ping_json(meta: &ServerMeta, port: u16) -> Vec<u8> {')
# Add impl block after ServerInner struct definition (before shared_state fn)
impl_block = '''
impl ServerInner {
    pub fn meta(&self) -> ServerMeta { self.meta.clone() }
    pub fn port(&self) -> u16 { self.port }
    pub fn auth_token(&self) -> String { self.auth_token.clone() }
    pub fn cloud_reachable(&self) -> bool { self.cloud_reachable }
    pub fn cloud_reachable_at_ms(&self) -> u128 { self.cloud_reachable_at_ms }
    pub fn comandas_count(&self) -> usize { self.comandas_active.len() }
}

'''
marker = 'fn shared_state()'
assert marker in s
s = s.replace(marker, impl_block + marker, 1)
open(p, 'w', encoding='utf-8').write(s)
print('done')