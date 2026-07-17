/**
 * Patch CrozzoAdquirienteLookup: contrastMergeSources + parallel RUES/Scrapling.
 */
import fs from 'fs';

const p = 'app/modules/CrozzoAdquirienteLookup.js';
let s = fs.readFileSync(p, 'utf8');

const marker = '  function lookupRemoteAll(doc) {';
if (!s.includes(marker)) {
  console.error('marker lookupRemoteAll missing');
  process.exit(1);
}

if (!s.includes('function contrastMergeSources(')) {
  const helpers = `
  function sourceRank(src) {
    src = String(src || '');
    if (src.indexOf('dian') === 0 || src === 'dian_supabase' || src === 'dian_tauri' || src === 'dian_demo') return 40;
    if (src === 'crm_local' || src === 'cache') return 35;
    if (src === 'rues_opendata' || src === 'rues_enrich') return 20;
    if (src === 'scrapling_enrich') return 15;
    return 10;
  }

  function fieldPreferRank(field, src) {
    src = String(src || '');
    var dian = src.indexOf('dian') === 0 || src === 'dian_supabase' || src === 'dian_tauri' || src === 'dian_demo';
    var rues = src === 'rues_opendata' || src === 'rues_enrich';
    var scrap = src === 'scrapling_enrich';
    if (field === 'nombre' || field === 'email') {
      if (dian) return 50;
      if (src === 'crm_local') return 45;
      if (rues) return 20;
      if (scrap) return 15;
      return 10;
    }
    if (field === 'telefono' || field === 'direccion') {
      if (scrap) return 45;
      if (rues) return 40;
      if (dian) return 20;
      return 10;
    }
    if (field === 'ciudad') {
      if (rues) return 45;
      if (scrap) return 35;
      if (dian) return 20;
      return 10;
    }
    return sourceRank(src);
  }

  /** Contrasta varias fuentes: llena vacíos y anota de dónde salió cada campo. */
  function contrastMergeSources(parts) {
    var fields = ['nombre', 'email', 'telefono', 'ciudad', 'direccion'];
    var merged = {
      nombre: '',
      email: '',
      telefono: '',
      ciudad: '',
      direccion: '',
      source: '',
      _fieldSources: {},
      _contrast: '',
    };
    var bestSrc = '';
    var bestRank = -1;
    var conflicts = [];
    (parts || []).forEach(function (part) {
      if (!part || !part.data) return;
      var d = part.data;
      var src = part.source || d.source || 'internet';
      var label = part.label || sourceLabel(src) || src;
      var r = sourceRank(src);
      if (r > bestRank) {
        bestRank = r;
        bestSrc = src;
      }
      fields.forEach(function (f) {
        var val = String(d[f] || '').trim();
        if (!val) return;
        var cur = String(merged[f] || '').trim();
        var fr = fieldPreferRank(f, src);
        var curSrc = merged._fieldSources[f] || '';
        var curFr = curSrc ? fieldPreferRank(f, curSrc) : -1;
        if (!cur) {
          merged[f] = val;
          merged._fieldSources[f] = src;
          return;
        }
        if (fr > curFr) {
          if (f === 'nombre' && cur.toLowerCase() !== val.toLowerCase()) {
            conflicts.push(f + ': ' + (sourceLabel(curSrc) || curSrc) + ' vs ' + label);
          }
          merged[f] = val;
          merged._fieldSources[f] = src;
        } else if (fr === curFr && cur.toLowerCase() !== val.toLowerCase() && f === 'nombre') {
          conflicts.push(f + ': ' + (sourceLabel(curSrc) || curSrc) + ' vs ' + label);
        }
      });
    });
    merged.source = bestSrc || (parts[0] && parts[0].source) || '';
    var bits = [];
    var by = {};
    Object.keys(merged._fieldSources).forEach(function (f) {
      var src = merged._fieldSources[f];
      var lab = sourceLabel(src) || src;
      if (!by[lab]) by[lab] = [];
      by[lab].push(f);
    });
    Object.keys(by).forEach(function (lab) {
      bits.push(lab + '·' + by[lab].join('+'));
    });
    if (conflicts.length) bits.push('revisar nombre');
    merged._contrast = bits.join(' · ');
    merged._conflicts = conflicts;
    return annotateRuesContactFields(merged);
  }

`;
  s = s.replace(marker, helpers + marker);
  console.log('inserted contrast helpers');
} else {
  console.log('contrast helpers already present');
}

const oldMerge =
  /var primary = dian \|\| sb \|\| rues;[\s\S]*?return annotateRuesContactFields\(merged\);/;
if (!oldMerge.test(s)) {
  if (s.includes('contrastMergeSources(parts)')) {
    console.log('lookupRemoteAll already contrast-merged');
  } else {
    console.error('old merge missing');
    process.exit(1);
  }
} else {
  s = s.replace(
    oldMerge,
    `var parts = [];
      if (dian) parts.push({ label: 'DIAN', source: dian.source || 'dian_tauri', data: dian });
      if (sb) parts.push({ label: 'nube', source: sb.source || 'dian_supabase', data: sb });
      if (rues) parts.push({ label: 'RUES', source: rues.source || 'rues_opendata', data: rues });
      if (!parts.length) return null;
      return contrastMergeSources(parts);`
  );
  console.log('replaced lookupRemoteAll merge');
}

const oldSched =
  /function scheduleEnrichment\(doc, data, profileKey\) \{[\s\S]*?enrichFromRuesOpendata\(doc\)[\s\S]*?\.then\(function \(\) \{\s*delete enrichInflight\[key\];\s*\}\);[\s\S]*?\n  \}/;
if (!oldSched.test(s)) {
  if (s.includes('DIAN (base) + RUES + Scrapling')) {
    console.log('scheduleEnrichment already parallel');
  } else {
    console.error('scheduleEnrichment block missing');
    process.exit(1);
  }
} else {
  s = s.replace(
    oldSched,
    `function scheduleEnrichment(doc, data, profileKey) {
    if (!doc || !doc.number) return;
    if (!needsContactEnrichment(data)) return;
    var key = normDocKey(doc);
    if (enrichInflight[key]) return;
    enrichInflight[key] = true;
    setEnrichUi(profileKey, 'busy');
    var base = Object.assign({}, data || {});
    // Base (DIAN/RUES rápido) + RUES detalle + Scrapling/sidecar en paralelo; luego contrastan.
    Promise.all([
      enrichFromRuesOpendata(doc).catch(function () {
        return null;
      }),
      enrichFromSidecar(doc, base).catch(function () {
        return null;
      }),
    ])
      .then(function (hits) {
        var rues = hits[0];
        var side = hits[1];
        var parts = [{ label: 'base', source: base.source || 'internet', data: base }];
        if (rues) parts.push({ label: 'RUES', source: rues.source || 'rues_enrich', data: rues });
        if (side) parts.push({ label: 'Scrapling', source: side.source || 'scrapling_enrich', data: side });
        var merged = contrastMergeSources(parts);
        enrichDoneAt[key] = Date.now();
        if (rues || side) applyEnrichmentResult(profileKey, doc, merged);
        else setEnrichUi(profileKey, 'empty');
      })
      .catch(function () {
        setEnrichUi(profileKey, 'empty');
      })
      .then(function () {
        delete enrichInflight[key];
      });
  }`
  );
  console.log('replaced scheduleEnrichment');
}

const feRe =
  /var fe = typeof feReadinessSummary === 'function' \? feReadinessSummary\(merged, doc\) : '';\s*setEnrichUi\(profileKey, needsContactEnrichment\(merged\) \? 'empty' : 'ok', fe\);/;
if (feRe.test(s)) {
  s = s.replace(
    feRe,
    `var contrast = String(merged._contrast || '').trim();
    var fe = contrast || (typeof feReadinessSummary === 'function' ? feReadinessSummary(merged, doc) : '');
    setEnrichUi(profileKey, needsContactEnrichment(merged) ? 'empty' : 'ok', fe);`
  );
  console.log('updated applyEnrichmentResult contrast status');
}

// Export contrastMergeSources for tests/debug
if (!s.includes('contrastMergeSources: contrastMergeSources')) {
  s = s.replace(
    'scheduleEnrichment: scheduleEnrichment,',
    'scheduleEnrichment: scheduleEnrichment,\n    contrastMergeSources: contrastMergeSources,'
  );
  console.log('exported contrastMergeSources');
}

fs.writeFileSync(p, s);
console.log('OK written');
