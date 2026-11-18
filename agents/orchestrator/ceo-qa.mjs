export class CEOQA {
  constructor(config) { this.config = config; }
  async runPreset(preset) {
    console.log(`[CEOQA] preset=${preset} — stub (sin agentes reales). Implementar jornada real para ejecutar.`);
    return { ok: true, preset, score: 0 };
  }
}