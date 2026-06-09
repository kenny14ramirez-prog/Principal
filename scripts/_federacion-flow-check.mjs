/**
 * Smoke test — CrozzoFederacionEngine (sin DOM).
 * node scripts/_federacion-flow-check.mjs
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import vm from 'vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function mockLocalStorage() {
  const store = {};
  return {
    getItem(k) {
      return store[k] ?? null;
    },
    setItem(k, v) {
      store[k] = String(v);
    },
    removeItem(k) {
      delete store[k];
    },
  };
}

function loadEngine() {
  const code = readFileSync(join(root, 'app/modules/CrozzoFederacionEngine.js'), 'utf8');
  const ls = mockLocalStorage();
  const movs = [];
  const ctx = {
    localStorage: ls,
    showToast() {},
    CrozzoReservorio: {
      addInventarioMovimiento(m) {
        movs.unshift(Object.assign({ id: 'inv_' + movs.length, productoRefId: m.productoRefId, bodegaId: m.bodegaId }, m));
        return movs[0];
      },
      listInventarioMovimientos() {
        return movs.slice();
      },
      migrateLegacy() {
        return { inventarioMovimientos: movs.slice() };
      },
    },
    fetch() {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]), text: () => Promise.resolve('') });
    },
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.runInNewContext(code, ctx, { filename: 'CrozzoFederacionEngine.js' });
  return { eng: ctx.CrozzoFederacionEngine, movs, ls };
}

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
}

async function main() {
  const { eng, movs } = loadEngine();
  eng.saveNegocioIdentity({ id: 'testco', nombre: 'Test Co' });

  const rem = eng.createRemision({
    tipo: 'transferencia',
    origenBodegaId: 'bod_principal',
    destinoBodegaId: 'bod_transito',
    lineas: [{ mpId: 'mp1', producto: 'Harina', cantidad: 5, und: 'kg' }],
  });
  assert(rem.estado === 'borrador', 'borrador inicial');

  const borradorList = eng.listRemisiones({ direccion: 'saliente' });
  assert(borradorList.some((x) => x.id === rem.id), 'borrador visible en salientes');

  const borrador = eng.createRemision({
    tipo: 'prestamo',
    origenBodegaId: 'bod_principal',
    destinoBodegaId: 'bod_transito',
    lineas: [{ mpId: 'mp9', producto: 'Leche', cantidad: 1, und: 'L' }],
  });
  assert(borrador.estado === 'borrador', 'borrador prestamo');
  const prestamos = eng.listRemisiones({ tipo: 'prestamo' });
  assert(prestamos.some((x) => x.id === borrador.id), 'prestamo en lista');

  const r = await eng.enviarRemision(rem.id);
  assert(r.ok, 'enviar local ok');
  assert(movs.length === 2, 'salida+entrada local = 2 movs, got ' + movs.length);

  const salientes = eng.listRemisiones({ direccion: 'saliente' });
  assert(salientes.some((x) => x.id === rem.id && x.estado === 'enviada'), 'enviada en salientes');

  assert(eng.stockBodegaMp('mp1', 'bod_principal') === -5, 'stock origen');
  assert(eng.stockBodegaMp('mp1', 'bod_transito') === 5, 'stock destino');

  await eng.enviarRemision(rem.id);
  assert(movs.length === 2, 'reenviar no duplica movs');

  const st = eng.loadStore();
  st.inbox = [
    {
      id: 'in_1',
      remisionUuid: 'uuid-ext-1',
      origenNegocioNombre: 'Sede A',
      origenNegocioId: 'sede_a',
      tipo: 'transferencia',
      estado: 'pendiente',
      payload: {
        destino_bodega_id: 'bod_principal',
        lineas: [{ mpId: 'mp2', producto: 'Azúcar', cantidad: 3, und: 'kg' }],
      },
    },
  ];
  eng.saveStore(st);
  movs.length = 0;

  const c1 = await eng.confirmarEntrante('in_1', { recibidoPor: 'Juan' });
  assert(c1.ok, 'confirmar entrante');
  assert(movs.length === 1 && movs[0].tipo === 'entrada_remision', 'entrada entrante');

  const c2 = await eng.confirmarEntrante('in_1', { recibidoPor: 'Juan' });
  assert(c2.error === 'ya_procesada', 'bloqueo doble confirmación');
  assert(movs.length === 1, 'sin duplicar entrada');

  const htmlRoll = eng.buildRemisionPrintHtml(rem, { printOutput: 'roll_80' });
  assert(htmlRoll.indexOf('80mm') >= 0, 'html térmico');
  const htmlCarta = eng.buildRemisionPrintHtml(rem, { printOutput: 'carta' });
  assert(htmlCarta.indexOf('<table') >= 0, 'html carta');

  console.log('OK — federacion flow check passed');
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});
