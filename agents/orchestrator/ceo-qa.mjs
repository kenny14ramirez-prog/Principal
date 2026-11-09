import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const root = path.join(path.dirname(__filename), '..', '..');

export class CEOQA {
  constructor(config) {
    this.config = config;
    this.root = root;
  }

  async runPreset(presetArg) {
    const preset = this.config.presets?.[presetArg];
    if (!preset) throw new Error(`Preset desconocido: ${presetArg}`);
    console.log(`[CEOQA] Ejecutando preset "${presetArg}" (${preset.durationMin} min) con agentes: ${preset.agents.join(', ')}`);

    const script = path.join(this.root, 'scripts', 'qa-agente-profundo.mjs');
    const r = spawnSync(process.execPath, [script], {
      cwd: this.root,
      stdio: 'inherit',
      env: { ...process.env, QA_PRESET: presetArg, QA_AGENTS: preset.agents.join(',') },
      timeout: preset.durationMin * 60 * 1000 + 60000,
    });
    if (r.status !== 0) {
      console.error(`[CEOQA] Falló con código ${r.status}`);
      process.exitCode = r.status || 1;
    } else {
      console.log('[CEOQA] Preset completado.');
    }
  }
}