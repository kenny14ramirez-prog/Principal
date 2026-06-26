/**
 * Anti-resurrección / anti-duplicado al volver de estar offline.
 *
 * Escenario del usuario: una tablet estuvo apagada y tiene 3 comandas locales
 * de hace días que YA fueron cobradas (no existen en la nube). Al reconectar:
 *  - NO debe resucitarlas, NO re-comandarlas, NO subirlas.
 *  - Debe limpiarlas (reconciliación por ausencia).
 *  - PERO una comanda local recién creada (en vuelo, en outbox) NO se borra.
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
  const diasAtras = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
  const ahora = new Date().toISOString();

  // Inyecta 3 comandas locales VIEJAS (de hace días) en mesas 50/51/52.
  [50, 51, 52].forEach((n, i) => {
    window.__crozzoEmergencyApplyComandaSnapshot(
      {
        id: 9000 + i,
        transaction_id: '9000000' + i + '-0000-4000-8000-000000000000',
        tipoServicio: 'mesa',
        referencia: String(n),
        areaId: 'COCINA',
        estado: 'pendiente',
        items: [{ id: 1, nombre: 'Hamburguesa', cantidad: 1, precio: 10000 }],
        createdAt: diasAtras,
        lastUpdateAt: diasAtras,
      },
      { skipPrint: true, skipRender: true, forceApply: true }
    );
  });
  // Y 1 comanda RECIÉN creada (en vuelo) en mesa 53.
  window.__crozzoEmergencyApplyComandaSnapshot(
    {
      id: 9100,
      transaction_id: '91000000-0000-4000-8000-000000000000',
      tipoServicio: 'mesa',
      referencia: '53',
      areaId: 'COCINA',
      estado: 'pendiente',
      items: [{ id: 1, nombre: 'Hamburguesa', cantidad: 1, precio: 10000 }],
      createdAt: ahora,
      lastUpdateAt: ahora,
    },
    { skipPrint: true, skipRender: true, forceApply: true }
  );

  const activeCount = () =>
    ((window.collectPosRuntimeState().comandas) || []).filter((c) => c && c.estado !== 'entregada').length;
  out.comandasAntes = activeCount();

  // Simula que la "nube" devuelve SOLO la comanda reciente (las viejas ya no existen).
  const cloudRows = [
    {
      id: '91000000-0000-4000-8000-000000000000',
      status: 'pendiente',
      updated_at: ahora,
      payload: {
        id: 9100,
        transaction_id: '91000000-0000-4000-8000-000000000000',
        tipoServicio: 'mesa',
        referencia: '53',
        areaId: 'COCINA',
        estado: 'pendiente',
        items: [{ id: 1, nombre: 'Hamburguesa', cantidad: 1, precio: 10000 }],
      },
    },
  ];

  // Ejecuta la reconciliación por ausencia (cadena completa módulo nube → main).
  out.reconcileDisponible = typeof window.crozzoReconcileStaleLocalComandas === 'function';
  if (out.reconcileDisponible) {
    window.crozzoReconcileStaleLocalComandas(cloudRows);
  }
  out.comandasDespues = activeCount();

  return out;
});

console.log(JSON.stringify(result, null, 2));
console.log('Errores de página:', errors.length, errors.slice(0, 5));
// Esperado: las 3 viejas se eliminan; la reciente (en vuelo) se conserva → queda 1.
const ok =
  result.comandasAntes === 4 &&
  result.reconcileDisponible === true &&
  result.comandasDespues === 1;
console.log(ok ? 'RESULTADO: OK — viejas cobradas eliminadas, la reciente (en vuelo) conservada' : 'RESULTADO: FALLO');

await browser.close();
server.close();
process.exit(ok ? 0 : 1);
