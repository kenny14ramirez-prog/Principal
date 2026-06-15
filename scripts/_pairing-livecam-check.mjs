/**
 * Verifica que el lector QR de emparejamiento use la CÁMARA EN VIVO dentro de la app
 * (getUserMedia + visor propio) y NO el escáner nativo (pantalla negra).
 * Usa cámara simulada de Chromium.
 *
 * node scripts/_pairing-livecam-check.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, statSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'src');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

const server = createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/') p = '/index.html';
  const file = join(root, p.replace(/^\//, ''));
  try {
    statSync(file);
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const url = `http://127.0.0.1:${port}/index.html`;

const report = { ok: true, steps: [], errors: [] };
function step(id, ok, detail, extra) {
  report.steps.push({ id, ok, detail, extra: extra || null });
  if (!ok) report.ok = false;
}

const browser = await chromium.launch({
  args: [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
  ],
});
const context = await browser.newContext({
  viewport: { width: 420, height: 880 },
  permissions: ['camera'],
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
page.on('pageerror', (e) => report.errors.push(String(e.message || e)));

await page.addInitScript(() => {
  localStorage.setItem('pos_dian_config', JSON.stringify({ seguridad: { requiereLogin: false } }));
  localStorage.setItem(
    'crozzo_lan_config',
    JSON.stringify({ role: 'A', serverIp: '192.168.1.50', centralIp: '192.168.1.50', port: 3000, lanSyncEnabled: true })
  );
  // Simular equipo de campo táctil (sin __TAURI__, para forzar el camino getUserMedia)
  document.documentElement.classList.add('crozzo-touch-shell');
});

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(3500);

const libs = await page.evaluate(() => ({
  reader: !!(window.CrozzoPairingQrReader && window.CrozzoPairingQrReader.startLive),
  openModal: typeof window.crozzoOpenPairingModal === 'function',
}));
step('libs-loaded', libs.reader && libs.openModal, 'reader.startLive + modal', libs);

// Abrir modal → paso lector (en equipo de campo arranca cámara sola)
await page.evaluate(() => {
  if (typeof window.crozzoOpenPairingModal === 'function') window.crozzoOpenPairingModal();
});
await page.waitForTimeout(400);
await page.evaluate(() => {
  if (typeof window.crozzoPairingSelectReader === 'function') window.crozzoPairingSelectReader();
});
// Esperar a que arranque la cámara en vivo (auto-start en field device)
await page.waitForTimeout(2500);

const liveUi = await page.evaluate(() => {
  const zone = document.getElementById('crozzoPairingScanZone');
  const host = document.getElementById('crozzoPairingReaderHost');
  const video = host && host.querySelector('video');
  return {
    scanning: !!(zone && zone.classList.contains('is-scanning')),
    hasVideo: !!video,
    videoPlaying: !!(video && video.readyState >= 2 && !video.paused),
    nativeScanActive: document.documentElement.classList.contains('crozzo-native-scan-active'),
    statusText: (document.getElementById('crozzoPairingStatus') || {}).textContent || '',
  };
});
step('live-camera-started', liveUi.scanning && liveUi.hasVideo, 'visor en-app activo (getUserMedia)', liveUi);
step('video-playing', liveUi.videoPlaying, 'video reproduciéndose', { videoPlaying: liveUi.videoPlaying });
step('no-native-blackscreen', !liveUi.nativeScanActive, 'NO se activó el escáner nativo (sin pantalla negra)', {
  nativeScanActive: liveUi.nativeScanActive,
});

// Botón principal debe ser "Escanear con la cámara"
const btn = await page.evaluate(() => {
  const b = document.getElementById('crozzoPairingBtnLiveScan');
  return { text: b ? b.textContent.trim() : '', visible: b ? b.offsetParent !== null : false };
});
step('primary-button', /cámara/i.test(btn.text), 'botón principal usa la cámara de la app', btn);

// Detener y cerrar
await page.evaluate(() => {
  if (typeof window.crozzoPairingStopScan === 'function') window.crozzoPairingStopScan();
  if (typeof window.crozzoClosePairingModal === 'function') window.crozzoClosePairingModal();
});
await page.waitForTimeout(300);
const stopped = await page.evaluate(() => {
  const host = document.getElementById('crozzoPairingReaderHost');
  const video = host && host.querySelector('video');
  return { videoRemovedOrStopped: !video || !video.srcObject };
});
step('camera-stopped', stopped.videoRemovedOrStopped, 'cámara liberada al detener', stopped);

await browser.close();
server.close();
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
