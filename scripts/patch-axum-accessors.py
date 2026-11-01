p = 'src-tauri/src/crozzo_lan_sync_server.rs'
s = open(p, encoding='utf-8').read()

# Make ops_digest_from_comandas pub
s = s.replace('fn ops_digest_from_comandas(', 'pub fn ops_digest_from_comandas(')

# Add accessors to impl ServerInner (insert before closing of impl block)
# We'll insert new methods after comandas_count method in impl block
old = '''    pub fn comandas_count(&self) -> usize { self.comandas_active.len() }
}'''
new = '''    pub fn comandas_count(&self) -> usize { self.comandas_active.len() }
    pub fn comandas_values(&self) -> Vec<serde_json::Value> { self.comandas_active.values().cloned().collect() }
    pub fn runtime_saved_at(&self) -> String { self.runtime_saved_at.clone() }
    pub fn runtime_snapshot(&self) -> Option<serde_json::Value> { self.runtime_snapshot.clone() }
    pub fn p2p_signals_filtered(&self, for_dev: &str, since: u128) -> Vec<serde_json::Value> {
        let mut out = Vec::new();
        for sig in &self.p2p_signals {
            let at = sig.at_ms.parse::<u128>().unwrap_or(0);
            if at < since { continue; }
            let include = if for_dev.is_empty() {
                true
            } else if for_dev == "central" {
                sig.to == "central"
            } else {
                sig.to == for_dev
            };
            if include {
                out.push(serde_json::to_value(sig).unwrap_or(serde_json::json!({})));
            }
        }
        out
    }
    pub fn ops_digest(&self) -> serde_json::Value {
        let rows: Vec<serde_json::Value> = self.comandas_active.values().cloned().collect();
        ops_digest_from_comandas(&rows, &self.runtime_saved_at)
    }
}
'''
assert old in s, 'impl block not found'
s = s.replace(old, new)

open(p, 'w', encoding='utf-8').write(s)
print('done')