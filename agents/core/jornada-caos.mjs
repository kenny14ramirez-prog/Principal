export class JornadaCaos {
  constructor(config, caosConfig) {
    this.config = config;
    this.caosConfig = caosConfig;
  }
  async run() {
    console.log('[JornadaCaos] Iniciando jornada de caos...');
    const { spawnSync } = await import('node:child_process');
    const path = await import('node:path');
    const root = path.join(process.cwd());
    const script = path.join(root, 'scripts', 'qa-agente-profundo.mjs');
    const r = spawnSync(process.execPath, [script], {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, QA_PRESET: 'caos', QA_AGENTS: (this.caosConfig.agents || []).join(','), QA_CHAOS: '1' },
      timeout: (this.caosConfig.durationMin || 30) * 60 * 1000 + 60000,
    });
    if (r.status !== 0) process.exitCode = r.status || 1;
  }
}