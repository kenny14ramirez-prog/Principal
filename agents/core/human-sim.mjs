/**
 * Human Simulation - Delays aleatorios, comportamiento humano
 */
export class HumanSim {
  constructor(experienceLevel = 0) {
    this.exp = experienceLevel;
  }

  async delay(min, max) {
    const baseMin = this.exp >= 3 ? min * 0.6 : this.exp >= 2 ? min * 0.8 : min;
    const baseMax = this.exp >= 3 ? max * 0.6 : this.exp >= 2 ? max * 0.8 : max;
    const ms = Math.floor(Math.random() * (baseMax - baseMin) + baseMin);
    return new Promise(r => setTimeout(r, ms));
  }

  async think() {
    await this.delay(500, 1500);
  }

  async hesitate() {
    if (this.exp < 2) await this.delay(800, 2000);
    else await this.delay(200, 600);
  }

  async typeHuman(locator) {
    await this.hesitate();
    // Simula tipeo humano
    await this.delay(100, 300);
  }

  async clickHuman(locator) {
    await this.hesitate();
    await this.delay(200, 500);
    try {
      await locator.click({ timeout: 5000 });
      return true;
    } catch(e) {
      return false;
    }
  }
}
