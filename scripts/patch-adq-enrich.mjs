/**
 * Patch CrozzoAdquirienteLookup.js — enrichment queue (P0/P2).
 * Run: node scripts/patch-adq-enrich.mjs
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

if (!s.includes('scrapling_enrich:')) {
  s = s.replace(
    /rues_opendata: 'RUES datos\.gov\.co',/,
    [
      "rues_opendata: 'RUES datos.gov.co',",
      '',
      "    rues_enrich: 'RUES (fondo)',",
      '',
      "    scrapling_enrich: 'RUES/Scrapling (fondo)',",
    ].join(nl)
  );
}

const enrichBlock = `
  var enrichInflight = {};
  var enrichDoneAt = {};

  function needsContactEnrichment(data) {
    data = data || {};
    return !(
      String(data.email || '').trim() &&
      String(data.direccion || '').trim() &&
      String(data.telefono || '').trim()
    );
  }

  function mergeEmptyContact(base, extra) {
    if (!base) base = {};
    if (!extra) return annotateRuesContactFields(base);
    if (!String(base.nombre || '').trim() && extra.nombre) base.nombre = String(extra.nombre).trim();
    if (!String(base.email || '').trim() && extra.email) base.email = String(extra.email).trim();
    if (!String(base.telefono || '').trim() && extra.telefono) base.telefono = String(extra.telefono).trim();
    if (!String(base.ciudad || '').trim() && extra.ciudad) base.ciudad = String(extra.ciudad).trim();
    if (!String(base.direccion || '').trim() && extra.direccion) base.direccion = String(extra.direccion).trim();
    if (extra.source) base.source = extra.source;
    return annotateRuesContactFields(base);
  }

  function setEnrichUi(profileKey, state, detail) {
    var p = FORM_PROFILES[profileKey];
    if (!p || !p.status) return;
    var el = document.getElementById(p.status);
    if (!el) return;
    if (state === 'busy') {
      el.innerHTML =
        '<span class="crozzo-adq-enrich crozzo-adq-enrich--busy">Completando dirección/teléfono…</span>';
      el.classList.add('crozzo-adq-lookup-status--loading');
      return;
    }
    el.classList.remove('crozzo-adq-lookup-status--loading');
    if (state === 'ok') {
      el.innerHTML =
        '<span class="crozzo-adq-enrich crozzo-adq-enrich--ok">✓ Contacto enriquecido' +
        (detail ? ' · ' + detail : '') +
        '</span>';
      return;
    }
    if (state === 'empty') {
      el.innerHTML =
        '<span class="crozzo-adq-enrich crozzo-adq-enrich--soft">Sin datos extra de contacto — pida correo al cliente</span>';
    }
  }

  function enrichFromRuesOpendata(doc) {
    return lookupRemoteRuesOpenData(doc).then(function (hit) {
      if (!hit) return null;
      hit.source = 'rues_enrich';
      return hit;
    });
  }

  function enrichFromSidecar(doc, data) {
    if (!global.__TAURI__ || !global.__TAURI__.core || typeof global.__TAURI__.core.invoke !== 'function') {
      return Promise.resolve(null);
    }
    var nit = String(doc && doc.number ? doc.number : '').replace(/\\D/g, '');
    if (nit.length < 6) return Promise.resolve(null);
    return global.__TAURI__.core
      .invoke('adq_enrich_start_job', {
        nit: nit,
        nombreHint: (data && data.nombre) || null,
      })
      .then(function (start) {
        if (!start || !start.accepted || !start.jobId) return null;
        var jobId = start.jobId;
        var tries = 0;
        function poll() {
          tries += 1;
          return global.__TAURI__.core.invoke('adq_enrich_poll', { jobId: jobId }).then(function (st) {
            if (!st) return null;
            if (st.status === 'done' && st.data) {
              var d = st.data;
              return {
                nombre: d.nombre || '',
                email: d.email || '',
                telefono: d.telefono || '',
                ciudad: d.ciudad || '',
                direccion: d.direccion || '',
                source: d.source || 'scrapling_enrich',
              };
            }
            if (st.status === 'error' || st.status === 'missing') return null;
            if (tries >= 8) return null;
            return new Promise(function (resolve) {
              setTimeout(function () {
                resolve(poll());
              }, 1500);
            });
          });
        }
        return poll();
      })
      .catch(function () {
        return null;
      });
  }

  function applyEnrichmentResult(profileKey, doc, merged) {
    if (!merged) return;
    var ck = normDocKey(doc);
    writeCacheEntry(ck, merged);
    if (profileKey) applyLookupToForm(profileKey, merged);
    try {
      persistLookupToPos(merged, doc);
    } catch (_) {}
    var fe = typeof feReadinessSummary === 'function' ? feReadinessSummary(merged, doc) : '';
    setEnrichUi(profileKey, needsContactEnrichment(merged) ? 'empty' : 'ok', fe);
    if (typeof global.showToast === 'function') {
      var got = !!(merged.email || merged.direccion || merged.telefono);
      if (got) {
        global.showToast(
          'Contacto actualizado' + (merged.source ? ' · ' + sourceLabel(merged.source) : ''),
          merged.email ? 'success' : 'info'
        );
      }
    }
  }

  function scheduleEnrichment(doc, data, profileKey) {
    if (!doc || !doc.number) return;
    if (!needsContactEnrichment(data)) return;
    var key = normDocKey(doc);
    if (enrichInflight[key]) return;
    enrichInflight[key] = true;
    setEnrichUi(profileKey, 'busy');
    var base = Object.assign({}, data || {});
    enrichFromRuesOpendata(doc)
      .then(function (rues) {
        var merged = mergeEmptyContact(base, rues);
        if (!needsContactEnrichment(merged)) {
          enrichDoneAt[key] = Date.now();
          applyEnrichmentResult(profileKey, doc, merged);
          return null;
        }
        return enrichFromSidecar(doc, merged).then(function (side) {
          merged = mergeEmptyContact(merged, side);
          enrichDoneAt[key] = Date.now();
          if (rues || side) applyEnrichmentResult(profileKey, doc, merged);
          else setEnrichUi(profileKey, 'empty');
        });
      })
      .catch(function () {
        setEnrichUi(profileKey, 'empty');
      })
      .then(function () {
        delete enrichInflight[key];
      });
  }
`;

if (!s.includes('function scheduleEnrichment')) {
  const anchor = '  function readCache() {';
  if (!s.includes(anchor)) throw new Error('anchor readCache missing');
  s = s.replace(anchor, toFileStyle(enrichBlock) + anchor);
}

const marker = "global.CrozzoOperativePsyche.maybeAffirm('cliente_lookup_ok');";
if (s.includes(marker) && !s.includes('scheduleEnrichment(res.doc')) {
  s = s.replace(
    marker,
    [
      marker,
      '',
      '            try {',
      '',
      '              if (res.doc) scheduleEnrichment(res.doc, res.data, profileKey);',
      '',
      '            } catch (_) {}',
    ].join(nl)
  );
}

const applyMarker = 'applyLookupToForm(profileKey, res.data);';
if (s.includes(applyMarker) && !s.includes('persistLookupToPos(res.data, res.doc)')) {
  s = s.replace(
    applyMarker,
    [
      applyMarker,
      '',
      '          try {',
      '',
      '            persistLookupToPos(res.data, res.doc);',
      '',
      '          } catch (_) {}',
    ].join(nl)
  );
}

if (!s.includes('scheduleEnrichment: scheduleEnrichment')) {
  s = s.replace(
    'persistLookupToPos: persistLookupToPos,',
    [
      'persistLookupToPos: persistLookupToPos,',
      '',
      '    scheduleEnrichment: scheduleEnrichment,',
      '',
      '    needsContactEnrichment: needsContactEnrichment,',
    ].join(nl)
  );
}

s = s.replace(
  'Documento → directorio → DIAN (con .p12) → RUES. Para FE hacen falta nombre y correo (DIAN los trae si está en base).',
  'Documento → directorio → DIAN (nombre) → RUES/Scrapling en fondo (dir/tel/correo). El cobro no espera el enriquecimiento.'
);

fs.writeFileSync(path, s);
console.log('OK', path);
console.log('schedule', s.includes('function scheduleEnrichment'));
console.log('label', s.includes('scrapling_enrich'));
