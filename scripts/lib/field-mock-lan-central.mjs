/**
 * Caja LAN sintética (Rol A) para pruebas de campo en Node.
 * Paridad mínima con src-tauri/src/crozzo_lan_sync_server.rs:
 *   GET  /health /status /api/comandas /api/runtime
 *   POST /api/sync  (comanda, comanda_estado, runtime, lan_ops_pulse)
 */
import { createServer } from 'node:http';

const SEEN_TTL_MS = 6 * 60 * 60 * 1000;
const PENDING_MAX = 2000;

function nowIso() {
  return new Date().toISOString();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function actionKey(body) {
  if (!body || typeof body !== 'object') return '';
  return String(body.action_id || body.uuid || body.id || '').trim();
}

function parseJson(raw) {
  try {
    return JSON.parse(raw || '{}');
  } catch (_) {
    return null;
  }
}

export function createFieldMockLanCentral(opts = {}) {
  const host = opts.host || '127.0.0.1';
  const meta = {
    locationId: opts.locationId || 'SEDE-FIELD-TEST',
    deviceId: opts.deviceId || 'CAJA-MOCK-A',
    businessId: opts.businessId || 'BIZ-FIELD-TEST',
    cloudReachable: opts.cloudReachable !== false,
  };

  const state = {
    comandas: new Map(),
    runtime: null,
    runtimeSavedAt: '',
    seenActions: new Map(),
    pending: [],
    pulses: [],
    stats: {
      posts: 0,
      deduped: 0,
      comandasUpserted: 0,
      estados: 0,
      runtimes: 0,
      errors: 0,
    },
  };

  function pruneSeen() {
    const cutoff = Date.now() - SEEN_TTL_MS;
    for (const [k, at] of state.seenActions) {
      if (at < cutoff) state.seenActions.delete(k);
    }
  }

  function registerAction(key) {
    if (!key) return true;
    pruneSeen();
    if (state.seenActions.has(key)) {
      state.stats.deduped++;
      return false;
    }
    state.seenActions.set(key, Date.now());
    return true;
  }

  function upsertComanda(data) {
    if (!data || data.id == null) return false;
    const id = String(data.id);
    const prev = state.comandas.get(id) || {};
    const next = Object.assign({}, prev, data);
    if (data.estado === 'entregada') {
      state.comandas.delete(id);
    } else {
      state.comandas.set(id, next);
    }
    state.stats.comandasUpserted++;
    return true;
  }

  function applyEstado(data) {
    if (!data || data.id == null) return false;
    const id = String(data.id);
    const c = state.comandas.get(id);
    if (!c) return false;
    if (data.estado === 'entregada') {
      state.comandas.delete(id);
    } else {
      c.estado = data.estado;
      c.lastUpdateAt = data.lastUpdateAt || nowIso();
      state.comandas.set(id, c);
    }
    state.stats.estados++;
    return true;
  }

  function ingestSync(body) {
    state.stats.posts++;
    const key = actionKey(body);
    if (!registerAction(key)) {
      return { ok: true, duplicate: true };
    }
    const typ = String(body.type || '').toLowerCase();
    const data = body.data || body.payload || body;
    if (typ === 'comanda' || typ === 'comanda_new') {
      upsertComanda(data);
    } else if (typ === 'comanda_estado') {
      applyEstado(data);
    } else if (typ === 'runtime') {
      state.runtime = data;
      state.runtimeSavedAt = nowIso();
      state.stats.runtimes++;
    } else if (typ === 'lan_ops_pulse') {
      state.pulses.push({ at: Date.now(), kind: data.kind || body.kind, dev: data.dev || body.dev });
    } else if (data && data.id != null) {
      upsertComanda(data);
    }
    const entry = { id: key || `p-${Date.now()}`, receivedAt: nowIso(), endpoint: '/api/sync', payload: body };
    state.pending.push(entry);
    if (state.pending.length > PENDING_MAX) state.pending.splice(0, state.pending.length - PENDING_MAX);
    return { ok: true, duplicate: false };
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${host}`);
    const path = url.pathname;
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept, x-crozzo-lan-token, X-Crozzo-Lan-Token',
    };
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      res.end();
      return;
    }
    try {
      if (path === '/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
        res.end(JSON.stringify({ ok: true, role: 'A', mock: true }));
        return;
      }
      if (path === '/status' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
        res.end(
          JSON.stringify({
            ok: true,
            role: 'A',
            device_id: meta.deviceId,
            location_id: meta.locationId,
            business_id: meta.businessId,
            cloud_reachable: meta.cloudReachable,
            mock: true,
          })
        );
        return;
      }
      if (path === '/api/comandas' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
        res.end(
          JSON.stringify({
            ok: true,
            comandas: Array.from(state.comandas.values()),
          })
        );
        return;
      }
      if (path === '/api/runtime' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
        res.end(
          JSON.stringify({
            ok: true,
            payload: state.runtime,
            saved_at: state.runtimeSavedAt,
          })
        );
        return;
      }
      if (path === '/api/sync' && req.method === 'POST') {
        const raw = await readBody(req);
        const body = parseJson(raw);
        if (!body) {
          state.stats.errors++;
          res.writeHead(400, { 'Content-Type': 'application/json', ...cors });
          res.end(JSON.stringify({ ok: false, error: 'invalid_json' }));
          return;
        }
        const out = ingestSync(body);
        res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
        res.end(JSON.stringify(out));
        return;
      }
      res.writeHead(404, cors);
      res.end('');
    } catch (e) {
      state.stats.errors++;
      res.writeHead(500, { 'Content-Type': 'application/json', ...cors });
      res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
    }
  });

  function listen() {
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, host, () => {
        const addr = server.address();
        resolve({ host, port: addr.port, url: `http://${host}:${addr.port}` });
      });
    });
  }

  function close() {
    return new Promise((resolve) => server.close(() => resolve()));
  }

  function snapshot() {
    return {
      comandas: state.comandas.size,
      runtime: !!state.runtime,
      pending: state.pending.length,
      pulses: state.pulses.length,
      stats: Object.assign({}, state.stats),
    };
  }

  async function fetchComandas() {
    const addr = server.address();
    const res = await fetch(`http://${host}:${addr.port}/api/comandas`);
    return res.json();
  }

  return {
    server,
    listen,
    close,
    snapshot,
    fetchComandas,
    ingestSync,
    meta,
    _state: state,
  };
}
