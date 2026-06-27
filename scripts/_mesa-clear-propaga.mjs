/**
 * Propagación de VACIADOS autoritativos (borrar/liquidar/mover/dividir/juntar):
 * cuando caja vacía una mesa, el otro equipo la libera — sin pisar una edición
 * local en curso.
 *
 * A) Remoto trae M70 vacía con timestamp NUEVO (caja borró) y local NO la editó
 *    aquí → se LIBERA (carrito vacío).
 * B) Mesa M71 con consumo y remoto NO la incluye (snapshot parcial/viejo) →
 *    se CONSERVA (red de seguridad anti-pisado intacta).
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
  const qty = (ref) => {
    const c = (window.collectPosRuntimeState().cartsPorMesa || {})[ref] || [];
    return c.reduce((n, i) => n + (Number(i.cantidad) || 0), 0);
  };

  // Estado local: M70 y M71 ocupadas (recibidas de la nube, sin edición local).
  window.applyPosRuntimeSnapshot(
    {
      v: VER,
      tipoServicioCaja: 'directa',
      mesaSeleccionada: null,
      cajaMesaOrderOpen: false,
      cartsPorMesa: {
        '70': [{ id: 1, nombre: 'Hamburguesa', precio: 10000, cantidad: 2, sentCantidad: 2 }],
        '71': [{ id: 1, nombre: 'Hamburguesa', precio: 10000, cantidad: 1, sentCantidad: 1 }],
      },
    },
    {}
  );
  out.antes = { m70: qty('70'), m71: qty('71') };

  // Caja vació M70 (autoritativo, timestamp NUEVO). El snapshot NO incluye M71.
  const futuro = Date.now() + 30000;
  window.applyPosRuntimeSnapshot(
    {
      v: VER,
      cartsPorMesa: { '70': [] }, // M70 vacía explícita
      // M71 ausente del snapshot
    },
    {
      skipUiFields: true,
      slotUpdatedAt: { 'mesa:70': futuro }, // vaciado autoritativo de M70
    }
  );

  out.despues = { m70: qty('70'), m71: qty('71') };
  return out;
});

const ok =
  result.antes && result.antes.m70 === 2 && result.antes.m71 === 1 &&
  result.despues && result.despues.m70 === 0 && result.despues.m71 === 1;

console.log(JSON.stringify(result, null, 2));
console.log('Errores de página:', errors.length, errors.slice(0, 5));
console.log(ok ? 'RESULTADO: OK — vaciado autoritativo libera M70; M71 (ausente) se conserva' : 'RESULTADO: FALLO');

await browser.close();
server.close();
process.exit(ok ? 0 : 1);
