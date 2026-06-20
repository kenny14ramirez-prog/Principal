import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const pdfjsLib = require(join(dirname(fileURLToPath(import.meta.url)), '../../node_modules/pdfjs-dist/legacy/build/pdf.js'));

export async function extractStructuredPdfTextFromFile(filePath, maxPages = 3) {
  const bytes = readFileSync(filePath);
  const data = new Uint8Array(bytes);
  const pdf = await pdfjsLib.getDocument({ data, useSystemFonts: true, verbosity: 0, disableWorker: true }).promise;
  const pageNums = [];
  for (let p = 1; p <= Math.min(pdf.numPages, maxPages); p++) pageNums.push(p);

  const blocks = [];
  const fontCounts = {};
  let text = '';

  for (const pageNum of pageNums) {
    const page = await pdf.getPage(pageNum);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    let pageText = '';
    for (const it of tc.items || []) {
      const s = it.str || '';
      if (!s.trim()) continue;
      pageText += s + ' ';
      const fn = String(it.fontName || 'unknown')
        .replace(/\+/g, ' ')
        .replace(/[^a-zA-Z0-9 _-]/g, '')
        .trim();
      fontCounts[fn] = (fontCounts[fn] || 0) + 1;
      const tr = it.transform || [];
      blocks.push({
        text: s,
        font: fn,
        page: pageNum,
        h: it.height || 0,
        x: tr[4] || 0,
        y: tr[5] || 0,
        pageH: pageNum === 1 ? vp.height : 0,
      });
    }
    text += `\n--- p${pageNum} ---\n` + pageText;
    page.cleanup();
  }

  const compact = text.replace(/\s/g, '').length;
  await pdf.destroy();

  return {
    text,
    blocks,
    textLen: compact,
    blockCount: blocks.length,
    likelyScanned: compact < 80 && blocks.length < 6,
    fontStats: { counts: fontCounts, top: Object.keys(fontCounts).sort((a, b) => fontCounts[b] - fontCounts[a]).slice(0, 10) },
  };
}
