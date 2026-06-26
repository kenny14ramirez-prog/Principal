/**
 * Verifica que la configuración de MESAS (1–100) se propague entre equipos:
 *  1) rango admite hasta 100 (y recorta >100);
 *  2) al aplicar un snapshot de tenant remoto con `salon`, este equipo
 *     reconstruye su lista de mesas (caja y tablets quedan iguales).
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
      productos: [{ id: 1, nombre: 'Hamburguesa', precio: 10000, categoria: 'X', stock: 50, activo: true }],
    })
  );
  window.__CROZZO_IS_TAURI__ = true;
});
await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForTimeout(5000);

const result = await page.evaluate(async () => {
  const out = {};

  // 1) Rango 1–100 (recorta 150 → 100)
  const guardado = window.saveSalonConfig({ mesaCount: 150, llevarCount: 5 });
  out.rango = {
    mesaCountGuardado: guardado.mesaCount, // esperado 100
    mesasConstruidas: window.buildSalonSlotList('mesa').length, // esperado 100
  };

  // 2) Aplica snapshot de tenant remoto con salon distinto (7 mesas)
  const bundleRemoto = {
    updated_at: new Date().toISOString(),
    salon: { mesaCount: 7, llevarCount: 3, mesaEtiquetaTablet: 'solo_numero', llevarEtiquetaTablet: 'solo_numero', mesaNombres: {}, llevarNombres: {} },
  };
  let aplicado = false;
  if (typeof window.crozzoApplyRemoteTenantBundle === 'function') {
    aplicado = window.crozzoApplyRemoteTenantBundle(bundleRemoto, { quiet: true });
  } else {
    out.error = 'crozzoApplyRemoteTenantBundle no disponible';
  }
  out.propagacion = {
    aplicado: aplicado,
    mesaCountTrasRemoto: window.getSalonConfig().mesaCount, // esperado 7
    mesasConstruidasTrasRemoto: window.buildSalonSlotList('mesa').length, // esperado 7
  };

  return out;
});

const okRango = result.rango && result.rango.mesaCountGuardado === 100 && result.rango.mesasConstruidas === 100;
const okProp =
  result.propagacion &&
  result.propagacion.aplicado === true &&
  result.propagacion.mesaCountTrasRemoto === 7 &&
  result.propagacion.mesasConstruidasTrasRemoto === 7;

console.log(JSON.stringify(result, null, 2));
console.log('Errores de página:', errors.length, errors.slice(0, 5));
console.log(okRango && okProp ? 'RESULTADO: OK — mesas 1–100 + propagación entre equipos' : 'RESULTADO: FALLO');

await browser.close();
server.close();
process.exit(okRango && okProp ? 0 : 1);
