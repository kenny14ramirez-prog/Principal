/**
 * Auditoría emparejamiento QR — estático + roundtrip BOF + API lector.
 * node scripts/_pairing-qr-audit.mjs
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'scripts', '_qa-out');
mkdirSync(outDir, { recursive: true });
const out = { ok: true, checks: [], failures: [] };

function pass(id, detail) {
  out.checks.push({ id, ok: true, detail });
}
function fail(id, detail) {
  out.ok = false;
  out.failures.push({ id, detail });
  out.checks.push({ id, ok: false, detail });
}

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

function runInVm(code, ctx, label) {
  const sandbox = Object.assign({ console, setTimeout, clearTimeout, TextEncoder, TextDecoder, atob, btoa }, ctx);
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(code, sandbox, { filename: label, timeout: 15000 });
  return sandbox;
}

const required = [
  'app/core/CrozzoPairingSeal.js',
  'app/modules/CrozzoPairingQrReader.js',
  'app/vendor/CrozzoJsQR.js',
  'app/vendor/CrozzoQRCode.js',
];
for (const f of required) {
  if (existsSync(join(root, f))) pass('file:' + f, 'presente');
  else fail('file:' + f, 'ausente');
}

const completo = read('app/Crozzo_POS_Completo.html');
const jsIdx = completo.indexOf('CrozzoJsQR.js');
const sealIdx = completo.indexOf('CrozzoPairingSeal.js');
const readerIdx = completo.indexOf('CrozzoPairingQrReader.js');
const posIdx = completo.indexOf('CrozzoPosMain.js');
if (jsIdx > 0 && sealIdx > jsIdx && readerIdx > sealIdx && posIdx > readerIdx) {
  pass('html-order', 'jsQR → Seal → Reader → PosMain');
} else {
  fail('html-order', 'orden incorrecto en Crozzo_POS_Completo.html');
}
if (completo.includes('CrozzoJsQR.js" defer')) {
  fail('html-defer-jsqr', 'jsQR no debe cargarse con defer');
} else {
  pass('html-defer-jsqr', 'jsQR sin defer');
}

const posMain = read('app/core/CrozzoPosMain.js');
if (posMain.includes('crozzoPairingMountScanQr') && posMain.includes('buildFastQrText')) {
  pass('emitter-single-qr', 'caja usa QR único BOF');
} else {
  fail('emitter-single-qr', 'falta crozzoPairingMountScanQr o buildFastQrText');
}
if (posMain.includes('CrozzoPairingQrReader') && posMain.includes('reader.readFile')) {
  pass('reader-delegate', 'decode delega en CrozzoPairingQrReader');
} else {
  fail('reader-delegate', 'crozzoPairingDecodeFile no usa reader dedicado');
}

try {
  const sealCode = read('app/core/CrozzoPairingSeal.js');
  const sealCtx = runInVm(sealCode, { crypto: globalThis.crypto }, 'CrozzoPairingSeal.js');
  const seal = sealCtx.CrozzoPairingSeal;
  const payload = {
    type: 'CROZZO_CLOUD_PAIRING',
    version: 4,
    target_profile: 'tablet',
    lan: { central_ip: '192.168.1.50', port: 3000, lan_sync_enabled: true, role: 'B' },
    location_id: 'loc-test',
    network_primary: { ssid_note: 'WiFi test' },
    timestamp: Date.now(),
  };
  const fast = seal.buildFastQrText(payload);
  if (!fast || fast.indexOf('BOF.') !== 0) fail('bof-build', 'buildFastQrText no devuelve BOF.');
  else pass('bof-build', 'BOF generado (' + fast.length + ' chars)');

  const parsed = seal.parseFastQr(fast);
  if (!parsed || parsed.lan?.central_ip !== '192.168.1.50') fail('bof-parse', 'parseFastQr no expande payload');
  else pass('bof-parse', 'IP=' + parsed.lan.central_ip + ' puerto=' + parsed.lan.port);

  const unsealed = await seal.unsealFromQr(fast);
  if (unsealed && unsealed.type === 'CROZZO_CLOUD_PAIRING') pass('bof-unseal', 'unsealFromQr acepta BOF');
  else fail('bof-unseal', 'unsealFromQr falló con BOF');
} catch (e) {
  fail('seal-vm', String(e.message || e));
}

try {
  const readerCode = read('app/modules/CrozzoPairingQrReader.js');
  const readerCtx = runInVm(readerCode, {}, 'CrozzoPairingQrReader.js');
  const api = readerCtx.CrozzoPairingQrReader;
  const needed = ['ensureReady', 'readFile', 'readCanvas', 'startLive', 'stopLive', 'preferNativeCamera'];
  const missing = needed.filter((k) => typeof api[k] !== 'function');
  if (missing.length) fail('reader-api', 'faltan: ' + missing.join(', '));
  else pass('reader-api', needed.join(', '));
} catch (e2) {
  fail('reader-vm', String(e2.message || e2));
}

writeFileSync(join(outDir, 'pairing-qr-audit.json'), JSON.stringify(out, null, 2), 'utf8');
console.log(JSON.stringify(out, null, 2));
process.exit(out.ok ? 0 : 1);
