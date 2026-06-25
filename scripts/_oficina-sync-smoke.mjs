/**
 * Smoke: cola reservorio → cola offline global (paridad ventas).
 * node scripts/_oficina-sync-smoke.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const srcRoot = join(root, 'src');
const outDir = join(root, 'scripts', '_qa-out');
mkdirSync(outDir, { recursive: true });

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

await page.addInitScript(() => {
  localStorage.setItem(
    'pos_dian_config',
    JSON.stringify({
      seguridad: { requiereLogin: false },
      operacion: { modo: 'demo', demoSubmodo: 'pos' },
      cloud: { supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'eyJ-test' },
    })
  );
  window.__CROZZO_IS_TAURI__ = true;
  window.enqueueOfflineOperation = function (op) {
    window.__offlineOps = window.__offlineOps || [];
    window.__offlineOps.push(op);
    return true;
  };
  window.syncOfflineQueue = async function () {
    return { ok: true, pushed: window.__offlineOps ? window.__offlineOps.length : 0 };
  };
  window.crozzoShouldUseCloud = () => true;
  window.crozzoOnlineConfigReady = () => true;
  window.crozzoTierAllowsCloudSync = () => true;
  window.crozzoCloudDeviceUuidForRest = () => 'qa-device-1';
});

await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(5000);

const result = await page.evaluate(async () => {
  await window.crozzoEnsureModulesForPage('centro-compras');
  const R = window.CrozzoReservorio;
  if (!R || !R.registrarOficina) return { ok: false, reason: 'sin_reservorio' };
  const hasFlush = typeof window.crozzoFlushReservorioSyncQueue === 'function';
  R.registrarOficina({
    proveedorId: 'prov-qa',
    proveedorNombre: 'Proveedor QA',
    numero: 'FE-001',
    total: 150000,
    estado: 'pendiente',
    origen: 'qa-smoke',
  });
  const st = R.load ? R.load() : null;
  const pendResv = (st && st.syncQueue || []).filter((q) => q.estado === 'pendiente').length;
  const encResv = (st && st.syncQueue || []).filter((q) => q.estado === 'encolado_nube').length;
  let flush = null;
  if (hasFlush) flush = window.crozzoFlushReservorioSyncQueue({ force: true, kind: 'qa_smoke' });
  const st2 = R.load ? R.load() : null;
  const pendAfter = (st2 && st2.syncQueue || []).filter((q) => q.estado === 'pendiente').length;
  const encAfter = (st2 && st2.syncQueue || []).filter((q) => q.estado === 'encolado_nube').length;
  const opsRaw = localStorage.getItem('sync_queue_temp') || localStorage.getItem('crozzo_sync_queue') || '[]';
  let ops = [];
  try {
    ops = JSON.parse(opsRaw);
  } catch (_) {}
  const oficinaOps = ops.filter((o) => o.type === 'oficina_factura');
  return {
    ok: hasFlush && flush && flush.mirrored > 0 && oficinaOps.length > 0 && pendAfter < pendResv,
    hasFlush,
    flush,
    pendResv,
    encResv,
    pendAfter,
    encAfter,
    offlineCount: ops.length,
    oficinaOps: oficinaOps.length,
    sampleType: ops[0] && ops[0].type,
    sampleTable: ops[0] && ops[0].table_name,
  };
});

writeFileSync(join(outDir, 'oficina-sync-smoke.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));

await browser.close();
server.close();
process.exit(result.ok ? 0 : 1);
