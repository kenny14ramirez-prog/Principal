#!/usr/bin/env node
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = path.join(root, 'docs', 'maps', 'CROZZO-CONNECTION-MAPS.html');
const pdfPath = path.join(root, 'docs', 'maps', 'CROZZO-CONNECTION-MAPS.pdf');

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('file:///' + htmlPath.replace(/\\/g, '/'), { waitUntil: 'networkidle' });
await page.pdf({
  path: pdfPath,
  format: 'A4',
  printBackground: true,
  margin: { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' },
});
await browser.close();

console.log('PDF generado:', pdfPath);
console.log('Tamaño:', (fs.statSync(pdfPath).size / 1024).toFixed(1), 'KB');