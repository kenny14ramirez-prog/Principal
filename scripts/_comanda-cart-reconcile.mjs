/**
 * BLINDAJE "sí o sí": verifica que el carrito de una mesa se reconstruya desde
 * las comandas (que SÍ sincronizan) cuando el runtime del carrito NO llegó.
 *
 * Escenarios:
 *  A) Comanda llega y el carrito de la mesa estaba vacío → caja ve los items
 *     comandados (cantidad + sentCantidad) para poder cobrar.
 *  B) Reconciliar otra vez NO duplica (idempotente).
 *  C) Si el carrito YA tenía los items (runtime sí sincronizó), no se duplican.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const srcRoot = join(root, 'src');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/') p = '/index.html';
  const file = join(srcRoot, p.replace(/^\//, ''));
  try {
    statSync(file);
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  } catch {
    res.writeHead(404);
    res.end('');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const baseUrl = `http://127.0.0.1:${server.address().port}/index.html`;

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e?.message || e)));
await page.addInitScript(() => {
  localStorage.setItem('crozzo_perfil_empresa', 'basico_restaurante');
  localStorage.setItem(
    'pos_dian_config',
    JSON.stringify({
      seguridad: { requiereLogin: false },
      operacion: { modo: 'demo', demoSubmodo: 'pos' },
      productos: [{ id: 1, nombre: 'Hamburguesa', precio: 10000, categoria: 'X', stock: 50, activo: true, areaComanda: 'COCINA' }],
      comandas: { areas: [{ id: 'COCINA', nombre: 'Cocina' }], autoPrint: false },
    })
  );
  window.__CROZZO_IS_TAURI__ = true;
});
await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForTimeout(5000);

const result = await page.evaluate(async () => {
  const out = {};

  const VER = window.collectPosRuntimeState().v;
  function cartQty(ref) {
    const c = (window.collectPosRuntimeState().cartsPorMesa || {})[ref] || [];
    return {
      lineas: c.length,
      unidades: c.reduce((n, i) => n + (Number(i.cantidad) || 0), 0),
      comandado: c.reduce((n, i) => n + (Number(i.sentCantidad) || 0), 0),
    };
  }

  // Estado base: ninguna comanda, carrito vacío en mesa 30.
  // Simula que llega una comanda desde la nube (otro equipo) para mesa 30.
  window.__crozzoEmergencyApplyComandaSnapshot(
    {
      id: 5001,
      transaction_id: '33333333-3333-4333-8333-333333333333',
      tipoServicio: 'mesa',
      referencia: '30',
      areaId: 'COCINA',
      estado: 'pendiente',
      items: [{ id: 1, nombre: 'Hamburguesa', cantidad: 2, precio: 10000 }],
      createdAt: new Date().toISOString(),
      lastUpdateAt: new Date().toISOString(),
    },
    { skipPrint: true, skipRender: true }
  );
  out.A_caja_ve_comandado = cartQty('30'); // esperado lineas1 unidades2 comandado2

  // B) Reconciliar de nuevo no debe duplicar.
  window.crozzoReconcileSlotCartFromComandas('mesa', '30');
  window.crozzoReconcileSlotCartFromComandas('mesa', '30');
  out.B_idempotente = cartQty('30'); // sigue unidades2 comandado2

  // C) Mesa 31: el carrito YA tiene el item (runtime sí sincronizó) → no duplicar.
  window.applyPosRuntimeSnapshot(
    { v: VER, cartsPorMesa: { '31': [{ id: 1, nombre: 'Hamburguesa', cantidad: 2, precio: 10000, sentCantidad: 0 }] } },
    {}
  );
  window.__crozzoEmergencyApplyComandaSnapshot(
    {
      id: 5002,
      transaction_id: '44444444-4444-4444-8444-444444444444',
      tipoServicio: 'mesa',
      referencia: '31',
      areaId: 'COCINA',
      estado: 'pendiente',
      items: [{ id: 1, nombre: 'Hamburguesa', cantidad: 2, precio: 10000 }],
      createdAt: new Date().toISOString(),
      lastUpdateAt: new Date().toISOString(),
    },
    { skipPrint: true, skipRender: true }
  );
  out.C_no_duplica = cartQty('31'); // unidades2 (no 4), comandado2

  return out;
});

const A = result.A_caja_ve_comandado || {};
const B = result.B_idempotente || {};
const C = result.C_no_duplica || {};
const ok =
  A.lineas === 1 && A.unidades === 2 && A.comandado === 2 &&
  B.unidades === 2 && B.comandado === 2 &&
  C.unidades === 2 && C.comandado === 2;

console.log(JSON.stringify(result, null, 2));
console.log('Errores de página:', errors.length, errors.slice(0, 5));
console.log(ok ? 'RESULTADO: OK — caja reconstruye el carrito comandado (sí o sí), sin duplicar' : 'RESULTADO: FALLO');

await browser.close();
server.close();
process.exit(ok ? 0 : 1);
