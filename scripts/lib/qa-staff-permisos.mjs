/**
 * Permisos granulares QA — alinea staff demo con CrozzoPermisosPolicy (rol + plan básico).
 * Serializado para page.evaluate().
 */
export function qaEnsureStaffPermisosScript() {
  return () => {
    if (typeof window.crozzoGetClientRolePermPolicy !== 'function' || !window.config) return { ok: false, reason: 'policy_unavailable' };
    var base =
      typeof window.getUsuariosConfig === 'function'
        ? window.getUsuariosConfig()
        : window.config.get('usuarios') || { staff: [] };
    var staff = (base.staff || []).slice();
    var patched = 0;
    staff.forEach(function (row, idx) {
      if (!row || !row.id || String(row.id).toUpperCase() === 'KENNY') return;
      var perm = row.permisos || {};
      var hasAny = ['caja', 'comandas', 'inventario', 'productos', 'admin'].some(function (cat) {
        return Array.isArray(perm[cat]) && perm[cat].length;
      });
      if (hasAny) return;
      var client =
        typeof window.crozzoGetActiveClientProfile === 'function' ? window.crozzoGetActiveClientProfile() : null;
      var pol = window.crozzoGetClientRolePermPolicy(client, row.rol);
      row.permisos = JSON.parse(JSON.stringify(pol));
      staff[idx] = row;
      patched++;
    });
    if (patched && typeof window.saveUsuarios === 'function') window.saveUsuarios(staff);
    else if (patched) window.config.set('usuarios', Object.assign({}, base, { staff: staff }));
    return { ok: true, patched: patched };
  };
}

export function qaEnsurePersonaPermisosScript() {
  return (p) => {
    if (!p || !p.userId) return { ok: false };
    if (typeof window.crozzoGetClientRolePermPolicy !== 'function' || !window.config) return { ok: false };
    localStorage.setItem('crozzo_perfil_empresa', p.perfilEmpresa || 'basico_restaurante');
    var base =
      typeof window.getUsuariosConfig === 'function'
        ? window.getUsuariosConfig()
        : window.config.get('usuarios') || { staff: [] };
    var staff = (base.staff || []).slice();
    var uid = String(p.userId).toUpperCase();
    var i = staff.findIndex(function (s) {
      return s && String(s.id || '').toUpperCase() === uid;
    });
    if (i < 0) return { ok: false, reason: 'staff_not_found' };
    var row = staff[i];
    var client =
      typeof window.crozzoGetActiveClientProfile === 'function' ? window.crozzoGetActiveClientProfile() : null;
    row.permisos = JSON.parse(JSON.stringify(window.crozzoGetClientRolePermPolicy(client, row.rol || p.rol)));
    staff[i] = row;
    if (typeof window.saveUsuarios === 'function') window.saveUsuarios(staff);
    else window.config.set('usuarios', Object.assign({}, base, { staff: staff }));
    return { ok: true, permisos: row.permisos };
  };
}
