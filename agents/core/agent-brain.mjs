/**
 * Agent Brain - Memoria, experiencia, curva novato->experto
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class AgentBrain {
  constructor(agentId, role) {
    this.agentId = agentId;
    this.role = role;
    this.memoryPath = path.join(__dirname, '..', 'runs', agentId, 'memory.json');
    this.memory = this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.memoryPath)) {
        return JSON.parse(fs.readFileSync(this.memoryPath, 'utf8'));
      }
    } catch(e) {}
    return {
      agentId: this.agentId,
      role: this.role,
      level: 0, // 0-4
      levelName: 'NOVATO',
      executions: 0,
      knownRoutes: [],
      brokenSelectors: [],
      successfulFlows: [],
      frictionLog: [],
      errorsSeen: [],
      timeStats: {},
      mistakes: [],
      selectorsOk: [],
      flowsLearned: [],
      sop: [],
      createdAt: new Date().toISOString()
    };
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.memoryPath), { recursive: true });
      this.memory.updatedAt = new Date().toISOString();
      fs.writeFileSync(this.memoryPath, JSON.stringify(this.memory, null, 2));
    } catch(e) {}
  }

  updateLevel() {
    const e = this.memory.executions;
    if (e >= 40) { this.memory.level = 4; this.memory.levelName = 'VETERANO'; }
    else if (e >= 16) { this.memory.level = 3; this.memory.levelName = 'EXPERTO'; }
    else if (e >= 8) { this.memory.level = 2; this.memory.levelName = 'COMPETENTE'; }
    else if (e >= 3) { this.memory.level = 1; this.memory.levelName = 'APRENDIZ'; }
    else { this.memory.level = 0; this.memory.levelName = 'NOVATO'; }
  }

  getExperience() {
    return {
      level: this.memory.level,
      levelName: this.memory.levelName,
      executions: this.memory.executions,
      knownRoutes: this.memory.knownRoutes.length,
      brokenSelectors: this.memory.brokenSelectors.length
    };
  }

  learn(flow, success, friction = [], errors = []) {
    this.memory.executions++;
    if (success) {
      if (!this.memory.successfulFlows.includes(flow)) {
        this.memory.successfulFlows.push(flow);
        this.memory.flowsLearned.push({ flow, learnedAt: new Date().toISOString(), level: this.memory.levelName });
      }
    }
    friction.forEach(f => this.memory.frictionLog.push({ f, at: new Date().toISOString(), level: this.memory.levelName }));
    errors.forEach(err => this.memory.errorsSeen.push({ err, at: new Date().toISOString() }));
    this.updateLevel();
    this.save();
  }

  shouldTrySelector(sel) {
    return !this.memory.brokenSelectors.includes(sel);
  }

  markBroken(sel) {
    if (!this.memory.brokenSelectors.includes(sel)) {
      this.memory.brokenSelectors.push(sel);
      this.save();
    }
  }

  markOk(sel) {
    if (!this.memory.selectorsOk.includes(sel)) {
      this.memory.selectorsOk.push(sel);
      this.save();
    }
  }
}
