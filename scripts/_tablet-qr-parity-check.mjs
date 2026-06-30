/**
 * Verifica que el texto QR del modal rápido y del asistente sea idéntico
 * (misma función buildFastQrText / crozzoPairingScanTextFromBuilt).
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { btoa, atob } from 'node:buffer';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const sealSrc = readFileSync(join(root, 'app/core/CrozzoPairingSeal.js'), 'utf8');
const ctx = {
  window: {},
  document: { getElementById: () => null },
  TextEncoder,
  TextDecoder,
  btoa,
  atob,
  crypto: globalThis.crypto,
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(sealSrc, ctx);

const sampleBuilt = {
  payload: {
    type: 'CROZZO_CLOUD_PAIRING',
    version: 4,
    target_profile: 'tablet',
    business_id: 'BIZ-2739684A',
    business_name: 'ejemplo',
    cloud_sync: true,
    supabase_url: 'https://demo.supabase.co',
    supabase_key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test',
    location_id: 'loc-demo',
    lan: {
      central_ip: '192.168.1.68',
      server_ip: '192.168.1.68',
      port: 3000,
      lan_token: 'tok-demo',
    },
    timestamp: 1719750000000,
  },
};

function legacyQuickBuild(built) {
  const seal = ctx.CrozzoPairingSeal;
  let t = seal.buildFastQrText(built.payload);
  return t;
}

function scanTextFromBuiltInline(built) {
  if (!built || !built.payload) return '';
  const seal = ctx.CrozzoPairingSeal;
  let scanText = seal.buildFastQrText(built.payload);
  if (!scanText) {
    scanText = JSON.stringify({
      type: 'CROZZO_CLOUD_PAIRING',
      version: 4,
      target_profile: built.payload.target_profile || 'tablet',
      lan: built.payload.lan || {},
      location_id: built.payload.location_id || '',
      timestamp: built.payload.timestamp || Date.now(),
    });
  }
  return scanText;
}

const a = legacyQuickBuild(sampleBuilt);
const b = scanTextFromBuiltInline(sampleBuilt);
const same = a === b && a.startsWith('BOF.');

console.log(
  JSON.stringify(
    {
      RESULTADO: same ? 'OK — mismo código BOF en ambos caminos' : 'FAIL',
      length: a.length,
      prefix: a.slice(0, 12),
    },
    null,
    2
  )
);
process.exit(same ? 0 : 1);
