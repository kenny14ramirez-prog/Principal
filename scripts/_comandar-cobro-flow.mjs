/**
 * Flujo crítico bidireccional: comandar en un equipo y que el OTRO lo vea en la
 * mesa para cobrar (carrito con cantidades comandadas), vía la nube.
 *
 * Prueba ampliada (LAN + escala 1→100): npm run test:field-devices
 * Ver: scripts/_field-device-scale.mjs
 *
 * Emula dos equipos en una sola página: el "tablet" comanda la mesa; capturamos
 * el snapshot de runtime que se publicaría a la nube; lo aplicamos como lo haría
 * la "caja" al hacer pull, y verificamos que ve los ítems comandados para cobrar.
 * Luego la caja agrega un ítem y verificamos que el tablet lo vería (vía inversa).
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

  // ── EQUIPO 1 (tablet): comanda la mesa 12 con 2 hamburguesas ──
  window.applyPosRuntimeSnapshot(
    {
      v: VER,
      tipoServicioCaja: 'mesa',
      mesaSeleccionada: '12',
      cajaMesaOrderOpen: true,
      cartsPorMesa: { '12': [{ id: 1, nombre: 'Hamburguesa', precio: 10000, cantidad: 2, areaComanda: 'COCINA' }] },
    },
    {}
  );

  const comandasAntes = (window.comandas || []).length;
  window.__crozzoSkipDupCheck = true; // saltar el modal anti-duplicado (en uso real lo confirma el cajero)
  window.__crozzoSkipAllComandaGuards = true; // y cualquier otro modal de cuidado, para el test headless
  if (typeof window.comandarDesdeCaja === 'function') {
    window.comandarDesdeCaja();
  } else {
    out.error = 'comandarDesdeCaja no disponible';
    return out;
  }

  out.failReason = String(window.__crozzoLastComandaSendFailReason || '');
  out.usuarioActual = (function () { try { return !!window.currentUser || !!(window.config && window.config.get && window.config.get('currentUser')); } catch (_) { return 'n/a'; } })();
  const comandasDespues = (window.comandas || []).length;
  const cartTrasComandar = (window.collectPosRuntimeState().cartsPorMesa || {})['12'] || [];
  const sent = cartTrasComandar.reduce((n, i) => n + (Number(i.sentCantidad) || 0), 0);
  out.equipo1_comandar = {
    comandaCreada: comandasDespues > comandasAntes,
    lineasEnCarrito: cartTrasComandar.length,
    comandado: sent, // sentCantidad total: lo que caja debe poder cobrar
  };

  // Snapshot que se publica a la nube (lo que la caja descargaría).
  const snapshotNube = JSON.parse(JSON.stringify(window.collectPosRuntimeState()));

  // ── EQUIPO 2 (caja): parte SIN ver la mesa y recibe el snapshot de la nube ──
  window.applyPosRuntimeSnapshot(
    { v: VER, tipoServicioCaja: 'directa', mesaSeleccionada: null, cajaMesaOrderOpen: false, cartsPorMesa: {} },
    {}
  );
  // Caja aplica lo que vino de la nube (como en un pull real):
  window.crozzoApplyRemoteRuntimeRow(snapshotNube, new Date(Date.now() + 30000).toISOString(), { force: true });

  const cajaVe = (window.collectPosRuntimeState().cartsPorMesa || {})['12'] || [];
  out.equipo2_caja_ve_para_cobrar = {
    lineas: cajaVe.length,
    unidades: cajaVe.reduce((n, i) => n + (Number(i.cantidad) || 0), 0),
    comandado: cajaVe.reduce((n, i) => n + (Number(i.sentCantidad) || 0), 0),
  };

  // ── VÍA INVERSA: caja agrega 1 unidad y el tablet debería verlo ──
  window.applyPosRuntimeSnapshot(
    {
      v: VER,
      tipoServicioCaja: 'mesa',
      mesaSeleccionada: '12',
      cajaMesaOrderOpen: true,
      cartsPorMesa: { '12': [{ id: 1, nombre: 'Hamburguesa', precio: 10000, cantidad: 3, sentCantidad: 2, areaComanda: 'COCINA' }] },
    },
    {}
  );
  const snapshotCaja = JSON.parse(JSON.stringify(window.collectPosRuntimeState()));
  // Tablet parte viendo la mesa con 2 y recibe el cambio de caja (3):
  window.applyPosRuntimeSnapshot(
    {
      v: VER,
      tipoServicioCaja: 'mesa',
      mesaSeleccionada: '12',
      cajaMesaOrderOpen: true,
      cartsPorMesa: { '12': [{ id: 1, nombre: 'Hamburguesa', precio: 10000, cantidad: 2, sentCantidad: 2, areaComanda: 'COCINA' }] },
    },
    {}
  );
  window.crozzoApplyRemoteRuntimeRow(snapshotCaja, new Date(Date.now() + 60000).toISOString(), { force: true });
  const tabletVe = (window.collectPosRuntimeState().cartsPorMesa || {})['12'] || [];
  out.via_inversa_tablet_ve = {
    unidades: tabletVe.reduce((n, i) => n + (Number(i.cantidad) || 0), 0),
  };

  return out;
});

const e1 = result.equipo1_comandar || {};
const e2 = result.equipo2_caja_ve_para_cobrar || {};
const inv = result.via_inversa_tablet_ve || {};
const ok =
  e1.comandaCreada === true &&
  e1.comandado === 2 &&
  e2.unidades === 2 &&
  e2.comandado === 2 &&
  inv.unidades === 3;

console.log(JSON.stringify(result, null, 2));
console.log('Errores de página:', errors.length, errors.slice(0, 5));
console.log(ok ? 'RESULTADO: OK — comandar↔cobrar bidireccional verificado' : 'RESULTADO: FALLO — revisar flujo');

await browser.close();
server.close();
process.exit(ok ? 0 : 1);
