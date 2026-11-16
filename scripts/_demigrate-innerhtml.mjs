#!/usr/bin/env node
/**
 * Des-migración: revierte CrozzoSanitize.sanitizeHtml(EXPR) → EXPR
 * Maneja paréntesis balanceados.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';

const root = process.argv.includes('--src') ? join(process.cwd(), 'src') : join(process.cwd(), 'app');
const apply = process.argv.includes('--apply');
let totalReverted = 0;
const filesChanged = [];

function findMatchingParen(s, start) {
  // start points at '('
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') { depth--; if (depth === 0) return i; }
    // skip strings
    if (s[i] === '"' || s[i] === "'" || s[i] === '`') {
      const q = s[i];
      i++;
      while (i < s.length && s[i] !== q) { if (s[i] === '\\') i++; i++; }
    }
  }
  return -1;
}

function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (e.name === 'bundles' || e.name === 'vendor') continue; walk(p); }
    else if (extname(e.name) === '.js' || extname(e.name) === '.html') {
      let content = readFileSync(p, 'utf8');
      let changed = false;
      let result = '';
      let i = 0;
      while (i < content.length) {
        const idx = content.indexOf('CrozzoSanitize.sanitizeHtml(', i);
        if (idx === -1) { result += content.slice(i); break; }
        result += content.slice(i, idx);
        const parenStart = idx + 'CrozzoSanitize.sanitizeHtml'.length;
        const closeIdx = findMatchingParen(content, parenStart);
        if (closeIdx === -1) { result += content.slice(idx); break; }
        const expr = content.slice(parenStart + 1, closeIdx);
        result += expr;
        totalReverted++;
        changed = true;
        i = closeIdx + 1;
      }
      if (changed) {
        if (apply) writeFileSync(p, result, 'utf8');
        filesChanged.push(relative(process.cwd(), p));
      }
    }
  }
}
walk(root);

console.log('Des-migración innerHTML' + (apply ? ' (APLICADA)' : ' (DRY-RUN)'));
console.log('Total revertidos:', totalReverted);
console.log('Archivos afectados:', filesChanged.length);
if (!apply) console.log('\nEjecutar con --apply para aplicar.');
process.exit(0);
