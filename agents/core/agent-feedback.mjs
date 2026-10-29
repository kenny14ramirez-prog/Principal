/**
 * AGENT FEEDBACK LOOP
 * Retroalimentación cruzada + mejora continua de agentes
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, '..', '..');

export class AgentFeedback {
  constructor() {
    this.sharedPath = path.join(root, 'agents', 'core', 'shared-knowledge.json');
    this.historyPath = path.join(root, 'agents', 'core', 'agent-evolution.json');
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.sharedPath)) {
        this.shared = JSON.parse(fs.readFileSync(this.sharedPath, 'utf8'));
      } else {
        this.shared = {
          createdAt: new Date().toISOString(),
          learnings: [],
          patterns: [],
          provenFixes: [],
          antiPatterns: [],
          hybridInsights: [],
          timerInsights: []
        };
        this.save();
      }
    } catch(e) {
      this.shared = { learnings: [], patterns: [], provenFixes: [], antiPatterns: [] };
    }

    try {
      if (fs.existsSync(this.historyPath)) {
        this.evolution = JSON.parse(fs.readFileSync(this.historyPath, 'utf8'));
      } else {
        this.evolution = { agents: {} };
        fs.writeFileSync(this.historyPath, JSON.stringify(this.evolution, null, 2));
      }
    } catch(e) {
      this.evolution = { agents: {} };
    }
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.sharedPath), { recursive: true });
      this.shared.updatedAt = new Date().toISOString();
      fs.writeFileSync(this.sharedPath, JSON.stringify(this.shared, null, 2));
    } catch(e) {}
  }

  contribute(agentId, finding) {
    const entry = {
      id: `LF-${Date.now()}-${Math.random().toString(36).substr(2,5)}`,
      agentId,
      timestamp: new Date().toISOString(),
      ...finding
    };
    this.shared.learnings.push(entry);
    
    if (finding.category === 'hybrid') this.shared.hybridInsights.push(entry);
    if (finding.category === 'timers') this.shared.timerInsights.push(entry);
    
    this.save();
    return entry;
  }

  getContextFor(agentId) {
    const recent = this.shared.learnings.slice(-30);
    const hybrid = this.shared.hybridInsights.slice(-15);
    const timers = this.shared.timerInsights.slice(-15);
    const evo = this.evolution.agents[agentId] || { score: 0, insights: [] };
    
    return {
      collectiveLearnings: recent,
      hybridKnowledge: hybrid,
      timerKnowledge: timers,
      agentEvolution: evo,
      instruction: 'Usa TODO esto. Sé más preciso que la iteración anterior. Prioriza hallazgos accionables con evidencia.'
    };
  }

  scoreAgent(agentId, metrics) {
    if (!this.evolution.agents[agentId]) {
      this.evolution.agents[agentId] = { score: 0, runs: 0, insights: [], strengths: [], weaknesses: [] };
    }
    const a = this.evolution.agents[agentId];
    a.runs++;
    a.lastRun = new Date().toISOString();
    
    // Scoring
    let delta = 0;
    if (metrics.actionable > 0) delta += metrics.actionable * 2;
    if (metrics.critical > 0) delta += metrics.critical * 5;
    if (metrics.falsePositives === 0) delta += 3;
    if (metrics.evidence > 0) delta += metrics.evidence;
    
    a.score += delta;
    a.lastMetrics = metrics;
    
    fs.writeFileSync(this.historyPath, JSON.stringify(this.evolution, null, 2));
    return a.score;
  }
}

export const feedback = new AgentFeedback();
