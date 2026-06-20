#!/usr/bin/env node
/**
 * Entrena perfil FE desde «facturas de pruebas» → app/data/fe-training-profile.json
 *
 * Uso:
 *   npm run train:recepcion-fe
 *   npm run train:recepcion-fe:full        # --full (3 páginas, todos los PDF)
 *   node scripts/train-recepcion-fe.mjs --quick   # 14 PDFs
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { extractStructuredPdfTextFromFile } from './lib/recepcion-fe-pdf.mjs';
import {
  classifyProbeResult,
  enrichFeProveedor,
  feSlugKey,
  nombresCoinciden,
  normNit,
  parseFeFromText,
  razonSocialFromFilename,
  supplierSlugFromFilename,
  tokensFromNombre,
} from './lib/recepcion-fe-parse.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const SAMPLES_DIR = join(ROOT, 'facturas de pruebas');
const OUT_PROFILE = join(ROOT, 'app', 'data', 'fe-training-profile.json');
const OUT_REPORT = join(ROOT, 'app', 'data', 'fe-training-report.json');

const args = new Set(process.argv.slice(2));
const quick = args.has('--quick');
const full = args.has('--full');

function listPdfs() {
  if (!existsSync(SAMPLES_DIR)) {
    console.error('[train] No existe carpeta:', SAMPLES_DIR);
    process.exit(1);
  }
  let files = readdirSync(SAMPLES_DIR)
    .filter((f) => /\.pdf$/i.test(f))
    .sort();
  if (quick) files = files.slice(0, 14);
  return files;
}

function ensureVendor(map, slug, expectedName) {
  if (!map.has(slug)) {
    map.set(slug, {
      slug,
      label: expectedName || slug.replace(/_/g, ' '),
      aliases: new Set(),
      nits: new Set(),
      tokens: new Set(tokensFromNombre(expectedName)),
      samples: 0,
      nombreOk: 0,
      nitOk: 0,
    });
  }
  return map.get(slug);
}

async function trainOne(fileName) {
  const path = join(SAMPLES_DIR, fileName);
  const expectedName = razonSocialFromFilename(fileName);
  const slug = supplierSlugFromFilename(fileName);
  const pack = await extractStructuredPdfTextFromFile(path, full ? 3 : 2);
  const fe0 = parseFeFromText(pack.text || '');
  const fe = enrichFeProveedor(fe0, pack, { nombreArchivo: fileName });
  const profile = classifyProbeResult(pack, fe);
  const nombreOk = nombresCoinciden(fe.razonSocial, expectedName);
  const nitOk = !!(fe.nitEmisor && String(fe.nitEmisor).replace(/\D/g, '').length >= 8);

  return {
    file: fileName,
    slug,
    expectedName,
    detectedName: fe.razonSocial || '',
    nitEmisor: fe.nitEmisor || '',
    nitReceptor: fe.nitReceptor || '',
    total: fe.total || 0,
    cufe: !!fe.cufe,
    textLen: pack.textLen,
    likelyScanned: pack.likelyScanned,
    profile,
    nombreOk,
    nitOk,
    explicitRs: !!fe._razonSocialExplicit,
  };
}

async function main() {
  const files = listPdfs();
  console.log('[train] Muestras:', files.length, 'desde', SAMPLES_DIR);

  const vendors = new Map();
  const summary = {};
  const rows = [];
  let nombreOkN = 0;
  let nitOkN = 0;
  let cufeN = 0;

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    process.stdout.write(`[train] ${i + 1}/${files.length} ${f}\r`);
    try {
      const row = await trainOne(f);
      rows.push(row);
      summary[row.profile] = (summary[row.profile] || 0) + 1;
      if (row.nombreOk) nombreOkN++;
      if (row.nitOk) nitOkN++;
      if (row.cufe) cufeN++;

      const v = ensureVendor(vendors, row.slug, row.expectedName);
      v.samples++;
      if (row.nombreOk) v.nombreOk++;
      if (row.nitOk) v.nitOk++;
      if (row.nombreOk && row.detectedName) v.aliases.add(row.detectedName);
      if (row.expectedName) {
        v.aliases.add(row.expectedName.toUpperCase());
        v.label = row.expectedName;
      }
      if (row.nitOk && row.nitEmisor) v.nits.add(normNit(row.nitEmisor));
      tokensFromNombre(row.expectedName).forEach((t) => v.tokens.add(t));
      if (row.nombreOk) tokensFromNombre(row.detectedName).forEach((t) => v.tokens.add(t));
    } catch (err) {
      rows.push({ file: f, error: String(err.message || err), profile: 'error' });
      summary.error = (summary.error || 0) + 1;
    }
  }

  console.log('\n[train] Agregando proveedores...');
  const vendorList = [...vendors.values()]
    .map((v) => ({
      slug: v.slug,
      label: v.label,
      aliases: [...v.aliases].filter(Boolean).slice(0, 12),
      nits: [...v.nits].filter(Boolean).slice(0, 6),
      tokens: [...v.tokens].filter(Boolean).slice(0, 10),
      samples: v.samples,
      nombreOkPct: v.samples ? Math.round((v.nombreOk / v.samples) * 100) : 0,
      nitOkPct: v.samples ? Math.round((v.nitOk / v.samples) * 100) : 0,
    }))
    .sort((a, b) => b.samples - a.samples);

  const sampleSize = files.length;
  const okFePct = sampleSize ? Math.round((cufeN / sampleSize) * 1000) / 10 : 0;
  const probeNombrePct = sampleSize ? Math.round((nombreOkN / sampleSize) * 1000) / 10 : 0;
  const probeNitPct = sampleSize ? Math.round((nitOkN / sampleSize) * 1000) / 10 : 0;
  const scannedFail = summary['escaneada-sin-texto'] || 0;
  const scannedFailPct = sampleSize ? Math.round((scannedFail / sampleSize) * 100) : 0;
  const trainedAt = new Date().toISOString().slice(0, 10);

  const profile = {
    version: 4,
    trainedAt,
    sampleSize,
    sourceDir: 'facturas de pruebas',
    okFePct,
    okQrPct: summary['fe-qr'] ? Math.round(((summary['fe-qr'] || 0) / sampleSize) * 1000) / 10 : 0,
    scannedFailPct,
    probeNombrePct,
    probeNitPct,
    summary,
    vendors: vendorList,
    hint:
      'Entrenamiento ' +
      sampleSize +
      ' facturas (' +
      trainedAt +
      '): proveedor ~' +
      probeNombrePct +
      '% · NIT ~' +
      probeNitPct +
      '%. Perfil usado en auto-detección.',
    recommendations: [
      'Re-entrenar tras nuevas facturas: npm run train:recepcion-fe',
      'Evaluación rápida: npm run maintain:recepcion-fe:eval',
      'PDF escaneado: marque QR o use cámara; el perfil no sustituye OCR.',
      'Nombres de archivo YYYY-MM-DD_PROVEEDOR_hash.pdf mejoran el fallback.',
    ],
  };

  const failures = rows
    .filter((r) => !r.error && (!r.nombreOk || !r.nitOk))
    .map((r) => ({
      file: r.file,
      expected: r.expectedName,
      detected: r.detectedName,
      nit: r.nitEmisor,
      profile: r.profile,
      nombreOk: r.nombreOk,
      nitOk: r.nitOk,
    }));

  mkdirSync(join(ROOT, 'app', 'data'), { recursive: true });
  writeFileSync(OUT_PROFILE, JSON.stringify(profile, null, 2) + '\n', 'utf8');
  writeFileSync(
    OUT_REPORT,
    JSON.stringify({ trainedAt, rows, failures, vendorList }, null, 2) + '\n',
    'utf8'
  );

  console.log('[train] Perfil →', OUT_PROFILE);
  console.log('[train] Reporte →', OUT_REPORT);
  console.log('[train] Proveedor OK:', probeNombrePct + '%', '| NIT OK:', probeNitPct + '%', '| CUFE:', okFePct + '%');
  console.log('[train] Fallos nombre/NIT:', failures.length);
  if (failures.length) {
    failures.slice(0, 8).forEach((f) => {
      console.log('  -', f.file, '→', f.detected || '(vacío)', '| esperado:', f.expected);
    });
  }
}

main().catch((err) => {
  console.error('[train] Error fatal:', err);
  process.exit(1);
});
