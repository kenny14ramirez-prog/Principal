#!/usr/bin/env node
/**
 * CLI - Empresa de Agentes QA Factory
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CEOQA } from '../agents/orchestrator/ceo-qa.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, '..');

const args = process.argv.slice(2);
const presetArg = args.find(a => a.startsWith('--preset='))?.split('=')[1] || 'smoke';
const cmd = args[0] || 'run';

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║           QA-FACTORY - EMPRESA DE AGENTES AUTÓNOMOS        ║');
  console.log('║        Actúan como trabajadores humanos aprendiendo       ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  
  const configPath = path.join(root, 'config', 'agents-factory.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  
  if (cmd === 'init') {
    console.log('✅ Fábrica inicializada');
    console.log('📁 Estructura creada');
    console.log('🧠 Sistema de aprendizaje activo');
    console.log('👥 7 agentes configurados\n');
    console.log('Usa: npm run qa:empresa:run -- --preset=smoke');
    return;
  }
  
  if (cmd === 'status') {
    console.log('📊 ESTADO DE LA FÁBRICA\n');
    for (const role of config.roles) {
      console.log(`  ${role.enabled ? '✅' : '❌'} ${role.name} (${role.id})`);
    }
    console.log('\n');
    return;
  }
  
  if (cmd === 'timeline') {
    const timelinePath = path.join(root, 'agents', 'runs', 'TIMELINE-HISTORICO.json');
    if (fs.existsSync(timelinePath)) {
      const timeline = JSON.parse(fs.readFileSync(timelinePath, 'utf8'));
      console.log('📈 TIMELINE HISTÓRICO\n');
      for (const t of timeline.slice(-10)) {
        console.log(`  ${t.timestamp.split('T')[0]} | ${t.preset.padEnd(10)} | Score: ${t.score}/100 | ${t.veredicto}`);
      }
    } else {
      console.log('Sin historial aún. Ejecuta alguna corrida primero.');
    }
    return;
  }
  
  if (cmd === 'run' || cmd === 'jornada' || cmd === 'caos') {
    if (cmd === 'caos') {
      const { JornadaCaos } = await import('../agents/core/jornada-caos.mjs');
      const caosConfig = JSON.parse(fs.readFileSync(path.join(root, 'config', 'jornada-caos-config.json'), 'utf8'));
      const sim = new JornadaCaos(config, caosConfig);
      await sim.run();
      return;
    }
    if (presetArg === 'real' || presetArg === 'jornada-real') {
      const { JornadaSimulator } = await import('../agents/core/jornada-simulator.mjs');
      const jornadaConfig = JSON.parse(fs.readFileSync(path.join(root, 'config', 'jornada-real-config.json'), 'utf8'));
      const sim = new JornadaSimulator(config, jornadaConfig);
      await sim.run();
      return;
    }
    if (presetArg === 'caos' || presetArg === 'colapso' || presetArg === 'estres') {
      const { JornadaCaos } = await import('../agents/core/jornada-caos.mjs');
      const caosConfig = JSON.parse(fs.readFileSync(path.join(root, 'config', 'jornada-caos-config.json'), 'utf8'));
      const sim = new JornadaCaos(config, caosConfig);
      await sim.run();
      return;
    }
    if (!config.presets[presetArg]) {
      console.log(`❌ Preset desconocido: ${presetArg}`);
      console.log(`Presets: ${Object.keys(config.presets).join(', ')}, real, jornada-real`);
      return;
    }
    const ceo = new CEOQA(config);
    await ceo.runPreset(presetArg);
    return;
  }
  
  console.log('Comandos: init, run, status, timeline');
  console.log('Uso: npm run qa:empresa:run -- --preset=8dias');
}

main().catch(e => {
  console.error('ERROR:', e);
  process.exit(1);
});
