/**
 * Verifica el OUTBOX durable de comandas: si el push a la nube falla varias
 * veces (red intermitente / 503 / JWT), la comanda NO se pierde; el outbox
 * reintenta con backoff hasta confirmar la escritura en la nube.
 *
 * Corre en Node puro (sin navegador): carga el módulo real en globalThis con
 * stubs mínimos y un __SUPABASE que falla N veces y luego confirma.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const file = join(root, 'app', 'modules', 'CrozzoComandasCloudSync.js');

// --- Stubs de entorno -----------------------------------------------------
const store = {};
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => {
    store[k] = String(v);
  },
  removeItem: (k) => {
    delete store[k];
  },
};
if (!globalThis.crypto || !globalThis.crypto.randomUUID) {
  globalThis.crypto = { randomUUID: () => 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => ((Math.random() * 16) | 0).toString(16)) };
}

globalThis.crozzoOnlineConfigReady = () => true;
globalThis.crozzoTierAllowsCloudSync = () => true;
globalThis.getMultiDeviceConfig = () => ({ businessId: 'biz-1', locationId: 'loc-1', deviceId: 'dev-A', role: 'A' });
globalThis.ensureCrozzoDeviceId = () => 'dev-A';
globalThis.crozzoCloudDeviceUuidForRest = () => '11111111-1111-4111-8111-111111111111';

const comanda = {
  id: 101,
  transaction_id: '22222222-2222-4222-8222-222222222222',
  areaId: 'COCINA',
  estado: 'pendiente',
  items: [{ id: 1, nombre: 'Hamburguesa', cantidad: 2, precio: 10000 }],
  tipoServicio: 'mesa',
  referencia: '5',
  createdAt: new Date().toISOString(),
  lastUpdateAt: new Date().toISOString(),
};
globalThis.comandas = [comanda];
globalThis.__crozzoEmergencyFindComandaById = (id) => globalThis.comandas.find((c) => c.id === id) || null;

let upsertAttempts = 0;
const FAIL_TIMES = 2; // falla 2 veces, confirma a la 3a
globalThis.__SUPABASE = {
  from() {
    return {
      upsert(body) {
        upsertAttempts++;
        if (upsertAttempts <= FAIL_TIMES) {
          return Promise.resolve({ error: { message: 'simulado 503 intento ' + upsertAttempts } });
        }
        globalThis.__lastUpsertBody = body;
        return Promise.resolve({ error: null });
      },
    };
  },
  channel() {
    return { on() { return this; }, subscribe() { return this; } };
  },
  removeChannel() {},
};

// --- Carga el módulo real en el contexto global ---------------------------
vm.runInThisContext(readFileSync(file, 'utf8'), { filename: file });

// --- Ejercicio: encola la comanda y espera la confirmación ----------------
console.log('Encolando comanda vía crozzoPushComandasCloudByIds...');
globalThis.crozzoPushComandasCloudByIds([101]);

const t0 = Date.now();
const TIMEOUT_MS = 25000;
function status() {
  return globalThis.crozzoComandaOutboxStatus();
}

await new Promise((resolve) => {
  const iv = setInterval(() => {
    const st = status();
    if (st.pending === 0 || Date.now() - t0 > TIMEOUT_MS) {
      clearInterval(iv);
      resolve();
    }
  }, 250);
});

const finalSt = status();
const elapsed = Date.now() - t0;
const ok = finalSt.pending === 0 && upsertAttempts === FAIL_TIMES + 1 && globalThis.__lastUpsertBody;

console.log(JSON.stringify({
  intentosUpsert: upsertAttempts,
  pendientesFinal: finalSt.pending,
  confirmadoEnNube: !!globalThis.__lastUpsertBody,
  statusNubeFila: globalThis.__lastUpsertBody ? globalThis.__lastUpsertBody.status : null,
  msHastaConfirmar: elapsed,
  RESULTADO: ok ? 'OK — comanda entregada pese a fallos transitorios' : 'FALLO — el outbox no garantizó la entrega',
}, null, 2));

process.exit(ok ? 0 : 1);
