/**
 * MERGE-ON-WRITE en modo SEDE: al escribir la fila única por sede, NO se deben
 * pisar las mesas de otros equipos. Esta era la causa de "comando una mesa y la
 * otra deja de comunicarse" (overwrite ciego de la fila única).
 *
 * Carga el módulo real en Node y prueba mergeSedeSnapshots:
 *  A) Nube tiene mesa 5; local trae mesa 6 → merge conserva 5 Y 6.
 *  B) Local tiene su propia versión de la mesa 6 → local manda (no la pisa nube).
 *  C) Local cobró la mesa 7 (closedSlots) y la nube aún la tiene → NO se resucita.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const file = join(root, 'app', 'modules', 'CrozzoPosRuntimeCloud.js');

globalThis.window = globalThis;
globalThis.crozzoOnlineConfigReady = () => false; // evita que arranque timers/red
globalThis.getMultiDeviceConfig = () => ({ businessId: 'b', locationId: 'L', deviceId: 'd', role: 'A' });
globalThis.addEventListener = () => {};
globalThis.document = { addEventListener: () => {}, hidden: false };

vm.runInThisContext(readFileSync(file, 'utf8'), { filename: file });

const merge = globalThis.__crozzoMergeSedeSnapshots;
if (typeof merge !== 'function') {
  console.log('FALLO: mergeSedeSnapshots no expuesto');
  process.exit(1);
}

// Compacto: cada línea es [id, qty, precio, nombre].
const L = (id, qty) => [[id, qty, 10000, 'Item']];

// A) y B): nube con mesa 5 y mesa 6(v-nube); local con mesa 6(v-local).
const cloudPay = {
  _c: 1,
  cartsPorMesa: { '5': L(1, 2), '6': L(1, 9) },
  cartsPorLlevar: {},
  closedSlots: { mesa: {}, llevar: {} },
};
const localSnap = {
  _c: 1,
  cartsPorMesa: { '6': L(1, 3), '7': [] },
  cartsPorLlevar: {},
  closedSlots: { mesa: { '7': true }, llevar: {} }, // local cobró la 7
};
// La nube además tiene la mesa 7 con items (otro equipo la dejó antes del cobro):
cloudPay.cartsPorMesa['7'] = L(1, 5);

const merged = merge(cloudPay, JSON.parse(JSON.stringify(localSnap)));
const mesas = merged.cartsPorMesa || {};
const qty = (ref) => (Array.isArray(mesas[ref]) ? mesas[ref].reduce((n, r) => n + (Number(r[1]) || 0), 0) : 0);

const out = {
  mesa5_preservada_de_nube: qty('5'), // 2 (otro equipo)
  mesa6_local_manda: qty('6'), // 3 (local, no la 9 de nube)
  mesa7_no_resucita_cobrada: qty('7'), // 0 (local la cobró)
};
console.log(JSON.stringify(out, null, 2));

const ok = out.mesa5_preservada_de_nube === 2 && out.mesa6_local_manda === 3 && out.mesa7_no_resucita_cobrada === 0;
console.log(ok ? 'RESULTADO: OK — merge-on-write conserva mesas de otros, local manda en las suyas, no resucita cobradas' : 'RESULTADO: FALLO');
process.exit(ok ? 0 : 1);
