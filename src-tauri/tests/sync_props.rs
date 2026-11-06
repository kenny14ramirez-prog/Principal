// Property-based tests for sync invariants (F5).
// Run with: cargo test --test sync_props

use proptest::prelude::*;
use std::collections::BTreeSet;

// --- Pure functions under test (replicated from sync logic) ---

/// Normaliza un path de API (idempotente).
fn normalize_api_path(path: &str) -> Option<String> {
    let p = path.split('?').next().unwrap_or(path);
    match p {
        "/api/sync" | "/api/orders" | "/api/sales" | "/api/invoices" => Some(p.to_string()),
        _ => None,
    }
}

/// Dedup por clave: si la clave ya existe, no se añade.
fn dedup_insert(set: &mut BTreeSet<String>, key: String) -> bool {
    set.insert(key) // true si se añadió (no existía)
}

/// Merge idempotente de dos conjuntos de claves.
fn merge_sets(a: &BTreeSet<String>, b: &BTreeSet<String>) -> BTreeSet<String> {
    let mut result = a.clone();
    for k in b {
        result.insert(k.clone());
    }
    result
}

/// Simula aplicación de operaciones con dedup (idempotencia).
fn apply_ops(ops: &[String]) -> BTreeSet<String> {
    let mut set = BTreeSet::new();
    for op in ops {
        set.insert(op.clone());
    }
    set
}

/// Simula reconexión: re-aplicar las mismas operaciones no cambia el resultado.
fn reconnect(set: &BTreeSet<String>, ops: &[String]) -> BTreeSet<String> {
    let mut result = set.clone();
    for op in ops {
        result.insert(op.clone());
    }
    result
}

/// Simula caos: aplica ops en orden aleatorio, con duplicados.
fn chaos_apply(ops: &[String]) -> BTreeSet<String> {
    let mut set = BTreeSet::new();
    for op in ops {
        set.insert(op.clone());
    }
    set
}

/// Simula reconexión parcial: solo algunas operaciones se re-aplican.
fn partial_reconnect(set: &BTreeSet<String>, ops: &[String], skip: usize) -> BTreeSet<String> {
    let mut result = set.clone();
    for (i, op) in ops.iter().enumerate() {
        if i >= skip {
            result.insert(op.clone());
        }
    }
    result
}

/// Simula pérdida de red: elimina operaciones aleatorias.
fn network_loss(ops: &[String], drop_rate: f64) -> Vec<String> {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    ops.iter()
        .enumerate()
        .filter(|(i, _)| {
            let mut h = DefaultHasher::new();
            i.hash(&mut h);
            (h.finish() as f64 / u64::MAX as f64) > drop_rate
        })
        .map(|(_, op)| op.clone())
        .collect()
}

// --- Property tests ---

proptest! {
    #[test]
    fn normalize_api_path_is_idempotent(path in ".*") {
        let once = normalize_api_path(&path);
        if let Some(ref p) = once {
            let twice = normalize_api_path(p);
            prop_assert_eq!(twice, once);
        }
    }

    #[test]
    fn normalize_api_path_strips_query(path in "[a-z/]*", query in "[a-z0-9=&]*") {
        let full = if query.is_empty() { path.clone() } else { format!("{}?{}", path, query) };
        let result = normalize_api_path(&full);
        if let Some(ref p) = result {
            prop_assert!(!p.contains('?'));
        }
    }

    #[test]
    fn dedup_insert_is_idempotent(key in "[a-z0-9-]{1,20}") {
        let mut set = BTreeSet::new();
        let first = dedup_insert(&mut set, key.clone());
        let second = dedup_insert(&mut set, key.clone());
        prop_assert!(first);
        prop_assert!(!second);
        prop_assert_eq!(set.len(), 1);
    }

    #[test]
    fn merge_is_commutative(a in proptest::collection::btree_set("[a-z]{1,5}", 0..10),
                           b in proptest::collection::btree_set("[a-z]{1,5}", 0..10)) {
        let ab = merge_sets(&a, &b);
        let ba = merge_sets(&b, &a);
        prop_assert_eq!(ab, ba);
    }

    #[test]
    fn merge_is_idempotent(a in proptest::collection::btree_set("[a-z]{1,5}", 0..10)) {
        let merged = merge_sets(&a, &a);
        prop_assert_eq!(merged, a);
    }

    #[test]
    fn merge_contains_all_keys(a in proptest::collection::btree_set("[a-z]{1,5}", 0..10),
                              b in proptest::collection::btree_set("[a-z]{1,5}", 0..10)) {
        let merged = merge_sets(&a, &b);
        for k in a.iter().chain(b.iter()) {
            prop_assert!(merged.contains(k));
        }
    }

    #[test]
    fn dedup_insert_n_times_yields_one(key in "[a-z0-9-]{1,20}", n in 1usize..20) {
        let mut set = BTreeSet::new();
        for _ in 0..n {
            dedup_insert(&mut set, key.clone());
        }
        prop_assert_eq!(set.len(), 1);
    }

    #[test]
    fn merge_is_associative(a in proptest::collection::btree_set("[a-z]{1,5}", 0..5),
                           b in proptest::collection::btree_set("[a-z]{1,5}", 0..5),
                           c in proptest::collection::btree_set("[a-z]{1,5}", 0..5)) {
        let ab_c = merge_sets(&merge_sets(&a, &b), &c);
        let a_bc = merge_sets(&a, &merge_sets(&b, &c));
        prop_assert_eq!(ab_c, a_bc);
    }

    #[test]
    fn reconnect_operations_order_independent(ops in proptest::collection::vec("[a-z]{1,5}", 0..20)) {
        let first = apply_ops(&ops);
        let mut shuffled = ops.clone();
        shuffled.reverse();
        let second = apply_ops(&shuffled);
        prop_assert_eq!(first, second);
    }

    #[test]
    fn reconnect_does_not_change_result(ops in proptest::collection::vec("[a-z]{1,5}", 0..20)) {
        let base = apply_ops(&ops);
        let after = reconnect(&base, &ops);
        prop_assert_eq!(base.clone(), after);
    }

    #[test]
    fn apply_n_times_equals_once(ops in proptest::collection::vec("[a-z]{1,5}", 0..20), n in 1usize..5) {
        let once = apply_ops(&ops);
        let mut result = BTreeSet::new();
        for _ in 0..n {
            result = merge_sets(&result, &once);
        }
        prop_assert_eq!(result, once);
    }

    #[test]
    fn chaos_apply_equals_sorted(ops in proptest::collection::vec("[a-z]{1,5}", 0..50)) {
        let result = chaos_apply(&ops);
        let mut sorted = ops.clone();
        sorted.sort();
        sorted.dedup();
        let expected: BTreeSet<String> = sorted.into_iter().collect();
        prop_assert_eq!(result, expected);
    }

    #[test]
    fn reconnect_after_chaos_preserves_data(ops in proptest::collection::vec("[a-z]{1,5}", 0..50)) {
        let base = chaos_apply(&ops);
        let after = reconnect(&base, &ops);
        prop_assert_eq!(base.clone(), after.clone());
        for op in &ops {
            prop_assert!(after.contains(op));
        }
    }

    #[test]
    fn partial_reconnect_preserves_base(ops in proptest::collection::vec("[a-z]{1,5}", 0..20), skip in 0usize..5) {
        let base = apply_ops(&ops);
        let partial = partial_reconnect(&base, &ops, skip);
        for k in &base {
            prop_assert!(partial.contains(k));
        }
    }

    #[test]
    fn empty_ops_is_idempotent(_dummy in 0..1i32) {
        let empty: Vec<String> = vec![];
        let base = apply_ops(&empty);
        let after = reconnect(&base, &empty);
        prop_assert_eq!(base.clone(), after);
        prop_assert!(base.is_empty());
    }

    #[test]
    fn network_loss_never_adds(ops in proptest::collection::vec("[a-z]{1,5}", 0..50)) {
        let full = apply_ops(&ops);
        let partial = network_loss(&ops, 0.5);
        let partial_set = apply_ops(&partial);
        for k in &partial_set {
            prop_assert!(full.contains(k));
        }
    }

    #[test]
    fn network_loss_recoverable(ops in proptest::collection::vec("[a-z]{1,5}", 0..50)) {
        let full = apply_ops(&ops);
        let partial = network_loss(&ops, 0.3);
        let recovered = reconnect(&apply_ops(&partial), &ops);
        prop_assert_eq!(recovered, full);
    }

    #[test]
    fn dedup_across_reconnects(ops in proptest::collection::vec("[a-z]{1,5}", 0..30)) {
        let base = apply_ops(&ops);
        let after1 = reconnect(&base, &ops);
        let after2 = reconnect(&after1.clone(), &ops);
        prop_assert_eq!(base.clone(), after1.clone());
        prop_assert_eq!(after1.clone(), after2);
    }
}

#[test]
fn normalize_known_paths() {
    assert_eq!(normalize_api_path("/api/sync"), Some("/api/sync".to_string()));
    assert_eq!(normalize_api_path("/api/orders?foo=bar"), Some("/api/orders".to_string()));
    assert_eq!(normalize_api_path("/api/unknown"), None);
}

#[test]
fn dedup_prevents_duplicates() {
    let mut set = BTreeSet::new();
    assert!(dedup_insert(&mut set, "key1".to_string()));
    assert!(!dedup_insert(&mut set, "key1".to_string()));
    assert_eq!(set.len(), 1);
}