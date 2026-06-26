/**
 * Verifica el PULSO operativo (2ª vía de tiempo real) de CrozzoCloudOpsPulse.
 *
 * Simula dos equipos (A y B) compartiendo un canal broadcast en memoria. Cuando
 * A emite 'comanda'/'runtime', B debe disparar el pull correspondiente — sin
 * depender de postgres_changes. También valida que el eco propio se ignora.
 *
 * Corre en Node puro cargando el módulo real dos veces en dos contextos vm.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const file = join(root, 'app', 'modules', 'CrozzoCloudOpsPulse.js');
const code = readFileSync(file, 'utf8');

// Bus de broadcast compartido entre los "equipos" (emula Supabase Realtime broadcast).
const bus = { handlers: [] };

function makeDevice(deviceId) {
  const pulls = { comanda: 0, runtime: 0 };
  const sandbox = {};
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.console = console;
  sandbox.setTimeout = setTimeout;
  sandbox.clearTimeout = clearTimeout;
  sandbox.setInterval = setInterval;
  sandbox.clearInterval = clearInterval;
  sandbox.Date = Date;
  sandbox.crozzoOnlineConfigReady = () => true;
  sandbox.crozzoTierAllowsCloudSync = () => true;
  sandbox.getMultiDeviceConfig = () => ({ businessId: 'biz-1', locationId: 'loc-1', deviceId });
  sandbox.ensureCrozzoDeviceId = () => deviceId;
  sandbox.addEventListener = () => {};
  sandbox.BroadcastChannel = undefined;
  sandbox.document = { hidden: false };
  // Pulls que el módulo invoca al recibir un pulso:
  sandbox.crozzoPullComandasFromCloud = () => {
    pulls.comanda++;
    return Promise.resolve(true);
  };
  sandbox.crozzoPullPosRuntimeCloud = () => {
    pulls.runtime++;
    return Promise.resolve(true);
  };
  sandbox.crozzoHandleRemoteRuntimeUiSync = () => {};
  // __SUPABASE.channel(...) con broadcast compartido por el bus:
  sandbox.__SUPABASE = {
    channel() {
      const ch = {
        _evt: null,
        _cb: null,
        on(_type, opts, cb) {
          ch._evt = opts && opts.event;
          ch._cb = cb;
          return ch;
        },
        subscribe(cb) {
          bus.handlers.push({ ch, sandbox });
          if (cb) cb('SUBSCRIBED');
          return ch;
        },
        send(msg) {
          // Difunde a todos menos a quien lo envía (broadcast self:false).
          bus.handlers.forEach((h) => {
            if (h.sandbox === sandbox) return;
            if (h.ch._cb) h.ch._cb({ payload: msg.payload });
          });
          return Promise.resolve({});
        },
      };
      return ch;
    },
    removeChannel() {},
  };

  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: file });
  sandbox.CrozzoCloudOpsPulse.start();
  return { sandbox, pulls };
}

const A = makeDevice('dev-A');
const B = makeDevice('dev-B');

// A emite 'comanda' y 'runtime'; esperamos a que B haga pull de cada una.
A.sandbox.crozzoOpsPulseEmit('comanda');
A.sandbox.crozzoOpsPulseEmit('runtime');

await new Promise((r) => setTimeout(r, 900));

const ok =
  B.pulls.comanda >= 1 &&
  B.pulls.runtime >= 1 &&
  A.pulls.comanda === 0 && // A no debe hacer pull por su propio eco
  A.pulls.runtime === 0;

console.log(
  JSON.stringify(
    {
      B_recibio_comanda: B.pulls.comanda,
      B_recibio_runtime: B.pulls.runtime,
      A_eco_propio_comanda: A.pulls.comanda,
      A_eco_propio_runtime: A.pulls.runtime,
      A_pulso_vivo: A.sandbox.CrozzoCloudOpsPulse.status().live,
      RESULTADO: ok
        ? 'OK — el pulso entrega al instante por 2ª vía y no hay eco propio'
        : 'FALLO — el pulso no propagó correctamente',
    },
    null,
    2
  )
);

process.exit(ok ? 0 : 1);
