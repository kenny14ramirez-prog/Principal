#!/usr/bin/env node
// Verifica que SYNC-INVARIANTS.md exista y tenga al menos N invariantes.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const invPath = path.join(root, 'docs/maps/SYNC-INVARIANTS.md');
if (!fs.existsSync(invPath)) {
  console.error('FAIL: SYNC-INVARIANTS.md no existe');
  process.exit(1);
}
const content = fs.readFileSync(invPath, 'utf8');
// Contar líneas que empiezan con número. patrón "1. " o "1) "
const matches = content.match(/^\d+[\.\)]\s+/gm) || [];
const count = matches.length;
const min = 8;
if (count < min) {
  console.error(`FAIL: solo ${count} invariantes (mínimo ${min})`);
  process.exit(1);
}
console.log(`PASS: ${count} invariantes documentados (mínimo ${min})`);

// Verificar que cada invariante mencione archivos/símbodos (heurística: al menos 1 backtick por invariante)
const backticks = (content.match(/`[^`]+`/g) || []).length;
console.log(`  Referencias a código (backticks): ${backticks}`);
if (backticks < count) {
  console.warn('WARN: algunos invariantes no referencian código (backticks < invariantes)');
}
process.exit(0);
