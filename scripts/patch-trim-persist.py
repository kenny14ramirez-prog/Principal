p = 'src-tauri/src/crozzo_lan_sync_server.rs'
s = open(p, encoding='utf-8').read()
old = '''fn trim_comandas_active(inner: &mut ServerInner) {
    if inner.comandas_active.len() >= COMANDAS_PURGE_SOFT {
        purge_entregada_comandas(inner);
    }
    if inner.comandas_active.len() <= COMANDAS_ACTIVE_MAX {
        return;
    }
    purge_entregada_comandas(inner);
    while inner.comandas_active.len() > COMANDAS_ACTIVE_MAX {
        let oldest = inner
            .comandas_active
            .iter()
            .min_by_key(|(_, v)| comanda_row_at_ms(v))
            .map(|(k, _)| k.clone());
        match oldest {
            Some(k) => {
                inner.comandas_active.remove(&k);
            }
            None => break,
        }
    }
}'''
new = '''fn trim_comandas_active(inner: &mut ServerInner) {
    if inner.comandas_active.len() >= COMANDAS_PURGE_SOFT {
        purge_entregada_comandas(inner);
    }
    if inner.comandas_active.len() <= COMANDAS_ACTIVE_MAX {
        // Persistir estado tras posible purge.
        if let Some(db) = &inner.persistence {
            let conn = db.conn.lock().unwrap();
            let _ = crate::crozzo_lan_persistence::save_comandas(&conn, &inner.comandas_active);
        }
        return;
    }
    purge_entregada_comandas(inner);
    while inner.comandas_active.len() > COMANDAS_ACTIVE_MAX {
        let oldest = inner
            .comandas_active
            .iter()
            .min_by_key(|(_, v)| comanda_row_at_ms(v))
            .map(|(k, _)| k.clone());
        match oldest {
            Some(k) => {
                inner.comandas_active.remove(&k);
            }
            None => break,
        }
    }
    // Persistir estado tras trim.
    if let Some(db) = &inner.persistence {
        let conn = db.conn.lock().unwrap();
        let _ = crate::crozzo_lan_persistence::save_comandas(&conn, &inner.comandas_active);
    }
}'''
assert old in s
s = s.replace(old, new, 1)
open(p, 'w', encoding='utf-8').write(s)
print('done')