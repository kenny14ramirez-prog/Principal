/**
 * Patch lookupRemoteAll (parallel merge) + applyEnrichmentResult CRM pending.
 * Run: node scripts/patch-adq-enrich-v2.mjs
 */
import fs from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const path = join(root, 'app', 'modules', 'CrozzoAdquirienteLookup.js');
let s = fs.readFileSync(path, 'utf8');
const nl = s.includes('\r\n') ? '\r\n' : '\n';

function toFileStyle(code) {
  const lines = code.replace(/^\n+|\n+$/g, '').split('\n');
  return lines.map((l) => l.replace(/\s+$/, '')).join(nl + nl) + nl + nl;
}

const newLookupRemoteAll = `
  function lookupRemoteAll(doc) {
    var tasks = [];
    if (global.__TAURI__ && global.__TAURI__.core && typeof global.__TAURI__.core.invoke === 'function') {
      tasks.push(lookupRemoteTauri(doc));
    } else {
      tasks.push(Promise.resolve(null));
    }
    tasks.push(lookupRemoteSupabase(doc));
    tasks.push(lookupRemoteRuesOpenData(doc));
    return Promise.all(
      tasks.map(function (p) {
        return p.catch(function () {
          return null;
        });
      })
    ).then(function (hits) {
      var dian = hits[0];
      var sb = hits[1];
      var rues = hits[2];
      var primary = dian || sb || rues;
      if (!primary) return null;
      var merged = {
        nombre: primary.nombre || '',
        email: primary.email || '',
        telefono: primary.telefono || '',
        ciudad: primary.ciudad || '',
        direccion: primary.direccion || '',
        source: primary.source || '',
      };
      [dian, sb, rues].forEach(function (h) {
        if (!h) return;
        if (!merged.nombre && h.nombre) merged.nombre = h.nombre;
        if (!merged.email && h.email) merged.email = h.email;
        if (!merged.telefono && h.telefono) merged.telefono = h.telefono;
        if (!merged.ciudad && h.ciudad) merged.ciudad = h.ciudad;
        if (!merged.direccion && h.direccion) merged.direccion = h.direccion;
      });
      if (dian) merged.source = dian.source;
      else if (sb) merged.source = sb.source;
      else if (rues) merged.source = rues.source;
      if ((dian || sb) && rues && (rues.email || rues.direccion || rues.telefono || rues.ciudad)) {
        if (!dian || !dian.email || !dian.direccion || !dian.telefono) {
          merged.source = merged.source || 'rues_enrich';
        }
      }
      return annotateRuesContactFields(merged);
    });
  }
`;

// Replace old lookupRemoteAll function body - find from "function lookupRemoteAll" to before "function lookupRemoteSupabase"
const start = s.indexOf('  function lookupRemoteAll(doc) {');
const end = s.indexOf('  function lookupRemoteSupabase(doc) {');
if (start < 0 || end < 0 || end <= start) {
  console.error('anchors for lookupRemoteAll missing', start, end);
} else {
  s = s.slice(0, start) + toFileStyle(newLookupRemoteAll) + s.slice(end);
  console.log('replaced lookupRemoteAll');
}

const crmHook = `
    try {
      if (typeof global.crozzoCrmSetPendingLookup === 'function' && doc) {
        var pending = global.__crozzoCrmPendingLookup;
        var same =
          pending &&
          pending.doc &&
          String(pending.doc.number || '') === String(doc.number || '');
        if (same || !pending) {
          global.crozzoCrmSetPendingLookup(merged, doc, merged.source || (pending && pending.source) || '');
          if (typeof global.crozzoCrmRenderDropdown === 'function') {
            var q = (doc.display || doc.number || '').toString();
            var local =
              typeof global.crozzoCrmFindClientsByQuery === 'function'
                ? global.crozzoCrmFindClientsByQuery(q)
                : [];
            global.crozzoCrmRenderDropdown(local, {
              query: q,
              lookupCandidate: merged,
              lookupDoc: doc,
              lookupSource: merged.source,
            });
          }
        }
      }
    } catch (_) {}
`;

if (!s.includes('crozzoCrmSetPendingLookup(merged')) {
  const marker = '    writeCacheEntry(ck, merged);';
  // find applyEnrichmentResult's writeCacheEntry
  const idx = s.indexOf('  function applyEnrichmentResult');
  if (idx < 0) throw new Error('applyEnrichmentResult missing');
  const w = s.indexOf(marker, idx);
  if (w < 0) throw new Error('writeCacheEntry in applyEnrichment missing');
  s = s.slice(0, w + marker.length) + nl + nl + toFileStyle(crmHook) + s.slice(w + marker.length);
  console.log('hooked CRM pending in applyEnrichmentResult');
}

fs.writeFileSync(path, s);
console.log('OK', path);
