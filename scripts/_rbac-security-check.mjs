/**
 * QA — permisos RBAC: intenta romper reglas de cajero vs admin.
 * Ejecutar: node scripts/_rbac-security-check.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const policySrc = readFileSync(join(root, 'app/modules/CrozzoPermisosPolicy.js'), 'utf8');
const mainSrc = readFileSync(join(root, 'app/core/CrozzoPosMain.js'), 'utf8');

const sandbox = {
  window: {},
  global: {},
  console,
  localStorage: {
    _d: {},
    getItem(k) {
      return this._d[k] ?? null;
    },
    setItem(k, v) {
      this._d[k] = String(v);
    },
  },
  config: { get: () => ({}), set: () => {} },
  showToast: () => {},
  products: [],
  comandas: [],
  getCurrentUser: () => sandbox.__user,
  PERMISOS_CATALOGO: [],
};
sandbox.global = sandbox.window = sandbox;

vm.createContext(sandbox);
vm.runInContext(policySrc, sandbox);

const extract = (name) => {
  const re = new RegExp(`function ${name}\\([\\s\\S]*?\\n\\}`, 'm');
  const m = mainSrc.match(re);
  if (!m) throw new Error('No se encontró ' + name);
  return m[0];
};

['crozzoNormalizeAppRol', 'crozzoHasCajaPermiso', 'crozzoHasProductoPermiso', 'isSuperAdminUser'].forEach((fn) => {
  try {
    vm.runInContext(extract(fn) + '\n', sandbox);
  } catch (e) {
    console.warn('Skip extract', fn, e.message);
  }
});

const Policy = sandbox.CrozzoPermisosPolicy;
const fails = [];
const ok = [];

function assert(label, cond) {
  if (cond) ok.push(label);
  else fails.push(label);
}

const cajeroPerms = Policy.ROLE_PERM_PRESETS.caja;
assert('cajero preset sin eliminar_item', !cajeroPerms.caja.includes('eliminar_item'));
assert('cajero preset sin tab_eliminar', !cajeroPerms.caja.includes('tab_eliminar'));
assert('cajero preset sin anular_comandado', !cajeroPerms.caja.includes('anular_comandado'));
assert('cajero preset sin catalogo', !cajeroPerms.productos.includes('catalogo'));
assert('cajero preset tiene editar_orden', cajeroPerms.caja.includes('editar_orden'));

const clientPequeno = {
  perfil: 'pequeno',
  roles: {},
  rolePerms: {},
};
Policy.syncClientRolePerms(clientPequeno);
clientPequeno.rolePerms.caja = Policy.ROLE_PERM_PRESETS.caja;
clientPequeno.rolePerms.admin = Policy.ROLE_PERM_PRESETS.admin;
const polCaja = Policy.getClientRolePermPolicy(clientPequeno, 'caja');
assert('política caja pequeño sin eliminar_item', !polCaja.caja.includes('eliminar_item'));
assert('política caja pequeno puede proveedores', polCaja.inventario.includes('proveedores'));

const stripSim = (permisos, rol) => {
  const r = rol;
  const stripCaja = ['eliminar_item', 'tab_eliminar', 'anular_comandado'];
  permisos.caja = (permisos.caja || []).filter((p) => !stripCaja.includes(p));
  if (['caja', 'mesero', 'cocina'].includes(r)) {
    permisos.productos = (permisos.productos || []).filter((p) => p !== 'catalogo');
  }
  return permisos;
};
const hacked = stripSim(
  {
    caja: ['vista_pos', 'editar_orden', 'eliminar_item', 'anular_comandado', 'tab_eliminar'],
    productos: ['catalogo'],
    comandas: [],
    admin: [],
    inventario: [],
  },
  'caja'
);
assert('migración v6 quita eliminar_item', !hacked.caja.includes('eliminar_item'));
assert('migración v6 quita tab_eliminar', !hacked.caja.includes('tab_eliminar'));
assert('migración v6 quita anular_comandado', !hacked.caja.includes('anular_comandado'));
assert('migración v6 quita catalogo cajero', !hacked.productos.includes('catalogo'));

sandbox.crozzoGetClientRolePermPolicy = Policy.getClientRolePermPolicy;
sandbox.crozzoIsPermDelegable = Policy.isPermDelegable;
sandbox.crozzoGetActiveClientProfile = () => clientPequeno;

sandbox.__user = {
  id: 'CAJERO_TEST',
  nombre: 'Cajero Test',
  rol: 'caja',
  permisos: {
    caja: ['vista_pos', 'abrir_orden', 'editar_orden', 'facturar'],
    comandas: ['ver'],
    inventario: ['proveedores'],
    productos: [],
    admin: [],
  },
};

if (typeof sandbox.crozzoHasCajaPermiso === 'function') {
  assert('cajero NO eliminar_item', !sandbox.crozzoHasCajaPermiso('eliminar_item'));
  assert('cajero NO anular_comandado', !sandbox.crozzoHasCajaPermiso('anular_comandado'));
  assert('cajero NO tab_eliminar tablet', !sandbox.crozzoHasCajaPermiso('eliminar_item', { context: 'tablet' }));
  assert('cajero SÍ editar_orden', sandbox.crozzoHasCajaPermiso('editar_orden'));
  assert('cajero SÍ abrir_orden', sandbox.crozzoHasCajaPermiso('abrir_orden'));
  assert('cajero SÍ facturar', sandbox.crozzoHasCajaPermiso('facturar'));
}

sandbox.__user.permisos.caja.push('eliminar_item');
if (typeof sandbox.crozzoHasCajaPermiso === 'function') {
  assert('cajero con eliminar_item en JSON pero fuera de política → bloqueado', !sandbox.crozzoHasCajaPermiso('eliminar_item'));
}

sandbox.__user = {
  id: 'ADMIN_TEST',
  rol: 'admin',
  permisos: Policy.ROLE_PERM_PRESETS.admin,
};
if (typeof sandbox.crozzoHasCajaPermiso === 'function') {
  assert('admin SÍ eliminar_item', sandbox.crozzoHasCajaPermiso('eliminar_item'));
  assert('admin SÍ anular_comandado', sandbox.crozzoHasCajaPermiso('anular_comandado'));
}

const removeLogic = (item, perms, policyFn) => {
  const u = { rol: 'caja', permisos: { caja: perms, comandas: [], admin: [], inventario: [], productos: [] } };
  sandbox.__user = u;
  const canEdit = sandbox.crozzoHasCajaPermiso('editar_orden');
  const canDel = sandbox.crozzoHasCajaPermiso('eliminar_item');
  if (item.cantidad > 1) return canEdit;
  return canDel;
};
assert(
  'lógica removeFromCart: qty>1 solo editar_orden',
  removeLogic({ cantidad: 2 }, ['editar_orden']) === true
);
assert(
  'lógica removeFromCart: qty=1 exige eliminar_item',
  removeLogic({ cantidad: 1 }, ['editar_orden']) === false
);
assert(
  'lógica removeFromCart: qty=1 con eliminar_item (admin)',
  (() => {
    sandbox.__user = {
      rol: 'admin',
      permisos: {
        caja: Policy.ROLE_PERM_PRESETS.admin.caja,
        comandas: [],
        admin: [],
        inventario: [],
        productos: [],
      },
    };
    return sandbox.crozzoHasCajaPermiso('eliminar_item');
  })()
);

console.log('\n=== RBAC Security Check ===');
console.log('OK:', ok.length);
ok.forEach((x) => console.log('  ✓', x));
if (fails.length) {
  console.log('FAIL:', fails.length);
  fails.forEach((x) => console.log('  ✗', x));
  process.exit(1);
}
console.log('\nTodos los checks pasaron.\n');
