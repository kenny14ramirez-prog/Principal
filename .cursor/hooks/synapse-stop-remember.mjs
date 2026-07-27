#!/usr/bin/env node
/**
 * Cursor stop — Fase A Synapse:
 * 1) Snapshot automático corto de archivos editados en app/ (sin inventar lecciones).
 * 2) Si hubo preCompact pendiente y loop_count===0 → followup para que el agente guarde bien.
 * Fail-open: errores de Synapse no rompen el stop.
 */
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const STATE = join(root, '.cursor', 'session-state.json');
const PENDING = join(root, '.cursor', 'synapse-pending-save.json');
const SNAP_STAMP = join(root, '.cursor', 'synapse-session-snap.stamp');

function readStdinSync() {
  try {
    const raw = readFileSync(0, 'utf8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

function loadJson(path, fallback) {
  try {
    let raw = readFileSync(path, 'utf8');
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

function runSynapseRemember(pathCat, title, content) {
  const node = process.execPath;
  const script = join(root, 'scripts', 'synapse-mind.mjs');
  const r = spawnSync(
    node,
    [script, 'remember', '--path', pathCat, '--title', title, '--content', content],
    {
      cwd: root,
      encoding: 'utf8',
      timeout: 90000,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    }
  );
  return r.status === 0;
}

const payload = readStdinSync();
const status = String(payload.status || 'completed');
const loopCount = Number(payload.loop_count ?? payload.loopCount ?? 0) || 0;

if (status !== 'completed') {
  process.stdout.write('{}');
  process.exit(0);
}

const state = loadJson(STATE, { editedApp: [], files: [], editedSync: false });
const editedApp = Array.isArray(state.editedApp) ? state.editedApp : [];
const pending = existsSync(PENDING) ? loadJson(PENDING, null) : null;

let snapped = false;
try {
  if (editedApp.length > 0) {
    let lastSnap = '';
    try {
      lastSnap = readFileSync(SNAP_STAMP, 'utf8').trim();
    } catch (_) {}
    const sig = editedApp.slice().sort().join('|');
    if (sig !== lastSnap) {
      const content =
        'Snapshot de sesión (auto). Archivos editados en app/: ' +
        editedApp.join(', ') +
        '. Revisar diff y guardar lección accionable si hubo fix/decisión (no duplicar KNOWN-ISSUES).';
      snapped = runSynapseRemember(
        'crozzo/sessions',
        'Sesión ' + new Date().toISOString().slice(0, 16),
        content
      );
      if (snapped) {
        mkdirSync(join(root, '.cursor'), { recursive: true });
        writeFileSync(SNAP_STAMP, sig, 'utf8');
      }
    }
  }
} catch (_) {}

const out = {};

// Solo un followup automático tras compactación (evita loops molestos en cada stop).
if (pending && loopCount === 0) {
  const files =
    (Array.isArray(pending.editedApp) && pending.editedApp.length
      ? pending.editedApp
      : editedApp
    ).slice(0, 10);
  out.followup_message =
    'El contexto se compactó. Guarda YA en Synapse (store_memory o npm run synapse:remember) ' +
    '1–3 lecciones cortas: causa raíz + fix + qué no repetir. Paths: crozzo/sync|crm|css|caja|preferencias. ' +
    (files.length ? 'Archivos tocados: ' + files.join(', ') + '. ' : '') +
    (snapped ? 'Ya hay snapshot automático en crozzo/sessions; complementa con la lección real. ' : '') +
    'No pegues código largo. Luego continúa solo si el usuario pidió más trabajo.';
  try {
    unlinkSync(PENDING);
  } catch (_) {}
}

process.stdout.write(JSON.stringify(out));
process.exit(0);
