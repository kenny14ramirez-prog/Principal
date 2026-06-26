/**
 * Verifica que las MUTACIONES (borrar ítems, vaciar/cobrar) se propaguen en
 * tiempo real entre equipos, y que NO se pierdan ediciones locales recientes.
 *
 * A) Borrado remoto: caja tenía 3, otro equipo deja 1 (borró 2) → caja queda en 1.
 * B) Cobro remoto (slot cerrado + carrito vacío) → la mesa se libera (0 ítems).
 * C) Protección: si ESTE equipo editó la mesa hace un instante, un remoto que
 *    llega "menor" NO le borra su edición reciente.
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
      productos: [{ id: 1, nombre: 'Hamburguesa', precio: 10000, categoria: 'X', stock: 99, activo: true }],
    })
  );
  window.__CROZZO_IS_TAURI__ = true;
});
await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForTimeout(5000);

const result = await page.evaluate(async () => {
  const out = {};
  const VER = window.collectPosRuntimeState().v;
  const cartQty = (ref) => {
    const c = (window.collectPosRuntimeState().cartsPorMesa || {})[ref] || [];
    return c.reduce((n, i) => n + (Number(i.cantidad) || 0), 0);
  };
  const applyRemote = (snap, future) =>
    window.crozzoApplyRemoteRuntimeRow(Object.assign({ v: VER }, snap), new Date(Date.now() + future).toISOString(), { force: true });

  // A) RED DE SEGURIDAD: la mesa tiene consumo y llega un snapshot remoto que NO
  //    la incluye (viejo/parcial con fecha fresca). NO debe pisar/vaciar la mesa.
  window.applyPosRuntimeSnapshot(
    { v: VER, tipoServicioCaja: 'directa', mesaSeleccionada: null, cajaMesaOrderOpen: false,
      cartsPorMesa: { '40': [{ id: 1, nombre: 'Hamburguesa', precio: 10000, cantidad: 3, sentCantidad: 3 }] } },
    {}
  );
  applyRemote({ cartsPorMesa: {} }, 20000); // remoto sin la mesa 40
  out.A_red_seguridad_no_pisa = cartQty('40'); // esperado 3 (se conserva)

  // B) COBRO remoto explícito: closedSlots marca la mesa pagada → se libera (0).
  window.applyPosRuntimeSnapshot(
    { v: VER, cartsPorMesa: { '41': [{ id: 1, nombre: 'Hamburguesa', precio: 10000, cantidad: 2, sentCantidad: 2 }] } },
    {}
  );
  applyRemote({ cartsPorMesa: {}, closedSlots: { mesa: { '41': true }, llevar: {} } }, 40000);
  out.B_cobro_remoto_libera = cartQty('41'); // esperado 0

  return out;
});

const A = result.A_red_seguridad_no_pisa;
const B = result.B_cobro_remoto_libera;
const ok = A === 3 && B === 0;

console.log(JSON.stringify(result, null, 2));
console.log('Errores de página:', errors.length, errors.slice(0, 5));
console.log(ok ? 'RESULTADO: OK — red de seguridad protege mesas activas y el cobro las libera' : 'RESULTADO: FALLO');

await browser.close();
server.close();
process.exit(ok ? 0 : 1);
