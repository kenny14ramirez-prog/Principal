export class JornadaSimulator {
  constructor(config, jornadaConfig) {
    this.config = config;
    this.jornadaConfig = jornadaConfig;
  }
  async run() {
    console.log('[JornadaSimulator] Iniciando jornada real...');
    const { spawnSync } = await import('node:child_process');
    const path = await import('node:path');
    const root = path.join(process.cwd());
    const script = path.join(root, 'scripts', 'qa-agente-profundo.mjs');
    const r = spawnSync(process.execPath, [script], {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, QA_PRESET: 'real', QA_AGENTS: (this.jornadaConfig.agents || []).join(',') },
      timeout: (this.jornadaConfig.durationMin || 60) * 60 * 1000 + 60000,
    });
    if (r.status !== 0) process.exitCode = r.status || 1;
  }
}