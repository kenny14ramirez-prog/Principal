#!/usr/bin/env node
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const mdPath = path.join(root, 'docs', 'maps', 'CONNECTIVITY-CONTINGENCY-REPORT.md');
const pdfPath = path.join(root, 'docs', 'maps', 'CONNECTIVITY-CONTINGENCY-REPORT.pdf');
const md = fs.readFileSync(mdPath, 'utf8');

const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Connectivity Contingency Report</title>
<style>
  @page { size: A4; margin: 16mm; }
  body { font-family: 'Consolas', 'Courier New', monospace; font-size: 9pt; line-height: 1.35; color: #1a1a1a; }
  pre { white-space: pre-wrap; word-wrap: break-word; margin: 0; }
</style></head><body><pre>${md.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'domcontentloaded' });
await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, margin: { top:'15mm', bottom:'15mm', left:'15mm', right:'15mm' } });
await browser.close();
console.log('PDF:', pdfPath, (fs.statSync(pdfPath).size/1024).toFixed(1), 'KB');