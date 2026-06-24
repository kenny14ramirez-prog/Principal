#!/usr/bin/env node
/**
 * Despliega la pagina web del QR de clientes en Supabase (funcion crm-registro-cliente).
 * Uso: node scripts/deploy-crm-registro-fn.mjs [project-ref]
 */
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ref = process.argv[2] || process.env.SUPABASE_PROJECT_REF || 'usookdisddnqsahtepce';

console.log('[deploy-crm-registro] Generando plantilla HTML embebida…');
spawnSync('node', ['scripts/gen-crm-registro-template.mjs'], { cwd: root, stdio: 'inherit' });

console.log('[deploy-crm-registro] Desplegando funcion crm-registro-cliente →', ref);
const r = spawnSync(
  'npx',
  ['supabase', 'functions', 'deploy', 'crm-registro-cliente', '--no-verify-jwt', '--project-ref', ref],
  { cwd: root, stdio: 'inherit', shell: true }
);

if (r.status !== 0) {
  console.error('\n[deploy-crm-registro] Fallo. Ejecute antes: npx supabase login');
  process.exit(r.status || 1);
}

const testUrl = `https://${ref}.supabase.co/functions/v1/crm-registro-cliente?t=probe&bid=default&b=Prueba`;
console.log('\n[deploy-crm-registro] OK. Pruebe en el celular (debe verse formulario azul):');
console.log(testUrl);
