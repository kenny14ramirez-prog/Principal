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
      productos: [{ id: 1, nombre: 'Hamburguesa', precio: 10000, categoria: 'X', stock: 50, activo: true }],
    })
  );
  window.__CROZZO_IS_TAURI__ = true;
});
await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForTimeout(5000);

const result = await page.evaluate(async () => {
  const VER = window.collectPosRuntimeState().v;
  function cartsOf() {
    return window.collectPosRuntimeState().cartsPorMesa || {};
  }
  const out = {};

  // --- Escenario A: caja NO está viendo la mesa 5 ---
  window.applyPosRuntimeSnapshot(
    { v: VER, tipoServicioCaja: 'directa', mesaSeleccionada: null, cajaMesaOrderOpen: false, cartsPorMesa: {} },
    {}
  );
  window.crozzoApplyRemoteRuntimeRow(
    { v: VER, cartsPorMesa: { '5': [{ id: 1, cantidad: 2, nombre: 'Hamburguesa', precio: 10000 }] } },
    new Date(Date.now() + 20000).toISOString(),
    { force: true }
  );
  const a = cartsOf()['5'] || [];
  out.escenarioA_cajaNoViendo = { lineas: a.length, qty: a.reduce((n, i) => n + (i.cantidad || 0), 0) };

  // --- Escenario B: caja TIENE la mesa 5 abierta (carrito local vacío) ---
  window.applyPosRuntimeSnapshot(
    { v: VER, tipoServicioCaja: 'mesa', mesaSeleccionada: '7', cajaMesaOrderOpen: true, cartsPorMesa: { '7': [] } },
    {}
  );
  window.crozzoApplyRemoteRuntimeRow(
    { v: VER, cartsPorMesa: { '7': [{ id: 1, cantidad: 3, nombre: 'Hamburguesa', precio: 10000 }] } },
    new Date(Date.now() + 40000).toISOString(),
    { force: true }
  );
  const b = cartsOf()['7'] || [];
  out.escenarioB_cajaViendoMesa = { lineas: b.length, qty: b.reduce((n, i) => n + (i.cantidad || 0), 0) };

  // --- Escenario C: caja viendo la mesa y el mesero AÑADE a items ya existentes ---
  window.applyPosRuntimeSnapshot(
    { v: VER, tipoServicioCaja: 'mesa', mesaSeleccionada: '9', cajaMesaOrderOpen: true, cartsPorMesa: { '9': [{ id: 1, cantidad: 1, nombre: 'Hamburguesa', precio: 10000 }] } },
    {}
  );
  window.crozzoApplyRemoteRuntimeRow(
    { v: VER, cartsPorMesa: { '9': [{ id: 1, cantidad: 4, nombre: 'Hamburguesa', precio: 10000 }] } },
    new Date(Date.now() + 60000).toISOString(),
    { force: true }
  );
  const c = cartsOf()['9'] || [];
  out.escenarioC_cajaViendoYmeseroSuma = { lineas: c.length, qty: c.reduce((n, i) => n + (i.cantidad || 0), 0) };

  return out;
});

console.log('Resultado:', JSON.stringify(result, null, 2));
console.log('Errores de página:', errors.length, errors.slice(0, 5));
await browser.close();
server.close();
